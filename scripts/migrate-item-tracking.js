#!/usr/bin/env node
/**
 * 历史数据迁移脚本 — item_instances → items + item_ledger + item_holds
 *
 * 执行步骤：
 * 1. item_instances → items（meta JSON 中的 name/value/description 提取为正式列）
 * 2. item_instance_events(mint) → item_ledger 双录
 * 3. item_instance_events(transfer) → item_ledger 双录
 * 4. item_instance_events(use) → item_ledger 双录
 * 5. item_instances.locks JSON → item_holds 表
 * 6. 回填 source 字段 + 生成 tracking_code
 * 7. 首次对账验证
 *
 * 使用方式：node scripts/migrate-item-tracking.js [--dry-run]
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

require('dotenv').config()

const DRY_RUN = process.argv.includes('--dry-run')
const TrackingCodeGenerator = require('../utils/TrackingCodeGenerator')

async function main() {
  const { sequelize } = require('../config/database')
  const models = require('../models')
  const { Item, ItemLedger, ItemHold, Account } = models

  console.log(`\n=== 历史数据迁移：item_instances → 三表模型 ===`)
  console.log(`模式：${DRY_RUN ? '🔍 干跑模式（不写入数据）' : '🚀 实际执行'}`)

  // 获取系统账户
  const mintAccount = await Account.findOne({ where: { system_code: 'SYSTEM_MINT' } })
  const burnAccount = await Account.findOne({ where: { system_code: 'SYSTEM_BURN' } })

  if (!mintAccount || !burnAccount) {
    console.error('❌ 系统账户不存在，请先执行基础迁移')
    process.exit(1)
  }

  console.log(`  SYSTEM_MINT account_id: ${mintAccount.account_id}`)
  console.log(`  SYSTEM_BURN account_id: ${burnAccount.account_id}`)

  // Step 1: 统计源数据
  const [[{ total_instances: totalInstances }]] = await sequelize.query(
    'SELECT COUNT(*) AS total_instances FROM item_instances'
  )
  const [[{ total_events: totalEvents }]] = await sequelize.query(
    'SELECT COUNT(*) AS total_events FROM item_instance_events'
  )
  const [[{ existing_items: existingItems }]] = await sequelize.query(
    'SELECT COUNT(*) AS existing_items FROM items'
  )

  console.log(`\n  源数据：${totalInstances} 条物品实例，${totalEvents} 条事件`)
  console.log(`  目标表现有数据：${existingItems} 条`)

  if (Number(existingItems) > 0) {
    console.log('  ⚠️ items 表已有数据，跳过迁移（避免重复）')
    await runReconciliation(sequelize)
    await sequelize.close()
    return
  }

  if (DRY_RUN) {
    console.log('\n🔍 干跑模式完成，未写入任何数据')
    await sequelize.close()
    return
  }

  const transaction = await sequelize.transaction()

  try {
    // Step 2: 迁移 item_instances → items
    console.log('\n📦 Step 2: 迁移物品实例到 items 表...')
    const [instances] = await sequelize.query(
      `SELECT ii.*, a.account_id 
       FROM item_instances ii
       LEFT JOIN accounts a ON a.user_id = ii.owner_user_id AND a.account_type = 'user'
       ORDER BY ii.item_instance_id`,
      { transaction }
    )

    let migratedCount = 0
    for (const inst of instances) {
      const meta = typeof inst.meta === 'string' ? JSON.parse(inst.meta || '{}') : (inst.meta || {})

      // 从 meta 提取正式列
      const itemName = meta.name || meta.item_name || `物品#${inst.item_instance_id}`
      const itemDescription = meta.description || ''
      const itemValue = Math.round(parseFloat(meta.value) || 0)
      const prizeDefId = meta.lottery_prize_id || null

      // 确定 source
      let source = inst.source || 'legacy'
      if (source === 'unknown') source = 'legacy'

      // 确定 owner_account_id
      const ownerAccountId = inst.account_id || mintAccount.account_id

      // 状态映射：locked → held, transferred → available(已转给别人)
      let status = inst.status
      if (status === 'locked') status = 'held'
      if (status === 'transferred') status = 'available'

      const item = await Item.create({
        tracking_code: 'TEMP_' + inst.item_instance_id,
        owner_account_id: ownerAccountId,
        status,
        item_type: inst.item_type || 'product',
        item_name: itemName,
        item_description: itemDescription,
        item_value: itemValue,
        prize_definition_id: prizeDefId,
        rarity_code: 'common',
        source,
        source_ref_id: null,
        created_at: inst.created_at,
        updated_at: inst.updated_at
      }, { transaction })

      // 生成 tracking_code
      const trackingCode = TrackingCodeGenerator.generate({
        item_id: item.item_id,
        source,
        created_at: inst.created_at
      })
      await item.update({ tracking_code: trackingCode }, { transaction })

      migratedCount++
      if (migratedCount % 500 === 0) {
        console.log(`    已迁移 ${migratedCount}/${instances.length} 条`)
      }
    }
    console.log(`  ✅ 物品实例迁移完成：${migratedCount} 条`)

    // Step 3: 迁移事件 → item_ledger 双录
    console.log('\n📦 Step 3: 迁移事件到 item_ledger 双录...')
    const [events] = await sequelize.query(
      `SELECT iie.*, 
              a_owner_before.account_id AS before_account_id,
              a_owner_after.account_id AS after_account_id
       FROM item_instance_events iie
       LEFT JOIN accounts a_owner_before ON a_owner_before.user_id = iie.owner_before AND a_owner_before.account_type = 'user'
       LEFT JOIN accounts a_owner_after ON a_owner_after.user_id = iie.owner_after AND a_owner_after.account_type = 'user'
       ORDER BY iie.created_at`,
      { transaction }
    )

    // 建立 item_instance_id → item_id 映射
    const [mapping] = await sequelize.query(
      'SELECT item_id, tracking_code FROM items ORDER BY item_id',
      { transaction }
    )
    const instanceToItemMap = new Map()
    for (let i = 0; i < instances.length; i++) {
      if (mapping[i]) {
        instanceToItemMap.set(Number(instances[i].item_instance_id), Number(mapping[i].item_id))
      }
    }

    let ledgerCount = 0
    const ledgerBatch = []

    for (const event of events) {
      const itemId = instanceToItemMap.get(Number(event.item_instance_id))
      if (!itemId) continue

      let outAccountId, inAccountId

      switch (event.event_type) {
        case 'mint':
          outAccountId = mintAccount.account_id
          inAccountId = event.after_account_id || mintAccount.account_id
          break
        case 'transfer':
          outAccountId = event.before_account_id || mintAccount.account_id
          inAccountId = event.after_account_id || mintAccount.account_id
          break
        case 'use':
          outAccountId = event.before_account_id || event.after_account_id || mintAccount.account_id
          inAccountId = burnAccount.account_id
          break
        default:
          continue
      }

      const idempKey = event.idempotency_key || `migration_${event.event_id}`

      ledgerBatch.push(
        {
          item_id: itemId,
          account_id: outAccountId,
          delta: -1,
          counterpart_id: inAccountId,
          event_type: event.event_type,
          operator_id: event.operator_user_id || null,
          operator_type: event.operator_type || 'system',
          business_type: event.business_type || 'data_migration',
          idempotency_key: `${idempKey}:out`,
          meta: { migrated_from: 'item_instance_events', original_event_id: event.event_id },
          created_at: event.created_at
        },
        {
          item_id: itemId,
          account_id: inAccountId,
          delta: 1,
          counterpart_id: outAccountId,
          event_type: event.event_type,
          operator_id: event.operator_user_id || null,
          operator_type: event.operator_type || 'system',
          business_type: event.business_type || 'data_migration',
          idempotency_key: `${idempKey}:in`,
          meta: { migrated_from: 'item_instance_events', original_event_id: event.event_id },
          created_at: event.created_at
        }
      )

      ledgerCount++
      if (ledgerBatch.length >= 1000) {
        await ItemLedger.bulkCreate(ledgerBatch, { transaction })
        ledgerBatch.length = 0
      }
    }

    if (ledgerBatch.length > 0) {
      await ItemLedger.bulkCreate(ledgerBatch, { transaction })
    }
    console.log(`  ✅ 事件双录迁移完成：${ledgerCount} 条事件 → ${ledgerCount * 2} 条账本条目`)

    // Step 4: 迁移 locks JSON → item_holds
    console.log('\n📦 Step 4: 迁移 JSON locks 到 item_holds...')
    let holdsCount = 0
    for (const inst of instances) {
      const locks = typeof inst.locks === 'string' ? JSON.parse(inst.locks || '[]') : (inst.locks || [])
      if (!Array.isArray(locks) || locks.length === 0) continue

      const itemId = instanceToItemMap.get(Number(inst.item_instance_id))
      if (!itemId) continue

      for (const lock of locks) {
        const holdPriority = { trade: 1, redemption: 2, security: 3 }
        await ItemHold.create({
          item_id: itemId,
          hold_type: lock.lock_type || 'trade',
          holder_ref: lock.lock_id || `legacy_${inst.item_instance_id}`,
          priority: holdPriority[lock.lock_type] || 1,
          status: 'active',
          reason: lock.reason || '从 JSON locks 迁移',
          expires_at: lock.expires_at || null,
          created_at: lock.locked_at || inst.created_at
        }, { transaction })
        holdsCount++
      }
    }
    console.log(`  ✅ JSON locks 迁移完成：${holdsCount} 条锁定记录`)

    await transaction.commit()
    console.log('\n✅ 全部迁移已提交')

    // Step 5: 对账验证
    await runReconciliation(sequelize)
  } catch (error) {
    await transaction.rollback()
    console.error('\n❌ 迁移失败，已回滚：', error.message)
    console.error(error.stack)
  }

  await sequelize.close()
}

/**
 * 首次对账验证
 */
async function runReconciliation(sequelize) {
  console.log('\n=== 对账验证 ===')

  const [[{ item_count: itemCount }]] = await sequelize.query('SELECT COUNT(*) AS item_count FROM items')
  const [[{ ledger_count: ledgerCount }]] = await sequelize.query('SELECT COUNT(*) AS ledger_count FROM item_ledger')
  const [[{ hold_count: holdCount }]] = await sequelize.query('SELECT COUNT(*) AS hold_count FROM item_holds')

  console.log(`  items: ${itemCount} 条`)
  console.log(`  item_ledger: ${ledgerCount} 条`)
  console.log(`  item_holds: ${holdCount} 条`)

  // 物品守恒检查
  const [imbalanced] = await sequelize.query(`
    SELECT item_id, SUM(delta) AS balance
    FROM item_ledger
    GROUP BY item_id
    HAVING balance != 0
  `)

  if (imbalanced.length === 0) {
    console.log('  ✅ 物品守恒检查通过：所有物品 SUM(delta) = 0')
  } else {
    console.log(`  ❌ 物品守恒检查失败：${imbalanced.length} 个物品不平衡`)
    imbalanced.slice(0, 5).forEach(r => {
      console.log(`    item_id=${r.item_id}, balance=${r.balance}`)
    })
  }
}

main().catch(err => {
  console.error('脚本执行失败:', err)
  process.exit(1)
})
