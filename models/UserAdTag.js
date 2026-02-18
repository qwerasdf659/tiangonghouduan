/**
 * 用户广告标签模型（UserAdTag）
 *
 * 业务场景：
 * - 存储用户画像标签，用于广告定向投放
 * - 标签通过用户行为数据计算得出（如：购买偏好、活跃时段、消费能力等）
 * - 支持实时更新和批量计算
 *
 * 数据库表名：user_ad_tags
 * 主键：user_ad_tag_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 UserAdTag 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} UserAdTag 模型
 */
module.exports = sequelize => {
  const UserAdTag = sequelize.define(
    'UserAdTag',
    {
      user_ad_tag_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '用户标签主键ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        comment: '用户ID（外键→users）'
      },

      tag_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: { notEmpty: { msg: '标签键不能为空' } },
        comment: '标签键（如：purchase_preference, activity_time, consumption_level）'
      },

      tag_value: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: { notEmpty: { msg: '标签值不能为空' } },
        comment: '标签值（如：high_value_user, morning_active, diamond_spender）'
      },

      calculated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('calculated_at'))
        },
        comment: '标签计算时间'
      }
    },
    {
      tableName: 'user_ad_tags',
      timestamps: false,
      comment: '用户广告标签表',

      hooks: {
        beforeCreate: tag => {
          if (!tag.calculated_at) {
            tag.calculated_at = BeijingTimeHelper.createBeijingTime()
          }
        }
      },

      indexes: [
        {
          name: 'uk_uat_user_tag',
          unique: true,
          fields: ['user_id', 'tag_key']
        },
        { name: 'idx_uat_tag', fields: ['tag_key', 'tag_value'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  UserAdTag.associate = models => {
    UserAdTag.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })
  }

  return UserAdTag
}
