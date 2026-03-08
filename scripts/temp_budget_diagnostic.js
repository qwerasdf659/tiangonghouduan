#!/usr/bin/env node
/**
 * 临时诊断脚本：验证预算扣减是否正常工作
 * 任务完成后删除
 */
require('dotenv').config()
const { sequelize } = require('../config/database')

async function diagnose() {
  try {
    await sequelize.authenticate()
    console.log('=== 预算扣减诊断 ===\n')

    const user_id = 31

    // 1. 检查活动配置（budget_mode 和 allowed_campaign_ids）
    const [campaigns] = await sequelize.query(
      `SELECT lottery_campaign_id, campaign_name, campaign_code, budget_mode, 
              allowed_campaign_ids, pick_method, status
       FROM lottery_campaigns WHERE status = 'active'`
    )
    console.log('=== 活跃活动配置 ===')
    campaigns.forEach(c => {
      console.log(`  ID:${c.lottery_campaign_id} | ${c.campaign_name} | budget_mode:${c.budget_mode} | allowed_campaign_ids:${c.allowed_campaign_ids} | pick_method:${c.pick_method}`)
    })
    console.log()

    // 2. 查看 budget_mode 是否为 'user'
    const campaign = campaigns[0]
    if (!campaign) {
      console.log('ERROR: 没有活跃活动')
      return
    }

    console.log(`活动 budget_mode: ${campaign.budget_mode}`)
    console.log(`活动 allowed_campaign_ids: ${campaign.allowed_campaign_ids}`)
    const allowed = campaign.allowed_campaign_ids
    let parsedAllowed = null
    if (allowed) {
      try {
        parsedAllowed = typeof allowed === 'string' ? JSON.parse(allowed) : allowed
        console.log(`解析后 allowed_campaign_ids: ${JSON.stringify(parsedAllowed)}`)
      } catch (e) {
        console.log(`allowed_campaign_ids 解析失败: ${e.message}`)
      }
    }
    console.log()

    // 3. 查看用户 BUDGET_POINTS 余额详情
    const [budgetBalances] = await sequelize.query(
      `SELECT ab.account_asset_balance_id, ab.account_id, ab.asset_code, ab.lottery_campaign_id, 
              ab.available_amount, ab.frozen_amount
       FROM account_asset_balances ab
       JOIN accounts a ON ab.account_id = a.account_id
       WHERE a.user_id = ? AND a.account_type = 'user' AND ab.asset_code = 'BUDGET_POINTS'`,
      { replacements: [user_id] }
    )
    console.log('=== BUDGET_POINTS 余额详情 ===')
    budgetBalances.forEach(b => {
      console.log(`  account_id:${b.account_id} | lottery_campaign_id:${b.lottery_campaign_id} | available:${b.available_amount} | frozen:${b.frozen_amount}`)
    })
    console.log()

    // 4. 验证 QueryService.getBudgetPointsByCampaigns 是否能正确读取
    if (parsedAllowed && parsedAllowed.length > 0) {
      const placeholders = parsedAllowed.map(() => '?').join(',')
      const [budgetSum] = await sequelize.query(
        `SELECT COALESCE(SUM(ab.available_amount), 0) as total
         FROM account_asset_balances ab
         JOIN accounts a ON ab.account_id = a.account_id
         WHERE a.user_id = ? AND a.account_type = 'user'
           AND ab.asset_code = 'BUDGET_POINTS'
           AND ab.lottery_campaign_id IN (${placeholders})`,
        { replacements: [user_id, ...parsedAllowed] }
      )
      console.log(`getBudgetPointsByCampaigns 查询结果: ${budgetSum[0]?.total}`)
    }
    console.log()

    // 5. 验证 lottery_budget_deduct 流水是否存在
    const [deductTxns] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM asset_transactions at
       JOIN accounts a ON at.account_id = a.account_id
       WHERE a.user_id = ? AND a.account_type = 'user'
         AND at.business_type = 'lottery_budget_deduct'`,
      { replacements: [user_id] }
    )
    console.log(`lottery_budget_deduct 流水记录数: ${deductTxns[0]?.cnt}`)

    // 6. 检查所有 business_type
    const [bizTypes] = await sequelize.query(
      `SELECT at.business_type, COUNT(*) as cnt
       FROM asset_transactions at
       JOIN accounts a ON at.account_id = a.account_id
       WHERE a.user_id = ? AND a.account_type = 'user'
       GROUP BY at.business_type ORDER BY cnt DESC`,
      { replacements: [user_id] }
    )
    console.log('\n=== 用户资产流水 business_type 分布 ===')
    bizTypes.forEach(t => console.log(`  ${t.business_type}: ${t.cnt}条`))

    // 7. 模拟 deductBudget 执行路径
    console.log('\n=== 模拟预算扣减路径 ===')
    const budget_cost = 12

    if (campaign.budget_mode === 'none') {
      console.log('SKIP: budget_mode=none, 预算扣减被跳过')
    } else if (campaign.budget_mode === 'user') {
      console.log(`budget_mode=user, 需要扣减 ${budget_cost}`)
      
      if (!parsedAllowed || parsedAllowed.length === 0) {
        console.log('BUG: allowed_campaign_ids 为空! budget_provider 无法获取预算!')
        console.log('这是预算扣减失败的根本原因!')
      } else {
        const balance = budgetBalances.find(b => parsedAllowed.includes(b.lottery_campaign_id))
        if (balance) {
          console.log(`找到匹配的余额桶: lottery_campaign_id=${balance.lottery_campaign_id}, available=${balance.available_amount}`)
          if (Number(balance.available_amount) >= budget_cost) {
            console.log(`余额充足: ${balance.available_amount} >= ${budget_cost}`)
          } else {
            console.log(`余额不足: ${balance.available_amount} < ${budget_cost}`)
          }
        } else {
          console.log('BUG: 没有找到匹配 allowed_campaign_ids 的余额桶!')
          console.log('这可能是预算扣减失败的原因')
        }
      }
    }

    // 8. 检查 SYSTEM_BURN 账户是否存在
    const [burnAccounts] = await sequelize.query(
      `SELECT account_id, system_code, status FROM accounts WHERE system_code = 'SYSTEM_BURN'`
    )
    console.log(`\nSYSTEM_BURN 账户: ${burnAccounts.length > 0 ? 'account_id=' + burnAccounts[0].account_id : '不存在!'} `)

    console.log('\n=== 诊断完成 ===')
  } catch (error) {
    console.error('诊断失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }
}

diagnose()
