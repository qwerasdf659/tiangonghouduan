/**
 * 覆盖率分析管理工具
 * 基于真实Jest覆盖率数据，系统性地解决测试覆盖率低的问题
 * 创建时间：2025年01月21日 北京时间
 *
 * 核心原则：
 * 1. 数据驱动：基于真实覆盖率数据，不使用预设数据
 * 2. 业务优先：优先处理核心业务逻辑
 * 3. 系统性解决：覆盖整个调用链，不局部修复
 */

const fs = require('fs')
const path = require('path')

class CoverageAnalysisManager {
  constructor () {
    this.projectRoot = process.cwd()
    this.coveragePath = path.join(this.projectRoot, 'reports/real-coverage/coverage-final.json')
  }

  /**
   * 🎯 系统性分析和解决覆盖率问题
   */
  async analyzeAndFixCoverage () {
    console.log('🔍 开始系统性覆盖率分析和修复...')
    console.log('='.repeat(60))

    try {
      // 1. 获取真实覆盖率数据
      const realCoverage = await this.getRealCoverageData()
      console.log('📊 当前真实覆盖率:')
      console.log(`   语句覆盖率: ${realCoverage.statements}%`)
      console.log(`   函数覆盖率: ${realCoverage.functions}%`)
      console.log(`   分支覆盖率: ${realCoverage.branches}%`)
      console.log(`   行覆盖率: ${realCoverage.lines}%`)

      // 2. 分析0%覆盖率的关键文件
      const zeroCoverageFiles = this.analyzeZeroCoverageFiles(realCoverage.rawData)
      console.log(`\n🎯 发现 ${zeroCoverageFiles.length} 个0%覆盖率的关键文件`)

      // 3. 基于业务价值排序
      const prioritizedFiles = this.prioritizeFilesByBusinessValue(zeroCoverageFiles)

      // 4. 显示分析结果
      this.displayAnalysisResults(prioritizedFiles)

      // 5. 为关键文件创建测试框架（标注需要真实数据）
      const testCreationResults = await this.createTestFrameworks(prioritizedFiles.slice(0, 3))

      // 6. 生成改进建议
      const recommendations = this.generateRecommendations(prioritizedFiles)

      console.log('\n📋 覆盖率分析报告:')
      console.log(`   总文件数: ${Object.keys(realCoverage.rawData).length}`)
      console.log(`   0%覆盖率文件: ${zeroCoverageFiles.length}`)
      console.log(
        `   创建测试文件: ${testCreationResults.filter(r => r.success && !r.skipped).length}`
      )
      console.log(`   需要真实数据的文件: ${testCreationResults.length}`)

      return {
        success: true,
        results: {
          coverage: realCoverage,
          zeroCoverageFiles,
          testCreated: testCreationResults,
          recommendations
        }
      }
    } catch (error) {
      console.error('❌ 覆盖率分析失败:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * 🔧 获取真实的Jest覆盖率数据
   */
  async getRealCoverageData () {
    if (!fs.existsSync(this.coveragePath)) {
      console.log('📊 覆盖率文件不存在，正在生成...')
      await this.generateCoverageData()
    }

    const coverage = JSON.parse(fs.readFileSync(this.coveragePath, 'utf8'))
    return this.calculateRealCoverage(coverage)
  }

  /**
   * 🔧 生成真实覆盖率数据
   */
  async generateCoverageData () {
    const { spawn } = require('child_process')

    return new Promise((resolve, reject) => {
      const cmd = spawn(
        'npm',
        ['test', '--', '--coverage', '--coverageDirectory=reports/real-coverage', '--silent'],
        {
          stdio: 'inherit',
          cwd: process.cwd()
        }
      )

      cmd.on('close', code => {
        console.log(`📊 覆盖率生成完成 (退出码: ${code})`)
        resolve()
      })

      cmd.on('error', error => {
        console.error('❌ 覆盖率生成失败:', error)
        reject(error)
      })
    })
  }

  /**
   * 🔧 计算真实覆盖率百分比
   */
  calculateRealCoverage (coverageData) {
    let totalStatements = 0
    let coveredStatements = 0
    let totalFunctions = 0
    let coveredFunctions = 0
    let totalBranches = 0
    let coveredBranches = 0
    let totalLines = 0
    let coveredLines = 0

    // 只计算特定目录的覆盖率
    const targetDirs = ['services/', 'routes/', 'models/', 'utils/']

    for (const file in coverageData) {
      // 只统计目标目录的文件
      if (!targetDirs.some(dir => file.includes(dir))) continue

      const fileCov = coverageData[file]

      // 语句覆盖率
      if (fileCov.s) {
        const statements = Object.values(fileCov.s)
        totalStatements += statements.length
        coveredStatements += statements.filter(s => s > 0).length
      }

      // 函数覆盖率
      if (fileCov.f) {
        const functions = Object.values(fileCov.f)
        totalFunctions += functions.length
        coveredFunctions += functions.filter(f => f > 0).length
      }

      // 分支覆盖率
      if (fileCov.b) {
        const branches = Object.values(fileCov.b).flat()
        totalBranches += branches.length
        coveredBranches += branches.filter(b => b > 0).length
      }

      // 行覆盖率
      if (fileCov.l) {
        const lines = Object.values(fileCov.l)
        totalLines += lines.length
        coveredLines += lines.filter(l => l > 0).length
      }
    }

    return {
      statements: totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0,
      functions: totalFunctions > 0 ? Math.round((coveredFunctions / totalFunctions) * 100) : 0,
      branches: totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 100) : 0,
      lines: totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0,
      rawData: coverageData
    }
  }

  /**
   * 🔧 分析0%覆盖率文件
   */
  analyzeZeroCoverageFiles (coverageData) {
    const zeroCoverageFiles = []

    for (const file in coverageData) {
      const data = coverageData[file]
      const statements = data.s ? Object.values(data.s) : []
      const covered = statements.filter(s => s > 0).length
      const total = statements.length
      const ratio = total > 0 ? Math.round((covered / total) * 100) : 0

      if (ratio === 0 && total > 0) {
        const fileType = this.determineFileType(file)
        const businessValue = this.assessBusinessValue(file, fileType)

        zeroCoverageFiles.push({
          file,
          relativePath: path.relative(process.cwd(), file),
          type: fileType,
          businessValue,
          statements: total,
          functions: data.f ? Object.keys(data.f).length : 0
        })
      }
    }

    return zeroCoverageFiles
  }

  /**
   * 🔧 确定文件类型
   */
  determineFileType (filePath) {
    if (filePath.includes('/routes/')) return 'api_endpoint'
    if (filePath.includes('/models/')) return 'database_model'
    if (filePath.includes('/services/')) return 'core_business'
    if (filePath.includes('/utils/')) return 'utility'
    if (filePath.includes('/config/')) return 'config'
    return 'other'
  }

  /**
   * 🔧 评估业务价值（基于实际业务需求）
   */
  assessBusinessValue (filePath, fileType) {
    // 核心业务逻辑文件 - 这些直接影响用户体验
    const coreBusinessFiles = [
      'UnifiedLotteryEngine',
      'points.js', // 积分API - 用户关心的核心功能
      'PointsTransaction', // 积分交易 - 涉及用户资产
      'LotteryCampaign', // 抽奖活动 - 主要业务逻辑
      'UnifiedDatabaseHelper', // 数据库操作 - 系统稳定性
      'RateLimiter' // 限流 - 系统安全性
    ]

    if (coreBusinessFiles.some(name => filePath.includes(name))) {
      return 'core_business'
    }

    return fileType
  }

  /**
   * 🔧 根据业务价值排序文件
   */
  prioritizeFilesByBusinessValue (files) {
    const businessPriority = {
      core_business: 100, // 核心业务逻辑
      api_endpoint: 90, // API端点
      database_model: 80, // 数据库模型
      utility: 70, // 工具类
      config: 60, // 配置文件
      other: 50 // 其他文件
    }

    return files.sort((a, b) => {
      const aPriority = businessPriority[a.businessValue] || 50
      const bPriority = businessPriority[b.businessValue] || 50
      return bPriority - aPriority
    })
  }

  /**
   * 🔧 显示分析结果
   */
  displayAnalysisResults (prioritizedFiles) {
    console.log('\n📊 0%覆盖率文件分析 (按业务优先级排序):')
    console.log('-'.repeat(80))

    const groups = {}
    prioritizedFiles.forEach(file => {
      if (!groups[file.businessValue]) {
        groups[file.businessValue] = []
      }
      groups[file.businessValue].push(file)
    })

    Object.entries(groups).forEach(([businessValue, files]) => {
      const typeNames = {
        core_business: '🎯 核心业务逻辑',
        api_endpoint: '🌐 API端点',
        database_model: '🗄️ 数据库模型',
        utility: '🛠️ 工具类',
        config: '⚙️ 配置文件',
        other: '📄 其他文件'
      }

      console.log(`\n${typeNames[businessValue] || businessValue} (${files.length}个文件):`)
      files.slice(0, 5).forEach(file => {
        console.log(`   ${file.relativePath} (${file.statements}行, ${file.functions}个函数)`)
      })

      if (files.length > 5) {
        console.log(`   ... 还有${files.length - 5}个文件`)
      }
    })
  }

  /**
   * 🔧 为关键文件创建测试框架
   */
  async createTestFrameworks (prioritizedFiles) {
    console.log('\n🧪 为关键文件创建测试框架...')
    const results = []

    for (const fileInfo of prioritizedFiles) {
      const result = await this.createBaseTestStructure(fileInfo)
      results.push(result)
      console.log(`   ${result.success ? '✅' : '❌'} ${result.message}`)
    }

    return results
  }

  /**
   * 🔧 创建基础测试结构（标注需要真实数据）
   */
  async createBaseTestStructure (fileInfo) {
    try {
      const testPath = this.generateTestFilePath(fileInfo.file)

      // 如果测试文件已存在，跳过
      if (fs.existsSync(testPath)) {
        return {
          success: true,
          message: `测试文件已存在: ${path.relative(process.cwd(), testPath)}`,
          skipped: true
        }
      }

      // 创建基础测试模板（标注需要真实数据）
      const testTemplate = this.generateTestTemplate(fileInfo)

      // 确保目录存在
      const testDir = path.dirname(testPath)
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true })
      }

      // 写入测试文件
      fs.writeFileSync(testPath, testTemplate, 'utf8')

      return {
        success: true,
        message: `创建测试文件: ${path.relative(process.cwd(), testPath)}`,
        file: testPath
      }
    } catch (error) {
      return {
        success: false,
        message: `创建测试失败: ${error.message}`,
        file: fileInfo.file
      }
    }
  }

  /**
   * 🔧 生成测试文件路径
   */
  generateTestFilePath (sourceFile) {
    const relativePath = sourceFile.replace(process.cwd() + '/', '')
    const testPath = relativePath.replace(/^/, 'tests/').replace(/\.js$/, '.test.js')
    return path.join(process.cwd(), testPath)
  }

  /**
   * 🔧 生成测试模板（明确标注需要真实数据）
   */
  generateTestTemplate (fileInfo) {
    const fileName = path.basename(fileInfo.file, '.js')
    const currentDate = new Date().toISOString().split('T')[0]

    return `/**
 * ${fileName} 测试
 * 
 * ⚠️  重要提示：需要真实数据，不要使用模拟数据
 * 📅 创建时间：${currentDate}
 * 🎯 业务价值：${fileInfo.businessValue}
 * 📊 覆盖率目标：提升语句覆盖率 (当前0%)
 */

describe('${fileName}', () => {
  // ⚠️ TODO: 需要真实数据 - 请根据实际业务场景编写测试
  // 🚫 禁止使用mock数据，请使用实际的数据库数据进行测试
  
  beforeEach(async () => {
    // ⚠️ 测试准备：请填写真实的测试数据设置
    // 例如：使用测试账号 13612227930 (mobile字段)
  })

  afterEach(async () => {
    // ⚠️ 测试清理：请填写真实的清理逻辑
  })

  describe('核心业务功能测试', () => {
    it('应该正确处理正常业务场景', async () => {
      // ⚠️ TODO: 基于真实业务需求编写测试
      // 思考：用户期望什么？这个功能解决什么问题？
      
      // 🔧 数据驱动原则：
      // 1. 先查看数据库schema，理解字段映射关系
      // 2. 使用正确的业务标识符（如mobile字段：13612227930）
      // 3. 验证整个调用链，不要局部测试
      
      expect(true).toBe(true) // ⚠️ 临时占位符 - 需要替换为真实测试
    })

    it('应该正确处理异常场景', async () => {
      // ⚠️ TODO: 基于真实异常情况编写测试
      // 思考：用户遇到错误时希望看到什么？
      
      expect(true).toBe(true) // ⚠️ 临时占位符 - 需要替换为真实测试
    })
  })

  describe('业务逻辑验证', () => {
    it('应该符合业务需求和用户期望', async () => {
      // ⚠️ TODO: 验证业务逻辑是否正确
      // 🤔 关键思考：修改测试还是修改实现？哪个解决根本问题？
      // 📋 业务语义一致：确保技术实现服务业务需求
      
      expect(true).toBe(true) // ⚠️ 临时占位符 - 需要替换为真实测试
    })

    it('应该与其他业务模块正确集成', async () => {
      // ⚠️ TODO: 系统性验证 - 覆盖整个调用链
      // 🔗 多层验证：直接调用、API调用、完整集成测试
      
      expect(true).toBe(true) // ⚠️ 临时占位符 - 需要替换为真实测试
    })
  })
})

/*
📋 测试编写指南 - 基于业务需求和用户期望：

1. 🎯 业务优先原则：
   - 测试要验证用户真正关心的功能
   - 不要只测试技术细节，忽略业务价值
   - 思考：用户的问题真的解决了吗？

2. 📊 数据驱动原则：
   - 使用真实数据，如测试账号13612227930（mobile字段）
   - 先查看数据库schema，理解字段映射关系
   - 区分业务标识符（mobile）和技术标识符（user_id）

3. 🔄 系统性思维：
   - 修复要覆盖整个调用链，不能局部修复
   - 多层验证策略：直接调用、API调用、完整集成
   - 测试失败时，先思考是模型错了还是测试期望错了

4. 📝 业务语义一致：
   - 代码、测试、文档用词统一
   - 避免技术术语和业务术语混在一起
   - 团队成员使用同一套业务语言

5. 🌐 API标准化：
   - API接口符合RESTful标准
   - 符合团队约定的API标准
   - 统一使用ApiResponse模式
*/
`
  }

  /**
   * 🔧 生成改进建议
   */
  generateRecommendations (prioritizedFiles) {
    const recommendations = []

    // 核心业务逻辑建议
    const coreBusinessFiles = prioritizedFiles.filter(f => f.businessValue === 'core_business')
    if (coreBusinessFiles.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        type: 'CORE_BUSINESS_TESTING',
        title: '核心业务逻辑测试覆盖',
        message: `${coreBusinessFiles.length}个核心业务文件需要测试覆盖，这些直接影响用户体验`,
        files: coreBusinessFiles.slice(0, 3).map(f => f.relativePath),
        action: '优先为这些文件编写基于真实业务场景的测试'
      })
    }

    // API端点建议
    const apiFiles = prioritizedFiles.filter(f => f.businessValue === 'api_endpoint')
    if (apiFiles.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        type: 'API_TESTING',
        title: 'API端点测试覆盖',
        message: `${apiFiles.length}个API端点需要测试覆盖，确保接口的稳定性`,
        files: apiFiles.slice(0, 3).map(f => f.relativePath),
        action: '使用SuperTest进行API集成测试，验证RESTful标准'
      })
    }

    // 数据库模型建议
    const modelFiles = prioritizedFiles.filter(f => f.businessValue === 'database_model')
    if (modelFiles.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        type: 'DATABASE_MODEL_TESTING',
        title: '数据库模型测试覆盖',
        message: `${modelFiles.length}个数据库模型需要测试覆盖，确保数据一致性`,
        files: modelFiles.slice(0, 3).map(f => f.relativePath),
        action: '验证模型关联关系、字段验证、业务逻辑'
      })
    }

    return recommendations
  }

  /**
   * 🎯 验证真实业务数据
   */
  async validateBusinessData () {
    console.log('\n📋 验证真实业务数据...')

    try {
      const db = require('../../models')

      // 验证测试账号13612227930（数据驱动：先验证，后假设）
      const testUser = await db.User.findOne({
        where: { mobile: '13612227930' }
      })

      console.log('👤 测试账号验证:')
      if (!testUser) {
        console.log('   ⚠️ 测试账号13612227930不存在，需要创建')
        return { testUserExists: false }
      } else {
        console.log(
          `   ✅ 测试账号存在: user_id=${testUser.user_id}, is_admin=${testUser.is_admin}`
        )
        return {
          testUserExists: true,
          testUser: {
            user_id: testUser.user_id,
            mobile: testUser.mobile,
            is_admin: testUser.is_admin
          }
        }
      }
    } catch (error) {
      console.error('❌ 业务数据验证失败:', error.message)
      return { error: error.message }
    }
  }
}

module.exports = CoverageAnalysisManager

// 如果直接运行此文件，执行覆盖率分析
if (require.main === module) {
  const manager = new CoverageAnalysisManager()

  manager
    .analyzeAndFixCoverage()
    .then(async result => {
      if (result.success) {
        console.log('\n✅ 覆盖率分析完成')

        // 验证真实业务数据
        const dataValidation = await manager.validateBusinessData()
        if (dataValidation.testUserExists) {
          console.log('✅ 真实业务数据验证通过')
        }

        process.exit(0)
      } else {
        console.error('❌ 覆盖率分析失败')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('\n💥 覆盖率分析异常:', error)
      process.exit(1)
    })
}
