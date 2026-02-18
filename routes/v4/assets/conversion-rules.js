/**
 * 餐厅积分抽奖系统 V4.5.0 - 用户端材料转换规则查询API
 * 处理用户端的材料转换规则查询功能
 *
 * 顶层路径：/api/v4/assets/conversion-rules
 *
 * 功能说明：
 * - 查询当前支持的材料转换规则（用户端）
 * - 用于前端（微信小程序）展示可用的转换选项
 * - 不需要商家域权限，普通用户可访问
 *
 * 与商家域接口的区别：
 * - /api/v4/shop/assets/conversion-rules - 商家域（需要 requireMerchantDomainAccess）
 * - /api/v4/assets/conversion-rules - 用户域（普通用户可访问）
 *
 * 创建时间：2026年01月14日
 * 使用 Claude Sonnet 4.5 模型
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * 获取材料转换规则接口（用户端）
 * GET /api/v4/assets/conversion-rules
 *
 * 业务场景：
 * - 查询当前支持的材料转换规则
 * - 用于前端（微信小程序）展示可用的转换选项
 * - 仅返回前端可见的规则（is_visible = true）
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
 *         "enabled": true,
 *         "limits": { "min_from_amount": 1, "max_from_amount": null },
 *         "fee": { "fee_rate": 0.05, "fee_min_amount": 10 },
 *         "display": { "title": "红水晶碎片分解", "description": "...", "risk_level": "low" }
 *       }
 *     ],
 *     "total_rules": 1
 *   },
 *   "message": "获取转换规则成功"
 * }
 */
router.get('/conversion-rules', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    logger.info('用户端获取材料转换规则', { user_id })

    // 通过 ServiceManager 获取 AssetConversionService（符合TR-005规范）
    const AssetConversionService = req.app.locals.services.getService('asset_conversion')

    // 只返回前端可见的规则（is_visible = true）
    const dbRules = await AssetConversionService.getConversionRules({ visible_only: true })

    logger.info('用户端获取转换规则成功', {
      user_id,
      rule_count: dbRules.length
    })

    // 转换为前端需要的增强格式（包含手续费/限制/展示信息）
    const rules = dbRules.map(rule => {
      // 自动生成描述文本（如果规则未配置）
      const autoDescription = `${rule.from_amount} ${rule.from_asset_code} → ${rule.to_amount} ${rule.to_asset_code}`

      return {
        // 基础信息（主键统一命名规范：material_conversion_rule_id）
        rule_id: rule.material_conversion_rule_id,
        from_asset_code: rule.from_asset_code,
        to_asset_code: rule.to_asset_code,
        from_amount: rule.from_amount,
        to_amount: rule.to_amount,
        conversion_rate: `${rule.from_amount}:${rule.to_amount}`, // 例如 "1:20"
        effective_at: rule.effective_at,
        enabled: rule.is_enabled,

        // 数量限制信息
        limits: {
          min_from_amount: rule.min_from_amount || 1, // 默认最小1
          max_from_amount: rule.max_from_amount // null 表示无上限
        },

        // 手续费信息
        fee: {
          fee_rate: parseFloat(rule.fee_rate) || 0, // 费率（小数，如 0.05 = 5%）
          fee_min_amount: rule.fee_min_amount || 0, // 最低手续费
          fee_asset_code: rule.fee_asset_code || rule.to_asset_code // 手续费资产类型
        },

        // 展示信息
        display: {
          title: rule.title || autoDescription, // 规则标题
          description: rule.description || autoDescription, // 详细描述
          display_icon: rule.display_icon || null, // 图标 URL
          risk_level: rule.risk_level || 'low' // 风险等级
        }
      }
    })

    return res.apiSuccess(
      {
        rules,
        total_rules: rules.length
      },
      '获取转换规则成功'
    )
  } catch (error) {
    logger.error('用户端获取转换规则失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '获取转换规则失败')
  }
})

module.exports = router
