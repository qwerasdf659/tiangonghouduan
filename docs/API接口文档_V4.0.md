# 餐厅积分抽奖系统 V4.0 API接口文档

**文档版本**: V4.0.0  
**生成时间**: 2025年09月24日 09:50:31 北京时间  
**系统架构**: V4 Unified Lottery Engine  
**目标读者**: 前端开发者、第三方集成开发者  
**API版本**: v4

---

## 📋 **文档概述**

### 🎯 **系统介绍**
餐厅积分抽奖系统 V4.0 是基于统一引擎架构的智能抽奖平台，提供完整的用户认证、抽奖执行、奖品管理、权限控制等功能。

### 🏗️ **核心特性**
- **V4统一抽奖引擎** - 支持多种抽奖策略统一管理
- **智能决策系统** - 实时概率调整和策略选择
- **完整权限控制** - 基于角色的访问控制（RBAC）
- **标准化API响应** - 统一的请求响应格式
- **高性能架构** - Redis缓存 + MySQL数据库

### 🌐 **技术栈**
- **后端**: Node.js 20+ + Express
- **数据库**: MySQL + Sequelize ORM
- **缓存**: Redis + 分布式锁
- **认证**: JWT Bearer Token
- **时区**: 北京时间 (Asia/Shanghai)

---

## 🔗 **API基础信息**

### 📍 **服务地址**
```
开发环境: http://localhost:3000
生产环境: https://your-domain.com
```

### 📦 **API版本**
当前版本：`v4`  
API前缀：`/api/v4`

### 🔒 **认证方式**
系统使用 JWT Bearer Token 认证：

```http
Authorization: Bearer <your_jwt_token>
```

### 📋 **标准响应格式**

#### ✅ **成功响应**
```json
{
  "success": true,
  "code": "SUCCESS_CODE",
  "message": "操作成功描述",
  "data": {
    // 具体返回数据
  },
  "version": "v4.0",
  "timestamp": "2025-09-24T01:50:31.000+08:00",
  "request_id": "req_12345678_abcdef"
}
```

#### ❌ **错误响应**
```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "错误描述信息",
  "data": {
    "error": "详细错误信息",
    "suggestion": "解决建议"
  },
  "version": "v4.0",
  "timestamp": "2025-09-24T01:50:31.000+08:00",
  "request_id": "req_12345678_abcdef"
}
```

### 🚦 **HTTP状态码**
| 状态码 | 说明 | 场景 |
|--------|------|------|
| 200 | 请求成功 | 正常业务处理成功 |
| 400 | 请求错误 | 参数验证失败、业务逻辑错误 |
| 401 | 未授权 | Token无效、未登录 |
| 403 | 禁止访问 | 权限不足 |
| 404 | 资源不存在 | API端点不存在、数据不存在 |
| 429 | 请求频率限制 | 超出API调用频率限制 |
| 500 | 服务器内部错误 | 系统异常、数据库错误 |

### 🔄 **请求频率限制**
- 每个IP地址：15分钟内最多1000次请求
- 超出限制时返回HTTP 429状态码

### 🕐 **时间格式**
所有时间字段均使用北京时间（UTC+8），格式为ISO 8601：
```
2025-09-24T01:50:31.000+08:00
```

---

## 🔑 **认证授权**

### 🚀 **快速开始**

#### 1. 用户登录获取Token
```http
POST /api/v4/unified-engine/auth/login
Content-Type: application/json

{
  "mobile": "13800138000",
  "verification_code": "123456"
}
```

#### 2. 使用Token调用API
```http
GET /api/v4/unified-engine/lottery/strategies
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 🔐 **开发环境认证**
开发和测试环境支持万能验证码：`123456`  
生产环境需要接入真实的短信验证服务。

### 👤 **用户角色**
- **普通用户** - 可使用抽奖功能
- **管理员** - 可访问管理后台功能

### 🛡️ **权限级别**
系统基于RBAC模型，支持细粒度权限控制：
- 查看权限
- 操作权限  
- 管理权限
- 超级管理员权限

---

## 🧪 **快速测试**

### 📊 **健康检查**
```bash
curl -X GET "http://localhost:3000/health"
```

### 📖 **获取API信息**
```bash
curl -X GET "http://localhost:3000/api/v4"
```

### 📚 **获取完整文档**
```bash
curl -X GET "http://localhost:3000/api/v4/docs"
```

---

## 🔐 **1. 用户认证API**

**基础路径**: `/api/v4/unified-engine/auth`

### 1.1 用户登录/注册

#### **POST** `/api/v4/unified-engine/auth/login`

**功能**: 用户手机号登录，如果用户不存在则自动创建（登录即注册）

**请求参数**:
```json
{
  "mobile": "13800138000",
  "verification_code": "123456"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mobile | string | ✅ | 手机号，11位数字 |
| verification_code | string | ✅ | 验证码，开发环境固定为123456 |

**成功响应**:
```json
{
  "success": true,
  "code": "LOGIN_SUCCESS",
  "message": "登录成功",
  "data": {
    "user": {
      "id": 1,
      "mobile": "13800138000",
      "is_admin": false,
      "status": "active",
      "created_at": "2025-09-24T01:50:31.000+08:00",
      "last_login": "2025-09-24T01:50:31.000+08:00"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400,
    "token_type": "Bearer"
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "code": "INVALID_VERIFICATION_CODE",
  "message": "验证码错误",
  "data": {
    "error": "验证码不正确，请重新输入"
  }
}
```

**cURL示例**:
```bash
curl -X POST "http://localhost:3000/api/v4/unified-engine/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "mobile": "13800138000",
    "verification_code": "123456"
  }'
```

---

### 1.2 用户注册

#### **POST** `/api/v4/unified-engine/auth/register`

**功能**: 用户注册（实际重定向到登录接口）

**请求参数**: 同登录接口

**响应**: 同登录接口

---

### 1.3 用户登出

#### **POST** `/api/v4/unified-engine/auth/logout`

**功能**: 用户登出，使Token失效

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "LOGOUT_SUCCESS",
  "message": "登出成功",
  "data": {
    "logged_out_at": "2025-09-24T01:50:31.000+08:00"
  }
}
```

**cURL示例**:
```bash
curl -X POST "http://localhost:3000/api/v4/unified-engine/auth/logout" \
  -H "Authorization: Bearer <your_jwt_token>"
```

---

### 1.4 Token验证

#### **POST** `/api/v4/unified-engine/auth/verify`

**功能**: 验证Token有效性

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "TOKEN_VALID",
  "message": "Token有效",
  "data": {
    "user": {
      "id": 1,
      "mobile": "13800138000",
      "is_admin": false,
      "status": "active"
    },
    "token_expires_at": "2025-09-25T01:50:31.000+08:00"
  }
}
```

---

### 1.5 认证状态查询

#### **GET** `/api/v4/unified-engine/auth/status`

**功能**: 获取当前用户认证状态

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "AUTH_STATUS_SUCCESS",
  "message": "认证状态获取成功",
  "data": {
    "authenticated": true,
    "user": {
      "id": 1,
      "mobile": "13800138000",
      "is_admin": false,
      "status": "active",
      "permissions": ["basic_lottery", "view_profile"]
    },
    "session": {
      "login_time": "2025-09-24T01:50:31.000+08:00",
      "expires_at": "2025-09-25T01:50:31.000+08:00",
      "last_activity": "2025-09-24T01:50:31.000+08:00"
    }
  }
}
```

---

### 1.6 Token刷新

#### **POST** `/api/v4/unified-engine/auth/refresh`

**功能**: 刷新用户Token

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "TOKEN_REFRESH_SUCCESS",
  "message": "Token刷新成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400,
    "token_type": "Bearer",
    "refreshed_at": "2025-09-24T01:50:31.000+08:00"
  }
}
```

---

### 1.7 认证健康检查

#### **GET** `/api/v4/unified-engine/auth/health`

**功能**: 认证服务健康检查

**成功响应**:
```json
{
  "success": true,
  "code": "AUTH_SERVICE_HEALTHY",
  "message": "认证服务运行正常",
  "data": {
    "status": "healthy",
    "version": "4.0.0",
    "uptime": "1234s",
    "active_sessions": 156
  }
}
```

---

## 🎲 **2. 抽奖引擎API**

**基础路径**: `/api/v4/unified-engine/lottery`

### 2.1 核心抽奖功能

#### **POST** `/api/v4/unified-engine/lottery/execute`

**功能**: 执行统一抽奖，系统自动选择最优策略

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**请求参数**:
```json
{
  "campaign_id": 1,
  "cost_points": 100,
  "strategy_hint": "auto",
  "extra_params": {
    "source": "web",
    "device_id": "device_123"
  }
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| campaign_id | number | ✅ | 抽奖活动ID |
| cost_points | number | ✅ | 消耗积分数量 |
| strategy_hint | string | ❌ | 策略提示: auto/basic/guarantee/management |
| extra_params | object | ❌ | 额外参数 |

**成功响应**:
```json
{
  "success": true,
  "code": "LOTTERY_SUCCESS",
  "message": "抽奖执行成功",
  "data": {
    "result": {
      "is_winner": true,
      "prize": {
        "id": 5,
        "name": "优质餐具套装",
        "type": "physical",
        "value": "298元",
        "image_url": "https://example.com/prize.jpg"
      },
      "strategy_used": "BasicGuaranteeStrategy",
      "probability": 0.15,
      "execution_id": "exec_1726789231_abc123"
    },
    "user_state": {
      "remaining_points": 900,
      "total_draws": 25,
      "total_wins": 3,
      "win_rate": 0.12
    },
    "campaign": {
      "id": 1,
      "name": "餐厅周年庆抽奖",
      "remaining_prizes": 47,
      "ends_at": "2025-10-01T23:59:59.000+08:00"
    }
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "code": "INSUFFICIENT_POINTS",
  "message": "积分不足",
  "data": {
    "error": "当前积分不足以支付抽奖费用",
    "current_points": 50,
    "required_points": 100,
    "suggestion": "请先获取更多积分"
  }
}
```

**cURL示例**:
```bash
curl -X POST "http://localhost:3000/api/v4/unified-engine/lottery/execute" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": 1,
    "cost_points": 100,
    "strategy_hint": "auto"
  }'
```

---

#### **POST** `/api/v4/unified-engine/lottery/validate`

**功能**: 验证抽奖条件，不执行实际抽奖

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**请求参数**:
```json
{
  "campaign_id": 1,
  "cost_points": 100
}
```

**成功响应**:
```json
{
  "success": true,
  "code": "VALIDATION_SUCCESS",
  "message": "抽奖条件验证通过",
  "data": {
    "can_draw": true,
    "user_points": 1000,
    "cost_points": 100,
    "remaining_points_after": 900,
    "campaign_status": "active",
    "available_prizes": 47,
    "recommended_strategy": "BasicGuaranteeStrategy",
    "validation_details": {
      "points_sufficient": true,
      "campaign_active": true,
      "user_eligible": true,
      "prizes_available": true
    }
  }
}
```

---

### 2.2 策略和状态查询

#### **GET** `/api/v4/unified-engine/lottery/strategies`

**功能**: 获取可用抽奖策略列表

**成功响应**:
```json
{
  "success": true,
  "code": "STRATEGIES_SUCCESS",
  "message": "策略列表获取成功",
  "data": {
    "strategies": [
      {
        "id": "basic",
        "name": "BasicGuaranteeStrategy",
        "display_name": "基础抽奖保底策略",
        "description": "基础抽奖策略，包含保底机制",
        "status": "active",
        "success_rate": 0.15,
        "features": ["基础抽奖", "保底机制", "概率调整"]
      },
      {
        "id": "management", 
        "name": "ManagementStrategy",
        "display_name": "管理抽奖策略",
        "description": "管理员专用抽奖策略",
        "status": "active",
        "success_rate": 0.80,
        "features": ["管理员专用", "高中奖率", "特殊奖品"]
      }
    ],
    "default_strategy": "basic",
    "total_strategies": 2
  }
}
```

---

#### **GET** `/api/v4/unified-engine/lottery/metrics`

**功能**: 获取抽奖引擎性能指标

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "METRICS_SUCCESS",
  "message": "引擎指标获取成功",
  "data": {
    "engine_performance": {
      "total_executions": 15234,
      "success_rate": 0.987,
      "average_response_time": "45ms",
      "daily_executions": 1205,
      "peak_concurrent": 156
    },
    "strategy_usage": {
      "BasicGuaranteeStrategy": {
        "usage_count": 12890,
        "success_rate": 0.15,
        "average_response_time": "42ms"
      },
      "ManagementStrategy": {
        "usage_count": 2344,
        "success_rate": 0.85,
        "average_response_time": "38ms"
      }
    },
    "system_health": {
      "status": "healthy",
      "cache_hit_rate": 0.92,
      "database_response": "8ms",
      "error_rate": 0.013
    }
  }
}
```

---

### 2.3 用户相关查询

#### **GET** `/api/v4/unified-engine/lottery/history/:userId`

**功能**: 获取用户抽奖历史记录

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**URL参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | number | ✅ | 用户ID |

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | ❌ | 页码，默认1 |
| limit | number | ❌ | 每页数量，默认20，最大100 |
| start_date | string | ❌ | 开始日期，ISO格式 |
| end_date | string | ❌ | 结束日期，ISO格式 |

**成功响应**:
```json
{
  "success": true,
  "code": "HISTORY_SUCCESS",
  "message": "抽奖历史获取成功",
  "data": {
    "records": [
      {
        "id": 1001,
        "campaign_id": 1,
        "campaign_name": "餐厅周年庆抽奖",
        "is_winner": true,
        "prize": {
          "id": 5,
          "name": "优质餐具套装",
          "type": "physical",
          "value": "298元"
        },
        "cost_points": 100,
        "strategy_used": "BasicGuaranteeStrategy",
        "created_at": "2025-09-24T01:50:31.000+08:00"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 3,
      "total_records": 45,
      "limit": 20,
      "has_next": true,
      "has_previous": false
    },
    "statistics": {
      "total_draws": 45,
      "total_wins": 6,
      "win_rate": 0.133,
      "total_points_spent": 4500,
      "total_prizes_value": "1,280元"
    }
  }
}
```

---

#### **GET** `/api/v4/unified-engine/lottery/user/profile`

**功能**: 获取当前用户的抽奖档案信息

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "PROFILE_SUCCESS",
  "message": "用户档案获取成功",
  "data": {
    "user": {
      "id": 1,
      "mobile": "13800138000",
      "is_admin": false,
      "status": "active",
      "member_level": "gold"
    },
    "lottery_stats": {
      "total_draws": 45,
      "total_wins": 6,
      "win_rate": 0.133,
      "best_prize": "优质餐具套装",
      "lucky_score": 85,
      "rank_among_users": 156
    },
    "points": {
      "current_balance": 950,
      "total_earned": 5600,
      "total_spent": 4650,
      "pending_points": 0
    },
    "preferences": {
      "favorite_campaigns": [1, 3, 5],
      "notification_enabled": true,
      "auto_join_new_campaigns": false
    }
  }
}
```

---

### 2.4 活动和奖池管理

#### **GET** `/api/v4/unified-engine/lottery/campaigns`

**功能**: 获取可参与的抽奖活动列表

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | ❌ | 活动状态: active/upcoming/ended |
| page | number | ❌ | 页码，默认1 |
| limit | number | ❌ | 每页数量，默认10 |

**成功响应**:
```json
{
  "success": true,
  "code": "CAMPAIGNS_SUCCESS",
  "message": "活动列表获取成功",
  "data": {
    "campaigns": [
      {
        "id": 1,
        "name": "餐厅周年庆抽奖",
        "description": "庆祝餐厅成立周年，豪华奖品等你来抽",
        "status": "active",
        "cost_per_draw": 100,
        "total_prizes": 100,
        "remaining_prizes": 47,
        "start_time": "2025-09-01T00:00:00.000+08:00",
        "end_time": "2025-10-01T23:59:59.000+08:00",
        "banner_image": "https://example.com/banner.jpg",
        "featured_prizes": [
          {
            "id": 1,
            "name": "豪华餐具套装",
            "probability": 0.05,
            "value": "598元"
          }
        ]
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 2,
      "total_records": 15,
      "limit": 10
    },
    "summary": {
      "active_campaigns": 5,
      "upcoming_campaigns": 3,
      "ended_campaigns": 7
    }
  }
}
```

---

#### **GET** `/api/v4/unified-engine/lottery/prize-pool/:campaign_id`

**功能**: 获取指定活动的奖池信息

**URL参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| campaign_id | number | ✅ | 活动ID |

**成功响应**:
```json
{
  "success": true,
  "code": "PRIZE_POOL_SUCCESS",
  "message": "奖池信息获取成功",
  "data": {
    "campaign": {
      "id": 1,
      "name": "餐厅周年庆抽奖",
      "status": "active"
    },
    "prize_pool": {
      "total_prizes": 100,
      "remaining_prizes": 47,
      "total_value": "15,680元",
      "distribution": {
        "special": {
          "count": 5,
          "remaining": 2,
          "value_range": "500-1000元"
        },
        "high": {
          "count": 15,
          "remaining": 8,
          "value_range": "200-500元"
        },
        "medium": {
          "count": 30,
          "remaining": 15,
          "value_range": "50-200元"
        },
        "basic": {
          "count": 50,
          "remaining": 22,
          "value_range": "10-50元"
        }
      }
    },
    "prizes": [
      {
        "id": 1,
        "name": "豪华餐具套装",
        "type": "physical",
        "tier": "special",
        "value": "598元",
        "probability": 0.05,
        "remaining_count": 2,
        "image_url": "https://example.com/prize1.jpg"
      }
    ]
  }
}
```

---

## 👨‍💼 **3. 管理后台API**

**基础路径**: `/api/v4/unified-engine/admin`  
**权限要求**: 需要管理员权限

### 3.1 管理认证

#### **POST** `/api/v4/unified-engine/admin/auth`

**功能**: 管理员身份验证

**请求参数**:
```json
{
  "mobile": "13800138000",
  "verification_code": "123456",
  "admin_code": "admin2024"
}
```

**成功响应**:
```json
{
  "success": true,
  "code": "ADMIN_AUTH_SUCCESS",
  "message": "管理员认证成功",
  "data": {
    "admin": {
      "id": 1,
      "mobile": "13800138000",
      "is_admin": true,
      "admin_level": "super",
      "permissions": ["all"]
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400
  }
}
```

---

### 3.2 系统监控

#### **GET** `/api/v4/unified-engine/admin/dashboard`

**功能**: 获取管理仪表板数据

**请求头**:
```http
Authorization: Bearer <admin_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "DASHBOARD_SUCCESS",
  "message": "仪表板数据获取成功",
  "data": {
    "overview": {
      "total_users": 1250,
      "active_users_today": 89,
      "total_campaigns": 15,
      "active_campaigns": 5,
      "total_draws_today": 456,
      "total_prizes_distributed": 2340
    },
    "recent_activities": [
      {
        "id": 1,
        "type": "lottery_execution",
        "user_id": 123,
        "description": "用户完成抽奖",
        "timestamp": "2025-09-24T01:50:31.000+08:00"
      }
    ],
    "system_metrics": {
      "cpu_usage": "15%",
      "memory_usage": "32MB/64MB",
      "database_connections": 12,
      "cache_hit_rate": "92%",
      "average_response_time": "45ms"
    },
    "alerts": [
      {
        "level": "warning",
        "message": "缓存命中率低于95%",
        "timestamp": "2025-09-24T01:40:31.000+08:00"
      }
    ]
  }
}
```

---

### 3.3 奖池管理

#### **POST** `/api/v4/unified-engine/admin/prize-pool/batch-add`

**功能**: 批量添加奖品到奖池

**请求头**:
```http
Authorization: Bearer <admin_jwt_token>
```

**请求参数**:
```json
{
  "campaign_id": 1,
  "prizes": [
    {
      "name": "豪华餐具套装",
      "type": "physical",
      "value": "598元",
      "quantity": 10,
      "probability": 0.05,
      "tier": "special"
    },
    {
      "name": "餐厅代金券",
      "type": "voucher", 
      "value": "50元",
      "quantity": 50,
      "probability": 0.3,
      "tier": "basic"
    }
  ]
}
```

**成功响应**:
```json
{
  "success": true,
  "code": "BATCH_ADD_SUCCESS",
  "message": "奖品批量添加成功",
  "data": {
    "added_count": 2,
    "total_prizes": 60,
    "campaign_id": 1,
    "added_prizes": [
      {
        "id": 101,
        "name": "豪华餐具套装",
        "quantity": 10
      },
      {
        "id": 102,
        "name": "餐厅代金券",
        "quantity": 50
      }
    ]
  }
}
```

---

### 3.4 用户管理

#### **GET** `/api/v4/unified-engine/admin/users`

**功能**: 获取用户列表

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | ❌ | 页码，默认1 |
| limit | number | ❌ | 每页数量，默认20 |
| search | string | ❌ | 搜索关键词（手机号） |
| status | string | ❌ | 用户状态筛选 |

**成功响应**:
```json
{
  "success": true,
  "code": "USERS_LIST_SUCCESS",
  "message": "用户列表获取成功",
  "data": {
    "users": [
      {
        "id": 1,
        "mobile": "13800138000",
        "is_admin": false,
        "status": "active",
        "points_balance": 950,
        "total_draws": 45,
        "total_wins": 6,
        "created_at": "2025-09-24T01:50:31.000+08:00",
        "last_login": "2025-09-24T01:50:31.000+08:00"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 63,
      "total_records": 1250,
      "limit": 20
    },
    "statistics": {
      "total_users": 1250,
      "active_users": 1180,
      "admin_users": 5,
      "new_users_today": 12
    }
  }
}
```

---

## 🔐 **4. 权限管理API**

**基础路径**: `/api/v4/permissions`

### 4.1 权限查询

#### **GET** `/api/v4/permissions/user/:userId`

**功能**: 查询指定用户权限

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "USER_PERMISSIONS_SUCCESS",
  "message": "用户权限获取成功",
  "data": {
    "user": {
      "id": 1,
      "mobile": "13800138000",
      "is_admin": false
    },
    "permissions": {
      "basic_lottery": true,
      "view_profile": true,
      "view_history": true,
      "admin_panel": false,
      "manage_users": false,
      "manage_campaigns": false
    },
    "role": "user",
    "level": "basic"
  }
}
```

---

#### **POST** `/api/v4/permissions/check`

**功能**: 检查用户是否具有特定权限

**请求参数**:
```json
{
  "permission": "admin_panel",
  "resource_id": 1
}
```

**成功响应**:
```json
{
  "success": true,
  "code": "PERMISSION_CHECK_SUCCESS",
  "message": "权限检查完成",
  "data": {
    "has_permission": false,
    "permission": "admin_panel",
    "user_role": "user",
    "required_role": "admin",
    "reason": "用户角色不足，需要管理员权限"
  }
}
```

---

## 📦 **5. 库存管理API**

**基础路径**: `/api/v4/inventory`

### 5.1 用户库存

#### **GET** `/api/v4/inventory/user/:user_id`

**功能**: 获取用户库存列表

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "USER_INVENTORY_SUCCESS",
  "message": "用户库存获取成功",
  "data": {
    "inventory": [
      {
        "id": 1,
        "prize_id": 5,
        "prize_name": "优质餐具套装",
        "prize_type": "physical",
        "prize_value": "298元",
        "status": "unused",
        "obtained_at": "2025-09-24T01:50:31.000+08:00",
        "expires_at": "2025-12-24T01:50:31.000+08:00"
      }
    ],
    "summary": {
      "total_items": 6,
      "unused_items": 4,
      "used_items": 2,
      "expired_items": 0,
      "total_value": "1,280元"
    }
  }
}
```

---

#### **POST** `/api/v4/inventory/use/:item_id`

**功能**: 使用库存物品

**请求头**:
```http
Authorization: Bearer <your_jwt_token>
```

**成功响应**:
```json
{
  "success": true,
  "code": "ITEM_USE_SUCCESS",
  "message": "物品使用成功",
  "data": {
    "item": {
      "id": 1,
      "prize_name": "优质餐具套装",
      "status": "used",
      "used_at": "2025-09-24T01:50:31.000+08:00"
    },
    "usage_code": "USE_20250924_ABC123",
    "instructions": "请凭此使用码到餐厅前台兑换奖品"
  }
}
```

---

## ⚠️ **错误码说明**

### 认证相关错误
| 错误码 | HTTP状态 | 说明 | 解决方案 |
|--------|----------|------|----------|
| INVALID_VERIFICATION_CODE | 400 | 验证码错误 | 重新获取验证码 |
| TOKEN_EXPIRED | 401 | Token已过期 | 刷新Token或重新登录 |
| TOKEN_INVALID | 401 | Token无效 | 重新登录获取新Token |
| INSUFFICIENT_PERMISSIONS | 403 | 权限不足 | 联系管理员提升权限 |

### 抽奖相关错误
| 错误码 | HTTP状态 | 说明 | 解决方案 |
|--------|----------|------|----------|
| INSUFFICIENT_POINTS | 400 | 积分不足 | 获取更多积分 |
| CAMPAIGN_NOT_FOUND | 404 | 活动不存在 | 检查活动ID |
| CAMPAIGN_ENDED | 400 | 活动已结束 | 参加其他活动 |
| NO_PRIZES_AVAILABLE | 400 | 奖品已抽完 | 等待补充奖品 |
| USER_LIMIT_EXCEEDED | 400 | 超出用户抽奖限制 | 等待重置或联系客服 |

### 系统相关错误
| 错误码 | HTTP状态 | 说明 | 解决方案 |
|--------|----------|------|----------|
| RATE_LIMIT_EXCEEDED | 429 | 请求频率过高 | 稍后重试 |
| DATABASE_ERROR | 500 | 数据库错误 | 联系技术支持 |
| CACHE_ERROR | 500 | 缓存服务错误 | 联系技术支持 |
| INTERNAL_SERVER_ERROR | 500 | 服务器内部错误 | 联系技术支持 |

---

## 🛠️ **SDK和集成示例**

### JavaScript/TypeScript SDK

#### 安装
```bash
npm install restaurant-lottery-sdk
```

#### 基础使用
```javascript
import { LotterySDK } from 'restaurant-lottery-sdk'

// 初始化SDK
const sdk = new LotterySDK({
  baseURL: 'http://localhost:3000',
  apiVersion: 'v4'
})

// 用户登录
const loginResult = await sdk.auth.login({
  mobile: '13800138000',
  verification_code: '123456'
})

// 设置Token
sdk.setToken(loginResult.data.token)

// 执行抽奖
const lotteryResult = await sdk.lottery.execute({
  campaign_id: 1,
  cost_points: 100
})

// 获取用户历史
const history = await sdk.lottery.getHistory(userId, {
  page: 1,
  limit: 20
})
```

### 前端集成示例

#### React集成
```jsx
import React, { useState, useEffect } from 'react'
import { LotterySDK } from 'restaurant-lottery-sdk'

const LotteryComponent = () => {
  const [sdk] = useState(new LotterySDK({ baseURL: 'http://localhost:3000' }))
  const [campaigns, setCampaigns] = useState([])
  const [userProfile, setUserProfile] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      // 获取活动列表
      const campaignsResult = await sdk.lottery.getCampaigns()
      setCampaigns(campaignsResult.data.campaigns)

      // 获取用户信息
      const profileResult = await sdk.lottery.getUserProfile()
      setUserProfile(profileResult.data)
    } catch (error) {
      console.error('数据加载失败:', error)
    }
  }

  const handleLottery = async (campaignId, costPoints) => {
    try {
      const result = await sdk.lottery.execute({
        campaign_id: campaignId,
        cost_points: costPoints
      })

      if (result.data.result.is_winner) {
        alert(`恭喜中奖！获得：${result.data.result.prize.name}`)
      } else {
        alert('很遗憾，未中奖，请再接再厉！')
      }

      // 刷新用户信息
      loadData()
    } catch (error) {
      alert(`抽奖失败：${error.message}`)
    }
  }

  return (
    <div className="lottery-container">
      <div className="user-info">
        <h3>用户信息</h3>
        {userProfile && (
          <div>
            <p>当前积分：{userProfile.points.current_balance}</p>
            <p>抽奖次数：{userProfile.lottery_stats.total_draws}</p>
            <p>中奖次数：{userProfile.lottery_stats.total_wins}</p>
          </div>
        )}
      </div>

      <div className="campaigns">
        <h3>抽奖活动</h3>
        {campaigns.map(campaign => (
          <div key={campaign.id} className="campaign-card">
            <h4>{campaign.name}</h4>
            <p>{campaign.description}</p>
            <p>消耗积分：{campaign.cost_per_draw}</p>
            <p>剩余奖品：{campaign.remaining_prizes}</p>
            <button 
              onClick={() => handleLottery(campaign.id, campaign.cost_per_draw)}
              disabled={!userProfile || userProfile.points.current_balance < campaign.cost_per_draw}
            >
              参与抽奖
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LotteryComponent
```

### 微信小程序集成

#### utils/api.js
```javascript
const API_BASE_URL = 'http://localhost:3000'
const API_VERSION = 'v4'

class LotteryAPI {
  constructor() {
    this.token = wx.getStorageSync('jwt_token')
  }

  // 通用请求方法
  async request(options) {
    const { url, method = 'GET', data = {} } = options
    
    const header = {
      'Content-Type': 'application/json'
    }
    
    if (this.token) {
      header['Authorization'] = `Bearer ${this.token}`
    }

    return new Promise((resolve, reject) => {
      wx.request({
        url: `${API_BASE_URL}/api/${API_VERSION}${url}`,
        method,
        data,
        header,
        success: (res) => {
          if (res.statusCode === 200 && res.data.success) {
            resolve(res.data)
          } else {
            reject(new Error(res.data.message || '请求失败'))
          }
        },
        fail: reject
      })
    })
  }

  // 用户登录
  async login(mobile, verificationCode) {
    const result = await this.request({
      url: '/unified-engine/auth/login',
      method: 'POST',
      data: {
        mobile,
        verification_code: verificationCode
      }
    })
    
    this.token = result.data.token
    wx.setStorageSync('jwt_token', this.token)
    
    return result
  }

  // 执行抽奖
  async executeLottery(campaignId, costPoints) {
    return await this.request({
      url: '/unified-engine/lottery/execute',
      method: 'POST',
      data: {
        campaign_id: campaignId,
        cost_points: costPoints
      }
    })
  }

  // 获取活动列表
  async getCampaigns() {
    return await this.request({
      url: '/unified-engine/lottery/campaigns'
    })
  }

  // 获取用户档案
  async getUserProfile() {
    return await this.request({
      url: '/unified-engine/lottery/user/profile'
    })
  }

  // 获取用户库存
  async getUserInventory(userId) {
    return await this.request({
      url: `/inventory/user/${userId}`
    })
  }
}

module.exports = new LotteryAPI()
```

#### pages/lottery/lottery.js
```javascript
const api = require('../../utils/api')

Page({
  data: {
    campaigns: [],
    userProfile: null,
    loading: false
  },

  onLoad() {
    this.loadData()
  },

  async loadData() {
    try {
      wx.showLoading({ title: '加载中...' })
      
      // 并行获取数据
      const [campaignsResult, profileResult] = await Promise.all([
        api.getCampaigns(),
        api.getUserProfile()
      ])

      this.setData({
        campaigns: campaignsResult.data.campaigns,
        userProfile: profileResult.data
      })
    } catch (error) {
      wx.showToast({
        title: error.message,
        icon: 'error'
      })
    } finally {
      wx.hideLoading()
    }
  },

  async onLottery(e) {
    const { campaignId, costPoints } = e.currentTarget.dataset
    
    if (this.data.loading) return
    
    this.setData({ loading: true })
    
    try {
      const result = await api.executeLottery(campaignId, costPoints)
      
      if (result.data.result.is_winner) {
        wx.showModal({
          title: '恭喜中奖！',
          content: `获得：${result.data.result.prize.name}`,
          showCancel: false
        })
      } else {
        wx.showToast({
          title: '未中奖，再接再厉！',
          icon: 'none'
        })
      }
      
      // 刷新数据
      this.loadData()
    } catch (error) {
      wx.showToast({
        title: error.message,
        icon: 'error'
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})
```

---

## 📞 **技术支持**

### 🤝 **联系方式**
- **技术文档**: [接口文档链接]
- **问题反馈**: [GitHub Issues]
- **技术交流**: [开发者群]

### 🔄 **更新日志**
- **V4.0.0** (2025-09-24)
  - 统一抽奖引擎架构发布
  - 完整的API接口体系
  - 标准化响应格式
  - 完善的权限控制

### 📋 **常见问题**

#### Q: 如何获取管理员权限？
A: 请联系系统管理员进行权限分配。

#### Q: Token过期怎么办？
A: 使用`/auth/refresh`接口刷新Token，或重新登录。

#### Q: 抽奖概率如何计算？
A: 系统使用V4统一引擎，支持多种策略的智能概率调整。

#### Q: 如何处理网络请求失败？
A: 建议实现重试机制，并根据错误码进行相应处理。

---

**文档结束** - 如有疑问，请查阅技术支持章节或联系开发团队。 