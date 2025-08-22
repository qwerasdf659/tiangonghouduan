// services/MultiPoolService.js
const { Op } = require('sequelize')
const EventBusService = require('./EventBusService')
const LotteryService = require('./LotteryService')
const PointsSystemService = require('./PointsSystemService')
const TransactionService = require('./TransactionService')

/**
 * 多池系统服务
 * 实现基础池、高级池、VIP池、新手池的完整管理
 * 基于现有抽奖系统扩展多池概念
 */
class MultiPoolService {
  constructor () {
    this.models = require('../models')
    this.eventBus = EventBusService
    this.lotteryService = LotteryService
    this.points = PointsSystemService
    this.transaction = TransactionService

    // 池子类型配置
    this.poolTypeConfigs = {
      // 新手池 - 用户等级1-5，低成本高中奖率
      newbie: {
        name: '新手池',
        description: '专为新手设计的入门池，中奖率高，奖品适中',
        access_conditions: {
          min_level: 1,
          max_level: 5,
          max_total_draws: 50 // 总抽奖次数限制
        },
        cost_multiplier: 0.5, // 成本减半
        probability_boost: 1.8, // 中奖率提升80%
        available_hours: '00:00-23:59', // 全天开放
        daily_limit: 10, // 每日限制次数
        pool_category: 'beginner_friendly'
      },

      // 基础池 - 普通用户池，平衡的成本和收益
      basic: {
        name: '基础池',
        description: '标准抽奖池，成本适中，奖品丰富',
        access_conditions: {
          min_level: 1,
          max_level: null, // 无等级上限
          min_points: 100 // 最低积分要求
        },
        cost_multiplier: 1.0, // 标准成本
        probability_boost: 1.0, // 标准中奖率
        available_hours: '00:00-23:59',
        daily_limit: null, // 无次数限制
        pool_category: 'standard'
      },

      // 高级池 - 高等级用户池，高成本高回报
      advanced: {
        name: '高级池',
        description: '高级用户专享池，奖品价值更高',
        access_conditions: {
          min_level: 10,
          max_level: null,
          min_points: 1000,
          min_total_spent: 5000 // 累计消费积分要求
        },
        cost_multiplier: 2.0, // 成本翻倍
        probability_boost: 1.2, // 中奖率提升20%
        available_hours: '00:00-23:59',
        daily_limit: 20,
        pool_category: 'premium'
      },

      // VIP池 - VIP用户专享，最高级别的奖品和体验
      vip: {
        name: 'VIP池',
        description: 'VIP用户专享池，顶级奖品和极致体验',
        access_conditions: {
          min_level: 20,
          max_level: null,
          min_points: 5000,
          min_total_spent: 20000,
          vip_level: 3 // 需要VIP等级
        },
        cost_multiplier: 3.0, // 成本3倍
        probability_boost: 1.5, // 中奖率提升50%
        available_hours: '06:00-22:00', // VIP专享时段
        daily_limit: 5, // 限量抽奖
        pool_category: 'luxury'
      }
    }
  }

  /**
   * 获取用户可访问的池子列表
   * @param {number} userId - 用户ID
   */
  async getAvailablePools (userId) {
    try {
      // 获取用户信息和统计
      const [user, userStats] = await Promise.all([
        this.models.User.findByPk(userId),
        this.getUserDrawingStats(userId)
      ])

      if (!user) {
        throw new Error('用户不存在')
      }

      const availablePools = []
      const currentHour = new Date().getHours().toString().padStart(2, '0') + ':00'

      // 检查每个池子的访问权限
      for (const [poolType, config] of Object.entries(this.poolTypeConfigs)) {
        const accessCheck = await this.checkPoolAccess(
          user,
          userStats,
          config,
          poolType
        )

        if (accessCheck.hasAccess) {
          // 获取池子中的活动
          const campaigns = await this.getPoolCampaigns(poolType)

          // 计算今日使用次数
          const todayUsage = await this.getTodayUsage(userId, poolType)

          availablePools.push({
            poolType,
            config: {
              name: config.name,
              description: config.description,
              costMultiplier: config.cost_multiplier,
              probabilityBoost: config.probability_boost,
              dailyLimit: config.daily_limit,
              poolCategory: config.pool_category
            },
            access: {
              hasAccess: true,
              remainingUses: config.daily_limit ? config.daily_limit - todayUsage : null,
              accessLevel: accessCheck.accessLevel
            },
            campaigns: campaigns.map(campaign => ({
              id: campaign.id,
              name: campaign.campaign_name,
              image: campaign.campaign_image,
              originalCost: campaign.cost_points,
              actualCost: Math.floor(campaign.cost_points * config.cost_multiplier),
              costSavings: campaign.cost_points - Math.floor(campaign.cost_points * config.cost_multiplier),
              enhancedProbability: config.probability_boost > 1.0,
              probabilityBoost: config.probability_boost,
              status: campaign.status,
              endTime: campaign.end_time
            })),
            isOpen: this.isPoolOpen(config.available_hours, currentHour),
            nextOpenTime: this.getNextOpenTime(config.available_hours, currentHour)
          })
        } else {
          // 无权限访问，显示解锁条件
          availablePools.push({
            poolType,
            config: {
              name: config.name,
              description: config.description,
              poolCategory: config.pool_category
            },
            access: {
              hasAccess: false,
              requirements: accessCheck.requirements,
              progress: accessCheck.progress
            },
            campaigns: [],
            isOpen: false,
            unlockHint: this.generateUnlockHint(accessCheck.requirements, accessCheck.progress)
          })
        }
      }

      return {
        success: true,
        availablePools,
        userInfo: {
          level: user.user_level,
          totalPoints: userStats.totalPoints,
          totalSpent: userStats.totalSpent,
          totalDraws: userStats.totalDraws,
          vipLevel: user.vip_level || 0
        }
      }
    } catch (error) {
      console.error('获取可用池子失败:', error)
      throw error
    }
  }

  /**
   * 在指定池子中进行抽奖
   * @param {number} userId - 用户ID
   * @param {string} poolType - 池子类型
   * @param {number} campaignId - 活动ID
   * @param {object} options - 抽奖选项
   */
  async drawFromPool (userId, poolType, campaignId, _options = {}) {
    try {
      const poolConfig = this.poolTypeConfigs[poolType]
      if (!poolConfig) {
        throw new Error(`不支持的池子类型: ${poolType}`)
      }

      return await this.transaction.executeTransaction(async (transaction) => {
        // 验证用户访问权限
        const [user, userStats] = await Promise.all([
          this.models.User.findByPk(userId, { transaction }),
          this.getUserDrawingStats(userId, transaction)
        ])

        const accessCheck = await this.checkPoolAccess(user, userStats, poolConfig, poolType)
        if (!accessCheck.hasAccess) {
          throw new Error(`无权限访问${poolConfig.name}：${accessCheck.requirements.join('，')}`)
        }

        // 检查今日使用次数限制
        if (poolConfig.daily_limit) {
          const todayUsage = await this.getTodayUsage(userId, poolType, transaction)
          if (todayUsage >= poolConfig.daily_limit) {
            throw new Error(`今日${poolConfig.name}使用次数已达上限 (${poolConfig.daily_limit}次)`)
          }
        }

        // 检查池子开放时间
        const currentHour = new Date().getHours().toString().padStart(2, '0') + ':00'
        if (!this.isPoolOpen(poolConfig.available_hours, currentHour)) {
          throw new Error(`${poolConfig.name}当前时段未开放`)
        }

        // 获取活动信息
        const campaign = await this.models.LotteryCampaign.findByPk(campaignId, { transaction })
        if (!campaign || campaign.status !== 'active') {
          throw new Error('抽奖活动不存在或未激活')
        }

        // 验证活动是否属于该池子
        const poolCampaigns = await this.getPoolCampaigns(poolType, transaction)
        const campaignInPool = poolCampaigns.find(c => c.id === campaignId)
        if (!campaignInPool) {
          throw new Error(`该活动不属于${poolConfig.name}`)
        }

        // 计算实际费用
        const originalCost = campaign.cost_points || 100
        const actualCost = Math.floor(originalCost * poolConfig.cost_multiplier)

        // 检查用户积分
        const userPoints = await this.points.getUserPoints(userId, transaction)
        if (userPoints.total_points < actualCost) {
          throw new Error(`积分不足，需要${actualCost}积分，当前${userPoints.total_points}积分`)
        }

        // 扣除积分
        await this.points.deductPoints(userId, actualCost, {
          type: 'pool_lottery_draw',
          description: `${poolConfig.name}抽奖`,
          related_id: campaignId,
          pool_type: poolType
        }, transaction)

        // 执行增强抽奖（根据池子配置调整概率）
        const enhancedResult = await this.executeEnhancedDraw(
          userId,
          campaignId,
          poolConfig,
          poolType,
          transaction
        )

        // 记录池子抽奖历史
        await this.recordPoolDrawHistory(
          userId,
          poolType,
          campaignId,
          actualCost,
          originalCost,
          enhancedResult,
          transaction
        )

        // 更新今日使用次数
        await this.updateTodayUsage(userId, poolType, transaction)

        // 发送池子抽奖事件
        await this.eventBus.emit('pool_draw_completed', {
          userId,
          poolType,
          campaignId,
          actualCost,
          originalCost,
          costSavings: originalCost - actualCost,
          probabilityBoost: poolConfig.probability_boost,
          result: enhancedResult,
          completedAt: new Date()
        })

        return {
          success: true,
          poolType,
          poolName: poolConfig.name,
          result: enhancedResult,
          cost: {
            original: originalCost,
            actual: actualCost,
            savings: originalCost - actualCost,
            discount: poolConfig.cost_multiplier < 1.0
          },
          enhancement: {
            probabilityBoost: poolConfig.probability_boost,
            enhanced: poolConfig.probability_boost > 1.0
          },
          poolStats: {
            remainingUses: poolConfig.daily_limit ? poolConfig.daily_limit - await this.getTodayUsage(userId, poolType, transaction) - 1 : null,
            totalUsesToday: await this.getTodayUsage(userId, poolType, transaction) + 1
          }
        }
      })
    } catch (error) {
      console.error('池子抽奖失败:', error)
      throw error
    }
  }

  /**
   * 执行增强抽奖（根据池子配置调整概率）
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {object} poolConfig - 池子配置
   * @param {string} poolType - 池子类型
   * @param {object} transaction - 事务对象
   */
  async executeEnhancedDraw (userId, campaignId, poolConfig, poolType, transaction) {
    try {
      // 如果有概率增强，修改临时概率
      if (poolConfig.probability_boost > 1.0) {
        // 获取活动的奖品配置
        const prizes = await this.models.LotteryPrize.findAll({
          where: {
            campaign_id: campaignId,
            status: 'active'
          },
          transaction
        })

        // 计算增强后的概率
        const enhancedPrizes = prizes.map(prize => ({
          ...prize.dataValues,
          probability: Math.min(100, prize.probability * poolConfig.probability_boost)
        }))

        // 创建临时的增强抽奖逻辑
        const enhancedResult = await this.executeEnhancedLotteryLogic(
          userId,
          campaignId,
          enhancedPrizes,
          poolType,
          transaction
        )

        return enhancedResult
      } else {
        // 普通抽奖
        return await this.lotteryService.executeLotteryDraw(userId, campaignId, transaction)
      }
    } catch (error) {
      console.error('增强抽奖执行失败:', error)
      throw error
    }
  }

  /**
   * 执行增强抽奖逻辑
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {Array} enhancedPrizes - 增强概率的奖品列表
   * @param {string} poolType - 池子类型
   * @param {object} transaction - 事务对象
   */
  async executeEnhancedLotteryLogic (userId, campaignId, enhancedPrizes, poolType, transaction) {
    try {
      // 计算是否中奖
      const randomValue = Math.random() * 100

      let won = false
      let selectedPrize = null
      let accumulatedProbability = 0

      for (const prize of enhancedPrizes) {
        accumulatedProbability += prize.probability
        if (randomValue <= accumulatedProbability) {
          won = true
          selectedPrize = prize
          break
        }
      }

      // 创建抽奖记录
      const drawRecord = await this.models.LotteryDraw.create({
        user_id: userId,
        campaign_id: campaignId,
        prize_id: selectedPrize?.id || null,
        won,
        points_cost: 0, // 费用已在池子服务中扣除
        draw_type: 'pool_enhanced',
        draw_config: {
          pool_type: poolType,
          probability_boost: enhancedPrizes.length > 0 ? enhancedPrizes[0].probability / this.models.LotteryPrize.findByPk(enhancedPrizes[0].id).probability : 1.0,
          enhanced: true
        },
        created_at: new Date()
      }, { transaction })

      // 如果中奖，发放奖品
      if (won && selectedPrize) {
        await this.models.UserInventory.create({
          user_id: userId,
          item_type: selectedPrize.prize_type,
          item_id: selectedPrize.prize_id,
          quantity: selectedPrize.quantity,
          source: 'pool_lottery',
          source_id: drawRecord.id,
          item_data: {
            campaign_id: campaignId,
            prize_name: selectedPrize.prize_name,
            pool_type: poolType,
            enhanced: true,
            won_at: new Date()
          }
        }, { transaction })
      }

      return {
        id: drawRecord.id,
        won,
        prize: selectedPrize,
        enhanced: true,
        poolType,
        probabilityBoost: enhancedPrizes.length > 0 ? enhancedPrizes[0].probability / 100 : 0
      }
    } catch (error) {
      console.error('增强抽奖逻辑执行失败:', error)
      throw error
    }
  }

  /**
   * 检查用户对池子的访问权限
   * @param {object} user - 用户对象
   * @param {object} userStats - 用户统计数据
   * @param {object} poolConfig - 池子配置
   * @param {string} poolType - 池子类型
   */
  async checkPoolAccess (user, userStats, poolConfig, poolType) {
    const requirements = []
    const progress = {}
    let hasAccess = true
    let accessLevel = 'full'

    const conditions = poolConfig.access_conditions

    // 检查等级要求
    if (conditions.min_level && user.user_level < conditions.min_level) {
      hasAccess = false
      requirements.push(`需要等级${conditions.min_level}级`)
      progress.level = { current: user.user_level, required: conditions.min_level }
    }

    if (conditions.max_level && user.user_level > conditions.max_level) {
      hasAccess = false
      requirements.push(`等级不能超过${conditions.max_level}级`)
      progress.level = { current: user.user_level, max: conditions.max_level }
    }

    // 检查积分要求
    if (conditions.min_points && userStats.totalPoints < conditions.min_points) {
      hasAccess = false
      requirements.push(`需要${conditions.min_points}积分`)
      progress.points = { current: userStats.totalPoints, required: conditions.min_points }
    }

    // 检查累计消费要求
    if (conditions.min_total_spent && userStats.totalSpent < conditions.min_total_spent) {
      hasAccess = false
      requirements.push(`需要累计消费${conditions.min_total_spent}积分`)
      progress.totalSpent = { current: userStats.totalSpent, required: conditions.min_total_spent }
    }

    // 检查总抽奖次数限制
    if (conditions.max_total_draws && userStats.totalDraws >= conditions.max_total_draws) {
      hasAccess = false
      requirements.push(`总抽奖次数不能超过${conditions.max_total_draws}次`)
      progress.totalDraws = { current: userStats.totalDraws, max: conditions.max_total_draws }
    }

    // 检查VIP等级要求
    if (conditions.vip_level && (user.vip_level || 0) < conditions.vip_level) {
      hasAccess = false
      requirements.push(`需要VIP${conditions.vip_level}级`)
      progress.vipLevel = { current: user.vip_level || 0, required: conditions.vip_level }
    }

    // 设置访问等级
    if (hasAccess) {
      if (poolType === 'vip' || poolType === 'advanced') {
        accessLevel = 'premium'
      } else if (poolType === 'newbie') {
        accessLevel = 'beginner'
      } else {
        accessLevel = 'standard'
      }
    }

    return {
      hasAccess,
      accessLevel,
      requirements,
      progress
    }
  }

  /**
   * 获取池子中的活动列表
   * @param {string} poolType - 池子类型
   * @param {object} transaction - 事务对象
   */
  async getPoolCampaigns (poolType, transaction = null) {
    try {
      const poolConfig = this.poolTypeConfigs[poolType]
      const poolCategory = poolConfig.pool_category

      // 根据池子类别筛选活动
      const whereClause = {
        status: 'active',
        end_time: { [Op.gt]: new Date() }
      }

      // 为不同池子分配不同类别的活动
      switch (poolCategory) {
      case 'beginner_friendly':
        whereClause.campaign_type = { [Op.in]: ['basic', 'beginner'] }
        whereClause.cost_points = { [Op.lte]: 200 } // 低成本活动
        break
      case 'standard':
        whereClause.campaign_type = { [Op.notIn]: ['vip_exclusive', 'premium'] }
        break
      case 'premium':
        whereClause.campaign_type = { [Op.in]: ['premium', 'advanced'] }
        whereClause.cost_points = { [Op.gte]: 500 } // 高成本活动
        break
      case 'luxury':
        whereClause.campaign_type = 'vip_exclusive'
        whereClause.cost_points = { [Op.gte]: 1000 } // VIP专属活动
        break
      }

      const campaigns = await this.models.LotteryCampaign.findAll({
        where: whereClause,
        include: [{
          model: this.models.LotteryPrize,
          as: 'prizes',
          where: { status: 'active' },
          required: false
        }],
        order: [['created_at', 'DESC']],
        transaction
      })

      return campaigns
    } catch (error) {
      console.error('获取池子活动失败:', error)
      return []
    }
  }

  /**
   * 获取用户抽奖统计数据
   * @param {number} userId - 用户ID
   * @param {object} transaction - 事务对象
   */
  async getUserDrawingStats (userId, transaction = null) {
    try {
      const [pointsStats, drawStats] = await Promise.all([
        this.points.getUserPoints(userId, transaction),
        this.models.LotteryDraw.findAll({
          where: { user_id: userId },
          attributes: [
            [this.models.sequelize.fn('COUNT', 'id'), 'total_draws'],
            [this.models.sequelize.fn('SUM', 'points_cost'), 'total_spent']
          ],
          transaction
        })
      ])

      const drawResult = drawStats[0]?.dataValues || {}

      return {
        totalPoints: pointsStats.total_points || 0,
        totalDraws: parseInt(drawResult.total_draws || 0),
        totalSpent: parseInt(drawResult.total_spent || 0)
      }
    } catch (error) {
      console.error('获取用户统计失败:', error)
      return {
        totalPoints: 0,
        totalDraws: 0,
        totalSpent: 0
      }
    }
  }

  /**
   * 获取今日池子使用次数
   * @param {number} userId - 用户ID
   * @param {string} poolType - 池子类型
   * @param {object} transaction - 事务对象
   */
  async getTodayUsage (userId, poolType, _transaction = null) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const redis = require('redis').createClient()
      await redis.connect()

      const usageKey = `pool_usage:${userId}:${poolType}:${today}`
      const usage = parseInt(await redis.get(usageKey) || '0')

      await redis.disconnect()
      return usage
    } catch (error) {
      console.error('获取今日使用次数失败:', error)
      return 0
    }
  }

  /**
   * 更新今日池子使用次数
   * @param {number} userId - 用户ID
   * @param {string} poolType - 池子类型
   * @param {object} transaction - 事务对象
   */
  async updateTodayUsage (userId, poolType, _transaction = null) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const redis = require('redis').createClient()
      await redis.connect()

      const usageKey = `pool_usage:${userId}:${poolType}:${today}`
      await redis.multi()
        .incr(usageKey)
        .expire(usageKey, 24 * 60 * 60) // 24小时过期
        .exec()

      await redis.disconnect()
    } catch (error) {
      console.error('更新今日使用次数失败:', error)
    }
  }

  /**
   * 记录池子抽奖历史
   * @param {number} userId - 用户ID
   * @param {string} poolType - 池子类型
   * @param {number} campaignId - 活动ID
   * @param {number} actualCost - 实际费用
   * @param {number} originalCost - 原始费用
   * @param {object} result - 抽奖结果
   * @param {object} transaction - 事务对象
   */
  async recordPoolDrawHistory (userId, poolType, campaignId, actualCost, originalCost, result, transaction) {
    try {
      await this.models.PoolDrawHistory.create({
        user_id: userId,
        pool_type: poolType,
        campaign_id: campaignId,
        draw_id: result.id,
        actual_cost: actualCost,
        original_cost: originalCost,
        cost_savings: originalCost - actualCost,
        won: result.won,
        prize_id: result.prize?.id || null,
        enhanced: result.enhanced || false,
        probability_boost: result.probabilityBoost || 1.0,
        created_at: new Date()
      }, { transaction })
    } catch (error) {
      console.error('记录池子抽奖历史失败:', error)
    }
  }

  /**
   * 检查池子是否在开放时间内
   * @param {string} availableHours - 开放时间范围
   * @param {string} currentHour - 当前时间
   */
  isPoolOpen (availableHours, currentHour) {
    const [startTime, endTime] = availableHours.split('-')
    const currentHourNum = parseInt(currentHour.split(':')[0])
    const startHourNum = parseInt(startTime.split(':')[0])
    const endHourNum = parseInt(endTime.split(':')[0])

    return currentHourNum >= startHourNum && currentHourNum <= endHourNum
  }

  /**
   * 获取下次开放时间
   * @param {string} availableHours - 开放时间范围
   * @param {string} currentHour - 当前时间
   */
  getNextOpenTime (availableHours, currentHour) {
    const [startTime] = availableHours.split('-')
    const currentHourNum = parseInt(currentHour.split(':')[0])
    const startHourNum = parseInt(startTime.split(':')[0])

    if (currentHourNum < startHourNum) {
      return startTime
    } else {
      // 明天的开放时间
      return `明天 ${startTime}`
    }
  }

  /**
   * 生成解锁提示
   * @param {Array} requirements - 要求列表
   * @param {object} progress - 进度信息
   */
  generateUnlockHint (requirements, progress) {
    if (requirements.length === 0) return '已满足所有条件'

    const hints = []

    if (progress.level && progress.level.required) {
      const remaining = progress.level.required - progress.level.current
      hints.push(`还需${remaining}级`)
    }

    if (progress.points && progress.points.required) {
      const remaining = progress.points.required - progress.points.current
      hints.push(`还需${remaining}积分`)
    }

    if (progress.totalSpent && progress.totalSpent.required) {
      const remaining = progress.totalSpent.required - progress.totalSpent.current
      hints.push(`还需消费${remaining}积分`)
    }

    if (progress.vipLevel && progress.vipLevel.required) {
      const remaining = progress.vipLevel.required - progress.vipLevel.current
      hints.push(`还需VIP${remaining}级`)
    }

    return hints.length > 0 ? hints.join('，') : '继续努力即可解锁'
  }

  /**
   * 获取用户池子使用统计
   * @param {number} userId - 用户ID
   * @param {object} filters - 筛选条件
   */
  async getUserPoolStats (userId, filters = {}) {
    try {
      const {
        pool_type = null,
        days = 30,
        limit = 20,
        offset = 0
      } = filters

      const whereClause = { user_id: userId }

      if (pool_type) {
        whereClause.pool_type = pool_type
      }

      if (days > 0) {
        whereClause.created_at = {
          [Op.gte]: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        }
      }

      const [history, stats] = await Promise.all([
        this.models.PoolDrawHistory.findAndCountAll({
          where: whereClause,
          include: [{
            model: this.models.LotteryCampaign,
            as: 'campaign',
            attributes: ['id', 'campaign_name', 'campaign_image']
          }],
          order: [['created_at', 'DESC']],
          limit,
          offset
        }),
        this.models.PoolDrawHistory.findAll({
          where: { user_id: userId },
          attributes: [
            'pool_type',
            [this.models.sequelize.fn('COUNT', 'id'), 'total_draws'],
            [this.models.sequelize.fn('SUM', 'actual_cost'), 'total_spent'],
            [this.models.sequelize.fn('SUM', 'cost_savings'), 'total_savings'],
            [this.models.sequelize.fn('COUNT', this.models.sequelize.literal('CASE WHEN won = true THEN 1 END')), 'total_wins']
          ],
          group: ['pool_type']
        })
      ])

      // 整理统计数据
      const poolStats = {}
      stats.forEach(stat => {
        const poolType = stat.pool_type
        poolStats[poolType] = {
          totalDraws: parseInt(stat.dataValues.total_draws),
          totalSpent: parseInt(stat.dataValues.total_spent),
          totalSavings: parseInt(stat.dataValues.total_savings),
          totalWins: parseInt(stat.dataValues.total_wins),
          winRate: stat.dataValues.total_draws > 0 ? ((stat.dataValues.total_wins / stat.dataValues.total_draws) * 100).toFixed(1) + '%' : '0%'
        }
      })

      return {
        success: true,
        history: history.rows.map(record => ({
          id: record.id,
          poolType: record.pool_type,
          campaign: record.campaign,
          actualCost: record.actual_cost,
          originalCost: record.original_cost,
          costSavings: record.cost_savings,
          won: record.won,
          enhanced: record.enhanced,
          probabilityBoost: record.probability_boost,
          createdAt: record.created_at
        })),
        poolStats,
        pagination: {
          total: history.count,
          limit,
          offset,
          hasMore: offset + limit < history.count
        }
      }
    } catch (error) {
      console.error('获取用户池子统计失败:', error)
      throw error
    }
  }
}

module.exports = new MultiPoolService()
