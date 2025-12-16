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

// ✅ LoginLog模型已删除 - 过度设计，改用User.last_login字段统计活跃用户 - 2025年09月22日

// 🔴 积分和账户系统模型（用户相关功能分散 - 有业务合理性）
models.UserPointsAccount = require('./UserPointsAccount')(sequelize, DataTypes)
/*
 * ✅ UserPointsAccount：用户积分账户（一对一关系）
 *    - 用途：管理用户积分余额和账户状态
 *    - 特点：记录可用积分、累计获得、累计消耗、账户冻结状态
 *    - 表名：user_points_accounts，主键：account_id，外键：user_id
 *    - 业务场景：积分余额查询、账户健康检查、推荐数据生成
 */

models.PointsTransaction = require('./PointsTransaction')(sequelize, DataTypes)
/*
 * ✅ PointsTransaction：积分交易记录（一对多关系）
 *    - 用途：记录用户所有的积分变动历史
 *    - 特点：记录交易类型、金额、来源、事务ID、交易时间
 *    - 表名：points_transactions，主键：transaction_id，外键：account_id
 *    - 业务场景：积分获得、积分消耗、交易查询、报表生成
 * ⚠️ PointsRecord.js 已被 PointsTransaction.js 替代并删除
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
/*
 * 🔥 LotteryRecord 已完全合并到 LotteryDraw，不保留向后兼容性 - 2025年01月21日
 * 🗑️ LotteryPity模型已删除 - 100%未使用的废弃表，功能已被LotteryDraw+User替代 - 2025年10月01日
 */
models.LotteryPreset = require('./LotteryPreset')(sequelize, DataTypes)
// 🗑️ UserSpecificPrizeQueue模型已删除 - 功能过于复杂，实际业务中未使用 - 2025年09月22日

models.LotteryManagementSetting = require('./LotteryManagementSetting')(sequelize, DataTypes)
/*
 * ✅ LotteryManagementSetting：抽奖管理设置（管理员抽奖干预）
 *    - 用途：存储管理员设置的抽奖干预规则（强制中奖、强制不中奖、概率调整、用户专属队列）
 *    - 特点：支持设置过期、状态管理、审计追溯
 *    - 表名：lottery_management_settings，主键：setting_id，外键：user_id、created_by
 *    - 业务场景：活动补偿、VIP特权、防刷保护、精准运营、测试验证
 */

/*
 * 🔴 业务功能模型（商品和库存系统）
 * 🗑️ models.BusinessEvent模型已删除 - 过度设计，使用现有业务记录模型替代 - 2025年01月21日
 * 🗑️ models.BusinessConfigs模型已删除 - 使用硬编码10%概率替代 - 2025年01月21日
 */
models.Product = require('./Product')(sequelize, DataTypes)
/*
 * ✅ Product：商品信息管理
 *    - 用途：管理可兑换的商品信息（实物、虚拟商品、服务等）
 *    - 特点：商品名称、价格、库存、状态、描述
 *    - 表名：products，主键：product_id
 */

models.UserInventory = require('./UserInventory')(sequelize, DataTypes)
/*
 * ✅ UserInventory：用户库存管理（已迁移至 ItemInstance）
 *    - 用途：管理用户获得的奖品、商品和优惠券
 *    - 特点：物品状态（可用/使用/过期）、来源追溯、核销码、转让记录
 *    - 表名：user_inventory，主键：inventory_id，外键：user_id
 *    - 业务场景：抽奖中奖后分发、兑换获得、使用核销、转让给他人
 *    - ⚠️ 数据已迁移至 item_instances 表，user_inventory 作为历史兼容保留
 */

models.ItemInstance = require('./ItemInstance')(sequelize, DataTypes)
/*
 * ✅ ItemInstance：物品实例所有权管理（物品所有权真相 - P0-2）
 *    - 用途：管理不可叠加物品的所有权状态（装备、卡牌、优惠券等）
 *    - 特点：单源真相、状态机管理、订单锁定、所有权转移
 *    - 表名：item_instances，主键：item_instance_id，外键：owner_user_id
 *    - 业务场景：物品上架、购买转移、使用核销、过期管理
 *    - 状态流转：available → locked → transferred/used/expired
 */

models.TradeRecord = require('./TradeRecord')(sequelize, DataTypes)
/*
 * ✅ TradeRecord：交易记录
 *    - 用途：记录用户的各类交易行为（兑换、购买等）
 *    - 表名：trade_records，主键：record_id
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

// 🔴 图片和存储系统
models.ImageResources = require('./ImageResources')(sequelize, DataTypes)
// 🔥 V14.1合并优化：UploadReview模型已合并到ImageResources统一资源管理模型

/*
 * 🔴 任务系统模型已移除 - 与抽奖系统无关
 * 已删除：TaskTemplate, UserTask, TaskProgressLog, ScheduledTask
 */

/*
 * 🔴 多池系统模型 - 已删除
 * 多池配置模型已删除 - 使用简化三策略系统
 * UserPoolAccess模型已删除 - 功能合并到User表的pool_access_level字段 (2025年09月22日)
 */

// 🔥 双账户模型：兑换市场系统（2025年12月06日新增）
models.ExchangeItem = require('./ExchangeItem')(sequelize, DataTypes)
/*
 * ✅ ExchangeItem：兑换市场商品配置表
 *    - 用途：配置用户可以使用虚拟奖品价值或积分兑换的商品
 *    - 特点：支持虚拟奖品/积分/混合支付方式
 *    - 表名：exchange_items，主键：item_id
 *    - 业务场景：用户抽奖获得虚拟奖品（水晶等）→ 使用虚拟奖品价值兑换商品
 */

models.ExchangeMarketRecord = require('./ExchangeMarketRecord')(sequelize, DataTypes)
/*
 * ✅ ExchangeMarketRecord：兑换市场订单记录表
 *    - 用途：记录用户在兑换市场中的兑换订单
 *    - 特点：虚拟奖品价值/积分支付、订单管理、发货追踪
 *    - 表名：exchange_market_records，主键：record_id
 *    - 业务场景：用户选择商品 → 扣除虚拟奖品价值 → 创建订单 → 发货
 */

// 🔥 统一资产底座系统（2025年12月15日新增）
models.UserAssetAccount = require('./UserAssetAccount')(sequelize, DataTypes)
/*
 * ✅ UserAssetAccount：用户资产账户表（统一管理DIAMOND和材料资产余额）
 *    - 用途：管理用户的DIAMOND资产和材料资产余额
 *    - 特点：DIAMOND和所有材料使用同一套账本（通过asset_code区分），user_id + asset_code组合唯一
 *    - 表名：user_asset_accounts，主键：asset_account_id，外键：user_id
 *    - 业务场景：交易市场DIAMOND结算、兑换市场材料资产扣减、材料转换（碎红水晶→DIAMOND）
 */

models.AssetTransaction = require('./AssetTransaction')(sequelize, DataTypes)
/*
 * ✅ AssetTransaction：资产流水表（记录所有资产变动流水）
 *    - 用途：记录DIAMOND和材料资产的所有变动流水
 *    - 特点：支持幂等性控制（business_id + business_type唯一约束），delta_amount可正可负，记录变动后余额
 *    - 表名：asset_transactions，主键：transaction_id，外键：user_id
 *    - 业务场景：市场购买（买家扣减、卖家入账、平台手续费）、兑换扣减、材料转换、对账审计
 */

// 🔥 统一账户体系（2025年12月15日新增 - Phase 1）
models.Account = require('./Account')(sequelize, DataTypes)
/*
 * ✅ Account：账户主体表（用户账户 + 系统账户统一管理）
 *    - 用途：统一账户体系，区分用户账户（account_type=user）和系统账户（account_type=system）
 *    - 特点：用户账户关联user_id（唯一），系统账户使用system_code（唯一），如SYSTEM_PLATFORM_FEE（平台手续费）
 *    - 表名：accounts，主键：account_id，外键：user_id
 *    - 业务场景：替换PLATFORM_USER_ID方案，手续费入系统账户，支持系统发放/销毁/托管账户
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
 *    - 关联：PointsTransaction（积分冻结）、ContentReviewRecord（审核流程）
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

models.RoleChangeLog = require('./RoleChangeLog')(sequelize, DataTypes)
/*
 * ✅ RoleChangeLog：角色权限变更日志
 *    - 用途：记录所有权限变更操作，用于审计和追踪（离职、调动、权限变更等）
 *    - 特点：操作类型、目标用户、操作人、影响数量、操作原因、IP地址
 *    - 表名：role_change_logs，主键：log_id
 *    - 业务场景：停用业务员权限→批量停用业务经理及下属→权限变更审计
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

/*
 * 🔴 统一决策引擎V4.0模型
 * 🗑️ models.DecisionRecord模型已删除 - 过度设计，餐厅抽奖系统不需要决策过程分析 - 2025年01月21日
 * ⚠️ 临时禁用 ProbabilityLog 模型 - 2025年01月21日
 * models.ProbabilityLog = require('./unified/ProbabilityLog')(sequelize, DataTypes)
 * ⚠️ 删除 SystemMetrics 模型 - 过度设计，不符合业务需求 - 2025年01月21日
 * models.SystemMetrics = require('./unified/SystemMetrics')(sequelize, DataTypes)
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

console.log(
  '✅ V15.0 Models loaded:',
  Object.keys(models).filter(key => key !== 'sequelize' && key !== 'Sequelize').length,
  'models (UUID角色系统集成版)'
)

module.exports = models
