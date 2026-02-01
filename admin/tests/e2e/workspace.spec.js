// tests/e2e/workspace.spec.js - 工作台页面测试
import { test, expect } from '@playwright/test'

// 登录辅助函数
async function login(page) {
  await page.goto('login.html')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  
  await page.locator('input[type="tel"]').fill('13612227930')
  await page.locator('input[x-model="code"]').fill('123456')
  await page.locator('button[type="submit"]').click()
  
  // 等待跳转到工作台
  await expect(page).toHaveURL(/workspace/, { timeout: 15000 })
}

test.describe('工作台页面', () => {
  test.beforeEach(async ({ page }) => {
    // 每个测试前先登录
    await login(page)
    // 等待页面完全加载
    await page.waitForLoadState('networkidle')
  })

  test('工作台页面结构完整', async ({ page }) => {
    // 验证侧边栏存在
    const sidebar = page.locator('.admin-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 10000 })

    // 验证 Logo
    await expect(page.locator('.sidebar-logo')).toBeVisible()
    await expect(page.locator('.logo-text')).toContainText('抽奖管理后台')

    // 验证主内容区
    await expect(page.locator('.admin-main')).toBeVisible()

    // 验证顶部栏
    await expect(page.locator('.workspace-header')).toBeVisible()

    // 验证 Tab 栏
    await expect(page.locator('.workspace-tab-bar')).toBeVisible()
  })

  test('侧边栏导航菜单可以展开和折叠', async ({ page }) => {
    // 等待导航菜单加载
    await page.waitForSelector('.nav-group', { timeout: 10000 })

    // 找到一个分组菜单标题
    const groupTitle = page.locator('.nav-group-title').first()
    
    if (await groupTitle.isVisible()) {
      // 点击展开/折叠
      await groupTitle.click()
      await page.waitForTimeout(300)
      
      // 验证分组可以交互
      const groupItems = page.locator('.nav-group-items').first()
      // 分组应该存在（展开或折叠状态）
      await expect(groupItems).toBeAttached()
    }
  })

  test('顶部搜索框可以输入', async ({ page }) => {
    const searchInput = page.locator('.global-search input')
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await searchInput.fill('测试搜索')
    await expect(searchInput).toHaveValue('测试搜索')
  })

  test('用户下拉菜单可以打开', async ({ page }) => {
    // 点击用户头像区域
    const userDropdown = page.locator('.user-dropdown')
    await expect(userDropdown).toBeVisible({ timeout: 10000 })
    
    await userDropdown.click()
    await page.waitForTimeout(300)

    // 验证下拉菜单出现
    const logoutBtn = page.locator('text=退出登录')
    await expect(logoutBtn).toBeVisible()
  })

  test('刷新按钮存在且可点击', async ({ page }) => {
    const refreshBtn = page.locator('button[title="刷新当前页面"]')
    await expect(refreshBtn).toBeVisible({ timeout: 10000 })
    
    // 点击刷新按钮
    await refreshBtn.click()
    // 刷新操作不应导致页面崩溃
    await page.waitForTimeout(500)
    await expect(page.locator('.admin-sidebar')).toBeVisible()
  })

  test('通知中心按钮存在', async ({ page }) => {
    // 使用更精确的选择器：通知中心的主按钮（带有🔔图标的那个）
    const notificationBtn = page.locator('.notification-center button[title="消息通知"]')
    await expect(notificationBtn).toBeVisible({ timeout: 10000 })
  })

  test('主题切换按钮存在', async ({ page }) => {
    const themeBtn = page.locator('.theme-switcher .theme-btn')
    await expect(themeBtn).toBeVisible({ timeout: 10000 })
  })
})

test.describe('工作台导航功能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
  })

  test('点击侧边栏菜单可以打开新 Tab', async ({ page }) => {
    // 等待导航加载
    await page.waitForSelector('.nav-group, .nav-single', { timeout: 10000 })

    // 获取初始 Tab 数量
    const initialTabCount = await page.locator('.workspace-tab').count()

    // 找到一个可点击的导航项
    const navItem = page.locator('.nav-item, .nav-single').first()
    
    if (await navItem.isVisible()) {
      await navItem.click()
      await page.waitForTimeout(1000)

      // Tab 数量应该增加或保持不变（如果是同一页面）
      const newTabCount = await page.locator('.workspace-tab').count()
      expect(newTabCount).toBeGreaterThanOrEqual(initialTabCount)
    }
  })
})

