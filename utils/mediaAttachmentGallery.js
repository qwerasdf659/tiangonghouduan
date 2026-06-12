'use strict'

/**
 * 兑换/商品详情共用的「product 多态」媒体附件查询与分组（§5.7 去重）
 */
const { getImageUrl } = require('./ImageUrlHelper')

/**
 * @param {Object} models - Sequelize models（需含 MediaAttachment、MediaFile）
 * @param {number} productId - attachable_id（product）
 * @returns {Promise<{ images: Object[], detail_images: Object[], showcase_images: Object[] }>} 按 role 分组后的图集
 */
async function fetchProductMediaGallery(models, productId) {
  const { MediaAttachment, MediaFile } = models
  if (!MediaAttachment || !MediaFile) {
    return { images: [], detail_images: [], showcase_images: [] }
  }

  const attachments = await MediaAttachment.findAll({
    where: {
      attachable_type: 'product',
      attachable_id: productId
    },
    include: [
      {
        model: MediaFile,
        as: 'media',
        attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys', 'content_hash']
      }
    ],
    order: [['sort_order', 'ASC']]
  })

  const toImageJson = a => {
    const m = a.media || a.Media
    if (!m) return null
    const url = m.object_key ? getImageUrl(m.object_key, m.content_hash) : null
    return {
      media_id: m.media_id,
      url,
      mime: m.mime_type,
      thumbnail_url: m.thumbnail_keys?.small
        ? getImageUrl(m.thumbnail_keys.small, m.content_hash)
        : url
    }
  }

  const images = attachments
    .filter(a => a.role === 'gallery' || a.role === 'exchange_items')
    .map(toImageJson)
    .filter(Boolean)
  const detail_images = attachments
    .filter(a => a.role === 'detail')
    .map(toImageJson)
    .filter(Boolean)
  const showcase_images = attachments
    .filter(a => a.role === 'showcase')
    .map(toImageJson)
    .filter(Boolean)

  return { images, detail_images, showcase_images }
}

/**
 * Sequelize include 片段：类目/资产类型等通过 `iconAttachment` 挂图标（§5.7 与挂牌列表、facets 共用）
 * @param {Object} models - Sequelize models
 * @param {Object} [models.MediaAttachment] - MediaAttachment 模型
 * @param {Object} [models.MediaFile] - MediaFile 模型
 * @returns {Object|null} findAll/include 用片段，缺模型时返回 null
 */
function categoryIconAttachmentInclude(models) {
  const { MediaAttachment, MediaFile } = models
  if (!MediaAttachment || !MediaFile) {
    return null
  }
  return {
    model: MediaAttachment,
    as: 'iconAttachment',
    attributes: ['media_id'],
    required: false,
    include: [
      {
        model: MediaFile,
        as: 'media',
        attributes: ['object_key', 'content_hash']
      }
    ]
  }
}

/**
 * 按 asset_code 批量解析「材料资产图标 URL」——抽奖图/余额图/背包图统一图标真相源（P3）
 *
 * 单一来源：material_asset_types → MediaAttachment(iconAttachment) → media_files.object_key → getImageUrl。
 * 供抽奖结果(routes/v4/lottery/draw.js)、余额(routes/v4/assets/balance.js)等多处复用，避免各自拼静态文件地址。
 *
 * @param {Object} models - Sequelize models（需含 MaterialAssetType、MediaAttachment、MediaFile）
 * @param {string[]} assetCodes - 资产码数组（如 ['star_stone','red_core_shard']）
 * @returns {Promise<Map<string,string|null>>} asset_code → icon_url（无附件时为 null）
 */
async function resolveMaterialIconUrls(models, assetCodes) {
  const { MaterialAssetType, MediaAttachment, MediaFile } = models
  const map = new Map()
  if (!MaterialAssetType || !MediaAttachment || !MediaFile) {
    return map
  }
  const codes = [...new Set((assetCodes || []).filter(Boolean))]
  if (codes.length === 0) {
    return map
  }
  const { Op } = require('sequelize')
  const rows = await MaterialAssetType.findAll({
    where: { asset_code: { [Op.in]: codes } },
    attributes: ['asset_code'],
    include: [categoryIconAttachmentInclude({ MediaAttachment, MediaFile })].filter(Boolean)
  })
  rows.forEach(row => {
    const plain = row.get ? row.get({ plain: true }) : row
    const media = plain.iconAttachment?.media || plain.iconAttachment?.Media
    map.set(
      plain.asset_code,
      media?.object_key ? getImageUrl(media.object_key, media.content_hash) : null
    )
  })
  return map
}

module.exports = {
  fetchProductMediaGallery,
  categoryIconAttachmentInclude,
  resolveMaterialIconUrls
}
