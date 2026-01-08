/**
 * AnnouncementService 单元测试
 *
 * 更新时间：2026-01-09（P1-9 ServiceManager 集成）
 *
 * P1-9 重构说明：
 * - 服务通过 global.getTestService() 获取（J2-RepoWide）
 * - 使用 snake_case service key（E2-Strict）
 * - 本测试使用 mock，但仍通过 ServiceManager 获取服务保持一致性
 */

const { SystemAnnouncement } = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')

// Mock数据库模型
jest.mock('../../models')
jest.mock('../../utils/timeHelper')

// 🔴 P1-9：通过 ServiceManager 获取服务（替代直接 require）
let AnnouncementService

describe('AnnouncementService', () => {
  beforeAll(() => {
    // 🔴 P1-9：通过 ServiceManager 获取服务实例（snake_case key）
    AnnouncementService = global.getTestService('announcement')
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getAnnouncements', () => {
    test('应该返回活跃的未过期公告（用户端场景）', async () => {
      const mockAnnouncements = [
        {
          announcement_id: 1,
          title: '测试公告1',
          content: '内容1',
          type: 'system',
          priority: 'high',
          is_active: true,
          expires_at: null,
          view_count: 10,
          created_at: '2025-12-01T10:00:00+08:00',
          toJSON: function () {
            return this
          }
        },
        {
          announcement_id: 2,
          title: '测试公告2',
          content: '内容2',
          type: 'notice',
          priority: 'medium',
          is_active: true,
          expires_at: '2025-12-31T23:59:59+08:00',
          view_count: 5,
          created_at: '2025-12-02T10:00:00+08:00',
          toJSON: function () {
            return this
          }
        }
      ]

      SystemAnnouncement.findAll.mockResolvedValue(mockAnnouncements)
      BeijingTimeHelper.createBeijingTime.mockReturnValue(new Date('2025-12-07T10:00:00+08:00'))

      const result = await AnnouncementService.getAnnouncements({
        activeOnly: true,
        filterExpired: true,
        dataLevel: 'public',
        limit: 20,
        offset: 0
      })

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1) // DataSanitizer 在 public 级别将 announcement_id 转换为 id
      expect(result[0].title).toBe('测试公告1')

      // 验证查询条件
      expect(SystemAnnouncement.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_active: true
          }),
          order: [
            ['priority', 'DESC'],
            ['created_at', 'DESC']
          ],
          limit: 20,
          offset: 0
        })
      )
    })

    test('应该支持类型过滤', async () => {
      SystemAnnouncement.findAll.mockResolvedValue([])

      await AnnouncementService.getAnnouncements({
        type: 'system',
        activeOnly: true,
        dataLevel: 'public'
      })

      expect(SystemAnnouncement.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'system'
          })
        })
      )
    })

    test('应该支持优先级过滤', async () => {
      SystemAnnouncement.findAll.mockResolvedValue([])

      await AnnouncementService.getAnnouncements({
        priority: 'high',
        activeOnly: true,
        dataLevel: 'public'
      })

      expect(SystemAnnouncement.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: 'high'
          })
        })
      )
    })

    test('管理员应该能查看所有状态的公告', async () => {
      SystemAnnouncement.findAll.mockResolvedValue([])

      await AnnouncementService.getAnnouncements({
        activeOnly: false,
        filterExpired: false,
        dataLevel: 'full'
      })

      expect(SystemAnnouncement.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            is_active: expect.anything()
          })
        })
      )
    })

    test('应该限制查询数量（用户端最多50条）', async () => {
      SystemAnnouncement.findAll.mockResolvedValue([])

      await AnnouncementService.getAnnouncements({
        limit: 999,
        dataLevel: 'public'
      })

      expect(SystemAnnouncement.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50 // 用户端最大限制
        })
      )
    })

    test('应该限制查询数量（管理员最多100条）', async () => {
      SystemAnnouncement.findAll.mockResolvedValue([])

      await AnnouncementService.getAnnouncements({
        limit: 999,
        dataLevel: 'full'
      })

      expect(SystemAnnouncement.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100 // 管理员最大限制
        })
      )
    })
  })

  describe('getAnnouncementsCount', () => {
    test('应该返回符合条件的公告总数', async () => {
      SystemAnnouncement.count.mockResolvedValue(42)

      const count = await AnnouncementService.getAnnouncementsCount({
        type: 'system',
        activeOnly: true,
        filterExpired: true
      })

      expect(count).toBe(42)
      expect(SystemAnnouncement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_active: true,
            type: 'system'
          })
        })
      )
    })
  })

  describe('getAnnouncementById', () => {
    test('应该返回指定ID的公告详情', async () => {
      const mockAnnouncement = {
        announcement_id: 1,
        title: '测试公告',
        content: '内容',
        type: 'system',
        priority: 'high',
        toJSON: function () {
          return this
        }
      }

      SystemAnnouncement.findByPk.mockResolvedValue(mockAnnouncement)

      const result = await AnnouncementService.getAnnouncementById(1, 'public')

      expect(result).toBeDefined()
      expect(result.id).toBe(1) // DataSanitizer 在 public 级别将 announcement_id 转换为 id
      expect(SystemAnnouncement.findByPk).toHaveBeenCalledWith(1, expect.any(Object))
    })

    test('公告不存在时应该返回null', async () => {
      SystemAnnouncement.findByPk.mockResolvedValue(null)

      const result = await AnnouncementService.getAnnouncementById(999, 'public')

      expect(result).toBeNull()
    })
  })

  describe('incrementViewCount', () => {
    test('应该增加公告浏览次数', async () => {
      const mockAnnouncement = {
        announcement_id: 1,
        view_count: 10,
        increment: jest.fn().mockResolvedValue(true)
      }

      SystemAnnouncement.findByPk.mockResolvedValue(mockAnnouncement)

      const result = await AnnouncementService.incrementViewCount(1)

      expect(result).toBe(true)
      expect(mockAnnouncement.increment).toHaveBeenCalledWith('view_count')
    })

    test('公告不存在时应该返回false', async () => {
      SystemAnnouncement.findByPk.mockResolvedValue(null)

      const result = await AnnouncementService.incrementViewCount(999)

      expect(result).toBe(false)
    })
  })

  describe('convertToNotificationFormat', () => {
    test('应该转换为通知格式', () => {
      const announcements = [
        {
          announcement_id: 1,
          title: '测试公告',
          content: '内容',
          type: 'system',
          priority: 'high',
          view_count: 0,
          created_at: '2025-12-07T10:00:00+08:00',
          expires_at: null
        }
      ]

      const result = AnnouncementService.convertToNotificationFormat(announcements)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        notification_id: 1,
        id: 1,
        type: 'system',
        title: '测试公告',
        content: '内容',
        is_read: false, // view_count=0 表示未读
        priority: 'high'
      })
    })

    test('view_count>0应该标记为已读', () => {
      const announcements = [
        {
          announcement_id: 1,
          title: '测试公告',
          content: '内容',
          type: 'system',
          priority: 'high',
          view_count: 5,
          created_at: '2025-12-07T10:00:00+08:00',
          expires_at: null
        }
      ]

      const result = AnnouncementService.convertToNotificationFormat(announcements)

      expect(result[0].is_read).toBe(true)
    })
  })

  describe('getUnreadCount', () => {
    test('应该返回未读通知数量', async () => {
      SystemAnnouncement.count.mockResolvedValue(5)

      const count = await AnnouncementService.getUnreadCount()

      expect(count).toBe(5)
      expect(SystemAnnouncement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_active: true,
            view_count: 0
          })
        })
      )
    })

    test('应该支持按类型过滤未读数量', async () => {
      SystemAnnouncement.count.mockResolvedValue(3)

      await AnnouncementService.getUnreadCount({ type: 'system' })

      expect(SystemAnnouncement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'system'
          })
        })
      )
    })
  })

  describe('markAsReadBatch', () => {
    test('应该批量标记指定ID为已读', async () => {
      SystemAnnouncement.update.mockResolvedValue([3])

      const count = await AnnouncementService.markAsReadBatch([1, 2, 3])

      expect(count).toBe(3)
      expect(SystemAnnouncement.update).toHaveBeenCalledWith(
        { view_count: 1 },
        expect.objectContaining({
          where: expect.objectContaining({
            announcement_id: expect.any(Object)
          })
        })
      )
    })

    test('空数组应该全部标记已读', async () => {
      SystemAnnouncement.update.mockResolvedValue([10])

      const count = await AnnouncementService.markAsReadBatch([])

      expect(count).toBe(10)
      expect(SystemAnnouncement.update).toHaveBeenCalledWith(
        { view_count: 1 },
        expect.objectContaining({
          where: expect.objectContaining({
            is_active: true,
            view_count: 0
          })
        })
      )
    })
  })

  describe('createAnnouncement', () => {
    test('应该创建新公告', async () => {
      const mockCreatedAnnouncement = {
        announcement_id: 1,
        title: '新公告',
        content: '内容',
        type: 'notice',
        priority: 'medium',
        created_by: 100,
        is_active: true,
        view_count: 0,
        toJSON: function () {
          return this
        }
      }

      SystemAnnouncement.create.mockResolvedValue(mockCreatedAnnouncement)

      const result = await AnnouncementService.createAnnouncement(
        {
          title: '新公告',
          content: '内容',
          type: 'notice',
          priority: 'medium'
        },
        100
      )

      expect(result.announcement_id).toBe(1)
      expect(result.title).toBe('新公告')
      expect(SystemAnnouncement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '新公告',
          content: '内容',
          admin_id: 100,
          is_active: true
        })
      )
    })
  })

  describe('updateAnnouncement', () => {
    test('应该更新公告', async () => {
      const mockAnnouncement = {
        announcement_id: 1,
        title: '旧标题',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function () {
          return { ...this, title: '新标题' }
        }
      }

      SystemAnnouncement.findByPk.mockResolvedValue(mockAnnouncement)

      const result = await AnnouncementService.updateAnnouncement(1, {
        title: '新标题'
      })

      expect(result.title).toBe('新标题')
      expect(mockAnnouncement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '新标题'
        })
      )
    })

    test('公告不存在时应该返回null', async () => {
      SystemAnnouncement.findByPk.mockResolvedValue(null)

      const result = await AnnouncementService.updateAnnouncement(999, {
        title: '新标题'
      })

      expect(result).toBeNull()
    })
  })

  describe('deleteAnnouncement', () => {
    test('应该删除公告', async () => {
      const mockAnnouncement = {
        announcement_id: 1,
        destroy: jest.fn().mockResolvedValue(true)
      }

      SystemAnnouncement.findByPk.mockResolvedValue(mockAnnouncement)

      const result = await AnnouncementService.deleteAnnouncement(1)

      expect(result).toBe(true)
      expect(mockAnnouncement.destroy).toHaveBeenCalled()
    })

    test('公告不存在时应该返回false', async () => {
      SystemAnnouncement.findByPk.mockResolvedValue(null)

      const result = await AnnouncementService.deleteAnnouncement(999)

      expect(result).toBe(false)
    })
  })

  describe('getStatistics', () => {
    test('应该返回公告统计信息', async () => {
      SystemAnnouncement.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80) // active
        .mockResolvedValueOnce(10) // expired
        .mockResolvedValueOnce(5) // unread

      BeijingTimeHelper.createBeijingTime.mockReturnValue(new Date('2025-12-07T10:00:00+08:00'))

      const result = await AnnouncementService.getStatistics()

      expect(result).toEqual({
        total: 100,
        active: 80,
        expired: 10,
        unread: 5
      })
    })
  })
})
