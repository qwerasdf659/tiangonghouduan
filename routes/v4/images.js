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

const express = require('express')
const router = express.Router()
const SealosStorageService = require('../../services/sealosStorage')
const logger = require('../../utils/logger').logger

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
router.get('/*', async (req, res) => {
  const objectKey = req.params[0]

  if (!objectKey || !ALLOWED_EXTENSIONS.test(objectKey)) {
    return res.apiError('无效的图片路径', 'INVALID_IMAGE_KEY', null, 400)
  }

  if (objectKey.includes('..') || objectKey.startsWith('/')) {
    return res.apiError('非法的图片路径', 'INVALID_IMAGE_KEY', null, 400)
  }

  try {
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
  } catch (error) {
    if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
      return res.apiError('图片不存在', 'IMAGE_NOT_FOUND', null, 404)
    }

    logger.error('图片代理请求失败', {
      object_key: objectKey,
      error: error.message
    })

    return res.apiError('图片加载失败', 'IMAGE_PROXY_ERROR', null, 500)
  }
})

module.exports = router
