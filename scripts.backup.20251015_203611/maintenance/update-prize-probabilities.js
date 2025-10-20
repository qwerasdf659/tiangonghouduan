#!/usr/bin/env node
/**
 * 更新奖品概率脚本
 * 根据主体功能实现文档要求设置奖品中奖概率
 */

require('dotenv').config()
const { LotteryPrize } = require('../models')

// 根据主体功能实现文档的概率要求
const REQUIRED_PROBABILITIES = {
  // 奖品名称: 中奖概率
  八八折: 0.0,
  '100积分': 0.3,
  甜品1份: 0.2,
  青菜1份: 0.3,
  '2000积分券': 0.01,
  '500积分券': 0.18,
  精品首饰一个: 0.01,
  生腌拼盘158: 0.0,
  九八折券: 0.0 // 保底专用，不参与正常抽奖
}

async function updatePrizeProbabilities () {
  try {
    console.log('🔍 开始检查和更新奖品概率...')

    // 1. 获取所有奖品
    const prizes = await LotteryPrize.findAll({
      attributes: ['prize_id', 'prize_name', 'win_probability'],
      order: [['prize_id', 'ASC']]
    })

    console.log(`📋 现有奖品 (${prizes.length}个):`)
    prizes.forEach(prize => {
      console.log(
        `  ${prize.prize_id}. ${prize.prize_name} - 当前概率: ${(prize.win_probability * 100).toFixed(1)}%`
      )
    })

    // 2. 检查概率总和
    const currentTotalProbability = prizes.reduce((sum, prize) => {
      return sum + parseFloat(prize.win_probability || 0)
    }, 0)

    console.log(`\n📊 当前概率总和: ${(currentTotalProbability * 100).toFixed(1)}%`)

    // 3. 计算要求的概率总和
    const requiredTotalProbability = Object.values(REQUIRED_PROBABILITIES).reduce(
      (sum, prob) => sum + prob,
      0
    )
    console.log(`📊 要求概率总和: ${(requiredTotalProbability * 100).toFixed(1)}%`)

    if (Math.abs(requiredTotalProbability - 1.0) > 0.001) {
      console.warn(
        `⚠️ 警告: 要求的概率总和不等于100%，当前为${(requiredTotalProbability * 100).toFixed(1)}%`
      )
    }

    // 4. 更新奖品概率
    const updates = []

    for (const prize of prizes) {
      // 查找匹配的概率设置
      let newProbability = null

      // 精确匹配奖品名称
      if (Object.prototype.hasOwnProperty.call(REQUIRED_PROBABILITIES, prize.prize_name)) {
        newProbability = REQUIRED_PROBABILITIES[prize.prize_name]
      } else {
        // 模糊匹配
        for (const [name, probability] of Object.entries(REQUIRED_PROBABILITIES)) {
          if (prize.prize_name.includes(name) || name.includes(prize.prize_name)) {
            newProbability = probability
            break
          }
        }
      }

      if (newProbability !== null && Math.abs(newProbability - prize.win_probability) > 0.001) {
        updates.push({
          prize_id: prize.prize_id,
          name: prize.prize_name,
          old_probability: prize.win_probability,
          new_probability: newProbability
        })
      }
    }

    // 5. 执行更新
    if (updates.length > 0) {
      console.log(`\n🔄 需要更新的奖品 (${updates.length}个):`)

      for (const update of updates) {
        console.log(
          `  更新 ${update.name}: ${(update.old_probability * 100).toFixed(1)}% → ${(update.new_probability * 100).toFixed(1)}%`
        )

        await LotteryPrize.update(
          { win_probability: update.new_probability },
          { where: { prize_id: update.prize_id } }
        )
      }

      console.log('\n✅ 奖品概率更新完成')
    } else {
      console.log('\n✅ 所有奖品概率已正确，无需更新')
    }

    // 6. 验证更新结果
    console.log('\n🔍 验证更新结果:')
    const updatedPrizes = await LotteryPrize.findAll({
      attributes: ['prize_id', 'prize_name', 'win_probability'],
      order: [['prize_id', 'ASC']]
    })

    const finalTotalProbability = updatedPrizes.reduce((sum, prize) => {
      return sum + parseFloat(prize.win_probability || 0)
    }, 0)

    console.log('📋 更新后奖品概率:')
    updatedPrizes.forEach(prize => {
      console.log(
        `  ${prize.prize_id}. ${prize.prize_name} - 概率: ${(prize.win_probability * 100).toFixed(1)}%`
      )
    })

    console.log(`\n📊 最终概率总和: ${(finalTotalProbability * 100).toFixed(1)}%`)

    if (Math.abs(finalTotalProbability - 1.0) > 0.001) {
      console.warn('⚠️ 警告: 概率总和不等于100%，请检查配置')
    } else {
      console.log('✅ 概率总和符合要求 (100%)')
    }
  } catch (error) {
    console.error('❌ 更新奖品概率失败:', error.message)
    console.error('详细错误:', error)
    process.exit(1)
  }
}

// 如果直接执行此脚本
if (require.main === module) {
  updatePrizeProbabilities()
}

module.exports = { updatePrizeProbabilities }
