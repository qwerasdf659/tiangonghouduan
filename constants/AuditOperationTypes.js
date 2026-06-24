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
   * @description 管理员调整用户资产（POINTS、BUDGET_POINTS、star_stone等）
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
   * 奖品库存设置（设置绝对值）
   * @description 管理员设置奖品库存为指定数值（区别于 adjust 的增量模式）
   */
  PRIZE_STOCK_SET: 'prize_stock_set',

  /**
   * 活动配置（修改活动配置）
   * @description 管理员修改抽奖活动配置
   */
  CAMPAIGN_CONFIG: 'campaign_config',

  // ==================== 抽奖管理类（2026-06-04 合规改造：per-user 暗箱干预已下线）====================
  /*
   * force_win / force_lose / probability_adjust / user_queue / clear_settings 等 per-user 暗箱
   * 干预操作类型已随机制整体移除。个人发奖统一走 cs_compensate 明示补偿（见 CS_COMPENSATE 审计类型）。
   */

  // ==================== 策略模拟类（2026-02-20 策略效果模拟分析） ====================
  /**
   * 模拟配置一键应用到线上
   * @description 将模拟分析的参数配置直接应用到生产环境
   */
  SIMULATION_APPLY: 'simulation_apply',

  /**
   * 配置版本回滚
   * @description 从 AdminOperationLog 的 before_data 恢复历史配置
   */
  CONFIG_ROLLBACK: 'config_rollback',

  /**
   * 策略配置更新（用于版本历史追踪）
   * @description 策略配置参数变更，包括 pity/anti_empty/anti_high 等
   */
  STRATEGY_CONFIG_UPDATE: 'strategy_config_update',

  /**
   * 矩阵配置更新（用于版本历史追踪）
   * @description BxPx 矩阵乘数配置变更
   */
  MATRIX_CONFIG_UPDATE: 'matrix_config_update',

  /**
   * 基础权重更新（用于版本历史追踪）
   * @description 档位基础权重配置变更
   */
  TIER_RULES_UPDATE: 'tier_rules_update',

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

  // 注：市场交易类审计操作（MARKET_LISTING_ADMIN_WITHDRAW）已随 C2C 下线移除（2026-06-05 阶段五）

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

  // ==================== 兑换订单操作类（2026-03-13 细分类型补充）====================
  /**
   * 兑换订单取消
   * @description 管理员或用户取消兑换订单
   * @example exchange/CoreService.cancelOrder()
   * @since 2026-03-13
   */
  EXCHANGE_CANCEL: 'exchange_cancel',

  /**
   * 兑换订单拒绝
   * @description 管理员拒绝兑换订单
   * @example exchange/CoreService.rejectOrder()
   * @since 2026-03-13
   */
  EXCHANGE_REJECT: 'exchange_reject',

  /**
   * 兑换订单发货
   * @description 管理员对兑换订单执行发货操作
   * @example exchange/CoreService.updateOrderStatus('shipped')
   * @since 2026-03-13
   */
  EXCHANGE_SHIP: 'exchange_ship',

  /**
   * 兑换订单确认收货
   * @description 用户确认收到兑换商品
   * @example exchange/CoreService.confirmReceipt()
   * @since 2026-03-13
   */
  EXCHANGE_CONFIRM_RECEIPT: 'exchange_confirm_receipt',

  // ==================== 消费审核类 ====================
  /**
   * 消费审核（审核通过/拒绝）
   * @description 管理员审核用户的消费记录
   */
  CONSUMPTION_AUDIT: 'consumption_audit',

  // ==================== 审核链类（Approval Chain）====================
  /**
   * 审核链模板配置变更（创建/修改/启停模板）
   * @description 管理员对审核链模板进行 CRUD 操作
   */
  APPROVAL_CHAIN_CONFIG: 'approval_chain_config',

  /**
   * 审核链步骤审核操作（通过/拒绝）
   * @description 审核人对审核链步骤执行审核操作
   */
  APPROVAL_CHAIN_AUDIT: 'approval_chain_audit',

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
  FEATURE_FLAG_TOGGLE: 'feature_flag_toggle',

  // ==================== 管理员查看用户数据类（路由分离方案 V4.8.0 新增）====================
  /**
   * 管理员查看用户数据（只读查询）
   * @description 管理员通过管理端接口查看用户的抽奖历史、积分、统计等数据
   * @example 管理端路由 /api/v4/console/lottery-user-analysis/history/:user_id
   * @example 管理端路由 /api/v4/console/lottery-user-analysis/points/:user_id
   * @example 管理端路由 /api/v4/console/lottery-user-analysis/statistics/:user_id
   * @since 2026-02-12（路由分离方案 - 抽奖接口安全改造）
   */
  ADMIN_VIEW_USER_DATA: 'admin_view_user_data',

  // ==================== 数据管理类（数据一键删除功能 2026-03-10 新增）====================
  /**
   * 数据清理操作
   * @description 管理员执行数据清理（手动清理/自动清理/上线前清档）
   * @example DataManagementService.executeCleanup()
   * @since 2026-03-10（数据一键删除功能）
   */
  DATA_CLEANUP: 'data_cleanup',

  // ==================== 登录安全类（P0.6 管理端登录加固 2026-06-18 新增）====================
  /**
   * 管理端登录锁定
   * @description 同一管理员手机号连续登录失败达到阈值后被锁定（防爆破/撞库）
   * @example AdminLoginSecurityService.recordFailure() 命中阈值时记录
   * @since 2026-06-18（验证码功能 P0.6 管理端轻量加固）
   */
  ADMIN_LOGIN_LOCKED: 'admin_login_locked',

  // ==================== 媒体治理类（媒体级联删除危险操作留痕 2026-06-24 新增）====================
  /**
   * 媒体删除（移入回收站）
   * @description 管理员把媒体软删进回收站（30 天后由定时任务物理删）
   * @example MediaService.moveToTrash() 经路由 DELETE /console/media/:media_id
   * @since 2026-06-24（媒体级联删除治本方案）
   */
  MEDIA_DELETE: 'media_delete',

  /**
   * 媒体恢复（从回收站还原）
   * @description 管理员把回收站内媒体恢复为 active
   * @example MediaService.restore() 经路由 POST /console/media/:media_id/restore
   * @since 2026-06-24
   */
  MEDIA_RESTORE: 'media_restore',

  /**
   * 媒体彻底删除（不可逆）
   * @description 管理员对回收站内媒体立即物理删（原图 + 全衍生 + DB 记录）
   * @example MediaService.purgeOne() 经路由 POST /console/media/:media_id/purge
   * @since 2026-06-24
   */
  MEDIA_PURGE: 'media_purge',

  /**
   * 媒体存量批量优化
   * @description 管理员对存量图重跑预生成衍生（补齐 w375/w750/w1080 WebP）
   * @example MediaService.batchOptimize() 经路由 POST /console/storage/optimize
   * @since 2026-06-24
   */
  MEDIA_OPTIMIZE: 'media_optimize'
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
  [OPERATION_TYPES.PRIZE_STOCK_SET]: '奖品库存设置',
  [OPERATION_TYPES.CAMPAIGN_CONFIG]: '活动配置',

  /*
   * 抽奖管理类 per-user 暗箱干预（force_win/force_lose/probability_adjust/user_queue/clear_settings）
   * 已于 2026-06-04 合规改造整体下线
   */

  // 策略模拟类（2026-02-20 策略效果模拟分析）
  [OPERATION_TYPES.SIMULATION_APPLY]: '模拟配置应用',
  [OPERATION_TYPES.CONFIG_ROLLBACK]: '配置版本回滚',
  [OPERATION_TYPES.STRATEGY_CONFIG_UPDATE]: '策略配置更新',
  [OPERATION_TYPES.MATRIX_CONFIG_UPDATE]: '矩阵配置更新',
  [OPERATION_TYPES.TIER_RULES_UPDATE]: '基础权重更新',

  // 库存操作类
  [OPERATION_TYPES.INVENTORY_OPERATION]: '库存操作',
  [OPERATION_TYPES.INVENTORY_TRANSFER]: '物品转让',

  // 系统配置类
  [OPERATION_TYPES.SYSTEM_CONFIG]: '系统配置',
  [OPERATION_TYPES.SESSION_ASSIGN]: '客服会话分配',

  // 兑换订单操作类（2026-03-13 细分类型补充）
  [OPERATION_TYPES.EXCHANGE_CANCEL]: '兑换订单取消',
  [OPERATION_TYPES.EXCHANGE_REJECT]: '兑换订单拒绝',
  [OPERATION_TYPES.EXCHANGE_SHIP]: '兑换订单发货',
  [OPERATION_TYPES.EXCHANGE_CONFIRM_RECEIPT]: '兑换订单确认收货',

  // 消费审核类
  [OPERATION_TYPES.CONSUMPTION_AUDIT]: '消费审核',

  // 审核链类
  [OPERATION_TYPES.APPROVAL_CHAIN_CONFIG]: '审核链配置变更',
  [OPERATION_TYPES.APPROVAL_CHAIN_AUDIT]: '审核链步骤审核',

  // 功能开关类（Feature Flag V4.6.0 新增）
  [OPERATION_TYPES.FEATURE_FLAG_CREATE]: '功能开关创建',
  [OPERATION_TYPES.FEATURE_FLAG_UPDATE]: '功能开关更新',
  [OPERATION_TYPES.FEATURE_FLAG_DELETE]: '功能开关删除',
  [OPERATION_TYPES.FEATURE_FLAG_TOGGLE]: '功能开关启用/禁用',

  // 员工管理类（V4.6.1 新增）
  [OPERATION_TYPES.STAFF_PERMANENT_DELETE]: '员工记录删除',

  // 管理员查看用户数据类（路由分离方案 V4.8.0 新增）
  [OPERATION_TYPES.ADMIN_VIEW_USER_DATA]: '管理员查看用户数据',

  // 数据管理类（数据一键删除功能 2026-03-10 新增）
  [OPERATION_TYPES.DATA_CLEANUP]: '数据清理',

  // 登录安全类（P0.6 管理端登录加固 2026-06-18 新增）
  [OPERATION_TYPES.ADMIN_LOGIN_LOCKED]: '管理端登录锁定',

  // 媒体治理类（媒体级联删除危险操作留痕 2026-06-24 新增）
  [OPERATION_TYPES.MEDIA_DELETE]: '媒体删除（移入回收站）',
  [OPERATION_TYPES.MEDIA_RESTORE]: '媒体恢复（从回收站还原）',
  [OPERATION_TYPES.MEDIA_PURGE]: '媒体彻底删除',
  [OPERATION_TYPES.MEDIA_OPTIMIZE]: '媒体存量批量优化'
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
    OPERATION_TYPES.APPROVAL_CHAIN_AUDIT, // 审核链审核 - 影响业务审核流程
    OPERATION_TYPES.INVENTORY_TRANSFER, // 库存转让 - 物品所有权转移

    // ========== 用户管理关键操作 ==========
    OPERATION_TYPES.USER_STATUS_CHANGE, // 用户状态变更 - 禁用/封禁影响用户登录
    OPERATION_TYPES.ROLE_CHANGE, // 角色变更 - 影响用户权限和角色
    OPERATION_TYPES.ROLE_CREATE, // 角色创建 - 影响系统权限体系
    OPERATION_TYPES.ROLE_UPDATE, // 角色更新 - 影响拥有该角色的所有用户权限
    OPERATION_TYPES.ROLE_DELETE, // 角色删除 - 不可恢复的破坏性操作

    // ========== 奖品管理关键操作 ==========
    OPERATION_TYPES.PRIZE_STOCK_ADJUST, // 奖品库存调整 - 影响抽奖可用库存
    OPERATION_TYPES.PRIZE_STOCK_SET, // 奖品库存设置 - 直接设置绝对库存值
    OPERATION_TYPES.PRIZE_DELETE, // 奖品删除 - 不可恢复的破坏性操作

    /*
     * ========== 抽奖管理 per-user 暗箱干预（2026-06-04 合规改造已下线）==========
     * force_win/force_lose/probability_adjust/user_queue/clear_settings 关键操作类型已随机制移除
     */

    // ========== 策略模拟关键操作（2026-02-20 新增）==========
    OPERATION_TYPES.SIMULATION_APPLY, // 模拟配置应用 - 直接修改生产策略配置
    OPERATION_TYPES.CONFIG_ROLLBACK, // 配置版本回滚 - 回退生产策略配置

    // ========== 功能开关关键操作（Feature Flag V4.6.0 新增）==========
    OPERATION_TYPES.FEATURE_FLAG_DELETE, // 功能开关删除 - 不可恢复的破坏性操作
    OPERATION_TYPES.FEATURE_FLAG_TOGGLE, // 功能开关切换 - 影响系统功能可用性

    // ========== 员工管理关键操作（V4.6.1 新增）==========
    OPERATION_TYPES.STAFF_PERMANENT_DELETE, // 员工删除 - 影响员工权限和系统安全

    // ========== 数据管理关键操作（2026-03-10 新增）==========
    OPERATION_TYPES.DATA_CLEANUP // 数据清理 - 不可恢复的批量删除操作
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
