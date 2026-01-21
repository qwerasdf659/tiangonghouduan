/**
 * API路径集中管理配置文件
 * 避免前端硬编码API路径，统一管理所有API端点
 *
 * 使用方式：
 * 1. 在HTML中引入此文件：<script src="js/api-config.js"></script>
 * 2. 使用API.xxx()方法调用接口，而不是直接写API路径
 *
 * 创建时间：2025年11月23日
 */

/**
 * API端点常量定义
 * 集中管理所有API路径，避免硬编码
 */
const API_ENDPOINTS = {
  // ===== 认证相关API =====
  AUTH: {
    LOGIN: '/api/v4/auth/login', // 登录
    REGISTER: '/api/v4/auth/register', // 注册
    LOGOUT: '/api/v4/auth/logout', // 登出
    VERIFY: '/api/v4/auth/verify', // 验证token
    REFRESH: '/api/v4/auth/refresh' // 刷新token
  },

  // ===== 预设管理API =====
  PRESET: {
    LIST: '/api/v4/lottery/preset/list', // 获取所有预设列表（管理员）
    CREATE: '/api/v4/lottery/preset/create', // 创建预设
    USER_LIST: '/api/v4/lottery/preset/user/:user_id', // 获取用户预设
    DELETE: '/api/v4/lottery/preset/user/:user_id', // 删除用户预设
    STATS: '/api/v4/lottery/preset/stats' // 获取统计信息
  },

  // ===== 奖品池管理API =====
  PRIZE: {
    LIST: '/api/v4/console/prize-pool/list', // 获取奖品列表
    BATCH_ADD: '/api/v4/console/prize-pool/batch-add', // 批量添加奖品
    UPDATE: '/api/v4/console/prize-pool/prize/:prize_id', // 更新奖品
    DELETE: '/api/v4/console/prize-pool/prize/:prize_id', // 删除奖品
    DETAIL: '/api/v4/console/prize-pool/prize/:prize_id', // 获取奖品详情
    ADD_STOCK: '/api/v4/console/prize-pool/prize/:prize_id/add-stock' // 增加库存
  },

  // ===== 用户管理API =====
  USER: {
    LIST: '/api/v4/console/user-management/users', // 获取用户列表
    DETAIL: '/api/v4/console/user-management/users/:user_id', // 获取用户详情
    UPDATE_ROLE: '/api/v4/console/user-management/users/:user_id/role', // 更新用户角色
    UPDATE_STATUS: '/api/v4/console/user-management/users/:user_id/status', // 更新用户状态
    DELETE: '/api/v4/console/user-management/users/:user_id' // 删除用户
  },

  // ===== 角色管理API =====
  // 注意：后端只实现了角色列表查询，角色的创建/编辑/删除通过数据库管理
  // 用户角色变更请使用 USER.UPDATE_ROLE API
  ROLE: {
    LIST: '/api/v4/console/user-management/roles' // 获取角色列表（只读）
    // 以下API后端未实现，已移除：
    // DETAIL, CREATE, UPDATE, DELETE, ASSIGN, PERMISSIONS
  },

  // ===== 抽奖管理API =====
  LOTTERY: {
    EXECUTE: '/api/v4/lottery/execute', // 执行抽奖
    HISTORY: '/api/v4/lottery/history', // 抽奖历史
    STRATEGIES: '/api/v4/lottery/strategies' // 获取抽奖策略列表
  },

  // ===== 权限管理API =====
  PERMISSION: {
    CHECK: '/api/v4/permissions/check', // 检查权限
    USER_PERMISSIONS: '/api/v4/permissions/user/:userId', // 获取用户权限
    MY_PERMISSIONS: '/api/v4/permissions/me', // 获取当前用户权限
    PROMOTE: '/api/v4/permissions/promote', // 提升用户权限
    CREATE_ADMIN: '/api/v4/permissions/create-admin' // 创建管理员
  },

  // ===== 系统管理API =====
  SYSTEM: {
    DASHBOARD: '/api/v4/console/system/dashboard', // 系统仪表板
    DASHBOARD_TRENDS: '/api/v4/console/analytics/decisions/analytics', // 仪表盘趋势数据
    HEALTH: '/health', // 健康检查
    VERSION: '/api/v4', // 版本信息
    CHARTS: '/api/v4/system/statistics/charts', // 统计图表数据
    STATISTICS_EXPORT: '/api/v4/system/statistics/export', // 统计导出
    CONSOLE_NOTIFICATIONS: '/api/v4/console/system/notifications' // 控制台通知管理
  },

  // ===== 数据分析API =====
  ANALYTICS: {
    TODAY_STATS: '/api/v4/console/analytics/stats/today', // 今日统计
    DECISIONS: '/api/v4/console/analytics/decisions/analytics', // 决策分析
    LOTTERY_TRENDS: '/api/v4/console/analytics/lottery/trends' // 抽奖趋势
  },

  // ===== 抽奖活动管理API =====
  CAMPAIGN: {
    LIST: '/api/v4/console/system-data/lottery-campaigns',
    DETAIL: '/api/v4/console/system-data/lottery-campaigns/:campaign_id',
    BUDGET: '/api/v4/console/campaign-budget/campaigns/:campaign_id'
  },

  // ===== 策略配置API =====
  STRATEGY: {
    LIST: '/api/v4/console/lottery-configs/strategies',
    DETAIL: '/api/v4/console/lottery-configs/strategies/:id',
    CREATE: '/api/v4/console/lottery-configs/strategies',
    UPDATE: '/api/v4/console/lottery-configs/strategies/:id',
    DELETE: '/api/v4/console/lottery-configs/strategies/:id'
  },

  // ===== 矩阵配置API =====
  MATRIX: {
    LIST: '/api/v4/console/lottery-configs/matrix',
    FULL: '/api/v4/console/lottery-configs/matrix/full',
    DETAIL: '/api/v4/console/lottery-configs/matrix/:id',
    GET: '/api/v4/console/lottery-configs/matrix/:id', // 别名
    CREATE: '/api/v4/console/lottery-configs/matrix',
    UPDATE: '/api/v4/console/lottery-configs/matrix/:id',
    HISTORY: '/api/v4/console/lottery-configs/matrix/history', // 矩阵历史
    ROLLBACK: '/api/v4/console/lottery-configs/matrix/:id/rollback' // 回滚
  },

  // ===== 档位规则API =====
  TIER_RULES: {
    LIST: '/api/v4/console/lottery-tier-rules',
    DETAIL: '/api/v4/console/lottery-tier-rules/:id',
    CREATE: '/api/v4/console/lottery-tier-rules',
    UPDATE: '/api/v4/console/lottery-tier-rules/:id',
    DELETE: '/api/v4/console/lottery-tier-rules/:id'
  },

  // ===== 欠账管理API =====
  DEBT: {
    DASHBOARD: '/api/v4/console/debt-management/dashboard',
    BY_CAMPAIGN: '/api/v4/console/debt-management/by-campaign',
    BY_PRIZE: '/api/v4/console/debt-management/by-prize',
    BY_CREATOR: '/api/v4/console/debt-management/by-creator',
    PENDING: '/api/v4/console/debt-management/pending',
    CLEAR: '/api/v4/console/debt-management/clear',
    LIMITS: '/api/v4/console/debt-management/limits',
    LIMITS_DETAIL: '/api/v4/console/debt-management/limits/:id'
  },

  // ===== 门店管理API =====
  STORE: {
    LIST: '/api/v4/console/stores',
    STATS: '/api/v4/console/stores/stats',
    DETAIL: '/api/v4/console/stores/:store_id',
    CREATE: '/api/v4/console/stores',
    UPDATE: '/api/v4/console/stores/:store_id',
    DELETE: '/api/v4/console/stores/:store_id',
    ACTIVATE: '/api/v4/console/stores/:store_id/activate',
    DEACTIVATE: '/api/v4/console/stores/:store_id/deactivate'
  },

  // ===== 员工管理API =====
  STAFF: {
    LIST: '/api/v4/console/staff',
    STATS: '/api/v4/console/staff/stats',
    DETAIL: '/api/v4/console/staff/:store_staff_id',
    BY_USER: '/api/v4/console/staff/by-user/:user_id',
    CREATE: '/api/v4/console/staff',
    TRANSFER: '/api/v4/console/staff/transfer',
    ROLE: '/api/v4/console/staff/:store_staff_id/role',
    DISABLE: '/api/v4/console/staff/disable/:user_id',
    ENABLE: '/api/v4/console/staff/enable'
  },

  // ===== 风控告警API =====
  RISK_ALERT: {
    LIST: '/api/v4/console/risk-alerts',
    PENDING: '/api/v4/console/risk-alerts/pending',
    DETAIL: '/api/v4/console/risk-alerts/:alert_id',
    REVIEW: '/api/v4/console/risk-alerts/:alert_id/review',
    HANDLE: '/api/v4/console/risk-alerts/:alert_id/handle', // 处理告警
    HISTORY: '/api/v4/console/risk-alerts/history', // 告警历史
    MARK_ALL_READ: '/api/v4/console/risk-alerts/mark-all-read', // 标记全部已读
    STATS_SUMMARY: '/api/v4/console/risk-alerts/stats/summary',
    STATS_STORE: '/api/v4/console/risk-alerts/stats/store/:store_id',
    TYPES: '/api/v4/console/risk-alerts/types'
  },

  // ===== 字典管理API =====
  // 后端提供三种具体的字典表管理：类目、稀有度、资产分组
  DICT: {
    // 获取所有字典数据（用于下拉选项）
    ALL: '/api/v4/console/dictionaries/all',
    // 类目字典（category_defs）
    CATEGORIES: '/api/v4/console/dictionaries/categories',
    CATEGORY_DETAIL: '/api/v4/console/dictionaries/categories/:code',
    CREATE_CATEGORY: '/api/v4/console/dictionaries/categories',
    UPDATE_CATEGORY: '/api/v4/console/dictionaries/categories/:code',
    DELETE_CATEGORY: '/api/v4/console/dictionaries/categories/:code',
    // 稀有度字典（rarity_defs）
    RARITIES: '/api/v4/console/dictionaries/rarities',
    RARITY_DETAIL: '/api/v4/console/dictionaries/rarities/:code',
    CREATE_RARITY: '/api/v4/console/dictionaries/rarities',
    UPDATE_RARITY: '/api/v4/console/dictionaries/rarities/:code',
    DELETE_RARITY: '/api/v4/console/dictionaries/rarities/:code',
    // 资产分组字典（asset_group_defs）
    ASSET_GROUPS: '/api/v4/console/dictionaries/asset-groups',
    ASSET_GROUP_DETAIL: '/api/v4/console/dictionaries/asset-groups/:code',
    CREATE_ASSET_GROUP: '/api/v4/console/dictionaries/asset-groups',
    UPDATE_ASSET_GROUP: '/api/v4/console/dictionaries/asset-groups/:code',
    DELETE_ASSET_GROUP: '/api/v4/console/dictionaries/asset-groups/:code'
  },

  // ===== 物品模板API =====
  ITEM_TEMPLATE: {
    LIST: '/api/v4/console/item-templates',
    TYPES: '/api/v4/console/item-templates/types',
    DETAIL: '/api/v4/console/item-templates/:id',
    CREATE: '/api/v4/console/item-templates',
    UPDATE: '/api/v4/console/item-templates/:id',
    DELETE: '/api/v4/console/item-templates/:id',
    BATCH_STATUS: '/api/v4/console/item-templates/batch/status'
  },

  // ===== 抽奖监控API =====
  LOTTERY_MONITORING: {
    HOURLY_METRICS: '/api/v4/console/lottery-monitoring/hourly-metrics',
    HOURLY_SUMMARY: '/api/v4/console/lottery-monitoring/hourly-metrics/summary/:campaign_id',
    STATS: '/api/v4/console/lottery-monitoring/stats', // 监控统计
    USER_EXPERIENCE: '/api/v4/console/lottery-monitoring/user-experience-states',
    USER_EXPERIENCE_DETAIL: '/api/v4/console/lottery-monitoring/user-experience-states/:user_id/:campaign_id',
    USER_GLOBAL: '/api/v4/console/lottery-monitoring/user-global-states',
    USER_GLOBAL_DETAIL: '/api/v4/console/lottery-monitoring/user-global-states/:user_id',
    USER_QUOTAS: '/api/v4/console/lottery-monitoring/user-quotas'
  },

  // ===== 策略统计API =====
  LOTTERY_STRATEGY_STATS: {
    OVERVIEW: '/api/v4/console/lottery-strategy-stats/overview',
    TIER_DISTRIBUTION: '/api/v4/console/lottery-strategy-stats/tier-distribution',
    PITY_STATS: '/api/v4/console/lottery-strategy-stats/pity-stats'
  },

  // ===== 业务记录API =====
  // 后端字段说明（以后端为准）：
  // - order_id: UUID格式的订单ID
  // - code_hash: 核销码的SHA-256哈希值（不存明文）
  // - item_instance_id: 关联的物品实例ID
  // - redeemer_user_id: 核销用户ID
  // - status: 订单状态（pending/fulfilled/cancelled/expired）
  // - expires_at: 过期时间
  // - fulfilled_at: 核销时间
  BUSINESS_RECORDS: {
    // 核销订单
    REDEMPTION_ORDERS: '/api/v4/console/business-records/redemption-orders',
    LIST: '/api/v4/console/business-records/redemption-orders', // 别名
    DETAIL: '/api/v4/console/business-records/redemption-orders/:order_id', // 使用 order_id（UUID）
    REDEEM: '/api/v4/console/business-records/redemption-orders/:order_id/redeem',
    CANCEL: '/api/v4/console/business-records/redemption-orders/:order_id/cancel',
    BATCH_EXPIRE: '/api/v4/console/business-records/redemption-orders/batch-expire',
    EXPORT: '/api/v4/console/business-records/redemption-orders/export',
    // 其他记录
    LOTTERY_CLEAR_SETTINGS: '/api/v4/console/business-records/lottery-clear-settings',
    CONTENT_REVIEWS: '/api/v4/console/business-records/content-reviews',
    LOTTERY_DRAWS: '/api/v4/console/business-records/lottery-draws',
    ITEM_EVENTS: '/api/v4/console/business-records/item-events',
    ASSET_TRANSACTIONS: '/api/v4/console/business-records/asset-transactions',
    EXCHANGE_RECORDS: '/api/v4/console/business-records/exchange-records',
    EXCHANGE_STATS: '/api/v4/shop/exchange/statistics' // 兑换市场统计
  },

  // ===== 活动定价配置API =====
  PRICING: {
    // 按活动code获取
    GET_BY_CAMPAIGN: '/api/v4/console/lottery-management/campaigns/:code/pricing',
    GET_VERSIONS: '/api/v4/console/lottery-management/campaigns/:code/pricing/versions',
    CREATE: '/api/v4/console/lottery-management/campaigns/:code/pricing',
    ACTIVATE: '/api/v4/console/lottery-management/campaigns/:code/pricing/:version/activate',
    ARCHIVE: '/api/v4/console/lottery-management/campaigns/:code/pricing/:version/archive',
    ROLLBACK: '/api/v4/console/lottery-management/campaigns/:code/pricing/rollback',
    SCHEDULE: '/api/v4/console/lottery-management/campaigns/:code/pricing/:version/schedule',
    // 兼容旧版
    LIST: '/api/v4/console/lottery-management/pricing-config',
    DETAIL: '/api/v4/console/lottery-management/pricing-config/:id',
    UPDATE: '/api/v4/console/lottery-management/pricing-config/:id'
  },

  // ===== 行政区划API =====
  REGION: {
    PROVINCES: '/api/v4/console/regions/provinces',
    CHILDREN: '/api/v4/console/regions/children/:parent_code',
    SEARCH: '/api/v4/console/regions/search',
    PATH: '/api/v4/console/regions/path/:region_code'
  },

  // ===== 会话管理API =====
  SESSIONS: {
    LIST: '/api/v4/console/sessions',
    STATS: '/api/v4/console/sessions/stats',
    DETAIL: '/api/v4/console/sessions/:session_id',
    DEACTIVATE: '/api/v4/console/sessions/:session_id/deactivate',
    REVOKE: '/api/v4/console/sessions/:session_id/deactivate', // 别名：撤销会话
    DEACTIVATE_USER: '/api/v4/console/sessions/deactivate-user',
    REVOKE_OTHERS: '/api/v4/console/sessions/deactivate-user', // 别名：撤销其他会话
    BATCH_REVOKE: '/api/v4/console/sessions/batch-deactivate', // 批量撤销
    CLEANUP: '/api/v4/console/sessions/cleanup',
    ONLINE_USERS: '/api/v4/console/sessions/online-users'
  },

  // ===== 功能开关API =====
  FEATURE_FLAGS: {
    LIST: '/api/v4/console/feature-flags',
    DETAIL: '/api/v4/console/feature-flags/:flag_id',
    UPDATE: '/api/v4/console/feature-flags/:flag_id',
    TOGGLE: '/api/v4/console/feature-flags/:flag_id/toggle'
  },

  // ===== 用户风控配置API =====
  RISK_PROFILES: {
    LIST: '/api/v4/console/risk-profiles',
    USER: '/api/v4/console/risk-profiles/user/:user_id',
    UPDATE: '/api/v4/console/risk-profiles/user/:user_id'
  },

  // ===== 用户高级状态API =====
  USER_PREMIUM: {
    LIST: '/api/v4/console/user-premium',
    DETAIL: '/api/v4/console/user-premium/:user_id',
    UPDATE: '/api/v4/console/user-premium/:user_id',
    UNLOCK: '/api/v4/console/user-premium/:user_id/unlock'
  },

  // ===== 系统数据API =====
  SYSTEM_DATA: {
    USER_ROLES: '/api/v4/console/system-data/user-roles'
  },

  // ===== 公告管理API =====
  ANNOUNCEMENT: {
    LIST: '/api/v4/console/system/announcements',
    DETAIL: '/api/v4/console/system/announcements/:id',
    CREATE: '/api/v4/console/system/announcements',
    UPDATE: '/api/v4/console/system/announcements/:id',
    DELETE: '/api/v4/console/system/announcements/:id'
  },

  // ===== 系统通知API =====
  NOTIFICATION: {
    LIST: '/api/v4/system/notifications',
    READ: '/api/v4/system/notifications/:id/read',
    READ_ALL: '/api/v4/system/notifications/read-all',
    CLEAR: '/api/v4/system/notifications/clear',
    SEND: '/api/v4/system/notifications/send',
    ANNOUNCEMENTS: '/api/v4/console/notifications/announcements'
  },

  // ===== 弹窗Banner API =====
  POPUP_BANNER: {
    LIST: '/api/v4/console/popup-banners',
    STATS: '/api/v4/console/popup-banners/statistics',
    DETAIL: '/api/v4/console/popup-banners/:id',
    CREATE: '/api/v4/console/popup-banners',
    UPDATE: '/api/v4/console/popup-banners/:id',
    DELETE: '/api/v4/console/popup-banners/:id',
    TOGGLE: '/api/v4/console/popup-banners/:id/toggle'
  },

  // ===== 图片资源API =====
  IMAGE: {
    LIST: '/api/v4/console/images',
    UPLOAD: '/api/v4/console/images/upload',
    DELETE: '/api/v4/console/images/:id'
  },

  // ===== 缓存管理API =====
  CACHE: {
    CLEAR: '/api/v4/console/cache/clear'
  },

  // ===== 设置管理API =====
  SETTINGS: {
    LIST: '/api/v4/console/settings',
    CATEGORY: '/api/v4/console/settings/:category',
    UPDATE: '/api/v4/console/settings/:category',
    SECURITY: '/api/v4/console/settings/security',
    BASIC: '/api/v4/console/settings/basic',
    POINTS: '/api/v4/console/settings/points',
    NOTIFICATION: '/api/v4/console/settings/notification',
    MARKETPLACE: '/api/v4/console/settings/marketplace'
  },

  // ===== 用户层级API =====
  USER_HIERARCHY: {
    LIST: '/api/v4/console/user-hierarchy',
    ROLES: '/api/v4/console/user-hierarchy/roles',
    DETAIL: '/api/v4/console/user-hierarchy/:id',
    CREATE: '/api/v4/console/user-hierarchy',
    SUBORDINATES: '/api/v4/console/user-hierarchy/:user_id/subordinates',
    UPDATE_STATUS: '/api/v4/console/user-hierarchy/:id/status',
    DEACTIVATE: '/api/v4/console/user-hierarchy/:user_id/deactivate',
    ACTIVATE: '/api/v4/console/user-hierarchy/:user_id/activate'
  },

  // ===== 商户积分API =====
  MERCHANT_POINTS: {
    LIST: '/api/v4/console/merchant-points',
    DETAIL: '/api/v4/console/merchant-points/:id',
    BATCH: '/api/v4/console/merchant-points/batch',
    APPROVE: '/api/v4/console/merchant-points/:id/approve',
    REJECT: '/api/v4/console/merchant-points/:id/reject',
    STATS_PENDING: '/api/v4/console/merchant-points/stats/pending'
  },

  // ===== 抽奖配额API =====
  LOTTERY_QUOTA: {
    STATISTICS: '/api/v4/console/lottery-quota/statistics',
    RULES: '/api/v4/console/lottery-quota/rules',
    RULE_DETAIL: '/api/v4/console/lottery-quota/rules/:id',
    DISABLE_RULE: '/api/v4/console/lottery-quota/rules/:id/disable'
  },

  // ===== 活动管理API =====
  ACTIVITIES: {
    LIST: '/api/v4/activities',
    DETAIL: '/api/v4/activities/:id'
  },

  // ===== 概率调整API =====
  PROBABILITY: {
    ADJUST: '/api/v4/console/lottery-management/probability-adjust'
  },

  // ===== 资产管理API =====
  ASSETS: {
    STATS: '/api/v4/console/assets/stats',
    TRANSACTIONS: '/api/v4/console/assets/transactions',
    PORTFOLIO: '/api/v4/console/assets/portfolio'
  },

  // ===== 资产调整API =====
  ASSET_ADJUSTMENT: {
    ASSET_TYPES: '/api/v4/console/asset-adjustment/asset-types',
    USER_BALANCES: '/api/v4/console/asset-adjustment/user/:user_id/balances',
    ADJUST: '/api/v4/console/asset-adjustment/adjust'
  },

  // ===== 材料资产API =====
  MATERIAL: {
    ASSET_TYPES: '/api/v4/console/material/asset-types',
    ASSET_TYPE_DETAIL: '/api/v4/console/material/asset-types/:asset_code',
    CONVERSION_RULES: '/api/v4/console/material/conversion-rules',
    CONVERSION_RULE_DETAIL: '/api/v4/console/material/conversion-rules/:rule_id',
    USER_BALANCE: '/api/v4/console/material/users/:user_id/balance',
    USER_ADJUST: '/api/v4/console/material/users/:user_id/adjust',
    USERS: '/api/v4/console/material/users',
    TRANSACTIONS: '/api/v4/console/material/transactions'
  },

  // ===== 客服会话API =====
  CUSTOMER_SERVICE: {
    SESSIONS: '/api/v4/console/customer-service/sessions',
    SESSION_MESSAGES: '/api/v4/console/customer-service/sessions/:session_id/messages',
    SEND_MESSAGE: '/api/v4/console/customer-service/sessions/:session_id/send',
    MARK_READ: '/api/v4/console/customer-service/sessions/:session_id/mark-read',
    TRANSFER: '/api/v4/console/customer-service/sessions/:session_id/transfer',
    CLOSE: '/api/v4/console/customer-service/sessions/:session_id/close'
  },

  // ===== 活动预算API =====
  CAMPAIGN_BUDGET: {
    BATCH_STATUS: '/api/v4/console/campaign-budget/batch-status',
    CAMPAIGN: '/api/v4/console/campaign-budget/campaigns/:campaign_id'
  },

  // ===== 市场管理API =====
  MARKETPLACE: {
    // 兑换市场商品
    EXCHANGE_ITEMS: '/api/v4/console/marketplace/exchange_market/items',
    EXCHANGE_ITEM_DETAIL: '/api/v4/console/marketplace/exchange_market/items/:item_id',
    // 兑换市场订单
    EXCHANGE_ORDERS: '/api/v4/console/marketplace/exchange_market/orders',
    EXCHANGE_ORDER_DETAIL: '/api/v4/console/marketplace/exchange_market/orders/:order_no',
    EXCHANGE_ORDER_STATUS: '/api/v4/shop/exchange/orders/:order_no/status',
    // 交易订单（C2C市场交易订单 - 使用后端正确的路径）
    TRADE_ORDERS: '/api/v4/console/marketplace/trade_orders',
    // 简化路径版本（兼容 PageConfigRegistry.js）
    EXCHANGE_ITEMS_SIMPLE: '/api/v4/console/marketplace/exchange-items',
    EXCHANGE_ORDERS_SIMPLE: '/api/v4/console/marketplace/exchange-orders',
    EXCHANGE_STATS: '/api/v4/console/marketplace/exchange-stats',
    TRADE_ORDERS_SIMPLE: '/api/v4/console/marketplace/trade_orders'
  },

  // ===== 孤儿冻结API =====
  ORPHAN_FROZEN: {
    DETECT: '/api/v4/console/orphan-frozen/detect',
    STATS: '/api/v4/console/orphan-frozen/stats',
    CLEANUP: '/api/v4/console/orphan-frozen/cleanup'
  },

  // ===== 抽奖干预管理API =====
  LOTTERY_INTERVENTION: {
    LIST: '/api/v4/console/lottery-management/interventions',
    DETAIL: '/api/v4/console/lottery-management/interventions/:id',
    CANCEL: '/api/v4/console/lottery-management/interventions/:id/cancel',
    FORCE_WIN: '/api/v4/console/lottery-management/force-win'
  },

  // ===== 抽奖活动API =====
  LOTTERY_CAMPAIGNS: {
    LIST: '/api/v4/lottery/campaigns',
    DETAIL: '/api/v4/lottery/campaigns/:campaign_code',
    CONDITIONS: '/api/v4/activities/:code/conditions',
    CONFIGURE_CONDITIONS: '/api/v4/activities/:code/configure-conditions'
  },

  // ===== 消费记录API（管理员审核 - console域） =====
  CONSUMPTION: {
    ADMIN_RECORDS: '/api/v4/console/consumption/records',
    PENDING: '/api/v4/console/consumption/pending',
    APPROVE: '/api/v4/console/consumption/approve/:id',
    REJECT: '/api/v4/console/consumption/reject/:id'
  },

  // ===== 反馈管理API =====
  FEEDBACK: {
    LIST: '/api/v4/console/system/feedbacks',
    DETAIL: '/api/v4/console/system/feedbacks/:id',
    REPLY: '/api/v4/console/system/feedbacks/:id/reply',
    STATUS: '/api/v4/console/system/feedbacks/:id/status'
  },

  // ===== 控制台认证API =====
  CONSOLE_AUTH: {
    LOGIN: '/api/v4/console/auth/login',
    LOGOUT: '/api/v4/console/auth/logout'
  },

  // ===== 交易订单API =====
  TRADE_ORDERS: {
    LIST: '/api/v4/console/marketplace/trade_orders',
    DETAIL: '/api/v4/console/marketplace/trade_orders/:order_id'
  },

  // ===== 市场统计API =====
  MARKETPLACE_STATS: {
    LISTING_STATS: '/api/v4/console/marketplace/listing-stats'
  },

  // ===== 审计日志API =====
  AUDIT_LOGS: {
    LIST: '/api/v4/console/system/audit-logs',
    STATISTICS: '/api/v4/console/system/audit-logs/statistics',
    DETAIL: '/api/v4/console/system/audit-logs/:id'
  },

  // ===== 设置管理API（扩展）=====
  SETTINGS_EXT: {
    GLOBAL: '/api/v4/console/settings/global',
    LOTTERY: '/api/v4/console/settings/lottery',
    SYSTEM: '/api/v4/console/settings/system',
    PRIZE: '/api/v4/console/settings/prize'
  },

  // ===== 钻石账户API =====
  DIAMOND_ACCOUNTS: {
    LIST: '/api/v4/console/diamond-accounts',
    DETAIL: '/api/v4/console/diamond-accounts/:user_id',
    ADJUST: '/api/v4/console/diamond-accounts/adjust',
    USER_BALANCE: '/api/v4/console/diamond/users/:user_id/balance',
    USER_ADJUST: '/api/v4/console/diamond/users/:user_id/adjust',
    USERS: '/api/v4/console/diamond/users',
    ACCOUNTS: '/api/v4/console/diamond/accounts'
  },

  // ===== 用户层级扩展API =====
  USER_HIERARCHY_EXT: {
    ROLES: '/api/v4/console/user-hierarchy/roles'
  }
}

/**
 * API调用封装类
 * 提供统一的API调用方法，自动处理路径参数、查询参数等
 */
class API {
  /**
   * 构建API完整URL（处理路径参数）
   * @param {string} endpoint - API端点（可能包含路径参数，如 /user/:id）
   * @param {Object} pathParams - 路径参数对象
   * @returns {string} 完整URL
   *
   * @example
   * API.buildURL('/api/v4/users/:user_id', { user_id: 123 })
   * // 返回: '/api/v4/users/123'
   */
  static buildURL(endpoint, pathParams = {}) {
    let url = endpoint

    // 替换路径参数
    Object.entries(pathParams).forEach(([key, value]) => {
      url = url.replace(`:${key}`, value)
    })

    return url
  }

  /**
   * 构建查询字符串
   * @param {Object} queryParams - 查询参数对象
   * @returns {string} 查询字符串（如：?page=1&size=20）
   */
  static buildQueryString(queryParams = {}) {
    if (Object.keys(queryParams).length === 0) {
      return ''
    }

    const query = new URLSearchParams(queryParams).toString()
    return `?${query}`
  }

  /**
   * 统一API请求方法
   * @param {string} endpoint - API端点
   * @param {Object} options - 请求选项
   * @returns {Promise} API响应
   *
   * @example
   * const response = await API.request(API_ENDPOINTS.PRESET.LIST, {
   *   method: 'GET',
   *   queryParams: { page: 1, page_size: 20 }
   * });
   */
  static async request(endpoint, options = {}) {
    const { method = 'GET', pathParams = {}, queryParams = {}, body = null, headers = {} } = options

    try {
      // 构建完整URL
      let url = this.buildURL(endpoint, pathParams)

      // 添加查询参数
      url += this.buildQueryString(queryParams)

      // 准备请求配置
      const requestConfig = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }

      // 添加请求体
      if (body && method !== 'GET') {
        requestConfig.body = JSON.stringify(body)
      }

      // 发送请求（使用已有的apiRequest函数）
      if (typeof apiRequest === 'function') {
        return await apiRequest(url, requestConfig)
      } else {
        // 降级方案：使用fetch
        const response = await fetch(url, requestConfig)
        return await response.json()
      }
    } catch (error) {
      console.error(`❌ API请求失败: ${endpoint}`, error)
      throw error
    }
  }

  // ===== 预设管理API封装 =====

  /**
   * 获取预设列表
   * @param {Object} params - 查询参数
   * @param {string} params.status - 状态筛选（pending/used/all）
   * @param {number} params.page - 页码
   * @param {number} params.page_size - 每页数量
   * @returns {Promise} API响应
   */
  static async getPresetList(params = {}) {
    return await this.request(API_ENDPOINTS.PRESET.LIST, {
      queryParams: params
    })
  }

  /**
   * 获取用户预设
   * @param {number} userId - 用户ID
   * @param {Object} params - 查询参数
   * @returns {Promise} API响应
   */
  static async getUserPresets(userId, params = {}) {
    return await this.request(API_ENDPOINTS.PRESET.USER_LIST, {
      pathParams: { user_id: userId },
      queryParams: params
    })
  }

  /**
   * 创建预设
   * @param {Object} data - 预设数据
   * @returns {Promise} API响应
   */
  static async createPreset(data) {
    return await this.request(API_ENDPOINTS.PRESET.CREATE, {
      method: 'POST',
      body: data
    })
  }

  /**
   * 删除用户预设
   * @param {number} userId - 用户ID
   * @returns {Promise} API响应
   */
  static async deleteUserPresets(userId) {
    return await this.request(API_ENDPOINTS.PRESET.DELETE, {
      method: 'DELETE',
      pathParams: { user_id: userId }
    })
  }

  /**
   * 获取预设统计信息
   * @returns {Promise} API响应
   */
  static async getPresetStats() {
    return await this.request(API_ENDPOINTS.PRESET.STATS)
  }

  // ===== 认证相关API封装 =====

  /**
   * 用户登录
   * @param {string} mobile - 手机号
   * @param {string} verification_code - 验证码
   * @returns {Promise} API响应
   */
  static async login(mobile, verification_code) {
    return await this.request(API_ENDPOINTS.AUTH.LOGIN, {
      method: 'POST',
      body: { mobile, verification_code }
    })
  }

  /**
   * 用户登出
   * @returns {Promise} API响应
   */
  static async logout() {
    return await this.request(API_ENDPOINTS.AUTH.LOGOUT, {
      method: 'POST'
    })
  }

  /**
   * 验证token
   * @returns {Promise} API响应
   */
  static async verifyToken() {
    return await this.request(API_ENDPOINTS.AUTH.VERIFY)
  }

  // ===== 奖品管理API封装 =====

  /**
   * 获取奖品列表
   * @param {Object} params - 查询参数
   * @returns {Promise} API响应
   */
  static async getPrizeList(params = {}) {
    return await this.request(API_ENDPOINTS.PRIZE.LIST, {
      queryParams: params
    })
  }

  /**
   * 创建奖品
   * @param {Object} data - 奖品数据
   * @returns {Promise} API响应
   */
  static async createPrize(data) {
    return await this.request(API_ENDPOINTS.PRIZE.CREATE, {
      method: 'POST',
      body: data
    })
  }

  /**
   * 更新奖品
   * @param {number} prizeId - 奖品ID
   * @param {Object} data - 更新数据
   * @returns {Promise} API响应
   */
  static async updatePrize(prizeId, data) {
    return await this.request(API_ENDPOINTS.PRIZE.UPDATE, {
      method: 'PUT',
      pathParams: { prize_id: prizeId },
      body: data
    })
  }

  /**
   * 删除奖品
   * @param {number} prizeId - 奖品ID
   * @returns {Promise} API响应
   */
  static async deletePrize(prizeId) {
    return await this.request(API_ENDPOINTS.PRIZE.DELETE, {
      method: 'DELETE',
      pathParams: { prize_id: prizeId }
    })
  }

  // ===== 系统管理API封装 =====

  /**
   * 获取系统仪表板数据
   * @returns {Promise} API响应
   */
  static async getDashboard() {
    return await this.request(API_ENDPOINTS.SYSTEM.DASHBOARD)
  }

  /**
   * 健康检查
   * @returns {Promise} API响应
   */
  static async healthCheck() {
    return await this.request(API_ENDPOINTS.SYSTEM.HEALTH)
  }
}

// 暴露到全局作用域
if (typeof window !== 'undefined') {
  window.API_ENDPOINTS = API_ENDPOINTS
  window.API = API
  console.log('✅ API配置已加载')
}

// 支持模块化导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API_ENDPOINTS, API }
}
