/**
 * 抽奖记录数据格式化工具类
 * 负责抽奖记录的数据格式化、类型转换和显示逻辑
 * 从LotteryDraw模型中抽取的格式化职责
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

    // 解析JSON字段
    values.draw_config = this.parseJSONField(values.draw_config)
    values.result_metadata = this.parseJSONField(values.result_metadata)
    values.algorithm_data = this.parseJSONField(values.algorithm_data)
    values.user_context = this.parseJSONField(values.user_context)
    values.draw_metadata = this.parseJSONField(values.draw_metadata)

    return values
  }

  /**
   * 格式化抽奖记录为摘要格式
   * @param {Object} lotteryDraw - 抽奖记录实例
   * @returns {Object} 摘要格式数据
   */
  static formatToSummary (lotteryDraw) {
    return {
      draw_id: lotteryDraw.draw_id,
      user_id: lotteryDraw.user_id,
      campaign_id: lotteryDraw.campaign_id,
      prize_id: lotteryDraw.prize_id,
      is_winner: lotteryDraw.is_winner,
      winner_status_text: this.getDrawResultText(lotteryDraw.is_winner),
      prize_status: lotteryDraw.prize_status,
      prize_status_name: this.getPrizeStatusText(lotteryDraw.prize_status),
      draw_time: lotteryDraw.created_at,
      is_prize_delivered: this.isPrizeDelivered(lotteryDraw.prize_status),
      is_prize_claimable: this.isPrizeClaimable(lotteryDraw.is_winner, lotteryDraw.prize_status)
    }
  }

  /**
   * 获取抽奖结果显示文本
   * @param {Boolean} isWinner - 是否中奖
   * @returns {String} 结果文本
   */
  static getDrawResultText (isWinner) {
    return isWinner ? '中奖' : '未中奖'
  }

  /**
   * 获取奖品状态显示文本
   * @param {String} prizeStatus - 奖品状态
   * @returns {String} 状态文本
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
   * @param {String} drawType - 抽奖类型
   * @returns {String} 类型文本
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
   * 获取奖品类型显示文本
   * @param {String} prizeType - 奖品类型
   * @returns {String} 类型文本
   */
  static getPrizeTypeText (prizeType) {
    const prizeTypeMap = {
      points: '积分奖励',
      product: '实物奖品',
      coupon: '优惠券',
      special: '特殊奖品'
    }
    return prizeTypeMap[prizeType] || prizeType
  }

  /**
   * 检查奖品是否已发放
   * @param {String} prizeStatus - 奖品状态
   * @returns {Boolean} 是否已发放
   */
  static isPrizeDelivered (prizeStatus) {
    return ['awarded', 'delivered', 'received'].includes(prizeStatus)
  }

  /**
   * 检查奖品是否可领取
   * @param {Boolean} isWinner - 是否中奖
   * @param {String} prizeStatus - 奖品状态
   * @returns {Boolean} 是否可领取
   */
  static isPrizeClaimable (isWinner, prizeStatus) {
    return isWinner && prizeStatus === 'awarded'
  }

  /**
   * 安全解析JSON字段
   * @param {String|Object} field - 需要解析的字段
   * @returns {Object|String} 解析后的数据
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
   * 格式化统计数据
   * @param {Object} stats - 原始统计数据
   * @returns {Object} 格式化后的统计数据
   */
  static formatStats (stats) {
    return {
      total_draws: stats.total_draws || 0,
      wins: stats.wins || 0,
      pity_wins: stats.pity_wins || 0,
      total_cost: stats.total_cost || 0,
      points_won: stats.points_won || 0,
      win_rate: stats.total_draws > 0 ? ((stats.wins / stats.total_draws) * 100).toFixed(2) : '0.00'
    }
  }

  /**
   * 格式化批量分析数据
   * @param {Object} analysisData - 原始分析数据
   * @returns {Object} 格式化后的分析数据
   */
  static formatBatchAnalysis (analysisData) {
    const winRate = analysisData.total_draws > 0
      ? ((analysisData.win_draws / analysisData.total_draws) * 100).toFixed(2)
      : '0.00'

    return {
      total_draws: analysisData.total_draws,
      win_draws: analysisData.win_draws,
      win_rate: winRate,
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
