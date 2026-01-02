/**
 * 抽奖记录数据访问层
 * 负责复杂查询、统计分析和数据聚合操作
 * 从LotteryDraw模型中抽取的数据访问职责
 */
const BeijingTimeHelper = require('../utils/timeHelper')
const { Op } = require('sequelize')

/**
 * 抽奖记录数据访问层（Repository）
 *
 * 业务场景：
 * - 承载 LotteryDraw 的复杂查询、统计与聚合
 * - 让 Service/Route 层保持业务语义清晰，避免散落 SQL/查询拼接
 */
class LotteryDrawRepository {
  /**
   * 构造函数：注入所需的 Sequelize Models
   *
   * @param {Object} models - 模型集合（包含 LotteryDraw/LotteryPrize/User/sequelize）
   * @returns {void} 无返回值
   */
  constructor(models) {
    this.LotteryDraw = models.LotteryDraw
    this.LotteryPrize = models.LotteryPrize
    this.User = models.User
    this.sequelize = models.sequelize
  }

  /**
   * 根据条件获取用户抽奖记录
   * @param {Number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Array} 抽奖记录数组
   */
  async getUserRecords(userId, options = {}) {
    const {
      drawType = null,
      prizeType = null,
      // V4.0语义更新：使用 rewardTier 替代 isWinner
      rewardTier = null,
      limit = 20,
      offset = 0,
      startDate = null,
      endDate = null,
      includePrize = false
    } = options

    const where = { user_id: userId }

    // 构建查询条件
    if (drawType) where.draw_type = drawType
    if (prizeType) where.prize_type = prizeType
    // V4.0：根据奖励档位过滤
    if (rewardTier !== null) where.reward_tier = rewardTier

    // 时间范围查询
    if (startDate || endDate) {
      where.created_at = {}
      if (startDate) where.created_at[Op.gte] = startDate
      if (endDate) where.created_at[Op.lte] = endDate
    }

    // 构建查询选项
    const queryOptions = {
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset
    }

    // 是否包含奖品信息
    if (includePrize) {
      queryOptions.include = [
        {
          model: this.LotteryPrize,
          as: 'prize',
          required: false
        }
      ]
    }

    return await this.LotteryDraw.findAll(queryOptions)
  }

  /**
   * 获取用户抽奖记录数量（分页）
   * @param {Number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} {count, rows}
   */
  async getUserRecordsWithCount(userId, options = {}) {
    const {
      drawType = null,
      prizeType = null,
      // V4.0语义更新：使用 rewardTier 替代 isWinner
      rewardTier = null,
      limit = 20,
      offset = 0,
      startDate = null,
      endDate = null,
      includePrize = false
    } = options

    const where = { user_id: userId }

    // 构建查询条件
    if (drawType) where.draw_type = drawType
    if (prizeType) where.prize_type = prizeType
    // V4.0：根据奖励档位过滤
    if (rewardTier !== null) where.reward_tier = rewardTier

    // 时间范围查询
    if (startDate || endDate) {
      where.created_at = {}
      if (startDate) where.created_at[Op.gte] = startDate
      if (endDate) where.created_at[Op.lte] = endDate
    }

    // 构建查询选项
    const queryOptions = {
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset
    }

    // 是否包含奖品信息
    if (includePrize) {
      queryOptions.include = [
        {
          model: this.LotteryPrize,
          as: 'prize',
          required: false
        }
      ]
    }

    return await this.LotteryDraw.findAndCountAll(queryOptions)
  }

  /**
   * 获取用户抽奖统计数据（V4.0语义更新）
   * @param {Number} userId - 用户ID
   * @returns {Object} 统计数据
   */
  async getUserLotteryStats(userId) {
    const [stats] = await this.sequelize.query(
      `
      SELECT
        COUNT(*) as total_draws,
        COUNT(CASE WHEN reward_tier = 'high' THEN 1 END) as high_tier_wins,
        COUNT(CASE WHEN guarantee_triggered = 1 THEN 1 END) as pity_wins,
        COALESCE(SUM(cost_points), 0) as total_cost,
        COALESCE(SUM(CASE WHEN prize_type = 'points' THEN prize_value ELSE 0 END), 0) as points_won
      FROM lottery_draws
      WHERE user_id = :userId
      `,
      {
        replacements: { userId },
        type: this.sequelize.QueryTypes.SELECT
      }
    )

    return stats
  }

  /**
   * 批量分析抽奖数据（V4.0语义更新）
   * @param {Object} conditions - 分析条件
   * @returns {Object} 分析结果
   */
  async batchAnalyze(conditions = {}) {
    const baseWhere = { ...conditions }

    const [totalDraws, highTierDraws, prizeStats] = await Promise.all([
      // 总抽奖次数
      this.LotteryDraw.count({ where: baseWhere }),

      // V4.0：高档奖励次数
      this.LotteryDraw.count({
        where: { ...baseWhere, reward_tier: 'high' }
      }),

      // 奖品发放状态统计
      this.LotteryDraw.findAll({
        attributes: [
          'prize_status',
          [this.sequelize.fn('COUNT', this.sequelize.col('*')), 'count']
        ],
        where: { ...baseWhere, reward_tier: 'high' },
        group: ['prize_status'],
        raw: true
      })
    ])

    const highTierRate = totalDraws > 0 ? ((highTierDraws / totalDraws) * 100).toFixed(2) : '0.00'

    return {
      total_draws: totalDraws,
      high_tier_draws: highTierDraws, // V4.0：替代 win_draws
      high_tier_rate: highTierRate, // V4.0：替代 win_rate
      prize_delivery_stats: prizeStats.reduce((acc, stat) => {
        acc[stat.prize_status] = parseInt(stat.count)
        return acc
      }, {})
    }
  }

  /**
   * 获取抽奖历史记录（支持复杂条件）（V4.0语义更新）
   * @param {Object} options - 查询选项
   * @returns {Object} {count, rows}
   */
  async getLotteryHistory(options = {}) {
    const {
      userId = null,
      campaignId = null,
      // V4.0语义更新：使用 rewardTier 替代 isWinner
      rewardTier = null,
      prizeType = null,
      startDate = null,
      endDate = null,
      limit = 20,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = options

    const where = {}

    // 构建查询条件
    if (userId) where.user_id = userId
    if (campaignId) where.campaign_id = campaignId
    // V4.0：根据奖励档位过滤
    if (rewardTier !== null) where.reward_tier = rewardTier
    if (prizeType) where.prize_type = prizeType

    // 时间范围查询
    if (startDate || endDate) {
      where.created_at = {}
      if (startDate) where.created_at[Op.gte] = startDate
      if (endDate) where.created_at[Op.lte] = endDate
    }

    return await this.LotteryDraw.findAndCountAll({
      where,
      include: [
        {
          model: this.User,
          as: 'user',
          attributes: ['user_id', 'phone', 'name'],
          required: false
        },
        {
          model: this.LotteryPrize,
          as: 'prize',
          required: false
        }
      ],
      order: [[orderBy, orderDirection]],
      limit,
      offset
    })
  }

  /**
   * 获取今日抽奖统计（V4.0语义更新）
   * @returns {Object} 今日统计数据
   */
  async getTodayStats() {
    const todayStart = BeijingTimeHelper.createBeijingTime()
    todayStart.setHours(0, 0, 0, 0)

    const todayEnd = BeijingTimeHelper.createBeijingTime()
    todayEnd.setHours(23, 59, 59, 999)

    const [totalDraws, totalHighTierWins] = await Promise.all([
      this.LotteryDraw.count({
        where: {
          created_at: {
            [Op.gte]: todayStart,
            [Op.lte]: todayEnd
          }
        }
      }),
      // V4.0：高档奖励次数
      this.LotteryDraw.count({
        where: {
          created_at: {
            [Op.gte]: todayStart,
            [Op.lte]: todayEnd
          },
          reward_tier: 'high'
        }
      })
    ])

    return {
      total_draws: totalDraws,
      total_high_tier_wins: totalHighTierWins, // V4.0：替代 total_wins
      high_tier_rate: totalDraws > 0 ? ((totalHighTierWins / totalDraws) * 100).toFixed(2) : '0.00' // V4.0：替代 win_rate
    }
  }

  /**
   * 获取按日期分组的统计数据
   * @param {Object} options - 查询选项
   * @returns {Array} 日期统计数组
   */
  async getDailyStats(options = {}) {
    const { startDate = null, endDate = null, campaignId = null } = options

    const where = {}
    if (campaignId) where.campaign_id = campaignId

    if (startDate || endDate) {
      where.created_at = {}
      if (startDate) where.created_at[Op.gte] = startDate
      if (endDate) where.created_at[Op.lte] = endDate
    }

    return await this.LotteryDraw.findAll({
      attributes: [
        [this.sequelize.fn('DATE', this.sequelize.col('created_at')), 'date'],
        [this.sequelize.fn('COUNT', this.sequelize.col('*')), 'total_draws'],
        // V4.0语义更新：统计高档奖励次数（替代原中奖次数）
        [
          this.sequelize.fn(
            'SUM',
            this.sequelize.literal("CASE WHEN reward_tier = 'high' THEN 1 ELSE 0 END")
          ),
          'total_high_tier_wins'
        ]
      ],
      where,
      group: [this.sequelize.fn('DATE', this.sequelize.col('created_at'))],
      order: [[this.sequelize.fn('DATE', this.sequelize.col('created_at')), 'ASC']],
      raw: true
    })
  }

  /**
   * 获取最近的抽奖记录
   * @param {Number} limit - 限制数量
   * @param {Object} conditions - 附加条件
   * @returns {Array} 最近的抽奖记录
   */
  async getRecentDraws(limit = 10, conditions = {}) {
    return await this.LotteryDraw.findAll({
      where: conditions,
      include: [
        {
          model: this.User,
          as: 'user',
          attributes: ['user_id', 'phone', 'name'],
          required: false
        },
        {
          model: this.LotteryPrize,
          as: 'prize',
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit
    })
  }

  /**
   * 获取用户在线状态统计
   * @param {Number} minutes - 分钟数，默认30分钟内
   * @returns {Number} 在线用户数
   */
  async getActiveUsersCount(minutes = 30) {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000)

    return await this.LotteryDraw.count({
      where: {
        created_at: {
          [Op.gte]: cutoffTime
        }
      },
      distinct: true,
      col: 'user_id'
    })
  }

  /**
   * 按用户ID批量查找抽奖记录
   * @param {Array} userIds - 用户ID数组
   * @param {Object} options - 查询选项
   * @returns {Array} 抽奖记录数组
   */
  async findByUserIds(userIds, options = {}) {
    // V4.0语义更新：使用 rewardTier 替代 isWinner
    const { rewardTier = null, startDate = null, endDate = null, limit = null } = options

    const where = {
      user_id: {
        [Op.in]: userIds
      }
    }

    // V4.0：根据奖励档位过滤
    if (rewardTier !== null) where.reward_tier = rewardTier

    if (startDate || endDate) {
      where.created_at = {}
      if (startDate) where.created_at[Op.gte] = startDate
      if (endDate) where.created_at[Op.lte] = endDate
    }

    const queryOptions = {
      where,
      order: [['created_at', 'DESC']]
    }

    if (limit) queryOptions.limit = limit

    return await this.LotteryDraw.findAll(queryOptions)
  }

  /**
   * 根据批次ID查找抽奖记录
   * @param {String} batchId - 批次ID
   * @param {Object} options - 查询选项
   * @returns {Array} 抽奖记录数组
   */
  async findByBatchId(batchId, options = {}) {
    const { includePrize = false } = options

    const queryOptions = {
      where: { batch_id: batchId },
      order: [['draw_sequence', 'ASC']]
    }

    if (includePrize) {
      queryOptions.include = [
        {
          model: this.LotteryPrize,
          as: 'prize',
          required: false
        }
      ]
    }

    return await this.LotteryDraw.findAll(queryOptions)
  }

  /**
   * 删除指定条件的抽奖记录
   * @param {Object} conditions - 删除条件
   * @param {Object} transaction - 事务对象
   * @returns {Number} 删除的记录数
   */
  async deleteRecords(conditions, transaction = null) {
    const options = { where: conditions }
    if (transaction) options.transaction = transaction

    return await this.LotteryDraw.destroy(options)
  }

  /**
   * 更新指定条件的抽奖记录
   * @param {Object} conditions - 更新条件
   * @param {Object} updateData - 更新数据
   * @param {Object} transaction - 事务对象
   * @returns {Array} [更新数量, 更新的记录]
   */
  async updateRecords(conditions, updateData, transaction = null) {
    const options = { where: conditions }
    if (transaction) options.transaction = transaction

    return await this.LotteryDraw.update(updateData, options)
  }
}

module.exports = LotteryDrawRepository
