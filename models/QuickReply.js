/**
 * 快速回复模板模型
 * 管理客服快速回复模板
 * 创建时间：2025年01月28日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const QuickReply = sequelize.define(
    'QuickReply',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'ID'
      },

      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '管理员ID(NULL表示公共模板)'
      },

      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '模板标题'
      },

      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '回复内容'
      },

      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '分类'
      },

      usage_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '使用次数'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否启用'
      }
    },
    {
      tableName: 'quick_replies',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          fields: ['admin_id']
        },
        {
          fields: ['category']
        },
        {
          fields: ['is_active']
        }
      ],
      comment: '快速回复模板表'
    }
  )

  // 定义关联关系
  QuickReply.associate = function (models) {
    // 模板可能属于某个管理员
    QuickReply.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin'
    })
  }

  // 实例方法
  QuickReply.prototype.isPublic = function () {
    return this.admin_id === null
  }

  QuickReply.prototype.belongsToAdmin = function (adminId) {
    return this.admin_id === adminId
  }

  QuickReply.prototype.incrementUsage = function () {
    return this.increment('usage_count', { by: 1 })
  }

  QuickReply.prototype.toggleActive = function () {
    return this.update({ is_active: !this.is_active })
  }

  // 类方法
  QuickReply.findAvailableForAdmin = function (adminId, category = null) {
    const where = {
      is_active: true,
      [sequelize.Op.or]: [
        { admin_id: null }, // 公共模板
        { admin_id: adminId } // 个人模板
      ]
    }

    if (category) {
      where.category = category
    }

    return this.findAll({
      where,
      order: [
        ['category', 'ASC'],
        ['usage_count', 'DESC'],
        ['created_at', 'DESC']
      ]
    })
  }

  QuickReply.findByCategory = function (category, adminId = null) {
    const where = {
      category,
      is_active: true
    }

    if (adminId !== null) {
      where[sequelize.Op.or] = [{ admin_id: null }, { admin_id: adminId }]
    }

    return this.findAll({
      where,
      order: [
        ['usage_count', 'DESC'],
        ['created_at', 'DESC']
      ]
    })
  }

  QuickReply.getPopularReplies = function (adminId = null, limit = 10) {
    const where = { is_active: true }

    if (adminId !== null) {
      where[sequelize.Op.or] = [{ admin_id: null }, { admin_id: adminId }]
    }

    return this.findAll({
      where,
      order: [['usage_count', 'DESC']],
      limit
    })
  }

  QuickReply.createForAdmin = function (adminId, data) {
    return this.create({
      ...data,
      admin_id: adminId
    })
  }

  QuickReply.createPublic = function (data) {
    return this.create({
      ...data,
      admin_id: null
    })
  }

  QuickReply.getCategories = async function (adminId = null) {
    const where = { is_active: true, category: { [sequelize.Op.ne]: null } }

    if (adminId !== null) {
      where[sequelize.Op.or] = [{ admin_id: null }, { admin_id: adminId }]
    }

    const categories = await this.findAll({
      attributes: ['category', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where,
      group: ['category'],
      order: [['category', 'ASC']]
    })

    return categories.map(cat => ({
      category: cat.category,
      count: parseInt(cat.dataValues.count)
    }))
  }

  return QuickReply
}
