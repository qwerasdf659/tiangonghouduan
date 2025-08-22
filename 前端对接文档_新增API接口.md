# 餐厅积分抽奖系统 V3.0 - 新增API接口对接文档

**文档版本**: v1.0  
**创建时间**: 2025年01月21日 23:35 UTC  
**对接说明**: 后端已完成Phase 1 API开发，前端需要对接以下新增接口  

---

## 🔥 **新增API接口总览**

### 1. **VIP系统API** - `/api/v3/vip/*`

| 接口 | 方法 | 功能 | 权限 |
|-----|------|------|------|
| `/api/v3/vip/status` | GET | 获取当前用户VIP状态 | 用户 |
| `/api/v3/vip/upgrade` | POST | 检查并执行VIP升级 | 用户 |
| `/api/v3/vip/benefits` | GET | 获取VIP权益详情 | 用户 |
| `/api/v3/vip/check-access` | POST | 检查VIP权限 | 用户 |
| `/api/v3/vip/daily-bonus` | POST | 领取VIP每日奖励 | 用户 |
| `/api/v3/vip/apply-discount` | POST | 应用VIP折扣 | 用户 |
| `/api/v3/vip/history/:userId` | GET | VIP历史记录 | 管理员 |

### 2. **动态概率系统API** - `/api/v3/probability/*`

| 接口 | 方法 | 功能 | 权限 |
|-----|------|------|------|
| `/api/v3/probability/system/stats/:campaignId` | GET | 系统概率统计 | 管理员 |
| `/api/v3/probability/calculate` | POST | 计算动态概率 | 用户 |
| `/api/v3/probability/history/:campaignId` | GET | 概率调整历史 | 管理员 |
| `/api/v3/probability/analysis/:campaignId` | GET | 概率有效性分析 | 管理员 |
| `/api/v3/probability/optimize/:campaignId` | POST | 优化概率参数 | 管理员 |
| `/api/v3/probability/time-patterns` | GET | 时间模式数据 | 管理员 |
| `/api/v3/probability/market-demand/:campaignId` | GET | 市场需求分析 | 管理员 |
| `/api/v3/probability/user/:userId/factor` | GET | 用户概率因子 | 管理员 |

### 3. **收集系统API** - `/api/v3/collection/*`

| 接口 | 方法 | 功能 | 权限 |
|-----|------|------|------|
| `/api/v3/collection/user/:userId/progress` | GET | 获取收集进度 | 用户 |
| `/api/v3/collection/fragments/add` | POST | 添加收集品碎片 | 用户 |
| `/api/v3/collection/fragments/combine` | POST | 合成收集品 | 用户 |
| `/api/v3/collection/items/:itemId/details` | GET | 收集品详情 | 用户 |
| `/api/v3/collection/sets` | GET | 收集套装信息 | 用户 |
| `/api/v3/collection/catalog` | GET | 收集品图鉴 | 用户 |
| `/api/v3/collection/user/:userId/level` | GET | 收集等级 | 用户 |
| `/api/v3/collection/admin/add-item` | POST | 管理员添加收集品 | 管理员 |

### 4. **多池系统扩展API** - `/api/v3/lottery/pools/*` (扩展)

| 接口 | 方法 | 功能 | 权限 |
|-----|------|------|------|
| `/api/v3/lottery/pools/:poolId/campaigns` | GET | 池子专属活动 | 用户 |
| `/api/v3/lottery/pools/statistics` | GET | 多池统计数据 | 管理员 |
| `/api/v3/lottery/pools/:poolId/access` | POST | 检查池子权限 | 用户 |
| `/api/v3/lottery/pools/:poolId/user-stats` | GET | 用户池子统计 | 用户 |

---

## 🔧 **API调用示例**

### VIP状态查询
```javascript
// GET /api/v3/vip/status
fetch('/api/v3/vip/status', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(res => res.json())
.then(data => {
  console.log('VIP状态:', data.data)
  // 返回数据包含: currentLevel, levelName, benefits, stats, upgrade
})
```

### 收集品合成
```javascript
// POST /api/v3/collection/fragments/combine
fetch('/api/v3/collection/fragments/combine', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    itemId: 12345
  })
})
.then(res => res.json())
.then(data => {
  if (data.success) {
    console.log('合成成功:', data.data.itemName)
  }
})
```

### 动态概率计算
```javascript
// POST /api/v3/probability/calculate
fetch('/api/v3/probability/calculate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    campaignId: 123,
    baseProbability: 0.1
  })
})
.then(res => res.json())
.then(data => {
  console.log('调整后概率:', data.data.adjustedProbability)
})
```

---

## 📝 **接口参数说明**

### 通用参数
- **Authorization**: Bearer token (所有接口都需要)
- **Content-Type**: application/json (POST接口)

### VIP系统参数
- `targetLevel`: VIP目标等级 (1-3)
- `accessType`: 权限类型字符串
- `originalCost`: 原始费用 (数字)
- `discountType`: 折扣类型 (可选)

### 收集系统参数
- `itemId`: 收集品ID (数字)
- `quantity`: 数量 (数字, >= 1)
- `source`: 来源 (字符串, 可选)
- `category`: 分类筛选 (可选)
- `rarity`: 稀有度筛选 (可选)

### 概率系统参数
- `campaignId`: 活动ID (数字)
- `baseProbability`: 基础概率 (0-1之间的数字)
- `days`: 历史天数 (数字, 默认7)
- `poolType`: 池类型筛选 (可选)
- `period`: 统计周期 (默认7d)

---

## 🚨 **错误处理**

### 通用错误码
- `401`: 未授权 - token无效或过期
- `403`: 权限不足 - 管理员接口需要管理员权限
- `404`: 资源不存在 - 用户、物品、活动不存在
- `400`: 参数错误 - 请求参数不合法
- `500`: 服务器错误 - 后端内部错误

### 业务错误码
- `VIP_STATUS_ERROR`: VIP状态查询失败
- `COLLECTION_PROGRESS_ERROR`: 收集进度查询失败
- `PROBABILITY_CALCULATION_ERROR`: 概率计算失败
- `POOL_ACCESS_CHECK_ERROR`: 池子权限检查失败

### 错误响应格式
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "错误描述信息",
  "timestamp": "2025-01-21T23:35:00.000Z"
}
```

---

## 🔗 **相关接口依赖**

### 前置依赖接口
1. **用户认证**: `/api/v3/auth/login` - 获取token
2. **用户信息**: `/api/v3/auth/profile` - 获取用户基础信息
3. **抽奖活动**: `/api/v3/lottery/campaigns` - 获取活动列表

### 数据流向
1. 用户登录 → 获取VIP状态 → 显示VIP权益
2. 抽奖完成 → 自动添加收集品碎片 → 检查是否可合成
3. 活动开始前 → 计算动态概率 → 应用VIP折扣 → 执行抽奖

---

## 📋 **前端开发建议**

### 页面布局建议
1. **VIP中心页面**: 显示VIP状态、权益、升级进度
2. **收集图鉴页面**: 展示收集品、套装、合成功能
3. **管理后台**: 概率分析、统计数据、系统监控

### 状态管理建议
1. **VIP状态缓存**: 用户VIP信息可缓存5分钟
2. **收集进度更新**: 抽奖后实时更新收集进度
3. **权限检查**: 进入特殊功能前检查VIP权限

### 用户体验建议
1. **加载状态**: 所有API调用显示加载动画
2. **错误提示**: 友好的错误信息显示
3. **成功反馈**: 操作成功的视觉反馈

---

## ✅ **开发验证清单**

- [ ] VIP状态查询和显示
- [ ] VIP升级流程和权益展示
- [ ] 收集品图鉴和进度显示
- [ ] 收集品合成功能
- [ ] 多池抽奖功能扩展
- [ ] 管理员概率分析页面
- [ ] 错误处理和用户反馈
- [ ] 权限控制和路由守卫

---

**注意**: 所有新增API都已在后端完成开发和测试，可以直接开始前端对接开发。如有疑问，请联系后端开发团队。 