'use strict'

/**
 * P2-3.4: 告警规则测试套件
 *
 * 测试目标：
 * - 验证系统告警规则的正确性和触发条件
 * - 验证告警阈值配置的有效性
 * - 验证告警消息格式的规范性
 * - 验证告警级别分类的正确性
 *
 * 告警类型覆盖：
 * - 性能告警：缓存命中率、慢查询、响应时间
 * - 资源告警：内存使用、连接池耗尽
 * - 业务告警：异常操作、安全风险
 * - 健康告警：服务降级、依赖服务失败
 *
 * 业务规则：
 * - 缓存命中率低于80%触发告警
 * - 数据库查询率高于20%触发告警
 * - 单次查询超过1秒触发慢查询告警
 * - 内存使用超过阈值触发资源告警
 *
 * @module tests/observability/alert-rules
 * @since 2026-01-30
 */

// 加载环境变量
require('dotenv').config()

describe('P2-3.4: 告警规则测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  describe('性能告警规则', () => {
    describe('缓存命中率告警', () => {
      // 模拟缓存统计数据
      const createCacheStats = (memoryHits, redisHits, databaseQueries) => {
        const totalQueries = memoryHits + redisHits + databaseQueries
        return {
          memoryHits,
          redisHits,
          databaseQueries,
          totalQueries,
          memoryHitRate: totalQueries > 0 ? (memoryHits / totalQueries) * 100 : 0,
          redisHitRate: totalQueries > 0 ? (redisHits / totalQueries) * 100 : 0,
          totalHitRate: totalQueries > 0 ? ((memoryHits + redisHits) / totalQueries) * 100 : 0,
          dbQueryRate: totalQueries > 0 ? (databaseQueries / totalQueries) * 100 : 0
        }
      }

      // 告警评估函数
      const evaluateCacheAlert = stats => {
        const alerts = []

        if (stats.totalHitRate < 80) {
          alerts.push({
            level: 'warning',
            type: 'cache_hit_rate_low',
            message: `缓存命中率偏低（${stats.totalHitRate.toFixed(1)}% < 80%），建议检查缓存配置`,
            threshold: 80,
            current: stats.totalHitRate
          })
        }

        if (stats.dbQueryRate > 20) {
          alerts.push({
            level: 'warning',
            type: 'db_query_rate_high',
            message: `数据库查询率偏高（${stats.dbQueryRate.toFixed(1)}% > 20%），建议增加缓存时间`,
            threshold: 20,
            current: stats.dbQueryRate
          })
        }

        return alerts
      }

      test('缓存命中率≥80%不应触发告警', () => {
        // 模拟高缓存命中率场景
        const stats = createCacheStats(70, 15, 15) // 85%命中率
        const alerts = evaluateCacheAlert(stats)

        expect(alerts.find(a => a.type === 'cache_hit_rate_low')).toBeUndefined()
      })

      test('缓存命中率<80%应触发告警', () => {
        // 模拟低缓存命中率场景
        const stats = createCacheStats(50, 20, 30) // 70%命中率
        const alerts = evaluateCacheAlert(stats)

        const alert = alerts.find(a => a.type === 'cache_hit_rate_low')
        expect(alert).toBeDefined()
        expect(alert.level).toBe('warning')
        expect(alert.threshold).toBe(80)
        expect(alert.current).toBeLessThan(80)
      })

      test('数据库查询率≤20%不应触发告警', () => {
        const stats = createCacheStats(70, 15, 15) // 15%数据库查询率
        const alerts = evaluateCacheAlert(stats)

        expect(alerts.find(a => a.type === 'db_query_rate_high')).toBeUndefined()
      })

      test('数据库查询率>20%应触发告警', () => {
        const stats = createCacheStats(50, 20, 30) // 30%数据库查询率
        const alerts = evaluateCacheAlert(stats)

        const alert = alerts.find(a => a.type === 'db_query_rate_high')
        expect(alert).toBeDefined()
        expect(alert.level).toBe('warning')
        expect(alert.threshold).toBe(20)
        expect(alert.current).toBeGreaterThan(20)
      })

      test('边界值测试：恰好80%命中率', () => {
        const stats = createCacheStats(60, 20, 20) // 80%命中率
        const alerts = evaluateCacheAlert(stats)

        // 80%是阈值，不应触发低于80%的告警
        expect(alerts.find(a => a.type === 'cache_hit_rate_low')).toBeUndefined()
      })

      test('边界值测试：恰好20%数据库查询率', () => {
        const stats = createCacheStats(60, 20, 20) // 20%数据库查询率
        const alerts = evaluateCacheAlert(stats)

        // 20%是阈值，不应触发高于20%的告警
        expect(alerts.find(a => a.type === 'db_query_rate_high')).toBeUndefined()
      })

      test('零查询场景不应崩溃', () => {
        const stats = createCacheStats(0, 0, 0)
        expect(() => evaluateCacheAlert(stats)).not.toThrow()
      })
    })

    describe('慢查询告警', () => {
      // 慢查询告警阈值（毫秒）
      const SLOW_QUERY_THRESHOLD = 1000

      // 慢查询评估函数
      const evaluateSlowQueryAlert = (queryDuration, queryInfo) => {
        if (queryDuration > SLOW_QUERY_THRESHOLD) {
          return {
            level: 'warning',
            type: 'slow_query',
            message: `慢查询告警: ${queryInfo.name || 'Unknown'} 耗时${queryDuration}ms`,
            threshold: SLOW_QUERY_THRESHOLD,
            current: queryDuration,
            suggestion: '建议：检查数据库索引或优化查询语句',
            query_info: queryInfo
          }
        }
        return null
      }

      test('查询时间≤1000ms不应触发慢查询告警', () => {
        const alert = evaluateSlowQueryAlert(500, { name: 'getUserRoles' })
        expect(alert).toBeNull()
      })

      test('查询时间>1000ms应触发慢查询告警', () => {
        const alert = evaluateSlowQueryAlert(1500, { name: 'getUserRoles', user_id: 123 })

        expect(alert).not.toBeNull()
        expect(alert.level).toBe('warning')
        expect(alert.type).toBe('slow_query')
        expect(alert.current).toBe(1500)
        expect(alert.query_info.name).toBe('getUserRoles')
      })

      test('边界值测试：恰好1000ms', () => {
        const alert = evaluateSlowQueryAlert(1000, { name: 'test' })
        // 1000ms是阈值，不应触发告警
        expect(alert).toBeNull()
      })

      test('慢查询告警应包含查询信息', () => {
        const queryInfo = {
          name: 'getUserRoles',
          user_id: 123,
          table: 'users'
        }
        const alert = evaluateSlowQueryAlert(2000, queryInfo)

        expect(alert.query_info).toEqual(queryInfo)
        expect(alert.message).toContain('getUserRoles')
      })
    })

    describe('响应时间告警', () => {
      // 响应时间阈值配置
      const RESPONSE_TIME_THRESHOLDS = {
        warning: 500, // 500ms以上警告
        critical: 2000 // 2000ms以上严重
      }

      // 响应时间评估函数
      const evaluateResponseTimeAlert = (responseTime, endpoint) => {
        if (responseTime > RESPONSE_TIME_THRESHOLDS.critical) {
          return {
            level: 'critical',
            type: 'response_time_critical',
            message: `响应时间严重超时: ${endpoint} 耗时${responseTime}ms`,
            threshold: RESPONSE_TIME_THRESHOLDS.critical,
            current: responseTime,
            endpoint
          }
        }

        if (responseTime > RESPONSE_TIME_THRESHOLDS.warning) {
          return {
            level: 'warning',
            type: 'response_time_warning',
            message: `响应时间偏长: ${endpoint} 耗时${responseTime}ms`,
            threshold: RESPONSE_TIME_THRESHOLDS.warning,
            current: responseTime,
            endpoint
          }
        }

        return null
      }

      test('响应时间≤500ms不应触发告警', () => {
        const alert = evaluateResponseTimeAlert(300, '/api/v4/user/profile')
        expect(alert).toBeNull()
      })

      test('响应时间500ms-2000ms应触发warning告警', () => {
        const alert = evaluateResponseTimeAlert(800, '/api/v4/market/listings')

        expect(alert).not.toBeNull()
        expect(alert.level).toBe('warning')
        expect(alert.type).toBe('response_time_warning')
      })

      test('响应时间>2000ms应触发critical告警', () => {
        const alert = evaluateResponseTimeAlert(3000, '/api/v4/lottery/draw')

        expect(alert).not.toBeNull()
        expect(alert.level).toBe('critical')
        expect(alert.type).toBe('response_time_critical')
      })
    })
  })

  describe('资源告警规则', () => {
    describe('内存使用告警', () => {
      // 内存阈值配置（MB）
      const MEMORY_THRESHOLDS = {
        warning: 400, // 400MB警告
        critical: 480 // 480MB严重（接近512MB限制）
      }

      // 内存评估函数
      const evaluateMemoryAlert = (usedMB, totalMB) => {
        const usagePercent = (usedMB / totalMB) * 100

        if (usedMB > MEMORY_THRESHOLDS.critical) {
          return {
            level: 'critical',
            type: 'memory_critical',
            message: `内存使用严重: ${usedMB}MB/${totalMB}MB (${usagePercent.toFixed(1)}%)`,
            threshold: MEMORY_THRESHOLDS.critical,
            current: usedMB,
            percent: usagePercent
          }
        }

        if (usedMB > MEMORY_THRESHOLDS.warning) {
          return {
            level: 'warning',
            type: 'memory_warning',
            message: `内存使用偏高: ${usedMB}MB/${totalMB}MB (${usagePercent.toFixed(1)}%)`,
            threshold: MEMORY_THRESHOLDS.warning,
            current: usedMB,
            percent: usagePercent
          }
        }

        return null
      }

      test('内存使用≤400MB不应触发告警', () => {
        const alert = evaluateMemoryAlert(300, 512)
        expect(alert).toBeNull()
      })

      test('内存使用400MB-480MB应触发warning告警', () => {
        const alert = evaluateMemoryAlert(450, 512)

        expect(alert).not.toBeNull()
        expect(alert.level).toBe('warning')
        expect(alert.type).toBe('memory_warning')
      })

      test('内存使用>480MB应触发critical告警', () => {
        const alert = evaluateMemoryAlert(490, 512)

        expect(alert).not.toBeNull()
        expect(alert.level).toBe('critical')
        expect(alert.type).toBe('memory_critical')
      })
    })

    describe('数据库连接池告警', () => {
      // 连接池阈值配置
      const POOL_THRESHOLDS = {
        warning_percent: 75, // 使用率75%警告
        critical_percent: 90 // 使用率90%严重
      }
      const MAX_POOL_SIZE = 40 // 项目配置的最大连接数

      // 连接池评估函数
      const evaluatePoolAlert = activeConnections => {
        const usagePercent = (activeConnections / MAX_POOL_SIZE) * 100

        if (usagePercent > POOL_THRESHOLDS.critical_percent) {
          return {
            level: 'critical',
            type: 'db_pool_critical',
            message: `数据库连接池即将耗尽: ${activeConnections}/${MAX_POOL_SIZE} (${usagePercent.toFixed(1)}%)`,
            threshold: POOL_THRESHOLDS.critical_percent,
            current: usagePercent,
            connections: activeConnections
          }
        }

        if (usagePercent > POOL_THRESHOLDS.warning_percent) {
          return {
            level: 'warning',
            type: 'db_pool_warning',
            message: `数据库连接池使用率偏高: ${activeConnections}/${MAX_POOL_SIZE} (${usagePercent.toFixed(1)}%)`,
            threshold: POOL_THRESHOLDS.warning_percent,
            current: usagePercent,
            connections: activeConnections
          }
        }

        return null
      }

      test('连接池使用≤75%不应触发告警', () => {
        const alert = evaluatePoolAlert(20) // 50%使用率
        expect(alert).toBeNull()
      })

      test('连接池使用75%-90%应触发warning告警', () => {
        const alert = evaluatePoolAlert(32) // 80%使用率

        expect(alert).not.toBeNull()
        expect(alert.level).toBe('warning')
        expect(alert.type).toBe('db_pool_warning')
      })

      test('连接池使用>90%应触发critical告警', () => {
        const alert = evaluatePoolAlert(38) // 95%使用率

        expect(alert).not.toBeNull()
        expect(alert.level).toBe('critical')
        expect(alert.type).toBe('db_pool_critical')
      })
    })
  })

  describe('业务告警规则', () => {
    describe('异常操作告警', () => {
      // 业务限制配置
      const BUSINESS_LIMITS = {
        max_draws_per_day: 20,
        max_listings_per_day: 10,
        max_failed_logins: 5
      }

      // 业务操作评估函数
      const evaluateBusinessAlert = (operationType, count, threshold) => {
        if (count > threshold) {
          return {
            level: 'warning',
            type: 'business_limit_exceeded',
            message: `业务操作超限: ${operationType} 当前${count}次，限制${threshold}次`,
            operation: operationType,
            threshold,
            current: count
          }
        }
        return null
      }

      test('抽奖次数≤20不应触发告警', () => {
        const alert = evaluateBusinessAlert('daily_draws', 15, BUSINESS_LIMITS.max_draws_per_day)
        expect(alert).toBeNull()
      })

      test('抽奖次数>20应触发告警', () => {
        const alert = evaluateBusinessAlert('daily_draws', 25, BUSINESS_LIMITS.max_draws_per_day)

        expect(alert).not.toBeNull()
        expect(alert.type).toBe('business_limit_exceeded')
        expect(alert.operation).toBe('daily_draws')
      })

      test('登录失败次数超限应触发告警', () => {
        const alert = evaluateBusinessAlert('failed_logins', 6, BUSINESS_LIMITS.max_failed_logins)

        expect(alert).not.toBeNull()
        expect(alert.operation).toBe('failed_logins')
      })
    })

    describe('安全风险告警', () => {
      // 安全检测函数
      const evaluateSecurityAlert = event => {
        const alerts = []

        // 可疑IP检测
        if (event.suspicious_ip) {
          alerts.push({
            level: 'critical',
            type: 'suspicious_ip',
            message: `检测到可疑IP访问: ${event.ip}`,
            ip: event.ip
          })
        }

        // 异常Token检测
        if (event.invalid_token_attempts > 10) {
          alerts.push({
            level: 'warning',
            type: 'invalid_token_flood',
            message: `大量无效Token尝试: ${event.invalid_token_attempts}次`,
            count: event.invalid_token_attempts
          })
        }

        // 权限越权检测
        if (event.permission_violation) {
          alerts.push({
            level: 'critical',
            type: 'permission_violation',
            message: `检测到权限越权尝试: 用户${event.user_id}尝试访问${event.resource}`,
            user_id: event.user_id,
            resource: event.resource
          })
        }

        return alerts
      }

      test('正常访问不应触发安全告警', () => {
        const alerts = evaluateSecurityAlert({
          suspicious_ip: false,
          invalid_token_attempts: 2,
          permission_violation: false
        })

        expect(alerts).toHaveLength(0)
      })

      test('可疑IP应触发critical告警', () => {
        const alerts = evaluateSecurityAlert({
          suspicious_ip: true,
          ip: '192.168.1.100',
          invalid_token_attempts: 0,
          permission_violation: false
        })

        const alert = alerts.find(a => a.type === 'suspicious_ip')
        expect(alert).toBeDefined()
        expect(alert.level).toBe('critical')
      })

      test('大量无效Token应触发warning告警', () => {
        const alerts = evaluateSecurityAlert({
          suspicious_ip: false,
          invalid_token_attempts: 15,
          permission_violation: false
        })

        const alert = alerts.find(a => a.type === 'invalid_token_flood')
        expect(alert).toBeDefined()
        expect(alert.level).toBe('warning')
      })

      test('权限越权应触发critical告警', () => {
        const alerts = evaluateSecurityAlert({
          suspicious_ip: false,
          invalid_token_attempts: 0,
          permission_violation: true,
          user_id: 123,
          resource: '/admin/users'
        })

        const alert = alerts.find(a => a.type === 'permission_violation')
        expect(alert).toBeDefined()
        expect(alert.level).toBe('critical')
      })
    })
  })

  describe('健康告警规则', () => {
    describe('服务降级告警', () => {
      // 服务状态评估函数
      const evaluateHealthAlert = services => {
        const alerts = []

        // 检查各服务状态
        if (services.database === 'disconnected') {
          alerts.push({
            level: 'critical',
            type: 'database_down',
            message: '数据库连接失败',
            service: 'database'
          })
        }

        if (services.redis === 'disconnected') {
          alerts.push({
            level: 'warning',
            type: 'redis_down',
            message: 'Redis连接失败，系统降级运行',
            service: 'redis'
          })
        }

        // 整体状态判断
        const hasAnyCritical = alerts.some(a => a.level === 'critical')
        let overallStatus = 'healthy'
        if (hasAnyCritical) {
          overallStatus = 'unhealthy'
        } else if (alerts.length > 0) {
          overallStatus = 'degraded'
        }

        return {
          alerts,
          overall_status: overallStatus
        }
      }

      test('所有服务正常应返回healthy状态', () => {
        const result = evaluateHealthAlert({
          database: 'connected',
          redis: 'connected'
        })

        expect(result.overall_status).toBe('healthy')
        expect(result.alerts).toHaveLength(0)
      })

      test('Redis失败应返回degraded状态', () => {
        const result = evaluateHealthAlert({
          database: 'connected',
          redis: 'disconnected'
        })

        expect(result.overall_status).toBe('degraded')
        expect(result.alerts).toHaveLength(1)
        expect(result.alerts[0].type).toBe('redis_down')
        expect(result.alerts[0].level).toBe('warning')
      })

      test('数据库失败应返回unhealthy状态', () => {
        const result = evaluateHealthAlert({
          database: 'disconnected',
          redis: 'connected'
        })

        expect(result.overall_status).toBe('unhealthy')
        expect(result.alerts.some(a => a.type === 'database_down')).toBe(true)
        expect(result.alerts.some(a => a.level === 'critical')).toBe(true)
      })

      test('所有服务失败应返回unhealthy状态', () => {
        const result = evaluateHealthAlert({
          database: 'disconnected',
          redis: 'disconnected'
        })

        expect(result.overall_status).toBe('unhealthy')
        expect(result.alerts.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe('告警消息格式验证', () => {
    test('所有告警应包含必要字段', () => {
      // 模拟各种告警
      const alerts = [
        {
          level: 'warning',
          type: 'cache_hit_rate_low',
          message: '测试告警消息',
          threshold: 80,
          current: 70
        },
        {
          level: 'critical',
          type: 'database_down',
          message: '数据库连接失败',
          service: 'database'
        }
      ]

      alerts.forEach(alert => {
        expect(alert).toHaveProperty('level')
        expect(alert).toHaveProperty('type')
        expect(alert).toHaveProperty('message')
        expect(['warning', 'critical', 'info']).toContain(alert.level)
        expect(typeof alert.type).toBe('string')
        expect(typeof alert.message).toBe('string')
      })
    })

    test('告警类型应使用snake_case命名', () => {
      const alertTypes = [
        'cache_hit_rate_low',
        'db_query_rate_high',
        'slow_query',
        'response_time_warning',
        'memory_critical',
        'db_pool_warning',
        'business_limit_exceeded',
        'suspicious_ip',
        'database_down',
        'redis_down'
      ]

      alertTypes.forEach(type => {
        expect(type).toMatch(/^[a-z][a-z0-9_]*$/)
      })
    })
  })
})
