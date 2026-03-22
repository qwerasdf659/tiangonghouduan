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
        attributes: ['media_id', 'object_key', 'mime_type', 'thumbnail_keys']
      }
    ],
    order: [['sort_order', 'ASC']]
  })

  const toImageJson = a => {
    const m = a.media || a.Media
    if (!m) return null
    const url = m.object_key ? getImageUrl(m.object_key) : null
    return {
      media_id: m.media_id,
      url,
      mime: m.mime_type,
      thumbnail_url: m.thumbnail_keys?.small ? getImageUrl(m.thumbnail_keys.small) : url
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
        attributes: ['object_key']
      }
    ]
  }
}

module.exports = { fetchProductMediaGallery, categoryIconAttachmentInclude }
