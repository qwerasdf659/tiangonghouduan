/**
 * 餐厅积分抽奖系统 V4.5 - 材料系统API（用户侧）
 * 处理材料余额查询、材料转换、钻石分解等功能
 *
 * 功能说明：
 * - 查询用户材料余额
 * - 按规则转换材料（合成/分解）
 * - 碎红水晶分解为钻石（1:20比例）
 * - 查询材料转换规则
 * - 查询材料流水
 *
 * 业务规则（强制）：
 * - ✅ 所有写操作必须携带幂等键（business_id 或 Header Idempotency-Key）
 * - ✅ 材料转换必须符合转换规则（is_enabled=1 && effective_at<=now）
 * - ✅ 只有碎红水晶（red_shard）可以分解为钻石
 * - ✅ 转换比例：1碎红水晶 = 20钻石
 * - ❌ 禁止越级直转钻石（必须逐级分解到碎红水晶再分解）
 *
 * 创建时间：2025年12月15日
 * 参考文档：/docs/材料系统（碎片-水晶）方案.md
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('MaterialAPI')

/**
 * 获取用户材料余额
 * GET /api/v4/material/balances
 *
 * @description 查询当前用户的所有材料余额（包含display_name）
 * @returns {Array} balances - 材料余额列表
 * @returns {string} balances[].asset_code - 资产代码（如：red_shard、red_crystal）
 * @returns {string} balances[].display_name - 展示名称（如：碎红水晶、完整红水晶）
 * @returns {number} balances[].balance - 余额
 * @returns {number} balances[].visible_value_points - 可见价值（积分口径）
 */
router.get('/balances', authenticateToken, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const user_id = req.user.user_id

    logger.info('查询用户材料余额', { user_id })

    // 调用Service获取余额
    const balances = await MaterialService.getUserBalances(user_id)

    logger.info('查询材料余额成功', {
      user_id,
      count: balances.length
    })

    return res.apiSuccess(
      { balances },
      '查询材料余额成功'
    )
  } catch (error) {
    logger.error('查询材料余额失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询材料余额失败')
  }
})

/**
 * 查询材料转换规则
 * GET /api/v4/material/conversion-rules
 *
 * @description 查询当前启用且生效的材料转换规则列表
 * @query {string} from_asset_code - 可选，源资产代码过滤
 * @query {string} to_asset_code - 可选，目标资产代码过滤
 * @returns {Array} rules - 转换规则列表
 */
router.get('/conversion-rules', authenticateToken, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const { from_asset_code, to_asset_code } = req.query

    logger.info('查询材料转换规则', {
      user_id: req.user.user_id,
      from_asset_code,
      to_asset_code
    })

    // 调用Service获取规则
    const rules = await MaterialService.getConversionRules({
      from_asset_code,
      to_asset_code,
      is_enabled: true,
      include_expired: false
    })

    logger.info('查询转换规则成功', {
      user_id: req.user.user_id,
      count: rules.length
    })

    return res.apiSuccess(
      { rules },
      '查询转换规则成功'
    )
  } catch (error) {
    logger.error('查询转换规则失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询转换规则失败')
  }
})

/**
 * 按规则转换材料
 * POST /api/v4/material/convert
 *
 * @description 按照转换规则将一种材料转换为另一种材料（合成/分解/逐级分解）
 * @body {number} rule_id - 必填，转换规则ID
 * @body {number} times - 可选，转换次数（默认1，最小1，最大1000）
 * @body {string} business_id - 必填，幂等键（唯一标识）
 * @header {string} Idempotency-Key - 可选，幂等键（与business_id二选一）
 * @returns {object} result - 转换结果
 * @returns {object} result.from - 源资产变动
 * @returns {object} result.to - 目标资产变动
 */
router.post('/convert', authenticateToken, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const user_id = req.user.user_id
    const { rule_id, times = 1 } = req.body

    // 幂等键：Body business_id 或 Header Idempotency-Key 二选一
    const business_id = req.body.business_id || req.headers['idempotency-key']

    // 参数验证
    if (!rule_id) {
      return res.apiError(
        'rule_id为必填参数',
        'BAD_REQUEST',
        null,
        400
      )
    }

    if (!business_id) {
      return res.apiError(
        '必须提供business_id（Body参数）或Idempotency-Key（Header）',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // times参数验证
    const finalTimes = Math.max(Math.min(parseInt(times) || 1, 1000), 1)

    logger.info('用户发起材料转换', {
      user_id,
      rule_id,
      times: finalTimes,
      business_id
    })

    // 调用Service执行转换
    const result = await MaterialService.convertByRule(
      user_id,
      rule_id,
      finalTimes,
      {
        business_id,
        business_type: 'user_convert',
        title: `用户材料转换（规则${rule_id}×${finalTimes}）`
      }
    )

    logger.info('材料转换成功', {
      user_id,
      rule_id,
      times: finalTimes,
      from: result.from,
      to: result.to
    })

    return res.apiSuccess(
      result,
      '材料转换成功'
    )
  } catch (error) {
    logger.error('材料转换失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      rule_id: req.body?.rule_id
    })
    return handleServiceError(error, res, '材料转换失败')
  }
})

/**
 * 碎红水晶分解为钻石
 * POST /api/v4/material/convert-to-diamond
 *
 * @description 将碎红水晶（red_shard）分解为钻石（DIAMOND），转换比例：1碎红水晶 = 20钻石
 * @body {number} red_shard_amount - 必填，碎红水晶数量（最小1，最大10000）
 * @body {string} business_id - 必填，幂等键（唯一标识）
 * @header {string} Idempotency-Key - 可选，幂等键（与business_id二选一）
 * @returns {object} result - 转换结果
 * @returns {object} result.material - 材料侧变动（red_shard扣减）
 * @returns {object} result.diamond - 钻石侧变动（diamond入账）
 */
router.post('/convert-to-diamond', authenticateToken, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const user_id = req.user.user_id
    const { red_shard_amount } = req.body

    // 幂等键：Body business_id 或 Header Idempotency-Key 二选一
    const business_id = req.body.business_id || req.headers['idempotency-key']

    // 参数验证
    if (!red_shard_amount) {
      return res.apiError(
        'red_shard_amount为必填参数',
        'BAD_REQUEST',
        null,
        400
      )
    }

    if (!business_id) {
      return res.apiError(
        '必须提供business_id（Body参数）或Idempotency-Key（Header）',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 数量参数验证
    const amount = parseInt(red_shard_amount)
    if (isNaN(amount) || amount < 1 || amount > 10000) {
      return res.apiError(
        'red_shard_amount必须是1-10000之间的正整数',
        'BAD_REQUEST',
        null,
        400
      )
    }

    logger.info('用户发起碎红水晶分解为钻石', {
      user_id,
      red_shard_amount: amount,
      business_id
    })

    // 调用Service执行转换
    const result = await MaterialService.convertToDiamond(
      user_id,
      amount,
      {
        business_id,
        business_type: 'material_to_diamond',
        title: `碎红水晶分解为钻石（${amount}碎红→${amount * 20}钻石）`
      }
    )

    logger.info('碎红水晶分解为钻石成功', {
      user_id,
      red_shard_amount: amount,
      diamond_amount: amount * 20,
      material_balance_after: result.material.balance_after,
      diamond_balance_after: result.diamond.balance_after
    })

    return res.apiSuccess(
      result,
      '碎红水晶分解为钻石成功'
    )
  } catch (error) {
    logger.error('碎红水晶分解为钻石失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      red_shard_amount: req.body?.red_shard_amount
    })
    return handleServiceError(error, res, '碎红水晶分解为钻石失败')
  }
})

/**
 * 查询材料流水
 * GET /api/v4/material/transactions
 *
 * @description 查询当前用户的材料流水记录
 * @query {string} asset_code - 可选，资产代码过滤
 * @query {string} tx_type - 可选，交易类型过滤（earn/consume/convert_in/convert_out）
 * @query {string} business_type - 可选，业务类型过滤
 * @query {string} start_date - 可选，开始日期（格式：YYYY-MM-DD）
 * @query {string} end_date - 可选，结束日期（格式：YYYY-MM-DD）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 * @returns {Array} transactions - 材料流水列表
 * @returns {object} pagination - 分页信息
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const MaterialService = req.app.locals.services.getService('material')
    const user_id = req.user.user_id

    const {
      asset_code,
      tx_type,
      business_type,
      start_date,
      end_date,
      page = 1,
      page_size = 20
    } = req.query

    // 参数验证
    const finalPage = Math.max(parseInt(page) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 100)

    // tx_type白名单验证
    if (tx_type) {
      const validTxTypes = ['earn', 'consume', 'convert_in', 'convert_out', 'admin_adjust']
      if (!validTxTypes.includes(tx_type)) {
        return res.apiError(
          `无效的tx_type参数，允许值：${validTxTypes.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
    }

    logger.info('查询材料流水', {
      user_id,
      asset_code,
      tx_type,
      business_type,
      page: finalPage,
      page_size: finalPageSize
    })

    // 调用Service查询流水
    const result = await MaterialService.getUserTransactions(user_id, {
      asset_code,
      tx_type,
      business_type,
      start_date,
      end_date,
      page: finalPage,
      page_size: finalPageSize
    })

    logger.info('查询材料流水成功', {
      user_id,
      total: result.pagination.total,
      returned: result.transactions.length
    })

    return res.apiSuccess(
      result,
      '查询材料流水成功'
    )
  } catch (error) {
    logger.error('查询材料流水失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询材料流水失败')
  }
})

module.exports = router
