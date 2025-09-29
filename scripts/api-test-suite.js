#!/usr/bin/env node

/**
 * V4 API测试套件 - 全面测试所有API端点
 *
 * @description 基于API文档测试所有端点的可用性、响应时间和正确性
 * @version 4.0.0
 * @date 2025-09-27
 */

const axios = require('axios')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_MOBILE = '13612227930'
const TEST_VERIFICATION_CODE = '123456'

class ApiTestSuite {
  constructor () {
    this.results = []
    this.accessToken = null
    this.refreshToken = null
    this.testUserId = null
  }

  // 记录测试结果
  recordResult (endpoint, method, status, responseTime, success, error = null) {
    this.results.push({
      endpoint,
      method,
      status,
      responseTime,
      success,
      error,
      timestamp: new Date().toISOString()
    })
  }

  // 执行HTTP请求
  async makeRequest (method, endpoint, data = null, headers = {}) {
    const startTime = Date.now()
    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }

      if (data) {
        config.data = data
      }

      const response = await axios(config)
      const responseTime = Date.now() - startTime

      this.recordResult(endpoint, method, response.status, responseTime, true)
      return { success: true, data: response.data, status: response.status, responseTime }
    } catch (error) {
      const responseTime = Date.now() - startTime
      const status = error.response?.status || 0

      this.recordResult(endpoint, method, status, responseTime, false, error.message)
      return { success: false, error: error.message, status, responseTime }
    }
  }

  // 测试健康检查端点
  async testHealthEndpoint () {
    console.log('\n=== 测试健康检查端点 ==='.cyan)

    const result = await this.makeRequest('GET', '/health')
    if (result.success) {
      console.log('✅ 健康检查端点正常'.green)
      console.log(`   响应时间: ${result.responseTime}ms`)
      console.log(`   状态: ${result.data.data?.status}`)
      console.log(`   版本: ${result.data.data?.version}`)
    } else {
      console.log('❌ 健康检查端点失败'.red)
      console.log(`   错误: ${result.error}`)
    }
  }

  // 测试V4基础信息端点
  async testV4InfoEndpoint () {
    console.log('\n=== 测试V4基础信息端点 ==='.cyan)

    const result = await this.makeRequest('GET', '/api/v4')
    if (result.success) {
      console.log('✅ V4信息端点正常'.green)
      console.log(`   响应时间: ${result.responseTime}ms`)
      console.log(`   架构: ${result.data.data?.architecture}`)
    } else {
      console.log('❌ V4信息端点失败'.red)
      console.log(`   错误: ${result.error}`)
    }
  }

  // 测试认证系统
  async testAuthSystem () {
    console.log('\n=== 测试认证系统 ==='.cyan)

    // 1. 测试登录端点
    console.log('1. 测试登录端点...')
    const loginResult = await this.makeRequest('POST', '/api/v4/unified-engine/auth/login', {
      mobile: TEST_MOBILE,
      verification_code: TEST_VERIFICATION_CODE
    })

    if (loginResult.success) {
      console.log('✅ 登录成功'.green)
      console.log(`   响应时间: ${loginResult.responseTime}ms`)

      this.accessToken = loginResult.data.data.access_token
      this.refreshToken = loginResult.data.data.refresh_token
      this.testUserId = loginResult.data.data.user.user_id

      console.log(`   用户ID: ${this.testUserId}`)
      console.log(`   管理员权限: ${loginResult.data.data.user.is_admin}`)
    } else {
      console.log('❌ 登录失败'.red)
      console.log(`   错误: ${loginResult.error}`)
      return false
    }

    // 2. 测试认证状态端点
    console.log('2. 测试认证状态端点...')
    const statusResult = await this.makeRequest('GET', '/api/v4/unified-engine/auth/status', null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (statusResult.success) {
      console.log('✅ 认证状态检查成功'.green)
      console.log(`   响应时间: ${statusResult.responseTime}ms`)
    } else {
      console.log('❌ 认证状态检查失败'.red)
      console.log(`   错误: ${statusResult.error}`)
    }

    // 3. 测试认证验证端点
    console.log('3. 测试认证验证端点...')
    const verifyResult = await this.makeRequest('GET', '/api/v4/unified-engine/auth/verify', null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (verifyResult.success) {
      console.log('✅ 认证验证成功'.green)
      console.log(`   响应时间: ${verifyResult.responseTime}ms`)
    } else {
      console.log('❌ 认证验证失败'.red)
      console.log(`   错误: ${verifyResult.error}`)
    }

    return true
  }

  // 测试抽奖系统
  async testLotterySystem () {
    console.log('\n=== 测试抽奖系统 ==='.cyan)

    if (!this.accessToken) {
      console.log('❌ 需要先登录才能测试抽奖系统'.red)
      return
    }

    // 1. 测试抽奖策略查询
    console.log('1. 测试抽奖策略查询...')
    const strategiesResult = await this.makeRequest('GET', '/api/v4/unified-engine/lottery/strategies', null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (strategiesResult.success) {
      console.log('✅ 抽奖策略查询成功'.green)
      console.log(`   响应时间: ${strategiesResult.responseTime}ms`)
    } else {
      console.log('❌ 抽奖策略查询失败'.red)
      console.log(`   错误: ${strategiesResult.error}`)
    }

    // 2. 测试抽奖执行
    console.log('2. 测试抽奖执行...')
    const drawResult = await this.makeRequest('POST', '/api/v4/unified-engine/lottery/draw', {
      strategy_type: 'basic_guarantee',
      consume_points: 100
    }, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (drawResult.success) {
      console.log('✅ 抽奖执行成功'.green)
      console.log(`   响应时间: ${drawResult.responseTime}ms`)
      console.log(`   抽奖结果: ${drawResult.data.data?.result || '未知'}`)
    } else {
      console.log('❌ 抽奖执行失败'.red)
      console.log(`   错误: ${drawResult.error}`)
    }
  }

  // 测试权限管理系统
  async testPermissionSystem () {
    console.log('\n=== 测试权限管理系统 ==='.cyan)

    if (!this.accessToken || !this.testUserId) {
      console.log('❌ 需要先登录才能测试权限系统'.red)
      return
    }

    // 1. 测试用户权限查询
    console.log('1. 测试用户权限查询...')
    const userPermResult = await this.makeRequest('GET', `/api/v4/permissions/user/${this.testUserId}`, null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (userPermResult.success) {
      console.log('✅ 用户权限查询成功'.green)
      console.log(`   响应时间: ${userPermResult.responseTime}ms`)
    } else {
      console.log('❌ 用户权限查询失败'.red)
      console.log(`   错误: ${userPermResult.error}`)
    }

    // 2. 测试权限检查
    console.log('2. 测试权限检查...')
    const checkPermResult = await this.makeRequest('POST', '/api/v4/permissions/check', {
      user_id: this.testUserId,
      feature: 'lottery'
    }, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (checkPermResult.success) {
      console.log('✅ 权限检查成功'.green)
      console.log(`   响应时间: ${checkPermResult.responseTime}ms`)
    } else {
      console.log('❌ 权限检查失败'.red)
      console.log(`   错误: ${checkPermResult.error}`)
    }
  }

  // 测试库存管理系统
  async testInventorySystem () {
    console.log('\n=== 测试库存管理系统 ==='.cyan)

    if (!this.accessToken || !this.testUserId) {
      console.log('❌ 需要先登录才能测试库存系统'.red)
      return
    }

    // 测试用户库存查询
    console.log('1. 测试用户库存查询...')
    const inventoryResult = await this.makeRequest('GET', `/api/v4/inventory/user/${this.testUserId}`, null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (inventoryResult.success) {
      console.log('✅ 用户库存查询成功'.green)
      console.log(`   响应时间: ${inventoryResult.responseTime}ms`)
      console.log(`   库存数量: ${inventoryResult.data.data?.inventory?.length || 0}`)
    } else {
      console.log('❌ 用户库存查询失败'.red)
      console.log(`   错误: ${inventoryResult.error}`)
    }
  }

  // 测试管理员系统
  async testAdminSystem () {
    console.log('\n=== 测试管理员系统 ==='.cyan)

    if (!this.accessToken) {
      console.log('❌ 需要先登录才能测试管理员系统'.red)
      return
    }

    // 1. 测试管理员仪表板
    console.log('1. 测试管理员仪表板...')
    const dashboardResult = await this.makeRequest('GET', '/api/v4/unified-engine/admin/dashboard', null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (dashboardResult.success) {
      console.log('✅ 管理员仪表板成功'.green)
      console.log(`   响应时间: ${dashboardResult.responseTime}ms`)
    } else {
      console.log('❌ 管理员仪表板失败'.red)
      console.log(`   错误: ${dashboardResult.error}`)
    }
  }

  // 生成测试报告
  generateReport () {
    console.log('\n=== 测试报告 ==='.yellow)
    console.log('='.repeat(50).yellow)

    const totalTests = this.results.length
    const successfulTests = this.results.filter(r => r.success).length
    const failedTests = totalTests - successfulTests

    console.log(`总测试数: ${totalTests}`)
    console.log(`成功: ${successfulTests}`.green)
    console.log(`失败: ${failedTests}`.red)
    console.log(`成功率: ${((successfulTests / totalTests) * 100).toFixed(2)}%`)

    // 响应时间统计
    const responseTimes = this.results.map(r => r.responseTime)
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    const maxResponseTime = Math.max(...responseTimes)
    const minResponseTime = Math.min(...responseTimes)

    console.log('\n响应时间统计:')
    console.log(`  平均: ${avgResponseTime.toFixed(2)}ms`)
    console.log(`  最大: ${maxResponseTime}ms`)
    console.log(`  最小: ${minResponseTime}ms`)

    // 失败的测试详情
    if (failedTests > 0) {
      console.log('\n失败的测试:'.red)
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`  ❌ ${result.method} ${result.endpoint} - ${result.error}`.red)
      })
    }

    console.log('='.repeat(50).yellow)
  }

  // 运行所有测试
  async runAllTests () {
    console.log('🚀 开始V4 API全面测试...'.rainbow)
    console.log(`测试目标: ${BASE_URL}`)
    console.log(`测试账号: ${TEST_MOBILE}`)

    try {
      // 基础端点测试
      await this.testHealthEndpoint()
      await this.testV4InfoEndpoint()

      // 认证系统测试
      const authSuccess = await this.testAuthSystem()

      if (authSuccess) {
        // 业务系统测试
        await this.testLotterySystem()
        await this.testPermissionSystem()
        await this.testInventorySystem()
        await this.testAdminSystem()
      }

      // 生成报告
      this.generateReport()
    } catch (error) {
      console.error('测试执行过程中发生错误:', error.message)
    }
  }
}

// 运行测试
if (require.main === module) {
  const testSuite = new ApiTestSuite()
  testSuite.runAllTests().then(() => {
    console.log('\n🎉 API测试完成!'.rainbow)
    process.exit(0)
  }).catch(error => {
    console.error('测试失败:', error.message)
    process.exit(1)
  })
}

module.exports = ApiTestSuite
