/**
 * JS模块功能分析器
 * 系统性分析项目中所有JS文件的功能、依赖关系和重复性
 *
 * @description 帮助识别重复功能模块，制定合并和清理策略
 * @date 2025-01-21
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const fs = require('fs').promises
const path = require('path')

class JSModuleAnalyzer {
  constructor() {
    this.projectRoot = process.cwd()
    this.modules = new Map()
    this.duplicates = new Map()
    this.functionalGroups = new Map()
    this.skipDirectories = new Set([
      'node_modules',
      '.git',
      'coverage',
      'logs',
      'reports',
      'backups',
      'backup',
      '.vscode',
      '.cursor',
      '.husky'
    ])

    // 🆕 扩展：Mock数据检测配置
    this.mockDataPatterns = [
      /mock.*data/gi,
      /fake.*data/gi,
      /dummy.*data/gi,
      /test.*data/gi,
      /simulation.*data/gi,
      /jest\.fn\(\)/g,
      /mockReturnValue/g,
      /mockResolvedValue/g
    ]
  }

  /**
   * 分析所有JS文件
   */
  async analyzeAllModules() {
    console.log('🔍 开始分析项目JS模块...')
    console.log('='.repeat(50))

    await this.scanDirectory(this.projectRoot)
    this.categorizeModules()
    this.detectDuplicates()
    this.generateReport()
  }

  /**
   * 递归扫描目录
   */
  async scanDirectory(dirPath, relativePath = '') {
    try {
      const items = fs.readdirSync(dirPath)

      for (const item of items) {
        const fullPath = path.join(dirPath, item)
        const relativeItemPath = path.join(relativePath, item)

        if (this.skipDirectories.has(item)) {
          continue
        }

        const stat = fs.statSync(fullPath)

        if (stat.isDirectory()) {
          await this.scanDirectory(fullPath, relativeItemPath)
        } else if (this.isJSFile(item)) {
          await this.analyzeFile(fullPath, relativeItemPath)
        }
      }
    } catch (error) {
      console.warn(`⚠️ 扫描目录失败: ${dirPath} - ${error.message}`)
    }
  }

  /**
   * 判断是否为JS文件
   */
  isJSFile(filename) {
    return filename.endsWith('.js') && !filename.endsWith('.test.js')
  }

  /**
   * 分析单个文件
   */
  async analyzeFile(fullPath, relativePath) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      const analysis = this.analyzeFileContent(content, relativePath)

      this.modules.set(relativePath, {
        fullPath,
        relativePath,
        content,
        size: fs.statSync(fullPath).size,
        lines: content.split('\n').length,
        ...analysis
      })
    } catch (error) {
      console.warn(`⚠️ 分析文件失败: ${relativePath} - ${error.message}`)
    }
  }

  /**
   * 分析文件内容
   */
  analyzeFileContent(content, relativePath) {
    const analysis = {
      exports: this.extractExports(content),
      imports: this.extractImports(content),
      functions: this.extractFunctions(content),
      classes: this.extractClasses(content),
      purpose: this.inferPurpose(content, relativePath),
      category: this.categorizeByPath(relativePath),
      complexity: this.calculateComplexity(content),
      dependencies: this.extractDependencies(content)
    }

    return analysis
  }

  /**
   * 提取导出项
   */
  extractExports(content) {
    const exports = []

    // module.exports
    const moduleExports = content.match(/module\.exports\s*=\s*([^;]+)/g)
    if (moduleExports) {
      exports.push(...moduleExports.map(e => e.replace('module.exports = ', '').trim()))
    }

    // exports.xxx
    const namedExports = content.match(/exports\.(\w+)/g)
    if (namedExports) {
      exports.push(...namedExports.map(e => e.replace('exports.', '')))
    }

    return exports
  }

  /**
   * 提取导入项
   */
  extractImports(content) {
    const imports = []

    // require()
    const requires = content.match(/require\(['"`]([^'"`]+)['"`]\)/g)
    if (requires) {
      imports.push(...requires.map(r => r.match(/['"`]([^'"`]+)['"`]/)[1]))
    }

    return imports.filter(imp => !imp.startsWith('.'))
  }

  /**
   * 提取函数
   */
  extractFunctions(content) {
    const functions = []

    // function declarations
    const funcDeclarations = content.match(/function\s+(\w+)/g)
    if (funcDeclarations) {
      functions.push(...funcDeclarations.map(f => f.replace('function ', '')))
    }

    // arrow functions
    const arrowFunctions = content.match(/const\s+(\w+)\s*=\s*\(/g)
    if (arrowFunctions) {
      functions.push(...arrowFunctions.map(f => f.match(/const\s+(\w+)/)[1]))
    }

    return functions
  }

  /**
   * 提取类
   */
  extractClasses(content) {
    const classes = []
    const classMatches = content.match(/class\s+(\w+)/g)
    if (classMatches) {
      classes.push(...classMatches.map(c => c.replace('class ', '')))
    }
    return classes
  }

  /**
   * 推断用途
   */
  inferPurpose(content, relativePath) {
    const purposes = []

    // 基于路径推断
    if (relativePath.includes('test')) purposes.push('测试')
    if (relativePath.includes('util')) purposes.push('工具')
    if (relativePath.includes('service')) purposes.push('服务')
    if (relativePath.includes('model')) purposes.push('数据模型')
    if (relativePath.includes('route')) purposes.push('路由')
    if (relativePath.includes('middleware')) purposes.push('中间件')
    if (relativePath.includes('config')) purposes.push('配置')

    // 基于内容推断
    if (content.includes('sequelize') || content.includes('DataTypes')) purposes.push('数据库模型')
    if (content.includes('router') || content.includes('app.get')) purposes.push('路由处理')
    if (content.includes('middleware')) purposes.push('中间件')
    if (content.includes('exports')) purposes.push('模块导出')
    if (content.includes('Redis') || content.includes('redis')) purposes.push('缓存')
    if (content.includes('JWT') || content.includes('token')) purposes.push('认证')
    if (content.includes('test') || content.includes('describe')) purposes.push('测试')

    return purposes.length > 0 ? purposes : ['通用']
  }

  /**
   * 按路径分类
   */
  categorizeByPath(relativePath) {
    const pathParts = relativePath.split(path.sep)
    const firstDir = pathParts[0]

    const categories = {
      models: '数据模型层',
      services: '业务服务层',
      routes: '路由层',
      middleware: '中间件层',
      utils: '工具层',
      config: '配置层',
      tests: '测试层',
      scripts: '脚本层',
      repositories: '数据访问层',
      modules: '功能模块层'
    }

    return categories[firstDir] || '其他'
  }

  /**
   * 计算复杂度
   */
  calculateComplexity(content) {
    const lines = content.split('\n').length
    const functions = (content.match(/function/g) || []).length
    const classes = (content.match(/class /g) || []).length
    const conditions = (content.match(/if|switch|for|while/g) || []).length

    return {
      lines,
      functions,
      classes,
      conditions,
      score: Math.round((functions * 2 + classes * 3 + conditions * 1.5) / Math.max(lines / 10, 1))
    }
  }

  /**
   * 提取依赖
   */
  extractDependencies(content) {
    const deps = new Set()

    // 外部模块依赖
    const requires = content.match(/require\(['"`]([^'"`]+)['"`]\)/g)
    if (requires) {
      requires.forEach(r => {
        const dep = r.match(/['"`]([^'"`]+)['"`]/)[1]
        if (!dep.startsWith('.')) {
          deps.add(dep)
        }
      })
    }

    return Array.from(deps)
  }

  /**
   * 分类模块
   */
  categorizeModules() {
    for (const [_path, module] of this.modules) {
      const category = module.category

      if (!this.functionalGroups.has(category)) {
        this.functionalGroups.set(category, [])
      }

      this.functionalGroups.get(category).push(module)
    }
  }

  /**
   * 检测重复功能
   */
  detectDuplicates() {
    console.log('\n🔍 检测重复和相似功能...')

    // 按功能用途分组检测
    const purposeGroups = new Map()

    for (const [_path, module] of this.modules) {
      module.purpose.forEach(purpose => {
        if (!purposeGroups.has(purpose)) {
          purposeGroups.set(purpose, [])
        }
        purposeGroups.get(purpose).push(module)
      })
    }

    // 检测每个用途组内的重复
    for (const [purpose, modules] of purposeGroups) {
      if (modules.length > 1) {
        const duplicateGroup = this.findSimilarModules(modules)
        if (duplicateGroup.length > 1) {
          this.duplicates.set(purpose, duplicateGroup)
        }
      }
    }
  }

  /**
   * 查找相似模块
   */
  findSimilarModules(modules) {
    const similar = []

    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const similarity = this.calculateSimilarity(modules[i], modules[j])
        if (similarity > 0.3) {
          // 30%相似度阈值
          similar.push({
            modules: [modules[i], modules[j]],
            similarity,
            reason: this.getSimilarityReason(modules[i], modules[j])
          })
        }
      }
    }

    return similar
  }

  /**
   * 计算相似度
   */
  calculateSimilarity(module1, module2) {
    let score = 0

    // 用途相似度
    const commonPurposes = module1.purpose.filter(p => module2.purpose.includes(p))
    score +=
      (commonPurposes.length / Math.max(module1.purpose.length, module2.purpose.length)) * 0.4

    // 导出相似度
    const commonExports = module1.exports.filter(e => module2.exports.includes(e))
    score += (commonExports.length / Math.max(module1.exports.length, module2.exports.length)) * 0.3

    // 函数名相似度
    const commonFunctions = module1.functions.filter(f => module2.functions.includes(f))
    score +=
      (commonFunctions.length / Math.max(module1.functions.length, module2.functions.length)) * 0.3

    return score
  }

  /**
   * 获取相似原因
   */
  getSimilarityReason(module1, module2) {
    const reasons = []

    const commonPurposes = module1.purpose.filter(p => module2.purpose.includes(p))
    if (commonPurposes.length > 0) {
      reasons.push(`共同用途: ${commonPurposes.join(', ')}`)
    }

    const commonExports = module1.exports.filter(e => module2.exports.includes(e))
    if (commonExports.length > 0) {
      reasons.push(`相同导出: ${commonExports.join(', ')}`)
    }

    const commonFunctions = module1.functions.filter(f => module2.functions.includes(f))
    if (commonFunctions.length > 0) {
      reasons.push(`相同函数: ${commonFunctions.join(', ')}`)
    }

    return reasons.join('; ')
  }

  /**
   * 生成分析报告
   */
  generateReport() {
    console.log('\n📊 JS模块分析报告')
    console.log('='.repeat(50))

    // 总体统计
    console.log(`📁 总计JS文件: ${this.modules.size}个`)
    console.log(`📂 功能分类: ${this.functionalGroups.size}个`)
    console.log(`🔄 重复功能组: ${this.duplicates.size}个`)

    // 按分类统计
    console.log('\n📊 按分类统计:')
    for (const [category, modules] of this.functionalGroups) {
      console.log(`  ${category}: ${modules.length}个文件`)

      // 列出每个文件的基本信息
      modules.forEach(module => {
        const sizeKB = (module.size / 1024).toFixed(1)
        const complexity = module.complexity.score
        console.log(
          `    - ${module.relativePath} (${sizeKB}KB, ${module.lines}行, 复杂度:${complexity})`
        )
        console.log(`      用途: ${module.purpose.join(', ')}`)
        if (module.exports.length > 0) {
          console.log(
            `      导出: ${module.exports.slice(0, 3).join(', ')}${module.exports.length > 3 ? '...' : ''}`
          )
        }
      })
    }

    // 重复功能分析
    if (this.duplicates.size > 0) {
      console.log('\n🔄 检测到的重复功能:')
      for (const [purpose, duplicateGroups] of this.duplicates) {
        console.log(`\n📝 ${purpose} 功能重复:`)
        duplicateGroups.forEach((group, index) => {
          console.log(`  重复组 ${index + 1} (相似度: ${(group.similarity * 100).toFixed(1)}%):`)
          group.modules.forEach(module => {
            console.log(`    - ${module.relativePath} (${(module.size / 1024).toFixed(1)}KB)`)
          })
          console.log(`    原因: ${group.reason}`)
        })
      }
    } else {
      console.log('\n✅ 未检测到明显的重复功能')
    }

    // 生成合并建议
    this.generateMergeRecommendations()
  }

  /**
   * 生成合并建议
   */
  generateMergeRecommendations() {
    if (this.duplicates.size === 0) {
      console.log('\n✅ 无需合并，代码结构良好')
      return
    }

    console.log('\n💡 合并建议:')
    console.log('='.repeat(30))

    for (const [purpose, duplicateGroups] of this.duplicates) {
      console.log(`\n🎯 ${purpose} 功能合并建议:`)

      duplicateGroups.forEach((group, index) => {
        console.log(`\n  建议 ${index + 1}: 合并相似文件`)
        console.log(`  相似度: ${(group.similarity * 100).toFixed(1)}%`)
        console.log('  文件列表:')

        // 排序：优先保留更大、更复杂的文件
        const sortedModules = group.modules.sort((a, b) => {
          return b.complexity.score + b.size / 1024 - (a.complexity.score + a.size / 1024)
        })

        const keepFile = sortedModules[0]
        const mergeFiles = sortedModules.slice(1)

        console.log(`    🎯 保留: ${keepFile.relativePath} (主文件)`)
        mergeFiles.forEach(file => {
          console.log(`    📥 合并: ${file.relativePath} → ${keepFile.relativePath}`)
        })

        console.log('    🔧 操作步骤:')
        console.log('      1. 将合并文件的功能迁移到主文件')
        console.log('      2. 更新其他文件的引用路径')
        console.log('      3. 删除合并后的冗余文件')
        console.log('      4. 运行测试验证功能完整性')
      })
    }
  }

  /**
   * 🆕 扩展功能：检测Mock数据使用
   * 从V4ProjectQualityManager.js合并的功能
   */
  async detectMockDataUsage() {
    console.log('🔍 检测项目中的Mock数据使用...')

    const mockFiles = []
    for (const [filePath, moduleInfo] of this.modules) {
      const hasMockData = this.mockDataPatterns.some(pattern => pattern.test(moduleInfo.content))

      if (hasMockData) {
        const mockMatches = this.mockDataPatterns
          .map(pattern => (moduleInfo.content.match(pattern) || []).length)
          .reduce((a, b) => a + b, 0)

        mockFiles.push({
          path: filePath,
          mockCount: mockMatches,
          type: moduleInfo.type,
          priority: this.getMockCleanupPriority(filePath)
        })
      }
    }

    console.log(`📊 发现${mockFiles.length}个包含Mock数据的文件`)
    return mockFiles.sort((a, b) => b.priority - a.priority)
  }

  /**
   * 🆕 扩展功能：获取Mock数据清理优先级
   */
  getMockCleanupPriority(filePath) {
    if (filePath.includes('/tests/')) return 10 // 测试文件最高优先级
    if (filePath.includes('/services/')) return 8 // 服务层高优先级
    if (filePath.includes('/models/')) return 7 // 模型层
    if (filePath.includes('/routes/')) return 6 // API层
    return 5 // 其他文件
  }

  /**
   * 🆕 扩展功能：生成完整的代码质量分析报告
   */
  async generateCompleteQualityReport() {
    console.log('📈 生成完整的代码质量分析报告...')

    try {
      // 1. 执行原有分析
      await this.analyzeAllModules()

      // 2. 检测Mock数据
      const mockFiles = await this.detectMockDataUsage()

      // 3. 生成综合报告
      const report = {
        timestamp: BeijingTimeHelper.now(),
        summary: {
          total_modules: this.modules.size,
          duplicate_groups: this.duplicates.size,
          mock_data_files: mockFiles.length
        },
        recommendations: {
          duplicate_cleanup: Array.from(this.duplicates.values()).length,
          mock_data_cleanup: mockFiles.filter(f => f.priority >= 8).length
        },
        details: {
          mock_files: mockFiles.slice(0, 10) // 显示前10个
        }
      }

      console.log('\n📈 代码质量分析报告')
      console.log('='.repeat(50))
      console.log(`模块总数: ${report.summary.total_modules}`)
      console.log(`重复模块组: ${report.summary.duplicate_groups}`)
      console.log(`Mock数据文件: ${report.summary.mock_data_files}`)

      return report
    } catch (error) {
      console.error('❌ 质量报告生成失败:', error.message)
      throw error
    }
  }
}

// 执行分析
if (require.main === module) {
  const analyzer = new JSModuleAnalyzer()
  analyzer
    .analyzeAllModules()
    .then(() => {
      console.log('\n🎉 JS模块分析完成！')
      console.log('💡 请根据分析报告进行模块整理和优化')
    })
    .catch(error => {
      console.error('❌ 分析失败:', error)
      process.exit(1)
    })
}

module.exports = JSModuleAnalyzer
