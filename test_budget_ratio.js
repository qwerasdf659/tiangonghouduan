// 测试预算系数动态配置功能
const ConsumptionService = require('./services/ConsumptionService')

async function testBudgetRatio () {
  try {
    console.log('🧪 测试预算系数动态配置功能')
    console.log('='.repeat(50))

    // 测试1: 读取当前配置
    console.log('\n📖 测试1: 读取当前预算系数配置')
    const ratio = await ConsumptionService.getBudgetRatio()
    console.log(`✅ 当前预算系数: ${ratio}`)

    // 测试2: 模拟计算
    console.log('\n🧮 测试2: 模拟预算积分计算')
    const testAmounts = [100, 500, 1000, 2000]
    testAmounts.forEach(amount => {
      const budgetPoints = Math.round(amount * ratio)
      console.log(`   消费${amount}元 × ${ratio} = ${budgetPoints}预算积分`)
    })

    console.log('\n✅ 所有测试通过！')
    console.log('='.repeat(50))

    process.exit(0)
  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    process.exit(1)
  }
}

testBudgetRatio()
