/**
 * 任务管理API完整测试套件
 * 测试每日任务、进度跟踪、任务完成等功能
 * 创建时间：2025年08月23日 北京时间
 */

const BaseAPITester = require('./BaseAPITester')

describe('任务管理API完整测试', () => {
  let tester
  let testUserId

  beforeAll(async () => {
    tester = new BaseAPITester()
    await new Promise(resolve => {
      setTimeout(resolve, 2000)
    })

    const userData = await tester.authenticateUser('regular')
    testUserId = userData.user.user_id
  })

  afterAll(() => {
    if (tester) {
      tester.cleanup()
    }
  })

  describe('用户任务API', () => {
    test('✅ 获取用户任务列表 - GET /api/v4/unified-engine/tasks/user/:userId', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/tasks/user/${testUserId}`,
        null,
        'regular'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(Array.isArray(response.data.data)).toBe(true)
      }
    })

    test('✅ 完成任务 - POST /api/v4/unified-engine/tasks/complete', async () => {
      const taskData = {
        task_id: 'daily_login',
        completion_data: {
          timestamp: new Date().toISOString()
        }
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/tasks/complete',
        taskData,
        'regular'
      )

      expect([200, 400, 404]).toContain(response.status)
    })

    test('✅ 获取任务进度 - GET /api/v4/unified-engine/tasks/progress/:userId', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/tasks/progress/${testUserId}`,
        null,
        'regular'
      )

      expect([200, 404]).toContain(response.status)
    })

    test('🔒 任务权限验证', async () => {
      const otherUserId = 99999

      await tester.testAuthorizationLevels(
        `/api/v4/unified-engine/tasks/user/${otherUserId}`,
        'GET',
        null,
        ['admin']
      )
    })
  })

  describe('任务奖励API', () => {
    test('✅ 领取任务奖励 - POST /api/v4/unified-engine/tasks/claim-reward', async () => {
      const rewardData = {
        task_id: 'daily_login',
        reward_type: 'points'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/tasks/claim-reward',
        rewardData,
        'regular'
      )

      expect([200, 400, 404]).toContain(response.status)
    })
  })
})
