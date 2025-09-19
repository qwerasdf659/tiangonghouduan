/**
 * 统一决策引擎数据收集器
 * @description 收集用户、奖品池、活动等相关数据，为决策提供数据支撑
 * @version 4.0.0
 * @date 2025-09-10 16:49:01 北京时间
 */

const Logger = require('./Logger')
const CacheManager = require('./CacheManager')

class DataCollector {
  constructor () {
    this.logger = new Logger('DataCollector')
    this.cache = new CacheManager()
    this.models = require('../../../models')
  }

  /**
   * 收集用户完整画像数据
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 用户画像数据
   */
  async collectUserProfile (userId) {
    const cacheKey = `user_profile:${userId}`
    let userProfile = await this.cache.get(cacheKey)

    if (!userProfile) {
      try {
        this.logger.debug('收集用户画像数据', { userId })

        // 并行收集用户基础信息和相关数据
        const [user, pointsAccount, recentTransactions, lotteryHistory, inventory] =
          await Promise.all([
            this.models.User.findByPk(userId),
            this.models.UserPointsAccount.findOne({ where: { user_id: userId } }),
            this.models.PointsTransaction.findAll({
              where: { user_id: userId },
              order: [['created_at', 'DESC']],
              limit: 10
            }),
            this.models.LotteryRecord.findAll({
              where: { user_id: userId },
              order: [['created_at', 'DESC']],
              limit: 20,
              include: [
                {
                  model: this.models.LotteryCampaign,
                  as: 'campaign',
                  attributes: ['campaign_id', 'campaign_name', 'campaign_type']
                }
              ]
            }),
            this.models.UserInventory.findAll({
              where: { user_id: userId },
              attributes: ['id', 'name', 'description', 'type', 'value', 'status', 'source_type', 'acquired_at']
              // 🔧 修复：UserInventory自包含所有信息，不需要关联Product
            })
          ])

        if (!user) {
          throw new Error(`用户不存在: ${userId}`)
        }

        // ✅ V4简化：只计算用户等级，移除VIP状态
        const userLevel = this.calculateUserLevel(pointsAccount, recentTransactions)

        // 分析抽奖行为模式
        const lotteryBehavior = this.analyzeLotteryBehavior(lotteryHistory)

        userProfile = {
          userId: user.user_id,
          username: user.username,
          phone: user.phone,
          isAdmin: user.is_admin,
          registeredAt: user.created_at,
          lastActiveAt: user.updated_at,

          // 积分信息
          points: {
            balance: pointsAccount?.available_points || 0,
            totalEarned: pointsAccount?.total_earned_points || 0,
            totalSpent: pointsAccount?.total_spent_points || 0,
            level: userLevel
          },

          // ✅ V4简化：移除VIP状态，专注核心功能

          // 抽奖行为分析
          lotteryBehavior,

          // 库存信息
          inventory: {
            totalItems: inventory.length,
            categories: this.categorizeInventory(inventory),
            rarityDistribution: this.calculateRarityDistribution(inventory)
          },

          // 最近活动
          recentActivity: {
            transactions: recentTransactions.slice(0, 5),
            lastLottery: lotteryHistory[0] || null
          },

          // 数据收集时间
          collectedAt: new Date().toISOString()
        }

        // 缓存5分钟
        await this.cache.set(cacheKey, userProfile, 300)

        this.logger.debug('用户画像数据收集完成', {
          userId,
          pointsBalance: userProfile.points.balance,
          level: userProfile.points.level,
          isAdmin: userProfile.isAdmin
        })
      } catch (error) {
        this.logger.error('收集用户画像数据失败', {
          userId,
          error: error.message
        })
        throw error
      }
    }

    return userProfile
  }

  /**
   * 收集奖品池状态数据
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 奖品池状态数据
   */
  // 池状态收集方法已移除 - 不再使用多池系统
  async collectSimplifiedStatus (campaignId) {
    const cacheKey = `pool_status:${campaignId}`
    let poolStatus = await this.cache.get(cacheKey)

    if (!poolStatus) {
      try {
        this.logger.debug('收集奖品池状态', { campaignId })

        const [campaign, prizes, recentDraws] = await Promise.all([
          this.models.LotteryCampaign.findByPk(campaignId),
          this.models.LotteryPrize.findAll({
            where: { campaign_id: campaignId },
            include: [
              {
                model: this.models.Product,
                as: 'product',
                attributes: ['product_name', 'category', 'rarity', 'market_value']
              }
            ]
          }),
          this.models.LotteryRecord.findAll({
            where: {
              campaign_id: campaignId,
              is_winner: true // ✅ 修复：使用正确的业务标准字段
            },
            order: [['created_at', 'DESC']],
            limit: 50
          })
        ])

        if (!campaign) {
          throw new Error(`活动不存在: ${campaignId}`)
        }

        // 计算奖品池统计信息
        const prizeStats = this.calculatePrizeStats(prizes, recentDraws)
        const poolType = this.determinePoolType(campaign, prizeStats)
        const scarcityLevel = this.calculateScarcityLevel(prizeStats)

        poolStatus = {
          campaignId: campaign.campaign_id,
          campaignName: campaign.campaign_name,
          startTime: campaign.start_time,
          endTime: campaign.end_time,
          isActive: campaign.is_active,

          // 奖品池类型和配置
          poolType,
          totalPrizes: prizes.length,
          availablePrizes: prizeStats.available,
          distributedPrizes: prizeStats.distributed,

          // 稀缺性分析
          scarcity: {
            level: scarcityLevel,
            highValuePrizes: prizeStats.highValueCount,
            lowStockPrizes: prizeStats.lowStockCount
          },

          // 最近中奖趋势
          recentWinTrend: {
            last24Hours: recentDraws.filter(
              d => new Date() - new Date(d.created_at) < 24 * 60 * 60 * 1000
            ).length,
            last7Days: recentDraws.filter(
              d => new Date() - new Date(d.created_at) < 7 * 24 * 60 * 60 * 1000
            ).length,
            totalWins: recentDraws.length
          },

          // 奖品价值分布
          valueDistribution: this.calculateValueDistribution(prizes),

          // 收集时间
          collectedAt: new Date().toISOString()
        }

        // 缓存30秒（奖品池状态变化较快）
        await this.cache.set(cacheKey, poolStatus, 30)

        this.logger.debug('奖品池状态收集完成', {
          campaignId,
          poolType: poolStatus.poolType,
          available: poolStatus.availablePrizes,
          scarcityLevel: poolStatus.scarcity.level
        })
      } catch (error) {
        this.logger.error('收集奖品池状态失败', {
          campaignId,
          error: error.message
        })
        throw error
      }
    }

    return poolStatus
  }

  /**
   * 收集系统状态指标
   * @returns {Promise<Object>} 系统状态指标
   */
  async collectSystemStats () {
    const cacheKey = 'system_stats'
    let systemStats = await this.cache.get(cacheKey)

    if (!systemStats) {
      try {
        this.logger.debug('收集系统状态指标')

        const [activeUsers, todayLotteries, systemHealth, databaseStats] = await Promise.all([
          this.getActiveUsersCount(),
          this.getTodayLotteriesCount(),
          this.getSystemHealthMetrics(),
          this.getDatabaseStats()
        ])

        systemStats = {
          users: {
            total: activeUsers.total,
            activeToday: activeUsers.today,
            newToday: activeUsers.newToday
          },

          lotteries: {
            totalToday: todayLotteries.total,
            winToday: todayLotteries.wins,
            winRate:
              todayLotteries.total > 0
                ? ((todayLotteries.wins / todayLotteries.total) * 100).toFixed(2) + '%'
                : '0%'
          },

          system: {
            health: systemHealth.status,
            responseTime: systemHealth.avgResponseTime,
            errorRate: systemHealth.errorRate,
            uptime: systemHealth.uptime
          },

          database: databaseStats,

          collectedAt: new Date().toISOString()
        }

        // 缓存1分钟
        await this.cache.set(cacheKey, systemStats, 60)

        this.logger.debug('系统状态指标收集完成', {
          activeUsers: systemStats.users.activeToday,
          todayLotteries: systemStats.lotteries.totalToday,
          winRate: systemStats.lotteries.winRate
        })
      } catch (error) {
        this.logger.error('收集系统状态指标失败', {
          error: error.message
        })
        throw error
      }
    }

    return systemStats
  }

  /**
   * 计算用户等级
   * @param {Object} pointsAccount - 积分账户
   * @param {Array} transactions - 交易记录
   * @returns {Object} 用户等级信息
   */
  calculateUserLevel (pointsAccount, _transactions) {
    // ✅ V4简化：统一用户等级，专注抽奖核心功能
    const totalEarned = pointsAccount?.total_earned_points || 0
    return {
      level: 'standard',
      name: '标准用户',
      totalEarned
    }
  }

  // ✅ V4简化：删除VIP计算逻辑，专注核心抽奖功能

  /**
   * 分析抽奖行为模式
   * @param {Array} lotteryHistory - 抽奖历史
   * @returns {Object} 行为分析结果
   */
  analyzeLotteryBehavior (lotteryHistory) {
    if (!lotteryHistory || lotteryHistory.length === 0) {
      return {
        totalAttempts: 0,
        winCount: 0,
        winRate: 0,
        consecutiveLosses: 0,
        avgTimeInterval: 0,
        favoritePoolType: null,
        lastWinDate: null,
        daysSinceLastWin: null
      }
    }

    // ✅ 修复：使用正确的业务标准字段 is_winner 而不是 result
    const wins = lotteryHistory.filter(h => h.is_winner === true)
    const losses = lotteryHistory.filter(h => h.is_winner === false)

    // 计算连续未中奖次数
    let consecutiveLosses = 0
    for (const record of lotteryHistory) {
      if (record.is_winner === false) {
        consecutiveLosses++
      } else {
        break
      }
    }

    // 计算平均时间间隔
    let avgTimeInterval = 0
    if (lotteryHistory.length > 1) {
      let totalInterval = 0
      for (let i = 1; i < lotteryHistory.length; i++) {
        const interval =
          new Date(lotteryHistory[i - 1].created_at) - new Date(lotteryHistory[i].created_at)
        totalInterval += Math.abs(interval)
      }
      avgTimeInterval = totalInterval / (lotteryHistory.length - 1)
    }

    // 分析最喜欢的奖品池类型
    const poolTypes = {}
    lotteryHistory.forEach(h => {
      if (h.campaign && h.campaign.campaign_type) {
        const poolType = h.campaign.campaign_type
        poolTypes[poolType] = (poolTypes[poolType] || 0) + 1
      }
    })
    const favoritePoolType =
      Object.keys(poolTypes).sort((a, b) => poolTypes[b] - poolTypes[a])[0] || null

    // 计算距离上次中奖的天数
    const lastWin = wins[0]
    const daysSinceLastWin = lastWin
      ? Math.floor((new Date() - new Date(lastWin.created_at)) / (24 * 60 * 60 * 1000))
      : null

    return {
      totalAttempts: lotteryHistory.length,
      winCount: wins.length,
      loseCount: losses.length,
      winRate: ((wins.length / lotteryHistory.length) * 100).toFixed(2) + '%',
      consecutiveLosses,
      avgTimeInterval: Math.round(avgTimeInterval / 1000 / 60), // 转换为分钟
      favoritePoolType,
      lastWinDate: lastWin?.created_at || null,
      daysSinceLastWin
    }
  }

  /**
   * 获取活跃用户数量
   */
  async getActiveUsersCount () {
    const today = new Date()
    const todayStart = new Date(today.setHours(0, 0, 0, 0))

    const [total, activeToday, newToday] = await Promise.all([
      this.models.User.count(),
      this.models.LoginLog.count({
        where: {
          created_at: { [this.models.Sequelize.Op.gte]: todayStart } // ✅ 修复：使用正确的字段名created_at
        },
        distinct: true,
        col: 'user_id'
      }),
      this.models.User.count({
        where: {
          created_at: { [this.models.Sequelize.Op.gte]: todayStart }
        }
      })
    ])

    return { total, today: activeToday, newToday }
  }

  /**
   * 获取今日抽奖统计
   */
  async getTodayLotteriesCount () {
    const today = new Date()
    const todayStart = new Date(today.setHours(0, 0, 0, 0))

    const [total, wins] = await Promise.all([
      this.models.LotteryRecord.count({
        where: {
          created_at: { [this.models.Sequelize.Op.gte]: todayStart }
        }
      }),
      this.models.LotteryRecord.count({
        where: {
          created_at: { [this.models.Sequelize.Op.gte]: todayStart },
          is_winner: true // ✅ 修复：使用正确的业务标准字段
        }
      })
    ])

    return { total, wins }
  }

  /**
   * 获取系统健康指标（真实数据）
   * 🔴 清理模拟数据，使用真实系统指标
   */
  async getSystemHealthMetrics () {
    try {
      const { sequelize } = require('../../../config/database')
      const os = require('os')

      // 检查数据库连接状态
      const dbHealthy = await sequelize
        .authenticate()
        .then(() => true)
        .catch(() => false)

      // 系统负载信息
      const systemLoad = {
        cpu: os.loadavg()[0], // 1分钟平均负载
        memory: Math.round((1 - os.freemem() / os.totalmem()) * 100),
        uptime: process.uptime()
      }

      return {
        status: dbHealthy ? 'healthy' : 'degraded',
        database: dbHealthy,
        systemLoad,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('获取系统健康指标失败:', error.message)
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 获取数据库统计信息（真实数据）
   * 🔴 清理模拟数据，查询真实数据库统计
   */
  async getDatabaseStats () {
    try {
      const { sequelize } = require('../../../config/database')

      // 查询数据库连接池状态
      const poolStatus = sequelize.connectionManager.pool

      // 查询进程列表（简化版，避免权限问题）
      const processCount = await sequelize
        .query('SELECT COUNT(*) as count FROM information_schema.processlist', {
          type: sequelize.QueryTypes.SELECT
        })
        .catch(() => [{ count: 0 }])

      return {
        connectionCount: poolStatus?.size || 0,
        maxConnections: poolStatus?.options?.max || 0,
        processCount: processCount[0]?.count || 0,
        status: 'connected',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('获取数据库统计失败:', error.message)
      return {
        connectionCount: 0,
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }

  // 其他辅助方法...
  categorizeInventory (inventory) {
    const categories = {}
    inventory.forEach(item => {
      // 🔧 修复：使用UserInventory的type字段，不依赖Product关联
      const category = item.type || 'unknown'
      categories[category] = (categories[category] || 0) + 1 // 计数而非数量
    })
    return categories
  }

  calculateRarityDistribution (inventory) {
    const rarities = {}
    inventory.forEach(item => {
      // 🔧 修复：基于物品价值计算稀有度，不依赖Product关联
      const rarity = this.calculateItemRarity(item.value || 0)
      rarities[rarity] = (rarities[rarity] || 0) + 1 // 计数而非数量
    })
    return rarities
  }

  /**
   * 🔧 辅助方法：基于物品价值计算稀有度
   * @param {number} value - 物品价值
   * @returns {string} 稀有度等级
   */
  calculateItemRarity (value) {
    if (value >= 1000) return 'legendary'
    if (value >= 500) return 'epic'
    if (value >= 100) return 'rare'
    if (value >= 50) return 'uncommon'
    return 'common'
  }

  calculatePrizeStats (prizes, recentDraws) {
    const available = prizes.filter(p => p.remaining_quantity > 0).length
    const distributed = recentDraws.length
    const highValueCount = prizes.filter(p => p.product && p.product.market_value > 1000).length
    const lowStockCount = prizes.filter(
      p => p.remaining_quantity > 0 && p.remaining_quantity <= 10
    ).length

    return {
      available,
      distributed,
      highValueCount,
      lowStockCount
    }
  }

  determinePoolType (campaign, _prizeStats) {
    if (campaign.campaign_type) {
      return campaign.campaign_type
    }

    // ✅ V4简化：统一使用基础奖品池类型
    return 'basic'
  }

  calculateScarcityLevel (prizeStats) {
    const scarcityRatio = prizeStats.lowStockCount / Math.max(prizeStats.available, 1)

    if (scarcityRatio >= 0.5) {
      return 'high'
    } else if (scarcityRatio >= 0.2) {
      return 'medium'
    } else {
      return 'low'
    }
  }

  calculateValueDistribution (prizes) {
    const distribution = { low: 0, medium: 0, high: 0 }

    prizes.forEach(prize => {
      const value = prize.product?.market_value || 0
      if (value >= 1000) {
        distribution.high++
      } else if (value >= 100) {
        distribution.medium++
      } else {
        distribution.low++
      }
    })

    return distribution
  }

  /**
   * 🆕 收集活动奖品池信息
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 奖品池信息
   */
  async collectCampaignPrizePool (campaignId) {
    try {
      // 查询活动信息和奖品
      const [campaign, prizes] = await Promise.all([
        this.models.LotteryCampaign.findByPk(campaignId),
        this.models.LotteryPrize.findAll({
          where: { campaign_id: campaignId },
          attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value', 'stock', 'probability_weight']
        })
      ])

      if (!campaign) {
        throw new Error(`活动不存在: ${campaignId}`)
      }

      return {
        campaignId: campaign.campaign_id,
        campaignName: campaign.campaign_name,
        totalPrizes: prizes.length,
        totalStock: prizes.reduce((sum, prize) => sum + prize.stock, 0),
        totalValue: prizes.reduce((sum, prize) => sum + (prize.prize_value || 0), 0),
        prizeTypes: [...new Set(prizes.map(p => p.prize_type))],
        lastUpdated: new Date()
      }
    } catch (error) {
      this.logger.error('收集奖品池信息失败', { campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 🆕 收集奖品详细信息
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Array>} 奖品详细信息数组
   */
  async collectPrizeDetails (campaignId) {
    try {
      const prizes = await this.models.LotteryPrize.findAll({
        where: { campaign_id: campaignId },
        attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value', 'stock', 'probability_weight', 'image_url'],
        order: [['probability_weight', 'DESC']]
      })

      return prizes.map(prize => ({
        prizeId: prize.prize_id,
        name: prize.prize_name,
        type: prize.prize_type,
        value: prize.prize_value,
        stock: prize.stock,
        probability: prize.probability_weight,
        imageUrl: prize.image_url,
        rarity: this.calculatePrizeRarity(prize.probability_weight)
      }))
    } catch (error) {
      this.logger.error('收集奖品详细信息失败', { campaignId, error: error.message })
      return []
    }
  }

  /**
   * 🆕 收集库存状态
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 库存状态信息
   */
  async collectStockStatus (campaignId) {
    try {
      const prizes = await this.models.LotteryPrize.findAll({
        where: { campaign_id: campaignId },
        attributes: ['prize_id', 'prize_name', 'stock', 'prize_type']
      })

      const totalStock = prizes.reduce((sum, prize) => sum + prize.stock, 0)
      const availableStock = prizes.filter(p => p.stock > 0).reduce((sum, prize) => sum + prize.stock, 0)
      const stockByType = prizes.reduce((acc, prize) => {
        acc[prize.prize_type] = (acc[prize.prize_type] || 0) + prize.stock
        return acc
      }, {})

      return {
        campaignId,
        totalStock,
        availableStock,
        outOfStockCount: prizes.filter(p => p.stock === 0).length,
        stockByType,
        stockRatio: totalStock > 0 ? (availableStock / totalStock) : 0,
        lastUpdated: new Date()
      }
    } catch (error) {
      this.logger.error('收集库存状态失败', { campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 🆕 收集活动统计信息
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 活动统计信息
   */
  async collectCampaignStatistics (campaignId) {
    try {
      // 并行查询多种统计数据
      const [lotteryRecords, campaign, prizeDistribution] = await Promise.all([
        this.models.LotteryRecord.findAll({
          where: { campaign_id: campaignId },
          attributes: ['user_id', 'is_winner', 'created_at']
        }),
        this.models.LotteryCampaign.findByPk(campaignId),
        this.models.PrizeDistribution.findAll({
          where: { campaign_id: campaignId },
          attributes: ['prize_id', 'distributed_count']
        })
      ])

      if (!campaign) {
        return {
          campaignId,
          totalParticipants: 0,
          totalDraws: 0,
          winnerCount: 0,
          winRate: 0,
          lastUpdated: new Date()
        }
      }

      const uniqueParticipants = new Set(lotteryRecords.map(r => r.user_id)).size
      const totalDraws = lotteryRecords.length
      const winnerCount = lotteryRecords.filter(r => r.is_winner).length
      const winRate = totalDraws > 0 ? (winnerCount / totalDraws) : 0

      return {
        campaignId,
        campaignName: campaign.campaign_name,
        totalParticipants: uniqueParticipants,
        totalDraws,
        winnerCount,
        winRate: Math.round(winRate * 10000) / 100, // 保留2位小数
        totalDistributed: prizeDistribution.reduce((sum, p) => sum + p.distributed_count, 0),
        lastUpdated: new Date()
      }
    } catch (error) {
      this.logger.error('收集活动统计信息失败', { campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 🆕 分析时间段分布
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 时间分布分析
   */
  async analyzeTimeDistribution (campaignId) {
    try {
      const lotteryRecords = await this.models.LotteryRecord.findAll({
        where: { campaign_id: campaignId },
        attributes: ['created_at'],
        order: [['created_at', 'ASC']]
      })

      const hourlyDistribution = new Array(24).fill(0)
      const dailyDistribution = {}

      lotteryRecords.forEach(record => {
        const date = new Date(record.created_at)
        const hour = date.getHours()
        const day = date.toDateString()

        hourlyDistribution[hour]++
        dailyDistribution[day] = (dailyDistribution[day] || 0) + 1
      })

      // 找出高峰时段
      const maxHourlyCount = Math.max(...hourlyDistribution)
      const peakHours = hourlyDistribution
        .map((count, hour) => ({ hour, count }))
        .filter(h => h.count === maxHourlyCount)
        .map(h => h.hour)

      return {
        campaignId,
        hourlyDistribution,
        dailyDistribution,
        peakHours,
        totalRecords: lotteryRecords.length,
        analysisTime: new Date()
      }
    } catch (error) {
      this.logger.error('分析时间段分布失败', { campaignId, error: error.message })
      throw error
    }
  }

  /**
   * 🆕 验证数据完整性
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @returns {Promise<boolean>} 数据是否完整
   */
  async validateDataIntegrity (userId, campaignId) {
    try {
      // 并行检查各种数据的完整性
      const [user, campaign, pointsAccount] = await Promise.all([
        this.models.User.findByPk(userId),
        this.models.LotteryCampaign.findByPk(campaignId),
        this.models.UserPointsAccount.findOne({ where: { user_id: userId } })
      ])

      const issues = []

      if (!user) issues.push('用户不存在')
      if (!campaign) issues.push('活动不存在')
      if (!pointsAccount) issues.push('用户积分账户不存在')

      // 记录验证结果
      if (issues.length > 0) {
        this.logger.warn('数据完整性验证失败', { userId, campaignId, issues })
        return false
      }

      return true
    } catch (error) {
      this.logger.error('数据完整性验证异常', { userId, campaignId, error: error.message })
      return false
    }
  }

  /**
   * 🔧 辅助方法：计算奖品稀有度
   * @param {number} probabilityWeight - 概率权重
   * @returns {string} 稀有度等级
   */
  calculatePrizeRarity (probabilityWeight) {
    if (probabilityWeight <= 10) return 'legendary'
    if (probabilityWeight <= 50) return 'epic'
    if (probabilityWeight <= 200) return 'rare'
    if (probabilityWeight <= 500) return 'uncommon'
    return 'common'
  }
}

module.exports = DataCollector
