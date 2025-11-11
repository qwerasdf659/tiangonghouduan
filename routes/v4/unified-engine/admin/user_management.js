/**
 * 管理员用户管理路由 - V4.0 UUID角色系统版本
 * 🛡️ 权限管理：完全使用UUID角色系统，移除is_admin字段依赖
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const BeijingTimeHelper = require('../../../../utils/timeHelper')
const express = require('express')
const router = express.Router()
const { User, Role, UserRole } = require('../../../../models')
const {
  authenticateToken,
  requireAdmin,
  getUserRoles,
  invalidateUserPermissions
} = require('../../../../middleware/auth')
const { Op } = require('sequelize')

// 所有路由都需要管理员权限
router.use(authenticateToken)
router.use(requireAdmin)

/**
 * 🛡️ 获取用户列表（基于UUID角色系统）
 * GET /api/v4/admin/user_management/users
 */
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role_filter } = req.query
    // 🎯 分页安全保护：最大100条记录（管理员权限）
    const finalLimit = Math.min(parseInt(limit), 100)

    // 构建查询条件
    const whereClause = {}

    // 搜索条件
    if (search) {
      whereClause[Op.or] = [
        { mobile: { [Op.like]: `%${search}%` } },
        { nickname: { [Op.like]: `%${search}%` } }
      ]
    }

    // 基础查询
    const userQuery = {
      where: whereClause,
      attributes: [
        'user_id',
        'mobile',
        'nickname',
        'history_total_points',
        'status',
        'last_login',
        'created_at'
      ],
      limit: finalLimit,
      offset: (parseInt(page) - 1) * finalLimit,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Role,
          as: 'roles',
          through: {
            where: { is_active: true }
          },
          attributes: ['role_name', 'role_level'],
          required: false
        }
      ]
    }

    // 角色过滤
    if (role_filter) {
      userQuery.include[0].where = { role_name: role_filter }
      userQuery.include[0].required = true
    }

    const { count, rows: users } = await User.findAndCountAll(userQuery)

    // 处理用户数据，添加角色信息
    const processedUsers = users.map(user => {
      const max_role_level =
        user.roles.length > 0 ? Math.max(...user.roles.map(role => role.role_level)) : 0

      return {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        history_total_points: user.history_total_points,
        status: user.status,
        role_level: max_role_level,
        roles: user.roles.map(role => role.role_name),
        last_login: user.last_login,
        created_at: user.created_at
      }
    })

    // 返回用户列表 - 参数顺序：data第1个, message第2个
    return res.apiSuccess({
      users: processedUsers,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: count,
        total_pages: Math.ceil(count / parseInt(limit))
      }
    }, '获取用户列表成功')
  } catch (error) {
    console.error('❌ 获取用户列表失败:', error.message)
    return res.apiError('获取用户列表失败', 'GET_USERS_FAILED', null, 500)
  }
})

/**
 * 🛡️ 获取单个用户详情（基于UUID角色系统）
 * GET /api/v4/admin/user_management/users/:user_id
 */
router.get('/users/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params

    const user = await User.findOne({
      where: { user_id },
      include: [
        {
          model: Role,
          as: 'roles',
          through: {
            where: { is_active: true },
            attributes: ['assigned_at', 'assigned_by']
          },
          attributes: ['role_uuid', 'role_name', 'role_level', 'description']
        }
      ]
    })

    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
    }

    // 计算用户权限级别
    const max_role_level =
      user.roles.length > 0 ? Math.max(...user.roles.map(role => role.role_level)) : 0

    return res.apiSuccess({
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        history_total_points: user.history_total_points,
        consecutive_fail_count: user.consecutive_fail_count,
        role_level: max_role_level,
        roles: user.roles.map(role => ({
          role_uuid: role.role_uuid,
          role_name: role.role_name,
          role_level: role.role_level,
          description: role.description,
          assigned_at: role.UserRole?.assigned_at
        })),
        last_login: user.last_login,
        login_count: user.login_count,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    }, '获取用户详情成功')
  } catch (error) {
    console.error('❌ 获取用户详情失败:', error.message)
    return res.apiError('获取用户详情失败', 'GET_USER_FAILED', null, 500)
  }
})

/**
 * 🛡️ 更新用户角色（基于UUID角色系统）
 * PUT /api/v4/admin/user_management/users/:user_id/role
 */
router.put('/users/:user_id/role', async (req, res) => {
  const transaction = await User.sequelize.transaction()

  try {
    const { user_id } = req.params
    const { role_name, reason = '' } = req.body

    if (!role_name) {
      return res.apiError('角色名称不能为空', 'ROLE_NAME_REQUIRED', null, 400)
    }

    // 验证目标用户
    const targetUser = await User.findByPk(user_id, { transaction })
    if (!targetUser) {
      await transaction.rollback()
      return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
    }

    // 🛡️ 风险1修复: 验证操作者权限级别（防止低级别管理员修改高级别管理员）
    const operatorRoles = await getUserRoles(req.user.user_id)
    const operatorMaxLevel =
      operatorRoles.roles.length > 0 ? Math.max(...operatorRoles.roles.map(r => r.role_level)) : 0

    const targetUserRoles = await getUserRoles(user_id)
    const targetMaxLevel =
      targetUserRoles.roles.length > 0
        ? Math.max(...targetUserRoles.roles.map(r => r.role_level))
        : 0

    // 操作者权限必须高于目标用户，才能修改其角色
    if (operatorMaxLevel <= targetMaxLevel) {
      await transaction.rollback()
      return res.apiError(
        '权限不足：无法修改同级或更高级别用户的角色',
        'PERMISSION_DENIED',
        {
          operator_level: operatorMaxLevel,
          target_level: targetMaxLevel
        },
        403
      )
    }

    // 验证目标角色
    const targetRole = await Role.findOne({
      where: { role_name },
      transaction
    })

    if (!targetRole) {
      await transaction.rollback()
      return res.apiError('角色不存在', 'ROLE_NOT_FOUND', null, 404)
    }

    // 移除用户现有角色
    await UserRole.destroy({
      where: { user_id },
      transaction
    })

    // 分配新角色
    await UserRole.create(
      {
        user_id,
        role_id: targetRole.role_id, // 修正：使用role_id而不是id
        assigned_at: BeijingTimeHelper.createBeijingTime(),
        assigned_by: req.user.user_id,
        is_active: true
      },
      { transaction }
    )

    await transaction.commit()

    // ✅ 风险点1解决：自动清除用户权限缓存（缓存一致性保证）
    await invalidateUserPermissions(user_id, `role_change_${role_name}`)
    console.log(`🔄 [Cache] 已清除用户${user_id}权限缓存（原因: 角色变更 ${role_name}）`)

    // 获取更新后的用户角色信息（现在保证是最新数据）
    const updatedUserRoles = await getUserRoles(user_id)

    console.log(`✅ 用户角色更新成功: ${user_id} -> ${role_name} (操作者: ${req.user.user_id})`)

    return res.apiSuccess({
      user_id,
      new_role: role_name,
      new_role_level: targetRole.role_level,
      roles: updatedUserRoles.roles,
      operator_id: req.user.user_id,
      reason
    }, '用户角色更新成功')
  } catch (error) {
    // 🛡️ 风险3修复: 优化事务回滚处理（检查事务状态，避免重复回滚）
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback()
        console.log('✅ 事务已安全回滚')
      } catch (rollbackError) {
        console.error('❌ 事务回滚失败:', rollbackError.message)
      }
    }
    console.error('❌ 更新用户角色失败:', error.message)
    return res.apiError('更新用户角色失败', 'UPDATE_USER_ROLE_FAILED', null, 500)
  }
})

/**
 * 🛡️ 更新用户状态
 * PUT /api/v4/admin/user_management/users/:user_id/status
 */
router.put('/users/:user_id/status', async (req, res) => {
  try {
    const { user_id } = req.params
    const { status, reason = '' } = req.body

    if (!status || !['active', 'inactive', 'banned'].includes(status)) {
      return res.apiError('无效的用户状态', 'INVALID_STATUS', null, 400)
    }

    // 🛡️ 风险2修复: 禁止管理员修改自己的账号状态（防止误操作导致自我禁用）
    if (parseInt(user_id) === req.user.user_id) {
      return res.apiError(
        '禁止修改自己的账号状态',
        'CANNOT_MODIFY_SELF',
        { user_id, operator_id: req.user.user_id },
        403
      )
    }

    const user = await User.findByPk(user_id)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
    }

    const oldStatus = user.status

    // 更新用户状态
    await user.update({ status })

    // ✅ 风险点1解决：自动清除用户权限缓存（缓存一致性保证）
    await invalidateUserPermissions(user_id, `status_change_${oldStatus}_to_${status}`)
    console.log(
      `🔄 [Cache] 已清除用户${user_id}权限缓存（原因: 状态变更 ${oldStatus} → ${status}）`
    )

    console.log(`✅ 用户状态更新成功: ${user_id} -> ${status} (操作者: ${req.user.user_id})`)

    return res.apiSuccess({
      user_id,
      old_status: oldStatus,
      new_status: status,
      operator_id: req.user.user_id,
      reason
    }, '用户状态更新成功')
  } catch (error) {
    console.error('❌ 更新用户状态失败:', error.message)
    return res.apiError('更新用户状态失败', 'UPDATE_USER_STATUS_FAILED', null, 500)
  }
})

/**
 * 🛡️ 获取所有可用角色
 * GET /api/v4/admin/user_management/roles
 */
router.get('/roles', async (req, res) => {
  try {
    const roles = await Role.findAll({
      where: { is_active: true },
      attributes: ['role_id', 'role_uuid', 'role_name', 'role_level', 'description'],
      order: [['role_level', 'DESC']]
    })

    return res.apiSuccess({
      roles: roles.map(role => ({
        id: role.role_id, // 修正：使用role_id保持命名一致性
        role_uuid: role.role_uuid,
        role_name: role.role_name,
        role_level: role.role_level,
        description: role.description
      }))
    }, '获取角色列表成功')
  } catch (error) {
    console.error('❌ 获取角色列表失败:', error.message)
    return res.apiError('获取角色列表失败', 'GET_ROLES_FAILED', null, 500)
  }
})

module.exports = router
