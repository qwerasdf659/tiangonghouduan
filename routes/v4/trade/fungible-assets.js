/**
 * 餐厅积分抽奖系统 V4.0 - 可叠加资产交易API
 *
 * 业务范围：
 * - 可叠加资产挂牌到市场（暂未实现）
 * - 可叠加资产撤回（暂未实现）
 *
 * 说明：
 * 此功能需要 AssetService 的冻结/解冻功能支持
 * 当前版本返回功能重构中的提示
 *
 * 创建时间：2025-12-22
 * 来源：从 listings.js 拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger } = require('../../../middleware/validation')

/**
 * 挂牌可叠加资产到市场
 * POST /api/v4/inventory/market/fungible-assets/list
 *
 * 🔴 业务场景：用户将可叠加资产挂牌到市场出售
 * 暂未实现：此功能需要 AssetService 的冻结功能支持
 */
router.post('/list', authenticateToken, async (req, res) => {
  return res.apiError(
    '可叠加资产挂牌功能正在重构中，敬请期待',
    'FEATURE_REBUILDING',
    {
      suggestion: '请使用 /api/v4/exchange_market 进行资产兑换'
    },
    503
  )
})

/**
 * 撤回可叠加资产挂牌
 * POST /api/v4/inventory/market/fungible-assets/:listing_id/withdraw
 *
 * 暂未实现：此功能需要 AssetService 的解冻功能支持
 */
router.post(
  '/:listing_id/withdraw',
  authenticateToken,
  validatePositiveInteger('listing_id', 'params'),
  async (req, res) => {
    return res.apiError(
      '可叠加资产撤回功能正在重构中，敬请期待',
      'FEATURE_REBUILDING',
      {
        suggestion: '请联系客服处理'
      },
      503
    )
  }
)

module.exports = router
