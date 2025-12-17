#!/usr/bin/env node
/**
 * 测试核销码生成器
 */

const RedemptionCodeGenerator = require('../utils/RedemptionCodeGenerator')

console.log('🧪 测试核销码生成器\n')

// 测试1：生成5个核销码
console.log('📝 测试1：生成核销码')
for (let i = 0; i < 5; i++) {
  const code = RedemptionCodeGenerator.generate()
  const hash = RedemptionCodeGenerator.hash(code)
  const isValid = RedemptionCodeGenerator.validate(code)

  console.log(`  ${i + 1}. 码: ${code}`)
  console.log(`     哈希: ${hash.substr(0, 32)}...`)
  console.log(`     格式: ${isValid ? '✅通过' : '❌失败'}`)
}

// 测试2：验证格式
console.log('\n📝 测试2：格式验证')
const testCases = [
  { code: '3K7J-2MQP-WXYZ', expected: true, desc: '正确格式' },
  { code: '3K7J2MQPWXYZ', expected: false, desc: '缺少连字符' },
  { code: '3K7J-2MQP-WX0Z', expected: false, desc: '包含数字0' },
  { code: '3K7J-2MQP-WXYZ-ABCD', expected: false, desc: '长度错误' }
]

testCases.forEach(test => {
  const result = RedemptionCodeGenerator.validate(test.code)
  const status = result === test.expected ? '✅' : '❌'
  console.log(`  ${status} ${test.desc}: ${test.code} => ${result}`)
})

// 测试3：哈希一致性
console.log('\n📝 测试3：哈希一致性')
const testCode = '3K7J-2MQP-WXYZ'
const hash1 = RedemptionCodeGenerator.hash(testCode)
const hash2 = RedemptionCodeGenerator.hash(testCode)
const hash3 = RedemptionCodeGenerator.hash('3K7J2MQPWXYZ') // 无连字符
console.log(`  原码: ${testCode}`)
console.log(`  哈希1: ${hash1}`)
console.log(`  哈希2: ${hash2}`)
console.log(`  哈希3 (无连字符): ${hash3}`)
console.log(`  一致性: ${hash1 === hash2 && hash2 === hash3 ? '✅通过' : '❌失败'}`)

console.log('\n✅ 测试完成')
