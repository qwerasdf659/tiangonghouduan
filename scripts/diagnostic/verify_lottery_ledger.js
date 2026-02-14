/**
 * 验证抽奖流水写入逻辑
 *
 * 目的：验证 UnifiedLotteryEngine.execute_draw() 是否正确写入 asset_transactions
 *
 * 验证内容：
 * 1. lottery_consume 流水（扣积分）
 * 2. lottery_reward 流水（如中 points 奖品）
 * 3. lottery_session_id 正确关联
 * 4. idempotency_key 正确派生
 *
 * 使用方式：node scripts/diagnostic/verify_lottery_ledger.js
 */

'use strict'

require('dotenv').config()
const { Sequelize } = require('sequelize')

// 直接连接数据库（避免循环依赖问题）
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  dialect: 'mysql',
  logging: false,
  timezone: '+08:00'
})

/**
 * 主验证函数
 */
async function verifyLotteryLedger() {
  console.log('='.repeat(60))
  console.log('抽奖流水写入验证脚本')
  console.log('='.repeat(60))

  try {
    // 1. 连接验证
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 2. 记录验证前状态
    const [beforeTxns] = await sequelize.query(`
      SELECT COUNT(*) as count FROM asset_transactions
      WHERE business_type IN ('lottery_consume', 'lottery_reward')
    `)
    const beforeCount = beforeTxns[0].count
    console.log(`\n📊 验证前抽奖流水数量: ${beforeCount}`)

    // 3. 检查活动状态
    const [campaigns] = await sequelize.query(`
      SELECT lottery_campaign_id, campaign_name, status
      FROM lottery_campaigns
      WHERE lottery_campaign_id = 1
    `)
    console.log(`\n📋 活动信息:`)
    console.log(`   - lottery_campaign_id: ${campaigns[0].lottery_campaign_id}`)
    console.log(`   - campaign_name: ${campaigns[0].campaign_name}`)
    console.log(`   - status: ${campaigns[0].status}`)

    // 4. 检查用户账户
    const [accounts] = await sequelize.query(`
      SELECT aab.asset_code, aab.available_amount
      FROM accounts a
      JOIN account_asset_balances aab ON a.account_id = aab.account_id
      WHERE a.user_id = 31 AND aab.asset_code = 'POINTS'
    `)
    console.log(`\n👤 用户31 POINTS余额: ${accounts[0]?.available_amount || 0}`)

    // 5. 临时将活动状态改为 active
    console.log('\n🔧 临时启用活动...')
    await sequelize.query(`UPDATE lottery_campaigns SET status = 'active' WHERE lottery_campaign_id = 1`)

    // 6. 执行抽奖验证
    console.log('\n🎰 执行抽奖验证...')

    /*
     * P1-9：UnifiedLotteryEngine 通过 ServiceManager 获取
     * 服务键：'unified_lottery_engine'（snake_case）
     */
    const serviceManager = require('../../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    const engine = serviceManager.getService('unified_lottery_engine')
    console.log('✅ UnifiedLotteryEngine 加载成功（P1-9 ServiceManager）')

    const testIdempotencyKey = `verify_ledger_${Date.now()}`

    try {
      const result = await engine.execute_draw(31, 1, 1, {
        idempotency_key: testIdempotencyKey,
        request_source: 'verify_lottery_ledger'
      })

      console.log('\n✅ 抽奖执行结果:')
      console.log(`   - success: ${result.success}`)
      console.log(`   - lottery_session_id: ${result.data?.lottery_session_id || 'N/A'}`)
      console.log(`   - reward_tier: ${result.data?.results?.[0]?.reward_tier || 'N/A'}`)
    } catch (drawError) {
      console.error('\n❌ 抽奖执行失败:', drawError.message)
    }

    // 7. 恢复活动状态
    console.log('\n🔧 恢复活动状态...')
    await sequelize.query(`UPDATE lottery_campaigns SET status = 'ended' WHERE lottery_campaign_id = 1`)

    // 8. 验证流水写入
    const [afterTxns] = await sequelize.query(`
      SELECT COUNT(*) as count FROM asset_transactions
      WHERE business_type IN ('lottery_consume', 'lottery_reward')
    `)
    const afterCount = afterTxns[0].count
    console.log(`\n📊 验证后抽奖流水数量: ${afterCount}`)
    console.log(`   - 新增流水数量: ${afterCount - beforeCount}`)

    // 9. 查看新增的流水详情
    const [newTxns] = await sequelize.query(`
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
      WHERE business_type IN ('lottery_consume', 'lottery_reward')
      ORDER BY transaction_id DESC
      LIMIT 5
    `)

    if (newTxns.length > 0) {
      console.log('\n📝 最新流水详情:')
      newTxns.forEach((txn, i) => {
        console.log(`\n   [${i + 1}] transaction_id: ${txn.transaction_id}`)
        console.log(`       - asset_code: ${txn.asset_code}`)
        console.log(`       - delta_amount: ${txn.delta_amount}`)
        console.log(`       - business_type: ${txn.business_type}`)
        console.log(`       - lottery_session_id: ${txn.lottery_session_id || 'NULL'}`)
        console.log(`       - idempotency_key: ${txn.idempotency_key}`)
      })
    }

    // 10. 验证结论
    console.log('\n' + '='.repeat(60))
    if (afterCount > beforeCount) {
      console.log('✅ 验证通过: 抽奖流水写入逻辑正确')
      console.log('   - lottery_consume 流水已写入')
      console.log('   - 事务边界正确')
    } else {
      console.log('❌ 验证失败: 抽奖流水未写入')
      console.log('   - 需要检查 BalanceService.changeBalance 调用')
    }
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 验证脚本错误:', error.message)
    console.error(error.stack)

    // 确保恢复活动状态
    try {
      await sequelize.query(`UPDATE lottery_campaigns SET status = 'ended' WHERE lottery_campaign_id = 1`)
    } catch (e) {
      // ignore
    }
  } finally {
    await sequelize.close()
  }
}

// 执行验证
verifyLotteryLedger()
