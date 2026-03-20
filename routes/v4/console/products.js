/**
 * @file 统一商品中心 — SPU/SKU 管理路由
 * @description 商品、SKU、笛卡尔生成、库存、兑换渠道定价（写操作统一事务）
 *
 * @version 1.0.0
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * @param {import('express').Request} req - 请求
 * @returns {import('../../../services/product/ProductService')}
 */
function getProductService(req) {
  return req.app.locals.services.getService('unified_product')
}

/**
 * @param {import('express').Request} req - 请求
 * @returns {import('../../../services/product/ExchangeChannelPriceService')}
 */
function getExchangeChannelPriceService(req) {
  return req.app.locals.services.getService('exchange_channel_price')
}

/**
 * GET / — 商品分页列表
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getProductService(req)
    const { category_id, status, space, rarity_code, keyword, page, page_size } = req.query

    const result = await service.listProducts(
      { category_id, status, space, rarity_code, keyword },
      { page, page_size }
    )

    return res.apiSuccess(result, '获取商品列表成功')
  } catch (error) {
    logger.error('获取商品列表失败', { error: error.message })
    return res.apiError(
      `获取商品列表失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_PRODUCT_LIST_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * GET /skus/:sku_id/channel-prices — SKU 全部渠道定价
 */
router.get(
  '/skus/:sku_id/channel-prices',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const priceService = getExchangeChannelPriceService(req)
      const rows = await priceService.getSkuPrices(req.params.sku_id)
      return res.apiSuccess({ prices: rows }, '获取渠道定价成功')
    } catch (error) {
      logger.error('获取渠道定价失败', { sku_id: req.params.sku_id, error: error.message })
      return res.apiError(
        `获取渠道定价失败: ${error.message}`,
        error.code || 'PRODUCT_CENTER_CHANNEL_PRICE_LIST_FAILED',
        null,
        error.statusCode || error.status || 500
      )
    }
  }
)

/**
 * PUT /skus/:sku_id/channel-prices — 批量替换 SKU 渠道定价
 *
 * Body: `{ prices: [...] }`
 */
router.put(
  '/skus/:sku_id/channel-prices',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const priceService = getExchangeChannelPriceService(req)
      const { prices } = req.body || {}

      const rows = await TransactionManager.execute(async transaction => {
        return await priceService.bulkSetPrices(req.params.sku_id, prices, { transaction })
      })

      return res.apiSuccess({ prices: rows }, '设置渠道定价成功')
    } catch (error) {
      logger.error('设置渠道定价失败', { sku_id: req.params.sku_id, error: error.message })
      return res.apiError(
        `设置渠道定价失败: ${error.message}`,
        error.code || 'PRODUCT_CENTER_CHANNEL_PRICE_SET_FAILED',
        null,
        error.statusCode || error.status || 500
      )
    }
  }
)

/**
 * PUT /skus/:sku_id/stock — 库存增量调整
 *
 * Body: `{ delta: number }`
 */
router.put('/skus/:sku_id/stock', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const productService = getProductService(req)
    const { delta } = req.body || {}

    const sku = await TransactionManager.execute(async transaction => {
      return await productService.adjustStock(req.params.sku_id, delta, { transaction })
    })

    return res.apiSuccess(sku.get ? sku.get({ plain: true }) : sku, '调整库存成功')
  } catch (error) {
    logger.error('调整库存失败', { sku_id: req.params.sku_id, error: error.message })
    return res.apiError(
      `调整库存失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_STOCK_ADJUST_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * PUT /skus/:sku_id — 更新 SKU
 */
router.put('/skus/:sku_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const productService = getProductService(req)

    const sku = await TransactionManager.execute(async transaction => {
      return await productService.updateSku(req.params.sku_id, req.body || {}, { transaction })
    })

    return res.apiSuccess(sku.get ? sku.get({ plain: true }) : sku, '更新 SKU 成功')
  } catch (error) {
    logger.error('更新 SKU 失败', { sku_id: req.params.sku_id, error: error.message })
    return res.apiError(
      `更新 SKU 失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_SKU_UPDATE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * DELETE /skus/:sku_id — 删除 SKU
 */
router.delete('/skus/:sku_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const productService = getProductService(req)

    await TransactionManager.execute(async transaction => {
      return await productService.deleteSku(req.params.sku_id, { transaction })
    })

    return res.apiSuccess({ sku_id: parseInt(req.params.sku_id, 10) }, '删除 SKU 成功')
  } catch (error) {
    logger.error('删除 SKU 失败', { sku_id: req.params.sku_id, error: error.message })
    return res.apiError(
      `删除 SKU 失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_SKU_DELETE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * POST /:id/skus/generate — 销售属性笛卡尔积生成 SKU
 *
 * Body: `{ sale_attribute_options: { [attribute_id]: option_id[] } }`
 */
router.post('/:id/skus/generate', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const productService = getProductService(req)
    const { sale_attribute_options } = req.body || {}

    const created = await TransactionManager.execute(async transaction => {
      return await productService.generateSkuCartesian(req.params.id, sale_attribute_options, {
        transaction
      })
    })

    return res.apiSuccess(
      {
        created_count: created.length,
        skus: created.map(s => (s.get ? s.get({ plain: true }) : s))
      },
      '批量生成 SKU 成功'
    )
  } catch (error) {
    logger.error('生成 SKU 失败', { product_id: req.params.id, error: error.message })
    return res.apiError(
      `生成 SKU 失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_SKU_GENERATE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * GET /:id/skus — 商品下 SKU 列表
 */
router.get('/:id/skus', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { ProductSku, SkuAttributeValue, Attribute, AttributeOption, ExchangeChannelPrice } =
      getProductService(req).models

    const pid = parseInt(req.params.id, 10)
    if (Number.isNaN(pid)) {
      return res.apiError('product_id 无效', 'PRODUCT_CENTER_INVALID_PRODUCT_ID', null, 400)
    }

    const rows = await ProductSku.findAll({
      where: { product_id: pid },
      order: [
        ['sort_order', 'ASC'],
        ['sku_id', 'ASC']
      ],
      include: [
        {
          model: SkuAttributeValue,
          as: 'attributeValues',
          required: false,
          include: [
            { model: Attribute, as: 'attribute', required: false },
            { model: AttributeOption, as: 'option', required: false }
          ]
        },
        { model: ExchangeChannelPrice, as: 'channelPrices', required: false }
      ]
    })

    return res.apiSuccess({ items: rows.map(r => r.get({ plain: true })) }, '获取 SKU 列表成功')
  } catch (error) {
    logger.error('获取 SKU 列表失败', { product_id: req.params.id, error: error.message })
    return res.apiError(
      `获取 SKU 列表失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_SKU_LIST_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * POST /:id/skus — 创建 SKU
 */
router.post('/:id/skus', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const productService = getProductService(req)

    const sku = await TransactionManager.execute(async transaction => {
      return await productService.createSku(req.params.id, req.body || {}, { transaction })
    })

    return res.apiSuccess(sku.get ? sku.get({ plain: true }) : sku, '创建 SKU 成功')
  } catch (error) {
    logger.error('创建 SKU 失败', { product_id: req.params.id, error: error.message })
    return res.apiError(
      `创建 SKU 失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_SKU_CREATE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * GET /:id — 商品详情（全量关联）
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getProductService(req)
    const row = await service.getProductDetail(req.params.id)
    if (!row) {
      return res.apiError('商品不存在', 'PRODUCT_CENTER_PRODUCT_NOT_FOUND', null, 404)
    }
    return res.apiSuccess(row.get({ plain: true }), '获取商品详情成功')
  } catch (error) {
    logger.error('获取商品详情失败', { product_id: req.params.id, error: error.message })
    return res.apiError(
      `获取商品详情失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_PRODUCT_DETAIL_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * POST / — 创建商品（SPU）
 */
router.post('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const productService = getProductService(req)

    const created = await TransactionManager.execute(async transaction => {
      return await productService.createProduct(req.body || {}, { transaction })
    })

    return res.apiSuccess(created.get ? created.get({ plain: true }) : created, '创建商品成功')
  } catch (error) {
    logger.error('创建商品失败', { error: error.message })
    return res.apiError(
      `创建商品失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_PRODUCT_CREATE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * PUT /:id — 更新商品
 */
router.put('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const productService = getProductService(req)

    const row = await TransactionManager.execute(async transaction => {
      return await productService.updateProduct(req.params.id, req.body || {}, { transaction })
    })

    return res.apiSuccess(row.get ? row.get({ plain: true }) : row, '更新商品成功')
  } catch (error) {
    logger.error('更新商品失败', { product_id: req.params.id, error: error.message })
    return res.apiError(
      `更新商品失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_PRODUCT_UPDATE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * DELETE /:id — 删除商品
 */
router.delete('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const productService = getProductService(req)

    await TransactionManager.execute(async transaction => {
      return await productService.deleteProduct(req.params.id, { transaction })
    })

    return res.apiSuccess({ product_id: req.params.id }, '删除商品成功')
  } catch (error) {
    logger.error('删除商品失败', { product_id: req.params.id, error: error.message })
    return res.apiError(
      `删除商品失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_PRODUCT_DELETE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

module.exports = router
