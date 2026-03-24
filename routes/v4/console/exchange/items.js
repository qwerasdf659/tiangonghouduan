/**
 * @file 统一商品中心 — SPU/SKU 管理路由
 * @description 商品、SKU、笛卡尔生成、库存、兑换渠道定价（写操作统一事务）
 *
 * @version 1.0.0
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger
const { getImageUrl } = require('../../../../utils/ImageUrlHelper')
const multer = require('multer')
const ExcelJS = require('exceljs')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ]
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error(`不支持的文件类型: ${file.mimetype}`), false)
  }
})

/**
 * 将 Sequelize primary_media 关联转换为前端可用的 primary_image 对象
 *
 * @param {Object} row - Sequelize 模型实例或普通对象
 * @returns {Object} 包含 primary_image 的纯对象
 */
function toItemWithImage(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row }
  const media = row.primary_media || plain.primary_media

  if (media && typeof media.getPublicUrl === 'function') {
    const thumbs = media.getThumbnailUrls()
    plain.primary_image = {
      primary_media_id: media.media_id,
      url: media.getPublicUrl(),
      mime: media.mime_type,
      thumbnail_url: thumbs?.small || media.getPublicUrl()
    }
  } else if (media?.object_key) {
    plain.primary_image = {
      primary_media_id: media.media_id,
      url: getImageUrl(media.object_key),
      mime: media.mime_type,
      thumbnail_url: media.thumbnail_keys?.small
        ? getImageUrl(media.thumbnail_keys.small)
        : getImageUrl(media.object_key)
    }
  } else {
    plain.primary_image = null
  }
  delete plain.primary_media
  return plain
}

/**
 * 获取兑换商品服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ExchangeItemService 实例
 */
function getExchangeItemService(req) {
  return req.app.locals.services.getService('exchange_item_service')
}

/**
 * 获取渠道定价服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ExchangeChannelPriceService 实例
 */
function getExchangeChannelPriceService(req) {
  return req.app.locals.services.getService('exchange_channel_price')
}

/**
 * GET / — 商品分页列表
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getExchangeItemService(req)
    const { category_id, status, space, rarity_code, keyword, page, page_size } = req.query

    const result = await service.listExchangeItems(
      { category_id, status, space, rarity_code, keyword },
      { page, page_size }
    )

    result.items = (result.items || []).map(toItemWithImage)

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
 * GET /export — 导出兑换商品（Excel）
 *
 * 注意：必须定义在 GET /:id 之前，否则 "export" 会被 Express 当成 :id 参数
 */
router.get('/export', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const exchangeItemService = getExchangeItemService(req)
    const { status, category_id, keyword, limit = 1000 } = req.query
    const exportLimit = Math.min(Math.max(1, parseInt(limit) || 1000), 10000)

    const result = await exchangeItemService.listExchangeItems(
      { status, category_id, keyword },
      { page: 1, page_size: exportLimit }
    )
    const rows = result.items || []

    if (rows.length === 0) {
      return res.apiError('没有符合条件的商品数据', 'NO_DATA', null, 404)
    }

    const exportData = rows.map((item, idx) => {
      const plain = item.get ? item.get({ plain: true }) : { ...item }
      return {
        序号: idx + 1,
        商品ID: plain.exchange_item_id,
        商品名称: plain.item_name || '',
        品类ID: plain.category_id || '',
        状态: plain.status || '',
        稀有度: plain.rarity_code || '',
        空间: plain.space || '',
        排序: plain.sort_order ?? 0,
        描述: plain.description || '',
        卖点: plain.sell_point || '',
        使用规则: plain.usage_rules || '',
        置顶: plain.is_pinned ? '是' : '否',
        推荐: plain.is_recommended ? '是' : '否',
        新品: plain.is_new ? '是' : '否',
        热门: plain.is_hot ? '是' : '否',
        限量: plain.is_limited ? '是' : '否'
      }
    })

    const timestamp = BeijingTimeHelper.format(new Date(), 'YYYYMMDD_HHmmss')
    const fileName = `兑换商品导出_${timestamp}`

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('兑换商品')
    const colKeys = Object.keys(exportData[0])
    worksheet.columns = colKeys.map(key => ({ header: key, key, width: 18 }))
    worksheet.getRow(1).font = { bold: true }
    worksheet.addRows(exportData)

    const excelBuffer = Buffer.from(await workbook.xlsx.writeBuffer())

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}.xlsx"`
    )

    logger.info('兑换商品导出成功', {
      admin_id: req.user.user_id,
      record_count: exportData.length
    })

    return res.send(excelBuffer)
  } catch (error) {
    logger.error('兑换商品导出失败', { error: error.message })
    return res.apiError(error.message || '导出失败', 'EXPORT_ERROR', null, 500)
  }
})

/**
 * POST /import — 批量导入兑换商品（Excel/CSV）
 *
 * 必填列：商品名称；可选列：品类ID、状态、稀有度、空间、描述 等。
 * 若 Excel 行包含「商品ID」列且值非空，视为更新；否则视为新建。
 */
router.post(
  '/import',
  authenticateToken,
  requireRoleLevel(100),
  uploadExcel.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.apiError('请上传 Excel 文件（字段名 file）', 'BAD_REQUEST', null, 400)
      }

      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(req.file.buffer)
      const worksheet = workbook.getWorksheet(1)
      if (!worksheet) {
        return res.apiError('Excel 文件中未找到工作表', 'BAD_REQUEST', null, 400)
      }

      const headerRow = worksheet.getRow(1)
      const headers = []
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = String(cell.value || '').trim()
      })

      const COLUMN_MAP = {
        商品ID: 'exchange_item_id',
        商品名称: 'item_name',
        品类ID: 'category_id',
        状态: 'status',
        稀有度: 'rarity_code',
        空间: 'space',
        排序: 'sort_order',
        描述: 'description',
        卖点: 'sell_point',
        使用规则: 'usage_rules'
      }

      const itemRows = []
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        const record = {}
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber]
          const field = COLUMN_MAP[header]
          if (field) {
            record[field] = cell.value
          }
        })
        if (record.item_name) {
          record._row_number = rowNumber
          itemRows.push(record)
        }
      })

      if (itemRows.length === 0) {
        return res.apiError(
          'Excel 中未找到有效商品数据（需包含「商品名称」列）',
          'NO_DATA',
          null,
          400
        )
      }
      if (itemRows.length > 500) {
        return res.apiError('单次导入最多 500 条', 'BAD_REQUEST', null, 400)
      }

      const exchangeItemService = getExchangeItemService(req)
      let successCount = 0
      let updateCount = 0
      let failCount = 0
      const errors = []

      await TransactionManager.execute(async transaction => {
        for (const record of itemRows) {
          try {
            const { _row_number, exchange_item_id, ...data } = record
            if (exchange_item_id) {
              await exchangeItemService.updateExchangeItem(exchange_item_id, data, { transaction })
              updateCount++
            } else {
              await exchangeItemService.createExchangeItem(data, { transaction })
            }
            successCount++
          } catch (err) {
            failCount++
            errors.push({
              row: record._row_number,
              item_name: record.item_name,
              error: err.message
            })
          }
        }
      })

      logger.info('兑换商品批量导入完成', {
        admin_id: req.user.user_id,
        total: itemRows.length,
        success_count: successCount,
        update_count: updateCount,
        fail_count: failCount
      })

      return res.apiSuccess(
        {
          total: itemRows.length,
          success_count: successCount,
          update_count: updateCount,
          fail_count: failCount,
          errors
        },
        `导入完成: 成功 ${successCount}（其中更新 ${updateCount}），失败 ${failCount}`
      )
    } catch (error) {
      logger.error('兑换商品导入失败', { error: error.message })
      return res.apiError(error.message || '导入失败', 'IMPORT_ERROR', null, 500)
    }
  }
)

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
    const exchangeItemService = getExchangeItemService(req)
    const { delta } = req.body || {}

    const sku = await TransactionManager.execute(async transaction => {
      return await exchangeItemService.adjustStock(req.params.sku_id, delta, { transaction })
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
    const exchangeItemService = getExchangeItemService(req)

    const sku = await TransactionManager.execute(async transaction => {
      return await exchangeItemService.updateSku(req.params.sku_id, req.body || {}, { transaction })
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
    const exchangeItemService = getExchangeItemService(req)

    await TransactionManager.execute(async transaction => {
      return await exchangeItemService.deleteSku(req.params.sku_id, { transaction })
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
    const exchangeItemService = getExchangeItemService(req)
    const { sale_attribute_options } = req.body || {}

    const created = await TransactionManager.execute(async transaction => {
      return await exchangeItemService.generateSkuCartesian(req.params.id, sale_attribute_options, {
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
    logger.error('生成 SKU 失败', { exchange_item_id: req.params.id, error: error.message })
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
    const { ExchangeItemSku, SkuAttributeValue, Attribute, AttributeOption, ExchangeChannelPrice } =
      getExchangeItemService(req).models

    const pid = parseInt(req.params.id, 10)
    if (Number.isNaN(pid)) {
      return res.apiError('exchange_item_id 无效', 'PRODUCT_CENTER_INVALID_PRODUCT_ID', null, 400)
    }

    const rows = await ExchangeItemSku.findAll({
      where: { exchange_item_id: pid },
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
    logger.error('获取 SKU 列表失败', { exchange_item_id: req.params.id, error: error.message })
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
    const exchangeItemService = getExchangeItemService(req)

    const sku = await TransactionManager.execute(async transaction => {
      return await exchangeItemService.createSku(req.params.id, req.body || {}, { transaction })
    })

    return res.apiSuccess(sku.get ? sku.get({ plain: true }) : sku, '创建 SKU 成功')
  } catch (error) {
    logger.error('创建 SKU 失败', { exchange_item_id: req.params.id, error: error.message })
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
    const service = getExchangeItemService(req)
    const row = await service.getExchangeItemDetail(req.params.id)
    if (!row) {
      return res.apiError('商品不存在', 'PRODUCT_CENTER_PRODUCT_NOT_FOUND', null, 404)
    }
    return res.apiSuccess(toItemWithImage(row), '获取商品详情成功')
  } catch (error) {
    logger.error('获取商品详情失败', { exchange_item_id: req.params.id, error: error.message })
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
    const exchangeItemService = getExchangeItemService(req)

    const created = await TransactionManager.execute(async transaction => {
      return await exchangeItemService.createExchangeItem(req.body || {}, { transaction })
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
    const exchangeItemService = getExchangeItemService(req)

    const row = await TransactionManager.execute(async transaction => {
      return await exchangeItemService.updateExchangeItem(req.params.id, req.body || {}, {
        transaction
      })
    })

    return res.apiSuccess(row.get ? row.get({ plain: true }) : row, '更新商品成功')
  } catch (error) {
    logger.error('更新商品失败', { exchange_item_id: req.params.id, error: error.message })
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
    const exchangeItemService = getExchangeItemService(req)

    await TransactionManager.execute(async transaction => {
      return await exchangeItemService.deleteExchangeItem(req.params.id, { transaction })
    })

    return res.apiSuccess({ exchange_item_id: req.params.id }, '删除商品成功')
  } catch (error) {
    logger.error('删除商品失败', { exchange_item_id: req.params.id, error: error.message })
    return res.apiError(
      `删除商品失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_PRODUCT_DELETE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

module.exports = router
