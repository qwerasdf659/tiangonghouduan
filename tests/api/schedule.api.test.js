/**
 * 调度系统API完整测试套件
 */

const BaseAPITester = require('./BaseAPITester')

describe('调度系统API测试', () => {
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

  test('✅ 获取调度任务 - GET /api/v4/unified-engine/schedule/tasks', async () => {
    const response = await tester.makeAuthenticatedRequest(
      'GET',
      '/api/v4/unified-engine/schedule/tasks',
      null,
      'admin'
    )

    expect([200, 404]).toContain(response.status)
  })

  test('✅ 创建调度任务 - POST /api/v4/unified-engine/schedule/tasks', async () => {
    const taskData = {
      task_name: 'test_task',
      schedule: '0 0 * * *',
      task_type: 'data_cleanup'
    }

    const response = await tester.makeAuthenticatedRequest(
      'POST',
      '/api/v4/unified-engine/schedule/tasks',
      taskData,
      'admin'
    )

    expect([200, 201, 404]).toContain(response.status)
  })

  test('🔒 调度权限验证', async () => {
    await tester.testAuthorizationLevels('/api/v4/unified-engine/schedule/tasks', 'GET', null, [
      'admin'
    ])
  })
})
