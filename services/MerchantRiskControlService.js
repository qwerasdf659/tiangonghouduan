/**
 * 餐厅积分抽奖系统 V4 - 商家域风控服务
 *
 * 文件路径: services/MerchantRiskControlService.js
 *
 * 功能说明：
 * - 辅助人工审核，不改变"全员人工审核"流程
 * - 频次阻断（防刷单）
 * - 金额/关联告警（辅助审核员识别高风险单）
 *
 * 核心原则：
 * - 所有消费记录都进入人工审核队列（pending）
 * - 风控只是"前置拦截恶意 + 后置辅助审核"
 * - 频次超限 → 直接阻断提交（429）
 * - 金额/关联异常 → 允许提交，但告警提示审核员"这单需要更严格复核"
 *
 * 风控规则（已确定）：
 * - AC5.1: 频次风控 - 10次/60秒，硬阻断
 * - AC5.2: 金额告警 - 单笔>5000元或日累计>50000元，仅告警
 * - AC5.3: 关联告警 - 同一用户10分钟内被不同门店录入>3次，仅告警
 *
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')
const { Op } = require('sequelize')
const models = require('../models')

/**
 * 风控配置常量（可通过环境变量覆盖）
 */
const RISK_CONFIG = {
  // 频次风控配置（硬阻断）
  FREQUENCY_LIMIT_SECONDS: parseInt(process.env.MERCHANT_FREQUENCY_LIMIT_SECONDS) || 60,
  FREQUENCY_LIMIT_COUNT: parseInt(process.env.MERCHANT_FREQUENCY_LIMIT_COUNT) || 10,

  // 金额告警配置（仅告警）
  SINGLE_AMOUNT_ALERT: parseInt(process.env.MERCHANT_SINGLE_AMOUNT_ALERT) || 5000,
  DAILY_AMOUNT_ALERT: parseInt(process.env.MERCHANT_DAILY_AMOUNT_ALERT) || 50000,

  // 关联告警配置（仅告警）
  DUPLICATE_USER_MINUTES: parseInt(process.env.MERCHANT_DUPLICATE_USER_MINUTES) || 10,
  DUPLICATE_USER_STORE_COUNT: parseInt(process.env.MERCHANT_DUPLICATE_USER_STORE_COUNT) || 3
}

/**
 * 告警类型枚举
 */
const ALERT_TYPES = {
  FREQUENCY_LIMIT: 'frequency_limit', // 频次超限
  AMOUNT_LIMIT: 'amount_limit', // 金额超限
  DUPLICATE_USER: 'duplicate_user', // 用户被多门店录入
  SUSPICIOUS_PATTERN: 'suspicious_pattern' // 可疑模式
}

/**
 * 告警严重程度枚举
 */
const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
}

/**
 * 商家域风控服务（静态类）
 *
 * @class MerchantRiskControlService
 */
class MerchantRiskControlService {
  /**
   * 初始化风控服务（依赖注入）
   *
   * @param {Object} models - Sequelize 模型集合
   * @returns {void}
   */
  static initialize(models) {
    MerchantRiskControlService._models = models
    logger.info('✅ MerchantRiskControlService 初始化完成')
  }

  /**
   * 频次风控：检查员工提交频率（硬阻断，防止批量刷单）
   *
   * AC5.1: 同一员工1分钟内提交次数>10次，阻断提交并返回429
   *
   * @param {number} operator_id - 员工ID
   * @param {Object} [options={}] - 可选配置
   * @param {number} [options.time_window_seconds] - 时间窗口（秒），默认60秒
   * @param {number} [options.max_count] - 最大次数，默认10次
   * @returns {Promise<Object>} { allowed: boolean, count: number, message?: string }
   */
  static async checkFrequencyLimit(operator_id, options = {}) {
    const time_window_seconds = options.time_window_seconds || RISK_CONFIG.FREQUENCY_LIMIT_SECONDS
    const max_count = options.max_count || RISK_CONFIG.FREQUENCY_LIMIT_COUNT

    // models 已在文件顶部导入
    const { ConsumptionRecord, RiskAlert } = models

    try {
      // 计算时间窗口起始时间
      const windowStart = new Date(Date.now() - time_window_seconds * 1000)

      // 查询时间窗口内该员工的提交次数
      const count = await ConsumptionRecord.count({
        where: {
          merchant_id: operator_id,
          created_at: {
            [Op.gte]: windowStart
          }
        }
      })

      logger.debug('频次风控检查', {
        operator_id,
        count,
        max_count,
        time_window_seconds,
        window_start: BeijingTimeHelper.formatForAPI(windowStart)
      })

      // 判断是否超限
      if (count >= max_count) {
        logger.warn('🚨 频次风控触发', {
          operator_id,
          count,
          max_count,
          time_window_seconds
        })

        // 记录风控告警（硬阻断也记录，用于追溯）
        if (RiskAlert) {
          await MerchantRiskControlService._createRiskAlert({
            alert_type: ALERT_TYPES.FREQUENCY_LIMIT,
            severity: SEVERITY_LEVELS.HIGH, // 频次超限是高风险
            operator_id,
            rule_name: 'frequency_limit',
            rule_threshold: `${max_count}次/${time_window_seconds}秒`,
            actual_value: `${count}次/${time_window_seconds}秒`,
            alert_message: `员工 ${operator_id} 在 ${time_window_seconds} 秒内提交 ${count} 次，超过阈值 ${max_count} 次`,
            is_blocked: true // 标记为被阻断
          })
        }

        return {
          allowed: false,
          count,
          max_count,
          time_window_seconds,
          message: `提交频率过高，请等待 ${time_window_seconds} 秒后重试（当前 ${count}/${max_count}）`,
          code: 'FREQUENCY_LIMIT_EXCEEDED',
          statusCode: 429 // Too Many Requests
        }
      }

      return { allowed: true, count, max_count, time_window_seconds }
    } catch (error) {
      logger.error('❌ 频次风控检查失败', { operator_id, error: error.message })
      // 风控检查失败不应阻断业务，记录日志后放行
      return { allowed: true, count: 0, error: error.message }
    }
  }

  /**
   * 金额告警：检查单笔/日累计金额（仅告警，不阻断）
   *
   * AC5.2: 单笔>5000元或日累计>50000元，记录告警
   *
   * @param {number} operator_id - 员工ID
   * @param {number} store_id - 门店ID
   * @param {number} consumption_amount - 本次消费金额
   * @param {Object} [options={}] - 可选配置
   * @returns {Promise<Object>} { hasAlert: boolean, alerts: Array<Object> }
   */
  static async checkAmountAlert(operator_id, store_id, consumption_amount, options = {}) {
    const single_limit = options.single_limit || RISK_CONFIG.SINGLE_AMOUNT_ALERT
    const daily_limit = options.daily_limit || RISK_CONFIG.DAILY_AMOUNT_ALERT

    // models 已在文件顶部导入
    const { ConsumptionRecord, RiskAlert } = models

    const alerts = []

    try {
      // 1. 单笔金额告警
      if (consumption_amount > single_limit) {
        logger.warn('⚠️ 单笔金额告警触发', {
          operator_id,
          store_id,
          consumption_amount,
          single_limit
        })

        const alertData = {
          alert_type: ALERT_TYPES.AMOUNT_LIMIT,
          severity:
            consumption_amount > single_limit * 2 ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM,
          operator_id,
          store_id,
          rule_name: 'single_amount_limit',
          rule_threshold: `${single_limit}元/笔`,
          actual_value: `${consumption_amount}元`,
          alert_message: `员工 ${operator_id} 在门店 ${store_id} 提交单笔消费 ${consumption_amount} 元，超过阈值 ${single_limit} 元`,
          is_blocked: false // 仅告警，不阻断
        }

        if (RiskAlert) {
          const alert = await MerchantRiskControlService._createRiskAlert(alertData)
          alerts.push({ type: 'single_amount', alert_id: alert?.alert_id, ...alertData })
        } else {
          alerts.push({ type: 'single_amount', ...alertData })
        }
      }

      // 2. 日累计金额告警
      const todayStart = BeijingTimeHelper.todayStart()
      const dailyTotal =
        (await ConsumptionRecord.sum('consumption_amount', {
          where: {
            merchant_id: operator_id,
            created_at: {
              [Op.gte]: todayStart
            }
          }
        })) || 0

      const newDailyTotal = parseFloat(dailyTotal) + parseFloat(consumption_amount)

      if (newDailyTotal > daily_limit) {
        logger.warn('⚠️ 日累计金额告警触发', {
          operator_id,
          store_id,
          daily_total: newDailyTotal,
          daily_limit
        })

        const alertData = {
          alert_type: ALERT_TYPES.AMOUNT_LIMIT,
          severity: newDailyTotal > daily_limit * 2 ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM,
          operator_id,
          store_id,
          rule_name: 'daily_amount_limit',
          rule_threshold: `${daily_limit}元/日`,
          actual_value: `${newDailyTotal}元`,
          alert_message: `员工 ${operator_id} 今日累计消费 ${newDailyTotal} 元，超过阈值 ${daily_limit} 元`,
          is_blocked: false
        }

        if (RiskAlert) {
          const alert = await MerchantRiskControlService._createRiskAlert(alertData)
          alerts.push({ type: 'daily_amount', alert_id: alert?.alert_id, ...alertData })
        } else {
          alerts.push({ type: 'daily_amount', ...alertData })
        }
      }

      return {
        hasAlert: alerts.length > 0,
        alerts,
        daily_total: newDailyTotal,
        single_limit,
        daily_limit
      }
    } catch (error) {
      logger.error('❌ 金额告警检查失败', { operator_id, store_id, error: error.message })
      return { hasAlert: false, alerts: [], error: error.message }
    }
  }

  /**
   * 关联告警：检查同一用户是否被多门店录入（仅告警，不阻断）
   *
   * AC5.3: 同一用户10分钟内被不同门店录入>3次，记录告警
   *
   * @param {number} target_user_id - 被录入消费的用户ID
   * @param {number} current_store_id - 当前门店ID
   * @param {Object} [options={}] - 可选配置
   * @returns {Promise<Object>} { hasAlert: boolean, store_count: number, stores: Array }
   */
  static async checkDuplicateUserAlert(target_user_id, current_store_id, options = {}) {
    const time_window_minutes = options.time_window_minutes || RISK_CONFIG.DUPLICATE_USER_MINUTES
    const store_count_limit = options.store_count_limit || RISK_CONFIG.DUPLICATE_USER_STORE_COUNT

    // models 已在文件顶部导入
    const { ConsumptionRecord, RiskAlert } = models

    try {
      // 计算时间窗口起始时间
      const windowStart = new Date(Date.now() - time_window_minutes * 60 * 1000)

      // 查询时间窗口内该用户被哪些门店录入
      const records = await ConsumptionRecord.findAll({
        where: {
          user_id: target_user_id,
          created_at: {
            [Op.gte]: windowStart
          }
        },
        attributes: ['store_id'],
        group: ['store_id'],
        raw: true
      })

      // 获取不同门店列表
      const storeIds = records.map(r => r.store_id).filter(Boolean)

      // 加上当前门店
      if (!storeIds.includes(current_store_id)) {
        storeIds.push(current_store_id)
      }

      const storeCount = storeIds.length

      logger.debug('关联告警检查', {
        target_user_id,
        current_store_id,
        store_count: storeCount,
        store_count_limit,
        time_window_minutes
      })

      // 判断是否触发告警
      if (storeCount > store_count_limit) {
        logger.warn('⚠️ 关联告警触发', {
          target_user_id,
          store_count: storeCount,
          store_ids: storeIds,
          store_count_limit,
          time_window_minutes
        })

        const alertData = {
          alert_type: ALERT_TYPES.DUPLICATE_USER,
          severity:
            storeCount > store_count_limit * 2 ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM,
          target_user_id,
          store_id: current_store_id,
          rule_name: 'duplicate_user_check',
          rule_threshold: `${store_count_limit}个门店/${time_window_minutes}分钟`,
          actual_value: `${storeCount}个门店`,
          alert_message: `用户 ${target_user_id} 在 ${time_window_minutes} 分钟内被 ${storeCount} 个门店录入消费（门店: ${storeIds.join(', ')}）`,
          is_blocked: false
        }

        if (RiskAlert) {
          await MerchantRiskControlService._createRiskAlert(alertData)
        }

        return {
          hasAlert: true,
          store_count: storeCount,
          stores: storeIds,
          store_count_limit,
          time_window_minutes,
          message: `该用户短时间内被多个门店录入（${storeCount}个），已触发风控告警`
        }
      }

      return {
        hasAlert: false,
        store_count: storeCount,
        stores: storeIds,
        store_count_limit,
        time_window_minutes
      }
    } catch (error) {
      logger.error('❌ 关联告警检查失败', {
        target_user_id,
        current_store_id,
        error: error.message
      })
      return { hasAlert: false, store_count: 0, stores: [], error: error.message }
    }
  }

  /**
   * 综合风控检查：一次性执行所有风控规则
   *
   * @param {Object} params - 检查参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.store_id - 门店ID
   * @param {number} params.target_user_id - 目标用户ID
   * @param {number} params.consumption_amount - 消费金额
   * @returns {Promise<Object>} { blocked: boolean, alerts: Array, blockReason?: string }
   */
  static async performFullRiskCheck(params) {
    const { operator_id, store_id, target_user_id, consumption_amount } = params
    const allAlerts = []
    let blocked = false
    let blockReason = null
    let blockCode = null
    let blockStatusCode = 400

    logger.info('🔍 开始综合风控检查', {
      operator_id,
      store_id,
      target_user_id,
      consumption_amount
    })

    try {
      // 1. 频次风控（硬阻断）
      const freqResult = await MerchantRiskControlService.checkFrequencyLimit(operator_id)
      if (!freqResult.allowed) {
        blocked = true
        blockReason = freqResult.message
        blockCode = freqResult.code
        blockStatusCode = freqResult.statusCode || 429
        allAlerts.push({
          type: 'frequency_limit',
          blocked: true,
          ...freqResult
        })
      }

      // 如果已被阻断，直接返回
      if (blocked) {
        logger.warn('🚫 风控阻断', { operator_id, reason: blockReason })
        return {
          blocked: true,
          blockReason,
          blockCode,
          blockStatusCode,
          alerts: allAlerts
        }
      }

      // 2. 金额告警（仅告警）
      const amountResult = await MerchantRiskControlService.checkAmountAlert(
        operator_id,
        store_id,
        consumption_amount
      )
      if (amountResult.hasAlert) {
        allAlerts.push(...amountResult.alerts.map(a => ({ ...a, blocked: false })))
      }

      // 3. 关联告警（仅告警）
      if (target_user_id) {
        const duplicateResult = await MerchantRiskControlService.checkDuplicateUserAlert(
          target_user_id,
          store_id
        )
        if (duplicateResult.hasAlert) {
          allAlerts.push({
            type: 'duplicate_user',
            blocked: false,
            ...duplicateResult
          })
        }
      }

      logger.info('✅ 综合风控检查完成', {
        operator_id,
        blocked: false,
        alert_count: allAlerts.length
      })

      return {
        blocked: false,
        alerts: allAlerts,
        alertCount: allAlerts.length,
        hasAlerts: allAlerts.length > 0
      }
    } catch (error) {
      logger.error('❌ 综合风控检查失败', { error: error.message })
      // 风控检查失败不应阻断业务
      return {
        blocked: false,
        alerts: [],
        error: error.message
      }
    }
  }

  /**
   * 创建风控告警记录（内部方法）
   *
   * @private
   * @param {Object} alertData - 告警数据
   * @returns {Promise<Object|null>} 创建的告警记录或 null
   */
  static async _createRiskAlert(alertData) {
    // models 已在文件顶部导入
    const { RiskAlert } = models

    // 如果 RiskAlert 模型不存在，仅记录日志
    if (!RiskAlert) {
      logger.warn('⚠️ RiskAlert 模型不存在，风控告警仅记录日志', alertData)
      return null
    }

    try {
      // 静默规则检查
      const { AlertSilenceRule } = models
      if (AlertSilenceRule) {
        const isSilenced = await AlertSilenceRule.isAlertSilenced(
          alertData.alert_type,
          alertData.severity
        )
        if (isSilenced) {
          logger.info('风控告警被静默规则抑制', {
            alert_type: alertData.alert_type,
            severity: alertData.severity,
            rule_name: alertData.rule_name
          })
          return null
        }
      }

      const alert = await RiskAlert.create({
        alert_type: alertData.alert_type,
        severity: alertData.severity,
        operator_id: alertData.operator_id || null,
        store_id: alertData.store_id || null,
        target_user_id: alertData.target_user_id || null,
        related_record_id: alertData.related_record_id || null,
        rule_name: alertData.rule_name,
        rule_threshold: alertData.rule_threshold,
        actual_value: alertData.actual_value,
        alert_message: alertData.alert_message,
        is_blocked: alertData.is_blocked || false,
        status: 'pending',
        created_at: BeijingTimeHelper.createDatabaseTime()
      })

      logger.info('📝 风控告警记录已创建', {
        risk_alert_id: alert.risk_alert_id, // 主键字段：风控告警ID
        alert_type: alertData.alert_type,
        severity: alertData.severity,
        is_blocked: alertData.is_blocked
      })

      return alert
    } catch (error) {
      logger.error('❌ 创建风控告警记录失败', { error: error.message, alertData })
      return null
    }
  }

  /**
   * 查询风控告警列表
   *
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.alert_type] - 告警类型
   * @param {string} [filters.severity] - 严重程度
   * @param {string} [filters.status] - 状态
   * @param {number} [filters.operator_id] - 操作员ID
   * @param {number} [filters.store_id] - 门店ID
   * @param {Date} [filters.start_date] - 开始日期
   * @param {Date} [filters.end_date] - 结束日期
   * @param {Object} [pagination] - 分页配置
   * @param {number} [pagination.page=1] - 页码
   * @param {number} [pagination.page_size=20] - 每页条数
   * @returns {Promise<Object>} { alerts: Array, total: number, page: number, page_size: number }
   */
  static async queryRiskAlerts(filters = {}, pagination = {}) {
    // models 已在文件顶部导入
    const { RiskAlert } = models

    if (!RiskAlert) {
      logger.warn('⚠️ RiskAlert 模型不存在，无法查询风控告警')
      return { alerts: [], total: 0, page: 1, page_size: 20 }
    }

    const page = pagination.page || 1
    const page_size = pagination.page_size || 20
    const offset = (page - 1) * page_size

    // 构建查询条件
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
   * 更新告警状态（复核/忽略）
   *
   * 事务边界（2026-01-12 TS2.2 治理）：
   * - 支持外部事务传入（options.transaction）
   * - 如果未提供事务，则在无事务环境下执行（单表操作，风险较低）
   * - 建议调用方使用 TransactionManager.execute() 包裹，确保审计日志和业务操作的原子性
   *
   * @param {number} alert_id - 告警ID
   * @param {Object} updateData - 更新数据
   * @param {string} updateData.status - 新状态 (reviewed/ignored)
   * @param {number} updateData.reviewer_id - 复核人ID
   * @param {string} [updateData.review_notes] - 复核备注
   * @param {Object} [options={}] - 选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 更新后的告警记录
   *
   * @since 2026
   */
  static async updateAlertStatus(alert_id, updateData, options = {}) {
    const { transaction } = options
    // models 已在文件顶部导入
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
   * 获取风控配置
   *
   * @returns {Object} 当前风控配置
   */
  static getRiskConfig() {
    return { ...RISK_CONFIG }
  }

  /**
   * 获取告警详情（包含关联信息）
   *
   * @param {number} alertId - 告警ID
   * @returns {Promise<Object|null>} 告警详情（包含关联的用户、门店、消费记录信息）
   *
   * @since 2026
   */
  static async getAlertDetail(alertId) {
    // models 已在文件顶部导入
    const { RiskAlert, User, Store, ConsumptionRecord } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    try {
      const alert = await RiskAlert.findByPk(alertId, {
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name']
          },
          {
            model: User,
            as: 'targetUser',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'reviewer',
            attributes: ['user_id', 'nickname']
          },
          {
            model: ConsumptionRecord,
            as: 'relatedRecord',
            attributes: ['consumption_record_id', 'consumption_amount', 'status', 'created_at']
          }
        ]
      })

      if (!alert) {
        return null
      }

      // 格式化返回数据
      const result = {
        ...(alert.toAPIResponse ? alert.toAPIResponse() : alert.toJSON()),
        operator: alert.operator
          ? {
              user_id: alert.operator.user_id,
              nickname: alert.operator.nickname,
              mobile: alert.operator.mobile
            }
          : null,
        store: alert.store
          ? {
              store_id: alert.store.store_id,
              store_name: alert.store.store_name
            }
          : null,
        target_user: alert.targetUser
          ? {
              user_id: alert.targetUser.user_id,
              nickname: alert.targetUser.nickname,
              mobile: alert.targetUser.mobile
            }
          : null,
        reviewer: alert.reviewer
          ? {
              user_id: alert.reviewer.user_id,
              nickname: alert.reviewer.nickname
            }
          : null,
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
   * 获取风控告警统计概览
   *
   * @param {Object} filters - 筛选条件
   * @param {number} [filters.store_id] - 门店ID（可选）
   * @returns {Promise<Object>} 统计数据（按状态、类型、严重程度分组）
   *
   * @since 2026
   */
  static async getAlertStats(filters = {}) {
    // models 已在文件顶部导入
    const { RiskAlert } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    try {
      // 构建查询条件
      const where = {}
      if (filters.store_id) where.store_id = filters.store_id

      // 按状态统计
      const statusStats = await RiskAlert.findAll({
        where,
        attributes: [
          'status',
          [RiskAlert.sequelize.fn('COUNT', RiskAlert.sequelize.col('risk_alert_id')), 'count']
        ],
        group: ['status'],
        raw: true
      })

      // 按类型统计
      const typeStats = await RiskAlert.findAll({
        where,
        attributes: [
          'alert_type',
          [RiskAlert.sequelize.fn('COUNT', RiskAlert.sequelize.col('risk_alert_id')), 'count']
        ],
        group: ['alert_type'],
        raw: true
      })

      // 按严重程度统计
      const severityStats = await RiskAlert.findAll({
        where,
        attributes: [
          'severity',
          [RiskAlert.sequelize.fn('COUNT', RiskAlert.sequelize.col('risk_alert_id')), 'count']
        ],
        group: ['severity'],
        raw: true
      })

      // 今日新增
      const todayStart = BeijingTimeHelper.todayStart()
      const todayCount = await RiskAlert.count({
        where: {
          ...where,
          created_at: { [Op.gte]: todayStart }
        }
      })

      return {
        by_status: statusStats.reduce((acc, item) => {
          acc[item.status] = parseInt(item.count, 10)
          return acc
        }, {}),
        by_type: typeStats.reduce((acc, item) => {
          acc[item.alert_type] = parseInt(item.count, 10)
          return acc
        }, {}),
        by_severity: severityStats.reduce((acc, item) => {
          acc[item.severity] = parseInt(item.count, 10)
          return acc
        }, {}),
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
   * 检查告警是否存在
   *
   * @param {number} alertId - 告警ID
   * @returns {Promise<Object|null>} 告警记录（仅基本字段）
   *
   * @since 2026
   */
  static async getAlertBasic(alertId) {
    // models 已在文件顶部导入
    const { RiskAlert } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    return await RiskAlert.findByPk(alertId, {
      attributes: ['risk_alert_id', 'store_id', 'status'] // 主键字段：risk_alert_id
    })
  }

  /**
   * 查询风控告警列表（带关联信息，用于管理后台）
   *
   * @param {Object} filters - 筛选条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>} 告警列表及分页信息
   *
   * @since 2026
   */
  static async queryRiskAlertsWithDetails(filters = {}, pagination = {}) {
    // models 已在文件顶部导入
    const { RiskAlert, User, Store } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    // 构建查询条件
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

    // 时间范围筛选
    if (filters.start_time || filters.end_time) {
      where.created_at = {}
      if (filters.start_time) {
        where.created_at[Op.gte] = BeijingTimeHelper.parseBeijingTime(filters.start_time)
      }
      if (filters.end_time) {
        where.created_at[Op.lte] = BeijingTimeHelper.parseBeijingTime(filters.end_time)
      }
    }

    try {
      const { count, rows } = await RiskAlert.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name']
          },
          {
            model: User,
            as: 'targetUser',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'reviewer',
            attributes: ['user_id', 'nickname']
          }
        ],
        order: [
          ['severity', 'DESC'],
          ['created_at', 'DESC']
        ],
        limit: pageSize,
        offset
      })

      const items = rows.map(alert => ({
        risk_alert_id: alert.risk_alert_id, // 主键字段：风控告警ID
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
        operator_info: alert.operator
          ? {
              user_id: alert.operator.user_id,
              nickname: alert.operator.nickname,
              mobile: alert.operator.mobile
            }
          : null,
        store_info: alert.store
          ? {
              store_id: alert.store.store_id,
              store_name: alert.store.store_name
            }
          : null,
        target_user_info: alert.targetUser
          ? {
              user_id: alert.targetUser.user_id,
              nickname: alert.targetUser.nickname,
              mobile: alert.targetUser.mobile
            }
          : null,
        reviewer_info: alert.reviewer
          ? {
              user_id: alert.reviewer.user_id,
              nickname: alert.reviewer.nickname
            }
          : null
      }))

      return {
        items,
        pagination: {
          page,
          page_size: pageSize,
          total: count,
          total_pages: Math.ceil(count / pageSize)
        }
      }
    } catch (error) {
      logger.error('❌ 查询风控告警列表失败', { error: error.message, filters })
      throw error
    }
  }

  /**
   * 查询待处理风控告警
   *
   * @param {Object} filters - 筛选条件
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>} 待处理告警列表
   *
   * @since 2026
   */
  static async getPendingAlerts(filters = {}, pagination = {}) {
    // models 已在文件顶部导入
    const { RiskAlert } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    return await RiskAlert.getPendingAlerts(filters, {
      page: parseInt(pagination.page, 10) || 1,
      page_size: parseInt(pagination.page_size, 10) || 20
    })
  }

  /**
   * 复核风控告警（带事务）
   *
   * @param {number} alertId - 告警ID
   * @param {Object} params - 复核参数
   * @param {number} params.reviewed_by - 复核人ID
   * @param {string} params.status - 新状态（reviewed/ignored）
   * @param {string} [params.review_notes] - 复核备注
   * @returns {Promise<Object>} 复核后的告警信息
   *
   * @since 2026
   */
  static async reviewAlert(alertId, params) {
    // models 已在文件顶部导入
    const { RiskAlert, sequelize } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    const { reviewed_by, status, review_notes } = params

    // 使用事务确保原子性
    const transaction = await sequelize.transaction()

    try {
      const alert = await RiskAlert.reviewAlert(
        alertId,
        { reviewed_by, status, review_notes },
        { transaction }
      )

      await transaction.commit()

      logger.info('📝 风控告警已复核', {
        alert_id: alertId,
        reviewed_by,
        status,
        review_notes
      })

      return {
        risk_alert_id: alert.risk_alert_id, // 主键字段：风控告警ID
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
   * 批量标记所有待处理告警为已读
   *
   * @param {number} reviewed_by - 复核人ID（管理员用户ID）
   * @param {Object} [filters={}] - 可选筛选条件
   * @param {string} [filters.alert_type] - 告警类型筛选
   * @param {string} [filters.severity] - 严重程度筛选
   * @returns {Promise<Object>} 更新结果 { updated_count, message }
   *
   * @since 2026
   */
  static async markAllAsRead(reviewed_by, filters = {}) {
    // models 已在文件顶部导入
    const { RiskAlert, sequelize } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    // 构建筛选条件：仅更新 pending 状态的告警
    const where = { status: 'pending' }

    if (filters.alert_type) {
      where.alert_type = filters.alert_type
    }
    if (filters.severity) {
      where.severity = filters.severity
    }

    const transaction = await sequelize.transaction()

    try {
      // 批量更新所有符合条件的待处理告警
      const [updated_count] = await RiskAlert.update(
        {
          status: 'reviewed',
          reviewed_by,
          reviewed_at: new Date(),
          review_notes: '批量标记已读'
        },
        {
          where,
          transaction
        }
      )

      await transaction.commit()

      logger.info('📝 批量标记风控告警已读', {
        reviewed_by,
        updated_count,
        filters
      })

      return {
        updated_count,
        message: `成功标记 ${updated_count} 条告警为已读`
      }
    } catch (error) {
      await transaction.rollback()
      logger.error('❌ 批量标记告警已读失败', { reviewed_by, error: error.message })
      throw error
    }
  }

  /**
   * 获取风控告警统计摘要
   *
   * @param {Object} filters - 筛选条件（时间范围）
   * @returns {Promise<Object>} 统计摘要数据
   *
   * @since 2026
   */
  static async getStatsSummary(filters = {}) {
    // models 已在文件顶部导入
    const { RiskAlert } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    const { start_time, end_time } = filters

    // 构建时间条件
    const timeCondition = {}
    if (start_time) {
      timeCondition[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
    }
    if (end_time) {
      timeCondition[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)
    }

    const where = {}
    if (Object.keys(timeCondition).length > 0) {
      where.created_at = timeCondition
    }

    try {
      // 总数统计
      const totalCount = await RiskAlert.count({ where })
      const pendingCount = await RiskAlert.count({ where: { ...where, status: 'pending' } })
      const reviewedCount = await RiskAlert.count({ where: { ...where, status: 'reviewed' } })
      const ignoredCount = await RiskAlert.count({ where: { ...where, status: 'ignored' } })
      const blockedCount = await RiskAlert.count({ where: { ...where, is_blocked: true } })

      // 按告警类型统计
      const byType = await RiskAlert.findAll({
        attributes: ['alert_type', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['alert_type'],
        raw: true
      })

      const typeStats = {}
      byType.forEach(item => {
        typeStats[item.alert_type] = parseInt(item.count, 10)
      })

      // 按严重程度统计
      const bySeverity = await RiskAlert.findAll({
        attributes: ['severity', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['severity'],
        raw: true
      })

      const severityStats = {}
      bySeverity.forEach(item => {
        severityStats[item.severity] = parseInt(item.count, 10)
      })

      // 今日新增
      const todayStart = BeijingTimeHelper.todayStart()
      const todayCount = await RiskAlert.count({
        where: {
          created_at: { [Op.gte]: todayStart }
        }
      })

      return {
        total: totalCount,
        by_status: {
          pending: pendingCount,
          reviewed: reviewedCount,
          ignored: ignoredCount
        },
        blocked_count: blockedCount,
        by_type: typeStats,
        by_severity: severityStats,
        today_count: todayCount,
        time_range: {
          start_time: start_time || null,
          end_time: end_time || null
        }
      }
    } catch (error) {
      logger.error('❌ 获取风控告警统计摘要失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取门店风控告警统计
   *
   * @param {number} storeId - 门店ID
   * @param {Object} filters - 筛选条件（时间范围）
   * @returns {Promise<Object>} 门店统计数据
   *
   * @since 2026
   */
  static async getStoreStats(storeId, filters = {}) {
    // models 已在文件顶部导入
    const { RiskAlert } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    const { start_time, end_time } = filters

    // 构建时间条件
    const timeCondition = {}
    if (start_time) {
      timeCondition[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
    }
    if (end_time) {
      timeCondition[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)
    }

    const where = { store_id: parseInt(storeId, 10) }
    if (Object.keys(timeCondition).length > 0) {
      where.created_at = timeCondition
    }

    try {
      const totalCount = await RiskAlert.count({ where })
      const pendingCount = await RiskAlert.count({ where: { ...where, status: 'pending' } })
      const blockedCount = await RiskAlert.count({ where: { ...where, is_blocked: true } })

      // 按告警类型统计
      const byType = await RiskAlert.findAll({
        attributes: ['alert_type', [RiskAlert.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['alert_type'],
        raw: true
      })

      const typeStats = {}
      byType.forEach(item => {
        typeStats[item.alert_type] = parseInt(item.count, 10)
      })

      // 按操作员统计 TOP 5
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
        top_operators: topOperators.map(item => ({
          operator_id: item.operator_id,
          alert_count: parseInt(item.count, 10)
        })),
        time_range: {
          start_time: start_time || null,
          end_time: end_time || null
        }
      }
    } catch (error) {
      logger.error('❌ 获取门店风控统计失败', { storeId, error: error.message })
      throw error
    }
  }

  /**
   * 获取告警类型列表
   *
   * @returns {Promise<Object>} 告警类型、严重程度、状态列表
   *
   * @since 2026
   */
  static async getAlertTypesList() {
    // models 已在文件顶部导入
    const { RiskAlert } = models

    if (!RiskAlert) {
      throw new BusinessError('RiskAlert 模型不存在', 'RISK_NOT_FOUND', 404)
    }

    const alertTypes = Object.entries(RiskAlert.ALERT_TYPES || {}).map(([key, value]) => ({
      code: value,
      name: RiskAlert.ALERT_TYPE_DESCRIPTIONS?.[value] || value,
      key
    }))

    const severityLevels = Object.entries(RiskAlert.SEVERITY_LEVELS || {}).map(([key, value]) => ({
      code: value,
      name: key.toLowerCase(),
      key
    }))

    const alertStatus = Object.entries(RiskAlert.ALERT_STATUS || {}).map(([key, value]) => ({
      code: value,
      name: key.toLowerCase(),
      key
    }))

    return {
      alert_types: alertTypes,
      severity_levels: severityLevels,
      alert_status: alertStatus
    }
  }
}

// 导出服务类和枚举常量
module.exports = MerchantRiskControlService
module.exports.RISK_CONFIG = RISK_CONFIG
module.exports.ALERT_TYPES = ALERT_TYPES
module.exports.SEVERITY_LEVELS = SEVERITY_LEVELS
