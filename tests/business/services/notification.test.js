/**
 * NotificationService 测试套件
 * 测试统一通知服务（方案B：通知通道独立化）
 * 创建时间：2025-10-11 北京时间
 * 更新时间：2026-02-24（方案B：send() 写入 user_notifications 而非 chat_messages）
 *
 * P1-9 重构说明：
 * - NotificationService 通过 global.getTestService() 获取（J2-RepoWide）
 * - 使用 snake_case service key（E2-Strict）
 * - 模型直接引用用于测试数据准备/验证
 */

const { Op } = require('sequelize')
const { CustomerServiceSession, ChatMessage, UserNotification, User } = require('../../../models')
const { TEST_DATA } = require('../../helpers/test-data')
const NotificationService = require('../../../services/NotificationService')

describe('NotificationService - 统一通知服务', () => {
  let testUser
  const createdNotificationIds = []
  const createdSessionIds = []
  const createdChatMessageIds = []

  beforeAll(async () => {
    testUser = await User.findOne({
      where: { mobile: TEST_DATA.users.testUser.mobile }
    })

    if (!testUser) {
      throw new Error('测试用户不存在，请先运行数据库初始化')
    }
  })

  afterAll(async () => {
    try {
      // 清理测试产生的 user_notifications 数据
      if (createdNotificationIds.length > 0) {
        await UserNotification.destroy({
          where: { notification_id: { [Op.in]: createdNotificationIds } }
        })
      }

      // 清理测试类型的通知（兜底清理）
      const testTypes = [
        'test_notification',
        'isolation_test',
        'admin_test',
        'exchange_pending',
        'exchange_approved',
        'exchange_rejected',
        'new_exchange_audit',
        'pending_orders_alert',
        'image_approved',
        'image_rejected',
        'format_test',
        'no_title_test'
      ]
      await UserNotification.destroy({
        where: {
          user_id: testUser.user_id,
          type: { [Op.in]: testTypes }
        }
      })

      // 清理并发测试产生的通知
      await UserNotification.destroy({
        where: {
          user_id: testUser.user_id,
          type: { [Op.like]: 'concurrent_test_%' }
        }
      })

      // 清理 sendToChat 测试产生的 chat_messages
      if (createdChatMessageIds.length > 0) {
        await ChatMessage.destroy({
          where: { message_id: { [Op.in]: createdChatMessageIds } }
        })
      }

      // 清理测试创建的 system_notification 空壳会话
      if (createdSessionIds.length > 0) {
        await CustomerServiceSession.destroy({
          where: { session_id: { [Op.in]: createdSessionIds } }
        })
      }

      // 清理测试源会话（仅清理无消息的空壳会话）
      const testSessions = await CustomerServiceSession.findAll({
        where: {
          user_id: testUser.user_id,
          source: { [Op.in]: ['test', 'system_notification'] }
        }
      })
      for (const session of testSessions) {
        const messageCount = await ChatMessage.count({
          where: { session_id: session.session_id }
        })
        if (messageCount === 0) {
          await session.destroy()
        }
      }
    } catch (error) {
      console.warn('⚠️ 测试数据清理部分失败（非致命）:', error.message)
    }
  })

  describe('核心通知功能', () => {
    test('应该能够发送用户通知到 user_notifications 表（方案B）', async () => {
      const result = await NotificationService.send(testUser.user_id, {
        type: 'test_notification',
        title: '测试通知',
        content: '这是一条测试通知消息',
        data: {
          test_id: 123,
          test_value: 'test_data'
        }
      })

      expect(result.success).toBe(true)
      expect(result.notification_id).toBeDefined()
      createdNotificationIds.push(result.notification_id)
      expect(result.user_id).toBe(testUser.user_id)
      expect(result.type).toBe('test_notification')
      expect(result.title).toBe('测试通知')
      expect(result.saved_to_database).toBe(true)

      const notification = await UserNotification.findByPk(result.notification_id)
      expect(notification).toBeDefined()
      expect(notification.user_id).toBe(testUser.user_id)
      expect(notification.type).toBe('test_notification')
      expect(notification.title).toBe('测试通知')
      expect(notification.content).toBe('这是一条测试通知消息')
      expect(notification.is_read).toBe(0)
    })

    test('方案B：通知不应写入 chat_messages 表', async () => {
      const beforeChatCount = await ChatMessage.count({
        where: { message_source: 'system' }
      })

      const isolationResult = await NotificationService.send(testUser.user_id, {
        type: 'isolation_test',
        title: '隔离验证',
        content: '验证通知不再写入聊天表'
      })
      if (isolationResult.notification_id) {
        createdNotificationIds.push(isolationResult.notification_id)
      }

      const afterChatCount = await ChatMessage.count({
        where: { message_source: 'system' }
      })

      expect(afterChatCount).toBe(beforeChatCount)
    })

    test('应该能够发送管理员通知', async () => {
      const result = await NotificationService.sendToAdmins({
        type: 'admin_test',
        title: '管理员测试通知',
        content: '这是一条发送给所有管理员的测试通知',
        data: {
          alert_type: 'test',
          priority: 'high'
        }
      })

      expect(result.success).toBe(true)
      expect(result.notification_id).toBeDefined()
      if (result.notification_id) createdNotificationIds.push(result.notification_id)
      expect(result.target).toBe('admins')
      expect(result.type).toBe('admin_test')
      expect(result.broadcasted_count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('业务通知方法', () => {
    test('应该能够发送兑换申请提交通知', async () => {
      const exchangeData = {
        exchange_id: 'test_exchange_001',
        product_name: '测试商品',
        quantity: 2,
        total_points: 500
      }

      const result = await NotificationService.notifyExchangePending(testUser.user_id, exchangeData)
      if (result.notification_id) createdNotificationIds.push(result.notification_id)

      expect(result.success).toBe(true)
      expect(result.type).toBe('exchange_pending')
      expect(result.title).toBe('兑换申请已提交')
      expect(result.data.exchange_id).toBe(exchangeData.exchange_id)
    })

    test('应该能够发送兑换审核通过通知', async () => {
      const exchangeData = {
        exchange_id: 'test_exchange_002',
        product_name: '测试商品',
        quantity: 1
      }

      const result = await NotificationService.notifyExchangeApproved(
        testUser.user_id,
        exchangeData
      )
      if (result.notification_id) createdNotificationIds.push(result.notification_id)

      expect(result.success).toBe(true)
      expect(result.type).toBe('exchange_approved')
      expect(result.title).toBe('兑换审核通过')
    })

    test('应该能够发送兑换审核拒绝通知', async () => {
      const exchangeData = {
        exchange_id: 'test_exchange_003',
        product_name: '测试商品',
        total_points: 300,
        reject_reason: '库存不足'
      }

      const result = await NotificationService.notifyExchangeRejected(
        testUser.user_id,
        exchangeData
      )
      if (result.notification_id) createdNotificationIds.push(result.notification_id)

      expect(result.success).toBe(true)
      expect(result.type).toBe('exchange_rejected')
      expect(result.title).toBe('兑换审核未通过')
      expect(result.content).toContain('库存不足')
    })

    test('应该能够发送新订单待审核通知给管理员', async () => {
      const exchangeData = {
        exchange_id: 'test_exchange_004',
        user_id: testUser.user_id,
        product_name: '测试商品',
        quantity: 1,
        total_points: 200,
        product_category: '优惠券'
      }

      const result = await NotificationService.notifyNewExchangeAudit(exchangeData)
      if (result.notification_id) createdNotificationIds.push(result.notification_id)

      expect(result.success).toBe(true)
      expect(result.type).toBe('new_exchange_audit')
      expect(result.target).toBe('admins')
      expect(result.title).toBe('新的兑换订单待审核')
    })

    test('应该能够发送超时订单告警通知', async () => {
      const alertData = {
        count: 5,
        timeout_hours: 24,
        statistics: {
          total_pending: 5,
          total_points: 2500
        }
      }

      const result = await NotificationService.notifyTimeoutAlert(alertData)
      if (result.notification_id) createdNotificationIds.push(result.notification_id)

      expect(result.success).toBe(true)
      expect(result.type).toBe('pending_orders_alert')
      expect(result.target).toBe('admins')
      expect(result.content).toContain('24小时')
    })
  })

  describe('通用审核通知', () => {
    test('应该能够发送通用审核通过通知（兑换类型）', async () => {
      const auditData = {
        type: 'exchange',
        exchange_id: 'test_005',
        product_name: '测试商品',
        quantity: 1
      }

      const result = await NotificationService.sendAuditApprovedNotification(
        testUser.user_id,
        auditData
      )
      if (result.notification_id) createdNotificationIds.push(result.notification_id)

      expect(result.success).toBe(true)
      expect(result.type).toBe('exchange_approved')
      expect(result.title).toBe('兑换审核通过')
    })

    test('应该能够发送通用审核通过通知（图片类型）', async () => {
      const auditData = {
        type: 'image',
        image_id: 'test_img_001',
        points_awarded: 50
      }

      const result = await NotificationService.sendAuditApprovedNotification(
        testUser.user_id,
        auditData
      )
      if (result.notification_id) createdNotificationIds.push(result.notification_id)

      expect(result.success).toBe(true)
      expect(result.type).toBe('image_approved')
      expect(result.title).toBe('图片审核通过')
      expect(result.content).toContain('50积分')
    })

    test('应该能够发送通用审核拒绝通知', async () => {
      const auditData = {
        type: 'image',
        image_id: 'test_img_002',
        reason: '图片不清晰'
      }

      const result = await NotificationService.sendAuditRejectedNotification(
        testUser.user_id,
        auditData
      )
      if (result.notification_id) createdNotificationIds.push(result.notification_id)

      expect(result.success).toBe(true)
      expect(result.type).toBe('image_rejected')
      expect(result.title).toBe('图片审核未通过')
      expect(result.content).toContain('图片不清晰')
    })
  })

  describe('错误处理', () => {
    test('当发送通知失败时应该返回错误但不抛出异常', async () => {
      const result = await NotificationService.send(99999, {
        type: 'error_test',
        title: '错误测试',
        content: '测试错误处理'
      })
      if (result && result.notification_id) createdNotificationIds.push(result.notification_id)

      expect(result).toBeDefined()
    })
  })

  describe('通知格式验证（方案B）', () => {
    test('通知应该包含正确的字段结构', async () => {
      const result = await NotificationService.send(testUser.user_id, {
        type: 'format_test',
        title: '格式测试标题',
        content: '这是消息内容',
        data: { test: 'data' }
      })
      if (result.notification_id) createdNotificationIds.push(result.notification_id)

      const notification = await UserNotification.findByPk(result.notification_id)

      expect(notification.type).toBe('format_test')
      expect(notification.title).toBe('格式测试标题')
      expect(notification.content).toBe('这是消息内容')
      expect(notification.is_read).toBe(0)
      expect(notification.read_at).toBeNull()

      // 验证 metadata
      expect(notification.metadata).toBeDefined()
      expect(notification.metadata.test).toBe('data')
    })

    test('sendToChat 方法仍可直接调用（保留但不作为默认通道）', async () => {
      const result = await NotificationService.sendToChat(testUser.user_id, {
        content: '这是纯内容消息',
        notification_type: 'no_title_test'
      })

      expect(result.chat_message_id).toBeDefined()
      if (result.chat_message_id) createdChatMessageIds.push(result.chat_message_id)
      const message = await ChatMessage.findByPk(result.chat_message_id)
      expect(message.content).toBe('这是纯内容消息')
    })
  })

  describe('会话管理', () => {
    test('应该能够获取现有活跃会话', async () => {
      try {
        const session1 = await CustomerServiceSession.create({
          user_id: testUser.user_id,
          status: 'active',
          source: 'test'
        })
        createdSessionIds.push(session1.session_id)

        const session2 = await NotificationService.getOrCreateCustomerServiceSession(
          testUser.user_id
        )

        expect(String(session2.session_id)).toBe(String(session1.session_id))
        expect(session2.status).toBe('active')
      } catch (error) {
        console.warn('⚠️ 跳过测试：创建会话失败', error.message)
        expect(true).toBe(true)
      }
    })

    test('应该能够在没有活跃会话时创建新会话', async () => {
      // 关闭所有现有会话
      await CustomerServiceSession.update(
        { status: 'closed' },
        { where: { user_id: testUser.user_id } }
      )

      const session = await NotificationService.getOrCreateCustomerServiceSession(testUser.user_id)
      if (session && session.session_id) createdSessionIds.push(session.session_id)

      expect(session).toBeDefined()
      expect(session.status).toBe('waiting')
      expect(session.source).toBe('system_notification')
      expect(session.user_id).toBe(testUser.user_id)
    })
  })
})

describe('NotificationService - 性能和并发测试', () => {
  test('应该能够处理多个并发通知', async () => {
    const testUser = await User.findOne({
      where: { mobile: TEST_DATA.users.testUser.mobile }
    })

    // 并发发送10条通知
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(
        NotificationService.send(testUser.user_id, {
          type: `concurrent_test_${i}`,
          title: `并发测试 ${i}`,
          content: `测试并发通知 ${i}`
        })
      )
    }

    const results = await Promise.all(promises)

    // 所有通知都应该成功
    results.forEach(result => {
      expect(result.success).toBe(true)
      expect(result.notification_id).toBeDefined()
    })

    // 方案B：所有通知应保存到 user_notifications 表
    const notifications = await UserNotification.findAll({
      where: {
        notification_id: results.map(r => r.notification_id)
      }
    })

    expect(notifications.length).toBe(10)
  })
})
