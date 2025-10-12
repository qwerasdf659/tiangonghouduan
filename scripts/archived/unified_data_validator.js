#!/usr/bin/env node

/**
 * V4 统一数据验证器
 * 整合所有分散的验证和检查脚本，提供一站式数据完整性验证
 *
 * @description 整合verify-*.js和check-*.js文件功能，统一数据验证流程
 * @version 4.0.0
 * @date 2025-10-01
 * @author Claude Sonnet 4
 */

require('dotenv').config()
const { sequelize, User } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')
const { getUserRoles } = require('../middleware/auth')

class UnifiedDataValidator {
  constructor () {
    this.results = {
      startTime: BeijingTimeHelper.now(),
      validations: [],
      warnings: [],
      errors: [],
      summary: {}
    }
  }

  // 记录验证结果
  recordResult (validationType, success, details = null, warning = null, error = null) {
    const result = {
      type: validationType,
      success,
      details,
      warning,
      error,
      timestamp: BeijingTimeHelper.now()
    }

    this.results.validations.push(result)

    if (warning) {
      this.results.warnings.push({ type: validationType, message: warning })
    }

    if (error) {
      this.results.errors.push({ type: validationType, message: error })
    }
  }

  // === 积分数据完整性验证 ===

  async validatePointsDataIntegrity () {
    console.log('\n=== 验证积分数据完整性 ===')

    try {
      // 1. 检查用户积分账户完整性
      const [usersWithoutAccounts] = await sequelize.query(`
        SELECT u.user_id, u.mobile, u.nickname
        FROM users u
        LEFT JOIN user_points_accounts upa ON u.user_id = upa.user_id
        WHERE upa.user_id IS NULL AND u.status = 'active'
      `)

      if (usersWithoutAccounts.length > 0) {
        console.log(`⚠️  发现 ${usersWithoutAccounts.length} 个用户缺少积分账户`)
        this.recordResult('积分账户完整性', false, null,
          `${usersWithoutAccounts.length}个活跃用户缺少积分账户`)
      } else {
        console.log('✅ 所有活跃用户都有积分账户')
        this.recordResult('积分账户完整性', true, { message: '所有活跃用户都有积分账户' })
      }

      // 2. 检查积分账户数据一致性
      const [inconsistentAccounts] = await sequelize.query(`
        SELECT 
          user_id,
          available_points,
          total_earned,
          total_consumed,
          (total_earned - total_consumed) as calculated_balance
        FROM user_points_accounts
        WHERE available_points != (total_earned - total_consumed)
      `)

      if (inconsistentAccounts.length > 0) {
        console.log(`❌ 发现 ${inconsistentAccounts.length} 个积分账户数据不一致`)
        this.recordResult('积分数据一致性', false, inconsistentAccounts,
          `${inconsistentAccounts.length}个积分账户的available_points与计算值不符`)

        inconsistentAccounts.forEach(account => {
          console.log(`   用户 ${account.user_id}: 显示${account.available_points} 计算${account.calculated_balance}`)
        })
      } else {
        console.log('✅ 所有积分账户数据一致')
        this.recordResult('积分数据一致性', true, { message: '所有积分账户数据一致' })
      }

      // 3. 检查积分交易记录
      const [orphanedTransactions] = await sequelize.query(`
        SELECT tr.record_id, tr.from_user_id, tr.to_user_id
        FROM trade_records tr
        LEFT JOIN users u1 ON tr.from_user_id = u1.user_id
        LEFT JOIN users u2 ON tr.to_user_id = u2.user_id
        WHERE u1.user_id IS NULL OR u2.user_id IS NULL
      `)

      if (orphanedTransactions.length > 0) {
        console.log(`❌ 发现 ${orphanedTransactions.length} 条孤立的交易记录`)
        this.recordResult('交易记录完整性', false, orphanedTransactions,
          null, `${orphanedTransactions.length}条交易记录关联用户不存在`)
      } else {
        console.log('✅ 所有交易记录都有有效的用户关联')
        this.recordResult('交易记录完整性', true, { message: '所有交易记录都有有效的用户关联' })
      }
    } catch (error) {
      console.error('❌ 积分数据完整性验证失败:', error.message)
      this.recordResult('积分数据完整性', false, null, null, error.message)
    }
  }

  // === 用户数据验证 ===

  async validateUserData () {
    console.log('\n=== 验证用户数据 ===')

    try {
      // 1. 检查真实用户数据
      const [realUsers] = await sequelize.query(`
        SELECT 
          user_id,
          mobile,
          nickname,
          status,
          created_at,
          updated_at
        FROM users 
        WHERE status = 'active' 
        AND mobile IS NOT NULL 
        AND mobile != ''
        AND LENGTH(mobile) = 11
      `)

      console.log(`✅ 发现 ${realUsers.length} 个真实用户账户`)
      this.recordResult('真实用户数据', true, {
        totalUsers: realUsers.length,
        sample: realUsers.slice(0, 3)
      })

      // 2. 检查测试用户
      const testUser = await User.findOne({
        where: { user_id: 31 },
        include: [{
          model: require('../models').Role,
          as: 'roles',
          through: { where: { is_active: true } },
          attributes: ['role_name', 'role_level']
        }]
      })

      if (testUser) {
        const isAdmin = testUser.roles && testUser.roles.some(role => role.role_level >= 100)
        console.log('✅ 测试用户存在')
        console.log(`   用户ID: ${testUser.user_id}`)
        console.log(`   手机号: ${testUser.mobile}`)
        console.log(`   管理员权限: ${isAdmin ? '是' : '否'}`)

        this.recordResult('测试用户验证', true, {
          userId: testUser.user_id,
          mobile: testUser.mobile,
          isAdmin,
          rolesCount: testUser.roles?.length || 0
        })
      } else {
        console.log('❌ 测试用户不存在')
        this.recordResult('测试用户验证', false, null, null, '测试用户(ID:31)不存在')
      }

      // 3. 检查用户角色权限
      if (testUser) {
        const userRoles = await getUserRoles(31)
        console.log(`✅ 用户角色验证: ${JSON.stringify(userRoles, null, 2)}`)
        this.recordResult('用户权限验证', true, userRoles)
      }
    } catch (error) {
      console.error('❌ 用户数据验证失败:', error.message)
      this.recordResult('用户数据验证', false, null, null, error.message)
    }
  }

  // === 奖品权重字段验证 ===

  async validatePrizeWeightField () {
    console.log('\n=== 验证奖品权重字段 ===')

    try {
      const schema = await sequelize.query('DESCRIBE lottery_prizes', {
        type: sequelize.QueryTypes.SELECT
      })

      const hasPrizeWeight = schema.some(field => field.Field === 'prize_weight')
      console.log(`🎯 prize_weight字段存在: ${hasPrizeWeight ? '✅ 是' : '❌ 否'}`)

      if (hasPrizeWeight) {
        // 检查字段数据
        const [prizeWeights] = await sequelize.query(`
          SELECT prize_id, prize_name, prize_weight
          FROM lottery_prizes 
          WHERE prize_weight IS NOT NULL
          LIMIT 10
        `)

        console.log(`✅ prize_weight字段数据完整: ${prizeWeights.length} 条记录有权重值`)
        this.recordResult('奖品权重字段', true, {
          hasField: true,
          recordsWithWeight: prizeWeights.length,
          sample: prizeWeights.slice(0, 3)
        })
      } else {
        console.log('⚠️  prize_weight字段缺失，需要添加')
        this.recordResult('奖品权重字段', false, { hasField: false },
          'prize_weight字段缺失，影响权重抽奖功能')
      }
    } catch (error) {
      console.error('❌ 奖品权重字段验证失败:', error.message)
      this.recordResult('奖品权重字段', false, null, null, error.message)
    }
  }

  // === 验证状态数据 ===

  async validateVerificationStatusData () {
    console.log('\n=== 验证状态数据 ===')

    try {
      // 1. 检查用户状态分布
      const [userStatusStats] = await sequelize.query(`
        SELECT status, COUNT(*) as count
        FROM users
        GROUP BY status
      `)

      console.log('👤 用户状态统计:')
      userStatusStats.forEach(stat => {
        console.log(`   ${stat.status}: ${stat.count} 人`)
      })

      this.recordResult('用户状态统计', true, { statusStats: userStatusStats })

      // 2. 检查抽奖记录状态
      const [lotteryStatusStats] = await sequelize.query(`
        SELECT is_winner, COUNT(*) as count
        FROM lottery_draws
        GROUP BY is_winner
      `)

      console.log('🎯 抽奖结果统计:')
      lotteryStatusStats.forEach(stat => {
        const label = stat.is_winner ? '中奖' : '未中奖'
        console.log(`   ${label}: ${stat.count} 次`)
      })

      this.recordResult('抽奖状态统计', true, { lotteryStats: lotteryStatusStats })

      // 3. 检查库存状态
      const [inventoryStatusStats] = await sequelize.query(`
        SELECT status, COUNT(*) as count
        FROM user_inventory
        GROUP BY status
      `)

      console.log('📦 库存状态统计:')
      inventoryStatusStats.forEach(stat => {
        console.log(`   ${stat.status}: ${stat.count} 个物品`)
      })

      this.recordResult('库存状态统计', true, { inventoryStats: inventoryStatusStats })
    } catch (error) {
      console.error('❌ 验证状态数据失败:', error.message)
      this.recordResult('验证状态数据', false, null, null, error.message)
    }
  }

  // === 审计功能验证 ===

  async validateAuditFeature () {
    console.log('\n=== 验证审计功能 ===')

    try {
      // 1. 检查审计日志表是否存在
      const [auditTables] = await sequelize.query(`
        SELECT TABLE_NAME
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME LIKE '%audit%' OR TABLE_NAME LIKE '%log%'
      `)

      if (auditTables.length > 0) {
        console.log('✅ 发现审计相关表:')
        auditTables.forEach(table => {
          console.log(`   - ${table.TABLE_NAME}`)
        })
        this.recordResult('审计表存在性', true, { auditTables: auditTables.map(t => t.TABLE_NAME) })
      } else {
        console.log('⚠️  未发现专门的审计表')
        this.recordResult('审计表存在性', false, { auditTables: [] },
          '没有发现专门的审计日志表')
      }

      // 2. 检查关键操作记录
      const [recentOperations] = await sequelize.query(`
        SELECT 
          'lottery_draws' as operation_type,
          COUNT(*) as recent_count
        FROM lottery_draws 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        
        UNION ALL
        
        SELECT 
          'trade_records' as operation_type,
          COUNT(*) as recent_count
        FROM trade_records 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        
        UNION ALL
        
        SELECT 
          'exchange_records' as operation_type,
          COUNT(*) as recent_count
        FROM exchange_records 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      `)

      console.log('📊 最近7天操作记录:')
      recentOperations.forEach(op => {
        console.log(`   ${op.operation_type}: ${op.recent_count} 次`)
      })

      this.recordResult('操作记录审计', true, { recentOperations })
    } catch (error) {
      console.error('❌ 审计功能验证失败:', error.message)
      this.recordResult('审计功能验证', false, null, null, error.message)
    }
  }

  // === 运行所有验证 ===

  async runAllValidations () {
    console.log('🔍 === 开始V4统一数据验证 ===')
    console.log(`📅 开始时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log('')

    try {
      // 1. 积分数据完整性验证
      await this.validatePointsDataIntegrity()

      // 2. 用户数据验证
      await this.validateUserData()

      // 3. 奖品权重字段验证
      await this.validatePrizeWeightField()

      // 4. 验证状态数据
      await this.validateVerificationStatusData()

      // 5. 审计功能验证
      await this.validateAuditFeature()

      // 6. 生成验证报告
      this.generateValidationReport()
    } catch (error) {
      console.error('💥 数据验证失败:', error.message)
      throw error
    }
  }

  // 生成验证报告
  generateValidationReport () {
    const endTime = BeijingTimeHelper.now()
    const totalValidations = this.results.validations.length
    const successfulValidations = this.results.validations.filter(v => v.success).length
    const failedValidations = totalValidations - successfulValidations
    const successRate = Math.round((successfulValidations / totalValidations) * 100)

    console.log('\n📊 === 数据验证报告 ===')
    console.log(`📅 完成时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log(`🎯 验证项目: ${totalValidations} 项`)
    console.log(`✅ 成功项目: ${successfulValidations} 项`)
    console.log(`❌ 失败项目: ${failedValidations} 项`)
    console.log(`📈 成功率: ${successRate}%`)
    console.log('')

    // 详细结果
    console.log('📋 详细验证结果:')
    this.results.validations.forEach(validation => {
      const status = validation.success ? '✅' : '❌'
      console.log(`   ${status} ${validation.type}`)
      if (validation.warning) {
        console.log(`      ⚠️  警告: ${validation.warning}`)
      }
      if (validation.error) {
        console.log(`      🚨 错误: ${validation.error}`)
      }
    })

    // 警告汇总
    if (this.results.warnings.length > 0) {
      console.log('')
      console.log('⚠️  警告汇总:')
      this.results.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning.type}: ${warning.message}`)
      })
    }

    // 错误汇总
    if (this.results.errors.length > 0) {
      console.log('')
      console.log('🚨 错误汇总:')
      this.results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.type}: ${error.message}`)
      })
    }

    // 总体评价
    console.log('')
    if (successRate >= 95) {
      console.log('🎉 数据质量优秀！')
    } else if (successRate >= 85) {
      console.log('✅ 数据质量良好')
    } else if (successRate >= 70) {
      console.log('⚠️  数据质量一般，建议优化')
    } else {
      console.log('🚨 数据质量较差，需要立即修复')
    }

    this.results.summary = {
      totalValidations,
      successfulValidations,
      failedValidations,
      successRate,
      startTime: this.results.startTime,
      endTime,
      warnings: this.results.warnings.length,
      errors: this.results.errors.length
    }

    return this.results
  }
}

// 如果直接运行此文件，执行验证
if (require.main === module) {
  const validator = new UnifiedDataValidator()
  validator.runAllValidations()
    .then(result => {
      process.exit(result?.summary?.successRate >= 80 ? 0 : 1)
    })
    .catch(error => {
      console.error('💥 数据验证失败:', error)
      process.exit(1)
    })
}

module.exports = UnifiedDataValidator
