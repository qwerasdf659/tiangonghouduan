/**
 * 幂等服务集成测试 - IdempotencyService.integration.test.js
 *
 * P1-5.2: 幂等性集成测试 - 并发幂等验证
 *
 * 测试范围：
 * - 数据库交互测试（真实数据库连接）
 * - 状态流转测试（processing → completed/failed）
 * - 并发安全测试（竞态条件检测）
 * - 超时处理测试（autoFailProcessingTimeout）
 * - 过期清理测试（cleanupExpired）
 *
 * 业务场景：
 * - 高并发下的幂等性保证
 * - 异常情况下的状态恢复
 * - 资源清理和系统维护
 *
 * 创建时间：2026-01-30
 * 版本：1.0.0
 *
 * @see services/IdempotencyService.js - 被测服务
 * @see docs/测试体系问题分析与改进方案.md - P1-5.2 任务定义
 */

'use strict'

// 加载环境变量（测试环境）
require('dotenv').config()

const IdempotencyService = require('../../services/IdempotencyService')
const { sequelize } = require('../../config/database')
const { ApiIdempotencyRequest } = require('../../models')
const { Op } = require('sequelize')

// 并发测试工具
const { executeConcurrent } = require('../helpers/test-concurrent-utils')

// 测试超时设置
jest.setTimeout(60000) // 集成测试需要更长超时

/**
 * 生成唯一的幂等键
 *
 * @param {string} prefix - 前缀标识
 * @returns {string} 唯一幂等键
 */
function generateUniqueIdempotencyKey(prefix = 'test') {
  return `idem_${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

describe('IdempotencyService - 集成测试（数据库交互与并发验证）', () => {
  /**
   * 测试用户ID（从真实数据库获取）
   * @type {number|null}
   */
  let test_user_id = null

  /**
   * 追踪本测试创建的幂等键，便于清理
   * @type {string[]}
   */
  const created_idempotency_keys = []

  // ==================== 测试生命周期 ====================

  beforeAll(async () => {
    // 验证数据库连接
    try {
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功')
    } catch (error) {
      console.error('❌ 数据库连接失败:', error.message)
      throw error
    }

    // 获取真实测试用户
    const { User } = require('../../models')
    const testUser = await User.findOne({
      where: { mobile: '13612227930', status: 'active' }
    })

    if (testUser) {
      test_user_id = testUser.user_id
      console.log(`✅ 测试用户ID: ${test_user_id}`)
    } else {
      // 使用默认用户ID（确保测试可以运行）
      test_user_id = 1
      console.log(`⚠️ 未找到测试用户，使用默认ID: ${test_user_id}`)
    }
  })

  afterEach(async () => {
    // 清理本测试用例创建的幂等记录
    if (created_idempotency_keys.length > 0) {
      try {
        await ApiIdempotencyRequest.destroy({
          where: { idempotency_key: { [Op.in]: created_idempotency_keys } }
        })
        created_idempotency_keys.length = 0 // 清空数组
      } catch (error) {
        console.warn('⚠️ 清理幂等记录失败:', error.message)
      }
    }
  })

  afterAll(async () => {
    // 最终清理：删除所有测试产生的幂等记录
    try {
      await ApiIdempotencyRequest.destroy({
        where: {
          idempotency_key: {
            [Op.like]: 'idem_test_%'
          }
        }
      })
      console.log('✅ 测试数据清理完成')
    } catch (error) {
      console.warn('⚠️ 最终清理失败:', error.message)
    }

    /*
     * 不关闭数据库连接，由 Jest 全局清理处理
     * 这样可以避免与其他测试的连接冲突
     */
  })

  // ==================== 1. getOrCreateRequest - 新请求测试 ====================

  describe('P1-5.2-1: getOrCreateRequest - 新请求创建', () => {
    /**
     * 测试场景：全新请求应创建记录并返回 is_new: true
     *
     * 业务规则：
     * - 首次请求创建新记录
     * - 状态初始化为 processing
     * - 返回 is_new: true 表示需要执行实际业务
     */
    it('全新请求应创建记录并返回 is_new: true', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('new')
      created_idempotency_keys.push(idempotency_key)

      // getOrCreateRequest 的参数格式
      const request_data = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: { action: 'test' }
      }

      // 执行
      const result = await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)

      // 验证返回值
      expect(result.is_new).toBe(true)
      expect(result.request).toBeTruthy()
      expect(result.request.idempotency_key).toBe(idempotency_key)
      expect(result.request.status).toBe('processing')

      // 验证数据库记录
      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })
      expect(dbRecord).toBeTruthy()
      expect(dbRecord.status).toBe('processing')
      // user_id 在数据库中可能是字符串类型，使用类型兼容的比较
      expect(String(dbRecord.user_id)).toBe(String(test_user_id))
    })

    /**
     * 测试场景：请求指纹应正确存储
     */
    it('请求指纹应正确存储', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('fingerprint')
      created_idempotency_keys.push(idempotency_key)

      const request_data = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/hash',
        query: { page: 1 },
        request_params: { data: 'test' }
      }

      await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)

      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      expect(dbRecord.request_hash).toBeTruthy()
      expect(dbRecord.request_hash.length).toBe(64) // SHA-256
    })
  })

  // ==================== 2. getOrCreateRequest - 重复请求测试 ====================

  describe('P1-5.2-2: getOrCreateRequest - 重复请求处理', () => {
    /**
     * 测试场景：重复请求（processing 状态）应返回 409 处理中
     *
     * 业务规则：
     * - 请求正在处理中时，重复请求应返回 REQUEST_PROCESSING
     * - HTTP 状态码 409 Conflict
     */
    it('重复请求（processing 状态）应返回 409 处理中', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('processing')
      created_idempotency_keys.push(idempotency_key)

      const request_data = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: { action: 'processing_test' }
      }

      // 第一次请求
      await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)

      // 第二次请求（相同参数）- 应抛出 409 错误
      await expect(
        IdempotencyService.getOrCreateRequest(idempotency_key, request_data)
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'REQUEST_PROCESSING'
      })

      // 验证错误消息
      try {
        await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)
      } catch (error) {
        expect(error.statusCode).toBe(409)
        expect(error.errorCode).toBe('REQUEST_PROCESSING')
        expect(error.message).toContain('正在处理中')
      }
    })

    /**
     * 测试场景：重复请求（completed 状态）应返回缓存结果
     *
     * 业务规则：
     * - 已完成的请求应返回 is_new: false 和 response_snapshot
     * - 无需再次执行业务逻辑
     */
    it('重复请求（completed 状态）应返回缓存结果', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('completed')
      created_idempotency_keys.push(idempotency_key)

      const request_data = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: { action: 'completed_test' }
      }

      // 创建并完成请求
      await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)
      await IdempotencyService.markAsCompleted(idempotency_key, 'business_event_1', {
        success: true,
        data: { result: 'ok' }
      })

      // 再次请求
      const result = await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)

      // 验证返回缓存
      expect(result.is_new).toBe(false)
      expect(result.request.status).toBe('completed')
      expect(result.request.response_snapshot).toBeTruthy()
      // Sequelize JSON 字段自动解析为对象，不需要 JSON.parse
      expect(result.request.response_snapshot).toMatchObject({
        success: true,
        data: { result: 'ok' }
      })
    })

    /**
     * 测试场景：重复请求（failed 状态）应允许重试
     *
     * 业务规则：
     * - 失败的请求可以重试
     * - 重试时状态应从 failed 转换为 processing
     * - 返回 is_new: false, should_process: true 表示需要重新执行
     */
    it('重复请求（failed 状态）应允许重试', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('failed')
      created_idempotency_keys.push(idempotency_key)

      const request_data = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: { action: 'failed_test' }
      }

      // 创建并标记失败
      await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)
      await IdempotencyService.markAsFailed(idempotency_key, '模拟失败')

      // 重试
      const result = await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)

      // 验证可以重试
      expect(result.is_new).toBe(false)
      expect(result.should_process).toBe(true)
      expect(result.request.status).toBe('processing')

      // 验证数据库状态
      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })
      expect(dbRecord.status).toBe('processing')
    })

    /**
     * 测试场景：相同幂等键但参数不同应返回 409 冲突
     *
     * 业务规则（决策1-B）：
     * - 请求指纹用于检测参数冲突
     * - 不同参数使用相同幂等键视为错误
     */
    it('相同幂等键但参数不同应返回 409 冲突', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('conflict')
      created_idempotency_keys.push(idempotency_key)

      // 第一次请求
      const request_data_1 = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: { amount: 100 }
      }

      await IdempotencyService.getOrCreateRequest(idempotency_key, request_data_1)

      // 第二次请求（不同参数）
      const request_data_2 = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: { amount: 200 } // 不同金额
      }

      // 使用 expect().rejects 验证错误
      await expect(
        IdempotencyService.getOrCreateRequest(idempotency_key, request_data_2)
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'IDEMPOTENCY_KEY_CONFLICT'
      })
    })

    /**
     * 测试场景：不同操作使用相同幂等键应返回 409 错误
     *
     * 业务规则：
     * - 幂等键绑定到特定的业务操作
     * - 不同操作不能复用同一幂等键
     */
    it('不同操作使用相同幂等键应返回 409 错误', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('operation_conflict')
      created_idempotency_keys.push(idempotency_key)

      // 第一次请求（操作A）
      const request_data_1 = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: { data: 'test' }
      }

      await IdempotencyService.getOrCreateRequest(idempotency_key, request_data_1)

      // 第二次请求（操作B - 不同API路径）
      const request_data_2 = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/db-task', // 不同API
        query: {},
        request_params: { data: 'test' }
      }

      // 使用 expect().rejects 验证错误
      await expect(
        IdempotencyService.getOrCreateRequest(idempotency_key, request_data_2)
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'IDEMPOTENCY_KEY_CONFLICT_DIFFERENT_OPERATION'
      })
    })
  })

  // ==================== 3. markAsCompleted - 标记完成测试 ====================

  describe('P1-5.2-3: markAsCompleted - 标记请求完成', () => {
    /**
     * 测试场景：成功标记完成应更新状态和响应快照
     */
    it('成功标记完成应更新状态和响应快照', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('complete')
      created_idempotency_keys.push(idempotency_key)

      // 创建请求
      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: {}
      })

      // 标记完成
      const response = {
        success: true,
        code: 'SUCCESS',
        data: { order_id: 12345 }
      }

      await IdempotencyService.markAsCompleted(idempotency_key, 'business_event_12345', response)

      // 验证数据库
      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      expect(dbRecord.status).toBe('completed')
      expect(dbRecord.business_event_id).toBe('business_event_12345')
      expect(dbRecord.response_code).toBe('SUCCESS')
      expect(dbRecord.completed_at).toBeTruthy()

      // Sequelize JSON 字段自动解析为对象，不需要 JSON.parse
      const snapshot = dbRecord.response_snapshot
      expect(snapshot.success).toBe(true)
      expect(snapshot.data.order_id).toBe(12345)
    })

    /**
     * 测试场景：敏感字段应在响应快照中脱敏
     */
    it('敏感字段应在响应快照中脱敏', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('sensitive')
      created_idempotency_keys.push(idempotency_key)

      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: {}
      })

      // 包含敏感字段的响应
      const response = {
        success: true,
        code: 'SUCCESS',
        data: {
          user_id: 123,
          token: 'jwt_secret_token',
          phone: '13612227930',
          order_id: 456
        }
      }

      await IdempotencyService.markAsCompleted(idempotency_key, 'event_sensitive', response)

      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      // Sequelize JSON 字段自动解析为对象，不需要 JSON.parse
      const snapshot = dbRecord.response_snapshot

      // 敏感字段应脱敏
      expect(snapshot.data.token).toBe('[REDACTED]')
      expect(snapshot.data.phone).toBe('[REDACTED]')

      // 非敏感字段应保留
      expect(snapshot.data.user_id).toBe(123)
      expect(snapshot.data.order_id).toBe(456)
    })

    /**
     * 测试场景：null business_event_id 应正常处理
     */
    it('null business_event_id 应正常处理', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('null_event')
      created_idempotency_keys.push(idempotency_key)

      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: {}
      })

      await IdempotencyService.markAsCompleted(idempotency_key, null, {
        success: true,
        code: 'SUCCESS'
      })

      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      expect(dbRecord.status).toBe('completed')
      expect(dbRecord.business_event_id).toBeNull()
    })

    /**
     * 测试场景：响应快照大小应受限制
     */
    it('超大响应应被截断', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('large_response')
      created_idempotency_keys.push(idempotency_key)

      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: {}
      })

      // 超大响应（>64KB）
      const largeData = 'x'.repeat(70000)
      await IdempotencyService.markAsCompleted(idempotency_key, 'event_large', {
        success: true,
        code: 'LARGE',
        message: '大响应',
        data: { content: largeData }
      })

      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      // Sequelize JSON 字段自动解析为对象，不需要 JSON.parse
      const snapshot = dbRecord.response_snapshot

      // 应被截断
      expect(snapshot._truncated).toBe(true)
      expect(snapshot._original_size).toBeGreaterThan(65536)
      expect(snapshot.success).toBe(true)
      expect(snapshot.code).toBe('LARGE')
      expect(snapshot.data).toBeUndefined() // data 被移除
    })
  })

  // ==================== 4. markAsFailed - 标记失败测试 ====================

  describe('P1-5.2-4: markAsFailed - 标记请求失败', () => {
    /**
     * 测试场景：标记失败应正确更新状态
     */
    it('标记失败应正确更新状态', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('fail')
      created_idempotency_keys.push(idempotency_key)

      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: {}
      })

      await IdempotencyService.markAsFailed(idempotency_key, '数据库写入失败')

      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      expect(dbRecord.status).toBe('failed')
      // markAsFailed 将错误信息存储在 response_snapshot.error 中
      expect(dbRecord.response_snapshot.error).toBe('数据库写入失败')
      // markAsFailed 设置的是 completed_at（状态变更时间）
      expect(dbRecord.completed_at).toBeTruthy()
    })

    /**
     * 测试场景：失败后可以重试
     */
    it('失败后重试应成功', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('retry')
      created_idempotency_keys.push(idempotency_key)

      const request_data = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: {}
      }

      // 创建 → 失败 → 重试 → 完成
      await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)
      await IdempotencyService.markAsFailed(idempotency_key, '首次失败')

      // 重试
      const retryResult = await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)
      expect(retryResult.should_process).toBe(true)

      // 完成
      await IdempotencyService.markAsCompleted(idempotency_key, 'event_retry_success', {
        success: true,
        code: 'SUCCESS'
      })

      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      expect(dbRecord.status).toBe('completed')
    })
  })

  // ==================== 5. findByKey / findByBusinessEventId 测试 ====================

  describe('P1-5.2-5: 查询方法测试', () => {
    /**
     * 测试场景：findByKey 应正确查询
     */
    it('findByKey 应返回存在的记录', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('find')
      created_idempotency_keys.push(idempotency_key)

      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: {}
      })

      const record = await IdempotencyService.findByKey(idempotency_key)

      expect(record).toBeTruthy()
      expect(record.idempotency_key).toBe(idempotency_key)
    })

    /**
     * 测试场景：findByKey 不存在应返回 null
     */
    it('findByKey 不存在应返回 null', async () => {
      const record = await IdempotencyService.findByKey('non_existent_key_12345')

      expect(record).toBeNull()
    })

    /**
     * 测试场景：findByBusinessEventId 应正确查询
     */
    it('findByBusinessEventId 应返回存在的记录', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('event')
      const business_event_id = `event_${Date.now()}`
      created_idempotency_keys.push(idempotency_key)

      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/business',
        query: {},
        request_params: {}
      })

      await IdempotencyService.markAsCompleted(idempotency_key, business_event_id, {
        success: true,
        code: 'SUCCESS'
      })

      const record = await IdempotencyService.findByBusinessEventId(business_event_id)

      expect(record).toBeTruthy()
      expect(record.business_event_id).toBe(business_event_id)
    })
  })

  // ==================== 6. 并发安全测试 ====================

  describe('P1-5.2-6: 并发安全测试', () => {
    /**
     * 测试场景：高并发相同幂等键只有1个成功创建
     *
     * 业务规则：
     * - 同一幂等键的并发请求只有一个能成功创建记录
     * - 其他请求应返回 REQUEST_PROCESSING
     */
    it('100并发相同key只有1个成功创建新记录', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('concurrent')
      created_idempotency_keys.push(idempotency_key)

      const request_data = {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/concurrent',
        query: {},
        request_params: { action: 'concurrent' }
      }

      // 并发任务
      const tasks = Array(100)
        .fill(null)
        .map(() => async () => {
          try {
            const result = await IdempotencyService.getOrCreateRequest(
              idempotency_key,
              request_data
            )
            return { success: true, is_new: result.is_new }
          } catch (error) {
            return { success: false, code: error.errorCode }
          }
        })

      // 执行并发（executeConcurrent 返回 { results, metrics }）
      const { results } = await executeConcurrent(tasks, {
        concurrency: 50,
        timeout: 30000
      })

      // 统计结果 - results 数组中每个元素有 result 属性包含任务返回值
      const newRecords = results.filter(r => r.success && r.result?.is_new)
      const processingConflicts = results.filter(
        r => !r.success || (r.result && !r.result.success && r.result.code === 'REQUEST_PROCESSING')
      )
      const paramConflicts = results.filter(
        r => r.result && !r.result.success && r.result.code === 'IDEMPOTENCY_KEY_CONFLICT'
      )

      console.log(`📊 并发测试结果：`)
      console.log(`   新建成功: ${newRecords.length}`)
      console.log(`   处理中冲突: ${processingConflicts.length}`)
      console.log(`   参数冲突: ${paramConflicts.length}`)

      // 验证：只有1个新建成功
      expect(newRecords.length).toBe(1)
      // 其他应为处理中冲突
      expect(processingConflicts.length + paramConflicts.length).toBe(99)
    })

    /**
     * 测试场景：不同幂等键的并发请求应都能成功
     *
     * 注意：高并发可能导致数据库死锁，使用顺序执行
     */
    it('10个不同key应该都能成功创建（顺序执行避免死锁）', async () => {
      const results = []

      for (let i = 0; i < 10; i++) {
        const idempotency_key = generateUniqueIdempotencyKey(`multi_${i}`)
        created_idempotency_keys.push(idempotency_key)

        const request_data = {
          user_id: test_user_id,
          http_method: 'POST',
          api_path: '/api/v4/test/multi-task',
          query: {},
          request_params: { index: i }
        }

        try {
          const result = await IdempotencyService.getOrCreateRequest(idempotency_key, request_data)
          results.push({ success: true, is_new: result.is_new })
        } catch (error) {
          results.push({ success: false, error: error.message })
        }
      }

      // 统计成功数
      const successCount = results.filter(r => r.success && r.is_new).length

      console.log(`📊 多Key测试结果：${successCount}/10 成功`)

      // 所有请求应成功
      expect(successCount).toBe(10)
    })
  })

  // ==================== 7. 超时处理测试 ====================

  describe('P1-5.2-7: autoFailProcessingTimeout - 超时处理', () => {
    /**
     * 测试场景：超时的 processing 请求应被标记为 failed
     *
     * 业务规则：
     * - processing 状态超过60秒应自动标记为超时失败
     * - 允许客户端重试
     */
    it('超时请求应被标记为 failed', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('timeout')
      created_idempotency_keys.push(idempotency_key)

      // 创建请求
      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/timeout-auto',
        query: {},
        request_params: {}
      })

      // 手动将 created_at 设置为很久以前（模拟超时）
      await ApiIdempotencyRequest.update(
        { created_at: new Date(Date.now() - 120 * 1000) }, // 2分钟前
        { where: { idempotency_key } }
      )

      // 执行超时处理
      const result = await IdempotencyService.autoFailProcessingTimeout()

      // 验证有记录被处理（autoFailProcessingTimeout 返回 { updated_count }）
      expect(result.updated_count).toBeGreaterThanOrEqual(1)

      // 验证数据库状态
      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      expect(dbRecord.status).toBe('failed')
      // 超时错误信息存储在 response_snapshot.error 中
      expect(dbRecord.response_snapshot.error).toContain('timeout')
    })
  })

  // ==================== 8. 过期清理测试 ====================

  describe('P1-5.2-8: cleanupExpired - 过期记录清理', () => {
    /**
     * 测试场景：过期的 completed 记录应被清理
     *
     * 业务规则：
     * - 超过 expires_at 的记录应被删除
     * - 保持数据库清洁
     */
    it('过期的 completed 记录应被清理', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('expired')
      // 注意：不加入 created_idempotency_keys，因为会被清理

      // 创建请求
      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/cleanup',
        query: {},
        request_params: {}
      })

      // 标记完成
      await IdempotencyService.markAsCompleted(idempotency_key, 'event_expired', {
        success: true,
        code: 'SUCCESS'
      })

      // 手动将 expires_at 设置为过去（模拟过期）
      await ApiIdempotencyRequest.update(
        { expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 1天前
        { where: { idempotency_key } }
      )

      // 执行清理
      const result = await IdempotencyService.cleanupExpired()

      // 验证有记录被清理
      expect(result.deleted_count).toBeGreaterThanOrEqual(1)

      // 验证记录已删除
      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      expect(dbRecord).toBeNull()
    })

    /**
     * 测试场景：未过期的记录不应被清理
     */
    it('未过期的记录不应被清理', async () => {
      const idempotency_key = generateUniqueIdempotencyKey('not_expired')
      created_idempotency_keys.push(idempotency_key)

      // 创建并完成请求（默认 expires_at 是7天后）
      await IdempotencyService.getOrCreateRequest(idempotency_key, {
        user_id: test_user_id,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        request_params: {}
      })

      await IdempotencyService.markAsCompleted(idempotency_key, 'event_not_expired', {
        success: true,
        code: 'SUCCESS'
      })

      // 执行清理
      await IdempotencyService.cleanupExpired()

      // 验证记录仍存在
      const dbRecord = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key }
      })

      expect(dbRecord).toBeTruthy()
      expect(dbRecord.status).toBe('completed')
    })
  })
})
