/**
 * 餐厅积分抽奖系统 v3.0 - 交易业务服务
 * 实现交易系统的核心业务逻辑
 */

const { sequelize } = require('../models')
const { User, TradeRecord, PointsRecord } = require('../models')

class TradeService {
  constructor () {
    this.statisticsCache = null
    this.statisticsExpiry = null
    this.cacheTTL = 5 * 60 * 1000 // 5分钟缓存
  }

  /**
   * 执行积分转账
   * @param {Object} options - 转账选项
   * @returns {Object} 转账结果
   */
  async transferPoints (options) {
    const {
      fromUserId,
      toUserId,
      amount,
      reason,
      tradePassword: _tradePassword = null,
      clientInfo = {}
    } = options

    const transaction = await sequelize.transaction()

    try {
      // 1. 验证用户和积分
      const fromUser = await User.findByPk(fromUserId, { transaction })
      if (!fromUser) {
        throw new Error('发送方用户不存在')
      }

      const toUser = await User.findByPk(toUserId, { transaction })
      if (!toUser) {
        throw new Error('接收方用户不存在')
      }

      if (fromUser.total_points < amount) {
        throw new Error(`积分不足，当前余额：${fromUser.total_points}，需要：${amount}`)
      }

      // 2. 计算手续费
      const feeAmount = TradeRecord.calculateFee(amount, 'point_transfer')
      const netAmount = amount - feeAmount

      if (netAmount <= 0) {
        throw new Error('转账金额过小，扣除手续费后无剩余')
      }

      // 3. 创建交易记录
      const tradeId = TradeRecord.generateTradeId()
      const tradeRecord = await TradeRecord.create(
        {
          trade_id: tradeId,
          trade_type: 'point_transfer',
          from_user_id: fromUserId,
          to_user_id: toUserId,
          points_amount: amount,
          fee_points: feeAmount,
          net_amount: netAmount,
          status: 'processing',
          trade_reason: reason || '积分转账',
          client_ip: clientInfo.ip,
          user_agent: clientInfo.userAgent,
          device_info: clientInfo.deviceInfo
        },
        { transaction }
      )

      // 4. 执行积分转移
      // 扣除发送方积分
      await fromUser.update(
        {
          total_points: fromUser.total_points - amount
        },
        { transaction }
      )

      // 增加接收方积分
      await toUser.update(
        {
          total_points: toUser.total_points + netAmount
        },
        { transaction }
      )

      // 5. 记录积分变动
      await PointsRecord.create(
        {
          user_id: fromUserId,
          change_type: 'transfer_out',
          points_change: -amount,
          points_balance: fromUser.total_points - amount,
          source_type: 'trade',
          source_id: tradeRecord.id,
          description: `转账给用户${toUserId}：${reason}`,
          admin_id: null
        },
        { transaction }
      )

      await PointsRecord.create(
        {
          user_id: toUserId,
          change_type: 'transfer_in',
          points_change: netAmount,
          points_balance: toUser.total_points + netAmount,
          source_type: 'trade',
          source_id: tradeRecord.id,
          description: `收到用户${fromUserId}转账：${reason}`,
          admin_id: null
        },
        { transaction }
      )

      // 6. 更新交易状态为完成
      await tradeRecord.update(
        {
          status: 'completed',
          processed_time: new Date()
        },
        { transaction }
      )

      await transaction.commit()

      console.log(`✅ 积分转账成功: ${fromUserId} -> ${toUserId}, 金额${amount}, 到账${netAmount}`)

      return {
        trade_id: tradeId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        amount,
        fee_amount: feeAmount,
        net_amount: netAmount,
        status: 'completed',
        from_user_balance: fromUser.total_points - amount,
        to_user_balance: toUser.total_points + netAmount,
        trade_time: tradeRecord.trade_time
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 积分转账失败:', error.message)
      throw error
    }
  }

  /**
   * 获取用户交易记录
   * @param {Number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 交易记录和分页信息
   */
  async getUserTrades (userId, options = {}) {
    try {
      const {
        type = 'all',
        status = 'all',
        page = 1,
        pageSize = 20,
        startDate = null,
        endDate = null,
        direction = 'all' // all, sent, received
      } = options

      const whereClause = {}

      // 方向筛选
      if (direction === 'sent') {
        whereClause.from_user_id = userId
      } else if (direction === 'received') {
        whereClause.to_user_id = userId
      } else {
        whereClause[sequelize.Sequelize.Op.or] = [{ from_user_id: userId }, { to_user_id: userId }]
      }

      // 类型筛选
      if (type !== 'all') {
        whereClause.trade_type = type
      }

      // 状态筛选
      if (status !== 'all') {
        whereClause.status = status
      }

      // 时间范围筛选
      if (startDate && endDate) {
        whereClause.trade_time = {
          [sequelize.Sequelize.Op.between]: [startDate, endDate]
        }
      }

      const offset = (page - 1) * pageSize

      const result = await TradeRecord.findAndCountAll({
        where: whereClause,
        limit: pageSize,
        offset,
        order: [['trade_time', 'DESC']],
        include: [
          {
            model: User,
            as: 'fromUser',
            attributes: ['id', 'nickname', 'phone'],
            required: false
          },
          {
            model: User,
            as: 'toUser',
            attributes: ['id', 'nickname', 'phone']
          },
          {
            model: User,
            as: 'operator',
            attributes: ['id', 'nickname'],
            required: false
          }
        ]
      })

      // 处理数据格式
      const trades = result.rows.map(trade => ({
        trade_id: trade.trade_id,
        trade_type: trade.trade_type,
        amount: trade.points_amount,
        fee_amount: trade.fee_points,
        net_amount: trade.net_amount,
        status: trade.status,
        from_user: trade.fromUser
          ? {
            id: trade.fromUser.id,
            nickname: trade.fromUser.nickname,
            phone: this._maskPhone(trade.fromUser.phone)
          }
          : null,
        to_user: {
          id: trade.toUser.id,
          nickname: trade.toUser.nickname,
          phone: this._maskPhone(trade.toUser.phone)
        },
        operator: trade.operator
          ? {
            id: trade.operator.id,
            nickname: trade.operator.nickname
          }
          : null,
        reason: trade.trade_reason,
        trade_time: trade.trade_time,
        processed_time: trade.processed_time,
        // 标识交易方向
        direction: trade.from_user_id === userId ? 'sent' : 'received'
      }))

      return {
        trades,
        pagination: {
          current_page: page,
          page_size: pageSize,
          total_count: result.count,
          total_pages: Math.ceil(result.count / pageSize),
          has_more: offset + pageSize < result.count
        }
      }
    } catch (error) {
      console.error('❌ 获取用户交易记录失败:', error.message)
      throw error
    }
  }

  /**
   * 创建系统奖励交易
   * @param {Object} options - 奖励选项
   * @returns {Object} 交易记录
   */
  async createSystemReward (options) {
    const {
      userId,
      amount,
      reason,
      relatedId = null,
      relatedType = null,
      operatorId = null
    } = options

    const transaction = await sequelize.transaction()

    try {
      // 1. 验证用户
      const user = await User.findByPk(userId, { transaction })
      if (!user) {
        throw new Error('用户不存在')
      }

      // 2. 创建交易记录
      const tradeId = TradeRecord.generateTradeId()
      const tradeRecord = await TradeRecord.create(
        {
          trade_id: tradeId,
          trade_type: 'system_reward',
          from_user_id: null, // 系统操作
          to_user_id: userId,
          operator_id: operatorId,
          points_amount: amount,
          fee_points: 0,
          net_amount: amount,
          status: 'completed',
          trade_reason: reason,
          related_id: relatedId,
          related_type: relatedType,
          processed_time: new Date()
        },
        { transaction }
      )

      // 3. 增加用户积分
      await user.update(
        {
          total_points: user.total_points + amount
        },
        { transaction }
      )

      // 4. 记录积分变动
      await PointsRecord.create(
        {
          user_id: userId,
          change_type: 'system_reward',
          points_change: amount,
          points_balance: user.total_points + amount,
          source_type: 'trade',
          source_id: tradeRecord.id,
          description: reason,
          admin_id: operatorId
        },
        { transaction }
      )

      await transaction.commit()

      console.log(`✅ 系统奖励创建成功: 用户${userId}, 金额${amount}`)

      return {
        trade_id: tradeId,
        user_id: userId,
        amount,
        reason,
        new_balance: user.total_points + amount,
        trade_time: tradeRecord.trade_time
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建系统奖励失败:', error.message)
      throw error
    }
  }

  /**
   * 获取交易统计数据
   * @param {Number} userId - 用户ID（可选，为空时获取全局统计）
   * @param {Object} options - 统计选项
   * @returns {Object} 统计数据
   */
  async getTradeStatistics (userId = null, options = {}) {
    try {
      const {
        period = 'month', // today, week, month, year, all
        includeDetail: _includeDetail = false
      } = options

      const cacheKey = `trade_stats_${userId || 'global'}_${period}`

      // 检查缓存
      if (
        this.statisticsCache &&
        this.statisticsCache[cacheKey] &&
        this.statisticsExpiry &&
        Date.now() < this.statisticsExpiry
      ) {
        return this.statisticsCache[cacheKey]
      }

      // 计算时间范围
      const timeRange = this._getTimeRange(period)
      const whereClause = {}

      if (timeRange.start && timeRange.end) {
        whereClause.trade_time = {
          [sequelize.Sequelize.Op.between]: [timeRange.start, timeRange.end]
        }
      }

      // 用户筛选
      if (userId) {
        whereClause[sequelize.Sequelize.Op.or] = [{ from_user_id: userId }, { to_user_id: userId }]
      }

      // 基础统计
      const totalTrades = await TradeRecord.count({
        where: { ...whereClause, status: 'completed' }
      })

      const totalAmount =
        (await TradeRecord.sum('points_amount', {
          where: { ...whereClause, status: 'completed' }
        })) || 0

      const totalFees =
        (await TradeRecord.sum('fee_points', {
          where: { ...whereClause, status: 'completed' }
        })) || 0

      // 按类型统计
      const typeStats = await TradeRecord.findAll({
        attributes: [
          'trade_type',
          [sequelize.fn('COUNT', '*'), 'count'],
          [sequelize.fn('SUM', sequelize.col('points_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('fee_points')), 'total_fees']
        ],
        where: { ...whereClause, status: 'completed' },
        group: ['trade_type'],
        raw: true
      })

      // 按状态统计
      const statusStats = await TradeRecord.findAll({
        attributes: ['status', [sequelize.fn('COUNT', '*'), 'count']],
        where: whereClause,
        group: ['status'],
        raw: true
      })

      const stats = {
        period,
        time_range: timeRange,
        summary: {
          total_trades: totalTrades,
          total_amount: totalAmount,
          total_fees: totalFees,
          average_amount: totalTrades > 0 ? Math.round(totalAmount / totalTrades) : 0
        },
        by_type: typeStats.reduce((acc, stat) => {
          acc[stat.trade_type] = {
            count: parseInt(stat.count),
            total_amount: parseInt(stat.total_amount || 0),
            total_fees: parseInt(stat.total_fees || 0)
          }
          return acc
        }, {}),
        by_status: statusStats.reduce((acc, stat) => {
          acc[stat.status] = parseInt(stat.count)
          return acc
        }, {})
      }

      // 用户特定统计
      if (userId) {
        const sentTrades = await TradeRecord.count({
          where: {
            ...whereClause,
            from_user_id: userId,
            status: 'completed'
          }
        })

        const receivedTrades = await TradeRecord.count({
          where: {
            ...whereClause,
            to_user_id: userId,
            status: 'completed'
          }
        })

        const sentAmount =
          (await TradeRecord.sum('points_amount', {
            where: {
              ...whereClause,
              from_user_id: userId,
              status: 'completed'
            }
          })) || 0

        const receivedAmount =
          (await TradeRecord.sum('net_amount', {
            where: {
              ...whereClause,
              to_user_id: userId,
              status: 'completed'
            }
          })) || 0

        stats.user_specific = {
          sent_trades: sentTrades,
          received_trades: receivedTrades,
          sent_amount: sentAmount,
          received_amount: receivedAmount,
          net_change: receivedAmount - sentAmount
        }
      }

      // 缓存结果
      if (!this.statisticsCache) {
        this.statisticsCache = {}
      }
      this.statisticsCache[cacheKey] = stats
      this.statisticsExpiry = Date.now() + this.cacheTTL

      return stats
    } catch (error) {
      console.error('❌ 获取交易统计失败:', error.message)
      throw error
    }
  }

  /**
   * 取消待处理的交易
   * @param {String} tradeId - 交易ID
   * @param {Number} userId - 操作用户ID
   * @param {String} reason - 取消原因
   * @returns {Object} 取消结果
   */
  async cancelTrade (tradeId, userId, reason = '用户取消') {
    const transaction = await sequelize.transaction()

    try {
      // 1. 查找交易记录
      const trade = await TradeRecord.findOne({
        where: { trade_id: tradeId },
        transaction
      })

      if (!trade) {
        throw new Error('交易记录不存在')
      }

      // 2. 验证权限和状态
      if (trade.from_user_id !== userId && trade.to_user_id !== userId) {
        throw new Error('无权限取消此交易')
      }

      if (!trade.canCancel()) {
        throw new Error('当前状态不允许取消交易')
      }

      // 3. 退还积分（如果已扣除）
      if (trade.status === 'processing' && trade.from_user_id) {
        const fromUser = await User.findByPk(trade.from_user_id, { transaction })
        if (fromUser) {
          await fromUser.update(
            {
              total_points: fromUser.total_points + trade.points_amount
            },
            { transaction }
          )

          // 记录积分退还
          await PointsRecord.create(
            {
              user_id: trade.from_user_id,
              change_type: 'trade_cancel',
              points_change: trade.points_amount,
              points_balance: fromUser.total_points + trade.points_amount,
              source_type: 'trade',
              source_id: trade.id,
              description: `交易取消退款：${reason}`,
              admin_id: null
            },
            { transaction }
          )
        }
      }

      // 4. 更新交易状态
      await trade.update(
        {
          status: 'cancelled',
          remarks: reason,
          processed_time: new Date()
        },
        { transaction }
      )

      await transaction.commit()

      console.log(`✅ 交易取消成功: ${tradeId}`)

      return {
        trade_id: tradeId,
        status: 'cancelled',
        reason,
        cancelled_at: new Date()
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 取消交易失败:', error.message)
      throw error
    }
  }

  /**
   * 获取交易详情
   * @param {String} tradeId - 交易ID
   * @param {Number} userId - 用户ID（用于权限验证）
   * @returns {Object} 交易详情
   */
  async getTradeDetail (tradeId, userId) {
    try {
      const trade = await TradeRecord.findOne({
        where: { trade_id: tradeId },
        include: [
          {
            model: User,
            as: 'fromUser',
            attributes: ['id', 'nickname', 'phone']
          },
          {
            model: User,
            as: 'toUser',
            attributes: ['id', 'nickname', 'phone']
          }
        ]
      })

      if (!trade) {
        throw new Error('交易记录不存在')
      }

      // 验证权限
      if (trade.from_user_id !== userId && trade.to_user_id !== userId) {
        throw new Error('无权限查看此交易')
      }

      return {
        trade_id: trade.trade_id,
        trade_type: trade.trade_type,
        status: trade.status,
        verification_status: trade.verification_status,
        points_amount: trade.points_amount,
        fee_points: trade.fee_points,
        net_amount: trade.net_amount,
        from_user: trade.fromUser
          ? {
            id: trade.fromUser.id,
            nickname: trade.fromUser.nickname,
            phone: this._maskPhone(trade.fromUser.phone)
          }
          : null,
        to_user: {
          id: trade.toUser.id,
          nickname: trade.toUser.nickname,
          phone: this._maskPhone(trade.toUser.phone)
        },
        trade_reason: trade.trade_reason,
        remarks: trade.remarks,
        related_id: trade.related_id,
        related_type: trade.related_type,
        risk_level: trade.risk_level,
        trade_time: trade.trade_time,
        processed_time: trade.processed_time,
        expires_at: trade.expires_at
      }
    } catch (error) {
      console.error('❌ 获取交易详情失败:', error.message)
      throw error
    }
  }

  /**
   * 私有方法：获取时间范围
   */
  _getTimeRange (period) {
    const now = new Date()
    let start, end

    switch (period) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      end = new Date(start)
      end.setDate(end.getDate() + 1)
      break
    case 'week':
      start = new Date(now)
      start.setDate(now.getDate() - 7)
      end = now
      break
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      break
    case 'year':
      start = new Date(now.getFullYear(), 0, 1)
      end = new Date(now.getFullYear() + 1, 0, 1)
      break
    default:
      start = null
      end = null
    }

    return { start, end, period }
  }

  /**
   * 私有方法：手机号脱敏
   */
  _maskPhone (phone) {
    if (!phone || phone.length < 7) return phone
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  }

  /**
   * 清理统计缓存
   */
  clearStatisticsCache () {
    this.statisticsCache = null
    this.statisticsExpiry = null
    console.log('📊 交易统计缓存已清理')
  }
}

module.exports = TradeService
