#!/usr/bin/env node

/**
 * V4引擎模型引用修复脚本
 * 系统性修复ContextBuilder中不正确的模型引用
 * 创建时间：2025年9月11日 北京时间
 */

const fs = require('fs')

console.log('🔧 开始修复V4引擎模型引用问题...')

// 修复映射表：错误的模型名 -> 正确的模型名
const modelMappings = {
  // 活动相关
  Activity: 'LotteryCampaign',

  // 奖品和奖池相关
  PrizePool: 'LotteryCampaign', // PrizePool功能由LotteryCampaign提供
  Prize: 'LotteryPrize',

  // 确保其他模型名称正确
  LotteryRecord: 'LotteryRecord', // 已经正确
  User: 'User', // 已经正确
  UserPointsAccount: 'UserPointsAccount' // 已经正确
}

// 要修复的文件列表
const filesToFix = ['services/UnifiedLotteryEngine/core/ContextBuilder.js']

function fixModelReferences (filePath) {
  console.log(`📝 修复文件: ${filePath}`)

  let content = fs.readFileSync(filePath, 'utf8')
  let changed = false

  // 修复require语句中的模型引用
  Object.entries(modelMappings).forEach(([oldName, newName]) => {
    if (oldName !== newName) {
      const requirePattern = new RegExp(`(const\\s*{[^}]*?)\\b${oldName}\\b([^}]*?})`, 'g')
      const newContent = content.replace(requirePattern, (match, prefix, suffix) => {
        console.log(`  ✓ 修复模型引用: ${oldName} -> ${newName}`)
        changed = true
        return prefix + newName + suffix
      })
      content = newContent

      // 修复使用该模型的代码
      const usagePattern = new RegExp(`\\b${oldName}\\.findByPk`, 'g')
      if (content.match(usagePattern)) {
        content = content.replace(usagePattern, `${newName}.findByPk`)
        console.log(`  ✓ 修复findByPk调用: ${oldName}.findByPk -> ${newName}.findByPk`)
        changed = true
      }

      const usagePatternFindAll = new RegExp(`\\b${oldName}\\.findAll`, 'g')
      if (content.match(usagePatternFindAll)) {
        content = content.replace(usagePatternFindAll, `${newName}.findAll`)
        console.log(`  ✓ 修复findAll调用: ${oldName}.findAll -> ${newName}.findAll`)
        changed = true
      }
    }
  })

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`✅ ${filePath} 修复完成`)
  } else {
    console.log(`✓ ${filePath} 无需修复`)
  }

  return changed
}

// 执行修复
let totalFixed = 0

filesToFix.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      if (fixModelReferences(file)) {
        totalFixed++
      }
    } else {
      console.log(`⚠️ 文件不存在: ${file}`)
    }
  } catch (error) {
    console.error(`❌ 修复失败 ${file}: ${error.message}`)
  }
})

console.log('\n📊 修复完成统计:')
console.log(`✅ 已修复文件: ${totalFixed}个`)
console.log(`📁 总计文件: ${filesToFix.length}个`)

if (totalFixed > 0) {
  console.log('\n🎯 建议接下来的操作:')
  console.log('1. 重新运行V4引擎测试')
  console.log('2. 检查修复后的模型引用是否正确')
  console.log('3. 验证所有相关功能正常工作')
}

console.log('\n🎉 V4引擎模型引用修复完成!')
