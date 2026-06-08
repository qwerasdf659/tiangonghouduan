'use strict'

/**
 * UserOwnedDecoration 模型 - 用户拥有的装饰
 *
 * 业务定位（路线B 合规改造 模块D / 第十节）：
 * - 记录用户购买的装饰、佩戴态、到期时间。
 * - 🔴 佩戴仅影响 UI 展示，不进任何业务计算（不碰抽奖/回馈/资产逻辑）。
 * - 限时装饰到期由 jobs/daily-decoration-expiry.js 清理（status→expired）。
 *
 * 数据库表：user_owned_decorations（主键 user_owned_decoration_id）
 *
 * @module models/UserOwnedDecoration
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 用户拥有装饰模型类
   * @class UserOwnedDecoration
   * @extends Model
   */
  class UserOwnedDecoration extends Model {
    /**
     * 静态关联定义
     * @param {Object} models - 全部模型集合
     * @returns {void}
     */
    static associate(models) {
      if (models.User) {
        UserOwnedDecoration.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' })
      }
      if (models.DecorationSku) {
        UserOwnedDecoration.belongsTo(models.DecorationSku, {
          foreignKey: 'decoration_sku_id',
          as: 'decoration'
        })
      }
    }
  }

  UserOwnedDecoration.init(
    {
      user_owned_decoration_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '用户拥有装饰主键'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID，FK→users.user_id'
      },
      decoration_sku_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '装饰SKU ID，FK→decoration_sku.decoration_sku_id'
      },
      equipped: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否佩戴中（仅影响 UI 展示，不进任何业务计算）'
      },
      acquired_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '获得时间（北京时间）'
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '到期时间（NULL=永久；限时装饰到期后由定时任务清理）'
      },
      status: {
        type: DataTypes.ENUM('active', 'expired'),
        allowNull: false,
        defaultValue: 'active',
        comment: '持有状态：active-有效 expired-已过期'
      }
    },
    {
      sequelize,
      modelName: 'UserOwnedDecoration',
      tableName: 'user_owned_decorations',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '用户拥有装饰表（佩戴态+到期，纯展示不进业务计算）'
    }
  )

  return UserOwnedDecoration
}
