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

const { LotteryCampaignPrize, PrizeDefinition, LotteryDraw } = require('../../models')
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

    // 2. 统计各奖品中奖情况（通过 lottery_campaign_prizes JOIN prize_definitions）
    const campaignPrizes = await LotteryCampaignPrize.findAll({
      include: [{
        model: PrizeDefinition,
        as: 'prizeDefinition',
        attributes: ['display_name']
      }]
    })
    log('\n📦 奖品中奖统计:', 'blue')

    for (const cp of campaignPrizes) {
      const drawCount = await LotteryDraw.count({
        where: { lottery_campaign_prize_id: cp.lottery_campaign_prize_id }
      })
      const percentage = totalDraws > 0 ? ((drawCount / totalDraws) * 100).toFixed(2) : 0
      const displayName = cp.prizeDefinition?.display_name || '未知奖品'

      log(`   ${displayName}: ${drawCount}次 (${percentage}%)`, 'yellow')
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
 * 查看奖品信息（集中奖品目录方案）
 */
async function updatePrizes() {
  log('\n🎁 查看活动奖品信息', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    const campaignPrizes = await LotteryCampaignPrize.findAll({
      include: [{
        model: PrizeDefinition,
        as: 'prizeDefinition',
        attributes: ['display_name', 'prize_code', 'prize_type', 'material_asset_code', 'material_amount']
      }]
    })

    log(`\n当前活动奖品列表 (${campaignPrizes.length}个):`, 'blue')
    campaignPrizes.forEach((cp, index) => {
      const def = cp.prizeDefinition
      log(`\n${index + 1}. ${def?.display_name || '未知奖品'}`, 'cyan')
      log(`   关联ID: ${cp.lottery_campaign_prize_id}`, 'yellow')
      log(`   奖品码: ${def?.prize_code || '-'}`, 'yellow')
      log(`   权重: ${cp.win_weight}`, 'yellow')
      log(`   库存: ${cp.stock_quantity}`, 'yellow')
      log(`   档位: ${cp.reward_tier}`, 'yellow')
      log(`   状态: ${cp.status}`, 'yellow')
    })

    log('\n💡 提示: 如需修改奖品，请使用管理后台', 'cyan')
  } catch (error) {
    log(`\n❌ 获取奖品失败: ${error.message}`, 'red')
  }
}

/**
 * 检查奖品权重配置（tier_first 模式使用 win_weight）
 */
async function updatePrizeProbabilities() {
  log('\n🎲 检查奖品权重配置', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    const campaignPrizes = await LotteryCampaignPrize.findAll({
      where: { status: 'active' },
      include: [{
        model: PrizeDefinition,
        as: 'prizeDefinition',
        attributes: ['display_name']
      }]
    })

    log('\n当前奖品权重:', 'blue')
    let totalWeight = 0

    campaignPrizes.forEach((cp, index) => {
      const weight = parseInt(cp.win_weight) || 0
      totalWeight += weight
      const displayName = cp.prizeDefinition?.display_name || '未知奖品'
      log(`${index + 1}. ${displayName} [${cp.reward_tier}]: ${weight}`, weight > 0 ? 'green' : 'red')
    })

    log(`\n总权重: ${totalWeight}`, 'blue')
    log('✅ 权重检查完成（tier_first 模式按档位分组计算概率）', 'green')
  } catch (error) {
    log(`\n❌ 检查权重失败: ${error.message}`, 'red')
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
