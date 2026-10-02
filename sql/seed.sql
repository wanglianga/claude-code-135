-- 演示种子数据（可重复执行）
-- 所有账号密码均为 farm123456

-- users 与 farms 存在循环外键，先插 users(farm_id 留空)，再插 farms，最后回填
INSERT INTO users (id, username, password_hash, name, phone, role) VALUES
(1,'farmer1','$2a$10$YiaWlMJNXSc63O8jktuEuefu/N6I99Jq2dxhzOG4sTyzjXEQG.G.6','老王（农场主）','13800000001','farmer'),
(2,'buyer1','$2a$10$YiaWlMJNXSc63O8jktuEuefu/N6I99Jq2dxhzOG4sTyzjXEQG.G.6','张小明（认养人）','13900000002','buyer'),
(3,'buyer2','$2a$10$YiaWlMJNXSc63O8jktuEuefu/N6I99Jq2dxhzOG4sTyzjXEQG.G.6','李华（企业采购）','13900000003','buyer'),
(4,'picker1','$2a$10$YiaWlMJNXSc63O8jktuEuefu/N6I99Jq2dxhzOG4sTyzjXEQG.G.6','赵大山（采摘工）','13700000004','picker'),
(5,'packer1','$2a$10$YiaWlMJNXSc63O8jktuEuefu/N6I99Jq2dxhzOG4sTyzjXEQG.G.6','钱晓梅（包装员）','13600000005','packer'),
(6,'logistics1','$2a$10$YiaWlMJNXSc63O8jktuEuefu/N6I99Jq2dxhzOG4sTyzjXEQG.G.6','孙速达（冷链物流）','13500000006','logistics'),
(7,'cs1','$2a$10$YiaWlMJNXSc63O8jktuEuefu/N6I99Jq2dxhzOG4sTyzjXEQG.G.6','周小暖（客服）','13400000007','cs'),
(8,'admin1','$2a$10$YiaWlMJNXSc63O8jktuEuefu/N6I99Jq2dxhzOG4sTyzjXEQG.G.6','平台管理员','13300000008','admin'),
(9,'buyer3','$2a$10$YiaWlMJNXSc63O8jktuEuefu/N6I99Jq2dxhzOG4sTyzjXEQG.G.6','王芳（老认养人）','13900000009','buyer')
ON CONFLICT DO NOTHING;

INSERT INTO farms (id, name, owner_id, location, description) VALUES
(1, '阳光山谷生态农场', 1, '山东省烟台市栖霞市', '北纬37度苹果黄金产区，十年坚持生态种植，开放地块直播与参观')
ON CONFLICT DO NOTHING;

UPDATE users SET farm_id = 1 WHERE id IN (1,4,5,6,7);

INSERT INTO plots (id, farm_id, code, name, area_mu, crop_type) VALUES
(1,1,'A-01','红富士苹果园',20,'apple'),
(2,1,'B-02','高山蓝莓坡',8,'blueberry'),
(3,1,'C-03','土蜂场',5,'honey'),
(4,1,'D-04','富硒稻田',30,'rice'),
(5,1,'E-05','有机菜园',10,'vegetable')
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, farm_id, plot_id, name, category, total_shares, price_per_share, unit_per_share, unit,
  est_mature_date, harvest_standard, delivery_range, rights_text, status) VALUES
(1,1,1,'烟台红富士苹果树认养','apple',10,298.00,15,'公斤','2026-10-20',
 '糖度≥13，果径80mm以上，无霉烂、无机械伤；采后24小时内冷链发出',
 '顺丰冷链覆盖全国（港澳台及偏远地区除外）',
 '每份15公斤分级红富士；认养证书+树牌；全年农事日志可查；可参加1次地块采摘游；冰雹减产按比例赔付','active'),
(2,1,2,'高山蓝莓一株认养','blueberry',80,168.00,2,'公斤','2027-06-20',
 '果粉完整、果径14mm以上，采后0-4℃冷链','全国顺丰冷运','每份2公斤鲜果；开花/结果直播两次；认养证书','active'),
(3,1,3,'深山土蜂蜜一箱认养','honey',120,128.00,2.5,'公斤','2026-11-10',
 '波美度≥41，自然成熟封盖蜜，48小时内灌装','全国快递包邮','每份2.5公斤封盖土蜂蜜；可查看取蜜直播；认养证书','active'),
(4,1,4,'富硒水稻一分田认养','rice',60,399.00,25,'公斤','2026-10-25',
 '当季新米，无抛光打蜡，硒含量≥0.04mg/kg','全国快递包邮','每份25公斤新米；可定制米袋冠名；秋收开放参观','active'),
(5,1,5,'有机蔬菜全年套餐认养','vegetable',90,599.00,60,'公斤','2026-12-31',
 '有机标准种植，无化学农药，采收后8小时内冷链配出','烟台及周边200公里，月度配送','全年12次共60公斤应季有机菜；每次配送附农事卡；可亲子采摘2次','active')
ON CONFLICT DO NOTHING;

INSERT INTO batches (id, project_id, code, shares_total, shares_sold, est_mature_date, status, note) VALUES
(1,1,'B2025-APL-01',10,5,'2025-10-18','completed','上季批次：完整闭环样板'),
(2,1,'B2026-APL-02',10,4,'2026-10-20','delivering','本季批次：9月遭遇冰雹，边采摘边处理纠纷'),
(3,2,'B2026-BLU-01',80,30,'2027-06-20','growing',NULL),
(4,3,'B2026-HON-01',120,55,'2026-11-10','growing',NULL),
(5,4,'B2026-RIC-01',60,40,'2026-10-25','growing',NULL),
(6,5,'B2026-VEG-01',90,72,'2026-12-31','growing',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO orders (id, batch_id, buyer_id, shares, amount, status, receiver_name, receiver_phone, address, cert_no, paid_at) VALUES
(1,1,2,2,596.00,'completed','张小明','13900000002','北京市朝阳区建国路88号','CERT-2025-0001','2025-04-10 09:00+08'),
(2,1,3,1,298.00,'completed','李华','13900000003','上海市浦东新区张江高科技园区','CERT-2025-0002','2025-04-12 10:30+08'),
(3,1,9,2,596.00,'completed','王芳','13900000009','广州市天河区体育西路12号','CERT-2025-0003','2025-04-15 14:00+08'),
(4,2,2,1,298.00,'partial_shipped','张小明','13900000002','北京市朝阳区建国路88号','CERT-2026-0101','2026-04-08 09:00+08'),
(5,2,3,3,894.00,'partial_shipped','李华','13900000003','上海市浦东新区张江高科技园区博云路2号','CERT-2026-0102','2026-04-09 11:00+08'),
(6,3,2,1,168.00,'paid','张小明','13900000002','北京市朝阳区建国路88号',NULL,'2026-03-01 09:00+08'),
(7,4,3,2,256.00,'paid','李华','13900000003','上海市浦东新区张江高科技园区博云路2号',NULL,'2026-05-11 15:00+08'),
(8,5,2,1,399.00,'paid','张小明','13900000002','北京市朝阳区建国路88号',NULL,'2026-05-20 16:00+08'),
(9,6,2,1,599.00,'paid','张小明','13900000002','北京市朝阳区建国路88号',NULL,'2026-01-05 10:00+08')
ON CONFLICT DO NOTHING;

-- ===== 上季批次 B2025-APL-01：完整生命周期 =====
INSERT INTO farm_logs (batch_id, author_id, type, title, content, photo_urls, occurred_at) VALUES
(1,1,'fertilizer','春季有机肥','每株施腐熟羊粪20斤+豆粕5斤，有机认证投入品台账已上传','["spring-fert-1.jpg"]','2025-03-18 09:30+08'),
(1,1,'farming','疏花疏果','每棵树保留中心果约180个，控制负载保证果个','["thin-1.jpg"]','2025-04-28 10:00+08'),
(1,1,'pesticide','用药记录','喷施苦参碱+石硫合剂（生物源农药），安全间隔期20天','[]','2025-05-06 08:00+08'),
(1,1,'photo','套袋完成','全园果实完成双层纸袋套袋，照片见附件','["bag-1.jpg","bag-2.jpg"]','2025-06-12 16:00+08'),
(1,1,'weather','冰雹橙色预警后巡园','10月2日局地冰雹，A-01地块防雹网挡住大部分，外围两排有约10%果面碰伤','["hail-1.jpg"]','2025-10-02 20:00+08');

INSERT INTO disasters (id, batch_id, type, occurred_at, description, yield_impact_pct, mature_delay_days, status) VALUES
(1,1,'hail','2025-10-02 19:40+08','局地冰雹持续约8分钟，防雹网覆盖区影响较小，外围两排减产约10%',10,0,'settled'),
(2,2,'hail','2026-09-12 16:20+08','强对流冰雹持续15分钟，部分防雹网破损，预估减产25%，成熟时间延后约7天',25,7,'claiming');

INSERT INTO maturity_inspections (batch_id, inspector_id, sample_count, mature_pct, grade_a_pct, bad_fruit_pct, sugar_brix, est_yield_kg, inspected_at, note) VALUES
(1,1,50,92.0,72.2,4.2,14.6,72.0,'2025-10-15 10:00+08','抽50个果实测：着色好，糖度理想，建议10月18日开采'),
(2,4,60,78.0,68.0,7.5,12.8,135.0,'2026-09-28 10:00+08','冰雹后第二批果成熟偏慢，建议延后7天，先采阳面行');

INSERT INTO harvest_plans (id, batch_id, planned_date, priority_rule, packaging_spec, cold_chain_route, target_bad_rate, status) VALUES
(1,1,'2025-10-18','付款时间先后+受灾地区优先','5斤装泡沫托+天地盖纸箱，外箱贴认养证书二维码','烟台冷库→潍坊分拨→全国，全程2-8℃',5.0,'done'),
(2,2,'2026-10-05','已投诉订单优先；老认养人优先','同上规格；坏果拍照批次留样','烟台冷库→青岛港分拨→全国，全程2-8℃',6.0,'in_progress');

INSERT INTO harvest_records (batch_id, plan_id, picker_id, picked_kg, bad_kg, work_hours, picked_at, note) VALUES
(1,1,4,40.0,2.0,8,'2025-10-18 17:00+08','阳面行先采'),
(1,1,4,32.0,1.0,7,'2025-10-19 17:00+08','收尾采摘，实产72公斤低于认养总量75公斤'),
(2,2,4,30.0,3.5,6,'2026-09-30 17:00+08','第一批：优先发张小明订单'),
(2,2,4,20.0,1.5,4,'2026-10-01 11:00+08','第二批采摘进行中');

INSERT INTO sortings (batch_id, packer_id, grade_a_kg, grade_b_kg, bad_kg, boxes, box_spec, sorted_at, note) VALUES
(1,5,52.0,17.0,3.0,5,'5斤装/箱，优果在上','2025-10-19 20:00+08','坏果当场挑出拍照留档'),
(2,5,36.0,9.0,5.0,3,'5斤装/箱','2026-09-30 21:00+08','冰雹果面碰伤果列入B级，不发给认养人');

INSERT INTO shipments (id, batch_id, order_id, logistics_id, carrier, tracking_no, qty_kg, boxes, cold_chain_temp, receiver_name, receiver_phone, address, seq, status, shipped_at, delivered_at) VALUES
(1,1,1,6,'顺丰冷运','SF2025101801',18.0,2,4.0,'张小明','13900000002','北京市朝阳区建国路88号',1,'delivered','2025-10-18 22:00+08','2025-10-20 11:00+08'),
(2,1,1,6,'顺丰冷运','SF2025101901',9.0,1,4.0,'张小明','13900000002','北京市朝阳区建国路88号',2,'delivered','2025-10-19 22:00+08','2025-10-21 10:30+08'),
(3,1,2,6,'顺丰冷运','SF2025101902',15.0,1,4.0,'李华','13900000003','上海市浦东新区张江高科技园区',1,'delivered','2025-10-19 22:30+08','2025-10-21 14:00+08'),
(4,1,3,6,'顺丰冷运','SF2025101903',20.0,2,4.0,'王芳','13900000009','广州市天河区体育西路12号',1,'delivered','2025-10-19 22:30+08','2025-10-22 09:00+08'),
(5,1,3,6,'顺丰冷运','SF2025102001',7.0,0,4.0,'王芳','13900000009','广州市天河区体育西路12号',2,'delivered','2025-10-20 18:00+08','2025-10-22 16:00+08'),
-- 本季批次
(6,2,4,6,'顺丰冷运','SF2026093001',8.0,1,5.0,'张小明','13900000002','北京市朝阳区建国路88号',1,'in_transit','2026-09-30 21:00+08',NULL),
(7,2,5,6,'顺丰冷运','SF2026100101',10.0,1,5.0,'李华','13900000003','上海市浦东新区陆家嘴环路1000号（临时改址）',1,'in_transit','2026-10-01 09:00+08',NULL);
UPDATE shipments SET address_changed = TRUE WHERE id = 7;

-- 上季：权益与实际产量不一致（冰雹），多角色处理，赔付+保险闭环
INSERT INTO tickets (id, batch_id, order_id, type, title, description, raised_by, status, created_at, resolved_at) VALUES
(1,1,3,'rights_mismatch','实收27公斤，比认养权益30公斤少3公斤','王芳反馈两批合计收到27公斤，与每份15公斤×2份不符',9,'resolved','2025-10-23 09:00+08','2025-10-25 17:00+08'),
(2,2,5,'address_change','发货前临时改地址','李华来电要求第一批改寄至陆家嘴环路1000号',3,'resolved','2026-09-30 18:00+08','2026-10-01 09:30+08'),
(3,2,4,'bad_fruit','收到的第一箱有3个碰伤果','张小明上传照片：3个苹果有指甲盖大小碰伤，质疑冰雹果混入',2,'processing','2026-10-01 13:00+08',NULL),
(4,2,5,'dispatch_dispute','企业订单要求3份一次性发出，农场坚持分批','李华认为分批发货增加签收成本，要求一次性发齐45公斤',3,'open','2026-10-01 14:00+08',NULL);

INSERT INTO ticket_events (ticket_id, actor_id, actor_role, action, result, created_at) VALUES
(1,9,'buyer','提交短收反馈并附称重照片','客服建单，标记 rights_mismatch','2025-10-23 09:05+08'),
(1,7,'cs','核对发货台账与分拣记录','确认实发27公斤；分拣记录坏果3公斤，冰雹导致总产72<75','2025-10-23 11:00+08'),
(1,4,'picker','复核采摘过磅单','两采合计72公斤属实，签字确认','2025-10-24 09:00+08'),
(1,5,'packer','复核分拣台账','优52/次17/坏3，坏果未发出，留存照片','2025-10-24 10:00+08'),
(1,1,'farmer','确认按比例赔付方案','短少6公斤（两户各3公斤）按19.87元/公斤退款，并优先续认','2025-10-24 15:00+08'),
(1,6,'logistics','确认运输无短少','两程冷链签收重量无异常','2025-10-25 09:00+08'),
(1,7,'cs','执行赔付并回访确认','退款119.20元已到账，客户接受，工单关闭','2025-10-25 17:00+08'),
(2,3,'buyer','申请临时改地址','新地址：陆家嘴环路1000号','2026-09-30 18:05+08'),
(2,7,'cs','审核并流转物流','订单未出库，同意免费改址一次','2026-09-30 18:20+08'),
(2,6,'logistics','拦截改址成功','面单已更换，新轨迹 SF2026100101，标记 address_changed','2026-10-01 09:30+08'),
(3,2,'buyer','上传坏果照片3张','坏果率约8%，要求解释并补发','2026-10-01 13:10+08'),
(3,7,'cs','建单并发起三方核查','同步包装员与农场，坏果批次留样比对','2026-10-01 13:30+08'),
(3,5,'packer','留样比对','装箱照片显示该果无外伤，碰伤疑为运输挤压','2026-10-01 15:00+08'),
(4,3,'buyer','发起分批争议','要求企业订单一次性发齐，减少前台三次签收','2026-10-01 14:05+08'),
(4,7,'cs','已联系农场评估','待农场确认剩余成熟量后回复','2026-10-01 14:30+08');

INSERT INTO compensations (id, ticket_id, batch_id, order_id, type, amount, qty_kg, reason, status, decided_by, created_at, settled_at) VALUES
(1,1,1,3,'refund',119.20,0,'冰雹导致总产不足，两户各短3公斤，按购果单价退款（含另一户3公斤一并结算）','paid',1,'2025-10-24 16:00+08','2025-10-25 17:00+08'),
(2,3,2,4,'reissue',0,3.0,'第一箱3个碰伤果，待责任认定后补发3公斤优级果','pending',7,'2026-10-01 16:00+08',NULL);

INSERT INTO insurance_claims (id, batch_id, disaster_id, policy_no, amount, status, evidence, note, created_at, settled_at) VALUES
(1,1,1,'POL-2025-HAIL-091',300.00,'paid','["hail-1.jpg","yield-report.pdf","weigh-slip.jpg"]','气象证明+减产台账，保险7个工作日赔付到账','2025-10-08 10:00+08','2025-10-16 10:00+08'),
(2,2,2,'POL-2026-HAIL-037',600.00,'surveying','["hail-2026.jpg"]','已报案，查勘员预计10月3日到场，按25%减产预估','2026-09-13 10:00+08',NULL);

INSERT INTO certificates (order_id, cert_no, rights_summary, issued_at) VALUES
(1,'CERT-2025-0001','红富士苹果树2份，应得30公斤，含地块参观与续认优先权','2025-04-10 09:05+08'),
(2,'CERT-2025-0002','红富士苹果树1份，应得15公斤','2025-04-12 10:35+08'),
(3,'CERT-2025-0003','红富士苹果树2份，应得30公斤','2025-04-15 14:05+08'),
(4,'CERT-2026-0101','2026季红富士1份，应得15公斤，含一次采摘游','2026-04-08 09:05+08'),
(5,'CERT-2026-0102','2026季红富士企业团购3份，应得45公斤','2026-04-09 11:05+08'),
(6,'CERT-2026-0103','高山蓝莓1份，应得2公斤，含两场花果直播','2026-03-01 09:05+08'),
(7,'CERT-2026-0104','深山土蜂蜜2份，应得5公斤封盖蜜','2026-05-11 15:05+08'),
(8,'CERT-2026-0105','富硒水稻1份，应得25公斤新米，秋收可参观','2026-05-20 16:05+08'),
(9,'CERT-2026-0106','有机蔬菜全年套餐1份，12次共60公斤，含亲子采摘2次','2026-01-05 10:05+08')
ON CONFLICT (order_id) DO NOTHING;

UPDATE orders SET cert_no = sub.cert_no
FROM (VALUES (6,'CERT-2026-0103'),(7,'CERT-2026-0104'),(8,'CERT-2026-0105'),(9,'CERT-2026-0106')) AS sub(oid, cert_no)
WHERE orders.id = sub.oid AND orders.cert_no IS NULL;

INSERT INTO live_streams (farm_id, batch_id, title, url, status, started_at) VALUES
(1,2,'红富士采摘季·清晨入园直播','/live/farm1-apple','live','2026-10-01 07:00+08'),
(1,3,'蓝莓花芽期巡园（预告）','/live/farm1-blueberry','scheduled','2026-10-08 09:00+08'),
(1,1,'2025季取蜜+苹果采收回顾','/live/farm1-2025','ended','2025-10-18 08:00+08');

INSERT INTO visits (id, plot_id, visit_date, capacity, booked_count, note) VALUES
(1,1,'2026-10-05',20,1,'苹果采摘体验日，农场提供午餐与冷链代寄'),
(2,2,'2027-05-20',30,0,'蓝莓花期参观'),
(3,4,'2026-10-25',25,0,'开镰节·新米品尝');
INSERT INTO visit_bookings (visit_id, user_id, people) VALUES
(1,2,2)
ON CONFLICT DO NOTHING;

INSERT INTO group_buys (project_id, company_name, contact, phone, shares, discount_pct, status) VALUES
(1,'某互联网科技公司工会','李华','13900000003',20,5.00,'pending'),
(4,'某银行烟台分行','行政部','13800001111',30,8.00,'confirmed');

INSERT INTO charity_adoptions (project_id, donor_name, shares, beneficiary, message) VALUES
(5,'禾下公益基金会',10,'幸福养老院','应季有机菜按月直送养老院厨房'),
(1,'阳光山谷业主委员会',2,'村里留守儿童书屋','苹果成熟后组织孩子上山采摘');

INSERT INTO revisit_surveys (order_id, batch_id, buyer_id, satisfaction, fruit_score, delivery_score, service_score, renew_intent, comment, created_at) VALUES
(1,1,2,5,5,4,5,TRUE,'苹果很甜，退款处理很干脆，明年继续认养两棵','2025-10-28 10:00+08'),
(2,1,3,4,4,5,4,TRUE,'企业反馈不错，明年计划团购20份','2025-10-28 11:00+08'),
(3,1,9,5,4,5,5,TRUE,'少的3公斤退得明明白白，账都能查得到，放心','2025-10-28 15:00+08');

-- 地块完整账（上季）
INSERT INTO plot_costs (plot_id, batch_id, item, amount, occurred_at, note) VALUES
(1,1,'input',300.00,'2025-03-01','树苗折旧、防雹网维护'),
(1,1,'fertilizer',220.00,'2025-03-18','腐熟羊粪+豆粕'),
(1,1,'pesticide',90.00,'2025-05-06','苦参碱、石硫合剂'),
(1,1,'labor',350.00,'2025-10-19','采摘+分拣人工'),
(1,1,'packaging',120.00,'2025-10-19','泡沫托+纸箱+证书卡'),
(1,1,'logistics',180.00,'2025-10-20','全国冷链分摊'),
(1,1,'disaster_loss',60.00,'2025-10-02','冰雹碰伤果损失'),
(1,2,'input',310.00,'2026-03-01','本季投入累计中'),
(1,2,'fertilizer',230.00,'2026-03-20',NULL),
(1,2,'disaster_loss',150.00,'2026-09-12','冰雹预估损失（理赔中）');

INSERT INTO final_reports (batch_id, total_yield_kg, shipped_kg, bad_kg, compensation_amount, insurance_amount,
  revisit_avg, cost_total, income_total, net_income, renewal_suggestion, summary) VALUES
(1,72.0,69.0,3.0,119.20,300.00,4.67,1320.00,1490.00,470.00,
 '下季建议：1）4月前完成防雹网全覆盖，保险继续投保；2）总产按90%保守折算权益或预留3%机动果；3）对续认老客户9折并锁定树牌，本季3户回访均愿续认；4）企业团购（20份意向）提前锁定企业包装线。',
 '上季认养5份，实际采收72公斤（优52/次17/坏3），发货69公斤；冰雹造成3户短少共6公斤，已退款119.20元，保险赔付300元；3份回访满意度均值4.67，全部愿意续认。完整台账与多角色工单可在批次时间线逐笔追溯。');

-- 序列对齐显式ID
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT pg_get_serial_sequence(quote_ident(table_name), 'id') AS seq,
           quote_ident(table_name) AS tbl
    FROM information_schema.columns
    WHERE table_schema='public' AND column_name='id' AND column_default LIKE 'nextval%'
  LOOP
    EXECUTE format('SELECT setval(%L, (SELECT COALESCE(MAX(id),1) FROM %s), (SELECT COUNT(*)>0 FROM %s))',
      r.seq, r.tbl, r.tbl);
  END LOOP;
END $$;
