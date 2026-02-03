/**
 * 待办健康度评分服务（PendingHealthScoreService）
 *
 * 业务场景：
 * - 评估待办事项的整体健康状态
 * - 基于超时惩罚和积压惩罚计算健康度分数
 * - 为运营后台待办中心提供健康度指标
 *
 * 计算规则：
 * - 健康度 = 100 - 超时惩罚分 - 积压惩罚分
 * - 超时惩罚：每超时1项扣5分
 * - 积压惩罚：待办总数超过10项，每多1项扣2分
 * - 最低0分
 *
 * 状态映射：
 * - 80-100分：healthy（绿色🟢）待办可控
 * - 50-79分：warning（黄色🟡）需要关注
 * - 0-49分：critical（红色🔴）需立即处理
 *
 * API 端点：
 * - GET /api/v4/console/pending/health-score
 *
 * ServiceManager 键名：pending_health_score
 *
 * 关联需求：
 * - 《运营后台优化 - 后端需求文档》§3.1.1
 *
 * 创建时间：2026-02-03
 * @version 1.0.0
 */

'use strict'

const { BusinessCacheHelper, KEY_PREFIX } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * 健康度评分配置常量
 * @constant
 */
const HEALTH_CONFIG = {
  /** 基础分数 */
  BASE_SCORE: 100,
  /** 每个超时项扣除的分数 */
  TIMEOUT_PENALTY_PER_ITEM: 5,
  /** 积压惩罚的阈值（超过此数量开始扣分） */
  BACKLOG_THRESHOLD: 10,
  /** 每多一项积压扣除的分数 */
  BACKLOG_PENALTY_PER_ITEM: 2,
  /** 最低分数 */
  MIN_SCORE: 0
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
 * 缓存配置
 * @constant
 */
const CACHE_KEY = 'pending_health_score'
const CACHE_TTL = 60 // 60秒缓存

/**
 * 待办健康度评分服务
 *
 * @description 提供待办事项健康度评分计算功能
 */
class PendingHealthScoreService {
  /**
   * 获取待办健康度评分（主方法）
   *
   * @description 复用 PendingSummaryService 的数据，计算健康度分数
   *
   * @returns {Promise<Object>} 健康度评分结果
   * @returns {number} return.score - 健康度分数（0-100）
   * @returns {string} return.status - 健康状态（healthy/warning/critical）
   * @returns {Object} return.components - 评分组成详情
   * @returns {string} return.trend - 趋势（up/down/stable）
   * @returns {string} return.updated_at - 更新时间
   *
   * @example
   * const healthScore = await PendingHealthScoreService.getHealthScore()
   * // { score: 75, status: 'warning', components: { ... } }
   */
  static async getHealthScore() {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`

    try {
      // 1. 尝试从缓存获取
      const cached = await BusinessCacheHelper.get(cacheKey)
      if (cached) {
        logger.debug('[待办健康度] 使用缓存数据')
        return cached
      }

      // 2. 获取待办汇总数据
      const PendingSummaryService = require('../dashboard/PendingSummaryService')
      const pendingSummary = await PendingSummaryService.getPendingSummary()

      // 3. 计算健康度分数
      const scoreResult = this._calculateHealthScore(pendingSummary)

      // 4. 获取趋势（对比历史数据）
      const trend = await this._calculateTrend(scoreResult.score)

      const result = {
        score: scoreResult.score,
        status: scoreResult.status,
        components: scoreResult.components,
        trend,
        details: {
          consumption: pendingSummary.consumption,
          customer_service: pendingSummary.customer_service,
          risk_alerts: pendingSummary.risk_alerts,
          lottery_alerts: pendingSummary.lottery_alerts
        },
        updated_at: BeijingTimeHelper.apiTimestamp()
      }

      // 5. 写入缓存
      await BusinessCacheHelper.set(cacheKey, result, CACHE_TTL)

      logger.info('[待办健康度] 评分计算完成', {
        score: result.score,
        status: result.status
      })

      return result
    } catch (error) {
      logger.error('[待办健康度] 评分计算失败', { error: error.message })
      throw error
    }
  }

  /**
   * 计算健康度分数
   *
   * @description 基于超时惩罚和积压惩罚计算最终分数
   *
   * @private
   * @param {Object} pendingSummary - 待办汇总数据
   * @returns {Object} 评分结果
   */
  static _calculateHealthScore(pendingSummary) {
    const { summary } = pendingSummary
    const totalPending = summary.total_count || 0
    const overdueCount = summary.urgent_count || 0

    // 计算超时惩罚
    const timeoutPenalty = overdueCount * HEALTH_CONFIG.TIMEOUT_PENALTY_PER_ITEM

    // 计算积压惩罚（超过阈值才开始扣分）
    const excessItems = Math.max(0, totalPending - HEALTH_CONFIG.BACKLOG_THRESHOLD)
    const backlogPenalty = excessItems * HEALTH_CONFIG.BACKLOG_PENALTY_PER_ITEM

    // 计算最终分数（最低0分）
    const rawScore = HEALTH_CONFIG.BASE_SCORE - timeoutPenalty - backlogPenalty
    const score = Math.max(HEALTH_CONFIG.MIN_SCORE, rawScore)

    // 确定健康状态
    let status
    if (score >= STATUS_THRESHOLDS.HEALTHY) {
      status = 'healthy'
    } else if (score >= STATUS_THRESHOLDS.WARNING) {
      status = 'warning'
    } else {
      status = 'critical'
    }

    return {
      score,
      status,
      components: {
        overdue_count: overdueCount,
        total_pending: totalPending,
        timeout_penalty: timeoutPenalty,
        backlog_penalty: backlogPenalty,
        backlog_threshold: HEALTH_CONFIG.BACKLOG_THRESHOLD
      }
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
  static async _calculateTrend(currentScore) {
    try {
      // 获取历史分数（24小时前的分数）
      const historyKey = `${KEY_PREFIX}${CACHE_KEY}_history`
      const historyData = await BusinessCacheHelper.get(historyKey)

      if (historyData && typeof historyData.score === 'number') {
        const previousScore = historyData.score
        const diff = currentScore - previousScore

        if (diff > 5) {
          return 'up' // 上升超过5分
        } else if (diff < -5) {
          return 'down' // 下降超过5分
        }
      }

      // 保存当前分数作为历史记录（TTL=1小时）
      await BusinessCacheHelper.set(historyKey, { score: currentScore }, 3600)

      return 'stable'
    } catch (error) {
      logger.warn('[待办健康度] 趋势计算失败', { error: error.message })
      return 'stable'
    }
  }

  /**
   * 获取健康度评分详情（包含各类别分析）
   *
   * @description 提供更详细的健康度分析，包括各类待办的健康贡献
   *
   * @returns {Promise<Object>} 详细健康度报告
   */
  static async getHealthScoreDetails() {
    try {
      const healthScore = await this.getHealthScore()

      // 计算各类别的健康贡献
      const categoryAnalysis = this._analyzeCategoryHealth(healthScore.details)

      return {
        ...healthScore,
        category_analysis: categoryAnalysis,
        recommendations: this._generateRecommendations(healthScore)
      }
    } catch (error) {
      logger.error('[待办健康度] 详情获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 分析各类别健康状况
   *
   * @private
   * @param {Object} details - 各类待办详情
   * @returns {Array<Object>} 类别健康分析
   */
  static _analyzeCategoryHealth(details) {
    const categories = [
      { key: 'consumption', name: '消费审核', data: details.consumption },
      { key: 'customer_service', name: '客服会话', data: details.customer_service },
      { key: 'risk_alerts', name: '风控告警', data: details.risk_alerts },
      { key: 'lottery_alerts', name: '抽奖告警', data: details.lottery_alerts }
    ]

    return categories.map(category => {
      const data = category.data || { count: 0, urgent_count: 0 }
      const urgentRatio = data.count > 0 ? data.urgent_count / data.count : 0

      let status = 'healthy'
      if (urgentRatio > 0.5) {
        status = 'critical'
      } else if (urgentRatio > 0.2) {
        status = 'warning'
      }

      return {
        key: category.key,
        name: category.name,
        count: data.count,
        urgent_count: data.urgent_count,
        urgent_ratio: Math.round(urgentRatio * 100),
        status
      }
    })
  }

  /**
   * 生成改进建议
   *
   * @private
   * @param {Object} healthScore - 健康度评分结果
   * @returns {Array<string>} 改进建议列表
   */
  static _generateRecommendations(healthScore) {
    const recommendations = []

    if (healthScore.status === 'critical') {
      recommendations.push('待办积压严重，建议立即处理超时项目')
      recommendations.push('考虑增派人手处理紧急待办事项')
    } else if (healthScore.status === 'warning') {
      recommendations.push('待办需要关注，建议优先处理超时项目')
    }

    const { components } = healthScore
    if (components.overdue_count > 0) {
      recommendations.push(`当前有 ${components.overdue_count} 个超时项目，建议优先处理`)
    }

    if (components.total_pending > components.backlog_threshold) {
      const excess = components.total_pending - components.backlog_threshold
      recommendations.push(`待办积压超出阈值 ${excess} 项，建议加快处理速度`)
    }

    if (recommendations.length === 0) {
      recommendations.push('待办状态良好，继续保持')
    }

    return recommendations
  }

  /**
   * 手动失效缓存
   *
   * @description 当待办状态发生变化时调用，触发缓存刷新
   *
   * @param {string} reason - 失效原因（用于日志记录）
   * @returns {Promise<boolean>} 是否成功失效缓存
   */
  static async invalidateCache(reason = 'manual_invalidation') {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`
    return await BusinessCacheHelper.del(cacheKey, reason)
  }
}

module.exports = PendingHealthScoreService
