/**
 * 数据库迁移：创建行政区划字典表
 *
 * @description 创建 administrative_regions 表，用于存储标准化的省市区街道数据
 * @purpose 支持门店管理的省市区级联选择功能
 * @data_source https://github.com/modood/Administrative-divisions-of-China
 *
 * 表结构说明：
 * - region_code: 行政区划代码（GB/T 2260标准，主键）
 * - parent_code: 父级区划代码（用于级联查询）
 * - region_name: 区划名称（如"海淀区"）
 * - level: 层级（1=省级, 2=市级, 3=区县级, 4=街道/乡镇）
 * - short_name: 简称（如"京"）
 * - pinyin: 拼音（用于搜索）
 * - longitude/latitude: 经纬度（可选，用于地图展示）
 * - status: 状态（active=有效, merged=已合并, abolished=已撤销）
 * - sort_order: 排序权重
 *
 * @since 2026-01-12
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：创建 administrative_regions 表
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize 类
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    // 1. 创建行政区划字典表
    await queryInterface.createTable(
      'administrative_regions',
      {
        /**
         * 行政区划代码（主键）
         * - 省级：6位（如 110000 = 北京市）
         * - 市级：6位（如 110100 = 北京市）
         * - 区县级：6位（如 110108 = 海淀区）
         * - 街道级：9位（如 110108001 = 万寿路街道）
         */
        region_code: {
          type: Sequelize.STRING(12),
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
          type: Sequelize.STRING(12),
          allowNull: true,
          defaultValue: null,
          comment: '父级区划代码（省的parent_code为NULL）'
        },

        /**
         * 区划名称（如"海淀区"、"万寿路街道"）
         */
        region_name: {
          type: Sequelize.STRING(100),
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
          type: Sequelize.TINYINT,
          allowNull: false,
          comment: '层级（1=省级, 2=市级, 3=区县级, 4=街道/乡镇）'
        },

        /**
         * 简称（如"京"代表北京）
         */
        short_name: {
          type: Sequelize.STRING(50),
          allowNull: true,
          defaultValue: null,
          comment: '简称（如"京"）'
        },

        /**
         * 拼音（用于搜索，如"haidian"）
         */
        pinyin: {
          type: Sequelize.STRING(100),
          allowNull: true,
          defaultValue: null,
          comment: '拼音（如"haidian"，用于搜索）'
        },

        /**
         * 经度（可选，用于地图展示）
         */
        longitude: {
          type: Sequelize.DECIMAL(10, 7),
          allowNull: true,
          defaultValue: null,
          comment: '经度（可选，用于地图展示）'
        },

        /**
         * 纬度（可选）
         */
        latitude: {
          type: Sequelize.DECIMAL(10, 7),
          allowNull: true,
          defaultValue: null,
          comment: '纬度（可选）'
        },

        /**
         * 状态
         * - active: 有效
         * - merged: 已合并（行政区划调整）
         * - abolished: 已撤销
         */
        status: {
          type: Sequelize.ENUM('active', 'merged', 'abolished'),
          allowNull: false,
          defaultValue: 'active',
          comment: '状态（active=有效, merged=已合并, abolished=已撤销）'
        },

        /**
         * 排序权重（用于前端展示排序）
         */
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '排序权重（用于前端展示排序）'
        },

        /**
         * 创建时间
         */
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间'
        },

        /**
         * 更新时间
         */
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间'
        }
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '行政区划字典表（省市区街道数据，支持级联选择）'
      }
    )

    // 2. 创建索引
    // 父级代码索引（用于级联查询子级列表）
    await queryInterface.addIndex('administrative_regions', ['parent_code'], {
      name: 'idx_administrative_regions_parent_code'
    })

    // 层级+状态联合索引（用于查询某一层级的有效区划）
    await queryInterface.addIndex('administrative_regions', ['level', 'status'], {
      name: 'idx_administrative_regions_level_status'
    })

    // 区划名称索引（用于搜索）
    await queryInterface.addIndex('administrative_regions', ['region_name'], {
      name: 'idx_administrative_regions_region_name'
    })

    // 拼音索引（用于拼音搜索）
    await queryInterface.addIndex('administrative_regions', ['pinyin'], {
      name: 'idx_administrative_regions_pinyin'
    })

    console.log('✅ 创建 administrative_regions 表完成')
  },

  /**
   * 回滚迁移：删除 administrative_regions 表
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @returns {Promise<void>}
   */
  async down(queryInterface) {
    await queryInterface.dropTable('administrative_regions')
    console.log('✅ 删除 administrative_regions 表完成')
  }
}
