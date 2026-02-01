// playwright.config.js
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // 测试文件目录
  testDir: './tests/e2e',

  // 测试超时时间（线上环境可能较慢，增加超时）
  timeout: 60000,

  // 期望超时
  expect: {
    timeout: 10000,
  },

  // 失败时重试次数
  retries: process.env.CI ? 2 : 1,

  // 并行运行
  workers: process.env.CI ? 1 : 2,

  // 测试报告输出目录
  outputDir: './test-results',

  // 报告器
  reporter: [['html', { open: 'never' }], ['list']],

  // 全局配置
  use: {
    // 🔴 线上环境 URL
    baseURL: 'https://omqktqrtntnn.sealosbja.site/admin/',

    // 失败时截图
    screenshot: 'only-on-failure',

    // 失败时录制视频
    video: 'retain-on-failure',

    // 追踪（调试用）
    trace: 'retain-on-failure',

    // 忽略 HTTPS 错误
    ignoreHTTPSErrors: true,
  },

  // 浏览器配置
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 线上环境不需要启动本地服务器
  // webServer 配置已移除
})
