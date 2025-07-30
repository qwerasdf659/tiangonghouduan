/**
 * 奖品信息管理模型
 * 解决抽奖业务奖品数据管理问题
 * 创建时间：2025年01月28日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const Prize = sequelize.define(
    'Prize',
    {
      prize_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '奖品唯一标识'
      },

      prize_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '奖品名称'
      },

      prize_type: {
        type: DataTypes.ENUM('points', 'physical', 'virtual', 'coupon'),
        allowNull: false,
        comment: '奖品类型'
      },

      prize_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '奖品价值'
      },

      win_rate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        comment: '中奖概率 0.0001-1.0000'
      },

      stock_total: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '总库存数量'
      },

      stock_remaining: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '剩余库存数量'
      },

      image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '奖品图片URL'
      },

      primary_image_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: '主图资源ID',
        references: {
          model: 'image_resources',
          key: 'resource_id'
        }
      },

      gallery_images: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '图库资源ID数组'
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '奖品描述'
      },

      prize_metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '奖品元数据'
      },

      display_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '显示配置'
      },

      display_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '显示顺序'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否启用'
      },

      valid_from: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '有效期开始'
      },

      valid_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '有效期结束'
      }
    },
    {
      tableName: 'prizes',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['prize_type', 'is_active']
        },
        {
          fields: ['win_rate']
        },
        {
          fields: ['display_order', 'is_active']
        },
        {
          fields: ['stock_remaining']
        },
        {
          fields: ['primary_image_id']
        }
      ],
      comment: '奖品信息表'
    }
  )

  // 定义关联关系
  Prize.associate = function (models) {
    // 主图关联
    Prize.belongsTo(models.ImageResources, {
      foreignKey: 'primary_image_id',
      as: 'primaryImage'
    })

    // 抽奖记录关联
    if (models.LotteryRecord) {
      Prize.hasMany(models.LotteryRecord, {
        foreignKey: 'prize_id',
        as: 'lotteryRecords'
      })
    }
  }

  return Prize
}
