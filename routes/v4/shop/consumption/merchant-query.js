/**
 * 商家侧消费记录查询路由
 *
 * 📌 背景（2026-06-28 「我的提交」多视角查询升级）：
 * - 显式 view 视角参数 + 服务端 DataScopeService 强制数据范围（替代旧的"角色隐式决定范围"）。
 * - self：仅本人 merchant_id；store：本店/辖区可见门店；staff：某店某员工（含离职历史）；all：仅管理员全局。
 * - 缺省视角：店员 self / 店长 store / 管理员 all；越权由后端 403 兜底（前端越不过）。
 * - 列表与统计共用同一套视角口径（services/consumption/viewResolver + MerchantService._buildViewWhere）。
 *
 * @route /api/v4/shop/consumption/merchant
 * @description 商家员工「我的提交」多视角查询（视角准入 + 分层数据范围 + 跨人/跨店只读审计）
 *
 * API列表：
 * - GET /list - 多视角查询消费记录（self/store/staff/all）
 * - GET /detail/:id - 查询记录详情（权限验证）
 * - GET /stats - 多视角查询消费统计（与 /list 同口径）
 *
 * @since 2026-01-12（多视角升级 2026-06-28）
 */

'use strict'

const express = require('express')
const router = express.Router()
const {
  authenticateToken,
  requireMerchantPermission,
  isUserActiveInStore
} = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const { resolveView } = require('../../../../services/consumption/viewResolver')
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
 * 解析「我的提交」多视角查询的视角入参，并做分层越权校验（列表/统计共用）
 *
 * 校验顺序（执行方案 §五③）：
 * 1. resolveView 视角准入（角色不够 → 403 VIEW_NOT_ALLOWED）
 * 2. DataScopeService 求可见门店集合（单一事实源）
 * 3. store/staff：目标门店 ∈ 可见集合，否则 403 STORE_OUT_OF_SCOPE
 * 4. staff：目标员工在该门店有任职记录（含离职历史），否则 403 STAFF_NOT_IN_STORE
 *
 * @param {Object} req - Express 请求对象
 * @returns {Promise<Object>} 解析结果：
 *   - error 非空时为越权/参数错误：{ error: { message, code, http } }
 *   - 成功：{ view, store_scope, store_ids, target_store_id, target_user_id }
 */
async function resolveMerchantViewContext(req) {
  const userId = req.user.user_id
  const roleLevel = req.user.role_level || 0

  // 1. 视角准入
  const { view, allowed } = resolveView(req.query.view, roleLevel)
  if (!allowed) {
    return {
      error: {
        message: '当前角色不允许使用该查询视角',
        code: 'VIEW_NOT_ALLOWED',
        http: 403
      }
    }
  }

  // 2. 可见门店集合（DataScopeService 单一事实源）
  const DataScopeService = getService(req, 'data_scope')
  const { scope: storeScope, store_ids: storeIds } =
    await DataScopeService.getAccessibleStoreIds(userId)

  // 解析目标门店/员工（store_id/target_user_id 为正整数）
  const targetStoreId = req.query.store_id ? parseInt(req.query.store_id, 10) : null
  const targetUserId = req.query.target_user_id ? parseInt(req.query.target_user_id, 10) : null

  // 3. store/staff：目标门店越权校验（store 不传门店=聚合可见集合，跳过单店校验）
  if (view === 'staff' && (!targetStoreId || targetStoreId <= 0)) {
    return {
      error: { message: '员工视角必须指定 store_id', code: 'STORE_ID_REQUIRED', http: 400 }
    }
  }
  if ((view === 'store' || view === 'staff') && targetStoreId) {
    const inScope =
      storeScope === 'all' || (Array.isArray(storeIds) && storeIds.includes(targetStoreId))
    if (!inScope) {
      return {
        error: { message: '目标门店超出您的可见范围', code: 'STORE_OUT_OF_SCOPE', http: 403 }
      }
    }
  }

  // 4. staff：目标员工任职校验（含离职历史，决策 C1）
  if (view === 'staff') {
    if (!targetUserId || targetUserId <= 0) {
      return {
        error: {
          message: '员工视角必须指定 target_user_id',
          code: 'TARGET_USER_REQUIRED',
          http: 400
        }
      }
    }
    const StaffManagementService = getService(req, 'staff_management')
    const hasTenure = await StaffManagementService.hasStoreTenure(targetUserId, targetStoreId)
    if (!hasTenure) {
      return {
        error: { message: '目标员工不属于该门店', code: 'STAFF_NOT_IN_STORE', http: 403 }
      }
    }
  }

  return {
    view,
    store_scope: storeScope,
    store_ids: storeIds,
    target_store_id: targetStoreId,
    target_user_id: targetUserId
  }
}

/**
 * 记录「看他人记录」的只读访问审计（决策 D2）
 *
 * 仅 view∈{store,staff,all}（跨人/跨店）记录；self 看本人不记。
 * 复用 MerchantOperationLogService（operation_type=view_consumption_list, action=read）。
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} ctx - resolveMerchantViewContext 的成功结果
 * @returns {Promise<void>} 无返回值（审计为旁路写入，失败不阻断查询）
 */
async function auditCrossScopeRead(req, ctx) {
  if (ctx.view === 'self') {
    return
  }
  try {
    const MerchantOperationLogService = getService(req, 'merchant_operation_log')
    await MerchantOperationLogService.createLogFromRequest(req, {
      operator_id: req.user.user_id,
      store_id: ctx.target_store_id || null,
      operation_type: 'view_consumption_list',
      action: 'read',
      target_user_id: ctx.view === 'staff' ? ctx.target_user_id : null,
      status: 'success',
      extra_data: {
        view: ctx.view,
        store_scope: ctx.store_scope,
        visible_store_count: ctx.store_scope === 'all' ? 'all' : (ctx.store_ids || []).length
      }
    })
  } catch (auditError) {
    // 审计失败不阻断只读查询（非致命），仅记录告警
    logger.warn('商家消费查询只读审计写入失败（非致命）', { error: auditError.message })
  }
}

/**
 * @route GET /api/v4/shop/consumption/merchant/list
 * @desc 商家员工「我的提交」多视角查询消费记录（self/store/staff/all）
 * @access Private (需 consumption:read 权限)
 *
 * @query {string} [view] - 查询视角：self/store/staff/all（缺省按角色：店员self/店长store/管理员all）
 * @query {number} [store_id] - 目标门店（view=store 指定单店 / view=staff 必带；store 不传=聚合可见门店）
 * @query {number} [target_user_id] - 目标员工（view=staff 必带）
 * @query {string} [status] - 状态筛选（pending/approved/rejected/expired）
 * @query {number} [page] - 页码（默认1）
 * @query {number} [page_size] - 每页数量（默认20，最大50）
 *
 * 视角与数据范围（后端强制，前端越不过）：
 * - self：仅本人 merchant_id；store：本店/辖区可见门店；staff：某店某员工（含离职历史）；all：仅管理员全局
 * - 越权返回 403：VIEW_NOT_ALLOWED / STORE_OUT_OF_SCOPE / STAFF_NOT_IN_STORE
 */
router.get(
  '/list',
  authenticateToken,
  requireMerchantPermission('consumption:read'),
  asyncHandler(async (req, res) => {
    const MerchantService = getService(req, 'consumption_merchant')

    const userId = req.user.user_id
    const { status, page = 1, page_size = 20 } = req.query

    // 解析视角 + 分层越权校验（self/all 不强制 store_id，消除 ADMIN_STORE_ID_REQUIRED）
    const ctx = await resolveMerchantViewContext(req)
    if (ctx.error) {
      return res.apiError(ctx.error.message, ctx.error.code, null, ctx.error.http)
    }

    logger.info('商家员工「我的提交」多视角查询', {
      user_id: userId,
      view: ctx.view,
      store_scope: ctx.store_scope,
      target_store_id: ctx.target_store_id,
      target_user_id: ctx.target_user_id,
      status,
      page,
      page_size
    })

    const result = await MerchantService.getMerchantRecords({
      user_id: userId,
      view: ctx.view,
      store_scope: ctx.store_scope,
      store_ids: ctx.store_ids,
      target_store_id: ctx.target_store_id,
      target_user_id: ctx.target_user_id,
      status,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    })

    // 决策 D2：跨人/跨店只读审计（self 不记）
    await auditCrossScopeRead(req, ctx)

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
 * @desc 商家员工「我的提交」多视角统计（与列表 /list 同一套视角口径）
 * @access Private (需 consumption:read 权限)
 *
 * @query {string} [view] - 查询视角：self/store/staff/all（缺省按角色）
 * @query {number} [store_id] - 目标门店（view=store 指定单店 / view=staff 必带）
 * @query {number} [target_user_id] - 目标员工（view=staff 必带）
 *
 * 统计数据：by_status（各状态数量/金额/积分）、total（合计）、timeout（待审超时预警，按视角门店范围聚合）
 * 越权返回 403：VIEW_NOT_ALLOWED / STORE_OUT_OF_SCOPE / STAFF_NOT_IN_STORE
 */
router.get(
  '/stats',
  authenticateToken,
  requireMerchantPermission('consumption:read'),
  asyncHandler(async (req, res) => {
    const MerchantService = getService(req, 'consumption_merchant')

    const userId = req.user.user_id

    // 解析视角 + 分层越权校验（与 /list 共用，口径统一）
    const ctx = await resolveMerchantViewContext(req)
    if (ctx.error) {
      return res.apiError(ctx.error.message, ctx.error.code, null, ctx.error.http)
    }

    logger.info('商家员工「我的提交」多视角统计', {
      user_id: userId,
      view: ctx.view,
      store_scope: ctx.store_scope,
      target_store_id: ctx.target_store_id,
      target_user_id: ctx.target_user_id
    })

    const stats = await MerchantService.getMerchantStats({
      user_id: userId,
      view: ctx.view,
      store_scope: ctx.store_scope,
      store_ids: ctx.store_ids,
      target_store_id: ctx.target_store_id,
      target_user_id: ctx.target_user_id
    })

    // 决策 D2：跨人/跨店只读审计（self 不记）
    await auditCrossScopeRead(req, ctx)

    return res.apiSuccess(stats, '查询成功')
  })
)

module.exports = router
