/**
 * 报表模板模型
 *
 * 业务场景：
 * - 支持自定义报表模板配置（列、筛选、聚合、图表）
 * - 支持多种报表类型（抽奖、消费、用户、库存等）
 * - 支持定时调度和多格式导出
 *
 * 表名：report_templates
 * 创建时间：2026年01月31日
 */

'use strict'

const { DataTypes } = require('sequelize')

/**
 * 报表模板类型枚举
 * @readonly
 * @enum {string}
 */
const TEMPLATE_TYPES = {
  LOTTERY: 'lottery', // 抽奖报表
  CONSUMPTION: 'consumption', // 消费报表
  USER: 'user', // 用户报表
  INVENTORY: 'inventory', // 库存报表
  FINANCIAL: 'financial', // 财务报表
  OPERATIONAL: 'operational', // 运营报表
  CUSTOM: 'custom' // 自定义报表
}

/**
 * 导出格式枚举
 * @readonly
 * @enum {string}
 */
const EXPORT_FORMATS = {
  EXCEL: 'excel',
  CSV: 'csv',
  PDF: 'pdf',
  JSON: 'json'
}

module.exports = sequelize => {
  const ReportTemplate = sequelize.define(
    'ReportTemplate',
    {
      /**
       * 报表模板ID（主键）
       * @type {number}
       * 命名规范：{table_name}_id
       */
      report_template_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '报表模板ID（主键，符合{table_name}_id规范）'
      },

      /**
       * 模板编码（唯一标识）
       * @type {string}
       * @example 'daily_lottery_summary'
       */
      template_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '模板编码'
      },

      /**
       * 模板名称（中文）
       * @type {string}
       * @example '每日抽奖汇总报表'
       */
      template_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '模板名称'
      },

      /**
       * 模板描述
       * @type {string|null}
       */
      template_description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '模板描述'
      },

      /**
       * 模板类型
       * @type {string}
       * @see TEMPLATE_TYPES
       */
      template_type: {
        type: DataTypes.ENUM(...Object.values(TEMPLATE_TYPES)),
        allowNull: false,
        comment: '模板类型'
      },

      /**
       * 报表分类（用于前端分组显示）
       * @type {string|null}
       */
      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '报表分类'
      },

      /**
       * 数据源配置
       * @type {Object}
       * @example { tables: ['lottery_draws'], primary: 'lottery_draws', joins: [...] }
       */
      data_source_config: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '数据源配置'
      },

      /**
       * 列配置
       * @type {Array}
       * @example [{ field: 'user_id', label: '用户ID', type: 'number' }]
       */
      columns_config: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '列配置'
      },

      /**
       * 筛选条件配置
       * @type {Array|null}
       * @example [{ field: 'created_at', type: 'date_range', label: '日期范围' }]
       */
      filters_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '筛选条件配置'
      },

      /**
       * 聚合配置
       * @type {Object|null}
       * @example { group_by: ['date'], sum: ['amount'], count: ['id'] }
       */
      aggregation_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '聚合配置'
      },

      /**
       * 图表配置
       * @type {Object|null}
       * @example { type: 'line', x_axis: 'date', y_axis: 'count' }
       */
      chart_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '图表配置'
      },

      /**
       * 支持的导出格式
       * @type {string[]}
       */
      export_formats: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: ['excel', 'csv'],
        comment: '支持的导出格式'
      },

      /**
       * 默认导出格式
       * @type {string}
       */
      default_export_format: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'excel',
        comment: '默认导出格式'
      },

      /**
       * 定时调度配置
       * @type {Object|null}
       * @example { enabled: true, cron: '0 8 * * *', recipients: [1, 2, 3] }
       */
      schedule_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '定时调度配置'
      },

      /**
       * 上次生成时间
       * @type {Date|null}
       */
      last_generated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '上次生成时间'
      },

      /**
       * 是否启用
       * @type {boolean}
       */
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      /**
       * 是否系统内置模板
       * @type {boolean}
       */
      is_system: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否系统内置模板'
      },

      /**
       * 创建者ID
       * @type {number|null}
       */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建者ID'
      },

      /**
       * 最后更新者ID
       * @type {number|null}
       */
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后更新者ID'
      }
    },
    {
      sequelize,
      modelName: 'ReportTemplate',
      tableName: 'report_templates',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '报表模板表',

      indexes: [
        { unique: true, fields: ['template_code'], name: 'idx_report_templates_code' },
        { fields: ['template_type'], name: 'idx_report_templates_type' },
        { fields: ['is_enabled'], name: 'idx_report_templates_enabled' },
        { fields: ['is_system'], name: 'idx_report_templates_system' }
      ],

      scopes: {
        /**
         * 启用的模板
         */
        enabled: {
          where: { is_enabled: true }
        },

        /**
         * 系统内置模板
         */
        system: {
          where: { is_system: true }
        },

        /**
         * 自定义模板（非系统内置）
         */
        custom: {
          where: { is_system: false }
        },

        /**
         * 按类型筛选
         * @param {string} type - 模板类型
         * @returns {Object} Sequelize 查询条件
         */
        byType(type) {
          return {
            where: { template_type: type }
          }
        }
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void} 无返回值
   */
  ReportTemplate.associate = function (models) {
    // 创建者关联
    ReportTemplate.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    })

    // 更新者关联
    ReportTemplate.belongsTo(models.User, {
      foreignKey: 'updated_by',
      as: 'updater'
    })
  }

  /**
   * 检查模板是否可删除
   * @returns {boolean} 如果模板非系统内置则可删除
   */
  ReportTemplate.prototype.canDelete = function () {
    return !this.is_system
  }

  /**
   * 更新生成时间
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<ReportTemplate>} 更新后的模板实例
   */
  ReportTemplate.prototype.updateGeneratedTime = async function (options = {}) {
    this.last_generated_at = new Date()
    return this.save(options)
  }

  /**
   * 获取有效的列配置
   * @returns {Array} 有效的列配置数组
   */
  ReportTemplate.prototype.getValidColumns = function () {
    if (!Array.isArray(this.columns_config)) {
      return []
    }
    return this.columns_config.filter(col => col && col.field && col.label)
  }

  /**
   * 获取有效的筛选配置
   * @returns {Array} 有效的筛选配置数组
   */
  ReportTemplate.prototype.getValidFilters = function () {
    if (!Array.isArray(this.filters_config)) {
      return []
    }
    return this.filters_config.filter(filter => filter && filter.field && filter.type)
  }

  // 导出常量
  ReportTemplate.TEMPLATE_TYPES = TEMPLATE_TYPES
  ReportTemplate.EXPORT_FORMATS = EXPORT_FORMATS

  return ReportTemplate
}
