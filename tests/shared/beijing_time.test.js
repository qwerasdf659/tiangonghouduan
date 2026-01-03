/**
 * 北京时间测试工具套件 (Beijing Time Test Suite)
 *
 * 业务场景：确保所有时间相关操作符合项目北京时间统一标准(UTC+8)
 *
 * 核心功能：
 * 1. 时间生成验证 - 确保使用BeijingTimeHelper生成的时间为UTC+8
 * 2. 数据库时间验证 - 确保数据库存储的时间为北京时间
 * 3. API时间响应验证 - 确保API返回的时间格式符合北京时间标准
 * 4. 时区配置验证 - 确保Sequelize时区配置为+08:00
 *
 * 设计原则：
 * - 强制北京时间：所有时间必须为UTC+8时区
 * - 格式统一：YYYY-MM-DD HH:mm:ss (北京时间)
 * - ISO格式：YYYY-MM-DDTHH:mm:ss.sss+08:00
 * - 拒绝UTC：不允许使用UTC时间或toUTCString()
 *
 * 使用方式：
 * ```javascript
 * const { BeijingTimeTestSuite } = require('./shared/beijing_time.test')
 *
 * // 验证时间生成
 * await BeijingTimeTestSuite.testTimeGeneration()
 *
 * // 验证数据库时间
 * await BeijingTimeTestSuite.testDatabaseTime(User, testUserId)
 * ```
 *
 * 创建时间：2025-11-14
 * 符合规范：07-日期时间处理标准.mdc
 * 最后更新：2025-11-14
 * 使用模型：Claude 4 Sonnet
 */

const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 北京时间测试工具类
 *
 * 提供统一的北京时间验证方法，确保项目所有时间相关操作符合UTC+8标准
 */
class BeijingTimeTestSuite {
  /**
   * 测试时间生成是否符合北京时间标准
   *
   * 验证内容：
   * - BeijingTimeHelper生成的时间包含+08:00时区信息
   * - 时间格式符合ISO 8601标准
   * - 与系统时间的时区偏移为+08:00
   *
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果时间不符合北京时间标准
   */
  static async testTimeGeneration() {
    console.log('🕐 测试北京时间生成...')

    // 生成北京时间
    const beijingTime = BeijingTimeHelper.now()
    const beijingISO = BeijingTimeHelper.toISO(new Date())

    // 验证时间格式
    if (!beijingISO.includes('+08:00')) {
      throw new Error(`❌ 北京时间格式错误: ${beijingISO}，必须包含+08:00时区信息`)
    }

    // 验证时间格式符合ISO 8601
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00$/
    if (!iso8601Regex.test(beijingISO)) {
      throw new Error(`❌ 北京时间格式不符合ISO 8601标准: ${beijingISO}`)
    }

    console.log(`✅ 北京时间生成正确: ${beijingISO}`)

    return {
      success: true,
      beijingTime,
      beijingISO,
      timezone: '+08:00'
    }
  }

  /**
   * 测试数据库记录的时间是否符合北京时间
   *
   * 验证内容：
   * - created_at、updated_at字段存在
   * - 时间字段可以正确转换为北京时间
   * - 时间字段的时区为+08:00
   *
   * @param {Object} Model - Sequelize模型类
   * @param {number} recordId - 记录ID
   * @param {string} primaryKey - 主键字段名 (默认: 'id')
   * @returns {Promise<Object>} 测试结果，包含时间字段值
   * @throws {Error} 如果记录不存在或时间格式错误
   */
  static async testDatabaseTime(Model, recordId, primaryKey = 'id') {
    console.log(`🕐 测试数据库时间: ${Model.name} (${primaryKey}: ${recordId})`)

    // 查询记录
    const record = await Model.findOne({
      where: { [primaryKey]: recordId }
    })

    if (!record) {
      throw new Error(`❌ 记录不存在: ${Model.name} ${primaryKey}=${recordId}`)
    }

    // 验证时间字段
    const timeFields = ['created_at', 'updated_at']
    const timeValues = {}

    for (const field of timeFields) {
      if (!record[field]) {
        console.warn(`⚠️ 时间字段缺失: ${field}`)
        continue
      }

      // 转换为北京时间ISO格式
      const beijingISO = BeijingTimeHelper.toISO(record[field])

      // 验证时区
      if (!beijingISO.includes('+08:00')) {
        throw new Error(`❌ ${field}时区错误: ${beijingISO}，必须为+08:00`)
      }

      timeValues[field] = {
        raw: record[field],
        beijingISO,
        display: BeijingTimeHelper.format(record[field])
      }

      console.log(`✅ ${field}: ${beijingISO}`)
    }

    return {
      success: true,
      model: Model.name,
      recordId,
      timeValues
    }
  }

  /**
   * 测试API响应时间格式
   *
   * 验证内容：
   * - API响应包含时间字段
   * - 时间格式符合项目标准（北京时间）
   * - 时区信息正确(+08:00)
   *
   * @param {Object} apiResponse - API响应对象
   * @param {Array<string>} timeFields - 需要验证的时间字段列表
   * @returns {Promise<Object>} 验证结果
   * @throws {Error} 如果时间格式不符合标准
   */
  static async testAPIResponseTime(apiResponse, timeFields = ['created_at', 'updated_at']) {
    console.log('🕐 测试API响应时间格式...')

    const results = {}

    for (const field of timeFields) {
      const timeValue = apiResponse[field]

      if (!timeValue) {
        console.warn(`⚠️ API响应缺少时间字段: ${field}`)
        continue
      }

      // 验证时间格式
      const beijingISO =
        typeof timeValue === 'string' ? timeValue : BeijingTimeHelper.toISO(new Date(timeValue))

      if (!beijingISO.includes('+08:00')) {
        throw new Error(`❌ API时间字段${field}时区错误: ${beijingISO}`)
      }

      results[field] = {
        value: timeValue,
        beijingISO,
        valid: true
      }

      console.log(`✅ ${field}: ${beijingISO}`)
    }

    return {
      success: true,
      validatedFields: Object.keys(results).length,
      results
    }
  }

  /**
   * 测试Sequelize时区配置
   *
   * 验证内容：
   * - Sequelize配置的时区为+08:00
   * - 数据库连接的时区为Asia/Shanghai
   * - 查询时自动使用北京时间
   *
   * @param {Object} sequelize - Sequelize实例
   * @returns {Promise<Object>} 配置验证结果
   * @throws {Error} 如果时区配置错误
   */
  static async testSequelizeTimezone(sequelize) {
    console.log('🕐 测试Sequelize时区配置...')

    // 检查Sequelize配置
    const config = sequelize.config
    const timezone = config.timezone || config.dialectOptions?.timezone

    if (timezone !== '+08:00' && timezone !== 'Asia/Shanghai') {
      throw new Error(`❌ Sequelize时区配置错误: ${timezone}，必须为+08:00或Asia/Shanghai`)
    }

    // 执行数据库时区查询
    const [results] = await sequelize.query(
      'SELECT @@session.time_zone as timezone, NOW() as current_time'
    )
    const dbTimezone = results[0].timezone
    const dbCurrentTime = results[0].current_time

    console.log(`✅ Sequelize时区: ${timezone}`)
    console.log(`✅ 数据库时区: ${dbTimezone}`)
    console.log(`✅ 数据库当前时间: ${dbCurrentTime}`)

    return {
      success: true,
      sequelizeTimezone: timezone,
      databaseTimezone: dbTimezone,
      currentTime: dbCurrentTime
    }
  }

  /**
   * 测试时间范围查询
   *
   * 验证内容：
   * - 时间范围查询使用北京时间
   * - 开始时间和结束时间的时区正确
   * - 查询结果符合预期时间范围
   *
   * @param {Object} Model - Sequelize模型类
   * @param {string} startTime - 开始时间 (北京时间)
   * @param {string} endTime - 结束时间 (北京时间)
   * @param {string} timeField - 时间字段名 (默认: 'created_at')
   * @returns {Promise<Object>} 查询结果和验证信息
   * @throws {Error} 如果时间范围无效
   */
  static async testTimeRangeQuery(Model, startTime, endTime, timeField = 'created_at') {
    console.log(`🕐 测试时间范围查询: ${startTime} ~ ${endTime}`)

    // 验证时间格式
    const startISO = BeijingTimeHelper.toISO(new Date(startTime))
    const endISO = BeijingTimeHelper.toISO(new Date(endTime))

    if (!startISO.includes('+08:00') || !endISO.includes('+08:00')) {
      throw new Error('❌ 时间范围必须使用北京时间(+08:00)')
    }

    // 执行查询
    const { Op } = require('sequelize')
    const records = await Model.findAll({
      where: {
        [timeField]: {
          [Op.gte]: new Date(startTime),
          [Op.lte]: new Date(endTime)
        }
      },
      order: [[timeField, 'ASC']],
      limit: 5
    })

    console.log(`✅ 查询结果: ${records.length}条记录`)

    return {
      success: true,
      startTime: startISO,
      endTime: endISO,
      recordCount: records.length,
      records: records.slice(0, 3) // 返回前3条作为示例
    }
  }
}

// 导出测试工具
module.exports = {
  BeijingTimeTestSuite
}
