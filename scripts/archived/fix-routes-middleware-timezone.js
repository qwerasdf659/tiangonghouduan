/**
 * 修复routes和middleware的时间处理
 * 创建时间：2025年10月11日
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)

async function findFilesWithIssues () {
  console.log('🔍 查找routes和middleware中的时间处理问题...\n')

  const issues = {
    routes: [],
    middleware: []
  }

  // 查找routes目录中的问题
  try {
    const { stdout: routesNewDate } = await execPromise(
      'grep -rn \'new Date()\' routes/ --include=\'*.js\' || true'
    )
    if (routesNewDate.trim()) {
      console.log('routes中的new Date()使用:')
      console.log(routesNewDate)
      routesNewDate.split('\n').filter(l => l.trim()).forEach(line => {
        const match = line.match(/^([^:]+):/)
        if (match) issues.routes.push(match[1])
      })
    }
  } catch (e) {}

  try {
    const { stdout: routesDateNow } = await execPromise(
      'grep -rn \'Date.now()\' routes/ --include=\'*.js\' || true'
    )
    if (routesDateNow.trim()) {
      console.log('routes中的Date.now()使用:')
      console.log(routesDateNow)
      routesDateNow.split('\n').filter(l => l.trim()).forEach(line => {
        const match = line.match(/^([^:]+):/)
        if (match) issues.routes.push(match[1])
      })
    }
  } catch (e) {}

  // 查找middleware目录中的问题
  try {
    const { stdout: middlewareNewDate } = await execPromise(
      'grep -rn \'new Date()\' middleware/ --include=\'*.js\' || true'
    )
    if (middlewareNewDate.trim()) {
      console.log('middleware中的new Date()使用:')
      console.log(middlewareNewDate)
      middlewareNewDate.split('\n').filter(l => l.trim()).forEach(line => {
        const match = line.match(/^([^:]+):/)
        if (match) issues.middleware.push(match[1])
      })
    }
  } catch (e) {}

  try {
    const { stdout: middlewareDateNow } = await execPromise(
      'grep -rn \'Date.now()\' middleware/ --include=\'*.js\' || true'
    )
    if (middlewareDateNow.trim()) {
      console.log('middleware中的Date.now()使用:')
      console.log(middlewareDateNow)
      middlewareDateNow.split('\n').filter(l => l.trim()).forEach(line => {
        const match = line.match(/^([^:]+):/)
        if (match) issues.middleware.push(match[1])
      })
    }
  } catch (e) {}

  // 去重
  issues.routes = [...new Set(issues.routes)]
  issues.middleware = [...new Set(issues.middleware)]

  return issues
}

function smartFixFile (filePath) {
  console.log(`\n修复: ${filePath}`)

  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false
  const changes = []

  // 1. 确保已导入BeijingTimeHelper
  if (!content.includes('BeijingTimeHelper')) {
    const lines = content.split('\n')
    let insertIndex = 0

    // 找到最后一个require语句
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('require(') && !lines[i].includes('//')) {
        insertIndex = i + 1
      }
      if (lines[i].includes('module.exports') || lines[i].includes('router.')) {
        break
      }
    }

    // 计算相对路径
    const fileDir = path.dirname(filePath)
    const rootDir = process.cwd()
    const relativePath = path.relative(fileDir, path.join(rootDir, 'utils/timeHelper'))
    const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath

    lines.splice(insertIndex, 0, `const BeijingTimeHelper = require('${importPath}')`)
    content = lines.join('\n')
    modified = true
    changes.push('添加BeijingTimeHelper导入')
  }

  // 2. 替换赋值中的new Date()
  const oldContent1 = content
  content = content.replace(/:\s*new Date\(\)([,\s})])/g, ': BeijingTimeHelper.createDatabaseTime()$1')
  if (content !== oldContent1) {
    changes.push('替换赋值中的new Date()')
    modified = true
  }

  // 3. 替换时间戳获取
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.includes('BeijingTimeHelper')) continue

    // 常见的Date.now()使用场景
    if (/const\s+\w+\s*=\s*Date\.now\(\)/.test(line)) {
      lines[i] = line.replace(/Date\.now\(\)/g, 'BeijingTimeHelper.timestamp()')
      modified = true
      changes.push('替换时间戳获取')
    }

    if (/Date\.now\(\)\s*[-+]/.test(line) || /[-+]\s*Date\.now\(\)/.test(line)) {
      lines[i] = line.replace(/Date\.now\(\)/g, 'BeijingTimeHelper.timestamp()')
      modified = true
      changes.push('替换时间差计算')
    }
  }
  content = lines.join('\n')

  // 保存修改
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log('  修改内容:')
    changes.forEach(change => console.log(`    ✓ ${change}`))
    console.log('  ✅ 修复完成')
    return true
  } else {
    console.log('  ⏭️  无需修改')
    return false
  }
}

async function main () {
  console.log('🔧 开始修复routes和middleware的时间处理...\n')

  const issues = await findFilesWithIssues()

  console.log('\n' + '='.repeat(60))
  console.log('📊 需要修复的文件统计:')
  console.log(`   Routes: ${issues.routes.length}个文件`)
  console.log(`   Middleware: ${issues.middleware.length}个文件`)
  console.log('='.repeat(60) + '\n')

  let fixedCount = 0

  // 修复routes
  console.log('修复Routes文件:')
  for (const file of issues.routes) {
    const fullPath = path.join(process.cwd(), file)
    if (fs.existsSync(fullPath)) {
      if (smartFixFile(fullPath)) {
        fixedCount++
      }
    }
  }

  // 修复middleware
  console.log('\n修复Middleware文件:')
  for (const file of issues.middleware) {
    const fullPath = path.join(process.cwd(), file)
    if (fs.existsSync(fullPath)) {
      if (smartFixFile(fullPath)) {
        fixedCount++
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✅ 修复完成！共修复${fixedCount}个文件`)
  console.log('='.repeat(60))
  console.log('\n💡 下一步:')
  console.log('1. 运行 npm run lint 检查代码质量')
  console.log('2. 运行 npm test 执行测试\n')
}

// 执行
main().catch(error => {
  console.error('❌ 错误:', error.message)
  process.exit(1)
})
