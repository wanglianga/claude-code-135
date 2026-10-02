package main

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ticketReq struct {
	BatchID     int64  `json:"batch_id"`
	OrderID     int64  `json:"order_id"`
	Type        string `json:"type"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

var ticketTypes = map[string]bool{
	"hail_loss": true, "mature_delay": true, "address_change": true, "fruit_size": true,
	"bad_fruit": true, "dispatch_dispute": true, "rights_mismatch": true,
}

// 发起工单：冰雹减产/成熟延后/改址/果品大小不均/坏果投诉/分批争议/权益与产量不一致
func createTicket(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req ticketReq
		if err := c.ShouldBindJSON(&req); err != nil || req.BatchID == 0 {
			c.JSON(400, gin.H{"error": "批次必填"})
			return
		}
		if !ticketTypes[req.Type] {
			c.JSON(400, gin.H{"error": "工单类型无效"})
			return
		}
		if req.Title == "" {
			req.Title = req.Type
		}
		uid, role := currentUser(c)
		tx, err := pool.Begin(c)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(c)
		var ticketID int64
		if err := tx.QueryRow(c, `
			INSERT INTO tickets (batch_id, order_id, type, title, description, raised_by)
			VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			req.BatchID, nullableID(req.OrderID), req.Type, req.Title, req.Description, uid).Scan(&ticketID); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if _, err := tx.Exec(c, `
			INSERT INTO ticket_events (ticket_id, actor_id, actor_role, action, result)
			VALUES ($1,$2,$3,$4,$5)`,
			ticketID, uid, role, "发起工单", req.Description); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		// 争议类工单把批次挂到 disputed，便于农场端优先处理
		if req.Type == "rights_mismatch" || req.Type == "dispatch_dispute" || req.Type == "bad_fruit" {
			_, _ = tx.Exec(c, `UPDATE batches SET status='disputed' WHERE id=$1 AND status<>'completed'`, req.BatchID)
		}
		if err := tx.Commit(c); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": ticketID})
	}
}

func listTickets(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, role := currentUser(c)
		status := c.Query("status")
		sql := `
			SELECT t.*, b.code AS batch_code, p.name AS project_name,
			 u.name AS raised_by_name,
			 (SELECT COUNT(*) FROM ticket_events e WHERE e.ticket_id=t.id) AS event_count
			FROM tickets t
			JOIN batches b ON b.id=t.batch_id
			JOIN projects p ON p.id=b.project_id
			LEFT JOIN users u ON u.id=t.raised_by
			WHERE ($1='' OR t.status=$1)`
		args := []any{status}
		// 认养人只看自己的；其余角色（含农场工人、客服）看全部
		if role == "buyer" {
			sql += ` AND (t.raised_by=$2 OR t.order_id IN (SELECT id FROM orders WHERE buyer_id=$2))`
			args = append(args, uid)
		}
		sql += ` ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END, t.id DESC`
		rows, err := queryRows(c, pool, sql, args...)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, rows)
	}
}

func getTicket(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		uid, role := currentUser(c)
		row, err := queryOne(c, pool, `
			SELECT t.*, b.code AS batch_code, p.name AS project_name,
			 u.name AS raised_by_name
			FROM tickets t
			JOIN batches b ON b.id=t.batch_id
			JOIN projects p ON p.id=b.project_id
			LEFT JOIN users u ON u.id=t.raised_by
			WHERE t.id=$1`, id)
		if err == pgx.ErrNoRows {
			c.JSON(404, gin.H{"error": "工单不存在"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if role == "buyer" {
			raisedBy, _ := row["raised_by"].(int64)
			_ = raisedBy
			var cnt int
			_ = pool.QueryRow(c,
				`SELECT COUNT(*) FROM tickets t
				 LEFT JOIN orders o ON o.id=t.order_id
				 WHERE t.id=$1 AND (t.raised_by=$2 OR o.buyer_id=$2)`, id, uid).Scan(&cnt)
			if cnt == 0 {
				c.JSON(403, gin.H{"error": "无权查看该工单"})
				return
			}
		}
		events, _ := queryRows(c, pool, `
			SELECT e.*, u.name AS actor_name
			FROM ticket_events e LEFT JOIN users u ON u.id=e.actor_id
			WHERE e.ticket_id=$1 ORDER BY e.id`, id)
		comps, _ := queryRows(c, pool, `SELECT * FROM compensations WHERE ticket_id=$1 ORDER BY id`, id)
		row["events"] = events
		row["compensations"] = comps
		c.JSON(200, row)
	}
}

type eventReq struct {
	Action string `json:"action"`
	Result string `json:"result"`
	Status string `json:"status"` // 可选：更新工单状态
}

// 追加处理流水：农场/认养人/采摘工/包装员/物流/客服的处理结果都串到同一工单（同一批次）
func addTicketEvent(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req eventReq
		if err := c.ShouldBindJSON(&req); err != nil || req.Action == "" {
			c.JSON(400, gin.H{"error": "处理动作必填"})
			return
		}
		uid, role := currentUser(c)
		tx, err := pool.Begin(c)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(c)
		var exists int
		if err := tx.QueryRow(c, `SELECT COUNT(*) FROM tickets WHERE id=$1`, id).Scan(&exists); err != nil || exists == 0 {
			c.JSON(404, gin.H{"error": "工单不存在"})
			return
		}
		if _, err := tx.Exec(c, `
			INSERT INTO ticket_events (ticket_id, actor_id, actor_role, action, result)
			VALUES ($1,$2,$3,$4,$5)`, id, uid, role, req.Action, req.Result); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if req.Status != "" {
			if req.Status == "resolved" || req.Status == "closed" {
				_, err = tx.Exec(c,
					`UPDATE tickets SET status=$2, resolved_at=now() WHERE id=$1`, id, req.Status)
			} else {
				_, err = tx.Exec(c, `UPDATE tickets SET status=$2, resolved_at=NULL WHERE id=$1`, id, req.Status)
			}
			if err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
		} else {
			// 首次有处理动作自动从 open → processing
			_, _ = tx.Exec(c, `UPDATE tickets SET status='processing' WHERE id=$1 AND status='open'`, id)
		}
		if err := tx.Commit(c); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"ok": true})
	}
}

type compReq struct {
	OrderID int64   `json:"order_id"`
	Type    string  `json:"type"`
	Amount  float64 `json:"amount"`
	QtyKg   float64 `json:"qty_kg"`
	Reason  string  `json:"reason"`
	Status  string  `json:"status"`
}

func createCompensation(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		tid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req compReq
		if err := c.ShouldBindJSON(&req); err != nil || req.Type == "" {
			c.JSON(400, gin.H{"error": "赔付方式必填（refund/reissue/insurance_payout/coupon）"})
			return
		}
		uid, role := currentUser(c)
		var batchID int64
		if err := pool.QueryRow(c, `SELECT batch_id FROM tickets WHERE id=$1`, tid).Scan(&batchID); err != nil {
			c.JSON(404, gin.H{"error": "工单不存在"})
			return
		}
		status := req.Status
		if status == "" {
			status = "pending"
		}
		var cid int64
		err := pool.QueryRow(c, `
			INSERT INTO compensations (ticket_id, batch_id, order_id, type, amount, qty_kg, reason, status, decided_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
			tid, batchID, nullableID(req.OrderID), req.Type, req.Amount, req.QtyKg, req.Reason, status, uid).Scan(&cid)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		_, _ = pool.Exec(c, `
			INSERT INTO ticket_events (ticket_id, actor_id, actor_role, action, result)
			VALUES ($1,$2,$3,'登记赔付方案', $4)`,
			tid, uid, role,
			req.Type+" 金额"+strconv.FormatFloat(req.Amount, 'f', 2, 64)+"元/"+
				strconv.FormatFloat(req.QtyKg, 'f', 1, 64)+"公斤，状态："+status+"；原因："+req.Reason)
		c.JSON(201, gin.H{"id": cid})
	}
}

type compPatch struct {
	Status string `json:"status"`
}

// 赔付执行：refund/coupon 通过即视为已赔付，联动工单与批次时间线
func updateCompensation(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req compPatch
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		uid, role := currentUser(c)
		tx, err := pool.Begin(c)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(c)
		var ticketID int64
		if err := tx.QueryRow(c, `SELECT ticket_id FROM compensations WHERE id=$1`, id).Scan(&ticketID); err != nil {
			c.JSON(404, gin.H{"error": "赔付记录不存在"})
			return
		}
		ct, err := tx.Exec(c, `
			UPDATE compensations
			SET status=$2, decided_by=$3,
			    settled_at=CASE WHEN $2 IN ('paid','rejected') THEN now() ELSE NULL END
			WHERE id=$1`, id, req.Status, uid)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if ct.RowsAffected() == 0 {
			c.JSON(404, gin.H{"error": "赔付记录不存在"})
			return
		}
		if _, err := tx.Exec(c, `
			INSERT INTO ticket_events (ticket_id, actor_id, actor_role, action, result)
			VALUES ($1,$2,$3,'赔付状态更新',$4)`,
			ticketID, uid, role, "赔付单 #"+strconv.FormatInt(id, 10)+" 状态更新为："+req.Status); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit(c); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}
