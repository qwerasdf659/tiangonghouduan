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
const { handleServiceError } = require('../../../../middleware/validation')
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
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页条数（默认20）
 *
 * @returns {Object} 员工列表
 */
router.get(
  '/list',
  authenticateToken,
  requireMerchantPermission('staff:read', { scope: 'store', storeIdParam: 'query' }),
  async (req, res) => {
    try {
      const { store_id, status, page = 1, page_size = 20 } = req.query
      const user_stores = req.user_stores || []

      // 确定查询的门店范围
      let resolved_store_id = req.verified_store_id || (store_id ? parseInt(store_id, 10) : null)

      // 非管理员必须指定门店或自动填充单门店
      if (req.user.role_level < 100 && !resolved_store_id) {
        if (user_stores.length === 0) {
          return res.apiError('您未绑定任何门店', 'NO_STORE_BINDING', null, 403)
        } else if (user_stores.length === 1) {
          resolved_store_id = user_stores[0].store_id
        } else {
          return res.apiError(
            '您绑定了多个门店，请明确指定 store_id 参数',
            'MULTIPLE_STORES_REQUIRE_STORE_ID',
            {
              available_stores: user_stores.map(s => ({
                store_id: s.store_id,
                store_name: s.store_name
              }))
            },
            400
          )
        }
      }

      const filters = {}
      if (resolved_store_id) filters.store_id = resolved_store_id
      if (status) filters.status = status

      const StaffManagementService = getStaffManagementService(req)
      const result = await StaffManagementService.getStaffList(filters, {
        page: parseInt(page, 10),
        page_size: parseInt(page_size, 10)
      })

      return res.apiSuccess(result, '员工列表获取成功')
    } catch (error) {
      logger.error('获取员工列表失败', { error: error.message })
      return handleServiceError(error, res, '获取员工列表失败')
    }
  }
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
  async (req, res) => {
    try {
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
    } catch (error) {
      logger.error('添加员工失败', { error: error.message })
      return handleServiceError(error, res, '添加员工失败')
    }
  }
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
  async (req, res) => {
    try {
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
    } catch (error) {
      logger.error('员工调店失败', { error: error.message })
      return handleServiceError(error, res, '员工调店失败')
    }
  }
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
  async (req, res) => {
    try {
      const { user_id, reason } = req.body
      const operator_id = req.user.user_id

      // 参数验证
      if (!user_id) {
        return res.apiError('用户ID为必填', 'BAD_REQUEST', null, 400)
      }

      // 通过 ServiceManager 获取服务
      const StaffManagementService = getStaffManagementService(req)

      const result = await TransactionManager.execute(async transaction => {
        return await StaffManagementService.disableStaff(
          parseInt(user_id, 10),
          operator_id,
          reason,
          { transaction }
        )
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
    } catch (error) {
      logger.error('禁用员工失败', { error: error.message })
      return handleServiceError(error, res, '禁用员工失败')
    }
  }
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
  async (req, res) => {
    try {
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
    } catch (error) {
      logger.error('启用员工失败', { error: error.message })
      return handleServiceError(error, res, '启用员工失败')
    }
  }
)

module.exports = router
