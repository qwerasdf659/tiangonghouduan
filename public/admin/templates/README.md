# 管理后台页面模板

**用途**: 提供标准化的页面模板，确保新建页面符合CSP、WebSocket等规范  
**创建时间**: 2025年11月23日

---

## 📄 模板文件

### page-template.html

**包含内容**:
- ✅ 标准CSP安全策略配置
- ✅ Bootstrap 5 UI框架引用
- ✅ Socket.IO本地化引用
- ✅ 通用工具库引用
- ✅ WebSocket初始化标准代码
- ✅ 错误处理标准代码
- ✅ 加载状态管理
- ✅ 完整的JSDoc注释

---

## 🚀 使用指南

### 创建新页面的步骤

**1. 复制模板文件**
```bash
cp public/admin/templates/page-template.html public/admin/new-page.html
```

**2. 修改页面标题和导航**
```html
<!-- 修改 <title> 标签 -->
<title>新页面名称 - 管理后台</title>

<!-- 修改导航栏标题 -->
<a href="/admin/dashboard.html" class="navbar-brand">
  <i class="bi bi-arrow-left me-2"></i>📋 管理后台 - 新页面名称
</a>
```

**3. 根据需求修改内容**
- 保留CSP meta标签（必须）
- 保留Bootstrap和通用工具库引用（必须）
- 如果不需要WebSocket，可删除socket.io引用和相关代码
- 实现页面特定的业务逻辑

**4. 运行验证**
```bash
# 验证前端资源
npm run frontend:verify:resources

# 验证CSP策略
npm run frontend:verify:csp

# 验证WebSocket事件（如果使用）
npm run frontend:verify:websocket
```

**5. 添加到导航菜单**

修改 `dashboard.html` 或相应的导航菜单，添加新页面链接。

---

## ⚠️ 注意事项

### 必须保留的内容

- ✅ CSP meta标签（安全策略）
- ✅ Bootstrap CSS/JS引用（UI框架）
- ✅ admin-common.js引用（认证和API）
- ✅ loading-overlay元素（加载状态）

### 可选内容

- Socket.IO引用（仅需要实时功能的页面）
- WebSocket初始化代码（仅需要实时功能的页面）
- 页面特有样式（根据需求添加）

### 禁止做法

- ❌ 删除CSP meta标签
- ❌ 直接引用外部CDN的socket.io
- ❌ 使用不规范的WebSocket事件名称
- ❌ 缺少错误处理逻辑

---

## 📋 页面功能检查清单

创建新页面后，检查以下项目：

**基础配置**:
- [ ] CSP meta标签已添加
- [ ] 页面标题已修改
- [ ] 导航链接已修改
- [ ] 用户信息显示正常

**功能实现**:
- [ ] API调用使用 `apiRequest()` 函数
- [ ] 认证token自动携带
- [ ] 错误处理完善
- [ ] 加载状态显示正常

**WebSocket功能**（如果需要）:
- [ ] Socket.IO使用本地版本
- [ ] 事件命名符合规范（<模块>:<操作>）
- [ ] 错误处理完整
- [ ] 页面卸载时断开连接

**代码质量**:
- [ ] JSDoc注释完整
- [ ] 函数命名清晰
- [ ] 代码结构清晰
- [ ] 通过ESLint检查

**测试验证**:
- [ ] 运行前端验证脚本
- [ ] 浏览器控制台无错误
- [ ] 功能正常工作
- [ ] 在不同浏览器测试

---

## 🔗 相关文档

- [前端管理系统-CSP和WebSocket问题系统性预防方案](../../docs/前端管理系统-CSP和WebSocket问题系统性预防方案.md)
- [WebSocket通信协议规范](../../docs/WebSocket通信协议规范.md)
- [第三方库版本管理](../js/vendor/README.md)

---

**维护团队**: 前端开发团队  
**最后更新**: 2025年11月23日

