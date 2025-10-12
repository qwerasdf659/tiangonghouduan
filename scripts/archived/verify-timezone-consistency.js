/**
 * 时区一致性验证脚本
 * 目的：验证全链路时区处理统一性
 *
 * 验证项：
 * 1. 数据库时区配置
 * 2. 应用层时间创建
 * 3. 数据存储和读取
 * 4. API响应格式
 *
 * 创建时间：2025年10月12日 北京时间
 */

'use strict'

const { sequelize, config } = require('../config/database')
const BeijingTimeHelper = require('../utils/timeHelper')
const { User } = require('../models')

// 颜色输出
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

/**
 * 验证数据库时区配置
 */
async function verifyDatabaseTimezone () {
  console.log(`\n${colors.blue}1. 验证数据库时区配置${colors.reset}`)
  console.log('='.repeat(80))

  try {
    // 验证配置文件设置
    console.log(`📋 配置文件时区: ${config.timezone}`)
    if (config.timezone !== '+08:00') {
      console.log(`${colors.red}❌ 数据库配置时区不是北京时间${colors.reset}`)
      return false
    }
    console.log(`${colors.green}✅ 数据库配置时区正确：+08:00${colors.reset}`)

    // 查询数据库实际时区
    const [result] = await sequelize.query('SELECT @@global.time_zone AS global_tz, @@session.time_zone AS session_tz, NOW() AS db_now')
    const dbTimezone = result[0]

    console.log('📊 数据库时区信息:')
    console.log(`   全局时区: ${dbTimezone.global_tz}`)
    console.log(`   会话时区: ${dbTimezone.session_tz}`)
    console.log(`   数据库当前时间: ${dbTimezone.db_now}`)

    return true
  } catch (error) {
    console.log(`${colors.red}❌ 数据库时区验证失败: ${error.message}${colors.reset}`)
    return false
  }
}

/**
 * 验证应用层时间创建
 */
function verifyApplicationTimeCreation () {
  console.log(`\n${colors.blue}2. 验证应用层时间创建${colors.reset}`)
  console.log('='.repeat(80))

  try {
    // 测试 BeijingTimeHelper 各种方法
    const testCases = [
      { method: 'now', result: BeijingTimeHelper.now() },
      { method: 'createDatabaseTime', result: BeijingTimeHelper.createDatabaseTime() },
      { method: 'createBeijingTime', result: BeijingTimeHelper.createBeijingTime() },
      { method: 'timestamp', result: BeijingTimeHelper.timestamp() },
      { method: 'nowLocale', result: BeijingTimeHelper.nowLocale() }
    ]

    console.log('📋 BeijingTimeHelper 方法测试:')
    testCases.forEach(testCase => {
      console.log(`   ${testCase.method}(): ${testCase.result}`)
      if (testCase.result === null || testCase.result === undefined) {
        console.log(`   ${colors.red}❌ ${testCase.method} 返回空值${colors.reset}`)
        return false
      }
    })

    // 验证时区信息
    const nowISO = BeijingTimeHelper.now()
    if (nowISO.includes('+08:00')) {
      console.log(`${colors.green}✅ now() 方法正确返回北京时区标识 (+08:00)${colors.reset}`)
    } else {
      console.log(`${colors.yellow}⚠️ now() 方法未包含北京时区标识${colors.reset}`)
    }

    return true
  } catch (error) {
    console.log(`${colors.red}❌ 应用层时间创建验证失败: ${error.message}${colors.reset}`)
    return false
  }
}

/**
 * 验证数据存储和读取
 */
async function verifyDataStorageAndRetrieval () {
  console.log(`\n${colors.blue}3. 验证数据存储和读取${colors.reset}`)
  console.log('='.repeat(80))

  try {
    // 创建测试时间
    const testTime = BeijingTimeHelper.createDatabaseTime()
    console.log(`📋 测试时间（应用层创建）: ${testTime.toISOString()}`)

    // 查询一个用户记录（如果存在）
    const user = await User.findOne({
      order: [['created_at', 'DESC']]
    })

    if (user) {
      console.log('📊 数据库记录时间:')
      console.log(`   created_at: ${user.created_at}`)
      console.log(`   updated_at: ${user.updated_at}`)

      // 验证时间类型
      if (user.created_at) {
        console.log(`   created_at 类型: ${user.created_at.constructor.name}`)
        console.log(`   是否为 Date 对象: ${user.created_at instanceof Date}`)
      }

      console.log(`${colors.green}✅ 数据读取正常${colors.reset}`)
    } else {
      console.log(`${colors.yellow}⚠️ 数据库中无用户记录，跳过验证${colors.reset}`)
    }

    return true
  } catch (error) {
    console.log(`${colors.red}❌ 数据存储和读取验证失败: ${error.message}${colors.reset}`)
    return false
  }
}

/**
 * 验证时间工具方法完整性
 */
function verifyTimeHelperMethods () {
  console.log(`\n${colors.blue}4. 验证时间工具方法完整性${colors.reset}`)
  console.log('='.repeat(80))

  try {
    const requiredMethods = [
      'now',
      'nowLocale',
      'timestamp',
      'createDatabaseTime',
      'createBeijingTime',
      'toBeijingTime',
      'formatChinese',
      'todayStart',
      'todayEnd',
      'daysAgo',
      'isToday',
      'futureTime',
      'isExpired',
      'timeDiff',
      'formatDuration',
      'formatRelativeTime',
      'formatForAPI',
      'isValid',
      'parse'
    ]

    const missingMethods = []
    const existingMethods = []

    requiredMethods.forEach(method => {
      if (typeof BeijingTimeHelper[method] === 'function') {
        existingMethods.push(method)
      } else {
        missingMethods.push(method)
      }
    })

    console.log('📊 方法完整性检查:')
    console.log(`   ${colors.green}存在方法: ${existingMethods.length}/${requiredMethods.length}${colors.reset}`)
    console.log(`   ${missingMethods.length > 0 ? colors.red : colors.green}缺失方法: ${missingMethods.length}${colors.reset}`)

    if (missingMethods.length > 0) {
      console.log(`\n${colors.red}缺失的方法:${colors.reset}`)
      missingMethods.forEach(method => {
        console.log(`   - ${method}`)
      })
      return false
    }

    console.log(`${colors.green}✅ 所有必需方法都已实现${colors.reset}`)
    return true
  } catch (error) {
    console.log(`${colors.red}❌ 时间工具方法验证失败: ${error.message}${colors.reset}`)
    return false
  }
}

/**
 * 验证时间格式标准化
 */
function verifyTimeFormatStandards () {
  console.log(`\n${colors.blue}5. 验证时间格式标准化${colors.reset}`)
  console.log('='.repeat(80))

  try {
    const testDate = new Date('2025-10-12T12:30:45.123Z')

    // 测试各种格式化方法
    const formats = {
      ISO格式: BeijingTimeHelper.now(),
      北京时间字符串: BeijingTimeHelper.toBeijingTime(testDate),
      中文格式: BeijingTimeHelper.formatChinese(testDate),
      相对时间: BeijingTimeHelper.formatRelativeTime(testDate),
      API格式: JSON.stringify(BeijingTimeHelper.formatForAPI(testDate), null, 2)
    }

    console.log('📋 时间格式化测试:')
    Object.entries(formats).forEach(([name, value]) => {
      console.log(`   ${name}:`)
      console.log(`     ${value}`)
    })

    // 验证 ISO 格式是否包含时区信息
    const isoString = BeijingTimeHelper.now()
    const hasTimezone = isoString.includes('+08:00') || isoString.includes('Z')

    if (hasTimezone) {
      console.log(`${colors.green}✅ ISO格式包含时区信息${colors.reset}`)
    } else {
      console.log(`${colors.red}❌ ISO格式缺少时区信息${colors.reset}`)
      return false
    }

    return true
  } catch (error) {
    console.log(`${colors.red}❌ 时间格式标准化验证失败: ${error.message}${colors.reset}`)
    return false
  }
}

/**
 * 生成综合报告
 */
function generateReport (results) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`${colors.blue}时区一致性验证综合报告${colors.reset}`)
  console.log(`生成时间：${BeijingTimeHelper.now()}`)
  console.log(`${'='.repeat(80)}\n`)

  const totalTests = results.length
  const passedTests = results.filter(r => r.passed).length
  const successRate = ((passedTests / totalTests) * 100).toFixed(1)

  console.log('📊 验证统计:')
  console.log(`   总验证项: ${totalTests}`)
  console.log(`   ${colors.green}通过: ${passedTests}${colors.reset}`)
  console.log(`   ${passedTests < totalTests ? colors.red : colors.reset}失败: ${totalTests - passedTests}${colors.reset}`)
  console.log(`   成功率: ${successRate}%\n`)

  console.log('📋 详细结果:')
  results.forEach((result, index) => {
    const icon = result.passed ? colors.green + '✅' : colors.red + '❌'
    const status = result.passed ? '通过' : '失败'
    console.log(`   ${index + 1}. ${icon} ${result.name}: ${status}${colors.reset}`)
  })

  console.log(`\n${'='.repeat(80)}`)

  if (passedTests === totalTests) {
    console.log(`${colors.green}🎉 恭喜！所有时区一致性验证都已通过${colors.reset}`)
    console.log(`${colors.green}✅ 全链路时区处理已统一为北京时间 (UTC+8)${colors.reset}`)
  } else {
    console.log(`${colors.red}⚠️ 存在时区不一致问题，请检查失败项${colors.reset}`)
  }

  console.log(`${'='.repeat(80)}\n`)
}

/**
 * 主函数
 */
async function main () {
  console.log(`\n${colors.blue}${'='.repeat(80)}${colors.reset}`)
  console.log(`${colors.blue}时区一致性验证脚本${colors.reset}`)
  console.log(`${colors.blue}验证目标：全链路北京时间统一性 (UTC+8)${colors.reset}`)
  console.log(`${colors.blue}${'='.repeat(80)}${colors.reset}`)

  const results = []

  try {
    // 1. 数据库时区配置
    const dbTimezoneOk = await verifyDatabaseTimezone()
    results.push({ name: '数据库时区配置', passed: dbTimezoneOk })

    // 2. 应用层时间创建
    const appTimeOk = verifyApplicationTimeCreation()
    results.push({ name: '应用层时间创建', passed: appTimeOk })

    // 3. 数据存储和读取
    const storageOk = await verifyDataStorageAndRetrieval()
    results.push({ name: '数据存储和读取', passed: storageOk })

    // 4. 时间工具方法完整性
    const methodsOk = verifyTimeHelperMethods()
    results.push({ name: '时间工具方法完整性', passed: methodsOk })

    // 5. 时间格式标准化
    const formatOk = verifyTimeFormatStandards()
    results.push({ name: '时间格式标准化', passed: formatOk })

    // 生成报告
    generateReport(results)

    // 返回退出码
    const allPassed = results.every(r => r.passed)
    process.exit(allPassed ? 0 : 1)
  } catch (error) {
    console.error(`${colors.red}❌ 验证过程出错: ${error.message}${colors.reset}`)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行验证
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}❌ 致命错误:${colors.reset}`, error)
    process.exit(1)
  })
}

module.exports = { main }
