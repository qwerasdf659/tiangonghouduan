/**
 * 轮播图服务层
 *
 * 业务场景：
 * - 微信小程序首页轮播图展示（swiper组件）
 * - Web后台轮播图管理（上传、编辑、删除、启用/禁用）
 *
 * 服务对象：
 * - /api/v4/carousel/active（小程序端 - 获取有效轮播图）
 * - /api/v4/console/carousel（管理端 - CRUD操作）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const { CarouselItem, User } = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const SealosStorageService = require('./sealosStorage')
const { getImageUrl } = require('../utils/ImageUrlHelper')
const sharp = require('sharp')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')

// 🎯 2026-02-18 轮播图图片存储架构：统一尺寸限制常量（与 ImageService 保持一致）
const MAX_IMAGE_DIMENSION = 4096 // 最大图片尺寸（宽或高）

// 🎯 2026-02-18 轮播图专属：文件限制（严格执行）
const CAROUSEL_MAX_FILE_SIZE = 400 * 1024 // 400KB
const CAROUSEL_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] // 仅 JPG、PNG

/**
 * 轮播图显示模式 ENUM 有效值
 * @constant {string[]}
 */
const VALID_CAROUSEL_DISPLAY_MODES = ['wide', 'horizontal', 'square']

/**
 * 轮播图服务类
 *
 * @class CarouselItemService
 * @description 提供轮播图的查询、创建、更新、删除等操作
 */
class CarouselItemService {
  /**
   * 获取当前有效的轮播图列表（供小程序端调用）
   *
   * 业务规则：
   * - 必须 is_active = true
   * - start_time 为 NULL 或 <= 当前时间
   * - end_time 为 NULL 或 > 当前时间
   * - 按 display_order 升序、created_at 降序排序
   *
   * @param {Object} options - 查询选项
   * @param {string} options.position - 显示位置（默认 home）
   * @param {number} options.limit - 返回数量限制（默认 10）
   * @returns {Promise<Array>} 有效轮播图列表（仅包含小程序需要的字段）
   */
  static async getActiveCarousels(options = {}) {
    const { position = 'home', limit = 10, user_id = null } = options
    const now = BeijingTimeHelper.createBeijingTime()

    try {
      // 1. 获取运营轮播图
      const carousels = await CarouselItem.findAll({
        where: {
          is_active: true,
          position,
          [Op.or]: [{ start_time: null }, { start_time: { [Op.lte]: now } }],
          [Op.and]: [
            {
              [Op.or]: [{ end_time: null }, { end_time: { [Op.gt]: now } }]
            }
          ]
        },
        order: [
          ['display_order', 'ASC'],
          ['created_at', 'DESC']
        ],
        limit: parseInt(limit) || 10,
        attributes: [
          'carousel_item_id',
          'title',
          'image_url',
          'display_mode',
          'image_width',
          'image_height',
          'link_url',
          'link_type',
          'slide_interval_ms'
        ]
      })

      const operationalResults = carousels.map(carousel =>
        CarouselItemService._transformCarouselImageUrl(carousel.toJSON())
      )

      // 2. Phase 4: 合并广告竞价结果到轮播图列表
      let adResults = []
      try {
        const AdBiddingService = require('./AdBiddingService')
        const slotKey = `${position}_carousel`
        const adWinners = await AdBiddingService.selectWinners(slotKey, user_id)

        adResults = adWinners
          .filter(winner => winner.creative)
          .map(winner => ({
            carousel_item_id: null,
            title: winner.creative.title || winner.campaign_name,
            image_url: winner.creative.image_object_key
              ? getImageUrl(winner.creative.image_object_key)
              : null,
            display_mode: 'wide',
            image_width: null,
            image_height: null,
            link_url: winner.creative.link_url || null,
            link_type: winner.creative.link_type || 'none',
            slide_interval_ms: 3000,
            _is_ad: true,
            _ad_campaign_id: winner.ad_campaign_id,
            _ad_creative_id: winner.creative.ad_creative_id
          }))

        logger.info('广告竞价轮播图合并', {
          position,
          slot_key: slotKey,
          ad_count: adResults.length
        })
      } catch (adError) {
        logger.warn('广告竞价轮播图合并失败（不影响运营轮播图）', { error: adError.message })
      }

      // 3. 合并：运营轮播图（在前） + 广告轮播图（穿插在后）
      const merged = [...operationalResults, ...adResults].slice(0, parseInt(limit) || 10)

      logger.info('获取有效轮播图成功', {
        position,
        operational_count: operationalResults.length,
        ad_count: adResults.length,
        merged_count: merged.length
      })

      return merged
    } catch (error) {
      logger.error('获取有效轮播图失败', { error: error.message, position })
      throw error
    }
  }

  /**
   * 获取管理后台轮播图列表（包含全部信息）
   *
   * @param {Object} options - 查询选项
   * @param {string|null} options.position - 显示位置筛选
   * @param {boolean|null} options.is_active - 启用状态筛选
   * @param {number} options.limit - 每页数量
   * @param {number} options.offset - 偏移量
   * @returns {Promise<Object>} { carousels: Array, total: number }
   */
  static async getAdminCarouselList(options = {}) {
    const { position = null, is_active = null, limit = 20, offset = 0 } = options

    try {
      const whereClause = {}
      if (position) whereClause.position = position
      if (is_active !== null) whereClause.is_active = is_active === 'true' || is_active === true

      const { rows: carousels, count: total } = await CarouselItem.findAndCountAll({
        where: whereClause,
        order: [
          ['display_order', 'ASC'],
          ['created_at', 'DESC']
        ],
        limit: parseInt(limit) || 20,
        offset: parseInt(offset) || 0,
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      // 添加状态描述 + 转换 image_url
      const carouselsWithStatus = carousels.map(carousel => {
        const plain = carousel.toJSON()
        plain.status_description = carousel.getStatusDescription()
        // 🔴 转换 image_url：对象 key → 完整 CDN URL
        return CarouselItemService._transformCarouselImageUrl(plain)
      })

      // 附加中文显示名称
      await attachDisplayNames(carouselsWithStatus, [
        { field: 'position', dictType: DICT_TYPES.BANNER_POSITION },
        { field: 'link_type', dictType: DICT_TYPES.BANNER_LINK_TYPE },
        { field: 'display_mode', dictType: DICT_TYPES.BANNER_DISPLAY_MODE }
      ])

      logger.info('获取管理后台轮播图列表成功', {
        position,
        is_active,
        total,
        returned: carousels.length
      })

      return {
        carousels: carouselsWithStatus,
        total
      }
    } catch (error) {
      logger.error('获取管理后台轮播图列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取单个轮播图详情
   *
   * @param {number} carouselId - 轮播图ID
   * @returns {Promise<Object|null>} 轮播图详情
   */
  static async getCarouselById(carouselId) {
    try {
      const carousel = await CarouselItem.findByPk(carouselId, {
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      if (!carousel) return null

      const plain = carousel.toJSON()
      plain.status_description = carousel.getStatusDescription()
      // 🔴 转换 image_url：对象 key → 完整 CDN URL
      const result = CarouselItemService._transformCarouselImageUrl(plain)

      await attachDisplayNames(result, [
        { field: 'position', dictType: DICT_TYPES.BANNER_POSITION },
        { field: 'link_type', dictType: DICT_TYPES.BANNER_LINK_TYPE },
        { field: 'display_mode', dictType: DICT_TYPES.BANNER_DISPLAY_MODE }
      ])

      return result
    } catch (error) {
      logger.error('获取轮播图详情失败', { error: error.message, carousel_item_id: carouselId })
      throw error
    }
  }

  /**
   * 创建轮播图
   *
   * @param {Object} data - 轮播图数据
   * @param {string} data.title - 轮播图标题
   * @param {string} data.image_url - 图片URL（对象 key）
   * @param {string} data.display_mode - 显示模式（必填，wide/horizontal/square）
   * @param {number|null} data.image_width - 原图宽度(px)
   * @param {number|null} data.image_height - 原图高度(px)
   * @param {string|null} data.link_url - 跳转链接
   * @param {string} data.link_type - 跳转类型
   * @param {string} data.position - 显示位置
   * @param {boolean} data.is_active - 是否启用
   * @param {number} data.display_order - 显示顺序
   * @param {number} data.slide_interval_ms - 轮播间隔毫秒
   * @param {Date|null} data.start_time - 开始时间
   * @param {Date|null} data.end_time - 结束时间
   * @param {number} creatorId - 创建人ID
   * @returns {Promise<Object>} 创建的轮播图
   */
  static async createCarousel(data, creatorId) {
    try {
      const {
        title,
        image_url,
        display_mode,
        image_width = null,
        image_height = null,
        link_url = null,
        link_type = 'none',
        position = 'home',
        is_active = false,
        display_order = 0,
        slide_interval_ms = 3000,
        start_time = null,
        end_time = null
      } = data

      const carousel = await CarouselItem.create({
        title,
        image_url,
        display_mode,
        image_width: image_width ? parseInt(image_width) : null,
        image_height: image_height ? parseInt(image_height) : null,
        link_url,
        link_type,
        position,
        is_active,
        display_order: parseInt(display_order) || 0,
        slide_interval_ms: parseInt(slide_interval_ms) || 3000,
        start_time: start_time ? new Date(start_time) : null,
        end_time: end_time ? new Date(end_time) : null,
        created_by: creatorId,
        created_at: BeijingTimeHelper.createBeijingTime(),
        updated_at: BeijingTimeHelper.createBeijingTime()
      })

      logger.info('创建轮播图成功', {
        carousel_item_id: carousel.carousel_item_id,
        title: carousel.title,
        position: carousel.position,
        created_by: creatorId
      })

      // 🔴 转换 image_url：对象 key → 完整 CDN URL
      return CarouselItemService._transformCarouselImageUrl(carousel.toJSON())
    } catch (error) {
      logger.error('创建轮播图失败', { error: error.message, data })
      throw error
    }
  }

  /**
   * 上传轮播图片到Sealos对象存储
   *
   * 🎯 架构决策（2026-02-18）：
   * - 返回对象 key（如 carousel/xxx.jpg）存入数据库
   * - 同时返回完整 URL 供前端预览使用
   *
   * 🎯 2026-02-18 图片存储架构核查修复：
   * - 添加图片尺寸校验（最大4096px，与 ImageService 保持一致）
   *
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} originalName - 原始文件名
   * @param {string} mimeType - 文件 MIME 类型（如 image/jpeg）
   * @param {number} fileSize - 文件大小（字节）
   * @returns {Promise<{objectKey: string, publicUrl: string, dimensions: {width: number, height: number}}>} 对象 key、公网 URL 和尺寸信息
   */
  static async uploadCarouselImage(fileBuffer, originalName, mimeType, fileSize) {
    try {
      // 🎯 2026-02-18 轮播图片专属限制（400KB + 仅 JPG/PNG，严格执行）
      if (mimeType && !CAROUSEL_ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new Error(`仅支持 JPG、PNG 格式，当前格式为 ${mimeType}`)
      }
      if (fileSize && fileSize > CAROUSEL_MAX_FILE_SIZE) {
        const sizeKB = Math.round(fileSize / 1024)
        throw new Error(`图片大小 ${sizeKB}KB，超过 400KB 限制，请压缩后重新上传`)
      }

      // 🎯 2026-02-18 图片存储架构核查：添加尺寸校验（与 ImageService 保持一致）
      const metadata = await sharp(fileBuffer).metadata()
      const { width, height } = metadata

      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        throw new Error(
          `图片尺寸超出限制，宽高不能超过${MAX_IMAGE_DIMENSION}px（当前：${width}x${height}）`
        )
      }

      logger.info('轮播图片校验通过', {
        original_name: originalName,
        mime_type: mimeType,
        file_size_kb: fileSize ? Math.round(fileSize / 1024) : null,
        width,
        height
      })

      const storageService = new SealosStorageService()

      // uploadImage 现在返回对象 key（非完整 URL）
      const objectKey = await storageService.uploadImage(fileBuffer, originalName, 'carousel')

      // 生成公网访问 URL（供前端预览）
      const publicUrl = storageService.getPublicUrl(objectKey)

      logger.info('上传轮播图片成功', {
        original_name: originalName,
        object_key: objectKey,
        public_url: publicUrl,
        width,
        height
      })

      // 返回对象 key（存入数据库）和 URL（供前端预览）
      return {
        objectKey,
        publicUrl,
        dimensions: { width, height }
      }
    } catch (error) {
      logger.error('上传轮播图片失败', { error: error.message, original_name: originalName })
      throw error
    }
  }

  /**
   * 更新轮播图
   *
   * @param {number} carouselId - 轮播图ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object|null>} 更新后的轮播图
   */
  static async updateCarousel(carouselId, data) {
    try {
      const carousel = await CarouselItem.findByPk(carouselId)
      if (!carousel) return null

      const allowedFields = [
        'title',
        'image_url',
        'display_mode',
        'image_width',
        'image_height',
        'link_url',
        'link_type',
        'position',
        'is_active',
        'display_order',
        'slide_interval_ms',
        'start_time',
        'end_time'
      ]

      const updateData = {}
      allowedFields.forEach(field => {
        if (data[field] !== undefined) {
          if (field === 'start_time' || field === 'end_time') {
            updateData[field] = data[field] ? new Date(data[field]) : null
          } else if (
            field === 'display_order' ||
            field === 'image_width' ||
            field === 'image_height' ||
            field === 'slide_interval_ms'
          ) {
            updateData[field] = data[field] !== null ? parseInt(data[field]) || 0 : null
          } else if (field === 'is_active') {
            updateData[field] = data[field] === 'true' || data[field] === true
          } else {
            updateData[field] = data[field]
          }
        }
      })

      updateData.updated_at = BeijingTimeHelper.createBeijingTime()

      await carousel.update(updateData)

      logger.info('更新轮播图成功', {
        carousel_item_id: carouselId,
        updated_fields: Object.keys(updateData)
      })

      const updated = await CarouselItemService.getCarouselById(carouselId)
      return updated
    } catch (error) {
      logger.error('更新轮播图失败', { error: error.message, carousel_item_id: carouselId })
      throw error
    }
  }

  /**
   * 删除轮播图（同步删除 Sealos 对象）
   *
   * 🎯 2026-02-18 用户拍板：删除即物理删除对象
   * - 删除数据库记录
   * - 同步删除 Sealos 上的图片对象
   *
   * @param {number} carouselId - 轮播图ID
   * @returns {Promise<boolean>} 是否成功
   */
  static async deleteCarousel(carouselId) {
    try {
      const carousel = await CarouselItem.findByPk(carouselId)
      if (!carousel) return false

      // 🎯 2026-02-18：同步删除 Sealos 上的图片对象（立即物理删除）
      if (carousel.image_url) {
        /*
         * 判断是对象 key 还是完整 URL
         * 对象 key 格式：carousel/xxx.jpg（不以 http 开头）
         * 完整 URL 格式：https://xxx.com/xxx.jpg（以 http 开头，历史数据或外部链接）
         */
        const isObjectKey = !carousel.image_url.startsWith('http')

        if (isObjectKey) {
          try {
            const storageService = new SealosStorageService()
            await storageService.deleteObject(carousel.image_url)
            logger.info('删除轮播图片成功（Sealos）', {
              carousel_item_id: carouselId,
              object_key: carousel.image_url
            })
          } catch (storageError) {
            /*
             * 对象存储删除失败不阻塞数据库删除（降级处理）
             * 可能原因：对象已不存在、网络问题等
             */
            logger.warn('删除轮播图片失败（非致命，继续删除数据库记录）', {
              carousel_item_id: carouselId,
              object_key: carousel.image_url,
              error: storageError.message
            })
          }
        } else {
          logger.info('跳过图片删除（历史完整URL或外部链接）', {
            carousel_item_id: carouselId,
            image_url: carousel.image_url.substring(0, 50) + '...'
          })
        }
      }

      // 删除数据库记录
      await carousel.destroy()

      logger.info('删除轮播图成功', { carousel_item_id: carouselId })

      return true
    } catch (error) {
      logger.error('删除轮播图失败', { error: error.message, carousel_item_id: carouselId })
      throw error
    }
  }

  /**
   * 切换轮播图启用状态
   *
   * @param {number} carouselId - 轮播图ID
   * @returns {Promise<Object|null>} 更新后的轮播图
   */
  static async toggleCarouselActive(carouselId) {
    try {
      const carousel = await CarouselItem.findByPk(carouselId)
      if (!carousel) return null

      carousel.is_active = !carousel.is_active
      carousel.updated_at = BeijingTimeHelper.createBeijingTime()
      await carousel.save()

      logger.info('切换轮播图启用状态成功', {
        carousel_item_id: carouselId,
        is_active: carousel.is_active
      })

      return await CarouselItemService.getCarouselById(carouselId)
    } catch (error) {
      logger.error('切换轮播图启用状态失败', { error: error.message, carousel_item_id: carouselId })
      throw error
    }
  }

  /**
   * 获取轮播图统计信息（管理后台首页用）
   *
   * @returns {Promise<Object>} 统计数据
   */
  static async getStatistics() {
    try {
      const [totalCount, activeCount, inactiveCount, homeCount] = await Promise.all([
        CarouselItem.count(),
        CarouselItem.count({ where: { is_active: true } }),
        CarouselItem.count({ where: { is_active: false } }),
        CarouselItem.count({ where: { position: 'home' } })
      ])

      return {
        total: totalCount,
        active: activeCount,
        inactive: inactiveCount,
        by_position: {
          home: homeCount
        }
      }
    } catch (error) {
      logger.error('获取轮播图统计信息失败', { error: error.message })
      throw error
    }
  }

  /**
   * 批量更新显示顺序
   *
   * @param {Array<{carousel_item_id: number, display_order: number}>} orderList - 排序列表
   * @returns {Promise<number>} 更新的记录数
   */
  static async updateDisplayOrder(orderList) {
    try {
      // 使用 Promise.all 并行处理批量更新，提升性能
      const updatePromises = orderList.map(item =>
        CarouselItem.update(
          {
            display_order: parseInt(item.display_order) || 0,
            updated_at: BeijingTimeHelper.createBeijingTime()
          },
          {
            where: { carousel_item_id: item.carousel_item_id }
          }
        )
      )

      const results = await Promise.all(updatePromises)
      const updatedCount = results.reduce((sum, [affectedRows]) => sum + affectedRows, 0)

      logger.info('批量更新显示顺序成功', { updated_count: updatedCount })

      return updatedCount
    } catch (error) {
      logger.error('批量更新显示顺序失败', { error: error.message })
      throw error
    }
  }

  /**
   * 转换 carousel 的 image_url 为完整 CDN URL
   *
   * 架构说明：
   * - 数据库存储对象 key（如 carousel/xxx.jpg）
   * - API 返回完整 CDN URL（如 https://cdn.example.com/bucket/carousel/xxx.jpg）
   *
   * @private
   * @param {Object} carousel - carousel 对象（plain JSON）
   * @returns {Object} 转换后的 carousel 对象
   */
  static _transformCarouselImageUrl(carousel) {
    if (!carousel || !carousel.image_url) {
      return carousel
    }

    // 将对象 key 转换为完整 CDN URL
    carousel.image_url = getImageUrl(carousel.image_url)
    return carousel
  }
}

// 导出服务类和常量（供路由层使用）
module.exports = CarouselItemService
module.exports.VALID_CAROUSEL_DISPLAY_MODES = VALID_CAROUSEL_DISPLAY_MODES
module.exports.CAROUSEL_MAX_FILE_SIZE = CAROUSEL_MAX_FILE_SIZE
module.exports.CAROUSEL_ALLOWED_MIME_TYPES = CAROUSEL_ALLOWED_MIME_TYPES
module.exports.MAX_IMAGE_DIMENSION = MAX_IMAGE_DIMENSION
