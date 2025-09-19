#!/usr/bin/env node

/**
 * V4认证API测试脚本（重构版）
 * 🔐 使用TestAccountManager确保测试账号固定化
 * 🎯 防止测试账号被意外修改
 * 📊 基于数据驱动验证的配置
 */

const axios = require('axios')
const { getTestAccountManager } = require('../utils/TestAccountManager')

async function testV4Auth () {
  try {
    console.log('🧪 开始测试V4认证API...')
    console.log('🔐 使用固定化测试账号配置\n')

    // 🛡️ 获取受保护的测试配置（数据库验证 + 完整性检查）
    const testAccountManager = getTestAccountManager()
    const config = await testAccountManager.createProtectedTestRequestConfig()
    const testAccount = config.testAccount

    console.log('📊 配置报告:')
    console.log(`   🔒 保护级别: ${config.metadata.protection_level}`)
    console.log(`   📅 验证时间: ${config.metadata.validated_at}`)
    console.log(`   📋 配置版本: ${config.metadata.config_version}`)
    console.log(`   🗄️ 数据来源: ${config.metadata.data_source}\n`)

    // 🚀 执行API测试
    const response = await axios.post('http://localhost:3000/api/v4/unified-engine/admin/auth', {
      phone: testAccount.mobile,
      verification_code: testAccount.verification_code
    })

    console.log('✅ V4认证API测试成功!')
    console.log('📊 响应数据:')
    console.log(`   状态码: ${response.status}`)
    console.log(`   引擎版本: ${response.data.data?.engine_version}`)
    console.log(`   返回用户ID: ${response.data.data?.user?.user_id}`)
    console.log(`   管理员权限: ${response.data.data?.user?.is_admin ? '是' : '否'}`)
    console.log(`   积分信息: ${response.data.data?.points?.available_points}`)
    console.log(`   Token长度: ${response.data.data?.token?.length}`)

    // 🔍 数据一致性验证（数据驱动验证）
    const returnedUserId = response.data.data?.user?.user_id
    const returnedMobile = response.data.data?.user?.mobile

    console.log('\n🔍 数据一致性验证:')
    if (returnedUserId !== testAccount.user_id) {
      console.log('⚠️ 警告: 返回的user_id不匹配!')
      console.log(`   期望: ${testAccount.user_id}, 实际: ${returnedUserId}`)
    } else {
      console.log('✅ user_id匹配正确')
    }

    if (returnedMobile !== testAccount.mobile) {
      console.log('⚠️ 警告: 返回的mobile不匹配!')
      console.log(`   期望: ${testAccount.mobile}, 实际: ${returnedMobile}`)
    } else {
      console.log('✅ mobile匹配正确')
    }

    // 🎯 业务验证（真正验证用户关心的功能）
    console.log('\n🎯 业务功能验证:')
    const isValidAuth = response.data.success === true
    const hasToken = response.data.data?.token && response.data.data.token.length > 0
    const hasUserInfo = response.data.data?.user && response.data.data.user.user_id
    const hasPointsInfo =
      response.data.data?.points && typeof response.data.data.points.available_points === 'number'

    console.log(`   认证状态: ${isValidAuth ? '✅ 成功' : '❌ 失败'}`)
    console.log(`   Token获取: ${hasToken ? '✅ 成功' : '❌ 失败'}`)
    console.log(`   用户信息: ${hasUserInfo ? '✅ 完整' : '❌ 缺失'}`)
    console.log(`   积分信息: ${hasPointsInfo ? '✅ 完整' : '❌ 缺失'}`)

    if (isValidAuth && hasToken && hasUserInfo && hasPointsInfo) {
      console.log('\n🎉 所有业务验证通过！用户可以正常登录使用系统。')
    } else {
      console.log('\n⚠️ 部分业务验证失败，可能影响用户使用！')
    }
  } catch (error) {
    console.log('❌ V4认证API测试失败!')

    if (error.response) {
      console.log('\n📊 错误响应:')
      console.log(`   状态码: ${error.response.status}`)
      console.log(`   错误信息: ${error.response.data?.message || error.response.data?.error}`)
      console.log(`   完整响应: ${JSON.stringify(error.response.data, null, 2)}`)
    } else if (error.message.includes('禁止') || error.message.includes('错误的测试账号')) {
      console.log('\n🚨 测试账号配置错误:')
      console.log(`   ${error.message}`)
      console.log('   解决方案: 检查TestAccountManager配置')
    } else {
      console.log('\n🔍 网络/系统错误:')
      console.log(`   错误信息: ${error.message}`)
    }
  }
}

// 🚀 执行测试（如果直接运行脚本）
if (require.main === module) {
  testV4Auth()
}

module.exports = { testV4Auth }
