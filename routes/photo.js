/**
 * 拍照上传路由
 * 🔴 前端对接说明：
 * - POST /api/photo/upload - 上传拍照图片
 * - GET /api/photo/history - 获取拍照历史
 * - GET /api/photo/review/:id - 获取审核结果
 * 🔴 WebSocket推送：审核结果会通过WebSocket实时推送
 */

const express = require('express');
const multer = require('multer');
// const sharp = require('sharp'); // 🔴 暂时注释掉，如果需要图片处理可以后续添加
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { PhotoReview, PointsRecord, User, sequelize } = require('../models');
const sealosStorage = require('../services/sealosStorage');
const webSocketService = require('../services/websocket');

const router = express.Router();

// 🔴 配置multer内存存储 - 图片先存在内存中处理
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB (降低限制)
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // 检查文件类型
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

// 🔴 OCR识别服务（模拟实现，实际需要接入百度/腾讯/阿里云OCR）
async function performOCR(imageBuffer) {
  try {
    // 这里应该调用真实的OCR服务
    // 暂时返回模拟数据进行测试
    const mockOCRResult = {
      success: true,
      confidence: 0.95,
      text: '餐厅消费单据\n消费金额：85.50元\n消费时间：2024-01-15 18:30\n商家：海底捞火锅店',
      amount: 85.50,
      merchant: '海底捞火锅店',
      date: '2024-01-15 18:30'
    };
    
    console.log('🔍 OCR识别结果（模拟）:', mockOCRResult);
    return mockOCRResult;
  } catch (error) {
    console.error('❌ OCR识别失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 🔴 积分计算规则
function calculatePoints(amount, confidence) {
  const baseRate = parseFloat(process.env.PHOTO_POINTS_RATE) || 10; // 每元10积分
  const minPoints = parseInt(process.env.MIN_POINTS_AWARD) || 50;
  const maxPoints = parseInt(process.env.MAX_POINTS_AWARD) || 2000;
  
  // 根据OCR置信度调整积分
  let points = Math.floor(amount * baseRate);
  
  if (confidence < 0.7) {
    points = Math.floor(points * 0.5); // 低置信度减半
  } else if (confidence > 0.9) {
    points = Math.floor(points * 1.2); // 高置信度加成
  }
  
  // 限制积分范围
  points = Math.max(minPoints, Math.min(maxPoints, points));
  
  return points;
}

/**
 * 🔴 拍照上传接口
 * POST /api/photo/upload
 * 前端需要传递：multipart/form-data 格式的图片文件
 * 返回：上传结果和预估积分
 */
router.post('/upload', authenticateToken, upload.single('photo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const userId = req.user.user_id;
    const file = req.file;
    
    if (!file) {
      return res.json({
        code: 1001,
        msg: '请选择要上传的图片',
        data: null
      });
    }
    
    console.log(`📸 用户 ${userId} 上传拍照，文件大小: ${file.size} bytes`);
    
    // 🔴 基础图片验证（替代sharp处理）
    let processedImage = file.buffer;
    
    // 检查文件大小和类型
    if (file.size > 5 * 1024 * 1024) { // 5MB限制
      return res.json({
        code: 1002,
        msg: '图片文件过大，请选择小于5MB的图片',
        data: null
      });
    }
    
    console.log(`🖼️ 图片验证通过，大小: ${file.size} bytes，类型: ${file.mimetype}`);
    
    // 🔴 上传到Sealos对象存储
    const fileName = `photos/${userId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${file.mimetype.split('/')[1]}`;
    let uploadResult;
    
    try {
      uploadResult = await sealosStorage.uploadBuffer(processedImage, fileName, file.mimetype);
      console.log('☁️ 图片上传到Sealos成功:', uploadResult.url);
    } catch (error) {
      console.error('❌ 图片上传失败:', error);
      await transaction.rollback();
      return res.json({
        code: 1003,
        msg: '图片上传失败，请重试',
        data: null
      });
    }
    
    // 🔴 执行OCR识别
    console.log('🔍 开始OCR识别...');
    const ocrResult = await performOCR(processedImage);
    
    if (!ocrResult.success) {
      console.error('❌ OCR识别失败:', ocrResult.error);
    }
    
    // 🔴 计算预估积分
    let estimatedPoints = 0;
    if (ocrResult.success && ocrResult.amount) {
      estimatedPoints = calculatePoints(ocrResult.amount, ocrResult.confidence);
    }
    
    // 🔴 创建审核记录
    const reviewRecord = await PhotoReview.create({
      user_id: userId,
      image_url: uploadResult.url,
      image_path: fileName,
      original_filename: file.originalname,
      file_size: file.size,
      upload_ip: req.ip,
      
      // OCR识别结果
      ocr_text: ocrResult.text || null,
      ocr_confidence: ocrResult.confidence || 0,
      detected_amount: ocrResult.amount || 0,
      detected_merchant: ocrResult.merchant || null,
      detected_date: ocrResult.date || null,
      
      // 积分相关
      estimated_points: estimatedPoints,
      
      // 审核状态
      review_status: 'pending',
      auto_review_passed: ocrResult.success && ocrResult.confidence > 0.8,
      
      created_at: new Date()
    }, { transaction });
    
    // 🔴 如果OCR置信度很高，自动通过审核
    if (ocrResult.success && ocrResult.confidence > 0.9 && ocrResult.amount > 0) {
      console.log('✅ 高置信度OCR，自动通过审核');
      
      // 更新审核状态
      await reviewRecord.update({
        review_status: 'approved',
        actual_points: estimatedPoints,
        reviewer_note: '系统自动审核通过（高置信度OCR）',
        reviewed_at: new Date()
      }, { transaction });
      
      // 🔴 给用户加积分
      await PointsRecord.create({
        user_id: userId,
        points: estimatedPoints,
        change_type: 'earn',
        source: 'photo_upload',
        description: `拍照获得积分 - ${ocrResult.merchant || '消费'}`,
        reference_id: reviewRecord.review_id,
        created_at: new Date()
      }, { transaction });
      
      // 更新用户总积分
      await User.increment('total_points', {
        by: estimatedPoints,
        where: { user_id: userId },
        transaction
      });
      
      await transaction.commit();
      
      // 🔴 WebSocket推送审核结果
      webSocketService.sendToUser(userId, 'review_result', {
        reviewId: reviewRecord.review_id,
        status: 'approved',
        points: estimatedPoints,
        message: '拍照审核通过，积分已到账！'
      });
      
      // 推送积分更新
      const updatedUser = await User.findByPk(userId);
      webSocketService.sendToUser(userId, 'points_update', {
        totalPoints: updatedUser.total_points,
        change: estimatedPoints
      });
      
      return res.json({
        code: 200,
        msg: '拍照上传成功，自动审核通过！',
        data: {
          reviewId: reviewRecord.review_id,
          imageUrl: uploadResult.url,
          status: 'approved',
          points: estimatedPoints,
          ocrResult: {
            text: ocrResult.text,
            confidence: ocrResult.confidence,
            amount: ocrResult.amount,
            merchant: ocrResult.merchant
          }
        }
      });
    } else {
      // 需要人工审核
      await transaction.commit();
      
      console.log('📝 提交人工审核队列');
      
      return res.json({
        code: 200,
        msg: '拍照上传成功，正在审核中...',
        data: {
          reviewId: reviewRecord.review_id,
          imageUrl: uploadResult.url,
          status: 'pending',
          estimatedPoints: estimatedPoints,
          ocrResult: ocrResult.success ? {
            text: ocrResult.text,
            confidence: ocrResult.confidence,
            amount: ocrResult.amount,
            merchant: ocrResult.merchant
          } : null
        }
      });
    }
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ 拍照上传处理失败:', error);
    
    res.json({
      code: 5000,
      msg: '系统处理失败，请重试',
      data: null
    });
  }
});

/**
 * 🔴 获取拍照历史记录
 * GET /api/photo/history?page=1&limit=10&status=all
 * 前端可以筛选状态：all|pending|approved|rejected
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const status = req.query.status || 'all';
    const offset = (page - 1) * limit;
    
    // 构建查询条件
    const whereCondition = { user_id: userId };
    if (status !== 'all') {
      whereCondition.review_status = status;
    }
    
    // 查询记录
    const { count, rows } = await PhotoReview.findAndCountAll({
      where: whereCondition,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      attributes: [
        'review_id',
        'image_url',
        'original_filename',
        'file_size',
        'ocr_text',
        'ocr_confidence',
        'detected_amount',
        'detected_merchant',
        'detected_date',
        'estimated_points',
        'actual_points',
        'review_status',
        'reviewer_note',
        'created_at',
        'reviewed_at'
      ]
    });
    
    // 🔴 返回格式化数据 - 前端可以直接使用
    const formattedRecords = rows.map(record => ({
      reviewId: record.review_id,
      imageUrl: record.image_url,
      filename: record.original_filename,
      fileSize: record.file_size,
      ocrResult: {
        text: record.ocr_text,
        confidence: record.ocr_confidence,
        amount: record.detected_amount,
        merchant: record.detected_merchant,
        date: record.detected_date
      },
      points: {
        estimated: record.estimated_points,
        actual: record.actual_points
      },
      status: record.review_status,
      statusText: getStatusText(record.review_status),
      reviewerNote: record.reviewer_note,
      createdAt: record.created_at,
      reviewedAt: record.reviewed_at
    }));
    
    res.json({
      code: 200,
      msg: '获取拍照历史成功',
      data: {
        records: formattedRecords,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        },
        summary: {
          totalUploads: count,
          pendingCount: rows.filter(r => r.review_status === 'pending').length,
          approvedCount: rows.filter(r => r.review_status === 'approved').length,
          rejectedCount: rows.filter(r => r.review_status === 'rejected').length
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 获取拍照历史失败:', error);
    res.json({
      code: 5000,
      msg: '获取拍照历史失败',
      data: null
    });
  }
});

/**
 * 🔴 获取特定审核记录详情
 * GET /api/photo/review/:id
 */
router.get('/review/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const reviewId = req.params.id;
    
    const record = await PhotoReview.findOne({
      where: {
        review_id: reviewId,
        user_id: userId // 确保用户只能查看自己的记录
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['nickname', 'avatar']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['nickname'],
          required: false
        }
      ]
    });
    
    if (!record) {
      return res.json({
        code: 1004,
        msg: '审核记录不存在',
        data: null
      });
    }
    
    // 🔴 格式化详细信息 - 前端可以直接使用
    const detailData = {
      reviewId: record.review_id,
      imageUrl: record.image_url,
      filename: record.original_filename,
      fileSize: record.file_size,
      uploadIp: record.upload_ip,
      
      ocrResult: {
        text: record.ocr_text,
        confidence: record.ocr_confidence,
        amount: record.detected_amount,
        merchant: record.detected_merchant,
        date: record.detected_date
      },
      
      points: {
        estimated: record.estimated_points,
        actual: record.actual_points
      },
      
      review: {
        status: record.review_status,
        statusText: getStatusText(record.review_status),
        autoReviewPassed: record.auto_review_passed,
        reviewerNote: record.reviewer_note,
        reviewedAt: record.reviewed_at,
        reviewer: record.reviewer ? record.reviewer.nickname : null
      },
      
      user: {
        nickname: record.user.nickname,
        avatar: record.user.avatar
      },
      
      timestamps: {
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        reviewedAt: record.reviewed_at
      }
    };
    
    res.json({
      code: 200,
      msg: '获取审核详情成功',
      data: detailData
    });
    
  } catch (error) {
    console.error('❌ 获取审核详情失败:', error);
    res.json({
      code: 5000,
      msg: '获取审核详情失败',
      data: null
    });
  }
});

/**
 * 🔴 获取上传统计信息
 * GET /api/photo/statistics
 */
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    // 获取统计数据
    const [totalCount, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      PhotoReview.count({ where: { user_id: userId } }),
      PhotoReview.count({ where: { user_id: userId, review_status: 'pending' } }),
      PhotoReview.count({ where: { user_id: userId, review_status: 'approved' } }),
      PhotoReview.count({ where: { user_id: userId, review_status: 'rejected' } })
    ]);
    
    // 获取总获得积分
    const totalPoints = await PhotoReview.sum('actual_points', {
      where: { 
        user_id: userId, 
        review_status: 'approved' 
      }
    }) || 0;
    
    // 获取本月统计
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const monthlyCount = await PhotoReview.count({
      where: {
        user_id: userId,
        created_at: {
          [require('sequelize').Op.gte]: thisMonth
        }
      }
    });
    
    res.json({
      code: 200,
      msg: '获取统计信息成功',
      data: {
        total: {
          uploads: totalCount,
          points: totalPoints
        },
        status: {
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount
        },
        monthly: {
          uploads: monthlyCount
        },
        rates: {
          approvalRate: totalCount > 0 ? ((approvedCount / totalCount) * 100).toFixed(1) : 0,
          rejectionRate: totalCount > 0 ? ((rejectedCount / totalCount) * 100).toFixed(1) : 0
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 获取统计信息失败:', error);
    res.json({
      code: 5000,
      msg: '获取统计信息失败',
      data: null
    });
  }
});

// 🔴 辅助函数：获取状态文本
function getStatusText(status) {
  const statusMap = {
    'pending': '审核中',
    'approved': '已通过',
    'rejected': '已拒绝'
  };
  return statusMap[status] || '未知状态';
}

// 🔴 错误处理中间件
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.json({
        code: 1005,
        msg: '文件大小超过限制（最大10MB）',
        data: null
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.json({
        code: 1006,
        msg: '一次只能上传一个文件',
        data: null
      });
    }
  }
  
  if (error.message === '只允许上传图片文件') {
    return res.json({
      code: 1007,
      msg: '只允许上传图片文件',
      data: null
    });
  }
  
  console.error('❌ 拍照路由错误:', error);
  res.json({
    code: 5000,
    msg: '文件处理失败',
    data: null
  });
});

module.exports = router; 