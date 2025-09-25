#!/usr/bin/env node
/**
 * 主要功能验证脚本
 * 验证主体功能实现文档中要求的功能是否正确实现
 */

require('dotenv').config()
const { LotteryPrize, LotteryPreset, User } = require('../models')
const { hasTestPrivilege } = require('../utils/TestAccountManager')

async function verifyMainFeatures () {
  try {
    console.log('🔍 开始验证主要功能实现...\n')

    // 1. 验证奖品概率设置
    console.log('1. 验证奖品概率设置:')
    const prizes = await LotteryPrize.findAll({
      attributes: ['prize_id', 'prize_name', 'win_probability'],
      order: [['prize_id', 'ASC']]
    })

    const expectedProbabilities = {
      八八折: 0.0,
      '100积分': 0.30,
      甜品1份: 0.20,
      青菜1份: 0.30,
      '2000积分券': 0.01,
      '500积分券': 0.18,
      精品首饰一个: 0.01,
      生腌拼盘158: 0.0,
      九八折券: 0.0
    }

    let probabilityCorrect = true
    for (const prize of prizes) {
      const expected = expectedProbabilities[prize.prize_name]
      if (expected !== undefined) {
        const actual = parseFloat(prize.win_probability)
        if (Math.abs(actual - expected) < 0.001) {
          console.log(`   ✅ ${prize.prize_name}: ${(actual * 100).toFixed(1)}% (正确)`)
        } else {
          console.log(`   ❌ ${prize.prize_name}: ${(actual * 100).toFixed(1)}% (期望: ${(expected * 100).toFixed(1)}%)`)
          probabilityCorrect = false
        }
      }
    }

    const totalProbability = prizes.reduce((sum, prize) => sum + parseFloat(prize.win_probability), 0)
    console.log(`   📊 概率总和: ${(totalProbability * 100).toFixed(1)}%`)

    if (probabilityCorrect && Math.abs(totalProbability - 1.0) < 0.001) {
      console.log('   ✅ 奖品概率设置正确\n')
    } else {
      console.log('   ❌ 奖品概率设置有误\n')
    }

    // 2. 验证测试账号权限
    console.log('2. 验证测试账号权限:')
    const testUser = await User.findOne({ where: { mobile: '13612227930' } })

    if (testUser) {
      console.log(`   ✅ 测试账号存在: ${testUser.mobile} (用户ID: ${testUser.user_id})`)
      console.log(`   ✅ 管理员权限: ${testUser.is_admin ? '是' : '否'}`)

      // 检查无限抽奖权限
      const hasUnlimitedLottery = hasTestPrivilege(testUser.user_id, 'unlimited_lottery')
      const hasBypassDaily = hasTestPrivilege(testUser.user_id, 'bypass_daily_limit')

      console.log(`   ✅ 无限抽奖权限: ${hasUnlimitedLottery ? '是' : '否'}`)
      console.log(`   ✅ 绕过每日限制: ${hasBypassDaily ? '是' : '否'}`)
    } else {
      console.log('   ❌ 测试账号不存在')
    }
    console.log('')

    // 3. 验证抽奖预设功能
    console.log('3. 验证抽奖预设功能:')

    // 检查LotteryPreset模型方法
    const presetMethods = [
      'getNextPreset',
      'createPresetQueue',
      'getUserPresetStats',
      'clearUserPresets'
    ]

    let presetMethodsExist = true
    for (const method of presetMethods) {
      if (typeof LotteryPreset[method] === 'function') {
        console.log(`   ✅ ${method} 方法存在`)
      } else {
        console.log(`   ❌ ${method} 方法不存在`)
        presetMethodsExist = false
      }
    }

    if (presetMethodsExist) {
      console.log('   ✅ 抽奖预设功能实现完整')
    }
    console.log('')

    // 4. 验证保底策略配置
    console.log('4. 验证保底策略配置:')

    // 查找九八折券奖品
    const guaranteePrize = prizes.find(p => p.prize_name.includes('九八折'))
    if (guaranteePrize) {
      console.log(`   ✅ 保底奖品存在: ${guaranteePrize.prize_name} (ID: ${guaranteePrize.prize_id})`)
      console.log(`   ✅ 保底奖品概率: ${(guaranteePrize.win_probability * 100).toFixed(1)}% (应为0%)`)
    } else {
      console.log('   ❌ 保底奖品不存在')
    }
    console.log('')

    // 5. 验证抽奖策略文件
    console.log('5. 验证抽奖策略文件:')
    const fs = require('fs')
    const strategyFiles = [
      'services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js',
      'services/UnifiedLotteryEngine/strategies/ManagementStrategy.js'
    ]

    for (const file of strategyFiles) {
      if (fs.existsSync(file)) {
        console.log(`   ✅ ${file} 存在`)
      } else {
        console.log(`   ❌ ${file} 不存在`)
      }
    }
    console.log('')

    // 6. 验证API路由
    console.log('6. 验证API路由:')
    const routeFiles = [
      'routes/v4/unified-engine/auth.js',
      'routes/v4/unified-engine/lottery.js',
      'routes/v4/unified-engine/lottery-preset.js',
      'routes/v4/unified-engine/admin.js'
    ]

    for (const file of routeFiles) {
      if (fs.existsSync(file)) {
        console.log(`   ✅ ${file} 存在`)
      } else {
        console.log(`   ❌ ${file} 不存在`)
      }
    }
    console.log('')

    // 7. 验证数据库表结构
    console.log('7. 验证数据库表结构:')
    const { sequelize } = require('../config/database')
    const tables = await sequelize.getQueryInterface().showAllTables()

    const requiredTables = [
      'users',
      'lottery_prizes',
      'lottery_presets',
      'lottery_draws',
      'user_points_accounts'
    ]

    for (const table of requiredTables) {
      if (tables.includes(table)) {
        console.log(`   ✅ 表 ${table} 存在`)
      } else {
        console.log(`   ❌ 表 ${table} 不存在`)
      }
    }

    console.log('\n✅ 主要功能验证完成')
  } catch (error) {
    console.error('❌ 主要功能验证失败:', error.message)
    console.error('详细错误:', error)
    process.exit(1)
  }
}

// 如果直接执行此脚本
if (require.main === module) {
  verifyMainFeatures()
}

module.exports = { verifyMainFeatures }
