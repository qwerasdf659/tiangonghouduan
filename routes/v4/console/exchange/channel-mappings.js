/**
 * @file 外部渠道映射路由 — S5 分销映射
 * @route /api/v4/console/exchange/channel-mappings
 */

'use strict'

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../../middleware/validation')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 获取渠道映射服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ExternalChannelMappingService 实例
 */
function getService(req) {
  return req.app.locals.services.getService('channel_mapping_service')
}

/**
 * GET /channel-dict — 启用的分销渠道字典（管理台下拉数据源，拍板 #24）
 * 注意：静态路径必须定义在 /:mapping_id 之前。
 */
router.get(
  '/channel-dict',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const channels = await getService(req).listChannelDict()
    return res.apiSuccess({ channels }, '获取分销渠道字典成功')
  })
)

router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { channel, sync_status, exchange_item_id, keyword, page, page_size } = req.query
    const result = await getService(req).listChannelMappings(
      { channel, sync_status, exchange_item_id, keyword },
      { page, page_size }
    )
    return res.apiSuccess(result, '获取渠道映射列表成功')
  })
)

router.get(
  '/:mapping_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await getService(req).getChannelMapping(req.params.mapping_id)
    return res.apiSuccess(result, '获取渠道映射详情成功')
  })
)

router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const created = await TransactionManager.execute(async transaction =>
      getService(req).createChannelMapping(req.body || {}, { transaction })
    )
    return res.apiSuccess(created, '创建渠道映射成功')
  })
)

router.put(
  '/:mapping_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const updated = await TransactionManager.execute(async transaction =>
      getService(req).updateChannelMapping(req.params.mapping_id, req.body || {}, { transaction })
    )
    return res.apiSuccess(updated, '更新渠道映射成功')
  })
)

router.delete(
  '/:mapping_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(async transaction =>
      getService(req).deleteChannelMapping(req.params.mapping_id, { transaction })
    )
    return res.apiSuccess(result, '删除渠道映射成功')
  })
)

module.exports = router
