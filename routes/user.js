/**
 * 用户路由 - User Routes
 * 🔴 前端对接要点：
 * - 用户信息获取和更新
 * - 积分记录查询和分页
 * - 用户统计数据
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { User, PointsRecord } = require('../models');

// 🔴 获取用户信息
// GET /api/user/info
router.get('/info', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.json({
        code: 1001,
        msg: '用户不存在',
        data: null
      });
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: user.getSafeUserInfo()
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.json({
      code: 1000,
      msg: '获取用户信息失败',
      data: null
    });
  }
});

// 🔴 更新用户信息
// PUT /api/user/info
router.put('/info', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { nickname, avatar } = req.body;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.json({
        code: 1001,
        msg: '用户不存在',
        data: null
      });
    }
    
    // 更新允许修改的字段
    const updateData = {};
    if (nickname) updateData.nickname = nickname;
    if (avatar) updateData.avatar = avatar;
    
    await user.update(updateData);
    
    res.json({
      code: 0,
      msg: 'success',
      data: user.getSafeUserInfo()
    });
  } catch (error) {
    console.error('更新用户信息失败:', error);
    res.json({
      code: 1000,
      msg: '更新用户信息失败',
      data: null
    });
  }
});

// 🔴 获取积分记录（支持分页和筛选）
// GET /api/user/points/records
router.get('/points/records', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const {
      type,  // 'earn' | 'spend' | 'all'
      source,  // 'photo_upload' | 'lottery' | 'exchange' 等
      page = 1,
      limit = 20
    } = req.query;
    
    const result = await PointsRecord.getUserRecords(userId, {
      type,
      source,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: result
    });
  } catch (error) {
    console.error('获取积分记录失败:', error);
    res.json({
      code: 1000,
      msg: '获取积分记录失败',
      data: null
    });
  }
});

// 🔴 获取积分统计
// GET /api/user/points/statistics
router.get('/points/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    // 获取用户当前积分
    const user = await User.findByPk(userId);
    if (!user) {
      return res.json({
        code: 1001,
        msg: '用户不存在',
        data: null
      });
    }
    
    // 统计积分收入和支出
    const earnRecords = await PointsRecord.findAll({
      where: { user_id: userId, type: 'earn' },
      attributes: ['points', 'source']
    });
    
    const spendRecords = await PointsRecord.findAll({
      where: { user_id: userId, type: 'spend' },
      attributes: ['points', 'source']
    });
    
    // 计算总收入和支出
    const totalEarned = earnRecords.reduce((sum, record) => sum + record.points, 0);
    const totalSpent = Math.abs(spendRecords.reduce((sum, record) => sum + record.points, 0));
    
    // 按来源统计
    const earnBySource = {};
    const spendBySource = {};
    
    earnRecords.forEach(record => {
      earnBySource[record.source] = (earnBySource[record.source] || 0) + record.points;
    });
    
    spendRecords.forEach(record => {
      spendBySource[record.source] = (spendBySource[record.source] || 0) + Math.abs(record.points);
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        current_points: user.total_points,
        total_earned: totalEarned,
        total_spent: totalSpent,
        earn_by_source: earnBySource,
        spend_by_source: spendBySource,
        records_count: {
          earn: earnRecords.length,
          spend: spendRecords.length,
          total: earnRecords.length + spendRecords.length
        }
      }
    });
  } catch (error) {
    console.error('获取积分统计失败:', error);
    res.json({
      code: 1000,
      msg: '获取积分统计失败',
      data: null
    });
  }
});

// 🔴 获取用户统计信息（为前端兼容性添加）
// GET /api/user/statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    // 获取用户基本信息
    const user = await User.findByPk(userId);
    if (!user) {
      return res.json({
        code: 1001,
        msg: '用户不存在',
        data: null
      });
    }
    
    // 统计积分收入和支出
    const earnRecords = await PointsRecord.findAll({
      where: { user_id: userId, type: 'earn' },
      attributes: ['points', 'source']
    });
    
    const spendRecords = await PointsRecord.findAll({
      where: { user_id: userId, type: 'spend' },
      attributes: ['points', 'source']
    });
    
    // 计算总收入和支出
    const totalEarned = earnRecords.reduce((sum, record) => sum + record.points, 0);
    const totalSpent = Math.abs(spendRecords.reduce((sum, record) => sum + record.points, 0));
    
    // 按来源统计
    const earnBySource = {};
    const spendBySource = {};
    
    earnRecords.forEach(record => {
      earnBySource[record.source] = (earnBySource[record.source] || 0) + record.points;
    });
    
    spendRecords.forEach(record => {
      spendBySource[record.source] = (spendBySource[record.source] || 0) + Math.abs(record.points);
    });
    
    // 计算用户活跃天数
    const registrationDays = Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24));
    
    // 统计今日活动
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayRecords = await PointsRecord.count({
      where: {
        user_id: userId,
        created_at: {
          [require('sequelize').Op.gte]: today
        }
      }
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        // 用户基本信息
        user_info: {
          user_id: user.user_id,
          nickname: user.nickname,
          avatar: user.avatar,
          status: user.status,
          // is_merchant字段已移除，权限简化为用户/管理员
          registration_days: registrationDays,
          last_login: user.last_login
        },
        // 积分统计
        points_statistics: {
          current_points: user.total_points,
          total_earned: totalEarned,
          total_spent: totalSpent,
          earn_by_source: earnBySource,
          spend_by_source: spendBySource
        },
        // 活动统计
        activity_statistics: {
          today_activities: todayRecords,
          total_records: earnRecords.length + spendRecords.length,
          earn_records_count: earnRecords.length,
          spend_records_count: spendRecords.length
        }
      }
    });
  } catch (error) {
    console.error('获取用户统计失败:', error);
    res.json({
      code: 1000,
      msg: '获取用户统计失败',
      data: null
    });
  }
});

// 🔴 检查用户状态
// GET /api/user/status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.json({
        code: 1001,
        msg: '用户不存在',
        data: null
      });
    }
    
    // 检查用户今日活动
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayRecords = await PointsRecord.count({
      where: {
        user_id: userId,
        created_at: {
          [require('sequelize').Op.gte]: today
        }
      }
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        user_id: user.user_id,
        status: user.status,
        // is_merchant字段已移除，权限简化为用户/管理员
        total_points: user.total_points,
        today_activities: todayRecords,
        registration_days: Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)),
        last_login: user.last_login
      }
    });
  } catch (error) {
    console.error('获取用户状态失败:', error);
    res.json({
      code: 1000,
      msg: '获取用户状态失败',
      data: null
    });
  }
});

module.exports = router; 