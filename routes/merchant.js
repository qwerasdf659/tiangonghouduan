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
const { User, LotteryRecord, LotterySetting, ExchangeOrder, PointsRecord } = require('../models');
const { requireSuperAdmin, requireMerchant, authenticateToken } = require('../middleware/auth');
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
router.get('/pending-reviews', requireSuperAdmin, async (req, res) => {
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
router.post('/review', requireSuperAdmin, async (req, res) => {
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
router.post('/batch-review', requireSuperAdmin, async (req, res) => {
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
router.get('/statistics', requireSuperAdmin, async (req, res) => {
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
router.get('/lottery/config', requireSuperAdmin, async (req, res) => {
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
router.get('/lottery/stats', requireSuperAdmin, async (req, res) => {
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

module.exports = router; 