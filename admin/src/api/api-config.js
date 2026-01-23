/**
 * @file API路径集中管理配置文件（向后兼容版本）
 * @description 避免前端硬编码API路径，统一管理所有API端点
 *
 * @deprecated 推荐使用新的模块化API导入方式：
 * ```javascript
 * import { AuthAPI, UserAPI } from './api/index.js'
 * await AuthAPI.login(data)
 * ```
 *
 * @module api-config
 * @version 4.0.0
 * @author Restaurant Lottery System
 *
 * @example 传统使用方式
 * // 在HTML中引入此文件：<script src="js/api-config.js"></script>
 * // 使用API.xxx()方法调用接口
 * const result = await API.login(mobile, code)
 *
 * @example 推荐的模块化使用方式
 * import { AuthAPI } from './api/index.js'
 * const result = await AuthAPI.login({ mobile, verification_code })
 */

/**
 * API端点常量定义
 * @description 集中管理所有API路径，避免硬编码
 * @deprecated 推荐使用各模块的 ENDPOINTS 常量（如 AUTH_ENDPOINTS）
 * @type {Object}
 * @property {Object} AUTH - 认证相关API端点
 * @property {Object} PRESET - 预设管理API端点
 * @property {Object} PRIZE - 奖品池管理API端点
 * @property {Object} USER - 用户管理API端点
 * @property {Object} ROLE - 角色管理API端点
 * @property {Object} LOTTERY - 抽奖管理API端点
 * @property {Object} PERMISSION - 权限管理API端点
 * @property {Object} SYSTEM - 系统管理API端点
 * @property {Object} ANALYTICS - 数据分析API端点
 * @property {Object} CAMPAIGN - 抽奖活动管理API端点
 * @property {Object} STRATEGY - 策略配置API端点
 * @property {Object} MATRIX - 矩阵配置API端点
 * @property {Object} TIER_RULES - 档位规则API端点
 * @property {Object} DEBT - 欠账管理API端点
 * @property {Object} STORE - 门店管理API端点
 * @property {Object} STAFF - 员工管理API端点
 * @property {Object} RISK_ALERT - 风控告警API端点
 * @property {Object} DICT - 字典管理API端点
 * @property {Object} ITEM_TEMPLATE - 物品模板API端点
 * @property {Object} LOTTERY_MONITORING - 抽奖监控API端点
 * @property {Object} LOTTERY_STRATEGY_STATS - 策略统计API端点
 * @property {Object} BUSINESS_RECORDS - 业务记录API端点
 * @property {Object} PRICING - 活动定价配置API端点
 * @property {Object} REGION - 行政区划API端点
 * @property {Object} SESSIONS - 会话管理API端点
 * @property {Object} FEATURE_FLAGS - 功能开关API端点
 * @property {Object} RISK_PROFILES - 用户风控配置API端点
 * @property {Object} USER_PREMIUM - 用户高级状态API端点
 * @property {Object} SYSTEM_DATA - 系统数据API端点
 * @property {Object} ANNOUNCEMENT - 公告管理API端点
 * @property {Object} NOTIFICATION - 系统通知API端点
 * @property {Object} POPUP_BANNER - 弹窗Banner API端点
 * @property {Object} IMAGE - 图片资源API端点
 * @property {Object} CACHE - 缓存管理API端点
 * @property {Object} SETTINGS - 设置管理API端点
 * @property {Object} USER_HIERARCHY - 用户层级API端点
 * @property {Object} MERCHANT_POINTS - 商户积分API端点
 * @property {Object} LOTTERY_QUOTA - 抽奖配额API端点
 * @property {Object} ACTIVITIES - 活动管理API端点
 * @property {Object} PROBABILITY - 概率调整API端点
 * @property {Object} ASSETS - 资产管理API端点
 * @property {Object} ASSET_ADJUSTMENT - 资产调整API端点
 * @property {Object} MATERIAL - 材料资产API端点
 * @property {Object} CUSTOMER_SERVICE - 客服会话API端点
 * @property {Object} CAMPAIGN_BUDGET - 活动预算API端点
 * @property {Object} MARKETPLACE - 市场管理API端点
 * @property {Object} C2C_MARKET - C2C市场API端点
 * @property {Object} ORPHAN_FROZEN - 孤儿冻结API端点
 * @property {Object} LOTTERY_INTERVENTION - 抽奖干预管理API端点
 * @property {Object} LOTTERY_CAMPAIGNS - 抽奖活动API端点
 * @property {Object} CONSUMPTION - 消费记录API端点
 * @property {Object} FEEDBACK - 反馈管理API端点
 * @property {Object} CONSOLE_AUTH - 控制台认证API端点
 * @property {Object} TRADE_ORDERS - 交易订单API端点
 * @property {Object} MARKETPLACE_STATS - 市场统计API端点
 * @property {Object} AUDIT_LOGS - 审计日志API端点
 * @property {Object} SETTINGS_EXT - 设置管理扩展API端点
 * @property {Object} DIAMOND_ACCOUNTS - 钻石账户API端点
 * @property {Object} USER_HIERARCHY_EXT - 用户层级扩展API端点
 */
const API_ENDPOINTS = {
  /**
   * 认证相关API端点
   * @description 处理用户登录、注册、登出、Token验证等认证操作
   * @type {Object}
   * @property {string} LOGIN - [POST] 用户登录接口
   * @property {string} REGISTER - [POST] 用户注册接口
   * @property {string} LOGOUT - [POST] 用户登出接口
   * @property {string} VERIFY - [GET] 验证Token有效性
   * @property {string} REFRESH - [POST] 刷新Token
   */
  AUTH: {
    /** @type {string} [POST] 用户登录 - Body: { mobile, verification_code } */
    LOGIN: '/api/v4/auth/login',
    /** @type {string} [POST] 用户注册 - Body: { mobile, verification_code, ... } */
    REGISTER: '/api/v4/auth/register',
    /** @type {string} [POST] 用户登出 - Header: Authorization */
    LOGOUT: '/api/v4/auth/logout',
    /** @type {string} [GET] 验证Token有效性 - Header: Authorization */
    VERIFY: '/api/v4/auth/verify',
    /** @type {string} [POST] 刷新Token - Body: { refresh_token } */
    REFRESH: '/api/v4/auth/refresh'
  },

  /**
   * 预设管理API端点
   * @description 管理抽奖预设配置，包括创建、查询、删除预设
   * @type {Object}
   * @property {string} LIST - [GET] 获取所有预设列表（管理员）
   * @property {string} CREATE - [POST] 创建新预设
   * @property {string} USER_LIST - [GET] 获取指定用户的预设列表
   * @property {string} DELETE - [DELETE] 删除用户预设
   * @property {string} STATS - [GET] 获取预设统计信息
   */
  PRESET: {
    /** @type {string} [GET] 获取所有预设列表 - Query: { status?, page?, page_size? } */
    LIST: '/api/v4/lottery/preset/list',
    /** @type {string} [POST] 创建预设 - Body: { name, config, ... } */
    CREATE: '/api/v4/lottery/preset/create',
    /** @type {string} [GET] 获取用户预设 - Path: :user_id */
    USER_LIST: '/api/v4/lottery/preset/user/:user_id',
    /** @type {string} [DELETE] 删除用户预设 - Path: :user_id */
    DELETE: '/api/v4/lottery/preset/user/:user_id',
    /** @type {string} [GET] 获取预设统计信息 */
    STATS: '/api/v4/lottery/preset/stats'
  },

  /**
   * 奖品池管理API端点
   * @description 管理抽奖奖品，包括添加、更新、删除奖品及库存管理
   * @type {Object}
   * @property {string} LIST - [GET] 获取奖品列表
   * @property {string} BATCH_ADD - [POST] 批量添加奖品
   * @property {string} UPDATE - [PUT] 更新奖品信息
   * @property {string} DELETE - [DELETE] 删除奖品
   * @property {string} DETAIL - [GET] 获取奖品详情
   * @property {string} ADD_STOCK - [POST] 增加奖品库存
   */
  PRIZE: {
    /** @type {string} [GET] 获取奖品列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/console/prize-pool/list',
    /** @type {string} [POST] 批量添加奖品 - Body: { prizes: [...] } */
    BATCH_ADD: '/api/v4/console/prize-pool/batch-add',
    /** @type {string} [PUT] 更新奖品 - Path: :prize_id, Body: { name?, stock?, ... } */
    UPDATE: '/api/v4/console/prize-pool/prize/:prize_id',
    /** @type {string} [DELETE] 删除奖品 - Path: :prize_id */
    DELETE: '/api/v4/console/prize-pool/prize/:prize_id',
    /** @type {string} [GET] 获取奖品详情 - Path: :prize_id */
    DETAIL: '/api/v4/console/prize-pool/prize/:prize_id',
    /** @type {string} [POST] 增加库存 - Path: :prize_id, Body: { quantity } */
    ADD_STOCK: '/api/v4/console/prize-pool/prize/:prize_id/add-stock'
  },

  /**
   * 用户管理API端点
   * @description 管理系统用户，包括查询、角色变更、状态管理等
   * @type {Object}
   * @property {string} LIST - [GET] 获取用户列表
   * @property {string} DETAIL - [GET] 获取用户详情
   * @property {string} UPDATE_ROLE - [PUT] 更新用户角色
   * @property {string} UPDATE_STATUS - [PUT] 更新用户状态
   * @property {string} DELETE - [DELETE] 删除用户
   */
  USER: {
    /** @type {string} [GET] 获取用户列表 - Query: { page?, page_size?, search?, role?, status? } */
    LIST: '/api/v4/console/user-management/users',
    /** @type {string} [GET] 获取用户详情 - Path: :user_id */
    DETAIL: '/api/v4/console/user-management/users/:user_id',
    /** @type {string} [PUT] 更新用户角色 - Path: :user_id, Body: { role_name } */
    UPDATE_ROLE: '/api/v4/console/user-management/users/:user_id/role',
    /** @type {string} [PUT] 更新用户状态 - Path: :user_id, Body: { status } */
    UPDATE_STATUS: '/api/v4/console/user-management/users/:user_id/status',
    /** @type {string} [DELETE] 删除用户 - Path: :user_id */
    DELETE: '/api/v4/console/user-management/users/:user_id'
  },

  /**
   * 角色管理API端点
   * @description 管理系统角色，当前仅支持角色列表查询
   * @note 后端只实现了角色列表查询，角色的创建/编辑/删除通过数据库管理
   * @note 用户角色变更请使用 USER.UPDATE_ROLE API
   * @type {Object}
   * @property {string} LIST - [GET] 获取角色列表（只读）
   */
  ROLE: {
    /** @type {string} [GET] 获取角色列表 - 只读接口 */
    LIST: '/api/v4/console/user-management/roles'
    // 以下API后端未实现，已移除：
    // DETAIL, CREATE, UPDATE, DELETE, ASSIGN, PERMISSIONS
  },

  /**
   * 抽奖管理API端点
   * @description 抽奖核心功能，包括执行抽奖、查询历史、获取策略
   * @type {Object}
   * @property {string} EXECUTE - [POST] 执行抽奖
   * @property {string} HISTORY - [GET] 获取抽奖历史
   * @property {string} STRATEGIES - [GET] 获取抽奖策略列表
   */
  LOTTERY: {
    /** @type {string} [POST] 执行抽奖 - Body: { campaign_code, ... } */
    EXECUTE: '/api/v4/lottery/execute',
    /** @type {string} [GET] 获取抽奖历史 - Query: { page?, page_size?, user_id? } */
    HISTORY: '/api/v4/lottery/history',
    /** @type {string} [GET] 获取抽奖策略列表 */
    STRATEGIES: '/api/v4/lottery/strategies'
  },

  /**
   * 权限管理API端点
   * @description 管理用户权限，包括权限检查、提升、创建管理员等
   * @type {Object}
   * @property {string} CHECK - [POST] 检查权限
   * @property {string} USER_PERMISSIONS - [GET] 获取用户权限
   * @property {string} MY_PERMISSIONS - [GET] 获取当前用户权限
   * @property {string} PROMOTE - [POST] 提升用户权限
   * @property {string} CREATE_ADMIN - [POST] 创建管理员
   */
  PERMISSION: {
    /** @type {string} [POST] 检查权限 - Body: { permission, resource? } */
    CHECK: '/api/v4/permissions/check',
    /** @type {string} [GET] 获取用户权限 - Path: :userId */
    USER_PERMISSIONS: '/api/v4/permissions/user/:userId',
    /** @type {string} [GET] 获取当前用户权限 */
    MY_PERMISSIONS: '/api/v4/permissions/me',
    /** @type {string} [POST] 提升用户权限 - Body: { user_id, role } */
    PROMOTE: '/api/v4/permissions/promote',
    /** @type {string} [POST] 创建管理员 - Body: { user_id, ... } */
    CREATE_ADMIN: '/api/v4/permissions/create-admin'
  },

  /**
   * 系统管理API端点
   * @description 系统级别管理功能，包括仪表板、健康检查、统计图表等
   * @type {Object}
   * @property {string} DASHBOARD - [GET] 获取系统仪表板数据
   * @property {string} DASHBOARD_TRENDS - [GET] 获取仪表盘趋势数据
   * @property {string} HEALTH - [GET] 系统健康检查
   * @property {string} VERSION - [GET] 获取API版本信息
   * @property {string} CHARTS - [GET] 获取统计图表数据
   * @property {string} STATISTICS_EXPORT - [GET] 导出统计数据
   * @property {string} CONSOLE_NOTIFICATIONS - [GET/POST] 控制台通知管理
   */
  SYSTEM: {
    /** @type {string} [GET] 获取系统仪表板数据 */
    DASHBOARD: '/api/v4/console/system/dashboard',
    /** @type {string} [GET] 获取仪表盘趋势数据 */
    DASHBOARD_TRENDS: '/api/v4/console/analytics/decisions/analytics',
    /** @type {string} [GET] 系统健康检查 */
    HEALTH: '/health',
    /** @type {string} [GET] 获取API版本信息 */
    VERSION: '/api/v4',
    /** @type {string} [GET] 获取统计图表数据 - Query: { type?, start_date?, end_date? } */
    CHARTS: '/api/v4/system/statistics/charts',
    /** @type {string} [GET] 导出统计数据 - Query: { type?, format? } */
    STATISTICS_EXPORT: '/api/v4/system/statistics/export',
    /** @type {string} [GET/POST] 控制台通知管理 */
    CONSOLE_NOTIFICATIONS: '/api/v4/console/system/notifications'
  },

  /**
   * 数据分析API端点
   * @description 数据分析和报表功能，包括今日统计、决策分析、趋势分析等
   * @type {Object}
   * @property {string} TODAY_STATS - [GET] 获取今日统计数据
   * @property {string} DECISIONS - [GET] 获取决策分析数据
   * @property {string} LOTTERY_TRENDS - [GET] 获取抽奖趋势数据
   */
  ANALYTICS: {
    /** @type {string} [GET] 获取今日统计数据 */
    TODAY_STATS: '/api/v4/console/analytics/stats/today',
    /** @type {string} [GET] 获取决策分析数据 - Query: { start_date?, end_date? } */
    DECISIONS: '/api/v4/console/analytics/decisions/analytics',
    /** @type {string} [GET] 获取抽奖趋势数据 - Query: { period?, campaign_code? } */
    LOTTERY_TRENDS: '/api/v4/console/analytics/lottery/trends'
  },

  /**
   * 抽奖活动管理API端点
   * @description 管理抽奖活动，包括活动列表、详情、预算等
   * @type {Object}
   * @property {string} LIST - [GET] 获取活动列表
   * @property {string} DETAIL - [GET] 获取活动详情
   * @property {string} BUDGET - [GET] 获取活动预算信息
   */
  CAMPAIGN: {
    /** @type {string} [GET] 获取活动列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/console/system-data/lottery-campaigns',
    /** @type {string} [GET] 获取活动详情 - Path: :campaign_id */
    DETAIL: '/api/v4/console/system-data/lottery-campaigns/:campaign_id',
    /** @type {string} [GET] 获取活动预算 - Path: :campaign_id */
    BUDGET: '/api/v4/console/campaign-budget/campaigns/:campaign_id'
  },

  /**
   * 策略配置API端点
   * @description 管理抽奖策略配置，支持CRUD操作
   * @type {Object}
   * @property {string} LIST - [GET] 获取策略列表
   * @property {string} DETAIL - [GET] 获取策略详情
   * @property {string} CREATE - [POST] 创建策略
   * @property {string} UPDATE - [PUT] 更新策略
   * @property {string} DELETE - [DELETE] 删除策略
   */
  STRATEGY: {
    /** @type {string} [GET] 获取策略列表 - Query: { page?, page_size? } */
    LIST: '/api/v4/console/lottery-configs/strategies',
    /** @type {string} [GET] 获取策略详情 - Path: :id */
    DETAIL: '/api/v4/console/lottery-configs/strategies/:id',
    /** @type {string} [POST] 创建策略 - Body: { name, config, ... } */
    CREATE: '/api/v4/console/lottery-configs/strategies',
    /** @type {string} [PUT] 更新策略 - Path: :id, Body: { name?, config?, ... } */
    UPDATE: '/api/v4/console/lottery-configs/strategies/:id',
    /** @type {string} [DELETE] 删除策略 - Path: :id */
    DELETE: '/api/v4/console/lottery-configs/strategies/:id'
  },

  /**
   * 矩阵配置API端点
   * @description 管理抽奖矩阵配置，支持版本历史和回滚
   * @type {Object}
   * @property {string} LIST - [GET] 获取矩阵列表
   * @property {string} FULL - [GET] 获取完整矩阵配置
   * @property {string} DETAIL - [GET] 获取矩阵详情
   * @property {string} GET - [GET] 获取矩阵详情（别名）
   * @property {string} CREATE - [POST] 创建矩阵配置
   * @property {string} UPDATE - [PUT] 更新矩阵配置
   * @property {string} HISTORY - [GET] 获取矩阵历史
   * @property {string} ROLLBACK - [POST] 回滚矩阵配置
   */
  MATRIX: {
    /** @type {string} [GET] 获取矩阵列表 */
    LIST: '/api/v4/console/lottery-configs/matrix',
    /** @type {string} [GET] 获取完整矩阵配置 */
    FULL: '/api/v4/console/lottery-configs/matrix/full',
    /** @type {string} [GET] 获取矩阵详情 - Path: :id */
    DETAIL: '/api/v4/console/lottery-configs/matrix/:id',
    /** @type {string} [GET] 获取矩阵详情（别名）- Path: :id */
    GET: '/api/v4/console/lottery-configs/matrix/:id',
    /** @type {string} [POST] 创建矩阵配置 - Body: { name, config, ... } */
    CREATE: '/api/v4/console/lottery-configs/matrix',
    /** @type {string} [PUT] 更新矩阵配置 - Path: :id, Body: { config, ... } */
    UPDATE: '/api/v4/console/lottery-configs/matrix/:id',
    /** @type {string} [GET] 获取矩阵历史 - Query: { page?, page_size? } */
    HISTORY: '/api/v4/console/lottery-configs/matrix/history',
    /** @type {string} [POST] 回滚矩阵配置 - Path: :id */
    ROLLBACK: '/api/v4/console/lottery-configs/matrix/:id/rollback'
  },

  /**
   * 档位规则API端点
   * @description 管理抽奖档位规则，定义不同档位的中奖概率等
   * @type {Object}
   * @property {string} LIST - [GET] 获取档位规则列表
   * @property {string} DETAIL - [GET] 获取档位规则详情
   * @property {string} CREATE - [POST] 创建档位规则
   * @property {string} UPDATE - [PUT] 更新档位规则
   * @property {string} DELETE - [DELETE] 删除档位规则
   */
  TIER_RULES: {
    /** @type {string} [GET] 获取档位规则列表 */
    LIST: '/api/v4/console/lottery-tier-rules',
    /** @type {string} [GET] 获取档位规则详情 - Path: :id */
    DETAIL: '/api/v4/console/lottery-tier-rules/:id',
    /** @type {string} [POST] 创建档位规则 - Body: { tier, probability, ... } */
    CREATE: '/api/v4/console/lottery-tier-rules',
    /** @type {string} [PUT] 更新档位规则 - Path: :id, Body: { probability, ... } */
    UPDATE: '/api/v4/console/lottery-tier-rules/:id',
    /** @type {string} [DELETE] 删除档位规则 - Path: :id */
    DELETE: '/api/v4/console/lottery-tier-rules/:id'
  },

  /**
   * 欠账管理API端点
   * @description 管理系统欠账，按活动、奖品、创建者等维度查看和清理
   * @type {Object}
   * @property {string} DASHBOARD - [GET] 获取欠账仪表板
   * @property {string} BY_CAMPAIGN - [GET] 按活动查看欠账
   * @property {string} BY_PRIZE - [GET] 按奖品查看欠账
   * @property {string} BY_CREATOR - [GET] 按创建者查看欠账
   * @property {string} PENDING - [GET] 获取待处理欠账
   * @property {string} CLEAR - [POST] 清理欠账
   * @property {string} LIMITS - [GET] 获取欠账限制配置
   * @property {string} LIMITS_DETAIL - [GET] 获取欠账限制详情
   */
  DEBT: {
    /** @type {string} [GET] 获取欠账仪表板 */
    DASHBOARD: '/api/v4/console/debt-management/dashboard',
    /** @type {string} [GET] 按活动查看欠账 */
    BY_CAMPAIGN: '/api/v4/console/debt-management/by-campaign',
    /** @type {string} [GET] 按奖品查看欠账 */
    BY_PRIZE: '/api/v4/console/debt-management/by-prize',
    /** @type {string} [GET] 按创建者查看欠账 */
    BY_CREATOR: '/api/v4/console/debt-management/by-creator',
    /** @type {string} [GET] 获取待处理欠账 */
    PENDING: '/api/v4/console/debt-management/pending',
    /** @type {string} [POST] 清理欠账 - Body: { debt_ids, ... } */
    CLEAR: '/api/v4/console/debt-management/clear',
    /** @type {string} [GET] 获取欠账限制配置 */
    LIMITS: '/api/v4/console/debt-management/limits',
    /** @type {string} [GET] 获取欠账限制详情 - Path: :id */
    LIMITS_DETAIL: '/api/v4/console/debt-management/limits/:id'
  },

  /**
   * 门店管理API端点
   * @description 管理门店信息，包括CRUD和状态管理
   * @type {Object}
   * @property {string} LIST - [GET] 获取门店列表
   * @property {string} STATS - [GET] 获取门店统计
   * @property {string} DETAIL - [GET] 获取门店详情
   * @property {string} CREATE - [POST] 创建门店
   * @property {string} UPDATE - [PUT] 更新门店
   * @property {string} DELETE - [DELETE] 删除门店
   * @property {string} ACTIVATE - [POST] 激活门店
   * @property {string} DEACTIVATE - [POST] 停用门店
   */
  STORE: {
    /** @type {string} [GET] 获取门店列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/console/stores',
    /** @type {string} [GET] 获取门店统计 */
    STATS: '/api/v4/console/stores/stats',
    /** @type {string} [GET] 获取门店详情 - Path: :store_id */
    DETAIL: '/api/v4/console/stores/:store_id',
    /** @type {string} [POST] 创建门店 - Body: { name, address, ... } */
    CREATE: '/api/v4/console/stores',
    /** @type {string} [PUT] 更新门店 - Path: :store_id, Body: { name?, address?, ... } */
    UPDATE: '/api/v4/console/stores/:store_id',
    /** @type {string} [DELETE] 删除门店 - Path: :store_id */
    DELETE: '/api/v4/console/stores/:store_id',
    /** @type {string} [POST] 激活门店 - Path: :store_id */
    ACTIVATE: '/api/v4/console/stores/:store_id/activate',
    /** @type {string} [POST] 停用门店 - Path: :store_id */
    DEACTIVATE: '/api/v4/console/stores/:store_id/deactivate'
  },

  /**
   * 员工管理API端点
   * @description 管理门店员工，包括创建、调岗、禁用等
   * @type {Object}
   * @property {string} LIST - [GET] 获取员工列表
   * @property {string} STATS - [GET] 获取员工统计
   * @property {string} DETAIL - [GET] 获取员工详情
   * @property {string} BY_USER - [GET] 按用户ID获取员工信息
   * @property {string} CREATE - [POST] 创建员工
   * @property {string} TRANSFER - [POST] 员工调岗
   * @property {string} ROLE - [PUT] 更新员工角色
   * @property {string} DISABLE - [POST] 禁用员工
   * @property {string} ENABLE - [POST] 启用员工
   */
  STAFF: {
    /** @type {string} [GET] 获取员工列表 - Query: { page?, page_size?, store_id? } */
    LIST: '/api/v4/console/staff',
    /** @type {string} [GET] 获取员工统计 */
    STATS: '/api/v4/console/staff/stats',
    /** @type {string} [GET] 获取员工详情 - Path: :store_staff_id */
    DETAIL: '/api/v4/console/staff/:store_staff_id',
    /** @type {string} [GET] 按用户ID获取员工信息 - Path: :user_id */
    BY_USER: '/api/v4/console/staff/by-user/:user_id',
    /** @type {string} [POST] 创建员工 - Body: { user_id, store_id, role, ... } */
    CREATE: '/api/v4/console/staff',
    /** @type {string} [POST] 员工调岗 - Body: { staff_id, target_store_id } */
    TRANSFER: '/api/v4/console/staff/transfer',
    /** @type {string} [PUT] 更新员工角色 - Path: :store_staff_id, Body: { role } */
    ROLE: '/api/v4/console/staff/:store_staff_id/role',
    /** @type {string} [POST] 禁用员工 - Path: :user_id */
    DISABLE: '/api/v4/console/staff/disable/:user_id',
    /** @type {string} [POST] 启用员工 - Body: { user_id } */
    ENABLE: '/api/v4/console/staff/enable'
  },

  /**
   * 风控告警API端点
   * @description 风控告警管理，包括告警列表、处理、统计等
   * @type {Object}
   * @property {string} LIST - [GET] 获取告警列表
   * @property {string} PENDING - [GET] 获取待处理告警
   * @property {string} DETAIL - [GET] 获取告警详情
   * @property {string} REVIEW - [POST] 审核告警
   * @property {string} HANDLE - [POST] 处理告警
   * @property {string} HISTORY - [GET] 获取告警历史
   * @property {string} MARK_ALL_READ - [POST] 标记全部已读
   * @property {string} STATS_SUMMARY - [GET] 获取统计摘要
   * @property {string} STATS_STORE - [GET] 按门店获取统计
   * @property {string} TYPES - [GET] 获取告警类型列表
   */
  RISK_ALERT: {
    /** @type {string} [GET] 获取告警列表 - Query: { page?, page_size?, status?, type? } */
    LIST: '/api/v4/console/risk-alerts',
    /** @type {string} [GET] 获取待处理告警 */
    PENDING: '/api/v4/console/risk-alerts/pending',
    /** @type {string} [GET] 获取告警详情 - Path: :alert_id */
    DETAIL: '/api/v4/console/risk-alerts/:alert_id',
    /** @type {string} [POST] 审核告警 - Path: :alert_id, Body: { decision, reason? } */
    REVIEW: '/api/v4/console/risk-alerts/:alert_id/review',
    /** @type {string} [POST] 处理告警 - Path: :alert_id, Body: { action, ... } */
    HANDLE: '/api/v4/console/risk-alerts/:alert_id/handle',
    /** @type {string} [GET] 获取告警历史 - Query: { page?, page_size?, start_date?, end_date? } */
    HISTORY: '/api/v4/console/risk-alerts/history',
    /** @type {string} [POST] 标记全部已读 */
    MARK_ALL_READ: '/api/v4/console/risk-alerts/mark-all-read',
    /** @type {string} [GET] 获取统计摘要 */
    STATS_SUMMARY: '/api/v4/console/risk-alerts/stats/summary',
    /** @type {string} [GET] 按门店获取统计 - Path: :store_id */
    STATS_STORE: '/api/v4/console/risk-alerts/stats/store/:store_id',
    /** @type {string} [GET] 获取告警类型列表 */
    TYPES: '/api/v4/console/risk-alerts/types'
  },

  /**
   * 字典管理API端点
   * @description 管理系统字典数据，包括类目、稀有度、资产分组三种字典表
   * @note 后端提供三种具体的字典表管理：category_defs、rarity_defs、asset_group_defs
   * @type {Object}
   * @property {string} ALL - [GET] 获取所有字典数据
   * @property {string} CATEGORIES - [GET] 获取类目列表
   * @property {string} CATEGORY_DETAIL - [GET] 获取类目详情
   * @property {string} CREATE_CATEGORY - [POST] 创建类目
   * @property {string} UPDATE_CATEGORY - [PUT] 更新类目
   * @property {string} DELETE_CATEGORY - [DELETE] 删除类目
   * @property {string} RARITIES - [GET] 获取稀有度列表
   * @property {string} RARITY_DETAIL - [GET] 获取稀有度详情
   * @property {string} CREATE_RARITY - [POST] 创建稀有度
   * @property {string} UPDATE_RARITY - [PUT] 更新稀有度
   * @property {string} DELETE_RARITY - [DELETE] 删除稀有度
   * @property {string} ASSET_GROUPS - [GET] 获取资产分组列表
   * @property {string} ASSET_GROUP_DETAIL - [GET] 获取资产分组详情
   * @property {string} CREATE_ASSET_GROUP - [POST] 创建资产分组
   * @property {string} UPDATE_ASSET_GROUP - [PUT] 更新资产分组
   * @property {string} DELETE_ASSET_GROUP - [DELETE] 删除资产分组
   */
  DICT: {
    /** @type {string} [GET] 获取所有字典数据（用于下拉选项） */
    ALL: '/api/v4/console/dictionaries/all',
    // 类目字典（category_defs）
    /** @type {string} [GET] 获取类目列表 */
    CATEGORIES: '/api/v4/console/dictionaries/categories',
    /** @type {string} [GET] 获取类目详情 - Path: :code */
    CATEGORY_DETAIL: '/api/v4/console/dictionaries/categories/:code',
    /** @type {string} [POST] 创建类目 - Body: { code, name, ... } */
    CREATE_CATEGORY: '/api/v4/console/dictionaries/categories',
    /** @type {string} [PUT] 更新类目 - Path: :code, Body: { name, ... } */
    UPDATE_CATEGORY: '/api/v4/console/dictionaries/categories/:code',
    /** @type {string} [DELETE] 删除类目 - Path: :code */
    DELETE_CATEGORY: '/api/v4/console/dictionaries/categories/:code',
    // 稀有度字典（rarity_defs）
    /** @type {string} [GET] 获取稀有度列表 */
    RARITIES: '/api/v4/console/dictionaries/rarities',
    /** @type {string} [GET] 获取稀有度详情 - Path: :code */
    RARITY_DETAIL: '/api/v4/console/dictionaries/rarities/:code',
    /** @type {string} [POST] 创建稀有度 - Body: { code, name, level, ... } */
    CREATE_RARITY: '/api/v4/console/dictionaries/rarities',
    /** @type {string} [PUT] 更新稀有度 - Path: :code, Body: { name, level, ... } */
    UPDATE_RARITY: '/api/v4/console/dictionaries/rarities/:code',
    /** @type {string} [DELETE] 删除稀有度 - Path: :code */
    DELETE_RARITY: '/api/v4/console/dictionaries/rarities/:code',
    // 资产分组字典（asset_group_defs）
    /** @type {string} [GET] 获取资产分组列表 */
    ASSET_GROUPS: '/api/v4/console/dictionaries/asset-groups',
    /** @type {string} [GET] 获取资产分组详情 - Path: :code */
    ASSET_GROUP_DETAIL: '/api/v4/console/dictionaries/asset-groups/:code',
    /** @type {string} [POST] 创建资产分组 - Body: { code, name, ... } */
    CREATE_ASSET_GROUP: '/api/v4/console/dictionaries/asset-groups',
    /** @type {string} [PUT] 更新资产分组 - Path: :code, Body: { name, ... } */
    UPDATE_ASSET_GROUP: '/api/v4/console/dictionaries/asset-groups/:code',
    /** @type {string} [DELETE] 删除资产分组 - Path: :code */
    DELETE_ASSET_GROUP: '/api/v4/console/dictionaries/asset-groups/:code'
  },

  /**
   * 物品模板API端点
   * @description 管理物品模板，定义物品的基本属性和类型
   * @type {Object}
   * @property {string} LIST - [GET] 获取物品模板列表
   * @property {string} TYPES - [GET] 获取物品类型列表
   * @property {string} DETAIL - [GET] 获取模板详情
   * @property {string} CREATE - [POST] 创建模板
   * @property {string} UPDATE - [PUT] 更新模板
   * @property {string} DELETE - [DELETE] 删除模板
   * @property {string} BATCH_STATUS - [PUT] 批量更新状态
   */
  ITEM_TEMPLATE: {
    /** @type {string} [GET] 获取物品模板列表 - Query: { page?, page_size?, type?, status? } */
    LIST: '/api/v4/console/item-templates',
    /** @type {string} [GET] 获取物品类型列表 */
    TYPES: '/api/v4/console/item-templates/types',
    /** @type {string} [GET] 获取模板详情 - Path: :id */
    DETAIL: '/api/v4/console/item-templates/:id',
    /** @type {string} [POST] 创建模板 - Body: { name, type, config, ... } */
    CREATE: '/api/v4/console/item-templates',
    /** @type {string} [PUT] 更新模板 - Path: :id, Body: { name?, config?, ... } */
    UPDATE: '/api/v4/console/item-templates/:id',
    /** @type {string} [DELETE] 删除模板 - Path: :id */
    DELETE: '/api/v4/console/item-templates/:id',
    /** @type {string} [PUT] 批量更新状态 - Body: { ids, status } */
    BATCH_STATUS: '/api/v4/console/item-templates/batch/status'
  },

  /**
   * 抽奖监控API端点
   * @description 监控抽奖活动运行状态，包括小时指标、用户体验状态等
   * @type {Object}
   * @property {string} HOURLY_METRICS - [GET] 获取小时指标
   * @property {string} HOURLY_SUMMARY - [GET] 获取活动小时汇总
   * @property {string} STATS - [GET] 获取监控统计
   * @property {string} USER_EXPERIENCE - [GET] 获取用户体验状态列表
   * @property {string} USER_EXPERIENCE_DETAIL - [GET] 获取用户体验详情
   * @property {string} USER_GLOBAL - [GET] 获取用户全局状态列表
   * @property {string} USER_GLOBAL_DETAIL - [GET] 获取用户全局状态详情
   * @property {string} USER_QUOTAS - [GET] 获取用户配额列表
   */
  LOTTERY_MONITORING: {
    /** @type {string} [GET] 获取小时指标 - Query: { campaign_id?, date? } */
    HOURLY_METRICS: '/api/v4/console/lottery-monitoring/hourly-metrics',
    /** @type {string} [GET] 获取活动小时汇总 - Path: :campaign_id */
    HOURLY_SUMMARY: '/api/v4/console/lottery-monitoring/hourly-metrics/summary/:campaign_id',
    /** @type {string} [GET] 获取监控统计 */
    STATS: '/api/v4/console/lottery-monitoring/stats',
    /** @type {string} [GET] 获取用户体验状态列表 - Query: { page?, page_size? } */
    USER_EXPERIENCE: '/api/v4/console/lottery-monitoring/user-experience-states',
    /** @type {string} [GET] 获取用户体验详情 - Path: :user_id, :campaign_id */
    USER_EXPERIENCE_DETAIL:
      '/api/v4/console/lottery-monitoring/user-experience-states/:user_id/:campaign_id',
    /** @type {string} [GET] 获取用户全局状态列表 - Query: { page?, page_size? } */
    USER_GLOBAL: '/api/v4/console/lottery-monitoring/user-global-states',
    /** @type {string} [GET] 获取用户全局状态详情 - Path: :user_id */
    USER_GLOBAL_DETAIL: '/api/v4/console/lottery-monitoring/user-global-states/:user_id',
    /** @type {string} [GET] 获取用户配额列表 - Query: { page?, page_size?, user_id? } */
    USER_QUOTAS: '/api/v4/console/lottery-monitoring/user-quotas'
  },

  /**
   * 策略统计API端点
   * @description 抽奖策略统计分析，包括概览、档位分布、保底统计
   * @type {Object}
   * @property {string} OVERVIEW - [GET] 获取统计概览
   * @property {string} TIER_DISTRIBUTION - [GET] 获取档位分布
   * @property {string} PITY_STATS - [GET] 获取保底统计
   */
  LOTTERY_STRATEGY_STATS: {
    /** @type {string} [GET] 获取统计概览 - Query: { campaign_id?, date_range? } */
    OVERVIEW: '/api/v4/console/lottery-strategy-stats/overview',
    /** @type {string} [GET] 获取档位分布 - Query: { campaign_id? } */
    TIER_DISTRIBUTION: '/api/v4/console/lottery-strategy-stats/tier-distribution',
    /** @type {string} [GET] 获取保底统计 - Query: { campaign_id? } */
    PITY_STATS: '/api/v4/console/lottery-strategy-stats/pity-stats'
  },

  /**
   * 业务记录API端点
   * @description 业务记录管理，包括核销订单、抽奖记录、资产交易等
   * @note 后端字段说明（以后端为准）：
   * - order_id: UUID格式的订单ID
   * - code_hash: 核销码的SHA-256哈希值（不存明文）
   * - item_instance_id: 关联的物品实例ID
   * - redeemer_user_id: 核销用户ID
   * - status: 订单状态（pending/fulfilled/cancelled/expired）
   * - expires_at: 过期时间
   * - fulfilled_at: 核销时间
   * @type {Object}
   * @property {string} REDEMPTION_ORDERS - [GET] 获取核销订单列表
   * @property {string} LIST - [GET] 获取核销订单列表（别名）
   * @property {string} DETAIL - [GET] 获取订单详情
   * @property {string} REDEEM - [POST] 核销订单
   * @property {string} CANCEL - [POST] 取消订单
   * @property {string} BATCH_EXPIRE - [POST] 批量过期处理
   * @property {string} EXPORT - [GET] 导出订单
   * @property {string} LOTTERY_CLEAR_SETTINGS - [GET/PUT] 抽奖清算设置
   * @property {string} CONTENT_REVIEWS - [GET] 获取内容审核记录
   * @property {string} LOTTERY_DRAWS - [GET] 获取抽奖记录
   * @property {string} ITEM_EVENTS - [GET] 获取物品事件
   * @property {string} ASSET_TRANSACTIONS - [GET] 获取资产交易
   * @property {string} EXCHANGE_RECORDS - [GET] 获取兑换记录
   * @property {string} EXCHANGE_STATS - [GET] 获取兑换统计
   */
  BUSINESS_RECORDS: {
    // 核销订单
    /** @type {string} [GET] 获取核销订单列表 - Query: { page?, page_size?, status? } */
    REDEMPTION_ORDERS: '/api/v4/console/business-records/redemption-orders',
    /** @type {string} [GET] 获取核销订单列表（别名） */
    LIST: '/api/v4/console/business-records/redemption-orders',
    /** @type {string} [GET] 获取订单详情 - Path: :order_id (UUID格式) */
    DETAIL: '/api/v4/console/business-records/redemption-orders/:order_id',
    /** @type {string} [POST] 核销订单 - Path: :order_id, Body: { redeemer_user_id? } */
    REDEEM: '/api/v4/console/business-records/redemption-orders/:order_id/redeem',
    /** @type {string} [POST] 取消订单 - Path: :order_id, Body: { reason? } */
    CANCEL: '/api/v4/console/business-records/redemption-orders/:order_id/cancel',
    /** @type {string} [POST] 批量过期处理 - Body: { order_ids? } */
    BATCH_EXPIRE: '/api/v4/console/business-records/redemption-orders/batch-expire',
    /** @type {string} [GET] 导出订单 - Query: { format?, status?, date_range? } */
    EXPORT: '/api/v4/console/business-records/redemption-orders/export',
    // 其他记录
    /** @type {string} [GET/PUT] 抽奖清算设置 */
    LOTTERY_CLEAR_SETTINGS: '/api/v4/console/business-records/lottery-clear-settings',
    /** @type {string} [GET] 获取内容审核记录 - Query: { page?, page_size? } */
    CONTENT_REVIEWS: '/api/v4/console/business-records/content-reviews',
    /** @type {string} [GET] 获取抽奖记录 - Query: { page?, page_size?, user_id? } */
    LOTTERY_DRAWS: '/api/v4/console/business-records/lottery-draws',
    /** @type {string} [GET] 获取物品事件 - Query: { page?, page_size?, item_id? } */
    ITEM_EVENTS: '/api/v4/console/business-records/item-events',
    /** @type {string} [GET] 获取资产交易 - Query: { page?, page_size?, user_id? } */
    ASSET_TRANSACTIONS: '/api/v4/console/business-records/asset-transactions',
    /** @type {string} [GET] 获取兑换记录 - Query: { page?, page_size? } */
    EXCHANGE_RECORDS: '/api/v4/console/business-records/exchange-records',
    /** @type {string} [GET] 获取兑换统计 */
    EXCHANGE_STATS: '/api/v4/shop/exchange/statistics'
  },

  /**
   * 活动定价配置API端点
   * @description 管理抽奖活动的定价配置，支持版本管理和回滚
   * @type {Object}
   * @property {string} GET_BY_CAMPAIGN - [GET] 按活动获取定价配置
   * @property {string} GET_VERSIONS - [GET] 获取定价版本列表
   * @property {string} CREATE - [POST] 创建定价配置
   * @property {string} ACTIVATE - [POST] 激活定价版本
   * @property {string} ARCHIVE - [POST] 归档定价版本
   * @property {string} ROLLBACK - [POST] 回滚定价配置
   * @property {string} SCHEDULE - [POST] 调度定价版本
   * @property {string} LIST - [GET] 获取定价配置列表（兼容旧版）
   * @property {string} DETAIL - [GET] 获取定价详情（兼容旧版）
   * @property {string} UPDATE - [PUT] 更新定价配置（兼容旧版）
   */
  PRICING: {
    // 按活动code获取
    /** @type {string} [GET] 按活动获取定价配置 - Path: :code */
    GET_BY_CAMPAIGN: '/api/v4/console/lottery-management/campaigns/:code/pricing',
    /** @type {string} [GET] 获取定价版本列表 - Path: :code */
    GET_VERSIONS: '/api/v4/console/lottery-management/campaigns/:code/pricing/versions',
    /** @type {string} [POST] 创建定价配置 - Path: :code, Body: { prices, ... } */
    CREATE: '/api/v4/console/lottery-management/campaigns/:code/pricing',
    /** @type {string} [POST] 激活定价版本 - Path: :code, :version */
    ACTIVATE: '/api/v4/console/lottery-management/campaigns/:code/pricing/:version/activate',
    /** @type {string} [POST] 归档定价版本 - Path: :code, :version */
    ARCHIVE: '/api/v4/console/lottery-management/campaigns/:code/pricing/:version/archive',
    /** @type {string} [POST] 回滚定价配置 - Path: :code, Body: { target_version } */
    ROLLBACK: '/api/v4/console/lottery-management/campaigns/:code/pricing/rollback',
    /** @type {string} [POST] 调度定价版本 - Path: :code, :version, Body: { scheduled_at } */
    SCHEDULE: '/api/v4/console/lottery-management/campaigns/:code/pricing/:version/schedule',
    // 兼容旧版
    /** @type {string} [GET] 获取定价配置列表（兼容旧版） */
    LIST: '/api/v4/console/lottery-management/pricing-config',
    /** @type {string} [GET] 获取定价详情（兼容旧版）- Path: :id */
    DETAIL: '/api/v4/console/lottery-management/pricing-config/:id',
    /** @type {string} [PUT] 更新定价配置（兼容旧版）- Path: :id */
    UPDATE: '/api/v4/console/lottery-management/pricing-config/:id'
  },

  /**
   * 行政区划API端点
   * @description 中国行政区划数据，支持级联选择
   * @type {Object}
   * @property {string} PROVINCES - [GET] 获取省份列表
   * @property {string} CHILDREN - [GET] 获取下级区划
   * @property {string} SEARCH - [GET] 搜索区划
   * @property {string} PATH - [GET] 获取区划路径
   */
  REGION: {
    /** @type {string} [GET] 获取省份列表 */
    PROVINCES: '/api/v4/console/regions/provinces',
    /** @type {string} [GET] 获取下级区划 - Path: :parent_code */
    CHILDREN: '/api/v4/console/regions/children/:parent_code',
    /** @type {string} [GET] 搜索区划 - Query: { keyword, level? } */
    SEARCH: '/api/v4/console/regions/search',
    /** @type {string} [GET] 获取区划路径（省市区完整路径）- Path: :region_code */
    PATH: '/api/v4/console/regions/path/:region_code'
  },

  /**
   * 会话管理API端点
   * @description 管理用户会话，包括查看、撤销、清理等操作
   * @type {Object}
   * @property {string} LIST - [GET] 获取会话列表
   * @property {string} STATS - [GET] 获取会话统计
   * @property {string} DETAIL - [GET] 获取会话详情
   * @property {string} DEACTIVATE - [POST] 停用会话
   * @property {string} REVOKE - [POST] 撤销会话（别名）
   * @property {string} DEACTIVATE_USER - [POST] 停用用户所有会话
   * @property {string} REVOKE_OTHERS - [POST] 撤销其他会话（别名）
   * @property {string} BATCH_REVOKE - [POST] 批量撤销会话
   * @property {string} CLEANUP - [POST] 清理过期会话
   * @property {string} ONLINE_USERS - [GET] 获取在线用户列表
   */
  SESSIONS: {
    /** @type {string} [GET] 获取会话列表 - Query: { page?, page_size?, user_id?, status? } */
    LIST: '/api/v4/console/sessions',
    /** @type {string} [GET] 获取会话统计 */
    STATS: '/api/v4/console/sessions/stats',
    /** @type {string} [GET] 获取会话详情 - Path: :session_id */
    DETAIL: '/api/v4/console/sessions/:session_id',
    /** @type {string} [POST] 停用会话 - Path: :session_id */
    DEACTIVATE: '/api/v4/console/sessions/:session_id/deactivate',
    /** @type {string} [POST] 撤销会话（别名）- Path: :session_id */
    REVOKE: '/api/v4/console/sessions/:session_id/deactivate',
    /** @type {string} [POST] 停用用户所有会话 - Body: { user_id } */
    DEACTIVATE_USER: '/api/v4/console/sessions/deactivate-user',
    /** @type {string} [POST] 撤销其他会话（别名）- Body: { user_id } */
    REVOKE_OTHERS: '/api/v4/console/sessions/deactivate-user',
    /** @type {string} [POST] 批量撤销会话 - Body: { session_ids } */
    BATCH_REVOKE: '/api/v4/console/sessions/batch-deactivate',
    /** @type {string} [POST] 清理过期会话 */
    CLEANUP: '/api/v4/console/sessions/cleanup',
    /** @type {string} [GET] 获取在线用户列表 */
    ONLINE_USERS: '/api/v4/console/sessions/online-users'
  },

  /**
   * 功能开关API端点
   * @description 管理系统功能开关，控制功能的启用和禁用
   * @type {Object}
   * @property {string} LIST - [GET] 获取功能开关列表
   * @property {string} DETAIL - [GET] 获取开关详情
   * @property {string} UPDATE - [PUT] 更新开关配置
   * @property {string} TOGGLE - [POST] 切换开关状态
   */
  FEATURE_FLAGS: {
    /** @type {string} [GET] 获取功能开关列表 */
    LIST: '/api/v4/console/feature-flags',
    /** @type {string} [GET] 获取开关详情 - Path: :flag_id */
    DETAIL: '/api/v4/console/feature-flags/:flag_id',
    /** @type {string} [PUT] 更新开关配置 - Path: :flag_id, Body: { enabled, config? } */
    UPDATE: '/api/v4/console/feature-flags/:flag_id',
    /** @type {string} [POST] 切换开关状态 - Path: :flag_id */
    TOGGLE: '/api/v4/console/feature-flags/:flag_id/toggle'
  },

  /**
   * 用户风控配置API端点
   * @description 管理用户的风控配置，设置风险等级和限制
   * @type {Object}
   * @property {string} LIST - [GET] 获取风控配置列表
   * @property {string} USER - [GET] 获取用户风控配置
   * @property {string} UPDATE - [PUT] 更新用户风控配置
   */
  RISK_PROFILES: {
    /** @type {string} [GET] 获取风控配置列表 - Query: { page?, page_size?, risk_level? } */
    LIST: '/api/v4/console/risk-profiles',
    /** @type {string} [GET] 获取用户风控配置 - Path: :user_id */
    USER: '/api/v4/console/risk-profiles/user/:user_id',
    /** @type {string} [PUT] 更新用户风控配置 - Path: :user_id, Body: { risk_level, limits, ... } */
    UPDATE: '/api/v4/console/risk-profiles/user/:user_id'
  },

  /**
   * 用户高级状态API端点
   * @description 管理用户的高级/VIP状态
   * @type {Object}
   * @property {string} LIST - [GET] 获取高级用户列表
   * @property {string} DETAIL - [GET] 获取用户高级状态详情
   * @property {string} UPDATE - [PUT] 更新高级状态
   * @property {string} UNLOCK - [POST] 解锁高级功能
   */
  USER_PREMIUM: {
    /** @type {string} [GET] 获取高级用户列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/console/user-premium',
    /** @type {string} [GET] 获取用户高级状态详情 - Path: :user_id */
    DETAIL: '/api/v4/console/user-premium/:user_id',
    /** @type {string} [PUT] 更新高级状态 - Path: :user_id, Body: { premium_level, expires_at? } */
    UPDATE: '/api/v4/console/user-premium/:user_id',
    /** @type {string} [POST] 解锁高级功能 - Path: :user_id, Body: { feature } */
    UNLOCK: '/api/v4/console/user-premium/:user_id/unlock'
  },

  /**
   * 系统数据API端点
   * @description 获取系统级别的基础数据
   * @type {Object}
   * @property {string} USER_ROLES - [GET] 获取用户角色列表
   */
  SYSTEM_DATA: {
    /** @type {string} [GET] 获取用户角色列表 */
    USER_ROLES: '/api/v4/console/system-data/user-roles'
  },

  /**
   * 公告管理API端点
   * @description 管理系统公告，支持CRUD操作
   * @type {Object}
   * @property {string} LIST - [GET] 获取公告列表
   * @property {string} DETAIL - [GET] 获取公告详情
   * @property {string} CREATE - [POST] 创建公告
   * @property {string} UPDATE - [PUT] 更新公告
   * @property {string} DELETE - [DELETE] 删除公告
   */
  ANNOUNCEMENT: {
    /** @type {string} [GET] 获取公告列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/console/system/announcements',
    /** @type {string} [GET] 获取公告详情 - Path: :id */
    DETAIL: '/api/v4/console/system/announcements/:id',
    /** @type {string} [POST] 创建公告 - Body: { title, content, type, ... } */
    CREATE: '/api/v4/console/system/announcements',
    /** @type {string} [PUT] 更新公告 - Path: :id, Body: { title?, content?, ... } */
    UPDATE: '/api/v4/console/system/announcements/:id',
    /** @type {string} [DELETE] 删除公告 - Path: :id */
    DELETE: '/api/v4/console/system/announcements/:id'
  },

  /**
   * 系统通知API端点
   * @description 管理系统通知，包括发送和读取状态
   * @type {Object}
   * @property {string} LIST - [GET] 获取通知列表
   * @property {string} READ - [POST] 标记通知已读
   * @property {string} READ_ALL - [POST] 标记所有通知已读
   * @property {string} CLEAR - [POST] 清空通知
   * @property {string} SEND - [POST] 发送通知
   * @property {string} ANNOUNCEMENTS - [GET] 获取公告通知
   */
  NOTIFICATION: {
    /** @type {string} [GET] 获取通知列表 - Query: { page?, page_size?, type?, is_read? } */
    LIST: '/api/v4/system/notifications',
    /** @type {string} [POST] 标记通知已读 - Path: :id */
    READ: '/api/v4/system/notifications/:id/read',
    /** @type {string} [POST] 标记所有通知已读 */
    READ_ALL: '/api/v4/system/notifications/read-all',
    /** @type {string} [POST] 清空通知 */
    CLEAR: '/api/v4/system/notifications/clear',
    /** @type {string} [POST] 发送通知 - Body: { user_ids, title, content, type } */
    SEND: '/api/v4/system/notifications/send',
    /** @type {string} [GET] 获取公告通知 */
    ANNOUNCEMENTS: '/api/v4/console/notifications/announcements'
  },

  /**
   * 弹窗Banner API端点
   * @description 管理弹窗广告和Banner
   * @type {Object}
   * @property {string} LIST - [GET] 获取弹窗列表
   * @property {string} STATS - [GET] 获取弹窗统计
   * @property {string} DETAIL - [GET] 获取弹窗详情
   * @property {string} CREATE - [POST] 创建弹窗
   * @property {string} UPDATE - [PUT] 更新弹窗
   * @property {string} DELETE - [DELETE] 删除弹窗
   * @property {string} TOGGLE - [POST] 切换弹窗状态
   */
  POPUP_BANNER: {
    /** @type {string} [GET] 获取弹窗列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/console/popup-banners',
    /** @type {string} [GET] 获取弹窗统计 */
    STATS: '/api/v4/console/popup-banners/statistics',
    /** @type {string} [GET] 获取弹窗详情 - Path: :id */
    DETAIL: '/api/v4/console/popup-banners/:id',
    /** @type {string} [POST] 创建弹窗 - Body: { title, image_url, link_url, ... } */
    CREATE: '/api/v4/console/popup-banners',
    /** @type {string} [PUT] 更新弹窗 - Path: :id, Body: { title?, image_url?, ... } */
    UPDATE: '/api/v4/console/popup-banners/:id',
    /** @type {string} [DELETE] 删除弹窗 - Path: :id */
    DELETE: '/api/v4/console/popup-banners/:id',
    /** @type {string} [POST] 切换弹窗状态 - Path: :id */
    TOGGLE: '/api/v4/console/popup-banners/:id/toggle'
  },

  /**
   * 图片资源API端点
   * @description 管理上传的图片资源
   * @type {Object}
   * @property {string} LIST - [GET] 获取图片列表
   * @property {string} UPLOAD - [POST] 上传图片
   * @property {string} DELETE - [DELETE] 删除图片
   */
  IMAGE: {
    /** @type {string} [GET] 获取图片列表 - Query: { page?, page_size?, category? } */
    LIST: '/api/v4/console/images',
    /** @type {string} [POST] 上传图片 - FormData: file, category? */
    UPLOAD: '/api/v4/console/images/upload',
    /** @type {string} [DELETE] 删除图片 - Path: :id */
    DELETE: '/api/v4/console/images/:id'
  },

  /**
   * 缓存管理API端点
   * @description 管理系统缓存
   * @type {Object}
   * @property {string} CLEAR - [POST] 清除缓存
   */
  CACHE: {
    /** @type {string} [POST] 清除缓存 - Body: { type?, keys? } */
    CLEAR: '/api/v4/console/cache/clear'
  },

  /**
   * 设置管理API端点
   * @description 管理系统各类设置
   * @type {Object}
   * @property {string} LIST - [GET] 获取所有设置
   * @property {string} CATEGORY - [GET] 获取分类设置
   * @property {string} UPDATE - [PUT] 更新分类设置
   * @property {string} SECURITY - [GET/PUT] 安全设置
   * @property {string} BASIC - [GET/PUT] 基础设置
   * @property {string} POINTS - [GET/PUT] 积分设置
   * @property {string} NOTIFICATION - [GET/PUT] 通知设置
   * @property {string} MARKETPLACE - [GET/PUT] 市场设置
   */
  SETTINGS: {
    /** @type {string} [GET] 获取所有设置 */
    LIST: '/api/v4/console/settings',
    /** @type {string} [GET] 获取分类设置 - Path: :category */
    CATEGORY: '/api/v4/console/settings/:category',
    /** @type {string} [PUT] 更新分类设置 - Path: :category, Body: { settings } */
    UPDATE: '/api/v4/console/settings/:category',
    /** @type {string} [GET/PUT] 安全设置 */
    SECURITY: '/api/v4/console/settings/security',
    /** @type {string} [GET/PUT] 基础设置 */
    BASIC: '/api/v4/console/settings/basic',
    /** @type {string} [GET/PUT] 积分设置 */
    POINTS: '/api/v4/console/settings/points',
    /** @type {string} [GET/PUT] 通知设置 */
    NOTIFICATION: '/api/v4/console/settings/notification',
    /** @type {string} [GET/PUT] 市场设置 */
    MARKETPLACE: '/api/v4/console/settings/marketplace'
  },

  /**
   * 用户层级API端点
   * @description 管理用户层级关系和组织架构
   * @type {Object}
   * @property {string} LIST - [GET] 获取用户层级列表
   * @property {string} ROLES - [GET] 获取层级角色列表
   * @property {string} DETAIL - [GET] 获取层级详情
   * @property {string} CREATE - [POST] 创建层级关系
   * @property {string} SUBORDINATES - [GET] 获取下级用户
   * @property {string} UPDATE_STATUS - [PUT] 更新层级状态
   * @property {string} DEACTIVATE - [POST] 停用层级
   * @property {string} ACTIVATE - [POST] 激活层级
   */
  USER_HIERARCHY: {
    /** @type {string} [GET] 获取用户层级列表 - Query: { page?, page_size?, parent_id? } */
    LIST: '/api/v4/console/user-hierarchy',
    /** @type {string} [GET] 获取层级角色列表 */
    ROLES: '/api/v4/console/user-hierarchy/roles',
    /** @type {string} [GET] 获取层级详情 - Path: :id */
    DETAIL: '/api/v4/console/user-hierarchy/:id',
    /** @type {string} [POST] 创建层级关系 - Body: { user_id, parent_id, role } */
    CREATE: '/api/v4/console/user-hierarchy',
    /** @type {string} [GET] 获取下级用户 - Path: :user_id */
    SUBORDINATES: '/api/v4/console/user-hierarchy/:user_id/subordinates',
    /** @type {string} [PUT] 更新层级状态 - Path: :id, Body: { status } */
    UPDATE_STATUS: '/api/v4/console/user-hierarchy/:id/status',
    /** @type {string} [POST] 停用层级 - Path: :user_id */
    DEACTIVATE: '/api/v4/console/user-hierarchy/:user_id/deactivate',
    /** @type {string} [POST] 激活层级 - Path: :user_id */
    ACTIVATE: '/api/v4/console/user-hierarchy/:user_id/activate'
  },

  /**
   * 商户积分API端点
   * @description 管理商户积分的申请和审核
   * @type {Object}
   * @property {string} LIST - [GET] 获取积分申请列表
   * @property {string} DETAIL - [GET] 获取申请详情
   * @property {string} BATCH - [POST] 批量处理申请
   * @property {string} APPROVE - [POST] 批准申请
   * @property {string} REJECT - [POST] 拒绝申请
   * @property {string} STATS_PENDING - [GET] 获取待处理统计
   */
  MERCHANT_POINTS: {
    /** @type {string} [GET] 获取积分申请列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/console/merchant-points',
    /** @type {string} [GET] 获取申请详情 - Path: :id */
    DETAIL: '/api/v4/console/merchant-points/:id',
    /** @type {string} [POST] 批量处理申请 - Body: { ids, action } */
    BATCH: '/api/v4/console/merchant-points/batch',
    /** @type {string} [POST] 批准申请 - Path: :id, Body: { remark? } */
    APPROVE: '/api/v4/console/merchant-points/:id/approve',
    /** @type {string} [POST] 拒绝申请 - Path: :id, Body: { reason } */
    REJECT: '/api/v4/console/merchant-points/:id/reject',
    /** @type {string} [GET] 获取待处理统计 */
    STATS_PENDING: '/api/v4/console/merchant-points/stats/pending'
  },

  /**
   * 抽奖配额API端点
   * @description 管理抽奖配额规则和统计
   * @type {Object}
   * @property {string} STATISTICS - [GET] 获取配额统计
   * @property {string} RULES - [GET] 获取配额规则列表
   * @property {string} RULE_DETAIL - [GET] 获取规则详情
   * @property {string} DISABLE_RULE - [POST] 禁用规则
   */
  LOTTERY_QUOTA: {
    /** @type {string} [GET] 获取配额统计 */
    STATISTICS: '/api/v4/console/lottery-quota/statistics',
    /** @type {string} [GET] 获取配额规则列表 - Query: { page?, page_size? } */
    RULES: '/api/v4/console/lottery-quota/rules',
    /** @type {string} [GET] 获取规则详情 - Path: :id */
    RULE_DETAIL: '/api/v4/console/lottery-quota/rules/:id',
    /** @type {string} [POST] 禁用规则 - Path: :id */
    DISABLE_RULE: '/api/v4/console/lottery-quota/rules/:id/disable'
  },

  /**
   * 活动管理API端点
   * @description 通用活动管理
   * @type {Object}
   * @property {string} LIST - [GET] 获取活动列表
   * @property {string} DETAIL - [GET] 获取活动详情
   */
  ACTIVITIES: {
    /** @type {string} [GET] 获取活动列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/activities',
    /** @type {string} [GET] 获取活动详情 - Path: :id */
    DETAIL: '/api/v4/activities/:id'
  },

  /**
   * 概率调整API端点
   * @description 调整抽奖概率
   * @type {Object}
   * @property {string} ADJUST - [POST] 调整概率
   */
  PROBABILITY: {
    /** @type {string} [POST] 调整概率 - Body: { campaign_code, adjustments } */
    ADJUST: '/api/v4/console/lottery-management/probability-adjust'
  },

  /**
   * 资产管理API端点
   * @description 管理用户资产和交易
   * @type {Object}
   * @property {string} STATS - [GET] 获取资产统计
   * @property {string} TRANSACTIONS - [GET] 获取交易记录
   * @property {string} PORTFOLIO - [GET] 获取资产组合
   */
  ASSETS: {
    /** @type {string} [GET] 获取资产统计 */
    STATS: '/api/v4/console/assets/stats',
    /** @type {string} [GET] 获取交易记录 - Query: { page?, page_size?, user_id?, type? } */
    TRANSACTIONS: '/api/v4/console/assets/transactions',
    /** @type {string} [GET] 获取资产组合 - Query: { user_id? } */
    PORTFOLIO: '/api/v4/console/assets/portfolio'
  },

  /**
   * 资产调整API端点
   * @description 调整用户资产余额
   * @type {Object}
   * @property {string} ASSET_TYPES - [GET] 获取资产类型列表
   * @property {string} USER_BALANCES - [GET] 获取用户余额
   * @property {string} ADJUST - [POST] 调整资产
   */
  ASSET_ADJUSTMENT: {
    /** @type {string} [GET] 获取资产类型列表 */
    ASSET_TYPES: '/api/v4/console/asset-adjustment/asset-types',
    /** @type {string} [GET] 获取用户余额 - Path: :user_id */
    USER_BALANCES: '/api/v4/console/asset-adjustment/user/:user_id/balances',
    /** @type {string} [POST] 调整资产 - Body: { user_id, asset_code, amount, reason } */
    ADJUST: '/api/v4/console/asset-adjustment/adjust'
  },

  /**
   * 材料资产API端点
   * @description 管理材料类型资产
   * @type {Object}
   * @property {string} ASSET_TYPES - [GET] 获取材料资产类型
   * @property {string} ASSET_TYPE_DETAIL - [GET] 获取资产类型详情
   * @property {string} ASSET_TYPES_ALT - [GET] 获取材料资产类型（别名）
   * @property {string} CONVERSION_RULES - [GET] 获取转换规则
   * @property {string} CONVERSION_RULE_DETAIL - [GET] 获取转换规则详情
   * @property {string} USER_BALANCE - [GET] 获取用户材料余额
   * @property {string} USER_ADJUST - [POST] 调整用户材料
   * @property {string} USERS - [GET] 获取材料用户列表
   * @property {string} TRANSACTIONS - [GET] 获取材料交易记录
   */
  MATERIAL: {
    /** @type {string} [GET] 获取材料资产类型 */
    ASSET_TYPES: '/api/v4/console/material/asset-types',
    /** @type {string} [GET] 获取资产类型详情 - Path: :asset_code */
    ASSET_TYPE_DETAIL: '/api/v4/console/material/asset-types/:asset_code',
    /** @type {string} [GET] 获取材料资产类型（别名路径） */
    ASSET_TYPES_ALT: '/api/v4/console/material-asset-types',
    /** @type {string} [GET] 获取转换规则 */
    CONVERSION_RULES: '/api/v4/console/material/conversion-rules',
    /** @type {string} [GET] 获取转换规则详情 - Path: :rule_id */
    CONVERSION_RULE_DETAIL: '/api/v4/console/material/conversion-rules/:rule_id',
    /** @type {string} [GET] 获取用户材料余额 - Path: :user_id */
    USER_BALANCE: '/api/v4/console/material/users/:user_id/balance',
    /** @type {string} [POST] 调整用户材料 - Path: :user_id, Body: { asset_code, amount, reason } */
    USER_ADJUST: '/api/v4/console/material/users/:user_id/adjust',
    /** @type {string} [GET] 获取材料用户列表 - Query: { page?, page_size? } */
    USERS: '/api/v4/console/material/users',
    /** @type {string} [GET] 获取材料交易记录 - Query: { page?, page_size?, user_id? } */
    TRANSACTIONS: '/api/v4/console/material/transactions'
  },

  /**
   * 客服会话API端点
   * @description 管理客服聊天会话
   * @type {Object}
   * @property {string} SESSIONS - [GET] 获取会话列表
   * @property {string} SESSION_MESSAGES - [GET] 获取会话消息
   * @property {string} SEND_MESSAGE - [POST] 发送消息
   * @property {string} MARK_READ - [POST] 标记已读
   * @property {string} TRANSFER - [POST] 转接会话
   * @property {string} CLOSE - [POST] 关闭会话
   */
  CUSTOMER_SERVICE: {
    /** @type {string} [GET] 获取会话列表 - Query: { page?, page_size?, status? } */
    SESSIONS: '/api/v4/console/customer-service/sessions',
    /** @type {string} [GET] 获取会话消息 - Path: :session_id, Query: { page?, page_size? } */
    SESSION_MESSAGES: '/api/v4/console/customer-service/sessions/:session_id/messages',
    /** @type {string} [POST] 发送消息 - Path: :session_id, Body: { content, type? } */
    SEND_MESSAGE: '/api/v4/console/customer-service/sessions/:session_id/send',
    /** @type {string} [POST] 标记已读 - Path: :session_id */
    MARK_READ: '/api/v4/console/customer-service/sessions/:session_id/mark-read',
    /** @type {string} [POST] 转接会话 - Path: :session_id, Body: { target_admin_id } */
    TRANSFER: '/api/v4/console/customer-service/sessions/:session_id/transfer',
    /** @type {string} [POST] 关闭会话 - Path: :session_id, Body: { reason? } */
    CLOSE: '/api/v4/console/customer-service/sessions/:session_id/close'
  },

  /**
   * 活动预算API端点
   * @description 管理活动预算信息
   * @type {Object}
   * @property {string} BATCH_STATUS - [GET] 批量获取预算状态
   * @property {string} CAMPAIGN - [GET] 获取活动预算详情
   */
  CAMPAIGN_BUDGET: {
    /** @type {string} [GET] 批量获取预算状态 - Query: { campaign_ids } */
    BATCH_STATUS: '/api/v4/console/campaign-budget/batch-status',
    /** @type {string} [GET] 获取活动预算详情 - Path: :campaign_id */
    CAMPAIGN: '/api/v4/console/campaign-budget/campaigns/:campaign_id'
  },

  /**
   * 市场管理API端点
   * @description 管理兑换市场和交易订单
   * @type {Object}
   * @property {string} EXCHANGE_ITEMS - [GET] 获取兑换商品列表
   * @property {string} EXCHANGE_ITEM_DETAIL - [GET] 获取商品详情
   * @property {string} EXCHANGE_ORDERS - [GET] 获取兑换订单列表
   * @property {string} EXCHANGE_ORDER_DETAIL - [GET] 获取订单详情
   * @property {string} EXCHANGE_ORDER_STATUS - [PUT] 更新订单状态
   * @property {string} TRADE_ORDERS - [GET] 获取C2C交易订单
   * @property {string} EXCHANGE_ITEMS_SIMPLE - [GET] 兑换商品（简化路径）
   * @property {string} EXCHANGE_ORDERS_SIMPLE - [GET] 兑换订单（简化路径）
   * @property {string} EXCHANGE_STATS - [GET] 获取兑换统计
   * @property {string} EXCHANGE_ORDERS_STATS - [GET] 获取订单统计
   * @property {string} TRADE_ORDERS_SIMPLE - [GET] C2C交易订单（简化路径）
   */
  MARKETPLACE: {
    // 兑换市场商品
    /** @type {string} [GET] 获取兑换商品列表 - Query: { page?, page_size?, status? } */
    EXCHANGE_ITEMS: '/api/v4/console/marketplace/exchange_market/items',
    /** @type {string} [GET] 获取商品详情 - Path: :item_id */
    EXCHANGE_ITEM_DETAIL: '/api/v4/console/marketplace/exchange_market/items/:item_id',
    // 兑换市场订单
    /** @type {string} [GET] 获取兑换订单列表 - Query: { page?, page_size?, status? } */
    EXCHANGE_ORDERS: '/api/v4/console/marketplace/exchange_market/orders',
    /** @type {string} [GET] 获取订单详情 - Path: :order_no */
    EXCHANGE_ORDER_DETAIL: '/api/v4/console/marketplace/exchange_market/orders/:order_no',
    /** @type {string} [PUT] 更新订单状态 - Path: :order_no, Body: { status } */
    EXCHANGE_ORDER_STATUS: '/api/v4/shop/exchange/orders/:order_no/status',
    // 交易订单（C2C市场交易订单）
    /** @type {string} [GET] 获取C2C交易订单 - Query: { page?, page_size?, status? } */
    TRADE_ORDERS: '/api/v4/console/marketplace/trade_orders',
    // 简化路径别名
    /** @type {string} [GET] 兑换商品（简化路径别名） */
    EXCHANGE_ITEMS_SIMPLE: '/api/v4/console/marketplace/exchange_market/items',
    /** @type {string} [GET] 兑换订单（简化路径别名） */
    EXCHANGE_ORDERS_SIMPLE: '/api/v4/console/marketplace/exchange_market/orders',
    /** @type {string} [GET] 获取兑换统计 */
    EXCHANGE_STATS: '/api/v4/console/marketplace/exchange_market/statistics',
    /** @type {string} [GET] 获取订单统计 */
    EXCHANGE_ORDERS_STATS: '/api/v4/console/marketplace/exchange_market/orders/stats',
    /** @type {string} [GET] C2C交易订单（简化路径别名） */
    TRADE_ORDERS_SIMPLE: '/api/v4/console/marketplace/trade_orders'
  },

  /**
   * C2C市场API端点
   * @description 管理C2C用户间交易市场
   * @type {Object}
   * @property {string} ORDERS - [GET] 获取C2C订单列表
   * @property {string} ORDERS_STATS - [GET] 获取订单统计
   * @property {string} LISTINGS_SUMMARY - [GET] 获取挂单汇总
   * @property {string} LISTINGS_USER_STATS - [GET] 获取用户挂单统计
   */
  C2C_MARKET: {
    /** @type {string} [GET] 获取C2C订单列表 - Query: { page?, page_size?, status? } */
    ORDERS: '/api/v4/console/c2c-market/orders',
    /** @type {string} [GET] 获取订单统计 */
    ORDERS_STATS: '/api/v4/console/c2c-market/orders/stats',
    /** @type {string} [GET] 获取挂单汇总 */
    LISTINGS_SUMMARY: '/api/v4/console/c2c-market/listings/summary',
    /** @type {string} [GET] 获取用户挂单统计 - Query: { user_id? } */
    LISTINGS_USER_STATS: '/api/v4/console/c2c-market/listings/user-stats'
  },

  /**
   * 孤儿冻结API端点
   * @description 检测和清理孤儿冻结记录
   * @type {Object}
   * @property {string} DETECT - [GET] 检测孤儿冻结
   * @property {string} STATS - [GET] 获取孤儿冻结统计
   * @property {string} CLEANUP - [POST] 清理孤儿冻结
   */
  ORPHAN_FROZEN: {
    /** @type {string} [GET] 检测孤儿冻结 */
    DETECT: '/api/v4/console/orphan-frozen/detect',
    /** @type {string} [GET] 获取孤儿冻结统计 */
    STATS: '/api/v4/console/orphan-frozen/stats',
    /** @type {string} [POST] 清理孤儿冻结 - Body: { ids?, force? } */
    CLEANUP: '/api/v4/console/orphan-frozen/cleanup'
  },

  /**
   * 抽奖干预管理API端点
   * @description 管理抽奖干预操作
   * @type {Object}
   * @property {string} LIST - [GET] 获取干预列表
   * @property {string} DETAIL - [GET] 获取干预详情
   * @property {string} CANCEL - [POST] 取消干预
   * @property {string} FORCE_WIN - [POST] 强制中奖
   */
  LOTTERY_INTERVENTION: {
    /** @type {string} [GET] 获取干预列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/console/lottery-management/interventions',
    /** @type {string} [GET] 获取干预详情 - Path: :id */
    DETAIL: '/api/v4/console/lottery-management/interventions/:id',
    /** @type {string} [POST] 取消干预 - Path: :id, Body: { reason? } */
    CANCEL: '/api/v4/console/lottery-management/interventions/:id/cancel',
    /** @type {string} [POST] 强制中奖 - Body: { user_id, campaign_code, prize_id } */
    FORCE_WIN: '/api/v4/console/lottery-management/force-win'
  },

  /**
   * 抽奖活动API端点
   * @description 抽奖活动查询和配置
   * @type {Object}
   * @property {string} LIST - [GET] 获取活动列表
   * @property {string} DETAIL - [GET] 获取活动详情
   * @property {string} CONDITIONS - [GET] 获取活动条件
   * @property {string} CONFIGURE_CONDITIONS - [POST] 配置活动条件
   */
  LOTTERY_CAMPAIGNS: {
    /** @type {string} [GET] 获取活动列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/lottery/campaigns',
    /** @type {string} [GET] 获取活动详情 - Path: :campaign_code */
    DETAIL: '/api/v4/lottery/campaigns/:campaign_code',
    /** @type {string} [GET] 获取活动条件 - Path: :code */
    CONDITIONS: '/api/v4/activities/:code/conditions',
    /** @type {string} [POST] 配置活动条件 - Path: :code, Body: { conditions } */
    CONFIGURE_CONDITIONS: '/api/v4/activities/:code/configure-conditions'
  },

  /**
   * 消费记录API端点（管理员审核）
   * @description 管理员审核消费记录
   * @type {Object}
   * @property {string} ADMIN_RECORDS - [GET] 获取消费记录列表
   * @property {string} PENDING - [GET] 获取待审核记录
   * @property {string} APPROVE - [POST] 批准记录
   * @property {string} REJECT - [POST] 拒绝记录
   */
  CONSUMPTION: {
    /** @type {string} [GET] 获取消费记录列表 - Query: { page?, page_size?, status? } */
    ADMIN_RECORDS: '/api/v4/console/consumption/records',
    /** @type {string} [GET] 获取待审核记录 */
    PENDING: '/api/v4/console/consumption/pending',
    /** @type {string} [POST] 批准记录 - Path: :id, Body: { remark? } */
    APPROVE: '/api/v4/console/consumption/approve/:id',
    /** @type {string} [POST] 拒绝记录 - Path: :id, Body: { reason } */
    REJECT: '/api/v4/console/consumption/reject/:id'
  },

  /**
   * 反馈管理API端点
   * @description 管理用户反馈
   * @type {Object}
   * @property {string} LIST - [GET] 获取反馈列表
   * @property {string} DETAIL - [GET] 获取反馈详情
   * @property {string} REPLY - [POST] 回复反馈
   * @property {string} STATUS - [PUT] 更新反馈状态
   */
  FEEDBACK: {
    /** @type {string} [GET] 获取反馈列表 - Query: { page?, page_size?, status?, type? } */
    LIST: '/api/v4/console/system/feedbacks',
    /** @type {string} [GET] 获取反馈详情 - Path: :id */
    DETAIL: '/api/v4/console/system/feedbacks/:id',
    /** @type {string} [POST] 回复反馈 - Path: :id, Body: { content } */
    REPLY: '/api/v4/console/system/feedbacks/:id/reply',
    /** @type {string} [PUT] 更新反馈状态 - Path: :id, Body: { status } */
    STATUS: '/api/v4/console/system/feedbacks/:id/status'
  },

  /**
   * 控制台认证API端点
   * @description 控制台专用认证接口
   * @type {Object}
   * @property {string} LOGIN - [POST] 控制台登录
   * @property {string} LOGOUT - [POST] 控制台登出
   */
  CONSOLE_AUTH: {
    /** @type {string} [POST] 控制台登录 - Body: { username, password } */
    LOGIN: '/api/v4/console/auth/login',
    /** @type {string} [POST] 控制台登出 */
    LOGOUT: '/api/v4/console/auth/logout'
  },

  /**
   * 交易订单API端点
   * @description 交易订单查询
   * @type {Object}
   * @property {string} LIST - [GET] 获取交易订单列表
   * @property {string} DETAIL - [GET] 获取订单详情
   */
  TRADE_ORDERS: {
    /** @type {string} [GET] 获取交易订单列表 - Query: { page?, page_size?, status? } */
    LIST: '/api/v4/console/marketplace/trade_orders',
    /** @type {string} [GET] 获取订单详情 - Path: :order_id */
    DETAIL: '/api/v4/console/marketplace/trade_orders/:order_id'
  },

  /**
   * 市场统计API端点
   * @description 市场数据统计
   * @type {Object}
   * @property {string} LISTING_STATS - [GET] 获取挂单统计
   */
  MARKETPLACE_STATS: {
    /** @type {string} [GET] 获取挂单统计 */
    LISTING_STATS: '/api/v4/console/marketplace/listing-stats'
  },

  /**
   * 审计日志API端点
   * @description 系统审计日志查询
   * @type {Object}
   * @property {string} LIST - [GET] 获取审计日志列表
   * @property {string} STATISTICS - [GET] 获取统计信息
   * @property {string} DETAIL - [GET] 获取日志详情
   */
  AUDIT_LOGS: {
    /** @type {string} [GET] 获取审计日志列表 - Query: { page?, page_size?, action?, user_id? } */
    LIST: '/api/v4/console/system/audit-logs',
    /** @type {string} [GET] 获取统计信息 - Query: { start_date?, end_date? } */
    STATISTICS: '/api/v4/console/system/audit-logs/statistics',
    /** @type {string} [GET] 获取日志详情 - Path: :id */
    DETAIL: '/api/v4/console/system/audit-logs/:id'
  },

  /**
   * 设置管理扩展API端点
   * @description 扩展的设置分类管理
   * @type {Object}
   * @property {string} GLOBAL - [GET/PUT] 全局设置
   * @property {string} LOTTERY - [GET/PUT] 抽奖设置
   * @property {string} SYSTEM - [GET/PUT] 系统设置
   * @property {string} PRIZE - [GET/PUT] 奖品设置
   */
  SETTINGS_EXT: {
    /** @type {string} [GET/PUT] 全局设置 */
    GLOBAL: '/api/v4/console/settings/global',
    /** @type {string} [GET/PUT] 抽奖设置 */
    LOTTERY: '/api/v4/console/settings/lottery',
    /** @type {string} [GET/PUT] 系统设置 */
    SYSTEM: '/api/v4/console/settings/system',
    /** @type {string} [GET/PUT] 奖品设置 */
    PRIZE: '/api/v4/console/settings/prize'
  },

  /**
   * 钻石账户API端点
   * @description 管理用户钻石账户
   * @type {Object}
   * @property {string} LIST - [GET] 获取钻石账户列表
   * @property {string} DETAIL - [GET] 获取账户详情
   * @property {string} ADJUST - [POST] 调整钻石余额
   * @property {string} USER_BALANCE - [GET] 获取用户余额
   * @property {string} USER_ADJUST - [POST] 调整用户钻石
   * @property {string} USERS - [GET] 获取钻石用户列表
   * @property {string} ACCOUNTS - [GET] 获取账户列表
   */
  DIAMOND_ACCOUNTS: {
    /** @type {string} [GET] 获取钻石账户列表 - Query: { page?, page_size? } */
    LIST: '/api/v4/console/diamond-accounts',
    /** @type {string} [GET] 获取账户详情 - Path: :user_id */
    DETAIL: '/api/v4/console/diamond-accounts/:user_id',
    /** @type {string} [POST] 调整钻石余额 - Body: { user_id, amount, reason } */
    ADJUST: '/api/v4/console/diamond-accounts/adjust',
    /** @type {string} [GET] 获取用户余额 - Path: :user_id */
    USER_BALANCE: '/api/v4/console/diamond/users/:user_id/balance',
    /** @type {string} [POST] 调整用户钻石 - Path: :user_id, Body: { amount, reason } */
    USER_ADJUST: '/api/v4/console/diamond/users/:user_id/adjust',
    /** @type {string} [GET] 获取钻石用户列表 - Query: { page?, page_size? } */
    USERS: '/api/v4/console/diamond/users',
    /** @type {string} [GET] 获取账户列表 */
    ACCOUNTS: '/api/v4/console/diamond/accounts'
  },

  /**
   * 用户层级扩展API端点
   * @description 用户层级角色扩展
   * @type {Object}
   * @property {string} ROLES - [GET] 获取层级角色列表
   */
  USER_HIERARCHY_EXT: {
    /** @type {string} [GET] 获取层级角色列表 */
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
   * @async
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
   * @async
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
   * @async
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
   * @async
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
   * @async
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
   * @async
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
   * @async
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
   * @async
   * @returns {Promise} API响应
   */
  static async logout() {
    return await this.request(API_ENDPOINTS.AUTH.LOGOUT, {
      method: 'POST'
    })
  }

  /**
   * 验证token
   * @async
   * @returns {Promise} API响应
   */
  static async verifyToken() {
    return await this.request(API_ENDPOINTS.AUTH.VERIFY)
  }

  // ===== 奖品管理API封装 =====

  /**
   * 获取奖品列表
   * @param {Object} params - 查询参数
   * @async
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
   * @async
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
   * @async
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
   * @async
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
   * @async
   * @returns {Promise} API响应
   */
  static async getDashboard() {
    return await this.request(API_ENDPOINTS.SYSTEM.DASHBOARD)
  }

  /**
   * 健康检查
   * @async
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
