#!/usr/bin/env node

/**
 * 孤儿冻结测试脚本（带测试数据）
 *
 * 功能：
 * 1. 创建测试用的孤儿冻结数据
 * 2. 验证API检测功能
 * 3. 测试清理功能（干跑模式）
 * 4. 清理测试数据
 *
 * 执行方式：node scripts/test-orphan-frozen-with-data.js
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../models')
const { Account, AccountAssetBalance, User } = require('../models')
const OrphanFrozenCleanupService = require('../services/OrphanFrozenCleanupService')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

// 测试数据标记
const TEST_MARKER = '_orphan_test_'

async function main() {
  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan')
  log('║         孤儿冻结测试脚本（带测试数据）                       ║', 'cyan')
  log('╚══════════════════════════════════════════════════════════════╝\n', 'cyan')

  const transaction = await sequelize.transaction()

  try {
    // 1. 连接数据库
    log('📡 连接数据库...', 'blue')
    await sequelize.authenticate()
    log('✅ 数据库连接成功\n', 'green')

    // 2. 查找一个测试用户
    log('👤 查找测试用户...', 'blue')
    let testUser = await User.findOne({
      where: { status: 'active' },
      transaction
    })

    if (!testUser) {
      log('❌ 未找到活跃用户，无法创建测试数据', 'red')
      await transaction.rollback()
      return
    }

    log(
      `   找到测试用户: user_id=${testUser.user_id}, nickname=${testUser.nickname || testUser.openid}`,
      'cyan'
    )

    // 3. 查找或创建用户账户
    log('\n📦 查找或创建用户账户...', 'blue')
    let account = await Account.findOne({
      where: {
        user_id: testUser.user_id,
        account_type: 'user'
      },
      transaction
    })

    if (!account) {
      account = await Account.create(
        {
          user_id: testUser.user_id,
          account_type: 'user'
        },
        { transaction }
      )
      log(`   创建账户: account_id=${account.account_id}`, 'green')
    } else {
      log(`   使用现有账户: account_id=${account.account_id}`, 'cyan')
    }

    // 4. 创建测试用的孤儿冻结数据
    log('\n🧪 创建测试孤儿冻结数据...', 'blue')

    const testAssetCode = 'points' + TEST_MARKER + Date.now()

    // 创建一个有冻结但没有挂牌的余额记录（这就是孤儿冻结）
    const testBalance = await AccountAssetBalance.create(
      {
        account_id: account.account_id,
        asset_code: testAssetCode,
        available_amount: 1000,
        frozen_amount: 500 // 这500是孤儿冻结，因为没有对应的挂牌
      },
      { transaction }
    )

    log(`   创建测试余额记录: balance_id=${testBalance.balance_id}`, 'green')
    log(`   asset_code=${testAssetCode}`, 'cyan')
    log(`   available_amount=1000, frozen_amount=500`, 'cyan')
    log(`   预期检测到孤儿冻结: 500 (因为没有对应挂牌)`, 'yellow')

    // 提交事务以使数据可见
    await transaction.commit()
    log('\n✅ 测试数据创建完成并已提交\n', 'green')

    // 5. 测试检测功能
    log('🔍 测试 detectOrphanFrozen()...', 'blue')
    const orphanList = await OrphanFrozenCleanupService.detectOrphanFrozen({
      user_id: testUser.user_id,
      asset_code: testAssetCode
    })

    log(`   检测结果: 发现 ${orphanList.length} 条孤儿冻结`, 'cyan')

    if (orphanList.length > 0) {
      log('   ✅ 成功检测到测试数据创建的孤儿冻结:', 'green')
      orphanList.forEach((item, i) => {
        log(`      ${i + 1}. user_id=${item.user_id}, asset_code=${item.asset_code}`, 'yellow')
        log(
          `         frozen=${item.frozen_amount}, listed=${item.listed_amount}, orphan=${item.orphan_amount}`,
          'yellow'
        )
      })
    } else {
      log('   ⚠️ 未检测到孤儿冻结，可能是asset_code筛选问题', 'yellow')
    }

    // 6. 测试统计功能
    log('\n📊 测试 getOrphanFrozenStats()...', 'blue')
    const stats = await OrphanFrozenCleanupService.getOrphanFrozenStats()

    log(`   total_orphan_count: ${stats.total_orphan_count}`, 'cyan')
    log(`   total_orphan_amount: ${stats.total_orphan_amount}`, 'cyan')
    log(`   affected_user_count: ${stats.affected_user_count}`, 'cyan')

    // 7. 测试清理功能（干跑模式）
    log('\n🧹 测试 cleanupOrphanFrozen() (干跑模式)...', 'blue')
    const cleanupResult = await OrphanFrozenCleanupService.cleanupOrphanFrozen({
      dry_run: true,
      user_id: testUser.user_id,
      asset_code: testAssetCode,
      operator_id: 1,
      reason: '测试脚本干跑'
    })

    log(`   dry_run: ${cleanupResult.dry_run}`, 'cyan')
    log(`   detected: ${cleanupResult.detected}`, 'cyan')
    log(`   total_amount: ${cleanupResult.total_amount}`, 'cyan')

    // 8. 清理测试数据
    log('\n🗑️ 清理测试数据...', 'blue')
    const deleteTransaction = await sequelize.transaction()

    try {
      // 删除测试余额记录
      await AccountAssetBalance.destroy({
        where: { balance_id: testBalance.balance_id },
        transaction: deleteTransaction
      })

      await deleteTransaction.commit()
      log('   ✅ 测试数据已清理', 'green')
    } catch (cleanupError) {
      await deleteTransaction.rollback()
      log(`   ⚠️ 清理测试数据失败: ${cleanupError.message}`, 'yellow')
    }

    // 9. 输出前端测试建议
    log('\n═══════════════════════════════════════════════════════════════', 'green')
    log('✅ 测试完成！', 'green')
    log('', 'reset')
    log('📋 前端测试步骤:', 'cyan')
    log('   1. 确保后端服务运行中: npm run dev', 'cyan')
    log('   2. 访问管理后台: http://localhost:3000/admin/orphan-frozen.html', 'cyan')
    log('   3. 使用管理员账号登录', 'cyan')
    log('   4. 点击"刷新"或"扫描孤儿"按钮', 'cyan')
    log('   5. 查看统计卡片和数据列表是否正确显示', 'cyan')
    log('', 'reset')
    log('⚠️ 注意: 由于测试数据已清理，当前系统可能没有孤儿冻结数据', 'yellow')
    log('   如果要看到数据，需要在系统中创建真实的孤儿冻结场景', 'yellow')
    log('═══════════════════════════════════════════════════════════════\n', 'green')
  } catch (error) {
    log(`\n❌ 测试失败: ${error.message}`, 'red')
    console.error(error)

    try {
      await transaction.rollback()
    } catch (rollbackError) {
      // 忽略回滚错误
    }

    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 运行测试
main()
