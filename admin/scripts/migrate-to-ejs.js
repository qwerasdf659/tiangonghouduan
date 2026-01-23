/**
 * EJS 模板迁移脚本
 * 
 * @description 将现有 HTML 页面迁移为使用 EJS 模板的格式
 * @version 1.0.0
 * @date 2026-01-23
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve, basename } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const adminDir = resolve(__dirname, '..')

// 获取所有 HTML 文件
const htmlFiles = readdirSync(adminDir).filter(file => file.endsWith('.html'))

console.log(`📁 找到 ${htmlFiles.length} 个 HTML 文件`)

let migratedCount = 0
let skippedCount = 0

htmlFiles.forEach(file => {
  const filePath = resolve(adminDir, file)
  let content = readFileSync(filePath, 'utf-8')
  
  // 检查是否已经使用 EJS 模板
  if (content.includes('<%- include(')) {
    console.log(`⏭️  跳过 ${file} (已迁移)`)
    skippedCount++
    return
  }
  
  // 提取页面标题
  const titleMatch = content.match(/<title>(.+?)\s*-\s*管理后台<\/title>/)
  const pageTitle = titleMatch ? titleMatch[1] : '管理后台'
  
  // 提取自定义样式
  const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/)
  let pageStyle = ''
  if (styleMatch) {
    pageStyle = styleMatch[1]
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  
  // 构建 head include 语句
  const headInclude = `<%- include('partials/head', { 
    title: '${pageTitle}', 
    pageStyle: '${pageStyle.replace(/'/g, "\\'")}' 
  }) %>`
  
  // 替换 head 内容
  const headPattern = /<head>[\s\S]*?<\/head>/
  const headMatch = content.match(headPattern)
  
  if (headMatch) {
    // 提取额外的 script 标签（如 ECharts）
    const extraScripts = []
    const scriptMatches = headMatch[0].matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/g)
    for (const match of scriptMatches) {
      if (!match[1].includes('main.js') && !match[1].includes('./src/')) {
        extraScripts.push(`  <script src="${match[1]}"></script>`)
      }
    }
    
    // 构建新的 head
    let newHead = `<head>\n  ${headInclude}`
    if (extraScripts.length > 0) {
      newHead += '\n' + extraScripts.join('\n')
    }
    newHead += '\n</head>'
    
    content = content.replace(headPattern, newHead)
  }
  
  // 在 </body> 前添加 footer include（如果不存在）
  if (!content.includes("include('partials/footer')")) {
    content = content.replace(
      /(\s*)(<script type="module"[^>]*>[\s\S]*?<\/body>)/,
      `$1<%- include('partials/footer') %>\n\n$1$2`
    )
  }
  
  // 写入更新后的文件
  writeFileSync(filePath, content, 'utf-8')
  console.log(`✅ 迁移 ${file}`)
  migratedCount++
})

console.log(`\n📊 迁移完成: ${migratedCount} 个文件已更新, ${skippedCount} 个文件已跳过`)

