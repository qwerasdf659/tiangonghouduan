/**
 * AnnouncementService 单元测试
 * 公告通知服务测试（用户端公告 + 管理员通知中心 + 后台内容管理）
 *
 * 测试范围：
 * - 公告列表查询（多条件筛选）
 * - 公告详情查询
 * - 公告创建/更新/删除（管理员）
 * - 批量操作
 * - 统计功能
 *
 * 测试原则：
 * - 连接真实数据库，不使用mock
 * - 通过 ServiceManager 获取服务实例
 * - 测试数据在 afterEach 中清理
 * - 验证返回格式匹配实际服务定义
 *
 * @see /services/AnnouncementService.js
 * @created 2026-01-29
 */

const { sequelize } = require('../../models')
const { SystemAnnouncement } = require('../../models')

describe('AnnouncementService - 公告通知服务测试', () => {
  let AnnouncementService
  let testUserId // 真实存在的用户ID
  const created_announcement_ids = [] // 跟踪测试创建的公告ID，用于清理

  beforeAll(async () => {
    // 确保数据库连接
    await sequelize.authenticate()

    // 通过 ServiceManager 获取服务实例
    AnnouncementService = global.getTestService('announcement')

    if (!AnnouncementService) {
      throw new Error('AnnouncementService 未正确注册到 ServiceManager')
    }

    // 获取真实存在的用户ID（用于外键约束）
    testUserId = global.testData?.user?.user_id
    if (!testUserId) {
      // 如果没有测试数据，从数据库查询一个真实用户
      const { User } = require('../../models')
      const user = await User.findOne({ attributes: ['user_id'] })
      testUserId = user?.user_id || 1
    }

    console.log('✅ AnnouncementService 测试环境初始化完成，testUserId:', testUserId)
  })

  afterEach(async () => {
    // 清理测试创建的公告
    if (created_announcement_ids.length > 0) {
      await SystemAnnouncement.destroy({
        where: {
          announcement_id: created_announcement_ids
        }
      })
      created_announcement_ids.length = 0 // 清空数组
    }
  })

  afterAll(async () => {
    console.log('✅ 数据库连接已关闭')
  })

  /*
   * ========================================
   * 公告列表查询测试
   * ========================================
   */
  describe('getAnnouncements - 公告列表查询', () => {
    it('应该成功获取公告列表', async () => {
      // 执行：获取公告列表（返回数组）
      const result = await AnnouncementService.getAnnouncements({
        limit: 10,
        offset: 0,
        activeOnly: true
      })

      // 断言：返回数组
      expect(Array.isArray(result)).toBe(true)
    })

    it('应该支持类型筛选', async () => {
      // 执行：按类型筛选
      const result = await AnnouncementService.getAnnouncements({
        type: 'notice',
        limit: 10
      })

      // 断言：结果为数组
      expect(Array.isArray(result)).toBe(true)
    })

    it('应该支持优先级筛选', async () => {
      // 执行：按优先级筛选
      const result = await AnnouncementService.getAnnouncements({
        priority: 'high',
        limit: 10
      })

      // 断言：结果为数组
      expect(Array.isArray(result)).toBe(true)
    })
  })

  /*
   * ========================================
   * 公告计数测试
   * ========================================
   */
  describe('getAnnouncementsCount - 公告计数', () => {
    it('应该返回公告数量', async () => {
      // 执行：获取公告计数
      const count = await AnnouncementService.getAnnouncementsCount()

      // 断言：返回数字
      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('应该支持按类型计数', async () => {
      // 执行：按类型计数
      const count = await AnnouncementService.getAnnouncementsCount({
        type: 'notice'
      })

      // 断言：返回数字
      expect(typeof count).toBe('number')
    })
  })

  /*
   * ========================================
   * 公告详情查询测试
   * ========================================
   */
  describe('getAnnouncementById - 公告详情查询', () => {
    it('查询不存在的公告应该返回null', async () => {
      // 执行：查询不存在的ID
      const result = await AnnouncementService.getAnnouncementById(999999999)

      // 断言：返回null
      expect(result).toBeNull()
    })
  })

  /*
   * ========================================
   * 阅读量操作测试
   * ========================================
   */
  describe('incrementViewCount - 增加阅读量', () => {
    it('增加不存在公告的阅读量应该失败', async () => {
      // 执行：增加不存在公告的阅读量
      const result = await AnnouncementService.incrementViewCount(999999999)

      // 断言：返回false或0（未更新任何记录）
      expect([0, false]).toContain(result)
    })
  })

  /*
   * ========================================
   * 未读计数测试
   * ========================================
   */
  describe('getUnreadCount - 未读公告计数', () => {
    it('应该返回未读数量', async () => {
      // 执行：获取未读计数（需要已读ID列表）
      const count = await AnnouncementService.getUnreadCount([])

      // 断言：返回数字
      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('排除已读ID后应该返回更少的未读数', async () => {
      // 准备：获取所有活跃公告
      const announcements = await AnnouncementService.getAnnouncements({
        limit: 10,
        activeOnly: true
      })

      if (announcements.length === 0) {
        console.log('⚠️ 跳过测试：无公告数据')
        return
      }

      // 获取全部未读数
      const totalUnread = await AnnouncementService.getUnreadCount([])

      // 标记一个为已读
      const readIds = [announcements[0].announcement_id]
      const unreadAfterMark = await AnnouncementService.getUnreadCount(readIds)

      // 断言：已读后未读数减少（或保持0）
      expect(unreadAfterMark).toBeLessThanOrEqual(totalUnread)
    })
  })

  /*
   * ========================================
   * 管理员公告管理功能
   * ========================================
   */
  describe('管理员公告管理功能', () => {
    describe('createAnnouncement - 创建公告', () => {
      it('应该成功创建公告', async () => {
        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
        const testData = {
          title: `测试公告_${uniqueSuffix}`,
          content: '这是测试公告内容',
          type: 'notice',
          priority: 'medium'
        }

        // 执行：创建公告（直接返回公告对象，不包装）
        const result = await AnnouncementService.createAnnouncement(testData, testUserId)

        // 记录ID用于清理
        if (result && result.announcement_id) {
          created_announcement_ids.push(result.announcement_id)
        }

        // 断言：返回公告对象
        expect(result).toBeDefined()
        expect(result.announcement_id).toBeDefined()
        expect(result.title).toContain('测试公告')
        expect(result.type).toBe('notice')
        expect(result.priority).toBe('medium')
      })

      it('创建公告时必填字段不能为空', async () => {
        // 由于 Sequelize 会校验必填字段，尝试创建空标题的公告应该失败
        await expect(
          AnnouncementService.createAnnouncement(
            {
              title: '', // 空标题
              content: '内容'
            },
            testUserId
          )
        ).rejects.toThrow()
      })
    })

    describe('updateAnnouncement - 更新公告', () => {
      let test_announcement_id = null

      beforeEach(async () => {
        // 创建测试公告
        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
        const announcement = await AnnouncementService.createAnnouncement(
          {
            title: `更新测试_${uniqueSuffix}`,
            content: '原始内容',
            type: 'notice',
            priority: 'low'
          },
          testUserId
        )
        test_announcement_id = announcement.announcement_id
        created_announcement_ids.push(test_announcement_id)
      })

      it('应该成功更新公告', async () => {
        // 执行：更新公告
        const result = await AnnouncementService.updateAnnouncement(test_announcement_id, {
          title: '更新后的标题',
          priority: 'high'
        })

        // 断言：返回更新后的公告对象
        expect(result).toBeDefined()
        expect(result.title).toBe('更新后的标题')
        expect(result.priority).toBe('high')
      })

      it('更新不存在的公告应该返回null', async () => {
        // 执行：更新不存在的公告
        const result = await AnnouncementService.updateAnnouncement(999999999, {
          title: '不存在'
        })

        // 断言：返回null
        expect(result).toBeNull()
      })
    })

    describe('deleteAnnouncement - 删除公告', () => {
      it('应该成功删除公告', async () => {
        // 准备：创建测试公告
        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
        const announcement = await AnnouncementService.createAnnouncement(
          {
            title: `删除测试_${uniqueSuffix}`,
            content: '待删除内容',
            type: 'notice'
          },
          testUserId
        )

        const announcement_id = announcement.announcement_id

        // 执行：删除公告
        const result = await AnnouncementService.deleteAnnouncement(announcement_id)

        // 断言：返回 true 表示删除成功
        expect(result).toBe(true)

        // 验证：确认已删除
        const deleted = await AnnouncementService.getAnnouncementById(announcement_id)
        expect(deleted).toBeNull()
      })

      it('删除不存在的公告应该返回false', async () => {
        // 执行：删除不存在的公告
        const result = await AnnouncementService.deleteAnnouncement(999999999)

        // 断言：返回 false 表示未找到
        expect(result).toBe(false)
      })
    })

    describe('deactivateBatch - 批量停用', () => {
      it('应该成功批量停用公告', async () => {
        // 准备：创建多个测试公告
        const announcement_ids = []
        for (let i = 0; i < 2; i++) {
          const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
          const announcement = await AnnouncementService.createAnnouncement(
            {
              title: `批量停用测试_${i}_${uniqueSuffix}`,
              content: '测试内容'
            },
            testUserId
          )
          announcement_ids.push(announcement.announcement_id)
          created_announcement_ids.push(announcement.announcement_id)
        }

        // 执行：批量停用
        const result = await AnnouncementService.deactivateBatch(announcement_ids)

        // 断言：返回更新数量
        expect(result).toBeDefined()
        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThanOrEqual(0)
      })
    })
  })

  /*
   * ========================================
   * 统计功能测试
   * ========================================
   */
  describe('统计功能', () => {
    describe('getStatistics - 公告统计', () => {
      it('应该成功获取公告统计数据', async () => {
        // 执行：获取统计
        const result = await AnnouncementService.getStatistics()

        // 断言：返回对象包含统计字段
        expect(result).toBeDefined()
        expect(typeof result.total).toBe('number')
        expect(typeof result.active).toBe('number')
        // 服务返回 expired 和 unread，不是 by_type 和 by_priority
        expect(typeof result.expired).toBe('number')
        expect(typeof result.unread).toBe('number')
      })
    })

    describe('getNotificationStatistics - 通知统计', () => {
      it('应该成功获取通知统计数据', async () => {
        // 执行：获取通知统计
        const result = await AnnouncementService.getNotificationStatistics()

        // 断言：返回对象包含统计字段
        expect(result).toBeDefined()
        expect(typeof result.total).toBe('number')
        expect(typeof result.unread).toBe('number')
        // 服务返回 today 和 week，不是 by_type
        expect(typeof result.today).toBe('number')
        expect(typeof result.week).toBe('number')
      })
    })
  })

  /*
   * ========================================
   * 格式转换测试
   * ========================================
   */
  describe('convertToNotificationFormat - 格式转换', () => {
    it('应该成功将公告转换为通知格式', async () => {
      // 准备：获取公告列表
      const announcements = await AnnouncementService.getAnnouncements({
        limit: 5
      })

      if (announcements.length === 0) {
        console.log('⚠️ 跳过测试：无公告数据')
        return
      }

      // 执行：转换格式
      const result = AnnouncementService.convertToNotificationFormat(announcements)

      // 断言：返回数组
      expect(Array.isArray(result)).toBe(true)

      // 验证格式
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('id')
        expect(result[0]).toHaveProperty('title')
        expect(result[0]).toHaveProperty('content')
      }
    })
  })

  /*
   * ========================================
   * 批量标记已读测试
   * ========================================
   */
  describe('markAsReadBatch - 批量标记已读', () => {
    it('应该返回标记结果', async () => {
      // 准备：获取公告列表
      const announcements = await AnnouncementService.getAnnouncements({
        limit: 5
      })

      if (announcements.length === 0) {
        console.log('⚠️ 跳过测试：无公告数据')
        return
      }

      // 获取公告ID
      const announcement_ids = announcements.map(a => a.announcement_id)

      // 执行：批量标记已读
      const result = await AnnouncementService.markAsReadBatch(announcement_ids)

      // 断言：返回标记数量
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThanOrEqual(0)
    })
  })
})
