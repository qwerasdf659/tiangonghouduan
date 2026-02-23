#!/usr/bin/env node
/**
 * 测试数据精准清理脚本（方案 C）
 *
 * 功能：清理 asset_transactions 表中 business_type 以 'test_' 开头的测试记录，
 *       并修正因测试数据产生的余额偏差
 *
 * 执行步骤：
 *   1. 标记：将 business_type LIKE 'test_%' 且未标记的记录标记为 is_test_data = 1
 *   2. 统计：计算受影响账户的余额偏差
 *   3. 修正：从 account_asset_balances.available_amount 中扣除偏差
 *   4. 验证：对比余额一致性
 *   5. 删除：DELETE FROM asset_transactions WHERE is_test_data = 1
 *   6. 最终验证：确认无测试数据残留
 *
 * 执行方式：
 *   node scripts/maintenance/cleanup_test_data.js --dry-run     # 预览影响
 *   node scripts/maintenance/cleanup_test_data.js --mark         # 仅标记
 *   node scripts/maintenance/cleanup_test_data.js --fix-balance  # 标记 + 修正余额
 *   node scripts/maintenance/cleanup_test_data.js --verify       # 验证余额一致性
 *   node scripts/maintenance/cleanup_test_data.js --delete       # 删除 + 最终验证
 *   node scripts/maintenance/cleanup_test_data.js --all          # 完整执行 1-6 步
 *
 * @since 2026-02-22
 * @version 1.0.0
 */

'use strict'

const path = require('path')

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

/**
 * 获取北京时间格式化字符串
 * @returns {string} 北京时间字符串
 */
function getBeijingTime() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/**
 * 打印分隔线标题
 * @param {string} title - 标题
 * @returns {void}
 */
function printSection(title) {
  console.log('')
  console.log(`--- ${title} ---`)
}

/**
 * 第 1 步：标记测试数据
 * 将所有 business_type LIKE 'test_%' 且 is_test_data != 1 的记录标记为 is_test_data = 1
 *
 * @param {Object} sequelize - Sequelize 数据库实例
 * @param {boolean} dryRun - 是否为预览模式
 * @returns {Promise<number>} 标记的记录数
 */
async function stepMark(sequelize, dryRun) {
  printSection('第 1 步：标记测试数据')

  const [distRaw] = await sequelize.query(`
    SELECT business_type, COUNT(*) as cnt 
    FROM asset_transactions 
    WHERE business_type LIKE 'test_%'
    GROUP BY business_type
    ORDER BY cnt DESC
  `)

  const totalTestRecords = distRaw.reduce((sum, r) => sum + parseInt(r.cnt, 10), 0)
  console.log(`  test_* 记录总数: ${totalTestRecords}`)
  console.log(`  business_type 分布 (${distRaw.length} 种):`)
  distRaw.forEach(r => {
    console.log(`    ${r.business_type}: ${r.cnt}`)
  })

  const [unflaggedRaw] = await sequelize.query(`
    SELECT COUNT(*) as cnt 
    FROM asset_transactions 
    WHERE business_type LIKE 'test_%' AND (is_test_data = 0 OR is_test_data IS NULL)
  `)
  const unflaggedCount = parseInt(unflaggedRaw[0].cnt, 10)
  console.log(`  未标记的 test_* 记录: ${unflaggedCount}`)

  if (unflaggedCount === 0) {
    console.log('  ✅ 所有 test_* 记录已标记，无需操作')
    return 0
  }

  if (dryRun) {
    console.log(`  📋 预览模式：将标记 ${unflaggedCount} 条记录（未执行）`)
    return unflaggedCount
  }

  const [updateResult] = await sequelize.query(`
    UPDATE asset_transactions 
    SET is_test_data = 1 
    WHERE business_type LIKE 'test_%' AND (is_test_data = 0 OR is_test_data IS NULL)
  `)
  const affected = updateResult.affectedRows || 0
  console.log(`  ✅ 已标记 ${affected} 条记录为 is_test_data = 1`)
  return affected
}

/**
 * 第 2-3 步：计算并修正余额偏差
 * 计算每个 (account_id, asset_code) 因测试数据产生的 delta_amount 偏差，
 * 并从 account_asset_balances 中修正
 *
 * @param {Object} sequelize - Sequelize 数据库实例
 * @param {boolean} dryRun - 是否为预览模式
 * @returns {Promise<Array>} 受影响的账户列表
 */
async function stepFixBalance(sequelize, dryRun) {
  printSection('第 2 步：计算余额偏差')

  const [deviations] = await sequelize.query(`
    SELECT 
      at2.account_id,
      at2.asset_code,
      CAST(SUM(at2.delta_amount) AS DECIMAL(30,4)) AS test_data_delta,
      COUNT(*) AS test_record_count
    FROM asset_transactions at2
    WHERE at2.is_test_data = 1
    GROUP BY at2.account_id, at2.asset_code
    HAVING SUM(at2.delta_amount) != 0
  `)

  if (deviations.length === 0) {
    console.log('  ✅ 无余额偏差（测试数据的 delta_amount 总和为零或无测试数据标记）')
    return []
  }

  console.log(`  发现 ${deviations.length} 组 (account_id, asset_code) 有余额偏差:`)
  deviations.forEach(d => {
    console.log(`    account_id=${d.account_id}, asset_code=${d.asset_code}: delta=${d.test_data_delta} (${d.test_record_count} 条)`)
  })

  printSection('第 3 步：修正余额')

  if (dryRun) {
    console.log('  📋 预览模式：以下余额将被修正（未执行）:')
    for (const d of deviations) {
      console.log(`    account_id=${d.account_id}, ${d.asset_code}: available_amount -= ${d.test_data_delta}`)
    }
    return deviations
  }

  const transaction = await sequelize.transaction()
  try {
    let corrected = 0
    const warnings = []

    /* eslint-disable no-await-in-loop -- 余额修正需逐条事务内顺序执行 */
    for (const d of deviations) {
      const delta = parseFloat(d.test_data_delta)

      const [currentRaw] = await sequelize.query(
        `SELECT available_amount FROM account_asset_balances 
         WHERE account_id = :account_id AND asset_code = :asset_code`,
        {
          replacements: { account_id: d.account_id, asset_code: d.asset_code },
          transaction
        }
      )

      if (currentRaw.length === 0) {
        console.log(`  ⚠️  account_id=${d.account_id}, ${d.asset_code}: 余额记录不存在，跳过`)
        continue
      }

      const currentBalance = parseFloat(currentRaw[0].available_amount)
      const newBalance = currentBalance - delta

      if (newBalance < 0) {
        warnings.push({
          account_id: d.account_id,
          asset_code: d.asset_code,
          current: currentBalance,
          delta,
          would_be: newBalance
        })
        console.log(`  ⚠️  account_id=${d.account_id}, ${d.asset_code}: 修正后余额为负 (${currentBalance} - ${delta} = ${newBalance})，需人工确认`)
        continue
      }

      await sequelize.query(
        `UPDATE account_asset_balances 
         SET available_amount = available_amount - :delta
         WHERE account_id = :account_id AND asset_code = :asset_code`,
        {
          replacements: { delta, account_id: d.account_id, asset_code: d.asset_code },
          transaction
        }
      )
      corrected++
      console.log(`  ✅ account_id=${d.account_id}, ${d.asset_code}: ${currentBalance} -> ${newBalance}`)
    }

    if (warnings.length > 0) {
      console.log(`\n  ⚠️  ${warnings.length} 组余额修正后为负，已跳过，需人工确认:`)
      warnings.forEach(w => {
        console.log(`    account_id=${w.account_id}, ${w.asset_code}: ${w.current} - ${w.delta} = ${w.would_be}`)
      })
    }

    await transaction.commit()
    console.log(`  ✅ 余额修正完成：${corrected} 组成功，${warnings.length} 组跳过`)
    return deviations
  } catch (error) {
    await transaction.rollback()
    console.error('  ❌ 余额修正失败，已回滚:', error.message)
    throw error
  }
}

/**
 * 第 4 步：验证余额一致性
 * 比对 account_asset_balances.available_amount 与 asset_transactions 非测试流水 delta 总和
 *
 * @param {Object} sequelize - Sequelize 数据库实例
 * @returns {Promise<boolean>} 是否一致
 */
async function stepVerify(sequelize) {
  printSection('第 4 步：验证余额一致性')

  const [inconsistencies] = await sequelize.query(`
    SELECT
      aab.account_id,
      aab.asset_code,
      CAST(aab.available_amount AS DECIMAL(30,4)) AS current_balance,
      CAST(COALESCE(SUM(at2.delta_amount), 0) AS DECIMAL(30,4)) AS expected_balance,
      CAST(aab.available_amount - COALESCE(SUM(at2.delta_amount), 0) AS DECIMAL(30,4)) AS difference
    FROM account_asset_balances aab
    LEFT JOIN asset_transactions at2
      ON aab.account_id = at2.account_id
      AND aab.asset_code = at2.asset_code
      AND (at2.is_test_data = 0 OR at2.is_test_data IS NULL)
    GROUP BY aab.account_id, aab.asset_code, aab.available_amount
    HAVING ABS(aab.available_amount - COALESCE(SUM(at2.delta_amount), 0)) > 0.001
  `)

  if (inconsistencies.length === 0) {
    console.log('  ✅ 所有账户余额与非测试流水一致')
    return true
  }

  console.log(`  ⚠️  发现 ${inconsistencies.length} 组余额不一致:`)
  inconsistencies.slice(0, 20).forEach(r => {
    console.log(`    account_id=${r.account_id}, ${r.asset_code}: 余额=${r.current_balance}, 期望=${r.expected_balance}, 差异=${r.difference}`)
  })

  if (inconsistencies.length > 20) {
    console.log(`    ... 还有 ${inconsistencies.length - 20} 组未显示`)
  }

  return false
}

/**
 * 第 5-6 步：删除测试数据 + 最终验证
 *
 * @param {Object} sequelize - Sequelize 数据库实例
 * @param {boolean} dryRun - 是否为预览模式
 * @returns {Promise<number>} 删除的记录数
 */
async function stepDelete(sequelize, dryRun) {
  printSection('第 5 步：删除测试数据')

  const [countRaw] = await sequelize.query(
    'SELECT COUNT(*) as cnt FROM asset_transactions WHERE is_test_data = 1'
  )
  const toDelete = parseInt(countRaw[0].cnt, 10)

  if (toDelete === 0) {
    console.log('  ✅ 无 is_test_data=1 的记录需要删除')
    return 0
  }

  if (dryRun) {
    console.log(`  📋 预览模式：将删除 ${toDelete} 条记录（未执行）`)
    return toDelete
  }

  const [deleteResult] = await sequelize.query(
    'DELETE FROM asset_transactions WHERE is_test_data = 1'
  )
  const deleted = deleteResult.affectedRows || 0
  console.log(`  ✅ 已删除 ${deleted} 条测试数据`)

  printSection('第 6 步：最终验证')

  const [remainTest] = await sequelize.query(
    "SELECT COUNT(*) as cnt FROM asset_transactions WHERE business_type LIKE 'test_%'"
  )
  const remaining = parseInt(remainTest[0].cnt, 10)
  console.log(`  test_* 残留记录: ${remaining}`)

  const [remainFlag] = await sequelize.query(
    'SELECT COUNT(*) as cnt FROM asset_transactions WHERE is_test_data = 1'
  )
  const flagged = parseInt(remainFlag[0].cnt, 10)
  console.log(`  is_test_data=1 残留: ${flagged}`)

  if (remaining === 0 && flagged === 0) {
    console.log('  ✅ 测试数据已彻底清理')
  } else {
    console.log(`  ⚠️  仍有残留数据，可能有新的 test_* 类型未在标记范围内`)
  }

  return deleted
}

/**
 * 第 7 步：清理 items 表中 source='test' 的测试物品
 * 同时清理对应的 item_ledger 和 item_holds 记录
 *
 * @param {Object} sequelize - Sequelize 数据库实例
 * @param {boolean} dryRun - 是否为预览模式
 * @returns {Promise<Object>} 清理结果
 */
async function stepCleanupTestItems(sequelize, dryRun) {
  printSection('第 7 步：清理 source=test 的测试物品')

  const [testItems] = await sequelize.query(`
    SELECT item_id, item_name, status, tracking_code, source, source_ref_id, created_at
    FROM items WHERE source = 'test'
    ORDER BY created_at DESC
  `)

  console.log(`  source='test' 物品总数: ${testItems.length}`)

  if (testItems.length === 0) {
    console.log('  ✅ 无测试物品需要清理')
    return { items_cleaned: 0 }
  }

  const statusDist = {}
  testItems.forEach(i => {
    statusDist[i.status] = (statusDist[i.status] || 0) + 1
  })
  console.log('  状态分布:')
  Object.entries(statusDist).forEach(([s, c]) => console.log(`    ${s}: ${c}`))

  console.log('  最近 5 个测试物品:')
  testItems.slice(0, 5).forEach(i => {
    console.log(`    [${i.item_id}] ${i.item_name} (${i.status}) - ${i.source_ref_id}`)
  })

  if (dryRun) {
    console.log(`  📋 预览模式：将清理 ${testItems.length} 个测试物品及关联记录（未执行）`)
    return { items_cleaned: 0, would_clean: testItems.length }
  }

  const itemIds = testItems.map(i => i.item_id)

  const transaction = await sequelize.transaction()
  try {
    // 先清理 redemption_orders（外键 RESTRICT 约束必须先清理子记录）
    const [redemptionResult] = await sequelize.query(
      'DELETE FROM redemption_orders WHERE item_id IN (:itemIds)',
      { replacements: { itemIds }, transaction }
    )
    const redemptionDeleted = redemptionResult.affectedRows || 0

    const [holdsResult] = await sequelize.query(
      'DELETE FROM item_holds WHERE item_id IN (:itemIds)',
      { replacements: { itemIds }, transaction }
    )
    const holdsDeleted = holdsResult.affectedRows || 0

    const [ledgerResult] = await sequelize.query(
      'DELETE FROM item_ledger WHERE item_id IN (:itemIds)',
      { replacements: { itemIds }, transaction }
    )
    const ledgerDeleted = ledgerResult.affectedRows || 0

    const [itemsResult] = await sequelize.query(
      'DELETE FROM items WHERE item_id IN (:itemIds)',
      { replacements: { itemIds }, transaction }
    )
    const itemsDeleted = itemsResult.affectedRows || 0

    await transaction.commit()

    console.log(`  ✅ 清理完成:`)
    console.log(`    redemption_orders: ${redemptionDeleted} 条`)
    console.log(`    item_holds: ${holdsDeleted} 条`)
    console.log(`    item_ledger: ${ledgerDeleted} 条`)
    console.log(`    items: ${itemsDeleted} 条`)

    return { items_cleaned: itemsDeleted, ledger_cleaned: ledgerDeleted, holds_cleaned: holdsDeleted, redemption_cleaned: redemptionDeleted }
  } catch (error) {
    await transaction.rollback()
    console.error('  ❌ 测试物品清理失败:', error.message)
    return { items_cleaned: 0, error: error.message }
  }
}

/**
 * 主函数：解析命令行参数，按步骤执行测试数据清理
 *
 * @returns {Promise<void>} 无返回值
 */
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const doMark = args.includes('--mark') || args.includes('--all')
  const doFixBalance = args.includes('--fix-balance') || args.includes('--all')
  const doVerify = args.includes('--verify') || args.includes('--all')
  const doDelete = args.includes('--delete') || args.includes('--all')
  const doCleanItems = args.includes('--clean-items') || args.includes('--all')

  if (!doMark && !doFixBalance && !doVerify && !doDelete && !doCleanItems && !dryRun) {
    console.log('用法:')
    console.log('  node scripts/maintenance/cleanup_test_data.js --dry-run       预览影响范围')
    console.log('  node scripts/maintenance/cleanup_test_data.js --mark           仅标记 test_* 记录')
    console.log('  node scripts/maintenance/cleanup_test_data.js --fix-balance    标记 + 修正余额')
    console.log('  node scripts/maintenance/cleanup_test_data.js --verify         验证余额一致性')
    console.log('  node scripts/maintenance/cleanup_test_data.js --delete         删除 + 最终验证')
    console.log('  node scripts/maintenance/cleanup_test_data.js --clean-items    清理 source=test 物品')
    console.log('  node scripts/maintenance/cleanup_test_data.js --all            完整执行全部步骤')
    console.log('')
    console.log('  任何步骤可追加 --dry-run 进入预览模式')
    process.exit(0)
  }

  console.log('='.repeat(60))
  console.log('  测试数据精准清理脚本（方案 C）')
  console.log('  执行时间:', getBeijingTime())
  console.log('  执行模式:', dryRun ? '预览（dry-run）' : '实际执行')
  console.log('  执行步骤:', [
    doMark && '标记',
    doFixBalance && '修正余额',
    doVerify && '验证',
    doDelete && '删除'
  ].filter(Boolean).join(' → '))
  console.log('='.repeat(60))

  const { sequelize } = require('../../config/database')

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 清理前统计
    printSection('清理前统计')
    const [beforeStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN business_type LIKE 'test_%' THEN 1 ELSE 0 END) as test_count,
        SUM(CASE WHEN is_test_data = 1 THEN 1 ELSE 0 END) as flagged_count
      FROM asset_transactions
    `)
    const stats = beforeStats[0]
    console.log(`  总记录: ${stats.total}`)
    console.log(`  test_* 记录: ${stats.test_count} (${(stats.test_count / stats.total * 100).toFixed(1)}%)`)
    console.log(`  已标记 is_test_data=1: ${stats.flagged_count}`)

    if (doMark || dryRun) {
      await stepMark(sequelize, dryRun)
    }

    if (doFixBalance) {
      if (!dryRun && !doMark) {
        // 如果未执行标记步骤，先自动标记
        await stepMark(sequelize, false)
      }
      await stepFixBalance(sequelize, dryRun)
    }

    if (doVerify || dryRun) {
      await stepVerify(sequelize)
    }

    if (doDelete) {
      if (!dryRun && !doMark) {
        await stepMark(sequelize, false)
      }
      await stepDelete(sequelize, dryRun)
    }

    if (doCleanItems) {
      await stepCleanupTestItems(sequelize, dryRun)
    }

    // 清理后统计
    printSection('清理后统计')
    const [afterStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN business_type LIKE 'test_%' THEN 1 ELSE 0 END) as test_count,
        SUM(CASE WHEN is_test_data = 1 THEN 1 ELSE 0 END) as flagged_count
      FROM asset_transactions
    `)
    const after = afterStats[0]
    console.log(`  总记录: ${after.total}`)
    console.log(`  test_* 记录: ${after.test_count}`)
    console.log(`  已标记 is_test_data=1: ${after.flagged_count}`)

    await sequelize.close()

    console.log('')
    console.log('='.repeat(60))
    if (dryRun) {
      console.log('  📋 预览模式完成，未执行实际修改')
      console.log('  💡 移除 --dry-run 参数执行实际操作')
    } else {
      console.log('  ✅ 执行完成')
    }
    console.log('  执行时间:', getBeijingTime())
    console.log('='.repeat(60))

    process.exit(0)
  } catch (error) {
    console.error('❌ 执行失败:', error.message)
    console.error('   堆栈:', error.stack)
    try {
      await sequelize.close()
    } catch {
      // 忽略关闭错误
    }
    process.exit(1)
  }
}

main()
