/**
 * WebSocket实时通信服务
 * 🔴 前端对接要点：
 * - 实时库存变更推送（商品兑换页面）
 * - 积分变更推送（用户中心页面）
 * - 审核结果推送（拍照上传页面）
 * - 心跳保活机制
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.userConnections = new Map(); // user_id -> WebSocket连接
    this.connectionMeta = new Map(); // 连接元信息
  }

  // 🔴 初始化WebSocket服务器
  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws', // 🔴 添加WebSocket路径
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    
    // 心跳检查定时器
    this.startHeartbeat();
    
    console.log('🌐 WebSocket服务器启动成功 - 路径: /ws');
    console.log('🔗 WebSocket连接地址: wss://rqchrlqndora.sealosbja.site/ws');
  }

  // 🔴 验证客户端连接 - Token认证
  verifyClient(info) {
    try {
      const url = new URL(info.req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      
      if (!token) {
        console.log('WebSocket连接拒绝：缺少token');
        return false;
      }

      // 验证JWT Token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production');
      
      // 将用户信息保存到请求对象
      info.req.user = decoded;
      return true;
    } catch (error) {
      console.log('WebSocket连接拒绝：token无效', error.message);
      return false;
    }
  }

  // 🔴 处理新连接
  async handleConnection(ws, req) {
    const user = req.user;
    const userId = user.user_id;
    
    try {
      // 验证用户是否存在
      const userInfo = await User.findByPk(userId);
      if (!userInfo) {
        ws.close(1000, '用户不存在');
        return;
      }

      // 存储连接信息
      this.userConnections.set(userId, ws);
      this.connectionMeta.set(ws, {
        userId,
        nickname: userInfo.nickname,
        connectTime: new Date(),
        lastPing: new Date(),
        subscribedProducts: [] // 订阅的商品ID列表
      });

      console.log(`👤 用户 ${userId}(${userInfo.nickname}) 已连接WebSocket`);

      // 设置消息处理器
      ws.on('message', (message) => this.handleMessage(ws, message));
      
      // 设置断开连接处理器
      ws.on('close', () => this.handleDisconnection(ws));

      // 发送连接确认
      this.sendToUser(userId, {
        type: 'connected',
        data: {
          message: '连接成功',
          server_time: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('WebSocket连接处理失败:', error);
      ws.close(1011, '服务器错误');
    }
  }

  // 🔴 处理客户端消息
  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      const meta = this.connectionMeta.get(ws);
      
      if (!meta) {
        ws.close(1000, '连接信息丢失');
        return;
      }

      switch (data.type) {
        case 'ping':
          // 🔴 心跳机制 - 前端每30秒发送一次
          meta.lastPing = new Date();
          this.sendToConnection(ws, {
            type: 'pong',
            data: {
              timestamp: Date.now(),
              server_time: new Date().toISOString()
            }
          });
          break;

        case 'subscribe_products':
          // 订阅商品库存更新
          meta.subscribedProducts = data.product_ids || [];
          console.log(`用户 ${meta.userId} 订阅商品库存:`, meta.subscribedProducts);
          break;

        case 'unsubscribe_products':
          // 取消订阅
          meta.subscribedProducts = [];
          break;

        default:
          console.log('未知的WebSocket消息类型:', data.type);
      }
    } catch (error) {
      console.error('WebSocket消息处理失败:', error);
    }
  }

  // 🔴 处理连接断开
  handleDisconnection(ws) {
    const meta = this.connectionMeta.get(ws);
    if (meta) {
      console.log(`👤 用户 ${meta.userId} 已断开WebSocket连接`);
      this.userConnections.delete(meta.userId);
      this.connectionMeta.delete(ws);
    }
  }

  // 🔴 发送消息给指定用户
  sendToUser(userId, message) {
    const ws = this.userConnections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendToConnection(ws, message);
      return true;
    }
    return false;
  }

  // 发送消息给指定连接
  sendToConnection(ws, message) {
    try {
      ws.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('WebSocket消息发送失败:', error);
    }
  }

  // 🔴 广播消息给所有连接的用户
  broadcast(message) {
    this.userConnections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToConnection(ws, message);
      }
    });
  }

  // 🔴 库存变更推送 - 商品兑换页面实时更新
  notifyStockUpdate(productId, newStock, operation = 'purchase') {
    const message = {
      type: 'stock_update',
      data: {
        product_id: productId,
        stock: newStock,
        operation: operation, // purchase/restock/admin_adjust
        timestamp: new Date().toISOString()
      }
    };

    // 广播给所有连接的用户
    this.broadcast(message);
    
    console.log(`📦 库存更新推送: 商品${productId} 库存${newStock} 操作${operation}`);
  }

  // 🔴 积分变更推送 - 用户中心实时更新
  notifyPointsUpdate(userId, totalPoints, changePoints, reason) {
    const message = {
      type: 'points_update',
      data: {
        user_id: userId,
        total_points: totalPoints,
        change_points: changePoints,
        reason: reason,
        timestamp: new Date().toISOString()
      }
    };

    const sent = this.sendToUser(userId, message);
    console.log(`💰 积分更新推送: 用户${userId} 总积分${totalPoints} 变更${changePoints} 原因${reason} 发送${sent ? '成功' : '失败'}`);
  }

  // 🔴 审核结果推送 - 拍照页面状态更新
  notifyReviewResult(userId, uploadId, status, pointsAwarded, reason) {
    const message = {
      type: 'review_result',
      data: {
        upload_id: uploadId,
        status: status, // approved/rejected
        points_awarded: pointsAwarded,
        review_reason: reason,
        timestamp: new Date().toISOString()
      }
    };

    const sent = this.sendToUser(userId, message);
    console.log(`📋 审核结果推送: 用户${userId} 上传${uploadId} 状态${status} 积分${pointsAwarded} 发送${sent ? '成功' : '失败'}`);
  }

  // 🔴 系统通知推送
  notifySystemMessage(userId, title, content, type = 'info') {
    const message = {
      type: 'system_notification',
      data: {
        title,
        content,
        notification_type: type, // info/warning/error/success
        timestamp: new Date().toISOString()
      }
    };

    if (userId) {
      this.sendToUser(userId, message);
    } else {
      this.broadcast(message);
    }
  }

  // 🔴 商家通知推送 - 新的审核任务
  notifyMerchants(event, data) {
    const message = {
      type: 'merchant_notification',
      event: event, // new_review, review_update, etc.
      data: {
        ...data,
        timestamp: new Date().toISOString()
      }
    };

    // 广播给所有连接的商家用户（is_merchant = true）
    this.userConnections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        // 这里可以添加商家身份验证逻辑
        // 暂时广播给所有用户，后续可以优化为只给商家
        this.sendToConnection(ws, message);
      }
    });

    console.log(`🏪 商家通知推送: 事件${event} 数据:`, data);
  }

  // 🔴 心跳检查 - 清理僵尸连接
  startHeartbeat() {
    setInterval(() => {
      const now = new Date();
      const timeout = 120 * 1000; // 2分钟超时

      this.connectionMeta.forEach((meta, ws) => {
        if (now - meta.lastPing > timeout) {
          console.log(`🔌 清理超时连接: 用户${meta.userId}`);
          ws.terminate();
          this.handleDisconnection(ws);
        }
      });
    }, 60000); // 每分钟检查一次
  }

  // 🔴 获取连接状态统计
  getConnectionStats() {
    const totalConnections = this.userConnections.size;
    const connections = [];

    this.connectionMeta.forEach((meta, ws) => {
      connections.push({
        userId: meta.userId,
        nickname: meta.nickname,
        connectTime: meta.connectTime,
        lastPing: meta.lastPing,
        subscribedProducts: meta.subscribedProducts.length
      });
    });

    return {
      total: totalConnections,
      connections,
      timestamp: new Date().toISOString()
    };
  }

  // 关闭WebSocket服务器
  close() {
    if (this.wss) {
      this.wss.close();
      console.log('🌐 WebSocket服务器已关闭');
    }
  }
}

// 创建单例实例
const webSocketService = new WebSocketService();

module.exports = webSocketService; 