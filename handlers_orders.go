package main

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type orderReq struct {
	BatchID int64 `json:"batch_id"`
	Shares  int   `json:"shares"`
}

// 认养付款：锁批次行，校验剩余份额，累加已售份额，同步生成认养证书
func createOrder(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req orderReq
		if err := c.ShouldBindJSON(&req); err != nil || req.Shares <= 0 {
			c.JSON(400, gin.H{"error": "认养份数无效"})
			return
		}
		uid, _ := currentUser(c)
		tx, err := pool.Begin(c)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(c)

		var total, sold int
		var price float64
		err = tx.QueryRow(c,
			`SELECT shares_total, shares_sold, price_per_share
			 FROM batches b JOIN projects p ON p.id=b.project_id
			 WHERE b.id=$1 FOR UPDATE OF b`, req.BatchID).
			Scan(&total, &sold, &price)
		if err == pgx.ErrNoRows {
			c.JSON(404, gin.H{"error": "批次不存在"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if sold+req.Shares > total {
			c.JSON(400, gin.H{"error": fmt.Sprintf("剩余份额不足：仅剩 %d 份", total-sold)})
			return
		}
		var name, phone, address string
		_ = tx.QueryRow(c, `SELECT COALESCE(name,''), COALESCE(phone,''), '' FROM users WHERE id=$1`, uid).
			Scan(&name, &phone, &address)

		amount := price * float64(req.Shares)
		var orderID int64
		err = tx.QueryRow(c, `
			INSERT INTO orders (batch_id, buyer_id, shares, amount, receiver_name, receiver_phone, address)
			VALUES ($1,$2,$3,$4,$5,$6,'')
			RETURNING id`, req.BatchID, uid, req.Shares, amount, name, phone).Scan(&orderID)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if _, err := tx.Exec(c,
			`UPDATE batches SET shares_sold=shares_sold+$1 WHERE id=$2`, req.Shares, req.BatchID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		certNo := fmt.Sprintf("CERT-%d-%04d", pgYear(), orderID)
		if _, err := tx.Exec(c, `
			INSERT INTO certificates (order_id, cert_no, rights_summary)
			SELECT $1, $2, p.name || ' ' || o.shares || '份，应得 ' ||
			       (p.unit_per_share*o.shares) || p.unit
			FROM orders o JOIN batches b ON b.id=o.batch_id
			 JOIN projects p ON p.id=b.project_id WHERE o.id=$1`,
			orderID, certNo); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if _, err := tx.Exec(c, `UPDATE orders SET cert_no=$1 WHERE id=$2`, certNo, orderID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit(c); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": orderID, "amount": amount, "cert_no": certNo})
	}
}

func myOrders(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := currentUser(c)
		rows, err := queryRows(c, pool, `
			SELECT o.*, b.code AS batch_code, b.status AS batch_status, b.est_mature_date,
			 p.name AS project_name, p.category, p.unit, p.unit_per_share,
			 (SELECT COALESCE(SUM(s.qty_kg),0) FROM shipments s WHERE s.order_id=o.id) AS shipped_kg,
			 (SELECT AVG(r.satisfaction) FROM revisit_surveys r WHERE r.order_id=o.id) AS my_revisit,
			 EXISTS(SELECT 1 FROM revisit_surveys r WHERE r.order_id=o.id) AS revisited,
			 (SELECT json_agg(json_build_object('id',t.id,'type',t.type,'status',t.status,'title',t.title))
			    FROM tickets t WHERE t.order_id=o.id) AS tickets
			FROM orders o
			JOIN batches b ON b.id=o.batch_id
			JOIN projects p ON p.id=b.project_id
			WHERE o.buyer_id=$1 ORDER BY o.id DESC`, uid)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, rows)
	}
}

func getMyOrder(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := currentUser(c)
		oid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		row, err := queryOne(c, pool, `
			SELECT o.*, b.code AS batch_code, b.status AS batch_status,
			 p.name AS project_name, p.unit, p.unit_per_share, p.rights_text,
			 p.harvest_standard, p.delivery_range, f.name AS farm_name,
			 ce.cert_no AS certificate_no
			FROM orders o
			JOIN batches b ON b.id=o.batch_id
			JOIN projects p ON p.id=b.project_id
			JOIN farms f ON f.id=p.farm_id
			LEFT JOIN certificates ce ON ce.order_id=o.id
			WHERE o.id=$1 AND o.buyer_id=$2`, oid, uid)
		if err == pgx.ErrNoRows {
			c.JSON(404, gin.H{"error": "订单不存在"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		shipments, _ := queryRows(c, pool,
			`SELECT * FROM shipments WHERE order_id=$1 ORDER BY seq, id`, oid)
		tickets, _ := queryRows(c, pool,
			`SELECT * FROM tickets WHERE order_id=$1 ORDER BY id`, oid)
		comps, _ := queryRows(c, pool,
			`SELECT * FROM compensations WHERE order_id=$1 ORDER BY id`, oid)
		surveys, _ := queryRows(c, pool,
			`SELECT * FROM revisit_surveys WHERE order_id=$1 ORDER BY id`, oid)
		row["shipments"] = shipments
		row["tickets"] = tickets
		row["compensations"] = comps
		row["revisit_surveys"] = surveys
		c.JSON(200, row)
	}
}

type addressReq struct {
	ReceiverName  string `json:"receiver_name"`
	ReceiverPhone string `json:"receiver_phone"`
	Address       string `json:"address"`
}

// 临时改地址：未出库的发货单一并改址并打 address_changed 标记，记录工单
func changeAddress(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := currentUser(c)
		oid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req addressReq
		if err := c.ShouldBindJSON(&req); err != nil || req.Address == "" {
			c.JSON(400, gin.H{"error": "新收货地址不能为空"})
			return
		}
		tx, err := pool.Begin(c)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(c)

		var batchID int64
		err = tx.QueryRow(c, `SELECT batch_id FROM orders WHERE id=$1 AND buyer_id=$2`, oid, uid).Scan(&batchID)
		if err == pgx.ErrNoRows {
			c.JSON(404, gin.H{"error": "订单不存在"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if _, err := tx.Exec(c, `
			UPDATE orders SET receiver_name=$1, receiver_phone=$2, address=$3
			WHERE id=$4`, req.ReceiverName, req.ReceiverPhone, req.Address, oid); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		// 已在途的不改，仅改未出库的
		tag, err := tx.Exec(c, `
			UPDATE shipments SET receiver_name=$1, receiver_phone=$2, address=$3, address_changed=TRUE
			WHERE order_id=$4 AND status='planned'`,
			req.ReceiverName, req.ReceiverPhone, req.Address, oid)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		changedPlanned := tag.RowsAffected()
		var ticketID int64
		if err := tx.QueryRow(c, `
			INSERT INTO tickets (batch_id, order_id, type, title, description, raised_by, status)
			VALUES ($1,$2,'address_change','发货前临时改地址',$3,$4,'open')
			RETURNING id`,
			batchID, oid, "认养人申请改址至："+req.Address, uid).Scan(&ticketID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		eventResult := "待客服/物流拦截确认"
		if changedPlanned > 0 {
			eventResult = fmt.Sprintf("已同步更新 %d 张未出库发货单地址，待物流确认", changedPlanned)
		} else {
			eventResult = "当前无未出库发货单；若已在途需物流拦截，结果回填本工单"
		}
		if _, err := tx.Exec(c, `
			INSERT INTO ticket_events (ticket_id, actor_id, actor_role, action, result)
			VALUES ($1,$2,'buyer','申请临时改地址',$3)`,
			ticketID, uid, eventResult); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit(c); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{
			"updated_planned_shipments": changedPlanned,
			"ticket_id":                 ticketID,
			"message":                   "已更新；若已有发货单在途，请等待客服与物流拦截结果",
		})
	}
}

type revisitReq struct {
	Satisfaction  int    `json:"satisfaction"`
	FruitScore    int    `json:"fruit_score"`
	DeliveryScore int    `json:"delivery_score"`
	ServiceScore  int    `json:"service_score"`
	RenewIntent   bool   `json:"renew_intent"`
	Comment       string `json:"comment"`
}

func submitRevisit(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := currentUser(c)
		oid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req revisitReq
		if err := c.ShouldBindJSON(&req); err != nil || req.Satisfaction < 1 || req.Satisfaction > 5 {
			c.JSON(400, gin.H{"error": "满意度需为1-5分"})
			return
		}
		var batchID int64
		err := pool.QueryRow(c, `SELECT batch_id FROM orders WHERE id=$1 AND buyer_id=$2`, oid, uid).Scan(&batchID)
		if err == pgx.ErrNoRows {
			c.JSON(404, gin.H{"error": "订单不存在"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		var id int64
		err = pool.QueryRow(c, `
			INSERT INTO revisit_surveys
			(order_id, batch_id, buyer_id, satisfaction, fruit_score, delivery_score, service_score, renew_intent, comment)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
			oid, batchID, uid, req.Satisfaction, nullableScore(req.FruitScore),
			nullableScore(req.DeliveryScore), nullableScore(req.ServiceScore), req.RenewIntent, req.Comment).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

func nullableScore(v int) any {
	if v == 0 {
		return nil
	}
	return v
}

func verifyCertificate(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		certNo := c.Param("certNo")
		row, err := queryOne(c, pool, `
			SELECT ce.cert_no, ce.rights_summary, ce.issued_at,
			 o.id AS order_id, o.shares, u.name AS buyer_name,
			 p.name AS project_name, b.code AS batch_code, b.status AS batch_status
			FROM certificates ce
			JOIN orders o ON o.id=ce.order_id
			JOIN users u ON u.id=o.buyer_id
			JOIN batches b ON b.id=o.batch_id
			JOIN projects p ON p.id=b.project_id
			WHERE ce.cert_no=$1`, certNo)
		if err == pgx.ErrNoRows {
			c.JSON(404, gin.H{"valid": false, "error": "证书编号不存在"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		row["valid"] = true
		c.JSON(200, row)
	}
}
