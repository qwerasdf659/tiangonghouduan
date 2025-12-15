/**
 * 餐厅积分抽奖系统 V4.5 - 钻石系统管理API（管理员侧）
 * 处理钻石账户管理、余额调整、流水查询等功能
 *
 * 功能说明：
 * - 查询用户钻石余额
 * - 管理员调整用户钻石余额
 * - 查询钻石流水
 *
 * 业务规则（强制）：
 * - ✅ 管理员调整余额必须携带幂等键（business_id）
 * - ✅ 所有写操作必须记录操作日志
 * - ✅ 钻石作为虚拟价值货币，统一用于交易市场结算
 * - ❌ 禁止删除钻石流水（审计合规要求）
 *
 * 创建时间：2025年12月15日
 * 参考文档：/docs/材料系统（碎片-水晶）方案.md 第12节
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const Logger = require('../../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('DiamondAdminAPI')

/**
 * 查询用户钻石余额
 * GET /api/v4/admin/diamond/users/:user_id/balance
 *
 * @description 管理员查询指定用户的钻石余额
 * @param {number} user_id - 用户ID
 * @returns {object} account - 钻石账户信息
 * @returns {number} account.account_id - 账户ID
 * @returns {number} account.user_id - 用户ID
 * @returns {number} account.balance - 钻石余额
 * @returns {string} account.created_at - 创建时间
 * @returns {string} account.updated_at - 更新时间
 */
router.get('/users/:user_id/balance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DiamondService = req.app.locals.services.getService('diamond')
    const admin_id = req.user.user_id
    const { user_id } = req.params

    logger.info('管理员查询用户钻石余额', {
      admin_id,
      target_user_id: parseInt(user_id)
    })

    // 调用Service获取账户信息
    const account = await DiamondService.getUserAccount(parseInt(user_id))

    logger.info('查询用户钻石余额成功', {
      admin_id,
      target_user_id: parseInt(user_id),
      balance: account?.balance || 0
    })

    return res.apiSuccess(
      { account },
      '查询用户钻石余额成功'
    )
  } catch (error) {
    logger.error('查询用户钻石余额失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      target_user_id: req.params?.user_id
    })
    return handleServiceError(error, res, '查询用户钻石余额失败')
  }
})

/**
 * 管理员调整用户钻石余额
 * POST /api/v4/admin/diamond/users/:user_id/adjust
 *
 * @description 管理员人工调整用户的钻石余额（用于运营补偿、活动发放、纠错等）
 * @param {number} user_id - 用户ID
 * @body {number} delta - 必填，变动金额（可正可负，正数=增加，负数=减少）
 * @body {string} business_id - 必填，幂等键（唯一标识，格式建议：admin_adjust_diamond_{admin_id}_{timestamp}）
 * @body {string} title - 必填，调整原因（用于前端展示和审计）
 * @body {object} meta - 可选，元数据（如：工单号、活动ID、备注等）
 *
 * @returns {object} result - 调整结果
 * @returns {number} result.tx_id - 流水ID
 * @returns {number} result.balance_before - 调整前余额
 * @returns {number} result.balance_after - 调整后余额
 * @returns {number} result.amount - 变动金额（绝对值）
 * @returns {string} result.tx_type - 交易类型（earn/consume/admin_adjust）
 */
router.post('/users/:user_id/adjust', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DiamondService = req.app.locals.services.getService('diamond')
    const admin_id = req.user.user_id
    const { user_id } = req.params
    const { delta, business_id, title, meta } = req.body

    // 参数验证
    if (delta === undefined || !business_id || !title) {
      return res.apiError(
        '缺少必填参数：delta、business_id、title',
        'BAD_REQUEST',
        null,
        400
      )
    }

    // delta参数验证
    const deltaAmount = parseInt(delta)
    if (isNaN(deltaAmount) || deltaAmount === 0) {
      return res.apiError(
        'delta必须是非零整数',
        'BAD_REQUEST',
        null,
        400
      )
    }

    logger.info('管理员调整用户钻石余额', {
      admin_id,
      target_user_id: parseInt(user_id),
      delta: deltaAmount,
      business_id,
      title
    })

    // 调用Service执行调整
    const result = await DiamondService.adminAdjust(
      parseInt(user_id),
      deltaAmount,
      {
        business_id,
        title,
        meta: meta || { admin_id, timestamp: new Date() }
      }
    )

    logger.info('管理员调整用户钻石余额成功', {
      admin_id,
      target_user_id: parseInt(user_id),
      delta: deltaAmount,
      balance_before: result.balance_before,
      balance_after: result.balance_after
    })

    return res.apiSuccess(
      result,
      '调整用户钻石余额成功'
    )
  } catch (error) {
    logger.error('管理员调整用户钻石余额失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      target_user_id: req.params?.user_id
    })
    return handleServiceError(error, res, '调整用户钻石余额失败')
  }
})

/**
 * 查询钻石流水（管理员）
 * GET /api/v4/admin/diamond/transactions
 *
 * @description 管理员查询钻石流水（支持按用户、业务类型等多维度筛选）
 * @query {number} user_id - 可选，用户ID过滤
 * @query {string} tx_type - 可选，交易类型过滤（earn/consume/admin_adjust）
 * @query {string} business_type - 可选，业务类型过滤（material_convert/admin_adjust等）
 * @query {string} business_id - 可选，业务ID过滤（精确匹配）
 * @query {string} start_date - 可选，开始日期（格式：YYYY-MM-DD）
 * @query {string} end_date - 可选，结束日期（格式：YYYY-MM-DD）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 * @returns {Array} transactions - 钻石流水列表
 * @returns {object} pagination - 分页信息
 */
router.get('/transactions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const DiamondService = req.app.locals.services.getService('diamond')
    const admin_id = req.user.user_id

    const {
      user_id,
      tx_type,
      business_type,
      business_id,
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
      const validTxTypes = ['earn', 'consume', 'admin_adjust']
      if (!validTxTypes.includes(tx_type)) {
        return res.apiError(
          `无效的tx_type参数，允许值：${validTxTypes.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
    }

    logger.info('管理员查询钻石流水', {
      admin_id,
      filters: {
        user_id,
        tx_type,
        business_type,
        business_id
      },
      page: finalPage,
      page_size: finalPageSize
    })

    // 调用Service查询流水
    const result = await DiamondService.getTransactions({
      user_id: user_id ? parseInt(user_id) : undefined,
      tx_type,
      business_type,
      business_id,
      start_date,
      end_date,
      page: finalPage,
      page_size: finalPageSize
    })

    logger.info('管理员查询钻石流水成功', {
      admin_id,
      total: result.pagination.total,
      returned: result.transactions.length
    })

    return res.apiSuccess(
      result,
      '查询钻石流水成功'
    )
  } catch (error) {
    logger.error('管理员查询钻石流水失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })
    return handleServiceError(error, res, '查询钻石流水失败')
  }
})

module.exports = router
