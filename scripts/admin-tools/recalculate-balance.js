/**
 * 餐厅积分抽奖系统 V4.2 - 资产余额重算工具
 *
 * 功能：从 asset_transactions 流水表重新计算账户资产余额
 *
 * 使用场景：
 * 1. 修复因事务错误导致的余额不一致
 * 2. 迁移后的数据对账修复
 * 3. 人工介入的数据修正
 *
 * 使用方法：
 * ```bash
 * # 重算单个账户的单个资产
 * node scripts/admin-tools/recalculate-balance.js <account_id> <asset_code>
 *
 * # 重算单个账户的所有资产
 * node scripts/admin-tools/recalculate-balance.js <account_id> all
 *
 * # 重算所有账户的所有资产
 * node scripts/admin-tools/recalculate-balance.js all all
 * ```
 *
 * 示例：
 * ```bash
 * # 重算账户6的红色碎片余额
 * node scripts/admin-tools/recalculate-balance.js 6 red_shard
 *
 * # 重算账户6的所有资产
 * node scripts/admin-tools/recalculate-balance.js 6 all
 *
 * # 重算所有账户的所有资产
 * node scripts/admin-tools/recalculate-balance.js all all
 * ```
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { sequelize } = require('../../config/database')
const { AccountAssetBalance, AssetTransaction } = require('../../models')
const Logger = require('../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('RecalculateBalance')

/**
 * 重算单个账户单个资产的余额
 */
async function recalculateBalance(accountId, assetCode) {
  const transaction = await sequelize.transaction()

  try {
    logger.info('开始重算余额', {
      account_id: accountId,
      asset_code: assetCode
    })

    // 1. 查询所有流水记录
    const transactions = await AssetTransaction.findAll({
      where: {
        account_id: accountId,
        asset_code: assetCode
      },
      order: [['created_at', 'ASC']],
      transaction
    })

    // 2. 计算正确余额
    const correctBalance = transactions.reduce((sum, tx) => {
      return sum + parseFloat(tx.delta_amount)
    }, 0)

    logger.info('流水计算结果', {
      account_id: accountId,
      asset_code: assetCode,
      transaction_count: transactions.length,
      calculated_balance: correctBalance
    })

    // 3. 查询当前余额记录
    const balanceRecord = await AccountAssetBalance.findOne({
      where: {
        account_id: accountId,
        asset_code: assetCode
      },
      transaction
    })

    if (!balanceRecord) {
      logger.warn('余额记录不存在，创建新记录', {
        account_id: accountId,
        asset_code: assetCode
      })

      // 创建新的余额记录
      await AccountAssetBalance.create(
        {
          account_id: accountId,
          asset_code: assetCode,
          available_amount: correctBalance,
          frozen_amount: 0
        },
        { transaction }
      )
    } else {
      const oldBalance = parseFloat(balanceRecord.available_amount)
      const difference = Math.abs(correctBalance - oldBalance)

      logger.info('余额对比', {
        account_id: accountId,
        asset_code: assetCode,
        old_balance: oldBalance,
        correct_balance: correctBalance,
        difference
      })

      // 更新余额
      await balanceRecord.update(
        {
          available_amount: correctBalance
        },
        { transaction }
      )
    }

    await transaction.commit()

    logger.info('余额重算成功', {
      account_id: accountId,
      asset_code: assetCode,
      new_balance: correctBalance
    })

    return {
      success: true,
      account_id: accountId,
      asset_code: assetCode,
      balance: correctBalance
    }
  } catch (error) {
    await transaction.rollback()
    logger.error('余额重算失败', {
      account_id: accountId,
      asset_code: assetCode,
      error: error.message
    })
    throw error
  }
}

/**
 * 重算单个账户的所有资产
 */
async function recalculateAccountAllAssets(accountId) {
  logger.info('重算账户所有资产', { account_id: accountId })

  // 查询该账户的所有资产类型
  const assetCodes = await AssetTransaction.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('asset_code')), 'asset_code']],
    where: { account_id: accountId },
    raw: true
  })

  const results = []
  for (const { asset_code } of assetCodes) {
    try {
      const result = await recalculateBalance(accountId, asset_code)
      results.push(result)
    } catch (error) {
      results.push({
        success: false,
        account_id: accountId,
        asset_code,
        error: error.message
      })
    }
  }

  return results
}

/**
 * 重算所有账户的所有资产
 */
async function recalculateAllBalances() {
  logger.info('重算所有账户的所有资产')

  // 查询所有账户
  const accounts = await AssetTransaction.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('account_id')), 'account_id']],
    raw: true
  })

  const results = []
  for (const { account_id } of accounts) {
    try {
      const accountResults = await recalculateAccountAllAssets(account_id)
      results.push(...accountResults)
    } catch (error) {
      logger.error('重算账户失败', {
        account_id,
        error: error.message
      })
    }
  }

  return results
}

/**
 * 主程序入口
 */
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('用法: node recalculate-balance.js <account_id|all> <asset_code|all>')
    console.error('')
    console.error('示例:')
    console.error('  node recalculate-balance.js 6 red_shard     # 重算账户6的红色碎片')
    console.error('  node recalculate-balance.js 6 all           # 重算账户6的所有资产')
    console.error('  node recalculate-balance.js all all         # 重算所有账户的所有资产')
    process.exit(1)
  }

  const [accountIdArg, assetCodeArg] = args

  try {
    console.log('='.repeat(70))
    console.log('资产余额重算工具')
    console.log('='.repeat(70))

    let results

    if (accountIdArg === 'all' && assetCodeArg === 'all') {
      console.log('重算所有账户的所有资产...\n')
      results = await recalculateAllBalances()
    } else if (assetCodeArg === 'all') {
      const accountId = accountIdArg
      console.log(`重算账户 ${accountId} 的所有资产...\n`)
      results = await recalculateAccountAllAssets(accountId)
    } else {
      const accountId = accountIdArg
      const assetCode = assetCodeArg
      console.log(`重算账户 ${accountId} 的 ${assetCode} 余额...\n`)
      results = [await recalculateBalance(accountId, assetCode)]
    }

    console.log('\n' + '='.repeat(70))
    console.log('重算结果')
    console.log('='.repeat(70))

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    console.log(`总计: ${results.length} 条`)
    console.log(`成功: ${successCount} 条`)
    console.log(`失败: ${failCount} 条\n`)

    if (failCount > 0) {
      console.log('失败记录:')
      results
        .filter(r => !r.success)
        .forEach((r, idx) => {
          console.log(`  ${idx + 1}. 账户 ${r.account_id} - ${r.asset_code}: ${r.error}`)
        })
    }

    console.log('='.repeat(70))

    process.exit(failCount > 0 ? 1 : 0)
  } catch (error) {
    console.error('\n❌ 重算失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = { recalculateBalance, recalculateAccountAllAssets, recalculateAllBalances }
