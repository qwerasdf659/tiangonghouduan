// tests/e2e/fixtures/auth.js - 登录状态复用
import { test as base } from '@playwright/test'

/**
 * 扩展 test fixture，添加已登录状态
 *
 * 使用方法：
 * import { test, expect } from './fixtures/auth'
 *
 * test('需要登录的测试', async ({ authenticatedPage }) => {
 *   await authenticatedPage.goto('/workspace.html')
 *   // ...
 * })
 */
export const test = base.extend({
  // 已登录的页面
  authenticatedPage: async ({ page }, use) => {
    // 执行登录
    await page.goto('/login.html')

    // 填写登录表单（使用环境变量或测试账号）
    const phone = process.env.TEST_PHONE || '13612227930'
    const password = process.env.TEST_PASSWORD || 'test123456'

    await page.fill('input[name="phone"], input[type="tel"]', phone)
    await page.fill('input[name="password"], input[type="password"]', password)
    await page.click('button[type="submit"]')

    // 等待登录成功（跳转到工作台）
    try {
      await page.waitForURL('**/workspace.html', { timeout: 10000 })
    } catch {
      // 如果登录失败，记录错误但继续
      console.warn('登录可能失败，请检查测试账号配置')
    }

    // 使用已登录的页面
    await use(page)
  },
})

export { expect } from '@playwright/test'

