#!/usr/bin/env node

/**
 * 数据库连接和表结构检查脚本
 *
 * @description 检查数据库连接、表结构、索引和数据完整性
 * @version 4.1.0 - 使用统一数据库连接
 * @date 2025-09-29
 */

require('dotenv').config()
const { getDatabaseHelper } = require('../utils/database')

class DatabaseChecker {
  constructor () {
    // 使用统一数据库助手
    this.dbHelper = getDatabaseHelper()
    this.sequelize = this.dbHelper.getSequelize()
  }

  // 测试数据库连接
  async testConnection () {
    console.log('=== 测试数据库连接 ===')
    try {
      await this.sequelize.authenticate()
      console.log('✅ 数据库连接成功')

      // 获取数据库版本信息
      const [results] = await this.sequelize.query('SELECT VERSION() as version')
      console.log(`   MySQL版本: ${results[0].version}`)

      // 获取当前数据库名
      const [dbResults] = await this.sequelize.query('SELECT DATABASE() as db_name')
      console.log(`   当前数据库: ${dbResults[0].db_name}`)

      return true
    } catch (error) {
      console.error('❌ 数据库连接失败:', error.message)
      return false
    }
  }

  // 检查表结构
  async checkTables () {
    console.log('\n=== 检查表结构 ===')
    try {
      // 获取所有表名
      const [tables] = await this.sequelize.query(`
        SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        ORDER BY TABLE_NAME
      `)

      console.log(`发现 ${tables.length} 个表:`)
      tables.forEach(table => {
        const dataSize = (table.DATA_LENGTH / 1024).toFixed(2)
        const indexSize = (table.INDEX_LENGTH / 1024).toFixed(2)
        console.log(`   📋 ${table.TABLE_NAME}: ${table.TABLE_ROWS || 0} 行, 数据: ${dataSize}KB, 索引: ${indexSize}KB`)
      })

      return tables
    } catch (error) {
      console.error('❌ 检查表结构失败:', error.message)
      return []
    }
  }

  // 检查核心表的字段结构
  async checkCoreTableStructure () {
    console.log('\n=== 检查核心表字段结构 ===')

    const coreTables = [
      'users',
      'user_points_accounts',
      'lottery_draws',
      'user_inventory',
      'image_resources'
    ]

    for (const tableName of coreTables) {
      try {
        const [columns] = await this.sequelize.query(`
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
          AND TABLE_NAME = '${tableName}'
          ORDER BY ORDINAL_POSITION
        `)

        if (columns.length > 0) {
          console.log(`\n📋 ${tableName} (${columns.length} 个字段):`)
          columns.forEach(col => {
            const nullable = col.IS_NULLABLE === 'YES' ? '可空' : '非空'
            const key = col.COLUMN_KEY ? ` [${col.COLUMN_KEY}]` : ''
            console.log(`   - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${nullable})${key}`)
          })
        } else {
          console.log(`⚠️  表 ${tableName} 不存在`)
        }
      } catch (error) {
        console.log(`❌ 检查表 ${tableName} 失败: ${error.message}`)
      }
    }
  }

  // 检查索引
  async checkIndexes () {
    console.log('\n=== 检查数据库索引 ===')
    try {
      const [indexes] = await this.sequelize.query(`
        SELECT 
          TABLE_NAME,
          INDEX_NAME,
          COLUMN_NAME,
          NON_UNIQUE,
          INDEX_TYPE
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
      `)

      const indexByTable = {}
      indexes.forEach(idx => {
        if (!indexByTable[idx.TABLE_NAME]) {
          indexByTable[idx.TABLE_NAME] = {}
        }
        if (!indexByTable[idx.TABLE_NAME][idx.INDEX_NAME]) {
          indexByTable[idx.TABLE_NAME][idx.INDEX_NAME] = {
            columns: [],
            unique: idx.NON_UNIQUE === 0,
            type: idx.INDEX_TYPE
          }
        }
        indexByTable[idx.TABLE_NAME][idx.INDEX_NAME].columns.push(idx.COLUMN_NAME)
      })

      Object.keys(indexByTable).forEach(tableName => {
        console.log(`\n📋 ${tableName} 的索引:`)
        Object.keys(indexByTable[tableName]).forEach(indexName => {
          const index = indexByTable[tableName][indexName]
          const uniqueStr = index.unique ? '唯一' : '普通'
          console.log(`   - ${indexName}: [${index.columns.join(', ')}] (${uniqueStr}, ${index.type})`)
        })
      })

      return indexByTable
    } catch (error) {
      console.error('❌ 检查索引失败:', error.message)
      return {}
    }
  }

  // 检查数据完整性
  async checkDataIntegrity () {
    console.log('\n=== 检查数据完整性 ===')

    const checks = [
      {
        name: '用户数据',
        query: 'SELECT COUNT(*) as count FROM Users WHERE status = "active"',
        description: '活跃用户数量'
      },
      {
        name: '积分账户',
        query: 'SELECT COUNT(*) as count FROM user_points_accounts WHERE available_points >= 0',
        description: '有效积分账户数量'
      },
      {
        name: '抽奖记录',
        query: 'SELECT COUNT(*) as count FROM lottery_draws WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
        description: '最近7天抽奖记录'
      },
      {
        name: '用户库存',
        query: 'SELECT COUNT(*) as count FROM user_inventory WHERE status = "available"',
        description: '可用库存物品数量'
      }
    ]

    for (const check of checks) {
      try {
        const [results] = await this.sequelize.query(check.query)
        console.log(`✅ ${check.name}: ${results[0].count} (${check.description})`)
      } catch (error) {
        console.log(`❌ ${check.name}: 检查失败 - ${error.message}`)
      }
    }
  }

  // 检查测试用户数据
  async checkTestUser () {
    console.log('\n=== 检查测试用户数据 ===')
    try {
      const [users] = await this.sequelize.query(`
        SELECT user_id, mobile, is_admin, status, created_at
                 FROM users 
         WHERE mobile = '13612227930'
      `)

      if (users.length > 0) {
        const user = users[0]
        console.log('✅ 测试用户存在:')
        console.log(`   用户ID: ${user.user_id}`)
        console.log(`   手机号: ${user.mobile}`)
        console.log(`   管理员权限: ${user.is_admin ? '是' : '否'}`)
        console.log(`   状态: ${user.status}`)
        console.log(`   创建时间: ${user.created_at}`)

        // 检查用户积分账户
        const [accounts] = await this.sequelize.query(`
                      SELECT available_points, total_earned, total_consumed
          FROM user_points_accounts 
          WHERE user_id = ${user.user_id}
        `)

        if (accounts.length > 0) {
          const account = accounts[0]
          console.log(`   当前积分: ${account.available_points}`)
          console.log(`   累计获得: ${account.total_earned}`)
          console.log(`   累计消耗: ${account.total_consumed}`)
        } else {
          console.log('   ⚠️  积分账户不存在')
        }
      } else {
        console.log('⚠️  测试用户不存在')
      }
    } catch (error) {
      console.error('❌ 检查测试用户失败:', error.message)
    }
  }

  // 运行所有检查
  async runAllChecks () {
    console.log('🔍 开始数据库全面检查...\n')

    try {
      // 1. 测试连接
      const connected = await this.testConnection()
      if (!connected) {
        console.log('❌ 数据库连接失败，终止检查')
        return
      }

      // 2. 检查表结构
      await this.checkTables()

      // 3. 检查核心表字段
      await this.checkCoreTableStructure()

      // 4. 检查索引
      await this.checkIndexes()

      // 5. 检查数据完整性
      await this.checkDataIntegrity()

      // 6. 检查测试用户
      await this.checkTestUser()

      console.log('\n✅ 数据库检查完成!')
    } catch (error) {
      console.error('❌ 数据库检查过程中发生错误:', error.message)
    } finally {
      // 关闭数据库连接由统一助手管理
    }
  }
}

// 运行检查
if (require.main === module) {
  const checker = new DatabaseChecker()
  checker.runAllChecks().then(() => {
    console.log('\n🎉 数据库检查完成!')
    process.exit(0)
  }).catch(error => {
    console.error('检查失败:', error.message)
    process.exit(1)
  })
}

module.exports = DatabaseChecker
