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
 * - GET    /:store_id        - 获取门店详情
 * - POST   /                 - 创建新门店
 * - POST   /batch-import     - 批量导入门店
 * - PUT    /:store_id        - 更新门店信息
 * - DELETE /:store_id        - 删除门店（软删除）
 * - POST   /:store_id/activate   - 激活门店
 * - POST   /:store_id/deactivate - 停用门店
 *
 * 关联路由：区域列表查询 → /api/v4/console/regions
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - P1 门店数据维护入口
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * 获取门店管理服务（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} StoreService 实例
 */
function getStoreService(req) {
  return req.app.locals.services.getService('store')
}

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
 * - province_code: 省级行政区划代码筛选
 * - city_code: 市级行政区划代码筛选
 * - district_code: 区县级行政区划代码筛选
 * - street_code: 街道级行政区划代码筛选
 * - keyword: 关键词搜索（门店名称/编号/联系人）
 * - assigned_to: 业务员ID筛选
 * - merchant_id: 商户ID筛选
 *
 * @access Admin only (role_level >= 100)
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      page = 1,
      page_size = 20,
      status,
      province_code,
      city_code,
      district_code,
      street_code,
      keyword,
      assigned_to,
      merchant_id
    } = req.query

    // 验证分页参数
    const validatedPageSize = Math.min(parseInt(page_size, 10) || 20, 100)

    const StoreService = getStoreService(req)
    const result = await StoreService.getStoreList({
      page,
      page_size: validatedPageSize,
      status,
      province_code,
      city_code,
      district_code,
      street_code,
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
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const StoreService = getStoreService(req)
    const stats = await StoreService.getStoreStats()

    return res.apiSuccess(stats, '获取门店统计成功')
  } catch (error) {
    return handleServiceError(error, res, '获取门店统计')
  }
})

/**
 * GET /contribution - 获取商户贡献度排行
 *
 * @description 统计各商户的消费贡献度，按贡献金额降序排列
 *
 * Query Parameters:
 * - days: 统计天数（默认30天）
 * - limit: 返回数量限制（默认20条，最大100）
 *
 * @returns {Object} 贡献度排行数据
 * @returns {Array} data.rankings - 商户排行列表
 * @returns {number} data.platform_total - 平台总消费金额
 * @returns {number} data.period_days - 统计天数
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/stores/contribution?days=30&limit=20
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "rankings": [
 *       {
 *         "rank": 1,
 *         "merchant_id": 1001,
 *         "merchant_name": "商户A",
 *         "avatar": "...",
 *         "order_count": 150,
 *         "total_amount": 25000.00,
 *         "avg_amount": 166.67,
 *         "contribution_rate": 0.1250
 *       }
 *     ],
 *     "platform_total": 200000.00,
 *     "period_days": 30,
 *     "updated_at": "2026-02-03T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 *
 * @access Admin only (role_level >= 100)
 *
 * 关联需求：§6.2.1 商户贡献度排行接口
 */
router.get('/contribution', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { days = 30, limit = 20 } = req.query

    logger.info('[门店管理] 获取商户贡献度排行', {
      admin_id: req.user.user_id,
      days: parseInt(days),
      limit: parseInt(limit)
    })

    // 🔄 通过 ServiceManager 获取 StoreContributionService
    const StoreContributionService = req.app.locals.services.getService('store_contribution')
    const result = await StoreContributionService.getContributionRanking({
      days: parseInt(days) || 30,
      limit: Math.min(parseInt(limit) || 20, 100)
    })

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    return handleServiceError(error, res, '获取商户贡献度排行')
  }
})

/**
 * GET /:store_id/trend - 获取商户消费趋势
 *
 * @description 获取指定商户近N天的消费趋势数据
 *
 * @param {number} store_id - 商户ID
 * @query {number} [days=30] - 统计天数
 *
 * @access Admin only (role_level >= 100)
 *
 * 关联需求：§6.2 商户贡献度服务
 */
router.get('/:store_id/trend', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { store_id } = req.params
    const { days = 30 } = req.query

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('商户ID无效', 'INVALID_STORE_ID', null, 400)
    }

    logger.info('[门店管理] 获取商户消费趋势', {
      admin_id: req.user.user_id,
      store_id: parseInt(store_id),
      days: parseInt(days)
    })

    const StoreContributionService = req.app.locals.services.getService('store_contribution')
    const result = await StoreContributionService.getMerchantTrend(parseInt(store_id, 10), {
      days: parseInt(days) || 30
    })

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    return handleServiceError(error, res, '获取商户消费趋势')
  }
})

/**
 * GET /:store_id/health-score - 获取商户健康度评分
 *
 * @description 获取商户健康度评分（基于消费金额、频次、增长趋势）
 *
 * @param {number} store_id - 商户ID
 * @query {number} [days=30] - 统计天数
 *
 * @access Admin only (role_level >= 100)
 *
 * 关联需求：§6.2 商户贡献度服务
 */
router.get(
  '/:store_id/health-score',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { store_id } = req.params
      const { days = 30 } = req.query

      if (!store_id || isNaN(parseInt(store_id, 10))) {
        return res.apiError('商户ID无效', 'INVALID_STORE_ID', null, 400)
      }

      logger.info('[门店管理] 获取商户健康度评分', {
        admin_id: req.user.user_id,
        store_id: parseInt(store_id),
        days: parseInt(days)
      })

      const StoreContributionService = req.app.locals.services.getService('store_contribution')
      const result = await StoreContributionService.calculateHealthScore(parseInt(store_id, 10), {
        days: parseInt(days) || 30
      })

      return res.apiSuccess(result, '获取成功')
    } catch (error) {
      return handleServiceError(error, res, '获取商户健康度评分')
    }
  }
)

/**
 * GET /:store_id/comparison - 获取商户环比同比数据
 *
 * @description 对比本周/上周、本月/上月的消费数据
 *
 * @param {number} store_id - 商户ID
 *
 * @access Admin only (role_level >= 100)
 *
 * 关联需求：§6.2 商户贡献度服务
 */
router.get('/:store_id/comparison', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { store_id } = req.params

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('商户ID无效', 'INVALID_STORE_ID', null, 400)
    }

    logger.info('[门店管理] 获取商户环比同比数据', {
      admin_id: req.user.user_id,
      store_id: parseInt(store_id)
    })

    const StoreContributionService = req.app.locals.services.getService('store_contribution')
    const result = await StoreContributionService.getComparison(parseInt(store_id, 10))

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    return handleServiceError(error, res, '获取商户环比同比数据')
  }
})

/**
 * GET /:store_id - 获取门店详情
 *
 * @description 获取单个门店的详细信息，包括员工统计
 *
 * @access Admin only (role_level >= 100)
 */
router.get('/:store_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { store_id } = req.params

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const StoreService = getStoreService(req)
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
 * @description 创建一个新门店，需要提供标准化的行政区划代码
 *
 * Request Body:
 * - store_name: 门店名称（必填）
 * - store_code: 门店编号（可选，系统自动生成）
 * - store_address: 门店详细地址
 * - province_code: 省级行政区划代码（必填）
 * - city_code: 市级行政区划代码（必填）
 * - district_code: 区县级行政区划代码（必填）
 * - street_code: 街道级行政区划代码（必填）
 * - contact_name: 联系人姓名
 * - contact_mobile: 联系电话
 * - status: 门店状态（默认 pending）
 * - assigned_to: 分配给哪个业务员
 * - merchant_id: 商户ID
 * - notes: 备注
 *
 * 注意：province_name/city_name/district_name/street_name 由服务层自动填充
 *
 * @access Admin only (role_level >= 100)
 */
router.post('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const storeData = req.body
    const operator_id = req.user.user_id

    // 验证必填字段
    if (!storeData.store_name || storeData.store_name.trim() === '') {
      return res.apiError('门店名称不能为空', 'STORE_NAME_REQUIRED', null, 400)
    }

    // 验证行政区划代码必填
    const requiredRegionFields = ['province_code', 'city_code', 'district_code', 'street_code']
    const missingFields = requiredRegionFields.filter(field => !storeData[field])
    if (missingFields.length > 0) {
      return res.apiError(
        `缺少必填的行政区划代码: ${missingFields.join(', ')}`,
        'REGION_CODE_REQUIRED',
        null,
        400
      )
    }

    const StoreService = getStoreService(req)
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

/**
 * POST /batch-import - 批量导入门店
 *
 * @description 批量导入门店数据（JSON 格式）
 *
 * Request Body:
 * - stores: 门店数据数组，每个门店需包含：
 *   - store_name: 门店名称（必填）
 *   - province_code: 省级行政区划代码（必填）
 *   - city_code: 市级行政区划代码（必填）
 *   - district_code: 区县级行政区划代码（必填）
 *   - street_code: 街道级行政区划代码（必填）
 *   - store_address: 门店详细地址
 *   - contact_name: 联系人姓名
 *   - contact_mobile: 联系电话
 *   - status: 门店状态（默认 pending）
 *   - merchant_id: 商户ID
 *   - notes: 备注
 *
 * @access Admin only (role_level >= 100)
 */
router.post('/batch-import', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { stores } = req.body
    const operator_id = req.user.user_id

    // 验证请求格式
    if (!Array.isArray(stores) || stores.length === 0) {
      return res.apiError('请提供有效的门店数据数组', 'INVALID_STORES_DATA', null, 400)
    }

    // 限制批量导入数量
    if (stores.length > 100) {
      return res.apiError('单次批量导入最多支持 100 条记录', 'BATCH_SIZE_EXCEEDED', null, 400)
    }

    const results = {
      success: [],
      failed: []
    }

    const StoreService = getStoreService(req)
    // 逐条处理，记录成功和失败（每条记录独立事务，需要按顺序处理）
    for (let i = 0; i < stores.length; i++) {
      const storeData = stores[i]
      const rowIndex = i + 1

      try {
        // 验证必填字段
        if (!storeData.store_name || storeData.store_name.trim() === '') {
          results.failed.push({
            row: rowIndex,
            data: storeData,
            error: '门店名称不能为空'
          })
          continue
        }

        // 验证行政区划代码必填
        const requiredFields = ['province_code', 'city_code', 'district_code', 'street_code']
        const missingFields = requiredFields.filter(field => !storeData[field])
        if (missingFields.length > 0) {
          results.failed.push({
            row: rowIndex,
            data: storeData,
            error: `缺少必填的行政区划代码: ${missingFields.join(', ')}`
          })
          continue
        }

        // 创建门店（使用独立事务，需要逐条处理以记录成功/失败）
        // eslint-disable-next-line no-await-in-loop
        const result = await TransactionManager.execute(async transaction => {
          return await StoreService.createStore(storeData, {
            operator_id,
            transaction
          })
        })

        results.success.push({
          row: rowIndex,
          store_id: result.store.store_id,
          store_name: result.store.store_name
        })
      } catch (error) {
        results.failed.push({
          row: rowIndex,
          data: storeData,
          error: error.message
        })
      }
    }

    // 根据结果返回不同状态
    const message = `批量导入完成：成功 ${results.success.length} 条，失败 ${results.failed.length} 条`

    if (results.failed.length === 0) {
      return res.apiSuccess(results, message)
    } else if (results.success.length === 0) {
      return res.apiError(message, 'BATCH_IMPORT_ALL_FAILED', results, 400)
    } else {
      // 部分成功
      return res.apiSuccess(results, message)
    }
  } catch (error) {
    return handleServiceError(error, res, '批量导入门店')
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
router.put('/:store_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { store_id } = req.params
    const updateData = req.body
    const operator_id = req.user.user_id

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const StoreService = getStoreService(req)
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
router.delete('/:store_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { store_id } = req.params
    const { force } = req.query
    const operator_id = req.user.user_id

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const StoreService = getStoreService(req)
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
router.post('/:store_id/activate', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { store_id } = req.params
    const operator_id = req.user.user_id

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const StoreService = getStoreService(req)
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
router.post('/:store_id/deactivate', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { store_id } = req.params
    const operator_id = req.user.user_id

    if (!store_id || isNaN(parseInt(store_id, 10))) {
      return res.apiError('门店ID无效', 'INVALID_STORE_ID', null, 400)
    }

    const StoreService = getStoreService(req)
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
