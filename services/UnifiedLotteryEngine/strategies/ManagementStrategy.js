/**
 * 管理策略 - V4.0 统一架构版本
 * 🛡️ 基于UUID角色系统的管理员权限策略
 * 提供管理员使用的抽奖控制功能
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const { User } = require('../../../models')
const { getUserRoles } = require('../../../middleware/auth')
const Logger = require('../utils/Logger')

class ManagementStrategy {
  constructor () {
    this.logger = Logger.create('ManagementStrategy')
  }

  /**
   * 🛡️ 管理员强制中奖 - 使用UUID角色系统验证
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
   * 🛡️ 管理员强制不中奖 - 使用UUID角色系统验证
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
   * 🛡️ 验证管理员信息 - 使用UUID角色系统
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
   * 🛡️ 验证管理员权限 - 使用UUID角色系统
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
   * 🛡️ 检查管理员权限 - 使用UUID角色系统
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
   * 🛡️ 获取管理员操作日志
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
   * 🛡️ 管理员批量操作
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
   * 记录错误日志
   */
  logError (message, data) {
    this.logger.error(message, data)
  }

  /**
   * 记录信息日志
   */
  logInfo (message, data) {
    this.logger.info(message, data)
  }
}

module.exports = ManagementStrategy
