const { sequelize } = require('../models')
const { User, PhotoUpload, ReviewRecord, PointsRecord } = require('../models')

/**
 * 管理员审核业务服务类
 * 根据前端业务需求实现完整的审核功能
 */
class AdminReviewService {
  constructor () {
    // 审核统计缓存
    this.statisticsCache = null
    this.statisticsCacheExpiry = null
    this.cacheTTL = 2 * 60 * 1000 // 2分钟缓存
  }

  /**
   * 获取待审核列表
   * 支持分页、筛选、排序等功能
   */
  async getPendingReviews (params = {}) {
    try {
      const {
        page = 1,
        page_size = 20,
        period = 'week',
        status = 'pending',
        sort_by = 'upload_time_desc',
        keyword = '',
        priority = 'all'
      } = params

      // 构建查询条件
      const whereConditions = this._buildReviewsWhereConditions({
        period,
        status,
        keyword,
        priority
      })

      // 构建排序条件
      const orderConditions = this._buildReviewsOrderConditions(sort_by)

      // 计算分页参数
      const limit = parseInt(page_size)
      const offset = (parseInt(page) - 1) * limit

      // 执行查询
      const { count, rows: reviews } = await PhotoUpload.findAndCountAll({
        where: whereConditions,
        order: orderConditions,
        limit,
        offset,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile', 'avatar', 'vip_level', 'total_uploads']
          }
        ]
      })

      // 处理审核列表数据
      const processedReviews = reviews.map(review => this._processReviewData(review))

      // 计算分页信息
      const totalPages = Math.ceil(count / limit)

      // 获取统计信息
      const statistics = await this._getReviewStatistics()

      return {
        reviews: processedReviews,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_count: count,
          has_more: page < totalPages
        },
        statistics
      }
    } catch (error) {
      console.error('❌ 获取待审核列表失败:', error.message)
      throw error
    }
  }

  /**
   * 审核单个照片
   * 支持通过和拒绝两种操作
   */
  async reviewPhoto (uploadId, reviewData, reviewerId) {
    const transaction = await sequelize.transaction()

    try {
      const {
        action, // 'approve' 或 'reject'
        amount = 0,
        points = 0,
        reason,
        review_time,
        client_info
      } = reviewData

      // 1. 获取上传记录
      const upload = await PhotoUpload.findByPk(uploadId, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile', 'total_points']
          }
        ],
        transaction
      })

      if (!upload) {
        throw new Error('上传记录不存在')
      }

      if (upload.review_status !== 'pending') {
        throw new Error(`该记录已被审核，当前状态：${upload.review_status}`)
      }

      // 2. 验证审核数据
      await this._validateReviewData(action, amount, points, reason, upload)

      // 3. 执行审核操作
      const reviewResult = await this._performReview(
        {
          upload,
          action,
          amount,
          points,
          reason,
          reviewerId,
          review_time: review_time || new Date(),
          client_info
        },
        transaction
      )

      await transaction.commit()

      return reviewResult
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 审核照片失败:', error.message)
      throw error
    }
  }

  /**
   * 批量审核照片
   * 支持批量通过和拒绝操作
   */
  async batchReview (reviewsData, reviewerId) {
    const transaction = await sequelize.transaction()

    try {
      const { reviews, batch_id, review_time, batch_reason } = reviewsData

      if (!reviews || reviews.length === 0) {
        throw new Error('批量审核列表不能为空')
      }

      const results = []
      let processedCount = 0
      let failedCount = 0
      let totalPointsAwarded = 0

      // 逐个处理审核
      for (const reviewItem of reviews) {
        try {
          const { upload_id, action, amount, points, reason } = reviewItem

          // 获取上传记录
          const upload = await PhotoUpload.findByPk(upload_id, {
            include: [
              {
                model: User,
                as: 'user',
                attributes: ['user_id', 'nickname', 'mobile', 'total_points']
              }
            ],
            transaction
          })

          if (!upload) {
            results.push({
              upload_id,
              status: 'failed',
              error_message: '上传记录不存在'
            })
            failedCount++
            continue
          }

          if (upload.review_status !== 'pending') {
            results.push({
              upload_id,
              status: 'failed',
              error_message: `记录已被审核，状态：${upload.review_status}`
            })
            failedCount++
            continue
          }

          // 执行单个审核
          const reviewResult = await this._performReview(
            {
              upload,
              action,
              amount,
              points,
              reason: reason || batch_reason,
              reviewerId,
              review_time: review_time || new Date(),
              batch_id
            },
            transaction
          )

          results.push({
            upload_id,
            status: 'success',
            points_awarded: points,
            user_new_balance: reviewResult.user_new_balance,
            error_message: null
          })

          processedCount++
          if (action === 'approve') {
            totalPointsAwarded += points
          }
        } catch (error) {
          results.push({
            upload_id: reviewItem.upload_id,
            status: 'failed',
            error_message: error.message
          })
          failedCount++
        }
      }

      // 更新审核员统计
      const reviewerStats = await this._updateReviewerStats(reviewerId, processedCount, transaction)

      await transaction.commit()

      return {
        batch_id,
        processed_count: processedCount,
        failed_count: failedCount,
        total_points_awarded: totalPointsAwarded,
        processing_time: Date.now() - Date.parse(review_time || new Date()),
        results,
        statistics_update: {
          today_approved: reviewerStats.today_processed,
          total_processed: reviewerStats.total_processed
        }
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 批量审核失败:', error.message)
      throw error
    }
  }

  /**
   * 构建审核查询条件
   */
  _buildReviewsWhereConditions (params) {
    const { period, status, keyword, priority } = params
    const conditions = {}

    // 状态筛选
    if (status !== 'all') {
      conditions.review_status = status
    }

    // 时间范围筛选
    if (period !== 'all') {
      const timeRanges = this._getTimeRanges(period)
      conditions.created_at = {
        [sequelize.Sequelize.Op.gte]: timeRanges.start
      }
      if (timeRanges.end) {
        conditions.created_at[sequelize.Sequelize.Op.lt] = timeRanges.end
      }
    }

    // 优先级筛选
    if (priority !== 'all') {
      conditions.priority = priority
    }

    // 关键词搜索（用户昵称或手机号）
    if (keyword) {
      conditions['$user.nickname$'] = {
        [sequelize.Sequelize.Op.like]: `%${keyword}%`
      }
      // 也可以搜索手机号（需要考虑脱敏）
    }

    return conditions
  }

  /**
   * 构建审核排序条件
   */
  _buildReviewsOrderConditions (sort_by) {
    switch (sort_by) {
    case 'upload_time_asc':
      return [['created_at', 'ASC']]
    case 'upload_time_desc':
      return [['created_at', 'DESC']]
    case 'amount_desc':
      return [
        ['estimated_amount', 'DESC'],
        ['created_at', 'DESC']
      ]
    case 'amount_asc':
      return [
        ['estimated_amount', 'ASC'],
        ['created_at', 'DESC']
      ]
    default:
      return [['created_at', 'ASC']] // 默认按时间正序，先处理早提交的
    }
  }

  /**
   * 获取时间范围
   */
  _getTimeRanges (period) {
    const now = new Date()

    switch (period) {
    case 'today': {
      const today = new Date(now)
      today.setHours(0, 0, 0, 0)
      return { start: today }
    }

    case 'week': {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - 7)
      return { start: weekStart }
    }

    case 'month': {
      const monthStart = new Date(now)
      monthStart.setMonth(now.getMonth() - 1)
      return { start: monthStart }
    }

    default:
      return {}
    }
  }

  /**
   * 处理审核数据
   */
  _processReviewData (review) {
    const data = review.toJSON()

    // 计算等待时长
    data.waiting_hours = this._calculateWaitingHours(data.created_at)

    // 脱敏处理手机号
    if (data.user && data.user.mobile) {
      data.user.phone = this._maskPhoneNumber(data.user.mobile)
      delete data.user.mobile
    }

    // 重命名字段以匹配前端期望
    data.upload_id = data.upload_id || data.id
    data.photo_url = data.file_url
    data.photo_size = data.file_size
    data.upload_time = data.created_at
    data.status = data.review_status

    return data
  }

  /**
   * 计算等待时长
   */
  _calculateWaitingHours (uploadTime) {
    const now = new Date()
    const upload = new Date(uploadTime)
    const diffMs = now - upload
    return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10 // 保留1位小数
  }

  /**
   * 脱敏手机号
   */
  _maskPhoneNumber (mobile) {
    if (!mobile || mobile.length < 7) return mobile
    return mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  }

  /**
   * 验证审核数据
   */
  async _validateReviewData (action, amount, points, reason, _upload) {
    if (!['approve', 'reject'].includes(action)) {
      throw new Error('无效的审核操作')
    }

    if (action === 'approve') {
      if (!amount || amount <= 0) {
        throw new Error('审核通过时必须填写消费金额')
      }

      if (!points || points <= 0) {
        throw new Error('审核通过时必须计算积分奖励')
      }

      // 验证积分计算（假设1元=10积分）
      const expectedPoints = Math.floor(amount * 10)
      if (Math.abs(points - expectedPoints) > 1) {
        throw new Error(`积分计算错误，${amount}元应为${expectedPoints}积分`)
      }
    } else if (action === 'reject') {
      if (!reason || reason.trim().length === 0) {
        throw new Error('拒绝审核时必须填写拒绝原因')
      }

      if (amount !== 0 || points !== 0) {
        throw new Error('拒绝审核时金额和积分应为0')
      }
    }
  }

  /**
   * 执行审核操作
   */
  async _performReview (reviewParams, transaction) {
    const {
      upload,
      action,
      amount,
      points,
      reason,
      reviewerId,
      review_time,
      client_info,
      batch_id
    } = reviewParams

    const processingStartTime = Date.now()

    // 1. 更新上传记录状态
    await PhotoUpload.update(
      {
        review_status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_at: review_time,
        reviewed_by: reviewerId,
        review_amount: amount,
        review_points: points,
        review_reason: reason
      },
      {
        where: { upload_id: upload.upload_id },
        transaction
      }
    )

    // 2. 创建审核记录
    const reviewRecord = await ReviewRecord.create(
      {
        upload_id: upload.upload_id,
        reviewer_id: reviewerId,
        action,
        amount,
        points_awarded: points,
        review_reason: reason,
        review_time,
        process_duration: (Date.now() - processingStartTime) / 1000,
        batch_id,
        client_info
      },
      { transaction }
    )

    let userNewBalance = upload.user.total_points

    // 3. 如果是通过，发放积分
    if (action === 'approve' && points > 0) {
      await this._awardPoints(upload.user, points, amount, upload.upload_id, transaction)
      userNewBalance = upload.user.total_points + points
    }

    return {
      review_id: reviewRecord.review_id,
      upload_id: upload.upload_id,
      status: action === 'approve' ? 'approved' : 'rejected',
      points_awarded: points,
      user_old_balance: upload.user.total_points,
      user_new_balance: userNewBalance,
      processed_at: review_time.toISOString(),
      process_duration: (Date.now() - processingStartTime) / 1000 / 3600 // 转换为小时
    }
  }

  /**
   * 发放积分
   */
  async _awardPoints (user, points, amount, uploadId, transaction) {
    // 更新用户积分
    await User.increment('total_points', {
      by: points,
      where: { user_id: user.user_id },
      transaction
    })

    // 更新累计积分
    await User.increment('cumulative_points', {
      by: points,
      where: { user_id: user.user_id },
      transaction
    })

    // 记录积分变动
    await PointsRecord.create(
      {
        user_id: user.user_id,
        change_type: 'award',
        change_amount: points,
        change_reason: `照片审核通过，消费金额${amount}元`,
        operation_type: 'review_approve',
        before_balance: user.total_points,
        after_balance: user.total_points + points,
        related_id: uploadId
      },
      { transaction }
    )
  }

  /**
   * 更新审核员统计
   */
  async _updateReviewerStats (reviewerId, processedCount, _transaction) {
    // 这里可以实现审核员统计逻辑
    // 暂时返回模拟数据
    return {
      today_processed: processedCount,
      total_processed: processedCount
    }
  }

  /**
   * 获取审核统计信息
   */
  async _getReviewStatistics () {
    try {
      // 检查缓存
      if (
        this.statisticsCache &&
        this.statisticsCacheExpiry &&
        Date.now() < this.statisticsCacheExpiry
      ) {
        return this.statisticsCache
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const [pendingCount, todayApproved, todayRejected, totalProcessed] = await Promise.all([
        PhotoUpload.count({ where: { review_status: 'pending' } }),
        PhotoUpload.count({
          where: {
            review_status: 'approved',
            reviewed_at: { [sequelize.Sequelize.Op.gte]: today }
          }
        }),
        PhotoUpload.count({
          where: {
            review_status: 'rejected',
            reviewed_at: { [sequelize.Sequelize.Op.gte]: today }
          }
        }),
        PhotoUpload.count({
          where: {
            review_status: { [sequelize.Sequelize.Op.in]: ['approved', 'rejected'] }
          }
        })
      ])

      // 计算平均处理时长
      const avgProcessTime = await this._calculateAvgProcessTime()

      // 计算通过率
      const approvalRate =
        totalProcessed > 0
          ? Math.round((todayApproved / (todayApproved + todayRejected)) * 100 * 10) / 10
          : 0

      const statistics = {
        pending_count: pendingCount,
        today_approved: todayApproved,
        today_rejected: todayRejected,
        total_processed: totalProcessed,
        avg_process_time: avgProcessTime,
        approval_rate: approvalRate
      }

      // 更新缓存
      this.statisticsCache = statistics
      this.statisticsCacheExpiry = Date.now() + this.cacheTTL

      return statistics
    } catch (error) {
      console.error('❌ 获取审核统计失败:', error.message)
      return {
        pending_count: 0,
        today_approved: 0,
        today_rejected: 0,
        total_processed: 0,
        avg_process_time: 0,
        approval_rate: 0
      }
    }
  }

  /**
   * 计算平均处理时长
   */
  async _calculateAvgProcessTime () {
    try {
      const reviews = await ReviewRecord.findAll({
        attributes: ['process_duration'],
        where: {
          process_duration: { [sequelize.Sequelize.Op.ne]: null }
        },
        limit: 100, // 取最近100条记录
        order: [['created_at', 'DESC']]
      })

      if (reviews.length === 0) return 0

      const totalDuration = reviews.reduce((sum, review) => sum + (review.process_duration || 0), 0)
      return Math.round((totalDuration / reviews.length) * 10) / 10 // 保留1位小数
    } catch (error) {
      console.error('❌ 计算平均处理时长失败:', error.message)
      return 0
    }
  }

  /**
   * 获取审核员统计数据
   */
  async getReviewerStatistics (reviewerId, period = 'today') {
    try {
      const timeRanges = this._getTimeRanges(period)
      const whereConditions = { reviewer_id: reviewerId }

      if (timeRanges.start) {
        whereConditions.review_time = { [sequelize.Sequelize.Op.gte]: timeRanges.start }
      }

      const [totalProcessed, approvedCount, rejectedCount] = await Promise.all([
        ReviewRecord.count({ where: whereConditions }),
        ReviewRecord.count({ where: { ...whereConditions, action: 'approve' } }),
        ReviewRecord.count({ where: { ...whereConditions, action: 'reject' } })
      ])

      const totalPointsAwarded = await ReviewRecord.sum('points_awarded', {
        where: { ...whereConditions, action: 'approve' }
      })

      return {
        reviewer_id: reviewerId,
        period,
        total_processed: totalProcessed,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        approval_rate: totalProcessed > 0 ? Math.round((approvedCount / totalProcessed) * 100) : 0,
        total_points_awarded: totalPointsAwarded || 0,
        last_updated: new Date().toISOString()
      }
    } catch (error) {
      console.error('❌ 获取审核员统计失败:', error.message)
      throw error
    }
  }

  /**
   * 清除统计缓存
   */
  clearStatisticsCache () {
    this.statisticsCache = null
    this.statisticsCacheExpiry = null
  }
}

module.exports = AdminReviewService
