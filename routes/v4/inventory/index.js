/**
 * inventory域 - 已废弃（返回 410 Gone）
 *
 * 废弃时间：2025-12-28
 * 废弃原因：功能迁移到统一资产域
 * 新接口：/api/v4/shop/assets/portfolio
 *
 * 迁移指南：
 * - GET /api/v4/inventory/backpack/* -> GET /api/v4/shop/assets/portfolio
 * - GET /api/v4/inventory/items -> GET /api/v4/shop/assets/portfolio/items
 * - GET /api/v4/inventory/items/:id -> GET /api/v4/shop/assets/portfolio/items/:id
 *
 * 基于文档：统一资产域架构设计方案.md
 * 创建时间：2025年01月21日
 * 废弃时间：2025年12月28日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger')

/**
 * 构建废弃响应路径映射
 *
 * @param {string} originalPath - 原始请求路径
 * @returns {string} 新接口路径
 */
const getNewEndpoint = originalPath => {
  // 背包相关接口映射
  if (originalPath.includes('/backpack')) {
    return '/api/v4/shop/assets/portfolio'
  }
  // 物品列表
  if (originalPath.match(/^\/items\/?$/)) {
    return '/api/v4/shop/assets/portfolio/items'
  }
  // 物品详情
  if (originalPath.match(/^\/items\/\d+/)) {
    return '/api/v4/shop/assets/portfolio/items/:item_instance_id'
  }
  // 默认映射到资产总览
  return '/api/v4/shop/assets/portfolio'
}

/**
 * 410 Gone 响应中间件
 * 所有 inventory 域请求返回 410 状态码和迁移引导
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {void}
 */
router.all('*', (req, res) => {
  const newEndpoint = getNewEndpoint(req.path)

  // 记录废弃 API 调用日志
  logger.warn('410 Gone - 调用废弃的 inventory API', {
    path: req.path,
    full_url: req.originalUrl,
    method: req.method,
    user_id: req.user?.user_id,
    ip: req.ip,
    new_endpoint: newEndpoint
  })

  // 添加废弃标记响应头
  res.set('Deprecation', 'true')
  res.set('Sunset', 'Sat, 28 Dec 2025 00:00:00 GMT')
  res.set('Link', `<${newEndpoint}>; rel="successor-version"`)

  // 返回 410 Gone 响应（使用 res.apiError 符合项目规范）
  return res.apiError(
    '此接口已废弃，请使用新的统一资产域接口',
    'ENDPOINT_DEPRECATED',
    {
      deprecated_since: '2025-12-28',
      new_endpoint: newEndpoint,
      migration_guide: {
        old: `${req.method} /api/v4/inventory${req.path}`,
        new: `${req.method} ${newEndpoint}`
      },
      documentation: '请参考文档：统一资产域架构设计方案.md'
    },
    410
  )
})

module.exports = router
