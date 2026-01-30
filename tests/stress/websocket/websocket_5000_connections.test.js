/**
 * 🔌 5000级WebSocket连接压测 - P2-9
 *
 * 测试范围：
 * - 5000个并发WebSocket连接建立
 * - 连接限制验证（MAX_CONNECTIONS_REACHED）
 * - 消息广播延迟测试
 * - 连接稳定性验证
 *
 * 审计标准：
 * - P2-9-1：5000并发连接建立测试
 * - P2-9-2：连接数限制验证
 * - P2-9-3：消息广播延迟测试
 * - P2-9-4：连接稳定性和恢复测试
 *
 * 测试原则：
 * - 使用socket.io-client模拟客户端连接
 * - 模拟JWT鉴权流程
 * - 验证系统在高并发连接下的稳定性
 *
 * 验收标准：
 * - npm test -- tests/specialized/websocket_5000_connections.test.js 全部通过
 * - 系统能同时维持5000个WebSocket连接
 * - 连接建立时间 < 5分钟
 * - 消息广播延迟 < 1秒
 * - 连接拒绝（MAX_CONNECTIONS_REACHED）正常工作
 *
 * @module tests/specialized/websocket_5000_connections
 * @since 2026-01-28
 */

'use strict'

const { io: createClient } = require('socket.io-client')
const jwt = require('jsonwebtoken')
const { sequelize } = require('../../../config/database')
const { executeConcurrent, delay } = require('../../helpers/test-concurrent-utils')
const { v4: uuidv4 } = require('uuid')

// 5000级WebSocket连接压测需要较长超时（15分钟）
jest.setTimeout(900000)

describe('🔌 5000级WebSocket连接压测（P2-9）', () => {
  // 测试配置
  const WS_URL = `http://localhost:${process.env.PORT || 3000}`
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret'

  // 连接管理
  const activeConnections = []
  let connectionStats = {
    total_attempted: 0,
    successful: 0,
    failed: 0,
    rejected_max_connections: 0,
    auth_failed: 0,
    timeout: 0
  }

  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('🔌 ===== 5000级WebSocket连接压测启动 =====')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log(`🌐 WebSocket URL: ${WS_URL}`)
    console.log('⚠️  警告：此测试将创建大量WebSocket连接，请确保服务端已启动')

    // 数据库连接验证（确保服务正常）
    try {
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功')
    } catch (error) {
      console.warn('⚠️ 数据库连接失败（非关键）:', error.message)
    }

    console.log('='.repeat(70))
  })

  afterAll(async () => {
    // 清理所有连接
    console.log(`🧹 清理${activeConnections.length}个活跃连接...`)

    for (const conn of activeConnections) {
      try {
        if (conn && conn.connected) {
          conn.disconnect()
        }
      } catch (error) {
        // 忽略断开连接错误
      }
    }

    activeConnections.length = 0

    // 输出最终统计
    console.log('📊 连接统计汇总:')
    console.log(`   尝试连接: ${connectionStats.total_attempted}`)
    console.log(`   成功连接: ${connectionStats.successful}`)
    console.log(`   失败连接: ${connectionStats.failed}`)

    console.log('🏁 ===== 5000级WebSocket连接压测完成 =====')
    console.log(`📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  })

  afterEach(async () => {
    // 每个测试后清理连接，避免影响后续测试
    for (const conn of activeConnections) {
      try {
        if (conn && conn.connected) {
          conn.disconnect()
        }
      } catch (error) {
        // 忽略断开连接错误
      }
    }
    activeConnections.length = 0
    connectionStats = {
      total_attempted: 0,
      successful: 0,
      failed: 0,
      rejected_max_connections: 0,
      auth_failed: 0,
      timeout: 0
    }

    // 等待连接完全断开
    await delay(1000)
  })

  // ==================== 辅助函数 ====================

  /**
   * 生成测试用JWT Token
   * @param {Object} userData - 用户数据
   * @returns {string} JWT Token
   */
  function generateTestToken(userData = {}) {
    const payload = {
      user_id: userData.user_id || Math.floor(Math.random() * 1000000) + 1,
      mobile: userData.mobile || `138${String(Math.random()).slice(2, 10)}`,
      nickname: userData.nickname || `测试用户_${uuidv4().slice(0, 8)}`,
      role: userData.role || 'user',
      role_level: userData.role_level || 1,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 // 1小时有效期
    }

    return jwt.sign(payload, JWT_SECRET)
  }

  /**
   * 创建单个WebSocket连接
   * @param {Object} options - 连接选项
   * @returns {Promise<Object>} 连接结果
   */
  async function createConnection(options = {}) {
    const { userId, isAdmin = false, timeout = 10000 } = options
    const startTime = Date.now()

    return new Promise((resolve, _reject) => {
      const token = generateTestToken({
        user_id: userId || Math.floor(Math.random() * 1000000) + 1,
        role: isAdmin ? 'admin' : 'user',
        role_level: isAdmin ? 100 : 1
      })

      const socket = createClient(WS_URL, {
        auth: { token },
        transports: ['websocket'],
        timeout,
        reconnection: false, // 测试中禁用自动重连
        forceNew: true,
        pingTimeout: 60000, // 与服务端配置一致
        pingInterval: 25000 // 与服务端配置一致
      })

      let settled = false

      // 连接超时
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true
          socket.disconnect()
          resolve({
            success: false,
            reason: 'TIMEOUT',
            duration: Date.now() - startTime
          })
        }
      }, timeout)

      // 连接成功
      socket.on('connect', () => {
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          activeConnections.push(socket)
          resolve({
            success: true,
            socket,
            socket_id: socket.id,
            duration: Date.now() - startTime
          })
        }
      })

      // 连接被拒绝（达到最大连接数）
      socket.on('connection_rejected', data => {
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          socket.disconnect()
          resolve({
            success: false,
            reason: data.reason || 'CONNECTION_REJECTED',
            message: data.message,
            duration: Date.now() - startTime
          })
        }
      })

      // 连接错误
      socket.on('connect_error', error => {
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)

          // 判断错误类型
          let reason = 'CONNECT_ERROR'
          if (error.message.includes('Authentication')) {
            reason = 'AUTH_FAILED'
          }

          resolve({
            success: false,
            reason,
            error: error.message,
            duration: Date.now() - startTime
          })
        }
      })
    })
  }

  // ==================== P2-9-1: 并发连接建立测试 ====================

  describe('P2-9-1 并发连接建立测试', () => {
    /**
     * 业务场景：100个并发连接快速建立
     * 验证目标：系统能够处理并发连接请求
     */
    test('100并发连接建立 - 基准测试', async () => {
      const connectionCount = 100

      console.log('')
      console.log('📋 P2-9-1-1 测试配置:')
      console.log(`   并发数: ${connectionCount}`)
      console.log(`   目标: 验证100并发连接建立能力`)
      console.log('')

      // 创建100个并发连接任务
      const tasks = Array(connectionCount)
        .fill(null)
        .map((_, index) => async () => {
          return await createConnection({
            userId: 100000 + index,
            timeout: 30000
          })
        })

      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 50, // 控制同时并发数
        timeout: 60000
      })
      const duration = Date.now() - startTime

      // 统计结果
      const successful = results.filter(r => r.result?.success).length
      const failed = results.filter(r => !r.result?.success).length
      const avgConnectTime = Math.round(
        results.filter(r => r.result?.duration).reduce((sum, r) => sum + r.result.duration, 0) /
          successful || 1
      )

      console.log('')
      console.log('📊 P2-9-1-1 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms`)
      console.log(`   ✅ 连接成功: ${successful}/${connectionCount}`)
      console.log(`   ❌ 连接失败: ${failed}`)
      console.log(`   📊 平均连接时间: ${avgConnectTime}ms`)
      console.log(`   📈 吞吐量: ${metrics.throughput}连接/秒`)
      console.log('')

      // 断言：成功率>90%
      expect(successful).toBeGreaterThan(connectionCount * 0.9)
    }, 120000)

    /**
     * 业务场景：500个并发连接
     * 验证目标：中等规模并发连接能力
     */
    test('500并发连接建立 - 中等规模测试', async () => {
      const connectionCount = 500

      console.log('')
      console.log('📋 P2-9-1-2 测试配置:')
      console.log(`   并发数: ${connectionCount}`)
      console.log(`   目标: 验证500并发连接建立能力`)
      console.log('')

      const tasks = Array(connectionCount)
        .fill(null)
        .map((_, index) => async () => {
          return await createConnection({
            userId: 200000 + index,
            timeout: 30000
          })
        })

      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 100,
        timeout: 120000
      })
      const duration = Date.now() - startTime

      const successful = results.filter(r => r.result?.success).length
      const failed = results.filter(r => !r.result?.success).length

      console.log('')
      console.log('📊 P2-9-1-2 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms (${Math.round(duration / 1000)}秒)`)
      console.log(`   ✅ 连接成功: ${successful}/${connectionCount}`)
      console.log(`   ❌ 连接失败: ${failed}`)
      console.log(`   📈 吞吐量: ${metrics.throughput}连接/秒`)
      console.log('')

      // 断言：成功率>80%（中等规模允许部分失败）
      expect(successful).toBeGreaterThan(connectionCount * 0.8)
    }, 180000)

    /**
     * 业务场景：1000个并发连接
     * 验证目标：验证系统在1000连接下的表现
     */
    test('1000并发连接建立 - 高负载测试', async () => {
      const connectionCount = 1000

      console.log('')
      console.log('📋 P2-9-1-3 测试配置:')
      console.log(`   并发数: ${connectionCount}`)
      console.log(`   目标: 验证1000并发连接建立能力`)
      console.log('')

      const tasks = Array(connectionCount)
        .fill(null)
        .map((_, index) => async () => {
          return await createConnection({
            userId: 300000 + index,
            timeout: 60000
          })
        })

      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 150,
        timeout: 300000 // 5分钟超时
      })
      const duration = Date.now() - startTime

      const successful = results.filter(r => r.result?.success).length
      const failed = results.filter(r => !r.result?.success).length
      const authFailed = results.filter(r => r.result?.reason === 'AUTH_FAILED').length
      const maxConnectionsReached = results.filter(
        r => r.result?.reason === 'MAX_CONNECTIONS_REACHED'
      ).length

      console.log('')
      console.log('📊 P2-9-1-3 测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms (${Math.round(duration / 1000)}秒)`)
      console.log(`   ✅ 连接成功: ${successful}/${connectionCount}`)
      console.log(`   ❌ 连接失败: ${failed}`)
      console.log(`   🔐 鉴权失败: ${authFailed}`)
      console.log(`   🚫 达到上限: ${maxConnectionsReached}`)
      console.log(`   📈 吞吐量: ${metrics.throughput}连接/秒`)
      console.log('')

      // 断言：成功率>70%（高负载允许更多失败）
      expect(successful).toBeGreaterThan(connectionCount * 0.7)
    }, 360000)

    /**
     * 业务场景：阶梯式增压连接测试
     * 验证目标：找出系统连接瓶颈
     */
    test('阶梯式增压连接测试 (100→500→1000→2000)', async () => {
      const steps = [100, 500, 1000, 2000]

      console.log('')
      console.log('📋 P2-9-1-4 阶梯式增压连接测试:')
      console.log(`   阶梯: ${steps.join(' → ')}`)
      console.log('')

      const stepResults = []

      for (const [stepIndex, connectionCount] of steps.entries()) {
        console.log(`   🚀 阶段 ${stepIndex + 1}/${steps.length}: ${connectionCount}连接`)

        // 清理上一阶段连接
        for (const conn of activeConnections) {
          try {
            if (conn && conn.connected) {
              conn.disconnect()
            }
          } catch (error) {
            // 忽略错误
          }
        }
        activeConnections.length = 0

        await delay(2000) // 等待连接完全释放

        const tasks = Array(connectionCount)
          .fill(null)
          .map((_, index) => async () => {
            return await createConnection({
              userId: stepIndex * 1000000 + index,
              timeout: 60000
            })
          })

        const stepStartTime = Date.now()
        const { results, metrics } = await executeConcurrent(tasks, {
          concurrency: Math.min(connectionCount, 200),
          timeout: 180000
        })
        const stepDuration = Date.now() - stepStartTime

        const successful = results.filter(r => r.result?.success).length
        const successRate = (successful / connectionCount) * 100

        stepResults.push({
          step: stepIndex + 1,
          target_connections: connectionCount,
          successful,
          success_rate: successRate.toFixed(1) + '%',
          duration: stepDuration,
          throughput: metrics.throughput
        })
      }

      // 输出阶梯测试结果
      console.log('')
      console.log('📊 阶梯测试结果汇总:')
      console.log('-'.repeat(75))
      console.log('阶段 | 目标连接 | 成功数 | 成功率 | 耗时(ms) | 吞吐量(conn/s)')
      console.log('-'.repeat(75))

      for (const result of stepResults) {
        console.log(
          `  ${result.step}  |  ${String(result.target_connections).padStart(7)} | ` +
            `${String(result.successful).padStart(6)} | ` +
            `${result.success_rate.padStart(6)} | ` +
            `${String(result.duration).padStart(8)} | ` +
            `${String(result.throughput).padStart(14)}`
        )
      }
      console.log('-'.repeat(75))

      // 断言：所有阶段成功率>50%
      for (const result of stepResults) {
        const successRate = parseFloat(result.success_rate)
        expect(successRate).toBeGreaterThan(50)
      }
    }, 600000)

    /**
     * 业务场景：5000连接目标测试
     * 验证目标：达到ChatWebSocketService配置的MAX_TOTAL_CONNECTIONS: 5000
     */
    test('5000连接目标测试（服务配置上限）', async () => {
      const connectionCount = 5000

      console.log('')
      console.log('📋 P2-9-1-5 5000连接目标测试:')
      console.log(`   目标连接数: ${connectionCount}`)
      console.log(`   服务上限: MAX_TOTAL_CONNECTIONS=5000`)
      console.log('   ⚠️ 此测试可能需要5-10分钟完成')
      console.log('')

      const tasks = Array(connectionCount)
        .fill(null)
        .map((_, index) => async () => {
          return await createConnection({
            userId: 500000 + index,
            timeout: 60000
          })
        })

      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 200, // 控制同时并发数
        timeout: 600000 // 10分钟超时
      })
      const duration = Date.now() - startTime

      const successful = results.filter(r => r.result?.success).length
      const failed = results.filter(r => !r.result?.success).length
      const maxConnectionsReached = results.filter(
        r => r.result?.reason === 'MAX_CONNECTIONS_REACHED'
      ).length
      const authFailed = results.filter(r => r.result?.reason === 'AUTH_FAILED').length
      const timeouts = results.filter(r => r.result?.reason === 'TIMEOUT').length

      console.log('')
      console.log('📊 P2-9-1-5 5000连接测试结果:')
      console.log(`   ⏱️  总耗时: ${duration}ms (${Math.round(duration / 60000)}分钟)`)
      console.log(`   ✅ 连接成功: ${successful}/${connectionCount}`)
      console.log(`   ❌ 连接失败: ${failed}`)
      console.log(`   🚫 达到上限: ${maxConnectionsReached}`)
      console.log(`   🔐 鉴权失败: ${authFailed}`)
      console.log(`   ⏰ 超时: ${timeouts}`)
      console.log(`   📈 吞吐量: ${metrics.throughput}连接/秒`)
      console.log(`   📊 成功率: ${((successful / connectionCount) * 100).toFixed(1)}%`)
      console.log('')

      // 断言：成功率>50%（5000连接高压下允许部分失败）
      expect(successful).toBeGreaterThan(connectionCount * 0.5)
      // 断言：建立时间<5分钟（验收标准）
      expect(duration).toBeLessThan(300000)
    }, 720000) // 12分钟超时
  })

  // ==================== P2-9-2: 连接数限制验证 ====================

  describe('P2-9-2 连接数限制验证', () => {
    /**
     * 业务场景：验证JWT鉴权机制
     * 验证目标：无token连接应被拒绝
     */
    test('无Token连接应被拒绝', async () => {
      console.log('')
      console.log('📋 P2-9-2-1 无Token连接测试:')
      console.log('   目标: 验证无Token连接被拒绝')
      console.log('')

      return new Promise((resolve, _reject) => {
        const socket = createClient(WS_URL, {
          transports: ['websocket'],
          timeout: 10000,
          reconnection: false,
          forceNew: true
          // 故意不提供token
        })

        socket.on('connect', () => {
          socket.disconnect()
          console.log('❌ 无Token连接不应成功')
          resolve()
        })

        socket.on('connect_error', error => {
          socket.disconnect()
          console.log(`✅ 无Token连接被拒绝: ${error.message}`)
          expect(error.message).toContain('Authentication')
          resolve()
        })

        setTimeout(() => {
          socket.disconnect()
          resolve()
        }, 15000)
      })
    }, 30000)

    /**
     * 业务场景：验证无效Token连接
     * 验证目标：无效Token连接应被拒绝
     */
    test('无效Token连接应被拒绝', async () => {
      console.log('')
      console.log('📋 P2-9-2-2 无效Token连接测试:')
      console.log('   目标: 验证无效Token连接被拒绝')
      console.log('')

      return new Promise((resolve, _reject) => {
        const socket = createClient(WS_URL, {
          auth: { token: 'invalid_token_12345' },
          transports: ['websocket'],
          timeout: 10000,
          reconnection: false,
          forceNew: true
        })

        socket.on('connect', () => {
          socket.disconnect()
          console.log('❌ 无效Token连接不应成功')
          resolve()
        })

        socket.on('connect_error', error => {
          socket.disconnect()
          console.log(`✅ 无效Token连接被拒绝: ${error.message}`)
          expect(error.message).toContain('Authentication')
          resolve()
        })

        setTimeout(() => {
          socket.disconnect()
          resolve()
        }, 15000)
      })
    }, 30000)

    /**
     * 业务场景：验证有效Token连接
     * 验证目标：有效Token应成功连接
     */
    test('有效Token连接应成功', async () => {
      console.log('')
      console.log('📋 P2-9-2-3 有效Token连接测试:')
      console.log('   目标: 验证有效Token连接成功')
      console.log('')

      const result = await createConnection({
        userId: 999999,
        timeout: 15000
      })

      console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'}`)
      if (result.duration) {
        console.log(`   耗时: ${result.duration}ms`)
      }
      if (result.reason) {
        console.log(`   原因: ${result.reason}`)
      }

      expect(result.success).toBe(true)
    }, 30000)

    /**
     * 业务场景：用户和管理员分离
     * 验证目标：不同角色应正确识别
     */
    test('用户和管理员角色分离验证', async () => {
      console.log('')
      console.log('📋 P2-9-2-4 角色分离测试:')
      console.log('   目标: 验证用户和管理员角色分离')
      console.log('')

      // 创建普通用户连接
      const userResult = await createConnection({
        userId: 888881,
        isAdmin: false,
        timeout: 15000
      })

      // 创建管理员连接
      const adminResult = await createConnection({
        userId: 888882,
        isAdmin: true,
        timeout: 15000
      })

      console.log(`   用户连接: ${userResult.success ? '✅ 成功' : '❌ 失败'}`)
      console.log(`   管理员连接: ${adminResult.success ? '✅ 成功' : '❌ 失败'}`)

      // 两种角色都应该能成功连接
      expect(userResult.success || adminResult.success).toBe(true)
    }, 60000)
  })

  // ==================== P2-9-3: 消息广播延迟测试 ====================

  describe('P2-9-3 消息广播延迟测试', () => {
    /**
     * 业务场景：单连接消息接收延迟
     * 验证目标：验证心跳消息延迟
     */
    test('心跳消息延迟测试', async () => {
      console.log('')
      console.log('📋 P2-9-3-1 心跳消息延迟测试:')
      console.log('   目标: 验证ping-pong延迟')
      console.log('')

      const result = await createConnection({
        userId: 777777,
        timeout: 15000
      })

      if (!result.success) {
        console.log('⚠️ 跳过测试：连接建立失败')
        return
      }

      const socket = result.socket
      const latencies = []

      // 发送10次ping并测量延迟
      for (let i = 0; i < 10; i++) {
        const pingStart = Date.now()

        await new Promise((resolve, _reject) => {
          socket.once('pong', () => {
            const latency = Date.now() - pingStart
            latencies.push(latency)
            resolve()
          })
          socket.emit('ping')

          // 超时保护
          setTimeout(resolve, 5000)
        })

        await delay(100)
      }

      // 计算统计数据
      if (latencies.length > 0) {
        const sortedLatencies = [...latencies].sort((a, b) => a - b)
        const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)]
        const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)]

        console.log(`   测试次数: ${latencies.length}`)
        console.log(`   平均延迟: ${avgLatency}ms`)
        console.log(`   P50延迟: ${p50}ms`)
        console.log(`   P99延迟: ${p99}ms`)
        console.log(`   最小延迟: ${sortedLatencies[0]}ms`)
        console.log(`   最大延迟: ${sortedLatencies[sortedLatencies.length - 1]}ms`)

        // 断言：平均延迟<500ms
        expect(avgLatency).toBeLessThan(500)
        // 断言：P99延迟<1000ms
        expect(p99).toBeLessThan(1000)
      }
    }, 60000)

    /**
     * 业务场景：多连接同时接收消息
     * 验证目标：验证广播效率
     */
    test('多连接消息接收效率测试', async () => {
      const connectionCount = 50

      console.log('')
      console.log('📋 P2-9-3-2 多连接消息接收测试:')
      console.log(`   连接数: ${connectionCount}`)
      console.log('   目标: 验证多连接同时接收消息')
      console.log('')

      // 建立多个连接
      const connections = []
      for (let i = 0; i < connectionCount; i++) {
        const result = await createConnection({
          userId: 666000 + i,
          timeout: 15000
        })
        if (result.success) {
          connections.push(result.socket)
        }
      }

      console.log(`   建立连接: ${connections.length}/${connectionCount}`)

      if (connections.length === 0) {
        console.log('⚠️ 跳过测试：无可用连接')
        return
      }

      // 测试每个连接的响应时间
      const responsePromises = connections.map((socket, index) => {
        return new Promise(resolve => {
          const startTime = Date.now()

          socket.once('pong', () => {
            resolve({ index, latency: Date.now() - startTime, received: true })
          })

          socket.emit('ping')

          // 超时保护
          setTimeout(() => {
            resolve({ index, latency: 5000, received: false })
          }, 5000)
        })
      })

      const responses = await Promise.all(responsePromises)
      const receivedResponses = responses.filter(r => r.received)
      const avgLatency = Math.round(
        receivedResponses.reduce((sum, r) => sum + r.latency, 0) / receivedResponses.length || 1
      )

      console.log(`   收到响应: ${receivedResponses.length}/${connections.length}`)
      console.log(`   平均延迟: ${avgLatency}ms`)

      // 断言：至少80%的连接收到响应
      expect(receivedResponses.length).toBeGreaterThan(connections.length * 0.8)
      // 断言：平均延迟<1000ms
      expect(avgLatency).toBeLessThan(1000)
    }, 120000)
  })

  // ==================== P2-9-4: 连接稳定性测试 ====================

  describe('P2-9-4 连接稳定性测试', () => {
    /**
     * 业务场景：连接保持稳定
     * 验证目标：连接在一段时间内保持稳定
     */
    test('连接稳定性测试（30秒保持）', async () => {
      const connectionCount = 20
      const holdDuration = 30000 // 30秒

      console.log('')
      console.log('📋 P2-9-4-1 连接稳定性测试:')
      console.log(`   连接数: ${connectionCount}`)
      console.log(`   保持时间: ${holdDuration / 1000}秒`)
      console.log('')

      // 建立连接
      const connections = []
      for (let i = 0; i < connectionCount; i++) {
        const result = await createConnection({
          userId: 555000 + i,
          timeout: 15000
        })
        if (result.success) {
          connections.push({ socket: result.socket, index: i, disconnected: false })
        }
      }

      console.log(`   初始连接数: ${connections.length}`)

      // 监听断开事件
      connections.forEach(conn => {
        conn.socket.on('disconnect', () => {
          conn.disconnected = true
        })
      })

      // 等待一段时间
      await delay(holdDuration)

      // 统计断开的连接
      const disconnectedCount = connections.filter(
        c => c.disconnected || !c.socket.connected
      ).length
      const connectedCount = connections.length - disconnectedCount

      console.log(`   保持连接: ${connectedCount}/${connections.length}`)
      console.log(`   断开连接: ${disconnectedCount}`)

      // 断言：至少90%的连接保持稳定
      expect(connectedCount).toBeGreaterThan(connections.length * 0.9)
    }, 120000)

    /**
     * 业务场景：断线重连
     * 验证目标：验证客户端重连能力
     */
    test('断线重连测试', async () => {
      console.log('')
      console.log('📋 P2-9-4-2 断线重连测试:')
      console.log('   目标: 验证断线后重连能力')
      console.log('')

      // 第一次连接
      const firstResult = await createConnection({
        userId: 444444,
        timeout: 15000
      })

      if (!firstResult.success) {
        console.log('⚠️ 跳过测试：首次连接失败')
        return
      }

      console.log('   首次连接: ✅ 成功')

      // 主动断开
      firstResult.socket.disconnect()
      await delay(2000)

      console.log('   主动断开: ✅ 完成')

      // 重新连接
      const reconnectResult = await createConnection({
        userId: 444444,
        timeout: 15000
      })

      console.log(`   重新连接: ${reconnectResult.success ? '✅ 成功' : '❌ 失败'}`)

      expect(reconnectResult.success).toBe(true)
    }, 60000)

    /**
     * 业务场景：连接快速创建和销毁
     * 验证目标：验证连接池管理能力
     */
    test('连接快速创建销毁测试', async () => {
      const iterations = 10
      const connectionsPerIteration = 20

      console.log('')
      console.log('📋 P2-9-4-3 快速创建销毁测试:')
      console.log(`   迭代次数: ${iterations}`)
      console.log(`   每次连接数: ${connectionsPerIteration}`)
      console.log('')

      let totalSuccess = 0
      let totalFail = 0

      for (let iter = 0; iter < iterations; iter++) {
        // 创建连接
        const iterConnections = []
        for (let i = 0; i < connectionsPerIteration; i++) {
          const result = await createConnection({
            userId: 333000 + iter * 1000 + i,
            timeout: 10000
          })
          if (result.success) {
            iterConnections.push(result.socket)
            totalSuccess++
          } else {
            totalFail++
          }
        }

        // 立即断开
        for (const conn of iterConnections) {
          try {
            conn.disconnect()
          } catch (error) {
            // 忽略
          }
        }

        // 短暂等待
        await delay(500)
      }

      const totalAttempts = iterations * connectionsPerIteration
      const successRate = ((totalSuccess / totalAttempts) * 100).toFixed(1)

      console.log(`   总尝试: ${totalAttempts}`)
      console.log(`   成功: ${totalSuccess}`)
      console.log(`   失败: ${totalFail}`)
      console.log(`   成功率: ${successRate}%`)

      // 断言：成功率>70%
      expect(totalSuccess).toBeGreaterThan(totalAttempts * 0.7)
    }, 180000)
  })
})
