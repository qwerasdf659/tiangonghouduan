/**
 * 路由文件存在性验证器
 * 在项目启动前验证所有注册的路由文件是否存在
 *
 * @author Restaurant Points System
 * @date 2025-11-23
 */

const fs = require('fs')
const path = require('path')

class RouteValidator {
  constructor () {
    this.errors = []
    this.warnings = []
    this.validated = []
  }

  /**
   * 验证app.js中注册的所有路由文件
   * @param {string} appFilePath - app.js文件路径
   * @returns {Object} 验证结果
   */
  validateAppRoutes (appFilePath) {
    console.log('🔍 开始验证路由文件完整性...\n')

    if (!fs.existsSync(appFilePath)) {
      this.errors.push({
        type: 'APP_FILE_MISSING',
        message: `app.js文件不存在: ${appFilePath}`
      })
      return this.generateReport()
    }

    // 读取app.js内容
    const appContent = fs.readFileSync(appFilePath, 'utf8')

    // 提取所有app.use路由注册语句
    const routePattern = /app\.use\(['"]([^'"]+)['"],\s*require\(['"]([^'"]+)['"]\)\)/g
    let match
    let checkedCount = 0

    while ((match = routePattern.exec(appContent)) !== null) {
      const [, routePath, requirePath] = match
      checkedCount++

      // 转换require路径为实际文件路径
      const routeFilePath = this.resolveRequirePath(requirePath, path.dirname(appFilePath))

      // 验证文件是否存在
      if (!fs.existsSync(routeFilePath)) {
        this.errors.push({
          type: 'ROUTE_FILE_MISSING',
          routePath,
          requirePath,
          expectedFile: routeFilePath,
          message: `路由文件不存在: ${routePath} -> ${routeFilePath}`
        })
        console.log(`  ❌ ${routePath} -> ${requirePath} (文件不存在)`)
      } else {
        this.validated.push({ routePath, requirePath, file: routeFilePath })
        console.log(`  ✅ ${routePath} -> ${requirePath}`)
      }
    }

    if (checkedCount === 0) {
      this.warnings.push({
        message: '未找到任何路由注册语句，请检查app.js是否正确'
      })
    }

    return this.generateReport()
  }

  /**
   * 解析require路径为实际文件系统路径
   * @param {string} requirePath - require路径
   * @param {string} basePath - 基础路径
   * @returns {string} 实际文件路径
   */
  resolveRequirePath (requirePath, basePath) {
    // 处理相对路径
    if (requirePath.startsWith('./') || requirePath.startsWith('../')) {
      let filePath = path.resolve(basePath, requirePath)

      // 尝试添加.js扩展名
      if (!fs.existsSync(filePath) && !filePath.endsWith('.js')) {
        filePath = filePath + '.js'
      }

      return filePath
    }

    // 处理绝对路径（从项目根目录）
    let filePath = path.resolve(process.cwd(), requirePath)
    if (!fs.existsSync(filePath) && !filePath.endsWith('.js')) {
      filePath = filePath + '.js'
    }
    return filePath
  }

  /**
   * 生成验证报告
   * @returns {Object} 验证结果对象
   */
  generateReport () {
    const hasErrors = this.errors.length > 0
    const hasWarnings = this.warnings.length > 0

    console.log('\n📊 路由验证报告:')
    console.log('='.repeat(60))

    console.log(`验证路由数: ${this.validated.length}`)
    console.log(`错误数: ${this.errors.length}`)
    console.log(`警告数: ${this.warnings.length}`)

    if (hasErrors) {
      console.log(`\n❌ 发现 ${this.errors.length} 个错误:\n`)
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.type}`)
        if (error.routePath) console.log(`   路由路径: ${error.routePath}`)
        if (error.requirePath) console.log(`   引用路径: ${error.requirePath}`)
        if (error.expectedFile) console.log(`   预期文件: ${error.expectedFile}`)
        console.log(`   错误信息: ${error.message}\n`)
      })
    }

    if (hasWarnings) {
      console.log(`\n⚠️  发现 ${this.warnings.length} 个警告:\n`)
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.message}`)
      })
    }

    if (!hasErrors && !hasWarnings) {
      console.log('\n✅ 所有路由文件验证通过')
    }

    console.log('='.repeat(60))

    return {
      valid: !hasErrors,
      errors: this.errors,
      warnings: this.warnings,
      validated: this.validated
    }
  }
}

// 命令行执行
if (require.main === module) {
  const validator = new RouteValidator()
  const result = validator.validateAppRoutes(path.resolve(__dirname, '../../app.js'))

  if (!result.valid) {
    console.error('\n❌ 路由验证失败，请修复以上错误后再启动项目\n')
    process.exit(1)
  }

  console.log('\n✅ 路由验证通过，可以启动项目\n')
  process.exit(0)
}

module.exports = RouteValidator

