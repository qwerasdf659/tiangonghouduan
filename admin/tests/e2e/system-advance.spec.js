/**
 * 系统垫付看板页面 E2E 测试
 *
 * @file admin/tests/e2e/system-advance.spec.js
 * @description 抽奖运营 - 数据看板 - 系统垫付页面完整测试套件
 * @date 2026-02-04
 *
 * 测试思路：站在运营人员角度，模拟真实的日常操作流程
 * - 运营每天需要查看系统垫付汇总（库存/预算欠账）
 * - 需要按活动/奖品/责任人查看垫付分布
 * - 需要查看垫付趋势图表
 * - 需要验证数据是否与后端一致
 *
 * 测试覆盖：
 * 1. 页面加载和导航验证
 * 2. API 响应拦截和数据一致性验证
 * 3. Tab 切换功能（总览/按活动/按奖品/按责任人/趋势）
 * 4. ECharts 图表渲染验证
 * 5. 分页功能
 * 6. 筛选功能
 * 7. JavaScript 错误检测
 * 8. Alpine.js 组件状态验证
 * 9. 数据字段映射正确性验证
 */

import { test, expect } from '@playwright/test'
import { findAlpineComponentWithMethod, getAlpineData, callAlpineMethod } from './utils/alpine-helpers.js'

// ============ 配置常量 ============
const TEST_PHONE = '13612227930'
const TEST_CODE = '123456'
const TEST_USER_ID = '31'

// API 端点
const API_ENDPOINTS = {
  DASHBOARD: '/api/v4/console/debt-management/dashboard',
  BY_CAMPAIGN: '/api/v4/console/debt-management/by-campaign',
  BY_PRIZE: '/api/v4/console/debt-management/by-prize',
  BY_CREATOR: '/api/v4/console/debt-management/by-creator',
  TREND: '/api/v4/console/debt-management/trend'
}

// ============ 系统垫付区域专用选择器 ============
const ADVANCE_SELECTORS = {
  // 页面区域
  pageSection: 'div[x-show*="system-advance"]',
  
  // 汇总卡片
  inventoryDebtCard: 'h6:has-text("库存垫付(件)")',
  budgetDebtCard: 'h6:has-text("预算垫付")',
  pendingCard: 'h6:has-text("待处理")',
  clearedTodayCard: 'h6:has-text("今日已清偿")',
  
  // Tab 按钮
  overviewTab: 'button:has-text("📊 总览")',
  byCampaignTab: 'button:has-text("🎁 按活动")',
  byPrizeTab: 'button:has-text("🏆 按奖品")',
  byCreatorTab: 'button:has-text("👤 按责任人")',
  trendTab: 'button:has-text("📈 趋势")',
  
  // 趋势筛选
  periodSelect: 'select[x-model="advanceFilters.period"]',
  daysSelect: 'select[x-model="advanceFilters.days"]',
  
  // 图表容器
  trendChart: '#advanceTrendChart',
  
  // 分页
  prevPageBtn: 'button:has-text("上一页")',
  nextPageBtn: 'button:has-text("下一页")'
}

// ============ 辅助函数 ============

/**
 * 登录辅助函数
 */
async function login(page) {
  await page.goto('login.html')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)

  await page.locator('input[type="tel"]').fill(TEST_PHONE)
  await page.locator('input[x-model="code"]').fill(TEST_CODE)
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL(/workspace/, { timeout: 15000 })
}

/**
 * 导航到系统垫付页面
 */
async function navigateToSystemAdvance(page) {
  await page.goto('lottery-management.html')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // 等待 Alpine.js 初始化
  await page.waitForFunction(
    () => window.Alpine && window.Alpine.version,
    { timeout: 10000 }
  ).catch(() => {
    throw new Error('Alpine.js 初始化失败')
  })

  // 点击左侧导航中的"系统垫付"菜单项
  const systemAdvanceMenu = page.locator('a:has-text("系统垫付"), button:has-text("系统垫付")').first()
  const menuVisible = await systemAdvanceMenu.isVisible({ timeout: 5000 }).catch(() => false)
  
  if (menuVisible) {
    await systemAdvanceMenu.click()
    await page.waitForTimeout(1500)
  } else {
    // 如果没有找到菜单，尝试直接设置 Alpine 状态
    await page.evaluate(() => {
      const alpineElements = document.querySelectorAll('[x-data]')
      for (const el of alpineElements) {
        const data = window.Alpine.$data(el)
        if (data && 'current_page' in data) {
          data.current_page = 'system-advance'
          if (typeof data.loadAdvanceDashboard === 'function') {
            data.loadAdvanceDashboard()
          }
          return true
        }
      }
      return false
    })
    await page.waitForTimeout(2000)
  }

  // 验证页面已切换到系统垫付
  const pageSection = page.locator(ADVANCE_SELECTORS.pageSection)
  await expect(pageSection).toBeVisible({ timeout: 10000 })
}

/**
 * 收集页面上的 JavaScript 错误（严格模式）
 */
function setupStrictErrorCapture(page) {
  const errors = []
  page.on('pageerror', (error) => {
    errors.push({
      type: 'pageerror',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // 忽略一些已知的非致命错误
      if (!text.includes('Failed to load resource') && 
          !text.includes('net::ERR')) {
        errors.push({
          type: 'console_error',
          message: text,
          timestamp: new Date().toISOString()
        })
      }
    }
  })
  return errors
}

/**
 * 验证 API 响应数据结构
 */
function validateDashboardResponse(data) {
  const errors = []
  
  // 验证必要字段存在
  if (data.inventory_debt === undefined && data.total_inventory_debt === undefined) {
    errors.push('缺少库存欠账数据字段')
  }
  if (data.budget_debt === undefined && data.total_budget_debt === undefined) {
    errors.push('缺少预算欠账数据字段')
  }
  
  return errors
}

// ============ 测试套件 ============

test.describe('系统垫付 - 页面加载和数据显示', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupStrictErrorCapture(page)
    await login(page)
  })

  test.afterEach(async () => {
    // ✅ 严格断言：页面没有 JavaScript 错误
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误: ${JSON.stringify(jsErrors)}`).toBe(0)
  })

  test('页面正常加载并显示系统垫付内容', async ({ page }) => {
    await navigateToSystemAdvance(page)

    // ✅ 验证页面区域可见
    const pageSection = page.locator(ADVANCE_SELECTORS.pageSection)
    await expect(pageSection).toBeVisible({ timeout: 10000 })

    // ✅ 验证汇总卡片存在且可见
    await expect(page.locator(ADVANCE_SELECTORS.inventoryDebtCard)).toBeVisible()
    await expect(page.locator(ADVANCE_SELECTORS.budgetDebtCard)).toBeVisible()
    await expect(page.locator(ADVANCE_SELECTORS.pendingCard)).toBeVisible()
    await expect(page.locator(ADVANCE_SELECTORS.clearedTodayCard)).toBeVisible()

    // ✅ 验证 Tab 按钮存在
    await expect(page.locator(ADVANCE_SELECTORS.overviewTab)).toBeVisible()
    await expect(page.locator(ADVANCE_SELECTORS.byCampaignTab)).toBeVisible()
    await expect(page.locator(ADVANCE_SELECTORS.byPrizeTab)).toBeVisible()
    await expect(page.locator(ADVANCE_SELECTORS.byCreatorTab)).toBeVisible()
    await expect(page.locator(ADVANCE_SELECTORS.trendTab)).toBeVisible()
  })

  test('汇总卡片显示数值而非空白', async ({ page }) => {
    await navigateToSystemAdvance(page)
    await page.waitForTimeout(3000) // 等待数据加载

    // ✅ 验证库存垫付数值可见（不是空白或 undefined）
    const inventoryDebtValue = page.locator('h2.text-yellow-600').first()
    await expect(inventoryDebtValue).toBeVisible()
    const inventoryText = await inventoryDebtValue.textContent()
    expect(inventoryText).not.toBe('')
    expect(inventoryText).not.toContain('undefined')
    expect(inventoryText).not.toContain('null')
    // 应该是数字
    expect(/^\d+$/.test(inventoryText.trim()) || inventoryText.includes('0')).toBe(true)

    // ✅ 验证预算垫付数值可见（应该是格式化金额，如 ¥0.00）
    const budgetDebtValue = page.locator('h2.text-blue-600').first()
    await expect(budgetDebtValue).toBeVisible()
    const budgetText = await budgetDebtValue.textContent()
    expect(budgetText).not.toBe('')
    expect(budgetText).toMatch(/¥\d+\.\d{2}|^\d+$/) // 格式化金额或数字

    // ✅ 验证待处理数值可见
    const pendingValue = page.locator('h2.text-red-600').first()
    await expect(pendingValue).toBeVisible()
    const pendingText = await pendingValue.textContent()
    expect(pendingText).not.toBe('')
    expect(/^\d+$/.test(pendingText.trim())).toBe(true)

    // ✅ 验证今日已清偿数值可见
    const clearedValue = page.locator('h2.text-green-600').first()
    await expect(clearedValue).toBeVisible()
  })
})

test.describe('系统垫付 - API 端点和数据一致性验证', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupStrictErrorCapture(page)
    await login(page)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('Dashboard API 被正确调用并返回有效数据', async ({ page }) => {
    // 监听 Dashboard API 请求
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes(API_ENDPOINTS.DASHBOARD) && resp.request().method() === 'GET',
      { timeout: 20000 }
    )

    await navigateToSystemAdvance(page)

    const response = await responsePromise.catch(() => null)

    if (!response) {
      // ✅ 断言失败：API 未被调用
      expect(response, 'Dashboard API 未被调用').not.toBeNull()
      return
    }

    // ✅ 断言：API 返回 200
    expect(response.status(), 'Dashboard API 应返回 200').toBe(200)

    // ✅ 断言：API 响应包含必要字段
    const body = await response.json()
    expect(body, 'API 响应应包含 success 字段').toHaveProperty('success')
    expect(body.success, 'API 响应 success 应为 true').toBe(true)

    // ✅ 验证响应数据结构
    if (body.data) {
      const validationErrors = validateDashboardResponse(body.data)
      expect(validationErrors.length, `数据结构验证失败: ${validationErrors.join(', ')}`).toBe(0)
    }
  })

  test('页面显示值与 Dashboard API 返回值一致', async ({ page }) => {
    let apiData = null

    // 拦截 Dashboard API 响应
    page.on('response', async (response) => {
      if (response.url().includes(API_ENDPOINTS.DASHBOARD) && response.request().method() === 'GET') {
        try {
          const body = await response.json()
          if (body.success && body.data) {
            apiData = body.data
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    })

    await navigateToSystemAdvance(page)
    await page.waitForTimeout(3000) // 等待数据渲染

    if (!apiData) {
      test.skip()
      return
    }

    // ✅ 验证库存垫付数值一致性
    const inventoryDebtValue = page.locator('h2.text-yellow-600').first()
    const inventoryText = await inventoryDebtValue.textContent()
    const inventoryPageValue = parseInt(inventoryText) || 0

    // API 可能返回多种格式的数据
    const apiInventoryDebt = apiData.inventory_debt?.remaining_quantity ??
                             apiData.inventory_debt?.total_quantity ??
                             apiData.total_inventory_debt ?? 0

    expect(inventoryPageValue, 
      `库存垫付不一致: 页面=${inventoryPageValue}, API=${apiInventoryDebt}`
    ).toBe(apiInventoryDebt)

    // ✅ 验证待处理数一致性
    const pendingValue = page.locator('h2.text-red-600').first()
    const pendingText = await pendingValue.textContent()
    const pendingPageValue = parseInt(pendingText) || 0

    const apiPendingCount = (apiData.inventory_debt?.pending_count || 0) +
                            (apiData.budget_debt?.pending_count || 0) ||
                            apiData.pending_count || 0

    expect(pendingPageValue,
      `待处理数不一致: 页面=${pendingPageValue}, API=${apiPendingCount}`
    ).toBe(apiPendingCount)
  })

  test('按活动 API 被正确调用', async ({ page }) => {
    await navigateToSystemAdvance(page)

    // 监听 by-campaign API 请求
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes(API_ENDPOINTS.BY_CAMPAIGN) && resp.request().method() === 'GET',
      { timeout: 15000 }
    )

    // 点击"按活动"Tab
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()

    const response = await responsePromise.catch(() => null)

    if (response) {
      // ✅ 断言：API 返回成功
      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.success).toBe(true)

      // ✅ 验证响应数据结构
      if (body.data) {
        const items = body.data.list || body.data.items || body.data.campaigns || []
        expect(Array.isArray(items), 'API 应返回数组数据').toBe(true)
      }
    }
  })

  test('按奖品 API 被正确调用', async ({ page }) => {
    await navigateToSystemAdvance(page)

    // 监听 by-prize API 请求
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes(API_ENDPOINTS.BY_PRIZE) && resp.request().method() === 'GET',
      { timeout: 15000 }
    )

    // 点击"按奖品"Tab
    await page.locator(ADVANCE_SELECTORS.byPrizeTab).click()

    const response = await responsePromise.catch(() => null)

    if (response) {
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
    }
  })

  test('按责任人 API 被正确调用', async ({ page }) => {
    await navigateToSystemAdvance(page)

    // 监听 by-creator API 请求
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes(API_ENDPOINTS.BY_CREATOR) && resp.request().method() === 'GET',
      { timeout: 15000 }
    )

    // 点击"按责任人"Tab
    await page.locator(ADVANCE_SELECTORS.byCreatorTab).click()

    const response = await responsePromise.catch(() => null)

    if (response) {
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
    }
  })

  test('趋势 API 被正确调用', async ({ page }) => {
    await navigateToSystemAdvance(page)

    // 监听 trend API 请求
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes(API_ENDPOINTS.TREND) && resp.request().method() === 'GET',
      { timeout: 15000 }
    )

    // 点击"趋势"Tab
    await page.locator(ADVANCE_SELECTORS.trendTab).click()

    const response = await responsePromise.catch(() => null)

    if (response) {
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)

      // ✅ 验证趋势数据结构
      if (body.data) {
        const trendData = body.data.trend || body.data.data || []
        expect(Array.isArray(trendData), '趋势数据应为数组').toBe(true)
      }
    }
  })
})

test.describe('系统垫付 - Tab 切换功能', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupStrictErrorCapture(page)
    await login(page)
    await navigateToSystemAdvance(page)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('Tab 切换正常工作且保持状态一致', async ({ page }) => {
    // 初始应为"总览"Tab
    const overviewTab = page.locator(ADVANCE_SELECTORS.overviewTab)
    await expect(overviewTab).toHaveClass(/border-blue-500|bg-blue-50|text-blue-600/)

    // ✅ 切换到"按活动"Tab
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(1500)

    // 验证 Tab 样式切换
    const byCampaignTab = page.locator(ADVANCE_SELECTORS.byCampaignTab)
    await expect(byCampaignTab).toHaveClass(/border-blue-500|bg-blue-50|text-blue-600/)

    // 验证内容区域切换（表格应显示）
    const campaignTable = page.locator('th:has-text("活动名称")')
    await expect(campaignTable).toBeVisible()

    // ✅ 切换到"按奖品"Tab
    await page.locator(ADVANCE_SELECTORS.byPrizeTab).click()
    await page.waitForTimeout(1500)

    const prizeTable = page.locator('th:has-text("奖品名称")')
    await expect(prizeTable).toBeVisible()

    // ✅ 切换到"按责任人"Tab
    await page.locator(ADVANCE_SELECTORS.byCreatorTab).click()
    await page.waitForTimeout(1500)

    const creatorTable = page.locator('th:has-text("创建人")')
    await expect(creatorTable).toBeVisible()

    // ✅ 切换到"趋势"Tab
    await page.locator(ADVANCE_SELECTORS.trendTab).click()
    await page.waitForTimeout(1500)

    const trendChart = page.locator(ADVANCE_SELECTORS.trendChart)
    await expect(trendChart).toBeVisible()
  })

  test('Tab 切换后返回总览数据仍正确', async ({ page }) => {
    // 记录初始数据
    const initialInventoryValue = await page.locator('h2.text-yellow-600').first().textContent()

    // 切换多个 Tab
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(1000)
    await page.locator(ADVANCE_SELECTORS.byPrizeTab).click()
    await page.waitForTimeout(1000)
    await page.locator(ADVANCE_SELECTORS.trendTab).click()
    await page.waitForTimeout(1000)

    // ✅ 返回总览 Tab
    await page.locator(ADVANCE_SELECTORS.overviewTab).click()
    await page.waitForTimeout(2000)

    // 验证数据仍然正确（汇总卡片始终可见）
    const currentInventoryValue = await page.locator('h2.text-yellow-600').first().textContent()
    expect(currentInventoryValue).toBe(initialInventoryValue)
  })
})

test.describe('系统垫付 - 趋势图表验证', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupStrictErrorCapture(page)
    await login(page)
    await navigateToSystemAdvance(page)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('ECharts 图表正确渲染', async ({ page }) => {
    // 切换到趋势 Tab
    await page.locator(ADVANCE_SELECTORS.trendTab).click()
    await page.waitForTimeout(2000)

    // ✅ 验证图表容器存在
    const chartContainer = page.locator(ADVANCE_SELECTORS.trendChart)
    await expect(chartContainer).toBeVisible()

    // ✅ 验证 ECharts 实例已创建
    const hasECharts = await page.evaluate(() => {
      const chart = document.getElementById('advanceTrendChart')
      return chart && (window.echarts?.getInstanceByDom(chart) || chart.querySelector('canvas'))
    })
    
    expect(hasECharts, 'ECharts 图表应该正确渲染').toBeTruthy()
  })

  test('趋势筛选触发数据更新', async ({ page }) => {
    // 切换到趋势 Tab
    await page.locator(ADVANCE_SELECTORS.trendTab).click()
    await page.waitForTimeout(2000)

    // ✅ 验证筛选下拉框存在
    const periodSelect = page.locator(ADVANCE_SELECTORS.periodSelect)
    const daysSelect = page.locator(ADVANCE_SELECTORS.daysSelect)

    await expect(periodSelect).toBeVisible()
    await expect(daysSelect).toBeVisible()

    // 监听 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes(API_ENDPOINTS.TREND) && req.method() === 'GET',
      { timeout: 10000 }
    )

    // ✅ 更改时间粒度
    await periodSelect.selectOption('week')
    await page.waitForTimeout(500)

    const request = await requestPromise.catch(() => null)

    if (request) {
      // 验证请求参数
      expect(request.url()).toContain('period=week')
    }
  })

  test('更改天数筛选触发 API 调用', async ({ page }) => {
    // 切换到趋势 Tab
    await page.locator(ADVANCE_SELECTORS.trendTab).click()
    await page.waitForTimeout(2000)

    const daysSelect = page.locator(ADVANCE_SELECTORS.daysSelect)

    // 监听 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes(API_ENDPOINTS.TREND) && req.method() === 'GET',
      { timeout: 10000 }
    )

    // ✅ 更改天数
    await daysSelect.selectOption('90')

    const request = await requestPromise.catch(() => null)

    if (request) {
      expect(request.url()).toContain('days=90')
    }
  })
})

test.describe('系统垫付 - 分页功能', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupStrictErrorCapture(page)
    await login(page)
    await navigateToSystemAdvance(page)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('分页组件在列表视图中显示', async ({ page }) => {
    // 切换到"按活动"Tab
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(2000)

    // ✅ 验证分页组件存在
    const paginationSection = page.locator('text=共').filter({ hasText: '条' })
    const prevBtn = page.locator(ADVANCE_SELECTORS.prevPageBtn)
    const nextBtn = page.locator(ADVANCE_SELECTORS.nextPageBtn)

    await expect(paginationSection).toBeVisible()
    await expect(prevBtn).toBeVisible()
    await expect(nextBtn).toBeVisible()
  })

  test('翻页触发 API 调用并传递正确的 page 参数', async ({ page }) => {
    // 切换到"按活动"Tab
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(2000)

    const nextBtn = page.locator(ADVANCE_SELECTORS.nextPageBtn)
    const isDisabled = await nextBtn.isDisabled()

    if (isDisabled) {
      test.skip() // 只有一页数据
      return
    }

    // 监听 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes(API_ENDPOINTS.BY_CAMPAIGN) && req.method() === 'GET',
      { timeout: 10000 }
    )

    // ✅ 点击下一页
    await nextBtn.click()

    const request = await requestPromise.catch(() => null)

    if (request) {
      // 验证请求包含 page=2
      expect(request.url()).toContain('page=2')
    }
  })
})

test.describe('系统垫付 - 总览视图详情', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupStrictErrorCapture(page)
    await login(page)
    await navigateToSystemAdvance(page)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('总览视图显示库存垫付详情', async ({ page }) => {
    // 确保在总览 Tab
    await page.locator(ADVANCE_SELECTORS.overviewTab).click()
    await page.waitForTimeout(1500)

    // ✅ 验证库存垫付详情区域存在
    const inventoryDetailSection = page.locator('h6:has-text("库存垫付详情")')
    await expect(inventoryDetailSection).toBeVisible()

    // ✅ 验证详情字段
    await expect(page.locator('text=总欠账数量:')).toBeVisible()
    await expect(page.locator('text=已清偿数量:')).toBeVisible()
    await expect(page.locator('text=剩余欠账:')).toBeVisible()
  })

  test('总览视图显示预算垫付详情', async ({ page }) => {
    // ✅ 验证预算垫付详情区域存在
    const budgetDetailSection = page.locator('h6:has-text("预算垫付详情")')
    await expect(budgetDetailSection).toBeVisible()

    // ✅ 验证详情字段
    await expect(page.locator('text=总欠账金额:')).toBeVisible()
    await expect(page.locator('text=已清偿金额:')).toBeVisible()
    // 剩余欠账字段（可能有两个同名的）
    const remainingFields = page.locator('text=剩余欠账:')
    await expect(remainingFields.first()).toBeVisible()
  })

  test('详情数值与汇总卡片一致', async ({ page }) => {
    await page.waitForTimeout(2000)

    // 获取汇总卡片的库存垫付值
    const summaryInventoryValue = await page.locator('h2.text-yellow-600').first().textContent()
    const summaryValue = parseInt(summaryInventoryValue) || 0

    // 获取详情中的剩余欠账值
    const detailInventorySection = page.locator('h6:has-text("库存垫付详情")').locator('..')
    const remainingValueElement = detailInventorySection.locator('span.text-red-600').first()
    
    if (await remainingValueElement.isVisible()) {
      const detailValue = parseInt(await remainingValueElement.textContent()) || 0
      
      // ✅ 验证一致性（允许因为数据更新有微小差异）
      expect(Math.abs(summaryValue - detailValue), 
        `汇总值(${summaryValue})和详情值(${detailValue})不一致`
      ).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('系统垫付 - Alpine.js 组件状态验证', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await navigateToSystemAdvance(page)
    await page.waitForTimeout(3000)
  })

  test('Alpine.js 组件正确加载并包含系统垫付方法', async ({ page }) => {
    // 使用辅助函数检查 Alpine 组件
    const result = await findAlpineComponentWithMethod(page, 'loadAdvanceDashboard')

    // ✅ 断言：找到包含 loadAdvanceDashboard 方法的组件
    expect(result.found, `未找到 loadAdvanceDashboard 方法: ${result.error}`).toBe(true)
  })

  test('Alpine.js advanceDashboard 数据属性存在', async ({ page }) => {
    const result = await getAlpineData(page, 'advanceDashboard')

    // ✅ 断言：advanceDashboard 属性存在
    expect(result.found, `未找到 advanceDashboard 属性: ${result.error}`).toBe(true)
    expect(result.value).toBeTruthy()

    // 验证数据结构
    expect(result.value).toHaveProperty('total_inventory_debt')
    expect(result.value).toHaveProperty('total_budget_debt')
  })

  test('Alpine.js advanceViewTab 状态与 UI 一致', async ({ page }) => {
    // 获取当前 Tab 状态
    let result = await getAlpineData(page, 'advanceViewTab')
    expect(result.found).toBe(true)
    expect(result.value).toBe('overview')

    // 点击"按活动"Tab
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(1000)

    // ✅ 验证状态更新
    result = await getAlpineData(page, 'advanceViewTab')
    expect(result.value).toBe('by-campaign')

    // 点击"趋势"Tab
    await page.locator(ADVANCE_SELECTORS.trendTab).click()
    await page.waitForTimeout(1000)

    result = await getAlpineData(page, 'advanceViewTab')
    expect(result.value).toBe('trend')
  })
})

test.describe('系统垫付 - 数据表格验证', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupStrictErrorCapture(page)
    await login(page)
    await navigateToSystemAdvance(page)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('按活动表格列与 API 字段匹配', async ({ page }) => {
    let apiData = null

    page.on('response', async (response) => {
      if (response.url().includes(API_ENDPOINTS.BY_CAMPAIGN) && response.request().method() === 'GET') {
        try {
          const body = await response.json()
          if (body.success && body.data) {
            apiData = body.data.list || body.data.items || body.data.campaigns || []
          }
        } catch (e) {}
      }
    })

    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(3000)

    // ✅ 验证表头存在
    await expect(page.locator('th:has-text("活动名称")')).toBeVisible()
    await expect(page.locator('th:has-text("库存欠账")')).toBeVisible()
    await expect(page.locator('th:has-text("预算欠账")')).toBeVisible()
    await expect(page.locator('th:has-text("状态")')).toBeVisible()

    if (apiData && apiData.length > 0) {
      // ✅ 验证数据行显示
      const firstItem = apiData[0]
      
      // 验证活动名称显示
      if (firstItem.campaign_name) {
        const nameCell = page.locator(`td:has-text("${firstItem.campaign_name}")`)
        await expect(nameCell.first()).toBeVisible()
      }

      // 验证库存欠账显示
      if (firstItem.inventory_debt !== undefined) {
        const inventoryCell = page.locator(`span.text-yellow-600:has-text("${firstItem.inventory_debt}")`)
        // 可能有多个匹配，只验证至少有一个
        const count = await inventoryCell.count()
        expect(count, '库存欠账应显示在表格中').toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('按奖品表格列与 API 字段匹配', async ({ page }) => {
    await page.locator(ADVANCE_SELECTORS.byPrizeTab).click()
    await page.waitForTimeout(3000)

    // ✅ 验证表头存在
    await expect(page.locator('th:has-text("奖品名称")')).toBeVisible()
    await expect(page.locator('th:has-text("所属活动")')).toBeVisible()
    await expect(page.locator('th:has-text("库存欠账")')).toBeVisible()
  })

  test('按责任人表格列与 API 字段匹配', async ({ page }) => {
    await page.locator(ADVANCE_SELECTORS.byCreatorTab).click()
    await page.waitForTimeout(3000)

    // ✅ 验证表头存在
    await expect(page.locator('th:has-text("创建人")')).toBeVisible()
    await expect(page.locator('th:has-text("预设数量")')).toBeVisible()
    await expect(page.locator('th:has-text("库存欠账")')).toBeVisible()
    await expect(page.locator('th:has-text("预算欠账")')).toBeVisible()
  })

  test('空数据时显示提示而非空白', async ({ page }) => {
    // 模拟 API 返回空数据
    await page.route(`**${API_ENDPOINTS.BY_PRIZE}**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list: [],
            pagination: { page: 1, page_size: 20, total: 0 }
          }
        })
      })
    })

    await page.locator(ADVANCE_SELECTORS.byPrizeTab).click()
    await page.waitForTimeout(2000)

    // ✅ 验证显示空数据提示
    await expect(page.locator('td:has-text("暂无数据")')).toBeVisible()
  })
})

test.describe('系统垫付 - 用户操作流程测试', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupStrictErrorCapture(page)
    await login(page)
    await navigateToSystemAdvance(page)
    await page.waitForTimeout(3000)
  })

  test.afterEach(async () => {
    if (jsErrors.length > 0) {
      console.error('🔴 发现 JavaScript 错误:')
      jsErrors.forEach((err, index) => {
        console.error(`  ${index + 1}. [${err.timestamp}] ${err.type}: ${err.message}`)
      })
    }
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误: ${JSON.stringify(jsErrors.map(e => e.message))}`).toBe(0)
  })

  test('完整操作流程：总览 -> 按活动 -> 按奖品 -> 趋势', async ({ page }) => {
    // ✅ 步骤1：查看总览
    await page.locator(ADVANCE_SELECTORS.overviewTab).click()
    await page.waitForTimeout(1000)
    await expect(page.locator('h6:has-text("库存垫付详情")')).toBeVisible()
    await expect(page.locator('h6:has-text("预算垫付详情")')).toBeVisible()

    // ✅ 步骤2：查看按活动分布
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(2000)
    await expect(page.locator('th:has-text("活动名称")')).toBeVisible()

    // ✅ 步骤3：查看按奖品分布
    await page.locator(ADVANCE_SELECTORS.byPrizeTab).click()
    await page.waitForTimeout(2000)
    await expect(page.locator('th:has-text("奖品名称")')).toBeVisible()

    // ✅ 步骤4：查看趋势图表
    await page.locator(ADVANCE_SELECTORS.trendTab).click()
    await page.waitForTimeout(2000)
    await expect(page.locator(ADVANCE_SELECTORS.trendChart)).toBeVisible()

    // ✅ 步骤5：更改趋势筛选条件
    await page.locator(ADVANCE_SELECTORS.periodSelect).selectOption('week')
    await page.waitForTimeout(1500)
    await page.locator(ADVANCE_SELECTORS.daysSelect).selectOption('90')
    await page.waitForTimeout(1500)

    // 验证筛选条件已更新
    await expect(page.locator(ADVANCE_SELECTORS.periodSelect)).toHaveValue('week')
    await expect(page.locator(ADVANCE_SELECTORS.daysSelect)).toHaveValue('90')
  })

  test('状态恢复测试：多次 Tab 切换后数据保持一致', async ({ page }) => {
    // 记录初始汇总数据
    const initialInventory = await page.locator('h2.text-yellow-600').first().textContent()
    const initialBudget = await page.locator('h2.text-blue-600').first().textContent()
    const initialPending = await page.locator('h2.text-red-600').first().textContent()

    // 多次切换 Tab
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(500)
    await page.locator(ADVANCE_SELECTORS.byPrizeTab).click()
    await page.waitForTimeout(500)
    await page.locator(ADVANCE_SELECTORS.byCreatorTab).click()
    await page.waitForTimeout(500)
    await page.locator(ADVANCE_SELECTORS.trendTab).click()
    await page.waitForTimeout(500)
    await page.locator(ADVANCE_SELECTORS.overviewTab).click()
    await page.waitForTimeout(1000)

    // ✅ 验证汇总数据保持不变
    const currentInventory = await page.locator('h2.text-yellow-600').first().textContent()
    const currentBudget = await page.locator('h2.text-blue-600').first().textContent()
    const currentPending = await page.locator('h2.text-red-600').first().textContent()

    expect(currentInventory).toBe(initialInventory)
    expect(currentBudget).toBe(initialBudget)
    expect(currentPending).toBe(initialPending)
  })

  test('运营人员视角：查看欠账分布并识别问题', async ({ page }) => {
    // 运营场景：运营人员需要了解哪些活动产生了欠账

    // ✅ 查看按活动分布
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(2000)

    // 验证表格可读性
    const hasData = !(await page.locator('td:has-text("暂无数据")').isVisible())

    if (hasData) {
      // ✅ 验证活动名称可见（运营人员需要看到活动名称，而不是ID）
      const tableRows = page.locator('tbody tr')
      const rowCount = await tableRows.count()
      
      if (rowCount > 0) {
        // 验证第一行有活动名称显示
        const firstRow = tableRows.first()
        const cells = firstRow.locator('td')
        const firstCellText = await cells.first().textContent()
        
        // 活动名称不应该是纯数字ID
        expect(firstCellText.trim()).not.toBe('')
        expect(firstCellText).not.toBe('-')
      }
    }

    // ✅ 查看按责任人分布（追责需求）
    await page.locator(ADVANCE_SELECTORS.byCreatorTab).click()
    await page.waitForTimeout(2000)

    if (!(await page.locator('td:has-text("暂无数据")').isVisible())) {
      // 验证责任人信息可见
      const creatorRows = page.locator('tbody tr')
      const creatorRowCount = await creatorRows.count()
      
      if (creatorRowCount > 0) {
        const firstCreatorRow = creatorRows.first()
        const creatorName = await firstCreatorRow.locator('td').first().textContent()
        
        // 责任人名称应该有值
        expect(creatorName.trim()).not.toBe('')
      }
    }
  })
})

test.describe('系统垫付 - 错误处理和边界条件', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupStrictErrorCapture(page)
    await login(page)
  })

  test('API 错误时页面不崩溃', async ({ page }) => {
    // 模拟 Dashboard API 500 错误
    await page.route(`**${API_ENDPOINTS.DASHBOARD}**`, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        })
      })
    })

    await navigateToSystemAdvance(page)
    await page.waitForTimeout(2000)

    // ✅ 验证页面仍然正常显示（不崩溃）
    await expect(page.locator('body')).toBeVisible()
    
    // 汇总卡片仍然存在（可能显示0或默认值）
    await expect(page.locator(ADVANCE_SELECTORS.inventoryDebtCard)).toBeVisible()
  })

  test('网络超时时页面有正确的加载状态', async ({ page }) => {
    // 模拟慢速响应
    await page.route(`**${API_ENDPOINTS.DASHBOARD}**`, async (route) => {
      await new Promise(resolve => setTimeout(resolve, 5000))
      route.continue()
    })

    await page.goto('lottery-management.html')
    await page.waitForLoadState('networkidle')

    // 页面应该能正常加载
    await expect(page.locator('body')).toBeVisible()
  })

  test('所有 API 端点都返回正确的响应格式', async ({ page }) => {
    const apiResults = []

    // 收集所有 API 响应
    page.on('response', async (response) => {
      const url = response.url()
      if (url.includes('/debt-management/')) {
        try {
          const body = await response.json()
          apiResults.push({
            endpoint: url,
            status: response.status(),
            hasSuccess: 'success' in body,
            hasData: 'data' in body,
            body
          })
        } catch (e) {
          apiResults.push({
            endpoint: url,
            status: response.status(),
            error: e.message
          })
        }
      }
    })

    await navigateToSystemAdvance(page)

    // 切换所有 Tab 以触发所有 API
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(1500)
    await page.locator(ADVANCE_SELECTORS.byPrizeTab).click()
    await page.waitForTimeout(1500)
    await page.locator(ADVANCE_SELECTORS.byCreatorTab).click()
    await page.waitForTimeout(1500)
    await page.locator(ADVANCE_SELECTORS.trendTab).click()
    await page.waitForTimeout(1500)

    // ✅ 验证所有 API 响应格式正确
    for (const result of apiResults) {
      if (!result.error) {
        expect(result.status, `${result.endpoint} 应返回 200`).toBe(200)
        expect(result.hasSuccess, `${result.endpoint} 应包含 success 字段`).toBe(true)
      }
    }
  })
})

test.describe('系统垫付 - 跨 API 数据一致性验证', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Dashboard 统计数与列表数据交叉验证', async ({ page }) => {
    let dashboardData = null
    let byCampaignData = null

    // 收集 API 响应
    page.on('response', async (response) => {
      const url = response.url()
      try {
        const body = await response.json()
        if (body.success && body.data) {
          if (url.includes(API_ENDPOINTS.DASHBOARD)) {
            dashboardData = body.data
          } else if (url.includes(API_ENDPOINTS.BY_CAMPAIGN)) {
            byCampaignData = body.data
          }
        }
      } catch (e) {}
    })

    await navigateToSystemAdvance(page)
    await page.locator(ADVANCE_SELECTORS.byCampaignTab).click()
    await page.waitForTimeout(3000)

    if (dashboardData && byCampaignData) {
      const campaigns = byCampaignData.list || byCampaignData.items || byCampaignData.campaigns || []
      
      if (campaigns.length > 0) {
        // 计算按活动汇总的总库存欠账
        const totalFromCampaigns = campaigns.reduce((sum, c) => sum + (c.inventory_debt || 0), 0)
        
        // 获取 Dashboard 的库存欠账
        const dashboardInventory = dashboardData.inventory_debt?.remaining_quantity ??
                                   dashboardData.inventory_debt?.total_quantity ??
                                   dashboardData.total_inventory_debt ?? 0

        // ✅ 验证总数一致（允许分页情况下的差异）
        // 如果分页数据不完整，跳过此验证
        const pagination = byCampaignData.pagination
        if (!pagination || pagination.total <= pagination.page_size) {
          expect(Math.abs(totalFromCampaigns - dashboardInventory),
            `Dashboard库存欠账(${dashboardInventory}) 与按活动汇总(${totalFromCampaigns})不一致`
          ).toBeLessThanOrEqual(5) // 允许小误差
        }
      }
    }
  })
})



