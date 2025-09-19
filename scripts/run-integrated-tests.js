#!/usr/bin/env node

/**
 * 餐厅积分抽奖系统V4.0 - 集成测试启动器
 * 集成项目验证和完整测试套件
 * 创建时间：2025年01月21日 北京时间
 */

const UnifiedTestManager = require('../tests/UnifiedTestManager')
const moment = require('moment-timezone')

async function runIntegratedTests () {
  console.log('🚀 餐厅积分抽奖系统V4.0 集成测试启动')
  console.log('='.repeat(60))
  console.log(`📅 开始时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')}`)

  try {
    const testManager = new UnifiedTestManager()

    console.log('\n🎯 测试套件配置:')
    console.log('📋 测试优先级排序:')

    const sortedSuites = Object.entries(testManager.testSuites).sort(
      ([, a], [, b]) => a.priority - b.priority
    )

    sortedSuites.forEach(([_key, suite], index) => {
      console.log(`  ${index + 1}. ${suite.name} (优先级: ${suite.priority})`)
    })

    console.log('\n🚀 开始执行集成测试...')

    // 运行完整测试套件
    const result = await testManager.runCompleteTestSuite()

    console.log('\n🎉 集成测试完成!')
    console.log(`📊 成功率: ${((result.passedSuites / result.totalSuites) * 100).toFixed(1)}%`)
    console.log(`⏱️  总耗时: ${(result.duration / 1000).toFixed(1)}秒`)

    // 输出覆盖率汇总
    console.log('\n📈 V4架构覆盖汇总:')
    Object.entries(result.coverage).forEach(([component, coverage]) => {
      const emoji = coverage >= 80 ? '🟢' : coverage >= 50 ? '🟡' : '🔴'
      console.log(`  ${emoji} ${component}: ${coverage}%`)
    })

    if (result.success) {
      console.log('\n✅ 所有测试通过！系统状态良好!')
      process.exit(0)
    } else {
      console.log('\n⚠️  部分测试失败，请查看详细报告')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n💥 集成测试执行失败:', error.message)
    console.error('错误详情:', error.stack)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runIntegratedTests()
}

module.exports = { runIntegratedTests }
