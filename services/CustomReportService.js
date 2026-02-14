/**
 * 自定义报表服务
 *
 * 功能说明：
 * - 模板管理：报表模板CRUD操作
 * - 动态生成：基于模板动态生成报表数据
 * - 数据聚合：多数据源聚合查询
 * - 报表导出：支持多种格式导出
 *
 * 业务场景：
 * - 营销活动效果报表
 * - 用户消费行为报表
 * - 奖品发放统计报表
 * - 积分流水汇总报表
 *
 * 创建时间：2026年01月31日
 * 任务编号：B-36 报表模板CRUD, B-37 动态报表生成, B-38~B-40 报表相关接口
 */

'use strict'

const models = require('../models')
const logger = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')
const { Op } = require('sequelize')

/**
 * 数据源类型配置
 * 定义各数据源的查询方法和可用字段
 */
const DATA_SOURCE_CONFIG = {
  /**
   * 用户数据源
   */
  users: {
    model: 'User',
    defaultFields: ['user_id', 'nickname', 'mobile', 'status', 'created_at'],
    aggregateFields: {
      total_count: 'COUNT(*)',
      active_count: "COUNT(CASE WHEN status = 'active' THEN 1 END)",
      today_new: 'COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END)'
    }
  },

  /**
   * 积分数据源
   */
  points: {
    model: 'AccountAssetBalance',
    defaultFields: ['user_id', 'asset_code', 'available_amount', 'frozen_amount'],
    aggregateFields: {
      total_points: 'SUM(available_amount)',
      avg_points: 'AVG(available_amount)',
      user_count: 'COUNT(DISTINCT user_id)'
    },
    filter: { asset_code: 'POINTS' }
  },

  /**
   * 消费数据源
   */
  consumptions: {
    model: 'ConsumptionRecord',
    defaultFields: [
      'consumption_record_id',
      'user_id',
      'consumption_amount',
      'points_earned',
      'created_at'
    ],
    aggregateFields: {
      total_amount: 'SUM(consumption_amount)',
      total_points: 'SUM(points_earned)',
      avg_amount: 'AVG(consumption_amount)',
      record_count: 'COUNT(*)'
    }
  },

  /**
   * 兑换数据源
   */
  exchanges: {
    model: 'ExchangeRecord',
    defaultFields: [
      'exchange_record_id',
      'user_id',
      'lottery_prize_id',
      'points_cost',
      'status',
      'created_at'
    ],
    aggregateFields: {
      total_cost: 'SUM(points_cost)',
      exchange_count: 'COUNT(*)',
      success_count: "COUNT(CASE WHEN status = 'completed' THEN 1 END)"
    }
  },

  /**
   * 抽奖数据源
   */
  lottery: {
    model: 'LotteryDraw',
    defaultFields: [
      'lottery_draw_id',
      'user_id',
      'lottery_campaign_id',
      'lottery_prize_id',
      'created_at'
    ],
    aggregateFields: {
      draw_count: 'COUNT(*)',
      user_count: 'COUNT(DISTINCT user_id)',
      prize_count: 'COUNT(DISTINCT lottery_prize_id)'
    }
  },

  /**
   * 活动数据源
   */
  campaigns: {
    model: 'LotteryCampaign',
    defaultFields: ['lottery_campaign_id', 'name', 'status', 'start_time', 'end_time'],
    aggregateFields: {
      total_count: 'COUNT(*)',
      active_count: "COUNT(CASE WHEN status = 'active' THEN 1 END)"
    }
  }
}

/**
 * 自定义报表服务类
 */
class CustomReportService {
  // ==================== 报表模板CRUD (B-36) ====================

  /**
   * 创建报表模板
   *
   * @param {Object} data - 模板数据
   * @param {string} data.name - 模板名称
   * @param {string} data.description - 模板描述
   * @param {string} data.data_source - 数据源（users/points/consumptions/exchanges/lottery）
   * @param {Object} data.query_config - 查询配置
   * @param {Object} data.display_config - 显示配置
   * @param {number} data.created_by - 创建者ID
   * @param {Object} [options] - Sequelize选项
   * @returns {Promise<Object>} 创建的模板
   */
  static async createTemplate(data, options = {}) {
    const {
      name,
      description,
      data_source,
      query_config = {},
      display_config = {},
      created_by
    } = data

    // 验证数据源是否有效
    if (!DATA_SOURCE_CONFIG[data_source]) {
      throw new Error(`无效的数据源: ${data_source}`)
    }

    const template = await models.ReportTemplate.create(
      {
        name,
        description,
        template_type: 'custom',
        data_source,
        query_config,
        display_config,
        is_system: false,
        is_enabled: true,
        created_by
      },
      options
    )

    logger.info(`[自定义报表] 创建模板成功`, {
      report_template_id: template.report_template_id,
      name,
      data_source,
      created_by
    })

    return template
  }

  /**
   * 更新报表模板
   *
   * @param {number} templateId - 模板ID
   * @param {Object} data - 更新数据
   * @param {Object} [options] - Sequelize选项
   * @returns {Promise<Object>} 更新后的模板
   */
  static async updateTemplate(templateId, data, options = {}) {
    const template = await models.ReportTemplate.findByPk(templateId)

    if (!template) {
      throw new Error('报表模板不存在')
    }

    // 系统模板不允许修改核心配置
    if (template.is_system) {
      const allowedFields = ['is_enabled', 'display_config']
      const updateData = {}
      allowedFields.forEach(field => {
        if (data[field] !== undefined) {
          updateData[field] = data[field]
        }
      })
      await template.update(updateData, options)
    } else {
      await template.update(data, options)
    }

    logger.info(`[自定义报表] 更新模板成功`, {
      report_template_id: templateId,
      updated_fields: Object.keys(data)
    })

    return template
  }

  /**
   * 删除报表模板
   *
   * @param {number} templateId - 模板ID
   * @param {Object} [options] - Sequelize选项
   * @returns {Promise<boolean>} 是否删除成功
   */
  static async deleteTemplate(templateId, options = {}) {
    const template = await models.ReportTemplate.findByPk(templateId)

    if (!template) {
      throw new Error('报表模板不存在')
    }

    if (template.is_system) {
      throw new Error('系统模板不允许删除')
    }

    await template.destroy(options)

    logger.info(`[自定义报表] 删除模板成功`, { report_template_id: templateId })

    return true
  }

  /**
   * 获取报表模板列表
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 分页结果
   */
  static async getTemplateList(params = {}) {
    const { template_type, data_source, is_system, is_enabled, page = 1, page_size = 20 } = params

    const where = {}

    if (template_type) {
      where.template_type = template_type
    }
    if (data_source) {
      where.data_source = data_source
    }
    if (is_system !== undefined) {
      where.is_system = is_system
    }
    if (is_enabled !== undefined) {
      where.is_enabled = is_enabled
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await models.ReportTemplate.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [
        ['is_system', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: page_size,
      offset
    })

    return {
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size),
      items: rows
    }
  }

  /**
   * 获取模板详情
   *
   * @param {number} templateId - 模板ID
   * @returns {Promise<Object>} 模板详情
   */
  static async getTemplateDetail(templateId) {
    const template = await models.ReportTemplate.findByPk(templateId, {
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    if (!template) {
      throw new Error('报表模板不存在')
    }

    return template
  }

  // ==================== 动态报表生成 (B-37) ====================

  /**
   * 动态生成报表
   *
   * @param {number} templateId - 模板ID
   * @param {Object} params - 生成参数
   * @param {Date} [params.start_time] - 开始时间
   * @param {Date} [params.end_time] - 结束时间
   * @param {Object} [params.filters] - 自定义筛选条件
   * @param {string} [params.group_by] - 分组字段
   * @returns {Promise<Object>} 报表数据
   */
  static async generateReport(templateId, params = {}) {
    const template = await models.ReportTemplate.findByPk(templateId)

    if (!template) {
      throw new Error('报表模板不存在')
    }

    if (!template.is_enabled) {
      throw new Error('该报表模板已禁用')
    }

    const { start_time, end_time, filters = {}, group_by } = params
    const dataSourceConfig = DATA_SOURCE_CONFIG[template.data_source]

    if (!dataSourceConfig) {
      throw new Error(`无效的数据源配置: ${template.data_source}`)
    }

    // 根据数据源类型生成报表
    const reportData = await CustomReportService._generateDataSourceReport(
      template,
      dataSourceConfig,
      { start_time, end_time, filters, group_by }
    )

    // 更新模板最后执行时间
    await template.update({ last_executed_at: BeijingTimeHelper.createDatabaseTime() })

    logger.info(`[自定义报表] 生成报表成功`, {
      report_template_id: templateId,
      data_source: template.data_source,
      result_count: reportData.data?.length || 0
    })

    return {
      template: {
        report_template_id: template.report_template_id,
        name: template.name,
        data_source: template.data_source
      },
      generated_at: BeijingTimeHelper.createApiTimestamp(),
      params: { start_time, end_time, filters, group_by },
      ...reportData
    }
  }

  /**
   * 生成数据源报表（内部方法）
   *
   * @private
   * @param {Object} template - 报表模板
   * @param {Object} config - 数据源配置
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 报表数据
   */
  static async _generateDataSourceReport(template, config, params) {
    const { start_time, end_time, filters, group_by } = params
    const queryConfig = template.query_config || {}
    const model = models[config.model]

    if (!model) {
      throw new Error(`模型不存在: ${config.model}`)
    }

    // 构建查询条件
    const where = { ...config.filter }

    // 时间范围筛选
    if (start_time || end_time) {
      const timeField = queryConfig.time_field || 'created_at'
      where[timeField] = {}
      if (start_time) {
        where[timeField][Op.gte] = start_time
      }
      if (end_time) {
        where[timeField][Op.lte] = end_time
      }
    }

    // 应用自定义筛选
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        where[key] = value
      }
    })

    // 查询数据
    if (queryConfig.aggregate || group_by) {
      // 聚合查询
      return await CustomReportService._generateAggregateReport(
        model,
        where,
        config,
        queryConfig,
        group_by
      )
    } else {
      // 明细查询
      return await CustomReportService._generateDetailReport(model, where, config, queryConfig)
    }
  }

  /**
   * 生成聚合报表
   *
   * @private
   * @param {Object} model - Sequelize 模型
   * @param {Object} where - 查询条件
   * @param {Object} config - 数据源配置
   * @param {Object} queryConfig - 查询配置
   * @param {string} groupBy - 分组字段
   * @returns {Promise<Object>} 聚合报表数据
   */
  static async _generateAggregateReport(model, where, config, queryConfig, groupBy) {
    const aggregateFields = queryConfig.aggregate_fields || Object.keys(config.aggregateFields)
    const attributes = []

    // 添加聚合字段
    aggregateFields.forEach(field => {
      if (config.aggregateFields[field]) {
        attributes.push([models.sequelize.literal(config.aggregateFields[field]), field])
      }
    })

    // 添加分组字段
    const group = []
    if (groupBy) {
      attributes.unshift(groupBy)
      group.push(groupBy)
    }

    const result = await model.findAll({
      where,
      attributes,
      group: group.length > 0 ? group : undefined,
      raw: true
    })

    return {
      type: 'aggregate',
      data: result,
      summary: CustomReportService._calculateSummary(result, aggregateFields)
    }
  }

  /**
   * 生成明细报表
   *
   * @private
   * @param {Object} model - Sequelize 模型
   * @param {Object} where - 查询条件
   * @param {Object} config - 数据源配置
   * @param {Object} queryConfig - 查询配置
   * @returns {Promise<Object>} 明细报表数据
   */
  static async _generateDetailReport(model, where, config, queryConfig) {
    const limit = queryConfig.limit || 1000
    const fields = queryConfig.fields || config.defaultFields

    const result = await model.findAll({
      where,
      attributes: fields,
      order: [['created_at', 'DESC']],
      limit,
      raw: true
    })

    return {
      type: 'detail',
      data: result,
      total_count: result.length
    }
  }

  /**
   * 计算汇总数据
   *
   * @private
   * @param {Array} data - 数据数组
   * @param {Array} fields - 需要汇总的字段
   * @returns {Object} 汇总结果
   */
  static _calculateSummary(data, fields) {
    if (!data || data.length === 0) {
      return {}
    }

    const summary = {}
    fields.forEach(field => {
      const values = data.map(row => parseFloat(row[field]) || 0)
      summary[field] = {
        total: values.reduce((a, b) => a + b, 0),
        avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        min: Math.min(...values),
        max: Math.max(...values)
      }
    })

    return summary
  }

  // ==================== 报表预览 (B-38) ====================

  /**
   * 预览报表（快速预览，限制数据量）
   *
   * @param {number} templateId - 模板ID
   * @param {Object} params - 预览参数
   * @returns {Promise<Object>} 预览数据
   */
  static async previewReport(templateId, params = {}) {
    // 预览模式限制数据量
    const previewParams = {
      ...params,
      limit: 100 // 预览最多100条
    }

    const reportData = await CustomReportService.generateReport(templateId, previewParams)

    return {
      ...reportData,
      is_preview: true,
      preview_limit: 100
    }
  }

  // ==================== 报表导出 (B-40) ====================

  /**
   * 导出报表数据
   *
   * @param {number} templateId - 模板ID
   * @param {Object} params - 导出参数
   * @param {string} [params.format] - 导出格式（json/csv）
   * @returns {Promise<Object>} 导出数据
   */
  static async exportReport(templateId, params = {}) {
    const { format = 'json', ...reportParams } = params

    const reportData = await CustomReportService.generateReport(templateId, reportParams)

    if (format === 'csv') {
      return CustomReportService._convertToCSV(reportData)
    }

    return reportData
  }

  /**
   * 转换为CSV格式
   *
   * @private
   * @param {Object} reportData - 报表数据
   * @returns {Object} CSV格式结果
   */
  static _convertToCSV(reportData) {
    if (!reportData.data || reportData.data.length === 0) {
      return { csv: '', row_count: 0 }
    }

    const data = reportData.data
    const headers = Object.keys(data[0])

    // 构建CSV内容
    const csvLines = [
      headers.join(','),
      ...data.map(row =>
        headers
          .map(h => {
            const value = row[h]
            // 转义包含逗号或引号的值
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`
            }
            return value ?? ''
          })
          .join(',')
      )
    ]

    return {
      csv: csvLines.join('\n'),
      row_count: data.length,
      headers
    }
  }

  // ==================== 定时推送任务 (B-39) ====================

  /**
   * 获取需要定时推送的报表
   *
   * @returns {Promise<Array>} 需要推送的模板列表
   */
  static async getScheduledTemplates() {
    return await models.ReportTemplate.findAll({
      where: {
        is_enabled: true,
        schedule_config: { [Op.ne]: null }
      }
    })
  }

  /**
   * 执行定时报表推送
   *
   * @param {number} templateId - 模板ID
   * @returns {Promise<Object>} 推送结果
   */
  static async executeScheduledReport(templateId) {
    const template = await models.ReportTemplate.findByPk(templateId)

    if (!template) {
      throw new Error('报表模板不存在')
    }

    const scheduleConfig = template.schedule_config || {}

    // 根据调度配置计算时间范围
    const timeRange = CustomReportService._calculateScheduleTimeRange(scheduleConfig)

    // 生成报表
    const reportData = await CustomReportService.generateReport(templateId, timeRange)

    /*
     * 推送逻辑由调度层 jobs/scheduled-report-push.js 的 pushReportNotification() 负责
     * 职责分离：Service 层负责报表生成，Job 层负责调度和推送
     */

    logger.info(`[自定义报表] 定时报表执行完成`, {
      report_template_id: templateId,
      time_range: timeRange
    })

    return {
      report_template_id: templateId,
      executed_at: BeijingTimeHelper.createApiTimestamp(),
      time_range: timeRange,
      data_count: reportData.data?.length || 0
    }
  }

  /**
   * 计算定时报表的时间范围
   *
   * @private
   * @param {Object} scheduleConfig - 定时配置
   * @returns {Object} 时间范围对象
   */
  static _calculateScheduleTimeRange(scheduleConfig) {
    const now = new Date()
    const period = scheduleConfig.period || 'daily'

    let start_time, end_time

    switch (period) {
      case 'daily':
        start_time = new Date(now)
        start_time.setDate(start_time.getDate() - 1)
        start_time.setHours(0, 0, 0, 0)
        end_time = new Date(now)
        end_time.setHours(0, 0, 0, 0)
        break

      case 'weekly':
        start_time = new Date(now)
        start_time.setDate(start_time.getDate() - 7)
        start_time.setHours(0, 0, 0, 0)
        end_time = new Date(now)
        end_time.setHours(0, 0, 0, 0)
        break

      case 'monthly':
        start_time = new Date(now)
        start_time.setMonth(start_time.getMonth() - 1)
        start_time.setHours(0, 0, 0, 0)
        end_time = new Date(now)
        end_time.setHours(0, 0, 0, 0)
        break

      default:
        start_time = new Date(now)
        start_time.setDate(start_time.getDate() - 1)
        end_time = now
    }

    return { start_time, end_time }
  }

  /**
   * 获取可用的数据源列表
   *
   * @returns {Array} 数据源列表
   */
  static getAvailableDataSources() {
    return Object.entries(DATA_SOURCE_CONFIG).map(([key, config]) => ({
      code: key,
      model: config.model,
      default_fields: config.defaultFields,
      aggregate_fields: Object.keys(config.aggregateFields)
    }))
  }
}

module.exports = CustomReportService
