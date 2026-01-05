/**
 * 抽奖记录数据格式化工具类
 * 负责抽奖记录的数据格式化、类型转换和显示逻辑
 *
 * V4.0语义更新（2026-01-01）：
 * - 删除 is_winner 相关逻辑（"中/没中"二分法已废弃）
 * - 新增 reward_tier 相关逻辑（奖励档位：low/mid/high）
 * - 统计方式从"中奖率"改为"档位分布"
 */

/**
 * 奖励档位配置（可通过数据库配置覆盖）
 * @constant {Object}
 */
const REWARD_TIER_CONFIG = {
  low: { code: 'low', name: '低档奖励', minPoints: 0, maxPoints: 299, color: '#999999' },
  mid: { code: 'mid', name: '中档奖励', minPoints: 300, maxPoints: 699, color: '#4A90E2' },
  high: { code: 'high', name: '高档奖励', minPoints: 700, maxPoints: null, color: '#FFD700' }
}

/**
 * 抽奖记录格式化工具类
 *
 * 功能：
 * - 格式化抽奖记录为完整JSON格式
 * - 提供 reward_tier 档位相关的辅助方法
 * - 根据 prize_value_points 推断奖励档位
 *
 * V4.0语义更新：
 * - 使用 reward_tier (low/mid/high) 替代原 is_winner
 * - 档位规则：low(<300) / mid(300-699) / high(>=700)
 */
class LotteryDrawFormatter {
  /**
   * 格式化抽奖记录为完整JSON格式
   * @param {Object} lotteryDraw - 抽奖记录实例
   * @returns {Object} 格式化后的数据
   */
  static formatToJSON (lotteryDraw) {
    const values = { ...lotteryDraw.get() }

    // 格式化时间显示
    if (values.created_at) {
      values.created_at_formatted = new Date(values.created_at).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai'
      })
    }

    // 添加抽奖类型显示文本
    values.draw_type_text = this.getDrawTypeText(values.draw_type)

    // 添加奖品类型显示文本
    values.prize_type_text = this.getPrizeTypeText(values.prize_type)

    // V4.0新增：添加奖励档位显示文本
    values.reward_tier_text = this.getRewardTierText(values.reward_tier)
    values.reward_tier_color = this.getRewardTierColor(values.reward_tier)

    // 解析JSON字段
    values.draw_config = this.parseJSONField(values.draw_config)
    values.result_metadata = this.parseJSONField(values.result_metadata)
    values.algorithm_data = this.parseJSONField(values.algorithm_data)
    values.user_context = this.parseJSONField(values.user_context)
    values.draw_metadata = this.parseJSONField(values.draw_metadata)

    return values
  }

  /**
   * 格式化抽奖记录为摘要格式（V4.0语义更新）
   * @param {Object} lotteryDraw - 抽奖记录实例
   * @returns {Object} 摘要格式数据
   */
  static formatToSummary (lotteryDraw) {
    return {
      draw_id: lotteryDraw.draw_id,
      user_id: lotteryDraw.user_id,
      campaign_id: lotteryDraw.campaign_id,
      prize_id: lotteryDraw.prize_id,
      // V4.0：使用 reward_tier 替代 is_winner
      reward_tier: lotteryDraw.reward_tier,
      reward_tier_text: this.getRewardTierText(lotteryDraw.reward_tier),
      reward_tier_color: this.getRewardTierColor(lotteryDraw.reward_tier),
      prize_status: lotteryDraw.prize_status,
      prize_status_name: this.getPrizeStatusText(lotteryDraw.prize_status),
      draw_time: lotteryDraw.created_at,
      is_prize_delivered: this.isPrizeDelivered(lotteryDraw.prize_status),
      is_prize_claimable: this.isPrizeClaimableByTier(
        lotteryDraw.reward_tier,
        lotteryDraw.prize_status
      )
    }
  }

  /**
   * 获取奖励档位显示文本（V4.0新增）
   * @param {string} rewardTier - 奖励档位code
   * @returns {string} 档位显示文本
   */
  static getRewardTierText (rewardTier) {
    const config = REWARD_TIER_CONFIG[rewardTier]
    return config ? config.name : '未知档位'
  }

  /**
   * 获取奖励档位颜色（V4.0新增）
   * @param {string} rewardTier - 奖励档位code
   * @returns {string} 档位颜色值
   */
  static getRewardTierColor (rewardTier) {
    const config = REWARD_TIER_CONFIG[rewardTier]
    return config ? config.color : '#999999'
  }

  /**
   * 根据奖品价值推断奖励档位（V4.0新增）
   * @param {number} prizeValuePoints - 奖品价值（积分）
   * @returns {string} 奖励档位code
   */
  static inferRewardTier (prizeValuePoints) {
    if (prizeValuePoints == null || prizeValuePoints < 300) {
      return 'low'
    } else if (prizeValuePoints < 700) {
      return 'mid'
    } else {
      return 'high'
    }
  }

  /**
   * 获取奖品状态显示文本
   * @param {string} prizeStatus - 奖品状态
   * @returns {string} 状态文本
   */
  static getPrizeStatusText (prizeStatus) {
    const statuses = {
      pending: '待发放',
      awarded: '已发放',
      delivered: '已配送',
      received: '已领取',
      expired: '已过期',
      cancelled: '已取消'
    }
    return statuses[prizeStatus] || '未知状态'
  }

  /**
   * 获取抽奖类型显示文本
   * @param {string} drawType - 抽奖类型
   * @returns {string} 类型文本
   */
  static getDrawTypeText (drawType) {
    const drawTypeMap = {
      single: '单次抽奖',
      triple: '三连抽',
      five: '五连抽',
      ten: '十连抽'
    }
    return drawTypeMap[drawType] || drawType
  }

  /**
   * 获取奖品类型显示文本（V4.0：移除empty类型）
   * @param {string} prizeType - 奖品类型
   * @returns {string} 类型文本
   */
  static getPrizeTypeText (prizeType) {
    const prizeTypeMap = {
      points: '积分奖励',
      product: '实物奖品',
      coupon: '优惠券',
      special: '特殊奖品',
      physical: '实物奖品',
      virtual: '虚拟奖品',
      service: '服务类奖品'
    }
    return prizeTypeMap[prizeType] || prizeType
  }

  /**
   * 检查奖品是否已发放
   * @param {string} prizeStatus - 奖品状态
   * @returns {boolean} 是否已发放
   */
  static isPrizeDelivered (prizeStatus) {
    return ['awarded', 'delivered', 'received'].includes(prizeStatus)
  }

  /**
   * 根据档位检查奖品是否可领取（V4.0新增，替代原 isPrizeClaimable）
   * @param {string} rewardTier - 奖励档位
   * @param {string} prizeStatus - 奖品状态
   * @returns {boolean} 是否可领取
   */
  static isPrizeClaimableByTier (rewardTier, prizeStatus) {
    // 只有高档奖励且已发放未领取时才可领取
    return rewardTier === 'high' && prizeStatus === 'awarded'
  }

  /**
   * 安全解析JSON字段
   * @param {string|Object} field - 需要解析的字段
   * @returns {Object|string} 解析后的数据
   */
  static parseJSONField (field) {
    if (!field) return field

    if (typeof field === 'string') {
      try {
        return JSON.parse(field)
      } catch (e) {
        // JSON解析失败，保持原值
        return field
      }
    }

    return field
  }

  /**
   * 格式化统计数据（V4.0：使用档位分布替代中奖率）
   * @param {Object} stats - 原始统计数据
   * @returns {Object} 格式化后的统计数据
   */
  static formatStats (stats) {
    const totalDraws = stats.total_draws || 0
    return {
      total_draws: totalDraws,
      // V4.0：档位分布统计
      tier_distribution: {
        low: stats.low_count || 0,
        mid: stats.mid_count || 0,
        high: stats.high_count || 0
      },
      tier_percentage: {
        low: totalDraws > 0 ? (((stats.low_count || 0) / totalDraws) * 100).toFixed(2) : '0.00',
        mid: totalDraws > 0 ? (((stats.mid_count || 0) / totalDraws) * 100).toFixed(2) : '0.00',
        high: totalDraws > 0 ? (((stats.high_count || 0) / totalDraws) * 100).toFixed(2) : '0.00'
      },
      pity_wins: stats.pity_wins || 0,
      total_cost: stats.total_cost || 0,
      points_won: stats.points_won || 0
    }
  }

  /**
   * 格式化批量分析数据（V4.0：使用档位分布）
   * @param {Object} analysisData - 原始分析数据
   * @returns {Object} 格式化后的分析数据
   */
  static formatBatchAnalysis (analysisData) {
    const totalDraws = analysisData.total_draws || 0
    return {
      total_draws: totalDraws,
      // V4.0：档位分布替代中奖统计
      tier_distribution: {
        low: analysisData.low_count || 0,
        mid: analysisData.mid_count || 0,
        high: analysisData.high_count || 0
      },
      high_tier_rate:
        totalDraws > 0 ? (((analysisData.high_count || 0) / totalDraws) * 100).toFixed(2) : '0.00',
      prize_delivery_stats: analysisData.prize_delivery_stats || {}
    }
  }

  /**
   * 格式化列表数据（用于API返回）
   * @param {Array} records - 抽奖记录数组
   * @param {Object} options - 格式化选项
   * @returns {Array} 格式化后的记录数组
   */
  static formatList (records, options = {}) {
    const { format = 'summary', includePrize = false } = options

    return records.map(record => {
      let formattedRecord

      if (format === 'full') {
        formattedRecord = this.formatToJSON(record)
      } else {
        formattedRecord = this.formatToSummary(record)
      }

      // 包含奖品信息
      if (includePrize && record.prize) {
        formattedRecord.prize_info = {
          name: record.prize.name,
          description: record.prize.description,
          image: record.prize.image,
          type: record.prize.type,
          value: record.prize.value
        }
      }

      return formattedRecord
    })
  }
}

module.exports = LotteryDrawFormatter
