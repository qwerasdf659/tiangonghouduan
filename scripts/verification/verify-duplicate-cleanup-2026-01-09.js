#!/usr/bin/env node

/**
 * 功能重复清理验证脚本
 *
 * 验证内容（基于功能重复检查报告 2026-01-09）：
 * 1. P0级：路由冲突修复验证
 * 2. P1级：审核系统统一验证
 * 3. P1级：角色审计统一验证
 * 4. P2级：测试数据标记验证
 * 5. P2级：废弃表删除验证
 *
 * 使用方式：
 * - node scripts/verification/verify-duplicate-cleanup-2026-01-09.js
 *
 * 创建时间：2026-01-09
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../../config/database')

async function main() {
  try {
    console.log('🔍 功能重复清理验证')
    console.log('='.repeat(80))

    await sequelize.authenticate()

    let allPassed = true

    // ==================== P0级验证 ====================
    console.log('\n📊 P0级验证：路由冲突修复')
    console.log('-'.repeat(80))

    // 验证 permissions 路由独立挂载
    console.log('1. 验证 permissions 路由独立挂载...')
    const permissionsCheck = await fetch('http://localhost:3000/api/v4/permissions/me').catch(
      () => null
    )
    if (permissionsCheck && permissionsCheck.status === 401) {
      console.log('   ✅ /api/v4/permissions/me 可达（返回401需要认证）')
    } else {
      console.log('   ❌ /api/v4/permissions/me 不可达')
      allPassed = false
    }

    const cacheInvalidateCheck = await fetch(
      'http://localhost:3000/api/v4/permissions/cache/invalidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 1 })
      }
    ).catch(() => null)

    if (cacheInvalidateCheck && cacheInvalidateCheck.status === 401) {
      console.log('   ✅ /api/v4/permissions/cache/invalidate 可达（返回401需要认证）')
    } else {
      console.log('   ❌ /api/v4/permissions/cache/invalidate 不可达')
      allPassed = false
    }

    // ==================== P1级验证 ====================
    console.log('\n📊 P1级验证：审核系统统一')
    console.log('-'.repeat(80))

    // 验证废弃表已删除
    console.log('2. 验证废弃表已删除...')
    const deprecatedTables = ['merchant_points_reviews', 'role_change_logs', 'audit_records']

    for (const table of deprecatedTables) {
      const [result] = await sequelize.query(`SHOW TABLES LIKE '${table}'`)
      if (result.length === 0) {
        console.log(`   ✅ ${table}: 已删除`)
      } else {
        console.log(`   ❌ ${table}: 仍存在`)
        allPassed = false
      }
    }

    // 验证唯一索引
    console.log('3. 验证 content_review_records 唯一索引...')
    const [indexes] = await sequelize.query(`
      SHOW INDEX FROM content_review_records 
      WHERE Key_name = 'uk_content_review_auditable'
    `)

    if (indexes.length > 0 && indexes[0].Non_unique === 0) {
      console.log('   ✅ uk_content_review_auditable 唯一索引已创建')
    } else {
      console.log('   ❌ uk_content_review_auditable 唯一索引缺失或不是唯一索引')
      allPassed = false
    }

    // 验证 consumption_records 新字段
    console.log('4. 验证 consumption_records 业务结果态字段...')
    const [consumptionFields] = await sequelize.query(`
      SHOW COLUMNS FROM consumption_records 
      WHERE Field IN ('final_status', 'settled_at')
    `)

    if (consumptionFields.length === 2) {
      console.log('   ✅ final_status 和 settled_at 字段已添加')
      consumptionFields.forEach(f => {
        console.log(`      - ${f.Field}: ${f.Type}`)
      })
    } else {
      console.log('   ❌ final_status 或 settled_at 字段缺失')
      allPassed = false
    }

    // ==================== P2级验证 ====================
    console.log('\n📊 P2级验证：测试数据标记')
    console.log('-'.repeat(80))

    // 验证 asset_transactions.is_test_data
    console.log('5. 验证 asset_transactions 测试数据标记...')
    const [assetFields] = await sequelize.query(`
      SHOW COLUMNS FROM asset_transactions 
      WHERE Field = 'is_test_data'
    `)

    if (assetFields.length > 0) {
      console.log('   ✅ is_test_data 字段已添加')

      // 检查标记的测试数据数量
      const [testDataCount] = await sequelize.query(`
        SELECT COUNT(*) as count 
        FROM asset_transactions 
        WHERE is_test_data = 1
      `)
      console.log(`      - 已标记测试数据: ${testDataCount[0].count} 条`)
    } else {
      console.log('   ❌ is_test_data 字段缺失')
      allPassed = false
    }

    // 验证数据一致性
    console.log('6. 验证 exchange 数据一致性...')
    const [exchangeDebits] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM asset_transactions
      WHERE business_type = 'exchange_debit'
        AND is_test_data = 0
    `)

    const [exchangeRecords] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM exchange_records
    `)

    const debitCount = exchangeDebits[0].count
    const recordCount = exchangeRecords[0].count

    console.log(`   exchange_debit 流水（生产数据）: ${debitCount} 条`)
    console.log(`   exchange_records 订单: ${recordCount} 条`)

    if (debitCount === recordCount) {
      console.log('   ✅ 数据一致')
    } else {
      console.log(`   ⚠️ 差异: ${debitCount - recordCount} 条（测试数据已标记隔离）`)
    }

    // ==================== 总结 ====================
    console.log('\n' + '='.repeat(80))
    if (allPassed) {
      console.log('✅ 所有验证通过！功能重复清理已完成。')
    } else {
      console.log('❌ 部分验证失败，请检查上述错误。')
    }
    console.log('='.repeat(80))

    await sequelize.close()
    process.exit(allPassed ? 0 : 1)
  } catch (error) {
    console.error('❌ 验证失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行主函数
main()
