/**
 * 审计操作类型统一枚举定义
 *
 * 文件路径：constants/AuditOperationTypes.js
 *
 * 设计原则：
 * - 单一真相源（Single Source of Truth）：所有操作类型定义集中在此文件
 * - 数据库、服务、中间件、模型统一引用此文件
 * - 新增操作类型只需在此处添加，然后同步数据库迁移
 *
 * 使用方式：
 * - 服务层：const { OPERATION_TYPES } = require('../constants/AuditOperationTypes')
 * - 模型层：const { DB_ENUM_VALUES } = require('../constants/AuditOperationTypes')
 * - 迁移文件：const { DB_ENUM_VALUES } = require('../constants/AuditOperationTypes')
 *
 * 创建时间：2026-01-08
 * 版本：V4.5.0（审计统一入口整合）
 */

'use strict'

/**
 * 审计操作类型枚举
 *
 * 分类：
 * 1. 积分资产类（points_*, asset_*）
 * 2. 商品管理类（product_*, exchange_*）
 * 3. 用户管理类（user_*, role_*）
 * 4. 奖品活动类（prize_*, campaign_*）
 * 5. 抽奖管理类（lottery_*）- V4.5.0新增
 * 6. 库存操作类（inventory_*）
 * 7. 系统配置类（system_*, session_*)
 * 8. 消费审核类（consumption_*）
 */
const OPERATION_TYPES = Object.freeze({
  // ==================== 积分资产类 ====================
  /**
   * 积分调整（手动增加/减少积分）
   * @description 管理员对用户积分进行手动调整，包括奖励、补偿、修正等
   * @example 客服补偿用户积分、活动奖励发放
   */
  POINTS_ADJUST: 'points_adjust',

  /**
   * 资产调整（V4.5.0新增）
   * @description 管理员调整用户资产（POINTS、BUDGET_POINTS、DIAMOND等）
   * @example 管理员资产调整路由 /api/v4/console/asset-adjustment/adjust
   */
  ASSET_ADJUSTMENT: 'asset_adjustment',

  /**
   * 孤儿冻结清理（P0-2唯一入口）
   * @description 清理孤儿冻结余额（frozen_amount > 活跃挂牌冻结总额）
   * @example 管理员孤儿冻结清理路由 /api/v4/console/orphan-frozen/cleanup
   */
  ASSET_ORPHAN_CLEANUP: 'asset_orphan_cleanup',

  // ==================== 商品管理类 ====================
  /**
   * 兑换审核（审核通过/拒绝）
   * @description 管理员审核用户的积分兑换申请
   */
  EXCHANGE_AUDIT: 'exchange_audit',

  /**
   * 商品修改
   * @description 管理员修改商品配置信息
   */
  PRODUCT_UPDATE: 'product_update',

  /**
   * 商品创建
   * @description 管理员创建新商品
   */
  PRODUCT_CREATE: 'product_create',

  /**
   * 商品删除
   * @description 管理员删除商品
   */
  PRODUCT_DELETE: 'product_delete',

  // ==================== 用户管理类 ====================
  /**
   * 用户状态变更（冻结/解冻）
   * @description 管理员修改用户账号状态
   */
  USER_STATUS_CHANGE: 'user_status_change',

  /**
   * 角色分配（给用户分配角色）
   * @description 管理员为用户分配角色权限
   */
  ROLE_ASSIGN: 'role_assign',

  /**
   * 角色变更（修改用户角色）
   * @description 管理员修改用户已有角色
   */
  ROLE_CHANGE: 'role_change',

  /**
   * 角色创建（新增）
   * @description 管理员创建新角色
   * @example UserRoleService.createRole()
   * @since 2026-01-26（角色权限管理功能）
   */
  ROLE_CREATE: 'role_create',

  /**
   * 角色更新（新增）
   * @description 管理员编辑角色信息或权限配置
   * @example UserRoleService.updateRole()
   * @since 2026-01-26（角色权限管理功能）
   */
  ROLE_UPDATE: 'role_update',

  /**
   * 角色删除（软删除）（新增）
   * @description 管理员删除角色（设置 is_active=false）
   * @example UserRoleService.deleteRole()
   * @since 2026-01-26（角色权限管理功能）
   */
  ROLE_DELETE: 'role_delete',

  // ==================== 奖品活动类 ====================
  /**
   * 奖品配置（修改奖品配置）
   * @description 管理员修改奖品基础配置
   */
  PRIZE_CONFIG: 'prize_config',

  /**
   * 奖品创建
   * @description 管理员创建新奖品
   */
  PRIZE_CREATE: 'prize_create',

  /**
   * 奖品删除
   * @description 管理员删除奖品
   */
  PRIZE_DELETE: 'prize_delete',

  /**
   * 奖品库存调整（补充库存）
   * @description 管理员调整奖品库存数量
   */
  PRIZE_STOCK_ADJUST: 'prize_stock_adjust',

  /**
   * 活动配置（修改活动配置）
   * @description 管理员修改抽奖活动配置
   */
  CAMPAIGN_CONFIG: 'campaign_config',

  // ==================== 抽奖管理类（V4.5.0新增，V4.7.0拆分）====================
  /**
   * 强制中奖
   * @description 管理员设置用户强制中指定奖品
   * @example AdminLotteryCoreService.forceWinForUser() // ServiceManager key: admin_lottery_core
   */
  LOTTERY_FORCE_WIN: 'lottery_force_win',

  /**
   * 强制不中奖
   * @description 管理员设置用户强制不中奖
   * @example AdminLotteryCoreService.forceLoseForUser() // ServiceManager key: admin_lottery_core
   */
  LOTTERY_FORCE_LOSE: 'lottery_force_lose',

  /**
   * 概率调整
   * @description 管理员调整用户中奖概率
   * @example AdminLotteryCoreService.adjustUserProbability() // ServiceManager key: admin_lottery_core
   */
  LOTTERY_PROBABILITY_ADJUST: 'lottery_probability_adjust',

  /**
   * 用户队列
   * @description 管理员设置用户专属抽奖队列
   * @example AdminLotteryCoreService.setUserQueue() // ServiceManager key: admin_lottery_core
   */
  LOTTERY_USER_QUEUE: 'lottery_user_queue',

  /**
   * 清除设置
   * @description 管理员清除用户的抽奖管理设置
   * @example AdminLotteryCoreService.clearUserSettings() // ServiceManager key: admin_lottery_core
   */
  LOTTERY_CLEAR_SETTINGS: 'lottery_clear_settings',

  // ==================== 库存操作类 ====================
  /**
   * 库存操作（使用/核销/上架/下架）
   * @description 管理员对物品实例进行操作
   */
  INVENTORY_OPERATION: 'inventory_operation',

  /**
   * 物品转让（用户间物品转让）
   * @description 管理员协助处理物品转让
   */
  INVENTORY_TRANSFER: 'inventory_transfer',

  // ==================== 市场交易类（C2C Phase 2 新增）====================
  /**
   * 市场挂牌管理员强制撤回
   * @description 客服强制撤回用户的市场挂牌
   * @example MarketListingService.adminForceWithdrawListing()
   */
  MARKET_LISTING_ADMIN_WITHDRAW: 'market_listing_admin_withdraw',

  // ==================== 员工管理类（V4.6.1 新增）====================
  /**
   * 员工永久删除（软删除）
   * @description 管理员删除员工记录（离职员工或强制删除在职员工）
   * @example StaffManagementService.permanentDeleteStaff()
   * @since 2026-01-26
   */
  STAFF_PERMANENT_DELETE: 'staff_permanent_delete',

  // ==================== 系统配置类 ====================
  /**
   * 系统配置修改
   * @description 管理员修改系统级配置
   */
  SYSTEM_CONFIG: 'system_config',

  /**
   * 客服会话分配（分配/取消/转移）
   * @description 管理员分配或转移客服会话
   */
  SESSION_ASSIGN: 'session_assign',

  // ==================== 消费审核类 ====================
  /**
   * 消费审核（审核通过/拒绝）
   * @description 管理员审核用户的消费记录
   */
  CONSUMPTION_AUDIT: 'consumption_audit',

  // ==================== 功能开关类（Feature Flag V4.6.0 新增）====================
  /**
   * 功能开关创建
   * @description 管理员创建新的功能开关
   * @example FeatureFlagService.createFlag()
   */
  FEATURE_FLAG_CREATE: 'feature_flag_create',

  /**
   * 功能开关更新
   * @description 管理员更新功能开关配置
   * @example FeatureFlagService.updateFlag()
   */
  FEATURE_FLAG_UPDATE: 'feature_flag_update',

  /**
   * 功能开关删除
   * @description 管理员删除功能开关
   * @example FeatureFlagService.deleteFlag()
   */
  FEATURE_FLAG_DELETE: 'feature_flag_delete',

  /**
   * 功能开关启用/禁用
   * @description 管理员切换功能开关状态
   * @example FeatureFlagService.toggleFlag()
   */
  FEATURE_FLAG_TOGGLE: 'feature_flag_toggle'
})

/**
 * 数据库 ENUM 值数组
 *
 * @description 用于 Sequelize 模型定义和数据库迁移
 * @type {string[]}
 *
 * @example
 * // 模型定义中使用
 * operation_type: {
 *   type: DataTypes.ENUM(...DB_ENUM_VALUES),
 *   allowNull: false
 * }
 *
 * @example
 * // 迁移文件中使用
 * await queryInterface.changeColumn('admin_operation_logs', 'operation_type', {
 *   type: Sequelize.ENUM(...DB_ENUM_VALUES)
 * })
 */
const DB_ENUM_VALUES = Object.freeze(Object.values(OPERATION_TYPES))

/**
 * 操作类型描述映射
 *
 * @description 提供每种操作类型的中文描述，用于日志显示和前端展示
 * @type {Object.<string, string>}
 */
const OPERATION_TYPE_DESCRIPTIONS = Object.freeze({
  // 积分资产类
  [OPERATION_TYPES.POINTS_ADJUST]: '积分调整',
  [OPERATION_TYPES.ASSET_ADJUSTMENT]: '资产调整',
  [OPERATION_TYPES.ASSET_ORPHAN_CLEANUP]: '孤儿冻结清理',

  // 商品管理类
  [OPERATION_TYPES.EXCHANGE_AUDIT]: '兑换审核',
  [OPERATION_TYPES.PRODUCT_UPDATE]: '商品修改',
  [OPERATION_TYPES.PRODUCT_CREATE]: '商品创建',
  [OPERATION_TYPES.PRODUCT_DELETE]: '商品删除',

  // 用户管理类
  [OPERATION_TYPES.USER_STATUS_CHANGE]: '用户状态变更',
  [OPERATION_TYPES.ROLE_ASSIGN]: '角色分配',
  [OPERATION_TYPES.ROLE_CHANGE]: '角色变更',
  [OPERATION_TYPES.ROLE_CREATE]: '角色创建',
  [OPERATION_TYPES.ROLE_UPDATE]: '角色更新',
  [OPERATION_TYPES.ROLE_DELETE]: '角色删除',

  // 奖品活动类
  [OPERATION_TYPES.PRIZE_CONFIG]: '奖品配置',
  [OPERATION_TYPES.PRIZE_CREATE]: '奖品创建',
  [OPERATION_TYPES.PRIZE_DELETE]: '奖品删除',
  [OPERATION_TYPES.PRIZE_STOCK_ADJUST]: '奖品库存调整',
  [OPERATION_TYPES.CAMPAIGN_CONFIG]: '活动配置',

  // 抽奖管理类（V4.5.0新增）
  [OPERATION_TYPES.LOTTERY_FORCE_WIN]: '强制中奖',
  [OPERATION_TYPES.LOTTERY_FORCE_LOSE]: '强制不中奖',
  [OPERATION_TYPES.LOTTERY_PROBABILITY_ADJUST]: '概率调整',
  [OPERATION_TYPES.LOTTERY_USER_QUEUE]: '用户队列',
  [OPERATION_TYPES.LOTTERY_CLEAR_SETTINGS]: '清除设置',

  // 库存操作类
  [OPERATION_TYPES.INVENTORY_OPERATION]: '库存操作',
  [OPERATION_TYPES.INVENTORY_TRANSFER]: '物品转让',

  // 市场交易类（C2C Phase 2 新增）
  [OPERATION_TYPES.MARKET_LISTING_ADMIN_WITHDRAW]: '市场挂牌强制撤回',

  // 系统配置类
  [OPERATION_TYPES.SYSTEM_CONFIG]: '系统配置',
  [OPERATION_TYPES.SESSION_ASSIGN]: '客服会话分配',

  // 消费审核类
  [OPERATION_TYPES.CONSUMPTION_AUDIT]: '消费审核',

  // 功能开关类（Feature Flag V4.6.0 新增）
  [OPERATION_TYPES.FEATURE_FLAG_CREATE]: '功能开关创建',
  [OPERATION_TYPES.FEATURE_FLAG_UPDATE]: '功能开关更新',
  [OPERATION_TYPES.FEATURE_FLAG_DELETE]: '功能开关删除',
  [OPERATION_TYPES.FEATURE_FLAG_TOGGLE]: '功能开关启用/禁用',

  // 员工管理类（V4.6.1 新增）
  [OPERATION_TYPES.STAFF_PERMANENT_DELETE]: '员工记录删除'
})

/**
 * 关键操作类型集合
 *
 * @description 需要强制幂等键（idempotency_key）的操作类型
 *              这些操作失败时必须阻断业务流程，且审计日志失败不能静默忽略
 * @type {Set<string>}
 *
 * 关键操作定义（根据审计统一入口整合方案 V4.5.0 决策5）：
 * - 积分/资产调整：涉及用户资产变动，必须可追溯
 * - 兑换审核：涉及实物商品发放，必须留痕
 * - 消费审核：涉及消费记录确认，影响积分到账
 * - 库存转让：涉及物品所有权转移，必须强一致
 * - 用户管理：用户状态变更、角色变更，影响用户权限
 * - 奖品管理：奖品库存调整、奖品删除，影响抽奖公平性
 * - 抽奖管理：强制中奖/不中奖、概率调整、用户队列、清除设置
 * - 市场交易：强制撤回挂牌，影响卖家资产
 */
const CRITICAL_OPERATIONS = Object.freeze(
  new Set([
    // ========== 资产相关关键操作 ==========
    OPERATION_TYPES.POINTS_ADJUST, // 积分调整 - 直接影响用户积分
    OPERATION_TYPES.ASSET_ADJUSTMENT, // 资产调整 - 影响用户资产余额
    OPERATION_TYPES.EXCHANGE_AUDIT, // 兑换审核 - 涉及实物发放
    OPERATION_TYPES.CONSUMPTION_AUDIT, // 消费审核 - 影响积分到账
    OPERATION_TYPES.INVENTORY_TRANSFER, // 库存转让 - 物品所有权转移

    // ========== 用户管理关键操作 ==========
    OPERATION_TYPES.USER_STATUS_CHANGE, // 用户状态变更 - 禁用/封禁影响用户登录
    OPERATION_TYPES.ROLE_CHANGE, // 角色变更 - 影响用户权限和角色
    OPERATION_TYPES.ROLE_CREATE, // 角色创建 - 影响系统权限体系
    OPERATION_TYPES.ROLE_UPDATE, // 角色更新 - 影响拥有该角色的所有用户权限
    OPERATION_TYPES.ROLE_DELETE, // 角色删除 - 不可恢复的破坏性操作

    // ========== 奖品管理关键操作 ==========
    OPERATION_TYPES.PRIZE_STOCK_ADJUST, // 奖品库存调整 - 影响抽奖可用库存
    OPERATION_TYPES.PRIZE_DELETE, // 奖品删除 - 不可恢复的破坏性操作

    // ========== 抽奖管理关键操作（V4.5.0 新增）==========
    OPERATION_TYPES.LOTTERY_FORCE_WIN, // 强制中奖 - 影响用户抽奖结果
    OPERATION_TYPES.LOTTERY_FORCE_LOSE, // 强制不中奖 - 影响用户抽奖结果
    OPERATION_TYPES.LOTTERY_PROBABILITY_ADJUST, // 概率调整 - 影响抽奖公平性
    OPERATION_TYPES.LOTTERY_USER_QUEUE, // 用户队列 - 影响用户抽奖顺序
    OPERATION_TYPES.LOTTERY_CLEAR_SETTINGS, // 清除设置 - 批量影响抽奖配置

    // ========== 市场交易关键操作（C2C Phase 2 新增）==========
    OPERATION_TYPES.MARKET_LISTING_ADMIN_WITHDRAW, // 市场挂牌强制撤回 - 影响卖家资产和交易

    // ========== 功能开关关键操作（Feature Flag V4.6.0 新增）==========
    OPERATION_TYPES.FEATURE_FLAG_DELETE, // 功能开关删除 - 不可恢复的破坏性操作
    OPERATION_TYPES.FEATURE_FLAG_TOGGLE, // 功能开关切换 - 影响系统功能可用性

    // ========== 员工管理关键操作（V4.6.1 新增）==========
    OPERATION_TYPES.STAFF_PERMANENT_DELETE // 员工删除 - 影响员工权限和系统安全
  ])
)

/**
 * 检查操作类型是否有效
 *
 * @param {string} operationType - 待检查的操作类型
 * @returns {boolean} 是否为有效的操作类型
 *
 * @example
 * if (!isValidOperationType('unknown_type')) {
 *   throw new Error('无效的操作类型')
 * }
 */
function isValidOperationType(operationType) {
  return DB_ENUM_VALUES.includes(operationType)
}

/**
 * 检查是否为关键操作（需要幂等键）
 *
 * @param {string} operationType - 操作类型
 * @returns {boolean} 是否为关键操作
 *
 * @example
 * if (isCriticalOperation('points_adjust')) {
 *   // 强制检查 idempotency_key
 * }
 */
function isCriticalOperation(operationType) {
  return CRITICAL_OPERATIONS.has(operationType)
}

/**
 * 获取操作类型的中文描述
 *
 * @param {string} operationType - 操作类型
 * @returns {string} 中文描述，未知类型返回 '未知操作'
 *
 * @example
 * const desc = getOperationTypeDescription('points_adjust') // '积分调整'
 */
function getOperationTypeDescription(operationType) {
  return OPERATION_TYPE_DESCRIPTIONS[operationType] || '未知操作'
}

/**
 * 启动时校验数据库 ENUM 与代码枚举一致性
 *
 * @description 【审计整合方案】防回退机制
 * 在应用启动时校验数据库 admin_operation_logs.operation_type ENUM
 * 是否包含代码中定义的所有操作类型
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Promise<{valid: boolean, missing: string[], extra: string[]}>} 校验结果
 *
 * @example
 * // 在 app.js 启动时调用
 * const { validateDbEnumConsistency } = require('./constants/AuditOperationTypes')
 * const result = await validateDbEnumConsistency(sequelize)
 * if (!result.valid) {
 *   console.error('ENUM 不一致，缺失类型：', result.missing)
 *   process.exit(1)
 * }
 */
async function validateDbEnumConsistency(sequelize) {
  const logger = require('../utils/logger').logger

  try {
    logger.info('[启动校验] 开始校验审计操作类型 ENUM 一致性...')

    // 1. 查询数据库当前 ENUM 定义
    const [results] = await sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    if (results.length === 0) {
      logger.warn(
        '[启动校验] admin_operation_logs 表不存在或 operation_type 列不存在，跳过 ENUM 校验'
      )
      return { valid: true, missing: [], extra: [], skipped: true }
    }

    // 2. 解析 ENUM 值
    const columnType = results[0].COLUMN_TYPE || ''
    const enumMatch = columnType.match(/^enum\((.*)\)$/i)

    if (!enumMatch) {
      logger.warn('[启动校验] operation_type 不是 ENUM 类型，跳过校验')
      return { valid: true, missing: [], extra: [], skipped: true }
    }

    // 解析 ENUM 值列表
    const dbEnumValues = enumMatch[1].split(',').map(val => val.trim().replace(/^'|'$/g, ''))

    // 3. 比对代码定义与数据库定义
    const codeValues = new Set(DB_ENUM_VALUES)
    const dbValues = new Set(dbEnumValues)

    // 代码中有但数据库没有的（需要迁移添加）
    const missing = DB_ENUM_VALUES.filter(val => !dbValues.has(val))

    // 数据库中有但代码没有的（可能是废弃的类型）
    const extra = dbEnumValues.filter(val => !codeValues.has(val))

    if (missing.length > 0 || extra.length > 0) {
      logger.error('[启动校验] ❌ ENUM 一致性校验失败', {
        missing_in_db: missing,
        extra_in_db: extra,
        code_count: DB_ENUM_VALUES.length,
        db_count: dbEnumValues.length
      })

      if (missing.length > 0) {
        logger.error('[启动校验] 请执行数据库迁移添加以下 ENUM 值：', missing)
      }

      if (extra.length > 0) {
        logger.warn('[启动校验] 数据库中存在废弃的 ENUM 值（可保留或迁移清理）：', extra)
      }

      return { valid: false, missing, extra }
    }

    logger.info('[启动校验] ✅ ENUM 一致性校验通过', {
      total_types: DB_ENUM_VALUES.length
    })

    return { valid: true, missing: [], extra: [] }
  } catch (error) {
    logger.error('[启动校验] ENUM 校验出错', {
      error: error.message,
      stack: error.stack
    })

    // 校验出错不阻断启动，但记录错误
    return { valid: true, missing: [], extra: [], error: error.message }
  }
}

module.exports = {
  // 枚举对象（推荐使用常量名访问）
  OPERATION_TYPES,

  // 数据库 ENUM 值数组（用于模型和迁移）
  DB_ENUM_VALUES,

  // 操作类型描述映射
  OPERATION_TYPE_DESCRIPTIONS,

  // 关键操作集合
  CRITICAL_OPERATIONS,

  // 工具函数
  isValidOperationType,
  isCriticalOperation,
  getOperationTypeDescription,

  // 启动校验函数（审计整合方案 V4.5.0）
  validateDbEnumConsistency
}
