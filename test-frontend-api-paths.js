#!/usr/bin/env node
/**
 * 前端API路径验证脚本
 * 检查前端JS文件中是否还存在旧的API路径
 */

const fs = require('fs')
const path = require('path')

// 颜色输出
const colors = {
  green: text => `\x1b[32m${text}\x1b[0m`,
  red: text => `\x1b[31m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
  cyan: text => `\x1b[36m${text}\x1b[0m`
}

// 需要检查的旧路径模式
const OLD_PATTERNS = [
  '/api/v4/admin/', // 旧的admin路径
  '/api/v4/admin/' // 应该使用 /api/v4/console/
]

// 正确的路径映射
const CORRECT_PATHS = {
  用户列表: '/api/v4/console/user-management/users',
  用户详情: '/api/v4/console/user-management/users/:user_id',
  更新用户角色: '/api/v4/console/user-management/users/:user_id/role',
  更新用户状态: '/api/v4/console/user-management/users/:user_id/status',
  角色列表: '/api/v4/console/user-management/roles',
  系统仪表板: '/api/v4/console/system/dashboard',
  用户层级: '/api/v4/console/user-hierarchy',
  商家积分: '/api/v4/console/merchant-points',
  弹窗Banner: '/api/v4/console/popup-banners',
  图片管理: '/api/v4/console/images'
}

// 递归扫描目录
function scanDirectory(dir, issues = []) {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      // 跳过 vendor 和 node_modules
      if (file !== 'vendor' && file !== 'node_modules') {
        scanDirectory(filePath, issues)
      }
    } else if (file.endsWith('.js')) {
      checkFile(filePath, issues)
    }
  }

  return issues
}

// 检查单个文件
function checkFile(filePath, issues) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')

  lines.forEach((line, lineNum) => {
    // 检查旧的admin路径
    if (line.includes('/api/v4/admin/')) {
      issues.push({
        file: filePath,
        line: lineNum + 1,
        content: line.trim(),
        issue: '使用了旧的 /api/v4/admin/ 路径'
      })
    }
  })
}

// 主函数
function main() {
  console.log(colors.yellow('\n========================================'))
  console.log(colors.yellow('  前端API路径验证脚本'))
  console.log(colors.yellow('========================================'))

  const adminJsDir = path.join(__dirname, 'public/admin/js')

  if (!fs.existsSync(adminJsDir)) {
    console.log(colors.red('❌ 目录不存在: ' + adminJsDir))
    process.exit(1)
  }

  console.log(`扫描目录: ${adminJsDir}\n`)

  const issues = scanDirectory(adminJsDir)

  if (issues.length === 0) {
    console.log(colors.green('✅ 所有前端JS文件都使用正确的API路径'))
    console.log(colors.green('   没有发现旧的 /api/v4/admin/ 路径'))
  } else {
    console.log(colors.red(`❌ 发现 ${issues.length} 处需要修复的问题:\n`))

    issues.forEach((issue, index) => {
      console.log(colors.red(`${index + 1}. ${issue.file}:${issue.line}`))
      console.log(`   问题: ${issue.issue}`)
      console.log(`   内容: ${issue.content.substring(0, 100)}...`)
      console.log('')
    })
  }

  console.log(colors.yellow('\n========================================'))
  console.log(colors.yellow('  正确的API路径参考'))
  console.log(colors.yellow('========================================'))

  Object.entries(CORRECT_PATHS).forEach(([name, path]) => {
    console.log(`${colors.cyan(name)}: ${path}`)
  })

  console.log('')

  return issues.length
}

process.exit(main())
