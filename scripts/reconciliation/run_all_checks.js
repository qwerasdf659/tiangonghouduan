/**
 * 统一对账执行器
 *
 * 治理决策（2026-01-05 拍板）：
 * - 执行所有对账检查：抽奖、消费、兑换
 * - 任何一项失败则整体失败（阻断发布）
 * - 用于 CI/CD 部署前检查
 *
 * 使用方式：
 * - 手动执行：node scripts/reconciliation/run_all_checks.js
 * - CI/CD：npm run pre-deploy-check
 *
 * @since 2026-01-05
 * @see docs/事务边界治理现状核查报告.md
 */

'use strict'

const { check_lottery_consistency } = require('./check_lottery_consistency')
const { check_consumption_consistency } = require('./check_consumption_consistency')
const { check_exchange_consistency } = require('./check_exchange_consistency')

/**
 * 执行所有对账检查
 *
 * @returns {Promise<Object>} 汇总结果
 */
async function run_all_checks() {
  console.log('\n')
  console.log('╔' + '═'.repeat(58) + '╗')
  console.log('║' + '  统一对账执行器 - 事务边界治理 P1-2'.padEnd(56) + '  ║')
  console.log('║' + `  执行时间: ${new Date().toISOString()}`.padEnd(56) + '  ║')
  console.log('╚' + '═'.repeat(58) + '╝')
  console.log('\n')

  const results = {
    lottery: null,
    consumption: null,
    exchange: null,
    overall: 'PASSED',
    failed_checks: [],
    timestamp: new Date().toISOString()
  }

  // 1. 抽奖对账
  console.log('\n[1/3] 执行抽奖扣款一致性检查...\n')
  try {
    results.lottery = await check_lottery_consistency()
    if (results.lottery.status === 'FAILED') {
      results.overall = 'FAILED'
      results.failed_checks.push('lottery')
    }
  } catch (error) {
    console.error('抽奖对账脚本异常:', error.message)
    results.lottery = { status: 'ERROR', error: error.message }
    results.overall = 'FAILED'
    results.failed_checks.push('lottery')
  }

  // 2. 消费对账
  console.log('\n[2/3] 执行消费奖励一致性检查...\n')
  try {
    results.consumption = await check_consumption_consistency()
    if (results.consumption.status === 'FAILED') {
      results.overall = 'FAILED'
      results.failed_checks.push('consumption')
    }
  } catch (error) {
    console.error('消费对账脚本异常:', error.message)
    results.consumption = { status: 'ERROR', error: error.message }
    results.overall = 'FAILED'
    results.failed_checks.push('consumption')
  }

  // 3. 兑换对账
  console.log('\n[3/3] 执行兑换扣款一致性检查...\n')
  try {
    results.exchange = await check_exchange_consistency()
    if (results.exchange.status === 'FAILED') {
      results.overall = 'FAILED'
      results.failed_checks.push('exchange')
    }
  } catch (error) {
    console.error('兑换对账脚本异常:', error.message)
    results.exchange = { status: 'ERROR', error: error.message }
    results.overall = 'FAILED'
    results.failed_checks.push('exchange')
  }

  // 4. 汇总输出
  console.log('\n')
  console.log('╔' + '═'.repeat(58) + '╗')
  console.log('║' + '  对账结果汇总'.padEnd(56) + '  ║')
  console.log('╠' + '═'.repeat(58) + '╣')
  console.log('║' + `  抽奖对账: ${results.lottery?.status || 'N/A'}`.padEnd(56) + '  ║')
  console.log('║' + `  消费对账: ${results.consumption?.status || 'N/A'}`.padEnd(56) + '  ║')
  console.log('║' + `  兑换对账: ${results.exchange?.status || 'N/A'}`.padEnd(56) + '  ║')
  console.log('╠' + '═'.repeat(58) + '╣')

  if (results.overall === 'PASSED') {
    console.log('║' + '  ✅ 所有对账检查通过 - 允许发布'.padEnd(56) + '  ║')
  } else {
    console.log('║' + '  ❌ 对账检查失败 - 阻断发布'.padEnd(56) + '  ║')
    console.log('║' + `  失败项: ${results.failed_checks.join(', ')}`.padEnd(56) + '  ║')
  }

  console.log('╚' + '═'.repeat(58) + '╝')
  console.log('\n')

  // 5. 记录结果日志
  const fs = require('fs')
  const path = require('path')
  const log_dir = path.join(__dirname, '../../logs/reconciliation')
  if (!fs.existsSync(log_dir)) {
    fs.mkdirSync(log_dir, { recursive: true })
  }
  const log_file = path.join(log_dir, `run_all_${new Date().toISOString().split('T')[0]}.log`)
  fs.appendFileSync(log_file, JSON.stringify(results) + '\n')

  return results
}

// 主入口
if (require.main === module) {
  run_all_checks()
    .then(results => {
      if (results.overall === 'FAILED') {
        console.log('❌ 数据一致性检查失败，阻断发布')
        process.exit(1)
      }
      console.log('✅ 数据一致性检查通过，允许发布')
      process.exit(0)
    })
    .catch(error => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

module.exports = { run_all_checks }
