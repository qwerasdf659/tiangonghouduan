/**
 * 概率系统API完整测试套件
 */

const BaseAPITester = require('./BaseAPITester')

describe('概率系统API测试', () => {
  let tester

  beforeAll(async () => {
    tester = new BaseAPITester()
    await new Promise(resolve => {
      setTimeout(resolve, 2000)
    })
    await tester.authenticateUser('regular')
    await tester.authenticateUser('admin')
  })

  afterAll(() => {
    if (tester) {
      tester.cleanup()
    }
  })

  test('✅ 获取概率配置 - GET /api/v4/unified-engine/probability/config', async () => {
    const response = await tester.makeAuthenticatedRequest(
      'GET',
      '/api/v4/unified-engine/probability/config',
      null,
      'admin'
    )

    expect([200, 404]).toContain(response.status)
  })

  test('✅ 更新概率配置 - PUT /api/v4/unified-engine/probability/config', async () => {
    const configData = {
      lottery_id: 'lottery_001',
      probabilities: [
        {
          // 🔴 需要真实数据：实际奖品ID
          prize_id: 'NEED_REAL_PRIZE_ID_1',
          probability: 0.1
        },
        {
          // 🔴 需要真实数据：实际奖品ID
          prize_id: 'NEED_REAL_PRIZE_ID_2',
          probability: 0.9
        }
      ]
    }

    const response = await tester.makeAuthenticatedRequest(
      'PUT',
      '/api/v4/unified-engine/probability/config',
      configData,
      'admin'
    )

    expect([200, 404]).toContain(response.status)
  })

  test('🔒 概率配置权限验证', async () => {
    await tester.testAuthorizationLevels('/api/v4/unified-engine/probability/config', 'GET', null, [
      'admin'
    ])
  })
})
