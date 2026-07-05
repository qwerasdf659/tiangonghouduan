/**
 * maintenanceMode 中间件测试套件 —— 分端维护模式（水晶奖品倍率活动设计方案 §21）
 *
 * 测试目标（验证真实中间件分支逻辑，非业务数据造假）：
 * - 白名单路径（/health、/admin、/api/v4/console、/api/v4/system/app-version）恒放行
 * - 全站维护 maintenance_mode=true：所有端 503 + code=SYSTEM_MAINTENANCE（data.platform 无值）
 * - 仅小程序维护 maintenance_mode_wechat_mp=true：wechat_mp 端 503 且 data.platform='wechat_mp'，web 端放行
 * - fail-open：设置读取抛错时放行（避免检查故障导致全站不可用）
 *
 * 说明：本测试仅隔离「设置读取依赖」AdminSystemService.getSettingValue（用 jest 桩替换其返回），
 * 平台识别 detectLoginPlatform 用真实实现（真实 Referer/X-Platform 判定），
 * 验证的是中间件真实路由分支，不构造任何业务数据。
 *
 * @date 2026-07-06
 */

'use strict'

// 隔离设置读取依赖：用可编程桩替换 AdminSystemService，验证中间件对不同设置值的真实分支
jest.mock('../../services/AdminSystemService', () => ({
  getSettingValue: jest.fn()
}))

const AdminSystemService = require('../../services/AdminSystemService')
const { createMaintenanceMiddleware } = require('../../middleware/maintenanceMode')

/**
 * 构造一个最小 Express res 桩，捕获 apiError 的入参
 * @returns {Object} res 桩（含 captured 字段）
 */
function makeRes() {
  const res = {
    captured: null,
    statusCode: null,
    apiError(message, code, data, httpStatus) {
      res.captured = { message, code, data, httpStatus }
      return res
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.captured = payload
      return res
    }
  }
  return res
}

/**
 * 按设置键值表配置 AdminSystemService.getSettingValue 桩
 * @param {Object<string,*>} settings - { 'basic/maintenance_mode': true, ... }
 */
function stubSettings(settings) {
  AdminSystemService.getSettingValue.mockImplementation(async (category, key, defaultValue) => {
    const composite = `${category}/${key}`
    return Object.prototype.hasOwnProperty.call(settings, composite)
      ? settings[composite]
      : defaultValue
  })
}

describe('maintenanceMode 中间件 —— 分端维护模式（§21）', () => {
  let middleware

  beforeEach(() => {
    middleware = createMaintenanceMiddleware()
    AdminSystemService.getSettingValue.mockReset()
  })

  describe('白名单路径恒放行', () => {
    it.each([
      '/health',
      '/admin/index.html',
      '/api/v4/console/multiplier-rules',
      '/api/v4/auth/login',
      '/api/v4/system/app-version'
    ])('%s 即使全站维护也放行（不查设置）', async path => {
      stubSettings({ 'basic/maintenance_mode': true })
      const req = { path, method: 'GET', headers: {}, ip: '127.0.0.1' }
      const res = makeRes()
      let nextCalled = false
      await middleware(req, res, () => {
        nextCalled = true
      })
      expect(nextCalled).toBe(true)
      expect(res.captured).toBeNull()
    })
  })

  describe('全站维护', () => {
    it('maintenance_mode=true → 任意端 503 + SYSTEM_MAINTENANCE，data.platform 无值', async () => {
      stubSettings({
        'basic/maintenance_mode': true,
        'basic/maintenance_message': '全站维护中',
        'basic/maintenance_end_time': ''
      })
      const req = { path: '/api/v4/lottery/campaigns', method: 'GET', headers: {}, ip: '1.1.1.1' }
      const res = makeRes()
      await middleware(req, res, () => {
        throw new Error('维护中不应放行')
      })
      expect(res.captured.code).toBe('SYSTEM_MAINTENANCE')
      expect(res.captured.httpStatus).toBe(503)
      expect(res.captured.data.maintenance).toBe(true)
      // 全站维护 data 无 platform 字段（前端据此区分"全站"vs"仅小程序"）
      expect(res.captured.data.platform).toBeUndefined()
    })
  })

  describe('仅微信小程序维护', () => {
    it('wechat_mp 端（Referer servicewechat.com）→ 503 且 data.platform=wechat_mp', async () => {
      stubSettings({
        'basic/maintenance_mode': false,
        'basic/maintenance_mode_wechat_mp': true,
        'basic/maintenance_message_wechat_mp': '小程序维护中',
        'basic/maintenance_end_time_wechat_mp': '2026-07-06 12:00'
      })
      const req = {
        path: '/api/v4/lottery/campaigns',
        method: 'GET',
        headers: { referer: 'https://servicewechat.com/wx1234567890/1/page-frame.html' },
        ip: '2.2.2.2'
      }
      const res = makeRes()
      await middleware(req, res, () => {
        throw new Error('小程序维护中不应放行小程序请求')
      })
      expect(res.captured.code).toBe('SYSTEM_MAINTENANCE')
      expect(res.captured.httpStatus).toBe(503)
      expect(res.captured.data.platform).toBe('wechat_mp')
      expect(res.captured.data.end_time).toBe('2026-07-06 12:00')
    })

    it('web 端（无小程序特征）→ 仅小程序维护时正常放行', async () => {
      stubSettings({
        'basic/maintenance_mode': false,
        'basic/maintenance_mode_wechat_mp': true
      })
      const req = {
        path: '/api/v4/lottery/campaigns',
        method: 'GET',
        headers: { 'user-agent': 'Mozilla/5.0' },
        ip: '3.3.3.3'
      }
      const res = makeRes()
      let nextCalled = false
      await middleware(req, res, () => {
        nextCalled = true
      })
      expect(nextCalled).toBe(true)
      expect(res.captured).toBeNull()
    })
  })

  describe('fail-open（设置读取异常时放行）', () => {
    it('getSettingValue 抛错 → 放行请求，不 503', async () => {
      AdminSystemService.getSettingValue.mockRejectedValue(new Error('DB down'))
      const req = { path: '/api/v4/lottery/campaigns', method: 'GET', headers: {}, ip: '4.4.4.4' }
      const res = makeRes()
      let nextCalled = false
      await middleware(req, res, () => {
        nextCalled = true
      })
      expect(nextCalled).toBe(true)
      expect(res.captured).toBeNull()
    })
  })
})
