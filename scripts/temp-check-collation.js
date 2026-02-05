#!/usr/bin/env node
/**
 * 临时脚本：诊断数据库表字符集校对规则问题
 * 
 * 完成后请删除此脚本
 * @date 2026-02-06
 */

'use strict'

require('dotenv').config()

const { Sequelize } = require('sequelize')

async function checkCollations() {
  console.log('='.repeat(60))
  console.log('🔍 数据库表字符集校对规则诊断')
  console.log('='.repeat(60))
  
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: false
    }
  )

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 查询相关表的校对规则
    const tables = [
      'lottery_draws',
      'lottery_draw_decisions',
      'lottery_campaigns',
      'lottery_hourly_metrics',
      'lottery_daily_metrics',
      'users'
    ]

    console.log('📋 相关表的字符集和校对规则:')
    console.log('-'.repeat(60))
    
    for (const tableName of tables) {
      const [result] = await sequelize.query(`
        SELECT 
          TABLE_NAME,
          TABLE_COLLATION
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      `, {
        replacements: [process.env.DB_NAME, tableName]
      })
      
      if (result.length > 0) {
        console.log(`📦 ${tableName}: ${result[0].TABLE_COLLATION}`)
      } else {
        console.log(`❌ ${tableName}: 表不存在`)
      }
    }

    // 查询列的校对规则
    console.log('\n📋 关键字段的字符集和校对规则:')
    console.log('-'.repeat(60))

    const columnsToCheck = [
      { table: 'lottery_draws', column: 'lottery_campaign_id' },
      { table: 'lottery_draw_decisions', column: 'lottery_draw_id' },
      { table: 'lottery_draw_decisions', column: 'budget_tier' },
      { table: 'lottery_campaigns', column: 'lottery_campaign_id' }
    ]

    for (const { table, column } of columnsToCheck) {
      const [result] = await sequelize.query(`
        SELECT 
          TABLE_NAME,
          COLUMN_NAME,
          CHARACTER_SET_NAME,
          COLLATION_NAME
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
      `, {
        replacements: [process.env.DB_NAME, table, column]
      })
      
      if (result.length > 0) {
        const { TABLE_NAME, COLUMN_NAME, CHARACTER_SET_NAME, COLLATION_NAME } = result[0]
        console.log(`📦 ${TABLE_NAME}.${COLUMN_NAME}: ${CHARACTER_SET_NAME || 'N/A'} / ${COLLATION_NAME || 'N/A'}`)
      }
    }

    // 检查数据库默认字符集
    console.log('\n📋 数据库默认配置:')
    console.log('-'.repeat(60))
    
    const [dbConfig] = await sequelize.query(`
      SELECT 
        DEFAULT_CHARACTER_SET_NAME,
        DEFAULT_COLLATION_NAME
      FROM information_schema.SCHEMATA 
      WHERE SCHEMA_NAME = ?
    `, {
      replacements: [process.env.DB_NAME]
    })
    
    if (dbConfig.length > 0) {
      console.log(`📦 数据库字符集: ${dbConfig[0].DEFAULT_CHARACTER_SET_NAME}`)
      console.log(`📦 数据库校对规则: ${dbConfig[0].DEFAULT_COLLATION_NAME}`)
    }

    // 找出校对规则不一致的表
    console.log('\n📋 校对规则不一致问题检查:')
    console.log('-'.repeat(60))
    
    const [allTables] = await sequelize.query(`
      SELECT TABLE_NAME, TABLE_COLLATION
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_COLLATION, TABLE_NAME
    `, {
      replacements: [process.env.DB_NAME]
    })

    const collationGroups = {}
    allTables.forEach(({ TABLE_NAME, TABLE_COLLATION }) => {
      if (!collationGroups[TABLE_COLLATION]) {
        collationGroups[TABLE_COLLATION] = []
      }
      collationGroups[TABLE_COLLATION].push(TABLE_NAME)
    })

    const collationTypes = Object.keys(collationGroups)
    if (collationTypes.length > 1) {
      console.log('⚠️ 检测到多种校对规则，这可能导致 JOIN 查询错误:')
      for (const [collation, tableNames] of Object.entries(collationGroups)) {
        console.log(`\n  🔹 ${collation} (${tableNames.length}个表):`)
        tableNames.slice(0, 10).forEach(name => console.log(`     - ${name}`))
        if (tableNames.length > 10) {
          console.log(`     ... 还有 ${tableNames.length - 10} 个表`)
        }
      }

      // 输出修复建议
      console.log('\n')
      console.log('='.repeat(60))
      console.log('💡 修复建议:')
      console.log('='.repeat(60))
      console.log('需要统一所有表的校对规则。建议使用 utf8mb4_unicode_ci:')
      console.log('')
      
      // 找出需要修改的表
      const targetCollation = 'utf8mb4_unicode_ci'
      for (const [collation, tableNames] of Object.entries(collationGroups)) {
        if (collation !== targetCollation) {
          console.log(`-- 将 ${collation} 改为 ${targetCollation}:`)
          tableNames.forEach(tableName => {
            console.log(`ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE ${targetCollation};`)
          })
          console.log('')
        }
      }
    } else {
      console.log('✅ 所有表使用相同的校对规则，无冲突')
    }

  } catch (error) {
    console.error('❌ 诊断失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }

  console.log('\n='.repeat(60))
  console.log('诊断完成')
  console.log('='.repeat(60))
}

checkCollations()

