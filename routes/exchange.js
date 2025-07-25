/**
 * 商品兑换API路由
 * 🔴 前端对接要点：
 * - GET /api/exchange/products - 获取商品列表（支持筛选分页）
 * - POST /api/exchange/submit - 提交兑换订单
 * - GET /api/exchange/orders - 兑换订单查询
 */

const express = require('express');
const { User, CommodityPool, PointsRecord, sequelize } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const webSocketService = require('../services/websocket');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// 🔴 前端对接点10：获取商品列表
router.get('/products', authenticateToken, async (req, res) => {
  try {
    const {
      category,        // 商品分类筛选
      min_points,      // 最低积分筛选
      max_points,      // 最高积分筛选
      stock_status,    // 库存状态筛选
      sort = 'default', // 🔴 前端传递的sort参数
      page = 1,
      limit = 20
    } = req.query;
    
    // 🔴 修复：将前端的sort参数映射为数据库字段
    let sort_by = 'sort_order';
    let sort_order = 'ASC';
    
    if (sort === 'default') {
      sort_by = 'sort_order';
      sort_order = 'ASC';
    } else if (sort === 'points-asc') {
      sort_by = 'exchange_points';
      sort_order = 'ASC';
    } else if (sort === 'points-desc') {
      sort_by = 'exchange_points';
      sort_order = 'DESC';
    } else if (sort === 'newest') {
      sort_by = 'created_at';
      sort_order = 'DESC';
    }
    
    // 🔴 调用模型方法获取商品列表
    const result = await CommodityPool.getProductsForFrontend({
      category,
      min_points,
      max_points,
      stock_status,
      sort_by,
      sort_order,
      page,
      limit
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: result
    });
    
  } catch (error) {
    console.error('获取商品列表失败:', error);
    res.json({
      code: 4000,
      msg: '获取商品列表失败',
      data: null
    });
  }
});

// 🔴 前端对接点11：提交兑换订单
router.post('/submit', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { product_id, quantity = 1, delivery_info } = req.body;
    const userId = req.user.user_id;
    
    // 🔴 参数验证
    if (!product_id || quantity <= 0) {
      await transaction.rollback();
      return res.json({
        code: 4001,
        msg: '商品ID和数量不能为空',
        data: null
      });
    }
    
    // 🔴 获取商品信息并锁定库存
    const product = await CommodityPool.findByPk(product_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    
    if (!product) {
      await transaction.rollback();
      return res.json({
        code: 4002,
        msg: '商品不存在',
        data: null
      });
    }
    
    // 🔴 检查商品状态和库存
    if (product.status !== 'active') {
      await transaction.rollback();
      return res.json({
        code: 4003,
        msg: '商品已下架',
        data: null
      });
    }
    
    if (product.stock < quantity) {
      await transaction.rollback();
      return res.json({
        code: 4004,
        msg: '库存不足',
        data: {
          available_stock: product.stock,
          requested_quantity: quantity
        }
      });
    }
    
    // 🔴 计算所需积分
    const totalPoints = product.exchange_points * quantity;
    
    // 🔴 检查用户积分余额
    const user = await User.findByPk(userId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    
    if (user.total_points < totalPoints) {
      await transaction.rollback();
      return res.json({
        code: 4005,
        msg: '积分余额不足',
        data: {
          required: totalPoints,
          current: user.total_points,
          shortage: totalPoints - user.total_points
        }
      });
    }
    
    // 🔴 扣减库存（原子性操作）
    const newStock = await CommodityPool.decreaseStock(
      product_id, 
      quantity, 
      transaction
    );
    
    // 🔴 扣除用户积分
    await user.decrement('total_points', {
      by: totalPoints,
      transaction
    });
    
    const newBalance = user.total_points - totalPoints;
    
    // 🔴 生成兑换订单
    const orderId = generateOrderId();
    
    // 🔴 记录积分变动
    await PointsRecord.createRecord({
      user_id: userId,
      points: -totalPoints,
      description: `兑换商品：${product.name} x${quantity}`,
      source: 'exchange',
      balance_after: newBalance,
      related_id: orderId
    }, transaction);
    
    // 🔴 创建兑换订单记录
    const orderRecord = await createExchangeOrder({
      order_id: orderId,
      user_id: userId,
      product_id,
      commodity_name: product.name,
      quantity,
      unit_points: product.exchange_points,
      total_points: totalPoints,
      delivery_info,
      status: 'pending'
    }, transaction);
    
    await transaction.commit();
    
    // 🔴 WebSocket推送库存变更（实时更新所有用户）
    webSocketService.notifyStockUpdate(product_id, newStock, 'purchase');
    
    // 🔴 WebSocket推送积分变更（当前用户）
    webSocketService.notifyPointsUpdate(
      userId,
      newBalance,
      -totalPoints,
      `兑换${product.name}`
    );
    
    // 🔴 返回前端所需的订单信息
    res.json({
      code: 0,
      msg: 'success',
      data: {
        order_id: orderId,
        commodity_name: product.name,
        quantity,
        total_points: totalPoints,
        remaining_points: newBalance,
        estimated_delivery: getEstimatedDelivery(),
        status: 'pending'
      }
    });
    
    console.log(`🛍️ 用户 ${userId} 兑换商品：${product.name} x${quantity}，消耗${totalPoints}积分`);
    
  } catch (error) {
    await transaction.rollback();
    console.error('商品兑换失败:', error);
    res.json({
      code: 4000,
      msg: '兑换失败，请稍后重试',
      data: null
    });
  }
});

// 🔴 前端对接点12：兑换订单查询
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const {
      status,    // 订单状态筛选
      page = 1,
      limit = 20
    } = req.query;
    
    // 🔴 查询用户兑换记录
    const result = await getExchangeOrders(userId, {
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: result
    });
    
  } catch (error) {
    console.error('获取兑换订单失败:', error);
    res.json({
      code: 4000,
      msg: '获取订单失败',
      data: null
    });
  }
});

// 🔴 前端对接点：兑换记录查询（前端期望的接口）
// GET /api/exchange/records
router.get('/records', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const {
      page = 1,
      limit = 20,
      status = 'all'
    } = req.query;
    
    console.log(`📋 用户 ${userId} 查询兑换记录: page=${page}, limit=${limit}, status=${status}`);
    
    // 🔴 构建查询条件
    const whereClause = {
      user_id: userId,
      source: 'exchange',
      type: 'spend'  // 兑换都是消费类型
    };
    
    // 🔴 分页查询兑换记录
    const offset = (page - 1) * limit;
    const { count, rows } = await PointsRecord.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
      attributes: ['id', 'points', 'description', 'created_at', 'related_id', 'balance_after']
    });
    
    // 🔴 格式化兑换记录数据
    const records = rows.map(record => ({
      id: record.id,
      order_id: record.related_id,
      description: record.description,
      points_spent: Math.abs(record.points),
      exchange_time: record.created_at,
      status: 'completed', // 兑换记录都是已完成状态
      balance_after: record.balance_after
    }));
    
    // 🔴 统计信息
    const totalSpent = await PointsRecord.sum('points', {
      where: {
        user_id: userId,
        source: 'exchange',
        type: 'spend'
      }
    }) || 0;
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        records,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / limit),
          has_more: count > page * limit
        },
        statistics: {
          total_exchanges: count,
          total_points_spent: Math.abs(totalSpent)
        }
      }
    });
    
    console.log(`✅ 兑换记录查询成功: ${count}条记录, 总消费${Math.abs(totalSpent)}积分`);
    
  } catch (error) {
    console.error('获取兑换记录失败:', error);
    res.json({
      code: 4000,
      msg: '获取兑换记录失败',
      data: null
    });
  }
});

// 🔴 前端对接点13：商品分类列表
router.get('/categories', async (req, res) => {
  try {
    // 获取所有商品分类
    const categories = await CommodityPool.findAll({
      attributes: ['category'],
      where: { status: 'active' },
      group: ['category'],
      raw: true
    });
    
    const categoryList = categories.map(item => item.category);
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        categories: ['全部', ...categoryList]
      }
    });
    
  } catch (error) {
    console.error('获取商品分类失败:', error);
    res.json({
      code: 4000,
      msg: '获取分类失败',
      data: null
    });
  }
});

// 🔴 生成订单号
function generateOrderId() {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `EX${timestamp}${random}`;
}

// 🔴 前端对接点：兑换统计接口 - 修复前端getStatistics调用
// GET /api/exchange/statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    console.log(`📊 用户 ${userId} 查询兑换统计`);
    
    // 🔴 查询用户兑换相关的积分记录
    const exchangeRecords = await PointsRecord.findAll({
      where: {
        user_id: userId,
        source: 'exchange',
        type: 'spend'
      },
      order: [['created_at', 'DESC']],
      attributes: ['points', 'description', 'created_at', 'related_id']
    });
    
    // 🔴 计算统计数据
    const totalExchanges = exchangeRecords.length;
    const totalPointsSpent = exchangeRecords.reduce((sum, record) => sum + Math.abs(record.points), 0);
    
    // 🔴 最近兑换记录
    const recentExchanges = exchangeRecords.slice(0, 5).map(record => ({
      order_id: record.related_id,
      description: record.description,
      points: Math.abs(record.points),
      exchange_time: record.created_at
    }));
    
    // 🔴 按月统计兑换数据
    const monthlyStats = {};
    exchangeRecords.forEach(record => {
      const month = record.created_at.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyStats[month]) {
        monthlyStats[month] = { count: 0, points: 0 };
      }
      monthlyStats[month].count++;
      monthlyStats[month].points += Math.abs(record.points);
    });
    
    const statistics = {
      total_exchanges: totalExchanges,
      total_points_spent: totalPointsSpent,
      average_points_per_exchange: totalExchanges > 0 ? Math.round(totalPointsSpent / totalExchanges) : 0,
      recent_exchanges: recentExchanges,
      monthly_stats: monthlyStats,
      last_exchange_time: exchangeRecords[0]?.created_at || null
    };
    
    res.json({
      code: 0,
      msg: 'success',
      data: statistics
    });
    
    console.log(`✅ 兑换统计查询成功: 总兑换${totalExchanges}次, 总消费${totalPointsSpent}积分`);
    
  } catch (error) {
    console.error('获取兑换统计失败:', error);
    res.json({
      code: 4000,
      msg: '获取兑换统计失败',
      data: null
    });
  }
});

// 🔴 创建兑换订单记录
async function createExchangeOrder(orderData, transaction) {
  // 暂时使用积分记录表存储，实际应该创建专门的订单表
  return await PointsRecord.createRecord({
    user_id: orderData.user_id,
    points: -orderData.total_points,
    description: `兑换订单：${orderData.order_id}`,
    source: 'exchange',
    balance_after: 0, // 这里应该传入正确的余额
    related_id: orderData.order_id
  }, transaction);
}

// 🔴 获取兑换订单列表
async function getExchangeOrders(userId, options) {
  const { status, page, limit } = options;
  
  // 构建查询条件
  const whereClause = {
    user_id: userId,
    source: 'exchange'
  };
  
  if (status) {
    // 这里需要根据实际的订单表结构调整
    whereClause.description = { [sequelize.Op.like]: `%${status}%` };
  }
  
  // 分页查询
  const offset = (page - 1) * limit;
  const { count, rows } = await PointsRecord.findAndCountAll({
    where: whereClause,
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  
  // 格式化订单数据
  const orders = rows.map(record => ({
    order_id: record.related_id,
    description: record.description,
    points: Math.abs(record.points),
    created_at: record.created_at,
    status: 'pending' // 这里需要根据实际业务逻辑确定状态
  }));
  
  return {
    orders,
    pagination: {
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit)
    }
  };
}

// 🔴 获取预计送达时间
function getEstimatedDelivery() {
  const now = new Date();
  const delivery = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3天后
  return delivery.toISOString().split('T')[0]; // 返回日期格式
}

module.exports = router; 