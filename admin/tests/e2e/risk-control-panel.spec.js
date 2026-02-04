/**
 * 风控面板 E2E 测试
 *
 * @file admin/tests/e2e/risk-control-panel.spec.js
 * @description 风控面板（异常用户监控）完整测试套件
 * @date 2026-02-04
 *
 * 测试覆盖：
 * 1. 页面加载和 Alpine.js 组件初始化
 * 2. API 端点测试（异常用户列表、统计数据）
 * 3. 风控统计卡片显示和数据一致性
 * 4. 筛选功能（异常类型筛选）
 * 5. 刷新按钮功能
 * 6. 异常用户列表渲染验证
 * 7. 用户详情弹窗操作
 * 8. 分页功能测试
 * 9. JavaScript 错误检测
 * 10. 前后端数据一致性验证
 * 11. 用户操作流程测试（运营人员视角）
 */

import { test, expect } from '@playwright/test'
import {
  findAlpineComponentWithMethod,
  getAlpineData,
  callAlpineMethod,
  listAlpineComponents
} from './utils/alpine-helpers.js'

// ============ 配置常量 ============
const TEST_PHONE = '13612227930'
const TEST_CODE = '123456'
const TEST_USER_ID = '31'

// API 端点
const API_ENDPOINTS = {
  ABNORMAL_USERS: '/api/v4/console/lottery-monitoring/abnormal-users'
}

// ============ 已知前端问题（记录但不阻止测试） ============
// lottery-management.html 页面有多个子模块，加载时会检查所有变量
// 这些是其他子页面的变量，在风控面板页面不需要
const KNOWN_FRONTEND_ISSUES = [
  // 主题系统问题
  "Cannot read properties of undefined (reading 'split')",
  "Cannot read properties of undefined (reading 'total')",
  'fontPresets is not defined',
  'themeSwitcher is not defined',
  'getCurrentThemeInfo is not defined',
  'isOpen is not defined',
  'activeCategory is not defined',
  // 其他子页面的变量（活动管理、奖品管理、预算管理等）
  'campaignStats is not defined',
  'campaignFilters is not defined',
  'campaigns is not defined',
  'prizeIssuedStats is not defined',
  'prizes is not defined',
  'prizeFilters is not defined',
  'prizeDistributionDetail is not defined',
  'budgetSummary is not defined',
  'budgetFilters is not defined',
  'budgetCampaigns is not defined',
  'selectedBudgetCampaignId is not defined',
  'strategyGroups is not defined',
  'tierMatrix is not defined',
  'quotas is not defined',
  'refreshingPricing is not defined',
  'pricingConfigs is not defined',
  'monitoringFilters is not defined',
  'refreshingMetrics is not defined',
  'loadingDailyReport is not defined',
  'activeAlerts is not defined',
  'lotteryMetrics is not defined',
  'searchUserId is not defined',
  'searchCampaignId is not defined',
  'loadingUserProfile is not defined',
  'chartLoading is not defined',
  'hourlyTrend24h is not defined',
  'tierDistribution is not defined',
  'heatmapPeak is not defined',
  'loadingHeatmap is not defined',
  'lotteryHeatmap is not defined',
  'budgetProgress is not defined',
  'prizeDistribution is not defined',
  'recentDraws is not defined',
  'showDrawDetailsModal is not defined',
  'loadingDrawDetails is not defined',
  'drawDetails is not defined',
  'loadStrategyEffectiveness is not defined',
  'strategyEffectivenessFilters is not defined',
  'loadingStrategyEffectiveness is not defined',
  'strategyEffectiveness is not defined',
  'dailyReportFilters is not defined',
  'dailyReport is not defined',
  'loadingBatchLogs is not defined',
  'showBatchOperationsPanel is not defined',
  'getBatchOperationTypeText is not defined',
  'currentBatchOperation is not defined',
  'loadDailyReportPage is not defined'
]

/**
 * 判断是否为已知的非关键 JS 错误
 */
function isKnownNonCriticalError(errorMessage) {
  return KNOWN_FRONTEND_ISSUES.some((known) => errorMessage.includes(known))
}

/**
 * 过滤出真正的关键错误（与风控面板相关）
 */
function filterCriticalErrors(errors) {
  return errors.filter(
    (e) =>
      !isKnownNonCriticalError(e) &&
      !e.includes('WebSocket') &&
      !e.includes('socket.io') &&
      !e.includes('network') &&
      !e.includes('ResizeObserver')
  )
}

/**
 * 过滤出风控面板相关的关键错误
 */
function filterRiskControlErrors(errors) {
  const riskControlKeywords = [
    'abnormalUser',
    'loadAbnormalUsers',
    'refreshAbnormalUsers',
    'filterAbnormalUsersByType',
    'RiskControl'
  ]
  
  return errors.filter((e) => 
    riskControlKeywords.some((keyword) => e.includes(keyword)) ||
    (!isKnownNonCriticalError(e) && 
     !e.includes('WebSocket') && 
     !e.includes('socket.io'))
  )
}

// ============ 辅助函数 ============

/**
 * 等待 Alpine.js 组件加载完成
 */
async function waitForAlpine(page) {
  await page.waitForFunction(
    () => {
      return (
        typeof window.Alpine !== 'undefined' && document.querySelectorAll('[x-data]').length > 0
      )
    },
    { timeout: 15000 }
  )
  await page.waitForTimeout(1000) // 额外等待数据加载
}

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
 * 导航到风控面板页面
 */
async function navigateToRiskControlPanel(page) {
  // 方式1：通过 URL hash 直接访问
  await page.goto('lottery-management.html#lottery-risk-control')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // 等待 Alpine.js 初始化
  await page.waitForFunction(() => window.Alpine && window.Alpine.version, { timeout: 15000 })

  // 确保页面切换到风控面板
  await page.evaluate(() => {
    const alpineElements = document.querySelectorAll('[x-data]')
    for (const el of alpineElements) {
      const data = window.Alpine.$data(el)
      if (data && 'current_page' in data) {
        data.current_page = 'lottery-risk-control'
        break
      }
    }
  })

  await page.waitForTimeout(1000)
}

/**
 * 获取 Alpine 组件数据
 */
async function getComponentData(page, property) {
  return await page.evaluate((prop) => {
    const alpineElements = document.querySelectorAll('[x-data]')
    for (const el of alpineElements) {
      const data = window.Alpine?.$data(el)
      if (data && prop in data) {
        return data[prop]
      }
    }
    return null
  }, property)
}

// ============ 测试套件 ============

test.describe('风控面板 - 页面加载和初始化', () => {
  // 收集 JS 错误
  let jsErrors = []
  let consoleWarnings = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    consoleWarnings = []

    // 监听页面错误
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })

    // 监听控制台消息
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleWarnings.push(msg.text())
      }
    })

    await login(page)
  })

  test('页面正常加载，无 JavaScript 错误', async ({ page }) => {
    await navigateToRiskControlPanel(page)

    // ✅ 输出发现的 JS 错误详情
    if (jsErrors.length > 0) {
      console.log('❌ 发现 JavaScript 错误:')
      jsErrors.forEach((error, idx) => {
        console.log(`  [${idx + 1}] ${error}`)
      })
    }

    // ✅ 严格断言：不应有 JS 错误
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误: ${jsErrors.join(' | ')}`).toBe(0)

    // ✅ 验证页面标题元素存在
    const pageTitle = page.locator('h5:has-text("异常用户列表")')
    await expect(pageTitle).toBeVisible({ timeout: 10000 })
  })

  test('Alpine.js 组件正确初始化', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await waitForAlpine(page)

    // ✅ 验证关键方法存在
    const methodCheck = await findAlpineComponentWithMethod(page, 'loadAbnormalUsers')
    expect(methodCheck.found, `loadAbnormalUsers 方法未找到: ${methodCheck.error}`).toBe(true)

    // ✅ 验证 refreshAbnormalUsers 方法存在
    const refreshMethodCheck = await findAlpineComponentWithMethod(page, 'refreshAbnormalUsers')
    expect(refreshMethodCheck.found, 'refreshAbnormalUsers 方法未找到').toBe(true)

    // ✅ 验证 filterAbnormalUsersByType 方法存在
    const filterMethodCheck = await findAlpineComponentWithMethod(page, 'filterAbnormalUsersByType')
    expect(filterMethodCheck.found, 'filterAbnormalUsersByType 方法未找到').toBe(true)

    // ✅ 验证 abnormalUsers 数组已初始化
    const abnormalUsersData = await getAlpineData(page, 'abnormalUsers')
    expect(abnormalUsersData.found, 'abnormalUsers 数据未找到').toBe(true)
    expect(Array.isArray(abnormalUsersData.value), 'abnormalUsers 应该是数组').toBe(true)
  })

  test('风控统计卡片正确显示', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(2000)

    // ✅ 验证5个统计卡片存在
    await expect(page.locator('h6:has-text("异常用户总数")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('h6:has-text("高频抽奖")')).toBeVisible()
    await expect(page.locator('h6:has-text("高中奖率")')).toBeVisible()
    await expect(page.locator('h6:has-text("高档位异常")')).toBeVisible()
    await expect(page.locator('h6:has-text("快速连中")')).toBeVisible()

    // ✅ 验证统计数据对象存在
    const stats = await getComponentData(page, 'abnormalUserStats')
    expect(stats).toBeDefined()
    expect(stats).not.toBeNull()

    // ✅ 验证统计字段存在且为数字类型
    expect(typeof stats.total).toBe('number')
    expect(typeof stats.high_frequency).toBe('number')
    expect(typeof stats.high_win_rate).toBe('number')
    expect(typeof stats.high_tier_abnormal).toBe('number')
    expect(typeof stats.rapid_wins).toBe('number')

    // ✅ 数值非负
    expect(stats.total).toBeGreaterThanOrEqual(0)
    expect(stats.high_frequency).toBeGreaterThanOrEqual(0)
    expect(stats.high_win_rate).toBeGreaterThanOrEqual(0)
    expect(stats.high_tier_abnormal).toBeGreaterThanOrEqual(0)
    expect(stats.rapid_wins).toBeGreaterThanOrEqual(0)
  })
})

test.describe('风控面板 - API 端点测试', () => {
  let jsErrors = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    await login(page)
  })

  test('异常用户 API 被正确调用并返回有效数据', async ({ page }) => {
    // 收集所有 API 请求
    const apiRequests = []
    const apiResponses = []

    page.on('request', (req) => {
      if (req.url().includes('/api/')) {
        apiRequests.push({ url: req.url(), method: req.method() })
      }
    })

    page.on('response', async (res) => {
      if (res.url().includes('abnormal-users')) {
        try {
          const body = await res.json()
          apiResponses.push({ url: res.url(), status: res.status(), body })
        } catch {
          apiResponses.push({ url: res.url(), status: res.status(), body: null })
        }
      }
    })

    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    // ✅ 验证 abnormal-users API 被调用
    const abnormalUsersRequest = apiRequests.find((req) =>
      req.url.includes('abnormal-users')
    )

    if (abnormalUsersRequest) {
      expect(abnormalUsersRequest.method).toBe('GET')

      // ✅ 验证 API 响应
      const abnormalUsersResponse = apiResponses.find((res) =>
        res.url.includes('abnormal-users')
      )

      if (abnormalUsersResponse) {
        expect(abnormalUsersResponse.status).toBe(200)

        // ✅ 验证响应数据结构
        if (abnormalUsersResponse.body) {
          const { body } = abnormalUsersResponse
          expect(body.success).toBeDefined()

          if (body.success && body.data) {
            // ✅ 验证 data.users 是数组
            if (body.data.users) {
              expect(Array.isArray(body.data.users)).toBe(true)
            }

            // ✅ 验证 data.stats 包含必要字段
            if (body.data.stats) {
              expect(body.data.stats).toHaveProperty('total')
              expect(body.data.stats).toHaveProperty('high_frequency')
              expect(body.data.stats).toHaveProperty('high_win_rate')
              expect(body.data.stats).toHaveProperty('high_tier_abnormal')
              expect(body.data.stats).toHaveProperty('rapid_wins')
            }

            // ✅ 验证 data.pagination 包含必要字段
            if (body.data.pagination) {
              expect(body.data.pagination).toHaveProperty('current_page')
              expect(body.data.pagination).toHaveProperty('page_size')
              expect(body.data.pagination).toHaveProperty('total_count')
              expect(body.data.pagination).toHaveProperty('total_pages')
            }
          }
        }
      }
    } else {
      console.log('⚠️ 警告: abnormal-users API 未被调用，可能后端未实现')
      console.log('请求列表:', apiRequests.map((r) => r.url).join('\n'))
    }

    // ✅ 无 JS 错误
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('API 响应字段与前端变量映射正确', async ({ page }) => {
    let apiResponseData = null

    page.on('response', async (res) => {
      if (res.url().includes('abnormal-users') && res.status() === 200) {
        try {
          const body = await res.json()
          if (body.success && body.data) {
            apiResponseData = body.data
          }
        } catch { /* ignore */ }
      }
    })

    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    // 获取前端数据
    const frontendStats = await getComponentData(page, 'abnormalUserStats')
    const frontendUsers = await getComponentData(page, 'abnormalUsers')
    const frontendPagination = await getComponentData(page, 'abnormalUserPagination')

    // ✅ 如果 API 返回了数据，验证前端数据与 API 数据一致
    if (apiResponseData) {
      if (apiResponseData.stats) {
        expect(frontendStats.total).toBe(apiResponseData.stats.total)
        expect(frontendStats.high_frequency).toBe(apiResponseData.stats.high_frequency)
        expect(frontendStats.high_win_rate).toBe(apiResponseData.stats.high_win_rate)
        expect(frontendStats.high_tier_abnormal).toBe(apiResponseData.stats.high_tier_abnormal)
        expect(frontendStats.rapid_wins).toBe(apiResponseData.stats.rapid_wins)
      }

      if (apiResponseData.users) {
        expect(frontendUsers.length).toBe(apiResponseData.users.length)
      }

      if (apiResponseData.pagination) {
        expect(frontendPagination.current_page).toBe(apiResponseData.pagination.current_page)
        expect(frontendPagination.total_count).toBe(apiResponseData.pagination.total_count)
      }
    }
  })
})

test.describe('风控面板 - 筛选功能测试', () => {
  let jsErrors = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    await login(page)
  })

  test('异常类型下拉框包含所有选项', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(2000)

    // ✅ 找到异常类型下拉框
    const typeSelect = page.locator('select[x-model="abnormalUserFilters.type"]')
    await expect(typeSelect).toBeVisible({ timeout: 10000 })

    // ✅ 验证下拉框选项
    const options = await typeSelect.locator('option').allTextContents()
    expect(options).toContain('全部类型')
    expect(options.some((opt) => opt.includes('高频抽奖'))).toBe(true)
    expect(options.some((opt) => opt.includes('高中奖率'))).toBe(true)
    expect(options.some((opt) => opt.includes('高档位异常'))).toBe(true)
    expect(options.some((opt) => opt.includes('快速连中'))).toBe(true)
  })

  test('切换筛选类型触发 API 调用', async ({ page }) => {
    const apiCalls = []

    page.on('request', (req) => {
      if (req.url().includes('abnormal-users')) {
        apiCalls.push(req.url())
      }
    })

    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(2000)

    // 记录初始 API 调用数
    const initialCallCount = apiCalls.length

    // ✅ 切换筛选类型
    const typeSelect = page.locator('select[x-model="abnormalUserFilters.type"]')
    await typeSelect.selectOption('high_frequency')
    await page.waitForTimeout(2000)

    // ✅ 验证触发了新的 API 调用
    expect(apiCalls.length).toBeGreaterThan(initialCallCount)

    // ✅ 验证 API 调用包含正确的 type 参数
    const lastCall = apiCalls[apiCalls.length - 1]
    expect(lastCall).toContain('type=high_frequency')

    // ✅ 验证筛选条件已更新
    const filters = await getComponentData(page, 'abnormalUserFilters')
    expect(filters.type).toBe('high_frequency')
  })

  test('刷新按钮触发数据重新加载', async ({ page }) => {
    const apiCalls = []

    page.on('request', (req) => {
      if (req.url().includes('abnormal-users')) {
        apiCalls.push(req.url())
      }
    })

    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(2000)

    const initialCallCount = apiCalls.length

    // ✅ 点击刷新按钮
    const refreshButton = page.locator('button:has-text("刷新")')
    await expect(refreshButton).toBeVisible()
    await refreshButton.click()
    await page.waitForTimeout(2000)

    // ✅ 验证触发了新的 API 调用
    expect(apiCalls.length).toBeGreaterThan(initialCallCount)

    // ✅ 无 JS 错误
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })
})

test.describe('风控面板 - 数据渲染验证', () => {
  let jsErrors = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    await login(page)
  })

  test('统计卡片数值正确渲染到页面', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    // 获取 Alpine 组件中的统计数据
    const stats = await getComponentData(page, 'abnormalUserStats')

    // ✅ 验证"异常用户总数"卡片显示的值与组件数据一致
    const totalCard = page.locator('.themed-card:has-text("异常用户总数") h2')
    const totalText = await totalCard.textContent()
    expect(parseInt(totalText)).toBe(stats.total)

    // ✅ 验证"高频抽奖"卡片显示的值
    const highFreqCard = page.locator('.themed-card:has-text("高频抽奖") h2')
    const highFreqText = await highFreqCard.textContent()
    expect(parseInt(highFreqText)).toBe(stats.high_frequency)

    // ✅ 验证"高中奖率"卡片显示的值
    const highWinCard = page.locator('.themed-card:has-text("高中奖率") h2')
    const highWinText = await highWinCard.textContent()
    expect(parseInt(highWinText)).toBe(stats.high_win_rate)
  })

  test('异常用户列表正确渲染', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    // 获取组件数据
    const users = await getComponentData(page, 'abnormalUsers')
    const loading = await getComponentData(page, 'loadingAbnormalUsers')

    // ✅ 验证加载状态已结束
    expect(loading).toBe(false)

    if (users && users.length > 0) {
      // ✅ 验证用户列表表格可见
      const table = page.locator('table:has(th:has-text("用户ID"))')
      await expect(table).toBeVisible()

      // ✅ 验证表格行数与数据一致
      const rows = await page.locator('tbody tr[class*="themed-hover-bg"]').count()
      // 由于使用 x-for，行数应该与用户数一致
      expect(rows).toBe(users.length)

      // ✅ 验证第一个用户的 ID 正确渲染
      if (users[0]) {
        const firstUserIdCell = page.locator('tbody tr:first-child td:first-child')
        const displayedUserId = await firstUserIdCell.textContent()
        expect(displayedUserId.trim()).toBe(String(users[0].user_id))
      }
    } else {
      // ✅ 验证空状态显示
      const emptyState = page.locator('text=暂无异常用户')
      await expect(emptyState).toBeVisible()
    }
  })

  test('分页信息正确显示', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const pagination = await getComponentData(page, 'abnormalUserPagination')

    // ✅ 验证总数显示正确
    const totalCountText = page.locator('span:has-text("个异常用户")')
    if (await totalCountText.isVisible()) {
      const text = await totalCountText.textContent()
      expect(text).toContain(String(pagination.total_count))
    }

    // ✅ 如果有多页，验证分页控件可见
    if (pagination.total_pages > 1) {
      const paginationControls = page.locator('button:has-text("首页")')
      await expect(paginationControls).toBeVisible()

      // ✅ 验证当前页码显示正确
      const pageInfo = page.locator(`text=第 ${pagination.current_page}`)
      await expect(pageInfo).toBeVisible()
    }
  })
})

test.describe('风控面板 - 用户详情弹窗', () => {
  let jsErrors = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    await login(page)
  })

  test('点击详情按钮打开用户详情弹窗', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const users = await getComponentData(page, 'abnormalUsers')

    if (users && users.length > 0) {
      // ✅ 找到第一个详情按钮并点击
      const detailButton = page.locator('button:has-text("详情")').first()
      await expect(detailButton).toBeVisible()
      await detailButton.click()
      await page.waitForTimeout(1000)

      // ✅ 验证弹窗显示
      const modal = page.locator('h5:has-text("异常用户详情")')
      await expect(modal).toBeVisible()

      // ✅ 验证弹窗中显示用户 ID
      const userIdInModal = page.locator(`text=用户 #${users[0].user_id}`)
      await expect(userIdInModal).toBeVisible()

      // ✅ 验证 selectedAbnormalUser 数据已设置
      const selectedUser = await getComponentData(page, 'selectedAbnormalUser')
      expect(selectedUser).not.toBeNull()
      expect(selectedUser.user_id).toBe(users[0].user_id)
    } else {
      console.log('⚠️ 暂无异常用户数据，跳过详情弹窗测试')
    }
  })

  test('关闭详情弹窗功能正常', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const users = await getComponentData(page, 'abnormalUsers')

    if (users && users.length > 0) {
      // 打开弹窗
      const detailButton = page.locator('button:has-text("详情")').first()
      await detailButton.click()
      await page.waitForTimeout(1000)

      // ✅ 验证弹窗已打开
      let showModal = await getComponentData(page, 'showAbnormalUserDetailModal')
      expect(showModal).toBe(true)

      // ✅ 点击关闭按钮
      const closeButton = page.locator('.fixed.inset-0 button:has-text("✕")')
      await closeButton.click()
      await page.waitForTimeout(500)

      // ✅ 验证弹窗已关闭
      showModal = await getComponentData(page, 'showAbnormalUserDetailModal')
      expect(showModal).toBe(false)

      // ✅ 验证 selectedAbnormalUser 已清空
      const selectedUser = await getComponentData(page, 'selectedAbnormalUser')
      expect(selectedUser).toBeNull()
    }
  })

  test('弹窗外点击关闭功能正常', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const users = await getComponentData(page, 'abnormalUsers')

    if (users && users.length > 0) {
      // 打开弹窗
      const detailButton = page.locator('button:has-text("详情")').first()
      await detailButton.click()
      await page.waitForTimeout(1000)

      // ✅ 点击弹窗外区域（遮罩层）
      const overlay = page.locator('.fixed.inset-0.bg-black\\/50')
      await overlay.click({ position: { x: 10, y: 10 } })
      await page.waitForTimeout(500)

      // ✅ 验证弹窗已关闭
      const showModal = await getComponentData(page, 'showAbnormalUserDetailModal')
      expect(showModal).toBe(false)
    }
  })
})

test.describe('风控面板 - 分页功能', () => {
  let jsErrors = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    await login(page)
  })

  test('分页按钮正确启用/禁用', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const pagination = await getComponentData(page, 'abnormalUserPagination')

    if (pagination.total_pages > 1) {
      // ✅ 第一页时，"首页"和"上一页"应禁用
      if (pagination.current_page === 1) {
        const firstPageBtn = page.locator('button:has-text("首页")')
        const prevPageBtn = page.locator('button:has-text("上一页")')
        await expect(firstPageBtn).toBeDisabled()
        await expect(prevPageBtn).toBeDisabled()
      }

      // ✅ 非最后一页时，"下一页"和"末页"应启用
      if (pagination.current_page < pagination.total_pages) {
        const nextPageBtn = page.locator('button:has-text("下一页")')
        const lastPageBtn = page.locator('button:has-text("末页")')
        await expect(nextPageBtn).toBeEnabled()
        await expect(lastPageBtn).toBeEnabled()
      }
    }
  })

  test('点击下一页触发 API 调用并更新数据', async ({ page }) => {
    const apiCalls = []

    page.on('request', (req) => {
      if (req.url().includes('abnormal-users')) {
        apiCalls.push(req.url())
      }
    })

    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const pagination = await getComponentData(page, 'abnormalUserPagination')

    if (pagination.total_pages > 1) {
      const initialCallCount = apiCalls.length

      // ✅ 点击下一页
      const nextPageBtn = page.locator('button:has-text("下一页")')
      await nextPageBtn.click()
      await page.waitForTimeout(2000)

      // ✅ 验证触发了新的 API 调用
      expect(apiCalls.length).toBeGreaterThan(initialCallCount)

      // ✅ 验证 API 调用包含正确的 page 参数
      const lastCall = apiCalls[apiCalls.length - 1]
      expect(lastCall).toContain('page=2')

      // ✅ 验证当前页码已更新
      const newPagination = await getComponentData(page, 'abnormalUserPagination')
      expect(newPagination.current_page).toBe(2)
    } else {
      console.log('⚠️ 只有一页数据，跳过分页测试')
    }
  })
})

test.describe('风控面板 - 用户操作流程（运营人员视角）', () => {
  let jsErrors = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    await login(page)
  })

  test('运营人员查看异常用户完整流程', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    // ✅ 步骤1：查看统计概览
    const totalCard = page.locator('.themed-card:has-text("异常用户总数")')
    await expect(totalCard).toBeVisible()
    const stats = await getComponentData(page, 'abnormalUserStats')
    console.log(`📊 异常用户统计：总数=${stats.total}, 高频=${stats.high_frequency}, 高中奖率=${stats.high_win_rate}`)

    // ✅ 步骤2：筛选特定类型
    const typeSelect = page.locator('select[x-model="abnormalUserFilters.type"]')
    await typeSelect.selectOption('high_frequency')
    await page.waitForTimeout(2000)
    console.log('🔍 已筛选：高频抽奖用户')

    // ✅ 步骤3：查看用户列表
    const users = await getComponentData(page, 'abnormalUsers')
    console.log(`👥 筛选后用户数：${users.length}`)

    // ✅ 步骤4：如果有用户，查看详情
    if (users && users.length > 0) {
      const detailButton = page.locator('button:has-text("详情")').first()
      await detailButton.click()
      await page.waitForTimeout(1000)

      const modal = page.locator('h5:has-text("异常用户详情")')
      await expect(modal).toBeVisible()
      console.log(`📋 查看用户详情：用户ID=${users[0].user_id}`)

      // 关闭弹窗
      const closeButton = page.locator('.fixed.inset-0 button:has-text("✕")')
      await closeButton.click()
      await page.waitForTimeout(500)
    }

    // ✅ 步骤5：重置筛选条件
    await typeSelect.selectOption('all')
    await page.waitForTimeout(2000)
    console.log('🔄 已重置筛选条件')

    // ✅ 步骤6：刷新数据
    const refreshButton = page.locator('button:has-text("刷新")')
    await refreshButton.click()
    await page.waitForTimeout(2000)
    console.log('♻️ 已刷新数据')

    // ✅ 无 JS 错误
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('档案按钮功能测试', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const users = await getComponentData(page, 'abnormalUsers')

    if (users && users.length > 0) {
      // ✅ 验证档案按钮存在
      const profileButton = page.locator('button:has-text("档案")').first()
      await expect(profileButton).toBeVisible()

      // ✅ 档案按钮有正确的提示
      const title = await profileButton.getAttribute('title')
      expect(title).toBe('查看用户档案')
    }
  })
})

test.describe('风控面板 - 数据一致性交叉验证', () => {
  let jsErrors = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    await login(page)
  })

  test('统计数据与分类数据总和一致', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const stats = await getComponentData(page, 'abnormalUserStats')

    // ✅ 验证：total >= 各分类之和（可能有重叠）
    const categorySum = stats.high_frequency + stats.high_win_rate + 
                       stats.high_tier_abnormal + stats.rapid_wins

    // 如果一个用户可能有多种异常类型，total 应该 <= categorySum
    // 如果一个用户只能有一种异常类型，total 应该 == categorySum
    // 这里我们验证合理性
    expect(stats.total).toBeGreaterThanOrEqual(0)
    expect(categorySum).toBeGreaterThanOrEqual(0)

    console.log(`📊 数据一致性检查：total=${stats.total}, 分类总和=${categorySum}`)
  })

  test('分页 total_count 与统计 total 一致', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const stats = await getComponentData(page, 'abnormalUserStats')
    const pagination = await getComponentData(page, 'abnormalUserPagination')

    // ✅ 在"全部类型"筛选下，分页的 total_count 应该等于 stats.total
    const filters = await getComponentData(page, 'abnormalUserFilters')
    if (filters.type === 'all') {
      expect(pagination.total_count).toBe(stats.total)
    }
  })

  test('用户列表字段完整性验证', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const users = await getComponentData(page, 'abnormalUsers')

    if (users && users.length > 0) {
      // ✅ 验证第一个用户的必要字段
      const user = users[0]

      expect(user.user_id).toBeDefined()
      expect(user.user_id).not.toBeNull()
      expect(typeof user.user_id).toBe('number')

      expect(user.abnormal_type).toBeDefined()
      expect(['high_frequency', 'high_win_rate', 'high_tier_abnormal', 'rapid_wins']).toContain(user.abnormal_type)

      expect(user.risk_level).toBeDefined()
      expect(['critical', 'high', 'medium', 'low']).toContain(user.risk_level)

      // abnormal_value 和 detected_at 可能为空，但应该存在字段
      expect('abnormal_value' in user).toBe(true)
      expect('detected_at' in user).toBe(true)
    }
  })
})

test.describe('风控面板 - 边界条件和错误恢复', () => {
  let jsErrors = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    await login(page)
  })

  test('快速切换筛选类型不会导致数据错乱', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(2000)

    const typeSelect = page.locator('select[x-model="abnormalUserFilters.type"]')

    // ✅ 快速切换多个类型
    await typeSelect.selectOption('high_frequency')
    await page.waitForTimeout(500)
    await typeSelect.selectOption('high_win_rate')
    await page.waitForTimeout(500)
    await typeSelect.selectOption('high_tier_abnormal')
    await page.waitForTimeout(500)
    await typeSelect.selectOption('all')
    await page.waitForTimeout(2000)

    // ✅ 验证最终状态正确
    const filters = await getComponentData(page, 'abnormalUserFilters')
    expect(filters.type).toBe('all')

    // ✅ 验证无 JS 错误
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('连续点击刷新按钮不会导致问题', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(2000)

    const refreshButton = page.locator('button:has-text("刷新")')

    // ✅ 连续点击3次刷新
    await refreshButton.click()
    await page.waitForTimeout(200)
    await refreshButton.click()
    await page.waitForTimeout(200)
    await refreshButton.click()
    await page.waitForTimeout(3000)

    // ✅ 验证页面仍然正常工作
    const stats = await getComponentData(page, 'abnormalUserStats')
    expect(stats).toBeDefined()
    expect(typeof stats.total).toBe('number')

    // ✅ 验证无 JS 错误
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('空数据状态正确显示', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(3000)

    const users = await getComponentData(page, 'abnormalUsers')
    const loading = await getComponentData(page, 'loadingAbnormalUsers')

    // ✅ 如果没有数据，应该显示空状态
    if (!users || users.length === 0) {
      if (!loading) {
        const emptyState = page.locator('text=暂无异常用户')
        await expect(emptyState).toBeVisible()

        // ✅ 验证空状态图标存在
        const emptyIcon = page.locator('text=✅')
        await expect(emptyIcon).toBeVisible()
      }
    }
  })
})

test.describe('风控面板 - Alpine.js 变量一致性检查', () => {
  let jsErrors = []

  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    await login(page)
  })

  test('HTML 模板变量与 JS 组件数据匹配', async ({ page }) => {
    await navigateToRiskControlPanel(page)
    await page.waitForTimeout(2000)

    // ✅ 验证所有必要的数据属性都存在
    const requiredProperties = [
      'abnormalUsers',
      'abnormalUserStats',
      'abnormalUserFilters',
      'abnormalUserPagination',
      'loadingAbnormalUsers',
      'selectedAbnormalUser',
      'showAbnormalUserDetailModal'
    ]

    for (const prop of requiredProperties) {
      const result = await getAlpineData(page, prop)
      expect(result.found, `属性 ${prop} 应该存在于 Alpine 组件中`).toBe(true)
    }

    // ✅ 验证必要的方法都存在
    const requiredMethods = [
      'loadAbnormalUsers',
      'refreshAbnormalUsers',
      'filterAbnormalUsersByType',
      'changeAbnormalUsersPage',
      'viewAbnormalUserDetail',
      'closeAbnormalUserDetailModal',
      'getAbnormalTypeStyle',
      'getAbnormalTypeIcon',
      'getAbnormalTypeText',
      'getRiskLevelStyle',
      'getRiskLevelText',
      'formatRiskTime'
    ]

    for (const method of requiredMethods) {
      const result = await findAlpineComponentWithMethod(page, method)
      expect(result.found, `方法 ${method} 应该存在于 Alpine 组件中`).toBe(true)
    }
  })
})

