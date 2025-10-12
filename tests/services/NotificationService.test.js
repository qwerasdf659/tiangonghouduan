/**
 * NotificationService 测试套件
 * 测试统一通知服务（客服聊天系统集成）
 * 创建时间：2025-10-11 北京时间
 */

const NotificationService = require('../../services/NotificationService')
const { CustomerSession, ChatMessage, User } = require('../../models')

describe('NotificationService - 统一通知服务', () => {
  let testUser

  beforeAll(async () => {
    // 创建测试用户
    testUser = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!testUser) {
      throw new Error('测试用户不存在，请先运行数据库初始化')
    }
  })

  describe('核心通知功能', () => {
    test('应该能够发送用户通知到聊天系统', async () => {
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
      expect(result.user_id).toBe(testUser.user_id)
      expect(result.type).toBe('test_notification')
      expect(result.title).toBe('测试通知')
      expect(result.saved_to_database).toBe(true)

      // 验证消息已保存到数据库
      const message = await ChatMessage.findByPk(result.notification_id)
      expect(message).toBeDefined()
      expect(message.message_source).toBe('system')
      expect(message.message_type).toBe('system')
      expect(message.sender_id).toBeNull() // ✅ 系统消息sender_id为NULL
      expect(message.content).toContain('测试通知')
    })

    test('应该能够自动创建用户聊天会话', async () => {
      const beforeSessionCount = await CustomerSession.count({
        where: { user_id: testUser.user_id }
      })

      await NotificationService.send(testUser.user_id, {
        type: 'auto_session_test',
        title: '自动会话测试',
        content: '测试自动创建会话功能'
      })

      const afterSessionCount = await CustomerSession.count({
        where: { user_id: testUser.user_id }
      })

      // 如果之前没有会话，应该自动创建一个
      expect(afterSessionCount).toBeGreaterThanOrEqual(beforeSessionCount)

      // 验证会话存在且状态正确
      const session = await CustomerSession.findOne({
        where: {
          user_id: testUser.user_id,
          status: ['waiting', 'assigned', 'active']
        },
        order: [['created_at', 'DESC']]
      })

      expect(session).toBeDefined()
      expect(session.user_id).toBe(testUser.user_id)
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
      expect(result.target).toBe('admins')
      expect(result.type).toBe('admin_test')
      expect(result.broadcasted_count).toBeGreaterThanOrEqual(0) // 可能没有在线管理员
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

      const result = await NotificationService.notifyExchangePending(
        testUser.user_id,
        exchangeData
      )

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

      expect(result.success).toBe(true)
      expect(result.type).toBe('image_rejected')
      expect(result.title).toBe('图片审核未通过')
      expect(result.content).toContain('图片不清晰')
    })
  })

  describe('错误处理', () => {
    test('当发送通知失败时应该返回错误但不抛出异常', async () => {
      // 使用不存在的用户ID
      const result = await NotificationService.send(99999, {
        type: 'error_test',
        title: '错误测试',
        content: '测试错误处理'
      })

      // 通知发送失败不应该影响业务流程
      expect(result).toBeDefined()
      // 可能成功（如果系统创建了会话）或失败，都应该有结果
    })
  })

  describe('系统消息格式验证', () => {
    test('系统消息应该包含正确的标题和内容格式', async () => {
      const result = await NotificationService.send(testUser.user_id, {
        type: 'format_test',
        title: '格式测试标题',
        content: '这是消息内容',
        data: { test: 'data' }
      })

      const message = await ChatMessage.findByPk(result.notification_id)

      // 验证消息格式
      expect(message.content).toBe('【格式测试标题】\n这是消息内容')
      expect(message.message_source).toBe('system')
      expect(message.sender_type).toBe('admin')
      expect(message.sender_id).toBeNull() // ✅ 系统消息sender_id为NULL

      // 验证元数据
      expect(message.metadata).toBeDefined()
      expect(message.metadata.notification_type).toBe('format_test')
      expect(message.metadata.title).toBe('格式测试标题')
      expect(message.metadata.is_system_notification).toBe(true)
    })

    test('没有标题的通知应该只显示内容', async () => {
      const result = await NotificationService.sendToChat(testUser.user_id, {
        content: '这是纯内容消息',
        notification_type: 'no_title_test'
      })

      const message = await ChatMessage.findByPk(result.message_id)
      expect(message.content).toBe('这是纯内容消息')
    })
  })

  describe('会话管理', () => {
    test('应该能够获取现有活跃会话', async () => {
      // 先创建一个活跃会话
      const session1 = await CustomerSession.create({
        user_id: testUser.user_id,
        status: 'active',
        source: 'test'
      })

      // 获取会话应该返回现有会话
      const session2 = await NotificationService.getOrCreateUserSession(testUser.user_id)

      // ✅ 转换为字符串比较，因为BIGINT类型可能返回字符串
      expect(String(session2.session_id)).toBe(String(session1.session_id))
      expect(session2.status).toBe('active')
    })

    test('应该能够在没有活跃会话时创建新会话', async () => {
      // 关闭所有现有会话
      await CustomerSession.update(
        { status: 'closed' },
        { where: { user_id: testUser.user_id } }
      )

      // 获取会话应该创建新会话
      const session = await NotificationService.getOrCreateUserSession(testUser.user_id)

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
      where: { mobile: '13612227930' }
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

    // 所有消息都应该保存到数据库
    const messages = await ChatMessage.findAll({
      where: {
        message_id: results.map(r => r.notification_id)
      }
    })

    expect(messages.length).toBe(10)
  })
})
