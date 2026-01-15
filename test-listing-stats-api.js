/**
 * 直接测试 ExchangeService.getUserListingStats 服务层
 *
 * 使用方法:
 *   node test-listing-stats-api.js
 */

require('dotenv').config()

async function main() {
  console.log('='.repeat(60))
  console.log('🔍 测试 getUserListingStats 服务')
  console.log('='.repeat(60))

  try {
    // 加载数据库模型
    const models = require('./models')
    const { sequelize } = models

    // 等待数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 加载服务
    const ExchangeService = require('./services/ExchangeService')

    // 测试调用
    console.log('\n📋 调用 ExchangeService.getUserListingStats...')
    const result = await ExchangeService.getUserListingStats({
      page: 1,
      limit: 20,
      filter: 'all',
      max_listings: 10
    })

    console.log('\n✅ 服务调用成功!')
    console.log('\n📊 返回数据结构:')
    console.log('   - summary:', JSON.stringify(result.summary, null, 2))
    console.log('   - pagination:', JSON.stringify(result.pagination, null, 2))
    console.log('   - stats 数量:', result.stats.length)

    if (result.stats.length > 0) {
      console.log('\n📋 第一条 stats 数据:')
      console.log(JSON.stringify(result.stats[0], null, 2))

      console.log('\n📋 stats 数据字段:')
      console.log('   ', Object.keys(result.stats[0]).join(', '))
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ 测试完成')

    // 验证前端期望的字段
    console.log('\n📝 前端需要的字段映射验证:')
    console.log('   summary.total_users_with_listings:', result.summary.total_users_with_listings)
    console.log('   summary.users_near_limit:', result.summary.users_near_limit)
    console.log('   summary.users_at_limit:', result.summary.users_at_limit)

    if (result.stats.length > 0) {
      const item = result.stats[0]
      console.log('\n   stats[0] 字段:')
      console.log('     - user_id:', item.user_id)
      console.log('     - nickname:', item.nickname)
      console.log('     - mobile:', item.mobile)
      console.log('     - status:', item.status)
      console.log('     - listing_count:', item.listing_count)
      console.log('     - remaining_quota:', item.remaining_quota)
      console.log('     - is_at_limit:', item.is_at_limit)
    }

    console.log('='.repeat(60))
  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
  } finally {
    process.exit(0)
  }
}

main()
