/**
 * API覆盖率分析脚本 v2
 * 
 * 功能：排查数据库所有表在服务层使用情况和路由API暴露情况
 * 
 * 运行方式：node scripts/api-coverage-analysis.js
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')

// 数据库连接
const { Sequelize } = require('sequelize')

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    dialect: 'mysql',
    logging: false
  }
)

// 工具函数：递归搜索文件内容
function searchInDirectory(dir, patterns, extensions = ['.js']) {
  const results = []
  
  function searchDir(currentDir) {
    try {
      const items = fs.readdirSync(currentDir)
      for (const item of items) {
        const fullPath = path.join(currentDir, item)
        const stat = fs.statSync(fullPath)
        
        if (stat.isDirectory()) {
          if (!['node_modules', 'backups', '.git', 'logs'].includes(item)) {
            searchDir(fullPath)
          }
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8')
            for (const pattern of patterns) {
              if (pattern.test(content)) {
                const lines = content.split('\n')
                const matches = []
                lines.forEach((line, index) => {
                  if (pattern.test(line)) {
                    matches.push({ line: index + 1, content: line.trim().substring(0, 100) })
                  }
                })
                if (matches.length > 0) {
                  results.push({ file: fullPath.replace(process.cwd() + '/', ''), matches, pattern: pattern.toString() })
                  break // 匹配到一个就够了
                }
              }
            }
          } catch (e) {
            // 忽略读取错误
          }
        }
      }
    } catch (e) {
      // 忽略目录访问错误
    }
  }
  
  searchDir(dir)
  return results
}

// 获取实际的模型文件列表
function getModelFiles(modelsDir) {
  const files = fs.readdirSync(modelsDir)
  return files.filter(f => f.endsWith('.js') && f !== 'index.js').map(f => f.replace('.js', ''))
}

async function main() {
  console.log('🔍 开始API覆盖率分析 v2...\n')
  
  // 1. 连接数据库获取所有表
  console.log('📊 Step 1: 连接数据库获取表信息...')
  await sequelize.authenticate()
  console.log('✅ 数据库连接成功\n')
  
  const [tables] = await sequelize.query(`
    SELECT 
      TABLE_NAME as table_name,
      TABLE_ROWS as row_count,
      TABLE_COMMENT as comment
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
    ORDER BY TABLE_NAME
  `)
  
  console.log(`📋 发现 ${tables.length} 张数据库表\n`)
  
  // 2. 获取实际的模型文件
  const projectRoot = process.cwd()
  const modelFiles = getModelFiles(path.join(projectRoot, 'models'))
  console.log(`📁 发现 ${modelFiles.length} 个模型文件\n`)
  
  // 3. 读取 models/index.js 获取表名到模型名的映射
  const modelsIndexContent = fs.readFileSync(path.join(projectRoot, 'models', 'index.js'), 'utf8')
  
  // 4. 分析每张表
  const analysis = []
  
  for (const table of tables) {
    const tableName = table.table_name
    
    // 跳过 Sequelize 内部表
    if (tableName === 'sequelizemeta') {
      continue
    }
    
    // 查找对应的模型名
    let modelName = null
    for (const mf of modelFiles) {
      // 检查 models/index.js 中的映射
      const modelExportPattern = new RegExp(`models\\.${mf}\\s*=`, 'i')
      if (modelExportPattern.test(modelsIndexContent)) {
        // 检查该模型是否关联到这个表
        try {
          const modelContent = fs.readFileSync(path.join(projectRoot, 'models', `${mf}.js`), 'utf8')
          // 检查 tableName 配置
          if (modelContent.includes(`tableName: '${tableName}'`) || 
              modelContent.includes(`tableName: "${tableName}"`) ||
              modelContent.includes(`tableName: \`${tableName}\``)) {
            modelName = mf
            break
          }
        } catch (e) {
          // 忽略
        }
      }
    }
    
    // 如果没找到，尝试模糊匹配
    if (!modelName) {
      // 将表名转换为可能的模型名
      const possibleNames = generatePossibleModelNames(tableName)
      for (const pn of possibleNames) {
        if (modelFiles.includes(pn)) {
          modelName = pn
          break
        }
      }
    }
    
    const modelExists = modelName !== null
    
    // 搜索模式 - 使用多个模式
    const searchPatterns = [
      new RegExp(`['"\`]${tableName}['"\`]`, 'i'),  // 表名字符串
    ]
    if (modelName) {
      searchPatterns.push(new RegExp(`\\b${modelName}\\b`, 'i'))  // 模型名
    }
    
    // 在 services 目录搜索
    const serviceUsages = searchInDirectory(
      path.join(projectRoot, 'services'),
      searchPatterns
    )
    
    // 在 routes 目录搜索
    const routeUsages = searchInDirectory(
      path.join(projectRoot, 'routes'),
      searchPatterns
    )
    
    // 判断是否有对外API（v2.1 改进的检测逻辑）
    // 策略1：路由文件直接引用表名/模型名
    // 策略2：服务文件在 console 路由中被调用（通过 ServiceManager）
    // 策略3：表名映射到特定的路由文件（如 popup_banners -> popup-banners.js）
    let hasExternalAPI = false
    let apiEndpoints = []
    let matchedRouteFiles = []
    
    // 策略1：直接引用检测
    for (const route of routeUsages) {
      const fullPath = path.join(projectRoot, route.file)
      const content = fs.readFileSync(fullPath, 'utf8')
      const isConsoleRoute = route.file.includes('console') || route.file.includes('v4')
      const routeMatches = content.match(/router\.(get|post|put|delete|patch)\s*\(\s*['"`][^'"`]+['"`]/gi) || []
      if (routeMatches.length > 0 && isConsoleRoute) {
        hasExternalAPI = true
        apiEndpoints = routeMatches.slice(0, 5).map(m => m.replace(/router\./, '').trim())
        matchedRouteFiles.push(route.file)
      }
    }
    
    // 策略2：通过 ServiceManager 间接引用检测
    // 根据服务文件名推断对应的路由文件
    if (!hasExternalAPI && serviceUsages.length > 0) {
      const consoleRoutesDir = path.join(projectRoot, 'routes', 'v4', 'console')
      
      // 表名到路由文件的映射（常见模式）
      const tableToRouteMap = {
        'popup_banners': 'popup-banners.js',
        'administrative_regions': 'regions.js',
        'item_templates': 'item-templates.js',
        'lottery_presets': 'lottery-presets.js',
        'lottery_tier_rules': 'lottery-tier-rules.js',
        'user_risk_profiles': 'risk-profiles.js',
        'system_settings': 'settings.js',
        'user_hierarchy': 'user-hierarchy.js',
        'material_conversion_rules': 'material.js',
        'material_asset_types': 'material.js',
        'lottery_draw_quota_rules': 'lottery-quota.js',
        'lottery_management_settings': 'lottery-management/interventions.js',
        'preset_budget_debt': 'debt-management.js',
        'preset_inventory_debt': 'debt-management.js',
        'preset_debt_limits': 'debt-management.js',
        'admin_operation_logs': 'admin-audit-logs.js',
        'consumption_records': 'consumption.js',
        'image_resources': 'images.js',
        'trade_orders': 'trade-orders.js',
        'user_premium_status': 'user-premium.js',
        'store_staff': 'staff.js',
        'customer_service_sessions': 'customer-service/sessions.js',
        'lottery_user_experience_state': 'lottery-monitoring.js',
        'lottery_user_global_state': 'lottery-monitoring.js',
        'lottery_campaign_user_quota': 'lottery-monitoring.js',
        'lottery_campaign_quota_grants': 'lottery-monitoring.js',
        'item_instance_events': 'business-records.js',
        'risk_alerts': 'risk-alerts.js',
        'websocket_startup_logs': 'system-data.js',
        'lottery_draw_decisions': 'business-records.js',
        'api_idempotency_requests': 'system-data.js',
        'authentication_sessions': 'system-data.js'
      }
      
      // 检查映射的路由文件是否存在
      const mappedRouteFile = tableToRouteMap[tableName]
      if (mappedRouteFile) {
        const routeFilePath = path.join(consoleRoutesDir, mappedRouteFile)
        if (fs.existsSync(routeFilePath)) {
          try {
            const routeContent = fs.readFileSync(routeFilePath, 'utf8')
            const routeMatches = routeContent.match(/router\.(get|post|put|delete|patch)\s*\(\s*['"`][^'"`]+['"`]/gi) || []
            if (routeMatches.length > 0) {
              hasExternalAPI = true
              apiEndpoints = routeMatches.slice(0, 5).map(m => m.replace(/router\./, '').trim())
              matchedRouteFiles.push(`routes/v4/console/${mappedRouteFile}`)
            }
          } catch (e) {
            // 忽略读取错误
          }
        }
      }
      
      // 策略3：通过服务文件名推断路由文件名（如 AdCampaignService -> ad-campaigns.js）
      if (!hasExternalAPI) {
        for (const serviceFile of serviceUsages.map(s => s.file)) {
          const serviceName = path.basename(serviceFile, '.js')
          // AdCampaignService -> ad-campaign
          const routeNameBase = serviceName
            .replace(/Service$/i, '')
            .replace(/([A-Z])/g, (m, p1, offset) => offset ? `-${p1.toLowerCase()}` : p1.toLowerCase())
          
          // 尝试多种路由文件名格式
          const possibleRouteFiles = [
            `${routeNameBase}.js`,
            `${routeNameBase}s.js`,
            `${routeNameBase.replace(/-/g, '_')}.js`
          ]
          
          for (const routeFileName of possibleRouteFiles) {
            const routeFilePath = path.join(consoleRoutesDir, routeFileName)
            if (fs.existsSync(routeFilePath)) {
              try {
                const routeContent = fs.readFileSync(routeFilePath, 'utf8')
                const routeMatches = routeContent.match(/router\.(get|post|put|delete|patch)\s*\(\s*['"`][^'"`]+['"`]/gi) || []
                if (routeMatches.length > 0) {
                  hasExternalAPI = true
                  apiEndpoints = routeMatches.slice(0, 5).map(m => m.replace(/router\./, '').trim())
                  matchedRouteFiles.push(`routes/v4/console/${routeFileName}`)
                  break
                }
              } catch (e) {
                // 忽略
              }
            }
          }
          
          if (hasExternalAPI) break
        }
      }
    }
    
    analysis.push({
      table_name: tableName,
      model_name: modelName || '未找到',
      row_count: table.row_count || 0,
      comment: table.comment || '',
      model_exists: modelExists,
      service_usage: serviceUsages.length > 0,
      service_files: [...new Set(serviceUsages.map(s => s.file))],
      route_usage: routeUsages.length > 0 || matchedRouteFiles.length > 0,
      route_files: [...new Set([...routeUsages.map(r => r.file), ...matchedRouteFiles])],
      has_external_api: hasExternalAPI,
      api_endpoints: apiEndpoints,
      status: ''
    })
  }
  
  // 5. 分类结果
  const categories = {
    full_coverage: [],
    internal_only: [],
    route_only: [],
    unused: [],
    no_model: []
  }
  
  for (const item of analysis) {
    if (!item.model_exists) {
      item.status = '❌ 无模型定义'
      categories.no_model.push(item)
    } else if (item.service_usage && item.has_external_api) {
      item.status = '✅ 完整覆盖'
      categories.full_coverage.push(item)
    } else if (item.service_usage && !item.has_external_api) {
      item.status = '⚠️ 仅内部使用'
      categories.internal_only.push(item)
    } else if (item.has_external_api && !item.service_usage) {
      item.status = '📡 仅路由层'
      categories.route_only.push(item)
    } else {
      item.status = '🔸 未使用'
      categories.unused.push(item)
    }
  }
  
  // 6. 生成报告
  const report = generateReport(analysis, categories, analysis.length)
  
  // 7. 写入文件
  const outputPath = path.join(projectRoot, 'docs', '数据库表API覆盖率分析报告.md')
  fs.writeFileSync(outputPath, report)
  
  console.log(`\n✅ 分析完成！报告已生成：${outputPath}`)
  console.log('\n📊 快速统计：')
  console.log(`   ✅ 完整覆盖: ${categories.full_coverage.length} 张表`)
  console.log(`   ⚠️ 仅内部使用(无对外API): ${categories.internal_only.length} 张表`)
  console.log(`   📡 仅路由层: ${categories.route_only.length} 张表`)
  console.log(`   🔸 未使用: ${categories.unused.length} 张表`)
  console.log(`   ❌ 无模型: ${categories.no_model.length} 张表`)
  
  await sequelize.close()
}

// 生成可能的模型名
function generatePossibleModelNames(tableName) {
  const names = []
  
  // 去掉复数后缀
  let singular = tableName
  if (singular.endsWith('ies')) {
    singular = singular.slice(0, -3) + 'y'
  } else if (singular.endsWith('ses') || singular.endsWith('xes') || singular.endsWith('ches') || singular.endsWith('shes')) {
    singular = singular.slice(0, -2)
  } else if (singular.endsWith('s') && !singular.endsWith('ss') && !singular.endsWith('us')) {
    singular = singular.slice(0, -1)
  }
  
  // 转换为 PascalCase
  const pascalCase = (str) => str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  
  names.push(pascalCase(singular))
  names.push(pascalCase(tableName))
  
  // 特殊处理
  if (tableName === 'admin_operation_logs') names.push('AdminOperationLog')
  if (tableName === 'lottery_draws') names.push('LotteryDraw')
  if (tableName === 'lottery_prizes') names.push('LotteryPrize')
  if (tableName === 'users') names.push('User')
  if (tableName === 'roles') names.push('Role')
  if (tableName === 'accounts') names.push('Account')
  if (tableName === 'products') names.push('Product')
  if (tableName === 'stores') names.push('Store')
  if (tableName === 'feedbacks') names.push('Feedback')
  
  return [...new Set(names)]
}

function generateReport(analysis, categories, totalTables) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  
  let report = `# 📊 数据库表API覆盖率分析报告

> **生成时间**：${now}
> 
> **数据来源**：真实数据库连接 + 项目代码静态扫描
> 
> **分析范围**：${totalTables} 张数据库表（排除 sequelizemeta）

---

## 📈 总体统计

| 分类 | 数量 | 占比 | 说明 |
|------|------|------|------|
| ✅ 完整覆盖 | ${categories.full_coverage.length} | ${(categories.full_coverage.length / totalTables * 100).toFixed(1)}% | 有模型 + 服务层使用 + 对外API |
| ⚠️ **仅内部使用** | ${categories.internal_only.length} | ${(categories.internal_only.length / totalTables * 100).toFixed(1)}% | **有服务层使用但无对外管理API** |
| 📡 仅路由层 | ${categories.route_only.length} | ${(categories.route_only.length / totalTables * 100).toFixed(1)}% | 有API但服务层使用少 |
| 🔸 未使用 | ${categories.unused.length} | ${(categories.unused.length / totalTables * 100).toFixed(1)}% | 有模型但代码中未使用 |
| ❌ 无模型 | ${categories.no_model.length} | ${(categories.no_model.length / totalTables * 100).toFixed(1)}% | 数据库有表但无模型定义 |

---

## 🔴 重点关注：仅内部使用的表（需补齐对外管理API）

以下 **${categories.internal_only.length}** 张表在服务层有内部使用，但**没有对外暴露管理API**：

| 序号 | 表名 | 模型名 | 数据量 | 服务层使用文件 | 说明 |
|------|------|--------|--------|----------------|------|
`

  categories.internal_only.forEach((item, index) => {
    const serviceFiles = item.service_files.slice(0, 3).map(f => `\`${f.split('/').pop()}\``).join(', ')
    report += `| ${index + 1} | ${item.table_name} | ${item.model_name} | ${item.row_count} | ${serviceFiles} | ${item.comment || '-'} |\n`
  })

  report += `
### 详细分析

`

  categories.internal_only.forEach((item, index) => {
    report += `#### ${index + 1}. \`${item.table_name}\` (${item.model_name})

- **数据量**：${item.row_count} 条
- **表说明**：${item.comment || '无'}
- **服务层使用位置**：
${item.service_files.map(f => `  - \`${f}\``).join('\n') || '  - 无'}
- **路由层引用**：${item.route_files.length > 0 ? item.route_files.map(f => `\`${f.split('/').pop()}\``).join(', ') : '无'}
- **需要补充的API**：CRUD/查询管理接口

`
  })

  report += `---

## ✅ 完整覆盖的表（无需处理）

以下 **${categories.full_coverage.length}** 张表已有完整的服务层支持和对外API：

| 表名 | 模型名 | 数据量 | 路由文件 |
|------|--------|--------|----------|
`

  categories.full_coverage.forEach(item => {
    const routeFiles = item.route_files.slice(0, 2).map(f => `\`${f.split('/').pop()}\``).join(', ')
    report += `| ${item.table_name} | ${item.model_name} | ${item.row_count} | ${routeFiles} |\n`
  })

  if (categories.route_only.length > 0) {
    report += `
---

## 📡 仅路由层的表（服务层使用较少）

| 表名 | 模型名 | 数据量 | 路由文件 |
|------|--------|--------|----------|
`
    categories.route_only.forEach(item => {
      const routeFiles = item.route_files.slice(0, 2).map(f => `\`${f.split('/').pop()}\``).join(', ')
      report += `| ${item.table_name} | ${item.model_name} | ${item.row_count} | ${routeFiles} |\n`
    })
  }

  if (categories.unused.length > 0) {
    report += `
---

## 🔸 未使用的表（有模型但代码未引用）

| 表名 | 模型名 | 数据量 | 说明 |
|------|--------|--------|------|
`
    categories.unused.forEach(item => {
      report += `| ${item.table_name} | ${item.model_name} | ${item.row_count} | ${item.comment || '-'} |\n`
    })
  }

  if (categories.no_model.length > 0) {
    report += `
---

## ❌ 无模型定义的表（需要检查）

| 表名 | 数据量 | 说明 |
|------|--------|------|
`
    categories.no_model.forEach(item => {
      report += `| ${item.table_name} | ${item.row_count} | ${item.comment || '-'} |\n`
    })
  }

  report += `
---

## 🎯 API补齐行动建议

### P0 优先级（有数据的核心业务表）

`

  // P0: 有数据量的核心表
  const p0Tables = categories.internal_only.filter(item => 
    item.row_count > 0 && (
      item.table_name.includes('lottery') || 
      item.table_name.includes('user') ||
      item.table_name.includes('config') ||
      item.table_name.includes('setting')
    )
  )

  // P1: 配置/字典类表
  const p1Tables = categories.internal_only.filter(item => 
    !p0Tables.includes(item) && (
      item.table_name.includes('config') ||
      item.table_name.includes('def') ||
      item.table_name.includes('setting') ||
      item.table_name.includes('template') ||
      item.row_count > 0
    )
  )

  // P2: 其他表
  const p2Tables = categories.internal_only.filter(item => 
    !p0Tables.includes(item) && !p1Tables.includes(item)
  )

  if (p0Tables.length > 0) {
    report += `| 表名 | 模型名 | 数据量 | 需要的API | 优先理由 |
|------|--------|--------|-----------|----------|
`
    p0Tables.forEach(item => {
      let apiNeeded = '查询接口'
      if (item.table_name.includes('config') || item.table_name.includes('setting')) {
        apiNeeded = 'CRUD接口'
      }
      report += `| ${item.table_name} | ${item.model_name} | ${item.row_count} | ${apiNeeded} | 核心业务表 |\n`
    })
  } else {
    report += `*无 P0 级别的表*\n`
  }

  if (p1Tables.length > 0) {
    report += `
### P1 优先级（配置/字典表）

| 表名 | 模型名 | 数据量 | 需要的API |
|------|--------|--------|-----------|
`
    p1Tables.forEach(item => {
      let apiNeeded = item.table_name.includes('config') || item.table_name.includes('def') ? 'CRUD接口' : '查询接口'
      report += `| ${item.table_name} | ${item.model_name} | ${item.row_count} | ${apiNeeded} |\n`
    })
  }

  if (p2Tables.length > 0) {
    report += `
### P2 优先级（监控/日志类表）

| 表名 | 模型名 | 数据量 | 需要的API |
|------|--------|--------|-----------|
`
    p2Tables.forEach(item => {
      report += `| ${item.table_name} | ${item.model_name} | ${item.row_count} | 查询接口 |\n`
    })
  }

  report += `
---

## 📋 完整表清单（按状态排序）

| 序号 | 表名 | 模型名 | 状态 | 数据量 |
|------|------|--------|------|--------|
`

  analysis.sort((a, b) => {
    const order = { '⚠️ 仅内部使用': 1, '❌ 无模型定义': 2, '🔸 未使用': 3, '📡 仅路由层': 4, '✅ 完整覆盖': 5 }
    return (order[a.status] || 99) - (order[b.status] || 99)
  })

  analysis.forEach((item, index) => {
    report += `| ${index + 1} | ${item.table_name} | ${item.model_name} | ${item.status} | ${item.row_count} |\n`
  })

  report += `
---

## 📊 技术说明

### 分析方法
1. **数据库连接**：通过 .env 配置连接真实MySQL数据库
2. **模型检测**：扫描 /models 目录中的 Sequelize 模型定义
3. **服务层扫描**：检测 /services 目录中对表名/模型名的引用
4. **路由层扫描**：检测 /routes/v4/console 目录中对表名/模型名的引用

### 判定标准
- **完整覆盖**：模型存在 + 服务层有引用 + 有对外管理API路由
- **仅内部使用**：模型存在 + 服务层有引用 + 无对外管理API路由
- **仅路由层**：模型存在 + 有API路由 + 服务层引用少
- **未使用**：模型存在但代码中未检测到引用
- **无模型**：数据库有表但 /models 中无对应定义

---

**文档生成器**：api-coverage-analysis.js v2  
**最后更新**：${now}
`

  return report
}

main().catch(err => {
  console.error('❌ 分析失败:', err.message)
  console.error(err.stack)
  process.exit(1)
})
