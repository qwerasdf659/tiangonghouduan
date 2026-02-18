/**
 * 系统公开配置路由
 *
 * 路由前缀：/api/v4/system/config
 *
 * 功能：
 * - 获取活动位置配置（公开接口，无需登录）
 *
 * 业务场景：
 * - 前端小程序每次打开页面直接调此API获取最新活动位置配置
 * - 后端/Web后台修改配置后，用户下次打开页面立即生效
 * - 前端调用成功后存一份到本地（断网兜底），失败时读上次存的数据
 * - 响应包含 version 字段（基于 updated_at 时间戳），供前端缓存模块对比版本
 *
 * 安全说明：
 * - 位置配置不含敏感信息（仅包含 campaign_code、页面、位置、尺寸、优先级）
 * - 无需 authenticateToken 中间件
 *
 * @see docs/后端与Web管理平台-对接需求总览.md Section 3.3 接口4
 * @date 2026-02-15
 */

'use strict'

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const ServiceManager = require('../../../services')

/**
 * @route GET /api/v4/system/config/placement
 * @desc 获取活动位置配置 - 公开接口（无需登录）
 * @access Public
 *
 * @returns {Object} 活动位置配置列表
 * @returns {Array} data.placements - 位置配置数组
 * @returns {string} data.placements[].campaign_code - 活动代码
 * @returns {Object} data.placements[].placement - 位置配置
 * @returns {string} data.placements[].placement.page - 展示页面（lottery/discover/user）
 * @returns {string} data.placements[].placement.position - 页面位置（main/secondary/floating/top/bottom）
 * @returns {string} data.placements[].placement.size - 组件尺寸（full/medium/small/mini）
 * @returns {number} data.placements[].placement.priority - 排列优先级（0-1000）
 * @returns {string} data.version - 配置版本标识（基于 updated_at 时间戳，前端缓存对比用）
 * @returns {string} data.updated_at - 配置最后更新时间（北京时间）
 *
 * @example
 * GET /api/v4/system/config/placement
 * → { success: true, data: { placements: [...], version: "1739600000000", updated_at: "2025-02-15T12:00:00.000Z" } }
 */
router.get('/placement', async (req, res) => {
  try {
    // 通过 models 获取 SystemConfig（已有模型，含 getByKey 静态方法 + Redis 缓存）
    const { SystemConfig } = req.app.locals.models

    const config = await SystemConfig.getByKey('campaign_placement')

    if (!config || !config.isEnabled()) {
      return res.apiError('配置不存在', 'CONFIG_NOT_FOUND', null, 404)
    }

    const configData = config.getValue()

    /**
     * version 字段：基于 updated_at 时间戳生成的配置版本标识
     * 前端配置缓存模块依赖此字段判断配置是否有更新：
     * - 每次管理后台修改配置 → updated_at 自动变化 → version 随之变化
     * - 前端对比本地缓存的 version 与远端 version，不同则更新本地缓存
     */
    const version = config.updated_at
      ? new Date(config.updated_at).getTime().toString()
      : Date.now().toString()

    return res.apiSuccess(
      {
        placements: configData.placements || [],
        version,
        updated_at: config.updated_at
      },
      '获取配置成功',
      'PLACEMENT_CONFIG_SUCCESS'
    )
  } catch (error) {
    logger.error('获取位置配置失败', { error: error.message, stack: error.stack })
    return res.apiError('获取配置失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/config/product-filter
 * @desc 获取商品筛选配置 - 公开接口（无需登录）
 * @access Public
 *
 * 业务场景：
 * - 前端兑换商品列表页面使用筛选功能时，拉取筛选范围的配置值
 * - 配置内容由运营通过管理后台维护（system_configs 表 config_key = 'product_filter'）
 * - 前端启动时拉取，减少硬编码
 *
 * 数据结构设计依据：
 * - 基于后端已有的 cost_asset_code + cost_amount 字段体系
 * - 筛选区间可按资产类型分组设置
 *
 * @returns {Object} 商品筛选配置
 */
router.get('/product-filter', async (req, res) => {
  try {
    const { SystemConfig } = req.app.locals.models

    const config = await SystemConfig.getByKey('product_filter')

    if (!config || !config.isEnabled()) {
      // 配置不存在时返回默认筛选配置（兜底方案，确保前端不会白屏）
      return res.apiSuccess(
        {
          filter_config: {
            cost_ranges: [
              { label: '全部', min: null, max: null },
              { label: '100以内', min: 0, max: 100 },
              { label: '100-500', min: 100, max: 500 },
              { label: '500-1000', min: 500, max: 1000 },
              { label: '1000以上', min: 1000, max: null }
            ],
            categories: [],
            sort_options: [
              { label: '默认排序', value: 'sort_order' },
              { label: '价格从低到高', value: 'cost_amount_asc' },
              { label: '价格从高到低', value: 'cost_amount_desc' },
              { label: '最新上架', value: 'created_at_desc' },
              { label: '销量最高', value: 'sold_count_desc' }
            ],
            stock_statuses: [
              { label: '全部', value: 'all' },
              { label: '有货', value: 'in_stock' },
              { label: '即将售罄', value: 'low_stock' }
            ]
          },
          is_default: true
        },
        '获取默认筛选配置'
      )
    }

    const configData = config.getValue()

    const version = config.updated_at
      ? new Date(config.updated_at).getTime().toString()
      : Date.now().toString()

    return res.apiSuccess(
      {
        filter_config: configData,
        version,
        updated_at: config.updated_at,
        is_default: false
      },
      '获取筛选配置成功'
    )
  } catch (error) {
    logger.error('获取商品筛选配置失败', { error: error.message, stack: error.stack })
    return res.apiError('获取配置失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/config/feedback
 * @desc 获取反馈表单配置 - 公开接口（无需登录）
 * @access Public
 *
 * 业务场景：
 * - 前端反馈表单页面需要获取类别列表、字段限制等配置
 * - 配置内容优先从 system_configs 表获取（运营可维护）
 * - 如不存在则返回数据库 feedbacks 表 enum 定义导出的默认值
 *
 * @returns {Object} 反馈表单配置
 */
router.get('/feedback', async (req, res) => {
  try {
    const { SystemConfig } = req.app.locals.models

    // 尝试从 system_configs 获取自定义配置
    const config = await SystemConfig.getByKey('feedback_config')

    if (config && config.isEnabled()) {
      const configData = config.getValue()
      const version = config.updated_at
        ? new Date(config.updated_at).getTime().toString()
        : Date.now().toString()

      return res.apiSuccess(
        {
          feedback_config: configData,
          version,
          updated_at: config.updated_at,
          is_default: false
        },
        '获取反馈配置成功'
      )
    }

    // 默认配置：从数据库 feedbacks 表的 enum 定义和业务规则导出
    const defaultConfig = {
      /** 反馈类别（对应 feedbacks.category enum） */
      categories: [
        { value: 'technical', label: '技术问题' },
        { value: 'feature', label: '功能建议' },
        { value: 'bug', label: 'Bug反馈' },
        { value: 'complaint', label: '投诉' },
        { value: 'suggestion', label: '建议' },
        { value: 'other', label: '其他' }
      ],
      /** 优先级选项（对应 feedbacks.priority enum） */
      priorities: [
        { value: 'low', label: '低' },
        { value: 'medium', label: '中' },
        { value: 'high', label: '高' }
      ],
      /** 内容长度限制（feedbacks.content TEXT类型） */
      content_rules: {
        min_length: 10,
        max_length: 500
      },
      /** 附件限制（feedbacks.attachments JSON字段的数组长度限制） */
      attachment_rules: {
        max_images: 5,
        max_file_size: 5 * 1024 * 1024, // 5MB
        allowed_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      }
    }

    return res.apiSuccess(
      {
        feedback_config: defaultConfig,
        is_default: true
      },
      '获取默认反馈配置'
    )
  } catch (error) {
    logger.error('获取反馈表单配置失败', { error: error.message, stack: error.stack })
    return res.apiError('获取配置失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/config
 * @desc 获取系统基础公开配置（含客服联系方式）
 * @access Public（无需登录）
 *
 * @returns {Object} 基础配置
 * @returns {string} data.system_name - 系统名称
 * @returns {string} data.customer_phone - 客服电话
 * @returns {string} data.customer_email - 客服邮箱
 * @returns {string} data.customer_wechat - 客服微信号
 *
 * 业务场景：微信小程序联系客服页面、关于页面等需要读取运营配置的公开信息
 * 数据来源：system_settings 表中 category='basic' 且 is_visible=1 的配置项
 */
router.get('/', async (req, res) => {
  try {
    const AdminSystemService = ServiceManager.get('admin_system')
    const settingsData = await AdminSystemService.getSettingsByCategory('basic')

    const configMap = {}
    for (const s of settingsData) {
      configMap[s.setting_key] = s.setting_value
    }

    return res.apiSuccess(configMap, '获取系统配置成功')
  } catch (error) {
    logger.error('获取系统基础配置失败', { error: error.message })
    return res.apiError('获取配置失败', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
