/**
 * 活动权限管理API - V4.0 极简版
 * 功能：管理员为用户分配/撤销抽奖活动权限
 * 设计原则：复用现有UUID角色系统，零技术债务
 * 创建时间：2025年10月02日
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const { User, Role, UserRole } = require('../../../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * POST /api/v4/unified-engine/admin/campaign-permissions/assign
 * 为用户分配活动权限
 *
 * @description 通过为用户分配活动角色(campaign_X)来授予活动参与权限
 * @access 管理员
 */
router.post('/assign', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, campaign_id } = req.body
    const admin_id = req.user.user_id

    // 参数验证
    if (!user_id || !campaign_id) {
      return res.apiError('缺少必需参数：user_id 或 campaign_id', 'MISSING_PARAMS', {}, 400)
    }

    // 验证用户存在且状态正常
    const user = await User.findOne({
      where: { user_id, status: 'active' },
      attributes: ['user_id', 'mobile', 'nickname']
    })

    if (!user) {
      return res.apiError('用户不存在或已禁用', 'USER_NOT_FOUND', { user_id }, 404)
    }

    // 查找活动对应的角色
    const roleName = `campaign_${campaign_id}`
    const role = await Role.findOne({
      where: { role_name: roleName, is_active: true }, // ✅ 修复: 使用role_name
      attributes: ['role_id', 'role_uuid', 'role_name', 'description']
    })

    if (!role) {
      return res.apiError(
        `活动角色不存在：${roleName}。请先运行 node scripts/create_campaign_roles.js 初始化活动角色`,
        'CAMPAIGN_ROLE_NOT_FOUND',
        { campaign_id, role_name: roleName }, // ✅ 修复: 使用role_name
        404
      )
    }

    // 检查是否已分配
    const existing = await UserRole.findOne({
      where: { user_id, role_id: role.role_id }
    })

    if (existing) {
      // 如果已存在但被禁用，则重新激活
      if (!existing.is_active) {
        await existing.update({
          is_active: true,
          assigned_by: admin_id,
          assigned_at: BeijingTimeHelper.createDatabaseTime()
        })

        console.log(`🔄 [CampaignPermission] 重新激活权限：user_id=${user_id}, campaign_id=${campaign_id}`)

        return res.apiSuccess({
          user: {
            user_id: user.user_id,
            mobile: user.mobile,
            nickname: user.nickname
          },
          campaign: {
            campaign_id: parseInt(campaign_id),
            role_name: role.role_name
          },
          action: 'reactivated',
          assigned_by: admin_id
        }, '活动权限已重新激活', 'ASSIGN_SUCCESS')
      }

      return res.apiError(
        '用户已拥有此活动权限',
        'ALREADY_ASSIGNED',
        { user_id, campaign_id },
        400
      )
    }

    // 创建新的权限关联
    const newUserRole = await UserRole.create({
      user_id,
      role_id: role.role_id,
      is_active: true,
      assigned_by: admin_id,
      assigned_at: BeijingTimeHelper.createDatabaseTime()
    })

    console.log(`✅ [CampaignPermission] 分配成功：user_id=${user_id}, campaign_id=${campaign_id}, role_id=${role.role_id}`)

    return res.apiSuccess({
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname
      },
      campaign: {
        campaign_id: parseInt(campaign_id),
        role_name: role.role_name
      },
      action: 'created',
      assigned_by: admin_id,
      assigned_at: newUserRole.assigned_at
    }, '活动权限分配成功', 'ASSIGN_SUCCESS')
  } catch (error) {
    console.error('❌ [CampaignPermission] 分配失败:', error)
    return res.apiError(error.message, 'ASSIGN_ERROR', {}, 500)
  }
})

/**
 * DELETE /api/v4/unified-engine/admin/campaign-permissions/revoke
 * 撤销用户的活动权限
 *
 * @description 通过禁用用户的活动角色来撤销活动参与权限（软删除）
 * @access 管理员
 */
router.delete('/revoke', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, campaign_id } = req.body
    const admin_id = req.user.user_id

    // 参数验证
    if (!user_id || !campaign_id) {
      return res.apiError('缺少必需参数：user_id 或 campaign_id', 'MISSING_PARAMS', {}, 400)
    }

    // 查找活动对应的角色
    const roleName = `campaign_${campaign_id}`
    const role = await Role.findOne({
      where: { role_name: roleName, is_active: true }, // ✅ 修复: 使用role_name
      attributes: ['role_id', 'role_name']
    })

    if (!role) {
      return res.apiError('活动角色不存在', 'CAMPAIGN_ROLE_NOT_FOUND', { role_name: roleName }, 404) // ✅ 修复: 使用role_name
    }

    // 查找并禁用用户角色关联
    const userRole = await UserRole.findOne({
      where: { user_id, role_id: role.role_id, is_active: true }
    })

    if (!userRole) {
      return res.apiError(
        '用户没有此活动权限或权限已被撤销',
        'PERMISSION_NOT_FOUND',
        { user_id, campaign_id },
        404
      )
    }

    // 软删除（设置为inactive）
    await userRole.update({ is_active: false })

    console.log(`🗑️ [CampaignPermission] 撤销成功：user_id=${user_id}, campaign_id=${campaign_id}`)

    return res.apiSuccess({
      user_id: parseInt(user_id),
      campaign_id: parseInt(campaign_id),
      role_name: role.role_name,
      revoked_at: BeijingTimeHelper.createDatabaseTime(),
      revoked_by: admin_id
    }, '活动权限撤销成功', 'REVOKE_SUCCESS')
  } catch (error) {
    console.error('❌ [CampaignPermission] 撤销失败:', error)
    return res.apiError(error.message, 'REVOKE_ERROR', {}, 500)
  }
})

/**
 * GET /api/v4/unified-engine/admin/campaign-permissions/list
 * 查询活动权限分配记录
 *
 * @description 查询用户的活动权限列表，支持按user_id或campaign_id筛选
 * @access 管理员
 * @query user_id - 用户ID（可选）
 * @query campaign_id - 活动ID（可选）
 * @query limit - 返回数量限制（默认50）
 */
router.get('/list', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, campaign_id, limit = 50 } = req.query

    // 构建查询条件
    const whereClause = { is_active: true }
    if (user_id) {
      whereClause.user_id = parseInt(user_id)
    }

    // 构建角色查询条件
    const roleWhereClause = { is_active: true }
    if (campaign_id) {
      roleWhereClause.role_name = `campaign_${campaign_id}` // ✅ 修复: 使用role_name
    } else {
      // 只查询活动相关的角色（role_name以campaign_开头）
      roleWhereClause.role_name = { [Op.like]: 'campaign_%' } // ✅ 修复: 使用role_name
    }

    // 查询权限分配记录
    const permissions = await UserRole.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname', 'status'],
          required: true
        },
        {
          model: Role,
          as: 'role',
          where: roleWhereClause,
          attributes: ['role_id', 'role_name', 'description'], // ✅ 修复: 移除role_code
          required: true
        }
      ],
      order: [['assigned_at', 'DESC']],
      limit: Math.min(parseInt(limit), 100) // 最大100条
    })

    // 格式化返回数据
    const formattedData = permissions.map(perm => {
      // 从role_name中提取campaign_id（格式：campaign_2 → 2）
      const extractedCampaignId = parseInt(perm.role.role_name.replace('campaign_', '')) // ✅ 修复: 使用role_name

      return {
        permission_id: perm.id,
        user: {
          user_id: perm.user.user_id,
          mobile: perm.user.mobile,
          nickname: perm.user.nickname,
          status: perm.user.status
        },
        campaign: {
          campaign_id: extractedCampaignId,
          campaign_name: perm.role.role_name.replace('权限', ''), // "春节活动权限" → "春节活动"
          role_name: perm.role.role_name // ✅ 修复: 使用role_name
        },
        assigned_at: perm.assigned_at,
        assigned_by: perm.assigned_by,
        is_active: perm.is_active
      }
    })

    console.log(`📋 [CampaignPermission] 查询权限列表：找到${formattedData.length}条记录`)

    return res.apiSuccess({
      permissions: formattedData,
      total: formattedData.length,
      filters: {
        user_id: user_id ? parseInt(user_id) : null,
        campaign_id: campaign_id ? parseInt(campaign_id) : null
      }
    }, '查询成功', 'LIST_SUCCESS')
  } catch (error) {
    console.error('❌ [CampaignPermission] 查询失败:', error)
    return res.apiError(error.message, 'LIST_ERROR', {}, 500)
  }
})

/**
 * GET /api/v4/unified-engine/admin/campaign-permissions/check
 * 检查用户是否拥有某个活动权限
 *
 * @description 快速检查用户权限，用于调试和验证
 * @access 管理员
 * @query user_id - 用户ID（必需）
 * @query campaign_id - 活动ID（必需）
 */
router.get('/check', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, campaign_id } = req.query

    if (!user_id || !campaign_id) {
      return res.apiError('缺少必需参数：user_id 或 campaign_id', 'MISSING_PARAMS', {}, 400)
    }

    // 查找活动角色
    const roleName = `campaign_${campaign_id}`
    const role = await Role.findOne({
      where: { role_name: roleName, is_active: true } // ✅ 修复: 使用role_name
    })

    if (!role) {
      return res.apiError('活动角色不存在', 'CAMPAIGN_ROLE_NOT_FOUND', { role_name: roleName }, 404) // ✅ 修复: 使用role_name
    }

    // 检查用户是否有该角色
    const userRole = await UserRole.findOne({
      where: {
        user_id: parseInt(user_id),
        role_id: role.role_id,
        is_active: true
      }
    })

    const hasPermission = !!userRole

    console.log(`🔍 [CampaignPermission] 权限检查：user_id=${user_id}, campaign_id=${campaign_id}, result=${hasPermission}`)

    return res.apiSuccess({
      user_id: parseInt(user_id),
      campaign_id: parseInt(campaign_id),
      has_permission: hasPermission,
      role_name: hasPermission ? role.role_name : null,
      assigned_at: hasPermission ? userRole.assigned_at : null
    }, hasPermission ? '用户拥有此活动权限' : '用户没有此活动权限', 'CHECK_SUCCESS')
  } catch (error) {
    console.error('❌ [CampaignPermission] 检查失败:', error)
    return res.apiError(error.message, 'CHECK_ERROR', {}, 500)
  }
})

module.exports = router
