/**
 * 市场挂牌管理服务（AdminService）
 *
 * V4.7.0 大文件拆分方案 Phase 2（2026-01-31）
 * 从 MarketListingService.js (2295行) 拆分
 *
 * 职责：
 * - 止损措施（暂停/恢复资产挂牌）
 * - 资产挂牌状态检查
 * - 管理员操作
 *
 * @module services/market-listing/AdminService
 */

const logger = require('../../utils/logger').logger

/**
 * 市场挂牌管理服务类
 *
 * @class MarketListingAdminService
 * @description 挂牌域管理服务（止损能力）
 */
class MarketListingAdminService {
  /**
   * 暂停指定资产的新挂单（止损措施）
   *
   * 业务场景：
   * - 孤儿冻结检测任务发现 P0 级别异常时触发
   * - 暂时禁止该资产的新挂牌，防止异常扩大化
   *
   * @param {string} asset_code - 资产代码
   * @param {Object} options - 配置选项
   * @param {string} options.reason - 暂停原因（必填）
   * @param {number} [options.duration_hours=24] - 暂停时长（小时）
   * @param {number} [options.operator_id] - 操作者ID
   * @returns {Promise<Object>} 暂停结果
   */
  static async pauseListingForAsset(asset_code, options = {}) {
    const { reason, duration_hours = 24, operator_id } = options

    if (!asset_code) {
      throw new Error('资产代码（asset_code）不能为空')
    }

    if (!reason) {
      throw new Error('暂停原因（reason）不能为空')
    }

    const { SystemSetting } = require('../../models')

    // 1. 获取当前已暂停的资产列表
    const settingKey = 'marketplace/paused_assets'
    let pausedAssets = {}

    const existingSetting = await SystemSetting.findOne({
      where: { setting_key: settingKey }
    })

    if (existingSetting && existingSetting.setting_value) {
      try {
        pausedAssets = JSON.parse(existingSetting.setting_value)
      } catch {
        logger.warn('[MarketListingAdminService] 解析暂停资产配置失败，使用空对象')
        pausedAssets = {}
      }
    }

    // 2. 添加/更新暂停记录
    const pauseInfo = {
      paused_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + duration_hours * 60 * 60 * 1000).toISOString(),
      reason,
      operator_id: operator_id || 'SYSTEM_ORPHAN_FROZEN_CHECK',
      duration_hours
    }

    pausedAssets[asset_code] = pauseInfo

    // 3. 保存配置
    if (existingSetting) {
      await existingSetting.update({
        setting_value: JSON.stringify(pausedAssets)
      })
    } else {
      await SystemSetting.create({
        setting_key: settingKey,
        setting_value: JSON.stringify(pausedAssets),
        setting_type: 'json',
        category: 'marketplace',
        description: '暂停挂牌的资产列表（止损用）',
        is_public: false
      })
    }

    // 4. 记录审计日志
    const AuditLogService = require('../AuditLogService')
    await AuditLogService.logOperation({
      operator_id: operator_id || 0,
      operation_type: 'system_config',
      target_type: 'SystemSetting',
      target_id: settingKey,
      action: 'pause_asset_listing',
      before_data: existingSetting
        ? { paused_assets: JSON.parse(existingSetting.setting_value || '{}') }
        : {},
      after_data: { paused_assets: pausedAssets },
      reason,
      is_critical_operation: true
    })

    logger.warn(`[MarketListingAdminService] 已暂停资产 ${asset_code} 的新挂单`, {
      asset_code,
      reason,
      duration_hours,
      expires_at: pauseInfo.expires_at
    })

    return {
      asset_code,
      paused: true,
      pause_info: pauseInfo
    }
  }

  /**
   * 恢复指定资产的挂单功能
   *
   * @param {string} asset_code - 资产代码
   * @param {Object} options - 配置选项
   * @param {string} options.reason - 恢复原因
   * @param {number} [options.operator_id] - 操作者ID
   * @returns {Promise<Object>} 恢复结果
   */
  static async resumeListingForAsset(asset_code, options = {}) {
    const { reason = '手动恢复', operator_id } = options

    if (!asset_code) {
      throw new Error('资产代码（asset_code）不能为空')
    }

    const { SystemSetting } = require('../../models')

    const settingKey = 'marketplace/paused_assets'
    const existingSetting = await SystemSetting.findOne({
      where: { setting_key: settingKey }
    })

    if (!existingSetting || !existingSetting.setting_value) {
      logger.info(`[MarketListingAdminService] 资产 ${asset_code} 未被暂停，无需恢复`)
      return { asset_code, resumed: false, reason: 'not_paused' }
    }

    let pausedAssets = {}
    try {
      pausedAssets = JSON.parse(existingSetting.setting_value)
    } catch {
      pausedAssets = {}
    }

    if (!pausedAssets[asset_code]) {
      logger.info(`[MarketListingAdminService] 资产 ${asset_code} 未被暂停，无需恢复`)
      return { asset_code, resumed: false, reason: 'not_paused' }
    }

    // 记录恢复前状态
    const beforeData = { ...pausedAssets }

    // 移除暂停记录
    delete pausedAssets[asset_code]

    await existingSetting.update({
      setting_value: JSON.stringify(pausedAssets)
    })

    // 记录审计日志
    const AuditLogService = require('../AuditLogService')
    await AuditLogService.logOperation({
      operator_id: operator_id || 0,
      operation_type: 'system_config',
      target_type: 'SystemSetting',
      target_id: settingKey,
      action: 'resume_asset_listing',
      before_data: { paused_assets: beforeData },
      after_data: { paused_assets: pausedAssets },
      reason,
      is_critical_operation: true
    })

    logger.info(`[MarketListingAdminService] 已恢复资产 ${asset_code} 的挂单功能`, {
      asset_code,
      reason
    })

    return {
      asset_code,
      resumed: true,
      reason
    }
  }

  /**
   * 检查资产是否被暂停挂单
   *
   * @param {string} asset_code - 资产代码
   * @returns {Promise<Object>} 检查结果 { is_paused, pause_info }
   */
  static async isAssetListingPaused(asset_code) {
    const { SystemSetting } = require('../../models')

    const settingKey = 'marketplace/paused_assets'
    const existingSetting = await SystemSetting.findOne({
      where: { setting_key: settingKey }
    })

    if (!existingSetting || !existingSetting.setting_value) {
      return { is_paused: false, pause_info: null }
    }

    let pausedAssets = {}
    try {
      pausedAssets = JSON.parse(existingSetting.setting_value)
    } catch {
      return { is_paused: false, pause_info: null }
    }

    const pauseInfo = pausedAssets[asset_code]

    if (!pauseInfo) {
      return { is_paused: false, pause_info: null }
    }

    // 检查是否已过期
    if (pauseInfo.expires_at && new Date(pauseInfo.expires_at) < new Date()) {
      // 自动清理过期记录
      delete pausedAssets[asset_code]
      await existingSetting.update({
        setting_value: JSON.stringify(pausedAssets)
      })
      logger.info(`[MarketListingAdminService] 资产 ${asset_code} 暂停已过期，自动恢复`)
      return { is_paused: false, pause_info: null, expired: true }
    }

    return {
      is_paused: true,
      pause_info: pauseInfo
    }
  }

  /**
   * 获取所有暂停的资产列表
   *
   * @returns {Promise<Object>} 暂停资产列表
   */
  static async getPausedAssets() {
    const { SystemSetting } = require('../../models')

    const settingKey = 'marketplace/paused_assets'
    const existingSetting = await SystemSetting.findOne({
      where: { setting_key: settingKey }
    })

    if (!existingSetting || !existingSetting.setting_value) {
      return { paused_assets: {}, count: 0 }
    }

    let pausedAssets = {}
    try {
      pausedAssets = JSON.parse(existingSetting.setting_value)
    } catch {
      pausedAssets = {}
    }

    // 清理已过期的暂停记录
    const now = new Date()
    let hasExpired = false
    for (const [assetCode, info] of Object.entries(pausedAssets)) {
      if (info.expires_at && new Date(info.expires_at) < now) {
        delete pausedAssets[assetCode]
        hasExpired = true
        logger.info(`[MarketListingAdminService] 资产 ${assetCode} 暂停已过期，自动清理`)
      }
    }

    // 如果有过期记录，更新数据库
    if (hasExpired) {
      await existingSetting.update({
        setting_value: JSON.stringify(pausedAssets)
      })
    }

    return {
      paused_assets: pausedAssets,
      count: Object.keys(pausedAssets).length
    }
  }
}

module.exports = MarketListingAdminService
