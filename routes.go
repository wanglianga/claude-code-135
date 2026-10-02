package main

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerRoutes(api *gin.RouterGroup, pool *pgxpool.Pool, secret string) {
	api.GET("/health", func(c *gin.Context) {
		if err := pool.Ping(c); err != nil {
			c.JSON(503, gin.H{"status": "db_error", "error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"status": "ok"})
	})
	api.POST("/auth/login", loginHandler(pool, secret))

	// 公开只读接口
	pub := api.Group("")
	pub.GET("/projects", listProjects(pool))
	pub.GET("/projects/:id", getProject(pool))
	pub.GET("/batches/:id", getBatch(pool))
	pub.GET("/batches/:id/timeline", getBatchTimeline(pool))
	pub.GET("/batches/:id/final-report", getFinalReport(pool))
	pub.GET("/live", listLive(pool))
	pub.GET("/visits", listVisits(pool))
	pub.GET("/group-buys", listGroupBuys(pool))
	pub.GET("/charity", listCharity(pool))
	pub.GET("/stats/overview", overviewStats(pool))
	pub.GET("/certificates/verify/:certNo", verifyCertificate(pool))

	// 需登录
	auth := api.Group("")
	auth.Use(authMiddleware(secret))
	auth.GET("/me", meHandler(pool))

	// 认养人
	auth.POST("/orders", requireRole("buyer"), createOrder(pool))
	auth.GET("/my/orders", requireRole("buyer"), myOrders(pool))
	auth.GET("/my/orders/:id", getMyOrder(pool))
	auth.PATCH("/my/orders/:id/address", requireRole("buyer"), changeAddress(pool))
	auth.POST("/my/orders/:id/revisit", requireRole("buyer"), submitRevisit(pool))
	auth.POST("/visits/:id/book", requireRole("buyer"), bookVisit(pool))
	auth.POST("/group-buys", requireRole("buyer"), createGroupBuy(pool))
	auth.POST("/charity", requireRole("buyer", "farmer"), createCharity(pool))

	// 工单（任何登录用户可发起与补充处理流水）
	auth.POST("/tickets", createTicket(pool))
	auth.GET("/tickets", listTickets(pool))
	auth.GET("/tickets/:id", getTicket(pool))
	auth.POST("/tickets/:id/events", addTicketEvent(pool))
	auth.POST("/tickets/:id/compensations", requireRole("cs", "farmer"), createCompensation(pool))
	auth.PATCH("/compensations/:id", requireRole("cs", "farmer"), updateCompensation(pool))

	// 农场 / 管理
	auth.POST("/projects", requireRole("farmer"), createProject(pool))
	auth.POST("/projects/:id/batches", requireRole("farmer"), createBatch(pool))
	auth.GET("/farm/batches", requireRole("farmer"), farmBatches(pool))
	auth.GET("/farm/ledger", requireRole("farmer"), farmLedger(pool))
	auth.POST("/plots/:id/costs", requireRole("farmer"), createPlotCost(pool))

	auth.POST("/batches/:id/logs", requireRole("farmer"), createFarmLog(pool))
	auth.POST("/batches/:id/disasters", requireRole("farmer"), createDisaster(pool))
	auth.POST("/batches/:id/inspections", requireRole("farmer"), createInspection(pool))
	auth.POST("/batches/:id/harvest-plans", requireRole("farmer"), createHarvestPlan(pool))
	auth.POST("/batches/:id/insurance", requireRole("farmer"), createInsurance(pool))
	auth.PATCH("/insurance/:id", requireRole("farmer", "cs"), updateInsurance(pool))
	auth.POST("/batches/:id/final-report", requireRole("farmer"), generateFinalReport(pool))

	// 采摘工 / 包装员 / 物流
	auth.POST("/batches/:id/harvest-records", requireRole("picker", "farmer"), createHarvestRecord(pool))
	auth.POST("/batches/:id/sortings", requireRole("packer", "farmer"), createSorting(pool))
	auth.POST("/batches/:id/shipments", requireRole("logistics", "farmer"), createShipment(pool))
	auth.GET("/my/tasks", myTasks(pool)) // 采摘/包装/物流/客服工作台
	auth.PATCH("/shipments/:id", requireRole("logistics", "farmer"), updateShipment(pool))

	// 直播 / 参观场次管理
	auth.POST("/live", requireRole("farmer"), createLive(pool))
	auth.PATCH("/live/:id", requireRole("farmer"), updateLive(pool))
	auth.POST("/plots/:id/visits", requireRole("farmer"), createVisit(pool))
	auth.PATCH("/group-buys/:id", requireRole("farmer"), updateGroupBuy(pool))
}
