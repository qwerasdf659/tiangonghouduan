#!/usr/bin/env node

/**
 * 缓存配置自动检查工具
 *
 * @description 检查项目中的缓存配置是否符合规范
 * @file scripts/check-cache-config.js
 * @date 2025-11-23
 */

const fs = require('fs')
const path = require('path')

console.log('🔍 缓存配置检查工具 v1.0.0')
console.log('='.repeat(50))

/**
 * 检查app.js中的静态文件配置
 *
 * @returns {Array<Object>} 问题列表
 */
function checkAppConfig () {
  const appFile = path.join(process.cwd(), 'app.js')

  if (!fs.existsSync(appFile)) {
    return [{
      type: 'ERROR',
      file: 'app.js',
      message: 'app.js文件不存在'
    }]
  }

  const content = fs.readFileSync(appFile, 'utf8')
  const issues = []

  // 检查1：是否使用了环境感知配置
  if (!content.includes('process.env.NODE_ENV')) {
    issues.push({
      type: 'WARNING',
      file: 'app.js',
      message: '未使用环境感知配置（建议使用process.env.NODE_ENV检查）'
    })
  }

  // 检查2：是否在开发环境禁用缓存
  if (!content.includes('no-cache, no-store, must-revalidate')) {
    issues.push({
      type: 'WARNING',
      file: 'app.js',
      message: '未明确禁用开发环境缓存（建议设置Cache-Control响应头）'
    })
  }

  // 检查3：是否硬编码了maxAge（不推荐的做法）
  const staticConfig = content.match(/express\.static\([^)]+\{[^}]+\}/gs)
  if (staticConfig) {
    staticConfig.forEach(config => {
      if (config.includes('maxAge:') && !config.includes('NODE_ENV')) {
        issues.push({
          type: 'WARNING',
          file: 'app.js',
          message: '可能硬编码了maxAge值（建议根据环境动态调整）'
        })
      }
    })
  }

  return issues
}

/**
 * 检查环境变量文件
 *
 * @returns {Array<Object>} 问题列表
 */
function checkEnvFile () {
  const envFile = path.join(process.cwd(), '.env')

  if (!fs.existsSync(envFile)) {
    return [{
      type: 'WARNING',
      file: '.env',
      message: '.env文件不存在（建议创建.env文件配置环境变量）'
    }]
  }

  const content = fs.readFileSync(envFile, 'utf8')
  const issues = []

  // 检查必需的环境变量
  const required = ['NODE_ENV', 'PORT']
  required.forEach(key => {
    if (!content.includes(`${key}=`)) {
      issues.push({
        type: 'WARNING',
        file: '.env',
        message: `缺少推荐的环境变量: ${key}`
      })
    }
  })

  return issues
}

/**
 * 检查环境配置管理器
 *
 * @returns {Array<Object>} 问题列表
 */
function checkEnvironmentConfig () {
  const configFile = path.join(process.cwd(), 'config', 'environment.js')

  if (!fs.existsSync(configFile)) {
    return [{
      type: 'INFO',
      file: 'config/environment.js',
      message: '未找到环境配置管理器（建议创建统一的环境配置管理）'
    }]
  }

  return []
}

/**
 * 运行所有检查
 *
 * @returns {number} 退出码（0=成功，1=有错误）
 */
function runChecks () {
  const allIssues = [
    ...checkAppConfig(),
    ...checkEnvFile(),
    ...checkEnvironmentConfig()
  ]

  // 统计各类型问题数量
  const errorCount = allIssues.filter(i => i.type === 'ERROR').length
  const warningCount = allIssues.filter(i => i.type === 'WARNING').length
  const infoCount = allIssues.filter(i => i.type === 'INFO').length

  if (allIssues.length === 0) {
    console.log('✅ 所有缓存配置检查通过！')
    console.log('='.repeat(50))
    return 0
  }

  console.log(`📊 检查结果: ${errorCount}个错误, ${warningCount}个警告, ${infoCount}个提示\n`)

  // 按类型分组显示问题
  const errorIssues = allIssues.filter(i => i.type === 'ERROR')
  const warningIssues = allIssues.filter(i => i.type === 'WARNING')
  const infoIssues = allIssues.filter(i => i.type === 'INFO')

  if (errorIssues.length > 0) {
    console.log('❌ 错误:')
    errorIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. [${issue.file}] ${issue.message}`)
    })
    console.log('')
  }

  if (warningIssues.length > 0) {
    console.log('⚠️  警告:')
    warningIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. [${issue.file}] ${issue.message}`)
    })
    console.log('')
  }

  if (infoIssues.length > 0) {
    console.log('ℹ️  提示:')
    infoIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. [${issue.file}] ${issue.message}`)
    })
    console.log('')
  }

  console.log('='.repeat(50))

  if (errorCount > 0) {
    console.log('❌ 请修复以上错误后再继续')
    return 1
  } else if (warningCount > 0) {
    console.log('⚠️  建议修复以上警告以获得最佳实践')
    return 0 // 警告不阻止流程
  } else {
    console.log('✅ 所有检查通过（有提示信息但不影响运行）')
    return 0
  }
}

// 执行检查
const exitCode = runChecks()
process.exit(exitCode)
