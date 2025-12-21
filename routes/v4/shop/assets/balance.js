/**
 * 餐厅积分抽奖系统 V4.5.0 - 资产余额查询API
 * 处理用户资产余额的查询功能
 *
 * 功能说明：
 * - 单个资产余额查询
 * - 全部资产余额列表查询
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
 * 获取当前用户指定资产余额（统一账本）
 * GET /api/v4/assets/balance?asset_code=DIAMOND
 *
 * 业务场景：
 * - 查询用户指定资产的余额
 * - Phase 4: 余额真相来自 account_asset_balances（available_amount + frozen_amount）
 *
 * 查询参数：
 * @param {string} [asset_code=DIAMOND] - 资产代码（可选，默认DIAMOND）
 *
 * 响应数据：
 * {
 *   "success": true,
 *   "data": {
 *     "asset_code": "DIAMOND",
 *     "available_amount": 1000,
 *     "frozen_amount": 0,
 *     "total_amount": 1000
 *   },
 *   "message": "获取资产余额成功"
 * }
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const asset_code = (req.query.asset_code || 'DIAMOND').toString()

    // 通过 ServiceManager 获取 AssetService（符合TR-005规范）
    const AssetService = req.app.locals.services.getService('asset')

    const balance = await AssetService.getBalance({ user_id, asset_code })

    return res.apiSuccess(
      {
        asset_code,
        ...balance
      },
      '获取资产余额成功'
    )
  } catch (error) {
    logger.error('获取资产余额失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      asset_code: req.query?.asset_code
    })
    return handleServiceError(error, res, '获取资产余额失败')
  }
})

/**
 * 获取用户全部资产余额接口
 * GET /api/v4/assets/balances
 *
 * 业务场景：
 * - 查询用户所有材料资产余额
 * - 用于前端展示用户拥有的材料数量
 *
 * 响应数据：
 * {
 *   "success": true,
 *   "data": {
 *     "balances": [
 *       {
 *         "asset_code": "red_shard",
 *         "available_amount": 100,
 *         "frozen_amount": 0,
 *         "total_amount": 100
 *       }
 *     ],
 *     "summary": {
 *       "total_assets": 1
 *     }
 *   },
 *   "message": "获取资产余额列表成功"
 * }
 */
router.get('/balances', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    // 通过 ServiceManager 获取 AssetService（符合TR-005规范）
    const AssetService = req.app.locals.services.getService('asset')

    const rows = await AssetService.getAllBalances({ user_id })

    const balances = rows.map(r => ({
      asset_code: r.asset_code,
      available_amount: Number(r.available_amount),
      frozen_amount: Number(r.frozen_amount),
      total_amount: Number(r.available_amount) + Number(r.frozen_amount)
    }))

    return res.apiSuccess(
      {
        balances,
        summary: {
          total_assets: balances.length
        }
      },
      '获取资产余额列表成功'
    )
  } catch (error) {
    logger.error('获取资产余额列表失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '获取资产余额列表失败')
  }
})

module.exports = router
