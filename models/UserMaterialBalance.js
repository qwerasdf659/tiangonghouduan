/**
 * 用户材料余额模型 - 材料系统核心余额表
 * 创建时间：2025-12-15 16:56:21 (北京时间)
 * 版本号：v4.5.0-material-system
 *
 * 功能描述：
 * - 记录每个用户在每种材料上的余额（按行扩展）
 * - 支持部分扣减（与背包模式的主要区别）
 * - 支持事务性操作（增加/扣减材料余额）
 * - 支持行级锁（FOR UPDATE）防止并发问题
 *
 * 架构设计：
 * - Model层只负责：字段定义、关联、基础校验
 * - 业务逻辑在Service层处理（MaterialService）
 * - 符合领域驱动设计（DDD）原则
 *
 * 关联关系：
 * - User：多对一（多个余额记录属于一个用户）
 * - MaterialAssetType：多对一（多个余额记录对应一个资产类型）
 * - MaterialTransaction：一对多（一个余额记录有多条流水）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 用户材料余额模型类
 * @class UserMaterialBalance
 * @extends {Model}
 */
class UserMaterialBalance extends Model {
  /**
   * 定义模型关联关系
   * @param {Object} models - 所有Sequelize模型的集合
   * @returns {void}
   */
  static associate (models) {
    // 多对一：多个余额记录属于一个用户
    UserMaterialBalance.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '关联用户信息'
    })

    // 多对一：多个余额记录对应一个资产类型
    UserMaterialBalance.belongsTo(models.MaterialAssetType, {
      foreignKey: 'asset_code',
      as: 'asset_type',
      comment: '关联材料资产类型'
    })
  }
}

/**
 * 初始化用户材料余额模型
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {typeof UserMaterialBalance} 初始化后的模型类
 */
module.exports = sequelize => {
  UserMaterialBalance.init(
    {
      // 主键：余额ID
      balance_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '余额ID（主键，自增）'
      },

      // 用户ID（外键）
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID（关联users.user_id）'
      },

      // 资产代码（外键）
      asset_code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '资产代码（关联material_asset_types.asset_code）'
      },

      // 余额
      balance: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '余额（正整数，支持部分扣减）'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间）'
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'UserMaterialBalance',
      tableName: 'user_material_balances',
      timestamps: true,
      underscored: true,
      comment: '用户材料余额表（记录每个用户在每种材料上的余额）',
      indexes: [
        {
          name: 'uk_user_asset',
          unique: true,
          fields: ['user_id', 'asset_code']
        },
        {
          name: 'idx_user_id',
          fields: ['user_id']
        },
        {
          name: 'idx_asset_code',
          fields: ['asset_code']
        }
      ]
    }
  )

  return UserMaterialBalance
}
