/**
 * 商家管理路由
 * 🔴 前端对接说明：
 * - POST /api/merchant/apply - 申请商家权限
 * - GET /api/merchant/reviews/pending - 获取待审核列表
 * - POST /api/merchant/reviews/:id/approve - 审核通过
 * - POST /api/merchant/reviews/:id/reject - 审核拒绝
 * - POST /api/merchant/reviews/batch - 批量审核
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
    
    // 🔴 创建商家申请记录（需要先创建merchant_applications表）
    // 这里暂时直接更新用户表，实际应该有审核流程
    console.log(`📝 用户 ${userId} 申请商家权限:`, {
      business_name,
      contact_person,
      contact_phone,
      business_address,
      reason
    });
    
    // 🔴 暂时自动通过商家申请（实际应该需要管理员审核）
    await user.update({
      is_merchant: true,
      updated_at: new Date()
    });
    
    res.json({
      code: 200,
      msg: '商家权限申请成功，您现在可以进行审核管理',
      data: {
        userId: userId,
        isMerchant: true,
        businessName: business_name,
        appliedAt: new Date().toISOString()
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
 * GET /api/merchant/reviews/pending?page=1&limit=10
 * 商家可以查看所有待审核的拍照
 */
router.get('/reviews/pending', authenticateToken, requireMerchant, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sort = req.query.sort || 'newest'; // newest | oldest
    const offset = (page - 1) * limit;
    
    // 构建排序条件
    const order = sort === 'oldest' 
      ? [['created_at', 'ASC']] 
      : [['created_at', 'DESC']];
    
    // 🔴 查询待审核记录
    const { count, rows } = await PhotoReview.findAndCountAll({
      where: {
        review_status: 'pending'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'username', 'nickname', 'avatar', 'total_points']
        }
      ],
      order,
      limit,
      offset,
      attributes: [
        'review_id',
        'user_id',
        'image_url',
        'original_filename',
        'file_size',
        'upload_ip',
        'ocr_text',
        'ocr_confidence',
        'detected_amount',
        'detected_merchant',
        'detected_date',
        'estimated_points',
        'auto_review_passed',
        'created_at'
      ]
    });
    
    // 🔴 格式化数据供前端使用
    const formattedRecords = rows.map(record => ({
      reviewId: record.review_id,
      userId: record.user_id,
      user: {
        nickname: record.user.nickname,
        avatar: record.user.avatar,
        totalPoints: record.user.total_points
      },
      image: {
        url: record.image_url,
        filename: record.original_filename,
        size: record.file_size
      },
      upload: {
        ip: record.upload_ip,
        time: record.created_at
      },
      ocr: {
        text: record.ocr_text,
        confidence: record.ocr_confidence,
        amount: record.detected_amount,
        merchant: record.detected_merchant,
        date: record.detected_date
      },
      points: {
        estimated: record.estimated_points
      },
      autoReviewPassed: record.auto_review_passed,
      waitingTime: Math.floor((new Date() - new Date(record.created_at)) / (1000 * 60)) // 等待分钟数
    }));
    
    res.json({
      code: 200,
      msg: '获取待审核列表成功',
      data: {
        reviews: formattedRecords,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        },
        summary: {
          totalPending: count,
          avgWaitingTime: count > 0 ? Math.floor(
            formattedRecords.reduce((sum, r) => sum + r.waitingTime, 0) / count
          ) : 0
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 获取待审核列表失败:', error);
    res.json({
      code: 5000,
      msg: '获取待审核列表失败',
      data: null
    });
  }
});

/**
 * 🔴 审核通过 - 商家操作
 * POST /api/merchant/reviews/:id/approve
 * 前端需要传递：实际积分和审核备注
 */
router.post('/reviews/:id/approve', authenticateToken, requireMerchant, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const reviewId = req.params.id;
    const reviewerId = req.merchant.user_id;
    const { actual_points, reviewer_note = '' } = req.body;
    
    // 🔴 参数验证
    if (!actual_points || actual_points < 0) {
      return res.json({
        code: 1001,
        msg: '请输入有效的积分数量',
        data: null
      });
    }
    
    // 查找审核记录
    const review = await PhotoReview.findOne({
      where: {
        review_id: reviewId,
        review_status: 'pending'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname']
        }
      ]
    });
    
    if (!review) {
      return res.json({
        code: 1002,
        msg: '审核记录不存在或已处理',
        data: null
      });
    }
    
    console.log(`✅ 商家 ${reviewerId} 审核通过拍照 ${reviewId}，积分: ${actual_points}`);
    
    // 🔴 更新审核记录
    await review.update({
      review_status: 'approved',
      actual_points: parseInt(actual_points),
      reviewer_id: reviewerId,
      reviewer_note: reviewer_note || '审核通过',
      reviewed_at: new Date()
    }, { transaction });
    
    // 🔴 给用户增加积分
    await PointsRecord.create({
      user_id: review.user_id,
      points: parseInt(actual_points),
      change_type: 'earn',
      source: 'photo_upload',
      description: `拍照获得积分 - ${review.detected_merchant || '消费'} (商家审核)`,
      reference_id: reviewId,
      created_at: new Date()
    }, { transaction });
    
    // 更新用户总积分
    await User.increment('total_points', {
      by: parseInt(actual_points),
      where: { user_id: review.user_id },
      transaction
    });
    
    await transaction.commit();
    
    // 🔴 WebSocket推送审核结果给用户
    webSocketService.sendToUser(review.user_id, 'review_result', {
      reviewId: reviewId,
      status: 'approved',
      points: parseInt(actual_points),
      message: `您的拍照已审核通过，获得 ${actual_points} 积分！`,
      reviewerNote: reviewer_note
    });
    
    // 推送积分更新
    const updatedUser = await User.findByPk(review.user_id);
    webSocketService.sendToUser(review.user_id, 'points_update', {
      totalPoints: updatedUser.total_points,
      change: parseInt(actual_points)
    });
    
    res.json({
      code: 200,
      msg: '审核通过成功',
      data: {
        reviewId: reviewId,
        status: 'approved',
        actualPoints: parseInt(actual_points),
        userId: review.user_id,
        userNickname: review.user.nickname,
        reviewedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ 审核通过失败:', error);
    res.json({
      code: 5000,
      msg: '审核处理失败',
      data: null
    });
  }
});

/**
 * 🔴 审核拒绝 - 商家操作
 * POST /api/merchant/reviews/:id/reject
 * 前端需要传递：拒绝原因
 */
router.post('/reviews/:id/reject', authenticateToken, requireMerchant, async (req, res) => {
  try {
    const reviewId = req.params.id;
    const reviewerId = req.merchant.user_id;
    const { reason = '' } = req.body;
    
    // 🔴 参数验证
    if (!reason || reason.trim().length < 5) {
      return res.json({
        code: 1001,
        msg: '请填写拒绝原因（至少5个字符）',
        data: null
      });
    }
    
    // 查找审核记录
    const review = await PhotoReview.findOne({
      where: {
        review_id: reviewId,
        review_status: 'pending'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname']
        }
      ]
    });
    
    if (!review) {
      return res.json({
        code: 1002,
        msg: '审核记录不存在或已处理',
        data: null
      });
    }
    
    console.log(`❌ 商家 ${reviewerId} 审核拒绝拍照 ${reviewId}，原因: ${reason}`);
    
    // 🔴 更新审核记录
    await review.update({
      review_status: 'rejected',
      actual_points: 0,
      reviewer_id: reviewerId,
      reviewer_note: reason,
      reviewed_at: new Date()
    });
    
    // 🔴 WebSocket推送审核结果给用户
    webSocketService.sendToUser(review.user_id, 'review_result', {
      reviewId: reviewId,
      status: 'rejected',
      points: 0,
      message: '很抱歉，您的拍照未通过审核',
      reviewerNote: reason
    });
    
    res.json({
      code: 200,
      msg: '审核拒绝成功',
      data: {
        reviewId: reviewId,
        status: 'rejected',
        reason: reason,
        userId: review.user_id,
        userNickname: review.user.nickname,
        reviewedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ 审核拒绝失败:', error);
    res.json({
      code: 5000,
      msg: '审核处理失败',
      data: null
    });
  }
});

/**
 * 🔴 批量审核 - 商家操作
 * POST /api/merchant/reviews/batch
 * 前端需要传递：审核ID列表和操作类型
 */
router.post('/reviews/batch', authenticateToken, requireMerchant, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const reviewerId = req.merchant.user_id;
    const { review_ids, action, actual_points, reason } = req.body;
    
    // 🔴 参数验证
    if (!review_ids || !Array.isArray(review_ids) || review_ids.length === 0) {
      return res.json({
        code: 1001,
        msg: '请选择要审核的记录',
        data: null
      });
    }
    
    if (!['approve', 'reject'].includes(action)) {
      return res.json({
        code: 1002,
        msg: '无效的操作类型',
        data: null
      });
    }
    
    if (review_ids.length > 50) {
      return res.json({
        code: 1003,
        msg: '一次最多只能批量处理50条记录',
        data: null
      });
    }
    
    console.log(`📝 商家 ${reviewerId} 批量${action === 'approve' ? '通过' : '拒绝'} ${review_ids.length} 条审核`);
    
    // 🔴 查找所有待审核记录
    const reviews = await PhotoReview.findAll({
      where: {
        review_id: review_ids,
        review_status: 'pending'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname']
        }
      ]
    });
    
    if (reviews.length === 0) {
      return res.json({
        code: 1004,
        msg: '没有找到待审核的记录',
        data: null
      });
    }
    
    const results = {
      success: [],
      failed: []
    };
    
    // 🔴 批量处理
    for (const review of reviews) {
      try {
        if (action === 'approve') {
          // 批量通过
          const points = actual_points || review.estimated_points || 50;
          
          await review.update({
            review_status: 'approved',
            actual_points: points,
            reviewer_id: reviewerId,
            reviewer_note: reason || '批量审核通过',
            reviewed_at: new Date()
          }, { transaction });
          
          // 给用户增加积分
          await PointsRecord.create({
            user_id: review.user_id,
            points: points,
            change_type: 'earn',
            source: 'photo_upload',
            description: `拍照获得积分 - ${review.detected_merchant || '消费'} (批量审核)`,
            reference_id: review.review_id,
            created_at: new Date()
          }, { transaction });
          
          // 更新用户总积分
          await User.increment('total_points', {
            by: points,
            where: { user_id: review.user_id },
            transaction
          });
          
          // WebSocket推送
          webSocketService.sendToUser(review.user_id, 'review_result', {
            reviewId: review.review_id,
            status: 'approved',
            points: points,
            message: `您的拍照已审核通过，获得 ${points} 积分！`,
            reviewerNote: reason || '批量审核通过'
          });
          
          results.success.push({
            reviewId: review.review_id,
            userId: review.user_id,
            points: points
          });
          
        } else {
          // 批量拒绝
          await review.update({
            review_status: 'rejected',
            actual_points: 0,
            reviewer_id: reviewerId,
            reviewer_note: reason || '批量审核拒绝',
            reviewed_at: new Date()
          }, { transaction });
          
          // WebSocket推送
          webSocketService.sendToUser(review.user_id, 'review_result', {
            reviewId: review.review_id,
            status: 'rejected',
            points: 0,
            message: '很抱歉，您的拍照未通过审核',
            reviewerNote: reason || '批量审核拒绝'
          });
          
          results.success.push({
            reviewId: review.review_id,
            userId: review.user_id,
            points: 0
          });
        }
        
      } catch (error) {
        console.error(`❌ 处理审核记录 ${review.review_id} 失败:`, error);
        results.failed.push({
          reviewId: review.review_id,
          error: error.message
        });
      }
    }
    
    await transaction.commit();
    
    // 🔴 推送积分更新（批量通过时）
    if (action === 'approve') {
      for (const result of results.success) {
        if (result.points > 0) {
          const updatedUser = await User.findByPk(result.userId);
          webSocketService.sendToUser(result.userId, 'points_update', {
            totalPoints: updatedUser.total_points,
            change: result.points
          });
        }
      }
    }
    
    res.json({
      code: 200,
      msg: `批量${action === 'approve' ? '通过' : '拒绝'}完成`,
      data: {
        total: review_ids.length,
        success: results.success.length,
        failed: results.failed.length,
        results: results
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ 批量审核失败:', error);
    res.json({
      code: 5000,
      msg: '批量审核处理失败',
      data: null
    });
  }
});

/**
 * 🔴 商家审核统计
 * GET /api/merchant/statistics
 */
router.get('/statistics', authenticateToken, requireMerchant, async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const reviewerId = req.merchant.user_id;
    
    // 🔴 构建时间范围
    let startDate;
    const endDate = new Date();
    
    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
    }
    
    // 🔴 查询统计数据
    const [
      totalPending,
      totalReviewed,
      approvedCount,
      rejectedCount,
      myReviewed,
      totalPointsAwarded
    ] = await Promise.all([
      // 当前待审核总数
      PhotoReview.count({
        where: { review_status: 'pending' }
      }),
      
      // 时间范围内已审核总数
      PhotoReview.count({
        where: {
          review_status: ['approved', 'rejected'],
          reviewed_at: {
            [Op.between]: [startDate, endDate]
          }
        }
      }),
      
      // 时间范围内通过数
      PhotoReview.count({
        where: {
          review_status: 'approved',
          reviewed_at: {
            [Op.between]: [startDate, endDate]
          }
        }
      }),
      
      // 时间范围内拒绝数
      PhotoReview.count({
        where: {
          review_status: 'rejected',
          reviewed_at: {
            [Op.between]: [startDate, endDate]
          }
        }
      }),
      
      // 我审核的数量
      PhotoReview.count({
        where: {
          reviewer_id: reviewerId,
          reviewed_at: {
            [Op.between]: [startDate, endDate]
          }
        }
      }),
      
      // 总发放积分
      PhotoReview.sum('actual_points', {
        where: {
          review_status: 'approved',
          reviewed_at: {
            [Op.between]: [startDate, endDate]
          }
        }
      })
    ]);
    
    // 🔴 获取审核速度统计
    const avgReviewTime = await PhotoReview.findAll({
      where: {
        review_status: ['approved', 'rejected'],
        reviewed_at: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        [
          sequelize.fn(
            'AVG',
            sequelize.fn(
              'TIMESTAMPDIFF',
              sequelize.literal('MINUTE'),
              sequelize.col('created_at'),
              sequelize.col('reviewed_at')
            )
          ),
          'avg_minutes'
        ]
      ],
      raw: true
    });
    
    const avgMinutes = avgReviewTime[0]?.avg_minutes || 0;
    
    res.json({
      code: 200,
      msg: '获取统计数据成功',
      data: {
        period: period,
        timeRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        pending: {
          total: totalPending
        },
        reviewed: {
          total: totalReviewed,
          approved: approvedCount,
          rejected: rejectedCount,
          approvalRate: totalReviewed > 0 ? ((approvedCount / totalReviewed) * 100).toFixed(1) : 0
        },
        personal: {
          reviewed: myReviewed,
          percentage: totalReviewed > 0 ? ((myReviewed / totalReviewed) * 100).toFixed(1) : 0
        },
        points: {
          total: totalPointsAwarded || 0,
          average: approvedCount > 0 ? Math.round((totalPointsAwarded || 0) / approvedCount) : 0
        },
        performance: {
          avgReviewTime: Math.round(avgMinutes), // 平均审核时间（分钟）
          productivity: Math.round(myReviewed / Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24))) // 每日审核数
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 获取统计数据失败:', error);
    res.json({
      code: 5000,
      msg: '获取统计数据失败',
      data: null
    });
  }
});

/**
 * 🔴 获取审核历史记录 - 商家查看自己的审核历史
 * GET /api/merchant/reviews/history?page=1&limit=10&status=all&date_from=2024-01-01&date_to=2024-12-31
 */
router.get('/reviews/history', authenticateToken, requireMerchant, async (req, res) => {
  try {
    const reviewerId = req.merchant.user_id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    
    // 🔴 查询审核历史
    const { count, rows } = await PhotoReview.findAndCountAll({
      where: {
        reviewer_id: reviewerId,
        review_status: ['approved', 'rejected']
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'avatar']
        }
      ],
      order: [['reviewed_at', 'DESC']],
      limit,
      offset,
      attributes: [
        'review_id',
        'user_id',
        'image_url',
        'original_filename',
        'detected_amount',
        'detected_merchant',
        'estimated_points',
        'actual_points',
        'review_status',
        'reviewer_note',
        'created_at',
        'reviewed_at'
      ]
    });
    
    // 🔴 格式化历史记录
    const formattedHistory = rows.map(record => ({
      reviewId: record.review_id,
      user: {
        id: record.user_id,
        nickname: record.user.nickname,
        avatar: record.user.avatar
      },
      image: {
        url: record.image_url,
        filename: record.original_filename
      },
      ocr: {
        amount: record.detected_amount,
        merchant: record.detected_merchant
      },
      points: {
        estimated: record.estimated_points,
        actual: record.actual_points
      },
      review: {
        status: record.review_status,
        note: record.reviewer_note,
        reviewedAt: record.reviewed_at
      },
      timing: {
        uploadedAt: record.created_at,
        reviewTime: Math.floor((new Date(record.reviewed_at) - new Date(record.created_at)) / (1000 * 60)) // 审核耗时(分钟)
      }
    }));
    
    res.json({
      code: 200,
      msg: '获取审核历史成功',
      data: {
        history: formattedHistory,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 获取审核历史失败:', error);
    res.json({
      code: 5000,
      msg: '获取审核历史失败',
      data: null
    });
  }
});

module.exports = router; 