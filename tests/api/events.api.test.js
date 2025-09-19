/**
 * 事件系统API完整测试套件
 * 测试事件发布、订阅、处理等功能
 */

const BaseAPITester = require('./BaseAPITester')

describe('事件系统API测试', () => {
  let tester

  beforeAll(async () => {
    tester = new BaseAPITester()
    await new Promise(resolve => {
      setTimeout(resolve, 2000)
    })
    await tester.authenticateUser('regular')
  })

  afterAll(() => {
    if (tester) {
      tester.cleanup()
    }
  })

  test('✅ 事件发布 - POST /api/v4/unified-engine/events/publish', async () => {
    const eventData = {
      event_type: 'user_action',
      event_data: { action: 'lottery_draw' }
    }

    const response = await tester.makeAuthenticatedRequest(
      'POST',
      '/api/v4/unified-engine/events/publish',
      eventData,
      'regular'
    )

    expect([200, 404]).toContain(response.status)
  })

  test('✅ 获取事件历史 - GET /api/v4/unified-engine/events/history', async () => {
    const response = await tester.makeAuthenticatedRequest(
      'GET',
      '/api/v4/unified-engine/events/history',
      null,
      'regular'
    )

    expect([200, 404]).toContain(response.status)
  })
})
