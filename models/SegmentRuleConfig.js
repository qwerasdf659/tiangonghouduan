'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 用户分群规则配置模型
 * 职责：存储运营可配置的分群策略版本及其规则
 * 业务场景：运营在管理后台自助配置分群条件，SegmentResolver 优先读取此表
 */
class SegmentRuleConfig extends Model {
  /**
   * 模型关联定义
   * @param {Object} _models - 全部已注册的 Sequelize 模型集合
   * @returns {void}
   */
  static associate(_models) {
    /* 预留：创建人关联 User 模型 */
  }
}

module.exports = sequelize => {
  SegmentRuleConfig.init(
    {
      /** 自增主键 */
      segment_rule_config_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        comment: '分群规则配置ID'
      },
      /** 版本标识（唯一，如 default、v1、custom_spring_2026） */
      version_key: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        comment: '版本标识，如 default、v1、custom_spring_2026'
      },
      /** 版本名称（运营可见） */
      version_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '版本显示名称，如"不分群"、"新老用户分层"'
      },
      /** 版本描述 */
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '版本描述'
      },
      /**
       * 规则数组（JSON）
       * 结构：[{ segment_key, label, conditions: [{field, operator, value}], logic, priority }]
       */
      rules: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '分群规则数组（条件构建器生成的规则 JSON）'
      },
      /** 是否系统内置（1=不可删除） */
      is_system: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 0,
        comment: '是否系统内置：1=内置（不可删除），0=自定义'
      },
      /** 状态：active=启用，archived=已归档 */
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态：active=启用，archived=已归档'
      },
      /** 创建人用户ID */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人用户ID'
      }
    },
    {
      sequelize,
      modelName: 'SegmentRuleConfig',
      tableName: 'segment_rule_configs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '用户分群规则配置表（运营可视化搭建分群条件）'
    }
  )

  return SegmentRuleConfig
}
