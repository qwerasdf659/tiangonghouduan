/**
 * 餐厅积分抽奖系统 V4.5.0 - 资产流水查询API
 * 处理用户资产交易流水的查询功能
 *
 * 功能说明：
 * - 资产交易流水分页查询
 * - 支持按资产代码和业务类型过滤
 *
 * 创建时间：2025年12月22日
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

/**
 * 获取当前用户资产流水（统一账本）
 * GET /api/v4/assets/transactions?asset_code=DIAMOND&page=1&page_size=20
 *
 * 业务场景：
 * - 查询用户资产交易历史
 * - 支持按资产代码和业务类型过滤
 *
 * 查询参数：
 * @param {string} [asset_code] - 资产代码过滤（可选）
 * @param {string} [business_type] - 业务类型过滤（可选）
 * @param {number} [page=1] - 页码（可选，默认1）
 * @param {number} [page_size=20] - 每页条数（可选，默认20，最大200）
 *
 * 响应数据：
 * {
 *   "success": true,
 *   "data": {
 *     "transactions": [...],
 *     "pagination": {
 *       "page": 1,
 *       "page_size": 20,
 *       "total": 100
 *     }
 *   },
 *   "message": "获取资产流水成功"
 * }
 *
 * 错误码：
 * - 400 BAD_REQUEST: 分页参数无效
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const asset_code = req.query.asset_code ? req.query.asset_code.toString() : undefined
    const business_type = req.query.business_type ? req.query.business_type.toString() : undefined
    const page = req.query.page ? parseInt(req.query.page) : 1
    const page_size = req.query.page_size ? parseInt(req.query.page_size) : 20

    // 参数验证
    if (isNaN(page) || page <= 0) {
      return res.apiError(
        'page参数无效，必须为正整数',
        'BAD_REQUEST',
        { page: req.query.page },
        400
      )
    }
    if (isNaN(page_size) || page_size <= 0 || page_size > 200) {
      return res.apiError(
        'page_size参数无效，必须为1-200的正整数',
        'BAD_REQUEST',
        { page_size: req.query.page_size },
        400
      )
    }

    // 通过 ServiceManager 获取 AssetService（符合TR-005规范）
    const AssetService = req.app.locals.services.getService('asset')
    const result = await AssetService.getTransactions(
      { user_id },
      { asset_code, business_type, page, page_size }
    )

    return res.apiSuccess(result, '获取资产流水成功')
  } catch (error) {
    logger.error('获取资产流水失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      asset_code: req.query?.asset_code,
      business_type: req.query?.business_type
    })
    return handleServiceError(error, res, '获取资产流水失败')
  }
})

module.exports = router
