-- 农产品众筹认养配送与成熟度回访平台 数据库结构
-- PostgreSQL 13+

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    phone         TEXT,
    role          TEXT NOT NULL CHECK (role IN ('farmer','buyer','picker','packer','logistics','cs','admin')),
    farm_id       BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farms (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    owner_id    BIGINT REFERENCES users(id),
    location    TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_farm_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_farm_fk FOREIGN KEY (farm_id) REFERENCES farms(id);
  END IF;
END $$;

-- 地块
CREATE TABLE IF NOT EXISTS plots (
    id        BIGSERIAL PRIMARY KEY,
    farm_id   BIGINT NOT NULL REFERENCES farms(id),
    code      TEXT NOT NULL,
    name      TEXT NOT NULL,
    area_mu   NUMERIC(10,2),
    crop_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 认养项目（苹果树/蓝莓园/蜂蜜/稻田/有机蔬菜）
CREATE TABLE IF NOT EXISTS projects (
    id               BIGSERIAL PRIMARY KEY,
    farm_id          BIGINT NOT NULL REFERENCES farms(id),
    plot_id          BIGINT REFERENCES plots(id),
    name             TEXT NOT NULL,
    category         TEXT NOT NULL CHECK (category IN ('apple','blueberry','honey','rice','vegetable')),
    total_shares     INT NOT NULL DEFAULT 100,
    price_per_share  NUMERIC(10,2) NOT NULL,   -- 每份价格（元）
    unit_per_share   NUMERIC(10,2) NOT NULL,   -- 每份应得农产品（公斤/斤）
    unit             TEXT NOT NULL DEFAULT '公斤',
    est_mature_date  DATE,
    harvest_standard TEXT,                     -- 采摘标准
    delivery_range   TEXT,                     -- 配送范围
    rights_text      TEXT,                     -- 认养人权益
    cover            TEXT,
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 认养批次（农事、灾害、成熟、采摘、分拣、发货、售后都串到同一批次）
CREATE TABLE IF NOT EXISTS batches (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id),
    code            TEXT NOT NULL UNIQUE,
    shares_total    INT NOT NULL,
    shares_sold     INT NOT NULL DEFAULT 0,
    est_mature_date DATE,
    status          TEXT NOT NULL DEFAULT 'growing'
                    CHECK (status IN ('growing','mature','harvesting','delivering','completed','disputed')),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 认养订单
CREATE TABLE IF NOT EXISTS orders (
    id            BIGSERIAL PRIMARY KEY,
    batch_id      BIGINT NOT NULL REFERENCES batches(id),
    buyer_id      BIGINT NOT NULL REFERENCES users(id),
    shares        INT NOT NULL,
    amount        NUMERIC(12,2) NOT NULL,
    status        TEXT NOT NULL DEFAULT 'paid'
                  CHECK (status IN ('paid','partial_shipped','shipped','completed','refunded')),
    receiver_name TEXT,
    receiver_phone TEXT,
    address       TEXT,
    cert_no       TEXT UNIQUE,
    paid_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 农事日志（施肥用药/天气灾害/农事照片，photo_urls JSON 数组）
CREATE TABLE IF NOT EXISTS farm_logs (
    id         BIGSERIAL PRIMARY KEY,
    batch_id   BIGINT NOT NULL REFERENCES batches(id),
    author_id  BIGINT REFERENCES users(id),
    type       TEXT NOT NULL CHECK (type IN ('farming','fertilizer','pesticide','weather','photo')),
    title      TEXT,
    content    TEXT,
    photo_urls JSONB NOT NULL DEFAULT '[]',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_farm_logs_batch ON farm_logs(batch_id);

-- 天气/灾害记录（冰雹减产、成熟延后）
CREATE TABLE IF NOT EXISTS disasters (
    id               BIGSERIAL PRIMARY KEY,
    batch_id         BIGINT NOT NULL REFERENCES batches(id),
    type             TEXT NOT NULL CHECK (type IN ('hail','frost','drought','flood','pest','windstorm','other')),
    occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    description      TEXT,
    yield_impact_pct INT NOT NULL DEFAULT 0,     -- 预估减产比例
    mature_delay_days INT NOT NULL DEFAULT 0,    -- 成熟延后天数
    status           TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','claiming','settled'))
);

-- 成熟度抽检 / 预估产量
CREATE TABLE IF NOT EXISTS maturity_inspections (
    id            BIGSERIAL PRIMARY KEY,
    batch_id      BIGINT NOT NULL REFERENCES batches(id),
    inspector_id  BIGINT REFERENCES users(id),
    sample_count  INT,
    mature_pct    NUMERIC(5,2),                  -- 成熟度 %
    grade_a_pct   NUMERIC(5,2),                  -- 优果率 %
    bad_fruit_pct NUMERIC(5,2),                  -- 坏果率 %
    sugar_brix    NUMERIC(5,2),                  -- 糖度
    est_yield_kg  NUMERIC(10,2),                 -- 预估产量
    inspected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    note          TEXT
);

-- 采摘计划（成熟度/订单优先级/包装规格/冷链路线/坏果率）
CREATE TABLE IF NOT EXISTS harvest_plans (
    id               BIGSERIAL PRIMARY KEY,
    batch_id         BIGINT NOT NULL REFERENCES batches(id),
    planned_date     DATE NOT NULL,
    priority_rule    TEXT,     -- 订单优先级
    packaging_spec   TEXT,     -- 包装规格
    cold_chain_route TEXT,     -- 冷链路线
    target_bad_rate  NUMERIC(5,2),
    status           TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 采摘记录（采摘工）
CREATE TABLE IF NOT EXISTS harvest_records (
    id         BIGSERIAL PRIMARY KEY,
    batch_id   BIGINT NOT NULL REFERENCES batches(id),
    plan_id    BIGINT REFERENCES harvest_plans(id),
    picker_id  BIGINT REFERENCES users(id),
    picked_kg  NUMERIC(10,2) NOT NULL,
    bad_kg     NUMERIC(10,2) NOT NULL DEFAULT 0,
    work_hours NUMERIC(5,1),
    picked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    note       TEXT
);

-- 分拣/包装（包装员，果品分级）
CREATE TABLE IF NOT EXISTS sortings (
    id           BIGSERIAL PRIMARY KEY,
    batch_id     BIGINT NOT NULL REFERENCES batches(id),
    packer_id    BIGINT REFERENCES users(id),
    grade_a_kg   NUMERIC(10,2) NOT NULL DEFAULT 0,
    grade_b_kg   NUMERIC(10,2) NOT NULL DEFAULT 0,
    bad_kg       NUMERIC(10,2) NOT NULL DEFAULT 0,
    boxes        INT NOT NULL DEFAULT 0,
    box_spec     TEXT,
    sorted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    note         TEXT
);

-- 发货/配送（物流，支持一个订单分批发货、改址标记、冷链温度）
CREATE TABLE IF NOT EXISTS shipments (
    id               BIGSERIAL PRIMARY KEY,
    batch_id         BIGINT NOT NULL REFERENCES batches(id),
    order_id         BIGINT REFERENCES orders(id),
    logistics_id     BIGINT REFERENCES users(id),
    carrier          TEXT,
    tracking_no      TEXT,
    qty_kg           NUMERIC(10,2) NOT NULL DEFAULT 0,
    boxes            INT NOT NULL DEFAULT 0,
    cold_chain_temp  NUMERIC(5,1),
    receiver_name    TEXT,
    receiver_phone   TEXT,
    address          TEXT,
    address_changed  BOOLEAN NOT NULL DEFAULT FALSE,
    seq              INT NOT NULL DEFAULT 1,  -- 第几批
    status           TEXT NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned','in_transit','delivered','exception')),
    shipped_at       TIMESTAMPTZ,
    delivered_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);

-- 工单：冰雹减产/成熟延后/临时改地址/果品大小不均/坏果投诉/分批配送争议/权益与产量不一致
CREATE TABLE IF NOT EXISTS tickets (
    id          BIGSERIAL PRIMARY KEY,
    batch_id    BIGINT NOT NULL REFERENCES batches(id),
    order_id    BIGINT REFERENCES orders(id),
    type        TEXT NOT NULL CHECK (type IN
                ('hail_loss','mature_delay','address_change','fruit_size',
                 'bad_fruit','dispatch_dispute','rights_mismatch')),
    title       TEXT NOT NULL,
    description TEXT,
    raised_by   BIGINT REFERENCES users(id),
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','processing','resolved','closed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- 工单处理流水：农场/认养人/采摘工/包装员/物流/客服处理结果串联
CREATE TABLE IF NOT EXISTS ticket_events (
    id         BIGSERIAL PRIMARY KEY,
    ticket_id  BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_id   BIGINT REFERENCES users(id),
    actor_role TEXT NOT NULL,  -- farmer/buyer/picker/packer/logistics/cs
    action     TEXT NOT NULL,
    result     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 赔付
CREATE TABLE IF NOT EXISTS compensations (
    id          BIGSERIAL PRIMARY KEY,
    ticket_id   BIGINT REFERENCES tickets(id),
    batch_id    BIGINT NOT NULL REFERENCES batches(id),
    order_id    BIGINT REFERENCES orders(id),
    type        TEXT NOT NULL CHECK (type IN ('refund','reissue','insurance_payout','coupon')),
    amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    qty_kg      NUMERIC(10,2) NOT NULL DEFAULT 0,
    reason      TEXT,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
    decided_by  BIGINT REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at  TIMESTAMPTZ
);

-- 保险理赔
CREATE TABLE IF NOT EXISTS insurance_claims (
    id           BIGSERIAL PRIMARY KEY,
    batch_id     BIGINT NOT NULL REFERENCES batches(id),
    disaster_id  BIGINT REFERENCES disasters(id),
    policy_no    TEXT NOT NULL,
    amount       NUMERIC(12,2) NOT NULL,
    status       TEXT NOT NULL DEFAULT 'filed' CHECK (status IN ('filed','surveying','approved','rejected','paid')),
    evidence     JSONB NOT NULL DEFAULT '[]',
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at   TIMESTAMPTZ
);

-- 认养证书
CREATE TABLE IF NOT EXISTS certificates (
    id             BIGSERIAL PRIMARY KEY,
    order_id       BIGINT NOT NULL UNIQUE REFERENCES orders(id),
    cert_no        TEXT NOT NULL UNIQUE,
    rights_summary TEXT,
    issued_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 农场直播
CREATE TABLE IF NOT EXISTS live_streams (
    id         BIGSERIAL PRIMARY KEY,
    farm_id    BIGINT NOT NULL REFERENCES farms(id),
    batch_id   BIGINT REFERENCES batches(id),
    title      TEXT NOT NULL,
    url        TEXT,
    status     TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','ended','scheduled')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 地块参观
CREATE TABLE IF NOT EXISTS visits (
    id           BIGSERIAL PRIMARY KEY,
    plot_id      BIGINT NOT NULL REFERENCES plots(id),
    visit_date   DATE NOT NULL,
    capacity     INT NOT NULL DEFAULT 30,
    booked_count INT NOT NULL DEFAULT 0,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS visit_bookings (
    id         BIGSERIAL PRIMARY KEY,
    visit_id   BIGINT NOT NULL REFERENCES visits(id),
    user_id    BIGINT NOT NULL REFERENCES users(id),
    people     INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 企业团购
CREATE TABLE IF NOT EXISTS group_buys (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT NOT NULL REFERENCES projects(id),
    company_name TEXT NOT NULL,
    contact      TEXT,
    phone        TEXT,
    shares       INT NOT NULL,
    discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','fulfilled')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 公益认养
CREATE TABLE IF NOT EXISTS charity_adoptions (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT NOT NULL REFERENCES projects(id),
    donor_name  TEXT NOT NULL,
    shares      INT NOT NULL,
    beneficiary TEXT,
    message     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 成熟度回访（满意度 + 下一季续认意向）
CREATE TABLE IF NOT EXISTS revisit_surveys (
    id             BIGSERIAL PRIMARY KEY,
    order_id       BIGINT NOT NULL REFERENCES orders(id),
    batch_id       BIGINT NOT NULL REFERENCES batches(id),
    buyer_id       BIGINT NOT NULL REFERENCES users(id),
    satisfaction   INT NOT NULL CHECK (satisfaction BETWEEN 1 AND 5),
    fruit_score    INT CHECK (fruit_score BETWEEN 1 AND 5),
    delivery_score INT CHECK (delivery_score BETWEEN 1 AND 5),
    service_score  INT CHECK (service_score BETWEEN 1 AND 5),
    renew_intent   BOOLEAN NOT NULL DEFAULT FALSE,
    comment        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 地块成本账（投入/施肥/用药/人工/包装/物流/灾害损失）
CREATE TABLE IF NOT EXISTS plot_costs (
    id         BIGSERIAL PRIMARY KEY,
    plot_id    BIGINT NOT NULL REFERENCES plots(id),
    batch_id   BIGINT REFERENCES batches(id),
    item       TEXT NOT NULL CHECK (item IN
               ('input','fertilizer','pesticide','labor','packaging','logistics','disaster_loss','other')),
    amount     NUMERIC(12,2) NOT NULL,
    occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 批次最终交付报告（产量/发货/赔付/回访/下一季续认建议）
CREATE TABLE IF NOT EXISTS final_reports (
    id                  BIGSERIAL PRIMARY KEY,
    batch_id            BIGINT NOT NULL UNIQUE REFERENCES batches(id),
    total_yield_kg      NUMERIC(10,2),
    shipped_kg          NUMERIC(10,2),
    bad_kg              NUMERIC(10,2),
    compensation_amount NUMERIC(12,2),
    insurance_amount    NUMERIC(12,2),
    revisit_avg         NUMERIC(3,2),
    cost_total          NUMERIC(12,2),
    income_total        NUMERIC(12,2),
    net_income          NUMERIC(12,2),
    renewal_suggestion  TEXT,
    summary             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 批次全景时间线视图：把同一认养批次的全链路事件串起来
CREATE OR REPLACE VIEW v_batch_timeline AS
SELECT b.id AS batch_id, fl.occurred_at AS ts, 'farm_log' AS kind, fl.title AS title,
       fl.content AS detail, fl.type AS sub_type, NULL::bigint AS ref_id
FROM batches b JOIN farm_logs fl ON fl.batch_id = b.id
UNION ALL
SELECT b.id, d.occurred_at, 'disaster',
       CASE d.type WHEN 'hail' THEN '冰雹灾害' WHEN 'frost' THEN '霜冻' WHEN 'drought' THEN '干旱'
                   WHEN 'flood' THEN '洪涝' WHEN 'pest' THEN '病虫害' WHEN 'windstorm' THEN '大风' ELSE '其他灾害' END,
       d.description, d.type, d.id
FROM batches b JOIN disasters d ON d.batch_id = b.id
UNION ALL
SELECT b.id, mi.inspected_at, 'inspection',
       '成熟度抽检（成熟' || mi.mature_pct || '%，坏果率' || mi.bad_fruit_pct || '%）',
       COALESCE(mi.note,''), 'maturity', mi.id
FROM batches b JOIN maturity_inspections mi ON mi.batch_id = b.id
UNION ALL
SELECT b.id, hr.picked_at, 'harvest',
       '采摘 ' || hr.picked_kg || ' 公斤（坏果 ' || hr.bad_kg || ' 公斤）',
       COALESCE(hr.note,''), 'pick', hr.id
FROM batches b JOIN harvest_records hr ON hr.batch_id = b.id
UNION ALL
SELECT b.id, s.sorted_at, 'sorting',
       '分拣包装 ' || s.boxes || ' 箱（优' || s.grade_a_kg || 'kg/次' || s.grade_b_kg || 'kg）',
       COALESCE(s.note,''), 'pack', s.id
FROM batches b JOIN sortings s ON s.batch_id = b.id
UNION ALL
SELECT b.id, COALESCE(sh.shipped_at, sh.created_at), 'shipment',
       '发货第 ' || sh.seq || ' 批 ' || sh.qty_kg || ' 公斤【' || sh.status || '】',
       COALESCE(sh.carrier,'') || ' ' || COALESCE(sh.tracking_no,'') || ' ' || COALESCE(sh.address,''),
       sh.status, sh.id
FROM batches b JOIN shipments sh ON sh.batch_id = b.id
UNION ALL
SELECT b.id, t.created_at, 'ticket',
       '工单：' || t.title, t.description, t.type, t.id
FROM batches b JOIN tickets t ON t.batch_id = b.id
UNION ALL
SELECT b.id, c.created_at, 'compensation',
       '赔付：' || c.type || ' ' || c.amount || ' 元', COALESCE(c.reason,''), c.status, c.id
FROM batches b JOIN compensations c ON c.batch_id = b.id
UNION ALL
SELECT b.id, ins.created_at, 'insurance',
       '保险理赔 ' || ins.policy_no || ' ' || ins.amount || ' 元【' || ins.status || '】',
       COALESCE(ins.note,''), ins.status, ins.id
FROM batches b JOIN insurance_claims ins ON ins.batch_id = b.id
UNION ALL
SELECT b.id, rs.created_at, 'revisit',
       '回访满意度 ' || rs.satisfaction || ' 星' || CASE WHEN rs.renew_intent THEN '（愿续认）' ELSE '' END,
       COALESCE(rs.comment,''), 'survey', rs.id
FROM batches b JOIN revisit_surveys rs ON rs.batch_id = b.id;
