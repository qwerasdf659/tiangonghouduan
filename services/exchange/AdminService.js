/**
 * 餐厅积分抽奖系统 V4.7.0 - 兑换市场管理服务
 * Exchange Admin Service（大文件拆分方案 Phase 4）
 *
 * 职责范围：管理后台操作
 * - createExchangeItem(): 创建兑换商品
 * - updateExchangeItem(): 更新兑换商品
 * - deleteExchangeItem(): 删除兑换商品
 * - getUserListingStats(): 获取用户上架统计
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
const { Op } = require('sequelize')

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
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeRecord = models.ExchangeRecord
    this.User = models.User
    this.MarketListing = models.MarketListing
    this.sequelize = models.sequelize
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
   * @param {number} [itemData.primary_image_id] - 主图片ID
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

    // 创建商品
    const item = await this.ExchangeItem.create(
      {
        item_name: name.trim(),
        description: description.trim(),
        primary_image_id: itemData.primary_image_id || null,
        cost_asset_code: itemData.cost_asset_code,
        cost_amount: parseInt(itemData.cost_amount) || 0,
        cost_price: parseFloat(itemData.cost_price),
        stock: parseInt(itemData.stock),
        sort_order: parseInt(itemData.sort_order) || 100,
        status: itemData.status || 'active',
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    logger.info(`[兑换市场] 商品创建成功，exchange_item_id: ${item.exchange_item_id}`)

    // 图片绑定
    let bound_image = false
    if (itemData.primary_image_id) {
      try {
        const ImageService = require('../ImageService')
        await ImageService.updateImageContextId(
          itemData.primary_image_id,
          item.exchange_item_id,
          transaction
        )
        bound_image = true
        logger.info('[兑换市场] 商品图片绑定成功', {
          exchange_item_id: item.exchange_item_id,
          // 2026-02-01 主键命名规范化：使用完整前缀 image_resource_id
          image_resource_id: itemData.primary_image_id
        })
      } catch (bindError) {
        logger.warn('[兑换市场] 商品图片绑定失败（非致命）', {
          exchange_item_id: item.exchange_item_id,
          // 2026-02-01 主键命名规范化：使用完整前缀 image_resource_id
          image_resource_id: itemData.primary_image_id,
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
      success: true,
      item: item.toJSON(),
      bound_image,
      timestamp: BeijingTimeHelper.now()
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

    const old_image_id = item.primary_image_id
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

    if (updateData.cost_asset_code !== undefined) {
      if (!updateData.cost_asset_code) {
        throw new Error('材料资产代码不能为空')
      }
      finalUpdateData.cost_asset_code = updateData.cost_asset_code
    }

    if (updateData.cost_amount !== undefined) {
      if (updateData.cost_amount <= 0) {
        throw new Error('材料成本数量必须大于0')
      }
      finalUpdateData.cost_amount = parseInt(updateData.cost_amount)
    }

    if (updateData.cost_price !== undefined) {
      if (updateData.cost_price < 0) {
        throw new Error('成本价必须大于等于0')
      }
      finalUpdateData.cost_price = parseFloat(updateData.cost_price)
    }

    if (updateData.stock !== undefined) {
      if (updateData.stock < 0) {
        throw new Error('库存必须大于等于0')
      }
      finalUpdateData.stock = parseInt(updateData.stock)
    }

    if (updateData.sort_order !== undefined) {
      finalUpdateData.sort_order = parseInt(updateData.sort_order)
    }

    if (updateData.status !== undefined) {
      const validStatuses = ['active', 'inactive']
      if (!validStatuses.includes(updateData.status)) {
        throw new Error(`无效的status参数，允许值：${validStatuses.join(', ')}`)
      }
      finalUpdateData.status = updateData.status
    }

    // 处理图片更换
    let deleted_old_image = false
    let bound_new_image = false
    const new_image_id = updateData.primary_image_id

    if (updateData.primary_image_id !== undefined) {
      finalUpdateData.primary_image_id = updateData.primary_image_id || null

      const ImageService = require('../ImageService')

      // 删除旧图片
      if (old_image_id && old_image_id !== new_image_id) {
        try {
          await ImageService.deleteImage(old_image_id, transaction)
          deleted_old_image = true
          logger.info('[兑换市场] 商品旧图片删除成功', { item_id, old_image_id })
        } catch (imageError) {
          logger.warn('[兑换市场] 商品旧图片删除失败（非致命）', {
            item_id,
            old_image_id,
            error: imageError.message
          })
        }
      }

      // 绑定新图片
      if (new_image_id) {
        try {
          await ImageService.updateImageContextId(new_image_id, item_id, transaction)
          bound_new_image = true
          logger.info('[兑换市场] 商品新图片绑定成功', { item_id, new_image_id })
        } catch (bindError) {
          logger.warn('[兑换市场] 商品新图片绑定失败（非致命）', {
            item_id,
            new_image_id,
            error: bindError.message
          })
        }
      }
    }

    await item.update(finalUpdateData, { transaction })

    logger.info(`[兑换市场] 商品更新成功，item_id: ${item_id}`, {
      deleted_old_image,
      bound_new_image,
      old_image_id,
      new_image_id
    })

    // 缓存失效
    try {
      await BusinessCacheHelper.invalidateExchangeItems('item_updated')
    } catch (cacheError) {
      logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    return {
      success: true,
      item: item.toJSON(),
      image_changes: {
        deleted_old_image,
        bound_new_image,
        old_image_id,
        new_image_id
      },
      timestamp: BeijingTimeHelper.now()
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

    const associated_image_id = item.primary_image_id

    // 检查是否有相关订单
    const orderCount = await this.ExchangeRecord.count({
      where: { item_id },
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
        success: true,
        action: 'deactivated',
        message: `该商品有${orderCount}个关联订单，已自动下架而非删除`,
        item: item.toJSON(),
        timestamp: BeijingTimeHelper.now()
      }
    }

    // 删除关联图片
    if (associated_image_id) {
      try {
        const ImageService = require('../ImageService')
        const deleteResult = await ImageService.deleteImage(associated_image_id, transaction)
        logger.info('[兑换市场] 商品关联图片删除成功', {
          item_id,
          // 2026-02-01 主键命名规范化：使用完整前缀 image_resource_id
          image_resource_id: associated_image_id,
          delete_result: deleteResult.success
        })
      } catch (imageError) {
        logger.warn('[兑换市场] 商品关联图片删除失败（非致命）', {
          item_id,
          // 2026-02-01 主键命名规范化：使用完整前缀 image_resource_id
          image_resource_id: associated_image_id,
          error: imageError.message
        })
      }
    }

    await item.destroy({ transaction })

    logger.info(`[兑换市场] 商品删除成功，item_id: ${item_id}`, {
      // 2026-02-01 主键命名规范化：使用完整前缀 image_resource_id
      deleted_image_resource_id: associated_image_id
    })

    try {
      await BusinessCacheHelper.invalidateExchangeItems('item_deleted')
    } catch (cacheError) {
      logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    return {
      success: true,
      action: 'deleted',
      message: '商品删除成功',
      // 2026-02-01 主键命名规范化：使用完整前缀 image_resource_id
      deleted_image_resource_id: associated_image_id,
      timestamp: BeijingTimeHelper.now()
    }
  }

  /**
   * 获取用户上架统计（管理员专用）
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.limit=20] - 每页数量
   * @param {string} [options.filter='all'] - 筛选条件：all/near_limit/at_limit
   * @param {number} options.max_listings - 最大上架数量限制
   * @returns {Promise<Object>} 用户上架统计结果
   */
  async getUserListingStats(options) {
    try {
      const { page = 1, limit = 20, filter = 'all', max_listings = 3 } = options

      logger.info('[兑换市场] 管理员获取用户上架统计', { page, limit, filter, max_listings })

      // 查询所有用户的在售商品数量
      const listingCounts = await this.MarketListing.findAll({
        where: { status: 'on_sale' },
        attributes: [
          'seller_user_id',
          [this.sequelize.fn('COUNT', this.sequelize.col('market_listing_id')), 'count']
        ],
        group: ['seller_user_id'],
        raw: true
      })

      // 根据筛选条件过滤用户
      let filteredUserIds = []
      if (filter === 'at_limit') {
        filteredUserIds = listingCounts
          .filter(item => parseInt(item.count) >= max_listings)
          .map(item => item.seller_user_id)
      } else if (filter === 'near_limit') {
        filteredUserIds = listingCounts
          .filter(item => {
            const count = parseInt(item.count)
            return count >= max_listings * 0.8 && count < max_listings
          })
          .map(item => item.seller_user_id)
      } else {
        filteredUserIds = listingCounts.map(item => item.seller_user_id)
      }

      // 分页处理
      const total = filteredUserIds.length
      const offset = (page - 1) * limit
      const paginatedUserIds = filteredUserIds.slice(offset, offset + limit)

      // 查询用户详情
      const users = await this.User.findAll({
        where: { user_id: paginatedUserIds },
        attributes: ['user_id', 'mobile', 'nickname', 'status']
      })

      // 构建统计结果
      const stats = users.map(user => {
        const count = listingCounts.find(item => item.seller_user_id === user.user_id)
        const listingCount = count ? parseInt(count.count) : 0
        return {
          user_id: user.user_id,
          mobile: user.mobile,
          nickname: user.nickname,
          status: user.status,
          listing_count: listingCount,
          remaining_quota: Math.max(0, max_listings - listingCount),
          is_at_limit: listingCount >= max_listings
        }
      })

      // 汇总统计
      const summary = {
        total_users_with_listings: listingCounts.length,
        users_at_limit: listingCounts.filter(item => parseInt(item.count) >= max_listings).length,
        users_near_limit: listingCounts.filter(item => {
          const count = parseInt(item.count)
          return count >= max_listings * 0.8 && count < max_listings
        }).length,
        total_listings: listingCounts.reduce((sum, item) => sum + parseInt(item.count), 0)
      }

      const result = {
        stats,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        },
        summary
      }

      logger.info('[兑换市场] 用户上架统计查询成功', {
        total_users: result.summary.total_users_with_listings,
        filtered_count: result.pagination.total
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
        success: true,
        items: itemsWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error('[兑换市场-管理] 查询商品列表失败:', error.message)
      throw new Error(`查询商品列表失败: ${error.message}`)
    }
  }

  /**
   * 获取兑换市场统计数据（Admin Only）
   *
   * @returns {Promise<Object>} 统计数据
   */
  async getMarketItemStatistics() {
    try {
      logger.info('[兑换市场-管理] 查询统计数据')

      const [totalItems, activeItems, lowStockItems, totalExchanges] = await Promise.all([
        this.ExchangeItem.count(),
        this.ExchangeItem.count({ where: { status: 'active' } }),
        this.ExchangeItem.count({ where: { stock: { [Op.lt]: 10 } } }),
        this.ExchangeRecord.count({ where: { status: { [Op.ne]: 'cancelled' } } })
      ])

      const statistics = {
        total_items: totalItems,
        active_items: activeItems,
        low_stock_items: lowStockItems,
        total_exchanges: totalExchanges,
        timestamp: BeijingTimeHelper.now()
      }

      logger.info('[兑换市场-管理] 统计数据查询成功', statistics)

      return statistics
    } catch (error) {
      logger.error('[兑换市场-管理] 查询统计数据失败:', error.message)
      throw new Error(`查询统计数据失败: ${error.message}`)
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
    await BusinessCacheHelper.clearExchangeItems()

    logger.info('[兑换市场-管理] 批量更新空间完成', {
      requested: exchangeItemIds.length,
      affected: affectedRows,
      target_space: space
    })

    return { affected_rows: affectedRows, space }
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
}

module.exports = AdminService
