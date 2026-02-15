#!/usr/bin/env node
/**
 * 临时测试脚本 - 使用 Playwright 验证资产调账和C2C交易页面
 * 测试完成后删除
 */

const { chromium } = require('playwright')

const BASE_URL = process.env.BASE_URL || 'https://omqktqrtntnn.sealosbja.site'
const TEST_MOBILE = '13612227930'
const TEST_CODE = '123456'

async function login(page) {
  console.log('🔐 登录中...')
  await page.goto(`${BASE_URL}/admin/login.html`, { waitUntil: 'networkidle', timeout: 30000 })
  
  // 等待页面加载
  await page.waitForTimeout(2000)
  
  // 填写登录表单
  const mobileInput = page.locator('input[type="text"], input[type="tel"], input[placeholder*="手机"]').first()
  if (await mobileInput.count() > 0) {
    await mobileInput.fill(TEST_MOBILE)
  }
  
  const codeInput = page.locator('input[placeholder*="验证码"], input[placeholder*="code"]').first()
  if (await codeInput.count() > 0) {
    await codeInput.fill(TEST_CODE)
  }
  
  // 点击登录按钮
  const loginBtn = page.locator('button:has-text("登录"), button[type="submit"]').first()
  if (await loginBtn.count() > 0) {
    await loginBtn.click()
    await page.waitForTimeout(3000)
  }
  
  console.log('✅ 登录完成，当前URL:', page.url())
}

async function testAssetAdjustmentPage(page) {
  console.log('\n--- 测试资产调账页面 ---')
  await page.goto(`${BASE_URL}/admin/asset-adjustment.html`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  
  // 检查控制台错误
  const errors = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  
  // 检查页面元素
  const pageTitle = await page.locator('nav span:has-text("资产调账")').count()
  console.log(`  页面标题: ${pageTitle > 0 ? '✅ 存在' : '❌ 缺失'}`)
  
  // 检查统计卡片
  const statsCards = await page.locator('.grid .themed-card').count()
  console.log(`  统计卡片数量: ${statsCards}`)
  
  // 尝试搜索用户
  const searchInput = page.locator('input[x-model="searchMobile"]')
  if (await searchInput.count() > 0) {
    await searchInput.fill(TEST_MOBILE)
    const searchBtn = page.locator('button:has-text("查找")').first()
    if (await searchBtn.count() > 0) {
      await searchBtn.click()
      await page.waitForTimeout(3000)
    }
  }
  
  // 检查数据是否加载
  const userInfo = await page.locator('[x-show="resolvedUser"]').isVisible().catch(() => false)
  console.log(`  用户信息: ${userInfo ? '✅ 已加载' : '⚠️ 未显示'}`)
  
  // 获取页面错误
  const pageErrors = await page.evaluate(() => {
    return window.__alpineErrors || []
  }).catch(() => [])
  
  // 统计ReferenceError
  await page.waitForTimeout(2000)
  const consoleErrors = await page.evaluate(() => {
    // 无法直接获取console.error，但可以检查Alpine是否正常
    try {
      const body = document.querySelector('body')
      const xData = body?.__x_dataStack?.[0] || body?._x_dataStack?.[0]
      return {
        hasAlpineData: !!xData,
        hasCurrentUser: xData && 'current_user' in xData,
        hasSelectedRecord: xData && 'selectedRecord' in xData,
        hasAdminUser: xData && 'admin_user' in xData
      }
    } catch(e) { return { error: e.message } }
  }).catch(e => ({ error: e.message }))
  
  console.log('  Alpine数据状态:', JSON.stringify(consoleErrors))
  
  if (errors.length > 0) {
    console.log(`  ⚠️ 控制台错误: ${errors.length} 个`)
    errors.slice(0, 3).forEach(e => console.log(`    - ${e.substring(0, 100)}`))
  }
}

async function testTradeManagementPage(page) {
  console.log('\n--- 测试C2C交易管理页面 ---')
  await page.goto(`${BASE_URL}/admin/trade-management.html`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  
  const errors = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  
  // 检查页面元素
  const pageTitle = await page.locator('nav span:has-text("交易管理")').count()
  console.log(`  页面标题: ${pageTitle > 0 ? '✅ 存在' : '❌ 缺失'}`)
  
  // 检查Tab导航
  const tabs = await page.locator('button:has-text("C2C交易订单"), button:has-text("上架统计")').count()
  console.log(`  Tab数量: ${tabs}`)
  
  // 检查统计卡片的值
  const totalTrades = await page.locator('h4:has-text("0")').count()
  const statsValues = await page.evaluate(() => {
    const cards = document.querySelectorAll('.grid .themed-card h4')
    return Array.from(cards).map(h => h.textContent.trim())
  }).catch(() => [])
  console.log(`  统计卡片值: ${JSON.stringify(statsValues)}`)
  
  // 检查交易表格是否有数据
  const tableRows = await page.locator('tbody tr').count()
  console.log(`  表格行数: ${tableRows}`)
  
  // 检查Alpine数据状态
  const alpineState = await page.evaluate(() => {
    try {
      const body = document.querySelector('body')
      const xData = body?.__x_dataStack?.[0] || body?._x_dataStack?.[0]
      return {
        hasAlpineData: !!xData,
        currentPage: xData?.current_page,
        tradeOrdersCount: xData?.tradeOrders?.length,
        hasStats: !!xData?.stats,
        statsValues: xData?.stats,
        hasTradeOrderTableColumns: !!xData?.tradeOrderTableColumns,
        tradeColumnCount: xData?.tradeOrderTableColumns?.length
      }
    } catch(e) { return { error: e.message } }
  }).catch(e => ({ error: e.message }))
  
  console.log('  Alpine数据状态:', JSON.stringify(alpineState))
  
  // 切换到上架统计tab
  const statsTab = page.locator('button:has-text("上架统计")').first()
  if (await statsTab.count() > 0) {
    await statsTab.click()
    await page.waitForTimeout(2000)
    
    const marketStats = await page.evaluate(() => {
      try {
        const body = document.querySelector('body')
        const xData = body?.__x_dataStack?.[0] || body?._x_dataStack?.[0]
        return {
          marketplaceStatsCount: xData?.marketplaceStats?.length,
          summary: xData?.marketplaceSummary
        }
      } catch(e) { return { error: e.message } }
    }).catch(e => ({ error: e.message }))
    
    console.log('  上架统计数据:', JSON.stringify(marketStats))
  }
  
  if (errors.length > 0) {
    console.log(`  ⚠️ 控制台错误: ${errors.length} 个`)
    errors.slice(0, 3).forEach(e => console.log(`    - ${e.substring(0, 100)}`))
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('🧪 前端页面测试')
  console.log(`📍 测试地址: ${BASE_URL}`)
  console.log('='.repeat(60))
  
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  
  try {
    await login(page)
    await testTradeManagementPage(page)
    await testAssetAdjustmentPage(page)
  } catch (e) {
    console.error('❌ 测试失败:', e.message)
  } finally {
    await browser.close()
    console.log('\n' + '='.repeat(60))
    console.log('✅ 测试完成')
  }
}

main().catch(console.error)

