/**
 * 门店管理路由 - Console 平台管理域
 *
 * @description 提供平台管理员门店数据的 CRUD 操作 API
 *              路径：/api/v4/console/stores
 *
 * 业务场景：
 * - 平台管理员创建/编辑/删除门店
 * - 门店列表查询（支持分页、筛选）
 * - 门店详情查询
 * - 门店状态管理（激活/停用）
 *
 * 权限要求：
 * - 所有接口需要 admin 角色（role_level >= 100）
 *
 * 接口清单：
 * - GET    /                 - 获取门店列表（分页、筛选）
 * - GET    /stats            - 获取门店统计数据
 * - GET    /regions          - 获取所有可用区域列表
 * - GET    /:store_id        - 获取门店详情
 * - POST   /                 - 创建新门店
 * - PUT    /:store_id        - 更新门店信息
 * - DELETE /:store_id        - 删除门店（软删除）
 * - POST   /:store_id/activate   - 激活门店
 * - POST   /:store_id/deactivate - 停用门店
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - P1 门店数据维护入口
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const StoreService = require('../../../services/StoreService')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * 处理服务层错误
 *
 * @param {Error} error - 错误对象
 * @param {Object} res - Express 响应对象
 * @param {string} operation - 操作名称
 * @returns {Object} Express 响应对象
 */
function handleServiceError(error, res, operation) {
  logger.error(`❌ ${operation}失败`, { error: error.message })

  // 根据错误类型返回不同状态码
  if (error.message.includes('不存在') || error.message.includes('not found')) {
    return res.apiError(error.message, 'NOT_FOUND', null, 404)
  }

  if (
    error.message.includes('已存在') ||
    error.message.includes('重复') ||
    error.message.includes('已被')
  ) {
    return res.apiError(error.message, 'CONFLICT', null, 409)
  }

  if (
    error.message.includes('不能为空') ||
    error.message.includes('无法删除') ||
    error.message.includes('必填')
  ) {
    return res.apiError(error.message, 'VALIDATION_ERROR', null, 400)
  }

  return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
}

/*
 * =================================================================
 * 查询接口
 * =================================================================
 */

/**
 * GET / - 获取门店列表
 *
 * @description 获取门店列表，支持分页、筛选和关键词搜索
 *
 * Query Parameters:
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20，最大100）
 * - status: 状态筛选（active/inactive/pending）
 * - region: 区域筛选
 * - keyword: 关键词搜索（门店名称/编号/联系人）
 * - assigned_to: 业务员ID筛选
 * - merchant_id: 商户ID筛选
 *
 * @access Admin only (role_level >= 100)
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      page_size = 20,
      status,
      region,
      keyword,
      assigned_to,
      merchant_id
    } = req.query

    // 验证分页参数
    const validatedPageSize = Math.min(parseInt(page_size, 10) || 20, 100)

    const result = await StoreService.getStoreList({
      page,
      page_size: validatedPageSize,
      status,
      region,
      keyword,
      assigned_to,
      merchant_id
    })

    return res.apiSuccess(result, '获取门店列表成功')
  } catch (error) {
    return handleServiceError(error, res, '获取门店列表')
  }
})

/**
 * GET /stats - 获取门店统计数据
 *
 * @description 获取门店各状态数量统计
 *
 * @access Admin only (role_level >= 100)
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await StoreService.getStoreStats()

    return res.apiSuccess(stats, '获取门店统计成功')
  } catch (error) {
    return handleServiceError(error, res, '获取门店统计')
  }
})

/**
 * GET /regions - 获取所有可用区域列表
 *
 * @description 获取数据库中已存在的所有区域列表
 *
 * @access Admin only (role_level >= 100)
 */
router.get('/regions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const regions = await StoreService.getRegions()

    return res.apiSuccess(
      {
        total: regions.length,
        regions
      },
      '获取区域列表成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '获取区域列表')
  }
})

/**
 * GET /:store_id - 获取门店详情
 *
 * @description 获取单个门店的详细信息，包括员工统计
 *
 * @access Admin only (role_level >= 100)
 */
router.get('/:store_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { store_id } = req.params

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const store = await StoreService.getStoreById(parseInt(store_id, 10))

    if (!store) {
      return res.apiError(`门店 ID ${store_id} 不存在`, 'STORE_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(store, '获取门店详情成功')
  } catch (error) {
    return handleServiceError(error, res, '获取门店详情')
  }
})

/*
 * =================================================================
 * 创建接口
 * =================================================================
 */

/**
 * POST / - 创建新门店
 *
 * @description 创建一个新门店
 *
 * Request Body:
 * - store_name: 门店名称（必填）
 * - store_code: 门店编号（可选，系统自动生成）
 * - store_address: 门店地址
 * - contact_name: 联系人姓名
 * - contact_mobile: 联系电话
 * - region: 所属区域
 * - status: 门店状态（默认 pending）
 * - assigned_to: 分配给哪个业务员
 * - merchant_id: 商户ID
 * - notes: 备注
 *
 * @access Admin only (role_level >= 100)
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const storeData = req.body
    const operator_id = req.user.user_id

    // 验证必填字段
    if (!storeData.store_name || storeData.store_name.trim() === '') {
      return res.apiError('门店名称不能为空', 'STORE_NAME_REQUIRED', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await StoreService.createStore(storeData, {
        operator_id,
        transaction
      })
    })

    return res.apiSuccess(result.store, '门店创建成功')
  } catch (error) {
    return handleServiceError(error, res, '创建门店')
  }
})

/*
 * =================================================================
 * 更新接口
 * =================================================================
 */

/**
 * PUT /:store_id - 更新门店信息
 *
 * @description 更新门店的基本信息
 *
 * @access Admin only (role_level >= 100)
 */
router.put('/:store_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { store_id } = req.params
    const updateData = req.body
    const operator_id = req.user.user_id

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await StoreService.updateStore(parseInt(store_id, 10), updateData, {
        operator_id,
        transaction
      })
    })

    return res.apiSuccess(result.store, '门店更新成功')
  } catch (error) {
    return handleServiceError(error, res, '更新门店')
  }
})

/*
 * =================================================================
 * 删除接口
 * =================================================================
 */

/**
 * DELETE /:store_id - 删除门店
 *
 * @description 删除门店（软删除：设置状态为 inactive）
 *
 * Query Parameters:
 * - force: 是否强制删除（包括物理删除和删除关联员工）
 *
 * @access Admin only (role_level >= 100)
 */
router.delete('/:store_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { store_id } = req.params
    const { force } = req.query
    const operator_id = req.user.user_id

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await StoreService.deleteStore(parseInt(store_id, 10), {
        operator_id,
        force: force === 'true',
        transaction
      })
    })

    return res.apiSuccess(result, result.message)
  } catch (error) {
    return handleServiceError(error, res, '删除门店')
  }
})

/*
 * =================================================================
 * 状态管理接口
 * =================================================================
 */

/**
 * POST /:store_id/activate - 激活门店
 *
 * @description 将门店状态设置为 active（正常营业）
 *
 * @access Admin only (role_level >= 100)
 */
router.post('/:store_id/activate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { store_id } = req.params
    const operator_id = req.user.user_id

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await StoreService.updateStore(
        parseInt(store_id, 10),
        { status: 'active' },
        { operator_id, transaction }
      )
    })

    return res.apiSuccess(result.store, '门店已激活')
  } catch (error) {
    return handleServiceError(error, res, '激活门店')
  }
})

/**
 * POST /:store_id/deactivate - 停用门店
 *
 * @description 将门店状态设置为 inactive（已关闭）
 *
 * @access Admin only (role_level >= 100)
 */
router.post('/:store_id/deactivate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { store_id } = req.params
    const operator_id = req.user.user_id

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      return await StoreService.updateStore(
        parseInt(store_id, 10),
        { status: 'inactive' },
        { operator_id, transaction }
      )
    })

    return res.apiSuccess(result.store, '门店已停用')
  } catch (error) {
    return handleServiceError(error, res, '停用门店')
  }
})

module.exports = router
