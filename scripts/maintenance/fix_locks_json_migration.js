/**
 * 历史数据修复脚本：locks JSON 多级锁定迁移验证与修复
 *
 * 功能：
 * 1. 验证迁移后的 locks JSON 数据格式正确性
 * 2. 修复可能的迁移遗漏（locked 状态但 locks 为空）
 * 3. 清理残留的旧格式数据
 * 4. 生成迁移报告
 *
 * 使用方式：
 * - 预览模式：node scripts/maintenance/fix-locks-json-migration.js --dry-run
 * - 执行修复：node scripts/maintenance/fix-locks-json-migration.js
 *
 * 创建时间：2026-01-03
 */

'use strict'

const { Sequelize } = require('sequelize')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// 北京时间格式化
function formatBeijingTime(date = new Date()) {
  const offset = 8 * 60 * 60 * 1000
  const beijingDate = new Date(date.getTime() + offset)
  return beijingDate.toISOString().replace('Z', '+08:00')
}

/**
 * 验证并修复 locks JSON 迁移数据
 */
async function validateAndFixLocksMigration(dryRun = true) {
  log('\n' + '='.repeat(80), 'cyan')
  log('🔧 locks JSON 多级锁定迁移验证与修复脚本', 'cyan')
  log('='.repeat(80), 'cyan')
  log(`执行时间: ${formatBeijingTime()}`, 'blue')
  log(`执行模式: ${dryRun ? 'DRY-RUN（预览）' : '实际修复'}`, 'blue')
  log('')

  // 直接创建 Sequelize 实例（避免循环依赖）
  const sequelize = new Sequelize(
    process.env.DB_NAME || 'lottery_test',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: false,
      timezone: '+08:00'
    }
  )

  const report = {
    total_locked_items: 0,
    valid_locks: 0,
    missing_locks: 0,
    invalid_format: 0,
    fixed_count: 0,
    errors: []
  }

  try {
    await sequelize.authenticate()
    log('✅ 数据库连接成功\n', 'green')

    // 1. 检查 locks 字段是否存在
    log('📊 Step 1: 检查数据库结构...', 'cyan')
    const [columns] = await sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'item_instances'
        AND COLUMN_NAME = 'locks'
    `)

    if (columns.length === 0) {
      log('❌ locks 字段不存在，请先运行数据库迁移', 'red')
      log('   运行命令: npx sequelize-cli db:migrate', 'yellow')
      return report
    }
    log('   ✅ locks 字段已存在', 'green')

    // 2. 统计锁定状态的物品
    log('\n📊 Step 2: 统计锁定状态物品...', 'cyan')
    const [lockedItems] = await sequelize.query(`
      SELECT item_instance_id, owner_user_id, status, locks
      FROM item_instances
      WHERE status = 'locked'
    `)
    report.total_locked_items = lockedItems.length
    log(`   找到 ${lockedItems.length} 个锁定状态的物品`, 'blue')

    // 3. 验证 locks JSON 格式
    log('\n📊 Step 3: 验证 locks JSON 格式...', 'cyan')
    const issues = []

    for (const item of lockedItems) {
      const locks = item.locks

      // 检查 locks 是否为空
      if (!locks || (Array.isArray(locks) && locks.length === 0)) {
        issues.push({
          item_instance_id: item.item_instance_id,
          owner_user_id: item.owner_user_id,
          issue: 'missing_locks',
          description: 'status=locked 但 locks 为空'
        })
        report.missing_locks++
        continue
      }

      // 解析 locks JSON
      let locksArray
      try {
        locksArray = typeof locks === 'string' ? JSON.parse(locks) : locks
      } catch {
        issues.push({
          item_instance_id: item.item_instance_id,
          owner_user_id: item.owner_user_id,
          issue: 'invalid_json',
          description: 'locks JSON 解析失败',
          raw_value: locks
        })
        report.invalid_format++
        continue
      }

      // 验证每个锁的格式
      let hasValidLock = false
      for (const lock of locksArray) {
        if (!lock.lock_type || !lock.lock_id) {
          issues.push({
            item_instance_id: item.item_instance_id,
            owner_user_id: item.owner_user_id,
            issue: 'incomplete_lock',
            description: '锁缺少必要字段 lock_type 或 lock_id',
            lock
          })
          report.invalid_format++
        } else {
          hasValidLock = true
        }
      }

      if (hasValidLock) {
        report.valid_locks++
      }
    }

    // 4. 显示问题汇总
    log('\n📊 Step 4: 问题汇总...', 'cyan')
    log(`   有效锁定: ${report.valid_locks}`, 'green')
    log(`   缺失锁定: ${report.missing_locks}`, report.missing_locks > 0 ? 'yellow' : 'green')
    log(`   格式错误: ${report.invalid_format}`, report.invalid_format > 0 ? 'red' : 'green')

    if (issues.length > 0) {
      log('\n📋 问题详情:', 'yellow')
      issues.slice(0, 10).forEach((issue, i) => {
        log(`   ${i + 1}. item_id=${issue.item_instance_id}: ${issue.description}`, 'yellow')
      })
      if (issues.length > 10) {
        log(`   ... 还有 ${issues.length - 10} 个问题`, 'yellow')
      }
    }

    // 5. 修复缺失的锁定
    if (!dryRun && report.missing_locks > 0) {
      log('\n🔧 Step 5: 修复缺失的锁定...', 'cyan')

      const missingLockItems = issues.filter(i => i.issue === 'missing_locks')
      const transaction = await sequelize.transaction()

      try {
        for (const item of missingLockItems) {
          // 设置状态为 available（因为没有有效的锁）
          await sequelize.query(
            `
            UPDATE item_instances
            SET status = 'available', locks = NULL, updated_at = NOW()
            WHERE item_instance_id = ?
          `,
            {
              replacements: [item.item_instance_id],
              transaction
            }
          )

          // 记录修复事件
          const businessId = `migration_fix_${item.item_instance_id}_${Date.now()}`
          await sequelize.query(
            `
            INSERT INTO item_instance_events
            (item_instance_id, event_type, operator_user_id, operator_type, status_before, status_after,
             owner_before, owner_after, business_type, idempotency_key, meta, created_at)
            VALUES (?, 'unlock', NULL, 'system', 'locked', 'available',
                    ?, ?, 'migration_fix', ?,
                    '{"reason": "迁移修复：status=locked 但无有效锁，重置为 available"}', NOW())
          `,
            {
              replacements: [
                item.item_instance_id,
                item.owner_user_id,
                item.owner_user_id,
                businessId
              ],
              transaction
            }
          )

          report.fixed_count++
        }

        await transaction.commit()
        log(`   ✅ 修复了 ${report.fixed_count} 个物品`, 'green')
      } catch (error) {
        await transaction.rollback()
        report.errors.push(error.message)
        log(`   ❌ 修复失败: ${error.message}`, 'red')
      }
    } else if (dryRun && report.missing_locks > 0) {
      log('\n🔍 预览模式：以上问题将在实际执行时修复', 'yellow')
    }

    // 6. 生成报告
    log('\n' + '='.repeat(80), 'cyan')
    log('📋 迁移验证报告', 'cyan')
    log('='.repeat(80), 'cyan')
    log(`总锁定物品数: ${report.total_locked_items}`)
    log(`有效锁定数: ${report.valid_locks}`, 'green')
    log(`缺失锁定数: ${report.missing_locks}`, report.missing_locks > 0 ? 'yellow' : 'green')
    log(`格式错误数: ${report.invalid_format}`, report.invalid_format > 0 ? 'red' : 'green')
    log(`已修复数: ${report.fixed_count}`, report.fixed_count > 0 ? 'green' : 'reset')
    log(`错误数: ${report.errors.length}`, report.errors.length > 0 ? 'red' : 'green')

    if (report.missing_locks === 0 && report.invalid_format === 0) {
      log('\n✅ 所有锁定数据格式正确，迁移验证通过！', 'green')
    } else {
      log('\n⚠️ 存在需要处理的数据问题', 'yellow')
    }

    log('='.repeat(80) + '\n', 'cyan')

    await sequelize.close()
    return report
  } catch (error) {
    log(`\n❌ 脚本执行失败: ${error.message}`, 'red')
    report.errors.push(error.message)
    await sequelize.close()
    throw error
  }
}

// 命令行入口
if (require.main === module) {
  const args = process.argv.slice(2)
  const dryRun = !args.includes('--fix') && (args.includes('--dry-run') || args.length === 0)

  if (args.includes('--help')) {
    console.log(`
用法: node fix-locks-json-migration.js [options]

选项:
  --dry-run   预览模式（默认）
  --fix       实际修复模式
  --help      显示帮助信息

示例:
  node fix-locks-json-migration.js --dry-run   # 预览模式
  node fix-locks-json-migration.js --fix       # 实际修复
`)
    process.exit(0)
  }

  validateAndFixLocksMigration(dryRun)
    .then(report => {
      process.exit(report.errors.length > 0 ? 1 : 0)
    })
    .catch(error => {
      console.error('脚本异常:', error)
      process.exit(1)
    })
}

module.exports = { validateAndFixLocksMigration }
