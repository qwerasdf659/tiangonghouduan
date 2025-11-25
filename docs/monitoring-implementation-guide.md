# 监控增强方案实施指南

> **实施日期**：2025年11月24日 北京时间  
> **版本**：v1.0  
> **适用范围**：餐厅积分抽奖系统 V4.0

---

## 📋 快速实施清单

### ✅ 第一阶段：必须实施（30分钟）

#### 1. Redis持久化配置 ⭐⭐⭐⭐⭐

**目的**：确保Redis数据安全，防止数据丢失

**实施步骤**：

```bash
# 方式1：使用自动化脚本（推荐）
npm run monitor:redis

# 方式2：手动配置
redis-cli CONFIG SET appendonly yes
redis-cli CONFIG SET appendfsync everysec
redis-cli CONFIG REWRITE  # 保存配置

# 验证配置
redis-cli CONFIG GET appendonly
redis-cli CONFIG GET appendfsync
```

**配置说明**：
- **RDB**：保持默认（900秒/300秒/60秒自动保存）
- **AOF**：启用，everysec同步模式
- **混合持久化**：如果Redis 4.0+，自动启用

**预期结果**：
```
✅ appendonly: yes
✅ appendfsync: everysec
✅ aof-use-rdb-preamble: yes (Redis 4.0+)
```

**成本**：
- ⏱️ 时间：10-30分钟
- 💰 费用：$0
- 📝 维护：无需维护

---

#### 2. 增强健康检查端点 ⭐⭐⭐⭐

**目的**：添加连接池状态监控，提升系统可见性

**实施步骤**：

```bash
# 1. 备份原文件
cp app.js app.js.backup

# 2. 编辑 app.js，找到 /health 端点（约207行）
# 在healthData.data中添加连接池状态
```

**代码修改**：

```javascript
// app.js - 修改 /health 端点
app.get('/health', async (req, res) => {
  // ... 现有代码 ...

  // 🆕 添加连接池状态
  const pool = sequelize.connectionManager.pool
  const poolStatus = {
    active: pool.using,      // 使用中连接数
    idle: pool.available,    // 空闲连接数
    total: pool.size,        // 总连接数
    max: pool.max,           // 最大连接数
    waiting: pool.waiting    // 等待中连接数
  }

  const healthData = {
    // ... 现有字段 ...
    data: {
      // ... 现有字段 ...
      pool: poolStatus  // 🆕 添加连接池状态
    }
  }

  res.json(healthData)
})
```

**验证**：

```bash
# 重启服务
pm2 restart restaurant-lottery-backend

# 验证健康检查
curl http://localhost:3000/health | jq '.data.pool'

# 预期输出
{
  "active": 2,
  "idle": 38,
  "total": 40,
  "max": 40,
  "waiting": 0
}
```

**成本**：
- ⏱️ 时间：5-10分钟
- 💰 费用：$0
- 📝 维护：极低

---

### 🟡 第二阶段：建议实施（2-4小时）

#### 3. 数据库连接池监控 ⭐⭐⭐⭐

**目的**：实时监控连接池状态，预警连接池问题

**使用方式**：

```bash
# 单次检查
npm run monitor:pool:once

# 持续监控（60秒间隔）
npm run monitor:pool

# 自定义配置
node scripts/monitoring/pool-monitor.js --interval=30 --active-threshold=0.85

# PM2持久化管理
pm2 start scripts/monitoring/pool-monitor.js --name pool-monitor
pm2 save
```

**监控输出示例**：

```
📊 [2025-11-24 18:00:00] 连接池状态监控
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔹 连接池状态:
   总连接: 40/40 (配置: 5-40)
   使用中: 32 (80.0%)
   空闲:   8 (20.0%)
   等待:   0
   利用率: 80.0%

⚠️ 告警信息:
   🟡 [WARNING] 连接池使用率过高: 80.0% (阈值: 80%)
      💡 建议: 考虑增加连接池最大连接数或优化数据库查询
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**配置选项**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--interval` | 60 | 检查间隔（秒） |
| `--active-threshold` | 0.8 | 活跃连接告警阈值（80%） |
| `--waiting-threshold` | 5 | 等待连接告警阈值 |
| `--history` | false | 启用历史记录 |

**成本**：
- ⏱️ 时间：已完成（直接使用）
- 💰 费用：$0
- 📝 维护：极低

---

#### 4. 轻量级系统监控 ⭐⭐⭐

**目的**：全面监控系统健康状态（数据库、Redis、内存、磁盘）

**使用方式**：

```bash
# 单次检查
npm run monitor:system:once

# 持续监控（5分钟间隔）
npm run monitor:system

# 自定义配置
node scripts/monitoring/lightweight-monitor.js --interval=300 --memory-threshold=85

# PM2持久化管理
pm2 start scripts/monitoring/lightweight-monitor.js --name system-monitor
pm2 save
```

**监控输出示例**：

```
✅ [2025-11-24 18:05:00] 系统健康检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 总体状态: HEALTHY

✅ DATABASE: 数据库连接正常
   responseTime: 15ms

✅ REDIS: Redis连接正常

✅ MEMORY: 内存使用正常: 65.3%
   heapUsed: 66MB
   heapTotal: 101MB
   rss: 133MB

✅ DISK: 磁盘使用正常: 35%
   size: 50G
   used: 17G
   available: 30G
   usage: 35%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**告警通知配置**：

```bash
# 配置钉钉/企业微信Webhook
export ALERT_WEBHOOK_URL="https://oapi.dingtalk.com/robot/send?access_token=xxx"

# 或者在 .env 文件中添加
ALERT_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx

# 重启监控
pm2 restart system-monitor
```

**配置选项**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--interval` | 300 | 检查间隔（秒） |
| `--memory-threshold` | 90 | 内存告警阈值（%） |
| `--disk-threshold` | 90 | 磁盘告警阈值（%） |
| `--no-disk` | false | 禁用磁盘检查 |
| `--slow-query` | false | 启用慢查询检查 |

**成本**：
- ⏱️ 时间：已完成（直接使用）
- 💰 费用：$0
- 📝 维护：极低

---

## 🚀 完整实施流程

### 第1步：Redis持久化（10分钟）

```bash
# 1. 执行配置脚本
cd /home/devbox/project
npm run monitor:redis

# 2. 选择 "2) 配置生产环境持久化（RDB + AOF）"
# 3. 选择 "y" 保存配置
# 4. 选择 "4) 验证配置"

# 验证成功标志
✅ AOF持久化：已启用
✅ RDB快照：已启用
```

### 第2步：增强健康检查（10分钟）

```bash
# 1. 备份文件
cp app.js app.js.backup

# 2. 编辑 app.js（第207行附近）
# 添加连接池状态代码（参考上面的代码示例）

# 3. 重启服务
pm2 restart restaurant-lottery-backend

# 4. 验证
curl http://localhost:3000/health | jq '.data.pool'
```

### 第3步：启动连接池监控（5分钟）

```bash
# 1. 单次检查验证
npm run monitor:pool:once

# 2. 使用PM2持久化管理
pm2 start scripts/monitoring/pool-monitor.js --name pool-monitor
pm2 save

# 3. 查看状态
pm2 status
pm2 logs pool-monitor
```

### 第4步：启动系统监控（5分钟）

```bash
# 1. 单次检查验证
npm run monitor:system:once

# 2. 配置告警Webhook（可选）
echo 'ALERT_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx' >> .env

# 3. 使用PM2持久化管理
pm2 start scripts/monitoring/lightweight-monitor.js --name system-monitor
pm2 save

# 4. 查看状态
pm2 status
pm2 logs system-monitor
```

### 第5步：验证所有监控（5分钟）

```bash
# 1. 查看PM2状态
pm2 status

# 预期输出：
# restaurant-lottery-backend  online
# pool-monitor                online
# system-monitor              online

# 2. 查看监控日志
pm2 logs pool-monitor --lines 20
pm2 logs system-monitor --lines 20

# 3. 测试健康检查
curl http://localhost:3000/health | jq

# 4. 查看Redis持久化状态
redis-cli INFO persistence
```

---

## 📊 监控仪表板

### 查看所有监控状态

```bash
#!/bin/bash
# scripts/monitoring/check-all-monitors.sh

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 监控系统状态检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. 应用健康检查
echo ""
echo "1️⃣ 应用健康检查:"
curl -s http://localhost:3000/health | jq -r '"状态: \(.data.status) | 数据库: \(.data.systems.database) | Redis: \(.data.systems.redis) | 连接池: \(.data.pool.active)/\(.data.pool.max)"'

# 2. Redis持久化状态
echo ""
echo "2️⃣ Redis持久化状态:"
redis-cli INFO persistence | grep -E "aof_enabled|rdb_last_save_time|aof_last_rewrite_time_sec"

# 3. PM2进程状态
echo ""
echo "3️⃣ PM2进程状态:"
pm2 status

# 4. 监控脚本状态
echo ""
echo "4️⃣ 监控脚本状态:"
pm2 ls | grep -E "pool-monitor|system-monitor"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

---

## ⚙️ 配置调优建议

### 生产环境配置

```javascript
// config/database.js - 连接池配置
pool: {
  max: 40,        // 根据并发需求调整（建议20-50）
  min: 5,         // 最小连接数
  acquire: 30000, // 获取连接超时
  idle: 180000,   // 空闲连接3分钟
  evict: 60000    // 清理间隔1分钟
}
```

```conf
# Redis配置 - /etc/redis/redis.conf
# RDB
save 900 1
save 300 10
save 60 10000

# AOF
appendonly yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# 混合持久化（Redis 4.0+）
aof-use-rdb-preamble yes
```

### 监控告警阈值调整

```javascript
// 连接池监控
activeRatioThreshold: 0.8    // 80%使用率告警
waitingCountThreshold: 5     // 5个等待连接告警

// 系统监控
memoryThreshold: 90          // 90%内存使用告警
diskThreshold: 90            // 90%磁盘使用告警
checkInterval: 300000        // 5分钟检查间隔
```

---

## 🔧 故障排查

### 问题1：Redis持久化配置失败

**症状**：`CONFIG REWRITE` 提示权限错误

**解决方案**：
```bash
# 方式1：使用sudo
sudo redis-cli CONFIG REWRITE

# 方式2：手动编辑配置文件
sudo vim /etc/redis/redis.conf
# 修改后重启
sudo systemctl restart redis-server
```

### 问题2：监控脚本启动失败

**症状**：`pm2 start` 失败

**解决方案**：
```bash
# 1. 检查脚本语法
node scripts/monitoring/pool-monitor.js --once

# 2. 查看详细错误
pm2 logs pool-monitor --err

# 3. 重启PM2
pm2 delete all
pm2 start ecosystem.config.js
pm2 start scripts/monitoring/pool-monitor.js --name pool-monitor
```

### 问题3：告警通知未收到

**症状**：监控正常但没有告警通知

**解决方案**：
```bash
# 1. 检查Webhook配置
echo $ALERT_WEBHOOK_URL

# 2. 测试Webhook
curl -X POST $ALERT_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"msgtype":"text","text":{"content":"测试告警"}}'

# 3. 检查网络连接
ping oapi.dingtalk.com

# 4. 查看监控日志
pm2 logs system-monitor | grep "告警"
```

---

## 📚 参考文档

### 官方文档
- [Redis持久化](https://redis.io/docs/management/persistence/)
- [Sequelize连接池](https://sequelize.org/docs/v6/other-topics/connection-pool/)
- [PM2文档](https://pm2.keymetrics.io/docs/usage/quick-start/)

### 项目文档
- [监控方案多维度分析](./monitoring-strategy-analysis.md)
- [开发规范总则](../.cursor/rules/00-开发规范总则.mdc)
- [服务进程管理系统](../.cursor/rules/03-服务进程管理系统.mdc)

---

**实施完成**✅

**下次审核**：建议3个月后根据业务发展重新评估监控方案

