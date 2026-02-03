#!/usr/bin/env node
/**
 * 检查关键表的实际字段结构
 */

require('dotenv').config()
const { sequelize } = require('../config/database')

async function checkTableStructure() {
  console.log('🔍 关键表结构检查')
  console.log('=' .repeat(60))
  
  try {
    await sequelize.authenticate()
    
    const tables = [
      'lottery_draws',
      'asset_transactions', 
      'user_roles',
      'consumption_records',
      'customer_service_sessions'
    ]
    
    for (const table of tables) {
      console.log(`\n📋 表: ${table}`)
      console.log('-'.repeat(40))
      
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = '${table}'
        ORDER BY ORDINAL_POSITION
      `)
      
      for (const col of columns) {
        console.log(`  ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'NO' ? 'NOT NULL' : ''}`)
      }
    }
    
    // 检查抽奖统计相关字段
    console.log('\n\n📊 lottery_draws 表数据示例:')
    const [draws] = await sequelize.query(`SELECT * FROM lottery_draws LIMIT 1`)
    if (draws.length > 0) {
      console.log('可用字段:', Object.keys(draws[0]).join(', '))
    }
    
    // 检查资产交易相关字段  
    console.log('\n📊 asset_transactions 表数据示例:')
    const [txs] = await sequelize.query(`SELECT * FROM asset_transactions LIMIT 1`)
    if (txs.length > 0) {
      console.log('可用字段:', Object.keys(txs[0]).join(', '))
    }
    
    // 检查用户角色相关字段
    console.log('\n📊 user_roles 表数据示例:')
    const [roles] = await sequelize.query(`SELECT * FROM user_roles LIMIT 1`)
    if (roles.length > 0) {
      console.log('可用字段:', Object.keys(roles[0]).join(', '))
    }
    
    // 实际数据统计
    console.log('\n\n📊 实际数据统计（使用正确字段）:')
    
    // 抽奖统计
    const [[lotteryStats]] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_draws,
        COUNT(DISTINCT user_id) as unique_users
      FROM lottery_draws
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `)
    console.log(`  近7天抽奖: ${lotteryStats.total_draws} 次, 独立用户 ${lotteryStats.unique_users} 人`)
    
    // 资产交易统计
    const [[txStats]] = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM asset_transactions
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `)
    console.log(`  近7天资产交易: ${txStats.cnt} 笔`)
    
    // 用户角色分布
    const [roleDistribution] = await sequelize.query(`
      SELECT role_level, COUNT(*) as cnt 
      FROM user_roles 
      GROUP BY role_level 
      ORDER BY role_level DESC
    `)
    console.log(`  角色分布:`, roleDistribution.map(r => `level ${r.role_level}: ${r.cnt}人`).join(', '))
    
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
  } finally {
    await sequelize.close()
  }
}

checkTableStructure()

