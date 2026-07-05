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
 * - /health                      — 健康检查
 * - /admin/*                     — 管理后台静态资源
 * - /api/v4/auth/*               — 认证接口（管理员需要登录）
 * - /api/v4/console/*            — 管理后台 API
 * - /api/v4/debug-control/*      — 调试控制
 * - /api/v4/system/app-version   — 小程序版本闸门（维护期需可读，引导旧版用户更新）
 *
 * @module middleware/maintenanceMode
 */

'use strict'

const logger = require('../utils/logger').logger
const { detectLoginPlatform } = require('../utils/platformDetector')

/**
 * 分端维护模式配置键映射（§21 分端隔离，Q3 唯一扩展点）
 *
 * 未来加端（app/douyin_mp/alipay_mp）只需在此登记映射 + 白名单加对应 3 个配置键，
 * 中间件主体零改动。当前只做微信小程序 wechat_mp（Q3 拍板）。
 *
 * @constant {Object<string, {mode: string, message: string, end_time: string}>}
 */
const PLATFORM_MAINTENANCE_KEYS = {
  wechat_mp: {
    mode: 'maintenance_mode_wechat_mp',
    message: 'maintenance_message_wechat_mp',
    end_time: 'maintenance_end_time_wechat_mp'
  }
}

/**
 * 维护模式下放行的路径前缀白名单
 * @constant {string[]}
 */
const BYPASS_PREFIXES = [
  '/health',
  '/admin',
  '/api/v4/auth',
  '/api/v4/console',
  '/api/v4/debug-control',
  '/api/v4/system/app-version'
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

      /*
       * 分端维护判断（§21：全站未维护时，对特定端叠加独立开关）
       * - 平台识别：X-Platform 头（小程序统一携带，Q1 双保险）→ Referer servicewechat.com → UA
       * - 前端区分口径（Q2）：复用 SYSTEM_MAINTENANCE 码，靠 data.platform='wechat_mp' 区分"仅小程序维护"
       */
      const platform = detectLoginPlatform(req)
      const platformKeys = PLATFORM_MAINTENANCE_KEYS[platform]
      if (platformKeys) {
        const platformMaintenanceOn = await AdminSystemService.getSettingValue(
          'basic',
          platformKeys.mode,
          false
        )
        if (platformMaintenanceOn === true || platformMaintenanceOn === 'true') {
          const [platformMessage, platformEndTime] = await Promise.all([
            AdminSystemService.getSettingValue(
              'basic',
              platformKeys.message,
              '小程序正在维护中，请稍后再试。'
            ),
            AdminSystemService.getSettingValue('basic', platformKeys.end_time, '')
          ])

          logger.info('[维护模式] 分端拦截用户请求', {
            platform,
            path: req.path,
            method: req.method,
            ip: req.ip
          })

          const platformResponseData = {
            maintenance: true,
            platform,
            message: platformMessage,
            end_time: platformEndTime || null
          }

          if (typeof res.apiError === 'function') {
            return res.apiError(platformMessage, 'SYSTEM_MAINTENANCE', platformResponseData, 503)
          }
          return res.status(503).json({
            success: false,
            code: 'SYSTEM_MAINTENANCE',
            message: platformMessage,
            data: platformResponseData,
            timestamp: new Date().toISOString()
          })
        }
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
