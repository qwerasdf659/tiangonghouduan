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
const ProductCodeGenerator = require('../../utils/ProductCodeGenerator')
const SeriesSeqAllocator = require('../../utils/SeriesSeqAllocator')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

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
   * @param {string} [filters.item_type] - 频道筛选：关联模板 item_type（prop=道具商城/星石轨，product/voucher=实物兑换）
   * @param {Object} [pagination={}] - 分页参数
   * @param {number} [pagination.page=1] - 页码
   * @param {number} [pagination.page_size=20] - 每页条数
   * @returns {Promise<{items:Array,total:number,page:number,page_size:number,total_pages:number}>} 分页结果
   */
  async listExchangeItems(filters = {}, pagination = {}) {
    const {
      ExchangeItem,
      Category,
      RarityDef,
      MediaFile,
      ExchangeItemSku,
      ExchangeChannelPrice,
      ItemTemplate
    } = this.models

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
      /*
       * 管理端关键词搜索（编码 + 名称双入口，商品编码体系 §8.3 必备项2）：
       * - 命中 SP 编码格式（容错大小写/横线/空格）→ item_code 精确匹配；
       * - 命中 SK 编码格式 → 反查 SKU 所属 SPU 精确定位；
       * - 未命中编码格式 → item_name 模糊匹配（原有行为）。
       */
      const trimmedKeyword = String(filters.keyword).trim()
      const codeHit = ProductCodeGenerator.detect(trimmedKeyword)
      if (codeHit.matched && codeHit.prefix === 'SP') {
        where.item_code = codeHit.normalized
      } else if (codeHit.matched && codeHit.prefix === 'SK') {
        const skuRow = await ExchangeItemSku.findOne({
          where: { sku_code: codeHit.normalized },
          attributes: ['exchange_item_id']
        })
        // SK 码未命中给不可能 ID，返回空列表（编码查询语义是精确查找，不做模糊兜底）
        where.exchange_item_id = skuRow ? skuRow.exchange_item_id : -1
      } else {
        where.item_name = { [Op.like]: `%${trimmedKeyword}%` }
      }
    }
    /*
     * 低库存预警筛选（看板三 2026-06-24）：仅看 active 且 SPU 库存 <= 预警阈值（stock_alert_threshold，默认 5）。
     * stock 与 stock_alert_threshold 同在 exchange_items 表，用 Sequelize.literal 做列间比较，复用现有列零新表。
     */
    if (filters.low_stock_only === true || filters.low_stock_only === 'true') {
      where.status = 'active'
      where.stock = {
        [Op.lte]: this.sequelize.literal('COALESCE(`ExchangeItem`.`stock_alert_threshold`, 5)')
      }
    }

    /*
     * 频道筛选（道具商城/星石轨）：按关联模板 item_type 服务端筛选。
     * exchange_items 自身无 item_type 列，频道语义在 item_templates.item_type；
     * 传 item_type 时用 itemTemplate 关联 required:true + where 做 INNER JOIN 精确筛选，
     * 不传则不约束（实物兑换市场看全部）。复用现有 itemTemplate 关联，零新表。
     */
    const filterItemType = filters.item_type && String(filters.item_type).trim()

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
        // 所属产品系列（连号系列号轨道，可空）：管理端列表/手册导出展示 series_code + series_seq
        {
          model: this.models.ProductSeries,
          as: 'series',
          attributes: ['series_id', 'series_code', 'series_name', 'seq_pad'],
          required: false
        },
        {
          model: ItemTemplate,
          as: 'itemTemplate',
          required: !!filterItemType,
          attributes: ['item_template_id', 'item_type'],
          where: filterItemType ? { item_type: filterItemType } : undefined
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
        // 所属产品系列（连号系列号轨道，可空）：详情页展示系列号 series_code-series_seq
        {
          model: this.models.ProductSeries,
          as: 'series',
          attributes: ['series_id', 'series_code', 'series_name', 'seq_pad'],
          required: false
        },
        // 供应商关联行（多供应商 + 各自货号 + 主供货商标记，商品编码体系 §3.8）
        {
          model: this.models.ExchangeItemSupplier,
          as: 'supplierLinks',
          required: false,
          include: [
            {
              model: this.models.Supplier,
              as: 'supplier',
              attributes: ['supplier_id', 'supplier_name', 'status'],
              required: false
            }
          ]
        },
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

    // 商品名称必填（写入口合约校验：空名商品无法在商城/配方/订单快照中被辨识）
    if (!payload.item_name || !String(payload.item_name).trim()) {
      throw new BusinessError('商品名称（item_name）不能为空', 'PRODUCT_CENTER_NAME_REQUIRED', 400)
    }
    payload.item_name = String(payload.item_name).trim()

    /*
     * 铸造模板守卫（2026-07-11，方案文档 §十二-C.2 落地）：mint_instance=true（兑换后铸造
     * 物品实例进背包，模型默认值即 true）的商品必须关联 item_template_id——无模板铸造会产生
     * "模板血统缺失"的缺陷物品（无参考价、无法投入换物、方向守卫按 0 比较形同虚设）。
     * 创建时按最终落库值判定：payload 未传 mint_instance 时取模型默认 true。
     */
    const willMintOnCreate = payload.mint_instance === undefined ? true : !!payload.mint_instance
    ExchangeItemService._assertMintInstanceHasTemplate(willMintOnCreate, payload.item_template_id)

    /*
     * 新建强制草稿态（2026-07-17 上架护栏）：新建商品此刻尚无 SKU/价格，一律落 inactive，
     * 待运营配好规格与价格后再经 updateExchangeItem 显式上架（届时走 _assertItemPublishable）。
     * 防止"新建即 active（默认值）"导致无 SKU 半成品泄漏到小程序。
     */
    payload.status = 'inactive'

    // 生成 SPU 平台展示码 item_code（无意义随机码 SP+12 位，唯一索引兜底，撞码重试）
    payload.item_code = await ProductCodeGenerator.generateUnique('SP', async code => {
      const existing = await ExchangeItem.findOne({ where: { item_code: code }, transaction })
      return !existing
    })

    // 选填系列：归入系列时在事务内分配连续序号 series_seq（行锁防并发重号）
    if (payload.series_id != null) {
      const { series_seq } = await SeriesSeqAllocator.allocate(payload.series_id, transaction)
      payload.series_seq = series_seq
    }

    const created = await ExchangeItem.create(payload, { transaction })

    // C 端商品列表缓存失效（写路径收口后由唯一权威路径统一维护，2026-07-11）
    await BusinessCacheHelper.invalidateExchangeItems('item_created')

    logger.info('ExchangeItemService.createExchangeItem 成功', {
      exchange_item_id: created.exchange_item_id,
      item_code: created.item_code,
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

    // 商品名称合约校验（仅在本次更新携带该字段时检查，禁止清空为空名）
    if (payload.item_name !== undefined) {
      if (!payload.item_name || !String(payload.item_name).trim()) {
        throw new BusinessError(
          '商品名称（item_name）不能为空',
          'PRODUCT_CENTER_NAME_REQUIRED',
          400
        )
      }
      payload.item_name = String(payload.item_name).trim()
    }

    /*
     * 铸造模板守卫（与 createExchangeItem 同口径）：按"更新后的最终状态"判定——
     * payload 未传的字段沿用现有行值，防止只改 mint_instance 或只清空模板时绕过校验。
     */
    const willMintAfterUpdate =
      payload.mint_instance === undefined ? !!row.mint_instance : !!payload.mint_instance
    const templateAfterUpdate =
      payload.item_template_id === undefined ? row.item_template_id : payload.item_template_id
    ExchangeItemService._assertMintInstanceHasTemplate(willMintAfterUpdate, templateAfterUpdate)

    /*
     * 上架护栏（2026-07-17）：本次更新要把商品置为 active（上架）时，
     * 强制校验已有可售 SKU + 有效价格，杜绝无 SKU 半成品上架泄漏到小程序。
     * 仅在"目标状态为 active 且当前不是 active（即发生上架动作）"时校验，避免编辑已上架商品其它字段时误拦。
     */
    if (payload.status === 'active' && row.status !== 'active') {
      await this._assertItemPublishable(pid, transaction)
    }

    await row.update(payload, { transaction })

    // C 端商品列表缓存失效（名称/状态/上下架等变更即时可见）
    await BusinessCacheHelper.invalidateExchangeItems('item_updated')

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

    // C 端商品列表缓存失效（已删商品即时下架不残留）
    await BusinessCacheHelper.invalidateExchangeItems('item_deleted')

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

    /*
     * sku_code 统一由系统生成（商品编码体系落地）：
     * 移除人工传入口子，所有 SKU 码统一为无意义随机码 SK+12 位规范形（ProductCodeGenerator），
     * 唯一索引兜底、撞码重试，杜绝人工填错与属性语义耦合。
     */
    const skuCode = await this._generateUniqueSkuCode(transaction)

    const sku = await ExchangeItemSku.create(
      {
        exchange_item_id: pid,
        sku_code: skuCode,
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

    await this.syncSpuSummary(pid, transaction)

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
    // sku_code 为系统生成的不可变展示码，不接受人工修改（编码体系铁律：杜绝人工填错）
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

    await this.syncSpuSummary(sku.exchange_item_id, transaction)

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

    const skuRow = await ExchangeItemSku.findByPk(sid, { transaction })
    if (!skuRow) {
      throw new BusinessError('SKU 不存在', 'PRODUCT_CENTER_SKU_NOT_FOUND', 404)
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
    await this.syncSpuSummary(skuRow.exchange_item_id, transaction)
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

    /*
     * 幂等去重（编码体系落地后由"属性组合签名"判断，替代旧的按确定性编码去重）：
     * sku_code 已改为无意义随机码，无法再靠编码识别"同一组合"；改为以该 SPU 现有 SKU 的
     * 销售属性值集合作为签名，重复组合跳过创建，保证重复调用不产生重复 SKU（业务语义更准）。
     */
    const comboSignature = pairs =>
      [...pairs]
        .sort((a, b) => a.attribute_id - b.attribute_id)
        .map(p => `${p.attribute_id}:${p.option_id}`)
        .join('__')

    const existingSkus = await ExchangeItemSku.findAll({
      where: { exchange_item_id: pid },
      include: [{ model: SkuAttributeValue, as: 'attributeValues', required: false }],
      transaction
    })
    const existingSignatures = new Set(
      existingSkus.map(s =>
        comboSignature(
          (s.attributeValues || []).map(v => ({
            attribute_id: v.attribute_id,
            option_id: v.option_id
          }))
        )
      )
    )

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

      const signature = comboSignature(combo)
      if (existingSignatures.has(signature)) {
        logger.warn('ExchangeItemService.generateSkuCartesian 跳过已存在属性组合', { signature })
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      const skuCode = await this._generateUniqueSkuCode(transaction)
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
      existingSignatures.add(signature)
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
    await this.syncSpuSummary(sku.exchange_item_id, transaction)
    logger.info('ExchangeItemService.adjustStock 成功', {
      sku_id: sid,
      delta: d,
      new_stock: next,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return sku
  }

  /**
   * 回填 SPU 物化汇总列（议题1：stock/sold_count/min_cost_amount/max_cost_amount/min_cost_asset_code）
   *
   * 与 admin SkuService/ItemManagementService/BatchOperationService 的同名回填逻辑完全同口径，
   * 保证「SKU/渠道价任意写路径」之后 SPU 物化列与 active SKU 聚合实时一致，
   * 避免小程序兑换/道具列表读到陈旧 stock（修复前本服务的 adjustStock/updateSku/createSku/deleteSku 漏回填）。
   *
   * 公有方法：兑换核心 CoreService（用户兑换扣库存、退款回补库存）等跨服务写库存路径，
   * 也必须在改动 SKU 库存后调用本方法回填 SPU 汇总，确保库存权威（SKU）与展示列（SPU）全链路一致。
   *
   * @param {number} exchangeItemId - SPU 商品 ID
   * @param {Object} transaction - Sequelize 事务实例（必传，与写操作同事务）
   * @returns {Promise<void>} 回填完成（无返回值）
   */
  async syncSpuSummary(exchangeItemId, transaction) {
    const { ExchangeItem, ExchangeItemSku } = this.models

    const [skuSummary] = await ExchangeItemSku.findAll({
      where: { exchange_item_id: exchangeItemId, status: 'active' },
      attributes: [
        [this.sequelize.fn('SUM', this.sequelize.col('stock')), 'total_stock'],
        [this.sequelize.fn('SUM', this.sequelize.col('sold_count')), 'total_sold']
      ],
      raw: true,
      transaction
    })

    const [priceSummary] = await this.sequelize.query(
      `SELECT MIN(ecp.cost_amount) AS min_cost, MAX(ecp.cost_amount) AS max_cost,
              SUBSTRING_INDEX(
                GROUP_CONCAT(ecp.cost_asset_code ORDER BY ecp.cost_amount ASC SEPARATOR ','),
                ',', 1
              ) AS min_cost_asset_code
       FROM exchange_item_skus ps
       JOIN exchange_channel_prices ecp ON ecp.sku_id = ps.sku_id AND ecp.is_enabled = 1
       WHERE ps.exchange_item_id = :productId AND ps.status = 'active'`,
      {
        replacements: { productId: exchangeItemId },
        type: this.sequelize.QueryTypes.SELECT,
        transaction
      }
    )

    await ExchangeItem.update(
      {
        stock: parseInt(skuSummary.total_stock) || 0,
        sold_count: parseInt(skuSummary.total_sold) || 0,
        min_cost_amount: priceSummary?.min_cost !== null ? parseInt(priceSummary.min_cost) : null,
        max_cost_amount: priceSummary?.max_cost !== null ? parseInt(priceSummary.max_cost) : null,
        min_cost_asset_code: priceSummary?.min_cost_asset_code || null
      },
      { where: { exchange_item_id: exchangeItemId }, transaction }
    )
  }

  /**
   * 铸造模板守卫断言：需铸造实例（mint_instance=true）的商品必须关联物品模板
   *
   * 业务背景（2026-07-11 根因修复）：模板是物品实例的"血统"——承载参考价（换物方向守卫价值锚）、
   * 物品类型（履约分流判定）与权益定义；无模板铸造出的物品无法投入换物、无法定价，属缺陷数据。
   *
   * @private
   * @param {boolean} willMint - 最终落库的 mint_instance 值
   * @param {number|null|undefined} templateId - 最终落库的 item_template_id 值
   * @returns {void} 校验通过无返回，违规抛 BusinessError(400)
   */
  static _assertMintInstanceHasTemplate(willMint, templateId) {
    if (willMint && !templateId) {
      throw new BusinessError(
        '需铸造实例的商品（mint_instance=true）必须关联物品模板（item_template_id）——模板承载参考价与物品类型，无模板铸造会产生缺陷物品',
        'PRODUCT_CENTER_TEMPLATE_REQUIRED',
        400
      )
    }
  }

  /**
   * 上架护栏断言：商品置为 active（上架）前，必须已配好可售 SKU + 有效价格
   *
   * 业务背景（2026-07-17 根因修复）：exchange_items.status 默认 active，若运营新建后
   * 未加 SKU/价格就上架，小程序列表（仅按 status='active' 过滤）会拉到这个"半成品"，
   * 用户点进详情因无 SKU/价格报"加载异常"，严重影响体验。故上架时强制校验：
   *   ① 至少 1 个 status='active' 的 SKU；
   *   ② 该商品在 exchange_channel_prices 有 is_enabled=1 的有效渠道价（cost_amount）。
   *
   * @private
   * @param {number} exchangeItemId - 商品 ID
   * @param {Object} transaction - Sequelize 事务
   * @returns {Promise<void>} 校验通过无返回，违规抛 BusinessError(400)
   */
  async _assertItemPublishable(exchangeItemId, transaction) {
    const { ExchangeItemSku } = this.models
    const activeSkuCount = await ExchangeItemSku.count({
      where: { exchange_item_id: exchangeItemId, status: 'active' },
      transaction
    })
    if (activeSkuCount === 0) {
      throw new BusinessError(
        '上架失败：商品必须先添加至少一个启用的规格（SKU）才能上架，请先配置规格与价格',
        'PRODUCT_CENTER_NO_ACTIVE_SKU',
        400
      )
    }

    // 校验存在有效渠道价（active SKU 关联 is_enabled=1 且 cost_amount>0 的渠道价）
    const [priceRow] = await this.sequelize.query(
      `SELECT COUNT(*) AS cnt
       FROM exchange_item_skus s
       JOIN exchange_channel_prices ecp ON ecp.sku_id = s.sku_id AND ecp.is_enabled = 1
       WHERE s.exchange_item_id = :pid AND s.status = 'active' AND ecp.cost_amount > 0`,
      { replacements: { pid: exchangeItemId }, type: this.sequelize.QueryTypes.SELECT, transaction }
    )
    if (!priceRow || Number(priceRow.cnt) === 0) {
      throw new BusinessError(
        '上架失败：商品的规格必须设置有效的兑换价格才能上架，请先为规格配置价格',
        'PRODUCT_CENTER_NO_VALID_PRICE',
        400
      )
    }
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
      'fulfillment_type',
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
      'attributes_json',
      'max_quantity_per_order',
      // 商品编码体系：所属系列可选（series_seq 由系统在事务内发号，item_code 由系统生成，均不接受人工传入）
      'series_id',
      // 门店专属兑换券业务线：核销范围配置（前端零映射直传后端字段）
      'applicable_scope',
      'scoped_store_ids',
      'merchant_id'
    ]
    const out = {}
    for (const k of keys) {
      if (data[k] !== undefined) out[k] = data[k]
    }
    // 核销范围归一化：仅当传入 applicable_scope 时整体重算三字段，保证范围类型与门店/商家一致
    if (out.applicable_scope !== undefined) {
      const scope = ExchangeItemService._normalizeApplicableScope(out)
      out.applicable_scope = scope.applicable_scope
      out.scoped_store_ids = scope.scoped_store_ids
      out.merchant_id = scope.merchant_id
    }
    return out
  }

  /**
   * 归一化「核销范围」配置（门店专属兑换券业务线，后端权威）
   *
   * - all（默认/通用券）：scoped_store_ids=NULL，merchant_id=NULL
   * - specified_stores：必须给 scoped_store_ids（门店ID数组去重取整），merchant_id=NULL
   * - merchant_all（方案 M1）：必须给 merchant_id（商品归属商家），scoped_store_ids=NULL
   *
   * @private
   * @param {Object} data - 含 applicable_scope/scoped_store_ids/merchant_id 的对象
   * @returns {Object} 归一化后的 { applicable_scope, scoped_store_ids, merchant_id }
   * @throws {BusinessError} 范围类型非法或必填缺失（避免建出"范围为空"的废券）
   */
  static _normalizeApplicableScope(data = {}) {
    const scope = data.applicable_scope || 'all'
    const validScopes = ['all', 'specified_stores', 'merchant_all']
    if (!validScopes.includes(scope)) {
      throw new BusinessError(
        `无效的 applicable_scope，允许值：${validScopes.join(', ')}`,
        'PRODUCT_CENTER_INVALID_PARAM',
        400
      )
    }
    if (scope === 'specified_stores') {
      const raw = Array.isArray(data.scoped_store_ids) ? data.scoped_store_ids : []
      const ids = [...new Set(raw.map(n => parseInt(n, 10)).filter(Number.isInteger))]
      if (ids.length === 0) {
        throw new BusinessError(
          '核销范围为「指定门店」时，必须至少选择一个门店',
          'PRODUCT_CENTER_INVALID_PARAM',
          400
        )
      }
      return { applicable_scope: scope, scoped_store_ids: ids, merchant_id: null }
    }
    if (scope === 'merchant_all') {
      const mid = parseInt(data.merchant_id, 10)
      if (!Number.isInteger(mid)) {
        throw new BusinessError(
          '核销范围为「商家全门店」时，必须指定归属商家 merchant_id',
          'PRODUCT_CENTER_INVALID_PARAM',
          400
        )
      }
      return { applicable_scope: scope, scoped_store_ids: null, merchant_id: mid }
    }
    return { applicable_scope: 'all', scoped_store_ids: null, merchant_id: null }
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
   * 生成全局唯一的 SKU 平台展示码（无意义随机码 SK+12 位规范形）
   *
   * 编码体系铁律：sku_code 不含业务语义，统一由 ProductCodeGenerator 生成，唯一索引兜底、
   * 撞码重试，5 次仍冲突则显式抛错（不静默兜底）。手动建单与笛卡尔批量均收口到此方法。
   *
   * @param {Object} transaction - Sequelize 事务实例（与调用方同一事务，唯一性在事务内校验）
   * @returns {Promise<string>} 唯一的 sku_code（SK+12 位，长度 14，符合模型约束）
   * @private
   */
  async _generateUniqueSkuCode(transaction) {
    const { ExchangeItemSku } = this.models
    try {
      return await ProductCodeGenerator.generateUnique('SK', async code => {
        const existing = await ExchangeItemSku.findOne({ where: { sku_code: code }, transaction })
        return !existing
      })
    } catch (error) {
      throw new BusinessError(
        `sku_code 自动生成失败：${error.message}`,
        'PRODUCT_CENTER_SKU_CODE_GENERATE_FAILED',
        500
      )
    }
  }

  /**
   * 查询品类列表（扁平，含图标媒体）
   *
   * @returns {Promise<Array<Object>>} 品类 plain 行列表
   */
  async listCategories() {
    const { Category, MediaFile } = this.models
    const rows = await Category.findAll({
      order: [
        ['level', 'ASC'],
        ['sort_order', 'ASC'],
        ['category_id', 'ASC']
      ],
      include: [{ model: MediaFile, as: 'icon_media', required: false }]
    })
    return rows.map(r => r.get({ plain: true }))
  }

  /**
   * 查询品类详情（含直接子节点）
   *
   * @param {number} category_id - 品类ID
   * @returns {Promise<Object|null>} 品类 plain 行或 null
   */
  async getCategoryDetail(category_id) {
    const { Category, MediaFile } = this.models
    const row = await Category.findByPk(category_id, {
      include: [
        { model: MediaFile, as: 'icon_media', required: false },
        {
          model: Category,
          as: 'children',
          required: false,
          separate: true,
          order: [
            ['sort_order', 'ASC'],
            ['category_id', 'ASC']
          ]
        }
      ]
    })
    return row ? row.get({ plain: true }) : null
  }

  /**
   * 创建品类
   *
   * @param {Object} data - 品类数据
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 创建的品类 plain 行
   */
  async createCategory(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.createCategory')
    const { Category } = this.models
    const {
      category_name,
      category_code,
      parent_category_id,
      level,
      sort_order,
      is_enabled,
      icon_media_id
    } = data

    const created = await Category.create(
      {
        category_name: String(category_name).trim(),
        category_code: String(category_code).trim(),
        parent_category_id:
          parent_category_id === undefined ||
          parent_category_id === null ||
          parent_category_id === ''
            ? null
            : Number(parent_category_id),
        level: level != null ? Number(level) : 1,
        sort_order: sort_order != null ? Number(sort_order) : 0,
        is_enabled: is_enabled === undefined ? true : Boolean(is_enabled),
        icon_media_id:
          icon_media_id === undefined || icon_media_id === null || icon_media_id === ''
            ? null
            : icon_media_id
      },
      { transaction }
    )
    return created.get({ plain: true })
  }

  /**
   * 更新品类（仅白名单字段）
   *
   * @param {number} category_id - 品类ID
   * @param {Object} patch - 更新字段
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 更新后的品类 plain 行
   */
  async updateCategory(category_id, patch, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.updateCategory')
    const { Category } = this.models
    const row = await Category.findByPk(category_id, { transaction, lock: transaction.LOCK.UPDATE })
    if (!row) {
      throw new BusinessError('品类不存在', 'PRODUCT_CENTER_CATEGORY_NOT_FOUND', 404, {
        category_id
      })
    }

    const allowed = [
      'category_name',
      'category_code',
      'parent_category_id',
      'level',
      'sort_order',
      'is_enabled',
      'icon_media_id'
    ]
    const data = {}
    for (const k of allowed) {
      if (patch[k] !== undefined) {
        if (k === 'parent_category_id') {
          data[k] = patch[k] === null || patch[k] === '' ? null : Number(patch[k])
        } else if (k === 'icon_media_id') {
          data[k] = patch[k] === null || patch[k] === '' ? null : patch[k]
        } else {
          data[k] = patch[k]
        }
      }
    }

    await row.update(data, { transaction })
    const reloaded = await row.reload({ transaction })
    return reloaded.get({ plain: true })
  }

  /**
   * 硬删除品类（存在子品类时禁止）
   *
   * @param {number} category_id - 品类ID
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} { category_id }
   */
  async deleteCategory(category_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeItemService.deleteCategory')
    const { Category } = this.models

    const childCount = await Category.count({
      where: { parent_category_id: category_id },
      transaction
    })
    if (childCount > 0) {
      throw new BusinessError(
        `存在 ${childCount} 个子品类，请先删除或移动子节点`,
        'PRODUCT_CENTER_CATEGORY_HAS_CHILDREN',
        409,
        { child_count: childCount }
      )
    }

    const row = await Category.findByPk(category_id, { transaction })
    if (!row) {
      throw new BusinessError('品类不存在', 'PRODUCT_CENTER_CATEGORY_NOT_FOUND', 404, {
        category_id
      })
    }

    await row.destroy({ transaction })
    return { category_id }
  }
}

module.exports = ExchangeItemService
