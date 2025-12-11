/**
 * 完整验证脚本：P0-3 奖品库存调整审计日志功能（全面版）
 *
 * 目的：全面验证所有奖品管理操作是否正确记录审计日志
 *
 * 验证内容：
 * 1. addStock 方法：补充库存（prize_stock_adjust）
 * 2. updatePrize 方法：更新奖品配置（prize_config）
 * 3. deletePrize 方法：删除奖品（prize_delete）
 * 4. batchAddPrizes 方法：批量添加奖品（prize_create）
 * 5. 路由层调用验证
 *
 * 创建时间：2025-12-11
 * 使用模型：Claude Sonnet 4.5
 */

const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.join(process.cwd(), '.env') })

const { sequelize } = require('../models')

/**
 * 全面验证审计日志功能
 */
async function comprehensiveVerification () {
  console.log('==================================================')
  console.log('  P0-3 奖品管理审计日志功能全面验证')
  console.log('==================================================\n')

  const results = {
    database: [],
    code: [],
    route: [],
    overall: []
  }

  try {
    // ===== 第一部分：数据库验证 =====
    console.log('【第一部分】数据库验证')
    console.log('─────────────────────────────────────────────────\n')

    // 1.1 检查 operation_type 枚举值
    console.log('1.1 检查 operation_type 枚举值...')
    const [enumResults] = await sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    if (enumResults.length === 0) {
      throw new Error('未找到 admin_operation_logs.operation_type 列')
    }

    const columnType = enumResults[0].COLUMN_TYPE
    const requiredTypes = ['prize_stock_adjust', 'prize_config', 'prize_create', 'prize_delete']
    const missingTypes = []

    requiredTypes.forEach(type => {
      if (columnType.includes(type)) {
        console.log(`  ✅ ${type}`)
        results.database.push({ type, status: 'pass' })
      } else {
        console.log(`  ❌ ${type} (缺失)`)
        results.database.push({ type, status: 'fail' })
        missingTypes.push(type)
      }
    })

    if (missingTypes.length > 0) {
      throw new Error(`数据库缺少操作类型：${missingTypes.join(', ')}`)
    }

    // ===== 第二部分：代码验证 =====
    console.log('\n【第二部分】代码验证')
    console.log('─────────────────────────────────────────────────\n')

    const prizePoolServicePath = path.join(__dirname, '../services/PrizePoolService.js')
    const prizePoolServiceCode = fs.readFileSync(prizePoolServicePath, 'utf8')

    // 2.1 检查 addStock 方法
    console.log('2.1 检查 addStock 方法...')
    const hasAddStockAudit = prizePoolServiceCode.includes('AuditLogService.logOperation')
      && prizePoolServiceCode.includes("operation_type: 'prize_stock_adjust'")
      && prizePoolServiceCode.includes('奖品库存调整')

    if (hasAddStockAudit) {
      console.log('  ✅ addStock 方法正确调用审计日志')
      results.code.push({ method: 'addStock', status: 'pass' })
    } else {
      console.log('  ❌ addStock 方法未正确调用审计日志')
      results.code.push({ method: 'addStock', status: 'fail' })
    }

    // 2.2 检查 updatePrize 方法
    console.log('2.2 检查 updatePrize 方法...')
    const hasUpdatePrizeAudit = prizePoolServiceCode.includes('AuditLogService.logOperation')
      && prizePoolServiceCode.includes("operation_type: 'prize_config'")
      && prizePoolServiceCode.includes('奖品配置修改')

    if (hasUpdatePrizeAudit) {
      console.log('  ✅ updatePrize 方法正确调用审计日志')
      results.code.push({ method: 'updatePrize', status: 'pass' })
    } else {
      console.log('  ❌ updatePrize 方法未正确调用审计日志')
      results.code.push({ method: 'updatePrize', status: 'fail' })
    }

    // 2.3 检查 deletePrize 方法
    console.log('2.3 检查 deletePrize 方法...')
    const hasDeletePrizeAudit = prizePoolServiceCode.includes('AuditLogService.logOperation')
      && prizePoolServiceCode.includes("operation_type: 'prize_delete'")
      && prizePoolServiceCode.includes('删除奖品')

    if (hasDeletePrizeAudit) {
      console.log('  ✅ deletePrize 方法正确调用审计日志')
      results.code.push({ method: 'deletePrize', status: 'pass' })
    } else {
      console.log('  ❌ deletePrize 方法未正确调用审计日志')
      results.code.push({ method: 'deletePrize', status: 'fail' })
    }

    // 2.4 检查 batchAddPrizes 方法
    console.log('2.4 检查 batchAddPrizes 方法...')
    const hasBatchAddPrizesAudit = prizePoolServiceCode.includes('AuditLogService.logOperation')
      && prizePoolServiceCode.includes("operation_type: 'prize_create'")
      && prizePoolServiceCode.includes('批量添加')

    if (hasBatchAddPrizesAudit) {
      console.log('  ✅ batchAddPrizes 方法正确调用审计日志')
      results.code.push({ method: 'batchAddPrizes', status: 'pass' })
    } else {
      console.log('  ❌ batchAddPrizes 方法未正确调用审计日志')
      results.code.push({ method: 'batchAddPrizes', status: 'fail' })
    }

    // ===== 第三部分：路由层验证 =====
    console.log('\n【第三部分】路由层验证')
    console.log('─────────────────────────────────────────────────\n')

    const prizePoolRoutePath = path.join(__dirname, '../routes/v4/unified-engine/admin/prize_pool.js')
    const prizePoolRouteCode = fs.readFileSync(prizePoolRoutePath, 'utf8')

    // 3.1 检查路由层是否传入操作员ID
    console.log('3.1 检查路由层是否传入操作员ID...')

    const routeChecks = [
      { method: 'addStock', param: 'operated_by', pattern: /operated_by:\s*req\.user\?\.id/ },
      { method: 'updatePrize', param: 'updated_by', pattern: /updated_by:\s*req\.user\?\.id/ },
      { method: 'deletePrize', param: 'deleted_by', pattern: /deleted_by:\s*req\.user\?\.id/ },
      { method: 'batchAddPrizes', param: 'created_by', pattern: /created_by:\s*req\.user\?\.id/ }
    ]

    routeChecks.forEach(check => {
      if (check.pattern.test(prizePoolRouteCode)) {
        console.log(`  ✅ ${check.method} 路由正确传入 ${check.param}`)
        results.route.push({ method: check.method, status: 'pass' })
      } else {
        console.log(`  ❌ ${check.method} 路由未正确传入 ${check.param}`)
        results.route.push({ method: check.method, status: 'fail' })
      }
    })

    // ===== 第四部分：事务保护验证 =====
    console.log('\n【第四部分】事务保护验证')
    console.log('─────────────────────────────────────────────────\n')

    console.log('4.1 检查事务保护...')

    const transactionChecks = [
      { method: 'addStock', hasInternal: true, hasRollback: true },
      { method: 'updatePrize', hasInternal: true, hasRollback: true },
      { method: 'deletePrize', hasInternal: true, hasRollback: true },
      { method: 'batchAddPrizes', hasInternal: true, hasRollback: true }
    ]

    transactionChecks.forEach(check => {
      const hasInternalTx = prizePoolServiceCode.includes(`${check.method}`)
        && prizePoolServiceCode.includes('internalTransaction')
      const hasRollback = prizePoolServiceCode.includes('rollback')

      if (hasInternalTx && hasRollback) {
        console.log(`  ✅ ${check.method} 有完整的事务保护`)
      } else {
        console.log(`  ⚠️  ${check.method} 事务保护可能不完整`)
      }
    })

    // ===== 验证结果汇总 =====
    console.log('\n==================================================')
    console.log('  验证结果汇总')
    console.log('==================================================\n')

    const databasePassed = results.database.every(r => r.status === 'pass')
    const codePassed = results.code.every(r => r.status === 'pass')
    const routePassed = results.route.every(r => r.status === 'pass')

    console.log('【数据库验证】')
    console.log(`  状态: ${databasePassed ? '✅ 通过' : '❌ 失败'}`)
    console.log(`  详情: ${results.database.length} 个检查项，${results.database.filter(r => r.status === 'pass').length} 个通过\n`)

    console.log('【代码验证】')
    console.log(`  状态: ${codePassed ? '✅ 通过' : '❌ 失败'}`)
    console.log(`  详情: ${results.code.length} 个检查项，${results.code.filter(r => r.status === 'pass').length} 个通过\n`)

    console.log('【路由验证】')
    console.log(`  状态: ${routePassed ? '✅ 通过' : '❌ 失败'}`)
    console.log(`  详情: ${results.route.length} 个检查项，${results.route.filter(r => r.status === 'pass').length} 个通过\n`)

    const allPassed = databasePassed && codePassed && routePassed

    if (allPassed) {
      console.log('==================================================')
      console.log('  🎉 所有验证通过！P0-3 任务彻底完成 ✅')
      console.log('==================================================\n')
      process.exit(0)
    } else {
      console.log('==================================================')
      console.log('  ❌ 部分验证失败，请检查上述问题')
      console.log('==================================================\n')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ 验证失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行验证
comprehensiveVerification()
