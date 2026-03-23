/**
 * 门店信息模型 - 餐厅积分抽奖系统 V4.0 统一引擎架构
 *
 * @description 记录合作商家门店信息，用于业务员分派和消费记录关联
 *
 * 业务场景：
 * - 商户门店管理（CRUD）
 * - 业务员分派和区域管理
 * - 消费记录门店维度统计
 * - 省市区街道级联选择（四级行政区划）
 *
 * 技术特性：
 * - 行政区划采用"code + name 冗余"设计
 * - code 字段用于索引和关联查询
 * - name 字段用于展示（避免每次查询关联字典表）
 * - 支持四级级联：省 → 市 → 区县 → 街道
 *
 * @since 2025
 * @updated 2026-01-12 新增省市区街道字段（8个）
 */

'use strict'

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 门店信息模型定义
 *
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {Model} Store 模型
 */
module.exports = sequelize => {
  const Store = sequelize.define(
    'Store',
    {
      /**
       * 门店ID（主键）
       */
      store_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '门店ID（主键）'
      },

      /**
       * 门店名称（如：某某餐厅XX店）
       */
      store_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '门店名称（如：某某餐厅XX店）'
      },

      /**
       * 门店编号（唯一标识，如：ST20250101001）
       */
      store_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true,
        comment: '门店编号（唯一标识，如：ST20250101001）'
      },

      /**
       * 门店详细地址（街道门牌号）
       */
      store_address: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '门店详细地址（街道门牌号）'
      },

      /**
       * 门店联系人姓名
       */
      contact_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '门店联系人姓名'
      },

      /**
       * 门店联系电话
       */
      contact_mobile: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '门店联系电话'
      },

      /*
       * =================================================================
       * 省市区街道行政区划字段（8个）
       * 设计理念：code 用于索引关联，name 用于展示（冗余设计）
       * =================================================================
       */

      /**
       * 省级行政区划代码
       * @example "110000" - 北京市
       */
      province_code: {
        type: DataTypes.STRING(12),
        allowNull: false,
        comment: '省级行政区划代码（必填，用于关联查询，如 110000）'
      },

      /**
       * 省级名称（冗余字段，修改区域时刷新）
       * @example "北京市"
       */
      province_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '省级名称（冗余字段，修改区域时刷新）'
      },

      /**
       * 市级行政区划代码
       * @example "110100" - 北京市
       */
      city_code: {
        type: DataTypes.STRING(12),
        allowNull: false,
        comment: '市级行政区划代码（必填，用于关联查询，如 110100）'
      },

      /**
       * 市级名称（冗余字段）
       * @example "北京市"
       */
      city_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '市级名称（冗余字段，修改区域时刷新）'
      },

      /**
       * 区县级行政区划代码
       * @example "110108" - 海淀区
       */
      district_code: {
        type: DataTypes.STRING(12),
        allowNull: false,
        comment: '区县级行政区划代码（必填，用于关联查询，如 110108）'
      },

      /**
       * 区县级名称（冗余字段）
       * @example "海淀区"
       */
      district_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '区县级名称（冗余字段，修改区域时刷新）'
      },

      /**
       * 街道级行政区划代码
       * @example "110108001" - 万寿路街道
       */
      street_code: {
        type: DataTypes.STRING(12),
        allowNull: false,
        comment: '街道级行政区划代码（必填，门店必须精确到街道）'
      },

      /**
       * 街道级名称（冗余字段）
       * @example "万寿路街道"
       */
      street_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '街道级名称（冗余字段，修改区域时刷新）'
      },

      /*
       * =================================================================
       * 其他业务字段
       * =================================================================
       */

      /**
       * 门店状态
       * - active: 正常营业
       * - inactive: 已关闭
       * - pending: 待审核
       */
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'pending'),
        defaultValue: 'active',
        comment: '门店状态：active-正常营业，inactive-已关闭，pending-待审核'
      },

      /**
       * 分配给哪个业务员（外键关联 users.user_id）
       */
      assigned_to: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '分配给哪个业务员（外键关联users.user_id）'
      },

      /**
       * 归属商家ID（关联 merchants 表）
       * NULL 表示未分配商家
       */
      merchant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'merchants',
          key: 'merchant_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '归属商家ID（关联 merchants 表，NULL=未分配）'
      },

      /**
       * 备注信息
       */
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

      // 索引定义（与迁移文件一致）
      indexes: [
        { unique: true, fields: ['store_code'], name: 'idx_stores_store_code' },
        { fields: ['status'], name: 'idx_stores_status' },
        { fields: ['province_code'], name: 'idx_stores_province_code' },
        { fields: ['city_code'], name: 'idx_stores_city_code' },
        { fields: ['district_code'], name: 'idx_stores_district_code' },
        { fields: ['street_code'], name: 'idx_stores_street_code' },
        { fields: ['assigned_to'], name: 'idx_stores_assigned_to' },
        { fields: ['merchant_id'], name: 'idx_stores_merchant_id' }
      ],

      comment: '门店信息表（用于记录合作商家门店，业务员分派依据）',

      // Scopes：常用查询快捷方式
      scopes: {
        /**
         * 仅查询正常营业的门店
         */
        active: {
          where: { status: 'active' }
        },

        /**
         * 仅查询待审核的门店
         */
        pending: {
          where: { status: 'pending' }
        },

        /**
         * 仅查询已关闭的门店
         */
        inactive: {
          where: { status: 'inactive' }
        }
      },

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

  /**
   * 定义关联关系
   * @param {Object} models - 所有模型
   * @returns {void}
   */
  Store.associate = function (models) {
    // 多对一：多个门店分配给一个业务员
    Store.belongsTo(models.User, {
      foreignKey: 'assigned_to',
      as: 'assigned_staff',
      comment: '分配的业务员'
    })

    // 多对一：多个门店属于一个商家
    if (models.Merchant) {
      Store.belongsTo(models.Merchant, {
        foreignKey: 'merchant_id',
        as: 'merchant',
        comment: '归属商家'
      })
    }

    // 关联行政区划字典（用于验证和查询）
    if (models.AdministrativeRegion) {
      // 省级关联
      Store.belongsTo(models.AdministrativeRegion, {
        foreignKey: 'province_code',
        targetKey: 'region_code',
        as: 'province',
        constraints: false, // 不创建外键约束（字典表数据量大）
        comment: '省级行政区划'
      })

      // 市级关联
      Store.belongsTo(models.AdministrativeRegion, {
        foreignKey: 'city_code',
        targetKey: 'region_code',
        as: 'city',
        constraints: false,
        comment: '市级行政区划'
      })

      // 区县级关联
      Store.belongsTo(models.AdministrativeRegion, {
        foreignKey: 'district_code',
        targetKey: 'region_code',
        as: 'district',
        constraints: false,
        comment: '区县级行政区划'
      })

      // 街道级关联
      Store.belongsTo(models.AdministrativeRegion, {
        foreignKey: 'street_code',
        targetKey: 'region_code',
        as: 'street',
        constraints: false,
        comment: '街道级行政区划'
      })
    }

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

  /*
   * =================================================================
   * 静态方法：常用查询逻辑
   * =================================================================
   */

  /**
   * 获取门店的完整地区显示名称
   *
   * @param {Object} store - 门店实例
   * @returns {string} 完整地区名称（如"北京市 北京市 海淀区 万寿路街道"）
   */
  Store.getFullRegionName = function (store) {
    const parts = [
      store.province_name,
      store.city_name,
      store.district_name,
      store.street_name
    ].filter(Boolean)

    return parts.join(' ')
  }

  /**
   * 获取门店的地区代码数组
   *
   * @param {Object} store - 门店实例
   * @returns {Array<string>} 地区代码数组（用于级联选择器回显）
   */
  Store.getRegionCodes = function (store) {
    return [store.province_code, store.city_code, store.district_code, store.street_code].filter(
      Boolean
    )
  }

  return Store
}
