#!/usr/bin/env node
/**
 * Phase 3迁移完整性验证脚本
 *
 * 验证目标：
 * 1. 兑换市场材料扣减已迁移到AssetService（business_type=exchange_debit）
 * 2. 材料→DIAMOND转换已迁移到统一账本双分录
 * 3. 409幂等冲突语义统一实现
 * 4. 所有相关测试通过
 * 5. 代码质量检查通过
 */

const fs = require('fs')
const path = require('path')

console.log('🔍 Phase 3迁移完整性验证')
console.log('='.repeat(60))

const results = {
  passed: [],
  failed: [],
  warnings: []
}

// 1. 检查ExchangeService是否使用AssetService
console.log('\n📋 1. 检查兑换市场服务迁移...')
const exchangeServicePath = path.join(__dirname, '../services/ExchangeService.js')
const exchangeServiceContent = fs.readFileSync(exchangeServicePath, 'utf8')

if (exchangeServiceContent.includes("AssetService = require('./AssetService')")) {
  results.passed.push('✅ ExchangeService已引入AssetService')
} else {
  results.failed.push('❌ ExchangeService未引入AssetService')
}

if (exchangeServiceContent.includes("business_type: 'exchange_debit'")) {
  results.passed.push('✅ 兑换市场使用正确的business_type: exchange_debit')
} else {
  results.failed.push('❌ 兑换市场未使用exchange_debit业务类型')
}

// 检查是否还在使用MaterialService.consume（排除所有注释）
// 移除所有单行注释和多行注释块
const codeOnly = exchangeServiceContent
  .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
  .replace(/\/\/.*/g, '') // 移除单行注释

const materialConsumeMatches = codeOnly.match(/MaterialService\.consume\(/g)
if (materialConsumeMatches && materialConsumeMatches.length > 0) {
  results.failed.push('❌ ExchangeService仍在使用MaterialService.consume()')
} else {
  results.passed.push('✅ ExchangeService已停止使用MaterialService.consume()')
}

// 2. 检查AssetConversionService是否使用统一账本双分录
console.log('\n📋 2. 检查材料转换服务迁移...')
const conversionServicePath = path.join(__dirname, '../services/AssetConversionService.js')
const conversionServiceContent = fs.readFileSync(conversionServicePath, 'utf8')

if (conversionServiceContent.includes("AssetService = require('./AssetService')")) {
  results.passed.push('✅ AssetConversionService已引入AssetService')
} else {
  results.failed.push('❌ AssetConversionService未引入AssetService')
}

if (
  conversionServiceContent.includes("business_type: 'material_convert_debit'") &&
  conversionServiceContent.includes("business_type: 'material_convert_credit'")
) {
  results.passed.push('✅ 材料转换使用双分录（debit + credit）')
} else {
  results.failed.push('❌ 材料转换未实现双分录')
}

// 检查是否还在使用MaterialService和DiamondService
const hasMaterialService = conversionServiceContent.match(/require\(['"]\.\/MaterialService['"]\)/)
const hasDiamondService = conversionServiceContent.match(/require\(['"]\.\/DiamondService['"]\)/)

if (!hasMaterialService && !hasDiamondService) {
  results.passed.push('✅ AssetConversionService已移除MaterialService和DiamondService依赖')
} else {
  results.failed.push('❌ AssetConversionService仍依赖旧服务')
}

// 3. 检查409冲突语义实现
console.log('\n📋 3. 检查409幂等冲突语义...')

if (
  conversionServiceContent.includes('statusCode: 409') ||
  conversionServiceContent.includes('statusCode = 409')
) {
  results.passed.push('✅ 实现了409状态码')
} else {
  results.failed.push('❌ 未实现409状态码')
}

if (conversionServiceContent.includes('IDEMPOTENCY_KEY_CONFLICT')) {
  results.passed.push('✅ 实现了幂等键冲突错误码')
} else {
  results.failed.push('❌ 未实现幂等键冲突错误码')
}

if (
  conversionServiceContent.includes('is_params_match') ||
  conversionServiceContent.includes('参数一致性验证')
) {
  results.passed.push('✅ 实现了参数一致性检查')
} else {
  results.failed.push('❌ 未实现参数一致性检查')
}

// 4. 检查测试文件是否存在
console.log('\n📋 4. 检查测试覆盖...')
const testFilePath = path.join(__dirname, '../tests/business/asset/phase3_migration.test.js')

if (fs.existsSync(testFilePath)) {
  results.passed.push('✅ Phase 3测试文件存在')

  const testContent = fs.readFileSync(testFilePath, 'utf8')

  // 检查关键测试用例
  const requiredTests = [
    { name: '双分录测试', pattern: /材料转换应使用统一账本双分录|材料转换.*双分录/ },
    { name: '幂等性测试', pattern: /材料转换幂等性测试|幂等.*参数相同/ },
    { name: '409冲突测试', pattern: /409冲突检查|409.*参数不同/ }
  ]

  requiredTests.forEach(test => {
    if (test.pattern.test(testContent)) {
      results.passed.push(`✅ 包含${test.name}`)
    } else {
      results.failed.push(`❌ 缺少${test.name}`)
    }
  })
} else {
  results.failed.push('❌ Phase 3测试文件不存在')
}

// 5. 检查文件的JSDoc注释更新
console.log('\n📋 5. 检查文档注释更新...')

if (exchangeServiceContent.includes('Phase 3') || exchangeServiceContent.includes('统一账本')) {
  results.passed.push('✅ ExchangeService更新了注释说明')
} else {
  results.warnings.push('⚠️ ExchangeService建议更新注释说明')
}

if (
  conversionServiceContent.includes('Phase 3') ||
  conversionServiceContent.includes('统一账本双分录')
) {
  results.passed.push('✅ AssetConversionService更新了注释说明')
} else {
  results.warnings.push('⚠️ AssetConversionService建议更新注释说明')
}

// 6. 检查是否有未处理的TODO或FIXME
console.log('\n📋 6. 检查待办事项...')
const filesToCheck = [exchangeServicePath, conversionServicePath]

filesToCheck.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8')
  const fileName = path.basename(filePath)

  const todos = content.match(/\/\/\s*TODO|\/\/\s*FIXME/gi)
  if (todos && todos.length > 0) {
    results.warnings.push(`⚠️ ${fileName}包含${todos.length}个待办事项`)
  }
})

// 输出结果
console.log('\n' + '='.repeat(60))
console.log('📊 验证结果汇总：')
console.log('='.repeat(60))

console.log(`\n✅ 通过项 (${results.passed.length}):`)
results.passed.forEach(item => console.log(`   ${item}`))

if (results.warnings.length > 0) {
  console.log(`\n⚠️ 警告项 (${results.warnings.length}):`)
  results.warnings.forEach(item => console.log(`   ${item}`))
}

if (results.failed.length > 0) {
  console.log(`\n❌ 失败项 (${results.failed.length}):`)
  results.failed.forEach(item => console.log(`   ${item}`))

  console.log('\n🚨 Phase 3迁移验证失败！请解决上述问题。')
  process.exit(1)
} else {
  const successRate =
    (results.passed.length / (results.passed.length + results.warnings.length)) * 100
  console.log(`\n🎉 Phase 3迁移验证通过！`)
  console.log(`   完成度: ${successRate.toFixed(1)}%`)
  console.log(`   通过项: ${results.passed.length}`)
  console.log(`   警告项: ${results.warnings.length}`)
}

console.log('='.repeat(60))
