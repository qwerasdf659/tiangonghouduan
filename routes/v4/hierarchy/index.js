/**
 * 层级权限管理路由 - 餐厅积分抽奖系统 V4.0 统一引擎架构
 * 业务场景：管理区域负责人→业务经理→业务员三级层级关系和权限操作
 * 创建时间：2025年11月07日
 *
 * API路径前缀：/api/v4/hierarchy
 *
 * 核心接口：
 * - POST /api/v4/hierarchy/create - 创建层级关系
 * - GET /api/v4/hierarchy/subordinates/:userId - 查询所有下级
 * - POST /api/v4/hierarchy/deactivate - 批量停用权限
 * - POST /api/v4/hierarchy/activate - 批量激活权限
 * - GET /api/v4/hierarchy/stats/:userId - 获取层级统计
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
/**
 * 🏗️ 创建用户层级关系
 *
 * **完整路径**：POST /api/v4/hierarchy/create
 *
 * **业务场景**：
 * - 区域负责人添加业务经理
 * - 业务经理添加业务员并分配到门店
 *
 * **权限要求**：需要管理员权限（区域负责人或业务经理）
 *
 * **请求体**：
 * ```json
 * {
 *   "user_id": 20,              // 要添加的用户ID（必需）
 *   "superior_user_id": 10,     // 上级用户ID（必需，顶级区域负责人可为null）
 *   "role_id": 1,               // 角色ID（必需）
 *   "store_id": 5               // 门店ID（可选，仅业务员需要）
 * }
 * ```
 *
 * **响应示例**：
 * ```json
 * {
 *   "success": true,
 *   "hierarchy": {
 *     "hierarchy_id": 1,
 *     "user_id": 20,
 *     "superior_user_id": 10,
 *     "role_id": 1,
 *     "store_id": 5,
 *     "is_active": true
 *   },
 *   "message": "层级关系创建成功"
 * }
 * ```
 */
router.post('/create', authenticateToken, async (req, res) => {
  // 🔄 通过 ServiceManager 获取 HierarchyManagementService（符合TR-005规范）
  const HierarchyManagementService = req.app.locals.services.getService('hierarchyManagement')

  const { user_id, superior_user_id, role_id, store_id } = req.body

  // 参数验证
  if (!user_id || !role_id) {
    return res.apiError('缺少必需参数：user_id 和 role_id', 'MISSING_REQUIRED_PARAMS', null, 400)
  }

  const result = await HierarchyManagementService.createHierarchy(
    user_id,
    superior_user_id,
    role_id,
    store_id
  )

  return res.apiSuccess(result, '层级关系创建成功')
})

/**
 * 🔍 查询用户的所有下级
 *
 * **完整路径**：GET /api/v4/hierarchy/subordinates/:userId
 *
 * **业务场景**：
 * - 区域负责人查看所有业务经理和业务员
 * - 业务经理查看所有业务员
 *
 * **权限要求**：只能查询自己或自己下级的信息
 *
 * **路径参数**：
 * - userId: 用户ID（数字）
 *
 * **查询参数**：
 * - include_inactive: 是否包含已停用的下级（true/false，默认false）
 *
 * **响应示例**：
 * ```json
 * {
 *   "success": true,
 *   "count": 10,
 *   "subordinates": [
 *     {
 *       "user_id": 20,
 *       "user": { "user_id": 20, "mobile": "13800138001", "nickname": "张三" },
 *       "role": { "role_id": 1, "role_name": "sales_staff", "role_level": 40 }
 *     }
 *   ]
 * }
 * ```
 */
router.get('/subordinates/:userId', authenticateToken, async (req, res) => {
  // 🔄 通过 ServiceManager 获取 HierarchyManagementService（符合TR-005规范）
  const HierarchyManagementService = req.app.locals.services.getService('hierarchyManagement')

  const { userId } = req.params
  const { include_inactive } = req.query

  // 权限验证：只能查询自己或自己下级的信息
  const canView = await HierarchyManagementService.canManageUser(req.user.user_id, parseInt(userId))

  if (!canView && req.user.user_id !== parseInt(userId)) {
    return res.apiError('无权限查看该用户的下级信息', 'PERMISSION_DENIED', null, 403)
  }

  const subordinates = await HierarchyManagementService.getAllSubordinates(
    parseInt(userId),
    include_inactive === 'true'
  )

  return res.apiSuccess(
    {
      count: subordinates.length,
      subordinates
    },
    '查询下级成功'
  )
})

/**
 * 🚫 批量停用用户权限
 *
 * **完整路径**：POST /api/v4/hierarchy/deactivate
 *
 * **业务场景**：
 * - 业务经理离职：可选择停用其本人及所有下级业务员
 * - 业务员违规：临时停用其权限
 *
 * **权限要求**：需要管理权限（只能停用自己的下级）
 *
 * **安全设计**：默认仅停用目标用户本人，不自动批量停用下级（防止误操作）
 *
 * **请求体**：
 * ```json
 * {
 *   "target_user_id": 20,           // 目标用户ID（必需）
 *   "reason": "业务员离职",          // 停用原因（必需）
 *   "include_subordinates": false   // 是否同时停用所有下级（可选，默认false）
 * }
 * ```
 *
 * **响应示例**：
 * ```json
 * {
 *   "success": true,
 *   "deactivated_count": 1,
 *   "deactivated_users": [20],
 *   "message": "成功停用1个用户的权限"
 * }
 * ```
 */
router.post('/deactivate', authenticateToken, async (req, res) => {
  // 🔄 通过 ServiceManager 获取 HierarchyManagementService（符合TR-005规范）
  const HierarchyManagementService = req.app.locals.services.getService('hierarchyManagement')

  const { target_user_id, reason, include_subordinates = false } = req.body

  // 参数验证
  if (!target_user_id) {
    return res.apiError('缺少必需参数：target_user_id', 'MISSING_REQUIRED_PARAMS', null, 400)
  }

  if (!reason) {
    return res.apiError('请提供停用原因', 'MISSING_REASON', null, 400)
  }

  const result = await HierarchyManagementService.batchDeactivatePermissions(
    target_user_id,
    req.user.user_id,
    reason,
    include_subordinates
  )

  return res.apiSuccess(result, '批量停用权限成功')
})

/**
 * ✅ 批量激活用户权限
 *
 * **完整路径**：POST /api/v4/hierarchy/activate
 *
 * **业务场景**：
 * - 业务员调动回归：重新激活其权限
 * - 临时禁用解除：恢复业务员权限
 *
 * **权限要求**：需要管理权限（只能激活自己的下级）
 *
 * **请求体**：
 * ```json
 * {
 *   "target_user_id": 20,           // 目标用户ID（必需）
 *   "include_subordinates": false   // 是否同时激活所有下级（可选，默认false）
 * }
 * ```
 *
 * **响应示例**：
 * ```json
 * {
 *   "success": true,
 *   "activated_count": 1,
 *   "activated_users": [20],
 *   "message": "成功激活1个用户的权限"
 * }
 * ```
 */
router.post('/activate', authenticateToken, async (req, res) => {
  // 🔄 通过 ServiceManager 获取 HierarchyManagementService（符合TR-005规范）
  const HierarchyManagementService = req.app.locals.services.getService('hierarchyManagement')

  const { target_user_id, include_subordinates = false } = req.body

  // 参数验证
  if (!target_user_id) {
    return res.apiError('缺少必需参数：target_user_id', 'MISSING_REQUIRED_PARAMS', null, 400)
  }

  const result = await HierarchyManagementService.batchActivatePermissions(
    target_user_id,
    req.user.user_id,
    include_subordinates
  )

  return res.apiSuccess(result, '批量激活权限成功')
})

/**
 * 📊 获取用户层级统计信息
 *
 * **完整路径**：GET /api/v4/hierarchy/stats/:userId
 *
 * **业务场景**：
 * - 区域负责人查看其管理的业务经理和业务员数量
 * - 业务经理查看其管理的业务员数量
 *
 * **权限要求**：只能查询自己或自己下级的统计信息
 *
 * **路径参数**：
 * - userId: 用户ID（数字）
 *
 * **响应示例**：
 * ```json
 * {
 *   "success": true,
 *   "stats": {
 *     "total_subordinates": 15,
 *     "direct_subordinates": 5,
 *     "stats_by_role": {
 *       "business_manager": { "count": 5, "users": [...] },
 *       "sales_staff": { "count": 10, "users": [...] }
 *     }
 *   }
 * }
 * ```
 */
router.get('/stats/:userId', authenticateToken, async (req, res) => {
  // 🔄 通过 ServiceManager 获取 HierarchyManagementService（符合TR-005规范）
  const HierarchyManagementService = req.app.locals.services.getService('hierarchyManagement')

  const { userId } = req.params

  // 权限验证
  const canView = await HierarchyManagementService.canManageUser(req.user.user_id, parseInt(userId))

  if (!canView && req.user.user_id !== parseInt(userId)) {
    return res.apiError('无权限查看该用户的统计信息', 'PERMISSION_DENIED', null, 403)
  }

  const stats = await HierarchyManagementService.getHierarchyStats(parseInt(userId))

  return res.apiSuccess({ stats }, '获取层级统计成功')
})

module.exports = router
