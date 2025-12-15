/**
 * 钻石流水模型 - 钻石系统审计流水表
 * 创建时间：2025-12-15 16:56:25 (北京时间)
 * 版本号：v4.5.0-material-system
 *
 * 功能描述：
 * - 记录所有钻石的变动（获得、消耗、管理员调整等）
 * - 支持幂等性控制（business_id唯一约束）
 * - 支持审计追溯（before/after余额、业务类型、业务ID）
 * - 支持反作弊（通过流水分析异常行为）
 *
 * 架构设计：
 * - Model层只负责：字段定义、关联、基础校验
 * - 业务逻辑在Service层处理（DiamondService）
 * - 符合领域驱动设计（DDD）原则
 *
 * 关联关系：
 * - User：多对一（多条流水属于一个用户）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 钻石流水模型类
 * @class DiamondTransaction
 * @extends {Model}
 */
class DiamondTransaction extends Model {
  /**
   * 定义模型关联关系
   * @param {Object} models - 所有Sequelize模型的集合
   * @returns {void}
   */
  static associate (models) {
    // 多对一：多条流水属于一个用户
    DiamondTransaction.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '关联用户信息'
    })
  }
}

/**
 * 初始化钻石流水模型
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {typeof DiamondTransaction} 初始化后的模型类
 */
module.exports = sequelize => {
  DiamondTransaction.init(
    {
      // 主键：流水ID
      tx_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '流水ID（主键，自增）'
      },

      // 用户ID（外键）
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID（关联users.user_id）'
      },

      // 交易类型
      tx_type: {
        type: DataTypes.ENUM('earn', 'consume', 'admin_adjust'),
        allowNull: false,
        comment: '交易类型：earn（获得）、consume（消耗）、admin_adjust（管理员调整）'
      },

      // 金额
      amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '金额（统一正数，方向由tx_type决定）'
      },

      // 变更前余额
      balance_before: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '变更前余额（用于审计和对账）'
      },

      // 变更后余额
      balance_after: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '变更后余额（用于审计和对账）'
      },

      // 业务类型
      business_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '业务类型（用于分类统计和追溯）'
      },

      // 业务ID（幂等键）
      business_id: {
        type: DataTypes.STRING(150),
        allowNull: false,
        unique: true,
        comment: '业务ID（幂等键，必填，唯一约束）'
      },

      // 标题
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '标题（用于前端展示和审计）'
      },

      // 元数据
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '元数据（JSON格式，可选）'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（交易时间，北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'DiamondTransaction',
      tableName: 'diamond_transactions',
      timestamps: false, // 只有created_at，没有updated_at
      underscored: true,
      comment: '钻石流水表（记录所有钻石的变动）',
      indexes: [
        {
          name: 'uk_business_id',
          unique: true,
          fields: ['business_id']
        },
        {
          name: 'idx_user_created',
          fields: ['user_id', 'created_at']
        },
        {
          name: 'idx_user_id',
          fields: ['user_id']
        },
        {
          name: 'idx_business_type',
          fields: ['business_type']
        },
        {
          name: 'idx_created_at',
          fields: ['created_at']
        },
        {
          name: 'idx_tx_type',
          fields: ['tx_type']
        }
      ]
    }
  )

  return DiamondTransaction
}
