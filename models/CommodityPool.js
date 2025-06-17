/**
 * 商品库存模型 - CommodityPool
 * 🔴 前端对接要点：
 * - stock: 实时库存显示，WebSocket同步
 * - exchange_points: 兑换所需积分（前端价格显示）
 * - category: 商品分类（前端筛选用）
 * - status: 商品状态（前端可用性判断）
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CommodityPool = sequelize.define('commodity_pool', {
  // 🔴 商品ID - 前端兑换标识
  commodity_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '商品ID'
  },
  
  // 🔴 商品名称 - 前端显示
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '商品名称（前端显示）'
  },
  
  // 商品描述
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '商品描述'
  },
  
  // 🔴 商品分类 - 前端筛选功能
  category: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '商品分类（前端筛选用）'
  },
  
  // 🔴 兑换积分 - 前端价格显示
  exchange_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    },
    comment: '兑换所需积分（前端价格显示）'
  },
  
  // 🔴 库存数量 - 前端实时显示，WebSocket同步
  stock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    },
    comment: '库存数量（前端实时显示，WebSocket同步）'
  },
  
  // 商品图片
  image: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: '商品图片URL'
  },
  
  // 🔴 商品状态 - 前端可用性判断
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'sold_out'),
    allowNull: false,
    defaultValue: 'active',
    comment: '商品状态'
  },
  
  // 🔴 热门商品 - 前端推荐标识
  is_hot: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '热门商品标记（前端推荐）'
  },
  
  // 🔴 排序权重 - 前端排序
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序权重（前端排序）'
  },
  
  // 🔴 评分 - 前端星级显示
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: false,
    defaultValue: 5.0,
    validate: {
      min: 0,
      max: 5
    },
    comment: '评分（前端星级显示）'
  },
  
  // 🔴 销量 - 前端排序用
  sales_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    },
    comment: '销量（前端排序用）'
  }
}, {
  tableName: 'commodity_pool',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  
  // 索引配置 - 针对前端查询优化
  indexes: [
    {
      name: 'idx_category',
      fields: ['category']
    },
    {
      name: 'idx_exchange_points',
      fields: ['exchange_points']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_stock',
      fields: ['stock']
    },
    {
      name: 'idx_is_hot',
      fields: ['is_hot']
    },
    {
      name: 'idx_sort_order',
      fields: ['sort_order']
    },
    {
      name: 'idx_sales_count',
      fields: ['sales_count']
    },
    // 🔴 复合索引 - 前端筛选查询优化
    {
      name: 'idx_category_points_stock',
      fields: ['category', 'exchange_points', 'stock']
    }
  ]
});

// 🔴 实例方法 - 获取前端显示的商品状态
CommodityPool.prototype.getFrontendStatus = function() {
  if (this.stock <= 0) {
    return 'sold_out';
  }
  return this.status === 'active' ? 'available' : 'unavailable';
};

// 🔴 实例方法 - 获取前端商品信息
CommodityPool.prototype.getFrontendInfo = function() {
  return {
    id: this.commodity_id,
    name: this.name,
    description: this.description,
    category: this.category,
    exchange_points: this.exchange_points,
    stock: this.stock, // 🔴 实时库存
    image: this.image,
    is_hot: this.is_hot,
    rating: this.rating,
    sales_count: this.sales_count,
    status: this.getFrontendStatus() // 🔴 前端状态判断
  };
};

// 🔴 类方法 - 前端商品列表查询（支持筛选分页）
CommodityPool.getProductsForFrontend = async function(options = {}) {
  const {
    category,
    min_points,
    max_points,
    stock_status,
    sort_by = 'sort_order',
    sort_order = 'ASC',
    page = 1,
    limit = 20
  } = options;
  
  // 构建查询条件
  const whereClause = { status: 'active' };
  
  if (category && category !== '全部') {
    whereClause.category = category;
  }
  
  if (min_points) {
    whereClause.exchange_points = { [sequelize.Op.gte]: parseInt(min_points) };
  }
  
  if (max_points) {
    if (whereClause.exchange_points) {
      whereClause.exchange_points[sequelize.Op.lte] = parseInt(max_points);
    } else {
      whereClause.exchange_points = { [sequelize.Op.lte]: parseInt(max_points) };
    }
  }
  
  if (stock_status === 'in_stock') {
    whereClause.stock = { [sequelize.Op.gt]: 0 };
  } else if (stock_status === 'out_of_stock') {
    whereClause.stock = 0;
  }
  
  // 分页查询
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await CommodityPool.findAndCountAll({
    where: whereClause,
    order: [[sort_by, sort_order.toUpperCase()]],
    limit: parseInt(limit),
    offset: offset
  });
  
  return {
    products: rows.map(product => product.getFrontendInfo()),
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(count / parseInt(limit))
    }
  };
};

// 🔴 类方法 - 扣减库存（事务安全）
CommodityPool.decreaseStock = async function(commodityId, quantity, transaction) {
  const product = await CommodityPool.findByPk(commodityId, { 
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  
  if (!product) {
    throw new Error('商品不存在');
  }
  
  if (product.stock < quantity) {
    throw new Error(`库存不足，当前库存：${product.stock}，需要：${quantity}`);
  }
  
  // 原子性扣减库存
  await product.decrement('stock', { by: quantity, transaction });
  
  // 增加销量
  await product.increment('sales_count', { by: quantity, transaction });
  
  // 更新状态
  const newStock = product.stock - quantity;
  if (newStock <= 0) {
    await product.update({ status: 'sold_out' }, { transaction });
  }
  
  return newStock;
};

module.exports = CommodityPool; 