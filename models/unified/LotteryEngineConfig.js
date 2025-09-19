/**
 * V4统一抽奖引擎配置模型
 * 用于管理9大功能模块的策略配置
 *
 * @description 统一抽奖引擎配置表模型
 * @version 4.0.0
 * @date 2025-09-11
 */

const { DataTypes } = require('sequelize')
const moment = require('moment-timezone')

module.exports = sequelize => {
  const LotteryEngineConfig = sequelize.define(
    'LotteryEngineConfig',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '配置ID'
      },
      strategy_type: {
        type: DataTypes.ENUM(['basic_lottery', 'guarantee', 'management']),
        allowNull: false,
        validate: {
          notEmpty: {
            msg: '策略类型不能为空'
          }
        },
        comment: '策略类型'
      },
      config_data: {
        type: DataTypes.JSON,
        allowNull: false,
        validate: {
          notEmpty: {
            msg: '策略配置数据不能为空'
          },
          isValidConfigData (value) {
            if (!value || typeof value !== 'object') {
              throw new Error('配置数据必须是有效的JSON对象')
            }
            // 验证必需的配置字段
            if (!value.enabled === undefined) {
              throw new Error('配置数据必须包含enabled字段')
            }
          }
        },
        get () {
          const rawValue = this.getDataValue('config_data')
          if (!rawValue) return {}

          // 确保返回的配置包含默认值
          const defaultConfig = {
            enabled: true,
            priority: 1,
            timeout: 30000,
            retry_count: 3,
            cache_ttl: 300
          }

          return { ...defaultConfig, ...rawValue }
        },
        comment: '策略配置数据'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        validate: {
          isBoolean: {
            msg: '启用状态必须是布尔值'
          }
        },
        comment: '是否启用'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        get () {
          return moment(this.getDataValue('created_at'))
            .tz('Asia/Shanghai')
            .format('YYYY-MM-DD HH:mm:ss')
        },
        comment: '创建时间（北京时间）'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        get () {
          return moment(this.getDataValue('updated_at'))
            .tz('Asia/Shanghai')
            .format('YYYY-MM-DD HH:mm:ss')
        },
        comment: '更新时间（北京时间）'
      }
    },
    {
      tableName: 'lottery_engine_configs',
      comment: 'V4统一抽奖引擎配置表',
      indexes: [
        {
          unique: false,
          fields: ['strategy_type']
        },
        {
          unique: false,
          fields: ['is_active']
        }
      ],
      hooks: {
        beforeCreate: (instance, _options) => {
          const now = moment().tz('Asia/Shanghai').toDate()
          instance.created_at = now
          instance.updated_at = now
        },
        beforeUpdate: (instance, _options) => {
          instance.updated_at = moment().tz('Asia/Shanghai').toDate()
        }
      }
    }
  )

  /**
   * 模型关联定义
   */
  LotteryEngineConfig.associate = function (models) {
    // 可以与其他模型建立关联
    // 例如：与LotteryExecutionLog的关联
    if (models.LotteryExecutionLog) {
      LotteryEngineConfig.hasMany(models.LotteryExecutionLog, {
        foreignKey: 'strategy_type',
        sourceKey: 'strategy_type',
        as: 'execution_logs'
      })
    }
  }

  /**
   * 实例方法
   */

  /**
   * 获取策略配置
   * @returns {Object} 策略配置对象
   */
  LotteryEngineConfig.prototype.getStrategyConfig = function () {
    const config = this.config_data || {}
    return {
      strategy_type: this.strategy_type,
      is_active: this.is_active,
      ...config,
      last_updated: this.updated_at
    }
  }

  /**
   * 更新策略配置
   * @param {Object} newConfig - 新的配置数据
   * @returns {Promise<LotteryEngineConfig>} 更新后的实例
   */
  LotteryEngineConfig.prototype.updateStrategyConfig = function (newConfig) {
    const currentConfig = this.config_data || {}
    const mergedConfig = { ...currentConfig, ...newConfig }

    return this.update({
      config_data: mergedConfig,
      updated_at: moment().tz('Asia/Shanghai').toDate()
    })
  }

  /**
   * 启用/禁用策略
   * @param {boolean} active - 是否启用
   * @returns {Promise<LotteryEngineConfig>} 更新后的实例
   */
  LotteryEngineConfig.prototype.setActive = function (active) {
    return this.update({
      is_active: active,
      updated_at: moment().tz('Asia/Shanghai').toDate()
    })
  }

  /**
   * 静态方法
   */

  /**
   * 根据策略类型获取配置
   * @param {string} strategyType - 策略类型
   * @returns {Promise<LotteryEngineConfig|null>} 配置实例
   */
  LotteryEngineConfig.getByStrategyType = function (strategyType) {
    return this.findOne({
      where: {
        strategy_type: strategyType,
        is_active: true
      }
    })
  }

  /**
   * 获取所有启用的策略配置
   * @returns {Promise<Array<LotteryEngineConfig>>} 配置列表
   */
  LotteryEngineConfig.getAllActiveConfigs = function () {
    return this.findAll({
      where: {
        is_active: true
      },
      order: [['strategy_type', 'ASC']]
    })
  }

  /**
   * 批量更新策略配置
   * @param {Object} configUpdates - 配置更新对象 {strategy_type: config_data}
   * @returns {Promise<Array>} 更新结果
   */
  LotteryEngineConfig.batchUpdateConfigs = async function (configUpdates) {
    const results = []

    for (const [strategyType, configData] of Object.entries(configUpdates)) {
      try {
        const config = await this.getByStrategyType(strategyType)
        if (config) {
          await config.updateStrategyConfig(configData)
          results.push({ strategy_type: strategyType, status: 'updated' })
        } else {
          // 如果不存在，则创建新配置
          await this.create({
            strategy_type: strategyType,
            config_data: configData,
            is_active: true
          })
          results.push({ strategy_type: strategyType, status: 'created' })
        }
      } catch (error) {
        results.push({
          strategy_type: strategyType,
          status: 'error',
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * 验证策略配置格式
   * @param {string} strategyType - 策略类型
   * @param {Object} configData - 配置数据
   * @returns {Object} 验证结果
   */
  LotteryEngineConfig.validateStrategyConfig = function (strategyType, configData) {
    const errors = []

    // 通用配置验证
    if (!configData.enabled === undefined) {
      errors.push('配置必须包含enabled字段')
    }

    // 特定策略配置验证
    switch (strategyType) {
    case 'basic_lottery':
      if (!configData.base_probability) {
        errors.push('基础抽奖策略必须设置基础概率')
      }
      break
    case 'multi_pool':
      if (!configData.pool_configs) {
        errors.push('多池系统必须设置奖池配置')
      }
      break
    case 'social_lottery':
      if (!configData.room_settings) {
        errors.push('社交抽奖必须设置房间参数')
      }
      break
      // 其他策略验证规则...
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  return LotteryEngineConfig
}
