/**
 * 验证日期筛选返回数据的日期范围
 */
import { test, expect } from '@playwright/test'

test('验证日期筛选结果', async ({ page }) => {
  // 登录
  await page.goto('login.html')
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="tel"]').fill('13612227930')
  await page.locator('input[x-model="code"]').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/workspace/, { timeout: 15000 })
  console.log('✅ 登录成功')

  // 导航到财务管理页面
  await page.goto('finance-management.html')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // 拦截 API 响应
  let lastApiResponse = null
  page.on('response', async (response) => {
    if (response.url().includes('/consumption/records')) {
      try {
        const json = await response.json()
        lastApiResponse = json
        console.log(`\n📊 API 响应: ${response.url().split('?')[1] || 'no params'}`)
        console.log(`  success: ${json.success}, total: ${json.data?.total || 0}`)
        
        if (json.data?.records?.length > 0) {
          // 获取第一条和最后一条记录的日期
          const records = json.data.records
          const firstDate = records[0]?.created_at || records[0]?.consumption_date
          const lastDate = records[records.length - 1]?.created_at || records[records.length - 1]?.consumption_date
          console.log(`  日期范围: ${firstDate} ~ ${lastDate}`)
          console.log(`  记录数: ${records.length}`)
        }
      } catch (e) {
        // ignore
      }
    }
  })

  console.log('\n========== 初始数据加载完成 ==========')

  // 获取初始记录数
  const initialCount = await page.locator('tbody tr').count()
  console.log(`📊 初始表格行数: ${initialCount}`)

  // 获取日期输入框
  const dateInput = page.locator('input[type="date"]').first()
  const searchBtn = page.locator('button:has-text("搜索")').first()
  
  // 测试1: 设置为今天的日期
  const today = new Date().toISOString().split('T')[0]
  console.log(`\n🔍 测试1: 设置开始日期为今天 ${today}`)
  await dateInput.fill(today)
  
  // 等待 Alpine 更新
  await page.waitForTimeout(500)
  
  // 验证输入值
  const dateValue = await dateInput.inputValue()
  console.log(`📅 输入框值: ${dateValue}`)
  
  await searchBtn.click()
  await page.waitForTimeout(2000)
  
  const count1 = await page.locator('tbody tr').count()
  console.log(`📊 结果: ${count1} 条记录`)

  // 测试2: 设置为明天的日期（应该没有数据）
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  console.log(`\n🔍 测试2: 设置开始日期为明天 ${tomorrow}`)
  await dateInput.fill(tomorrow)
  await page.waitForTimeout(500)
  await searchBtn.click()
  await page.waitForTimeout(2000)
  
  const count2 = await page.locator('tbody tr').count()
  console.log(`📊 结果: ${count2} 条记录`)

  // 测试3: 清空日期（应该有所有数据）
  console.log(`\n🔍 测试3: 清空日期筛选`)
  await dateInput.fill('')
  await page.waitForTimeout(500)
  await searchBtn.click()
  await page.waitForTimeout(2000)
  
  const count3 = await page.locator('tbody tr').count()
  console.log(`📊 结果: ${count3} 条记录`)

  // 总结
  console.log('\n========== 总结 ==========')
  console.log(`今天(${today}): ${count1} 条`)
  console.log(`明天(${tomorrow}): ${count2} 条`)
  console.log(`无筛选: ${count3} 条`)
  console.log('===========================')

  // 🔴 关键断言：设置"明天"为开始日期，应该返回更少的记录（或0条）
  // 因为不可能有未来日期的消费记录
  expect(count2, `日期筛选失败：设置明天(${tomorrow})为开始日期应该返回更少的记录，但实际返回了 ${count2} 条（与今天相同）`).toBeLessThan(count1)
})
