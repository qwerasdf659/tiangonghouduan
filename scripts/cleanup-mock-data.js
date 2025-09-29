#!/usr/bin/env node

/**
 * Mock数据清理脚本
 * 基于实际数据分析结果，清理数据库中的测试/mock数据
 *
 * 发现的测试数据：
 * - 23个测试用户（手机号136开头）
 * - 1308条抽奖记录（主要是用户31的1301条）
 * - 29条积分账户记录
 *
 * 清理策略：
 * - 保留管理员用户13612227930，但清理其过多的测试抽奖记录
 * - 删除其他测试用户及其相关数据
 *
 * 使用Claude Sonnet 4模型分析和创建
 * 创建时间：2025年01月21日
 */

'use strict'

const models = require('../models')

class MockDataCleaner {
  constructor () {
    this.results = {
      timestamp: new Date().toISOString(),
      users: { kept: 0, deleted: 0 },
      lotteryDraws: { kept: 0, deleted: 0 },
      pointsAccounts: { kept: 0, deleted: 0 },
      errors: []
    }

    // 管理员用户ID（保留，但清理过多的抽奖记录）
    this.adminUserId = 31 // 13612227930对应的用户ID

    // 识别的测试用户ID列表
    this.testUserIds = [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 25, 26, 27, 28, 29, 31, 32]
  }

  /**
   * 执行完整的Mock数据清理
   */
  async cleanupAllMockData (options = {}) {
    const { dryRun = false, keepAdminDraws = 50 } = options

    console.log('🧹 === Mock数据清理开始 ===')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log(`🔧 模式: ${dryRun ? '模拟运行（不实际删除）' : '实际清理'}`)
    console.log(`👤 管理员保留记录数: ${keepAdminDraws}`)

    try {
      // 1. 分析当前数据状况
      await this.analyzeCurrentData()

      // 2. 清理抽奖记录
      await this.cleanupLotteryDraws(dryRun, keepAdminDraws)

      // 3. 清理积分账户记录
      await this.cleanupPointsAccounts(dryRun)

      // 4. 清理测试用户（保留管理员）
      await this.cleanupTestUsers(dryRun)

      // 5. 生成清理报告
      this.generateCleanupReport()
    } catch (error) {
      console.error('❌ Mock数据清理失败:', error)
      this.results.errors.push({
        stage: 'main',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * 分析当前数据状况
   */
  async analyzeCurrentData () {
    console.log('\n🔍 === 分析当前数据状况 ===')

    try {
      // 检查测试用户详情（使用UUID角色系统）
      const testUsers = await models.sequelize.query(
        `SELECT user_id, mobile, nickname FROM users WHERE user_id IN (${this.testUserIds.join(',')})`,
        { type: models.sequelize.QueryTypes.SELECT }
      )

      console.log('📱 测试用户列表:')
      testUsers.forEach(user => {
        const role = user.user_id === this.adminUserId ? '👨‍💼管理员' : '👤普通用户'
        console.log(`  - ${role} ID:${user.user_id} 手机:${user.mobile} 昵称:${user.nickname}`)
      })

      // 检查抽奖记录分布
      const drawStats = await models.sequelize.query(
        `SELECT user_id, COUNT(*) as count FROM lottery_draws WHERE user_id IN (${this.testUserIds.join(',')}) GROUP BY user_id ORDER BY count DESC`,
        { type: models.sequelize.QueryTypes.SELECT }
      )

      console.log('\n🎲 抽奖记录分布:')
      drawStats.forEach((stat, index) => {
        const isAdmin = stat.user_id === this.adminUserId ? '👨‍💼' : '👤'
        console.log(`  ${index + 1}. ${isAdmin}用户${stat.user_id}: ${stat.count}条记录`)
      })

      // 检查积分账户
      const pointsStats = await models.sequelize.query(
        `SELECT COUNT(*) as total,
         SUM(CASE WHEN user_id IN (${this.testUserIds.join(',')}) THEN 1 ELSE 0 END) as test_users
         FROM user_points_accounts`,
        { type: models.sequelize.QueryTypes.SELECT }
      )

      console.log(`\n💰 积分账户统计: 总计${pointsStats[0].total}条，测试用户${pointsStats[0].test_users}条`)
    } catch (error) {
      console.error('❌ 数据分析失败:', error.message)
      this.results.errors.push({ stage: 'analyze', error: error.message })
    }
  }

  /**
   * 清理抽奖记录
   */
  async cleanupLotteryDraws (dryRun, keepAdminDraws) {
    console.log('\n🎲 === 清理抽奖记录 ===')

    try {
      // 1. 清理非管理员用户的所有抽奖记录
      const nonAdminUserIds = this.testUserIds.filter(id => id !== this.adminUserId)

      if (nonAdminUserIds.length > 0) {
        const nonAdminDrawCount = await models.sequelize.query(
          `SELECT COUNT(*) as count FROM lottery_draws WHERE user_id IN (${nonAdminUserIds.join(',')})`,
          { type: models.sequelize.QueryTypes.SELECT }
        )

        console.log(`🗑️ 清理非管理员用户抽奖记录: ${nonAdminDrawCount[0].count}条`)

        if (!dryRun && nonAdminDrawCount[0].count > 0) {
          await models.sequelize.query(
            `DELETE FROM lottery_draws WHERE user_id IN (${nonAdminUserIds.join(',')})`
          )
          this.results.lotteryDraws.deleted += nonAdminDrawCount[0].count
        }
      }

      // 2. 清理管理员用户的过多抽奖记录（保留最新的N条）
      const adminDrawCount = await models.sequelize.query(
        `SELECT COUNT(*) as count FROM lottery_draws WHERE user_id = ${this.adminUserId}`,
        { type: models.sequelize.QueryTypes.SELECT }
      )

      console.log(`👨‍💼 管理员用户抽奖记录: ${adminDrawCount[0].count}条`)

      if (adminDrawCount[0].count > keepAdminDraws) {
        const excessDraws = adminDrawCount[0].count - keepAdminDraws
        console.log(`🧹 清理管理员过多抽奖记录: ${excessDraws}条（保留最新${keepAdminDraws}条）`)

        if (!dryRun) {
          // 删除除最新N条之外的所有记录
          await models.sequelize.query(`
            DELETE FROM lottery_draws
            WHERE user_id = ${this.adminUserId}
            AND draw_id NOT IN (
              SELECT draw_id FROM (
                SELECT draw_id FROM lottery_draws
                WHERE user_id = ${this.adminUserId}
                ORDER BY created_at DESC
                LIMIT ${keepAdminDraws}
              ) t
            )
          `)
          this.results.lotteryDraws.deleted += excessDraws
        }
        this.results.lotteryDraws.kept = keepAdminDraws
      } else {
        this.results.lotteryDraws.kept = adminDrawCount[0].count
      }

      console.log(`✅ 抽奖记录清理${dryRun ? '分析' : '完成'}`)
    } catch (error) {
      console.error('❌ 抽奖记录清理失败:', error.message)
      this.results.errors.push({ stage: 'lottery_draws', error: error.message })
    }
  }

  /**
   * 清理积分账户记录
   */
  async cleanupPointsAccounts (dryRun) {
    console.log('\n💰 === 清理积分账户记录 ===')

    try {
      // 检查测试用户的积分账户
      const testPointsCount = await models.sequelize.query(
        `SELECT COUNT(*) as count FROM user_points_accounts WHERE user_id IN (${this.testUserIds.join(',')})`,
        { type: models.sequelize.QueryTypes.SELECT }
      )

      console.log(`🔍 发现测试用户积分记录: ${testPointsCount[0].count}条`)

      if (testPointsCount[0].count > 0) {
        // 保留管理员的积分记录，清理其他测试用户的
        const nonAdminUserIds = this.testUserIds.filter(id => id !== this.adminUserId)

        if (nonAdminUserIds.length > 0) {
          const nonAdminPointsCount = await models.sequelize.query(
            `SELECT COUNT(*) as count FROM user_points_accounts WHERE user_id IN (${nonAdminUserIds.join(',')})`,
            { type: models.sequelize.QueryTypes.SELECT }
          )

          console.log(`🗑️ 清理非管理员用户积分记录: ${nonAdminPointsCount[0].count}条`)

          if (!dryRun && nonAdminPointsCount[0].count > 0) {
            await models.sequelize.query(
              `DELETE FROM user_points_accounts WHERE user_id IN (${nonAdminUserIds.join(',')})`
            )
            this.results.pointsAccounts.deleted += nonAdminPointsCount[0].count
          }
        }

        // 检查管理员的积分记录
        const adminPointsCount = await models.sequelize.query(
          `SELECT COUNT(*) as count FROM user_points_accounts WHERE user_id = ${this.adminUserId}`,
          { type: models.sequelize.QueryTypes.SELECT }
        )

        this.results.pointsAccounts.kept = adminPointsCount[0].count
        console.log(`👨‍💼 保留管理员积分记录: ${adminPointsCount[0].count}条`)
      }

      console.log(`✅ 积分记录清理${dryRun ? '分析' : '完成'}`)
    } catch (error) {
      console.error('❌ 积分记录清理失败:', error.message)
      this.results.errors.push({ stage: 'points_accounts', error: error.message })
    }
  }

  /**
   * 清理测试用户（保留管理员）
   */
  async cleanupTestUsers (dryRun) {
    console.log('\n👤 === 清理测试用户 ===')

    try {
      // 获取非管理员的测试用户
      const nonAdminUserIds = this.testUserIds.filter(id => id !== this.adminUserId)

      if (nonAdminUserIds.length > 0) {
        console.log(`🗑️ 清理非管理员测试用户: ${nonAdminUserIds.length}个`)
        console.log(`   用户ID: ${nonAdminUserIds.join(', ')}`)

        if (!dryRun) {
          await models.sequelize.query(
            `DELETE FROM users WHERE user_id IN (${nonAdminUserIds.join(',')})`
          )
          this.results.users.deleted = nonAdminUserIds.length
        }
      }

      // 保留管理员用户
      console.log(`👨‍💼 保留管理员用户: 用户${this.adminUserId} (13612227930)`)
      this.results.users.kept = 1

      console.log(`✅ 用户清理${dryRun ? '分析' : '完成'}`)
    } catch (error) {
      console.error('❌ 用户清理失败:', error.message)
      this.results.errors.push({ stage: 'users', error: error.message })
    }
  }

  /**
   * 生成清理报告
   */
  generateCleanupReport () {
    console.log('\n📊 === Mock数据清理报告 ===')
    console.log(`📅 完成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log('')

    console.log('👤 用户清理结果:')
    console.log(`  ✅ 保留: ${this.results.users.kept}个用户（管理员）`)
    console.log(`  🗑️ 删除: ${this.results.users.deleted}个用户（测试用户）`)

    console.log('\n🎲 抽奖记录清理结果:')
    console.log(`  ✅ 保留: ${this.results.lotteryDraws.kept}条记录`)
    console.log(`  🗑️ 删除: ${this.results.lotteryDraws.deleted}条记录`)

    console.log('\n💰 积分记录清理结果:')
    console.log(`  ✅ 保留: ${this.results.pointsAccounts.kept}条记录`)
    console.log(`  🗑️ 删除: ${this.results.pointsAccounts.deleted}条记录`)

    if (this.results.errors.length > 0) {
      console.log('\n❌ 错误记录:')
      this.results.errors.forEach(error => {
        console.log(`  🔴 ${error.stage}: ${error.error}`)
      })
    }

    const totalDeleted = this.results.users.deleted + this.results.lotteryDraws.deleted + this.results.pointsAccounts.deleted
    const totalKept = this.results.users.kept + this.results.lotteryDraws.kept + this.results.pointsAccounts.kept

    console.log('\n🎯 清理总结:')
    console.log(`  🗑️ 总删除: ${totalDeleted}条记录`)
    console.log(`  ✅ 总保留: ${totalKept}条记录`)
    console.log(`  📊 清理比例: ${totalDeleted > 0 ? ((totalDeleted / (totalDeleted + totalKept)) * 100).toFixed(1) : 0}%`)

    console.log('\n✅ Mock数据清理完成!')
  }
}

// 运行清理脚本
if (require.main === module) {
  const cleaner = new MockDataCleaner()

  // 解析命令行参数
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run') || args.includes('-d')
  const keepAdminDraws = parseInt(args.find(arg => arg.startsWith('--keep='))?.split('=')[1]) || 50

  console.log('🧹 Mock数据清理脚本')
  console.log('使用说明:')
  console.log('  node scripts/cleanup-mock-data.js --dry-run  # 模拟运行，查看将要清理的数据')
  console.log('  node scripts/cleanup-mock-data.js           # 实际清理数据')
  console.log('  node scripts/cleanup-mock-data.js --keep=20 # 保留管理员最新20条抽奖记录')
  console.log('')

  cleaner.cleanupAllMockData({ dryRun, keepAdminDraws })
    .then(() => {
      console.log('\n🎉 Mock数据清理脚本执行完成!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 Mock数据清理脚本执行失败:', error.message)
      process.exit(1)
    })
}

module.exports = new MockDataCleaner()
