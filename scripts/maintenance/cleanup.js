/**
 * 系统数据清理统一工具 (Cleanup Tool)
 *
 * 功能：整合所有数据清理相关功能
 *
 * 合并来源脚本：
 * - cleanup_chat_orphans.js (清理孤儿聊天消息)
 * - cleanup-incomplete-lottery-data.js (清理不完整的抽奖数据)
 * - cleanup-remaining-date-usage.js (清理日期使用痕迹)
 * - v4_system_cleanup.js (V4系统清理)
 *
 * 使用方式：
 * node scripts/maintenance/cleanup.js --action=orphans          # 清理孤儿数据
 * node scripts/maintenance/cleanup.js --action=lottery          # 清理不完整抽奖数据
 * node scripts/maintenance/cleanup.js --action=old-sessions     # 清理过期会话
 * node scripts/maintenance/cleanup.js --action=all              # 执行所有清理
 * node scripts/maintenance/cleanup.js --dry-run                 # 预览清理但不执行
 *
 * 创建时间：2025年10月12日 北京时间
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../../config/database')
const BeijingTimeHelper = require('../../utils/timeHelper')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

/**
 * 输出带颜色的日志消息
 *
 * @param {string} message - 日志消息内容
 * @param {string} color - 颜色名称（reset/red/green/yellow/blue/cyan）
 * @returns {void}
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// ==================== 清理功能 ====================

/**
 * 清理孤儿聊天消息
 * 清理引用不存在的customer_sessions的chat_messages
 *
 * @param {boolean} dryRun - 是否预览模式（true=仅预览不执行）
 * @returns {Promise<Object>} 清理结果 { cleaned: number, preview?: number }
 */
async function cleanupOrphanMessages(dryRun = false) {
  log('\n🧹 ━━━ 清理孤儿聊天消息 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  try {
    // 查找孤儿消息
    const [orphanMessages] = await sequelize.query(`
      SELECT cm.* 
      FROM chat_messages cm
      LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
      WHERE cs.session_id IS NULL
    `)

    log(`📊 找到 ${orphanMessages.length} 条孤儿消息`, 'blue')

    if (orphanMessages.length === 0) {
      log('✅ 无孤儿消息需要清理\n', 'green')
      return { cleaned: 0 }
    }

    if (dryRun) {
      log('\n🔍 预览模式：以下消息将被删除:', 'yellow')
      orphanMessages.slice(0, 5).forEach((msg, i) => {
        log(`   ${i + 1}. message_id: ${msg.message_id}, session_id: ${msg.session_id}`, 'yellow')
      })
      if (orphanMessages.length > 5) {
        log(`   ... 还有 ${orphanMessages.length - 5} 条\n`, 'yellow')
      }
      return { cleaned: 0, preview: orphanMessages.length }
    }

    // 执行清理
    await sequelize.query(`
      DELETE cm FROM chat_messages cm
      LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
      WHERE cs.session_id IS NULL
    `)

    log(`✅ 成功清理 ${orphanMessages.length} 条孤儿消息\n`, 'green')
    return { cleaned: orphanMessages.length }
  } catch (error) {
    log(`❌ 清理失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 清理不完整的抽奖数据
 * 清理没有对应积分交易的抽奖记录
 *
 * @param {boolean} dryRun - 是否预览模式（true=仅预览不执行）
 * @returns {Promise<Object>} 清理结果 { cleaned: number, preview?: number }
 */
async function cleanupIncompleteLotteryData(dryRun = false) {
  log('\n🧹 ━━━ 清理不完整的抽奖数据 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  try {
    // 查找没有积分交易的抽奖记录
    const [incompleteDraws] = await sequelize.query(`
      SELECT ld.*
      FROM lottery_draws ld
      LEFT JOIN points_transactions pt ON ld.draw_id = pt.business_id 
        AND pt.business_type = 'lottery_consume'
      WHERE pt.transaction_id IS NULL
    `)

    // 查找没有抽奖记录的积分交易
    const [orphanTransactions] = await sequelize.query(`
      SELECT pt.*
      FROM points_transactions pt
      LEFT JOIN lottery_draws ld ON pt.business_id = ld.draw_id
      WHERE pt.business_type = 'lottery_consume'
        AND ld.draw_id IS NULL
    `)

    log(`📊 找到 ${incompleteDraws.length} 条无积分交易的抽奖记录`, 'blue')
    log(`📊 找到 ${orphanTransactions.length} 条无抽奖记录的积分交易`, 'blue')

    if (incompleteDraws.length === 0 && orphanTransactions.length === 0) {
      log('✅ 无不完整数据需要清理\n', 'green')
      return { cleaned: 0 }
    }

    if (dryRun) {
      log('\n🔍 预览模式：将清理以下数据:', 'yellow')
      log(`   - ${incompleteDraws.length} 条抽奖记录`, 'yellow')
      log(`   - ${orphanTransactions.length} 条积分交易\n`, 'yellow')
      return { cleaned: 0, preview: incompleteDraws.length + orphanTransactions.length }
    }

    const transaction = await sequelize.transaction()

    try {
      let cleaned = 0

      // 删除不完整的抽奖记录
      if (incompleteDraws.length > 0) {
        const drawIds = incompleteDraws.map(d => d.draw_id)
        await sequelize.query(`DELETE FROM lottery_draws WHERE draw_id IN (${drawIds.join(',')})`, {
          transaction
        })
        cleaned += incompleteDraws.length
      }

      // 删除孤儿积分交易
      if (orphanTransactions.length > 0) {
        const transactionIds = orphanTransactions.map(t => t.transaction_id)
        await sequelize.query(
          `DELETE FROM points_transactions WHERE transaction_id IN (${transactionIds.join(',')})`,
          { transaction }
        )
        cleaned += orphanTransactions.length
      }

      await transaction.commit()

      log(`✅ 成功清理 ${cleaned} 条不完整数据\n`, 'green')
      return { cleaned }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    log(`❌ 清理失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 资产域数据清理 ====================

/**
 * 清理冻结归属违规
 * 清理有 frozen_amount 但无对应冻结流水的脏数据
 *
 * 业务规则：
 * - 每笔冻结必须有对应的 freeze 类型流水记录
 * - 无流水的冻结视为历史迁移脏数据，直接归零
 *
 * @param {boolean} dryRun - 是否预览模式
 * @returns {Promise<Object>} 清理结果
 */
async function cleanupOrphanFrozenAssets(dryRun = false) {
  log('\n🧹 ━━━ 清理冻结归属违规 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  try {
    // 查找有冻结余额但无对应冻结流水的记录
    const [orphanFrozen] = await sequelize.query(`
      SELECT b.balance_id, a.user_id, b.asset_code, b.frozen_amount, b.available_amount
      FROM account_asset_balances b
      JOIN accounts a ON a.account_id = b.account_id
      WHERE b.frozen_amount > 0
        AND NOT EXISTS (
          SELECT 1 FROM asset_transactions t
          WHERE t.account_id = b.account_id
            AND t.asset_code = b.asset_code
            AND (t.business_type LIKE '%freeze%' OR JSON_EXTRACT(t.meta, '$.freeze_amount') IS NOT NULL)
        )
    `)

    log(`📊 找到 ${orphanFrozen.length} 条冻结归属违规记录`, 'blue')

    if (orphanFrozen.length === 0) {
      log('✅ 无冻结归属违规需要清理\n', 'green')
      return { cleaned: 0 }
    }

    // 显示详情
    orphanFrozen.forEach((f, i) => {
      log(`   ${i + 1}. user_id=${f.user_id}, ${f.asset_code} frozen=${f.frozen_amount}`, 'yellow')
    })

    if (dryRun) {
      log('\n🔍 预览模式：以上冻结将被归零（转为可用余额）\n', 'yellow')
      return { cleaned: 0, preview: orphanFrozen.length }
    }

    const transaction = await sequelize.transaction()

    try {
      let cleaned = 0

      for (const f of orphanFrozen) {
        /*
         * 将冻结归零（归零而非转为可用，因为是脏数据）
         * 如需转为可用，改为：available_amount = available_amount + frozen_amount
         */
        await sequelize.query(
          `
          UPDATE account_asset_balances
          SET frozen_amount = 0,
              updated_at = NOW()
          WHERE balance_id = ${f.balance_id}
        `,
          { transaction }
        )

        // 记录操作日志到 admin_operation_logs（如果表存在）
        try {
          await sequelize.query(
            `
            INSERT INTO admin_operation_logs (operator_id, operation_type, target_type, target_id, before_data, after_data, reason, created_at)
            VALUES (0, 'data_fix', 'account_asset_balances', ${f.balance_id},
                    '{"frozen_amount": ${f.frozen_amount}}', '{"frozen_amount": 0}',
                    '清理冻结归属违规：无对应冻结流水，归零处理', NOW())
          `,
            { transaction }
          )
        } catch (logError) {
          // 如果 admin_operation_logs 表不存在，忽略日志记录错误
          log(`   ⚠️ 操作日志记录失败: ${logError.message}`, 'yellow')
        }

        cleaned++
        log(`   ✅ user_id=${f.user_id}, ${f.asset_code}: ${f.frozen_amount} → 0`, 'green')
      }

      await transaction.commit()

      log(`\n✅ 成功清理 ${cleaned} 条冻结归属违规\n`, 'green')
      return { cleaned }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    log(`❌ 清理失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 清理孤儿锁
 * 释放状态为 locked 但无对应 pending 订单的物品实例
 *
 * 业务规则：
 * - locked 物品必须有对应的 pending/frozen 订单
 * - 无对应订单的锁视为孤儿锁，需释放
 *
 * @param {boolean} dryRun - 是否预览模式
 * @returns {Promise<Object>} 清理结果
 */
async function cleanupOrphanItemLocks(dryRun = false) {
  log('\n🧹 ━━━ 清理孤儿锁 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  try {
    // 查找孤儿锁
    const [orphanLocks] = await sequelize.query(`
      SELECT i.item_instance_id, i.owner_user_id, i.locked_by_order_id, i.locked_at,
             TIMESTAMPDIFF(SECOND, i.locked_at, NOW()) as locked_seconds
      FROM item_instances i
      WHERE i.status = 'locked'
        AND NOT EXISTS (
          SELECT 1 FROM redemption_orders r
          WHERE r.order_id = i.locked_by_order_id AND r.status = 'pending'
        )
        AND NOT EXISTS (
          SELECT 1 FROM trade_orders t
          WHERE t.order_id = i.locked_by_order_id AND t.status = 'frozen'
        )
    `)

    log(`📊 找到 ${orphanLocks.length} 条孤儿锁`, 'blue')

    if (orphanLocks.length === 0) {
      log('✅ 无孤儿锁需要清理\n', 'green')
      return { cleaned: 0 }
    }

    // 显示详情
    orphanLocks.forEach((l, i) => {
      const hours = Math.floor(Math.abs(l.locked_seconds) / 3600)
      const mins = Math.floor((Math.abs(l.locked_seconds) % 3600) / 60)
      log(
        `   ${i + 1}. item=${l.item_instance_id}, owner=${l.owner_user_id}, order=${l.locked_by_order_id}, 锁定=${hours}h${mins}m`,
        'yellow'
      )
    })

    if (dryRun) {
      log('\n🔍 预览模式：以上物品将被解锁\n', 'yellow')
      return { cleaned: 0, preview: orphanLocks.length }
    }

    const transaction = await sequelize.transaction()

    try {
      // 批量释放孤儿锁
      const itemIds = orphanLocks.map(l => l.item_instance_id)
      await sequelize.query(
        `
        UPDATE item_instances
        SET status = 'available', locked_by_order_id = NULL, locked_at = NULL, updated_at = NOW()
        WHERE item_instance_id IN (${itemIds.join(',')})
      `,
        { transaction }
      )

      // 记录解锁事件到 item_instance_events
      for (const l of orphanLocks) {
        const businessId = `orphan_cleanup_${l.item_instance_id}_${Date.now()}`
        await sequelize.query(
          `
          INSERT INTO item_instance_events
          (item_instance_id, event_type, operator_user_id, operator_type, status_before, status_after,
           owner_before, owner_after, business_type, business_id, meta, created_at)
          VALUES (${l.item_instance_id}, 'unlock', NULL, 'system', 'locked', 'available',
                  ${l.owner_user_id}, ${l.owner_user_id}, 'orphan_lock_cleanup', '${businessId}',
                  '{"reason": "孤儿锁清理：无对应订单", "previous_order_id": "${l.locked_by_order_id}"}', NOW())
        `,
          { transaction }
        )
      }

      await transaction.commit()

      log(`\n✅ 成功释放 ${orphanLocks.length} 个孤儿锁\n`, 'green')
      return { cleaned: orphanLocks.length }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    log(`❌ 清理失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 清理超时锁
 * 释放锁定超过 3 分钟的物品实例
 *
 * 业务规则：
 * - 物品锁定超时时间为 3 分钟（180 秒）
 * - 超时后自动释放锁定
 *
 * @param {boolean} dryRun - 是否预览模式
 * @returns {Promise<Object>} 清理结果
 */
async function cleanupTimeoutItemLocks(dryRun = false) {
  log('\n🧹 ━━━ 清理超时锁 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  const LOCK_TIMEOUT_SECONDS = 180 // 3 分钟

  try {
    // 查找超时锁
    const [timeoutLocks] = await sequelize.query(`
      SELECT i.item_instance_id, i.owner_user_id, i.locked_by_order_id, i.locked_at,
             TIMESTAMPDIFF(SECOND, i.locked_at, NOW()) as locked_seconds
      FROM item_instances i
      WHERE i.status = 'locked'
        AND TIMESTAMPDIFF(SECOND, i.locked_at, NOW()) > ${LOCK_TIMEOUT_SECONDS}
    `)

    log(`📊 找到 ${timeoutLocks.length} 条超时锁（超过 ${LOCK_TIMEOUT_SECONDS / 60} 分钟）`, 'blue')

    if (timeoutLocks.length === 0) {
      log('✅ 无超时锁需要清理\n', 'green')
      return { cleaned: 0 }
    }

    // 显示详情
    timeoutLocks.forEach((l, i) => {
      const hours = Math.floor(l.locked_seconds / 3600)
      const mins = Math.floor((l.locked_seconds % 3600) / 60)
      log(
        `   ${i + 1}. item=${l.item_instance_id}, owner=${l.owner_user_id}, 锁定=${hours}h${mins}m`,
        'yellow'
      )
    })

    if (dryRun) {
      log('\n🔍 预览模式：以上物品将被解锁\n', 'yellow')
      return { cleaned: 0, preview: timeoutLocks.length }
    }

    const transaction = await sequelize.transaction()

    try {
      // 批量释放超时锁
      const itemIds = timeoutLocks.map(l => l.item_instance_id)
      await sequelize.query(
        `
        UPDATE item_instances
        SET status = 'available', locked_by_order_id = NULL, locked_at = NULL, updated_at = NOW()
        WHERE item_instance_id IN (${itemIds.join(',')})
      `,
        { transaction }
      )

      // 记录解锁事件到 item_instance_events
      for (const l of timeoutLocks) {
        const businessId = `timeout_cleanup_${l.item_instance_id}_${Date.now()}`
        const timeoutMinutes = LOCK_TIMEOUT_SECONDS / 60
        await sequelize.query(
          `
          INSERT INTO item_instance_events
          (item_instance_id, event_type, operator_user_id, operator_type, status_before, status_after,
           owner_before, owner_after, business_type, business_id, meta, created_at)
          VALUES (${l.item_instance_id}, 'unlock', NULL, 'system', 'locked', 'available',
                  ${l.owner_user_id}, ${l.owner_user_id}, 'timeout_lock_cleanup', '${businessId}',
                  '{"reason": "超时锁清理：锁定超过${timeoutMinutes}分钟", "locked_seconds": ${l.locked_seconds}, "previous_order_id": "${l.locked_by_order_id}"}', NOW())
        `,
          { transaction }
        )
      }

      await transaction.commit()

      log(`\n✅ 成功释放 ${timeoutLocks.length} 个超时锁\n`, 'green')
      return { cleaned: timeoutLocks.length }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    log(`❌ 清理失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 清理资产域所有脏数据
 * 执行冻结归属违规清理、孤儿锁清理、超时锁清理
 *
 * @param {boolean} dryRun - 是否预览模式
 * @returns {Promise<Object>} 清理结果
 */
async function cleanupAssetDomain(dryRun = false) {
  log('\n🧹 ━━━ 资产域数据清理 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  const results = {
    orphanFrozen: null,
    orphanLocks: null,
    timeoutLocks: null,
    total: 0
  }

  try {
    // 1. 清理冻结归属违规
    results.orphanFrozen = await cleanupOrphanFrozenAssets(dryRun)
    results.total += results.orphanFrozen.cleaned || results.orphanFrozen.preview || 0

    // 2. 清理孤儿锁
    results.orphanLocks = await cleanupOrphanItemLocks(dryRun)
    results.total += results.orphanLocks.cleaned || results.orphanLocks.preview || 0

    // 3. 清理超时锁
    results.timeoutLocks = await cleanupTimeoutItemLocks(dryRun)
    results.total += results.timeoutLocks.cleaned || results.timeoutLocks.preview || 0

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')
    log('📊 资产域清理总结', 'cyan')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')
    log(
      `冻结归属违规: ${results.orphanFrozen.cleaned || results.orphanFrozen.preview || 0}`,
      'blue'
    )
    log(`孤儿锁: ${results.orphanLocks.cleaned || results.orphanLocks.preview || 0}`, 'blue')
    log(`超时锁: ${results.timeoutLocks.cleaned || results.timeoutLocks.preview || 0}`, 'blue')
    log(`总计: ${results.total} 条记录`, dryRun ? 'yellow' : 'green')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan')

    return results
  } catch (error) {
    log(`❌ 资产域清理失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 清理过期会话
 * 清理超过30天的过期用户会话
 *
 * @param {boolean} dryRun - 是否预览模式（true=仅预览不执行）
 * @returns {Promise<Object>} 清理结果 { cleaned: number, preview?: number }
 */
async function cleanupOldSessions(dryRun = false) {
  log('\n🧹 ━━━ 清理过期会话 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  try {
    // 计算30天前的时间
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const cutoffDate = thirtyDaysAgo.toISOString().slice(0, 19).replace('T', ' ')

    // 查找过期会话
    const [oldSessions] = await sequelize.query(`
      SELECT * FROM user_sessions
      WHERE expires_at < '${cutoffDate}'
        OR (last_activity < '${cutoffDate}' AND expires_at < NOW())
    `)

    log(`📊 找到 ${oldSessions.length} 个过期会话`, 'blue')

    if (oldSessions.length === 0) {
      log('✅ 无过期会话需要清理\n', 'green')
      return { cleaned: 0 }
    }

    if (dryRun) {
      log(`\n🔍 预览模式：将清理 ${oldSessions.length} 个过期会话\n`, 'yellow')
      return { cleaned: 0, preview: oldSessions.length }
    }

    // 执行清理
    await sequelize.query(`
      DELETE FROM user_sessions
      WHERE expires_at < '${cutoffDate}'
        OR (last_activity < '${cutoffDate}' AND expires_at < NOW())
    `)

    log(`✅ 成功清理 ${oldSessions.length} 个过期会话\n`, 'green')
    return { cleaned: oldSessions.length }
  } catch (error) {
    log(`❌ 清理失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 执行所有清理任务
 *
 * @param {boolean} dryRun - 是否预览模式（true=仅预览不执行）
 * @returns {Promise<Object>} 清理结果汇总
 */
async function cleanupAll(dryRun = false) {
  log('\n🧹 ━━━ 执行所有清理任务 ━━━', 'cyan')
  log(`执行时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际清理'}\n`, 'blue')

  const results = {
    orphans: null,
    lottery: null,
    sessions: null,
    assetDomain: null,
    total: 0
  }

  try {
    // 1. 清理孤儿消息
    results.orphans = await cleanupOrphanMessages(dryRun)
    results.total += results.orphans.cleaned || results.orphans.preview || 0

    // 2. 清理不完整抽奖数据
    results.lottery = await cleanupIncompleteLotteryData(dryRun)
    results.total += results.lottery.cleaned || results.lottery.preview || 0

    // 3. 清理过期会话
    results.sessions = await cleanupOldSessions(dryRun)
    results.total += results.sessions.cleaned || results.sessions.preview || 0

    // 4. 清理资产域脏数据（冻结归属违规、孤儿锁、超时锁）
    results.assetDomain = await cleanupAssetDomain(dryRun)
    results.total += results.assetDomain.total || 0

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')
    log('📊 清理任务总结', 'cyan')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')
    log(`孤儿消息: ${results.orphans.cleaned || results.orphans.preview || 0}`, 'blue')
    log(`不完整抽奖数据: ${results.lottery.cleaned || results.lottery.preview || 0}`, 'blue')
    log(`过期会话: ${results.sessions.cleaned || results.sessions.preview || 0}`, 'blue')
    log(`资产域脏数据: ${results.assetDomain.total || 0}`, 'blue')
    log(`总计: ${results.total} 条记录`, dryRun ? 'yellow' : 'green')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan')

    return results
  } catch (error) {
    log(`❌ 清理任务失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 显示帮助信息
 *
 * @returns {void}
 */
function showHelp() {
  console.log(`
系统数据清理统一工具 (Cleanup Tool)

用法:
  node scripts/maintenance/cleanup.js [选项]

选项:
  --action=orphans        清理孤儿聊天消息
  --action=lottery        清理不完整的抽奖数据
  --action=old-sessions   清理过期会话（30天前）
  --action=asset-domain   清理资产域脏数据（冻结归属、孤儿锁、超时锁）
  --action=frozen         仅清理冻结归属违规
  --action=orphan-locks   仅清理孤儿锁
  --action=timeout-locks  仅清理超时锁
  --action=all            执行所有清理任务
  --dry-run               预览模式（不实际删除数据）
  --help                  显示此帮助信息

示例:
  # 预览资产域清理
  node scripts/maintenance/cleanup.js --action=asset-domain --dry-run

  # 实际清理资产域脏数据
  node scripts/maintenance/cleanup.js --action=asset-domain

  # 仅清理超时锁
  node scripts/maintenance/cleanup.js --action=timeout-locks

  # 执行所有清理任务
  node scripts/maintenance/cleanup.js --action=all

清理说明:
  1. 孤儿消息：清理引用不存在会话的聊天消息
  2. 不完整抽奖数据：清理没有对应积分交易的抽奖记录
  3. 过期会话：清理超过30天的过期用户会话
  4. 资产域清理：
     - 冻结归属违规：有 frozen_amount 但无冻结流水的记录
     - 孤儿锁：locked 状态但无对应订单的物品
     - 超时锁：锁定超过3分钟的物品

注意事项:
  1. 建议先使用 --dry-run 预览清理结果
  2. 清理操作不可逆，请谨慎使用
  3. 建议定期（每月）执行清理任务
  4. 清理前建议先备份数据
`)
}

// ==================== 主函数 ====================

/**
 * 主函数入口
 * 解析命令行参数并执行对应的清理任务
 *
 * @returns {Promise<void>} 清理完成后退出进程
 */
async function main() {
  const args = process.argv.slice(2)

  // 解析参数
  const options = {}
  args.forEach(arg => {
    if (arg === '--help') {
      options.help = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      options[key] = value || true
    }
  })

  // 显示帮助
  if (options.help || !options.action) {
    showHelp()
    process.exit(0)
  }

  try {
    // 验证数据库连接
    await sequelize.authenticate()
    log('✅ 数据库连接成功\n', 'green')

    switch (options.action) {
      case 'orphans':
        await cleanupOrphanMessages(options.dryRun)
        break

      case 'lottery':
        await cleanupIncompleteLotteryData(options.dryRun)
        break

      case 'old-sessions':
        await cleanupOldSessions(options.dryRun)
        break

      case 'all':
        await cleanupAll(options.dryRun)
        break

      case 'asset-domain':
        await cleanupAssetDomain(options.dryRun)
        break

      case 'frozen':
        await cleanupOrphanFrozenAssets(options.dryRun)
        break

      case 'orphan-locks':
        await cleanupOrphanItemLocks(options.dryRun)
        break

      case 'timeout-locks':
        await cleanupTimeoutItemLocks(options.dryRun)
        break

      default:
        log(`❌ 未知操作: ${options.action}`, 'red')
        log('使用 --help 查看帮助信息', 'yellow')
        process.exit(1)
    }

    log('✅ 清理操作完成\n', 'green')
    process.exit(0)
  } catch (error) {
    log(`\n❌ 操作失败: ${error.message}`, 'red')
    console.error(error.stack)
    process.exit(1)
  } finally {
    // 确保关闭数据库连接
    try {
      await sequelize.close()
    } catch (e) {
      // 忽略关闭错误
    }
  }
}

// 执行主函数
if (require.main === module) {
  main()
}

module.exports = {
  cleanupOrphanMessages,
  cleanupIncompleteLotteryData,
  cleanupOldSessions,
  cleanupAll,
  cleanupOrphanFrozenAssets,
  cleanupOrphanItemLocks,
  cleanupTimeoutItemLocks,
  cleanupAssetDomain
}
