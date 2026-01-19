/**
 * 抽奖历史服务 - 处理历史记录查询相关业务逻辑
 * 提供用户抽奖历史查询、批量抽奖记录查询、抽奖统计等功能
 *
 * 业务场景：
 * - 用户查询自己的抽奖记录，了解历史中奖情况和奖品信息
 * - 批量抽奖后查询本次批量抽奖的所有记录，统一展示抽奖结果
 * - 运营人员查询用户抽奖统计数据，分析用户参与度和中奖率
 * - 提供今日抽奖统计，支持用户查看当天抽奖情况
 * - 辅助数据分析和运营决策，提供奖品分布、中奖率等指标
 *
 * 核心功能：
 * 1. 历史记录查询：支持分页、日期范围过滤、奖品类型过滤、策略类型过滤
 * 2. 批量抽奖记录：查询指定批量ID的所有抽奖记录，统计成功数量
 * 3. 用户统计信息：总抽奖次数、中奖次数、中奖率、奖品类型分布、最近中奖记录
 * 4. 今日统计：快捷查询今日抽奖统计数据
 * 5. 记录格式化：统一格式化抽奖记录，添加奖品信息、活动信息、显示名称
 * 6. 参数验证：验证查询参数的合法性，防止无效请求
 *
 * 集成模型：
 * - LotteryDraw：抽奖记录模型，存储每次抽奖的详细数据
 * - LotteryPrize：奖品模型，关联中奖奖品信息
 * - LotteryCampaign：抽奖活动模型，关联抽奖活动信息
 *
 * 集成技术：
 * - Sequelize ORM：数据库查询和关联查询
 * - BeijingTimeHelper：北京时间处理工具，确保时间统一性
 * - Logger：日志记录工具，记录查询日志和错误信息
 *
 * 使用方式：
 * ```javascript
 * const historyService = new LotteryHistoryService()
 *
 * // 查询用户抽奖历史
 * const history = await historyService.get_user_lottery_history(10001, {
 *   page: 1,
 *   limit: 20,
 *   start_date: '2025-10-01',
 *   end_date: '2025-10-30',
 *   prize_type: 'points'
 * })
 * logger.info('总记录数:', history.total_count)
 *
 * // 查询批量抽奖记录
 * const batchHistory = await historyService.get_batch_lottery_history('batch_12345')
 * logger.info('批量抽奖成功数:', batchHistory.success_count)
 *
 * // 查询用户统计信息
 * const stats = await historyService.get_user_lottery_statistics(10001, {
 *   start_date: '2025-10-01',
 *   end_date: '2025-10-30'
 * })
 * logger.info('中奖率:', stats.winning_rate)
 * ```
 *
 * 注意事项：
 * - 查询参数需要验证合法性，防止SQL注入和无效请求
 * - 日期范围查询建议设置合理的时间跨度，避免查询数据量过大影响性能
 * - 分页查询的limit参数建议限制在100以内，防止一次查询数据量过大
 * - 格式化后的记录中包含关联奖品和活动信息，可能为null需要前端处理
 *
 * @description 基于snake_case命名格式的抽奖历史服务
 * @version 4.0.0
 * @date 2025-09-24
 * @lastUpdate 2025年10月30日
 * @author Claude Sonnet 4.5
 */

const models = require('../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 抽奖历史服务类
 *
 * 业务场景：
 * - 提供统一的抽奖历史记录查询接口，支持用户和管理员查询历史抽奖数据
 * - 支持多维度查询：按用户、按时间范围、按奖品类型、按策略类型过滤
 * - 支持批量抽奖记录查询，统一展示一次批量抽奖的所有结果
 * - 提供用户抽奖统计分析，包括总次数、中奖次数、中奖率、奖品类型分布等
 * - 格式化抽奖记录，统一添加奖品信息、活动信息、显示名称，便于前端展示
 *
 * 核心功能：
 * - get_user_lottery_history: 分页查询用户抽奖历史，支持日期范围、奖品类型、策略类型过滤
 * - get_batch_lottery_history: 查询指定批量ID的所有抽奖记录，统计成功数量
 * - get_user_lottery_statistics: 统计用户抽奖数据，包括总次数、中奖次数、中奖率、奖品分布
 * - get_today_lottery_statistics: 快捷查询今日抽奖统计（基于北京时间）
 * - format_lottery_record: 格式化单条抽奖记录，添加奖品信息和活动信息
 * - validate_history_params: 验证查询参数合法性，防止无效请求和SQL注入
 *
 * 技术特点：
 * - 使用Sequelize ORM进行数据库查询，支持关联查询（奖品、活动信息）
 * - 集成BeijingTimeHelper统一处理时间，确保全系统使用北京时间
 * - 集成Logger记录查询日志和错误信息，便于问题追踪
 * - 支持分页查询，limit参数限制在100以内，防止一次查询数据量过大
 * - 统一返回格式，包含时间戳、分页信息、记录列表
 *
 * 数据模型关联：
 * - LotteryDraw（抽奖记录）- 主表
 * - LotteryPrize（奖品）- 关联查询，提供奖品详细信息
 * - LotteryCampaign（抽奖活动）- 关联查询，提供活动信息
 *
 * 使用示例：
 * ```javascript
 * const historyService = new LotteryHistoryService()
 *
 * // 查询用户抽奖历史（带过滤）
 * const history = await historyService.get_user_lottery_history(10001, {
 *   page: 1,
 *   limit: 20,
 *   start_date: '2025-10-01',
 *   end_date: '2025-10-30',
 *   prize_type: 'points'
 * })
 * logger.info('抽奖历史:', history.records)
 * logger.info('总记录数:', history.total_count)
 *
 * // 查询批量抽奖记录
 * const batchHistory = await historyService.get_batch_lottery_history('batch_12345')
 * logger.info('批量抽奖成功数:', batchHistory.success_count)
 *
 * // 查询用户统计信息
 * const stats = await historyService.get_user_lottery_statistics(10001)
 * logger.info('总抽奖次数:', stats.total_draws)
 * logger.info('中奖次数:', stats.winning_draws)
 * logger.info('中奖率:', stats.winning_rate)
 * ```
 *
 * 注意事项：
 * - 查询参数需要验证合法性，使用validate_history_params方法验证
 * - 日期范围查询建议设置合理时间跨度（如30天），避免查询数据量过大影响性能
 * - 分页查询的limit参数建议限制在100以内，系统会自动强制限制
 * - 格式化后的记录包含关联奖品和活动信息，可能为null需要前端处理
 * - 所有时间字段使用北京时间（GMT+8），确保时间一致性
 *
 * @class LotteryHistoryService
 * @description 抽奖历史服务，提供抽奖记录查询、统计、格式化等功能
 * @version 4.0.0
 * @date 2025-09-24
 * @lastUpdate 2025年11月1日
 * @author Claude Sonnet 4.5
 */
class LotteryHistoryService {
  /**
   * 构造函数 - 初始化抽奖历史服务
   *
   * 业务场景：创建抽奖历史服务实例，初始化日志记录器
   *
   * 业务规则：
   * - 每个服务实例独立管理自己的日志记录器
   * - 日志记录器模块名为'LotteryHistoryService'
   *
   * 初始化内容：
   * - logger: 日志记录器，用于记录查询日志和错误信息
   *
   * @example
   * const historyService = new LotteryHistoryService()
   * logger.info('抽奖历史服务已初始化')
   */
  constructor() {
    this.logger = require('../../utils/logger').logger
  }

  /**
   * 获取用户抽奖历史记录
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 历史记录数据
   */
  async get_user_lottery_history(user_id, options = {}) {
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
  async get_batch_lottery_history(batch_id) {
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
        // V4.0语义更新：统计高档奖励次数（替代原success_count）
        high_tier_count: records.filter(r => r.reward_tier === 'high').length,
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
  async get_user_lottery_statistics(user_id, date_range = {}) {
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

      // V4.0语义更新：高档奖励次数（替代原winning_draws）
      const high_tier_draws = await models.LotteryDraw.count({
        where: {
          ...where_conditions,
          reward_tier: 'high'
        }
      })

      // V4.0语义更新：按奖励档位统计（替代原按奖品类型统计is_winner=true）
      const tier_distribution_stats = await models.LotteryDraw.findAll({
        where: where_conditions,
        attributes: [
          'reward_tier',
          [models.sequelize.fn('COUNT', models.sequelize.col('*')), 'count']
        ],
        group: ['reward_tier']
      })

      // V4.0语义更新：最近高档奖励记录（替代原recent_wins）
      const recent_high_tier = await models.LotteryDraw.findAll({
        where: {
          ...where_conditions,
          reward_tier: 'high'
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

      // V4.0语义更新：返回档位分布统计（替代原中奖率）
      return {
        user_id,
        total_draws,
        high_tier_draws, // V4.0：替代 winning_draws
        // V4.0：替代 winning_rate
        high_tier_rate:
          total_draws > 0 ? ((high_tier_draws / total_draws) * 100).toFixed(2) + '%' : '0%',
        tier_distribution: tier_distribution_stats.map(stat => ({
          reward_tier: stat.reward_tier,
          count: parseInt(stat.getDataValue('count'))
        })),
        recent_high_tier: recent_high_tier.map(record => this.format_lottery_record(record)),
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
  async get_today_lottery_statistics(user_id) {
    try {
      const today_start = BeijingTimeHelper.todayStart()
      const today_end = BeijingTimeHelper.todayEnd()

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
  format_lottery_record(record) {
    const formatted_record = {
      id: record.id,
      user_id: record.user_id,
      campaign_id: record.campaign_id,
      prize_id: record.prize_id,
      // V4.0语义更新：使用 reward_tier 替代 is_winner
      reward_tier: record.reward_tier,
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
  get_prize_type_name(type) {
    // 奖品类型显示名称映射
    const type_map = {
      points: '积分奖励',
      product: '实物奖品',
      virtual: '虚拟奖品',
      coupon: '优惠券',
      physical: '实物奖品',
      service: '服务类奖品'
    }
    return type_map[type] || '未知类型'
  }

  /**
   * 验证历史查询参数
   * @param {Object} params - 查询参数
   * @returns {Object} 验证结果
   */
  validate_history_params(params) {
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
