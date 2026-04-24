/**
 * 餐厅积分抽奖系统 V4 - 风控告警管理服务
 *
 * 文件路径: services/MerchantRiskAlertService.js
 *
 * 功能说明：
 * - 风控告警的查询、复核、统计等后台CRUD操作
 * - 从 MerchantRiskControlService.js 拆分而来
 *
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')
const { Op } = require('sequelize')
const models = require('../models')

/**
 * 风控告警管理服务（静态类）
 *
 * @class MerchantRiskAlertService
 */
class MerchantRiskAlertService {
  /**
   * 查询风控告警列表
   * @param {Object} filters - 筛选条件（alert_type/severity/status/operator_id/store_id/日期范围）
   * @param {Object} pagination - 分页参数（page/page_size）
   * @returns {Promise<Object>} 告警列表及分页信息
   */
  static async queryRiskAlerts(filters = {}, pagination = {}) {
    const { RiskAlert } = models

    if (!RiskAlert) {
      logger.warn('⚠️ RiskAlert 模型不存在，无法查询风控告警')
      return { alerts: [], total: 0, page: 1, page_size: 20 }
    }

    const page = pagination.page || 1
    const page_size = pagination.page_size || 20
    const offset = (page - 1) * page_size

    const where = {}
    if (filters.alert_type) where.alert_type = filters.alert_type
    if (filters.severity) where.severity = filters.severity
    if (filters.status) where.status = filters.status
    if (filters.operator_id) where.operator_id = filters.operator_id
    if (filters.store_id) where.store_id = filters.store_id
    if (filters.start_date || filters.end_date) {
      where.created_at = {}
      if (filters.start_date) where.created_at[Op.gte] = filters.start_date
      if (filters.end_date) where.created_at[Op.lte] = filters.end_date
    }

    try {
      const { count, rows } = await RiskAlert.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: page_size,
        offset
      })

      return {
        alerts: rows.map(alert => (alert.toAPIResponse ? alert.toAPIResponse() : alert.toJSON())),
        total: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    } catch (error) {
      logger.error('❌ 查询风控告警失败', { error: error.message, filters })
      throw error
    }
  }

  /**
   * 更新告警状态（含事务锁）
   * @param {number} alert_id - 告警记录ID
   * @param {Object} updateData - 更新数据（status/reviewer_id/review_notes）
   * @param {Object} options - 可选参数（transaction）
   * @returns {Promise<Object>} 更新后的告警对象
   */
  static async updateAlertStatus(alert_id, updateData, options = {}) {
    const { transaction } = options
    const { RiskAlert } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    try {
      const alert = await RiskAlert.findByPk(alert_id, {
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined
      })

      if (!alert) {
        throw new BusinessError(`告警记录不存在 (ID: ${alert_id})`, 'RISK_NOT_FOUND', 404)
      }

      await alert.update(
        {
          status: updateData.status,
          reviewed_by: updateData.reviewer_id,
          review_notes: updateData.review_notes || null,
          reviewed_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      logger.info('📝 风控告警状态已更新', {
        alert_id,
        new_status: updateData.status,
        reviewer_id: updateData.reviewer_id
      })

      return alert.toAPIResponse ? alert.toAPIResponse() : alert.toJSON()
    } catch (error) {
      logger.error('❌ 更新风控告警状态失败', { alert_id, error: error.message })
      throw error
    }
  }

  /**
   * 获取告警详情（含关联的操作员、门店、目标用户、复核人、消费记录）
   * @param {number} alertId - 告警记录ID
   * @returns {Promise<Object|null>} 告警详情或 null
   */
  static async getAlertDetail(alertId) {
    const { RiskAlert, User, Store, ConsumptionRecord } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    try {
      const alert = await RiskAlert.findByPk(alertId, {
        include: [
          { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: Store, as: 'store', attributes: ['store_id', 'store_name'] },
          { model: User, as: 'targetUser', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'reviewer', attributes: ['user_id', 'nickname'] },
          { model: ConsumptionRecord, as: 'relatedRecord', attributes: ['consumption_record_id', 'consumption_amount', 'status', 'created_at'] }
        ]
      })

      if (!alert) return null
      const result = {
        ...(alert.toAPIResponse ? alert.toAPIResponse() : alert.toJSON()),
        operator: alert.operator ? { user_id: alert.operator.user_id, nickname: alert.operator.nickname, mobile: alert.operator.mobile } : null,
        store: alert.store ? { store_id: alert.store.store_id, store_name: alert.store.store_name } : null,
        target_user: alert.targetUser ? { user_id: alert.targetUser.user_id, nickname: alert.targetUser.nickname, mobile: alert.targetUser.mobile } : null,
        reviewer: alert.reviewer ? { user_id: alert.reviewer.user_id, nickname: alert.reviewer.nickname } : null,
        related_record: alert.relatedRecord
          ? {
              record_id: alert.relatedRecord.consumption_record_id,
              consumption_amount: parseFloat(alert.relatedRecord.consumption_amount),
              status: alert.relatedRecord.status,
              created_at: BeijingTimeHelper.formatForAPI(alert.relatedRecord.created_at)
            }
          : null
      }

      return result
    } catch (error) {
      logger.error('❌ 获取告警详情失败', { alertId, error: error.message })
      throw error
    }
  }

  /**
   * 获取告警统计数据（按状态/类型/严重度分组及今日计数）
   * @param {Object} filters - 筛选条件（store_id）
   * @returns {Promise<Object>} 统计结果
   */
  static async getAlertStats(filters = {}) {
    const { RiskAlert } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    try {
      const where = {}
      if (filters.store_id) where.store_id = filters.store_id

      const statusStats = await RiskAlert.findAll({
        where,
        attributes: ['status', [RiskAlert.sequelize.fn('COUNT', RiskAlert.sequelize.col('risk_alert_id')), 'count']],
        group: ['status'],
        raw: true
      })

      const typeStats = await RiskAlert.findAll({
        where,
        attributes: ['alert_type', [RiskAlert.sequelize.fn('COUNT', RiskAlert.sequelize.col('risk_alert_id')), 'count']],
        group: ['alert_type'],
        raw: true
      })
      const severityStats = await RiskAlert.findAll({
        where,
        attributes: ['severity', [RiskAlert.sequelize.fn('COUNT', RiskAlert.sequelize.col('risk_alert_id')), 'count']],
        group: ['severity'],
        raw: true
      })

      const todayStart = BeijingTimeHelper.todayStart()
      const todayCount = await RiskAlert.count({
        where: { ...where, created_at: { [Op.gte]: todayStart } }
      })

      const MerchantRiskControlService = require('./MerchantRiskControlService')
      return {
        by_status: statusStats.reduce((acc, item) => { acc[item.status] = parseInt(item.count, 10); return acc }, {}),
        by_type: typeStats.reduce((acc, item) => { acc[item.alert_type] = parseInt(item.count, 10); return acc }, {}),
        by_severity: severityStats.reduce((acc, item) => { acc[item.severity] = parseInt(item.count, 10); return acc }, {}),
        today_count: todayCount,
        risk_config: MerchantRiskControlService.getRiskConfig(),
        store_id: filters.store_id || null
      }
    } catch (error) {
      logger.error('❌ 获取风控统计失败', { filters, error: error.message })
      throw error
    }
  }

  /**
   * 获取告警基本信息（轻量查询）
   * @param {number} alertId - 告警记录ID
   * @returns {Promise<Object|null>} 告警基本字段（risk_alert_id/store_id/status）
   */
  static async getAlertBasic(alertId) {
    const { RiskAlert } = models
    if (!RiskAlert) throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    return await RiskAlert.findByPk(alertId, {
      attributes: ['risk_alert_id', 'store_id', 'status']
    })
  }

  /**
   * 查询风控告警列表（含操作员/门店/目标用户/复核人关联详情）
   * @param {Object} filters - 筛选条件（alert_type/severity/status/store_id/operator_id/target_user_id/is_blocked/时间范围）
   * @param {Object} pagination - 分页参数（page/page_size）
   * @returns {Promise<Object>} 告警详情列表及分页信息
   */
  static async queryRiskAlertsWithDetails(filters = {}, pagination = {}) {
    const { RiskAlert, User, Store } = models
    if (!RiskAlert) throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const where = {}
    if (filters.alert_type) where.alert_type = filters.alert_type
    if (filters.severity) where.severity = filters.severity
    if (filters.status) where.status = filters.status
    if (filters.store_id) where.store_id = parseInt(filters.store_id, 10)
    if (filters.operator_id) where.operator_id = parseInt(filters.operator_id, 10)
    if (filters.target_user_id) where.target_user_id = parseInt(filters.target_user_id, 10)
    if (filters.is_blocked !== undefined) {
      where.is_blocked = filters.is_blocked === 'true' || filters.is_blocked === true
    }
    if (filters.start_time || filters.end_time) {
      where.created_at = {}
      if (filters.start_time) where.created_at[Op.gte] = BeijingTimeHelper.parseBeijingTime(filters.start_time)
      if (filters.end_time) where.created_at[Op.lte] = BeijingTimeHelper.parseBeijingTime(filters.end_time)
    }

    try {
      const { count, rows } = await RiskAlert.findAndCountAll({
        where,
        include: [
          { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: Store, as: 'store', attributes: ['store_id', 'store_name'] },
          { model: User, as: 'targetUser', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'reviewer', attributes: ['user_id', 'nickname'] }
        ],
        order: [['severity', 'DESC'], ['created_at', 'DESC']],
        limit: pageSize,
        offset
      })
      const items = rows.map(alert => ({
        risk_alert_id: alert.risk_alert_id,
        alert_type: alert.alert_type,
        alert_type_name: RiskAlert.ALERT_TYPE_DESCRIPTIONS?.[alert.alert_type] || alert.alert_type,
        severity: alert.severity,
        rule_name: alert.rule_name,
        rule_threshold: alert.rule_threshold,
        actual_value: alert.actual_value,
        alert_message: alert.alert_message,
        is_blocked: alert.is_blocked,
        status: alert.status,
        review_notes: alert.review_notes,
        reviewed_at: alert.reviewed_at ? BeijingTimeHelper.formatForAPI(alert.reviewed_at) : null,
        created_at: BeijingTimeHelper.formatForAPI(alert.created_at),
        operator_info: alert.operator ? { user_id: alert.operator.user_id, nickname: alert.operator.nickname, mobile: alert.operator.mobile } : null,
        store_info: alert.store ? { store_id: alert.store.store_id, store_name: alert.store.store_name } : null,
        target_user_info: alert.targetUser ? { user_id: alert.targetUser.user_id, nickname: alert.targetUser.nickname, mobile: alert.targetUser.mobile } : null,
        reviewer_info: alert.reviewer ? { user_id: alert.reviewer.user_id, nickname: alert.reviewer.nickname } : null
      }))
      return {
        items,
        pagination: { page, page_size: pageSize, total: count, total_pages: Math.ceil(count / pageSize) }
      }
    } catch (error) {
      logger.error('❌ 查询风控告警列表失败', { error: error.message, filters })
      throw error
    }
  }

  /**
   * 获取待处理告警列表
   * @param {Object} filters - 筛选条件
   * @param {Object} pagination - 分页参数（page/page_size）
   * @returns {Promise<Object>} 待处理告警列表
   */
  static async getPendingAlerts(filters = {}, pagination = {}) {
    const { RiskAlert } = models
    if (!RiskAlert) throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    return await RiskAlert.getPendingAlerts(filters, {
      page: parseInt(pagination.page, 10) || 1,
      page_size: parseInt(pagination.page_size, 10) || 20
    })
  }

  /**
   * 复核风控告警（事务操作）
   * @param {number} alertId - 告警记录ID
   * @param {Object} params - 复核参数（reviewed_by/status/review_notes）
   * @returns {Promise<Object>} 复核后的告警摘要
   */
  static async reviewAlert(alertId, params) {
    const { RiskAlert, sequelize } = models
    if (!RiskAlert) throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)

    const { reviewed_by, status, review_notes } = params
    const transaction = await sequelize.transaction()

    try {
      const alert = await RiskAlert.reviewAlert(alertId, { reviewed_by, status, review_notes }, { transaction })
      await transaction.commit()

      logger.info('📝 风控告警已复核', { alert_id: alertId, reviewed_by, status, review_notes })

      return {
        risk_alert_id: alert.risk_alert_id,
        status: alert.status,
        reviewed_by: alert.reviewed_by,
        review_notes: alert.review_notes,
        reviewed_at: BeijingTimeHelper.formatForAPI(alert.reviewed_at)
      }
    } catch (error) {
      await transaction.rollback()
      logger.error('❌ 复核风控告警失败', { alertId, error: error.message })
      throw error
    }
  }

  /**
   * 批量标记告警为已读（事务操作）
   * @param {number} reviewed_by - 复核人ID
   * @param {Object} filters - 筛选条件（alert_type/severity）
   * @returns {Promise<Object>} 更新计数及提示信息
   */
  static async markAllAsRead(reviewed_by, filters = {}) {
    const { RiskAlert, sequelize } = models
    if (!RiskAlert) throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)

    const where = { status: 'pending' }
    if (filters.alert_type) where.alert_type = filters.alert_type
    if (filters.severity) where.severity = filters.severity

    const transaction = await sequelize.transaction()

    try {
      const [updated_count] = await RiskAlert.update(
        { status: 'reviewed', reviewed_by, reviewed_at: new Date(), review_notes: '批量标记已读' },
        { where, transaction }
      )
      await transaction.commit()
      logger.info('📝 批量标记风控告警已读', { reviewed_by, updated_count, filters })
      return { updated_count, message: `成功标记 ${updated_count} 条告警为已读` }
    } catch (error) {
      await transaction.rollback()
      logger.error('❌ 批量标记告警已读失败', { reviewed_by, error: error.message })
      throw error
    }
  }

  /**
   * 获取风控告警统计摘要（按状态/类型/严重度及今日计数）
   * @param {Object} filters - 筛选条件（start_time/end_time）
   * @returns {Promise<Object>} 统计摘要
   */
  static async getStatsSummary(filters = {}) {
    const { RiskAlert } = models
    if (!RiskAlert) throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)

    const { start_time, end_time } = filters
    const timeCondition = {}
    if (start_time) timeCondition[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
    if (end_time) timeCondition[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)

    const where = {}
    if (Object.keys(timeCondition).length > 0) where.created_at = timeCondition

    try {
      const totalCount = await RiskAlert.count({ where })
      const pendingCount = await RiskAlert.count({ where: { ...where, status: 'pending' } })
      const reviewedCount = await RiskAlert.count({ where: { ...where, status: 'reviewed' } })
      const ignoredCount = await RiskAlert.count({ where: { ...where, status: 'ignored' } })
      const blockedCount = await RiskAlert.count({ where: { ...where, is_blocked: true } })
      const byType = await RiskAlert.findAll({
        attributes: ['alert_type', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
        where,
group: ['alert_type'],
raw: true
      })
      const typeStats = {}
      byType.forEach(item => { typeStats[item.alert_type] = parseInt(item.count, 10) })

      const bySeverity = await RiskAlert.findAll({
        attributes: ['severity', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
        where,
group: ['severity'],
raw: true
      })
      const severityStats = {}
      bySeverity.forEach(item => { severityStats[item.severity] = parseInt(item.count, 10) })

      const todayStart = BeijingTimeHelper.todayStart()
      const todayCount = await RiskAlert.count({ where: { created_at: { [Op.gte]: todayStart } } })

      return {
        total: totalCount,
        by_status: { pending: pendingCount, reviewed: reviewedCount, ignored: ignoredCount },
        blocked_count: blockedCount,
        by_type: typeStats,
        by_severity: severityStats,
        today_count: todayCount,
        time_range: { start_time: start_time || null, end_time: end_time || null }
      }
    } catch (error) {
      logger.error('❌ 获取风控告警统计摘要失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取指定门店的风控统计（含高频操作员排行）
   * @param {number} storeId - 门店ID
   * @param {Object} filters - 筛选条件（start_time/end_time）
   * @returns {Promise<Object>} 门店风控统计
   */
  static async getStoreStats(storeId, filters = {}) {
    const { RiskAlert } = models
    if (!RiskAlert) throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)

    const { start_time, end_time } = filters
    const timeCondition = {}
    if (start_time) timeCondition[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
    if (end_time) timeCondition[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)

    const where = { store_id: parseInt(storeId, 10) }
    if (Object.keys(timeCondition).length > 0) where.created_at = timeCondition

    try {
      const totalCount = await RiskAlert.count({ where })
      const pendingCount = await RiskAlert.count({ where: { ...where, status: 'pending' } })
      const blockedCount = await RiskAlert.count({ where: { ...where, is_blocked: true } })
      const byType = await RiskAlert.findAll({
        attributes: ['alert_type', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
        where,
group: ['alert_type'],
raw: true
      })
      const typeStats = {}
      byType.forEach(item => { typeStats[item.alert_type] = parseInt(item.count, 10) })

      const topOperators = await RiskAlert.findAll({
        attributes: ['operator_id', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
        where,
group: ['operator_id'],
        order: [[RiskAlert.sequelize.literal('count'), 'DESC']],
        limit: 5,
raw: true
      })

      return {
        store_id: parseInt(storeId, 10),
        total: totalCount,
pending: pendingCount,
blocked: blockedCount,
        by_type: typeStats,
        top_operators: topOperators.map(item => ({ operator_id: item.operator_id, alert_count: parseInt(item.count, 10) })),
        time_range: { start_time: start_time || null, end_time: end_time || null }
      }
    } catch (error) {
      logger.error('❌ 获取门店风控统计失败', { storeId, error: error.message })
      throw error
    }
  }

  /**
   * 获取告警类型/严重度/状态的枚举列表
   * @returns {Promise<Object>} 包含 alert_types/severity_levels/alert_status 的枚举对象
   */
  static async getAlertTypesList() {
    const { RiskAlert } = models
    if (!RiskAlert) throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)

    const alertTypes = Object.entries(RiskAlert.ALERT_TYPES || {}).map(([key, value]) => ({
      code: value, name: RiskAlert.ALERT_TYPE_DESCRIPTIONS?.[value] || value, key
    }))

    const severityLevels = Object.entries(RiskAlert.SEVERITY_LEVELS || {}).map(([key, value]) => ({
      code: value, name: key.toLowerCase(), key
    }))

    const alertStatus = Object.entries(RiskAlert.ALERT_STATUS || {}).map(([key, value]) => ({
      code: value, name: key.toLowerCase(), key
    }))

    return { alert_types: alertTypes, severity_levels: severityLevels, alert_status: alertStatus }
  }
}

module.exports = MerchantRiskAlertService
