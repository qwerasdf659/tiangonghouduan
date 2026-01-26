/**
 * 员工管理路由 - Console 平台管理域
 *
 * @description 提供平台管理员对商家员工的管理操作 API
 *              路径：/api/v4/console/staff
 *
 * 业务场景（来自商家员工域权限体系升级方案）：
 * - Phase 3.1: 员工入职（管理员将用户绑定到门店）
 * - Phase 3.2: 员工调店（跨门店转移员工）
 * - Phase 3.3: 员工离职/禁用（解除门店绑定）
 * - Phase 3.4: 员工角色变更（staff ↔ manager）
 *
 * 权限要求：
 * - 所有接口需要 admin 角色（role_level >= 100）
 *
 * 接口清单：
 * - GET    /                       - 获取员工列表（分页、筛选）
 * - GET    /stats                  - 获取员工统计数据
 * - GET    /:store_staff_id        - 获取员工详情
 * - GET    /by-user/:user_id       - 获取用户的所有门店绑定
 * - POST   /                       - 员工入职（绑定门店）
 * - POST   /transfer               - 员工调店
 * - PUT    /:store_staff_id/role   - 变更员工角色
 * - DELETE /:store_staff_id        - 员工离职（指定门店）
 * - POST   /disable/:user_id       - 禁用员工（所有门店）
 * - POST   /enable                 - 启用员工（指定门店）
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - Phase 3 员工管理
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin, requireRole } = require('../../../middleware/auth')
const StaffManagementService = require('../../../services/StaffManagementService')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * 处理服务层错误
 *
 * @param {Error} error - 错误对象
 * @param {Object} res - Express 响应对象
 * @param {string} operation - 操作名称
 * @returns {Object} Express 响应对象
 */
function handleServiceError(error, res, operation) {
  logger.error(`❌ ${operation}失败`, { error: error.message })

  // 根据错误类型返回不同状态码
  if (error.message.includes('不存在') || error.message.includes('not found')) {
    return res.apiError(error.message, 'NOT_FOUND', null, 404)
  }

  if (
    error.message.includes('已存在') ||
    error.message.includes('重复') ||
    error.message.includes('已在')
  ) {
    return res.apiError(error.message, 'CONFLICT', null, 409)
  }

  if (
    error.message.includes('不能为空') ||
    error.message.includes('无效') ||
    error.message.includes('必须')
  ) {
    return res.apiError(error.message, 'VALIDATION_ERROR', null, 400)
  }

  if (error.message.includes('事务')) {
    return res.apiError('服务繁忙，请稍后重试', 'TRANSACTION_ERROR', null, 500)
  }

  return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
}

/*
 * =================================================================
 * 查询接口
 * =================================================================
 */

/**
 * GET / - 获取员工列表
 *
 * @description 获取员工列表，支持分页和筛选
 *
 * Query Parameters:
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20，最大100）
 * - store_id: 门店ID筛选
 * - user_id: 用户ID筛选
 * - status: 状态筛选（active/inactive/pending/deleted）
 * - role_in_store: 门店内角色筛选（staff/manager）
 * - include_deleted: 是否包含已删除记录（默认不包含，传 'true' 包含）
 *
 * @access Admin only (role_level >= 100)
 */
router.get('/', authenticateToken, requireRole(['admin', 'ops']), async (req, res) => {
  try {
    const {
      page = 1,
      page_size = 20,
      store_id,
      user_id,
      status,
      role_in_store,
      include_deleted
    } = req.query

    // 验证分页参数
    const validatedPageSize = Math.min(parseInt(page_size, 10) || 20, 100)

    const result = await StaffManagementService.getStaffList({
      page: parseInt(page, 10) || 1,
      page_size: validatedPageSize,
      store_id: store_id ? parseInt(store_id, 10) : undefined,
      user_id: user_id ? parseInt(user_id, 10) : undefined,
      status,
      role_in_store,
      include_deleted: include_deleted === 'true'
    })

    return res.apiSuccess(result, '获取员工列表成功')
  } catch (error) {
    return handleServiceError(error, res, '获取员工列表')
  }
})

/**
 * GET /stats - 获取员工统计数据
 *
 * @description 获取指定门店的员工统计数据
 *
 * Query Parameters:
 * - store_id: 门店ID（必填）
 *
 * @access Admin only (role_level >= 100)
 */
router.get('/stats', authenticateToken, requireRole(['admin', 'ops']), async (req, res) => {
  try {
    const { store_id } = req.query

    if (!store_id) {
      return res.apiError('门店ID不能为空', 'MISSING_STORE_ID', null, 400)
    }

    const storeId = parseInt(store_id, 10)
    if (isNaN(storeId)) {
      return res.apiError('门店ID格式不正确', 'INVALID_STORE_ID', null, 400)
    }

    const stats = await StaffManagementService.getStoreStaffStats(storeId)

    return res.apiSuccess(
      {
        store_id: storeId,
        ...stats
      },
      '获取员工统计成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '获取员工统计')
  }
})

/**
 * GET /by-user/:user_id - 获取用户的所有门店绑定
 *
 * @description 查询指定用户在哪些门店任职
 *
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/by-user/:user_id',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { user_id } = req.params

      if (!user_id || isNaN(parseInt(user_id, 10))) {
        return res.apiError('用户ID无效', 'INVALID_USER_ID', null, 400)
      }

      const stores = await StaffManagementService.getUserStores(parseInt(user_id, 10))

      return res.apiSuccess(
        {
          user_id: parseInt(user_id, 10),
          stores,
          store_count: stores.length
        },
        '获取用户门店列表成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '获取用户门店列表')
    }
  }
)

/**
 * GET /:store_staff_id - 获取员工详情
 *
 * @description 获取单个员工绑定记录的详细信息
 *
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/:store_staff_id',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { store_staff_id } = req.params

      if (!store_staff_id || isNaN(parseInt(store_staff_id, 10))) {
        return res.apiError('员工记录ID无效', 'INVALID_STORE_STAFF_ID', null, 400)
      }

      const staff = await StaffManagementService.getStaffDetail(parseInt(store_staff_id, 10))

      if (!staff) {
        return res.apiError('员工记录不存在', 'STAFF_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(staff, '获取员工详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取员工详情')
    }
  }
)

/*
 * =================================================================
 * 创建/写入接口
 * =================================================================
 */

/**
 * POST / - 员工入职（绑定门店）
 *
 * @description 将用户绑定到指定门店，成为该门店的员工
 *
 * Request Body:
 * - user_id: 用户ID（必填）
 * - store_id: 门店ID（必填）
 * - role_in_store: 门店内角色（staff/manager，默认 staff）
 * - notes: 备注
 *
 * @access Admin only (role_level >= 100)
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, store_id, role_in_store = 'staff', notes } = req.body
    const operator_id = req.user.user_id

    // 参数验证
    if (!user_id) {
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }

    if (!store_id) {
      return res.apiError('门店ID不能为空', 'MISSING_STORE_ID', null, 400)
    }

    if (!['staff', 'manager'].includes(role_in_store)) {
      return res.apiError('角色类型无效，必须是 staff 或 manager', 'INVALID_ROLE', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await StaffManagementService.addStaffToStore(
        {
          user_id: parseInt(user_id, 10),
          store_id: parseInt(store_id, 10),
          role_in_store,
          operator_id,
          notes
        },
        { transaction }
      )
    })

    logger.info('✅ 员工入职成功', {
      store_staff_id: result.store_staff_id,
      user_id,
      store_id,
      role_in_store,
      operator_id
    })

    return res.apiSuccess(
      {
        store_staff_id: result.store_staff_id,
        user_id: result.user_id,
        store_id: result.store_id,
        role_in_store: result.role_in_store,
        status: result.status
      },
      '员工入职成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '员工入职')
  }
})

/**
 * POST /transfer - 员工调店
 *
 * @description 将员工从一个门店转移到另一个门店
 *
 * Request Body:
 * - user_id: 用户ID（必填）
 * - from_store_id: 原门店ID（必填）
 * - to_store_id: 新门店ID（必填）
 * - notes: 调店原因
 *
 * @access Admin only (role_level >= 100)
 */
router.post('/transfer', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, from_store_id, to_store_id, notes } = req.body
    const operator_id = req.user.user_id

    // 参数验证
    if (!user_id) {
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }

    if (!from_store_id) {
      return res.apiError('原门店ID不能为空', 'MISSING_FROM_STORE_ID', null, 400)
    }

    if (!to_store_id) {
      return res.apiError('新门店ID不能为空', 'MISSING_TO_STORE_ID', null, 400)
    }

    if (parseInt(from_store_id, 10) === parseInt(to_store_id, 10)) {
      return res.apiError('原门店和新门店不能相同', 'SAME_STORE', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await StaffManagementService.transferStaff(
        {
          user_id: parseInt(user_id, 10),
          from_store_id: parseInt(from_store_id, 10),
          to_store_id: parseInt(to_store_id, 10),
          operator_id,
          notes
        },
        { transaction }
      )
    })

    logger.info('✅ 员工调店成功', {
      user_id,
      from_store_id,
      to_store_id,
      operator_id
    })

    return res.apiSuccess(
      {
        user_id,
        from_store_id,
        to_store_id,
        old_record_id: result.old_record.store_staff_id,
        new_record_id: result.new_record.store_staff_id
      },
      '员工调店成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '员工调店')
  }
})

/**
 * POST /disable/:user_id - 禁用员工（所有门店）
 *
 * @description 禁用员工在所有门店的任职状态（批量禁用）
 *
 * Request Body:
 * - reason: 禁用原因
 *
 * @access Admin only (role_level >= 100)
 */
router.post('/disable/:user_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.params
    const { reason } = req.body
    const operator_id = req.user.user_id

    if (!user_id || isNaN(parseInt(user_id, 10))) {
      return res.apiError('用户ID无效', 'INVALID_USER_ID', null, 400)
    }

    const userId = parseInt(user_id, 10)

    const result = await TransactionManager.execute(async transaction => {
      return await StaffManagementService.disableStaff(userId, operator_id, reason, { transaction })
    })

    logger.info('✅ 员工禁用成功', {
      user_id: userId,
      affected_stores: result.affected_stores,
      operator_id
    })

    return res.apiSuccess(
      {
        user_id: userId,
        affected_stores: result.affected_stores
      },
      `员工已禁用，影响 ${result.affected_stores} 个门店`
    )
  } catch (error) {
    return handleServiceError(error, res, '禁用员工')
  }
})

/**
 * POST /enable - 启用员工（指定门店）
 *
 * @description 恢复被禁用的员工在指定门店的任职状态
 *
 * Request Body:
 * - user_id: 用户ID（必填）
 * - store_id: 门店ID（必填）
 * - notes: 备注
 *
 * @access Admin only (role_level >= 100)
 */
router.post('/enable', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, store_id, notes } = req.body
    const operator_id = req.user.user_id

    if (!user_id) {
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }

    if (!store_id) {
      return res.apiError('门店ID不能为空', 'MISSING_STORE_ID', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await StaffManagementService.enableStaff(
        parseInt(user_id, 10),
        parseInt(store_id, 10),
        operator_id,
        notes,
        { transaction }
      )
    })

    logger.info('✅ 员工启用成功', {
      user_id,
      store_id,
      operator_id
    })

    return res.apiSuccess(
      {
        store_staff_id: result.store_staff_id,
        user_id: parseInt(user_id, 10),
        store_id: parseInt(store_id, 10),
        status: result.status
      },
      '员工已启用'
    )
  } catch (error) {
    return handleServiceError(error, res, '启用员工')
  }
})

/*
 * =================================================================
 * 更新接口
 * =================================================================
 */

/**
 * PUT /:store_staff_id/role - 变更员工角色
 *
 * @description 变更员工在指定门店的角色（staff ↔ manager）
 *
 * Request Body:
 * - role_in_store: 新角色（staff/manager，必填）
 * - notes: 备注
 *
 * @access Admin only (role_level >= 100)
 */
router.put('/:store_staff_id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { store_staff_id } = req.params
    const { role_in_store, notes } = req.body
    const operator_id = req.user.user_id

    if (!store_staff_id || isNaN(parseInt(store_staff_id, 10))) {
      return res.apiError('员工记录ID无效', 'INVALID_STORE_STAFF_ID', null, 400)
    }

    if (!role_in_store || !['staff', 'manager'].includes(role_in_store)) {
      return res.apiError('角色类型无效，必须是 staff 或 manager', 'INVALID_ROLE', null, 400)
    }

    // 先获取员工记录以获取 user_id 和 store_id
    const staffDetail = await StaffManagementService.getStaffDetail(parseInt(store_staff_id, 10))

    if (!staffDetail) {
      return res.apiError('员工记录不存在', 'STAFF_NOT_FOUND', null, 404)
    }

    // 执行角色变更事务（结果用于确认事务成功，响应使用 staffDetail 构建）
    await TransactionManager.execute(async transaction => {
      return await StaffManagementService.updateStaffRole(
        {
          user_id: staffDetail.user_id,
          store_id: staffDetail.store_id,
          role_in_store,
          operator_id,
          notes
        },
        { transaction }
      )
    })

    logger.info('✅ 员工角色变更成功', {
      store_staff_id,
      user_id: staffDetail.user_id,
      store_id: staffDetail.store_id,
      old_role: staffDetail.role_in_store,
      new_role: role_in_store,
      operator_id
    })

    return res.apiSuccess(
      {
        store_staff_id: parseInt(store_staff_id, 10),
        user_id: staffDetail.user_id,
        store_id: staffDetail.store_id,
        old_role: staffDetail.role_in_store,
        new_role: role_in_store
      },
      '员工角色变更成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '变更员工角色')
  }
})

/*
 * =================================================================
 * 删除接口
 * =================================================================
 */

/**
 * DELETE /:store_staff_id - 员工离职/删除
 *
 * @description 根据员工状态执行不同操作：
 *   - 在职员工（active）+ 无 force：执行离职（status → inactive）
 *   - 在职员工（active）+ force=true：强制删除（status → deleted）
 *   - 离职员工（inactive）：执行删除（status → deleted）
 *   - 已删除员工（deleted）：拒绝操作
 *
 * Query Parameters:
 *   - reason: 离职/删除原因
 *   - force: 是否强制删除（仅对 active 状态有效）
 *
 * @access Admin only (role_level >= 100)
 * @since 2026-01-26 重构：支持离职+删除双操作
 */
router.delete('/:store_staff_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { store_staff_id } = req.params
    const { reason, force } = req.query
    const operator_id = req.user.user_id

    // 参数验证
    if (!store_staff_id || isNaN(parseInt(store_staff_id, 10))) {
      return res.apiError('员工记录ID无效', 'INVALID_STORE_STAFF_ID', null, 400)
    }

    const storeStaffId = parseInt(store_staff_id, 10)

    // 获取员工记录
    const staffDetail = await StaffManagementService.getStaffDetail(storeStaffId)

    if (!staffDetail) {
      return res.apiError('员工记录不存在', 'STAFF_NOT_FOUND', null, 404)
    }

    // 根据状态分发处理逻辑
    const isForce = force === 'true'
    let result
    let message

    switch (staffDetail.status) {
      case 'active':
        if (isForce) {
          // 强制删除在职员工
          result = await TransactionManager.execute(async transaction => {
            return await StaffManagementService.permanentDeleteStaff(
              {
                store_staff_id: storeStaffId,
                operator_id,
                reason: reason || '强制删除',
                force: true
              },
              { transaction }
            )
          })
          message = '员工记录已强制删除'

          logger.info('✅ 员工强制删除成功', {
            store_staff_id: storeStaffId,
            user_id: staffDetail.user_id,
            store_id: staffDetail.store_id,
            operator_id
          })
        } else {
          // 正常离职操作
          result = await TransactionManager.execute(async transaction => {
            return await StaffManagementService.removeStaffFromStore(
              {
                user_id: staffDetail.user_id,
                store_id: staffDetail.store_id,
                operator_id,
                reason
              },
              { transaction }
            )
          })
          message = '员工离职成功'

          logger.info('✅ 员工离职成功', {
            store_staff_id: storeStaffId,
            user_id: staffDetail.user_id,
            store_id: staffDetail.store_id,
            operator_id
          })
        }
        break

      case 'inactive':
        // 删除离职员工记录
        result = await TransactionManager.execute(async transaction => {
          return await StaffManagementService.permanentDeleteStaff(
            {
              store_staff_id: storeStaffId,
              operator_id,
              reason: reason || '删除离职员工记录',
              force: false
            },
            { transaction }
          )
        })
        message = '员工记录已删除'

        logger.info('✅ 员工记录删除成功', {
          store_staff_id: storeStaffId,
          user_id: staffDetail.user_id,
          store_id: staffDetail.store_id,
          operator_id
        })
        break

      case 'deleted':
        return res.apiError('员工记录已删除', 'STAFF_ALREADY_DELETED', null, 400)

      case 'pending':
        return res.apiError('待审核员工不能直接删除，请先拒绝审核', 'STAFF_PENDING', null, 400)

      default:
        return res.apiError(`员工状态异常: ${staffDetail.status}`, 'INVALID_STATUS', null, 400)
    }

    return res.apiSuccess(
      {
        store_staff_id: storeStaffId,
        user_id: staffDetail.user_id,
        store_id: staffDetail.store_id,
        previous_status: staffDetail.status,
        new_status: result.status
      },
      message
    )
  } catch (error) {
    return handleServiceError(error, res, '员工离职/删除')
  }
})

module.exports = router
