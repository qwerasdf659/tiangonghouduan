/**
 * 用户端公告接口（重构版）
 * 路径前缀: /api/v4/system/announcements
 *
 * 优化点:
 * - 统一使用 AnnouncementService
 * - 消除查询逻辑重复
 * - 代码量减少约60%
 */

const express = require('express')
const router = express.Router()
const AnnouncementService = require('../../services/AnnouncementService')

/**
 * 获取公告列表（用户端）
 * GET /api/v4/system/announcements
 * Query: type, priority, limit, offset
 */
router.get('/', async (req, res) => {
  try {
    const { type, priority, limit = 20, offset = 0 } = req.query

    // 🎯 统一调用Service层（消除重复逻辑）
    const announcements = await AnnouncementService.getAnnouncements({
      type,
      priority,
      activeOnly: true, // 用户端仅显示活跃公告
      filterExpired: true, // 用户端过滤过期公告
      limit,
      offset,
      dataLevel: 'public', // 用户端数据脱敏
      includeCreator: true
    })

    const total = await AnnouncementService.getAnnouncementsCount({
      type,
      priority,
      activeOnly: true,
      filterExpired: true
    })

    res.json({
      success: true,
      data: {
        announcements,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + announcements.length < total
        }
      }
    })
  } catch (error) {
    console.error('获取公告列表失败:', error)
    res.status(500).json({
      success: false,
      message: '获取公告列表失败',
      error: error.message
    })
  }
})

/**
 * 获取首页公告（前5条重要公告）
 * GET /api/v4/system/announcements/home
 */
router.get('/home', async (req, res) => {
  try {
    // 🎯 使用专门的首页公告方法（自动增加浏览次数）
    const announcements = await AnnouncementService.getHomeAnnouncements(5)

    res.json({
      success: true,
      data: announcements
    })
  } catch (error) {
    console.error('获取首页公告失败:', error)
    res.status(500).json({
      success: false,
      message: '获取首页公告失败',
      error: error.message
    })
  }
})

/**
 * 获取公告详情
 * GET /api/v4/system/announcements/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const announcement = await AnnouncementService.getAnnouncementById(
      id,
      'public' // 用户端数据脱敏
    )

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: '公告不存在'
      })
    }

    // 增加浏览次数
    await AnnouncementService.incrementViewCount(id)

    res.json({
      success: true,
      data: announcement
    })
  } catch (error) {
    console.error('获取公告详情失败:', error)
    res.status(500).json({
      success: false,
      message: '获取公告详情失败',
      error: error.message
    })
  }
})

module.exports = router
