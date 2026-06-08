'use strict'

/**
 * DecorationSeason 模型 - 装饰赛季/限定周期
 *
 * 业务定位（路线B 合规改造 模块D / 第十节）：
 * - 赛季造稀缺、促当季星石消耗；限定款绝版机制。
 * - 配置实体：业务码 season_code 稳定标识。
 *
 * 数据库表：decoration_season（主键 decoration_season_id）
 *
 * @module models/DecorationSeason
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 装饰赛季模型类
   * @class DecorationSeason
   * @extends Model
   */
  class DecorationSeason extends Model {
    /**
     * 静态关联定义
     * @param {Object} models - 全部模型集合
     * @returns {void}
     */
    static associate(models) {
      if (models.DecorationSku) {
        DecorationSeason.hasMany(models.DecorationSku, {
          foreignKey: 'decoration_season_id',
          as: 'decorations'
        })
      }
    }
  }

  DecorationSeason.init(
    {
      decoration_season_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '装饰赛季主键'
      },
      season_code: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: '赛季业务码（唯一稳定标识，如 s2026_summer）'
      },
      season_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '赛季名称（展示用）'
      },
      start_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '赛季开始时间（北京时间）'
      },
      end_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '赛季结束时间（北京时间）'
      },
      status: {
        type: DataTypes.ENUM('draft', 'active', 'ended'),
        allowNull: false,
        defaultValue: 'draft',
        comment: '赛季状态：draft-草稿 active-进行中 ended-已结束'
      }
    },
    {
      sequelize,
      modelName: 'DecorationSeason',
      tableName: 'decoration_season',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '装饰赛季/限定周期表（造稀缺促星石消耗）'
    }
  )

  return DecorationSeason
}
