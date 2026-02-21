/**
 * 系统设置模型
 *
 * 业务场景：存储系统各模块的配置设置（基础设置、抽奖设置、积分设置、通知设置、安全设置）
 * 数据库表：system_settings
 *
 * 核心功能：
 * 1. 系统基础信息配置（系统名称、版本号、客服电话、客服邮箱等）
 * 2. 抽奖系统参数配置（基础中奖率、最大连续不中奖次数、调整因子等）
 * 3. 积分系统规则配置（签到积分、抽奖消耗、积分有效期等）
 * 4. 通知系统设置（短信、邮件、站内信开关及模板）
 * 5. 安全策略配置（登录限制、密码规则、API限流等）
 *
 * 数据结构：
 * - 使用category字段分类（basic/lottery/points/notification/security）
 * - 使用setting_key存储具体配置项名称
 * - 使用setting_value存储配置值（支持字符串、数字、JSON）
 * - 使用value_type标识数据类型（string/number/boolean/json）
 *
 * @module models/SystemSettings
 */

const { DataTypes, Model } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 系统设置模型类
 * @class SystemSettings
 * @extends Model
 */
class SystemSettings extends Model {
  /**
   * 静态关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 关联到更新管理员（记录最后由哪个管理员修改）
    SystemSettings.belongsTo(models.User, {
      foreignKey: 'updated_by',
      as: 'updater',
      comment: '最后更新管理员'
    })
  }

  /**
   * 获取配置值（自动解析JSON和类型转换）
   * @returns {any} 解析后的配置值
   *
   * @example
   * const setting = await SystemSettings.findOne({ where: { setting_key: 'system_name' }})
   * console.log(setting.getParsedValue()) // "餐厅抽奖系统"
   */
  getParsedValue() {
    const { setting_value, value_type } = this

    try {
      switch (value_type) {
        case 'number':
          return Number(setting_value)
        case 'boolean':
          return setting_value === 'true' || setting_value === '1'
        case 'json':
          return JSON.parse(setting_value)
        case 'string':
        default:
          return setting_value
      }
    } catch (error) {
      console.error(`解析配置值失败 [${this.setting_key}]:`, error.message)
      return setting_value
    }
  }

  /**
   * 设置配置值（自动类型转换和JSON序列化）
   * @param {any} value - 要设置的值
   * @returns {void}
   *
   * @example
   * const setting = await SystemSettings.findOne({ where: { setting_key: 'max_login_attempts' }})
   * setting.setValue(5)
   * await setting.save()
   */
  setValue(value) {
    if (typeof value === 'object') {
      this.setting_value = JSON.stringify(value)
      this.value_type = 'json'
    } else if (typeof value === 'number') {
      this.setting_value = String(value)
      this.value_type = 'number'
    } else if (typeof value === 'boolean') {
      this.setting_value = value ? 'true' : 'false'
      this.value_type = 'boolean'
    } else {
      this.setting_value = String(value)
      this.value_type = 'string'
    }
  }
}

/**
 * 初始化模型
 * @param {Object} sequelize - Sequelize实例
 * @returns {Object} 初始化后的模型类
 */
module.exports = sequelize => {
  SystemSettings.init(
    {
      // 主键：设置项唯一标识
      system_setting_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '设置项唯一标识（自增主键）'
      },

      // 配置分类：区分不同模块的配置（仅运营配置，技术配置在代码中管理）
      category: {
        type: DataTypes.ENUM(
          'basic',
          'points',
          'notification',
          'security',
          'marketplace',
          'redemption'
        ),
        allowNull: false,
        comment:
          '配置分类：basic-基础设置，points-积分设置，notification-通知设置，security-安全设置，marketplace-市场设置，redemption-核销设置（注：抽奖算法配置在config/business.config.js中管理）'
      },

      // 配置键名：具体的配置项标识
      setting_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '配置键名（唯一，如system_name、base_win_rate、sign_in_points等）'
      },

      // 配置值：存储配置数据（支持多种类型）
      setting_value: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
        comment: '配置值（根据value_type解析：字符串、数字、布尔值、JSON对象）'
      },

      // 值类型：标识配置值的数据类型
      value_type: {
        type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
        allowNull: false,
        defaultValue: 'string',
        comment: '值类型：string-字符串，number-数字，boolean-布尔值，json-JSON对象'
      },

      // 配置描述：说明配置项的用途
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '配置描述（说明此配置项的用途和影响）'
      },

      // 是否可见：控制是否在管理后台显示
      is_visible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否在管理后台显示（false表示隐藏的系统内部配置）'
      },

      // 是否只读：防止误修改关键配置
      is_readonly: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否只读（true表示不可通过管理后台修改的关键配置）'
      },

      // 更新管理员ID：记录最后由哪个管理员修改（用于审计）
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '最后更新管理员ID（记录最后由哪个管理员修改，用于审计追溯）'
      },

      // 创建时间：配置项创建时间（北京时间GMT+8）
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '创建时间（北京时间）'
      },

      // 更新时间：配置项最后更新时间（北京时间GMT+8）
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '更新时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'SystemSettings',
      tableName: 'system_settings',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '系统设置表：存储系统各模块的配置设置（基础、抽奖、积分、通知、安全）',
      indexes: [
        {
          name: 'idx_category',
          fields: ['category']
        },
        {
          name: 'idx_setting_key',
          fields: ['setting_key'],
          unique: true
        },
        {
          name: 'idx_category_visible',
          fields: ['category', 'is_visible']
        },
        {
          name: 'idx_updated_by',
          fields: ['updated_by', 'updated_at']
        }
      ]
    }
  )

  return SystemSettings
}
