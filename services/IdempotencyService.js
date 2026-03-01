/**
 * 入口幂等服务 - IdempotencyService
 * 管理API请求的幂等性，实现"重试返回首次结果"
 *
 * 业务场景：
 * - 抽奖请求幂等：相同幂等键的重复请求返回首次抽奖结果
 * - 支付请求幂等：防止重复扣费
 * - 任何需要幂等性保证的POST/PUT/DELETE请求
 *
 * 核心功能：
 * - getOrCreateRequest：尝试获取或创建幂等请求记录
 * - markAsCompleted：标记请求为完成状态，保存结果快照
 * - markAsFailed：标记请求为失败状态
 * - cleanupExpired：清理过期记录（completed + failed）
 * - autoFailProcessingTimeout：自动将超时 processing 转为 failed
 *
 * 状态机：
 * - processing → completed：正常完成
 * - processing → failed：处理失败或超时
 * - failed → processing：重试（更新状态）
 *
 * 业界标准形态升级（2026-01-02）：
 * - TTL 从 24h 升级到 7 天
 * - fingerprint 包含 user_id, method, path, query, body
 * - 清理策略包含 failed 记录
 * - processing 超时自动转 failed（60秒）
 *
 * 创建时间：2025-12-26
 * 更新时间：2026-01-02 - 业界标准形态破坏性重构
 * 版本：2.0.0 - 业界标准幂等架构
 */

'use strict'

const crypto = require('crypto')
const { sequelize } = require('../config/database')
const logger = require('../utils/logger')

// 配置常量
const TTL_DAYS = 7 // 幂等记录保留天数
const PROCESSING_TIMEOUT_SECONDS = 60 // processing 状态超时阈值（秒）

/**
 * 敏感字段列表 - 禁止存储到 response_snapshot
 * 【决策细则9】response_snapshot 安全策略
 */
const SENSITIVE_FIELDS = [
  'token',
  'password',
  'secret',
  'access_key',
  'private_key',
  'id_card',
  'bank_card',
  'phone',
  'mobile',
  'jwt',
  'refresh_token',
  'session_key',
  'openid',
  'unionid'
]

/**
 * response_snapshot 大小限制（字节）
 * 【决策6】response_snapshot 存储策略
 * - 软限制 32KB：超过记录告警但仍存储
 * - 硬限制 64KB：超过只存关键字段 + 截断标记
 */
const SNAPSHOT_SOFT_LIMIT = 32768 // 32KB
const SNAPSHOT_HARD_LIMIT = 65536 // 64KB

/**
 * 业务操作 canonical 映射表（全量覆盖所有写接口）
 *
 * - 幂等语义从 URL 解耦，使用稳定的 canonical_operation 作为幂等作用域
 * - 所有写接口必须在此映射表中显式定义
 * - 未定义的路径直接返回 500 错误（严格模式）
 *
 * 命名规范：{MODULE}_{ACTION}_{OBJECT}
 * 例如：SHOP_EXCHANGE_CREATE_ORDER = 商城模块 + 兑换动作 + 订单对象
 */
const CANONICAL_OPERATION_MAP = {
  /*
   * ===============================================================
   * 核心业务写接口 - 需要严格幂等保护
   * 注意：路径参数统一使用 :id 占位符，normalizePath 会自动转换
   * ===============================================================
   */

  // ===== 抽奖系统 =====
  '/api/v4/lottery/draw': 'LOTTERY_DRAW', // 抽奖
  '/api/v4/lottery/preset/create': 'LOTTERY_PRESET_CREATE', // 创建抽奖预设

  /*
   * ===== 抽奖活动配置查询（2026-01-20 V2.2 路由重构）=====
   *
   * 重构说明：
   * - /prizes/:campaignCode → /campaigns/:code/prizes
   * - /config/:campaignCode → /campaigns/:code/config
   *
   * 设计原则：
   * - 活动（campaign）是配置实体，使用业务码（:code）作为标识符
   * - RESTful 层级结构：活动 → 奖品/配置
   */
  '/api/v4/lottery/campaigns/:code/prizes': 'CAMPAIGN_PRIZES', // 获取活动奖品列表
  '/api/v4/lottery/campaigns/:code/config': 'CAMPAIGN_CONFIG', // 获取活动抽奖配置

  // ===== 背包域写操作 =====
  '/api/v4/backpack/items/:id/redeem': 'BACKPACK_ITEM_REDEEM', // 用户生成核销码（创建核销订单+锁定物品）
  '/api/v4/backpack/exchange': 'BACKPACK_EXCHANGE_CREATE_ORDER', // 用户端兑换商品（新路径）
  '/api/v4/shop/exchange/orders/:id/status': 'SHOP_EXCHANGE_UPDATE_STATUS', // 更新订单状态（管理操作保留在 shop）

  // ===== 材料转换 =====
  '/api/v4/shop/assets/convert': 'SHOP_ASSET_CONVERT', // 资产转换（canonical 路径）

  // ===== 汇率兑换（2026-02-23 市场增强） =====
  '/api/v4/market/exchange-rates/convert': 'EXCHANGE_RATE_CONVERT', // 执行汇率兑换

  // ===== 交易市场 - 物品 =====
  '/api/v4/market/list': 'MARKET_CREATE_LISTING', // 物品上架
  '/api/v4/market/listings/:id/purchase': 'MARKET_PURCHASE_LISTING', // 购买物品
  '/api/v4/market/listings/:id/withdraw': 'MARKET_CANCEL_LISTING', // 撤回物品

  // ===== 交易市场 - 担保码确认（Phase 4） =====
  '/api/v4/market/trade-orders/:id/confirm-delivery': 'MARKET_ESCROW_CONFIRM', // 担保码确认收货
  '/api/v4/market/trade-orders/:id/cancel': 'MARKET_ESCROW_CANCEL', // 担保码交易取消

  // ===== 交易市场 - 可叠加资产（材料） =====
  '/api/v4/market/fungible-assets/list': 'MARKET_CREATE_FUNGIBLE_LISTING', // 材料上架
  '/api/v4/market/fungible-assets/:id/purchase': 'MARKET_PURCHASE_FUNGIBLE', // 购买材料
  '/api/v4/market/fungible-assets/:id/withdraw': 'MARKET_CANCEL_FUNGIBLE_LISTING', // 材料撤回

  // ===== 核销系统 =====
  '/api/v4/shop/redemption/orders': 'REDEMPTION_CREATE_ORDER', // 创建核销订单（canonical 路径）
  '/api/v4/shop/redemption/fulfill': 'REDEMPTION_FULFILL', // 文本码核销（canonical 路径）
  '/api/v4/shop/redemption/scan': 'REDEMPTION_QR_SCAN_FULFILL', // QR码扫码核销（Phase 1 新增）
  '/api/v4/shop/redemption/orders/:id/cancel': 'REDEMPTION_CANCEL_ORDER', // 取消核销订单

  // ===== 消费记录 =====
  '/api/v4/shop/consumption/submit': 'CONSUMPTION_SUBMIT', // 提交消费记录（canonical 路径）
  '/api/v4/shop/consumption/:id': 'CONSUMPTION_DELETE', // 删除消费记录（canonical 路径）
  '/api/v4/shop/consumption/:id/restore': 'CONSUMPTION_RESTORE', // 恢复消费记录（canonical 路径）

  // ===== 会员解锁（2026-02-16 从 shop/premium 迁移到 backpack/exchange，决策2） =====
  '/api/v4/backpack/exchange/unlock-premium': 'PREMIUM_UNLOCK', // 解锁高级空间（新路径）
  '/api/v4/shop/premium/unlock': 'PREMIUM_UNLOCK', // 解锁高级会员（旧路径保留映射，实际路由已删除）

  // ===== 竞价系统（臻选空间/幸运空间竞价功能 2026-02-16） =====
  '/api/v4/backpack/bid': 'BID_PLACE_BID', // 提交竞价出价
  '/api/v4/console/bid-management': 'CONSOLE_BID_CREATE', // 管理后台创建竞价商品
  '/api/v4/console/bid-management/:id/settle': 'CONSOLE_BID_SETTLE', // 管理后台手动结算竞价
  '/api/v4/console/bid-management/:id/cancel': 'CONSOLE_BID_CANCEL', // 管理后台取消竞价

  // ===== 商户积分 =====
  '/api/v4/merchant-points': 'MERCHANT_POINTS_CREATE', // 商户积分申请（canonical 路径，去尾斜杠）

  // ===== 用户数据查询 - 兑换订单审核（2026-02-18） =====
  '/api/v4/console/user-data-query/:id/exchange-records/:id/review':
    'CONSOLE_EXCHANGE_ORDER_REVIEW', // 管理员审核兑换订单（完成/发货/取消）

  /*
   * ===============================================================
   * 认证系统 - 无状态操作，无需幂等重放但需要映射
   * ===============================================================
   */
  '/api/v4/auth/login': 'AUTH_LOGIN', // 用户登录
  '/api/v4/auth/send-code': 'AUTH_SEND_CODE', // 发送短信验证码
  '/api/v4/auth/decrypt-phone': 'AUTH_DECRYPT_PHONE', // 解密手机号
  '/api/v4/auth/quick-login': 'AUTH_QUICK_LOGIN', // 快速登录
  '/api/v4/auth/refresh': 'AUTH_TOKEN_REFRESH', // 刷新 Token
  '/api/v4/auth/logout': 'AUTH_LOGOUT', // 登出

  /*
   * ===== 权限检查 =====
   * 注意：权限路由在 app.js 中独立挂载到 /api/v4/permissions，
   * 但路由文件 routes/v4/auth/permissions.js 中定义的路径是相对路径
   */
  '/api/v4/permissions/check': 'PERM_CHECK', // 权限检查（canonical 路径）
  '/api/v4/permissions/cache/invalidate': 'PERM_CACHE_INVALIDATE', // 权限缓存失效（canonical 路径）
  '/api/v4/permissions/batch-check': 'PERM_BATCH_CHECK', // 批量权限检查（canonical 路径）
  '/api/v4/auth/permissions/check': 'AUTH_PERM_CHECK', // 权限检查（auth 子路由挂载）
  '/api/v4/auth/permissions/cache/invalidate': 'AUTH_PERM_CACHE_INVALIDATE', // 权限缓存失效（auth 子路由挂载）
  '/api/v4/auth/permissions/batch-check': 'AUTH_PERM_BATCH_CHECK', // 批量权限检查（auth 子路由挂载）

  /*
   * ===============================================================
   * 系统功能 - 用户交互写操作
   * ===============================================================
   */
  '/api/v4/system/feedback': 'SYSTEM_FEEDBACK_SUBMIT', // 提交反馈
  '/api/v4/system/chat/sessions': 'CHAT_SESSION_CREATE', // 创建聊天会话
  '/api/v4/system/chat/sessions/:id/messages': 'CHAT_MESSAGE_SEND', // 发送聊天消息
  '/api/v4/system/chat/sessions/:id/upload': 'CHAT_IMAGE_UPLOAD', // 聊天图片上传
  '/api/v4/system/chat/sessions/:id/rate': 'CHAT_SESSION_RATE', // 用户提交满意度评分
  '/api/v4/backpack/exchange/orders/:id/rate': 'EXCHANGE_ORDER_RATE', // 兑换订单评分（需求6）
  '/api/v4/system/notifications/:id/read': 'NOTIFICATION_MARK_READ', // 标记通知已读（修复：system/:id/read → system/notifications/:id/read）
  '/api/v4/system/notifications/read-all': 'NOTIFICATION_READ_ALL', // 全部已读（修复：system/read-all → system/notifications/read-all）
  '/api/v4/system/notifications/clear': 'NOTIFICATION_CLEAR', // 清空通知（修复：system/clear → system/notifications/clear）
  '/api/v4/system/notifications/send': 'NOTIFICATION_SEND', // 发送通知（修复：system/send → system/notifications/send）

  // ===== 活动参与 =====
  '/api/v4/activities/:id/participate': 'ACTIVITY_PARTICIPATE', // 参与活动
  '/api/v4/activities/:id/configure-conditions': 'ACTIVITY_CONFIG_CONDITIONS', // 配置活动条件

  // ===== 员工管理（商家端）=====
  '/api/v4/shop/staff/add': 'SHOP_STAFF_CREATE', // 创建员工（canonical 路径）
  '/api/v4/shop/staff/transfer': 'SHOP_STAFF_TRANSFER', // 转移员工（canonical 路径）
  '/api/v4/shop/staff/disable': 'SHOP_STAFF_DISABLE', // 停用员工（canonical 路径）
  '/api/v4/shop/staff/enable': 'SHOP_STAFF_ENABLE', // 激活员工（canonical 路径）

  // ===== 风险管理（商家端）=====
  '/api/v4/shop/risk/alerts/:id/review': 'SHOP_RISK_REVIEW', // 风险审核（canonical 路径）
  '/api/v4/shop/risk/alerts/:id/ignore': 'SHOP_RISK_IGNORE', // 忽略风险（canonical 路径）

  /*
   * ===============================================================
   * 管理后台写操作
   * ===============================================================
   */

  // ===== 管理员登录 =====
  '/api/v4/console/auth/login': 'ADMIN_AUTH_LOGIN', // 管理员登录（修复：console/login → console/auth/login）

  // ===== 资产调整 =====
  '/api/v4/console/asset-adjustment/adjust': 'ADMIN_ASSET_ADJUST', // 资产调整（修复：console/adjust → console/asset-adjustment/adjust）
  '/api/v4/console/asset-adjustment/batch-adjust': 'ADMIN_ASSET_BATCH_ADJUST', // 批量调整（修复：console/batch-adjust → console/asset-adjustment/batch-adjust）

  // ===== 审计日志 =====
  '/api/v4/console/audit-logs/cleanup': 'ADMIN_AUDIT_LOG_CLEANUP', // 清理审计日志（修复：console/cleanup → console/audit-logs/cleanup）

  // ===== 活动预算 =====
  '/api/v4/console/campaign-budget/campaigns/:id': 'ADMIN_CAMPAIGN_UPDATE', // 更新活动
  '/api/v4/console/campaign-budget/campaigns/:id/validate': 'ADMIN_CAMPAIGN_VALIDATE', // 验证活动
  '/api/v4/console/campaign-budget/campaigns/:id/pool/add': 'ADMIN_CAMPAIGN_POOL_ADD', // 添加预算池
  '/api/v4/console/campaign-budget/campaigns/:id/budget-status': 'ADMIN_CAMPAIGN_BUDGET_STATUS', // 获取预算状态

  // ===== 系统配置 =====
  '/api/v4/console/config/config': 'ADMIN_CONFIG_UPDATE', // 更新系统配置（修复：console/config → console/config/config）
  '/api/v4/console/config/test/simulate': 'ADMIN_CONFIG_TEST', // 测试配置（修复：console/test/simulate → console/config/test/simulate）

  // ===== 消费审批 =====
  '/api/v4/console/consumption/approve/:id': 'ADMIN_CONSUMPTION_APPROVE', // 审批消费（修复：console/approve/:id → console/consumption/approve/:id）
  '/api/v4/console/consumption/reject/:id': 'ADMIN_CONSUMPTION_REJECT', // 拒绝消费（修复：console/reject/:id → console/consumption/reject/:id）
  '/api/v4/console/consumption/batch-review': 'ADMIN_CONSUMPTION_BATCH_REVIEW', // 批量审核消费记录（2026-01-31 P0 运营后台任务清单）

  // ===== 客服管理 =====
  '/api/v4/console/customer-service/sessions/:id/send': 'ADMIN_CS_MESSAGE_SEND', // 发送客服消息（canonical 路径）
  '/api/v4/console/customer-service/sessions/:id/mark-read': 'ADMIN_CS_MESSAGE_READ', // 标记已读（canonical 路径）
  '/api/v4/console/customer-service/sessions/:id/transfer': 'ADMIN_CS_TRANSFER', // 转接会话（canonical 路径）
  '/api/v4/console/customer-service/sessions/:id/close': 'ADMIN_CS_CLOSE', // 关闭会话（canonical 路径）
  '/api/v4/console/customer-service/sessions/:id/accept': 'ADMIN_CS_ACCEPT', // 客服接单（waiting → assigned）
  '/api/v4/console/customer-service/sessions/:id/tag': 'ADMIN_CS_TAG', // 会话打标签
  '/api/v4/console/customer-service/sessions/:id/satisfaction': 'ADMIN_CS_SATISFACTION_REQUEST', // 请求满意度评价（WebSocket推送）

  // ===== 客服座席管理 =====
  '/api/v4/console/customer-service/agents': 'ADMIN_CS_AGENT_CREATE', // 注册客服座席
  '/api/v4/console/customer-service/agents/:id': 'ADMIN_CS_AGENT_UPDATE', // 更新或删除客服座席（PUT/DELETE）

  // ===== 客服用户分配管理 =====
  '/api/v4/console/customer-service/assignments': 'ADMIN_CS_ASSIGNMENT_CREATE', // 分配用户给客服
  '/api/v4/console/customer-service/assignments/batch': 'ADMIN_CS_ASSIGNMENT_BATCH', // 批量分配用户
  '/api/v4/console/customer-service/assignments/:id': 'ADMIN_CS_ASSIGNMENT_DELETE', // 解除用户分配

  // ===== GM工作台 — 工单管理 =====
  '/api/v4/console/customer-service/issues': 'ADMIN_CS_ISSUE_CREATE', // 创建工单
  '/api/v4/console/customer-service/issues/:id': 'ADMIN_CS_ISSUE_UPDATE', // 更新工单
  '/api/v4/console/customer-service/issues/:id/notes': 'ADMIN_CS_ISSUE_NOTE_ADD', // 添加工单备注

  // ===== GM工作台 — 补偿发放 =====
  '/api/v4/console/customer-service/gm-tools/compensate': 'ADMIN_CS_COMPENSATE', // 客服补偿发放

  // ===== GM工作台 — 消息模板 =====
  '/api/v4/console/customer-service/gm-tools/templates': 'ADMIN_CS_TEMPLATE_UPDATE', // 更新消息模板

  // ===== 图片管理 =====
  '/api/v4/console/images/upload': 'ADMIN_IMAGE_UPLOAD', // 上传图片
  '/api/v4/console/images/:id/bind': 'ADMIN_IMAGE_BIND', // 绑定图片
  '/api/v4/console/images/:id': 'ADMIN_IMAGE_DELETE', // 删除图片（新增 DELETE 方法映射）

  // ===== 资产组合管理 =====
  '/api/v4/console/assets/portfolio/items/': 'ADMIN_ASSET_ITEM_CREATE', // 创建资产组合项（尾斜杠）
  '/api/v4/console/assets/portfolio/items/:id': 'ADMIN_ASSET_ITEM_UPDATE', // 更新或删除资产组合项（PUT/DELETE）

  // ===== 物品管理（三表模型写操作） =====
  '/api/v4/console/items/:id/freeze': 'ADMIN_ITEM_FREEZE', // 管理员冻结物品
  '/api/v4/console/items/:id/unfreeze': 'ADMIN_ITEM_UNFREEZE', // 管理员解冻物品
  '/api/v4/console/items/:id/transfer': 'ADMIN_ITEM_TRANSFER', // 管理员转移物品

  // ===== 抽奖干预 =====
  '/api/v4/console/lottery-management/probability-adjust': 'ADMIN_LOTTERY_PROB_ADJUST', // 概率调整（canonical 路径）
  '/api/v4/console/lottery-management/user-specific-queue': 'ADMIN_LOTTERY_USER_QUEUE', // 用户队列（canonical 路径）
  '/api/v4/console/lottery-management/force-win': 'ADMIN_LOTTERY_FORCE_WIN', // 强制中奖（canonical 路径）
  '/api/v4/console/lottery-management/force-lose': 'ADMIN_LOTTERY_FORCE_LOSE', // 强制不中（canonical 路径）
  '/api/v4/console/lottery-management/interventions/:id/cancel':
    'ADMIN_LOTTERY_INTERVENTION_CANCEL', // 取消干预（canonical 路径）
  '/api/v4/console/lottery-management/clear-user-settings/:id': 'ADMIN_LOTTERY_CLEAR_USER', // 清除用户设置（DELETE）
  '/api/v4/console/lottery-management/user-settings/:id': 'ADMIN_LOTTERY_USER_SETTINGS_DELETE', // 删除用户抽奖设置（DELETE 方法）

  // ===== 策略配置（9策略活动级开关） =====
  '/api/v4/console/lottery-campaigns/:id/strategy-config': 'ADMIN_LOTTERY_STRATEGY_CONFIG_UPDATE', // 批量更新活动策略配置（PUT）

  // ===== 孤儿冻结清理 =====
  '/api/v4/console/orphan-frozen/cleanup': 'ADMIN_ORPHAN_CLEANUP', // 孤儿清理（修复：console/order → console/orphan-frozen/cleanup）

  /*
   * ===== 奖池管理（2026-01-20 V2.2 路由重构）=====
   * 奖品池（按活动查询）：配置实体，使用 :code
   */
  '/api/v4/console/prize-pool/:code': 'ADMIN_PRIZE_POOL_BY_CAMPAIGN', // 获取活动奖品池
  // 奖品配置实例：事务实体，使用 :id
  '/api/v4/console/prize-pool/prize/:id': 'ADMIN_PRIZE_UPDATE', // 更新奖品或删除奖品
  '/api/v4/console/prize-pool/prize/:id/add-stock': 'ADMIN_PRIZE_ADD_STOCK', // 增加库存
  '/api/v4/console/prize-pool/batch-add': 'ADMIN_PRIZE_BATCH_ADD', // 批量添加奖品
  '/api/v4/console/prize-pool/:code/add-prize': 'ADMIN_PRIZE_ADD_TO_CAMPAIGN', // 为活动添加单个奖品
  '/api/v4/console/prize-pool/prize/:id/stock': 'ADMIN_PRIZE_SET_STOCK', // 设置绝对库存
  '/api/v4/console/prize-pool/:code/batch-stock': 'ADMIN_PRIZE_BATCH_STOCK', // 批量更新库存
  '/api/v4/console/prize-pool/:code/sort-order': 'ADMIN_PRIZE_SORT_ORDER', // 批量更新排序

  // ===== 分群规则管理 =====
  '/api/v4/console/segment-rules': 'ADMIN_SEGMENT_RULE_CREATE', // 创建分群策略
  '/api/v4/console/segment-rules/:code': 'ADMIN_SEGMENT_RULE_UPDATE', // 更新/删除分群策略

  // ===== 抽奖配额管理 =====
  '/api/v4/console/lottery-quota/rules/': 'ADMIN_LOTTERY_QUOTA_CREATE', // 创建配额规则（修复：尾斜杠）
  '/api/v4/console/lottery-quota/rules/:id': 'ADMIN_LOTTERY_QUOTA_UPDATE', // 更新配额规则（PUT）
  '/api/v4/console/lottery-quota/rules/:id/disable': 'ADMIN_LOTTERY_QUOTA_DISABLE', // 禁用配额规则
  '/api/v4/console/lottery-quota/users/:id/bonus': 'ADMIN_LOTTERY_QUOTA_BONUS', // 赠送抽奖次数

  // ===== 用户管理 =====
  '/api/v4/console/user-management/points/adjust': 'ADMIN_USER_POINTS_ADJUST', // 调整用户积分
  '/api/v4/console/user-management/users/:id/role': 'ADMIN_USER_ROLE_UPDATE', // 更新用户角色
  '/api/v4/console/user-management/users/:id/status': 'ADMIN_USER_STATUS_UPDATE', // 更新用户状态

  // ===== 角色权限管理（2026-01-26 新增）=====
  '/api/v4/console/user-management/roles': 'ADMIN_ROLE_CREATE', // 创建角色
  '/api/v4/console/user-management/roles/:id': 'ADMIN_ROLE_UPDATE', // 更新/删除角色（:role_id → :id）

  /*
   * ===== 材料管理（2026-01-20 V2.2 路由重构）=====
   * 转换规则：事务实体，使用 :id
   */
  '/api/v4/console/material/conversion-rules/': 'ADMIN_MATERIAL_RULE_CREATE', // 创建转换规则
  '/api/v4/console/material/conversion-rules/:id': 'ADMIN_MATERIAL_RULE_UPDATE', // 更新或删除转换规则
  '/api/v4/console/material/conversion-rules/:id/disable': 'ADMIN_MATERIAL_RULE_DISABLE', // 禁用转换规则
  // 汇率兑换管理（2026-02-23 市场增强）
  '/api/v4/console/exchange-rates': 'ADMIN_EXCHANGE_RATE_CREATE', // 创建汇率规则
  '/api/v4/console/exchange-rates/:id': 'ADMIN_EXCHANGE_RATE_UPDATE', // 更新汇率规则
  '/api/v4/console/exchange-rates/:id/status': 'ADMIN_EXCHANGE_RATE_STATUS', // 更新汇率规则状态
  // 资产类型：配置实体，使用 :code
  '/api/v4/console/material/asset-types/': 'ADMIN_MATERIAL_TYPE_CREATE', // 创建资产类型
  '/api/v4/console/material/asset-types/:code': 'ADMIN_MATERIAL_TYPE_UPDATE', // 更新资产类型（配置实体用业务码）
  '/api/v4/console/material/asset-types/:code/disable': 'ADMIN_MATERIAL_TYPE_DISABLE', // 禁用资产类型
  '/api/v4/console/material/users/:id/adjust': 'ADMIN_MATERIAL_USER_ADJUST', // 调整用户材料余额

  /*
   * ===== 设置管理（2026-01-20 V2.2 路由重构）=====
   * 系统设置：配置实体，使用 :code
   */
  '/api/v4/console/settings/:code': 'ADMIN_SETTINGS_UPDATE', // 更新设置（配置实体用业务码）
  '/api/v4/console/cache/clear': 'ADMIN_CACHE_CLEAR', // 清除缓存

  // ===== 市场管理 =====
  '/api/v4/console/marketplace/exchange_market/items': 'ADMIN_EXCHANGE_ITEM_CREATE', // 创建兑换商品（修复：添加 marketplace 前缀）
  '/api/v4/console/marketplace/exchange_market/items/:id': 'ADMIN_EXCHANGE_ITEM_UPDATE', // 更新兑换商品（修复：添加 marketplace 前缀）或删除（DELETE）
  '/api/v4/console/marketplace/exchange_market/batch-bind-images':
    'ADMIN_EXCHANGE_BATCH_BIND_IMAGES', // 批量绑定商品图片
  '/api/v4/console/marketplace/listings/:id/force-withdraw': 'ADMIN_FORCE_WITHDRAW', // 强制下架
  '/api/v4/console/marketplace/user-listing-limit': 'ADMIN_UPDATE_USER_LISTING_LIMIT', // 调整用户上架限制

  // ===== 用户层级 =====
  '/api/v4/console/user-hierarchy/': 'ADMIN_USER_HIERARCHY_CREATE', // 创建用户层级关系（修复：尾斜杠）
  '/api/v4/console/user-hierarchy/:id/deactivate': 'ADMIN_USER_HIERARCHY_DEACTIVATE', // 停用层级
  '/api/v4/console/user-hierarchy/:id/activate': 'ADMIN_USER_HIERARCHY_ACTIVATE', // 激活层级

  // ===== 员工管理（总后台）=====
  '/api/v4/console/staff/': 'ADMIN_STAFF_CREATE', // 员工入职（修复：尾斜杠）
  '/api/v4/console/staff/transfer': 'ADMIN_STAFF_TRANSFER', // 员工转移
  '/api/v4/console/staff/disable/:id': 'ADMIN_STAFF_DISABLE', // 禁用员工
  '/api/v4/console/staff/enable': 'ADMIN_STAFF_ENABLE', // 启用员工
  '/api/v4/console/staff/:id/role': 'ADMIN_STAFF_UPDATE_ROLE', // 更新员工角色
  '/api/v4/console/staff/:id': 'ADMIN_STAFF_DELETE', // 删除员工（DELETE 方法，修改 operation 名称）

  // ===== 会话管理（2026-01-21 会话管理功能补齐）=====
  '/api/v4/console/sessions/:id/deactivate': 'ADMIN_SESSION_DEACTIVATE', // 失效单个会话
  '/api/v4/console/sessions/deactivate-user': 'ADMIN_SESSION_DEACTIVATE_USER', // 失效用户所有会话
  '/api/v4/console/sessions/cleanup': 'ADMIN_SESSION_CLEANUP', // 清理过期会话

  // ===== 门店管理 =====
  '/api/v4/console/stores/': 'ADMIN_STORE_CREATE', // 创建门店（修复：尾斜杠）
  '/api/v4/console/stores/batch-import': 'ADMIN_STORE_BATCH_IMPORT', // 批量导入门店
  '/api/v4/console/stores/:id': 'ADMIN_STORE_UPDATE', // 更新门店信息（PUT）或删除门店（DELETE）
  '/api/v4/console/stores/:id/activate': 'ADMIN_STORE_ACTIVATE', // 激活门店
  '/api/v4/console/stores/:id/deactivate': 'ADMIN_STORE_DEACTIVATE', // 停用门店

  // ===== 商家管理（多商家接入架构） =====
  '/api/v4/console/merchants/': 'ADMIN_MERCHANT_CREATE', // 创建商家
  '/api/v4/console/merchants/:id': 'ADMIN_MERCHANT_UPDATE', // 更新/删除商家（PUT/DELETE）

  // ===== 商户积分审核 =====
  '/api/v4/console/merchant-points/:id/approve': 'ADMIN_MERCHANT_APPROVE', // 审批商户积分（修复：console/:id/approve → console/merchant-points/:id/approve）
  '/api/v4/console/merchant-points/:id/reject': 'ADMIN_MERCHANT_REJECT', // 拒绝商户积分（修复：console/:id/reject → console/merchant-points/:id/reject）
  '/api/v4/console/merchant-points/batch': 'ADMIN_MERCHANT_POINTS_BATCH', // 批量审核商户积分（通过/拒绝）

  // ===== 风险告警 =====
  '/api/v4/console/risk-alerts/:id/review': 'ADMIN_RISK_ALERT_REVIEW', // 审核风险告警（修复：risk/alerts → risk-alerts）

  // ===== 反馈管理（公告已合并到 ad-campaigns?category=system） =====
  '/api/v4/console/system/feedbacks/:id/reply': 'ADMIN_FEEDBACK_REPLY', // 回复反馈
  '/api/v4/console/system/feedbacks/:id/status': 'ADMIN_FEEDBACK_STATUS', // 更新反馈状态
  '/api/v4/console/system/feedbacks/batch-status': 'ADMIN_FEEDBACK_BATCH_STATUS', // 批量更新反馈状态

  // ===== 区域管理 =====
  '/api/v4/console/regions/validate': 'ADMIN_REGION_VALIDATE', // 验证区域（修复：console/validate → console/regions/validate）

  // [已合并] 弹窗 Banner + 轮播图管理 → 使用 ad-campaigns 路由（category=operational）

  // ===== 广告系统（Phase 2-6 虚拟货币广告平台） =====

  // 统一交互日志上报（D2 定论：替代已移除的 popup_show_log / carousel_show_log 两个分散端点）
  '/api/v4/system/ad-events/interaction-log': 'AD_INTERACTION_LOG_CREATE', // 统一内容交互日志上报

  // Phase 3: 广告计划管理（用户端）
  '/api/v4/user/ad-campaigns/': 'USER_AD_CAMPAIGN_CREATE', // 创建广告计划
  '/api/v4/user/ad-campaigns/:id': 'USER_AD_CAMPAIGN_UPDATE', // 更新广告计划
  '/api/v4/user/ad-campaigns/:id/submit': 'USER_AD_CAMPAIGN_SUBMIT', // 提交审核（含钻石冻结）
  '/api/v4/user/ad-campaigns/:id/cancel': 'USER_AD_CAMPAIGN_CANCEL', // 取消计划（含钻石退回）
  '/api/v4/user/ad-campaigns/:id/interaction': 'USER_AD_CAMPAIGN_INTERACTION', // 用户端交互日志上报

  // 方案B: 用户通知操作（标记已读本身具备幂等性）
  '/api/v4/user/notifications/mark-read': 'USER_NOTIFICATION_BATCH_READ', // 批量标记已读（含全部已读）
  '/api/v4/user/notifications/:id/read': 'USER_NOTIFICATION_SINGLE_READ', // 单条标记已读

  // Phase 3: 广告计划管理（管理端）
  '/api/v4/console/ad-campaigns/': 'ADMIN_AD_CAMPAIGN_CREATE', // 管理员创建广告计划
  '/api/v4/console/ad-campaigns/:id': 'ADMIN_AD_CAMPAIGN_UPDATE_STATUS', // 管理员更新活动状态（发布/暂停）
  '/api/v4/console/ad-campaigns/:id/review': 'ADMIN_AD_CAMPAIGN_REVIEW', // 审核广告计划
  '/api/v4/console/ad-campaigns/operational': 'ADMIN_AD_CAMPAIGN_OPERATIONAL_CREATE', // 创建运营内容（弹窗/轮播，billing_mode=free）
  '/api/v4/console/ad-campaigns/system': 'ADMIN_AD_CAMPAIGN_SYSTEM_CREATE', // 创建系统通知（公告，billing_mode=free）
  '/api/v4/console/ad-campaigns/:id/publish': 'ADMIN_AD_CAMPAIGN_PUBLISH', // 发布运营/系统类型计划（draft→active）

  // Phase 3: 广告位管理（管理端）
  '/api/v4/console/ad-slots/': 'ADMIN_AD_SLOT_CREATE', // 创建广告位
  '/api/v4/console/ad-slots/:id': 'ADMIN_AD_SLOT_UPDATE', // 更新广告位
  '/api/v4/console/ad-slots/:id/toggle': 'ADMIN_AD_SLOT_TOGGLE', // 切换广告位状态

  // Phase 5: 广告事件上报
  '/api/v4/system/ad-events/impression': 'AD_IMPRESSION_REPORT', // 广告曝光上报
  '/api/v4/system/ad-events/click': 'AD_CLICK_REPORT', // 广告点击上报

  // ===== 欠账管理 =====
  '/api/v4/console/debt-management/clear': 'ADMIN_DEBT_CLEAR', // 清偿欠账
  '/api/v4/console/debt-management/limits/:id': 'ADMIN_DEBT_LIMITS_UPDATE', // 更新欠账上限
  '/api/v4/console/debt-management/limits/:id/alert-check': 'ADMIN_DEBT_ALERT_CHECK', // 检查欠账告警状态

  // ===== 活动预算验证 =====
  '/api/v4/console/campaign-budget/campaigns/:id/validate-for-launch':
    'ADMIN_CAMPAIGN_VALIDATE_FOR_LAUNCH', // 活动上线前校验

  /*
   * ===== 活动定价配置管理（2026-01-20 V2.2 路由重构）=====
   *
   * 设计原则：
   * - 活动（campaign）是配置实体，使用 :code
   * - 定价配置实例是事务实体，使用 :id
   */
  '/api/v4/console/lottery-management/campaigns/:code/pricing': 'ADMIN_PRICING_CONFIG_CREATE', // 创建定价配置
  '/api/v4/console/lottery-management/campaigns/:code/pricing/:id/activate':
    'ADMIN_PRICING_CONFIG_ACTIVATE', // 激活定价配置
  '/api/v4/console/lottery-management/campaigns/:code/pricing/:id/archive':
    'ADMIN_PRICING_CONFIG_ARCHIVE', // 归档定价配置
  '/api/v4/console/lottery-management/campaigns/:code/pricing/rollback':
    'ADMIN_PRICING_CONFIG_ROLLBACK', // 回滚定价配置
  '/api/v4/console/lottery-management/campaigns/:code/pricing/:id/schedule':
    'ADMIN_PRICING_CONFIG_SCHEDULE', // 定价配置预约

  /*
   * ===============================================================
   * 调试控制接口（仅开发环境）
   * ===============================================================
   */
  '/api/v4/debug-control/log-level': 'DEBUG_LOG_LEVEL', // 日志级别调整
  '/api/v4/debug-control/user-debug': 'DEBUG_USER_DEBUG', // 用户调试
  '/api/v4/debug-control/session-debug': 'DEBUG_SESSION', // 会话调试
  '/api/v4/debug-control/clear-debug': 'DEBUG_CLEAR', // 清除调试

  /*
   * ===============================================================
   * 功能开关管理（2026-01-21 Feature Flag 灰度发布）
   * flag_key 是配置实体业务码（如 lottery_pity_system），使用 :code
   * ===============================================================
   */
  '/api/v4/console/feature-flags/': 'ADMIN_FEATURE_FLAG_CREATE', // 创建功能开关
  '/api/v4/console/feature-flags/:code': 'ADMIN_FEATURE_FLAG_UPDATE', // 更新或删除功能开关（PUT/DELETE）
  '/api/v4/console/feature-flags/:code/toggle': 'ADMIN_FEATURE_FLAG_TOGGLE', // 切换功能开关状态
  '/api/v4/console/feature-flags/:code/whitelist': 'ADMIN_FEATURE_FLAG_WHITELIST', // 白名单管理（POST/DELETE）
  '/api/v4/console/feature-flags/:code/blacklist': 'ADMIN_FEATURE_FLAG_BLACKLIST', // 黑名单管理（POST/DELETE）

  /*
   * ===============================================================
   * 测试专用路径（仅用于 Jest 集成测试，不对外暴露）
   * @see tests/integration/async_task_compensation.test.js - P3-11
   * ===============================================================
   */
  '/api/v4/test/action': 'TEST_ACTION', // 通用测试操作
  '/api/v4/test/db-task': 'TEST_DB_TASK', // 数据库任务测试
  '/api/v4/test/timeout-task': 'TEST_TIMEOUT_TASK', // 超时任务测试
  '/api/v4/test/multi-task': 'TEST_MULTI_TASK', // 多重任务测试
  '/api/v4/test/timeout-auto': 'TEST_TIMEOUT_AUTO', // 自动超时测试
  '/api/v4/test/cleanup': 'TEST_CLEANUP', // 清理测试
  '/api/v4/test/idempotent-action': 'TEST_IDEMPOTENT_ACTION', // 幂等性测试
  '/api/v4/test/independent': 'TEST_INDEPENDENT', // 独立执行测试
  '/api/v4/test/hash': 'TEST_HASH', // 哈希测试
  '/api/v4/test/state': 'TEST_STATE', // 状态转换测试
  '/api/v4/test/business': 'TEST_BUSINESS', // 业务事件测试
  '/api/v4/test/empty': 'TEST_EMPTY', // 空值测试
  '/api/v4/test/long': 'TEST_LONG', // 超长键测试
  '/api/v4/test/concurrent': 'TEST_CONCURRENT', // 并发测试
  '/api/v4/internal/reconciliation': 'INTERNAL_RECONCILIATION' // 内部对账任务
}

/**
 * 入口幂等服务类
 * 职责：管理API请求的幂等性，实现"重试返回首次结果"
 */
class IdempotencyService {
  /**
   * 获取 API 路径的 canonical operation
   *
   * 业务规则：
   * - 所有写接口必须在 CANONICAL_OPERATION_MAP 中显式定义
   * - 未定义的路径直接返回 500 错误（严格模式）
   * - 规范化路径后再查找映射（处理动态参数如 :id）
   *
   * @param {string} api_path - API路径（原始路径）
   * @returns {string} canonical operation
   * @throws {Error} 未映射的路径抛出 500 错误
   */
  static getCanonicalOperation(api_path) {
    if (!api_path) return api_path

    // 先尝试直接匹配
    let canonical = CANONICAL_OPERATION_MAP[api_path]

    // 如果未找到，规范化路径后再查找（处理动态ID）
    if (!canonical) {
      const normalized_path = this.normalizePath(api_path)
      canonical = CANONICAL_OPERATION_MAP[normalized_path]
    }

    // 如果仍未找到，尝试添加尾斜杠匹配（针对POST创建类请求，如 /popup-banners -> /popup-banners/）
    if (!canonical) {
      const path_with_trailing_slash = api_path.endsWith('/') ? api_path : api_path + '/'
      canonical = CANONICAL_OPERATION_MAP[path_with_trailing_slash]
    }

    // 如果仍未找到，尝试移除尾斜杠匹配（兼容性处理）
    if (!canonical) {
      const path_without_trailing_slash = api_path.endsWith('/') ? api_path.slice(0, -1) : api_path
      canonical = CANONICAL_OPERATION_MAP[path_without_trailing_slash]
    }

    // 【决策4-B】严格模式：未映射直接拒绝
    if (!canonical) {
      const errorMessage =
        '严重错误：写接口 ' +
        api_path +
        ' 未在 CANONICAL_OPERATION_MAP 中定义。' +
        '请在 services/IdempotencyService.js 中添加映射后重启服务。'
      const error = new Error(errorMessage)
      error.statusCode = 500
      error.code = 'CANONICAL_OPERATION_NOT_MAPPED'

      logger.error('CANONICAL_OPERATION_NOT_MAPPED', {
        api_path,
        normalized_path: this.normalizePath(api_path),
        action: '请在 CANONICAL_OPERATION_MAP 中添加映射'
      })

      throw error
    }

    return canonical
  }

  /**
   * 过滤请求体，剔除非业务语义字段
   *
   * @param {Object} body - 原始请求体
   * @returns {Object} 过滤后的请求体
   */
  static filterBodyForFingerprint(body) {
    if (!body || typeof body !== 'object') {
      return {}
    }

    // 需要剔除的非业务字段（不影响业务结果的元数据字段）
    const excludeFields = [
      'idempotency_key',
      'timestamp',
      'nonce',
      'signature',
      'trace_id',
      'request_id',
      '_csrf'
    ]

    const filtered = {}
    for (const [key, value] of Object.entries(body)) {
      if (!excludeFields.includes(key)) {
        filtered[key] = value
      }
    }
    return filtered
  }

  /**
   * 规范化API路径，将动态参数替换为标准占位符
   *
   * @param {string} path - 原始API路径
   * @returns {string} 规范化后的路径
   *
   * @description
   * API路径参数设计规范 V2.2（2026-01-20）
   *
   * 三种资源类型对应三种占位符：
   * 1. 事务实体（数字ID）→ :id
   *    - 高频创建、有状态、数量无限增长
   *    - 如：订单、记录、规则实例
   *
   * 2. 配置实体（业务码）→ :code
   *    - 低频变更、语义稳定、数量有限
   *    - 如：活动、资产类型、设置分类
   *    - 业务码格式：snake_case（如 red_shard）或 UPPER_SNAKE（如 DIAMOND）
   *
   * 3. 外部暴露实体（UUID）→ :uuid
   *    - 需要隐藏内部ID、防枚举
   *    - 如：用户分享链接
   *
   * @example
   * normalizePath('/api/v4/market/listings/123')
   * // 返回: '/api/v4/market/listings/:id'
   *
   * normalizePath('/api/v4/lottery/campaigns/spring_festival/prizes')
   * // 返回: '/api/v4/lottery/campaigns/:code/prizes'
   *
   * normalizePath('/api/v4/user/profile/550e8400-e29b-41d4-a716-446655440000')
   * // 返回: '/api/v4/user/profile/:uuid'
   */
  static normalizePath(path) {
    if (!path) return ''

    let result = path

    /*
     * 规范化顺序很重要（优先级从高到低）：
     *
     * 1. UUID → :uuid（格式最明确，优先匹配）
     * 2. 纯数字 → :id（事务实体）
     * 3. 配置实体路径中的业务码 → :code
     *    - 只对特定配置实体路径进行匹配，避免误匹配
     *    - 匹配 snake_case 业务标识符（如 red_shard, spring_festival）
     * 4. 其他路由参数占位符 → :id（默认）
     *    - 保留已经是 :id, :code, :uuid 的情况
     */

    // Step 1: UUID → :uuid
    result = result.replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '/:uuid'
    )

    // Step 2: 纯数字 → :id
    result = result.replace(/\/\d+/g, '/:id')

    /*
     * Step 3: 配置实体路径中的业务码 → :code
     * 定义配置实体路径模式（参考 API路径参数设计规范.md 第4.2节）
     */
    const configEntityPatterns = [
      /\/(asset-types)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g, // 材料资产类型
      /\/(categories)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g, // 类目定义
      /\/(rarities)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g, // 稀有度定义
      /\/(asset-groups)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g, // 资产分组
      /\/(roles)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g, // 角色定义
      /\/(campaigns)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g, // 抽奖活动
      /\/(prize-pool)\/(?!prize(?:\/|$)|batch-add(?:\/|$)|list(?:\/|$))([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g, // 奖品池（按活动，排除固定路径段）
      /\/(settings)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g, // 系统设置
      /\/(feature-flags)\/([A-Za-z][A-Za-z0-9_]*)(?=\/|$)/g // 功能开关（flag_key 是业务码）
    ]

    configEntityPatterns.forEach(pattern => {
      result = result.replace(pattern, '/$1/:code')
    })

    /*
     * Step 4: 路由参数占位符统一化（保留 :id, :code, :uuid）
     * 将其他形式的占位符（如 :campaignCode, :asset_code）转为 :id
     */
    result = result.replace(/:(?!id\b|code\b|uuid\b)[a-zA-Z_][a-zA-Z0-9_]*/g, ':id')

    return result
  }

  /**
   * 递归深度排序对象的键
   * 确保相同内容的对象生成相同的序列化结果
   *
   * @param {*} obj - 需要排序的对象
   * @returns {*} 排序后的对象
   */
  static deepSortObject(obj) {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSortObject(item))
    }

    if (typeof obj === 'object') {
      const sorted = {}
      const keys = Object.keys(obj).sort()
      for (const key of keys) {
        sorted[key] = this.deepSortObject(obj[key])
      }
      return sorted
    }

    return obj
  }

  /**
   * 生成请求指纹（用于检测参数冲突）
   * 指纹包含：user_id, method, operation(canonical), query, body
   *
   * @param {Object} context - 请求上下文
   * @param {number} context.user_id - 用户ID
   * @param {string} context.http_method - HTTP方法
   * @param {string} context.api_path - API路径
   * @param {Object} context.query - 查询参数
   * @param {Object} context.body - 请求体
   * @returns {string} SHA-256哈希值
   */
  static generateRequestFingerprint(context) {
    const { user_id, http_method, api_path, query, body } = context

    // 过滤请求体
    const body_filtered = this.filterBodyForFingerprint(body)

    /* 使用 canonical operation 替代原始路径，同一业务操作的不同路径版本会生成相同的指纹 */
    const canonical_operation = this.getCanonicalOperation(api_path)

    // 构建规范化的 canonical 对象
    const canonical = {
      user_id,
      method: http_method,
      operation: canonical_operation, // ✅ 稳定的业务操作标识（替代 path）
      query: query || {},
      body: body_filtered
    }

    // 递归深度排序所有嵌套对象的键，确保相同内容生成相同哈希
    const sortedCanonical = this.deepSortObject(canonical)
    const sortedJson = JSON.stringify(sortedCanonical)

    return crypto.createHash('sha256').update(sortedJson).digest('hex')
  }

  /**
   * 脱敏响应数据 - 过滤敏感字段
   * 【决策细则9】response_snapshot 安全策略 - 禁止存储敏感信息
   *
   * @param {Object} data - 原始响应数据
   * @returns {Object} 脱敏后的响应数据
   */
  static sanitizeResponse(data) {
    if (!data || typeof data !== 'object') return data

    // 深度拷贝避免修改原始对象
    const sanitized = JSON.parse(JSON.stringify(data))

    // 递归脱敏
    const sanitizeObject = obj => {
      if (!obj || typeof obj !== 'object') return

      for (const key of Object.keys(obj)) {
        // 检查字段名是否在敏感列表中（不区分大小写）
        const lowerKey = key.toLowerCase()
        if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
          obj[key] = '[REDACTED]'
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key])
        }
      }
    }

    sanitizeObject(sanitized)
    return sanitized
  }

  /**
   * 检查并处理 response_snapshot 大小
   * 【决策6】response_snapshot 存储策略 - 大小限制
   *
   * @param {Object} responseData - 响应数据
   * @param {string} idempotency_key - 幂等键（用于日志）
   * @param {string} business_event_id - 业务事件ID（用于截断时保留）
   * @returns {Object} 处理后的响应快照
   */
  static prepareResponseSnapshot(responseData, idempotency_key, business_event_id) {
    // 先脱敏
    const sanitized = this.sanitizeResponse(responseData)
    const snapshot = JSON.stringify(sanitized)
    const size = Buffer.byteLength(snapshot, 'utf8')

    // 硬限制 64KB：截断只保留关键字段
    if (size > SNAPSHOT_HARD_LIMIT) {
      logger.warn('response_snapshot 超过 64KB，仅存关键字段', {
        idempotency_key,
        original_size: size,
        business_event_id
      })

      return {
        _truncated: true,
        _original_size: size,
        success: sanitized.success,
        code: sanitized.code,
        message: sanitized.message,
        business_event_id: sanitized.business_event_id || business_event_id
      }
    }

    // 软限制 32KB：记录告警但仍完整存储
    if (size > SNAPSHOT_SOFT_LIMIT) {
      logger.warn('response_snapshot 超过 32KB', {
        idempotency_key,
        size
      })
    }

    return sanitized
  }

  /**
   * 尝试获取或创建幂等请求记录
   *
   * 处理逻辑：
   * 1. 如果不存在 → 创建新记录（status=processing）
   * 2. 如果存在且completed → 返回首次结果（response_snapshot）
   * 3. 如果存在且processing → 抛出409错误
   * 4. 如果存在且failed → 允许重试（更新状态为processing）
   *
   * @param {string} idempotency_key - 幂等键
   * @param {Object} request_data - 请求数据
   * @param {string} request_data.api_path - API路径
   * @param {string} request_data.http_method - HTTP方法
   * @param {Object} request_data.request_params - 请求参数（body）
   * @param {Object} request_data.query - 查询参数（可选）
   * @param {number} request_data.user_id - 用户ID
   * @returns {Promise<Object>} { is_new, request, should_process, response }
   */
  static async getOrCreateRequest(idempotency_key, request_data) {
    // 延迟加载模型，避免循环依赖
    const { ApiIdempotencyRequest } = require('../models')

    const { api_path, http_method = 'POST', request_params, query, user_id } = request_data

    // 使用新的 fingerprint 算法
    const request_hash = this.generateRequestFingerprint({
      user_id,
      http_method,
      api_path,
      query,
      body: request_params
    })

    const transaction = await sequelize.transaction()

    try {
      // 尝试查找已存在的请求（加锁防止并发）
      const existingRequest = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (existingRequest) {
        // ✅ 获取当前和已存在记录的 canonical operation
        const existing_canonical = this.getCanonicalOperation(existingRequest.api_path)
        const current_canonical = this.getCanonicalOperation(api_path)

        // 检查是否为同类操作（通过 canonical operation）
        if (existing_canonical !== current_canonical) {
          // 不同操作，严格 409
          await transaction.rollback()
          const error = new Error(
            '幂等键冲突：该幂等键已用于不同的操作。' +
              '已有操作：' +
              existing_canonical +
              '，当前操作：' +
              current_canonical
          )
          error.statusCode = 409
          error.errorCode = 'IDEMPOTENCY_KEY_CONFLICT_DIFFERENT_OPERATION'
          throw error
        }

        // 同类操作，检查参数是否一致
        if (existingRequest.request_hash !== request_hash) {
          // 参数不一致（可能是路径变更导致的指纹变化）
          await transaction.rollback()
          const error = new Error(
            '幂等键冲突：相同的 idempotency_key 但参数不同。' +
              '请使用不同的幂等键或确认请求参数正确。'
          )
          error.statusCode = 409
          error.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
          throw error
        }

        // 如果路径不同但 canonical 相同，记录跨路径重试日志
        if (existingRequest.api_path !== api_path) {
          logger.info('🔄 检测到同类操作跨路径重试', {
            idempotency_key,
            old_path: existingRequest.api_path,
            new_path: api_path,
            canonical_operation: current_canonical,
            decision: '不写回，只回放结果'
          })
        }

        // 参数一致，检查处理状态
        if (existingRequest.status === 'completed') {
          // 已完成，返回快照结果（不更新旧记录，保留审计真实性）
          await transaction.commit()
          logger.info('🔄 入口幂等拦截：请求已完成，返回首次结果', {
            idempotency_key,
            user_id,
            api_path,
            original_path: existingRequest.api_path
          })
          return {
            is_new: false,
            request: existingRequest,
            should_process: false,
            response: existingRequest.response_snapshot
          }
        } else if (existingRequest.status === 'processing') {
          // 正在处理中，拒绝重复请求
          await transaction.commit()
          const error = new Error('请求正在处理中，请稍后重试')
          error.statusCode = 409
          error.errorCode = 'REQUEST_PROCESSING'
          error.retryAfter = 1 // 建议1秒后重试
          throw error
        } else if (existingRequest.status === 'failed') {
          // 失败状态，允许重试（更新为 processing）
          await existingRequest.update(
            {
              status: 'processing',
              updated_at: new Date()
            },
            { transaction }
          )
          await transaction.commit()
          logger.info('🔄 入口幂等：失败请求重试', {
            idempotency_key,
            user_id,
            api_path
          })
          return {
            is_new: false,
            request: existingRequest,
            should_process: true
          }
        }
      }

      /*
       * 不存在，创建新记录
       * 【业界标准形态】TTL 从 24h 升级到 7 天
       */
      const expires_at = new Date()
      expires_at.setDate(expires_at.getDate() + TTL_DAYS)

      const new_request = await ApiIdempotencyRequest.create(
        {
          idempotency_key,
          api_path,
          http_method,
          request_hash,
          request_params,
          user_id,
          status: 'processing',
          expires_at
        },
        { transaction }
      )

      await transaction.commit()

      logger.info('✅ 入口幂等：创建新请求记录', {
        request_id: new_request.request_id,
        idempotency_key,
        user_id,
        api_path,
        expires_at
      })

      return {
        is_new: true,
        request: new_request,
        should_process: true
      }
    } catch (error) {
      // 只有在事务未完成时才回滚（避免重复回滚错误）
      if (!transaction.finished) {
        await transaction.rollback()
      }
      throw error
    }
  }

  /**
   * 标记请求为完成状态（保存结果快照）
   * 【决策6】response_snapshot 合规存储 - 脱敏 + 大小限制
   *
   * @param {string} idempotency_key - 幂等键
   * @param {string} business_event_id - 业务事件ID（如 lottery_session_id）
   * @param {Object} response_data - 响应数据
   * @returns {Promise<void>} 无返回值
   */
  static async markAsCompleted(idempotency_key, business_event_id, response_data) {
    const { ApiIdempotencyRequest } = require('../models')

    // 【决策6】使用脱敏和大小检查处理 response_snapshot
    const response_snapshot = this.prepareResponseSnapshot(
      response_data,
      idempotency_key,
      business_event_id
    )

    await ApiIdempotencyRequest.update(
      {
        status: 'completed',
        business_event_id: business_event_id || null,
        response_snapshot,
        response_code: response_data?.code || 'SUCCESS',
        completed_at: new Date()
      },
      {
        where: { idempotency_key }
      }
    )

    logger.info('✅ 入口幂等：请求标记为完成', {
      idempotency_key,
      business_event_id,
      response_code: response_data?.code || 'SUCCESS',
      snapshot_truncated: response_snapshot?._truncated || false
    })
  }

  /**
   * 标记请求为失败状态
   *
   * @param {string} idempotency_key - 幂等键
   * @param {string} error_message - 错误信息
   * @returns {Promise<void>} 无返回值
   */
  static async markAsFailed(idempotency_key, error_message) {
    const { ApiIdempotencyRequest } = require('../models')

    await ApiIdempotencyRequest.update(
      {
        status: 'failed',
        response_snapshot: { error: error_message },
        completed_at: new Date()
      },
      {
        where: { idempotency_key }
      }
    )

    logger.info('⚠️ 入口幂等：请求标记为失败', {
      idempotency_key,
      error_message
    })
  }

  /**
   * 自动将超时的 processing 状态转为 failed
   * 【业界标准形态】超时阈值为 60 秒
   *
   * @returns {Promise<Object>} { updated_count }
   */
  static async autoFailProcessingTimeout() {
    const { ApiIdempotencyRequest } = require('../models')
    const { Op } = require('sequelize')

    const timeoutThreshold = new Date()
    timeoutThreshold.setSeconds(timeoutThreshold.getSeconds() - PROCESSING_TIMEOUT_SECONDS)

    const [updated_count] = await ApiIdempotencyRequest.update(
      {
        status: 'failed',
        response_snapshot: { error: 'Processing timeout' },
        completed_at: new Date()
      },
      {
        where: {
          status: 'processing',
          created_at: { [Op.lt]: timeoutThreshold }
        }
      }
    )

    if (updated_count > 0) {
      logger.info('⏰ 入口幂等：processing 超时自动转 failed', {
        updated_count,
        timeout_seconds: PROCESSING_TIMEOUT_SECONDS
      })
    }

    return { updated_count }
  }

  /**
   * 清理过期记录（定时任务调用）
   * 【业界标准形态】清理 completed 和 failed 状态的过期记录
   *
   * @returns {Promise<Object>} { deleted_count }
   */
  static async cleanupExpired() {
    const { ApiIdempotencyRequest } = require('../models')
    const { Op } = require('sequelize')

    // 先处理超时的 processing
    await this.autoFailProcessingTimeout()

    // 清理过期的 completed 和 failed 记录
    const result = await ApiIdempotencyRequest.destroy({
      where: {
        expires_at: { [Op.lt]: new Date() },
        status: { [Op.in]: ['completed', 'failed'] }
      }
    })

    logger.info('🧹 入口幂等：清理过期记录', {
      deleted_count: result
    })

    return { deleted_count: result }
  }

  /**
   * 根据幂等键查询请求记录
   *
   * @param {string} idempotency_key - 幂等键
   * @returns {Promise<Object|null>} 请求记录或null
   */
  static async findByKey(idempotency_key) {
    const { ApiIdempotencyRequest } = require('../models')

    return await ApiIdempotencyRequest.findOne({
      where: { idempotency_key }
    })
  }

  /**
   * 根据业务事件ID查询请求记录
   *
   * @param {string} business_event_id - 业务事件ID
   * @returns {Promise<Object|null>} 请求记录或null
   */
  static async findByBusinessEventId(business_event_id) {
    const { ApiIdempotencyRequest } = require('../models')

    return await ApiIdempotencyRequest.findOne({
      where: { business_event_id }
    })
  }
}

module.exports = IdempotencyService

// 导出 CANONICAL_OPERATION_MAP 供验证脚本使用
module.exports.CANONICAL_OPERATION_MAP = CANONICAL_OPERATION_MAP
