/**
 * UserRatioOverride 模型 - 用户消费比例覆盖
 *
 * 业务场景：
 * 管理员可为特定用户设置个性化的消费比例（三个消费比例均支持全局+个人两层配置）
 * 优先级：个人覆盖（本表） > 全局默认（system_settings）
 *
 * 支持的比例类型（ratio_key）：
 * - points_award_ratio：消费→积分比例
 * - budget_allocation_ratio：消费→预算积分比例
 * - diamond_quota_ratio：消费→钻石配额比例
 *
 * @module models/UserRatioOverride
 */

module.exports = (sequelize, DataTypes) => {
  const UserRatioOverride = sequelize.define(
    'UserRatioOverride',
    {
      user_ratio_override_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '覆盖记录主键'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '目标用户ID'
      },
      ratio_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: [['points_award_ratio', 'budget_allocation_ratio', 'diamond_quota_ratio']]
        },
        comment: '比例类型：points_award_ratio / budget_allocation_ratio / diamond_quota_ratio'
      },
      ratio_value: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        /** @returns {number|null} DECIMAL 转换为 JavaScript 数字类型 */
        get() {
          const raw = this.getDataValue('ratio_value')
          return raw !== null ? parseFloat(raw) : null
        },
        comment: '覆盖比例值（如 2.0 表示消费金额×2.0）'
      },
      reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '覆盖原因（如：双11活动奖励、投诉补偿、VIP关怀）'
      },
      effective_start: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始时间（NULL=立即生效）'
      },
      effective_end: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束时间（NULL=永久生效）'
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作管理员ID'
      }
    },
    {
      tableName: 'user_ratio_overrides',
      underscored: true,
      freezeTableName: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'ratio_key'],
          name: 'uk_user_ratio'
        },
        {
          fields: ['user_id'],
          name: 'idx_user_ratio_user_id'
        },
        {
          fields: ['effective_end'],
          name: 'idx_user_ratio_effective_end'
        }
      ],
      comment: '用户消费比例覆盖表（三个消费比例均支持全局+个人两层配置）'
    }
  )

  /**
   * 模型关联定义
   * @param {Object} models - 所有模型集合
   * @returns {void}
   */
  UserRatioOverride.associate = models => {
    UserRatioOverride.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'target_user',
      onDelete: 'RESTRICT'
    })

    UserRatioOverride.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onDelete: 'SET NULL'
    })
  }

  return UserRatioOverride
}
