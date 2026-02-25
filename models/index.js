/**
 * 餐厅积分抽奖系统 V4.0 - 模型统一导出（V15.0 UUID角色系统版）
 * 清理了无效的模型引用，只保留实际存在的模型
 * V15.0更新：集成UUID角色系统（role_level >= 100 为管理员）
 */

const { Sequelize, DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

// 初始化模型对象
const models = {}

// 🔴 导入所有实际存在的数据模型
models.User = require('./User')(sequelize, DataTypes)
/*
 * ✅ User：用户基本信息（核心主键：user_id，唯一标识：mobile）
 *    - 包含：基本资料、积分累计、保底机制、状态管理
 *    - 权限管理：通过UUID角色系统（roles表关联，role_level >= 100 为管理员）
 */

// V15.0新增：UUID角色系统模型
models.Role = require('./Role')(sequelize, DataTypes)
models.UserRole = require('./UserRole')(sequelize, DataTypes)
/*
 * ✅ UserRole：用户与角色的多对多关联表
 *    - 用途：管理用户拥有哪些角色（如：admin、user等）
 *    - 特点：支持角色分配、激活状态管理、分配者追溯
 */

// 🔴 会话系统：两个不同的业务概念（注意区分）
models.AuthenticationSession = require('./AuthenticationSession')(sequelize, DataTypes)
/*
 * ✅ AuthenticationSession：用户认证会话（JWT Token生命周期管理）
 *    - 用途：管理用户登录状态和Token有效性
 *    - 特点：存储session_token、支持过期和失效管理、记录登录IP
 *    - 表名：authentication_sessions，主键：authentication_session_id
 *    - 业务场景：用户登录后生成Token、Token续期、退出登录时失效Token
 */

models.UserPremiumStatus = require('./UserPremiumStatus')(sequelize, DataTypes)
/*
 * ✅ UserPremiumStatus：用户高级空间状态（一对一关系）
 *    - 用途：管理用户高级空间解锁状态、解锁时间、过期时间
 *    - 特点：极简设计，无自动续费字段，降低维护成本60%
 *    - 表名：user_premium_status，主键：id，外键：user_id（唯一约束）
 *    - 业务场景：支付100积分解锁，有效期24小时，过期需重新手动解锁
 *    - 双重条件：history_total_points ≥ 100000（历史门槛） AND available_points ≥ 100（支付能力）
 */

// 🔴 多币种风控配置模型（2026-01-14 新增）
models.UserRiskProfile = require('./UserRiskProfile')(sequelize, DataTypes)
/*
 * ✅ UserRiskProfile：用户风控配置（多币种交易风控）
 *    - 用途：存储用户等级默认配置和个人自定义风控配置（日限次、日限额）
 *    - 特点：JSON可扩展的thresholds字段、支持账户冻结、优先级链（用户>等级>默认）
 *    - 表名：user_risk_profiles，主键：risk_profile_id，外键：user_id
 *    - 业务场景：多币种交易风控、用户等级阈值管理、账户冻结
 *    - 配置类型：level（等级默认配置）、user（用户个人配置）
 */

// 🔴 抽奖系统核心模型
models.LotteryCampaign = require('./LotteryCampaign')(sequelize, DataTypes)
models.LotteryPrize = require('./LotteryPrize')(sequelize, DataTypes)
models.LotteryDraw = require('./LotteryDraw')(sequelize, DataTypes)
models.LotteryPreset = require('./LotteryPreset')(sequelize, DataTypes)

// 🔴 统一抽奖架构新增模型（2026-01-18 - Pipeline架构升级）
models.LotteryTierRule = require('./LotteryTierRule')(sequelize, DataTypes)
/*
 * ✅ LotteryTierRule：抽奖档位规则表（整数权重制）
 *    - 用途：定义各分层用户的档位概率（支持tier_first选奖方法）
 *    - 特点：lottery_campaign_id + segment_key + tier_name 唯一约束，整数权重（SCALE=1,000,000）
 *    - 表名：lottery_tier_rules，主键：lottery_tier_rule_id
 *    - 业务场景：新用户高档位高概率、VIP用户专属档位配置
 */

models.LotteryDrawDecision = require('./LotteryDrawDecision')(sequelize, DataTypes)
/*
 * ✅ LotteryDrawDecision：抽奖决策快照表（审计核心）
 *    - 用途：记录每次抽奖的完整决策路径，支持问题排查和审计
 *    - 特点：1:1 关联 lottery_draws，记录pipeline_type、segment_key、selected_tier、随机数等
 *    - 表名：lottery_draw_decisions，主键：lottery_draw_decision_id，唯一约束：lottery_draw_id
 *    - 业务场景：抽奖结果复现、概率公平性审计、系统垫付追踪
 */

models.LotteryCampaignUserQuota = require('./LotteryCampaignUserQuota')(sequelize, DataTypes)
/*
 * ✅ LotteryCampaignUserQuota：活动用户配额表（pool_quota模式）
 *    - 用途：管理用户在pool_quota预算模式下的抽奖次数配额
 *    - 特点：remaining_quota（剩余次数）、total_granted（累计获得）、total_used（累计使用）
 *    - 表名：lottery_campaign_user_quota，主键：lottery_campaign_user_quota_id，唯一约束：lottery_campaign_id + user_id
 *    - 业务场景：用户消费获得配额→使用配额抽奖→配额耗尽无法抽奖
 */

models.LotteryCampaignQuotaGrant = require('./LotteryCampaignQuotaGrant')(sequelize, DataTypes)
/*
 * ✅ LotteryCampaignQuotaGrant：配额赠送记录表（流水审计）
 *    - 用途：记录配额的来源和流向，支持配额审计
 *    - 特点：grant_type区分来源（admin_grant/spending/activity/refund）
 *    - 表名：lottery_campaign_quota_grants，主键：grant_id
 *    - 业务场景：管理员赠送配额→消费自动发放配额→活动奖励配额
 */

models.LotteryCampaignPricingConfig = require('./LotteryCampaignPricingConfig').initModel(sequelize)
/*
 * ✅ LotteryCampaignPricingConfig：活动级定价配置表（版本化管理）
 *    - 用途：PricingStage的唯一定价真值来源，支持连抽定价配置
 *    - 特点：版本化管理（可回滚/可定时生效/多版本）、运营可动态调整 discount
 *    - 表名：lottery_campaign_pricing_config，主键：lottery_campaign_pricing_config_id，唯一约束：lottery_campaign_id + version
 *    - 业务场景：单抽/多连抽定价→折扣动态调整→AB测试→限时活动
 */

models.PresetInventoryDebt = require('./PresetInventoryDebt')(sequelize, DataTypes)
/*
 * ✅ PresetInventoryDebt：预设库存欠账表（系统垫付）
 *    - 用途：记录预设强制发放时因库存不足产生的欠账
 *    - 特点：debt_quantity（欠账数量）、cleared_quantity（已清偿）、status状态流转（pending/cleared/written_off）
 *    - 表名：preset_inventory_debt，主键：debt_id
 *    - 业务场景：预设发放库存不足→系统垫付→运营补货清偿
 */

models.PresetBudgetDebt = require('./PresetBudgetDebt')(sequelize, DataTypes)
/*
 * ✅ PresetBudgetDebt：预设预算欠账表（系统垫付）
 *    - 用途：记录预设强制发放时因预算不足产生的欠账
 *    - 特点：debt_source区分来源（user_budget/pool_budget/pool_quota）、debt_amount（欠账金额）、cleared_amount（已清偿）
 *    - 表名：preset_budget_debt，主键：debt_id
 *    - 业务场景：预设发放预算不足→系统垫付→运营充值清偿
 */

models.PresetDebtLimit = require('./PresetDebtLimit')(sequelize, DataTypes)
/*
 * ✅ PresetDebtLimit：预设欠账上限配置表（风控）
 *    - 用途：配置各级别（global/campaign/prize）的最大可容忍欠账额度，防止无限制垫付
 *    - 特点：limit_level（限制级别）、inventory_debt_limit（库存欠账上限）、budget_debt_limit（预算欠账上限）
 *    - 表名：preset_debt_limits，主键：limit_id，唯一约束：limit_level + reference_id
 *    - 业务场景：配置欠账上限→接近上限告警→超限拒绝预设发放
 */

models.LotteryManagementSetting = require('./LotteryManagementSetting')(sequelize, DataTypes)
/*
 * ✅ LotteryManagementSetting：抽奖管理设置（管理员抽奖干预）
 *    - 用途：存储管理员设置的抽奖干预规则（强制中奖、强制不中奖、概率调整、用户专属队列）
 *    - 特点：支持设置过期、状态管理、审计追溯
 *    - 表名：lottery_management_settings，主键：setting_id，外键：user_id、created_by
 *    - 业务场景：活动补偿、VIP特权、防刷保护、精准运营、测试验证
 */

// 🔴 抽奖次数配额控制系统（2025-12-23新增）
models.LotteryDrawQuotaRule = require('./LotteryDrawQuotaRule')(sequelize, DataTypes)
/*
 * ✅ LotteryDrawQuotaRule：抽奖次数配额规则表（规则层）
 *    - 用途：统一事实源，实现四维度（全局/活动/角色/用户）配额规则管理
 *    - 特点：优先级链（user > role > campaign > global）、生效期管理、状态管理
 *    - 表名：lottery_draw_quota_rules，主键：rule_id
 *    - 业务场景：管理员配置抽奖次数上限规则、客服补偿、风控限制
 */

models.LotteryUserDailyDrawQuota = require('./LotteryUserDailyDrawQuota')(sequelize, DataTypes)
/*
 * ✅ LotteryUserDailyDrawQuota：用户每日抽奖配额表（强一致扣减层）
 *    - 用途：原子操作避免并发窗口期问题，支持连抽场景
 *    - 特点：原子扣减（UPDATE ... WHERE）、配额初始化、临时补偿（bonus_draw_count）
 *    - 表名：lottery_user_daily_draw_quota，主键：lottery_user_daily_draw_quota_id，唯一索引：user_id + lottery_campaign_id + quota_date
 *    - 业务场景：抽奖前配额检查、原子扣减、连抽支持（10连抽一次扣减10次）
 */

// 🔴 物品分类字典表（ItemTemplate 的依赖）
models.CategoryDef = require('./CategoryDef')(sequelize, DataTypes)
/*
 * ✅ CategoryDef：物品类目字典
 *    - 用途：定义商品/物品的分类（如电子产品、餐饮美食、优惠券等）
 *    - 特点：标准化分类，支持前端筛选和分类展示
 *    - 表名：category_defs，主键：category_code（字符串主键）
 */

models.RarityDef = require('./RarityDef')(sequelize, DataTypes)
/*
 * ✅ RarityDef：物品稀有度字典
 *    - 用途：定义物品稀有度等级（如普通、稀有、史诗、传说等）
 *    - 特点：标准化稀有度定义，支持前端展示和筛选
 *    - 表名：rarity_defs，主键：rarity_code（字符串主键）
 */

models.AssetGroupDef = require('./AssetGroupDef')(sequelize, DataTypes)
/*
 * ✅ AssetGroupDef：资产组字典
 *    - 用途：定义资产分组（如积分组、物品组、货币组等）
 *    - 特点：标准化资产分组，支持市场和兑换业务
 *    - 表名：asset_group_defs，主键：group_code（字符串主键）
 */

models.ItemTemplate = require('./ItemTemplate')(sequelize, DataTypes)
/*
 * ✅ ItemTemplate：物品模板定义（物品分类元数据）
 *    - 用途：定义不可叠加物品的模板（名称、类目、稀有度、图片等）
 *    - 特点：为 Item 提供模板定义，市场挂牌分类筛选
 *    - 表名：item_templates，主键：item_template_id，唯一键：template_code
 */

// 🔴 从零三表模型（资产全链路追踪 — 2026-02-22）
models.Item = require('./Item')(sequelize, DataTypes)
/*
 * ✅ Item：物品（当前状态缓存，可从 item_ledger 重建）
 *    - 用途：不可叠加物品的一等实体
 *    - 特点：正式列（item_name/item_value/item_type）、tracking_code 唯一追踪码
 *    - 表名：items，主键：item_id，外键：owner_account_id
 *    - 状态流转：available → held → used/expired/destroyed
 */

models.ItemLedger = require('./ItemLedger')(sequelize, DataTypes)
/*
 * ✅ ItemLedger：物品所有权账本（唯一真相，双录记账）
 *    - 用途：双录记账（SUM(delta) 验证守恒）+ 审计日志 + 事件溯源
 *    - 特点：只追加不修改不删除，每次操作写出方(-1)+入方(+1)两条
 *    - 表名：item_ledger，主键：ledger_entry_id
 *    - 对账SQL：SELECT item_id, SUM(delta) FROM item_ledger GROUP BY item_id HAVING SUM(delta)!=0
 */

models.ItemHold = require('./ItemHold')(sequelize, DataTypes)
/*
 * ✅ ItemHold：物品锁定记录（替代 JSON locks，可索引可查询可审计）
 *    - 用途：记录物品锁定/解锁的完整历史
 *    - 特点：trade(3分钟)/redemption(30天)/security(无限期) 三种锁类型
 *    - 表名：item_holds，主键：hold_id，外键：item_id
 *    - 优先级：security(3) > redemption(2) > trade(1)
 */

// 🔴 管理和客服系统
models.CustomerServiceSession = require('./CustomerServiceSession')(sequelize, DataTypes)
/*
 * ✅ CustomerServiceSession：客服聊天会话（与AuthenticationSession完全不同的概念！）
 *    - 用途：管理用户与客服之间的聊天对话会话
 *    - 特点：会话状态（等待/分配/活跃/关闭）、客服分配、满意度评分
 *    - 表名：customer_service_sessions，主键：customer_service_session_id，外键：user_id、admin_id
 *    - 业务场景：用户发起咨询、客服接入、消息收发、会话关闭、满意度评价
 *    - ⚠️ 与AuthenticationSession的区别：CustomerServiceSession是聊天会话，AuthenticationSession是认证会话
 */

models.ChatMessage = require('./ChatMessage')(sequelize, DataTypes)
/*
 * ✅ ChatMessage：聊天消息
 *    - 用途：记录CustomerSession中的每条聊天消息
 *    - 特点：消息内容、发送者、发送时间、消息类型
 *    - 表名：chat_messages，外键：customer_service_session_id
 */

models.CustomerServiceAgent = require('./CustomerServiceAgent')(sequelize, DataTypes)
/*
 * ✅ CustomerServiceAgent：客服座席管理
 *    - 用途：记录哪些用户是客服座席、配置最大并发会话数、分配优先级、在岗状态
 *    - 特点：座席状态管理、自动分配配置、工作负载跟踪、满意度统计
 *    - 表名：customer_service_agents，主键：customer_service_agent_id，外键：user_id
 *    - 业务场景：管理员注册客服座席→配置并发上限→开启自动分配→监控工作负载
 */

models.CustomerServiceIssue = require('./CustomerServiceIssue')(sequelize, DataTypes)
/*
 * ✅ CustomerServiceIssue：客服工单（GM工作台问题跟踪）
 *    - 用途：客服聊天中发现的问题创建为工单，跨会话跨班次跟踪到底
 *    - 特点：8种问题类型（资产/交易/抽奖/物品/账号/消费/反馈/其他）、4种优先级、4种状态
 *    - 表名：customer_service_issues，主键：issue_id
 *    - 业务场景：聊天→创建工单→处理→解决→关闭，一个工单可关联多个会话
 */

models.CustomerServiceNote = require('./CustomerServiceNote')(sequelize, DataTypes)
/*
 * ✅ CustomerServiceNote：客服内部备注（仅客服可见）
 *    - 用途：客服之间传递关于用户的内部信息（用户永远看不到）
 *    - 特点：可关联工单或会话，支持客服交接班/转接时保留上下文
 *    - 表名：customer_service_notes，主键：note_id
 *    - 业务场景：客服记录备注→转接时新客服看到→交接班不丢失信息
 */

models.CustomerServiceUserAssignment = require('./CustomerServiceUserAssignment')(
  sequelize,
  DataTypes
)
/*
 * ✅ CustomerServiceUserAssignment：客服用户分配
 *    - 用途：记录用户被分配给哪个客服座席，实现持久化的用户-客服绑定关系
 *    - 特点：支持分配/转移/过期、保留分配历史、同一用户同时只有一条 active 分配
 *    - 表名：customer_service_user_assignments，主键：customer_service_user_assignment_id
 *    - 业务场景：管理员分配用户到客服→用户下次咨询自动路由→客服间转移用户
 */

// V4.0新增：反馈系统
models.Feedback = require('./Feedback')(sequelize, DataTypes)
models.SystemSettings = require('./SystemSettings')(sequelize, DataTypes)

// 广告系统（内容投放统一架构）
models.AdSlot = require('./AdSlot')(sequelize, DataTypes)
/*
 * ✅ AdSlot：广告位配置
 *    - 用途：定义广告位（弹窗/轮播）的位置、日价、竞价门槛
 *    - 表名：ad_slots，主键：ad_slot_id
 */

models.AdCampaign = require('./AdCampaign')(sequelize, DataTypes)
/*
 * ✅ AdCampaign：广告投放计划
 *    - 用途：广告主创建的投放计划（固定包天/竞价排名）
 *    - 表名：ad_campaigns，主键：ad_campaign_id
 */

models.AdCreative = require('./AdCreative')(sequelize, DataTypes)
/*
 * ✅ AdCreative：广告素材
 *    - 用途：广告图片素材、跳转链接、审核状态管理
 *    - 表名：ad_creatives，主键：ad_creative_id
 */

models.AdBillingRecord = require('./AdBillingRecord')(sequelize, DataTypes)
/*
 * ✅ AdBillingRecord：广告计费流水
 *    - 用途：钻石冻结/扣款/退款/日扣费记录
 *    - 表名：ad_billing_records，主键：ad_billing_record_id（BIGINT）
 */

// 🔴 Phase 4：竞价排名
models.AdBidLog = require('./AdBidLog')(sequelize, DataTypes)
/*
 * ✅ AdBidLog：竞价记录
 *    - 用途：记录每次竞价的参与方、出价、胜负
 *    - 表名：ad_bid_logs，主键：ad_bid_log_id（BIGINT）
 */

// 🔴 Phase 5：DMP 人群定向 + 反作弊
models.UserAdTag = require('./UserAdTag')(sequelize, DataTypes)
/*
 * ✅ UserAdTag：用户行为标签（DMP）
 *    - 用途：定时从业务表聚合用户行为特征，用于广告定向投放
 *    - 表名：user_ad_tags，主键：user_ad_tag_id（BIGINT）
 */

models.AdImpressionLog = require('./AdImpressionLog')(sequelize, DataTypes)
/*
 * ✅ AdImpressionLog：广告曝光日志
 *    - 用途：记录广告有效/无效曝光（反作弊判定后）
 *    - 表名：ad_impression_logs，主键：ad_impression_log_id（BIGINT）
 */

models.AdClickLog = require('./AdClickLog')(sequelize, DataTypes)
/*
 * ✅ AdClickLog：广告点击日志
 *    - 用途：记录广告点击事件（归因追踪数据源）
 *    - 表名：ad_click_logs，主键：ad_click_log_id（BIGINT）
 */

models.AdAntifraudLog = require('./AdAntifraudLog')(sequelize, DataTypes)
/*
 * ✅ AdAntifraudLog：反作弊判定日志
 *    - 用途：记录反作弊规则触发情况和判定结果
 *    - 表名：ad_antifraud_logs，主键：ad_antifraud_log_id（BIGINT）
 */

// 🔴 Phase 6：归因追踪 + 多维报表
models.AdAttributionLog = require('./AdAttributionLog')(sequelize, DataTypes)
/*
 * ✅ AdAttributionLog：归因追踪日志
 *    - 用途：关联广告点击与后续转化行为（24小时归因窗口）
 *    - 表名：ad_attribution_logs，主键：ad_attribution_log_id（BIGINT）
 */

models.AdReportDailySnapshot = require('./AdReportDailySnapshot')(sequelize, DataTypes)
/*
 * ✅ AdReportDailySnapshot：每日报表快照
 *    - 用途：凌晨4点聚合前一天的曝光/点击/转化/消耗数据
 *    - 表名：ad_report_daily_snapshots，主键：snapshot_id（BIGINT）
 */

// 🔴 内容投放合并：通用交互日志表（D2 定论：替代分散的 popup_show_logs / carousel_show_logs）
models.AdInteractionLog = require('./AdInteractionLog')(sequelize, DataTypes)
/*
 * ✅ AdInteractionLog：通用内容交互日志
 *    - 用途：统一记录弹窗/轮播/公告/广告的展示、点击、关闭等交互事件
 *    - 表名：ad_interaction_logs，主键：ad_interaction_log_id（BIGINT）
 */

// 🔴 图片和存储系统
models.ImageResources = require('./ImageResources')(sequelize, DataTypes)

// 🔴 兑换市场系统

models.ExchangeItem = require('./ExchangeItem')(sequelize, DataTypes)
/*
 * ✅ ExchangeItem：兑换市场商品配置表
 *    - 用途：配置用户可以使用虚拟奖品价值或积分兑换的商品
 *    - 特点：支持虚拟奖品/积分/混合支付方式
 *    - 表名：exchange_items，主键：exchange_item_id
 *    - 业务场景：用户抽奖获得虚拟奖品（水晶等）→ 使用虚拟奖品价值兑换商品
 */

models.ExchangeRecord = require('./ExchangeRecord')(sequelize, DataTypes)
/*
 * ✅ ExchangeRecord：B2C兑换订单记录表
 *    - 用途：记录用户在B2C官方商城的兑换订单
 *    - 特点：材料资产支付、订单管理、发货追踪、来源标识(source)
 *    - 表名：exchange_records，主键：exchange_record_id
 *    - 业务场景：用户选择商品 → 扣除材料资产 → 创建订单 → 发货
 *    - source字段：exchange(普通兑换) / bid(竞价中标)
 */

// 🔴 竞价系统模型（臻选空间/幸运空间/竞价功能 — 2026-02-16）
models.BidProduct = require('./BidProduct')(sequelize, DataTypes)
/*
 * ✅ BidProduct：竞价商品表
 *    - 用途：管理竞价活动（关联 exchange_items，含状态机 + 时间控制）
 *    - 特点：7态状态机（pending/active/ended/cancelled/settled/settlement_failed/no_bid）
 *    - 表名：bid_products，主键：bid_product_id
 *    - 业务场景：管理员创建竞价 → 定时激活 → 用户出价 → 到期结算/流拍
 */

models.BidRecord = require('./BidRecord')(sequelize, DataTypes)
/*
 * ✅ BidRecord：竞价出价记录表
 *    - 用途：记录用户出价（含冻结流水对账、幂等性控制）
 *    - 特点：idempotency_key UNIQUE、is_winning 标记当前最高出价
 *    - 表名：bid_records，主键：bid_record_id
 *    - 业务场景：用户出价 → 冻结资产 → 记录出价 → 结算时标记 is_final_winner
 */

/*
 * 🔥 统一资产底座系统（V4.5.0 资产域标准架构）
 *    当前架构：Account + AccountAssetBalance + AssetTransaction
 *    - Account: 账户主体（用户账户 + 系统账户）
 *    - AccountAssetBalance: 资产余额（支持冻结模型）
 *    - AssetTransaction: 资产流水（业界标准幂等架构）
 */

models.AssetTransaction = require('./AssetTransaction')(sequelize, DataTypes)
/*
 * ✅ AssetTransaction：资产流水表（记录所有资产变动流水）
 *    - 用途：记录DIAMOND和材料资产的所有变动流水
 *    - 特点：业界标准幂等架构（idempotency_key唯一约束），delta_amount可正可负，记录变动后余额
 *    - 表名：asset_transactions，主键：asset_transaction_id，外键：account_id
 *    - 业务场景：市场购买（买家扣减、卖家入账、平台手续费）、兑换扣减、材料转换、对账审计
 *    - 更新：2025-12-26 升级到业界标准幂等架构（方案B），删除 business_id 字段
 */

models.ApiIdempotencyRequest = require('./ApiIdempotencyRequest')(sequelize, DataTypes)
/*
 * ✅ ApiIdempotencyRequest：API入口幂等表（业界标准）
 *    - 用途：记录每次API请求的处理状态和结果快照，实现重试返回首次结果
 *    - 特点：idempotency_key唯一约束、状态机（processing/completed/failed）、响应快照
 *    - 表名：api_idempotency_requests，主键：request_id
 *    - 业务场景：抽奖请求幂等、支付请求幂等、任何需要幂等保证的请求
 *    - 创建：2025-12-26 业界标准幂等架构（方案B）
 */

// 🔥 统一账户体系（2025年12月15日新增 - Phase 1）
models.Account = require('./Account')(sequelize, DataTypes)
/*
 * ✅ Account：账户主体表（用户账户 + 系统账户统一管理）
 *    - 用途：统一账户体系，区分用户账户（account_type=user）和系统账户（account_type=system）
 *    - 特点：用户账户关联user_id（唯一），系统账户使用system_code（唯一），如SYSTEM_PLATFORM_FEE（平台手续费）
 *    - 表名：accounts，主键：account_id，外键：user_id
 *    - 业务场景：系统账户收取手续费，支持系统发放/销毁/托管账户
 *    - 系统账户：SYSTEM_PLATFORM_FEE（手续费）、SYSTEM_MINT（发放）、SYSTEM_BURN（销毁）、SYSTEM_ESCROW（托管）
 */

models.AccountAssetBalance = require('./AccountAssetBalance')(sequelize, DataTypes)
/*
 * ✅ AccountAssetBalance：账户资产余额表（可用余额 + 冻结余额）
 *    - 用途：管理每个账户的每种资产余额（支持冻结模型）
 *    - 特点：available_amount（可用余额）+ frozen_amount（冻结余额），交易市场必须走冻结链路
 *    - 表名：account_asset_balances，主键：balance_id，外键：account_id，唯一约束：(account_id, asset_code)
 *    - 业务场景：下单冻结买家DIAMOND → 成交从冻结扣减 → 取消解冻；挂牌冻结卖家标的 → 成交扣减 → 撤单解冻
 *    - 冻结操作：freeze（可用→冻结）、unfreeze（冻结→可用）、deductFromFrozen（从冻结扣减）
 */

models.ConsumptionRecord = require('./ConsumptionRecord')(sequelize, DataTypes)
/*
 * ✅ ConsumptionRecord：消费记录（商家扫码录入）
 *    - 用途：记录用户在商家处的消费信息，用于积分奖励
 *    - 特点：消费金额、预计积分、二维码、审核状态、商家备注
 *    - 表名：consumption_records，主键：consumption_record_id，外键：user_id、merchant_id
 *    - 业务场景：商家扫码录入消费→积分冻结→平台审核→积分到账
 *    - 关联：AssetTransaction（资产冻结）、ContentReviewRecord（审核流程）
 */

// 🔴 审核系统：两个完全不同的业务概念（⚠️ 最容易混淆，务必区分！）
models.ContentReviewRecord = require('./ContentReviewRecord')(sequelize, DataTypes)
/*
 * ✅ ContentReviewRecord：内容审核记录（业务审核流程管理）
 *    - 用途：管理需要人工审核的业务内容（如：兑换申请、图片审核、反馈处理）
 *    - 特点：有审核流程，状态可变更（pending→approved/rejected），有审核员
 *    - 表名：content_review_records，主键：content_review_record_id
 *    - 业务场景：用户提交兑换申请 → 进入待审核状态 → 管理员审核 → 通过/拒绝
 *    - 字段特点：audit_status（状态）、auditor_id（审核员）、audit_reason（审核意见）
 *    - ⚠️ 与AdminOperationLog的区别：ContentReviewRecord是业务审核，AdminOperationLog是操作追溯
 */

models.AdminOperationLog = require('./AdminOperationLog')(sequelize, DataTypes)
/*
 * ✅ AdminOperationLog：操作审计日志（管理员操作历史追溯）
 *    - 用途：记录所有敏感操作的审计日志，用于安全审计和责任追溯
 *    - 特点：只记录不修改，不可删除，记录操作前后数据对比
 *    - 表名：admin_operation_logs，主键：log_id
 *    - 业务场景：管理员修改积分 → 记录谁/何时/改了什么 → 用于追溯和审计
 *    - 字段特点：operator_id（操作员）、operation_type（操作类型）、before_data/after_data（前后数据）
 *    - ⚠️ 与ContentReviewRecord的区别：AdminOperationLog是操作追溯，ContentReviewRecord是业务审核
 */

models.Merchant = require('./Merchant')(sequelize, DataTypes)
/*
 * ✅ Merchant：商家信息（2026-02-23 多商家架构）
 *    - 用途：记录接入平台的商家（餐厅/商铺/小游戏/服务商）
 *    - 特点：merchant_type 通过字典表校验，支持运营自助扩展
 *    - 表名：merchants，主键：merchant_id
 *    - 关联：stores(门店)、items(物品)、lottery_prizes(奖品)、material_asset_types(资产类型)
 */

models.MerchantOperationLog = require('./MerchantOperationLog')(sequelize, DataTypes)
/*
 * ✅ MerchantOperationLog：商家操作审计日志（2026-01-12 商家员工域权限体系升级）
 *    - 用途：独立的商家域审计日志，与 AdminOperationLog 分离
 *    - 特点：记录商家员工的扫码/消费提交等敏感操作，支持门店维度筛选
 *    - 表名：merchant_operation_logs，主键：merchant_log_id
 *    - 业务场景：扫码获取用户信息 → 提交消费记录 → 门店/员工/时间范围筛选
 *    - 字段特点：operator_id、store_id、target_user_id、consumption_amount、result
 */

// 🔴 层级化角色权限管理系统（2025年11月07日新增）
models.AdministrativeRegion = require('./AdministrativeRegion')(sequelize, DataTypes)
/*
 * ✅ AdministrativeRegion：行政区划字典（2026-01-12 新增）
 *    - 用途：标准化的省市区街道行政区划数据字典，支持四级级联选择
 *    - 特点：GB/T 2260标准代码、层级结构（省→市→区县→街道）、拼音搜索
 *    - 表名：administrative_regions，主键：region_code
 *    - 业务场景：门店管理时的省市区街道级联选择、按区域维度统计
 *    - 数据来源：GitHub modood/Administrative-divisions-of-China
 */

models.Store = require('./Store')(sequelize, DataTypes)
/*
 * ✅ Store：门店信息管理（2026-01-12 升级：新增省市区街道字段）
 *    - 用途：记录合作商家门店信息，用于业务员分派和消费记录关联
 *    - 特点：门店名称、编号、地址、联系人、省市区街道级联、分配业务员
 *    - 表名：stores，主键：store_id
 *    - 业务场景：区域负责人创建门店→分配业务经理→业务员负责门店消费记录录入
 *    - 更新：2026-01-12 删除 region 字段，新增 8 个行政区划字段（code + name 冗余设计）
 */

models.UserHierarchy = require('./UserHierarchy')(sequelize, DataTypes)
/*
 * ✅ UserHierarchy：用户层级关系（简化版，不使用hierarchy_path）
 *    - 用途：管理用户上下级关系（区域负责人→业务经理→业务员）
 *    - 特点：上下级关联、角色关联、门店关联、激活/停用管理
 *    - 表名：user_hierarchy，主键：hierarchy_id
 *    - 业务场景：建立层级关系→批量停用下级权限→查询所有下级→层级统计
 *    - 简化设计：小数据量（<1000用户），使用递归查询而非hierarchy_path字段
 */

models.StoreStaff = require('./StoreStaff')(sequelize, DataTypes)
/*
 * ✅ StoreStaff：门店员工关系（2026-01-12 商家员工域权限体系升级）
 *    - 用途：管理员工与门店的多对多关系，支持历史记录
 *    - 特点：员工-门店多对多、角色区分（staff/manager）、入离职记录
 *    - 表名：store_staff，主键：store_staff_id
 *    - 业务场景：员工入职→门店分配→消费录入权限→离职/调动
 *    - 触发器：自动维护 sequence_no、确保每店只有一条 active 记录
 */

models.RiskAlert = require('./RiskAlert')(sequelize, DataTypes)
/*
 * ✅ RiskAlert：风控告警记录（2026-01-12 商家员工域权限体系升级）
 *    - 用途：记录商家操作的风控告警（频次超限、金额异常、跨店重复等）
 *    - 特点：告警类型分类、严重程度分级、阻断/告警区分、审核流程
 *    - 表名：risk_alerts，主键：risk_alert_id
 *    - 业务场景：消费提交→风控检查→生成告警→管理员审核→处理结果
 */

// 🔴 告警静默规则表（2026-02-03 运营后台优化 DB-2）
models.AlertSilenceRule = require('./AlertSilenceRule')(sequelize, DataTypes)
/*
 * ✅ AlertSilenceRule：告警静默规则（运营后台优化 §3.2）
 *    - 用途：配置告警静默规则，支持时间段静默、告警类型静默
 *    - 特点：支持每日时段静默、日期范围静默、告警级别过滤
 *    - 表名：alert_silence_rules，主键：alert_silence_rule_id
 *    - 业务场景：节假日静默、夜间静默、测试环境静默
 */

// 🔴 审计业务记录表（2026-01-08 决策9实现 - 为无天然业务主键的操作提供审计锚点）
models.UserStatusChangeRecord = require('./UserStatusChangeRecord')(sequelize, DataTypes)
/*
 * ✅ UserStatusChangeRecord：用户状态变更记录
 *    - 用途：为 user_status_change 审计日志提供业务主键（user_status_change_record_id → target_id）
 *    - 特点：幂等键派生（决策6）、事务内创建（决策7）、关键操作阻断（决策5）
 *    - 表名：user_status_change_records，主键：user_status_change_record_id
 *    - 业务场景：管理员封禁/解封用户→创建变更记录→记录审计日志→可追溯
 */

models.UserRoleChangeRecord = require('./UserRoleChangeRecord')(sequelize, DataTypes)
/*
 * ✅ UserRoleChangeRecord：用户角色变更记录
 *    - 用途：为 role_change 审计日志提供业务主键（user_role_change_record_id → target_id）
 *    - 特点：幂等键派生（决策6）、事务内创建（决策7）、关键操作阻断（决策5）
 *    - 表名：user_role_change_records，主键：user_role_change_record_id
 *    - 业务场景：管理员变更用户角色→创建变更记录→记录审计日志→可追溯
 *    - 注意：与 RoleChangeLog 区别 - 本模型专用于审计主键生成，不记录角色权限本身的变更
 */

models.LotteryClearSettingRecord = require('./LotteryClearSettingRecord')(sequelize, DataTypes)
/*
 * ✅ LotteryClearSettingRecord：抽奖清除设置记录
 *    - 用途：为 lottery_clear_settings 审计日志提供业务主键（lottery_clear_setting_record_id → target_id）
 *    - 特点：幂等键派生（决策6）、事务内创建（决策7）、关键操作阻断（决策5）
 *    - 表名：lottery_clear_setting_records，主键：lottery_clear_setting_record_id
 *    - 业务场景：管理员清除用户抽奖设置→创建清除记录→记录审计日志→可追溯
 *    - 解决问题：原 target_id: null 导致关键操作被阻断
 */

models.WebSocketStartupLog = require('./WebSocketStartupLog')(sequelize, DataTypes)
/*
 * ✅ WebSocketStartupLog：WebSocket服务启动日志
 *    - 用途：记录WebSocket服务启动/停止事件，用于审计和稳定性分析
 *    - 特点：记录启动时间、停止时间、运行时长、峰值连接数、服务器信息
 *    - 表名：websocket_startup_logs，主键：websocket_startup_log_id
 *    - 业务场景：服务监控→uptime计算→重启历史查询→SLA统计
 */

/*
 * 🔴 材料系统（V4.5.0）
 *
 * 最终态对齐（生产方案硬约束）：
 * - 材料配置真相：material_asset_types / material_conversion_rules（禁止硬编码）
 * - 材料余额真相：account_asset_balances / asset_transactions（统一账本）
 */
models.MaterialAssetType = require('./MaterialAssetType')(sequelize, DataTypes)
models.MaterialConversionRule = require('./MaterialConversionRule')(sequelize, DataTypes)

// 🔴 固定汇率兑换规则模型（2026-02-23 市场增强）
models.ExchangeRate = require('./ExchangeRate')(sequelize, DataTypes)
/*
 * ✅ ExchangeRate：固定汇率兑换规则
 *    - 用途：管理资产间的固定汇率兑换配置（如 10 red_shard = 1 DIAMOND）
 *    - 与 MaterialConversionRule 语义分离：材料转换是"合成"，汇率兑换是"货币兑换"
 *    - 表名：exchange_rates，主键：exchange_rate_id
 */

// 🔴 V4.2 交易市场升级模型（Phase 2）
models.MarketListing = require('./MarketListing')(sequelize, DataTypes)
/*
 * ✅ MarketListing：市场挂牌
 *    - 用途：管理交易市场的挂牌信息（不可叠加物品 + 可叠加资产）
 *    - 特点：支持锁定机制、冻结标记、状态流转（on_sale → locked → sold/withdrawn）
 *    - 表名：market_listings，主键：market_listing_id
 *    - 业务场景：创建挂牌→购买挂牌→撤回挂牌→超时解锁
 */

models.TradeOrder = require('./TradeOrder')(sequelize, DataTypes)
/*
 * ✅ TradeOrder：交易订单
 *    - 用途：管理所有交易订单，提供强幂等性控制和对账支持
 *    - 特点：business_id全局唯一、对账字段（gross_amount = fee_amount + net_amount）
 *    - 表名：trade_orders，主键：trade_order_id，唯一约束：business_id
 *    - 业务场景：创建订单→冻结资产→成交结算→取消订单
 */

const MarketPriceSnapshot = require('./MarketPriceSnapshot')
MarketPriceSnapshot.initModel(sequelize)
models.MarketPriceSnapshot = MarketPriceSnapshot
/*
 * ✅ MarketPriceSnapshot：市场价格快照预聚合
 *    - 用途：每日汇总市场挂牌的价格统计（最低/最高/平均、成交量）
 *    - 表名：market_price_snapshots，主键：snapshot_id
 *    - 唯一约束：(snapshot_date, asset_code, listing_kind, price_asset_code)
 */

// 🔴 V4.2 背包双轨架构模型（Phase 1 - 核销码系统）
models.RedemptionOrder = require('./RedemptionOrder')(sequelize, DataTypes)
/*
 * ✅ RedemptionOrder：兑换订单
 *    - 用途：管理核销码生成和核销流程
 *    - 特点：12位Base32核销码 + SHA-256哈希存储 + 30天TTL
 *    - 表名：redemption_orders，主键：redemption_order_id（UUID），唯一约束：code_hash
 *    - 业务场景：生成核销码→核销验证→过期清理
 */

// 🔴 V4.6 抽奖策略引擎模型（2026-01-20 - 预算侧自动分层控制）
models.LotteryUserExperienceState = require('./LotteryUserExperienceState')(sequelize, DataTypes)
/*
 * ✅ LotteryUserExperienceState：用户活动级抽奖体验状态
 *    - 用途：追踪用户在特定活动中的抽奖体验状态（Pity/AntiStreak）
 *    - 特点：empty_streak（连续空奖次数）、recent_high_count（近期高价值次数）
 *    - 表名：lottery_user_experience_state，主键：lottery_user_experience_state_id，唯一约束：user_id + lottery_campaign_id
 *    - 业务场景：Pity保底触发→AntiEmpty防空连→AntiHigh防高价值集中
 */

models.LotteryUserGlobalState = require('./LotteryUserGlobalState')(sequelize, DataTypes)
/*
 * ✅ LotteryUserGlobalState：用户全局抽奖统计（运气债务）
 *    - 用途：追踪用户跨活动的全局抽奖历史统计（LuckDebt运气债务机制）
 *    - 特点：historical_empty_rate（历史空奖率）、luck_debt_multiplier（补偿乘数）
 *    - 表名：lottery_user_global_state，主键：global_state_id，唯一约束：user_id
 *    - 业务场景：历史空奖率 > 期望值 → 累积运气债务 → 补偿提高非空奖概率
 */

models.LotteryHourlyMetrics = require('./LotteryHourlyMetrics')(sequelize, DataTypes)
/*
 * ✅ LotteryHourlyMetrics：抽奖监控指标表（按小时聚合）
 *    - 用途：存储按小时聚合的抽奖监控指标，用于监控活动健康度和策略效果
 *    - 特点：档位分布统计、BxPx分层分布、体验机制触发统计、预计算率指标
 *    - 表名：lottery_hourly_metrics，主键：lottery_hourly_metric_id，唯一约束：lottery_campaign_id + hour_bucket
 *    - 业务场景：实时监控空奖率/高价值率、Pity/AntiEmpty触发率、异常检测预警
 */

models.LotteryAlert = require('./LotteryAlert').initModel(sequelize)
models.SegmentRuleConfig = require('./SegmentRuleConfig')(sequelize)
/*
 * ✅ LotteryAlert：抽奖系统告警表（运营监控专用）
 *    - 用途：记录抽奖系统的实时告警信息，用于运营监控和异常检测
 *    - 特点：独立于商家风控的 risk_alerts，包含 lottery_campaign_id、阈值偏差等专用字段
 *    - 表名：lottery_alerts，主键：alert_id
 *    - 业务场景：中奖率异常、预算告警、库存告警、用户异常、系统告警
 *    - 设计决策来源：需求文档决策6（职责分离，便于独立演进）
 */

// 🔴 V4.8 批量操作基础设施（阶段C核心组件 - 2026-01-30）
models.BatchOperationLog = require('./BatchOperationLog').initModel(sequelize)
/*
 * ✅ BatchOperationLog：批量操作日志表（幂等性控制与操作审计）
 *    - 用途：记录所有批量操作的执行状态和结果，提供幂等性保障
 *    - 特点：idempotency_key唯一约束（美团幂等性方案）、部分成功模式、操作审计
 *    - 表名：batch_operation_logs，主键：batch_operation_log_id
 *    - 业务场景：批量赠送配额、批量设置干预规则、批量核销、批量状态切换、批量预算调整
 *    - 设计决策来源：需求文档阶段C技术决策（美团独立幂等表 + Redis/MySQL双重校验）
 */

models.SystemConfig = require('./SystemConfig').initModel(sequelize)
/*
 * ✅ SystemConfig：系统配置表（动态配置管理）
 *    - 用途：存储可动态调整的系统配置参数，支持批量操作限流配置
 *    - 特点：config_key唯一约束、JSON配置值、分类管理、启用/禁用控制
 *    - 表名：system_configs，主键：config_id
 *    - 业务场景：批量操作限流配置、功能开关、系统参数调整
 *    - 设计决策来源：需求文档阶段C技术决策（动态限流配置，运营可调整）
 */

models.LotteryDailyMetrics = require('./LotteryDailyMetrics')(sequelize, DataTypes)
/*
 * ✅ LotteryDailyMetrics：抽奖日报统计表（按日聚合）
 *    - 用途：存储按日聚合的抽奖监控指标，用于长期历史分析和运营决策
 *    - 特点：从小时级数据汇总、永久保留、支持跨活动对比分析
 *    - 表名：lottery_daily_metrics，主键：lottery_daily_metric_id，唯一约束：lottery_campaign_id + metric_date
 *    - 业务场景：日报生成、年度对比、运营决策、长期趋势分析
 */

models.LotteryStrategyConfig = require('./LotteryStrategyConfig')(sequelize, DataTypes)
/*
 * ✅ LotteryStrategyConfig：抽奖策略全局配置表（Phase 3+ 动态配置）
 *    - 用途：存储策略引擎的全局配置参数，支持运行时动态调整
 *    - 特点：配置分组管理、优先级机制、定时生效、JSON值类型
 *    - 表名：lottery_strategy_config，主键：strategy_config_id
 *    - 配置分组：budget_tier/pressure_tier/pity/luck_debt/anti_empty/anti_high
 *    - 业务场景：运营调参、A/B测试、活动期间特殊配置
 */

models.LotteryTierMatrixConfig = require('./LotteryTierMatrixConfig')(sequelize, DataTypes)
/*
 * ✅ LotteryTierMatrixConfig：BxPx矩阵配置表（Phase 3+ 动态配置）
 *    - 用途：存储 Budget Tier × Pressure Tier 组合的乘数配置
 *    - 特点：12种组合（4个Budget Tier × 3个Pressure Tier）、cap乘数、空奖权重乘数
 *    - 表名：lottery_tier_matrix_config，主键：matrix_config_id
 *    - 业务场景：根据用户预算和活动压力动态调整奖品分布
 */

// 🔴 V4.6 功能开关系统（Feature Flag - 2026-01-21）
models.FeatureFlag = require('./FeatureFlag')(sequelize, DataTypes)
/*
 * ✅ FeatureFlag：功能开关表
 *    - 用途：全系统通用的功能开关和灰度发布控制
 *    - 特点：百分比灰度、用户白名单/黑名单、时间窗口、用户分群
 *    - 表名：feature_flags，主键：flag_id，唯一约束：flag_key
 *    - 业务场景：新功能灰度发布、A/B测试、紧急降级开关
 */

// 🔴 V4.7 系统字典表（中文化显示名称 - 2026-01-22）
models.SystemDictionary = require('./SystemDictionary')(sequelize, DataTypes)
/*
 * ✅ SystemDictionary：系统字典表
 *    - 用途：存储各类枚举的中文显示名称映射（中文化显示名称核心数据源）
 *    - 特点：dict_type + dict_code 唯一约束、版本管理、Redis缓存配合
 *    - 表名：system_dictionaries，主键：dict_id
 *    - 业务场景：状态码转中文名称、前端颜色配置、运营动态修改
 */

models.SystemDictionaryHistory = require('./SystemDictionaryHistory')(sequelize, DataTypes)
/*
 * ✅ SystemDictionaryHistory：系统字典历史表
 *    - 用途：记录字典修改历史，支持版本回滚和审计追溯
 *    - 特点：记录修改前快照、修改人、修改原因
 *    - 表名：system_dictionary_history，主键：history_id，外键：dict_id
 *    - 业务场景：版本回滚、审计追溯、变更历史查询
 */

// 🔴 P2阶段新增模型（2026-01-31 智能提醒、报表模板、用户行为轨迹）
models.ReminderRule = require('./ReminderRule')(sequelize, DataTypes)
/*
 * ✅ ReminderRule：智能提醒规则表
 *    - 用途：配置自定义提醒规则（如"待审核超24小时提醒"、"预算告警"）
 *    - 特点：规则类型分类、JSON触发条件、多通知渠道、定时检测
 *    - 表名：reminder_rules，主键：rule_id，唯一约束：rule_code
 *    - 业务场景：运营配置提醒规则→定时检测→触发通知→管理员处理
 */

models.ReminderHistory = require('./ReminderHistory')(sequelize, DataTypes)
/*
 * ✅ ReminderHistory：提醒历史记录表
 *    - 用途：记录提醒规则的触发历史和通知发送结果
 *    - 特点：触发时间、匹配数量、通知状态、确认状态
 *    - 表名：reminder_history，主键：history_id，外键：rule_id
 *    - 业务场景：提醒触发→发送通知→管理员确认→历史查询
 */

models.ReportTemplate = require('./ReportTemplate')(sequelize, DataTypes)
/*
 * ✅ ReportTemplate：报表模板表
 *    - 用途：配置自定义报表模板（数据源、列、筛选、聚合、图表）
 *    - 特点：多种报表类型、JSON配置化、定时调度、多格式导出
 *    - 表名：report_templates，主键：template_id，唯一约束：template_code
 *    - 业务场景：运营配置模板→动态生成报表→定时推送→多格式导出
 */

models.UserBehaviorTrack = require('./UserBehaviorTrack')(sequelize, DataTypes)
/*
 * ✅ UserBehaviorTrack：用户行为轨迹表
 *    - 用途：记录用户关键行为（登录、抽奖、消费、兑换等）
 *    - 特点：行为分类、动作类型、目标关联、设备信息、会话追踪
 *    - 表名：user_behavior_tracks，主键：user_behavior_track_id，外键：user_id
 *    - 业务场景：用户行为记录→轨迹聚合分析→用户画像→运营决策
 */

models.AdminNotification = require('./AdminNotification')(sequelize, DataTypes)
/*
 * ✅ AdminNotification：管理员通知消息表
 *    - 用途：存储系统通知、告警提醒、任务通知等各类管理员消息
 *    - 特点：通知类型分类、优先级管理、已读状态追踪、来源关联、过期机制
 *    - 表名：admin_notifications，主键：notification_id，外键：admin_id
 *    - 业务场景：智能提醒触发→生成通知→管理员查看→标记已读→历史归档
 */

models.UserNotification = require('./UserNotification')(sequelize, DataTypes)
/*
 * ✅ UserNotification：用户通知表（方案B — 通知通道独立化）
 *    - 用途：存储面向普通用户的系统通知（挂牌、交易、中奖、兑换审核等）
 *    - 特点：与客服聊天系统完全分离、已读/未读管理、预留微信推送字段
 *    - 表名：user_notifications，主键：notification_id，关联：user_id
 *    - 业务场景：业务事件触发→写入通知表→WebSocket实时推送→用户查看→标记已读
 */

// 🔴 策略效果模拟分析（2026-02-20）
models.LotterySimulationRecord = require('./LotterySimulationRecord')(sequelize, DataTypes)
/*
 * ✅ LotterySimulationRecord：策略效果模拟记录表
 *    - 用途：保存 Monte Carlo 模拟参数、结果、对比分析、风险评估和偏差追踪
 *    - 特点：JSON存储模拟快照、支持多方案对比、偏差追踪闭环
 *    - 表名：lottery_simulation_records，主键：lottery_simulation_record_id
 *    - 业务场景：策略调参预览→模拟运行→对比分析→风险评估→一键应用→偏差追踪
 */

// 🔴 设置模型关联关系
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models)
  }
})

// 🔴 导出sequelize实例和所有模型
models.sequelize = sequelize
models.Sequelize = Sequelize
models.Op = Sequelize.Op

console.log(
  '✅ V4.0 Models loaded:',
  Object.keys(models).filter(key => key !== 'sequelize' && key !== 'Sequelize').length,
  'models'
)

module.exports = models
