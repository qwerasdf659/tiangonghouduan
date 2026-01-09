#!/usr/bin/env node
/**
 * 通知API测试脚本
 * 测试 /api/v4/system/notifications 相关端点
 *
 * 运行方式: node scripts/test-notifications-api.js
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000'

// 测试用管理员凭证
const TEST_ADMIN = {
  mobile: '13800000002', // 测试管理员手机号
  code: '123456' // 测试验证码
}

class NotificationsApiTester {
  constructor() {
    this.token = null
    this.testResults = []
  }

  /**
   * 执行HTTP请求
   */
  async request(url, options = {}) {
    const fullUrl = `${BASE_URL}${url}`
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
    }

    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers: { ...headers, ...options.headers }
      })
      const data = await response.json()
      return { status: response.status, data, ok: response.ok }
    } catch (error) {
      return { status: 0, data: null, error: error.message, ok: false }
    }
  }

  /**
   * 登录获取Token
   */
  async login() {
    console.log('\n📱 步骤1: 管理员登录获取Token...')

    // 优先使用环境变量中的Token
    if (process.env.ADMIN_TOKEN) {
      this.token = process.env.ADMIN_TOKEN
      console.log('✅ 使用环境变量中的Token')
      return true
    }

    // 尝试管理员登录 /api/v4/console/auth/login
    const loginResult = await this.request('/api/v4/console/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        mobile: TEST_ADMIN.mobile,
        verification_code: TEST_ADMIN.code
      })
    })

    if (loginResult.ok && loginResult.data?.data?.token) {
      this.token = loginResult.data.data.token
      console.log('✅ 登录成功，获取到管理员Token')
      return true
    } else {
      console.log('⚠️ 管理员登录失败:', loginResult.data?.message || loginResult.error)

      // 尝试普通用户登录 /api/v4/auth/login
      const userLoginResult = await this.request('/api/v4/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          mobile: TEST_ADMIN.mobile,
          verification_code: TEST_ADMIN.code
        })
      })

      if (userLoginResult.ok && userLoginResult.data?.data?.token) {
        this.token = userLoginResult.data.data.token
        console.log('✅ 用户登录成功，获取到Token')
        return true
      }

      console.log('❌ 登录失败，请设置环境变量 ADMIN_TOKEN 后重试')
      return false
    }
  }

  /**
   * 记录测试结果
   */
  recordResult(name, success, details = '') {
    this.testResults.push({ name, success, details })
    const icon = success ? '✅' : '❌'
    console.log(`   ${icon} ${name}${details ? `: ${details}` : ''}`)
  }

  /**
   * 测试1: 获取通知列表
   */
  async testGetNotifications() {
    console.log('\n📋 测试1: 获取通知列表 GET /api/v4/system/notifications')

    const result = await this.request('/api/v4/system/notifications')

    if (result.ok) {
      const data = result.data?.data
      this.recordResult('请求成功', true, `状态码 ${result.status}`)
      this.recordResult('返回格式正确', !!data?.notifications, `notifications数组`)
      this.recordResult('包含统计信息', !!data?.statistics, JSON.stringify(data?.statistics || {}))
      this.recordResult(
        '统计字段完整',
        data?.statistics?.total !== undefined &&
          data?.statistics?.unread !== undefined &&
          data?.statistics?.today !== undefined &&
          data?.statistics?.week !== undefined
      )
      return data
    } else {
      this.recordResult('请求成功', false, result.data?.message || result.error)
      return null
    }
  }

  /**
   * 测试2: 发送通知
   */
  async testSendNotification() {
    console.log('\n📤 测试2: 发送通知 POST /api/v4/system/notifications/send')

    const notificationData = {
      type: 'system',
      title: `测试通知 - ${new Date().toLocaleTimeString('zh-CN')}`,
      content: '这是一条测试系统通知，用于验证通知API功能正常运行。',
      target: 'all'
    }

    const result = await this.request('/api/v4/system/notifications/send', {
      method: 'POST',
      body: JSON.stringify(notificationData)
    })

    if (result.ok) {
      const data = result.data?.data
      this.recordResult('发送成功', true, `ID: ${data?.notification_id}`)
      this.recordResult('返回通知ID', !!data?.notification_id)
      return data?.notification_id
    } else {
      this.recordResult('发送成功', false, result.data?.message || result.error)
      return null
    }
  }

  /**
   * 测试3: 获取通知详情
   */
  async testGetNotificationDetail(notificationId) {
    console.log(`\n🔍 测试3: 获取通知详情 GET /api/v4/system/notifications/${notificationId}`)

    if (!notificationId) {
      this.recordResult('获取详情', false, '无有效通知ID')
      return null
    }

    const result = await this.request(`/api/v4/system/notifications/${notificationId}`)

    if (result.ok) {
      const data = result.data?.data
      this.recordResult('请求成功', true)
      this.recordResult('返回通知对象', !!data?.notification)
      this.recordResult('包含标题', !!data?.notification?.title)
      this.recordResult('包含内容', !!data?.notification?.content)
      return data?.notification
    } else {
      this.recordResult('请求成功', false, result.data?.message || result.error)
      return null
    }
  }

  /**
   * 测试4: 标记已读
   */
  async testMarkAsRead(notificationId) {
    console.log(`\n✔️ 测试4: 标记已读 POST /api/v4/system/notifications/${notificationId}/read`)

    if (!notificationId) {
      this.recordResult('标记已读', false, '无有效通知ID')
      return false
    }

    const result = await this.request(`/api/v4/system/notifications/${notificationId}/read`, {
      method: 'POST'
    })

    if (result.ok) {
      this.recordResult('标记成功', true)
      return true
    } else {
      this.recordResult('标记成功', false, result.data?.message || result.error)
      return false
    }
  }

  /**
   * 测试5: 全部标记已读
   */
  async testMarkAllAsRead() {
    console.log('\n✔️✔️ 测试5: 全部标记已读 POST /api/v4/system/notifications/read-all')

    const result = await this.request('/api/v4/system/notifications/read-all', {
      method: 'POST'
    })

    if (result.ok) {
      const data = result.data?.data
      this.recordResult('操作成功', true, `更新 ${data?.updated_count || 0} 条`)
      return true
    } else {
      this.recordResult('操作成功', false, result.data?.message || result.error)
      return false
    }
  }

  /**
   * 测试6: 清空通知
   */
  async testClearNotifications() {
    console.log('\n🗑️ 测试6: 清空通知 POST /api/v4/system/notifications/clear')

    const result = await this.request('/api/v4/system/notifications/clear', {
      method: 'POST'
    })

    if (result.ok) {
      const data = result.data?.data
      this.recordResult('操作成功', true, `清空 ${data?.cleared_count || 0} 条`)
      return true
    } else {
      this.recordResult('操作成功', false, result.data?.message || result.error)
      return false
    }
  }

  /**
   * 打印测试报告
   */
  printReport() {
    console.log('\n' + '='.repeat(60))
    console.log('📊 通知API测试报告')
    console.log('='.repeat(60))

    const passed = this.testResults.filter(r => r.success).length
    const total = this.testResults.length

    console.log(`\n总测试项: ${total}`)
    console.log(`通过: ${passed}`)
    console.log(`失败: ${total - passed}`)
    console.log(`通过率: ${((passed / total) * 100).toFixed(1)}%`)

    if (total - passed > 0) {
      console.log('\n❌ 失败项目:')
      this.testResults
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`   - ${r.name}: ${r.details}`)
        })
    }

    console.log('\n' + '='.repeat(60))

    return passed === total
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🚀 开始测试通知API...')
    console.log(`📡 API地址: ${BASE_URL}`)

    // 登录
    const loggedIn = await this.login()
    if (!loggedIn) {
      console.log('\n❌ 无法获取管理员Token，测试终止')
      console.log('💡 请设置环境变量 ADMIN_TOKEN 后重试')
      process.exit(1)
    }

    // 测试1: 获取列表
    await this.testGetNotifications()

    // 测试2: 发送通知
    const newNotificationId = await this.testSendNotification()

    // 测试3: 获取详情
    await this.testGetNotificationDetail(newNotificationId)

    // 再次获取列表验证统计更新
    console.log('\n🔄 验证统计数据更新...')
    const afterSend = await this.testGetNotifications()

    // 测试4: 标记已读
    await this.testMarkAsRead(newNotificationId)

    // 测试5: 全部标记已读
    await this.testMarkAllAsRead()

    // 测试6: 清空通知（可选，注释掉避免删除数据）
    // await this.testClearNotifications()

    // 打印报告
    const allPassed = this.printReport()
    process.exit(allPassed ? 0 : 1)
  }
}

// 主程序
const tester = new NotificationsApiTester()
tester.runAllTests().catch(error => {
  console.error('❌ 测试过程出错:', error)
  process.exit(1)
})
