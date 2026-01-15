/**
 * 测试 marketplace 数据
 *
 * 直接查询数据库，检查MarketListing表是否有数据
 *
 * 使用方法:
 *   node test-marketplace-data.js
 */

require('dotenv').config()

async function main() {
  console.log('='.repeat(60))
  console.log('🔍 marketplace 数据检查')
  console.log('='.repeat(60))

  try {
    // 加载数据库模型
    const models = require('./models')
    const { MarketListing, User, sequelize } = models

    // 等待数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 1. 查询MarketListing表总数
    const totalListings = await MarketListing.count()
    console.log(`\n📊 MarketListing表总记录数: ${totalListings}`)

    // 2. 查询在售商品数量
    const onSaleCount = await MarketListing.count({
      where: { status: 'on_sale' }
    })
    console.log(`📊 在售商品数量: ${onSaleCount}`)

    // 3. 查询各状态的数量
    const statusCounts = await MarketListing.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('listing_id')), 'count']],
      group: ['status'],
      raw: true
    })
    console.log('\n📊 各状态商品数量:')
    statusCounts.forEach(item => {
      console.log(`   - ${item.status}: ${item.count}`)
    })

    // 4. 查询用户上架统计
    const listingCounts = await MarketListing.findAll({
      where: { status: 'on_sale' },
      attributes: ['seller_user_id', [sequelize.fn('COUNT', sequelize.col('listing_id')), 'count']],
      group: ['seller_user_id'],
      raw: true
    })
    console.log(`\n📊 有在售商品的用户数: ${listingCounts.length}`)

    if (listingCounts.length > 0) {
      console.log('\n📋 用户上架详情:')
      for (const item of listingCounts) {
        const user = await User.findByPk(item.seller_user_id, {
          attributes: ['user_id', 'nickname', 'mobile', 'status']
        })
        console.log(
          `   - 用户ID: ${item.seller_user_id}, 昵称: ${user?.nickname || '-'}, 上架数: ${item.count}`
        )
      }
    }

    // 5. 如果没有数据，显示创建测试数据的建议
    if (totalListings === 0) {
      console.log('\n💡 MarketListing表为空，这是页面显示"暂无数据"的原因')
      console.log('💡 需要用户在C2C市场上架商品才会有统计数据')
    }

    // 6. 检查User表
    const totalUsers = await User.count()
    const adminUsers = await User.count({
      include: [
        {
          model: models.UserRole,
          as: 'roles',
          required: true
        }
      ]
    })
    console.log(`\n📊 User表总用户数: ${totalUsers}`)
    console.log(`📊 有角色的用户数: ${adminUsers}`)

    // 7. 列出一些示例用户
    const sampleUsers = await User.findAll({
      limit: 5,
      attributes: ['user_id', 'nickname', 'mobile', 'status'],
      order: [['user_id', 'ASC']]
    })
    if (sampleUsers.length > 0) {
      console.log('\n📋 示例用户:')
      sampleUsers.forEach(user => {
        console.log(
          `   - ID: ${user.user_id}, 昵称: ${user.nickname || '-'}, 手机: ${user.mobile || '-'}, 状态: ${user.status}`
        )
      })
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ 数据检查完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    console.error(error.stack)
  } finally {
    process.exit(0)
  }
}

main()
