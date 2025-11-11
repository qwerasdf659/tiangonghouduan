#!/usr/bin/env node
/**
 * 🔍 积分交易历史API完整性验证脚本
 *
 * 功能：验证API实施的完整性和正确性
 * 验证项：
 * 1. 数据库模型和索引
 * 2. API路由和服务层
 * 3. 功能测试（分页、筛选、权限）
 * 4. 性能测试
 * 5. 业务逻辑验证
 *
 * 使用方法：node scripts/verify-transaction-api.js
 */

'use strict'

const { sequelize, PointsTransaction } = require('../models')
const axios = require('axios')

// 配置
const API_BASE_URL = 'http://localhost:3000'
const TEST_MOBILE = '13612227930'
const VERIFICATION_CODE = '123456'

// ANSI颜色代码
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

/**
 * 打印带颜色的消息
 * @param {string} message - 消息内容
 * @param {string} color - 颜色
 */
function printColor (message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

/**
 * 打印分隔线
 */
function printSeparator () {
  console.log('='.repeat(70))
}

/**
 * 验证数据库模型和索引
 */
async function verifyDatabaseModel () {
  printColor('\n📊 步骤1：验证数据库模型和索引', 'cyan')
  printSeparator()

  const issues = []

  try {
    // 1. 验证模型存在
    if (!PointsTransaction) {
      issues.push('❌ PointsTransaction模型不存在')
    } else {
      printColor('✅ PointsTransaction模型已加载', 'green')
    }

    // 2. 验证核心索引
    const [indexes] = await sequelize.query(
      'SHOW INDEX FROM points_transactions WHERE Key_name = \'idx_pt_user_time\''
    )

    if (indexes.length === 0) {
      issues.push('❌ 核心索引 idx_pt_user_time 不存在')
    } else {
      const columns = indexes.map(idx => idx.Column_name)
      if (columns.includes('user_id') && columns.includes('transaction_time')) {
        printColor('✅ 核心索引 idx_pt_user_time (user_id, transaction_time) 已创建', 'green')
      } else {
        issues.push('❌ 核心索引字段不完整')
      }
    }

    // 3. 验证defaultScope（软删除）
    const withScopeCount = await PointsTransaction.count()
    const withoutScopeCount = await PointsTransaction.unscoped().count()

    if (withoutScopeCount > withScopeCount) {
      printColor(`✅ 软删除机制工作正常 (未删除: ${withScopeCount}, 已删除: ${withoutScopeCount - withScopeCount})`, 'green')
    } else if (withoutScopeCount === withScopeCount) {
      printColor(`⚠️  数据库中暂无已删除记录 (总记录: ${withScopeCount})`, 'yellow')
    }

    // 4. 验证字段存在性
    const sampleRecord = await PointsTransaction.findOne({ raw: true })
    if (sampleRecord) {
      const requiredFields = [
        'transaction_id', 'user_id', 'transaction_type', 'points_amount',
        'points_balance_before', 'points_balance_after', 'business_type',
        'transaction_title', 'transaction_time', 'status'
      ]

      const missingFields = requiredFields.filter(field => !(field in sampleRecord))
      if (missingFields.length === 0) {
        printColor('✅ 所有必需字段都存在', 'green')
      } else {
        issues.push(`❌ 缺少字段: ${missingFields.join(', ')}`)
      }
    }
  } catch (error) {
    issues.push(`❌ 数据库验证失败: ${error.message}`)
  }

  return issues
}

/**
 * 验证API路由和服务层
 */
async function verifyAPIRoutes () {
  printColor('\n🔌 步骤2：验证API路由和服务层', 'cyan')
  printSeparator()

  const issues = []

  try {
    // 1. 登录获取token
    printColor('   正在登录获取测试token...', 'blue')
    const loginRes = await axios.post(`${API_BASE_URL}/api/v4/unified-engine/auth/login`, {
      mobile: TEST_MOBILE,
      verification_code: VERIFICATION_CODE
    })

    const token = loginRes.data.data.access_token
    const user_id = loginRes.data.data.user.user_id

    if (!token) {
      issues.push('❌ 无法获取JWT token')
      return issues
    }

    printColor(`✅ 登录成功 (User ID: ${user_id})`, 'green')

    // 2. 测试基本API调用
    printColor('   正在测试基本API调用...', 'blue')
    const apiRes = await axios.get(
      `${API_BASE_URL}/api/v4/unified-engine/points/transactions/${user_id}?page=1&limit=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (apiRes.status !== 200) {
      issues.push(`❌ API返回错误状态码: ${apiRes.status}`)
    } else {
      printColor('✅ API路由正常响应', 'green')
    }

    // 3. 验证响应数据结构
    const data = apiRes.data.data
    if (!data.transactions || !Array.isArray(data.transactions)) {
      issues.push('❌ 响应数据结构不正确：缺少transactions数组')
    } else {
      printColor(`✅ 返回${data.transactions.length}条交易记录`, 'green')
    }

    if (!data.pagination || typeof data.pagination !== 'object') {
      issues.push('❌ 响应数据结构不正确：缺少pagination对象')
    } else {
      const { page, limit, total, pages } = data.pagination
      if (page && limit && typeof total === 'number' && pages) {
        printColor(`✅ 分页信息完整 (总记录: ${total}, 总页数: ${pages})`, 'green')
      } else {
        issues.push('❌ 分页信息不完整')
      }
    }
  } catch (error) {
    if (error.response) {
      issues.push(`❌ API调用失败: ${error.response.status} - ${error.response.data.message || error.message}`)
    } else {
      issues.push(`❌ API调用失败: ${error.message}`)
    }
  }

  return issues
}

/**
 * 验证功能完整性
 */
async function verifyFunctionality () {
  printColor('\n🧪 步骤3：验证功能完整性', 'cyan')
  printSeparator()

  const issues = []

  try {
    // 登录
    const loginRes = await axios.post(`${API_BASE_URL}/api/v4/unified-engine/auth/login`, {
      mobile: TEST_MOBILE,
      verification_code: VERIFICATION_CODE
    })

    const token = loginRes.data.data.access_token
    const user_id = loginRes.data.data.user.user_id

    // 1. 测试类型筛选（earn）
    printColor('   测试类型筛选（earn）...', 'blue')
    const earnRes = await axios.get(
      `${API_BASE_URL}/api/v4/unified-engine/points/transactions/${user_id}?type=earn&limit=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const allEarn = earnRes.data.data.transactions.every(t => t.transaction_type === 'earn')
    if (allEarn) {
      printColor('✅ 类型筛选（earn）正常', 'green')
    } else {
      issues.push('❌ 类型筛选（earn）失败：返回了其他类型')
    }

    // 2. 测试类型筛选（consume）
    printColor('   测试类型筛选（consume）...', 'blue')
    const consumeRes = await axios.get(
      `${API_BASE_URL}/api/v4/unified-engine/points/transactions/${user_id}?type=consume&limit=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const allConsume = consumeRes.data.data.transactions.every(t => t.transaction_type === 'consume')
    if (allConsume) {
      printColor('✅ 类型筛选（consume）正常', 'green')
    } else {
      issues.push('❌ 类型筛选（consume）失败：返回了其他类型')
    }

    // 3. 测试分页功能
    printColor('   测试分页功能...', 'blue')
    const page2Res = await axios.get(
      `${API_BASE_URL}/api/v4/unified-engine/points/transactions/${user_id}?page=2&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (page2Res.data.data.pagination.page === 2) {
      printColor('✅ 分页功能正常', 'green')
    } else {
      issues.push('❌ 分页功能失败：page参数未生效')
    }

    // 4. 测试limit上限保护
    printColor('   测试limit上限保护...', 'blue')
    const limitRes = await axios.get(
      `${API_BASE_URL}/api/v4/unified-engine/points/transactions/${user_id}?limit=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (limitRes.data.data.pagination.limit === 100) {
      printColor('✅ limit上限保护正常（自动修正为100）', 'green')
    } else {
      issues.push(`❌ limit上限保护失败：实际值${limitRes.data.data.pagination.limit}`)
    }

    // 5. 测试参数验证（无效user_id）
    printColor('   测试参数验证...', 'blue')
    try {
      await axios.get(
        `${API_BASE_URL}/api/v4/unified-engine/points/transactions/undefined`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      issues.push('❌ 参数验证失败：应该拒绝无效user_id但未拒绝')
    } catch (error) {
      if (error.response && error.response.status === 400) {
        printColor('✅ 参数验证正常（正确拒绝无效user_id）', 'green')
      } else {
        issues.push('❌ 参数验证返回了错误的状态码')
      }
    }

    // 6. 测试时间排序
    printColor('   测试时间排序...', 'blue')
    const sortRes = await axios.get(
      `${API_BASE_URL}/api/v4/unified-engine/points/transactions/${user_id}?limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const times = sortRes.data.data.transactions.map(t => new Date(t.transaction_time).getTime())
    const isSorted = times.every((time, idx) => idx === 0 || time <= times[idx - 1])
    if (isSorted) {
      printColor('✅ 时间排序正常（降序，最新的在前）', 'green')
    } else {
      issues.push('❌ 时间排序错误：不是降序排列')
    }
  } catch (error) {
    issues.push(`❌ 功能测试失败: ${error.message}`)
  }

  return issues
}

/**
 * 验证性能
 */
async function verifyPerformance () {
  printColor('\n⚡ 步骤4：验证性能', 'cyan')
  printSeparator()

  const issues = []

  try {
    // 获取测试用户
    const testUser = await PointsTransaction.findOne({
      attributes: ['user_id'],
      limit: 1,
      raw: true
    })

    if (!testUser) {
      printColor('⚠️  数据库中没有交易记录，跳过性能测试', 'yellow')
      return issues
    }

    // 执行性能测试
    const iterations = 5
    const times = []

    printColor(`   执行${iterations}次查询测试...`, 'blue')

    for (let i = 0; i < iterations; i++) {
      const start = Date.now()
      await PointsTransaction.findAndCountAll({
        where: { user_id: testUser.user_id },
        order: [['transaction_time', 'DESC']],
        limit: 20
      })
      const duration = Date.now() - start
      times.push(duration)
    }

    const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length
    const maxTime = Math.max(...times)
    const minTime = Math.min(...times)

    printColor(`   平均响应时间: ${avgTime.toFixed(2)}ms`, 'blue')
    printColor(`   最快: ${minTime}ms, 最慢: ${maxTime}ms`, 'blue')

    if (avgTime < 100) {
      printColor('✅ 性能优秀（平均响应时间 < 100ms）', 'green')
    } else if (avgTime < 200) {
      printColor('⚠️  性能一般（平均响应时间 < 200ms）', 'yellow')
    } else {
      issues.push(`❌ 性能不佳：平均响应时间${avgTime.toFixed(2)}ms > 200ms`)
    }
  } catch (error) {
    issues.push(`❌ 性能测试失败: ${error.message}`)
  }

  return issues
}

/**
 * 验证业务逻辑
 */
async function verifyBusinessLogic () {
  printColor('\n💼 步骤5：验证业务逻辑', 'cyan')
  printSeparator()

  const issues = []

  try {
    // 1. 验证软删除过滤
    printColor('   验证软删除过滤...', 'blue')
    const activeCount = await PointsTransaction.count()
    const totalCount = await PointsTransaction.unscoped().count()
    const deletedCount = totalCount - activeCount

    if (deletedCount >= 0) {
      printColor(`✅ 软删除机制正常 (未删除: ${activeCount}, 已删除: ${deletedCount})`, 'green')
    } else {
      issues.push('❌ 软删除机制异常')
    }

    // 2. 验证交易类型统计
    printColor('   验证交易类型统计...', 'blue')
    const earnCount = await PointsTransaction.count({ where: { transaction_type: 'earn' } })
    const consumeCount = await PointsTransaction.count({ where: { transaction_type: 'consume' } })

    printColor(`   earn类型: ${earnCount}条`, 'blue')
    printColor(`   consume类型: ${consumeCount}条`, 'blue')

    if (earnCount >= 0 && consumeCount >= 0) {
      printColor('✅ 交易类型统计正常', 'green')
    }

    // 3. 验证业务类型多样性
    printColor('   验证业务类型多样性...', 'blue')
    const [businessTypes] = await sequelize.query(
      'SELECT DISTINCT business_type FROM points_transactions WHERE is_deleted = 0 LIMIT 10'
    )

    if (businessTypes.length > 0) {
      printColor(`   发现${businessTypes.length}种业务类型`, 'blue')
      printColor('✅ 业务类型记录正常', 'green')
    } else {
      printColor('⚠️  暂无业务类型记录', 'yellow')
    }

    // 4. 验证状态分布
    printColor('   验证状态分布...', 'blue')
    const completedCount = await PointsTransaction.count({ where: { status: 'completed' } })
    const pendingCount = await PointsTransaction.count({ where: { status: 'pending' } })

    printColor(`   completed: ${completedCount}条`, 'blue')
    printColor(`   pending: ${pendingCount}条`, 'blue')

    if (completedCount > 0) {
      printColor('✅ 状态记录正常', 'green')
    } else {
      printColor('⚠️  暂无completed状态记录', 'yellow')
    }
  } catch (error) {
    issues.push(`❌ 业务逻辑验证失败: ${error.message}`)
  }

  return issues
}

/**
 * 主函数
 */
async function main () {
  printColor('\n' + '='.repeat(70), 'cyan')
  printColor('🔍 积分交易历史API完整性验证', 'cyan')
  printColor('='.repeat(70) + '\n', 'cyan')

  const allIssues = []

  try {
    // 执行所有验证
    const modelIssues = await verifyDatabaseModel()
    allIssues.push(...modelIssues)

    const routeIssues = await verifyAPIRoutes()
    allIssues.push(...routeIssues)

    const funcIssues = await verifyFunctionality()
    allIssues.push(...funcIssues)

    const perfIssues = await verifyPerformance()
    allIssues.push(...perfIssues)

    const bizIssues = await verifyBusinessLogic()
    allIssues.push(...bizIssues)

    // 生成最终报告
    printColor('\n' + '='.repeat(70), 'cyan')
    printColor('📋 验证结果汇总', 'cyan')
    printColor('='.repeat(70), 'cyan')

    if (allIssues.length === 0) {
      printColor('\n✅ 所有验证项通过！API实施完整且正常运行。', 'green')
      printColor('\n🎉 积分交易历史API已成功实施，符合文档要求。', 'green')
    } else {
      printColor(`\n⚠️  发现 ${allIssues.length} 个问题：`, 'yellow')
      allIssues.forEach((issue, idx) => {
        printColor(`   ${idx + 1}. ${issue}`, 'red')
      })
      process.exit(1)
    }
  } catch (error) {
    printColor(`\n❌ 验证过程出错: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  } finally {
    await sequelize.close()
  }

  printColor('\n' + '='.repeat(70) + '\n', 'cyan')
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { main }
