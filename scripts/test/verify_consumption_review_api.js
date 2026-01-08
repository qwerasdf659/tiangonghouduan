#!/usr/bin/env node
/**
 * 消费记录审核业务流程验证脚本
 *
 * 业务场景：
 * 1. 商家扫描用户二维码录入消费记录
 * 2. 管理员审核消费记录（通过/拒绝）
 * 3. 审核通过后自动奖励积分
 *
 * 测试账号：13612227930（既是用户也是管理员）
 *
 * 创建时间：2026年01月09日
 */

'use strict'

require('dotenv').config()
const axios = require('axios')
const crypto = require('crypto')

// 配置
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_MOBILE = '13612227930'
const VERIFICATION_CODE = '123456' // 开发环境万能验证码

// 辅助函数：生成幂等键
function generateIdempotencyKey(prefix = 'test') {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 8)
  return `${prefix}_${timestamp}_${random}`
}

// 辅助函数：创建HTTP客户端
function createClient(token = null) {
  const headers = {
    'Content-Type': 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers,
    validateStatus: () => true // 不抛出HTTP错误
  })
}

// 辅助函数：延迟
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 辅助函数：格式化响应
function formatResponse(response) {
  return {
    status: response.status,
    success: response.data?.success,
    code: response.data?.code,
    message: response.data?.message,
    data: response.data?.data
  }
}

/**
 * 主测试流程
 */
async function runTest() {
  console.log('='.repeat(70))
  console.log('🧪 消费记录审核业务流程验证')
  console.log('='.repeat(70))
  console.log(`📍 API地址: ${BASE_URL}`)
  console.log(`📱 测试账号: ${TEST_MOBILE}`)
  console.log(`⏰ 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log('='.repeat(70))

  let adminToken = null
  let userInfo = null
  let testQRCode = null
  let testRecordId = null
  let testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  }

  // 测试结果记录函数
  function recordTest(name, passed, message = '') {
    testResults.total++
    if (passed === true) {
      testResults.passed++
      console.log(`✅ ${name}${message ? ': ' + message : ''}`)
    } else if (passed === false) {
      testResults.failed++
      console.log(`❌ ${name}${message ? ': ' + message : ''}`)
    } else {
      testResults.skipped++
      console.log(`⚠️ ${name}: 跳过 - ${message}`)
    }
  }

  try {
    // ====== 步骤1：登录获取Token ======
    console.log('\n📌 步骤1：登录获取Token')
    console.log('-'.repeat(50))

    const client = createClient()

    // 登录（开发环境使用万能验证码123456）
    // POST /api/v4/auth/login
    // 参数: mobile（手机号）, verification_code（验证码）
    const loginRes = await client.post('/api/v4/auth/login', {
      mobile: TEST_MOBILE,
      verification_code: VERIFICATION_CODE
    })

    if (loginRes.status === 200 && loginRes.data.success) {
      // 响应结构: { success: true, data: { access_token, user: {...} } }
      adminToken = loginRes.data.data.access_token
      userInfo = loginRes.data.data.user
      recordTest('登录', true, `user_id=${userInfo.user_id}`)
      console.log(`  用户UUID: ${userInfo.user_uuid?.substring(0, 8)}...`)
    } else {
      console.log('  登录响应:', JSON.stringify(loginRes.data, null, 2))
      recordTest('登录', false, loginRes.data?.message || '登录失败')
      throw new Error('登录失败，无法继续测试')
    }

    // ====== 步骤2：生成用户二维码 ======
    console.log('\n📌 步骤2：生成用户二维码')
    console.log('-'.repeat(50))

    const authClient = createClient(adminToken)

    const qrRes = await authClient.get(`/api/v4/shop/consumption/qrcode/${userInfo.user_id}`)
    if (qrRes.status === 200 && qrRes.data.success && qrRes.data.data.qr_code) {
      testQRCode = qrRes.data.data.qr_code
      recordTest('生成二维码', true, `QR码长度=${testQRCode.length}`)
      console.log(`  二维码: ${testQRCode.substring(0, 50)}...`)
    } else {
      recordTest('生成二维码', false, qrRes.data?.message || '生成失败')
      throw new Error('生成二维码失败，无法继续测试')
    }

    // ====== 步骤3：验证二维码获取用户信息 ======
    console.log('\n📌 步骤3：验证二维码获取用户信息')
    console.log('-'.repeat(50))

    const userInfoRes = await authClient.get('/api/v4/shop/consumption/user-info', {
      params: { qr_code: testQRCode }
    })
    if (userInfoRes.status === 200 && userInfoRes.data.success) {
      recordTest('验证二维码', true, `用户昵称=${userInfoRes.data.data.nickname}`)
    } else {
      recordTest('验证二维码', false, userInfoRes.data?.message || '验证失败')
    }

    // ====== 步骤4：商家提交消费记录 ======
    console.log('\n📌 步骤4：商家提交消费记录')
    console.log('-'.repeat(50))

    const consumptionAmount = 88.5
    const expectedPoints = Math.round(consumptionAmount) // 89积分
    const idempotencyKey = generateIdempotencyKey('consumption_submit')

    const submitRes = await authClient.post(
      '/api/v4/shop/consumption/submit',
      {
        qr_code: testQRCode,
        consumption_amount: consumptionAmount,
        merchant_notes: '测试消费：2份套餐'
      },
      {
        headers: {
          'Idempotency-Key': idempotencyKey
        }
      }
    )

    console.log('  提交响应:', JSON.stringify(formatResponse(submitRes), null, 2))

    if (submitRes.status === 200 && submitRes.data.success) {
      testRecordId = submitRes.data.data.record_id
      recordTest(
        '提交消费记录',
        true,
        `record_id=${testRecordId}, 预计积分=${submitRes.data.data.points_to_award}`
      )

      // 验证积分计算
      if (submitRes.data.data.points_to_award === expectedPoints) {
        recordTest('积分计算验证', true, `88.50元→${expectedPoints}积分`)
      } else {
        recordTest(
          '积分计算验证',
          false,
          `期望${expectedPoints}，实际${submitRes.data.data.points_to_award}`
        )
      }
    } else {
      recordTest('提交消费记录', false, submitRes.data?.message || '提交失败')
      // 如果是幂等回放或防误操作限制，继续测试其他功能
      if (
        submitRes.data?.message?.includes('幂等') ||
        submitRes.data?.message?.includes('防止误操作')
      ) {
        console.log('  ⚠️ 触发幂等保护，尝试查询现有记录')
      }
    }

    // ====== 步骤5：查询待审核记录列表 ======
    console.log('\n📌 步骤5：查询待审核记录列表（管理员功能）')
    console.log('-'.repeat(50))

    const pendingRes = await authClient.get('/api/v4/shop/consumption/pending', {
      params: { page: 1, page_size: 10 }
    })

    console.log('  待审核列表响应:', JSON.stringify(formatResponse(pendingRes), null, 2))

    if (pendingRes.status === 200 && pendingRes.data.success) {
      const pendingCount = pendingRes.data.data.records?.length || 0
      const totalCount = pendingRes.data.data.pagination?.total || 0
      recordTest('查询待审核列表', true, `待审核记录数=${totalCount}`)

      // 如果没有通过步骤4创建记录，尝试从待审核列表获取
      if (!testRecordId && pendingCount > 0) {
        testRecordId = pendingRes.data.data.records[0].record_id
        console.log(`  使用现有待审核记录: record_id=${testRecordId}`)
      }
    } else {
      recordTest('查询待审核列表', false, pendingRes.data?.message || '查询失败')
    }

    // ====== 步骤6：管理员查询所有消费记录 ======
    console.log('\n📌 步骤6：管理员查询所有消费记录')
    console.log('-'.repeat(50))

    const adminRecordsRes = await authClient.get('/api/v4/shop/consumption/admin/records', {
      params: { page: 1, page_size: 10, status: 'pending' }
    })

    console.log('  管理员记录列表响应:', JSON.stringify(formatResponse(adminRecordsRes), null, 2))

    if (adminRecordsRes.status === 200 && adminRecordsRes.data.success) {
      const stats = adminRecordsRes.data.data.statistics
      recordTest('查询管理员记录', true, `待审核=${stats?.pending || 0}, 今日=${stats?.today || 0}`)
    } else {
      recordTest('查询管理员记录', false, adminRecordsRes.data?.message || '查询失败')
    }

    // ====== 步骤7：审核通过消费记录 ======
    if (testRecordId) {
      console.log('\n📌 步骤7：管理员审核通过消费记录')
      console.log('-'.repeat(50))

      const approveRes = await authClient.post(`/api/v4/shop/consumption/approve/${testRecordId}`, {
        admin_notes: '测试审核通过，金额核实无误'
      })

      console.log('  审核通过响应:', JSON.stringify(formatResponse(approveRes), null, 2))

      if (approveRes.status === 200 && approveRes.data.success) {
        recordTest(
          '审核通过',
          true,
          `奖励积分=${approveRes.data.data.points_awarded}, 新余额=${approveRes.data.data.new_balance}`
        )
      } else {
        // 可能已经审核过了
        if (
          approveRes.data?.message?.includes('不能审核') ||
          approveRes.data?.message?.includes('已审核')
        ) {
          recordTest('审核通过', null, '记录已被审核过')
        } else {
          recordTest('审核通过', false, approveRes.data?.message || '审核失败')
        }
      }
    } else {
      recordTest('审核通过', null, '无可用的待审核记录')
    }

    // ====== 步骤8：创建新记录用于拒绝测试 ======
    console.log('\n📌 步骤8：创建新记录用于拒绝测试')
    console.log('-'.repeat(50))

    const rejectIdempotencyKey = generateIdempotencyKey('consumption_reject_test')
    const rejectSubmitRes = await authClient.post(
      '/api/v4/shop/consumption/submit',
      {
        qr_code: testQRCode,
        consumption_amount: 50.0,
        merchant_notes: '用于拒绝测试的消费记录'
      },
      {
        headers: {
          'Idempotency-Key': rejectIdempotencyKey
        }
      }
    )

    let rejectTestRecordId = null
    if (rejectSubmitRes.status === 200 && rejectSubmitRes.data.success) {
      rejectTestRecordId = rejectSubmitRes.data.data.record_id
      recordTest('创建拒绝测试记录', true, `record_id=${rejectTestRecordId}`)
    } else {
      recordTest('创建拒绝测试记录', null, rejectSubmitRes.data?.message || '创建失败（可能受限）')
    }

    // ====== 步骤9：审核拒绝消费记录 ======
    if (rejectTestRecordId) {
      console.log('\n📌 步骤9：管理员审核拒绝消费记录')
      console.log('-'.repeat(50))

      const rejectRes = await authClient.post(
        `/api/v4/shop/consumption/reject/${rejectTestRecordId}`,
        {
          admin_notes: '测试审核拒绝：消费金额与实际不符'
        }
      )

      console.log('  审核拒绝响应:', JSON.stringify(formatResponse(rejectRes), null, 2))

      if (rejectRes.status === 200 && rejectRes.data.success) {
        recordTest(
          '审核拒绝',
          true,
          `拒绝原因=${rejectRes.data.data.reject_reason?.substring(0, 20)}...`
        )
      } else {
        recordTest('审核拒绝', false, rejectRes.data?.message || '拒绝失败')
      }
    } else {
      recordTest('审核拒绝', null, '无可用的待审核记录')
    }

    // ====== 步骤10：用户查询自己的消费记录 ======
    console.log('\n📌 步骤10：用户查询自己的消费记录')
    console.log('-'.repeat(50))

    const userRecordsRes = await authClient.get(
      `/api/v4/shop/consumption/user/${userInfo.user_id}`,
      {
        params: { page: 1, page_size: 10 }
      }
    )

    console.log('  用户记录列表响应:', JSON.stringify(formatResponse(userRecordsRes), null, 2))

    if (userRecordsRes.status === 200 && userRecordsRes.data.success) {
      const recordCount = userRecordsRes.data.data.records?.length || 0
      const stats = userRecordsRes.data.data.stats
      recordTest(
        '查询用户记录',
        true,
        `记录数=${recordCount}, 通过=${stats?.approved_count || 0}, 拒绝=${stats?.rejected_count || 0}`
      )
    } else {
      recordTest('查询用户记录', false, userRecordsRes.data?.message || '查询失败')
    }

    // ====== 步骤11：再次查询待审核和统计数据 ======
    console.log('\n📌 步骤11：最终状态验证')
    console.log('-'.repeat(50))

    const finalAdminRecordsRes = await authClient.get('/api/v4/shop/consumption/admin/records', {
      params: { page: 1, page_size: 10, status: 'all' }
    })

    if (finalAdminRecordsRes.status === 200 && finalAdminRecordsRes.data.success) {
      const stats = finalAdminRecordsRes.data.data.statistics
      console.log('  📊 最终统计数据:')
      console.log(`     待审核: ${stats?.pending || 0}`)
      console.log(`     今日审核: ${stats?.today || 0}`)
      console.log(`     已通过: ${stats?.approved || 0}`)
      console.log(`     已拒绝: ${stats?.rejected || 0}`)
      recordTest('最终状态验证', true)
    } else {
      recordTest('最终状态验证', false, finalAdminRecordsRes.data?.message || '验证失败')
    }
  } catch (error) {
    console.error('\n❌ 测试过程中发生错误:', error.message)
    if (error.response) {
      console.error('  响应状态:', error.response.status)
      console.error('  响应数据:', JSON.stringify(error.response.data, null, 2))
    }
  }

  // ====== 测试结果汇总 ======
  console.log('\n' + '='.repeat(70))
  console.log('📊 测试结果汇总')
  console.log('='.repeat(70))
  console.log(`  总测试数: ${testResults.total}`)
  console.log(`  ✅ 通过: ${testResults.passed}`)
  console.log(`  ❌ 失败: ${testResults.failed}`)
  console.log(`  ⚠️ 跳过: ${testResults.skipped}`)
  console.log('='.repeat(70))

  // 数据库数据验证
  console.log('\n📌 数据库数据验证')
  console.log('-'.repeat(50))

  try {
    const { Sequelize } = require('sequelize')
    const sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: false
      }
    )

    const [countResult] = await sequelize.query('SELECT COUNT(*) as count FROM consumption_records')
    const [statusStats] = await sequelize.query(
      'SELECT status, COUNT(*) as count FROM consumption_records GROUP BY status'
    )

    console.log(`  消费记录总数: ${countResult[0].count}`)
    console.log('  按状态分组:')
    if (statusStats.length === 0) {
      console.log('    暂无数据')
    } else {
      statusStats.forEach(stat => {
        console.log(`    ${stat.status}: ${stat.count}条`)
      })
    }

    await sequelize.close()
  } catch (dbError) {
    console.log(`  ❌ 数据库验证失败: ${dbError.message}`)
  }

  console.log('\n✅ 消费记录审核业务流程验证完成')

  // 返回退出码
  process.exit(testResults.failed > 0 ? 1 : 0)
}

// 执行测试
runTest().catch(error => {
  console.error('测试脚本异常:', error)
  process.exit(1)
})
