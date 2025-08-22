/**
 * 🔥 检查用户行为分析系统数据表结构
 * 使用Node.js脚本检查数据库表，不依赖MySQL客户端
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')

// 🔥 直接从环境变量读取数据库配置
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  dialect: 'mysql',
  logging: false // 减少日志输出
})

async function checkAnalyticsTables () {
  console.log('🔍 开始检查用户行为分析系统数据表结构...')

  try {
    // 1. 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 2. 检查analytics相关的表
    const analyticsTableNames = [
      'analytics_behaviors',
      'analytics_user_profiles',
      'analytics_recommendations',
      'analytics_realtime_stats'
    ]

    const tableResults = []

    for (const tableName of analyticsTableNames) {
      try {
        // 检查表是否存在
        const [results] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`)

        if (results.length > 0) {
          console.log(`✅ 表 ${tableName} 存在`)

          // 获取表结构
          const [columns] = await sequelize.query(`DESCRIBE ${tableName}`)
          console.log(`   - 字段数量: ${columns.length}`)

          // 获取索引信息
          const [indexes] = await sequelize.query(`SHOW INDEX FROM ${tableName}`)
          const uniqueIndexes = [...new Set(indexes.map(idx => idx.Key_name))]
          console.log(`   - 索引数量: ${uniqueIndexes.length}`)

          tableResults.push({
            name: tableName,
            exists: true,
            columns: columns.length,
            indexes: uniqueIndexes.length,
            columnDetails: columns.map(col => ({
              field: col.Field,
              type: col.Type,
              null: col.Null,
              key: col.Key,
              default: col.Default
            }))
          })
        } else {
          console.log(`❌ 表 ${tableName} 不存在`)
          tableResults.push({
            name: tableName,
            exists: false
          })
        }
      } catch (error) {
        console.error(`❌ 检查表 ${tableName} 失败:`, error.message)
        tableResults.push({
          name: tableName,
          exists: false,
          error: error.message
        })
      }
    }

    // 3. 检查外键约束
    console.log('\n🔗 检查外键约束:')
    try {
      const [foreignKeys] = await sequelize.query(`
        SELECT
          TABLE_NAME,
          COLUMN_NAME,
          CONSTRAINT_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM
          INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE
          REFERENCED_TABLE_NAME IS NOT NULL
          AND TABLE_SCHEMA = '${process.env.DB_DATABASE}'
          AND TABLE_NAME LIKE 'analytics_%'
      `)

      if (foreignKeys.length > 0) {
        foreignKeys.forEach(fk => {
          console.log(
            `   ✅ ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`
          )
        })
      } else {
        console.log('   ⚠️  未找到analytics表的外键约束')
      }
    } catch (error) {
      console.error('   ❌ 检查外键约束失败:', error.message)
    }

    // 4. 汇总报告
    console.log('\n📊 检查结果汇总:')
    const existingTables = tableResults.filter(t => t.exists)
    const missingTables = tableResults.filter(t => !t.exists)

    console.log(`   ✅ 已存在的表: ${existingTables.length}/${analyticsTableNames.length}`)
    if (missingTables.length > 0) {
      console.log(`   ❌ 缺失的表: ${missingTables.map(t => t.name).join(', ')}`)
      console.log('   💡 建议运行: npx sequelize-cli db:migrate')
    }

    // 5. 检查表数据量
    if (existingTables.length > 0) {
      console.log('\n📈 表数据统计:')
      for (const table of existingTables) {
        try {
          const [countResult] = await sequelize.query(`SELECT COUNT(*) as count FROM ${table.name}`)
          console.log(`   📊 ${table.name}: ${countResult[0].count} 条记录`)
        } catch (error) {
          console.log(`   ❌ ${table.name}: 统计失败 - ${error.message}`)
        }
      }
    }

    return {
      success: true,
      existingTables: existingTables.length,
      totalTables: analyticsTableNames.length,
      missingTables: missingTables.map(t => t.name),
      tableDetails: tableResults
    }
  } catch (error) {
    console.error('❌ 数据库检查失败:', error)
    return {
      success: false,
      error: error.message
    }
  } finally {
    await sequelize.close()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  checkAnalyticsTables()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 数据表检查完成')
        if (result.missingTables.length === 0) {
          console.log('✅ 所有analytics表都已正确创建')
          process.exit(0)
        } else {
          console.log('⚠️  存在缺失的表，需要运行迁移')
          process.exit(1)
        }
      } else {
        console.log('\n❌ 数据表检查失败')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('脚本执行失败:', error)
      process.exit(1)
    })
}

module.exports = checkAnalyticsTables
