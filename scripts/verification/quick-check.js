#!/usr/bin/env node
/**
 * 快速完整性检查工具
 * 
 * 用途：在开发过程中快速检查常见的前后端集成问题
 * 使用：node scripts/verification/quick-check.js
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

class QuickIntegrityChecker {
  constructor () {
    this.errors = []
    this.warnings = []
    this.passed = []
  }

  /**
   * 运行所有检查
   */
  async run () {
    console.log('🔍 快速完整性检查工具 v1.0.0')
    console.log('='.repeat(60))
    console.log('')

    // 检查1：模型与服务层字段匹配
    await this.checkModelServiceFieldsMatch()

    // 检查2：路由注册情况
    await this.checkRouteRegistration()

    // 检查3：Middleware引入路径
    await this.checkMiddlewareImports()

    // 检查4：服务启动验证
    await this.checkServiceStartup()

    // 生成报告
    this.generateReport()
  }

  /**
   * 检查1：模型与服务层字段匹配
   */
  async checkModelServiceFieldsMatch () {
    console.log('📊 检查1: 模型与服务层匹配')
    console.log('-'.repeat(60))

    try {
      // 读取所有模型
      const modelsDir = path.join(__dirname, '../../models')
      const models = {}

      fs.readdirSync(modelsDir).forEach(file => {
        if (file.endsWith('.js') && file !== 'index.js') {
          const modelName = file.replace('.js', '')
          const content = fs.readFileSync(path.join(modelsDir, file), 'utf8')
          
          // 提取字段名（简化版）
          const fields = []
          const fieldRegex = /(\w+):\s*\{[^}]*type:\s*DataTypes\./g
          let match
          
          while ((match = fieldRegex.exec(content)) !== null) {
            fields.push(match[1])
          }
          
          models[modelName] = fields
        }
      })

      // 检查服务层使用的字段
      const servicesDir = path.join(__dirname, '../../services')
      const issues = []

      if (fs.existsSync(servicesDir)) {
        fs.readdirSync(servicesDir).forEach(file => {
          if (file.endsWith('.js')) {
            const content = fs.readFileSync(path.join(servicesDir, file), 'utf8')
            
            // 提取attributes中使用的字段
            const attributesRegex = /attributes:\s*\[([^\]]+)\]/g
            let match
            
            while ((match = attributesRegex.exec(content)) !== null) {
              const fieldsStr = match[1]
              const usedFields = fieldsStr
                .split(',')
                .map(f => f.trim().replace(/['"]/g, ''))
                .filter(f => f && f !== '*')

              // 检查每个字段是否在某个模型中定义
              usedFields.forEach(field => {
                let found = false
                for (const modelFields of Object.values(models)) {
                  if (modelFields.includes(field)) {
                    found = true
                    break
                  }
                }
                
                if (!found) {
                  issues.push(`${file}: 使用了未定义的字段 '${field}'`)
                }
              })
            }
          }
        })
      }

      if (issues.length === 0) {
        console.log('✅ 所有服务层字段都在模型中定义')
        this.passed.push('模型字段完整性检查')
      } else {
        console.log(`❌ 发现 ${issues.length} 个字段问题:`)
        issues.forEach(issue => console.log(`   - ${issue}`))
        this.errors.push(...issues)
      }
    } catch (error) {
      console.log(`⚠️ 检查失败: ${error.message}`)
      this.warnings.push(`模型字段检查失败: ${error.message}`)
    }

    console.log('')
  }

  /**
   * 检查2：路由注册情况
   */
  async checkRouteRegistration () {
    console.log('📊 检查2: 路由注册情况')
    console.log('-'.repeat(60))

    try {
      // 检查admin路由文件
      const adminIndexPath = path.join(__dirname, '../../routes/v4/unified-engine/admin/index.js')
      
      if (!fs.existsSync(adminIndexPath)) {
        console.log('❌ admin/index.js 文件不存在')
        this.errors.push('admin路由主文件缺失')
        console.log('')
        return
      }

      const content = fs.readFileSync(adminIndexPath, 'utf8')
      
      // 检查customer-service路由
      const hasCustomerServiceImport = content.includes("require('./customer_service')")
      const hasCustomerServiceMount = content.includes("router.use('/customer-service'")
      
      if (hasCustomerServiceImport && hasCustomerServiceMount) {
        console.log('✅ customer-service 路由已正确注册')
        this.passed.push('路由注册检查')
      } else {
        if (!hasCustomerServiceImport) {
          console.log('❌ 缺少customer_service路由导入')
          this.errors.push('customer-service路由未导入')
        }
        if (!hasCustomerServiceMount) {
          console.log('❌ 缺少customer-service路由挂载')
          this.errors.push('customer-service路由未挂载')
        }
      }
    } catch (error) {
      console.log(`⚠️ 检查失败: ${error.message}`)
      this.warnings.push(`路由注册检查失败: ${error.message}`)
    }

    console.log('')
  }

  /**
   * 检查3：Middleware引入路径
   */
  async checkMiddlewareImports () {
    console.log('📊 检查3: Middleware引入路径')
    console.log('-'.repeat(60))

    try {
      const routesDir = path.join(__dirname, '../../routes/v4/unified-engine/admin')
      const issues = []

      if (fs.existsSync(routesDir)) {
        fs.readdirSync(routesDir).forEach(file => {
          if (file.endsWith('.js') && file !== 'index.js') {
            const content = fs.readFileSync(path.join(routesDir, file), 'utf8')
            
            // 检查middleware引入
            if (content.includes('authMiddleware')) {
              issues.push(`${file}: 使用了不存在的 'authMiddleware'，应该使用 'middleware/auth'`)
            }

            // 检查正确的middleware引入
            const hasCorrectImport = content.includes("require('../../../../middleware/auth')")
            if (content.includes('authenticateToken') && !hasCorrectImport) {
              const currentImport = content.match(/require\(['"]([^'"]*auth[^'"]*)['"]\)/)
              if (currentImport) {
                this.warnings.push(`${file}: middleware引入路径可能需要检查: ${currentImport[1]}`)
              }
            }
          }
        })
      }

      if (issues.length === 0) {
        console.log('✅ middleware引入路径正确')
        this.passed.push('Middleware引入检查')
      } else {
        console.log(`❌ 发现 ${issues.length} 个引入问题:`)
        issues.forEach(issue => console.log(`   - ${issue}`))
        this.errors.push(...issues)
      }
    } catch (error) {
      console.log(`⚠️ 检查失败: ${error.message}`)
      this.warnings.push(`Middleware检查失败: ${error.message}`)
    }

    console.log('')
  }

  /**
   * 检查4：服务启动验证
   */
  async checkServiceStartup () {
    console.log('📊 检查4: 服务启动验证')
    console.log('-'.repeat(60))

    try {
      // 检查服务是否运行
      const result = execSync('pm2 list | grep restaurant-lottery-backend || echo "NOT_RUNNING"', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      })

      if (result.includes('online')) {
        console.log('✅ 服务正在运行')
        
        // 测试API端点
        try {
          execSync('curl -s http://localhost:3000/api/v4/admin/customer-service/sessions > /dev/null 2>&1', {
            timeout: 5000
          })
          console.log('✅ customer-service API端点可访问')
          this.passed.push('服务启动验证')
        } catch (error) {
          console.log('⚠️ customer-service API端点无响应（可能需要Token）')
          this.warnings.push('API端点测试失败，但可能是正常的（需要认证）')
        }
      } else if (result.includes('NOT_RUNNING')) {
        console.log('⚠️ 服务未运行，跳过API测试')
        this.warnings.push('后端服务未运行')
      } else {
        console.log('⚠️ 无法确定服务状态')
        this.warnings.push('无法确定服务状态')
      }
    } catch (error) {
      console.log(`⚠️ 检查失败: ${error.message}`)
      this.warnings.push(`服务状态检查失败: ${error.message}`)
    }

    console.log('')
  }

  /**
   * 生成最终报告
   */
  generateReport () {
    console.log('='.repeat(60))
    console.log('📋 检查完成')
    console.log('='.repeat(60))

    const totalChecks = this.passed.length + this.errors.length + this.warnings.length
    const passRate = totalChecks > 0 ? Math.round((this.passed.length / totalChecks) * 100) : 0

    console.log('')
    console.log(`✅ 通过: ${this.passed.length}`)
    console.log(`❌ 错误: ${this.errors.length}`)
    console.log(`⚠️ 警告: ${this.warnings.length}`)
    console.log(`📊 通过率: ${passRate}%`)
    console.log('')

    if (this.errors.length > 0) {
      console.log('🚨 需要立即修复的问题:')
      this.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`)
      })
      console.log('')
    }

    if (this.warnings.length > 0 && this.errors.length === 0) {
      console.log('💡 建议检查的项目:')
      this.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`)
      })
      console.log('')
    }

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('🎉 所有检查通过！项目状态良好。')
      console.log('')
    }

    console.log('💡 修复建议:')
    console.log('   1. 运行 npm run verify:all 获取详细报告')
    console.log('   2. 参考 docs/前后端协同开发完整性验证系统.md')
    console.log('   3. 修复问题后重新运行此检查')
    console.log('')

    // 返回退出码
    process.exit(this.errors.length > 0 ? 1 : 0)
  }
}

// 执行检查
const checker = new QuickIntegrityChecker()
checker.run().catch(error => {
  console.error('❌ 检查过程发生错误:', error)
  process.exit(1)
})
