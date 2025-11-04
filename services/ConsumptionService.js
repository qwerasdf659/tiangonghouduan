/**
 * 餐厅积分抽奖系统 V4.0 - 消费记录服务
 *
 * 业务场景：商家扫码录入方案A
 * 核心职责：管理消费记录的提交、审核和积分奖励流程
 *
 * 主要功能：
 * 1. 商家提交消费记录（扫码录入）
 * 2. 管理员审核（通过/拒绝）
 * 3. 审核通过自动奖励积分（通过PointsService）
 * 4. 用户查询自己的消费记录
 * 5. 防重复提交检查（3分钟防误操作窗口）
 *
 * 集成服务：
 * - PointsService：积分奖励
 * - QRCodeValidator：二维码验证
 * - ContentReviewRecord：审核记录
 *
 * 创建时间：2025年10月30日
 * 最后更新：2025年10月30日
 */

'use strict'

const { ConsumptionRecord, ContentReviewRecord, User } = require('../models')
const PointsService = require('./PointsService')
const QRCodeValidator = require('../utils/QRCodeValidator')
const BeijingTimeHelper = require('../utils/timeHelper')
const { Sequelize, Transaction } = require('sequelize')
const { Op } = Sequelize

/**
 * 消费记录服务类
 * 负责商家扫码录入消费记录的业务逻辑处理
 *
 * @class ConsumptionService
 */
class ConsumptionService {
  /**
   * 商家提交消费记录
   *
   * @param {Object} data - 消费记录数据
   * @param {string} data.qr_code - 用户二维码
   * @param {number} data.consumption_amount - 消费金额（元）
   * @param {string} data.merchant_notes - 商家备注（可选）
   * @param {number} data.merchant_id - 商家ID（录入人）
   * @returns {Object} 创建的消费记录
   */
  static async merchantSubmitConsumption (data) {
    try {
      // 1. 验证必填参数
      if (!data.qr_code) {
        throw new Error('二维码不能为空')
      }
      if (!data.consumption_amount || data.consumption_amount <= 0) {
        throw new Error('消费金额必须大于0')
      }
      if (!data.merchant_id) {
        throw new Error('商家ID不能为空')
      }

      // 2. 验证二维码
      const qrValidation = QRCodeValidator.validateQRCode(data.qr_code)
      if (!qrValidation.valid) {
        throw new Error(`二维码验证失败：${qrValidation.error}`)
      }

      const userId = qrValidation.user_id

      // 3. 检查用户是否存在
      const user = await User.findByPk(userId)
      if (!user) {
        throw new Error(`用户不存在（ID: ${userId}）`)
      }

      // 4. 防重复提交检查（3分钟防误操作窗口）
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000)
      const recentRecord = await ConsumptionRecord.findOne({
        where: {
          user_id: userId,
          merchant_id: data.merchant_id,
          qr_code: data.qr_code,
          created_at: {
            [Op.gte]: threeMinutesAgo
          }
        },
        order: [['created_at', 'DESC']]
      })

      if (recentRecord) {
        const antiMisopCheck = QRCodeValidator.checkAntiMisoperation(
          data.qr_code,
          recentRecord.created_at
        )
        if (!antiMisopCheck.allowed) {
          throw new Error(antiMisopCheck.message)
        }
      }

      // 5. 计算预计奖励积分（1元=1分，四舍五入）
      const pointsToAward = Math.round(parseFloat(data.consumption_amount))

      // 6. 创建消费记录
      const consumptionRecord = await ConsumptionRecord.create({
        user_id: userId,
        merchant_id: data.merchant_id,
        consumption_amount: data.consumption_amount,
        points_to_award: pointsToAward,
        status: 'pending', // 初始状态：待审核
        qr_code: data.qr_code,
        merchant_notes: data.merchant_notes || null,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      })

      /*
       * 7. 创建冻结积分交易记录（status='pending'，表示积分冻结中）
       * 💡 核心逻辑：商家提交时就创建pending状态的积分交易，用户可以看到"冻结积分"
       * ⭐ 重要：这些冻结的积分不会影响用户原有的可用积分
       */
      const pointsTransaction = await PointsService.createPendingPointsForConsumption({
        user_id: userId,
        points: pointsToAward,
        reference_type: 'consumption',
        reference_id: consumptionRecord.record_id,
        business_type: 'consumption_reward',
        transaction_title: '消费奖励（待审核）',
        transaction_description: `消费${data.consumption_amount}元，预计奖励${pointsToAward}分，审核通过后到账`
      })

      console.log(
        `✅ 积分冻结记录创建成功: transaction_id=${pointsTransaction.transaction_id}, points=${pointsToAward}分, status=pending`
      )

      // 8. 创建审核记录（使用ContentReviewRecord表）
      await ContentReviewRecord.create({
        auditable_type: 'consumption',
        auditable_id: consumptionRecord.record_id,
        audit_status: 'pending',
        auditor_id: null,
        audit_reason: null,
        submitted_at: BeijingTimeHelper.createDatabaseTime(), // 提交审核时间（必需字段）
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      })

      console.log(
        `✅ 消费记录创建成功: record_id=${consumptionRecord.record_id}, user_id=${userId}, amount=${data.consumption_amount}元, frozen_points=${pointsToAward}分`
      )

      return consumptionRecord
    } catch (error) {
      console.error('❌ 商家提交消费记录失败:', error.message)
      // 打印Sequelize验证错误的详细信息
      if (error.name === 'SequelizeValidationError' && error.errors) {
        error.errors.forEach(err => {
          console.error(`   验证错误 - 字段: ${err.path}, 值: ${err.value}, 原因: ${err.message}`)
        })
      }
      throw error
    }
  }

  /**
   * 管理员审核消费记录（通过）
   *
   * @param {number} recordId - 消费记录ID
   * @param {Object} reviewData - 审核数据
   * @param {number} reviewData.reviewer_id - 审核员ID
   * @param {string} reviewData.admin_notes - 审核备注（可选）
   * @returns {Object} 审核结果
   */
  static async approveConsumption (recordId, reviewData) {
    // 使用数据库事务确保数据一致性
    const sequelize = ConsumptionRecord.sequelize
    const transaction = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
    })

    try {
      // 1. 查询消费记录（加锁防止并发）
      const record = await ConsumptionRecord.findByPk(recordId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      })

      if (!record) {
        throw new Error(`消费记录不存在（ID: ${recordId}）`)
      }

      // 2. 检查是否可以审核
      const canReview = record.canBeReviewed()
      if (!canReview.can_review) {
        throw new Error(`不能审核：${canReview.reasons.join('；')}`)
      }

      // 3. 更新消费记录状态
      await record.update(
        {
          status: 'approved',
          reviewed_by: reviewData.reviewer_id,
          reviewed_at: BeijingTimeHelper.createDatabaseTime(),
          admin_notes: reviewData.admin_notes || null,
          updated_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      // 4. 更新审核记录表
      await ContentReviewRecord.update(
        {
          audit_status: 'approved',
          auditor_id: reviewData.reviewer_id,
          audit_reason: reviewData.admin_notes || '审核通过',
          updated_at: BeijingTimeHelper.createDatabaseTime()
        },
        {
          where: {
            auditable_type: 'consumption',
            auditable_id: recordId
          },
          transaction
        }
      )

      // 5. 奖励积分（通过PointsService）
      const pointsResult = await PointsService.addPoints(record.user_id, record.points_to_award, {
        transaction,
        business_type: 'consumption_reward',
        reference_type: 'consumption',
        reference_id: recordId,
        source_type: 'merchant_scan',
        title: '消费奖励',
        description: `消费${record.consumption_amount}元，奖励${record.points_to_award}积分`,
        operator_id: reviewData.reviewer_id
      })

      // 6. 提交事务
      await transaction.commit()

      console.log(`✅ 消费记录审核通过: record_id=${recordId}, 奖励积分=${record.points_to_award}`)

      return {
        consumption_record: record,
        points_transaction: pointsResult.transaction,
        points_awarded: record.points_to_award,
        new_balance: pointsResult.new_balance
      }
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 审核通过失败:', error.message)
      throw error
    }
  }

  /**
   * 管理员审核消费记录（拒绝）
   *
   * @param {number} recordId - 消费记录ID
   * @param {Object} reviewData - 审核数据
   * @param {number} reviewData.reviewer_id - 审核员ID
   * @param {string} reviewData.admin_notes - 拒绝原因（必填）
   * @returns {Object} 审核结果
   */
  static async rejectConsumption (recordId, reviewData) {
    // 使用数据库事务
    const sequelize = ConsumptionRecord.sequelize
    const transaction = await sequelize.transaction()

    try {
      // 1. 验证拒绝原因
      if (!reviewData.admin_notes) {
        throw new Error('拒绝原因不能为空')
      }

      // 2. 查询消费记录
      const record = await ConsumptionRecord.findByPk(recordId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      })

      if (!record) {
        throw new Error(`消费记录不存在（ID: ${recordId}）`)
      }

      // 3. 检查是否可以审核
      const canReview = record.canBeReviewed()
      if (!canReview.can_review) {
        throw new Error(`不能审核：${canReview.reasons.join('；')}`)
      }

      // 4. 更新消费记录状态
      await record.update(
        {
          status: 'rejected',
          reviewed_by: reviewData.reviewer_id,
          reviewed_at: BeijingTimeHelper.createDatabaseTime(),
          admin_notes: reviewData.admin_notes,
          updated_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      // 5. 更新审核记录表
      await ContentReviewRecord.update(
        {
          audit_status: 'rejected',
          auditor_id: reviewData.reviewer_id,
          audit_reason: reviewData.admin_notes,
          updated_at: BeijingTimeHelper.createDatabaseTime()
        },
        {
          where: {
            auditable_type: 'consumption',
            auditable_id: recordId
          },
          transaction
        }
      )

      // 6. 提交事务
      await transaction.commit()

      console.log(`✅ 消费记录审核拒绝: record_id=${recordId}, 原因=${reviewData.admin_notes}`)

      return {
        consumption_record: record,
        reject_reason: reviewData.admin_notes
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 审核拒绝失败:', error.message)
      throw error
    }
  }

  /**
   * 用户查询自己的消费记录
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @param {string} options.status - 状态筛选（可选）
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.page_size - 每页数量（默认20）
   * @returns {Object} 查询结果
   */
  static async getUserConsumptionRecords (userId, options = {}) {
    try {
      const page = options.page || 1
      const pageSize = options.page_size || 20
      const offset = (page - 1) * pageSize

      // 构建查询条件
      const where = {
        user_id: userId,
        is_deleted: 0 // 前端只负责数据展示：默认过滤已删除记录
      }
      if (options.status) {
        where.status = options.status
      }

      // 查询消费记录
      const { count, rows } = await ConsumptionRecord.findAndCountAll({
        where,
        include: [
          {
            association: 'merchant',
            attributes: ['user_id', 'mobile', 'nickname'],
            required: false
          },
          {
            association: 'reviewer',
            attributes: ['user_id', 'mobile', 'nickname'],
            required: false
          }
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset,
        distinct: true
      })

      // 计算统计信息
      const stats = await this.getUserConsumptionStats(userId)

      return {
        records: rows.map(r => r.toAPIResponse()),
        pagination: {
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(count / pageSize)
        },
        stats
      }
    } catch (error) {
      console.error('❌ 查询消费记录失败:', error.message)
      throw error
    }
  }

  /**
   * 获取用户消费统计
   *
   * @param {number} userId - 用户ID
   * @returns {Object} 统计信息
   */
  static async getUserConsumptionStats (userId) {
    try {
      // 统计各状态的记录数和金额
      const stats = await ConsumptionRecord.findAll({
        where: { user_id: userId },
        attributes: [
          'status',
          [Sequelize.fn('COUNT', Sequelize.col('record_id')), 'count'],
          [Sequelize.fn('SUM', Sequelize.col('consumption_amount')), 'total_amount'],
          [Sequelize.fn('SUM', Sequelize.col('points_to_award')), 'total_points']
        ],
        group: ['status'],
        raw: true
      })

      // 转换为易用的格式
      const result = {
        total_records: 0,
        total_amount: 0,
        total_points_awarded: 0,
        pending_count: 0,
        approved_count: 0,
        rejected_count: 0,
        expired_count: 0
      }

      stats.forEach(stat => {
        result.total_records += parseInt(stat.count)
        result.total_amount += parseFloat(stat.total_amount || 0)

        if (stat.status === 'pending') {
          result.pending_count = parseInt(stat.count)
        } else if (stat.status === 'approved') {
          result.approved_count = parseInt(stat.count)
          result.total_points_awarded += parseInt(stat.total_points || 0)
        } else if (stat.status === 'rejected') {
          result.rejected_count = parseInt(stat.count)
        } else if (stat.status === 'expired') {
          result.expired_count = parseInt(stat.count)
        }
      })

      return result
    } catch (error) {
      console.error('❌ 获取消费统计失败:', error.message)
      throw error
    }
  }

  /**
   * 管理员查询待审核的消费记录
   *
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.page_size - 每页数量（默认20）
   * @returns {Object} 查询结果
   */
  static async getPendingConsumptionRecords (options = {}) {
    try {
      const page = options.page || 1
      const pageSize = options.page_size || 20
      const offset = (page - 1) * pageSize

      // 查询待审核记录
      const { count, rows } = await ConsumptionRecord.scope('pending').findAndCountAll({
        include: [
          {
            association: 'user',
            attributes: ['user_id', 'mobile', 'nickname'],
            required: true
          },
          {
            association: 'merchant',
            attributes: ['user_id', 'mobile', 'nickname'],
            required: false
          }
        ],
        order: [['created_at', 'ASC']], // 按创建时间升序，先进先出
        limit: pageSize,
        offset,
        distinct: true
      })

      return {
        records: rows.map(r => r.toAPIResponse()),
        pagination: {
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(count / pageSize)
        }
      }
    } catch (error) {
      console.error('❌ 查询待审核记录失败:', error.message)
      throw error
    }
  }

  /**
   * 获取消费记录详情
   *
   * @param {number} recordId - 消费记录ID
   * @param {Object} options - 查询选项
   * @param {boolean} options.include_review_records - 是否包含审核记录
   * @param {boolean} options.include_points_transaction - 是否包含积分交易记录
   * @returns {Object} 消费记录详情
   */
  static async getConsumptionRecordDetail (recordId, options = {}) {
    try {
      // 构建include数组
      const include = [
        {
          association: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        },
        {
          association: 'merchant',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false
        },
        {
          association: 'reviewer',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false
        }
      ]

      if (options.include_review_records) {
        include.push({
          association: 'review_records',
          required: false
        })
      }

      if (options.include_points_transaction) {
        include.push({
          association: 'points_transaction',
          required: false
        })
      }

      // 查询记录
      const record = await ConsumptionRecord.findByPk(recordId, { include })

      if (!record) {
        throw new Error(`消费记录不存在（ID: ${recordId}）`)
      }

      // 前端只负责数据展示：过滤已删除记录
      if (record.is_deleted === 1) {
        throw new Error(`消费记录不存在或已被删除（ID: ${recordId}）`)
      }

      return record.toAPIResponse()
    } catch (error) {
      console.error('❌ 获取消费记录详情失败:', error.message)
      throw error
    }
  }

  /**
   * 根据ID获取消费记录（支持软删除查询）
   * 用于软删除功能
   *
   * @param {number} recordId - 记录ID
   * @param {Object} options - 查询选项
   * @param {boolean} options.includeDeleted - 是否包含已删除记录（默认false，管理员恢复时需要true）
   * @returns {Object|null} 消费记录实例或null
   */
  static async getRecordById (recordId, options = {}) {
    try {
      const { includeDeleted = false } = options

      // 构建查询条件
      const whereClause = {
        record_id: recordId
      }

      // 默认只查询未删除的记录（前端只负责数据展示）
      if (!includeDeleted) {
        whereClause.is_deleted = 0
      }

      // 查询记录
      const record = await ConsumptionRecord.findOne({
        where: whereClause
      })

      return record
    } catch (error) {
      console.error('❌ 获取消费记录失败:', error.message)
      throw error
    }
  }
}

module.exports = ConsumptionService
