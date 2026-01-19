'use strict'

/**
 * 餐厅积分抽奖系统 V4.0 - 活动定价配置管理服务
 *
 * @description 管理活动级定价配置的 CRUD 和版本管理
 * @module services/LotteryCampaignPricingConfigService
 * @version 1.0.0
 * @date 2026-01-19
 *
 * 业务场景：
 * - 获取活动当前生效的定价配置
 * - 获取活动所有版本的定价配置
 * - 创建新版本定价配置
 * - 激活指定版本定价配置
 * - 归档指定版本定价配置
 *
 * 核心功能：
 * 1. getActivePricingConfig() - 获取活动当前生效配置
 * 2. getAllVersions() - 获取活动所有版本
 * 3. createNewVersion() - 创建新版本
 * 4. activateVersion() - 激活指定版本
 * 5. archiveVersion() - 归档指定版本
 *
 * 设计原则：
 * - **Service层职责**：封装定价配置相关的业务逻辑和数据库操作
 * - **版本化管理**：支持配置版本回滚和历史追溯
 * - **缓存一致性**：配置变更时自动失效活动缓存
 * - **错误处理**：抛出明确的业务错误，由路由层统一处理
 *
 * 数据模型关联：
 * - LotteryCampaignPricingConfig：定价配置表
 * - LotteryCampaign：抽奖活动表
 *
 * 创建时间：2026-01-19
 * 使用模型：Claude Sonnet 4.5
 */

const logger = require('../utils/logger').logger
const { LotteryCampaignPricingConfig, LotteryCampaign } = require('../models')
const BusinessCacheHelper = require('../utils/BusinessCacheHelper')

/**
 * 活动定价配置管理服务类
 *
 * @class LotteryCampaignPricingConfigService
 */
class LotteryCampaignPricingConfigService {
  /**
   * 获取活动当前生效的定价配置
   *
   * @description 获取指定活动当前 status='active' 的定价配置
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Object} [options.transaction] - 事务对象（可选）
   * @returns {Promise<Object|null>} 定价配置对象或 null
   * @throws {Error} 活动不存在等业务错误
   */
  static async getActivePricingConfig(campaign_id, options = {}) {
    const { transaction } = options

    // 验证活动存在
    const campaign = await LotteryCampaign.findByPk(campaign_id, { transaction })
    if (!campaign) {
      const error = new Error(`活动不存在: ${campaign_id}`)
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 获取活跃的定价配置
    const pricing_config = await LotteryCampaignPricingConfig.getActivePricingConfig(campaign_id, {
      transaction
    })

    if (!pricing_config) {
      logger.info('活动暂无定价配置', { campaign_id })
      return null
    }

    // 构建响应数据（包含计算属性）
    return {
      config_id: pricing_config.config_id,
      campaign_id: pricing_config.campaign_id,
      campaign_code: campaign.campaign_code,
      version: pricing_config.version,
      pricing_config: pricing_config.pricing_config,
      status: pricing_config.status,
      status_display: pricing_config.getStatusDisplayName(),
      effective_at: pricing_config.effective_at,
      expired_at: pricing_config.expired_at,
      is_effective: pricing_config.isEffective(),
      enabled_draw_counts: pricing_config.getEnabledDrawCounts(),
      created_by: pricing_config.created_by,
      updated_by: pricing_config.updated_by,
      created_at: pricing_config.created_at,
      updated_at: pricing_config.updated_at
    }
  }

  /**
   * 获取活动所有版本的定价配置
   *
   * @description 获取指定活动的所有定价配置版本（按版本号降序）
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Object} [options.transaction] - 事务对象（可选）
   * @returns {Promise<Object>} 包含版本列表和总数的对象
   * @throws {Error} 活动不存在等业务错误
   */
  static async getAllVersions(campaign_id, options = {}) {
    const { transaction } = options

    // 验证活动存在
    const campaign = await LotteryCampaign.findByPk(campaign_id, { transaction })
    if (!campaign) {
      const error = new Error(`活动不存在: ${campaign_id}`)
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 获取所有版本
    const versions = await LotteryCampaignPricingConfig.getAllVersions(campaign_id, { transaction })

    // 转换为响应格式
    const versions_data = versions.map(v => ({
      config_id: v.config_id,
      version: v.version,
      status: v.status,
      status_display: v.getStatusDisplayName(),
      is_effective: v.isEffective(),
      effective_at: v.effective_at,
      expired_at: v.expired_at,
      created_by: v.created_by,
      created_at: v.created_at
    }))

    return {
      campaign_id: parseInt(campaign_id, 10),
      campaign_code: campaign.campaign_code,
      versions: versions_data,
      total: versions_data.length
    }
  }

  /**
   * 创建新版本定价配置
   *
   * @description 为活动创建新版本的定价配置，版本号自动递增
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} pricing_config - 定价配置 JSON
   * @param {number} created_by - 创建人用户ID
   * @param {Object} options - 操作选项
   * @param {boolean} [options.activate_immediately=false] - 是否立即激活
   * @param {Object} [options.transaction] - 事务对象（可选）
   * @returns {Promise<Object>} 新创建的配置对象
   * @throws {Error} 活动不存在、配置格式错误等业务错误
   */
  static async createNewVersion(campaign_id, pricing_config, created_by, options = {}) {
    const { activate_immediately = false, transaction } = options

    // 验证活动存在
    const campaign = await LotteryCampaign.findByPk(campaign_id, { transaction })
    if (!campaign) {
      const error = new Error(`活动不存在: ${campaign_id}`)
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 验证配置格式
    const validation = LotteryCampaignPricingConfig.validatePricingConfig(pricing_config)
    if (!validation.valid) {
      const error = new Error(`定价配置格式错误: ${validation.errors.join(', ')}`)
      error.code = 'INVALID_PRICING_CONFIG'
      error.statusCode = 400
      error.details = { errors: validation.errors }
      throw error
    }

    // 创建新版本
    const new_config = await LotteryCampaignPricingConfig.createNewVersion(
      campaign_id,
      pricing_config,
      created_by,
      { transaction }
    )

    logger.info('创建新版本定价配置成功', {
      campaign_id,
      config_id: new_config.config_id,
      version: new_config.version,
      created_by
    })

    // 如果需要立即激活
    if (activate_immediately) {
      await LotteryCampaignPricingConfig.activateVersion(
        campaign_id,
        new_config.version,
        created_by,
        { transaction }
      )

      // 失效活动缓存
      await BusinessCacheHelper.invalidateLotteryCampaign(campaign_id)

      logger.info('新版本已激活', {
        campaign_id,
        version: new_config.version
      })
    }

    return {
      config_id: new_config.config_id,
      campaign_id: new_config.campaign_id,
      version: new_config.version,
      status: activate_immediately ? 'active' : new_config.status,
      pricing_config: new_config.pricing_config,
      created_at: new_config.created_at,
      activated: activate_immediately
    }
  }

  /**
   * 激活指定版本的定价配置
   *
   * @description 将指定版本设为 active，其他版本设为 archived
   *
   * @param {number} campaign_id - 活动ID
   * @param {number} version - 要激活的版本号
   * @param {number} updated_by - 操作人用户ID
   * @param {Object} options - 操作选项
   * @param {Object} [options.transaction] - 事务对象（可选）
   * @returns {Promise<Object>} 激活后的配置对象
   * @throws {Error} 活动不存在、版本不存在等业务错误
   */
  static async activateVersion(campaign_id, version, updated_by, options = {}) {
    const { transaction } = options

    // 验证活动存在
    const campaign = await LotteryCampaign.findByPk(campaign_id, { transaction })
    if (!campaign) {
      const error = new Error(`活动不存在: ${campaign_id}`)
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 激活指定版本（模型层方法会处理版本不存在的情况）
    const result = await LotteryCampaignPricingConfig.activateVersion(
      campaign_id,
      version,
      updated_by,
      { transaction }
    )

    // 失效活动缓存
    await BusinessCacheHelper.invalidateLotteryCampaign(campaign_id)

    logger.info('激活定价配置版本成功', {
      campaign_id,
      version,
      config_id: result.config_id,
      updated_by
    })

    return {
      campaign_id: parseInt(campaign_id, 10),
      activated_version: result.version,
      config_id: result.config_id,
      status: result.status,
      effective_at: result.effective_at
    }
  }

  /**
   * 归档指定版本的定价配置
   *
   * @description 将指定版本设为 archived（不影响其他版本）
   *
   * @param {number} campaign_id - 活动ID
   * @param {number} version - 要归档的版本号
   * @param {number} updated_by - 操作人用户ID
   * @param {Object} options - 操作选项
   * @param {Object} [options.transaction] - 事务对象（可选）
   * @returns {Promise<Object>} 归档后的配置信息
   * @throws {Error} 版本不存在、尝试归档激活版本等业务错误
   */
  static async archiveVersion(campaign_id, version, updated_by, options = {}) {
    const { transaction } = options

    // 查找目标版本
    const config = await LotteryCampaignPricingConfig.findOne({
      where: {
        campaign_id,
        version: parseInt(version, 10)
      },
      transaction
    })

    if (!config) {
      const error = new Error(`版本不存在: ${version}`)
      error.code = 'VERSION_NOT_FOUND'
      error.statusCode = 404
      error.details = { campaign_id, version }
      throw error
    }

    // 检查是否为当前激活版本
    if (config.status === 'active') {
      const error = new Error('无法归档当前激活的版本，请先激活其他版本')
      error.code = 'CANNOT_ARCHIVE_ACTIVE_VERSION'
      error.statusCode = 400
      throw error
    }

    // 更新为归档状态
    await config.update(
      {
        status: 'archived',
        updated_by
      },
      { transaction }
    )

    logger.info('归档定价配置版本成功', {
      campaign_id,
      version,
      config_id: config.config_id,
      updated_by
    })

    return {
      campaign_id: parseInt(campaign_id, 10),
      archived_version: parseInt(version, 10),
      config_id: config.config_id,
      status: 'archived'
    }
  }

  /**
   * 回滚到指定版本的定价配置
   *
   * @description 将配置回滚到历史版本（创建新版本副本并激活）
   *
   * 业务逻辑：
   * 1. 验证目标版本存在且为已归档状态
   * 2. 复制目标版本的 pricing_config 创建新版本
   * 3. 激活新版本
   * 4. 记录回滚原因（便于审计追溯）
   *
   * 为什么不直接激活历史版本？
   * - 保持版本递增的不可变性（版本号单调递增）
   * - 避免历史版本被意外修改
   * - 便于审计追溯（新版本记录了回滚来源）
   *
   * @param {number} campaign_id - 活动ID
   * @param {number} target_version - 要回滚到的目标版本号
   * @param {number} updated_by - 操作人用户ID
   * @param {string} [rollback_reason=''] - 回滚原因（用于审计）
   * @param {Object} options - 操作选项
   * @param {Object} [options.transaction] - 事务对象（可选）
   * @returns {Promise<Object>} 回滚结果（包含新版本信息）
   * @throws {Error} 版本不存在、尝试回滚到当前激活版本等业务错误
   */
  static async rollbackToVersion(
    campaign_id,
    target_version,
    updated_by,
    rollback_reason = '',
    options = {}
  ) {
    const { transaction } = options

    // 1. 验证活动存在
    const campaign = await LotteryCampaign.findByPk(campaign_id, { transaction })
    if (!campaign) {
      const error = new Error(`活动不存在: ${campaign_id}`)
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 2. 查找目标版本
    const target_config = await LotteryCampaignPricingConfig.findOne({
      where: {
        campaign_id,
        version: parseInt(target_version, 10)
      },
      transaction
    })

    if (!target_config) {
      const error = new Error(`目标版本不存在: ${target_version}`)
      error.code = 'VERSION_NOT_FOUND'
      error.statusCode = 404
      error.details = { campaign_id, target_version }
      throw error
    }

    // 3. 检查是否为当前激活版本（无需回滚）
    if (target_config.status === 'active') {
      const error = new Error('目标版本已是当前激活版本，无需回滚')
      error.code = 'ALREADY_ACTIVE_VERSION'
      error.statusCode = 400
      throw error
    }

    // 4. 复制目标版本的配置创建新版本（添加回滚元数据）
    const pricing_config_with_metadata = {
      ...target_config.pricing_config,
      _rollback_metadata: {
        rollback_from_version: target_version,
        rollback_reason: rollback_reason || '管理员手动回滚',
        rollback_at: new Date().toISOString(),
        rollback_by: updated_by
      }
    }

    // 5. 创建新版本（直接激活）
    const new_config = await LotteryCampaignPricingConfig.createNewVersion(
      campaign_id,
      pricing_config_with_metadata,
      updated_by,
      { transaction, status: 'draft' }
    )

    // 6. 激活新版本
    await LotteryCampaignPricingConfig.activateVersion(
      campaign_id,
      new_config.version,
      updated_by,
      { transaction }
    )

    // 7. 失效活动缓存
    await BusinessCacheHelper.invalidateLotteryCampaign(campaign_id)

    logger.info('定价配置回滚成功', {
      campaign_id,
      rollback_from_version: target_version,
      new_version: new_config.version,
      config_id: new_config.config_id,
      rollback_reason,
      updated_by
    })

    return {
      campaign_id: parseInt(campaign_id, 10),
      rollback_from_version: parseInt(target_version, 10),
      new_version: new_config.version,
      new_config_id: new_config.config_id,
      status: 'active',
      rollback_reason: rollback_reason || '管理员手动回滚'
    }
  }

  /**
   * 设置版本定时生效
   *
   * @description 将指定版本设为 scheduled 状态，到达 effective_at 时间后自动激活
   *
   * 业务逻辑：
   * 1. 验证目标版本存在且为 draft 或 archived 状态
   * 2. 验证 effective_at 时间在未来
   * 3. 更新版本状态为 scheduled 并设置 effective_at
   * 4. 定时任务会在 effective_at 时间后自动激活此版本
   *
   * @param {number} campaign_id - 活动ID
   * @param {number} version - 要设置定时生效的版本号
   * @param {string} effective_at - 生效时间（ISO8601 格式，北京时间）
   * @param {number} updated_by - 操作人用户ID
   * @param {Object} options - 操作选项
   * @param {Object} [options.transaction] - 事务对象（可选）
   * @returns {Promise<Object>} 设置结果
   * @throws {Error} 版本不存在、时间无效等业务错误
   */
  static async scheduleActivation(campaign_id, version, effective_at, updated_by, options = {}) {
    const { transaction } = options

    // 1. 验证活动存在
    const campaign = await LotteryCampaign.findByPk(campaign_id, { transaction })
    if (!campaign) {
      const error = new Error(`活动不存在: ${campaign_id}`)
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 2. 查找目标版本
    const config = await LotteryCampaignPricingConfig.findOne({
      where: {
        campaign_id,
        version: parseInt(version, 10)
      },
      transaction
    })

    if (!config) {
      const error = new Error(`版本不存在: ${version}`)
      error.code = 'VERSION_NOT_FOUND'
      error.statusCode = 404
      error.details = { campaign_id, version }
      throw error
    }

    // 3. 检查版本状态（仅允许 draft 或 archived 状态设置定时生效）
    if (config.status === 'active') {
      const error = new Error('当前激活版本无需设置定时生效')
      error.code = 'ALREADY_ACTIVE_VERSION'
      error.statusCode = 400
      throw error
    }

    // 4. 验证生效时间在未来
    const effective_date = new Date(effective_at)
    if (isNaN(effective_date.getTime())) {
      const error = new Error('生效时间格式无效，请使用 ISO8601 格式')
      error.code = 'INVALID_EFFECTIVE_TIME'
      error.statusCode = 400
      throw error
    }

    if (effective_date <= new Date()) {
      const error = new Error('生效时间必须在当前时间之后')
      error.code = 'EFFECTIVE_TIME_IN_PAST'
      error.statusCode = 400
      throw error
    }

    // 5. 更新版本状态为 scheduled
    await config.update(
      {
        status: 'scheduled',
        effective_at: effective_date,
        updated_by
      },
      { transaction }
    )

    logger.info('设置定价配置定时生效成功', {
      campaign_id,
      version,
      config_id: config.config_id,
      effective_at: effective_date.toISOString(),
      updated_by
    })

    return {
      campaign_id: parseInt(campaign_id, 10),
      scheduled_version: parseInt(version, 10),
      config_id: config.config_id,
      status: 'scheduled',
      effective_at: effective_date.toISOString()
    }
  }

  /**
   * 取消定时生效
   *
   * @description 将 scheduled 状态的版本恢复为 draft 状态
   *
   * @param {number} campaign_id - 活动ID
   * @param {number} version - 要取消定时生效的版本号
   * @param {number} updated_by - 操作人用户ID
   * @param {Object} options - 操作选项
   * @param {Object} [options.transaction] - 事务对象（可选）
   * @returns {Promise<Object>} 取消结果
   * @throws {Error} 版本不存在、状态不是 scheduled 等业务错误
   */
  static async cancelScheduledActivation(campaign_id, version, updated_by, options = {}) {
    const { transaction } = options

    // 查找目标版本
    const config = await LotteryCampaignPricingConfig.findOne({
      where: {
        campaign_id,
        version: parseInt(version, 10)
      },
      transaction
    })

    if (!config) {
      const error = new Error(`版本不存在: ${version}`)
      error.code = 'VERSION_NOT_FOUND'
      error.statusCode = 404
      error.details = { campaign_id, version }
      throw error
    }

    // 检查是否为 scheduled 状态
    if (config.status !== 'scheduled') {
      const error = new Error('只能取消 scheduled 状态的版本')
      error.code = 'NOT_SCHEDULED_VERSION'
      error.statusCode = 400
      throw error
    }

    // 更新为 draft 状态
    await config.update(
      {
        status: 'draft',
        effective_at: null,
        updated_by
      },
      { transaction }
    )

    logger.info('取消定价配置定时生效成功', {
      campaign_id,
      version,
      config_id: config.config_id,
      updated_by
    })

    return {
      campaign_id: parseInt(campaign_id, 10),
      cancelled_version: parseInt(version, 10),
      config_id: config.config_id,
      status: 'draft'
    }
  }

  /**
   * 处理到期的定时生效配置（供定时任务调用）
   *
   * @description 查找所有 scheduled 且 effective_at <= NOW() 的配置，依次激活
   *
   * 业务逻辑：
   * 1. 查询所有需要激活的 scheduled 配置
   * 2. 按 campaign_id 分组，每个活动只激活最新版本
   * 3. 激活配置并失效缓存
   *
   * @returns {Promise<Object>} 处理结果（激活数量、失败数量）
   */
  static async processScheduledActivations() {
    const now = new Date()

    // 查找所有需要激活的 scheduled 配置
    const scheduled_configs = await LotteryCampaignPricingConfig.findAll({
      where: {
        status: 'scheduled',
        effective_at: { [require('sequelize').Op.lte]: now }
      },
      order: [
        ['campaign_id', 'ASC'],
        ['version', 'DESC']
      ]
    })

    if (scheduled_configs.length === 0) {
      logger.debug('无需要处理的定时生效配置')
      return { processed: 0, activated: 0, failed: 0 }
    }

    logger.info('开始处理定时生效配置', { count: scheduled_configs.length })

    // 按 campaign_id 分组（每个活动只激活最新版本）
    const campaign_config_map = new Map()
    for (const config of scheduled_configs) {
      if (!campaign_config_map.has(config.campaign_id)) {
        campaign_config_map.set(config.campaign_id, config)
      }
    }

    let activated = 0
    let failed = 0

    for (const [campaign_id, config] of campaign_config_map) {
      try {
        // 激活版本
        await LotteryCampaignPricingConfig.activateVersion(
          campaign_id,
          config.version,
          config.created_by // 使用创建者作为激活者
        )

        // 失效缓存
        await BusinessCacheHelper.invalidateLotteryCampaign(campaign_id)

        logger.info('定时生效配置已激活', {
          campaign_id,
          version: config.version,
          config_id: config.config_id,
          effective_at: config.effective_at
        })

        activated++
      } catch (error) {
        logger.error('定时生效配置激活失败', {
          campaign_id,
          version: config.version,
          config_id: config.config_id,
          error: error.message
        })
        failed++
      }
    }

    // 归档其他同活动的 scheduled 版本（被跳过的旧版本）
    const skipped_configs = scheduled_configs.filter(
      c =>
        !campaign_config_map.get(c.campaign_id) ||
        campaign_config_map.get(c.campaign_id).config_id !== c.config_id
    )

    for (const config of skipped_configs) {
      try {
        await config.update({ status: 'archived' })
        logger.info('跳过的定时版本已归档', {
          campaign_id: config.campaign_id,
          version: config.version,
          reason: '同活动有更新版本已激活'
        })
      } catch (error) {
        logger.warn('归档跳过版本失败', {
          config_id: config.config_id,
          error: error.message
        })
      }
    }

    return {
      processed: scheduled_configs.length,
      activated,
      failed,
      skipped: skipped_configs.length
    }
  }
}

module.exports = LotteryCampaignPricingConfigService
