# E2E 自动化测试指南

> **📌 项目决定**：本项目的 E2E 测试工具（Playwright）**仅用于 Web 端管理后台前端项目**（`admin/` 目录）。
> 
> | 项目 | 说明 |
> |-----|------|
> | **测试范围** | admin 后台的所有页面（30+ 个 HTML 页面） |
> | **测试工具** | Playwright |
> | **技术栈** | Vite 6 + Alpine.js 3 + Tailwind CSS 3 + ECharts 6 |
> | **页面结构** | 多页应用 (MPA) |
> | **不涉及** | 小程序、App、C端用户页面 |

---

## 📖 什么是 E2E 测试？

**E2E (End-to-End) 端到端测试** 是一种自动化测试方法，通过代码模拟真实用户在浏览器中的操作行为，验证整个应用从前端到后端的完整流程是否正常工作。

### 核心概念

```
传统手动测试流程：
人工打开浏览器 → 输入网址 → 登录 → 点击菜单 → 查看数据 → 验证结果

E2E 自动化测试：
编写测试脚本 → 脚本控制浏览器 → 自动执行所有操作 → 自动验证结果 → 生成报告
```

### 与其他测试类型对比

| 测试类型 | 测试范围 | 速度 | 能发现的问题 |
|---------|---------|------|-------------|
| 单元测试 | 单个函数/模块 | 毫秒级 | 逻辑错误 |
| API测试 | 后端接口 | 秒级 | 接口错误、数据格式 |
| **E2E测试** | **整个应用** | 秒-分钟级 | **UI渲染、数据绑定、用户流程** |

---

## 🎯 为什么需要 E2E 测试？

### 真实案例：字段名不匹配问题

在本项目中发现的实际问题：

```javascript
// 后端 API 返回的数据
{
  lottery_campaign_id: 1,    // 后端使用 lottery_campaign_id
  campaign_name: '双十一活动',
  status: 'active'
}

// 前端代码期望的字段
<template x-for="campaign in campaigns" :key="campaign.campaign_id">
  <!--                                              ^^^^^^^^^^^^ 前端使用 campaign_id -->
</template>
```

**结果**：页面加载时报错 `Cannot read properties of undefined`

**为什么其他测试发现不了？**

| 测试方法 | 结果 | 原因 |
|---------|------|------|
| API 测试 | ✅ 通过 | API 返回 200，数据格式正确 |
| 语法检查 | ✅ 通过 | `campaign.campaign_id` 语法正确 |
| ESLint | ✅ 通过 | 无法知道后端返回什么字段 |
| **E2E 测试** | ❌ 失败 | 真实运行时发现 undefined 错误 |

---

## 🛠️ 技术选型：Playwright

本项目推荐使用 **Playwright**，理由：

| 特性 | Playwright | Cypress | Puppeteer |
|------|-----------|---------|-----------|
| 多浏览器支持 | ✅ Chrome/Firefox/Safari | ⚠️ 主要Chrome | ❌ 仅Chrome |
| 并行测试 | ✅ 原生支持 | ⚠️ 付费功能 | ❌ 需手动实现 |
| 自动等待 | ✅ 智能等待 | ✅ 智能等待 | ❌ 需手动等待 |
| 截图/视频 | ✅ 内置 | ✅ 内置 | ⚠️ 需配置 |
| 开发团队 | Microsoft | Cypress.io | Google |
| 社区活跃度 | 🔥 非常活跃 | 🔥 非常活跃 | 📉 一般 |

---

## 📱 测试范围（项目决定）

### ✅ 本项目 E2E 测试范围

```
📌 项目决定：Playwright 仅用于 admin 后台

测试范围：
├── admin/                        ← ✅ 在此范围内
│   ├── login.html               ← ✅ 登录页面
│   ├── workspace.html           ← ✅ 工作台
│   ├── lottery-management.html  ← ✅ 抽奖管理
│   ├── lottery-alerts.html      ← ✅ 抽奖告警
│   └── 其他后台页面...           ← ✅ 所有 admin 页面
│
└── 后端 API                      ← ✅ 可附带测试接口
```

### ❌ 不在测试范围内

| 端 | 是否测试 | 原因 |
|----|---------|------|
| 微信小程序 | ❌ 不测 | 不在本项目范围 |
| App（Android/iOS） | ❌ 不测 | 不在本项目范围 |
| C端用户页面 | ❌ 不测 | 不在本项目范围 |

### Playwright 能力确认

| 问题 | 答案 |
|-----|------|
| 能测 admin 后台吗？ | ✅ 完全适用 |
| 能测 API 接口吗？ | ✅ 可以，内置 request 功能 |
| 能模拟手机浏览器吗？ | ✅ 可以（测试响应式页面） |

---

## 🔄 使用流程概览

### 一、整体流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    E2E 测试完整流程                              │
└─────────────────────────────────────────────────────────────────┘

【一次性准备】（只做一次）
    │
    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  1. 安装    │ →  │  2. 配置    │ →  │  3. 写测试  │
│  Playwright │    │  配置文件   │    │  用例文件   │
└─────────────┘    └─────────────┘    └─────────────┘
    5分钟              10分钟            1-2天
    
    
【日常使用】（每次开发）
    │
    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  4. 运行    │ →  │  5. 查看    │ →  │  6. 修复    │
│  测试命令   │    │  测试结果   │    │  失败用例   │
└─────────────┘    └─────────────┘    └─────────────┘
    30秒              1-5分钟           视情况
        │
        ▼
    ┌─────────────┐
    │  7. 提交代码 │
    │  CI自动测试  │
    └─────────────┘
```

### 二、详细步骤说明

| 步骤 | 做什么 | 耗时 | 频率 |
|-----|-------|------|-----|
| 1. 安装 | 在 admin 目录下安装 Playwright 和浏览器 | 5分钟 | 只做一次 |
| 2. 配置 | 创建配置文件，设置测试目录、超时时间等 | 10分钟 | 只做一次 |
| 3. 写测试 | 按优先级编写测试用例 | 1-2天 | 逐步积累 |
| 4. 运行 | 执行测试命令 | 30秒 | 每次改代码后 |
| 5. 查看 | 看结果，通过则继续，失败则分析 | 1-5分钟 | 每次运行后 |
| 6. 修复 | 根据错误信息修复代码或测试 | 视情况 | 失败时 |
| 7. 提交 | 推送代码，CI 自动运行测试 | 自动 | 每次提交 |

### 三、日常开发中的使用时机

| 时机 | 做什么 | 频率 |
|-----|-------|------|
| **开发新功能后** | 运行相关测试，确保没破坏旧功能 | 每次 |
| **修复 Bug 后** | 补充对应测试用例，防止复发 | 每次 |
| **提交 PR 前** | 运行全量测试 | 每次 |
| **发布上线前** | 运行全量测试 + 重点检查 | 每次 |
| **发现线上问题时** | 用测试复现问题，然后修复 | 偶尔 |

### 四、一句话总结

```
安装 → 配置 → 写测试 → 运行 → 看结果 → 修复 → 提交
  ↑                                          │
  └──────────── 日常循环 ←───────────────────┘
```

**核心就是：写好测试用例，每次改代码后跑一下，失败了就修。**

---

## 🖥️ 浏览器模式说明

### 需要打开浏览器吗？

**默认不需要**，Playwright 默认是 **Headless 模式**（无头模式），浏览器在后台运行，你看不到界面。

| 模式 | 命令 | 是否显示浏览器 | 适用场景 |
|-----|------|--------------|---------|
| **无头模式（默认）** | `npm run test:e2e` | ❌ 不显示 | 日常测试、CI/CD |
| **有头模式** | `npx playwright test --headed` | ✅ 显示 | 调试时看操作过程 |
| **UI 模式** | `npm run test:e2e:ui` | ✅ 显示 | 可视化调试界面 |

---

## 🤖 与 Cursor AI 协作调试

### 把测试截图发给 Cursor 分析

测试失败时，Playwright 会自动生成截图，你可以直接发给 Cursor AI 帮你分析问题。

### 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 在 Cursor 终端运行测试                                   │
│     npm run test:e2e                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  测试失败 ❌                   │
              │  自动生成截图和报告            │
              └───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 失败的截图在这里：                                       │
│     admin/test-results/xxx/screenshot.png                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 把截图拖到 Cursor 聊天框，问 AI：                        │
│     "这个测试失败了，截图显示xxx，帮我分析原因"              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Cursor AI 分析截图 + 错误信息，给出修复建议              │
└─────────────────────────────────────────────────────────────┘
```

### 失败截图在哪里找？

```
测试失败后，文件会自动生成在：

admin/
├── test-results/                         ← 📁 测试结果目录
│   └── [测试名称]/
│       ├── screenshot.png                ← 🖼️ 失败截图（发给Cursor）
│       ├── video.webm                    ← 🎬 录像
│       └── trace.zip                     ← 📦 详细追踪
│
└── playwright-report/                    ← 📁 HTML报告目录
    └── index.html                        ← 📄 可视化报告
```

### 推荐的 Cursor 调试方式

| 方式 | 操作 | 效果 |
|-----|------|-----|
| **方式一：发送截图** | 找到 `test-results/xxx/screenshot.png`，拖到聊天框 | ⭐⭐⭐ |
| **方式二：发送错误** | 复制终端错误输出，粘贴到聊天框 | ⭐⭐⭐ |
| **方式三：综合发送** | 截图 + 错误 + @代码文件 一起发 | ⭐⭐⭐⭐⭐ 效果最好 |

### 示例对话

```
你：[拖入 screenshot.png]
    这个测试失败了，错误信息是：
    TypeError: Cannot read properties of undefined (reading 'campaign_id')
    相关代码在 @lottery-management.html
    帮我分析原因

Cursor AI：根据截图和错误信息，问题是...（给出分析和修复建议）
```

---

## 📦 安装配置

### 1. 安装 Playwright

```bash
cd /home/devbox/project/admin

# 安装 Playwright 测试框架
npm install -D @playwright/test

# 安装浏览器（首次安装需要）
npx playwright install
```

### 2. 创建配置文件

创建 `playwright.config.js`：

```javascript
// playwright.config.js
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // 测试文件目录
  testDir: './tests/e2e',
  
  // 测试超时时间
  timeout: 30000,
  
  // 期望超时
  expect: {
    timeout: 5000
  },
  
  // 失败时重试次数
  retries: process.env.CI ? 2 : 0,
  
  // 并行运行
  workers: process.env.CI ? 1 : undefined,
  
  // 报告器
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  
  // 全局配置
  use: {
    // 基础 URL
    baseURL: 'http://localhost:5173',
    
    // 失败时截图
    screenshot: 'only-on-failure',
    
    // 失败时录制视频
    video: 'retain-on-failure',
    
    // 追踪（调试用）
    trace: 'retain-on-failure',
  },

  // 浏览器配置
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // 可选：测试多浏览器
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
  ],

  // 启动开发服务器
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
```

### 3. 更新 package.json

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report"
  }
}
```

---

## 📝 编写测试用例

### 目录结构

```
admin/
├── tests/
│   └── e2e/
│       ├── fixtures/
│       │   └── auth.js          # 登录状态复用
│       ├── login.spec.js        # 登录测试
│       ├── lottery-alerts.spec.js
│       ├── lottery-management.spec.js
│       └── dashboard.spec.js
├── playwright.config.js
└── package.json
```

### 示例 1：登录测试

```javascript
// tests/e2e/login.spec.js
import { test, expect } from '@playwright/test'

test.describe('登录功能', () => {
  
  test('正确的账号密码可以登录成功', async ({ page }) => {
    // 1. 访问登录页
    await page.goto('/login.html')
    
    // 2. 验证页面标题
    await expect(page).toHaveTitle(/登录/)
    
    // 3. 填写登录表单
    await page.fill('input[name="phone"]', '13612227930')
    await page.fill('input[name="password"]', 'your_password')
    
    // 4. 点击登录按钮
    await page.click('button[type="submit"]')
    
    // 5. 等待跳转到工作台
    await page.waitForURL('**/workspace.html')
    
    // 6. 验证登录成功
    await expect(page.locator('.user-info')).toBeVisible()
  })

  test('错误的密码显示错误提示', async ({ page }) => {
    await page.goto('/login.html')
    
    await page.fill('input[name="phone"]', '13612227930')
    await page.fill('input[name="password"]', 'wrong_password')
    await page.click('button[type="submit"]')
    
    // 验证错误提示
    await expect(page.locator('.error-message')).toContainText('密码错误')
  })
})
```

### 示例 2：抽奖告警页面测试

```javascript
// tests/e2e/lottery-alerts.spec.js
import { test, expect } from '@playwright/test'

// 登录状态复用（避免每个测试都重新登录）
test.use({
  storageState: 'tests/e2e/.auth/user.json'
})

test.describe('抽奖告警页面', () => {
  
  test.beforeEach(async ({ page }) => {
    // 每个测试前先登录
    await page.goto('/login.html')
    await page.fill('input[name="phone"]', '13612227930')
    await page.fill('input[name="password"]', 'your_password')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/workspace.html')
  })

  test('页面能正常加载，无 JavaScript 错误', async ({ page }) => {
    // 监听控制台错误
    const errors = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    // 访问抽奖告警页面
    await page.goto('/lottery-alerts.html')
    
    // 等待页面加载完成
    await page.waitForLoadState('networkidle')
    
    // 验证没有 JavaScript 错误
    expect(errors.filter(e => e.includes('TypeError'))).toHaveLength(0)
  })

  test('活动下拉框应该有选项', async ({ page }) => {
    await page.goto('/lottery-alerts.html')
    
    // 等待活动数据加载
    await page.waitForSelector('select[x-model="filter.lottery_campaign_id"]')
    
    // 获取下拉框选项数量
    const optionCount = await page.locator('select[x-model="filter.lottery_campaign_id"] option').count()
    
    // 验证有选项（至少有默认的"全部"选项）
    expect(optionCount).toBeGreaterThan(0)
  })

  test('活动选项应该使用 lottery_campaign_id 作为值', async ({ page }) => {
    await page.goto('/lottery-alerts.html')
    
    // 等待数据加载
    await page.waitForTimeout(2000)
    
    // 获取第一个非空选项的值
    const firstOptionValue = await page.locator(
      'select[x-model="filter.lottery_campaign_id"] option:not([value=""])'
    ).first().getAttribute('value')
    
    // 验证值是数字（lottery_campaign_id 是数字类型）
    expect(Number(firstOptionValue)).not.toBeNaN()
  })

  test('ECharts 图表应该正常渲染', async ({ page }) => {
    await page.goto('/lottery-alerts.html')
    
    // 等待图表容器出现
    await page.waitForSelector('[x-ref="alertTrendChart"]')
    
    // 等待 ECharts 渲染（检查 canvas 元素）
    await page.waitForSelector('[x-ref="alertTrendChart"] canvas', {
      timeout: 10000
    })
    
    // 验证图表已渲染
    const canvas = page.locator('[x-ref="alertTrendChart"] canvas')
    await expect(canvas).toBeVisible()
  })
})
```

### 示例 3：数据字段一致性测试

```javascript
// tests/e2e/data-consistency.spec.js
import { test, expect } from '@playwright/test'

test.describe('前后端数据字段一致性', () => {

  test('lottery-campaigns API 返回正确的字段名', async ({ request }) => {
    // 先登录获取 token
    const loginResponse = await request.post('/api/v4/console/auth/login', {
      data: {
        phone: '13612227930',
        password: 'your_password'
      }
    })
    const { data: { token } } = await loginResponse.json()
    
    // 请求活动列表
    const response = await request.get('/api/v4/console/lottery-campaigns', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    
    expect(response.ok()).toBeTruthy()
    
    const result = await response.json()
    const campaigns = result.data?.campaigns || result.campaigns || []
    
    if (campaigns.length > 0) {
      const campaign = campaigns[0]
      
      // 验证必需字段存在
      expect(campaign).toHaveProperty('lottery_campaign_id')
      expect(campaign).toHaveProperty('campaign_name')
      expect(campaign).toHaveProperty('status')
      
      // 验证不存在错误的字段名（前端曾经误用的）
      // 如果后端返回 campaign_id，这个测试会失败，提醒开发者检查
      // expect(campaign).not.toHaveProperty('campaign_id')  // 可选检查
    }
  })

  test('页面使用正确的字段绑定', async ({ page }) => {
    // 登录
    await page.goto('/login.html')
    await page.fill('input[name="phone"]', '13612227930')
    await page.fill('input[name="password"]', 'your_password')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/workspace.html')
    
    // 访问抽奖管理页面
    await page.goto('/lottery-management.html')
    
    // 拦截 API 请求，验证前端如何使用数据
    await page.route('**/lottery-campaigns**', async route => {
      const response = await route.fetch()
      const json = await response.json()
      
      // 记录 API 返回的字段
      console.log('API 返回字段:', Object.keys(json.campaigns?.[0] || {}))
      
      await route.fulfill({ response, json })
    })
    
    // 等待数据加载
    await page.waitForTimeout(3000)
    
    // 验证表格行正确渲染（如果有数据的话）
    const tableRows = page.locator('table tbody tr')
    const rowCount = await tableRows.count()
    
    if (rowCount > 0) {
      // 验证第一行有内容（不是 undefined）
      const firstRowText = await tableRows.first().textContent()
      expect(firstRowText).not.toContain('undefined')
    }
  })
})
```

---

## 🚀 运行测试

### 命令行运行

```bash
# 运行所有测试
npm run test:e2e

# 运行特定文件
npx playwright test lottery-alerts.spec.js

# 调试模式（逐步执行）
npm run test:e2e:debug

# UI 模式（可视化界面）
npm run test:e2e:ui

# 查看测试报告
npm run test:e2e:report
```

### 常用选项

```bash
# 只运行失败的测试
npx playwright test --last-failed

# 指定浏览器
npx playwright test --project=chromium

# 显示浏览器窗口（非 headless）
npx playwright test --headed

# 生成测试代码（录制操作）
npx playwright codegen http://localhost:5173
```

---

## 🔧 调试技巧

### 1. 使用 Playwright Inspector

```bash
npx playwright test --debug
```

这会打开一个调试器，可以：
- 逐步执行测试
- 查看元素选择器
- 检查页面状态

### 2. 截图调试

```javascript
test('调试截图', async ({ page }) => {
  await page.goto('/lottery-alerts.html')
  
  // 截图保存
  await page.screenshot({ path: 'debug-screenshot.png' })
  
  // 全页面截图
  await page.screenshot({ path: 'full-page.png', fullPage: true })
})
```

### 3. 暂停测试

```javascript
test('暂停调试', async ({ page }) => {
  await page.goto('/lottery-alerts.html')
  
  // 暂停，手动检查页面
  await page.pause()
  
  // 继续执行...
})
```

### 4. 查看失败报告

```bash
# 测试失败后，查看 HTML 报告
npm run test:e2e:report
```

报告包含：
- 失败截图
- 操作录像
- 执行日志
- 错误堆栈

---

## 🔴 测试错误展示与分析

### 1. 命令行错误输出

测试失败时，终端会直接显示错误信息：

```bash
$ npm run test:e2e

  ❌ 1 failed
    lottery-alerts.spec.js:42:5 › 抽奖告警页面 › 页面能正常加载

  Error: expect(received).toHaveLength(0)

  Expected length: 0
  Received length: 1
  Received array:  ["TypeError: Cannot read properties of undefined (reading 'campaign_id')"]

    at tests/e2e/lottery-alerts.spec.js:58:52
```

**关键信息解读**：
- `❌ 1 failed` - 失败测试数量
- `lottery-alerts.spec.js:42:5` - 失败位置（文件:行:列）
- `Error: ...` - 具体错误信息
- `at tests/e2e/...` - 错误发生的代码位置

### 2. HTML 报告（推荐）

```bash
# 运行测试后自动生成报告
npm run test:e2e

# 打开可视化报告
npm run test:e2e:report
```

报告会在浏览器中打开，包含：

```
📊 HTML 报告内容：
├── 📋 测试列表（通过/失败/跳过）
├── 🖼️ 失败截图（自动在失败时刻截取）
├── 🎬 操作录像（可回放整个测试过程）
├── 📝 执行日志（每一步操作的详情）
├── 🔍 Trace 文件（可逐帧分析）
└── ❌ 错误堆栈（精确到代码行）
```

### 3. 失败截图和视频

根据配置，失败时自动保存：

```
admin/
├── test-results/                    # 测试结果目录
│   └── lottery-alerts-页面能正常加载/
│       ├── screenshot.png           # 💡 失败时刻的截图
│       ├── video.webm               # 💡 完整操作录像
│       └── trace.zip                # 💡 可分析的 trace 文件
└── playwright-report/               # HTML 报告目录
    └── index.html
```

### 4. Trace Viewer（最强大的调试工具）

```bash
# 查看 trace 文件（逐帧分析）
npx playwright show-trace test-results/xxx/trace.zip
```

**Trace Viewer 能看到**：
- 🎯 每一步操作前后的页面快照
- 🌐 网络请求和响应（包括 API 返回数据）
- 📋 控制台日志
- ⏱️ 每步操作的耗时
- 🖱️ 鼠标和键盘操作轨迹

### 5. 实时查看错误（UI 模式）

```bash
# 启动 UI 模式，实时查看测试执行
npm run test:e2e:ui
```

UI 模式特点：
- 可视化选择要运行的测试
- 实时观看浏览器操作
- 失败时自动暂停，可检查页面状态
- 支持单步调试

### 6. 控制台错误捕获示例

```javascript
test('捕获并展示页面 JS 错误', async ({ page }) => {
  // 收集所有控制台错误
  const errors = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push({
        text: msg.text(),
        location: msg.location()
      })
    }
  })

  await page.goto('/lottery-alerts.html')
  await page.waitForLoadState('networkidle')

  // 打印收集到的错误（方便调试）
  if (errors.length > 0) {
    console.log('🔴 页面 JavaScript 错误:')
    errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.text}`)
      console.log(`     位置: ${err.location?.url}:${err.location?.lineNumber}`)
    })
  }

  // 断言没有错误
  expect(errors).toHaveLength(0)
})
```

### 7. 快速定位错误的流程

```
测试失败后的排查步骤：

1️⃣ 查看终端输出
   └── 快速了解是什么错误

2️⃣ npm run test:e2e:report
   └── 打开 HTML 报告，查看截图

3️⃣ 点击失败测试 → 查看 Trace
   └── 逐帧分析，找到出错的具体步骤

4️⃣ 查看网络请求
   └── 检查 API 返回的数据是否正确

5️⃣ 修复代码后重新运行
   └── npx playwright test --last-failed
```

---

## 📊 CI/CD 集成

### GitHub Actions 示例

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          cd admin
          npm ci
      
      - name: Install Playwright Browsers
        run: |
          cd admin
          npx playwright install --with-deps
      
      - name: Run E2E tests
        run: |
          cd admin
          npm run test:e2e
      
      - name: Upload test report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: admin/playwright-report/
          retention-days: 30
```

---

## ✅ 最佳实践

### 1. 测试独立性
每个测试应该独立运行，不依赖其他测试的状态。

### 2. 使用 Page Object 模式
```javascript
// tests/e2e/pages/LoginPage.js
export class LoginPage {
  constructor(page) {
    this.page = page
    this.phoneInput = page.locator('input[name="phone"]')
    this.passwordInput = page.locator('input[name="password"]')
    this.submitButton = page.locator('button[type="submit"]')
  }

  async login(phone, password) {
    await this.phoneInput.fill(phone)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}

// 使用
test('登录测试', async ({ page }) => {
  const loginPage = new LoginPage(page)
  await page.goto('/login.html')
  await loginPage.login('13612227930', 'password')
})
```

### 3. 避免硬编码等待
```javascript
// ❌ 不好
await page.waitForTimeout(5000)

// ✅ 好
await page.waitForSelector('.data-loaded')
await page.waitForLoadState('networkidle')
```

### 4. 有意义的断言
```javascript
// ❌ 太宽泛
expect(page).toBeTruthy()

// ✅ 具体明确
await expect(page.locator('.campaign-list')).toContainText('双十一活动')
```

---

## 🏢 行业测试方案对比分析

### 一、大厂测试体系（美团 / 腾讯 / 阿里巴巴）

#### 1. 美团
```
测试金字塔：
┌─────────────────────────────┐
│      E2E 测试 (10%)         │  ← Playwright/Cypress + 自研封装
├─────────────────────────────┤
│     集成测试 (20%)          │  ← 服务间调用、契约测试
├─────────────────────────────┤
│     单元测试 (70%)          │  ← Jest/Vitest
└─────────────────────────────┘

特点：
✅ 自研测试平台（Rome、Ocean 等）
✅ 覆盖率要求 80%+，PR 合并前必须通过
✅ 专职 QA 团队 + 测试开发工程师（SET）
✅ 完整 CI/CD 流水线（每次提交自动跑测试）
✅ 灰度发布 + A/B 测试验证

成本：10-50人测试团队，自研平台维护成本高
```

#### 2. 腾讯
```
测试体系：
├── 微信生态 → miniprogram-automator（小程序专用）
├── 游戏业务 → WeTest 自研平台（性能+兼容性）
├── 云服务 → 自动化回归 + 混沌工程
└── 通用业务 → Cypress/Playwright + 内部封装

特点：
✅ 按业务线定制测试方案
✅ 自研 WeTest 平台（云测试、真机测试）
✅ 游戏有专门的压测和外挂检测
✅ 微信支付等核心链路 100% 自动化覆盖

成本：每个业务线有专属测试团队
```

#### 3. 阿里巴巴
```
测试体系：
├── 自研框架 → Macaca（跨端自动化）
├── 双十一专项 → 全链路压测平台
├── 质量门禁 → 每日构建、每周回归
└── 安全测试 → 渗透测试、漏洞扫描

特点：
✅ Java 技术栈为主（TestNG、JUnit）
✅ 云效平台（一站式 DevOps）
✅ 双十一级别压测能力
✅ 数据一致性验证严格

成本：企业级投入，测试基础设施完善
```

#### 大厂方案总结
| 维度 | 特点 | 适合场景 |
|-----|------|---------|
| 团队规模 | 10-100人专职测试 | 千万级用户产品 |
| 工具选型 | 自研 + 开源封装 | 需要定制化 |
| 覆盖率 | 80%+ | 业务关键、容错率低 |
| 成本 | 高（百万/年级别） | 有充足预算 |

---

### 二、小公司 / 创业团队测试方案

```
典型配置（3-10人团队）：
┌──────────────────────────────────────┐
│  开发自测 + 核心流程 E2E 测试        │
└──────────────────────────────────────┘

工具选择：
├── E2E 测试 → Playwright（免费、功能全）
├── 单元测试 → Vitest/Jest（快速）
├── API 测试 → Postman/Insomnia（手动+自动化）
└── CI/CD → GitHub Actions（免费额度够用）

特点：
✅ 无专职 QA，开发自测为主
✅ 只测核心流程（登录、支付、主要业务）
✅ 手动测试仍占 50%+
✅ 工具选择成熟开源方案

成本：几乎为 0（使用免费工具）
```

#### 小公司常见策略
```javascript
// 测试优先级划分
const testPriority = {
  P0_必须测试: ['登录', '支付', '核心交易流程'],
  P1_应该测试: ['数据展示', '表单提交', '权限控制'],
  P2_有空再测: ['样式', '边缘场景', '报表导出'],
  P3_暂时跳过: ['兼容性', '性能', '国际化']
}
```

---

### 三、游戏公司测试方案

```
游戏测试金字塔：
┌─────────────────────────────┐
│   玩家体验测试 (UX)         │  ← 真人玩家/机器人模拟
├─────────────────────────────┤
│   性能压力测试              │  ← 万人同服压测
├─────────────────────────────┤
│   功能自动化测试            │  ← 自动化脚本模拟操作
├─────────────────────────────┤
│   单元测试                  │  ← 战斗公式、掉落概率
└─────────────────────────────┘

特点：
✅ GM 工具 + 自动化脚本（模拟玩家行为）
✅ 概率验证（百万次模拟确保掉落率正确）
✅ 外挂/作弊检测
✅ 服务器压力测试（万人同时在线）
✅ 热更新回归测试

常用工具：
├── Unity → Unity Test Framework
├── Unreal → Automation System
├── 服务端 → JMeter/Locust 压测
└── 客户端 → Appium（手游）
```

---

### 四、活动策划公司 / 抽奖系统测试方案

```
⭐ 这类系统最关注的测试点：

1. 抽奖公平性验证
   ├── 概率分布测试（10万次模拟）
   ├── 随机算法验证
   └── 防作弊机制

2. 高并发场景
   ├── 秒杀抢购（瞬时流量）
   ├── 库存扣减一致性
   └── 防超卖测试

3. 业务规则验证
   ├── 中奖次数限制
   ├── 时间窗口控制
   └── 用户资格校验

测试工具组合：
├── E2E 测试 → Playwright（用户流程）
├── 概率测试 → 自定义脚本（大量模拟）
├── 压力测试 → k6/Artillery（并发模拟）
└── API 测试 → Playwright API testing
```

#### 抽奖系统专项测试示例
```javascript
// 概率验证测试（验证抽奖公平性）
test.describe('抽奖概率验证', () => {
  test('10000次抽奖，概率分布符合预期', async ({ request }) => {
    const results = { prize1: 0, prize2: 0, thanks: 0 }
    
    // 模拟 10000 次抽奖
    for (let i = 0; i < 10000; i++) {
      const response = await request.post('/api/v4/lottery/draw')
      const data = await response.json()
      results[data.prize_type]++
    }
    
    // 验证概率分布（允许 5% 误差）
    const totalDraws = 10000
    expect(results.prize1 / totalDraws).toBeCloseTo(0.01, 1)  // 1% 一等奖
    expect(results.prize2 / totalDraws).toBeCloseTo(0.05, 1)  // 5% 二等奖
    expect(results.thanks / totalDraws).toBeCloseTo(0.94, 1)  // 94% 谢谢参与
  })
})
```

---

### 五、虚拟物品交易 / 二手平台测试方案

```
核心测试点：
┌──────────────────────────────────────┐
│  1. 交易流程完整性                   │
│     买家下单 → 付款 → 卖家发货 → 确认收货
├──────────────────────────────────────┤
│  2. 资金安全                         │
│     余额一致性、防重复扣款、退款流程
├──────────────────────────────────────┤
│  3. 防刷/防欺诈                      │
│     异常行为检测、限流、风控
├──────────────────────────────────────┤
│  4. 数据一致性                       │
│     库存、订单状态、用户余额同步
└──────────────────────────────────────┘

测试工具：
├── E2E → Playwright（完整交易流程）
├── API → Playwright + 自定义断言（接口契约）
├── 安全 → OWASP ZAP（漏洞扫描）
└── 压测 → k6（并发交易）
```

---

### 六、方案对比总结

| 方案类型 | 团队规模 | 成本 | 覆盖率 | 自动化程度 | 适合场景 |
|---------|---------|------|-------|-----------|---------|
| 大厂方案 | 10-100人 | 💰💰💰 | 80%+ | 95%+ | 千万用户级产品 |
| 小公司方案 | 0-2人 | 💰 | 30-50% | 50% | MVP、创业项目 |
| 游戏公司 | 5-20人 | 💰💰 | 60-80% | 80% | 游戏类产品 |
| 活动/抽奖 | 1-5人 | 💰 | 50-70% | 70% | 营销活动系统 |
| 交易平台 | 3-10人 | 💰💰 | 70-90% | 80% | 涉及资金流转 |

---

### 七、🎯 本项目测试方案（已确定）

```
📌 项目决定：
├── 测试工具：Playwright
├── 测试范围：仅 admin 后台（Web端）
└── 不涉及：小程序、App、其他端
```

#### 项目实际技术栈

| 类别 | 技术 | 版本 |
|-----|------|-----|
| **构建工具** | Vite | 6.4.1 |
| **前端框架** | Alpine.js | 3.15.4 |
| **样式框架** | Tailwind CSS | 3.4.19 |
| **图表库** | ECharts | 6.0.0 |
| **实时通信** | Socket.io-client | 4.8.3 |
| **模板引擎** | EJS (vite-plugin-ejs) | 1.7.0 |
| **页面结构** | 多页应用 (MPA) | 30+ 页面 |

#### 项目页面清单（测试范围）

```
admin/ 目录下的 HTML 页面（共 30+ 个）：
├── login.html                 ← 登录页（入口）
├── workspace.html             ← 工作台（主页）
├── lottery-management.html    ← 抽奖管理（核心）
├── lottery-alerts.html        ← 抽奖告警
├── user-management.html       ← 用户管理
├── finance-management.html    ← 财务管理
├── asset-management.html      ← 资产管理
├── store-management.html      ← 商户管理
├── system-settings.html       ← 系统设置
├── statistics.html            ← 数据统计
├── customer-service.html      ← 客服中心
└── ... 其他 20+ 页面
```

#### ✅ 推荐测试方案

```
第一阶段（立即实施）：
┌─────────────────────────────────────────┐
│  Playwright E2E 测试                    │
│  覆盖核心流程：登录 → 抽奖 → 管理后台    │
└─────────────────────────────────────────┘

第二阶段（稳定后）：
┌─────────────────────────────────────────┐
│  补充单元测试                           │
│  覆盖：抽奖算法、概率计算、业务规则      │
└─────────────────────────────────────────┘

第三阶段（上线前）：
┌─────────────────────────────────────────┐
│  压力测试（可选）                        │
│  验证：秒杀场景、并发抽奖               │
└─────────────────────────────────────────┘
```

#### 工具选择建议

| 需求 | 推荐工具 | 理由 |
|-----|---------|------|
| **E2E 测试** | ✅ **Playwright** | 免费、功能全、微软维护、适合中小团队 |
| 单元测试 | Vitest | Vite 生态、速度快 |
| API 测试 | Playwright 内置 | 不需要额外工具 |
| CI/CD | GitHub Actions | 免费额度足够 |

#### 针对本项目技术栈的测试要点

**1. Alpine.js 特殊处理**
```javascript
// Alpine.js 使用 x-data 绑定数据，需要等待 Alpine 初始化
test('等待 Alpine.js 初始化', async ({ page }) => {
  await page.goto('/lottery-management.html')
  
  // 等待 Alpine.js 初始化完成（x-cloak 消失）
  await page.waitForSelector('[x-data]:not([x-cloak])')
  
  // 或者等待具体元素可见
  await page.waitForSelector('.data-loaded')
})
```

**2. ECharts 图表测试**
```javascript
// ECharts 图表需要等待 canvas 渲染
test('验证图表渲染', async ({ page }) => {
  await page.goto('/statistics.html')
  
  // 等待 ECharts canvas 出现
  await page.waitForSelector('[x-ref="chart"] canvas', { timeout: 10000 })
  
  // 验证图表容器可见
  await expect(page.locator('[x-ref="chart"]')).toBeVisible()
})
```

**3. 多页应用 (MPA) 页面跳转**
```javascript
// 多页应用跳转需要完整 URL
test('页面跳转测试', async ({ page }) => {
  await page.goto('/workspace.html')
  
  // 点击侧边栏菜单
  await page.click('text=抽奖管理')
  
  // 验证 iframe 加载了正确的页面
  const iframe = page.frameLocator('iframe')
  await expect(iframe.locator('.page-title')).toContainText('抽奖')
})
```

**4. Socket.io 实时通信测试**
```javascript
// WebSocket 连接可能需要额外等待
test('实时消息接收', async ({ page }) => {
  await page.goto('/customer-service.html')
  
  // 等待 WebSocket 连接建立
  await page.waitForFunction(() => {
    return window.socketConnected === true
  }, { timeout: 5000 })
})
```

#### 为什么选 Playwright 而不是其他？

| 对比项 | Playwright | Cypress | Selenium |
|-------|-----------|---------|----------|
| 多浏览器 | ✅ Chrome/FF/Safari | ⚠️ 主要 Chrome | ✅ 但配置复杂 |
| 学习曲线 | ⭐⭐ 中等 | ⭐ 简单 | ⭐⭐⭐ 陡峭 |
| 并行执行 | ✅ 原生支持 | ❌ 需付费 | ⚠️ 需配置 |
| 维护团队 | Microsoft | 商业公司 | 社区 |
| 适合场景 | 通用 | 简单项目 | 老项目迁移 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |

#### 测试覆盖优先级

```javascript
// 你的项目测试优先级建议
const yourProjectTestPriority = {
  P0_必须测试: [
    '管理员登录/登出',
    '抽奖活动创建/编辑',
    '抽奖概率配置',
    '中奖记录查询'
  ],
  P1_应该测试: [
    '活动列表展示',
    '告警规则配置',
    '数据统计图表',
    '用户权限控制'
  ],
  P2_有空再测: [
    '导出报表',
    '批量操作',
    '页面样式'
  ]
}
```

#### 预估投入

```
使用 Playwright 的投入估算：

初期搭建：1-2 天
├── 安装配置：2 小时
├── 编写登录测试：2 小时
├── 编写核心流程测试：1 天
└── CI/CD 集成：2 小时

日常维护：每周 2-4 小时
├── 新功能补测试
├── 失败测试修复
└── 偶尔更新依赖

成本：0 元（工具全免费）
```

---

### 八、快速开始模板

基于你的项目，这是推荐的最小化测试集：

```javascript
// tests/e2e/smoke.spec.js - 冒烟测试（最重要的几个流程）

import { test, expect } from '@playwright/test'

test.describe('核心流程冒烟测试', () => {
  
  // 1. 登录能用
  test('管理员能正常登录', async ({ page }) => {
    await page.goto('/login.html')
    await page.fill('[name="phone"]', process.env.TEST_PHONE)
    await page.fill('[name="password"]', process.env.TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/workspace/)
  })

  // 2. 核心页面能打开
  test('抽奖管理页面无报错', async ({ page }) => {
    const errors = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    
    await page.goto('/lottery-management.html')
    await page.waitForLoadState('networkidle')
    
    expect(errors.filter(e => e.includes('TypeError'))).toHaveLength(0)
  })

  // 3. 数据能展示
  test('活动列表能加载数据', async ({ page }) => {
    await page.goto('/lottery-management.html')
    await page.waitForSelector('table tbody tr', { timeout: 10000 })
    
    const rowCount = await page.locator('table tbody tr').count()
    expect(rowCount).toBeGreaterThan(0)
  })
})
```

---

## 📚 参考资源

- [Playwright 官方文档](https://playwright.dev/docs/intro)
- [Playwright 中文文档](https://playwright.dev/docs/intro)
- [测试最佳实践](https://playwright.dev/docs/best-practices)
- [API 参考](https://playwright.dev/docs/api/class-playwright)

---

## 🔄 维护建议

1. **每次发现 Bug 后，补充对应的 E2E 测试**
2. **PR 合并前必须通过 E2E 测试**
3. **定期运行全量测试（每日/每周）**
4. **保持测试代码的整洁和可读性**

---

*文档版本: 1.2.0*
*最后更新: 2025-02-02*
*适用项目: restaurant-lottery-admin（仅 Web 端后台，30+ 页面）*
*技术栈: Vite 6 + Alpine.js 3 + Tailwind CSS 3 + ECharts 6*
*测试工具: Playwright*

