#!/usr/bin/env node

/**
 * V4 统一测试套件
 * 整合所有分散的测试脚本，减少重复，提升效率
 *
 * @description 统一管理API测试、权限测试、认证测试等功能
 * @version 4.0.0
 * @date 2025-10-01
 * @author Claude Sonnet 4
 */

const axios = require('axios')
const { User, Role } = require('../models')
const { getUserRoles } = require('../middleware/auth')
const permissionModule = require('../modules/UserPermissionModule')
const BeijingTimeHelper = require('../utils/timeHelper')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_MOBILE = '13612227930'
const TEST_VERIFICATION_CODE = '123456'
const TEST_USER_ID = 31

class UnifiedTestSuite {
  constructor () {
    this.results = []
    this.accessToken = null
    this.refreshToken = null
    this.testUserId = null
    this.startTime = Date.now()
  }

  // 记录测试结果
  recordResult (testName, success, details = null, error = null, responseTime = 0) {
    this.results.push({
      testName,
      success,
      details,
      error,
      responseTime,
      timestamp: BeijingTimeHelper.now()
    })
  }

  // 执行HTTP请求的统一方法
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

      return {
        success: true,
        data: response.data,
        status: response.status,
        responseTime
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      const status = error.response?.status || 0

      return {
        success: false,
        error: error.message,
        status,
        responseTime,
        response: error.response?.data
      }
    }
  }

  // === API 测试模块 ===

  // 测试健康检查端点
  async testHealthEndpoint () {
    console.log('\n=== 测试健康检查端点 ===')

    const result = await this.makeRequest('GET', '/health')
    if (result.success) {
      console.log('✅ 健康检查端点正常')
      console.log(`   响应时间: ${result.responseTime}ms`)
      console.log(`   状态: ${result.data.data?.status}`)
      console.log(`   版本: ${result.data.data?.version}`)

      this.recordResult('健康检查端点', true, result.data, null, result.responseTime)
    } else {
      console.log('❌ 健康检查端点失败')
      console.log(`   错误: ${result.error}`)

      this.recordResult('健康检查端点', false, null, result.error, result.responseTime)
    }
  }

  // 测试V4基础信息端点
  async testV4InfoEndpoint () {
    console.log('\n=== 测试V4基础信息端点 ===')

    const result = await this.makeRequest('GET', '/api/v4')
    if (result.success) {
      console.log('✅ V4信息端点正常')
      console.log(`   响应时间: ${result.responseTime}ms`)
      console.log(`   架构: ${result.data.data?.architecture}`)

      this.recordResult('V4信息端点', true, result.data, null, result.responseTime)
    } else {
      console.log('❌ V4信息端点失败')
      console.log(`   错误: ${result.error}`)

      this.recordResult('V4信息端点', false, null, result.error, result.responseTime)
    }
  }

  // === 认证测试模块 ===

  // 测试登录认证
  async testAuthentication () {
    console.log('\n=== 测试登录认证 ===')

    const result = await this.makeRequest('POST', '/api/v4/unified-engine/auth/login', {
      mobile: TEST_MOBILE,
      verification_code: TEST_VERIFICATION_CODE
    })

    if (result.success && result.data.success) {
      this.accessToken = result.data.data.access_token
      this.refreshToken = result.data.data.refresh_token
      this.testUserId = result.data.data.user?.user_id

      console.log('✅ 登录认证成功')
      console.log(`   响应时间: ${result.responseTime}ms`)
      console.log(`   用户ID: ${this.testUserId}`)
      console.log(`   Token类型: ${result.data.data.token_type}`)

      this.recordResult('登录认证', true, {
        userId: this.testUserId,
        tokenType: result.data.data.token_type
      }, null, result.responseTime)

      return true
    } else {
      console.log('❌ 登录认证失败')
      console.log(`   错误: ${result.error || result.data?.message}`)

      this.recordResult('登录认证', false, null, result.error || result.data?.message, result.responseTime)
      return false
    }
  }

  // 测试Token刷新
  async testTokenRefresh () {
    if (!this.refreshToken) {
      console.log('⚠️  跳过Token刷新测试 - 无refresh_token')
      return
    }

    console.log('\n=== 测试Token刷新 ===')

    const result = await this.makeRequest('POST', '/api/v4/unified-engine/auth/refresh', {
      refresh_token: this.refreshToken
    })

    if (result.success) {
      console.log('✅ Token刷新成功')
      console.log(`   响应时间: ${result.responseTime}ms`)

      this.recordResult('Token刷新', true, null, null, result.responseTime)
    } else {
      console.log('❌ Token刷新失败')
      console.log(`   错误: ${result.error}`)

      this.recordResult('Token刷新', false, null, result.error, result.responseTime)
    }
  }

  // === 权限测试模块 ===

  // 测试用户权限系统
  async testUserPermissions () {
    console.log('\n=== 测试用户权限系统 ===')

    try {
      // 1. 测试数据库层权限查询
      const user = await User.findOne({
        where: { user_id: TEST_USER_ID },
        include: [
          {
            model: Role,
            as: 'roles',
            through: {
              where: { is_active: true }
            },
            attributes: ['role_id', 'role_uuid', 'role_name', 'role_level', 'permissions']
          }
        ]
      })

      if (user) {
        console.log('✅ 用户数据库查询成功')
        console.log(`   用户ID: ${user.user_id}`)
        console.log(`   手机号: ${user.mobile}`)
        console.log(`   角色数量: ${user.roles ? user.roles.length : 0}`)

        if (user.roles && user.roles.length > 0) {
          console.log('   角色详情:')
          user.roles.forEach(role => {
            console.log(`     - ${role.role_name} (级别: ${role.role_level})`)
          })
        }

        this.recordResult('用户权限-数据库查询', true, {
          userId: user.user_id,
          rolesCount: user.roles?.length || 0,
          roles: user.roles?.map(r => r.role_name) || []
        })
      } else {
        console.log('❌ 测试用户不存在')
        this.recordResult('用户权限-数据库查询', false, null, '测试用户不存在')
        return
      }

      // 2. 测试getUserRoles中间件
      console.log('\n🛡️  测试getUserRoles中间件:')
      const userRoles = await getUserRoles(TEST_USER_ID)
      console.log('   结果:', JSON.stringify(userRoles, null, 2))

      this.recordResult('用户权限-中间件', true, userRoles)

      // 3. 测试UserPermissionModule
      console.log('\n🔧 测试UserPermissionModule:')
      const permissions = await permissionModule.getUserPermissions(TEST_USER_ID)
      console.log('   结果:', JSON.stringify(permissions, null, 2))

      this.recordResult('用户权限-权限模块', true, permissions)
    } catch (error) {
      console.error('❌ 用户权限系统测试失败:', error.message)
      this.recordResult('用户权限系统', false, null, error.message)
    }
  }

  // 测试权限API端点
  async testPermissionAPI () {
    if (!this.accessToken) {
      console.log('⚠️  跳过权限API测试 - 无访问Token')
      return
    }

    console.log('\n=== 测试权限API端点 ===')

    const result = await this.makeRequest('GET', `/api/v4/permissions/user/${TEST_USER_ID}`, null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (result.success) {
      console.log('✅ 权限API调用成功')
      console.log(`   响应时间: ${result.responseTime}ms`)
      console.log('   权限数据:', JSON.stringify(result.data, null, 2))

      this.recordResult('权限API端点', true, result.data, null, result.responseTime)
    } else {
      console.log('❌ 权限API调用失败')
      console.log(`   状态码: ${result.status}`)
      console.log(`   错误: ${result.error}`)

      this.recordResult('权限API端点', false, result.response, result.error, result.responseTime)
    }
  }

  // === 业务系统测试模块 ===

  // 测试抽奖系统
  async testLotterySystem () {
    if (!this.accessToken) {
      console.log('⚠️  跳过抽奖系统测试 - 无访问Token')
      return
    }

    console.log('\n=== 测试抽奖系统 ===')

    // 1. 测试抽奖执行
    const lotteryResult = await this.makeRequest('POST', '/api/v4/unified-engine/lottery/execute', {
      user_id: this.testUserId,
      campaign_id: 1
    }, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (lotteryResult.success) {
      console.log('✅ 抽奖执行测试成功')
      console.log(`   响应时间: ${lotteryResult.responseTime}ms`)
      console.log(`   抽奖结果: ${lotteryResult.data.data?.is_winner ? '中奖' : '未中奖'}`)

      this.recordResult('抽奖系统-执行', true, lotteryResult.data, null, lotteryResult.responseTime)
    } else {
      console.log('❌ 抽奖执行测试失败')
      console.log(`   错误: ${lotteryResult.error}`)

      this.recordResult('抽奖系统-执行', false, null, lotteryResult.error, lotteryResult.responseTime)
    }

    // 2. 测试抽奖历史查询
    const historyResult = await this.makeRequest('GET', `/api/v4/unified-engine/lottery/history/${this.testUserId}`, null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (historyResult.success) {
      console.log('✅ 抽奖历史查询成功')
      console.log(`   响应时间: ${historyResult.responseTime}ms`)
      console.log(`   历史记录数: ${historyResult.data.data?.records?.length || 0}`)

      this.recordResult('抽奖系统-历史查询', true, historyResult.data, null, historyResult.responseTime)
    } else {
      console.log('❌ 抽奖历史查询失败')
      console.log(`   错误: ${historyResult.error}`)

      this.recordResult('抽奖系统-历史查询', false, null, historyResult.error, historyResult.responseTime)
    }
  }

  // 测试库存系统
  async testInventorySystem () {
    if (!this.accessToken) {
      console.log('⚠️  跳过库存系统测试 - 无访问Token')
      return
    }

    console.log('\n=== 测试库存系统 ===')

    // 测试用户库存查询
    const inventoryResult = await this.makeRequest('GET', `/api/v4/inventory/user/${this.testUserId}`, null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (inventoryResult.success) {
      console.log('✅ 用户库存查询成功')
      console.log(`   响应时间: ${inventoryResult.responseTime}ms`)
      console.log(`   库存数量: ${inventoryResult.data.data?.inventory?.length || 0}`)

      this.recordResult('库存系统-查询', true, inventoryResult.data, null, inventoryResult.responseTime)
    } else {
      console.log('❌ 用户库存查询失败')
      console.log(`   错误: ${inventoryResult.error}`)

      this.recordResult('库存系统-查询', false, null, inventoryResult.error, inventoryResult.responseTime)
    }
  }

  // 测试管理员系统
  async testAdminSystem () {
    if (!this.accessToken) {
      console.log('⚠️  跳过管理员系统测试 - 无访问Token')
      return
    }

    console.log('\n=== 测试管理员系统 ===')

    // 测试管理员仪表板
    const dashboardResult = await this.makeRequest('GET', '/api/v4/unified-engine/admin/dashboard', null, {
      Authorization: `Bearer ${this.accessToken}`
    })

    if (dashboardResult.success) {
      console.log('✅ 管理员仪表板成功')
      console.log(`   响应时间: ${dashboardResult.responseTime}ms`)

      this.recordResult('管理员系统-仪表板', true, dashboardResult.data, null, dashboardResult.responseTime)
    } else {
      console.log('❌ 管理员仪表板失败')
      console.log(`   错误: ${dashboardResult.error}`)

      this.recordResult('管理员系统-仪表板', false, null, dashboardResult.error, dashboardResult.responseTime)
    }
  }

  // === 运行所有测试 ===

  async runAllTests () {
    console.log('🚀 === 开始V4统一测试套件 ===')
    console.log(`📅 开始时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log('')

    try {
      // 1. 基础API测试
      await this.testHealthEndpoint()
      await this.testV4InfoEndpoint()

      // 2. 认证测试
      const authSuccess = await this.testAuthentication()
      if (authSuccess) {
        await this.testTokenRefresh()
      }

      // 3. 权限测试
      await this.testUserPermissions()
      await this.testPermissionAPI()

      // 4. 业务系统测试（如果认证成功）
      if (authSuccess) {
        await this.testLotterySystem()
        await this.testInventorySystem()
        await this.testAdminSystem()
      }

      // 5. 生成测试报告
      this.generateTestReport()
    } catch (error) {
      console.error('💥 测试执行失败:', error.message)
      throw error
    }
  }

  // 生成测试报告
  generateTestReport () {
    const endTime = Date.now()
    const duration = Math.round((endTime - this.startTime) / 1000)

    console.log('\n📊 === 测试报告 ===')
    console.log(`📅 完成时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log(`⏱️  测试耗时: ${duration}秒`)
    console.log('')

    const totalTests = this.results.length
    const successTests = this.results.filter(r => r.success).length
    const failedTests = totalTests - successTests
    const successRate = Math.round((successTests / totalTests) * 100)

    console.log(`📈 测试统计: ${successTests}/${totalTests} 成功 (${successRate}%)`)
    console.log('')

    // 详细结果
    console.log('📋 详细结果:')
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌'
      const time = result.responseTime ? `(${result.responseTime}ms)` : ''
      console.log(`   ${status} ${result.testName} ${time}`)
      if (!result.success && result.error) {
        console.log(`      错误: ${result.error}`)
      }
    })

    console.log('')
    if (successRate >= 90) {
      console.log('🎉 测试结果优秀！')
    } else if (successRate >= 70) {
      console.log('✅ 测试结果良好')
    } else {
      console.log('⚠️  测试结果需要改进')
    }

    return {
      totalTests,
      successTests,
      failedTests,
      successRate,
      duration,
      results: this.results
    }
  }
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  const testSuite = new UnifiedTestSuite()
  testSuite.runAllTests()
    .then(result => {
      process.exit(result?.successRate >= 70 ? 0 : 1)
    })
    .catch(error => {
      console.error('💥 测试执行失败:', error)
      process.exit(1)
    })
}

module.exports = UnifiedTestSuite
