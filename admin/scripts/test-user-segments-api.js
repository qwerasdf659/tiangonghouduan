/**
 * 用户画像API数据验证测试脚本
 * 验证后端4个用户画像API的数据完整性和结构正确性
 * 
 * 运行方式: node admin/scripts/test-user-segments-api.js
 * 
 * 测试完成后请删除此文件
 */

require('dotenv').config()

const { User } = require('../../models')
const { generateTokens } = require('../../middleware/auth')

const API_BASE = `http://localhost:${process.env.PORT || 3000}/api/v4`
let testToken = null

/**
 * 初始化测试token
 */
async function initTestToken() {
  console.log('🔐 初始化测试token...')
  const testUser = await User.findOne({ where: { user_id: 31 } })
  if (!testUser) throw new Error('测试用户不存在 (user_id=31)')
  const tokens = await generateTokens(testUser)
  testToken = tokens.access_token
  console.log(`✅ Token生成成功: user_id=${testUser.user_id}`)
}

/**
 * 发送API请求
 */
async function callApi(path) {
  const url = `${API_BASE}${path}`
  console.log(`  📡 请求: GET ${url}`)
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${testToken}`, 'Content-Type': 'application/json' }
  })
  
  const data = await response.json()
  return { status: response.status, ...data }
}

/**
 * 验证数据结构
 */
function validateStructure(data, expectedFields, label) {
  const missing = expectedFields.filter(f => !(f in data))
  if (missing.length > 0) {
    console.log(`  ⚠️  ${label} 缺少字段: ${missing.join(', ')}`)
    return false
  }
  console.log(`  ✅ ${label} 结构正确 (${expectedFields.length} 个字段)`)
  return true
}

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  📊 用户画像API数据验证测试')
  console.log('═══════════════════════════════════════════════════\n')

  await initTestToken()
  
  const results = { passed: 0, failed: 0, tests: [] }
  
  // ==================== 测试1: 用户分层统计 ====================
  console.log('\n━━━ 测试1: 用户分层统计 GET /console/users/segments ━━━')
  try {
    const res = await callApi('/console/users/segments')
    
    if (res.success && res.data) {
      console.log(`  ✅ API 返回成功`)
      
      // 验证顶层结构
      validateStructure(res.data, ['segments', 'total_users', 'segment_rules', 'generated_at'], '顶层数据')
      
      // 验证 segments 是数组
      const segments = res.data.segments
      if (Array.isArray(segments)) {
        console.log(`  ✅ segments 是数组, 长度: ${segments.length}`)
        
        // 验证每个分层对象的字段
        const expectedCodes = ['high_value', 'active', 'silent', 'churned']
        const actualCodes = segments.map(s => s.code)
        console.log(`  📋 后端分层代码: ${actualCodes.join(', ')}`)
        console.log(`  📋 期望分层代码: ${expectedCodes.join(', ')}`)
        
        const missingCodes = expectedCodes.filter(c => !actualCodes.includes(c))
        if (missingCodes.length > 0) {
          console.log(`  ⚠️  缺少分层: ${missingCodes.join(', ')}`)
        }
        
        // 验证每个分层对象的字段结构
        segments.forEach(seg => {
          validateStructure(seg, ['code', 'name', 'count', 'percentage', 'color', 'criteria'], `分层[${seg.code}]`)
          console.log(`    → ${seg.name}: ${seg.count}人 (${seg.percentage}%)`)
        })
        
        results.passed++
      } else {
        console.log(`  ❌ segments 不是数组，类型: ${typeof segments}`)
        results.failed++
      }
      
      console.log(`  📊 总用户数: ${res.data.total_users}`)
      results.tests.push({ name: '用户分层统计', success: true })
    } else {
      console.log(`  ❌ API 返回失败: ${res.message}`)
      results.failed++
      results.tests.push({ name: '用户分层统计', success: false, error: res.message })
    }
  } catch (error) {
    console.log(`  ❌ 请求异常: ${error.message}`)
    results.failed++
    results.tests.push({ name: '用户分层统计', success: false, error: error.message })
  }

  // ==================== 测试2: 活跃时段热力图 ====================
  console.log('\n━━━ 测试2: 活跃时段热力图 GET /console/users/activity-heatmap ━━━')
  try {
    const res = await callApi('/console/users/activity-heatmap')
    
    if (res.success && res.data) {
      console.log(`  ✅ API 返回成功`)
      
      validateStructure(res.data, ['heatmap', 'day_labels', 'hour_labels', 'peak', 'statistics'], '顶层数据')
      
      const heatmap = res.data.heatmap
      if (Array.isArray(heatmap) && heatmap.length === 7) {
        console.log(`  ✅ heatmap 是 7×24 矩阵`)
        
        // 检查每天的小时数据
        let totalActivity = 0
        let maxValue = 0
        heatmap.forEach((day, i) => {
          if (Array.isArray(day) && day.length === 24) {
            const dayTotal = day.reduce((sum, v) => sum + v, 0)
            totalActivity += dayTotal
            const dayMax = Math.max(...day)
            if (dayMax > maxValue) maxValue = dayMax
          } else {
            console.log(`  ⚠️  第${i}天数据异常: 长度=${day?.length}`)
          }
        })
        
        console.log(`  📊 总活跃量: ${totalActivity}`)
        console.log(`  📊 峰值: ${maxValue}`)
        console.log(`  📊 峰值时段: ${res.data.peak?.day} ${res.data.peak?.hour} (${res.data.peak?.count})`)
        console.log(`  📊 分析周期: ${res.data.statistics?.analysis_period}`)
        
        results.passed++
        results.tests.push({ name: '活跃时段热力图', success: true })
      } else {
        console.log(`  ❌ heatmap 结构异常: 是数组=${Array.isArray(heatmap)}, 长度=${heatmap?.length}`)
        results.failed++
        results.tests.push({ name: '活跃时段热力图', success: false, error: 'heatmap结构异常' })
      }
    } else {
      console.log(`  ❌ API 返回失败: ${res.message}`)
      results.failed++
      results.tests.push({ name: '活跃时段热力图', success: false, error: res.message })
    }
  } catch (error) {
    console.log(`  ❌ 请求异常: ${error.message}`)
    results.failed++
    results.tests.push({ name: '活跃时段热力图', success: false, error: error.message })
  }

  // ==================== 测试3: 兑换偏好分析 ====================
  console.log('\n━━━ 测试3: 兑换偏好分析 GET /console/users/exchange-preferences ━━━')
  try {
    const res = await callApi('/console/users/exchange-preferences')
    
    if (res.success && res.data) {
      console.log(`  ✅ API 返回成功`)
      
      validateStructure(res.data, ['preferences', 'statistics', 'generated_at'], '顶层数据')
      
      // 验证 statistics 结构
      if (res.data.statistics) {
        validateStructure(res.data.statistics, ['total_exchanges', 'total_unique_users', 'analysis_period', 'top_item'], '统计数据')
        console.log(`  📊 总兑换次数: ${res.data.statistics.total_exchanges}`)
        console.log(`  📊 参与用户数: ${res.data.statistics.total_unique_users}`)
        console.log(`  📊 最热商品: ${res.data.statistics.top_item}`)
      }
      
      // 验证 preferences 数组
      console.log(`  📊 偏好列表长度: ${res.data.preferences?.length || 0}`)
      if (res.data.preferences?.length > 0) {
        validateStructure(res.data.preferences[0], ['item_name', 'exchange_count', 'unique_users'], '偏好项[0]')
      }
      
      results.passed++
      results.tests.push({ name: '兑换偏好分析', success: true })
    } else {
      console.log(`  ❌ API 返回失败: ${res.message}`)
      results.failed++
      results.tests.push({ name: '兑换偏好分析', success: false, error: res.message })
    }
  } catch (error) {
    console.log(`  ❌ 请求异常: ${error.message}`)
    results.failed++
    results.tests.push({ name: '兑换偏好分析', success: false, error: error.message })
  }

  // ==================== 测试4: 行为漏斗 ====================
  console.log('\n━━━ 测试4: 行为漏斗 GET /console/users/funnel ━━━')
  try {
    const res = await callApi('/console/users/funnel')
    
    if (res.success && res.data) {
      console.log(`  ✅ API 返回成功`)
      
      validateStructure(res.data, ['funnel', 'conversion_rates', 'analysis_period', 'insights'], '顶层数据')
      
      // 注意：后端返回的漏斗数据字段名是 "funnel"（不是 "stages"）
      const funnel = res.data.funnel
      if (Array.isArray(funnel)) {
        console.log(`  ✅ funnel 是数组, 长度: ${funnel.length}`)
        funnel.forEach(stage => {
          console.log(`    → ${stage.name}: ${stage.count}人 (${stage.percentage}%)`)
        })
      } else {
        console.log(`  ❌ funnel 不是数组`)
      }
      
      // 验证转化率
      if (res.data.conversion_rates) {
        console.log(`  📊 转化率:`)
        Object.entries(res.data.conversion_rates).forEach(([key, val]) => {
          console.log(`    → ${key}: ${val}%`)
        })
      }
      
      // 验证洞察
      if (res.data.insights?.length > 0) {
        console.log(`  💡 洞察建议 (${res.data.insights.length}条):`)
        res.data.insights.forEach(i => console.log(`    → [${i.type}] ${i.message}`))
      }
      
      results.passed++
      results.tests.push({ name: '行为漏斗', success: true })
    } else {
      console.log(`  ❌ API 返回失败: ${res.message}`)
      results.failed++
      results.tests.push({ name: '行为漏斗', success: false, error: res.message })
    }
  } catch (error) {
    console.log(`  ❌ 请求异常: ${error.message}`)
    results.failed++
    results.tests.push({ name: '行为漏斗', success: false, error: error.message })
  }

  // ==================== 测试结果汇总 ====================
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  📊 测试结果汇总')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  ✅ 通过: ${results.passed}`)
  console.log(`  ❌ 失败: ${results.failed}`)
  console.log(`  📋 总计: ${results.passed + results.failed}`)
  
  results.tests.forEach(t => {
    console.log(`  ${t.success ? '✅' : '❌'} ${t.name}${t.error ? ` - ${t.error}` : ''}`)
  })
  
  console.log('\n  🔑 前端适配要点:')
  console.log('  1. segments 返回数组（不是对象），需按 code 字段建立索引')
  console.log('  2. 分层代码: high_value / active / silent / churned（4个）')
  console.log('  3. 漏斗数据字段名是 "funnel"（不是 "stages"）')
  console.log('  4. 每个 segment 包含: code, name, count, percentage, color, criteria')
  console.log('═══════════════════════════════════════════════════\n')

  process.exit(results.failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('❌ 测试脚本执行异常:', err.message)
  process.exit(1)
})

