/**
 * 抽奖系统API路由
 * 🔴 前端对接要点：
 * - GET /api/lottery/config - 获取转盘配置（Canvas渲染必需）
 * - POST /api/lottery/draw - 执行抽奖（支持批量抽奖）
 * - GET /api/lottery/records - 抽奖记录查询
 */

const express = require('express');
const { User, LotterySetting, PointsRecord, sequelize } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const webSocketService = require('../services/websocket');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// 🔴 前端对接点7：获取抽奖配置
router.get('/config', authenticateToken, async (req, res) => {
  try {
    // 🔴 获取转盘配置 - Canvas渲染必需
    const config = await LotterySetting.getFrontendConfig();
    
    res.json({
      code: 0,
      msg: 'success',
      data: config
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

// 🔴 前端对接点8：执行抽奖（支持批量）
router.post('/draw', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { draw_type, count } = req.body;
    const userId = req.user.user_id;
    
    // 🔴 验证抽奖次数和类型
    const drawCounts = {
      'single': 1,
      'triple': 3, 
      'quintuple': 5,
      'decade': 10
    };
    
    const actualCount = drawCounts[draw_type] || 1;
    const costPerDraw = 100; // 每次抽奖消耗100积分
    const totalCost = actualCount * costPerDraw;
    
    // 🔴 检查积分余额 - 前端需要实时显示
    const user = await User.findByPk(userId, { 
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    
    if (user.total_points < totalCost) {
      await transaction.rollback();
      return res.json({
        code: 3001,
        msg: '积分余额不足',
        data: { 
          required: totalCost, 
          current: user.total_points,
          shortage: totalCost - user.total_points
        }
      });
    }
    
    // 🔴 执行抽奖算法
    const results = [];
    const drawId = uuidv4();
    
    for (let i = 0; i < actualCount; i++) {
      const result = await LotterySetting.performDraw();
      results.push({
        ...result,
        draw_sequence: i + 1,
        draw_id: drawId
      });
    }
    
    // 🔴 扣除积分 - 原子性操作
    await user.decrement('total_points', {
      by: totalCost,
      transaction
    });
    
    const newBalance = user.total_points - totalCost;
    
    // 🔴 记录积分变动
    await PointsRecord.createRecord({
      user_id: userId,
      points: -totalCost,
      description: `${draw_type}抽奖（${actualCount}次）`,
      source: 'lottery',
      balance_after: newBalance,
      related_id: drawId
    }, transaction);
    
    // 🔴 记录抽奖历史
    for (const result of results) {
      await createLotteryRecord({
        user_id: userId,
        draw_id: drawId,
        ...result,
        draw_type,
        points_cost: costPerDraw
      }, transaction);
    }
    
    await transaction.commit();
    
    // 🔴 WebSocket推送积分变更
    webSocketService.notifyPointsUpdate(
      userId, 
      newBalance, 
      -totalCost, 
      `${draw_type}抽奖`
    );
    
    // 🔴 返回前端所需的抽奖结果格式
    res.json({
      code: 0,
      msg: 'success',
      data: {
        draw_id: drawId,
        draw_type,
        results: results.map(result => ({
          prize_id: result.prize_id,
          prize_name: result.prize_name,
          prize_type: result.prize_type,
          prize_value: result.prize_value,
          angle: result.angle, // 🔴 Canvas转盘停止角度
          is_near_miss: result.is_near_miss, // 🔴 触发差点中奖动画
          draw_sequence: result.draw_sequence
        })),
        points_cost: totalCost,
        remaining_points: newBalance
      }
    });
    
    console.log(`🎰 用户 ${userId} 执行${draw_type}抽奖，消耗${totalCost}积分，剩余${newBalance}积分`);
    
  } catch (error) {
    await transaction.rollback();
    console.error('抽奖失败:', error);
    res.json({
      code: 3000,
      msg: '抽奖失败，请稍后重试',
      data: null
    });
  }
});

// 🔴 前端对接点9：抽奖记录查询
router.get('/records', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { 
      page = 1, 
      limit = 20,
      draw_type, // 筛选抽奖类型
      prize_type // 筛选奖品类型
    } = req.query;
    
    // 构建查询条件
    const whereClause = { user_id: userId };
    
    if (draw_type) {
      whereClause.draw_type = draw_type;
    }
    
    if (prize_type) {
      whereClause.prize_type = prize_type;
    }
    
    // 分页查询抽奖记录
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await LotteryRecord.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });
    
    // 🔴 格式化前端显示数据
    const records = rows.map(record => ({
      id: record.id,
      draw_id: record.draw_id,
      prize_name: record.prize_name,
      prize_type: record.prize_type,
      prize_value: record.prize_value,
      draw_type: record.draw_type,
      points_cost: record.points_cost,
      is_near_miss: record.is_near_miss,
      created_at: record.created_at
    }));
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        records,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      }
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
    const stats = await getLotteryStatistics(userId);
    
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