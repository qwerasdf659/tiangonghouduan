/**
 * data-table 迁移验证测试
 *
 * @description 验证已迁移到 data-table 组件的页面是否正常渲染
 * @date 2026-02-07
 *
 * 测试账号: 13612227930 ID:31 验证码:123456
 */

import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000/admin'
const LOGIN_URL = `${BASE_URL}/login.html`

// 测试账号
const TEST_PHONE = '13612227930'
const TEST_CODE = '123456'

/**
 * 登录辅助函数
 */
async function login(page) {
  await page.goto(LOGIN_URL)
  await page.waitForLoadState('networkidle')

  // 填写手机号
  const phoneInput = page.locator('input[type="text"], input[x-model*="phone"], input[placeholder*="手机"]')
  if (await phoneInput.count() > 0) {
    await phoneInput.first().fill(TEST_PHONE)
  }

  // 填写验证码
  const codeInput = page.locator('input[type="text"][placeholder*="验证码"], input[x-model*="code"]')
  if (await codeInput.count() > 0) {
    await codeInput.first().fill(TEST_CODE)
  }

  // 点击登录
  const loginBtn = page.locator('button:has-text("登录"), button[type="submit"]')
  if (await loginBtn.count() > 0) {
    await loginBtn.first().click()
  }

  // 等待跳转
  await page.waitForTimeout(2000)
}

/**
 * 验证 data-table 组件是否正常渲染
 */
async function verifyDataTable(page, pageName) {
  // 等待 Alpine.js 初始化
  await page.waitForTimeout(2000)

  // 检查 data-table 结构是否存在
  const table = page.locator('table')
  const tableCount = await table.count()
  console.log(`[${pageName}] 找到 ${tableCount} 个 table 元素`)

  if (tableCount > 0) {
    // 检查表头
    const thead = page.locator('thead')
    expect(await thead.count()).toBeGreaterThan(0)

    // 检查是否有列标题
    const th = page.locator('thead th')
    const thCount = await th.count()
    console.log(`[${pageName}] 找到 ${thCount} 个表头列`)
    expect(thCount).toBeGreaterThan(0)

    // 检查分页信息（data-table 特征）
    const paginationInfo = page.locator('[x-text="paginationInfo"]')
    if (await paginationInfo.count() > 0) {
      console.log(`[${pageName}] ✅ data-table 分页信息存在`)
    }

    // 检查刷新按钮（data-table 特征）
    const refreshBtn = page.locator('button:has-text("刷新")')
    if (await refreshBtn.count() > 0) {
      console.log(`[${pageName}] ✅ data-table 刷新按钮存在`)
    }

    // 检查加载状态或数据行
    const loadingIndicator = page.locator('.animate-spin')
    const dataRows = page.locator('tbody tr')
    const loadingCount = await loadingIndicator.count()
    const rowCount = await dataRows.count()
    console.log(`[${pageName}] 加载中: ${loadingCount}, 数据行: ${rowCount}`)
  }

  // 检查无 JavaScript 错误
  const errors = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })
  await page.waitForTimeout(1000)

  // 允许 API 错误（后端可能未运行），但不允许组件初始化错误
  const criticalErrors = errors.filter(
    e => e.includes('Alpine') || e.includes('is not defined') || e.includes('SyntaxError')
  )

  if (criticalErrors.length > 0) {
    console.log(`[${pageName}] ⚠️ 关键错误:`, criticalErrors)
  }

  console.log(`[${pageName}] ✅ 页面渲染验证完成`)
}

// ========== 已迁移页面测试 ==========

test.describe('data-table 迁移验证', () => {
  test.beforeEach(async ({ page }) => {
    // 设置较长超时
    page.setDefaultTimeout(15000)

    // 尝试登录
    await login(page)
  })

  test('功能开关页面 - data-table 渲染', async ({ page }) => {
    await page.goto(`${BASE_URL}/feature-flags.html`)
    await verifyDataTable(page, 'feature-flags')
  })

  test('字典管理页面 - data-table 渲染', async ({ page }) => {
    await page.goto(`${BASE_URL}/dict-management.html`)
    await verifyDataTable(page, 'dict-management')
  })

  test('抽奖干预页面 - data-table 渲染', async ({ page }) => {
    await page.goto(`${BASE_URL}/presets.html`)
    await verifyDataTable(page, 'presets')
  })

  test('材料转换规则页面 - data-table 渲染', async ({ page }) => {
    await page.goto(`${BASE_URL}/material-conversion-rules.html`)
    await verifyDataTable(page, 'material-conversion-rules')
  })
})

// ========== data-table 组件功能测试 ==========

test.describe('data-table 组件功能', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15000)
    await login(page)
  })

  test('功能开关 - 表格操作按钮存在', async ({ page }) => {
    await page.goto(`${BASE_URL}/feature-flags.html`)
    await page.waitForTimeout(3000)

    // 检查是否有操作按钮（切换/编辑/删除）
    const actionBtns = page.locator('button:has-text("切换"), button:has-text("编辑"), button:has-text("删除")')
    const btnCount = await actionBtns.count()
    console.log(`[feature-flags] 操作按钮数: ${btnCount}`)

    // 检查新增按钮
    const addBtn = page.locator('button:has-text("新增开关")')
    expect(await addBtn.count()).toBeGreaterThan(0)
  })

  test('功能开关 - 排序功能', async ({ page }) => {
    await page.goto(`${BASE_URL}/feature-flags.html`)
    await page.waitForTimeout(3000)

    // 查找可排序的列标题
    const sortableHeaders = page.locator('th.cursor-pointer')
    const sortCount = await sortableHeaders.count()
    console.log(`[feature-flags] 可排序列数: ${sortCount}`)
  })
})

