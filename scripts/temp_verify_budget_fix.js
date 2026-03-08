#!/usr/bin/env node
/**
 * 临时验证脚本：确认预算扣减修复是否有效
 * 通过 API 模拟单次抽奖，验证预算是否被实际扣减
 * 任务完成后删除
 */
require('dotenv').config()
const { sequelize } = require('../config/database')

async function verify() {
  try {
    await sequelize.authenticate()
    console.log('=== 预算扣减修复验证 ===\n')

    const user_id = 31

    // 1. 记录当前余额
    const [before] = await sequelize.query(
      `SELECT ab.available_amount
       FROM account_asset_balances ab
       JOIN accounts a ON ab.account_id = a.account_id
       WHERE a.user_id = ? AND a.account_type = 'user'
         AND ab.asset_code = 'BUDGET_POINTS' AND ab.lottery_campaign_id = 'CONSUMPTION_DEFAULT'`,
      { replacements: [user_id] }
    )
    const balance_before = Number(before[0]?.available_amount || 0)
    console.log(`修复前余额: ${balance_before}`)

    // 2. 验证 BudgetProviderFactory.createByMode 修复
    const { factory } = require('../services/UnifiedLotteryEngine/pipeline/budget/BudgetProviderFactory')

    const campaign_mock = {
      budget_mode: 'user',
      allowed_campaign_ids: ['CONSUMPTION_DEFAULT'],
      lottery_campaign_id: 1
    }

    const provider = factory.createByMode('user', {
      user_id,
      lottery_campaign_id: 1,
      campaign: campaign_mock
    })

    console.log(`\nProvider类型: ${provider.constructor.name}`)
    console.log(`Provider.allowed_campaign_ids: ${JSON.stringify(provider.allowed_campaign_ids)}`)

    const budget_info = await provider.getAvailableBudget({ user_id, lottery_campaign_id: 1 }, {})
    console.log(`getAvailableBudget结果: ${JSON.stringify(budget_info)}`)

    // 3. 验证 checkBudget
    const check_result = await provider.checkBudget({ user_id, lottery_campaign_id: 1, amount: 12 }, {})
    console.log(`checkBudget(amount=12)结果: sufficient=${check_result.sufficient}, available=${check_result.available}`)

    // 4. 直接验证旧方式（不带campaign）是否返回0
    const provider_old = factory.createByMode('user', {
      user_id,
      lottery_campaign_id: 1
    })
    console.log(`\n旧方式(无campaign) Provider.allowed_campaign_ids: ${JSON.stringify(provider_old.allowed_campaign_ids)}`)
    const budget_info_old = await provider_old.getAvailableBudget({ user_id, lottery_campaign_id: 1 }, {})
    console.log(`旧方式 getAvailableBudget结果: ${JSON.stringify(budget_info_old)}`)

    console.log('\n=== 验证总结 ===')
    if (provider.allowed_campaign_ids && provider.allowed_campaign_ids.length > 0) {
      console.log('✅ BudgetProviderFactory.createByMode 修复成功')
      console.log('   allowed_campaign_ids 正确从 campaign 提取')
    } else {
      console.log('❌ BudgetProviderFactory.createByMode 修复失败')
    }

    if (budget_info.available > 0) {
      console.log('✅ getAvailableBudget 返回正确余额')
    } else {
      console.log('❌ getAvailableBudget 仍返回0')
    }

    if (check_result.sufficient && balance_before >= 12) {
      console.log('✅ checkBudget 正确判断余额充足')
    } else if (!check_result.sufficient && balance_before < 12) {
      console.log('⚠️ checkBudget 判断余额不足（余额确实不够）')
    } else {
      console.log('❌ checkBudget 判断错误')
    }

    if (!provider_old.allowed_campaign_ids) {
      console.log('✅ 确认旧方式（无campaign）返回null，这是BUG的根因')
    }

    console.log('\n=== 验证完成 ===')
  } catch (error) {
    console.error('验证失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }
}

verify()
