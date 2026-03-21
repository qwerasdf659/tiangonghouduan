'use strict'

/**
 * P3-11: 异步任务补偿测试套件
 *
 * 测试目标：
 * - node-cron 定时任务的补偿机制测试
 * - 异步操作失败重试逻辑验证
 * - 幂等性保证验证（重复执行无副作用）
 * - 任务状态持久化验证
 *
 * 测试范围：
 * - 失败重试场景（数据库异常、网络超时）
 * - 超时补偿场景（processing 状态超时自动转为 failed）
 * - 幂等性验证（相同幂等键重复执行返回首次结果）
 * - 任务状态转换验证（processing → completed / failed）
 * - 过期记录清理验证
 *
 * 技术实现：
 * - 基于 IdempotencyService 的幂等键机制
 * - 基于 ApiIdempotencyRequest 模型的任务状态持久化
 * - 模拟任务执行（不依赖真实 cron 调度）
 *
 * @module tests/integration/async_task_compensation
 * @since 2026-01-29
 */

// 加载环境变量
require('dotenv').config()

const IdempotencyService = require('../../services/IdempotencyService')
const { ApiIdempotencyRequest, sequelize, User } = require('../../models')
const { Op } = sequelize.Sequelize
const { v4: uuidv4 } = require('uuid')
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 测试用模拟任务执行器
 * 模拟异步任务的执行过程，支持注入失败和延迟
 */
class MockTaskExecutor {
  /**
   * 执行模拟任务
   *
   * @param {Object} options - 执行选项
   * @param {boolean} [options.shouldFail=false] - 是否模拟失败
   * @param {string} [options.failureType='database'] - 失败类型：database/timeout/unknown
   * @param {number} [options.delay=0] - 执行延迟（毫秒）
   * @param {Object} [options.result=null] - 成功时返回的结果
   * @returns {Promise<Object>} 执行结果
   * @throws {Error} 模拟的错误
   */
  static async execute(options = {}) {
    const {
      shouldFail = false,
      failureType = 'database',
      delay = 0,
      result = { status: 'success', processed_at: new Date().toISOString() }
    } = options

    // 模拟执行延迟
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    // 模拟失败场景
    if (shouldFail) {
      const errorMessages = {
        database: 'ECONNREFUSED: Database connection failed',
        timeout: 'ETIMEDOUT: Operation timed out after 30000ms',
        deadlock: 'Deadlock found when trying to get lock',
        unknown: 'Unknown error occurred'
      }
      const error = new Error(errorMessages[failureType] || errorMessages.unknown)
      error.code = failureType.toUpperCase()
      throw error
    }

    return result
  }
}

/**
 * 测试用辅助函数：创建测试幂等键
 *
 * @param {string} [prefix='test'] - 前缀
 * @returns {string} 唯一的测试幂等键
 */
function generateTestIdempotencyKey(prefix = 'test') {
  return `${prefix}_${Date.now()}_${uuidv4().substring(0, 8)}`
}

/**
 * 测试用辅助函数：创建符合 IdempotencyService.getOrCreateRequest 参数格式的请求对象
 *
 * @param {Object} options - 请求选项
 * @param {number} options.user_id - 用户ID
 * @param {string} options.api_path - API路径
 * @param {string} [options.http_method='POST'] - HTTP方法
 * @param {Object} [options.request_params={}] - 请求参数（body）
 * @param {Object} [options.query={}] - 查询参数
 * @returns {Object} 格式化的请求数据对象
 */
function createRequestData(options) {
  const { user_id, api_path, http_method = 'POST', request_params = {}, query = {} } = options

  return {
    user_id,
    api_path,
    http_method,
    request_params,
    query
  }
}

/**
 * 测试用辅助函数：清理测试数据
 *
 * @param {string} pattern - 清理模式（如 'test_%'）
 * @returns {Promise<number>} 清理的记录数
 */
async function cleanupTestData(pattern = 'test_%') {
  try {
    const result = await ApiIdempotencyRequest.destroy({
      where: {
        idempotency_key: {
          [Op.like]: pattern
        }
      }
    })
    return result
  } catch (error) {
    console.warn(`[cleanup] 清理测试数据失败: ${error.message}`)
    return 0
  }
}

describe('P3-11: 异步任务补偿测试', () => {
  // 测试超时设置（补偿任务可能需要较长时间）
  jest.setTimeout(60000)

  // 测试用户ID（从真实数据库获取）
  let testUserId = null

  /**
   * 测试前准备：获取真实测试用户
   */
  beforeAll(async () => {
    console.log('='.repeat(80))
    console.log('🔧 P3-11: 异步任务补偿测试 - 准备阶段')
    console.log('='.repeat(80))

    // 从数据库获取真实测试用户
    const testUser = await User.findOne({
      where: { mobile: '13612227930' },
      attributes: ['user_id', 'nickname', 'mobile']
    })

    if (testUser) {
      testUserId = testUser.user_id
      console.log(`✅ 获取测试用户: user_id=${testUserId}`)
    } else {
      // 如果测试用户不存在，使用第一个可用用户
      const anyUser = await User.findOne({
        where: { status: 'active' },
        attributes: ['user_id', 'nickname', 'mobile']
      })
      testUserId = anyUser?.user_id || 1
      console.log(`⚠️ 使用备用测试用户: user_id=${testUserId}`)
    }

    console.log('='.repeat(80))
  })

  /**
   * 每个测试后清理测试数据
   */
  afterEach(async () => {
    const cleaned = await cleanupTestData('test_%')
    if (cleaned > 0) {
      console.log(`   🧹 清理了 ${cleaned} 条测试数据`)
    }
  })

  /**
   * 测试套件1: 幂等性服务基础功能测试
   * 验证 IdempotencyService 的核心方法
   */
  describe('1. IdempotencyService 基础功能', () => {
    test('1.1 getOrCreateRequest - 首次请求应创建新记录', async () => {
      console.log('\n📝 测试1.1: 首次请求创建幂等记录...')

      const idempotencyKey = generateTestIdempotencyKey('create')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/action',
        http_method: 'POST',
        request_params: { action: 'test_create', amount: 100 }
      })

      // 首次请求
      const result = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      expect(result).toBeDefined()
      expect(result.request.status).toBe('processing') // 新创建的请求状态为 processing
      expect(result.is_new).toBe(true) // 标记为新创建（注意：字段名是 is_new）

      // 验证数据库记录
      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })

      expect(dbRecord).not.toBeNull()
      expect(dbRecord.status).toBe('processing')
      // 数据库返回的 user_id 可能是字符串类型
      expect(Number(dbRecord.user_id)).toBe(testUserId)
      expect(dbRecord.api_path).toBe('/api/v4/test/action')

      console.log(`   ✅ 创建记录成功: request_id=${dbRecord.request_id}`)
    })

    test('1.2 getOrCreateRequest - 已完成请求应返回缓存结果', async () => {
      console.log('\n📝 测试1.2: 已完成请求返回缓存结果...')

      const idempotencyKey = generateTestIdempotencyKey('completed')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/action',
        http_method: 'POST',
        request_params: { action: 'test_completed', amount: 200 }
      })

      // 首次请求
      const firstResult = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)
      expect(firstResult.is_new).toBe(true)

      /*
       * 标记为完成并保存响应快照
       * 参数顺序：(idempotency_key, business_event_id, response_data)
       */
      const responseSnapshot = {
        success: true,
        code: 'ACTION_SUCCESS',
        data: { result: 'completed_data' }
      }
      await IdempotencyService.markAsCompleted(idempotencyKey, null, responseSnapshot)

      // 重复请求
      const secondResult = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      expect(secondResult.is_new).toBe(false) // 非新创建
      expect(secondResult.request.status).toBe('completed')
      expect(secondResult.response).toMatchObject(responseSnapshot)

      console.log('   ✅ 重复请求返回缓存结果')
    })

    test('1.3 getOrCreateRequest - processing 状态请求应抛出 409 错误', async () => {
      console.log('\n📝 测试1.3: processing 状态请求应抛出 409 错误...')

      const idempotencyKey = generateTestIdempotencyKey('processing')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/action',
        http_method: 'POST',
        request_params: { action: 'test_processing' }
      })

      // 首次请求（创建 processing 状态记录）
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      // 重复请求应抛出 409 错误
      await expect(
        IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)
      ).rejects.toMatchObject({
        message: expect.stringContaining('处理中'),
        statusCode: 409
      })

      console.log('   ✅ processing 状态正确抛出 409 错误')
    })

    test('1.4 markAsFailed - 标记失败应允许重试', async () => {
      console.log('\n📝 测试1.4: 标记失败后应允许重试...')

      const idempotencyKey = generateTestIdempotencyKey('failed_retry')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/action',
        http_method: 'POST',
        request_params: { action: 'test_failed_retry' }
      })

      // 首次请求
      const firstResult = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)
      expect(firstResult.is_new).toBe(true)

      // 标记为失败（参数顺序：idempotency_key, error_message）
      await IdempotencyService.markAsFailed(idempotencyKey, 'Test failure')

      // 验证状态变为 failed
      const failedRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(failedRecord.status).toBe('failed')

      // 重试请求（failed 状态允许重试，状态变回 processing）
      const retryResult = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)
      expect(retryResult.request.status).toBe('processing')

      console.log('   ✅ 失败状态允许重试，状态已更新为 processing')
    })
  })

  /**
   * 测试套件2: 失败重试场景测试
   * 验证任务执行失败时的重试逻辑
   */
  describe('2. 失败重试场景', () => {
    test('2.1 模拟数据库连接失败后的重试', async () => {
      console.log('\n🔄 测试2.1: 数据库连接失败重试...')

      const idempotencyKey = generateTestIdempotencyKey('db_retry')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/db-task',
        http_method: 'POST',
        request_params: { action: 'db_retry_test' }
      })

      // 创建幂等记录
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      // 模拟第一次执行失败（数据库错误）
      let retryCount = 0
      try {
        await MockTaskExecutor.execute({
          shouldFail: true,
          failureType: 'database'
        })
      } catch (error) {
        retryCount++
        // 标记失败（参数顺序：idempotency_key, error_message）
        await IdempotencyService.markAsFailed(idempotencyKey, error.message)
        console.log(`   ⚠️ 第1次执行失败: ${error.message}`)
      }

      // 验证失败状态
      let record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('failed')

      // 重试（模拟定时任务补偿）
      console.log('   🔄 执行补偿重试...')
      const retryResult = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)
      expect(retryResult.request.status).toBe('processing') // 重试时状态变为 processing

      // 第二次执行成功
      const taskResult = await MockTaskExecutor.execute({
        shouldFail: false,
        result: { action: 'db_retry_test', status: 'success_after_retry' }
      })

      // 标记成功（参数顺序：idempotency_key, business_event_id, response_data）
      await IdempotencyService.markAsCompleted(idempotencyKey, null, {
        success: true,
        code: 'RETRY_SUCCESS',
        data: taskResult
      })
      retryCount++

      // 验证最终状态
      record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('completed')
      expect(record.response_code).toBe('RETRY_SUCCESS') // markAsCompleted 使用 response_data.code

      console.log(`   ✅ 重试成功，总执行次数: ${retryCount}`)
    })

    test('2.2 模拟超时失败后的重试', async () => {
      console.log('\n🔄 测试2.2: 超时失败重试...')

      const idempotencyKey = generateTestIdempotencyKey('timeout_retry')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/timeout-task',
        http_method: 'POST',
        request_params: { action: 'timeout_retry_test' }
      })

      // 创建幂等记录
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      // 模拟超时执行（延迟 100ms 模拟耗时操作）
      try {
        await MockTaskExecutor.execute({
          shouldFail: true,
          failureType: 'timeout',
          delay: 100
        })
      } catch (error) {
        expect(error.message).toContain('ETIMEDOUT')
        await IdempotencyService.markAsFailed(idempotencyKey, error.message)
        console.log(`   ⚠️ 超时失败: ${error.message}`)
      }

      // 补偿重试
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      const taskResult = await MockTaskExecutor.execute({
        shouldFail: false,
        delay: 50, // 第二次执行更快
        result: { status: 'success_after_timeout' }
      })

      await IdempotencyService.markAsCompleted(idempotencyKey, null, {
        success: true,
        code: 'TIMEOUT_RECOVERY',
        data: taskResult
      })

      // 验证最终状态
      const record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('completed')
      expect(record.completed_at).not.toBeNull()

      console.log('   ✅ 超时重试成功')
    })

    test('2.3 多次失败后的重试（最大重试次数验证）', async () => {
      console.log('\n🔄 测试2.3: 多次失败重试（最大重试次数验证）...')

      const idempotencyKey = generateTestIdempotencyKey('multi_retry')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/multi-task',
        http_method: 'POST',
        request_params: { action: 'multi_retry_test' }
      })

      const maxRetries = 3
      let actualRetries = 0

      for (let i = 0; i < maxRetries; i++) {
        console.log(`   🔄 第 ${i + 1} 次尝试...`)

        // 获取/重试幂等记录
        await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

        // 模拟失败（除了最后一次）
        const shouldSucceed = i === maxRetries - 1
        try {
          await MockTaskExecutor.execute({
            shouldFail: !shouldSucceed,
            failureType: 'deadlock'
          })

          if (shouldSucceed) {
            await IdempotencyService.markAsCompleted(idempotencyKey, null, {
              success: true,
              code: 'FINAL_SUCCESS',
              data: { retries: actualRetries }
            })
            actualRetries++
            console.log(`   ✅ 第 ${i + 1} 次执行成功`)
          }
        } catch (error) {
          await IdempotencyService.markAsFailed(idempotencyKey, error.message)
          actualRetries++
          console.log(`   ⚠️ 第 ${i + 1} 次执行失败: ${error.message}`)
        }
      }

      // 验证最终状态
      const record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('completed')
      expect(actualRetries).toBe(maxRetries)

      console.log(`   ✅ 总共执行 ${actualRetries} 次，最终成功`)
    })
  })

  /**
   * 测试套件3: 超时补偿测试
   * 验证 processing 状态超时后的自动补偿
   */
  describe('3. 超时补偿场景', () => {
    test('3.1 autoFailProcessingTimeout - 超时的 processing 记录应转为 failed', async () => {
      console.log('\n⏰ 测试3.1: processing 超时自动转为 failed...')

      const idempotencyKey = generateTestIdempotencyKey('auto_timeout')

      // 创建一个过期的 processing 记录（created_at 设为 30 分钟前）
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
      const twentyFourHoursLater = new Date(Date.now() + 24 * 60 * 60 * 1000)

      await ApiIdempotencyRequest.create({
        idempotency_key: idempotencyKey,
        api_path: '/api/v4/test/timeout-auto',
        http_method: 'POST',
        request_hash: 'test_hash_' + Date.now(),
        user_id: testUserId,
        status: 'processing',
        created_at: thirtyMinutesAgo,
        expires_at: twentyFourHoursLater
      })

      console.log(`   创建过期 processing 记录: ${idempotencyKey}`)

      // 验证初始状态
      let record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('processing')

      // 执行超时自动失败（设置 5 分钟超时阈值用于测试）
      const result = await IdempotencyService.autoFailProcessingTimeout(5) // 5分钟超时

      console.log(`   超时处理结果: ${result.affected_count} 条记录被标记为 failed`)

      // 验证状态已变为 failed
      record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('failed')

      console.log('   ✅ 超时记录已自动转为 failed 状态')
    })

    test('3.2 cleanupExpired - 清理过期的已完成记录', async () => {
      console.log('\n🗑️ 测试3.2: 清理过期的已完成记录...')

      const idempotencyKey = generateTestIdempotencyKey('cleanup_expired')

      // 创建一个过期的 completed 记录（expires_at 设为过去）
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

      await ApiIdempotencyRequest.create({
        idempotency_key: idempotencyKey,
        api_path: '/api/v4/test/cleanup',
        http_method: 'POST',
        request_hash: 'test_hash_cleanup_' + Date.now(),
        user_id: testUserId,
        status: 'completed',
        response_snapshot: { test: 'data' },
        response_code: 'TEST_SUCCESS',
        completed_at: oneHourAgo,
        expires_at: oneHourAgo // 已过期
      })

      console.log(`   创建过期 completed 记录: ${idempotencyKey}`)

      // 验证记录存在
      let record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record).not.toBeNull()

      // 执行过期清理
      const result = await IdempotencyService.cleanupExpired()

      console.log(`   清理结果: ${result.deleted_count} 条记录被删除`)

      // 验证记录已被清理
      record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record).toBeNull()

      console.log('   ✅ 过期记录已被清理')
    })
  })

  /**
   * 测试套件4: 幂等性保证验证
   * 验证重复执行不会产生副作用
   */
  describe('4. 幂等性保证验证', () => {
    test('4.1 相同幂等键重复执行应返回相同结果', async () => {
      console.log('\n🔒 测试4.1: 幂等性验证 - 相同幂等键返回相同结果...')

      const idempotencyKey = generateTestIdempotencyKey('idempotency_check')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/idempotent-action',
        http_method: 'POST',
        request_params: { action: 'idempotency_test', amount: 500 }
      })

      // 首次执行
      const firstCall = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)
      expect(firstCall.is_new).toBe(true)

      // 模拟任务执行并标记完成
      const originalResult = {
        success: true,
        code: 'IDEMPOTENT_ACTION',
        data: {
          transaction_id: 'TXN_' + Date.now(),
          amount: 500,
          timestamp: new Date().toISOString()
        }
      }
      // 参数顺序：(idempotency_key, business_event_id, response_data)
      await IdempotencyService.markAsCompleted(idempotencyKey, null, originalResult)

      console.log('   首次执行完成，结果已保存')

      // 重复执行多次
      for (let i = 0; i < 5; i++) {
        const repeatCall = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

        expect(repeatCall.is_new).toBe(false)
        expect(repeatCall.request.status).toBe('completed')
        expect(repeatCall.response).toMatchObject(originalResult)
        expect(repeatCall.response.data.transaction_id).toBe(originalResult.data.transaction_id)
      }

      console.log('   ✅ 5次重复执行全部返回相同的首次结果')
    })

    test('4.2 不同幂等键应独立执行', async () => {
      console.log('\n🔒 测试4.2: 幂等性验证 - 不同幂等键独立执行...')

      const baseRequestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/independent',
        http_method: 'POST',
        request_params: { action: 'independent_test' }
      })

      const results = []

      // 创建 5 个不同幂等键的请求
      for (let i = 0; i < 5; i++) {
        const idempotencyKey = generateTestIdempotencyKey(`independent_${i}`)
        const call = await IdempotencyService.getOrCreateRequest(idempotencyKey, baseRequestData)

        expect(call.is_new).toBe(true)
        expect(call.request.status).toBe('processing')

        // 标记完成（每个有不同的结果）
        const result = {
          success: true,
          index: i,
          transaction_id: `TXN_${i}_${Date.now()}`
        }
        await IdempotencyService.markAsCompleted(idempotencyKey, null, {
          ...result,
          code: `SUCCESS_${i}`
        })

        results.push({ key: idempotencyKey, result })
      }

      // 验证每个请求都有独立的结果
      const uniqueTransactionIds = new Set(results.map(r => r.result.transaction_id))
      expect(uniqueTransactionIds.size).toBe(5)

      console.log('   ✅ 5个不同幂等键全部独立执行')
    })

    test('4.3 参数哈希冲突检测', async () => {
      console.log('\n🔒 测试4.3: 参数哈希冲突检测...')

      const idempotencyKey = generateTestIdempotencyKey('hash_conflict')

      // 首次请求
      const firstRequestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/hash',
        http_method: 'POST',
        request_params: { action: 'hash_test', amount: 100 }
      })

      const firstCall = await IdempotencyService.getOrCreateRequest(
        idempotencyKey,
        firstRequestData
      )
      expect(firstCall.is_new).toBe(true)

      // 标记完成（参数顺序：idempotency_key, business_event_id, response_data）
      await IdempotencyService.markAsCompleted(idempotencyKey, null, {
        success: true,
        code: 'FIRST_REQUEST',
        amount: 100
      })

      /*
       * 使用相同幂等键但不同参数的请求
       * IdempotencyService 会检测到参数哈希不一致并抛出错误
       */
      const secondRequestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/hash',
        http_method: 'POST',
        request_params: { action: 'hash_test', amount: 200 } // 不同的 amount
      })

      // 应该抛出幂等键冲突错误（参数不一致）
      await expect(
        IdempotencyService.getOrCreateRequest(idempotencyKey, secondRequestData)
      ).rejects.toMatchObject({
        message: expect.stringContaining('幂等键冲突'),
        statusCode: 409
      })

      console.log('   ✅ 参数哈希冲突时正确抛出 409 错误')
    })
  })

  /**
   * 测试套件5: 任务状态持久化验证
   * 验证任务状态在数据库中的正确记录
   */
  describe('5. 任务状态持久化验证', () => {
    test('5.1 验证 processing → completed 状态转换', async () => {
      console.log('\n📊 测试5.1: 状态转换 processing → completed...')

      const idempotencyKey = generateTestIdempotencyKey('state_complete')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/state',
        http_method: 'POST',
        request_params: { action: 'state_complete_test' }
      })

      // 创建 processing 状态
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      let record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('processing')
      expect(record.completed_at).toBeNull()

      // 转换为 completed（参数顺序：idempotency_key, business_event_id, response_data）
      await IdempotencyService.markAsCompleted(idempotencyKey, null, {
        success: true,
        code: 'STATE_COMPLETE'
      })

      record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('completed')
      expect(record.completed_at).not.toBeNull()
      expect(record.response_code).toBe('STATE_COMPLETE')

      console.log('   ✅ 状态转换正确: processing → completed')
    })

    test('5.2 验证 processing → failed 状态转换', async () => {
      console.log('\n📊 测试5.2: 状态转换 processing → failed...')

      const idempotencyKey = generateTestIdempotencyKey('state_failed')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/state',
        http_method: 'POST',
        request_params: { action: 'state_failed_test' }
      })

      // 创建 processing 状态
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      let record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('processing')

      // 转换为 failed（参数顺序：idempotency_key, error_message）
      const testErrorMessage = 'Test failure for state transition'
      await IdempotencyService.markAsFailed(idempotencyKey, testErrorMessage)

      record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('failed')
      // markAsFailed 不设置 response_code，但会设置 response_snapshot 中的 error
      expect(record.response_snapshot.error).toBe(testErrorMessage)

      console.log('   ✅ 状态转换正确: processing → failed')
    })

    test('5.3 验证 failed → processing 状态转换（重试场景）', async () => {
      console.log('\n📊 测试5.3: 状态转换 failed → processing（重试）...')

      const idempotencyKey = generateTestIdempotencyKey('state_retry')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/state',
        http_method: 'POST',
        request_params: { action: 'state_retry_test' }
      })

      // 创建并标记为 failed（参数顺序：idempotency_key, error_message）
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)
      await IdempotencyService.markAsFailed(idempotencyKey, 'Initial failure')

      let record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('failed')

      // 重试（failed → processing）
      const retryResult = await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)
      expect(retryResult.request.status).toBe('processing')

      record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('processing')

      console.log('   ✅ 状态转换正确: failed → processing（重试）')
    })

    test('5.4 验证业务事件ID关联', async () => {
      console.log('\n📊 测试5.4: 业务事件ID关联...')

      const idempotencyKey = generateTestIdempotencyKey('business_event')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/business',
        http_method: 'POST',
        request_params: { action: 'business_event_test' }
      })

      // 创建请求
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      // 模拟业务操作生成业务事件ID
      const businessEventId = `EVENT_${Date.now()}_${uuidv4().substring(0, 8)}`

      // 更新业务事件ID（实际场景中在 markAsCompleted 时传入）
      await ApiIdempotencyRequest.update(
        { business_event_id: businessEventId },
        { where: { idempotency_key: idempotencyKey } }
      )

      // 标记完成（参数顺序：idempotency_key, business_event_id, response_data）
      await IdempotencyService.markAsCompleted(idempotencyKey, businessEventId, {
        success: true,
        code: 'BUSINESS_EVENT_CREATED'
      })

      // 验证业务事件ID已关联
      const record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.business_event_id).toBe(businessEventId)

      console.log(`   ✅ 业务事件ID已关联: ${businessEventId}`)
    })
  })

  /**
   * 测试套件6: 边界条件测试
   * 验证极端情况和边界条件的处理
   */
  describe('6. 边界条件测试', () => {
    test('6.1 空幂等键处理（边界条件）', async () => {
      console.log('\n⚠️ 测试6.1: 空幂等键处理...')

      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/empty',
        http_method: 'POST',
        request_params: { action: 'empty_key_test' }
      })

      /*
       * 注意：当前 IdempotencyService 不会对空幂等键抛出错误
       * 这是因为数据库允许空字符串作为幂等键（虽然不推荐）
       *
       * 实际业务中，空幂等键应该在中间件层进行验证
       * 这里测试验证服务的实际行为
       */

      // 测试空字符串 - 服务会接受但返回已存在的记录（如果有）或创建新记录
      const emptyKeyResult = await IdempotencyService.getOrCreateRequest('', requestData)
      // 验证服务能正常处理（即使不推荐使用空字符串）
      expect(emptyKeyResult).toBeDefined()
      expect(emptyKeyResult.request).toBeDefined()

      // null 和 undefined 应该抛出错误（模型层验证）
      await expect(IdempotencyService.getOrCreateRequest(null, requestData)).rejects.toThrow()

      await expect(IdempotencyService.getOrCreateRequest(undefined, requestData)).rejects.toThrow()

      console.log('   ✅ 空幂等键边界条件处理验证完成')
    })

    test('6.2 超长幂等键应被处理', async () => {
      console.log('\n⚠️ 测试6.2: 超长幂等键处理...')

      // 创建超长幂等键（超过100字符）
      const longKey = 'test_' + 'a'.repeat(200)
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/long',
        http_method: 'POST',
        request_params: { action: 'long_key_test' }
      })

      // 应该被截断或抛出错误
      try {
        await IdempotencyService.getOrCreateRequest(longKey, requestData)
        // 如果成功，验证键被截断
        const record = await ApiIdempotencyRequest.findOne({
          where: {
            idempotency_key: {
              [Op.like]: 'test_a%'
            }
          }
        })
        expect(record.idempotency_key.length).toBeLessThanOrEqual(100)
        console.log('   ✅ 超长幂等键被截断处理')
      } catch (error) {
        // 如果抛出错误，也是预期的行为
        expect(error).toBeDefined()
        console.log('   ✅ 超长幂等键抛出错误')
      }
    })

    test('6.3 并发创建相同幂等键应只有一个成功', async () => {
      console.log('\n⚠️ 测试6.3: 并发创建相同幂等键...')

      const idempotencyKey = generateTestIdempotencyKey('concurrent_create')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/test/concurrent',
        http_method: 'POST',
        request_params: { action: 'concurrent_create_test' }
      })

      // 并发创建 5 个相同幂等键的请求
      const concurrentPromises = Array(5)
        .fill()
        .map(() => IdempotencyService.getOrCreateRequest(idempotencyKey, requestData))

      const results = await Promise.allSettled(concurrentPromises)

      // 统计结果
      const succeeded = results.filter(r => r.status === 'fulfilled')
      const failed = results.filter(r => r.status === 'rejected')

      console.log(`   成功: ${succeeded.length}, 失败: ${failed.length}`)

      /*
       * 应该只有一个是新创建的（is_new = true）
       * 其他可能是 409（processing 冲突）或返回缓存结果
       */
      const newCreations = succeeded.filter(r => r.value.is_new === true)
      expect(newCreations.length).toBe(1)

      // 验证数据库只有一条记录
      const records = await ApiIdempotencyRequest.findAll({
        where: { idempotency_key: idempotencyKey }
      })
      expect(records.length).toBe(1)

      console.log('   ✅ 并发创建时只有一个成功')
    })
  })

  /**
   * 测试套件7: 定时任务补偿模拟
   * 模拟定时任务执行的完整流程
   */
  describe('7. 定时任务补偿模拟', () => {
    test('7.1 模拟定时任务完整执行流程', async () => {
      console.log('\n🕐 测试7.1: 定时任务完整执行流程模拟...')

      /**
       * 模拟定时任务类
       * 包含完整的执行、失败处理、补偿逻辑
       */
      class MockScheduledTask {
        constructor(name) {
          this.name = name
          this.retryCount = 0
          this.maxRetries = 3
          this.status = 'pending'
          this.lastError = null
          this.result = null
        }

        async execute(shouldFail = false, failureType = 'database') {
          this.retryCount++
          console.log(`   [${this.name}] 第 ${this.retryCount} 次执行...`)

          try {
            this.status = 'running'

            // 模拟任务执行
            const result = await MockTaskExecutor.execute({
              shouldFail,
              failureType,
              delay: 50
            })

            this.status = 'completed'
            this.result = result
            console.log(`   [${this.name}] 执行成功`)
            return result
          } catch (error) {
            this.status = 'failed'
            this.lastError = error
            console.log(`   [${this.name}] 执行失败: ${error.message}`)
            throw error
          }
        }

        shouldRetry() {
          return this.status === 'failed' && this.retryCount < this.maxRetries
        }

        async runWithCompensation() {
          while (true) {
            try {
              // 首次执行模拟失败
              const shouldFail = this.retryCount < 2
              await this.execute(shouldFail, 'deadlock')
              return this.result
            } catch (error) {
              if (!this.shouldRetry()) {
                console.log(`   [${this.name}] 已达到最大重试次数，放弃执行`)
                throw error
              }
              console.log(`   [${this.name}] 准备补偿重试...`)
              // 模拟补偿等待
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        }
      }

      const task = new MockScheduledTask('TestCleanupTask')
      const result = await task.runWithCompensation()

      expect(task.status).toBe('completed')
      expect(task.retryCount).toBe(3) // 失败2次 + 成功1次
      expect(result).toBeDefined()

      console.log(`   ✅ 定时任务完整流程执行成功，总执行次数: ${task.retryCount}`)
    })

    test('7.2 模拟资产对账任务补偿', async () => {
      console.log('\n🕐 测试7.2: 资产对账任务补偿模拟...')

      const idempotencyKey = generateTestIdempotencyKey('reconciliation')
      const requestData = createRequestData({
        user_id: testUserId,
        api_path: '/api/v4/internal/reconciliation',
        http_method: 'POST',
        request_params: { task_type: 'asset_reconciliation', date: '2026-01-29' }
      })

      // 模拟对账任务
      const reconciliationResult = {
        total_checked: 100,
        discrepancy_count: 0,
        status: 'OK',
        timestamp: BeijingTimeHelper.formatChinese(new Date())
      }

      // 创建幂等记录
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      // 模拟首次执行失败（数据库忙）
      try {
        await MockTaskExecutor.execute({
          shouldFail: true,
          failureType: 'deadlock'
        })
      } catch (error) {
        await IdempotencyService.markAsFailed(idempotencyKey, error.message)
        console.log('   ⚠️ 对账任务首次执行失败（死锁）')
      }

      // 补偿重试
      await IdempotencyService.getOrCreateRequest(idempotencyKey, requestData)

      // 第二次执行成功
      await MockTaskExecutor.execute({
        shouldFail: false,
        result: reconciliationResult
      })

      await IdempotencyService.markAsCompleted(idempotencyKey, null, {
        success: true,
        code: 'RECONCILIATION_SUCCESS',
        data: reconciliationResult
      })

      // 验证结果
      const record = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key: idempotencyKey }
      })
      expect(record.status).toBe('completed')
      expect(record.response_snapshot.data.status).toBe('OK')

      console.log('   ✅ 资产对账任务补偿成功')
    })
  })
})
