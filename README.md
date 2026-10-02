# 云耕认养 · 农产品众筹认养配送与成熟度回访平台

一个把 **农场、认养人、采摘工、包装员、冷链物流、客服** 六方处理结果串到**同一认养批次**的全栈平台。
技术栈：**React 18（Vite）+ Go 1.22（Gin / pgx）+ PostgreSQL 15**，前端构建产物由 Go `embed` 嵌入，单容器 + Compose 一键启动。

## 一、平台解决什么问题

围绕苹果树、蓝莓园、蜂蜜、稻田、有机蔬菜等认养项目，记录地块、批次、认养份额、预计成熟时间、农事照片、施肥用药、天气灾害、采摘标准、配送范围与认养人权益，并覆盖：

- **认养人**：付款后查看农事日志、成熟度抽检、预估产量、分批发货计划；可临时改地址、发起坏果/短收/分批争议工单、提交成熟度回访、查验认养证书。
- **农场端**：按成熟度、订单优先级、包装规格、冷链路线、坏果率安排采摘；登记冰雹减产/成熟延后（自动顺延成熟期并建工单）；保险理赔、赔付核算、地块成本账。
- **采摘工 / 包装员 / 物流 / 客服**：各自工作台录入过磅、分级装箱、运单状态与工单处理流水。
- **同一批次全景时间线**（数据库视图 `v_batch_timeline`）：农事投入 → 灾害 → 成熟抽检 → 采摘 → 分拣 → 分批发货 → 工单 → 赔付/保险 → 回访，一屏逐笔追溯。
- **最终交付报告**：实际产量、发货、坏果、赔付、保险、回访均分、地块成本/收入/净收益，以及按满意度、续认意向、产量缺口自动生成的**下一季续认建议**。
- **增值业务**：认养证书（编号可查验）、农场直播、地块参观预约、企业团购（折扣审批）、保险理赔、公益认养。

## 二、一键启动（Docker Compose）

需要 Docker + Docker Compose。

```bash
docker compose up --build
```

- 平台首页（React SPA）：http://localhost:8080
- API 健康检查：http://localhost:8080/api/health
- PostgreSQL：localhost:5432（用户/密码/库名均为 `farm/farm/farmadopt`）

容器首次启动会自动建表并写入演示数据（5 个品类项目、6 个批次、跨季完整闭环样板）。
重置数据：`docker compose down -v && docker compose up --build`。

## 三、本地开发启动

需要 Go 1.19+、Node 18+、PostgreSQL 13+。

```bash
# 1. 准备数据库（示例）
createdb farmadopt
# schema 与种子由服务启动时自动执行（空库才播种）；也可手动导入：
# psql -d farmadopt -f sql/schema.sql -f sql/seed.sql

# 2. 启动后端（默认 :8080）
export DATABASE_URL='postgres://用户:密码@127.0.0.1:5432/farmadopt?sslmode=disable'
export JWT_SECRET='dev-secret'
go run .

# 3. 启动前端开发服务器（:5173，/api 已代理到 :8080）
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173 。生产构建 `npm run build` 后，前端静态文件会被 Go 以 `//go:embed all:frontend/dist` 内嵌到同一二进制。

## 四、测试账号

所有账号密码统一为 **`farm123456`**：

| 账号 | 角色 | 可体验内容 |
|---|---|---|
| `farmer1` | 农场主 老王 | 发布项目/批次、农事与灾害登记、抽检与采摘计划、保险报案、地块完整账、生成最终报告 |
| `buyer1` | 认养人 张小明 | 认养付款、证书、改地址、坏果工单、分批发货核对、五星回访（本季苹果批次当事人） |
| `buyer2` | 认养人 李华（企业采购） | 企业团购、临时改址、分批配送争议 |
| `picker1` | 采摘工 赵大山 | 采摘计划看板、过磅录入 |
| `packer1` | 包装员 钱晓梅 | 待分拣批次、优/次/坏分级与装箱 |
| `logistics1` | 冷链物流 孙速达 | 运单看板、改址拦截、签收与冷链温度更新 |
| `cs1` | 客服 周小暖 | 待跟进工单、六方协调、赔付方案与执行 |
| `admin1` | 平台管理员 | 全量只读 + 角色权限默认放行 |

## 五、推荐验证路径（演示数据已铺好完整故事）

1. 用 `buyer1` 登录，打开「烟台红富士苹果树认养」→ 批次 **B2025-APL-01（已完结）**：
   - 「批次全景时间线」可见 21+ 条事件：施肥用药 → 冰雹 → 抽检 → 两次采摘 → 分拣 → 5 张发货单 → 权益短少工单（采摘工/包装员/农场/物流/客服 6 条流水）→ 退款+保险 → 3 份回访。
   - 「最终交付报告」：产量 72kg / 发货 69kg / 坏果 3kg / 赔付 ¥119.2 / 保险 ¥300 / 回访均分 4.67 / 净收益 ¥470 与续认建议。
2. 切到批次 **B2026-APL-02（配送中）**：本季冰雹减产 25%、成熟延后 7 天、李华订单临时改址（发货单带「改址」标记）、坏果投诉处理中、补发赔付待审核、分批配送争议。
3. `farmer1` →「农场控制台 → 地块完整账」：A-01~E-05 五个地块的投入科目、采摘/发货/赔付/满意度汇总与批次收支。
4. 分别登录 `picker1 / packer1 / logistics1 / cs1` 打开「工作台」，向同一批次补一条处理记录，再回认养人侧看时间线如何串联。
5. 「我的认养」中用证书号 `CERT-2025-0001` 做证书查验；市场页可预约地块参观、发起企业团购与公益认养。
6. 也可走一条全新链路：`farmer1` 发布项目+批次 → `buyer1` 认养付款（自动发证书）→ 农事/灾害/抽检（成熟度≥85%自动进入采摘）→ 采摘→分拣→分两批发货（订单自动推进状态）→ 改址/坏果工单 → 客服登记并执行赔付 → 五星回访 → 农场生成最终报告。

## 六、已实际执行的验证结论

以下均为在交付环境中**真实执行**的结果（2026-10-01）：

1. **数据库**：空库依次执行 `sql/schema.sql`、`sql/seed.sql` 成功；`v_batch_timeline` 视图对批次 1 返回 21 条全链路事件；重复启动（幂等迁移）不报错。
2. **后端**：`go vet ./...` 无告警，`go build` 编译通过；服务启动自动迁移+播种，`GET /api/health` 返回 `{"status":"ok"}`。
3. **端到端 API 脚本**（`/tmp/e2e.py`，真实 HTTP 调用，断言全部通过，输出 `ALL E2E CHECKS PASSED`）：
   - 发布项目→建批次→认养 2 份（行级锁校验剩余份额、自动生成证书 `CERT-2026-0010`、金额 200 元）；
   - 农事日志、冰雹灾害（减产 20%/延后 5 天，自动建工单+顺延成熟日期）、抽检 90%（批次自动 `growing→harvesting`）、采摘计划、保险报案；
   - 同一工单上采摘工/包装员/物流依次追加处理流水（4 个角色同单可查）；
   - 采摘 40kg（坏 4kg）→ 分拣 30/6/4kg/7 箱 → 同一订单两批发货 8kg+2kg（自动序号 1、2，订单自动 `shipped`，累计 10kg=权益量）；
   - 认养人改址自动建工单；坏果工单→客服登记退款→核准→执行赔付（20 元计入报告）→工单 resolved；
   - 五星回访；地块成本 80 元入账；最终报告自动汇总 40/10/4kg、赔付 20、成本 80、收入 200、净收益 100，批次置 `completed`，续认建议含续认与坏果整改；
   - 四类角色工作台数据正确；新批次时间线包含 farm_log/disaster/inspection/harvest/sorting/shipment/ticket/compensation/insurance/revisit 共 10 类事件；证书查验 valid=true。
4. **前端**：`npm run build`（Vite）成功，产出 `index.html + css 8KB + js 248KB`；Go 嵌入后 `GET /` 返回页面，静态资源 200，`/my` 等深链 SPA 回退正常，`/api/*` 未命中返回 JSON 404。
5. **Docker**：提供多阶段 `Dockerfile`（node 构建前端 → golang 构建嵌入二进制 → distroless 运行）与 `docker-compose.yml`（postgres15 + 健康检查 + 自动建表播种）。当前沙箱无 Docker daemon，未在本机实际执行 `docker compose build`；镜像构建逻辑与本地已验证的构建步骤完全一致。

## 七、主要 HTTP 接口

- 公开：`POST /api/auth/login`、`GET /api/projects`、`GET /api/projects/:id`、`GET /api/batches/:id`、`GET /api/batches/:id/timeline`、`GET /api/batches/:id/final-report`、`GET /api/live|visits|group-buys|charity`、`GET /api/stats/overview`、`GET /api/certificates/verify/:certNo`
- 认养人：`POST /api/orders`、`GET /api/my/orders`、`PATCH /api/my/orders/:id/address`、`POST /api/my/orders/:id/revisit`、`POST /api/visits/:id/book`、`POST /api/group-buys`、`POST /api/charity`
- 农场：`POST /api/projects`、`POST /api/projects/:id/batches`、`POST /api/batches/:id/{logs,disasters,inspections,harvest-plans,harvest-records,sortings,shipments,insurance,final-report}`、`GET /api/farm/batches`、`GET /api/farm/ledger`、`POST /api/plots/:id/costs`
- 协同：`POST /api/tickets`、`GET /api/tickets`、`GET /api/tickets/:id`、`POST /api/tickets/:id/events`、`POST /api/tickets/:id/compensations`、`PATCH /api/compensations/:id`、`PATCH /api/shipments/:id`、`PATCH /api/insurance/:id`、`GET /api/my/tasks`

## 八、目录结构

```
.
├── Dockerfile / docker-compose.yml   # 多阶段构建 + 一键编排
├── sql/schema.sql                    # 23 张表 + v_batch_timeline 全景视图
├── sql/seed.sql                      # 跨季完整闭环演示数据
├── main.go db.go auth.go routes.go   # 入口/迁移/JWT 鉴权/路由
├── handlers_*.go jsonrows.go         # 业务接口（项目、批次、订单、工单、地块账、工作台…）
└── frontend/                         # React 18 + Vite
    └── src/pages/                    # 市场/项目/批次全景/我的认养/农场控制台/工作台/工单中心
```
