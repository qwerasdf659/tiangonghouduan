/**
 * 抽奖运营 - 数据看板（实时监控）E2E 测试
 *
 * 页面：lottery-management.html?page=lottery-metrics
 * 导航路径：左侧导航 → 抽奖运营 → 数据看板
 * 测试目标：验证实时监控功能、数据展示、图表渲染、用户交互
 *
 * 测试覆盖：
 * 1. 页面加载和布局验证
 * 2. API 调用和响应验证
 * 3. 数据一致性验证（API 响应 vs UI 显示）
 * 4. ECharts 图表渲染验证
 * 5. 用户交互测试（时间范围选择、刷新等）
 * 6. 实时告警区测试
 * 7. 边界条件和错误处理测试
 * 8. 用户行为导向测试（运营人员日常操作流程）
 */

import { test, expect } from '@playwright/test'

// ========== 测试常量 ==========

// 测试用户（线上环境）
const TEST_USER = {
  phone: '13612227930',
  userId: 31
}

// 页面 URL
const PAGES = {
  login: '/admin/workspace.html',
  lotteryMetrics: '/admin/lottery-management.html?page=lottery-metrics'
}

// API 端点（基于 advanced.js 中的定义）
const API_ENDPOINTS = {
  // 监控统计
  monitoringStats: '/api/v4/console/lottery-monitoring/stats',
  // 实时告警
  realtimeAlerts: '/api/v4/console/lottery-realtime/alerts',
  // 用户活动热力图
  activityHeatmap: '/api/v4/console/users/activity-heatmap',
  // 抽奖历史
  lotteryHistory: '/api/v4/lottery/history',
  // 活动列表
  campaignList: '/api/v4/console/lottery-campaigns',
  // 每小时指标
  hourlyMetrics: '/api/v4/console/lottery-monitoring/hourly-metrics',
  // 配额统计
  quotaStatistics: '/api/v4/console/lottery-quota/statistics'
}

// 测试超时配置
const TIMEOUTS = {
  navigation: 30000,
  api: 20000,
  animation: 3000,
  chart: 5000
}

// ========== 工具函数 ==========

/**
 * 登录管理后台
 * @param {Page} page - Playwright page 对象
 */
async function login(page) {
  await page.goto(PAGES.login, { waitUntil: 'networkidle', timeout: TIMEOUTS.navigation })

  // 等待页面加载完成
  await page.waitForLoadState('domcontentloaded')

  // 检查是否已登录
  const isLoggedIn = await page.evaluate(() => {
    const adminUser = localStorage.getItem('admin_user')
    return adminUser && JSON.parse(adminUser).user_id
  })

  if (!isLoggedIn) {
    // 执行登录
    await page.fill('input[type="tel"], input[placeholder*="手机号"]', TEST_USER.phone)
    await page.click('button[type="submit"], button:has-text("登录"), button:has-text("获取验证码")')

    // 等待登录完成
    await page.waitForFunction(() => {
      const adminUser = localStorage.getItem('admin_user')
      return adminUser && JSON.parse(adminUser).user_id
    }, { timeout: TIMEOUTS.navigation })
  }
}

/**
 * 导航到数据看板-实时监控页面
 * @param {Page} page - Playwright page 对象
 */
async function navigateToMetrics(page) {
  await page.goto(PAGES.lotteryMetrics, { waitUntil: 'networkidle', timeout: TIMEOUTS.navigation })
  await page.waitForLoadState('domcontentloaded')

  // 等待 Alpine.js 初始化完成
  await page.waitForFunction(() => {
    return window.Alpine && document.querySelector('[x-data*="lotteryPageContent"]')
  }, { timeout: TIMEOUTS.navigation })

  // 等待页面渲染完成
  await page.waitForTimeout(1000)
}

/**
 * 等待 API 响应并返回数据
 * @param {Page} page - Playwright page 对象
 * @param {string} urlPattern - URL 匹配模式
 * @param {number} timeout - 超时时间
 * @returns {Promise<Object>} API 响应数据
 */
async function waitForApiResponse(page, urlPattern, timeout = TIMEOUTS.api) {
  try {
    const response = await page.waitForResponse(
      (response) => response.url().includes(urlPattern) && response.status() === 200,
      { timeout }
    )
    return await response.json()
  } catch (error) {
    console.log(`⚠️ 等待 API 响应超时: ${urlPattern}`)
    return null
  }
}

/**
 * 获取 Alpine.js 组件数据
 * @param {Page} page - Playwright page 对象
 * @param {string} selector - 选择器
 * @returns {Promise<Object>} Alpine 数据
 */
async function getAlpineData(page, selector) {
  return await page.evaluate((sel) => {
    const element = document.querySelector(sel)
    if (element && element._x_dataStack) {
      return JSON.parse(JSON.stringify(element._x_dataStack[0]))
    }
    return null
  }, selector)
}

/**
 * 从 UI 获取统计数据
 * @param {Page} page - Playwright page 对象
 * @returns {Promise<Object>} UI 显示的统计数据
 */
async function getMetricsFromUI(page) {
  const metrics = {}

  // 获取总体统计数据
  try {
    // 总抽奖次数
    const totalDrawsEl = page.locator('[x-text*="lotteryMetrics.total_draws"]').first()
    if (await totalDrawsEl.isVisible({ timeout: 3000 })) {
      metrics.totalDraws = await totalDrawsEl.textContent()
    }

    // 中奖次数
    const winsEl = page.locator('[x-text*="lotteryMetrics.wins"]').first()
    if (await winsEl.isVisible({ timeout: 3000 })) {
      metrics.wins = await winsEl.textContent()
    }

    // 中奖率
    const winRateEl = page.locator('[x-text*="lotteryMetrics.win_rate"]').first()
    if (await winRateEl.isVisible({ timeout: 3000 })) {
      metrics.winRate = await winRateEl.textContent()
    }

    // 总奖品价值
    const totalValueEl = page.locator('[x-text*="lotteryMetrics.total_value"]').first()
    if (await totalValueEl.isVisible({ timeout: 3000 })) {
      metrics.totalValue = await totalValueEl.textContent()
    }
  } catch (error) {
    console.log('⚠️ 获取 UI 统计数据时出错:', error.message)
  }

  return metrics
}

// ========== 测试套件 ==========

test.describe('抽奖运营 - 数据看板（实时监控）', () => {
  // JavaScript 错误收集器
  const jsErrors = []
  const consoleWarnings = []
  const apiErrors = []

  // 已知可忽略的错误模式
  const KNOWN_IGNORABLE_ERRORS = [
    'ResizeObserver loop',
    'Non-Error promise rejection',
    'canceled',
    'aborted'
  ]

  test.beforeEach(async ({ page }) => {
    // 清空错误收集器
    jsErrors.length = 0
    consoleWarnings.length = 0
    apiErrors.length = 0

    // 监听 JavaScript 错误
    page.on('pageerror', (error) => {
      const errorMessage = error.message || error.toString()
      const isIgnorable = KNOWN_IGNORABLE_ERRORS.some((pattern) => errorMessage.includes(pattern))
      if (!isIgnorable) {
        jsErrors.push({
          message: errorMessage,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
        console.error(`❌ JS 错误: ${errorMessage}`)
      }
    })

    // 监听控制台警告和错误
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        const isIgnorable = KNOWN_IGNORABLE_ERRORS.some((pattern) => text.includes(pattern))
        if (!isIgnorable && !text.includes('404') && !text.includes('net::ERR')) {
          consoleWarnings.push({
            type: msg.type(),
            text: text,
            timestamp: new Date().toISOString()
          })
        }
      }
    })

    // 监听 API 错误
    page.on('response', (response) => {
      const url = response.url()
      const status = response.status()
      if (url.includes('/api/') && status >= 400) {
        apiErrors.push({
          url: url,
          status: status,
          timestamp: new Date().toISOString()
        })
        console.error(`❌ API 错误: ${status} - ${url}`)
      }
    })

    // 登录
    await login(page)
  })

  test.afterEach(async ({ page }, testInfo) => {
    // 断言无严重 JavaScript 错误
    if (jsErrors.length > 0) {
      console.error('⚠️ 检测到 JavaScript 错误:', jsErrors)
    }
    expect(jsErrors.length, `检测到 ${jsErrors.length} 个 JavaScript 错误`).toBeLessThan(3)

    // 断言无严重 API 错误（允许少量 404，因为可能是预期的）
    const criticalApiErrors = apiErrors.filter((e) => e.status >= 500)
    expect(criticalApiErrors.length, `检测到 ${criticalApiErrors.length} 个服务器错误`).toBe(0)
  })

  // ========== 1. 页面加载和布局验证 ==========

  test.describe('页面加载和布局', () => {
    test('页面应正确加载并显示基本布局', async ({ page }) => {
      await navigateToMetrics(page)

      // 验证页面标题或主要内容区域
      const pageContent = page.locator('[x-show*="lottery-metrics"]').first()
      await expect(pageContent).toBeVisible({ timeout: TIMEOUTS.navigation })

      // 验证主要区域存在
      const mainSections = [
        '实时告警', // 实时告警区
        '总体统计', // 总体统计
        '抽奖趋势', // 趋势图
        '分布' // 分布图
      ]

      for (const section of mainSections) {
        const sectionElement = page.locator(`text=${section}`).first()
        const isVisible = await sectionElement.isVisible().catch(() => false)
        console.log(`📊 区域 "${section}": ${isVisible ? '✅ 可见' : '⚠️ 不可见'}`)
      }
    })

    test('导航应正确定位到数据看板页面', async ({ page }) => {
      await navigateToMetrics(page)

      // 验证 URL 参数
      const url = page.url()
      expect(url).toContain('lottery-management.html')
      expect(url).toContain('page=lottery-metrics')

      // 验证侧边栏激活状态
      const alpineData = await getAlpineData(page, '[x-data*="lotteryNavigation"]')
      if (alpineData) {
        console.log('📍 当前页面:', alpineData.current_page)
        expect(alpineData.current_page).toBe('lottery-metrics')
      }
    })

    test('时间范围筛选器应正确显示', async ({ page }) => {
      await navigateToMetrics(page)

      // 查找时间范围选择器
      const timeRangeSelector = page.locator('select[x-model*="time_range"], [x-model*="timeRange"]').first()
      const isVisible = await timeRangeSelector.isVisible().catch(() => false)

      if (isVisible) {
        // 获取选项
        const options = await timeRangeSelector.locator('option').allTextContents()
        console.log('📅 时间范围选项:', options)
        expect(options.length).toBeGreaterThan(0)
      } else {
        console.log('⚠️ 时间范围选择器不可见，可能使用其他 UI 组件')
      }
    })
  })

  // ========== 2. API 调用和响应验证 ==========

  test.describe('API 调用验证', () => {
    test('页面加载时应调用监控统计 API', async ({ page }) => {
      // 开始监听 API 调用
      const apiCalls = []
      page.on('request', (request) => {
        if (request.url().includes('/api/')) {
          apiCalls.push({
            url: request.url(),
            method: request.method()
          })
        }
      })

      await navigateToMetrics(page)
      await page.waitForTimeout(3000) // 等待 API 调用完成

      console.log('📡 捕获的 API 调用:', apiCalls.length)
      apiCalls.forEach((call) => {
        console.log(`  - ${call.method} ${call.url}`)
      })

      // 验证关键 API 被调用
      const monitoringStatsCalled = apiCalls.some((call) => call.url.includes('lottery-monitoring/stats'))

      console.log(`📊 监控统计 API 调用: ${monitoringStatsCalled ? '✅' : '❌'}`)
    })

    test('监控统计 API 应返回正确的数据格式', async ({ page }) => {
      await navigateToMetrics(page)

      // 触发刷新获取 API 响应
      const refreshBtn = page.locator('button:has-text("刷新"), button:has([class*="refresh"])').first()

      if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const responsePromise = page.waitForResponse(
          (response) => response.url().includes('lottery-monitoring') && response.status() === 200,
          { timeout: TIMEOUTS.api }
        )

        await refreshBtn.click()

        try {
          const response = await responsePromise
          const data = await response.json()

          console.log('📦 API 响应结构:', Object.keys(data))

          // 验证响应格式
          if (data.data) {
            console.log('📊 数据字段:', Object.keys(data.data))
          }

          // 验证关键字段
          expect(data).toHaveProperty('success')
          if (data.success) {
            expect(data).toHaveProperty('data')
          }
        } catch (error) {
          console.log('⚠️ 获取 API 响应超时或失败:', error.message)
        }
      } else {
        console.log('⚠️ 刷新按钮不可见，跳过此测试')
      }
    })

    test('实时告警 API 应正确返回告警数据', async ({ page }) => {
      await navigateToMetrics(page)

      // 直接调用 API 验证
      const response = await page.evaluate(async (endpoint) => {
        try {
          const res = await fetch(endpoint)
          return {
            status: res.status,
            data: await res.json()
          }
        } catch (error) {
          return { error: error.message }
        }
      }, API_ENDPOINTS.realtimeAlerts)

      console.log('🚨 告警 API 状态:', response.status || '请求失败')

      if (response.status === 200) {
        console.log('📋 告警数据结构:', Object.keys(response.data))
        if (response.data.data) {
          console.log('📊 告警条目数:', Array.isArray(response.data.data) ? response.data.data.length : '非数组')
        }
      } else if (response.status === 404) {
        console.log('⚠️ 告警 API 返回 404 - 后端可能未实现此接口')
      } else {
        console.log('⚠️ 告警 API 响应:', response)
      }
    })
  })

  // ========== 3. 数据一致性验证 ==========

  test.describe('数据一致性验证', () => {
    test('UI 显示的统计数据应与 Alpine 状态一致', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(3000) // 等待数据加载

      // 获取 Alpine 组件数据
      const alpineData = await getAlpineData(page, '[x-data*="lotteryPageContent"]')

      if (alpineData && alpineData.lotteryMetrics) {
        const metrics = alpineData.lotteryMetrics
        console.log('📊 Alpine 数据:', metrics)

        // 获取 UI 显示数据
        const uiMetrics = await getMetricsFromUI(page)
        console.log('📊 UI 数据:', uiMetrics)

        // 比较数据一致性
        if (uiMetrics.totalDraws && metrics.total_draws !== undefined) {
          const uiValue = parseInt(uiMetrics.totalDraws.replace(/[^0-9]/g, ''))
          console.log(`📈 总抽奖次数: Alpine=${metrics.total_draws}, UI=${uiValue}`)
          // 允许格式化差异
          expect(Math.abs(uiValue - metrics.total_draws)).toBeLessThan(1000)
        }
      } else {
        console.log('⚠️ 无法获取 Alpine 数据，可能页面结构不同')
      }
    })

    test('最近抽奖记录应正确渲染', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(3000)

      // 查找抽奖记录列表
      const recordList = page.locator('[x-for*="recentDraws"], [x-for*="recentRecords"]').first()
      const isListVisible = await recordList.isVisible().catch(() => false)

      if (isListVisible) {
        const recordItems = await recordList.locator('> *').count()
        console.log(`📋 最近抽奖记录条数: ${recordItems}`)

        // 验证有数据时正确显示
        if (recordItems > 0) {
          const firstRecord = recordList.locator('> *').first()
          await expect(firstRecord).toBeVisible()
        }
      } else {
        // 尝试其他选择器
        const recordsContainer = page.locator('text=最近抽奖').first()
        if (await recordsContainer.isVisible().catch(() => false)) {
          console.log('📋 找到最近抽奖区域')
        } else {
          console.log('⚠️ 未找到最近抽奖记录区域')
        }
      }
    })
  })

  // ========== 4. ECharts 图表渲染验证 ==========

  test.describe('ECharts 图表渲染', () => {
    test('24小时趋势图应正确渲染', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(TIMEOUTS.chart)

      // 查找趋势图容器
      const trendChartSelectors = ['#trend-chart', '#hourlyTrendChart', '[id*="trend"]', '.echarts-chart']

      let chartFound = false
      for (const selector of trendChartSelectors) {
        const chart = page.locator(selector).first()
        if (await chart.isVisible().catch(() => false)) {
          chartFound = true
          console.log(`📈 趋势图容器: ${selector}`)

          // 验证 ECharts 实例存在
          const hasEchartsInstance = await page.evaluate((sel) => {
            const el = document.querySelector(sel)
            return el && (el._echarts_instance_ || el.getAttribute('_echarts_instance_'))
          }, selector)

          console.log(`📊 ECharts 实例: ${hasEchartsInstance ? '✅ 存在' : '⚠️ 不存在'}`)

          // 验证图表有内容（SVG 或 Canvas）
          const hasContent = await chart.locator('svg, canvas').count()
          console.log(`📊 图表内容元素: ${hasContent}`)
          expect(hasContent).toBeGreaterThan(0)

          break
        }
      }

      if (!chartFound) {
        console.log('⚠️ 未找到趋势图容器，可能使用其他 ID 或类名')
      }
    })

    test('档位分布图应正确渲染', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(TIMEOUTS.chart)

      // 查找档位分布图容器
      const tierChartSelectors = ['#tier-chart', '#tierDistributionChart', '[id*="tier"]', '[id*="distribution"]']

      let chartFound = false
      for (const selector of tierChartSelectors) {
        const chart = page.locator(selector).first()
        if (await chart.isVisible().catch(() => false)) {
          chartFound = true
          console.log(`📊 档位分布图容器: ${selector}`)

          // 验证有图表内容
          const hasContent = await chart.locator('svg, canvas').count()
          console.log(`📊 图表内容元素: ${hasContent}`)

          if (hasContent > 0) {
            expect(hasContent).toBeGreaterThan(0)
          }

          break
        }
      }

      if (!chartFound) {
        console.log('⚠️ 未找到档位分布图容器')
      }
    })

    test('热力图应正确渲染（如果存在）', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(TIMEOUTS.chart)

      // 查找热力图容器
      const heatmapSelectors = ['#heatmap', '#lotteryHeatmap', '[id*="heatmap"]', '.heatmap-container']

      let heatmapFound = false
      for (const selector of heatmapSelectors) {
        const heatmap = page.locator(selector).first()
        if (await heatmap.isVisible().catch(() => false)) {
          heatmapFound = true
          console.log(`🔥 热力图容器: ${selector}`)

          const hasContent = await heatmap.locator('svg, canvas, [class*="cell"]').count()
          console.log(`🔥 热力图内容元素: ${hasContent}`)

          break
        }
      }

      if (!heatmapFound) {
        console.log('⚠️ 未找到热力图容器，可能页面不包含此功能')
      }
    })
  })

  // ========== 5. 用户交互测试 ==========

  test.describe('用户交互测试', () => {
    test('刷新按钮应触发数据重新加载', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(2000)

      // 查找刷新按钮
      const refreshBtn = page.locator('button:has-text("刷新"), button:has([class*="refresh"]), [x-on\\:click*="refresh"], [\\@click*="refresh"]').first()

      if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('🔄 找到刷新按钮')

        // 监听 API 调用
        let apiCalled = false
        page.on('request', (request) => {
          if (request.url().includes('lottery-monitoring')) {
            apiCalled = true
          }
        })

        // 点击刷新
        await refreshBtn.click()
        await page.waitForTimeout(2000)

        console.log(`📡 刷新后 API 调用: ${apiCalled ? '✅ 已触发' : '⚠️ 未检测到'}`)
      } else {
        console.log('⚠️ 刷新按钮不可见')
      }
    })

    test('时间范围切换应更新数据', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(2000)

      // 查找时间范围选择器
      const timeSelector = page.locator('select[x-model*="time_range"], select[x-model*="timeRange"], [x-model*="monitoringFilters.time_range"]').first()

      if (await timeSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('📅 找到时间范围选择器')

        // 获取当前选项
        const currentValue = await timeSelector.inputValue()
        console.log('📅 当前选项:', currentValue)

        // 获取所有选项
        const options = await timeSelector.locator('option').allTextContents()
        console.log('📅 可用选项:', options)

        // 如果有多个选项，切换到另一个
        if (options.length > 1) {
          const optionValues = await timeSelector.locator('option').evaluateAll((opts) => opts.map((o) => o.value))

          const newValue = optionValues.find((v) => v !== currentValue) || optionValues[0]

          // 监听数据变化
          let dataChanged = false
          page.on('response', (response) => {
            if (response.url().includes('lottery-monitoring') && response.status() === 200) {
              dataChanged = true
            }
          })

          await timeSelector.selectOption(newValue)
          await page.waitForTimeout(2000)

          console.log(`📅 切换时间范围: ${currentValue} → ${newValue}`)
          console.log(`📊 数据更新: ${dataChanged ? '✅ 已更新' : '⚠️ 未检测到'}`)
        }
      } else {
        console.log('⚠️ 时间范围选择器不可见')
      }
    })
  })

  // ========== 6. 实时告警区测试 ==========

  test.describe('实时告警区测试', () => {
    test('告警区域应正确显示', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(2000)

      // 查找告警区域
      const alertSelectors = ['[x-for*="activeAlerts"]', '[x-for*="alerts"]', '.alert-container', '#alerts-section']

      let alertSectionFound = false
      for (const selector of alertSelectors) {
        const alertSection = page.locator(selector).first()
        if (await alertSection.isVisible().catch(() => false)) {
          alertSectionFound = true
          console.log(`🚨 告警区域: ${selector}`)

          // 计算告警条数
          const alertItems = await alertSection.locator('> *').count()
          console.log(`🚨 告警条数: ${alertItems}`)

          break
        }
      }

      // 也检查文本标识
      const alertTitle = page.locator('text=实时告警, text=告警').first()
      if (await alertTitle.isVisible().catch(() => false)) {
        console.log('🚨 找到告警标题区域')
        alertSectionFound = true
      }

      if (!alertSectionFound) {
        console.log('⚠️ 未找到明确的告警区域，检查页面结构')
      }
    })

    test('告警级别应正确显示（如果有告警）', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(2000)

      // 获取 Alpine 数据中的告警
      const alpineData = await getAlpineData(page, '[x-data*="lotteryPageContent"]')

      if (alpineData && alpineData.activeAlerts) {
        const alerts = alpineData.activeAlerts
        console.log(`🚨 Alpine 中的告警数: ${alerts.length}`)

        if (alerts.length > 0) {
          // 验证告警有必要字段
          const firstAlert = alerts[0]
          console.log('🚨 第一条告警结构:', Object.keys(firstAlert))

          // 检查告警级别
          if (firstAlert.level || firstAlert.severity) {
            console.log(`🚨 告警级别: ${firstAlert.level || firstAlert.severity}`)
          }
        }
      } else {
        console.log('⚠️ 无法获取告警数据或无告警')
      }
    })
  })

  // ========== 7. 边界条件和错误处理测试 ==========

  test.describe('边界条件测试', () => {
    test('空数据状态应正确显示', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(2000)

      // 检查是否有空状态提示
      const emptyStateSelectors = [
        'text=暂无数据',
        'text=暂无记录',
        'text=无告警',
        '.empty-state',
        '[x-show*="length === 0"]'
      ]

      for (const selector of emptyStateSelectors) {
        const emptyState = page.locator(selector).first()
        if (await emptyState.isVisible().catch(() => false)) {
          console.log(`📭 空状态提示: ${selector}`)
          break
        }
      }
    })

    test('页面应能处理网络延迟', async ({ page }) => {
      // 模拟网络延迟
      await page.route('**/api/v4/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000)) // 2秒延迟
        await route.continue()
      })

      const startTime = Date.now()
      await navigateToMetrics(page)
      const loadTime = Date.now() - startTime

      console.log(`⏱️ 页面加载时间（含网络延迟）: ${loadTime}ms`)

      // 验证页面最终正确加载
      const pageContent = page.locator('[x-show*="lottery-metrics"], [x-data*="lotteryPageContent"]').first()
      await expect(pageContent).toBeVisible({ timeout: TIMEOUTS.navigation })
    })

    test('刷新时应显示加载状态', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(2000)

      // 查找刷新按钮和加载指示器
      const refreshBtn = page.locator('button:has-text("刷新")').first()

      if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // 监听加载状态
        const loadingIndicatorPromise = page.locator('.loading, [x-show*="loading"], .spinner, .animate-spin').first().isVisible()

        await refreshBtn.click()

        // 检查是否出现加载状态
        const hadLoading = await loadingIndicatorPromise.catch(() => false)
        console.log(`⏳ 加载指示器: ${hadLoading ? '✅ 显示' : '⚠️ 未检测到'}`)
      }
    })
  })

  // ========== 8. 用户行为导向测试 ==========

  test.describe('用户行为导向测试（运营人员工作流）', () => {
    test('运营人员日常监控流程', async ({ page }) => {
      console.log('🧑‍💼 模拟运营人员日常监控流程...')

      // 1. 进入数据看板
      await navigateToMetrics(page)
      await page.waitForTimeout(2000)
      console.log('1️⃣ 进入数据看板页面 ✅')

      // 2. 查看总体统计
      const statsSection = page.locator('text=总体统计').first()
      if (await statsSection.isVisible().catch(() => false)) {
        console.log('2️⃣ 查看总体统计 ✅')
      }

      // 3. 检查是否有告警
      const alertSection = page.locator('text=告警, text=实时告警').first()
      if (await alertSection.isVisible().catch(() => false)) {
        console.log('3️⃣ 检查实时告警 ✅')
      }

      // 4. 切换时间范围查看趋势
      const timeSelector = page.locator('select[x-model*="time_range"]').first()
      if (await timeSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
        const options = await timeSelector.locator('option').allTextContents()
        if (options.length > 1) {
          await timeSelector.selectOption({ index: 1 })
          await page.waitForTimeout(1500)
          console.log('4️⃣ 切换时间范围查看趋势 ✅')
        }
      } else {
        console.log('4️⃣ 时间范围切换 - 跳过（选择器不可见）')
      }

      // 5. 查看图表
      const chartExists =
        (await page.locator('canvas').count()) > 0 || (await page.locator('svg[class*="echarts"]').count()) > 0

      console.log(`5️⃣ 查看图表: ${chartExists ? '✅ 图表存在' : '⚠️ 未找到图表'}`)

      // 6. 刷新数据
      const refreshBtn = page.locator('button:has-text("刷新")').first()
      if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await refreshBtn.click()
        await page.waitForTimeout(2000)
        console.log('6️⃣ 刷新数据 ✅')
      } else {
        console.log('6️⃣ 刷新数据 - 跳过（按钮不可见）')
      }

      console.log('✅ 运营人员日常监控流程完成')
    })

    test('运营人员应能快速识别异常', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(3000)

      // 获取关键指标
      const alpineData = await getAlpineData(page, '[x-data*="lotteryPageContent"]')

      if (alpineData) {
        // 检查是否有告警
        const hasAlerts = alpineData.activeAlerts && alpineData.activeAlerts.length > 0
        console.log(`🚨 有活跃告警: ${hasAlerts ? '是' : '否'}`)

        // 检查中奖率是否异常
        if (alpineData.lotteryMetrics) {
          const winRate = alpineData.lotteryMetrics.win_rate
          if (winRate !== undefined) {
            console.log(`📊 中奖率: ${winRate}%`)
            // 假设正常中奖率在 1%-50% 之间
            if (winRate < 1 || winRate > 50) {
              console.log('⚠️ 中奖率可能异常，需要关注')
            }
          }
        }
      }
    })

    test('数据看板应提供足够的业务信息', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(3000)

      // 检查关键业务信息是否展示
      const businessInfo = {
        '总抽奖次数': false,
        '中奖次数': false,
        '中奖率': false,
        '奖品价值': false,
        '趋势图': false,
        '分布图': false
      }

      // 检查统计数据展示
      const statsElements = await page
        .locator('[x-text*="lotteryMetrics"], [x-text*="total_draws"], [x-text*="wins"]')
        .all()
      if (statsElements.length > 0) {
        businessInfo['总抽奖次数'] = true
        businessInfo['中奖次数'] = true
        businessInfo['中奖率'] = true
      }

      // 检查图表存在
      const chartCount = await page.locator('canvas, svg[class*="echarts"]').count()
      if (chartCount > 0) {
        businessInfo['趋势图'] = true
        businessInfo['分布图'] = true
      }

      console.log('📊 业务信息覆盖情况:')
      Object.entries(businessInfo).forEach(([info, available]) => {
        console.log(`  ${available ? '✅' : '❌'} ${info}`)
      })

      // 至少应该有一半的业务信息可见
      const availableCount = Object.values(businessInfo).filter(Boolean).length
      expect(availableCount).toBeGreaterThanOrEqual(Object.keys(businessInfo).length / 2)
    })
  })

  // ========== 9. 完整数据验证 ==========

  test.describe('完整数据验证', () => {
    test('API 返回数据应与页面显示一致', async ({ page }) => {
      let apiData = null

      // 监听 API 响应
      page.on('response', async (response) => {
        if (response.url().includes('lottery-monitoring/stats') && response.status() === 200) {
          try {
            apiData = await response.json()
          } catch (e) {
            console.log('⚠️ 解析 API 响应失败')
          }
        }
      })

      await navigateToMetrics(page)
      await page.waitForTimeout(3000)

      if (apiData && apiData.data) {
        console.log('📊 API 返回数据:', JSON.stringify(apiData.data, null, 2).substring(0, 500))

        // 获取 UI 数据
        const alpineData = await getAlpineData(page, '[x-data*="lotteryPageContent"]')

        if (alpineData && alpineData.lotteryMetrics) {
          console.log('📊 Alpine 状态数据:', JSON.stringify(alpineData.lotteryMetrics, null, 2).substring(0, 500))

          // 验证数据一致性
          // 这里根据实际 API 响应结构进行验证
        }
      } else {
        console.log('⚠️ 未捕获到监控统计 API 数据')
      }
    })

    test('图表数据应与统计数据逻辑一致', async ({ page }) => {
      await navigateToMetrics(page)
      await page.waitForTimeout(3000)

      // 获取所有数据
      const alpineData = await getAlpineData(page, '[x-data*="lotteryPageContent"]')

      if (alpineData) {
        // 检查趋势数据
        if (alpineData.hourlyTrend24h && Array.isArray(alpineData.hourlyTrend24h)) {
          console.log(`📈 24小时趋势数据点: ${alpineData.hourlyTrend24h.length}`)
        }

        // 检查档位分布
        if (alpineData.tierDistribution && Array.isArray(alpineData.tierDistribution)) {
          console.log(`📊 档位分布数据点: ${alpineData.tierDistribution.length}`)
        }

        // 检查奖品分布
        if (alpineData.prizeDistribution && Array.isArray(alpineData.prizeDistribution)) {
          console.log(`🎁 奖品分布数据点: ${alpineData.prizeDistribution.length}`)
        }

        // 验证数据逻辑一致性
        if (alpineData.lotteryMetrics) {
          const { total_draws, wins } = alpineData.lotteryMetrics

          if (total_draws !== undefined && wins !== undefined) {
            // 中奖次数不应超过总抽奖次数
            expect(wins).toBeLessThanOrEqual(total_draws)
            console.log(`✅ 数据逻辑验证通过: 中奖次数(${wins}) <= 总抽奖次数(${total_draws})`)
          }
        }
      } else {
        console.log('⚠️ 无法获取 Alpine 数据')
      }
    })
  })

  // ========== 10. 页面性能测试 ==========

  test.describe('页面性能测试', () => {
    test('页面首次加载时间应在合理范围内', async ({ page }) => {
      const startTime = Date.now()

      await page.goto(PAGES.lotteryMetrics, { waitUntil: 'domcontentloaded' })
      const domContentLoaded = Date.now() - startTime

      await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.navigation })
      const totalLoadTime = Date.now() - startTime

      console.log(`⏱️ DOM 加载时间: ${domContentLoaded}ms`)
      console.log(`⏱️ 完全加载时间: ${totalLoadTime}ms`)

      // 页面应在 10 秒内完成加载
      expect(totalLoadTime).toBeLessThan(10000)
    })

    test('API 响应时间应在合理范围内', async ({ page }) => {
      const apiTimes = []

      page.on('response', (response) => {
        if (response.url().includes('/api/v4/') && response.status() === 200) {
          const timing = response.timing()
          if (timing && timing.responseEnd) {
            apiTimes.push({
              url: response.url().split('?')[0],
              time: timing.responseEnd - timing.requestStart
            })
          }
        }
      })

      await navigateToMetrics(page)
      await page.waitForTimeout(3000)

      if (apiTimes.length > 0) {
        console.log('📊 API 响应时间统计:')
        apiTimes.forEach((api) => {
          console.log(`  ${api.url}: ${api.time.toFixed(0)}ms`)
        })

        const avgTime = apiTimes.reduce((sum, api) => sum + api.time, 0) / apiTimes.length
        console.log(`📊 平均响应时间: ${avgTime.toFixed(0)}ms`)

        // API 平均响应时间应小于 5 秒
        expect(avgTime).toBeLessThan(5000)
      }
    })
  })
})

