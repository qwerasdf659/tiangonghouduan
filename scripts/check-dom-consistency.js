#!/usr/bin/env node
/**
 * 前端DOM元素ID一致性检查脚本
 * 检查HTML中定义的ID与JavaScript代码中引用的ID是否一致
 *
 * 使用方式：
 * 1. 直接运行：node scripts/check-dom-consistency.js
 * 2. npm命令：npm run check:dom
 *
 * 创建时间：2025年11月23日
 */

const fs = require('fs')
const path = require('path')

/**
 * 从HTML文件中提取所有ID定义
 * @param {string} htmlContent - HTML文件内容
 * @returns {Set<string>} ID集合
 */
function extractHTMLIds(htmlContent) {
  // 匹配 id="xxx" 或 id='xxx' 格式
  const idPattern = /id=["']([^"']+)["']/g
  const ids = new Set()
  let match

  while ((match = idPattern.exec(htmlContent)) !== null) {
    ids.add(match[1])
  }

  return ids
}

/**
 * 从JavaScript代码中提取getElementById/querySelector调用
 * @param {string} jsContent - JavaScript代码内容
 * @returns {Set<string>} ID集合
 */
function extractJSIds(jsContent) {
  const patterns = [
    // document.getElementById('xxx')
    /getElementById\(['"]([^'"]+)['"]\)/g,
    // document.querySelector('#xxx')
    /querySelector\(['"]#([^'"]+)['"]\)/g,
    // document.querySelectorAll('#xxx')
    /querySelectorAll\(['"]#([^'"]+)['"]\)/g
  ]

  const ids = new Set()

  patterns.forEach(pattern => {
    let match
    while ((match = pattern.exec(jsContent)) !== null) {
      ids.add(match[1])
    }
  })

  return ids
}

/**
 * 检查单个HTML文件的ID一致性
 * @param {string} filePath - 文件路径
 * @returns {Object} 检查结果
 */
function checkFile(filePath) {
  console.log(`\n🔍 检查文件: ${path.basename(filePath)}`)

  try {
    const content = fs.readFileSync(filePath, 'utf8')

    // 提取HTML中定义的ID
    const htmlIds = extractHTMLIds(content)
    console.log(`📋 HTML中定义的ID (${htmlIds.size}个):`, Array.from(htmlIds).join(', ') || '无')

    // 提取JavaScript中引用的ID
    const jsIds = extractJSIds(content)
    console.log(`📋 JavaScript中引用的ID (${jsIds.size}个):`, Array.from(jsIds).join(', ') || '无')

    // 查找JavaScript引用但HTML中不存在的ID（严重问题）
    const missingInHTML = []
    jsIds.forEach(id => {
      if (!htmlIds.has(id)) {
        missingInHTML.push(id)
      }
    })

    // 查找HTML中定义但JavaScript未使用的ID（警告）
    const unusedInJS = []
    htmlIds.forEach(id => {
      if (!jsIds.has(id)) {
        unusedInJS.push(id)
      }
    })

    // 输出检查结果
    let hasError = false

    if (missingInHTML.length > 0) {
      console.error(`\n❌ 严重问题：JavaScript引用但HTML中不存在的ID (${missingInHTML.length}个):`)
      missingInHTML.forEach(id => {
        console.error(`   - ${id}`)
        console.error(`     💡 请在HTML中添加 id="${id}" 或修改JavaScript代码`)
      })
      hasError = true
    }

    if (unusedInJS.length > 0) {
      console.warn(`\n⚠️ 警告：HTML中定义但JavaScript未使用的ID (${unusedInJS.length}个):`)
      unusedInJS.forEach(id => {
        console.warn(`   - ${id}`)
      })
    }

    if (!hasError && missingInHTML.length === 0 && unusedInJS.length === 0) {
      console.log('\n✅ ID一致性检查通过')
    } else if (!hasError) {
      console.log('\n✅ 无严重问题（仅有警告）')
    }

    return {
      file: filePath,
      passed: !hasError,
      errors: missingInHTML.length,
      warnings: unusedInJS.length,
      htmlIds: Array.from(htmlIds),
      jsIds: Array.from(jsIds),
      missingInHTML,
      unusedInJS
    }
  } catch (error) {
    console.error(`❌ 文件读取失败: ${error.message}`)
    return {
      file: filePath,
      passed: false,
      error: error.message
    }
  }
}

/**
 * 批量检查所有HTML文件
 */
function checkAllFiles() {
  console.log('🚀 开始前端DOM元素ID一致性检查...')
  console.log('='.repeat(60))

  const publicDir = path.join(__dirname, '../public/admin')

  if (!fs.existsSync(publicDir)) {
    console.error(`❌ 目录不存在: ${publicDir}`)
    process.exit(1)
  }

  const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'))

  console.log(`📁 检查目录: ${publicDir}`)
  console.log(`📄 HTML文件数量: ${files.length}`)

  if (files.length === 0) {
    console.log('⚠️ 未找到HTML文件')
    process.exit(0)
  }

  const results = []
  let totalErrors = 0
  let totalWarnings = 0

  files.forEach(file => {
    const filePath = path.join(publicDir, file)
    const result = checkFile(filePath)
    results.push(result)

    if (result.errors) {
      totalErrors += result.errors
    }
    if (result.warnings) {
      totalWarnings += result.warnings
    }
  })

  // 生成汇总报告
  console.log('\n' + '='.repeat(60))
  console.log('📊 检查结果汇总:')
  console.log(`   📄 总文件数: ${files.length}`)
  console.log(`   ✅ 通过: ${results.filter(r => r.passed).length}个文件`)
  console.log(`   ❌ 失败: ${results.filter(r => !r.passed).length}个文件`)
  console.log(`   🔴 总错误数: ${totalErrors}个ID不匹配`)
  console.log(`   ⚠️ 总警告数: ${totalWarnings}个未使用ID`)

  // 生成详细报告
  if (totalErrors > 0) {
    console.log('\n📋 详细错误列表:')
    results.forEach(result => {
      if (result.missingInHTML && result.missingInHTML.length > 0) {
        console.log(`\n   文件: ${path.basename(result.file)}`)
        result.missingInHTML.forEach(id => {
          console.log(`      - ${id}`)
        })
      }
    })
  }

  // 输出建议
  console.log('\n💡 修复建议:')
  if (totalErrors > 0) {
    console.log('   1. 检查HTML中是否存在JavaScript引用的所有ID')
    console.log('   2. 确保HTML元素ID与JavaScript代码中的ID完全一致（大小写敏感）')
    console.log('   3. 使用DOMUtils工具类进行安全的DOM操作（自动null检查）')
    console.log('   4. 建议使用DOM元素ID配置文件（dom-elements.js）集中管理')
  }

  if (totalWarnings > 0) {
    console.log('   5. 考虑删除HTML中未使用的ID，保持代码整洁')
  }

  console.log('='.repeat(60))

  // 根据结果决定退出码
  if (totalErrors > 0) {
    console.error('\n❌ DOM元素ID一致性检查失败')
    process.exit(1)
  }

  console.log('\n✅ DOM元素ID一致性检查通过')
  process.exit(0)
}

// 执行检查
if (require.main === module) {
  checkAllFiles()
}

module.exports = { checkFile, checkAllFiles, extractHTMLIds, extractJSIds }
