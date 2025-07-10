/**
 * 商家管理API路由 - 超级管理员专用
 * 🔴 前端对接要点：
 * - POST /api/merchant/apply - 商家申请
 * - GET /api/merchant/pending-reviews - 待审核商家列表
 * - POST /api/merchant/review - 审核商家申请
 * - POST /api/merchant/batch-review - 批量审核
 * - GET /api/merchant/statistics - 商家统计
 * - GET /api/merchant/lottery/config - 商家抽奖配置管理
 * - GET /api/merchant/lottery/stats - 商家抽奖运营统计
 */

const express = require('express');
const { Op } = require('sequelize');
const { User, LotteryRecord, LotterySetting, ExchangeOrder, PointsRecord, CommodityPool, PhotoReview } = require('../models');
const { requireAdmin, requireMerchant, authenticateToken } = require('../middleware/auth');
const LotteryService = require('../services/lotteryService');

const router = express.Router();

// 🔴 前端对接点1：商家申请接口
router.post('/apply', authenticateToken, async (req, res) => {
  try {
    const { business_name, business_license, contact_person, contact_phone, business_address, business_type } = req.body;
    
    // 参数验证
    if (!business_name || !contact_person || !contact_phone) {
      return res.json({
        code: 1001,
        msg: '必填信息不完整',
        data: null
      });
    }
    
    // 检查是否已申请过
    if (req.user.merchant_status === 'pending') {
      return res.json({
        code: 1002,
        msg: '商家申请正在审核中，请耐心等待',
        data: null
      });
    }
    
    if (req.user.is_merchant) {
      return res.json({
        code: 1003,
        msg: '您已经是认证商家',
        data: null
      });
    }
    
    // 更新用户信息为待审核状态
    await req.user.update({
      merchant_status: 'pending',
      business_name,
      business_license,
      contact_person,
      contact_phone,
      business_address,
      business_type,
      apply_time: new Date()
    });
    
    res.json({
      code: 0,
      msg: '商家申请提交成功，请等待审核',
      data: {
        status: 'pending',
        apply_time: new Date()
      }
    });
    
    console.log(`🏪 商家申请: ${req.user.user_id} - ${business_name}`);
    
  } catch (error) {
    console.error('商家申请失败:', error);
    res.json({
      code: 5000,
      msg: '申请提交失败，请稍后重试',
      data: null
    });
  }
});

// 🔴 前端对接点2：获取待审核商家列表
router.get('/pending-reviews', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows } = await User.findAndCountAll({
      where: {
        merchant_status: 'pending'
      },
      attributes: [
        'user_id', 'mobile', 'nickname', 'business_name', 'business_license',
        'contact_person', 'contact_phone', 'business_address', 'business_type',
        'apply_time', 'created_at'
      ],
      order: [['apply_time', 'DESC']],
      limit: parseInt(limit),
      offset
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        list: rows.map(user => ({
          user_id: user.user_id,
          mobile: user.getMaskedMobile(),
          nickname: user.nickname,
          business_info: {
            name: user.business_name,
            license: user.business_license,
            contact_person: user.contact_person,
            contact_phone: user.contact_phone,
            address: user.business_address,
            type: user.business_type
          },
          apply_time: user.apply_time,
          created_at: user.created_at
        }))
      }
    });
    
  } catch (error) {
    console.error('获取待审核商家列表失败:', error);
    res.json({
      code: 5000,
      msg: '获取列表失败',
      data: null
    });
  }
});

// 🔴 前端对接点3：审核商家申请
router.post('/review', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, action, reason } = req.body;
    
    if (!user_id || !action || !['approve', 'reject'].includes(action)) {
      return res.json({
        code: 1001,
        msg: '参数错误',
        data: null
      });
    }
    
    const applicant = await User.findByPk(user_id);
    if (!applicant) {
      return res.json({
        code: 1002,
        msg: '申请用户不存在',
        data: null
      });
    }
    
    if (applicant.merchant_status !== 'pending') {
      return res.json({
        code: 1003,
        msg: '该申请不在待审核状态',
        data: null
      });
    }
    
    // 执行审核
    if (action === 'approve') {
      await applicant.update({
        is_merchant: true,
        merchant_status: 'approved',
        review_time: new Date(),
        reviewer_id: req.user.user_id
      });
      
      console.log(`✅ 商家审核通过: ${applicant.user_id} - ${applicant.business_name}`);
    } else {
      await applicant.update({
        merchant_status: 'rejected',
        review_time: new Date(),
        reviewer_id: req.user.user_id,
        reject_reason: reason
      });
      
      console.log(`❌ 商家审核拒绝: ${applicant.user_id} - ${reason}`);
    }
    
    res.json({
      code: 0,
      msg: `审核${action === 'approve' ? '通过' : '拒绝'}`,
      data: {
        user_id,
        action,
        review_time: new Date()
      }
    });
    
  } catch (error) {
    console.error('商家审核失败:', error);
    res.json({
      code: 5000,
      msg: '审核操作失败',
      data: null
    });
  }
});

// 🔴 前端对接点4：批量审核
router.post('/batch-review', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_ids, action, reason } = req.body;
    
    if (!Array.isArray(user_ids) || user_ids.length === 0 || !['approve', 'reject'].includes(action)) {
      return res.json({
        code: 1001,
        msg: '参数错误',
        data: null
      });
    }
    
    const updateData = {
      review_time: new Date(),
      reviewer_id: req.user.user_id
    };
    
    if (action === 'approve') {
      updateData.is_merchant = true;
      updateData.merchant_status = 'approved';
    } else {
      updateData.merchant_status = 'rejected';
      updateData.reject_reason = reason;
    }
    
    const [affectedCount] = await User.update(updateData, {
      where: {
        user_id: { [Op.in]: user_ids },
        merchant_status: 'pending'
      }
    });
    
    res.json({
      code: 0,
      msg: `批量${action === 'approve' ? '通过' : '拒绝'}成功`,
      data: {
        affected_count: affectedCount,
        action,
        review_time: new Date()
      }
    });
    
    console.log(`📦 批量审核: ${action} - ${affectedCount}个申请`);
    
  } catch (error) {
    console.error('批量审核失败:', error);
    res.json({
      code: 5000,
      msg: '批量审核失败',
      data: null
    });
  }
});

// 🔴 前端对接点5：商家统计数据
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 商家申请统计
    const merchantStats = await User.findAll({
      attributes: [
        'merchant_status',
        [User.sequelize.fn('COUNT', User.sequelize.col('user_id')), 'count']
      ],
      where: {
        merchant_status: { [Op.ne]: null }
      },
      group: ['merchant_status'],
      raw: true
    });
    
    // 活跃商家数量
    const activeMerchants = await User.count({
      where: {
        is_merchant: true,
        status: 'active'
      }
    });
    
    // 商家业务统计
    const businessStats = await User.findAll({
      attributes: [
        'business_type',
        [User.sequelize.fn('COUNT', User.sequelize.col('user_id')), 'count']
      ],
      where: {
        is_merchant: true,
        business_type: { [Op.ne]: null }
      },
      group: ['business_type'],
      raw: true
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        merchant_status: merchantStats.reduce((acc, item) => {
          acc[item.merchant_status] = parseInt(item.count);
          return acc;
        }, {}),
        active_merchants: activeMerchants,
        business_types: businessStats.reduce((acc, item) => {
          acc[item.business_type] = parseInt(item.count);
          return acc;
        }, {}),
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.error('获取商家统计失败:', error);
    res.json({
      code: 5000,
      msg: '获取统计数据失败',
      data: null
    });
  }
});

// 🔴 前端对接点6：商家抽奖配置管理
router.get('/lottery/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 获取当前抽奖配置
    const lotteryConfig = await LotterySetting.findOne({
      order: [['created_at', 'DESC']]
    });
    
    if (!lotteryConfig) {
      return res.json({
        code: 1001,
        msg: '抽奖配置不存在',
        data: null
      });
    }
    
    // 获取抽奖系统统计数据
    const totalDraws = await LotteryRecord.count();
    const todayDraws = await LotteryRecord.count({
      where: {
        created_at: {
          [Op.gte]: new Date().setHours(0, 0, 0, 0)
        }
      }
    });
    
    // 奖品分布统计
    const prizeDistribution = await LotteryRecord.findAll({
      attributes: [
        'prize_name',
        [LotteryRecord.sequelize.fn('COUNT', LotteryRecord.sequelize.col('id')), 'count']
      ],
      group: ['prize_name'],
      raw: true
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        config: {
          cost_points: lotteryConfig.cost_points,
          daily_limit: lotteryConfig.daily_limit,
          guarantee_threshold: lotteryConfig.guarantee_threshold,
          is_active: lotteryConfig.is_active,
          created_at: lotteryConfig.created_at,
          updated_at: lotteryConfig.updated_at
        },
        statistics: {
          total_draws: totalDraws,
          today_draws: todayDraws,
          prize_distribution: prizeDistribution.map(item => ({
            prize_name: item.prize_name,
            count: parseInt(item.count)
          }))
        }
      }
    });
    
  } catch (error) {
    console.error('获取抽奖配置失败:', error);
    res.json({
      code: 5000,
      msg: '获取配置失败',
      data: null
    });
  }
});

// 🔴 前端对接点7：商家抽奖运营统计
router.get('/lottery/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    
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
      case 'all':
      default:
        dateFilter = {};
        break;
    }
    
    // 抽奖次数统计
    const drawCount = await LotteryRecord.count({
      where: dateFilter
    });
    
    // 参与用户统计
    const uniqueUsers = await LotteryRecord.findAll({
      attributes: [
        [LotteryRecord.sequelize.fn('COUNT', LotteryRecord.sequelize.fn('DISTINCT', LotteryRecord.sequelize.col('user_id'))), 'count']
      ],
      where: dateFilter,
      raw: true
    });
    
    // 积分消耗统计
    const pointsConsumed = await LotteryRecord.sum('cost_points', {
      where: dateFilter
    });
    
    // 奖品发放统计
    const prizeStats = await LotteryRecord.findAll({
      attributes: [
        'prize_type',
        'prize_name',
        [LotteryRecord.sequelize.fn('COUNT', LotteryRecord.sequelize.col('id')), 'count']
      ],
      where: dateFilter,
      group: ['prize_type', 'prize_name'],
      raw: true
    });
    
    // 时段分布（按小时统计）
    const hourlyStats = await LotteryRecord.findAll({
      attributes: [
        [LotteryRecord.sequelize.fn('HOUR', LotteryRecord.sequelize.col('created_at')), 'hour'],
        [LotteryRecord.sequelize.fn('COUNT', LotteryRecord.sequelize.col('id')), 'count']
      ],
      where: dateFilter,
      group: [LotteryRecord.sequelize.fn('HOUR', LotteryRecord.sequelize.col('created_at'))],
      raw: true
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        period,
        overview: {
          total_draws: drawCount,
          unique_users: parseInt(uniqueUsers[0]?.count || 0),
          points_consumed: pointsConsumed || 0,
          avg_draws_per_user: drawCount > 0 ? (drawCount / (parseInt(uniqueUsers[0]?.count || 1))).toFixed(2) : 0
        },
        prize_distribution: prizeStats.map(item => ({
          type: item.prize_type,
          name: item.prize_name,
          count: parseInt(item.count)
        })),
        hourly_distribution: hourlyStats.map(item => ({
          hour: parseInt(item.hour),
          count: parseInt(item.count)
        })),
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.error('获取抽奖统计失败:', error);
    res.json({
      code: 5000,
      msg: '获取统计数据失败',
      data: null
    });
  }
});

// 🔴 前端对接点8：商品管理列表
router.get('/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      page_size = 20,  // 修复：使用前端期望的参数名
      limit = 20,      // 保留向后兼容
      category = 'all',
      status = 'all',
      stock_status,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;
    
    // 统一参数处理
    const actualLimit = parseInt(page_size || limit);
    const actualPage = parseInt(page);
    const offset = (actualPage - 1) * actualLimit;
    
    // 构建查询条件
    const whereClause = {};
    
    if (category && category !== 'all') {
      whereClause.category = category;
    }
    
    if (status && status !== 'all') {
      whereClause.status = status;
    }
    
    if (stock_status === 'in_stock') {
      whereClause.stock = { [Op.gt]: 0 };
    } else if (stock_status === 'out_of_stock') {
      whereClause.stock = 0;
    }
    
    // 查询商品列表
    const { count, rows } = await CommodityPool.findAndCountAll({
      where: whereClause,
      order: [[sort_by, sort_order.toUpperCase()]],
      limit: actualLimit,
      offset: offset,
      attributes: [
        'commodity_id', 'name', 'description', 'category', 
        'exchange_points', 'stock', 'image', 'status', 
        'is_hot', 'sort_order', 'rating', 'sales_count',
        'created_at', 'updated_at'
      ]
    });
    
    // 获取商品分类列表
    const categories = await CommodityPool.findAll({
      attributes: ['category'],
      group: ['category'],
      raw: true
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        products: rows.map(product => ({
          id: product.commodity_id,
          commodity_id: product.commodity_id,
          name: product.name,
          description: product.description,
          category: product.category,
          exchange_points: product.exchange_points,
          stock: product.stock,
          image: product.image,
          status: product.status,
          is_hot: product.is_hot,
          sort_order: product.sort_order,
          rating: parseFloat(product.rating || 0),
          sales_count: product.sales_count,
          stock_status: product.stock > 0 ? 'in_stock' : 'out_of_stock',
          created_at: product.created_at,
          updated_at: product.updated_at
        })),
        pagination: {
          total: count,
          page: actualPage,
          page_size: actualLimit,  // 使用前端期望的字段名
          limit: actualLimit,      // 保留兼容性
          total_pages: Math.ceil(count / actualLimit),
          has_more: (actualPage * actualLimit) < count
        },
        categories: categories.map(item => item.category),
        generated_at: new Date()
      }
    });
    
    console.log(`📦 管理员 ${req.user.user_id} 查询商品列表，共${count}个商品`);
    
  } catch (error) {
    console.error('获取商品列表失败:', error);
    res.json({
      code: 5000,
      msg: '获取商品列表失败',
      data: null
    });
  }
});

// 🔴 前端对接点9：商品统计数据  
router.get('/product-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    
    // 构建时间过滤条件
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
      case 'all':
      default:
        dateFilter = {};
        break;
    }
    
    // 商品总体统计
    const totalProducts = await CommodityPool.count();
    const activeProducts = await CommodityPool.count({
      where: { status: 'active' }
    });
    const inStockProducts = await CommodityPool.count({
      where: { 
        status: 'active',
        stock: { [Op.gt]: 0 }
      }
    });
    const outOfStockProducts = await CommodityPool.count({
      where: { stock: 0 }
    });
    
    // 分类统计
    const categoryStats = await CommodityPool.findAll({
      attributes: [
        'category',
        [CommodityPool.sequelize.fn('COUNT', CommodityPool.sequelize.col('commodity_id')), 'count'],
        [CommodityPool.sequelize.fn('SUM', CommodityPool.sequelize.col('stock')), 'total_stock'],
        [CommodityPool.sequelize.fn('SUM', CommodityPool.sequelize.col('sales_count')), 'total_sales']
      ],
      where: { status: 'active' },
      group: ['category'],
      raw: true
    });
    
    // 库存统计
    const stockStats = await CommodityPool.findAll({
      attributes: [
        [CommodityPool.sequelize.fn('SUM', CommodityPool.sequelize.col('stock')), 'total_stock'],
        [CommodityPool.sequelize.fn('SUM', CommodityPool.sequelize.col('sales_count')), 'total_sales'],
        [CommodityPool.sequelize.fn('AVG', CommodityPool.sequelize.col('exchange_points')), 'avg_points']
      ],
      where: { status: 'active' },
      raw: true
    });
    
    // 热门商品统计
    const hotProducts = await CommodityPool.findAll({
      where: { 
        is_hot: true,
        status: 'active'
      },
      order: [['sales_count', 'DESC']],
      limit: 5,
      attributes: ['commodity_id', 'name', 'sales_count', 'stock', 'exchange_points']
    });
    
    // 库存预警商品（库存低于10的商品）
    const lowStockProducts = await CommodityPool.findAll({
      where: {
        status: 'active',
        stock: { [Op.between]: [1, 10] }
      },
      order: [['stock', 'ASC']],
      limit: 10,
      attributes: ['commodity_id', 'name', 'stock', 'category']
    });
    
    // 兑换订单统计（如果有ExchangeOrder模型）
    let exchangeStats = null;
    try {
      const totalExchanges = await ExchangeOrder.count({
        where: dateFilter
      });
      
      const totalPointsUsed = await ExchangeOrder.sum('total_points', {
        where: {
          ...dateFilter,
          status: { [Op.in]: ['confirmed', 'shipped', 'delivered'] }
        }
      });
      
      exchangeStats = {
        total_exchanges: totalExchanges,
        total_points_used: totalPointsUsed || 0
      };
    } catch (error) {
      console.log('兑换订单统计暂不可用:', error.message);
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        period,
        overview: {
          total_products: totalProducts,
          active_products: activeProducts,
          in_stock_products: inStockProducts,
          out_of_stock_products: outOfStockProducts,
          total_stock: parseInt(stockStats[0]?.total_stock || 0),
          total_sales: parseInt(stockStats[0]?.total_sales || 0),
          avg_points: parseFloat((stockStats[0]?.avg_points || 0)).toFixed(2)
        },
        category_distribution: categoryStats.map(item => ({
          category: item.category,
          count: parseInt(item.count),
          total_stock: parseInt(item.total_stock || 0),
          total_sales: parseInt(item.total_sales || 0)
        })),
        hot_products: hotProducts.map(product => ({
          id: product.commodity_id,
          name: product.name,
          sales_count: product.sales_count,
          stock: product.stock,
          points: product.exchange_points
        })),
        low_stock_alert: lowStockProducts.map(product => ({
          id: product.commodity_id,
          name: product.name,
          stock: product.stock,
          category: product.category
        })),
        exchange_statistics: exchangeStats,
        generated_at: new Date()
      }
    });
    
    console.log(`📊 管理员 ${req.user.user_id} 查询商品统计数据`);
    
  } catch (error) {
    console.error('获取商品统计失败:', error);
    res.json({
      code: 5000,
      msg: '获取商品统计失败',
      data: null
    });
  }
});

// 🔴 新增：图片审核管理 - 修复管理员看不到待审核图片的问题
// GET /api/merchant/reviews/pending - 获取待审核图片列表
router.get('/reviews/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    console.log(`📋 管理员 ${req.user.user_id} 查询待审核图片列表`);
    
    // 🔴 调用PhotoReview模型的getPendingReviews方法
    const result = await PhotoReview.getPendingReviews({
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        total: result.pagination.total,
        page: result.pagination.page,
        limit: result.pagination.limit,
        list: result.reviews,
        pagination: result.pagination
      }
    });
    
    console.log(`✅ 返回 ${result.reviews.length} 条待审核图片，总计 ${result.pagination.total} 条`);
    
  } catch (error) {
    console.error('❌ 获取待审核图片列表失败:', error);
    res.json({
      code: 5000,
      msg: '获取待审核列表失败',
      data: null
    });
  }
});

// 🔴 新增：审核图片 - 通过/拒绝图片审核
// POST /api/merchant/reviews/:upload_id/approve - 审核通过
router.post('/reviews/:upload_id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { upload_id } = req.params;
    const { actual_amount, reason } = req.body;
    
    console.log(`✅ 管理员 ${req.user.user_id} 审核通过图片: ${upload_id}`);
    
    // 🔴 开启数据库事务确保数据一致性
    const transaction = await PhotoReview.sequelize.transaction();
    
    try {
      // 🔴 执行审核通过操作
      const review = await PhotoReview.performReview(
        upload_id, 
        'approved', 
        actual_amount, 
        reason, 
        req.user.user_id, 
        transaction
      );
      
      // 🔴 如果审核通过，需要给用户增加积分
      if (review.points_awarded > 0) {
        const { PointsRecord } = require('../models');
        
        // 增加用户积分
        await req.user.sequelize.query(
          'UPDATE users SET points = points + ? WHERE user_id = ?',
          {
            replacements: [review.points_awarded, review.user_id],
            transaction
          }
        );
        
        // 创建积分记录
        await PointsRecord.create({
          user_id: review.user_id,
          points: review.points_awarded,
          source: 'photo_upload',
          description: `图片审核通过奖励 - ${upload_id}`,
          related_id: upload_id
        }, { transaction });
      }
      
      await transaction.commit();
      
      res.json({
        code: 0,
        msg: '审核通过成功',
        data: {
          upload_id,
          action: 'approved',
          actual_amount: review.actual_amount,
          points_awarded: review.points_awarded,
          review_time: review.review_time
        }
      });
      
      console.log(`✅ 图片审核通过: ${upload_id}, 奖励积分: ${review.points_awarded}`);
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ 审核通过操作失败:', error);
    res.json({
      code: 5000,
      msg: '审核操作失败',
      data: null
    });
  }
});

// 🔴 新增：拒绝图片审核
// POST /api/merchant/reviews/:upload_id/reject - 审核拒绝
router.post('/reviews/:upload_id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { upload_id } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.json({
        code: 1001,
        msg: '拒绝原因不能为空',
        data: null
      });
    }
    
    console.log(`❌ 管理员 ${req.user.user_id} 审核拒绝图片: ${upload_id}, 原因: ${reason}`);
    
    // 🔴 执行审核拒绝操作
    const review = await PhotoReview.performReview(
      upload_id, 
      'rejected', 
      null, 
      reason, 
      req.user.user_id
    );
    
    res.json({
      code: 0,
      msg: '审核拒绝成功',
      data: {
        upload_id,
        action: 'rejected',
        reason: review.review_reason,
        review_time: review.review_time
      }
    });
    
    console.log(`❌ 图片审核拒绝: ${upload_id}`);
    
  } catch (error) {
    console.error('❌ 审核拒绝操作失败:', error);
    res.json({
      code: 5000,
      msg: '审核操作失败',
      data: null
    });
  }
});

// 🔴 新增：批量审核图片
// POST /api/merchant/reviews/batch - 批量审核图片
router.post('/reviews/batch', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { upload_ids, action, reason, actual_amount } = req.body;
    
    if (!Array.isArray(upload_ids) || upload_ids.length === 0 || !['approve', 'reject'].includes(action)) {
      return res.json({
        code: 1001,
        msg: '参数错误',
        data: null
      });
    }
    
    if (action === 'reject' && !reason) {
      return res.json({
        code: 1002,
        msg: '拒绝时必须提供原因',
        data: null
      });
    }
    
    console.log(`📦 管理员 ${req.user.user_id} 批量审核: ${action}, 数量: ${upload_ids.length}`);
    
    const results = [];
    const errors = [];
    
    // 🔴 逐个处理审核（确保事务安全）
    for (const upload_id of upload_ids) {
      try {
        const transaction = await PhotoReview.sequelize.transaction();
        
        try {
          const review = await PhotoReview.performReview(
            upload_id,
            action === 'approve' ? 'approved' : 'rejected',
            actual_amount,
            reason,
            req.user.user_id,
            transaction
          );
          
          // 🔴 审核通过时增加积分
          if (action === 'approve' && review.points_awarded > 0) {
            const { PointsRecord } = require('../models');
            
            await req.user.sequelize.query(
              'UPDATE users SET points = points + ? WHERE user_id = ?',
              {
                replacements: [review.points_awarded, review.user_id],
                transaction
              }
            );
            
            await PointsRecord.create({
              user_id: review.user_id,
              points: review.points_awarded,
              source: 'photo_upload',
              description: `批量图片审核通过奖励 - ${upload_id}`,
              related_id: upload_id
            }, { transaction });
          }
          
          await transaction.commit();
          
          results.push({
            upload_id,
            status: 'success',
            action: review.review_status,
            points_awarded: review.points_awarded || 0
          });
          
        } catch (error) {
          await transaction.rollback();
          throw error;
        }
        
      } catch (error) {
        errors.push({
          upload_id,
          error: error.message
        });
      }
    }
    
    res.json({
      code: 0,
      msg: `批量审核完成`,
      data: {
        total: upload_ids.length,
        success: results.length,
        failed: errors.length,
        results,
        errors
      }
    });
    
    console.log(`📦 批量审核完成: 成功 ${results.length}, 失败 ${errors.length}`);
    
  } catch (error) {
    console.error('❌ 批量审核失败:', error);
    res.json({
      code: 5000,
      msg: '批量审核失败',
      data: null
    });
  }
});

module.exports = router; 