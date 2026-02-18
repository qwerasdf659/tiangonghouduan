/**
 * 弹窗Banner服务层
 *
 * 业务场景：
 * - 微信小程序首页弹窗图片展示
 * - Web后台弹窗Banner管理（上传、编辑、删除、启用/禁用）
 *
 * 服务对象：
 * - /api/v4/popup-banners/active（小程序端 - 获取有效弹窗）
 * - /api/v4/console/popup-banners（管理端 - CRUD操作）
 *
 * 创建时间：2025-12-22
 */

const logger = require('../utils/logger').logger
const { PopupBanner, User } = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const SealosStorageService = require('./sealosStorage')
const { getImageUrl } = require('../utils/ImageUrlHelper')
const sharp = require('sharp')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')

// 🎯 2026-01-08 图片存储架构核查：统一尺寸限制常量（与 ImageService 保持一致）
const MAX_IMAGE_DIMENSION = 4096 // 最大图片尺寸（宽或高）

// 🎯 2026-02-08 弹窗Banner专属：文件限制（拍板决策1：严格执行）
const BANNER_MAX_FILE_SIZE = 400 * 1024 // 400KB
const BANNER_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] // 仅 JPG、PNG

/**
 * 弹窗显示模式 ENUM 有效值
 * @constant {string[]}
 */
const VALID_DISPLAY_MODES = ['wide', 'horizontal', 'square', 'tall', 'slim', 'full_image']

/**
 * 模板对应的期望比例范围（ratio = width / height）
 *
 * 用于上传图片后校验比例与所选模板的匹配度。
 * 校验原则：警告但不阻止（运营有最终决定权）。
 *
 * @constant {Object.<string, {min: number, max: number, label: string}|null>}
 */
const DISPLAY_MODE_RATIO_RANGES = {
  wide: { min: 1.6, max: 2.0, label: '16:9 宽屏' },
  horizontal: { min: 1.3, max: 1.6, label: '3:2 横版' },
  square: { min: 0.85, max: 1.3, label: '1:1 方图' },
  tall: { min: 0.5, max: 0.85, label: '3:4 竖图' },
  slim: { min: 0.4, max: 0.6, label: '9:16 窄长图' },
  full_image: null // 纯图模式不校验比例
}

/**
 * 校验图片比例与模板的匹配度
 *
 * @param {string} displayMode - 显示模式（ENUM值）
 * @param {number} width - 图片宽度(px)
 * @param {number} height - 图片高度(px)
 * @returns {Object} 校验结果（status: 'match' 或 'warning'，warning 时包含 message）
 */
function validateImageRatio(displayMode, width, height) {
  const range = DISPLAY_MODE_RATIO_RANGES[displayMode]
  // 纯图模式不校验比例
  if (!range) return { status: 'match' }

  const ratio = width / height
  if (ratio >= range.min && ratio <= range.max) {
    return { status: 'match' }
  }

  return {
    status: 'warning',
    message: `当前图片比例 ${ratio.toFixed(2)}:1，与${range.label}模板有偏差，展示时可能被裁切`
  }
}

/**
 * 弹窗Banner服务类
 *
 * @class PopupBannerService
 * @description 提供弹窗Banner的查询、创建、更新、删除等操作
 */
class PopupBannerService {
  /**
   * 获取当前有效的弹窗列表（供小程序端调用）
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
   * @returns {Promise<Array>} 有效弹窗列表（仅包含小程序需要的字段）
   */
  static async getActiveBanners(options = {}) {
    const { position = 'home', limit = 10, user_id = null } = options
    const now = BeijingTimeHelper.createBeijingTime()

    try {
      /**
       * Phase 2 弹窗队列截断：从 system_configs 读取 popup_queue_max_count
       * 拍板决策5：可配置，默认5个，热更新无需重启
       */
      let queueMaxCount = parseInt(limit) || 10
      try {
        const { SystemConfig } = require('../models')
        const configRow = await SystemConfig.findOne({
          where: { config_key: 'popup_queue_max_count' }
        })
        if (configRow && configRow.config_value) {
          queueMaxCount = Math.min(parseInt(configRow.config_value) || 5, queueMaxCount)
        }
      } catch (configError) {
        logger.warn('读取弹窗队列配置失败，使用默认值', { error: configError.message })
      }

      // 1. 获取运营弹窗
      const banners = await PopupBanner.findAll({
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
          ['priority', 'DESC'],
          ['display_order', 'ASC'],
          ['created_at', 'DESC']
        ],
        limit: queueMaxCount,
        /**
         * 小程序需要的 12 个字段（Phase 1 新增 title + 5 个频率控制字段）
         * title 用于 notice 类型展示标题
         */
        attributes: [
          'popup_banner_id',
          'title',
          'image_url',
          'display_mode',
          'image_width',
          'image_height',
          'link_url',
          'link_type',
          'banner_type',
          'frequency_rule',
          'frequency_value',
          'force_show',
          'priority'
        ]
      })

      // 2. Phase 4: 合并广告竞价结果到弹窗队列
      const operationalResults = banners.map(banner =>
        PopupBannerService._transformBannerImageUrl(banner.toJSON())
      )

      let adResults = []
      try {
        const AdBiddingService = require('./AdBiddingService')
        const slotKey = `${position}_popup`
        const adWinners = await AdBiddingService.selectWinners(slotKey, user_id)

        adResults = adWinners
          .filter(winner => winner.creative)
          .map(winner => ({
            popup_banner_id: null,
            title: winner.creative.title || winner.campaign_name,
            image_url: winner.creative.image_object_key
              ? getImageUrl(winner.creative.image_object_key)
              : null,
            display_mode: 'wide',
            image_width: null,
            image_height: null,
            link_url: winner.creative.link_url || null,
            link_type: winner.creative.link_type || 'none',
            banner_type: 'image',
            frequency_rule: 'once_per_day',
            frequency_value: 1,
            force_show: false,
            priority: 90,
            _is_ad: true,
            _ad_campaign_id: winner.ad_campaign_id,
            _ad_creative_id: winner.creative.ad_creative_id
          }))

        logger.info('广告竞价弹窗合并', {
          position,
          slot_key: slotKey,
          ad_count: adResults.length
        })
      } catch (adError) {
        logger.warn('广告竞价弹窗合并失败（不影响运营弹窗）', { error: adError.message })
      }

      // 3. 合并：运营弹窗 + 广告弹窗，截断到队列上限
      const merged = [...operationalResults, ...adResults]
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .slice(0, queueMaxCount)

      logger.info('获取有效弹窗成功', {
        position,
        operational_count: operationalResults.length,
        ad_count: adResults.length,
        merged_count: merged.length
      })

      return merged
    } catch (error) {
      logger.error('获取有效弹窗失败', { error: error.message, position })
      throw error
    }
  }

  /**
   * 根据状态获取弹窗列表（供管理员查询draft/expired状态）
   *
   * 业务规则：
   * - draft（草稿）：is_active = false
   * - expired（过期）：end_time < 当前时间
   * - active：使用 getActiveBanners 方法
   *
   * @param {Object} options - 查询选项
   * @param {string} options.status - 状态（draft/expired）
   * @param {string} options.position - 显示位置（默认 home）
   * @param {number} options.limit - 返回数量限制（默认 10）
   * @returns {Promise<Array>} 弹窗列表
   */
  static async getBannersByStatus(options = {}) {
    const { status, position = 'home', limit = 10 } = options
    const now = BeijingTimeHelper.createBeijingTime()

    try {
      const whereClause = { position }

      if (status === 'draft') {
        // 草稿状态：is_active = false
        whereClause.is_active = false
      } else if (status === 'expired') {
        // 过期状态：end_time < 当前时间
        whereClause.end_time = { [Op.lt]: now }
      }

      const banners = await PopupBanner.findAll({
        where: whereClause,
        order: [
          ['display_order', 'ASC'],
          ['created_at', 'DESC']
        ],
        limit: parseInt(limit) || 10,
        // 返回更多字段供管理员查看（含显示模式）
        attributes: [
          'popup_banner_id',
          'title',
          'image_url',
          'display_mode',
          'image_width',
          'image_height',
          'link_url',
          'link_type',
          'is_active',
          'position',
          'start_time',
          'end_time'
        ]
      })

      logger.info('根据状态获取弹窗成功', {
        status,
        position,
        count: banners.length
      })

      // 🔴 转换 image_url：对象 key → 完整 CDN URL
      return banners.map(banner => PopupBannerService._transformBannerImageUrl(banner.toJSON()))
    } catch (error) {
      logger.error('根据状态获取弹窗失败', { error: error.message, status, position })
      throw error
    }
  }

  /**
   * 获取管理后台弹窗列表（包含全部信息）
   *
   * @param {Object} options - 查询选项
   * @param {string|null} options.position - 显示位置筛选
   * @param {boolean|null} options.is_active - 启用状态筛选
   * @param {number} options.limit - 每页数量
   * @param {number} options.offset - 偏移量
   * @returns {Promise<Object>} { banners: Array, total: number }
   */
  static async getAdminBannerList(options = {}) {
    const {
      position = null,
      is_active = null,
      banner_type = null,
      limit = 20,
      offset = 0
    } = options

    try {
      const whereClause = {}
      if (position) whereClause.position = position
      if (is_active !== null) whereClause.is_active = is_active === 'true' || is_active === true
      if (banner_type) whereClause.banner_type = banner_type

      const { rows: banners, count: total } = await PopupBanner.findAndCountAll({
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
      const bannersWithStatus = banners.map(banner => {
        const plain = banner.toJSON()
        plain.status_description = banner.getStatusDescription()
        // 🔴 转换 image_url：对象 key → 完整 CDN URL
        return PopupBannerService._transformBannerImageUrl(plain)
      })

      // 附加中文显示名称（含 Phase 1 新增的 banner_type / frequency_rule）
      await attachDisplayNames(bannersWithStatus, [
        { field: 'position', dictType: DICT_TYPES.BANNER_POSITION },
        { field: 'link_type', dictType: DICT_TYPES.BANNER_LINK_TYPE },
        { field: 'display_mode', dictType: DICT_TYPES.BANNER_DISPLAY_MODE },
        { field: 'banner_type', dictType: DICT_TYPES.BANNER_TYPE },
        { field: 'frequency_rule', dictType: DICT_TYPES.BANNER_FREQUENCY }
      ])

      logger.info('获取管理后台弹窗列表成功', {
        position,
        is_active,
        total,
        returned: banners.length
      })

      return {
        banners: bannersWithStatus,
        total
      }
    } catch (error) {
      logger.error('获取管理后台弹窗列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取单个弹窗详情
   *
   * @param {number} bannerId - 弹窗ID
   * @returns {Promise<Object|null>} 弹窗详情
   */
  static async getBannerById(bannerId) {
    try {
      const banner = await PopupBanner.findByPk(bannerId, {
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      if (!banner) return null

      const plain = banner.toJSON()
      plain.status_description = banner.getStatusDescription()
      // 🔴 转换 image_url：对象 key → 完整 CDN URL
      const result = PopupBannerService._transformBannerImageUrl(plain)

      await attachDisplayNames(result, [
        { field: 'position', dictType: DICT_TYPES.BANNER_POSITION },
        { field: 'link_type', dictType: DICT_TYPES.BANNER_LINK_TYPE },
        { field: 'display_mode', dictType: DICT_TYPES.BANNER_DISPLAY_MODE },
        { field: 'banner_type', dictType: DICT_TYPES.BANNER_TYPE },
        { field: 'frequency_rule', dictType: DICT_TYPES.BANNER_FREQUENCY }
      ])

      return result
    } catch (error) {
      logger.error('获取弹窗详情失败', { error: error.message, popup_banner_id: bannerId })
      throw error
    }
  }

  /**
   * 创建弹窗Banner
   *
   * @param {Object} data - 弹窗数据
   * @param {string} data.title - 弹窗标题
   * @param {string} data.image_url - 图片URL（对象 key）
   * @param {string} data.display_mode - 显示模式（必填，wide/horizontal/square/tall/slim/full_image）
   * @param {number|null} data.image_width - 原图宽度(px)
   * @param {number|null} data.image_height - 原图高度(px)
   * @param {string|null} data.link_url - 跳转链接
   * @param {string} data.link_type - 跳转类型
   * @param {string} data.position - 显示位置
   * @param {boolean} data.is_active - 是否启用
   * @param {number} data.display_order - 显示顺序
   * @param {Date|null} data.start_time - 开始时间
   * @param {Date|null} data.end_time - 结束时间
   * @param {number} creatorId - 创建人ID
   * @returns {Promise<Object>} 创建的弹窗
   */
  static async createBanner(data, creatorId) {
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
        start_time = null,
        end_time = null,
        banner_type = 'promo',
        frequency_rule = 'once_per_day',
        frequency_value = 1,
        force_show = false,
        priority = null
      } = data

      /**
       * Priority 自动分配（拍板决策6）：
       * 如果未指定 priority，根据 banner_type 自动分配默认值
       */
      let resolvedPriority = priority
      if (resolvedPriority === null || resolvedPriority === undefined) {
        resolvedPriority = PopupBannerService._getDefaultPriority(banner_type)
      }

      const banner = await PopupBanner.create({
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
        start_time: start_time ? new Date(start_time) : null,
        end_time: end_time ? new Date(end_time) : null,
        banner_type,
        frequency_rule,
        frequency_value: parseInt(frequency_value) || 1,
        force_show: force_show === 'true' || force_show === true,
        priority: parseInt(resolvedPriority) || 0,
        created_by: creatorId,
        created_at: BeijingTimeHelper.createBeijingTime(),
        updated_at: BeijingTimeHelper.createBeijingTime()
      })

      logger.info('创建弹窗Banner成功', {
        popup_banner_id: banner.popup_banner_id,
        title: banner.title,
        position: banner.position,
        created_by: creatorId
      })

      // 🔴 转换 image_url：对象 key → 完整 CDN URL
      return PopupBannerService._transformBannerImageUrl(banner.toJSON())
    } catch (error) {
      logger.error('创建弹窗Banner失败', { error: error.message, data })
      throw error
    }
  }

  /**
   * 上传弹窗图片到Sealos对象存储
   *
   * 🎯 架构决策（2026-01-08 拍板）：
   * - 返回对象 key（如 popup-banners/xxx.jpg）存入数据库
   * - 同时返回完整 URL 供前端预览使用
   *
   * 🎯 2026-01-08 图片存储架构核查修复：
   * - 添加图片尺寸校验（最大4096px，与 ImageService 保持一致）
   *
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} originalName - 原始文件名
   * @param {string} mimeType - 文件 MIME 类型（如 image/jpeg）
   * @param {number} fileSize - 文件大小（字节）
   * @returns {Promise<{objectKey: string, publicUrl: string, dimensions: {width: number, height: number}}>} 对象 key、公网 URL 和尺寸信息
   */
  static async uploadBannerImage(fileBuffer, originalName, mimeType, fileSize) {
    try {
      // 🎯 2026-02-08 弹窗图片专属限制（拍板决策1：400KB + 仅 JPG/PNG，严格执行）
      if (mimeType && !BANNER_ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new Error(`仅支持 JPG、PNG 格式，当前格式为 ${mimeType}`)
      }
      if (fileSize && fileSize > BANNER_MAX_FILE_SIZE) {
        const sizeKB = Math.round(fileSize / 1024)
        throw new Error(`图片大小 ${sizeKB}KB，超过 400KB 限制，请压缩后重新上传`)
      }

      // 🎯 2026-01-08 图片存储架构核查：添加尺寸校验（与 ImageService 保持一致）
      const metadata = await sharp(fileBuffer).metadata()
      const { width, height } = metadata

      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        throw new Error(
          `图片尺寸超出限制，宽高不能超过${MAX_IMAGE_DIMENSION}px（当前：${width}x${height}）`
        )
      }

      logger.info('弹窗图片校验通过', {
        original_name: originalName,
        mime_type: mimeType,
        file_size_kb: fileSize ? Math.round(fileSize / 1024) : null,
        width,
        height
      })

      const storageService = new SealosStorageService()

      // uploadImage 现在返回对象 key（非完整 URL）
      const objectKey = await storageService.uploadImage(fileBuffer, originalName, 'popup-banners')

      // 生成公网访问 URL（供前端预览）
      const publicUrl = storageService.getPublicUrl(objectKey)

      logger.info('上传弹窗图片成功', {
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
      logger.error('上传弹窗图片失败', { error: error.message, original_name: originalName })
      throw error
    }
  }

  /**
   * 根据对象 key 生成公网访问 URL
   *
   * @param {string} objectKey - 对象 key（如 popup-banners/xxx.jpg）
   * @param {Object} options - URL 选项（width/height/fit）
   * @returns {string|null} 公网访问 URL
   */
  static getImageUrl(objectKey, options = {}) {
    if (!objectKey) return null

    try {
      const storageService = new SealosStorageService()
      return storageService.getPublicUrl(objectKey, options)
    } catch (error) {
      logger.warn('生成图片 URL 失败', { object_key: objectKey, error: error.message })
      return null
    }
  }

  /**
   * 更新弹窗Banner
   *
   * @param {number} bannerId - 弹窗ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object|null>} 更新后的弹窗
   */
  static async updateBanner(bannerId, data) {
    try {
      const banner = await PopupBanner.findByPk(bannerId)
      if (!banner) return null

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
        'start_time',
        'end_time',
        'banner_type',
        'frequency_rule',
        'frequency_value',
        'force_show',
        'priority'
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
            field === 'frequency_value' ||
            field === 'priority'
          ) {
            updateData[field] = data[field] !== null ? parseInt(data[field]) || 0 : null
          } else if (field === 'is_active' || field === 'force_show') {
            updateData[field] = data[field] === 'true' || data[field] === true
          } else {
            updateData[field] = data[field]
          }
        }
      })

      updateData.updated_at = BeijingTimeHelper.createBeijingTime()

      await banner.update(updateData)

      logger.info('更新弹窗Banner成功', {
        banner_id: bannerId,
        updated_fields: Object.keys(updateData)
      })

      const updated = await PopupBannerService.getBannerById(bannerId)
      return updated
    } catch (error) {
      logger.error('更新弹窗Banner失败', { error: error.message, popup_banner_id: bannerId })
      throw error
    }
  }

  /**
   * 删除弹窗Banner（同步删除 Sealos 对象）
   *
   * 🎯 2026-01-09 用户拍板：删除即物理删除对象
   * - 删除数据库记录
   * - 同步删除 Sealos 上的图片对象
   *
   * @param {number} bannerId - 弹窗ID
   * @returns {Promise<boolean>} 是否成功
   */
  static async deleteBanner(bannerId) {
    try {
      const banner = await PopupBanner.findByPk(bannerId)
      if (!banner) return false

      // 🎯 2026-01-09：同步删除 Sealos 上的图片对象（立即物理删除）
      if (banner.image_url) {
        /*
         * 判断是对象 key 还是完整 URL
         * 对象 key 格式：popup-banners/xxx.jpg（不以 http 开头）
         * 完整 URL 格式：https://xxx.com/xxx.jpg（以 http 开头，历史数据或外部链接）
         */
        const isObjectKey = !banner.image_url.startsWith('http')

        if (isObjectKey) {
          try {
            const storageService = new SealosStorageService()
            await storageService.deleteObject(banner.image_url)
            logger.info('删除弹窗Banner图片成功（Sealos）', {
              popup_banner_id: bannerId,
              object_key: banner.image_url
            })
          } catch (storageError) {
            /*
             * 对象存储删除失败不阻塞数据库删除（降级处理）
             * 可能原因：对象已不存在、网络问题等
             */
            logger.warn('删除弹窗Banner图片失败（非致命，继续删除数据库记录）', {
              popup_banner_id: bannerId,
              object_key: banner.image_url,
              error: storageError.message
            })
          }
        } else {
          logger.info('跳过图片删除（历史完整URL或外部链接）', {
            popup_banner_id: bannerId,
            image_url: banner.image_url.substring(0, 50) + '...'
          })
        }
      }

      // 删除数据库记录
      await banner.destroy()

      logger.info('删除弹窗Banner成功', { popup_banner_id: bannerId })

      return true
    } catch (error) {
      logger.error('删除弹窗Banner失败', { error: error.message, popup_banner_id: bannerId })
      throw error
    }
  }

  /**
   * 切换弹窗启用状态
   *
   * @param {number} bannerId - 弹窗ID
   * @returns {Promise<Object|null>} 更新后的弹窗
   */
  static async toggleBannerActive(bannerId) {
    try {
      const banner = await PopupBanner.findByPk(bannerId)
      if (!banner) return null

      banner.is_active = !banner.is_active
      banner.updated_at = BeijingTimeHelper.createBeijingTime()
      await banner.save()

      logger.info('切换弹窗启用状态成功', {
        popup_banner_id: bannerId,
        is_active: banner.is_active
      })

      return await PopupBannerService.getBannerById(bannerId)
    } catch (error) {
      logger.error('切换弹窗启用状态失败', { error: error.message, popup_banner_id: bannerId })
      throw error
    }
  }

  /**
   * 获取弹窗统计信息（管理后台首页用）
   *
   * @returns {Promise<Object>} 统计数据
   */
  static async getStatistics() {
    try {
      const [
        totalCount,
        activeCount,
        inactiveCount,
        homeCount,
        profileCount,
        noticeCount,
        eventCount,
        promoCount
      ] = await Promise.all([
        PopupBanner.count(),
        PopupBanner.count({ where: { is_active: true } }),
        PopupBanner.count({ where: { is_active: false } }),
        PopupBanner.count({ where: { position: 'home' } }),
        PopupBanner.count({ where: { position: 'profile' } }),
        PopupBanner.count({ where: { banner_type: 'notice' } }),
        PopupBanner.count({ where: { banner_type: 'event' } }),
        PopupBanner.count({ where: { banner_type: 'promo' } })
      ])

      return {
        total: totalCount,
        active: activeCount,
        inactive: inactiveCount,
        by_position: {
          home: homeCount,
          profile: profileCount
        },
        by_type: {
          notice: noticeCount,
          event: eventCount,
          promo: promoCount
        }
      }
    } catch (error) {
      logger.error('获取弹窗统计信息失败', { error: error.message })
      throw error
    }
  }

  /**
   * 批量更新显示顺序
   *
   * @param {Array<{popup_banner_id: number, display_order: number}>} orderList - 排序列表
   * @returns {Promise<number>} 更新的记录数
   */
  static async updateDisplayOrder(orderList) {
    try {
      // 使用 Promise.all 并行处理批量更新，提升性能
      const updatePromises = orderList.map(item =>
        PopupBanner.update(
          {
            display_order: parseInt(item.display_order) || 0,
            updated_at: BeijingTimeHelper.createBeijingTime()
          },
          {
            where: { popup_banner_id: item.popup_banner_id }
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
   * 根据 banner_type 返回默认 priority 值（拍板决策6）
   *
   * | banner_type | 默认 priority | 允许范围 |
   * |-------------|---------------|----------|
   * | notice      | 950           | 900~999  |
   * | event       | 700           | 500~899  |
   * | promo       | 300           | 100~499  |
   *
   * @private
   * @param {string} bannerType - 弹窗类型
   * @returns {number} 默认优先级
   */
  static _getDefaultPriority(bannerType) {
    const defaults = { notice: 950, event: 700, promo: 300 }
    return defaults[bannerType] || 300
  }

  /**
   * 转换 banner 的 image_url 为完整 CDN URL
   *
   * 架构说明：
   * - 数据库存储对象 key（如 popup-banners/xxx.jpg）
   * - API 返回完整 CDN URL（如 https://cdn.example.com/bucket/popup-banners/xxx.jpg）
   *
   * @private
   * @param {Object} banner - banner 对象（plain JSON）
   * @returns {Object} 转换后的 banner 对象
   */
  static _transformBannerImageUrl(banner) {
    if (!banner || !banner.image_url) {
      return banner
    }

    // 将对象 key 转换为完整 CDN URL
    banner.image_url = getImageUrl(banner.image_url)
    return banner
  }
}

// 导出服务类和常量（供路由层使用）
module.exports = PopupBannerService
module.exports.validateImageRatio = validateImageRatio
module.exports.VALID_DISPLAY_MODES = VALID_DISPLAY_MODES
module.exports.BANNER_MAX_FILE_SIZE = BANNER_MAX_FILE_SIZE
module.exports.BANNER_ALLOWED_MIME_TYPES = BANNER_ALLOWED_MIME_TYPES
