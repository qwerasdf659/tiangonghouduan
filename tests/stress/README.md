# 压力测试目录 (tests/stress/)

## 目录结构

```
stress/
├── capacity/           # 容量极限测试
│   ├── capacity-baseline.stress.test.js    # 基线容量测试
│   ├── capacity-extreme.stress.test.js     # 极端容量测试
│   ├── high_concurrency_5000.test.js       # 5000并发测试
│   ├── flash_sale_10000.test.js            # 10000秒杀测试
│   └── ultra_high_concurrency.test.js      # 超高并发测试
│
├── concurrency/        # 并发控制测试
│   ├── concurrency-control.stress.test.js  # 并发控制边界测试
│   ├── concurrent_draw.test.js             # 并发抽奖测试
│   ├── concurrent_lottery.test.js          # 并发抽奖系统测试
│   ├── concurrent_purchase.test.js         # 并发购买测试
│   ├── concurrent_chat_session.test.js     # 并发聊天会话测试
│   └── db-connection-pool.stress.test.js   # 数据库连接池测试
│
├── distributed_lock/   # 分布式锁测试
│   └── distributed_lock_stress.test.js     # 分布式锁压力测试
│
├── load_balance/       # 负载均衡/限流测试
│   ├── rate-limit-validation.stress.test.js    # 限流验证测试
│   └── business-limit-validation.stress.test.js # 业务限制验证测试
│
├── websocket/          # WebSocket压力测试
│   ├── websocket_5000_connections.test.js  # 5000连接测试
│   └── websocket_stability_5000.test.js    # WebSocket稳定性测试
│
├── mixed-workload.stress.test.js   # 混合负载测试
├── mixed_load_scenario.test.js     # 混合场景测试
├── stress_test.test.js             # 综合压力测试
└── stress_test_phase9.test.js      # 阶段九压力测试
```

## 测试分类说明

### 1. 容量极限测试 (capacity/)

验证系统在极端负载下的稳定性和数据一致性：

- 基线容量测试：确定系统正常承载能力
- 极端容量测试：验证系统崩溃边界
- 高并发测试：模拟5000+用户同时操作

### 2. 并发控制测试 (concurrency/)

验证系统并发控制机制的正确性：

- 用户/IP并发限制
- 数据库连接池管理
- 并发操作的数据一致性

### 3. 分布式锁测试 (distributed_lock/)

验证分布式锁在高并发场景下的行为：

- 锁竞争测试
- 锁超时自动释放
- 锁重入支持
- Redis故障降级

### 4. 负载均衡/限流测试 (load_balance/)

验证系统限流和负载均衡机制：

- API限流策略
- 业务规则限制
- 突发流量处理

### 5. WebSocket压力测试 (websocket/)

验证WebSocket服务的高并发稳定性：

- 大量连接同时在线
- 消息推送性能
- 连接稳定性

## 运行指南

```bash
# 运行所有压力测试（谨慎：高负载）
npm test -- tests/stress/ --runInBand

# 运行特定类别的测试
npm test -- tests/stress/capacity/
npm test -- tests/stress/concurrency/

# 运行单个测试文件
npm test -- tests/stress/capacity/high_concurrency_5000.test.js
```

## 注意事项

1. **资源消耗**：压力测试会消耗大量系统资源，建议在非生产环境运行
2. **测试隔离**：测试数据会自动清理，不会污染生产数据
3. **超时设置**：压力测试默认超时时间较长（3-10分钟）
4. **Redis依赖**：部分测试需要Redis服务正常运行

## 测试覆盖场景

| 场景            | 文件                                             | 验收标准     |
| --------------- | ------------------------------------------------ | ------------ |
| 5000并发抽奖    | capacity/high_concurrency_5000.test.js           | 无数据不一致 |
| 10000秒杀       | capacity/flash_sale_10000.test.js                | 只有1人成功  |
| 分布式锁竞争    | distributed_lock/distributed_lock_stress.test.js | 互斥性保证   |
| WebSocket稳定性 | websocket/websocket_stability_5000.test.js       | 连接不中断   |

## 更新日志

- 2026-01-30: 目录结构统一整理（P2-4.1）
