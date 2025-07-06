/**
 * 抽奖系统API路由
 * 🔴 前端对接要点：
 * - GET /api/lottery/config - 获取转盘配置（Canvas渲染必需）
 * - POST /api/lottery/draw - 执行抽奖（支持批量抽奖）
 * - GET /api/lottery/records - 抽奖记录查询
 */

const express = require('express');
const { User, LotterySetting, PointsRecord, LotteryPity, LotteryRecord, sequelize } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const LotteryService = require('../services/lotteryService');
const webSocketService = require('../services/websocket');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// 🔴 前端对接点7：获取抽奖配置
router.get('/config', authenticateToken, async (req, res) => {
  try {
    // 🔴 获取转盘配置 - Canvas渲染必需
    const config = await LotteryService.getFrontendConfig();
    
    // 🔴 获取用户保底信息
    const pityInfo = await LotteryPity.getUserPityInfo(req.user.user_id);
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        ...config,
        user_pity: pityInfo
      }
    });
    
  } catch (error) {
    console.error('获取抽奖配置失败:', error);
    res.json({
      code: 3000,
      msg: '获取配置失败',
      data: null
    });
  }
});

// 🔴 前端对接点8：执行抽奖（含保底机制）
router.post('/draw', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { draw_type = 'single' } = req.body;
    const userId = req.user.user_id;
    
    // 🔴 验证抽奖类型 - 支持前端传入的各种格式
    const drawCounts = {
      'single': 1,
      'triple': 3, 
      'quintuple': 5,
      'five': 5,        // 🔴 新增：支持前端传入"five"
      'decade': 10,
      'ten': 10         // 🔴 新增：支持前端传入"ten"
    };
    
    const actualCount = drawCounts[draw_type] || 1;
    
    // 🔴 检查今日抽奖次数限制（批量抽奖整体检查）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayDrawCount = await PointsRecord.count({
      where: {
        user_id: userId,
        source: 'lottery',
        type: 'spend',
        created_at: {
          [require('sequelize').Op.gte]: today
        }
      },
      transaction
    });
    
    const dailyLimit = parseInt(process.env.DAILY_LOTTERY_LIMIT) || 50;
    console.log('🎯 每日限制检查:', { todayDrawCount, actualCount, dailyLimit, willExceed: todayDrawCount + actualCount > dailyLimit });
    if (todayDrawCount + actualCount > dailyLimit) {
      throw new Error(`今日抽奖次数不足，已抽${todayDrawCount}次，再抽${actualCount}次将超过限制${dailyLimit}次`);
    }
    
    // 🔴 修复积分扣除逻辑：在开始抽奖前一次性扣除所有积分
    const costPoints = parseInt(process.env.LOTTERY_COST_POINTS) || 100;
    const totalCost = actualCount * costPoints;
    
    // 🔴 获取用户信息并检查积分是否足够
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      throw new Error('用户不存在');
    }
    
    if (user.total_points < totalCost) {
      throw new Error(`积分不足，需要 ${totalCost} 积分，当前只有 ${user.total_points} 积分`);
    }
    
    // 🔴 一次性扣除所有抽奖积分
    await User.decrement('total_points', {
      by: totalCost,
      where: { user_id: userId },
      transaction
    });
    
    // 🔴 记录积分扣除
    const userAfterDeduct = await User.findByPk(userId, { transaction });
    await PointsRecord.createRecord({
      user_id: userId,
      points: -totalCost,
      description: `${draw_type}抽奖消费 - ${actualCount}次`,
      source: 'lottery',
      balance_after: userAfterDeduct.total_points,
      related_id: draw_type
    }, transaction);
    
    // 🔴 执行抽奖（不再扣除积分，只执行抽奖算法）
    const results = [];
    
    for (let i = 0; i < actualCount; i++) {
      const result = await LotteryService.performDrawWithoutCost(userId, 'points', transaction, i + 1);
      
      // 🔴 确保每个结果都包含draw_sequence
      const resultWithSequence = {
        ...result,
        draw_sequence: i + 1  // 从1开始的序号
      };
      
      results.push(resultWithSequence);
    }
    
    await transaction.commit();
    
    // 🔴 构建完整的抽奖结果数组，确保draw_sequence字段存在
    const formattedResults = results.map((result, index) => ({
      prize: result.prize,
      pity: result.pity,
      reward: result.reward,
      draw_sequence: result.draw_sequence || (index + 1)  // 🔴 确保draw_sequence存在
    }));
    
    // 🔴 获取最后一次抽奖的用户信息
    const lastResult = results[results.length - 1];
    
    // 🔴 返回前端所需的抽奖结果格式
    res.json({
      code: 0,
      msg: 'success',
      data: {
        draw_type,
        results: formattedResults,          // 🔴 确保draw_sequence在每个结果中
        total_cost: totalCost,              // 🔴 修复：返回正确的总消费
        user_info: {
          remaining_points: lastResult?.user?.remainingPoints || 0,  // 🔴 修复路径
          total_points: lastResult?.user?.remainingPoints || 0,      // 🔴 增加兼容字段
          today_draw_count: lastResult?.user?.todayDrawCount || 0,
          remaining_draws: lastResult?.user?.remainingDraws || 0,
          pity_info: lastResult?.pity || {}
        }
      }
    });
    
    console.log(`🎰 用户 ${userId} 执行${draw_type}抽奖，共${actualCount}次，消费${totalCost}积分，剩余积分: ${lastResult?.user?.remainingPoints || 0}`);
    
  } catch (error) {
    await transaction.rollback();
    console.error('抽奖失败:', error);
    res.json({
      code: 3000,
      msg: error.message || '抽奖失败，请稍后重试',
      data: null
    });
  }
});

// 🔴 前端对接点9：抽奖记录查询 - 使用新的LotteryRecord表
router.get('/records', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { 
      page = 1, 
      limit = 20,
      draw_type // 筛选抽奖类型
    } = req.query;
    
    // 🔴 使用新的LotteryRecord表查询抽奖记录
    const result = await LotteryRecord.getUserRecords(userId, {
      draw_type,
      page,
      limit
    });
    
    res.json({
      code: 0,
      msg: 'success',
      data: result
    });
    
  } catch (error) {
    console.error('获取抽奖记录失败:', error);
    res.json({
      code: 3000,
      msg: '获取记录失败',
      data: null
    });
  }
});

// 🔴 抽奖统计接口 - 前端数据展示
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    // 获取用户抽奖统计
    const stats = await LotteryService.getUserLotteryStats(userId);
    
    res.json({
      code: 0,
      msg: 'success',
      data: stats
    });
    
  } catch (error) {
    console.error('获取抽奖统计失败:', error);
    res.json({
      code: 3000,
      msg: '获取统计失败',
      data: null
    });
  }
});

// 🔴 新增：用户抽奖历史详情API
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { limit = 20 } = req.query;
    
    // 获取用户抽奖历史
    const history = await LotteryRecord.getUserHistory(userId, parseInt(limit));
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        history: history.map(record => record.getFrontendInfo()),
        total: history.length
      }
    });
    
  } catch (error) {
    console.error('获取抽奖历史失败:', error);
    res.json({
      code: 3000,
      msg: '获取历史失败',
      data: null
    });
  }
});

// 🔴 创建抽奖记录（内部函数）
async function createLotteryRecord(data, transaction) {
  // 这里需要创建 LotteryRecord 模型
  // 暂时使用积分记录表记录
  return await PointsRecord.createRecord({
    user_id: data.user_id,
    points: -data.points_cost,
    description: `抽中：${data.prize_name}`,
    source: 'lottery',
    balance_after: data.balance_after || 0,
    related_id: data.draw_id
  }, transaction);
}

// 🔴 获取抽奖统计数据
async function getLotteryStatistics(userId) {
  try {
    // 查询用户抽奖相关的积分记录
    const lotteryRecords = await PointsRecord.findAll({
      where: {
        user_id: userId,
        source: 'lottery'
      }
    });
    
    // 统计数据
    const totalDraws = lotteryRecords.length;
    const totalCost = lotteryRecords.reduce((sum, record) => sum + Math.abs(record.points), 0);
    
    // 按抽奖类型统计
    const drawTypeStats = {};
    lotteryRecords.forEach(record => {
      const type = record.description.includes('single') ? 'single' :
                   record.description.includes('triple') ? 'triple' :
                   record.description.includes('quintuple') ? 'quintuple' :
                   record.description.includes('decade') ? 'decade' : 'other';
      
      if (!drawTypeStats[type]) {
        drawTypeStats[type] = { count: 0, cost: 0 };
      }
      drawTypeStats[type].count++;
      drawTypeStats[type].cost += Math.abs(record.points);
    });
    
    return {
      total_draws: totalDraws,
      total_cost: totalCost,
      draw_type_stats: drawTypeStats,
      last_draw_time: lotteryRecords[0]?.created_at || null
    };
    
  } catch (error) {
    console.error('获取抽奖统计失败:', error);
    return {
      total_draws: 0,
      total_cost: 0,
      draw_type_stats: {},
      last_draw_time: null
    };
  }
}

module.exports = router; 