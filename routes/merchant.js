/**
 * 商家管理API路由 - 仅管理员可访问
 * 🔴 权限要求：所有接口都需要管理员权限（is_admin = true）
 * 
 * 🔴 前端对接要点：
 * - 普通用户登录时不显示商家管理入口
 * - 管理员登录时显示商家管理入口
 * - 所有商家管理功能由管理员执行
 * 
 * 🔴 照片审核权限说明：
 * - 管理员可以审核所有用户（普通用户+管理员）上传的照片
 * - 管理员可以审核自己上传的照片
 * - 无用户类型限制，审核对象包括：普通用户、管理员用户
 * - 审核功能：approve(通过) / reject(拒绝)
 */

const express = require('express');
const { Op } = require('sequelize');
const { User, PhotoReview, PointsRecord, sequelize } = require('../models');
const { requireAdmin, authenticateToken } = require('../middleware/auth');
const webSocketService = require('../services/websocket');

const router = express.Router();

// 🔴 获取待审核图片列表（仅管理员）
router.get('/pending-reviews', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'pending' } = req.query;
    const offset = (page - 1) * limit;
    
    // 构建查询条件
    const whereCondition = {};
    if (status !== 'all') {
      whereCondition.review_status = status;
    }
    
    const { count, rows } = await PhotoReview.findAndCountAll({
      where: whereCondition,
      include: [{
        model: User,
        as: 'user',  // 🔴 修复：添加别名，与模型关联定义一致
        attributes: ['user_id', 'mobile', 'nickname', 'total_points', 'is_admin']  // 🔴 添加is_admin字段
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });
    
    // 格式化返回数据
    const reviews = rows.map(review => ({
      upload_id: review.upload_id,
      user_info: {
        user_id: review.user.user_id,
        nickname: review.user.nickname,
        mobile: review.user.getMaskedMobile(),
        total_points: review.user.total_points,
        is_admin: review.user.is_admin  // 🔴 添加管理员状态显示
      },
      image_url: review.image_url,
      original_filename: review.original_filename,
      file_size: review.file_size,
      amount: review.amount,
      actual_amount: review.actual_amount,
      review_status: review.review_status,
      points_awarded: review.points_awarded,
      review_reason: review.review_reason,
      uploaded_at: review.created_at,
      review_time: review.review_time
    }));
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        reviews,
        statistics: {
          pending: await PhotoReview.count({ where: { review_status: 'pending' } }),
          approved: await PhotoReview.count({ where: { review_status: 'approved' } }),
          rejected: await PhotoReview.count({ where: { review_status: 'rejected' } })
        }
      }
    });
    
  } catch (error) {
    console.error('获取待审核列表失败:', error);
    res.json({
      code: 5000,
      msg: '获取列表失败',
      data: null
    });
  }
});

// 🔴 审核单个图片（仅管理员）
router.post('/review', authenticateToken, requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { upload_id, action, amount, review_reason } = req.body;
    
    // 参数验证
    if (!upload_id || !action || !['approve', 'reject'].includes(action)) {
      await transaction.rollback();
      return res.json({
        code: 1001,
        msg: '参数错误',
        data: null
      });
    }
    
    if (action === 'approve' && (!amount || amount <= 0)) {
      await transaction.rollback();
      return res.json({
        code: 1002,
        msg: '审核通过时必须设置消费金额',
        data: null
      });
    }
    
    // 查找审核记录
    const reviewRecord = await PhotoReview.findOne({
      where: { upload_id },
      include: [{ model: User, as: 'user' }],  // 🔴 修复：添加别名
      transaction
    });
    
    if (!reviewRecord) {
      await transaction.rollback();
      return res.json({
        code: 1003,
        msg: '审核记录不存在',
        data: null
      });
    }
    
    if (reviewRecord.review_status !== 'pending') {
      await transaction.rollback();
      return res.json({
        code: 1004,
        msg: '该记录已被审核过',
        data: null
      });
    }
    
    let pointsAwarded = 0;
    
    if (action === 'approve') {
      // 审核通过：计算积分奖励（消费金额 × 10）
      pointsAwarded = Math.floor(parseFloat(amount) * 10);
      
      // 更新审核记录
      await reviewRecord.update({
        review_status: 'approved',
        actual_amount: amount,
        points_awarded: pointsAwarded,
        review_reason: review_reason || '审核通过',
        review_time: new Date(),
        reviewer_id: req.user.user_id
      }, { transaction });
      
      // 给用户加积分
      await reviewRecord.user.increment('total_points', {  // 🔴 修复：User -> user
        by: pointsAwarded,
        transaction
      });
      
      // 记录积分变动
      await PointsRecord.create({
        user_id: reviewRecord.user_id,
        points_change: pointsAwarded,
        change_type: 'earned',
        description: `拍照上传审核通过，消费金额${amount}元`,
        reference_type: 'photo_review',
        reference_id: upload_id,
        balance_after: reviewRecord.user.total_points + pointsAwarded  // 🔴 修复：User -> user
      }, { transaction });
      
    } else {
      // 审核拒绝
      await reviewRecord.update({
        review_status: 'rejected',
        review_reason: review_reason || '审核不通过',
        review_time: new Date(),
        reviewer_id: req.user.user_id
      }, { transaction });
    }
    
    await transaction.commit();
    
    // WebSocket通知用户审核结果
    webSocketService.notifyReviewResult(
      reviewRecord.user_id,
      upload_id,
      action === 'approve' ? 'approved' : 'rejected',
      pointsAwarded,
      review_reason
    );
    
    // 如果审核通过，通知积分变更
    if (action === 'approve') {
      webSocketService.notifyPointsUpdate(
        reviewRecord.user_id,
        reviewRecord.user.total_points + pointsAwarded,  // 🔴 修复：User -> user
        pointsAwarded,
        '拍照上传审核奖励'
      );
    }
    
    res.json({
      code: 0,
      msg: `审核${action === 'approve' ? '通过' : '拒绝'}`,
      data: {
        upload_id,
        action,
        amount: action === 'approve' ? amount : null,
        points_awarded: pointsAwarded,
        review_time: new Date()
      }
    });
    
    console.log(`📋 管理员${req.user.user_id}审核图片${upload_id}: ${action}, 积分奖励: ${pointsAwarded}`);
    
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    console.error('审核失败:', error);
    res.json({
      code: 5000,
      msg: '审核操作失败',
      data: null
    });
  }
});

// 🔴 批量审核接口（仅管理员）
router.post('/batch-review', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reviews } = req.body;
    
    if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
      return res.json({
        code: 1001,
        msg: '批量审核数据不能为空',
        data: null
      });
    }
    
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    
    // 逐个处理审核
    for (const reviewItem of reviews) {
      const transaction = await sequelize.transaction();
      
      try {
        const { upload_id, action, amount, review_reason } = reviewItem;
        
        const reviewRecord = await PhotoReview.findOne({
          where: { upload_id, review_status: 'pending' },
          include: [{ model: User, as: 'user' }],  // 🔴 修复：添加别名
          transaction
        });
        
        if (!reviewRecord) {
          await transaction.rollback();
          results.push({
            upload_id,
            success: false,
            error: '记录不存在或已审核'
          });
          failedCount++;
          continue;
        }
        
        let pointsAwarded = 0;
        
        if (action === 'approve') {
          pointsAwarded = Math.floor(parseFloat(amount) * 10);
          
          await reviewRecord.update({
            review_status: 'approved',
            actual_amount: amount,
            points_awarded: pointsAwarded,
            review_reason: review_reason || '批量审核通过',
            review_time: new Date(),
            reviewer_id: req.user.user_id
          }, { transaction });
          
          await reviewRecord.user.increment('total_points', {  // 🔴 修复：User -> user
            by: pointsAwarded,
            transaction
          });
          
          await PointsRecord.create({
            user_id: reviewRecord.user_id,
            points_change: pointsAwarded,
            change_type: 'earned',
            description: `批量审核通过，消费金额${amount}元`,
            reference_type: 'photo_review',
            reference_id: upload_id,
            balance_after: reviewRecord.user.total_points + pointsAwarded  // 🔴 修复：User -> user
          }, { transaction });
          
        } else {
          await reviewRecord.update({
            review_status: 'rejected',
            review_reason: review_reason || '批量审核拒绝',
            review_time: new Date(),
            reviewer_id: req.user.user_id
          }, { transaction });
        }
        
        await transaction.commit();
        
        results.push({
          upload_id,
          success: true,
          action,
          points_awarded: pointsAwarded
        });
        successCount++;
        
        // WebSocket通知
        webSocketService.notifyReviewResult(
          reviewRecord.user_id,
          upload_id,
          action === 'approve' ? 'approved' : 'rejected',
          pointsAwarded,
          review_reason
        );
        
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback();
        }
        results.push({
          upload_id: reviewItem.upload_id,
          success: false,
          error: error.message
        });
        failedCount++;
      }
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        success_count: successCount,
        failed_count: failedCount,
        results
      }
    });
    
  } catch (error) {
    console.error('批量审核失败:', error);
    res.json({
      code: 5000,
      msg: '批量审核失败',
      data: null
    });
  }
});

// 🔴 管理员统计接口（仅管理员）
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    
    // 构建时间查询条件
    let timeCondition = {};
    const now = new Date();
    
    switch (period) {
      case 'today':
        timeCondition = {
          created_at: {
            [Op.gte]: new Date(now.getFullYear(), now.getMonth(), now.getDate())
          }
        };
        break;
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        timeCondition = {
          created_at: {
            [Op.gte]: weekStart
          }
        };
        break;
      case 'month':
        timeCondition = {
          created_at: {
            [Op.gte]: new Date(now.getFullYear(), now.getMonth(), 1)
          }
        };
        break;
    }
    
    // 并行查询统计数据
    const [
      pendingReviews,
      approvedReviews,
      rejectedReviews,
      totalUsers,
      activeUsers,
      adminUsers,
      totalPointsAwarded
    ] = await Promise.all([
      // 🔴 修复：pending状态不受时间限制，显示所有待审核记录
      PhotoReview.count({ where: { review_status: 'pending' } }),
      PhotoReview.count({ where: { ...timeCondition, review_status: 'approved' } }),
      PhotoReview.count({ where: { ...timeCondition, review_status: 'rejected' } }),
      User.count(),
      User.count({ where: { status: 'active' } }),
      User.count({ where: { is_admin: true } }),
      PhotoReview.sum('points_awarded', { where: { ...timeCondition, review_status: 'approved' } }) || 0
    ]);
    
    // 🔴 修复：total应该是pending + approved + rejected的总和
    const totalReviews = pendingReviews + approvedReviews + rejectedReviews;
    
    // 审核效率统计
    const approvalRate = totalReviews > 0 ? Math.round((approvedReviews / totalReviews) * 100) : 0;
    const averagePointsPerReview = approvedReviews > 0 ? Math.round(totalPointsAwarded / approvedReviews) : 0;
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        period,
        review_stats: {
          total: totalReviews,
          pending: pendingReviews,
          approved: approvedReviews,
          rejected: rejectedReviews,
          approval_rate: approvalRate
        },
        user_stats: {
          total: totalUsers,
          active: activeUsers,
          admins: adminUsers
        },
        points_stats: {
          total_awarded: totalPointsAwarded,
          average_per_review: averagePointsPerReview
        },
        efficiency: {
          pending_ratio: totalReviews > 0 ? Math.round((pendingReviews / totalReviews) * 100) : 0,
          daily_review_count: period === 'today' ? totalReviews : null
        }
      }
    });
    
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.json({
      code: 5000,
      msg: '获取统计失败',
      data: null
    });
  }
});

// 🔴 获取审核详情（仅管理员）
router.get('/review/:upload_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { upload_id } = req.params;
    
    const reviewRecord = await PhotoReview.findOne({
      where: { upload_id },
      include: [{
        model: User,
        attributes: ['user_id', 'mobile', 'nickname', 'total_points', 'status']
      }]
    });
    
    if (!reviewRecord) {
      return res.json({
        code: 1001,
        msg: '审核记录不存在',
        data: null
      });
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        upload_id: reviewRecord.upload_id,
        user_info: {
          user_id: reviewRecord.User.user_id,
          nickname: reviewRecord.User.nickname,
          mobile: reviewRecord.User.getMaskedMobile(),
          total_points: reviewRecord.User.total_points,
          status: reviewRecord.User.status
        },
        image_url: reviewRecord.image_url,
        original_filename: reviewRecord.original_filename,
        file_size: reviewRecord.file_size,
        amount: reviewRecord.amount,
        actual_amount: reviewRecord.actual_amount,
        review_status: reviewRecord.review_status,
        points_awarded: reviewRecord.points_awarded,
        review_reason: reviewRecord.review_reason,
        uploaded_at: reviewRecord.created_at,
        review_time: reviewRecord.review_time,
        reviewer_id: reviewRecord.reviewer_id
      }
    });
    
  } catch (error) {
    console.error('获取审核详情失败:', error);
    res.json({
      code: 5000,
      msg: '获取详情失败',
      data: null
    });
  }
});

// 🔴 商品管理接口（仅管理员）- 新增商品管理功能
const { CommodityPool } = require('../models');

// 🔴 获取商品统计数据（仅管理员）
router.get('/product-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 并行查询商品统计数据
    const [
      activeCount,
      offlineCount,
      lowStockCount,
      totalCount,
      outOfStockCount
    ] = await Promise.all([
      CommodityPool.count({ where: { status: 'active' } }),
      CommodityPool.count({ where: { status: 'inactive' } }),
      CommodityPool.count({ 
        where: { 
          status: 'active',
          stock: { [Op.lte]: 5 } 
        } 
      }),
      CommodityPool.count(),
      CommodityPool.count({ 
        where: { 
          status: 'active',
          stock: 0 
        } 
      })
    ]);
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        activeCount,           // 上架商品数量
        offlineCount,          // 下架商品数量
        lowStockCount,         // 低库存商品数量（库存≤5）
        totalCount,            // 总商品数量
        outOfStockCount        // 零库存商品数量
      }
    });
    
  } catch (error) {
    console.error('获取商品统计失败:', error);
    res.json({
      code: 5000,
      msg: '获取商品统计失败',
      data: null
    });
  }
});

// 🔴 获取商品列表（仅管理员）
router.get('/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      page_size = 20,
      category = 'all',
      status = 'all',
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = req.query;
    
    const offset = (page - 1) * page_size;
    
    // 构建查询条件
    const whereCondition = {};
    
    if (category !== 'all') {
      whereCondition.category = category;
    }
    
    if (status !== 'all') {
      whereCondition.status = status;
    }
    
    // 查询商品列表
    const { count, rows } = await CommodityPool.findAndCountAll({
      where: whereCondition,
      order: [[sort_by, sort_order.toUpperCase()]],
      limit: parseInt(page_size),
      offset
    });
    
    // 格式化返回数据
    const products = rows.map(product => ({
      commodity_id: product.commodity_id,
      name: product.name,
      description: product.description,
      category: product.category,
      exchange_points: product.exchange_points,
      stock: product.stock,
      image: product.image_url,
      status: product.status,
      is_hot: product.is_hot || false,
      sort_order: product.sort_order || 0,
      rating: product.rating || 5.0,
      sales_count: product.sales_count || 0,
      created_at: product.created_at,
      updated_at: product.updated_at
    }));
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        products,
        pagination: {
          total: count,
          page: parseInt(page),
          page_size: parseInt(page_size),
          totalPages: Math.ceil(count / page_size)
        }
      }
    });
    
  } catch (error) {
    console.error('获取商品列表失败:', error);
    res.json({
      code: 5000,
      msg: '获取商品列表失败',
      data: null
    });
  }
});

// 🔴 创建商品（仅管理员）
router.post('/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      exchange_points,
      stock,
      image_url,
      is_hot = false,
      sort_order = 0
    } = req.body;
    
    // 参数验证
    if (!name || !category || !exchange_points || exchange_points <= 0) {
      return res.json({
        code: 1001,
        msg: '商品名称、分类和积分不能为空，积分必须大于0',
        data: null
      });
    }
    
    if (stock < 0) {
      return res.json({
        code: 1002,
        msg: '库存数量不能为负数',
        data: null
      });
    }
    
    // 创建商品
    const newProduct = await CommodityPool.create({
      name,
      description,
      category,
      exchange_points: parseInt(exchange_points),
      stock: parseInt(stock) || 0,
      image_url,
      status: 'active',
      is_hot: Boolean(is_hot),
      sort_order: parseInt(sort_order) || 0,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        commodity_id: newProduct.commodity_id,
        name: newProduct.name,
        message: '商品创建成功'
      }
    });
    
  } catch (error) {
    console.error('创建商品失败:', error);
    res.json({
      code: 5000,
      msg: '创建商品失败',
      data: null
    });
  }
});

// 🔴 更新商品（仅管理员）
router.put('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // 查找商品
    const product = await CommodityPool.findByPk(id);
    if (!product) {
      return res.json({
        code: 1001,
        msg: '商品不存在',
        data: null
      });
    }
    
    // 验证更新字段
    const allowedFields = [
      'name', 'description', 'category', 'exchange_points', 
      'stock', 'image_url', 'status', 'is_hot', 'sort_order'
    ];
    
    const filteredData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });
    
    if (Object.keys(filteredData).length === 0) {
      return res.json({
        code: 1002,
        msg: '没有可更新的字段',
        data: null
      });
    }
    
    // 添加更新时间
    filteredData.updated_at = new Date();
    
    // 更新商品
    await product.update(filteredData);
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        commodity_id: product.commodity_id,
        message: '商品更新成功'
      }
    });
    
  } catch (error) {
    console.error('更新商品失败:', error);
    res.json({
      code: 5000,
      msg: '更新商品失败',
      data: null
    });
  }
});

// 🔴 删除商品（仅管理员）
router.delete('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 查找商品
    const product = await CommodityPool.findByPk(id);
    if (!product) {
      return res.json({
        code: 1001,
        msg: '商品不存在',
        data: null
      });
    }
    
    // 软删除：将状态设置为 inactive
    await product.update({
      status: 'inactive',
      updated_at: new Date()
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        commodity_id: product.commodity_id,
        message: '商品删除成功'
      }
    });
    
  } catch (error) {
    console.error('删除商品失败:', error);
    res.json({
      code: 5000,
      msg: '删除商品失败',
      data: null
    });
  }
});

// 🔴 批量更新商品（仅管理员）
router.post('/products/batch-update', authenticateToken, requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { products } = req.body;
    
    if (!Array.isArray(products) || products.length === 0) {
      await transaction.rollback();
      return res.json({
        code: 1001,
        msg: '商品列表不能为空',
        data: null
      });
    }
    
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    
    for (const productUpdate of products) {
      try {
        const { commodity_id, ...updateData } = productUpdate;
        
        if (!commodity_id) {
          results.push({
            commodity_id,
            success: false,
            error: '商品ID不能为空'
          });
          failedCount++;
          continue;
        }
        
        const product = await CommodityPool.findByPk(commodity_id, { transaction });
        if (!product) {
          results.push({
            commodity_id,
            success: false,
            error: '商品不存在'
          });
          failedCount++;
          continue;
        }
        
        // 添加更新时间
        updateData.updated_at = new Date();
        
        await product.update(updateData, { transaction });
        
        results.push({
          commodity_id,
          success: true,
          message: '更新成功'
        });
        successCount++;
        
      } catch (error) {
        results.push({
          commodity_id: productUpdate.commodity_id,
          success: false,
          error: error.message
        });
        failedCount++;
      }
    }
    
    await transaction.commit();
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        success_count: successCount,
        failed_count: failedCount,
        results
      }
    });
    
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    console.error('批量更新商品失败:', error);
    res.json({
      code: 5000,
      msg: '批量更新失败',
      data: null
    });
  }
});

module.exports = router; 