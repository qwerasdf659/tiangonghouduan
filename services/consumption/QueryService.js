/**
 * 消费记录查询服务
 * V4.7.0 ConsumptionService 拆分（2026-01-31 大文件拆分方案 Phase 4）
 *
 * 职责：
 * - 用户查询消费记录（getUserConsumptionRecords）
 * - 用户消费统计（getUserConsumptionStats）
 * - 管理员查询待审核（getPendingConsumptionRecords）
 * - 管理员查询所有记录（getAdminRecords）
 * - 记录详情查询（getConsumptionDetailWithAuth、getConsumptionRecordDetail）
 * - 根据ID获取记录（getRecordById）
 * - 根据二维码获取用户信息（getUserInfoByQRCode）
 *
 * @module services/consumption/QueryService
 */
const BusinessError = require('../../utils/BusinessError')
const logger = require('../../utils/logger').logger
const { attachDisplayNames } = require('../../utils/displayNameHelper')
const { ConsumptionRecord, User } = require('../../models')
const { Sequelize } = require('sequelize')
const { Op } = Sequelize
const QRCodeValidator = require('../../utils/QRCodeValidator')

/**
 * 消费记录查询服务类
 * 负责消费记录的各种查询操作
 *
 * @class QueryService
 */
class QueryService {
  /**
   * 用户查询自己的消费记录
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @param {string} options.status - 状态筛选（可选）
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.page_size - 每页数量（默认20）
   * @returns {Promise<Object>} 查询结果
   */
  static async getUserConsumptionRecords(userId, options = {}) {
    try {
      const page = options.page || 1
      const pageSize = options.page_size || 20
      const offset = (page - 1) * pageSize

      // 构建查询条件
      const where = {
        user_id: userId
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
      const stats = await QueryService.getUserConsumptionStats(userId)

      // 格式化记录并附加中文显示名称
      const formattedRecords = rows.map(r => r.toAPIResponse())

      const recordsWithDisplayNames = await attachDisplayNames(formattedRecords, [
        { field: 'status', dictType: 'consumption_status' },
        { field: 'final_status', dictType: 'consumption_final_status' }
      ])

      return {
        records: recordsWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(count / pageSize)
        },
        stats
      }
    } catch (error) {
      logger.error('❌ 查询消费记录失败:', error.message)
      throw error
    }
  }

  /**
   * 获取用户消费统计
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 统计信息
   */
  static async getUserConsumptionStats(userId) {
    try {
      const stats = await ConsumptionRecord.findAll({
        where: { user_id: userId },
        attributes: [
          'status',
          [Sequelize.fn('COUNT', Sequelize.col('consumption_record_id')), 'count'],
          [Sequelize.fn('SUM', Sequelize.col('consumption_amount')), 'total_amount'],
          [Sequelize.fn('SUM', Sequelize.col('points_to_award')), 'total_points']
        ],
        group: ['status'],
        raw: true
      })

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
      logger.error('❌ 获取消费统计失败:', error.message)
      throw error
    }
  }

  /**
   * 管理员查询待审核的消费记录
   *
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.page_size - 每页数量（默认20）
   * @returns {Promise<Object>} 查询结果
   */
  static async getPendingConsumptionRecords(options = {}) {
    try {
      const page = options.page || 1
      const pageSize = options.page_size || 20
      const offset = (page - 1) * pageSize

      const { count, rows } = await ConsumptionRecord.scope('pending').findAndCountAll({
        include: [
          {
            association: 'user',
            attributes: ['user_id', 'mobile', 'nickname'],
            required: false
          },
          {
            association: 'merchant',
            attributes: ['user_id', 'mobile', 'nickname'],
            required: false
          }
        ],
        order: [['created_at', 'ASC']],
        limit: pageSize,
        offset,
        distinct: true
      })

      const formattedRecords = rows.map(r => r.toAPIResponse())

      const recordsWithDisplayNames = await attachDisplayNames(formattedRecords, [
        { field: 'status', dictType: 'consumption_status' },
        { field: 'final_status', dictType: 'consumption_final_status' }
      ])

      return {
        records: recordsWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(count / pageSize)
        }
      }
    } catch (error) {
      logger.error('❌ 查询待审核记录失败:', error.message)
      throw error
    }
  }

  /**
   * 管理员查询所有消费记录（支持筛选、搜索、统计）
   *
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.page_size - 每页数量（默认20，最大100）
   * @param {string} options.status - 状态筛选
   * @param {string} options.search - 搜索关键词
   * @param {string} options.start_date - 开始日期筛选（ISO格式）
   * @param {string} options.end_date - 结束日期筛选（ISO格式）
   * @returns {Promise<Object>} 查询结果
   */
  static async getAdminRecords(options = {}) {
    try {
      const page = options.page || 1
      const pageSize = Math.min(options.page_size || 20, 100)
      const offset = (page - 1) * pageSize
      const status = options.status || 'all'
      const search = options.search?.trim() || ''

      // 构建查询条件
      const whereConditions = {
        is_deleted: 0
      }

      if (status !== 'all') {
        whereConditions.status = status
      }

      // 🔴 日期范围筛选（修复 Bug：后端未处理 start_date/end_date 参数）
      if (options.start_date || options.end_date) {
        whereConditions.created_at = {}

        if (options.start_date) {
          // 开始日期：当天 00:00:00 开始（北京时间）
          const startDate = new Date(options.start_date)
          startDate.setHours(0, 0, 0, 0)
          whereConditions.created_at[Op.gte] = startDate
          logger.debug('日期筛选 - 开始日期', {
            start_date: options.start_date,
            parsed: startDate.toISOString()
          })
        }

        if (options.end_date) {
          // 结束日期：当天 23:59:59 结束（北京时间）
          const endDate = new Date(options.end_date)
          endDate.setHours(23, 59, 59, 999)
          whereConditions.created_at[Op.lte] = endDate
          logger.debug('日期筛选 - 结束日期', {
            end_date: options.end_date,
            parsed: endDate.toISOString()
          })
        }
      }

      // 搜索条件
      const includeConditions = [
        {
          association: 'user',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false,
          where: search
            ? {
                [Op.or]: [
                  { mobile: { [Op.like]: `%${search}%` } },
                  { nickname: { [Op.like]: `%${search}%` } }
                ]
              }
            : undefined
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

      // 并行查询
      const [{ count, rows }, statistics] = await Promise.all([
        ConsumptionRecord.findAndCountAll({
          where: whereConditions,
          include: includeConditions,
          order: [
            ['status', 'ASC'],
            ['created_at', 'DESC']
          ],
          limit: pageSize,
          offset,
          distinct: true
        }),
        ConsumptionRecord.findAll({
          attributes: [
            'status',
            [Sequelize.fn('COUNT', Sequelize.col('consumption_record_id')), 'count']
          ],
          where: {
            is_deleted: 0,
            created_at: {
              [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
            }
          },
          group: ['status'],
          raw: true
        })
      ])

      // 处理统计数据
      const stats = {
        pending: 0,
        approved: 0,
        rejected: 0,
        today: 0
      }

      statistics.forEach(stat => {
        if (stat.status === 'pending') stats.pending = parseInt(stat.count)
        if (stat.status === 'approved') stats.approved = parseInt(stat.count)
        if (stat.status === 'rejected') stats.rejected = parseInt(stat.count)
        stats.today += parseInt(stat.count)
      })

      // 补充待审核总数
      const pendingTotal = await ConsumptionRecord.count({
        where: {
          status: 'pending',
          is_deleted: 0
        }
      })
      stats.pending = pendingTotal

      const formattedRecords = rows.map(r => r.toAPIResponse())

      const recordsWithDisplayNames = await attachDisplayNames(formattedRecords, [
        { field: 'status', dictType: 'consumption_status' },
        { field: 'final_status', dictType: 'consumption_final_status' }
      ])

      return {
        records: recordsWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(count / pageSize)
        },
        statistics: stats
      }
    } catch (error) {
      logger.error('❌ 管理员查询消费记录失败:', error.message)
      throw new BusinessError(`查询消费记录失败：${error.message}`, 'CONSUMPTION_QUERY_FAILED', 500)
    }
  }

  /**
   * 获取消费记录详情（含权限检查）
   *
   * @param {number} recordId - 消费记录ID
   * @param {number} viewerId - 查看者用户ID
   * @param {boolean} has_admin_access - 是否具有管理员访问权限
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 消费记录详情
   */
  static async getConsumptionDetailWithAuth(
    recordId,
    viewerId,
    has_admin_access = false,
    options = {}
  ) {
    try {
      // 步骤1：轻量查询验证权限
      const basicRecord = await ConsumptionRecord.findByPk(recordId, {
        attributes: ['consumption_record_id', 'user_id', 'merchant_id']
      })

      if (!basicRecord) {
        const error = new Error('消费记录不存在或已被删除')
        error.statusCode = 404
        throw error
      }

      // 步骤2：验证权限
      const hasAccess =
        viewerId === basicRecord.user_id || viewerId === basicRecord.merchant_id || has_admin_access

      if (!hasAccess) {
        const error = new Error('无权访问此消费记录')
        error.statusCode = 403
        throw error
      }

      // 步骤3：权限验证通过，查询完整数据
      return await QueryService.getConsumptionRecordDetail(recordId, options)
    } catch (error) {
      logger.error('❌ 获取消费记录详情（含权限检查）失败:', error.message)
      throw error
    }
  }

  /**
   * 获取消费记录详情
   *
   * @param {number} recordId - 消费记录ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 消费记录详情
   */
  static async getConsumptionRecordDetail(recordId, options = {}) {
    try {
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

      const record = await ConsumptionRecord.findByPk(recordId, { include })

      if (!record) {
        throw new BusinessError(`消费记录不存在（ID: ${recordId}）`, 'CONSUMPTION_NOT_FOUND', 404)
      }

      if (record.is_deleted === 1) {
        throw new BusinessError(`消费记录不存在或已被删除（ID: ${recordId}）`, 'CONSUMPTION_NOT_FOUND', 404)
      }

      const formattedRecord = record.toAPIResponse()

      const recordWithDisplayNames = await attachDisplayNames(formattedRecord, [
        { field: 'status', dictType: 'consumption_status' },
        { field: 'final_status', dictType: 'consumption_final_status' }
      ])

      return recordWithDisplayNames
    } catch (error) {
      logger.error('❌ 获取消费记录详情失败:', error.message)
      throw error
    }
  }

  /**
   * 根据ID获取消费记录（支持软删除查询）
   *
   * @param {number} recordId - 记录ID
   * @param {Object} options - 查询选项
   * @param {boolean} options.includeDeleted - 是否包含已删除记录
   * @returns {Promise<Object|null>} 消费记录实例
   */
  static async getRecordById(recordId, options = {}) {
    try {
      const { includeDeleted = false } = options

      const query = includeDeleted ? ConsumptionRecord.scope('includeDeleted') : ConsumptionRecord

      const record = await query.findOne({
        where: {
          consumption_record_id: recordId
        }
      })

      return record
    } catch (error) {
      logger.error('❌ 获取消费记录失败:', error.message)
      throw error
    }
  }

  /**
   * 根据二维码获取用户信息（预览模式 - 不消耗nonce）
   *
   * @param {string} qrCode - v2动态二维码字符串
   * @returns {Promise<Object>} 用户信息
   */
  static async getUserInfoByQRCode(qrCode) {
    try {
      logger.info(
        '🔍 [ConsumptionService] 开始验证v2动态二维码（预览模式，不消耗nonce）:',
        qrCode.substring(0, 30) + '...'
      )

      // 1. 验证v2动态二维码
      const validation = QRCodeValidator.validateQRCodePreview(qrCode)
      if (!validation.valid) {
        const error = new Error(validation.error || '二维码验证失败')
        error.code = validation.code || 'QRCODE_VALIDATION_FAILED'
        error.statusCode = validation.statusCode || 400
        throw error
      }

      logger.info(
        '✅ [ConsumptionService] v2动态二维码预览验证通过（未消耗nonce），用户UUID:',
        validation.user_uuid
      )

      // 2. 根据UUID查询用户信息
      const user = await User.findOne({
        where: {
          user_uuid: validation.user_uuid
        },
        attributes: ['user_id', 'user_uuid', 'nickname', 'mobile']
      })

      if (!user) {
        const error = new Error(`用户不存在（user_uuid: ${validation.user_uuid}）`)
        error.code = 'USER_NOT_FOUND'
        error.statusCode = 404
        throw error
      }

      logger.info(
        `✅ [ConsumptionService] 用户信息获取成功: user_id=${user.user_id}, user_uuid=${user.user_uuid.substring(0, 8)}..., nickname=${user.nickname}`
      )

      return {
        user_id: user.user_id,
        user_uuid: user.user_uuid,
        nickname: user.nickname,
        mobile: user.mobile
      }
    } catch (error) {
      logger.error('❌ [ConsumptionService] 获取用户信息失败:', error.message, { code: error.code })
      throw error
    }
  }
}

module.exports = QueryService
