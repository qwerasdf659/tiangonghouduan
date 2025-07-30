/**
 * 餐厅积分抽奖系统 v2.0 - 积分管理业务服务
 * 实现积分管理系统的核心业务逻辑
 */

const { sequelize } = require('../models')
const { User, PointsRecord } = require('../models')

class PointsService {
  constructor () {
    this.statisticsCache = null
    this.statisticsExpiry = null
    this.cacheTTL = 5 * 60 * 1000 // 5分钟缓存
  }

  /**
   * 获取用户积分余额
   * @param {number} userId - 用户ID
   * @returns {Object} 积分余额信息
   */
  async getBalance (userId) {
    try {
      const user = await User.findByPk(userId, {
        attributes: ['id', 'total_points', 'cumulative_points', 'nickname', 'phone']
      })

      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取今日积分变动统计
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const todayStats = await PointsRecord.findAll({
        where: {
          user_id: userId,
          created_at: {
            [sequelize.Op.gte]: today
          }
        },
        attributes: [
          [
            sequelize.fn(
              'SUM',
              sequelize.literal('CASE WHEN change_amount > 0 THEN change_amount ELSE 0 END')
            ),
            'todayEarned'
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal('CASE WHEN change_amount < 0 THEN ABS(change_amount) ELSE 0 END')
            ),
            'todaySpent'
          ],
          [sequelize.fn('COUNT', '*'), 'todayTransactions']
        ],
        raw: true
      })

      const stats = todayStats[0] || {}

      return {
        userId: user.id,
        nickname: user.nickname,
        phone: this._maskPhone(user.phone),
        currentBalance: user.total_points,
        cumulativePoints: user.cumulative_points,
        todayEarned: parseInt(stats.todayEarned) || 0,
        todaySpent: parseInt(stats.todaySpent) || 0,
        todayTransactions: parseInt(stats.todayTransactions) || 0,
        lastUpdated: new Date().toISOString()
      }
    } catch (error) {
      console.error('❌ 获取积分余额失败:', error.message)
      throw error
    }
  }

  /**
   * 获取积分记录
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 积分记录列表和分页信息
   */
  async getRecords (userId, options = {}) {
    const {
      page = 1,
      pageSize = 20,
      recordType = 'all',
      period = 'all',
      sortBy = 'created_at',
      order = 'DESC'
    } = options

    try {
      const offset = (page - 1) * pageSize

      // 构建查询条件
      const whereClause = { user_id: userId }

      // 记录类型筛选
      if (recordType !== 'all') {
        whereClause.source = recordType
      }

      // 时间范围筛选
      if (period !== 'all') {
        const timeRange = this._getTimeRange(period)
        if (timeRange) {
          whereClause.created_at = {
            [sequelize.Op.gte]: timeRange.start,
            [sequelize.Op.lte]: timeRange.end
          }
        }
      }

      // 查询记录
      const { rows: records, count: totalCount } = await PointsRecord.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'admin',
            attributes: ['id', 'nickname'],
            required: false
          }
        ],
        order: [[sortBy, order.toUpperCase()]],
        limit: pageSize,
        offset
      })

      // 处理记录数据
      const processedRecords = records.map(record => ({
        id: record.id,
        recordId: record.record_id,
        changeAmount: record.change_amount,
        balanceAfter: record.balance_after,
        source: record.source,
        description: record.description,
        relatedId: record.related_id,
        relatedType: record.related_type,
        adminInfo: record.admin
          ? {
            id: record.admin.id,
            nickname: record.admin.nickname
          }
          : null,
        createdAt: record.created_at,
        metadata: record.metadata
      }))

      return {
        records: processedRecords,
        pagination: {
          currentPage: page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
          hasMore: page * pageSize < totalCount
        },
        summary: {
          totalRecords: totalCount,
          period,
          recordType
        }
      }
    } catch (error) {
      console.error('❌ 获取积分记录失败:', error.message)
      throw error
    }
  }

  /**
   * 获取积分统计数据
   * @param {number} userId - 用户ID
   * @param {Object} options - 统计选项
   * @returns {Object} 统计数据
   */
  async getStatistics (userId, options = {}) {
    const { period = 'month', includeBreakdown = true } = options

    try {
      const timeRange = this._getTimeRange(period)
      const whereClause = { user_id: userId }

      if (timeRange) {
        whereClause.created_at = {
          [sequelize.Op.gte]: timeRange.start,
          [sequelize.Op.lte]: timeRange.end
        }
      }

      // 基础统计
      const basicStats = await PointsRecord.findAll({
        where: whereClause,
        attributes: [
          [
            sequelize.fn(
              'SUM',
              sequelize.literal('CASE WHEN change_amount > 0 THEN change_amount ELSE 0 END')
            ),
            'totalEarned'
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal('CASE WHEN change_amount < 0 THEN ABS(change_amount) ELSE 0 END')
            ),
            'totalSpent'
          ],
          [sequelize.fn('COUNT', '*'), 'totalTransactions'],
          [
            sequelize.fn(
              'AVG',
              sequelize.literal('CASE WHEN change_amount > 0 THEN change_amount END')
            ),
            'avgEarned'
          ],
          [
            sequelize.fn(
              'AVG',
              sequelize.literal('CASE WHEN change_amount < 0 THEN ABS(change_amount) END')
            ),
            'avgSpent'
          ],
          [
            sequelize.fn(
              'MAX',
              sequelize.literal('CASE WHEN change_amount > 0 THEN change_amount END')
            ),
            'maxEarned'
          ],
          [
            sequelize.fn(
              'MAX',
              sequelize.literal('CASE WHEN change_amount < 0 THEN ABS(change_amount) END')
            ),
            'maxSpent'
          ]
        ],
        raw: true
      })

      const stats = basicStats[0] || {}

      const result = {
        period,
        timeRange,
        summary: {
          totalEarned: parseInt(stats.totalEarned) || 0,
          totalSpent: parseInt(stats.totalSpent) || 0,
          netChange: (parseInt(stats.totalEarned) || 0) - (parseInt(stats.totalSpent) || 0),
          totalTransactions: parseInt(stats.totalTransactions) || 0,
          avgEarnedPerTransaction: parseFloat(stats.avgEarned) || 0,
          avgSpentPerTransaction: parseFloat(stats.avgSpent) || 0,
          maxSingleEarned: parseInt(stats.maxEarned) || 0,
          maxSingleSpent: parseInt(stats.maxSpent) || 0
        }
      }

      // 如果需要详细分解
      if (includeBreakdown) {
        // 按来源分组统计
        const sourceStats = await PointsRecord.findAll({
          where: whereClause,
          attributes: [
            'source',
            [
              sequelize.fn(
                'SUM',
                sequelize.literal('CASE WHEN change_amount > 0 THEN change_amount ELSE 0 END')
              ),
              'earned'
            ],
            [
              sequelize.fn(
                'SUM',
                sequelize.literal('CASE WHEN change_amount < 0 THEN ABS(change_amount) ELSE 0 END')
              ),
              'spent'
            ],
            [sequelize.fn('COUNT', '*'), 'count']
          ],
          group: ['source'],
          raw: true
        })

        result.breakdown = {
          bySource: sourceStats.map(stat => ({
            source: stat.source,
            earned: parseInt(stat.earned) || 0,
            spent: parseInt(stat.spent) || 0,
            transactionCount: parseInt(stat.count) || 0
          }))
        }

        // 按日期分组统计（最近30天）
        if (period === 'month') {
          const dailyStats = await PointsRecord.findAll({
            where: whereClause,
            attributes: [
              [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
              [
                sequelize.fn(
                  'SUM',
                  sequelize.literal('CASE WHEN change_amount > 0 THEN change_amount ELSE 0 END')
                ),
                'dailyEarned'
              ],
              [
                sequelize.fn(
                  'SUM',
                  sequelize.literal(
                    'CASE WHEN change_amount < 0 THEN ABS(change_amount) ELSE 0 END'
                  )
                ),
                'dailySpent'
              ],
              [sequelize.fn('COUNT', '*'), 'dailyCount']
            ],
            group: [sequelize.fn('DATE', sequelize.col('created_at'))],
            order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']],
            raw: true
          })

          result.breakdown.byDate = dailyStats.map(stat => ({
            date: stat.date,
            earned: parseInt(stat.dailyEarned) || 0,
            spent: parseInt(stat.dailySpent) || 0,
            transactionCount: parseInt(stat.dailyCount) || 0,
            netChange: (parseInt(stat.dailyEarned) || 0) - (parseInt(stat.dailySpent) || 0)
          }))
        }
      }

      return result
    } catch (error) {
      console.error('❌ 获取积分统计失败:', error.message)
      throw error
    }
  }

  /**
   * 创建积分记录（内部使用）
   * @param {Object} recordData - 记录数据
   * @param {Object} transaction - 数据库事务（可选）
   * @returns {Object} 创建的记录
   */
  async createRecord (recordData, transaction = null) {
    const {
      userId,
      changeAmount,
      source,
      description,
      relatedId = null,
      relatedType = null,
      adminId = null,
      metadata = {}
    } = recordData

    try {
      // 获取用户当前积分
      const user = await User.findByPk(userId, { transaction })
      if (!user) {
        throw new Error('用户不存在')
      }

      const balanceAfter = user.total_points + changeAmount

      // 创建积分记录
      const record = await PointsRecord.create(
        {
          record_id: this._generateRecordId(),
          user_id: userId,
          change_amount: changeAmount,
          balance_before: user.total_points,
          balance_after: balanceAfter,
          source,
          description,
          related_id: relatedId,
          related_type: relatedType,
          admin_id: adminId,
          metadata
        },
        { transaction }
      )

      // 更新用户积分
      await user.update(
        {
          total_points: balanceAfter,
          cumulative_points:
            changeAmount > 0 ? user.cumulative_points + changeAmount : user.cumulative_points
        },
        { transaction }
      )

      return {
        recordId: record.record_id,
        userId,
        changeAmount,
        balanceAfter,
        source,
        description,
        createdAt: record.created_at
      }
    } catch (error) {
      console.error('❌ 创建积分记录失败:', error.message)
      throw error
    }
  }

  /**
   * 批量创建积分记录（内部使用）
   * @param {Array} recordsData - 记录数据数组
   * @param {Object} transaction - 数据库事务
   * @returns {Array} 创建的记录数组
   */
  async createBatchRecords (recordsData, transaction) {
    try {
      const results = []

      for (const recordData of recordsData) {
        const result = await this.createRecord(recordData, transaction)
        results.push(result)
      }

      return results
    } catch (error) {
      console.error('❌ 批量创建积分记录失败:', error.message)
      throw error
    }
  }

  /**
   * 获取积分排行榜
   * @param {Object} options - 查询选项
   * @returns {Object} 排行榜数据
   */
  async getLeaderboard (options = {}) {
    const {
      type = 'total', // total/cumulative/monthly
      limit = 50,
      period = 'current_month'
    } = options

    try {
      let orderField = 'total_points'
      const whereClause = {}

      if (type === 'cumulative') {
        orderField = 'cumulative_points'
      } else if (type === 'monthly') {
        // 本月积分获得排行
        const timeRange = this._getTimeRange(period)
        if (timeRange) {
          // 需要通过积分记录计算本月获得积分
          const monthlyStats = await PointsRecord.findAll({
            where: {
              created_at: {
                [sequelize.Op.gte]: timeRange.start,
                [sequelize.Op.lte]: timeRange.end
              },
              change_amount: {
                [sequelize.Op.gt]: 0
              }
            },
            attributes: [
              'user_id',
              [sequelize.fn('SUM', sequelize.col('change_amount')), 'monthlyEarned']
            ],
            group: ['user_id'],
            order: [[sequelize.fn('SUM', sequelize.col('change_amount')), 'DESC']],
            limit,
            include: [
              {
                model: User,
                as: 'user',
                attributes: ['id', 'nickname', 'total_points']
              }
            ]
          })

          return {
            type,
            period,
            leaderboard: monthlyStats.map((record, index) => ({
              rank: index + 1,
              userId: record.user_id,
              nickname: record.user.nickname,
              currentPoints: record.user.total_points,
              periodPoints: parseInt(record.dataValues.monthlyEarned),
              avatar: null // TODO: 添加头像字段
            }))
          }
        }
      }

      // 总积分或累计积分排行
      const users = await User.findAll({
        where: whereClause,
        attributes: ['id', 'nickname', 'total_points', 'cumulative_points'],
        order: [[orderField, 'DESC']],
        limit
      })

      return {
        type,
        period,
        leaderboard: users.map((user, index) => ({
          rank: index + 1,
          userId: user.id,
          nickname: user.nickname,
          currentPoints: user.total_points,
          cumulativePoints: user.cumulative_points,
          displayPoints: type === 'cumulative' ? user.cumulative_points : user.total_points,
          avatar: null // TODO: 添加头像字段
        }))
      }
    } catch (error) {
      console.error('❌ 获取积分排行榜失败:', error.message)
      throw error
    }
  }

  /**
   * 私有方法：获取时间范围
   * @param {string} period - 时间周期
   * @returns {Object|null} 时间范围对象
   */
  _getTimeRange (period) {
    const now = new Date()
    let start, end

    switch (period) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
      break

    case 'week': {
      const dayOfWeek = now.getDay()
      start = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000)
      start.setHours(0, 0, 0, 0)
      end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
      break
    }

    case 'month':
    case 'current_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      break

    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      break

    case 'year':
      start = new Date(now.getFullYear(), 0, 1)
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      break

    default:
      return null
    }

    return { start, end }
  }

  /**
   * 私有方法：生成记录ID
   * @returns {string} 记录ID
   */
  _generateRecordId () {
    return `pt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 私有方法：脱敏手机号
   * @param {string} phone - 手机号
   * @returns {string} 脱敏后的手机号
   */
  _maskPhone (phone) {
    if (!phone || phone.length < 7) return phone
    return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4)
  }

  /**
   * 清理缓存
   */
  clearCache () {
    this.statisticsCache = null
    this.statisticsExpiry = null
  }
}

module.exports = PointsService
