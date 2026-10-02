package main

import (
	"encoding/json"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func batchID(c *gin.Context) int64 {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	return id
}

type farmLogReq struct {
	Type       string   `json:"type"`
	Title      string   `json:"title"`
	Content    string   `json:"content"`
	PhotoURLs  []string `json:"photo_urls"`
	OccurredAt string   `json:"occurred_at"`
}

func createFarmLog(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := batchID(c)
		var req farmLogReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if req.Type == "" {
			req.Type = "farming"
		}
		photos, _ := json.Marshal(orEmptySlice(req.PhotoURLs))
		uid, _ := currentUser(c)
		var newID int64
		err := pool.QueryRow(c, `
			INSERT INTO farm_logs (batch_id, author_id, type, title, content, photo_urls, occurred_at)
			VALUES ($1,$2,$3,$4,$5,$6, COALESCE(NULLIF($7,'')::timestamptz, now()))
			RETURNING id`,
			id, uid, req.Type, req.Title, req.Content, string(photos), req.OccurredAt).Scan(&newID)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": newID})
	}
}

func orEmptySlice(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

type disasterReq struct {
	Type            string `json:"type"`
	Description     string `json:"description"`
	YieldImpactPct  int    `json:"yield_impact_pct"`
	MatureDelayDays int    `json:"mature_delay_days"`
	OccurredAt      string `json:"occurred_at"`
}

// 登记灾害（冰雹减产/成熟延后）：自动顺延预计成熟时间，批次标记 disputed 进入争议处置
func createDisaster(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := batchID(c)
		var req disasterReq
		if err := c.ShouldBindJSON(&req); err != nil || req.Type == "" {
			c.JSON(400, gin.H{"error": "灾害类型必填"})
			return
		}
		uid, _ := currentUser(c)
		tx, err := pool.Begin(c)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(c)
		var dID int64
		if err := tx.QueryRow(c, `
			INSERT INTO disasters (batch_id, type, description, yield_impact_pct, mature_delay_days, occurred_at)
			VALUES ($1,$2,$3,$4,$5, COALESCE(NULLIF($6,'')::timestamptz, now())) RETURNING id`,
			id, req.Type, req.Description, req.YieldImpactPct, req.MatureDelayDays, req.OccurredAt).Scan(&dID); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if req.MatureDelayDays > 0 {
			if _, err := tx.Exec(c,
				`UPDATE batches SET est_mature_date = est_mature_date + ($2 || ' days')::interval
				 WHERE id=$1 AND est_mature_date IS NOT NULL`, id, strconv.Itoa(req.MatureDelayDays)); err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
		}
		title := "天气灾害影响：减产与成熟时间变动"
		if req.Type == "hail" {
			title = "冰雹灾害：可能减产，权益按实际产量核算"
		}
		var tID int64
		if err := tx.QueryRow(c, `
			INSERT INTO tickets (batch_id, type, title, description, raised_by, status)
			VALUES ($1,'hail_loss',$2,$3,$4,'open') RETURNING id`,
			id, title, req.Description, uid).Scan(&tID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if _, err := tx.Exec(c, `
			INSERT INTO ticket_events (ticket_id, actor_id, actor_role, action, result)
			VALUES ($1,$2,'farmer','登记灾害',
			        '减产预估'||$3::int||'%，成熟延后'||$4::int||'天；待客服逐户告知，理赔按最终产量核算')`,
			tID, uid, req.YieldImpactPct, req.MatureDelayDays); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit(c); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": dID, "ticket_id": tID})
	}
}

type inspectionReq struct {
	SampleCount int     `json:"sample_count"`
	MaturePct   float64 `json:"mature_pct"`
	GradeAPct   float64 `json:"grade_a_pct"`
	BadFruitPct float64 `json:"bad_fruit_pct"`
	SugarBrix   float64 `json:"sugar_brix"`
	EstYieldKg  float64 `json:"est_yield_kg"`
	Note        string  `json:"note"`
	InspectedAt string  `json:"inspected_at"`
}

func createInspection(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := batchID(c)
		var req inspectionReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		uid, _ := currentUser(c)
		var newID int64
		err := pool.QueryRow(c, `
			INSERT INTO maturity_inspections
			(batch_id, inspector_id, sample_count, mature_pct, grade_a_pct, bad_fruit_pct,
			 sugar_brix, est_yield_kg, note, inspected_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE(NULLIF($10,'')::timestamptz, now()))
			RETURNING id`,
			id, uid, req.SampleCount, req.MaturePct, req.GradeAPct, req.BadFruitPct,
			req.SugarBrix, req.EstYieldKg, req.Note, req.InspectedAt).Scan(&newID)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		// 成熟度达标自动推进批次状态
		if req.MaturePct >= 85 {
			_, _ = pool.Exec(c,
				`UPDATE batches SET status='harvesting' WHERE id=$1 AND status IN ('growing','mature')`, id)
		}
		c.JSON(201, gin.H{"id": newID})
	}
}

type harvestPlanReq struct {
	PlannedDate    string  `json:"planned_date"`
	PriorityRule   string  `json:"priority_rule"`
	PackagingSpec  string  `json:"packaging_spec"`
	ColdChainRoute string  `json:"cold_chain_route"`
	TargetBadRate  float64 `json:"target_bad_rate"`
}

func createHarvestPlan(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := batchID(c)
		var req harvestPlanReq
		if err := c.ShouldBindJSON(&req); err != nil || req.PlannedDate == "" {
			c.JSON(400, gin.H{"error": "计划采摘日期必填"})
			return
		}
		var newID int64
		err := pool.QueryRow(c, `
			INSERT INTO harvest_plans (batch_id, planned_date, priority_rule, packaging_spec, cold_chain_route, target_bad_rate)
			VALUES ($1,$2::date,$3,$4,$5,$6) RETURNING id`,
			id, req.PlannedDate, req.PriorityRule, req.PackagingSpec, req.ColdChainRoute, req.TargetBadRate).Scan(&newID)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": newID})
	}
}

type harvestRecordReq struct {
	PlanID    int64   `json:"plan_id"`
	PickedKg  float64 `json:"picked_kg"`
	BadKg     float64 `json:"bad_kg"`
	WorkHours float64 `json:"work_hours"`
	Note      string  `json:"note"`
	PickedAt  string  `json:"picked_at"`
}

func createHarvestRecord(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := batchID(c)
		var req harvestRecordReq
		if err := c.ShouldBindJSON(&req); err != nil || req.PickedKg <= 0 {
			c.JSON(400, gin.H{"error": "采摘重量必填"})
			return
		}
		uid, _ := currentUser(c)
		var newID int64
		err := pool.QueryRow(c, `
			INSERT INTO harvest_records (batch_id, plan_id, picker_id, picked_kg, bad_kg, work_hours, note, picked_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE(NULLIF($8,'')::timestamptz, now())) RETURNING id`,
			id, nullableID(req.PlanID), uid, req.PickedKg, req.BadKg, req.WorkHours, req.Note, req.PickedAt).Scan(&newID)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		_, _ = pool.Exec(c, `UPDATE batches SET status='harvesting' WHERE id=$1 AND status='mature'`, id)
		c.JSON(201, gin.H{"id": newID})
	}
}

type sortingReq struct {
	GradeAKg float64 `json:"grade_a_kg"`
	GradeBKg float64 `json:"grade_b_kg"`
	BadKg    float64 `json:"bad_kg"`
	Boxes    int     `json:"boxes"`
	BoxSpec  string  `json:"box_spec"`
	Note     string  `json:"note"`
}

func createSorting(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := batchID(c)
		var req sortingReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		uid, _ := currentUser(c)
		var newID int64
		err := pool.QueryRow(c, `
			INSERT INTO sortings (batch_id, packer_id, grade_a_kg, grade_b_kg, bad_kg, boxes, box_spec, note)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
			id, uid, req.GradeAKg, req.GradeBKg, req.BadKg, req.Boxes, req.BoxSpec, req.Note).Scan(&newID)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": newID})
	}
}

type shipmentReq struct {
	OrderID       int64   `json:"order_id"`
	Carrier       string  `json:"carrier"`
	TrackingNo    string  `json:"tracking_no"`
	QtyKg         float64 `json:"qty_kg"`
	Boxes         int     `json:"boxes"`
	ColdChainTemp float64 `json:"cold_chain_temp"`
	Seq           int     `json:"seq"`
	Status        string  `json:"status"`
	ShippedAt     string  `json:"shipped_at"`
}

// 安排发货（支持分批）：自动取下一批次号，继承订单收件信息，累计发货推进订单状态
func createShipment(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := batchID(c)
		var req shipmentReq
		if err := c.ShouldBindJSON(&req); err != nil || req.OrderID == 0 || req.QtyKg <= 0 {
			c.JSON(400, gin.H{"error": "订单与发货数量必填"})
			return
		}
		uid, _ := currentUser(c)
		var orderBatch int64
		err := pool.QueryRow(c, `SELECT batch_id FROM orders WHERE id=$1`, req.OrderID).Scan(&orderBatch)
		if err != nil || orderBatch != id {
			c.JSON(400, gin.H{"error": "该订单不属于当前批次"})
			return
		}
		var seq int
		if err := pool.QueryRow(c,
			`SELECT COUNT(*)+1 FROM shipments WHERE order_id=$1`, req.OrderID).Scan(&seq); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if req.Seq > 0 {
			seq = req.Seq
		}
		status := req.Status
		if status == "" {
			status = "in_transit"
		}
		var newID int64
		err = pool.QueryRow(c, `
			INSERT INTO shipments
			(batch_id, order_id, logistics_id, carrier, tracking_no, qty_kg, boxes, cold_chain_temp,
			 receiver_name, receiver_phone, address, seq, status, shipped_at)
			SELECT $1,$2,$3,$4,$5,$6,$7,$8,
			 o.receiver_name, o.receiver_phone, o.address,
			 $9, $10, COALESCE(NULLIF($11,'')::timestamptz, now())
			FROM orders o WHERE o.id=$2 RETURNING id`,
			id, req.OrderID, uid, req.Carrier, req.TrackingNo, req.QtyKg, req.Boxes, req.ColdChainTemp,
			seq, status, req.ShippedAt).Scan(&newID)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		// 累计发货量推进订单状态
		_, _ = pool.Exec(c, `
			UPDATE orders o SET status = CASE
			  WHEN (SELECT COALESCE(SUM(qty_kg),0) FROM shipments WHERE order_id=o.id AND status<>'exception')
			       >= p.unit_per_share * o.shares THEN 'shipped'
			  ELSE 'partial_shipped' END
			FROM batches b JOIN projects p ON p.id=b.project_id
			WHERE o.batch_id=b.id AND o.id=$1`, req.OrderID)
		c.JSON(201, gin.H{"id": newID, "seq": seq})
	}
}

type shipmentPatch struct {
	Status      string  `json:"status"`
	TrackingNo  string  `json:"tracking_no"`
	Address     string  `json:"address"`
	DeliveredAt string  `json:"delivered_at"`
	ColdTemp    float64 `json:"cold_chain_temp"`
}

func updateShipment(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		sid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req shipmentPatch
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		tx, err := pool.Begin(c)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(c)
		var orderID int64
		if err := tx.QueryRow(c, `SELECT order_id FROM shipments WHERE id=$1`, sid).Scan(&orderID); err != nil {
			c.JSON(404, gin.H{"error": "发货单不存在"})
			return
		}
		if req.Status != "" {
			if req.Status == "delivered" {
				_, err = tx.Exec(c,
					`UPDATE shipments SET status=$2, delivered_at=COALESCE(NULLIF($3,'')::timestamptz, now()) WHERE id=$1`,
					sid, req.Status, req.DeliveredAt)
			} else {
				_, err = tx.Exec(c, `UPDATE shipments SET status=$2 WHERE id=$1`, sid, req.Status)
			}
			if err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
		}
		if req.TrackingNo != "" {
			_, _ = tx.Exec(c, `UPDATE shipments SET tracking_no=$2 WHERE id=$1`, sid, req.TrackingNo)
		}
		if req.Address != "" {
			_, _ = tx.Exec(c, `UPDATE shipments SET address=$2, address_changed=TRUE WHERE id=$1`, sid, req.Address)
		}
		if req.ColdTemp != 0 {
			_, _ = tx.Exec(c, `UPDATE shipments SET cold_chain_temp=$2 WHERE id=$1`, sid, req.ColdTemp)
		}
		_, _ = tx.Exec(c, `
			UPDATE orders o SET status = CASE
			  WHEN (SELECT COALESCE(SUM(qty_kg),0) FROM shipments WHERE order_id=o.id AND status='delivered')
			       >= p.unit_per_share * o.shares THEN 'completed'
			  WHEN (SELECT COUNT(*) FROM shipments WHERE order_id=o.id AND status<>'planned') > 0 THEN 'partial_shipped'
			  ELSE o.status END
			FROM batches b JOIN projects p ON p.id=b.project_id
			WHERE o.batch_id=b.id AND o.id=$1`, orderID)
		if err := tx.Commit(c); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

type insuranceReq struct {
	PolicyNo string          `json:"policy_no"`
	Amount   float64         `json:"amount"`
	Evidence json.RawMessage `json:"evidence"`
	Note     string          `json:"note"`
}

func createInsurance(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := batchID(c)
		var req insuranceReq
		if err := c.ShouldBindJSON(&req); err != nil || req.PolicyNo == "" {
			c.JSON(400, gin.H{"error": "保单号必填"})
			return
		}
		ev := req.Evidence
		if len(ev) == 0 {
			ev = json.RawMessage("[]")
		}
		var disasterID any
		_ = pool.QueryRow(c, `SELECT id FROM disasters WHERE batch_id=$1 ORDER BY id DESC LIMIT 1`, id).Scan(&disasterID)
		var newID int64
		err := pool.QueryRow(c, `
			INSERT INTO insurance_claims (batch_id, disaster_id, policy_no, amount, evidence, note)
			VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			id, disasterID, req.PolicyNo, req.Amount, string(ev), req.Note).Scan(&newID)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": newID})
	}
}

type insurancePatch struct {
	Status string `json:"status"`
	Note   string `json:"note"`
}

func updateInsurance(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req insurancePatch
		if err := c.ShouldBindJSON(&req); err != nil || req.Status == "" {
			c.JSON(400, gin.H{"error": "状态必填"})
			return
		}
		_, err := pool.Exec(c, `
			UPDATE insurance_claims
			SET status=$2, note=COALESCE(NULLIF($3,''), note),
			    settled_at=CASE WHEN $2 IN ('paid','rejected') THEN now() ELSE settled_at END
			WHERE id=$1`, id, req.Status, req.Note)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

var _ = time.Now // keep import
