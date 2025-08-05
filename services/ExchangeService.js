/**
 * 餐厅积分抽奖系统 v2.0 - 商品兑换业务服务
 * 实现商品兑换系统的核心业务逻辑
 */

const { sequelize } = require('../models')
const { User, Product, ExchangeRecord, PremiumSpaceAccess, PointsRecord } = require('../models')

class ExchangeService {
  constructor () {
    this.productCache = null
    this.productCacheExpiry = null
    this.cacheTTL = 2 * 60 * 1000 // 2分钟缓存
  }

  /**
   * 获取商品列表（支持双空间）
   * @param {Object} options - 查询选项
   * @returns {Object} 商品列表和分页信息
   */
  async getProducts (options = {}) {
    const {
      space = 'lucky',
      page = 1,
      pageSize = 20,
      category = null,
      sortBy = 'sort_order',
      order = 'DESC',
      minPoints = 0,
      maxPoints = 999999,
      stockFilter = 'all',
      searchKeyword = '',
      includeOutOfStock = false
    } = options

    try {
      const offset = (page - 1) * pageSize
      const whereClause = {
        status: 'active'
      }

      // 空间筛选
      if (space !== 'both') {
        whereClause.space = [space, 'both']
      }

      // 分类筛选
      if (category && category !== 'all') {
        whereClause.category = category
      }

      // 积分范围筛选
      if (minPoints > 0 || maxPoints < 999999) {
        whereClause.exchange_points = {
          [sequelize.Sequelize.Op.between]: [minPoints, maxPoints]
        }
      }

      // 库存筛选
      if (stockFilter === 'in-stock') {
        whereClause.stock = { [sequelize.Sequelize.Op.gt]: 0 }
      } else if (stockFilter === 'low-stock') {
        whereClause.stock = {
          [sequelize.Sequelize.Op.and]: [
            { [sequelize.Sequelize.Op.gt]: 0 },
            { [sequelize.Sequelize.Op.lte]: sequelize.col('low_stock_threshold') }
          ]
        }
      } else if (!includeOutOfStock) {
        whereClause.stock = { [sequelize.Sequelize.Op.gt]: 0 }
      }

      // 搜索关键词
      if (searchKeyword) {
        whereClause[sequelize.Sequelize.Op.or] = [
          { name: { [sequelize.Sequelize.Op.like]: `%${searchKeyword}%` } },
          { description: { [sequelize.Sequelize.Op.like]: `%${searchKeyword}%` } }
        ]
      }

      // 查询商品
      const { count, rows: products } = await Product.findAndCountAll({
        where: whereClause,
        order: [[sortBy, order]],
        limit: pageSize,
        offset,
        attributes: [
          'commodity_id', // 使用实际的主键字段名
          'name',
          'description',
          'image',
          'category',
          'space',
          'exchange_points',
          'stock',
          'original_price',
          'discount',
          'low_stock_threshold',
          'is_hot',
          'is_new',
          'is_limited',
          'sales', // 修正：使用新模型的字段名sales，而不是sales_count
          // 'view_count', // 修复：数据库中不存在此字段，暂时注释
          'rating',
          // 'warranty', // 修复：数据库中不存在此字段，暂时注释
          // 'delivery_info', // 修复：数据库中不存在此字段，暂时注释
          // 'expires_at', // 修复：数据库中不存在此字段，暂时注释
          'created_at',
          'updated_at'
        ]
      })

      // 添加虚拟字段和转换逻辑
      const processedProducts = products.map(product => {
        const productData = product.toJSON()
        return {
          ...productData,
          // 为前端兼容性提供commodityId字段
          commodityId: productData.commodity_id,
          // 添加库存状态
          stockStatus: product.getStockStatus(),
          // 处理价格显示
          finalPrice: productData.original_price
            ? Math.round(productData.original_price * (1 - productData.discount / 100))
            : null,
          // 添加标签
          tags: [
            ...(productData.is_hot ? ['热门'] : []),
            ...(productData.is_new ? ['新品'] : []),
            ...(productData.is_limited ? ['限量'] : [])
          ],
          // 预估高度（前端显示用）
          estimatedHeight: 180
        }
      })

      // 统计信息
      const summary = await this._getProductSummary(space, category)

      return {
        products: processedProducts,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(count / pageSize),
          total_count: count,
          has_more: page * pageSize < count,
          next_page: page * pageSize < count ? page + 1 : null
        },
        summary
      }
    } catch (error) {
      console.error('❌ 获取商品列表失败:', error.message)
      throw new Error(`获取商品列表失败: ${error.message}`)
    }
  }

  /**
   * 获取臻选空间解锁状态
   * @param {number} userId - 用户ID
   * @returns {Object} 解锁状态信息
   */
  async getPremiumSpaceStatus (userId) {
    try {
      // 获取用户信息和累计积分
      const user = await User.findByPk(userId, {
        attributes: ['id', 'total_points']
      })

      if (!user) {
        throw new Error('用户不存在')
      }

      // 计算累计积分（从积分记录表计算）
      const cumulativePoints =
        (await PointsRecord.sum('amount', {
          where: {
            user_id: userId,
            amount: { [sequelize.Sequelize.Op.gt]: 0 }
          }
        })) || 0

      // 获取解锁状态
      const accessStatus = await PremiumSpaceAccess.getAccessStatus(userId, cumulativePoints)

      return {
        cumulative_points: cumulativePoints,
        current_points: user.total_points,
        ...accessStatus
      }
    } catch (error) {
      console.error('❌ 获取臻选空间状态失败:', error.message)
      throw new Error(`获取臻选空间状态失败: ${error.message}`)
    }
  }

  /**
   * 解锁臻选空间
   * @param {number} userId - 用户ID
   * @param {Object} options - 解锁选项
   * @returns {Object} 解锁结果
   */
  async unlockPremiumSpace (userId, options = {}) {
    const { _confirmTimestamp, clientInfo = null } = options
    let transaction = null

    try {
      transaction = await sequelize.transaction()

      // 获取用户信息
      const user = await User.findByPk(userId, {
        attributes: ['id', 'total_points'],
        transaction
      })

      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取或创建臻选空间访问记录
      const access = await PremiumSpaceAccess.findOrCreateForUser(userId)

      // 计算累计积分
      const cumulativePoints =
        (await PointsRecord.sum('amount', {
          where: {
            user_id: userId,
            amount: { [sequelize.Sequelize.Op.gt]: 0 }
          },
          transaction
        })) || 0

      // 检查解锁条件
      if (!access.canUnlock(cumulativePoints)) {
        throw new Error(
          `累计积分不足，当前${cumulativePoints}，需要${access.required_cumulative_points}`
        )
      }

      // 检查当前积分是否足够
      if (user.total_points < access.unlock_cost_points) {
        throw new Error(`积分余额不足，当前${user.total_points}，需要${access.unlock_cost_points}`)
      }

      // 扣除积分
      const newBalance = user.total_points - access.unlock_cost_points
      await user.update({ total_points: newBalance }, { transaction })

      // 记录积分扣除
      await PointsRecord.create(
        {
          user_id: userId,
          amount: -access.unlock_cost_points,
          balance: newBalance,
          source: 'premium_unlock',
          description: '解锁臻选空间',
          related_id: `premium_unlock_${Date.now()}`,
          admin_id: null
        },
        { transaction }
      )

      // 执行解锁
      const unlockResult = await access.unlock(clientInfo)

      await transaction.commit()

      return {
        unlocked: true,
        unlock_time: unlockResult.unlock_time,
        expiry_time: unlockResult.expiry_time,
        remaining_points: newBalance,
        access_token: `premium_access_${userId}_${unlockResult.unlock_time}`
      }
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback()
      }
      console.error('❌ 解锁臻选空间失败:', error.message)
      throw new Error(`解锁臻选空间失败: ${error.message}`)
    }
  }

  /**
   * 执行商品兑换
   * @param {number} userId - 用户ID
   * @param {Object} exchangeData - 兑换数据
   * @returns {Object} 兑换结果
   */
  async redeemProduct (userId, exchangeData) {
    const {
      productId,
      quantity = 1,
      space,
      _confirmTimestamp,
      clientVersion = '2.0'
    } = exchangeData

    let transaction = null

    try {
      transaction = await sequelize.transaction()

      // 获取用户信息
      const user = await User.findByPk(userId, {
        attributes: ['id', 'total_points'],
        transaction
      })

      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取商品信息（加锁防止并发）
      const product = await Product.findByPk(productId, {
        transaction,
        lock: true
      })

      if (!product) {
        throw new Error('商品不存在')
      }

      // 验证商品状态
      if (!product.isAvailable()) {
        throw new Error('商品已下架或缺货')
      }

      // 验证商品空间权限
      if (!product.canAccess(space)) {
        throw new Error('无权限访问该空间商品')
      }

      // 检查库存
      if (product.stock < quantity) {
        throw new Error(`库存不足，可用库存${product.stock}，请求数量${quantity}`)
      }

      // 如果是臻选空间商品，验证解锁状态
      if (space === 'premium' && product.space !== 'lucky') {
        const access = await PremiumSpaceAccess.findOrCreateForUser(userId)
        if (!access.isCurrentlyUnlocked()) {
          throw new Error('需要解锁臻选空间')
        }
      }

      // 计算总消费积分
      const totalPoints = product.exchange_points * quantity

      // 检查用户积分余额
      if (user.total_points < totalPoints) {
        throw new Error(`积分余额不足，当前${user.total_points}，需要${totalPoints}`)
      }

      // 扣除用户积分
      const newBalance = user.total_points - totalPoints
      await user.update({ total_points: newBalance }, { transaction })

      // 扣减商品库存
      const newStock = product.stock - quantity
      await product.update(
        {
          stock: newStock,
          sales: product.sales + quantity
        },
        { transaction }
      )

      // 生成兑换记录
      const exchangeId = ExchangeRecord.generateExchangeId()
      const exchangeCode = ExchangeRecord.generateExchangeCode()

      // 计算兑换码过期时间（30天后）
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      // 保存商品信息快照
      const productSnapshot = {
        id: product.commodity_id, // 使用实际主键
        name: product.name,
        description: product.description,
        category: product.category,
        exchange_points: product.exchange_points,
        original_price: product.original_price,
        space: product.space
      }

      // 创建兑换记录
      const exchangeRecord = await ExchangeRecord.create(
        {
          exchange_id: exchangeId,
          user_id: userId,
          product_id: productId,
          product_snapshot: productSnapshot,
          quantity,
          total_points: totalPoints,
          exchange_code: exchangeCode,
          status: 'completed',
          space,
          exchange_time: new Date(),
          expires_at: expiresAt,
          client_info: `${clientVersion}_${_confirmTimestamp}`,
          usage_info: {
            valid_until: expiresAt.toISOString(),
            usage_method: '请到店出示兑换码',
            contact_info: '客服电话：400-123-4567',
            store_locations: ['门店1', '门店2']
          }
        },
        { transaction }
      )

      // 记录积分扣除
      await PointsRecord.create(
        {
          user_id: userId,
          amount: -totalPoints,
          balance: newBalance,
          source: 'product_exchange',
          description: `兑换商品：${product.name}`,
          related_id: exchangeId,
          admin_id: null
        },
        { transaction }
      )

      // 更新用户兑换统计
      await this._updateUserExchangeStats(userId, transaction)

      await transaction.commit()

      // 库存更新信息（用于WebSocket推送）
      const stockInfo = {
        product_id: productId,
        old_stock: product.stock,
        new_stock: newStock,
        low_stock_warning: newStock <= product.low_stock_threshold
      }

      return {
        exchange_id: exchangeId,
        exchange_code: exchangeCode,
        exchanged_at: exchangeRecord.exchange_time.toISOString(),
        product: {
          id: product.commodity_id, // 使用实际主键
          name: product.name,
          category: product.category,
          exchange_points: product.exchange_points,
          image: product.image,
          space: product.space
        },
        user_status: {
          remaining_points: newBalance,
          total_exchanges: await this._getUserTotalExchanges(userId),
          today_exchanges: await this._getUserTodayExchanges(userId)
        },
        usage_info: exchangeRecord.usage_info,
        stock_info: stockInfo
      }
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback()
      }
      console.error('❌ 商品兑换失败:', error.message)
      throw new Error(`商品兑换失败: ${error.message}`)
    }
  }

  /**
   * 获取用户兑换记录
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 兑换记录列表
   */
  async getExchangeRecords (userId, options = {}) {
    try {
      const {
        page = 1,
        pageSize = 20,
        status = null,
        space = null,
        includeExpired = false
      } = options

      const offset = (page - 1) * pageSize
      const records = await ExchangeRecord.getExchangesByUser(userId, {
        limit: pageSize,
        offset,
        status,
        space,
        includeExpired
      })

      const totalCount = await ExchangeRecord.count({
        where: { user_id: userId }
      })

      return {
        records: records.map(record => ({
          ...record.toJSON(),
          is_expired: record.isExpired(),
          can_use: record.canUse()
        })),
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalCount / pageSize),
          total_count: totalCount,
          has_more: page * pageSize < totalCount
        }
      }
    } catch (error) {
      console.error('❌ 获取兑换记录失败:', error.message)
      throw new Error(`获取兑换记录失败: ${error.message}`)
    }
  }

  /**
   * 获取兑换统计信息
   * @param {Object} options - 统计选项
   * @returns {Object} 统计数据
   */
  async getExchangeStatistics (options = {}) {
    try {
      const { startDate = null, endDate = null, space = null, userId = null } = options

      const whereClause = {}

      if (startDate && endDate) {
        whereClause.exchange_time = {
          [sequelize.Sequelize.Op.between]: [startDate, endDate]
        }
      }

      if (space) {
        whereClause.space = space
      }

      if (userId) {
        whereClause.user_id = userId
      }

      const stats = await ExchangeRecord.getExchangeStats({
        startDate,
        endDate,
        space
      })

      return stats
    } catch (error) {
      console.error('❌ 获取兑换统计失败:', error.message)
      throw new Error(`获取兑换统计失败: ${error.message}`)
    }
  }

  // 私有辅助方法

  /**
   * 获取商品统计摘要
   */
  async _getProductSummary (space, category) {
    try {
      const whereClause = {
        status: 'active'
      }

      // 空间筛选
      if (space !== 'both') {
        whereClause.space = [space, 'both']
      }

      // 分类筛选
      if (category && category !== 'all') {
        whereClause.category = category
      }

      const [totalCount, inStockCount, hotCount, newCount] = await Promise.all([
        Product.count({ where: whereClause }),
        Product.count({
          where: {
            ...whereClause,
            stock: { [sequelize.Sequelize.Op.gt]: 0 }
          }
        }),
        Product.count({
          where: {
            ...whereClause,
            is_hot: true
          }
        }),
        Product.count({
          where: {
            ...whereClause,
            is_new: true
          }
        })
      ])

      return {
        total_count: totalCount,
        in_stock_count: inStockCount,
        hot_count: hotCount,
        new_count: newCount,
        categories: await this._getProductCategories(space)
      }
    } catch (error) {
      console.error('❌ 获取商品统计摘要失败:', error.message)
      return {
        total_count: 0,
        in_stock_count: 0,
        hot_count: 0,
        new_count: 0,
        categories: []
      }
    }
  }

  /**
   * 获取商品分类列表
   */
  async _getProductCategories (space) {
    try {
      const whereClause = {
        status: 'active'
      }

      if (space !== 'both') {
        whereClause.space = [space, 'both']
      }

      const categories = await Product.findAll({
        where: whereClause,
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('commodity_id')), 'count']
        ],
        group: ['category'],
        order: [[sequelize.fn('COUNT', sequelize.col('commodity_id')), 'DESC']]
      })

      return categories.map(cat => ({
        name: cat.category,
        count: parseInt(cat.get('count'))
      }))
    } catch (error) {
      console.error('❌ 获取商品分类失败:', error.message)
      return []
    }
  }

  /**
   * 更新用户兑换统计
   */
  async _updateUserExchangeStats (_userId, _transaction) {
    // 这里可以实现用户兑换统计的更新逻辑
    // 暂时返回成功，不需要try-catch
    return true
  }

  /**
   * 获取用户总兑换次数
   */
  async _getUserTotalExchanges (userId) {
    try {
      const { ExchangeRecord } = require('../models')
      return await ExchangeRecord.count({
        where: { user_id: userId }
      })
    } catch (error) {
      console.error('❌ 获取用户总兑换次数失败:', error.message)
      return 0
    }
  }

  /**
   * 获取用户今日兑换次数
   */
  async _getUserTodayExchanges (userId) {
    try {
      const { ExchangeRecord } = require('../models')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      return await ExchangeRecord.count({
        where: {
          user_id: userId,
          exchange_time: {
            [sequelize.Sequelize.Op.between]: [today, tomorrow]
          }
        }
      })
    } catch (error) {
      console.error('❌ 获取用户今日兑换次数失败:', error.message)
      return 0
    }
  }

  /**
   * 计算商品卡片高度（瀑布流布局用）
   */
  _calculateCardHeight (product) {
    let baseHeight = 180

    // 根据商品名称长度调整
    if (product.name.length > 10) {
      baseHeight += 20
    }

    // 根据描述长度调整
    if (product.description && product.description.length > 50) {
      baseHeight += 30
    }

    // 根据标签数量调整
    const tagCount = this._generateProductTags(product).length
    baseHeight += tagCount * 8

    return baseHeight
  }

  /**
   * 生成商品标签
   */
  _generateProductTags (product) {
    const tags = []

    if (product.is_new) tags.push('新品')
    if (product.is_hot) tags.push('热销')
    if (product.is_limited) tags.push('限量')
    if (product.discount > 0) tags.push(`${product.discount}%折扣`)
    if (product.stock <= product.low_stock_threshold) tags.push('库存紧张')

    return tags
  }
}

module.exports = ExchangeService
