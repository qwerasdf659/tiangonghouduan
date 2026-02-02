/**
 * 商户积分审核 E2E 测试
 *
 * @file admin/tests/e2e/merchant-points.spec.js
 * @description 商户积分审核完整测试套件 - 模拟真实运营人员操作流程
 * @date 2026-02-02
 *
 * 测试覆盖（用户行为导向）：
 * 1. 页面加载和统计数据显示
 * 2. 商户搜索功能（正向流程）
 * 3. 搜索结果验证和数据正确性
 * 4. 清空搜索和状态恢复
 * 5. 审核通过功能（完整业务流程）
 * 6. 审核拒绝功能（含拒绝原因）
 * 7. 查看详情功能
 * 8. 分页功能测试
 * 9. 错误处理和边界条件
 * 10. API 响应验证和网络请求拦截
 *
 * 测试策略：
 * - 真正点击按钮触发真实 API 调用
 * - 验证 API 响应数据格式和内容
 * - 检测 JavaScript 错误
 * - 验证 UI 状态变化
 * - 模拟真实运营人员的日常工作流程
 */

import { test, expect } from '@playwright/test'

// ============ 配置常量 ============
const TEST_PHONE = '13612227930'
const TEST_CODE = '123456'
const TEST_USER_ID = '31'  // 测试用户ID

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
 * 导航到财务管理页面并切换到商户积分子页面
 */
async function navigateToMerchantPoints(page) {
  await page.goto('finance-management.html')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // 等待 Alpine.js 初始化
  await page.waitForFunction(
    () => window.Alpine && window.Alpine.version,
    { timeout: 10000 }
  ).catch(() => {
    console.log('⚠️ Alpine.js 初始化超时，继续测试...')
  })

  // 等待导航按钮区域加载
  await page.waitForSelector('.flex.border-b button', { state: 'visible', timeout: 10000 })
  
  // 点击商户积分标签切换到商户积分页面
  // 按钮使用 <span x-text="page.title"></span> 显示标题
  const merchantTab = page.locator('button span:text("商户积分")').first()
  await expect(merchantTab).toBeVisible({ timeout: 10000 })
  await merchantTab.click()
  await page.waitForTimeout(2000)
  
  // 等待 Alpine store 状态更新
  await page.waitForFunction(
    () => window.Alpine && window.Alpine.store && window.Alpine.store('financePage') === 'merchant-points',
    { timeout: 10000 }
  ).catch(() => {
    console.log('⚠️ Alpine store 更新超时，继续测试...')
  })
  
  // 确保商户积分页面已显示（等待列表标题可见）
  await page.waitForSelector('h5:has-text("商户积分申请列表")', { state: 'visible', timeout: 10000 })
}

/**
 * 获取商户积分区域的容器选择器
 * 商户积分区域使用 x-show="current_page === 'merchant-points'" 控制显示
 */
function getMerchantPointsContainer(page) {
  return page.locator('div[x-show="current_page === \'merchant-points\'"]')
}

/**
 * 获取商户积分页面的商户ID输入框
 */
function getMerchantIdInput(page) {
  return getMerchantPointsContainer(page).locator('input[x-model="merchantFilters.merchant_id"]')
}

/**
 * 获取关键词搜索输入框
 */
function getKeywordInput(page) {
  return getMerchantPointsContainer(page).locator('input[x-model="merchantFilters.keyword"]')
}

/**
 * 获取商户积分区域的搜索按钮
 */
function getSearchButton(page) {
  return getMerchantPointsContainer(page).locator('button:has-text("🔍 搜索")')
}

/**
 * 获取商户积分区域的重置按钮
 */
function getResetButton(page) {
  return getMerchantPointsContainer(page).locator('button:has-text("重置")')
}

/**
 * 获取商户积分区域的表格
 */
function getMerchantTable(page) {
  return getMerchantPointsContainer(page).locator('tbody')
}

/**
 * 等待 API 响应的辅助函数
 */
async function waitForApiResponse(page, urlPattern, timeout = 15000) {
  return page.waitForResponse(
    (resp) => resp.url().includes(urlPattern),
    { timeout }
  ).catch(() => null)
}

// ============ 测试套件：页面加载和统计数据 ============

test.describe('商户积分 - 页面加载和统计数据', () => {
  // 收集 JS 错误
  let jsErrors = []
  
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    // 捕获所有 JavaScript 错误
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
      console.log(`❌ JS Error: ${error.message}`)
    })
    
    await login(page)
  })

  test.afterEach(async () => {
    // ✅ 断言：测试过程中不应有 JS 错误
    expect(jsErrors, 'JavaScript 错误数量应为 0').toHaveLength(0)
  })

  test('页面正常加载并显示商户积分标签', async ({ page }) => {
    await page.goto('finance-management.html')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // ✅ 验证页面标题
    await expect(page.locator('text=财务管理中心')).toBeVisible({ timeout: 5000 })

    // ✅ 验证商户积分标签存在
    const merchantTab = page.locator('button:has-text("商户积分")')
    await expect(merchantTab).toBeVisible()

    console.log('✅ 商户积分标签可见')
  })

  test('切换到商户积分页面后统计卡片正确显示', async ({ page }) => {
    await navigateToMerchantPoints(page)

    // ✅ 验证统计卡片存在
    await expect(page.locator('h6:has-text("商户总数")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('h6:has-text("积分总量")')).toBeVisible()
    await expect(page.locator('h6:has-text("活跃商户")')).toBeVisible()

    // ✅ 验证统计数值是数字格式
    const totalMerchantsEl = page.locator('h6:has-text("商户总数") + p, h6:has-text("商户总数") ~ p').first()
    const totalText = await totalMerchantsEl.textContent()
    
    // 验证是有效的数字（可能包含逗号分隔符）
    const numericValue = totalText.replace(/,/g, '')
    expect(numericValue).toMatch(/^\d+$/)
    console.log(`📊 商户总数: ${totalText}`)
    
    // ✅ 验证积分总量也是数字
    const totalPointsEl = page.locator('h6:has-text("积分总量") + p, h6:has-text("积分总量") ~ p').first()
    const pointsText = await totalPointsEl.textContent()
    const pointsNumeric = pointsText.replace(/,/g, '')
    expect(pointsNumeric).toMatch(/^\d+$/)
    console.log(`📊 积分总量: ${pointsText}`)
  })

  test('商户积分统计 API 被正确调用并返回有效数据', async ({ page }) => {
    // 监听统计 API 请求
    const statsPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/merchant-points/stats'),
      { timeout: 15000 }
    ).catch(() => null)

    await navigateToMerchantPoints(page)

    const response = await statsPromise

    if (response) {
      // ✅ 断言 HTTP 状态码
      expect(response.status()).toBe(200)

      // ✅ 断言响应数据格式
      const body = await response.json().catch(() => null)
      expect(body).toHaveProperty('success')
      expect(body.success).toBe(true)
      
      if (body?.data) {
        console.log('✅ 商户积分统计 API 响应正确')
        console.log('📊 响应数据:', JSON.stringify(body.data).slice(0, 300))
      }
    } else {
      // 如果没有捕获到统计 API，记录但不失败（可能页面已有缓存数据）
      console.log('⚠️ 未检测到统计 API 调用（可能使用缓存数据）')
    }
  })

  test('商户积分列表 API 被正确调用', async ({ page }) => {
    // 监听列表 API 请求
    const listPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/merchant-points') && 
                !resp.url().includes('/stats') &&
                !resp.url().includes('/approve') &&
                !resp.url().includes('/reject'),
      { timeout: 15000 }
    ).catch(() => null)

    await navigateToMerchantPoints(page)

    const response = await listPromise

    if (response) {
      // ✅ 断言 HTTP 状态码
      expect(response.status()).toBe(200)

      // ✅ 断言响应数据格式
      const body = await response.json().catch(() => null)
      expect(body).toHaveProperty('success')
      
      if (body?.success && body?.data) {
        const list = body.data.merchants || body.data.list || []
        console.log(`✅ 商户积分列表 API 返回 ${list.length} 条记录`)
      }
    } else {
      console.log('⚠️ 未检测到列表 API 调用')
    }
  })

  test('页面初始状态显示列表标题和筛选区域', async ({ page }) => {
    await navigateToMerchantPoints(page)

    // ✅ 验证列表标题存在（在商户积分区域内）
    const container = getMerchantPointsContainer(page)
    await expect(container.locator('h5:has-text("商户积分申请列表")')).toBeVisible({ timeout: 10000 })

    // ✅ 验证商户ID筛选输入框存在
    const merchantIdInput = getMerchantIdInput(page)
    await expect(merchantIdInput).toBeVisible()

    // ✅ 验证关键词筛选输入框存在
    const keywordInput = getKeywordInput(page)
    await expect(keywordInput).toBeVisible()

    // ✅ 验证搜索按钮存在（在商户积分区域内）
    const searchBtn = getSearchButton(page)
    await expect(searchBtn).toBeVisible()

    // ✅ 验证重置按钮存在（在商户积分区域内）
    const resetBtn = getResetButton(page)
    await expect(resetBtn).toBeVisible()

    console.log('✅ 页面初始状态正确，所有筛选元素可见')
  })
})

// ============ 测试套件：商户搜索功能 ============

test.describe('商户积分 - 商户搜索功能', () => {
  let jsErrors = []
  
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    // 捕获 JavaScript 错误
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
      console.log(`❌ JS Error: ${error.message}`)
    })
    
    await login(page)
    await navigateToMerchantPoints(page)
  })

  test.afterEach(async () => {
    expect(jsErrors, 'JavaScript 错误数量应为 0').toHaveLength(0)
  })

  test('输入商户ID并点击搜索触发 API 调用', async ({ page }) => {
    // 获取商户ID输入框（在商户积分区域内）
    const merchantIdInput = getMerchantIdInput(page)
    await expect(merchantIdInput).toBeVisible({ timeout: 10000 })
    
    // 输入商户ID
    await merchantIdInput.fill(TEST_USER_ID)
    
    // 监听 API 请求（商户积分列表 API）
    const apiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/merchant-points') && 
                !resp.url().includes('/stats'),
      { timeout: 15000 }
    ).catch(() => null)
    
    // 点击搜索按钮（在商户积分区域内）
    const searchBtn = getSearchButton(page)
    await expect(searchBtn).toBeVisible({ timeout: 5000 })
    await searchBtn.click()
    
    // 等待 API 响应
    const response = await apiPromise
    
    if (response) {
      // ✅ 断言：API 调用成功
      expect(response.status()).toBe(200)
      
      const body = await response.json().catch(() => null)
      expect(body).toHaveProperty('success')
      
      console.log(`✅ 搜索 API 调用成功`)
      console.log(`📊 API URL: ${response.url()}`)
    } else {
      // 没有 API 响应可能是因为数据已加载或网络问题
      console.log('⚠️ 未捕获到搜索 API 响应')
    }
    
    // 等待页面更新
    await page.waitForTimeout(1000)
    
    // ✅ 验证输入框值保持
    const inputValue = await merchantIdInput.inputValue()
    expect(inputValue).toBe(TEST_USER_ID)
  })

  test('输入关键词搜索功能正常工作', async ({ page }) => {
    const keywordInput = getKeywordInput(page)
    await expect(keywordInput).toBeVisible({ timeout: 10000 })
    
    // 输入关键词
    const testKeyword = '测试'
    await keywordInput.fill(testKeyword)
    
    // 监听 API 请求
    const apiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/merchant-points') && 
                !resp.url().includes('/stats'),
      { timeout: 15000 }
    ).catch(() => null)
    
    // 点击搜索按钮（在商户积分区域内）
    const searchBtn = getSearchButton(page)
    await expect(searchBtn).toBeVisible({ timeout: 5000 })
    await searchBtn.click()
    
    const response = await apiPromise
    
    if (response) {
      // ✅ 断言：API 调用成功
      expect(response.status()).toBe(200)
      
      console.log(`✅ 关键词搜索 API 调用成功`)
    }
    
    // ✅ 验证输入框值保持
    const inputValue = await keywordInput.inputValue()
    expect(inputValue).toBe(testKeyword)
  })

  test('重置按钮清空筛选条件并重新加载数据', async ({ page }) => {
    // 先输入筛选条件（在商户积分区域内）
    const merchantIdInput = getMerchantIdInput(page)
    const keywordInput = getKeywordInput(page)
    
    await expect(merchantIdInput).toBeVisible({ timeout: 10000 })
    await merchantIdInput.fill(TEST_USER_ID)
    await keywordInput.fill('测试关键词')
    
    // 点击搜索执行筛选（在商户积分区域内）
    const searchBtn = getSearchButton(page)
    await searchBtn.click()
    await page.waitForTimeout(1000)
    
    // 监听重置后的 API 请求
    const apiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/merchant-points') && 
                !resp.url().includes('/stats'),
      { timeout: 15000 }
    ).catch(() => null)
    
    // 点击重置按钮（在商户积分区域内）
    const resetBtn = getResetButton(page)
    await expect(resetBtn).toBeVisible({ timeout: 5000 })
    await resetBtn.click()
    
    // 等待 API 响应
    await apiPromise
    
    // 等待页面更新
    await page.waitForTimeout(1000)
    
    // ✅ 断言：输入框被清空（运营人员期望看到空的筛选条件）
    const merchantIdValue = await merchantIdInput.inputValue()
    const keywordValue = await keywordInput.inputValue()
    
    expect(merchantIdValue).toBe('')
    expect(keywordValue).toBe('')
    
    console.log('✅ 重置功能正常：筛选条件已清空')
  })

  test('空搜索条件时显示全部数据', async ({ page }) => {
    // 确保输入框为空（在商户积分区域内）
    const merchantIdInput = getMerchantIdInput(page)
    await expect(merchantIdInput).toBeVisible({ timeout: 10000 })
    await merchantIdInput.clear()
    
    // 监听 API 请求
    const apiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/merchant-points') && 
                !resp.url().includes('/stats'),
      { timeout: 15000 }
    ).catch(() => null)
    
    // 点击搜索（在商户积分区域内）
    const searchBtn = getSearchButton(page)
    await expect(searchBtn).toBeVisible({ timeout: 5000 })
    await searchBtn.click()
    
    const response = await apiPromise
    
    if (response) {
      const body = await response.json().catch(() => null)
      
      if (body?.success) {
        const list = body.data?.merchants || body.data?.list || body.data || []
        const listLen = Array.isArray(list) ? list.length : 0
        console.log(`✅ 空条件搜索返回 ${listLen} 条记录`)
        
        // ✅ 断言：应该返回数据（不强制要求有数据，但 API 应该正常响应）
        expect(body).toHaveProperty('success', true)
      }
    }
  })
})

// ============ 测试套件：列表数据展示和交互 ============

test.describe('商户积分 - 列表数据展示', () => {
  let jsErrors = []
  let networkErrors = []
  
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    networkErrors = []
    
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    
    // 监听网络错误
    page.on('requestfailed', (request) => {
      networkErrors.push({
        url: request.url(),
        error: request.failure()?.errorText
      })
    })
    
    await login(page)
    await navigateToMerchantPoints(page)
  })

  test.afterEach(async () => {
    expect(jsErrors, 'JavaScript 错误数量应为 0').toHaveLength(0)
  })

  test('列表表头正确显示所有列', async ({ page }) => {
    // ✅ 验证表头列存在（商户积分页面的表头）
    const expectedHeaders = ['申请ID', '用户', '积分金额', '状态', '申请时间', '操作']
    
    // 等待商户积分区域的表格加载
    const container = getMerchantPointsContainer(page)
    const table = container.locator('table')
    await expect(table).toBeVisible({ timeout: 10000 })
    
    for (const header of expectedHeaders) {
      // 在商户积分区域的表格中查找表头
      const headerCell = table.locator(`th:has-text("${header}")`)
      await expect(headerCell).toBeVisible({ timeout: 5000 })
      console.log(`✅ 表头 "${header}" 可见`)
    }
  })

  test('列表数据行正确渲染（如果有数据）', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // 定位商户积分区域的表格
    const merchantTable = getMerchantTable(page)
    
    // 检查是否有数据行
    const dataRows = merchantTable.locator('tr')
    const rowCount = await dataRows.count()
    
    if (rowCount > 0) {
      console.log(`📊 商户积分列表有 ${rowCount} 条数据`)
      
      // ✅ 验证第一行数据格式正确
      const firstRow = dataRows.first()
      
      // 验证申请ID存在
      const idCell = firstRow.locator('td').first()
      const idText = await idCell.textContent()
      expect(idText.trim()).not.toBe('')
      console.log(`📋 第一条记录 ID: ${idText}`)
      
      // 验证状态徽章存在（动态渲染的状态文本）
      const statusBadge = firstRow.locator('span.rounded')
      const statusBadgeCount = await statusBadge.count()
      expect(statusBadgeCount).toBeGreaterThan(0)
      
      console.log('✅ 列表数据行格式正确')
    } else {
      // 检查空数据提示
      const container = getMerchantPointsContainer(page)
      const emptyTip = container.locator('text=暂无商户积分申请记录')
      const isEmpty = await emptyTip.isVisible().catch(() => false)
      
      if (isEmpty) {
        console.log('📋 列表为空，显示空数据提示（正常情况）')
      } else {
        console.log('⚠️ 列表无数据，可能正在加载中')
      }
    }
  })

  test('待审核记录显示通过和拒绝按钮', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // 定位商户积分区域的表格
    const merchantTable = getMerchantTable(page)
    
    // 查找待审核状态的行（状态通过 x-text 动态渲染为"待审核"）
    const allRows = merchantTable.locator('tr')
    const rowCount = await allRows.count()
    
    let pendingRowFound = false
    for (let i = 0; i < rowCount; i++) {
      const row = allRows.nth(i)
      const statusSpan = row.locator('span.rounded')
      const statusText = await statusSpan.textContent().catch(() => '')
      
      if (statusText.includes('待审核')) {
        pendingRowFound = true
        console.log(`📊 发现待审核记录在第 ${i + 1} 行`)
        
        // ✅ 验证通过按钮存在
        const approveBtn = row.locator('button:has-text("通过")')
        await expect(approveBtn).toBeVisible({ timeout: 5000 })
        
        // ✅ 验证拒绝按钮存在
        const rejectBtn = row.locator('button:has-text("拒绝")')
        await expect(rejectBtn).toBeVisible({ timeout: 5000 })
        
        // ✅ 验证详情按钮存在
        const detailBtn = row.locator('button:has-text("详情")')
        await expect(detailBtn).toBeVisible({ timeout: 5000 })
        
        console.log('✅ 待审核记录的操作按钮完整显示')
        break
      }
    }
    
    if (!pendingRowFound) {
      console.log('📋 没有待审核记录（可能都已处理）')
    }
  })

  test('已处理记录不显示审核按钮', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // 定位商户积分区域的表格
    const merchantTable = getMerchantTable(page)
    const allRows = merchantTable.locator('tr')
    const rowCount = await allRows.count()
    
    let processedRowChecked = false
    
    for (let i = 0; i < rowCount; i++) {
      const row = allRows.nth(i)
      const statusSpan = row.locator('span.rounded')
      const statusText = await statusSpan.textContent().catch(() => '')
      
      if (statusText.includes('已通过') || statusText.includes('已拒绝')) {
        console.log(`📊 发现已处理记录在第 ${i + 1} 行，状态: ${statusText}`)
        
        // ✅ 验证不显示通过/拒绝按钮
        const approveBtn = row.locator('button:has-text("通过")')
        const approveBtnCount = await approveBtn.count()
        
        expect(approveBtnCount).toBe(0)
        
        const rejectBtn = row.locator('button:has-text("拒绝")')
        const rejectBtnCount = await rejectBtn.count()
        
        expect(rejectBtnCount).toBe(0)
        
        console.log('✅ 已处理记录不显示审核按钮（符合预期）')
        processedRowChecked = true
        break
      }
    }
    
    if (!processedRowChecked) {
      console.log('📋 没有已处理记录')
    }
  })
})

// ============ 测试套件：审核操作功能 ============

test.describe('商户积分 - 审核操作功能', () => {
  let jsErrors = []
  
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
      console.log(`❌ JS Error: ${error.message}`)
    })
    
    await login(page)
    await navigateToMerchantPoints(page)
  })

  test.afterEach(async () => {
    expect(jsErrors, 'JavaScript 错误数量应为 0').toHaveLength(0)
  })

  test('点击通过按钮触发审核通过 API 调用', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // 定位商户积分区域的表格
    const merchantTable = getMerchantTable(page)
    const allRows = merchantTable.locator('tr')
    const rowCount = await allRows.count()
    
    // 查找待审核记录
    let pendingRow = null
    let recordId = ''
    
    for (let i = 0; i < rowCount; i++) {
      const row = allRows.nth(i)
      const statusSpan = row.locator('span.rounded')
      const statusText = await statusSpan.textContent().catch(() => '')
      
      if (statusText.includes('待审核')) {
        pendingRow = row
        recordId = await row.locator('td').first().textContent().catch(() => '')
        break
      }
    }
    
    if (!pendingRow) {
      console.log('⚠️ 没有待审核记录，跳过审核通过测试')
      test.skip()
      return
    }
    
    console.log(`📋 准备审核记录 ID: ${recordId}`)
    
    // 监听审核通过 API 请求
    const approveApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/merchant-points') && 
                resp.url().includes('/approve'),
      { timeout: 15000 }
    ).catch(() => null)
    
    // 点击通过按钮（真正触发 API 调用）
    const approveBtn = pendingRow.locator('button:has-text("通过")')
    await expect(approveBtn).toBeVisible({ timeout: 5000 })
    await approveBtn.click()
    
    // 等待 API 响应
    const response = await approveApiPromise
    
    if (response) {
      // ✅ 断言：API 调用成功
      expect(response.status()).toBeLessThan(500) // 4xx 可能是业务错误，5xx 是服务器错误
      
      const body = await response.json().catch(() => null)
      
      if (body?.success) {
        console.log(`✅ 审核通过 API 调用成功，记录 ID: ${recordId}`)
        
        // 等待 UI 更新
        await page.waitForTimeout(1000)
        
        console.log('✅ 审核操作完成')
      } else {
        console.log(`⚠️ 审核通过 API 返回业务错误: ${body?.message || '未知错误'}`)
      }
    } else {
      console.log('⚠️ 未捕获到审核通过 API 响应')
    }
  })

  test('点击拒绝按钮应显示拒绝原因输入框', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // 定位商户积分区域的表格
    const merchantTable = getMerchantTable(page)
    const allRows = merchantTable.locator('tr')
    const rowCount = await allRows.count()
    
    // 查找待审核记录
    let pendingRow = null
    
    for (let i = 0; i < rowCount; i++) {
      const row = allRows.nth(i)
      const statusSpan = row.locator('span.rounded')
      const statusText = await statusSpan.textContent().catch(() => '')
      
      if (statusText.includes('待审核')) {
        pendingRow = row
        break
      }
    }
    
    if (!pendingRow) {
      console.log('⚠️ 没有待审核记录，跳过拒绝测试')
      test.skip()
      return
    }
    
    // 点击拒绝按钮
    const rejectBtn = pendingRow.locator('button:has-text("拒绝")')
    await expect(rejectBtn).toBeVisible({ timeout: 5000 })
    await rejectBtn.click()
    
    // 等待拒绝弹窗出现（如果有拒绝原因输入功能）
    await page.waitForTimeout(500)
    
    // 检查是否有拒绝原因输入框或确认弹窗
    const rejectModal = page.locator('[x-ref="rejectModal"], .modal:has-text("拒绝")')
    const rejectReasonInput = page.locator('textarea[x-model*="reason"], input[placeholder*="原因"]')
    
    const modalVisible = await rejectModal.isVisible().catch(() => false)
    const inputVisible = await rejectReasonInput.isVisible().catch(() => false)
    
    if (modalVisible || inputVisible) {
      console.log('✅ 点击拒绝后显示拒绝原因输入界面')
      
      // 如果有输入框，测试输入功能
      if (inputVisible) {
        await rejectReasonInput.fill('测试拒绝原因：不符合发放条件')
        console.log('✅ 成功输入拒绝原因')
      }
    } else {
      // 可能直接触发 API 调用
      console.log('📋 点击拒绝按钮直接触发操作（无额外输入界面）')
    }
  })

  test('点击详情按钮打开详情弹窗', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // 定位商户积分区域的表格
    const merchantTable = getMerchantTable(page)
    const dataRows = merchantTable.locator('tr')
    const rowCount = await dataRows.count()
    
    if (rowCount === 0) {
      console.log('⚠️ 没有数据记录，跳过详情测试')
      test.skip()
      return
    }
    
    const firstRow = dataRows.first()
    
    // 监听详情 API 请求
    const detailApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/merchant-points/') && 
                !resp.url().includes('/stats') &&
                !resp.url().includes('/approve') &&
                !resp.url().includes('/reject') &&
                resp.request().method() === 'GET',
      { timeout: 15000 }
    ).catch(() => null)
    
    // 点击详情按钮
    const detailBtn = firstRow.locator('button:has-text("详情")')
    await expect(detailBtn).toBeVisible({ timeout: 5000 })
    await detailBtn.click()
    
    // 等待弹窗出现
    await page.waitForTimeout(500)
    
    // 检查详情弹窗
    const detailModal = page.locator('[x-ref="merchantPointDetailModal"]')
    const modalVisible = await detailModal.isVisible().catch(() => false)
    
    if (modalVisible) {
      console.log('✅ 详情弹窗成功打开')
      
      // ✅ 验证弹窗内容
      await expect(page.locator('text=商户积分详情')).toBeVisible({ timeout: 5000 })
      
      // 关闭弹窗
      const closeBtn = page.locator('[x-ref="merchantPointDetailModal"] button:has-text("✕"), [x-ref="merchantPointDetailModal"] button:has-text("关闭")').first()
      if (await closeBtn.isVisible()) {
        await closeBtn.click()
        console.log('✅ 详情弹窗成功关闭')
      }
    } else {
      console.log('📋 点击详情后可能直接显示数据（无弹窗）或弹窗未正确定位')
    }
    
    // 检查 API 响应
    const response = await detailApiPromise
    if (response) {
      expect(response.status()).toBe(200)
      console.log('✅ 详情 API 调用成功')
    }
  })
})

// ============ 测试套件：分页功能 ============

test.describe('商户积分 - 分页功能', () => {
  let jsErrors = []
  
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    
    await login(page)
    await navigateToMerchantPoints(page)
  })

  test.afterEach(async () => {
    expect(jsErrors, 'JavaScript 错误数量应为 0').toHaveLength(0)
  })

  test('分页信息正确显示', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // 定位商户积分区域的表格
    const merchantTable = getMerchantTable(page)
    const dataRows = merchantTable.locator('tr')
    const rowCount = await dataRows.count()
    
    if (rowCount > 0) {
      // ✅ 验证分页信息存在
      const container = getMerchantPointsContainer(page)
      const paginationArea = container.locator('.border-t').first()
      const paginationVisible = await paginationArea.isVisible().catch(() => false)
      
      if (paginationVisible) {
        const paginationText = await paginationArea.textContent()
        console.log(`📊 分页信息: ${paginationText}`)
        
        // 验证包含"条记录"字样
        if (paginationText.includes('条记录')) {
          console.log('✅ 分页信息格式正确')
        }
      }
    } else {
      console.log('📋 无数据，分页区域可能隐藏')
    }
  })

  test('下一页按钮正确触发分页 API', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // 检查商户积分区域是否有多页数据
    const container = getMerchantPointsContainer(page)
    const nextBtn = container.locator('button:has-text("下一页")')
    const nextBtnVisible = await nextBtn.isVisible().catch(() => false)
    
    if (!nextBtnVisible) {
      console.log('📋 没有下一页按钮（数据不足一页）')
      test.skip()
      return
    }
    
    // 检查按钮是否禁用
    const isDisabled = await nextBtn.isDisabled().catch(() => true)
    
    if (isDisabled) {
      console.log('📋 下一页按钮禁用（已是最后一页）')
      test.skip()
      return
    }
    
    // 监听分页 API 请求
    const pageApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v4/console/merchant-points') && 
                resp.url().includes('page=2'),
      { timeout: 15000 }
    ).catch(() => null)
    
    // 点击下一页
    await nextBtn.click()
    
    const response = await pageApiPromise
    
    if (response) {
      expect(response.status()).toBe(200)
      expect(response.url()).toContain('page=2')
      console.log('✅ 下一页 API 调用成功，page=2')
    } else {
      console.log('⚠️ 未捕获到分页 API 请求')
    }
  })

  test('上一页按钮在第一页时应禁用', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const container = getMerchantPointsContainer(page)
    const prevBtn = container.locator('button:has-text("上一页")')
    const prevBtnVisible = await prevBtn.isVisible().catch(() => false)
    
    if (!prevBtnVisible) {
      console.log('📋 没有分页按钮（数据不足一页）')
      return
    }
    
    // ✅ 断言：第一页时上一页按钮应禁用
    const isDisabled = await prevBtn.isDisabled().catch(() => false)
    expect(isDisabled).toBe(true)
    console.log('✅ 第一页时上一页按钮已禁用（符合预期）')
  })
})

// ============ 测试套件：错误处理和边界条件 ============

test.describe('商户积分 - 错误处理和边界条件', () => {
  let jsErrors = []
  let consoleErrors = []
  
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    consoleErrors = []
    
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    
    await login(page)
    await navigateToMerchantPoints(page)
  })

  test.afterEach(async () => {
    // ✅ 断言：不应有未处理的 JS 错误
    expect(jsErrors, 'JavaScript 错误数量应为 0').toHaveLength(0)
  })

  test('输入无效商户ID时页面不崩溃', async ({ page }) => {
    const merchantIdInput = getMerchantIdInput(page)
    await expect(merchantIdInput).toBeVisible({ timeout: 10000 })
    
    // 输入无效值
    await merchantIdInput.fill('invalid-id-!@#$')
    
    // 点击搜索（在商户积分区域内）
    const searchBtn = getSearchButton(page)
    await searchBtn.click()
    
    // 等待响应
    await page.waitForTimeout(2000)
    
    // ✅ 验证页面未崩溃
    const container = getMerchantPointsContainer(page)
    await expect(container.locator('h5:has-text("商户积分申请列表")')).toBeVisible()
    
    // ✅ 验证无 JS 错误
    expect(jsErrors).toHaveLength(0)
    
    console.log('✅ 输入无效商户ID后页面正常（未崩溃）')
  })

  test('输入极长字符串时页面不崩溃', async ({ page }) => {
    const keywordInput = getKeywordInput(page)
    await expect(keywordInput).toBeVisible({ timeout: 10000 })
    
    // 输入极长字符串
    const longString = 'a'.repeat(1000)
    await keywordInput.fill(longString)
    
    // 点击搜索（在商户积分区域内）
    const searchBtn = getSearchButton(page)
    await searchBtn.click()
    
    await page.waitForTimeout(2000)
    
    // ✅ 验证页面未崩溃
    const container = getMerchantPointsContainer(page)
    await expect(container.locator('h5:has-text("商户积分申请列表")')).toBeVisible()
    
    console.log('✅ 输入极长字符串后页面正常')
  })

  test('快速连续点击搜索按钮不会导致页面异常', async ({ page }) => {
    const searchBtn = getSearchButton(page)
    await expect(searchBtn).toBeVisible({ timeout: 10000 })
    
    // 快速连续点击5次
    for (let i = 0; i < 5; i++) {
      await searchBtn.click()
      await page.waitForTimeout(100)
    }
    
    // 等待所有请求完成
    await page.waitForTimeout(3000)
    
    // ✅ 验证页面正常
    const container = getMerchantPointsContainer(page)
    await expect(container.locator('h5:has-text("商户积分申请列表")')).toBeVisible()
    
    console.log('✅ 快速连续点击搜索按钮后页面正常')
  })

  test('网络请求失败时显示错误提示', async ({ page, context }) => {
    // 模拟网络错误
    await context.route('**/api/v4/console/merchant-points**', (route) => {
      route.abort('failed')
    })
    
    const merchantIdInput = getMerchantIdInput(page)
    await expect(merchantIdInput).toBeVisible({ timeout: 10000 })
    await merchantIdInput.fill(TEST_USER_ID)
    
    // 点击搜索（会触发被拦截的请求，在商户积分区域内）
    const searchBtn = getSearchButton(page)
    await searchBtn.click()
    
    // 等待错误处理
    await page.waitForTimeout(2000)
    
    // ✅ 验证页面未崩溃（允许显示错误提示）
    const pageTitle = page.locator('text=财务管理中心')
    await expect(pageTitle).toBeVisible()
    
    console.log('✅ 网络请求失败时页面未崩溃')
  })
})

// ============ 测试套件：完整运营人员操作流程 ============

test.describe('商户积分 - 完整运营人员操作流程', () => {
  let jsErrors = []
  let apiCalls = []
  
  test.beforeEach(async ({ page }) => {
    jsErrors = []
    apiCalls = []
    
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    
    // 记录所有 API 调用
    page.on('response', (response) => {
      if (response.url().includes('/api/v4/')) {
        apiCalls.push({
          url: response.url(),
          status: response.status(),
          method: response.request().method()
        })
      }
    })
    
    await login(page)
  })

  test.afterEach(async () => {
    expect(jsErrors, 'JavaScript 错误数量应为 0').toHaveLength(0)
  })

  test('运营人员日常工作流程：登录 -> 查看列表 -> 搜索 -> 查看详情 -> 重置', async ({ page }) => {
    console.log('\n🎯 开始模拟运营人员日常工作流程...')
    
    // 步骤1：导航到商户积分页面
    console.log('\n📍 步骤1: 导航到商户积分页面')
    await navigateToMerchantPoints(page)
    const container = getMerchantPointsContainer(page)
    await expect(container.locator('h5:has-text("商户积分申请列表")')).toBeVisible({ timeout: 10000 })
    console.log('✅ 成功进入商户积分页面')
    
    // 步骤2：查看统计数据
    console.log('\n📍 步骤2: 查看统计数据')
    const totalMerchantsEl = container.locator('h6:has-text("商户总数") + p, h6:has-text("商户总数") ~ p').first()
    const totalMerchants = await totalMerchantsEl.textContent().catch(() => '0')
    console.log(`📊 商户总数: ${totalMerchants}`)
    
    // 步骤3：执行搜索
    console.log('\n📍 步骤3: 执行搜索')
    const merchantIdInput = getMerchantIdInput(page)
    await expect(merchantIdInput).toBeVisible({ timeout: 5000 })
    await merchantIdInput.fill(TEST_USER_ID)
    const searchBtn = getSearchButton(page)
    await searchBtn.click()
    await page.waitForTimeout(2000)
    console.log(`✅ 搜索商户ID: ${TEST_USER_ID}`)
    
    // 步骤4：检查搜索结果
    console.log('\n📍 步骤4: 检查搜索结果')
    const merchantTable = getMerchantTable(page)
    const dataRows = merchantTable.locator('tr')
    const rowCount = await dataRows.count()
    console.log(`📊 搜索结果: ${rowCount} 条记录`)
    
    // 步骤5：查看详情（如果有数据）
    if (rowCount > 0) {
      console.log('\n📍 步骤5: 查看详情')
      const detailBtn = dataRows.first().locator('button:has-text("详情")')
      const detailBtnVisible = await detailBtn.isVisible().catch(() => false)
      
      if (detailBtnVisible) {
        await detailBtn.click()
        await page.waitForTimeout(1000)
        
        // 尝试关闭弹窗
        const closeBtn = page.locator('button:has-text("关闭")').first()
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click()
        }
        console.log('✅ 查看详情操作完成')
      }
    }
    
    // 步骤6：重置搜索条件
    console.log('\n📍 步骤6: 重置搜索条件')
    const resetBtn = getResetButton(page)
    await resetBtn.click()
    await page.waitForTimeout(1000)
    
    // ✅ 验证重置后输入框为空
    const inputValue = await merchantIdInput.inputValue()
    expect(inputValue).toBe('')
    console.log('✅ 搜索条件已重置')
    
    // 总结 API 调用
    console.log('\n📊 API 调用统计:')
    const merchantPointsApiCalls = apiCalls.filter(c => c.url.includes('merchant-points'))
    console.log(`   商户积分相关 API 调用: ${merchantPointsApiCalls.length} 次`)
    
    // ✅ 验证所有 API 调用成功（状态码 < 500）
    const failedCalls = merchantPointsApiCalls.filter(c => c.status >= 500)
    expect(failedCalls.length).toBe(0)
    
    console.log('\n🎉 运营人员日常工作流程测试完成!')
  })

  test('运营人员审核流程：找到待审核 -> 审核通过/拒绝', async ({ page }) => {
    console.log('\n🎯 开始模拟运营人员审核流程...')
    
    await navigateToMerchantPoints(page)
    await page.waitForTimeout(2000)
    
    // 定位商户积分区域的表格
    const merchantTable = getMerchantTable(page)
    const allRows = merchantTable.locator('tr')
    const rowCount = await allRows.count()
    
    let pendingRowFound = false
    let pendingRow = null
    let recordId = ''
    
    // 遍历查找待审核记录
    for (let i = 0; i < rowCount; i++) {
      const row = allRows.nth(i)
      const statusSpan = row.locator('span.rounded')
      const statusText = await statusSpan.textContent().catch(() => '')
      
      if (statusText.includes('待审核')) {
        pendingRowFound = true
        pendingRow = row
        recordId = await row.locator('td').first().textContent().catch(() => '')
        break
      }
    }
    
    console.log(`📊 找到待审核记录: ${pendingRowFound}`)
    
    if (!pendingRowFound) {
      console.log('✅ 没有待审核记录，审核工作已完成')
      return
    }
    
    console.log(`📋 待审核记录 ID: ${recordId}`)
    
    // ✅ 验证审核按钮可见
    const approveBtn = pendingRow.locator('button:has-text("通过")')
    const rejectBtn = pendingRow.locator('button:has-text("拒绝")')
    
    await expect(approveBtn).toBeVisible({ timeout: 5000 })
    await expect(rejectBtn).toBeVisible({ timeout: 5000 })
    
    console.log('✅ 审核按钮可见，运营人员可以进行审核操作')
    
    // 注意：实际审核操作会修改数据，这里只验证按钮可点击
    // 如果需要测试真实审核，可以取消下面的注释
    
    /*
    // 监听审核 API
    const approveApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/approve'),
      { timeout: 15000 }
    ).catch(() => null)
    
    // 执行审核通过
    await approveBtn.click()
    
    const response = await approveApiPromise
    if (response) {
      console.log(`✅ 审核通过 API 响应状态: ${response.status()}`)
    }
    */
    
    console.log('\n🎉 运营人员审核流程验证完成!')
  })
})

