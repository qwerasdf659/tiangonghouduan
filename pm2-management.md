# PM2服务管理指南

**餐厅积分抽奖系统 v2.0 - 后台服务管理**  
**创建时间**: 2025年08月10日  
**状态**: ✅ 后台服务已配置完成

---

## 🎯 **解决的核心问题**

✅ **服务持续运行**: 关闭Cursor或终端后，服务继续在后台运行  
✅ **自动重启**: 服务崩溃时自动重启  
✅ **内存管理**: 内存使用超限时自动重启  
✅ **日志管理**: 完整的日志记录和轮转  
✅ **进程监控**: 实时监控服务状态和资源使用

---

## 🚀 **常用PM2命令**

### **服务状态查看**
```bash
# 查看所有服务状态
pm2 list

# 查看详细信息
pm2 show restaurant-lottery-backend

# 实时监控
pm2 monit
```

### **服务控制**
```bash
# 启动服务
pm2 start ecosystem.config.js

# 停止服务
pm2 stop restaurant-lottery-backend

# 重启服务
pm2 restart restaurant-lottery-backend

# 重新加载服务（零停机时间）
pm2 reload restaurant-lottery-backend

# 删除服务
pm2 delete restaurant-lottery-backend
```

### **日志管理**
```bash
# 查看实时日志
pm2 logs restaurant-lottery-backend

# 查看最近50行日志
pm2 logs restaurant-lottery-backend --lines 50

# 清空日志
pm2 flush

# 日志轮转
pm2 reloadLogs
```

---

## 📊 **服务状态指标说明**

| 字段 | 说明 |
|------|------|
| **id** | 进程ID |
| **name** | 服务名称 |
| **mode** | 运行模式 (fork/cluster) |
| **↺** | 重启次数 |
| **status** | 状态 (online/stopped/errored) |
| **cpu** | CPU使用率 |
| **memory** | 内存使用量 |

### **正常状态示例**
```bash
┌────┬────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name               │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 1  │ restaurant-lotter… │ fork     │ 0    │ online    │ 0%       │ 92.1mb   │
└────┴────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

---

## 🔧 **配置文件说明**

### **ecosystem.config.js 核心配置**
- **name**: `restaurant-lottery-backend` - 服务名称
- **script**: `app.js` - 启动脚本
- **instances**: `1` - 单实例模式（开发环境）
- **autorestart**: `true` - 自动重启
- **max_memory_restart**: `512M` - 内存限制

### **日志配置**
- **combined.log**: 合并日志
- **out.log**: 标准输出日志
- **error.log**: 错误日志
- **日志目录**: `./logs/`

---

## ⚡ **快速操作命令**

### **一键启动**
```bash
cd /home/devbox/project
pm2 start ecosystem.config.js
```

### **服务健康检查**
```bash
# 检查服务状态
pm2 list

# 验证API响应
curl -s http://localhost:3000/health | grep "healthy"

# 检查端口监听
netstat -tlnp | grep :3000
```

### **故障排查**
```bash
# 查看错误日志
pm2 logs restaurant-lottery-backend --err --lines 50

# 重启服务
pm2 restart restaurant-lottery-backend

# 如果服务卡死
pm2 delete restaurant-lottery-backend
pm2 start ecosystem.config.js
```

---

## 🛡️ **自动启动配置**

### **已完成配置**
- ✅ PM2配置已保存: `pm2 save`
- ⚠️ 系统启动脚本: 需要管理员权限执行

### **开机自启动命令（可选）**
```bash
# 需要sudo权限执行（如果需要）
sudo env PATH=$PATH:/home/devbox/.nvm/versions/node/v20.18.0/bin \
     /home/devbox/.nvm/versions/node/v20.18.0/lib/node_modules/pm2/bin/pm2 \
     startup systemd -u devbox --hp /home/devbox
```

---

## 📈 **性能监控**

### **资源使用监控**
```bash
# 实时监控界面
pm2 monit

# 查看详细统计
pm2 show restaurant-lottery-backend

# 查看日志统计
pm2 logs restaurant-lottery-backend --timestamp
```

### **正常资源使用范围**
- **内存**: 80-120MB（正常）
- **CPU**: 0-5%（空闲时）
- **重启次数**: 0（稳定运行）

---

## 🚨 **故障处理指南**

### **服务无法启动**
1. 检查端口是否被占用：`netstat -tlnp | grep :3000`
2. 检查配置文件：`node -c ecosystem.config.js`
3. 查看错误日志：`pm2 logs restaurant-lottery-backend --err`

### **服务频繁重启**
1. 检查内存使用：`pm2 monit`
2. 查看错误日志：`pm2 logs restaurant-lottery-backend --err --lines 100`
3. 检查数据库连接：`curl http://localhost:3000/health`

### **内存泄漏处理**
1. 监控内存使用：`pm2 monit`
2. 手动重启：`pm2 restart restaurant-lottery-backend`
3. 调整内存限制：修改`ecosystem.config.js`中的`max_memory_restart`

---

## ✅ **验证清单**

### **服务运行验证**
- [ ] `pm2 list` 显示服务状态为 `online`
- [ ] `curl http://localhost:3000/health` 返回healthy状态
- [ ] 内存使用在合理范围内（<200MB）
- [ ] 重启次数为0（稳定运行）

### **持久化验证**
- [ ] 关闭Cursor后服务继续运行
- [ ] 关闭终端后服务继续运行
- [ ] 服务配置已保存（`pm2 save`）
- [ ] 日志正常记录

---

## 🎉 **优势总结**

### **解决的关键问题**
1. **✅ 持续运行**: 关闭开发工具后服务不会停止
2. **✅ 自动恢复**: 崩溃后自动重启，无需手动干预
3. **✅ 资源管理**: 内存使用监控和自动重启
4. **✅ 日志管理**: 完整的日志记录和轮转
5. **✅ 进程监控**: 实时监控和性能统计

### **开发体验提升**
- 🚀 **开发效率**: 无需反复手动启动服务
- 🛡️ **稳定性**: 服务崩溃自动恢复
- 📊 **可观测性**: 详细的运行状态监控
- 🔧 **易维护**: 标准化的进程管理

**当前状态**: �� 服务正常运行，可安全关闭开发工具 