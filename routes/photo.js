/**
 * 拍照上传路由 - v2.1.2纯人工审核版本
 * 🔴 重要更新：移除OCR和AI自动识别功能，改为纯人工审核模式
 * 🔴 前端对接说明：
 * - POST /api/photo/upload - 上传拍照图片（用户手动输入金额）
 * - GET /api/photo/history - 获取拍照历史
 * - GET /api/photo/review/:id - 获取审核结果
 * 🔴 WebSocket推送：审核结果会通过WebSocket实时推送
 */

const express = require('express');
const multer = require('multer');
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
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
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

/**
 * 🔴 拍照上传接口 - v2.1.2纯人工审核版本
 * POST /api/photo/upload
 * 前端需要传递：
 * - multipart/form-data 格式的图片文件
 * - amount: 用户手动输入的消费金额（必需）
 * 返回：上传结果，等待人工审核
 */
router.post('/upload', authenticateToken, upload.single('photo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const userId = req.user.user_id;
    const file = req.file;
    const { amount } = req.body; // 🔴 用户手动输入的消费金额
    
    // 🔴 参数验证
    if (!file) {
      await transaction.rollback();
      return res.json({
        code: 1001,
        msg: '请选择要上传的图片',
        data: null
      });
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      await transaction.rollback();
      return res.json({
        code: 1002,
        msg: '请输入有效的消费金额',
        data: null
      });
    }
    
    const parsedAmount = parseFloat(amount);
    if (parsedAmount > 10000) {
      await transaction.rollback();
      return res.json({
        code: 1003,
        msg: '消费金额不能超过10000元',
        data: null
      });
    }
    
    console.log(`📸 用户 ${userId} 上传拍照，文件大小: ${file.size} bytes，消费金额: ${parsedAmount}元`);
    
    // 🔴 基础图片验证
    if (file.size > 5 * 1024 * 1024) { // 5MB限制
      await transaction.rollback();
      return res.json({
        code: 1004,
        msg: '图片文件过大，请选择小于5MB的图片',
        data: null
      });
    }
    
    console.log(`🖼️ 图片验证通过，大小: ${file.size} bytes，类型: ${file.mimetype}`);
    
    // 🔴 上传到Sealos对象存储
    const fileName = `photos/${userId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${file.mimetype.split('/')[1]}`;
    let uploadResult;
    
    try {
      uploadResult = await sealosStorage.uploadBuffer(file.buffer, fileName, file.mimetype);
      console.log('☁️ 图片上传到Sealos成功:', uploadResult.url);
    } catch (error) {
      console.error('❌ 图片上传失败:', error);
      await transaction.rollback();
      return res.json({
        code: 1005,
        msg: '图片上传失败，请重试',
        data: null
      });
    }
    
    // 🔴 生成唯一上传ID
    const uploadId = `upload_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // 🔴 创建审核记录 - 纯人工审核模式
    const reviewRecord = await PhotoReview.createUploadRecord({
      user_id: userId,
      upload_id: uploadId,
      image_url: uploadResult.url,
      original_filename: file.originalname,
      file_size: file.size,
      amount: parsedAmount  // 🔴 用户手动输入的金额
    }, transaction);
    
    await transaction.commit();
    
    // 🔴 WebSocket通知商家有新的待审核图片
    webSocketService.notifyMerchants('new_review', {
      upload_id: uploadId,
      user_id: userId,
      amount: parsedAmount,
      image_url: uploadResult.url,
      uploaded_at: new Date().toISOString()
    });
    
    // 🔴 返回成功结果 - 等待人工审核
    res.json({
      code: 0,
      msg: '图片上传成功，等待商家审核',
      data: {
        upload_id: uploadId,
        status: 'pending',
        amount: parsedAmount,
        message: '您的消费凭证已提交，商家将在24小时内完成审核，请耐心等待',
        estimated_review_time: '24小时内'
      }
    });
    
    console.log(`✅ 用户 ${userId} 拍照上传成功，等待人工审核，upload_id: ${uploadId}`);
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ 拍照上传失败:', error);
    res.json({
      code: 5000,
      msg: '上传失败，请重试',
      data: null
    });
  }
});

/**
 * 🔴 获取上传历史记录
 * GET /api/photo/history?page=1&limit=10&status=all
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10, status = 'all' } = req.query;
    
    const result = await PhotoReview.getUserHistory(userId, {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50), // 最多50条
      status
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: result
    });
    
  } catch (error) {
    console.error('❌ 获取上传历史失败:', error);
    res.json({
      code: 4000,
      msg: '获取历史记录失败',
      data: null
    });
  }
});

/**
 * 🔴 获取上传记录 - 兼容前端/upload/records路径
 * GET /upload/records?page=1&limit=10&status=all
 * 这是history的别名路由，用于兼容前端请求路径
 */
router.get('/records', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10, status = 'all' } = req.query;
    
    const result = await PhotoReview.getUserHistory(userId, {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50), // 最多50条
      status
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: result
    });
    
  } catch (error) {
    console.error('❌ 获取上传记录失败:', error);
    res.json({
      code: 4000,
      msg: '获取历史记录失败',
      data: null
    });
  }
});

/**
 * 🔴 获取单个审核结果详情
 * GET /api/photo/review/:upload_id
 */
router.get('/review/:upload_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { upload_id } = req.params;
    
    const review = await PhotoReview.findOne({
      where: {
        upload_id,
        user_id: userId  // 确保用户只能查看自己的记录
      }
    });
    
    if (!review) {
      return res.json({
        code: 4001,
        msg: '审核记录不存在',
        data: null
      });
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: review.getFrontendInfo()
    });
    
  } catch (error) {
    console.error('❌ 获取审核详情失败:', error);
    res.json({
      code: 4000,
      msg: '获取审核详情失败',
      data: null
    });
  }
});

/**
 * 🔴 获取拍照统计信息
 * GET /api/photo/statistics
 */
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    // 统计用户的拍照情况
    const totalUploads = await PhotoReview.count({
      where: { user_id: userId }
    });
    
    const approvedUploads = await PhotoReview.count({
      where: { 
        user_id: userId,
        review_status: 'approved'
      }
    });
    
    const pendingUploads = await PhotoReview.count({
      where: { 
        user_id: userId,
        review_status: 'pending'
      }
    });
    
    const rejectedUploads = await PhotoReview.count({
      where: { 
        user_id: userId,
        review_status: 'rejected'
      }
    });
    
    // 计算总获得积分
    const totalPointsResult = await PhotoReview.sum('points_awarded', {
      where: { 
        user_id: userId,
        review_status: 'approved'
      }
    });
    
    const totalPointsFromPhotos = totalPointsResult || 0;
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        total_uploads: totalUploads,
        approved_uploads: approvedUploads,
        pending_uploads: pendingUploads,
        rejected_uploads: rejectedUploads,
        total_points_earned: totalPointsFromPhotos,
        approval_rate: totalUploads > 0 ? (approvedUploads / totalUploads * 100).toFixed(1) : '0.0'
      }
    });
    
  } catch (error) {
    console.error('❌ 获取拍照统计失败:', error);
    res.json({
      code: 4000,
      msg: '获取统计信息失败',
      data: null
    });
  }
});

// 🔴 辅助函数 - 获取状态文本
function getStatusText(status) {
  const statusMap = {
    'pending': '待审核',
    'approved': '审核通过',
    'rejected': '审核拒绝'
  };
  return statusMap[status] || '未知状态';
}

// 🔴 辅助函数 - 验证图片文件格式
function isValidImageType(mimetype) {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/webp'
  ];
  return allowedTypes.includes(mimetype.toLowerCase());
}

// 🔴 辅助函数 - 生成安全的文件名
function generateSafeFileName(originalName, userId) {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substr(2, 8);
  return `photo_${userId}_${timestamp}_${randomStr}${ext}`;
}

module.exports = router; 