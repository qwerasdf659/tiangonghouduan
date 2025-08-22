/**
 * 🔥 积分系统索引修复脚本
 * 功能：创建积分系统缺失的数据库索引以优化查询性能
 */

'use strict'

// 加载环境变量配置
require('dotenv').config()

const { sequelize } = require('../models')

/**
 * 积分系统索引修复器
 */
class PointsIndexFixer {
  constructor () {
    this.results = {
      created: [],
      skipped: [],
      failed: []
    }
  }

  /**
   * 安全创建索引
   */
  async safeCreateIndex (tableName, columns, options = {}) {
    try {
      const indexName = options.name || `idx_${tableName}_${columns.join('_')}`

      console.log(`🔧 正在创建索引: ${indexName} on ${tableName}(${columns.join(', ')})`)

      await sequelize.getQueryInterface().addIndex(tableName, columns, {
        ...options,
        name: indexName
      })

      this.results.created.push({ table: tableName, index: indexName, columns })
      console.log(`✅ 索引创建成功: ${indexName}`)
    } catch (error) {
      const indexName = options.name || `idx_${tableName}_${columns.join('_')}`
      if (error.original && error.original.code === 'ER_DUP_KEYNAME') {
        console.log(`⚠️ 索引已存在，跳过: ${indexName}`)
        this.results.skipped.push({ table: tableName, index: indexName, reason: 'already_exists' })
      } else {
        console.error(`❌ 索引创建失败: ${indexName}`, error.message)
        this.results.failed.push({ table: tableName, index: indexName, error: error.message })
      }
    }
  }

  /**
   * 检查索引是否存在
   */
  async checkIndexExists (tableName, indexName) {
    try {
      const indexes = await sequelize.query(
        `SHOW INDEX FROM ${tableName} WHERE Key_name = '${indexName}'`,
        { type: sequelize.QueryTypes.SELECT }
      )
      return indexes.length > 0
    } catch (error) {
      console.error(`检查索引失败: ${indexName}`, error.message)
      return false
    }
  }

  /**
   * 修复用户积分账户表索引
   */
  async fixUserPointsAccountIndexes () {
    console.log('\n🔧 修复用户积分账户表索引...')

    // 1. 用户ID唯一索引
    if (!(await this.checkIndexExists('user_points_accounts', 'unique_user_points_account'))) {
      await this.safeCreateIndex('user_points_accounts', ['user_id'], {
        name: 'unique_user_points_account',
        unique: true
      })
    } else {
      console.log('⚠️ 索引已存在: unique_user_points_account')
      this.results.skipped.push({
        table: 'user_points_accounts',
        index: 'unique_user_points_account',
        reason: 'already_exists'
      })
    }

    // 2. 可用积分索引
    if (!(await this.checkIndexExists('user_points_accounts', 'idx_upa_available_points'))) {
      await this.safeCreateIndex('user_points_accounts', ['available_points'], {
        name: 'idx_upa_available_points'
      })
    } else {
      console.log('⚠️ 索引已存在: idx_upa_available_points')
      this.results.skipped.push({
        table: 'user_points_accounts',
        index: 'idx_upa_available_points',
        reason: 'already_exists'
      })
    }

    // 3. 账户等级索引
    if (!(await this.checkIndexExists('user_points_accounts', 'idx_upa_account_level'))) {
      await this.safeCreateIndex('user_points_accounts', ['account_level'], {
        name: 'idx_upa_account_level'
      })
    } else {
      console.log('⚠️ 索引已存在: idx_upa_account_level')
      this.results.skipped.push({
        table: 'user_points_accounts',
        index: 'idx_upa_account_level',
        reason: 'already_exists'
      })
    }

    // 4. 活跃状态索引
    if (!(await this.checkIndexExists('user_points_accounts', 'idx_upa_is_active'))) {
      await this.safeCreateIndex('user_points_accounts', ['is_active'], {
        name: 'idx_upa_is_active'
      })
    } else {
      console.log('⚠️ 索引已存在: idx_upa_is_active')
      this.results.skipped.push({
        table: 'user_points_accounts',
        index: 'idx_upa_is_active',
        reason: 'already_exists'
      })
    }
  }

  /**
   * 修复积分交易记录表索引
   */
  async fixPointsTransactionIndexes () {
    console.log('\n🔧 修复积分交易记录表索引...')

    // 1. 用户ID和交易时间复合索引（最重要）
    if (!(await this.checkIndexExists('points_transactions', 'idx_pt_user_time'))) {
      await this.safeCreateIndex('points_transactions', ['user_id', 'transaction_time'], {
        name: 'idx_pt_user_time'
      })
    } else {
      console.log('⚠️ 索引已存在: idx_pt_user_time')
      this.results.skipped.push({
        table: 'points_transactions',
        index: 'idx_pt_user_time',
        reason: 'already_exists'
      })
    }

    // 2. 账户ID索引
    if (!(await this.checkIndexExists('points_transactions', 'idx_pt_account_id'))) {
      await this.safeCreateIndex('points_transactions', ['account_id'], {
        name: 'idx_pt_account_id'
      })
    } else {
      console.log('⚠️ 索引已存在: idx_pt_account_id')
      this.results.skipped.push({
        table: 'points_transactions',
        index: 'idx_pt_account_id',
        reason: 'already_exists'
      })
    }

    // 3. 业务类型索引
    if (!(await this.checkIndexExists('points_transactions', 'idx_pt_business_type'))) {
      await this.safeCreateIndex('points_transactions', ['business_type'], {
        name: 'idx_pt_business_type'
      })
    } else {
      console.log('⚠️ 索引已存在: idx_pt_business_type')
      this.results.skipped.push({
        table: 'points_transactions',
        index: 'idx_pt_business_type',
        reason: 'already_exists'
      })
    }

    // 4. 交易状态索引
    if (!(await this.checkIndexExists('points_transactions', 'idx_pt_status'))) {
      await this.safeCreateIndex('points_transactions', ['status'], {
        name: 'idx_pt_status'
      })
    } else {
      console.log('⚠️ 索引已存在: idx_pt_status')
      this.results.skipped.push({
        table: 'points_transactions',
        index: 'idx_pt_status',
        reason: 'already_exists'
      })
    }

    // 5. 交易时间索引
    if (!(await this.checkIndexExists('points_transactions', 'idx_pt_transaction_time'))) {
      await this.safeCreateIndex('points_transactions', ['transaction_time'], {
        name: 'idx_pt_transaction_time'
      })
    } else {
      console.log('⚠️ 索引已存在: idx_pt_transaction_time')
      this.results.skipped.push({
        table: 'points_transactions',
        index: 'idx_pt_transaction_time',
        reason: 'already_exists'
      })
    }
  }

  /**
   * 生成修复报告
   */
  generateReport () {
    console.log('\n' + '='.repeat(80))
    console.log('🔥 积分系统索引修复报告')
    console.log('='.repeat(80))

    console.log(`\n✅ 成功创建索引: ${this.results.created.length}`)
    this.results.created.forEach(item => {
      console.log(`   • ${item.table}.${item.index} (${item.columns.join(', ')})`)
    })

    console.log(`\n⚠️ 跳过已存在索引: ${this.results.skipped.length}`)
    this.results.skipped.forEach(item => {
      console.log(`   • ${item.table}.${item.index} (${item.reason})`)
    })

    console.log(`\n❌ 创建失败索引: ${this.results.failed.length}`)
    this.results.failed.forEach(item => {
      console.log(`   • ${item.table}.${item.index} - ${item.error}`)
    })

    const total =
      this.results.created.length + this.results.skipped.length + this.results.failed.length
    const successRate =
      total > 0
        ? (((this.results.created.length + this.results.skipped.length) / total) * 100).toFixed(1)
        : 100

    console.log('\n📊 修复统计:')
    console.log(`   总索引数: ${total}`)
    console.log(`   成功率: ${successRate}%`)

    if (this.results.failed.length === 0) {
      console.log('\n🎯 修复结论: ✅ 所有索引修复完成！')
    } else {
      console.log('\n🎯 修复结论: ⚠️ 部分索引修复失败，需要手动处理')
    }

    return {
      success: this.results.failed.length === 0,
      created: this.results.created.length,
      skipped: this.results.skipped.length,
      failed: this.results.failed.length,
      successRate: parseFloat(successRate)
    }
  }

  /**
   * 执行完整修复
   */
  async runFullFix () {
    console.log('🚀 开始积分系统索引修复...')
    console.log(`⏰ 修复时间: ${new Date().toISOString()}`)

    try {
      // 测试数据库连接
      await sequelize.authenticate()
      console.log('✅ 数据库连接正常')

      // 修复索引
      await this.fixUserPointsAccountIndexes()
      await this.fixPointsTransactionIndexes()

      // 生成报告
      return this.generateReport()
    } catch (error) {
      console.error('❌ 索引修复过程中发生错误:', error)
      return {
        success: false,
        error: error.message,
        results: this.results
      }
    }
  }
}

/**
 * 主函数
 */
async function main () {
  const fixer = new PointsIndexFixer()

  try {
    const result = await fixer.runFullFix()

    // 如果有失败，退出码为1
    if (!result.success) {
      process.exit(1)
    }

    process.exit(0)
  } catch (error) {
    console.error('💥 索引修复脚本执行失败:', error)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = { PointsIndexFixer }
