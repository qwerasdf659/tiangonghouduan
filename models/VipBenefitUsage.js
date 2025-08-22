/**
 * 🔥 VIP权益使用记录模型 v3.0
 */

'use strict'

module.exports = (sequelize, DataTypes) => {
  const VipBenefitUsage = sequelize.define('VipBenefitUsage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '权益使用记录ID'
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '用户ID'
    },
    vip_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'VIP等级'
    },
    benefit_type: {
      type: DataTypes.ENUM('discount', 'bonus_points', 'exclusive_lottery', 'priority_support', 'special_gift'),
      allowNull: false,
      comment: '权益类型'
    },
    benefit_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '权益名称'
    },
    usage_context: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '使用场景'
    },
    original_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: '原始价值'
    },
    discounted_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: '折扣后价值'
    },
    savings_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: '节省金额'
    },
    usage_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: '使用次数'
    },
    related_order_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '关联订单ID'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '使用详情元数据'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '使用时间'
    }
  }, {
    tableName: 'vip_benefit_usage',
    timestamps: false,
    comment: 'VIP权益使用记录表'
  })

  VipBenefitUsage.associate = function (models) {
    VipBenefitUsage.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })
  }

  return VipBenefitUsage
}
