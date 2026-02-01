'use strict'

/**
 * @file 消费异常检测服务（Consumption Anomaly Service）
 * @description 提供消费记录的异常检测和风险评分功能
 *
 * P1 阶段任务 B-25：消费异常检测服务
 *
 * 业务场景：
 * - 自动检测异常消费行为（大额、高频、跨店等）
 * - 为待审核记录标记风险等级
 * - 辅助运营人员优先处理高风险记录
 *
 * 核心功能：
 * 1. detectAnomalies() - 检测单条记录的异常
 * 2. batchDetect() - 批量检测多条记录
 * 3. getAnomalySummary() - 获取异常汇总统计
 * 4. getHighRiskRecords() - 获取高风险记录列表
 * 5. markAnomaly() - 手动标记异常
 *
 * 异常检测规则（D-5 技术决策）：
 * - large_amount: 大额消费（>¥500）- 权重30分
 * - high_frequency: 高频消费（24h内>5次）- 权重25分
 * - new_user_large: 新用户大额（注册<7天且>¥100）- 权重25分
 * - cross_store: 跨店消费（同日多店消费）- 权重20分
 *
 * 评分规则：
 * - 0: 正常
 * - 1-30: 低风险
 * - 31-60: 中风险
 * - 61-100: 高风险
 *
 * @module services/consumption/AnomalyService
 * @version 1.0.0
 * @date 2026-01-31
 */

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 异常检测规则配置
 * 每个规则包含：name（规则名）、weight（权重分值）、threshold（阈值）
 */
const ANOMALY_RULES = {
  /**
   * 大额消费规则
   * 触发条件：消费金额 > ¥500
   */
  large_amount: {
    name: 'large_amount',
    label: '大额消费',
    weight: 30,
    threshold: 500,
    description: '消费金额超过¥500'
  },

  /**
   * 高频消费规则
   * 触发条件：24小时内同一用户消费次数 > 5次
   */
  high_frequency: {
    name: 'high_frequency',
    label: '高频消费',
    weight: 25,
    threshold: 5,
    time_window: 24 * 60 * 60 * 1000, // 24小时
    description: '24小时内消费超过5次'
  },

  /**
   * 新用户大额规则
   * 触发条件：用户注册 < 7天 且 消费金额 > ¥100
   */
  new_user_large: {
    name: 'new_user_large',
    label: '新用户大额',
    weight: 25,
    days_threshold: 7,
    amount_threshold: 100,
    description: '注册7天内消费超过¥100'
  },

  /**
   * 跨店消费规则
   * 触发条件：同一天内在不同门店消费
   */
  cross_store: {
    name: 'cross_store',
    label: '跨店消费',
    weight: 20,
    description: '同日在多家门店消费'
  }
}

/**
 * 消费异常检测服务
 * 提供异常检测、风险评分、汇总统计功能
 *
 * @class AnomalyService
 */
class AnomalyService {
  /**
   * 检测单条消费记录的异常
   *
   * P1 需求 B-25/B-26：核心异常检测方法
   *
   * @param {Object} record - 消费记录对象
   * @param {Object} [options] - 可选参数
   * @param {Object} [options.models] - Sequelize 模型集合
   * @param {boolean} [options.save=false] - 是否保存检测结果到数据库
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 检测结果
   *
   * @example
   * const result = await AnomalyService.detectAnomalies(record, { models, save: true })
   * // 返回：
   * // {
   * //   record_id: 123,
   * //   anomaly_flags: ['large_amount', 'high_frequency'],
   * //   anomaly_score: 55,
   * //   risk_level: 'medium',
   * //   detected_at: '2026-01-31T12:00:00+08:00'
   * // }
   */
  static async detectAnomalies(record, options = {}) {
    const { models, save = false, transaction } = options

    if (!record) {
      throw new Error('消费记录不能为空')
    }

    const recordId = record.consumption_record_id
    logger.debug('开始异常检测', { record_id: recordId })

    try {
      const anomalyFlags = []
      let totalScore = 0

      // 1. 大额消费检测
      const amount = parseFloat(record.consumption_amount || 0)
      if (amount > ANOMALY_RULES.large_amount.threshold) {
        anomalyFlags.push(ANOMALY_RULES.large_amount.name)
        totalScore += ANOMALY_RULES.large_amount.weight
        logger.debug('检测到大额消费', { record_id: recordId, amount })
      }

      // 2. 高频消费检测（需要查询数据库）
      if (models && record.user_id) {
        const highFrequencyResult = await AnomalyService._checkHighFrequency(
          record,
          models,
          transaction
        )
        if (highFrequencyResult.isAnomaly) {
          anomalyFlags.push(ANOMALY_RULES.high_frequency.name)
          totalScore += ANOMALY_RULES.high_frequency.weight
          logger.debug('检测到高频消费', {
            record_id: recordId,
            frequency: highFrequencyResult.count
          })
        }
      }

      // 3. 新用户大额检测（需要查询用户信息）
      if (models && record.user_id) {
        const newUserResult = await AnomalyService._checkNewUserLarge(record, models, transaction)
        if (newUserResult.isAnomaly) {
          anomalyFlags.push(ANOMALY_RULES.new_user_large.name)
          totalScore += ANOMALY_RULES.new_user_large.weight
          logger.debug('检测到新用户大额消费', {
            record_id: recordId,
            user_age_days: newUserResult.userAgeDays
          })
        }
      }

      // 4. 跨店消费检测
      if (models && record.user_id && record.store_id) {
        const crossStoreResult = await AnomalyService._checkCrossStore(record, models, transaction)
        if (crossStoreResult.isAnomaly) {
          anomalyFlags.push(ANOMALY_RULES.cross_store.name)
          totalScore += ANOMALY_RULES.cross_store.weight
          logger.debug('检测到跨店消费', {
            record_id: recordId,
            store_count: crossStoreResult.storeCount
          })
        }
      }

      // 确保评分不超过100
      const finalScore = Math.min(100, totalScore)

      // 获取风险等级
      const riskLevel = AnomalyService._getRiskLevel(finalScore)

      const result = {
        record_id: recordId,
        anomaly_flags: anomalyFlags,
        anomaly_score: finalScore,
        risk_level: riskLevel,
        detected_at: BeijingTimeHelper.now()
      }

      // 保存到数据库
      if (save && models?.ConsumptionRecord) {
        await models.ConsumptionRecord.update(
          {
            anomaly_flags: anomalyFlags.length > 0 ? anomalyFlags : null,
            anomaly_score: finalScore
          },
          {
            where: { record_id: recordId },
            transaction
          }
        )
        logger.info('异常检测结果已保存', {
          record_id: recordId,
          anomaly_flags: anomalyFlags,
          anomaly_score: finalScore
        })
      }

      return result
    } catch (error) {
      logger.error('异常检测失败', {
        record_id: recordId,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 批量检测消费记录
   *
   * P1 需求 B-26：批量异常标记
   *
   * @param {Array<Object>} records - 消费记录数组
   * @param {Object} [options] - 可选参数
   * @param {Object} [options.models] - Sequelize 模型集合
   * @param {boolean} [options.save=true] - 是否保存检测结果
   * @param {number} [options.batchSize=50] - 批量处理大小
   * @returns {Promise<Object>} 批量检测结果
   */
  static async batchDetect(records, options = {}) {
    const { models, save = true, batchSize = 50 } = options

    if (!Array.isArray(records) || records.length === 0) {
      return {
        total: 0,
        detected: 0,
        anomaly_count: 0,
        high_risk_count: 0,
        results: []
      }
    }

    logger.info('开始批量异常检测', {
      total_records: records.length,
      batch_size: batchSize
    })

    const startTime = Date.now()
    const results = []
    let anomalyCount = 0
    let highRiskCount = 0

    // 分批处理
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)

      const batchResults = await Promise.all(
        batch.map(record =>
          AnomalyService.detectAnomalies(record, { models, save }).catch(error => ({
            consumption_record_id: record.consumption_record_id,
            error: error.message
          }))
        )
      )

      batchResults.forEach(result => {
        results.push(result)
        if (result.anomaly_flags?.length > 0) {
          anomalyCount++
        }
        if (result.risk_level === 'high') {
          highRiskCount++
        }
      })
    }

    const duration = Date.now() - startTime

    logger.info('批量异常检测完成', {
      total: records.length,
      anomaly_count: anomalyCount,
      high_risk_count: highRiskCount,
      duration_ms: duration
    })

    return {
      total: records.length,
      detected: results.filter(r => !r.error).length,
      anomaly_count: anomalyCount,
      high_risk_count: highRiskCount,
      duration_ms: duration,
      results
    }
  }

  /**
   * 获取异常汇总统计
   *
   * P1 需求 B-27：异常汇总接口
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [options] - 可选参数
   * @param {string} [options.status] - 筛选状态
   * @param {Date} [options.start_date] - 开始日期
   * @param {Date} [options.end_date] - 结束日期
   * @returns {Promise<Object>} 异常汇总数据
   */
  static async getAnomalySummary(models, options = {}) {
    const { status, start_date, end_date } = options

    logger.info('获取异常汇总统计', { status, start_date, end_date })

    try {
      const where = { is_deleted: 0 }

      if (status) {
        where.status = status
      }

      if (start_date) {
        where.created_at = { [Op.gte]: start_date }
      }

      if (end_date) {
        where.created_at = { ...where.created_at, [Op.lte]: end_date }
      }

      // 并行查询各项统计
      const [totalCount, anomalyCount, riskDistribution, flagDistribution] = await Promise.all([
        // 总记录数
        models.ConsumptionRecord.count({ where }),

        // 有异常标记的记录数
        models.ConsumptionRecord.count({
          where: { ...where, anomaly_score: { [Op.gt]: 0 } }
        }),

        // 风险等级分布
        models.ConsumptionRecord.findAll({
          attributes: [
            [
              literal(`
                CASE
                  WHEN anomaly_score = 0 THEN 'normal'
                  WHEN anomaly_score <= 30 THEN 'low'
                  WHEN anomaly_score <= 60 THEN 'medium'
                  ELSE 'high'
                END
              `),
              'risk_level'
            ],
            [fn('COUNT', col('consumption_record_id')), 'count']
          ],
          where,
          group: [literal('risk_level')],
          raw: true
        }),

        // 异常标记类型分布（使用 JSON 函数）
        AnomalyService._getAnomalyFlagDistribution(models, where)
      ])

      // 整理风险等级分布
      const riskLevelMap = { normal: 0, low: 0, medium: 0, high: 0 }
      riskDistribution.forEach(item => {
        if (Object.prototype.hasOwnProperty.call(riskLevelMap, item.risk_level)) {
          riskLevelMap[item.risk_level] = parseInt(item.count || 0)
        }
      })

      const summary = {
        total_count: totalCount,
        anomaly_count: anomalyCount,
        anomaly_ratio: totalCount > 0 ? Math.round((anomalyCount / totalCount) * 10000) / 100 : 0,
        risk_distribution: riskLevelMap,
        flag_distribution: flagDistribution,
        generated_at: BeijingTimeHelper.now()
      }

      logger.info('异常汇总统计完成', {
        total: totalCount,
        anomaly: anomalyCount,
        high_risk: riskLevelMap.high
      })

      return summary
    } catch (error) {
      logger.error('获取异常汇总统计失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取高风险记录列表
   *
   * P1 需求 B-28：高风险记录查询
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [options] - 查询选项
   * @param {number} [options.min_score=61] - 最低异常评分
   * @param {string} [options.status='pending'] - 状态筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 高风险记录列表和分页信息
   */
  static async getHighRiskRecords(models, options = {}) {
    const { min_score = 61, status = 'pending', page = 1, page_size = 20 } = options

    logger.info('获取高风险记录', { min_score, status, page })

    try {
      const where = {
        is_deleted: 0,
        anomaly_score: { [Op.gte]: min_score }
      }

      if (status) {
        where.status = status
      }

      const offset = (page - 1) * page_size

      const { count, rows } = await models.ConsumptionRecord.findAndCountAll({
        where,
        include: [
          {
            association: 'user',
            attributes: ['user_id', 'mobile', 'nickname', 'created_at']
          },
          {
            association: 'merchant',
            attributes: ['user_id', 'mobile', 'nickname']
          },
          {
            association: 'store',
            attributes: ['store_id', 'store_name', 'store_code']
          }
        ],
        order: [
          ['anomaly_score', 'DESC'],
          ['created_at', 'DESC']
        ],
        limit: page_size,
        offset
      })

      const records = rows.map(record => ({
        ...record.get({ plain: true }),
        risk_level: AnomalyService._getRiskLevel(record.anomaly_score),
        anomaly_descriptions: AnomalyService._getAnomalyDescriptions(record.anomaly_flags)
      }))

      logger.info('高风险记录查询完成', {
        total: count,
        returned: records.length
      })

      return {
        records,
        pagination: {
          total_count: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('获取高风险记录失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动标记异常
   *
   * P1 需求 B-30：手动标记功能
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {number} recordId - 记录ID
   * @param {Object} anomalyData - 异常数据
   * @param {Array<string>} anomalyData.flags - 异常标记数组
   * @param {number} anomalyData.score - 异常评分
   * @param {Object} [options] - 可选参数
   * @param {number} [options.operator_id] - 操作员ID
   * @param {string} [options.reason] - 标记原因
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新后的记录
   */
  static async markAnomaly(models, recordId, anomalyData, options = {}) {
    const { operator_id, reason, transaction } = options
    const { flags, score } = anomalyData

    logger.info('手动标记异常', {
      record_id: recordId,
      flags,
      score,
      operator_id
    })

    try {
      // 验证记录存在
      const record = await models.ConsumptionRecord.findByPk(recordId)
      if (!record) {
        throw new Error('消费记录不存在')
      }

      // 验证异常标记有效性
      const validFlags = Object.keys(ANOMALY_RULES)
      const invalidFlags = flags.filter(f => !validFlags.includes(f))
      if (invalidFlags.length > 0) {
        throw new Error(`无效的异常标记: ${invalidFlags.join(', ')}`)
      }

      // 验证评分范围
      if (score < 0 || score > 100) {
        throw new Error('异常评分必须在 0-100 之间')
      }

      // 更新记录
      await models.ConsumptionRecord.update(
        {
          anomaly_flags: flags.length > 0 ? flags : null,
          anomaly_score: score
        },
        {
          where: { record_id: recordId },
          transaction
        }
      )

      // 记录审计日志
      if (models.AuditLog && operator_id) {
        await models.AuditLog.create(
          {
            operator_id,
            action_type: 'mark_anomaly',
            target_type: 'consumption_record',
            target_id: recordId,
            old_value: JSON.stringify({
              anomaly_flags: record.anomaly_flags,
              anomaly_score: record.anomaly_score
            }),
            new_value: JSON.stringify({ anomaly_flags: flags, anomaly_score: score }),
            reason: reason || '手动标记异常',
            ip_address: options.ip_address
          },
          { transaction }
        )
      }

      logger.info('手动标记异常完成', {
        record_id: recordId,
        new_flags: flags,
        new_score: score
      })

      return {
        record_id: recordId,
        anomaly_flags: flags,
        anomaly_score: score,
        risk_level: AnomalyService._getRiskLevel(score),
        marked_at: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error('手动标记异常失败', {
        record_id: recordId,
        error: error.message
      })
      throw error
    }
  }

  // ========== 私有辅助方法 ==========

  /**
   * 检测高频消费
   * @private
   * @param {Object} record - 消费记录对象
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [transaction] - 事务对象
   * @returns {Promise<Object>} 检测结果 { isAnomaly: boolean, count: number }
   */
  static async _checkHighFrequency(record, models, transaction) {
    const rule = ANOMALY_RULES.high_frequency
    const timeWindow = new Date(Date.now() - rule.time_window)

    const count = await models.ConsumptionRecord.count({
      where: {
        user_id: record.user_id,
        is_deleted: 0,
        created_at: { [Op.gte]: timeWindow },
        consumption_record_id: {
          [Op.ne]: record.consumption_record_id
        } // 排除当前记录
      },
      transaction
    })

    return {
      isAnomaly: count >= rule.threshold,
      count: count + 1 // 包含当前记录
    }
  }

  /**
   * 检测新用户大额消费
   * @private
   * @param {Object} record - 消费记录对象
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [transaction] - 事务对象
   * @returns {Promise<Object>} 检测结果 { isAnomaly: boolean, userAgeDays?: number }
   */
  static async _checkNewUserLarge(record, models, transaction) {
    const rule = ANOMALY_RULES.new_user_large
    const amount = parseFloat(record.consumption_amount || 0)

    // 金额未达阈值，直接返回
    if (amount <= rule.amount_threshold) {
      return { isAnomaly: false }
    }

    // 查询用户注册时间
    const user = await models.User.findByPk(record.user_id, {
      attributes: ['user_id', 'created_at'],
      transaction
    })

    if (!user || !user.created_at) {
      return { isAnomaly: false }
    }

    const userCreatedAt = new Date(user.created_at)
    const now = new Date()
    const userAgeDays = Math.floor((now - userCreatedAt) / (24 * 60 * 60 * 1000))

    return {
      isAnomaly: userAgeDays < rule.days_threshold,
      userAgeDays
    }
  }

  /**
   * 检测跨店消费
   * @private
   * @param {Object} record - 消费记录对象
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} transaction - 事务对象
   * @returns {Promise<Object>} 检测结果
   */
  static async _checkCrossStore(record, models, transaction) {
    const recordDate = new Date(record.created_at || new Date())
    const startOfDay = new Date(recordDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(recordDate)
    endOfDay.setHours(23, 59, 59, 999)

    // 查询当天该用户消费的门店数量
    const storeCount = await models.ConsumptionRecord.count({
      distinct: true,
      col: 'store_id',
      where: {
        user_id: record.user_id,
        is_deleted: 0,
        store_id: { [Op.ne]: null },
        created_at: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay
        }
      },
      transaction
    })

    return {
      isAnomaly: storeCount > 1,
      storeCount
    }
  }

  /**
   * 获取风险等级
   * @private
   * @param {number} score - 异常评分
   * @returns {string} 风险等级
   */
  static _getRiskLevel(score) {
    if (score === 0) return 'normal'
    if (score <= 30) return 'low'
    if (score <= 60) return 'medium'
    return 'high'
  }

  /**
   * 获取异常标记的中文描述
   * @private
   * @param {string[]} flags - 异常标记数组
   * @returns {Array<Object>} 异常标记描述数组
   */
  static _getAnomalyDescriptions(flags) {
    if (!Array.isArray(flags) || flags.length === 0) {
      return []
    }

    return flags.map(flag => {
      const rule = ANOMALY_RULES[flag]
      return rule
        ? { flag, label: rule.label, description: rule.description }
        : { flag, label: flag }
    })
  }

  /**
   * 获取异常标记类型分布
   * @private
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} where - 查询条件
   * @returns {Promise<Object>} 异常标记分布
   */
  static async _getAnomalyFlagDistribution(models, where) {
    // 由于 MySQL JSON 查询复杂，使用 JavaScript 统计
    const records = await models.ConsumptionRecord.findAll({
      attributes: ['anomaly_flags'],
      where: { ...where, anomaly_score: { [Op.gt]: 0 } },
      raw: true
    })

    const distribution = {}
    Object.keys(ANOMALY_RULES).forEach(flag => {
      distribution[flag] = 0
    })

    records.forEach(record => {
      const flags = record.anomaly_flags
      if (Array.isArray(flags)) {
        flags.forEach(flag => {
          if (Object.prototype.hasOwnProperty.call(distribution, flag)) {
            distribution[flag]++
          }
        })
      }
    })

    return distribution
  }

  /**
   * 获取异常规则配置
   * @returns {Object} 异常规则配置
   */
  static getAnomalyRules() {
    return ANOMALY_RULES
  }
}

module.exports = AnomalyService
