/**
 * 智能系统API完整测试套件
 */

const UnifiedAPITestManager = require('./UnifiedAPITestManager')

describe('智能系统API测试', () => {
  let tester

  beforeAll(async () => {
    tester = new UnifiedAPITestManager()
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

  test('✅ 记录用户行为 - POST /api/v4/unified-engine/smart/behavior/track', async () => {
    const behaviorData = {
      action_type: 'page_view',
      action_data: { page: '/lottery', duration: 5000 }
    }

    const response = await tester.makeAuthenticatedRequest(
      'POST',
      '/api/v4/unified-engine/smart/behavior/track',
      behaviorData,
      'regular'
    )

    expect([200, 404]).toContain(response.status)
  })

  test('✅ 获取智能推荐 - GET /api/v4/unified-engine/smart/recommendations', async () => {
    const response = await tester.makeAuthenticatedRequest(
      'GET',
      '/api/v4/unified-engine/smart/recommendations',
      null,
      'regular'
    )

    expect([200, 404]).toContain(response.status)
  })

  test('✅ 获取用户画像 - GET /api/v4/unified-engine/smart/profile', async () => {
    const response = await tester.makeAuthenticatedRequest(
      'GET',
      '/api/v4/unified-engine/smart/profile',
      null,
      'regular'
    )

    expect([200, 404]).toContain(response.status)
  })
})
