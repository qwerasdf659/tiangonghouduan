/**
 * @file 产品系列管理路由（商品编码体系 §3.6 双轨制之可读系列号轨道）
 * @description
 * 系列主数据 CRUD。系列码 series_code 运营手填 + 后端唯一性校验（全大写归一化）；
 * 序号 series_seq 由 SeriesSeqAllocator 在商品创建事务内发号，本路由不涉及发号。
 *
 * 分层约束：路由经 ServiceManager 获取 ProductSeriesService；写操作由路由层 TransactionManager 管理事务边界。
 *
 * @route /api/v4/console/exchange/product-series
 * @module routes/v4/console/exchange/product-series
 */

'use strict'

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../../middleware/validation')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 获取产品系列服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ProductSeriesService 实例
 */
function getProductSeriesService(req) {
  return req.app.locals.services.getService('product_series_service')
}

/**
 * GET / — 系列分页列表
 *
 * Query: status?、keyword?（模糊匹配 series_code/series_name）、page、page_size
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getProductSeriesService(req)
    const { status, keyword, page, page_size } = req.query
    const result = await service.listSeries({ status, keyword }, { page, page_size })
    return res.apiSuccess(result, '获取系列列表成功')
  })
)

/**
 * GET /:series_id — 系列详情
 */
router.get(
  '/:series_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getProductSeriesService(req)
    const series = await service.getSeries(req.params.series_id)
    return res.apiSuccess(series, '获取系列详情成功')
  })
)

/**
 * POST / — 创建系列（series_code 唯一 + 全大写归一化；next_seq 从 1 起由发号器维护）
 *
 * Body: { series_code, series_name, seq_pad?, status? }
 */
router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getProductSeriesService(req)
    const created = await TransactionManager.execute(async transaction => {
      return await service.createSeries(req.body || {}, { transaction })
    })
    return res.apiSuccess(created, '创建系列成功')
  })
)

/**
 * PUT /:series_id — 更新系列（next_seq 不允许人工改，由发号器维护）
 */
router.put(
  '/:series_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getProductSeriesService(req)
    const updated = await TransactionManager.execute(async transaction => {
      return await service.updateSeries(req.params.series_id, req.body || {}, { transaction })
    })
    return res.apiSuccess(updated, '更新系列成功')
  })
)

/**
 * DELETE /:series_id — 删除系列（存在归属商品时 409 拒绝，保护连号可追溯性）
 */
router.delete(
  '/:series_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getProductSeriesService(req)
    await TransactionManager.execute(async transaction => {
      return await service.deleteSeries(req.params.series_id, { transaction })
    })
    return res.apiSuccess({ series_id: req.params.series_id }, '删除系列成功')
  })
)

module.exports = router
