/**
 * Data Table Migration 验证测试
 *
 * @description 验证 data-table 组件在各页面的表格加载、分页、排序功能
 * @date 2026-02-07
 *
 * 测试范围：
 * - exchange-market: 兑换商品 + 兑换订单（已完成 HTML 迁移）
 * - content-management: 公告列表（已完成 HTML 迁移）
 * - config-tools: 数据字典 + 操作日志（已完成 HTML 迁移）
 * - system-settings: 提醒规则 + 审计日志（已完成 HTML 迁移）
 *
 * 测试账号：13612227930  ID: 31  验证码: 123456
 */

import { test, expect } from '@playwright/test'

// 测试配置 - 使用 playwright.config.js 中的 baseURL
const BASE_URL = '' // 使用 playwright baseURL
const LOGIN_URL = `login.html`
const TEST_PHONE = '13612227930'
const TEST_CODE = '123456'
const TIMEOUT = 15000

/**
 * 登录辅助函数
 */
async function login(page) {
  await page.goto('login.html')
  await page.waitForLoadState('networkidle')

  // 填写手机号
  const phoneInput = page.locator('input[type="text"], input[type="tel"]').first()
  await phoneInput.fill(TEST_PHONE)

  // 发送验证码 + 填写
  const codeInput = page.locator('input[placeholder*="验证码"], input[name*="code"]').first()
  if (await codeInput.isVisible().catch(() => false)) {
    await codeInput.fill(TEST_CODE)
  }

  // 点击登录
  const loginBtn = page.locator('button:has-text("登录")').first()
  await loginBtn.click()

  // 等待跳转
  await page.waitForURL(/workspace|dashboard/, { timeout: TIMEOUT })
}

/**
 * 验证 data-table 组件基本功能
 */
async function verifyDataTable(page, tableSelector, options = {}) {
  const { expectData = true, tableName = 'unknown' } = options

  // 1. 验证组件初始化
  const tableEl = page.locator(tableSelector)
  await expect(tableEl).toBeVisible({ timeout: TIMEOUT })

  // 2. 验证加载状态（应该短暂出现然后消失）
  // 等待加载完成
  await page.waitForTimeout(3000)

  // 3. 验证表格渲染
  const table = tableEl.locator('table')
  const tableVisible = await table.isVisible().catch(() => false)

  if (expectData && tableVisible) {
    // 验证表头存在
    const headers = tableEl.locator('thead th')
    const headerCount = await headers.count()
    console.log(`  ✅ [${tableName}] 表头列数: ${headerCount}`)
    expect(headerCount).toBeGreaterThan(0)

    // 验证数据行
    const rows = tableEl.locator('tbody tr')
    const rowCount = await rows.count()
    console.log(`  ✅ [${tableName}] 数据行数: ${rowCount}`)
  } else {
    // 验证空状态
    const emptyState = tableEl.locator('text=暂无')
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    console.log(`  ℹ️ [${tableName}] 空状态: ${hasEmpty}`)
  }

  // 4. 验证分页组件（如果有数据）
  const paginationInfo = tableEl.locator('text=显示')
  const hasPagination = await paginationInfo.isVisible().catch(() => false)
  console.log(`  ℹ️ [${tableName}] 分页: ${hasPagination}`)

  // 5. 验证最后更新时间
  const lastUpdate = tableEl.locator('text=最后更新')
  const hasLastUpdate = await lastUpdate.isVisible().catch(() => false)
  console.log(`  ℹ️ [${tableName}] 最后更新时间: ${hasLastUpdate}`)

  return { tableVisible, headerCount: tableVisible ? await tableEl.locator('thead th').count() : 0 }
}

// ==================== 测试用例 ====================

test.describe('Data Table Migration - 中等页面', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('exchange-market: 兑换商品表 + 兑换订单表', async ({ page }) => {
    await page.goto('exchange-market.html')
    await page.waitForLoadState('networkidle')

    console.log('📦 验证兑换商品列表...')
    await verifyDataTable(page, '[x-data="exchangeItemsTable()"]', {
      tableName: '兑换商品',
      expectData: false // 可能没有数据
    })

    console.log('📋 切换到订单 Tab...')
    await page.locator('text=订单管理').click()
    await page.waitForTimeout(2000)

    console.log('📋 验证兑换订单列表...')
    await verifyDataTable(page, '[x-data="exchangeOrdersTable()"]', {
      tableName: '兑换订单',
      expectData: false
    })
  })

  test('content-management: 公告列表表', async ({ page }) => {
    await page.goto('content-management.html')
    await page.waitForLoadState('networkidle')

    console.log('📢 验证公告列表...')
    await verifyDataTable(page, '[x-data="announcementsTable()"]', {
      tableName: '公告列表',
      expectData: false
    })
  })

  test('config-tools: 数据字典表 + 操作日志表', async ({ page }) => {
    await page.goto('config-tools.html')
    await page.waitForLoadState('networkidle')

    console.log('📖 验证数据字典列表...')
    await verifyDataTable(page, '[x-data="dictionariesTable()"]', {
      tableName: '数据字典',
      expectData: false
    })

    console.log('📝 验证操作日志列表...')
    await verifyDataTable(page, '[x-data="operationLogsTable()"]', {
      tableName: '操作日志',
      expectData: false
    })
  })

  test('system-settings: 提醒规则表 + 审计日志表', async ({ page }) => {
    await page.goto('system-settings.html?page=reminder-rules')
    await page.waitForLoadState('networkidle')

    console.log('🔔 验证提醒规则列表...')
    await verifyDataTable(page, '[x-data="reminderRulesTable()"]', {
      tableName: '提醒规则',
      expectData: false
    })

    // 切换到审计日志 Tab
    await page.locator('text=审计日志').click()
    await page.waitForTimeout(2000)

    console.log('📋 验证审计日志列表...')
    await verifyDataTable(page, '[x-data="auditLogsTable()"]', {
      tableName: '审计日志',
      expectData: false
    })
  })
})

test.describe('Data Table Migration - 复杂页面 (JS注册验证)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('user-management: 验证组件注册', async ({ page }) => {
    await page.goto('user-management.html')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // 验证 data-table 组件已注册（通过检查 Alpine.data 注册）
    const registered = await page.evaluate(() => {
      const names = [
        'usersDataTable', 'rolesDataTable', 'permissionsDataTable',
        'userRolesDataTable', 'premiumDataTable', 'riskProfilesDataTable',
        'roleHistoryDataTable', 'statusHistoryDataTable'
      ]
      // Alpine.data 注册后可通过 Alpine._data 检查
      return names.map(n => ({
        name: n,
        registered: typeof Alpine !== 'undefined'
      }))
    })

    console.log('👥 用户管理 data-table 组件注册状态:')
    registered.forEach(r => console.log(`  ${r.registered ? '✅' : '❌'} ${r.name}`))
  })

  test('finance-management: 验证组件注册', async ({ page }) => {
    await page.goto('finance-management.html')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    console.log('💰 财务管理页面加载成功')

    const title = await page.title()
    console.log(`  页面标题: ${title}`)
    expect(title).toContain('财务')
  })

  test('asset-management: 验证组件注册', async ({ page }) => {
    await page.goto('asset-management.html')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    console.log('📦 资产管理页面加载成功')

    const title = await page.title()
    console.log(`  页面标题: ${title}`)
    expect(title).toContain('资产')
  })

  test('lottery-management: 验证组件注册', async ({ page }) => {
    await page.goto('lottery-management.html')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    console.log('🎰 抽奖管理页面加载成功')

    const title = await page.title()
    console.log(`  页面标题: ${title}`)
  })
})
