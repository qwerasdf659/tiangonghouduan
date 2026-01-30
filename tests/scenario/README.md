# 场景测试目录 (tests/scenario/)

## 目录结构

```
scenario/
├── market/             # 市场交易场景
│   ├── cross-user-interaction.test.js  # 跨用户交互场景
│   ├── listing-lifecycle.test.js       # 挂牌生命周期场景
│   └── order-lifecycle.test.js         # 订单生命周期场景
│
├── lottery/            # 抽奖场景
│   ├── campaign_lifecycle.test.js      # 活动生命周期
│   ├── guarantee_mechanism.test.js     # 保底机制
│   ├── pity_full_chain.test.js         # Pity系统全链路
│   └── points_lottery_chain.test.js    # 积分抽奖链路
│
├── asset/              # 资产场景
│   ├── balance_boundary.test.js        # 余额边界测试
│   └── multi_currency_fee.test.js      # 多货币费用场景
│
├── auth/               # 认证场景
│   ├── multi_device_session.test.js    # 多设备会话场景
│   └── user_abuse_scenarios.test.js    # 用户滥用场景
│
├── backpack/           # 背包场景
│   ├── backpack-redemption.test.js         # 背包兑换场景
│   └── redemption-fixes-validation.test.js # 兑换修复验证
│
└── trade/              # 交易场景
    ├── fee_calculation.test.js         # 费用计算场景
    ├── full_trade_flow.test.js         # 完整交易流程
    ├── fungible-asset-listing.test.js  # 同质化资产挂牌
    └── order_cancel_refund.test.js     # 订单取消退款
```

## 场景测试设计原则

### 1. 业务驱动

每个场景测试都围绕真实业务流程设计，验证用户关心的功能：

- 完整的业务链路
- 跨角色交互
- 生命周期状态转换

### 2. 端到端验证

场景测试覆盖从用户操作到数据持久化的完整链路：

- API调用
- 服务层处理
- 数据库变更
- 状态一致性

### 3. 异常场景覆盖

除了正常流程，还覆盖各种异常场景：

- 边界条件
- 并发冲突
- 错误恢复

## 模块说明

### market/ - 市场交易场景

验证市场交易的完整业务流程：

- 挂牌创建、修改、下架
- 订单创建、支付、完成
- 买卖双方资产变动

### lottery/ - 抽奖场景

验证抽奖系统的核心功能：

- 活动创建与管理
- 抽奖概率与保底
- 奖品发放与核销

### asset/ - 资产场景

验证资产操作的正确性：

- 余额变动的原子性
- 多币种转换
- 冻结/解冻逻辑

### auth/ - 认证场景

验证认证授权相关功能：

- 多设备登录管理
- 会话过期处理
- 防滥用机制

### backpack/ - 背包场景

验证背包系统功能：

- 道具获取与使用
- 兑换码生成与核销
- 库存管理

### trade/ - 交易场景

验证交易核心流程：

- 费用计算规则
- 订单状态流转
- 退款处理

## 运行指南

```bash
# 运行所有场景测试
npm test -- tests/scenario/ --runInBand

# 运行特定业务模块的场景测试
npm test -- tests/scenario/market/
npm test -- tests/scenario/lottery/
npm test -- tests/scenario/trade/

# 运行单个场景测试
npm test -- tests/scenario/market/listing-lifecycle.test.js
```

## 与其他测试的关系

| 测试类型 | 目录               | 关注点            |
| -------- | ------------------ | ----------------- |
| 单元测试 | tests/unit/        | 单个函数/方法     |
| 场景测试 | tests/scenario/    | 业务流程/用户故事 |
| 集成测试 | tests/integration/ | 模块间交互        |
| 压力测试 | tests/stress/      | 性能/并发         |
| 回归测试 | tests/regression/  | 缺陷修复验证      |

## 更新日志

- 2026-01-30: 目录结构按业务模块组织（P2-4.2）
