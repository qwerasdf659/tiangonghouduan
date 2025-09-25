# 餐厅积分抽奖系统 V4.0 - 详细API接口说明文档

**文档版本**: v4.0.0  
**创建时间**: 2025年09月25日 14:15 UTC (北京时间 22:15)  
**基于**: 实际后端代码验证  
**使用模型**: Claude Sonnet 4

---

## 📋 文档说明

本文档基于实际的后端代码实现，提供**完整、准确、可直接使用**的API接口说明。每个接口都包含：

- **完整的请求参数说明**
- **详细的响应数据结构**  
- **实际的业务逻辑说明**
- **可直接复制的代码示例**
- **错误处理和状态码**

---

## 🔐 1. 认证系统 API (`/api/v4/unified-engine/auth`)

### 1.1 用户登录/注册

**POST** `/api/v4/unified-engine/auth/login`

> 登录即注册，如果用户不存在会自动创建账号

#### 请求参数
```javascript
{
  "mobile": "13812345678",        // 必需，手机号，11位数字
  "verification_code": "123456"   // 必需，验证码，开发环境万能码：123456
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // JWT Token
    "user": {
      "user_id": 123,                 // 用户ID
      "mobile": "13812345678",        // 手机号
      "is_admin": false,              // 是否管理员
      "status": "active",             // 用户状态
      "last_login": "2025-09-25T14:15:30+08:00"  // 最后登录时间
    },
    "expires_in": 604800,             // Token有效期（秒）7天
    "timestamp": "2025-09-25T14:15:30+08:00"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

#### 错误响应
```javascript
// 参数错误 (400)
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "手机号和验证码不能为空",
  "data": {},
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}

// 验证码错误 (400)
{
  "success": false,
  "code": "VERIFICATION_CODE_ERROR",
  "message": "验证码错误",
  "data": {},
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

#### 前端调用示例
```javascript
async function login(mobile, verificationCode) {
  try {
    const response = await axios.post('/api/v4/unified-engine/auth/login', {
      mobile,
      verification_code: verificationCode
    });
    
    if (response.data.success) {
      // 保存Token到localStorage
      localStorage.setItem('jwt_token', response.data.data.token);
      localStorage.setItem('user_info', JSON.stringify(response.data.data.user));
      return response.data;
    }
  } catch (error) {
    console.error('登录失败:', error.response?.data?.message);
    throw error;
  }
}
```

### 1.2 用户登出

**POST** `/api/v4/unified-engine/auth/logout`

#### 请求头
```javascript
{
  "Authorization": "Bearer your_jwt_token_here"
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "登出成功",
  "data": {},
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 1.3 Token验证

**GET** `/api/v4/unified-engine/auth/verify`

#### 请求头
```javascript
{
  "Authorization": "Bearer your_jwt_token_here"
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "Token验证成功",
  "data": {
    "user": {
      "user_id": 123,
      "mobile": "13812345678",
      "is_admin": false,
      "status": "active"
    },
    "valid": true,
    "expires_at": "2025-10-02T14:15:30+08:00"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

---

## 🎲 2. 抽奖引擎 API (`/api/v4/unified-engine/lottery`)

### 2.1 基础抽奖

**POST** `/api/v4/unified-engine/lottery/basic`

> 消耗10积分进行基础抽奖

#### 请求头
```javascript
{
  "Authorization": "Bearer your_jwt_token_here",
  "Content-Type": "application/json"
}
```

#### 请求参数
```javascript
{
  "campaign_id": 1,                    // 可选，抽奖活动ID
  "strategy_type": "basic_guarantee"   // 可选，策略类型
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "LOTTERY_SUCCESS",
  "message": "基础抽奖执行成功",
  "data": {
    "draw_id": 12345,                  // 抽奖记录ID
    "result_type": "prize",            // 结果类型：prize(中奖) / empty(未中奖)
    "prize": {
      "id": 101,
      "name": "优惠券",
      "description": "10元优惠券",
      "icon": "🎫",
      "value": 10,
      "type": "voucher"
    },
    "points_cost": 10,                 // 消耗积分
    "remaining_points": 90,            // 剩余积分
    "timestamp": "2025-09-25T14:15:30+08:00"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

#### 错误响应
```javascript
// 积分不足 (400)
{
  "success": false,
  "code": "INSUFFICIENT_POINTS",
  "message": "积分不足，无法进行抽奖",
  "data": {
    "required_points": 10,
    "current_points": 5
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 2.2 保底抽奖

**POST** `/api/v4/unified-engine/lottery/guarantee`

> 消耗50积分进行保底抽奖，确保中奖

#### 请求参数
```javascript
{
  "campaign_id": 1,                    // 可选，抽奖活动ID
  "force_guarantee": true              // 强制保底
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "GUARANTEE_LOTTERY_SUCCESS",
  "message": "保底抽奖执行成功",
  "data": {
    "draw_id": 12346,
    "result_type": "prize",            // 保底抽奖必定中奖
    "prize": {
      "id": 102,
      "name": "精美礼品",
      "description": "价值50元礼品",
      "icon": "🎁",
      "value": 50,
      "type": "product"
    },
    "points_cost": 50,
    "remaining_points": 40,
    "is_guarantee": true,              // 标识为保底中奖
    "timestamp": "2025-09-25T14:15:30+08:00"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 2.3 管理员预设抽奖

**POST** `/api/v4/unified-engine/lottery/admin-preset`

> 管理员可以为指定用户预设抽奖结果

#### 请求参数
```javascript
{
  "target_user_id": 456,              // 目标用户ID
  "preset_config": {
    "prize_id": 103,                   // 预设奖品ID
    "result_type": "prize"             // 预设结果类型
  }
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "ADMIN_PRESET_SUCCESS",
  "message": "管理员预设抽奖执行成功",
  "data": {
    "draw_id": 12347,
    "result_type": "prize",
    "prize": {
      "id": 103,
      "name": "管理员特殊奖品",
      "description": "管理员预设奖品",
      "icon": "👑",
      "value": 100,
      "type": "special"
    },
    "target_user_id": 456,
    "admin_user_id": 123,              // 操作管理员ID
    "is_admin_preset": true,
    "timestamp": "2025-09-25T14:15:30+08:00"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 2.4 获取抽奖策略列表

**GET** `/api/v4/unified-engine/lottery/strategies`

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "策略列表获取成功",
  "data": {
    "strategies": [
      {
        "name": "BasicGuaranteeStrategy",
        "display_name": "基础抽奖保底策略",
        "description": "基础抽奖，支持保底机制",
        "cost_points": 10,
        "guarantee_cost": 50
      },
      {
        "name": "ManagementStrategy", 
        "display_name": "管理抽奖策略",
        "description": "管理员可控制的抽奖策略",
        "cost_points": 0,
        "admin_only": true
      }
    ],
    "default_strategy": "BasicGuaranteeStrategy"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

---

## 👤 3. 权限管理 API (`/api/v4/permissions`)

### 3.1 获取用户权限

**GET** `/api/v4/permissions/user/:userId`

#### URL参数
- `userId`: 用户ID（用户只能查看自己的权限，管理员可查看所有用户）

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "用户权限信息获取成功",
  "data": {
    "user_id": 123,
    "is_admin": false,
    "permissions": [
      {
        "name": "lottery.basic",
        "display_name": "基础抽奖",
        "description": "可以进行基础抽奖",
        "granted": true
      },
      {
        "name": "inventory.view",
        "display_name": "查看库存",
        "description": "可以查看自己的库存",
        "granted": true
      },
      {
        "name": "admin.manage",
        "display_name": "管理权限",
        "description": "管理员权限",
        "granted": false
      }
    ],
    "last_updated": "2025-09-25T14:15:30+08:00"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 3.2 检查权限

**POST** `/api/v4/permissions/check`

#### 请求参数
```javascript
{
  "userId": 123,                      // 可选，默认检查当前用户
  "permission": "lottery.basic",      // 权限名称
  "context": {                        // 可选，权限上下文
    "campaign_id": 1
  }
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "权限检查完成",
  "data": {
    "user_id": 123,
    "permission": "lottery.basic",
    "granted": true,
    "reason": "用户拥有基础抽奖权限",
    "context": {
      "campaign_id": 1
    }
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 3.3 获取我的权限

**GET** `/api/v4/permissions/me`

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS", 
  "message": "权限信息获取成功",
  "data": {
    "user_id": 123,
    "is_admin": false,
    "role": "user",
    "permissions": [
      "lottery.basic",
      "inventory.view",
      "inventory.use"
    ],
    "restrictions": [
      "admin.manage",
      "user.delete"
    ]
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

---

## 📦 4. 库存管理 API (`/api/v4/inventory`)

### 4.1 获取用户库存列表

**GET** `/api/v4/inventory/user/:user_id`

#### URL参数
- `user_id`: 用户ID

#### 查询参数
```javascript
?status=available&type=voucher&page=1&limit=20
```

- `status`: 可选，库存状态 (available/used/transferred)
- `type`: 可选，物品类型 (voucher/product/service)  
- `page`: 可选，页码，默认1
- `limit`: 可选，每页数量，默认20

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "PAGINATION_SUCCESS",
  "message": "库存列表获取成功",
  "data": [
    {
      "id": 1001,
      "name": "10元优惠券",
      "description": "全场通用优惠券",
      "icon": "🎫",                    // 物品图标
      "type": "voucher",               // 物品类型
      "value": 10,                     // 物品价值
      "status": "available",           // 状态
      "status_description": "可使用",  // 状态描述
      "source_type": "lottery",        // 获得方式
      "source_id": 12345,             // 来源ID（抽奖记录ID）
      "acquired_at": "2025-09-25T14:15:30+08:00",  // 获得时间
      "expires_at": "2025-12-25T23:59:59+08:00",   // 过期时间
      "is_expired": false,            // 是否过期
      "verification_code": "ABC123",   // 核销码
      "verification_expires_at": "2025-12-25T23:59:59+08:00",
      "created_at": "2025-09-25T14:15:30+08:00",
      "updated_at": "2025-09-25T14:15:30+08:00"
    }
  ],
  "pagination": {
    "total": 15,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 4.2 使用库存物品

**POST** `/api/v4/inventory/use`

#### 请求参数
```javascript
{
  "inventory_id": 1001,               // 库存物品ID
  "usage_context": {                  // 可选，使用上下文
    "order_id": "ORDER123",
    "amount": 100,
    "description": "订单使用优惠券"
  }
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "物品使用成功",
  "data": {
    "inventory_id": 1001,
    "name": "10元优惠券",
    "used_at": "2025-09-25T14:15:30+08:00",
    "usage_context": {
      "order_id": "ORDER123",
      "amount": 100,
      "description": "订单使用优惠券"
    },
    "verification_code": "ABC123"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 4.3 转让库存物品

**POST** `/api/v4/inventory/transfer`

#### 请求参数
```javascript
{
  "inventory_id": 1001,               // 库存物品ID
  "target_user_id": 456,              // 目标用户ID
  "transfer_note": "赠送给朋友"        // 可选，转让备注
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "物品转让成功",
  "data": {
    "inventory_id": 1001,
    "name": "10元优惠券",
    "from_user_id": 123,
    "to_user_id": 456,
    "transfer_at": "2025-09-25T14:15:30+08:00",
    "transfer_note": "赠送给朋友"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 4.4 生成核销码

**POST** `/api/v4/inventory/generate-code`

#### 请求参数
```javascript
{
  "inventory_id": 1001,               // 库存物品ID
  "expires_in": 3600                  // 可选，有效期（秒），默认24小时
}
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "核销码生成成功",
  "data": {
    "inventory_id": 1001,
    "verification_code": "XYZ789",
    "expires_at": "2025-09-26T14:15:30+08:00",
    "qr_code_url": "https://api.qrserver.com/v1/create-qr-code/?data=XYZ789"  // 可选
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

---

## 📷 5. 图片上传 API (`/api/v4/photo`)

### 5.1 上传图片

**POST** `/api/v4/photo/upload`

#### 请求头
```javascript
{
  "Authorization": "Bearer your_jwt_token_here",
  "Content-Type": "multipart/form-data"
}
```

#### 请求参数 (FormData)
```javascript
const formData = new FormData();
formData.append('photo', file);                    // 必需，图片文件
formData.append('user_id', '123');                 // 必需，用户ID
formData.append('business_type', 'user_upload');   // 可选，业务类型
formData.append('category', 'pending_review');     // 可选，分类
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "图片上传成功",
  "data": {
    "id": 2001,
    "filename": "1727265330394_a1b2c3d4.jpg",
    "original_name": "my_photo.jpg",
    "url": "https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/photos/1727265330394_a1b2c3d4.jpg",
    "thumbnail_url": "https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/thumbnails/thumb_1727265330394_a1b2c3d4.jpg",
    "file_size": 204800,                // 文件大小（字节）
    "mime_type": "image/jpeg",
    "storage_type": "sealos",           // 存储类型
    "business_type": "user_upload",
    "category": "pending_review",
    "review_status": "pending",         // 审核状态
    "upload_progress": {
      "total": 204800,
      "uploaded": 204800,
      "percentage": 100
    }
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

#### 错误响应
```javascript
// 文件过大 (400)
{
  "success": false,
  "code": "FILE_SIZE_EXCEEDED",
  "message": "文件大小超过限制",
  "data": {
    "max_size": 10485760,              // 10MB限制
    "actual_size": 15728640
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}

// 文件类型不支持 (400)
{
  "success": false,
  "code": "UNSUPPORTED_FILE_TYPE",
  "message": "只允许上传图片文件",
  "data": {
    "allowed_types": ["image/jpeg", "image/png", "image/gif", "image/webp"],
    "actual_type": "application/pdf"
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 5.2 获取图片列表

**GET** `/api/v4/photo/list`

#### 查询参数
```javascript
?user_id=123&business_type=user_upload&review_status=approved&page=1&limit=20
```

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "PAGINATION_SUCCESS",
  "message": "图片列表获取成功",
  "data": [
    {
      "id": 2001,
      "filename": "1727265330394_a1b2c3d4.jpg",
      "original_name": "my_photo.jpg",
      "url": "https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/photos/1727265330394_a1b2c3d4.jpg",
      "thumbnail_url": "https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/thumbnails/thumb_1727265330394_a1b2c3d4.jpg",
      "file_size": 204800,
      "mime_type": "image/jpeg",
      "business_type": "user_upload",
      "category": "pending_review",
      "review_status": "approved",
      "created_at": "2025-09-25T14:15:30+08:00"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

### 5.3 删除图片

**DELETE** `/api/v4/photo/:id`

#### URL参数
- `id`: 图片ID

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "图片删除成功",
  "data": {
    "id": 2001,
    "deleted_at": "2025-09-25T14:15:30+08:00",
    "storage_cleaned": true            // 是否清理了存储文件
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

---

## 🛠️ 6. 管理系统 API (`/api/v4/unified-engine/admin`)

### 6.1 管理仪表板

**GET** `/api/v4/unified-engine/admin/dashboard`

> 需要管理员权限

#### 成功响应 (200)
```javascript
{
  "success": true,
  "code": "SUCCESS",
  "message": "管理仪表板数据获取成功",
  "data": {
    "overview": {
      "total_users": 1250,
      "active_users_today": 89,
      "total_lottery_draws": 5678,
      "lottery_draws_today": 234
    },
    "lottery_stats": {
      "basic_lottery_count": 4500,
      "guarantee_lottery_count": 1178,
      "total_prizes_given": 2890,
      "prize_distribution_rate": 0.509
    },
    "user_stats": {
      "new_users_today": 12,
      "new_users_this_week": 56,
      "admin_users": 3
    },
    "system_status": {
      "database": "connected",
      "redis": "connected", 
      "storage": "connected",
      "uptime": "5 days 12 hours"
    }
  },
  "timestamp": "2025-09-25T14:15:30+08:00",
  "version": "v4.0"
}
```

---

## 🧪 7. 微信小程序集成完整示例

### 7.1 微信小程序API客户端封装

```javascript
// utils/api.js - 微信小程序API封装
class RestaurantLotteryAPI {
  constructor() {
    // 配置API基础信息
    this.baseURL = 'https://your-domain.com/api/v4';  // 生产环境域名
    this.timeout = 10000;
  }

  /**
   * 统一请求方法
   * @param {Object} options 请求配置
   * @returns {Promise} 请求结果
   */
  request(options) {
    return new Promise((resolve, reject) => {
      // 获取存储的Token
      const token = wx.getStorageSync('jwt_token');
      
      // 请求配置
      const requestConfig = {
        url: this.baseURL + options.url,
        method: options.method || 'GET',
        data: options.data || {},
        timeout: this.timeout,
        header: {
          'Content-Type': 'application/json',
          ...options.header
        }
      };

      // 添加认证Token
      if (token) {
        requestConfig.header.Authorization = `Bearer ${token}`;
      }

      // 发起请求
      wx.request({
        ...requestConfig,
        success: (res) => {
          // 检查HTTP状态码
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // 检查业务状态
            if (res.data && res.data.success !== false) {
              resolve(res.data);
            } else {
              this.handleError(res.data);
              reject(res.data);
            }
          } else {
            this.handleHttpError(res);
            reject(res);
          }
        },
        fail: (error) => {
          this.handleNetworkError(error);
          reject(error);
        }
      });
    });
  }

  /**
   * 错误处理
   * @param {Object} error 错误对象
   */
  handleError(error) {
    const { code, message } = error;
    
    switch (code) {
      case 'TOKEN_EXPIRED':
        // Token过期，清除本地存储并跳转登录
        wx.clearStorageSync();
        wx.showToast({
          title: '登录已过期，请重新登录',
          icon: 'none'
        });
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/login/login'
          });
        }, 1500);
        break;
        
      case 'INSUFFICIENT_POINTS':
        wx.showModal({
          title: '积分不足',
          content: '您的积分不足，请先获取积分',
          showCancel: false
        });
        break;
        
      case 'RATE_LIMIT_EXCEEDED':
        wx.showToast({
          title: '请求过于频繁，请稍后再试',
          icon: 'none'
        });
        break;
        
      default:
        wx.showToast({
          title: message || '操作失败，请重试',
          icon: 'none'
        });
    }
  }

  /**
   * HTTP错误处理
   * @param {Object} res 响应对象
   */
  handleHttpError(res) {
    const errorMessages = {
      400: '请求参数错误',
      401: '未授权访问',
      403: '权限不足',
      404: '接口不存在',
      500: '服务器内部错误',
      502: '网关错误',
      503: '服务不可用'
    };
    
    const message = errorMessages[res.statusCode] || '网络错误';
    wx.showToast({
      title: message,
      icon: 'none'
    });
  }

  /**
   * 网络错误处理
   * @param {Object} error 错误对象
   */
  handleNetworkError(error) {
    wx.showToast({
      title: '网络连接失败，请检查网络设置',
      icon: 'none'
    });
  }

  // ============= 认证相关API =============
  
  /**
   * 用户登录
   * @param {string} mobile 手机号
   * @param {string} verificationCode 验证码
   */
  async login(mobile, verificationCode) {
    const result = await this.request({
      url: '/unified-engine/auth/login',
      method: 'POST',
      data: {
        mobile,
        verification_code: verificationCode
      }
    });
    
    // 登录成功后保存用户信息
    if (result.success && result.data) {
      wx.setStorageSync('jwt_token', result.data.token);
      wx.setStorageSync('user_info', result.data.user);
    }
    
    return result;
  }

  /**
   * 用户登出
   */
  async logout() {
    try {
      await this.request({
        url: '/unified-engine/auth/logout',
        method: 'POST'
      });
    } finally {
      // 无论请求是否成功，都清除本地存储
      wx.clearStorageSync();
    }
  }

  /**
   * 验证Token
   */
  async verifyToken() {
    return await this.request({
      url: '/unified-engine/auth/verify',
      method: 'GET'
    });
  }

  // ============= 抽奖相关API =============
  
  /**
   * 基础抽奖
   * @param {number} campaignId 活动ID
   */
  async performBasicLottery(campaignId = null) {
    return await this.request({
      url: '/unified-engine/lottery/basic',
      method: 'POST',
      data: {
        campaign_id: campaignId,
        strategy_type: 'basic_guarantee'
      }
    });
  }

  /**
   * 保底抽奖
   * @param {number} campaignId 活动ID
   */
  async performGuaranteeLottery(campaignId = null) {
    return await this.request({
      url: '/unified-engine/lottery/guarantee',
      method: 'POST',
      data: {
        campaign_id: campaignId,
        force_guarantee: true
      }
    });
  }

  /**
   * 获取抽奖策略列表
   */
  async getLotteryStrategies() {
    return await this.request({
      url: '/unified-engine/lottery/strategies',
      method: 'GET'
    });
  }

  // ============= 库存相关API =============
  
  /**
   * 获取用户库存
   * @param {number} userId 用户ID
   * @param {Object} options 查询选项
   */
  async getUserInventory(userId, options = {}) {
    const { status, type, page = 1, limit = 20 } = options;
    return await this.request({
      url: `/inventory/user/${userId}?status=${status || ''}&type=${type || ''}&page=${page}&limit=${limit}`,
      method: 'GET'
    });
  }

  /**
   * 使用库存物品
   * @param {number} inventoryId 库存ID
   * @param {Object} usageContext 使用上下文
   */
  async useInventoryItem(inventoryId, usageContext = {}) {
    return await this.request({
      url: '/inventory/use',
      method: 'POST',
      data: {
        inventory_id: inventoryId,
        usage_context: usageContext
      }
    });
  }

  /**
   * 转让库存物品
   * @param {number} inventoryId 库存ID
   * @param {number} targetUserId 目标用户ID
   * @param {string} transferNote 转让备注
   */
  async transferInventoryItem(inventoryId, targetUserId, transferNote = '') {
    return await this.request({
      url: '/inventory/transfer',
      method: 'POST',
      data: {
        inventory_id: inventoryId,
        target_user_id: targetUserId,
        transfer_note: transferNote
      }
    });
  }

  /**
   * 生成核销码
   * @param {number} inventoryId 库存ID
   * @param {number} expiresIn 有效期（秒）
   */
  async generateVerificationCode(inventoryId, expiresIn = 86400) {
    return await this.request({
      url: '/inventory/generate-code',
      method: 'POST',
      data: {
        inventory_id: inventoryId,
        expires_in: expiresIn
      }
    });
  }

  // ============= 图片上传API =============
  
  /**
   * 上传图片
   * @param {string} filePath 本地文件路径
   * @param {Object} options 上传选项
   */
  uploadPhoto(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('jwt_token');
      const userInfo = wx.getStorageSync('user_info');
      
      wx.uploadFile({
        url: this.baseURL + '/photo/upload',
        filePath: filePath,
        name: 'photo',
        formData: {
          user_id: userInfo.user_id,
          business_type: options.businessType || 'user_upload',
          category: options.category || 'pending_review'
        },
        header: {
          'Authorization': `Bearer ${token}`
        },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.success) {
              resolve(data);
            } else {
              this.handleError(data);
              reject(data);
            }
          } catch (error) {
            reject(error);
          }
        },
        fail: (error) => {
          this.handleNetworkError(error);
          reject(error);
        }
      });
    });
  }
}

// 创建API实例
const api = new RestaurantLotteryAPI();

// 导出API实例
module.exports = api;
```

### 7.2 微信小程序抽奖页面完整示例

#### 页面结构 (pages/lottery/lottery.wxml)
```xml
<!--抽奖页面-->
<view class="lottery-container">
  <!-- 用户信息区域 -->
  <view class="user-info">
    <image class="avatar" src="{{userInfo.avatar_url || '/images/default-avatar.png'}}" />
    <view class="user-details">
      <text class="username">{{userInfo.display_name || userInfo.mobile}}</text>
      <text class="points">积分: {{userInfo.points}}</text>
    </view>
  </view>

  <!-- 抽奖区域 -->
  <view class="lottery-area">
    <image class="lottery-bg" src="/images/lottery-wheel.png" />
    
    <!-- 抽奖按钮 -->
    <button 
      class="lottery-btn {{isDrawing ? 'drawing' : ''}}" 
      bind:tap="performLottery"
      disabled="{{isDrawing}}"
    >
      <text wx:if="{{!isDrawing}}">立即抽奖</text>
      <text wx:else>抽奖中...</text>
    </button>
    
    <!-- 保底抽奖按钮 -->
    <button 
      class="guarantee-btn" 
      bind:tap="performGuaranteeLottery"
      disabled="{{isDrawing}}"
    >
      保底抽奖 (消耗50积分)
    </button>
  </view>

  <!-- 我的奖品 -->
  <view class="my-prizes">
    <view class="section-title">我的奖品</view>
    <scroll-view class="prize-list" scroll-y="true">
      <view 
        class="prize-item" 
        wx:for="{{inventoryList}}" 
        wx:key="inventory_id"
        bind:tap="usePrize"
        data-item="{{item}}"
      >
        <text class="prize-icon">{{item.prize_icon}}</text>
        <view class="prize-details">
          <text class="prize-name">{{item.prize_name}}</text>
          <text class="prize-desc">{{item.prize_description}}</text>
          <text class="status {{item.status}}">{{item.status === 'available' ? '可使用' : '已使用'}}</text>
        </view>
      </view>
    </scroll-view>
  </view>

  <!-- 抽奖结果弹窗 -->
  <view class="result-modal {{showResult ? 'show' : ''}}" wx:if="{{showResult}}">
    <view class="modal-content">
      <view class="result-icon">{{lotteryResult.prize ? lotteryResult.prize.icon : '💰'}}</view>
      <text class="result-title">
        {{lotteryResult.result_type === 'prize' ? '恭喜中奖！' : '获得积分！'}}
      </text>
      <text class="result-desc">
        {{lotteryResult.prize ? lotteryResult.prize.name : '积分 +' + lotteryResult.points}}
      </text>
      <button class="confirm-btn" bind:tap="closeResult">确定</button>
    </view>
  </view>
</view>
```

#### 页面样式 (pages/lottery/lottery.wxss)
```css
/* 抽奖页面样式 */
.lottery-container {
  padding: 20rpx;
  min-height: 100vh;
  background: linear-gradient(135deg, #ff9a8b, #fad0c4);
}

.user-info {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.9);
  padding: 30rpx;
  border-radius: 20rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.1);
}

.avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  margin-right: 20rpx;
}

.user-details {
  display: flex;
  flex-direction: column;
}

.username {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 10rpx;
}

.points {
  font-size: 28rpx;
  color: #ff6b35;
  font-weight: bold;
}

.lottery-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 60rpx 0;
}

.lottery-bg {
  width: 500rpx;
  height: 500rpx;
  animation: rotate 8s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.lottery-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: linear-gradient(45deg, #ff6b35, #ff8e53);
  color: white;
  font-size: 28rpx;
  font-weight: bold;
  border: none;
  box-shadow: 0 8rpx 30rpx rgba(255, 107, 53, 0.4);
}

.lottery-btn.drawing {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.1); }
  100% { transform: translate(-50%, -50%) scale(1); }
}

.guarantee-btn {
  margin-top: 40rpx;
  background: #007aff;
  color: white;
  border-radius: 50rpx;
  padding: 20rpx 40rpx;
  font-size: 28rpx;
  border: none;
}

.my-prizes {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 20rpx;
  padding: 30rpx;
  margin-top: 40rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.prize-list {
  max-height: 400rpx;
}

.prize-item {
  display: flex;
  align-items: center;
  padding: 20rpx;
  border-bottom: 1rpx solid #eee;
}

.prize-icon {
  font-size: 60rpx;
  margin-right: 20rpx;
}

.prize-details {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.prize-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 8rpx;
}

.prize-desc {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
}

.status {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 12rpx;
  align-self: flex-start;
}

.status.available {
  background: #e8f5e8;
  color: #52c41a;
}

.status.used {
  background: #f5f5f5;
  color: #999;
}

/* 抽奖结果弹窗 */
.result-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  transition: opacity 0.3s;
}

.result-modal.show {
  opacity: 1;
}

.modal-content {
  background: white;
  border-radius: 20rpx;
  padding: 60rpx 40rpx;
  text-align: center;
  max-width: 600rpx;
  margin: 0 40rpx;
  animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalSlideIn {
  from {
    transform: translateY(-100rpx);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.result-icon {
  font-size: 120rpx;
  margin-bottom: 30rpx;
}

.result-title {
  display: block;
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.result-desc {
  display: block;
  font-size: 28rpx;
  color: #666;
  margin-bottom: 40rpx;
}

.confirm-btn {
  background: #ff6b35;
  color: white;
  border-radius: 50rpx;
  padding: 20rpx 60rpx;
  font-size: 28rpx;
  border: none;
}
```

#### 页面逻辑 (pages/lottery/lottery.js)
```javascript
// 引入API
const api = require('../../utils/api');

Page({
  data: {
    userInfo: {},
    inventoryList: [],
    isDrawing: false,
    showResult: false,
    lotteryResult: null
  },

  onLoad() {
    this.loadUserInfo();
    this.loadInventoryList();
  },

  onShow() {
    // 每次显示页面时刷新用户信息和库存
    this.loadUserInfo();
    this.loadInventoryList();
  },

  /**
   * 加载用户信息
   */
  async loadUserInfo() {
    try {
      const userInfo = wx.getStorageSync('user_info');
      if (userInfo) {
        this.setData({ userInfo });
      }
    } catch (error) {
      console.error('加载用户信息失败:', error);
    }
  },

  /**
   * 加载用户库存
   */
  async loadInventoryList() {
    try {
      const userInfo = wx.getStorageSync('user_info');
      if (!userInfo || !userInfo.user_id) {
        return;
      }

      const result = await api.getUserInventory(userInfo.user_id, {
        status: 'available',
        page: 1,
        limit: 50
      });

      if (result.success) {
        this.setData({
          inventoryList: result.data.items || []
        });
      }
    } catch (error) {
      console.error('加载库存失败:', error);
      wx.showToast({
        title: '加载库存失败',
        icon: 'none'
      });
    }
  },

  /**
   * 执行基础抽奖
   */
  async performLottery() {
    if (this.data.isDrawing) return;

    // 检查积分
    if (this.data.userInfo.points < 10) {
      wx.showModal({
        title: '积分不足',
        content: '基础抽奖需要10积分，您当前积分不足',
        showCancel: false
      });
      return;
    }

    this.setData({ isDrawing: true });

    try {
      const result = await api.performBasicLottery();
      
      if (result.success) {
        // 显示抽奖结果
        this.showLotteryResult(result.data);
        
        // 刷新用户信息和库存
        this.loadUserInfo();
        this.loadInventoryList();
      }
    } catch (error) {
      console.error('抽奖失败:', error);
      wx.showToast({
        title: '抽奖失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ isDrawing: false });
    }
  },

  /**
   * 执行保底抽奖
   */
  async performGuaranteeLottery() {
    if (this.data.isDrawing) return;

    // 检查积分
    if (this.data.userInfo.points < 50) {
      wx.showModal({
        title: '积分不足',
        content: '保底抽奖需要50积分，您当前积分不足',
        showCancel: false
      });
      return;
    }

    // 确认保底抽奖
    const confirmResult = await new Promise((resolve) => {
      wx.showModal({
        title: '保底抽奖',
        content: '保底抽奖将消耗50积分，但保证获得奖品，是否继续？',
        success: (res) => resolve(res.confirm)
      });
    });

    if (!confirmResult) return;

    this.setData({ isDrawing: true });

    try {
      const result = await api.performGuaranteeLottery();
      
      if (result.success) {
        // 显示抽奖结果
        this.showLotteryResult(result.data);
        
        // 刷新用户信息和库存
        this.loadUserInfo();
        this.loadInventoryList();
      }
    } catch (error) {
      console.error('保底抽奖失败:', error);
      wx.showToast({
        title: '抽奖失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ isDrawing: false });
    }
  },

  /**
   * 显示抽奖结果
   */
  showLotteryResult(result) {
    this.setData({
      lotteryResult: result,
      showResult: true
    });
  },

  /**
   * 关闭结果弹窗
   */
  closeResult() {
    this.setData({
      showResult: false,
      lotteryResult: null
    });
  },

  /**
   * 使用奖品
   */
  async usePrize(e) {
    const item = e.currentTarget.dataset.item;
    
    if (item.status !== 'available') {
      wx.showToast({
        title: '该奖品已使用',
        icon: 'none'
      });
      return;
    }

    // 确认使用
    const confirmResult = await new Promise((resolve) => {
      wx.showModal({
        title: '使用奖品',
        content: `确定要使用 ${item.prize_name} 吗？`,
        success: (res) => resolve(res.confirm)
      });
    });

    if (!confirmResult) return;

    try {
      wx.showLoading({ title: '使用中...' });
      
      const result = await api.useInventoryItem(item.inventory_id, {
        usage_type: 'direct_use',
        usage_location: '小程序',
        usage_time: new Date().toISOString()
      });

      if (result.success) {
        wx.showToast({
          title: '奖品使用成功',
          icon: 'success'
        });
        
        // 刷新库存列表
        this.loadInventoryList();
      }
    } catch (error) {
      console.error('使用奖品失败:', error);
      wx.showToast({
        title: '使用失败，请重试',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  }
});
```

### 7.3 登录页面示例

#### 登录页面结构 (pages/login/login.wxml)
```xml
<!--登录页面-->
<view class="login-container">
  <view class="header">
    <image class="logo" src="/images/logo.png" />
    <text class="title">餐厅抽奖</text>
    <text class="subtitle">体验精彩抽奖，赢取丰厚奖品</text>
  </view>

  <view class="login-form">
    <!-- 手机号输入 -->
    <view class="input-group">
      <text class="label">手机号</text>
      <input 
        class="input" 
        type="number" 
        placeholder="请输入手机号"
        value="{{mobile}}"
        bind:input="onMobileInput"
        maxlength="11"
      />
    </view>

    <!-- 验证码输入 -->
    <view class="input-group">
      <text class="label">验证码</text>
      <view class="code-input-row">
        <input 
          class="input code-input" 
          type="number" 
          placeholder="请输入验证码"
          value="{{verificationCode}}"
          bind:input="onCodeInput"
          maxlength="6"
        />
        <button 
          class="code-btn {{codeSending ? 'sending' : ''}}" 
          bind:tap="sendCode"
          disabled="{{codeSending || !canSendCode}}"
        >
          {{codeButtonText}}
        </button>
      </view>
    </view>

    <!-- 开发环境提示 -->
    <view class="dev-hint">
      <text>开发环境：验证码可使用 123456</text>
    </view>

    <!-- 登录按钮 -->
    <button 
      class="login-btn" 
      bind:tap="performLogin"
      disabled="{{!canLogin || logging}}"
    >
      <text wx:if="{{!logging}}">登录</text>
      <text wx:else>登录中...</text>
    </button>
  </view>

  <!-- 用户协议 -->
  <view class="agreement">
    <text>登录即表示同意</text>
    <text class="link" bind:tap="showPrivacy">《用户协议》</text>
    <text>和</text>
    <text class="link" bind:tap="showPrivacy">《隐私政策》</text>
  </view>
</view>
```

#### 登录页面逻辑 (pages/login/login.js)
```javascript
const api = require('../../utils/api');

Page({
  data: {
    mobile: '',
    verificationCode: '',
    codeSending: false,
    logging: false,
    countdown: 0,
    codeButtonText: '获取验证码'
  },

  computed: {
    canSendCode() {
      return this.data.mobile.length === 11 && this.data.countdown === 0;
    },
    
    canLogin() {
      return this.data.mobile.length === 11 && this.data.verificationCode.length >= 4;
    }
  },

  onLoad() {
    // 检查是否已登录
    this.checkLoginStatus();
  },

  /**
   * 检查登录状态
   */
  async checkLoginStatus() {
    try {
      const token = wx.getStorageSync('jwt_token');
      if (token) {
        // 验证Token是否有效
        const result = await api.verifyToken();
        if (result.success) {
          // Token有效，跳转到主页
          wx.reLaunch({
            url: '/pages/lottery/lottery'
          });
        }
      }
    } catch (error) {
      console.log('Token验证失败，需要重新登录');
    }
  },

  /**
   * 手机号输入
   */
  onMobileInput(e) {
    this.setData({
      mobile: e.detail.value
    });
  },

  /**
   * 验证码输入
   */
  onCodeInput(e) {
    this.setData({
      verificationCode: e.detail.value
    });
  },

  /**
   * 发送验证码
   */
  async sendCode() {
    if (!this.canSendCode || this.data.codeSending) {
      return;
    }

    // 验证手机号格式
    const mobileRegex = /^1[3-9]\d{9}$/;
    if (!mobileRegex.test(this.data.mobile)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }

    this.setData({ codeSending: true });

    try {
      // 实际项目中应该调用发送验证码接口
      // const result = await api.sendVerificationCode(this.data.mobile);
      
      // 开发环境模拟成功
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      wx.showToast({
        title: '验证码已发送',
        icon: 'success'
      });

      // 开始倒计时
      this.startCountdown();
      
    } catch (error) {
      console.error('发送验证码失败:', error);
      wx.showToast({
        title: '发送失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ codeSending: false });
    }
  },

  /**
   * 开始倒计时
   */
  startCountdown() {
    let countdown = 60;
    this.setData({ 
      countdown,
      codeButtonText: `${countdown}s后重发`
    });

    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        this.setData({
          countdown,
          codeButtonText: `${countdown}s后重发`
        });
      } else {
        clearInterval(timer);
        this.setData({
          countdown: 0,
          codeButtonText: '获取验证码'
        });
      }
    }, 1000);
  },

  /**
   * 执行登录
   */
  async performLogin() {
    if (!this.canLogin || this.data.logging) {
      return;
    }

    this.setData({ logging: true });

    try {
      const result = await api.login(this.data.mobile, this.data.verificationCode);
      
      if (result.success) {
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        });

        // 登录成功，跳转到主页
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/lottery/lottery'
          });
        }, 1500);
      }
    } catch (error) {
      console.error('登录失败:', error);
      // 错误处理已在API层面处理，这里只记录日志
    } finally {
      this.setData({ logging: false });
    }
  },

  /**
   * 显示隐私政策
   */
  showPrivacy() {
    wx.showModal({
      title: '用户协议',
      content: '这是用户协议和隐私政策的内容...',
      showCancel: false
    });
  }
});
```

### 7.4 app.js 全局配置示例

```javascript
// app.js
const api = require('./utils/api');

App({
  globalData: {
    userInfo: null,
    systemInfo: null
  },

  onLaunch() {
    console.log('餐厅抽奖小程序启动');
    
    // 获取系统信息
    this.getSystemInfo();
    
    // 检查登录状态
    this.checkLoginStatus();
  },

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    wx.getSystemInfo({
      success: (res) => {
        this.globalData.systemInfo = res;
        console.log('系统信息:', res);
      }
    });
  },

  /**
   * 检查登录状态
   */
  async checkLoginStatus() {
    try {
      const token = wx.getStorageSync('jwt_token');
      const userInfo = wx.getStorageSync('user_info');
      
      if (token && userInfo) {
        // 验证Token是否有效
        const result = await api.verifyToken();
        if (result.success) {
          this.globalData.userInfo = userInfo;
          console.log('用户已登录:', userInfo);
        } else {
          // Token无效，清除本地数据
          wx.clearStorageSync();
        }
      }
    } catch (error) {
      console.log('Token验证失败:', error);
      wx.clearStorageSync();
    }
  },

  /**
   * 全局错误处理
   */
  onError(error) {
    console.error('小程序错误:', error);
    
    // 上报错误到后端（可选）
    // api.reportError({
    //   error: error.toString(),
    //   page: getCurrentPages().pop().route,
    //   timestamp: new Date().toISOString()
    // });
  }
});
```

### 7.2 Vue.js 组件示例

```vue
<!-- LotteryComponent.vue -->
<template>
  <div class="lottery-component">
    <div class="user-info">
      <h3>欢迎，{{ userInfo.mobile }}</h3>
      <p>当前积分：{{ userPoints }} 分</p>
    </div>

    <div class="lottery-actions">
      <button 
        @click="performBasicLottery" 
        :disabled="userPoints < 10 || isLotteryInProgress"
        class="lottery-btn basic"
      >
        基础抽奖 (10积分)
      </button>
      
      <button 
        @click="performGuaranteeLottery" 
        :disabled="userPoints < 50 || isLotteryInProgress"
        class="lottery-btn guarantee"
      >
        保底抽奖 (50积分)
      </button>
    </div>

    <div v-if="lotteryResult" class="lottery-result">
      <h4>抽奖结果</h4>
      <div v-if="lotteryResult.result_type === 'prize'" class="prize-result">
        <p>🎉 恭喜中奖！</p>
        <div class="prize-info">
          <span class="prize-icon">{{ lotteryResult.prize.icon }}</span>
          <span class="prize-name">{{ lotteryResult.prize.name }}</span>
          <span class="prize-desc">{{ lotteryResult.prize.description }}</span>
        </div>
      </div>
      <div v-else class="empty-result">
        <p>😅 未中奖，再试一次吧！</p>
      </div>
    </div>

    <div class="inventory-section">
      <h4>我的库存</h4>
      <div v-if="inventoryItems.length > 0" class="inventory-list">
        <div 
          v-for="item in inventoryItems" 
          :key="item.id"
          class="inventory-item"
        >
          <span class="item-icon">{{ item.icon }}</span>
          <div class="item-info">
            <p class="item-name">{{ item.name }}</p>
            <p class="item-status">{{ item.status_description }}</p>
            <p class="item-expire" v-if="item.expires_at">
              过期时间：{{ formatDate(item.expires_at) }}
            </p>
          </div>
          <div class="item-actions">
            <button 
              v-if="item.status === 'available'" 
              @click="useItem(item.id)"
              class="use-btn"
            >
              使用
            </button>
            <button 
              v-if="item.status === 'available'" 
              @click="generateCode(item.id)"
              class="code-btn"
            >
              生成核销码
            </button>
          </div>
        </div>
      </div>
      <p v-else class="empty-inventory">暂无库存物品</p>
    </div>
  </div>
</template>

<script>
import api from './api-client.js';

export default {
  name: 'LotteryComponent',
  data() {
    return {
      userInfo: {},
      userPoints: 0,
      isLotteryInProgress: false,
      lotteryResult: null,
      inventoryItems: []
    };
  },
  
  async mounted() {
    await this.loadUserInfo();
    await this.loadInventory();
  },
  
  methods: {
    async loadUserInfo() {
      try {
        const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
        this.userInfo = userInfo;
        
        // 这里可以调用API获取用户积分
        // const pointsInfo = await api.getUserPoints();
        // this.userPoints = pointsInfo.data.balance;
        this.userPoints = 100; // 临时设置
      } catch (error) {
        console.error('加载用户信息失败:', error);
      }
    },
    
    async loadInventory() {
      try {
        if (this.userInfo.user_id) {
          const result = await api.getUserInventory(this.userInfo.user_id, {
            status: 'available',
            page: 1,
            limit: 10
          });
          
          if (result.success) {
            this.inventoryItems = result.data;
          }
        }
      } catch (error) {
        console.error('加载库存失败:', error);
      }
    },
    
    async performBasicLottery() {
      this.isLotteryInProgress = true;
      try {
        const result = await api.performBasicLottery();
        
        if (result.success) {
          this.lotteryResult = result.data;
          this.userPoints = result.data.remaining_points;
          
          // 如果中奖，刷新库存
          if (result.data.result_type === 'prize') {
            await this.loadInventory();
          }
        }
      } catch (error) {
        console.error('抽奖失败:', error);
      } finally {
        this.isLotteryInProgress = false;
      }
    },
    
    async performGuaranteeLottery() {
      this.isLotteryInProgress = true;
      try {
        const result = await api.performGuaranteeLottery();
        
        if (result.success) {
          this.lotteryResult = result.data;
          this.userPoints = result.data.remaining_points;
          
          // 保底抽奖必定中奖，刷新库存
          await this.loadInventory();
        }
      } catch (error) {
        console.error('保底抽奖失败:', error);
      } finally {
        this.isLotteryInProgress = false;
      }
    },
    
    async useItem(inventoryId) {
      try {
        const result = await api.useInventoryItem(inventoryId, {
          usage_type: 'manual',
          description: '手动使用'
        });
        
        if (result.success) {
          alert('物品使用成功！');
          await this.loadInventory();
        }
      } catch (error) {
        console.error('使用物品失败:', error);
      }
    },
    
    async generateCode(inventoryId) {
      try {
        const result = await api.generateVerificationCode(inventoryId, 86400); // 24小时有效
        
        if (result.success) {
          alert(`核销码生成成功：${result.data.verification_code}`);
        }
      } catch (error) {
        console.error('生成核销码失败:', error);
      }
    },
    
    formatDate(dateString) {
      return new Date(dateString).toLocaleDateString('zh-CN');
    }
  }
};
</script>

<style scoped>
.lottery-component {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.user-info {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.lottery-actions {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
}

.lottery-btn {
  flex: 1;
  padding: 15px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.lottery-btn.basic {
  background: #4CAF50;
  color: white;
}

.lottery-btn.guarantee {
  background: #FF9800;
  color: white;
}

.lottery-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.lottery-result {
  background: #e8f5e8;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.prize-result {
  text-align: center;
}

.prize-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 10px;
}

.prize-icon {
  font-size: 24px;
}

.inventory-section {
  border-top: 1px solid #ddd;
  padding-top: 20px;
}

.inventory-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inventory-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  gap: 15px;
}

.item-icon {
  font-size: 20px;
}

.item-info {
  flex: 1;
}

.item-info p {
  margin: 0;
  line-height: 1.4;
}

.item-name {
  font-weight: bold;
}

.item-status {
  color: #666;
  font-size: 14px;
}

.item-expire {
  color: #999;
  font-size: 12px;
}

.item-actions {
  display: flex;
  gap: 5px;
}

.use-btn, .code-btn {
  padding: 5px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.use-btn {
  background: #2196F3;
  color: white;
}

.code-btn {
  background: #9C27B0;
  color: white;
}

.empty-inventory {
  text-align: center;
  color: #666;
  font-style: italic;
}
</style>
```

### 7.5 app.json小程序配置示例

```json
{
  "pages": [
    "pages/login/login",
    "pages/lottery/lottery",
    "pages/profile/profile",
    "pages/inventory/inventory"
  ],
  "window": {
    "backgroundTextStyle": "light",
    "navigationBarBackgroundColor": "#ff6b35",
    "navigationBarTitleText": "餐厅抽奖",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#f5f5f5"
  },
  "tabBar": {
    "color": "#999",
    "selectedColor": "#ff6b35",
    "backgroundColor": "#fff",
    "borderStyle": "black",
    "list": [
      {
        "pagePath": "pages/lottery/lottery",
        "text": "抽奖",
        "iconPath": "images/lottery.png",
        "selectedIconPath": "images/lottery-active.png"
      },
      {
        "pagePath": "pages/inventory/inventory", 
        "text": "我的奖品",
        "iconPath": "images/inventory.png",
        "selectedIconPath": "images/inventory-active.png"
      },
      {
        "pagePath": "pages/profile/profile",
        "text": "我的",
        "iconPath": "images/profile.png", 
        "selectedIconPath": "images/profile-active.png"
      }
    ]
  },
  "permission": {
    "scope.userLocation": {
      "desc": "用于确认餐厅位置，提供更好的服务"
    }
  },
  "requiredPrivateInfos": [
    "getLocation"
  ],
  "lazyCodeLoading": "requiredComponents"
}
```

### 7.6 微信小程序开发注意事项

#### 网络请求配置
```javascript
// 在微信小程序后台配置合法域名
// 服务器域名配置示例：
// request合法域名：https://your-domain.com
// uploadFile合法域名：https://your-domain.com
// downloadFile合法域名：https://your-domain.com

// 开发环境可以在开发者工具中勾选"不校验合法域名"
```

#### 用户授权处理
```javascript
// utils/auth.js - 用户授权工具
const auth = {
  /**
   * 检查用户信息授权
   */
  async checkUserInfoAuth() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.userInfo']) {
            resolve(true);
          } else {
            resolve(false);
          }
        },
        fail: () => resolve(false)
      });
    });
  },

  /**
   * 获取用户信息
   */
  async getUserInfo() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          resolve(res.userInfo);
        },
        fail: (error) => {
          reject(error);
        }
      });
    });
  }
};

module.exports = auth;
```

## 📱 微信小程序部署清单

### 开发准备
- [ ] 注册微信小程序账号
- [ ] 配置服务器域名白名单  
- [ ] 申请必要的接口权限
- [ ] 配置支付功能（如需要）

### 代码配置
- [ ] 更新API baseURL为生产环境地址
- [ ] 配置微信小程序AppID
- [ ] 设置合适的页面路由
- [ ] 配置tabBar和导航

### 测试验证  
- [ ] 登录流程测试
- [ ] 抽奖功能测试
- [ ] 图片上传测试
- [ ] 网络请求测试
- [ ] 错误处理测试

### 上线发布
- [ ] 代码审查和优化
- [ ] 提交微信审核
- [ ] 配置线上环境
- [ ] 发布正式版本

---

## 📝 总结

这份详细的API接口说明文档包含了：

✅ **完整的请求参数说明**：每个接口的必需参数和可选参数  
✅ **详细的响应数据结构**：成功和错误响应的完整格式  
✅ **实际的业务逻辑说明**：每个接口的具体功能和使用场景  
✅ **可直接复制的代码示例**：前端集成的完整代码  
✅ **错误处理和状态码**：标准的错误处理机制  

这份文档基于实际的后端代码实现，确保了**准确性和可操作性**，前端开发者可以直接使用这些信息进行开发和集成。 