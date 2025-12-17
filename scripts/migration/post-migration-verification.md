# 背包双轨架构迁移 - 迁移后验证检查清单

**执行时间**：迁移脚本完成后立即执行  
**预计耗时**：15-20分钟  
**目标**：确认迁移成功，系统正常运行

---

## ✅ **第一部分：数据库验证（5分钟）**

### 1.1 检查表重命名

```bash
# 应该看到 _deprecated_user_inventory_YYYYMMDD 表
mysql -u root -p'Aa112211' restaurant_lottery -e "SHOW TABLES LIKE '%inventory%';"
```

**预期结果**：

- ✅ 存在 `_deprecated_user_inventory_20251217` 表
- ✅ **不存在** `user_inventory` 表（已重命名）
- ✅ 存在 `item_instances` 表
- ✅ 存在 `redemption_orders` 表

---

### 1.2 检查数据迁移完整性

```bash
# 检查记录数量
mysql -u root -p'Aa112211' restaurant_lottery -e "
SELECT
    '原始记录(deprecated)' AS 表名, COUNT(*) AS 记录数 FROM _deprecated_user_inventory_20251217
UNION ALL
SELECT '物品实例(item_instances)', COUNT(*) FROM item_instances
UNION ALL
SELECT '资产余额(account_asset_balances)', COUNT(*) FROM account_asset_balances
UNION ALL
SELECT '兑换订单(redemption_orders)', COUNT(*) FROM redemption_orders;
"
```

**预期结果**：

- ✅ `_deprecated_user_inventory_*` 记录数 ≈ `item_instances` + `account_asset_balances` 记录数
- ✅ `redemption_orders` 记录数 ≥ 0（如果有旧码才会生成）

---

### 1.3 检查旧码失效情况

```bash
# 应该全部返回 NULL
mysql -u root -p'Aa112211' restaurant_lottery -e "
SELECT
    COUNT(*) AS 总记录数,
    SUM(CASE WHEN verification_code IS NULL THEN 1 ELSE 0 END) AS 旧码已失效,
    SUM(CASE WHEN verification_code IS NOT NULL THEN 1 ELSE 0 END) AS 旧码仍存在
FROM _deprecated_user_inventory_20251217;
"
```

**预期结果**：

- ✅ `旧码已失效` = `总记录数`（100%失效）
- ✅ `旧码仍存在` = 0

---

### 1.4 检查新码生成情况

```bash
# 检查新12位Base32码
mysql -u root -p'Aa112211' restaurant_lottery -e "
SELECT
    order_id,
    LEFT(code_hash, 16) AS 码哈希前缀,
    status AS 状态,
    DATE_FORMAT(expires_at, '%Y-%m-%d %H:%i:%s') AS 过期时间
FROM redemption_orders
ORDER BY created_at DESC
LIMIT 10;
"
```

**预期结果**：

- ✅ `code_hash` 是64位SHA-256哈希（不是明文）
- ✅ `status` 主要是 `pending`（未核销）
- ✅ `expires_at` 是30天后的时间

---

## ✅ **第二部分：服务状态验证（3分钟）**

### 2.1 检查后端服务运行状态

```bash
# PM2状态
pm2 status

# 健康检查
curl http://localhost:3000/health
```

**预期结果**：

- ✅ PM2显示服务状态为 `online`
- ✅ 健康检查返回 `{"status":"healthy"}`

---

### 2.2 检查进程无冲突

```bash
# 应该只有1个Node.js进程
ps aux | grep -E "(node.*app\.js|npm.*dev)" | grep -v grep
```

**预期结果**：

- ✅ 只显示**1个**Node.js进程

---

## ✅ **第三部分：API接口验证（5分钟）**

### 3.1 测试旧背包接口（应返回410）

```bash
# 应该返回 410 Gone
curl -i http://localhost:3000/api/v4/inventory/user/1
```

**预期结果**：

```
HTTP/1.1 410 Gone
{
  "error": "ENDPOINT_DEPRECATED",
  "message": "此接口已废弃，请使用新的背包接口",
  "new_endpoint": "/api/v4/backpack/user/:user_id"
}
```

---

### 3.2 测试新背包接口（应正常工作）

```bash
# 需要JWT token，这里测试401也算正常
curl -i http://localhost:3000/api/v4/backpack/user/1
```

**预期结果**：

- ✅ 返回 `401 Unauthorized`（未登录）或 `200 OK`（如果有token）
- ❌ **不应该返回** `404 Not Found` 或 `500 Internal Server Error`

---

### 3.3 测试新兑换码接口（应正常工作）

```bash
# 测试兑换订单创建接口
curl -i http://localhost:3000/api/v4/redemption/orders
```

**预期结果**：

- ✅ 返回 `401 Unauthorized`（未登录）或 `405 Method Not Allowed`（GET请求）
- ❌ **不应该返回** `404 Not Found` 或 `500 Internal Server Error`

---

## ✅ **第四部分：代码层验证（5分钟）**

### 4.1 测试旧码生成方法（应抛出异常）

```javascript
// 在Node.js REPL中测试
const InventoryService = require('./services/InventoryService')

// 应该抛出异常
try {
  await InventoryService.generateVerificationCode(1, 1)
} catch (error) {
  console.log('✅ 旧码生成已禁用:', error.message)
}
```

**预期结果**：

- ✅ 抛出异常，提示 "此方法已完全废弃（方案A - 一刀切）"

---

### 4.2 测试旧码核销方法（应抛出异常）

```javascript
const InventoryService = require('./services/InventoryService')

// 应该抛出异常
try {
  await InventoryService.verifyCode(1, 'A1B2C3D4')
} catch (error) {
  console.log('✅ 旧码核销已禁用:', error.message)
}
```

**预期结果**：

- ✅ 抛出异常，提示 "此方法已完全废弃（方案A - 一刀切）"

---

### 4.3 测试 UserInventory 模型方法（应抛出异常）

```javascript
const { UserInventory } = require('./models')

// 应该抛出异常
try {
  const item = await UserInventory.findByPk(1)
  if (item) {
    await item.generateVerificationCode()
  }
} catch (error) {
  console.log('✅ UserInventory旧方法已禁用:', error.message)
}
```

**预期结果**：

- ✅ 抛出异常，提示 "UserInventory.generateVerificationCode() 已完全废弃"

---

## ✅ **第五部分：日志检查（2分钟）**

### 5.1 检查迁移日志

```bash
# 查看迁移日志
tail -n 100 /home/devbox/project/logs/migration-*.log | grep -E "(✅|❌|⚠️)"
```

**预期结果**：

- ✅ 看到 "🎉 迁移成功完成！"
- ✅ 看到 "对账验证通过：数据一致性100%"
- ❌ **不应该看到** "❌" 错误标记

---

### 5.2 检查应用日志

```bash
# 查看PM2日志
pm2 logs --lines 50 | grep -E "(ERROR|WARN|deprecated)"
```

**预期结果**：

- ✅ 看到 "访问已废弃的旧背包接口" 警告（如果有访问）
- ✅ 看到 "尝试调用已废弃的旧码生成方法" 错误（如果有调用）
- ❌ **不应该看到** `TypeError` 或 `ReferenceError`

---

## ✅ **第六部分：对账脚本再次验证（5分钟）**

### 6.1 执行对账脚本

```bash
cd /home/devbox/project
node scripts/reconcile-inventory-migration.js
```

**预期结果**：

```
✅ 对账验证通过

对账结果：
- 原始记录数：100
- 迁移后item_instances：80
- 迁移后asset_balances：20
- 数据一致性：100%
```

---

## 📋 **验收通过标准**

### 必须全部满足以下条件：

1. ✅ **数据库验证**
   - [ ] `user_inventory` 表已重命名为 `_deprecated_*`
   - [ ] 所有旧码 `verification_code` 已失效（NULL）
   - [ ] `item_instances` 和 `account_asset_balances` 记录数正确
   - [ ] `redemption_orders` 新码哈希存储（64位SHA-256）

2. ✅ **服务状态**
   - [ ] 后端服务健康（PM2 online + 健康检查通过）
   - [ ] 只有1个Node.js进程运行
   - [ ] 无端口冲突

3. ✅ **API接口**
   - [ ] 旧背包接口 `/api/v4/inventory/user/:id` 返回 `410 Gone`
   - [ ] 新背包接口 `/api/v4/backpack/user/:id` 正常工作
   - [ ] 新兑换接口 `/api/v4/redemption/*` 正常工作

4. ✅ **代码层**
   - [ ] `InventoryService.generateVerificationCode()` 抛出异常
   - [ ] `InventoryService.verifyCode()` 抛出异常
   - [ ] `UserInventory.prototype.generateVerificationCode()` 抛出异常

5. ✅ **对账验证**
   - [ ] 对账脚本验证通过，数据一致性100%

---

## 🚨 **如果验收失败怎么办？**

### 立即执行回滚：

```bash
cd /home/devbox/project

# 1. 停止服务
pm2 stop all

# 2. 恢复数据库备份
mysql -u root -p'Aa112211' restaurant_lottery < /home/devbox/project/backups/migration-YYYYMMDD_HHMMSS/database_backup.sql

# 3. 恢复代码文件
cp /home/devbox/project/backups/migration-YYYYMMDD_HHMMSS/InventoryService.js /home/devbox/project/services/
cp /home/devbox/project/backups/migration-YYYYMMDD_HHMMSS/UserInventory.js /home/devbox/project/models/
cp /home/devbox/project/backups/migration-YYYYMMDD_HHMMSS/inventory-core.js /home/devbox/project/routes/v4/unified-engine/

# 4. 重启服务
pm2 restart all
```

---

## 📞 **紧急联系信息**

- **备份目录**：`/home/devbox/project/backups/migration-*`
- **日志文件**：`/home/devbox/project/logs/migration-*.log`
- **迁移脚本**：`/home/devbox/project/scripts/migration/execute-midnight-migration.sh`
- **对账脚本**：`/home/devbox/project/scripts/reconcile-inventory-migration.js`

---

## ✅ **验收完成后操作**

1. **通知前端团队**：更新背包接口调用路径
2. **通知商家端**：更新扫码核销接口（新12位Base32码）
3. **监控系统**：持续监控24-48小时
4. **删除旧表**：30天后确认无问题，删除 `_deprecated_user_inventory_*` 表
5. **更新文档**：更新API文档和开发者指南

---

**验收人签字**：********\_********  
**验收时间**：********\_********  
**验收结果**：□ 通过 □ 失败（需回滚）
