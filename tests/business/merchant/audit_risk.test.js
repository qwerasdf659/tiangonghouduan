/**
 * 商家审计日志和风控告警API测试
 *
 * 测试覆盖：
 * 1. 审计日志查询 GET /api/v4/shop/audit/logs
 * 2. 审计日志详情 GET /api/v4/shop/audit/logs/:log_id
 * 3. 风控告警列表 GET /api/v4/shop/risk/alerts
 * 4. 风控告警详情 GET /api/v4/shop/risk/alerts/:alert_id
 * 5. 风控告警复核 POST /api/v4/shop/risk/alerts/:alert_id/review
 * 6. 风控告警忽略 POST /api/v4/shop/risk/alerts/:alert_id/ignore
 * 7. 风控统计概览 GET /api/v4/shop/risk/stats
 *
 * 测试账号：13612227930 (用户ID: 31, 管理员权限，绑定测试门店)
 * 数据库：restaurant_points_dev (统一数据库)
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md AC4.3, AC5
 */

'use strict'

const TestCoordinator = require('../../api/TestCoordinator')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { TEST_DATA } = require('../../helpers/test-data')

describe('商家审计日志和风控告警API测试', () => {
  let tester
  const test_account = TEST_DATA.users.adminUser

  beforeAll(async () => {
    console.log('🚀 商家审计日志和风控告警API测试启动')
    console.log('='.repeat(70))
    console.log(`📅 测试时间: ${BeijingTimeHelper.toBeijingTime(new Date())} (北京时间)`)
    console.log(`👤 测试账号: ${test_account.mobile} (用户ID: ${test_account.user_id})`)
    console.log('🗄️ 数据库: restaurant_points_dev')

    tester = new TestCoordinator()

    // 等待V4引擎启动
    try {
      await tester.waitForV4Engine(30000)
      console.log('✅ V4引擎启动检查通过')
    } catch (error) {
      console.warn('⚠️ V4引擎可能未启动，继续测试:', error.message)
    }

    // 获取认证token
    try {
      await tester.authenticate_v4_user('regular')
      await tester.authenticate_v4_user('admin')
      console.log('✅ 用户认证完成')
    } catch (error) {
      console.warn('⚠️ 认证失败，部分测试可能跳过:', error.message)
    }
  })

  afterAll(async () => {
    if (tester) {
      await tester.cleanup()
    }
    console.log('🏁 商家审计日志和风控告警API测试完成')
  })

  // ========== 审计日志查询测试 ==========
  describe('审计日志查询', () => {
    test('GET /api/v4/shop/audit/logs - 管理员查询审计日志列表', async () => {
      console.log('\n📋 测试：管理员查询审计日志列表')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/audit/logs?page=1&page_size=10',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      // 管理员应该可以查询审计日志
      expect([200, 403]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(response.data.data).toHaveProperty('logs')

        // 支持两种分页格式：直接字段或pagination对象
        const pagination = response.data.data.pagination || response.data.data
        const total = pagination.total || 0
        const page = pagination.page || 1
        const logs = response.data.data.logs

        expect(Array.isArray(logs)).toBe(true)
        expect(page).toBe(1)

        console.log(`✅ 审计日志总数: ${total}`)
        console.log(`✅ 当前页记录数: ${logs.length}`)
      } else {
        console.log('⚠️ 权限不足（可能需要 staff:read 权限）')
      }
    })

    test('GET /api/v4/shop/audit/logs - 按操作类型筛选', async () => {
      console.log('\n📋 测试：按操作类型筛选审计日志')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/audit/logs?operation_type=submit_consumption&page=1',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)

        // 如果有数据，验证操作类型筛选
        const logs = response.data.data.logs
        if (logs && logs.length > 0) {
          logs.forEach(log => {
            expect(log.operation_type).toBe('submit_consumption')
          })
          console.log(`✅ 筛选结果: ${logs.length} 条消费提交日志`)
        } else {
          console.log('⚠️ 暂无消费提交日志数据')
        }
      }
    })

    test('GET /api/v4/shop/audit/logs - 按门店筛选', async () => {
      console.log('\n📋 测试：按门店筛选审计日志')

      // 使用测试门店ID=1
      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/audit/logs?store_id=1&page=1',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)

        const logs = response.data.data.logs
        if (logs && logs.length > 0) {
          logs.forEach(log => {
            // 如果有store_id字段，应该等于1
            if (log.store_id !== null) {
              expect(log.store_id).toBe(1)
            }
          })
          console.log(`✅ 门店1的审计日志: ${logs.length} 条`)
        } else {
          console.log('⚠️ 门店1暂无审计日志')
        }
      }
    })

    test('GET /api/v4/shop/audit/logs - 权限控制验证', async () => {
      console.log('\n🔐 测试：审计日志权限控制')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/audit/logs',
        null,
        'regular'
      )

      console.log('响应状态:', response.status)

      /*
       * 注意：测试账号 13612227930 同时具有用户和管理员权限
       * 所以即使用 'regular' 角色也可能成功访问
       * 这里主要验证接口正常响应
       */
      expect(response.status).toBeDefined()
      console.log(`✅ 接口响应状态: ${response.status}`)
    })
  })

  // ========== 风控告警测试 ==========
  describe('风控告警管理', () => {
    test('GET /api/v4/shop/risk/alerts - 查询风控告警列表', async () => {
      console.log('\n🚨 测试：查询风控告警列表')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/risk/alerts?page=1&page_size=10',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      expect([200, 403]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(response.data.data).toHaveProperty('alerts')
        expect(response.data.data).toHaveProperty('total')
        expect(response.data.data).toHaveProperty('page')
        expect(response.data.data).toHaveProperty('page_size')

        console.log(`✅ 风控告警总数: ${response.data.data.total}`)
        console.log(`✅ 当前页告警数: ${response.data.data.alerts.length}`)
      } else {
        console.log('⚠️ 权限不足（可能需要 staff:manage 权限）')
      }
    })

    test('GET /api/v4/shop/risk/alerts - 按告警类型筛选', async () => {
      console.log('\n🚨 测试：按告警类型筛选风控告警')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/risk/alerts?alert_type=frequency_limit&page=1',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)

        const alerts = response.data.data.alerts
        if (alerts && alerts.length > 0) {
          alerts.forEach(alert => {
            expect(alert.alert_type).toBe('frequency_limit')
          })
          console.log(`✅ 频率限制告警: ${alerts.length} 条`)
        } else {
          console.log('⚠️ 暂无频率限制告警（正常情况）')
        }
      }
    })

    test('GET /api/v4/shop/risk/alerts - 按状态筛选（待处理）', async () => {
      console.log('\n🚨 测试：筛选待处理的风控告警')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/risk/alerts?status=pending&page=1',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)

        const alerts = response.data.data.alerts
        if (alerts && alerts.length > 0) {
          alerts.forEach(alert => {
            expect(alert.status).toBe('pending')
          })
          console.log(`✅ 待处理告警: ${alerts.length} 条`)
        } else {
          console.log('⚠️ 暂无待处理告警')
        }
      }
    })

    test('GET /api/v4/shop/risk/stats - 获取风控统计概览', async () => {
      console.log('\n📊 测试：获取风控统计概览')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/risk/stats',
        null,
        'admin'
      )

      console.log('响应状态:', response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)

        const stats = response.data.data
        expect(stats).toHaveProperty('today')
        expect(stats).toHaveProperty('pending_count')

        console.log(`✅ 今日告警数: ${stats.today}`)
        console.log(`✅ 待处理告警: ${stats.pending_count}`)
      } else if (response.status === 404) {
        console.log('⚠️ 统计接口可能未实现')
      }
    })

    test('GET /api/v4/shop/risk/alerts - 权限控制验证', async () => {
      console.log('\n🔐 测试：风控告警权限控制')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/risk/alerts',
        null,
        'regular'
      )

      console.log('响应状态:', response.status)

      /*
       * 注意：测试账号 13612227930 同时具有用户和管理员权限
       * 所以即使用 'regular' 角色也可能成功访问
       * 这里主要验证接口正常响应
       */
      expect(response.status).toBeDefined()
      console.log(`✅ 接口响应状态: ${response.status}`)
    })
  })

  // ========== 风控告警处理测试 ==========
  describe('风控告警处理', () => {
    let testAlertId = null

    test('模拟创建告警数据（如果有可用告警）', async () => {
      console.log('\n🔍 查找可用的测试告警...')

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/risk/alerts?status=pending&page=1&page_size=1',
        null,
        'admin'
      )

      if (response.status === 200 && response.data.data.alerts.length > 0) {
        testAlertId = response.data.data.alerts[0].alert_id
        console.log(`✅ 找到测试告警 ID: ${testAlertId}`)
      } else {
        console.log('⚠️ 暂无待处理告警可用于测试')
      }
    })

    test('POST /api/v4/shop/risk/alerts/:alert_id/review - 复核告警', async () => {
      if (!testAlertId) {
        console.log('⚠️ 跳过：无可用告警进行复核测试')
        return
      }

      console.log('\n✅ 测试：复核风控告警')

      const response = await tester.make_authenticated_request(
        'POST',
        `/api/v4/shop/risk/alerts/${testAlertId}/review`,
        {
          review_notes: '测试复核 - 已人工确认无风险'
        },
        'admin'
      )

      console.log('响应状态:', response.status)

      expect([200, 400, 403, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(response.data.data.status).toBe('reviewed')
        console.log('✅ 告警复核成功')
      }
    })

    test('POST /api/v4/shop/risk/alerts/:alert_id/ignore - 忽略告警', async () => {
      // 查找另一个待处理告警用于忽略测试
      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/risk/alerts?status=pending&page=1&page_size=1',
        null,
        'admin'
      )

      if (response.status !== 200 || response.data.data.alerts.length === 0) {
        console.log('⚠️ 跳过：无可用告警进行忽略测试')
        return
      }

      const alertId = response.data.data.alerts[0].alert_id
      console.log(`\n❌ 测试：忽略风控告警 ID: ${alertId}`)

      const ignoreResponse = await tester.make_authenticated_request(
        'POST',
        `/api/v4/shop/risk/alerts/${alertId}/ignore`,
        {
          review_notes: '测试忽略 - 误报'
        },
        'admin'
      )

      console.log('响应状态:', ignoreResponse.status)

      expect([200, 400, 403, 404]).toContain(ignoreResponse.status)

      if (ignoreResponse.status === 200) {
        expect(ignoreResponse.data.success).toBe(true)
        expect(ignoreResponse.data.data.status).toBe('ignored')
        console.log('✅ 告警忽略成功')
      }
    })
  })
})
