/**
 * 异常统计 API 检查测试
 */
import { test, expect } from '@playwright/test'

test('检查异常统计面板数据来源', async ({ page }) => {
  // 登录
  await page.goto('login.html')
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="tel"]').fill('13612227930')
  await page.locator('input[x-model="code"]').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/workspace/, { timeout: 15000 })
  console.log('✅ 登录成功')

  // 拦截异常统计 API
  let anomalyApiCalled = false
  let anomalyApiResponse = null

  await page.route('**/consumption-anomaly/summary**', async (route) => {
    console.log('📤 异常统计 API 被调用')
    anomalyApiCalled = true

    const response = await route.fetch()
    const body = await response.json().catch(() => null)

    console.log('📥 异常统计 API 响应状态:', response.status())
    console.log('📋 异常统计 API 响应内容:', JSON.stringify(body, null, 2))

    anomalyApiResponse = {
      status: response.status(),
      body: body
    }

    await route.fulfill({ response })
  })

  // 同时拦截消费记录 API，检查记录中的风险标记
  let consumptionRecords = []
  await page.route('**/consumption/records**', async (route) => {
    const response = await route.fetch()
    const body = await response.json().catch(() => null)

    if (body?.data?.records) {
      consumptionRecords = body.data.records
      console.log(`📊 消费记录 API 返回 ${consumptionRecords.length} 条记录`)

      // 检查记录中的风险相关字段
      const withRisk = consumptionRecords.filter(
        (r) => r.is_suspicious || r.risk_level || r.anomaly_type || r.anomaly_flags
      )
      console.log(`📊 包含风险标记的记录: ${withRisk.length} 条`)

      if (withRisk.length > 0) {
        console.log('📋 风险记录示例:', JSON.stringify(withRisk[0], null, 2))
      }

      // 统计各状态
      const pending = consumptionRecords.filter((r) => r.status === 'pending').length
      const approved = consumptionRecords.filter((r) => r.status === 'approved').length
      const rejected = consumptionRecords.filter((r) => r.status === 'rejected').length
      console.log(`📊 记录状态分布: 待审核=${pending}, 已通过=${approved}, 已拒绝=${rejected}`)
    }

    await route.fulfill({ response })
  })

  // 导航到财务管理页面
  await page.goto('finance-management.html')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // 输出结果
  console.log('\n========== 结果汇总 ==========')
  console.log(`异常统计 API 调用: ${anomalyApiCalled ? '是' : '否'}`)

  if (anomalyApiResponse) {
    console.log(`异常统计 API 状态: ${anomalyApiResponse.status}`)
    if (anomalyApiResponse.body?.success) {
      const data = anomalyApiResponse.body.data
      console.log('异常统计数据:')
      console.log(`  - 总异常数: ${data?.anomaly_count || 0}`)
      console.log(`  - 风险分布: ${JSON.stringify(data?.risk_distribution || {})}`)
      console.log(`  - 标记分布: ${JSON.stringify(data?.flag_distribution || {})}`)
    } else {
      console.log(`异常统计 API 失败: ${anomalyApiResponse.body?.message || '未知错误'}`)
    }
  }

  // 检查页面上的异常统计面板值
  const panelValues = await page.evaluate(() => {
    const panels = document.querySelectorAll('[class*="grid"] > div')
    const values = {}

    panels.forEach((panel) => {
      const title = panel.querySelector('h6')?.textContent?.trim()
      const value = panel.querySelector('p')?.textContent?.trim()
      if (title && value !== undefined) {
        values[title] = value
      }
    })

    return values
  })

  console.log('页面异常统计面板显示:')
  Object.entries(panelValues).forEach(([k, v]) => {
    console.log(`  - ${k}: ${v}`)
  })

  console.log('================================')
})

