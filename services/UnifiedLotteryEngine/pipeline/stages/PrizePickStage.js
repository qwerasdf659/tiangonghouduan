'use strict'

/**
 * PrizePickStage - 奖品抽取 Stage
 *
 * 职责：
 * 1. 在选定档位内根据奖品权重抽取具体奖品
 * 2. 使用整数权重系统（win_weight 字段）
 * 3. 加权随机选择算法
 * 4. 记录抽取过程中的随机数和命中区间
 *
 * 输出到上下文：
 * - selected_prize: 选中的奖品
 * - prize_random_value: 奖品抽取使用的随机数
 * - tier_total_weight: 档位内总权重
 * - prize_hit_range: 命中区间 [start, end]
 *
 * 设计原则：
 * - 严格使用整数权重（win_weight 字段）
 * - 不做权重归一化，按配置值抽取
 * - 确保抽取结果可追溯、可审计
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/PrizePickStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')

/**
 * 奖品抽取 Stage
 */
class PrizePickStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('PrizePickStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行奖品抽取
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id } = context

    this.log('info', '开始奖品抽取', { user_id, campaign_id })

    try {
      // 获取奖品池信息（从 BuildPrizePoolStage 的结果中）
      const prize_pool_data = this.getContextData(context, 'BuildPrizePoolStage.data')
      if (!prize_pool_data) {
        throw this.createError(
          '缺少奖品池数据，请确保 BuildPrizePoolStage 已执行',
          'MISSING_PRIZE_POOL_DATA',
          true
        )
      }

      const prizes_by_tier = prize_pool_data.prizes_by_tier

      // 获取选中的档位（从 TierPickStage 的结果中）
      const tier_pick_data = this.getContextData(context, 'TierPickStage.data')
      if (!tier_pick_data) {
        throw this.createError(
          '缺少档位抽取数据，请确保 TierPickStage 已执行',
          'MISSING_TIER_PICK_DATA',
          true
        )
      }

      const selected_tier = tier_pick_data.selected_tier

      // 获取选中档位的奖品列表
      const tier_prizes = prizes_by_tier[selected_tier] || []

      if (tier_prizes.length === 0) {
        throw this.createError(
          `选中档位 ${selected_tier} 没有可用奖品`,
          'NO_PRIZES_IN_TIER',
          true
        )
      }

      // 执行奖品抽取
      const {
        selected_prize,
        random_value,
        total_weight,
        hit_range
      } = this._pickPrize(tier_prizes)

      if (!selected_prize) {
        throw this.createError(
          '奖品抽取失败：无法选中奖品',
          'PRIZE_PICK_FAILED',
          true
        )
      }

      // 构建返回数据
      const result = {
        selected_prize: selected_prize,
        prize_random_value: random_value,
        tier_total_weight: total_weight,
        prize_hit_range: hit_range,
        tier_prize_count: tier_prizes.length,
        selected_tier: selected_tier
      }

      this.log('info', '奖品抽取完成', {
        user_id,
        campaign_id,
        selected_tier,
        prize_id: selected_prize.prize_id,
        prize_name: selected_prize.prize_name,
        prize_value_points: selected_prize.prize_value_points,
        random_value_percent: total_weight > 0
          ? (random_value / total_weight * 100).toFixed(4) + '%'
          : '0%',
        hit_range: hit_range
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '奖品抽取失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 在档位内抽取奖品
   *
   * 算法：加权随机选择
   * 1. 计算档位内所有奖品的总权重
   * 2. 生成 [0, total_weight) 范围内的随机数
   * 3. 累加权重直到覆盖随机数
   *
   * @param {Array} prizes - 档位内的奖品列表
   * @returns {Object} { selected_prize, random_value, total_weight, hit_range }
   * @private
   */
  _pickPrize(prizes) {
    // 计算总权重
    const total_weight = prizes.reduce((sum, prize) => {
      return sum + (prize.win_weight || 0)
    }, 0)

    // 如果总权重为0，随机选择一个奖品
    if (total_weight === 0) {
      this.log('warn', '档位内所有奖品权重为0，随机选择')
      const random_index = Math.floor(Math.random() * prizes.length)
      return {
        selected_prize: prizes[random_index],
        random_value: 0,
        total_weight: 0,
        hit_range: [0, 0]
      }
    }

    // 生成随机数
    const random_value = Math.random() * total_weight
    let cumulative = 0
    let selected_prize = null
    let hit_range = [0, 0]

    // 累加权重直到覆盖随机数
    for (const prize of prizes) {
      const prize_weight = prize.win_weight || 0
      const range_start = cumulative
      cumulative += prize_weight
      const range_end = cumulative

      if (random_value < cumulative) {
        selected_prize = prize
        hit_range = [range_start, range_end]
        break
      }
    }

    // 兜底：如果没有选中（浮点数精度问题），选择最后一个
    if (!selected_prize && prizes.length > 0) {
      selected_prize = prizes[prizes.length - 1]
      const last_weight = selected_prize.win_weight || 0
      hit_range = [total_weight - last_weight, total_weight]

      this.log('debug', '使用兜底选择最后一个奖品', {
        prize_id: selected_prize.prize_id,
        random_value,
        total_weight
      })
    }

    return {
      selected_prize: selected_prize,
      random_value: random_value,
      total_weight: total_weight,
      hit_range: hit_range
    }
  }
}

module.exports = PrizePickStage

