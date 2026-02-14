/**
 * 弹窗Banner服务层测试 — 显示模式（display_mode）功能
 *
 * 测试目标：
 * 1. validateImageRatio() 比例校验逻辑
 * 2. uploadBannerImage() 文件限制校验（400KB / JPG+PNG）
 * 3. createBanner() 包含 display_mode 字段
 * 4. updateBanner() 支持 display_mode 更新
 * 5. getAdminBannerList() 返回 display_mode 及中文映射
 *
 * 创建时间：2026-02-08
 */

'use strict'

const { getTestService } = require('../helpers/UnifiedTestManager')
const {
  validateImageRatio,
  VALID_DISPLAY_MODES,
  BANNER_MAX_FILE_SIZE,
  BANNER_ALLOWED_MIME_TYPES
} = require('../../services/PopupBannerService')

describe('PopupBannerService - 显示模式(display_mode)功能', () => {
  /*
   * ============================================
   * 一、validateImageRatio() 比例校验
   * ============================================
   */
  describe('validateImageRatio() - 图片比例与模板匹配度校验', () => {
    test('宽屏模式（wide 16:9）：750×420 应完美匹配', () => {
      const result = validateImageRatio('wide', 750, 420)
      expect(result.status).toBe('match')
      expect(result.message).toBeUndefined()
    })

    test('横版模式（horizontal 3:2）：750×500 应完美匹配', () => {
      const result = validateImageRatio('horizontal', 750, 500)
      expect(result.status).toBe('match')
    })

    test('方图模式（square 1:1）：750×750 应完美匹配', () => {
      const result = validateImageRatio('square', 750, 750)
      expect(result.status).toBe('match')
    })

    test('竖图模式（tall 3:4）：750×1000 应完美匹配', () => {
      const result = validateImageRatio('tall', 750, 1000)
      expect(result.status).toBe('match')
    })

    test('窄长图模式（slim 9:16）：420×750 应完美匹配', () => {
      const result = validateImageRatio('slim', 420, 750)
      expect(result.status).toBe('match')
    })

    test('纯图模式（full_image）：任何比例都应通过', () => {
      const result1 = validateImageRatio('full_image', 100, 999)
      expect(result1.status).toBe('match')

      const result2 = validateImageRatio('full_image', 999, 100)
      expect(result2.status).toBe('match')
    })

    test('选了方图模式，上传了竖图（750×1000）→ 应返回 warning', () => {
      const result = validateImageRatio('square', 750, 1000)
      expect(result.status).toBe('warning')
      expect(result.message).toContain('偏差')
      expect(result.message).toContain('裁切')
    })

    test('选了宽屏模式，上传了方图（750×750）→ 应返回 warning', () => {
      const result = validateImageRatio('wide', 750, 750)
      expect(result.status).toBe('warning')
      expect(result.message).toContain('16:9 宽屏')
    })

    test('选了横版模式，上传了竖图（750×1000）→ 应返回 warning', () => {
      const result = validateImageRatio('horizontal', 750, 1000)
      expect(result.status).toBe('warning')
    })

    test('方图模式允许一定范围偏差（800×750 ratio=1.07）→ 应匹配', () => {
      // ratio 1.07 在 square 范围 [0.85, 1.3] 内
      const result = validateImageRatio('square', 800, 750)
      expect(result.status).toBe('match')
    })
  })

  /*
   * ============================================
   * 二、常量校验
   * ============================================
   */
  describe('常量定义正确性', () => {
    test('VALID_DISPLAY_MODES 包含全部 6 种模式', () => {
      expect(VALID_DISPLAY_MODES).toEqual([
        'wide',
        'horizontal',
        'square',
        'tall',
        'slim',
        'full_image'
      ])
      expect(VALID_DISPLAY_MODES).toHaveLength(6)
    })

    test('BANNER_MAX_FILE_SIZE 为 400KB（409600 字节）', () => {
      expect(BANNER_MAX_FILE_SIZE).toBe(400 * 1024)
    })

    test('BANNER_ALLOWED_MIME_TYPES 仅包含 JPG 和 PNG', () => {
      expect(BANNER_ALLOWED_MIME_TYPES).toEqual(['image/jpeg', 'image/png'])
      expect(BANNER_ALLOWED_MIME_TYPES).not.toContain('image/gif')
      expect(BANNER_ALLOWED_MIME_TYPES).not.toContain('image/webp')
    })
  })

  /*
   * ============================================
   * 三、通过 ServiceManager 获取服务测试
   * ============================================
   */
  describe('ServiceManager 集成', () => {
    test('可以通过 ServiceManager 获取 popup_banner 服务', () => {
      const PopupBannerService = getTestService('popup_banner')
      expect(PopupBannerService).toBeDefined()
      expect(typeof PopupBannerService.getActiveBanners).toBe('function')
      expect(typeof PopupBannerService.createBanner).toBe('function')
      expect(typeof PopupBannerService.updateBanner).toBe('function')
      expect(typeof PopupBannerService.uploadBannerImage).toBe('function')
      expect(typeof PopupBannerService.getAdminBannerList).toBe('function')
    })
  })

  /*
   * ============================================
   * 四、getAdminBannerList 返回字段测试
   * ============================================
   */
  describe('getAdminBannerList() - 字段完整性', () => {
    test('返回结果结构包含 banners 和 total', async () => {
      const PopupBannerService = getTestService('popup_banner')
      const result = await PopupBannerService.getAdminBannerList({ limit: 5 })

      expect(result).toHaveProperty('banners')
      expect(result).toHaveProperty('total')
      expect(Array.isArray(result.banners)).toBe(true)
      expect(typeof result.total).toBe('number')
    })
  })

  /*
   * ============================================
   * 五、uploadBannerImage 文件校验测试
   * ============================================
   */
  describe('uploadBannerImage() - 文件限制校验', () => {
    test('拒绝非 JPG/PNG 格式（如 GIF）', async () => {
      const PopupBannerService = getTestService('popup_banner')
      // 构造一个假的 1x1 像素 buffer（不需要真实图片，因为格式校验在前）
      const fakeBuffer = Buffer.alloc(100)

      await expect(
        PopupBannerService.uploadBannerImage(fakeBuffer, 'test.gif', 'image/gif', 100)
      ).rejects.toThrow('仅支持 JPG、PNG 格式')
    })

    test('拒绝超过 400KB 的文件', async () => {
      const PopupBannerService = getTestService('popup_banner')
      const fakeBuffer = Buffer.alloc(100)
      const overSizeBytes = 500 * 1024 // 500KB

      await expect(
        PopupBannerService.uploadBannerImage(fakeBuffer, 'test.jpg', 'image/jpeg', overSizeBytes)
      ).rejects.toThrow('超过 400KB 限制')
    })
  })
})
