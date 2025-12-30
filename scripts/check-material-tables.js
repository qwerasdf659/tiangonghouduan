#!/usr/bin/env node
/**
 * 检查材料系统相关表的实际字段
 */

const { Sequelize } = require('sequelize')
require('dotenv').config()
// 🔴 复用主 sequelize 实例（单一配置源）
const { sequelize } = require('../config/database')

async function checkTables() {
  try {
    await sequelize.authenticate()

    const tablesToCheck = [
      'material_asset_types',
      'user_material_balances',
      'material_conversion_rules',
      'material_transactions',
      'user_diamond_accounts',
      'diamond_transactions'
    ]

    console.log('检查材料系统相关表的实际字段：\n')

    for (const tableName of tablesToCheck) {
      const [tableExists] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`)

      if (tableExists.length > 0) {
        const [columns] = await sequelize.query(`SHOW COLUMNS FROM \`${tableName}\``)
        console.log(`表: ${tableName}`)
        console.log('实际字段:')
        columns.forEach(col => {
          console.log(`  - ${col.Field} (${col.Type})`)
        })
        console.log()
      } else {
        console.log(`表: ${tableName} - 不存在\n`)
      }
    }

    await sequelize.close()
  } catch (error) {
    console.error('错误:', error.message)
    process.exit(1)
  }
}

checkTables()
