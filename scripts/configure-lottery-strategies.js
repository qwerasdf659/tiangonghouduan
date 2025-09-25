/**
 * 抽奖策略配置脚本
 * 用于启用/禁用特定的抽奖策略
 * 创建时间：2025年09月12日
 */

require('dotenv').config()
const moment = require('moment-timezone')

class LotteryStrategyConfigurator {
  constructor () {
    this.name = 'LotteryStrategyConfigurator'

    // 当前启用的策略（根据用户要求）
    this.enabledStrategies = [
      'basic_guarantee', // 基础+保底组合策略 - V4架构优化
      'management' // 管理抽奖策略 - 管理员预设奖品功能
    ]

    // 封禁的策略已迁移到123文件夹

    // 策略优先级配置
    this.strategyPriority = {
      management: 10, // 管理策略优先级最高 - 优先检查预设奖品
      guarantee: 8, // 保底策略次高 - 检查保底触发
      basic: 5 // 基础策略最低 - 标准抽奖流程
    }

    this.logInfo('抽奖策略配置器初始化完成')
  }

  /**
   * 配置统一引擎策略设置
   */
  configureUnifiedEngine () {
    try {
      this.logInfo('开始配置V4统一引擎策略设置')

      const engineConfig = {
        // 引擎基础配置
        engineVersion: '4.0.0',
        architecture: 'V4 Unified Lottery Engine',

        // 启用的策略列表（只启用这三种策略）
        enabledStrategies: this.enabledStrategies,

        // 暂时封禁的策略列表
        disabledStrategies: this.disabledStrategies,

        // 策略执行优先级（数字越大优先级越高）
        strategyPriority: this.strategyPriority,

        // 策略组合规则
        strategyComposition: {
          // 管理策略优先：如果用户有预设奖品，直接使用管理策略
          managementFirst: true,

          // 保底检查：在执行基础抽奖前检查是否需要保底
          guaranteeCheck: true,

          // 策略链：管理策略 → 保底策略 → 基础策略
          executionChain: this.enabledStrategies
        },

        // 策略执行模式
        executionMode: 'sequential', // 顺序执行
        maxExecutionTime: 30000, // 30秒超时
        enableMetrics: true, // 启用性能指标
        enableCache: true, // 启用缓存
        enableLogging: true, // 启用日志

        // 策略状态描述
        strategyStatus: {
          basic: {
            enabled: true,
            description: '基础抽奖策略 - 提供标准概率抽奖功能',
            priority: this.strategyPriority.basic,
            features: ['概率计算', '随机抽奖', '奖品分配']
          },
          guarantee: {
            enabled: true,
            description: '保底抽奖策略 - 连续失败保底机制',
            priority: this.strategyPriority.guarantee,
            features: ['保底触发', '连续失败计数', '保底奖品发放']
          },
          management: {
            enabled: true,
            description: '管理抽奖策略 - 管理员预设奖品功能',
            priority: this.strategyPriority.management,
            features: ['预设奖品', '管理员干预', '强制中奖']
          }
          // 被禁用的策略配置已迁移到123文件夹
        },

        // 配置更新时间
        lastUpdated: moment().tz('Asia/Shanghai').format(),
        updatedBy: 'system',
        configVersion: '4.0.0'
      }

      this.logInfo('策略配置生成完成', {
        enabledCount: this.enabledStrategies.length,
        disabledCount: this.disabledStrategies.length,
        totalStrategies: this.enabledStrategies.length + this.disabledStrategies.length
      })

      return engineConfig
    } catch (error) {
      this.logError('配置统一引擎策略失败', error)
      throw error
    }
  }

  /**
   * 验证策略配置
   */
  validateConfiguration () {
    try {
      this.logInfo('开始验证抽奖策略配置')

      const issues = []

      // 检查是否有启用的策略
      if (this.enabledStrategies.length === 0) {
        issues.push('至少需要启用一个抽奖策略')
      }

      // 检查基础策略是否启用（必需）
      if (!this.enabledStrategies.includes('basic')) {
        issues.push('基础抽奖策略是必需的，不能被禁用')
      }

      // 检查优先级配置
      for (const strategy of this.enabledStrategies) {
        if (!this.strategyPriority[strategy]) {
          issues.push(`策略 ${strategy} 缺少优先级配置`)
        }
      }

      // 检查策略冲突
      const intersection = this.enabledStrategies.filter(s => this.disabledStrategies.includes(s))
      if (intersection.length > 0) {
        issues.push(`策略冲突：${intersection.join(', ')} 既在启用列表中又在禁用列表中`)
      }

      if (issues.length > 0) {
        this.logError('策略配置验证失败', { issues })
        return { valid: false, issues }
      }

      this.logInfo('策略配置验证通过')
      return { valid: true, issues: [] }
    } catch (error) {
      this.logError('策略配置验证异常', error)
      return { valid: false, issues: ['验证过程发生异常'] }
    }
  }

  /**
   * 应用配置到系统
   */
  async applyConfiguration () {
    try {
      this.logInfo('开始应用抽奖策略配置')

      // 验证配置
      const validation = this.validateConfiguration()
      if (!validation.valid) {
        throw new Error(`配置验证失败: ${validation.issues.join('; ')}`)
      }

      // 生成引擎配置
      const engineConfig = this.configureUnifiedEngine()

      // 输出配置摘要
      this.logConfigurationSummary(engineConfig)

      this.logInfo('抽奖策略配置应用成功')
      return {
        success: true,
        config: engineConfig,
        appliedAt: moment().tz('Asia/Shanghai').format()
      }
    } catch (error) {
      this.logError('应用抽奖策略配置失败', error)
      return {
        success: false,
        error: error.message,
        failedAt: moment().tz('Asia/Shanghai').format()
      }
    }
  }

  /**
   * 输出配置摘要
   */
  logConfigurationSummary (config) {
    this.logInfo('='.repeat(60))
    this.logInfo('V4统一抽奖引擎策略配置摘要')
    this.logInfo('='.repeat(60))

    this.logInfo(`引擎版本: ${config.engineVersion}`)
    this.logInfo(`配置版本: ${config.configVersion}`)
    this.logInfo(`更新时间: ${config.lastUpdated}`)

    this.logInfo('\n✅ 启用的策略:')
    config.enabledStrategies.forEach(strategy => {
      const status = config.strategyStatus[strategy]
      this.logInfo(`   - ${strategy}: ${status.description} (优先级: ${status.priority})`)
    })

    this.logInfo('\n❌ 封禁的策略:')
    config.disabledStrategies.forEach(strategy => {
      const status = config.strategyStatus[strategy]
      this.logInfo(`   - ${strategy}: ${status.description} (封禁原因: ${status.reason})`)
    })

    this.logInfo('\n🔄 策略执行链:')
    this.logInfo(`   ${config.strategyComposition.executionChain.join(' → ')}`)

    this.logInfo('\n📊 策略统计:')
    this.logInfo(
      `   总策略数: ${config.enabledStrategies.length + config.disabledStrategies.length}`
    )
    this.logInfo(`   启用策略: ${config.enabledStrategies.length}`)
    this.logInfo(`   封禁策略: ${config.disabledStrategies.length}`)

    this.logInfo('='.repeat(60))
  }

  /**
   * 获取策略运行状态
   */
  getStrategyStatus () {
    return {
      enabled: this.enabledStrategies,
      disabled: this.disabledStrategies,
      priority: this.strategyPriority,
      totalEnabled: this.enabledStrategies.length,
      totalDisabled: this.disabledStrategies.length,
      lastCheck: moment().tz('Asia/Shanghai').format()
    }
  }

  /**
   * 日志记录方法
   */
  logInfo (message, data = {}) {
    const timestamp = moment().tz('Asia/Shanghai').format()
    console.log(`[${timestamp}] [${this.name}] [INFO] ${message}`, data)
  }

  logError (message, error) {
    const timestamp = moment().tz('Asia/Shanghai').format()
    console.error(`[${timestamp}] [${this.name}] [ERROR] ${message}`, error)
  }
}

// 脚本执行入口
async function main () {
  try {
    console.log('🎯 抽奖策略配置脚本启动')
    console.log(`⏰ 执行时间：${moment().tz('Asia/Shanghai').format()}`)

    const configurator = new LotteryStrategyConfigurator()

    // 应用配置
    const result = await configurator.applyConfiguration()

    if (result.success) {
      console.log('\n✅ 抽奖策略配置成功')
      console.log(`   - 启用策略：${configurator.enabledStrategies.join(', ')}`)
      console.log(`   - 封禁策略：${configurator.disabledStrategies.join(', ')}`)
      console.log(`   - 应用时间：${result.appliedAt}`)
    } else {
      console.error('\n❌ 抽奖策略配置失败')
      console.error(`   错误信息：${result.error}`)
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ 配置脚本执行失败:', error.message)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = LotteryStrategyConfigurator
