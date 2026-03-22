/**
 * @file 统一商品中心 — EAV 属性管理路由
 * @description 属性定义、选项 CRUD（写操作统一事务封装）
 *
 * @version 1.0.0
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger

/**
 * 获取 AttributeService 实例
 *
 * @param {Object} req - Express请求对象
 * @returns {Object} AttributeService服务实例
 */
function getAttributeService(req) {
  return req.app.locals.services.getService('product_attribute')
}

/**
 * 解析查询布尔（undefined 表示不传筛选）
 *
 * @param {string|undefined} v - 原始查询值
 * @returns {boolean|undefined} 解析后的布尔值或undefined
 */
function parseQueryBool(v) {
  if (v === undefined || v === null || v === '') return undefined
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return undefined
}

/**
 * GET / — 属性列表
 *
 * 查询：`is_sale_attr`、`is_enabled`、`category_id`
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getAttributeService(req)
    const { category_id } = req.query
    const filters = {
      is_sale_attr: parseQueryBool(req.query.is_sale_attr),
      is_enabled: parseQueryBool(req.query.is_enabled),
      category_id: category_id !== undefined && category_id !== '' ? category_id : undefined
    }

    const items = await service.listAttributes(filters)
    return res.apiSuccess({ items }, '获取属性列表成功')
  } catch (error) {
    logger.error('获取属性列表失败', { error: error.message })
    return res.apiError(
      `获取属性列表失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_ATTR_LIST_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * PUT /options/:option_id — 更新属性选项
 */
router.put('/options/:option_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getAttributeService(req)
    const { option_id } = req.params

    const row = await TransactionManager.execute(async transaction => {
      return await service.updateAttributeOption(option_id, req.body || {}, { transaction })
    })

    return res.apiSuccess(row, '更新属性选项成功')
  } catch (error) {
    logger.error('更新属性选项失败', { option_id: req.params.option_id, error: error.message })
    return res.apiError(
      `更新属性选项失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_ATTR_OPTION_UPDATE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * DELETE /options/:option_id — 删除属性选项
 */
router.delete('/options/:option_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getAttributeService(req)
    const { option_id } = req.params

    await TransactionManager.execute(async transaction => {
      return await service.deleteAttributeOption(option_id, { transaction })
    })

    return res.apiSuccess({ option_id: parseInt(option_id, 10) }, '删除属性选项成功')
  } catch (error) {
    logger.error('删除属性选项失败', { option_id: req.params.option_id, error: error.message })
    return res.apiError(
      `删除属性选项失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_ATTR_OPTION_DELETE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * POST /:id/options — 为属性新增选项
 */
router.post('/:id/options', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getAttributeService(req)
    const { id } = req.params

    const row = await TransactionManager.execute(async transaction => {
      return await service.createAttributeOption(id, req.body || {}, { transaction })
    })

    return res.apiSuccess(row, '创建属性选项成功')
  } catch (error) {
    logger.error('创建属性选项失败', { attribute_id: req.params.id, error: error.message })
    return res.apiError(
      `创建属性选项失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_ATTR_OPTION_CREATE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * GET /:id — 属性详情（含选项）
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getAttributeService(req)
    const row = await service.getAttributeDetail(req.params.id)
    if (!row) {
      return res.apiError('属性不存在', 'PRODUCT_CENTER_ATTRIBUTE_NOT_FOUND', null, 404)
    }
    return res.apiSuccess(row, '获取属性详情成功')
  } catch (error) {
    logger.error('获取属性详情失败', { attribute_id: req.params.id, error: error.message })
    return res.apiError(
      `获取属性详情失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_ATTR_DETAIL_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * POST / — 创建属性
 */
router.post('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getAttributeService(req)

    const row = await TransactionManager.execute(async transaction => {
      return await service.createAttribute(req.body || {}, { transaction })
    })

    return res.apiSuccess(row, '创建属性成功')
  } catch (error) {
    logger.error('创建属性失败', { error: error.message })
    return res.apiError(
      `创建属性失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_ATTR_CREATE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * PUT /:id — 更新属性
 */
router.put('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getAttributeService(req)

    const row = await TransactionManager.execute(async transaction => {
      return await service.updateAttribute(req.params.id, req.body || {}, { transaction })
    })

    return res.apiSuccess(row, '更新属性成功')
  } catch (error) {
    logger.error('更新属性失败', { attribute_id: req.params.id, error: error.message })
    return res.apiError(
      `更新属性失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_ATTR_UPDATE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

/**
 * DELETE /:id — 删除属性
 */
router.delete('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getAttributeService(req)

    await TransactionManager.execute(async transaction => {
      return await service.deleteAttribute(req.params.id, { transaction })
    })

    return res.apiSuccess({ attribute_id: parseInt(req.params.id, 10) }, '删除属性成功')
  } catch (error) {
    logger.error('删除属性失败', { attribute_id: req.params.id, error: error.message })
    return res.apiError(
      `删除属性失败: ${error.message}`,
      error.code || 'PRODUCT_CENTER_ATTR_DELETE_FAILED',
      null,
      error.statusCode || error.status || 500
    )
  }
})

module.exports = router
