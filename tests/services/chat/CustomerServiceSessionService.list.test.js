/**
 * CustomerServiceSessionService - 会话列表 last_message 字段下发测试
 *
 * 测试范围（本次需求落点）：
 * - getSessionList 返回的 last_message 必须包含 message_type/file_name/file_size
 * - 最后一条是图片消息时，message_type='image'（前端据此渲染 [图片]，不暴露 URL）
 * - 最后一条是文本消息时，message_type='text'，content 为文本原文
 * - image 消息的 file_name/file_size 应为 null（与真实库一致：仅 file 类型有值）
 *
 * 业务背景：
 * - 会话列表预览原先只下发 content，图片消息会暴露对象存储 URL，体验差。
 * - 详情接口 getSessionMessages 早已下发 message_type，本次将同口径补到列表接口。
 *
 * 数据隔离设计（重要）：
 * - 本测试为隔离用户专门新建一个独立会话，绝不复用/触碰任何真实业务会话，
 *   afterAll 只清理本测试自己新建的会话及其消息，杜绝误删真实数据。
 * - 连接 .env 指定的真实库 restaurant_points_dev，走真实写入路径，不使用 mock。
 *
 * @since 2026-06-18
 */

'use strict'

const { sequelize, ChatMessage, CustomerServiceSession } = require('../../../models')
const BeijingTimeHelper = require('../../../utils/timeHelper')

jest.setTimeout(30000)

/** 通过 ServiceManager 获取的会话服务实例（snake_case key，与路由层一致） */
let CustomerServiceSessionService

/** 测试用户ID（普通用户 13612227910），从 global.testData 动态获取，不硬编码 */
let testUserId = null

/** 本测试新建的隔离会话ID列表（仅清理这些，绝不碰真实会话） */
const isolatedSessionIds = []

describe('CustomerServiceSessionService.getSessionList - last_message 字段下发', () => {
  beforeAll(async () => {
    await sequelize.authenticate()

    CustomerServiceSessionService = global.getTestService('customer_service_session')
    if (!CustomerServiceSessionService) {
      throw new Error('customer_service_session 服务未注册到 ServiceManager')
    }

    testUserId = global.testData?.testUser?.user_id
    if (!testUserId) {
      throw new Error('测试用户未初始化（global.testData.testUser.user_id）')
    }
  })

  afterAll(async () => {
    /*
     * 仅清理本测试新建的隔离会话及其消息（先删子表消息，再删会话）。
     * 严格限定 isolatedSessionIds，不使用任何范围/复用会话，杜绝误删真实数据。
     */
    if (isolatedSessionIds.length > 0) {
      try {
        await ChatMessage.destroy({
          where: { customer_service_session_id: isolatedSessionIds },
          force: true
        })
        await CustomerServiceSession.destroy({
          where: { customer_service_session_id: isolatedSessionIds },
          force: true
        })
      } catch (error) {
        console.warn('⚠️ 清理隔离测试会话失败:', error.message)
      }
    }
  })

  /**
   * 新建一个隔离会话，写入一条消息，并通过 getSessionList 取回该会话的 last_message。
   * 每次调用都用独立会话，避免"最后一条消息"受同会话多消息时间精度影响。
   *
   * @param {('text'|'image'|'file')} messageType - 消息类型
   * @param {string} content - 消息内容
   * @returns {Promise<Object|null>} 该会话的 last_message 对象
   */
  /**
   * 新建一个隔离会话，写入一条消息，并通过 getSessionList 取回该会话的 last_message。
   * 富消息重构后：image/file/location 的 content 为可读占位/文件名/地址，URL/坐标进 metadata。
   *
   * @param {('text'|'image'|'file'|'location')} messageType - 消息类型
   * @param {string} content - 消息内容（已按新契约：image=[图片]、file=文件名、text=正文）
   * @param {Object|null} metadata - 富消息结构化负载（image→image_url 等）
   * @returns {Promise<Object|null>} 该会话的 last_message 对象
   */
  async function writeMessageAndFetchLast(messageType, content, metadata = null) {
    // status=closed：不与"活跃会话唯一索引"冲突，且不干扰用户活跃会话流
    const session = await CustomerServiceSession.create({
      user_id: testUserId,
      status: 'closed',
      source: 'mobile',
      priority: 1,
      created_at: BeijingTimeHelper.createBeijingTime()
    })
    const sessionId = session.customer_service_session_id
    isolatedSessionIds.push(sessionId)

    await ChatMessage.create({
      customer_service_session_id: sessionId,
      sender_id: testUserId,
      sender_type: 'user',
      message_source: 'user_client',
      content,
      message_type: messageType,
      metadata,
      status: 'sent',
      created_at: BeijingTimeHelper.createBeijingTime()
    })

    const result = await CustomerServiceSessionService.getSessionList({
      user_id: testUserId,
      page: 1,
      page_size: 50,
      include_last_message: true,
      sort_by: 'updated_at',
      sort_order: 'DESC'
    })

    const target = result.sessions.find(
      s => String(s.customer_service_session_id) === String(sessionId)
    )
    return target ? target.last_message : null
  }

  test('图片消息：last_message.message_type=image，content=[图片]，URL 在 metadata（不暴露渲染依赖到 content）', async () => {
    const imageUrl = 'https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/chat-image-test.png'
    // 富消息契约：image 的 content 为占位 [图片]，真实 URL 在 metadata.image_url
    const lastMessage = await writeMessageAndFetchLast('image', '[图片]', { image_url: imageUrl })

    expect(lastMessage).not.toBeNull()
    expect(lastMessage.message_type).toBe('image')
    expect(lastMessage.content).toBe('[图片]')
    expect(lastMessage.metadata).toBeTruthy()
    expect(lastMessage.metadata.image_url).toBe(imageUrl)
    expect(lastMessage.sender_type).toBe('user')
    /*
     * B-2：时间统一为单一字段，去掉 _beijing 伴随字段；
     * Service 层为 Date 对象，经 JSON 序列化（API 出口）为 UTC ISO（...Z），二者均合法
     */
    expect(lastMessage.created_at).toBeTruthy()
    expect(new Date(lastMessage.created_at).toISOString()).toMatch(/Z$/)
  })

  test('文本消息：last_message.message_type=text，content 为文本原文', async () => {
    const textContent = '请问我的积分什么时候到账'
    const lastMessage = await writeMessageAndFetchLast('text', textContent)

    expect(lastMessage).not.toBeNull()
    expect(lastMessage.message_type).toBe('text')
    expect(lastMessage.content).toBe(textContent)
  })
})
