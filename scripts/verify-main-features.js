/**
 * 主体功能验证脚本
 * 验证主体功能实现.md中要求的所有功能是否正确实现
 *
 * 验证项目：
 * 1. 管理端为特定用户分配奖品功能
 * 2. 用户端优先抽取预设奖品功能
 * 3. 积分检查和扣除机制
 * 4. 保底抽奖策略（累计10次保底）
 * 5. 抽奖四字段功能
 * 6. 奖品配置符合需求（8个奖品，正确概率）
 *
 * @version 4.0.0
 * @date 2025-09-14
 */

const models = require('../models')

class MainFeatureVerifier {
  constructor () {
    this.verificationResults = {
      userSpecificPrizeAllocation: false,
      priorityPrizeDrawing: false,
      pointsCheckMechanism: false,
      guaranteeStrategy: false,
      fourFieldsSupport: false,
      prizeConfiguration: false
    }
    this.issues = []
  }

  /**
   * 执行完整的主体功能验证
   */
  async verifyAllFeatures () {
    console.log('🔍 开始主体功能完整性验证...')
    console.log('='.repeat(60))

    try {
      // 1. 验证用户特定奖品分配功能
      await this.verifyUserSpecificPrizeAllocation()

      // 2. 验证优先抽取预设奖品功能
      await this.verifyPriorityPrizeDrawing()

      // 3. 验证积分检查机制
      await this.verifyPointsCheckMechanism()

      // 4. 验证保底抽奖策略
      await this.verifyGuaranteeStrategy()

      // 5. 验证抽奖四字段功能
      await this.verifyFourFieldsSupport()

      // 6. 验证奖品配置
      await this.verifyPrizeConfiguration()

      // 生成验证报告
      this.generateVerificationReport()
    } catch (error) {
      console.error('❌ 主体功能验证异常:', error.message)
      this.issues.push({
        category: 'VERIFICATION_ERROR',
        description: `验证过程异常: ${error.message}`,
        severity: 'CRITICAL'
      })
    }
  }

  /**
   * 1. 验证管理端特定用户奖品分配功能
   */
  async verifyUserSpecificPrizeAllocation () {
    console.log('\n1️⃣ 验证用户特定奖品分配功能...')

    try {
      // 检查UserSpecificPrizeQueue模型是否存在
      const { UserSpecificPrizeQueue } = models
      if (!UserSpecificPrizeQueue) {
        this.issues.push({
          category: 'MODEL_MISSING',
          description: 'UserSpecificPrizeQueue模型不存在',
          severity: 'CRITICAL'
        })
        return
      }

      // 检查模型方法是否存在
      const requiredMethods = [
        'getNextPrizeForUser',
        'markAsAwarded',
        'createUserQueue',
        'getUserQueueStats'
      ]
      const missingMethods = requiredMethods.filter(
        method => typeof UserSpecificPrizeQueue[method] !== 'function'
      )

      if (missingMethods.length > 0) {
        this.issues.push({
          category: 'MODEL_METHODS_MISSING',
          description: `缺少必要方法: ${missingMethods.join(', ')}`,
          severity: 'HIGH'
        })
        return
      }

      // 检查数据库表是否存在
      const [tableCheck] = await models.db.query('SHOW TABLES LIKE \'user_specific_prize_queues\'')
      if (tableCheck.length === 0) {
        this.issues.push({
          category: 'TABLE_MISSING',
          description: 'user_specific_prize_queues表不存在',
          severity: 'CRITICAL'
        })
        return
      }

      console.log('   ✅ UserSpecificPrizeQueue模型存在')
      console.log('   ✅ 所有必要方法已实现')
      console.log('   ✅ 数据库表存在')

      this.verificationResults.userSpecificPrizeAllocation = true
    } catch (error) {
      this.issues.push({
        category: 'USER_SPECIFIC_ALLOCATION_ERROR',
        description: `用户特定奖品分配功能验证失败: ${error.message}`,
        severity: 'HIGH'
      })
    }
  }

  /**
   * 2. 验证用户端优先抽取预设奖品功能
   */
  async verifyPriorityPrizeDrawing () {
    console.log('\n2️⃣ 验证优先抽取预设奖品功能...')

    try {
      // 检查基础抽奖策略是否支持特定奖品检查

      // 检查是否有检查用户特定队列的逻辑
      const strategyCode = require('fs').readFileSync(
        'services/UnifiedLotteryEngine/strategies/BasicLotteryStrategy.js',
        'utf8'
      )

      const hasUserQueueCheck =
        strategyCode.includes('UserSpecificPrizeQueue') &&
        strategyCode.includes('getNextPrizeForUser')

      if (!hasUserQueueCheck) {
        this.issues.push({
          category: 'PRIORITY_DRAWING_MISSING',
          description: '基础抽奖策略未集成用户特定奖品队列检查',
          severity: 'HIGH'
        })
        return
      }

      console.log('   ✅ 基础抽奖策略已集成特定奖品队列检查')
      console.log('   ✅ 优先抽取机制已实现')

      this.verificationResults.priorityPrizeDrawing = true
    } catch (error) {
      this.issues.push({
        category: 'PRIORITY_DRAWING_ERROR',
        description: `优先抽取功能验证失败: ${error.message}`,
        severity: 'HIGH'
      })
    }
  }

  /**
   * 3. 验证积分检查机制
   */
  async verifyPointsCheckMechanism () {
    console.log('\n3️⃣ 验证积分检查机制...')

    try {
      // 检查是否存在积分检查逻辑
      const strategyFiles = [
        'services/UnifiedLotteryEngine/strategies/BasicLotteryStrategy.js',
        'services/UnifiedLotteryEngine/strategies/ManagementStrategy.js'
      ]

      let pointsCheckImplemented = false

      for (const file of strategyFiles) {
        const code = require('fs').readFileSync(file, 'utf8')
        if (
          code.includes('积分不足') ||
          code.includes('available_points') ||
          code.includes('points.*>=')
        ) {
          pointsCheckImplemented = true
          break
        }
      }

      if (!pointsCheckImplemented) {
        this.issues.push({
          category: 'POINTS_CHECK_MISSING',
          description: '积分检查机制未实现',
          severity: 'HIGH'
        })
        return
      }

      // 检查用户积分账户模型
      const { UserPointsAccount } = models
      if (!UserPointsAccount) {
        this.issues.push({
          category: 'POINTS_ACCOUNT_MISSING',
          description: 'UserPointsAccount模型不存在',
          severity: 'CRITICAL'
        })
        return
      }

      console.log('   ✅ 积分检查逻辑已实现')
      console.log('   ✅ 用户积分账户模型存在')

      this.verificationResults.pointsCheckMechanism = true
    } catch (error) {
      this.issues.push({
        category: 'POINTS_CHECK_ERROR',
        description: `积分检查机制验证失败: ${error.message}`,
        severity: 'HIGH'
      })
    }
  }

  /**
   * 4. 验证保底抽奖策略
   */
  async verifyGuaranteeStrategy () {
    console.log('\n4️⃣ 验证保底抽奖策略...')

    try {
      const GuaranteeStrategy = require('../services/UnifiedLotteryEngine/strategies/GuaranteeStrategy')
      const guaranteeStrategy = new GuaranteeStrategy()

      // 检查保底配置
      const config = guaranteeStrategy.config
      if (!config || !config.guaranteeRule) {
        this.issues.push({
          category: 'GUARANTEE_CONFIG_MISSING',
          description: '保底策略配置缺失',
          severity: 'HIGH'
        })
        return
      }

      // 验证保底规则
      const rule = config.guaranteeRule
      if (rule.triggerCount !== 10) {
        this.issues.push({
          category: 'GUARANTEE_RULE_INCORRECT',
          description: `保底触发次数不正确：期望10次，实际${rule.triggerCount}次`,
          severity: 'MEDIUM'
        })
      }

      if (rule.guaranteePrizeId !== 9) {
        this.issues.push({
          category: 'GUARANTEE_PRIZE_INCORRECT',
          description: `保底奖品ID不正确：期望9号，实际${rule.guaranteePrizeId}号`,
          severity: 'MEDIUM'
        })
      }

      console.log('   ✅ 保底策略类存在')
      console.log(`   ✅ 保底触发次数: ${rule.triggerCount}次`)
      console.log(`   ✅ 保底奖品: ${rule.guaranteePrizeId}号奖品`)
      console.log(`   ✅ 触发后重置: ${rule.counterResetAfterTrigger}`)

      this.verificationResults.guaranteeStrategy = true
    } catch (error) {
      this.issues.push({
        category: 'GUARANTEE_STRATEGY_ERROR',
        description: `保底策略验证失败: ${error.message}`,
        severity: 'HIGH'
      })
    }
  }

  /**
   * 5. 验证抽奖四字段功能
   */
  async verifyFourFieldsSupport () {
    console.log('\n5️⃣ 验证抽奖四字段功能...')

    try {
      // 检查LotteryRecord模型的四字段
      const { LotteryRecord } = models
      if (!LotteryRecord) {
        this.issues.push({
          category: 'LOTTERY_RECORD_MISSING',
          description: 'LotteryRecord模型不存在',
          severity: 'CRITICAL'
        })
        return
      }

      // 验证数据库表中的四字段
      const [fieldCheck] = await models.db.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
        AND TABLE_NAME = 'lottery_records' 
        AND COLUMN_NAME IN ('draw_type', 'batch_id', 'draw_count', 'draw_sequence')
      `)

      const requiredFields = ['draw_type', 'batch_id', 'draw_count', 'draw_sequence']
      const missingFields = requiredFields.filter(
        field => !fieldCheck.some(row => row.COLUMN_NAME === field)
      )

      if (missingFields.length > 0) {
        this.issues.push({
          category: 'FOUR_FIELDS_MISSING',
          description: `缺少四字段: ${missingFields.join(', ')}`,
          severity: 'HIGH'
        })
        return
      }

      console.log('   ✅ LotteryRecord模型存在')
      console.log('   ✅ 四字段已实现：draw_type, batch_id, draw_count, draw_sequence')

      this.verificationResults.fourFieldsSupport = true
    } catch (error) {
      this.issues.push({
        category: 'FOUR_FIELDS_ERROR',
        description: `四字段功能验证失败: ${error.message}`,
        severity: 'HIGH'
      })
    }
  }

  /**
   * 6. 验证奖品配置
   */
  async verifyPrizeConfiguration () {
    console.log('\n6️⃣ 验证奖品配置...')

    try {
      // 获取测试活动的奖品配置
      const testCampaign = await models.LotteryCampaign.findOne({
        where: { campaign_name: '餐厅积分抽奖' }
      })

      if (!testCampaign) {
        this.issues.push({
          category: 'TEST_CAMPAIGN_MISSING',
          description: '餐厅积分抽奖活动不存在',
          severity: 'HIGH'
        })
        return
      }

      const prizes = await models.LotteryPrize.findAll({
        where: { campaign_id: testCampaign.campaign_id },
        order: [['sort_order', 'ASC']]
      })

      // 验证奖品数量
      if (prizes.length !== 8) {
        this.issues.push({
          category: 'PRIZE_COUNT_INCORRECT',
          description: `奖品数量不正确：期望8个，实际${prizes.length}个`,
          severity: 'MEDIUM'
        })
      }

      // 验证具体奖品配置
      const expectedPrizes = [
        { name: '八八折', probability: 0.0 },
        { name: '100积分', probability: 0.3 },
        { name: '甜品1份', probability: 0.2 },
        { name: '青菜1份', probability: 0.3 },
        { name: '2000积分券', probability: 0.01 },
        { name: '500积分券', probability: 0.18 },
        { name: '精品首饰一个', probability: 0.01 },
        { name: '生腌拼盘158', probability: 0.0 }
      ]

      let configurationCorrect = true
      expectedPrizes.forEach((expected, index) => {
        const actualPrize = prizes[index]
        if (!actualPrize) {
          this.issues.push({
            category: 'PRIZE_MISSING',
            description: `缺少第${index + 1}个奖品: ${expected.name}`,
            severity: 'MEDIUM'
          })
          configurationCorrect = false
          return
        }

        if (actualPrize.prize_name !== expected.name) {
          this.issues.push({
            category: 'PRIZE_NAME_INCORRECT',
            description: `第${index + 1}个奖品名称不正确：期望${expected.name}，实际${actualPrize.prize_name}`,
            severity: 'MEDIUM'
          })
          configurationCorrect = false
        }

        if (Math.abs(actualPrize.win_probability - expected.probability) > 0.001) {
          this.issues.push({
            category: 'PRIZE_PROBABILITY_INCORRECT',
            description: `第${index + 1}个奖品概率不正确：期望${expected.probability}，实际${actualPrize.win_probability}`,
            severity: 'MEDIUM'
          })
          configurationCorrect = false
        }
      })

      if (configurationCorrect) {
        console.log('   ✅ 奖品数量正确：8个')
        console.log('   ✅ 奖品名称和概率配置正确')
        this.verificationResults.prizeConfiguration = true
      }
    } catch (error) {
      this.issues.push({
        category: 'PRIZE_CONFIG_ERROR',
        description: `奖品配置验证失败: ${error.message}`,
        severity: 'HIGH'
      })
    }
  }

  /**
   * 生成验证报告
   */
  generateVerificationReport () {
    console.log('\n' + '='.repeat(60))
    console.log('📊 主体功能验证报告')
    console.log('='.repeat(60))

    const results = this.verificationResults
    const totalFeatures = Object.keys(results).length
    const implementedFeatures = Object.values(results).filter(Boolean).length
    const completionRate = ((implementedFeatures / totalFeatures) * 100).toFixed(1)

    console.log(`\n🎯 功能完成度: ${implementedFeatures}/${totalFeatures} (${completionRate}%)`)
    console.log('\n📋 功能实现状态:')

    const featureNames = {
      userSpecificPrizeAllocation: '管理端特定用户奖品分配',
      priorityPrizeDrawing: '用户端优先抽取预设奖品',
      pointsCheckMechanism: '积分检查和扣除机制',
      guaranteeStrategy: '保底抽奖策略（累计10次保底）',
      fourFieldsSupport: '抽奖四字段功能',
      prizeConfiguration: '奖品配置（8个奖品，正确概率）'
    }

    Object.entries(results).forEach(([key, implemented]) => {
      const status = implemented ? '✅' : '❌'
      console.log(`   ${status} ${featureNames[key]}`)
    })

    // 问题汇总
    if (this.issues.length > 0) {
      console.log('\n⚠️ 发现的问题:')
      this.issues.forEach((issue, index) => {
        const severity =
          issue.severity === 'CRITICAL' ? '🔴' : issue.severity === 'HIGH' ? '🟡' : '🟢'
        console.log(`   ${severity} ${index + 1}. [${issue.category}] ${issue.description}`)
      })
    } else {
      console.log('\n🎉 未发现问题，所有功能验证通过！')
    }

    // 总体评价
    console.log('\n🏆 总体评价:')
    if (completionRate >= 100) {
      console.log('   🌟 优秀：所有主体功能均已正确实现')
    } else if (completionRate >= 80) {
      console.log('   👍 良好：大部分功能已实现，需要完善细节')
    } else if (completionRate >= 60) {
      console.log('   ⚠️ 一般：基础功能已实现，需要补充核心功能')
    } else {
      console.log('   ❌ 需改进：多个核心功能缺失，需要重点完善')
    }

    console.log('='.repeat(60))

    return {
      completionRate: parseFloat(completionRate),
      implementedFeatures,
      totalFeatures,
      results: this.verificationResults,
      issues: this.issues
    }
  }
}

// 执行验证
if (require.main === module) {
  const verifier = new MainFeatureVerifier()
  verifier
    .verifyAllFeatures()
    .then(() => {
      console.log('✅ 主体功能验证完成')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 主体功能验证失败:', error.message)
      process.exit(1)
    })
}

module.exports = MainFeatureVerifier
