/**
 * SystemDictionary 系统字典模型
 *
 * 用于存储各类枚举的中文显示名称映射，是中文化显示名称系统的核心数据源
 *
 * 核心功能：
 * 1. 存储 dict_type + dict_code 到 dict_name 的映射
 * 2. 支持前端颜色配置（dict_color）
 * 3. 版本管理和审计追溯
 * 4. Redis 缓存配合提升查询性能
 *
 * 表名：system_dictionaries
 * 主键：dict_id（自增）
 * 唯一约束：dict_type + dict_code
 *
 * @module models/SystemDictionary
 * @author 中文化显示名称系统
 * @since 2026-01-22
 * @see docs/中文化显示名称实施文档.md
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const SystemDictionary = sequelize.define(
    'SystemDictionary',
    {
      /**
       * 字典ID（自增主键）
       */
      dict_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: '字典ID（自增主键）'
      },

      /**
       * 字典类型
       * 用于区分不同类别的枚举，如：user_status, order_status, operation_type
       */
      dict_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '字典类型（如：order_status, user_status）'
      },

      /**
       * 字典编码
       * 英文标识符，与代码中的枚举值一致
       */
      dict_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '字典编码（英文值，如：pending, completed）'
      },

      /**
       * 字典名称（中文显示值）
       * 前端展示用的中文名称
       */
      dict_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '字典名称（中文显示值）'
      },

      /**
       * 前端显示颜色
       * Bootstrap 颜色类名，如：bg-success, bg-warning, bg-danger
       */
      dict_color: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
        comment: '前端显示颜色（如：bg-success, bg-warning）'
      },

      /**
       * 排序值
       * 同类型内的显示排序，值越小越靠前
       */
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序（同类型内排序，值越小越靠前）'
      },

      /**
       * 是否启用
       * 0: 禁用（不返回给前端）
       * 1: 启用（正常显示）
       */
      is_enabled: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
        comment: '是否启用（0禁用 1启用）'
      },

      /**
       * 备注说明
       * 用于记录该字典项的业务含义或使用场景
       */
      remark: {
        type: DataTypes.STRING(200),
        allowNull: true,
        defaultValue: null,
        comment: '备注说明'
      },

      /**
       * 版本号
       * 每次修改后递增，用于版本管理和回滚
       */
      version: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
        comment: '版本号（每次修改+1）'
      },

      /**
       * 最后修改人ID
       * 关联 users.user_id
       */
      updated_by: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        comment: '最后修改人ID（关联 users.user_id）'
      }
    },
    {
      tableName: 'system_dictionaries',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['dict_type', 'dict_code'],
          name: 'uk_type_code'
        },
        {
          fields: ['dict_type'],
          name: 'idx_type'
        },
        {
          fields: ['is_enabled'],
          name: 'idx_enabled'
        },
        {
          fields: ['version'],
          name: 'idx_version'
        }
      ],
      comment: '系统字典表 - 存储各类枚举的中文显示名称映射'
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - Sequelize 模型集合
   * @returns {void}
   */
  SystemDictionary.associate = function (models) {
    // 修改人关联
    if (models.User) {
      SystemDictionary.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater',
        constraints: false // 软关联，不创建外键约束
      })
    }

    // 与历史记录的关联
    if (models.SystemDictionaryHistory) {
      SystemDictionary.hasMany(models.SystemDictionaryHistory, {
        foreignKey: 'dict_id',
        as: 'histories'
      })
    }
  }

  // ==================== Scopes（查询范围） ====================

  /**
   * 查询范围定义
   * 支持快捷查询，提高代码可读性
   */
  SystemDictionary.addScope('enabled', {
    where: { is_enabled: 1 }
  })

  SystemDictionary.addScope('byType', dictType => ({
    where: { dict_type: dictType }
  }))

  SystemDictionary.addScope('ordered', {
    order: [
      ['dict_type', 'ASC'],
      ['sort_order', 'ASC'],
      ['dict_id', 'ASC']
    ]
  })

  // ==================== 类方法 ====================

  /**
   * 根据类型和编码查找字典项
   *
   * @param {string} dictType - 字典类型
   * @param {string} dictCode - 字典编码
   * @returns {Promise<SystemDictionary|null>} 字典项记录
   */
  SystemDictionary.findByTypeAndCode = function (dictType, dictCode) {
    return this.findOne({
      where: {
        dict_type: dictType,
        dict_code: dictCode,
        is_enabled: 1
      }
    })
  }

  /**
   * 获取指定类型的所有启用字典项
   *
   * @param {string} dictType - 字典类型
   * @returns {Promise<SystemDictionary[]>} 字典项列表
   */
  SystemDictionary.findAllByType = function (dictType) {
    return this.scope('enabled', { method: ['byType', dictType] }, 'ordered').findAll()
  }

  /**
   * 获取所有启用的字典项（按类型分组）
   *
   * @returns {Promise<Object>} 按 dict_type 分组的字典数据
   * 格式：{ user_status: [{...}, {...}], order_status: [{...}] }
   */
  SystemDictionary.findAllGroupedByType = async function () {
    const items = await this.scope('enabled', 'ordered').findAll()

    const grouped = {}
    for (const item of items) {
      const type = item.dict_type
      if (!grouped[type]) {
        grouped[type] = []
      }
      grouped[type].push({
        dict_code: item.dict_code,
        dict_name: item.dict_name,
        dict_color: item.dict_color,
        sort_order: item.sort_order
      })
    }

    return grouped
  }

  /**
   * 获取所有字典类型列表
   *
   * @returns {Promise<string[]>} 字典类型列表
   */
  SystemDictionary.findAllTypes = async function () {
    const result = await this.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('dict_type')), 'dict_type']],
      where: { is_enabled: 1 },
      raw: true
    })

    return result.map(item => item.dict_type)
  }

  /**
   * 批量获取显示名称
   * 用于一次性获取多个字典项的中文名称
   *
   * @param {Array<{type: string, code: string}>} items - 要查询的字典项
   * @returns {Promise<Map<string, {name: string, color: string}>>} 映射表
   * 键格式：`${type}:${code}`
   */
  SystemDictionary.batchGetDisplayNames = async function (items) {
    if (!items || items.length === 0) {
      return new Map()
    }

    // 构建 OR 条件
    const { Op } = require('sequelize')
    const conditions = items.map(({ type, code }) => ({
      dict_type: type,
      dict_code: code
    }))

    const records = await this.findAll({
      where: {
        [Op.or]: conditions,
        is_enabled: 1
      }
    })

    // 构建映射表
    const result = new Map()
    for (const record of records) {
      const key = `${record.dict_type}:${record.dict_code}`
      result.set(key, {
        name: record.dict_name,
        color: record.dict_color
      })
    }

    return result
  }

  return SystemDictionary
}
