/**
 * 管理策略（ManagementStrategy）- V4.0 统一架构版本
 *
 * 业务场景：管理员使用的抽奖控制功能，提供强制中奖、强制不中奖等管理员操作
 *
 * 核心功能：
 * - 管理员强制中奖：管理员可以为指定用户强制指定中奖奖品
 * - 管理员强制不中奖：管理员可以强制指定用户不中奖
 * - 管理员权限验证：基于UUID角色系统验证管理员权限
 * - 批量操作：支持管理员批量执行强制中奖/不中奖操作
 * - 操作日志：记录管理员操作日志，便于审计和追溯
 *
 * 🛡️ 权限系统：
 * - 基于UUID角色系统进行权限验证
 * - 使用getUserRoles()获取用户角色信息
 * - 验证用户状态（必须为active状态）
 * - 支持特定权限检查（resource + action）
 *
 * 业务流程：
 * 1. 管理员发起操作请求（forceWin/forceNoWin）
 * 2. 验证管理员权限（validateAdminPermission）
 * 3. 验证目标用户状态（User.findByPk + status检查）
 * 4. 执行操作并记录日志
 * 5. 返回操作结果
 *
 * 创建时间：2025年10月31日
 * 最后更新：2025年10月31日
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const { User } = require('../../../models')
const { getUserRoles } = require('../../../middleware/auth')
const Logger = require('../utils/Logger')

/**
 * 管理策略类
 * 职责：提供管理员抽奖控制功能，包括强制中奖、强制不中奖等操作
 * 设计模式：策略模式 - 管理员专用的抽奖策略
 */
class ManagementStrategy {
  /**
   * 构造函数 - 初始化管理策略实例
   *
   * 业务场景：创建管理策略实例，初始化日志器
   *
   * @example
   * const strategy = new ManagementStrategy()
   * // 创建实例后，可以使用forceWin、forceNoWin等方法
   */
  constructor () {
    this.logger = Logger.create('ManagementStrategy')
  }

  /**
   * 管理员强制中奖 - 使用UUID角色系统验证
   *
   * 业务场景：管理员为指定用户强制指定中奖奖品，用于测试、补偿或特殊活动
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission）
   * 2. 验证目标用户存在且状态为active
   * 3. 记录操作日志（包含管理员ID、目标用户ID、奖品ID、操作原因）
   * 4. 返回操作结果
   *
   * 🛡️ 权限要求：
   * - 管理员必须通过UUID角色系统验证
   * - 管理员状态必须为active
   * - 目标用户必须存在且状态为active
   *
   * @param {number} adminId - 管理员用户ID（执行操作的管理员）
   * @param {number} targetUserId - 目标用户ID（要强制中奖的用户）
   * @param {number} prizeId - 奖品ID（要强制中奖的奖品）
   * @param {string} [reason='管理员操作'] - 操作原因（可选，默认为'管理员操作'），用于日志记录
   * @returns {Promise<Object>} 操作结果对象
   * @returns {boolean} return.success - 操作是否成功（始终为true，失败会抛出异常）
   * @returns {string} return.result - 操作结果标识（'force_win'）
   * @returns {number} return.prize_id - 奖品ID
   * @returns {number} return.user_id - 目标用户ID
   * @returns {number} return.admin_id - 管理员ID
   * @returns {string} return.reason - 操作原因
   * @returns {string} return.timestamp - 操作时间戳（北京时间GMT+8格式）
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   * @throws {Error} 当目标用户不存在或已停用时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.forceWin(10001, 20001, 30001, '测试补偿')
   * // 返回：{ success: true, result: 'force_win', prize_id: 30001, user_id: 20001, admin_id: 10001, reason: '测试补偿', timestamp: '2025-10-31 00:14:55' }
   */
  async forceWin (adminId, targetUserId, prizeId, reason = '管理员操作') {
    try {
      // 🛡️ 验证管理员权限
      const adminValidation = await this.validateAdminPermission(adminId)
      if (!adminValidation.valid) {
        this.logError('管理员权限验证失败', {
          adminId,
          reason: adminValidation.reason
        })
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      // 验证目标用户
      const targetUser = await User.findByPk(targetUserId)
      if (!targetUser || targetUser.status !== 'active') {
        throw new Error('目标用户不存在或已停用')
      }

      this.logger.info('管理员强制中奖', {
        adminId,
        targetUserId,
        prizeId,
        reason,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        success: true,
        result: 'force_win',
        prize_id: prizeId,
        user_id: targetUserId,
        admin_id: adminId,
        reason,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('管理员强制中奖失败', { adminId, targetUserId, prizeId, error: error.message })
      throw error
    }
  }

  /**
   * 管理员强制不中奖 - 使用UUID角色系统验证
   *
   * 业务场景：管理员强制指定用户不中奖，用于测试、防刷或特殊活动
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission）
   * 2. 记录操作日志（包含管理员ID、目标用户ID、操作原因）
   * 3. 返回操作结果
   *
   * 🛡️ 权限要求：
   * - 管理员必须通过UUID角色系统验证
   * - 管理员状态必须为active
   *
   * 注意：此方法不验证目标用户状态，因为可能用于阻止未注册用户中奖
   *
   * @param {number} adminId - 管理员用户ID（执行操作的管理员）
   * @param {number} targetUserId - 目标用户ID（要强制不中奖的用户）
   * @param {string} [reason='管理员操作'] - 操作原因（可选，默认为'管理员操作'），用于日志记录
   * @returns {Promise<Object>} 操作结果对象
   * @returns {boolean} return.success - 操作是否成功（始终为true，失败会抛出异常）
   * @returns {string} return.result - 操作结果标识（'force_no_win'）
   * @returns {number} return.user_id - 目标用户ID
   * @returns {number} return.admin_id - 管理员ID
   * @returns {string} return.reason - 操作原因
   * @returns {string} return.timestamp - 操作时间戳（北京时间GMT+8格式）
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.forceNoWin(10001, 20001, '防刷保护')
   * // 返回：{ success: true, result: 'force_no_win', user_id: 20001, admin_id: 10001, reason: '防刷保护', timestamp: '2025-10-31 00:14:55' }
   */
  async forceNoWin (adminId, targetUserId, reason = '管理员操作') {
    try {
      // 🛡️ 验证管理员权限
      const adminValidation = await this.validateAdminPermission(adminId)
      if (!adminValidation.valid) {
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      this.logger.info('管理员强制不中奖', {
        adminId,
        targetUserId,
        reason,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        success: true,
        result: 'force_no_win',
        user_id: targetUserId,
        admin_id: adminId,
        reason,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('管理员强制不中奖失败', { adminId, targetUserId, error: error.message })
      throw error
    }
  }

  /**
   * 验证管理员信息 - 使用UUID角色系统
   *
   * 业务场景：验证管理员信息对象是否有效，检查管理员身份和状态
   *
   * 验证流程：
   * 1. 检查adminInfo对象和user_id字段是否存在
   * 2. 获取用户角色信息（getUserRoles）
   * 3. 验证是否为管理员（isAdmin）
   * 4. 验证用户状态（必须为active）
   *
   * @param {Object} adminInfo - 管理员信息对象
   * @param {number} adminInfo.user_id - 管理员用户ID
   * @returns {Promise<Object>} 验证结果对象
   * @returns {boolean} return.valid - 验证是否通过
   * @returns {string} return.reason - 验证失败原因（当valid为false时）
   *   - 'ADMIN_INFO_MISSING': adminInfo或user_id缺失
   *   - 'NOT_ADMIN': 用户不是管理员
   *   - 'ADMIN_INACTIVE': 管理员状态不是active
   *   - 'VALIDATION_ERROR': 验证过程发生错误
   * @returns {Object} return.admin - 管理员用户对象（当valid为true时）
   * @returns {Array} return.roles - 用户角色数组（当valid为true时）
   * @returns {boolean} return.isAdmin - 是否为管理员（当valid为true时）
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.validateAdminInfo({ user_id: 10001 })
   * if (result.valid) {
   *   console.log('管理员验证通过', result.admin)
   * } else {
   *   console.log('管理员验证失败', result.reason)
   * }
   */
  async validateAdminInfo (adminInfo) {
    try {
      if (!adminInfo || !adminInfo.user_id) {
        return { valid: false, reason: 'ADMIN_INFO_MISSING' }
      }

      // 🛡️ 获取用户角色信息
      const userRoles = await getUserRoles(adminInfo.user_id)

      if (!userRoles.isAdmin) {
        return { valid: false, reason: 'NOT_ADMIN' }
      }

      // 验证用户状态
      const admin = await User.findByPk(adminInfo.user_id)
      if (!admin || admin.status !== 'active') {
        return { valid: false, reason: 'ADMIN_INACTIVE' }
      }

      return {
        valid: true,
        admin,
        roles: userRoles.roles,
        isAdmin: userRoles.isAdmin
      }
    } catch (error) {
      this.logError('验证管理员信息失败', { adminInfo, error: error.message })
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }

  /**
   * 验证管理员权限 - 使用UUID角色系统
   *
   * 业务场景：验证管理员是否有权限执行操作，支持基础权限和特定权限检查
   *
   * 验证流程：
   * 1. 获取用户角色信息（getUserRoles）
   * 2. 验证是否为管理员（isAdmin）
   * 3. 验证用户状态（必须为active）
   * 4. 如果指定了requiredPermission，进行特定权限检查
   *
   * @param {number} adminId - 管理员用户ID
   * @param {Object|null} [requiredPermission=null] - 特定权限要求（可选，默认为null）
   * @param {string} requiredPermission.resource - 资源名称（如'lottery'）
   * @param {string} requiredPermission.action - 操作名称（如'manage'）
   * @returns {Promise<Object>} 验证结果对象
   * @returns {boolean} return.valid - 验证是否通过
   * @returns {string} return.reason - 验证失败原因（当valid为false时）
   *   - 'NOT_ADMIN': 用户不是管理员
   *   - 'ADMIN_INACTIVE': 管理员状态不是active
   *   - 'PERMISSION_DENIED': 缺少特定权限
   *   - 'VALIDATION_ERROR': 验证过程发生错误
   * @returns {Object} return.admin - 管理员用户对象（当valid为true时）
   * @returns {Array} return.roles - 用户角色数组（当valid为true时）
   * @returns {number} return.adminLevel - 管理员级别（角色中的最高级别，当valid为true时）
   *
   * @example
   * // 基础权限验证
   * const result1 = await strategy.validateAdminPermission(10001)
   * // 返回：{ valid: true, admin: {...}, roles: [...], adminLevel: 1 }
   *
   * // 特定权限验证
   * const result2 = await strategy.validateAdminPermission(10001, { resource: 'lottery', action: 'manage' })
   * // 返回：{ valid: true, admin: {...}, roles: [...], adminLevel: 1 } 或 { valid: false, reason: 'PERMISSION_DENIED' }
   */
  async validateAdminPermission (adminId, requiredPermission = null) {
    try {
      // 🛡️ 获取用户角色信息
      const userRoles = await getUserRoles(adminId)

      if (!userRoles.isAdmin) {
        return { valid: false, reason: 'NOT_ADMIN' }
      }

      // 验证用户状态
      const admin = await User.findByPk(adminId)
      if (!admin || admin.status !== 'active') {
        return { valid: false, reason: 'ADMIN_INACTIVE' }
      }

      // 如果需要特定权限，进行权限检查
      if (requiredPermission) {
        const hasPermission = await admin.hasPermission(
          requiredPermission.resource,
          requiredPermission.action
        )
        if (!hasPermission) {
          return { valid: false, reason: 'PERMISSION_DENIED' }
        }
      }

      return {
        valid: true,
        admin,
        roles: userRoles.roles,
        adminLevel: Math.max(...userRoles.roles.map(r => r.level))
      }
    } catch (error) {
      this.logError('验证管理员权限失败', { adminId, error: error.message })
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }

  /**
   * 检查管理员权限 - 使用UUID角色系统（简化版）
   *
   * 业务场景：快速检查用户是否为管理员，不返回详细信息，只返回布尔值
   *
   * 验证流程：
   * 1. 获取用户角色信息（getUserRoles）
   * 2. 验证是否为管理员（isAdmin）
   * 3. 验证用户状态（必须为active）
   *
   * 注意：此方法不进行特定权限检查，只检查基础管理员身份
   *
   * @param {number} adminId - 管理员用户ID
   * @returns {Promise<boolean>} 是否为管理员
   * @returns {boolean} true - 用户是管理员且状态为active
   * @returns {boolean} false - 用户不是管理员、状态不是active或验证过程发生错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const isAdmin = await strategy.checkAdminPermission(10001)
   * if (isAdmin) {
   *   console.log('用户是管理员')
   * } else {
   *   console.log('用户不是管理员')
   * }
   */
  async checkAdminPermission (adminId) {
    try {
      // 🛡️ 使用UUID角色系统进行权限验证
      const userRoles = await getUserRoles(adminId)

      if (!userRoles.isAdmin) {
        return false
      }

      // 验证用户状态
      const admin = await User.findByPk(adminId)
      if (!admin || admin.status !== 'active') {
        return false
      }

      return true
    } catch (error) {
      this.logError('检查管理员权限失败', { adminId, error: error.message })
      return false
    }
  }

  /**
   * 获取管理员操作日志
   *
   * 业务场景：查询管理员的操作日志，用于审计和追溯管理员操作
   *
   * 业务流程：
   * 1. 验证管理员权限（checkAdminPermission）
   * 2. 查询操作日志（当前为占位实现，返回空数组）
   * 3. 返回日志列表和分页信息
   *
   * 注意：当前为占位实现，实际日志查询逻辑需要根据业务需求实现
   *
   * @param {number} adminId - 管理员用户ID（执行查询的管理员）
   * @param {Object} [filters={}] - 查询过滤器（可选，默认为空对象）
   * @param {number} [filters.page=1] - 页码（可选，默认为1）
   * @param {number} [filters.limit=20] - 每页数量（可选，默认为20）
   * @returns {Promise<Object>} 日志查询结果对象
   * @returns {Array} return.logs - 日志数组（当前为占位实现，返回空数组）
   * @returns {number} return.total - 日志总数（当前为占位实现，返回0）
   * @returns {number} return.page - 当前页码
   * @returns {number} return.limit - 每页数量
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const logs = await strategy.getAdminOperationLog(10001, { page: 1, limit: 20 })
   * // 返回：{ logs: [], total: 0, page: 1, limit: 20 }
   */
  async getAdminOperationLog (adminId, filters = {}) {
    try {
      // 🛡️ 验证管理员权限
      const hasPermission = await this.checkAdminPermission(adminId)
      if (!hasPermission) {
        throw new Error('需要管理员权限')
      }

      // 这里可以实现具体的日志查询逻辑
      this.logger.info('获取管理员操作日志', { adminId, filters })

      return {
        logs: [],
        total: 0,
        page: filters.page || 1,
        limit: filters.limit || 20
      }
    } catch (error) {
      this.logError('获取管理员操作日志失败', { adminId, error: error.message })
      throw error
    }
  }

  /**
   * 管理员批量操作
   *
   * 业务场景：管理员批量执行强制中奖或强制不中奖操作，提高操作效率
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission，需要lottery:manage权限）
   * 2. 遍历目标用户列表，逐个执行操作
   * 3. 记录每个操作的成功或失败结果
   * 4. 记录批量操作日志（包含总数、成功数、失败数）
   * 5. 返回批量操作结果和统计信息
   *
   * 支持的操作类型：
   * - 'force_win': 强制中奖（需要target.user_id和target.prizeId）
   * - 'force_no_win': 强制不中奖（需要target.user_id）
   *
   * @param {number} adminId - 管理员用户ID（执行批量操作的管理员）
   * @param {string} operation - 操作类型（'force_win'或'force_no_win'）
   * @param {Array<Object>} targets - 目标用户数组
   * @param {number} targets[].user_id - 目标用户ID（必需）
   * @param {number} [targets[].prizeId] - 奖品ID（当operation为'force_win'时必需）
   * @param {string} [reason='管理员批量操作'] - 操作原因（可选，默认为'管理员批量操作'），用于日志记录
   * @returns {Promise<Object>} 批量操作结果对象
   * @returns {boolean} return.success - 批量操作是否成功（始终为true，失败会抛出异常）
   * @returns {string} return.operation - 操作类型
   * @returns {Array<Object>} return.results - 操作结果数组
   * @returns {Object} return.results[].target - 目标用户对象
   * @returns {Object|string} return.results[].result - 操作结果对象（成功时）或错误消息（失败时）
   * @returns {boolean} return.results[].success - 单个操作是否成功
   * @returns {Object} return.summary - 统计信息对象
   * @returns {number} return.summary.total - 总操作数
   * @returns {number} return.summary.success - 成功操作数
   * @returns {number} return.summary.failure - 失败操作数
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   * @throws {Error} 当操作类型不支持时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.batchOperation(10001, 'force_win', [
   *   { user_id: 20001, prizeId: 30001 },
   *   { user_id: 20002, prizeId: 30002 }
   * ], '活动补偿')
   * // 返回：{ success: true, operation: 'force_win', results: [...], summary: { total: 2, success: 2, failure: 0 } }
   */
  async batchOperation (adminId, operation, targets, reason = '管理员批量操作') {
    try {
      // 🛡️ 验证管理员权限
      const adminValidation = await this.validateAdminPermission(adminId, {
        resource: 'lottery',
        action: 'manage'
      })

      if (!adminValidation.valid) {
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      const results = []
      for (const target of targets) {
        try {
          let result
          switch (operation) {
          case 'force_win':
            result = await this.forceWin(adminId, target.user_id, target.prizeId, reason)
            break
          case 'force_no_win':
            result = await this.forceNoWin(adminId, target.user_id, reason)
            break
          default:
            throw new Error(`不支持的操作类型: ${operation}`)
          }
          results.push({ target, result, success: true })
        } catch (error) {
          results.push({ target, error: error.message, success: false })
        }
      }

      this.logger.info('管理员批量操作完成', {
        adminId,
        operation,
        totalTargets: targets.length,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length
      })

      return {
        success: true,
        operation,
        results,
        summary: {
          total: targets.length,
          success: results.filter(r => r.success).length,
          failure: results.filter(r => !r.success).length
        }
      }
    } catch (error) {
      this.logError('管理员批量操作失败', { adminId, operation, error: error.message })
      throw error
    }
  }

  /**
   * 记录错误日志（内部方法）
   *
   * 业务场景：统一记录错误日志，封装日志记录逻辑
   *
   * @param {string} message - 错误消息内容
   * @param {Object} data - 错误相关数据对象（如操作参数、错误详情等）
   * @returns {void} 无返回值
   *
   * @example
   * // 内部调用，无需直接使用
   * this.logError('操作失败', { adminId: 10001, error: err.message })
   */
  logError (message, data) {
    this.logger.error(message, data)
  }

  /**
   * 记录信息日志（内部方法）
   *
   * 业务场景：统一记录信息日志，封装日志记录逻辑
   *
   * @param {string} message - 信息消息内容
   * @param {Object} data - 信息相关数据对象（如操作参数、结果等）
   * @returns {void} 无返回值
   *
   * @example
   * // 内部调用，无需直接使用
   * this.logInfo('操作成功', { adminId: 10001, targetUserId: 20001 })
   */
  logInfo (message, data) {
    this.logger.info(message, data)
  }
}

module.exports = ManagementStrategy
