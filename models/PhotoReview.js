/**
 * 上传审核模型 - PhotoReview (对应upload_reviews表)
 * 🔴 前端对接要点：
 * - upload_id: 上传标识（前端追踪用）
 * - points_awarded: 积分奖励（审核通过时奖励）
 * - review_status: 审核状态（前端状态显示）
 * - amount: 消费金额（用户输入）
 * - estimated_amount: AI识别金额（可选）
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
  
  // 🔴 消费金额 - 前端文档要求字段名为amount
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    },
    comment: '消费金额'
  },
  
  // 🔴 AI识别金额 - 前端文档要求字段名为estimated_amount
  estimated_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'AI识别金额（可选）'
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
    estimated_amount: this.estimated_amount,
    points_awarded: this.points_awarded,
    review_status: this.review_status,
    review_reason: this.review_reason,
    created_at: this.created_at,
    review_time: this.review_time
  };
};

// 🔴 类方法 - 计算积分奖励
PhotoReview.calculatePoints = function(amount) {
  if (!amount) return 0;
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
    amount,
    estimated_amount
  } = data;
  
  const points_awarded = PhotoReview.calculatePoints(amount);
  
  return await PhotoReview.create({
    user_id,
    upload_id,
    image_url,
    amount,
    estimated_amount,
    points_awarded,
    review_status: 'pending',
    created_at: new Date()
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
    order: [['created_at', 'DESC']],
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

// 🔴 类方法 - 获取待审核列表（商家使用）
PhotoReview.getPendingReviews = async function(options = {}) {
  const {
    page = 1,
    limit = 20
  } = options;
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await PhotoReview.findAndCountAll({
    where: { review_status: 'pending' },
    include: [{
      model: User,
      as: 'user',
      attributes: ['user_id', 'mobile', 'nickname']
    }],
    order: [['created_at', 'ASC']], // 先上传的先审核
    limit: parseInt(limit),
    offset: offset
  });
  
  return {
    reviews: rows.map(review => ({
      upload_id: review.upload_id,
      user_phone: review.user ? review.user.getMaskedMobile() : '',
      image_url: review.image_url,
      amount: review.amount,
      estimated_amount: review.estimated_amount,
      expected_points: review.points_awarded,
      created_at: review.created_at,
      status: review.review_status
    })),
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(count / parseInt(limit)),
      has_more: count > (parseInt(page) * parseInt(limit))
    }
  };
};

// 🔴 类方法 - 审核操作（approve/reject）
PhotoReview.performReview = async function(uploadId, action, points, reason, reviewerId, transaction) {
  const review = await PhotoReview.findByPk(uploadId, {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  
  if (!review) {
    throw new Error('审核记录不存在');
  }
  
  if (review.review_status !== 'pending') {
    throw new Error('该记录已经审核过了');
  }
  
  // 更新审核状态
  await review.update({
    review_status: action,
    points_awarded: action === 'approved' ? parseInt(points) : 0,
    review_reason: reason,
    reviewer_id: reviewerId,
    review_time: new Date()
  }, { transaction });
  
  return review;
};

module.exports = PhotoReview; 