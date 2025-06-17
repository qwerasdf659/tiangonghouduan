/**
 * 拍照审核模型 - PhotoReview
 * 🔴 前端对接要点：
 * - upload_id: 上传标识（前端追踪用）
 * - points_awarded: 积分奖励（金额×10）
 * - review_status: 审核状态（前端状态显示）
 * - match_status: 匹配状态（前端图标显示）
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PhotoReview = sequelize.define('photo_reviews', {
  // 审核ID
  review_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '审核ID'
  },
  
  // 🔴 用户ID - 关联用户
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  
  // 🔴 上传ID - 前端追踪用
  upload_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '上传ID（前端追踪用）'
  },
  
  // 图片URL
  image_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: '图片URL（Sealos存储）'
  },
  
  // 用户输入金额
  input_amount: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false,
    validate: {
      min: 0
    },
    comment: '用户输入金额'
  },
  
  // 🔴 AI识别金额 - 前端对比显示
  recognized_amount: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'AI识别金额（前端对比显示）'
  },
  
  // 🔴 匹配状态 - 前端图标显示
  match_status: {
    type: DataTypes.ENUM('matched', 'mismatched', 'unclear'),
    allowNull: false,
    defaultValue: 'unclear',
    comment: '匹配状态（前端图标显示）'
  },
  
  // 🔴 奖励积分 - 前端显示（金额×10）
  points_awarded: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    },
    comment: '奖励积分（前端显示：金额×10）'
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
  
  // 上传时间
  upload_time: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '上传时间'
  },
  
  // 审核时间
  review_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '审核时间'
  }
}, {
  tableName: 'photo_reviews',
  timestamps: false, // 使用自定义时间字段
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
      name: 'idx_match_status',
      fields: ['match_status']
    },
    {
      name: 'idx_reviewer_id',
      fields: ['reviewer_id']
    },
    {
      name: 'idx_upload_time',
      fields: ['upload_time']
    },
    {
      name: 'idx_review_time',
      fields: ['review_time']
    },
    // 🔴 复合索引 - 前端查询优化
    {
      name: 'idx_user_upload',
      fields: ['user_id', 'upload_time']
    },
    {
      name: 'idx_status_time',
      fields: ['review_status', 'upload_time']
    }
  ]
});

// 🔴 实例方法 - 获取前端显示信息
PhotoReview.prototype.getFrontendInfo = function() {
  return {
    review_id: this.review_id,
    upload_id: this.upload_id,
    image_url: this.image_url,
    input_amount: this.input_amount,
    recognized_amount: this.recognized_amount,
    match_status: this.match_status,
    points_awarded: this.points_awarded,
    review_status: this.review_status,
    review_reason: this.review_reason,
    upload_time: this.upload_time,
    review_time: this.review_time
  };
};

// 🔴 类方法 - 计算积分奖励
PhotoReview.calculatePoints = function(amount) {
  const points = Math.floor(amount * 10); // 金额×10
  return Math.max(50, Math.min(2000, points)); // 限制在50-2000之间
};

// 🔴 类方法 - 判断匹配状态
PhotoReview.determineMatchStatus = function(inputAmount, recognizedAmount) {
  if (!recognizedAmount) {
    return 'unclear';
  }
  
  const difference = Math.abs(recognizedAmount - inputAmount);
  if (difference <= 0.5) {
    return 'matched';
  } else {
    return 'mismatched';
  }
};

// 🔴 类方法 - 创建上传记录
PhotoReview.createUploadRecord = async function(data) {
  const {
    user_id,
    upload_id,
    image_url,
    input_amount,
    recognized_amount
  } = data;
  
  const points_awarded = PhotoReview.calculatePoints(input_amount);
  const match_status = PhotoReview.determineMatchStatus(input_amount, recognized_amount);
  
  return await PhotoReview.create({
    user_id,
    upload_id,
    image_url,
    input_amount,
    recognized_amount,
    match_status,
    points_awarded,
    review_status: 'pending',
    upload_time: new Date()
  });
};

// 🔴 类方法 - 获取用户上传记录
PhotoReview.getUserRecords = async function(userId, options = {}) {
  const {
    status, // 'pending' | 'approved' | 'rejected' | 'all'
    page = 1,
    limit = 20
  } = options;
  
  const whereClause = { user_id: userId };
  
  if (status && status !== 'all') {
    whereClause.review_status = status;
  }
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await PhotoReview.findAndCountAll({
    where: whereClause,
    order: [['upload_time', 'DESC']],
    limit: parseInt(limit),
    offset: offset
  });
  
  return {
    records: rows.map(record => record.getFrontendInfo()),
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(count / parseInt(limit))
    }
  };
};

// 🔴 类方法 - 获取待审核列表（商家端）
PhotoReview.getPendingReviews = async function(options = {}) {
  const {
    page = 1,
    limit = 20
  } = options;
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await PhotoReview.findAndCountAll({
    where: { review_status: 'pending' },
    order: [['upload_time', 'ASC']], // 先上传的先审核
    limit: parseInt(limit),
    offset: offset
  });
  
  return {
    reviews: rows.map(review => review.getFrontendInfo()),
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(count / parseInt(limit))
    }
  };
};

module.exports = PhotoReview; 