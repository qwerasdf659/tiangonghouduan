#!/usr/bin/env node
/**
 * 全系统深度排查工具
 *
 * 用途：排查整个devbox中的潜在问题
 * 范围：后端数据库 + web端后台管理前端
 */

'use strict'

const fs = require('fs')
const path = require('path')

class FullSystemChecker {
  constructor () {
    this.issues = {
      critical: [],
      warning: [],
      info: []
    }
  }

  /**
   * 运行全面检查
   */
  async run () {
    console.log('🔍 全系统深度排查工具 v1.0.0')
    console.log('='.repeat(80))
    console.log('')

    // 第1部分：后端数据库检查
    console.log('📦 第一部分：后端数据库检查')
    console.log('='.repeat(80))
    await this.checkBackendDatabase()

    console.log('')

    // 第2部分：前端Web管理系统检查
    console.log('🌐 第二部分：前端Web管理系统检查')
    console.log('='.repeat(80))
    await this.checkFrontendWeb()

    // 生成综合报告
    this.generateComprehensiveReport()
  }

  /**
   * 第1部分：后端数据库检查
   */
  async checkBackendDatabase () {
    // 检查1.1：服务层字段完整性
    await this.checkServiceFieldIntegrity()

    // 检查1.2：工具类方法调用
    await this.checkUtilsMethodCalls()

    // 检查1.3：模型关联完整性
    await this.checkModelAssociations()

    // 检查1.4：路由注册完整性
    await this.checkRouteRegistration()

    // 检查1.5：Middleware引入路径
    await this.checkMiddlewareImports()

    // 检查1.6：数据库字段类型一致性
    await this.checkDatabaseFieldTypes()
  }

  /**
   * 检查1.1：服务层字段完整性
   */
  async checkServiceFieldIntegrity () {
    console.log('\n📊 检查1.1: 服务层字段完整性')
    console.log('-'.repeat(80))

    try {
      // 加载所有模型字段
      const modelsDir = path.join(__dirname, '../../models')
      const modelFields = new Map()

      fs.readdirSync(modelsDir).forEach(file => {
        if (file.endsWith('.js') && file !== 'index.js') {
          const modelName = file.replace('.js', '')
          const content = fs.readFileSync(path.join(modelsDir, file), 'utf8')

          const fields = []
          const fieldRegex = /(\w+):\s*\{[^}]*type:\s*DataTypes\./g
          let match

          while ((match = fieldRegex.exec(content)) !== null) {
            fields.push(match[1])
          }

          modelFields.set(modelName, fields)
        }
      })

      console.log(`   发现 ${modelFields.size} 个模型`)

      // 检查所有服务层文件
      const servicesDir = path.join(__dirname, '../../services')
      let totalChecked = 0
      let issuesFound = 0

      fs.readdirSync(servicesDir).forEach(file => {
        if (file.endsWith('.js')) {
          const content = fs.readFileSync(path.join(servicesDir, file), 'utf8')

          // 提取attributes中使用的字段
          const attributesRegex = /attributes:\s*\[([^\]]+)\]/g
          let match

          while ((match = attributesRegex.exec(content)) !== null) {
            totalChecked++
            const fieldsStr = match[1]
            const usedFields = fieldsStr
              .split(',')
              .map(f => f.trim().replace(/['"]/g, '').replace(/\[.*?\]/g, ''))
              .filter(f => f && f !== '*' && !f.includes('Sequelize') && !f.includes('//'))

            usedFields.forEach(field => {
              let found = false
              for (const fields of modelFields.values()) {
                if (fields.includes(field)) {
                  found = true
                  break
                }
              }

              if (!found && field.length > 0 && field.length < 50) {
                const issue = `${file}: 字段 '${field}' 可能未在模型中定义`
                this.issues.warning.push(issue)
                issuesFound++
              }
            })
          }
        }
      })

      if (issuesFound === 0) {
        console.log(`   ✅ 检查 ${totalChecked} 处字段使用，全部通过`)
      } else {
        console.log(`   ⚠️ 发现 ${issuesFound} 处潜在问题`)
        this.issues.warning.slice(-issuesFound).forEach(issue => {
          console.log(`      - ${issue}`)
        })
      }
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
      this.issues.critical.push(`服务层字段检查失败: ${error.message}`)
    }
  }

  /**
   * 检查1.2：工具类方法调用
   */
  async checkUtilsMethodCalls () {
    console.log('\n📊 检查1.2: 工具类方法调用')
    console.log('-'.repeat(80))

    try {
      // 收集所有工具类的方法
      const utilsDir = path.join(__dirname, '../../utils')
      const utilsMethods = new Map()

      if (fs.existsSync(utilsDir)) {
        fs.readdirSync(utilsDir).forEach(file => {
          if (file.endsWith('.js')) {
            const className = file.replace('.js', '')
            const content = fs.readFileSync(path.join(utilsDir, file), 'utf8')

            const methods = []
            const methodRegex = /static\s+(\w+)\s*\(/g
            let match

            while ((match = methodRegex.exec(content)) !== null) {
              methods.push(match[1])
            }

            utilsMethods.set(className, methods)
          }
        })
      }

      console.log(`   发现 ${utilsMethods.size} 个工具类`)

      // 检查所有服务层和路由文件
      const checkDirs = [
        { path: path.join(__dirname, '../../services'), name: 'services' },
        { path: path.join(__dirname, '../../routes'), name: 'routes' }
      ]

      let issuesFound = 0

      checkDirs.forEach(({ path: dirPath, name }) => {
        if (fs.existsSync(dirPath)) {
          this.scanDirectoryForUtilsCalls(dirPath, utilsMethods, name, (issue) => {
            this.issues.warning.push(issue)
            issuesFound++
          })
        }
      })

      if (issuesFound === 0) {
        console.log('   ✅ 所有工具类方法调用正确')
      } else {
        console.log(`   ⚠️ 发现 ${issuesFound} 处潜在问题`)
      }
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
      this.issues.critical.push(`工具类方法检查失败: ${error.message}`)
    }
  }

  /**
   * 递归扫描目录检查工具类调用
   */
  scanDirectoryForUtilsCalls (dir, utilsMethods, dirName, onIssue) {
    const files = fs.readdirSync(dir)

    files.forEach(file => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory() && file !== 'node_modules') {
        this.scanDirectoryForUtilsCalls(filePath, utilsMethods, dirName, onIssue)
      } else if (file.endsWith('.js')) {
        const content = fs.readFileSync(filePath, 'utf8')

        // 检查工具类方法调用
        utilsMethods.forEach((methods, className) => {
          const callRegex = new RegExp(`${className}\\.([\\w]+)\\(`, 'g')
          let match

          while ((match = callRegex.exec(content)) !== null) {
            const methodName = match[1]
            if (!methods.includes(methodName)) {
              const relativePath = path.relative(process.cwd(), filePath)
              onIssue(`${relativePath}: ${className}.${methodName}() 方法不存在`)
            }
          }
        })
      }
    })
  }

  /**
   * 检查1.3：模型关联完整性
   */
  async checkModelAssociations () {
    console.log('\n📊 检查1.3: 模型关联完整性')
    console.log('-'.repeat(80))

    try {
      const modelsIndexPath = path.join(__dirname, '../../models/index.js')

      if (!fs.existsSync(modelsIndexPath)) {
        console.log('   ⚠️ models/index.js 不存在')
        return
      }

      const content = fs.readFileSync(modelsIndexPath, 'utf8')

      // 检查是否有模型关联定义
      const hasAssociations = content.includes('hasMany') ||
                            content.includes('belongsTo') ||
                            content.includes('hasOne')

      if (hasAssociations) {
        console.log('   ✅ 发现模型关联定义')

        // 检查常见的关联问题
        const modelsDir = path.join(__dirname, '../../models')
        const modelFiles = fs.readdirSync(modelsDir)
          .filter(f => f.endsWith('.js') && f !== 'index.js')

        console.log(`   检查 ${modelFiles.length} 个模型的关联...`)

        // 简单检查：确保每个模型都有基本的关联定义
        modelFiles.forEach(file => {
          const modelName = file.replace('.js', '')
          const pattern = new RegExp(`${modelName}\\.(hasMany|belongsTo|hasOne)`, 'g')

          if (!pattern.test(content)) {
            this.issues.info.push(`模型 ${modelName} 可能缺少关联定义`)
          }
        })
      } else {
        console.log('   ⚠️ 未发现模型关联定义')
        this.issues.warning.push('models/index.js 中未发现模型关联定义')
      }
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
    }
  }

  /**
   * 检查1.4：路由注册完整性
   */
  async checkRouteRegistration () {
    console.log('\n📊 检查1.4: 路由注册完整性')
    console.log('-'.repeat(80))

    try {
      const routesV4AdminPath = path.join(__dirname, '../../routes/v4/unified-engine/admin')

      if (!fs.existsSync(routesV4AdminPath)) {
        console.log('   ⚠️ admin路由目录不存在')
        return
      }

      const indexPath = path.join(routesV4AdminPath, 'index.js')
      if (!fs.existsSync(indexPath)) {
        console.log('   ❌ admin/index.js 不存在')
        this.issues.critical.push('admin路由主文件缺失')
        return
      }

      const indexContent = fs.readFileSync(indexPath, 'utf8')

      // 获取所有路由文件
      const routeFiles = fs.readdirSync(routesV4AdminPath)
        .filter(f => f.endsWith('.js') && f !== 'index.js')

      console.log(`   发现 ${routeFiles.length} 个路由模块`)

      let registeredCount = 0
      let unregisteredCount = 0

      routeFiles.forEach(file => {
        const moduleName = file.replace('.js', '')
        const hasImport = indexContent.includes(`require('./${file}'`) ||
                         indexContent.includes(`require('./${moduleName}')`)
        const hasMount = indexContent.includes('router.use(') &&
                        indexContent.includes(moduleName.replace(/_/g, '-'))

        if (hasImport && hasMount) {
          registeredCount++
        } else {
          unregisteredCount++
          const issue = `${file}: 路由文件存在但${!hasImport ? '未导入' : ''}${!hasMount ? '未挂载' : ''}`
          console.log(`   ⚠️ ${issue}`)
          this.issues.warning.push(issue)
        }
      })

      console.log(`   ✅ 已注册: ${registeredCount}, ⚠️ 未注册: ${unregisteredCount}`)
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
    }
  }

  /**
   * 检查1.5：Middleware引入路径
   */
  async checkMiddlewareImports () {
    console.log('\n📊 检查1.5: Middleware引入路径')
    console.log('-'.repeat(80))

    try {
      const routesDir = path.join(__dirname, '../../routes')
      let checkedFiles = 0
      let issuesFound = 0

      const checkDir = (dir, depth = 0) => {
        if (depth > 5) return // 防止过深递归

        const files = fs.readdirSync(dir)

        files.forEach(file => {
          const filePath = path.join(dir, file)
          const stat = fs.statSync(filePath)

          if (stat.isDirectory() && file !== 'node_modules') {
            checkDir(filePath, depth + 1)
          } else if (file.endsWith('.js')) {
            checkedFiles++
            const content = fs.readFileSync(filePath, 'utf8')

            // 检查错误的middleware引入
            if (content.includes('authMiddleware') && !content.includes('middleware/auth')) {
              const relativePath = path.relative(process.cwd(), filePath)
              const issue = `${relativePath}: 使用了不存在的 'authMiddleware'`
              console.log(`   ⚠️ ${issue}`)
              this.issues.warning.push(issue)
              issuesFound++
            }

            // 检查middleware引入路径是否正确
            const middlewareImports = content.match(/require\(['"]([^'"]*middleware[^'"]*)['"]\)/g)
            if (middlewareImports) {
              middlewareImports.forEach(imp => {
                const pathMatch = imp.match(/require\(['"]([^'"]+)['"]\)/)
                if (pathMatch) {
                  const importPath = pathMatch[1]
                  // 检查路径深度是否合理
                  const depth = (importPath.match(/\.\.\//g) || []).length
                  if (depth > 5) {
                    const relativePath = path.relative(process.cwd(), filePath)
                    this.issues.info.push(`${relativePath}: middleware引入路径可能过深: ${importPath}`)
                  }
                }
              })
            }
          }
        })
      }

      checkDir(routesDir)

      console.log(`   检查了 ${checkedFiles} 个路由文件`)
      if (issuesFound === 0) {
        console.log('   ✅ 所有middleware引入路径正确')
      } else {
        console.log(`   ⚠️ 发现 ${issuesFound} 处问题`)
      }
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
    }
  }

  /**
   * 检查1.6：数据库字段类型一致性
   */
  async checkDatabaseFieldTypes () {
    console.log('\n📊 检查1.6: 数据库字段类型一致性')
    console.log('-'.repeat(80))

    try {
      const modelsDir = path.join(__dirname, '../../models')
      let checkedModels = 0
      let issuesFound = 0

      fs.readdirSync(modelsDir).forEach(file => {
        if (file.endsWith('.js') && file !== 'index.js') {
          checkedModels++
          const content = fs.readFileSync(path.join(modelsDir, file), 'utf8')

          // 检查DECIMAL字段定义
          if (content.includes('DataTypes.DECIMAL')) {
            const decimalRegex = /(\w+):\s*\{[^}]*type:\s*DataTypes\.DECIMAL\((\d+),\s*(\d+)\)/g
            let match

            while ((match = decimalRegex.exec(content)) !== null) {
              const fieldName = match[1]
              const precision = parseInt(match[2])
              const scale = parseInt(match[3])

              // 检查精度配置是否合理
              if (precision < scale) {
                const issue = `${file}: ${fieldName} DECIMAL(${precision},${scale}) 精度小于标度`
                console.log(`   ⚠️ ${issue}`)
                this.issues.warning.push(issue)
                issuesFound++
              }

              if (precision > 65) {
                const issue = `${file}: ${fieldName} DECIMAL(${precision},${scale}) 精度超过MySQL最大值65`
                console.log(`   ⚠️ ${issue}`)
                this.issues.warning.push(issue)
                issuesFound++
              }
            }
          }
        }
      })

      console.log(`   检查了 ${checkedModels} 个模型`)
      if (issuesFound === 0) {
        console.log('   ✅ 所有字段类型定义正确')
      } else {
        console.log(`   ⚠️ 发现 ${issuesFound} 处潜在问题`)
      }
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
    }
  }

  /**
   * 第2部分：前端Web管理系统检查
   */
  async checkFrontendWeb () {
    // 检查2.1：API调用路径完整性
    await this.checkAPICallPaths()

    // 检查2.2：WebSocket连接一致性
    await this.checkWebSocketConnections()

    // 检查2.3：工具类方法调用（前端）
    await this.checkFrontendUtilsCalls()

    // 检查2.4：认证Token处理
    await this.checkAuthTokenHandling()

    // 检查2.5：错误处理完整性
    await this.checkErrorHandling()
  }

  /**
   * 检查2.1：API调用路径完整性
   */
  async checkAPICallPaths () {
    console.log('\n📊 检查2.1: API调用路径完整性')
    console.log('-'.repeat(80))

    try {
      const publicAdminDir = path.join(__dirname, '../../public/admin')

      if (!fs.existsSync(publicAdminDir)) {
        console.log('   ⚠️ public/admin 目录不存在')
        return
      }

      const apiCalls = []
      let totalFiles = 0

      const scanFile = (filePath) => {
        const content = fs.readFileSync(filePath, 'utf8')
        const relativePath = path.relative(publicAdminDir, filePath)

        // 匹配API调用
        const patterns = [
          /(?:fetch|apiRequest)\s*\(\s*['"`]([^'"`]+)['"`]/g,
          /url:\s*['"`]([^'"`]+)['"`]/g
        ]

        patterns.forEach(pattern => {
          let match
          while ((match = pattern.exec(content)) !== null) {
            const url = match[1]
            if (url.startsWith('/api/')) {
              const lineNumber = content.substring(0, match.index).split('\n').length
              apiCalls.push({
                file: relativePath,
                url,
                line: lineNumber
              })
            }
          }
        })
      }

      const scanDirectory = (dir) => {
        const files = fs.readdirSync(dir)

        files.forEach(file => {
          const filePath = path.join(dir, file)
          const stat = fs.statSync(filePath)

          if (stat.isDirectory()) {
            scanDirectory(filePath)
          } else if (file.endsWith('.html') || file.endsWith('.js')) {
            totalFiles++
            scanFile(filePath)
          }
        })
      }

      scanDirectory(publicAdminDir)

      console.log(`   扫描了 ${totalFiles} 个前端文件`)
      console.log(`   发现 ${apiCalls.length} 处API调用`)

      // 检查API路径规范性
      let issuesFound = 0
      const pathPatterns = {
        missingVersion: /^\/api\/(?!v\d+)/,
        missingAdmin: /^\/api\/v\d+\/(?!admin|user)/,
        inconsistent: /^\/api\/v\d+\/[^/]+\/[^/]+$/
      }

      apiCalls.forEach(call => {
        // 检查是否缺少版本号
        if (pathPatterns.missingVersion.test(call.url)) {
          const issue = `${call.file}:${call.line}: API路径可能缺少版本号: ${call.url}`
          this.issues.warning.push(issue)
          issuesFound++
        }

        // 检查admin路径
        if (call.file.includes('admin') && !call.url.includes('/admin') && call.url.includes('/api/v')) {
          const issue = `${call.file}:${call.line}: admin页面调用的API可能缺少/admin前缀: ${call.url}`
          console.log(`   ⚠️ ${issue}`)
          this.issues.warning.push(issue)
          issuesFound++
        }
      })

      if (issuesFound === 0) {
        console.log('   ✅ 所有API调用路径规范')
      } else {
        console.log(`   ⚠️ 发现 ${issuesFound} 处潜在问题`)
      }

      // 输出API调用统计
      const apiSummary = new Map()
      apiCalls.forEach(call => {
        const basePath = call.url.split('?')[0].replace(/\/\d+/g, '/:id')
        apiSummary.set(basePath, (apiSummary.get(basePath) || 0) + 1)
      })

      console.log('\n   📊 API调用统计（前10个最常用）:')
      const sorted = Array.from(apiSummary.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)

      sorted.forEach(([path, count]) => {
        console.log(`      ${count}次: ${path}`)
      })
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
    }
  }

  /**
   * 检查2.2：WebSocket连接一致性
   */
  async checkWebSocketConnections () {
    console.log('\n📊 检查2.2: WebSocket连接一致性')
    console.log('-'.repeat(80))

    try {
      const publicAdminDir = path.join(__dirname, '../../public/admin')
      let foundWebSocket = false
      let foundSocketIO = false
      const issues = []

      const scanFile = (filePath) => {
        const content = fs.readFileSync(filePath, 'utf8')
        const relativePath = path.relative(publicAdminDir, filePath)

        // 检查WebSocket使用
        if (content.includes('new WebSocket(') || content.includes('WebSocket(')) {
          foundWebSocket = true
          issues.push(`${relativePath}: 使用原生WebSocket`)
        }

        if (content.includes('socket.io') || content.includes('io(')) {
          foundSocketIO = true
          issues.push(`${relativePath}: 使用Socket.IO`)
        }

        // 检查是否加载了Socket.IO库
        if (content.includes('socket.io-client') || content.includes('socket.io.min.js')) {
          console.log(`   ✅ ${relativePath}: 已加载Socket.IO客户端库`)
        }
      }

      const scanDirectory = (dir) => {
        if (!fs.existsSync(dir)) return

        const files = fs.readdirSync(dir)

        files.forEach(file => {
          const filePath = path.join(dir, file)
          const stat = fs.statSync(filePath)

          if (stat.isDirectory()) {
            scanDirectory(filePath)
          } else if (file.endsWith('.html') || file.endsWith('.js')) {
            scanFile(filePath)
          }
        })
      }

      scanDirectory(publicAdminDir)

      if (!foundWebSocket && !foundSocketIO) {
        console.log('   ℹ️ 未发现WebSocket使用')
      } else if (foundWebSocket && foundSocketIO) {
        console.log('   ⚠️ 同时使用了原生WebSocket和Socket.IO，需要统一')
        this.issues.warning.push('前端WebSocket技术栈不统一')
        issues.forEach(issue => console.log(`      - ${issue}`))
      } else {
        console.log('   ✅ WebSocket技术栈统一')
      }
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
    }
  }

  /**
   * 检查2.3：工具类方法调用（前端）
   */
  async checkFrontendUtilsCalls () {
    console.log('\n📊 检查2.3: 前端工具类方法调用')
    console.log('-'.repeat(80))

    try {
      const publicAdminDir = path.join(__dirname, '../../public/admin')

      if (!fs.existsSync(publicAdminDir)) {
        console.log('   ⚠️ public/admin 目录不存在')
        return
      }

      // 检查BeijingTimeHelper调用
      let issuesFound = 0
      let checkedFiles = 0

      const scanFile = (filePath) => {
        checkedFiles++
        const content = fs.readFileSync(filePath, 'utf8')
        const relativePath = path.relative(publicAdminDir, filePath)

        // 检查BeijingTimeHelper方法调用
        const beijingTimeCalls = content.match(/BeijingTimeHelper\.(\w+)\(/g)
        if (beijingTimeCalls) {
          const validMethods = ['toBeijingTime', 'formatForAPI', 'format', 'parse']

          beijingTimeCalls.forEach(call => {
            const methodName = call.match(/BeijingTimeHelper\.(\w+)\(/)[1]
            if (!validMethods.includes(methodName)) {
              const issue = `${relativePath}: BeijingTimeHelper.${methodName}() 方法可能不存在`
              console.log(`   ⚠️ ${issue}`)
              this.issues.warning.push(issue)
              issuesFound++
            }
          })
        }
      }

      const scanDirectory = (dir) => {
        const files = fs.readdirSync(dir)

        files.forEach(file => {
          const filePath = path.join(dir, file)
          const stat = fs.statSync(filePath)

          if (stat.isDirectory()) {
            scanDirectory(filePath)
          } else if (file.endsWith('.html') || file.endsWith('.js')) {
            scanFile(filePath)
          }
        })
      }

      scanDirectory(publicAdminDir)

      console.log(`   检查了 ${checkedFiles} 个前端文件`)
      if (issuesFound === 0) {
        console.log('   ✅ 所有工具类方法调用正确')
      } else {
        console.log(`   ⚠️ 发现 ${issuesFound} 处潜在问题`)
      }
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
    }
  }

  /**
   * 检查2.4：认证Token处理
   */
  async checkAuthTokenHandling () {
    console.log('\n📊 检查2.4: 认证Token处理')
    console.log('-'.repeat(80))

    try {
      const publicAdminDir = path.join(__dirname, '../../public/admin')

      if (!fs.existsSync(publicAdminDir)) {
        console.log('   ⚠️ public/admin 目录不存在')
        return
      }

      let filesWithAPI = 0
      let filesWithToken = 0
      const filesWithoutToken = []

      const scanFile = (filePath) => {
        const content = fs.readFileSync(filePath, 'utf8')
        const relativePath = path.relative(publicAdminDir, filePath)

        // 检查是否有API调用
        if (content.includes('apiRequest') || content.includes('fetch(')) {
          filesWithAPI++

          // 检查是否处理Token
          if (content.includes('getToken') ||
              content.includes('admin_token') ||
              content.includes('Authorization')) {
            filesWithToken++
          } else {
            filesWithoutToken.push(relativePath)
          }
        }
      }

      const scanDirectory = (dir) => {
        const files = fs.readdirSync(dir)

        files.forEach(file => {
          const filePath = path.join(dir, file)
          const stat = fs.statSync(filePath)

          if (stat.isDirectory()) {
            scanDirectory(filePath)
          } else if (file.endsWith('.html') || file.endsWith('.js')) {
            scanFile(filePath)
          }
        })
      }

      scanDirectory(publicAdminDir)

      console.log(`   有API调用的文件: ${filesWithAPI}`)
      console.log(`   处理Token的文件: ${filesWithToken}`)

      if (filesWithoutToken.length > 0) {
        console.log(`   ⚠️ ${filesWithoutToken.length} 个文件可能缺少Token处理:`)
        filesWithoutToken.slice(0, 5).forEach(file => {
          console.log(`      - ${file}`)
        })
        if (filesWithoutToken.length > 5) {
          console.log(`      ... 还有 ${filesWithoutToken.length - 5} 个`)
        }
      } else {
        console.log('   ✅ 所有API调用都处理Token')
      }
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
    }
  }

  /**
   * 检查2.5：错误处理完整性
   */
  async checkErrorHandling () {
    console.log('\n📊 检查2.5: 错误处理完整性')
    console.log('-'.repeat(80))

    try {
      const publicAdminDir = path.join(__dirname, '../../public/admin')

      if (!fs.existsSync(publicAdminDir)) {
        console.log('   ⚠️ public/admin 目录不存在')
        return
      }

      let filesWithTryCatch = 0
      const filesWithoutTryCatch = []
      let totalAsyncFunctions = 0

      const scanFile = (filePath) => {
        const content = fs.readFileSync(filePath, 'utf8')
        const relativePath = path.relative(publicAdminDir, filePath)

        // 统计async函数
        const asyncFunctions = (content.match(/async\s+function|async\s+\(/g) || []).length
        totalAsyncFunctions += asyncFunctions

        if (asyncFunctions > 0) {
          // 检查是否有try-catch
          if (content.includes('try') && content.includes('catch')) {
            filesWithTryCatch++
          } else {
            filesWithoutTryCatch.push(relativePath)
          }
        }
      }

      const scanDirectory = (dir) => {
        const files = fs.readdirSync(dir)

        files.forEach(file => {
          const filePath = path.join(dir, file)
          const stat = fs.statSync(filePath)

          if (stat.isDirectory()) {
            scanDirectory(filePath)
          } else if (file.endsWith('.html') || file.endsWith('.js')) {
            scanFile(filePath)
          }
        })
      }

      scanDirectory(publicAdminDir)

      console.log(`   发现 ${totalAsyncFunctions} 个async函数`)
      console.log(`   有错误处理: ${filesWithTryCatch} 个文件`)

      if (filesWithoutTryCatch.length > 0) {
        console.log(`   ⚠️ ${filesWithoutTryCatch.length} 个文件可能缺少错误处理`)
        this.issues.info.push(`${filesWithoutTryCatch.length} 个文件可能缺少错误处理`)
      } else {
        console.log('   ✅ 所有async函数都有错误处理')
      }
    } catch (error) {
      console.log(`   ❌ 检查失败: ${error.message}`)
    }
  }

  /**
   * 生成综合报告
   */
  generateComprehensiveReport () {
    console.log('')
    console.log('='.repeat(80))
    console.log('📋 全系统排查综合报告')
    console.log('='.repeat(80))
    console.log('')

    const totalIssues = this.issues.critical.length +
                       this.issues.warning.length +
                       this.issues.info.length

    console.log(`🔴 严重问题: ${this.issues.critical.length}`)
    console.log(`⚠️ 警告: ${this.issues.warning.length}`)
    console.log(`ℹ️ 信息: ${this.issues.info.length}`)
    console.log(`📊 总计: ${totalIssues}`)
    console.log('')

    if (this.issues.critical.length > 0) {
      console.log('🔴 严重问题清单:')
      this.issues.critical.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`)
      })
      console.log('')
    }

    if (this.issues.warning.length > 0) {
      console.log('⚠️ 警告清单（前20个）:')
      this.issues.warning.slice(0, 20).forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`)
      })
      if (this.issues.warning.length > 20) {
        console.log(`   ... 还有 ${this.issues.warning.length - 20} 个警告`)
      }
      console.log('')
    }

    console.log('💡 处理建议:')
    if (this.issues.critical.length > 0) {
      console.log('   1. 优先修复严重问题')
    }
    if (this.issues.warning.length > 0) {
      console.log('   2. 评估并修复警告项')
    }
    if (this.issues.info.length > 0) {
      console.log('   3. 关注信息项，可选择性改进')
    }
    console.log('   4. 运行 npm run verify:quick 进行快速验证')
    console.log('   5. 参考 docs/前后端协同开发完整性验证系统.md')
    console.log('')

    // 保存报告到文件
    const reportPath = path.join(__dirname, '../../docs/全系统排查报告.md')
    this.saveReportToFile(reportPath)

    process.exit(this.issues.critical.length > 0 ? 1 : 0)
  }

  /**
   * 保存报告到文件
   */
  saveReportToFile (reportPath) {
    let markdown = '# 全系统排查报告\n\n'
    markdown += `> 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`
    markdown += '## 概览\n\n'
    markdown += `- 🔴 严重问题: ${this.issues.critical.length}\n`
    markdown += `- ⚠️ 警告: ${this.issues.warning.length}\n`
    markdown += `- ℹ️ 信息: ${this.issues.info.length}\n\n`

    if (this.issues.critical.length > 0) {
      markdown += '## 🔴 严重问题\n\n'
      this.issues.critical.forEach((issue, index) => {
        markdown += `${index + 1}. ${issue}\n`
      })
      markdown += '\n'
    }

    if (this.issues.warning.length > 0) {
      markdown += '## ⚠️ 警告\n\n'
      this.issues.warning.forEach((issue, index) => {
        markdown += `${index + 1}. ${issue}\n`
      })
      markdown += '\n'
    }

    if (this.issues.info.length > 0) {
      markdown += '## ℹ️ 信息\n\n'
      this.issues.info.forEach((issue, index) => {
        markdown += `${index + 1}. ${issue}\n`
      })
      markdown += '\n'
    }

    fs.writeFileSync(reportPath, markdown, 'utf8')
    console.log(`📄 详细报告已保存: ${reportPath}`)
    console.log('')
  }
}

// 执行全系统检查
const checker = new FullSystemChecker()
checker.run().catch(error => {
  console.error('❌ 检查过程发生错误:', error)
  process.exit(1)
})
