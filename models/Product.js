/**
 * 餐厅积分抽奖系统 v2.0 - 商品模型
 * 支持幸运空间和臻选空间的商品管理
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const Product = sequelize.define(
    'Product',
    {
      // 基础信息
      commodity_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '商品唯一ID'
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '商品名称'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '商品描述'
      },
      image: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '商品图片URL'
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: '优惠券',
        comment: '商品分类'
      },
      space: {
        type: DataTypes.ENUM('lucky', 'premium', 'both'),
        allowNull: false,
        defaultValue: 'lucky',
        comment: '所属空间：lucky-幸运空间，premium-臻选空间，both-两个空间都有'
      },

      // 价格库存
      exchange_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '兑换所需积分'
      },
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '库存数量'
      },
      original_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '原价（显示用）'
      },
      discount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '折扣百分比'
      },
      low_stock_threshold: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
        comment: '低库存预警阈值'
      },

      // 状态标识
      status: {
        type: DataTypes.ENUM('active', 'offline', 'deleted'),
        allowNull: false,
        defaultValue: 'active',
        comment: '商品状态'
      },
      is_hot: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否热门商品'
      },
      is_new: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否新品'
      },
      is_limited: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否限量商品'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序权重'
      },

      // 业务信息
      sales_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '销量统计'
      },
      view_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '浏览次数'
      },
      rating: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: true,
        comment: '评分'
      },
      warranty: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '售后说明'
      },
      delivery_info: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '配送信息'
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间（限时商品）'
      },

      // 系统字段
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建者用户ID'
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后更新者用户ID'
      }
    },
    {
      tableName: 'products',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          name: 'idx_products_space_status',
          fields: ['space', 'status']
        },
        {
          name: 'idx_products_category',
          fields: ['category']
        },
        {
          name: 'idx_products_stock',
          fields: ['stock']
        },
        {
          name: 'idx_products_sort_order',
          fields: ['sort_order']
        }
      ],
      comment: '商品表 - 支持幸运空间和臻选空间'
    }
  )

  // 实例方法
  Product.prototype.getStockStatus = function () {
    if (this.stock <= 0) {
      return 'out_of_stock'
    } else if (this.stock <= this.low_stock_threshold) {
      return 'low_stock'
    } else {
      return 'in_stock'
    }
  }

  Product.prototype.isAvailable = function () {
    return this.status === 'active' && this.stock > 0
  }

  Product.prototype.canAccess = function (userSpace) {
    return this.space === 'both' || this.space === userSpace
  }

  // 类方法
  Product.getProductsBySpace = async function (space, options = {}) {
    const {
      category = null,
      limit = 20,
      offset = 0,
      sortBy = 'sort_order',
      order = 'DESC',
      includeOutOfStock = false
    } = options

    const whereClause = {
      status: 'active'
    }

    // 空间筛选
    if (space !== 'both') {
      whereClause.space = [space, 'both']
    }

    // 分类筛选
    if (category) {
      whereClause.category = category
    }

    // 库存筛选
    if (!includeOutOfStock) {
      whereClause.stock = { [sequelize.Sequelize.Op.gt]: 0 }
    }

    return await Product.findAll({
      where: whereClause,
      order: [[sortBy, order]],
      limit,
      offset
    })
  }

  return Product
}
