#!/usr/bin/env node
/**
 * 前后端API路径一致性检查脚本
 * 检查前端调用的API是否在后端已实现
 *
 * 使用方式：
 * 1. 直接运行：node scripts/check-api-consistency.js
 * 2. npm命令：npm run check:api
 *
 * 创建时间：2025年11月23日
 */

const fs = require('fs')
const path = require('path')

/**
 * 从前端代码提取API调用
 * @param {string} dir - 前端代码目录
 * @returns {Set<string>} API路径集合
 */
function extractFrontendAPIs (dir) {
  const apis = new Set()

  function scanDir (currentDir) {
    if (!fs.existsSync(currentDir)) {
      return
    }

    const files = fs.readdirSync(currentDir)

    files.forEach(file => {
      const filePath = path.join(currentDir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        scanDir(filePath)
      } else if (file.endsWith('.html') || file.endsWith('.js')) {
        const content = fs.readFileSync(filePath, 'utf8')

        // 提取API调用模式
        const patterns = [
          // apiRequest('/api/xxx', ...)
          /apiRequest\(['"]([^'"]+)['"]/g,
          // fetch('/api/xxx', ...)
          /fetch\(['"]([^'"]+)['"]/g,
          // axios.get('/api/xxx'), axios.post('/api/xxx'), 等
          /axios\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g,
          // API_ENDPOINTS.XXX = '/api/xxx'
          /API_ENDPOINTS\.[\w.]+\s*[:=]\s*['"]([^'"]+)['"]/g,
          // '/api/xxx' 直接字符串（在API配置文件中）
          /['"](\api\/v\d+\/[^'"]+)['"]/g
        ]

        patterns.forEach(pattern => {
          let match
          while ((match = pattern.exec(content)) !== null) {
            // 获取API路径（可能在match[1]或match[2]）
            const api = match[2] || match[1]
            if (api && api.startsWith('/api/')) {
              // 移除路径参数（如 :id, :user_id）
              const cleanApi = api.replace(/:[^/]+/g, ':param')
              apis.add(cleanApi)
            }
          }
        })
      }
    })
  }

  scanDir(dir)
  return apis
}

/**
 * 从后端路由提取API定义
 * @param {string} dir - 后端路由目录
 * @returns {Map<string, string>} API路径到文件路径的映射
 */
function extractBackendAPIs (dir) {
  const apis = new Map()

  function scanDir (currentDir) {
    if (!fs.existsSync(currentDir)) {
      return
    }

    const files = fs.readdirSync(currentDir)

    files.forEach(file => {
      const filePath = path.join(currentDir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        scanDir(filePath)
      } else if (file.endsWith('.js')) {
        const content = fs.readFileSync(filePath, 'utf8')

        // 提取路由定义
        const patterns = [
          // router.get('/xxx', ...)
          /router\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g,
          // app.get('/xxx', ...)
          /app\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g
        ]

        patterns.forEach(pattern => {
          let match
          while ((match = pattern.exec(content)) !== null) {
            const method = match[1].toUpperCase()
            const route = match[2]

            // 标准化路径参数
            const cleanRoute = route.replace(/:[^/]+/g, ':param')
            const key = `${method} ${cleanRoute}`

            apis.set(key, filePath)
          }
        })

        // 检查app.use()挂载路由
        const usePattern = /app\.use\(['"]([^'"]+)['"],\s*require\(['"]([^'"]+)['"]\)/g
        let useMatch
        while ((useMatch = usePattern.exec(content)) !== null) {
          const basePath = useMatch[1]
          const routeFile = useMatch[2]

          // 记录路由挂载点
          apis.set(`USE ${basePath}`, `${filePath} -> ${routeFile}`)
        }
      }
    })
  }

  scanDir(dir)
  return apis
}

/**
 * 检查API路径是否匹配
 * @param {string} frontendAPI - 前端API路径
 * @param {Map} backendAPIs - 后端API映射
 * @returns {boolean} 是否匹配
 */
function isAPIMatched (frontendAPI, backendAPIs) {
  // 尝试匹配所有HTTP方法
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

  for (const method of methods) {
    const key = `${method} ${frontendAPI}`
    if (backendAPIs.has(key)) {
      return true
    }
  }

  // 检查是否有路由挂载点匹配
  for (const [key, value] of backendAPIs) {
    if (key.startsWith('USE ') && frontendAPI.startsWith(key.substring(4))) {
      return true
    }
  }

  return false
}

/**
 * 执行一致性检查
 */
function checkAPIConsistency () {
  console.log('🚀 开始前后端API路径一致性检查...')
  console.log('='.repeat(60))

  // 提取前端API调用
  const frontendDir = path.join(__dirname, '../public/admin')
  console.log(`📁 扫描前端目录: ${frontendDir}`)
  const frontendAPIs = extractFrontendAPIs(frontendDir)
  console.log(`📋 前端调用的API (${frontendAPIs.size}个):`)
  frontendAPIs.forEach(api => console.log(`   - ${api}`))

  // 提取后端API定义
  const backendDirs = [
    path.join(__dirname, '../routes')
  ]

  const backendFiles = [
    path.join(__dirname, '../app.js')
  ]

  console.log('\n📁 扫描后端目录:')
  backendDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      console.log(`   - ${dir}`)
    }
  })

  console.log('📄 扫描后端文件:')
  backendFiles.forEach(file => {
    if (fs.existsSync(file)) {
      console.log(`   - ${file}`)
    }
  })

  const backendAPIs = new Map()

  // 扫描目录
  backendDirs.forEach(dir => {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      const apis = extractBackendAPIs(dir)
      apis.forEach((file, api) => backendAPIs.set(api, file))
    }
  })

  // 扫描单个文件
  backendFiles.forEach(file => {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const content = fs.readFileSync(file, 'utf8')

      // 提取app.use()挂载路由
      const usePattern = /app\.use\(['"]([^'"]+)['"],\s*require\(['"]([^'"]+)['"]\)/g
      let match
      while ((match = usePattern.exec(content)) !== null) {
        const basePath = match[1]
        const routeFile = match[2]
        backendAPIs.set(`USE ${basePath}`, `${file} -> ${routeFile}`)
      }
    }
  })

  console.log(`\n📋 后端定义的API (${backendAPIs.size}个):`)
  const displayCount = Math.min(backendAPIs.size, 20)
  let count = 0
  for (const [api, file] of backendAPIs) {
    if (count >= displayCount) {
      console.log(`   ... 还有 ${backendAPIs.size - displayCount} 个API`)
      break
    }
    console.log(`   - ${api}`)
    count++
  }

  // 检查前端API是否在后端实现
  console.log('\n🔍 检查前端API是否已实现...')
  const missingAPIs = []
  const matchedAPIs = []

  frontendAPIs.forEach(api => {
    if (isAPIMatched(api, backendAPIs)) {
      matchedAPIs.push(api)
    } else {
      missingAPIs.push(api)
    }
  })

  // 输出检查结果
  console.log('\n' + '='.repeat(60))
  console.log('📊 检查结果汇总:')
  console.log(`   📄 前端API总数: ${frontendAPIs.size}`)
  console.log(`   ✅ 已实现: ${matchedAPIs.length}个`)
  console.log(`   ❌ 未实现: ${missingAPIs.length}个`)

  if (missingAPIs.length > 0) {
    console.error(`\n❌ 前端调用但后端未实现的API (${missingAPIs.length}个):`)
    missingAPIs.forEach(api => {
      console.error(`   - ${api}`)
    })

    console.log('\n💡 修复建议:')
    console.log('   1. 在后端routes目录实现这些API接口')
    console.log('   2. 或者修改前端代码，使用已存在的API')
    console.log('   3. 确保前后端API路径完全一致（包括/api/v4前缀）')
    console.log('   4. 使用API配置文件（api-config.js）统一管理API路径')

    console.log('='.repeat(60))
    console.error('\n❌ API路径一致性检查失败')
    process.exit(1)
  }

  console.log('\n✅ 所有前端API已在后端实现')
  console.log('='.repeat(60))
  console.log('\n✅ API路径一致性检查通过')
  process.exit(0)
}

// 执行检查
if (require.main === module) {
  checkAPIConsistency()
}

module.exports = { extractFrontendAPIs, extractBackendAPIs, checkAPIConsistency }
