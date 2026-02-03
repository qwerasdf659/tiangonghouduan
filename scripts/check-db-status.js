#!/usr/bin/env node
/**
 * 数据库状态检查脚本
 * 用于对比后端需求文档与实际数据库/代码状态
 * 
 * 运行方式：node scripts/check-db-status.js
 */

require('dotenv').config()
const { sequelize } = require('../config/database')

async function checkDatabaseStatus() {
  console.log('🔍 数据库状态检查脚本 - 运营后台优化需求对比')
  console.log('=' .repeat(60))
  
  try {
    // 1. 检查数据库连接
    console.log('\n📊 1. 数据库连接测试...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')
    
    // 2. 获取所有表信息
    console.log('\n📊 2. 数据库表统计...')
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, CREATE_TIME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `)
    console.log(`📋 数据库共有 ${tables.length} 张表`)
    
    // 3. 检查需求文档中提到的核心表
    console.log('\n📊 3. 核心表数据量检查...')
    const coreTables = [
      { name: 'users', desc: '用户信息' },
      { name: 'lottery_draws', desc: '抽奖记录' },
      { name: 'consumption_records', desc: '消费记录' },
      { name: 'customer_service_sessions', desc: '客服会话' },
      { name: 'admin_operation_logs', desc: '操作审计' },
      { name: 'lottery_management_settings', desc: '抽奖预设' },
      { name: 'item_instances', desc: '物品实例' },
      { name: 'market_listings', desc: '市场挂牌' },
      { name: 'trade_orders', desc: '交易订单' },
      { name: 'asset_transactions', desc: '资产流水' },
      { name: 'account_asset_balances', desc: '资产余额' },
      { name: 'material_asset_types', desc: '资产类型' },
      { name: 'user_behavior_tracks', desc: '用户行为' },
      { name: 'user_risk_profiles', desc: '风控画像' },
      { name: 'lottery_alerts', desc: '抽奖告警' },
      { name: 'risk_alerts', desc: '风控告警' }
    ]
    
    for (const table of coreTables) {
      try {
        const [[result]] = await sequelize.query(`SELECT COUNT(*) as cnt FROM ${table.name}`)
        console.log(`  📋 ${table.name}: ${result.cnt} 条记录 (${table.desc})`)
      } catch (err) {
        console.log(`  ❌ ${table.name}: 表不存在或查询失败 (${table.desc})`)
      }
    }
    
    // 4. 检查待办相关数据
    console.log('\n📊 4. 待办事项数据检查...')
    
    // 待审核消费记录
    try {
      const [[pending]] = await sequelize.query(`
        SELECT COUNT(*) as cnt FROM consumption_records WHERE status = 'pending'
      `)
      console.log(`  📋 待审核消费记录: ${pending.cnt} 条`)
    } catch (err) {
      console.log(`  ❌ 消费记录查询失败: ${err.message}`)
    }
    
    // 活跃客服会话
    try {
      const [[sessions]] = await sequelize.query(`
        SELECT COUNT(*) as cnt FROM customer_service_sessions 
        WHERE status IN ('waiting', 'assigned', 'active')
      `)
      console.log(`  📋 活跃客服会话: ${sessions.cnt} 条`)
    } catch (err) {
      console.log(`  ❌ 客服会话查询失败: ${err.message}`)
    }
    
    // 活跃告警
    try {
      const [[alerts]] = await sequelize.query(`
        SELECT COUNT(*) as cnt FROM lottery_alerts WHERE status = 'active'
      `)
      console.log(`  📋 活跃抽奖告警: ${alerts.cnt} 条`)
    } catch (err) {
      console.log(`  ❌ 抽奖告警查询失败: ${err.message}`)
    }
    
    // 5. 检查抽奖数据统计
    console.log('\n📊 5. 抽奖数据统计...')
    try {
      const [[stats]] = await sequelize.query(`
        SELECT 
          COUNT(*) as total_draws,
          SUM(CASE WHEN is_winner = 1 THEN 1 ELSE 0 END) as wins,
          COUNT(DISTINCT user_id) as unique_users
        FROM lottery_draws
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      `)
      console.log(`  📋 近7天抽奖: ${stats.total_draws} 次, 中奖 ${stats.wins} 次, 独立用户 ${stats.unique_users} 人`)
      if (stats.total_draws > 0) {
        const winRate = ((stats.wins / stats.total_draws) * 100).toFixed(2)
        console.log(`  📋 中奖率: ${winRate}%`)
      }
    } catch (err) {
      console.log(`  ❌ 抽奖统计查询失败: ${err.message}`)
    }
    
    // 6. 检查资产数据
    console.log('\n📊 6. 资产数据统计...')
    try {
      const [assetStats] = await sequelize.query(`
        SELECT 
          asset_code,
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_income,
          SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_expense,
          COUNT(*) as tx_count
        FROM asset_transactions
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY asset_code
        ORDER BY tx_count DESC
        LIMIT 5
      `)
      for (const asset of assetStats) {
        console.log(`  📋 ${asset.asset_code}: 收入 ${asset.total_income}, 支出 ${asset.total_expense}, 交易 ${asset.tx_count} 笔`)
      }
    } catch (err) {
      console.log(`  ❌ 资产统计查询失败: ${err.message}`)
    }
    
    // 7. 检查用户分布
    console.log('\n📊 7. 用户角色分布...')
    try {
      const [roles] = await sequelize.query(`
        SELECT 
          ur.role_name,
          COUNT(DISTINCT ur.user_id) as user_count
        FROM user_roles ur
        GROUP BY ur.role_name
        ORDER BY user_count DESC
      `)
      for (const role of roles) {
        console.log(`  📋 ${role.role_name}: ${role.user_count} 人`)
      }
    } catch (err) {
      console.log(`  ❌ 用户角色查询失败: ${err.message}`)
    }
    
    // 8. 检查系统健康状态
    console.log('\n📊 8. 系统健康状态...')
    try {
      // 数据库版本
      const [[version]] = await sequelize.query('SELECT VERSION() as version')
      console.log(`  📋 MySQL版本: ${version.version}`)
      
      // 连接池状态
      const pool = sequelize.connectionManager.pool
      console.log(`  📋 连接池: 总大小=${pool.size}, 可用=${pool.available}, 等待=${pool.pending}`)
    } catch (err) {
      console.log(`  ❌ 系统状态查询失败: ${err.message}`)
    }
    
    // 9. 检查需求文档中提到的特定字段是否存在
    console.log('\n📊 9. 关键字段检查...')
    const fieldChecks = [
      { table: 'consumption_records', field: 'anomaly_score', desc: '异常分数' },
      { table: 'consumption_records', field: 'reviewed_by', desc: '审核人' },
      { table: 'consumption_records', field: 'reviewed_at', desc: '审核时间' },
      { table: 'lottery_draws', field: 'prize_value', desc: '奖品价值' },
      { table: 'lottery_draws', field: 'is_preset', desc: '是否预设' },
      { table: 'lottery_draws', field: 'advance_amount', desc: '垫付金额' },
      { table: 'customer_service_sessions', field: 'first_response_at', desc: '首次响应时间' },
      { table: 'asset_transactions', field: 'change_type', desc: '变动类型' }
    ]
    
    for (const check of fieldChecks) {
      try {
        const [columns] = await sequelize.query(`
          SELECT COLUMN_NAME FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = '${check.table}' 
          AND COLUMN_NAME = '${check.field}'
        `)
        if (columns.length > 0) {
          console.log(`  ✅ ${check.table}.${check.field} 存在 (${check.desc})`)
        } else {
          console.log(`  ❌ ${check.table}.${check.field} 不存在 (${check.desc})`)
        }
      } catch (err) {
        console.log(`  ⚠️ ${check.table}.${check.field} 检查失败: ${err.message}`)
      }
    }
    
    console.log('\n' + '=' .repeat(60))
    console.log('✅ 数据库状态检查完成')
    
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message)
  } finally {
    await sequelize.close()
  }
}

checkDatabaseStatus()

