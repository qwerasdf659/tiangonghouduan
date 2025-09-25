/**
 * Console日志迁移工具
 * 系统性替换项目中99个文件的console输出为统一Logger
 *
 * @version 1.0.0
 * @date 2025-09-22
 * @purpose 解决技术债务评估报告中的日志管理问题
 */

const fs = require('fs').promises
const path = require('path')
const Logger = require('../services/UnifiedLotteryEngine/utils/Logger')

class ConsoleMigrationTool {
  constructor () {
    this.migrationLogger = Logger.create('ConsoleMigration')
    this.migrationStats = {
      total_files_scanned: 0,
      files_with_console: 0,
      console_calls_replaced: 0,
      migration_errors: [],
      migration_summary: []
    }

    // 需要跳过的文件/目录
    this.skipPatterns = [
      'node_modules/',
      '.git/',
      'logs/',
      'dist/',
      'build/',
      'console-migration-tool.js', // 跳过自己
      '.eslintrc.js' // 跳过配置文件
    ]

    // console调用模式匹配
    this.consolePatterns = [
      {
        pattern: /console\.log\s*\(/g,
        replacement: 'logger.info(',
        level: 'info'
      },
      {
        pattern: /console\.error\s*\(/g,
        replacement: 'logger.error(',
        level: 'error'
      },
      {
        pattern: /console\.warn\s*\(/g,
        replacement: 'logger.warn(',
        level: 'warn'
      },
      {
        pattern: /console\.info\s*\(/g,
        replacement: 'logger.info(',
        level: 'info'
      },
      {
        pattern: /console\.debug\s*\(/g,
        replacement: 'logger.debug(',
        level: 'debug'
      }
    ]
  }

  /**
   * 主迁移流程
   */
  async executeMigration () {
    this.migrationLogger.info('🚀 开始Console日志迁移流程')

    try {
      // 1. 扫描项目文件
      const files = await this.scanProjectFiles()
      this.migrationLogger.info(`📁 扫描到${files.length}个JavaScript文件`)

      // 2. 分析Console使用情况
      const consoleFiles = await this.analyzeConsoleUsage(files)
      this.migrationLogger.info(`📊 发现${consoleFiles.length}个文件包含console调用`)

      // 3. 执行分批迁移
      await this.executeBatchMigration(consoleFiles)

      // 4. 生成迁移报告
      await this.generateMigrationReport()

      this.migrationLogger.info('✅ Console日志迁移完成')
      return this.migrationStats
    } catch (error) {
      this.migrationLogger.error('❌ Console日志迁移失败', { error: error.message })
      throw error
    }
  }

  /**
   * 扫描项目中的JavaScript文件
   */
  async scanProjectFiles () {
    const files = []

    const scanDirectory = async dir => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          const relativePath = path.relative(process.cwd(), fullPath)

          // 跳过指定模式
          if (this.shouldSkip(relativePath)) {
            continue
          }

          if (entry.isDirectory()) {
            await scanDirectory(fullPath)
          } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath)
          }
        }
      } catch (error) {
        this.migrationLogger.warn(`跳过目录扫描: ${dir}`, { error: error.message })
      }
    }

    await scanDirectory(process.cwd())
    this.migrationStats.total_files_scanned = files.length
    return files
  }

  /**
   * 判断是否应该跳过文件/目录
   */
  shouldSkip (relativePath) {
    return this.skipPatterns.some(pattern => relativePath.includes(pattern))
  }

  /**
   * 分析文件中的Console使用情况
   */
  async analyzeConsoleUsage (files) {
    const consoleFiles = []

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8')
        const hasConsole = this.consolePatterns.some(p => p.pattern.test(content))

        if (hasConsole) {
          const consoleCount = this.countConsoleOccurrences(content)
          consoleFiles.push({
            file,
            console_count: consoleCount,
            content
          })
        }
      } catch (error) {
        this.migrationLogger.warn(`文件读取失败: ${file}`, { error: error.message })
      }
    }

    this.migrationStats.files_with_console = consoleFiles.length
    return consoleFiles
  }

  /**
   * 统计文件中console调用次数
   */
  countConsoleOccurrences (content) {
    let total = 0
    this.consolePatterns.forEach(pattern => {
      const matches = content.match(pattern)
      if (matches) {
        total += matches.length
      }
    })
    return total
  }

  /**
   * 执行分批迁移
   */
  async executeBatchMigration (consoleFiles) {
    this.migrationLogger.info(`🔄 开始迁移${consoleFiles.length}个文件`)

    for (const fileInfo of consoleFiles) {
      try {
        await this.migrateFile(fileInfo)
        this.migrationLogger.debug(`✅ 迁移完成: ${path.basename(fileInfo.file)}`)
      } catch (error) {
        this.migrationStats.migration_errors.push({
          file: fileInfo.file,
          error: error.message
        })
        this.migrationLogger.error(`❌ 迁移失败: ${fileInfo.file}`, { error: error.message })
      }
    }
  }

  /**
   * 迁移单个文件
   */
  async migrateFile (fileInfo) {
    let { content } = fileInfo
    const originalContent = content
    let replacements = 0

    // 在文件顶部添加Logger导入（如果不存在）
    if (
      !content.includes('require(\'../services/UnifiedLotteryEngine/utils/Logger\')') &&
      !content.includes('require(\'./services/UnifiedLotteryEngine/utils/Logger\')')
    ) {
      // 确定正确的相对路径
      const relativePath = this.getLoggerImportPath(fileInfo.file)
      const loggerImport = `const Logger = require('${relativePath}')\nconst logger = Logger.create('${this.getModuleName(fileInfo.file)}')\n\n`

      // 在第一个require之后插入，或在文件开头插入
      const requireMatch = content.match(/^.*require\(.*?\).*$/m)
      if (requireMatch) {
        const insertIndex = content.indexOf(requireMatch[0]) + requireMatch[0].length
        content = content.slice(0, insertIndex) + '\n' + loggerImport + content.slice(insertIndex)
      } else {
        content = loggerImport + content
      }
    }

    // 替换console调用
    this.consolePatterns.forEach(pattern => {
      const matches = content.match(pattern.pattern)
      if (matches) {
        content = content.replace(pattern.pattern, pattern.replacement)
        replacements += matches.length
      }
    })

    // 只有在内容发生变化时才写入文件
    if (content !== originalContent) {
      await fs.writeFile(fileInfo.file, content, 'utf8')
      this.migrationStats.console_calls_replaced += replacements

      this.migrationStats.migration_summary.push({
        file: path.relative(process.cwd(), fileInfo.file),
        replacements,
        status: 'success'
      })
    }
  }

  /**
   * 获取Logger导入路径
   */
  getLoggerImportPath (filePath) {
    const relativePath = path.relative(
      path.dirname(filePath),
      'services/UnifiedLotteryEngine/utils/Logger'
    )
    return relativePath.startsWith('.') ? relativePath : './' + relativePath
  }

  /**
   * 获取模块名称
   */
  getModuleName (filePath) {
    const basename = path.basename(filePath, '.js')
    return basename.charAt(0).toUpperCase() + basename.slice(1)
  }

  /**
   * 生成迁移报告
   */
  async generateMigrationReport () {
    const report = {
      migration_timestamp: new Date().toISOString(),
      migration_summary: this.migrationStats,
      recommendations: this.generateRecommendations()
    }

    const reportPath = path.join(process.cwd(), 'logs/console-migration-report.json')
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')

    this.migrationLogger.info('📊 迁移报告生成完成', {
      report_path: reportPath,
      total_replacements: this.migrationStats.console_calls_replaced,
      files_migrated: this.migrationStats.migration_summary.length,
      errors: this.migrationStats.migration_errors.length
    })

    return report
  }

  /**
   * 生成后续建议
   */
  generateRecommendations () {
    const recommendations = []

    if (this.migrationStats.migration_errors.length > 0) {
      recommendations.push('检查迁移失败的文件，手动修复console调用')
    }

    if (this.migrationStats.console_calls_replaced > 50) {
      recommendations.push('考虑配置日志级别环境变量以控制输出详细程度')
    }

    recommendations.push('更新.eslintrc.js规则，禁止新的console调用')
    recommendations.push('建立代码审查机制，确保新代码使用统一Logger')

    return recommendations
  }

  /**
   * 静态方法：快速执行迁移
   */
  static async executeMigration () {
    const tool = new ConsoleMigrationTool()
    return await tool.executeMigration()
  }
}

module.exports = ConsoleMigrationTool

// 如果直接运行此脚本
if (require.main === module) {
  ConsoleMigrationTool.executeMigration()
    .then(stats => {
      console.log('✅ 迁移完成:', stats)
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 迁移失败:', error.message)
      process.exit(1)
    })
}
