/**
 * @file 物品模板管理路由（Item Templates Routes）
 * @description 管理物品模板表的RESTful API
 *
 * API端点：
 * - GET    /api/v4/console/item-templates              获取模板列表
 * - GET    /api/v4/console/item-templates/types        获取物品类型列表
 * - GET    /api/v4/console/item-templates/:id          获取模板详情（按ID）
 * - GET    /api/v4/console/item-templates/code/:code   获取模板详情（按代码）
 * - POST   /api/v4/console/item-templates              创建模板
 * - PUT    /api/v4/console/item-templates/:id          更新模板
 * - DELETE /api/v4/console/item-templates/:id          删除模板
 * - PUT    /api/v4/console/item-templates/batch/status 批量更新状态
 *
 * 权限：仅管理员（requireRoleLevel(100)）
 * 路径设计：事务实体使用 :id（自增主键）
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * 获取 ItemTemplateService 实例
 *
 * @param {Object} req - Express 请求对象
 * @returns {ItemTemplateService} 服务实例
 */
function getItemTemplateService(req) {
  return req.app.locals.services.getService('item_template')
}

/**
 * GET / - 获取物品模板列表
 *
 * 查询参数：
 * - item_type: 物品类型筛选
 * - category_code: 类目代码筛选
 * - rarity_code: 稀有度代码筛选
 * - is_enabled: 是否启用（true/false）
 * - is_tradable: 是否可交易（true/false）
 * - keyword: 关键词搜索（名称/描述/代码）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getItemTemplateService(req)
    const {
      item_type,
      category_code,
      rarity_code,
      is_enabled,
      is_tradable,
      keyword,
      page,
      page_size
    } = req.query

    const result = await service.getTemplates({
      item_type,
      category_code,
      rarity_code,
      is_enabled: is_enabled === 'true' ? true : is_enabled === 'false' ? false : undefined,
      is_tradable: is_tradable === 'true' ? true : is_tradable === 'false' ? false : undefined,
      keyword,
      page: parseInt(page) || 1,
      page_size: parseInt(page_size) || 20
    })

    return res.apiSuccess(result, '获取物品模板列表成功')
  } catch (error) {
    logger.error('获取物品模板列表失败:', error)
    return res.apiError(
      `获取物品模板列表失败: ${error.message}`,
      error.code || 'ITEM_TEMPLATE_LIST_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * GET /stats - 获取物品模板统计数据
 *
 * 返回：总数、启用数、类型数、稀有度分布
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getItemTemplateService(req)
    const stats = await service.getTemplateStats()

    return res.apiSuccess(stats, '获取物品模板统计成功')
  } catch (error) {
    logger.error('获取物品模板统计失败:', error)
    return res.apiError(
      `获取物品模板统计失败: ${error.message}`,
      'ITEM_TEMPLATE_STATS_FAILED',
      null,
      500
    )
  }
})

/**
 * GET /types - 获取物品类型列表（去重）
 */
router.get('/types', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getItemTemplateService(req)
    const types = await service.getItemTypes()

    return res.apiSuccess({ item_types: types }, '获取物品类型列表成功')
  } catch (error) {
    logger.error('获取物品类型列表失败:', error)
    return res.apiError(`获取物品类型列表失败: ${error.message}`, 'ITEM_TYPES_FAILED', null, 500)
  }
})

/**
 * GET /code/:code - 获取模板详情（按模板代码）
 */
router.get('/code/:code', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getItemTemplateService(req)
    const { code } = req.params
    const result = await service.getTemplateByCode(code)

    return res.apiSuccess(result, '获取物品模板详情成功')
  } catch (error) {
    logger.error(`获取物品模板详情[${req.params.code}]失败:`, error)
    return res.apiError(
      `获取物品模板详情失败: ${error.message}`,
      error.code || 'ITEM_TEMPLATE_DETAIL_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * GET /:id - 获取模板详情（按ID）
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getItemTemplateService(req)
    const { id } = req.params
    const result = await service.getTemplateById(parseInt(id))

    return res.apiSuccess(result, '获取物品模板详情成功')
  } catch (error) {
    logger.error(`获取物品模板详情[${req.params.id}]失败:`, error)
    return res.apiError(
      `获取物品模板详情失败: ${error.message}`,
      error.code || 'ITEM_TEMPLATE_DETAIL_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * POST / - 创建物品模板
 *
 * 请求体：
 * - template_code: 模板代码（唯一，必填）
 * - item_type: 物品类型（必填）
 * - display_name: 显示名称（必填）
 * - category_code: 类目代码
 * - rarity_code: 稀有度代码
 * - description: 描述
 * - image_url: 图片URL
 * - thumbnail_url: 缩略图URL
 * - reference_price_points: 参考价格
 * - is_tradable: 是否可交易
 * - meta: 扩展元数据
 */
router.post('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getItemTemplateService(req)
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.createTemplate(req.body, admin_id, { transaction })
    })

    return res.apiSuccess(result, '创建物品模板成功')
  } catch (error) {
    logger.error('创建物品模板失败:', error)
    return res.apiError(
      `创建物品模板失败: ${error.message}`,
      error.code || 'ITEM_TEMPLATE_CREATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * PUT /:id - 更新物品模板
 *
 * 请求体（均为可选）：
 * - item_type: 物品类型
 * - display_name: 显示名称
 * - category_code: 类目代码
 * - rarity_code: 稀有度代码
 * - description: 描述
 * - image_url: 图片URL
 * - thumbnail_url: 缩略图URL
 * - reference_price_points: 参考价格
 * - is_tradable: 是否可交易
 * - is_enabled: 是否启用
 * - meta: 扩展元数据
 */
router.put('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getItemTemplateService(req)
    const { id } = req.params
    const admin_id = req.user.user_id

    const result = await TransactionManager.execute(async transaction => {
      return await service.updateTemplate(parseInt(id), req.body, admin_id, { transaction })
    })

    return res.apiSuccess(result, '更新物品模板成功')
  } catch (error) {
    logger.error(`更新物品模板[${req.params.id}]失败:`, error)
    return res.apiError(
      `更新物品模板失败: ${error.message}`,
      error.code || 'ITEM_TEMPLATE_UPDATE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * DELETE /:id - 删除物品模板
 */
router.delete('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getItemTemplateService(req)
    const { id } = req.params
    const admin_id = req.user.user_id

    await TransactionManager.execute(async transaction => {
      await service.deleteTemplate(parseInt(id), admin_id, { transaction })
    })

    return res.apiSuccess(null, '删除物品模板成功')
  } catch (error) {
    logger.error(`删除物品模板[${req.params.id}]失败:`, error)
    return res.apiError(
      `删除物品模板失败: ${error.message}`,
      error.code || 'ITEM_TEMPLATE_DELETE_FAILED',
      null,
      error.status || 500
    )
  }
})

/**
 * PUT /batch/status - 批量更新模板状态
 *
 * 请求体：
 * - item_template_ids: 模板ID列表
 * - is_enabled: 是否启用
 */
router.put('/batch/status', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getItemTemplateService(req)
    const { item_template_ids, is_enabled } = req.body
    const admin_id = req.user.user_id

    if (!Array.isArray(item_template_ids) || item_template_ids.length === 0) {
      return res.apiError('item_template_ids 必须是非空数组', 'INVALID_IDS', null, 400)
    }

    if (typeof is_enabled !== 'boolean') {
      return res.apiError('is_enabled 必须是布尔值', 'INVALID_STATUS', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await service.batchUpdateStatus(item_template_ids, is_enabled, admin_id, {
        transaction
      })
    })

    return res.apiSuccess(result, `批量${is_enabled ? '启用' : '禁用'}物品模板成功`)
  } catch (error) {
    logger.error('批量更新模板状态失败:', error)
    return res.apiError(
      `批量更新模板状态失败: ${error.message}`,
      error.code || 'BATCH_STATUS_UPDATE_FAILED',
      null,
      error.status || 500
    )
  }
})

module.exports = router
