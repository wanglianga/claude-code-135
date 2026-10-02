package main

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type projectReq struct {
	Name            string  `json:"name"`
	Category        string  `json:"category"`
	PlotID          int64   `json:"plot_id"`
	TotalShares     int     `json:"total_shares"`
	PricePerShare   float64 `json:"price_per_share"`
	UnitPerShare    float64 `json:"unit_per_share"`
	Unit            string  `json:"unit"`
	EstMatureDate   string  `json:"est_mature_date"`
	HarvestStandard string  `json:"harvest_standard"`
	DeliveryRange   string  `json:"delivery_range"`
	RightsText      string  `json:"rights_text"`
	Cover           string  `json:"cover"`
}

func listProjects(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := queryRows(c, pool, `
			SELECT p.*, f.name AS farm_name, pl.name AS plot_name,
			 COALESCE((SELECT SUM(b.shares_sold) FROM batches b WHERE b.project_id=p.id),0) AS shares_sold_all,
			 COALESCE((SELECT COUNT(*) FROM batches b WHERE b.project_id=p.id),0) AS batch_count
			FROM projects p
			JOIN farms f ON f.id=p.farm_id
			LEFT JOIN plots pl ON pl.id=p.plot_id
			ORDER BY p.id`)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, rows)
	}
}

func getProject(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		row, err := queryOne(c, pool, `
			SELECT p.*, f.name AS farm_name, f.location AS farm_location,
			 pl.name AS plot_name, pl.code AS plot_code, pl.area_mu
			FROM projects p
			JOIN farms f ON f.id=p.farm_id
			LEFT JOIN plots pl ON pl.id=p.plot_id
			WHERE p.id=$1`, id)
		if err == pgx.ErrNoRows {
			c.JSON(404, gin.H{"error": "项目不存在"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		batches, _ := queryRows(c, pool, `
			SELECT b.*, (SELECT COUNT(*) FROM orders o WHERE o.batch_id=b.id) AS order_count
			FROM batches b WHERE b.project_id=$1 ORDER BY b.id DESC`, id)
		row["batches"] = batches
		c.JSON(200, row)
	}
}

func createProject(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req projectReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		uid, _ := currentUser(c)
		var farmID int64
		if err := pool.QueryRow(c, `SELECT farm_id FROM users WHERE id=$1`, uid).Scan(&farmID); err != nil {
			c.JSON(400, gin.H{"error": "当前账号未关联农场"})
			return
		}
		if req.Unit == "" {
			req.Unit = "公斤"
		}
		if req.TotalShares == 0 {
			req.TotalShares = 100
		}
		var id int64
		err := pool.QueryRow(c, `
			INSERT INTO projects
			(farm_id, plot_id, name, category, total_shares, price_per_share, unit_per_share, unit,
			 est_mature_date, harvest_standard, delivery_range, rights_text, cover)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
			 NULLIF($9,'')::date,$10,$11,$12,NULLIF($13,''))
			RETURNING id`,
			farmID, nullableID(req.PlotID), req.Name, req.Category, req.TotalShares,
			req.PricePerShare, req.UnitPerShare, req.Unit, req.EstMatureDate,
			req.HarvestStandard, req.DeliveryRange, req.RightsText, req.Cover).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

type batchReq struct {
	SharesTotal   int    `json:"shares_total"`
	EstMatureDate string `json:"est_mature_date"`
	Note          string `json:"note"`
}

func createBatch(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		pid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req batchReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if req.SharesTotal <= 0 {
			c.JSON(400, gin.H{"error": "批次份额必须大于0"})
			return
		}
		code := fmt.Sprintf("B%d-%06d", pgYear(), pid)
		var id int64
		err := pool.QueryRow(c, `
			INSERT INTO batches (project_id, code, shares_total, est_mature_date, note)
			SELECT $1, $2||'-'||LPAD((COUNT(*)::text),2,'0'), $3, NULLIF($4,'')::date, $5
			FROM batches WHERE project_id=$1
			RETURNING id`, pid, code, req.SharesTotal, req.EstMatureDate, req.Note).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

func getBatch(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		row, err := queryOne(c, pool, `
			SELECT b.*, p.name AS project_name, p.category, p.unit, p.unit_per_share,
			 p.price_per_share, p.harvest_standard, p.delivery_range, p.rights_text,
			 p.plot_id, pl.name AS plot_name, pl.code AS plot_code,
			 f.id AS farm_id, f.name AS farm_name
			FROM batches b
			JOIN projects p ON p.id=b.project_id
			JOIN farms f ON f.id=p.farm_id
			LEFT JOIN plots pl ON pl.id=p.plot_id
			WHERE b.id=$1`, id)
		if err == pgx.ErrNoRows {
			c.JSON(404, gin.H{"error": "批次不存在"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		orders, _ := queryRows(c, pool, `
			SELECT o.id, o.buyer_id, u.name AS buyer_name, o.shares, o.amount, o.status,
			 o.receiver_name, o.receiver_phone, o.address, o.cert_no, o.paid_at,
			 COALESCE((SELECT SUM(s.qty_kg) FROM shipments s WHERE s.order_id=o.id),0) AS shipped_kg
			FROM orders o JOIN users u ON u.id=o.buyer_id
			WHERE o.batch_id=$1 ORDER BY o.id`, id)
		logs, _ := queryRows(c, pool, `SELECT * FROM farm_logs WHERE batch_id=$1 ORDER BY occurred_at DESC`, id)
		disasters, _ := queryRows(c, pool, `SELECT * FROM disasters WHERE batch_id=$1 ORDER BY occurred_at DESC`, id)
		inspections, _ := queryRows(c, pool, `SELECT * FROM maturity_inspections WHERE batch_id=$1 ORDER BY inspected_at DESC`, id)
		plans, _ := queryRows(c, pool, `SELECT * FROM harvest_plans WHERE batch_id=$1 ORDER BY planned_date`, id)
		harvests, _ := queryRows(c, pool, `
			SELECT hr.*, u.name AS picker_name FROM harvest_records hr
			LEFT JOIN users u ON u.id=hr.picker_id WHERE hr.batch_id=$1 ORDER BY hr.picked_at DESC`, id)
		sortings, _ := queryRows(c, pool, `
			SELECT s.*, u.name AS packer_name FROM sortings s
			LEFT JOIN users u ON u.id=s.packer_id WHERE s.batch_id=$1 ORDER BY s.sorted_at DESC`, id)
		shipments, _ := queryRows(c, pool, `
			SELECT sh.*, u.name AS logistics_name FROM shipments sh
			LEFT JOIN users u ON u.id=sh.logistics_id WHERE sh.batch_id=$1 ORDER BY sh.seq, sh.id`, id)
		tickets, _ := queryRows(c, pool, `
			SELECT t.*, u.name AS raised_by_name FROM tickets t
			LEFT JOIN users u ON u.id=t.raised_by WHERE t.batch_id=$1 ORDER BY t.id`, id)
		ins, _ := queryRows(c, pool, `SELECT * FROM insurance_claims WHERE batch_id=$1 ORDER BY id`, id)
		row["orders"] = orders
		row["farm_logs"] = logs
		row["disasters"] = disasters
		row["inspections"] = inspections
		row["harvest_plans"] = plans
		row["harvest_records"] = harvests
		row["sortings"] = sortings
		row["shipments"] = shipments
		row["tickets"] = tickets
		row["insurance_claims"] = ins
		c.JSON(200, row)
	}
}

func getBatchTimeline(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		rows, err := queryRows(c, pool, `
			SELECT ts, kind, title, detail, sub_type, ref_id
			FROM v_batch_timeline WHERE batch_id=$1 ORDER BY ts DESC, kind, ref_id`, id)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, rows)
	}
}

func farmBatches(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := currentUser(c)
		rows, err := queryRows(c, pool, `
			SELECT b.*, p.name AS project_name, p.category,
			 f.name AS farm_name,
			 (SELECT COUNT(*) FROM orders o WHERE o.batch_id=b.id) AS order_count,
			 (SELECT COUNT(*) FROM tickets t WHERE t.batch_id=b.id AND t.status <> 'closed') AS open_tickets
			FROM batches b
			JOIN projects p ON p.id=b.project_id
			JOIN farms f ON f.id=p.farm_id
			WHERE f.owner_id=$1 OR f.id=(SELECT farm_id FROM users WHERE id=$1)
			ORDER BY b.id DESC`, uid)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, rows)
	}
}
