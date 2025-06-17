# 餐厅积分抽奖系统 - 后端服务

> 基于 Node.js + Express + MySQL + WebSocket 的餐厅积分抽奖系统后端服务

## 🎯 项目概述

餐厅积分抽奖系统是一个面向餐饮行业的客户积分管理和互动营销平台，包含用户积分管理、转盘抽奖、商品兑换、拍照上传等核心功能。

### 🚀 核心功能

- **🔐 用户认证系统**：手机号登录、JWT双令牌认证
- **🎰 抽奖系统**：Canvas转盘抽奖、概率算法、特殊动效
- **🛍️ 商品兑换**：实时库存管理、分页筛选、订单追踪
- **💰 积分系统**：积分收支记录、统计分析
- **📸 拍照上传**：AI识别金额、积分奖励（待实现）
- **👨‍💼 商家管理**：权限控制、审核管理（待实现）
- **📡 实时通信**：WebSocket推送库存变更、积分变动

## 🏗️ 技术架构

### 技术栈
- **后端框架**：Node.js 18+ + Express 4.18
- **数据库**：MySQL 8.0 + Sequelize ORM
- **认证**：JWT + Refresh Token
- **实时通信**：WebSocket
- **缓存**：Redis（可选）
- **文件存储**：Sealos对象存储

### 系统架构
```
┌─────────────────────────────────────────┐
│              前端应用                    │
│          微信小程序/H5                   │
└─────────────────┬───────────────────────┘
                  │ HTTPS/WSS
┌─────────────────▼───────────────────────┐
│              负载均衡                    │
│             Nginx/LB                    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│            Express 应用                  │
│   ┌─────────┬─────────┬─────────────┐   │
│   │ 认证中间件 │ 限流中间件 │ 日志中间件   │   │
│   └─────────┴─────────┴─────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │          API 路由               │   │
│   │ Auth│Lottery│Exchange│User     │   │
│   └─────────────────────────────────┘   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│             数据存储                     │
│  ┌─────────┬─────────┬─────────────┐   │
│  │  MySQL  │  Redis  │   Sealos    │   │
│  │  主数据  │  缓存   │  文件存储    │   │
│  └─────────┴─────────┴─────────────┘   │
└─────────────────────────────────────────┘
```

## 🚀 快速开始

### 环境要求
- Node.js 16.0+
- MySQL 8.0+
- Redis 6.0+（可选）

### 安装与配置

1. **克隆项目**
```bash
git clone <repository-url>
cd restaurant-points-backend
```

2. **安装依赖**
```bash
npm install
```

3. **环境配置**
```bash
# 复制配置文件
cp config.example .env

# 编辑配置文件
vim .env
```

4. **数据库初始化**
```bash
# 初始化数据库和表结构
node init-db.js
```

5. **启动服务**
```bash
# 开发环境
npm run dev

# 生产环境
npm start
```

### 🔧 环境变量配置

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | `development` |
| `PORT` | API服务端口 | `3000` |
| `WS_PORT` | WebSocket端口 | `8080` |
| `DB_HOST` | 数据库主机 | `test-db-mysql.ns-br0za7uc.svc` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_PASSWORD` | 数据库密码 | `mc6r9cgb` |
| `DB_NAME` | 数据库名称 | `restaurant_points_dev` |
| `JWT_SECRET` | JWT密钥 | `your_jwt_secret` |
| `JWT_REFRESH_SECRET` | 刷新Token密钥 | `your_refresh_secret` |
| **🔴 Sealos对象存储配置（已完成）** |
| `SEALOS_ENDPOINT` | 外网端点 | `https://objectstorageapi.bja.sealos.run` |
| `SEALOS_INTERNAL_ENDPOINT` | 内网端点 | `http://object-storage.objectstorage-system.svc.cluster.local` |
| `SEALOS_BUCKET` | 存储桶名 | `tiangong` |
| `SEALOS_ACCESS_KEY` | 访问密钥 | `br0za7uc` |
| `SEALOS_SECRET_KEY` | 密钥 | `skxg8mk5gqfhf9xz` |

## 📡 API 文档

### 基础信息
- **API Base URL**: `http://localhost:3000/api`
- **认证方式**: `Bearer Token`
- **响应格式**: JSON

### 统一响应格式
```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

### 核心接口

#### 🔐 认证相关 `/api/auth`
| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/login` | 用户登录 | ❌ |
| POST | `/refresh` | 刷新Token | ❌ |
| GET | `/verify-token` | 验证Token | ✅ |
| POST | `/logout` | 退出登录 | ✅ |

#### 🎰 抽奖相关 `/api/lottery`
| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/config` | 获取抽奖配置 | ✅ |
| POST | `/draw` | 执行抽奖 | ✅ |
| GET | `/records` | 抽奖记录 | ✅ |

#### 🛍️ 商品兑换 `/api/exchange`
| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/products` | 商品列表 | ✅ |
| POST | `/submit` | 提交兑换 | ✅ |
| GET | `/orders` | 兑换订单 | ✅ |
| GET | `/categories` | 商品分类 | ❌ |

#### 👤 用户相关 `/api/user`
| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/info` | 用户信息 | ✅ |
| PUT | `/info` | 更新用户信息 | ✅ |
| GET | `/points/records` | 积分记录 | ✅ |
| GET | `/points/statistics` | 积分统计 | ✅ |
| GET | `/status` | 用户状态 | ✅ |

### 📡 WebSocket 事件

#### 连接地址
```
ws://localhost:8080/ws?token=<access_token>
```

#### 事件类型
| 事件类型 | 说明 | 数据格式 |
|---------|------|----------|
| `connected` | 连接成功 | `{type: "connected", message: "连接成功"}` |
| `points_update` | 积分变更 | `{type: "points_update", data: {...}}` |
| `stock_update` | 库存变更 | `{type: "stock_update", data: {...}}` |
| `review_result` | 审核结果 | `{type: "review_result", data: {...}}` |
| `ping/pong` | 心跳保活 | `{type: "ping/pong", timestamp: ...}` |

## 🗄️ 数据库设计

### 核心数据表

#### 用户表 (users)
| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| user_id | INT | 用户ID | 主键 |
| mobile | VARCHAR(11) | 手机号 | 唯一索引 |
| total_points | INT | 积分余额 | - |
| nickname | VARCHAR(50) | 用户昵称 | - |
| is_merchant | BOOLEAN | 商家标识 | 索引 |
| status | ENUM | 账户状态 | 索引 |

#### 抽奖配置表 (lottery_settings)
| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| prize_id | INT | 奖品ID | 主键 |
| prize_name | VARCHAR(100) | 奖品名称 | - |
| angle | INT | 转盘角度 | 索引 |
| probability | DECIMAL(5,4) | 中奖概率 | 索引 |
| is_activity | BOOLEAN | 特殊动效 | - |

#### 商品表 (commodity_pool)
| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| commodity_id | INT | 商品ID | 主键 |
| name | VARCHAR(100) | 商品名称 | - |
| category | VARCHAR(50) | 商品分类 | 索引 |
| exchange_points | INT | 兑换积分 | 索引 |
| stock | INT | 库存数量 | 索引 |

## 🧪 测试

### 运行测试
```bash
# 数据库连接测试
node test-db.js

# API功能测试
node test-apis.js

# 单元测试
npm test
```

### 测试覆盖
- ✅ 用户认证流程
- ✅ 抽奖系统功能
- ✅ 商品兑换流程
- ✅ 积分记录查询
- ✅ WebSocket连接（基础）

## 📦 部署

### Docker部署
```bash
# 构建镜像
docker build -t restaurant-points-backend .

# 运行容器
docker run -d \
  --name restaurant-points \
  -p 3000:3000 \
  -p 8080:8080 \
  --env-file .env \
  restaurant-points-backend
```

### 生产环境配置清单
- [ ] 修改JWT密钥
- [ ] 配置生产数据库
- [ ] 启用HTTPS
- [ ] 配置反向代理
- [ ] 设置监控告警
- [ ] 配置日志收集
- [ ] 设置备份策略

## 🔧 开发指南

### 目录结构
```
restaurant-points-backend/
├── config/          # 配置文件
├── models/          # 数据模型
├── routes/          # API路由
├── services/        # 业务服务
├── middleware/      # 中间件
├── utils/           # 工具函数
├── uploads/         # 上传文件
├── logs/            # 日志文件
├── app.js           # 主应用
├── package.json     # 依赖配置
└── README.md        # 项目文档
```

### 代码规范
- 使用ES6+语法
- 统一错误处理
- 完整的注释说明
- 🔴标记前端对接要点

### 日志规范
```javascript
// 信息日志
console.log('✅ 操作成功:', data);

// 错误日志
console.error('❌ 操作失败:', error);

// 调试日志
console.debug('🔧 调试信息:', debug);
```

## 🚨 故障排查

### 常见问题

1. **数据库连接失败**
   - 检查数据库服务状态
   - 验证连接配置
   - 确认网络连通性

2. **JWT Token无效**
   - 检查密钥配置
   - 验证Token格式
   - 确认过期时间

3. **WebSocket连接失败**
   - 检查端口占用
   - 验证Token认证
   - 确认防火墙设置

### 监控指标
- API响应时间 < 500ms
- 数据库查询时间 < 100ms
- WebSocket连接数
- 错误率 < 1%
- 内存使用率 < 80%

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交代码变更
4. 创建 Pull Request

## 📝 更新日志

### v1.0.0 (2024-12-19)
- ✅ 完成核心API开发
- ✅ 数据库设计与实现
- ✅ WebSocket实时通信
- ✅ JWT认证系统
- ✅ 基础测试覆盖

### 待实现功能
- 📸 拍照上传与AI识别
- 👨‍💼 商家管理后台
- 📊 数据统计分析
- 🔔 消息推送系统

## 📞 联系方式

- 项目负责人：[姓名]
- 邮箱：project@restaurant-points.com
- 技术支持：support@restaurant-points.com

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情

---

> 🎉 **恭喜！** 餐厅积分抽奖系统后端服务已完成核心功能开发，所有API测试通过，可以与前端项目进行对接。 