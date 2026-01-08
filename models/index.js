/**
 * 餐厅积分抽奖系统 V4.0 - 模型统一导出（V15.0 UUID角色系统版）
 * 清理了无效的模型引用，只保留实际存在的模型
 * V15.0更新：集成UUID角色系统，移除is_admin字段依赖
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
 *    - 权限管理：通过UUID角色系统（roles表关联），不使用is_admin字段
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
 *    - 表名：authentication_sessions，主键：user_session_id
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

// 🔴 抽奖系统核心模型
models.LotteryCampaign = require('./LotteryCampaign')(sequelize, DataTypes)
models.LotteryPrize = require('./LotteryPrize')(sequelize, DataTypes)
models.LotteryDraw = require('./LotteryDraw')(sequelize, DataTypes)
models.LotteryPreset = require('./LotteryPreset')(sequelize, DataTypes)

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
 *    - 表名：lottery_user_daily_draw_quota，主键：quota_id，唯一索引：user_id + campaign_id + quota_date
 *    - 业务场景：抽奖前配额检查、原子扣减、连抽支持（10连抽一次扣减10次）
 */

// 🔴 业务功能模型（商品和库存系统）
models.Product = require('./Product')(sequelize, DataTypes)
/*
 * ✅ Product：商品信息管理
 *    - 用途：管理可兑换的商品信息（实物、虚拟商品、服务等）
 *    - 特点：商品名称、价格、库存、状态、描述
 *    - 表名：products，主键：product_id
 */

models.ItemInstance = require('./ItemInstance')(sequelize, DataTypes)
/*
 * ✅ ItemInstance：物品实例所有权管理（物品所有权真相 - P0-2）
 *    - 用途：管理不可叠加物品的所有权状态（装备、卡牌、优惠券等）
 *    - 特点：单源真相、状态机管理、订单锁定、所有权转移
 *    - 表名：item_instances，主键：item_instance_id，外键：owner_user_id
 *    - 业务场景：物品上架、购买转移、使用核销、过期管理
 *    - 状态流转：available → locked → transferred/used/expired
 *    - 锁TTL：3分钟（2025-12-28从15分钟优化）
 */

models.ItemInstanceEvent = require('./ItemInstanceEvent')(sequelize, DataTypes)
/*
 * ✅ ItemInstanceEvent：物品实例事件（事件溯源 - 2025-12-28新增）
 *    - 用途：记录物品实例的所有变更事件（铸造/锁定/解锁/转移/使用/过期/销毁）
 *    - 特点：事件溯源、业务幂等（business_type + business_id 唯一约束）
 *    - 表名：item_instance_events，主键：event_id，外键：item_instance_id
 *    - 业务场景：物品审计追踪、所有权历史、状态变更溯源
 *    - 事件类型：mint/lock/unlock/transfer/use/expire/destroy
 */

/**
 * ❌ TradeRecord：已删除（2026-01-08 交易流水收敛决策执行完成）
 *    - 删除原因：职责混乱，与 AssetTransaction、TradeOrder 功能重叠
 *    - 替代方案：
 *      - 资产变动 → AssetTransaction（asset_transactions 表）
 *      - C2C交易 → TradeOrder（trade_orders 表）
 *      - 物品事件 → ItemInstanceEvent（item_instance_events 表）
 *    - 数据库：trade_records 表已于 2026-01-08 删除（迁移 20260108210000）
 *    - 模型文件：models/TradeRecord.js 已删除
 *    - 文档：详见 docs/交易流水收敛方案-AssetTransaction-TradeOrder-TradeRecord-2026-01-08.md
 */

// 🔴 管理和客服系统
models.CustomerServiceSession = require('./CustomerServiceSession')(sequelize, DataTypes)
/*
 * ✅ CustomerServiceSession：客服聊天会话（与AuthenticationSession完全不同的概念！）
 *    - 用途：管理用户与客服之间的聊天对话会话
 *    - 特点：会话状态（等待/分配/活跃/关闭）、客服分配、满意度评分
 *    - 表名：customer_service_sessions，主键：session_id，外键：user_id、admin_id
 *    - 业务场景：用户发起咨询、客服接入、消息收发、会话关闭、满意度评价
 *    - ⚠️ 与AuthenticationSession的区别：CustomerServiceSession是聊天会话，AuthenticationSession是认证会话
 */

models.ChatMessage = require('./ChatMessage')(sequelize, DataTypes)
/*
 * ✅ ChatMessage：聊天消息
 *    - 用途：记录CustomerSession中的每条聊天消息
 *    - 特点：消息内容、发送者、发送时间、消息类型
 *    - 表名：chat_messages，外键：session_id
 */

// V4.0新增：系统公告和反馈系统
models.SystemAnnouncement = require('./SystemAnnouncement')(sequelize, DataTypes)
models.Feedback = require('./Feedback')(sequelize, DataTypes)
models.SystemSettings = require('./SystemSettings')(sequelize, DataTypes)
/*
 * ✅ SystemSettings：系统设置（系统配置管理）
 *    - 用途：存储系统各模块的配置设置（基础设置、抽奖设置、积分设置、通知设置、安全设置）
 *    - 特点：支持多种数据类型（string/number/boolean/json）、分类管理、可见性控制、只读保护
 *    - 表名：system_settings，主键：setting_id，外键：updated_by（最后更新管理员）
 *    - 业务场景：系统配置管理、参数调整、策略控制
 */

models.PopupBanner = require('./PopupBanner')(sequelize, DataTypes)
/*
 * ✅ PopupBanner：弹窗Banner配置（首页弹窗管理）
 *    - 用途：管理微信小程序首页弹窗图片和跳转链接
 *    - 特点：支持多弹窗位、时间范围控制、点击跳转、显示顺序
 *    - 表名：popup_banners，主键：banner_id，外键：created_by
 *    - 业务场景：首页活动弹窗、公告展示、运营推广
 */

// 🔴 图片和存储系统
models.ImageResources = require('./ImageResources')(sequelize, DataTypes)

// 🔴 兑换市场系统

models.ExchangeItem = require('./ExchangeItem')(sequelize, DataTypes)
/*
 * ✅ ExchangeItem：兑换市场商品配置表
 *    - 用途：配置用户可以使用虚拟奖品价值或积分兑换的商品
 *    - 特点：支持虚拟奖品/积分/混合支付方式
 *    - 表名：exchange_items，主键：item_id
 *    - 业务场景：用户抽奖获得虚拟奖品（水晶等）→ 使用虚拟奖品价值兑换商品
 */

models.ExchangeRecord = require('./ExchangeRecord')(sequelize, DataTypes)
/*
 * ✅ ExchangeRecord：B2C兑换订单记录表
 *    - 用途：记录用户在B2C官方商城的兑换订单
 *    - 特点：材料资产支付、订单管理、发货追踪
 *    - 表名：exchange_records，主键：record_id
 *    - 业务场景：用户选择商品 → 扣除材料资产 → 创建订单 → 发货
 *    - API路由：/api/v4/shop/exchange（从 /api/v4/market 迁移）
 */

/*
 * 🔥 统一资产底座系统（2025年12月15日新增）
 *    ⚠️ UserAssetAccount 已废弃并删除（2025-12-31）
 *    新架构使用：Account + AccountAssetBalance + AssetTransaction
 */

models.AssetTransaction = require('./AssetTransaction')(sequelize, DataTypes)
/*
 * ✅ AssetTransaction：资产流水表（记录所有资产变动流水）
 *    - 用途：记录DIAMOND和材料资产的所有变动流水
 *    - 特点：业界标准幂等架构（idempotency_key唯一约束），delta_amount可正可负，记录变动后余额
 *    - 表名：asset_transactions，主键：transaction_id，外键：account_id
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
 *    - 表名：consumption_records，主键：record_id，外键：user_id、merchant_id
 *    - 业务场景：商家扫码录入消费→积分冻结→平台审核→积分到账
 *    - 关联：AssetTransaction（资产冻结）、ContentReviewRecord（审核流程）
 */

// 🔴 审核系统：两个完全不同的业务概念（⚠️ 最容易混淆，务必区分！）
models.ContentReviewRecord = require('./ContentReviewRecord')(sequelize, DataTypes)
/*
 * ✅ ContentReviewRecord：内容审核记录（业务审核流程管理）
 *    - 用途：管理需要人工审核的业务内容（如：兑换申请、图片审核、反馈处理）
 *    - 特点：有审核流程，状态可变更（pending→approved/rejected），有审核员
 *    - 表名：content_review_records，主键：audit_id
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

// 🔴 层级化角色权限管理系统（2025年11月07日新增）
models.Store = require('./Store')(sequelize, DataTypes)
/*
 * ✅ Store：门店信息管理
 *    - 用途：记录合作商家门店信息，用于业务员分派和消费记录关联
 *    - 特点：门店名称、编号、地址、联系人、所属区域、分配业务员
 *    - 表名：stores，主键：store_id
 *    - 业务场景：区域负责人创建门店→分配业务经理→业务员负责门店消费记录录入
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

/*
 * ❌ RoleChangeLog：已废弃（2026-01-09 功能重复检查报告决策）
 *    - 原因：表中无数据（0行），改用 UserRoleChangeRecord + AdminOperationLog 组合
 *    - 迁移：20260109120000-drop-deprecated-audit-tables.js
 *    - 替代方案：UserRoleChangeRecord（业务事件主键）+ AdminOperationLog（审计真相源）
 */

// 🔴 审计业务记录表（2026-01-08 决策9实现 - 为无天然业务主键的操作提供审计锚点）
models.UserStatusChangeRecord = require('./UserStatusChangeRecord')(sequelize, DataTypes)
/*
 * ✅ UserStatusChangeRecord：用户状态变更记录
 *    - 用途：为 user_status_change 审计日志提供业务主键（record_id → target_id）
 *    - 特点：幂等键派生（决策6）、事务内创建（决策7）、关键操作阻断（决策5）
 *    - 表名：user_status_change_records，主键：record_id
 *    - 业务场景：管理员封禁/解封用户→创建变更记录→记录审计日志→可追溯
 */

models.UserRoleChangeRecord = require('./UserRoleChangeRecord')(sequelize, DataTypes)
/*
 * ✅ UserRoleChangeRecord：用户角色变更记录
 *    - 用途：为 role_change 审计日志提供业务主键（record_id → target_id）
 *    - 特点：幂等键派生（决策6）、事务内创建（决策7）、关键操作阻断（决策5）
 *    - 表名：user_role_change_records，主键：record_id
 *    - 业务场景：管理员变更用户角色→创建变更记录→记录审计日志→可追溯
 *    - 注意：与 RoleChangeLog 区别 - 本模型专用于审计主键生成，不记录角色权限本身的变更
 */

models.LotteryClearSettingRecord = require('./LotteryClearSettingRecord')(sequelize, DataTypes)
/*
 * ✅ LotteryClearSettingRecord：抽奖清除设置记录
 *    - 用途：为 lottery_clear_settings 审计日志提供业务主键（record_id → target_id）
 *    - 特点：幂等键派生（决策6）、事务内创建（决策7）、关键操作阻断（决策5）
 *    - 表名：lottery_clear_setting_records，主键：record_id
 *    - 业务场景：管理员清除用户抽奖设置→创建清除记录→记录审计日志→可追溯
 *    - 解决问题：原 target_id: null 导致关键操作被阻断
 */

/*
 * ❌ MerchantPointsReview：已废弃（2026-01-09 功能重复检查报告决策）
 *    - 原因：表中无数据（0行），已决策迁移到统一审批流（ContentReviewRecord）
 *    - 迁移：20260109120000-drop-deprecated-audit-tables.js
 *    - 替代方案：ContentReviewRecord（auditable_type='merchant_points'）
 *    - 业务逻辑：冻结-审核-结算链路保留，但状态管理统一走 ContentReviewRecord
 */

models.WebSocketStartupLog = require('./WebSocketStartupLog')(sequelize, DataTypes)
/*
 * ✅ WebSocketStartupLog：WebSocket服务启动日志
 *    - 用途：记录WebSocket服务启动/停止事件，用于审计和稳定性分析
 *    - 特点：记录启动时间、停止时间、运行时长、峰值连接数、服务器信息
 *    - 表名：websocket_startup_logs，主键：log_id
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

// 🔴 V4.2 交易市场升级模型（Phase 2）
models.MarketListing = require('./MarketListing')(sequelize, DataTypes)
/*
 * ✅ MarketListing：市场挂牌
 *    - 用途：管理交易市场的挂牌信息（不可叠加物品 + 可叠加资产）
 *    - 特点：支持锁定机制、冻结标记、状态流转（on_sale → locked → sold/withdrawn）
 *    - 表名：market_listings，主键：listing_id
 *    - 业务场景：创建挂牌→购买挂牌→撤回挂牌→超时解锁
 */

models.TradeOrder = require('./TradeOrder')(sequelize, DataTypes)
/*
 * ✅ TradeOrder：交易订单
 *    - 用途：管理所有交易订单，提供强幂等性控制和对账支持
 *    - 特点：business_id全局唯一、对账字段（gross_amount = fee_amount + net_amount）
 *    - 表名：trade_orders，主键：order_id，唯一约束：business_id
 *    - 业务场景：创建订单→冻结资产→成交结算→取消订单
 */

// 🔴 V4.2 背包双轨架构模型（Phase 1 - 核销码系统）
models.RedemptionOrder = require('./RedemptionOrder')(sequelize, DataTypes)
/*
 * ✅ RedemptionOrder：兑换订单
 *    - 用途：管理核销码生成和核销流程
 *    - 特点：12位Base32核销码 + SHA-256哈希存储 + 30天TTL
 *    - 表名：redemption_orders，主键：order_id（UUID），唯一约束：code_hash
 *    - 业务场景：生成核销码→核销验证→过期清理
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
  '✅ V15.0 Models loaded:',
  Object.keys(models).filter(key => key !== 'sequelize' && key !== 'Sequelize').length,
  'models (UUID角色系统集成版)'
)

module.exports = models
