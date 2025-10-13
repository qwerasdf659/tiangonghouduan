/**
 * 基准迁移 V1.0.0 - 完全重建（使用Sequelize Sync）
 *
 * 创建时间: 2025年10月13日
 * 创建原因: 清理40个混乱迁移，建立统一基准
 *
 * ⚠️ 特别说明：
 * 本迁移使用Sequelize的sync功能，直接从models/目录同步表结构
 * 这样可以确保迁移文件与模型定义100%一致，避免手动维护导致的不一致
 *
 * 包含内容:
 * - 21个业务表（7个业务系统）
 * - 所有索引（自动从models创建）
 * - 所有外键（自动从关联创建）
 * - 3个基础角色初始数据
 *
 * 业务系统分类:
 * 1. 用户认证系统 (4表): users, roles, user_roles, user_sessions
 * 2. 积分系统 (3表): user_points_accounts, points_transactions, exchange_records
 * 3. 抽奖系统 (4表): lottery_campaigns, lottery_prizes, lottery_draws, lottery_presets
 * 4. 商品交易系统 (3表): products, trade_records, user_inventory
 * 5. 客服系统 (3表): customer_sessions, chat_messages, feedbacks
 * 6. 审计系统 (2表): audit_logs, audit_records
 * 7. 系统管理 (2表): system_announcements, image_resources
 */

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🚀 开始执行基准迁移 V1.0.0...')
    console.log('='.repeat(60))

    try {
      // 使用Sequelize sync功能创建所有表
      const models = require('../models')

      console.log('📦 从models/目录同步表结构...')

      // 同步所有模型（创建表）
      await models.sequelize.sync({ force: false, alter: false })

      console.log('✅ 表结构同步完成')

      // ==================== 插入初始数据 ====================

      console.log('📊 插入初始数据...')

      // 1. 插入3个基础角色
      const { v4: uuidv4 } = require('uuid')

      await queryInterface.bulkInsert('roles', [
        {
          role_uuid: uuidv4(),
          role_name: '超级管理员',
          role_level: 100,
          permissions: JSON.stringify({
            all: true,
            description: '拥有系统所有权限'
          }),
          description: '系统最高权限管理员',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_uuid: uuidv4(),
          role_name: '管理员',
          role_level: 50,
          permissions: JSON.stringify({
            manage_users: true,
            manage_lottery: true,
            manage_products: true,
            view_reports: true,
            description: '普通管理权限'
          }),
          description: '普通管理员，负责日常运营',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          role_uuid: uuidv4(),
          role_name: '普通用户',
          role_level: 0,
          permissions: JSON.stringify({
            lottery: true,
            points: true,
            chat: true,
            description: '普通用户基础权限'
          }),
          description: '普通用户',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ])

      console.log('✅ 3个基础角色已创建')

      // 2. 验证表数量
      const tables = await queryInterface.showAllTables()
      const businessTables = tables.filter(t => t !== 'SequelizeMeta')

      console.log('')
      console.log('📊 表创建统计:')
      console.log(`   总表数: ${tables.length}`)
      console.log(`   业务表: ${businessTables.length}`)
      console.log('   SequelizeMeta: 1')

      if (businessTables.length !== 21) {
        console.warn(`⚠️  警告: 预期21个业务表，实际创建${businessTables.length}个`)
      }

      console.log('')
      console.log('📋 已创建的业务表:')
      businessTables.sort().forEach((table, index) => {
        console.log(`   ${(index + 1).toString().padStart(2)}. ${table}`)
      })

      console.log('')
      console.log('='.repeat(60))
      console.log('✅ 基准迁移 V1.0.0 执行成功！')
      console.log('='.repeat(60))
    } catch (error) {
      console.error('')
      console.error('='.repeat(60))
      console.error('❌ 基准迁移执行失败')
      console.error('='.repeat(60))
      console.error('错误信息:', error.message)
      console.error('错误堆栈:', error.stack)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚基准迁移 V1.0.0...')
    console.log('='.repeat(60))

    try {
      // 获取所有表
      const tables = await queryInterface.showAllTables()
      const businessTables = tables.filter(t => t !== 'SequelizeMeta')

      console.log(`📊 准备删除 ${businessTables.length} 个业务表...`)

      // 按照反向顺序删除表（避免外键约束问题）
      // 优先删除有外键依赖的表
      const deleteOrder = [
        // 先删除依赖其他表的表
        'user_roles',
        'user_sessions',
        'user_inventory',
        'user_points_accounts',
        'points_transactions',
        'exchange_records',
        'lottery_draws',
        'lottery_presets',
        'lottery_prizes',
        'lottery_campaigns',
        'trade_records',
        'chat_messages',
        'customer_sessions',
        'feedbacks',
        'audit_records',
        'audit_logs',
        'image_resources',
        'system_announcements',
        'products',
        // 最后删除基础表
        'roles',
        'users'
      ]

      for (const tableName of deleteOrder) {
        if (businessTables.includes(tableName)) {
          await queryInterface.dropTable(tableName)
          console.log(`🗑️  已删除表: ${tableName}`)
        }
      }

      // 删除不在deleteOrder中的其他表
      for (const tableName of businessTables) {
        if (!deleteOrder.includes(tableName)) {
          try {
            await queryInterface.dropTable(tableName)
            console.log(`🗑️  已删除表: ${tableName}`)
          } catch (error) {
            console.warn(`⚠️  无法删除表 ${tableName}:`, error.message)
          }
        }
      }

      console.log('')
      console.log('='.repeat(60))
      console.log('✅ 基准迁移回滚完成')
      console.log('='.repeat(60))
    } catch (error) {
      console.error('')
      console.error('='.repeat(60))
      console.error('❌ 回滚失败')
      console.error('='.repeat(60))
      console.error('错误信息:', error.message)
      throw error
    }
  }
}
