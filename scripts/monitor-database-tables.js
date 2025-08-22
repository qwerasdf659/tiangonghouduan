/**
 * 数据库表数量监控脚本
 * 用于监控表数量和性能指标
 */

const { sequelize } = require('../config/database')
const { QueryTypes } = require('sequelize')

/**
 * 获取数据库表统计信息
 */
async function getTableStatistics () {
  try {
    console.log('📊 数据库表统计分析')
    console.log('='.repeat(50))

    // 1. 获取所有表
    const tables = await sequelize.query('SHOW TABLES', { type: QueryTypes.SELECT })
    const tableNames = tables.map(table => Object.values(table)[0])

    console.log(`📋 当前表数量: ${tables.length}`)
    console.log('📋 表名列表:')
    tableNames.forEach((name, index) => {
      console.log(`  ${index + 1}. ${name}`)
    })

    // 2. 获取表大小信息
    const tableSizes = await sequelize.query(
      `
      SELECT 
        TABLE_NAME as table_name,
        ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) as size_mb,
        TABLE_ROWS as row_count
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
    `,
      { type: QueryTypes.SELECT }
    )

    console.log('\n📊 表大小统计 (前10个):')
    tableSizes.slice(0, 10).forEach((table, index) => {
      console.log(`  ${index + 1}. ${table.table_name}: ${table.size_mb}MB (${table.row_count} 行)`)
    })

    // 3. 计算总大小
    const totalSize = tableSizes.reduce((sum, table) => sum + parseFloat(table.size_mb || 0), 0)
    console.log(`\n💾 数据库总大小: ${totalSize.toFixed(2)}MB`)

    // 4. 获取缓存配置
    const cacheInfo = await sequelize.query(
      `
      SELECT 
        @@table_definition_cache as definition_cache,
        @@table_open_cache as open_cache,
        @@innodb_file_per_table as file_per_table
    `,
      { type: QueryTypes.SELECT }
    )

    console.log('\n🔧 缓存配置:')
    console.log(`  - 表定义缓存: ${cacheInfo[0].definition_cache}`)
    console.log(`  - 表打开缓存: ${cacheInfo[0].open_cache}`)
    console.log(`  - 独立表文件: ${cacheInfo[0].file_per_table ? '开启' : '关闭'}`)

    // 5. 安全评估
    const safeLimit = 1000
    const usageRate = ((tables.length / safeLimit) * 100).toFixed(1)
    const remainingSpace = safeLimit - tables.length

    console.log('\n🎯 容量评估:')
    console.log(`  - 安全限制: ${safeLimit} 个表`)
    console.log(`  - 当前使用: ${tables.length} 个表`)
    console.log(`  - 使用率: ${usageRate}%`)
    console.log(`  - 剩余空间: ${remainingSpace} 个表`)

    if (usageRate < 10) {
      console.log('  - 状态: 🟢 非常安全')
    } else if (usageRate < 50) {
      console.log('  - 状态: 🟡 正常')
    } else if (usageRate < 80) {
      console.log('  - 状态: 🟠 需要关注')
    } else {
      console.log('  - 状态: 🔴 需要优化')
    }

    return {
      tableCount: tables.length,
      totalSize,
      usageRate: parseFloat(usageRate),
      remainingSpace,
      tables: tableNames,
      tableSizes
    }
  } catch (error) {
    console.error('❌ 获取表统计信息失败:', error.message)
    throw error
  }
}

/**
 * 检查表数量增长趋势
 */
async function checkGrowthTrend () {
  try {
    // 这里可以实现表数量增长趋势分析
    // 需要历史数据支持
    console.log('\n📈 增长趋势分析:')
    console.log('  - 需要历史数据支持，建议定期运行此脚本记录数据')
  } catch (error) {
    console.error('❌ 增长趋势分析失败:', error.message)
  }
}

/**
 * 生成建议
 */
function generateRecommendations (stats) {
  console.log('\n💡 建议:')

  if (stats.usageRate < 10) {
    console.log('  ✅ 当前表数量很少，可以放心添加新表')
    console.log('  ✅ 建议按业务模块合理规划表结构')
  } else if (stats.usageRate < 50) {
    console.log('  ✅ 表数量在正常范围内')
    console.log('  💡 建议定期清理不需要的表')
  } else if (stats.usageRate < 80) {
    console.log('  ⚠️ 表数量较多，需要关注性能')
    console.log('  💡 建议考虑分库分表策略')
    console.log('  💡 建议增加表缓存配置')
  } else {
    console.log('  🚨 表数量过多，需要立即优化')
    console.log('  🔧 建议实施分库分表方案')
    console.log('  🔧 建议清理历史数据和无用表')
  }

  // 大表建议
  const largeTables = stats.tableSizes.filter(table => table.size_mb > 100)
  if (largeTables.length > 0) {
    console.log('\n📦 大表优化建议:')
    largeTables.forEach(table => {
      console.log(`  - ${table.table_name} (${table.size_mb}MB): 考虑数据归档或分表`)
    })
  }
}

/**
 * 主函数
 */
async function main () {
  try {
    console.log('🚀 启动数据库表监控...')

    const stats = await getTableStatistics()
    await checkGrowthTrend()
    generateRecommendations(stats)

    console.log('\n🎉 数据库表监控完成!')
    process.exit(0)
  } catch (error) {
    console.error('💥 监控失败:', error.message)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = {
  getTableStatistics,
  checkGrowthTrend,
  generateRecommendations
}
