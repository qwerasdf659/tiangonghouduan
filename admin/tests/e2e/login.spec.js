// tests/e2e/login.spec.js - 登录功能测试
import { test, expect } from '@playwright/test'

test.describe('登录功能', () => {
  test.beforeEach(async ({ page }) => {
    // 访问登录页面
    await page.goto('login.html')
    // 等待页面加载完成
    await page.waitForLoadState('networkidle')
  })

  test('登录页面包含必要的表单元素', async ({ page }) => {
    // 验证手机号输入框（type="tel"）
    const phoneInput = page.locator('input[type="tel"]')
    await expect(phoneInput).toBeVisible({ timeout: 10000 })

    // 验证验证码输入框
    const codeInput = page.locator('input[x-model="code"]')
    await expect(codeInput).toBeVisible()

    // 验证提交按钮
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeVisible()

    // 验证页面标题
    await expect(page.locator('h3')).toContainText('管理后台')
  })

  test('输入框可以正常输入', async ({ page }) => {
    const phoneInput = page.locator('input[type="tel"]')
    const codeInput = page.locator('input[x-model="code"]')

    // 等待 Alpine.js 初始化
    await page.waitForTimeout(500)

    // 测试输入
    await phoneInput.fill('13612227930')
    await codeInput.fill('123456')

    // 验证输入值
    await expect(phoneInput).toHaveValue('13612227930')
    await expect(codeInput).toHaveValue('123456')
  })

  test('使用测试账号登录成功跳转到工作台', async ({ page }) => {
    const phoneInput = page.locator('input[type="tel"]')
    const codeInput = page.locator('input[x-model="code"]')
    const submitButton = page.locator('button[type="submit"]')

    // 等待 Alpine.js 初始化
    await page.waitForTimeout(500)

    // 输入测试账号
    await phoneInput.fill('13612227930')
    await codeInput.fill('123456')

    // 点击登录
    await submitButton.click()

    // 等待跳转到工作台（最多等待 10 秒）
    await expect(page).toHaveURL(/workspace/, { timeout: 10000 })
  })
})
