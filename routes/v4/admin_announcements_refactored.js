/**
 * 管理员公告管理接口（重构版）
 * 路径前缀: /api/v4/admin/announcements
 * 
 * 优化点:
 * - 统一使用 AnnouncementService
 * - CRUD操作统一封装
 * - 代码量减少约40%
 */

const express = require('express')
const router = express.Router()
const AnnouncementService = require('../../services/AnnouncementService')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')

// 所有接口需要管理员权限
router.use(authenticateToken, requireAdmin)

/**
 * 创建公告
 * POST /api/v4/admin/announcements
 */
router.post('/', async (req, res) => {
  try {
    const { title, content, type, priority, expires_at } = req.body

    // 参数验证
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: '标题和内容不能为空'
      })
    }

    // 🎯 使用统一的创建方法
    const announcement = await AnnouncementService.createAnnouncement(
      { title, content, type, priority, expires_at },
      req.user.user_id
    )

    res.json({
      success: true,
      message: '公告创建成功',
      data: announcement
    })
  } catch (error) {
    console.error('创建公告失败:', error)
    res.status(500).json({
      success: false,
      message: '创建公告失败',
      error: error.message
    })
  }
})

/**
 * 获取公告列表（后台管理）
 * GET /api/v4/admin/announcements
 * Query: type, priority, is_active, limit, offset
 */
router.get('/', async (req, res) => {
  try {
    const {
      type,
      priority,
      is_active,
      limit = 20,
      offset = 0
    } = req.query

    // 🎯 统一调用Service层
    const announcements = await AnnouncementService.getAnnouncements({
      type,
      priority,
      activeOnly: is_active === 'true',  // 管理员可查看所有状态
      filterExpired: false,              // 管理员可查看过期公告
      limit,
      offset,
      dataLevel: 'full',                 // 管理员完整数据
      includeCreator: true
    })

    const total = await AnnouncementService.getAnnouncementsCount({
      type,
      priority,
      activeOnly: is_active === 'true',
      filterExpired: false
    })

    // 获取统计信息
    const statistics = await AnnouncementService.getStatistics()

    res.json({
      success: true,
      data: {
        announcements,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + announcements.length < total
        },
        statistics
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
 * 获取公告详情
 * GET /api/v4/admin/announcements/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const announcement = await AnnouncementService.getAnnouncementById(
      id,
      'full'  // 管理员完整数据
    )

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: '公告不存在'
      })
    }

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

/**
 * 更新公告
 * PUT /api/v4/admin/announcements/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updateData = req.body

    // 🎯 使用统一的更新方法
    const announcement = await AnnouncementService.updateAnnouncement(id, updateData)

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: '公告不存在'
      })
    }

    res.json({
      success: true,
      message: '公告更新成功',
      data: announcement
    })
  } catch (error) {
    console.error('更新公告失败:', error)
    res.status(500).json({
      success: false,
      message: '更新公告失败',
      error: error.message
    })
  }
})

/**
 * 删除公告
 * DELETE /api/v4/admin/announcements/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // 🎯 使用统一的删除方法
    const success = await AnnouncementService.deleteAnnouncement(id)

    if (!success) {
      return res.status(404).json({
        success: false,
        message: '公告不存在'
      })
    }

    res.json({
      success: true,
      message: '公告删除成功'
    })
  } catch (error) {
    console.error('删除公告失败:', error)
    res.status(500).json({
      success: false,
      message: '删除公告失败',
      error: error.message
    })
  }
})

/**
 * 获取公告统计信息
 * GET /api/v4/admin/announcements/statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    // 🎯 使用统一的统计方法
    const statistics = await AnnouncementService.getStatistics()

    res.json({
      success: true,
      data: statistics
    })
  } catch (error) {
    console.error('获取统计信息失败:', error)
    res.status(500).json({
      success: false,
      message: '获取统计信息失败',
      error: error.message
    })
  }
})

module.exports = router

