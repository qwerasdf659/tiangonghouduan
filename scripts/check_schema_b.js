#!/usr/bin/env node
/**
 * 检查方案B升级后的数据库真实状态
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')
// 🔴 复用主 sequelize 实例（单一配置源）
const { sequelize } = require('../config/database')

;(async () => {
  try {
    console.log('=== 方案B数据库状态检查 ===\n')

    // 1. asset_transactions 表结构
    console.log('【1】asset_transactions 表结构:')
    const [assetTxSchema] = await sequelize.query('SHOW CREATE TABLE asset_transactions')
    console.log(assetTxSchema[0]['Create Table'])

    console.log('\n【2】api_idempotency_requests 表结构:')
    const [apiIdempSchema] = await sequelize.query('SHOW CREATE TABLE api_idempotency_requests')
    console.log(apiIdempSchema[0]['Create Table'])

    console.log('\n【3】asset_transactions 最新5条数据（验证幂等键格式）:')
    const [recentData] = await sequelize.query(
      `SELECT 
        idempotency_key, 
        lottery_session_id, 
        business_type,
        created_at
      FROM asset_transactions 
      ORDER BY created_at DESC 
      LIMIT 5`
    )
    console.log(JSON.stringify(recentData, null, 2))

    console.log('\n【4】api_idempotency_requests 最新3条数据:')
    const [apiData] = await sequelize.query(
      `SELECT 
        idempotency_key,
        business_event_id,
        status,
        api_path,
        created_at
      FROM api_idempotency_requests
      ORDER BY created_at DESC
      LIMIT 3`
    )
    console.log(JSON.stringify(apiData, null, 2))

    await sequelize.close()
    console.log('\n✅ 检查完成')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
})()
