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
 * @version 2.0.0
 * @date 2026-03-06（2026-06-24 治本 D：废除 ?width= 运行时按需裁剪，衍生图改上传时预生成，代理只按 key 原样取对象）
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
 *   GET /api/v4/images/uploads/thumbnails/w750/xxx.webp  （取预生成的宽度档 WebP 衍生图）
 *
 * @note 2026-06-24 治本 D：衍生图已在上传时预生成（w375/w750/w1080），前端直接取对应档位 key，
 *       不再支持 ?width= 运行时裁剪（旧「按需生成 + Sealos 缓存」路径已废除，根除「运行时衍生物删不到」）。
 */
router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const objectKey = req.params[0]

    if (!objectKey || !ALLOWED_EXTENSIONS.test(objectKey)) {
      res.set({ 'Cache-Control': 'no-store' })
      return res.apiError('无效的图片路径', 'INVALID_IMAGE_KEY', null, 400)
    }

    if (objectKey.includes('..') || objectKey.startsWith('/')) {
      res.set({ 'Cache-Control': 'no-store' })
      return res.apiError('非法的图片路径', 'INVALID_IMAGE_KEY', null, 400)
    }

    let imageData
    try {
      const SealosStorageService = req.app.locals.services.getService('sealos_storage')
      const storageService = new SealosStorageService()
      // 衍生图已预生成（D 治本），代理按 key 原样取对象（含预生成的 thumbnails/w{档}/x.webp）
      imageData = await storageService.getImageBuffer(objectKey)
    } catch (storageError) {
      /* 对象不存在时返回 404，且禁止缓存（避免客户端缓存 404 导致后续上传后仍无法显示） */
      res.set({ 'Cache-Control': 'no-store' })
      if (storageError.code === 'NoSuchKey') {
        return res.apiError('图片不存在', 'IMAGE_NOT_FOUND', null, 404)
      }
      return res.apiError('图片获取失败', 'STORAGE_ERROR', null, 502)
    }

    const { body, contentType, contentLength, etag } = imageData

    // 所有对象（原图/衍生图）均直取，带 etag，走 304 协商缓存
    if (etag && req.headers['if-none-match'] === etag) {
      return res.status(304).end()
    }

    res.removeHeader('Content-Security-Policy')
    res.removeHeader('X-Content-Type-Options')
    res.removeHeader('X-XSS-Protection')
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Strict-Transport-Security')
    res.removeHeader('Cross-Origin-Opener-Policy')
    res.removeHeader('Cross-Origin-Resource-Policy')
    res.removeHeader('X-Permitted-Cross-Domain-Policies')
    res.removeHeader('Referrer-Policy')

    /*
     * 缓存策略：
     * - 带 ?h= 参数（内容哈希）：永久缓存 + immutable（文件变 → hash 变 → URL 变）
     * - 带 ?v= 参数（启动版本）：缓存24小时 + must-revalidate
     * - 无参数：缓存24小时 + must-revalidate
     */
    const cacheControl = req.query.h
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=86400, must-revalidate'

    res.set({
      'Content-Type': contentType || 'image/jpeg',
      'Content-Length': contentLength,
      'Content-Disposition': 'inline',
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*'
    })
    // 对象直取均有 etag
    if (etag) {
      res.set('ETag', etag)
    }

    return res.send(body)
  })
)

module.exports = router
