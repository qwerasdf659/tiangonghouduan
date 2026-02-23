/**
 * 验证重构方案文档中的各项决策
 * 连接真实数据库，验证文档声明是否与实际状态一致
 */
require('dotenv').config()
const { sequelize } = require('../config/database')

async function verifyDecisions() {
  try {
    console.log('🔗 连接数据库...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    console.log('=' .repeat(80))
    console.log('📋 重构方案决策项验证（基于真实数据库）')
    console.log('=' .repeat(80))

    // ========== 决策1: 审计日志 target_type 验证 ==========
    console.log('\n📊 决策1: 审计日志 target_type 格式验证')
    console.log('-'.repeat(60))
    
    const [targetTypes] = await sequelize.query(`
      SELECT target_type, COUNT(*) as count
      FROM admin_operation_logs
      WHERE target_type IS NOT NULL
      GROUP BY target_type
      ORDER BY count DESC
    `)
    
    const pascalCaseTypes = targetTypes.filter(t => /^[A-Z]/.test(t.target_type))
    const snakeCaseTypes = targetTypes.filter(t => /^[a-z]/.test(t.target_type))
    
    console.log('✅ snake_case 格式记录数:', snakeCaseTypes.reduce((sum, t) => sum + parseInt(t.count), 0))
    console.log('❌ PascalCase 格式记录数:', pascalCaseTypes.reduce((sum, t) => sum + parseInt(t.count), 0))
    console.log('\n📊 target_type 分布:')
    targetTypes.forEach(t => {
      const format = /^[A-Z]/.test(t.target_type) ? '❌ PascalCase' : '✅ snake_case'
      console.log(`   ${format}: ${t.target_type} = ${t.count}条`)
    })
    
    if (pascalCaseTypes.length === 0) {
      console.log('\n🎉 结论: 所有 target_type 已是 snake_case 格式，TARGET_TYPE_LEGACY_MAPPING 可安全删除')
    }

    // ========== 决策3: rarity fallback 验证 ==========
    console.log('\n📊 决策3: market_listings.offer_item_rarity 验证')
    console.log('-'.repeat(60))
    
    const [marketColumns] = await sequelize.query(`
      SELECT COLUMN_NAME FROM information_schema.columns 
      WHERE table_schema = DATABASE() AND table_name = 'market_listings'
    `)
    const hasOfferItemMeta = marketColumns.some(c => c.COLUMN_NAME === 'offer_item_meta')
    const hasOfferItemRarity = marketColumns.some(c => c.COLUMN_NAME === 'offer_item_rarity')
    
    console.log('offer_item_rarity 字段存在:', hasOfferItemRarity ? '✅ 是' : '❌ 否')
    console.log('offer_item_meta 字段存在:', hasOfferItemMeta ? '✅ 是' : '❌ 否')
    
    const [[marketCount]] = await sequelize.query(`SELECT COUNT(*) as count FROM market_listings`)
    const [[nullRarityCount]] = await sequelize.query(`
      SELECT COUNT(*) as count FROM market_listings WHERE offer_item_rarity IS NULL
    `)
    console.log('market_listings 总记录数:', marketCount.count)
    console.log('offer_item_rarity 为空的记录数:', nullRarityCount.count)
    
    if (!hasOfferItemMeta) {
      console.log('\n🎉 结论: offer_item_meta 字段不存在，fallback 逻辑可简化')
    }

    // ========== 决策10: products 表验证 ==========
    console.log('\n📊 决策10: products 表使用情况验证')
    console.log('-'.repeat(60))
    
    const [[productsCount]] = await sequelize.query(`SELECT COUNT(*) as count FROM products`)
    const [[exchangeItemsCount]] = await sequelize.query(`SELECT COUNT(*) as count FROM exchange_items`)
    
    console.log('products 表记录数:', productsCount.count)
    console.log('exchange_items 表记录数:', exchangeItemsCount.count)
    
    // 查看 products 表结构
    const [productColumns] = await sequelize.query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.columns 
      WHERE table_schema = DATABASE() AND table_name = 'products'
    `)
    console.log('\nproducts 表字段:', productColumns.map(c => c.COLUMN_NAME).join(', '))
    
    // 查看 products 表数据样例
    const [productsSample] = await sequelize.query(`SELECT product_id, name, space FROM products LIMIT 5`)
    console.log('\nproducts 数据样例:', JSON.stringify(productsSample, null, 2))

    // ========== 空表统计 ==========
    console.log('\n📊 决策9: 空表统计')
    console.log('-'.repeat(60))
    
    const emptyTables = [
      'authentication_sessions', 'image_resources', 'lottery_daily_metrics',
      'lottery_hourly_metrics', 'lottery_draw_decisions', 'lottery_campaign_quota_grants',
      'lottery_campaign_user_quota', 'lottery_user_experience_state', 'lottery_user_global_state',
      'preset_budget_debt', 'preset_inventory_debt', 'trade_orders'
    ]
    
    for (const table of emptyTables) {
      try {
        const [[result]] = await sequelize.query(`SELECT COUNT(*) as count FROM ${table}`)
        console.log(`${table}: ${result.count}条`)
      } catch (e) {
        console.log(`${table}: ❌ 表不存在`)
      }
    }

    // ========== 旧表检查 ==========
    console.log('\n📊 旧表删除验证')
    console.log('-'.repeat(60))
    
    const oldTables = [
      'user_points_accounts', 'points_transactions', 'trade_records',
      'audit_records', 'user_inventory', 'user_inventories',
      'lottery_histories', 'prize_records', 'merchant_points_reviews',
      'role_change_logs', 'item_template_aliases', 'points_logs'
    ]
    
    for (const table of oldTables) {
      try {
        await sequelize.query(`SELECT 1 FROM ${table} LIMIT 1`)
        console.log(`${table}: ❌ 表仍然存在!`)
      } catch (e) {
        console.log(`${table}: ✅ 已删除`)
      }
    }

    // ========== 核心数据统计 ==========
    console.log('\n📊 核心业务数据统计')
    console.log('-'.repeat(60))
    
    const coreTables = [
      'users', 'roles', 'user_roles', 'accounts', 'account_asset_balances',
      'asset_transactions', 'item_templates', 'items', 'item_ledger', 'item_holds',
      'lottery_campaigns', 'lottery_prizes', 'lottery_draws', 'lottery_management_settings',
      'market_listings', 'exchange_items', 'exchange_records', 'redemption_orders',
      'admin_operation_logs', 'stores', 'store_staff', 'feedbacks'
    ]
    
    for (const table of coreTables) {
      try {
        const [[result]] = await sequelize.query(`SELECT COUNT(*) as count FROM ${table}`)
        console.log(`${table}: ${result.count}条`)
      } catch (e) {
        console.log(`${table}: ❌ 查询失败`)
      }
    }

    // ========== 迁移文件统计 ==========
    console.log('\n📊 迁移执行状态')
    console.log('-'.repeat(60))
    
    const [[migrationCount]] = await sequelize.query(`SELECT COUNT(*) as count FROM sequelizemeta`)
    console.log('已执行迁移数:', migrationCount.count)

    // ========== 备份文件检查 ==========
    console.log('\n📊 文件系统检查（需要手动确认）')
    console.log('-'.repeat(60))
    
    const fs = require('fs')
    const path = require('path')
    
    // 检查根目录备份文件
    const rootBackups = ['app.js.backup', 'app.js.backup.20260108_125922', 'ecosystem.config.js.backup']
    console.log('\n根目录备份文件:')
    rootBackups.forEach(file => {
      const exists = fs.existsSync(path.join('/home/devbox/project', file))
      console.log(`  ${file}: ${exists ? '✅ 存在' : '❌ 不存在'}`)
    })
    
    // 检查测试脚本数量
    const testFiles = fs.readdirSync('/home/devbox/project')
      .filter(f => f.startsWith('test-') || f.startsWith('test_') || f.startsWith('seed-'))
    console.log('\n根目录测试脚本数量:', testFiles.length)
    console.log('测试脚本列表:', testFiles)
    
    // 检查备份目录
    const backupsDir = '/home/devbox/project/backups'
    if (fs.existsSync(backupsDir)) {
      const backupDirs = fs.readdirSync(backupsDir).filter(f => f.startsWith('backup_'))
      console.log('\nbackups/ 目录备份数:', backupDirs.length)
      console.log('备份目录列表:', backupDirs)
    }

    console.log('\n' + '=' .repeat(80))
    console.log('✅ 验证完成')
    console.log('=' .repeat(80))

  } catch (error) {
    console.error('❌ 验证失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }
}

verifyDecisions()

