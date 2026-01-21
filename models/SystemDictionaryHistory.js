/**
 * SystemDictionaryHistory 系统字典历史模型
 *
 * 用于记录系统字典的历史版本，支持版本回滚和审计追溯
 *
 * 核心功能：
 * 1. 记录字典修改前的值（修改前快照）
 * 2. 支持版本回滚功能
 * 3. 审计追溯（谁在什么时候修改了什么）
 *
 * 表名：system_dictionary_history
 * 主键：history_id（自增）
 * 外键：dict_id（关联 system_dictionaries.dict_id）
 *
 * @module models/SystemDictionaryHistory
 * @author 中文化显示名称系统
 * @since 2026-01-22
 * @see docs/中文化显示名称实施文档.md
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const SystemDictionaryHistory = sequelize.define(
    'SystemDictionaryHistory',
    {
      /**
       * 历史记录ID（自增主键）
       */
      history_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: '历史记录ID（自增主键）'
      },

      /**
       * 字典ID
       * 关联 system_dictionaries.dict_id
       */
      dict_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: '字典ID（关联 system_dictionaries.dict_id）'
      },

      /**
       * 字典类型
       * 冗余存储，方便查询和展示
       */
      dict_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '字典类型（冗余存储）'
      },

      /**
       * 字典编码
       * 冗余存储，方便查询和展示
       */
      dict_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '字典编码（冗余存储）'
      },

      /**
       * 修改前的中文名称
       */
      dict_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '修改前的中文名称'
      },

      /**
       * 修改前的颜色
       */
      dict_color: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
        comment: '修改前的颜色'
      },

      /**
       * 版本号
       * 对应修改前的版本号
       */
      version: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: '版本号（修改前的版本）'
      },

      /**
       * 修改人ID
       * 关联 users.user_id
       */
      changed_by: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: '修改人ID（关联 users.user_id）'
      },

      /**
       * 修改时间
       * 记录该版本被修改的时间
       */
      changed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '修改时间'
      },

      /**
       * 修改原因
       * 可选，用于记录为什么要修改
       */
      change_reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
        defaultValue: null,
        comment: '修改原因'
      }
    },
    {
      tableName: 'system_dictionary_history',
      timestamps: false, // 使用自定义的 changed_at 字段
      underscored: true,
      indexes: [
        {
          fields: ['dict_id'],
          name: 'idx_dict_id'
        },
        {
          fields: ['dict_id', 'version'],
          name: 'idx_dict_version'
        },
        {
          fields: ['changed_at'],
          name: 'idx_changed_at'
        }
      ],
      comment: '系统字典历史表 - 支持版本回滚和审计追溯'
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - Sequelize 模型集合
   * @returns {void}
   */
  SystemDictionaryHistory.associate = function (models) {
    // 关联字典主表
    if (models.SystemDictionary) {
      SystemDictionaryHistory.belongsTo(models.SystemDictionary, {
        foreignKey: 'dict_id',
        as: 'dictionary'
      })
    }

    // 修改人关联
    if (models.User) {
      SystemDictionaryHistory.belongsTo(models.User, {
        foreignKey: 'changed_by',
        as: 'changer',
        constraints: false // 软关联
      })
    }
  }

  // ==================== 类方法 ====================

  /**
   * 根据字典ID获取所有历史版本
   *
   * @param {number} dictId - 字典ID
   * @returns {Promise<SystemDictionaryHistory[]>} 历史版本列表（按版本号降序）
   */
  SystemDictionaryHistory.findByDictId = function (dictId) {
    return this.findAll({
      where: { dict_id: dictId },
      order: [['version', 'DESC']]
    })
  }

  /**
   * 获取指定字典的特定版本
   *
   * @param {number} dictId - 字典ID
   * @param {number} version - 版本号
   * @returns {Promise<SystemDictionaryHistory|null>} 历史版本记录
   */
  SystemDictionaryHistory.findByDictIdAndVersion = function (dictId, version) {
    return this.findOne({
      where: {
        dict_id: dictId,
        version
      }
    })
  }

  /**
   * 获取指定字典的最新历史版本
   *
   * @param {number} dictId - 字典ID
   * @returns {Promise<SystemDictionaryHistory|null>} 最新历史版本
   */
  SystemDictionaryHistory.findLatestByDictId = function (dictId) {
    return this.findOne({
      where: { dict_id: dictId },
      order: [['version', 'DESC']]
    })
  }

  /**
   * 创建历史记录（在更新字典前调用）
   *
   * @param {Object} dictionary - 当前字典记录
   * @param {number} changedBy - 修改人ID
   * @param {string} [changeReason] - 修改原因
   * @param {Object} [options] - Sequelize 选项（如 transaction）
   * @returns {Promise<SystemDictionaryHistory>} 创建的历史记录
   */
  SystemDictionaryHistory.createFromDictionary = function (
    dictionary,
    changedBy,
    changeReason = null,
    options = {}
  ) {
    return this.create(
      {
        dict_id: dictionary.dict_id,
        dict_type: dictionary.dict_type,
        dict_code: dictionary.dict_code,
        dict_name: dictionary.dict_name,
        dict_color: dictionary.dict_color,
        version: dictionary.version,
        changed_by: changedBy,
        change_reason: changeReason
      },
      options
    )
  }

  /**
   * 获取指定时间范围内的修改记录
   *
   * @param {Date} startDate - 开始时间
   * @param {Date} endDate - 结束时间
   * @returns {Promise<SystemDictionaryHistory[]>} 历史记录列表
   */
  SystemDictionaryHistory.findByDateRange = function (startDate, endDate) {
    const { Op } = require('sequelize')

    return this.findAll({
      where: {
        changed_at: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['changed_at', 'DESC']]
    })
  }

  return SystemDictionaryHistory
}
