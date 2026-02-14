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

module.exports = router
