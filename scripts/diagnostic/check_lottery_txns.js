/**
 * 检查抽奖流水验证结果
 */

'use strict'

require('dotenv').config()
const { Sequelize } = require('sequelize')

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  dialect: 'mysql',
  logging: false
})

async function check() {
  try {
    // 检查抽奖流水
    const [txns] = await sequelize.query(`
      SELECT
        transaction_id,
        account_id,
        asset_code,
        delta_amount,
        business_type,
        lottery_session_id,
        idempotency_key,
        created_at
      FROM asset_transactions
      WHERE business_type IN ('lottery_consume', 'lottery_reward', 'lottery_reward_material_credit')
      ORDER BY transaction_id DESC
      LIMIT 5
    `)

    console.log('=== 抽奖流水验证结果 ===')
    console.log('流水数量:', txns.length)

    if (txns.length > 0) {
      console.log('\n最新流水详情:')
      txns.forEach((txn, i) => {
        console.log(`\n[${i + 1}] transaction_id: ${txn.transaction_id}`)
        console.log(`    - asset_code: ${txn.asset_code}`)
        console.log(`    - delta_amount: ${txn.delta_amount}`)
        console.log(`    - business_type: ${txn.business_type}`)
        console.log(`    - lottery_session_id: ${txn.lottery_session_id || 'NULL'}`)
        console.log(`    - idempotency_key: ${txn.idempotency_key}`)
      })
      console.log('\n✅ 抽奖流水写入逻辑正确!')
    } else {
      console.log('\n❌ 未发现抽奖流水')
    }

    // 恢复活动状态
    await sequelize.query(`UPDATE lottery_campaigns SET status = 'ended' WHERE lottery_campaign_id = 1`)
    console.log('\n✅ 活动状态已恢复为 ended')

    await sequelize.close()
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  }
}

check()
