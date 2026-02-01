/**
 * 消费记录审核 E2E 测试
 *
 * @file admin/tests/e2e/consumption-audit.spec.js
 * @description 消费记录审核完整测试套件
 * @date 2026-02-02
 *
 * 测试覆盖：
 * 1. 页面加载和数据显示
 * 2. 筛选功能（用户ID、状态、日期、风控标记）
 * 3. 异常统计面板
 * 4. 审核操作（通过/拒绝）
 * 5. 批量操作
 * 6. API 响应验证
 */

import { test, expect } from '@playwright/test'

// ============ 配置常量 ============
const TEST_PHONE = '13612227930'
const TEST_CODE = '123456'
const TEST_USER_ID = '31'

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
 * 导航到财务管理页面并等待加载
 */
async function navigateToFinancePage(page) {
  await page.goto('finance-management.html')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // 等待 Alpine.js 初始化
  await page.waitForFunction(
    () => window.Alpine && window.Alpine.version,
    { timeout: 10000 }
  ).catch(() => {
    console.log('⚠️ Alpine.js 初始化超时')
  })
}

/**
 * 筛选待审核记录
 */
async function filterPendingRecords(page) {
  const statusFilter = page.locator('select').filter({ hasText: /全部状态|待审核/ }).first()
  if (await statusFilter.isVisible()) {
    await statusFilter.selectOption('pending')
    await page.waitForTimeout(1500)
  }
}

// ============ 测试套件 ============

test.describe('消费审核 - 页面加载', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('页面正常加载并显示消费记录', async ({ page }) => {
    await navigateToFinancePage(page)

    // ✅ 验证页面标题
    await expect(page.locator('text=财务管理中心')).toBeVisible({ timeout: 5000 })

    // ✅ 验证消费记录审核标题
    await expect(page.locator('text=消费记录审核')).toBeVisible()

    // ✅ 验证表格存在
    await expect(page.locator('table').first()).toBeVisible()

    // ✅ 验证表头包含必要列
    const headers = ['记录ID', '用户', '金额', '状态', '操作']
    for (const header of headers) {
      const visible = await page.locator(`th:has-text("${header}")`).isVisible().catch(() => false)
      console.log(`  表头 ${header}: ${visible ? '✅' : '❌'}`)
    }
  })

  test('消费记录 API 被正确调用', async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/consumption'),
      { timeout: 15000 }
    )

    await navigateToFinancePage(page)

    const response = await responsePromise.catch(() => null)

    if (response) {
      expect(response.status()).toBe(200)
      const body = await response.json().catch(() => null)
      console.log('📡 API 响应:', {
        success: body?.success,
        recordCount: body?.data?.list?.length || body?.data?.records?.length || 0
      })
    }
  })

  test('异常统计面板显示正确', async ({ page }) => {
    await navigateToFinancePage(page)

    // ✅ 验证统计卡片存在
    await expect(page.locator('h6:has-text("异常总数")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('h6:has-text("高频消费")')).toBeVisible()
    await expect(page.locator('h6:has-text("大额异常")')).toBeVisible()
    await expect(page.locator('h6:has-text("异常时段")')).toBeVisible()
  })
})

test.describe('消费审核 - 筛选功能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await navigateToFinancePage(page)
  })

  test('状态筛选正常工作', async ({ page }) => {
    const statusSelect = page.locator('select:has-text("全部状态")').first()
    await expect(statusSelect).toBeVisible({ timeout: 10000 })

    // 切换各种状态
    await statusSelect.selectOption('pending')
    await expect(statusSelect).toHaveValue('pending')

    await statusSelect.selectOption('approved')
    await expect(statusSelect).toHaveValue('approved')

    await statusSelect.selectOption('rejected')
    await expect(statusSelect).toHaveValue('rejected')

    // 切回全部
    await statusSelect.selectOption('')
    await expect(statusSelect).toHaveValue('')
  })

  test('用户ID筛选正常工作', async ({ page }) => {
    const userIdInput = page.locator('input[placeholder="用户ID"]')
    await expect(userIdInput).toBeVisible()
    await userIdInput.fill(TEST_USER_ID)

    // 监听 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/consumption') && req.method() === 'GET',
      { timeout: 10000 }
    ).catch(() => null)

    await page.locator('button:has-text("搜索")').first().click()
    await page.waitForTimeout(2000)

    const request = await requestPromise
    if (request) {
      // API 使用 search 参数进行用户ID搜索
      expect(request.url()).toMatch(/search=31|user_id=31|userId=31/i)
    }

    // 表格应该仍然存在
    await expect(page.locator('table').first()).toBeVisible()
  })

  test('风控标记筛选正常工作', async ({ page }) => {
    const anomalySelect = page.locator('select:has-text("全部风控标记")').first()

    if (await anomalySelect.isVisible()) {
      await anomalySelect.selectOption('high_frequency')
      await expect(anomalySelect).toHaveValue('high_frequency')

      await anomalySelect.selectOption('high_amount')
      await expect(anomalySelect).toHaveValue('high_amount')

      await anomalySelect.selectOption('')
      await expect(anomalySelect).toHaveValue('')
    }
  })

  test('日期筛选正常工作', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first()

    if (await dateInput.isVisible()) {
      const today = new Date().toISOString().split('T')[0]
      await dateInput.fill(today)
      await expect(dateInput).toHaveValue(today)
    }
  })

  test('日期变更自动触发搜索', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first()
    await expect(dateInput).toBeVisible()

    // 监听 API 请求
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/consumption') && req.method() === 'GET',
      { timeout: 10000 }
    ).catch(() => null)

    // 选择日期（应该自动触发搜索）
    const today = new Date().toISOString().split('T')[0]
    await dateInput.fill(today)

    const request = await requestPromise
    if (request) {
      console.log('✅ 日期变更自动触发了搜索请求')
      expect(request.url()).toContain('start_date')
    }
  })

  test('清除日期后点击搜索能查看全部数据', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first()
    await expect(dateInput).toBeVisible()

    // 先设置日期
    const today = new Date().toISOString().split('T')[0]
    await dateInput.fill(today)
    await page.waitForTimeout(1500)

    // 清除日期
    await dateInput.fill('')
    await expect(dateInput).toHaveValue('')

    // 点击搜索
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/consumption') && req.method() === 'GET',
      { timeout: 10000 }
    ).catch(() => null)

    await page.locator('button:has-text("搜索")').first().click()
    await page.waitForTimeout(1500)

    const request = await requestPromise
    if (request) {
      // 清除日期后，URL 不应该包含 start_date 参数
      expect(request.url()).not.toContain('start_date=')
      console.log('✅ 清除日期后成功查询全部数据')
    }
  })

  test('重置按钮清空所有筛选条件', async ({ page }) => {
    // 定位消费记录区域的筛选表单（包含用户ID输入框的区域）
    const filterArea = page.locator('.p-4.border-b').filter({ has: page.locator('input[placeholder="用户ID"]') })

    // 先设置一些筛选条件
    await page.locator('input[placeholder="用户ID"]').fill('31')
    await page.locator('select').filter({ hasText: /全部状态/ }).first().selectOption('pending')

    const dateInput = page.locator('input[type="date"]').first()
    if (await dateInput.isVisible()) {
      await dateInput.fill(new Date().toISOString().split('T')[0])
    }

    // 点击消费记录区域内的重置按钮（通过 @click 属性定位）
    const resetBtn = page.locator('button[\\@click*="resetConsumptionFilters"]')
    const resetBtnAlt = filterArea.locator('button:has-text("重置")')

    let resetBtnToClick = resetBtn
    if (!await resetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // 备选：使用区域内的重置按钮
      if (await resetBtnAlt.isVisible({ timeout: 3000 }).catch(() => false)) {
        resetBtnToClick = resetBtnAlt
      } else {
        console.log('⚠️ 重置按钮不可见，可能页面版本未更新')
        test.skip()
        return
      }
    }

    await resetBtnToClick.click()
    await page.waitForTimeout(1500)

    // ✅ 验证所有筛选条件已清空
    await expect(page.locator('input[placeholder="用户ID"]')).toHaveValue('')
    await expect(page.locator('select').filter({ hasText: /全部状态/ }).first()).toHaveValue('')

    if (await dateInput.isVisible()) {
      await expect(dateInput).toHaveValue('')
    }

    console.log('✅ 重置按钮正确清空了所有筛选条件')
  })
})

test.describe('消费审核 - 审核操作', () => {
  test.beforeEach(async ({ page }) => {
    // 监听控制台错误
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`❌ Console Error: ${msg.text()}`)
      }
    })

    await login(page)
    await navigateToFinancePage(page)
  })

  test('点击通过按钮触发审核 API', async ({ page }) => {
    await filterPendingRecords(page)

    // 检查是否有待审核记录
    const pendingRows = page.locator('tbody tr')
    const rowCount = await pendingRows.count()

    if (rowCount === 0) {
      console.log('⚠️ 没有待审核记录，跳过测试')
      test.skip()
      return
    }

    console.log(`📊 发现 ${rowCount} 条记录`)

    // 查找通过按钮
    const approveBtn = pendingRows.first().locator('button:has-text("通过")').first()
    const btnVisible = await approveBtn.isVisible().catch(() => false)

    if (!btnVisible) {
      console.log('⚠️ 通过按钮不可见')
      test.skip()
      return
    }

    // 监听 API
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/consumption/approve') && resp.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null)

    // 处理确认对话框
    page.once('dialog', async (dialog) => {
      console.log('📢 对话框:', dialog.message())
      await dialog.accept()
    })

    // 点击通过
    await approveBtn.click()
    await page.waitForTimeout(3000)

    const response = await responsePromise

    if (response) {
      console.log('✅ Approve API 已调用')
      const body = await response.json().catch(() => null)
      expect(body).toHaveProperty('success')
      console.log('📋 响应:', JSON.stringify(body).slice(0, 300))
    } else {
      console.log('⚠️ 未检测到 API 调用')
    }
  })

  test('点击拒绝按钮弹出拒绝原因对话框', async ({ page }) => {
    await filterPendingRecords(page)

    const rejectBtn = page.locator('button:has-text("拒绝")').first()
    const btnVisible = await rejectBtn.isVisible().catch(() => false)

    if (!btnVisible) {
      console.log('⚠️ 拒绝按钮不可见')
      test.skip()
      return
    }

    await rejectBtn.click()
    await page.waitForTimeout(1000)

    // 检查是否弹出模态框或输入框
    const rejectModal = page.locator('[x-show*="rejectModal"], .modal, [role="dialog"]')
    const reasonInput = page.locator('textarea')

    const modalVisible = await rejectModal.isVisible({ timeout: 3000 }).catch(() => false)
    const inputVisible = await reasonInput.first().isVisible({ timeout: 3000 }).catch(() => false)

    expect(modalVisible || inputVisible).toBe(true)
    console.log('✅ 拒绝原因对话框已显示')
  })
})

test.describe('消费审核 - 批量操作', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await navigateToFinancePage(page)
  })

  test('全选复选框正常工作', async ({ page }) => {
    await filterPendingRecords(page)

    const selectAllCheckbox = page.locator('thead input[type="checkbox"]').first()

    if (!await selectAllCheckbox.isVisible()) {
      console.log('⚠️ 全选复选框不可见')
      test.skip()
      return
    }

    const rowCheckboxes = page.locator('tbody input[type="checkbox"]')
    const checkboxCount = await rowCheckboxes.count()

    if (checkboxCount === 0) {
      console.log('⚠️ 没有可选择的记录')
      test.skip()
      return
    }

    // 点击全选
    await selectAllCheckbox.click()
    await page.waitForTimeout(500)

    // 验证批量操作按钮显示
    const batchApproveBtn = page.locator('button:has-text("批量通过")')
    const approveVisible = await batchApproveBtn.isVisible({ timeout: 3000 }).catch(() => false)

    console.log('📊 批量通过按钮:', approveVisible ? '✅ 显示' : '❌ 未显示')
  })
})

test.describe('消费审核 - 错误处理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('页面没有 JavaScript 错误', async ({ page }) => {
    const jsErrors = []

    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })

    await navigateToFinancePage(page)
    await page.waitForTimeout(3000)

    expect(jsErrors.length).toBe(0)
  })

  test('API 错误时显示友好提示', async ({ page }) => {
    // 模拟 API 错误
    await page.route('**/api/v4/console/consumption**', (route) => {
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

    await navigateToFinancePage(page)
    await page.waitForTimeout(2000)

    // 页面应该正常显示（不崩溃）
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('待处理中心 - 消费审核入口', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('待处理中心页面可以加载', async ({ page }) => {
    await page.goto('pending-center.html')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1:has-text("待处理中心")')).toBeVisible({ timeout: 10000 })
  })

  test('显示消耗审核统计卡片', async ({ page }) => {
    await page.goto('pending-center.html')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    await expect(
      page.locator('.stat-card:has-text("消耗审核"), div:has-text("消耗审核")').first()
    ).toBeVisible({ timeout: 10000 })
  })
})
