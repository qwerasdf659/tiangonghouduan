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
          'id',
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
          'sales',
          'view_count',
          'rating',
          'warranty',
          'delivery_info',
          'expires_at',
          'created_at',
          'updated_at'
        ]
      })

      // 处理商品数据
      const processedProducts = products.map(product => {
        const productData = product.toJSON()

        // 计算预估卡片高度（瀑布流布局用）
        productData.estimated_height = this._calculateCardHeight(productData)

        // 添加标签
        productData.tags = this._generateProductTags(productData)

        // 库存状态
        productData.stock_status = product.getStockStatus()

        return productData
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
        id: product.id,
        name: product.name,
        image: product.image,
        category: product.category,
        exchange_points: product.exchange_points,
        original_price: product.original_price,
        discount: product.discount
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
          id: product.id,
          name: product.name,
          quantity,
          unit_points: product.exchange_points,
          total_points: totalPoints,
          total_value: `${(product.original_price * quantity).toFixed(2)}元`
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

  /**
   * 获取商品汇总信息
   */
  async _getProductSummary (space, category) {
    try {
      const whereClause = { status: 'active' }

      if (space !== 'both') {
        whereClause.space = [space, 'both']
      }

      if (category && category !== 'all') {
        whereClause.category = category
      }

      const [totalProducts, newProducts, hotProducts, avgDiscount, categories] = await Promise.all([
        Product.count({ where: whereClause }),
        Product.count({ where: { ...whereClause, is_new: true } }),
        Product.count({ where: { ...whereClause, is_hot: true } }),
        Product.findAll({
          where: { ...whereClause, discount: { [sequelize.Sequelize.Op.gt]: 0 } },
          attributes: [[sequelize.fn('AVG', sequelize.col('discount')), 'avg_discount']],
          raw: true
        }),
        Product.findAll({
          where: whereClause,
          attributes: ['category'],
          group: ['category'],
          raw: true
        })
      ])

      return {
        total_products: totalProducts,
        new_products: newProducts,
        hot_products: hotProducts,
        avg_discount: avgDiscount[0]?.avg_discount || 0,
        categories: categories.map(c => c.category)
      }
    } catch (error) {
      console.error('❌ 获取商品汇总信息失败:', error.message)
      return {
        total_products: 0,
        new_products: 0,
        hot_products: 0,
        avg_discount: 0,
        categories: []
      }
    }
  }

  /**
   * 更新用户兑换统计
   */
  async _updateUserExchangeStats (_userId, _transaction) {
    // 这里can implement user exchange statistics updates
    // 例如更新用户表中的total_exchanges字段
  }

  /**
   * 获取用户总兑换次数
   */
  async _getUserTotalExchanges (userId) {
    return await ExchangeRecord.count({
      where: { user_id: userId, status: 'completed' }
    })
  }

  /**
   * 获取用户今日兑换次数
   */
  async _getUserTodayExchanges (userId) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return await ExchangeRecord.count({
      where: {
        user_id: userId,
        status: 'completed',
        exchange_time: {
          [sequelize.Sequelize.Op.between]: [today, tomorrow]
        }
      }
    })
  }
}

module.exports = ExchangeService
