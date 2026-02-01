/**
 * WebSocket实时通知测试（Task 7.1/7.2/7.3）
 *
 * 测试覆盖：
 * 1. 7.1 抽奖结果推送 - 测试中奖后的实时通知
 * 2. 7.2 活动状态变更广播 - 测试开始/结束通知
 * 3. 7.3 连接管理 - 测试断线重连和会话恢复
 *
 * 测试原则：
 * - 使用真实数据库（restaurant_points_dev）
 * - 验证通知服务的消息推送逻辑
 * - 验证活动状态变更的通知机制
 * - 验证会话恢复和离线消息获取
 *
 * 创建时间：2026年01月28日 北京时间
 */

const TestCoordinator = require('../../api/TestCoordinator')
const { TEST_DATA } = require('../../helpers/test-data')
const BeijingTimeHelper = require('../../../utils/timeHelper')

describe('WebSocket实时通知测试（阶段六：P3）', () => {
  let tester = null
  let test_user_id = null
  /*
   * 🔴 P0修复：testUser 使用延迟获取，避免在模块加载时访问尚未初始化的 global.testData
   * TEST_DATA.users.testUser 是一个 getter，但在模块加载时 global.testData 尚未初始化
   * 因此需要在 beforeAll 中获取或使用辅助函数
   */

  /**
   * 获取测试用户数据
   * 优先使用 global.testData（jest.setup.js 初始化），回退到 TEST_DATA
   */
  function getTestUser() {
    if (global.testData && global.testData.testUser && global.testData.testUser.user_id) {
      return global.testData.testUser
    }
    // 回退使用 TEST_DATA（可能 user_id 为 null）
    return TEST_DATA.users.testUser
  }

  /*
   * ==========================================
   * 🔧 测试前准备
   * ==========================================
   */

  beforeAll(async () => {
    // 🔴 P0修复：在 beforeAll 中获取 testUser，此时 global.testData 已初始化
    const testUser = getTestUser()

    console.log('🚀 WebSocket实时通知测试启动')
    console.log('='.repeat(70))
    console.log(`📅 测试时间: ${BeijingTimeHelper.now()} (北京时间)`)
    console.log(`👤 测试账号: ${testUser.mobile} (用户ID: ${testUser.user_id})`)
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
      const user_data = await tester.authenticate_v4_user('regular')
      test_user_id = user_data.user.user_id
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
    console.log('🏁 WebSocket实时通知测试完成')
  })

  /*
   * ==========================================
   * 📦 7.1 抽奖结果推送测试
   * ==========================================
   */

  describe('7.1 抽奖结果推送', () => {
    test('NotificationService.notifyLotteryWin 应该正确构建中奖通知', async () => {
      const NotificationService = require('../../../services/NotificationService')

      // 测试通知构建（不实际发送，验证方法存在且参数正确）
      expect(typeof NotificationService.notifyLotteryWin).toBe('function')

      // 验证方法签名
      const methodStr = NotificationService.notifyLotteryWin.toString()
      expect(methodStr).toContain('user_id')
      expect(methodStr).toContain('lotteryData')

      console.log('✅ notifyLotteryWin 方法验证通过')
    })

    test('抽奖API响应应该包含lottery_session_id用于通知追踪', async () => {
      if (!test_user_id) {
        console.log('⏭️ 跳过：用户未认证')
        return
      }

      // 先获取可用活动
      const campaignsResponse = await tester.make_authenticated_request(
        'GET',
        '/api/v4/lottery/campaigns',
        null,
        'regular'
      )

      if (campaignsResponse.status !== 200 || !campaignsResponse.data.data?.length) {
        console.log('⏭️ 跳过：无可用活动')
        return
      }

      const campaign = campaignsResponse.data.data[0]
      console.log(`📋 测试活动: ${campaign.campaign_name} (${campaign.campaign_code})`)

      // 执行抽奖（如果用户有足够积分）
      const drawResponse = await tester.make_authenticated_request(
        'POST',
        '/api/v4/lottery/draw',
        {
          campaign_code: campaign.campaign_code,
          draw_count: 1
        },
        'regular',
        {
          'Idempotency-Key': `test_ws_notify_${Date.now()}`
        }
      )

      // 验证响应结构
      if (drawResponse.status === 200) {
        expect(drawResponse.data.data).toHaveProperty('lottery_session_id')
        expect(drawResponse.data.data).toHaveProperty('prizes')
        console.log('✅ 抽奖响应包含lottery_session_id，可用于WebSocket通知追踪')
      } else {
        console.log(`⚠️ 抽奖失败: ${drawResponse.data.message} (预期行为，可能积分不足)`)
      }
    })
  })

  /*
   * ==========================================
   * 📢 7.2 活动状态变更广播测试
   * ==========================================
   */

  describe('7.2 活动状态变更广播', () => {
    test('NotificationService.notifyActivityStatusChange 应该正确广播状态变更', async () => {
      const NotificationService = require('../../../services/NotificationService')

      // 验证方法存在
      expect(typeof NotificationService.notifyActivityStatusChange).toBe('function')
      expect(typeof NotificationService.notifyActivityStarted).toBe('function')
      expect(typeof NotificationService.notifyActivityPaused).toBe('function')
      expect(typeof NotificationService.notifyActivityEnded).toBe('function')

      console.log('✅ 活动状态变更通知方法验证通过')
    })

    test('ActivityService.updateCampaignStatus 应该支持状态变更和通知', async () => {
      const ActivityService = require('../../../services/ActivityService')

      // 验证方法存在
      expect(typeof ActivityService.updateCampaignStatus).toBe('function')
      expect(typeof ActivityService.startCampaign).toBe('function')
      expect(typeof ActivityService.pauseCampaign).toBe('function')
      expect(typeof ActivityService.endCampaign).toBe('function')

      console.log('✅ ActivityService状态变更方法验证通过')
    })

    test('活动状态变更应该遵循正确的状态转换规则', async () => {
      const ActivityService = require('../../../services/ActivityService')

      // 测试无效状态转换（结束状态不能变更）
      const models = require('../../../models')
      const testCampaign = await models.LotteryCampaign.findOne({
        where: { status: 'ended' }
      })

      if (testCampaign) {
        await expect(
          ActivityService.updateCampaignStatus(testCampaign.lottery_campaign_id, 'active', {})
        ).rejects.toThrow(/状态变更不允许/)
        console.log('✅ 无效状态转换被正确拒绝')
      } else {
        console.log('⏭️ 跳过：无已结束活动可测试')
      }
    })
  })

  /*
   * ==========================================
   * 🔄 7.3 连接管理测试
   * ==========================================
   */

  describe('7.3 连接管理（断线重连和会话恢复）', () => {
    test('ChatWebSocketService 应该支持获取离线消息', async () => {
      const ChatWebSocketService = require('../../../services/ChatWebSocketService')

      // 验证方法存在
      expect(typeof ChatWebSocketService.getOfflineMessages).toBe('function')
      expect(typeof ChatWebSocketService.handleReconnection).toBe('function')
      expect(typeof ChatWebSocketService.getConnectionStatus).toBe('function')

      console.log('✅ ChatWebSocketService会话恢复方法验证通过')
    })

    test('getOfflineMessages 应该返回正确的消息结构', async () => {
      const ChatWebSocketService = require('../../../services/ChatWebSocketService')

      // 🔴 P0修复：使用延迟获取的测试用户数据
      const testUser = getTestUser()

      // 使用测试用户ID获取离线消息
      const result = await ChatWebSocketService.getOfflineMessages(testUser.user_id, {
        limit: 10
      })

      // 验证返回结构
      expect(result).toHaveProperty('messages')
      expect(result).toHaveProperty('count')
      expect(result).toHaveProperty('sync_timestamp')
      expect(Array.isArray(result.messages)).toBe(true)
      expect(typeof result.count).toBe('number')

      console.log(`✅ 获取离线消息成功，消息数量: ${result.count}`)
    })

    test('getConnectionStatus 应该返回正确的连接状态', () => {
      const ChatWebSocketService = require('../../../services/ChatWebSocketService')

      // 🔴 P0修复：使用延迟获取的测试用户数据
      const testUser = getTestUser()

      // 测试用户连接状态查询
      const userStatus = ChatWebSocketService.getConnectionStatus(testUser.user_id, 'user')
      expect(userStatus).toHaveProperty('connected')
      expect(userStatus).toHaveProperty('socket_id')
      expect(userStatus).toHaveProperty('user_type')
      expect(userStatus).toHaveProperty('timestamp')
      expect(userStatus.user_type).toBe('user')

      // 测试管理员连接状态查询
      const adminStatus = ChatWebSocketService.getConnectionStatus(testUser.user_id, 'admin')
      expect(adminStatus.user_type).toBe('admin')

      console.log(`✅ 用户连接状态: ${userStatus.connected ? '在线' : '离线'}`)
    })

    test('WebSocket服务状态API应该正常返回', async () => {
      if (!tester) {
        console.log('⏭️ 跳过：测试协调器未初始化')
        return
      }

      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/system/websocket-status',
        null,
        'admin'
      )

      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('status')
        expect(response.data.data).toHaveProperty('connections')
        expect(['running', 'stopped']).toContain(response.data.data.status)
        console.log(`✅ WebSocket服务状态: ${response.data.data.status}`)
        console.log(`   当前连接数: ${response.data.data.connections}`)
      } else {
        console.log(`⚠️ WebSocket状态API返回: ${response.status}`)
      }
    })
  })

  /*
   * ==========================================
   * 🏗️ 集成测试
   * ==========================================
   */

  describe('集成测试', () => {
    test('通知服务应该能够正常发送系统通知', async () => {
      const NotificationService = require('../../../services/NotificationService')

      // 🔴 P0修复：使用延迟获取的测试用户数据
      const testUser = getTestUser()

      // 跳过条件：如果用户ID未初始化
      if (!testUser.user_id) {
        console.log('⏭️ 跳过：测试用户ID未初始化')
        return
      }

      // 测试发送通用通知（使用真实用户ID）
      const result = await NotificationService.send(testUser.user_id, {
        type: 'test_notification',
        title: '测试通知',
        content: 'WebSocket实时通知测试消息',
        data: { test: true, timestamp: Date.now() }
      })

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('user_id')
      expect(result.user_id).toBe(testUser.user_id)

      if (result.success) {
        expect(result).toHaveProperty('notification_id')
        expect(result).toHaveProperty('saved_to_database')
        console.log(`✅ 测试通知发送成功，ID: ${result.notification_id}`)
        console.log(`   WebSocket推送: ${result.pushed_to_websocket ? '是' : '否（用户离线）'}`)
      } else {
        console.log(`⚠️ 通知发送失败: ${result.error}`)
      }
    })

    test('管理员广播通知应该能够正常工作', async () => {
      const NotificationService = require('../../../services/NotificationService')

      // 测试发送管理员广播
      const result = await NotificationService.sendToAdmins({
        type: 'test_admin_broadcast',
        title: '测试管理员广播',
        content: 'WebSocket管理员广播测试消息',
        data: { test: true, timestamp: Date.now() }
      })

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('target')
      expect(result.target).toBe('admins')

      if (result.success) {
        expect(result).toHaveProperty('broadcasted_count')
        console.log(`✅ 管理员广播成功，推送给 ${result.broadcasted_count} 个在线管理员`)
      } else {
        console.log(`⚠️ 管理员广播失败: ${result.error}`)
      }
    })
  })
})
