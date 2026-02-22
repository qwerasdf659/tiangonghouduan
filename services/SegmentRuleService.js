'use strict'

/**
 * 分群规则配置服务
 *
 * 业务职责：管理用户分群策略的 CRUD 操作
 * 通过 ServiceManager 注册为 'segment_rule' 服务
 *
 * @module services/SegmentRuleService
 */

const { SegmentRuleConfig } = require('../models')
const { SEGMENT_FIELD_REGISTRY } = require('../config/segment_field_registry')
const AuditLogService = require('./AuditLogService')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const logger = require('../utils/logger').logger

/**
 * 分群规则配置服务类
 * 职责：管理用户分群策略的 CRUD 操作
 */
class SegmentRuleService {
  /**
   * 获取所有分群策略版本
   * @returns {Promise<Array>} 策略列表
   */
  static async getAllVersions() {
    const configs = await SegmentRuleConfig.findAll({
      where: { status: 'active' },
      order: [
        ['is_system', 'DESC'],
        ['created_at', 'ASC']
      ],
      attributes: [
        'segment_rule_config_id',
        'version_key',
        'version_name',
        'description',
        'is_system',
        'status',
        'created_at',
        'updated_at'
      ]
    })

    return configs.map(c => c.toJSON())
  }

  /**
   * 获取指定版本详情（含规则 JSON）
   * @param {string} version_key - 版本标识
   * @returns {Promise<Object>} 策略详情
   */
  static async getVersionDetail(version_key) {
    const config = await SegmentRuleConfig.findOne({
      where: { version_key, status: 'active' }
    })

    if (!config) {
      throw new Error(`分群策略版本不存在: ${version_key}`)
    }

    return config.toJSON()
  }

  /**
   * 创建新的分群策略版本
   * @param {Object} data - 策略数据
   * @param {Object} options - 选项（含 transaction、created_by）
   * @returns {Promise<Object>} 创建结果
   */
  static async createVersion(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'SegmentRuleService.createVersion')
    const { created_by } = options

    // version_key 只允许字母、数字、下划线
    if (!/^[a-z0-9_]+$/i.test(data.version_key)) {
      throw new Error('版本标识只允许字母、数字和下划线')
    }

    // 检查是否已存在
    const existing = await SegmentRuleConfig.findOne({
      where: { version_key: data.version_key },
      transaction
    })
    if (existing) {
      throw new Error(`版本标识已存在: ${data.version_key}`)
    }

    // 验证规则结构
    this._validateRules(data.rules)

    const config = await SegmentRuleConfig.create(
      {
        version_key: data.version_key,
        version_name: data.version_name,
        description: data.description || null,
        rules: data.rules,
        is_system: 0,
        status: 'active',
        created_by: created_by || null
      },
      { transaction }
    )

    await AuditLogService.logOperation({
      operator_id: created_by || 1,
      operation_type: 'segment_rule_create',
      target_type: 'SegmentRuleConfig',
      target_id: config.segment_rule_config_id,
      action: 'create',
      before_data: null,
      after_data: { version_key: data.version_key, version_name: data.version_name },
      reason: `创建分群策略「${data.version_name}」`,
      idempotency_key: `segment_rule_create_${data.version_key}_${Date.now()}`,
      is_critical_operation: false,
      transaction
    })

    logger.info('分群策略版本创建成功', {
      version_key: data.version_key,
      created_by
    })

    return config.toJSON()
  }

  /**
   * 更新分群策略版本
   * @param {string} version_key - 版本标识
   * @param {Object} data - 更新数据
   * @param {Object} options - 选项（含 transaction、updated_by）
   * @returns {Promise<Object>} 更新结果
   */
  static async updateVersion(version_key, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'SegmentRuleService.updateVersion')
    const { updated_by } = options

    const config = await SegmentRuleConfig.findOne({
      where: { version_key },
      transaction
    })

    if (!config) {
      throw new Error(`分群策略版本不存在: ${version_key}`)
    }

    // 验证规则结构（如果提供了新规则）
    if (data.rules) {
      this._validateRules(data.rules)
    }

    const beforeData = {
      version_name: config.version_name,
      description: config.description,
      rules: config.rules
    }

    const updateFields = {}
    if (data.version_name !== undefined) updateFields.version_name = data.version_name
    if (data.description !== undefined) updateFields.description = data.description
    if (data.rules !== undefined) updateFields.rules = data.rules

    await config.update(updateFields, { transaction })

    await AuditLogService.logOperation({
      operator_id: updated_by || 1,
      operation_type: 'segment_rule_update',
      target_type: 'SegmentRuleConfig',
      target_id: config.segment_rule_config_id,
      action: 'update',
      before_data: beforeData,
      after_data: updateFields,
      reason: `更新分群策略「${config.version_name}」`,
      idempotency_key: `segment_rule_update_${version_key}_${Date.now()}`,
      is_critical_operation: false,
      transaction
    })

    logger.info('分群策略版本更新成功', { version_key, updated_by })

    return config.toJSON()
  }

  /**
   * 归档（软删除）分群策略版本
   * @param {string} version_key - 版本标识
   * @param {Object} options - 选项（含 transaction、deleted_by）
   * @returns {Promise<Object>} 操作结果
   */
  static async archiveVersion(version_key, options = {}) {
    const transaction = assertAndGetTransaction(options, 'SegmentRuleService.archiveVersion')
    const { deleted_by } = options

    const config = await SegmentRuleConfig.findOne({
      where: { version_key },
      transaction
    })

    if (!config) {
      throw new Error(`分群策略版本不存在: ${version_key}`)
    }

    if (config.is_system) {
      throw new Error('系统内置策略不可删除')
    }

    await config.update({ status: 'archived' }, { transaction })

    await AuditLogService.logOperation({
      operator_id: deleted_by || 1,
      operation_type: 'segment_rule_archive',
      target_type: 'SegmentRuleConfig',
      target_id: config.segment_rule_config_id,
      action: 'archive',
      before_data: { status: 'active' },
      after_data: { status: 'archived' },
      reason: `归档分群策略「${config.version_name}」`,
      idempotency_key: `segment_rule_archive_${version_key}_${Date.now()}`,
      is_critical_operation: false,
      transaction
    })

    logger.info('分群策略版本已归档', { version_key, deleted_by })

    return { version_key, status: 'archived' }
  }

  /**
   * 模拟测试分群规则（根据数据库规则求值）
   * @param {string} version_key - 版本标识
   * @param {Object} mockUserData - 模拟用户数据
   * @returns {Promise<Object>} 匹配结果
   */
  static async simulateResolve(version_key, mockUserData) {
    const config = await SegmentRuleConfig.findOne({
      where: { version_key, status: 'active' }
    })

    if (!config) {
      throw new Error(`分群策略版本不存在: ${version_key}`)
    }

    const rules = config.rules || []
    const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0))

    for (const rule of sorted) {
      if (!rule.conditions || rule.conditions.length === 0) {
        return {
          segment_key: rule.segment_key,
          label: rule.label,
          matched_rule: rule,
          is_fallback: true
        }
      }

      const results = rule.conditions.map(cond => {
        const fieldValue = mockUserData?.[cond.field]
        const operator = SEGMENT_FIELD_REGISTRY.operators[cond.operator]
        if (!operator) return false
        return operator.evaluate(fieldValue, cond.value)
      })

      const matched = rule.logic === 'OR' ? results.some(r => r) : results.every(r => r)

      if (matched) {
        return {
          segment_key: rule.segment_key,
          label: rule.label,
          matched_rule: rule,
          is_fallback: false
        }
      }
    }

    return { segment_key: 'default', label: '默认', matched_rule: null, is_fallback: true }
  }

  /**
   * 验证规则结构
   * @param {Array} rules - 规则数组
   * @returns {void}
   * @throws {Error} 验证失败
   * @private
   */
  static _validateRules(rules) {
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('规则数组不能为空')
    }

    // 检查是否有兜底规则（conditions 为空或不存在的规则）
    const hasFallback = rules.some(r => !r.conditions || r.conditions.length === 0)
    if (!hasFallback) {
      throw new Error('规则必须包含一个兜底规则（conditions 为空）')
    }

    for (const rule of rules) {
      if (!rule.segment_key) {
        throw new Error('每条规则必须包含 segment_key')
      }
      if (!rule.label) {
        throw new Error('每条规则必须包含 label')
      }
      if (rule.priority === undefined || rule.priority === null) {
        throw new Error('每条规则必须包含 priority')
      }

      // 验证条件中的字段和运算符是否在白名单中
      if (rule.conditions && rule.conditions.length > 0) {
        for (const cond of rule.conditions) {
          if (!SEGMENT_FIELD_REGISTRY.fields[cond.field]) {
            throw new Error(`不允许的字段: ${cond.field}`)
          }
          if (!SEGMENT_FIELD_REGISTRY.operators[cond.operator]) {
            throw new Error(`不允许的运算符: ${cond.operator}`)
          }
          const fieldDef = SEGMENT_FIELD_REGISTRY.fields[cond.field]
          if (!fieldDef.operators.includes(cond.operator)) {
            throw new Error(`字段 ${cond.field} 不支持运算符 ${cond.operator}`)
          }
        }
      }
    }
  }
}

module.exports = SegmentRuleService
