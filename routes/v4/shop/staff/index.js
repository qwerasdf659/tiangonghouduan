/**
 * 员工管理路由模块
 *
 * @route /api/v4/shop/staff
 * @description 商家门店员工管理 API
 *
 * 📌 路径说明：
 * - 文档定义路径：/api/v4/admin/staff（管理员视角）
 * - 实际实现路径：/api/v4/shop/staff（商家域统一入口）
 * - 功能等价，权限一致，选择 shop 域是因为员工管理属于商家业务
 *
 * API列表：
 * - GET /list - 查询员工列表（对应文档 GET /api/v4/admin/staff）
 * - POST /add - 添加员工到门店（对应文档 POST /api/v4/admin/staff）
 * - POST /transfer - 员工调店（对应文档 POST /api/v4/admin/staff/:id/transfer）
 * - POST /disable - 禁用员工（对应文档 PUT /api/v4/admin/staff/user/:user_id/disable）
 * - POST /enable - 启用员工
 *
 * 权限控制（2026年01月12日 商家员工域权限体系升级）：
 * - 仅店长（merchant_manager）或管理员可操作
 * - 需要 staff:manage 或 staff:read 权限
 * - 已集成 requireMerchantPermission 门店范围校验
 *
 * 依据文档：docs/商家员工域权限体系升级方案.md AC3
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireMerchantPermission } = require('../../../../middleware/auth')
const { resolveStoreContext } = require('../../../../middleware/resolveStoreContext')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 获取员工管理服务（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} StaffManagementService 实例
 */
function getStaffManagementService(req) {
  return req.app.locals.services.getService('staff_management')
}

/**
 * 获取商家操作审计日志服务（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} MerchantOperationLogService 实例
 */
function getMerchantOperationLogService(req) {
  return req.app.locals.services.getService('merchant_operation_log')
}

/**
 * @route GET /api/v4/shop/staff/list
 * @desc 查询门店员工列表
 * @access Private (店长或管理员，需 staff:read 权限)
 *
 * @query {number} store_id - 门店ID（可选，管理员可不传查全部）
 * @query {string} status - 状态筛选（active/disabled）
 * @query {string} role_in_store - 门店内角色筛选（staff/manager，可选）
 * @query {string} include_deleted - 是否含已删除记录（'true'/'1' 启用，可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页条数（默认20）
 *
 * @returns {Object} 员工列表
 */
router.get(
  '/list',
  authenticateToken,
  requireMerchantPermission('staff:read', { scope: 'store', storeIdParam: 'query' }),
  resolveStoreContext({ storeIdParam: 'query', required: false }),
  asyncHandler(async (req, res) => {
    const { status, role_in_store, include_deleted, page = 1, page_size = 20 } = req.query

    /*
     * 议题3：门店范围由 resolveStoreContext 统一解析（required:false 为列表只读场景）。
     * - 普通员工：单店自动填充 / 多店须带 store_id；
     * - 管理员：带 store_id 则查该店，不带则 store_context.store_id=null → 查全部门店。
     */
    const resolved_store_id = req.store_context.store_id

    /*
     * 统一收口到 getStaffList 单参数 filters（修复历史分页 bug：
     * 旧写法 getStaffList(filters, {page,page_size}) 第二参被忽略，分页/含离职/角色筛选全部失效）。
     * page/page_size/include_deleted/role_in_store 一律并入 filters。
     */
    const filters = {
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    }
    if (resolved_store_id) filters.store_id = resolved_store_id
    if (status) filters.status = status
    if (role_in_store) filters.role_in_store = role_in_store
    // include_deleted 支持字符串 'true'/'1'（query 参数无布尔类型）
    if (include_deleted === 'true' || include_deleted === '1') filters.include_deleted = true

    const StaffManagementService = getStaffManagementService(req)
    const result = await StaffManagementService.getStaffList(filters)

    return res.apiSuccess(result, '员工列表获取成功')
  })
)

/**
 * @route POST /api/v4/shop/staff/add
 * @desc 添加员工到门店（入职）
 * @access Private (店长或管理员，需 staff:manage 权限)
 *
 * @body {number} user_id - 员工用户ID（必填）
 * @body {number} store_id - 门店ID（必填）
 * @body {string} role_in_store - 门店内角色（staff/manager，默认staff）
 * @body {string} notes - 备注（可选）
 *
 * @returns {Object} 创建的员工记录
 */
router.post(
  '/add',
  authenticateToken,
  requireMerchantPermission('staff:manage', { scope: 'store', storeIdParam: 'body' }),
  resolveStoreContext({ storeIdParam: 'body' }),
  asyncHandler(async (req, res) => {
    const { user_id, store_id, role_in_store = 'staff', notes } = req.body
    const operator_id = req.user.user_id

    // 参数验证
    if (!user_id || !store_id) {
      return res.apiError('用户ID和门店ID为必填', 'BAD_REQUEST', null, 400)
    }

    // 通过 ServiceManager 获取服务
    const StaffManagementService = getStaffManagementService(req)

    // 使用事务管理器
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

    // 记录审计日志（通过 ServiceManager 获取服务）
    try {
      const MerchantOperationLogService = getMerchantOperationLogService(req)
      await MerchantOperationLogService.createLogFromRequest(req, {
        operator_id,
        store_id: parseInt(store_id, 10),
        operation_type: 'staff_add',
        action: 'create',
        target_user_id: parseInt(user_id, 10),
        result: 'success',
        extra_data: { role_in_store, notes, staff_record_id: result.id }
      })
    } catch (logError) {
      logger.error('审计日志记录失败', { error: logError.message })
    }

    logger.info('✅ 员工入职成功', {
      user_id,
      store_id,
      role_in_store,
      operator_id
    })

    return res.apiSuccess(result, '员工添加成功')
  })
)

/**
 * @route POST /api/v4/shop/staff/transfer
 * @desc 员工调店
 * @access Private (店长或管理员，需 staff:manage 权限)
 *
 * @body {number} user_id - 员工用户ID（必填）
 * @body {number} from_store_id - 原门店ID（必填）
 * @body {number} to_store_id - 目标门店ID（必填）
 * @body {string} notes - 调店原因（可选）
 *
 * @returns {Object} 调店结果
 */
router.post(
  '/transfer',
  authenticateToken,
  requireMerchantPermission('staff:manage', { scope: 'store', storeIdParam: 'body' }),
  asyncHandler(async (req, res) => {
    const { user_id, from_store_id, to_store_id, notes } = req.body
    const operator_id = req.user.user_id

    // 参数验证
    if (!user_id || !from_store_id || !to_store_id) {
      return res.apiError('用户ID、原门店ID和目标门店ID为必填', 'BAD_REQUEST', null, 400)
    }

    if (from_store_id === to_store_id) {
      return res.apiError('原门店和目标门店不能相同', 'BAD_REQUEST', null, 400)
    }

    // 通过 ServiceManager 获取服务
    const StaffManagementService = getStaffManagementService(req)

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

    // 记录审计日志（通过 ServiceManager 获取服务）
    try {
      const MerchantOperationLogService = getMerchantOperationLogService(req)
      await MerchantOperationLogService.createLogFromRequest(req, {
        operator_id,
        store_id: parseInt(to_store_id, 10),
        operation_type: 'staff_transfer',
        action: 'update',
        target_user_id: parseInt(user_id, 10),
        result: 'success',
        extra_data: {
          from_store_id: parseInt(from_store_id, 10),
          to_store_id: parseInt(to_store_id, 10),
          notes
        }
      })
    } catch (logError) {
      logger.error('审计日志记录失败', { error: logError.message })
    }

    logger.info('✅ 员工调店成功', {
      user_id,
      from_store_id,
      to_store_id,
      operator_id
    })

    return res.apiSuccess(result, '员工调店成功')
  })
)

/**
 * @route POST /api/v4/shop/staff/disable
 * @desc 禁用员工（从所有门店离职）
 * @access Private (店长或管理员，需 staff:manage 权限)
 *
 * @body {number} user_id - 员工用户ID（必填）
 * @body {string} reason - 禁用原因（可选）
 *
 * @returns {Object} 禁用结果
 */
router.post(
  '/disable',
  authenticateToken,
  requireMerchantPermission('staff:manage', { scope: 'global' }),
  asyncHandler(async (req, res) => {
    const { user_id, reason } = req.body
    const operator_id = req.user.user_id

    // 参数验证
    if (!user_id) {
      return res.apiError('用户ID为必填', 'BAD_REQUEST', null, 400)
    }

    // 通过 ServiceManager 获取服务
    const StaffManagementService = getStaffManagementService(req)

    const result = await TransactionManager.execute(async transaction => {
      return await StaffManagementService.disableStaff(parseInt(user_id, 10), operator_id, reason, {
        transaction
      })
    })

    // 记录审计日志（store_id 为 null 表示跨门店操作，通过 ServiceManager 获取服务）
    try {
      const MerchantOperationLogService = getMerchantOperationLogService(req)
      await MerchantOperationLogService.createLogFromRequest(req, {
        operator_id,
        store_id: null, // 禁用涉及多门店，设为 null
        operation_type: 'staff_disable',
        action: 'update',
        target_user_id: parseInt(user_id, 10),
        result: 'success',
        extra_data: { reason, affected_stores: result.affected_stores }
      })
    } catch (logError) {
      logger.error('审计日志记录失败', { error: logError.message })
    }

    logger.info('✅ 员工已禁用', {
      user_id,
      affected_stores: result.affected_stores,
      operator_id
    })

    return res.apiSuccess(result, '员工已禁用')
  })
)

/**
 * @route POST /api/v4/shop/staff/enable
 * @desc 启用员工（恢复）
 * @access Private (店长或管理员，需 staff:manage 权限)
 *
 * @body {number} user_id - 员工用户ID（必填）
 * @body {number} store_id - 门店ID（必填）
 * @body {string} notes - 备注（可选）
 *
 * @returns {Object} 启用结果
 */
router.post(
  '/enable',
  authenticateToken,
  requireMerchantPermission('staff:manage', { scope: 'store', storeIdParam: 'body' }),
  resolveStoreContext({ storeIdParam: 'body' }),
  asyncHandler(async (req, res) => {
    const { user_id, store_id, notes } = req.body
    const operator_id = req.user.user_id

    // 参数验证
    if (!user_id || !store_id) {
      return res.apiError('用户ID和门店ID为必填', 'BAD_REQUEST', null, 400)
    }

    // 通过 ServiceManager 获取服务
    const StaffManagementService = getStaffManagementService(req)

    const result = await TransactionManager.execute(async transaction => {
      return await StaffManagementService.enableStaff(
        parseInt(user_id, 10),
        parseInt(store_id, 10),
        operator_id,
        notes,
        { transaction }
      )
    })

    // 记录审计日志（通过 ServiceManager 获取服务）
    try {
      const MerchantOperationLogService = getMerchantOperationLogService(req)
      await MerchantOperationLogService.createLogFromRequest(req, {
        operator_id,
        store_id: parseInt(store_id, 10),
        operation_type: 'staff_enable',
        action: 'update',
        target_user_id: parseInt(user_id, 10),
        result: 'success',
        extra_data: { notes }
      })
    } catch (logError) {
      logger.error('审计日志记录失败', { error: logError.message })
    }

    logger.info('✅ 员工已启用', {
      user_id,
      store_id,
      operator_id
    })

    return res.apiSuccess(result, '员工已启用')
  })
)

module.exports = router
