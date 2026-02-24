/**
 * 维护模式拦截中间件
 *
 * @description 当 system_settings 表中 maintenance_mode = true 时，
 *              拦截用户端 API 请求并返回 503 维护响应。
 *              管理后台、健康检查、认证接口不受影响。
 *
 * 业务逻辑：
 * - 读取路径：Redis 缓存 → 数据库（AdminSystemService.getSettingValue）
 * - 缓存失效：管理员在 web 管理后台修改 maintenance_mode 时，
 *   AdminSystemService.updateSettings 会调用 BusinessCacheHelper.invalidateSysConfig
 *   自动失效缓存，下一次请求会从数据库重新读取
 *
 * 白名单路径（维护模式下仍然放行）：
 * - /health                — 健康检查
 * - /admin/*               — 管理后台静态资源
 * - /api/v4/auth/*         — 认证接口（管理员需要登录）
 * - /api/v4/console/*      — 管理后台 API
 * - /api/v4/debug-control/* — 调试控制
 *
 * @module middleware/maintenanceMode
 */

'use strict'

const logger = require('../utils/logger').logger

/**
 * 维护模式下放行的路径前缀白名单
 * @constant {string[]}
 */
const BYPASS_PREFIXES = [
  '/health',
  '/admin',
  '/api/v4/auth',
  '/api/v4/console',
  '/api/v4/debug-control'
]

/**
 * 判断请求路径是否在白名单中
 * @param {string} path - 请求路径
 * @returns {boolean} 是否应该放行
 */
function shouldBypass(path) {
  return BYPASS_PREFIXES.some(prefix => path.startsWith(prefix))
}

/**
 * 创建维护模式中间件
 *
 * @returns {Function} Express 中间件函数
 */
function createMaintenanceMiddleware() {
  return async function maintenanceMode(req, res, next) {
    // 白名单路径直接放行
    if (shouldBypass(req.path)) {
      return next()
    }

    // 非 API 请求（如静态资源、favicon 等）直接放行
    if (!req.path.startsWith('/api/')) {
      return next()
    }

    try {
      const AdminSystemService = require('../services/AdminSystemService')

      const isMaintenanceMode = await AdminSystemService.getSettingValue(
        'basic',
        'maintenance_mode',
        false
      )

      if (isMaintenanceMode === true || isMaintenanceMode === 'true') {
        const [maintenanceMessage, maintenanceEndTime] = await Promise.all([
          AdminSystemService.getSettingValue(
            'basic',
            'maintenance_message',
            '系统正在维护中，请稍后再试。'
          ),
          AdminSystemService.getSettingValue('basic', 'maintenance_end_time', '')
        ])

        logger.info('[维护模式] 拦截用户请求', {
          path: req.path,
          method: req.method,
          ip: req.ip
        })

        const responseData = {
          maintenance: true,
          message: maintenanceMessage,
          end_time: maintenanceEndTime || null
        }

        // 优先使用 ApiResponse 中间件注入的 res.apiError
        if (typeof res.apiError === 'function') {
          return res.apiError(maintenanceMessage, 'SYSTEM_MAINTENANCE', responseData, 503)
        }

        // 兜底：直接返回 JSON
        return res.status(503).json({
          success: false,
          code: 'SYSTEM_MAINTENANCE',
          message: maintenanceMessage,
          data: responseData,
          timestamp: new Date().toISOString()
        })
      }

      next()
    } catch (error) {
      // 维护模式检查失败时放行请求，避免系统不可用
      logger.warn('[维护模式] 状态检查失败，放行请求', {
        error: error.message,
        path: req.path
      })
      next()
    }
  }
}

module.exports = { createMaintenanceMiddleware }
