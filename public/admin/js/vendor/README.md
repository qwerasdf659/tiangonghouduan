# 第三方JavaScript库版本管理

**目录用途**: 存放前端管理系统使用的第三方JavaScript库本地化版本  
**维护原则**: 所有第三方库必须本地化，避免依赖外部CDN  
**更新时间**: 2025年11月23日

---

## 📦 已本地化的库

### Socket.IO Client (socket.io.min.js)

**当前版本**: 4.7.2  
**文件大小**: 49KB  
**下载日期**: 2025年11月23日  
**官方链接**: https://cdn.socket.io/4.7.2/socket.io.min.js  
**文档地址**: https://socket.io/docs/v4/client-api/

**用途**:
- 实时WebSocket通信
- 管理后台通知推送
- 客服工作台实时聊天

**使用页面**:
- `notifications.html` - 系统通知中心
- `customer-service.html` - 客服工作台

**引用方式**:
```html
<script src="/admin/js/vendor/socket.io.min.js"></script>
```

**版本变更记录**:
- 2025-11-23: 初始化版本 4.7.2

---

## 🔄 库更新流程

### 更新Socket.IO版本

**步骤**:

1. **检查新版本**
```bash
# 访问官方文档查看最新版本
# https://socket.io/docs/v4/
```

2. **下载新版本到本地**
```bash
cd public/admin/js/vendor
curl -o socket.io.min.js.new https://cdn.socket.io/[新版本]/socket.io.min.js
```

3. **验证文件完整性**
```bash
# 检查文件大小（应该在40-60KB之间）
ls -lh socket.io.min.js.new

# 检查文件头部（应该包含Socket.IO版权信息）
head -5 socket.io.min.js.new
```

4. **在开发环境测试**
```bash
# 备份旧版本
mv socket.io.min.js socket.io.min.js.backup

# 使用新版本
mv socket.io.min.js.new socket.io.min.js

# 启动服务测试
npm run pm:restart

# 访问管理后台测试WebSocket功能
# - 通知中心: http://localhost:3000/admin/notifications.html
# - 客服工作台: http://localhost:3000/admin/customer-service.html
```

5. **更新文档**
```bash
# 更新本README中的版本号和日期
# 更新 docs/前端管理系统-CSP和WebSocket问题系统性预防方案.md
```

6. **提交代码**
```bash
git add public/admin/js/vendor/socket.io.min.js
git add public/admin/js/vendor/README.md
git commit -m "chore: 更新Socket.IO客户端到v[新版本号]"
```

---

## 🚨 故障排除

### Socket.IO无法加载

**症状**: 浏览器控制台显示404错误

**检查**:
```bash
# 1. 检查文件是否存在
ls -la public/admin/js/vendor/socket.io.min.js

# 2. 检查文件权限
stat public/admin/js/vendor/socket.io.min.js

# 3. 检查HTTP访问
curl -I http://localhost:3000/admin/js/vendor/socket.io.min.js
```

**解决**:
```bash
# 重新下载
cd public/admin/js/vendor
rm -f socket.io.min.js
curl -o socket.io.min.js https://cdn.socket.io/4.7.2/socket.io.min.js
```

### CSP阻止加载

**症状**: 浏览器控制台CSP错误

**检查**:
```bash
# 运行CSP验证脚本
./scripts/frontend/verify-csp.sh
```

**解决**: 参考 `docs/前端管理系统-CSP和WebSocket问题系统性预防方案.md`

---

## 📋 维护责任

**负责团队**: 前端开发团队  
**技术支持**: 后端开发团队（WebSocket服务）  
**更新频率**: 每季度检查一次版本更新  

---

## 🔗 相关文档

- [前端管理系统-CSP和WebSocket问题系统性预防方案](../../docs/前端管理系统-CSP和WebSocket问题系统性预防方案.md)
- [WebSocket通信协议规范](../../docs/WebSocket通信协议规范.md) (待创建)
- Socket.IO官方文档: https://socket.io/docs/v4/

---

**最后更新**: 2025年11月23日

