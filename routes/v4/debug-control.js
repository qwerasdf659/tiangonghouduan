/**
 * 🌙 生产环境调试控制接口
 *
 * 功能：
 * 1. 动态调整日志级别（不需要重启）
 * 2. 为特定用户开启详细日志
 * 3. 查看当前调试配置
 * 4. 安全认证保护
 *
 * 大公司实践：
 * - 通过管理后台动态控制
 * - 支持针对性调试
 * - 自动过期机制
 * - 审计日志记录
 *
 * 安全措施：
 * - 仅管理员可访问
 * - 所有操作记录审计日志
 * - 自动过期防止忘记关闭
 *
 * 创建时间：2025年11月02日 北京时间
 */

const express = require('express')
const router = express.Router()
const { logger } = require('../../utils/logger')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')

// 🔐 所有接口都需要管理员权限
router.use(authenticateToken)
router.use(requireAdmin) // ✅ 修复：使用requireAdmin替代不存在的requireRole

/**
 * 📊 获取当前调试配置
 * GET /api/v4/debug-control/config
 */
router.get('/config', async (req, res) => {
  try {
    const config = logger.getConfig()

    logger.info('查询调试配置', {
      adminId: req.user.id,
      adminName: req.user.username,
      action: 'VIEW_DEBUG_CONFIG'
    })

    res.json({
      success: true,
      message: '获取调试配置成功',
      data: {
        environment: process.env.NODE_ENV,
        currentLogLevel: config.currentLevel,
        availableLogLevels: config.availableLevels,
        debugUsers: config.debugUsers,
        debugSessions: config.debugSessions,
        debugUsersCount: config.debugUsers.length,
        debugSessionsCount: config.debugSessions.length,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('获取调试配置失败', {
      adminId: req.user?.id,
      error: error.message
    })

    res.status(500).json({
      success: false,
      message: '获取调试配置失败',
      error: error.message
    })
  }
})

/**
 * 🎚️ 动态调整全局日志级别
 * POST /api/v4/debug-control/log-level
 *
 * Body:
 * {
 *   "level": "debug",  // error | warn | info | debug | trace
 *   "duration": 30     // 持续时间（分钟），可选
 * }
 */
router.post('/log-level', async (req, res) => {
  try {
    const { level, duration } = req.body

    if (!level) {
      return res.status(400).json({
        success: false,
        message: '日志级别不能为空',
        error_code: 'LOG_LEVEL_REQUIRED'
      })
    }

    // 设置日志级别
    const success = logger.setLogLevel(level)

    if (!success) {
      return res.status(400).json({
        success: false,
        message: '无效的日志级别',
        error_code: 'INVALID_LOG_LEVEL',
        availableLevels: ['error', 'warn', 'info', 'debug', 'trace']
      })
    }

    // 审计日志
    logger.warn('管理员调整日志级别', {
      adminId: req.user.id,
      adminName: req.user.username,
      oldLevel: logger.getConfig().currentLevel,
      newLevel: level,
      duration: duration ? `${duration}分钟` : '永久',
      action: 'CHANGE_LOG_LEVEL'
    })

    // 如果指定了持续时间，自动恢复
    if (duration && duration > 0) {
      setTimeout(() => {
        logger.setLogLevel('info') // 恢复默认级别
        logger.warn('日志级别已自动恢复', {
          reason: '临时调试时间到期',
          restoredLevel: 'info'
        })
      }, duration * 60 * 1000)
    }

    res.json({
      success: true,
      message: `日志级别已调整为 ${level}`,
      data: {
        level,
        duration: duration ? `${duration}分钟后自动恢复` : '永久生效',
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('调整日志级别失败', {
      adminId: req.user?.id,
      error: error.message
    })

    res.status(500).json({
      success: false,
      message: '调整日志级别失败',
      error: error.message
    })
  }
})

/**
 * 🎯 为特定用户开启调试模式
 * POST /api/v4/debug-control/user-debug
 *
 * Body:
 * {
 *   "userId": "uuid",
 *   "duration": 30  // 持续时间（分钟），默认30分钟
 * }
 */
router.post('/user-debug', async (req, res) => {
  try {
    const { userId, duration = 30 } = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空',
        error_code: 'USER_ID_REQUIRED'
      })
    }

    // 启用用户调试模式
    logger.enableDebugForUser(userId, duration)

    // 审计日志
    logger.warn('管理员为用户开启调试模式', {
      adminId: req.user.id,
      adminName: req.user.username,
      targetUserId: userId,
      duration: `${duration}分钟`,
      action: 'ENABLE_USER_DEBUG'
    })

    res.json({
      success: true,
      message: `已为用户 ${userId} 开启调试模式`,
      data: {
        userId,
        duration: `${duration}分钟`,
        autoDisableAt: new Date(Date.now() + duration * 60 * 1000).toISOString(),
        note: '该用户的所有请求将记录详细日志',
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('开启用户调试模式失败', {
      adminId: req.user?.id,
      error: error.message
    })

    res.status(500).json({
      success: false,
      message: '开启用户调试模式失败',
      error: error.message
    })
  }
})

/**
 * 🎯 为特定会话开启调试模式
 * POST /api/v4/debug-control/session-debug
 *
 * Body:
 * {
 *   "sessionId": "session_xxx",
 *   "duration": 30  // 持续时间（分钟），默认30分钟
 * }
 */
router.post('/session-debug', async (req, res) => {
  try {
    const { sessionId, duration = 30 } = req.body

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: '会话ID不能为空',
        error_code: 'SESSION_ID_REQUIRED'
      })
    }

    // 启用会话调试模式
    logger.enableDebugForSession(sessionId, duration)

    // 审计日志
    logger.warn('管理员为会话开启调试模式', {
      adminId: req.user.id,
      adminName: req.user.username,
      targetSessionId: sessionId,
      duration: `${duration}分钟`,
      action: 'ENABLE_SESSION_DEBUG'
    })

    res.json({
      success: true,
      message: `已为会话 ${sessionId} 开启调试模式`,
      data: {
        sessionId,
        duration: `${duration}分钟`,
        autoDisableAt: new Date(Date.now() + duration * 60 * 1000).toISOString(),
        note: '该会话的所有请求将记录详细日志',
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('开启会话调试模式失败', {
      adminId: req.user?.id,
      error: error.message
    })

    res.status(500).json({
      success: false,
      message: '开启会话调试模式失败',
      error: error.message
    })
  }
})

/**
 * 🧹 清除所有调试会话
 * POST /api/v4/debug-control/clear-debug
 */
router.post('/clear-debug', async (req, res) => {
  try {
    const beforeConfig = logger.getConfig()

    logger.clearAllDebugSessions()

    // 审计日志
    logger.warn('管理员清除所有调试会话', {
      adminId: req.user.id,
      adminName: req.user.username,
      clearedUsers: beforeConfig.debugUsers.length,
      clearedSessions: beforeConfig.debugSessions.length,
      action: 'CLEAR_ALL_DEBUG'
    })

    res.json({
      success: true,
      message: '已清除所有调试会话',
      data: {
        clearedUsersCount: beforeConfig.debugUsers.length,
        clearedSessionsCount: beforeConfig.debugSessions.length,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('清除调试会话失败', {
      adminId: req.user?.id,
      error: error.message
    })

    res.status(500).json({
      success: false,
      message: '清除调试会话失败',
      error: error.message
    })
  }
})

/**
 * 📋 查看最近的日志文件列表
 * GET /api/v4/debug-control/log-files
 */
router.get('/log-files', async (req, res) => {
  try {
    const fs = require('fs')
    const path = require('path')
    const logDir = path.join(__dirname, '../../logs')

    if (!fs.existsSync(logDir)) {
      return res.json({
        success: true,
        message: '日志目录不存在',
        data: { files: [] }
      })
    }

    const files = fs.readdirSync(logDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(logDir, file)
        const stats = fs.statSync(filePath)

        return {
          name: file,
          size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          sizeBytes: stats.size,
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString()
        }
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))

    logger.info('查询日志文件列表', {
      adminId: req.user.id,
      adminName: req.user.username,
      filesCount: files.length,
      action: 'VIEW_LOG_FILES'
    })

    res.json({
      success: true,
      message: '获取日志文件列表成功',
      data: {
        files,
        totalFiles: files.length,
        logDirectory: logDir
      }
    })
  } catch (error) {
    logger.error('获取日志文件列表失败', {
      adminId: req.user?.id,
      error: error.message
    })

    res.status(500).json({
      success: false,
      message: '获取日志文件列表失败',
      error: error.message
    })
  }
})

module.exports = router
