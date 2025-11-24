#!/usr/bin/env node

/**
 * 前端静态资源自动化检查工具
 *
 * @description 扫描HTML文件中的静态资源引用，验证文件是否存在，防止404错误
 * @version 1.0.0
 * @created 2025-11-23
 *
 * 功能：
 * 1. 扫描所有HTML文件
 * 2. 提取img/link/script标签的资源引用
 * 3. 验证资源文件是否存在
 * 4. 生成详细检查报告
 * 5. CI/CD失败时阻止部署
 *
 * 使用方式:
 * ```bash
 * node scripts/frontend/check-static-resources.js
 * npm run check:resources
 * ```
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

/**
 * 静态资源检查器类
 */
class StaticResourceChecker {
  constructor (options = {}) {
    this.rootDir = options.rootDir || process.cwd()
    this.publicDir = path.join(this.rootDir, 'public')
    this.htmlPattern = options.htmlPattern || 'public/**/*.html'
    this.errors = []
    this.warnings = []
    this.checked = 0
    this.passed = 0
    this.verbose = options.verbose || false
  }

  /**
   * 执行检查
   * @returns {Promise<Object>} 检查结果
   */
  async check () {
    console.log('🔍 前端静态资源自动化检查工具 v1.0.0')
    console.log('='.repeat(60))
    console.log(`📂 根目录: ${this.rootDir}`)
    console.log(`🌐 公共目录: ${this.publicDir}`)
    console.log(`📝 扫描模式: ${this.htmlPattern}\n`)

    // 1. 查找所有HTML文件
    const htmlFiles = await glob(this.htmlPattern, {
      cwd: this.rootDir,
      nodir: true
    })

    if (htmlFiles.length === 0) {
      console.log('⚠️  未找到HTML文件')
      return {
        success: true,
        errors: [],
        warnings: ['未找到HTML文件'],
        checked: 0,
        passed: 0
      }
    }

    console.log(`📄 找到 ${htmlFiles.length} 个HTML文件\n`)

    // 2. 扫描每个文件
    for (const file of htmlFiles) {
      await this.checkFile(file)
    }

    // 3. 生成报告
    this.generateReport()

    // 4. 返回结果
    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      checked: this.checked,
      passed: this.passed
    }
  }

  /**
   * 检查单个HTML文件
   * @param {string} filePath - 文件路径
   */
  async checkFile (filePath) {
    const fullPath = path.join(this.rootDir, filePath)
    const content = fs.readFileSync(fullPath, 'utf8')

    console.log(`📝 检查文件: ${filePath}`)

    // 提取资源引用
    const resources = this.extractResources(content, filePath)

    if (resources.length === 0) {
      console.log('  ℹ️  未找到静态资源引用\n')
      return
    }

    console.log(`  📦 找到 ${resources.length} 个资源引用`)

    // 验证每个资源
    for (const resource of resources) {
      await this.checkResource(resource)
    }

    console.log('')
  }

  /**
   * 提取HTML中的资源引用
   * @param {string} content - HTML内容
   * @param {string} filePath - 文件路径
   * @returns {Array} 资源列表
   */
  extractResources (content, filePath) {
    const resources = []

    // 1. 匹配 <img src="...">
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
    let match
    while ((match = imgRegex.exec(content)) !== null) {
      const src = match[1]
      // 跳过data URI、外部URL、动态变量
      if (this.shouldCheckResource(src)) {
        resources.push({
          type: 'image',
          path: src,
          line: this.getLineNumber(content, match.index),
          file: filePath,
          tag: match[0].substring(0, 50) + '...'
        })
      }
    }

    // 2. 匹配 <link href="...">
    const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi
    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[1]
      if (this.shouldCheckResource(href)) {
        resources.push({
          type: 'stylesheet',
          path: href,
          line: this.getLineNumber(content, match.index),
          file: filePath,
          tag: match[0].substring(0, 50) + '...'
        })
      }
    }

    // 3. 匹配 <script src="...">
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi
    while ((match = scriptRegex.exec(content)) !== null) {
      const src = match[1]
      if (this.shouldCheckResource(src)) {
        resources.push({
          type: 'script',
          path: src,
          line: this.getLineNumber(content, match.index),
          file: filePath,
          tag: match[0].substring(0, 50) + '...'
        })
      }
    }

    return resources
  }

  /**
   * 判断是否应该检查该资源
   * @param {string} path - 资源路径
   * @returns {boolean}
   */
  shouldCheckResource (path) {
    // 跳过data URI
    if (path.startsWith('data:')) return false

    // 跳过外部URL
    if (path.startsWith('http://') || path.startsWith('https://')) return false

    // 跳过协议相对URL
    if (path.startsWith('//')) return false

    // 跳过模板变量（如 ${variable}）
    if (path.includes('${') || path.includes('{{')) return false

    // 跳过动态生成的路径
    if (path.includes('?') && path.includes('=')) {
      // 可能是查询参数，但也检查基础路径
      return true
    }

    return true
  }

  /**
   * 获取代码行号
   * @param {string} content - 文件内容
   * @param {number} index - 字符索引
   * @returns {number} 行号
   */
  getLineNumber (content, index) {
    return content.substring(0, index).split('\n').length
  }

  /**
   * 检查资源是否存在
   * @param {Object} resource - 资源对象
   */
  async checkResource (resource) {
    this.checked++

    // 构建完整路径
    const fullPath = this.resolveResourcePath(resource)

    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      this.errors.push({
        ...resource,
        message: `资源不存在: ${resource.path}`,
        fullPath,
        suggestion: this.getSuggestion(resource)
      })

      console.log(`  ❌ [${resource.type}] ${resource.path}`)
      console.log(`     文件: ${resource.file}:${resource.line}`)
      console.log(`     期望路径: ${fullPath}`)

      if (this.verbose) {
        console.log(`     标签: ${resource.tag}`)
      }
    } else {
      this.passed++

      if (this.verbose) {
        console.log(`  ✅ [${resource.type}] ${resource.path}`)
      }
    }
  }

  /**
   * 解析资源的完整路径
   * @param {Object} resource - 资源对象
   * @returns {string} 完整文件路径
   */
  resolveResourcePath (resource) {
    let fullPath

    if (resource.path.startsWith('/')) {
      // 绝对路径（相对于public目录）
      fullPath = path.join(this.publicDir, resource.path)
    } else {
      // 相对路径（相对于HTML文件所在目录）
      const htmlDir = path.dirname(path.join(this.rootDir, resource.file))
      fullPath = path.join(htmlDir, resource.path)
    }

    // 处理查询参数
    if (fullPath.includes('?')) {
      fullPath = fullPath.split('?')[0]
    }

    return fullPath
  }

  /**
   * 获取修复建议
   * @param {Object} resource - 资源对象
   * @returns {string} 建议
   */
  getSuggestion (resource) {
    if (resource.path.includes('default-avatar')) {
      return '建议使用 ResourceConfig.getImage("defaultAvatar") 替代硬编码路径'
    }

    if (resource.type === 'image') {
      return '建议：1. 创建该图片文件 2. 使用data URI内联 3. 使用ResourceConfig'
    }

    if (resource.type === 'stylesheet') {
      return '建议检查CSS文件是否正确放置在public目录'
    }

    if (resource.type === 'script') {
      return '建议检查JS文件是否正确放置在public目录'
    }

    return '建议检查资源路径和文件是否存在'
  }

  /**
   * 生成检查报告
   */
  generateReport () {
    console.log('\n' + '='.repeat(60))
    console.log('📊 检查报告')
    console.log('='.repeat(60))

    // 基础统计
    console.log('\n📈 统计信息:')
    console.log(`  ✅ 检查资源: ${this.checked} 个`)
    console.log(`  ✓  通过检查: ${this.passed} 个`)
    console.log(`  ✗  发现错误: ${this.errors.length} 个`)
    console.log(`  ⚠  发现警告: ${this.warnings.length} 个`)

    // 成功率
    const successRate = this.checked > 0
      ? ((this.passed / this.checked) * 100).toFixed(1)
      : 100
    console.log(`  📊 成功率: ${successRate}%`)

    // 错误详情
    if (this.errors.length > 0) {
      console.log(`\n❌ 错误详情 (${this.errors.length}个):`)
      console.log('-'.repeat(60))

      this.errors.forEach((error, index) => {
        console.log(`\n${index + 1}. ${error.message}`)
        console.log(`   文件: ${error.file}:${error.line}`)
        console.log(`   类型: ${error.type}`)
        console.log(`   路径: ${error.path}`)
        console.log(`   期望: ${error.fullPath}`)
        console.log(`   建议: ${error.suggestion}`)
      })
    }

    // 警告详情
    if (this.warnings.length > 0) {
      console.log(`\n⚠️  警告详情 (${this.warnings.length}个):`)
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning}`)
      })
    }

    // 最终结论
    console.log('\n' + '='.repeat(60))
    if (this.errors.length === 0) {
      console.log('✅ 所有资源检查通过！')
      console.log('🎉 可以安全部署')
    } else {
      console.log('❌ 发现资源问题，请修复后再提交')
      console.log('\n💡 修复建议:')
      console.log('  1. 使用 ResourceConfig 统一管理资源')
      console.log('  2. 对于默认资源，使用内联data URI')
      console.log('  3. 添加资源文件或修正路径')
      console.log('  4. 为所有图片添加 onerror 处理')
    }
    console.log('='.repeat(60) + '\n')
  }
}

/**
 * 主函数
 */
async function main () {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose') || args.includes('-v')

  try {
    const checker = new StaticResourceChecker({ verbose })
    const result = await checker.check()

    // 退出码：有错误时返回1，无错误返回0
    process.exit(result.success ? 0 : 1)
  } catch (error) {
    console.error('\n💥 检查过程出错:')
    console.error(error)
    process.exit(1)
  }
}

// 执行检查
if (require.main === module) {
  main()
}

module.exports = StaticResourceChecker
