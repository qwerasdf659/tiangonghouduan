#!/usr/bin/env node
/**
 * API规范文档自动生成工具
 * 用途：从后端实际路由代码生成标准化的API接口文档
 * 适用场景：前后端分离项目，消除API对接差异
 *
 * 生成时间：2025年10月04日
 * 维护人：Claude Sonnet 4.5
 */

const fs = require('fs')
const path = require('path')

// API端点集合
const apiEndpoints = []

/**
 * 解析路由文件，提取API端点信息
 */
function parseRouteFile (filePath, routePrefix = '') {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  let currentComment = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // 收集注释
    if (line.startsWith('//') || line.startsWith('*')) {
      currentComment += line.replace(/^\/\/\s*|\*\s*/g, '') + ' '
      continue
    }

    // 匹配路由定义：router.get/post/put/delete
    const routeMatch = line.match(/router\.(get|post|put|delete)\(['"`]([^'"`]+)['"`]/)
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase()
      const routePath = routeMatch[2]
      const fullPath = routePrefix + routePath

      // 提取中间件信息
      const middlewares = []
      if (line.includes('authenticateToken')) middlewares.push('需要认证')
      if (line.includes('dataAccessControl')) middlewares.push('数据权限控制')
      if (line.includes('adminOnly')) middlewares.push('仅管理员')

      // 提取请求参数（从代码中分析）
      let params = []
      const queryParams = []
      const bodyParams = []

      // 参数从路径中提取
      const pathParams = routePath.match(/:(\w+)/g)
      if (pathParams) {
        params = pathParams.map(p => p.substring(1))
      }

      // 从后续代码提取查询参数和请求体参数（简化版）
      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        const codeLine = lines[j]

        // 提取 req.query
        const queryMatch = codeLine.match(/req\.query\.(\w+)/g)
        if (queryMatch) {
          queryMatch.forEach(q => {
            const paramName = q.replace('req.query.', '')
            if (!queryParams.includes(paramName)) {
              queryParams.push(paramName)
            }
          })
        }

        // 提取 req.body
        const bodyMatch = codeLine.match(/req\.body\.(\w+)/g)
        if (bodyMatch) {
          bodyMatch.forEach(b => {
            const paramName = b.replace('req.body.', '')
            if (!bodyParams.includes(paramName)) {
              bodyParams.push(paramName)
            }
          })
        }
      }

      apiEndpoints.push({
        method,
        path: fullPath,
        description: currentComment.trim() || '（无描述）',
        middlewares,
        pathParams: params,
        queryParams,
        bodyParams,
        file: path.basename(filePath)
      })

      currentComment = ''
    }
  }
}

/**
 * 扫描routes目录下的所有路由文件
 */
function scanRoutes (baseDir) {
  // V4统一引擎路由
  const v4Routes = [
    { file: 'routes/v4/unified-engine/auth.js', prefix: '/api/v4/unified-engine/auth' },
    { file: 'routes/v4/unified-engine/lottery.js', prefix: '/api/v4/unified-engine/lottery' },
    { file: 'routes/v4/unified-engine/points.js', prefix: '/api/v4/unified-engine/points' },
    { file: 'routes/v4/unified-engine/inventory.js', prefix: '/api/v4/inventory' },
    { file: 'routes/v4/unified-engine/consumption.js', prefix: '/api/v4/consumption' },
    { file: 'routes/v4/unified-engine/admin.js', prefix: '/api/v4/unified-engine/admin' },
    { file: 'routes/v4/system.js', prefix: '/api/v4/system' },
    { file: 'routes/v4/permissions.js', prefix: '/api/v4/permissions' }
  ]

  v4Routes.forEach(({ file, prefix }) => {
    const filePath = path.join(baseDir, file)
    if (fs.existsSync(filePath)) {
      console.log(`📄 解析路由文件: ${file}`)
      parseRouteFile(filePath, prefix)
    }
  })
}

/**
 * 生成Markdown格式的API文档
 */
function generateMarkdownDoc () {
  let markdown = `# 后端API接口规范文档（自动生成）

**生成时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}  
**生成工具**: API规范文档自动生成工具  
**后端环境**: Sealos DevBox  
**前端对接**: 本地开发环境  
**文档用途**: 消除前后端API对接差异，提供权威的接口规范

---

## 📊 API统计概览

| 分类 | 数量 |
|------|------|
| 总API数量 | ${apiEndpoints.length} |
| GET请求 | ${apiEndpoints.filter(a => a.method === 'GET').length} |
| POST请求 | ${apiEndpoints.filter(a => a.method === 'POST').length} |
| PUT请求 | ${apiEndpoints.filter(a => a.method === 'PUT').length} |
| DELETE请求 | ${apiEndpoints.filter(a => a.method === 'DELETE').length} |

---

## 📋 API分类索引

`

  // 按路由前缀分组
  const groupedAPIs = {}
  apiEndpoints.forEach(api => {
    const category = api.path.split('/')[3] || 'other' // 提取第三级路径作为分类
    if (!groupedAPIs[category]) {
      groupedAPIs[category] = []
    }
    groupedAPIs[category].push(api)
  })

  // 生成目录
  Object.keys(groupedAPIs).sort().forEach(category => {
    markdown += `- [${category.toUpperCase()}模块](#${category}模块) (${groupedAPIs[category].length}个)\n`
  })

  markdown += '\n---\n\n'

  // 生成详细API列表
  Object.keys(groupedAPIs).sort().forEach(category => {
    markdown += `## ${category.toUpperCase()}模块\n\n`

    groupedAPIs[category].forEach((api, index) => {
      markdown += `### ${index + 1}. ${api.method} ${api.path}\n\n`
      markdown += `**描述**: ${api.description}\n\n`

      if (api.middlewares.length > 0) {
        markdown += `**权限要求**: ${api.middlewares.join(', ')}\n\n`
      }

      if (api.pathParams.length > 0) {
        markdown += '**路径参数**:\n'
        api.pathParams.forEach(param => {
          markdown += `- \`${param}\`: （路径参数）\n`
        })
        markdown += '\n'
      }

      if (api.queryParams.length > 0) {
        markdown += '**查询参数**:\n'
        api.queryParams.forEach(param => {
          markdown += `- \`${param}\`: （查询参数）\n`
        })
        markdown += '\n'
      }

      if (api.bodyParams.length > 0) {
        markdown += '**请求体参数**:\n'
        api.bodyParams.forEach(param => {
          markdown += `- \`${param}\`: （请求体参数）\n`
        })
        markdown += '\n'
      }

      markdown += '**示例请求**:\n'
      markdown += '```javascript\n'

      if (api.method === 'GET') {
        const queryString = api.queryParams.length > 0
          ? '?' + api.queryParams.map(p => `${p}=value`).join('&')
          : ''
        markdown += `fetch('${api.path}${queryString}', {\n`
        markdown += `  method: '${api.method}',\n`
        markdown += '  headers: { \'Authorization\': \'Bearer <token>\' }\n'
        markdown += '})\n'
      } else {
        markdown += `fetch('${api.path}', {\n`
        markdown += `  method: '${api.method}',\n`
        markdown += '  headers: {\n'
        markdown += '    \'Content-Type\': \'application/json\',\n'
        markdown += '    \'Authorization\': \'Bearer <token>\'\n'
        markdown += '  },\n'
        if (api.bodyParams.length > 0) {
          markdown += '  body: JSON.stringify({\n'
          api.bodyParams.forEach((param, i) => {
            markdown += `    ${param}: 'value'${i < api.bodyParams.length - 1 ? ',' : ''}\n`
          })
          markdown += '  })\n'
        }
        markdown += '})\n'
      }

      markdown += '```\n\n'
      markdown += `**来源文件**: \`${api.file}\`\n\n`
      markdown += '---\n\n'
    })
  })

  // 生成问题反馈指南
  markdown += `## 📞 问题反馈

如发现接口问题，请：

1. 查看后端实际路由文件：\`routes/v4/\`
2. 运行后端测试验证：\`npm test\`
3. 重新生成本文档：\`node scripts/generate-api-docs.js\`

---

**文档维护**: 每次后端路由变更后，请重新运行生成脚本更新本文档  
**生成命令**: \`node scripts/generate-api-docs.js\`  
**文档路径**: \`docs/API接口规范文档_自动生成.md\`
`

  return markdown
}

/**
 * 生成前端TypeScript类型定义
 */
function generateTypeScriptDefinitions () {
  let typescript = `/**
 * 后端API接口类型定义（自动生成）
 * 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
 */

// API响应基础结构
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

// API端点枚举
export enum ApiEndpoint {
`

  apiEndpoints.forEach(api => {
    const enumName = api.path
      .replace(/\//g, '_')
      .replace(/:/g, '')
      .replace(/-/g, '_')
      .toUpperCase()
    typescript += `  ${enumName} = '${api.path}',\n`
  })

  typescript += `}

// 导出所有API端点
export const API_ENDPOINTS = {
`

  // 按分类分组
  const groupedAPIs = {}
  apiEndpoints.forEach(api => {
    const category = api.path.split('/')[3] || 'other'
    if (!groupedAPIs[category]) {
      groupedAPIs[category] = []
    }
    groupedAPIs[category].push(api)
  })

  Object.keys(groupedAPIs).sort().forEach(category => {
    typescript += `  ${category}: {\n`
    groupedAPIs[category].forEach(api => {
      const methodName = api.path.split('/').pop().replace(/:/g, '')
      typescript += `    ${api.method.toLowerCase()}_${methodName}: '${api.path}',\n`
    })
    typescript += '  },\n'
  })

  typescript += `};
`

  return typescript
}

/**
 * 主函数
 */
function main () {
  console.log('🚀 开始生成API规范文档...\n')

  const projectRoot = path.resolve(__dirname, '..')

  // 扫描路由文件
  scanRoutes(projectRoot)

  console.log(`\n✅ 共解析到 ${apiEndpoints.length} 个API端点\n`)

  // 生成Markdown文档
  console.log('📝 生成Markdown文档...')
  const markdown = generateMarkdownDoc()
  const docsDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true })
  }
  const mdPath = path.join(docsDir, 'API接口规范文档_自动生成.md')
  fs.writeFileSync(mdPath, markdown, 'utf-8')
  console.log(`✅ Markdown文档已生成: ${mdPath}`)

  // 生成TypeScript类型定义
  console.log('\n📝 生成TypeScript类型定义...')
  const typescript = generateTypeScriptDefinitions()
  const tsPath = path.join(docsDir, 'api-types.ts')
  fs.writeFileSync(tsPath, typescript, 'utf-8')
  console.log(`✅ TypeScript类型定义已生成: ${tsPath}`)

  console.log('\n🎉 API规范文档生成完成！')
  console.log('\n📋 下一步操作：')
  console.log('1. 将生成的文档发送给前端团队')
  console.log('2. 前端根据文档更新API调用路径')
  console.log('3. 每次后端路由变更后重新运行本脚本')
}

// 执行主函数
main()
