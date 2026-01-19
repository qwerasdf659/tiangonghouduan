#!/usr/bin/env node
/**
 * 清空市场挂单表 - 一次性脚本
 *
 * 功能说明：
 * - 清空 market_listings 表中的所有测试数据
 * - 仅用于项目未上线阶段的数据清理
 *
 * 执行场景：
 * - 市场分类参数兼容性清理（2026-01-19 决策）
 * - 清空 258 条 withdrawn 状态的测试挂单
 *
 * 使用方法：
 * node scripts/maintenance/truncate_market_listings.js
 *
 * 安全措施：
 * - 清空前显示当前数据统计
 * - 清空后验证结果
 *
 * 创建时间：2026-01-19
 */

require('dotenv').config()
const { sequelize } = require('../../config/database')

/**
 * 获取市场挂单统计信息
 * @returns {Promise<Object>} 统计数据
 */
async function getMarketListingsStats() {
  const [results] = await sequelize.query(`
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'on_sale' THEN 1 ELSE 0 END) AS on_sale,
      SUM(CASE WHEN status = 'withdrawn' THEN 1 ELSE 0 END) AS withdrawn,
      SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) AS sold,
      SUM(CASE WHEN listing_kind = 'item_instance' THEN 1 ELSE 0 END) AS item_instance,
      SUM(CASE WHEN listing_kind = 'fungible_asset' THEN 1 ELSE 0 END) AS fungible_asset
    FROM market_listings
  `)
  return results[0]
}

/**
 * 执行清空市场挂单表
 */
async function truncateMarketListings() {
  console.log('🔍 市场挂单表清空脚本 - 2026-01-19')
  console.log('=' .repeat(50))

  try {
    // 1. 连接数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 2. 清空前统计
    console.log('\n📊 清空前数据统计:')
    const beforeStats = await getMarketListingsStats()
    console.log(`   总数: ${beforeStats.total}`)
    console.log(`   - on_sale: ${beforeStats.on_sale || 0}`)
    console.log(`   - withdrawn: ${beforeStats.withdrawn || 0}`)
    console.log(`   - sold: ${beforeStats.sold || 0}`)
    console.log(`   - item_instance: ${beforeStats.item_instance || 0}`)
    console.log(`   - fungible_asset: ${beforeStats.fungible_asset || 0}`)

    // 3. 执行清空（使用 DELETE 避免外键约束问题）
    console.log('\n🗑️ 执行 DELETE FROM market_listings ...')
    const [, deleteResult] = await sequelize.query('DELETE FROM market_listings')
    console.log(`✅ 清空完成，影响行数: ${deleteResult?.affectedRows || beforeStats.total}`)

    // 4. 重置自增ID（清空后从1开始）
    console.log('\n🔄 重置自增ID ...')
    await sequelize.query('ALTER TABLE market_listings AUTO_INCREMENT = 1')
    console.log('✅ 自增ID已重置')

    // 5. 清空后验证
    console.log('\n📊 清空后验证:')
    const afterStats = await getMarketListingsStats()
    console.log(`   总数: ${afterStats.total}`)

    if (parseInt(afterStats.total) === 0) {
      console.log('\n✅ 验证成功：market_listings 表已清空')
    } else {
      console.log('\n⚠️ 警告：表中仍有数据，请检查')
    }

    console.log('\n' + '=' .repeat(50))
    console.log('🎉 清空操作完成')

  } catch (error) {
    console.error('\n❌ 执行失败:', error.message)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行主函数
truncateMarketListings()

