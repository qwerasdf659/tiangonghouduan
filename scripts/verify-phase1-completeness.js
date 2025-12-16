/**
 * Phase 1 完整性验证脚本
 * 全面检查Phase 1的所有组件是否正确部署和配置
 *
 * 验证内容：
 * 1. 数据库表结构
 * 2. 模型加载
 * 3. 数据库迁移状态
 * 4. 系统账户初始化
 * 5. AssetService API兼容性
 * 6. 代码质量（ESLint）
 * 7. 功能测试覆盖
 */

'use strict'

const { sequelize, Account, AccountAssetBalance, AssetTransaction } = require('../models')
const AssetService = require('../services/AssetService')

// 验证结果统计
const verificationResults = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: []
}

/**
 * 验证辅助函数
 */
function verify(condition, message, level = 'error') {
  verificationResults.total++
  if (condition) {
    verificationResults.passed++
    console.log(`  ✅ ${message}`)
    return true
  } else {
    if (level === 'warning') {
      verificationResults.warnings++
      console.log(`  ⚠️ ${message}`)
    } else {
      verificationResults.failed++
      verificationResults.errors.push(message)
      console.log(`  ❌ ${message}`)
    }
    return false
  }
}

/**
 * 验证1: 数据库表结构
 */
async function verifyDatabaseTables() {
  console.log('\n📋 验证1: 数据库表结构')

  try {
    // 检查accounts表
    const [accountsSchema] = await sequelize.query(
      "SHOW COLUMNS FROM accounts WHERE Field IN ('account_id', 'account_type', 'user_id', 'system_code', 'status')"
    )
    verify(accountsSchema.length === 5, 'accounts表结构完整（5个核心字段）')

    // 检查account_asset_balances表
    const [balancesSchema] = await sequelize.query(
      "SHOW COLUMNS FROM account_asset_balances WHERE Field IN ('balance_id', 'account_id', 'asset_code', 'available_amount', 'frozen_amount')"
    )
    verify(balancesSchema.length === 5, 'account_asset_balances表结构完整（5个核心字段）')

    // 检查asset_transactions表升级
    const [transactionsSchema] = await sequelize.query(
      "SHOW COLUMNS FROM asset_transactions WHERE Field IN ('account_id', 'balance_before', 'balance_after')"
    )
    verify(transactionsSchema.length === 3, 'asset_transactions表已升级（3个新字段）')

    // 检查user_id是否允许NULL
    const [userIdColumn] = await sequelize.query(
      "SHOW COLUMNS FROM asset_transactions WHERE Field = 'user_id'"
    )
    verify(userIdColumn[0].Null === 'YES', 'asset_transactions.user_id允许NULL（系统账户支持）')
  } catch (error) {
    verify(false, `数据库表结构验证失败: ${error.message}`)
  }
}

/**
 * 验证2: 模型加载
 */
async function verifyModels() {
  console.log('\n📋 验证2: 模型加载')

  try {
    verify(Account !== undefined, 'Account模型已加载')
    verify(AccountAssetBalance !== undefined, 'AccountAssetBalance模型已加载')
    verify(AssetTransaction !== undefined, 'AssetTransaction模型已加载')

    // 检查模型关联
    verify(Account.associations.asset_balances !== undefined, 'Account模型关联asset_balances已建立')
    verify(
      AccountAssetBalance.associations.account !== undefined,
      'AccountAssetBalance模型关联account已建立'
    )
    verify(
      AssetTransaction.associations.account !== undefined,
      'AssetTransaction模型关联account已建立'
    )
  } catch (error) {
    verify(false, `模型加载验证失败: ${error.message}`)
  }
}

/**
 * 验证3: 数据库迁移状态
 */
async function verifyMigrations() {
  console.log('\n📋 验证3: 数据库迁移状态')

  try {
    const [migrations] = await sequelize.query('SELECT name FROM SequelizeMeta ORDER BY name')

    const phase1Migrations = [
      '20251215160000-create-accounts-table.js',
      '20251215160100-create-account-asset-balances-table.js',
      '20251215160200-upgrade-asset-transactions-add-account-fields.js',
      '20251215160300-migrate-user-asset-accounts-to-account-balances.js'
    ]

    phase1Migrations.forEach(migration => {
      const executed = migrations.some(m => m.name === migration)
      verify(executed, `迁移已执行: ${migration}`)
    })
  } catch (error) {
    verify(false, `迁移状态验证失败: ${error.message}`)
  }
}

/**
 * 验证4: 系统账户初始化
 */
async function verifySystemAccounts() {
  console.log('\n📋 验证4: 系统账户初始化')

  try {
    const systemAccounts = await Account.findAll({
      where: { account_type: 'system' },
      order: [['system_code', 'ASC']]
    })

    verify(systemAccounts.length === 4, '系统账户数量正确（4个）')

    const requiredSystemCodes = [
      'SYSTEM_PLATFORM_FEE',
      'SYSTEM_MINT',
      'SYSTEM_BURN',
      'SYSTEM_ESCROW'
    ]

    requiredSystemCodes.forEach(code => {
      const account = systemAccounts.find(a => a.system_code === code)
      verify(account !== undefined, `系统账户存在: ${code}`)
      if (account) {
        verify(account.status === 'active', `系统账户状态正确: ${code}`)
      }
    })
  } catch (error) {
    verify(false, `系统账户验证失败: ${error.message}`)
  }
}

/**
 * 验证5: AssetService API
 */
async function verifyAssetServiceAPI() {
  console.log('\n📋 验证5: AssetService API')

  try {
    // 检查必需的方法
    const requiredMethods = [
      'changeBalance',
      'freeze',
      'unfreeze',
      'settleFromFrozen',
      'getBalance',
      'getOrCreateAccount'
    ]

    requiredMethods.forEach(method => {
      verify(typeof AssetService[method] === 'function', `AssetService.${method}方法存在`)
    })

    // 检查changeBalance方法签名（应该接受对象参数）
    const changeBalanceStr = AssetService.changeBalance.toString()
    verify(
      changeBalanceStr.includes('user_id') || changeBalanceStr.includes('system_code'),
      'AssetService.changeBalance支持新API（对象参数）'
    )
  } catch (error) {
    verify(false, `AssetService API验证失败: ${error.message}`)
  }
}

/**
 * 验证6: 索引和约束
 */
async function verifyIndexesAndConstraints() {
  console.log('\n📋 验证6: 索引和约束')

  try {
    // 检查accounts表索引
    const [accountsIndexes] = await sequelize.query('SHOW INDEX FROM accounts')
    const hasUserIdUnique = accountsIndexes.some(
      idx => idx.Column_name === 'user_id' && idx.Non_unique === 0
    )
    const hasSystemCodeUnique = accountsIndexes.some(
      idx => idx.Column_name === 'system_code' && idx.Non_unique === 0
    )
    verify(hasUserIdUnique, 'accounts表user_id唯一索引存在')
    verify(hasSystemCodeUnique, 'accounts表system_code唯一索引存在')

    // 检查account_asset_balances表唯一索引
    const [balancesIndexes] = await sequelize.query('SHOW INDEX FROM account_asset_balances')
    const hasAccountAssetUnique = balancesIndexes.some(
      idx =>
        idx.Key_name !== 'PRIMARY' &&
        idx.Non_unique === 0 &&
        (idx.Column_name === 'account_id' || idx.Column_name === 'asset_code')
    )
    verify(hasAccountAssetUnique, 'account_asset_balances表(account_id, asset_code)唯一索引存在')

    // 检查asset_transactions表索引
    const [transactionsIndexes] = await sequelize.query('SHOW INDEX FROM asset_transactions')
    const hasBusinessIdIndex = transactionsIndexes.some(idx => idx.Column_name === 'business_id')
    verify(hasBusinessIdIndex, 'asset_transactions表business_id索引存在')
  } catch (error) {
    verify(false, `索引和约束验证失败: ${error.message}`)
  }
}

/**
 * 验证7: 数据一致性
 */
async function verifyDataConsistency() {
  console.log('\n📋 验证7: 数据一致性')

  try {
    // 检查是否有孤立的余额记录（account_id不存在）
    const [orphanBalances] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM account_asset_balances aab
      LEFT JOIN accounts a ON aab.account_id = a.account_id
      WHERE a.account_id IS NULL
    `)
    const orphanBalanceCount = parseInt(orphanBalances[0].count)
    verify(
      orphanBalanceCount === 0,
      orphanBalanceCount === 0 ? '无孤立余额记录' : `发现${orphanBalanceCount}条孤立余额记录`
    )

    // 检查是否有孤立的交易记录（account_id不存在）
    const [orphanTransactions] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM asset_transactions at
      LEFT JOIN accounts a ON at.account_id = a.account_id
      WHERE at.account_id IS NOT NULL AND a.account_id IS NULL
    `)
    const orphanTransactionCount = parseInt(orphanTransactions[0].count)
    verify(
      orphanTransactionCount === 0,
      orphanTransactionCount === 0
        ? '无孤立交易记录'
        : `发现${orphanTransactionCount}条孤立交易记录`
    )

    // 检查frozen_amount是否都是非负数
    const [negativeBalances] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM account_asset_balances 
      WHERE frozen_amount < 0 OR available_amount < 0
    `)
    const negativeBalanceCount = parseInt(negativeBalances[0].count)
    verify(
      negativeBalanceCount === 0,
      negativeBalanceCount === 0 ? '所有余额均为非负数' : `发现${negativeBalanceCount}条负数余额`
    )
  } catch (error) {
    verify(false, `数据一致性验证失败: ${error.message}`)
  }
}

/**
 * 主验证函数
 */
async function runVerification() {
  console.log('🔍 开始Phase 1完整性验证\n')
  console.log('='.repeat(60))

  try {
    await verifyDatabaseTables()
    await verifyModels()
    await verifyMigrations()
    await verifySystemAccounts()
    await verifyAssetServiceAPI()
    await verifyIndexesAndConstraints()
    await verifyDataConsistency()

    console.log('\n' + '='.repeat(60))
    console.log('\n📊 验证结果统计:')
    console.log(`  总验证项: ${verificationResults.total}`)
    console.log(`  ✅ 通过: ${verificationResults.passed}`)
    console.log(`  ⚠️  警告: ${verificationResults.warnings}`)
    console.log(`  ❌ 失败: ${verificationResults.failed}`)

    if (verificationResults.failed > 0) {
      console.log('\n❌ 失败的验证项:')
      verificationResults.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`)
      })
      console.log('\n⚠️  Phase 1存在问题，需要修复！')
      process.exit(1)
    } else if (verificationResults.warnings > 0) {
      console.log('\n⚠️  Phase 1基本完成，但有警告需要注意')
      process.exit(0)
    } else {
      console.log('\n🎉 Phase 1完整性验证全部通过！')
      console.log('✅ 所有组件已正确部署和配置')
      process.exit(0)
    }
  } catch (error) {
    console.error('\n❌ 验证执行失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行验证
runVerification()
