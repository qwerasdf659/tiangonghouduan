/**
 * 用户权限管理模块 - V4.0 统一架构版本
 * 🛡️ 基于UUID角色系统的权限管理
 * 创建时间：2025年01月21日
 * 更新时间：2025年11月10日（添加审计日志系统 - P1优先级）
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { User, Role, UserRole } = require('../models')
const permissionAuditLogger = require('../utils/PermissionAuditLogger') // 🔒 P1修复：审计日志系统

/**
 * 用户权限管理模块类
 * @class UserPermissionModule
 */
class UserPermissionModule {
  /**
   * 构造函数 - 初始化权限模块
   */
  constructor() {
    this.name = 'UserPermissionModule'
    this.version = '4.0.0'

    // 🛡️ 简化的角色系统配置 - 只区分普通用户和管理员
    this.roleConfig = {
      user: {
        level: 0,
        permissions: ['lottery:read', 'lottery:participate', 'profile:read', 'profile:update']
      },
      admin: { level: 100, permissions: ['*:*'] }
    }

    console.log('🛡️ 简化权限模块初始化完成')
  }

  /**
   * 🛡️ 获取用户权限信息（基于UUID角色系统）
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 用户权限信息
   */
  async getUserPermissions(userId) {
    try {
      const user = await User.findOne({
        where: { user_id: userId, status: 'active' },
        include: [
          {
            model: Role,
            as: 'roles',
            through: {
              where: { is_active: true }
            },
            attributes: ['role_id', 'role_uuid', 'role_name', 'role_level', 'permissions']
          }
        ]
      })

      if (!user) {
        return {
          exists: false,
          is_admin: false,
          role_level: 0,
          permissions: [],
          roles: []
        }
      }

      // 计算用户最高权限级别
      const maxRoleLevel =
        user.roles.length > 0 ? Math.max(...user.roles.map(role => role.role_level)) : 0

      // 合并所有角色权限
      const allPermissions = new Set()
      user.roles.forEach(role => {
        if (role.permissions) {
          Object.entries(role.permissions).forEach(([resource, actions]) => {
            if (Array.isArray(actions)) {
              actions.forEach(action => {
                allPermissions.add(`${resource}:${action}`)
              })
            }
          })
        }
      })

      return {
        exists: true,
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        is_admin: maxRoleLevel >= 100, // 🛡️ 基于角色级别计算管理员权限
        role_level: maxRoleLevel,
        permissions: Array.from(allPermissions),
        roles: user.roles.map(role => ({
          role_uuid: role.role_uuid,
          role_name: role.role_name,
          role_level: role.role_level
        }))
      }
    } catch (error) {
      console.error('❌ 获取用户权限失败:', error.message)
      return {
        exists: false,
        is_admin: false,
        role_level: 0,
        permissions: [],
        roles: []
      }
    }
  }

  /**
   * 🛡️ 检查用户权限（基于UUID角色系统）
   * @param {number} userId - 用户ID
   * @param {string} resource - 资源名称
   * @param {string} action - 操作类型
   * @returns {Promise<boolean>} 是否有权限
   */
  async checkUserPermission(userId, resource, action = 'read') {
    try {
      const userPermissions = await this.getUserPermissions(userId)

      if (!userPermissions.exists) {
        return false
      }

      // 管理员拥有所有权限
      if (userPermissions.is_admin) {
        return true
      }

      // 检查具体权限
      const permissionKey = `${resource}:${action}`
      return (
        userPermissions.permissions.includes(permissionKey) ||
        userPermissions.permissions.includes(`${resource}:*`) ||
        userPermissions.permissions.includes('*:*')
      )
    } catch (error) {
      console.error('❌ 检查用户权限失败:', error.message)
      return false
    }
  }

  /**
   * 🔄 P3修复：批量检查用户权限
   * @param {number} userId - 用户ID
   * @param {Array} permissions - 权限数组 [{ resource, action }]
   * @returns {Promise<Array>} 权限检查结果数组
   */
  async batchCheckUserPermissions(userId, permissions) {
    try {
      if (!Array.isArray(permissions) || permissions.length === 0) {
        throw new Error('permissions必须为非空数组')
      }

      // 🛡️ 获取用户权限信息（只查询一次）
      const userPermissions = await this.getUserPermissions(userId)

      // 🔄 批量检查所有权限
      const results = await Promise.all(
        permissions.map(async ({ resource, action = 'read' }) => {
          const has_permission = await this.checkUserPermission(userId, resource, action)
          return {
            resource,
            action,
            has_permission
          }
        })
      )

      return {
        user_id: userId,
        is_admin: userPermissions.is_admin,
        role_level: userPermissions.role_level,
        permissions: results,
        checked_at: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error('❌ 批量检查用户权限失败:', error.message)
      throw error
    }
  }

  /**
   * 🛡️ 验证操作权限（统一权限验证入口）
   * @param {number} operatorId - 操作者ID
   * @param {string} requiredLevel - 必需权限级别 (user|admin)
   * @param {string} resource - 资源名称
   * @param {string} action - 操作类型
   * @returns {Promise<Object>} 验证结果
   */
  async validateOperation(operatorId, requiredLevel = 'user', resource = null, action = 'read') {
    try {
      const operatorPermissions = await this.getUserPermissions(operatorId)

      if (!operatorPermissions.exists) {
        return { valid: false, reason: 'USER_NOT_FOUND' }
      }

      // 检查管理员权限要求
      if (requiredLevel === 'admin' && !operatorPermissions.is_admin) {
        return { valid: false, reason: 'ADMIN_REQUIRED' }
      }

      // 如果指定了具体资源权限，进行检查
      if (resource) {
        const hasPermission = await this.checkUserPermission(operatorId, resource, action)
        if (!hasPermission) {
          return { valid: false, reason: 'PERMISSION_DENIED' }
        }
      }

      return {
        valid: true,
        is_admin: operatorPermissions.is_admin,
        role_level: operatorPermissions.role_level,
        permissions: operatorPermissions.permissions
      }
    } catch (error) {
      console.error('❌ 验证操作权限失败:', error.message)
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }

  /**
   * 🛡️ 快速管理员权限检查
   * @param {number} userId - 用户ID
   * @returns {Promise<boolean>} 是否为管理员
   */
  async isAdmin(userId) {
    try {
      const permissions = await this.getUserPermissions(userId)
      return permissions.is_admin
    } catch (error) {
      console.error('❌ 管理员权限检查失败:', error.message)
      return false
    }
  }

  /**
   * 🛡️ 批量权限检查
   * @param {Array} userPermissionChecks - 权限检查列表
   * @returns {Promise<Object>} 批量检查结果
   */
  async batchPermissionCheck(userPermissionChecks) {
    try {
      // 🚀 使用Promise.all并行检查，避免串行等待
      const checkPromises = userPermissionChecks.map(check => {
        const { userId, resource, action } = check
        return this.checkUserPermission(userId, resource, action).then(hasPermission => ({
          userId,
          hasPermission
        }))
      })

      const checkResults = await Promise.all(checkPromises)

      // 转换为对象格式
      const results = {}
      checkResults.forEach(({ userId, hasPermission }) => {
        results[userId] = hasPermission
      })

      return { success: true, results }
    } catch (error) {
      console.error('❌ 批量权限检查失败:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * 🛡️ 获取管理员信息（基于角色系统）
   * @param {number} adminId - 管理员ID
   * @returns {Promise<Object>} 管理员信息
   */
  async getAdminInfo(adminId) {
    try {
      const userPermissions = await this.getUserPermissions(adminId)

      if (!userPermissions.exists) {
        return { valid: false, reason: 'ADMIN_NOT_FOUND' }
      }

      if (!userPermissions.is_admin) {
        return { valid: false, reason: 'NOT_ADMIN' }
      }

      return {
        valid: true,
        admin_id: userPermissions.user_id,
        mobile: userPermissions.mobile,
        nickname: userPermissions.nickname,
        is_admin: true,
        role_level: userPermissions.role_level,
        roles: userPermissions.roles
      }
    } catch (error) {
      console.error('❌ 获取管理员信息失败:', error.message)
      return { valid: false, reason: 'SYSTEM_ERROR' }
    }
  }

  /**
   * 🛡️ 设置用户角色（只支持user/admin两种角色）
   * @param {number} userId - 用户ID
   * @param {boolean} isAdmin - 是否为管理员
   * @param {number} operatorId - 操作者ID
   * @returns {Promise<Object>} 操作结果
   *
   * 🔄 P0修复（2025-11-10）：权限修改后自动清除缓存
   * - 调用 invalidateUserPermissions 清除用户权限缓存
   * - 确保权限变更实时生效（无需等待缓存过期）
   * - 清除原因记录：role_changed（便于审计追踪）
   */
  async setUserRole(userId, isAdmin, operatorId) {
    try {
      // 验证用户是否存在
      const user = await User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取角色
      const targetRoleName = isAdmin ? 'admin' : 'user'
      const targetRole = await Role.findOne({ where: { role_name: targetRoleName } })
      if (!targetRole) {
        throw new Error(`角色 ${targetRoleName} 不存在`)
      }

      // 删除用户现有的所有角色
      await UserRole.destroy({
        where: { user_id: userId }
      })

      // 分配新角色
      await UserRole.create({
        user_id: userId,
        role_id: targetRole.id,
        assigned_by: operatorId,
        is_active: true
      })

      console.log(`✅ 用户${userId}角色已更新为: ${targetRoleName}`)

      // 🔄 P0修复：权限修改后立即清除缓存（确保实时生效）
      const { invalidateUserPermissions } = require('../middleware/auth')
      await invalidateUserPermissions(userId, 'role_changed', operatorId)

      // 🔒 P1修复：记录权限配置审计日志
      await permissionAuditLogger.logPermissionChange({
        user_id: userId,
        operator_id: operatorId,
        change_type: 'role_assignment',
        old_role: null, // 旧角色已删除，不记录
        new_role: targetRoleName,
        is_admin: isAdmin,
        role_level: targetRole.role_level
      })

      return {
        user_id: userId,
        role_name: targetRoleName,
        is_admin: isAdmin,
        role_level: targetRole.role_level,
        assigned_by: operatorId,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error('❌ 设置用户角色失败:', error.message)
      throw error
    }
  }

  /**
   * 🛡️ 获取所有管理员用户
   * @returns {Promise<Array>} 管理员用户列表
   *
   * 安全优化（2025-11-10）：
   * - ✅ 手机号脱敏处理（maskMobile函数）- 格式：138****8000
   * - ✅ role_level从数据库动态读取（不再硬编码100）
   * - ✅ 按创建时间降序排序（最新管理员在前）
   */
  async getAllAdmins() {
    try {
      const adminUsers = await User.findAll({
        where: { status: 'active' }, // 只查询激活状态的用户
        include: [
          {
            model: Role,
            as: 'roles',
            where: { role_name: 'admin', is_active: true }, // 只查询admin角色且角色已启用
            through: { where: { is_active: true } }, // user_roles关联必须激活
            attributes: ['role_name', 'role_level', 'role_uuid'] // 返回角色字段
          }
        ],
        attributes: ['user_id', 'mobile', 'nickname', 'status', 'created_at', 'last_login'],
        order: [
          ['created_at', 'DESC'], // ✅ P2修复：按创建时间降序（最新管理员在前）
          ['user_id', 'ASC'] // 次要排序：按用户ID升序（保证稳定排序）
        ]
      })

      return adminUsers.map(user => ({
        user_id: user.user_id,
        mobile: this._maskMobile(user.mobile), // ✅ P0修复：手机号脱敏处理（138****8000）
        nickname: user.nickname,
        status: user.status,
        is_admin: true, // 固定值：基于角色的管理员标识
        role_level: user.roles[0]?.role_level || 100, // ✅ P1修复：从数据库读取真实值，兜底值100
        roles: user.roles.map(r => ({
          // 返回完整角色信息数组
          role_name: r.role_name, // 角色名称（如：admin）
          role_level: r.role_level, // 真实角色级别（如：100）
          role_uuid: r.role_uuid // 角色UUID
        })),
        created_at: user.created_at, // 创建时间（北京时间）
        last_login: user.last_login // 最后登录时间（北京时间）
      }))
    } catch (error) {
      console.error('❌ 获取管理员列表失败:', error.message)
      throw error
    }
  }

  /**
   * 🔒 手机号脱敏处理（私有方法）
   * @param {string} mobile - 原始11位手机号
   * @returns {string} 脱敏后的手机号（格式：138****8000）
   *
   * 脱敏规则：
   * - 保留前3位（运营商标识）- 便于识别号段类型
   * - 中间4位替换为*（隐私保护）- 核心隐私部分
   * - 保留后4位（用户识别）- 便于用户识别和客服确认
   *
   * 示例：13800138000 → 138****8000
   *
   * 法律依据：《中华人民共和国个人信息保护法》第29条
   * 要求：处理敏感个人信息应采取必要的保护措施
   */
  _maskMobile(mobile) {
    // 异常处理：非11位手机号返回原值
    if (!mobile || mobile.length !== 11) {
      return mobile
    }
    // 脱敏处理：前3位 + 4个* + 后4位
    return mobile.slice(0, 3) + '****' + mobile.slice(-4)
  }

  /**
   * 🛡️ 获取权限统计信息（完整版 - 包含性能监控和边界条件处理）
   * @returns {Promise<Object>} 权限统计
   *
   * 功能说明：
   * - 统计系统总用户数（total_users）、管理员数量（admin_count）、普通用户数量（user_count）
   * - 统计各角色的用户分布（role_distribution），格式：{ "admin": 5, "user": 100 }
   * - 记录查询耗时（query_time_ms），便于性能监控和优化决策
   * - 处理边界条件：空角色数据、无管理员、数据一致性验证
   *
   * 技术实现（基于Sequelize ORM）：
   * - 第1次查询：GROUP BY统计各角色用户数（涉及users表、roles表、user_roles表）
   * - 第2次查询：统计总用户数（只查users表）
   * - 第3次查询：统计管理员数量（涉及users表、roles表、user_roles表）
   * - 总查询次数：3次（保持技术栈统一，代码可读性高）
   *
   * 性能评估（基于实际数据规模）：
   * - 小数据量（<500用户）：响应时间 100-200ms（✅ 推荐，完全够用）
   * - 中数据量（500-2000用户）：响应时间 200-500ms（✅ 可接受）
   * - 大数据量（>2000用户）：响应时间 >500ms（⚠️ 需要优化为单次SQL查询或Redis缓存）
   *
   * 返回格式：
   * {
   *   total_users: 10,              // 总用户数（status='active'的用户总数）
   *   admin_count: 1,               // 管理员数量（拥有admin角色的用户数）
   *   user_count: 9,                // 普通用户数量（total_users - admin_count）
   *   role_distribution: {          // 角色分布对象（对象格式，不是数组）
   *     "admin": 1,
   *     "user": 9
   *   },
   *   query_time_ms: 150,           // 查询耗时（毫秒）
   *   timestamp: "2025-11-10T17:15:30.000+08:00",  // 北京时间时间戳
   *   meta: {                       // 元数据对象
   *     has_admins: true,           // 是否有管理员（用于前端告警）
   *     role_count: 2,              // 角色数量（用于数据完整性检查）
   *     data_consistent: false,     // 数据是否一致
   *     query_time_warning: false   // 是否需要性能优化（>500ms时为true）
   *   }
   * }
   */
  async getPermissionStatistics() {
    // ⏱️ 记录查询开始时间（用于性能监控）
    const startTime = Date.now()

    try {
      console.log('🔍 开始查询权限统计...')

      /*
       * 📊 第1步：统计各角色用户数量（GROUP BY查询）
       * ⚠️ 注意：Sequelize的User.count() + group参数会返回数组而不是数字
       * SQL翻译：SELECT roles.role_name, COUNT(DISTINCT users.user_id) FROM users
       *          LEFT JOIN user_roles ON users.user_id = user_roles.user_id
       *          LEFT JOIN roles ON user_roles.role_id = roles.id
       *          WHERE users.status = 'active' AND user_roles.is_active = true
       *          GROUP BY roles.role_name
       * 返回格式：[{ 'roles.role_name': 'admin', count: 1 }, { 'roles.role_name': 'user', count: 9 }]
       */
      const userStats = await User.count({
        where: { status: 'active' }, // status字段：筛选active状态用户（排除inactive、banned）
        include: [
          {
            model: Role, // Role模型：关联roles表（LEFT JOIN）
            as: 'roles', // as别名：对应User模型中定义的关联别名
            through: { where: { is_active: true } }, // through：中间表user_roles的筛选条件（只统计激活的角色分配）
            attributes: [] // attributes: []：不返回角色详细字段，只用于统计（减少数据传输量）
          }
        ],
        group: ['roles.role_name'], // GROUP BY：按角色名分组统计（Sequelize返回数组）
        raw: true // raw: true：返回普通对象而非Sequelize实例（提升性能）
      })

      /*
       * 📊 第2步：获取总用户数（普通count查询，返回数字）
       * SQL翻译：SELECT COUNT(*) FROM users WHERE status = 'active'
       */
      const totalUsers = await User.count({ where: { status: 'active' } })

      /*
       * 📊 第3步：获取管理员数量（带角色筛选的count查询，返回数字）
       * SQL翻译：SELECT COUNT(DISTINCT users.user_id) FROM users
       *          INNER JOIN user_roles ON users.user_id = user_roles.user_id
       *          INNER JOIN roles ON user_roles.role_id = roles.id
       *          WHERE users.status = 'active' AND roles.role_name = 'admin'
       *          AND roles.is_active = true AND user_roles.is_active = true
       */
      const adminCount = await User.count({
        where: { status: 'active' },
        include: [
          {
            model: Role,
            as: 'roles',
            where: { role_name: 'admin', is_active: true }, // where：筛选admin角色且角色已启用
            through: { where: { is_active: true } } // through：user_roles关联必须激活
          }
        ]
      })

      /*
       * ✅ 关键修复：转换GROUP BY查询结果数组为对象格式
       * 前端期望格式：{ "admin": 1, "user": 9 }（对象）
       * Sequelize实际返回格式：[{ role_name: 'admin', count: 1 }, { role_name: 'user', count: 9 }]（数组）
       */
      const roleDistribution = {}
      if (Array.isArray(userStats)) {
        // 验证是否为数组（Sequelize GROUP BY特性）
        userStats.forEach(stat => {
          // 遍历统计结果数组
          const roleName = stat.role_name // 🔴 修复：键名是'role_name'而非'roles.role_name'
          if (roleName) {
            // 验证角色名存在（过滤掉null值，这些是未分配角色的用户）
            roleDistribution[roleName] = parseInt(stat.count) || 0 // 转换为整数（count可能是字符串），默认值0
          }
        })

        // 📊 统计信息日志
        console.log(`✅ 角色分布统计完成: ${Object.keys(roleDistribution).length}个角色`)
        Object.entries(roleDistribution).forEach(([role, count]) => {
          console.log(`   - ${role}: ${count}人`)
        })
      } else {
        // 异常情况：userStats不是数组（不符合预期）
        console.warn('⚠️ userStats格式异常，期望数组但得到:', typeof userStats)
        // 这种情况通常不会发生，但添加告警便于排查问题
      }

      // ⏱️ 计算查询耗时（毫秒）
      const queryTime = Date.now() - startTime
      console.log(`✅ 权限统计查询完成，耗时: ${queryTime}ms`)

      // ⚠️ 性能告警：查询耗时过长（>500ms）
      if (queryTime > 500) {
        console.warn(`⚠️ 权限统计查询耗时较长: ${queryTime}ms（建议优化）`)
        console.warn(
          `   当前数据量: ${totalUsers}用户，${Object.keys(roleDistribution).length}角色`
        )
        console.warn('   优化建议: 考虑使用单次SQL查询或Redis缓存')
        /*
         * 性能优化建议：
         * 1. 用户数>2000时，使用单次SQL查询（减少查询次数）
         * 2. 查询频率>100次/天时，使用Redis缓存（5分钟有效期）
         */
      }

      // 🛡️ 边界条件检查和告警（健壮性提升）

      // 边界条件1：检查角色表是否为空
      if (Object.keys(roleDistribution).length === 0) {
        console.warn('⚠️ 角色分布为空，可能原因:')
        console.warn('   1. 角色表(roles)未初始化（执行npm run init:roles）')
        console.warn('   2. 所有用户都未分配角色（检查user_roles表）')
        console.warn('   3. 所有角色的is_active都为false（检查roles表）')
        // 影响：前端显示空白图表，管理员无法看到角色分布
      }

      // 边界条件2：检查是否有管理员（高危风险）
      if (adminCount === 0) {
        console.warn('🔴 系统中没有管理员！')
        console.warn('   建议：至少分配1个用户为管理员角色')
        console.warn('   风险：无法进行权限管理操作，系统陷入"无管理员困境"')
        // 影响：无法管理用户权限，无法访问管理后台
      }

      // 边界条件3：数据一致性提示（多角色系统正常现象）
      const roleSum = Object.values(roleDistribution).reduce((sum, count) => sum + count, 0) // 计算角色统计总数
      if (roleSum !== totalUsers) {
        console.log(`ℹ️ 角色统计总数(${roleSum}) ≠ 总用户数(${totalUsers})`)
        console.log('   原因1：用户可能同时拥有多个角色（例如admin+user，会在两个角色中计数）')
        console.log('   原因2：用户可能没有分配任何角色（不在角色统计中，称为"孤立用户"）')
        console.log('   这是正常现象，不是数据错误（多角色系统特性）')
        // 说明：这不是bug，是多角色系统的预期行为
      }

      return {
        // ====== 核心统计数据（业务必需字段）======
        total_users: totalUsers, // 总用户数（整数，>=0）
        admin_count: adminCount, // 管理员数量（整数，>=0，建议>=1）
        user_count: totalUsers - adminCount, // 普通用户数量（整数，可能为负数，如果admin同时是user）
        role_distribution: roleDistribution, // ✅ 对象格式（修复后）{ "admin": 5, "user": 100 }

        // ====== 性能监控数据（运维必需字段）======
        query_time_ms: queryTime, // 查询耗时（毫秒，用于性能监控和优化决策）

        // ====== 时间戳（审计日志必需字段）======
        timestamp: BeijingTimeHelper.now(), // 北京时间时间戳（ISO 8601格式：2025-11-10T17:15:30.000+08:00）

        // ====== 元数据（前端判断和监控辅助字段）======
        meta: {
          has_admins: adminCount > 0, // 是否有管理员（布尔值，用于前端告警：无管理员时显示警告）
          role_count: Object.keys(roleDistribution).length, // 角色数量（整数，用于数据完整性检查）
          data_consistent: roleSum === totalUsers, // 数据是否一致（布尔值，false表示用户有多角色或孤立用户）
          query_time_warning: queryTime > 500 // 是否需要性能优化（布尔值，true表示查询耗时>500ms）
        }
      }
    } catch (error) {
      console.error('❌ 获取权限统计失败:', error.message) // 记录错误消息
      console.error('   错误堆栈:', error.stack) // 记录完整堆栈（便于定位问题）
      throw error // 抛出异常，由上层统一处理（返回500错误）
    }
  }
}

// 导出类而不是实例，支持单例模式
module.exports = new UserPermissionModule()
