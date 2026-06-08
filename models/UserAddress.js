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
const PiiCrypto = require('../utils/PiiCrypto')

/**
 * 脱敏收件人姓名（保留姓氏，其余用 * 替代）
 * @param {string} name - 收件人姓名明文
 * @returns {string} 脱敏后的姓名（如 王**）
 */
function maskName(name) {
  if (!name) return name
  const s = String(name)
  if (s.length <= 1) return s
  return s[0] + '*'.repeat(s.length - 1)
}

/**
 * 脱敏手机号（保留前3后4，中间 ****）
 * @param {string} phone - 手机号明文
 * @returns {string} 脱敏后的手机号（如 138****1234）
 */
function maskPhone(phone) {
  if (!phone) return phone
  const s = String(phone)
  if (s.length < 7) return s
  return s.substring(0, 3) + '****' + s.substring(s.length - 4)
}

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

  /**
   * 返回脱敏后的地址对象（用于展示/列表，避免完整 PII 下发）
   * @returns {Object} 脱敏后的地址（姓名/手机号脱敏，详细地址保留供发货）
   */
  toMaskedJSON() {
    return {
      address_id: this.address_id,
      user_id: this.user_id,
      receiver_name: maskName(this.receiver_name),
      receiver_phone: maskPhone(this.receiver_phone),
      province: this.province,
      city: this.city,
      district: this.district,
      detail_address: this.detail_address,
      postal_code: this.postal_code,
      is_default: this.is_default
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
      /** 收件人姓名（虚拟字段：读解密密文，写同步密文） */
      receiver_name: {
        type: DataTypes.VIRTUAL(DataTypes.STRING, ['receiver_name_encrypted']),
        /**
         * @returns {string|null} 收件人姓名明文
         */
        get() {
          return PiiCrypto.decrypt(this.getDataValue('receiver_name_encrypted'))
        },
        /**
         * @param {string} value - 收件人姓名明文
         * @returns {void}
         */
        set(value) {
          this.setDataValue('receiver_name_encrypted', PiiCrypto.encrypt(value))
        },
        comment: '收件人姓名（虚拟字段，密文存 receiver_name_encrypted）'
      },
      /** 收件人姓名密文列 */
      receiver_name_encrypted: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '收件人姓名密文（AES-256-GCM）'
      },
      /** 收件人手机号（虚拟字段：读解密密文，写同步密文） */
      receiver_phone: {
        type: DataTypes.VIRTUAL(DataTypes.STRING, ['receiver_phone_encrypted']),
        /**
         * @returns {string|null} 收件人手机号明文
         */
        get() {
          return PiiCrypto.decrypt(this.getDataValue('receiver_phone_encrypted'))
        },
        /**
         * @param {string} value - 收件人手机号明文
         * @returns {void}
         */
        set(value) {
          this.setDataValue('receiver_phone_encrypted', PiiCrypto.encrypt(value))
        },
        comment: '收件人手机号（虚拟字段，密文存 receiver_phone_encrypted）'
      },
      /** 收件人手机号密文列 */
      receiver_phone_encrypted: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '收件人手机号密文（AES-256-GCM）'
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
      /** 详细地址（虚拟字段：读解密密文，写同步密文） */
      detail_address: {
        type: DataTypes.VIRTUAL(DataTypes.STRING, ['detail_address_encrypted']),
        /**
         * @returns {string|null} 详细地址明文
         */
        get() {
          return PiiCrypto.decrypt(this.getDataValue('detail_address_encrypted'))
        },
        /**
         * @param {string} value - 详细地址明文
         * @returns {void}
         */
        set(value) {
          this.setDataValue('detail_address_encrypted', PiiCrypto.encrypt(value))
        },
        comment: '详细地址（虚拟字段，密文存 detail_address_encrypted）'
      },
      /** 详细地址密文列 */
      detail_address_encrypted: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        comment: '详细地址密文（AES-256-GCM）'
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
