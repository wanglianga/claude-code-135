package main

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ===== 地块完整账：投入→灾害→成熟→采摘→分拣→发货→售后回访 =====

func farmLedger(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := currentUser(c)
		plots, err := queryRows(c, pool, `
			SELECT pl.*, COALESCE((SELECT SUM(pc.amount) FROM plot_costs pc WHERE pc.plot_id=pl.id),0) AS cost_total
			FROM plots pl WHERE pl.farm_id=(SELECT farm_id FROM users WHERE id=$1)
			ORDER BY pl.id`, uid)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		for _, pl := range plots {
			pid, _ := pl["id"].(int64)
			costs, _ := queryRows(c, pool,
				`SELECT item, SUM(amount) AS amount FROM plot_costs WHERE plot_id=$1 GROUP BY item ORDER BY item`, pid)
			pl["cost_by_item"] = costs
			// 该地块所有批次的采收/发货/赔付/回访汇总
			summary, _ := queryOne(c, pool, `
				SELECT
				  COALESCE(SUM(hr.picked_kg),0) AS picked_kg,
				  COALESCE(SUM(hr.bad_kg),0) AS picked_bad_kg,
				  COALESCE((SELECT SUM(s.grade_a_kg) FROM sortings s
				            JOIN batches b2 ON b2.id=s.batch_id WHERE b2.project_id IN
				            (SELECT id FROM projects WHERE plot_id=$1)),0) AS grade_a_kg,
				  COALESCE((SELECT SUM(sh.qty_kg) FROM shipments sh
				            JOIN batches b3 ON b3.id=sh.batch_id WHERE b3.project_id IN
				            (SELECT id FROM projects WHERE plot_id=$1)),0) AS shipped_kg,
				  COALESCE((SELECT SUM(cp.amount) FROM compensations cp
				            JOIN batches b4 ON b4.id=cp.batch_id WHERE b4.project_id IN
				            (SELECT id FROM projects WHERE plot_id=$1)),0) AS compensation_amount,
				  COALESCE((SELECT AVG(rs.satisfaction) FROM revisit_surveys rs
				            JOIN batches b5 ON b5.id=rs.batch_id WHERE b5.project_id IN
				            (SELECT id FROM projects WHERE plot_id=$1)),0) AS satisfaction_avg,
				  (SELECT COUNT(*) FROM batches b6 WHERE b6.project_id IN
				            (SELECT id FROM projects WHERE plot_id=$1)) AS batch_count
				FROM harvest_records hr
				JOIN batches b ON b.id=hr.batch_id
				WHERE b.project_id IN (SELECT id FROM projects WHERE plot_id=$1)`, pid)
			if summary != nil {
				pl["flow_summary"] = summary
			}
			batches, _ := queryRows(c, pool, `
				SELECT b.id, b.code, b.status, p.name AS project_name,
				  COALESCE((SELECT SUM(pc.amount) FROM plot_costs pc WHERE pc.batch_id=b.id),0) AS batch_cost,
				  COALESCE((SELECT SUM(o.amount) FROM orders o WHERE o.batch_id=b.id),0) AS batch_income,
				  COALESCE((SELECT SUM(hr.picked_kg) FROM harvest_records hr WHERE hr.batch_id=b.id),0) AS picked_kg
				FROM batches b JOIN projects p ON p.id=b.project_id
				WHERE p.plot_id=$1 ORDER BY b.id DESC`, pid)
			pl["batches"] = batches
		}
		c.JSON(200, plots)
	}
}

type costReq struct {
	BatchID    int64   `json:"batch_id"`
	Item       string  `json:"item"`
	Amount     float64 `json:"amount"`
	OccurredAt string  `json:"occurred_at"`
	Note       string  `json:"note"`
}

func createPlotCost(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		plotID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req costReq
		if err := c.ShouldBindJSON(&req); err != nil || req.Item == "" || req.Amount <= 0 {
			c.JSON(400, gin.H{"error": "成本科目与金额必填"})
			return
		}
		var id int64
		err := pool.QueryRow(c, `
			INSERT INTO plot_costs (plot_id, batch_id, item, amount, occurred_at, note)
			VALUES ($1,$2,$3,$4,COALESCE(NULLIF($5,'')::date, CURRENT_DATE),$6) RETURNING id`,
			plotID, nullableID(req.BatchID), req.Item, req.Amount, req.OccurredAt, req.Note).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

// ===== 最终交付报告：产量/发货/赔付/回访/成本收入/下一季续认建议 =====

func getFinalReport(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		row, err := queryOne(c, pool, `SELECT * FROM final_reports WHERE batch_id=$1`, id)
		if err == pgx.ErrNoRows {
			c.JSON(404, gin.H{"error": "该批次尚未生成最终报告"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, row)
	}
}

type reportReq struct {
	RenewalSuggestion string `json:"renewal_suggestion"`
	Summary           string `json:"summary"`
}

func generateFinalReport(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := batchID(c)
		var req reportReq
		_ = c.ShouldBindJSON(&req)

		// 自动汇总
		stats, err := queryOne(c, pool, `
			SELECT
			  COALESCE((SELECT SUM(picked_kg) FROM harvest_records WHERE batch_id=$1),0) AS total_yield_kg,
			  COALESCE((SELECT SUM(qty_kg) FROM shipments WHERE batch_id=$1),0) AS shipped_kg,
			  COALESCE((SELECT SUM(bad_kg) FROM sortings WHERE batch_id=$1),0) AS bad_kg,
			  COALESCE((SELECT SUM(amount) FROM compensations WHERE batch_id=$1 AND status='paid'),0) AS comp_amount,
			  COALESCE((SELECT SUM(amount) FROM insurance_claims WHERE batch_id=$1 AND status='paid'),0) AS ins_amount,
			  (SELECT AVG(satisfaction) FROM revisit_surveys WHERE batch_id=$1) AS revisit_avg,
			  COALESCE((SELECT SUM(amount) FROM plot_costs WHERE batch_id=$1),0) AS cost_total,
			  COALESCE((SELECT SUM(amount) FROM orders WHERE batch_id=$1),0) AS income_total
		`, id)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		toF := func(k string) float64 {
			if v, ok := stats[k].(float64); ok {
				return v
			}
			return 0
		}
		totalYield := toF("total_yield_kg")
		shipped := toF("shipped_kg")
		bad := toF("bad_kg")
		compAmt := toF("comp_amount")
		insAmt := toF("ins_amount")
		cost := toF("cost_total")
		income := toF("income_total")
		net := income - cost + insAmt - compAmt

		// 自动续认建议（可被请求覆盖）
		suggestion := req.RenewalSuggestion
		if suggestion == "" {
			suggestion = buildRenewalSuggestion(c, pool, id, toF("revisit_avg"), totalYield, bad)
		}
		summary := req.Summary

		var rid int64
		err = pool.QueryRow(c, `
			INSERT INTO final_reports
			(batch_id, total_yield_kg, shipped_kg, bad_kg, compensation_amount, insurance_amount,
			 revisit_avg, cost_total, income_total, net_income, renewal_suggestion, summary)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			ON CONFLICT (batch_id) DO UPDATE SET
			  total_yield_kg=EXCLUDED.total_yield_kg, shipped_kg=EXCLUDED.shipped_kg,
			  bad_kg=EXCLUDED.bad_kg, compensation_amount=EXCLUDED.compensation_amount,
			  insurance_amount=EXCLUDED.insurance_amount, revisit_avg=EXCLUDED.revisit_avg,
			  cost_total=EXCLUDED.cost_total, income_total=EXCLUDED.income_total,
			  net_income=EXCLUDED.net_income,
			  renewal_suggestion=COALESCE(NULLIF(EXCLUDED.renewal_suggestion,''), final_reports.renewal_suggestion),
			  summary=COALESCE(NULLIF(EXCLUDED.summary,''), final_reports.summary),
			  updated_at=now()
			RETURNING id`,
			id, totalYield, shipped, bad, compAmt, insAmt, nullableFloat(toF("revisit_avg")),
			cost, income, net, suggestion, summary).Scan(&rid)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		_, _ = pool.Exec(c, `UPDATE batches SET status='completed' WHERE id=$1`, id)
		c.JSON(200, gin.H{
			"id": rid, "total_yield_kg": totalYield, "shipped_kg": shipped, "bad_kg": bad,
			"compensation_amount": compAmt, "insurance_amount": insAmt,
			"cost_total": cost, "income_total": income, "net_income": net,
		})
	}
}

func nullableFloat(v float64) any {
	if v == 0 {
		return nil
	}
	return v
}

func buildRenewalSuggestion(c *gin.Context, pool *pgxpool.Pool, batchID int64, revisitAvg, yield, bad float64) string {
	rows, _ := queryRows(c, pool, `
		SELECT COALESCE(COUNT(*),0) AS total,
		       COALESCE(SUM(CASE WHEN renew_intent THEN 1 ELSE 0 END),0) AS renew
		FROM revisit_surveys WHERE batch_id=$1`, batchID)
	total, renew := 0, 0
	if len(rows) > 0 {
		total = toInt(rows[0]["total"])
		renew = toInt(rows[0]["renew"])
	}
	var rights float64
	_ = pool.QueryRow(c, `
		SELECT COALESCE(SUM(o.shares*p.unit_per_share),0)
		FROM orders o JOIN batches b ON b.id=o.batch_id JOIN projects p ON p.id=b.project_id
		WHERE o.batch_id=$1`, batchID).Scan(&rights)
	s := "下一季续认建议："
	if revisitAvg >= 4.5 {
		s += "本季客户满意度高，可向全部认养人推送续认并给予老客优惠；"
	} else if revisitAvg > 0 {
		s += "满意度未达优，先针对低分项目整改后再定向邀约续认；"
	}
	if total > 0 {
		s += "回访 " + strconv.Itoa(total) + " 户，明确续任意向 " + strconv.Itoa(renew) + " 户；"
	}
	if rights > 0 && yield > 0 && yield < rights {
		s += "实际产量低于认养权益总量，下季应按90%保守折算权益或预留机动果，并完善灾害保险；"
	}
	if bad > 0 {
		s += "继续压减坏果率，加强采摘手法培训与冷链包装；"
	}
	return s
}

func toInt(v any) int {
	switch x := v.(type) {
	case int64:
		return int(x)
	case float64:
		return int(x)
	default:
		return 0
	}
}

// ===== 多角色工作台 =====

func myTasks(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, role := currentUser(c)
		out := gin.H{"role": role}
		switch role {
		case "picker":
			rows, _ := queryRows(c, pool, `
				SELECT b.id AS batch_id, b.code, p.name AS project_name, hp.planned_date,
				 hp.priority_rule, hp.packaging_spec, hp.cold_chain_route, hp.target_bad_rate,
				 COALESCE((SELECT SUM(hr.picked_kg) FROM harvest_records hr WHERE hr.batch_id=b.id),0) AS picked_kg
				FROM harvest_plans hp
				JOIN batches b ON b.id=hp.batch_id
				JOIN projects p ON p.id=b.project_id
				WHERE hp.status<>'done'
				ORDER BY hp.planned_date, b.id`)
			out["harvest_plans"] = rows
		case "packer":
			rows, _ := queryRows(c, pool, `
				SELECT b.id AS batch_id, b.code, p.name AS project_name,
				 COALESCE((SELECT SUM(hr.picked_kg) FROM harvest_records hr WHERE hr.batch_id=b.id),0) AS picked_kg,
				 COALESCE((SELECT SUM(s.grade_a_kg+s.grade_b_kg) FROM sortings s WHERE s.batch_id=b.id),0) AS sorted_kg
				FROM batches b JOIN projects p ON p.id=b.project_id
				WHERE b.status IN ('harvesting','delivering','disputed')
				ORDER BY b.id DESC`)
			out["batches_to_sort"] = rows
		case "logistics":
			rows, _ := queryRows(c, pool, `
				SELECT sh.*, b.code AS batch_code, p.name AS project_name
				FROM shipments sh
				JOIN batches b ON b.id=sh.batch_id
				JOIN projects p ON p.id=b.project_id
				WHERE sh.status IN ('planned','in_transit','exception')
				ORDER BY sh.status, sh.id`)
			out["shipments"] = rows
		case "cs":
			rows, _ := queryRows(c, pool, `
				SELECT t.*, b.code AS batch_code, p.name AS project_name, u.name AS raised_by_name
				FROM tickets t
				JOIN batches b ON b.id=t.batch_id
				JOIN projects p ON p.id=b.project_id
				LEFT JOIN users u ON u.id=t.raised_by
				WHERE t.status IN ('open','processing')
				ORDER BY t.status, t.id`)
			out["tickets"] = rows
			pending, _ := queryRows(c, pool, `SELECT * FROM compensations WHERE status IN ('pending','approved') ORDER BY id`)
			out["pending_compensations"] = pending
		case "farmer":
			rows, _ := queryRows(c, pool, `
				SELECT b.*, p.name AS project_name,
				 (SELECT COUNT(*) FROM tickets t WHERE t.batch_id=b.id AND t.status<>'closed') AS open_tickets
				FROM batches b JOIN projects p ON p.id=b.project_id
				WHERE p.farm_id=(SELECT farm_id FROM users WHERE id=$1)
				ORDER BY b.id DESC`, uid)
			out["batches"] = rows
		default:
			out["message"] = "当前角色无工作台任务"
		}
		c.JSON(200, out)
	}
}

// ===== 直播 / 参观 / 团购 / 公益 =====

func listLive(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := queryRows(c, pool, `
			SELECT l.*, f.name AS farm_name, b.code AS batch_code
			FROM live_streams l JOIN farms f ON f.id=l.farm_id
			LEFT JOIN batches b ON b.id=l.batch_id
			ORDER BY l.status, l.started_at DESC`)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, rows)
	}
}

type liveReq struct {
	BatchID int64  `json:"batch_id"`
	Title   string `json:"title"`
	URL     string `json:"url"`
	Status  string `json:"status"`
}

func createLive(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req liveReq
		if err := c.ShouldBindJSON(&req); err != nil || req.Title == "" {
			c.JSON(400, gin.H{"error": "直播标题必填"})
			return
		}
		uid, _ := currentUser(c)
		if req.Status == "" {
			req.Status = "live"
		}
		var id int64
		err := pool.QueryRow(c, `
			INSERT INTO live_streams (farm_id, batch_id, title, url, status)
			VALUES ((SELECT farm_id FROM users WHERE id=$1),$2,$3,$4,$5) RETURNING id`,
			uid, nullableID(req.BatchID), req.Title, req.URL, req.Status).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

func updateLive(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req liveReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		_, err := pool.Exec(c,
			`UPDATE live_streams SET status=COALESCE(NULLIF($2,''),status), title=COALESCE(NULLIF($3,''),title),
			 url=COALESCE(NULLIF($4,''),url) WHERE id=$1`, id, req.Status, req.Title, req.URL)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

func listVisits(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := queryRows(c, pool, `
			SELECT v.*, pl.name AS plot_name, pl.code AS plot_code, f.name AS farm_name
			FROM visits v
			JOIN plots pl ON pl.id=v.plot_id
			JOIN farms f ON f.id=pl.farm_id
			ORDER BY v.visit_date`)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, rows)
	}
}

type visitReq struct {
	VisitDate string `json:"visit_date"`
	Capacity  int    `json:"capacity"`
	Note      string `json:"note"`
}

func createVisit(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		plotID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req visitReq
		if err := c.ShouldBindJSON(&req); err != nil || req.VisitDate == "" {
			c.JSON(400, gin.H{"error": "参观日期必填"})
			return
		}
		var id int64
		err := pool.QueryRow(c, `
			INSERT INTO visits (plot_id, visit_date, capacity, note)
			VALUES ($1,$2::date,$3,$4) RETURNING id`, plotID, req.VisitDate, req.Capacity, req.Note).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

type bookReq struct {
	People int `json:"people"`
}

func bookVisit(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		vid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req bookReq
		_ = c.ShouldBindJSON(&req)
		if req.People <= 0 {
			req.People = 1
		}
		uid, _ := currentUser(c)
		tx, err := pool.Begin(c)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback(c)
		var capacity, booked int
		if err := tx.QueryRow(c,
			`SELECT capacity, booked_count FROM visits WHERE id=$1 FOR UPDATE`, vid).Scan(&capacity, &booked); err != nil {
			c.JSON(404, gin.H{"error": "参观场次不存在"})
			return
		}
		if booked+req.People > capacity {
			c.JSON(400, gin.H{"error": "名额不足"})
			return
		}
		if _, err := tx.Exec(c,
			`INSERT INTO visit_bookings (visit_id, user_id, people) VALUES ($1,$2,$3)`, vid, uid, req.People); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if _, err := tx.Exec(c,
			`UPDATE visits SET booked_count=booked_count+$2 WHERE id=$1`, vid, req.People); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit(c); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"ok": true})
	}
}

func listGroupBuys(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := queryRows(c, pool, `
			SELECT g.*, p.name AS project_name FROM group_buys g
			JOIN projects p ON p.id=g.project_id ORDER BY g.id DESC`)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, rows)
	}
}

type groupBuyReq struct {
	ProjectID   int64   `json:"project_id"`
	CompanyName string  `json:"company_name"`
	Contact     string  `json:"contact"`
	Phone       string  `json:"phone"`
	Shares      int     `json:"shares"`
	DiscountPct float64 `json:"discount_pct"`
}

func createGroupBuy(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req groupBuyReq
		if err := c.ShouldBindJSON(&req); err != nil || req.CompanyName == "" || req.Shares <= 0 {
			c.JSON(400, gin.H{"error": "企业名称与认购份数必填"})
			return
		}
		var id int64
		err := pool.QueryRow(c, `
			INSERT INTO group_buys (project_id, company_name, contact, phone, shares, discount_pct)
			VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			req.ProjectID, req.CompanyName, req.Contact, req.Phone, req.Shares, req.DiscountPct).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

func updateGroupBuy(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		var req struct {
			Status string `json:"status"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Status == "" {
			c.JSON(400, gin.H{"error": "状态必填"})
			return
		}
		if _, err := pool.Exec(c, `UPDATE group_buys SET status=$2 WHERE id=$1`, id, req.Status); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

func listCharity(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := queryRows(c, pool, `
			SELECT ca.*, p.name AS project_name FROM charity_adoptions ca
			JOIN projects p ON p.id=ca.project_id ORDER BY ca.id DESC`)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, rows)
	}
}

type charityReq struct {
	ProjectID   int64  `json:"project_id"`
	DonorName   string `json:"donor_name"`
	Shares      int    `json:"shares"`
	Beneficiary string `json:"beneficiary"`
	Message     string `json:"message"`
}

func createCharity(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req charityReq
		if err := c.ShouldBindJSON(&req); err != nil || req.DonorName == "" || req.Shares <= 0 {
			c.JSON(400, gin.H{"error": "捐赠方与份数必填"})
			return
		}
		var id int64
		err := pool.QueryRow(c, `
			INSERT INTO charity_adoptions (project_id, donor_name, shares, beneficiary, message)
			VALUES ($1,$2,$3,$4,$5) RETURNING id`,
			req.ProjectID, req.DonorName, req.Shares, req.Beneficiary, req.Message).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

// ===== 平台总览统计 =====

func overviewStats(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		row, err := queryOne(c, pool, `
			SELECT
			 (SELECT COUNT(*) FROM projects) AS projects,
			 (SELECT COUNT(*) FROM batches) AS batches,
			 (SELECT COUNT(*) FROM orders) AS orders,
			 (SELECT COALESCE(SUM(amount),0) FROM orders) AS gmv,
			 (SELECT COALESCE(SUM(shares_sold),0) FROM batches) AS shares_sold,
			 (SELECT COUNT(*) FROM tickets WHERE status<>'closed') AS open_tickets,
			 (SELECT COALESCE(AVG(satisfaction),0) FROM revisit_surveys) AS satisfaction_avg,
			 (SELECT COALESCE(SUM(amount),0) FROM compensations WHERE status='paid') AS compensation_paid,
			 (SELECT COALESCE(SUM(amount),0) FROM insurance_claims WHERE status='paid') AS insurance_paid`)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		statusRows, _ := queryRows(c, pool, `SELECT status, COUNT(*) AS n FROM batches GROUP BY status`)
		row["batch_status"] = statusRows
		c.JSON(200, row)
	}
}
