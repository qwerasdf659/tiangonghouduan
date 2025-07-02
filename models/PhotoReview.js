/**
 * 上传审核模型 - PhotoReview (对应upload_reviews表)
 * 🔴 v2.1.2更新：移除OCR和AI自动识别功能，改为纯人工审核模式
 * 🔴 前端对接要点：
 * - upload_id: 上传标识（前端追踪用）
 * - points_awarded: 积分奖励（审核通过时奖励）
 * - review_status: 审核状态（前端状态显示）
 * - amount: 消费金额（用户手动输入）
 * - actual_amount: 商家确认的实际消费金额
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PhotoReview = sequelize.define('upload_reviews', {
  // 🔴 上传ID - 前端追踪用 (主键改为upload_id)
  upload_id: {
    type: DataTypes.STRING(50),
    primaryKey: true,
    comment: '上传ID（前端追踪用）'
  },
  
  // 🔴 用户ID - 关联用户
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  
  // 图片URL - Sealos存储
  image_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: '图片URL（Sealos存储）'
  },
  
  // 原始文件名
  original_filename: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: '原始文件名'
  },
  
  // 文件大小
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '文件大小(字节)'
  },
  
  // 🔴 v2.1.2新增：用户手动输入的消费金额
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    },
    comment: '用户输入的消费金额'
  },
  
  // 🔴 v2.1.2新增：商家确认的实际消费金额
  actual_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    },
    comment: '商家确认的实际消费金额'
  },
  
  // 🔴 奖励积分 - 前端显示
  points_awarded: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    },
    comment: '奖励积分（审核通过时奖励）'
  },
  
  // 🔴 审核状态 - 前端状态显示
  review_status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: false,
    defaultValue: 'pending',
    comment: '审核状态（前端状态显示）'
  },
  
  // 审核理由
  review_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '审核理由（前端显示）'
  },
  
  // 审核员ID
  reviewer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '审核员ID'
  },
  
  // 创建时间 - 前端文档要求
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '创建时间'
  },
  
  // 审核时间
  review_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '审核时间'
  }
}, {
  tableName: 'upload_reviews',  // 🔴 使用前端文档要求的表名
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  
  // 索引配置
  indexes: [
    {
      name: 'idx_user_id',
      fields: ['user_id']
    },
    {
      name: 'idx_upload_id',
      fields: ['upload_id']
    },
    {
      name: 'idx_review_status',
      fields: ['review_status']
    },
    {
      name: 'idx_reviewer_id',
      fields: ['reviewer_id']
    },
    {
      name: 'idx_created_at',
      fields: ['created_at']
    },
    {
      name: 'idx_review_time',
      fields: ['review_time']
    },
    // 🔴 复合索引 - 前端查询优化
    {
      name: 'idx_user_upload',
      fields: ['user_id', 'created_at']
    },
    {
      name: 'idx_status_time',
      fields: ['review_status', 'created_at']
    }
  ]
});

// 🔴 实例方法 - 获取前端显示信息
PhotoReview.prototype.getFrontendInfo = function() {
  return {
    upload_id: this.upload_id,
    image_url: this.image_url,
    amount: this.amount,
    actual_amount: this.actual_amount,
    points_awarded: this.points_awarded,
    review_status: this.review_status,
    review_reason: this.review_reason,
    created_at: this.created_at,
    review_time: this.review_time
  };
};

// 🔴 类方法 - 计算积分奖励（基于实际金额）
PhotoReview.calculatePoints = function(amount) {
  if (!amount) return 0;
  const points = Math.floor(amount * 10); // 金额×10
  return Math.max(50, Math.min(2000, points)); // 限制在50-2000之间
};

// 🔴 类方法 - 创建上传记录（v2.1.2纯人工审核版本）
PhotoReview.createUploadRecord = async function(data) {
  const {
    user_id,
    upload_id,
    image_url,
    original_filename,
    file_size,
    amount  // 🔴 用户手动输入的消费金额
  } = data;
  
  return await PhotoReview.create({
    user_id,
    upload_id,
    image_url,
    original_filename,
    file_size,
    amount,  // 🔴 用户输入金额
    actual_amount: null,  // 🔴 等待商家确认
    points_awarded: 0,    // 🔴 审核通过后才设置
    review_status: 'pending',
    created_at: new Date()
  });
};

// 🔴 类方法 - 执行人工审核（替代自动审核）
PhotoReview.performReview = async function(upload_id, action, actual_amount, reason, reviewer_id, transaction) {
  const review = await PhotoReview.findByPk(upload_id, { transaction });
  
  if (!review) {
    throw new Error('上传记录不存在');
  }
  
  if (review.review_status !== 'pending') {
    throw new Error('该记录已经审核过了');
  }
  
  // 🔴 审核通过时计算积分奖励
  let points_awarded = 0;
  if (action === 'approved') {
    const finalAmount = actual_amount || review.amount;
    points_awarded = PhotoReview.calculatePoints(finalAmount);
  }
  
  // 🔴 更新审核结果
  await review.update({
    review_status: action,
    actual_amount: actual_amount || review.amount,
    points_awarded: points_awarded,
    review_reason: reason,
    reviewer_id: reviewer_id,
    review_time: new Date()
  }, { transaction });
  
  return review;
};

// 🔴 类方法 - 获取待审核列表（商家使用）
PhotoReview.getPendingReviews = async function(options = {}) {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;
  
  const { count, rows } = await PhotoReview.findAndCountAll({
    where: { review_status: 'pending' },
    include: [
      {
        model: sequelize.model('users'),
        as: 'user',
        attributes: ['user_id', 'nickname', 'mobile']
      }
    ],
    order: [['created_at', 'ASC']], // 按提交时间排序
    limit,
    offset
  });
  
  return {
    reviews: rows.map(review => ({
      ...review.getFrontendInfo(),
      user_info: {
        user_id: review.user.user_id,
        nickname: review.user.nickname,
        mobile: review.user.getMaskedMobile()
      }
    })),
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit)
    }
  };
};

// 🔴 类方法 - 获取用户上传历史
PhotoReview.getUserHistory = async function(user_id, options = {}) {
  const { page = 1, limit = 10, status = 'all' } = options;
  const offset = (page - 1) * limit;
  
  const whereCondition = { user_id };
  if (status !== 'all') {
    whereCondition.review_status = status;
  }
  
  const { count, rows } = await PhotoReview.findAndCountAll({
    where: whereCondition,
    order: [['created_at', 'DESC']],
    limit,
    offset
  });
  
  return {
    history: rows.map(review => review.getFrontendInfo()),
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit)
    }
  };
};

module.exports = PhotoReview; 