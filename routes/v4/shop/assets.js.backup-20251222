/**
 * 餐厅积分抽奖系统 V4.5.0 - 资产转换API
 * 处理材料资产的显式转换功能（如碎红水晶分解为钻石）
 *
 * 功能说明：
 * - 材料转换（碎红水晶 → 钻石）
 * - 支持强幂等性控制（防止重复转换）
 * - 完整的事务保护（扣减+入账原子操作）
 * - 转换规则验证（数量限制、启用状态）
 *
 * 业务规则（强制）：
 * - ✅ 本期只支持：red_shard → DIAMOND（1:20比例）
 * - ✅ 必须传入幂等键（business_id或Idempotency-Key）
 * - ✅ 同一幂等键重复请求返回原结果（is_duplicate=true）
 * - ✅ 材料余额不足直接失败，不允许负余额
 * - ❌ 不在兑换流程中隐式触发转换（必须显式调用）
 *
 * 创建时间：2025年12月15日
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')

const logger = require('../../../utils/logger').logger

/**
 * 材料转换接口（显式转换）
 * POST /api/v4/assets/convert
 *
 * 业务场景：
 * - 用户主动将碎红水晶分解为钻石
 * - 支持强幂等性，防止重复转换
 * - 本期只支持red_shard → DIAMOND转换
 *
 * 请求参数：
 * @body {string} from_asset_code - 源材料资产代码（当前只支持"red_shard"）
 * @body {string} to_asset_code - 目标资产代码（当前只支持"DIAMOND"）
 * @body {number} from_amount - 转换数量（源材料数量，必须大于0）
 * @body {string} business_id - 业务唯一ID（幂等键，必填）
 * @header {string} Idempotency-Key - 幂等键（与business_id二选一）
 *
 * 响应数据：
 * {
 *   "success": true,
 *   "data": {
 *     "from_asset_code": "red_shard",
 *     "to_asset_code": "DIAMOND",
 *     "from_amount": 50,
 *     "to_amount": 1000,
 *     "from_tx_id": 123,
 *     "to_tx_id": 456,
 *     "from_balance": 100,
 *     "to_balance": 5000,
 *     "is_duplicate": false
 *   },
 *   "message": "材料转换成功"
 * }
 *
 * 错误码：
 * - 400: 缺少必填参数、转换规则不支持、数量不符合限制
 * - 403: 余额不足
 * - 409: 幂等键冲突（同幂等键但参数不一致，未来扩展）
 * - 500: 服务器内部错误
 *
 * 幂等性说明：
 * - 客户端必须传入business_id或Idempotency-Key（二选一）
 * - 同一幂等键的请求只会执行一次转换
 * - 重复请求返回原结果，并标记is_duplicate=true
 * - 不会重复扣减材料或重复增加钻石
 */
router.post('/convert', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 AssetConversionService（符合TR-005规范）
    const AssetConversionService = req.app.locals.services.getService('assetConversion')

    const { from_asset_code, to_asset_code, from_amount } = req.body

    // 获取幂等键（Body business_id 或 Header Idempotency-Key 二选一）
    let business_id = req.body.business_id
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['Idempotency-Key']

    if (!business_id && idempotencyKey) {
      business_id = idempotencyKey
    }

    const user_id = req.user.user_id

    logger.info('收到材料转换请求', {
      user_id,
      from_asset_code,
      to_asset_code,
      from_amount,
      business_id: business_id ? '已提供' : '未提供'
    })

    // 🔥 参数验证（Parameter Validation）

    // 1. 必填参数验证
    if (!from_asset_code) {
      return res.apiError(
        '缺少必填参数：from_asset_code（源材料资产代码）',
        'BAD_REQUEST',
        null,
        400
      )
    }

    if (!to_asset_code) {
      return res.apiError('缺少必填参数：to_asset_code（目标资产代码）', 'BAD_REQUEST', null, 400)
    }

    if (!from_amount) {
      return res.apiError('缺少必填参数：from_amount（转换数量）', 'BAD_REQUEST', null, 400)
    }

    // 2. 幂等键验证（强制要求）
    if (!business_id) {
      return res.apiError(
        '缺少幂等键：请在Body中提供business_id，或在Header中提供Idempotency-Key',
        'BAD_REQUEST',
        {
          hint: '幂等键是必填参数，用于防止重复转换',
          example_business_id: 'convert_to_diamond_1734220800000',
          example_header: 'Idempotency-Key: convert_to_diamond_1734220800000'
        },
        400
      )
    }

    // 3. 转换数量验证
    const parsedAmount = parseInt(from_amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.apiError(
        '转换数量必须是大于0的正整数',
        'BAD_REQUEST',
        { from_amount, parsed_amount: parsedAmount },
        400
      )
    }

    // 4. 转换规则验证（本期只支持red_shard → DIAMOND）
    if (from_asset_code !== 'red_shard') {
      return res.apiError(
        '不支持的源材料类型：当前只支持"red_shard"（碎红水晶）',
        'BAD_REQUEST',
        {
          from_asset_code,
          supported_types: ['red_shard'],
          hint: '如需支持其他材料转换，请联系管理员'
        },
        400
      )
    }

    if (to_asset_code !== 'DIAMOND') {
      return res.apiError(
        '不支持的目标资产类型：当前只支持"DIAMOND"（钻石）',
        'BAD_REQUEST',
        {
          to_asset_code,
          supported_types: ['DIAMOND'],
          hint: '如需支持其他资产转换，请联系管理员'
        },
        400
      )
    }

    // 🔥 调用服务层执行转换（Call Service Layer）
    const result = await AssetConversionService.convertMaterial(
      user_id,
      from_asset_code,
      to_asset_code,
      parsedAmount,
      {
        business_id,
        title: '碎红水晶分解为钻石',
        meta: {
          source: 'api',
          endpoint: '/api/v4/assets/convert',
          request_time: new Date().toISOString()
        }
      }
    )

    // 判断是否为重复请求
    const isDuplicate = result.is_duplicate === true

    if (isDuplicate) {
      logger.info('材料转换（幂等返回）', {
        user_id,
        from_asset_code,
        to_asset_code,
        from_amount: parsedAmount,
        to_amount: result.to_amount,
        business_id,
        is_duplicate: true
      })
    } else {
      logger.info('材料转换成功', {
        user_id,
        from_asset_code,
        to_asset_code,
        from_amount: parsedAmount,
        to_amount: result.to_amount,
        from_tx_id: result.from_tx_id,
        to_tx_id: result.to_tx_id,
        business_id,
        is_duplicate: false
      })
    }

    // 返回成功响应
    return res.apiSuccess(
      {
        from_asset_code: result.from_asset_code,
        to_asset_code: result.to_asset_code,
        from_amount: result.from_amount,
        to_amount: result.to_amount,
        from_tx_id: result.from_tx_id,
        to_tx_id: result.to_tx_id,
        from_balance: result.from_balance,
        to_balance: result.to_balance,
        is_duplicate: isDuplicate,
        conversion_rate: 20, // 转换比例：1碎红水晶 = 20钻石
        conversion_info: {
          rule_description: '碎红水晶分解为钻石',
          rate_description: '1碎红水晶 = 20钻石',
          display_icon: '💎'
        }
      },
      isDuplicate ? '材料转换记录已存在（幂等返回）' : '材料转换成功'
    )
  } catch (error) {
    // 错误日志记录
    logger.error('材料转换失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      from_asset_code: req.body.from_asset_code,
      to_asset_code: req.body.to_asset_code,
      from_amount: req.body.from_amount,
      business_id: req.body.business_id || req.headers['idempotency-key']
    })

    // 余额不足错误（特殊处理）
    if (error.message && error.message.includes('余额不足')) {
      return res.apiError(
        '材料余额不足，无法完成转换',
        'INSUFFICIENT_BALANCE',
        {
          error: error.message,
          hint: '请先获取足够的碎红水晶再进行转换'
        },
        403
      )
    }

    // 转换规则错误（特殊处理）
    if (
      error.message &&
      (error.message.includes('不支持的材料转换') || error.message.includes('转换规则'))
    ) {
      return res.apiError(
        error.message,
        'UNSUPPORTED_CONVERSION',
        {
          hint: '当前只支持碎红水晶转钻石，其他材料转换规则暂未开放'
        },
        400
      )
    }

    // 其他错误（通用处理）
    return handleServiceError(error, res, '材料转换失败')
  }
})

/**
 * 获取当前用户指定资产余额（统一账本）
 * GET /api/v4/assets/balance?asset_code=DIAMOND
 *
 * 说明：
 * - Phase 4: 余额真相来自 account_asset_balances（available_amount + frozen_amount）
 * - asset_code 可省略，默认 DIAMOND
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const asset_code = (req.query.asset_code || 'DIAMOND').toString()

    // ✅ 通过 ServiceManager 获取 AssetService（符合TR-005规范）
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
 * 获取用户材料余额接口
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
 *         "balance": 100,
 *         "display_name": "碎红水晶",
 *         "group_code": "material",
 *         "tier": 1
 *       }
 *     ]
 *   },
 *   "message": "获取材料余额成功"
 * }
 */
router.get('/balances', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    // ✅ 通过 ServiceManager 获取 AssetService（符合TR-005规范）
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

/**
 * 获取当前用户资产流水（统一账本）
 * GET /api/v4/assets/transactions?asset_code=DIAMOND&page=1&page_size=20
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const asset_code = req.query.asset_code ? req.query.asset_code.toString() : undefined
    const business_type = req.query.business_type ? req.query.business_type.toString() : undefined
    const page = req.query.page ? parseInt(req.query.page) : 1
    const page_size = req.query.page_size ? parseInt(req.query.page_size) : 20

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
 *         "from_asset_code": "red_shard",
 *         "to_asset_code": "DIAMOND",
 *         "conversion_rate": 20,
 *         "description": "碎红水晶分解为钻石",
 *         "min_amount": 1,
 *         "max_amount": null,
 *         "enabled": true
 *       }
 *     ]
 *   },
 *   "message": "获取转换规则成功"
 * }
 */
router.get('/conversion-rules', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    logger.info('获取材料转换规则（从数据库）', { user_id })

    // 🔴 项目规范：路由不直连 models，统一通过 ServiceManager 获取服务
    const AssetConversionService = req.app.locals.services.getService('assetConversion')
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
      conversion_rate: `${rule.from_amount}:${rule.to_amount}`, // 例如 "100:1"
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
