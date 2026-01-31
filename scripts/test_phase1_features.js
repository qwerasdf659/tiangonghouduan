/**
 * Phase 1 功能测试脚本
 * 测试账户体系和冻结模型的核心功能
 *
 * 测试场景：
 * 1. 账户创建（用户账户和系统账户）
 * 2. 资产余额操作（changeBalance）
 * 3. 资产冻结操作（freeze）
 * 4. 资产解冻操作（unfreeze）
 * 5. 从冻结余额结算（settleFromFrozen）
 * 6. 幂等性验证
 * 7. 完整对账验证（before + delta = after）
 */

'use strict'

const { Account, AccountAssetBalance, AssetTransaction, User } = require('../models')
const { sequelize } = require('../config/database')

/*
 * V4.7.0 BalanceService 拆分：通过 ServiceManager 获取 BalanceService
 * 服务键：'asset_balance'（snake_case）
 * 注意：在测试开始时通过 ServiceManager 初始化获取
 */
let BalanceService = null

/**
 * V4.7.0：初始化 ServiceManager 并获取 BalanceService（原 BalanceService 拆分）
 * @returns {Promise<Object>} BalanceService 实例
 */
async function initializeBalanceService() {
  if (BalanceService) return BalanceService
  try {
    const serviceManager = require('../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    BalanceService = serviceManager.getService('asset_balance')
    console.log('  ✅ BalanceService 加载成功（V4.7.0 BalanceService 拆分）')
    return BalanceService
  } catch (error) {
    console.log(`  ❌ BalanceService 加载失败: ${error.message}`)
    throw error
  }
}

// 测试结果统计
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
}

/**
 * 测试辅助函数
 */
function assert(condition, message) {
  testResults.total++
  if (condition) {
    testResults.passed++
    console.log(`  ✅ ${message}`)
  } else {
    testResults.failed++
    testResults.errors.push(message)
    console.log(`  ❌ ${message}`)
  }
}

/**
 * 测试1: 账户创建
 */
async function testAccountCreation() {
  console.log('\n📋 测试1: 账户创建')

  try {
    // 创建测试用户
    const testUser = await User.findOne({ where: { mobile: '13612227930' } })
    if (!testUser) {
      console.log('  ⚠️ 测试用户不存在，跳过测试')
      return
    }

    // 测试用户账户创建
    const userAccount = await BalanceService.getOrCreateAccount({ user_id: testUser.user_id })
    assert(userAccount !== null, '用户账户创建成功')
    assert(userAccount.account_type === 'user', '账户类型为user')
    assert(userAccount.user_id === testUser.user_id, 'user_id匹配')
    assert(userAccount.status === 'active', '账户状态为active')

    // 测试系统账户获取
    const systemAccount = await BalanceService.getOrCreateAccount({
      system_code: 'SYSTEM_PLATFORM_FEE'
    })
    assert(systemAccount !== null, '系统账户获取成功')
    assert(systemAccount.account_type === 'system', '账户类型为system')
    assert(systemAccount.system_code === 'SYSTEM_PLATFORM_FEE', 'system_code匹配')
  } catch (error) {
    console.log(`  ❌ 测试失败: ${error.message}`)
    testResults.failed++
    testResults.errors.push(`账户创建测试失败: ${error.message}`)
  }
}

/**
 * 测试2: 资产余额操作
 */
async function testBalanceOperations() {
  console.log('\n📋 测试2: 资产余额操作')

  const transaction = await sequelize.transaction()

  try {
    const testUser = await User.findOne({ where: { mobile: '13612227930' } })
    if (!testUser) {
      console.log('  ⚠️ 测试用户不存在，跳过测试')
      await transaction.rollback()
      return
    }

    // 测试增加余额
    const result1 = await BalanceService.changeBalance(
      {
        user_id: testUser.user_id,
        asset_code: 'DIAMOND',
        delta_amount: 1000,
        business_id: 'test_phase1_add_1000',
        business_type: 'test_add_balance'
      },
      { transaction }
    )

    assert(result1.is_duplicate === false, '首次操作不是重复')
    assert(result1.balance.available_amount >= 1000, '可用余额增加成功')
    assert(result1.transaction_record.balance_before !== null, 'balance_before字段已记录')
    assert(
      result1.transaction_record.balance_after === result1.transaction_record.balance_before + 1000,
      '对账公式正确: before + delta = after'
    )

    // 测试幂等性
    const result2 = await BalanceService.changeBalance(
      {
        user_id: testUser.user_id,
        asset_code: 'DIAMOND',
        delta_amount: 1000,
        business_id: 'test_phase1_add_1000',
        business_type: 'test_add_balance'
      },
      { transaction }
    )

    assert(result2.is_duplicate === true, '重复操作返回is_duplicate=true')

    // 测试扣减余额
    const result3 = await BalanceService.changeBalance(
      {
        user_id: testUser.user_id,
        asset_code: 'DIAMOND',
        delta_amount: -500,
        business_id: 'test_phase1_deduct_500',
        business_type: 'test_deduct_balance'
      },
      { transaction }
    )

    assert(result3.is_duplicate === false, '扣减操作成功')
    assert(result3.transaction_record.delta_amount === -500, 'delta_amount为负数')
    assert(
      result3.transaction_record.balance_after === result3.transaction_record.balance_before - 500,
      '扣减对账公式正确'
    )

    await transaction.rollback()
    console.log('  ✅ 测试事务已回滚')
  } catch (error) {
    await transaction.rollback()
    console.log(`  ❌ 测试失败: ${error.message}`)
    testResults.failed++
    testResults.errors.push(`余额操作测试失败: ${error.message}`)
  }
}

/**
 * 测试3: 资产冻结和解冻
 */
async function testFreezeUnfreeze() {
  console.log('\n📋 测试3: 资产冻结和解冻')

  const transaction = await sequelize.transaction()

  try {
    const testUser = await User.findOne({ where: { mobile: '13612227930' } })
    if (!testUser) {
      console.log('  ⚠️ 测试用户不存在，跳过测试')
      await transaction.rollback()
      return
    }

    // 先增加余额
    await BalanceService.changeBalance(
      {
        user_id: testUser.user_id,
        asset_code: 'DIAMOND',
        delta_amount: 2000,
        business_id: 'test_phase1_freeze_init',
        business_type: 'test_init_balance'
      },
      { transaction }
    )

    // 测试冻结
    const freezeResult = await BalanceService.freeze(
      {
        user_id: testUser.user_id,
        asset_code: 'DIAMOND',
        amount: 500,
        business_id: 'test_phase1_freeze_500',
        business_type: 'test_freeze'
      },
      { transaction }
    )

    assert(freezeResult.is_duplicate === false, '冻结操作成功')
    assert(freezeResult.balance.frozen_amount >= 500, '冻结余额增加')
    assert(freezeResult.transaction_record.meta.freeze_amount === 500, 'meta中记录了freeze_amount')

    // 测试解冻
    const unfreezeResult = await BalanceService.unfreeze(
      {
        user_id: testUser.user_id,
        asset_code: 'DIAMOND',
        amount: 300,
        business_id: 'test_phase1_unfreeze_300',
        business_type: 'test_unfreeze'
      },
      { transaction }
    )

    assert(unfreezeResult.is_duplicate === false, '解冻操作成功')
    assert(
      unfreezeResult.transaction_record.meta.unfreeze_amount === 300,
      'meta中记录了unfreeze_amount'
    )

    await transaction.rollback()
    console.log('  ✅ 测试事务已回滚')
  } catch (error) {
    await transaction.rollback()
    console.log(`  ❌ 测试失败: ${error.message}`)
    testResults.failed++
    testResults.errors.push(`冻结解冻测试失败: ${error.message}`)
  }
}

/**
 * 测试4: 从冻结余额结算
 */
async function testSettleFromFrozen() {
  console.log('\n📋 测试4: 从冻结余额结算')

  const transaction = await sequelize.transaction()

  try {
    const testUser = await User.findOne({ where: { mobile: '13612227930' } })
    if (!testUser) {
      console.log('  ⚠️ 测试用户不存在，跳过测试')
      await transaction.rollback()
      return
    }

    // 先增加余额并冻结
    await BalanceService.changeBalance(
      {
        user_id: testUser.user_id,
        asset_code: 'DIAMOND',
        delta_amount: 3000,
        business_id: 'test_phase1_settle_init',
        business_type: 'test_init_balance'
      },
      { transaction }
    )

    await BalanceService.freeze(
      {
        user_id: testUser.user_id,
        asset_code: 'DIAMOND',
        amount: 1000,
        business_id: 'test_phase1_settle_freeze',
        business_type: 'test_freeze'
      },
      { transaction }
    )

    // 获取冻结前的可用余额
    const balanceBefore = await BalanceService.getBalance(
      { user_id: testUser.user_id, asset_code: 'DIAMOND' },
      { transaction }
    )

    // 测试从冻结余额结算
    const settleResult = await BalanceService.settleFromFrozen(
      {
        user_id: testUser.user_id,
        asset_code: 'DIAMOND',
        amount: 600,
        business_id: 'test_phase1_settle_600',
        business_type: 'test_settle'
      },
      { transaction }
    )

    assert(settleResult.is_duplicate === false, '结算操作成功')
    assert(settleResult.transaction_record.delta_amount === 0, 'delta_amount为0（available不变）')
    assert(settleResult.transaction_record.meta.settle_amount === 600, 'meta中记录了settle_amount')
    assert(
      settleResult.transaction_record.meta.settle_from === 'frozen',
      'meta中标记了settle_from=frozen'
    )

    // 验证可用余额未变化
    const balanceAfter = await BalanceService.getBalance(
      { user_id: testUser.user_id, asset_code: 'DIAMOND' },
      { transaction }
    )
    assert(balanceAfter.available_amount === balanceBefore.available_amount, '可用余额未变化')
    assert(balanceAfter.frozen_amount === balanceBefore.frozen_amount - 600, '冻结余额减少600')

    await transaction.rollback()
    console.log('  ✅ 测试事务已回滚')
  } catch (error) {
    await transaction.rollback()
    console.log(`  ❌ 测试失败: ${error.message}`)
    testResults.failed++
    testResults.errors.push(`从冻结余额结算测试失败: ${error.message}`)
  }
}

/**
 * 测试5: 系统账户操作
 */
async function testSystemAccountOperations() {
  console.log('\n📋 测试5: 系统账户操作')

  const transaction = await sequelize.transaction()

  try {
    // 测试系统账户增加余额
    const result = await BalanceService.changeBalance(
      {
        system_code: 'SYSTEM_PLATFORM_FEE',
        asset_code: 'DIAMOND',
        delta_amount: 100,
        business_id: 'test_phase1_system_fee',
        business_type: 'test_platform_fee'
      },
      { transaction }
    )

    assert(result.is_duplicate === false, '系统账户操作成功')
    assert(result.account.account_type === 'system', '账户类型为system')
    assert(result.account.system_code === 'SYSTEM_PLATFORM_FEE', 'system_code正确')
    assert(result.balance.available_amount >= 100, '系统账户余额增加')

    await transaction.rollback()
    console.log('  ✅ 测试事务已回滚')
  } catch (error) {
    await transaction.rollback()
    console.log(`  ❌ 测试失败: ${error.message}`)
    testResults.failed++
    testResults.errors.push(`系统账户操作测试失败: ${error.message}`)
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('🚀 开始Phase 1功能测试\n')
  console.log('='.repeat(60))

  try {
    // P1-9：初始化 BalanceService
    await initializeBalanceService()

    await testAccountCreation()
    await testBalanceOperations()
    await testFreezeUnfreeze()
    await testSettleFromFrozen()
    await testSystemAccountOperations()

    console.log('\n' + '='.repeat(60))
    console.log('\n📊 测试结果统计:')
    console.log(`  总测试数: ${testResults.total}`)
    console.log(`  ✅ 通过: ${testResults.passed}`)
    console.log(`  ❌ 失败: ${testResults.failed}`)

    if (testResults.failed > 0) {
      console.log('\n❌ 失败的测试:')
      testResults.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`)
      })
      process.exit(1)
    } else {
      console.log('\n🎉 所有测试通过！')
      process.exit(0)
    }
  } catch (error) {
    console.error('\n❌ 测试执行失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行测试
runTests()
