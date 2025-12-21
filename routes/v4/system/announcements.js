/**
 * 餐厅积分抽奖系统 V4.0 - 系统公告API路由
 *
 * 功能：
 * - 获取系统公告列表
 * - 获取首页公告
 *
 * 路由前缀：/api/v4/system
 *
 * 创建时间：2025年12月22日
 * 拆分自：system.js（符合Controller拆分规范 150-250行）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { optionalAuth } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const dataAccessControl = require('../../../middleware/dataAccessControl')

/**
 * @route GET /api/v4/system/announcements
 * @desc 获取系统公告列表
 * @access Public
 *
 * @query {string} type - 公告类型（system/activity/notice）
 * @query {string} priority - 公告优先级
 * @query {number} limit - 每页数量（默认10）
 * @query {number} offset - 偏移量（默认0）
 *
 * @returns {Object} 公告列表和分页信息
 */
router.get('/announcements', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')

    const { type = null, priority = null, limit = 10, offset = 0 } = req.query
    const dataLevel = req.isAdmin ? 'full' : 'public'

    // ✅ 使用 AnnouncementService 统一查询逻辑
    const announcements = await AnnouncementService.getAnnouncements({
      type,
      priority,
      limit,
      offset,
      activeOnly: true,
      filterExpired: true,
      dataLevel,
      includeCreator: true
    })

    const total = await AnnouncementService.getAnnouncementsCount({
      type,
      priority,
      activeOnly: true,
      filterExpired: true
    })

    return res.apiSuccess(
      {
        announcements,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: announcements.length === parseInt(limit)
      },
      '获取系统公告成功'
    )
  } catch (error) {
    logger.error('获取系统公告失败:', error)
    return handleServiceError(error, res, '获取系统公告失败')
  }
})

/**
 * @route GET /api/v4/system/announcements/home
 * @desc 获取首页公告（仅显示前5条重要公告）
 * @access Public
 *
 * @returns {Object} 首页公告列表（最多5条）
 */
router.get('/announcements/home', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 AnnouncementService（符合TR-005规范）
    const AnnouncementService = req.app.locals.services.getService('announcement')

    const dataLevel = req.isAdmin ? 'full' : 'public'

    // ✅ 使用 AnnouncementService 统一查询逻辑（不直接操作models）
    const announcements = await AnnouncementService.getAnnouncements({
      type: null, // 不限制类型（获取所有类型：system/activity/notice等）
      priority: null, // 不限制优先级（按优先级DESC排序）
      limit: 5, // 只显示前5条
      offset: 0,
      activeOnly: true, // 仅查询活跃公告
      filterExpired: true, // 过滤过期公告
      dataLevel, // 根据用户权限返回不同级别的数据
      includeCreator: true // 关联创建者信息
    })

    /*
     * 📈 更新公告查看次数
     * 业务场景：统计公告浏览量，用于运营数据分析（评估公告触达效果）
     * 优化方案：并行更新（Promise.allSettled）提升性能，单个失败不影响整体
     */
    await Promise.allSettled(
      announcements.map(announcement =>
        AnnouncementService.incrementViewCount(announcement.announcement_id)
      )
    )

    // 🎉 返回首页公告数据（数据脱敏已在Service层完成）
    return res.apiSuccess(
      {
        announcements
      },
      '获取首页公告成功'
    )
  } catch (error) {
    logger.error('获取首页公告失败:', error)
    return handleServiceError(error, res, '获取首页公告失败')
  }
})

module.exports = router
