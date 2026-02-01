// tests/e2e/smoke.spec.js - 冒烟测试（核心流程验证）
import { test, expect } from '@playwright/test'

test.describe('核心流程冒烟测试', () => {
  test('登录页面能正常加载', async ({ page }) => {
    await page.goto('login.html')
    await page.waitForLoadState('networkidle')

    // 验证页面关键元素
    await expect(page.locator('input[type="tel"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('登录页面无致命 JavaScript 错误', async ({ page }) => {
    const errors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('login.html')
    await page.waitForLoadState('networkidle')

    // 过滤掉非关键错误
    const criticalErrors = errors.filter(
      (e) => e.includes('TypeError') || e.includes('ReferenceError') || e.includes('SyntaxError')
    )

    expect(criticalErrors).toHaveLength(0)
  })

  test('登录页面 HTTP 状态正常', async ({ page }) => {
    const response = await page.goto('login.html')
    expect(response?.status()).toBeLessThan(400)
  })

  test('完整登录流程可以成功', async ({ page }) => {
    // 1. 访问登录页
    await page.goto('login.html')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    // 2. 输入账号信息
    await page.locator('input[type="tel"]').fill('13612227930')
    await page.locator('input[x-model="code"]').fill('123456')

    // 3. 点击登录
    await page.locator('button[type="submit"]').click()

    // 4. 验证跳转到工作台
    await expect(page).toHaveURL(/workspace/, { timeout: 15000 })

    // 5. 验证工作台加载成功
    await expect(page.locator('.admin-sidebar')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.logo-text')).toContainText('抽奖管理后台')
  })
})
