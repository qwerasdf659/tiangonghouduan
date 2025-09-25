/**
 * 抽奖历史服务 - 处理历史记录查询相关业务逻辑
 * 从 routes/v4/unified-engine/lottery.js 中提取的历史记录相关业务逻辑
 *
 * @description 基于snake_case命名格式的抽奖历史服务
 * @version 4.0.0
 * @date 2025-09-24
 */

const models = require('../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../utils/timeHelper')
const Logger = require('../UnifiedLotteryEngine/utils/Logger')

class LotteryHistoryService {
  constructor () {
    this.logger = Logger.create('LotteryHistoryService')
  }

  /**
   * 获取用户抽奖历史记录
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 历史记录数据
   */
  async get_user_lottery_history (user_id, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        start_date = null,
        end_date = null,
        prize_type = null,
        strategy_type = null
      } = options

      // 构建查询条件
      const where_conditions = { user_id }

      // 日期范围过滤
      if (start_date && end_date) {
        where_conditions.created_at = {
          [Op.between]: [start_date, end_date]
        }
      } else if (start_date) {
        where_conditions.created_at = {
          [Op.gte]: start_date
        }
      } else if (end_date) {
        where_conditions.created_at = {
          [Op.lte]: end_date
        }
      }

      // 奖品类型过滤
      if (prize_type) {
        where_conditions.prize_type = prize_type
      }

      // 策略类型过滤（如果有相关字段）
      if (strategy_type) {
        where_conditions.strategy_type = strategy_type
      }

      // 执行查询
      const { count, rows } = await models.LotteryDraw.findAndCountAll({
        where: where_conditions,
        include: [
          {
            model: models.LotteryPrize,
            as: 'prize',
            required: false
          },
          {
            model: models.LotteryCampaign,
            as: 'campaign',
            required: false,
            attributes: ['id', 'name', 'status']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      })

      // 处理返回数据
      const processed_records = rows.map(record => this.format_lottery_record(record))

      return {
        total_count: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / parseInt(limit)),
        records: processed_records,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      this.logger.error('获取用户抽奖历史失败', { user_id, options, error: error.message })
      throw error
    }
  }

  /**
   * 获取批量抽奖历史
   * @param {string} batch_id - 批量ID
   * @returns {Object} 批量抽奖历史
   */
  async get_batch_lottery_history (batch_id) {
    try {
      const records = await models.LotteryDraw.findAll({
        where: { batch_id },
        include: [
          {
            model: models.LotteryPrize,
            as: 'prize',
            required: false
          }
        ],
        order: [['created_at', 'ASC']]
      })

      if (!records || records.length === 0) {
        throw new Error('批量抽奖记录不存在')
      }

      const processed_records = records.map(record => this.format_lottery_record(record))

      return {
        batch_id,
        total_count: records.length,
        success_count: records.filter(r => r.is_winner).length,
        records: processed_records,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      this.logger.error('获取批量抽奖历史失败', { batch_id, error: error.message })
      throw error
    }
  }

  /**
   * 获取用户抽奖统计信息
   * @param {number} user_id - 用户ID
   * @param {Object} date_range - 日期范围
   * @returns {Object} 统计信息
   */
  async get_user_lottery_statistics (user_id, date_range = {}) {
    try {
      const { start_date, end_date } = date_range

      // 构建查询条件
      const where_conditions = { user_id }
      if (start_date && end_date) {
        where_conditions.created_at = {
          [Op.between]: [start_date, end_date]
        }
      }

      // 总抽奖次数
      const total_draws = await models.LotteryDraw.count({
        where: where_conditions
      })

      // 中奖次数
      const winning_draws = await models.LotteryDraw.count({
        where: {
          ...where_conditions,
          is_winner: true
        }
      })

      // 按奖品类型统计
      const prize_type_stats = await models.LotteryDraw.findAll({
        where: {
          ...where_conditions,
          is_winner: true
        },
        attributes: [
          'prize_type',
          [models.sequelize.fn('COUNT', models.sequelize.col('*')), 'count']
        ],
        group: ['prize_type']
      })

      // 最近中奖记录
      const recent_wins = await models.LotteryDraw.findAll({
        where: {
          ...where_conditions,
          is_winner: true
        },
        include: [
          {
            model: models.LotteryPrize,
            as: 'prize',
            required: false
          }
        ],
        order: [['created_at', 'DESC']],
        limit: 5
      })

      return {
        user_id,
        total_draws,
        winning_draws,
        winning_rate: total_draws > 0 ? (winning_draws / total_draws * 100).toFixed(2) + '%' : '0%',
        prize_type_distribution: prize_type_stats.map(stat => ({
          prize_type: stat.prize_type,
          count: parseInt(stat.getDataValue('count'))
        })),
        recent_wins: recent_wins.map(win => this.format_lottery_record(win)),
        date_range,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      this.logger.error('获取用户抽奖统计失败', { user_id, date_range, error: error.message })
      throw error
    }
  }

  /**
   * 获取今日抽奖统计
   * @param {number} user_id - 用户ID
   * @returns {Object} 今日统计
   */
  async get_today_lottery_statistics (user_id) {
    try {
      const today_start = BeijingTimeHelper.getTodayStart()
      const today_end = BeijingTimeHelper.getTodayEnd()

      return await this.get_user_lottery_statistics(user_id, {
        start_date: today_start,
        end_date: today_end
      })
    } catch (error) {
      this.logger.error('获取今日抽奖统计失败', { user_id, error: error.message })
      throw error
    }
  }

  /**
   * 格式化抽奖记录
   * @param {Object} record - 原始记录
   * @returns {Object} 格式化后的记录
   */
  format_lottery_record (record) {
    const formatted_record = {
      id: record.id,
      user_id: record.user_id,
      campaign_id: record.campaign_id,
      prize_id: record.prize_id,
      is_winner: record.is_winner,
      prize_type: record.prize_type,
      prize_value: record.prize_value,
      draw_time: record.created_at,
      batch_id: record.batch_id || null,
      strategy_type: record.strategy_type || null
    }

    // 添加奖品信息
    if (record.prize) {
      formatted_record.prize_info = {
        name: record.prize.name,
        description: record.prize.description,
        image_url: record.prize.image_url,
        rarity: record.prize.rarity
      }
    }

    // 添加活动信息
    if (record.campaign) {
      formatted_record.campaign_info = {
        name: record.campaign.name,
        status: record.campaign.status
      }
    }

    // 奖品类型显示名称
    formatted_record.prize_type_display = this.get_prize_type_name(record.prize_type)

    return formatted_record
  }

  /**
   * 获取奖品类型显示名称
   * @param {string} type - 奖品类型
   * @returns {string} 显示名称
   */
  get_prize_type_name (type) {
    const type_map = {
      points: '积分奖励',
      product: '实物奖品',
      virtual: '虚拟奖品',
      coupon: '优惠券',
      none: '谢谢参与'
    }
    return type_map[type] || '未知类型'
  }

  /**
   * 验证历史查询参数
   * @param {Object} params - 查询参数
   * @returns {Object} 验证结果
   */
  validate_history_params (params) {
    try {
      const { user_id, page, limit } = params

      if (!user_id || typeof user_id !== 'number') {
        return { valid: false, error: '用户ID无效' }
      }

      if (page && (isNaN(page) || parseInt(page) < 1)) {
        return { valid: false, error: '页码参数无效' }
      }

      if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
        return { valid: false, error: '限制数量参数无效(1-100)' }
      }

      return { valid: true }
    } catch (error) {
      this.logger.error('历史查询参数验证失败', { params, error: error.message })
      return { valid: false, error: error.message }
    }
  }
}

module.exports = LotteryHistoryService
