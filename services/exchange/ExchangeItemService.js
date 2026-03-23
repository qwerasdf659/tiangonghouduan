/**
 * @file 统一商品中心 — SPU/SKU 读写服务
 * @description 商品列表、详情、SKU 笛卡尔生成、库存调整等（写操作依赖事务）
 */

'use strict'

const { Op } = require('sequelize')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
const BusinessError = require('../../utils/BusinessError')

/** 兑换订单视为「已完成/不可删 SKU」的状态（业务上已占用该 SKU） */
const EXCHANGE_RECORD_BLOCKING_STATUSES = ['approved', 'shipped', 'received', 'rated', 'completed']

/**
 * 统一商品中心服务（实例服务，依赖 models）
 */
class ExchangeItemService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.sequelize = models.sequelize
  }

  /**
   * 分页列表：支持品类、状态、空间、稀有度、名称关键字
   *
   * @param {Object} [filters={}] - 筛选条件
   * @param {number} [filters.category_id] - 品类 ID
   * @param {string} [filters.status] - 商品状态
   * @param {string} [filters.space] - 空间标识
   * @param {string} [filters.rarity_code] - 稀有度编码
   * @param {string} [filters.keyword] - 模糊匹配 item_name
   * @param {Object} [pagination={}] - 分页参数
   * @param {number} [pagination.page=1] - 页码
   * @param {number} [pagination.page_size=20] - 每页条数
   * @returns {Promise<{items:Array,total:number,page:number,page_size:number,total_pages:number}>} 分页结果
   */
  async listExchangeItems(filters = {}, pagination = {}) {
    const { ExchangeItem, Category, RarityDef, MediaFile, ExchangeItemSku, ExchangeChannelPrice } =
      this.models

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const where = {}

    if (filters.category_id != null && filters.category_id !== '') {
      const cid = Number(filters.category_id)
      if (!Number.isNaN(cid)) where.category_id = cid
    }
    if (filters.status) where.status = filters.status
    if (filters.space) where.space = filters.space
    if (filters.rarity_code) where.rarity_code = filters.rarity_code
    if (filters.keyword && String(filters.keyword).trim()) {
      where.item_name = { [Op.like]: `%${String(filters.keyword).trim()}%` }
    }

    const { rows, count } = await ExchangeItem.findAndCountAll({
      where,
      distinct: true,
      limit: pageSize,
      offset,
      order: [
        ['sort_order', 'ASC'],
        ['exchange_item_id', 'DESC']
      ],
      include: [
        { model: Category, as: 'category', required: false },
        { model: RarityDef, as: 'rarityDef', required: false },
        { model: MediaFile, as: 'primary_media', required: false },
        {
          model: ExchangeItemSku,
          as: 'skus',
          required: false,
          separate: true,
          order: [
            ['sort_order', 'ASC'],
            ['sku_id', 'ASC']
          ],
          include: [{ model: ExchangeChannelPrice, as: 'channelPrices', required: false }]
        }
      ]
    })

    const total = typeof count === 'number' ? count : rows.length
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)

    return {
      items: rows,
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages
    }
  }

  /**
   * 商品详情：全量关联（SPU 属性、SKU 销售属性、渠道价）
   *
   * @param {number|string} exchangeItemId - 商品 ID
   * @returns {Promise<Object|null>} 商品详情对象（含关联数据），不存在返回 null
   */
  async getExchangeItemDetail(exchangeItemId) {
    const {
      ExchangeItem,
      Category,
      RarityDef,
      ItemTemplate,
      MediaFile,
      ExchangeItemSku,
      ExchangeItemAttributeValue,
      SkuAttributeValue,
      Attribute,
      AttributeOption,
      ExchangeChannelPrice
    } = this.models

    const pid = Number(exchangeItemId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('exchange_item_id 无效', 'PRODUCT_CENTER_INVALID_PRODUCT_ID', 400)
    }

    return ExchangeItem.findByPk(pid, {
      include: [
        { model: Category, as: 'category', required: false },
        { model: RarityDef, as: 'rarityDef', required: false },
        { model: ItemTemplate, as: 'itemTemplate', required: false },
        { model: MediaFile, as: 'primary_media', required: false },
        {
          model: ExchangeItemAttributeValue,
          as: 'attributeValues',
          required: false,
          include: [{ model: Attribute, as: 'attribute', required: false }]
        },
        {
          model: ExchangeItemSku,
          as: 'skus',
          required: false,
          separate: true,
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
        }
      ]
    })
  }

  /**
   * 创建 SPU
   *
   * @param {Object} data - 商品字段（与 ExchangeItem 模型一致）
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Object>} 创建的商品记录
   */
  async createExchangeItem(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.createExchangeItem')
    const { ExchangeItem } = this.models

    const payload = ExchangeItemService._pickExchangeItemPayload(data)
    const created = await ExchangeItem.create(payload, { transaction })
    logger.info('ExchangeItemService.createExchangeItem 成功', {
      exchange_item_id: created.exchange_item_id,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return created
  }

  /**
   * 更新 SPU
   *
   * @param {number|string} exchangeItemId - 商品 ID
   * @param {Object} data - 要更新的字段
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Object>} 更新后的商品记录
   */
  async updateExchangeItem(exchangeItemId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.updateExchangeItem')
    const { ExchangeItem } = this.models

    const pid = Number(exchangeItemId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('exchange_item_id 无效', 'PRODUCT_CENTER_INVALID_PRODUCT_ID', 400)
    }

    const row = await ExchangeItem.findByPk(pid, { transaction })
    if (!row) {
      throw new BusinessError('商品不存在', 'PRODUCT_CENTER_PRODUCT_NOT_FOUND', 404)
    }

    const payload = ExchangeItemService._pickExchangeItemPayload(data)
    await row.update(payload, { transaction })
    logger.info('ExchangeItemService.updateExchangeItem 成功', {
      exchange_item_id: pid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return row
  }

  /**
   * 硬删除 SPU（级联 SKU / 属性值 / 渠道价，库表 ON DELETE CASCADE）
   *
   * @param {number|string} exchangeItemId - 商品 ID
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<void>} 无返回值，不存在时抛异常
   */
  async deleteExchangeItem(exchangeItemId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.deleteExchangeItem')
    const { ExchangeItem, ExchangeRecord } = this.models

    const pid = Number(exchangeItemId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('exchange_item_id 无效', 'PRODUCT_CENTER_INVALID_PRODUCT_ID', 400)
    }

    const refCount = await ExchangeRecord.count({
      where: { exchange_item_id: pid },
      transaction
    })
    if (refCount > 0) {
      throw new BusinessError(
        `存在 ${refCount} 条兑换记录引用该商品，禁止删除`,
        'PRODUCT_CENTER_PRODUCT_REFERENCED_BY_EXCHANGE',
        409
      )
    }

    const deleted = await ExchangeItem.destroy({ where: { exchange_item_id: pid }, transaction })
    if (!deleted) {
      throw new BusinessError('商品不存在', 'PRODUCT_CENTER_PRODUCT_NOT_FOUND', 404)
    }
    logger.info('ExchangeItemService.deleteExchangeItem 成功', {
      exchange_item_id: pid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
  }

  /**
   * 创建 SKU 及销售属性行
   *
   * @param {number|string} exchangeItemId - 商品 ID
   * @param {Object} data - SKU 数据
   * @param {string} data.sku_code - SKU 编码（唯一）
   * @param {number} [data.stock] - 库存数量
   * @param {number} [data.cost_price] - 成本价
   * @param {string} [data.status] - SKU 状态
   * @param {number} [data.image_id] - 规格图片 ID
   * @param {number} [data.sort_order] - 排序序号
   * @param {Array<{attribute_id:number,option_id:number}>} [data.attribute_values] - 销售属性值
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Object>} 创建的 SKU 记录（含属性值关联）
   */
  async createSku(exchangeItemId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.createSku')
    const { ExchangeItem, ExchangeItemSku, SkuAttributeValue } = this.models

    const pid = Number(exchangeItemId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('exchange_item_id 无效', 'PRODUCT_CENTER_INVALID_PRODUCT_ID', 400)
    }

    const product = await ExchangeItem.findByPk(pid, { transaction })
    if (!product) {
      throw new BusinessError('商品不存在', 'PRODUCT_CENTER_PRODUCT_NOT_FOUND', 404)
    }

    if (!data || !data.sku_code) {
      throw new BusinessError('sku_code 必填', 'PRODUCT_CENTER_SKU_CODE_REQUIRED', 400)
    }

    const sku = await ExchangeItemSku.create(
      {
        exchange_item_id: pid,
        sku_code: String(data.sku_code),
        stock: data.stock != null ? Number(data.stock) : 0,
        cost_price: data.cost_price != null ? data.cost_price : null,
        status: data.status || 'active',
        image_id: data.image_id != null ? data.image_id : null,
        sort_order: data.sort_order != null ? Number(data.sort_order) : 0
      },
      { transaction }
    )

    await ExchangeItemService._replaceSkuAttributeValues(
      this.models,
      sku.sku_id,
      data.attribute_values,
      transaction
    )

    const full = await ExchangeItemSku.findByPk(sku.sku_id, {
      transaction,
      include: [
        {
          model: SkuAttributeValue,
          as: 'attributeValues',
          include: [
            { model: this.models.Attribute, as: 'attribute' },
            { model: this.models.AttributeOption, as: 'option' }
          ]
        }
      ]
    })

    logger.info('ExchangeItemService.createSku 成功', {
      sku_id: sku.sku_id,
      exchange_item_id: pid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return full
  }

  /**
   * 更新 SKU；若传入 attribute_values 则先删后建销售属性行
   *
   * @param {number|string} skuId - SKU ID
   * @param {Object} data - 要更新的字段
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Object>} 更新后的 SKU 记录
   */
  async updateSku(skuId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.updateSku')
    const { ExchangeItemSku, SkuAttributeValue } = this.models

    const sid = Number(skuId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('sku_id 无效', 'PRODUCT_CENTER_INVALID_SKU_ID', 400)
    }

    const sku = await ExchangeItemSku.findByPk(sid, { transaction })
    if (!sku) {
      throw new BusinessError('SKU 不存在', 'PRODUCT_CENTER_SKU_NOT_FOUND', 404)
    }

    const patch = {}
    if (data.sku_code != null) patch.sku_code = String(data.sku_code)
    if (data.stock != null) patch.stock = Number(data.stock)
    if (data.cost_price !== undefined) patch.cost_price = data.cost_price
    if (data.status != null) patch.status = data.status
    if (data.image_id !== undefined) patch.image_id = data.image_id
    if (data.sort_order != null) patch.sort_order = Number(data.sort_order)

    await sku.update(patch, { transaction })

    if (data.attribute_values !== undefined) {
      await SkuAttributeValue.destroy({ where: { sku_id: sid }, transaction })
      await ExchangeItemService._replaceSkuAttributeValues(
        this.models,
        sid,
        data.attribute_values,
        transaction
      )
    }

    const full = await ExchangeItemSku.findByPk(sid, {
      transaction,
      include: [
        {
          model: SkuAttributeValue,
          as: 'attributeValues',
          include: [
            { model: this.models.Attribute, as: 'attribute' },
            { model: this.models.AttributeOption, as: 'option' }
          ]
        },
        { model: this.models.ExchangeChannelPrice, as: 'channelPrices', required: false }
      ]
    })

    logger.info('ExchangeItemService.updateSku 成功', {
      sku_id: sid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return full
  }

  /**
   * 硬删除 SKU
   *
   * @param {number|string} skuId - 要删除的 SKU ID
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<void>} 无返回值，不存在时抛异常
   */
  async deleteSku(skuId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.deleteSku')
    const { ExchangeItemSku, ExchangeChannelPrice, ExchangeRecord } = this.models

    const sid = Number(skuId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('sku_id 无效', 'PRODUCT_CENTER_INVALID_SKU_ID', 400)
    }

    const priceCount = await ExchangeChannelPrice.count({ where: { sku_id: sid }, transaction })
    if (priceCount > 0) {
      throw new BusinessError(
        `存在 ${priceCount} 条兑换渠道定价引用该 SKU，请先移除定价`,
        'PRODUCT_CENTER_SKU_REFERENCED_BY_CHANNEL_PRICE',
        409
      )
    }

    const orderCount = await ExchangeRecord.count({
      where: {
        sku_id: sid,
        status: { [Op.in]: EXCHANGE_RECORD_BLOCKING_STATUSES }
      },
      transaction
    })
    if (orderCount > 0) {
      throw new BusinessError(
        `存在 ${orderCount} 条进行中/已完成兑换订单引用该 SKU，禁止删除`,
        'PRODUCT_CENTER_SKU_REFERENCED_BY_EXCHANGE',
        409
      )
    }

    const deleted = await ExchangeItemSku.destroy({ where: { sku_id: sid }, transaction })
    if (!deleted) {
      throw new BusinessError('SKU 不存在', 'PRODUCT_CENTER_SKU_NOT_FOUND', 404)
    }
    logger.info('ExchangeItemService.deleteSku 成功', {
      sku_id: sid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
  }

  /**
   * 销售属性选项笛卡尔积批量生成 SKU
   *
   * @param {number|string} exchangeItemId - 商品 ID
   * @param {Object<number, number[]>} saleAttributeOptions - attribute_id -> option_id[]
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Array>} 已创建 SKU 列表
   */
  async generateSkuCartesian(exchangeItemId, saleAttributeOptions, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.generateSkuCartesian')
    const { ExchangeItem, ExchangeItemSku, AttributeOption, SkuAttributeValue } = this.models

    const pid = Number(exchangeItemId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('exchange_item_id 无效', 'PRODUCT_CENTER_INVALID_PRODUCT_ID', 400)
    }

    const product = await ExchangeItem.findByPk(pid, { transaction })
    if (!product) {
      throw new BusinessError('商品不存在', 'PRODUCT_CENTER_PRODUCT_NOT_FOUND', 404)
    }

    if (!saleAttributeOptions || typeof saleAttributeOptions !== 'object') {
      throw new BusinessError(
        'saleAttributeOptions 必须为对象',
        'PRODUCT_CENTER_INVALID_CARTESIAN_INPUT',
        400
      )
    }

    const attrKeys = Object.keys(saleAttributeOptions).filter(k => saleAttributeOptions[k]?.length)
    if (attrKeys.length === 0) {
      throw new BusinessError(
        '销售属性选项为空，无法生成 SKU',
        'PRODUCT_CENTER_EMPTY_SALE_ATTRIBUTES',
        400
      )
    }

    const sortedAttrIds = attrKeys.map(k => Number(k)).sort((a, b) => a - b)
    const optionArrays = sortedAttrIds.map(aid => {
      const raw = saleAttributeOptions[aid] || saleAttributeOptions[String(aid)]
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new BusinessError(
          `属性 ${aid} 无有效选项`,
          'PRODUCT_CENTER_INVALID_ATTRIBUTE_OPTIONS',
          400
        )
      }
      return raw.map(oid => ({ attribute_id: aid, option_id: Number(oid) }))
    })

    const combos = ExchangeItemService._cartesian(optionArrays)
    const created = []

    for (const combo of combos) {
      for (const pair of combo) {
        // eslint-disable-next-line no-await-in-loop
        const opt = await AttributeOption.findOne({
          where: { option_id: pair.option_id, attribute_id: pair.attribute_id },
          transaction
        })
        if (!opt) {
          throw new BusinessError(
            `选项不存在或不属于该属性: attribute_id=${pair.attribute_id}, option_id=${pair.option_id}`,
            'PRODUCT_CENTER_INVALID_OPTION',
            400
          )
        }
      }

      const skuCode = ExchangeItemService._buildCartesianSkuCode(pid, combo)
      // eslint-disable-next-line no-await-in-loop
      const existing = await ExchangeItemSku.findOne({ where: { sku_code: skuCode }, transaction })
      if (existing) {
        logger.warn('ExchangeItemService.generateSkuCartesian 跳过已存在 sku_code', {
          sku_code: skuCode
        })
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      const sku = await ExchangeItemSku.create(
        {
          exchange_item_id: pid,
          sku_code: skuCode,
          stock: 0,
          status: 'active',
          sort_order: 0
        },
        { transaction }
      )

      const rows = combo.map(pair => ({
        sku_id: sku.sku_id,
        attribute_id: pair.attribute_id,
        option_id: pair.option_id
      }))
      // eslint-disable-next-line no-await-in-loop
      await SkuAttributeValue.bulkCreate(rows, { transaction })
      created.push(sku)
    }

    logger.info('ExchangeItemService.generateSkuCartesian 完成', {
      exchange_item_id: pid,
      created_count: created.length,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return created
  }

  /**
   * 按增量调整库存（可正可负），结果库存不得小于 0
   *
   * @param {number|string} skuId - SKU ID
   * @param {number} delta - 库存增减量（正数增加，负数减少）
   * @param {Object} [options={}] - 可选配置
   * @param {Object} options.transaction - Sequelize 事务实例
   * @returns {Promise<Object>} 更新后的 SKU
   */
  async adjustStock(skuId, delta, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.adjustStock')
    const { ExchangeItemSku } = this.models

    const sid = Number(skuId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('sku_id 无效', 'PRODUCT_CENTER_INVALID_SKU_ID', 400)
    }

    const d = Number(delta)
    if (!Number.isFinite(d) || !Number.isInteger(d)) {
      throw new BusinessError('delta 必须为整数', 'PRODUCT_CENTER_INVALID_STOCK_DELTA', 400)
    }

    const sku = await ExchangeItemSku.findByPk(sid, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })
    if (!sku) {
      throw new BusinessError('SKU 不存在', 'PRODUCT_CENTER_SKU_NOT_FOUND', 404)
    }

    const next = sku.stock + d
    if (next < 0) {
      throw new BusinessError(
        `库存不足：当前 ${sku.stock}，调整 ${d} 后为 ${next}`,
        'PRODUCT_CENTER_STOCK_WOULD_BE_NEGATIVE',
        409
      )
    }

    await sku.update({ stock: next }, { transaction })
    logger.info('ExchangeItemService.adjustStock 成功', {
      sku_id: sid,
      delta: d,
      new_stock: next,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return sku
  }

  /**
   * 从请求体提取允许写入 ExchangeItem 的字段
   * @private
   * @param {Object} data - 请求体数据
   * @returns {Object} 过滤后的安全字段对象
   */
  static _pickExchangeItemPayload(data) {
    if (!data || typeof data !== 'object') return {}
    const keys = [
      'item_name',
      'category_id',
      'description',
      'primary_media_id',
      'item_template_id',
      'mint_instance',
      'rarity_code',
      'status',
      'sort_order',
      'space',
      'tags',
      'sell_point',
      'usage_rules',
      'video_url',
      'stock_alert_threshold',
      'publish_at',
      'unpublish_at',
      'is_pinned',
      'is_new',
      'is_hot',
      'is_limited',
      'is_recommended',
      'attributes_json'
    ]
    const out = {}
    for (const k of keys) {
      if (data[k] !== undefined) out[k] = data[k]
    }
    return out
  }

  /**
   * 替换 SKU 的属性值（先删后增）
   * @private
   * @param {Object} models - Sequelize 模型集合
   * @param {number} skuId - SKU ID
   * @param {Array<{attribute_id: number, option_id: number}>} attributeValues - 属性值列表
   * @param {Object} transaction - Sequelize 事务实例
   * @returns {Promise<void>} 无返回值
   */
  static async _replaceSkuAttributeValues(models, skuId, attributeValues, transaction) {
    if (!attributeValues || !Array.isArray(attributeValues) || attributeValues.length === 0) {
      return
    }
    const { SkuAttributeValue } = models
    const rows = attributeValues.map(row => ({
      sku_id: skuId,
      attribute_id: Number(row.attribute_id),
      option_id: Number(row.option_id)
    }))
    for (const r of rows) {
      if (Number.isNaN(r.attribute_id) || Number.isNaN(r.option_id)) {
        throw new BusinessError(
          'attribute_values 含非法 attribute_id/option_id',
          'PRODUCT_CENTER_INVALID_SKU_ATTR',
          400
        )
      }
    }
    await SkuAttributeValue.bulkCreate(rows, { transaction })
  }

  /**
   * 多维数组笛卡尔积，元素为 {attribute_id, option_id}
   * @private
   * @param {Array<Array<{attribute_id: number, option_id: number}>>} arrays - 多维属性选项数组
   * @returns {Array<Array<{attribute_id: number, option_id: number}>>} 笛卡尔积组合
   */
  static _cartesian(arrays) {
    if (!arrays.length) return []
    let combos = arrays[0].map(x => [x])
    for (let i = 1; i < arrays.length; i++) {
      const next = []
      for (const c of combos) {
        for (const o of arrays[i]) {
          next.push([...c, o])
        }
      }
      combos = next
    }
    return combos
  }

  /**
   * 根据属性组合生成 SKU 编码（如 P5_1_2__3_4）
   * @private
   * @param {number} exchangeItemId - 商品 ID
   * @param {Array<{attribute_id: number, option_id: number}>} combo - 属性选项组合
   * @returns {string} 生成的 SKU 编码
   */
  static _buildCartesianSkuCode(exchangeItemId, combo) {
    const parts = [...combo]
      .sort((a, b) => a.attribute_id - b.attribute_id)
      .map(p => `${p.attribute_id}_${p.option_id}`)
    return `P${exchangeItemId}_${parts.join('__')}`
  }
}

module.exports = ExchangeItemService
