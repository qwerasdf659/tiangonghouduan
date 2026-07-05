/**
 * @file 供应商管理路由（商品编码体系 §3.8/§8.3）
 * @description
 * 供货商主数据 CRUD + 货号辅助查询 + 商品主数据健康统计。
 * - 供货商（进货来源）与核销商家 merchants（抽佣/结算）语义不同，彻底分表（拍4）。
 * - 货号 supplier_item_code 可空可重复，仅采购对账参考；命中列表如实返回"共 N 条"不去重。
 *
 * 分层约束：路由经 ServiceManager 获取 SupplierService；写操作由路由层 TransactionManager 管理事务边界。
 *
 * @route /api/v4/console/exchange/suppliers
 * @module routes/v4/console/exchange/suppliers
 */

'use strict'

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../../middleware/validation')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 获取供应商服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} SupplierService 实例
 */
function getSupplierService(req) {
  return req.app.locals.services.getService('supplier_service')
}

/**
 * GET /code-search — 货号辅助查询（按货号找货）
 *
 * Query: supplier_item_code?（货号模糊关键词）、supplier_id?（供应商精确筛选）、page、page_size
 * 至少提供货号关键词或供应商之一；命中多条如实返回（不去重），
 * 每条带 供应商名 + 我方 item_code + 商品名 + duplicate_in_supplier 重复货号提示（非阻断）。
 *
 * 注意：必须定义在 GET /:supplier_id 之前，防止 "code-search" 被当成 :supplier_id 参数。
 */
router.get(
  '/code-search',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getSupplierService(req)
    const { supplier_item_code, supplier_id, page, page_size } = req.query
    const result = await service.searchBySupplierItemCode(
      { supplier_item_code, supplier_id },
      { page, page_size }
    )
    return res.apiSuccess(result, `货号辅助查询成功（共 ${result.total} 条命中）`)
  })
)

/**
 * GET /health-stats — 商品主数据健康统计（§8.3 增强看板 7/12/13）
 *
 * 返回：item_code 未回填数、SPU/SKU 总数、无供应商归属商品数、货号缺失率分子、
 * 同一供应商重复货号清单、按供应商供货分布（识别供货集中度）。
 */
router.get(
  '/health-stats',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getSupplierService(req)
    const stats = await service.getProductCodeHealthStats()
    return res.apiSuccess(stats, '商品主数据健康统计查询成功')
  })
)

/**
 * GET / — 供应商分页列表
 *
 * Query: status?、keyword?（模糊匹配 供应商名/联系人/电话）、page、page_size
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getSupplierService(req)
    const { status, keyword, page, page_size } = req.query
    const result = await service.listSuppliers({ status, keyword }, { page, page_size })
    return res.apiSuccess(result, '获取供应商列表成功')
  })
)

/**
 * GET /:supplier_id — 供应商详情（含供货 SPU 关联行）
 */
router.get(
  '/:supplier_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getSupplierService(req)
    const supplier = await service.getSupplier(req.params.supplier_id)
    return res.apiSuccess(supplier, '获取供应商详情成功')
  })
)

/**
 * POST / — 创建供应商（supplier_name 唯一，防重复建档）
 *
 * Body: { supplier_name, contact_name?, contact_phone?, status?, notes? }
 */
router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getSupplierService(req)
    const created = await TransactionManager.execute(async transaction => {
      return await service.createSupplier(req.body || {}, { transaction })
    })
    return res.apiSuccess(created, '创建供应商成功')
  })
)

/**
 * PUT /:supplier_id — 更新供应商
 */
router.put(
  '/:supplier_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getSupplierService(req)
    const updated = await TransactionManager.execute(async transaction => {
      return await service.updateSupplier(req.params.supplier_id, req.body || {}, { transaction })
    })
    return res.apiSuccess(updated, '更新供应商成功')
  })
)

/**
 * DELETE /:supplier_id — 删除供应商（存在商品关联时 409 拒绝，先解除关联）
 */
router.delete(
  '/:supplier_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getSupplierService(req)
    await TransactionManager.execute(async transaction => {
      return await service.deleteSupplier(req.params.supplier_id, { transaction })
    })
    return res.apiSuccess({ supplier_id: req.params.supplier_id }, '删除供应商成功')
  })
)

module.exports = router
