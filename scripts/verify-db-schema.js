#!/usr/bin/env node
/**
 * 数据库表结构验证脚本
 * 验证所有迁移后的表和字段是否正确创建
 */

const { Sequelize } = require('sequelize')

// 加载环境变量
require('dotenv').config()

// 🔴 复用主 sequelize 实例（单一配置源）
const { sequelize } = require('../config/database')

// 需要验证的表和字段
const TABLES_TO_VERIFY = {
  user_asset_accounts: [
    'asset_account_id',
    'user_id',
    'asset_code',
    'available_amount',
    'created_at',
    'updated_at'
  ],
  asset_transactions: [
    'transaction_id',
    'user_id',
    'asset_code',
    'delta_amount',
    'balance_after',
    'business_id',
    'business_type',
    'meta',
    'created_at'
  ],
  user_inventory: ['selling_asset_code', 'selling_amount'],
  trade_records: ['asset_code', 'gross_amount', 'fee_amount', 'net_amount', 'business_id'],
  exchange_items: ['cost_asset_code', 'cost_amount'],
  exchange_market_records: ['pay_asset_code', 'pay_amount'],
  material_asset_types: ['asset_code', 'display_name', 'group_code', 'form', 'tier', 'is_enabled'],
  user_material_balances: ['balance_id', 'user_id', 'asset_code', 'balance'],
  material_conversion_rules: [
    'rule_id',
    'from_asset_code',
    'to_asset_code',
    'from_amount',
    'to_amount',
    'is_enabled'
  ],
  material_transactions: [
    'tx_id',
    'user_id',
    'asset_code',
    'tx_type',
    'amount',
    'balance_before',
    'balance_after',
    'business_id',
    'business_type'
  ],
  user_diamond_accounts: ['account_id', 'user_id', 'balance'],
  diamond_transactions: [
    'tx_id',
    'user_id',
    'tx_type',
    'amount',
    'balance_before',
    'balance_after',
    'business_id',
    'business_type'
  ]
}

/**
 * 查询表结构
 */
async function getTableColumns(tableName) {
  const [results] = await sequelize.query(`SHOW COLUMNS FROM \`${tableName}\``)
  return results.map(col => col.Field)
}

/**
 * 验证表和字段
 */
async function verifySchema() {
  console.log('========================================')
  console.log('  数据库表结构验证')
  console.log('========================================\n')

  let allPassed = true
  const results = []

  for (const [tableName, expectedFields] of Object.entries(TABLES_TO_VERIFY)) {
    try {
      // 检查表是否存在
      const [tableExists] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`)

      if (tableExists.length === 0) {
        results.push({
          table: tableName,
          status: '❌ 失败',
          message: '表不存在'
        })
        allPassed = false
        continue
      }

      // 获取实际字段
      const actualColumns = await getTableColumns(tableName)

      // 检查字段是否存在
      const missingFields = expectedFields.filter(field => !actualColumns.includes(field))

      if (missingFields.length > 0) {
        results.push({
          table: tableName,
          status: '❌ 失败',
          message: `缺失字段: ${missingFields.join(', ')}`
        })
        allPassed = false
      } else {
        results.push({
          table: tableName,
          status: '✅ 通过',
          message: `所有字段正确 (${expectedFields.length}个)`
        })
      }
    } catch (error) {
      results.push({
        table: tableName,
        status: '❌ 错误',
        message: error.message
      })
      allPassed = false
    }
  }

  // 打印结果
  console.log('验证结果：\n')
  results.forEach(result => {
    console.log(`[${result.status}] ${result.table}`)
    console.log(`    ${result.message}\n`)
  })

  console.log('========================================')
  if (allPassed) {
    console.log('✅ 所有表结构验证通过')
  } else {
    console.log('❌ 存在表结构问题，请检查')
  }
  console.log('========================================\n')

  return allPassed
}

/**
 * 验证索引
 */
async function verifyIndexes() {
  console.log('========================================')
  console.log('  数据库索引验证')
  console.log('========================================\n')

  const INDEXES_TO_VERIFY = {
    user_asset_accounts: ['uk_user_asset', 'idx_asset_code', 'idx_user_id'],
    asset_transactions: [
      'uk_business_idempotency',
      'idx_user_asset_time',
      'idx_business_type_time'
    ],
    trade_records: ['uk_trade_records_business_id']
  }

  let allPassed = true

  for (const [tableName, expectedIndexes] of Object.entries(INDEXES_TO_VERIFY)) {
    try {
      const [indexes] = await sequelize.query(`SHOW INDEX FROM \`${tableName}\``)
      const indexNames = [...new Set(indexes.map(idx => idx.Key_name))]

      console.log(`表: ${tableName}`)
      expectedIndexes.forEach(indexName => {
        const exists = indexNames.includes(indexName)
        console.log(`  ${exists ? '✅' : '❌'} 索引: ${indexName} ${exists ? '存在' : '缺失'}`)
        if (!exists) allPassed = false
      })
      console.log()
    } catch (error) {
      console.log(`❌ 表 ${tableName} 索引验证失败: ${error.message}\n`)
      allPassed = false
    }
  }

  console.log('========================================')
  if (allPassed) {
    console.log('✅ 所有索引验证通过')
  } else {
    console.log('❌ 存在索引问题，请检查')
  }
  console.log('========================================\n')

  return allPassed
}

/**
 * 主函数
 */
async function main() {
  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 验证表结构
    const schemaPass = await verifySchema()

    // 验证索引
    const indexPass = await verifyIndexes()

    // 关闭连接
    await sequelize.close()

    // 退出状态码
    process.exit(schemaPass && indexPass ? 0 : 1)
  } catch (error) {
    console.error('❌ 验证失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
