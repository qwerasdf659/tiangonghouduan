/**
 * 兑换订单模型 - 记录商品兑换订单
 * 🔴 前端对接要点：
 * - 商品兑换记录
 * - 订单状态管理
 * - 兑换统计支持
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExchangeOrder = sequelize.define('ExchangeOrder', {
  // 🔴 主键字段
  order_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '订单ID'
  },
  
  // 🔴 用户信息
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID',
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  
  // 🔴 商品信息
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '商品ID',
    references: {
      model: 'products',
      key: 'commodity_id'
    }
  },
  
  product_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '商品名称'
  },
  
  product_image: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '商品图片'
  },
  
  // 🔴 兑换信息
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: '兑换数量',
    validate: {
      min: 1
    }
  },
  
  unit_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '单价积分',
    validate: {
      min: 0
    }
  },
  
  total_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '总消耗积分',
    validate: {
      min: 0
    }
  },
  
  // 🔴 收货信息
  recipient_name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '收货人姓名'
  },
  
  recipient_phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: '收货人电话'
  },
  
  shipping_address: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '收货地址'
  },
  
  postal_code: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: '邮政编码'
  },
  
  // 🔴 订单状态
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded'),
    allowNull: false,
    defaultValue: 'pending',
    comment: '订单状态'
  },
  
  // 🔴 时间信息
  confirm_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '确认时间'
  },
  
  ship_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '发货时间'
  },
  
  delivery_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '送达时间'
  },
  
  cancel_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '取消时间'
  },
  
  // 🔴 物流信息
  tracking_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '快递单号'
  },
  
  logistics_company: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '物流公司'
  },
  
  // 🔴 备注信息
  user_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '用户备注'
  },
  
  admin_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '管理员备注'
  },
  
  cancel_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '取消原因'
  }
}, {
  tableName: 'exchange_orders',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['product_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['tracking_number']
    }
  ]
});

// 🔴 实例方法：获取订单详细信息
ExchangeOrder.prototype.getOrderInfo = function() {
  return {
    order_id: this.order_id,
    product_info: {
      id: this.product_id,
      name: this.product_name,
      image: this.product_image
    },
    exchange_info: {
      quantity: this.quantity,
      unit_points: this.unit_points,
      total_points: this.total_points
    },
    recipient_info: {
      name: this.recipient_name,
      phone: this.recipient_phone,
      address: this.shipping_address,
      postal_code: this.postal_code
    },
    status: this.status,
    created_at: this.created_at,
    tracking_info: {
      number: this.tracking_number,
      company: this.logistics_company
    }
  };
};

// 🔴 实例方法：检查是否可以取消
ExchangeOrder.prototype.canCancel = function() {
  return ['pending', 'confirmed'].includes(this.status);
};

// 🔴 实例方法：取消订单
ExchangeOrder.prototype.cancelOrder = async function(reason = '') {
  if (!this.canCancel()) {
    throw new Error('订单当前状态不允许取消');
  }
  
  await this.update({
    status: 'cancelled',
    cancel_time: new Date(),
    cancel_reason: reason
  });
};

// 🔴 实例方法：更新物流信息
ExchangeOrder.prototype.updateShipping = async function(trackingNumber, company) {
  await this.update({
    status: 'shipped',
    ship_time: new Date(),
    tracking_number: trackingNumber,
    logistics_company: company
  });
};

// 🔴 类方法：创建兑换订单
ExchangeOrder.createOrder = async function(orderData, transaction = null) {
  const options = transaction ? { transaction } : {};
  
  // 计算总积分
  const totalPoints = orderData.unit_points * orderData.quantity;
  
  const order = await this.create({
    user_id: orderData.user_id,
    product_id: orderData.product_id,
    product_name: orderData.product_name,
    product_image: orderData.product_image,
    quantity: orderData.quantity,
    unit_points: orderData.unit_points,
    total_points: totalPoints,
    recipient_name: orderData.recipient_name,
    recipient_phone: orderData.recipient_phone,
    shipping_address: orderData.shipping_address,
    postal_code: orderData.postal_code,
    user_notes: orderData.user_notes
  }, options);
  
  return order;
};

// 🔴 类方法：获取用户订单统计
ExchangeOrder.getUserStats = async function(userId, period = 'all') {
  const { Op } = require('sequelize');
  
  let dateFilter = {};
  const now = new Date();
  
  switch (period) {
    case 'today':
      dateFilter = {
        created_at: {
          [Op.gte]: new Date(now.getFullYear(), now.getMonth(), now.getDate())
        }
      };
      break;
    case 'week':
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      dateFilter = {
        created_at: {
          [Op.gte]: weekStart
        }
      };
      break;
    case 'month':
      dateFilter = {
        created_at: {
          [Op.gte]: new Date(now.getFullYear(), now.getMonth(), 1)
        }
      };
      break;
  }
  
  const whereClause = {
    user_id: userId,
    ...dateFilter
  };
  
  const totalOrders = await this.count({ where: whereClause });
  const totalPoints = await this.sum('total_points', { where: whereClause });
  
  const statusStats = await this.findAll({
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('order_id')), 'count']
    ],
    where: whereClause,
    group: ['status'],
    raw: true
  });
  
  return {
    total_orders: totalOrders,
    total_points: totalPoints || 0,
    status_distribution: statusStats.map(item => ({
      status: item.status,
      count: parseInt(item.count)
    }))
  };
};

// 🔴 类方法：获取系统兑换统计
ExchangeOrder.getSystemStats = async function(period = 'today') {
  const { Op } = require('sequelize');
  
  let dateFilter = {};
  const now = new Date();
  
  switch (period) {
    case 'today':
      dateFilter = {
        created_at: {
          [Op.gte]: new Date(now.getFullYear(), now.getMonth(), now.getDate())
        }
      };
      break;
    case 'week':
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      dateFilter = {
        created_at: {
          [Op.gte]: weekStart
        }
      };
      break;
    case 'month':
      dateFilter = {
        created_at: {
          [Op.gte]: new Date(now.getFullYear(), now.getMonth(), 1)
        }
      };
      break;
  }
  
  const totalOrders = await this.count({ where: dateFilter });
  const totalPoints = await this.sum('total_points', { where: dateFilter });
  const uniqueUsers = await this.count({
    where: dateFilter,
    distinct: true,
    col: 'user_id'
  });
  
  return {
    total_orders: totalOrders,
    total_points: totalPoints || 0,
    unique_users: uniqueUsers,
    avg_points_per_order: totalOrders > 0 ? (totalPoints / totalOrders).toFixed(2) : 0
  };
};

module.exports = ExchangeOrder; 