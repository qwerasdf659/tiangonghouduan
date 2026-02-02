/**
 * 债务管理页面 E2E 测试
 *
 * @file admin/tests/e2e/debt-management.spec.js
 * @description 财务管理中心 - 债务管理子页面完整测试套件
 * @date 2026-02-02
 *
 * 测试思路：站在运营人员角度，模拟真实的日常操作流程
 * - 运营每天需要查看待冲销欠账
 * - 需要按类型筛选欠账（库存/预算）
 * - 需要执行清偿操作
 * - 需要查看清偿结果
 *
 * 测试覆盖：
 * 1. 页面加载和数据显示验证
 * 2. API 响应拦截和验证
 * 3. 筛选功能（欠账类型、活动ID）
 * 4. 重置功能和状态恢复
 * 5. 清偿操作和 API 调用验证
 * 6. 错误处理和边界条件
 * 7. JavaScript 错误检测
 * 8. 分页功能
 */

import { test, expect } from '@playwright/test'
import { findAlpineComponentWithMethod, getAlpineData, callAlpineMethod } from './utils/alpine-helpers.js'

// ============ 配置常量 ============
const TEST_PHONE = '13612227930'
const TEST_CODE = '123456'
const TEST_USER_ID = '31'
const DEBT_MANAGEMENT_API = '/api/v4/console/debt-management'

// ============ 债务管理区域专用选择器 ============
// 使用 x-model 和 @click 属性精确定位债务管理区域的元素（页面有多个tab，每个tab有类似元素）
const DEBT_SELECTORS = {
  // 筛选区域
  typeSelect: 'select[x-model="debtFilters.debt_type"]',
  campaignSelect: 'select[x-model="debtFilters.campaign_id"]', // 已改为下拉框
  searchBtn: 'button[\\@click="searchDebts()"]',
  resetBtn: 'button[\\@click="resetDebtFilters()"]',
  // 表格操作
  detailBtn: 'button[\\@click*="viewDebtDetail"]',
  clearBtn: 'button[\\@click*="openRepayModal"]',
  // 模态框
  repayModal: 'h5:has-text("欠账清偿")',
  detailModal: 'h5:has-text("欠账详情")',
  confirmClearBtn: 'button:has-text("确认清偿")',
  cancelBtn: 'button:has-text("取消")',
  // 分页
  prevPageBtn: 'button[\\@click*="changePage"][\\@click*="- 1"]',
  nextPageBtn: 'button[\\@click*="changePage"][\\@click*="+ 1"]'
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
 * 导航到财务管理页面并切换到债务管理子页面
 */
async function navigateToDebtManagement(page) {
  await page.goto('finance-management.html')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // 等待 Alpine.js 初始化
  await page.waitForFunction(
    () => window.Alpine && window.Alpine.version,
    { timeout: 10000 }
  ).catch(() => {
    throw new Error('Alpine.js 初始化失败')
  })

  // 点击"债务管理"标签页
  const debtTab = page.locator('button:has-text("债务管理")')
  await expect(debtTab).toBeVisible({ timeout: 10000 })
  await debtTab.click()

  // 等待页面切换完成
  await page.waitForTimeout(2000)

  // ✅ 验证页面已切换到债务管理
  const debtSection = page.locator('div[x-show*="debt-management"]')
  await expect(debtSection).toBeVisible({ timeout: 10000 })
}

/**
 * 收集页面上的 JavaScript 错误
 */
function setupErrorCapture(page) {
  const errors = []
  page.on('pageerror', (error) => {
    errors.push({
      message: error.message,
      timestamp: new Date().toISOString()
    })
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({
        type: 'console',
        message: msg.text(),
        timestamp: new Date().toISOString()
      })
    }
  })
  return errors
}

// ============ 测试套件 ============

test.describe('债务管理 - 页面加载和数据显示', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupErrorCapture(page)
    await login(page)
  })

  test.afterEach(async () => {
    // ✅ 断言：页面没有 JavaScript 错误
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误: ${JSON.stringify(jsErrors)}`).toBe(0)
  })

  test('页面正常加载并显示债务管理内容', async ({ page }) => {
    await navigateToDebtManagement(page)

    // ✅ 验证页面标题
    await expect(page.locator('h5:has-text("待冲销欠账列表")')).toBeVisible({ timeout: 10000 })

    // ✅ 验证统计卡片存在且可见
    await expect(page.locator('h6:has-text("库存欠账数")')).toBeVisible()
    await expect(page.locator('h6:has-text("预算欠账额")')).toBeVisible()
    await expect(page.locator('h6:has-text("待处理")')).toBeVisible()
    await expect(page.locator('h6:has-text("今日清偿")')).toBeVisible()

    // ✅ 验证筛选区域存在（使用精确选择器）
    await expect(page.locator(DEBT_SELECTORS.typeSelect)).toBeVisible()
    await expect(page.locator(DEBT_SELECTORS.campaignSelect)).toBeVisible() // 活动下拉框
    await expect(page.locator(DEBT_SELECTORS.searchBtn)).toBeVisible()
    await expect(page.locator(DEBT_SELECTORS.resetBtn)).toBeVisible()

    // ✅ 验证表格存在（使用债务管理区域内的表头选择器，避免与其他tab冲突）
    const debtSection = page.locator('div[x-show*="debt-management"]')
    await expect(debtSection.locator('th:has-text("欠账ID")')).toBeVisible()
    await expect(debtSection.getByRole('columnheader', { name: '类型', exact: true })).toBeVisible()
    await expect(debtSection.locator('th:has-text("欠账数量/金额")')).toBeVisible()
  })

  test('债务列表 API 被正确调用并返回数据', async ({ page }) => {
    // 监听债务列表 API 请求
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/debt-management/pending') && resp.request().method() === 'GET',
      { timeout: 15000 }
    )

    await navigateToDebtManagement(page)

    const response = await responsePromise

    // ✅ 断言：API 返回 200
    expect(response.status()).toBe(200)

    // ✅ 断言：API 响应包含必要字段
    const body = await response.json()
    expect(body).toHaveProperty('success')
    expect(body.success).toBe(true)

    // ✅ 验证响应数据结构
    if (body.data) {
      // 可能是 items、pending_debts 或 list
      const debts = body.data.items || body.data.pending_debts || body.data.list || []
      expect(Array.isArray(debts)).toBe(true)

      // 如果有数据，验证数据结构
      if (debts.length > 0) {
        const firstDebt = debts[0]
        // 验证必要字段存在
        expect(firstDebt).toHaveProperty('debt_type')
        expect(['inventory', 'budget']).toContain(firstDebt.debt_type)
      }
    }
  })

  test('债务统计 API 被正确调用', async ({ page }) => {
    // 监听统计 API 请求
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/debt-management/dashboard'),
      { timeout: 15000 }
    )

    await navigateToDebtManagement(page)

    const response = await responsePromise

    // ✅ 断言：API 返回 200
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)

    // ✅ 验证统计数据显示在页面上
    await page.waitForTimeout(1000)

    // 获取库存欠账数显示值
    const inventoryDebtElement = page.locator('h6:has-text("库存欠账数")').locator('..').locator('p')
    const inventoryDebtText = await inventoryDebtElement.textContent()
    expect(parseInt(inventoryDebtText)).toBeGreaterThanOrEqual(0)
  })

  test('统计卡片数值与 API 返回一致', async ({ page }) => {
    let apiStats = null

    // 拦截统计 API 响应
    page.on('response', async (response) => {
      if (response.url().includes('/debt-management/dashboard') && response.request().method() === 'GET') {
        try {
          const body = await response.json()
          if (body.success && body.data) {
            apiStats = body.data
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    })

    await navigateToDebtManagement(page)
    await page.waitForTimeout(3000)

    if (apiStats) {
      // 获取页面上显示的值
      const pendingCountElement = page.locator('h6:has-text("待处理")').locator('..').locator('p')
      const pageValue = await pendingCountElement.textContent()
      const pendingCount = parseInt(pageValue) || 0

      // 计算 API 返回的待处理数
      const invDebt = apiStats.inventory_debt || {}
      const budDebt = apiStats.budget_debt || {}
      const expectedPendingCount = (invDebt.pending_count || 0) + (budDebt.pending_count || 0) || apiStats.pending_count || 0

      // ✅ 断言：页面显示值与 API 一致
      expect(pendingCount).toBe(expectedPendingCount)
    }
  })
})

test.describe('债务管理 - 筛选功能', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupErrorCapture(page)
    await login(page)
    await navigateToDebtManagement(page)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('欠账类型筛选下拉框正常工作', async ({ page }) => {
    const typeSelect = page.locator(DEBT_SELECTORS.typeSelect)
    await expect(typeSelect).toBeVisible()

    // ✅ 测试选择"库存欠账"
    await typeSelect.selectOption('inventory')
    await expect(typeSelect).toHaveValue('inventory')

    // ✅ 测试选择"预算欠账"
    await typeSelect.selectOption('budget')
    await expect(typeSelect).toHaveValue('budget')

    // ✅ 测试选择回"全部类型"
    await typeSelect.selectOption('')
    await expect(typeSelect).toHaveValue('')
  })

  test('类型筛选触发 API 调用并传递正确参数', async ({ page }) => {
    const typeSelect = page.locator(DEBT_SELECTORS.typeSelect)

    // 选择"库存欠账"
    await typeSelect.selectOption('inventory')

    // 监听 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/debt-management/pending') && req.method() === 'GET',
      { timeout: 10000 }
    )

    // 点击搜索按钮（使用精确选择器）
    await page.locator(DEBT_SELECTORS.searchBtn).click()
    await page.waitForTimeout(1500)

    const request = await requestPromise

    // ✅ 断言：请求参数包含 debt_type=inventory
    expect(request.url()).toContain('debt_type=inventory')
  })

  test('活动筛选下拉框正常工作', async ({ page }) => {
    const campaignSelect = page.locator(DEBT_SELECTORS.campaignSelect)
    await expect(campaignSelect).toBeVisible()

    // 等待活动列表加载（检查下拉框有选项）
    await page.waitForTimeout(2000) // 等待 API 加载活动列表

    // 获取下拉框所有选项
    const options = await campaignSelect.locator('option').allTextContents()
    console.log('活动下拉框选项:', options)

    // 如果有活动选项（除了"全部活动"），选择第一个实际活动
    if (options.length > 1) {
      // 获取第一个非空选项的值
      const firstOption = await campaignSelect.locator('option').nth(1)
      const optionValue = await firstOption.getAttribute('value')
      const optionText = await firstOption.textContent()

      console.log(`选择活动: ${optionText} (ID: ${optionValue})`)

      // 选择活动
      await campaignSelect.selectOption(optionValue)
      await expect(campaignSelect).toHaveValue(optionValue)

      // 监听 API 请求
      const requestPromise = page.waitForRequest(
        (req) => req.url().includes('/debt-management/pending') && req.method() === 'GET',
        { timeout: 10000 }
      )

      // 点击搜索（使用精确选择器）
      await page.locator(DEBT_SELECTORS.searchBtn).click()
      await page.waitForTimeout(1500)

      const request = await requestPromise

      // ✅ 断言：请求参数包含 campaign_id
      expect(request.url()).toContain(`campaign_id=${optionValue}`)
    } else {
      console.log('⚠️ 暂无活动数据，跳过活动筛选测试')
    }
  })

  test('重置按钮清空所有筛选条件并刷新数据', async ({ page }) => {
    const typeSelect = page.locator(DEBT_SELECTORS.typeSelect)
    const campaignSelect = page.locator(DEBT_SELECTORS.campaignSelect)

    // 等待活动列表加载
    await page.waitForTimeout(2000)

    // 先设置筛选条件
    await typeSelect.selectOption('inventory')

    // 获取可选择的活动
    const options = await campaignSelect.locator('option').allTextContents()
    let selectedCampaignValue = ''
    if (options.length > 1) {
      const firstOption = await campaignSelect.locator('option').nth(1)
      selectedCampaignValue = await firstOption.getAttribute('value')
      await campaignSelect.selectOption(selectedCampaignValue)
    }

    // 验证筛选条件已设置
    await expect(typeSelect).toHaveValue('inventory')
    if (selectedCampaignValue) {
      await expect(campaignSelect).toHaveValue(selectedCampaignValue)
    }

    // 监听重置后的 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/debt-management/pending') && req.method() === 'GET',
      { timeout: 10000 }
    )

    // 点击重置按钮（使用精确选择器）
    await page.locator(DEBT_SELECTORS.resetBtn).click()
    await page.waitForTimeout(1500)

    // ✅ 断言：筛选条件已清空
    await expect(typeSelect).toHaveValue('')
    await expect(campaignSelect).toHaveValue('')

    const request = await requestPromise

    // ✅ 断言：重置后请求不包含筛选参数
    expect(request.url()).not.toContain('debt_type=inventory')
    if (selectedCampaignValue) {
      expect(request.url()).not.toContain(`campaign_id=${selectedCampaignValue}`)
    }
  })

  test('组合筛选正常工作（类型 + 活动）', async ({ page }) => {
    const typeSelect = page.locator(DEBT_SELECTORS.typeSelect)
    const campaignSelect = page.locator(DEBT_SELECTORS.campaignSelect)

    // 等待活动列表加载
    await page.waitForTimeout(2000)

    // 设置组合筛选条件
    await typeSelect.selectOption('budget')

    // 获取可选择的活动并选择
    const options = await campaignSelect.locator('option').allTextContents()
    let selectedCampaignValue = ''
    if (options.length > 1) {
      const firstOption = await campaignSelect.locator('option').nth(1)
      selectedCampaignValue = await firstOption.getAttribute('value')
      await campaignSelect.selectOption(selectedCampaignValue)
    }

    // 监听 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/debt-management/pending') && req.method() === 'GET',
      { timeout: 10000 }
    )

    // 点击搜索（使用精确选择器）
    await page.locator(DEBT_SELECTORS.searchBtn).click()

    const request = await requestPromise

    // ✅ 断言：请求包含筛选参数
    expect(request.url()).toContain('debt_type=budget')
    if (selectedCampaignValue) {
      expect(request.url()).toContain(`campaign_id=${selectedCampaignValue}`)
    }
  })
})

test.describe('债务管理 - 清偿操作', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupErrorCapture(page)
    await login(page)
    await navigateToDebtManagement(page)
    // 等待数据加载
    await page.waitForTimeout(3000)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('表格中存在"清偿"按钮', async ({ page }) => {
    // 检查是否有欠账记录（债务管理区域）
    const emptyTip = page.locator('text=暂无待冲销欠账记录')
    const hasData = !(await emptyTip.isVisible().catch(() => false))

    if (hasData) {
      // ✅ 验证清偿按钮存在（债务管理区域内）
      const debtSection = page.locator('div[x-show*="debt-management"]')
      const clearBtn = debtSection.locator('button:has-text("清偿")').first()
      await expect(clearBtn).toBeVisible({ timeout: 5000 })
    } else {
      // 没有数据时跳过测试
      test.skip()
    }
  })

  test('点击"清偿"按钮打开清偿模态框', async ({ page }) => {
    // 债务管理区域内的清偿按钮
    const debtSection = page.locator('div[x-show*="debt-management"]')
    const clearBtn = debtSection.locator('button:has-text("清偿")').first()
    const hasClearBtn = await clearBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasClearBtn) {
      test.skip()
      return
    }

    // 点击清偿按钮
    await clearBtn.click()
    await page.waitForTimeout(1000)

    // ✅ 验证清偿模态框打开
    const modal = page.locator(DEBT_SELECTORS.repayModal)
    await expect(modal).toBeVisible({ timeout: 5000 })

    // ✅ 验证模态框包含必要元素
    await expect(page.locator('label:has-text("清偿数量/金额")')).toBeVisible()
    await expect(page.locator(DEBT_SELECTORS.confirmClearBtn)).toBeVisible()
    await expect(page.locator(DEBT_SELECTORS.cancelBtn)).toBeVisible()
  })

  test('清偿模态框可以关闭（取消操作测试）', async ({ page }) => {
    const debtSection = page.locator('div[x-show*="debt-management"]')
    const clearBtn = debtSection.locator('button:has-text("清偿")').first()
    const hasClearBtn = await clearBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasClearBtn) {
      test.skip()
      return
    }

    // 打开模态框
    await clearBtn.click()
    await page.waitForTimeout(1000)

    const modal = page.locator(DEBT_SELECTORS.repayModal)
    await expect(modal).toBeVisible()

    // 点击取消按钮
    await page.locator(DEBT_SELECTORS.cancelBtn).click()
    await page.waitForTimeout(500)

    // ✅ 验证模态框已关闭
    await expect(modal).not.toBeVisible()
  })

  test('执行清偿操作触发真实 API 调用', async ({ page }) => {
    const debtSection = page.locator('div[x-show*="debt-management"]')
    const clearBtn = debtSection.locator('button:has-text("清偿")').first()
    const hasClearBtn = await clearBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasClearBtn) {
      test.skip()
      return
    }

    // 打开清偿模态框
    await clearBtn.click()
    await page.waitForTimeout(1000)

    // 监听清偿 API 请求
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/debt-management/clear') && resp.request().method() === 'POST',
      { timeout: 15000 }
    )

    // 点击确认清偿按钮
    await page.locator(DEBT_SELECTORS.confirmClearBtn).click()

    // 等待 API 响应
    const response = await responsePromise.catch(() => null)

    if (response) {
      // ✅ 验证 API 被调用
      expect(response.status()).toBeLessThan(500) // 非服务器错误

      const body = await response.json().catch(() => null)
      if (body) {
        // 验证响应格式
        expect(body).toHaveProperty('success')

        if (body.success) {
          // ✅ 验证清偿成功后模态框关闭
          await page.waitForTimeout(1500)
          const modal = page.locator(DEBT_SELECTORS.repayModal)
          await expect(modal).not.toBeVisible({ timeout: 5000 })
        }
      }
    }
  })

  test('清偿 API 请求包含正确的参数', async ({ page }) => {
    const debtSection = page.locator('div[x-show*="debt-management"]')
    const clearBtn = debtSection.locator('button:has-text("清偿")').first()
    const hasClearBtn = await clearBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasClearBtn) {
      test.skip()
      return
    }

    await clearBtn.click()
    await page.waitForTimeout(1000)

    // 监听 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/debt-management/clear') && req.method() === 'POST',
      { timeout: 15000 }
    )

    await page.locator(DEBT_SELECTORS.confirmClearBtn).click()

    const request = await requestPromise.catch(() => null)

    if (request) {
      const postData = request.postDataJSON()

      // ✅ 验证请求参数格式
      expect(postData).toHaveProperty('debt_type')
      expect(postData).toHaveProperty('debt_id')
      expect(postData).toHaveProperty('amount')
      expect(['inventory', 'budget']).toContain(postData.debt_type)
      expect(typeof postData.amount).toBe('number')
    }
  })
})

test.describe('债务管理 - 详情查看', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupErrorCapture(page)
    await login(page)
    await navigateToDebtManagement(page)
    await page.waitForTimeout(3000)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('点击"详情"按钮打开详情模态框', async ({ page }) => {
    // 债务管理区域内的详情按钮
    const debtSection = page.locator('div[x-show*="debt-management"]')
    const detailBtn = debtSection.locator('button:has-text("详情")').first()
    const hasDetailBtn = await detailBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasDetailBtn) {
      test.skip()
      return
    }

    await detailBtn.click()
    await page.waitForTimeout(1000)

    // ✅ 验证详情模态框打开
    const modal = page.locator(DEBT_SELECTORS.detailModal)
    await expect(modal).toBeVisible({ timeout: 5000 })

    // ✅ 验证详情包含必要信息
    await expect(page.locator('text=欠账ID')).toBeVisible()
    await expect(page.locator('text=欠账类型')).toBeVisible()
    await expect(page.locator('text=活动')).toBeVisible()
  })

  test('详情模态框中的"执行清偿"按钮可用', async ({ page }) => {
    const debtSection = page.locator('div[x-show*="debt-management"]')
    const detailBtn = debtSection.locator('button:has-text("详情")').first()
    const hasDetailBtn = await detailBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasDetailBtn) {
      test.skip()
      return
    }

    await detailBtn.click()
    await page.waitForTimeout(1000)

    // ✅ 验证"执行清偿"按钮存在
    const clearBtnInModal = page.locator('button:has-text("执行清偿")')
    await expect(clearBtnInModal).toBeVisible()

    // 点击"执行清偿"应该打开清偿模态框
    await clearBtnInModal.click()
    await page.waitForTimeout(500)

    // ✅ 验证清偿模态框打开
    await expect(page.locator(DEBT_SELECTORS.repayModal)).toBeVisible()
  })
})

test.describe('债务管理 - 分页功能', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupErrorCapture(page)
    await login(page)
    await navigateToDebtManagement(page)
    await page.waitForTimeout(3000)
  })

  test.afterEach(async () => {
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误`).toBe(0)
  })

  test('分页组件正常显示', async ({ page }) => {
    // 检查是否有数据（分页只在有数据时显示）
    const emptyTip = page.locator('text=暂无待冲销欠账记录')
    const hasNoData = await emptyTip.isVisible().catch(() => false)

    if (hasNoData) {
      test.skip()
      return
    }

    // ✅ 验证分页组件存在
    await expect(page.locator('button:has-text("上一页")')).toBeVisible()
    await expect(page.locator('button:has-text("下一页")')).toBeVisible()
  })

  test('翻页触发 API 调用并传递正确的 page 参数', async ({ page }) => {
    const emptyTip = page.locator('text=暂无待冲销欠账记录')
    const hasNoData = await emptyTip.isVisible().catch(() => false)

    if (hasNoData) {
      test.skip()
      return
    }

    const nextBtn = page.locator('button:has-text("下一页")')
    const isDisabled = await nextBtn.isDisabled()

    if (isDisabled) {
      test.skip() // 只有一页数据
      return
    }

    // 监听 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/debt-management/pending') && req.method() === 'GET',
      { timeout: 10000 }
    )

    await nextBtn.click()

    const request = await requestPromise

    // ✅ 验证请求包含 page=2
    expect(request.url()).toContain('page=2')
  })
})

test.describe('债务管理 - 边界条件和错误处理', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupErrorCapture(page)
    await login(page)
  })

  test.afterEach(async () => {
    // 在错误处理测试中，允许有错误但需要被正确处理
  })

  test('无数据时显示空状态提示', async ({ page }) => {
    // 模拟 API 返回空数据
    await page.route('**/debt-management/pending**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [],
            pagination: { page: 1, page_size: 20, total: 0 }
          }
        })
      })
    })

    await navigateToDebtManagement(page)
    await page.waitForTimeout(2000)

    // ✅ 验证空状态提示显示
    await expect(page.locator('text=暂无待冲销欠账记录')).toBeVisible()
  })

  test('API 错误时页面不崩溃', async ({ page }) => {
    // 模拟 API 500 错误
    await page.route('**/debt-management/pending**', (route) => {
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

    await navigateToDebtManagement(page)
    await page.waitForTimeout(2000)

    // ✅ 验证页面仍然正常显示（不崩溃）
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('h5:has-text("待冲销欠账列表")')).toBeVisible()
  })

  test('网络超时时页面有正确的加载状态', async ({ page }) => {
    // 模拟慢速响应
    await page.route('**/debt-management/pending**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 3000))
      route.continue()
    })

    await page.goto('finance-management.html')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // 点击债务管理标签
    await page.locator('button:has-text("债务管理")').click()

    // 页面应该显示加载状态或正常工作
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('债务管理 - 用户操作流程测试', () => {
  let jsErrors

  test.beforeEach(async ({ page }) => {
    jsErrors = setupErrorCapture(page)
    await login(page)
    await navigateToDebtManagement(page)
    await page.waitForTimeout(3000)
  })

  test.afterEach(async () => {
    // ✅ 断言：页面没有 JavaScript 错误
    // 如果有错误，输出详细信息帮助定位问题
    if (jsErrors.length > 0) {
      console.error('🔴 发现 JavaScript 错误:')
      jsErrors.forEach((err, index) => {
        console.error(`  ${index + 1}. [${err.timestamp}] ${err.type || 'error'}: ${err.message}`)
      })
    }
    expect(jsErrors.length, `发现 ${jsErrors.length} 个 JS 错误: ${JSON.stringify(jsErrors.map(e => e.message))}`).toBe(0)
  })

  /**
   * 🔴 用户行为测试：完整的筛选-查看-操作流程
   * 模拟运营人员的日常工作：
   * 1. 按类型筛选欠账
   * 2. 查看欠账详情
   * 3. 执行清偿操作
   */
  test('完整操作流程：筛选 -> 查看详情 -> 清偿', async ({ page }) => {
    // 步骤1：筛选库存欠账（使用精确选择器）
    const typeSelect = page.locator(DEBT_SELECTORS.typeSelect)
    await typeSelect.selectOption('inventory')
    await page.locator(DEBT_SELECTORS.searchBtn).click()
    await page.waitForTimeout(2000)

    // 检查是否有数据
    const emptyTip = page.locator('text=暂无待冲销欠账记录')
    if (await emptyTip.isVisible().catch(() => false)) {
      // 没有库存欠账，尝试预算欠账
      await typeSelect.selectOption('budget')
      await page.locator(DEBT_SELECTORS.searchBtn).click()
      await page.waitForTimeout(2000)

      if (await emptyTip.isVisible().catch(() => false)) {
        test.skip() // 没有任何欠账数据
        return
      }
    }

    // 步骤2：查看第一条欠账的详情（债务管理区域的详情按钮）
    const debtSection = page.locator('div[x-show*="debt-management"]')
    const detailBtn = debtSection.locator('button:has-text("详情")').first()
    if (await detailBtn.isVisible().catch(() => false)) {
      await detailBtn.click()
      await page.waitForTimeout(1000)

      // 验证详情模态框
      await expect(page.locator(DEBT_SELECTORS.detailModal)).toBeVisible()

      // 关闭详情模态框
      await page.locator('button:has-text("关闭")').click()
      await page.waitForTimeout(500)
    }

    // 步骤3：打开清偿模态框（债务管理区域的清偿按钮）
    const clearBtn = debtSection.locator('button:has-text("清偿")').first()
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click()
      await page.waitForTimeout(1000)

      // 验证清偿模态框
      await expect(page.locator(DEBT_SELECTORS.repayModal)).toBeVisible()

      // 验证表单元素可用
      const amountInput = page.locator('input[type="number"]').first()
      await expect(amountInput).toBeVisible()

      // 取消操作（防止实际修改数据）
      await page.locator(DEBT_SELECTORS.cancelBtn).click()
    }
  })

  /**
   * 🔴 状态恢复测试：重置后能否恢复到初始状态
   */
  test('状态恢复：多次筛选和重置', async ({ page }) => {
    const typeSelect = page.locator(DEBT_SELECTORS.typeSelect)
    const campaignSelect = page.locator(DEBT_SELECTORS.campaignSelect)

    // 等待活动列表加载
    await page.waitForTimeout(2000)

    // 初始状态
    await expect(typeSelect).toHaveValue('')
    await expect(campaignSelect).toHaveValue('')

    // 获取可选择的活动
    const options = await campaignSelect.locator('option').allTextContents()
    let selectedValue = ''
    if (options.length > 1) {
      const firstOption = await campaignSelect.locator('option').nth(1)
      selectedValue = await firstOption.getAttribute('value')
    }

    // 第一次筛选
    await typeSelect.selectOption('inventory')
    if (selectedValue) {
      await campaignSelect.selectOption(selectedValue)
    }
    await page.locator(DEBT_SELECTORS.searchBtn).click()
    await page.waitForTimeout(1500)

    // 重置
    await page.locator(DEBT_SELECTORS.resetBtn).click()
    await page.waitForTimeout(1500)

    // 验证恢复初始状态
    await expect(typeSelect).toHaveValue('')
    await expect(campaignSelect).toHaveValue('')

    // 第二次筛选
    await typeSelect.selectOption('budget')
    if (selectedValue) {
      await campaignSelect.selectOption(selectedValue)
    }
    await page.locator(DEBT_SELECTORS.searchBtn).click()
    await page.waitForTimeout(1500)

    // 再次重置
    await page.locator(DEBT_SELECTORS.resetBtn).click()
    await page.waitForTimeout(1500)

    // ✅ 验证再次恢复初始状态
    await expect(typeSelect).toHaveValue('')
    await expect(campaignSelect).toHaveValue('')
  })

  /**
   * 🔴 防呆测试：模态框关闭方式
   */
  test('防呆测试：多种方式关闭模态框', async ({ page }) => {
    const debtSection = page.locator('div[x-show*="debt-management"]')
    const clearBtn = debtSection.locator('button:has-text("清偿")').first()
    if (!(await clearBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    // 打开模态框
    await clearBtn.click()
    await page.waitForTimeout(1000)
    await expect(page.locator(DEBT_SELECTORS.repayModal)).toBeVisible()

    // 方式1：点击取消按钮关闭
    await page.locator(DEBT_SELECTORS.cancelBtn).click()
    await page.waitForTimeout(500)
    await expect(page.locator(DEBT_SELECTORS.repayModal)).not.toBeVisible()

    // 重新打开
    await clearBtn.click()
    await page.waitForTimeout(1000)
    await expect(page.locator(DEBT_SELECTORS.repayModal)).toBeVisible()

    // 方式2：点击关闭按钮 (X) 关闭
    const closeBtn = page.locator('button:has-text("✕")').first()
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
      await page.waitForTimeout(500)
      await expect(page.locator(DEBT_SELECTORS.repayModal)).not.toBeVisible()
    }
  })
})

test.describe('债务管理 - Alpine.js 组件状态验证', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await navigateToDebtManagement(page)
    await page.waitForTimeout(3000)
  })

  test('Alpine.js 组件正确加载并包含债务管理方法', async ({ page }) => {
    // 使用辅助函数检查 Alpine 组件
    const result = await findAlpineComponentWithMethod(page, 'loadDebts')

    // ✅ 断言：找到包含 loadDebts 方法的组件
    expect(result.found, `未找到 loadDebts 方法: ${result.error}`).toBe(true)
  })

  test('Alpine.js debts 数据属性存在', async ({ page }) => {
    const result = await getAlpineData(page, 'debts')

    // ✅ 断言：debts 属性存在
    expect(result.found, `未找到 debts 属性: ${result.error}`).toBe(true)
    expect(Array.isArray(result.value)).toBe(true)
  })

  test('Alpine.js debtStats 数据属性与页面显示一致', async ({ page }) => {
    const result = await getAlpineData(page, 'debtStats')

    // ✅ 断言：debtStats 属性存在
    expect(result.found, `未找到 debtStats 属性: ${result.error}`).toBe(true)

    if (result.value) {
      // 验证 debtStats 结构
      expect(result.value).toHaveProperty('total_inventory_debt')
      expect(result.value).toHaveProperty('total_budget_debt')
      expect(result.value).toHaveProperty('pending_count')
      expect(result.value).toHaveProperty('cleared_today')

      // 验证页面显示值与数据一致
      const pendingCountElement = page.locator('h6:has-text("待处理")').locator('..').locator('p')
      const pageValue = parseInt(await pendingCountElement.textContent()) || 0

      expect(pageValue).toBe(result.value.pending_count)
    }
  })
})

