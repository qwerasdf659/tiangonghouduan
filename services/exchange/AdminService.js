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
   * @param {string} [itemData.space='lucky'] - 空间归属（lucky=幸运空间, premium=臻选空间, both=两者都展示）
   * @param {number} [itemData.original_price] - 原价（材料数量，用于展示划线价）
   * @param {Array} [itemData.tags] - 商品标签数组，如 ["限量","新品"]
   * @param {boolean} [itemData.is_new=false] - 是否新品
   * @param {boolean} [itemData.is_hot=false] - 是否热门
   * @param {boolean} [itemData.is_lucky=false] - 是否幸运商品
   * @param {boolean} [itemData.has_warranty=false] - 是否有质保
   * @param {boolean} [itemData.free_shipping=false] - 是否包邮
   * @param {string} [itemData.sell_point] - 营销卖点文案
   * @param {string} [itemData.category] - 商品分类
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

    // 创建商品（包含臻选空间/幸运空间扩展字段）
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
        category: itemData.category || null,
        // 臻选空间/幸运空间扩展字段（决策12：9个新字段）
        space: itemData.space || 'lucky',
        original_price: itemData.original_price ? parseInt(itemData.original_price) : null,
        tags: itemData.tags || null,
        is_new: !!itemData.is_new,
        is_hot: !!itemData.is_hot,
        is_lucky: !!itemData.is_lucky,
        has_warranty: !!itemData.has_warranty,
        free_shipping: !!itemData.free_shipping,
        sell_point: itemData.sell_point || null,
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

    // 臻选空间/幸运空间扩展字段更新（决策12：9个新字段）
    if (updateData.space !== undefined) {
      const validSpaces = ['lucky', 'premium', 'both']
      if (!validSpaces.includes(updateData.space)) {
        throw new Error(`无效的space参数，允许值：${validSpaces.join(', ')}`)
      }
      finalUpdateData.space = updateData.space
    }

    if (updateData.original_price !== undefined) {
      finalUpdateData.original_price = updateData.original_price
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

    if (updateData.sell_point !== undefined) {
      finalUpdateData.sell_point = updateData.sell_point || null
    }

    if (updateData.category !== undefined) {
      finalUpdateData.category = updateData.category || null
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
      const { page = 1, limit = 20, filter = 'all', max_listings = 3, mobile } = options

      logger.info('[兑换市场] 管理员获取用户上架统计', {
        page,
        limit,
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
            pagination: { page, limit, total: 0, total_pages: 0 },
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

      const listingCounts = await this.MarketListing.findAll({
        where: listingWhere,
        attributes: [
          'seller_user_id',
          [this.sequelize.fn('COUNT', this.sequelize.col('market_listing_id')), 'count']
        ],
        group: ['seller_user_id'],
        raw: true
      })

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
      const offset = (page - 1) * limit
      const paginatedItems = filteredItems.slice(offset, offset + limit)

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
        pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
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
      const { user_id, status, page = 1, page_size = 20 } = options

      if (!user_id) throw new Error('user_id 是必填参数')

      logger.info('[兑换市场] 管理员查询用户上架列表', { user_id, status, page, page_size })

      // 查询用户信息
      const user = await this.User.findByPk(user_id, {
        attributes: ['user_id', 'mobile', 'nickname', 'status', 'max_active_listings']
      })
      if (!user) throw new Error(`用户不存在: ${user_id}`)

      // 构建查询条件
      const where = { seller_user_id: user_id }
      if (status) where.status = status

      // 查询挂牌列表
      const { count, rows } = await this.MarketListing.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
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
        listings: rows.map(listing => listing.toJSON()),
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
   * 批量绑定商品图片（运营批量上传图片后绑定）
   *
   * 业务场景：77条兑换商品的 primary_image_id 全为 NULL，
   * 运营在管理后台上传图片后，通过此接口批量绑定图片到对应商品
   *
   * @param {Array<Object>} bindings - 绑定关系数组
   * @param {number} bindings[].exchange_item_id - 商品ID
   * @param {number} bindings[].image_resource_id - 图片资源ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 绑定结果
   */
  async batchBindImages(bindings, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchBindImages')

    if (!Array.isArray(bindings) || bindings.length === 0) {
      throw new Error('绑定关系数组不能为空')
    }

    // 参数格式验证
    for (const binding of bindings) {
      if (!binding.exchange_item_id || !binding.image_resource_id) {
        throw new Error('每条绑定记录必须包含 exchange_item_id 和 image_resource_id')
      }
    }

    logger.info('[兑换市场-管理] 批量绑定商品图片', { count: bindings.length })

    const ImageService = require('../ImageService')
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

        // 更新商品的 primary_image_id
        await item.update({ primary_image_id: binding.image_resource_id }, { transaction })

        // 绑定图片的 context_id 到商品ID（防止24h清理误删）
        await ImageService.updateImageContextId(
          binding.image_resource_id,
          binding.exchange_item_id,
          transaction
        )

        results.success++
        results.details.push({
          exchange_item_id: binding.exchange_item_id,
          image_resource_id: binding.image_resource_id,
          success: true
        })
      } catch (bindError) {
        results.failed++
        results.details.push({
          exchange_item_id: binding.exchange_item_id,
          image_resource_id: binding.image_resource_id,
          success: false,
          error: bindError.message
        })
        logger.warn('[兑换市场-管理] 单条图片绑定失败', {
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
        where: { primary_image_id: null },
        attributes: ['exchange_item_id', 'item_name', 'category', 'status', 'space', 'stock'],
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
