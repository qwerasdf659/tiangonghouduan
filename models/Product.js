/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 商品模型
 * 支持幸运空间和臻选空间的商品管理
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const Product = sequelize.define(
    'Product',
    {
      // 基础信息 - 符合{table_name}_id命名规范
      product_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '商品唯一ID（主键）'
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
        comment:
          '【已废弃】旧商品图片URL字段（2026-01-08图片存储架构已迁移到primary_image_id关联image_resources表）'
      },
      primary_image_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'image_resources',
          key: 'image_id'
        },
        comment: '商品主图片ID（关联image_resources表，用于多图片管理中的主图指定）'
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

      // 价格库存（商品的价值体系和库存管理）
      exchange_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment:
          '兑换所需积分（单个商品的积分价格，业务规则：根据商品价值定价，1积分≈1元人民币价值，用途：用户兑换时扣除积分、计算total_points、显示商品价格，范围：0-99999，定价建议：参考市场价格和商品成本）'
      },
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment:
          '库存数量（商品的可兑换数量，业务规则：用户兑换时扣减、审核拒绝/取消时恢复、库存为0时不可兑换，库存管理：低于low_stock_threshold时预警，用途：兑换前验证、库存统计、补货提醒，更新方式：使用Product.increment/decrement原子操作）'
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
      },

      // ===== 🆕 臻选空间差异化字段（方案2）=====
      premium_exchange_points: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '臻选空间专属积分（NULL表示使用exchange_points，用于实现不同空间不同价格）'
      },
      premium_stock: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '臻选空间独立库存（NULL表示与幸运空间共享stock，用于实现独立库存管理）'
      },
      premium_image: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        comment:
          '【已废弃】臻选空间专属图片URL（2026-01-08图片存储架构已迁移，新业务请使用primary_image_id关联image_resources表）'
      }
    },
    {
      tableName: 'products',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
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
        },
        {
          name: 'idx_products_premium_points',
          fields: ['premium_exchange_points']
        },
        {
          name: 'idx_products_premium_stock',
          fields: ['premium_stock']
        }
      ],
      comment: '商品表 - 支持幸运空间和臻选空间'
    }
  )

  // 实例方法

  /**
   * 获取商品在指定空间的展示信息（方案2核心方法）
   * @param {string} request_space - 请求的空间 ('lucky'|'premium')
   * @returns {Object|null} 商品在该空间的展示信息，如果商品不在该空间则返回null
   *
   * 业务逻辑说明：
   * - space='lucky': 只在幸运空间展示，使用原始字段（exchange_points, stock, image）
   * - space='premium': 只在臻选空间展示，使用原始字段
   * - space='both': 同时在两个空间展示，根据request_space返回对应配置
   *   - 请求lucky空间：返回原始字段（exchange_points, stock, image）
   *   - 请求premium空间：返回premium_*字段（如果有），否则使用原始字段
   */
  Product.prototype.getSpaceInfo = function (request_space) {
    // 检查商品是否在请求的空间可用
    if (this.space !== 'both' && this.space !== request_space) {
      return null // 商品不在该空间，返回null
    }

    // 基础信息（所有空间共享） - 返回纯JSON对象
    const base_info = JSON.parse(
      JSON.stringify({
        product_id: this.product_id,
        name: this.name,
        description: this.description,
        category: this.category,
        status: this.status,
        is_hot: this.is_hot,
        is_new: this.is_new,
        is_limited: this.is_limited,
        sort_order: this.sort_order,
        rating: this.rating,
        warranty: this.warranty,
        delivery_info: this.delivery_info,
        expires_at: this.expires_at,
        original_price: this.original_price,
        discount: this.discount,
        created_at: this.created_at,
        updated_at: this.updated_at
      })
    )

    // 臻选空间且商品支持both：使用premium_*字段（如果有）
    if (request_space === 'premium' && this.space === 'both') {
      return {
        ...base_info,
        space: request_space, // 标记为premium空间
        exchange_points:
          this.premium_exchange_points !== null
            ? this.premium_exchange_points
            : this.exchange_points,
        stock: this.premium_stock !== null ? this.premium_stock : this.stock,
        image: this.premium_image || this.image,
        // 额外标记：是否使用了专属配置
        using_premium_config:
          this.premium_exchange_points !== null ||
          this.premium_stock !== null ||
          this.premium_image !== null
      }
    }

    // 幸运空间或单一空间商品：使用原始字段
    return {
      ...base_info,
      space: this.space === 'both' ? request_space : this.space,
      exchange_points: this.exchange_points,
      stock: this.stock,
      image: this.image,
      using_premium_config: false
    }
  }

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
      _category = null,
      _limit = 20,
      _offset = 0,
      sortBy = 'sort_order',
      order = 'DESC',
      _includeOutOfStock = false
    } = options

    const whereClause = {
      status: 'active'
    }

    // 空间筛选
    if (space !== 'both') {
      whereClause.space = [space, 'both']
    }

    // 分类筛选
    if (_category) {
      whereClause.category = _category
    }

    // 库存筛选（需要考虑premium_stock字段）
    if (!_includeOutOfStock) {
      // 复杂查询：幸运空间检查stock>0，臻选空间检查premium_stock>0或stock>0
      if (space === 'premium') {
        whereClause[sequelize.Sequelize.Op.or] = [
          { premium_stock: { [sequelize.Sequelize.Op.gt]: 0 } }, // 臻选独立库存>0
          {
            [sequelize.Sequelize.Op.and]: [
              { premium_stock: null }, // 无独立库存
              { stock: { [sequelize.Sequelize.Op.gt]: 0 } } // 共享库存>0
            ]
          }
        ]
      } else {
        whereClause.stock = { [sequelize.Sequelize.Op.gt]: 0 } // 幸运空间检查stock>0
      }
    }

    const products = await Product.findAll({
      where: whereClause,
      order: [[sortBy, order]],
      limit: _limit,
      offset: _offset
    })

    // 转换为对应空间的展示信息
    return products.map(p => p.getSpaceInfo(space)).filter(Boolean)
  }

  // 定义模型关联
  Product.associate = function (models) {
    // 关联到主图片资源
    if (models.ImageResources) {
      Product.belongsTo(models.ImageResources, {
        foreignKey: 'primary_image_id',
        as: 'primaryImage',
        comment: '商品主图片关联'
      })
    }
  }

  return Product
}
