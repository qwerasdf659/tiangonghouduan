/**
 * 预算管理页面测试
 *
 * @description 验证预算管理页面数据加载是否正常
 * @date 2026-02-05
 *
 * 使用方法：npx playwright test tests/e2e/test-budget-page.spec.js --headed
 */

import { test, expect } from '@playwright/test'

// 测试配置
const BASE_URL = 'https://omqktqrtntnn.sealosbja.site'
const TEST_MOBILE = '13612227930'
const TEST_CODE = '123456'

test.describe('预算管理页面测试', () => {
  test.beforeEach(async ({ page }) => {
    // 登录
    await page.goto(`${BASE_URL}/admin/login.html`)
    await page.waitForLoadState('networkidle')

    // 填写登录表单
    await page.fill('input[type="tel"], input[placeholder*="手机号"]', TEST_MOBILE)
    await page.fill('input[placeholder*="验证码"]', TEST_CODE)

    // 点击登录
    await page.click('button[type="submit"], button:has-text("登录")')

    // 等待跳转到首页或 dashboard
    await page.waitForURL(/\/(workspace|dashboard|index)/, { timeout: 10000 })
    console.log('✅ 登录成功，当前URL:', page.url())
  })

  test('预算管理页面应正确加载数据', async ({ page }) => {
    // 监听控制台日志
    page.on('console', msg => {
      const text = msg.text()
      const type = msg.type()
      // 打印所有错误、警告，以及调试日志
      if (type === 'error' || type === 'warning' || text.includes('[DEBUG-BUDGET]') || text.includes('🔴') || text.includes('ERROR') || text.includes('returnObj')) {
        console.log(`[Browser Console:${type}] ${text}`)
      }
    })
    
    // 监听页面错误
    page.on('pageerror', error => {
      console.log(`[Page Error] ${error.message}`)
      console.log(`[Page Error Stack] ${error.stack}`)
    })

    // 监听网络请求
    page.on('response', async response => {
      const url = response.url()
      if (url.includes('campaign-budget/batch-status')) {
        console.log(`\n📡 [Network] ${response.status()} - ${url}`)
        try {
          const json = await response.json()
          console.log('📡 [Response]', JSON.stringify(json, null, 2))
        } catch (e) {
          console.log('📡 [Response] 非JSON响应')
        }
      }
    })

    // 跳转到抽奖管理页面的预算管理Tab
    await page.goto(`${BASE_URL}/admin/lottery-management.html?page=campaign-budget`)
    console.log('📍 跳转到预算管理页面')

    // 等待页面加载
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // 额外等待3秒让数据加载

    // 截图保存
    await page.screenshot({ path: 'tests/screenshots/budget-page-after-load.png', fullPage: true })
    console.log('📸 截图已保存: tests/screenshots/budget-page-after-load.png')

    // 检查预算汇总卡片是否显示数据
    const totalBudgetCard = page.locator('text=总预算').first()
    await expect(totalBudgetCard).toBeVisible({ timeout: 10000 })
    console.log('✅ 总预算卡片可见')

    // 检查预算列表是否有数据（不是"暂无预算数据"）
    const noDataText = page.locator('text=暂无预算数据')
    const hasNoData = await noDataText.isVisible().catch(() => false)

    if (hasNoData) {
      console.log('❌ 页面显示"暂无预算数据"')

      // 获取页面源码中的关键变量
      const budgetCampaigns = await page.evaluate(() => {
        // 尝试获取 Alpine 组件的数据
        const el = document.querySelector('[x-data*="lotteryPageContent"]')
        if (el && el._x_dataStack) {
          const data = el._x_dataStack[0]
          return {
            budgetCampaigns: data.budgetCampaigns,
            budgetSummary: data.budgetSummary,
            current_page: data.current_page
          }
        }
        return null
      })
      console.log('📊 Alpine 数据:', budgetCampaigns)
    } else {
      console.log('✅ 预算列表有数据')
    }

    // 获取 Alpine 组件的数据状态 - 搜索所有 x-data 元素
    const alpineData = await page.evaluate(() => {
      const results = []
      // 获取所有带 x-data 的元素
      const elements = document.querySelectorAll('[x-data]')
      elements.forEach((el, index) => {
        const xDataAttr = el.getAttribute('x-data') || 'unknown'
        const dataStack = el._x_dataStack
        
        // 检查所有 dataStack 项
        let stackItems = []
        if (dataStack && Array.isArray(dataStack)) {
          dataStack.forEach((item, stackIndex) => {
            const keys = Object.keys(item || {})
            stackItems.push({
              stackIndex,
              keysCount: keys.length,
              sampleKeys: keys.slice(0, 10),
              hasBudgetCampaigns: 'budgetCampaigns' in item,
              hasBudgetSummary: 'budgetSummary' in item,
              hasCurrentPage: 'current_page' in item,
              budgetCampaignsCount: item?.budgetCampaigns?.length,
              budgetSummary: item?.budgetSummary
            })
          })
        }
        
        results.push({
          index,
          xDataAttr: xDataAttr.substring(0, 50),
          stackLength: dataStack?.length || 0,
          stackItems
        })
      })
      return results
    })

    console.log('\n📊 =========== Alpine 组件数据状态 ===========')
    alpineData.forEach(item => {
      console.log(`\n--- 组件 #${item.index}: ${item.xDataAttr}...`)
      console.log('  stackLength:', item.stackLength)
      item.stackItems.forEach(stackItem => {
        console.log(`    [stack ${stackItem.stackIndex}] keys: ${stackItem.keysCount}, sample: ${stackItem.sampleKeys.join(', ')}`)
        if (stackItem.hasBudgetCampaigns) {
          console.log(`    [stack ${stackItem.stackIndex}] 📍 budgetCampaigns 数量: ${stackItem.budgetCampaignsCount}`)
          console.log(`    [stack ${stackItem.stackIndex}] 📍 budgetSummary: ${JSON.stringify(stackItem.budgetSummary)}`)
        }
        if (stackItem.hasCurrentPage) {
          console.log(`    [stack ${stackItem.stackIndex}] 📍 has current_page`)
        }
      })
    })
    console.log('\n===============================================\n')
  })
})

