/**
 * 餐厅积分抽奖系统 V4.7.0 - 兑换市场管理服务
 * Exchange Admin Service（大文件拆分方案 Phase 4）
 *
 * 职责范围：管理后台操作
 * - createExchangeItem(): 创建兑换商品
 * - updateExchangeItem(): 更新兑换商品
 * - deleteExchangeItem(): 删除兑换商品
 * - getUserListingStats(): 获取用户上架统计（支持手机号搜索）
 * - getUserListings(): 查询指定用户的上架商品列表
 * - updateUserListingLimit(): 更新用户个性化上架数量限制
 * - checkTimeoutAndAlert(): 检查超时订单并告警
 * - getAdminMarketItems(): 管理后台获取商品列表
 * - getMarketItemStatistics(): 获取商品统计数据
 *
 * 设计原则：
 * - 写操作必须在事务内执行
 * - 图片绑定/删除符合图片存储架构规范
 * - 缓存失效在操作完成后执行
 *
 * @module services/exchange/AdminService
 * @created 2026-01-31（大文件拆分方案 Phase 4）
 */

const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const displayNameHelper = require('../../utils/displayNameHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { Op, fn, col, where: sqlWhere, literal, QueryTypes } = require('sequelize')

/**
 * 兑换市场管理服务类
 *
 * @class AdminService
 */
class AdminService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.ExchangeRecord = models.ExchangeRecord
    this.User = models.User
    this.MarketListing = models.MarketListing
    this.Item = models.Item
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeItemSku = models.ExchangeItemSku
    this.ExchangeChannelPrice = models.ExchangeChannelPrice
    this.Category = models.Category
    this.sequelize = models.sequelize
  }

  /**
   * 记录库存变动日志（复用 admin_operation_logs 表）
   *
   * @param {Object} params - 日志参数
   * @param {number} params.exchange_item_id - 商品 ID
   * @param {string} params.item_name - 商品名称
   * @param {number} params.before_stock - 变动前库存
   * @param {number} params.after_stock - 变动后库存
   * @param {string} params.action - 操作类型（admin_set/purchase/refund/batch_update）
   * @param {number} [params.operator_id] - 操作人 ID（系统操作为 null）
   * @param {string} [params.reason] - 变动原因
   * @param {Object} [params.transaction] - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _logStockChange({
    exchange_item_id,
    item_name,
    before_stock,
    after_stock,
    action,
    operator_id = null,
    reason = null,
    transaction = null
  }) {
    try {
      const delta = after_stock - before_stock
      if (delta === 0) return // 无变动不记录

      await this.models.AdminOperationLog.create(
        {
          operator_id,
          operation_type: 'stock_change',
          target_type: 'product',
          target_id: exchange_item_id,
          action,
          before_data: { stock: before_stock, item_name },
          after_data: { stock: after_stock, item_name },
          changed_fields: { stock: { from: before_stock, to: after_stock, delta } },
          reason:
            reason ||
            `库存变动：${before_stock} → ${after_stock}（${delta > 0 ? '+' : ''}${delta}）`,
          risk_level: Math.abs(delta) > 100 ? 'high' : 'low',
          requires_approval: false,
          approval_status: 'not_required',
          affected_amount: Math.abs(delta)
        },
        { transaction }
      )
    } catch (logError) {
      // 日志记录失败不阻断业务
      logger.warn('[兑换市场] 库存变动日志记录失败', {
        exchange_item_id,
        action,
        error: logError.message
      })
    }
  }

  /**
   * 创建兑换商品（管理员操作）
   *
   * @param {Object} itemData - 商品数据
   * @param {string} itemData.name - 商品名称
   * @param {string} [itemData.description] - 商品描述
   * @param {string} itemData.cost_asset_code - 材料资产代码
   * @param {number} itemData.cost_amount - 材料成本数量
   * @param {number} itemData.cost_price - 成本价
   * @param {number} itemData.stock - 初始库存
   * @param {number} [itemData.sort_order=100] - 排序号
   * @param {string} [itemData.status='active'] - 商品状态
   * @param {number} [itemData.primary_media_id] - 主媒体ID（media_files.media_id）
   * @param {string} [itemData.space='lucky'] - 空间归属（lucky=幸运空间, premium=臻选空间, both=两者都展示）
   * @param {number} [itemData.original_price] - 原价（材料数量，用于展示划线价）
   * @param {Array} [itemData.tags] - 商品标签数组，如 ["限量","新品"]
   * @param {boolean} [itemData.is_new=false] - 是否新品
   * @param {boolean} [itemData.is_hot=false] - 是否热门
   * @param {boolean} [itemData.is_lucky=false] - 是否幸运商品
   * @param {boolean} [itemData.has_warranty=false] - 是否有质保
   * @param {boolean} [itemData.free_shipping=false] - 是否包邮
   * @param {boolean} [itemData.is_limited=false] - 是否限量商品（前端触发旋转彩虹边框等视觉强调）
   * @param {string} [itemData.sell_point] - 营销卖点文案
   * @param {number} [itemData.category_id] - 商品分类ID（FK→categories.category_id）
   * @param {number} created_by - 创建者ID
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 创建结果
   */
  async createExchangeItem(itemData, created_by, options = {}) {
    // 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'AdminService.createExchangeItem')

    const { name = '', description = '' } = itemData

    logger.info('[兑换市场] 管理员创建商品', { name, created_by })

    // 参数验证
    if (!name || name.trim().length === 0) {
      throw new Error('商品名称不能为空')
    }
    if (name.length > 100) {
      throw new Error('商品名称最长100字符')
    }
    if (description && description.length > 500) {
      throw new Error('商品描述最长500字符')
    }

    // V4.5.0：材料资产支付必填校验
    if (!itemData.cost_asset_code) {
      throw new Error('材料资产代码（cost_asset_code）不能为空')
    }
    if (!itemData.cost_amount || itemData.cost_amount <= 0) {
      throw new Error('材料成本数量（cost_amount）必须大于0')
    }
    if (itemData.cost_price === undefined || itemData.cost_price < 0) {
      throw new Error('成本价必须大于等于0')
    }
    if (itemData.stock === undefined || itemData.stock < 0) {
      throw new Error('库存必须大于等于0')
    }

    const validStatuses = ['active', 'inactive']
    if (itemData.status && !validStatuses.includes(itemData.status)) {
      throw new Error(`无效的status参数，允许值：${validStatuses.join(', ')}`)
    }

    // 空间归属验证（决策12：臻选空间/幸运空间）
    const validSpaces = ['lucky', 'premium', 'both']
    if (itemData.space && !validSpaces.includes(itemData.space)) {
      throw new Error(`无效的space参数，允许值：${validSpaces.join(', ')}`)
    }

    /*
     * 创建商品（包含臻选空间/幸运空间扩展字段）
     * 商品上架图片校验（决策3）已在路由层前置执行，避免 TransactionManager 误重试业务校验
     */
    // 分类ID（直接使用 category_id，不再兼容旧 category_code 字符串）
    const categoryDefId = itemData.category_id ? parseInt(itemData.category_id) : null

    const item = await this.ExchangeItem.create(
      {
        item_name: name.trim(),
        description: description.trim(),
        primary_media_id: itemData.primary_media_id ?? null,
        sort_order: parseInt(itemData.sort_order) || 100,
        status: itemData.status || 'active',
        category_id: categoryDefId,
        space: itemData.space || 'lucky',
        tags: itemData.tags || null,
        is_new: !!itemData.is_new,
        is_hot: !!itemData.is_hot,
        is_limited: !!itemData.is_limited,
        sell_point: itemData.sell_point || null,
        usage_rules: itemData.usage_rules || null,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    logger.info(`[兑换市场] 商品创建成功，exchange_item_id: ${item.exchange_item_id}`)

    // 自动创建默认 SKU + 兑换渠道定价
    const { ExchangeItemSku: ExchangeItemSkuModel, ExchangeChannelPrice: ChannelPriceModel } =
      this.models
    if (ExchangeItemSkuModel) {
      const defaultSkuCode = `default_${item.exchange_item_id}`
      const sku = await ExchangeItemSkuModel.create(
        {
          exchange_item_id: item.exchange_item_id,
          sku_code: defaultSkuCode,
          stock: parseInt(itemData.stock),
          sold_count: 0,
          cost_price: parseFloat(itemData.cost_price) || 0,
          status: item.status,
          sort_order: 0
        },
        { transaction }
      )

      if (ChannelPriceModel && itemData.cost_asset_code) {
        await ChannelPriceModel.create(
          {
            sku_id: sku.sku_id,
            cost_asset_code: itemData.cost_asset_code,
            cost_amount: parseInt(itemData.cost_amount) || 0,
            original_amount: itemData.original_price ? parseInt(itemData.original_price) : null,
            is_enabled: true
          },
          { transaction }
        )
      }

      logger.info('[兑换市场] 默认 SKU + 渠道定价创建成功', {
        exchange_item_id: item.exchange_item_id,
        sku_id: sku.sku_id,
        sku_code: defaultSkuCode
      })
    }

    // 媒体绑定（使用 MediaService.attach）
    let bound_image = false
    const primaryMediaId = itemData.primary_media_id
    if (primaryMediaId) {
      try {
        const MediaService = require('../MediaService')
        const mediaService = new MediaService({ getService: () => null })
        await mediaService.attach(
          primaryMediaId,
          'product',
          item.exchange_item_id,
          'primary',
          0,
          null,
          transaction
        )
        bound_image = true
        logger.info('[兑换市场] 商品主媒体绑定成功', {
          exchange_item_id: item.exchange_item_id,
          media_id: primaryMediaId
        })
      } catch (bindError) {
        logger.warn('[兑换市场] 商品主媒体绑定失败（非致命）', {
          exchange_item_id: item.exchange_item_id,
          media_id: primaryMediaId,
          error: bindError.message
        })
      }
    }

    // 缓存失效
    try {
      await BusinessCacheHelper.invalidateExchangeItems('item_created')
    } catch (cacheError) {
      logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    return {
      item: item.toJSON(),
      bound_image
    }
  }

  /**
   * 更新兑换商品（管理员操作）
   *
   * @param {number} item_id - 商品ID
   * @param {Object} updateData - 更新数据
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 更新结果
   */
  async updateExchangeItem(item_id, updateData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.updateExchangeItem')

    logger.info('[兑换市场] 管理员更新商品', { item_id })

    const item = await this.ExchangeItem.findByPk(item_id, { transaction })
    if (!item) {
      throw new Error('商品不存在')
    }

    const old_media_id = item.primary_media_id
    const finalUpdateData = { updated_at: BeijingTimeHelper.createDatabaseTime() }

    if (updateData.name !== undefined) {
      if (updateData.name.trim().length === 0) {
        throw new Error('商品名称不能为空')
      }
      if (updateData.name.length > 100) {
        throw new Error('商品名称最长100字符')
      }
      finalUpdateData.item_name = updateData.name.trim()
    }

    if (updateData.description !== undefined) {
      if (updateData.description.length > 500) {
        throw new Error('商品描述最长500字符')
      }
      finalUpdateData.description = updateData.description.trim()
    }

    // price/stock 字段不在 exchange_items 表上，路由到 ExchangeItemSku + ExchangeChannelPrice（见下方 _syncSkuAndPrice）
    const skuPriceUpdates = {}
    if (updateData.cost_asset_code !== undefined) {
      if (!updateData.cost_asset_code) {
        throw new Error('材料资产代码不能为空')
      }
      skuPriceUpdates.cost_asset_code = updateData.cost_asset_code
    }

    if (updateData.cost_amount !== undefined) {
      if (updateData.cost_amount <= 0) {
        throw new Error('材料成本数量必须大于0')
      }
      skuPriceUpdates.cost_amount = parseInt(updateData.cost_amount)
    }

    if (updateData.cost_price !== undefined) {
      if (updateData.cost_price < 0) {
        throw new Error('成本价必须大于等于0')
      }
      skuPriceUpdates.cost_price = parseFloat(updateData.cost_price)
    }

    if (updateData.stock !== undefined) {
      if (updateData.stock < 0) {
        throw new Error('库存必须大于等于0')
      }
      skuPriceUpdates.stock = parseInt(updateData.stock)
    }

    if (updateData.sort_order !== undefined) {
      finalUpdateData.sort_order = parseInt(updateData.sort_order)
    }

    if (updateData.status !== undefined) {
      const validStatuses = ['active', 'inactive']
      if (!validStatuses.includes(updateData.status)) {
        throw new Error(`无效的status参数，允许值：${validStatuses.join(', ')}`)
      }

      // 商品上架强制主媒体校验（决策3：status → active 时校验 primary_media_id 非空）
      if (updateData.status === 'active' && item.status !== 'active') {
        const targetMediaId = updateData.primary_media_id ?? item.primary_media_id
        if (!targetMediaId) {
          throw new Error('商品上架必须上传主图片（primary_media_id 不能为空）')
        }
        // 验证媒体记录存在且状态为 active（media_files 表）
        const { MediaFile } = require('../../models')
        const record = await MediaFile?.findByPk(targetMediaId, { transaction })
        if (!record) {
          throw new Error(`商品上架失败：关联媒体不存在（media_id=${targetMediaId}）`)
        }
        if (record && record.status !== 'active') {
          throw new Error(`商品上架失败：关联媒体状态异常（status=${record.status}）`)
        }
      }

      finalUpdateData.status = updateData.status
    }

    // 臻选空间/幸运空间扩展字段更新（决策12：9个新字段）
    if (updateData.space !== undefined) {
      const validSpaces = ['lucky', 'premium', 'both']
      if (!validSpaces.includes(updateData.space)) {
        throw new Error(`无效的space参数，允许值：${validSpaces.join(', ')}`)
      }
      finalUpdateData.space = updateData.space
    }

    if (updateData.original_price !== undefined) {
      skuPriceUpdates.original_amount = updateData.original_price
        ? parseInt(updateData.original_price)
        : null
    }

    if (updateData.tags !== undefined) {
      finalUpdateData.tags = updateData.tags
    }

    if (updateData.is_new !== undefined) {
      finalUpdateData.is_new = !!updateData.is_new
    }

    if (updateData.is_hot !== undefined) {
      finalUpdateData.is_hot = !!updateData.is_hot
    }

    if (updateData.is_lucky !== undefined) {
      finalUpdateData.is_lucky = !!updateData.is_lucky
    }

    if (updateData.has_warranty !== undefined) {
      finalUpdateData.has_warranty = !!updateData.has_warranty
    }

    if (updateData.free_shipping !== undefined) {
      finalUpdateData.free_shipping = !!updateData.free_shipping
    }

    if (updateData.is_limited !== undefined) {
      finalUpdateData.is_limited = !!updateData.is_limited
    }

    if (updateData.sell_point !== undefined) {
      finalUpdateData.sell_point = updateData.sell_point || null
    }

    if (updateData.category_id !== undefined) {
      finalUpdateData.category_id = updateData.category_id ? parseInt(updateData.category_id) : null
    }

    if (updateData.usage_rules !== undefined) {
      finalUpdateData.usage_rules = updateData.usage_rules || null
    }

    // 处理主媒体更换（使用 MediaService.detach/attach）
    let deleted_old_image = false
    let bound_new_image = false
    const new_media_id = updateData.primary_media_id

    if (updateData.primary_media_id !== undefined) {
      finalUpdateData.primary_media_id = new_media_id || null

      const MediaService = require('../MediaService')
      const mediaService = new MediaService({ getService: () => null })

      // 删除旧媒体关联
      if (old_media_id && old_media_id !== new_media_id) {
        try {
          await mediaService.detach('product', item_id, 'primary', transaction)
          deleted_old_image = true
          logger.info('[兑换市场] 商品旧主媒体解绑成功', { item_id, old_media_id })
        } catch (imageError) {
          logger.warn('[兑换市场] 商品旧主媒体解绑失败（非致命）', {
            item_id,
            old_media_id,
            error: imageError.message
          })
        }
      }

      // 绑定新主媒体
      if (new_media_id) {
        try {
          await mediaService.attach(
            new_media_id,
            'product',
            item_id,
            'primary',
            0,
            null,
            transaction
          )
          bound_new_image = true
          logger.info('[兑换市场] 商品新主媒体绑定成功', { item_id, new_media_id })
        } catch (bindError) {
          logger.warn('[兑换市场] 商品新主媒体绑定失败（非致命）', {
            item_id,
            new_media_id,
            error: bindError.message
          })
        }
      }
    }

    await item.update(finalUpdateData, { transaction })

    // 将价格/库存变更路由到 ExchangeItemSku + ExchangeChannelPrice
    if (Object.keys(skuPriceUpdates).length > 0) {
      const defaultSku = await this.ExchangeItemSku.findOne({
        where: { exchange_item_id: item_id },
        order: [['sku_id', 'ASC']],
        transaction
      })

      if (defaultSku) {
        const skuFields = {}
        if (skuPriceUpdates.stock !== undefined) {
          const oldStock = defaultSku.stock
          skuFields.stock = skuPriceUpdates.stock
          if (skuPriceUpdates.stock !== oldStock) {
            await this._logStockChange({
              exchange_item_id: item_id,
              item_name: item.item_name,
              before_stock: oldStock,
              after_stock: skuPriceUpdates.stock,
              action: 'admin_set',
              operator_id: options.operator_id || null,
              reason: '管理员手动调整库存',
              transaction
            })
          }
        }
        if (skuPriceUpdates.cost_price !== undefined) {
          skuFields.cost_price = skuPriceUpdates.cost_price
        }
        if (Object.keys(skuFields).length > 0) {
          await defaultSku.update(skuFields, { transaction })
        }

        // 更新渠道定价
        const priceFields = {}
        if (skuPriceUpdates.cost_asset_code !== undefined) {
          priceFields.cost_asset_code = skuPriceUpdates.cost_asset_code
        }
        if (skuPriceUpdates.cost_amount !== undefined) {
          priceFields.cost_amount = skuPriceUpdates.cost_amount
        }
        if (skuPriceUpdates.original_amount !== undefined) {
          priceFields.original_amount = skuPriceUpdates.original_amount
        }
        if (Object.keys(priceFields).length > 0) {
          const ChannelPriceModel = this.models.ExchangeChannelPrice
          if (ChannelPriceModel) {
            await ChannelPriceModel.update(priceFields, {
              where: { sku_id: defaultSku.sku_id },
              transaction
            })
          }
        }

        // 刷新 SPU 汇总列
        await this._updateSpuSummary(item_id, transaction)
      }
    }

    logger.info(`[兑换市场] 商品更新成功，item_id: ${item_id}`, {
      deleted_old_image,
      bound_new_image,
      old_media_id,
      new_media_id
    })

    // 缓存失效
    try {
      await BusinessCacheHelper.invalidateExchangeItems('item_updated')
    } catch (cacheError) {
      logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    return {
      item: item.toJSON(),
      image_changes: {
        deleted_old_image,
        bound_new_image,
        old_media_id,
        new_media_id
      }
    }
  }

  /**
   * 删除兑换商品（管理员操作）
   *
   * @param {number} item_id - 商品ID
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 删除结果
   */
  async deleteExchangeItem(item_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.deleteExchangeItem')

    logger.info('[兑换市场] 管理员删除商品', { item_id })

    const item = await this.ExchangeItem.findByPk(item_id, { transaction })
    if (!item) {
      throw new Error('商品不存在')
    }

    const associated_media_id = item.primary_media_id

    // 检查是否有相关订单（通过 exchange_item_id 关联）
    const orderCount = await this.ExchangeRecord.count({
      where: { exchange_item_id: item_id },
      transaction
    })

    if (orderCount > 0) {
      // 如果有订单，只能下架不能删除
      await item.update(
        {
          status: 'inactive',
          updated_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      logger.info(`[兑换市场] 商品有${orderCount}个关联订单，已下架而非删除`)

      try {
        await BusinessCacheHelper.invalidateExchangeItems('item_deactivated')
      } catch (cacheError) {
        logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
      }

      return {
        action: 'deactivated',
        message: `该商品有${orderCount}个关联订单，已自动下架而非删除`,
        item: item.toJSON()
      }
    }

    // 删除关联主媒体（使用 MediaService.detach）
    if (associated_media_id) {
      try {
        const MediaService = require('../MediaService')
        const mediaService = new MediaService({ getService: () => null })
        const deletedCount = await mediaService.detach('product', item_id, 'primary', transaction)
        logger.info('[兑换市场] 商品关联主媒体解绑成功', {
          item_id,
          media_id: associated_media_id,
          deleted_count: deletedCount
        })
      } catch (imageError) {
        logger.warn('[兑换市场] 商品关联主媒体解绑失败（非致命）', {
          item_id,
          media_id: associated_media_id,
          error: imageError.message
        })
      }
    }

    await item.destroy({ transaction })

    logger.info(`[兑换市场] 商品删除成功，item_id: ${item_id}`, {
      deleted_media_id: associated_media_id
    })

    try {
      await BusinessCacheHelper.invalidateExchangeItems('item_deleted')
    } catch (cacheError) {
      logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    return {
      action: 'deleted',
      message: '商品删除成功',
      deleted_media_id: associated_media_id
    }
  }

  /**
   * 获取用户上架统计（管理员专用）
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.filter='all'] - 筛选条件：all/near_limit/at_limit
   * @param {number} options.max_listings - 最大上架数量限制
   * @returns {Promise<Object>} 用户上架统计结果
   */
  async getUserListingStats(options) {
    try {
      const {
        page = 1,
        page_size: listing_stats_page_size = 20,
        filter = 'all',
        max_listings = 3,
        mobile,
        merchant_id
      } = options

      const pageSize = Math.min(Math.max(parseInt(listing_stats_page_size, 10) || 20, 1), 100)

      logger.info('[兑换市场] 管理员获取用户上架统计', {
        page,
        page_size: pageSize,
        filter,
        max_listings,
        mobile
      })

      // 手机号搜索：先查找匹配的用户
      let mobileFilterUserIds = null
      if (mobile && mobile.trim()) {
        const matchedUsers = await this.User.findAll({
          where: { mobile: { [Op.like]: `%${mobile.trim()}%` } },
          attributes: ['user_id'],
          raw: true
        })
        mobileFilterUserIds = matchedUsers.map(u => u.user_id)

        if (mobileFilterUserIds.length === 0) {
          return {
            stats: [],
            pagination: { page, page_size: pageSize, total: 0, total_pages: 0 },
            summary: {
              total_users_with_listings: 0,
              users_at_limit: 0,
              users_near_limit: 0,
              total_listings: 0
            }
          }
        }
      }

      // 查询在售商品数量（如有手机号筛选则限定卖家范围）
      const listingWhere = { status: 'on_sale' }
      if (mobileFilterUserIds) {
        listingWhere.seller_user_id = mobileFilterUserIds
      }

      const listingQueryOptions = {
        where: listingWhere,
        attributes: [
          'seller_user_id',
          [
            this.sequelize.fn(
              'COUNT',
              this.sequelize.col(`${this.MarketListing.name}.market_listing_id`)
            ),
            'count'
          ]
        ],
        group: ['seller_user_id'],
        raw: true
      }

      // 商家ID筛选：通过 MarketListing → Item 关联查找指定商家的挂牌
      if (merchant_id) {
        listingQueryOptions.include = [
          {
            model: this.models.Item,
            as: 'offerItem',
            attributes: [],
            where: { merchant_id },
            required: true
          }
        ]
      }

      const listingCounts = await this.MarketListing.findAll(listingQueryOptions)

      // 查询所有相关用户（含 max_active_listings 个性化配置）
      const allUserIds = listingCounts.map(item => item.seller_user_id)
      const allUsers =
        allUserIds.length > 0
          ? await this.User.findAll({
              where: { user_id: allUserIds },
              attributes: ['user_id', 'mobile', 'nickname', 'status', 'max_active_listings'],
              raw: true
            })
          : []
      const userMap = new Map(allUsers.map(u => [u.user_id, u]))

      // 为每个用户计算实际上限（个性化优先，全局兜底）
      const enrichedCounts = listingCounts.map(item => {
        const user = userMap.get(item.seller_user_id)
        const userLimit = user?.max_active_listings ?? max_listings
        const count = parseInt(item.count)
        return { ...item, count, user_limit: userLimit }
      })

      // 根据筛选条件过滤
      let filteredItems = []
      if (filter === 'at_limit') {
        filteredItems = enrichedCounts.filter(item => item.count >= item.user_limit)
      } else if (filter === 'near_limit') {
        filteredItems = enrichedCounts.filter(item => {
          return item.count >= item.user_limit * 0.8 && item.count < item.user_limit
        })
      } else {
        filteredItems = enrichedCounts
      }

      // 分页
      const total = filteredItems.length
      const offset = (page - 1) * pageSize
      const paginatedItems = filteredItems.slice(offset, offset + pageSize)

      // 构建统计结果（含个性化上限信息）
      const stats = paginatedItems.map(item => {
        const user = userMap.get(item.seller_user_id)
        const userLimit = item.user_limit
        return {
          user_id: item.seller_user_id,
          mobile: user?.mobile || '',
          nickname: user?.nickname || '',
          status: user?.status || '',
          listing_count: item.count,
          max_active_listings: userLimit,
          is_custom_limit:
            user?.max_active_listings !== null && user?.max_active_listings !== undefined,
          remaining_quota: Math.max(0, userLimit - item.count),
          is_at_limit: item.count >= userLimit
        }
      })

      // 汇总统计
      const summary = {
        total_users_with_listings: listingCounts.length,
        users_at_limit: enrichedCounts.filter(item => item.count >= item.user_limit).length,
        users_near_limit: enrichedCounts.filter(item => {
          return item.count >= item.user_limit * 0.8 && item.count < item.user_limit
        }).length,
        total_listings: enrichedCounts.reduce((sum, item) => sum + item.count, 0)
      }

      const result = {
        stats,
        pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
        summary
      }

      logger.info('[兑换市场] 用户上架统计查询成功', {
        total_users: result.summary.total_users_with_listings,
        filtered_count: result.pagination.total,
        mobile_filter: mobile || null
      })

      return result
    } catch (error) {
      logger.error('[兑换市场] 获取用户上架统计失败:', {
        error: error.message,
        stack: error.stack,
        options
      })
      throw error
    }
  }

  /**
   * 查询指定用户的上架商品列表（管理员操作）
   *
   * @param {Object} options - 查询选项
   * @param {number} options.user_id - 用户ID
   * @param {string} [options.status] - 挂牌状态筛选（on_sale/locked/sold/withdrawn/admin_withdrawn）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户挂牌列表和用户信息
   */
  async getUserListings(options) {
    try {
      const {
        user_id,
        status,
        page = 1,
        page_size = 20,
        quality_grade,
        sort_by,
        sort_order = 'desc'
      } = options

      if (!user_id) throw new Error('user_id 是必填参数')

      logger.info('[兑换市场] 管理员查询用户上架列表', {
        user_id,
        status,
        page,
        page_size,
        quality_grade,
        sort_by,
        sort_order
      })

      // 查询用户信息
      const user = await this.User.findByPk(user_id, {
        attributes: ['user_id', 'mobile', 'nickname', 'status', 'max_active_listings']
      })
      if (!user) throw new Error(`用户不存在: ${user_id}`)

      // 构建查询条件
      const where = { seller_user_id: user_id }
      if (status) where.status = status

      const needItemJoin = !!quality_grade || String(sort_by || '') === 'quality_score'
      const include = []
      if (this.Item && needItemJoin) {
        const itemInclude = {
          model: this.Item,
          as: 'offerItem',
          required: !!quality_grade
        }
        if (quality_grade) {
          where.listing_kind = 'item'
          itemInclude.where = sqlWhere(
            fn(
              'JSON_UNQUOTE',
              fn('JSON_EXTRACT', col('offerItem.instance_attributes'), literal(`'$.quality_grade'`))
            ),
            quality_grade
          )
        }
        include.push(itemInclude)
      }

      let order = [['created_at', 'DESC']]
      if (sort_by === 'quality_score' && this.Item) {
        const dir = String(sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
        order = [
          [
            literal(
              `CAST(JSON_UNQUOTE(JSON_EXTRACT(\`offerItem\`.\`instance_attributes\`, '$.quality_score')) AS DECIMAL(18,6))`
            ),
            dir
          ],
          ['created_at', 'DESC']
        ]
      }

      // 查询挂牌列表
      const { count, rows } = await this.MarketListing.findAndCountAll({
        where,
        include: include.length ? include : undefined,
        subQuery: false,
        order,
        limit: parseInt(page_size),
        offset: (parseInt(page) - 1) * parseInt(page_size)
      })

      // 获取全局默认上限
      const AdminSystemService = require('../AdminSystemService')
      const globalMaxListings = await AdminSystemService.getSettingValue(
        'marketplace',
        'max_active_listings',
        10
      )

      const userMaxListings = user.max_active_listings ?? globalMaxListings
      const activeCount = await this.MarketListing.count({
        where: { seller_user_id: user_id, status: 'on_sale' }
      })

      return {
        user: {
          user_id: user.user_id,
          mobile: user.mobile,
          nickname: user.nickname,
          status: user.status,
          max_active_listings: userMaxListings,
          is_custom_limit: user.max_active_listings !== null,
          active_listing_count: activeCount,
          remaining_quota: Math.max(0, userMaxListings - activeCount)
        },
        listings: rows.map(listing => {
          const j = listing.toJSON ? listing.toJSON() : listing
          const attrs = j.offerItem?.instance_attributes || {}
          const qScore = attrs.quality_score
          const qGrade = attrs.quality_grade
          return {
            ...j,
            quality_score: qScore != null ? qScore : null,
            quality_grade: qGrade != null ? qGrade : null,
            serial_number: j.offerItem?.serial_number ?? null,
            edition_total: j.offerItem?.edition_total ?? null
          }
        }),
        pagination: {
          page: parseInt(page),
          page_size: parseInt(page_size),
          total: count,
          total_pages: Math.ceil(count / parseInt(page_size))
        }
      }
    } catch (error) {
      logger.error('[兑换市场] 查询用户上架列表失败:', {
        error: error.message,
        options
      })
      throw error
    }
  }

  /**
   * 更新指定用户的上架数量限制（管理员操作）
   *
   * @param {Object} params - 更新参数
   * @param {number} params.user_id - 目标用户ID
   * @param {number|null} params.max_active_listings - 新的上架数量限制（null=恢复使用全局默认）
   * @param {number} params.operator_id - 操作员（管理员）ID
   * @param {string} [params.reason] - 调整原因
   * @param {Object} options - 事务选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 更新结果
   */
  async updateUserListingLimit(params, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.updateUserListingLimit')
    const { user_id, max_active_listings, operator_id, reason = '' } = params

    if (!user_id) throw new Error('user_id 是必填参数')
    if (!operator_id) throw new Error('operator_id 是必填参数')

    // max_active_listings 可以是 null（恢复全局默认）或正整数
    if (max_active_listings !== null && max_active_listings !== undefined) {
      const parsed = parseInt(max_active_listings)
      if (isNaN(parsed) || parsed < 0 || parsed > 1000) {
        throw new Error('max_active_listings 必须是 0~1000 之间的整数，或为 null（恢复全局默认）')
      }
    }

    logger.info('[兑换市场] 管理员调整用户上架限制', {
      user_id,
      max_active_listings,
      operator_id,
      reason
    })

    const user = await this.User.findByPk(user_id, {
      attributes: ['user_id', 'mobile', 'nickname', 'max_active_listings'],
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!user) throw new Error(`用户不存在: ${user_id}`)

    const oldLimit = user.max_active_listings
    const newLimit =
      max_active_listings === null || max_active_listings === undefined
        ? null
        : parseInt(max_active_listings)

    await user.update({ max_active_listings: newLimit }, { transaction })

    // 获取全局默认值用于响应
    const AdminSystemService = require('../AdminSystemService')
    const globalMaxListings = await AdminSystemService.getSettingValue(
      'marketplace',
      'max_active_listings',
      10
    )

    const effectiveLimit = newLimit ?? globalMaxListings

    logger.info('[兑换市场] 用户上架限制调整成功', {
      user_id,
      old_limit: oldLimit,
      new_limit: newLimit,
      effective_limit: effectiveLimit,
      operator_id,
      reason
    })

    return {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      old_limit: oldLimit,
      new_limit: newLimit,
      effective_limit: effectiveLimit,
      is_custom_limit: newLimit !== null,
      global_default: globalMaxListings,
      reason
    }
  }

  /**
   * 检查超时订单并告警（定时任务专用）
   *
   * @param {number} hours - 超时小时数（24或72）
   * @returns {Promise<Object>} 检查结果
   */
  async checkTimeoutAndAlert(hours = 24) {
    try {
      const timeoutThreshold = new Date(Date.now() - hours * 60 * 60 * 1000)

      const timeoutOrders = await this.ExchangeRecord.findAll({
        where: {
          status: 'pending',
          created_at: { [Op.lt]: timeoutThreshold }
        },
        attributes: [
          'exchange_record_id',
          'order_no',
          'user_id',
          'exchange_item_id',
          'pay_amount',
          'created_at'
        ],
        order: [['created_at', 'ASC']],
        limit: 100
      })

      const count = timeoutOrders.length

      if (count > 0) {
        logger.warn(`[兑换市场] 发现${count}个超过${hours}小时的待处理订单`, {
          hours,
          count,
          oldest_order: timeoutOrders[0]?.order_no,
          oldest_created_at: timeoutOrders[0]?.created_at
        })
      } else {
        logger.info(`[兑换市场] 无超过${hours}小时的待处理订单`)
      }

      return {
        hasTimeout: count > 0,
        count,
        hours,
        orders: timeoutOrders.map(order => ({
          record_id: order.exchange_record_id,
          order_no: order.order_no,
          user_id: order.user_id,
          pay_amount: order.pay_amount,
          created_at: order.created_at,
          timeout_hours: Math.floor(
            (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60)
          )
        })),
        checked_at: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error(`[兑换市场] 检查${hours}小时超时订单失败:`, {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 管理后台获取兑换商品列表（Admin Only）
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 商品状态
   * @param {string} [options.keyword] - 商品名称关键词
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='sort_order'] - 排序字段
   * @param {string} [options.sort_order='ASC'] - 排序方向
   * @returns {Promise<Object>} 商品列表和分页信息
   */
  async getAdminMarketItems(options = {}) {
    const {
      status = null,
      keyword = null,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = options

    try {
      logger.info('[兑换市场-管理] 查询商品列表', { status, keyword, page, page_size })

      const where = {}
      if (status) where.status = status
      if (keyword) where.item_name = { [Op.like]: `%${keyword}%` }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeItem.findAndCountAll({
        where,
        limit,
        offset,
        order: [[sort_by, sort_order]]
      })

      logger.info(`[兑换市场-管理] 找到${count}个商品，返回第${page}页（${rows.length}个）`)

      const itemsWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(item => item.toJSON()),
        [{ field: 'status', dictType: 'product_status' }]
      )

      return {
        items: itemsWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('[兑换市场-管理] 查询商品列表失败:', error.message)
      throw new Error(`查询商品列表失败: ${error.message}`)
    }
  }

  /**
   * 获取兑换市场统计数据（Admin Only）
   *
   * @param {Object} [options={}] - 可选参数
   * @param {number} [options.trend_days=90] - 订单趋势图查询天数（1–366）
   * @returns {Promise<Object>} 统计数据
   */
  async getMarketItemStatistics(options = {}) {
    try {
      const rawTrend = parseInt(options.trend_days, 10)
      const trend_days = Number.isFinite(rawTrend) ? Math.min(Math.max(rawTrend, 1), 366) : 90
      logger.info('[兑换市场-管理] 查询统计数据', { trend_days })

      const [totalItems, activeItems, lowStockItems, totalExchanges] = await Promise.all([
        this.ExchangeItem.count(),
        this.ExchangeItem.count({ where: { status: 'active' } }),
        this.ExchangeItem.count({
          include: [
            {
              model: this.models.ExchangeItemSku,
              as: 'skus',
              where: { stock: { [Op.lt]: 10 }, status: 'active' },
              required: true
            }
          ]
        }),
        this.ExchangeRecord.count({ where: { status: { [Op.ne]: 'cancelled' } } })
      ])

      const [orderAgg] = await this.sequelize.query(
        `SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shipped,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
          COUNT(*) AS total_orders,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN pay_amount ELSE 0 END), 0) AS total_pay_amount
        FROM exchange_records`,
        { type: QueryTypes.SELECT }
      )

      const [itemAgg] = await this.sequelize.query(
        `SELECT
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
          SUM(CASE WHEN status <> 'active' THEN 1 ELSE 0 END) AS inactive_count,
          COALESCE(SUM(CASE WHEN status = 'active' THEN stock ELSE 0 END), 0) AS active_stock,
          COALESCE(SUM(CASE WHEN status <> 'active' THEN stock ELSE 0 END), 0) AS inactive_stock,
          SUM(
            CASE
              WHEN status = 'active' AND stock <= COALESCE(stock_alert_threshold, 5) THEN 1
              ELSE 0
            END
          ) AS low_stock_count
        FROM exchange_items`,
        { type: QueryTypes.SELECT }
      )

      const [fulfillRow] = await this.sequelize.query(
        `SELECT
          AVG(
            CASE
              WHEN status IN ('shipped', 'completed') AND updated_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, created_at, updated_at)
            END
          ) AS avg_fulfillment_hours
        FROM exchange_records
        WHERE status IN ('shipped', 'completed')`,
        { type: QueryTypes.SELECT }
      )

      const totalOrders = Number(orderAgg?.total_orders) || 0
      const cancelled = Number(orderAgg?.cancelled) || 0
      const shipped = Number(orderAgg?.shipped) || 0
      const completed = Number(orderAgg?.completed) || 0
      const validOrders = totalOrders - cancelled
      const fulfilledOrders = shipped + completed
      const fulfillment_rate =
        validOrders > 0 ? Math.round((fulfilledOrders / validOrders) * 10000) / 100 : 0

      const trendRows = await this.sequelize.query(
        `SELECT DATE(created_at) AS day,
          COUNT(*) AS order_count,
          COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN pay_amount ELSE 0 END), 0) AS revenue
        FROM exchange_records
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL :trend_days DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
        { type: QueryTypes.SELECT, replacements: { trend_days } }
      )

      const order_trend_by_day = trendRows.map(r => {
        const raw = r.day
        const dateStr =
          raw instanceof Date ? raw.toISOString().split('T')[0] : String(raw).slice(0, 10)
        return {
          date: dateStr,
          order_count: Number(r.order_count) || 0,
          revenue: Number(r.revenue) || 0
        }
      })

      const statistics = {
        total_items: totalItems,
        active_items: activeItems,
        low_stock_items: lowStockItems,
        total_exchanges: totalExchanges,
        timestamp: BeijingTimeHelper.now(),
        /** 近 90 日按日订单量与成交额（兑换趋势图，避免前端拉全量订单再聚合） */
        order_trend_by_day,
        /** 订单状态分布与支付量（管理后台兑换统计卡片，服务端聚合） */
        orders_summary: {
          total: totalOrders,
          pending: Number(orderAgg?.pending) || 0,
          completed,
          shipped,
          cancelled,
          total_pay_amount: Number(orderAgg?.total_pay_amount) || 0
        },
        /** 商品库存与上下架汇总（替代前端拉全量商品再算） */
        items_summary: {
          active_count: Number(itemAgg?.active_count) || 0,
          inactive_count: Number(itemAgg?.inactive_count) || 0,
          active_stock: Number(itemAgg?.active_stock) || 0,
          inactive_stock: Number(itemAgg?.inactive_stock) || 0,
          low_stock_count: Number(itemAgg?.low_stock_count) || 0
        },
        /** 履约看板（全表聚合，非抽样 200 条） */
        fulfillment_tracking: {
          total_orders: totalOrders,
          pending_count: Number(orderAgg?.pending) || 0,
          shipped_count: shipped,
          completed_count: completed,
          cancelled_count: cancelled,
          fulfillment_rate,
          avg_fulfillment_time:
            fulfillRow?.avg_fulfillment_hours != null
              ? Math.round(Number(fulfillRow.avg_fulfillment_hours) * 10) / 10
              : 0
        }
      }

      logger.info('[兑换市场-管理] 统计数据查询成功', statistics)

      return statistics
    } catch (error) {
      logger.error('[兑换市场-管理] 查询统计数据失败:', error.message)
      throw new Error(`查询统计数据失败: ${error.message}`)
    }
  }

  /**
   * B2C 兑换商城顶线数据（dashboard 跨域概览专用）
   * @param {number} [days=7] - 统计周期天数
   * @returns {Promise<Object>} B2C 顶线指标
   */
  async getExchangeTopline(days = 7) {
    const safeDays = parseInt(days) || 7
    const [[activeRow], [exchangeRow], [lowStockRow]] = await Promise.all([
      this.sequelize.query(
        `SELECT COUNT(*) AS active_items FROM exchange_items WHERE status = 'active'`,
        { type: QueryTypes.SELECT }
      ),
      this.sequelize.query(
        `SELECT COUNT(*) AS period_exchanges, COALESCE(SUM(pay_amount), 0) AS period_pay_amount FROM exchange_records WHERE status != 'cancelled' AND created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)`,
        { type: QueryTypes.SELECT }
      ),
      this.sequelize.query(
        `SELECT COUNT(DISTINCT ei.exchange_item_id) AS low_stock_items FROM exchange_items ei JOIN exchange_item_skus eis ON ei.exchange_item_id = eis.exchange_item_id WHERE ei.status = 'active' AND eis.stock <= COALESCE(ei.stock_alert_threshold, 5) AND eis.stock > 0`,
        { type: QueryTypes.SELECT }
      )
    ])
    const [fulfillRow] = await this.sequelize.query(
      `SELECT SUM(CASE WHEN status IN ('shipped','completed') THEN 1 ELSE 0 END) AS fulfilled, SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END) AS valid_total FROM exchange_records`,
      { type: QueryTypes.SELECT }
    )
    const fulfilled = Number(fulfillRow?.fulfilled) || 0
    const validTotal = Number(fulfillRow?.valid_total) || 0
    return {
      active_items: Number(activeRow?.active_items) || 0,
      period_exchanges: Number(exchangeRow?.period_exchanges) || 0,
      period_pay_amount: Number(exchangeRow?.period_pay_amount) || 0,
      low_stock_items: Number(lowStockRow?.low_stock_items) || 0,
      fulfillment_rate: validTotal > 0 ? Math.round((fulfilled / validTotal) * 10000) / 100 : 0
    }
  }

  /**
   * 获取单品维度统计数据（Admin Only）
   *
   * @param {number} exchangeItemId - 商品ID
   * @returns {Promise<Object>} 单品统计数据
   */
  async getItemDashboard(exchangeItemId) {
    try {
      const item = await this.ExchangeItem.findByPk(exchangeItemId, {
        attributes: [
          'exchange_item_id',
          'item_name',
          'stock',
          'sold_count',
          'min_cost_amount',
          'created_at'
        ]
      })
      if (!item) throw new Error('商品不存在')

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const [recentOrders7d, recentOrders30d, avgRating, statusDistribution] = await Promise.all([
        this.ExchangeRecord.count({
          where: { exchange_item_id: exchangeItemId, created_at: { [Op.gte]: sevenDaysAgo } }
        }),
        this.ExchangeRecord.count({
          where: { exchange_item_id: exchangeItemId, created_at: { [Op.gte]: thirtyDaysAgo } }
        }),
        this.ExchangeRecord.findOne({
          attributes: [[this.sequelize.fn('AVG', this.sequelize.col('rating')), 'avg_rating']],
          where: { exchange_item_id: exchangeItemId, rating: { [Op.ne]: null } },
          raw: true
        }),
        this.ExchangeRecord.findAll({
          attributes: ['status', [this.sequelize.fn('COUNT', '*'), 'count']],
          where: { exchange_item_id: exchangeItemId },
          group: ['status'],
          raw: true
        })
      ])

      const totalOrders = item.sold_count || 0
      const conversionRate =
        totalOrders > 0
          ? ((totalOrders / Math.max(totalOrders + item.stock, 1)) * 100).toFixed(1)
          : 0
      const inventoryTurnover =
        totalOrders > 0 ? (totalOrders / Math.max(item.stock, 1)).toFixed(2) : 0

      return {
        item_name: item.item_name,
        exchange_item_id: item.exchange_item_id,
        current_stock: item.stock,
        total_sold: totalOrders,
        cost_amount: item.min_cost_amount,
        orders_7d: recentOrders7d,
        orders_30d: recentOrders30d,
        avg_rating: avgRating?.avg_rating
          ? parseFloat(parseFloat(avgRating.avg_rating).toFixed(2))
          : null,
        conversion_rate: parseFloat(conversionRate),
        inventory_turnover: parseFloat(inventoryTurnover),
        order_status_distribution: statusDistribution.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count, 10)
          return acc
        }, {})
      }
    } catch (error) {
      logger.error(`[兑换市场-管理] 单品统计查询失败(id:${exchangeItemId}):`, error.message)
      throw error
    }
  }

  /**
   * 批量绑定商品图片（运营批量上传图片后绑定）
   *
   * 业务场景：运营在管理后台上传图片后，通过此接口批量绑定图片到对应商品
   *
   * @param {Array<Object>} bindings - 绑定关系数组
   * @param {number} bindings[].exchange_item_id - 商品ID
   * @param {number} bindings[].media_id - 媒体文件ID（media_files.media_id）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 绑定结果
   */
  async batchBindImages(bindings, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchBindImages')

    if (!Array.isArray(bindings) || bindings.length === 0) {
      throw new Error('绑定关系数组不能为空')
    }

    for (const binding of bindings) {
      if (!binding.exchange_item_id || !binding.media_id) {
        throw new Error('每条绑定记录必须包含 exchange_item_id 和 media_id')
      }
    }

    logger.info('[兑换市场-管理] 批量绑定商品主媒体', { count: bindings.length })

    const MediaService = require('../MediaService')
    const mediaService = new MediaService({ getService: () => null })
    const results = { success: 0, failed: 0, details: [] }

    for (const binding of bindings) {
      try {
        // 验证商品存在
        const item = await this.ExchangeItem.findByPk(binding.exchange_item_id, { transaction })
        if (!item) {
          results.failed++
          results.details.push({
            exchange_item_id: binding.exchange_item_id,
            success: false,
            error: '商品不存在'
          })
          continue
        }

        await mediaService.attach(
          binding.media_id,
          'product',
          binding.exchange_item_id,
          'primary',
          0,
          null,
          transaction
        )

        results.success++
        results.details.push({
          exchange_item_id: binding.exchange_item_id,
          media_id: binding.media_id,
          success: true
        })
      } catch (bindError) {
        results.failed++
        results.details.push({
          exchange_item_id: binding.exchange_item_id,
          media_id: binding.media_id,
          success: false,
          error: bindError.message
        })
        logger.warn('[兑换市场-管理] 单条主媒体绑定失败', {
          exchange_item_id: binding.exchange_item_id,
          error: bindError.message
        })
      }
    }

    // 清除缓存
    try {
      await BusinessCacheHelper.invalidateExchangeItems('batch_image_bind')
    } catch (cacheError) {
      logger.warn('[兑换市场-管理] 缓存失效失败（非致命）:', cacheError.message)
    }

    logger.info('[兑换市场-管理] 批量绑定商品图片完成', {
      total: bindings.length,
      success: results.success,
      failed: results.failed
    })

    return {
      total: bindings.length,
      success: results.success,
      failed: results.failed,
      details: results.details
    }
  }

  /**
   * 查询缺少图片的商品列表（运营排查工具）
   *
   * 业务场景：运营需要知道哪些商品还没有绑定图片，方便批量上传
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=50] - 每页数量（默认50，一次性查看更多）
   * @returns {Promise<Object>} 缺图商品列表
   */
  async getMissingImageItems(options = {}) {
    const { page = 1, page_size = 50 } = options

    try {
      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeItem.findAndCountAll({
        where: { primary_media_id: null },
        attributes: ['exchange_item_id', 'item_name', 'category_id', 'status', 'space', 'stock'],
        limit,
        offset,
        order: [['exchange_item_id', 'ASC']]
      })

      logger.info('[兑换市场-管理] 查询缺图商品列表', {
        total: count,
        page,
        returned: rows.length
      })

      return {
        items: rows.map(item => item.toJSON()),
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('[兑换市场-管理] 查询缺图商品列表失败:', error.message)
      throw error
    }
  }

  /**
   * 批量更新商品空间归属（臻选空间/幸运空间管理，决策4 + Phase 3.8）
   *
   * 业务场景：运营通过管理后台将商品设为 lucky/premium/both
   *
   * @param {number[]} exchangeItemIds - 商品ID数组
   * @param {string} space - 目标空间：lucky/premium/both
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 更新结果
   */
  async batchUpdateSpace(exchangeItemIds, space, options = {}) {
    const { transaction } = assertAndGetTransaction(options)

    const validSpaces = ['lucky', 'premium', 'both']
    if (!validSpaces.includes(space)) {
      throw new Error(`无效的空间类型：${space}，允许值：${validSpaces.join(', ')}`)
    }

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new Error('商品ID数组不能为空')
    }

    logger.info('[兑换市场-管理] 批量更新商品空间', {
      count: exchangeItemIds.length,
      target_space: space
    })

    const [affectedRows] = await this.ExchangeItem.update(
      { space },
      {
        where: { exchange_item_id: { [Op.in]: exchangeItemIds } },
        transaction
      }
    )

    // 清除缓存
    await BusinessCacheHelper.invalidateExchangeItems('batch_space')

    logger.info('[兑换市场-管理] 批量更新空间完成', {
      requested: exchangeItemIds.length,
      affected: affectedRows,
      target_space: space
    })

    return { affected_rows: affectedRows, space }
  }

  /**
   * 批量上下架商品（C1：批量切换 active/inactive）
   *
   * @param {number[]} exchangeItemIds - 商品 ID 数组
   * @param {string} status - 目标状态：active/inactive
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} [options.operator_id] - 操作人 ID
   * @returns {Promise<Object>} { affected_rows, status }
   */
  async batchUpdateStatus(exchangeItemIds, status, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchUpdateStatus')

    const validStatuses = ['active', 'inactive']
    if (!validStatuses.includes(status)) {
      throw new Error(`无效的状态：${status}，允许值：${validStatuses.join(', ')}`)
    }

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new Error('商品ID数组不能为空')
    }

    logger.info('[兑换市场-管理] 批量更新商品状态', {
      count: exchangeItemIds.length,
      target_status: status
    })

    const [affectedRows] = await this.ExchangeItem.update(
      { status, updated_at: BeijingTimeHelper.createDatabaseTime() },
      { where: { exchange_item_id: { [Op.in]: exchangeItemIds } }, transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems('batch_status_update').catch(() => {})

    logger.info('[兑换市场-管理] 批量更新状态完成', {
      requested: exchangeItemIds.length,
      affected: affectedRows
    })
    return { affected_rows: affectedRows, status }
  }

  /**
   * 批量调整商品价格（C2：按比例或固定值调整 cost_amount）
   *
   * @param {number[]} exchangeItemIds - 商品 ID 数组
   * @param {Object} adjustment - 调整参数
   * @param {string} adjustment.mode - 调整模式：ratio（按比例）/ fixed（固定值增减）/ set（直接设置）
   * @param {number} adjustment.value - 调整值（ratio: 1.1=涨10%, fixed: 正数加/负数减, set: 直接设置的值）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} [options.operator_id] - 操作人 ID
   * @returns {Promise<Object>} { affected_rows, adjustment }
   */
  async batchUpdatePrice(exchangeItemIds, adjustment, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchUpdatePrice')

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new Error('商品ID数组不能为空')
    }

    const { mode, value } = adjustment
    if (!['ratio', 'fixed', 'set'].includes(mode)) {
      throw new Error('调整模式必须是 ratio/fixed/set')
    }
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error('调整值必须是有效数字')
    }
    if (mode === 'ratio' && value <= 0) {
      throw new Error('比例调整值必须大于0')
    }
    if (mode === 'set' && value <= 0) {
      throw new Error('直接设置的价格必须大于0')
    }

    logger.info('[兑换市场-管理] 批量调整商品价格', { count: exchangeItemIds.length, mode, value })

    const ChannelPriceModel = this.models.ExchangeChannelPrice

    // 查询每个商品的默认 SKU → 渠道定价行
    const skus = await this.ExchangeItemSku.findAll({
      where: { exchange_item_id: { [Op.in]: exchangeItemIds } },
      include: [
        {
          model: ChannelPriceModel,
          as: 'channelPrices',
          where: { is_enabled: true },
          required: true
        }
      ],
      transaction
    })

    let updatedCount = 0
    const productIdsToRefresh = new Set()

    for (const sku of skus) {
      for (const price of sku.channelPrices) {
        const oldAmount = Number(price.cost_amount)
        let newAmount

        if (mode === 'ratio') {
          newAmount = Math.round(oldAmount * value)
        } else if (mode === 'fixed') {
          newAmount = oldAmount + value
        } else {
          newAmount = value
        }

        newAmount = Math.max(1, newAmount)

        if (newAmount !== oldAmount) {
          await price.update({ cost_amount: newAmount }, { transaction })
          updatedCount++
          productIdsToRefresh.add(sku.exchange_item_id)

          try {
            await this.models.AdminOperationLog.create(
              {
                operator_id: options.operator_id || null,
                operation_type: 'price_change',
                target_type: 'product',
                target_id: sku.exchange_item_id,
                action: 'batch_update',
                before_data: { cost_amount: oldAmount, sku_id: sku.sku_id },
                after_data: { cost_amount: newAmount, sku_id: sku.sku_id },
                changed_fields: { cost_amount: { from: oldAmount, to: newAmount } },
                reason: `批量调价（${mode}=${value}）`,
                risk_level: 'medium',
                requires_approval: false,
                approval_status: 'not_required'
              },
              { transaction }
            )
          } catch (logErr) {
            logger.warn('[兑换市场] 价格变动日志记录失败', { error: logErr.message })
          }
        }
      }
    }

    // 刷新受影响商品的 SPU 汇总
    for (const pid of productIdsToRefresh) {
      await this._updateSpuSummary(pid, transaction)
    }

    await BusinessCacheHelper.invalidateExchangeItems('batch_price_update').catch(() => {})

    logger.info('[兑换市场-管理] 批量调价完成', {
      requested: exchangeItemIds.length,
      affected: updatedCount
    })
    return { affected_rows: updatedCount, adjustment }
  }

  /**
   * 批量逐个设价（每个兑换商品可指定不同 cost_amount）
   *
   * 业务场景：运营在后台对多个 SKU 分别定价，与 batchUpdatePrice（统一按比例/加减）互补。
   * 实现要点：与 batchUpdatePrice 相同路径——默认 SKU + 已启用渠道价行，写审计日志并刷新 SPU 汇总。
   *
   * @param {Array<{ exchange_item_id: number, cost_amount: number }>} priceItems - 商品价格行
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize 事务（必填）
   * @param {number} [options.operator_id] - 操作人 user_id
   * @returns {Promise<{ affected_rows: number }>} 实际更新的渠道价行数
   */
  async batchSetIndividualPrices(priceItems, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchSetIndividualPrices')

    if (!Array.isArray(priceItems) || priceItems.length === 0) {
      throw new Error('价格数据不能为空')
    }

    const priceMap = new Map()
    for (const item of priceItems) {
      if (!item.exchange_item_id || item.cost_amount === undefined || item.cost_amount < 0) {
        continue
      }
      priceMap.set(Number(item.exchange_item_id), Number(item.cost_amount))
    }

    if (priceMap.size === 0) {
      return { affected_rows: 0 }
    }

    logger.info('[兑换市场-管理] 批量逐个设价', { count: priceMap.size })

    const ChannelPriceModel = this.models.ExchangeChannelPrice

    const skus = await this.ExchangeItemSku.findAll({
      where: { exchange_item_id: { [Op.in]: [...priceMap.keys()] } },
      include: [
        {
          model: ChannelPriceModel,
          as: 'channelPrices',
          where: { is_enabled: true },
          required: true
        }
      ],
      transaction
    })

    let updatedCount = 0
    const productIdsToRefresh = new Set()

    for (const sku of skus) {
      const targetAmount = priceMap.get(sku.exchange_item_id)
      if (targetAmount === undefined) continue

      const newAmount = Math.max(1, Math.round(targetAmount))

      for (const price of sku.channelPrices) {
        const oldAmount = Number(price.cost_amount)
        if (newAmount === oldAmount) continue

        await price.update({ cost_amount: newAmount }, { transaction })
        updatedCount++
        productIdsToRefresh.add(sku.exchange_item_id)

        try {
          await this.models.AdminOperationLog.create(
            {
              operator_id: options.operator_id || null,
              operation_type: 'price_change',
              target_type: 'product',
              target_id: sku.exchange_item_id,
              action: 'batch_set_individual',
              before_data: { cost_amount: oldAmount, sku_id: sku.sku_id },
              after_data: { cost_amount: newAmount, sku_id: sku.sku_id },
              changed_fields: { cost_amount: { from: oldAmount, to: newAmount } },
              reason: '批量逐个设价',
              risk_level: 'medium',
              requires_approval: false,
              approval_status: 'not_required'
            },
            { transaction }
          )
        } catch (logErr) {
          logger.warn('[兑换市场] 价格变动日志记录失败', { error: logErr.message })
        }
      }
    }

    for (const pid of productIdsToRefresh) {
      await this._updateSpuSummary(pid, transaction)
    }

    await BusinessCacheHelper.invalidateExchangeItems('batch_individual_price_set').catch(() => {})

    logger.info('[兑换市场-管理] 批量逐个设价完成', {
      requested: priceMap.size,
      affected: updatedCount
    })
    return { affected_rows: updatedCount }
  }

  /**
   * 批量修改商品分类（C3：批量修改 category_id）
   *
   * @param {number[]} exchangeItemIds - 商品 ID 数组
   * @param {number|null} categoryDefId - 目标分类 ID（null 表示清除分类）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} { affected_rows, category_id }
   */
  async batchUpdateCategory(exchangeItemIds, categoryDefId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchUpdateCategory')

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new Error('商品ID数组不能为空')
    }

    // 验证分类存在
    if (categoryDefId !== null) {
      const { Category } = this.models
      const category = await Category.findByPk(categoryDefId, { transaction })
      if (!category) {
        throw new Error(`分类不存在：${categoryDefId}`)
      }
    }

    logger.info('[兑换市场-管理] 批量修改商品分类', {
      count: exchangeItemIds.length,
      category_id: categoryDefId
    })

    const [affectedRows] = await this.ExchangeItem.update(
      { category_id: categoryDefId, updated_at: BeijingTimeHelper.createDatabaseTime() },
      { where: { exchange_item_id: { [Op.in]: exchangeItemIds } }, transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems('batch_category_update').catch(() => {})

    logger.info('[兑换市场-管理] 批量修改分类完成', {
      requested: exchangeItemIds.length,
      affected: affectedRows
    })
    return { affected_rows: affectedRows, category_id: categoryDefId }
  }

  /**
   * 批量修改商品稀有度（C3 扩展：批量修改 rarity_code）
   *
   * @param {number[]} exchangeItemIds - 商品 ID 数组
   * @param {string} rarityCode - 目标稀有度代码
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} { affected_rows, rarity_code }
   */
  async batchUpdateRarity(exchangeItemIds, rarityCode, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchUpdateRarity')

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new Error('商品ID数组不能为空')
    }

    if (!rarityCode) {
      throw new Error('稀有度代码不能为空')
    }

    // 验证稀有度存在
    const { RarityDef } = this.models
    const rarity = await RarityDef.findOne({ where: { rarity_code: rarityCode }, transaction })
    if (!rarity) {
      throw new Error(`稀有度不存在：${rarityCode}`)
    }

    logger.info('[兑换市场-管理] 批量修改商品稀有度', {
      count: exchangeItemIds.length,
      rarity_code: rarityCode
    })

    const [affectedRows] = await this.ExchangeItem.update(
      { rarity_code: rarityCode, updated_at: BeijingTimeHelper.createDatabaseTime() },
      { where: { exchange_item_id: { [Op.in]: exchangeItemIds } }, transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems('batch_rarity_update').catch(() => {})

    logger.info('[兑换市场-管理] 批量修改稀有度完成', {
      requested: exchangeItemIds.length,
      affected: affectedRows
    })
    return { affected_rows: affectedRows, rarity_code: rarityCode }
  }

  /**
   * 获取空间分布统计（管理后台用，Phase 3.8）
   *
   * @returns {Promise<Object>} 空间分布统计
   */
  async getSpaceDistribution() {
    try {
      const distribution = await this.ExchangeItem.findAll({
        attributes: [
          'space',
          [this.sequelize.fn('COUNT', this.sequelize.col('exchange_item_id')), 'count']
        ],
        group: ['space'],
        raw: true
      })

      const result = { lucky: 0, premium: 0, both: 0 }
      distribution.forEach(row => {
        result[row.space] = parseInt(row.count, 10)
      })

      return {
        distribution: result,
        total: Object.values(result).reduce((sum, v) => sum + v, 0)
      }
    } catch (error) {
      logger.error('[兑换市场-管理] 查询空间分布失败:', error.message)
      throw error
    }
  }
  /*
   * ================================================================
   * SKU 管理方法（Phase 2 — SPU/SKU 全量模式）
   * ================================================================
   */

  /**
   * 获取商品的所有 SKU 列表
   *
   * @param {number} exchangeItemId - SPU 商品ID
   * @returns {Promise<Object>} SKU 列表和商品基础信息
   */
  async listSkus(exchangeItemId) {
    const ExchangeItemSkuModel = this.models.ExchangeItemSku
    const item = await this.ExchangeItem.findByPk(exchangeItemId, {
      attributes: [
        'exchange_item_id',
        'item_name',
        'stock',
        'sold_count',
        'min_cost_amount',
        'max_cost_amount'
      ]
    })

    if (!item) {
      throw new Error('商品不存在')
    }

    const skus = await ExchangeItemSkuModel.findAll({
      where: { exchange_item_id: exchangeItemId },
      order: [
        ['sort_order', 'ASC'],
        ['sku_id', 'ASC']
      ]
    })

    return {
      item: item.toJSON(),
      skus: skus.map(s => s.toJSON()),
      total: skus.length
    }
  }

  /**
   * 创建 SKU（为商品添加新的规格变体）
   *
   * @param {number} exchangeItemId - SPU 商品ID
   * @param {Object} skuData - SKU 数据
   * @param {Object} skuData.spec_values - 规格值，如 {"颜色":"白色","尺码":"S"}
   * @param {number} skuData.cost_amount - 该 SKU 的兑换价格
   * @param {number} skuData.stock - 初始库存
   * @param {string} [skuData.cost_asset_code] - 支付资产代码（覆盖 SPU 默认值）
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 创建的 SKU
   */
  async createSku(exchangeItemId, skuData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.createSku')
    const ExchangeItemSkuModel = this.models.ExchangeItemSku

    const item = await this.ExchangeItem.findByPk(exchangeItemId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!item) {
      throw new Error('商品不存在')
    }

    if (!skuData.cost_amount || skuData.cost_amount <= 0) {
      throw new Error('SKU 兑换价格必须大于 0')
    }

    if (skuData.stock === undefined || skuData.stock < 0) {
      throw new Error('SKU 库存必须大于等于 0')
    }

    const sku = await ExchangeItemSkuModel.create(
      {
        exchange_item_id: exchangeItemId,
        stock: parseInt(skuData.stock),
        sold_count: 0,
        cost_price: parseFloat(skuData.cost_price) || 0,
        status: skuData.status || 'active',
        sort_order: parseInt(skuData.sort_order) || 0
      },
      { transaction }
    )

    // 创建对应的渠道定价行
    const ChannelPriceModel = this.models.ExchangeChannelPrice
    if (ChannelPriceModel) {
      await ChannelPriceModel.create(
        {
          sku_id: sku.sku_id,
          cost_asset_code: skuData.cost_asset_code || 'DIAMOND',
          cost_amount: parseInt(skuData.cost_amount),
          original_amount: skuData.original_amount ? parseInt(skuData.original_amount) : null,
          is_enabled: true
        },
        { transaction }
      )
    }

    await this._updateSpuSummary(exchangeItemId, transaction)

    await BusinessCacheHelper.invalidateExchangeItems('sku_created')

    logger.info('[兑换市场] SKU 创建成功', {
      sku_id: sku.sku_id,
      exchange_item_id: exchangeItemId,
      spec_values: skuData.spec_values
    })

    return { sku: sku.toJSON() }
  }

  /**
   * 更新 SKU
   *
   * @param {number} skuId - SKU ID
   * @param {Object} updateData - 更新数据
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 更新后的 SKU
   */
  async updateSku(skuId, updateData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.updateSku')
    const ExchangeItemSkuModel = this.models.ExchangeItemSku

    const sku = await ExchangeItemSkuModel.findByPk(skuId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!sku) {
      throw new Error('SKU 不存在')
    }

    const skuAllowedFields = ['stock', 'cost_price', 'status', 'sort_order']
    const skuUpdate = {}
    for (const field of skuAllowedFields) {
      if (updateData[field] !== undefined) {
        skuUpdate[field] = updateData[field]
      }
    }

    if (updateData.cost_amount !== undefined && updateData.cost_amount <= 0) {
      throw new Error('SKU 兑换价格必须大于 0')
    }

    if (Object.keys(skuUpdate).length > 0) {
      await sku.update(skuUpdate, { transaction })
    }

    // 渠道定价更新（cost_asset_code / cost_amount 在 exchange_channel_prices 表）
    const priceUpdate = {}
    if (updateData.cost_asset_code !== undefined) {
      priceUpdate.cost_asset_code = updateData.cost_asset_code
    }
    if (updateData.cost_amount !== undefined) {
      priceUpdate.cost_amount = parseInt(updateData.cost_amount)
    }
    if (updateData.original_amount !== undefined) {
      priceUpdate.original_amount = updateData.original_amount
    }

    if (Object.keys(priceUpdate).length > 0) {
      const ChannelPriceModel = this.models.ExchangeChannelPrice
      if (ChannelPriceModel) {
        await ChannelPriceModel.update(priceUpdate, {
          where: { sku_id: skuId },
          transaction
        })
      }
    }

    await this._updateSpuSummary(sku.exchange_item_id, transaction)

    await BusinessCacheHelper.invalidateExchangeItems('sku_updated')

    return { sku: sku.toJSON() }
  }

  /**
   * 删除 SKU（不允许删除最后一个 SKU）
   *
   * @param {number} skuId - SKU ID
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 删除结果
   */
  async deleteSku(skuId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.deleteSku')
    const ExchangeItemSkuModel = this.models.ExchangeItemSku

    const sku = await ExchangeItemSkuModel.findByPk(skuId, { transaction })
    if (!sku) {
      throw new Error('SKU 不存在')
    }

    const skuCount = await ExchangeItemSkuModel.count({
      where: { exchange_item_id: sku.exchange_item_id },
      transaction
    })

    if (skuCount <= 1) {
      throw new Error('不能删除最后一个 SKU，每个商品至少保留一个 SKU')
    }

    const exchangeItemId = sku.exchange_item_id
    await sku.destroy({ transaction })
    await this._updateSpuSummary(exchangeItemId, transaction)

    await BusinessCacheHelper.invalidateExchangeItems('sku_deleted')

    logger.info('[兑换市场] SKU 删除成功', { sku_id: skuId, exchange_item_id: exchangeItemId })

    return { action: 'deleted', sku_id: skuId }
  }

  /**
   * 更新 SPU 汇总字段（stock/sold_count/min_cost_amount/max_cost_amount）
   * 从所有 active SKU 聚合计算
   *
   * @param {number} exchangeItemId - SPU 商品ID
   * @param {Transaction} transaction - 事务对象
   * @returns {Promise<void>} 无返回值，直接更新 SPU 记录
   * @private
   */
  async _updateSpuSummary(exchangeItemId, transaction) {
    const ExchangeItemSkuModel = this.models.ExchangeItemSku

    const [skuSummary] = await ExchangeItemSkuModel.findAll({
      where: { exchange_item_id: exchangeItemId, status: 'active' },
      attributes: [
        [this.sequelize.fn('SUM', this.sequelize.col('stock')), 'total_stock'],
        [this.sequelize.fn('SUM', this.sequelize.col('sold_count')), 'total_sold']
      ],
      raw: true,
      transaction
    })

    const [priceSummary] = await this.sequelize.query(
      `SELECT MIN(ecp.cost_amount) AS min_cost, MAX(ecp.cost_amount) AS max_cost
       FROM exchange_item_skus ps
       JOIN exchange_channel_prices ecp ON ecp.sku_id = ps.sku_id AND ecp.is_enabled = 1
       WHERE ps.exchange_item_id = :productId AND ps.status = 'active'`,
      {
        replacements: { productId: exchangeItemId },
        type: this.sequelize.QueryTypes.SELECT,
        transaction
      }
    )

    await this.ExchangeItem.update(
      {
        stock: parseInt(skuSummary.total_stock) || 0,
        sold_count: parseInt(skuSummary.total_sold) || 0,
        min_cost_amount: priceSummary?.min_cost !== null ? parseInt(priceSummary.min_cost) : null,
        max_cost_amount: priceSummary?.max_cost !== null ? parseInt(priceSummary.max_cost) : null
      },
      {
        where: { exchange_item_id: exchangeItemId },
        transaction
      }
    )
  }
  /*
   * ================================================================
   * 兑换商品管理方法 — 委托 ExchangeItemService
   * 兑换商品 SPU CRUD 管理
   * ================================================================
   */
}

module.exports = AdminService
