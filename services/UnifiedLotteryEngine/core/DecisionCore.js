/**
 * 统一决策引擎核心类
 * 集成所有抽奖决策逻辑，避免重复和冲突
 *
 * @description 基于餐厅积分抽奖系统的真实业务需求设计
 * @version 4.0.0
 * @date 2025-09-12
 */

const ContextBuilder = require('./ContextBuilder')
const ResultGenerator = require('./ResultGenerator')
const CacheManager = require('../utils/CacheManager')
const Logger = require('../utils/Logger')

class DecisionCore {
  constructor () {
    this.contextBuilder = new ContextBuilder()
    this.resultGenerator = new ResultGenerator()
    this.cacheManager = new CacheManager()
    this.logger = new Logger()

    // 决策核心配置
    this.config = {
      enableCache: true,
      cacheTimeout: 5 * 60 * 1000, // 5分钟
      maxProbability: 1.0,
      minProbability: 0.0
    }
  }

  /**
   * 执行简化决策处理 - V4三策略版本
   * @param {Object} context 抽奖上下文
   * @returns {Object} 决策结果
   */
  async executeDecision (context) {
    try {
      this.logger.info('开始执行决策处理', { userId: context.userId })

      // 构建完整上下文
      const enrichedContext = await this.contextBuilder.buildContext(context)

      // 保底机制处理（简化版）
      const guaranteeResult = await this.processGuarantee(enrichedContext)

      // 生成最终决策结果 - 简化版
      const decisionResult = {
        userId: context.userId,
        campaignId: context.campaignId,
        guaranteeResult,
        timestamp: new Date()
      }

      this.logger.info('决策处理完成', decisionResult)

      return decisionResult
    } catch (error) {
      this.logger.error('决策处理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 保底机制处理（集成GuaranteeProcessor功能）
   * @param {Object} context 上下文
   * @returns {Object} 保底结果
   */
  async processGuarantee (context) {
    const { userHistory } = context

    // ✅ 修复：处理空的用户历史数据
    if (!userHistory || !Array.isArray(userHistory)) {
      return {
        isGuaranteeTriggered: false,
        forceWin: false,
        probabilityBoost: 1.0,
        guaranteeReason: [],
        failureCount: 0,
        timeSinceLastWin: 0
      }
    }

    // ✅ 修复：计算连续失败次数使用is_winner业务标准字段
    const recentFailures = userHistory.filter(
      record =>
        record.is_winner === false &&
        Date.now() - new Date(record.created_at).getTime() < 24 * 60 * 60 * 1000
    ).length

    // ✅ 修复：获取最后一次中奖时间使用is_winner业务标准字段
    const lastWin = userHistory.find(record => record.is_winner === true)
    const lastWinTime = lastWin ? lastWin.created_at : null

    const guaranteeResult = {
      isGuaranteeTriggered: false,
      forceWin: false,
      probabilityBoost: 1.0,
      guaranteeReason: [],
      failureCount: recentFailures,
      timeSinceLastWin: lastWinTime ? Date.now() - new Date(lastWinTime).getTime() : 0
    }

    // 保底逻辑
    if (recentFailures >= 10) {
      guaranteeResult.isGuaranteeTriggered = true
      guaranteeResult.forceWin = true
      guaranteeResult.guaranteeReason.push('连续失败达到保底上限')
    } else if (recentFailures >= 5) {
      guaranteeResult.isGuaranteeTriggered = true
      guaranteeResult.probabilityBoost = 1 + (recentFailures - 4) * 0.2
      guaranteeResult.guaranteeReason.push(`连续失败${recentFailures}次，概率提升`)
    }

    return guaranteeResult
  }

  /**
   * 执行核心抽奖逻辑
   *
   * @param {Object} context - 决策上下文
   * @param {number} finalProbability - 最终概率
   * @returns {Promise<Object>} 抽奖结果
   */
  async executeLotteryLogic (context, finalProbability) {
    const randomValue = Math.random()
    const is_winner = randomValue <= finalProbability

    this.logger.debug('抽奖逻辑执行', {
      userId: context.request.userId,
      randomValue: randomValue.toFixed(6),
      finalProbability: finalProbability.toFixed(6),
      is_winner
    })

    if (is_winner) {
      // 从选中的奖品池中选择奖品
      const selectedPrize = await this.selectPrizeFromPools(context.selectedPools, context)

      return {
        is_winner: true,
        prize: selectedPrize,
        probability: finalProbability,
        randomValue,
        pools: context.selectedPools.map(pool => pool.name)
      }
    } else {
      return {
        is_winner: false,
        prize: null,
        probability: finalProbability,
        randomValue,
        pools: context.selectedPools.map(pool => pool.name)
      }
    }
  }

  /**
   * 从奖品池中选择奖品
   *
   * @param {Array} selectedPools - 选中的奖品池
   * @param {Object} context - 决策上下文
   * @returns {Promise<Object>} 选中的奖品
   */
  async selectPrizeFromPools (selectedPools, context) {
    // 根据奖品池权重和库存选择奖品
    const availablePrizes = []

    for (const pool of selectedPools) {
      const poolPrizes = await this.getAvailablePrizesFromPool(pool.id, context)
      availablePrizes.push(
        ...poolPrizes.map(prize => ({
          ...prize,
          poolWeight: pool.weight,
          poolName: pool.name
        }))
      )
    }

    if (availablePrizes.length === 0) {
      throw new Error('没有可用的奖品')
    }

    // 加权随机选择奖品
    const totalWeight = availablePrizes.reduce(
      (sum, prize) => sum + (prize.weight || 1) * prize.poolWeight,
      0
    )

    let randomWeight = Math.random() * totalWeight

    for (const prize of availablePrizes) {
      const prizeWeight = (prize.weight || 1) * prize.poolWeight
      if (randomWeight <= prizeWeight) {
        return prize
      }
      randomWeight -= prizeWeight
    }

    // 如果随机选择失败，返回第一个奖品
    return availablePrizes[0]
  }

  /**
   * 从指定奖品池获取可用奖品
   *
   * @param {number} poolId - 奖品池ID
   * @param {Object} _context - 决策上下文
   * @returns {Promise<Array>} 可用奖品列表
   */
  async getAvailablePrizesFromPool (poolId, _context) {
    const { Prize } = require('../../../models')

    return await Prize.findAll({
      where: {
        pool_id: poolId,
        status: 'available',
        quantity: { [require('sequelize').Op.gt]: 0 }
      },
      order: [
        ['weight', 'DESC'],
        ['created_at', 'ASC']
      ]
    })
  }

  /**
   * 生成保底结果
   *
   * @param {Object} context - 决策上下文
   * @param {Object} guaranteeResult - 保底结果
   * @returns {Promise<Object>} 生成的结果
   */
  async generateGuaranteeResult (context, guaranteeResult) {
    const guaranteePrize = await this.selectGuaranteePrize(guaranteeResult, context)

    return await this.resultGenerator.generateResult(context, {
      is_winner: true, // ✅ 业务标准字段
      prize: guaranteePrize,
      probability: 1.0,
      randomValue: 0,
      pools: ['guarantee_pool'],
      guaranteeType: guaranteeResult.type
    })
  }

  /**
   * 选择保底奖品
   *
   * @param {Object} guaranteeResult - 保底结果
   * @param {Object} _context - 决策上下文
   * @returns {Promise<Object>} 保底奖品
   */
  async selectGuaranteePrize (guaranteeResult, _context) {
    const { Prize } = require('../../../models')

    // 根据保底类型选择相应的奖品
    const guaranteePrizes = await Prize.findAll({
      where: {
        type: guaranteeResult.prizeType || 'common',
        status: 'available',
        quantity: { [require('sequelize').Op.gt]: 0 }
      },
      order: [['weight', 'ASC']], // 保底通常给权重较低的奖品
      limit: 10
    })

    if (guaranteePrizes.length === 0) {
      throw new Error('没有可用的保底奖品')
    }

    return guaranteePrizes[Math.floor(Math.random() * guaranteePrizes.length)]
  }

  /**
   * 检查缓存决策
   *
   * @param {Object} context - 决策上下文
   * @returns {Promise<Object|null>} 缓存的决策结果
   */
  async checkCachedDecision (context) {
    const cacheKey = this.generateCacheKey(context)
    return await this.cacheManager.get(cacheKey)
  }

  /**
   * 缓存决策结果
   *
   * @param {Object} context - 决策上下文
   * @param {Object} result - 决策结果
   * @returns {Promise<void>}
   */
  async cacheDecision (context, result) {
    const cacheKey = this.generateCacheKey(context)
    const ttl = 300 // 5分钟缓存

    await this.cacheManager.set(cacheKey, result, ttl)
  }

  /**
   * 生成缓存键
   *
   * @param {Object} context - 决策上下文
   * @returns {string} 缓存键
   */
  generateCacheKey (context) {
    const { userId, activityId, lotteryType } = context.request
    const userHash = this.hashUserContext(context.userProfile)

    return `decision:${userId}:${activityId}:${lotteryType}:${userHash}`
  }

  /**
   * 计算用户上下文哈希
   *
   * @param {Object} userProfile - 用户画像
   * @returns {string} 哈希值
   */
  hashUserContext (userProfile) {
    const crypto = require('crypto')
    const contextString = JSON.stringify({
      level: userProfile.level,
      vipStatus: userProfile.vipStatus,
      recentActivity: userProfile.recentLotteryCount
    })

    return crypto.createHash('md5').update(contextString).digest('hex').substring(0, 8)
  }

  /**
   * 生成决策ID
   *
   * @returns {string} 决策ID
   */
  generateDecisionId () {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `decision_${timestamp}_${random}`
  }

  /**
   * 更新性能指标
   *
   * @param {number} startTime - 开始时间
   * @param {boolean} success - 是否成功
   * @param {boolean} cacheHit - 是否命中缓存
   */
  updateMetrics (startTime, success, cacheHit) {
    this.metrics.totalDecisions++

    if (success) {
      this.metrics.successfulDecisions++
    }

    const executionTime = Date.now() - startTime
    this.metrics.averageDecisionTime =
      (this.metrics.averageDecisionTime * (this.metrics.totalDecisions - 1) + executionTime) /
      this.metrics.totalDecisions

    if (cacheHit) {
      this.metrics.cacheHitRate =
        (this.metrics.cacheHitRate * (this.metrics.totalDecisions - 1) + 1) /
        this.metrics.totalDecisions
    }
  }

  /**
   * 获取性能指标
   *
   * @returns {Object} 性能指标
   */
  getMetrics () {
    return {
      ...this.metrics,
      successRate: this.metrics.successfulDecisions / this.metrics.totalDecisions,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 重置性能指标
   */
  resetMetrics () {
    this.metrics = {
      totalDecisions: 0,
      successfulDecisions: 0,
      averageDecisionTime: 0,
      cacheHitRate: 0
    }
  }
}

module.exports = DecisionCore
