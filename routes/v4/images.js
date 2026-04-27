/**
 * 图片代理路由（公开接口，无需认证）
 *
 * @description
 *   解决 Sealos 对象存储强制 Content-Disposition: attachment 导致
 *   微信小程序 <image> 组件无法渲染图片的问题。
 *
 *   数据流：
 *   小程序 <image> --> /api/v4/images/{objectKey}
 *                          |
 *                   后端从 Sealos 内网获取图片
 *                          |
 *                   返回图片二进制 + Content-Disposition: inline
 *                          |
 *                   小程序正常渲染图片
 *
 * @route /api/v4/images
 * @version 1.0.0
 * @date 2026-03-06
 */

const { asyncHandler } = require('../../middleware/validation')
const express = require('express')
const router = express.Router()

/** 允许代理的图片文件扩展名 */
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|gif|webp)$/i

/**
 * GET /api/v4/images/*
 *
 * @description 图片代理接口，将 Sealos 对象存储的图片以 inline 方式返回
 * @param {string} 0 - 对象存储 key（如 prizes/20260108_abc123.jpg）
 *
 * @example
 *   GET /api/v4/images/popup-banners/1770569329928_77e53049a665f797.jpg
 *   GET /api/v4/images/defaults/prize-placeholder.png
 *   GET /api/v4/images/prizes/thumbnails/small/20260108_abc123.jpg
 */
router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const objectKey = req.params[0]

    if (!objectKey || !ALLOWED_EXTENSIONS.test(objectKey)) {
      return res.apiError('无效的图片路径', 'INVALID_IMAGE_KEY', null, 400)
    }

    if (objectKey.includes('..') || objectKey.startsWith('/')) {
      return res.apiError('非法的图片路径', 'INVALID_IMAGE_KEY', null, 400)
    }

    const SealosStorageService = req.app.locals.services.getService('sealos_storage')
    const storageService = new SealosStorageService()
    const { body, contentType, contentLength, etag } =
      await storageService.getImageBuffer(objectKey)

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end()
    }

    // 移除全局中间件注入的安全头（CSP等会干扰小程序 <image> 组件渲染）
    res.removeHeader('Content-Security-Policy')
    res.removeHeader('X-Content-Type-Options')
    res.removeHeader('X-XSS-Protection')
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Strict-Transport-Security')
    res.removeHeader('Cross-Origin-Opener-Policy')
    res.removeHeader('Cross-Origin-Resource-Policy')
    res.removeHeader('X-Permitted-Cross-Domain-Policies')
    res.removeHeader('Referrer-Policy')

    res.set({
      'Content-Type': contentType || 'image/jpeg',
      'Content-Length': contentLength,
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
      ETag: etag
    })

    return res.send(body)
  })
)

module.exports = router
