/**
 * UserAddress 模型 — 用户收货地址
 *
 * 对应 user_addresses 表
 * 存储用户的收货地址信息，供 DIY 实物兑换、奖品发货等场景使用
 *
 * @module models/UserAddress
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/** 用户收货地址模型 */
class UserAddress extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 全部模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.User) {
      UserAddress.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      })
    }
  }
}

module.exports = sequelize => {
  UserAddress.init(
    {
      /** 收货地址主键 */
      address_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: '收货地址主键'
      },
      /** 用户 ID（关联 users.user_id） */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户 ID',
        references: { model: 'users', key: 'user_id' }
      },
      /** 收件人姓名 */
      receiver_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '收件人姓名'
      },
      /** 收件人手机号 */
      receiver_phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '收件人手机号'
      },
      /** 省份 */
      province: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '省份'
      },
      /** 城市 */
      city: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '城市'
      },
      /** 区/县 */
      district: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: '',
        comment: '区/县'
      },
      /** 详细地址 */
      detail_address: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: '详细地址'
      },
      /** 邮政编码 */
      postal_code: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: '邮政编码'
      },
      /** 是否默认地址 */
      is_default: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否默认地址'
      }
    },
    {
      sequelize,
      modelName: 'UserAddress',
      tableName: 'user_addresses',
      timestamps: true,
      underscored: true,
      comment: '用户收货地址表'
    }
  )

  return UserAddress
}
