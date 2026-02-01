/**
 * 抽奖管理设置模型
 *
 * 业务场景：存储管理员设置的抽奖干预规则（强制中奖、强制不中奖、概率调整、用户专属队列）
 * 数据库表：lottery_management_settings
 *
 * 核心功能：
 * 1. 管理员为特定用户设置强制中奖指定奖品（活动补偿、VIP特权、测试验证）
 * 2. 管理员设置用户强制不中奖N次（防刷保护、惩罚措施）
 * 3. 管理员临时调整用户中奖概率倍数（用户挽留、活跃度激励）
 * 4. 管理员为用户预设抽奖结果队列（精准运营、VIP体验优化）
 *
 * 状态流转：
 * active（生效中）→ used（已使用）/expired（已过期）/cancelled（已取消）
 *
 * @module models/LotteryManagementSetting
 */

const { DataTypes, Model } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 抽奖管理设置模型类
 * @class LotteryManagementSetting
 * @extends Model
 */
class LotteryManagementSetting extends Model {
  /**
   * 静态关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void} 无返回值，仅定义模型关联关系
   */
  static associate(models) {
    // 关联到目标用户（设置对哪个用户生效）
    LotteryManagementSetting.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'target_user',
      comment: '设置对哪个用户生效'
    })

    // 关联到创建管理员（哪个管理员创建的设置）
    LotteryManagementSetting.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'admin',
      comment: '哪个管理员创建的设置'
    })
  }

  /**
   * 检查设置是否已过期
   * @returns {boolean} 是否已过期
   *
   * @example
   * const setting = await LotteryManagementSetting.findByPk(setting_id)
   * if (setting.isExpired()) {
   *   console.log('设置已过期')
   * }
   */
  isExpired() {
    if (!this.expires_at) return false
    return new Date(this.expires_at) < new Date()
  }

  /**
   * 检查设置是否生效中
   * @returns {boolean} 是否生效中
   *
   * @example
   * const setting = await LotteryManagementSetting.findByPk(setting_id)
   * if (setting.isActive()) {
   *   console.log('设置生效中')
   * }
   */
  isActive() {
    return this.status === 'active' && !this.isExpired()
  }

  /**
   * 标记设置为已使用（用于force_win等一次性设置）
   * @returns {Promise<void>} 无返回值，保存状态变更到数据库
   *
   * @example
   * // 用户抽奖时，如果有force_win设置，使用后标记为used
   * const setting = await LotteryManagementSetting.findOne({ where: { user_id, setting_type: 'force_win', status: 'active' }})
   * if (setting) {
   *   await setting.markAsUsed()
   * }
   */
  async markAsUsed() {
    this.status = 'used'
    await this.save()
  }

  /**
   * 取消设置（管理员手动取消）
   * @returns {Promise<void>} 无返回值，保存状态变更到数据库
   *
   * @example
   * // 管理员取消用户的强制中奖设置
   * const setting = await LotteryManagementSetting.findByPk(setting_id)
   * await setting.cancel()
   */
  async cancel() {
    this.status = 'cancelled'
    await this.save()
  }
}

/**
 * 初始化模型
 * @param {Object} sequelize - Sequelize实例
 * @returns {Model} 初始化后的模型类（LotteryManagementSetting）
 */
module.exports = sequelize => {
  LotteryManagementSetting.init(
    {
      // 主键：设置唯一标识
      lottery_management_setting_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        defaultValue: () =>
          `setting_${BeijingTimeHelper.generateIdTimestamp()}_${Math.random().toString(36).substr(2, 6)}`,
        comment: '设置记录唯一标识（格式：setting_时间戳_随机码）'
      },

      // 目标用户ID：设置对哪个用户生效
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '目标用户ID（设置对哪个用户生效）'
      },

      // 设置类型：区分不同的管理设置
      setting_type: {
        type: DataTypes.ENUM('force_win', 'force_lose', 'probability_adjust', 'user_queue'),
        allowNull: false,
        comment:
          '设置类型：force_win-强制中奖，force_lose-强制不中奖，probability_adjust-概率调整，user_queue-用户专属队列'
      },

      // 设置详情：JSON格式存储设置参数
      setting_data: {
        type: DataTypes.JSON,
        allowNull: false,
        comment:
          '设置详情（JSON格式）：force_win={prize_id,reason}，force_lose={count,remaining,reason}，probability_adjust={multiplier,reason}，user_queue={queue_type,priority_level,custom_strategy}'
      },

      // 过期时间：设置自动失效时间（北京时间GMT+8）
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间（北京时间，NULL表示永不过期）'
      },

      // 设置状态：标识设置当前状态
      status: {
        type: DataTypes.ENUM('active', 'expired', 'used', 'cancelled'),
        allowNull: false,
        defaultValue: 'active',
        comment: '设置状态：active-生效中，expired-已过期，used-已使用，cancelled-已取消'
      },

      // 创建管理员ID：记录是哪个管理员创建的设置（用于审计追溯）
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '创建管理员ID（记录是哪个管理员创建的设置，用于审计追溯）'
      },

      // 创建时间：设置创建时间（北京时间GMT+8）
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '创建时间（北京时间）'
      },

      // 更新时间：设置最后更新时间（北京时间GMT+8）
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '更新时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'LotteryManagementSetting',
      tableName: 'lottery_management_settings',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment:
        '抽奖管理设置表：存储管理员的抽奖干预设置（强制中奖、强制不中奖、概率调整、用户专属队列）',
      indexes: [
        {
          name: 'idx_user_status',
          fields: ['user_id', 'status']
        },
        {
          name: 'idx_expires_at',
          fields: ['expires_at']
        },
        {
          name: 'idx_type_status',
          fields: ['setting_type', 'status']
        },
        {
          name: 'idx_created_by',
          fields: ['created_by', 'created_at']
        },
        {
          name: 'idx_user_type_status',
          fields: ['user_id', 'setting_type', 'status']
        }
      ]
    }
  )

  return LotteryManagementSetting
}
