/**
 * API一致性修复脚本
 * 系统性解决API格式不一致和业务语义不匹配问题
 * 创建时间：2025年01月21日 北京时间
 */

const fs = require('fs').promises
const path = require('path')
const ApiStandardManager = require('../utils/ApiStandardManager')

class ApiConsistencyFixer {
  constructor () {
    this.apiStandardManager = new ApiStandardManager()
    this.fixedFiles = []
    this.issues = []
    this.statistics = {
      totalFiles: 0,
      processedFiles: 0,
      fixedIssues: 0,
      remainingIssues: 0
    }
  }

  /**
   * 扫描并修复所有API文件
   */
  async fixAllApiFiles () {
    console.log('🔧 开始API一致性修复...')

    const apiFiles = [
      'routes/v4/unified-engine/lottery.js',
      'routes/v4/unified-engine/admin.js',
      'routes/v4/unified-engine/auth.js',
      'routes/v4/permissions.js' // ✅ 新增：权限管理API路由
    ]

    this.statistics.totalFiles = apiFiles.length

    for (const filePath of apiFiles) {
      try {
        await this.fixApiFile(filePath)
        this.statistics.processedFiles++
      } catch (error) {
        this.issues.push({
          file: filePath,
          error: error.message,
          type: 'processing_error'
        })
      }
    }

    await this.generateReport()
  }

  /**
   * 修复单个API文件
   */
  async fixApiFile (filePath) {
    console.log(`📝 处理文件: ${filePath}`)

    const fullPath = path.resolve(filePath)
    const content = await fs.readFile(fullPath, 'utf8')

    let modifiedContent = content
    let issuesFixed = 0

    // 1. 修复不一致的响应格式
    const responseFormatFixes = await this.fixResponseFormats(modifiedContent)
    modifiedContent = responseFormatFixes.content
    issuesFixed += responseFormatFixes.fixCount

    // 2. 修复业务语义不匹配
    const semanticFixes = await this.fixBusinessSemantics(modifiedContent)
    modifiedContent = semanticFixes.content
    issuesFixed += semanticFixes.fixCount

    // 3. 清理冗余的响应字段
    const redundancyFixes = await this.removeRedundantFields(modifiedContent)
    modifiedContent = redundancyFixes.content
    issuesFixed += redundancyFixes.fixCount

    if (issuesFixed > 0) {
      await fs.writeFile(fullPath, modifiedContent, 'utf8')
      this.fixedFiles.push({
        file: filePath,
        issues: issuesFixed
      })
      this.statistics.fixedIssues += issuesFixed
      console.log(`✅ ${filePath}: 修复了 ${issuesFixed} 个问题`)
    } else {
      console.log(`✅ ${filePath}: 无需修复`)
    }
  }

  /**
   * 修复响应格式不一致问题
   */
  async fixResponseFormats (content) {
    let modifiedContent = content
    let fixCount = 0

    // 替换 res.json() 直接调用为标准化方法
    const patterns = [
      {
        // ✅ 修复：res.status(4xx).json({success: false, error: xxx})
        pattern:
          /return\s+res\.status\(40[0-9]\)\.json\(\s*\{\s*success:\s*false,\s*error:\s*['"`]([^'"`]+)['"`],\s*message:\s*['"`]([^'"`]+)['"`][^}]*\}\s*\)/g,
        replacement: 'return res.apiError(\'$2\', \'$1\')',
        description: '修复4xx错误响应格式'
      },
      {
        // ✅ 修复：res.status(5xx).json({success: false, error: xxx})
        pattern:
          /return\s+res\.status\(50[0-9]\)\.json\(\s*\{\s*success:\s*false,\s*error:\s*['"`]([^'"`]+)['"`],\s*message:\s*['"`]([^'"`]+)['"`][^}]*\}\s*\)/g,
        replacement: 'return res.apiInternalError(\'$2\')',
        description: '修复5xx错误响应格式'
      },
      {
        // ✅ 修复：res.status(xxx).json({...}) 不带return
        pattern:
          /res\.status\(([0-9]+)\)\.json\(\s*\{\s*success:\s*false,\s*error:\s*['"`]([^'"`]+)['"`],\s*message:\s*['"`]([^'"`]+)['"`][^}]*\}\s*\)/g,
        replacement: 'return res.apiError(\'$3\', \'$2\')',
        description: '修复错误响应格式（添加return）'
      },
      {
        // ✅ 修复：res.status(401).json 特定模式
        pattern: /return\s+res\.status\(401\)\.json\(\s*\{[^}]*\}\s*\)/g,
        replacement: 'return res.apiUnauthorized(\'未授权访问\')',
        description: '修复401未授权响应'
      },
      {
        // ✅ 修复：res.status(403).json 特定模式
        pattern: /return\s+res\.status\(403\)\.json\(\s*\{[^}]*\}\s*\)/g,
        replacement: 'return res.apiForbidden(\'禁止访问\')',
        description: '修复403禁止访问响应'
      },
      {
        // ✅ 修复：res.status(404).json 特定模式
        pattern: /return\s+res\.status\(404\)\.json\(\s*\{[^}]*\}\s*\)/g,
        replacement: 'return res.apiNotFound(\'资源不存在\')',
        description: '修复404资源不存在响应'
      },
      {
        // ✅ 修复：res.status(400).json 特定模式
        pattern: /return\s+res\.status\(400\)\.json\(\s*\{[^}]*\}\s*\)/g,
        replacement: 'return res.apiBadRequest(\'请求参数错误\')',
        description: '修复400请求错误响应'
      },
      {
        // ✅ 修复：res.status(500).json 特定模式
        pattern: /return\s+res\.status\(500\)\.json\(\s*\{[^}]*\}\s*\)/g,
        replacement: 'return res.apiInternalError(\'服务器内部错误\')',
        description: '修复500内部错误响应'
      },
      {
        // 🔧 新增：修复 {code: 404, msg: 'xxx'} 格式
        pattern:
          /return\s+res\.status\(404\)\.json\(\s*\{\s*code:\s*404,\s*msg:\s*['"`]([^'"`]+)['"`],\s*data:\s*\{[^}]*\}\s*\}\s*\)/g,
        replacement: 'return res.apiNotFound(\'$1\', \'USER_NOT_FOUND\')',
        description: '修复404用户不存在响应格式'
      },
      {
        // 🔧 新增：修复 {code: 400, msg: 'xxx'} 格式
        pattern:
          /return\s+res\.status\(400\)\.json\(\s*\{\s*code:\s*400,\s*msg:\s*['"`]([^'"`]+)['"`],\s*data:\s*\{[^}]*\}\s*\}\s*\)/g,
        replacement: 'return res.apiBadRequest(\'$1\', \'INVALID_PARAMETER\')',
        description: '修复400参数错误响应格式'
      },
      {
        // 🔧 新增：修复 {code: 500, msg: 'xxx'} 格式
        pattern:
          /return\s+res\.status\(500\)\.json\(\s*\{\s*code:\s*500,\s*msg:\s*['"`]([^'"`]+)['"`][^}]*\}\s*\)/g,
        replacement: 'return res.apiInternalError(\'$1\')',
        description: '修复500内部错误响应格式'
      },
      {
        // 🔧 新增：修复 res.json({code: 0, msg: 'xxx'}) 成功格式
        pattern:
          /return\s+res\.json\(\s*\{\s*code:\s*0,\s*msg:\s*['"`]([^'"`]+)['"`],\s*data:\s*([^}]+)\}\s*\)/g,
        replacement: 'return res.apiSuccess($2, \'$1\')',
        description: '修复成功响应格式（code:0）'
      },
      {
        // 🔧 新增：修复 res.json({code: xxx, msg: 'xxx'}) 错误格式
        pattern:
          /return\s+res\.json\(\s*\{\s*code:\s*([45][0-9][0-9]),\s*msg:\s*['"`]([^'"`]+)['"`][^}]*\}\s*\)/g,
        replacement: 'return res.apiError(\'$2\', \'REQUEST_ERROR\')',
        description: '修复一般错误响应格式'
      },
      {
        // 成功响应格式修复
        pattern:
          /res\.json\(\s*\{\s*success:\s*true,\s*code:\s*['"`]([^'"`]+)['"`],\s*message:\s*['"`]([^'"`]+)['"`],\s*data:\s*([^}]+)\s*\}\s*\)/g,
        replacement: 'res.apiSuccess($3, \'$2\')',
        description: '统一成功响应格式'
      },
      {
        // 修复直接返回对象的情况
        pattern:
          /return\s+res\.json\(\s*\{\s*code:\s*0,\s*msg:\s*['"`]([^'"`]+)['"`],\s*data:\s*([^}]+)\s*\}\s*\)/g,
        replacement: 'return res.apiSuccess($2, \'$1\')',
        description: '修复直接JSON返回'
      },
      {
        // 修复permissions.js中的success:true格式
        pattern:
          /res\.json\(\s*\{\s*success:\s*true,\s*code:\s*['"`]SUCCESS['"`],\s*data:\s*([^}]+),\s*timestamp:[^}]+\}\s*\)/g,
        replacement: 'res.apiSuccess($1, \'操作成功\')',
        description: '修复权限模块成功响应'
      }
    ]

    for (const { pattern, replacement, description } of patterns) {
      const matches = modifiedContent.match(pattern)
      if (matches && matches.length > 0) {
        modifiedContent = modifiedContent.replace(pattern, replacement)
        fixCount += matches.length
        console.log(`  📌 ${description}: ${matches.length}处`)
      }
    }

    return { content: modifiedContent, fixCount }
  }

  /**
   * 修复业务语义不匹配问题
   */
  async fixBusinessSemantics (content) {
    let modifiedContent = content
    let fixCount = 0

    // 业务术语标准化
    const semanticFixes = [
      {
        // 字段名标准化
        pattern: /(['"`])message\1:\s*/g,
        replacement: '\'msg\': ',
        description: '统一消息字段名'
      },
      {
        // 时间戳统一使用北京时间
        pattern: /timestamp:\s*new\s+Date\(\)\.toISOString\(\)/g,
        replacement: 'timestamp: BeijingTimeHelper.apiTimestamp()',
        description: '统一时间戳格式'
      },
      {
        // 抽奖相关术语标准化
        pattern: /lottery_type/g,
        replacement: 'draw_type',
        description: '统一抽奖类型字段名'
      },
      {
        // 用户积分术语标准化
        pattern: /user_points/g,
        replacement: 'userPoints',
        description: '统一用户积分字段名'
      }
    ]

    for (const { pattern, replacement, description } of semanticFixes) {
      const beforeCount = (modifiedContent.match(pattern) || []).length
      if (beforeCount > 0) {
        modifiedContent = modifiedContent.replace(pattern, replacement)
        fixCount += beforeCount
        console.log(`  🏷️ ${description}: ${beforeCount}处`)
      }
    }

    return { content: modifiedContent, fixCount }
  }

  /**
   * 移除冗余字段
   */
  async removeRedundantFields (content) {
    let modifiedContent = content
    let fixCount = 0

    // 移除冗余的响应字段
    const redundancyPatterns = [
      {
        // 移除重复的时间戳字段
        pattern: /,\s*timestamp:\s*[^,}]+,\s*timestamp:\s*[^,}]+/g,
        replacement: '',
        description: '移除重复时间戳字段'
      },
      {
        // 移除version字段（由统一中间件添加）
        pattern: /,\s*version:\s*['"`][^'"`]+['"`]/g,
        replacement: '',
        description: '移除冗余版本字段'
      }
    ]

    for (const { pattern, replacement, description } of redundancyPatterns) {
      const beforeCount = (modifiedContent.match(pattern) || []).length
      if (beforeCount > 0) {
        modifiedContent = modifiedContent.replace(pattern, replacement)
        fixCount += beforeCount
        console.log(`  🧹 ${description}: ${beforeCount}处`)
      }
    }

    return { content: modifiedContent, fixCount }
  }

  /**
   * 验证修复后的文件
   */
  async validateFixedFile (filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8')

      // 检查是否还有不一致的模式
      const inconsistentPatterns = [
        /res\.json\(\s*\{\s*success:/g,
        /res\.status\(\d+\)\.json\(\s*\{\s*success:\s*false/g,
        /message:\s*['"`]/g
      ]

      const remainingIssues = []
      for (const pattern of inconsistentPatterns) {
        const matches = content.match(pattern)
        if (matches && matches.length > 0) {
          remainingIssues.push({
            pattern: pattern.source,
            count: matches.length
          })
        }
      }

      if (remainingIssues.length > 0) {
        this.issues.push({
          file: filePath,
          type: 'remaining_inconsistency',
          issues: remainingIssues
        })
        this.statistics.remainingIssues += remainingIssues.reduce(
          (sum, issue) => sum + issue.count,
          0
        )
      }

      return remainingIssues.length === 0
    } catch (error) {
      console.error(`验证文件失败: ${filePath}`, error.message)
      return false
    }
  }

  /**
   * 生成修复报告
   */
  async generateReport () {
    console.log('\n📊 API一致性修复报告')
    console.log('='.repeat(50))
    console.log(`📁 处理文件数: ${this.statistics.processedFiles}/${this.statistics.totalFiles}`)
    console.log(`🔧 修复问题数: ${this.statistics.fixedIssues}`)
    console.log(`⚠️  剩余问题数: ${this.statistics.remainingIssues}`)

    if (this.fixedFiles.length > 0) {
      console.log('\n✅ 已修复的文件:')
      this.fixedFiles.forEach(file => {
        console.log(`   • ${file.file}: ${file.issues} 个问题`)
      })
    }

    if (this.issues.length > 0) {
      console.log('\n❌ 需要手动处理的问题:')
      this.issues.forEach(issue => {
        console.log(`   • ${issue.file}: ${issue.type}`)
        if (issue.issues) {
          issue.issues.forEach(subIssue => {
            console.log(`     - ${subIssue.pattern}: ${subIssue.count}处`)
          })
        }
      })
    }

    const successRate =
      (this.statistics.fixedIssues /
        (this.statistics.fixedIssues + this.statistics.remainingIssues)) *
      100
    console.log(`\n📈 修复成功率: ${successRate.toFixed(1)}%`)

    // 生成简化的API标准化报告
    console.log('\n📋 API标准化规范:')
    console.log('   • 使用apiSuccess/apiError统一响应格式')
    console.log('   • 使用is_winner/is_successful业务标准字段')
    console.log('   • 所有async函数必须有return语句')

    console.log('\n💡 建议:')
    console.log('   1. 确保所有async函数都有return语句')
    console.log('   2. 统一使用apiSuccess/apiError响应格式')
    console.log('   3. 遵循is_winner/is_successful业务标准')

    // 保存报告到文件
    const reportPath = 'reports/api-consistency-fix-report.json'
    await this.saveReportToFile(reportPath, {
      timestamp: new Date().toISOString(),
      statistics: this.statistics,
      fixedFiles: this.fixedFiles,
      issues: this.issues
    })

    console.log(`\n📄 详细报告已保存: ${reportPath}`)
  }

  /**
   * 保存报告到文件
   */
  async saveReportToFile (filePath, report) {
    try {
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8')
    } catch (error) {
      console.error('保存报告失败:', error.message)
    }
  }
}

// 运行修复脚本
async function main () {
  try {
    const fixer = new ApiConsistencyFixer()
    await fixer.fixAllApiFiles()

    console.log('\n🎉 API一致性修复完成!')
    process.exit(0)
  } catch (error) {
    console.error('❌ API一致性修复失败:', error.message)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = ApiConsistencyFixer
