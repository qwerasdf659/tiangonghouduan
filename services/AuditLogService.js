const logger = require('../utils/logger').logger

/**
 * 餐厅积分抽奖系统 V4.0 - 统一审计日志服务（AuditLogService）
 *
 * 业务场景：为所有核心服务提供统一的审计日志记录功能，实现敏感操作的完整审计追溯
 *
 * 核心功能：
 * 1. 统一审计日志记录（支持所有业务类型）
 * 2. 积分操作审计（积分增加、消费、激活、退款）
 * 3. 库存操作审计（物品使用、转让、核销）
 * 4. 审核操作审计（消费审核、兑换审核）
 * 5. 商品配置审计（商品创建、修改、删除）
 * 6. 资产调整审计（V4.5.0新增 - 管理员资产调整）
 * 7. 抽奖管理审计（V4.5.0新增 - 强制中奖、概率调整等）
 * 8. 数据变更对比（自动生成前后数据对比）
 *
 * 设计原则：
 * - **服务层适配**：不依赖req对象，适用于服务层调用
 * - **事务支持**：支持在事务中记录审计日志
 * - **异步记录**：审计日志记录失败不影响业务操作
 * - **完整记录**：记录操作前后的完整数据、变更字段、操作原因
 * - **安全信息**：记录IP地址、用户代理等安全信息（如果有）
 * - **统一枚举**：操作类型来源于 constants/AuditOperationTypes.js（单一真相源）
 *
 * 与auditLog中间件的关系：
 * - auditLog中间件：面向路由层，依赖req对象（适用于HTTP请求）
 * - AuditLogService：面向服务层，不依赖req对象（适用于内部调用）
 * - 两者底层都使用AdminOperationLog模型
 * - 中间件层建议调用本服务的方法，而非直接操作模型
 *
 * 使用示例：
 * ```javascript
 * // 示例1：记录积分增加操作
 * await AuditLogService.logPointsAdd({
 *   operator_id: userId,
 *   user_id: userId,
 *   before_points: 100,
 *   after_points: 200,
 *   points_amount: 100,
 *   reason: '消费奖励',
 *   idempotency_key: 'consumption_12345',
 *   transaction
 * });
 *
 * // 示例2：记录物品转让操作
 * await AuditLogService.logInventoryTransfer({
 *   operator_id: fromUserId,
 *   item_id: itemId,
 *   from_user_id: fromUserId,
 *   to_user_id: toUserId,
 *   name: '优惠券',  // 2026-01-20 统一字段名
 *   reason: '赠送朋友',
 *   transaction
 * });
 *
 * // 示例3：记录资产调整操作（V4.5.0新增）
 * await AuditLogService.logAssetAdjustment({
 *   operator_id: adminId,
 *   user_id: targetUserId,
 *   asset_code: 'POINTS',
 *   delta_amount: 100,
 *   balance_before: 500,
 *   balance_after: 600,
 *   reason: '客服补偿',
 *   idempotency_key: 'admin_adjust_xxx',
 *   transaction
 * });
 * ```
 *
 * 创建时间：2025年12月09日
 * 最后更新：2026年01月08日（V4.5.0 审计统一入口整合）
 */

const { AdminOperationLog } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

// 引用统一枚举定义（单一真相源 - 2026-01-08 整合）
const {
  OPERATION_TYPES,
  isValidOperationType,
  isCriticalOperation
} = require('../constants/AuditOperationTypes')

// 引用 target_type 规范化工具（P0-5 实施 - 2026-01-09）
const { normalizeTargetType, isValidTargetType } = require('../constants/AuditTargetTypes')

/**
 * 审计日志服务类
 * 职责：为服务层提供统一的审计日志记录接口
 * 设计模式：服务层模式 + 静态方法（无状态设计）
 */
class AuditLogService {
  /**
   * 记录通用操作审计日志（核心方法）
   *
   * 根据《审计统一入口整合方案》决策5和决策6：
   * - 关键操作（is_critical_operation=true）审计失败时必须阻断业务流程
   * - 关键操作必须提供 idempotency_key，禁止自动生成兜底
   *
   * @param {Object} params - 审计日志参数
   * @param {number} params.operator_id - 操作员ID（必填）
   * @param {string} params.operation_type - 操作类型（必填，如'points_adjust'）
   * @param {string} params.target_type - 目标对象类型（必填，如'User'）
   * @param {number} params.target_id - 目标对象ID（必填）
   * @param {string} params.action - 操作动作（必填，如'update'）
   * @param {Object} params.before_data - 操作前数据（可选）
   * @param {Object} params.after_data - 操作后数据（可选）
   * @param {string} params.reason - 操作原因（可选）
   * @param {string} params.idempotency_key - 业务关联ID（关键操作必填）
   * @param {string} params.ip_address - IP地址（可选）
   * @param {string} params.user_agent - 用户代理（可选）
   * @param {Object} params.transaction - 事务对象（可选）
   * @param {boolean} params.is_critical_operation - 是否关键操作（决策5：关键操作失败时阻断业务流程）
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录
   * @throws {Error} 关键操作审计失败时抛出错误（阻断业务流程）
   */
  static async logOperation(params) {
    const {
      operator_id,
      operation_type,
      target_type,
      target_id,
      action,
      before_data = null,
      after_data = null,
      reason = null,
      idempotency_key = null,
      ip_address = null,
      user_agent = null,
      transaction = null,
      is_critical_operation = false // 决策5：是否关键操作
    } = params

    // 判断是否为关键操作（显式标记 或 操作类型属于关键操作集合）
    const isCritical = is_critical_operation || isCriticalOperation(operation_type)

    try {
      // 1. 验证必填参数
      if (!operator_id || !operation_type || !target_type || !target_id || !action) {
        const missingFields = {
          operator_id: !!operator_id,
          operation_type: !!operation_type,
          target_type: !!target_type,
          target_id: !!target_id,
          action: !!action
        }

        // 决策5：关键操作缺少参数时抛出错误
        if (isCritical) {
          const error = new Error(
            `[审计日志] 关键操作缺少必填参数: ${JSON.stringify(missingFields)}`
          )
          error.code = 'AUDIT_MISSING_PARAMS'
          throw error
        }

        logger.warn('[审计日志] 缺少必填参数，跳过记录', missingFields)
        return null
      }

      // 2. 验证操作类型（使用统一枚举定义 - constants/AuditOperationTypes.js）
      if (!isValidOperationType(operation_type)) {
        const errorMsg =
          `[审计日志] 无效的操作类型: ${operation_type}，` +
          '请检查 constants/AuditOperationTypes.js 中的定义'

        // 决策5：关键操作类型无效时抛出错误
        if (isCritical) {
          const error = new Error(errorMsg)
          error.code = 'AUDIT_INVALID_TYPE'
          throw error
        }

        logger.warn(errorMsg)
        return null
      }

      // 2.1 规范化 target_type（P0-5 实施 - 2026-01-09）
      const normalizedTargetType = normalizeTargetType(target_type)
      const targetTypeRaw = target_type !== normalizedTargetType ? target_type : null

      // 2.2 校验规范化后的 target_type
      if (!isValidTargetType(normalizedTargetType)) {
        const warnMsg =
          `[审计日志] 未知的 target_type: ${target_type}（规范化后: ${normalizedTargetType}），` +
          '请在 constants/AuditTargetTypes.js 中定义'

        // 关键操作使用未知 target_type 时抛出错误
        if (isCritical) {
          const error = new Error(warnMsg)
          error.code = 'AUDIT_INVALID_TARGET_TYPE'
          throw error
        }

        // 非关键操作仅警告，继续使用原始值
        logger.warn(warnMsg)
      }

      // 3. 决策6：关键操作强制要求 idempotency_key，禁止兜底
      if (isCritical && !idempotency_key) {
        const error = new Error(
          `[审计日志] 关键操作 ${operation_type} 必须提供 idempotency_key（业务主键派生），` +
            '禁止使用 Date.now() 或 UUID 兜底生成'
        )
        error.code = 'AUDIT_MISSING_IDEMPOTENCY_KEY'
        throw error
      }

      // 4. 计算变更字段
      const changedFields = AdminOperationLog.compareObjects(before_data, after_data)

      // 5. 创建审计日志（使用规范化后的 target_type）
      const logData = {
        operator_id,
        operation_type,
        target_type: normalizedTargetType, // P0-5: 使用规范化后的 target_type
        target_id,
        action,
        before_data,
        after_data,
        changed_fields: changedFields,
        reason,
        ip_address,
        user_agent,
        idempotency_key,
        created_at: BeijingTimeHelper.createDatabaseTime()
      }

      // P0-5: 如果原始值与规范化后不同，保存原始值到 target_type_raw
      if (targetTypeRaw) {
        logData.target_type_raw = targetTypeRaw
      }

      const auditLog = await AdminOperationLog.create(logData, { transaction })

      logger.info(
        `[审计日志] 记录成功: log_id=${auditLog.log_id}, 操作员=${operator_id}, ` +
          `类型=${operation_type}, 动作=${action}, 关键操作=${isCritical}`
      )

      return auditLog
    } catch (error) {
      // 决策5：关键操作审计失败时必须抛出错误，阻断业务流程
      if (isCritical) {
        logger.error(`[审计日志] 关键操作审计失败，阻断业务流程: ${error.message}`, {
          operation_type,
          operator_id,
          target_type,
          target_id,
          error_code: error.code || 'AUDIT_CRITICAL_FAILED'
        })
        throw error
      }

      // 非关键操作：审计日志记录失败不影响业务操作，只记录错误
      logger.error(`[审计日志] 记录失败（非关键操作，不阻断）: ${error.message}`)
      logger.error(error.stack)
      return null
    }
  }

  /**
   * 记录管理员操作（抽奖管理专用）
   *
   * 用于抽奖管理模块的审计日志记录，自动映射参数到logOperation格式
   *
   * V4.5.1 更新（2026-01-08 审计统一入口整合）：
   * - 【决策6】关键操作必须由调用方提供 idempotency_key，禁止自动生成兜底
   * - 【决策5】关键操作审计失败时阻断业务流程
   *
   * @param {Object} params - 参数
   * @param {number} params.admin_id - 管理员ID
   * @param {string} params.operation_type - 操作类型
   * @param {string} params.operation_target - 操作目标
   * @param {number} params.target_id - 目标ID
   * @param {Object} params.operation_details - 操作详情
   * @param {string} params.idempotency_key - 幂等键（关键操作必填，禁止兜底生成）
   * @param {string} params.ip_address - IP地址
   * @param {string} params.user_agent - 用户代理
   * @param {boolean} params.is_critical_operation - 是否关键操作（覆盖默认判断）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录
   * @throws {Error} 关键操作审计失败时抛出错误
   */
  static async logAdminOperation(params, options = {}) {
    const {
      admin_id,
      operation_type,
      operation_target,
      target_id,
      operation_details = {},
      idempotency_key = null,
      ip_address = null,
      user_agent = null,
      is_critical_operation = null // 允许覆盖默认判断
    } = params
    const { transaction = null } = options

    // 判断是否关键操作（显式指定 > 枚举判断）
    const isCritical =
      is_critical_operation !== null ? is_critical_operation : isCriticalOperation(operation_type)

    // 映射到logOperation的参数格式
    return this.logOperation({
      operator_id: admin_id,
      operation_type,
      target_type: operation_target,
      target_id: target_id || 0,
      action: operation_type,
      before_data: null,
      after_data: operation_details,
      reason: operation_details.reason || null,
      idempotency_key, // 直接传递，logOperation 会检查关键操作是否缺少
      ip_address,
      user_agent,
      transaction,
      is_critical_operation: isCritical
    })
  }

  /**
   * 记录积分增加操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.user_id - 用户ID
   * @param {number} params.transaction_id - 资产交易记录ID（作为审计 target_id，决策10）
   * @param {number} params.before_points - 操作前积分
   * @param {number} params.after_points - 操作后积分
   * @param {number} params.points_amount - 积分数量
   * @param {string} params.reason - 操作原因
   * @param {string} params.idempotency_key - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logPointsAdd(params) {
    const {
      operator_id,
      user_id,
      transaction_id, // 决策10：target_id 永远指向业务记录主键
      before_points,
      after_points,
      points_amount,
      reason,
      idempotency_key,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'points_adjust',
      target_type: 'AssetTransaction', // 决策10：指向资产交易记录
      target_id: transaction_id, // 决策10：使用业务记录主键
      action: 'add',
      before_data: {
        user_id,
        available_points: before_points
      },
      after_data: {
        user_id,
        available_points: after_points
      },
      reason: reason || `增加积分${points_amount}分（用户${user_id}）`,
      idempotency_key,
      transaction
    })
  }

  /**
   * 记录积分消费操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.user_id - 用户ID
   * @param {number} params.transaction_id - 资产交易记录ID（作为审计 target_id，决策10）
   * @param {number} params.before_points - 操作前积分
   * @param {number} params.after_points - 操作后积分
   * @param {number} params.points_amount - 积分数量
   * @param {string} params.reason - 操作原因
   * @param {string} params.idempotency_key - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logPointsConsume(params) {
    const {
      operator_id,
      user_id,
      transaction_id, // 决策10：target_id 永远指向业务记录主键
      before_points,
      after_points,
      points_amount,
      reason,
      idempotency_key,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'points_adjust',
      target_type: 'AssetTransaction', // 决策10：指向资产交易记录
      target_id: transaction_id, // 决策10：使用业务记录主键
      action: 'consume',
      before_data: {
        user_id,
        available_points: before_points
      },
      after_data: {
        user_id,
        available_points: after_points
      },
      reason: reason || `消费积分${points_amount}分（用户${user_id}）`,
      idempotency_key,
      transaction
    })
  }

  /**
   * 记录pending积分激活操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（审核员）
   * @param {number} params.user_id - 用户ID
   * @param {number} params.transaction_id - 积分交易ID
   * @param {number} params.points_amount - 激活的积分数量
   * @param {string} params.reason - 操作原因
   * @param {string} params.idempotency_key - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logPointsActivate(params) {
    const {
      operator_id,
      user_id,
      transaction_id,
      points_amount,
      reason,
      idempotency_key,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'points_adjust',
      target_type: 'AssetTransaction', // 更新到统一资产架构
      target_id: transaction_id,
      action: 'activate',
      before_data: {
        status: 'pending',
        points_amount
      },
      after_data: {
        status: 'completed',
        points_amount
      },
      reason: reason || `激活pending积分${points_amount}分（用户${user_id}）`,
      idempotency_key,
      transaction
    })
  }

  /**
   * 记录物品使用操作
   *
   * 2026-01-20 技术债务清理：参数名统一为 name（与其他服务一致）
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.item_id - 物品ID
   * @param {string} params.name - 物品名称
   * @param {string} params.reason - 操作原因
   * @param {string} params.idempotency_key - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logInventoryUse(params) {
    const { operator_id, item_id, name, reason, idempotency_key, transaction } = params

    return this.logOperation({
      operator_id,
      operation_type: 'inventory_operation',
      target_type: 'ItemInstance', // 物品实例表
      target_id: item_id,
      action: 'use',
      before_data: {
        status: 'available'
      },
      after_data: {
        status: 'used'
      },
      reason: reason || `使用物品：${name}`,
      idempotency_key,
      transaction
    })
  }

  /**
   * 记录物品转让操作
   *
   * ⚠️ 注意：此方法已更新为使用独立的 'inventory_transfer' 操作类型
   * 用于物品转让的审计日志记录，提供更清晰的审计追溯
   *
   * 2026-01-20 技术债务清理：参数名统一为 name（与其他服务一致）
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（转让方）
   * @param {number} params.item_id - 物品ID
   * @param {number} params.from_user_id - 转让方ID
   * @param {number} params.to_user_id - 接收方ID
   * @param {string} params.name - 物品名称
   * @param {string} params.reason - 操作原因
   * @param {string} params.idempotency_key - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logInventoryTransfer(params) {
    const {
      operator_id,
      item_id,
      from_user_id,
      to_user_id,
      name,
      reason,
      idempotency_key,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'inventory_transfer', // ✅ 使用独立的物品转让审计类型（P0-4整改）
      target_type: 'ItemInstance', // 物品实例表
      target_id: item_id,
      action: 'transfer',
      before_data: {
        user_id: from_user_id
      },
      after_data: {
        user_id: to_user_id
      },
      reason: reason || `物品转让：${name}（${from_user_id} → ${to_user_id}）`,
      idempotency_key,
      transaction
    })
  }

  /**
   * 记录物品核销操作
   *
   * 2026-01-20 技术债务清理：参数名统一为 name（与其他服务一致）
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（商家）
   * @param {number} params.item_id - 物品ID
   * @param {number} params.user_id - 用户ID
   * @param {string} params.name - 物品名称
   * @param {string} params.verification_code - 核销码
   * @param {string} params.reason - 操作原因
   * @param {string} params.idempotency_key - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logInventoryVerify(params) {
    const {
      operator_id,
      item_id,
      user_id,
      name,
      verification_code,
      reason,
      idempotency_key,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'inventory_operation',
      target_type: 'ItemInstance', // 物品实例表
      target_id: item_id,
      action: 'verify',
      before_data: {
        status: 'available',
        verification_code
      },
      after_data: {
        status: 'used',
        verification_code: null
      },
      reason: reason || `核销物品：${name}（用户${user_id}）`,
      idempotency_key,
      transaction
    })
  }

  /**
   * 记录兑换审核操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（审核员）
   * @param {number} params.exchange_id - 兑换记录ID
   * @param {string} params.action - 操作动作（approve/reject）
   * @param {string} params.before_status - 审核前状态
   * @param {string} params.after_status - 审核后状态
   * @param {string} params.reason - 操作原因
   * @param {string} params.idempotency_key - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logExchangeAudit(params) {
    const {
      operator_id,
      exchange_id,
      action,
      before_status,
      after_status,
      reason,
      idempotency_key,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'exchange_audit',
      target_type: 'ExchangeRecord',
      target_id: exchange_id,
      action,
      before_data: {
        audit_status: before_status
      },
      after_data: {
        audit_status: after_status
      },
      reason,
      idempotency_key,
      transaction
    })
  }

  /**
   * 记录消费审核操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（审核员）
   * @param {number} params.consumption_id - 消费记录ID
   * @param {string} params.action - 操作动作（approve/reject）
   * @param {string} params.before_status - 审核前状态
   * @param {string} params.after_status - 审核后状态
   * @param {number} params.points_amount - 涉及积分数量
   * @param {string} params.reason - 操作原因
   * @param {string} params.idempotency_key - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logConsumptionAudit(params) {
    const {
      operator_id,
      consumption_id,
      action,
      before_status,
      after_status,
      points_amount,
      reason,
      idempotency_key,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'consumption_audit',
      target_type: 'ConsumptionRecord',
      target_id: consumption_id,
      action,
      before_data: {
        status: before_status
      },
      after_data: {
        status: after_status,
        points_awarded: points_amount
      },
      reason,
      idempotency_key,
      transaction
    })
  }

  /**
   * 记录商品配置操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.product_id - 商品ID
   * @param {string} params.action - 操作动作（create/update/delete）
   * @param {Object} params.before_data - 操作前数据
   * @param {Object} params.after_data - 操作后数据
   * @param {string} params.reason - 操作原因
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logProductConfig(params) {
    const { operator_id, product_id, action, before_data, after_data, reason, transaction } = params

    const operationTypeMap = {
      create: 'product_create',
      update: 'product_update',
      delete: 'product_delete'
    }

    return this.logOperation({
      operator_id,
      operation_type: operationTypeMap[action] || 'product_update',
      target_type: 'Product',
      target_id: product_id,
      action,
      before_data,
      after_data,
      reason,
      transaction
    })
  }

  /**
   * 记录资产调整操作（V4.5.0新增）
   *
   * @description 用于管理员资产调整路由的审计日志记录
   * @see routes/v4/console/asset-adjustment.js
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（管理员）
   * @param {number} params.user_id - 目标用户ID
   * @param {string} params.asset_code - 资产代码（POINTS/BUDGET_POINTS/DIAMOND等）
   * @param {number} params.delta_amount - 调整数量（正数=增加，负数=扣减）
   * @param {number} params.balance_before - 调整前余额
   * @param {number} params.balance_after - 调整后余额
   * @param {string} params.reason - 操作原因
   * @param {string} params.idempotency_key - 幂等键（关键操作必填）
   * @param {string} params.ip_address - IP地址（可选）
   * @param {Object} params.transaction - 事务对象（可选）
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   *
   * @example
   * await AuditLogService.logAssetAdjustment({
   *   operator_id: adminId,
   *   user_id: 12345,
   *   asset_code: 'POINTS',
   *   delta_amount: 100,
   *   balance_before: 500,
   *   balance_after: 600,
   *   reason: '客服补偿',
   *   idempotency_key: 'admin_adjust_xxx',
   *   ip_address: '192.168.1.1',
   *   transaction
   * });
   */
  static async logAssetAdjustment(params) {
    const {
      operator_id,
      user_id,
      asset_code,
      delta_amount,
      balance_before,
      balance_after,
      reason,
      idempotency_key,
      ip_address = null,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: OPERATION_TYPES.ASSET_ADJUSTMENT, // 使用统一枚举常量
      target_type: 'AccountAssetBalance',
      target_id: user_id,
      action: delta_amount > 0 ? 'add' : 'deduct',
      before_data: {
        asset_code,
        balance: balance_before
      },
      after_data: {
        asset_code,
        balance: balance_after,
        delta_amount
      },
      reason:
        reason ||
        `管理员${delta_amount > 0 ? '增加' : '扣减'}${asset_code} ${Math.abs(delta_amount)}`,
      idempotency_key,
      ip_address,
      transaction
    })
  }

  /**
   * 批量记录审计日志（用于批量操作）
   *
   * @param {Array<Object>} logItems - 日志项数组
   * @returns {Promise<Object>} 批量记录结果
   */
  static async batchLogOperation(logItems) {
    const results = {
      total: logItems.length,
      success: 0,
      failed: 0,
      errors: []
    }

    for (const item of logItems) {
      try {
        // eslint-disable-next-line no-await-in-loop -- 批量审计日志需要逐条记录，错误隔离
        await this.logOperation(item)
        results.success++
      } catch (error) {
        results.failed++
        results.errors.push({
          item,
          error: error.message
        })
      }
    }

    logger.info(
      `[审计日志] 批量记录完成: 总数=${results.total}, 成功=${results.success}, 失败=${results.failed}`
    )

    return results
  }

  /**
   * 管理员获取审计日志列表（Admin Only）
   *
   * @description 管理员查看所有审计日志，支持分页、筛选、排序
   *
   * 业务场景：
   * - 管理后台审计日志管理页面
   * - 操作追溯和审计查询
   * - 安全事件分析
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.operator_id] - 操作员ID筛选
   * @param {string} [options.operation_type] - 操作类型筛选
   * @param {string} [options.target_type] - 目标类型筛选
   * @param {number} [options.target_id] - 目标ID筛选
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='created_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 审计日志列表和分页信息
   *
   * @example
   * // 获取所有积分调整日志
   * const result = await AuditLogService.getAdminAuditLogs({
   *   operation_type: 'points_adjust',
   *   page: 1,
   *   page_size: 20
   * });
   */
  static async getAdminAuditLogs(options = {}) {
    const {
      operator_id = null,
      operation_type = null,
      target_type = null,
      target_id = null,
      start_date = null,
      end_date = null,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

    const { Op } = require('sequelize')

    logger.info('[审计日志] 管理员查询审计日志列表', {
      operator_id,
      operation_type,
      target_type,
      target_id,
      page,
      page_size
    })

    // 构建查询条件
    const whereClause = {}

    if (operator_id) {
      whereClause.operator_id = operator_id
    }

    if (operation_type) {
      whereClause.operation_type = operation_type
    }

    if (target_type) {
      // P0-5: 查询时也规范化（前端传入 PascalCase 也能查到）
      whereClause.target_type = normalizeTargetType(target_type)
    }

    if (target_id) {
      whereClause.target_id = target_id
    }

    if (start_date || end_date) {
      whereClause.created_at = {}
      if (start_date) {
        whereClause.created_at[Op.gte] = start_date
      }
      if (end_date) {
        whereClause.created_at[Op.lte] = end_date
      }
    }

    // 分页参数
    const offset = (page - 1) * page_size
    const limit = page_size

    try {
      const { count, rows } = await AdminOperationLog.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: require('../models').User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ],
        limit,
        offset,
        order: [[sort_by, sort_order]]
      })

      logger.info(
        `[审计日志] 管理员查询成功：找到${count}条日志，返回第${page}页（${rows.length}条）`
      )

      return {
        success: true,
        logs: rows,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        filters: {
          operator_id,
          operation_type,
          target_type,
          target_id,
          start_date,
          end_date
        }
      }
    } catch (error) {
      logger.error('[审计日志] 管理员查询失败:', error.message)
      throw new Error(`查询审计日志失败: ${error.message}`)
    }
  }

  /**
   * 获取操作审计日志
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.operator_id - 操作员ID
   * @param {string} filters.operation_type - 操作类型
   * @param {string} filters.target_type - 目标对象类型
   * @param {number} filters.target_id - 目标对象ID
   * @param {string} filters.start_date - 开始日期
   * @param {string} filters.end_date - 结束日期
   * @param {number} filters.limit - 每页数量（默认50）
   * @param {number} filters.offset - 偏移量（默认0）
   * @returns {Promise<Array>} 审计日志列表
   */
  static async queryAuditLogs(filters = {}) {
    const {
      operator_id = null,
      operation_type = null,
      target_type = null,
      target_id = null,
      start_date = null,
      end_date = null,
      limit = 50,
      offset = 0
    } = filters

    const whereClause = {}

    if (operator_id) {
      whereClause.operator_id = operator_id
    }

    if (operation_type) {
      whereClause.operation_type = operation_type
    }

    if (target_type) {
      // P0-5: 查询时也规范化（前端传入 PascalCase 也能查到）
      whereClause.target_type = normalizeTargetType(target_type)
    }

    if (target_id) {
      whereClause.target_id = target_id
    }

    if (start_date || end_date) {
      whereClause.created_at = {}
      if (start_date) {
        whereClause.created_at[require('sequelize').Op.gte] = start_date
      }
      if (end_date) {
        whereClause.created_at[require('sequelize').Op.lte] = end_date
      }
    }

    try {
      const logs = await AdminOperationLog.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit,
        offset,
        include: [
          {
            model: require('../models').User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      return logs
    } catch (error) {
      logger.error('[审计日志查询] 失败:', error.message)
      throw error
    }
  }

  /**
   * 根据ID获取审计日志详情
   *
   * @param {number} logId - 日志ID
   * @returns {Promise<AdminOperationLog>} 审计日志详情
   * @throws {Error} 当日志不存在时抛出错误
   */
  static async getById(logId) {
    try {
      // 验证参数
      if (!logId || isNaN(logId) || logId <= 0) {
        throw new Error('无效的日志ID')
      }

      const log = await AdminOperationLog.findByPk(logId, {
        include: [
          {
            model: require('../models').User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      if (!log) {
        throw new Error('审计日志不存在')
      }

      return log
    } catch (error) {
      logger.error(`[审计日志详情] 查询失败: log_id=${logId}, 错误=${error.message}`)
      throw error
    }
  }

  /**
   * 获取审计日志统计信息
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.operator_id - 操作员ID
   * @param {string} filters.start_date - 开始日期
   * @param {string} filters.end_date - 结束日期
   * @returns {Promise<Object>} 统计信息
   */
  static async getAuditStatistics(filters = {}) {
    const { operator_id = null, start_date = null, end_date = null } = filters

    try {
      const whereClause = {}

      if (operator_id) {
        whereClause.operator_id = operator_id
      }

      if (start_date || end_date) {
        whereClause.created_at = {}
        if (start_date) {
          whereClause.created_at[require('sequelize').Op.gte] = start_date
        }
        if (end_date) {
          whereClause.created_at[require('sequelize').Op.lte] = end_date
        }
      }

      const [total, byType, byAction] = await Promise.all([
        // 总数
        AdminOperationLog.count({ where: whereClause }),

        // 按操作类型统计
        AdminOperationLog.findAll({
          where: whereClause,
          attributes: [
            'operation_type',
            [require('sequelize').fn('COUNT', require('sequelize').col('log_id')), 'count']
          ],
          group: ['operation_type']
        }),

        // 按操作动作统计
        AdminOperationLog.findAll({
          where: whereClause,
          attributes: [
            'action',
            [require('sequelize').fn('COUNT', require('sequelize').col('log_id')), 'count']
          ],
          group: ['action']
        })
      ])

      return {
        total,
        by_operation_type: byType.map(item => ({
          operation_type: item.operation_type,
          count: parseInt(item.get('count'))
        })),
        by_action: byAction.map(item => ({
          action: item.action,
          count: parseInt(item.get('count'))
        }))
      }
    } catch (error) {
      logger.error('[审计日志统计] 失败:', error.message)
      throw error
    }
  }

  /**
   * 获取增强版审计日志统计信息（包含今日、本周等时间维度统计）
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.operator_id - 操作员ID
   * @param {string} filters.start_date - 开始日期
   * @param {string} filters.end_date - 结束日期
   * @returns {Promise<Object>} 增强版统计信息
   *
   * @note AdminOperationLog模型没有result字段，审计日志是只增不改的操作记录
   *       成功/失败统计改为按action字段分类（create/update/delete等）
   */
  static async getAuditStatisticsEnhanced(filters = {}) {
    const { operator_id = null, start_date = null, end_date = null } = filters
    const { Op } = require('sequelize')

    try {
      // 计算时间范围（北京时间）
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekStart = new Date(todayStart)
      weekStart.setDate(weekStart.getDate() - 7)

      // 构建基础查询条件
      const baseWhere = {}
      if (operator_id) {
        baseWhere.operator_id = operator_id
      }

      // 构建带日期范围的查询条件
      const rangeWhere = { ...baseWhere }
      if (start_date || end_date) {
        rangeWhere.created_at = {}
        if (start_date) {
          rangeWhere.created_at[Op.gte] = start_date
        }
        if (end_date) {
          rangeWhere.created_at[Op.lte] = end_date
        }
      }

      // 并行执行所有统计查询
      const [total, todayCount, weekCount, byType, byAction] = await Promise.all([
        // 总数（带日期范围）
        AdminOperationLog.count({ where: rangeWhere }),

        // 今日操作数
        AdminOperationLog.count({
          where: {
            ...baseWhere,
            created_at: { [Op.gte]: todayStart }
          }
        }),

        // 本周操作数
        AdminOperationLog.count({
          where: {
            ...baseWhere,
            created_at: { [Op.gte]: weekStart }
          }
        }),

        // 按操作类型统计
        AdminOperationLog.findAll({
          where: rangeWhere,
          attributes: [
            'operation_type',
            [require('sequelize').fn('COUNT', require('sequelize').col('log_id')), 'count']
          ],
          group: ['operation_type']
        }),

        // 按操作动作统计
        AdminOperationLog.findAll({
          where: rangeWhere,
          attributes: [
            'action',
            [require('sequelize').fn('COUNT', require('sequelize').col('log_id')), 'count']
          ],
          group: ['action']
        })
      ])

      /*
       * 从action统计中计算成功/失败（审计日志本身都是成功记录的操作）
       * 按照审计日志的设计，所有记录都是成功的操作记录，失败操作不会被记录
       * 这里将所有操作视为成功操作
       */
      const successCount = total
      const failedCount = 0

      return {
        // 基础统计（前端页面顶部卡片需要）
        total,
        today_count: todayCount,
        week_count: weekCount,
        success_count: successCount, // 审计日志都是成功的操作记录
        failed_count: failedCount, // 失败操作不会被记录到审计日志

        // 详细统计（图表或详细分析用）
        by_operation_type: byType.map(item => ({
          operation_type: item.operation_type,
          count: parseInt(item.get('count'))
        })),
        by_action: byAction.map(item => ({
          action: item.action,
          count: parseInt(item.get('count'))
        }))
      }
    } catch (error) {
      logger.error('[审计日志增强统计] 失败:', error.message)
      throw error
    }
  }
}

module.exports = AuditLogService
