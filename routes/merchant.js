/**
 * 商家管理路由 - v2.1.2纯人工审核版本
 * 🔴 重要更新：完全基于人工审核模式，商家确认用户输入的消费金额
 * 🔴 前端对接说明：
 * - POST /api/merchant/apply - 申请商家权限
 * - GET /api/merchant/pending-reviews - 获取待审核列表
 * - POST /api/merchant/review - 执行审核操作
 * - POST /api/merchant/batch-review - 批量审核
 * - GET /api/merchant/statistics - 审核统计数据
 * 🔴 权限说明：需要商家权限(is_merchant=true)才能访问审核功能
 */

const express = require('express');
const { Op } = require('sequelize');
const { authenticateToken, requireMerchant } = require('../middleware/auth');
const { PhotoReview, User, PointsRecord, sequelize } = require('../models');
const webSocketService = require('../services/websocket');

const router = express.Router();

/**
 * 🔴 申请成为商家
 * POST /api/merchant/apply
 * 前端需要传递：申请信息
 */
router.post('/apply', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { 
      business_name, 
      business_license, 
      contact_person, 
      contact_phone, 
      business_address, 
      reason 
    } = req.body;
    
    // 🔴 参数验证
    if (!business_name || !contact_person || !contact_phone) {
      return res.json({
        code: 1001,
        msg: '请填写完整的申请信息',
        data: null
      });
    }
    
    // 检查用户是否已经是商家
    const user = await User.findByPk(userId);
    if (user.is_merchant) {
      return res.json({
        code: 3002,
        msg: '您已经具备商家权限',
        data: null
      });
    }
    
    // 🔴 创建商家申请记录
    console.log(`📝 用户 ${userId} 申请商家权限:`, {
      business_name,
      contact_person,
      contact_phone,
      business_address,
      reason
    });
    
    // 🔴 开发阶段自动通过商家申请（生产环境应该需要管理员审核）
    await user.update({
      is_merchant: true,
      updated_at: new Date()
    });
    
    res.json({
      code: 0,
      msg: '商家权限申请成功，您现在可以进行审核管理',
      data: {
        user_id: userId,
        is_merchant: true,
        business_name: business_name,
        applied_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ 申请商家权限失败:', error);
    res.json({
      code: 5000,
      msg: '申请提交失败，请重试',
      data: null
    });
  }
});

/**
 * 🔴 获取待审核列表 - 商家专用
 * GET /api/merchant/pending-reviews?page=1&limit=10
 * 商家可以查看所有待审核的拍照
 */
router.get('/pending-reviews', authenticateToken, requireMerchant, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    
    // 🔴 获取待审核列表
    const result = await PhotoReview.getPendingReviews({
      page,
      limit
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: result
    });
    
  } catch (error) {
    console.error('❌ 获取待审核列表失败:', error);
    res.json({
      code: 4000,
      msg: '获取待审核列表失败',
      data: null
    });
  }
});

/**
 * 🔴 执行审核操作 - v2.1.2纯人工审核版本
 * POST /api/merchant/review
 * Body: { 
 *   upload_id, 
 *   action: 'approved'|'rejected', 
 *   actual_amount?: number,  // 商家确认的实际消费金额
 *   reason?: string 
 * }
 */
router.post('/review', authenticateToken, requireMerchant, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { upload_id, action, actual_amount, reason } = req.body;
    const reviewerId = req.user.user_id;
    
    // 🔴 参数验证
    if (!upload_id || !action || !['approved', 'rejected'].includes(action)) {
      await transaction.rollback();
      return res.json({
        code: 4001,
        msg: '参数错误',
        data: null
      });
    }
    
    // 🔴 审核通过时必须确认金额
    if (action === 'approved' && (!actual_amount || actual_amount <= 0)) {
      await transaction.rollback();
      return res.json({
        code: 4002,
        msg: '审核通过时必须确认实际消费金额',
        data: null
      });
    }
    
    // 🔴 执行人工审核
    const review = await PhotoReview.performReview(
      upload_id, 
      action, 
      actual_amount, 
      reason, 
      reviewerId, 
      transaction
    );
    
    let newBalance = null;
    
    // 🔴 如果审核通过，增加用户积分
    if (action === 'approved') {
      newBalance = await User.updatePoints(
        review.user_id, 
        review.points_awarded, 
        transaction
      );
      
      // 🔴 记录积分变动
      await PointsRecord.create({
        user_id: review.user_id,
        points: review.points_awarded,
        change_type: 'earn',
        source: 'photo_review',
        description: `拍照审核通过奖励 - 消费${actual_amount}元`,
        reference_id: upload_id,
        balance_before: newBalance - review.points_awarded,
        balance_after: newBalance,
        created_at: new Date()
      }, { transaction });
    }
    
    await transaction.commit();
    
    // 🔴 WebSocket推送审核结果
    webSocketService.notifyReviewResult(
      review.user_id,
      upload_id,
      action,
      action === 'approved' ? review.points_awarded : 0,
      reason || (action === 'approved' ? '审核通过' : '审核拒绝'),
      action === 'approved' ? newBalance : null
    );
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        upload_id,
        action,
        actual_amount: actual_amount || review.amount,
        points_awarded: action === 'approved' ? review.points_awarded : 0,
        user_new_balance: action === 'approved' ? newBalance : null,
        reviewed_at: new Date().toISOString()
      }
    });
    
    console.log(`✅ 商家 ${reviewerId} 审核${action === 'approved' ? '通过' : '拒绝'}了 ${upload_id}，积分: ${review.points_awarded}`);
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ 审核操作失败:', error);
    res.json({
      code: 5000,
      msg: error.message || '审核操作失败',
      data: null
    });
  }
});

/**
 * 🔴 批量审核操作
 * POST /api/merchant/batch-review
 * Body: { 
 *   reviews: [{ upload_id, action, actual_amount?, reason? }],
 *   batch_reason?: string
 * }
 */
router.post('/batch-review', authenticateToken, requireMerchant, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { reviews, batch_reason } = req.body;
    const reviewerId = req.user.user_id;
    
    if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
      await transaction.rollback();
      return res.json({
        code: 4001,
        msg: '批量审核数据不能为空',
        data: null
      });
    }
    
    if (reviews.length > 50) {
      await transaction.rollback();
      return res.json({
        code: 4002,
        msg: '单次批量审核不能超过50条',
        data: null
      });
    }
    
    const results = [];
    
    // 🔴 逐个处理审核
    for (const reviewData of reviews) {
      try {
        const { upload_id, action, actual_amount, reason } = reviewData;
        
        // 参数验证
        if (!upload_id || !action || !['approved', 'rejected'].includes(action)) {
          results.push({
            upload_id,
            success: false,
            error: '参数错误'
          });
          continue;
        }
        
        if (action === 'approved' && (!actual_amount || actual_amount <= 0)) {
          results.push({
            upload_id,
            success: false,
            error: '审核通过时必须确认实际消费金额'
          });
          continue;
        }
        
        // 执行审核
        const review = await PhotoReview.performReview(
          upload_id,
          action,
          actual_amount,
          reason || batch_reason,
          reviewerId,
          transaction
        );
        
        let newBalance = null;
        
        // 如果审核通过，增加积分
        if (action === 'approved') {
          newBalance = await User.updatePoints(
            review.user_id,
            review.points_awarded,
            transaction
          );
          
          await PointsRecord.create({
            user_id: review.user_id,
            points: review.points_awarded,
            change_type: 'earn',
            source: 'photo_review',
            description: `批量审核通过奖励 - 消费${actual_amount}元`,
            reference_id: upload_id,
            balance_before: newBalance - review.points_awarded,
            balance_after: newBalance,
            created_at: new Date()
          }, { transaction });
        }
        
        // WebSocket通知用户
        webSocketService.notifyReviewResult(
          review.user_id,
          upload_id,
          action,
          action === 'approved' ? review.points_awarded : 0,
          reason || batch_reason || (action === 'approved' ? '批量审核通过' : '批量审核拒绝'),
          action === 'approved' ? newBalance : null
        );
        
        results.push({
          upload_id,
          success: true,
          action,
          points_awarded: action === 'approved' ? review.points_awarded : 0
        });
        
      } catch (error) {
        console.error(`❌ 批量审核单条记录失败 ${reviewData.upload_id}:`, error);
        results.push({
          upload_id: reviewData.upload_id,
          success: false,
          error: error.message
        });
      }
    }
    
    await transaction.commit();
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    res.json({
      code: 0,
      msg: `批量审核完成，成功${successCount}条，失败${failCount}条`,
      data: {
        total: results.length,
        success_count: successCount,
        fail_count: failCount,
        results
      }
    });
    
    console.log(`✅ 商家 ${reviewerId} 批量审核完成，成功${successCount}条，失败${failCount}条`);
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ 批量审核失败:', error);
    res.json({
      code: 5000,
      msg: '批量审核失败',
      data: null
    });
  }
});

/**
 * 🔴 获取审核统计数据
 * GET /api/merchant/statistics
 */
router.get('/statistics', authenticateToken, requireMerchant, async (req, res) => {
  try {
    // 🔴 基础统计数据
    const totalReviews = await PhotoReview.count();
    const pendingReviews = await PhotoReview.count({
      where: { review_status: 'pending' }
    });
    const approvedReviews = await PhotoReview.count({
      where: { review_status: 'approved' }
    });
    const rejectedReviews = await PhotoReview.count({
      where: { review_status: 'rejected' }
    });
    
    // 🔴 本月统计
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const monthlyReviews = await PhotoReview.count({
      where: {
        created_at: {
          [Op.gte]: thisMonth
        }
      }
    });
    
    const monthlyApproved = await PhotoReview.count({
      where: {
        review_status: 'approved',
        review_time: {
          [Op.gte]: thisMonth
        }
      }
    });
    
    // 🔴 今日统计
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayReviews = await PhotoReview.count({
      where: {
        created_at: {
          [Op.gte]: today
        }
      }
    });
    
    const todayPending = await PhotoReview.count({
      where: {
        review_status: 'pending',
        created_at: {
          [Op.gte]: today
        }
      }
    });
    
    // 🔴 积分发放统计
    const totalPointsAwarded = await PhotoReview.sum('points_awarded', {
      where: { review_status: 'approved' }
    }) || 0;
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        overall: {
          total_reviews: totalReviews,
          pending_reviews: pendingReviews,
          approved_reviews: approvedReviews,
          rejected_reviews: rejectedReviews,
          approval_rate: totalReviews > 0 ? (approvedReviews / totalReviews * 100).toFixed(1) : '0.0'
        },
        monthly: {
          reviews: monthlyReviews,
          approved: monthlyApproved,
          approval_rate: monthlyReviews > 0 ? (monthlyApproved / monthlyReviews * 100).toFixed(1) : '0.0'
        },
        today: {
          reviews: todayReviews,
          pending: todayPending,
          completion_rate: todayReviews > 0 ? ((todayReviews - todayPending) / todayReviews * 100).toFixed(1) : '0.0'
        },
        points: {
          total_awarded: totalPointsAwarded,
          average_per_approval: approvedReviews > 0 ? Math.round(totalPointsAwarded / approvedReviews) : 0
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 获取审核统计失败:', error);
    res.json({
      code: 4000,
      msg: '获取统计数据失败',
      data: null
    });
  }
});

/**
 * 🔴 获取商家个人审核记录
 * GET /api/merchant/my-reviews?page=1&limit=20
 */
router.get('/my-reviews', authenticateToken, requireMerchant, async (req, res) => {
  try {
    const reviewerId = req.user.user_id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    
    const { count, rows } = await PhotoReview.findAndCountAll({
      where: { reviewer_id: reviewerId },
      include: [
        {
          model: sequelize.model('users'),
          as: 'user',
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [['review_time', 'DESC']],
      limit,
      offset
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        reviews: rows.map(review => ({
          upload_id: review.upload_id,
          user_nickname: review.user.nickname,
          amount: review.amount,
          actual_amount: review.actual_amount,
          points_awarded: review.points_awarded,
          review_status: review.review_status,
          review_reason: review.review_reason,
          reviewed_at: review.review_time,
          created_at: review.created_at
        })),
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 获取个人审核记录失败:', error);
    res.json({
      code: 4000,
      msg: '获取审核记录失败',
      data: null
    });
  }
});

module.exports = router; 