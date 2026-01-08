#!/usr/bin/env node

/**
 * 基准迁移文件自动生成器
 * 用途：从models/目录自动生成baseline迁移文件
 * 创建时间：2025年10月13日
 */

const fs = require('fs')
const path = require('path')

console.log('🔧 基准迁移文件生成器')
console.log('='.repeat(60))

// 配置
const MODELS_DIR = path.join(__dirname, '../../models')
const OUTPUT_FILE = path.join(
  __dirname,
  '../../migrations/20251013100000-baseline-v1-clean-start.js'
)

// 获取所有模型文件
const modelFiles = fs
  .readdirSync(MODELS_DIR)
  .filter(file => file.endsWith('.js') && file !== 'index.js')
  .sort()

console.log(`\n📁 找到 ${modelFiles.length} 个模型文件:\n`)
modelFiles.forEach((file, index) => {
  console.log(`   ${index + 1}. ${file}`)
})

// 表名映射（模型名 -> 表名）- 预留用于未来功能
// 🔧 2025-12-30 清理：移除已废弃的 UserPointsAccount 和 PointsTransaction 映射
// 新架构使用 Account + AccountAssetBalance + AssetTransaction
const _tableNameMap = {
  'User.js': 'users',
  'Role.js': 'roles',
  'UserRole.js': 'user_roles',
  'AuthenticationSession.js': 'authentication_sessions',
  'Account.js': 'accounts', // 统一账户主体表
  'AccountAssetBalance.js': 'account_asset_balances', // 账户资产余额表
  'AssetTransaction.js': 'asset_transactions', // 资产流水表
  'ExchangeRecords.js': 'exchange_records',
  'LotteryCampaign.js': 'lottery_campaigns',
  'LotteryPrize.js': 'lottery_prizes',
  'LotteryDraw.js': 'lottery_draws',
  'LotteryPreset.js': 'lottery_presets',
  'Product.js': 'products',
  // ❌ TradeRecord.js 已删除（2026-01-08 交易流水收敛决策）- trade_records 表已废弃
  // 🗑️ UserInventory.js 已删除 - 迁移至 ItemInstance - 2025年12月21日
  'ItemInstance.js': 'item_instances', // 替代 UserInventory
  'CustomerServiceSession.js': 'customer_service_sessions',
  'ChatMessage.js': 'chat_messages',
  'Feedback.js': 'feedbacks',
  'AdminOperationLog.js': 'admin_operation_logs',
  'ContentReviewRecord.js': 'content_review_records',
  'SystemAnnouncement.js': 'system_announcements',
  'ImageResources.js': 'image_resources'
}

// 生成迁移文件模板
const migrationContent = `/**
 * 基准迁移 V1.0.0 - 完全重建
 * 
 * 创建时间: 2025年10月13日
 * 创建原因: 清理40个混乱迁移，建立统一基准
 * 
 * 包含内容:
 * - 21个业务表（7个业务系统）
 * - 所有索引
 * - 所有外键
 * - 3个基础角色初始数据
 * 
 * 业务系统分类:
 * 1. 用户认证系统 (4表): users, roles, user_roles, authentication_sessions
 * 2. 资产系统 (3表): accounts, account_asset_balances, asset_transactions
 * 3. 抽奖系统 (4表): lottery_campaigns, lottery_prizes, lottery_draws, lottery_presets
 * 4. 商品交易系统 (3表): products, trade_records, item_instances
 * 5. 客服系统 (3表): customer_sessions, chat_messages, feedbacks
 * 6. 审计系统 (2表): audit_logs, audit_records
 * 7. 系统管理 (2表): system_announcements, image_resources
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()
    
    try {
      console.log('🚀 开始执行基准迁移...')
      
      // ==================== 1. 用户认证系统（4表）====================
      
      console.log('📦 [1/7] 创建用户认证系统表...')
      
      // TODO: 这里需要手动添加users, roles, user_roles, user_sessions的createTable语句
      // 由于自动提取Sequelize模型定义比较复杂，建议手动编写
      
      // ==================== 2. 资产系统（3表）====================

      console.log('📦 [2/7] 创建资产系统表...')

      // TODO: accounts, account_asset_balances, asset_transactions
      
      // ==================== 3. 抽奖系统（4表）====================
      
      console.log('📦 [3/7] 创建抽奖系统表...')
      
      // TODO: lottery_campaigns, lottery_prizes, lottery_draws, lottery_presets
      
      // ==================== 4. 商品交易系统（3表）====================
      
      console.log('📦 [4/7] 创建商品交易系统表...')
      
      // TODO: products, trade_records, item_instances
      
      // ==================== 5. 客服系统（3表）====================
      
      console.log('📦 [5/7] 创建客服系统表...')
      
      // TODO: customer_sessions, chat_messages, feedbacks
      
      // ==================== 6. 审计系统（2表）====================
      
      console.log('📦 [6/7] 创建审计系统表...')
      
      // TODO: audit_logs, audit_records
      
      // ==================== 7. 系统管理（2表）====================
      
      console.log('📦 [7/7] 创建系统管理表...')
      
      // TODO: system_announcements, image_resources
      
      // ==================== 8. 创建索引 ====================
      
      console.log('🔍 创建索引...')
      
      // TODO: 添加所有必需的索引
      
      // ==================== 9. 创建外键 ====================
      
      console.log('🔗 创建外键约束...')
      
      // TODO: 添加所有外键约束
      
      // ==================== 10. 初始化数据 ====================
      
      console.log('📊 插入初始数据...')
      
      // 插入3个基础角色
      await queryInterface.bulkInsert('roles', [
        {
          role_uuid: 'super-admin-uuid-' + Date.now(),
          role_name: '超级管理员',
          role_level: 100,
          description: '系统最高权限',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_uuid: 'admin-uuid-' + Date.now(),
          role_name: '管理员',
          role_level: 50,
          description: '普通管理权限',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_uuid: 'user-uuid-' + Date.now(),
          role_name: '普通用户',
          role_level: 0,
          description: '普通用户权限',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ], { transaction })
      
      await transaction.commit()
      console.log('✅ 基准迁移执行成功！')
      
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 基准迁移执行失败:', error.message)
      throw error
    }
  },
  
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()
    
    try {
      console.log('🔄 回滚基准迁移...')
      
      // 按照反向顺序删除表
      const tables = [
        'image_resources',
        'system_announcements',
        'audit_records',
        'audit_logs',
        'feedbacks',
        'chat_messages',
        'customer_sessions',
        'item_instances',
        'trade_records',
        'products',
        'lottery_presets',
        'lottery_draws',
        'lottery_prizes',
        'lottery_campaigns',
        'exchange_records',
        'asset_transactions',
        'account_asset_balances',
        'accounts',
        'authentication_sessions',
        'user_roles',
        'roles',
        'users'
      ]
      
      for (const table of tables) {
        await queryInterface.dropTable(table, { transaction })
        console.log(\`🗑️ 删除表: \${table}\`)
      }
      
      await transaction.commit()
      console.log('✅ 回滚完成')
      
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
`

// 写入文件
console.log(`\n📝 生成基准迁移文件: ${OUTPUT_FILE}`)
fs.writeFileSync(OUTPUT_FILE, migrationContent)

console.log('\n✅ 基准迁移模板已生成！')
console.log('\n⚠️  重要提示：')
console.log('   1. 这是一个模板文件，包含TODO标记')
console.log('   2. 需要手动填充每个表的createTable语句')
console.log('   3. 建议从models/目录复制字段定义')
console.log('   4. 完成后执行: npm run migration:verify')
console.log('')
console.log('📋 下一步操作：')
console.log('   1. 编辑文件: ' + OUTPUT_FILE)
console.log('   2. 填充TODO部分的表定义')
console.log('   3. 测试迁移: npm run migration:up')
console.log('')
