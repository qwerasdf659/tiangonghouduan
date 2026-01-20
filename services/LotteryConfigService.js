/**
 * @file 抽奖策略配置管理服务（LotteryConfigService）
 * @description 管理抽奖策略配置表的CRUD操作
 *
 * 管理的配置表：
 * - lottery_strategy_config：抽奖策略全局配置表
 * - lottery_tier_matrix_config：BxPx矩阵配置表
 *
 * 服务层职责：
 * 1. 封装数据库操作，提供业务语义化API
 * 2. 处理业务逻辑（如配置优先级、有效期验证等）
 * 3. 支持事务管理（通过options.transaction传入）
 *
 * 业务约束：
 * - 策略配置使用 config_group + config_key + priority 作为唯一标识
 * - 矩阵配置使用 budget_tier + pressure_tier 作为唯一标识
 * - 所有写操作需要管理员权限（路由层控制）
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const logger = require('../utils/logger').logger

/**
 * 抽奖策略配置管理服务类
 *
 * @class LotteryConfigService
 */
class LotteryConfigService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.LotteryStrategyConfig = models.LotteryStrategyConfig
    this.LotteryTierMatrixConfig = models.LotteryTierMatrixConfig
  }

  /*
   * =============================================================================
   * LotteryStrategyConfig（策略全局配置）方法
   * =============================================================================
   */

  /**
   * 获取策略配置列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.config_group] - 配置分组筛选
   * @param {boolean} [options.is_active] - 是否启用筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 包含列表和分页信息的对象
   */
  async getStrategyConfigs(options = {}) {
    try {
      const { config_group, is_active, page = 1, page_size = 20 } = options

      const where = {}
      if (config_group) {
        where.config_group = config_group
      }
      if (typeof is_active === 'boolean') {
        where.is_active = is_active
      }

      const { count, rows } = await this.LotteryStrategyConfig.findAndCountAll({
        where,
        order: [
          ['config_group', 'ASC'],
          ['priority', 'DESC'],
          ['config_key', 'ASC']
        ],
        offset: (page - 1) * page_size,
        limit: page_size
      })

      return {
        list: rows.map(row => ({
          ...row.toJSON(),
          parsed_value: row.getParsedValue() // 解析后的配置值
        })),
        pagination: {
          total_count: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('获取策略配置列表失败:', error)
      throw error
    }
  }

  /**
   * 根据配置分组获取所有配置
   *
   * @param {string} config_group - 配置分组
   * @returns {Promise<Object>} 配置键值对象
   */
  async getConfigByGroup(config_group) {
    try {
      return await this.LotteryStrategyConfig.getConfigByGroup(config_group)
    } catch (error) {
      logger.error(`获取配置分组[${config_group}]失败:`, error)
      throw error
    }
  }

  /**
   * 获取所有分组的完整配置
   *
   * @returns {Promise<Object>} 按分组组织的配置对象
   */
  async getAllConfig() {
    try {
      return await this.LotteryStrategyConfig.getAllConfig()
    } catch (error) {
      logger.error('获取所有配置失败:', error)
      throw error
    }
  }

  /**
   * 获取单个策略配置详情
   *
   * @param {number} strategy_config_id - 配置ID
   * @returns {Promise<Object>} 配置详情
   */
  async getStrategyConfigById(strategy_config_id) {
    try {
      const config = await this.LotteryStrategyConfig.findByPk(strategy_config_id, {
        include: [
          { association: 'creator', attributes: ['user_id', 'nickname'] },
          { association: 'updater', attributes: ['user_id', 'nickname'] }
        ]
      })

      if (!config) {
        const error = new Error(`策略配置 ID ${strategy_config_id} 不存在`)
        error.status = 404
        error.code = 'STRATEGY_CONFIG_NOT_FOUND'
        throw error
      }

      return {
        ...config.toJSON(),
        parsed_value: config.getParsedValue(),
        is_effective: config.isEffective()
      }
    } catch (error) {
      logger.error(`获取策略配置详情[${strategy_config_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 创建策略配置
   *
   * @param {Object} data - 配置数据
   * @param {string} data.config_group - 配置分组
   * @param {string} data.config_key - 配置键名
   * @param {*} data.config_value - 配置值
   * @param {string} [data.description] - 配置描述
   * @param {number} [data.priority=0] - 优先级
   * @param {Date} [data.effective_start] - 生效开始时间
   * @param {Date} [data.effective_end] - 生效结束时间
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 创建的配置
   */
  async createStrategyConfig(data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const {
        config_group,
        config_key,
        config_value,
        description,
        priority = 0,
        effective_start,
        effective_end
      } = data

      // 检查唯一性约束
      const existing = await this.LotteryStrategyConfig.findOne({
        where: { config_group, config_key, priority },
        transaction
      })

      if (existing) {
        const error = new Error(`配置已存在: ${config_group}.${config_key} (优先级 ${priority})`)
        error.status = 409
        error.code = 'STRATEGY_CONFIG_EXISTS'
        throw error
      }

      // 检测值类型
      const value_type = this.LotteryStrategyConfig.detectValueType(config_value)

      const newConfig = await this.LotteryStrategyConfig.create(
        {
          config_group,
          config_key,
          config_value: typeof config_value === 'object' ? config_value : config_value,
          value_type,
          description,
          priority,
          effective_start,
          effective_end,
          is_active: true,
          created_by: admin_id,
          updated_by: admin_id
        },
        { transaction }
      )

      logger.info(`管理员 ${admin_id} 创建策略配置成功`, {
        strategy_config_id: newConfig.strategy_config_id,
        config_group,
        config_key,
        priority
      })

      return {
        ...newConfig.toJSON(),
        parsed_value: newConfig.getParsedValue()
      }
    } catch (error) {
      logger.error('创建策略配置失败:', error)
      throw error
    }
  }

  /**
   * 更新策略配置
   *
   * @param {number} strategy_config_id - 配置ID
   * @param {Object} data - 更新数据
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新后的配置
   */
  async updateStrategyConfig(strategy_config_id, data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const config = await this.LotteryStrategyConfig.findByPk(strategy_config_id, {
        transaction
      })

      if (!config) {
        const error = new Error(`策略配置 ID ${strategy_config_id} 不存在`)
        error.status = 404
        error.code = 'STRATEGY_CONFIG_NOT_FOUND'
        throw error
      }

      const updateData = {
        updated_by: admin_id
      }

      // 仅更新提供的字段
      if (data.config_value !== undefined) {
        updateData.config_value =
          typeof data.config_value === 'object' ? data.config_value : data.config_value
        updateData.value_type = this.LotteryStrategyConfig.detectValueType(data.config_value)
      }
      if (data.description !== undefined) updateData.description = data.description
      if (data.is_active !== undefined) updateData.is_active = data.is_active
      if (data.effective_start !== undefined) updateData.effective_start = data.effective_start
      if (data.effective_end !== undefined) updateData.effective_end = data.effective_end

      await config.update(updateData, { transaction })

      logger.info(`管理员 ${admin_id} 更新策略配置成功`, {
        strategy_config_id,
        updated_fields: Object.keys(updateData).filter(k => k !== 'updated_by')
      })

      return {
        ...config.toJSON(),
        parsed_value: config.getParsedValue()
      }
    } catch (error) {
      logger.error(`更新策略配置[${strategy_config_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 删除策略配置
   *
   * @param {number} strategy_config_id - 配置ID
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async deleteStrategyConfig(strategy_config_id, admin_id, options = {}) {
    const { transaction } = options

    try {
      const config = await this.LotteryStrategyConfig.findByPk(strategy_config_id, {
        transaction
      })

      if (!config) {
        const error = new Error(`策略配置 ID ${strategy_config_id} 不存在`)
        error.status = 404
        error.code = 'STRATEGY_CONFIG_NOT_FOUND'
        throw error
      }

      const configInfo = {
        config_group: config.config_group,
        config_key: config.config_key,
        priority: config.priority
      }

      await config.destroy({ transaction })

      logger.info(`管理员 ${admin_id} 删除策略配置成功`, {
        strategy_config_id,
        ...configInfo
      })
    } catch (error) {
      logger.error(`删除策略配置[${strategy_config_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 批量更新或创建策略配置
   *
   * @param {string} config_group - 配置分组
   * @param {Object} configs - 配置键值对 { key: value }
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 操作结果
   */
  async upsertConfigGroup(config_group, configs, admin_id, options = {}) {
    const { transaction } = options

    try {
      const results = []

      for (const [config_key, config_value] of Object.entries(configs)) {
        const config = await this.LotteryStrategyConfig.upsertConfig(
          config_group,
          config_key,
          config_value,
          {
            updated_by: admin_id,
            transaction
          }
        )
        results.push({
          config_key,
          strategy_config_id: config.strategy_config_id
        })
      }

      logger.info(`管理员 ${admin_id} 批量更新配置分组 ${config_group} 成功`, {
        config_count: results.length
      })

      return {
        config_group,
        updated_configs: results
      }
    } catch (error) {
      logger.error(`批量更新配置分组[${config_group}]失败:`, error)
      throw error
    }
  }

  /*
   * =============================================================================
   * LotteryTierMatrixConfig（BxPx矩阵配置）方法
   * =============================================================================
   */

  /**
   * 获取矩阵配置列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.budget_tier] - 预算层级筛选
   * @param {boolean} [options.is_active] - 是否启用筛选
   * @returns {Promise<Object>} 包含列表的对象
   */
  async getMatrixConfigs(options = {}) {
    try {
      const { budget_tier, is_active } = options

      const where = {}
      if (budget_tier) {
        where.budget_tier = budget_tier
      }
      if (typeof is_active === 'boolean') {
        where.is_active = is_active
      }

      const rows = await this.LotteryTierMatrixConfig.findAll({
        where,
        order: [
          ['budget_tier', 'ASC'],
          ['pressure_tier', 'ASC']
        ]
      })

      return {
        list: rows.map(row => row.getFormattedConfig()),
        total_count: rows.length
      }
    } catch (error) {
      logger.error('获取矩阵配置列表失败:', error)
      throw error
    }
  }

  /**
   * 获取完整的BxPx矩阵
   *
   * @returns {Promise<Object>} 矩阵配置对象
   */
  async getFullMatrix() {
    try {
      return await this.LotteryTierMatrixConfig.getFullMatrix()
    } catch (error) {
      logger.error('获取完整矩阵失败:', error)
      throw error
    }
  }

  /**
   * 获取单个矩阵配置详情
   *
   * @param {number} matrix_config_id - 配置ID
   * @returns {Promise<Object>} 配置详情
   */
  async getMatrixConfigById(matrix_config_id) {
    try {
      const config = await this.LotteryTierMatrixConfig.findByPk(matrix_config_id, {
        include: [
          { association: 'creator', attributes: ['user_id', 'nickname'] },
          { association: 'updater', attributes: ['user_id', 'nickname'] }
        ]
      })

      if (!config) {
        const error = new Error(`矩阵配置 ID ${matrix_config_id} 不存在`)
        error.status = 404
        error.code = 'MATRIX_CONFIG_NOT_FOUND'
        throw error
      }

      return config.getFormattedConfig()
    } catch (error) {
      logger.error(`获取矩阵配置详情[${matrix_config_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 获取特定BxPx组合的配置
   *
   * @param {string} budget_tier - Budget Tier（B0/B1/B2/B3）
   * @param {string} pressure_tier - Pressure Tier（P0/P1/P2）
   * @returns {Promise<Object>} 配置对象
   */
  async getMatrixValue(budget_tier, pressure_tier) {
    try {
      const config = await this.LotteryTierMatrixConfig.getMatrixValue(budget_tier, pressure_tier)

      if (!config) {
        const error = new Error(`矩阵配置 ${budget_tier}x${pressure_tier} 不存在`)
        error.status = 404
        error.code = 'MATRIX_CONFIG_NOT_FOUND'
        throw error
      }

      return config
    } catch (error) {
      logger.error(`获取矩阵配置[${budget_tier}x${pressure_tier}]失败:`, error)
      throw error
    }
  }

  /**
   * 创建矩阵配置
   *
   * @param {Object} data - 配置数据
   * @param {string} data.budget_tier - Budget Tier
   * @param {string} data.pressure_tier - Pressure Tier
   * @param {number} data.cap_multiplier - 预算上限乘数
   * @param {number} data.empty_weight_multiplier - 空奖权重乘数
   * @param {string} [data.description] - 配置描述
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 创建的配置
   */
  async createMatrixConfig(data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const { budget_tier, pressure_tier, cap_multiplier, empty_weight_multiplier, description } =
        data

      // 检查唯一性约束
      const existing = await this.LotteryTierMatrixConfig.findOne({
        where: { budget_tier, pressure_tier },
        transaction
      })

      if (existing) {
        const error = new Error(`矩阵配置已存在: ${budget_tier}x${pressure_tier}`)
        error.status = 409
        error.code = 'MATRIX_CONFIG_EXISTS'
        throw error
      }

      const newConfig = await this.LotteryTierMatrixConfig.create(
        {
          budget_tier,
          pressure_tier,
          cap_multiplier,
          empty_weight_multiplier,
          description,
          is_active: true,
          created_by: admin_id,
          updated_by: admin_id
        },
        { transaction }
      )

      logger.info(`管理员 ${admin_id} 创建矩阵配置成功`, {
        matrix_config_id: newConfig.matrix_config_id,
        budget_tier,
        pressure_tier
      })

      return newConfig.getFormattedConfig()
    } catch (error) {
      logger.error('创建矩阵配置失败:', error)
      throw error
    }
  }

  /**
   * 更新矩阵配置
   *
   * @param {number} matrix_config_id - 配置ID
   * @param {Object} data - 更新数据
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新后的配置
   */
  async updateMatrixConfig(matrix_config_id, data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const config = await this.LotteryTierMatrixConfig.findByPk(matrix_config_id, { transaction })

      if (!config) {
        const error = new Error(`矩阵配置 ID ${matrix_config_id} 不存在`)
        error.status = 404
        error.code = 'MATRIX_CONFIG_NOT_FOUND'
        throw error
      }

      const updateData = {
        updated_by: admin_id
      }

      // 仅更新提供的字段
      if (data.cap_multiplier !== undefined) updateData.cap_multiplier = data.cap_multiplier
      if (data.empty_weight_multiplier !== undefined) {
        updateData.empty_weight_multiplier = data.empty_weight_multiplier
      }
      if (data.description !== undefined) updateData.description = data.description
      if (data.is_active !== undefined) updateData.is_active = data.is_active

      await config.update(updateData, { transaction })

      logger.info(`管理员 ${admin_id} 更新矩阵配置成功`, {
        matrix_config_id,
        budget_tier: config.budget_tier,
        pressure_tier: config.pressure_tier
      })

      return config.getFormattedConfig()
    } catch (error) {
      logger.error(`更新矩阵配置[${matrix_config_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 批量更新矩阵配置
   *
   * @param {Object} matrix_data - 矩阵数据对象
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新结果
   */
  async updateMatrix(matrix_data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const updated_count = await this.LotteryTierMatrixConfig.updateMatrix(matrix_data, admin_id, {
        transaction
      })

      logger.info(`管理员 ${admin_id} 批量更新矩阵配置成功`, { updated_count })

      return {
        updated_count,
        matrix: await this.getFullMatrix()
      }
    } catch (error) {
      logger.error('批量更新矩阵配置失败:', error)
      throw error
    }
  }

  /**
   * 删除矩阵配置
   *
   * @param {number} matrix_config_id - 配置ID
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async deleteMatrixConfig(matrix_config_id, admin_id, options = {}) {
    const { transaction } = options

    try {
      const config = await this.LotteryTierMatrixConfig.findByPk(matrix_config_id, { transaction })

      if (!config) {
        const error = new Error(`矩阵配置 ID ${matrix_config_id} 不存在`)
        error.status = 404
        error.code = 'MATRIX_CONFIG_NOT_FOUND'
        throw error
      }

      const configInfo = {
        budget_tier: config.budget_tier,
        pressure_tier: config.pressure_tier
      }

      await config.destroy({ transaction })

      logger.info(`管理员 ${admin_id} 删除矩阵配置成功`, {
        matrix_config_id,
        ...configInfo
      })
    } catch (error) {
      logger.error(`删除矩阵配置[${matrix_config_id}]失败:`, error)
      throw error
    }
  }

  /*
   * =============================================================================
   * 配置分组常量
   * =============================================================================
   */

  /**
   * 获取所有可用的配置分组列表
   *
   * @returns {Object} 配置分组定义
   */
  getConfigGroups() {
    return {
      budget_tier: {
        name: '预算分层配置',
        description: 'Budget Tier 阈值配置（threshold_high/mid/low）',
        keys: ['threshold_high', 'threshold_mid', 'threshold_low']
      },
      pressure_tier: {
        name: '活动压力配置',
        description: 'Pressure Tier 阈值配置（threshold_high/low）',
        keys: ['threshold_high', 'threshold_low']
      },
      pity: {
        name: 'Pity系统配置',
        description: '保底机制配置（enabled/multiplier_table/max_pity等）',
        keys: ['enabled', 'multiplier_table', 'max_pity', 'base_multiplier']
      },
      luck_debt: {
        name: '运气债务配置',
        description: 'Luck Debt 配置（enabled/threshold/multiplier等）',
        keys: ['enabled', 'threshold', 'multiplier', 'max_debt']
      },
      anti_empty: {
        name: '防连续空奖配置',
        description: 'Anti-Streak 空奖防护配置',
        keys: ['enabled', 'max_consecutive', 'compensation_weight']
      },
      anti_high: {
        name: '防连续高价值配置',
        description: 'Anti-Streak 高价值防护配置',
        keys: ['enabled', 'max_consecutive', 'cooldown_draws']
      },
      experience_state: {
        name: '体验状态配置',
        description: '新用户/老用户体验状态配置',
        keys: ['enabled', 'new_user_draws', 'boost_multiplier']
      }
    }
  }
}

module.exports = LotteryConfigService
