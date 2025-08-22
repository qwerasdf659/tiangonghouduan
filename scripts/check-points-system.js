/**
 * 🔥 积分系统全面检查脚本
 * 功能：检查数据库表结构、数据一致性、索引状态、业务逻辑等
 */

'use strict'

// 加载环境变量配置
require('dotenv').config()

const { sequelize } = require('../models')
const { UserPointsAccount, PointsTransaction } = require('../models')

/**
 * 积分系统检查器
 */
class PointsSystemChecker {
  constructor () {
    this.results = {
      database: { passed: 0, failed: 0, warnings: 0, details: [] },
      models: { passed: 0, failed: 0, warnings: 0, details: [] },
      data: { passed: 0, failed: 0, warnings: 0, details: [] },
      business: { passed: 0, failed: 0, warnings: 0, details: [] }
    }
  }

  /**
   * 检查数据库连接和表结构
   */
  async checkDatabase () {
    console.log('\n🔍 开始检查数据库连接和表结构...')

    try {
      // 测试数据库连接
      await sequelize.authenticate()
      this.addResult('database', 'success', '数据库连接正常')

      // 检查积分账户表
      const accountTableDesc = await sequelize
        .getQueryInterface()
        .describeTable('user_points_accounts')
      const requiredAccountFields = [
        'account_id',
        'user_id',
        'available_points',
        'total_earned',
        'total_consumed',
        'account_level',
        'is_active',
        'behavior_score'
      ]

      for (const field of requiredAccountFields) {
        if (accountTableDesc[field]) {
          this.addResult('database', 'success', `用户积分账户表字段 ${field} 存在`)
        } else {
          this.addResult('database', 'error', `用户积分账户表缺少必需字段: ${field}`)
        }
      }

      // 检查积分交易表
      const transactionTableDesc = await sequelize
        .getQueryInterface()
        .describeTable('points_transactions')
      const requiredTransactionFields = [
        'transaction_id',
        'user_id',
        'account_id',
        'transaction_type',
        'points_amount',
        'points_balance_before',
        'points_balance_after',
        'business_type'
      ]

      for (const field of requiredTransactionFields) {
        if (transactionTableDesc[field]) {
          this.addResult('database', 'success', `积分交易表字段 ${field} 存在`)
        } else {
          this.addResult('database', 'error', `积分交易表缺少必需字段: ${field}`)
        }
      }

      // 检查索引
      await this.checkIndexes()
    } catch (error) {
      this.addResult('database', 'error', `数据库检查失败: ${error.message}`)
    }
  }

  /**
   * 检查数据库索引
   */
  async checkIndexes () {
    try {
      // 检查用户积分账户表索引
      const accountIndexes = await sequelize.query(
        'SHOW INDEX FROM user_points_accounts WHERE Key_name != \'PRIMARY\'',
        { type: sequelize.QueryTypes.SELECT }
      )

      const requiredAccountIndexes = ['unique_user_points_account', 'idx_upa_available_points']
      for (const indexName of requiredAccountIndexes) {
        const indexExists = accountIndexes.some(idx => idx.Key_name === indexName)
        if (indexExists) {
          this.addResult('database', 'success', `积分账户表索引 ${indexName} 存在`)
        } else {
          this.addResult('database', 'warning', `积分账户表缺少推荐索引: ${indexName}`)
        }
      }

      // 检查积分交易表索引
      const transactionIndexes = await sequelize.query(
        'SHOW INDEX FROM points_transactions WHERE Key_name != \'PRIMARY\'',
        { type: sequelize.QueryTypes.SELECT }
      )

      const requiredTransactionIndexes = ['idx_pt_user_time', 'idx_pt_transaction_type']
      for (const indexName of requiredTransactionIndexes) {
        const indexExists = transactionIndexes.some(idx => idx.Key_name === indexName)
        if (indexExists) {
          this.addResult('database', 'success', `积分交易表索引 ${indexName} 存在`)
        } else {
          this.addResult('database', 'warning', `积分交易表缺少推荐索引: ${indexName}`)
        }
      }
    } catch (error) {
      this.addResult('database', 'error', `索引检查失败: ${error.message}`)
    }
  }

  /**
   * 检查模型定义和关联
   */
  async checkModels () {
    console.log('\n🔍 开始检查模型定义和关联...')

    try {
      // 检查模型是否正确加载
      if (UserPointsAccount) {
        this.addResult('models', 'success', 'UserPointsAccount 模型加载正常')
      } else {
        this.addResult('models', 'error', 'UserPointsAccount 模型未加载')
      }

      if (PointsTransaction) {
        this.addResult('models', 'success', 'PointsTransaction 模型加载正常')
      } else {
        this.addResult('models', 'error', 'PointsTransaction 模型未加载')
      }

      // 检查模型方法
      const account = UserPointsAccount.build({
        user_id: 1,
        available_points: 100,
        total_earned: 100,
        total_consumed: 0,
        account_level: 'bronze',
        behavior_score: 50
      })

      if (typeof account.getLevelInfo === 'function') {
        this.addResult('models', 'success', 'UserPointsAccount.getLevelInfo 方法存在')
      } else {
        this.addResult('models', 'error', 'UserPointsAccount.getLevelInfo 方法缺失')
      }

      if (typeof account.checkForLevelUp === 'function') {
        this.addResult('models', 'success', 'UserPointsAccount.checkForLevelUp 方法存在')
      } else {
        this.addResult('models', 'error', 'UserPointsAccount.checkForLevelUp 方法缺失')
      }

      // 测试模型方法
      const levelInfo = account.getLevelInfo()
      if (levelInfo && levelInfo.name) {
        this.addResult('models', 'success', `等级信息获取正常: ${levelInfo.name}`)
      } else {
        this.addResult('models', 'error', '等级信息获取失败')
      }
    } catch (error) {
      this.addResult('models', 'error', `模型检查失败: ${error.message}`)
    }
  }

  /**
   * 检查数据一致性
   */
  async checkDataConsistency () {
    console.log('\n🔍 开始检查数据一致性...')

    try {
      // 检查用户账户数据
      const totalAccounts = await UserPointsAccount.count()
      this.addResult('data', 'info', `总积分账户数: ${totalAccounts}`)

      // 检查积分交易数据
      const totalTransactions = await PointsTransaction.count()
      this.addResult('data', 'info', `总积分交易数: ${totalTransactions}`)

      // 检查数据一致性
      if (totalAccounts > 0) {
        // 检查积分余额一致性
        const inconsistentAccounts = await sequelize.query(
          `
          SELECT 
            upa.user_id,
            upa.available_points,
            upa.total_earned,
            upa.total_consumed,
            (upa.total_earned - upa.total_consumed) as calculated_balance,
            ABS(upa.available_points - (upa.total_earned - upa.total_consumed)) as difference
          FROM user_points_accounts upa
          WHERE ABS(upa.available_points - (upa.total_earned - upa.total_consumed)) > 0.01
        `,
          { type: sequelize.QueryTypes.SELECT }
        )

        if (inconsistentAccounts.length === 0) {
          this.addResult('data', 'success', '积分余额数据一致性检查通过')
        } else {
          this.addResult(
            'data',
            'error',
            `发现 ${inconsistentAccounts.length} 个积分余额不一致的账户`
          )
          inconsistentAccounts.forEach(account => {
            this.addResult(
              'data',
              'error',
              `用户 ${account.user_id}: 显示余额 ${account.available_points}, 计算余额 ${account.calculated_balance}, 差异 ${account.difference}`
            )
          })
        }

        // 检查等级一致性
        const incorrectLevels = await sequelize.query(
          `
          SELECT 
            user_id,
            total_earned,
            account_level,
            CASE 
              WHEN total_earned >= 20000 THEN 'diamond'
              WHEN total_earned >= 5000 THEN 'gold'
              WHEN total_earned >= 1000 THEN 'silver'
              ELSE 'bronze'
            END as correct_level
          FROM user_points_accounts
          WHERE account_level != CASE 
              WHEN total_earned >= 20000 THEN 'diamond'
              WHEN total_earned >= 5000 THEN 'gold'
              WHEN total_earned >= 1000 THEN 'silver'
              ELSE 'bronze'
            END
        `,
          { type: sequelize.QueryTypes.SELECT }
        )

        if (incorrectLevels.length === 0) {
          this.addResult('data', 'success', '用户等级数据一致性检查通过')
        } else {
          this.addResult('data', 'error', `发现 ${incorrectLevels.length} 个用户等级不正确`)
          incorrectLevels.forEach(user => {
            this.addResult(
              'data',
              'error',
              `用户 ${user.user_id}: 当前等级 ${user.account_level}, 应为 ${user.correct_level} (积分: ${user.total_earned})`
            )
          })
        }
      } else {
        this.addResult('data', 'warning', '没有积分账户数据，跳过一致性检查')
      }
    } catch (error) {
      this.addResult('data', 'error', `数据一致性检查失败: ${error.message}`)
    }
  }

  /**
   * 检查业务逻辑
   */
  async checkBusinessLogic () {
    console.log('\n🔍 开始检查业务逻辑...')

    try {
      // 检查积分系统服务
      const PointsSystemService = require('../services/PointsSystemService')

      if (PointsSystemService) {
        this.addResult('business', 'success', 'PointsSystemService 服务加载正常')
      } else {
        this.addResult('business', 'error', 'PointsSystemService 服务未加载')
        return
      }

      // 检查等级计算
      const testLevels = [
        { points: 0, expected: 'bronze' },
        { points: 500, expected: 'bronze' },
        { points: 1000, expected: 'silver' },
        { points: 5000, expected: 'gold' },
        { points: 20000, expected: 'diamond' }
      ]

      for (const test of testLevels) {
        const level = PointsSystemService.calculateLevel(test.points)
        if (level === test.expected) {
          this.addResult('business', 'success', `等级计算正确: ${test.points}积分 = ${level}`)
        } else {
          this.addResult(
            'business',
            'error',
            `等级计算错误: ${test.points}积分期望${test.expected}，实际${level}`
          )
        }
      }

      // 检查事件总线服务
      const EventBusService = require('../services/EventBusService')
      if (EventBusService && typeof EventBusService.emit === 'function') {
        this.addResult('business', 'success', 'EventBusService 事件总线服务正常')
      } else {
        this.addResult('business', 'warning', 'EventBusService 事件总线服务可能有问题')
      }
    } catch (error) {
      this.addResult('business', 'error', `业务逻辑检查失败: ${error.message}`)
    }
  }

  /**
   * 添加检查结果
   */
  addResult (category, type, message) {
    const timestamp = new Date().toISOString()
    this.results[category].details.push({ type, message, timestamp })

    if (type === 'success') {
      this.results[category].passed++
    } else if (type === 'error') {
      this.results[category].failed++
    } else if (type === 'warning') {
      this.results[category].warnings++
    }

    // 实时输出结果
    const emoji =
      type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'
    console.log(`${emoji} [${category.toUpperCase()}] ${message}`)
  }

  /**
   * 生成检查报告
   */
  generateReport () {
    console.log('\n' + '='.repeat(80))
    console.log('🔥 积分系统检查报告')
    console.log('='.repeat(80))

    let totalPassed = 0
    let totalFailed = 0
    let totalWarnings = 0

    for (const [category, result] of Object.entries(this.results)) {
      console.log(`\n📊 ${category.toUpperCase()} 检查结果:`)
      console.log(`   ✅ 通过: ${result.passed}`)
      console.log(`   ❌ 失败: ${result.failed}`)
      console.log(`   ⚠️  警告: ${result.warnings}`)

      totalPassed += result.passed
      totalFailed += result.failed
      totalWarnings += result.warnings
    }

    console.log('\n📈 总体统计:')
    console.log(`   ✅ 总通过: ${totalPassed}`)
    console.log(`   ❌ 总失败: ${totalFailed}`)
    console.log(`   ⚠️  总警告: ${totalWarnings}`)

    const total = totalPassed + totalFailed + totalWarnings
    const successRate = total > 0 ? ((totalPassed / total) * 100).toFixed(1) : 0
    console.log(`   📊 成功率: ${successRate}%`)

    console.log('\n🎯 检查结论:')
    if (totalFailed === 0) {
      console.log('✅ 积分系统整体状态良好！')
    } else if (totalFailed <= 2) {
      console.log('⚠️ 积分系统基本正常，有少量问题需要处理')
    } else {
      console.log('❌ 积分系统存在较多问题，需要立即处理')
    }

    // 返回检查结果
    return {
      success: totalFailed === 0,
      summary: {
        passed: totalPassed,
        failed: totalFailed,
        warnings: totalWarnings,
        successRate: parseFloat(successRate)
      },
      details: this.results
    }
  }

  /**
   * 执行完整检查
   */
  async runFullCheck () {
    console.log('🚀 开始积分系统全面检查...')
    console.log(`⏰ 检查时间: ${new Date().toISOString()}`)

    try {
      await this.checkDatabase()
      await this.checkModels()
      await this.checkDataConsistency()
      await this.checkBusinessLogic()

      return this.generateReport()
    } catch (error) {
      console.error('❌ 检查过程中发生错误:', error)
      return {
        success: false,
        error: error.message,
        details: this.results
      }
    }
  }
}

/**
 * 主函数
 */
async function main () {
  const checker = new PointsSystemChecker()

  try {
    const result = await checker.runFullCheck()

    // 如果有严重错误，退出码为1
    if (!result.success) {
      process.exit(1)
    }

    process.exit(0)
  } catch (error) {
    console.error('💥 检查脚本执行失败:', error)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = { PointsSystemChecker }
