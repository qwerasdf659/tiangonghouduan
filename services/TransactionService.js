/**
 * 餐厅积分抽奖系统 v3.0 - 交易记录服务
 * 聚合各种交易记录提供统一的交易历史API
 * 创建时间：2025年01月28日
 */

const { Op } = require('sequelize')
const {
  PointsRecord,
  TradeRecord,
  ExchangeRecord,
  LotteryRecord,
  UploadReview,
  User,
  Product,
  Prize
} = require('../models')
const moment = require('moment')

class TransactionService {
  constructor () {
    console.log('📊 交易记录服务初始化完成')
  }

  /**
   * 获取用户交易记录列表
   */
  async getTransactionList (userId, options = {}) {
    try {
      const {
        page = 1,
        pageSize = 20,
        timeFilter = 'all',
        typeFilter = 'all',
        amountFilter = 'all',
        statusFilter = 'all',
        keyword = ''
      } = options

      // 构建时间范围条件
      const timeCondition = this.buildTimeCondition(timeFilter)

      // 获取各类交易记录
      const pointsRecords = await this.getPointsRecords(userId, timeCondition, typeFilter)
      const tradeRecords = await this.getTradeRecords(userId, timeCondition, typeFilter)
      const exchangeRecords = await this.getExchangeRecords(userId, timeCondition, typeFilter)
      const lotteryRecords = await this.getLotteryRecords(userId, timeCondition, typeFilter)
      const uploadRecords = await this.getUploadRecords(userId, timeCondition, typeFilter)

      // 合并所有记录
      let allRecords = [
        ...pointsRecords,
        ...tradeRecords,
        ...exchangeRecords,
        ...lotteryRecords,
        ...uploadRecords
      ]

      // 关键词筛选
      if (keyword) {
        allRecords = allRecords.filter(
          record => record.title.includes(keyword) || record.description.includes(keyword)
        )
      }

      // 金额筛选
      if (amountFilter !== 'all') {
        allRecords = allRecords.filter(record => {
          const absAmount = Math.abs(record.amount)
          switch (amountFilter) {
          case 'small':
            return absAmount <= 100
          case 'medium':
            return absAmount > 100 && absAmount <= 500
          case 'large':
            return absAmount > 500
          default:
            return true
          }
        })
      }

      // 状态筛选
      if (statusFilter !== 'all') {
        allRecords = allRecords.filter(record => record.status === statusFilter)
      }

      // 按时间排序
      allRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      // 分页处理
      const totalCount = allRecords.length
      const offset = (page - 1) * pageSize
      const records = allRecords.slice(offset, offset + pageSize)

      // 获取统计信息
      const monthlyStats = await this.getMonthlyStats(userId)

      return {
        records,
        pagination: {
          currentPage: page,
          pageSize,
          totalItems: totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
          hasNext: page < Math.ceil(totalCount / pageSize),
          hasPrev: page > 1
        },
        monthlyStats
      }
    } catch (error) {
      console.error('❌ 获取交易记录列表失败:', error.message)
      throw new Error('获取交易记录失败')
    }
  }

  /**
   * 获取交易详情
   */
  async getTransactionDetail (userId, txnId) {
    try {
      // 根据txnId前缀判断记录类型并查找详情
      let record = null
      let details = {}

      if (txnId.startsWith('pt_')) {
        // 积分记录
        record = await PointsRecord.findOne({
          where: { id: txnId.replace('pt_', ''), user_id: userId }
        })
        if (record) {
          details = await this.buildPointsRecordDetails(record)
        }
      } else if (txnId.startsWith('tr_')) {
        // 交易记录
        record = await TradeRecord.findOne({
          where: { trade_id: txnId, [Op.or]: [{ from_user_id: userId }, { to_user_id: userId }] },
          include: [
            { model: User, as: 'fromUser', attributes: ['user_id', 'mobile', 'nickname'] },
            { model: User, as: 'toUser', attributes: ['user_id', 'mobile', 'nickname'] }
          ]
        })
        if (record) {
          details = await this.buildTradeRecordDetails(record)
        }
      } else if (txnId.startsWith('ex_')) {
        // 兑换记录
        record = await ExchangeRecord.findOne({
          where: { exchange_id: txnId, user_id: userId }
        })
        if (record) {
          details = await this.buildExchangeRecordDetails(record)
        }
      } else if (txnId.startsWith('lt_')) {
        // 抽奖记录
        record = await LotteryRecord.findOne({
          where: { draw_id: txnId, user_id: userId }
        })
        if (record) {
          details = await this.buildLotteryRecordDetails(record)
        }
      }

      if (!record) {
        throw new Error('交易记录不存在')
      }

      return details
    } catch (error) {
      console.error('❌ 获取交易详情失败:', error.message)
      throw error
    }
  }

  /**
   * 导出交易数据
   */
  async exportTransactionData (userId, options = {}) {
    try {
      const { timeFilter = 'month', typeFilter = 'all', format = 'excel' } = options

      // 获取完整的交易记录
      const allRecords = await this.getTransactionList(userId, {
        timeFilter,
        typeFilter,
        pageSize: 10000 // 获取所有记录
      })

      // 生成导出文件URL（使用真实的存储服务配置）
      const timestamp = moment().format('YYYYMMDD_HHmmss')
      const filename = `交易记录_${userId}_${timestamp}.${format === 'excel' ? 'xlsx' : 'csv'}`

      // ✅ 使用真实的Sealos存储服务URL，不再使用占位符
      const storageEndpoint =
        process.env.SEALOS_ENDPOINT || 'https://objectstorageapi.bja.sealos.run'
      const bucketName = process.env.SEALOS_BUCKET || 'tiangong'
      const downloadUrl = `${storageEndpoint}/${bucketName}/exports/${filename}`

      return {
        downloadUrl,
        filename,
        expiresAt: moment().add(1, 'hour').format('YYYY-MM-DD HH:mm:ss'),
        totalRecords: allRecords.records.length
      }
    } catch (error) {
      console.error('❌ 导出交易数据失败:', error.message)
      throw new Error('导出交易数据失败')
    }
  }

  /**
   * 获取所有用户交易记录（管理员功能）
   */
  async getAllTransactions (options = {}) {
    try {
      const {
        page = 1,
        pageSize = 50,
        timeFilter = 'all',
        _typeFilter = 'all',
        _amountFilter = 'all',
        _statusFilter = 'all',
        userId = null,
        keyword = ''
      } = options

      // 构建时间范围条件
      const timeCondition = this.buildTimeCondition(timeFilter)

      // 聚合所有类型的交易记录
      const transactions = []

      // 获取积分记录
      const pointsQuery = {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'mobile', 'nickname']
          }
        ],
        where: timeCondition,
        order: [['created_at', 'DESC']],
        limit: pageSize * 5 // 获取更多数据用于后续筛选
      }

      if (userId) {
        pointsQuery.where.user_id = userId
      }

      if (keyword) {
        pointsQuery.where.description = {
          [Op.like]: `%${keyword}%`
        }
      }

      const pointsRecords = await PointsRecord.findAll(pointsQuery)

      pointsRecords.forEach(record => {
        transactions.push({
          id: `points_${record.id}`,
          type: 'points',
          subType: record.type,
          userId: record.user_id,
          user: record.user,
          amount: record.points,
          description: record.description,
          source: record.source,
          status: 'completed',
          createdAt: record.created_at,
          updatedAt: record.updated_at
        })
      })

      // 获取交易记录
      const tradeQuery = {
        include: [
          {
            model: User,
            as: 'fromUser',
            attributes: ['user_id', 'mobile', 'nickname']
          },
          {
            model: User,
            as: 'toUser',
            attributes: ['user_id', 'mobile', 'nickname']
          }
        ],
        where: timeCondition,
        order: [['created_at', 'DESC']],
        limit: pageSize * 2
      }

      if (userId) {
        tradeQuery.where = {
          ...tradeQuery.where,
          [Op.or]: [{ from_user_id: userId }, { to_user_id: userId }]
        }
      }

      const tradeRecords = await TradeRecord.findAll(tradeQuery)

      tradeRecords.forEach(record => {
        transactions.push({
          id: `trade_${record.id}`,
          type: 'trade',
          subType: record.trade_type,
          userId: record.from_user_id,
          user: record.fromUser,
          targetUserId: record.to_user_id,
          targetUser: record.toUser,
          amount: record.points,
          description: `交易转让给 ${record.toUser?.nickname || record.to_user_id}`,
          status: record.status,
          createdAt: record.created_at,
          updatedAt: record.updated_at
        })
      })

      // 获取兑换记录
      const exchangeQuery = {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'mobile', 'nickname']
          },
          {
            model: Product,
            as: 'product',
            attributes: ['product_id', 'name', 'points_required']
          }
        ],
        where: timeCondition,
        order: [['created_at', 'DESC']],
        limit: pageSize * 2
      }

      if (userId) {
        exchangeQuery.where.user_id = userId
      }

      const exchangeRecords = await ExchangeRecord.findAll(exchangeQuery)

      exchangeRecords.forEach(record => {
        transactions.push({
          id: `exchange_${record.id}`,
          type: 'exchange',
          subType: 'product_exchange',
          userId: record.user_id,
          user: record.user,
          amount: -record.points_cost,
          description: `兑换商品：${record.product?.name || '未知商品'}`,
          status: record.status,
          productInfo: record.product,
          createdAt: record.created_at,
          updatedAt: record.updated_at
        })
      })

      // 获取抽奖记录
      const lotteryQuery = {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'mobile', 'nickname']
          },
          {
            model: Prize,
            as: 'prize',
            attributes: ['prize_id', 'name', 'type', 'value']
          }
        ],
        where: timeCondition,
        order: [['created_at', 'DESC']],
        limit: pageSize * 2
      }

      if (userId) {
        lotteryQuery.where.user_id = userId
      }

      const lotteryRecords = await LotteryRecord.findAll(lotteryQuery)

      lotteryRecords.forEach(record => {
        transactions.push({
          id: `lottery_${record.id}`,
          type: 'lottery',
          subType: 'draw',
          userId: record.user_id,
          user: record.user,
          amount: -record.cost_points,
          description: `抽奖获得：${record.prize?.name || '未知奖品'}`,
          status: 'completed',
          prizeInfo: record.prize,
          createdAt: record.created_at,
          updatedAt: record.updated_at
        })
      })

      // 排序和分页
      transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      const totalCount = transactions.length
      const startIndex = (page - 1) * pageSize
      const endIndex = startIndex + pageSize
      const paginatedTransactions = transactions.slice(startIndex, endIndex)

      return {
        transactions: paginatedTransactions,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize)
        },
        summary: {
          pointsEarned: transactions
            .filter(t => t.amount > 0)
            .reduce((sum, t) => sum + t.amount, 0),
          pointsSpent: transactions
            .filter(t => t.amount < 0)
            .reduce((sum, t) => sum + Math.abs(t.amount), 0),
          totalTransactions: totalCount
        }
      }
    } catch (error) {
      console.error('❌ 获取所有交易记录失败:', error.message)
      throw error
    }
  }

  /**
   * 构建时间条件
   */
  buildTimeCondition (timeFilter) {
    const now = moment()
    let startTime = null

    switch (timeFilter) {
    case 'today':
      startTime = now.startOf('day')
      break
    case 'week':
      startTime = now.startOf('week')
      break
    case 'month':
      startTime = now.startOf('month')
      break
    case 'quarter':
      startTime = now.startOf('quarter')
      break
    default:
      return null
    }

    return {
      created_at: {
        [Op.gte]: startTime.toDate()
      }
    }
  }

  /**
   * 获取积分记录
   */
  async getPointsRecords (userId, timeCondition, _typeFilter) {
    const whereCondition = { user_id: userId }
    if (timeCondition) {
      whereCondition.created_at = timeCondition.created_at
    }

    const records = await PointsRecord.findAll({
      where: whereCondition,
      order: [['created_at', 'DESC']],
      limit: 1000
    })

    return records.map(record => ({
      id: `pt_${record.id}`,
      type: this.mapPointsRecordType(record.source),
      category: record.type === 'earn' ? 'income' : 'expense',
      amount: record.type === 'earn' ? record.points : -record.points,
      title: this.getPointsRecordTitle(record),
      description: record.description,
      status: 'completed',
      createdAt: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
      txnId: `PT${moment(record.created_at).format('YYMMDDHHmmss')}${record.id.toString().padStart(3, '0')}`,
      relatedItem: this.getPointsRecordRelatedItem(record)
    }))
  }

  /**
   * 获取交易记录
   */
  async getTradeRecords (userId, timeCondition, _typeFilter) {
    const whereCondition = {
      [Op.or]: [{ from_user_id: userId }, { to_user_id: userId }]
    }
    if (timeCondition) {
      whereCondition.created_at = timeCondition.created_at
    }

    const records = await TradeRecord.findAll({
      where: whereCondition,
      include: [
        { model: User, as: 'fromUser', attributes: ['user_id', 'mobile', 'nickname'] },
        { model: User, as: 'toUser', attributes: ['user_id', 'mobile', 'nickname'] }
      ],
      order: [['created_at', 'DESC']],
      limit: 1000
    })

    return records.map(record => ({
      id: record.trade_id,
      type: 'trade',
      category: record.to_user_id === userId ? 'income' : 'expense',
      amount: record.to_user_id === userId ? record.net_amount : -record.points_amount,
      title: this.getTradeRecordTitle(record, userId),
      description: record.trade_reason,
      status: record.status,
      createdAt: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
      txnId: record.trade_id.toUpperCase(),
      relatedItem: null,
      operator: record.operator_id ? `admin${record.operator_id}` : 'system'
    }))
  }

  /**
   * 获取兑换记录
   */
  async getExchangeRecords (userId, timeCondition, _typeFilter) {
    const whereCondition = { user_id: userId }
    if (timeCondition) {
      whereCondition.exchange_time = timeCondition.created_at
    }

    const records = await ExchangeRecord.findAll({
      where: whereCondition,
      order: [['exchange_time', 'DESC']],
      limit: 1000
    })

    return records.map(record => ({
      id: record.exchange_id,
      type: 'exchange',
      category: 'expense',
      amount: -record.total_points,
      title: '商品兑换',
      description: `兑换${record.product_snapshot?.name || '商品'} x${record.quantity}`,
      status: record.status,
      createdAt: moment(record.exchange_time).format('YYYY-MM-DD HH:mm:ss'),
      txnId: record.exchange_id.toUpperCase(),
      relatedItem: {
        type: 'product',
        name: record.product_snapshot?.name || '商品',
        icon: '🎁'
      }
    }))
  }

  /**
   * 获取抽奖记录
   */
  async getLotteryRecords (userId, timeCondition, _typeFilter) {
    const whereCondition = { user_id: userId }
    if (timeCondition) {
      whereCondition.created_at = timeCondition.created_at
    }

    const records = await LotteryRecord.findAll({
      where: whereCondition,
      order: [['created_at', 'DESC']],
      limit: 1000
    })

    return records.map(record => ({
      id: record.draw_id,
      type: 'lottery',
      category: 'expense',
      amount: -record.cost_points,
      title: '抽奖消费',
      description: record.prize_name ? `中奖：${record.prize_name}` : '未中奖',
      status: 'completed',
      createdAt: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
      txnId: record.draw_id.toUpperCase(),
      relatedItem: record.prize_name
        ? {
          type: 'prize',
          name: record.prize_name,
          icon: '🎁'
        }
        : null
    }))
  }

  /**
   * 获取上传记录
   */
  async getUploadRecords (userId, timeCondition, _typeFilter) {
    const whereCondition = { user_id: userId, status: 'approved' }
    if (timeCondition) {
      whereCondition.created_at = timeCondition.created_at
    }

    const records = await UploadReview.findAll({
      where: whereCondition,
      order: [['created_at', 'DESC']],
      limit: 1000
    })

    return records.map(record => ({
      id: `up_${record.id}`,
      type: 'upload',
      category: 'income',
      amount: record.awarded_points || 0,
      title: '图片上传奖励',
      description: '图片审核通过获得积分',
      status: 'completed',
      createdAt: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
      txnId: `UP${moment(record.created_at).format('YYMMDDHHmmss')}${record.id.toString().padStart(3, '0')}`,
      relatedItem: {
        type: 'upload',
        name: '图片上传',
        icon: '📷'
      },
      originalAmount: record.declared_amount,
      reviewer: `admin${record.reviewer_id}`
    }))
  }

  /**
   * 获取月度统计
   */
  async getMonthlyStats (userId) {
    const now = moment()
    const startOfMonth = now.clone().startOf('month')
    const startOfLastMonth = now.clone().subtract(1, 'month').startOf('month')
    const endOfLastMonth = now.clone().subtract(1, 'month').endOf('month')

    try {
      // 本月积分收入统计
      const thisMonthIncome =
        (await PointsRecord.sum('points', {
          where: {
            user_id: userId,
            type: 'earn',
            created_at: { [Op.gte]: startOfMonth.toDate() }
          }
        })) || 0

      // 本月积分支出统计
      const thisMonthExpense =
        (await PointsRecord.sum('points', {
          where: {
            user_id: userId,
            type: 'spend',
            created_at: { [Op.gte]: startOfMonth.toDate() }
          }
        })) || 0

      // 上月统计用于计算环比
      const lastMonthIncome =
        (await PointsRecord.sum('points', {
          where: {
            user_id: userId,
            type: 'earn',
            created_at: {
              [Op.between]: [startOfLastMonth.toDate(), endOfLastMonth.toDate()]
            }
          }
        })) || 0

      const lastMonthExpense =
        (await PointsRecord.sum('points', {
          where: {
            user_id: userId,
            type: 'spend',
            created_at: {
              [Op.between]: [startOfLastMonth.toDate(), endOfLastMonth.toDate()]
            }
          }
        })) || 0

      // 计算环比变化
      const incomeChange =
        lastMonthIncome > 0 ? ((thisMonthIncome - lastMonthIncome) / lastMonthIncome) * 100 : 0
      const expenseChange =
        lastMonthExpense > 0 ? ((thisMonthExpense - lastMonthExpense) / lastMonthExpense) * 100 : 0

      // 交易次数统计
      const transactionCount = await PointsRecord.count({
        where: {
          user_id: userId,
          created_at: { [Op.gte]: startOfMonth.toDate() }
        }
      })

      const lastMonthTransactionCount = await PointsRecord.count({
        where: {
          user_id: userId,
          created_at: {
            [Op.between]: [startOfLastMonth.toDate(), endOfLastMonth.toDate()]
          }
        }
      })

      const countChange =
        lastMonthTransactionCount > 0
          ? ((transactionCount - lastMonthTransactionCount) / lastMonthTransactionCount) * 100
          : 0

      return {
        totalIncome: thisMonthIncome,
        totalExpense: thisMonthExpense,
        netIncome: thisMonthIncome - thisMonthExpense,
        transactionCount,
        incomeChange: Math.round(incomeChange * 10) / 10,
        expenseChange: Math.round(expenseChange * 10) / 10,
        netChange: Math.round((incomeChange - expenseChange) * 10) / 10,
        countChange: Math.round(countChange * 10) / 10
      }
    } catch (error) {
      console.error('❌ 获取月度统计失败:', error.message)
      return {
        totalIncome: 0,
        totalExpense: 0,
        netIncome: 0,
        transactionCount: 0,
        incomeChange: 0,
        expenseChange: 0,
        netChange: 0,
        countChange: 0
      }
    }
  }

  /**
   * 辅助方法 - 映射积分记录类型
   */
  mapPointsRecordType (source) {
    const typeMap = {
      photo_upload: 'upload',
      lottery: 'lottery',
      exchange: 'exchange',
      check_in: 'checkin',
      admin: 'compensation',
      register: 'activity'
    }
    return typeMap[source] || 'other'
  }

  /**
   * 辅助方法 - 获取积分记录标题
   */
  getPointsRecordTitle (record) {
    const titleMap = {
      photo_upload: '图片上传奖励',
      lottery: '抽奖消费',
      exchange: '商品兑换',
      check_in: '签到奖励',
      admin: '积分调整',
      register: '注册奖励'
    }
    return titleMap[record.source] || '积分变动'
  }

  /**
   * 辅助方法 - 获取积分记录关联项
   */
  getPointsRecordRelatedItem (record) {
    const itemMap = {
      photo_upload: { type: 'upload', name: '图片上传', icon: '📷' },
      lottery: { type: 'lottery', name: '抽奖', icon: '🎰' },
      exchange: { type: 'exchange', name: '商品兑换', icon: '🎁' },
      check_in: { type: 'checkin', name: '签到', icon: '📅' },
      admin: { type: 'admin', name: '管理员操作', icon: '⚙️' },
      register: { type: 'register', name: '注册奖励', icon: '🎉' }
    }
    return itemMap[record.source] || null
  }

  /**
   * 辅助方法 - 获取交易记录标题
   */
  getTradeRecordTitle (record, userId) {
    if (record.to_user_id === userId) {
      return '积分收入'
    } else {
      return '积分转出'
    }
  }

  /**
   * 构建详细记录详情的辅助方法
   */
  async buildPointsRecordDetails (record) {
    return {
      id: `pt_${record.id}`,
      type: this.mapPointsRecordType(record.source),
      category: record.type,
      amount: record.type === 'earn' ? record.points : -record.points,
      title: this.getPointsRecordTitle(record),
      description: record.description,
      status: 'completed',
      createdAt: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
      completedAt: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
      txnId: `PT${moment(record.created_at).format('YYMMDDHHmmss')}${record.id.toString().padStart(3, '0')}`,
      details: {
        operationSteps: [
          {
            step: '创建交易',
            time: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          },
          {
            step: '处理交易',
            time: moment(record.created_at).add(1, 'second').format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          },
          {
            step: '完成交易',
            time: moment(record.created_at).add(2, 'seconds').format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          }
        ],
        relatedItems: []
      }
    }
  }

  async buildTradeRecordDetails (record) {
    return {
      id: record.trade_id,
      type: 'trade',
      category: 'trade',
      amount: record.points_amount,
      title: '积分交易',
      description: record.trade_reason,
      status: record.status,
      createdAt: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
      completedAt: record.updated_at
        ? moment(record.updated_at).format('YYYY-MM-DD HH:mm:ss')
        : null,
      txnId: record.trade_id.toUpperCase(),
      details: {
        operationSteps: [
          {
            step: '发起交易',
            time: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          },
          {
            step: '处理交易',
            time: moment(record.created_at).add(30, 'seconds').format('YYYY-MM-DD HH:mm:ss'),
            status: record.status === 'completed' ? 'completed' : 'pending'
          },
          {
            step: '完成交易',
            time: record.updated_at
              ? moment(record.updated_at).format('YYYY-MM-DD HH:mm:ss')
              : null,
            status: record.status
          }
        ],
        relatedItems: []
      }
    }
  }

  async buildExchangeRecordDetails (record) {
    return {
      id: record.exchange_id,
      type: 'exchange',
      category: 'expense',
      amount: -record.total_points,
      title: '商品兑换',
      description: `兑换${record.product_snapshot?.name || '商品'}`,
      status: record.status,
      createdAt: moment(record.exchange_time).format('YYYY-MM-DD HH:mm:ss'),
      completedAt: moment(record.exchange_time).format('YYYY-MM-DD HH:mm:ss'),
      txnId: record.exchange_id.toUpperCase(),
      details: {
        operationSteps: [
          {
            step: '选择商品',
            time: moment(record.exchange_time).subtract(1, 'minute').format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          },
          {
            step: '确认兑换',
            time: moment(record.exchange_time).format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          },
          {
            step: '生成兑换码',
            time: moment(record.exchange_time).add(1, 'second').format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          }
        ],
        relatedItems: [
          {
            id: record.product_id,
            name: record.product_snapshot?.name || '商品',
            type: 'product',
            action: '兑换'
          }
        ]
      }
    }
  }

  async buildLotteryRecordDetails (record) {
    return {
      id: record.draw_id,
      type: 'lottery',
      category: 'expense',
      amount: -record.cost_points,
      title: '抽奖消费',
      description: record.prize_name ? `中奖：${record.prize_name}` : '抽奖未中奖',
      status: 'completed',
      createdAt: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
      completedAt: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
      txnId: record.draw_id.toUpperCase(),
      details: {
        operationSteps: [
          {
            step: '开始抽奖',
            time: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          },
          {
            step: '计算结果',
            time: moment(record.created_at).add(2, 'seconds').format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          },
          {
            step: '确定奖品',
            time: moment(record.created_at).add(3, 'seconds').format('YYYY-MM-DD HH:mm:ss'),
            status: 'completed'
          }
        ],
        relatedItems: record.prize_name
          ? [
            {
              id: record.prize_id,
              name: record.prize_name,
              type: 'prize',
              action: '获得'
            }
          ]
          : []
      }
    }
  }
}

module.exports = TransactionService
