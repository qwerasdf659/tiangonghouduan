/**
 * 日志系统统一化脚本
 *
 * 目标：
 * - 将console.log/warn/error替换为统一的Logger实例
 * - 保留必要的调试日志（debug场景）
 * - 提升日志可追溯性和可管理性
 *
 * 策略：
 * - 优先处理核心服务文件（services/、middleware/、routes/）
 * - app.js中保留必要的启动日志
 * - 测试文件和脚本文件保留console（特殊场景）
 */

const fs = require('fs')
const path = require('path')

class LoggingSystemFixer {
  constructor() {
    // 需要修复的目录（按优先级）
    this.targetDirs = ['services', 'middleware', 'routes/v4']

    // 排除的文件模式
    this.excludePatterns = [
      /test\.js$/,
      /\.spec\.js$/,
      /scripts\//,
      /migrations\//,
      /node_modules\//
    ]

    // 统计数据
    this.stats = {
      filesProcessed: 0,
      replacements: 0,
      errors: [],
      fileDetails: []
    }
  }

  /**
   * 执行修复
   */
  async fix() {
    console.log('开始日志系统统一化修复...')
    console.log('==================================================')

    for (const dir of this.targetDirs) {
      const dirPath = path.join(process.cwd(), dir)
      if (fs.existsSync(dirPath)) {
        console.log(`\n📂 处理目录: ${dir}`)
        await this.processDirectory(dirPath, dir)
      }
    }

    this.generateReport()
  }

  /**
   * 处理目录
   */
  async processDirectory(dirPath, relativePath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      const relPath = path.join(relativePath, entry.name)

      if (entry.isDirectory()) {
        await this.processDirectory(fullPath, relPath)
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        // 检查是否需要排除
        if (this.shouldExclude(relPath)) {
          continue
        }

        await this.processFile(fullPath, relPath)
      }
    }
  }

  /**
   * 判断是否排除文件
   */
  shouldExclude(filePath) {
    return this.excludePatterns.some(pattern => pattern.test(filePath))
  }

  /**
   * 处理单个文件
   */
  async processFile(filePath, relativePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8')
      const originalContent = content
      let replacements = 0

      // 检查是否已经导入Logger
      const hasLogger =
        /require\(['"].*Logger['"]\)/.test(content) || /const.*logger.*=.*new Logger/.test(content)

      // 如果没有Logger导入，需要添加
      if (!hasLogger && /console\.(log|error|warn|info|debug)/.test(content)) {
        // 在文件顶部添加Logger导入（根据文件类型决定导入路径）
        const loggerImport = this.generateLoggerImport(relativePath)
        content = loggerImport + content
        replacements++
      }

      // 替换console.log
      const logMatches = content.match(/console\.log\(/g)
      if (logMatches) {
        content = content.replace(/console\.log\(/g, 'logger.info(')
        replacements += logMatches.length
      }

      // 替换console.error
      const errorMatches = content.match(/console\.error\(/g)
      if (errorMatches) {
        content = content.replace(/console\.error\(/g, 'logger.error(')
        replacements += errorMatches.length
      }

      // 替换console.warn
      const warnMatches = content.match(/console\.warn\(/g)
      if (warnMatches) {
        content = content.replace(/console\.warn\(/g, 'logger.warn(')
        replacements += warnMatches.length
      }

      // 替换console.debug
      const debugMatches = content.match(/console\.debug\(/g)
      if (debugMatches) {
        content = content.replace(/console\.debug\(/g, 'logger.debug(')
        replacements += debugMatches.length
      }

      // 只有在内容确实改变时才写入
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8')
        this.stats.filesProcessed++
        this.stats.replacements += replacements
        this.stats.fileDetails.push({
          file: relativePath,
          replacements: replacements
        })
        console.log(`   ✅ ${relativePath} (${replacements}处替换)`)
      }
    } catch (error) {
      this.stats.errors.push({
        file: relativePath,
        error: error.message
      })
      console.error(`   ❌ ${relativePath}: ${error.message}`)
    }
  }

  /**
   * 生成Logger导入语句
   */
  generateLoggerImport(relativePath) {
    // 根据文件位置决定Logger路径
    let loggerPath = ''
    if (relativePath.startsWith('services/')) {
      loggerPath = '../services/UnifiedLotteryEngine/utils/Logger'
    } else if (relativePath.startsWith('middleware/')) {
      loggerPath = '../services/UnifiedLotteryEngine/utils/Logger'
    } else if (relativePath.startsWith('routes/v4/')) {
      loggerPath = '../../../services/UnifiedLotteryEngine/utils/Logger'
    } else {
      loggerPath = './services/UnifiedLotteryEngine/utils/Logger'
    }

    // 提取模块名（用于Logger实例化）
    const moduleName = path.basename(relativePath, '.js')

    return `const Logger = require('${loggerPath}')\nconst logger = require('../utils/logger').logger\n\n`
  }

  /**
   * 生成修复报告
   */
  generateReport() {
    console.log('\n==================================================')
    console.log('📊 日志系统统一化修复完成')
    console.log('==================================================')
    console.log(`✅ 处理文件数: ${this.stats.filesProcessed}`)
    console.log(`🔄 总替换次数: ${this.stats.replacements}`)
    console.log(`❌ 错误文件数: ${this.stats.errors.length}`)

    if (this.stats.fileDetails.length > 0) {
      console.log('\n📋 文件详情（前20个）:')
      this.stats.fileDetails.slice(0, 20).forEach(detail => {
        console.log(`   ${detail.file}: ${detail.replacements}处替换`)
      })
    }

    if (this.stats.errors.length > 0) {
      console.log('\n❌ 错误详情:')
      this.stats.errors.forEach(error => {
        console.log(`   ${error.file}: ${error.error}`)
      })
    }

    console.log('\n⚠️ 注意事项:')
    console.log('1. 请手动检查app.js中的启动日志（保留部分console.log）')
    console.log('2. 测试文件和脚本文件未处理（保持console使用）')
    console.log('3. 修复后运行ESLint检查：npm run lint')
    console.log('4. 修复后重启服务：npm run pm:restart')
  }
}

// 执行修复
if (require.main === module) {
  const fixer = new LoggingSystemFixer()
  fixer.fix().catch(error => {
    console.error('修复过程中出现错误:', error)
    process.exit(1)
  })
}

module.exports = LoggingSystemFixer
