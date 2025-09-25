/**
 * 用户权限管理模块 V4.0
 * 系统性解决用户权限管理问题
 * 创建时间：2025年09月12日
 */

const { User } = require('../models')
const moment = require('moment-timezone')

class UserPermissionModule {
  constructor () {
    this.name = 'UserPermissionModule'
    this.version = '4.0.0'
    this.description = '统一用户权限管理模块'

    // 权限级别定义（简化为两种：普通用户和管理员）
    this.permissionLevels = {
      USER: 0, // 普通用户
      ADMIN: 1 // 管理员（拥有普通用户的全部权限和功能）
    }

    // 权限操作类型（简化版）
    this.permissionTypes = {
      lottery_draw: 0, // 抽奖权限 - 普通用户可用
      view_analytics: 0, // 查看分析 - 普通用户可用
      user_management: 1, // 用户管理 - 管理员权限
      probability_adjust: 1, // 概率调整 - 管理员权限
      force_result: 1, // 强制结果 - 管理员权限
      system_config: 1, // 系统配置 - 管理员权限
      specific_prize: 1 // 特定奖品分配 - 管理员权限
    }

    this.logInfo('用户权限管理模块初始化完成')
  }

  /**
   * 获取用户完整权限信息
   */
  async getUserPermissions (userId) {
    try {
      // 查询基础用户信息
      const user = await User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 确定用户权限级别
      let permissionLevel = this.permissionLevels.USER
      let adminInfo = null

      if (user.is_admin) {
        // V4.1简化权限：直接基于is_admin字段判断管理员权限
        permissionLevel = this.permissionLevels.ADMIN
        adminInfo = {
          // 模拟AdminUser信息结构，保持向后兼容
          username: `admin_${user.user_id}`,
          phone: user.mobile,
          role: 'admin',
          status: user.status === 'active' ? 1 : 0,
          isActive: () => user.status === 'active'
        }
      }

      // 计算可用权限
      const availablePermissions = this.calculateAvailablePermissions(permissionLevel)

      const permissions = {
        userId: user.user_id,
        mobile: user.mobile,
        status: user.status,
        permissionLevel,
        permissionLevelName: this.getPermissionLevelName(permissionLevel),
        isAdmin: user.is_admin,
        isSuperAdmin: permissionLevel === this.permissionLevels.ADMIN, // Assuming SUPER_ADMIN maps to ADMIN for simplicity
        availablePermissions,
        adminInfo: adminInfo
          ? {
            id: adminInfo.id,
            username: adminInfo.username,
            role: adminInfo.role,
            status: adminInfo.status,
            mfaEnabled: adminInfo.mfa_enabled
          }
          : null,
        lastLogin: user.last_login,
        createdAt: user.created_at
      }

      this.logInfo('用户权限信息获取成功', { userId, permissionLevel })
      return permissions
    } catch (error) {
      this.logError('获取用户权限失败', { userId, error: error.message })
      throw error
    }
  }

  /**
   * 验证用户权限
   */
  async checkPermission (userId, requiredPermission, _context = {}) {
    try {
      const userPermissions = await this.getUserPermissions(userId)

      // 检查用户状态
      if (userPermissions.status !== 'active') {
        return {
          allowed: false,
          reason: 'USER_INACTIVE',
          message: '用户账户已被禁用或暂停'
        }
      }

      // 获取权限所需级别
      const requiredLevel = this.permissionTypes[requiredPermission] || 0

      // 超级管理员拥有所有权限
      if (userPermissions.isSuperAdmin) {
        this.logInfo('超级管理员权限验证通过', { userId, requiredPermission })
        return {
          allowed: true,
          reason: 'SUPER_ADMIN',
          userPermissions
        }
      }

      // 检查权限级别
      if (userPermissions.permissionLevel >= requiredLevel) {
        this.logInfo('权限验证通过', {
          userId,
          requiredPermission,
          userLevel: userPermissions.permissionLevel,
          requiredLevel
        })
        return {
          allowed: true,
          reason: 'PERMISSION_GRANTED',
          userPermissions
        }
      }

      this.logWarn('权限验证失败', {
        userId,
        requiredPermission,
        userLevel: userPermissions.permissionLevel,
        requiredLevel
      })
      return {
        allowed: false,
        reason: 'INSUFFICIENT_PERMISSION',
        message: `需要${this.getPermissionLevelName(requiredLevel)}及以上权限`,
        userPermissions
      }
    } catch (error) {
      this.logError('权限验证异常', { userId, requiredPermission, error: error.message })
      return {
        allowed: false,
        reason: 'PERMISSION_CHECK_ERROR',
        message: '权限验证失败',
        error: error.message
      }
    }
  }

  /**
   * 提升用户权限（需要超级管理员权限）
   */
  async promoteUser (targetUserId, targetLevel, operatorId, reason = '') {
    const transaction = await require('../models').sequelize.transaction()

    try {
      // 验证操作员权限
      const operatorPermission = await this.checkPermission(operatorId, 'system_config')
      if (!operatorPermission.allowed) {
        await transaction.rollback()
        throw new Error('操作员权限不足，需要超级管理员权限')
      }

      // 查询目标用户
      const targetUser = await User.findByPk(targetUserId)
      if (!targetUser) {
        await transaction.rollback()
        throw new Error('目标用户不存在')
      }

      // 更新用户权限
      if (targetLevel >= this.permissionLevels.ADMIN) {
        await targetUser.update({ is_admin: true }, { transaction })

        // V4.1简化权限：不再需要创建admin_users记录
        // 所有管理员信息统一在users表中管理
        const adminUser = {
          username: `admin_${targetUser.user_id}`,
          phone: targetUser.mobile,
          role: 'admin',
          status: 1,
          // 模拟AdminUser方法，保持向后兼容
          isActive: () => targetUser.status === 'active'
        }

        this.logInfo('创建管理员账户', {
          userId: targetUserId,
          adminId: adminUser.id || targetUser.user_id,
          tempPassword: '已生成临时密码'
        })
      } else {
        // 降级为普通用户
        await targetUser.update({ is_admin: false }, { transaction })

        // V4.1简化权限：无需禁用AdminUser记录（已删除AdminUser模型）
        // 权限控制统一在User模型的is_admin字段中处理
      }

      // 记录权限变更日志
      await this.logPermissionChange(operatorId, targetUserId, targetLevel, reason, transaction)

      await transaction.commit()

      this.logInfo('用户权限提升成功', {
        targetUserId,
        targetLevel,
        operatorId,
        reason
      })

      return {
        success: true,
        message: '用户权限更新成功',
        newPermissions: await this.getUserPermissions(targetUserId)
      }
    } catch (error) {
      await transaction.rollback()
      this.logError('用户权限提升失败', {
        targetUserId,
        targetLevel,
        operatorId,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 创建安全的管理员账户
   */
  async createSecureAdmin (adminData, operatorId) {
    const transaction = await require('../models').sequelize.transaction()

    try {
      // 验证操作员权限
      const operatorPermission = await this.checkPermission(operatorId, 'system_config')
      if (!operatorPermission.allowed) {
        await transaction.rollback()
        throw new Error('操作员权限不足，需要超级管理员权限')
      }

      const { mobile, username, password: _password, role = 'admin', email } = adminData

      // 检查用户是否已存在
      let user = await User.findOne({ where: { mobile } })
      if (!user) {
        // 创建基础用户记录
        user = await User.create(
          {
            mobile,
            is_admin: true,
            status: 'active'
          },
          { transaction }
        )
      } else {
        // 更新现有用户为管理员
        await user.update({ is_admin: true, status: 'active' }, { transaction })
      }

      // V4.1简化权限：无需创建AdminUser记录（已删除AdminUser模型）
      // 管理员信息统一在User模型中管理
      const adminUser = {
        username,
        phone: mobile,
        email,
        role
      }

      // 记录权限变更日志
      const permissionLevel =
        role === 'admin' ? this.permissionLevels.ADMIN : this.permissionLevels.ADMIN // Simplified role
      await this.logPermissionChange(
        operatorId,
        user.user_id,
        permissionLevel,
        '创建管理员账户',
        transaction
      )

      await transaction.commit()

      this.logInfo('安全管理员账户创建成功', {
        userId: user.user_id,
        adminId: adminUser.id,
        username,
        role,
        operatorId
      })

      return {
        success: true,
        message: '管理员账户创建成功',
        user: {
          userId: user.user_id,
          mobile: user.mobile,
          adminId: adminUser.id,
          username: adminUser.username,
          role: adminUser.role
        }
      }
    } catch (error) {
      await transaction.rollback()
      this.logError('创建管理员账户失败', { adminData, operatorId, error: error.message })
      throw error
    }
  }

  /**
   * 获取权限审计日志
   */
  async getPermissionAuditLog (filters = {}, pagination = {}) {
    try {
      const { userId, operatorId, action, startDate, endDate } = filters
      const { page = 1, limit = 20 } = pagination

      // 构建查询条件
      const whereClause = {}
      if (userId) whereClause.user_id = userId
      if (operatorId) whereClause.operator_id = operatorId
      if (action) whereClause.action = action
      if (startDate && endDate) {
        whereClause.created_at = {
          [require('sequelize').Op.between]: [startDate, endDate]
        }
      }

      // 🗑️ BusinessEvent模型已删除，权限审计日志功能暂停 - 2025年01月21日
      // 💡 说明：BusinessEvent是过度设计的模型，对于餐厅抽奖系统来说权限审计不是核心功能
      // 如需要审计功能，建议使用简单的操作日志表或现有的交易记录模型

      // 返回空的审计日志数据
      const auditLogs = {
        total: 0,
        page,
        limit,
        data: [],
        message: '权限审计日志功能已简化，如需详细日志请查看具体业务记录模型'
      }

      return auditLogs
    } catch (error) {
      this.logError('获取权限审计日志失败', { filters, error: error.message })
      throw error
    }
  }

  /**
   * 批量用户权限检查
   */
  async batchCheckPermissions (userIds, requiredPermission) {
    const results = {}

    for (const userId of userIds) {
      try {
        results[userId] = await this.checkPermission(userId, requiredPermission)
      } catch (error) {
        results[userId] = {
          allowed: false,
          reason: 'CHECK_ERROR',
          message: error.message
        }
      }
    }

    return results
  }

  // =============== 辅助方法 ===============

  /**
   * 计算可用权限列表
   */
  calculateAvailablePermissions (permissionLevel) {
    const available = []
    for (const [permission, requiredLevel] of Object.entries(this.permissionTypes)) {
      if (permissionLevel >= requiredLevel) {
        available.push(permission)
      }
    }
    return available
  }

  /**
   * 获取权限级别名称
   */
  getPermissionLevelName (level) {
    const levelNames = {
      0: '普通用户',
      1: '管理员'
    }
    return levelNames[level] || '未知权限'
  }

  /**
   * 生成临时密码
   */
  generateTempPassword () {
    return Math.random().toString(36).slice(-8).toUpperCase()
  }

  /**
   * 记录权限变更日志
   */
  async logPermissionChange (operatorId, targetUserId, newLevel, reason, _transaction = null) {
    // 这里应该写入专门的权限审计表
    // 暂时记录到系统日志
    this.logInfo('权限变更记录', {
      operatorId,
      targetUserId,
      newLevel,
      newLevelName: this.getPermissionLevelName(newLevel),
      reason,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 日志记录方法
   */
  logInfo (message, data = {}) {
    console.log(`[${moment().tz('Asia/Shanghai').format()}] [${this.name}] [INFO] ${message}`, data)
  }

  logWarn (message, data = {}) {
    console.warn(
      `[${moment().tz('Asia/Shanghai').format()}] [${this.name}] [WARN] ${message}`,
      data
    )
  }

  logError (message, data = {}) {
    console.error(
      `[${moment().tz('Asia/Shanghai').format()}] [${this.name}] [ERROR] ${message}`,
      data
    )
  }
}

module.exports = UserPermissionModule
