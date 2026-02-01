#!/usr/bin/env node

/**
 * 业务维护统一工具包 (Business Toolkit)
 *
 * 整合来源：
 * - scripts/maintenance/analyze-lottery-points.js (分析抽奖积分数据)
 * - scripts/maintenance/update-main-feature-prizes.js (更新主功能奖品)
 * - scripts/maintenance/update-prize-probabilities.js (更新奖品概率)
 *
 * 使用方式：
 * node scripts/maintenance/business-toolkit.js                # 交互式菜单
 * node scripts/maintenance/business-toolkit.js analyze        # 分析抽奖数据
 * node scripts/maintenance/business-toolkit.js update-prizes  # 更新奖品
 *
 * V2.0 重构版本
 * 创建时间：2025年10月15日 北京时间
 */

'use strict'

const { LotteryPrize, LotteryDraw, User: _User } = require('../../models') // User保留供未来使用
const { Op: _Op } = require('sequelize') // Op保留供未来使用
const inquirer = require('inquirer')

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

// ==================== 核心功能 ====================

/**
 * 分析抽奖积分数据
 */
async function analyzeLotteryPoints() {
  log('\n📊 分析抽奖积分数据', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    // 1. 统计总抽奖次数
    const totalDraws = await LotteryDraw.count()
    log(`\n✅ 总抽奖次数: ${totalDraws}`, 'green')

    // 2. 统计各奖品中奖情况
    const prizes = await LotteryPrize.findAll()
    log('\n📦 奖品中奖统计:', 'blue')

    for (const prize of prizes) {
      const drawCount = await LotteryDraw.count({
        where: { lottery_prize_id: prize.lottery_prize_id }
      })
      const percentage = totalDraws > 0 ? ((drawCount / totalDraws) * 100).toFixed(2) : 0

      log(`   ${prize.prize_name}: ${drawCount}次 (${percentage}%)`, 'yellow')
    }

    // 3. 积分消耗统计
    const [pointsStats] = await LotteryDraw.sequelize.query(`
      SELECT 
        SUM(points_cost) as total_points,
        AVG(points_cost) as avg_points
      FROM lottery_draws
    `)

    const stats = pointsStats[0]
    log('\n💰 积分统计:', 'blue')
    log(`   总消耗积分: ${stats.total_points || 0}`, 'yellow')
    log(`   平均消耗积分: ${parseFloat(stats.avg_points || 0).toFixed(2)}`, 'yellow')

    log('\n✅ 分析完成', 'green')
  } catch (error) {
    log(`\n❌ 分析失败: ${error.message}`, 'red')
  }
}

/**
 * 更新奖品信息
 */
async function updatePrizes() {
  log('\n🎁 更新奖品信息', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    const prizes = await LotteryPrize.findAll()

    log(`\n当前奖品列表 (${prizes.length}个):`, 'blue')
    prizes.forEach((prize, index) => {
      log(`\n${index + 1}. ${prize.prize_name}`, 'cyan')
      log(`   ID: ${prize.lottery_prize_id}`, 'yellow')
      log(`   价值: ${prize.prize_value_points}积分`, 'yellow')
      log(`   概率: ${prize.win_probability || '未设置'}`, 'yellow')
      log(`   库存: ${prize.stock_quantity || '未设置'}`, 'yellow')
    })

    log('\n💡 提示: 如需修改奖品，请使用管理后台或直接修改数据库', 'cyan')
  } catch (error) {
    log(`\n❌ 获取奖品失败: ${error.message}`, 'red')
  }
}

/**
 * 更新奖品概率
 */
async function updatePrizeProbabilities() {
  log('\n🎲 更新奖品概率', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    const prizes = await LotteryPrize.findAll()

    log('\n当前奖品概率:', 'blue')
    let totalProbability = 0

    prizes.forEach((prize, index) => {
      const prob = parseFloat(prize.win_probability || 0)
      totalProbability += prob
      log(`${index + 1}. ${prize.name}: ${prob}`, prob > 0 ? 'green' : 'red')
    })

    log(`\n总概率: ${totalProbability}`, totalProbability === 1 ? 'green' : 'red')

    if (totalProbability !== 1) {
      log('⚠️  概率总和应该等于1', 'yellow')
    } else {
      log('✅ 概率配置正确', 'green')
    }
  } catch (error) {
    log(`\n❌ 检查概率失败: ${error.message}`, 'red')
  }
}

// ==================== 主菜单 ====================

async function showMenu() {
  log('\n' + '='.repeat(60), 'cyan')
  log('  🎁 业务维护统一工具包 (Business Toolkit V2.0)', 'cyan')
  log('='.repeat(60), 'cyan')

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '请选择维护操作:',
      choices: [
        { name: '1. 📊 分析抽奖积分数据', value: 'analyze' },
        { name: '2. 🎁 查看奖品信息', value: 'prizes' },
        { name: '3. 🎲 检查奖品概率', value: 'probabilities' },
        new inquirer.Separator(),
        { name: '9. 🚪 退出', value: 'exit' }
      ]
    }
  ])

  if (action === 'exit') {
    log('\n👋 再见!\n', 'cyan')
    return
  }

  await executeAction(action)

  const { continueMenu } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'continueMenu',
      message: '是否继续其他操作?',
      default: true
    }
  ])

  if (continueMenu) {
    await showMenu()
  } else {
    log('\n👋 再见!\n', 'cyan')
  }
}

async function executeAction(action) {
  try {
    switch (action) {
      case 'analyze':
        await analyzeLotteryPoints()
        break
      case 'prizes':
        await updatePrizes()
        break
      case 'probabilities':
        await updatePrizeProbabilities()
        break
      default:
        log(`\n❌ 未知操作: ${action}`, 'red')
    }
  } catch (error) {
    log(`\n❌ 执行失败: ${error.message}`, 'red')
  }
}

// ==================== 主程序入口 ====================

async function main() {
  try {
    const args = process.argv.slice(2)
    if (args.length > 0) {
      const action = args[0]
      if (['analyze', 'prizes', 'probabilities'].includes(action)) {
        await executeAction(action)
        return
      }
    }

    await showMenu()
  } catch (error) {
    log(`\n❌ 执行失败: ${error.message}`, 'red')
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(error => {
    log(`\n❌ 未捕获的错误: ${error.message}`, 'red')
    process.exit(1)
  })
}

module.exports = {
  analyzeLotteryPoints,
  updatePrizes,
  updatePrizeProbabilities
}
