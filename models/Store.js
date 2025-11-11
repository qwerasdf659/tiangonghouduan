/**
 * 门店信息模型 - 餐厅积分抽奖系统 V4.0 统一引擎架构
 * 业务场景：记录合作商家门店信息，用于业务员分派和消费记录关联
 * 创建时间：2025年11月07日
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const Store = sequelize.define(
    'Store',
    {
      // 门店ID（主键）
      store_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '门店ID（主键）'
      },

      // 门店名称
      store_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '门店名称（如：某某餐厅XX店）'
      },

      // 门店编号（唯一标识）
      store_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true,
        comment: '门店编号（唯一标识，如：ST20250101001）'
      },

      // 门店地址
      store_address: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '门店地址（详细地址）'
      },

      // 门店联系人
      contact_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '门店联系人姓名'
      },

      // 联系电话
      contact_mobile: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '门店联系电话'
      },

      // 所属区域
      region: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '所属区域（如：东城区、西城区）'
      },

      // 门店状态
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'pending'),
        defaultValue: 'active',
        comment: '门店状态：active-正常营业，inactive-已关闭，pending-待审核'
      },

      // 分配给哪个业务员
      assigned_to: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '分配给哪个业务员（外键关联users.user_id）'
      },

      // 商户ID
      merchant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '商户ID（关联商家用户，外键关联users.user_id）'
      },

      // 备注信息
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '备注信息'
      }
    },
    {
      tableName: 'stores',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        { unique: true, fields: ['store_code'] },
        { fields: ['status'] },
        { fields: ['region'] },
        { fields: ['assigned_to'] },
        { fields: ['merchant_id'] }
      ],
      comment: '门店信息表（用于记录合作商家门店，业务员分派依据）',

      // 钩子函数：确保使用北京时间
      hooks: {
        beforeSave: (store, _options) => {
          if (!store.created_at) {
            store.created_at = BeijingTimeHelper.createDatabaseTime()
          }
          store.updated_at = BeijingTimeHelper.createDatabaseTime()
        }
      }
    }
  )

  // 定义关联关系
  Store.associate = function (models) {
    // 多对一：多个门店分配给一个业务员
    Store.belongsTo(models.User, {
      foreignKey: 'assigned_to',
      as: 'assigned_staff',
      comment: '分配的业务员'
    })

    // 多对一：多个门店属于一个商户
    Store.belongsTo(models.User, {
      foreignKey: 'merchant_id',
      as: 'merchant',
      comment: '商户信息'
    })

    /*
     * 🔴 注释掉：消费记录不关联门店（方案A：商家扫码录入）
     * 如果未来需要门店维度的消费记录，需要先添加数据库迁移：
     * - ALTER TABLE consumption_records ADD COLUMN store_id INT
     * - ADD FOREIGN KEY (store_id) REFERENCES stores(store_id)
     *
     * if (models.ConsumptionRecord) {
     *   Store.hasMany(models.ConsumptionRecord, {
     *     foreignKey: 'store_id',
     *     as: 'consumption_records',
     *     comment: '门店的消费记录'
     *   })
     * }
     */

    // 一对多：一个门店有多个层级关系记录（业务员分派历史）
    if (models.UserHierarchy) {
      Store.hasMany(models.UserHierarchy, {
        foreignKey: 'store_id',
        as: 'hierarchy_records',
        comment: '业务员分派历史记录'
      })
    }
  }

  return Store
}
