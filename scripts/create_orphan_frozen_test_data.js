#!/usr/bin/env node

/**
 * 创建孤儿冻结测试数据脚本
 *
 * 功能：创建持久化的测试数据，用于验证前端页面显示
 *
 * 执行方式：
 *   创建数据：node scripts/create-orphan-frozen-test-data.js create
 *   清理数据：node scripts/create-orphan-frozen-test-data.js cleanup
 *   查看状态：node scripts/create-orphan-frozen-test-data.js status
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

// 测试数据标记 - 用于识别和清理
const TEST_ASSET_CODES = ['test_orphan_points', 'test_orphan_diamond', 'test_orphan_gold']

/**
 * 创建测试数据
 */
async function createTestData() {
  log('\n🧪 创建孤儿冻结测试数据...', 'blue')

  const transaction = await sequelize.transaction()

  try {
    // 1. 查找活跃用户
    const users = await User.findAll({
      where: { status: 'active' },
      limit: 3,
      transaction
    })

    if (users.length === 0) {
      log('❌ 未找到活跃用户', 'red')
      await transaction.rollback()
      return
    }

    log(`   找到 ${users.length} 个测试用户`, 'cyan')

    // 2. 为每个用户创建测试数据
    const createdRecords = []

    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      const assetCode = TEST_ASSET_CODES[i % TEST_ASSET_CODES.length]

      // 查找或创建账户
      let account = await Account.findOne({
        where: { user_id: user.user_id, account_type: 'user' },
        transaction
      })

      if (!account) {
        account = await Account.create(
          {
            user_id: user.user_id,
            account_type: 'user'
          },
          { transaction }
        )
        log(`   创建账户: user_id=${user.user_id}, account_id=${account.account_id}`, 'green')
      }

      // 检查是否已存在测试数据
      const existingBalance = await AccountAssetBalance.findOne({
        where: {
          account_id: account.account_id,
          asset_code: assetCode
        },
        transaction
      })

      if (existingBalance) {
        log(`   ⚠️ 用户 ${user.user_id} 的 ${assetCode} 已存在测试数据，跳过`, 'yellow')
        continue
      }

      // 创建有冻结但无挂牌的余额记录（孤儿冻结）
      const frozenAmount = (i + 1) * 100 // 100, 200, 300
      const availableAmount = (i + 1) * 500 // 500, 1000, 1500

      const balance = await AccountAssetBalance.create(
        {
          account_id: account.account_id,
          asset_code: assetCode,
          available_amount: availableAmount,
          frozen_amount: frozenAmount
        },
        { transaction }
      )

      createdRecords.push({
        balance_id: balance.balance_id,
        user_id: user.user_id,
        asset_code: assetCode,
        frozen_amount: frozenAmount,
        available_amount: availableAmount
      })

      log(
        `   ✅ 创建测试数据: user_id=${user.user_id}, asset_code=${assetCode}, frozen=${frozenAmount}`,
        'green'
      )
    }

    await transaction.commit()

    log('\n📊 创建结果汇总:', 'cyan')
    log(`   创建了 ${createdRecords.length} 条测试数据`, 'cyan')

    if (createdRecords.length > 0) {
      log('\n   详细信息:', 'cyan')
      createdRecords.forEach((r, i) => {
        log(
          `   ${i + 1}. balance_id=${r.balance_id}, user_id=${r.user_id}, ${r.asset_code}`,
          'yellow'
        )
        log(`      available=${r.available_amount}, frozen=${r.frozen_amount} (孤儿冻结)`, 'yellow')
      })
    }

    // 验证检测
    log('\n🔍 验证检测结果...', 'blue')
    const orphanList = await OrphanFrozenCleanupService.detectOrphanFrozen()
    log(`   当前系统孤儿冻结数: ${orphanList.length}`, 'cyan')

    const stats = await OrphanFrozenCleanupService.getOrphanFrozenStats()
    log(`   total_orphan_count: ${stats.total_orphan_count}`, 'cyan')
    log(`   total_orphan_amount: ${stats.total_orphan_amount}`, 'cyan')
    log(`   affected_user_count: ${stats.affected_user_count}`, 'cyan')

    log('\n✅ 测试数据创建完成！', 'green')
    log('   现在可以访问前端页面查看效果:', 'cyan')
    log('   http://localhost:3000/admin/orphan-frozen.html', 'cyan')
  } catch (error) {
    await transaction.rollback()
    log(`\n❌ 创建失败: ${error.message}`, 'red')
    console.error(error)
  }
}

/**
 * 清理测试数据
 */
async function cleanupTestData() {
  log('\n🗑️ 清理孤儿冻结测试数据...', 'blue')

  const transaction = await sequelize.transaction()

  try {
    // 查找并删除测试数据
    const result = await AccountAssetBalance.destroy({
      where: {
        asset_code: TEST_ASSET_CODES
      },
      transaction
    })

    await transaction.commit()

    log(`   ✅ 已删除 ${result} 条测试数据`, 'green')

    // 验证
    log('\n🔍 验证清理结果...', 'blue')
    const remainingOrphans = await OrphanFrozenCleanupService.detectOrphanFrozen()
    log(`   当前系统孤儿冻结数: ${remainingOrphans.length}`, 'cyan')
  } catch (error) {
    await transaction.rollback()
    log(`\n❌ 清理失败: ${error.message}`, 'red')
    console.error(error)
  }
}

/**
 * 查看当前状态
 */
async function checkStatus() {
  log('\n📊 孤儿冻结状态检查...', 'blue')

  try {
    // 检测孤儿冻结
    const orphanList = await OrphanFrozenCleanupService.detectOrphanFrozen()

    log(`\n   检测到 ${orphanList.length} 条孤儿冻结:`, 'cyan')

    if (orphanList.length > 0) {
      orphanList.forEach((item, i) => {
        const isTestData = TEST_ASSET_CODES.includes(item.asset_code)
        const marker = isTestData ? ' [测试数据]' : ''
        log(
          `   ${i + 1}. user_id=${item.user_id}, asset_code=${item.asset_code}${marker}`,
          'yellow'
        )
        log(
          `      frozen=${item.frozen_amount}, listed=${item.listed_amount}, orphan=${item.orphan_amount}`,
          'yellow'
        )
      })
    } else {
      log('   系统健康，无孤儿冻结', 'green')
    }

    // 获取统计
    const stats = await OrphanFrozenCleanupService.getOrphanFrozenStats()

    log('\n   统计信息:', 'cyan')
    log(`   - total_orphan_count: ${stats.total_orphan_count}`, 'cyan')
    log(`   - total_orphan_amount: ${stats.total_orphan_amount}`, 'cyan')
    log(`   - affected_user_count: ${stats.affected_user_count}`, 'cyan')

    if (stats.by_asset && stats.by_asset.length > 0) {
      log('\n   按资产类型分组:', 'cyan')
      stats.by_asset.forEach(asset => {
        log(
          `   - ${asset.asset_code}: count=${asset.count}, amount=${asset.total_orphan_amount}`,
          'yellow'
        )
      })
    }
  } catch (error) {
    log(`\n❌ 检查失败: ${error.message}`, 'red')
    console.error(error)
  }
}

/**
 * 主函数
 */
async function main() {
  const action = process.argv[2] || 'status'

  log('╔══════════════════════════════════════════════════════════════╗', 'cyan')
  log('║         孤儿冻结测试数据管理工具                             ║', 'cyan')
  log('╚══════════════════════════════════════════════════════════════╝', 'cyan')

  try {
    await sequelize.authenticate()
    log('✅ 数据库连接成功', 'green')

    switch (action) {
      case 'create':
        await createTestData()
        break
      case 'cleanup':
        await cleanupTestData()
        break
      case 'status':
      default:
        await checkStatus()
        break
    }

    log('\n使用说明:', 'blue')
    log('  node scripts/create-orphan-frozen-test-data.js create   - 创建测试数据', 'cyan')
    log('  node scripts/create-orphan-frozen-test-data.js cleanup  - 清理测试数据', 'cyan')
    log('  node scripts/create-orphan-frozen-test-data.js status   - 查看当前状态', 'cyan')
  } catch (error) {
    log(`\n❌ 执行失败: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

main()
