// services/ExtendedLotteryService.js
const EventBusService = require('./EventBusService')
const LotteryService = require('./LotteryService')
const PointsSystemService = require('./PointsSystemService')
const TransactionService = require('./TransactionService')

/**
 * 扩展连抽系统服务
 * 实现五连抽、十连抽、二十连抽机制
 * 基于现有LotteryService进行扩展
 */
class ExtendedLotteryService {
  constructor () {
    this.models = require('../models')
    this.eventBus = EventBusService
    this.lotteryService = LotteryService
    this.points = PointsSystemService
    this.transaction = TransactionService

    // 连抽配置
    this.multiDrawConfigs = {
      single: { count: 1, discount: 0, guaranteeName: null },
      five: { count: 5, discount: 0.1, guaranteeName: 'rare_guaranteed' }, // 9折，保底一个稀有
      ten: { count: 10, discount: 0.2, guaranteeName: 'super_rare_guaranteed' }, // 8折，保底一个超稀有
      twenty: { count: 20, discount: 0.3, guaranteeName: 'legendary_guaranteed' } // 7折，保底一个传说
    }
  }

  /**
   * 执行连抽操作
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 抽奖活动ID
   * @param {string} drawType - 连抽类型: single, five, ten, twenty
   * @param {object} _options - 额外选项
   */
  async executeMultiDraw (userId, campaignId, drawType = 'single', _options = {}) {
    try {
      const drawConfig = this.multiDrawConfigs[drawType]
      if (!drawConfig) {
        throw new Error(`不支持的连抽类型: ${drawType}`)
      }

      return await this.transaction.executeTransaction(async (transaction) => {
        // 获取活动信息
        const campaign = await this.models.LotteryCampaign.findByPk(campaignId, { transaction })
        if (!campaign || campaign.status !== 'active') {
          throw new Error('抽奖活动不存在或未激活')
        }

        // 计算连抽总费用（含折扣）
        const singleCost = campaign.cost_points || 100
        const totalCost = Math.floor(singleCost * drawConfig.count * (1 - drawConfig.discount))

        // 检查用户积分
        const userPoints = await this.points.getUserPoints(userId, transaction)
        if (userPoints.total_points < totalCost) {
          throw new Error(`积分不足，需要${totalCost}积分，当前${userPoints.total_points}积分`)
        }

        // 扣除积分
        await this.points.deductPoints(userId, totalCost, {
          type: 'multi_lottery_draw',
          description: `${this.getDrawTypeName(drawType)}抽奖`,
          related_id: campaignId
        }, transaction)

        // 执行连抽
        const drawResults = []
        const prizeResults = []
        let guaranteeActivated = false

        for (let i = 0; i < drawConfig.count; i++) {
          // 检查是否需要触发保底
          const shouldTriggerGuarantee = (i === drawConfig.count - 1) &&
                                       drawConfig.guaranteeName &&
                                       !this.hasRareOrBetter(prizeResults)

          let singleResult
          if (shouldTriggerGuarantee) {
            // 触发保底抽奖
            singleResult = await this.executeGuaranteeDraw(
              userId,
              campaignId,
              drawConfig.guaranteeName,
              transaction
            )
            guaranteeActivated = true
          } else {
            // 普通抽奖
            singleResult = await this.lotteryService.executeLotteryDraw(
              userId,
              campaignId,
              transaction
            )
          }

          drawResults.push(singleResult)
          if (singleResult.won && singleResult.prize) {
            prizeResults.push(singleResult.prize)
          }
        }

        // 连抽特殊奖励
        const bonusRewards = await this.calculateMultiDrawBonus(
          userId,
          drawType,
          prizeResults,
          transaction
        )

        // 记录连抽历史
        const multiDrawRecord = await this.models.MultiDrawHistory.create({
          user_id: userId,
          campaign_id: campaignId,
          draw_type: drawType,
          draw_count: drawConfig.count,
          total_cost: totalCost,
          discount_rate: drawConfig.discount,
          guarantee_activated: guaranteeActivated,
          prizes_won: prizeResults.length,
          bonus_rewards: bonusRewards,
          draw_results: drawResults.map(r => ({
            draw_id: r.id,
            won: r.won,
            prize_id: r.prize?.id || null
          })),
          created_at: new Date()
        }, { transaction })

        // 发送连抽完成事件
        await this.eventBus.emit('multi_draw_completed', {
          userId,
          campaignId,
          drawType,
          drawCount: drawConfig.count,
          totalCost,
          prizesWon: prizeResults.length,
          guaranteeActivated,
          bonusRewards,
          multiDrawId: multiDrawRecord.id
        })

        return {
          success: true,
          multiDrawId: multiDrawRecord.id,
          drawType,
          drawCount: drawConfig.count,
          totalCost,
          discountRate: drawConfig.discount,
          savedPoints: singleCost * drawConfig.count - totalCost,
          results: drawResults,
          prizes: prizeResults,
          guaranteeActivated,
          bonusRewards,
          summary: {
            totalDraws: drawConfig.count,
            prizesWon: prizeResults.length,
            winRate: (prizeResults.length / drawConfig.count * 100).toFixed(1) + '%'
          }
        }
      })
    } catch (error) {
      console.error('连抽执行失败:', error)
      throw error
    }
  }

  /**
   * 执行保底抽奖
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {string} guaranteeType - 保底类型
   * @param {object} transaction - 事务对象
   */
  async executeGuaranteeDraw (userId, campaignId, guaranteeType, transaction) {
    try {
      // 获取保底奖池
      const guaranteePrizes = await this.models.LotteryPrize.findAll({
        where: {
          campaign_id: campaignId,
          prize_category: this.getGuaranteeCategory(guaranteeType),
          status: 'active'
        },
        transaction
      })

      if (guaranteePrizes.length === 0) {
        // 如果没有保底奖池，执行普通抽奖
        return await this.lotteryService.executeLotteryDraw(userId, campaignId, transaction)
      }

      // 从保底奖池中随机选择
      const selectedPrize = guaranteePrizes[Math.floor(Math.random() * guaranteePrizes.length)]

      // 创建中奖记录
      const drawRecord = await this.models.LotteryDraw.create({
        user_id: userId,
        campaign_id: campaignId,
        prize_id: selectedPrize.id,
        won: true,
        points_cost: 0, // 保底抽奖不额外收费
        draw_type: 'guarantee',
        draw_config: {
          guarantee_type: guaranteeType,
          guarantee_activated: true
        },
        created_at: new Date()
      }, { transaction })

      // 发放奖品到用户库存
      await this.models.UserInventory.create({
        user_id: userId,
        item_type: selectedPrize.prize_type,
        item_id: selectedPrize.prize_id,
        quantity: selectedPrize.quantity,
        source: 'lottery_guarantee',
        source_id: drawRecord.id,
        item_data: {
          campaign_id: campaignId,
          prize_name: selectedPrize.prize_name,
          guarantee_type: guaranteeType,
          won_at: new Date()
        }
      }, { transaction })

      return {
        id: drawRecord.id,
        won: true,
        prize: selectedPrize,
        guarantee: true,
        guaranteeType
      }
    } catch (error) {
      console.error('保底抽奖执行失败:', error)
      throw error
    }
  }

  /**
   * 计算连抽额外奖励
   * @param {number} userId - 用户ID
   * @param {string} drawType - 连抽类型
   * @param {Array} prizes - 获得的奖品
   * @param {object} transaction - 事务对象
   */
  async calculateMultiDrawBonus (userId, drawType, prizes, transaction) {
    const bonusRewards = []

    // 连抽次数奖励
    const drawCountBonus = this.getDrawCountBonus(drawType)
    if (drawCountBonus.points > 0) {
      await this.points.addPoints(userId, drawCountBonus.points, {
        type: 'multi_draw_bonus',
        description: `${this.getDrawTypeName(drawType)}次数奖励`,
        related_id: null
      }, transaction)

      bonusRewards.push({
        type: 'points',
        amount: drawCountBonus.points,
        description: '连抽次数奖励'
      })
    }

    // 中奖数量奖励
    const prizeCountBonus = this.getPrizeCountBonus(prizes.length, drawType)
    if (prizeCountBonus.points > 0) {
      await this.points.addPoints(userId, prizeCountBonus.points, {
        type: 'multi_draw_prize_bonus',
        description: '连抽中奖数量奖励',
        related_id: null
      }, transaction)

      bonusRewards.push({
        type: 'points',
        amount: prizeCountBonus.points,
        description: `中奖${prizes.length}个奖品的额外奖励`
      })
    }

    // 特殊连击奖励（如果连续中奖）
    if (this.checkSpecialCombo(prizes)) {
      const comboBonus = this.getComboBonus(prizes)
      if (comboBonus.points > 0) {
        await this.points.addPoints(userId, comboBonus.points, {
          type: 'multi_draw_combo_bonus',
          description: '连抽特殊连击奖励',
          related_id: null
        }, transaction)

        bonusRewards.push({
          type: 'points',
          amount: comboBonus.points,
          description: '特殊连击奖励'
        })
      }
    }

    return bonusRewards
  }

  /**
   * 获取用户连抽历史统计
   * @param {number} userId - 用户ID
   * @param {object} filters - 筛选条件
   */
  async getMultiDrawHistory (userId, filters = {}) {
    try {
      const {
        draw_type = null,
        campaign_id = null,
        limit = 20,
        offset = 0
      } = filters

      const whereClause = { user_id: userId }

      if (draw_type) {
        whereClause.draw_type = draw_type
      }

      if (campaign_id) {
        whereClause.campaign_id = campaign_id
      }

      const history = await this.models.MultiDrawHistory.findAndCountAll({
        where: whereClause,
        include: [{
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['id', 'campaign_name', 'campaign_image']
        }],
        order: [['created_at', 'DESC']],
        limit,
        offset
      })

      // 计算统计数据
      const stats = await this.calculateUserMultiDrawStats(userId)

      return {
        success: true,
        history: history.rows.map(record => ({
          id: record.id,
          drawType: record.draw_type,
          drawCount: record.draw_count,
          totalCost: record.total_cost,
          discountRate: record.discount_rate,
          prizesWon: record.prizes_won,
          guaranteeActivated: record.guarantee_activated,
          bonusRewards: record.bonus_rewards,
          campaign: record.campaign,
          createdAt: record.created_at
        })),
        stats,
        pagination: {
          total: history.count,
          limit,
          offset,
          hasMore: offset + limit < history.count
        }
      }
    } catch (error) {
      console.error('获取连抽历史失败:', error)
      throw error
    }
  }

  /**
   * 获取连抽推荐
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   */
  async getMultiDrawRecommendation (userId, campaignId) {
    try {
      // 获取用户积分
      const userPoints = await this.points.getUserPoints(userId)

      // 获取活动信息
      const campaign = await this.models.LotteryCampaign.findByPk(campaignId)
      if (!campaign) {
        throw new Error('活动不存在')
      }

      const singleCost = campaign.cost_points || 100
      const recommendations = []

      // 分析每种连抽的性价比
      for (const [type, config] of Object.entries(this.multiDrawConfigs)) {
        if (type === 'single') continue

        const totalCost = Math.floor(singleCost * config.count * (1 - config.discount))
        const canAfford = userPoints.total_points >= totalCost
        const savedPoints = singleCost * config.count - totalCost

        recommendations.push({
          drawType: type,
          drawCount: config.count,
          totalCost,
          savedPoints,
          discountRate: config.discount,
          canAfford,
          guaranteeInfo: {
            type: config.guaranteeName,
            description: this.getGuaranteeDescription(config.guaranteeName)
          },
          valueScore: this.calculateValueScore(config, savedPoints, canAfford),
          recommendation: this.generateRecommendationReason(
            config,
            savedPoints,
            canAfford,
            userPoints.total_points
          )
        })
      }

      // 按性价比排序
      recommendations.sort((a, b) => b.valueScore - a.valueScore)

      return {
        success: true,
        userPoints: userPoints.total_points,
        singleCost,
        recommendations,
        bestChoice: recommendations[0]?.drawType || 'single'
      }
    } catch (error) {
      console.error('获取连抽推荐失败:', error)
      throw error
    }
  }

  // 辅助方法
  getDrawTypeName (drawType) {
    const names = {
      single: '单抽',
      five: '五连抽',
      ten: '十连抽',
      twenty: '二十连抽'
    }
    return names[drawType] || drawType
  }

  getGuaranteeCategory (guaranteeType) {
    const categories = {
      rare_guaranteed: 'rare',
      super_rare_guaranteed: 'super_rare',
      legendary_guaranteed: 'legendary'
    }
    return categories[guaranteeType] || 'common'
  }

  getGuaranteeDescription (guaranteeType) {
    const descriptions = {
      rare_guaranteed: '保底获得一个稀有品质奖品',
      super_rare_guaranteed: '保底获得一个超稀有品质奖品',
      legendary_guaranteed: '保底获得一个传说品质奖品'
    }
    return descriptions[guaranteeType] || '无保底'
  }

  hasRareOrBetter (prizes) {
    return prizes.some(prize =>
      ['rare', 'super_rare', 'legendary'].includes(prize.prize_category)
    )
  }

  getDrawCountBonus (drawType) {
    const bonuses = {
      five: { points: 50 },
      ten: { points: 150 },
      twenty: { points: 400 }
    }
    return bonuses[drawType] || { points: 0 }
  }

  getPrizeCountBonus (prizeCount, drawType) {
    // 根据中奖数量给额外奖励
    const baseBonus = prizeCount * 10
    const typeMultiplier = {
      five: 1.2,
      ten: 1.5,
      twenty: 2.0
    }

    return {
      points: Math.floor(baseBonus * (typeMultiplier[drawType] || 1))
    }
  }

  checkSpecialCombo (prizes) {
    // 检查是否有特殊连击（如连续稀有品质）
    if (prizes.length < 3) return false

    const rareCount = prizes.filter(p =>
      ['rare', 'super_rare', 'legendary'].includes(p.prize_category)
    ).length

    return rareCount >= Math.ceil(prizes.length * 0.6) // 60%以上为稀有
  }

  getComboBonus (prizes) {
    const rareCount = prizes.filter(p =>
      ['rare', 'super_rare', 'legendary'].includes(p.prize_category)
    ).length

    return {
      points: rareCount * 100 // 每个稀有奖品额外100积分
    }
  }

  calculateValueScore (config, savedPoints, canAfford) {
    let score = 0

    // 折扣分数
    score += config.discount * 100

    // 保底分数
    if (config.guaranteeName) {
      score += 50
    }

    // 可负担性分数
    if (canAfford) {
      score += 30
    }

    // 节省积分分数
    score += Math.min(savedPoints / 10, 20)

    return score
  }

  generateRecommendationReason (config, savedPoints, canAfford, _userPoints) {
    const reasons = []

    if (!canAfford) {
      reasons.push('积分不足')
      return reasons.join('，')
    }

    if (config.discount > 0) {
      reasons.push(`享受${(config.discount * 100).toFixed(0)}%折扣`)
    }

    if (savedPoints > 0) {
      reasons.push(`节省${savedPoints}积分`)
    }

    if (config.guaranteeName) {
      reasons.push('包含保底机制')
    }

    return reasons.length > 0 ? reasons.join('，') : '性价比较高'
  }

  async calculateUserMultiDrawStats (userId) {
    const stats = await this.models.MultiDrawHistory.findAll({
      where: { user_id: userId },
      attributes: [
        [this.models.sequelize.fn('COUNT', 'id'), 'total_multi_draws'],
        [this.models.sequelize.fn('SUM', 'draw_count'), 'total_draws'],
        [this.models.sequelize.fn('SUM', 'prizes_won'), 'total_prizes'],
        [this.models.sequelize.fn('SUM', 'total_cost'), 'total_spent'],
        [this.models.sequelize.fn('COUNT', this.models.sequelize.literal('CASE WHEN guarantee_activated = true THEN 1 END')), 'guarantees_used']
      ]
    })

    const result = stats[0]?.dataValues || {}

    return {
      totalMultiDraws: parseInt(result.total_multi_draws || 0),
      totalDraws: parseInt(result.total_draws || 0),
      totalPrizes: parseInt(result.total_prizes || 0),
      totalSpent: parseInt(result.total_spent || 0),
      guaranteesUsed: parseInt(result.guarantees_used || 0),
      averageWinRate: result.total_draws > 0
        ? ((result.total_prizes / result.total_draws) * 100).toFixed(1) + '%'
        : '0%'
    }
  }
}

module.exports = new ExtendedLotteryService()
