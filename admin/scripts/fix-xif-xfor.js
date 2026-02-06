#!/usr/bin/env node
/**
 * 临时脚本：修复所有 <template x-if> + <template x-for> 兄弟模式
 * 将 <template x-if="xxx.length === 0"> 改为在内部元素上使用 x-show
 * 
 * 使用后删除
 */

const fs = require('fs')
const path = require('path')

const adminDir = path.resolve(__dirname, '..')

// 匹配 <template x-if="..."> 开头，且条件包含 .length
const TEMPLATE_XIF_RE = /^(\s*)<template\s+x-if="([^"]+)">\s*$/

// 处理单个文件
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const changes = []
  let modified = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(TEMPLATE_XIF_RE)
    
    if (!match) continue
    
    const indent = match[1]
    const condition = match[2]
    
    // 只处理空状态条件 (包含 .length === 0 或 .length == 0)
    if (!condition.includes('.length') || (!condition.includes('=== 0') && !condition.includes('== 0'))) continue
    
    // Check if there's an x-for template within 8 lines after the closing </template>
    // First, find the closing </template> for this x-if
    let depth = 1
    let closeLineIdx = -1
    for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
      if (lines[j].includes('<template')) depth++
      if (lines[j].includes('</template>')) {
        depth--
        if (depth === 0) {
          closeLineIdx = j
          break
        }
      }
    }
    
    if (closeLineIdx === -1) continue
    
    // Check if x-for exists within 5 lines after closing
    let hasXFor = false
    for (let j = closeLineIdx + 1; j < Math.min(closeLineIdx + 6, lines.length); j++) {
      if (lines[j].includes('x-for=')) {
        hasXFor = true
        break
      }
    }
    
    if (!hasXFor) continue
    
    // Now find the first real HTML element inside the template
    const innerLineIdx = i + 1
    const innerLine = lines[innerLineIdx]
    
    if (!innerLine) continue
    
    // Extract the inner element's tag and attributes
    const innerTrimmed = innerLine.trimStart()
    const innerIndent = innerLine.match(/^(\s*)/)[1]
    
    // Match opening tag: <tagname ...>
    const tagMatch = innerTrimmed.match(/^<(\w+)(\s[^>]*)?>/)
    if (!tagMatch) {
      console.log(`  ⚠️ Skip ${path.basename(filePath)}:${i+1} - cannot parse inner element: ${innerTrimmed.substring(0, 60)}`)
      continue
    }
    
    const tagName = tagMatch[1]
    const tagAttrs = tagMatch[2] || ''
    
    // Check if the inner content is a single element (closes on the same line or within the template)
    // We'll add x-show to the inner element and remove the template wrapper
    
    // Build the new inner element with x-show
    let newInnerLine
    if (tagAttrs) {
      // Insert x-show after tag name
      newInnerLine = `${innerIndent}<${tagName} x-show="${condition}"${tagAttrs}>`
    } else {
      newInnerLine = `${innerIndent}<${tagName} x-show="${condition}">`
    }
    
    // Apply changes
    lines[i] = `${indent}<!-- empty state (x-show) -->`  // Replace x-if template opening with comment
    lines[innerLineIdx] = newInnerLine
    lines[closeLineIdx] = ''  // Remove closing </template>
    
    // Clean up: remove the comment line (just delete the template tags entirely)
    lines[i] = ''  // Remove the template x-if line entirely
    
    changes.push({
      line: i + 1,
      condition,
      tag: tagName
    })
    modified = true
  }
  
  if (modified) {
    // Clean up empty lines that were template tags (but keep at most one empty line)
    const cleanedLines = []
    let lastWasEmpty = false
    for (const line of lines) {
      const isEmpty = line.trim() === ''
      if (isEmpty && lastWasEmpty) continue
      cleanedLines.push(line)
      lastWasEmpty = isEmpty
    }
    
    fs.writeFileSync(filePath, cleanedLines.join('\n'))
    return changes
  }
  
  return []
}

// Main
const htmlFiles = fs.readdirSync(adminDir)
  .filter(f => f.endsWith('.html') && !f.startsWith('.'))
  .map(f => path.join(adminDir, f))

let totalChanges = 0

for (const filePath of htmlFiles) {
  const changes = processFile(filePath)
  if (changes.length > 0) {
    console.log(`✅ ${path.basename(filePath)}: ${changes.length} 处修复`)
    changes.forEach(c => {
      console.log(`   Line ${c.line}: <template x-if="${c.condition}"> → <${c.tag} x-show="...">`)
    })
    totalChanges += changes.length
  }
}

console.log(`\n📊 总计修复: ${totalChanges} 处 (${htmlFiles.length} 个文件扫描)`)










