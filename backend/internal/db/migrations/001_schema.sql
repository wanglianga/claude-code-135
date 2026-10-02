-- 农产品众筹认养配送与成熟度回访平台 · 数据库结构
-- 设计要点：每个认养项目按季节生成 batch_no（认养批次号），
-- 农事日志 / 灾害 / 成熟度抽检 / 采摘 / 分拣 / 发货 / 异常工单 /
-- 赔付 / 回访 / 结算 全部挂在同一 project_id + batch_no 上，串成完整链路。

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    phone         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('farmer','adopter','picker','packer','logistics','service','admin')),
    farm_id       BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farms (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    owner_id    BIGINT REFERENCES users(id),
    location    TEXT NOT NULL,
    intro       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD CONSTRAINT users_farm_fk FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL;

-- 地块
CREATE TABLE IF NOT EXISTS plots (
    id        BIGSERIAL PRIMARY KEY,
    farm_id   BIGINT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,            -- 如：东坡3号果园
    area_mu   NUMERIC(8,2) NOT NULL DEFAULT 0,
    crop      TEXT NOT NULL,            -- 苹果/蓝莓/水稻/蔬菜/蜜源植物
    location  TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 认养项目（苹果树/蓝莓园/蜂蜜/稻田/有机蔬菜）
CREATE TABLE IF NOT EXISTS projects (
    id               BIGSERIAL PRIMARY KEY,
    farm_id          BIGINT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    plot_id          BIGINT NOT NULL REFERENCES plots(id),
    batch_no         TEXT NOT NULL,                 -- 认养批次号，如 APPLE-2026-A
    kind             TEXT NOT NULL CHECK (kind IN ('apple','blueberry','honey','rice','vegetable')),
    title            TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    unit_name        TEXT NOT NULL DEFAULT '份',
    total_shares     INT NOT NULL DEFAULT 100,
    sold_shares      INT NOT NULL DEFAULT 0,
    price_per_share  NUMERIC(10,2) NOT NULL,
    guarantee_kg     NUMERIC(8,2) NOT NULL DEFAULT 0,   -- 每份额保底产量（公斤），用于权益兑现核对
    est_mature_date  DATE,
    harvest_standard TEXT NOT NULL DEFAULT '',       -- 采摘标准（糖度/果径/成熟度）
    delivery_range   TEXT NOT NULL DEFAULT '',       -- 配送范围
    rights_text      TEXT NOT NULL DEFAULT '',       -- 认养人权益
    is_charity       BOOLEAN NOT NULL DEFAULT FALSE, -- 公益认养
    insurance_policy TEXT NOT NULL DEFAULT '',       -- 保险保单号
    status           TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','harvesting','completed')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (farm_id, batch_no)
);

-- 农事日志（含施肥、用药、天气灾害、农事照片）
CREATE TABLE IF NOT EXISTS farm_logs (
    id               BIGSERIAL PRIMARY KEY,
    project_id       BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    batch_no         TEXT NOT NULL,
    author_id        BIGINT REFERENCES users(id),
    log_type         TEXT NOT NULL CHECK (log_type IN ('farming','fertilizer','pesticide','disaster','photo','other')),
    title            TEXT NOT NULL,
    content          TEXT NOT NULL DEFAULT '',
    photos           JSONB NOT NULL DEFAULT '[]',
    disaster_kind    TEXT NOT NULL DEFAULT '',       -- 冰雹/连阴雨/倒春寒/干旱...
    yield_impact_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 认养订单（支持企业团购）
CREATE TABLE IF NOT EXISTS adoptions (
    id            BIGSERIAL PRIMARY KEY,
    project_id    BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    batch_no      TEXT NOT NULL,
    user_id       BIGINT NOT NULL REFERENCES users(id),
    shares        INT NOT NULL,
    unit_price    NUMERIC(10,2) NOT NULL,
    amount        NUMERIC(12,2) NOT NULL,
    is_corporate  BOOLEAN NOT NULL DEFAULT FALSE,
    company_name  TEXT NOT NULL DEFAULT '',
    recipient_name TEXT NOT NULL,
    phone         TEXT NOT NULL,
    address       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','shipping','completed','refunded')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 成熟度抽检
CREATE TABLE IF NOT EXISTS maturity_checks (
    id             BIGSERIAL PRIMARY KEY,
    project_id     BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    batch_no       TEXT NOT NULL,
    inspector_id   BIGINT REFERENCES users(id),
    brix           NUMERIC(5,2),                      -- 糖度
    sample_count   INT NOT NULL DEFAULT 0,
    maturity_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,   -- 成熟度 %
    est_yield_kg   NUMERIC(10,2) NOT NULL DEFAULT 0,  -- 预估产量
    grade_dist     JSONB NOT NULL DEFAULT '{}',       -- 果品大小分级 {large:..,mid:..,small:..}
    bad_rate_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,   -- 抽检坏果率
    notes          TEXT NOT NULL DEFAULT '',
    checked_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 采摘任务（按成熟度、订单优先级）
CREATE TABLE IF NOT EXISTS harvest_tasks (
    id            BIGSERIAL PRIMARY KEY,
    project_id    BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    batch_no      TEXT NOT NULL,
    plot_id       BIGINT REFERENCES plots(id),
    picker_id     BIGINT REFERENCES users(id),
    priority      INT NOT NULL DEFAULT 100,           -- 订单优先级，越小越优先
    planned_date  DATE NOT NULL,
    target_kg     NUMERIC(10,2) NOT NULL DEFAULT 0,
    actual_kg     NUMERIC(10,2),
    bad_rate_pct  NUMERIC(5,2),
    status        TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','picking','done')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 分拣记录（包装规格、果品分级）
CREATE TABLE IF NOT EXISTS sorting_records (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    batch_no    TEXT NOT NULL,
    packer_id   BIGINT REFERENCES users(id),
    spec        TEXT NOT NULL,                        -- 精品大果/标准中果/实惠小果/残次
    weight_kg   NUMERIC(10,2) NOT NULL DEFAULT 0,
    box_count   INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 分批发货计划与运单（冷链路线、坏果率）
CREATE TABLE IF NOT EXISTS shipments (
    id               BIGSERIAL PRIMARY KEY,
    project_id       BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    adoption_id      BIGINT REFERENCES adoptions(id) ON DELETE SET NULL,
    batch_no         TEXT NOT NULL,
    seq              INT NOT NULL DEFAULT 1,           -- 第几批发货
    plan_date        DATE,
    pack_spec        TEXT NOT NULL DEFAULT '',
    cold_route       TEXT NOT NULL DEFAULT '',         -- 冷链路线
    weight_kg        NUMERIC(10,2),
    status           TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','picked','packed','shipped','delivered')),
    logistics_company TEXT NOT NULL DEFAULT '',
    tracking_no      TEXT NOT NULL DEFAULT '',
    bad_fruit_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,
    operator_id      BIGINT REFERENCES users(id),
    shipped_at       TIMESTAMPTZ,
    delivered_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 异常工单：冰雹减产/成熟延后/改地址/果品不均/坏果投诉/分批争议/权益与产量不一致
CREATE TABLE IF NOT EXISTS incidents (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    batch_no     TEXT NOT NULL,
    adoption_id  BIGINT REFERENCES adoptions(id) ON DELETE SET NULL,
    kind         TEXT NOT NULL CHECK (kind IN (
                     'hail','delay','address_change','size_uneven',
                     'bad_fruit','delivery_dispute','rights_mismatch','insurance','other')),
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','processing','resolved','compensated')),
    reporter_id  BIGINT REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at  TIMESTAMPTZ
);

-- 工单处理流水：农场 / 认养人 / 采摘工 / 包装员 / 物流 / 客服 在同一工单上的处理结果
CREATE TABLE IF NOT EXISTS incident_events (
    id          BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    actor_id    BIGINT REFERENCES users(id),
    actor_role  TEXT NOT NULL,                         -- farmer/adopter/picker/packer/logistics/service
    action      TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 赔付（含保险理赔到账、补发、下一季抵扣）
CREATE TABLE IF NOT EXISTS compensations (
    id           BIGSERIAL PRIMARY KEY,
    incident_id  BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    adoption_id  BIGINT REFERENCES adoptions(id) ON DELETE SET NULL,
    project_id   BIGINT REFERENCES projects(id),
    amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
    kind         TEXT NOT NULL CHECK (kind IN ('cash','reship','insurance','credit')),
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
    note         TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at      TIMESTAMPTZ
);

-- 保险理赔
CREATE TABLE IF NOT EXISTS insurance_claims (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    batch_no    TEXT NOT NULL,
    policy_no   TEXT NOT NULL,
    kind        TEXT NOT NULL,                         -- 冰雹/自然灾害...
    loss_kg     NUMERIC(10,2) NOT NULL DEFAULT 0,
    amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','surveying','approved','settled','rejected')),
    note        TEXT NOT NULL DEFAULT '',
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at  TIMESTAMPTZ
);

-- 成熟度回访
CREATE TABLE IF NOT EXISTS callbacks (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    adoption_id     BIGINT NOT NULL REFERENCES adoptions(id) ON DELETE CASCADE,
    satisfaction    INT NOT NULL CHECK (satisfaction BETWEEN 1 AND 5),
    quality_score   INT NOT NULL CHECK (quality_score BETWEEN 1 AND 5),
    delivery_score  INT NOT NULL CHECK (delivery_score BETWEEN 1 AND 5),
    would_renew     BOOLEAN NOT NULL DEFAULT FALSE,
    comment         TEXT NOT NULL DEFAULT '',
    renew_suggestion TEXT NOT NULL DEFAULT '',          -- 下一季续认建议
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 认养证书
CREATE TABLE IF NOT EXISTS certificates (
    id          BIGSERIAL PRIMARY KEY,
    adoption_id BIGINT NOT NULL UNIQUE REFERENCES adoptions(id) ON DELETE CASCADE,
    cert_no     TEXT NOT NULL UNIQUE,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 农场直播
CREATE TABLE IF NOT EXISTS live_streams (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    farm_id     BIGINT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    stream_url  TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
    starts_at   TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 地块参观预约
CREATE TABLE IF NOT EXISTS visits (
    id         BIGSERIAL PRIMARY KEY,
    plot_id    BIGINT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
    user_id    BIGINT REFERENCES users(id),
    visit_date DATE NOT NULL,
    visitors   INT NOT NULL DEFAULT 1,
    status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','finished','canceled')),
    note       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 企业团购
CREATE TABLE IF NOT EXISTS group_buys (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    contact      TEXT NOT NULL,
    phone        TEXT NOT NULL,
    shares       INT NOT NULL,
    discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','fulfilled','canceled')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 公益认养
CREATE TABLE IF NOT EXISTS charity_adoptions (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    donor_name  TEXT NOT NULL,
    shares      INT NOT NULL,
    donee       TEXT NOT NULL,                        -- 受益方（敬老院/希望小学...）
    message     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 地块成本台账（农事投入/灾害/采摘/分拣/物流/赔付）
CREATE TABLE IF NOT EXISTS plot_costs (
    id         BIGSERIAL PRIMARY KEY,
    plot_id    BIGINT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    season     TEXT NOT NULL,
    cost_type  TEXT NOT NULL CHECK (cost_type IN ('input','disaster','harvest','sorting','logistics','compensation')),
    item       TEXT NOT NULL,
    amount     NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 最终交付 / 季度结算
CREATE TABLE IF NOT EXISTS settlements (
    id                BIGSERIAL PRIMARY KEY,
    project_id        BIGINT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    batch_no          TEXT NOT NULL,
    total_yield_kg    NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_shipped_kg  NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_sales       NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_compensation NUMERIC(12,2) NOT NULL DEFAULT 0,
    avg_satisfaction  NUMERIC(3,2),
    renew_rate_pct    NUMERIC(5,2),
    summary           TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 会话
CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_farm ON projects(farm_id);
CREATE INDEX IF NOT EXISTS idx_adoptions_user ON adoptions(user_id);
CREATE INDEX IF NOT EXISTS idx_adoptions_project ON adoptions(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_project ON farm_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_shipments_batch ON shipments(project_id, batch_no);
CREATE INDEX IF NOT EXISTS idx_incidents_batch ON incidents(project_id, batch_no);
