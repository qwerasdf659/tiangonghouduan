/**
 * 商家侧消费记录查询路由
 *
 * 📌 背景（2026-01-12 商家员工域权限体系升级 - P0 商家侧消费记录查询能力补齐）：
 * - 店员（merchant_staff）：只能查询自己录入的消费记录（merchant_id = self）
 * - 店长（merchant_manager）：可以查询本店全部消费记录（store_id = 当前门店）
 *
 * @route /api/v4/shop/consumption/merchant
 * @description 商家员工查询消费记录（按门店隔离+角色权限控制）
 *
 * API列表：
 * - GET /list - 商家员工查询消费记录（店员查自己，店长查全店）
 * - GET /detail/:id - 商家员工查询记录详情（权限验证）
 * - GET /stats - 商家员工查询消费统计
 *
 * @since 2026-01-12
 */

'use strict'

const express = require('express')
const router = express.Router()
const {
  authenticateToken,
  requireMerchantPermission,
  isUserActiveInStore
} = require('../../../../middleware/auth')
const { resolveStoreContext } = require('../../../../middleware/resolveStoreContext')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

/**
 * 通过 ServiceManager 获取服务实例
 *
 * @param {Object} req - Express 请求对象
 * @param {string} serviceName - 服务名称（snake_case）
 * @returns {Object} 服务实例
 */
const getService = (req, serviceName) => {
  return req.app.locals.services.getService(serviceName)
}

/**
 * @route GET /api/v4/shop/consumption/merchant/list
 * @desc 商家员工查询消费记录（按门店隔离+角色权限控制）
 * @access Private (merchant_staff / merchant_manager)
 *
 * @query {number} store_id - 门店ID（必填，商家域准入中间件已验证用户在职）
 * @query {string} status - 状态筛选（pending/approved/rejected/expired，可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 *
 * 权限控制：
 * - 店员（role_level=20）：只能查询自己录入的记录（merchant_id = self）
 * - 店长（role_level=40）：可以查询本店全部记录（store_id = store_id）
 * - 需要 consumption:read 权限
 *
 * @example
 * // 店员查询（只返回自己录入的）
 * GET /api/v4/shop/consumption/merchant/list?store_id=1&page=1
 *
 * // 店长查询（返回全店记录）
 * GET /api/v4/shop/consumption/merchant/list?store_id=1&page=1
 */
router.get(
  '/list',
  authenticateToken,
  requireMerchantPermission('consumption:read'),
  resolveStoreContext({ storeIdParam: 'query' }),
  asyncHandler(async (req, res) => {
    const MerchantService = getService(req, 'consumption_merchant')
    const StaffManagementService = getService(req, 'staff_management')

    const userId = req.user.user_id
    const roleLevel = req.user.role_level || 0

    const { status, page = 1, page_size = 20 } = req.query

    /*
     * 议题3：门店上下文由 resolveStoreContext 统一解析。
     * - 普通员工：单店自动填充 / 多店须带 store_id / 校验在职；
     * - 管理员：可跨任意门店（必须带 store_id），审计可定位。
     */
    const storeId = req.store_context.store_id

    const isManager = await StaffManagementService.isStoreManager(userId, storeId, roleLevel)

    logger.info('商家员工查询消费记录', {
      user_id: userId,
      store_id: storeId,
      is_manager: isManager,
      status,
      page,
      page_size
    })

    const result = await MerchantService.getMerchantRecords({
      user_id: userId,
      store_id: storeId,
      is_manager: isManager,
      status,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    })

    return res.apiSuccess(result, '查询成功')
  })
)

/**
 * @route GET /api/v4/shop/consumption/merchant/detail/:id
 * @desc 商家员工查询消费记录详情（权限验证）
 * @access Private (merchant_staff / merchant_manager)
 *
 * API路径参数设计规范 V2.2：
 * - 消费记录是事务实体，使用数字ID（:id）作为标识符
 *
 * @param {number} id - 消费记录ID
 *
 * 权限控制：
 * - 店员：只能查看自己录入的记录详情
 * - 店长：可以查看本店任意记录详情
 */
router.get(
  '/detail/:id',
  authenticateToken,
  requireMerchantPermission('consumption:read'),
  asyncHandler(async (req, res) => {
    const MerchantService = getService(req, 'consumption_merchant')
    const StaffManagementService = getService(req, 'staff_management')

    const userId = req.user.user_id
    const roleLevel = req.user.role_level || 0
    const recordId = parseInt(req.params.id, 10)

    if (isNaN(recordId) || recordId <= 0) {
      return res.apiError('无效的记录ID', 'INVALID_RECORD_ID', null, 400)
    }

    const record = await MerchantService.getMerchantRecordDetail(recordId)

    if (!record) {
      return res.apiError('消费记录不存在', 'RECORD_NOT_FOUND', null, 404)
    }

    const storeId = record.store_id

    /*
     * 议题3：门店访问校验（store_id 来自记录本身，非请求参数，故不走 resolveStoreContext）。
     * 管理员（role_level>=100）可跨店查看；普通员工须在该店在职。
     */
    if (roleLevel < 100) {
      const isActiveInStore = await isUserActiveInStore(userId, storeId)
      if (!isActiveInStore) {
        return res.apiForbidden('STORE_ACCESS_DENIED', '您没有该记录所属门店的访问权限')
      }
    }

    const isManager = await StaffManagementService.isStoreManager(userId, storeId, roleLevel)

    if (!isManager && record.merchant_id !== userId) {
      return res.apiForbidden('RECORD_ACCESS_DENIED', '您只能查看自己录入的消费记录')
    }

    logger.info('商家员工查询消费记录详情', {
      record_id: recordId,
      user_id: userId,
      store_id: storeId,
      is_manager: isManager,
      access_type: isManager ? 'manager_privilege' : 'self_record'
    })

    return res.apiSuccess(record.toAPIResponse(), '查询成功')
  })
)

/**
 * @route GET /api/v4/shop/consumption/merchant/stats
 * @desc 商家员工查询消费统计（按门店）
 * @access Private (merchant_staff / merchant_manager)
 *
 * @query {number} store_id - 门店ID（必填）
 *
 * 统计数据：
 * - 待审核数量/金额
 * - 已通过数量/金额/奖励积分
 * - 已拒绝数量/金额
 */
router.get(
  '/stats',
  authenticateToken,
  requireMerchantPermission('consumption:read'),
  resolveStoreContext({ storeIdParam: 'query' }),
  asyncHandler(async (req, res) => {
    const MerchantService = getService(req, 'consumption_merchant')
    const StaffManagementService = getService(req, 'staff_management')

    const userId = req.user.user_id
    const roleLevel = req.user.role_level || 0

    // 议题3：门店上下文由 resolveStoreContext 统一解析（管理员可跨店，员工校验在职）
    const storeId = req.store_context.store_id

    const isManager = await StaffManagementService.isStoreManager(userId, storeId, roleLevel)

    logger.info('商家员工查询消费统计', {
      user_id: userId,
      store_id: storeId,
      is_manager: isManager
    })

    const stats = await MerchantService.getMerchantStats({
      user_id: userId,
      store_id: storeId,
      is_manager: isManager
    })

    return res.apiSuccess(stats, '查询成功')
  })
)

module.exports = router
