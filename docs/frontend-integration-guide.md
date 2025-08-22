# 🔥 前端集成指南 - 餐厅积分抽奖系统扩展功能

**创建时间**：2025年08月21日  
**后端版本**：V3分离式架构  
**更新说明**：新增连抽系统、多池系统、条件抽奖、收集系统

## 📊 **后端已完成功能**

### ✅ **连抽系统**
- 支持5连抽、10连抽、20连抽
- 连抽折扣机制（5连抽95折、10连抽9折、20连抽8折）
- 批次ID追踪和连抽结果统计
- 保底机制：N次抽奖必中稀有奖品

### ✅ **多池系统**
- 基础池：10积分/次，适合所有用户
- 高级池：50积分/次，银牌及以上用户
- VIP池：200积分/次，金牌及以上用户  
- 新手池：5积分/次，新用户专享

### ✅ **条件抽奖**
- 用户等级限制（bronze/silver/gold/diamond）
- 时间窗口限制（如VIP黄金时段19-22点）
- 行为分数要求
- 频率限制检查

### ✅ **收集系统（基础表结构）**
- collection_albums：收集册表
- collection_fragments：收集碎片表
- user_fragments：用户收集记录表

## 🔌 **新增API接口**

### **1. 连抽系统API**

#### `POST /api/v3/lottery/multiple-draw`
**功能**：执行连抽操作

**请求参数**：
```json
{
  "campaignId": 4,
  "drawCount": 10,
  "options": {
    "autoApplyDiscount": true
  }
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "batch_id": "batch_1755808516234_abc123",
    "results": [
      {
        "draw_id": 123,
        "is_winner": true,
        "prize": {
          "prize_name": "积分奖励",
          "prize_value": 50,
          "rarity": "rare"
        }
      }
    ],
    "summary": {
      "total_draws": 10,
      "prizes_won": 7,
      "win_rate": "70%",
      "total_cost": 450,
      "discount_applied": 50
    }
  }
}
```

### **2. 多池系统API**

#### `GET /api/v3/lottery/pools`
**功能**：获取用户可访问的抽奖池

**响应示例**：
```json
{
  "success": true,
  "data": {
    "available_pools": [
      {
        "campaign_id": 4,
        "campaign_name": "基础池",
        "campaign_type": "pool_basic",
        "cost_per_draw": 10,
        "required_level": "bronze",
        "max_draws_per_user_daily": 50,
        "description": "新手友好的基础抽奖池"
      }
    ],
    "user_access": {
      "current_level": "silver",
      "accessible_pools": ["pool_basic", "pool_advanced"]
    }
  }
}
```

#### `POST /api/v3/lottery/pool-draw`
**功能**：从指定池抽奖

**请求参数**：
```json
{
  "poolId": 4,
  "drawCount": 1
}
```

### **3. 条件抽奖API**

#### `GET /api/v3/lottery/check-permission/{campaignId}`
**功能**：检查用户抽奖权限

**响应示例**：
```json
{
  "success": true,
  "data": {
    "can_draw": true,
    "checks": {
      "level_check": true,
      "time_window": true,
      "frequency_check": true,
      "behavior_score": true
    },
    "restrictions": [],
    "remaining_draws_today": 15
  }
}
```

## 🎨 **前端需要实现的UI组件**

### **1. 连抽界面**

```jsx
// 连抽选择组件
<MultiDrawSelector>
  <DrawOption count={1} price={10} />
  <DrawOption count={5} price={47.5} discount="5%" />
  <DrawOption count={10} price={90} discount="10%" />
  <DrawOption count={20} price={160} discount="20%" />
</MultiDrawSelector>

// 连抽结果展示
<MultiDrawResults>
  <BatchSummary />
  <ResultsList />
  <RarityStatistics />
</MultiDrawResults>
```

### **2. 多池选择界面**

```jsx
// 抽奖池选择
<PoolSelector>
  <PoolCard 
    type="basic" 
    cost={10} 
    accessible={true}
    description="新手友好"
  />
  <PoolCard 
    type="advanced" 
    cost={50} 
    accessible={userLevel >= 'silver'}
    description="高级玩家专享"
  />
  <PoolCard 
    type="vip" 
    cost={200} 
    accessible={userLevel >= 'gold'}
    description="VIP尊享池"
  />
</PoolSelector>
```

### **3. 条件检查UI**

```jsx
// 权限检查展示
<DrawPermissionCheck>
  <LevelRequirement current="silver" required="gold" />
  <TimeWindow current="21:30" required="19:00-22:00" />
  <FrequencyLimit used={8} max={10} />
  <BehaviorScore current={75} required={70} />
</DrawPermissionCheck>
```

## 📱 **前端交互流程**

### **连抽流程**
1. 用户选择抽奖活动
2. 显示连抽选项（1/5/10/20次）
3. 显示折扣价格和优惠信息
4. 用户确认后调用 `POST /api/v3/lottery/multiple-draw`
5. 显示连抽动画效果
6. 展示批次结果和统计信息

### **多池选择流程**  
1. 调用 `GET /api/v3/lottery/pools` 获取可用池
2. 根据用户等级显示可访问的池
3. 显示每个池的特点和奖品预览
4. 用户选择池后调用 `POST /api/v3/lottery/pool-draw`

### **条件检查流程**
1. 进入抽奖页面时调用权限检查API
2. 实时显示用户当前状态vs要求
3. 不满足条件时给出明确提示和建议
4. 动态更新剩余抽奖次数

## 🎯 **重要注意事项**

### **认证要求**
- 所有API都需要用户认证token
- 管理员API需要admin权限验证

### **错误处理**
```javascript
// 标准错误响应格式
{
  "success": false,
  "error": "INSUFFICIENT_POINTS",
  "message": "积分不足",
  "data": {
    "required": 100,
    "current": 50
  }
}
```

### **状态管理建议**
```javascript
// Redux/Zustand状态结构建议
const lotteryState = {
  availablePools: [],
  currentPool: null,
  userPermissions: {},
  multiDrawConfig: {
    selectedCount: 1,
    discountApplied: 0
  },
  drawHistory: []
}
```

## 🔄 **接口对接优先级**

### **高优先级（核心功能）**
1. `GET /api/v3/lottery/pools` - 多池选择
2. `POST /api/v3/lottery/pool-draw` - 池抽奖
3. `POST /api/v3/lottery/multiple-draw` - 连抽

### **中优先级（增强体验）**
1. `GET /api/v3/lottery/check-permission` - 权限检查
2. `GET /api/v3/lottery/campaigns` - 获取活动列表（已扩展）

### **低优先级（未来扩展）**
1. 收集系统相关接口（表结构已建，接口待开发）
2. 高级统计和分析接口

## 🚀 **开发建议**

### **UI/UX建议**
- 连抽动画要有仪式感，突出批次概念
- 多池界面要突出每个池的特色和价值
- 权限检查要友好提示，而非冷冰冰的限制
- 使用进度条显示保底机制的进度

### **性能优化**
- 连抽结果可以逐个展示增加悬念
- 池选择界面可以预加载奖品图片
- 权限检查结果可以缓存避免重复请求

### **数据埋点**
- 连抽选择分布统计
- 不同池的使用偏好
- 权限限制的触发频率

## 📞 **技术对接**

如有疑问请联系后端开发团队：
- API文档：`http://localhost:3000/api/v3/docs`
- 健康检查：`http://localhost:3000/health`
- 测试环境：已配置完整测试数据

**后端准备状态**：✅ 已完成，可以开始前端开发 