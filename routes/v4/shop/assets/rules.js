/**
 * 餐厅积分抽奖系统 V4.5.0 - 材料转换规则查询API
 * 处理材料转换规则的查询功能
 *
 * 功能说明：
 * - 查询当前支持的材料转换规则
 * - 用于前端展示可用的转换选项
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
 * 获取材料转换规则接口
 * GET /api/v4/assets/conversion-rules
 *
 * 业务场景：
 * - 查询当前支持的材料转换规则
 * - 用于前端展示可用的转换选项
 *
 * 响应数据：
 * {
 *   "success": true,
 *   "data": {
 *     "rules": [
 *       {
 *         "rule_id": 1,
 *         "from_asset_code": "red_shard",
 *         "to_asset_code": "DIAMOND",
 *         "from_amount": 1,
 *         "to_amount": 20,
 *         "conversion_rate": "1:20",
 *         "description": "1 red_shard → 20 DIAMOND",
 *         "effective_at": "2025-12-15T00:00:00+08:00",
 *         "enabled": true
 *       }
 *     ],
 *     "source": "database",
 *     "total_rules": 1
 *   },
 *   "message": "获取转换规则成功（从数据库）"
 * }
 */
router.get('/conversion-rules', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    logger.info('获取材料转换规则（从数据库）', { user_id })

    // 通过 ServiceManager 获取 AssetConversionService（符合TR-005规范）
    const AssetConversionService = req.app.locals.services.getService('asset_conversion')
    const dbRules = await AssetConversionService.getConversionRules()

    logger.info('获取转换规则成功（从数据库）', {
      user_id,
      rule_count: dbRules.length
    })

    // 转换为前端需要的格式
    const rules = dbRules.map(rule => ({
      rule_id: rule.rule_id,
      from_asset_code: rule.from_asset_code,
      to_asset_code: rule.to_asset_code,
      from_amount: rule.from_amount,
      to_amount: rule.to_amount,
      conversion_rate: `${rule.from_amount}:${rule.to_amount}`, // 例如 "1:20"
      description: `${rule.from_amount} ${rule.from_asset_code} → ${rule.to_amount} ${rule.to_asset_code}`,
      effective_at: rule.effective_at,
      enabled: rule.is_enabled
    }))

    return res.apiSuccess(
      {
        rules,
        source: 'database', // 标记数据来源
        total_rules: rules.length
      },
      '获取转换规则成功（从数据库）'
    )
  } catch (error) {
    logger.error('获取转换规则失败（数据库查询）', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '获取转换规则失败')
  }
})

module.exports = router
