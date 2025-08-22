# 🎯 前端Analytics集成指南

**版本**: v1.0  
**创建时间**: 2025年08月20日  
**后端版本**: v3.0分离式架构  
**API基础路径**: `/api/v3/analytics`

---

## 📊 **后端已完成的Analytics功能**

### ✅ **可用的API接口**

#### 1. **健康检查**

```javascript
GET / api / v3 / analytics / health
// 响应: { code: 0, data: { status: "healthy" } }
```

#### 2. **用户行为数据上报**

```javascript
POST /api/v3/analytics/behaviors/batch
Headers: { Authorization: "Bearer <JWT_TOKEN>" }
Body: {
  behaviors: [
    {
      eventType: "page_view",
      eventData: { page: "/lottery", title: "抽奖页面" },
      timestamp: Date.now()
    },
    {
      eventType: "click",
      eventData: { element: "lottery_button", page: "/lottery" },
      timestamp: Date.now()
    }
  ],
  sessionId: "session_12345"
}
```

#### 3. **用户画像查询**

```javascript
GET / api / v3 / analytics / users / { userId } / profile
Headers: {
  Authorization: 'Bearer <JWT_TOKEN>'
}
// 响应: 用户行为画像数据
```

#### 4. **个性化推荐**

```javascript
GET /api/v3/analytics/users/{userId}/recommendations?type=lottery_campaign&limit=5
Headers: { Authorization: "Bearer <JWT_TOKEN>" }
// 响应: 个性化推荐列表
```

#### 5. **管理员统计概览**

```javascript
GET /api/v3/analytics/admin/overview?timeRange=7d
Headers: { Authorization: "Bearer <ADMIN_JWT_TOKEN>" }
// 需要管理员权限
```

---

## 🔧 **前端需要实现的功能**

### 1. **行为数据采集SDK**

```javascript
// utils/analyticsSDK.js
class AnalyticsSDK {
  constructor(baseURL, getToken) {
    this.baseURL = baseURL
    this.getToken = getToken
    this.behaviors = []
    this.sessionId = this.generateSessionId()
    this.batchSize = 10
    this.uploadInterval = 30000 // 30秒

    this.startBatchUpload()
  }

  // 页面访问追踪
  trackPageView(pagePath, pageTitle) {
    this.addBehavior({
      eventType: 'page_view',
      eventData: {
        page: pagePath,
        title: pageTitle,
        referrer: document.referrer
      }
    })
  }

  // 点击事件追踪
  trackClick(element, context = {}) {
    this.addBehavior({
      eventType: 'click',
      eventData: {
        element: element,
        page: window.location.pathname,
        ...context
      }
    })
  }

  // 抽奖行为追踪
  trackLotteryDraw(campaignId, result) {
    this.addBehavior({
      eventType: 'draw',
      eventData: {
        campaignId,
        result,
        page: window.location.pathname
      }
    })
  }

  // 积分操作追踪
  trackPointsAction(action, points, source) {
    this.addBehavior({
      eventType: action === 'earn' ? 'earn_points' : 'consume_points',
      eventData: {
        points,
        source,
        page: window.location.pathname
      }
    })
  }

  // 批量上报
  async uploadBehaviors() {
    if (this.behaviors.length === 0) return

    try {
      const token = await this.getToken()
      if (!token) return

      const response = await fetch(`${this.baseURL}/api/v3/analytics/behaviors/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          behaviors: this.behaviors,
          sessionId: this.sessionId
        })
      })

      if (response.ok) {
        console.log(`📊 Analytics: 上报${this.behaviors.length}条行为数据`)
        this.behaviors = []
      }
    } catch (error) {
      console.error('Analytics上报失败:', error)
    }
  }

  addBehavior(behavior) {
    this.behaviors.push({
      ...behavior,
      timestamp: Date.now()
    })

    if (this.behaviors.length >= this.batchSize) {
      this.uploadBehaviors()
    }
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  startBatchUpload() {
    setInterval(() => {
      this.uploadBehaviors()
    }, this.uploadInterval)
  }
}

export default AnalyticsSDK
```

### 2. **推荐展示组件**

```javascript
// components/RecommendationWidget.js
import React, { useState, useEffect } from 'react'

const RecommendationWidget = ({ userId, type = 'lottery_campaign', limit = 5 }) => {
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecommendations()
  }, [userId, type])

  const fetchRecommendations = async () => {
    try {
      const token = getAuthToken() // 获取JWT token
      const response = await fetch(
        `/api/v3/analytics/users/${userId}/recommendations?type=${type}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.data || [])
      }
    } catch (error) {
      console.error('获取推荐失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRecommendationClick = recommendation => {
    // 记录推荐点击事件
    window.analytics?.trackClick('recommendation', {
      recommendationId: recommendation.id,
      type: recommendation.type
    })

    // 执行推荐的操作
    if (recommendation.type === 'lottery_campaign') {
      // 跳转到抽奖页面
      window.location.href = `/lottery/${recommendation.data.campaignId}`
    }
  }

  if (loading) {
    return <div>加载推荐中...</div>
  }

  return (
    <div className="recommendation-widget">
      <h3>为您推荐</h3>
      {recommendations.map(rec => (
        <div
          key={rec.id}
          className="recommendation-item"
          onClick={() => handleRecommendationClick(rec)}
        >
          <h4>{rec.title}</h4>
          <p>{rec.description}</p>
          <span className="score">推荐度: {(rec.score * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}

export default RecommendationWidget
```

### 3. **管理员分析页面**

```javascript
// pages/AdminAnalytics.js
import React, { useState, useEffect } from 'react'

const AdminAnalytics = () => {
  const [overview, setOverview] = useState({})
  const [timeRange, setTimeRange] = useState('7d')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOverview()
  }, [timeRange])

  const fetchOverview = async () => {
    try {
      const token = getAdminToken() // 获取管理员JWT token
      const response = await fetch(`/api/v3/analytics/admin/overview?timeRange=${timeRange}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setOverview(data.data || {})
      }
    } catch (error) {
      console.error('获取分析数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-analytics">
      <h2>用户行为分析</h2>

      <div className="time-selector">
        <select value={timeRange} onChange={e => setTimeRange(e.target.value)}>
          <option value="1d">最近1天</option>
          <option value="7d">最近7天</option>
          <option value="30d">最近30天</option>
        </select>
      </div>

      {loading ? (
        <div>加载中...</div>
      ) : (
        <div className="analytics-dashboard">
          <div className="metric-card">
            <h3>活跃用户</h3>
            <p>{overview.activeUsers || 0}</p>
          </div>

          <div className="metric-card">
            <h3>页面浏览</h3>
            <p>{overview.pageViews || 0}</p>
          </div>

          <div className="metric-card">
            <h3>推荐点击率</h3>
            <p>{((overview.recommendationClickRate || 0) * 100).toFixed(1)}%</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminAnalytics
```

---

## 🚀 **集成步骤**

### 1. **初始化Analytics SDK**

```javascript
// app.js 或 main.js
import AnalyticsSDK from './utils/analyticsSDK'

// 初始化Analytics
const analytics = new AnalyticsSDK(
  process.env.REACT_APP_API_BASE_URL,
  () => localStorage.getItem('authToken') // 获取JWT token的方法
)

// 全局挂载
window.analytics = analytics

// 自动追踪页面访问
const trackPageView = () => {
  analytics.trackPageView(window.location.pathname, document.title)
}

// 路由变化时追踪
// React Router 示例
history.listen(() => {
  trackPageView()
})

// 初始页面
trackPageView()
```

### 2. **在关键业务操作中添加追踪**

```javascript
// 抽奖操作
const handleLotteryDraw = async campaignId => {
  try {
    const result = await drawLottery(campaignId)

    // 追踪抽奖行为
    window.analytics?.trackLotteryDraw(campaignId, result)

    return result
  } catch (error) {
    console.error('抽奖失败:', error)
  }
}

// 积分操作
const handlePointsEarn = async (points, source) => {
  try {
    await earnPoints(points, source)

    // 追踪积分获得
    window.analytics?.trackPointsAction('earn', points, source)
  } catch (error) {
    console.error('积分获得失败:', error)
  }
}

// 关键按钮点击
const handleImportantClick = buttonType => {
  window.analytics?.trackClick(buttonType, {
    timestamp: Date.now(),
    userId: getCurrentUserId()
  })
}
```

---

## ⚠️ **注意事项**

1. **认证要求**: 所有Analytics API需要有效的JWT token
2. **权限控制**: 用户只能查看自己的数据，管理员API需要管理员权限
3. **数据隐私**: 不要上报敏感信息（密码、手机号等）
4. **性能考虑**: 行为数据批量上报，避免频繁请求
5. **错误处理**: Analytics失败不应影响主要业务流程

---

## 📋 **实施检查清单**

- [ ] 集成AnalyticsSDK到项目中
- [ ] 在关键页面添加页面访问追踪
- [ ] 在重要操作中添加行为追踪
- [ ] 实现推荐展示组件
- [ ] 实现管理员分析页面
- [ ] 测试数据上报功能
- [ ] 验证推荐功能正常
- [ ] 确认管理员分析页面显示正确

---

**后端API完全可用，等待前端集成！** 🚀
