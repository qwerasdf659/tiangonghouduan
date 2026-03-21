/**
 * 告警静默规则管理服务（AlertSilenceService）
 *
 * 提供告警静默规则的 CRUD 操作
 * 路由层通过 ServiceManager.getService('alert_silence') 获取
 *
 * @version 1.0.0
 * @date 2026-03-20
 */

const { Op } = require('sequelize')
const { AlertSilenceRule } = require('../models')
const logger = require('../utils/logger').logger

/**
 * 告警静默规则管理服务
 *
 * 职责：告警静默规则的 CRUD + 活跃规则查询
 * 注册键：alert_silence
 *
 * @class AlertSilenceService
 */
class AlertSilenceService {
  /**
   * 创建静默规则
   *
   * @param {Object} ruleData - 规则数据
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - 数据库事务
   * @returns {Promise<Object>} 创建的规则
   */
  static async createRule(ruleData, options = {}) {
    const { transaction } = options

    const rule = await AlertSilenceRule.create(
      {
        rule_name: ruleData.rule_name,
        alert_type: ruleData.alert_type,
        alert_level: ruleData.alert_level || 'all',
        condition_json: ruleData.condition_json || null,
        start_time: ruleData.start_time || null,
        end_time: ruleData.end_time || null,
        effective_start_date: ruleData.effective_start_date || null,
        effective_end_date: ruleData.effective_end_date || null,
        is_active: ruleData.is_active !== undefined ? ruleData.is_active : true,
        created_by: ruleData.created_by,
        updated_by: ruleData.created_by
      },
      { transaction }
    )

    logger.info('创建告警静默规则', {
      alert_silence_rule_id: rule.alert_silence_rule_id,
      rule_name: rule.rule_name,
      alert_type: rule.alert_type
    })

    return rule
  }

  /**
   * 更新静默规则
   *
   * @param {number} ruleId - 规则 ID
   * @param {Object} updateData - 更新数据
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - 数据库事务
   * @returns {Promise<Object>} 更新后的规则
   */
  static async updateRule(ruleId, updateData, options = {}) {
    const { transaction } = options

    const rule = await AlertSilenceRule.findByPk(ruleId, { transaction })
    if (!rule) {
      const error = new Error('静默规则不存在')
      error.statusCode = 404
      throw error
    }

    const allowedFields = [
      'rule_name',
      'alert_type',
      'alert_level',
      'condition_json',
      'start_time',
      'end_time',
      'effective_start_date',
      'effective_end_date',
      'is_active',
      'updated_by'
    ]

    const filtered = {}
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filtered[field] = updateData[field]
      }
    }

    await rule.update(filtered, { transaction })

    logger.info('更新告警静默规则', {
      alert_silence_rule_id: ruleId,
      updated_fields: Object.keys(filtered)
    })

    return rule
  }

  /**
   * 删除静默规则（硬删除）
   *
   * @param {number} ruleId - 规则 ID
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - 数据库事务
   * @returns {Promise<boolean>} 是否删除成功
   */
  static async deleteRule(ruleId, options = {}) {
    const { transaction } = options

    const rule = await AlertSilenceRule.findByPk(ruleId, { transaction })
    if (!rule) {
      const error = new Error('静默规则不存在')
      error.statusCode = 404
      throw error
    }

    await rule.destroy({ transaction })

    logger.info('删除告警静默规则', {
      alert_silence_rule_id: ruleId,
      rule_name: rule.rule_name
    })

    return true
  }

  /**
   * 获取静默规则列表（分页）
   *
   * @param {Object} [filters] - 筛选条件
   * @param {string} [filters.alert_type] - 告警类型
   * @param {string} [filters.alert_level] - 告警级别
   * @param {boolean} [filters.is_active] - 是否启用
   * @param {string} [filters.keyword] - 关键词搜索
   * @param {number} [filters.page=1] - 页码
   * @param {number} [filters.page_size=20] - 每页条数
   * @returns {Promise<Object>} { rows, count, page, page_size }
   */
  static async getRules(filters = {}) {
    const { alert_type, alert_level, is_active, keyword, page = 1, page_size = 20 } = filters

    const where = {}

    if (alert_type) where.alert_type = alert_type
    if (alert_level) where.alert_level = alert_level
    if (is_active !== undefined) where.is_active = is_active

    if (keyword) {
      where.rule_name = { [Op.like]: `%${keyword}%` }
    }

    const offset = (page - 1) * page_size

    const { rows, count } = await AlertSilenceRule.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset,
      include: [
        { association: 'creator', attributes: ['user_id', 'nickname'] },
        { association: 'updater', attributes: ['user_id', 'nickname'] }
      ]
    })

    return { rows, count, page: Number(page), page_size: Number(page_size) }
  }

  /**
   * 获取当前活跃的静默规则
   *
   * @returns {Promise<Array>} 活跃规则列表
   */
  static async getActiveRules() {
    return AlertSilenceRule.getActiveRules()
  }
}

module.exports = AlertSilenceService
