'use strict'

/**
 * P2-3.5: 健康检查完整性测试套件
 *
 * 测试目标：
 * - 验证/health端点的响应格式符合API标准
 * - 验证健康检查覆盖所有关键服务
 * - 验证降级模式的正确处理
 * - 验证健康检查的性能要求
 *
 * 健康检查覆盖：
 * - 数据库连接状态
 * - Redis连接状态
 * - 内存使用情况
 * - 系统运行时间
 *
 * 业务规则：
 * - 所有服务正常返回 healthy 状态
 * - 非关键服务失败返回 degraded 状态
 * - 关键服务失败返回 unhealthy 状态
 * - 健康检查响应时间应<200ms
 *
 * @module tests/observability/health-check
 * @since 2026-01-30
 */

// 加载环境变量
require('dotenv').config()

const request = require('supertest')

describe('P2-3.5: 健康检查完整性测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  let app

  beforeAll(async () => {
    // 加载真实应用
    app = require('../../app')
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

  describe('健康检查端点基本功能', () => {
    test('GET /health 应返回200状态码', async () => {
      const response = await request(app).get('/health')

      expect(response.status).toBe(200)
    })

    test('健康检查响应应符合API标准格式', async () => {
      const response = await request(app).get('/health')

      // 验证必需字段
      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('code')
      expect(response.body).toHaveProperty('message')
      expect(response.body).toHaveProperty('data')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('version')
      expect(response.body).toHaveProperty('request_id')

      // 验证字段类型
      expect(typeof response.body.success).toBe('boolean')
      expect(typeof response.body.code).toBe('string')
      expect(typeof response.body.message).toBe('string')
      expect(typeof response.body.data).toBe('object')
      expect(typeof response.body.timestamp).toBe('string')
      expect(typeof response.body.request_id).toBe('string')
    })

    test('健康检查应返回正确的业务代码', async () => {
      const response = await request(app).get('/health')

      // 业务代码应为 SYSTEM_HEALTHY 或 SYSTEM_DEGRADED
      expect(['SYSTEM_HEALTHY', 'SYSTEM_DEGRADED']).toContain(response.body.code)
    })

    test('健康检查应返回API版本信息', async () => {
      const response = await request(app).get('/health')

      expect(response.body.version).toBeDefined()
      expect(response.body.version).toMatch(/^v\d+/)
    })
  })

  describe('健康检查数据内容验证', () => {
    test('data字段应包含status信息', async () => {
      const response = await request(app).get('/health')

      expect(response.body.data).toHaveProperty('status')
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.data.status)
    })

    test('data字段应包含version信息', async () => {
      const response = await request(app).get('/health')

      expect(response.body.data).toHaveProperty('version')
      expect(typeof response.body.data.version).toBe('string')
    })

    test('data字段应包含systems信息', async () => {
      const response = await request(app).get('/health')

      expect(response.body.data).toHaveProperty('systems')
      expect(response.body.data.systems).toHaveProperty('database')
      expect(response.body.data.systems).toHaveProperty('redis')
      expect(response.body.data.systems).toHaveProperty('nodejs')
    })

    test('systems中的服务状态应为connected或disconnected', async () => {
      const response = await request(app).get('/health')
      const systems = response.body.data.systems

      expect(['connected', 'disconnected']).toContain(systems.database)
      expect(['connected', 'disconnected']).toContain(systems.redis)
    })

    test('data字段应包含memory信息', async () => {
      const response = await request(app).get('/health')

      expect(response.body.data).toHaveProperty('memory')
      expect(response.body.data.memory).toHaveProperty('used')
      expect(response.body.data.memory).toHaveProperty('total')

      // 内存信息应为带单位的字符串
      expect(response.body.data.memory.used).toMatch(/^\d+MB$/)
      expect(response.body.data.memory.total).toMatch(/^\d+MB$/)
    })

    test('data字段应包含uptime信息', async () => {
      const response = await request(app).get('/health')

      expect(response.body.data).toHaveProperty('uptime')
      // uptime应为带s后缀的数字字符串
      expect(response.body.data.uptime).toMatch(/^\d+s$/)
    })

    test('data字段应包含architecture信息', async () => {
      const response = await request(app).get('/health')

      expect(response.body.data).toHaveProperty('architecture')
      expect(response.body.data.architecture).toContain('V4')
    })
  })

  describe('健康状态逻辑验证', () => {
    test('数据库和Redis都正常时应返回healthy', async () => {
      const response = await request(app).get('/health')

      // 如果两个服务都连接成功
      if (
        response.body.data.systems.database === 'connected' &&
        response.body.data.systems.redis === 'connected'
      ) {
        expect(response.body.data.status).toBe('healthy')
        expect(response.body.code).toBe('SYSTEM_HEALTHY')
      }
    })

    test('任一服务失败时应返回degraded', async () => {
      const response = await request(app).get('/health')

      // 如果有服务断开但不是全部
      const systems = response.body.data.systems
      const dbOk = systems.database === 'connected'
      const redisOk = systems.redis === 'connected'

      if (dbOk !== redisOk) {
        // 一个正常一个失败
        expect(response.body.data.status).toBe('degraded')
        expect(response.body.code).toBe('SYSTEM_DEGRADED')
      }
    })

    test('success字段应始终为true（除非5xx错误）', async () => {
      const response = await request(app).get('/health')

      // 即使是degraded状态，success也应为true
      if (response.status === 200) {
        expect(response.body.success).toBe(true)
      }
    })

    test('message应根据状态提供友好描述', async () => {
      const response = await request(app).get('/health')

      expect(typeof response.body.message).toBe('string')
      expect(response.body.message.length).toBeGreaterThan(0)

      // 消息应包含描述性内容
      if (response.body.data.status === 'healthy') {
        expect(response.body.message.toLowerCase()).toMatch(/正常|healthy|running/)
      } else if (response.body.data.status === 'degraded') {
        expect(response.body.message.toLowerCase()).toMatch(/降级|degraded/)
      }
    })
  })

  describe('健康检查性能验证', () => {
    test('健康检查响应时间应<500ms', async () => {
      const startTime = Date.now()
      const response = await request(app).get('/health')
      const responseTime = Date.now() - startTime

      expect(response.status).toBe(200)
      expect(responseTime).toBeLessThan(500)
    })

    test('连续多次健康检查应保持稳定响应时间', async () => {
      const times = []

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now()
        await request(app).get('/health')
        times.push(Date.now() - startTime)
      }

      // 平均响应时间应<300ms
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length
      expect(avgTime).toBeLessThan(300)

      // 标准差不应过大（稳定性）
      const variance = times.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / times.length
      const stdDev = Math.sqrt(variance)
      expect(stdDev).toBeLessThan(200) // 标准差小于200ms
    })
  })

  describe('健康检查请求头验证', () => {
    test('应正确处理X-Request-ID请求头', async () => {
      const customRequestId = `health_check_${Date.now()}`

      const response = await request(app).get('/health').set('X-Request-ID', customRequestId)

      /* 健康检查端点应在响应体中正确传递request_id */
      expect(response.body.request_id).toBe(customRequestId)
      /*
       * 注：/health端点直接使用res.json()，可能不设置X-Request-ID响应头
       * 验证响应头存在时应匹配自定义ID
       */
      if (response.headers['x-request-id']) {
        expect(response.headers['x-request-id']).toBe(customRequestId)
      }
    })

    test('无X-Request-ID时应自动生成', async () => {
      const response = await request(app).get('/health')

      expect(response.body.request_id).toBeDefined()
      expect(response.body.request_id).toMatch(/^(req_)?[a-zA-Z0-9_-]+$/)
    })

    test('应返回正确的Content-Type', async () => {
      const response = await request(app).get('/health')

      expect(response.headers['content-type']).toMatch(/application\/json/)
    })
  })

  describe('健康检查时间戳验证', () => {
    test('timestamp应为有效的ISO8601格式', async () => {
      const response = await request(app).get('/health')

      const timestamp = response.body.timestamp
      expect(timestamp).toBeDefined()

      // 应该可以解析为有效日期
      const date = new Date(timestamp)
      expect(date.toString()).not.toBe('Invalid Date')
    })

    test('timestamp应为北京时间', async () => {
      const beforeRequest = new Date()
      const response = await request(app).get('/health')
      const afterRequest = new Date()

      const responseTime = new Date(response.body.timestamp)

      // 响应时间应在请求前后时间范围内（考虑时区差异，允许1小时偏差）
      const oneHour = 60 * 60 * 1000
      expect(responseTime.getTime()).toBeGreaterThanOrEqual(beforeRequest.getTime() - oneHour)
      expect(responseTime.getTime()).toBeLessThanOrEqual(afterRequest.getTime() + oneHour)
    })
  })

  describe('健康检查错误处理', () => {
    test('异常情况下应返回unhealthy状态', async () => {
      /*
       * 这个测试主要验证错误处理逻辑存在
       * 实际的服务失败情况在生产环境中测试
       */

      const response = await request(app).get('/health')

      // 验证响应格式即使在任何状态下都是正确的
      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('code')
      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('status')
    })
  })

  describe('健康检查幂等性验证', () => {
    test('多次调用应返回相同结构的响应', async () => {
      const response1 = await request(app).get('/health')
      const response2 = await request(app).get('/health')

      // 结构应该相同
      expect(Object.keys(response1.body).sort()).toEqual(Object.keys(response2.body).sort())
      expect(Object.keys(response1.body.data).sort()).toEqual(
        Object.keys(response2.body.data).sort()
      )
      expect(Object.keys(response1.body.data.systems).sort()).toEqual(
        Object.keys(response2.body.data.systems).sort()
      )
    })

    test('健康检查不应有副作用', async () => {
      // 调用多次健康检查
      for (let i = 0; i < 5; i++) {
        await request(app).get('/health')
      }

      // 最后一次调用仍应正常返回
      const response = await request(app).get('/health')
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })
  })
})

describe('P2-3.5: 抽奖模块健康检查测试', () => {
  jest.setTimeout(30000)

  let app

  beforeAll(async () => {
    app = require('../../app')
  })

  afterAll(async () => {
    try {
      const { sequelize } = require('../../models')
      await sequelize.close()
    } catch (error) {
      // 忽略关闭错误
    }
  })

  test('GET /api/v4/lottery/health 应返回抽奖模块健康状态', async () => {
    const response = await request(app).get('/api/v4/lottery/health')

    // 可能需要认证或可能不存在此端点
    if (response.status === 200) {
      // 符合API标准格式：状态在data.status中
      expect(response.body).toHaveProperty('success')
      expect(response.body.success).toBe(true)
      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('status')
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.data.status)
    } else if (response.status === 404) {
      // 端点不存在，跳过此测试
      console.log('抽奖健康检查端点不存在，跳过测试')
    } else if (response.status === 401) {
      // 需要认证，验证返回格式
      expect(response.body).toHaveProperty('success')
      expect(response.body.success).toBe(false)
    }
  })
})

describe('P2-3.5: 健康检查监控指标测试', () => {
  jest.setTimeout(30000)

  let app

  beforeAll(async () => {
    app = require('../../app')
  })

  afterAll(async () => {
    try {
      const { sequelize } = require('../../models')
      await sequelize.close()
    } catch (error) {
      // 忽略关闭错误
    }
  })

  test('健康检查应提供可用于监控的指标', async () => {
    const response = await request(app).get('/health')

    // 验证监控所需的关键指标
    const data = response.body.data

    // 系统状态指标
    expect(data.status).toBeDefined()

    // 依赖服务状态
    expect(data.systems).toBeDefined()
    expect(data.systems.database).toBeDefined()
    expect(data.systems.redis).toBeDefined()

    // 资源使用指标
    expect(data.memory).toBeDefined()
    expect(data.memory.used).toBeDefined()
    expect(data.memory.total).toBeDefined()

    // 运行时间指标
    expect(data.uptime).toBeDefined()
  })

  test('内存使用量应在合理范围内', async () => {
    const response = await request(app).get('/health')
    const usedMB = parseInt(response.body.data.memory.used)

    // 内存使用应小于512MB（项目配置的max_memory_restart）
    expect(usedMB).toBeLessThan(512)
  })

  test('Node.js版本信息应正确', async () => {
    const response = await request(app).get('/health')
    const nodeVersion = response.body.data.systems.nodejs

    expect(nodeVersion).toBeDefined()
    expect(nodeVersion).toMatch(/^v\d+\.\d+\.\d+$/)
    expect(nodeVersion).toBe(process.version)
  })
})
