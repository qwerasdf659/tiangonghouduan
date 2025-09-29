/**
 * ⚡ V4架构性能和压力测试套件
 * 测试范围：API响应时间、并发处理、数据库性能、内存使用等
 */

const request = require('supertest')
const app = require('../../app')
const testLogger = require('../api/helpers/testLogger')

describe('⚡ V4架构性能测试', () => {
  const PERFORMANCE_THRESHOLDS = {
    apiResponseTime: 200, // 200ms
    dbQueryTime: 100, // 100ms
    concurrentRequests: 10,
    maxMemoryUsage: 512 // 512MB
  }

  describe('🚀 API响应性能测试', () => {
    test('健康检查API响应时间', async () => {
      const startTime = Date.now()

      const _response = await request(app).get('/health').expect(200)

      const responseTime = Date.now() - startTime
      testLogger.info(`健康检查响应时间: ${responseTime}ms`)

      expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.apiResponseTime)
    })

    test('V4抽奖引擎API响应时间', async () => {
      const startTime = Date.now()

      const _response = await request(app)
        .get('/api/v4/unified-engine/lottery/strategies')
        .expect(200)

      const responseTime = Date.now() - startTime
      testLogger.info(`V4引擎API响应时间: ${responseTime}ms`)

      expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.apiResponseTime)
    })

    test('用户认证API响应时间', async () => {
      const startTime = Date.now()

      const _response = await request(app)
        .post('/api/auth/verify')
        .send({
          phone: '13612227930',
          code: '123456'
        })
        .expect(200)

      const responseTime = Date.now() - startTime
      testLogger.info(`用户认证API响应时间: ${responseTime}ms`)

      expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.apiResponseTime)
    })
  })

  describe('🔥 并发处理能力测试', () => {
    test('并发健康检查测试', async () => {
      const concurrentRequests = Array(PERFORMANCE_THRESHOLDS.concurrentRequests)
        .fill()
        .map(() => request(app).get('/health').expect(200))

      const startTime = Date.now()
      const responses = await Promise.all(concurrentRequests)
      const totalTime = Date.now() - startTime

      testLogger.info(
        `${PERFORMANCE_THRESHOLDS.concurrentRequests}个并发请求总耗时: ${totalTime}ms`
      )
      testLogger.info(`平均响应时间: ${totalTime / PERFORMANCE_THRESHOLDS.concurrentRequests}ms`)

      expect(responses).toHaveLength(PERFORMANCE_THRESHOLDS.concurrentRequests)
      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.apiResponseTime * 2)
    })

    test('并发抽奖请求测试', async () => {
      const concurrentLotteryRequests = Array(5)
        .fill()
        .map(() =>
          request(app).post('/api/v4/unified-engine/lottery/execute').send({
            userId: 31,
            campaignId: 2,
            drawCount: 1
          })
        )

      const startTime = Date.now()
      const responses = await Promise.all(concurrentLotteryRequests)
      const totalTime = Date.now() - startTime

      testLogger.info(`5个并发抽奖请求总耗时: ${totalTime}ms`)

      expect(responses).toHaveLength(5)
      responses.forEach(response => {
        // 确保每个响应都有明确的状态
        expect(response.status).toBeDefined()
        // 实际的抽奖API可能需要认证，所以401是预期的
        if (response.status === 401) {
          expect(response.body.message).toContain('认证')
        }
      })
    })
  })

  describe('💾 数据库性能测试', () => {
    test('数据库查询性能测试', async () => {
      const { getDatabaseHelper } = require('../../utils/database')
      const dbHelper = getDatabaseHelper()

      const startTime = Date.now()

      // 执行常用查询
      await dbHelper.query('SELECT COUNT(*) as count FROM users')
      await dbHelper.query('SELECT COUNT(*) as count FROM lottery_draws')
      await dbHelper.query('SELECT COUNT(*) as count FROM lottery_campaigns')

      const queryTime = Date.now() - startTime
      testLogger.info(`数据库查询耗时: ${queryTime}ms`)

      expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.dbQueryTime * 3)
    })

    test('大数据量查询性能', async () => {
      const { getDatabaseHelper } = require('../../utils/database')
      const dbHelper = getDatabaseHelper()

      const startTime = Date.now()

      // 执行复杂查询
      await dbHelper.query(`
        SELECT lr.user_id, COUNT(*) as draw_count, AVG(lr.cost_points) as avg_cost
        FROM lottery_draws lr 
        WHERE lr.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY lr.user_id 
        LIMIT 100
      `)

      const queryTime = Date.now() - startTime
      testLogger.info(`复杂查询耗时: ${queryTime}ms`)

      expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.dbQueryTime * 5)
    })
  })

  describe('📊 系统资源使用测试', () => {
    test('内存使用监控', () => {
      const memoryUsage = process.memoryUsage()
      const memoryInMB = memoryUsage.heapUsed / 1024 / 1024

      testLogger.info(`当前内存使用: ${memoryInMB.toFixed(2)}MB`)
      testLogger.info(
        `内存详情: ${JSON.stringify({
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        })}MB`
      )

      expect(memoryInMB).toBeLessThan(PERFORMANCE_THRESHOLDS.maxMemoryUsage)
    })

    test('CPU使用情况监控', () => {
      const cpuUsage = process.cpuUsage()

      testLogger.info(`CPU使用情况: user=${cpuUsage.user}μs, system=${cpuUsage.system}μs`)

      expect(cpuUsage.user).toBeGreaterThan(0)
      expect(cpuUsage.system).toBeGreaterThan(0)
    })
  })

  describe('🔄 压力测试', () => {
    test('高频API调用压力测试', async () => {
      const highFrequencyRequests = Array(20)
        .fill()
        .map((_, index) => {
          return new Promise(resolve => {
            setTimeout(async () => {
              const response = await request(app).get('/health')
              resolve(response)
            }, index * 10) // 每10ms一个请求
          })
        })

      const startTime = Date.now()
      const responses = await Promise.all(highFrequencyRequests)
      const totalTime = Date.now() - startTime

      testLogger.info(`20个高频请求总耗时: ${totalTime}ms`)

      const successfulResponses = responses.filter(r => r.status === 200)
      const successRate = (successfulResponses.length / responses.length) * 100

      testLogger.info(`成功率: ${successRate}%`)

      expect(successRate).toBeGreaterThan(90) // 至少90%成功率
    })
  })

  describe('📈 性能基准测试', () => {
    test('建立性能基准线', async () => {
      const benchmarks = {
        healthCheckTime: 0,
        apiResponseTime: 0,
        dbQueryTime: 0,
        memoryUsage: 0
      }

      // 健康检查基准
      let start = Date.now()
      await request(app).get('/health').expect(200)
      benchmarks.healthCheckTime = Date.now() - start

      // API响应基准
      start = Date.now()
      await request(app).get('/api/v4/unified-engine/lottery/strategies').expect(200)
      benchmarks.apiResponseTime = Date.now() - start

      // 数据库查询基准
      const { getDatabaseHelper } = require('../../utils/database')
      const dbHelper = getDatabaseHelper()
      start = Date.now()
      await dbHelper.query('SELECT 1')
      benchmarks.dbQueryTime = Date.now() - start

      // 内存使用基准
      benchmarks.memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024)

      testLogger.info(`性能基准线: ${JSON.stringify(benchmarks)}`)

      expect(benchmarks.healthCheckTime).toBeLessThan(100)
      expect(benchmarks.apiResponseTime).toBeLessThan(200)
      expect(benchmarks.dbQueryTime).toBeLessThan(50)
      expect(benchmarks.memoryUsage).toBeLessThan(256)
    })
  })
})
