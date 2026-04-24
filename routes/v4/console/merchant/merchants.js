/**
 * 商家管理路由 - Console 平台管理域
 *
 * @description 提供平台管理员商家数据的 CRUD 操作 API
 *              路径：/api/v4/console/merchants
 *
 * 业务场景：
 * - 平台管理员创建/编辑/删除商家
 * - 商家列表查询（分页、类型筛选、关键字搜索）
 * - 商家详情查询（含关联门店统计）
 * - 商家类型选项获取（字典表驱动）
 * - 商家下拉选项（供其他页面筛选器使用）
 *
 * 权限要求：
 * - 所有接口需要 admin 角色（role_level >= 100）
 *
 * 接口清单：
 * - GET    /                - 获取商家列表（分页、筛选）
 * - GET    /options         - 获取商家下拉选项（活跃商家）
 * - GET    /type-options    - 获取商家类型选项（字典表）
 * - GET    /:id             - 获取商家详情
 * - POST   /                - 创建新商家
 * - PUT    /:id             - 更新商家信息
 * - DELETE /:id             - 删除商家（硬删除，需无关联数据）
 *
 * @since 2026
 */

'use strict'

const express = require('express')
const { asyncHandler } = require('../../../../middleware/validation')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')

const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 获取商家管理服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} MerchantService
 */
function getMerchantService(req) {
  return req.app.locals.services.getService('merchant')
}

// 所有接口需要管理员权限
router.use(authenticateToken, requireRoleLevel(100))

/**
 * GET / - 商家列表（分页、筛选）
 *
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @query {string} [merchant_type] - 商家类型筛选
 * @query {string} [status] - 状态筛选（active/inactive/suspended）
 * @query {string} [keyword] - 名称/联系电话模糊搜索
 * @query {string} [contact_mobile] - 联系电话独立筛选
 */
router.get('/', asyncHandler(async (req, res) => {
  const merchantService = getMerchantService(req)
  const result = await merchantService.getMerchantList(req.query)
  return res.apiSuccess(result, '获取商家列表成功')
}))

/**
 * GET /options - 商家下拉选项（供其他页面筛选器使用）
 * 返回所有活跃商家的 { merchant_id, merchant_name, merchant_type }
 */
router.get('/options', asyncHandler(async (req, res) => {
  const merchantService = getMerchantService(req)
  const options = await merchantService.getMerchantOptions()
  return res.apiSuccess(options, '获取商家选项成功')
}))

/**
 * GET /type-options - 商家类型选项（字典表驱动）
 * 返回 [{ code, name, color }]
 */
router.get('/type-options', asyncHandler(async (req, res) => {
  const merchantService = getMerchantService(req)
  const typeOptions = await merchantService.getMerchantTypeOptions()
  return res.apiSuccess(typeOptions, '获取商家类型选项成功')
}))

/**
 * GET /:id - 商家详情
 *
 * @param {number} id - 商家ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const merchantId = parseInt(req.params.id)
  if (isNaN(merchantId)) {
    return res.apiError('商家ID必须是数字', 'VALIDATION_ERROR', null, 400)
  }

  const merchantService = getMerchantService(req)
  const merchant = await merchantService.getMerchantById(merchantId)
  return res.apiSuccess(merchant, '获取商家详情成功')
}))

/**
 * POST / - 创建新商家
 *
 * @body {string} merchant_name - 商家名称（必填）
 * @body {string} merchant_type - 商家类型（必填，字典校验）
 * @body {string} [contact_name] - 联系人
 * @body {string} [contact_mobile] - 联系电话
 * @body {string} [logo_url] - LOGO地址
 * @body {string} [status='active'] - 状态
 * @body {number} [commission_rate=0] - 抽佣比例
 * @body {string} [notes] - 备注
 */
router.post('/', asyncHandler(async (req, res) => {
  const merchantService = getMerchantService(req)

  const result = await TransactionManager.execute(async transaction => {
    return await merchantService.createMerchant(req.body, { transaction })
  })

  return res.apiSuccess(result, '商家创建成功', 201)
}))

/**
 * PUT /:id - 更新商家信息
 *
 * @param {number} id - 商家ID
 * @body {Object} 可更新的字段
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const merchantId = parseInt(req.params.id)
  if (isNaN(merchantId)) {
    return res.apiError('商家ID必须是数字', 'VALIDATION_ERROR', null, 400)
  }

  const merchantService = getMerchantService(req)

  const result = await TransactionManager.execute(async transaction => {
    return await merchantService.updateMerchant(merchantId, req.body, { transaction })
  })

  return res.apiSuccess(result, '商家信息更新成功')
}))

/**
 * DELETE /:id - 删除商家
 *
 * @param {number} id - 商家ID
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const merchantId = parseInt(req.params.id)
  if (isNaN(merchantId)) {
    return res.apiError('商家ID必须是数字', 'VALIDATION_ERROR', null, 400)
  }

  const merchantService = getMerchantService(req)

  await TransactionManager.execute(async transaction => {
    return await merchantService.deleteMerchant(merchantId, { transaction })
  })

  return res.apiSuccess(null, '商家删除成功')
}))

module.exports = router
