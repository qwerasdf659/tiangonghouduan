/**
 * 用户资产账户模型 - UserAssetAccount
 * 统一资产底座：管理DIAMOND和材料资产余额
 *
 * 业务场景：
 * - 交易市场DIAMOND结算（市场购买扣减/入账）
 * - 兑换市场材料资产扣减（兑换商品消耗材料）
 * - 材料转换（碎红水晶→DIAMOND）
 *
 * 设计特点：
 * - DIAMOND和所有材料使用同一套账本（通过asset_code区分）
 * - user_id + asset_code组合唯一（一个用户对每种资产只有一个账户）
 * - 使用BIGINT避免浮点精度问题
 *
 * 架构规范：
 * - Model层：字段定义、关联、基础校验
 * - Service层：业务逻辑收口到AssetService
 * - 符合领域驱动设计原则
 *
 * 命名规范（snake_case）：
 * - 表名：user_asset_accounts
 * - 主键：asset_account_id
 * - 外键：user_id
 *
 * 创建时间：2025-12-15
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 用户资产账户模型类
 * 职责：管理用户的DIAMOND和材料资产余额
 * 设计模式：领域模型模式 + 聚合根
 */
class UserAssetAccount extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    // 多对一：账户归属于用户
    UserAssetAccount.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'RESTRICT', // 用户删除时保护资产账户
      onUpdate: 'CASCADE',
      comment: '关联用户信息（账户所有者）'
    })

    /**
     * 🔧 V4.3修复：移除已废弃的AssetTransaction关联
     * AssetTransaction现在通过account_id关联Account表，不再直接关联UserAssetAccount
     * 查询用户资产流水应使用：Account -> AssetTransaction路径
     */
  }

  /**
   * 模型验证规则
   *
   * @param {Object} data - 需要验证的账户数据
   * @param {number} data.available_amount - 可用余额
   * @returns {Object} 验证结果对象 {is_valid: boolean, errors: Array<string>}
   */
  static validateAccount(data) {
    const errors = []

    // 验证可用余额不能为负数
    if (data.available_amount < 0) {
      errors.push('可用余额不能为负数')
    }

    return {
      is_valid: errors.length === 0,
      errors
    }
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {UserAssetAccount} 初始化后的模型
 */
module.exports = sequelize => {
  UserAssetAccount.init(
    {
      // 主键ID（Asset Account ID - 资产账户唯一标识）
      asset_account_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '资产账户ID（主键）'
      },

      // 用户ID（User ID - 账户所有者）
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID（User ID - 账户所有者）：关联users.user_id，标识这个资产账户属于哪个用户'
      },

      // 资产代码（Asset Code - 资产类型标识）
      asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '资产代码（Asset Code - 资产类型标识）：DIAMOND-钻石资产（交易市场唯一结算币种）, red_shard-碎红水晶（材料资产，可转换为DIAMOND），可扩展其他材料资产'
      },

      // 可用余额（Available Amount - 可使用的资产数量）
      available_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment:
          '可用余额（Available Amount - 可使用的资产数量）：单位为1个资产单位（如1 DIAMOND, 1个red_shard），使用BIGINT避免浮点精度问题，默认值为0，业务规则：不能为负数，所有扣减操作前必须验证余额充足'
      }
    },
    {
      sequelize,
      modelName: 'UserAssetAccount',
      tableName: 'user_asset_accounts',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      comment: '用户资产账户表（统一管理DIAMOND和材料资产余额）',
      indexes: [
        {
          fields: ['user_id', 'asset_code'],
          unique: true,
          name: 'uk_user_asset',
          comment: '唯一索引：用户ID + 资产代码（确保一个用户对每种资产只有一个账户）'
        },
        {
          fields: ['asset_code'],
          name: 'idx_asset_code',
          comment: '索引：资产代码（用于按资产类型统计和查询）'
        },
        {
          fields: ['user_id'],
          name: 'idx_user_id',
          comment: '索引：用户ID（用于查询用户的所有资产账户）'
        }
      ]
    }
  )

  return UserAssetAccount
}
