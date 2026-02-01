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
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id } = context

    this.log('info', '开始奖品抽取', { user_id, lottery_campaign_id })

    try {
      /*
       * 🎯 Phase 1 新增：根据 decision_source 判断是否跳过正常抽取
       * preset/override/guarantee 模式使用预定奖品
       */
      const decision_data = this.getContextData(context, 'LoadDecisionSourceStage.data')
      const decision_source = decision_data?.decision_source || 'normal'

      // preset 模式：直接使用预设奖品
      if (decision_source === 'preset' && decision_data?.preset) {
        const preset = decision_data.preset
        const preset_stage_data = this.getContextData(context, 'LoadPresetStage.data')
        const preset_prize = preset_stage_data?.preset_prize || preset

        this.log('info', '预设模式：使用预设奖品', {
          user_id,
          decision_source,
          lottery_prize_id: preset_prize.lottery_prize_id || preset.lottery_prize_id,
          prize_name: preset_prize.prize_name || '预设奖品'
        })

        return this.success({
          selected_prize: preset_prize,
          prize_random_value: 0,
          tier_total_weight: 0,
          prize_hit_range: [0, 0],
          tier_prize_count: 1,
          selected_tier: preset_prize.reward_tier || 'high',
          decision_source,
          skipped: true,
          skip_reason: 'preset_mode'
        })
      }

      // override 模式：根据干预配置选择奖品
      if (decision_source === 'override' && decision_data?.override) {
        const override = decision_data.override
        const override_type = override.setting_type || override.override_type
        const override_stage_data = this.getContextData(context, 'LoadOverrideStage.data')

        if (override_type === 'force_win' && override_stage_data?.override_prize) {
          const override_prize = override_stage_data.override_prize
          this.log('info', '干预模式（强制中奖）：使用指定奖品', {
            user_id,
            decision_source,
            lottery_prize_id: override_prize.lottery_prize_id,
            prize_name: override_prize.prize_name
          })

          return this.success({
            selected_prize: override_prize,
            prize_random_value: 0,
            tier_total_weight: 0,
            prize_hit_range: [0, 0],
            tier_prize_count: 1,
            selected_tier: override_prize.reward_tier || 'high',
            decision_source,
            skipped: true,
            skip_reason: 'override_force_win'
          })
        }

        // force_lose 模式：使用 fallback 奖品
        if (override_type === 'force_lose') {
          const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
          const fallback_prize = campaign_data?.fallback_prize

          if (fallback_prize) {
            this.log('info', '干预模式（强制不中）：使用兜底奖品', {
              user_id,
              decision_source,
              lottery_prize_id: fallback_prize.lottery_prize_id,
              prize_name: fallback_prize.prize_name
            })

            return this.success({
              selected_prize: fallback_prize,
              prize_random_value: 0,
              tier_total_weight: 0,
              prize_hit_range: [0, 0],
              tier_prize_count: 1,
              selected_tier: 'fallback',
              decision_source,
              skipped: true,
              skip_reason: 'override_force_lose'
            })
          }
        }
      }

      // guarantee 模式：使用保底奖品
      if (decision_source === 'guarantee' && decision_data?.guarantee_triggered) {
        const guarantee_data = this.getContextData(context, 'GuaranteeStage.data')
        const guarantee_prize = guarantee_data?.guarantee_prize

        if (guarantee_prize) {
          this.log('info', '保底模式：使用保底奖品', {
            user_id,
            decision_source,
            lottery_prize_id: guarantee_prize.lottery_prize_id,
            prize_name: guarantee_prize.prize_name
          })

          return this.success({
            selected_prize: guarantee_prize,
            prize_random_value: 0,
            tier_total_weight: 0,
            prize_hit_range: [0, 0],
            tier_prize_count: 1,
            selected_tier: guarantee_prize.reward_tier || 'high',
            decision_source,
            skipped: true,
            skip_reason: 'guarantee_mode'
          })
        }
      }

      // normal 模式：继续正常的奖品抽取流程

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
        throw this.createError(`选中档位 ${selected_tier} 没有可用奖品`, 'NO_PRIZES_IN_TIER', true)
      }

      // 执行奖品抽取
      const { selected_prize, random_value, total_weight, hit_range } = this._pickPrize(tier_prizes)

      if (!selected_prize) {
        throw this.createError('奖品抽取失败：无法选中奖品', 'PRIZE_PICK_FAILED', true)
      }

      // 构建返回数据
      const result = {
        selected_prize,
        prize_random_value: random_value,
        tier_total_weight: total_weight,
        prize_hit_range: hit_range,
        tier_prize_count: tier_prizes.length,
        selected_tier
      }

      this.log('info', '奖品抽取完成', {
        user_id,
        lottery_campaign_id,
        selected_tier,
        lottery_prize_id: selected_prize.lottery_prize_id,
        prize_name: selected_prize.prize_name,
        prize_value_points: selected_prize.prize_value_points,
        random_value_percent:
          total_weight > 0 ? ((random_value / total_weight) * 100).toFixed(4) + '%' : '0%',
        hit_range
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '奖品抽取失败', {
        user_id,
        lottery_campaign_id,
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
        lottery_prize_id: selected_prize.lottery_prize_id,
        random_value,
        total_weight
      })
    }

    return {
      selected_prize,
      random_value,
      total_weight,
      hit_range
    }
  }
}

module.exports = PrizePickStage
