/**
 * 统一脚本管理器
 * V4后端数据库项目 - 脚本执行统一管理
 * 创建时间：2025-09-14 北京时间
 *
 * 功能：
 * 1. 统一管理所有scripts的执行
 * 2. 提供标准化的脚本接口
 * 3. 记录脚本执行历史和结果
 * 4. 支持脚本依赖管理和批量执行
 */

const path = require('path')
const { promisify } = require('util')
const { exec } = require('child_process')
const moment = require('moment-timezone')

const execAsync = promisify(exec)

class UnifiedScriptManager {
  constructor () {
    this.name = 'UnifiedScriptManager'
    this.version = '4.0.0'
    this.availableScripts = new Map()
    this.executionHistory = []

    // 初始化脚本注册
    this.loadAvailableScripts()

    this.log('统一脚本管理器初始化完成')
  }

  /**
   * 加载所有可用的脚本
   */
  loadAvailableScripts () {
    // 核心功能脚本
    this.availableScripts.set('health', {
      name: '系统健康检查',
      path: 'scripts/core/health-check.js',
      description: '检查数据库、Redis、服务状态',
      category: 'monitoring',
      dependencies: [],
      estimatedTime: '30s'
    })

    this.availableScripts.set('database', {
      name: 'V4数据库检查',
      path: 'scripts/core/v4-database-check.js',
      description: '使用V4SystemManager进行完整数据库检查',
      category: 'database',
      dependencies: [],
      estimatedTime: '30s'
    })

    this.availableScripts.set('system-verification', {
      name: '系统完整性验证',
      path: 'scripts/core/final-system-verification.js',
      description: '完整的系统验证和质量检查',
      category: 'verification',
      dependencies: ['health', 'database'],
      estimatedTime: '2-3min'
    })

    // 数据库操作脚本
    this.availableScripts.set('backup', {
      name: '数据库备份',
      path: 'scripts/backup-database.js',
      description: '创建数据库备份',
      category: 'database',
      dependencies: ['database'],
      estimatedTime: '1-2min'
    })

    // 功能配置脚本
    this.availableScripts.set('lottery-config', {
      name: '抽奖策略配置',
      path: 'scripts/configure-lottery-strategies.js',
      description: '配置抽奖策略(基础/保底/管理)',
      category: 'configuration',
      dependencies: ['database'],
      estimatedTime: '30s'
    })

    this.availableScripts.set('feature-prizes', {
      name: '主要功能奖品更新',
      path: 'scripts/update-main-feature-prizes.js',
      description: '更新主要功能的奖品配置',
      category: 'configuration',
      dependencies: ['database'],
      estimatedTime: '1min'
    })

    // 用户管理脚本
    this.availableScripts.set('admin-setup', {
      name: '管理员用户设置',
      path: 'scripts/setup-admin-user.js',
      description: '创建或更新管理员用户',
      category: 'user-management',
      dependencies: ['database'],
      estimatedTime: '30s'
    })

    // API检查脚本
    this.availableScripts.set('api-check', {
      name: '快速API检查',
      path: 'scripts/quick-api-check.js',
      description: '检查所有API端点状态',
      category: 'verification',
      dependencies: ['health'],
      estimatedTime: '1min'
    })

    this.log(`已加载${this.availableScripts.size}个可用脚本`)
  }

  /**
   * 获取所有可用脚本信息
   */
  listAvailableScripts () {
    const scripts = Array.from(this.availableScripts.entries()).map(([key, script]) => ({
      key,
      ...script
    }))

    return scripts
  }

  /**
   * 按类别获取脚本
   */
  getScriptsByCategory (category) {
    return Array.from(this.availableScripts.entries())
      .filter(([, script]) => script.category === category)
      .map(([key, script]) => ({ key, ...script }))
  }

  /**
   * 执行单个脚本
   */
  async executeScript (scriptKey, options = {}) {
    const script = this.availableScripts.get(scriptKey)
    if (!script) {
      throw new Error(`未找到脚本: ${scriptKey}`)
    }

    const startTime = Date.now()
    this.log(`开始执行脚本: ${script.name}`)

    try {
      // 检查依赖
      await this.checkDependencies(script.dependencies)

      // 执行脚本
      const result = await this.runScript(script.path, options)

      const duration = Date.now() - startTime
      const execution = {
        scriptKey,
        scriptName: script.name,
        startTime: new Date(startTime).toISOString(),
        duration,
        success: true,
        result: result.stdout,
        timestamp: moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
      }

      this.executionHistory.push(execution)
      this.log(`脚本执行成功: ${script.name} (耗时: ${duration}ms)`)

      return execution
    } catch (error) {
      const duration = Date.now() - startTime
      const execution = {
        scriptKey,
        scriptName: script.name,
        startTime: new Date(startTime).toISOString(),
        duration,
        success: false,
        error: error.message,
        timestamp: moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
      }

      this.executionHistory.push(execution)
      this.log(`脚本执行失败: ${script.name} - ${error.message}`)

      throw error
    }
  }

  /**
   * 批量执行脚本
   */
  async executeBatch (scriptKeys, options = {}) {
    const results = []

    for (const scriptKey of scriptKeys) {
      try {
        const result = await this.executeScript(scriptKey, options)
        results.push(result)
      } catch (error) {
        if (options.continueOnError) {
          results.push({
            scriptKey,
            success: false,
            error: error.message
          })
        } else {
          throw error
        }
      }
    }

    return results
  }

  /**
   * 执行完整系统检查套件
   */
  async runSystemCheckSuite () {
    this.log('开始执行完整系统检查套件...')

    const checkSuite = [
      'health', // 1. 健康检查
      'database', // 2. 数据库检查
      'api-check', // 3. API检查
      'system-verification' // 4. 系统完整性验证
    ]

    return await this.executeBatch(checkSuite, { continueOnError: true })
  }

  /**
   * 执行数据库管理套件
   */
  async runDatabaseManagementSuite () {
    this.log('开始执行数据库管理套件...')

    const dbSuite = [
      'database', // 1. 数据库检查
      'backup', // 2. 数据库备份
      'admin-setup' // 3. 管理员设置
    ]

    return await this.executeBatch(dbSuite, { continueOnError: true })
  }

  /**
   * 执行配置管理套件
   */
  async runConfigurationSuite () {
    this.log('开始执行配置管理套件...')

    const configSuite = [
      'lottery-config', // 1. 抽奖策略配置
      'feature-prizes' // 2. 功能奖品配置
    ]

    return await this.executeBatch(configSuite, { continueOnError: true })
  }

  /**
   * 检查脚本依赖
   */
  async checkDependencies (dependencies) {
    for (const dep of dependencies) {
      const depScript = this.availableScripts.get(dep)
      if (!depScript) {
        throw new Error(`依赖脚本不存在: ${dep}`)
      }

      // 简单检查：验证依赖的脚本是否最近执行成功
      const recentExecution = this.executionHistory
        .filter(exec => exec.scriptKey === dep && exec.success)
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))[0]

      if (!recentExecution) {
        this.log(`警告: 依赖脚本 ${dep} 尚未成功执行`)
      }
    }
  }

  /**
   * 运行脚本文件
   */
  async runScript (scriptPath, options = {}) {
    const fullPath = path.join(process.cwd(), scriptPath)
    const cmd = `node ${fullPath}`

    this.log(`执行命令: ${cmd}`)

    try {
      const result = await execAsync(cmd, {
        timeout: options.timeout || 300000, // 默认5分钟超时
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      })

      return result
    } catch (error) {
      // 如果是超时错误，提供更友好的错误信息
      if (error.killed && error.signal === 'SIGTERM') {
        throw new Error(`脚本执行超时: ${scriptPath}`)
      }

      throw error
    }
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory (limit = 10) {
    return this.executionHistory
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
      .slice(0, limit)
  }

  /**
   * 获取脚本执行统计
   */
  getExecutionStats () {
    const total = this.executionHistory.length
    const successful = this.executionHistory.filter(exec => exec.success).length
    const failed = total - successful

    const avgDuration =
      this.executionHistory.length > 0
        ? this.executionHistory.reduce((sum, exec) => sum + exec.duration, 0) / total
        : 0

    return {
      totalExecutions: total,
      successfulExecutions: successful,
      failedExecutions: failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) + '%' : '0%',
      averageDuration: Math.round(avgDuration) + 'ms'
    }
  }

  /**
   * 生成系统状态报告
   */
  async generateSystemReport () {
    const report = {
      timestamp: moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss'),
      manager: {
        name: this.name,
        version: this.version
      },
      availableScripts: this.availableScripts.size,
      executionStats: this.getExecutionStats(),
      recentExecutions: this.getExecutionHistory(5),
      scriptCategories: {
        monitoring: this.getScriptsByCategory('monitoring').length,
        database: this.getScriptsByCategory('database').length,
        verification: this.getScriptsByCategory('verification').length,
        configuration: this.getScriptsByCategory('configuration').length,
        'user-management': this.getScriptsByCategory('user-management').length
      }
    }

    return report
  }

  /**
   * 日志输出
   */
  log (message) {
    const timestamp = moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
    console.log(`[${timestamp}] [${this.name}] ${message}`)
  }
}

// 如果直接运行此文件，提供命令行界面
if (require.main === module) {
  const manager = new UnifiedScriptManager()

  const command = process.argv[2]
  const scriptKey = process.argv[3]

  async function main () {
    try {
      switch (command) {
      case 'list':
        console.log('\n📋 可用脚本列表:')
        manager.listAvailableScripts().forEach(script => {
          console.log(`  ${script.key}: ${script.name} (${script.estimatedTime})`)
          console.log(`    ${script.description}`)
          console.log()
        })
        break

      case 'run':
        if (!scriptKey) {
          console.error('请指定要运行的脚本key')
          process.exit(1)
        }
        await manager.executeScript(scriptKey)
        break

      case 'suite':
        const suiteType = scriptKey
        if (suiteType === 'check') {
          await manager.runSystemCheckSuite()
        } else if (suiteType === 'database') {
          await manager.runDatabaseManagementSuite()
        } else if (suiteType === 'config') {
          await manager.runConfigurationSuite()
        } else {
          console.error('未知的套件类型。可用: check, database, config')
        }
        break

      case 'report':
        const report = await manager.generateSystemReport()
        console.log('\n📊 系统状态报告:')
        console.log(JSON.stringify(report, null, 2))
        break

      case 'history':
        console.log('\n📜 最近执行历史:')
        manager.getExecutionHistory().forEach(exec => {
          const status = exec.success ? '✅' : '❌'
          console.log(`  ${status} ${exec.scriptName} - ${exec.timestamp} (${exec.duration}ms)`)
        })
        break

      default:
        console.log(`
📋 统一脚本管理器 v${manager.version}

用法:
  node scripts/managers/UnifiedScriptManager.js <command> [options]

命令:
  list                    列出所有可用脚本
  run <script-key>        运行指定脚本
  suite <suite-type>      运行脚本套件 (check|database|config)
  report                  生成系统状态报告  
  history                 查看执行历史

示例:
  node scripts/managers/UnifiedScriptManager.js list
  node scripts/managers/UnifiedScriptManager.js run health
  node scripts/managers/UnifiedScriptManager.js suite check
          `)
      }
    } catch (error) {
      console.error('执行失败:', error.message)
      process.exit(1)
    }
  }

  main()
}

module.exports = UnifiedScriptManager
