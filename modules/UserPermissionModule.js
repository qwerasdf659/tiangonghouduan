/**
 * 用户权限管理模块 V4.0
 * 系统性解决用户权限管理问题
 * 创建时间：2025年09月12日
 */

const { User, AdminUser } = require('../models')
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
        // 查询管理员详细信息
        adminInfo = await AdminUser.findOne({
          where: { phone: user.mobile }
        })

        if (adminInfo && adminInfo.isActive()) {
          // 简化：所有活跃的admin_users记录都是管理员
          permissionLevel = this.permissionLevels.ADMIN
        } else {
          // 如果admin_users表中没有记录，但users表中is_admin=true
          permissionLevel = this.permissionLevels.ADMIN
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
        createdAt: user.registration_date
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

        // 检查或创建admin_users记录
        let adminUser = await AdminUser.findOne({
          where: { phone: targetUser.mobile }
        })

        if (!adminUser) {
          // 创建管理员记录
          const tempPassword = this.generateTempPassword()
          adminUser = await AdminUser.create(
            {
              username: `admin_${targetUser.user_id}`,
              password_hash: tempPassword,
              phone: targetUser.mobile,
              role: targetLevel === this.permissionLevels.ADMIN ? 'admin' : 'admin', // Simplified role
              status: 1
            },
            { transaction }
          )

          this.logInfo('创建管理员账户', {
            userId: targetUserId,
            adminId: adminUser.id,
            tempPassword: '已生成临时密码'
          })
        } else {
          // 更新现有管理员记录
          await adminUser.update(
            {
              role: targetLevel === this.permissionLevels.ADMIN ? 'admin' : 'admin', // Simplified role
              status: 1
            },
            { transaction }
          )
        }
      } else {
        // 降级为普通用户
        await targetUser.update({ is_admin: false }, { transaction })

        // 禁用管理员记录（不删除，保留审计记录）
        const adminUser = await AdminUser.findOne({
          where: { phone: targetUser.mobile }
        })
        if (adminUser) {
          await adminUser.update({ status: 0 }, { transaction })
        }
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

      const { mobile, username, password, role = 'admin', email } = adminData

      // 检查用户是否已存在
      let user = await User.findOne({ where: { mobile } })
      if (!user) {
        // 创建基础用户记录
        user = await User.create(
          {
            mobile,
            is_admin: true,
            status: 'active',
            registration_date: new Date()
          },
          { transaction }
        )
      } else {
        // 更新现有用户为管理员
        await user.update({ is_admin: true, status: 'active' }, { transaction })
      }

      // 创建管理员记录
      const adminUser = await AdminUser.createSecureAdmin({
        username,
        password,
        phone: mobile,
        email,
        role
      })

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

      // ✅ 使用BusinessEvent模型查询权限审计日志
      const { BusinessEvent } = require('../models')
      const offset = (page - 1) * limit

      // 构建查询条件 - 查询system_operation类型的业务事件
      const eventWhereClause = {
        event_type: 'system_operation',
        ...whereClause
      }

      // 查询权限相关的系统操作日志
      const { count, rows } = await BusinessEvent.findAndCountAll({
        where: eventWhereClause,
        limit,
        offset,
        order: [['created_at', 'DESC']],
        include: [
          {
            model: require('../models').User,
            as: 'user',
            attributes: ['user_id', 'mobile', 'nickname']
          }
        ]
      })

      const auditLogs = {
        total: count,
        page,
        limit,
        data: rows.map(event => ({
          id: event.id,
          operator: event.user
            ? {
              id: event.user.id,
              phone: event.user.mobile,
              nickname: event.user.nickname
            }
            : null,
          action: event.event_data?.action || 'unknown',
          resource: event.event_data?.resource || 'unknown',
          details: event.event_data?.details || '',
          ip_address: event.event_data?.ip_address || 'unknown',
          user_agent: event.event_data?.user_agent || 'unknown',
          created_at: event.created_at,
          status: event.status
        }))
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
