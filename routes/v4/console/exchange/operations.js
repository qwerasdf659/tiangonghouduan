/**
 * B2C 兑换商品运营操作 API
 *
 * @route /api/v4/console/exchange/*
 * @description 商品置顶/推荐/批量上下架/批量改价/批量分类/批量排序/缺图/绑图
 * @security JWT + Admin权限
 * @module routes/v4/console/exchange/operations
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger
const { asyncHandler } = require('../../../../middleware/validation')

/** PUT /items/:exchange_item_id/pin - 置顶/取消置顶商品 */
router.put(
  '/items/:exchange_item_id/pin',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const ExchangeService = req.app.locals.services.getService('exchange_admin')
    const itemId = parseInt(req.params.exchange_item_id)
    const { is_pinned } = req.body
    const result = await TransactionManager.execute(
      async transaction => {
        const item = await ExchangeService.ExchangeItem.findByPk(itemId, {
          lock: transaction.LOCK.UPDATE,
          transaction
        })
        if (!item) throw new Error('商品不存在')
        const pinned = is_pinned !== undefined ? !!is_pinned : !item.is_pinned
        const BeijingTimeHelper = require('../../../../utils/timeHelper')
        await item.update(
          {
            is_pinned: pinned,
              pinned_at: pinned ? BeijingTimeHelper.createDatabaseTime() : null
            },
            { transaction }
          )
        return { exchange_item_id: itemId, is_pinned: pinned }
      },
      { description: `置顶商品 ${itemId}`, maxRetries: 1 }
    )
    return res.apiSuccess(result, result.is_pinned ? '商品已置顶' : '已取消置顶')
  })
)

/** PUT /items/:exchange_item_id/recommend - 推荐/取消推荐商品 */
router.put(
  '/items/:exchange_item_id/recommend',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const ExchangeService = req.app.locals.services.getService('exchange_admin')
    const itemId = parseInt(req.params.exchange_item_id)
    const { is_recommended } = req.body
    const result = await TransactionManager.execute(
      async transaction => {
        const item = await ExchangeService.ExchangeItem.findByPk(itemId, {
          lock: transaction.LOCK.UPDATE,
          transaction
        })
        if (!item) throw new Error('商品不存在')
        const recommended = is_recommended !== undefined ? !!is_recommended : !item.is_recommended
        await item.update({ is_recommended: recommended }, { transaction })
        return { exchange_item_id: itemId, is_recommended: recommended }
      },
      { description: `推荐商品 ${itemId}`, maxRetries: 1 }
    )
    return res.apiSuccess(result, result.is_recommended ? '商品已推荐' : '已取消推荐')
  })
)

/** PUT /items/batch-status - 批量上下架 */
router.put('/items/batch-status', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const { exchange_item_ids, status } = req.body
  if (!Array.isArray(exchange_item_ids) || exchange_item_ids.length === 0) {
    return res.apiError('商品ID列表不能为空', 'BAD_REQUEST', null, 400)
  }
  if (!['active', 'inactive'].includes(status)) {
    return res.apiError('无效的状态值', 'BAD_REQUEST', null, 400)
  }
  const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')
  const result = await TransactionManager.execute(
    async transaction => {
      return await ExchangeAdminService.batchUpdateStatus(exchange_item_ids, status, {
        transaction,
        operator_id: req.user?.user_id
      })
    },
    {
      description: `批量${status === 'active' ? '上架' : '下架'} ${exchange_item_ids.length} 个商品`
    }
  )
  return res.apiSuccess(
    result,
    `已批量${status === 'active' ? '上架' : '下架'} ${result.affected_rows} 个商品`
  )
}))

/** PUT /items/batch-price - 批量改价 */
router.put('/items/batch-price', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const { items, mode, value, exchange_item_ids } = req.body
  const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')
  if (mode && value !== undefined && Array.isArray(exchange_item_ids)) {
    const result = await TransactionManager.execute(
      async transaction => {
        return await ExchangeAdminService.batchUpdatePrice(
          exchange_item_ids,
          { mode, value },
          { transaction, operator_id: req.user?.user_id }
        )
      },
      { description: `批量改价 ${exchange_item_ids.length} 个商品` }
    )
    return res.apiSuccess(result, `已更新 ${result.affected_rows} 个商品价格`)
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.apiError('价格数据不能为空', 'BAD_REQUEST', null, 400)
  }
  const result = await TransactionManager.execute(
    async transaction => {
      return await ExchangeAdminService.batchSetIndividualPrices(items, {
        transaction,
        operator_id: req.user?.user_id
      })
    },
    { description: `批量逐个设价 ${items.length} 个商品` }
  )
  return res.apiSuccess(result, `已更新 ${result.affected_rows} 个商品价格`)
}))

/** PUT /items/batch-category - 批量修改分类 */
router.put('/items/batch-category', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const { exchange_item_ids, category_id } = req.body
  if (!Array.isArray(exchange_item_ids) || exchange_item_ids.length === 0) {
    return res.apiError('商品ID列表不能为空', 'BAD_REQUEST', null, 400)
  }
  if (category_id === undefined) {
    return res.apiError('目标分类ID不能为空', 'BAD_REQUEST', null, 400)
  }
  const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')
  const result = await TransactionManager.execute(
    async transaction => {
      return await ExchangeAdminService.batchUpdateCategory(
        exchange_item_ids,
        category_id || null,
        { transaction }
      )
    },
    { description: `批量修改分类 ${exchange_item_ids.length} 个商品` }
  )
  return res.apiSuccess(result, `已更新 ${result.affected_rows} 个商品分类`)
}))

/** PUT /items/batch-sort - 批量调整商品排序 */
router.put('/items/batch-sort', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const { items } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.apiError('items 数组不能为空', 'INVALID_PARAMS', null, 400)
  }
  const ExchangeService = req.app.locals.services.getService('exchange_admin')
  const result = await TransactionManager.execute(
    async transaction => {
      const updatePromises = items
        .filter(
          ({ exchange_item_id, sort_order }) => exchange_item_id && sort_order !== undefined
        )
        .map(({ exchange_item_id, sort_order }) =>
          ExchangeService.ExchangeItem.update(
            { sort_order: parseInt(sort_order) },
            { where: { exchange_item_id }, transaction }
          )
        )
      const results = await Promise.all(updatePromises)
      return { updated_count: results.length }
    },
    { description: '批量排序商品', maxRetries: 1 }
  )
  const { BusinessCacheHelper } = require('../../../../utils/BusinessCacheHelper')
  await BusinessCacheHelper.invalidateExchangeItems('batch_sort')
  const AuditLogService = req.app.locals.services.getService('audit_log')
  await AuditLogService.logOperation({
    operator_id: req.user.user_id,
    operation_type: 'sort_change',
    target_type: 'exchange_item',
    target_id: null,
    action: 'batch_sort',
    after_data: { items: items.slice(0, 10), updated_count: result.updated_count },
    reason: '管理员批量调整商品排序',
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  }).catch(e => logger.warn('排序审计日志写入失败（非致命）', { error: e.message }))
  return res.apiSuccess(result, `已更新 ${result.updated_count} 个商品排序`)
}))

/** GET /missing-images - 查询缺少图片的兑换商品 */
router.get('/missing-images', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const { page = 1, page_size = 50 } = req.query
  const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')
  const result = await ExchangeAdminService.getMissingImageItems({
    page: parseInt(page),
    page_size: parseInt(page_size)
  })
  return res.apiSuccess(result, `共 ${result.pagination.total} 个商品缺少图片`)
}))

/** POST /batch-bind-images - 批量绑定兑换商品图片 */
router.post('/batch-bind-images', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const { bindings } = req.body
  if (!Array.isArray(bindings) || bindings.length === 0) {
    return res.apiError('bindings 必须是非空数组', 'BAD_REQUEST', null, 400)
  }
  if (bindings.length > 100) {
    return res.apiError('单次批量绑定最多100条', 'BAD_REQUEST', null, 400)
  }
  const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')
  const result = await TransactionManager.execute(
    async transaction => {
      return await ExchangeAdminService.batchBindImages(bindings, { transaction })
    },
    { description: `批量绑定商品图片 ${bindings.length} 条`, maxRetries: 1 }
  )
  return res.apiSuccess(result, `批量绑定完成：成功 ${result.success}，失败 ${result.failed}`)
}))

module.exports = router
