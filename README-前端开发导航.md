# 前端开发导航 - 餐厅积分抽奖系统

> 🧭 **前端开发人员快速导航指南** - 帮您快速找到所需的所有开发信息

## 📚 文档索引

### 🎯 **必读文档（按优先级排序）**

1. **🔗 [接口对接规范文档标准.md](./接口对接规范文档标准.md)**
   - 📍 **用途**：API接口定义、数据格式、错误处理
   - 🎯 **重点章节**：
     - 第二章：用户认证接口（登录、token验证）
     - 第三章：积分抽奖接口（单抽、连抽、概率控制）
     - 第四章：商品兑换接口（库存查询、兑换流程）
     - 第五章：照片上传接口（上传、审核状态查询）
     - 第六章：管理员接口（需要管理员权限的功能）

2. **📋 [产品功能结构描述.md](./产品功能结构描述.md)**
   - 📍 **用途**：业务逻辑、功能需求、用户流程
   - 🎯 **重点章节**：
     - 第二章：核心功能模块（8大功能详解）
     - 第三章：用户角色与权限（普通用户vs管理员）
     - 第四章：业务流程（抽奖、兑换、上传审核）

### 🔧 **参考文档（需要时查阅）**

3. **🏗️ [前端技术规范文档标准.md](./前端技术规范文档标准.md)**
   - 📍 **用途**：前端技术标准、代码规范
   - 🎯 **适用场景**：代码风格、组件设计、性能优化


---

## 🚀 快速开始指南

### 第一步：了解权限系统（⚠️ 重要）
```javascript
// 🔴 权限简化后的用户类型（仅2种）
{
  is_admin: false  // 普通用户
  is_admin: true   // 管理员（包含所有功能权限）
}

// 🔴 统一登录方式
POST /api/auth/login
Body: {
  "mobile": "13800138000",
  "code": "123456"  // 开发环境万能验证码
}
```

### 第二步：核心接口快速索引
| 功能模块 | 关键接口 | 文档位置 |
|---------|----------|----------|
| **用户登录** | `POST /api/auth/login` | 接口文档 第2.1节 |
| **积分抽奖** | `POST /api/lottery/draw` | 接口文档 第3.1节 |
| **商品兑换** | `POST /api/exchange/redeem` | 接口文档 第4.1节 |
| **照片上传** | `POST /api/photo/upload` | 接口文档 第5.1节 |
| **管理员审核** | `GET /api/merchant/pending-reviews` | 接口文档 第6.1节 |
| **🔴 商品统计** | `GET /api/merchant/product-stats` | 接口文档 第8.1节 |
| **🔴 商品列表** | `GET /api/merchant/products` | 接口文档 第8.2节 |
| **🔴 商品创建** | `POST /api/merchant/products` | 接口文档 第8.3节 |
| **🔴 商品更新** | `PUT /api/merchant/products/:id` | 接口文档 第8.4节 |
| **🔴 商品删除** | `DELETE /api/merchant/products/:id` | 接口文档 第8.4节 |
| **🔴 批量更新** | `POST /api/merchant/products/batch-update` | 接口文档 第8.5节 |

### 第三步：开发环境特殊说明
- 🔑 **万能验证码**：`123456`（适用于所有用户登录）
- 📱 **跳过短信验证**：开发阶段暂停真实短信服务
- 👑 **管理员测试**：登录后通过 `is_admin` 字段判断权限

---

## 🎯 按功能模块开发指南

### 🎰 积分抽奖模块
- **📖 业务逻辑**：产品功能文档 2.1节
- **🔗 API接口**：接口文档 第3章
- **🎲 关键概念**：
  - 8区域转盘设计
  - 保底机制（10次必中九八折券）
  - 批量抽奖（1次、3次、5次、10次）

### 🛍️ 商品兑换模块
- **📖 业务逻辑**：产品功能文档 2.2节
- **🔗 API接口**：接口文档 第4章
- **💡 关键概念**：
  - 实时库存管理
  - 兑换码生成
  - 积分扣减与回滚

### 📸 拍照上传模块
- **📖 业务逻辑**：产品功能文档 2.3节
- **🔗 API接口**：接口文档 第5章
- **📋 流程特点**：
  - 用户只需上传照片（无需输入金额）
  - 管理员审核时设置消费金额
  - 自动积分计算（1元=10积分）

### 👑 管理员功能模块
- **📖 权限说明**：产品功能文档 3.2节
- **🔗 API接口**：接口文档 第6章、第8章
- **🛠️ 核心功能**：
  - 照片审核管理
  - 抽奖概率调整
  - 活动控制管理
  - **🔴 商品统计分析**（商品数量、库存状态统计）
  - **🔴 商品库存管理**（商品列表、库存监控、状态管理）
  - **🔴 商品信息维护**（创建、更新、删除、批量操作）

---

## 🚨 常见问题快速解决

### Q1: 权限验证失败？
**A**: 检查 `Authorization` 头中的token，确保登录接口返回的token格式正确
```javascript
Headers: {
  'Authorization': 'Bearer ' + token
}
```

### Q2: 接口返回404？
**A**: 确认API路径前缀，所有接口都以 `/api/` 开头
```javascript
// ✅ 正确
POST /api/auth/login
GET /api/merchant/product-stats
GET /api/merchant/products

// ❌ 错误
POST /auth/login
GET /merchant/product-stats
```

### Q4: 商品管理接口无权限？
**A**: 商品管理接口需要管理员权限，确保使用管理员账号登录
```javascript
// 检查登录返回的用户信息
{
  "user_info": {
    "is_admin": true  // 必须为true才能访问商品管理接口
  }
}

// 所有商品管理接口都需要管理员权限
GET /api/merchant/product-stats    // 商品统计
GET /api/merchant/products         // 商品列表
POST /api/merchant/products        // 创建商品
PUT /api/merchant/products/:id     // 更新商品
DELETE /api/merchant/products/:id  // 删除商品
```

### Q3: 数据格式错误？
**A**: 严格按照接口文档的请求体格式，注意字段类型和必填项
```javascript
// 参考接口文档中的示例代码
Content-Type: application/json
```

---

## 📞 技术支持

- **接口问题**：参考接口文档错误码定义
- **业务逻辑**：参考产品功能文档
- **开发规范**：参考前端技术规范文档

---

**🎯 核心原则：先看接口文档定义接口，再看产品文档理解业务，遇到问题先查文档再求助！** 