/**
 * 管理后台 - 平台星石管理模块
 *
 * 业务范围：
 * - 查询所有系统账户的星石余额概览
 * - 运营手动销毁星石（可选来源账户 → SYSTEM_BURN 不可逆转账）
 * - 销毁历史记录查询
 *
 * 系统账户说明：
 * - SYSTEM_PLATFORM_FEE：平台手续费收入账户（可销毁）
 * - SYSTEM_MINT：铸币账户（负数表示已铸造总量，不可直接销毁）
 * - SYSTEM_BURN：黑洞账户（销毁目标，只增不减）
 * - SYSTEM_ESCROW：交易托管账户（用户交易中冻结，不可销毁）
 * - SYSTEM_RESERVE：储备金账户（可销毁）
 * - SYSTEM_CAMPAIGN_POOL：活动奖池账户（可销毁）
 * - SYSTEM_EXCHANGE：兑换中转账户（可销毁）
 *
 * @module routes/v4/console/config/platform-star-stone
 */

const express = require('express')
const router = express.Router()
const { AssetCode } = require('../../../../constants/AssetCode')
const { adminAuthMiddleware, asyncHandler } = require('../shared/middleware')
const logger = require('../../../../utils/logger').logger

/**
 * 允许执行销毁操作的系统账户白名单
 * SYSTEM_MINT/SYSTEM_BURN/SYSTEM_ESCROW 不允许直接销毁（业务安全限制）
 */
const BURNABLE_ACCOUNTS = [
  'SYSTEM_PLATFORM_FEE',
  'SYSTEM_RESERVE',
  'SYSTEM_CAMPAIGN_POOL',
  'SYSTEM_EXCHANGE'
]

/**
 * 系统账户中文说明映射
 */
const SYSTEM_ACCOUNT_LABELS = {
  SYSTEM_PLATFORM_FEE: {
    label: '平台手续费',
    description: '交易手续费收入，可销毁',
    burnable: true
  },
  SYSTEM_MINT: {
    label: '铸币账户',
    description: '星石铸造源头，负数表示已铸造总量',
    burnable: false
  },
  SYSTEM_BURN: { label: '黑洞账户', description: '星石销毁目标，只增不减', burnable: false },
  SYSTEM_ESCROW: {
    label: '交易托管',
    description: '用户交易中冻结的星石，不可销毁',
    burnable: false
  },
  SYSTEM_RESERVE: { label: '储备金', description: '平台星石储备，可销毁', burnable: true },
  SYSTEM_CAMPAIGN_POOL: {
    label: '活动奖池',
    description: '抽奖活动星石奖池，可销毁',
    burnable: true
  },
  SYSTEM_EXCHANGE: { label: '兑换中转', description: '材料兑换中转，可销毁', burnable: true }
}

/**
 * GET /api/v4/console/platform-star-stone/balance
 * 查询所有系统账户的星石余额概览
 */
router.get(
  '/balance',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { sequelize } = require('../../../../models')

    const [systemAccounts] = await sequelize.query(`
      SELECT a.system_code,
             COALESCE(aab.available_amount, 0) AS star_stone_balance,
             COALESCE(aab.frozen_amount, 0) AS frozen_amount
      FROM accounts a
      LEFT JOIN account_asset_balances aab
        ON a.account_id = aab.account_id AND aab.asset_code = 'star_stone'
      WHERE a.account_type = 'system'
      ORDER BY a.account_id
    `)

    const accounts = systemAccounts.map(acc => {
      const meta = SYSTEM_ACCOUNT_LABELS[acc.system_code] || {
        label: acc.system_code,
        description: '',
        burnable: false
      }
      return {
        system_code: acc.system_code,
        label: meta.label,
        description: meta.description,
        star_stone_balance: Number(acc.star_stone_balance),
        frozen_amount: Number(acc.frozen_amount),
        burnable: meta.burnable
      }
    })

    const platformFee = accounts.find(a => a.system_code === 'SYSTEM_PLATFORM_FEE')
    const burnAccount = accounts.find(a => a.system_code === 'SYSTEM_BURN')

    return res.apiSuccess(
      {
        platform_fee: {
          star_stone_balance: platformFee?.star_stone_balance || 0,
          frozen_amount: platformFee?.frozen_amount || 0
        },
        burn: {
          total_burned: Math.abs(burnAccount?.star_stone_balance || 0)
        },
        system_accounts: accounts,
        burnable_accounts: BURNABLE_ACCOUNTS
      },
      '平台星石余额查询成功'
    )
  })
)

/**
 * GET /api/v4/console/platform-star-stone/burn-history
 * 查询星石销毁历史记录
 *
 * @query {number} page - 页码，默认1
 * @query {number} page_size - 每页条数，默认20
 */
router.get(
  '/burn-history',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { sequelize } = require('../../../../models')
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20))
    const offset = (page - 1) * pageSize

    const [records] = await sequelize.query(
      `
      SELECT at.asset_transaction_id, at.delta_amount, at.balance_after,
             at.business_type, at.meta, at.created_at,
             a.system_code
      FROM asset_transactions at
      JOIN accounts a ON at.account_id = a.account_id
      WHERE at.business_type = 'platform_star_stone_burn'
        AND at.asset_code = 'star_stone'
      ORDER BY at.created_at DESC
      LIMIT :limit OFFSET :offset
    `,
      { replacements: { limit: pageSize, offset } }
    )

    const [[{ total }]] = await sequelize.query(`
      SELECT COUNT(*) AS total
      FROM asset_transactions
      WHERE business_type = 'platform_star_stone_burn' AND asset_code = 'star_stone'
    `)

    const items = records.map(r => {
      let meta = {}
      try {
        meta = typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta || {}
      } catch {
        /* ignore */
      }
      return {
        transaction_id: r.asset_transaction_id,
        source_account: r.system_code,
        source_label: SYSTEM_ACCOUNT_LABELS[r.system_code]?.label || r.system_code,
        amount: Math.abs(Number(r.delta_amount)),
        balance_after: Number(r.balance_after),
        reason: meta.reason || '',
        operator_id: meta.operator_id || null,
        created_at: r.created_at
      }
    })

    return res.apiSuccess(
      {
        items,
        pagination: { page, page_size: pageSize, total: Number(total) }
      },
      '销毁历史查询成功'
    )
  })
)

/**
 * POST /api/v4/console/platform-star-stone/burn
 * 销毁指定系统账户的星石（不可逆转账到黑洞账户）
 *
 * @body {number} amount - 销毁数量（必填，> 0）
 * @body {string} reason - 销毁原因（可选）
 * @body {string} source_account - 来源系统账户代码（可选，默认 SYSTEM_PLATFORM_FEE）
 */
router.post(
  '/burn',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { amount, reason, source_account } = req.body
    const operatorId = req.user?.user_id
    const sourceCode = source_account || 'SYSTEM_PLATFORM_FEE'

    if (!amount || amount <= 0) {
      return res.apiError('销毁数量必须大于 0', 'INVALID_AMOUNT', null, 400)
    }

    if (!BURNABLE_ACCOUNTS.includes(sourceCode)) {
      return res.apiError(
        `不允许从 ${sourceCode} 账户销毁星石，允许的账户: ${BURNABLE_ACCOUNTS.join(', ')}`,
        'INVALID_SOURCE_ACCOUNT',
        null,
        400
      )
    }

    const BalanceService = req.app.locals.services.getService('asset_balance')
    const TransactionManager = require('../../../../utils/TransactionManager')

    const result = await TransactionManager.execute(async transaction => {
      const burnAccount = await BalanceService.getOrCreateAccount(
        { system_code: 'SYSTEM_BURN' },
        { transaction }
      )

      const balanceBefore = await BalanceService.getBalance(
        { system_code: sourceCode, asset_code: AssetCode.STAR_STONE },
        { transaction }
      )

      if ((balanceBefore?.available_amount || 0) < amount) {
        throw new Error(
          `${SYSTEM_ACCOUNT_LABELS[sourceCode]?.label || sourceCode} 余额不足：` +
            `可用 ${balanceBefore?.available_amount || 0}，请求销毁 ${amount}`
        )
      }

      const burnResult = await BalanceService.changeBalance(
        {
          system_code: sourceCode,
          asset_code: AssetCode.STAR_STONE,
          delta_amount: -amount,
          business_type: 'platform_star_stone_burn',
          idempotency_key: `burn:${sourceCode}:${Date.now()}:${operatorId}`,
          counterpart_account_id: burnAccount.account_id,
          meta: {
            operator_id: operatorId,
            source_account: sourceCode,
            reason: reason || '运营手动销毁',
            balance_before: balanceBefore?.available_amount || 0,
            description: `运营手动销毁 ${amount} 星石（来源: ${SYSTEM_ACCOUNT_LABELS[sourceCode]?.label || sourceCode}）`
          }
        },
        { transaction }
      )

      logger.info('[平台星石] 销毁操作完成', {
        operator_id: operatorId,
        source_account: sourceCode,
        amount,
        reason,
        balance_before: balanceBefore?.available_amount || 0,
        balance_after: (balanceBefore?.available_amount || 0) - amount
      })

      return {
        burned_amount: amount,
        source_account: sourceCode,
        source_label: SYSTEM_ACCOUNT_LABELS[sourceCode]?.label || sourceCode,
        balance_before: balanceBefore?.available_amount || 0,
        balance_after: (balanceBefore?.available_amount || 0) - amount,
        transaction_id: burnResult.transaction_record?.asset_transaction_id
      }
    })

    return res.apiSuccess(result, '星石销毁成功（不可撤回）')
  })
)

module.exports = router
