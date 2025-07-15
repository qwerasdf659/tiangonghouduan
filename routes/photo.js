/**
 * 照片上传审核API路由 - v2.1.2纯人工审核版本
 * 🔴 前端对接要点：
 * - POST /api/photo/upload - 图片上传和消费金额提交
 * - GET /api/photo/history - 获取用户上传历史
 * - GET /api/photo/review/:id - 获取具体审核结果
 * - GET /api/photo/statistics - 获取上传统计数据（已修复）
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 🔴 修复：正确导入所有需要的模型
const { User, PhotoReview, PointsRecord } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { sequelize } = require('../models'); // Keep sequelize for transaction
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
 * 
 * 🔴 权限说明：
 * - 普通用户：可以上传照片等待管理员审核
 * - 管理员用户：可以上传照片，由任何管理员审核（包括自己）
 * - 所有管理员都可以审核所有用户（普通用户+管理员）上传的照片
 * 
 * 返回：上传结果，等待人工审核
 */
router.post('/upload', authenticateToken, upload.single('photo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const userId = req.user.user_id;
    const file = req.file;
    const { amount } = req.body; // 🔴 用户手动输入的消费金额（可选）
    
    // 🔴 允许管理员上传照片：管理员也可以上传照片进行审核
    // 注意：管理员上传的照片可以由其他管理员审核
    
    // 🔴 参数验证
    if (!file) {
      await transaction.rollback();
      return res.json({
        code: 1001,
        msg: '请选择要上传的图片',
        data: null
      });
    }
    
    // 🔴 消费金额验证（可选参数，允许为0）
    let parsedAmount = 0; // 默认值
    if (amount && parseFloat(amount) > 0) {
      parsedAmount = parseFloat(amount);
      if (parsedAmount > 10000) {
        await transaction.rollback();
        return res.json({
          code: 1003,
          msg: '消费金额不能超过10000元',
          data: null
        });
      }
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
      uploadResult = await sealosStorage.uploadImage(file.buffer, file.originalname);
      console.log('☁️ 图片上传到Sealos成功:', uploadResult);
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
      image_url: uploadResult,
      original_filename: file.originalname,
      file_size: file.size,
      amount: parsedAmount  // 🔴 用户手动输入的金额
    }, transaction);
    
    await transaction.commit();
    
    // 🔴 返回成功结果 - 等待人工审核
    res.json({
      code: 0,
      msg: '图片上传成功，等待管理员审核',
      data: {
        upload_id: uploadId,
        status: 'pending',
        amount: parsedAmount,
        message: '您的消费凭证已提交，管理员将在24小时内完成审核，请耐心等待',
        estimated_review_time: '24小时内'
      }
    });
    
    console.log(`✅ 用户 ${userId} 拍照上传成功，等待人工审核，upload_id: ${uploadId}`);
    
  } catch (error) {
    // 🔴 修复事务处理错误：只有当事务还没有完成时才进行回滚
    if (transaction && !transaction.finished) {
    await transaction.rollback();
    }
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
 * 🔴 获取用户上传历史 - 兼容前端/photo/history路径
 * GET /api/photo/history (兼容前端期望的路径)
 * 这是/records接口的兼容版本，完全相同的功能
 * 参数：page, limit, status (pending|approved|rejected|all)
 * 🔴 解决前端调用/photo/history返回404的问题
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10, status = 'all' } = req.query;
    
    console.log(`📚 用户 ${userId} 请求上传历史 (兼容路径 /history)，page=${page}, limit=${limit}, status=${status}`);
    
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
    
    console.log(`✅ 用户 ${userId} 上传历史返回成功，共 ${result.pagination.total} 条记录`);
    
  } catch (error) {
    console.error('❌ 获取上传历史失败 (兼容路径):', error);
    res.json({
      code: 4000,
      msg: '获取历史记录失败',
      data: null
    });
  }
});

/**
 * 🔴 获取上传审核详情 - 根据upload_id查询具体审核结果
 * GET /api/photo/review/:id
 */
router.get('/review/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.user_id;
    
    const review = await PhotoReview.findOne({
      where: {
        upload_id: id,
        user_id: userId  // 确保用户只能查看自己的审核记录
      }
    });
    
    if (!review) {
      return res.json({
        code: 1004,
        msg: '审核记录不存在',
        data: null
      });
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: review.getReviewResult()
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

// 🔴 前端对接点：上传统计接口 - 修复前端getStatistics调用
// GET /api/photo/statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    console.log(`📊 用户 ${userId} 查询上传统计`);
    
    // 🔴 查询用户上传记录 - 修复字段名：review_status而不是status
    const uploadRecords = await PhotoReview.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      attributes: ['upload_id', 'review_status', 'amount', 'points_awarded', 'created_at', 'review_time']
    });
    
    // 🔴 计算统计数据
    const totalUploads = uploadRecords.length;
    const approvedUploads = uploadRecords.filter(record => record.review_status === 'approved').length;
    const rejectedUploads = uploadRecords.filter(record => record.review_status === 'rejected').length;
    const pendingUploads = uploadRecords.filter(record => record.review_status === 'pending').length;
    
    const totalPointsEarned = uploadRecords
      .filter(record => record.review_status === 'approved')
      .reduce((sum, record) => sum + (record.points_awarded || 0), 0);
    
    const totalAmountUploaded = uploadRecords.reduce((sum, record) => sum + (parseFloat(record.amount) || 0), 0);
    
    // 🔴 最近上传记录
    const recentUploads = uploadRecords.slice(0, 5).map(record => ({
      upload_id: record.upload_id,
      status: record.review_status,
      amount: record.amount,
      points_awarded: record.points_awarded,
      upload_time: record.created_at,
      review_time: record.review_time
    }));
    
    // 🔴 按月统计上传数据
    const monthlyStats = {};
    uploadRecords.forEach(record => {
      const month = record.created_at.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyStats[month]) {
        monthlyStats[month] = { count: 0, approved: 0, points: 0, amount: 0 };
      }
      monthlyStats[month].count++;
      if (record.review_status === 'approved') {
        monthlyStats[month].approved++;
        monthlyStats[month].points += record.points_awarded || 0;
      }
      monthlyStats[month].amount += parseFloat(record.amount) || 0;
    });
    
    const statistics = {
      total_uploads: totalUploads,
      approved_uploads: approvedUploads,
      rejected_uploads: rejectedUploads,
      pending_uploads: pendingUploads,
      approval_rate: totalUploads > 0 ? Math.round((approvedUploads / totalUploads) * 100) : 0,
      total_points_earned: totalPointsEarned,
      total_amount_uploaded: totalAmountUploaded,
      average_points_per_upload: approvedUploads > 0 ? Math.round(totalPointsEarned / approvedUploads) : 0,
      recent_uploads: recentUploads,
      monthly_stats: monthlyStats,
      last_upload_time: uploadRecords[0]?.created_at || null
    };
    
    res.json({
      code: 0,
      msg: 'success',
      data: statistics
    });
    
    console.log(`✅ 上传统计查询成功: 总上传${totalUploads}次, 通过${approvedUploads}次, 获得${totalPointsEarned}积分`);
    
  } catch (error) {
    console.error('获取上传统计失败:', error);
    res.json({
      code: 4000,
      msg: '获取上传统计失败',
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

// 🔴 兼容性路由：支持直接访问根路径的上传接口
// POST /api/upload (根路径)
// 这是为了兼容前端调用 /api/upload 而不是 /api/upload/upload
router.post('/', authenticateToken, upload.single('photo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const userId = req.user.user_id;
    const file = req.file;
    const { amount } = req.body; // 🔴 用户手动输入的消费金额（可选）
    
    console.log(`📸 兼容性上传接口：用户 ${userId} 通过根路径上传拍照`);
    
    // 🔴 参数验证
    if (!file) {
      await transaction.rollback();
      return res.json({
        code: 1001,
        msg: '请选择要上传的图片',
        data: null
      });
    }
    
    // 🔴 消费金额验证（可选参数，允许为0）
    let parsedAmount = 0; // 默认值
    if (amount && parseFloat(amount) > 0) {
      parsedAmount = parseFloat(amount);
      if (parsedAmount > 10000) {
        await transaction.rollback();
        return res.json({
          code: 1003,
          msg: '消费金额不能超过10000元',
          data: null
        });
      }
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
      uploadResult = await sealosStorage.uploadImage(file.buffer, file.originalname);
      console.log('☁️ 图片上传到Sealos成功:', uploadResult);
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
      image_url: uploadResult,
      original_filename: file.originalname,
      file_size: file.size,
      amount: parsedAmount  // 🔴 用户手动输入的金额
    }, transaction);
    
    await transaction.commit();
    
    // 🔴 返回成功结果 - 等待人工审核
    res.json({
      code: 0,
      msg: '图片上传成功，等待管理员审核',
      data: {
        upload_id: uploadId,
        status: 'pending',
        amount: parsedAmount,
        message: '您的消费凭证已提交，管理员将在24小时内完成审核，请耐心等待',
        estimated_review_time: '24小时内'
      }
    });
    
    console.log(`✅ 用户 ${userId} 拍照上传成功（兼容性路由），等待人工审核，upload_id: ${uploadId}`);
    
  } catch (error) {
    // 🔴 修复事务处理错误：只有当事务还没有完成时才进行回滚
    if (transaction && !transaction.finished) {
    await transaction.rollback();
    }
    console.error('❌ 拍照上传失败（兼容性路由）:', error);
    res.json({
      code: 5000,
      msg: '上传失败，请重试',
      data: null
    });
  }
});

module.exports = router; 