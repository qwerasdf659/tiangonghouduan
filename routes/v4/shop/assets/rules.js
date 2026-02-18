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
 * 获取材料转换规则接口（增强版）
 * GET /api/v4/assets/conversion-rules
 *
 * 业务场景：
 * - 查询当前支持的材料转换规则
 * - 用于前端展示可用的转换选项
 * - 返回完整的规则信息（含手续费、限制、展示信息）
 *
 * 响应数据（增强版）：
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
 *         "effective_at": "2025-12-15T00:00:00+08:00",
 *         "enabled": true,
 *         "limits": {
 *           "min_from_amount": 1,
 *           "max_from_amount": null
 *         },
 *         "fee": {
 *           "fee_rate": 0.05,
 *           "fee_min_amount": 10,
 *           "fee_asset_code": "DIAMOND"
 *         },
 *         "display": {
 *           "title": "红水晶碎片分解",
 *           "description": "将红水晶碎片分解为钻石",
 *           "display_icon": "/icons/red-shard.png",
 *           "risk_level": "low"
 *         }
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
    // 只返回前端可见的规则（is_visible = true）
    const dbRules = await AssetConversionService.getConversionRules({ visible_only: true })

    logger.info('获取转换规则成功（从数据库）', {
      user_id,
      rule_count: dbRules.length
    })

    // 转换为前端需要的增强格式（包含手续费/限制/展示信息）
    const rules = dbRules.map(rule => {
      // 自动生成描述文本（如果规则未配置）
      const autoDescription = `${rule.from_amount} ${rule.from_asset_code} → ${rule.to_amount} ${rule.to_asset_code}`

      return {
        // 基础信息
        rule_id: rule.rule_id,
        from_asset_code: rule.from_asset_code,
        to_asset_code: rule.to_asset_code,
        from_amount: rule.from_amount,
        to_amount: rule.to_amount,
        conversion_rate: `${rule.from_amount}:${rule.to_amount}`, // 例如 "1:20"
        effective_at: rule.effective_at,
        enabled: rule.is_enabled,

        // 数量限制信息（新增）
        limits: {
          min_from_amount: rule.min_from_amount || 1, // 默认最小1
          max_from_amount: rule.max_from_amount // null 表示无上限
        },

        // 手续费信息（新增）
        fee: {
          fee_rate: parseFloat(rule.fee_rate) || 0, // 费率（小数，如 0.05 = 5%）
          fee_min_amount: rule.fee_min_amount || 0, // 最低手续费
          fee_asset_code: rule.fee_asset_code || rule.to_asset_code // 手续费资产类型（默认与目标资产相同）
        },

        // 展示信息（新增）
        display: {
          title: rule.title || autoDescription, // 规则标题（用于前端显示）
          description: rule.description || autoDescription, // 详细描述
          display_icon: rule.display_icon || null, // 图标 URL
          risk_level: rule.risk_level || 'low' // 风险等级：low/medium/high
        }
      }
    })

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
