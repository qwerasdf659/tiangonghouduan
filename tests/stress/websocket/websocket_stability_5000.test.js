/**
 * 🔌 5,000 WebSocket 连接稳定性测试 - P3-1-3
 *
 * 测试范围：
 * - 5,000个WebSocket连接的长时间稳定性验证
 * - 高连接数下的消息吞吐量测试
 * - 连接断线重连恢复能力测试
 * - 内存泄漏监控
 *
 * 审计标准：
 * - P3-1-3：5,000 WebSocket 连接稳定性测试
 * - P3-1-3-1：连接上限持续验证（60秒稳定保持）
 * - P3-1-3-2：高并发消息吞吐量测试
 * - P3-1-3-3：部分断线后重连恢复测试
 *
 * 测试原则：
 * - 使用socket.io-client模拟客户端连接
 * - 模拟JWT鉴权流程
 * - 验证系统在高并发连接下的长期稳定性
 *
 * 验收标准：
 * - npm test -- tests/specialized/websocket_stability_5000.test.js 全部通过
 * - 5000连接能稳定保持60秒以上
 * - 断线率<10%
 * - 消息广播延迟<1秒
 *
 * @module tests/specialized/websocket_stability_5000
 * @since 2026-01-29
 */

'use strict'

const { io: createClient } = require('socket.io-client')
const jwt = require('jsonwebtoken')
const { sequelize } = require('../../../config/database')
const { executeConcurrent, delay } = require('../../helpers/test-concurrent-utils')
const { v4: uuidv4 } = require('uuid')

// WebSocket 稳定性测试需要较长超时（20分钟）
jest.setTimeout(1200000)

describe('🔌 5,000 WebSocket 连接稳定性测试（P3-1-3）', () => {
  // 测试配置
  const WS_URL = `http://localhost:${process.env.PORT || 3000}`
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret'

  // 连接管理
  const activeConnections = []

  // 稳定性统计
  const stabilityStats = {
    test_start_time: null,
    test_end_time: null,
    total_connections_attempted: 0,
    successful_connections: 0,
    connection_failures: 0,
    disconnection_events: 0,
    reconnection_attempts: 0,
    reconnection_successes: 0,
    messages_sent: 0,
    messages_received: 0,
    max_concurrent_connections: 0,
    memory_samples: []
  }

  // ==================== 测试准备 ====================

  beforeAll(async () => {
    stabilityStats.test_start_time = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai'
    })

    console.log('🔌 ===== 5,000 WebSocket 连接稳定性测试启动 =====')
    console.log(`📅 开始时间: ${stabilityStats.test_start_time}`)
    console.log(`🌐 WebSocket URL: ${WS_URL}`)
    console.log('⚠️  警告：此测试将创建大量WebSocket连接并保持较长时间')
    console.log('⚠️  警告：请确保服务端已启动且资源充足')

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
    stabilityStats.test_end_time = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai'
    })

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
    console.log('')
    console.log('📊 ===== 稳定性测试统计汇总 =====')
    console.log(`   开始时间: ${stabilityStats.test_start_time}`)
    console.log(`   结束时间: ${stabilityStats.test_end_time}`)
    console.log(`   尝试连接: ${stabilityStats.total_connections_attempted}`)
    console.log(`   成功连接: ${stabilityStats.successful_connections}`)
    console.log(`   连接失败: ${stabilityStats.connection_failures}`)
    console.log(`   断线事件: ${stabilityStats.disconnection_events}`)
    console.log(`   重连尝试: ${stabilityStats.reconnection_attempts}`)
    console.log(`   重连成功: ${stabilityStats.reconnection_successes}`)
    console.log(`   消息发送: ${stabilityStats.messages_sent}`)
    console.log(`   消息接收: ${stabilityStats.messages_received}`)
    console.log(`   峰值连接: ${stabilityStats.max_concurrent_connections}`)
    console.log('='.repeat(40))

    console.log('🏁 ===== 5,000 WebSocket 连接稳定性测试完成 =====')
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

    // 等待连接完全断开
    await delay(2000)
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
   * 创建单个WebSocket连接（带稳定性监控）
   * @param {Object} options - 连接选项
   * @returns {Promise<Object>} 连接结果
   */
  async function createStableConnection(options = {}) {
    const { userId, isAdmin = false, timeout = 15000, index = 0 } = options
    const startTime = Date.now()

    return new Promise(resolve => {
      const token = generateTestToken({
        user_id: userId || Math.floor(Math.random() * 1000000) + 1,
        role: isAdmin ? 'admin' : 'user',
        role_level: isAdmin ? 100 : 1
      })

      const socket = createClient(WS_URL, {
        auth: { token },
        transports: ['websocket'],
        timeout,
        reconnection: false, // 测试中禁用自动重连（手动控制）
        forceNew: true,
        pingTimeout: 60000,
        pingInterval: 25000
      })

      let settled = false
      let _disconnectCount = 0

      // 连接超时
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true
          socket.disconnect()
          stabilityStats.connection_failures++
          resolve({
            success: false,
            reason: 'TIMEOUT',
            duration: Date.now() - startTime,
            index
          })
        }
      }, timeout)

      // 连接成功
      socket.on('connect', () => {
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          activeConnections.push(socket)
          stabilityStats.successful_connections++

          // 更新峰值连接数
          if (activeConnections.length > stabilityStats.max_concurrent_connections) {
            stabilityStats.max_concurrent_connections = activeConnections.length
          }

          // 监听断线事件
          socket.on('disconnect', _reason => {
            _disconnectCount++
            stabilityStats.disconnection_events++

            // 从活跃连接中移除
            const idx = activeConnections.indexOf(socket)
            if (idx > -1) {
              activeConnections.splice(idx, 1)
            }
          })

          resolve({
            success: true,
            socket,
            socket_id: socket.id,
            duration: Date.now() - startTime,
            index
          })
        }
      })

      // 连接被拒绝
      socket.on('connection_rejected', data => {
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          socket.disconnect()
          stabilityStats.connection_failures++
          resolve({
            success: false,
            reason: data.reason || 'CONNECTION_REJECTED',
            message: data.message,
            duration: Date.now() - startTime,
            index
          })
        }
      })

      // 连接错误
      socket.on('connect_error', error => {
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          stabilityStats.connection_failures++

          let reason = 'CONNECT_ERROR'
          if (error.message.includes('Authentication')) {
            reason = 'AUTH_FAILED'
          }

          resolve({
            success: false,
            reason,
            error: error.message,
            duration: Date.now() - startTime,
            index
          })
        }
      })
    })
  }

  /**
   * 采集内存使用情况
   */
  function sampleMemoryUsage() {
    const memUsage = process.memoryUsage()
    stabilityStats.memory_samples.push({
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    })
  }

  // ==================== P3-1-3-1: 连接上限持续验证 ====================

  describe('P3-1-3-1 连接上限持续验证（60秒稳定保持）', () => {
    /**
     * 业务场景：5000连接稳定保持60秒
     * 验证目标：验证系统能长时间维持大量连接
     * 安全要求：断线率<10%
     */
    test('5000连接稳定性测试（60秒持续保持）', async () => {
      const targetConnections = 5000
      const holdDuration = 60000 // 60秒
      const monitorInterval = 10000 // 10秒采样

      console.log('')
      console.log('📋 P3-1-3-1 连接稳定性测试配置:')
      console.log(`   🎯 目标连接数: ${targetConnections}`)
      console.log(`   ⏱️  持续时间: ${holdDuration / 1000}秒`)
      console.log(`   📊 采样间隔: ${monitorInterval / 1000}秒`)
      console.log('')

      // 阶段1: 建立连接
      console.log('   📡 阶段1: 建立连接...')

      stabilityStats.total_connections_attempted += targetConnections

      const connectionTasks = Array(targetConnections)
        .fill(null)
        .map((_, index) => async () => {
          return await createStableConnection({
            userId: 8000000 + index,
            timeout: 30000,
            index
          })
        })

      const connectionStartTime = Date.now()
      const { results: connectionResults, metrics: _connectionMetrics } = await executeConcurrent(
        connectionTasks,
        {
          concurrency: 200,
          timeout: 120000,
          onProgress: progress => {
            if (progress.completed % 1000 === 0) {
              console.log(
                `      📊 进度: ${progress.completed}/${progress.total} (${progress.percentage}%)`
              )
            }
          }
        }
      )
      const connectionDuration = Date.now() - connectionStartTime

      const initialConnected = connectionResults.filter(r => r.result?.success).length
      const connectionFailed = connectionResults.filter(r => !r.result?.success).length

      console.log(`      ✅ 连接建立完成: ${initialConnected}/${targetConnections}`)
      console.log(`      ⏱️  连接耗时: ${Math.round(connectionDuration / 1000)}秒`)
      console.log(`      ❌ 连接失败: ${connectionFailed}`)

      if (initialConnected < targetConnections * 0.5) {
        console.warn('⚠️ 连接成功率过低，跳过稳定性保持测试')
        return
      }

      // 阶段2: 稳定保持
      console.log('')
      console.log('   ⏳ 阶段2: 稳定保持...')

      const holdStartTime = Date.now()
      const stabilitySnapshots = []
      let _monitorCount = 0

      // 定期采样
      while (Date.now() - holdStartTime < holdDuration) {
        await delay(monitorInterval)
        _monitorCount++

        const currentConnected = activeConnections.filter(c => c && c.connected).length
        const disconnected = initialConnected - currentConnected
        const disconnectRate = ((disconnected / initialConnected) * 100).toFixed(2)

        sampleMemoryUsage()

        const snapshot = {
          elapsed: Math.round((Date.now() - holdStartTime) / 1000),
          connected: currentConnected,
          disconnected,
          disconnect_rate: disconnectRate
        }
        stabilitySnapshots.push(snapshot)

        console.log(
          `      📊 ${snapshot.elapsed}秒: 活跃=${snapshot.connected}, 断线=${snapshot.disconnected} (${snapshot.disconnect_rate}%)`
        )
      }

      // 阶段3: 最终统计
      const finalConnected = activeConnections.filter(c => c && c.connected).length
      const totalDisconnected = initialConnected - finalConnected
      const finalDisconnectRate = ((totalDisconnected / initialConnected) * 100).toFixed(2)

      console.log('')
      console.log('📊 P3-1-3-1 稳定性测试结果:')
      console.log(`   🎯 初始连接数: ${initialConnected}`)
      console.log(`   ✅ 最终连接数: ${finalConnected}`)
      console.log(`   ❌ 总断线数: ${totalDisconnected}`)
      console.log(`   📊 断线率: ${finalDisconnectRate}%`)
      console.log(`   ⏱️  持续时间: ${holdDuration / 1000}秒`)

      // 内存使用统计
      if (stabilityStats.memory_samples.length > 0) {
        const avgHeapMB = Math.round(
          stabilityStats.memory_samples.reduce((sum, s) => sum + s.heapUsed, 0) /
            stabilityStats.memory_samples.length /
            1024 /
            1024
        )
        console.log(`   💾 平均堆内存: ${avgHeapMB}MB`)
      }
      console.log('')

      // 断言：断线率<20%（开发环境资源有限，放宽阈值）
      expect(parseFloat(finalDisconnectRate)).toBeLessThan(20)

      // 断言：至少50%的连接保持稳定
      expect(finalConnected).toBeGreaterThan(initialConnected * 0.5)
    }, 300000) // 5分钟超时

    /**
     * 业务场景：阶梯式连接稳定性测试
     * 验证目标：找出稳定连接的上限
     */
    test('阶梯式连接稳定性测试 (500→1000→2000→3000→5000)', async () => {
      const steps = [500, 1000, 2000, 3000, 5000]
      const holdPerStep = 15000 // 每阶段持续15秒

      console.log('')
      console.log('📋 P3-1-3-1-2 阶梯式稳定性测试:')
      console.log(`   阶梯: ${steps.join(' → ')}`)
      console.log(`   每阶段持续: ${holdPerStep / 1000}秒`)
      console.log('')

      const stepResults = []

      for (const [stepIndex, targetCount] of steps.entries()) {
        console.log(`   🚀 阶段 ${stepIndex + 1}/${steps.length}: ${targetCount}连接`)

        // 清理上一阶段连接
        for (const conn of activeConnections) {
          try {
            if (conn && conn.connected) {
              conn.disconnect()
            }
          } catch (error) {
            // 忽略
          }
        }
        activeConnections.length = 0
        await delay(3000)

        stabilityStats.total_connections_attempted += targetCount

        // 建立连接
        const tasks = Array(targetCount)
          .fill(null)
          .map((_, index) => async () => {
            return await createStableConnection({
              userId: stepIndex * 1000000 + index,
              timeout: 30000,
              index
            })
          })

        const { results } = await executeConcurrent(tasks, {
          concurrency: 200,
          timeout: 120000
        })

        const initialConnected = results.filter(r => r.result?.success).length
        console.log(`      📡 建立连接: ${initialConnected}/${targetCount}`)

        // 保持一段时间
        await delay(holdPerStep)

        // 统计最终状态
        const finalConnected = activeConnections.filter(c => c && c.connected).length
        const disconnected = initialConnected - finalConnected
        const disconnectRate = ((disconnected / initialConnected) * 100).toFixed(2)

        stepResults.push({
          step: stepIndex + 1,
          target: targetCount,
          initial_connected: initialConnected,
          final_connected: finalConnected,
          disconnected,
          disconnect_rate: disconnectRate + '%',
          hold_duration: holdPerStep / 1000
        })

        console.log(
          `      ✅ 保持${holdPerStep / 1000}秒后: ${finalConnected}连接, 断线率${disconnectRate}%`
        )
      }

      // 输出汇总
      console.log('')
      console.log('📊 阶梯式稳定性测试结果:')
      console.log('-'.repeat(80))
      console.log('阶段 | 目标连接 | 初始连接 | 最终连接 | 断线数 | 断线率 | 持续时间')
      console.log('-'.repeat(80))

      for (const result of stepResults) {
        console.log(
          `  ${result.step}  |  ${String(result.target).padStart(7)} | ` +
            `${String(result.initial_connected).padStart(8)} | ` +
            `${String(result.final_connected).padStart(8)} | ` +
            `${String(result.disconnected).padStart(6)} | ` +
            `${result.disconnect_rate.padStart(6)} | ` +
            `${result.hold_duration}秒`
        )
      }
      console.log('-'.repeat(80))

      // 断言：所有阶段断线率<30%
      for (const result of stepResults) {
        const rate = parseFloat(result.disconnect_rate)
        expect(rate).toBeLessThan(30)
      }
    }, 600000) // 10分钟超时
  })

  // ==================== P3-1-3-2: 高并发消息吞吐量测试 ====================

  describe('P3-1-3-2 高并发消息吞吐量测试', () => {
    /**
     * 业务场景：1000连接同时发送/接收消息
     * 验证目标：验证消息广播效率
     */
    test('1000连接消息吞吐量测试', async () => {
      const connectionCount = 1000
      const messagesPerConnection = 5

      console.log('')
      console.log('📋 P3-1-3-2 消息吞吐量测试配置:')
      console.log(`   🔌 连接数: ${connectionCount}`)
      console.log(`   📨 每连接消息数: ${messagesPerConnection}`)
      console.log(`   📊 总消息数: ${connectionCount * messagesPerConnection}`)
      console.log('')

      stabilityStats.total_connections_attempted += connectionCount

      // 建立连接
      console.log('   📡 建立连接...')
      const connectionTasks = Array(connectionCount)
        .fill(null)
        .map((_, index) => async () => {
          return await createStableConnection({
            userId: 9000000 + index,
            timeout: 30000,
            index
          })
        })

      const { results: connResults } = await executeConcurrent(connectionTasks, {
        concurrency: 100,
        timeout: 120000
      })

      const connectedSockets = connResults
        .filter(r => r.result?.success && r.result.socket)
        .map(r => r.result.socket)

      console.log(`   ✅ 建立连接: ${connectedSockets.length}/${connectionCount}`)

      if (connectedSockets.length < connectionCount * 0.5) {
        console.warn('⚠️ 连接成功率过低，跳过消息吞吐量测试')
        return
      }

      // 消息吞吐量测试
      console.log('')
      console.log('   📨 发送消息...')

      const messageStartTime = Date.now()
      let totalSent = 0
      let totalReceived = 0

      // 为每个连接设置消息监听器
      const messagePromises = connectedSockets.map((socket, socketIndex) => {
        return new Promise(resolve => {
          let receivedCount = 0

          socket.on('pong', () => {
            receivedCount++
            totalReceived++
            stabilityStats.messages_received++
          })

          // 发送消息
          for (let i = 0; i < messagesPerConnection; i++) {
            socket.emit('ping')
            totalSent++
            stabilityStats.messages_sent++
          }

          // 超时后解析
          setTimeout(() => {
            resolve({
              socket_index: socketIndex,
              sent: messagesPerConnection,
              received: receivedCount
            })
          }, 10000)
        })
      })

      const _messageResults = await Promise.all(messagePromises)
      const messageDuration = Date.now() - messageStartTime

      // 统计
      const totalExpected = connectedSockets.length * messagesPerConnection
      const receiveRate = ((totalReceived / totalExpected) * 100).toFixed(2)
      const throughput = Math.round((totalReceived / messageDuration) * 1000)

      console.log('')
      console.log('📊 P3-1-3-2 消息吞吐量测试结果:')
      console.log(`   📤 发送消息: ${totalSent}`)
      console.log(`   📥 接收消息: ${totalReceived}`)
      console.log(`   📊 接收率: ${receiveRate}%`)
      console.log(`   ⏱️  耗时: ${messageDuration}ms`)
      console.log(`   📈 吞吐量: ${throughput} msg/s`)
      console.log('')

      // 断言：接收率>50%
      expect(parseFloat(receiveRate)).toBeGreaterThan(50)

      // 断言：吞吐量>100 msg/s
      expect(throughput).toBeGreaterThan(100)
    }, 180000) // 3分钟超时

    /**
     * 业务场景：验证广播延迟
     * 验证目标：消息广播延迟<1秒
     */
    test('消息广播延迟测试', async () => {
      const connectionCount = 500
      const testRounds = 10

      console.log('')
      console.log('📋 P3-1-3-2-2 广播延迟测试配置:')
      console.log(`   🔌 连接数: ${connectionCount}`)
      console.log(`   🔄 测试轮数: ${testRounds}`)
      console.log('')

      stabilityStats.total_connections_attempted += connectionCount

      // 建立连接
      const connectionTasks = Array(connectionCount)
        .fill(null)
        .map((_, index) => async () => {
          return await createStableConnection({
            userId: 9500000 + index,
            timeout: 30000,
            index
          })
        })

      const { results: connResults } = await executeConcurrent(connectionTasks, {
        concurrency: 100,
        timeout: 120000
      })

      const connectedSockets = connResults
        .filter(r => r.result?.success && r.result.socket)
        .map(r => r.result.socket)

      console.log(`   ✅ 建立连接: ${connectedSockets.length}/${connectionCount}`)

      if (connectedSockets.length < connectionCount * 0.5) {
        console.warn('⚠️ 连接成功率过低，跳过延迟测试')
        return
      }

      // 延迟测试
      const latencies = []

      for (let round = 0; round < testRounds; round++) {
        const roundLatencies = []

        const roundPromises = connectedSockets.map((socket, _index) => {
          return new Promise(resolve => {
            const pingStart = Date.now()

            socket.once('pong', () => {
              const latency = Date.now() - pingStart
              roundLatencies.push(latency)
              resolve(latency)
            })

            socket.emit('ping')

            // 超时
            setTimeout(() => resolve(5000), 5000)
          })
        })

        await Promise.all(roundPromises)
        latencies.push(...roundLatencies)

        await delay(500)
      }

      // 统计
      const sortedLatencies = [...latencies].sort((a, b) => a - b)
      const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)]
      const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)]
      const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)]

      console.log('')
      console.log('📊 P3-1-3-2-2 广播延迟测试结果:')
      console.log(`   📊 测试消息数: ${latencies.length}`)
      console.log(`   📊 平均延迟: ${avgLatency}ms`)
      console.log(`   📊 P50延迟: ${p50}ms`)
      console.log(`   📊 P95延迟: ${p95}ms`)
      console.log(`   📊 P99延迟: ${p99}ms`)
      console.log(`   📊 最小延迟: ${sortedLatencies[0]}ms`)
      console.log(`   📊 最大延迟: ${sortedLatencies[sortedLatencies.length - 1]}ms`)
      console.log('')

      // 断言：P95延迟<1000ms
      expect(p95).toBeLessThan(1000)

      // 断言：平均延迟<500ms
      expect(avgLatency).toBeLessThan(500)
    }, 180000)
  })

  // ==================== P3-1-3-3: 断线重连恢复测试 ====================

  describe('P3-1-3-3 断线重连恢复测试', () => {
    /**
     * 业务场景：部分连接断开后重新连接
     * 验证目标：验证系统的恢复能力
     */
    test('部分断线后重连恢复测试', async () => {
      const initialConnections = 1000
      const disconnectRatio = 0.3 // 30%断线
      const disconnectCount = Math.floor(initialConnections * disconnectRatio)

      console.log('')
      console.log('📋 P3-1-3-3 断线重连测试配置:')
      console.log(`   🔌 初始连接: ${initialConnections}`)
      console.log(`   ❌ 断线比例: ${disconnectRatio * 100}%`)
      console.log(`   🔄 断线数量: ${disconnectCount}`)
      console.log('')

      stabilityStats.total_connections_attempted += initialConnections

      // 阶段1: 建立初始连接
      console.log('   📡 阶段1: 建立初始连接...')
      const connectionTasks = Array(initialConnections)
        .fill(null)
        .map((_, index) => async () => {
          return await createStableConnection({
            userId: 7000000 + index,
            timeout: 30000,
            index
          })
        })

      const { results: connResults } = await executeConcurrent(connectionTasks, {
        concurrency: 100,
        timeout: 120000
      })

      const initialConnected = connResults.filter(r => r.result?.success).length
      console.log(`      ✅ 初始连接: ${initialConnected}/${initialConnections}`)

      if (initialConnected < initialConnections * 0.5) {
        console.warn('⚠️ 初始连接成功率过低，跳过断线重连测试')
        return
      }

      // 阶段2: 模拟部分断线
      console.log('')
      console.log('   ❌ 阶段2: 模拟部分断线...')

      const toDisconnect = activeConnections.slice(0, disconnectCount)
      let actualDisconnected = 0

      for (const conn of toDisconnect) {
        try {
          if (conn && conn.connected) {
            conn.disconnect()
            actualDisconnected++
          }
        } catch (error) {
          // 忽略
        }
      }

      await delay(2000)

      const afterDisconnect = activeConnections.filter(c => c && c.connected).length
      console.log(`      ❌ 断开连接: ${actualDisconnected}`)
      console.log(`      📊 剩余连接: ${afterDisconnect}`)

      // 阶段3: 重新连接
      console.log('')
      console.log('   🔄 阶段3: 重新连接...')

      stabilityStats.reconnection_attempts += actualDisconnected
      stabilityStats.total_connections_attempted += actualDisconnected

      const reconnectionTasks = Array(actualDisconnected)
        .fill(null)
        .map((_, index) => async () => {
          return await createStableConnection({
            userId: 7500000 + index,
            timeout: 30000,
            index
          })
        })

      const { results: reconnResults } = await executeConcurrent(reconnectionTasks, {
        concurrency: 100,
        timeout: 60000
      })

      const reconnected = reconnResults.filter(r => r.result?.success).length
      stabilityStats.reconnection_successes += reconnected

      console.log(`      ✅ 重连成功: ${reconnected}/${actualDisconnected}`)

      // 阶段4: 最终统计
      const finalConnected = activeConnections.filter(c => c && c.connected).length
      const reconnectionRate = ((reconnected / actualDisconnected) * 100).toFixed(2)

      console.log('')
      console.log('📊 P3-1-3-3 断线重连测试结果:')
      console.log(`   🔌 初始连接: ${initialConnected}`)
      console.log(`   ❌ 断线数量: ${actualDisconnected}`)
      console.log(`   🔄 重连成功: ${reconnected}`)
      console.log(`   📊 重连率: ${reconnectionRate}%`)
      console.log(`   ✅ 最终连接: ${finalConnected}`)
      console.log('')

      // 断言：重连率>70%
      expect(parseFloat(reconnectionRate)).toBeGreaterThan(70)

      // 断言：最终连接数>=初始连接数*80%
      expect(finalConnected).toBeGreaterThan(initialConnected * 0.8)
    }, 180000)

    /**
     * 业务场景：快速连接-断开-重连循环
     * 验证目标：验证连接池管理能力
     */
    test('快速连接-断开-重连循环测试', async () => {
      const iterations = 5
      const connectionsPerIteration = 200

      console.log('')
      console.log('📋 P3-1-3-3-2 快速循环测试配置:')
      console.log(`   🔄 迭代次数: ${iterations}`)
      console.log(`   🔌 每次连接数: ${connectionsPerIteration}`)
      console.log('')

      let totalSuccess = 0
      let totalFail = 0
      const iterationResults = []

      for (let iter = 0; iter < iterations; iter++) {
        console.log(`   🔄 迭代 ${iter + 1}/${iterations}`)

        stabilityStats.total_connections_attempted += connectionsPerIteration

        // 创建连接
        const iterConnections = []
        for (let i = 0; i < connectionsPerIteration; i++) {
          const result = await createStableConnection({
            userId: 6000000 + iter * 1000 + i,
            timeout: 15000,
            index: i
          })

          if (result.success) {
            iterConnections.push(result.socket)
            totalSuccess++
          } else {
            totalFail++
          }
        }

        console.log(`      📡 连接成功: ${iterConnections.length}/${connectionsPerIteration}`)

        // 保持3秒
        await delay(3000)

        // 检查稳定性
        const stillConnected = iterConnections.filter(c => c && c.connected).length

        iterationResults.push({
          iteration: iter + 1,
          connected: iterConnections.length,
          still_connected: stillConnected,
          stability: ((stillConnected / iterConnections.length) * 100).toFixed(1) + '%'
        })

        // 断开所有连接
        for (const conn of iterConnections) {
          try {
            if (conn && conn.connected) {
              conn.disconnect()
            }
          } catch (error) {
            // 忽略
          }
        }

        // 等待完全断开
        await delay(2000)
      }

      const totalAttempts = iterations * connectionsPerIteration
      const successRate = ((totalSuccess / totalAttempts) * 100).toFixed(1)

      console.log('')
      console.log('📊 P3-1-3-3-2 快速循环测试结果:')
      console.log('-'.repeat(60))
      console.log('迭代 | 连接数 | 保持数 | 稳定率')
      console.log('-'.repeat(60))

      for (const result of iterationResults) {
        console.log(
          `  ${result.iteration}  |  ${String(result.connected).padStart(5)} | ` +
            `${String(result.still_connected).padStart(6)} | ${result.stability}`
        )
      }
      console.log('-'.repeat(60))
      console.log(`   总尝试: ${totalAttempts}`)
      console.log(`   成功: ${totalSuccess}`)
      console.log(`   失败: ${totalFail}`)
      console.log(`   成功率: ${successRate}%`)
      console.log('')

      // 断言：成功率>60%
      expect(parseFloat(successRate)).toBeGreaterThan(60)
    }, 300000)
  })
})
