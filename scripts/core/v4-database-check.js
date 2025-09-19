#!/usr/bin/env node
/**
 * V4数据库检查包装脚本
 * 调用V4SystemManager的增强数据库检查功能
 */

require('dotenv').config()
const UnifiedSystemManager = require('../../modules/UnifiedSystemManager')

async function runDatabaseCheck () {
  console.log('🗄️ === V4数据库检查开始 ===')
  console.log(`检查时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

  const systemManager = new UnifiedSystemManager()

  try {
    // 执行数据库健康检查
    await systemManager.checkDatabaseHealth()

    // 显示检查结果
    console.log('\n📊 数据库检查总结:')
    console.log(`状态: ${systemManager.systemStatus.database}`)
    console.log(`发现问题: ${systemManager.detectedIssues.length}个`)

    if (systemManager.detectedIssues.length > 0) {
      console.log('\n⚠️ 发现的问题:')
      systemManager.detectedIssues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue.type}: ${issue.description}`)
      })
    }

    console.log('\n✅ V4数据库检查完成')
    process.exit(0)
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  runDatabaseCheck()
}

module.exports = runDatabaseCheck
