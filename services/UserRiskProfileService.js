/**
 * @file 用户风控配置管理服务（UserRiskProfileService）
 * @description 管理用户风控配置表的CRUD操作
 *
 * 管理的表：user_risk_profiles
 *
 * 业务场景：
 * - 存储用户等级默认风控配置（config_type = 'level'）
 * - 存储用户个人自定义风控配置（config_type = 'user'）
 * - 管理用户账户冻结状态
 *
 * 服务层职责：
 * 1. 封装数据库操作，提供业务语义化API
 * 2. 处理业务逻辑（如风控阈值计算、冻结状态管理）
 * 3. 支持事务管理（通过options.transaction传入）
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const logger = require('../utils/logger').logger

/**
 * 用户风控配置管理服务类
 *
 * @class UserRiskProfileService
 */
class UserRiskProfileService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.UserRiskProfile = models.UserRiskProfile
    this.User = models.User
  }

  /**
   * 获取风控配置列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.config_type] - 配置类型（user/level）
   * @param {string} [options.user_level] - 用户等级筛选
   * @param {boolean} [options.is_frozen] - 是否冻结筛选
   * @param {number} [options.user_id] - 用户ID筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 包含列表和分页信息的对象
   */
  async getRiskProfiles(options = {}) {
    try {
      const { config_type, user_level, is_frozen, user_id, page = 1, page_size = 20 } = options

      const where = {}

      if (config_type) {
        where.config_type = config_type
      }
      if (user_level) {
        where.user_level = user_level
      }
      if (typeof is_frozen === 'boolean') {
        where.is_frozen = is_frozen
      }
      if (user_id) {
        where.user_id = user_id
      }

      const { count, rows } = await this.UserRiskProfile.findAndCountAll({
        where,
        include: [
          {
            association: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            association: 'frozenByAdmin',
            attributes: ['user_id', 'nickname']
          }
        ],
        order: [
          ['config_type', 'ASC'],
          ['user_level', 'ASC'],
          ['created_at', 'DESC']
        ],
        offset: (page - 1) * page_size,
        limit: page_size
      })

      return {
        list: rows,
        pagination: {
          total_count: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('获取风控配置列表失败:', error)
      throw error
    }
  }

  /**
   * 获取等级默认配置列表
   *
   * @returns {Promise<Array>} 等级配置列表
   */
  async getLevelConfigs() {
    try {
      const configs = await this.UserRiskProfile.findAll({
        where: { config_type: 'level' },
        order: [['user_level', 'ASC']]
      })

      return configs
    } catch (error) {
      logger.error('获取等级默认配置列表失败:', error)
      throw error
    }
  }

  /**
   * 根据配置ID获取详情
   *
   * @param {number} risk_profile_id - 配置ID
   * @returns {Promise<Object>} 配置详情
   */
  async getRiskProfileById(risk_profile_id) {
    try {
      const profile = await this.UserRiskProfile.findByPk(risk_profile_id, {
        include: [
          {
            association: 'user',
            attributes: ['user_id', 'nickname', 'mobile', 'status']
          },
          {
            association: 'frozenByAdmin',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      if (!profile) {
        const error = new Error(`风控配置 ID ${risk_profile_id} 不存在`)
        error.status = 404
        error.code = 'RISK_PROFILE_NOT_FOUND'
        throw error
      }

      return profile
    } catch (error) {
      logger.error(`获取风控配置详情[${risk_profile_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 获取用户有效的风控配置
   *
   * @param {number} user_id - 用户ID
   * @param {string} [user_level='normal'] - 用户等级
   * @returns {Promise<Object>} 有效的风控配置
   */
  async getEffectiveConfig(user_id, user_level = 'normal') {
    try {
      return await this.UserRiskProfile.getEffectiveConfig(user_id, user_level)
    } catch (error) {
      logger.error(`获取用户[${user_id}]有效风控配置失败:`, error)
      throw error
    }
  }

  /**
   * 获取用户指定币种的风控阈值
   *
   * @param {number} user_id - 用户ID
   * @param {string} user_level - 用户等级
   * @param {string} asset_code - 币种代码
   * @returns {Promise<Object>} 风控阈值
   */
  async getAssetThresholds(user_id, user_level, asset_code) {
    try {
      return await this.UserRiskProfile.getAssetThresholds(user_id, user_level, asset_code)
    } catch (error) {
      logger.error(`获取用户[${user_id}]币种[${asset_code}]阈值失败:`, error)
      throw error
    }
  }

  /**
   * 创建等级默认配置
   *
   * @param {Object} data - 配置数据
   * @param {string} data.user_level - 用户等级（normal/vip/merchant）
   * @param {Object} data.thresholds - 风控阈值配置
   * @param {string} [data.remarks] - 备注
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 创建的配置
   */
  async createLevelConfig(data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const { user_level, thresholds, remarks } = data

      // 检查等级配置是否已存在
      const existing = await this.UserRiskProfile.findOne({
        where: { user_level, config_type: 'level' },
        transaction
      })

      if (existing) {
        const error = new Error(`用户等级 ${user_level} 的默认配置已存在`)
        error.status = 409
        error.code = 'LEVEL_CONFIG_EXISTS'
        throw error
      }

      const newConfig = await this.UserRiskProfile.create(
        {
          user_level,
          config_type: 'level',
          thresholds: thresholds || {},
          remarks,
          is_frozen: false
        },
        { transaction }
      )

      logger.info(`管理员 ${admin_id} 创建等级风控配置成功`, {
        risk_profile_id: newConfig.risk_profile_id,
        user_level
      })

      return newConfig
    } catch (error) {
      logger.error('创建等级风控配置失败:', error)
      throw error
    }
  }

  /**
   * 创建或更新用户个人配置
   *
   * @param {number} user_id - 用户ID
   * @param {Object} data - 配置数据
   * @param {Object} [data.thresholds] - 风控阈值配置
   * @param {string} [data.remarks] - 备注
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 创建或更新的配置
   */
  async upsertUserConfig(user_id, data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const { thresholds, remarks } = data

      // 验证用户存在
      const user = await this.User.findByPk(user_id, { transaction })
      if (!user) {
        const error = new Error(`用户 ID ${user_id} 不存在`)
        error.status = 404
        error.code = 'USER_NOT_FOUND'
        throw error
      }

      // 查找现有配置
      let config = await this.UserRiskProfile.findOne({
        where: { user_id, config_type: 'user' },
        transaction
      })

      if (config) {
        // 更新现有配置
        const updateData = {}
        if (thresholds !== undefined) updateData.thresholds = thresholds
        if (remarks !== undefined) updateData.remarks = remarks

        await config.update(updateData, { transaction })

        logger.info(`管理员 ${admin_id} 更新用户风控配置成功`, {
          risk_profile_id: config.risk_profile_id,
          user_id
        })
      } else {
        // 创建新配置
        config = await this.UserRiskProfile.create(
          {
            user_id,
            user_level: user.user_level || 'normal',
            config_type: 'user',
            thresholds: thresholds || {},
            remarks,
            is_frozen: false
          },
          { transaction }
        )

        logger.info(`管理员 ${admin_id} 创建用户风控配置成功`, {
          risk_profile_id: config.risk_profile_id,
          user_id
        })
      }

      return config
    } catch (error) {
      logger.error(`创建/更新用户[${user_id}]风控配置失败:`, error)
      throw error
    }
  }

  /**
   * 更新风控配置
   *
   * @param {number} risk_profile_id - 配置ID
   * @param {Object} data - 更新数据
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新后的配置
   */
  async updateRiskProfile(risk_profile_id, data, admin_id, options = {}) {
    const { transaction } = options

    try {
      const profile = await this.UserRiskProfile.findByPk(risk_profile_id, { transaction })

      if (!profile) {
        const error = new Error(`风控配置 ID ${risk_profile_id} 不存在`)
        error.status = 404
        error.code = 'RISK_PROFILE_NOT_FOUND'
        throw error
      }

      const updateData = {}

      // 仅更新提供的字段
      if (data.thresholds !== undefined) updateData.thresholds = data.thresholds
      if (data.remarks !== undefined) updateData.remarks = data.remarks

      await profile.update(updateData, { transaction })

      logger.info(`管理员 ${admin_id} 更新风控配置成功`, {
        risk_profile_id,
        updated_fields: Object.keys(updateData)
      })

      return profile
    } catch (error) {
      logger.error(`更新风控配置[${risk_profile_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 冻结用户账户
   *
   * @param {number} user_id - 用户ID
   * @param {string} reason - 冻结原因
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新后的配置
   */
  async freezeUser(user_id, reason, admin_id, options = {}) {
    const { transaction } = options

    try {
      // 验证用户存在
      const user = await this.User.findByPk(user_id, { transaction })
      if (!user) {
        const error = new Error(`用户 ID ${user_id} 不存在`)
        error.status = 404
        error.code = 'USER_NOT_FOUND'
        throw error
      }

      // 获取或创建用户配置
      let config = await this.UserRiskProfile.findOne({
        where: { user_id, config_type: 'user' },
        transaction
      })

      if (config) {
        await config.update(
          {
            is_frozen: true,
            frozen_reason: reason,
            frozen_at: new Date(),
            frozen_by: admin_id
          },
          { transaction }
        )
      } else {
        config = await this.UserRiskProfile.create(
          {
            user_id,
            user_level: user.user_level || 'normal',
            config_type: 'user',
            thresholds: {},
            is_frozen: true,
            frozen_reason: reason,
            frozen_at: new Date(),
            frozen_by: admin_id
          },
          { transaction }
        )
      }

      logger.info(`管理员 ${admin_id} 冻结用户账户成功`, {
        user_id,
        reason
      })

      return config
    } catch (error) {
      logger.error(`冻结用户[${user_id}]账户失败:`, error)
      throw error
    }
  }

  /**
   * 解冻用户账户
   *
   * @param {number} user_id - 用户ID
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新后的配置
   */
  async unfreezeUser(user_id, admin_id, options = {}) {
    const { transaction } = options

    try {
      const config = await this.UserRiskProfile.findOne({
        where: { user_id, config_type: 'user' },
        transaction
      })

      if (!config) {
        const error = new Error(`用户 ID ${user_id} 的风控配置不存在`)
        error.status = 404
        error.code = 'USER_CONFIG_NOT_FOUND'
        throw error
      }

      if (!config.is_frozen) {
        const error = new Error(`用户 ID ${user_id} 未被冻结`)
        error.status = 400
        error.code = 'USER_NOT_FROZEN'
        throw error
      }

      await config.update(
        {
          is_frozen: false,
          frozen_reason: null,
          frozen_at: null,
          frozen_by: null
        },
        { transaction }
      )

      logger.info(`管理员 ${admin_id} 解冻用户账户成功`, { user_id })

      return config
    } catch (error) {
      logger.error(`解冻用户[${user_id}]账户失败:`, error)
      throw error
    }
  }

  /**
   * 检查用户冻结状态
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 冻结状态
   */
  async checkFrozenStatus(user_id) {
    try {
      return await this.UserRiskProfile.checkFrozenStatus(user_id)
    } catch (error) {
      logger.error(`检查用户[${user_id}]冻结状态失败:`, error)
      throw error
    }
  }

  /**
   * 删除风控配置
   *
   * @param {number} risk_profile_id - 配置ID
   * @param {number} admin_id - 操作管理员ID
   * @param {Object} [options={}] - 额外选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async deleteRiskProfile(risk_profile_id, admin_id, options = {}) {
    const { transaction } = options

    try {
      const profile = await this.UserRiskProfile.findByPk(risk_profile_id, { transaction })

      if (!profile) {
        const error = new Error(`风控配置 ID ${risk_profile_id} 不存在`)
        error.status = 404
        error.code = 'RISK_PROFILE_NOT_FOUND'
        throw error
      }

      const profileInfo = {
        config_type: profile.config_type,
        user_level: profile.user_level,
        user_id: profile.user_id
      }

      await profile.destroy({ transaction })

      logger.info(`管理员 ${admin_id} 删除风控配置成功`, {
        risk_profile_id,
        ...profileInfo
      })
    } catch (error) {
      logger.error(`删除风控配置[${risk_profile_id}]失败:`, error)
      throw error
    }
  }

  /**
   * 获取冻结用户列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 冻结用户列表
   */
  async getFrozenUsers(options = {}) {
    try {
      const { page = 1, page_size = 20 } = options

      const { count, rows } = await this.UserRiskProfile.findAndCountAll({
        where: {
          is_frozen: true,
          config_type: 'user'
        },
        include: [
          {
            association: 'user',
            attributes: ['user_id', 'nickname', 'mobile', 'status']
          },
          {
            association: 'frozenByAdmin',
            attributes: ['user_id', 'nickname']
          }
        ],
        order: [['frozen_at', 'DESC']],
        offset: (page - 1) * page_size,
        limit: page_size
      })

      return {
        list: rows,
        pagination: {
          total_count: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('获取冻结用户列表失败:', error)
      throw error
    }
  }
}

module.exports = UserRiskProfileService
