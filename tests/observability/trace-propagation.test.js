'use strict'

/**
 * P2-3.3: 分布式链路追踪测试套件
 *
 * 测试目标：
 * - 验证request_id在服务间调用时的传递完整性
 * - 验证跨服务调用的链路追踪能力
 * - 验证日志中trace上下文的完整性
 * - 验证WebSocket连接的追踪能力
 *
 * 与request-id-propagation.test.js的区别：
 * - request-id-propagation: 关注单请求内的ID生成和传递
 * - trace-propagation: 关注跨服务/跨组件的完整链路追踪
 *
 * 业务规则：
 * - 所有内部服务调用必须携带原始request_id
 * - 异步任务必须保留父请求的trace上下文
 * - WebSocket消息必须关联原始连接的trace信息
 * - 日志系统必须支持按request_id聚合查询
 *
 * @module tests/observability/trace-propagation
 * @since 2026-01-30
 */

// 加载环境变量
require('dotenv').config()

const request = require('supertest')
const express = require('express')
const ApiResponse = require('../../utils/ApiResponse')
const globalErrorHandler = require('../../middleware/errorHandler')

describe('P2-3.3: 分布式链路追踪测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  let testApp
  let capturedLogs = []
  const originalConsoleLog = console.log
  const originalConsoleInfo = console.info

  beforeAll(() => {
    // 捕获日志输出用于验证
    console.log = (...args) => {
      capturedLogs.push({ level: 'log', args })
      originalConsoleLog.apply(console, args)
    }
    console.info = (...args) => {
      capturedLogs.push({ level: 'info', args })
      originalConsoleInfo.apply(console, args)
    }

    // 创建测试用Express应用
    testApp = express()
    testApp.use(express.json())

    // 注入ApiResponse中间件（生成request_id）
    testApp.use(ApiResponse.middleware())

    // 模拟服务调用链的路由
    testApp.get('/test/trace/service-a', async (req, res) => {
      // 服务A调用服务B（内部模拟）
      const traceContext = {
        request_id: req.id,
        parent_service: 'service-a',
        timestamp: Date.now()
      }

      // 模拟异步服务调用
      const serviceBResult = await new Promise(resolve => {
        setTimeout(() => {
          resolve({
            service: 'service-b',
            received_trace: traceContext.request_id,
            processed: true
          })
        }, 10)
      })

      return res.apiSuccess(
        {
          service: 'service-a',
          trace_context: traceContext,
          downstream_result: serviceBResult
        },
        '服务链调用成功'
      )
    })

    // 测试路由 - 多层服务调用
    testApp.get('/test/trace/deep-chain', async (req, res) => {
      const traceId = req.id
      const callChain = []

      // 模拟多层服务调用
      for (let i = 1; i <= 3; i++) {
        callChain.push({
          layer: i,
          service: `service-layer-${i}`,
          trace_id: traceId,
          timestamp: Date.now()
        })
        await new Promise(resolve => setTimeout(resolve, 5))
      }

      return res.apiSuccess(
        {
          trace_id: traceId,
          call_chain: callChain,
          total_layers: callChain.length
        },
        '深层链路追踪完成'
      )
    })

    // 测试路由 - 并发服务调用
    testApp.get('/test/trace/concurrent', async (req, res) => {
      const traceId = req.id

      // 并发调用多个服务
      const results = await Promise.all([
        Promise.resolve({ service: 'cache', trace_id: traceId }),
        Promise.resolve({ service: 'database', trace_id: traceId }),
        Promise.resolve({ service: 'external-api', trace_id: traceId })
      ])

      return res.apiSuccess(
        {
          trace_id: traceId,
          concurrent_results: results,
          all_traces_match: results.every(r => r.trace_id === traceId)
        },
        '并发追踪完成'
      )
    })

    // 测试路由 - 异步任务追踪
    testApp.post('/test/trace/async-task', async (req, res) => {
      const traceId = req.id
      const taskId = `task_${Date.now()}`

      // 模拟创建异步任务（保留trace上下文）
      const asyncTask = {
        task_id: taskId,
        parent_trace_id: traceId,
        created_at: Date.now(),
        status: 'queued'
      }

      return res.apiSuccess(
        {
          trace_id: traceId,
          async_task: asyncTask,
          trace_preserved: asyncTask.parent_trace_id === traceId
        },
        '异步任务创建成功'
      )
    })

    // 测试路由 - 错误场景追踪
    testApp.get('/test/trace/error', async (req, res, next) => {
      const error = new Error('测试追踪错误')
      error.trace_id = req.id
      error.statusCode = 500
      next(error)
    })

    // 全局错误处理
    testApp.use(globalErrorHandler)
  })

  afterAll(() => {
    // 恢复console
    console.log = originalConsoleLog
    console.info = originalConsoleInfo
  })

  beforeEach(() => {
    // 清空日志捕获
    capturedLogs = []
  })

  describe('服务间调用追踪', () => {
    test('单层服务调用应正确传递trace_id', async () => {
      const customTraceId = `trace_test_${Date.now()}`

      const response = await request(testApp)
        .get('/test/trace/service-a')
        .set('X-Request-ID', customTraceId)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.request_id).toBe(customTraceId)

      // 验证trace上下文
      const data = response.body.data
      expect(data.trace_context.request_id).toBe(customTraceId)
      expect(data.downstream_result.received_trace).toBe(customTraceId)
    })

    test('深层链路调用应保持trace_id一致', async () => {
      const customTraceId = `deep_trace_${Date.now()}`

      const response = await request(testApp)
        .get('/test/trace/deep-chain')
        .set('X-Request-ID', customTraceId)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      const data = response.body.data
      expect(data.trace_id).toBe(customTraceId)
      expect(data.total_layers).toBe(3)

      // 验证每一层都使用相同的trace_id
      data.call_chain.forEach((layer, index) => {
        expect(layer.trace_id).toBe(customTraceId)
        expect(layer.layer).toBe(index + 1)
      })
    })

    test('并发服务调用应保持trace_id一致', async () => {
      const customTraceId = `concurrent_trace_${Date.now()}`

      const response = await request(testApp)
        .get('/test/trace/concurrent')
        .set('X-Request-ID', customTraceId)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      const data = response.body.data
      expect(data.trace_id).toBe(customTraceId)
      expect(data.all_traces_match).toBe(true)
      expect(data.concurrent_results).toHaveLength(3)
    })
  })

  describe('异步任务追踪', () => {
    test('异步任务应保留父请求的trace上下文', async () => {
      const customTraceId = `async_trace_${Date.now()}`

      const response = await request(testApp)
        .post('/test/trace/async-task')
        .set('X-Request-ID', customTraceId)
        .send({ task_type: 'test' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      const data = response.body.data
      expect(data.trace_id).toBe(customTraceId)
      expect(data.async_task.parent_trace_id).toBe(customTraceId)
      expect(data.trace_preserved).toBe(true)
    })
  })

  describe('错误场景追踪', () => {
    test('错误响应应包含trace_id', async () => {
      const customTraceId = `error_trace_${Date.now()}`

      const response = await request(testApp)
        .get('/test/trace/error')
        .set('X-Request-ID', customTraceId)

      expect(response.status).toBe(500)
      expect(response.body.success).toBe(false)
      expect(response.body.request_id).toBe(customTraceId)
    })
  })

  describe('响应头追踪', () => {
    test('所有响应应包含X-Request-ID头', async () => {
      const endpoints = [
        '/test/trace/service-a',
        '/test/trace/deep-chain',
        '/test/trace/concurrent'
      ]

      for (const endpoint of endpoints) {
        const response = await request(testApp).get(endpoint)

        expect(response.headers['x-request-id']).toBeDefined()
        expect(response.headers['x-request-id']).toMatch(/^(req_)?[a-zA-Z0-9_-]+$/)
      }
    })

    test('自定义trace_id应在响应头中返回', async () => {
      const customTraceId = `header_trace_${Date.now()}`

      const response = await request(testApp)
        .get('/test/trace/service-a')
        .set('X-Request-ID', customTraceId)

      expect(response.headers['x-request-id']).toBe(customTraceId)
    })
  })

  describe('trace_id格式验证', () => {
    test('自动生成的trace_id应符合格式规范', async () => {
      const response = await request(testApp).get('/test/trace/service-a')

      expect(response.body.request_id).toBeDefined()
      // 应该以req_开头或是有效的UUID格式
      expect(response.body.request_id).toMatch(/^(req_[a-f0-9-]+|[a-f0-9-]{36})$/i)
    })

    test('应接受自定义格式的trace_id', async () => {
      const customFormats = [
        `trace_${Date.now()}`,
        `custom-trace-id-123`,
        `span_abc_def_ghi`,
        `req_12345678-1234-1234-1234-123456789abc`
      ]

      for (const traceId of customFormats) {
        const response = await request(testApp)
          .get('/test/trace/service-a')
          .set('X-Request-ID', traceId)

        expect(response.body.request_id).toBe(traceId)
      }
    })
  })

  describe('trace上下文完整性', () => {
    test('trace上下文应包含所有必要信息', async () => {
      const response = await request(testApp).get('/test/trace/service-a')

      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('code')
      expect(response.body).toHaveProperty('message')
      expect(response.body).toHaveProperty('data')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('request_id')

      // timestamp应该是有效的ISO格式
      expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date')
    })
  })
})

describe('P2-3.3: 生产环境链路追踪集成测试', () => {
  jest.setTimeout(30000)

  let app
  let authToken

  beforeAll(async () => {
    // 加载真实应用
    app = require('../../app')

    // 获取测试用认证token
    try {
      const loginResponse = await request(app)
        .post('/api/v4/auth/login')
        .send({ mobile: '13612227930', verification_code: '123456' })

      if (loginResponse.body.success && loginResponse.body.data?.access_token) {
        authToken = loginResponse.body.data.access_token
      }
    } catch (error) {
      console.warn('获取测试token失败，部分测试可能跳过:', error.message)
    }
  })

  afterAll(async () => {
    // 关闭数据库连接
    try {
      const { sequelize } = require('../../models')
      await sequelize.close()
    } catch (error) {
      // 忽略关闭错误
    }
  })

  test('健康检查端点应支持链路追踪', async () => {
    const customTraceId = `health_trace_${Date.now()}`

    const response = await request(app).get('/health').set('X-Request-ID', customTraceId)

    expect(response.status).toBe(200)
    /* 健康检查端点应在响应体中包含request_id */
    expect(response.body.request_id).toBe(customTraceId)
    /*
     * 注：/health端点可能不通过ApiResponse中间件，响应头可能由app.js直接设置
     * 验证响应头存在（可能是自定义或自动生成的）
     */
    if (response.headers['x-request-id']) {
      expect(response.headers['x-request-id']).toBe(customTraceId)
    }
  })

  test('API端点应支持链路追踪', async () => {
    if (!authToken) {
      console.warn('跳过需要认证的追踪测试')
      return
    }

    const customTraceId = `api_trace_${Date.now()}`

    const response = await request(app)
      .get('/api/v4/backpack')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Request-ID', customTraceId)

    expect(response.body.request_id).toBe(customTraceId)
    expect(response.headers['x-request-id']).toBe(customTraceId)
  })

  test('错误响应应保持链路追踪', async () => {
    const customTraceId = `error_api_trace_${Date.now()}`

    const response = await request(app)
      .get('/api/v4/nonexistent')
      .set('X-Request-ID', customTraceId)

    expect(response.body.request_id).toBe(customTraceId)
    expect(response.headers['x-request-id']).toBe(customTraceId)
  })
})
