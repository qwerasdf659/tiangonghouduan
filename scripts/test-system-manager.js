#!/usr/bin/env node

/**
 * 系统管理模块测试脚本
 * 测试系统管理模块的功能和自动修复能力
 */

require('dotenv').config()
const UnifiedSystemManager = require('./core/UnifiedSystemManager')

async function testSystemManager () {
  console.log('=== 测试V4系统管理模块 ===')
  console.log(`测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

  const systemManager = new UnifiedSystemManager()

  try {
    // 1. 统一系统管理和优化
    console.log('\n🔧 执行统一系统管理...')
    await systemManager.runCompleteSystemManagement()
    console.log('✅ 统一系统管理完成')

    // 2. 显示最终状态
    console.log('\n📊 最终系统状态:')
    console.log('数据库:', systemManager.systemStatus.database)
    console.log('Redis:', systemManager.systemStatus.redis)
    console.log('API路由:', systemManager.systemStatus.api)
    console.log('权限系统:', systemManager.systemStatus.permissions)
    console.log(`发现问题: ${systemManager.detectedIssues.length} 个`)

    console.log('\n🎉 V4系统管理模块测试完成')
  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  testSystemManager()
}

module.exports = testSystemManager
