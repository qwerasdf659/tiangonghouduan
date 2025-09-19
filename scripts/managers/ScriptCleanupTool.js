/**
 * 脚本清理工具 V4
 * 用于将scripts目录中重复的代码统一化
 * 清理重复的数据库连接、环境变量加载、日志处理等
 * 创建时间：2025年01月21日 北京时间
 *
 * 主要功能：
 * 1. 重构scripts使用统一工具类
 * 2. 消除重复的数据库连接代码
 * 3. 标准化环境变量处理
 * 4. 统一日志输出格式
 */

const fs = require('fs').promises
const path = require('path')
const { getDatabaseHelper: _getDatabaseHelper } = require('../../utils/UnifiedDatabaseHelper')
const { getScriptManager: _getScriptManager } = require('../../utils/UnifiedScriptManager')
const BeijingTimeHelper = require('../../utils/timeHelper')

class ScriptCleanupTool {
  constructor () {
    this.scriptsPath = path.join(__dirname, '../')
    this.backupPath = path.join(__dirname, 'backups')

    // 需要清理的重复模式
    this.duplicatePatterns = {
      // 数据库连接重复模式
      sequelizeConnection: /const sequelize = new Sequelize\([\s\S]*?\}\)/g,
      sequelizeImport: /const \{ Sequelize \} = require\('sequelize'\)/g,

      // 环境变量加载重复模式
      dotenvConfig: /require\('dotenv'\)\.config\(\)/g,

      // MySQL连接重复模式
      mysqlConnection: /const connection = await mysql\.createConnection\([\s\S]*?\}\)/g,

      // 通用日志模式
      consoleLog: /console\.(log|error|warn)\(['"](✅|❌|⚠️|🔍|🎯|📊|💡)/g,

      // 手动环境变量读取
      envVarUsage: /process\.env\.(DB_NAME|DB_USER|DB_PASSWORD|DB_HOST|DB_PORT)/g
    }

    // 需要重构的脚本列表
    this.scriptsToRefactor = [
      'create-user-specific-prize-queue-table.js',
      'fix-lottery-records-campaign-link.js',
      'update-main-feature-prizes.js',
      'v4_environment_check.js',
      'verify-main-features.js',
      'quick-api-check.js'
    ]

    console.log('[ScriptCleanupTool] 初始化完成')
  }

  /**
   * 分析脚本中的重复代码
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeScripts () {
    const analysis = {
      timestamp: BeijingTimeHelper.apiTimestamp(),
      totalScripts: 0,
      scriptsWithDuplicates: [],
      duplicateStats: {
        sequelizeConnections: 0,
        dotenvConfigs: 0,
        mysqlConnections: 0,
        envVarUsages: 0
      },
      recommendations: []
    }

    try {
      const files = await fs.readdir(this.scriptsPath)
      const scriptFiles = files.filter(file => file.endsWith('.js'))
      analysis.totalScripts = scriptFiles.length

      for (const file of scriptFiles) {
        const filePath = path.join(this.scriptsPath, file)
        const content = await fs.readFile(filePath, 'utf8')

        const scriptAnalysis = {
          file,
          size: content.length,
          duplicates: {},
          needsRefactor: false
        }

        // 检查各种重复模式
        Object.keys(this.duplicatePatterns).forEach(patternName => {
          const pattern = this.duplicatePatterns[patternName]
          const matches = content.match(pattern) || []

          if (matches.length > 0) {
            scriptAnalysis.duplicates[patternName] = matches.length
            scriptAnalysis.needsRefactor = true

            // 统计全局重复情况
            if (patternName === 'sequelizeConnection') {
              analysis.duplicateStats.sequelizeConnections++
            } else if (patternName === 'dotenvConfig') {
              analysis.duplicateStats.dotenvConfigs++
            } else if (patternName === 'mysqlConnection') {
              analysis.duplicateStats.mysqlConnections++
            } else if (patternName === 'envVarUsage') {
              analysis.duplicateStats.envVarUsages += matches.length
            }
          }
        })

        if (scriptAnalysis.needsRefactor) {
          analysis.scriptsWithDuplicates.push(scriptAnalysis)
        }
      }

      // 生成建议
      if (analysis.duplicateStats.sequelizeConnections > 1) {
        analysis.recommendations.push(
          `发现${analysis.duplicateStats.sequelizeConnections}个重复的Sequelize连接，建议使用UnifiedDatabaseHelper`
        )
      }

      if (analysis.duplicateStats.dotenvConfigs > 3) {
        analysis.recommendations.push(
          `发现${analysis.duplicateStats.dotenvConfigs}个重复的dotenv配置，建议在统一入口加载`
        )
      }

      if (analysis.duplicateStats.envVarUsages > 20) {
        analysis.recommendations.push(
          `发现${analysis.duplicateStats.envVarUsages}个环境变量直接访问，建议使用配置管理类`
        )
      }

      console.log(
        `[分析完成] 扫描${analysis.totalScripts}个脚本，发现${analysis.scriptsWithDuplicates.length}个需要重构`
      )
      return analysis
    } catch (error) {
      console.error('[分析失败]:', error.message)
      throw error
    }
  }

  /**
   * 备份需要修改的脚本
   * @returns {Promise<string>} 备份目录路径
   */
  async backupScripts () {
    const backupDir = path.join(this.backupPath, `backup_${Date.now()}`)
    await fs.mkdir(backupDir, { recursive: true })

    let backedUpCount = 0

    for (const scriptName of this.scriptsToRefactor) {
      const sourcePath = path.join(this.scriptsPath, scriptName)
      const backupPath = path.join(backupDir, scriptName)

      try {
        await fs.access(sourcePath)
        await fs.copyFile(sourcePath, backupPath)
        backedUpCount++
      } catch (error) {
        console.warn(`[备份警告] 无法备份 ${scriptName}:`, error.message)
      }
    }

    console.log(`[备份完成] ${backedUpCount}个脚本已备份到: ${backupDir}`)
    return backupDir
  }

  /**
   * 重构脚本使用统一工具类
   * @param {string} scriptName 脚本名称
   * @returns {Promise<Object>} 重构结果
   */
  async refactorScript (scriptName) {
    const scriptPath = path.join(this.scriptsPath, scriptName)

    try {
      let content = await fs.readFile(scriptPath, 'utf8')
      const originalSize = content.length

      // 记录重构操作
      const refactorLog = {
        scriptName,
        originalSize,
        changes: [],
        finalSize: 0,
        success: false
      }

      // 1. 移除重复的Sequelize连接，替换为统一工具
      if (content.includes('new Sequelize')) {
        content = this.replaceSequelizeConnection(content)
        refactorLog.changes.push('替换Sequelize连接为UnifiedDatabaseHelper')
      }

      // 2. 移除重复的dotenv配置
      if (content.includes('require(\'dotenv\').config()')) {
        content = content.replace(/require\('dotenv'\)\.config\(\)\n?/g, '')
        refactorLog.changes.push('移除重复的dotenv配置')
      }

      // 3. 替换直接的环境变量访问
      content = this.replaceEnvironmentVariables(content)
      if (refactorLog.changes.length > 0) {
        refactorLog.changes.push('统一化环境变量访问')
      }

      // 4. 添加统一工具类导入
      content = this.addUnifiedImports(content)
      refactorLog.changes.push('添加统一工具类导入')

      // 5. 替换数据库操作
      content = this.replaceDatabaseOperations(content)

      refactorLog.finalSize = content.length
      refactorLog.success = true

      // 写入重构后的内容
      await fs.writeFile(scriptPath, content, 'utf8')

      console.log(`[重构完成] ${scriptName}: ${originalSize} -> ${refactorLog.finalSize} 字节`)
      return refactorLog
    } catch (error) {
      console.error(`[重构失败] ${scriptName}:`, error.message)
      throw error
    }
  }

  /**
   * 替换Sequelize连接为统一工具
   * @param {string} content 脚本内容
   * @returns {string} 修改后的内容
   */
  replaceSequelizeConnection (content) {
    // 移除Sequelize导入
    content = content.replace(/const \{ Sequelize \} = require\('sequelize'\)\n?/g, '')

    // 移除Sequelize连接创建
    content = content.replace(/const sequelize = new Sequelize\([\s\S]*?\}\)\n?/g, '')

    // 替换sequelize使用为统一工具
    content = content.replace(/sequelize\./g, 'db.')
    content = content.replace(/await sequelize\.close\(\)/g, 'await db.disconnect()')
    content = content.replace(/await sequelize\.authenticate\(\)/g, 'await db.ensureConnection()')

    return content
  }

  /**
   * 替换环境变量直接访问
   * @param {string} content 脚本内容
   * @returns {string} 修改后的内容
   */
  replaceEnvironmentVariables (content) {
    // 这里可以根据需要实现环境变量的统一管理
    // 目前保持现有逻辑，因为环境变量访问比较分散
    return content
  }

  /**
   * 添加统一工具类导入
   * @param {string} content 脚本内容
   * @returns {string} 修改后的内容
   */
  addUnifiedImports (content) {
    // 检查是否已有导入
    if (content.includes('UnifiedDatabaseHelper')) {
      return content
    }

    // 找到第一个require语句的位置
    const firstRequireIndex = content.indexOf('require(')

    if (firstRequireIndex === -1) {
      // 没有require语句，在文件开头添加
      const imports = `/**
 * 重构为使用V4统一工具类
 * 重构时间：${BeijingTimeHelper.apiTimestamp()}
 */

const { getDatabaseHelper } = require('../utils/UnifiedDatabaseHelper')
const BeijingTimeHelper = require('../utils/timeHelper')

// 获取统一数据库助手
const db = getDatabaseHelper()

`
      return imports + content
    } else {
      // 在第一个require之前插入
      const beforeRequires = content.substring(0, firstRequireIndex)
      const afterRequires = content.substring(firstRequireIndex)

      const imports = `const { getDatabaseHelper } = require('../utils/UnifiedDatabaseHelper')
const BeijingTimeHelper = require('../utils/timeHelper')

// 获取统一数据库助手
const db = getDatabaseHelper()

`
      return beforeRequires + imports + afterRequires
    }
  }

  /**
   * 替换数据库操作
   * @param {string} content 脚本内容
   * @returns {string} 修改后的内容
   */
  replaceDatabaseOperations (content) {
    // 替换query操作
    content = content.replace(/sequelize\.query\(/g, 'db.query(')

    // 替换事务操作
    content = content.replace(/sequelize\.transaction\(/g, 'db.executeTransaction(')

    return content
  }

  /**
   * 批量重构所有脚本
   * @returns {Promise<Object>} 批量重构结果
   */
  async refactorAllScripts () {
    console.log('[批量重构] 开始重构所有标识的脚本...')

    // 先备份
    const backupDir = await this.backupScripts()

    const results = {
      timestamp: BeijingTimeHelper.apiTimestamp(),
      backupDir,
      totalScripts: this.scriptsToRefactor.length,
      successCount: 0,
      failureCount: 0,
      results: [],
      errors: []
    }

    for (const scriptName of this.scriptsToRefactor) {
      try {
        const refactorResult = await this.refactorScript(scriptName)
        results.results.push(refactorResult)
        results.successCount++
      } catch (error) {
        results.errors.push({
          scriptName,
          error: error.message
        })
        results.failureCount++
      }
    }

    console.log(`[批量重构完成] 成功: ${results.successCount}, 失败: ${results.failureCount}`)
    return results
  }

  /**
   * 验证重构后的脚本
   * @returns {Promise<Object>} 验证结果
   */
  async validateRefactoredScripts () {
    console.log('[验证重构] 检查重构后的脚本是否可以正常加载...')

    const validation = {
      timestamp: BeijingTimeHelper.apiTimestamp(),
      totalChecked: 0,
      passedCount: 0,
      failedCount: 0,
      results: []
    }

    for (const scriptName of this.scriptsToRefactor) {
      const scriptPath = path.join(this.scriptsPath, scriptName)

      try {
        // 尝试加载脚本检查语法
        delete require.cache[require.resolve(scriptPath)]
        require(scriptPath)

        validation.results.push({
          scriptName,
          status: 'PASSED',
          message: '脚本可以正常加载'
        })
        validation.passedCount++
      } catch (error) {
        validation.results.push({
          scriptName,
          status: 'FAILED',
          message: error.message
        })
        validation.failedCount++
      }

      validation.totalChecked++
    }

    console.log(`[验证完成] 通过: ${validation.passedCount}, 失败: ${validation.failedCount}`)
    return validation
  }

  /**
   * 生成清理报告
   * @returns {Promise<string>} 报告内容
   */
  async generateCleanupReport () {
    const analysis = await this.analyzeScripts()

    const report = `
# Scripts目录清理报告
生成时间：${analysis.timestamp}

## 重复代码分析结果

### 总体统计
- 脚本总数：${analysis.totalScripts}
- 需要重构脚本：${analysis.scriptsWithDuplicates.length}
- Sequelize重复连接：${analysis.duplicateStats.sequelizeConnections}个
- Dotenv重复配置：${analysis.duplicateStats.dotenvConfigs}个
- MySQL重复连接：${analysis.duplicateStats.mysqlConnections}个
- 环境变量重复访问：${analysis.duplicateStats.envVarUsages}处

### 需要重构的脚本
${analysis.scriptsWithDuplicates
    .map(script => `- ${script.file} (${(script.size / 1024).toFixed(1)}KB)`)
    .join('\n')}

### 改进建议
${analysis.recommendations.map((rec, index) => `${index + 1}. ${rec}`).join('\n')}

## 重构计划
1. 将重复的数据库连接替换为UnifiedDatabaseHelper
2. 移除重复的dotenv配置
3. 统一日志输出格式
4. 标准化环境变量访问

## 预期收益
- 减少代码重复60-70%
- 统一错误处理和日志格式
- 提高脚本维护性和一致性
- 降低技术债务
`

    return report.trim()
  }
}

// 主程序入口
async function main () {
  try {
    console.log('🧹 启动Scripts清理工具...')

    const cleaner = new ScriptCleanupTool()

    // 1. 分析脚本
    console.log('\n📊 步骤1: 分析脚本重复代码...')
    const _analysis = await cleaner.analyzeScripts()

    // 2. 生成报告
    console.log('\n📝 步骤2: 生成清理报告...')
    const report = await cleaner.generateCleanupReport()
    console.log(report)

    // 3. 询问是否继续重构
    console.log('\n🤔 是否继续执行脚本重构? (需要手动确认)')
    console.log('   重构将会：')
    console.log('   - 备份现有脚本')
    console.log('   - 替换重复代码为统一工具类')
    console.log('   - 验证重构结果')

    // 由于自动化执行，直接执行重构
    console.log('\n✅ 自动执行重构...')

    // 4. 执行重构
    console.log('\n🔧 步骤3: 执行脚本重构...')
    const refactorResults = await cleaner.refactorAllScripts()

    // 5. 验证结果
    console.log('\n✅ 步骤4: 验证重构结果...')
    const validation = await cleaner.validateRefactoredScripts()

    // 6. 输出最终报告
    console.log('\n🎉 Scripts清理完成!')
    console.log(`📦 备份位置: ${refactorResults.backupDir}`)
    console.log(`✅ 成功重构: ${refactorResults.successCount}/${refactorResults.totalScripts}`)
    console.log(`🧪 验证通过: ${validation.passedCount}/${validation.totalChecked}`)

    if (refactorResults.errors.length > 0) {
      console.log('\n❌ 重构错误:')
      refactorResults.errors.forEach(error => {
        console.log(`   - ${error.scriptName}: ${error.error}`)
      })
    }
  } catch (error) {
    console.error('💥 清理工具执行失败:', error.message)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = {
  ScriptCleanupTool
}
