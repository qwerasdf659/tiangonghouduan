/**
 * 活动预算配置 API 测试脚本
 * 
 * @description 测试活动预算相关API，验证前后端数据联动
 * @date 2026-01-09
 * 
 * 使用方法:
 *   node scripts/test-campaign-budget-api.js
 */

const http = require('http')

// 测试配置
const BASE_URL = 'http://localhost:3000'
let adminToken = null

// 颜色输出
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`
}

// HTTP请求封装
function httpRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken && { 'Authorization': `Bearer ${adminToken}` }),
        ...options.headers
      }
    }

    const req = http.request(reqOptions, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: res.statusCode, data: json })
        } catch {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })

    req.on('error', reject)
    
    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    
    req.end()
  })
}

// 管理员登录获取Token（使用JWT直接生成）
async function adminLogin() {
  console.log(colors.blue('\n📋 步骤1: 生成管理员Token'))
  console.log('-'.repeat(50))
  
  try {
    // 使用JWT直接生成token（用于测试）
    const jwt = require('jsonwebtoken')
    const secret = 'restaurant_points_jwt_secret_key_development_only_32_chars'
    
    // 使用数据库中存在的管理员用户ID
    adminToken = jwt.sign(
      { user_id: 31, role: 'admin', is_admin: true },
      secret,
      { expiresIn: '1h' }
    )
    
    console.log(colors.green('✅ Token生成成功'))
    console.log(`   用户ID: 31`)
    console.log(`   Token: ${adminToken.substring(0, 30)}...`)
    return true
  } catch (error) {
    console.log(colors.red(`❌ Token生成失败: ${error.message}`))
    return false
  }
}

// 测试批量获取预算状态API
async function testBatchBudgetStatus() {
  console.log(colors.blue('\n📋 步骤2: 测试批量获取预算状态 API'))
  console.log('-'.repeat(50))
  console.log(`   接口: GET /api/v4/console/campaign-budget/batch-status`)
  
  try {
    const result = await httpRequest('/api/v4/console/campaign-budget/batch-status?limit=20')
    
    console.log(`   HTTP状态: ${result.status}`)
    console.log(`   success: ${result.data.success}`)
    console.log(`   message: ${result.data.message}`)
    
    if (result.data.success && result.data.data) {
      const { campaigns, summary, total_count } = result.data.data
      
      console.log(colors.green('\n✅ API响应正常'))
      console.log(colors.cyan('\n📊 汇总数据 (summary):'))
      console.log(`   total_campaigns: ${summary?.total_campaigns || 0}`)
      console.log(`   total_budget: ${summary?.total_budget || 0}`)
      console.log(`   total_used: ${summary?.total_used || 0}`)
      console.log(`   total_remaining: ${summary?.total_remaining || 0}`)
      
      console.log(colors.cyan(`\n📋 活动列表 (共 ${campaigns?.length || 0} 个):`))
      
      if (campaigns && campaigns.length > 0) {
        campaigns.forEach((campaign, index) => {
          console.log(`\n   [${index + 1}] campaign_id: ${campaign.campaign_id}`)
          console.log(`       campaign_name: ${campaign.campaign_name}`)
          console.log(`       budget_mode: ${campaign.budget_mode}`)
          console.log(`       status: ${campaign.status}`)
          console.log(`       pool_budget:`)
          console.log(`         - total: ${campaign.pool_budget?.total || 0}`)
          console.log(`         - used: ${campaign.pool_budget?.used || 0}`)
          console.log(`         - remaining: ${campaign.pool_budget?.remaining || 0}`)
          console.log(`         - usage_rate: ${campaign.pool_budget?.usage_rate || 'N/A'}`)
        })
      } else {
        console.log(colors.yellow('   ⚠️ 没有活动数据'))
      }
      
      return { success: true, campaigns, summary }
    } else {
      console.log(colors.red('❌ API响应异常'))
      console.log(`   完整响应: ${JSON.stringify(result.data, null, 2)}`)
      return { success: false }
    }
  } catch (error) {
    console.log(colors.red(`❌ 请求失败: ${error.message}`))
    return { success: false, error: error.message }
  }
}

// 测试获取活动列表API（前端现在复用batch-status API）
async function testActivitiesApi() {
  console.log(colors.blue('\n📋 步骤3: 测试活动列表（复用batch-status API）'))
  console.log('-'.repeat(50))
  console.log(`   接口: GET /api/v4/console/campaign-budget/batch-status`)
  console.log(`   说明: 前端已修改为复用batch-status API获取活动列表`)
  
  try {
    const result = await httpRequest('/api/v4/console/campaign-budget/batch-status?limit=50')
    
    console.log(`   HTTP状态: ${result.status}`)
    console.log(`   success: ${result.data.success}`)
    
    if (result.data.success && result.data.data) {
      const campaigns = result.data.data.campaigns || []
      
      console.log(colors.green(`\n✅ 获取到 ${campaigns.length} 个活动`))
      
      campaigns.forEach((campaign, index) => {
        console.log(`   [${index + 1}] ${campaign.campaign_id}: ${campaign.campaign_name}`)
      })
      
      return { success: true, campaigns }
    } else {
      console.log(colors.yellow('⚠️ 活动列表为空或API格式不匹配'))
      console.log(`   响应: ${JSON.stringify(result.data)}`)
      return { success: false }
    }
  } catch (error) {
    console.log(colors.red(`❌ 请求失败: ${error.message}`))
    return { success: false, error: error.message }
  }
}

// 测试单个活动预算配置
async function testSingleCampaignBudget(campaignId) {
  console.log(colors.blue(`\n📋 步骤4: 测试单个活动预算配置 (campaign_id: ${campaignId})`))
  console.log('-'.repeat(50))
  console.log(`   接口: GET /api/v4/console/campaign-budget/campaigns/${campaignId}`)
  
  try {
    const result = await httpRequest(`/api/v4/console/campaign-budget/campaigns/${campaignId}`)
    
    console.log(`   HTTP状态: ${result.status}`)
    console.log(`   success: ${result.data.success}`)
    
    if (result.data.success && result.data.data) {
      const { campaign, prize_config } = result.data.data
      
      console.log(colors.green('\n✅ 获取活动预算配置成功'))
      console.log(colors.cyan('\n📊 活动预算配置:'))
      console.log(`   campaign_id: ${campaign?.campaign_id}`)
      console.log(`   budget_mode: ${campaign?.budget_mode}`)
      console.log(`   pool_budget_total: ${campaign?.pool_budget_total}`)
      console.log(`   pool_budget_remaining: ${campaign?.pool_budget_remaining}`)
      
      if (prize_config) {
        console.log(colors.cyan('\n🎁 奖品配置分析:'))
        console.log(`   total_prizes: ${prize_config.total_prizes}`)
        console.log(`   has_empty_prize: ${prize_config.has_empty_prize}`)
        console.log(`   total_probability: ${prize_config.total_probability}`)
      }
      
      return { success: true, campaign, prize_config }
    } else {
      console.log(colors.red('❌ 获取失败'))
      console.log(`   响应: ${JSON.stringify(result.data)}`)
      return { success: false }
    }
  } catch (error) {
    console.log(colors.red(`❌ 请求失败: ${error.message}`))
    return { success: false, error: error.message }
  }
}

// 检查数据库中的活动数据
async function checkDatabaseData() {
  console.log(colors.blue('\n📋 步骤5: 检查数据库活动数据'))
  console.log('-'.repeat(50))
  
  try {
    // 通过服务健康检查获取数据库状态
    const healthResult = await httpRequest('/health')
    
    if (healthResult.status === 200) {
      console.log(colors.green('✅ 服务健康检查正常'))
      console.log(`   数据库状态: ${healthResult.data.database?.status || healthResult.data.checks?.database?.status || '未知'}`)
    }
    
    // 获取所有活动用于检查
    const activitiesResult = await httpRequest('/api/v4/console/activities')
    
    if (activitiesResult.data.success && activitiesResult.data.data) {
      const activities = activitiesResult.data.data.activities || activitiesResult.data.data || []
      
      console.log(colors.cyan(`\n📊 数据库活动统计:`))
      console.log(`   总活动数: ${activities.length}`)
      
      let activeCount = 0
      let withBudgetCount = 0
      
      activities.forEach(activity => {
        if (activity.status === 'active') activeCount++
        if ((activity.pool_budget_total || 0) > 0) withBudgetCount++
      })
      
      console.log(`   进行中活动: ${activeCount}`)
      console.log(`   有预算配置的活动: ${withBudgetCount}`)
      
      return { success: true, activities }
    }
    
    return { success: false }
  } catch (error) {
    console.log(colors.red(`❌ 检查失败: ${error.message}`))
    return { success: false, error: error.message }
  }
}

// 诊断前端数据问题
async function diagnoseFrontendIssues(batchResult) {
  console.log(colors.blue('\n📋 步骤6: 诊断前端显示问题'))
  console.log('-'.repeat(50))
  
  const issues = []
  const suggestions = []
  
  if (!batchResult.success) {
    issues.push('批量预算状态API调用失败')
    suggestions.push('检查后端服务是否正常运行')
    suggestions.push('检查管理员权限是否正确')
  } else if (!batchResult.campaigns || batchResult.campaigns.length === 0) {
    issues.push('没有活动数据返回')
    suggestions.push('检查数据库中是否有active状态的活动')
    suggestions.push('创建测试活动并设置预算')
  } else {
    // 检查数据完整性
    const campaignsWithZeroBudget = batchResult.campaigns.filter(c => 
      (c.pool_budget?.total || 0) === 0
    )
    
    if (campaignsWithZeroBudget.length === batchResult.campaigns.length) {
      issues.push('所有活动的预算都是0')
      suggestions.push('为活动设置预算金额')
    }
    
    // 检查summary数据
    if (batchResult.summary) {
      if (batchResult.summary.total_budget === 0) {
        issues.push('总预算为0')
      }
    }
  }
  
  console.log(colors.cyan('\n📊 诊断结果:'))
  
  if (issues.length === 0) {
    console.log(colors.green('   ✅ 后端数据正常，前端显示问题可能是字段映射错误'))
    suggestions.push('检查前端campaign-budget.js中的字段映射')
    suggestions.push('确保前端使用正确的后端字段名')
  } else {
    issues.forEach((issue, i) => {
      console.log(colors.yellow(`   ⚠️ 问题${i + 1}: ${issue}`))
    })
  }
  
  console.log(colors.cyan('\n💡 修复建议:'))
  suggestions.forEach((suggestion, i) => {
    console.log(`   ${i + 1}. ${suggestion}`)
  })
  
  return { issues, suggestions }
}

// 创建测试预算数据
async function createTestBudgetData() {
  console.log(colors.blue('\n📋 步骤7: 创建测试预算数据'))
  console.log('-'.repeat(50))
  
  try {
    // 先获取活动列表
    const activitiesResult = await httpRequest('/api/v4/console/activities')
    
    if (activitiesResult.data.success && activitiesResult.data.data) {
      const activities = activitiesResult.data.data.activities || activitiesResult.data.data || []
      
      if (activities.length > 0) {
        const firstActivity = activities[0]
        const campaignId = firstActivity.campaign_id || firstActivity.activity_id
        
        console.log(`   为活动 ${campaignId} (${firstActivity.campaign_name || firstActivity.name}) 设置测试预算...`)
        
        // 设置预算
        const updateResult = await httpRequest(`/api/v4/console/campaign-budget/campaigns/${campaignId}`, {
          method: 'PUT',
          body: {
            budget_mode: 'pool',
            pool_budget_total: 10000
          }
        })
        
        if (updateResult.data.success) {
          console.log(colors.green('   ✅ 预算设置成功'))
          console.log(`   预算模式: pool`)
          console.log(`   预算总额: 10000`)
          return { success: true, campaignId }
        } else {
          console.log(colors.red(`   ❌ 预算设置失败: ${updateResult.data.message}`))
        }
      } else {
        console.log(colors.yellow('   ⚠️ 没有活动可设置预算'))
      }
    }
    
    return { success: false }
  } catch (error) {
    console.log(colors.red(`❌ 创建测试数据失败: ${error.message}`))
    return { success: false, error: error.message }
  }
}

// 主测试流程
async function runTests() {
  console.log(colors.cyan('═'.repeat(60)))
  console.log(colors.cyan('         活动预算配置 API 测试'))
  console.log(colors.cyan('═'.repeat(60)))
  console.log(`测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  
  // 步骤1: 登录
  const loginSuccess = await adminLogin()
  if (!loginSuccess) {
    console.log(colors.red('\n❌ 测试中断：无法登录'))
    return
  }
  
  // 步骤2: 测试批量预算状态API
  const batchResult = await testBatchBudgetStatus()
  
  // 步骤3: 测试活动列表API
  await testActivitiesApi()
  
  // 步骤4: 如果有活动，测试单个活动预算配置
  if (batchResult.success && batchResult.campaigns && batchResult.campaigns.length > 0) {
    await testSingleCampaignBudget(batchResult.campaigns[0].campaign_id)
  }
  
  // 步骤5: 检查数据库数据
  await checkDatabaseData()
  
  // 步骤6: 诊断问题
  await diagnoseFrontendIssues(batchResult)
  
  // 步骤7: 如果没有数据，尝试创建测试数据
  if (!batchResult.campaigns || batchResult.campaigns.length === 0 || 
      batchResult.campaigns.every(c => (c.pool_budget?.total || 0) === 0)) {
    const createResult = await createTestBudgetData()
    
    if (createResult.success) {
      console.log(colors.cyan('\n🔄 重新测试批量预算状态...'))
      await testBatchBudgetStatus()
    }
  }
  
  // 总结
  console.log(colors.cyan('\n' + '═'.repeat(60)))
  console.log(colors.cyan('         测试完成'))
  console.log(colors.cyan('═'.repeat(60)))
  
  console.log(colors.cyan('\n📝 前端字段映射检查:'))
  console.log(`   后端返回: campaign_id, campaign_name, pool_budget.total/used/remaining`)
  console.log(`   前端期望: activity_id, activity_name, total_budget, used_budget`)
  console.log(colors.yellow(`   ⚠️ 需要修改前端使用后端字段名，不做复杂映射`))
}

// 运行测试
runTests().catch(console.error)

