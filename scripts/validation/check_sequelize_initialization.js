#!/usr/bin/env node
/**
 * Sequelize 初始化检查脚本 - 防止重复连接池配置
 * 天工商户营销平台 V4.0
 * 创建时间：2025年12月30日 北京时间
 *
 * 功能说明：
 * - 扫描仓库中所有 `new Sequelize(` 的出现位置
 * - 验证是否在白名单内（仅允许 config/database.js 等）
 * - 检测到违规初始化时直接失败（CI/启动前检查）
 *
 * 使用方式：
 * - 本地检查：node scripts/validation/check-sequelize-initialization.js
 * - CI 集成：npm run check:sequelize-init
 * - 启动前检查：npm run validate:prestart
 *
 * 设计原则：
 * - 单一配置源（Single Source of Truth）
 * - 唯一允许 new Sequelize 的地方：config/database.js
 * - 其他地方需要 DB：require('../config/database').sequelize 或 require('../models').sequelize
 */

'use strict'

const fs = require('fs').promises
const path = require('path')
const { execSync } = require('child_process')

/**
 * 白名单配置：允许出现 new Sequelize 的文件
 *
 * 说明：
 * - config/database.js：主配置文件（必须）
 * - .sequelizerc：Sequelize CLI 配置文件
 * - migrations/*.js：迁移文件（Sequelize CLI 生成）
 * - 其他任何文件都不允许自建 Sequelize 实例
 */
const ALLOWED_FILES = [
  'config/database.js',
  '.sequelizerc',
  /migrations\/\d{14}-.*\.js$/ // 迁移文件正则
]

/**
 * 扫描目录配置
 */
const SCAN_CONFIG = {
  // 需要扫描的目录
  includeDirs: [
    'config',
    'models',
    'services',
    'routes',
    'middleware',
    'utils',
    'scripts',
    'migrations'
  ],
  // 排除的目录
  excludeDirs: ['node_modules', '.git', 'logs', 'coverage', 'public', 'uploads', 'docs'],
  // 扫描的文件扩展名
  extensions: ['.js']
}

/**
 * 检查文件是否在白名单内
 * @param {string} filePath - 相对于项目根目录的文件路径
 * @returns {boolean} 是否在白名单内
 */
function isAllowedFile(filePath) {
  // 标准化路径（统一使用正斜杠）
  const normalizedPath = filePath.replace(/\\/g, '/')

  return ALLOWED_FILES.some(pattern => {
    if (typeof pattern === 'string') {
      return normalizedPath === pattern || normalizedPath.endsWith('/' + pattern)
    } else if (pattern instanceof RegExp) {
      return pattern.test(normalizedPath)
    }
    return false
  })
}

/**
 * 扫描单个文件查找 new Sequelize 出现位置
 * @param {string} filePath - 文件绝对路径
 * @param {string} projectRoot - 项目根目录
 * @returns {Promise<Array>} 匹配结果数组
 */
async function scanFile(filePath, projectRoot) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const relativePath = path.relative(projectRoot, filePath)

    // 正则匹配 new Sequelize( 及其上下文
    const pattern = /new\s+Sequelize\s*\(/g
    const matches = []
    let match

    while ((match = pattern.exec(content)) !== null) {
      // 获取匹配位置的行号
      const beforeMatch = content.substring(0, match.index)
      const lineNumber = beforeMatch.split('\n').length

      // 🔴 跳过注释和字符串字面量中的匹配
      const currentLine = content.split('\n')[lineNumber - 1]
      if (!currentLine) continue

      // 跳过单行注释
      if (currentLine.trim().startsWith('//')) continue
      if (currentLine.trim().startsWith('*')) continue

      // 跳过字符串字面量（简单检测：行内包含引号且 new Sequelize 在引号内）
      const beforeNew = currentLine.substring(0, currentLine.indexOf('new Sequelize'))
      const quoteCount = (beforeNew.match(/['"]/g) || []).length
      if (quoteCount % 2 === 1) continue // 奇数个引号说明在字符串内

      // 获取上下文（前后各 2 行）
      const lines = content.split('\n')
      const contextStart = Math.max(0, lineNumber - 3)
      const contextEnd = Math.min(lines.length, lineNumber + 2)
      const context = lines.slice(contextStart, contextEnd).join('\n')

      matches.push({
        file: relativePath,
        line: lineNumber,
        context: context,
        isAllowed: isAllowedFile(relativePath)
      })
    }

    return matches
  } catch (error) {
    console.warn(`⚠️ 扫描文件失败: ${filePath} - ${error.message}`)
    return []
  }
}

/**
 * 递归扫描目录
 * @param {string} dir - 目录路径
 * @param {string} projectRoot - 项目根目录
 * @returns {Promise<Array>} 所有匹配结果
 */
async function scanDirectory(dir, projectRoot) {
  const results = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(projectRoot, fullPath)

      // 跳过排除目录
      if (SCAN_CONFIG.excludeDirs.some(excluded => relativePath.startsWith(excluded))) {
        continue
      }

      if (entry.isDirectory()) {
        // 递归扫描子目录
        const subResults = await scanDirectory(fullPath, projectRoot)
        results.push(...subResults)
      } else if (entry.isFile()) {
        // 检查文件扩展名
        const ext = path.extname(entry.name)
        if (SCAN_CONFIG.extensions.includes(ext)) {
          const fileResults = await scanFile(fullPath, projectRoot)
          results.push(...fileResults)
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️ 扫描目录失败: ${dir} - ${error.message}`)
  }

  return results
}

/**
 * 主检查函数
 */
async function checkSequelizeInitialization() {
  console.log('🔍 Sequelize 初始化检查开始...\n')
  console.log('📋 扫描配置:')
  console.log(`  包含目录: ${SCAN_CONFIG.includeDirs.join(', ')}`)
  console.log(`  排除目录: ${SCAN_CONFIG.excludeDirs.join(', ')}`)
  console.log(`  白名单文件: ${ALLOWED_FILES.length} 个\n`)

  const projectRoot = path.resolve(__dirname, '../..')
  const allMatches = []

  // 扫描所有配置的目录
  for (const dir of SCAN_CONFIG.includeDirs) {
    const dirPath = path.join(projectRoot, dir)
    try {
      await fs.access(dirPath)
      const matches = await scanDirectory(dirPath, projectRoot)
      allMatches.push(...matches)
    } catch (error) {
      console.warn(`⚠️ 目录不存在或无法访问: ${dir}`)
    }
  }

  // 分类统计
  const allowedMatches = allMatches.filter(m => m.isAllowed)
  const violationMatches = allMatches.filter(m => !m.isAllowed)

  console.log('📊 扫描结果统计:')
  console.log(`  总发现: ${allMatches.length} 处 new Sequelize`)
  console.log(`  白名单内: ${allowedMatches.length} 处 ✅`)
  console.log(
    `  违规初始化: ${violationMatches.length} 处 ${violationMatches.length > 0 ? '🔴' : '✅'}\n`
  )

  // 显示白名单内的初始化（正常）
  if (allowedMatches.length > 0) {
    console.log('✅ 白名单内的初始化（正常）:')
    allowedMatches.forEach((match, index) => {
      console.log(`  ${index + 1}. ${match.file}:${match.line}`)
    })
    console.log('')
  }

  // 显示违规初始化（错误）
  if (violationMatches.length > 0) {
    console.log('🔴 发现违规的 Sequelize 初始化:\n')

    violationMatches.forEach((match, index) => {
      console.log(`${index + 1}. 文件: ${match.file}`)
      console.log(`   行号: ${match.line}`)
      console.log(`   上下文:`)
      console.log('   ```javascript')
      console.log(
        match.context
          .split('\n')
          .map(line => '   ' + line)
          .join('\n')
      )
      console.log('   ```\n')
    })

    console.log('❌ 检查失败：发现违规的 Sequelize 初始化')
    console.log('\n💡 修复建议:')
    console.log('  1. 删除自建的 new Sequelize(...) 代码')
    console.log("  2. 改用: const { sequelize } = require('../config/database')")
    console.log("  3. 或者: const { sequelize } = require('../models')")
    console.log('  4. 如果确实需要独立配置，请联系架构师评审并添加到白名单\n')

    console.log('🔴 单一配置源原则（Single Source of Truth）:')
    console.log('  - 唯一允许 new Sequelize 的地方: config/database.js')
    console.log('  - 所有其他地方必须复用主 sequelize 实例')
    console.log('  - 避免重复连接池配置导致资源浪费和配置不一致\n')

    process.exit(1)
  }

  console.log('✅ 检查通过：所有 Sequelize 初始化都符合规范\n')
  console.log('📋 规范要求:')
  console.log('  ✅ 单一配置源：config/database.js')
  console.log('  ✅ 其他地方复用主 sequelize')
  console.log('  ✅ 避免重复连接池配置')
  console.log('  ✅ 统一连接池参数管理\n')

  return {
    success: true,
    total: allMatches.length,
    allowed: allowedMatches.length,
    violations: violationMatches.length
  }
}

// 命令行执行
if (require.main === module) {
  checkSequelizeInitialization().catch(error => {
    console.error('❌ 检查执行失败:', error.message)
    process.exit(1)
  })
}

module.exports = { checkSequelizeInitialization, isAllowedFile }
