'use strict'

/**
 * BuildPrizePoolStage - 构建奖品池 Stage
 *
 * 职责：
 * 1. 根据库存和权重过滤奖品（排除缺货/零权重奖品）
 * 2. 按资源类型统一过滤奖品（DIAMOND→配额检查，其余→预算检查）
 * 3. 根据用户总中奖次数过滤奖品
 * 4. 按档位分组奖品（high/mid/low/fallback）
 * 5. 确保有兜底奖品
 * 6. 计算可用档位并构建返回数据
 *
 * 输出到上下文：
 * - available_prizes: 可用奖品列表
 * - prizes_by_tier: 按档位分组的奖品 { high: [], mid: [], low: [], fallback: [] }
 * - available_tiers: 可用的档位列表
 * - allowed_tiers: 预算分层允许的档位（来自 BudgetContextStage，保留用于分析）
 * - has_valuable_prizes: 是否有有价值的奖品可用
 *
 * 架构重构（2026-03-04）：
 * - 合并 _filterByBudget + _filterByDiamondQuota → _filterByResourceEligibility（资源级过滤）
 * - 删除 _filterByAllowedTiers 调用（档位系统只管概率分配，不做准入门控）
 * - 资格检查下沉到单个奖品，按资源类型独立判断（行业最佳实践）
 *
 * 设计原则：
 * - 读操作Stage，不执行任何写操作
 * - 档位系统只管概率分配，不做准入门控
 * - 资格检查由 _filterByResourceEligibility 唯一负责
 * - 保证每次抽奖都能选出一个奖品（100%中奖）
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/BuildPrizePoolStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-20 集成预算分层限制
 * @updated 2026-03-04 去预算门控改资源级过滤（合并 _filterByBudget + _filterByDiamondQuota → _filterByResourceEligibility）
 */

const BaseStage = require('./BaseStage')
const { sequelize } = require('../../../../models')
const BalanceService = require('../../../asset/BalanceService')

/**
 * 档位定义（降级顺序）
 */
const TIER_ORDER = ['high', 'mid', 'low', 'fallback']

/**
 * 构建奖品池 Stage
 */
class BuildPrizePoolStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('BuildPrizePoolStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行奖品池构建
   *
   * 集成预算分层限制：根据 budget_tier 限制可参与的档位
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id } = context

    this.log('info', '开始构建奖品池', { user_id, lottery_campaign_id })

    try {
      /* 获取活动配置和奖品列表（从 LoadCampaignStage 的结果中） */
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
      if (!campaign_data) {
        throw this.createError(
          '缺少活动配置数据，请确保 LoadCampaignStage 已执行',
          'MISSING_CAMPAIGN_DATA',
          true
        )
      }

      const prizes = campaign_data.prizes || []
      const fallback_prize = campaign_data.fallback_prize

      /* 获取预算上下文（从 BudgetContextStage 的结果中） */
      const budget_data = this.getContextData(context, 'BudgetContextStage.data')
      const budget_before = budget_data?.budget_before || 0
      const budget_mode = budget_data?.budget_mode || 'none'

      /* 获取预算分层信息（新增：策略引擎集成） */
      const budget_tier = budget_data?.budget_tier || 'B0'
      const allowed_tiers = budget_data?.available_tiers || ['fallback']
      const pressure_tier = budget_data?.pressure_tier || 'P1'
      const effective_budget = budget_data?.effective_budget || 0

      this.log('info', '奖品池构建参数', {
        lottery_campaign_id,
        total_prizes: prizes.length,
        budget_before,
        effective_budget,
        budget_mode,
        budget_tier,
        pressure_tier,
        allowed_tiers
      })

      /* 1. 根据库存和每日上限过滤奖品 */
      let filtered_prizes = await this._filterByAvailability(prizes)

      /* 2. 按资源类型统一过滤（合并原 _filterByBudget + _filterByDiamondQuota） */
      if (budget_mode !== 'none') {
        filtered_prizes = await this._filterByResourceEligibility(
          filtered_prizes,
          user_id,
          budget_before
        )
      }

      /* 3. 根据用户总中奖次数上限过滤奖品 */
      filtered_prizes = await this._filterByUserWins(filtered_prizes, user_id)

      /* 4. 按档位分组 */
      const prizes_by_tier = this._groupByTier(filtered_prizes)

      /* 5. 确保有兜底奖品 */
      if (prizes_by_tier.fallback.length === 0 && fallback_prize) {
        prizes_by_tier.fallback.push(fallback_prize)
      }

      /*
       * 6. 档位门控已移除（2026-03-04 架构重构）
       *    资格检查由 _filterByResourceEligibility 唯一负责，档位系统只管概率分配。
       *    原 _filterByAllowedTiers 按 BudgetTier 整档删除的逻辑导致 DIAMOND 等
       *    免费奖品被预算门控连带封杀，违背资源隔离原则。
       */
      const filtered_prizes_by_tier = prizes_by_tier

      /* 7. 计算可用档位 */
      const available_tiers = this._getAvailableTiers(filtered_prizes_by_tier)

      /* 8. 判断是否有有价值的奖品 */
      const has_valuable_prizes = this._hasValuablePrizes(filtered_prizes_by_tier)

      /* 10. 构建返回数据 */
      const result = {
        available_prizes: filtered_prizes,
        prizes_by_tier: filtered_prizes_by_tier,
        available_tiers,
        allowed_tiers,
        has_valuable_prizes,
        total_available: filtered_prizes.length,
        tier_counts: {
          high: filtered_prizes_by_tier.high.length,
          mid: filtered_prizes_by_tier.mid.length,
          low: filtered_prizes_by_tier.low.length,
          fallback: filtered_prizes_by_tier.fallback.length
        },
        /* 策略引擎分层信息（传递给后续 Stage） */
        budget_tier,
        pressure_tier,
        effective_budget
      }

      this.log('info', '奖品池构建完成', {
        lottery_campaign_id,
        user_id,
        total_available: filtered_prizes.length,
        available_tiers,
        allowed_tiers,
        budget_tier,
        pressure_tier,
        tier_counts: result.tier_counts,
        has_valuable_prizes
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '奖品池构建失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 根据库存和每日中奖上限过滤奖品
   *
   * @param {Array} prizes - 奖品列表
   * @returns {Promise<Array>} 过滤后的奖品列表
   * @private
   */
  async _filterByAvailability(prizes) {
    const available = []

    for (const prize of prizes) {
      // 检查库存（null 表示无限库存）
      if (prize.stock_quantity !== null && prize.stock_quantity <= 0) {
        this.log('debug', '奖品库存不足，已排除', {
          lottery_prize_id: prize.lottery_prize_id,
          prize_name: prize.prize_name,
          stock_quantity: prize.stock_quantity
        })
        continue
      }

      // 检查每日中奖上限（null 表示无限制）
      if (prize.max_daily_wins !== null) {
        const today_wins = prize.daily_win_count || 0
        if (today_wins >= prize.max_daily_wins) {
          this.log('debug', '奖品今日中奖次数已达上限，已排除', {
            lottery_prize_id: prize.lottery_prize_id,
            prize_name: prize.prize_name,
            today_wins,
            max_daily_wins: prize.max_daily_wins
          })
          continue
        }
      }

      // 检查概率是否大于0
      const win_weight = prize.win_weight || 0
      if (win_weight <= 0) {
        this.log('debug', '奖品中奖权重为0，已排除', {
          lottery_prize_id: prize.lottery_prize_id,
          prize_name: prize.prize_name
        })
        continue
      }

      available.push(prize)
    }

    return available
  }

  /**
   * 按资源类型统一过滤奖品（合并原 _filterByBudget + _filterByDiamondQuota）
   *
   * 每个奖品按自身消耗的资源类型独立判断资格：
   * - DIAMOND 奖品（material_asset_code='DIAMOND'）：仅受 DIAMOND_QUOTA 控制
   * - 保底奖品（prize_value_points=0 且非 DIAMOND）：永远通过
   * - 其余奖品（物理/券/积分/虚拟）：检查 BUDGET_POINTS 余额
   *
   * 设计原则：资格检查唯一关卡，按资源类型判断，不做档位级门控
   *
   * @param {Array} prizes - 奖品列表
   * @param {number} user_id - 用户ID
   * @param {number} budget_before - 用户当前 BUDGET_POINTS 余额
   * @returns {Promise<Array>} 过滤后的奖品列表
   * @private
   */
  async _filterByResourceEligibility(prizes, user_id, budget_before) {
    let user_diamond_quota = 0

    const AdminSystemService = require('../../../AdminSystemService')
    const diamond_quota_enabled = await AdminSystemService.getSettingValue(
      'points',
      'diamond_quota_enabled',
      true
    )

    if (diamond_quota_enabled) {
      try {
        await BalanceService.getOrCreateAccount({ user_id }, { transaction: null })
        const balance = await BalanceService.getBalance(
          { user_id, asset_code: 'DIAMOND_QUOTA' },
          { transaction: null }
        )
        user_diamond_quota = balance?.available_amount || 0
      } catch (error) {
        this.log('warn', '查询钻石配额失败，钻石奖品将跳过配额过滤', {
          user_id,
          error: error.message
        })
        user_diamond_quota = Infinity
      }
    } else {
      user_diamond_quota = Infinity
    }

    this.log('info', '资源级过滤参数', {
      user_id,
      budget_before,
      user_diamond_quota: user_diamond_quota === Infinity ? 'unlimited' : user_diamond_quota,
      diamond_quota_enabled,
      total_prizes: prizes.length
    })

    const result = prizes.filter(prize => {
      /* DIAMOND 奖品：仅受 DIAMOND_QUOTA 控制，不受 BUDGET_POINTS 影响 */
      if (prize.material_asset_code === 'DIAMOND' && prize.material_amount > 0) {
        const eligible = user_diamond_quota >= prize.material_amount
        if (!eligible) {
          this.log('debug', 'DIAMOND 奖品因配额不足被过滤', {
            lottery_prize_id: prize.lottery_prize_id,
            prize_name: prize.prize_name,
            material_amount: prize.material_amount,
            user_diamond_quota
          })
        }
        return eligible
      }

      /* 所有非 DIAMOND 奖品：统一用 budget_cost 判断（pvp 仅管分层阈值） */
      const budget_cost = prize.budget_cost || 0
      if (budget_cost === 0) return true

      const eligible = budget_before >= budget_cost
      if (!eligible) {
        this.log('debug', '奖品因预算不足被过滤', {
          lottery_prize_id: prize.lottery_prize_id,
          prize_name: prize.prize_name,
          budget_cost,
          budget_before
        })
      }
      return eligible
    })

    this.log('info', '资源级过滤完成', {
      user_id,
      before_count: prizes.length,
      after_count: result.length,
      filtered_count: prizes.length - result.length
    })

    return result
  }

  /* _filterByBudget 已于 2026-03-05 删除，由 _filterByResourceEligibility 完全取代 */

  /**
   * 按档位分组奖品
   *
   * 🔴 2026-02-15 修复：严格按 reward_tier 字段分组，不再因 prize_value_points=0 强制归入 fallback
   *
   * 修复根因：
   * - 原代码将所有 prize_value_points=0 的奖品强制归入 fallback 分组
   * - 导致 low 档位（所有零值奖品）变成空池
   * - low 的 80% 权重分配全部浪费（选中 low 后因无奖品被降级到 fallback）
   * - 间接导致 high 档位中奖率从设计值 5% 飙升到 64.8%
   *
   * 修复方案：
   * - 严格以数据库 reward_tier 字段为准进行分组
   * - 仅当 reward_tier 明确为 'fallback' 时才归入 fallback 组
   * - is_fallback 标记仅用于"当所有档位都无奖品时"的兜底识别，不改变分组归属
   *
   * @param {Array} prizes - 奖品列表
   * @returns {Object} 按档位分组的奖品 { high: [], mid: [], low: [], fallback: [] }
   * @private
   */
  _groupByTier(prizes) {
    const grouped = {
      high: [],
      mid: [],
      low: [],
      fallback: []
    }

    for (const prize of prizes) {
      const tier = prize.reward_tier || 'low'

      if (TIER_ORDER.includes(tier)) {
        /* 严格按 reward_tier 字段分组，不因 prize_value_points=0 而改变分组 */
        grouped[tier].push(prize)
      } else {
        /* 未知档位默认归入 low */
        grouped.low.push(prize)
      }
    }

    return grouped
  }

  /**
   * 获取可用的档位列表
   *
   * @param {Object} prizes_by_tier - 按档位分组的奖品
   * @returns {Array} 可用档位列表（按降级顺序）
   * @private
   */
  _getAvailableTiers(prizes_by_tier) {
    return TIER_ORDER.filter(tier => {
      const tier_prizes = prizes_by_tier[tier] || []
      return tier_prizes.length > 0
    })
  }

  /**
   * 判断是否有有价值的奖品
   *
   * @param {Object} prizes_by_tier - 按档位分组的奖品
   * @returns {boolean} 是否有有价值的奖品
   * @private
   */
  _hasValuablePrizes(prizes_by_tier) {
    /* 有价值的档位：high、mid、low */
    const valuable_tiers = ['high', 'mid', 'low']

    for (const tier of valuable_tiers) {
      const tier_prizes = prizes_by_tier[tier] || []
      /* 检查是否有 budget_cost > 0 的奖品（与过滤/扣减口径一致） */
      const has_valuable = tier_prizes.some(p => (p.budget_cost || 0) > 0)
      if (has_valuable) {
        return true
      }
    }

    return false
  }

  /**
   * 根据用户总中奖次数过滤奖品（跨日累计）
   *
   * 与 max_daily_wins 互补：
   * - max_daily_wins：每日上限，由 _filterByAvailability 检查
   * - max_user_wins：跨日总上限，由本方法检查
   *
   * @param {Array} prizes - 奖品列表
   * @param {number} user_id - 用户ID
   * @returns {Promise<Array>} 过滤后的奖品列表
   * @private
   */
  async _filterByUserWins(prizes, user_id) {
    const prizes_with_limit = prizes.filter(
      p => p.max_user_wins !== null && p.max_user_wins !== undefined
    )
    if (prizes_with_limit.length === 0) return prizes

    const prize_ids = prizes_with_limit.map(p => p.lottery_prize_id)

    let user_win_counts
    try {
      const [results] = await sequelize.query(
        `SELECT lottery_prize_id, COUNT(*) as win_count
         FROM lottery_draws
         WHERE user_id = ? AND lottery_prize_id IN (?)
         GROUP BY lottery_prize_id`,
        { replacements: [user_id, prize_ids] }
      )
      user_win_counts = new Map(results.map(r => [r.lottery_prize_id, parseInt(r.win_count)]))
    } catch (error) {
      this.log('warn', '查询用户历史中奖次数失败，跳过过滤', {
        user_id,
        error: error.message
      })
      return prizes
    }

    return prizes.filter(prize => {
      if (prize.max_user_wins === null || prize.max_user_wins === undefined) return true
      const user_wins = user_win_counts.get(prize.lottery_prize_id) || 0
      if (user_wins >= prize.max_user_wins) {
        this.log('debug', '奖品用户总中奖次数已达上限，已排除', {
          lottery_prize_id: prize.lottery_prize_id,
          prize_name: prize.prize_name,
          user_wins,
          max_user_wins: prize.max_user_wins
        })
        return false
      }
      return true
    })
  }
}

module.exports = BuildPrizePoolStage
