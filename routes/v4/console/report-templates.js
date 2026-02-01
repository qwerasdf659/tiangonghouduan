/**
 * 报表模板路由
 *
 * 功能说明：
 * - 模板CRUD：创建、查询、更新、删除报表模板
 * - 报表生成：基于模板动态生成报表
 * - 报表预览：快速预览报表效果
 * - 报表导出：导出报表数据
 *
 * 任务编号：B-36 报表模板CRUD, B-37 动态报表生成, B-38 报表预览, B-40 报表导出
 * 创建时间：2026年01月31日
 *
 * @module routes/v4/console/report-templates
 */

'use strict'

const express = require('express')
const router = express.Router()
const ServiceManager = require('../../../services')
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger')

// ==================== 报表模板 CRUD (B-36) ====================

/**
 * GET /api/v4/console/report-templates
 *
 * 获取报表模板列表
 *
 * 查询参数:
 * - template_type: 模板类型筛选
 * - data_source: 数据源筛选
 * - is_system: 是否系统模板
 * - is_enabled: 启用状态
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reportService = ServiceManager.getService('custom_report')
    const { template_type, data_source, is_system, is_enabled, page, page_size } = req.query

    const result = await reportService.getTemplateList({
      template_type,
      data_source,
      is_system: is_system === 'true' ? true : is_system === 'false' ? false : undefined,
      is_enabled: is_enabled === 'true' ? true : is_enabled === 'false' ? false : undefined,
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    return res.apiSuccess(result, '获取报表模板列表成功')
  } catch (error) {
    logger.error('[报表模板] 获取列表失败', { error: error.message })
    return res.apiError('获取报表模板列表失败', 'REPORT_TEMPLATE_LIST_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/report-templates/data-sources
 *
 * 获取可用的数据源列表
 */
router.get('/data-sources', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reportService = ServiceManager.getService('custom_report')
    const dataSources = reportService.getAvailableDataSources()

    return res.apiSuccess(dataSources, '获取数据源列表成功')
  } catch (error) {
    logger.error('[报表模板] 获取数据源失败', { error: error.message })
    return res.apiError('获取数据源列表失败', 'DATA_SOURCES_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/report-templates/:id
 *
 * 获取单个报表模板详情
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reportService = ServiceManager.getService('custom_report')
    const templateId = parseInt(req.params.id, 10)

    if (!templateId || isNaN(templateId)) {
      return res.apiError('无效的模板ID', 'INVALID_TEMPLATE_ID', null, 400)
    }

    const template = await reportService.getTemplateDetail(templateId)

    return res.apiSuccess(template, '获取报表模板详情成功')
  } catch (error) {
    logger.error('[报表模板] 获取详情失败', { error: error.message })
    if (error.message === '报表模板不存在') {
      return res.apiError('报表模板不存在', 'TEMPLATE_NOT_FOUND', null, 404)
    }
    return res.apiError('获取报表模板详情失败', 'REPORT_TEMPLATE_GET_ERROR', null, 500)
  }
})

/**
 * POST /api/v4/console/report-templates
 *
 * 创建新的报表模板
 *
 * 请求体:
 * - name: 模板名称（必需）
 * - data_source: 数据源（必需）
 * - description: 模板描述
 * - query_config: 查询配置
 * - display_config: 显示配置
 */
router.post('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reportService = ServiceManager.getService('custom_report')
    const { name, data_source, description, query_config, display_config } = req.body

    // 参数验证
    if (!name || !data_source) {
      return res.apiError('模板名称和数据源不能为空', 'MISSING_REQUIRED_FIELDS', null, 400)
    }

    const template = await reportService.createTemplate({
      name,
      data_source,
      description,
      query_config,
      display_config,
      created_by: req.user.user_id
    })

    logger.info('[报表模板] 创建成功', {
      report_template_id: template.report_template_id,
      name,
      created_by: req.user.user_id
    })

    return res.apiSuccess(template, '创建报表模板成功', 201)
  } catch (error) {
    logger.error('[报表模板] 创建失败', { error: error.message })
    return res.apiError(
      `创建报表模板失败: ${error.message}`,
      'REPORT_TEMPLATE_CREATE_ERROR',
      null,
      500
    )
  }
})

/**
 * PUT /api/v4/console/report-templates/:id
 *
 * 更新报表模板
 */
router.put('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reportService = ServiceManager.getService('custom_report')
    const templateId = parseInt(req.params.id, 10)

    if (!templateId || isNaN(templateId)) {
      return res.apiError('无效的模板ID', 'INVALID_TEMPLATE_ID', null, 400)
    }

    const updateData = req.body
    const template = await reportService.updateTemplate(templateId, updateData)

    logger.info('[报表模板] 更新成功', {
      report_template_id: templateId,
      updated_by: req.user.user_id
    })

    return res.apiSuccess(template, '更新报表模板成功')
  } catch (error) {
    logger.error('[报表模板] 更新失败', { error: error.message })
    return res.apiError(
      `更新报表模板失败: ${error.message}`,
      'REPORT_TEMPLATE_UPDATE_ERROR',
      null,
      500
    )
  }
})

/**
 * DELETE /api/v4/console/report-templates/:id
 *
 * 删除报表模板（系统模板不可删除）
 */
router.delete('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reportService = ServiceManager.getService('custom_report')
    const templateId = parseInt(req.params.id, 10)

    if (!templateId || isNaN(templateId)) {
      return res.apiError('无效的模板ID', 'INVALID_TEMPLATE_ID', null, 400)
    }

    await reportService.deleteTemplate(templateId)

    logger.info('[报表模板] 删除成功', {
      report_template_id: templateId,
      deleted_by: req.user.user_id
    })

    return res.apiSuccess(null, '删除报表模板成功')
  } catch (error) {
    logger.error('[报表模板] 删除失败', { error: error.message })
    return res.apiError(
      `删除报表模板失败: ${error.message}`,
      'REPORT_TEMPLATE_DELETE_ERROR',
      null,
      500
    )
  }
})

// ==================== 报表生成 (B-37) ====================

/**
 * POST /api/v4/console/report-templates/:id/generate
 *
 * 根据模板生成报表
 *
 * 请求体:
 * - start_time: 开始时间
 * - end_time: 结束时间
 * - filters: 自定义筛选条件
 * - group_by: 分组字段
 */
router.post('/:id/generate', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reportService = ServiceManager.getService('custom_report')
    const templateId = parseInt(req.params.id, 10)

    if (!templateId || isNaN(templateId)) {
      return res.apiError('无效的模板ID', 'INVALID_TEMPLATE_ID', null, 400)
    }

    const { start_time, end_time, filters, group_by } = req.body

    const reportData = await reportService.generateReport(templateId, {
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined,
      filters,
      group_by
    })

    logger.info('[报表模板] 生成报表成功', {
      report_template_id: templateId,
      data_count: reportData.data?.length || 0,
      generated_by: req.user.user_id
    })

    return res.apiSuccess(reportData, '生成报表成功')
  } catch (error) {
    logger.error('[报表模板] 生成报表失败', { error: error.message })
    return res.apiError(`生成报表失败: ${error.message}`, 'REPORT_GENERATE_ERROR', null, 500)
  }
})

// ==================== 报表预览 (B-38) ====================

/**
 * POST /api/v4/console/report-templates/:id/preview
 *
 * 预览报表（限制数据量）
 */
router.post('/:id/preview', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reportService = ServiceManager.getService('custom_report')
    const templateId = parseInt(req.params.id, 10)

    if (!templateId || isNaN(templateId)) {
      return res.apiError('无效的模板ID', 'INVALID_TEMPLATE_ID', null, 400)
    }

    const { start_time, end_time, filters, group_by } = req.body

    const previewData = await reportService.previewReport(templateId, {
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined,
      filters,
      group_by
    })

    return res.apiSuccess(previewData, '预览报表成功')
  } catch (error) {
    logger.error('[报表模板] 预览报表失败', { error: error.message })
    return res.apiError(`预览报表失败: ${error.message}`, 'REPORT_PREVIEW_ERROR', null, 500)
  }
})

// ==================== 报表导出 (B-40) ====================

/**
 * POST /api/v4/console/report-templates/:id/export
 *
 * 导出报表数据
 *
 * 请求体:
 * - format: 导出格式（json/csv）
 * - start_time: 开始时间
 * - end_time: 结束时间
 * - filters: 自定义筛选条件
 */
router.post('/:id/export', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reportService = ServiceManager.getService('custom_report')
    const templateId = parseInt(req.params.id, 10)

    if (!templateId || isNaN(templateId)) {
      return res.apiError('无效的模板ID', 'INVALID_TEMPLATE_ID', null, 400)
    }

    const { format, start_time, end_time, filters } = req.body

    const exportData = await reportService.exportReport(templateId, {
      format: format || 'json',
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined,
      filters
    })

    logger.info('[报表模板] 导出报表成功', {
      report_template_id: templateId,
      format: format || 'json',
      exported_by: req.user.user_id
    })

    // CSV 格式直接返回文本
    if (format === 'csv' && exportData.csv) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=report_${templateId}_${Date.now()}.csv`
      )
      return res.send(exportData.csv)
    }

    return res.apiSuccess(exportData, '导出报表成功')
  } catch (error) {
    logger.error('[报表模板] 导出报表失败', { error: error.message })
    return res.apiError(`导出报表失败: ${error.message}`, 'REPORT_EXPORT_ERROR', null, 500)
  }
})

module.exports = router
