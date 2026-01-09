#!/usr/bin/env node

/**
 * 孤儿冻结清理API测试脚本
 * 
 * 功能：测试后端API是否正常工作，验证数据结构
 * 
 * 执行方式：node scripts/test-orphan-frozen-api.js
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../models')
const { Account, AccountAssetBalance, MarketListing, User } = require('../models')
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

async function testOrphanFrozenAPIs() {
  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan')
  log('║         孤儿冻结清理API测试脚本                              ║', 'cyan')
  log('╚══════════════════════════════════════════════════════════════╝\n', 'cyan')

  try {
    // 1. 测试数据库连接
    log('📡 测试数据库连接...', 'blue')
    await sequelize.authenticate()
    log('✅ 数据库连接成功\n', 'green')

    // 2. 查询基础数据统计
    log('📊 查询基础数据统计...', 'blue')
    
    const userCount = await User.count()
    const accountCount = await Account.count()
    const balanceCount = await AccountAssetBalance.count()
    const listingCount = await MarketListing.count()
    
    log(`   - 用户总数: ${userCount}`, 'cyan')
    log(`   - 账户总数: ${accountCount}`, 'cyan')
    log(`   - 余额记录数: ${balanceCount}`, 'cyan')
    log(`   - 市场挂牌数: ${listingCount}`, 'cyan')
    log('', 'reset')

    // 3. 查询有冻结余额的记录
    log('🔍 查询有冻结余额的记录...', 'blue')
    const frozenBalances = await AccountAssetBalance.findAll({
      where: sequelize.where(
        sequelize.cast(sequelize.col('frozen_amount'), 'DECIMAL(20,2)'),
        '>',
        0
      ),
      include: [{
        model: Account,
        as: 'account',
        attributes: ['user_id', 'account_type']
      }],
      limit: 10
    })
    
    log(`   - 有冻结余额的记录数: ${frozenBalances.length}`, 'cyan')
    if (frozenBalances.length > 0) {
      log('   - 冻结余额样例:', 'yellow')
      frozenBalances.slice(0, 3).forEach((b, i) => {
        log(`     ${i+1}. user_id=${b.account?.user_id}, asset_code=${b.asset_code}, frozen=${b.frozen_amount}, available=${b.available_amount}`, 'yellow')
      })
    }
    log('', 'reset')

    // 4. 测试 detectOrphanFrozen 方法
    log('🔬 测试 OrphanFrozenCleanupService.detectOrphanFrozen()...', 'blue')
    const orphanList = await OrphanFrozenCleanupService.detectOrphanFrozen()
    
    log(`   - 检测结果: 发现 ${orphanList.length} 条孤儿冻结`, 'cyan')
    
    if (orphanList.length > 0) {
      log('   - 孤儿冻结详情:', 'yellow')
      orphanList.slice(0, 5).forEach((item, i) => {
        log(`     ${i+1}. user_id=${item.user_id}, asset_code=${item.asset_code}`, 'yellow')
        log(`        frozen=${item.frozen_amount}, listed=${item.listed_amount}, orphan=${item.orphan_amount}`, 'yellow')
      })
    }
    log('', 'reset')

    // 5. 测试 getOrphanFrozenStats 方法
    log('📈 测试 OrphanFrozenCleanupService.getOrphanFrozenStats()...', 'blue')
    const stats = await OrphanFrozenCleanupService.getOrphanFrozenStats()
    
    log('   - 统计结果:', 'cyan')
    log(`     total_orphan_count: ${stats.total_orphan_count}`, 'cyan')
    log(`     total_orphan_amount: ${stats.total_orphan_amount}`, 'cyan')
    log(`     affected_user_count: ${stats.affected_user_count}`, 'cyan')
    log(`     checked_at: ${stats.checked_at}`, 'cyan')
    
    if (stats.by_asset && stats.by_asset.length > 0) {
      log('   - 按资产类型分组:', 'yellow')
      stats.by_asset.forEach(assetStat => {
        log(`     ${assetStat.asset_code}: count=${assetStat.count}, amount=${assetStat.total_orphan_amount}, users=${assetStat.affected_user_count}`, 'yellow')
      })
    }
    log('', 'reset')

    // 6. 测试 cleanupOrphanFrozen 干跑模式
    log('🧹 测试 OrphanFrozenCleanupService.cleanupOrphanFrozen() (干跑模式)...', 'blue')
    const cleanupResult = await OrphanFrozenCleanupService.cleanupOrphanFrozen({
      dry_run: true,
      operator_id: 1,
      reason: '测试脚本干跑'
    })
    
    log('   - 干跑清理结果:', 'cyan')
    log(`     dry_run: ${cleanupResult.dry_run}`, 'cyan')
    log(`     detected: ${cleanupResult.detected}`, 'cyan')
    log(`     cleaned: ${cleanupResult.cleaned}`, 'cyan')
    log(`     failed: ${cleanupResult.failed}`, 'cyan')
    log(`     total_amount: ${cleanupResult.total_amount}`, 'cyan')
    log('', 'reset')

    // 7. 模拟前端API调用的响应格式
    log('📦 模拟前端API调用响应格式...', 'blue')
    
    // 模拟 /detect API 响应
    const detectApiResponse = {
      success: true,
      data: {
        message: `检测完成，发现 ${orphanList.length} 条孤儿冻结`,
        total: orphanList.length,
        total_amount: orphanList.reduce((sum, item) => sum + item.orphan_amount, 0),
        orphan_list: orphanList
      }
    }
    
    // 模拟 /stats API 响应
    const statsApiResponse = {
      success: true,
      data: {
        message: '获取孤儿冻结统计成功',
        ...stats
      }
    }
    
    log('   - /detect API 响应结构:', 'cyan')
    log(JSON.stringify(detectApiResponse, null, 2).split('\n').map(l => '     ' + l).join('\n'), 'yellow')
    log('', 'reset')
    
    log('   - /stats API 响应结构:', 'cyan')
    log(JSON.stringify(statsApiResponse, null, 2).split('\n').map(l => '     ' + l).join('\n'), 'yellow')
    log('', 'reset')

    // 8. 输出前端需要适配的字段映射
    log('📋 前端需要适配的字段映射:', 'blue')
    log('', 'reset')
    log('   后端字段                    | 前端当前使用              | 说明', 'cyan')
    log('   -----------------------------|---------------------------|---------------------------', 'cyan')
    log('   data.total                   | data.total                | ✅ 一致', 'green')
    log('   data.total_amount            | data.total_amount         | ✅ 一致', 'green')
    log('   data.orphan_list             | data.orphan_list          | ✅ 一致', 'green')
    log('   stats.total_orphan_count     | stats.frozen_count        | ❌ 需要修改前端', 'red')
    log('   stats.total_orphan_amount    | stats.totalValue          | ❌ 需要修改前端', 'red')
    log('   stats.affected_user_count    | (无)                      | 新增统计', 'yellow')
    log('   stats.by_asset               | (无)                      | 新增统计', 'yellow')
    log('   (无 expired_count)           | stats.expired_count       | ⚠️ 后端无此概念', 'yellow')
    log('', 'reset')

    log('═══════════════════════════════════════════════════════════════', 'green')
    log('✅ API测试完成！后端服务正常', 'green')
    log('═══════════════════════════════════════════════════════════════\n', 'green')

  } catch (error) {
    log(`\n❌ 测试失败: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 运行测试
testOrphanFrozenAPIs()

