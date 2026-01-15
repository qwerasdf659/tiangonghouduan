/**
 * 创建测试上架数据
 *
 * 将部分withdrawn状态的挂牌改为on_sale，用于测试marketplace-stats页面
 *
 * 使用方法:
 *   node test-create-listing-data.js
 */

require('dotenv').config()

async function main() {
  console.log('='.repeat(60))
  console.log('🔧 创建测试上架数据')
  console.log('='.repeat(60))

  try {
    // 加载数据库模型
    const models = require('./models')
    const { MarketListing, User, sequelize, Op } = models

    // 等待数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 1. 查询现有的withdrawn记录
    const withdrawnListings = await MarketListing.findAll({
      where: { status: 'withdrawn' },
      limit: 15,
      order: sequelize.random()
    })

    console.log(`\n📊 找到 ${withdrawnListings.length} 条withdrawn状态记录`)

    if (withdrawnListings.length === 0) {
      console.log('❌ 没有找到可用的记录来创建测试数据')
      return
    }

    // 2. 将部分记录改为on_sale状态
    // 模拟不同用户的上架情况
    const listingIds = withdrawnListings.map(l => l.listing_id)

    // 前5条改为on_sale，分配给不同用户
    const updateResult = await MarketListing.update(
      { status: 'on_sale' },
      {
        where: {
          listing_id: { [sequelize.Sequelize.Op.in]: listingIds.slice(0, 10) }
        }
      }
    )

    console.log(`✅ 已将 ${updateResult[0]} 条记录改为on_sale状态`)

    // 3. 查询更新后的统计
    const onSaleCount = await MarketListing.count({
      where: { status: 'on_sale' }
    })
    console.log(`\n📊 当前在售商品数量: ${onSaleCount}`)

    // 4. 查询用户上架统计
    const listingCounts = await MarketListing.findAll({
      where: { status: 'on_sale' },
      attributes: ['seller_user_id', [sequelize.fn('COUNT', sequelize.col('listing_id')), 'count']],
      group: ['seller_user_id'],
      raw: true
    })
    console.log(`📊 有在售商品的用户数: ${listingCounts.length}`)

    console.log('\n📋 用户上架详情:')
    for (const item of listingCounts) {
      const user = await User.findByPk(item.seller_user_id, {
        attributes: ['user_id', 'nickname', 'mobile', 'status']
      })
      console.log(
        `   - 用户ID: ${item.seller_user_id}, 昵称: ${user?.nickname || '-'}, 手机: ${user?.mobile || '-'}, 上架数: ${item.count}`
      )
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ 测试数据创建完成')
    console.log('💡 现在刷新 marketplace-stats.html 页面应该能看到数据')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('❌ 创建失败:', error.message)
    console.error(error.stack)
  } finally {
    process.exit(0)
  }
}

main()
