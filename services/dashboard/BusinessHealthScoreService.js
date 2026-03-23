/**
 * 全局业务健康度评分服务（BusinessHealthScoreService）
 *
 * 业务场景：
 * - 为运营后台仪表盘提供全局业务健康度评估
 * - 聚合资产流动、抽奖活跃、用户增长三个核心维度
 * - 辅助运营决策和风险预警
 *
 * 计算规则：
 * - 业务健康度 = 资产流动得分(40%) + 抽奖活跃得分(30%) + 用户增长得分(30%)
 *
 * 维度说明：
 * 1. 资产流动（40%权重）：发放/消耗比在0.8-1.2之间得满分
 * 2. 抽奖活跃（30%权重）：今日抽奖次数 vs 7日均值
 * 3. 用户增长（30%权重）：新用户数、活跃用户数
 *
 * 状态映射：
 * - 80-100分：healthy（绿色🟢）业务健康
 * - 50-79分：warning（黄色🟡）需要关注
 * - 0-49分：critical（红色🔴）需立即处理
 *
 * API 端点：
 * - GET /api/v4/console/dashboard/business-health
 *
 * ServiceManager 键名：business_health_score
 *
 * 复用说明：
 * - 可复用已实现的 LotteryHealthService，聚合所有活跃活动的健康度作为"抽奖活跃得分"维度
 *
 * 关联需求：
 * - 《运营后台优化 - 后端需求文档》§3.1.2
 *
 * @version 1.0.0
 */

'use strict'

const { Op, fn, literal } = require('sequelize')
const { BusinessCacheHelper, KEY_PREFIX } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * 健康度评分配置常量
 * @constant
 */
const HEALTH_CONFIG = {
  /** 资产流动权重 */
  ASSET_FLOW_WEIGHT: 0.4,
  /** 抽奖活跃权重 */
  LOTTERY_ACTIVE_WEIGHT: 0.3,
  /** 用户增长权重 */
  USER_GROWTH_WEIGHT: 0.3
}

/**
 * 健康状态阈值配置
 * @constant
 */
const STATUS_THRESHOLDS = {
  /** 健康状态阈值（>=80分） */
  HEALTHY: 80,
  /** 警告状态阈值（>=50分） */
  WARNING: 50
}

/**
 * 资产流动评分参数
 * @constant
 */
const ASSET_FLOW_CONFIG = {
  /** 理想发放/消耗比下限 */
  IDEAL_RATIO_MIN: 0.8,
  /** 理想发放/消耗比上限 */
  IDEAL_RATIO_MAX: 1.2,
  /** 最大偏差（超过此偏差得0分） */
  MAX_DEVIATION: 0.5
}

/**
 * 缓存配置
 * @constant
 */
const CACHE_KEY = 'business_health_score'
const CACHE_TTL = 120 // 2分钟缓存

/**
 * 全局业务健康度评分服务
 *
 * @description 提供全局业务健康度评估功能
 */
class BusinessHealthScoreService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /**
   * 获取全局业务健康度评分（主方法）
   *
   * @description 聚合资产流动、抽奖活跃、用户增长三个维度计算综合健康度
   *
   * @returns {Promise<Object>} 业务健康度评分结果
   * @returns {number} return.score - 健康度分数（0-100）
   * @returns {string} return.status - 健康状态（healthy/warning/critical）
   * @returns {Object} return.components - 评分组成详情
   * @returns {string} return.trend - 趋势（up/down/stable）
   * @returns {string} return.updated_at - 更新时间
   *
   * @example
   * const healthScore = await BusinessHealthScoreService.getBusinessHealthScore()
   * // { score: 82, status: 'healthy', components: { asset_flow: {...}, ... } }
   */
  async getBusinessHealthScore() {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`

    try {
      // 1. 尝试从缓存获取
      const cached = await BusinessCacheHelper.get(cacheKey)
      if (cached) {
        logger.debug('[业务健康度] 使用缓存数据')
        return cached
      }

      // 2. 并行获取各维度评分
      const [assetFlowScore, lotteryActiveScore, userGrowthScore] = await Promise.all([
        this._calculateAssetFlowScore(),
        this._calculateLotteryActiveScore(),
        this._calculateUserGrowthScore()
      ])

      // 3. 计算加权综合分数
      const weightedScore =
        assetFlowScore.score * HEALTH_CONFIG.ASSET_FLOW_WEIGHT +
        lotteryActiveScore.score * HEALTH_CONFIG.LOTTERY_ACTIVE_WEIGHT +
        userGrowthScore.score * HEALTH_CONFIG.USER_GROWTH_WEIGHT

      const finalScore = Math.round(weightedScore)

      // 4. 确定健康状态
      let status
      if (finalScore >= STATUS_THRESHOLDS.HEALTHY) {
        status = 'healthy'
      } else if (finalScore >= STATUS_THRESHOLDS.WARNING) {
        status = 'warning'
      } else {
        status = 'critical'
      }

      // 5. 获取趋势
      const trend = await this._calculateTrend(finalScore)

      const result = {
        score: finalScore,
        status,
        components: {
          asset_flow: {
            score: assetFlowScore.score,
            weight: HEALTH_CONFIG.ASSET_FLOW_WEIGHT,
            detail: assetFlowScore.detail
          },
          lottery_active: {
            score: lotteryActiveScore.score,
            weight: HEALTH_CONFIG.LOTTERY_ACTIVE_WEIGHT,
            detail: lotteryActiveScore.detail
          },
          user_growth: {
            score: userGrowthScore.score,
            weight: HEALTH_CONFIG.USER_GROWTH_WEIGHT,
            detail: userGrowthScore.detail
          }
        },
        trend,
        updated_at: BeijingTimeHelper.apiTimestamp()
      }

      // 6. 写入缓存
      await BusinessCacheHelper.set(cacheKey, result, CACHE_TTL)

      logger.info('[业务健康度] 评分计算完成', {
        score: result.score,
        status: result.status
      })

      return result
    } catch (error) {
      logger.error('[业务健康度] 评分计算失败', { error: error.message })
      throw error
    }
  }

  /**
   * 计算资产流动得分
   *
   * @description 发放/消耗比在0.8-1.2之间得满分，偏差越大分数越低
   *
   * @private
   * @returns {Promise<Object>} 资产流动评分结果
   */
  async _calculateAssetFlowScore() {
    try {
      const todayStart = BeijingTimeHelper.todayRange().start

      /*
       * 查询今日资产流动数据
       * 使用实际字段 business_type / delta_amount
       */
      const result = await this.models.AssetTransaction.findOne({
        attributes: [
          [
            fn(
              'SUM',
              literal(`CASE WHEN business_type IN ('lottery_reward', 'consumption_reward', 'admin_adjust') 
                AND delta_amount > 0 THEN delta_amount ELSE 0 END`)
            ),
            'issuance'
          ],
          [
            fn('SUM', literal(`CASE WHEN delta_amount < 0 THEN ABS(delta_amount) ELSE 0 END`)),
            'consumption'
          ]
        ],
        where: {
          created_at: {
            [Op.gte]: todayStart
          }
        },
        raw: true
      })

      const issuance = parseFloat(result?.issuance || 0)
      const consumption = parseFloat(result?.consumption || 0)

      // 计算发放/消耗比
      let ratio = 1.0
      if (consumption > 0) {
        ratio = issuance / consumption
      } else if (issuance > 0) {
        ratio = 2.0 // 只有发放没有消耗，视为比例过高
      }

      // 计算得分（比例在0.8-1.2之间得满分）
      let score
      if (
        ratio >= ASSET_FLOW_CONFIG.IDEAL_RATIO_MIN &&
        ratio <= ASSET_FLOW_CONFIG.IDEAL_RATIO_MAX
      ) {
        score = 100
      } else {
        // 计算偏差
        let deviation
        if (ratio < ASSET_FLOW_CONFIG.IDEAL_RATIO_MIN) {
          deviation = ASSET_FLOW_CONFIG.IDEAL_RATIO_MIN - ratio
        } else {
          deviation = ratio - ASSET_FLOW_CONFIG.IDEAL_RATIO_MAX
        }
        // 偏差越大分数越低
        score = Math.max(0, Math.round(100 * (1 - deviation / ASSET_FLOW_CONFIG.MAX_DEVIATION)))
      }

      return {
        score,
        detail: `发放/消耗比: ${ratio.toFixed(2)}`,
        raw: { issuance, consumption, ratio }
      }
    } catch (error) {
      logger.error('[业务健康度] 资产流动评分计算失败', { error: error.message })
      // 返回默认值，避免整体计算失败
      return { score: 50, detail: '数据获取失败', raw: null }
    }
  }

  /**
   * 计算抽奖活跃得分
   *
   * @description 今日抽奖次数 vs 7日均值，达到均值得满分
   *
   * @private
   * @returns {Promise<Object>} 抽奖活跃评分结果
   */
  async _calculateLotteryActiveScore() {
    try {
      const todayStart = BeijingTimeHelper.todayRange().start
      const sevenDaysAgo = BeijingTimeHelper.daysAgo(7)

      // 查询今日抽奖次数和7日均值
      const [todayResult, weekResult] = await Promise.all([
        this.models.LotteryDraw.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        this.models.LotteryDraw.count({
          where: {
            created_at: {
              [Op.gte]: sevenDaysAgo
            }
          }
        })
      ])

      const todayDraws = todayResult || 0
      const avgDraws = Math.round((weekResult || 0) / 7)

      // 计算得分（达到均值得满分）
      let score
      if (avgDraws === 0) {
        score = todayDraws > 0 ? 100 : 50 // 无历史数据时，有抽奖就满分
      } else {
        const ratio = todayDraws / avgDraws
        if (ratio >= 1) {
          score = 100 // 超过均值得满分
        } else {
          score = Math.round(ratio * 100) // 低于均值按比例计算
        }
      }

      return {
        score,
        detail: `今日${todayDraws}次，均值${avgDraws}次`,
        raw: { todayDraws, avgDraws }
      }
    } catch (error) {
      logger.error('[业务健康度] 抽奖活跃评分计算失败', { error: error.message })
      return { score: 50, detail: '数据获取失败', raw: null }
    }
  }

  /**
   * 计算用户增长得分
   *
   * @description 基于新用户数和活跃用户数计算
   *
   * @private
   * @returns {Promise<Object>} 用户增长评分结果
   */
  async _calculateUserGrowthScore() {
    try {
      const todayStart = BeijingTimeHelper.todayRange().start
      const sevenDaysAgo = BeijingTimeHelper.daysAgo(7)

      // 查询今日新用户和活跃用户
      const [newUsersToday, activeUsersToday, avgNewUsers, avgActiveUsers] = await Promise.all([
        // 今日新用户
        this.models.User.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 今日活跃用户（有抽奖记录的用户）
        this.models.LotteryDraw.count({
          distinct: true,
          col: 'user_id',
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 7日平均新用户
        this.models.User.count({
          where: {
            created_at: {
              [Op.gte]: sevenDaysAgo
            }
          }
        }).then(count => Math.round(count / 7)),
        // 7日日均活跃用户（粗略估算）
        this.models.LotteryDraw.count({
          distinct: true,
          col: 'user_id',
          where: {
            created_at: {
              [Op.gte]: sevenDaysAgo
            }
          }
        }).then(count => Math.round(count / 7))
      ])

      // 计算新用户得分（50%权重）
      let newUserScore
      if (avgNewUsers === 0) {
        newUserScore = newUsersToday > 0 ? 100 : 50
      } else {
        const ratio = newUsersToday / avgNewUsers
        newUserScore = ratio >= 1 ? 100 : Math.round(ratio * 100)
      }

      // 计算活跃用户得分（50%权重）
      let activeUserScore
      if (avgActiveUsers === 0) {
        activeUserScore = activeUsersToday > 0 ? 100 : 50
      } else {
        const ratio = activeUsersToday / avgActiveUsers
        activeUserScore = ratio >= 1 ? 100 : Math.round(ratio * 100)
      }

      const score = Math.round(newUserScore * 0.5 + activeUserScore * 0.5)

      return {
        score,
        detail: `新增${newUsersToday}人，活跃${activeUsersToday}人`,
        raw: { newUsersToday, activeUsersToday, avgNewUsers, avgActiveUsers }
      }
    } catch (error) {
      logger.error('[业务健康度] 用户增长评分计算失败', { error: error.message })
      return { score: 50, detail: '数据获取失败', raw: null }
    }
  }

  /**
   * 计算趋势
   *
   * @description 对比历史数据确定分数趋势
   *
   * @private
   * @param {number} currentScore - 当前分数
   * @returns {Promise<string>} 趋势（up/down/stable）
   */
  async _calculateTrend(currentScore) {
    try {
      const historyKey = `${KEY_PREFIX}${CACHE_KEY}_history`
      const historyData = await BusinessCacheHelper.get(historyKey)

      if (historyData && typeof historyData.score === 'number') {
        const previousScore = historyData.score
        const diff = currentScore - previousScore

        if (diff > 5) {
          return 'up'
        } else if (diff < -5) {
          return 'down'
        }
      }

      // 保存当前分数作为历史记录（TTL=1小时）
      await BusinessCacheHelper.set(historyKey, { score: currentScore }, 3600)

      return 'stable'
    } catch (error) {
      logger.warn('[业务健康度] 趋势计算失败', { error: error.message })
      return 'stable'
    }
  }

  /**
   * 手动失效缓存
   *
   * @description 当业务数据发生重大变化时调用，触发缓存刷新
   *
   * @param {string} reason - 失效原因（用于日志记录）
   * @returns {Promise<boolean>} 是否成功失效缓存
   */
  async invalidateCache(reason = 'manual_invalidation') {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`
    return await BusinessCacheHelper.del(cacheKey, reason)
  }
}

module.exports = BusinessHealthScoreService
