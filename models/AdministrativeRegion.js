/**
 * 行政区划字典模型 - 餐厅积分抽奖系统 V4.0
 *
 * @description 标准化的省市区街道行政区划数据字典
 *              支持四级级联选择：省 → 市 → 区县 → 街道
 *
 * 业务场景：
 * - 门店管理时的省市区街道级联选择
 * - 按区域维度统计门店数量、消费记录等
 * - 区域经理权限隔离（基于 province_code/city_code/district_code）
 *
 * 数据来源：
 * - GitHub: modood/Administrative-divisions-of-China
 * - 标准：GB/T 2260 行政区划代码
 *
 * 技术特性：
 * - region_code 为主键（6位或9位行政区划代码）
 * - parent_code 用于级联查询
 * - level 标识层级（1=省, 2=市, 3=区县, 4=街道）
 * - 支持拼音搜索（pinyin 字段）
 *
 * @since 2026-01-12
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 行政区划字典模型定义
 *
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {Model} AdministrativeRegion 模型
 */
module.exports = sequelize => {
  const AdministrativeRegion = sequelize.define(
    'AdministrativeRegion',
    {
      /**
       * 行政区划代码（主键）
       * - 省级：6位（如 110000 = 北京市）
       * - 市级：6位（如 110100 = 北京市）
       * - 区县级：6位（如 110108 = 海淀区）
       * - 街道级：9位（如 110108001 = 万寿路街道）
       */
      region_code: {
        type: DataTypes.STRING(12),
        primaryKey: true,
        allowNull: false,
        comment: '行政区划代码（GB/T 2260标准，如110108）'
      },

      /**
       * 父级区划代码（用于级联查询）
       * - 省级的 parent_code 为 NULL
       * - 市级的 parent_code 为省级代码
       * - 区县级的 parent_code 为市级代码
       * - 街道级的 parent_code 为区县级代码
       */
      parent_code: {
        type: DataTypes.STRING(12),
        allowNull: true,
        defaultValue: null,
        comment: '父级区划代码（省的parent_code为NULL）'
      },

      /**
       * 区划名称（如"海淀区"、"万寿路街道"）
       */
      region_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '区划名称（如"海淀区"）'
      },

      /**
       * 层级标识
       * - 1 = 省级（省、直辖市、自治区）
       * - 2 = 市级（地级市、直辖市辖区）
       * - 3 = 区县级（区、县、县级市）
       * - 4 = 街道/乡镇级
       */
      level: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '层级（1=省级, 2=市级, 3=区县级, 4=街道/乡镇）'
      },

      /**
       * 简称（如"京"代表北京）
       */
      short_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
        comment: '简称（如"京"）'
      },

      /**
       * 拼音（用于搜索，如"haidian"）
       */
      pinyin: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null,
        comment: '拼音（如"haidian"，用于搜索）'
      },

      /**
       * 经度（可选，用于地图展示）
       */
      longitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
        defaultValue: null,
        comment: '经度（可选，用于地图展示）',
        /**
         * 获取经度值，将DECIMAL转换为浮点数
         * @returns {number|null} 经度值或null
         */
        get() {
          const value = this.getDataValue('longitude')
          return value ? parseFloat(value) : null
        }
      },

      /**
       * 纬度（可选）
       */
      latitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
        defaultValue: null,
        comment: '纬度（可选）',
        /**
         * 获取纬度值，将DECIMAL转换为浮点数
         * @returns {number|null} 纬度值或null
         */
        get() {
          const value = this.getDataValue('latitude')
          return value ? parseFloat(value) : null
        }
      },

      /**
       * 状态
       * - active: 有效
       * - merged: 已合并（行政区划调整）
       * - abolished: 已撤销
       */
      status: {
        type: DataTypes.ENUM('active', 'merged', 'abolished'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态（active=有效, merged=已合并, abolished=已撤销）'
      },

      /**
       * 排序权重（用于前端展示排序）
       */
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序权重（用于前端展示排序）'
      }
    },
    {
      tableName: 'administrative_regions',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,

      // 索引定义（与迁移文件一致）
      indexes: [
        { fields: ['parent_code'], name: 'idx_administrative_regions_parent_code' },
        { fields: ['level', 'status'], name: 'idx_administrative_regions_level_status' },
        { fields: ['region_name'], name: 'idx_administrative_regions_region_name' },
        { fields: ['pinyin'], name: 'idx_administrative_regions_pinyin' }
      ],

      comment: '行政区划字典表（省市区街道数据，支持级联选择）',

      // Scopes：常用查询快捷方式
      scopes: {
        /**
         * 仅查询有效状态的区划
         */
        active: {
          where: { status: 'active' }
        },

        /**
         * 查询省级区划
         */
        provinces: {
          where: { level: 1, status: 'active' }
        },

        /**
         * 查询市级区划
         */
        cities: {
          where: { level: 2, status: 'active' }
        },

        /**
         * 查询区县级区划
         */
        districts: {
          where: { level: 3, status: 'active' }
        },

        /**
         * 查询街道级区划
         */
        streets: {
          where: { level: 4, status: 'active' }
        }
      },

      // 钩子函数：确保使用北京时间
      hooks: {
        beforeSave: (region, _options) => {
          if (!region.created_at) {
            region.created_at = BeijingTimeHelper.createDatabaseTime()
          }
          region.updated_at = BeijingTimeHelper.createDatabaseTime()
        }
      }
    }
  )

  /**
   * 定义关联关系
   * @param {Object} _models - 所有模型（保留参数用于Sequelize关联系统）
   * @returns {void}
   */
  AdministrativeRegion.associate = function (_models) {
    // 自关联：父级区划
    AdministrativeRegion.belongsTo(AdministrativeRegion, {
      foreignKey: 'parent_code',
      targetKey: 'region_code',
      as: 'parent',
      constraints: false, // 不创建外键约束（字典表数据量大，避免约束开销）
      comment: '父级行政区划'
    })

    // 自关联：子级区划列表
    AdministrativeRegion.hasMany(AdministrativeRegion, {
      foreignKey: 'parent_code',
      sourceKey: 'region_code',
      as: 'children',
      constraints: false,
      comment: '子级行政区划列表'
    })
  }

  /*
   * =================================================================
   * 静态方法：常用查询逻辑
   * =================================================================
   */

  /**
   * 获取省级列表
   *
   * @returns {Promise<Array>} 省级区划列表
   */
  AdministrativeRegion.getProvinces = async function () {
    return this.scope('provinces').findAll({
      attributes: ['region_code', 'region_name', 'short_name', 'pinyin', 'sort_order'],
      order: [
        ['sort_order', 'ASC'],
        ['region_code', 'ASC']
      ]
    })
  }

  /**
   * 获取子级区划列表
   *
   * @param {string} parentCode - 父级区划代码
   * @returns {Promise<Array>} 子级区划列表
   */
  AdministrativeRegion.getChildren = async function (parentCode) {
    return this.scope('active').findAll({
      where: { parent_code: parentCode },
      attributes: ['region_code', 'region_name', 'level', 'pinyin', 'sort_order'],
      order: [
        ['sort_order', 'ASC'],
        ['region_code', 'ASC']
      ]
    })
  }

  /**
   * 按关键词搜索区划
   *
   * @param {string} keyword - 搜索关键词（名称或拼音）
   * @param {Object} options - 搜索选项
   * @param {number} [options.level] - 限制层级
   * @param {number} [options.limit=20] - 结果数量限制
   * @returns {Promise<Array>} 匹配的区划列表
   */
  AdministrativeRegion.search = async function (keyword, options = {}) {
    const { level, limit = 20 } = options
    const { Op } = require('sequelize')

    const where = {
      status: 'active',
      [Op.or]: [
        { region_name: { [Op.like]: `%${keyword}%` } },
        { pinyin: { [Op.like]: `%${keyword}%` } }
      ]
    }

    if (level) {
      where.level = level
    }

    return this.findAll({
      where,
      attributes: ['region_code', 'region_name', 'level', 'parent_code', 'pinyin'],
      limit,
      order: [
        ['level', 'ASC'],
        ['sort_order', 'ASC']
      ]
    })
  }

  /**
   * 获取完整路径（如"北京市 > 北京市 > 海淀区"）
   *
   * @param {string} regionCode - 区划代码
   * @returns {Promise<string>} 完整路径字符串
   */
  AdministrativeRegion.getFullPath = async function (regionCode) {
    const path = []
    let currentCode = regionCode

    while (currentCode) {
      // eslint-disable-next-line no-await-in-loop
      const region = await this.findByPk(currentCode, {
        attributes: ['region_code', 'region_name', 'parent_code']
      })

      if (!region) break

      path.unshift(region.region_name)
      currentCode = region.parent_code
    }

    return path.join(' > ')
  }

  /**
   * 验证区划代码是否存在且有效
   *
   * @param {string} regionCode - 区划代码
   * @param {number} [expectedLevel] - 期望的层级
   * @returns {Promise<Object|null>} 区划信息或 null
   */
  AdministrativeRegion.validateCode = async function (regionCode, expectedLevel = null) {
    const where = {
      region_code: regionCode,
      status: 'active'
    }

    if (expectedLevel) {
      where.level = expectedLevel
    }

    return this.findOne({ where })
  }

  /**
   * 根据区划代码获取完整的 code + name 信息
   *
   * @param {Object} codes - 区划代码对象
   * @param {string} codes.province_code - 省级代码
   * @param {string} codes.city_code - 市级代码
   * @param {string} codes.district_code - 区县级代码
   * @param {string} [codes.street_code] - 街道级代码
   * @returns {Promise<Object>} 包含 code 和 name 的完整信息
   */
  AdministrativeRegion.getRegionNames = async function (codes) {
    const { Op } = require('sequelize')

    const codeList = [
      codes.province_code,
      codes.city_code,
      codes.district_code,
      codes.street_code
    ].filter(Boolean)

    const regions = await this.findAll({
      where: {
        region_code: { [Op.in]: codeList },
        status: 'active'
      },
      attributes: ['region_code', 'region_name', 'level']
    })

    const regionMap = {}
    regions.forEach(r => {
      regionMap[r.region_code] = r.region_name
    })

    return {
      province_code: codes.province_code,
      province_name: regionMap[codes.province_code] || null,
      city_code: codes.city_code,
      city_name: regionMap[codes.city_code] || null,
      district_code: codes.district_code,
      district_name: regionMap[codes.district_code] || null,
      street_code: codes.street_code || null,
      street_name: codes.street_code ? regionMap[codes.street_code] || null : null
    }
  }

  return AdministrativeRegion
}
