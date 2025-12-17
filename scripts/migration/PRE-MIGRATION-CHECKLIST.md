# 今晚迁移前最终检查清单

**执行时间**：今晚睡觉前（建议23:00-23:30完成）  
**预计耗时**：5分钟  
**目标**：确保迁移脚本可以正常执行

---

## ✅ **第一部分：代码提交验证（1分钟）**

### 1.1 检查Git提交状态

```bash
cd /home/devbox/project
git status
```

**预期结果**：

- ✅ 显示 "nothing to commit, working tree clean"（所有修改已提交）
- ✅ 或显示只有未跟踪的日志文件/备份文件

---

### 1.2 检查已修改的关键文件

```bash
git log --oneline -5 --name-only
```

**预期结果**：应该看到今天提交的以下文件：

- ✅ `routes/v4/unified-engine/inventory-core.js`
- ✅ `services/InventoryService.js`
- ✅ `models/UserInventory.js`

---

## ✅ **第二部分：迁移脚本验证（2分钟）**

### 2.1 检查迁移脚本存在且有执行权限

```bash
cd /home/devbox/project
ls -lh scripts/migration/*.sh scripts/migration/*.md
```

**预期结果**：

```
-rwxr-xr-x ... execute-midnight-migration.sh    （主迁移脚本，有x执行权限）
-rwxr-xr-x ... quick-backup.sh                 （备份脚本，有x执行权限）
-rwxr-xr-x ... EXECUTE-TONIGHT.sh              （今晚启动脚本，有x执行权限）
-rw-r--r-- ... post-migration-verification.md  （验收清单）
-rw-r--r-- ... PRE-MIGRATION-CHECKLIST.md     （本文件）
```

---

### 2.2 检查历史迁移脚本存在

```bash
ls -lh scripts/*.js scripts/migration/*.js 2>/dev/null | grep -E "(migrate-user-inventory|reconcile|invalidate)"
```

**预期结果**：应该看到：

- ✅ `scripts/migrate-user-inventory-to-dual-track.js`（数据迁移脚本）
- ✅ `scripts/reconcile-inventory-migration.js`（对账脚本）
- ✅ `scripts/migration/invalidate-old-codes.js`（旧码失效脚本）

---

### 2.3 检查数据库迁移文件

```bash
ls -lh migrations/*rename-user-inventory* 2>/dev/null
```

**预期结果**：

- ✅ 存在 `migrations/20251217160809-rename-user-inventory-to-deprecated.js`

---

## ✅ **第三部分：服务状态验证（1分钟）**

### 3.1 检查后端服务运行正常

```bash
pm2 status
curl http://localhost:3000/health
```

**预期结果**：

- ✅ PM2显示服务状态为 `online`
- ✅ 健康检查返回 `{"status":"healthy"}`

---

### 3.2 检查磁盘空间充足

```bash
df -h /home/devbox
```

**预期结果**：

- ✅ 可用空间 > 1GB（备份需要约500MB）

---

### 3.3 检查数据库连接正常

```bash
mysql -u root -p'Aa112211' restaurant_lottery -e "SELECT COUNT(*) as 用户总数 FROM users; SELECT COUNT(*) as 库存记录数 FROM user_inventory;" 2>/dev/null
```

**预期结果**：

- ✅ 显示用户总数和库存记录数（不报错）

---

## ✅ **第四部分：备份目录准备（1分钟）**

### 4.1 创建备份目录

```bash
mkdir -p /home/devbox/project/backups
mkdir -p /home/devbox/project/logs
ls -ld /home/devbox/project/backups /home/devbox/project/logs
```

**预期结果**：

- ✅ 两个目录都存在且有写权限

---

### 4.2 可选：提前手动备份一次（保险措施）

```bash
cd /home/devbox/project
./scripts/migration/quick-backup.sh
```

**预期结果**：

- ✅ 显示 "🎉 备份完成！"
- ✅ 备份目录大小约 10-50MB

---

## 🚀 **第五部分：设置今晚自动执行（3种方案选1）**

### **方案1：后台自动等待执行（最简单，推荐）**

```bash
cd /home/devbox/project
nohup ./scripts/migration/EXECUTE-TONIGHT.sh > /tmp/migration-wait.log 2>&1 &
echo $! > /tmp/migration-pid.txt
```

**说明**：

- ✅ 脚本会在后台运行，自动等到凌晨2:00执行迁移
- ✅ 即使你退出SSH也不会中断
- ✅ 可以通过 `tail -f /tmp/migration-wait.log` 查看等待状态

**验证是否启动成功**：

```bash
ps aux | grep EXECUTE-TONIGHT | grep -v grep
```

应该看到脚本进程在运行。

---

### **方案2：使用 `at` 命令定时执行（如果系统支持）**

```bash
# 检查是否支持at命令
which at

# 如果支持，设置凌晨2:00执行
echo "/home/devbox/project/scripts/migration/execute-midnight-migration.sh" | at 02:00
```

**验证是否设置成功**：

```bash
atq  # 查看待执行任务列表
```

---

### **方案3：手动执行（设置闹钟，凌晨2:00手动运行）**

**今晚睡觉前**：

- ✅ 设置手机闹钟：凌晨 01:55
- ✅ 在闹钟备注中写上：执行迁移脚本

**凌晨1:55起床后执行**：

```bash
cd /home/devbox/project
./scripts/migration/execute-midnight-migration.sh
```

---

## 📋 **最终确认清单（全部打勾才能睡觉）**

### 代码和脚本

- [ ] Git已提交所有代码修改
- [ ] 迁移脚本都有执行权限（execute-midnight-migration.sh 等）
- [ ] 历史迁移脚本存在（migrate-user-inventory-to-dual-track.js 等）
- [ ] 数据库迁移文件存在（20251217160809-rename-user-inventory-to-deprecated.js）

### 系统状态

- [ ] 后端服务运行正常（PM2 online + 健康检查通过）
- [ ] 数据库连接正常（可以查询user_inventory表）
- [ ] 磁盘空间充足（>1GB可用空间）
- [ ] 备份目录已创建（backups/ 和 logs/）

### 执行方式（3选1）

- [ ] **方案1**：已启动后台自动等待脚本（`nohup EXECUTE-TONIGHT.sh`）
- [ ] **方案2**：已设置at定时任务（`atq`查看到任务）
- [ ] **方案3**：已设置手机闹钟（凌晨01:55提醒）

### 应急准备

- [ ] 已知道备份目录位置：`/home/devbox/project/backups/`
- [ ] 已知道日志文件位置：`/home/devbox/project/logs/`
- [ ] 已知道验收清单位置：`scripts/migration/post-migration-verification.md`
- [ ] 已知道回滚方法（见验收清单末尾）

---

## 🌙 **今晚睡觉前最后一步**

执行以下命令，确认一切就绪：

```bash
cd /home/devbox/project

echo "=== 最终检查 ==="
echo ""

echo "1. Git状态："
git status | head -3
echo ""

echo "2. 迁移脚本："
ls -lh scripts/migration/*.sh | wc -l
echo "   （应该有3个.sh脚本）"
echo ""

echo "3. 后端服务："
pm2 status | grep -E "online|stopped" | head -1
echo ""

echo "4. 备份目录："
ls -ld backups/ logs/ 2>/dev/null | wc -l
echo "   （应该有2个目录）"
echo ""

echo "5. 自动执行任务："
ps aux | grep -E "(EXECUTE-TONIGHT|execute-midnight)" | grep -v grep | wc -l
echo "   （如果选方案1，应该显示1；选方案3，应该显示0）"
echo ""

echo "=== 检查完成 ==="
echo "如果以上5项都正常，可以放心睡觉了 😴"
echo "明天凌晨3:00起床验收即可"
```

---

## 🚨 **明早凌晨3:00起床后要做的事**

1. **立即查看迁移日志**

   ```bash
   tail -100 /home/devbox/project/logs/migration-*.log
   ```

   看到 "🎉 迁移成功完成！" 就放心了。

2. **执行验收检查**

   ```bash
   cd /home/devbox/project
   # 打开验收清单
   cat scripts/migration/post-migration-verification.md
   ```

3. **如果失败，立即回滚**
   查看验收清单末尾的回滚命令。

---

## 📞 **紧急情况联系方式**

- **迁移脚本位置**：`/home/devbox/project/scripts/migration/execute-midnight-migration.sh`
- **验收清单位置**：`/home/devbox/project/scripts/migration/post-migration-verification.md`
- **备份目录**：`/home/devbox/project/backups/migration-*`
- **日志目录**：`/home/devbox/project/logs/migration-*.log`

---

**检查人签字**：********\_********  
**检查时间**：********\_********  
**执行方式**：□ 方案1（后台自动） □ 方案2（at定时） □ 方案3（手动闹钟）

**祝你今晚睡个好觉！明天凌晨3:00见 🌙**
