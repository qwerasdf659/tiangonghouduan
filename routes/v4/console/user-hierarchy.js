/**
 * 用户层级管理路由 - 管理员端
 *
 * 功能说明：
 * - 提供用户层级（区域负责人→业务经理→业务员）的管理功能
 * - 查看层级结构和下级用户
 * - 创建/激活/停用层级关系
 * - 门店分配到业务员
 *
 * 业务层级结构：
 * - 区域负责人（role_level=80）→ 业务经理（role_level=60）→ 业务员（role_level=40）
 * - 业务员关联门店（stores）
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 通过 HierarchyManagementService 处理所有层级操作
 *
 * API路径：/api/v4/console/user-hierarchy/*
 *
 * 创建时间：2026年01月09日
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const HierarchyManagementService = require('../../../services/HierarchyManagementService')
const TransactionManager = require('../../../utils/TransactionManager')
const { logger } = require('../../../utils/logger')

// 所有路由都需要管理员权限
router.use(authenticateToken)
router.use(requireAdmin)

/**
 * 获取用户层级列表
 * @route GET /api/v4/console/user-hierarchy
 *
 * @query {number} [superior_user_id] - 上级用户ID筛选（查看某用户的下级）
 * @query {string} [is_active] - 是否激活（true/false）
 * @query {number} [role_level] - 角色级别筛选（80=区域负责人, 60=业务经理, 40=业务员）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 *
 * @returns {Object} 层级关系列表和分页信息
 */
router.get('/', async (req, res) => {
  try {
    const { superior_user_id, is_active, role_level, page = 1, page_size = 20 } = req.query

    const pageNum = parseInt(page, 10) || 1
    const pageSize = parseInt(page_size, 10) || 20

    // 通过 Service 层查询层级列表（符合路由层规范）
    const { count, rows } = await HierarchyManagementService.getHierarchyList({
      superior_user_id,
      is_active: is_active !== undefined ? is_active === 'true' : undefined,
      role_level,
      page: pageNum,
      page_size: pageSize
    })

    return res.apiSuccess(
      {
        rows: rows.map(h => ({
          hierarchy_id: h.user_hierarchy_id,
          user_id: h.user_id,
          user_mobile: h.user?.mobile,
          user_nickname: h.user?.nickname,
          user_status: h.user?.status,
          superior_user_id: h.superior_user_id,
          superior_mobile: h.superior?.mobile,
          superior_nickname: h.superior?.nickname,
          role_id: h.role_id,
          role_name: h.role?.role_name,
          role_level: h.role?.role_level,
          store_id: h.store_id,
          is_active: h.is_active,
          activated_at: h.activated_at,
          deactivated_at: h.deactivated_at,
          deactivation_reason: h.deactivation_reason,
          created_at: h.created_at
        })),
        count,
        pagination: {
          page: pageNum,
          page_size: pageSize,
          total_pages: Math.ceil(count / pageSize)
        }
      },
      '获取用户层级列表成功'
    )
  } catch (error) {
    logger.error('❌ 获取用户层级列表失败:', error.message)
    return res.apiError('获取用户层级列表失败', 'GET_HIERARCHY_LIST_FAILED', null, 500)
  }
})

/**
 * 获取某用户的所有下级（递归查询）
 * @route GET /api/v4/console/user-hierarchy/:user_id/subordinates
 *
 * @param {number} user_id - 用户ID
 * @query {boolean} [include_inactive=false] - 是否包含已停用的下级
 *
 * @returns {Object} 所有下级用户列表
 */
router.get('/:user_id/subordinates', async (req, res) => {
  try {
    const { user_id } = req.params
    const { include_inactive = 'false' } = req.query

    const subordinates = await HierarchyManagementService.getAllSubordinates(
      parseInt(user_id, 10),
      include_inactive === 'true'
    )

    // 格式化返回数据
    const formattedSubordinates = subordinates.map(sub => ({
      hierarchy_id: sub.user_hierarchy_id,
      user_id: sub.user_id,
      user_mobile: sub.user?.mobile,
      user_nickname: sub.user?.nickname,
      user_status: sub.user?.status,
      role_id: sub.role_id,
      role_name: sub.role?.role_name,
      role_level: sub.role?.role_level,
      is_active: sub.is_active
    }))

    return res.apiSuccess(
      {
        parent_user_id: parseInt(user_id, 10),
        subordinates: formattedSubordinates,
        count: formattedSubordinates.length
      },
      '获取下级用户列表成功'
    )
  } catch (error) {
    logger.error('❌ 获取下级用户列表失败:', error.message)
    return res.apiError('获取下级用户列表失败', 'GET_SUBORDINATES_FAILED', null, 500)
  }
})

/**
 * 获取某用户的层级统计信息
 * @route GET /api/v4/console/user-hierarchy/:user_id/stats
 *
 * @param {number} user_id - 用户ID
 *
 * @returns {Object} 层级统计信息（总下级数、直接下级数、按角色分组统计）
 */
router.get('/:user_id/stats', async (req, res) => {
  try {
    const { user_id } = req.params

    const stats = await HierarchyManagementService.getHierarchyStats(parseInt(user_id, 10))

    return res.apiSuccess(stats, '获取层级统计信息成功')
  } catch (error) {
    logger.error('❌ 获取层级统计信息失败:', error.message)
    return res.apiError('获取层级统计信息失败', 'GET_HIERARCHY_STATS_FAILED', null, 500)
  }
})

/**
 * 创建用户层级关系
 * @route POST /api/v4/console/user-hierarchy
 *
 * @body {number} user_id - 用户ID（要建立层级关系的用户）
 * @body {number} [superior_user_id] - 上级用户ID（NULL表示顶级区域负责人）
 * @body {number} role_id - 角色ID
 * @body {number} [store_id] - 门店ID（可选，仅业务员需要）
 *
 * @returns {Object} 创建的层级关系
 */
router.post('/', async (req, res) => {
  try {
    const { user_id, superior_user_id, role_id, store_id } = req.body

    // 参数验证
    if (!user_id) {
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }
    if (!role_id) {
      return res.apiError('角色ID不能为空', 'MISSING_ROLE_ID', null, 400)
    }

    const result = await HierarchyManagementService.createHierarchy(
      parseInt(user_id, 10),
      superior_user_id ? parseInt(superior_user_id, 10) : null,
      parseInt(role_id, 10),
      store_id ? parseInt(store_id, 10) : null
    )

    if (result.success) {
      return res.apiSuccess(result.hierarchy, '创建层级关系成功', null, 201)
    } else {
      return res.apiError(
        result.message || '创建层级关系失败',
        'CREATE_HIERARCHY_FAILED',
        null,
        400
      )
    }
  } catch (error) {
    logger.error('❌ 创建层级关系失败:', error.message)
    return res.apiError('创建层级关系失败: ' + error.message, 'CREATE_HIERARCHY_FAILED', null, 500)
  }
})

/**
 * 停用用户层级权限
 * @route POST /api/v4/console/user-hierarchy/:user_id/deactivate
 *
 * @param {number} user_id - 目标用户ID
 * @body {string} reason - 停用原因
 * @body {boolean} [include_subordinates=false] - 是否同时停用所有下级
 *
 * @returns {Object} 停用结果
 */
router.post('/:user_id/deactivate', async (req, res) => {
  try {
    const { user_id } = req.params
    const { reason, include_subordinates = false } = req.body
    const operator_user_id = req.user.user_id

    // 参数验证
    if (!reason) {
      return res.apiError('停用原因不能为空', 'MISSING_REASON', null, 400)
    }

    const result = await TransactionManager.execute(
      async transaction => {
        return await HierarchyManagementService.batchDeactivatePermissions(
          parseInt(user_id, 10),
          operator_user_id,
          reason,
          include_subordinates === true || include_subordinates === 'true',
          { transaction }
        )
      },
      { description: `停用用户${user_id}层级权限` }
    )

    return res.apiSuccess(result, '停用用户权限成功')
  } catch (error) {
    logger.error('❌ 停用用户权限失败:', error.message)
    return res.apiError('停用用户权限失败: ' + error.message, 'DEACTIVATE_FAILED', null, 500)
  }
})

/**
 * 激活用户层级权限
 * @route POST /api/v4/console/user-hierarchy/:user_id/activate
 *
 * @param {number} user_id - 目标用户ID
 * @body {boolean} [include_subordinates=false] - 是否同时激活所有下级
 *
 * @returns {Object} 激活结果
 */
router.post('/:user_id/activate', async (req, res) => {
  try {
    const { user_id } = req.params
    const { include_subordinates = false } = req.body
    const operator_user_id = req.user.user_id

    const result = await TransactionManager.execute(
      async transaction => {
        return await HierarchyManagementService.batchActivatePermissions(
          parseInt(user_id, 10),
          operator_user_id,
          include_subordinates === true || include_subordinates === 'true',
          { transaction }
        )
      },
      { description: `激活用户${user_id}层级权限` }
    )

    return res.apiSuccess(result, '激活用户权限成功')
  } catch (error) {
    logger.error('❌ 激活用户权限失败:', error.message)
    return res.apiError('激活用户权限失败: ' + error.message, 'ACTIVATE_FAILED', null, 500)
  }
})

/**
 * 获取可用角色列表（用于创建层级时选择角色）
 * @route GET /api/v4/console/user-hierarchy/roles
 *
 * @returns {Array} 角色列表
 */
router.get('/roles', async (req, res) => {
  try {
    // 通过 Service 层查询角色列表（符合路由层规范）
    const roles = await HierarchyManagementService.getHierarchyRoles()

    return res.apiSuccess(
      roles.map(r => ({
        role_id: r.role_id,
        role_name: r.role_name,
        role_level: r.role_level,
        description: r.description,
        level_name: r.role_level === 80 ? '区域负责人' : r.role_level === 60 ? '业务经理' : '业务员'
      })),
      '获取角色列表成功'
    )
  } catch (error) {
    logger.error('❌ 获取角色列表失败:', error.message)
    return res.apiError('获取角色列表失败', 'GET_ROLES_FAILED', null, 500)
  }
})

module.exports = router
