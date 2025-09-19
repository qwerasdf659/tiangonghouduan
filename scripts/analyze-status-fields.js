#!/usr/bin/env node

/**
 * Status字段业务标准一致性分析脚本
 * 系统性检查所有模型中status字段的类型一致性
 */

const fs = require('fs')
const path = require('path')

console.log('🔍 系统性status字段一致性分析报告\n')
console.log('='.repeat(60))

const modelsDir = './models'
const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js') && f !== 'index.js')

const statusFields = []

modelFiles.forEach(file => {
  const content = fs.readFileSync(path.join(modelsDir, file), 'utf8')

  // 查找status字段定义
  if (content.includes('status:') && content.includes('{')) {
    let fieldType = 'UNKNOWN'

    if (content.includes('status:') && content.includes('DataTypes.ENUM')) {
      // 提取ENUM定义
      const statusMatch = content.match(/status:\s*{[^}]*type:\s*DataTypes\.ENUM\([^)]+\)/)
      if (statusMatch) {
        fieldType = 'ENUM'
      }
    } else if (content.includes('status:') && content.includes('DataTypes.TINYINT')) {
      fieldType = 'TINYINT'
    } else if (content.includes('status:') && content.includes('DataTypes.VIRTUAL')) {
      fieldType = 'VIRTUAL'
    }

    statusFields.push({
      model: file.replace('.js', ''),
      type: fieldType
    })
  }
})

console.log('📊 status字段类型分布:')
const typeGroups = {}
statusFields.forEach(field => {
  if (!typeGroups[field.type]) {
    typeGroups[field.type] = []
  }
  typeGroups[field.type].push(field.model)
})

Object.keys(typeGroups).forEach(type => {
  const models = typeGroups[type]
  const emoji = type === 'ENUM' ? '✅' : '⚠️'
  console.log(`\n${emoji} ${type}:`)
  models.forEach(model => console.log(`   - ${model}`))
})

console.log('\n🎯 重要发现:')
if (typeGroups.TINYINT && typeGroups.TINYINT.length > 0) {
  console.log(`❌ 发现TINYINT类型字段（需要修复）: ${typeGroups.TINYINT.length}个`)
  console.log('   需要迁移到ENUM类型以保持业务标准一致性')
} else {
  console.log('✅ 未发现TINYINT类型字段')
}

const enumCount = (typeGroups.ENUM || []).length
console.log(`✅ ENUM类型字段（符合标准）: ${enumCount}个`)

console.log('\n📋 建议的修复优先级:')
console.log('1. 高优先级: 修复TINYINT类型字段')
console.log('2. 中优先级: 检查UNKNOWN类型字段')
console.log('3. 低优先级: 验证VIRTUAL类型字段的业务逻辑')
