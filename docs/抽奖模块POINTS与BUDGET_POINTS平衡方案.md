# 抽奖模块 POINTS 与 BUDGET_POINTS 平衡方案

> **文档版本**：v2.0（已拍板决策版）  
> **创建时间**：2026-01-18 北京时间  
> **更新时间**：2026-01-18 北京时间  
> **文档状态**：✅ 已确认方案  
> **适用模块**：UnifiedLotteryEngine / BasicGuaranteeStrategy  
> **核心策略**：预算侧自动分层控制 + 体验侧软平滑（严控预算、用户无感）

---

## 一、问题背景

### 1.1 用户反馈的核心痛点

当前抽奖模块存在"**用户花了 POINTS 抽奖，但长期只能抽到空奖/低档奖励**"的体验问题。这并非概率配置问题，而是 **POINTS（门票积分）与 BUDGET_POINTS（预算积分）之间的供需失衡**。

### 1.2 现有抽奖模块已解决的问题

| 已解决 | 说明 |
|--------|------|
| 单次抽奖的概率分布 | 按 `win_probability` 加权随机选奖 |
| 保底机制 | 每累计 10 次抽奖触发保底（九八折券） |
| 预算硬约束 | `budget_mode=user/pool` 时，只能抽 `prize_value_points <= remainingBudget` 的奖品 |
| 100% 中奖 | 每次抽奖必定从奖品池选择一个奖品（V4.0 语义） |

### 1.3 现有抽奖模块未解决的问题

| 未解决 | 说明 |
|--------|------|
| 用户序列体验波动 | 可能出现"连续多次空奖/低档"或"连续多次高档"的极端序列 |
| POINTS 与 BUDGET_POINTS 的协调 | 用户 POINTS 充足但 BUDGET_POINTS=0 时，只能抽空奖，体验极差 |
| 预算耗尽时的用户感知 | 没有任何补偿或提示机制，用户感觉"被坑" |

---

## 二、当前系统现状对齐（基于真实数据库）

### 2.1 数据库连接信息

```
数据库：restaurant_points_dev
MySQL版本：8.0.30
时区：+08:00（北京时间）
```

### 2.2 活动配置现状

| 字段 | 值 | 说明 |
|------|-----|------|
| campaign_id | 1 | |
| campaign_code | BASIC_LOTTERY | |
| campaign_name | 餐厅积分抽奖 | |
| status | active | |
| budget_mode | **user** | 从用户 BUDGET_POINTS 扣预算 |
| pool_budget_remaining | 10000 | 活动池剩余预算（当前未使用） |
| allowed_campaign_ids | ["CONSUMPTION_DEFAULT"] | 允许的预算来源 |
| cost_per_draw | 100.00 | 单次抽奖消耗 POINTS |

### 2.3 奖品池配置现状

| prize_id | prize_name | prize_value_points | win_probability | 说明 |
|----------|------------|-------------------|-----------------|------|
| 1 | 八八折 | 100 | 0.00% | 未启用概率 |
| 2 | 100积分 | 80 | 30.00% | 非空奖 |
| 3 | 甜品1份 | 60 | 20.00% | 非空奖 |
| 4 | 青菜1份 | **0** | 30.00% | **唯一空奖** |
| 5 | 2000积分券 | 150 | 1.00% | 非空奖 |
| 6 | 500积分券 | 400 | 18.00% | 非空奖 |
| 7 | 精品首饰 | 10 | 1.00% | 非空奖 |
| 8 | 生腌拼盘 | 10 | 0.00% | 未启用概率 |
| 9 | 九八折券 | 100 | 0.00% | 保底专用 |

**汇总**：
- 非空奖（`prize_value_points > 0`）：8 个
- 空奖（`prize_value_points = 0`）：1 个
- 激活概率总和：100%

### 2.4 问题根因定位

当 `budget_mode=user` 时，系统执行以下逻辑：

```
1. 获取用户在 allowed_campaign_ids（CONSUMPTION_DEFAULT）下的 BUDGET_POINTS 余额
2. 过滤奖品池：只保留 prize_value_points <= remainingBudget 的奖品
3. 在过滤后的奖品池中按 win_probability 加权随机选奖
```

**问题场景**：
- 用户 POINTS = 500（足够抽 5 次）
- 用户 BUDGET_POINTS = 0（预算已耗尽）
- ⇒ 过滤后奖品池只剩"青菜1份"（prize_value_points=0）
- ⇒ 用户花了 500 POINTS，连抽 5 次全是"青菜1份"
- ⇒ 用户体验极差，感觉被坑

---

## 三、核心矛盾定义

### 3.1 双积分体系说明

| 积分类型 | 角色 | 谁控制 | 业务含义 |
|----------|------|--------|----------|
| POINTS | 门票 | 用户持有 | 用户通过消费/任务获得，用于支付抽奖成本 |
| BUDGET_POINTS | 供给 | 平台控制 | 平台给用户的"中奖预算"，决定能发出多少有价值奖品 |

### 3.2 矛盾本质

```
用户视角：我花了 POINTS（门票），理应获得"有价值的体验"
平台视角：我只能在 BUDGET_POINTS（预算）范围内发奖，不能超发
```

当 **POINTS ≠ 0 但 BUDGET_POINTS = 0** 时，用户付了门票却只能拿空奖——这就是矛盾的爆发点。

### 3.3 约束条件（已确认）

| 约束 | 说明 |
|------|------|
| ✅ 严控预算 | 非管理员场景不允许产生预算欠账（BUDGET_POINTS 不能为负） |
| ✅ 允许继续抽 | 即使 BUDGET_POINTS=0，用户仍可发起抽奖 |
| ✅ 管理员预设例外 | 管理员主动发起的预设功能可以产生欠账（通过 preset_budget_debt 表） |

---

## 四、方案选项（已废弃 - 见第五节最终方案）

> **重要说明**：以下方案1-3为初期探索方案，已被第五节"预算侧自动分层控制方案"替代。保留此节仅供参考对比。
 
### 4.3 方案3：0成本奖品差异化

#### 核心思路

增加多个 `prize_value_points=0` 的"真实0成本"奖品，让预算=0时用户也有多样化体验。

#### 执行方式

```sql
-- 新增多个0成本奖品
INSERT INTO lottery_prizes (campaign_id, prize_name, prize_type, prize_value_points, win_probability, status)
VALUES 
  (1, '幸运签', 'virtual', 0, 0.10, 'active'),
  (1, '下次好运', 'virtual', 0, 0.10, 'active'),
  (1, '神秘彩蛋', 'virtual', 0, 0.10, 'active');
```

#### 优点

- **实现最简单**（只需加数据）
- **不改变任何逻辑**

#### 缺点

- **不解决根本问题**（用户仍然只拿到"空"，只是空的样子变多了）
- **容易被识破**（用户很快发现都是0成本）

---

## 五、最终方案：预算侧自动分层控制（已拍板）

> **核心原则（已确认）**：
> 1. **预算积分发放链路不由抽奖模块管理**（由外部业务事件驱动，如商家审核通过）
> 2. **抽奖模块只根据"预算侧当前可用积分"自动分层、自动调节**
> 3. **严控预算**：任何时候 `BUDGET_POINTS >= 0`，非管理员场景不欠账
> 4. **用户无感**：预算积分对用户不可见，体验优化在后台自动完成

---

### 5.1 方案架构：三层自动控制

```
┌─────────────────────────────────────────────────────────────┐
│  供给层（外部）：商家审核 → 预算积分自动到用户预算钱包      │
│  （本方案不涉及此层，由外部业务逻辑控制）                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  分层层（自动）：根据预算余额 + 预算压力 → 自动分层          │
│  - 用户预算层（B0/B1/B2/B3）                                 │
│  - 活动压力层（P0紧/P1正常/P2富余）                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  消耗层（自动）：抽奖时根据分层 → 自动调整可选奖品/权重      │
│  - 预算上限（cap）控制                                       │
│  - 档位权重（tier weights）自动调整                         │
│  - 体验平滑（反连空/反连高）                                 │
└─────────────────────────────────────────────────────────────┘
```

---

### 5.2A 预算侧积分来源抽象与“采纳预算额度”（Effective Budget）

> **你拍板的关键点（已落实）**：预算侧存在两条主线路（pool / user），抽奖模块不需要关心预算如何发放进钱包，**只需要统一计算“本次采纳的预算额度 EffectiveBudget”**，后续所有分层/矩阵/体验平滑都以此为输入。

#### 5.2A.1 两条主线路（Budget Source Lines）

- **pool 线路**：平台/活动侧预算（单钱包或组合钱包）
  - 例：`lottery_campaigns.pool_budget_remaining`
  - 可扩展：多个 pool 子钱包（按商家/门店/活动分池），或 pool 组合钱包（取可用之和/取最小等策略）
- **user 线路**：用户侧预算钱包（单钱包或组合钱包）
  - 例：用户在 `allowed_campaign_ids`（如 `CONSUMPTION_DEFAULT`）下的 `BUDGET_POINTS` 余额
  - 可扩展：多钱包组合（多个 campaign_id / asset_code / business wallet 组合）

#### 5.2A.2 “采纳预算额度”（EffectiveBudget）的统一计算口径

定义：**EffectiveBudget = 本次抽奖可被消耗的预算上限**（抽奖引擎唯一需要的预算输入）。

它由三步组成：

1) **选择预算线路（line selection）**：由活动配置决定（与现有 `budget_mode` 对齐）

- `budget_mode = 'user'`：只采纳 user 线路
- `budget_mode = 'pool'`：只采纳 pool 线路
- `budget_mode = 'hybrid'`（如未来需要）：采纳两者交集约束（见下）

2) **聚合预算钱包（wallet aggregation）**：把“单钱包/组合钱包”聚合成一个数

- user 线路聚合（示例）：
  - `user_budget_total = SUM(balance of BUDGET_POINTS where campaign_id in allowed_campaign_ids)`
- pool 线路聚合（示例）：
  - `pool_budget_total = SUM(pool wallets) 或 直接取 pool_budget_remaining`

3) **得到最终 EffectiveBudget（final adoption）**：结合线路选择与安全约束

推荐的统一公式（足够覆盖大多数配置）：

```text
EffectiveBudget =
  clamp(
    BudgetLineTotal,     // 选定线路聚合值（user或pool或两者组合）
    0,
    SafetyCap            // 可选：系统安全上限（如单次最高可消耗预算）
  )
```

其中 `BudgetLineTotal` 的取值规则：

- **user 模式**：`BudgetLineTotal = user_budget_total`
- **pool 模式**：`BudgetLineTotal = pool_budget_total`
- **hybrid 模式（可选扩展）**：
  - **保守型（推荐）**：`BudgetLineTotal = min(user_budget_total, pool_budget_total)`
    - 含义：两边都必须“允许”，才能发放更高成本奖（双重约束，最稳）
  - **叠加型（谨慎）**：`BudgetLineTotal = user_budget_total + pool_budget_total`
    - 含义：两边都可贡献预算（更激进，需更强的风控与节奏控制）

> **重要**：不管选哪种模式，后续都必须继续执行你已确认的硬约束：只从 `prize_value_points <= cap <= EffectiveBudget` 的奖品集合里抽，确保不欠账。

#### 5.2A.3 这样做的直接收益

- **抽奖算法只依赖一个预算输入**：`EffectiveBudget`，不再纠结预算来源细节
- **支持大规模分层**：B0/B1/B2/B3 直接基于 `EffectiveBudget` 分层即可
- **支持多钱包/组合钱包**：聚合函数可配置化，算法不变

---

### 5.2 用户预算层（Budget Tier）- 自动分层规则

基于 **EffectiveBudget**（本次采纳预算额度）自动分层（每次抽奖前实时计算）：

| 预算层 | 分层条件 | 说明 | 可发奖强度 |
|--------|---------|------|-----------|
| **B0** | `budget < 10` | 连最便宜的非空奖都买不起 | 仅空奖（0成本） |
| **B1** | `10 ≤ budget < 100` | 可发低成本奖 | 低档奖（10-99） |
| **B2** | `100 ≤ budget < 400` | 可发中成本奖 | 中档奖（100-399） |
| **B3** | `budget ≥ 400` | 可发高成本奖 | 高档奖（≥400） |

> **阈值说明**：
> - `10`：当前奖池最低非空奖成本（精品首饰/生腌拼盘）
> - `100`：当前奖池中档奖成本下限（八八折/九八折券）
> - `400`：当前奖池最高成本奖（500积分券）

**自动化实现**：
```javascript
function getUserBudgetTier(budgetBalance) {
  if (budgetBalance < 10) return 'B0';
  if (budgetBalance < 100) return 'B1';
  if (budgetBalance < 400) return 'B2';
  return 'B3';
}
```

---

### 5.3 活动预算压力层（Budget Pressure）- 自动压力计算

基于活动池 `pool_budget_remaining` 与预期消耗速度自动计算压力指数（每小时更新）：

#### 压力指数计算公式（已确认）

**方式1：基于目标剩余预算**
```
P = remaining_budget / target_remaining_budget(now)
```
- `target_remaining_budget(now)` = 活动总预算 × (剩余时间 / 总时间)
- 例如：活动总预算10000，总时长30天，当前第15天
  - 目标剩余 = 10000 × (15/30) = 5000
  - 实际剩余 = 3000
  - P = 3000 / 5000 = 0.6（偏紧）

**方式2：基于消耗速率**
```
P = (remaining_budget / remaining_time) / recent_burn_rate
```
- `recent_burn_rate` = 最近1小时/24小时的平均消耗速率
- P > 1：消耗慢于预期（富余）
- P ≈ 1：正常
- P < 1：消耗快于预期（紧张）

#### 压力分层（已确认）

| 压力层 | 压力指数 P | 说明 | 策略 |
|--------|-----------|------|------|
| **P0（紧）** | P < 0.7 | 预算快用光/消耗过快 | 保守发奖，降低非空权重 |
| **P1（正常）** | 0.7 ≤ P ≤ 1.3 | 预算消耗正常 | 正常发奖 |
| **P2（富余）** | P > 1.3 | 预算充足/消耗慢 | 积极发奖，提高非空权重 |

**自动化实现**：
```javascript
function getCampaignPressureTier(poolRemaining, targetRemaining) {
  const P = poolRemaining / targetRemaining;
  if (P < 0.7) return 'P0';  // 紧
  if (P <= 1.3) return 'P1'; // 正常
  return 'P2';               // 富余
}
```

---

### 5.4 自动调整算法：Bx × Px → cap + weights

每次抽奖前，根据（用户预算层 Bx + 活动压力层 Px）自动计算两个输出：

#### 5.4.1 本次允许的预算上限（cap）

| Bx\Px | P0（紧） | P1（正常） | P2（富余） |
|-------|---------|-----------|-----------|
| **B0** | 0 | 0 | 0 |
| **B1** | min(50, budget) | min(80, budget) | min(99, budget) |
| **B2** | min(150, budget) | min(250, budget) | min(399, budget) |
| **B3** | min(300, budget) | min(500, budget) | budget |

**说明**：
- B0 任何情况下 cap=0（只能空奖）
- Px 越紧，cap 越保守（整体控成本）
- cap 永远不超过用户实际预算余额（硬约束）

#### 5.4.2 档位权重自动调整（tier weights）

不手动改每个奖品概率，而是自动调整"非空 vs 空"的权重比例：

| Bx\Px | P0（紧） | P1（正常） | P2（富余） |
|-------|---------|-----------|-----------|
| **B0** | 空:100% | 空:100% | 空:100% |
| **B1** | 非空:空=3:7 | 非空:空=5:5 | 非空:空=6:4 |
| **B2** | 非空:空=5:5 | 非空:空=7:3 | 非空:空=8:2 |
| **B3** | 非空:空=7:3 | 非空:空=9:1 | 非空:空=10:0 |

**自动化实现**：
```javascript
function getAdjustedWeights(budgetTier, pressureTier, availablePrizes) {
  const weightMatrix = {
    'B0': { 'P0': [0, 1], 'P1': [0, 1], 'P2': [0, 1] },
    'B1': { 'P0': [3, 7], 'P1': [5, 5], 'P2': [6, 4] },
    'B2': { 'P0': [5, 5], 'P1': [7, 3], 'P2': [8, 2] },
    'B3': { 'P0': [7, 3], 'P1': [9, 1], 'P2': [10, 0] }
  };
  
  const [nonEmptyWeight, emptyWeight] = weightMatrix[budgetTier][pressureTier];
  
  return availablePrizes.map(prize => {
    const baseWeight = prize.win_probability;
    const multiplier = prize.prize_value_points > 0 ? nonEmptyWeight : emptyWeight;
    return {
      ...prize,
      adjusted_weight: baseWeight * multiplier
    };
  });
}
```

---

### 5.5 体验软阀门：反连空/反连高（自动、不欠账）

在预算允许的前提下，自动减少极端序列：

#### 5.5.1 反连空（Anti-Empty Streak）

**规则（已确认）**：
- 若用户连续空奖达到 **K=3** 次
- 且当前 `budget_balance >= min_non_empty_cost`（有预算）
- 则本次**强制从非空集合抽**（仍受 cap 限制）

**自动化实现**：
```javascript
async function applyAntiEmptyStreak(userId, availablePrizes, budgetBalance, transaction) {
  const K = 3; // 连续空奖阈值
  const emptyStreak = await getRecentEmptyStreak(userId, transaction);
  
  if (emptyStreak >= K && budgetBalance >= 10) {
    // 过滤出非空奖
    const nonEmptyPrizes = availablePrizes.filter(p => p.prize_value_points > 0);
    
    if (nonEmptyPrizes.length > 0) {
      console.log(`反连空触发：用户连续${emptyStreak}次空奖，强制非空`);
      return nonEmptyPrizes; // 只从非空奖中抽
    }
  }
  
  return availablePrizes; // 正常抽奖
}
```

#### 5.5.2 反连高（Anti-High Streak）

**规则（已确认）**：
- 若用户最近 N=5 抽内出现 M=2 次高成本奖（`prize_value_points >= 400`）
- 则短期内（接下来 T=10 抽）降低高档权重为 **0.5x**

**自动化实现**：
```javascript
async function applyAntiHighStreak(userId, availablePrizes, transaction) {
  const recentHighCount = await getRecentHighTierCount(userId, 5, transaction);
  
  if (recentHighCount >= 2) {
    console.log(`反连高触发：用户近5抽内${recentHighCount}次高档，降低高档权重`);
    
    return availablePrizes.map(prize => {
      if (prize.prize_value_points >= 400) {
        return {
          ...prize,
          adjusted_weight: (prize.adjusted_weight || prize.win_probability) * 0.5
        };
      }
      return prize;
    });
  }
  
  return availablePrizes;
}
```

---

### 5.6 完整抽奖流程（自动化）- 与现有模块的集成关系

> **已拍板确认**：本方案在现有抽奖模块的基础上**增加预算侧自动控制层**，而不是替换现有逻辑。

#### 5.6.1 执行顺序（已确认）

**用户点击抽奖后的完整流程**：

```
1. 基础校验/扣POINTS/幂等检查（现有流程，保留）
   ↓
2. 【新增】预算侧算法判断
   - 计算 EffectiveBudget（pool/user/组合钱包 → 采纳额度）
   - 计算活动压力层 P0/P1/P2
   - 计算用户预算层 B0/B1/B2/B3
   - 根据 Bx×Px 得到 cap + weights
   ↓
3. 预算过滤奖池（现有逻辑，增强）
   - 只保留 prize_value_points <= cap 的奖品集合
   ↓
4. 【新增】体验软阀门（可选但推荐）
   - 反连空/反连高：在过滤后集合内调整权重或强制非空
   ↓
5. 按权重随机选奖品并分配（现有逻辑，复用）
   ↓
6. 扣预算/扣库存/发放奖励/记录抽奖（现有事务逻辑，保留）
```

**关键点**：
- 这套算法的作用是：**决定"能从哪些奖里抽、以及抽的偏好权重"**
- 真正"选中哪个奖品"仍由现有的加权随机逻辑完成
- 预算硬约束（`prize_value_points <= cap`）是必须保留的安全边界

#### 5.6.2 与现有模块的关系（已确认）

| 模块层级 | 现有功能（保留） | 新增功能（本方案） | 关系 |
|---------|----------------|------------------|------|
| **执行层** | 抽奖/扣库存/发奖/落库/事务/幂等 | - | 完全保留，不改动 |
| **约束层** | 预算硬约束（`prize_value_points <= remainingBudget`） | 增强为 `<= cap <= EffectiveBudget` | 增强现有约束 |
| **选择层** | 按 `win_probability` 加权随机选奖 | 先用 Bx×Px 调整 weights，再加权随机 | 在现有基础上增加自动调权 |
| **控制层** | - | 预算压力层（P0/P1/P2）+ 用户预算层（B0-B3） | **新增**：大规模自动分层 |
| **体验层** | 保底机制（10抽1保底） | 反连空/反连高（序列平滑） | **新增**：解决连续极端体验 |

**重叠但不冲突的部分**：
- **预算硬约束**：现有模块已有，本方案增强为"cap"机制（更精细的预算控制）
- **加权随机选奖**：现有模块已有，本方案在此前增加"自动调权"步骤

**完全新增的部分**：
- **EffectiveBudget 统一口径**：把 pool/user/组合钱包统一成一个预算输入
- **Bx×Px 矩阵**：自动输出 cap + weights，实现大规模分层控制
- **体验软阀门**：反连空/反连高，解决序列体验问题

#### 5.6.3 伪代码实现（集成版）

```javascript
async function executeLotteryWithAutoTier(userId, campaignId, transaction) {
  // ========== 第1步：基础校验（现有逻辑，保留）==========
  // 已在 UnifiedLotteryEngine.execute_draw 中完成：
  // - 幂等性检查（Idempotency-Key）
  // - 扣除 POINTS
  // - 用户配额检查
  
  // ========== 第2步：预算侧算法判断（新增）==========
  
  // 2.1 计算 EffectiveBudget（统一预算输入）
  const campaign = await LotteryCampaign.findByPk(campaignId, { transaction });
  const effectiveBudget = await calculateEffectiveBudget(
    userId, 
    campaign, 
    transaction
  );
  // effectiveBudget = 根据 budget_mode (user/pool/hybrid) 聚合后的预算额度
  
  // 2.2 自动分层：用户预算层
  const budgetTier = getUserBudgetTier(effectiveBudget); // B0/B1/B2/B3
  
  // 2.3 自动分层：活动压力层
  const pressureTier = getCampaignPressureTier(
    campaign.pool_budget_remaining,
    campaign.target_remaining_budget
  ); // P0/P1/P2
  
  // 2.4 根据 Bx×Px 矩阵计算 cap + weights
  const { cap, weightMultipliers } = await getMatrixConfig(
    budgetTier, 
    pressureTier, 
    campaignId
  );
  
  console.log(`预算分层: ${budgetTier}, 压力层: ${pressureTier}, cap: ${cap}`);
  
  // ========== 第3步：预算过滤奖池（现有逻辑，增强）==========
  let availablePrizes = await LotteryPrize.findAll({
    where: {
      campaign_id: campaignId,
      status: 'active',
      stock_quantity: { [Op.gt]: 0 },
      prize_value_points: { [Op.lte]: cap }  // 增强：使用 cap 而非 effectiveBudget
    },
    transaction
  });
  
  if (availablePrizes.length === 0) {
    throw new Error('预算过滤后无可用奖品');
  }
  
  // ========== 第4步：体验软阀门（新增，可选）==========
  
  // 4.1 反连空：连续空奖3次后强制非空（预算允许时）
  availablePrizes = await applyAntiEmptyStreak(
    userId, 
    availablePrizes, 
    effectiveBudget, 
    transaction
  );
  
  // 4.2 反连高：近5抽内2次高档则降权
  availablePrizes = await applyAntiHighStreak(
    userId, 
    availablePrizes, 
    transaction
  );
  
  // 4.3 应用 Bx×Px 权重调整
  availablePrizes = availablePrizes.map(prize => {
    const baseWeight = prize.win_probability;
    const multiplier = prize.prize_value_points > 0 
      ? weightMultipliers.nonEmpty 
      : weightMultipliers.empty;
    
    return {
      ...prize,
      adjusted_weight: baseWeight * multiplier
    };
  });
  
  // ========== 第5步：加权随机选奖（现有逻辑，复用）==========
  const selectedPrize = weightedRandomSelect(availablePrizes, 'adjusted_weight');
  
  // ========== 第6步：扣预算/发奖/记录（现有逻辑，保留）==========
  // 已在 BasicGuaranteeStrategy 中实现：
  // - deductBudgetPoints()
  // - deductPrizeStock()
  // - distributePrize()
  // - recordLotteryHistory()
  
  return selectedPrize;
}

// ========== 辅助函数：EffectiveBudget 计算 ==========
async function calculateEffectiveBudget(userId, campaign, transaction) {
  const budgetMode = campaign.budget_mode;
  
  if (budgetMode === 'user') {
    // user 模式：从用户预算钱包聚合
    const allowedCampaigns = campaign.allowed_campaign_ids || ['CONSUMPTION_DEFAULT'];
    const userBudget = await AssetService.getBalanceSum(
      userId,
      'BUDGET_POINTS',
      allowedCampaigns,
      transaction
    );
    return userBudget;
    
  } else if (budgetMode === 'pool') {
    // pool 模式：从活动池
    return Number(campaign.pool_budget_remaining);
    
  } else if (budgetMode === 'hybrid') {
    // hybrid 模式：取两者最小值（保守）
    const userBudget = await AssetService.getBalanceSum(
      userId,
      'BUDGET_POINTS',
      campaign.allowed_campaign_ids,
      transaction
    );
    const poolBudget = Number(campaign.pool_budget_remaining);
    return Math.min(userBudget, poolBudget);
  }
  
  throw new Error(`未知的 budget_mode: ${budgetMode}`);
}
```

---

### 5.7 ~~预算预拨算法伪代码~~（已废弃）

> **废弃原因**：预算积分发放由外部业务事件驱动（如商家审核通过），不在抽奖模块内预拨。

### 5.8 关键数据表设计（新增/复用）

#### 5.8.1 复用现有表（无需新增）

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `lottery_draws` | 记录每次抽奖，用于计算连续空奖/连续高档 | `prize_value_points`, `created_at` |
| `lottery_campaigns` | 活动配置，用于压力层计算 | `pool_budget_remaining`, `target_remaining_budget` |
| `account_asset_balances` | 用户预算余额，用于预算层分层 | `user_id`, `asset_code='BUDGET_POINTS'`, `balance` |

#### 5.8.2 新增字段（可选优化）

```sql
-- 活动表新增：目标剩余预算（用于压力计算）
ALTER TABLE lottery_campaigns 
  ADD COLUMN target_remaining_budget INT COMMENT '当前时间点的目标剩余预算（用于压力层计算）',
  ADD COLUMN last_pressure_update DATETIME COMMENT '上次压力计算时间';

-- 用户配额表新增：连续空奖计数（可选，也可实时查询）
ALTER TABLE lottery_user_daily_draw_quota 
  ADD COLUMN empty_streak INT NOT NULL DEFAULT 0 COMMENT '连续空奖次数（用于反连空）',
  ADD COLUMN last_high_tier_at DATETIME COMMENT '最近一次高档奖时间（用于反连高）';
```

#### 5.8.3 配置表（新增）- 分层矩阵配置化

```sql
-- 预算分层配置表（支持动态调整分层阈值）
CREATE TABLE lottery_budget_tier_config (
  config_id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL COMMENT '活动ID（0表示全局默认）',
  tier_name VARCHAR(10) NOT NULL COMMENT 'B0/B1/B2/B3',
  min_budget INT NOT NULL COMMENT '最小预算（含）',
  max_budget INT COMMENT '最大预算（不含，NULL表示无上限）',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_campaign_tier (campaign_id, tier_name),
  INDEX idx_campaign (campaign_id)
) COMMENT='预算分层配置表';

-- 初始数据（基于当前奖池）
INSERT INTO lottery_budget_tier_config (campaign_id, tier_name, min_budget, max_budget) VALUES
  (0, 'B0', 0, 10),
  (0, 'B1', 10, 100),
  (0, 'B2', 100, 400),
  (0, 'B3', 400, NULL);

-- 分层矩阵配置表（cap + weights）
CREATE TABLE lottery_tier_matrix_config (
  matrix_id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL COMMENT '活动ID（0表示全局默认）',
  budget_tier VARCHAR(10) NOT NULL COMMENT 'B0/B1/B2/B3',
  pressure_tier VARCHAR(10) NOT NULL COMMENT 'P0/P1/P2',
  cap_multiplier DECIMAL(5,2) NOT NULL COMMENT 'cap倍数（相对于预算余额）',
  non_empty_weight INT NOT NULL COMMENT '非空奖权重',
  empty_weight INT NOT NULL COMMENT '空奖权重',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_campaign_tiers (campaign_id, budget_tier, pressure_tier),
  INDEX idx_campaign (campaign_id)
) COMMENT='分层矩阵配置表（cap+权重）';

-- 初始数据（基于已拍板的矩阵）
INSERT INTO lottery_tier_matrix_config (campaign_id, budget_tier, pressure_tier, cap_multiplier, non_empty_weight, empty_weight) VALUES
  -- B0层（任何压力都只能空奖）
  (0, 'B0', 'P0', 0, 0, 1),
  (0, 'B0', 'P1', 0, 0, 1),
  (0, 'B0', 'P2', 0, 0, 1),
  -- B1层
  (0, 'B1', 'P0', 0.5, 3, 7),  -- P0紧：cap=50% budget, 非空:空=3:7
  (0, 'B1', 'P1', 0.8, 5, 5),  -- P1正常：cap=80% budget, 非空:空=5:5
  (0, 'B1', 'P2', 0.99, 6, 4), -- P2富余：cap=99% budget, 非空:空=6:4
  -- B2层
  (0, 'B2', 'P0', 0.6, 5, 5),
  (0, 'B2', 'P1', 0.8, 7, 3),
  (0, 'B2', 'P2', 0.99, 8, 2),
  -- B3层
  (0, 'B3', 'P0', 0.75, 7, 3),
  (0, 'B3', 'P1', 1.0, 9, 1),
  (0, 'B3', 'P2', 1.0, 10, 0);
```

---

## 六、已拍板决策点（✅ 已确认）

### 6.1 方案选择 ✅

**最终选择**：**预算侧自动分层控制方案**（第五节）

**核心决策**：
- ❌ 不采用"预算预拨"（方案1）- 预算发放由外部业务驱动
- ❌ 不采用"动态定价"（方案2）- 不改变积分经济
- ✅ 采用"预算侧自动分层 + 体验软阀门"
  - 根据预算余额自动分层（B0/B1/B2/B3）
  - 根据活动压力自动调节（P0/P1/P2）
  - 预算允许时自动平滑体验（反连空/反连高）

---

### 6.2 预算分层阈值 ✅

| 预算层 | 分层条件 | 说明 |
|--------|---------|------|
| **B0** | `budget < 10` | 仅空奖 |
| **B1** | `10 ≤ budget < 100` | 低档奖 |
| **B2** | `100 ≤ budget < 400` | 中档奖 |
| **B3** | `budget ≥ 400` | 高档奖 |

**依据**：当前奖池 `prize_value_points` 分布（10/60/80/100/150/400）

---

### 6.3 压力层计算方式 ✅

**压力指数公式**：
```
P = remaining_budget / target_remaining_budget(now)
```

**压力分层**：
- **P0（紧）**：P < 0.7
- **P1（正常）**：0.7 ≤ P ≤ 1.3
- **P2（富余）**：P > 1.3

**更新频率**：每小时计算一次（缓存1小时）

---

### 6.4 体验软阀门参数 ✅

| 参数 | 确认值 | 说明 |
|------|--------|------|
| **反连空阈值 K** | 3 次 | 连续空奖3次后，预算允许时强制非空 |
| **反连高窗口 N** | 5 抽 | 最近5抽内统计高档次数 |
| **反连高阈值 M** | 2 次 | 5抽内2次高档则触发降权 |
| **反连高降权倍数** | 0.5x | 高档权重降低50% |
| **反连高持续时长 T** | 10 抽 | 降权持续10抽后恢复 |

---

### 6.5 Bx × Px 矩阵（cap + weights）✅

#### cap 矩阵（预算上限倍数）

| Bx\Px | P0（紧） | P1（正常） | P2（富余） |
|-------|---------|-----------|-----------|
| **B0** | 0 | 0 | 0 |
| **B1** | 0.5 × budget | 0.8 × budget | 0.99 × budget |
| **B2** | 0.6 × budget | 0.8 × budget | 0.99 × budget |
| **B3** | 0.75 × budget | 1.0 × budget | 1.0 × budget |

#### weights 矩阵（非空:空权重比）

| Bx\Px | P0（紧） | P1（正常） | P2（富余） |
|-------|---------|-----------|-----------|
| **B0** | 0:1 | 0:1 | 0:1 |
| **B1** | 3:7 | 5:5 | 6:4 |
| **B2** | 5:5 | 7:3 | 8:2 |
| **B3** | 7:3 | 9:1 | 10:0 |

---

### 6.6 池子耗尽时的兜底策略 ✅

**最终选择**：**A - 继续允许抽，但只能抽空奖**

**理由**：
- 符合"严控预算、不欠账"原则
- 用户体验由"0成本奖品差异化"（方案3）兜底
- 配合外部预算补给机制（商家审核通过自动发放预算）

**辅助措施**：
- 扩充 0 成本奖品种类（幸运签、下次好运、神秘彩蛋等）
- 前端提示"当前仅基础奖励"（不暴露预算概念）

---

## 七、实施计划（已调整）

| 阶段 | 内容 | 预估工时 | 优先级 |
|------|------|---------|--------|
| **Phase 1** | 新增配置表（`lottery_budget_tier_config`, `lottery_tier_matrix_config`） | 0.5d | P0 |
| **Phase 2** | 实现预算层分层逻辑（`getUserBudgetTier`） | 0.5d | P0 |
| **Phase 3** | 实现压力层计算逻辑（`getCampaignPressureTier`，每小时更新） | 1d | P0 |
| **Phase 4** | 实现 Bx×Px 矩阵查询与 cap/weights 自动调整 | 1d | P0 |
| **Phase 5** | 实现体验软阀门（反连空 `applyAntiEmptyStreak`） | 0.5d | P1 |
| **Phase 6** | 实现体验软阀门（反连高 `applyAntiHighStreak`） | 0.5d | P1 |
| **Phase 7** | 集成到 `UnifiedLotteryEngine.execute_draw` | 1d | P0 |
| **Phase 8** | 新增 0 成本奖品（幸运签、下次好运等） | 0.5d | P2 |
| **Phase 9** | 监控指标埋点 & 灰度发布 | 1d | P1 |

**总计**：约 6.5 人天

**关键路径**：Phase 1-4-7（核心分层逻辑）约 3 人天可完成基础版本

---

## 八、监控指标（上线后）

| 指标类别 | 指标名称 | 计算方式 | 告警阈值 | 说明 |
|---------|---------|---------|---------|------|
| **预算健康** | 活动压力指数 P | `remaining / target_remaining` | P < 0.5（严重紧张） | 每小时更新 |
| **预算健康** | 池子消耗速度 | `pool_delta / hour` | > 1000/h | 防止短时打穿 |
| **用户分层** | B0 用户占比 | `B0_users / total_users` | > 40% | 预算不足用户过多 |
| **用户分层** | B3 用户占比 | `B3_users / total_users` | < 5% | 高预算用户过少 |
| **体验质量** | 空奖占比 | `empty_draws / total_draws` | > 50% | 整体体验下降 |
| **体验质量** | 用户平均连续空奖 | `avg(max_empty_streak)` | > 5 | 个体体验极差 |
| **体验质量** | 反连空触发率 | `anti_empty_triggers / total_draws` | > 20% | 预算不足信号 |
| **体验质量** | 反连高触发率 | `anti_high_triggers / total_draws` | > 10% | 高档过密 |
| **矩阵效果** | Bx×Px 分布 | 9宫格用户分布 | 某格 > 50% | 分层失衡 |
| **业务指标** | 用户投诉率 | `complaints / total_draws` | > 1% | 体验不满 |

---

## 附录A：相关代码文件

| 文件路径 | 说明 |
|----------|------|
| `services/UnifiedLotteryEngine/UnifiedLotteryEngine.js` | 抽奖引擎主入口 |
| `services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js` | 基础抽奖策略 |
| `services/AssetService.js` | 资产服务（POINTS/BUDGET_POINTS） |
| `models/LotteryCampaign.js` | 活动模型（含 pool_budget_remaining） |
| `models/LotteryPrize.js` | 奖品模型（含 prize_value_points） |
| `routes/v4/lottery/draw.js` | 抽奖API路由 |

## 附录B：当前数据库真实数据快照

```json
{
  "lottery_campaigns": [
    {
      "campaign_id": 1,
      "campaign_code": "BASIC_LOTTERY",
      "budget_mode": "user",
      "pool_budget_remaining": "10000",
      "allowed_campaign_ids": ["CONSUMPTION_DEFAULT"]
    }
  ],
  "lottery_prizes_summary": {
    "non_empty_active": 8,
    "empty_active": 1,
    "active_prob_sum": "1.000000"
  },
  "lottery_draws_30d": {
    "total_draws": 2,
    "reward_tier_mix": { "low": 2 }
  }
}
```

---

## 九、核心优势与预期效果

### 9.1 相比初期方案的优势

| 对比维度 | 初期方案（预算预拨） | 最终方案（预算侧分层） |
|---------|-------------------|---------------------|
| **预算发放** | 抽奖时从池子预拨到用户 | 由外部业务事件驱动（解耦） |
| **系统复杂度** | 需新增预拨逻辑与日志表 | 复用现有账本，仅增分层逻辑 |
| **可扩展性** | 预拨参数需人工调整 | 分层矩阵配置化，支持动态调整 |
| **大规模适用** | 单一转换率，难以分层 | 天然支持用户×压力双维分层 |
| **预算控制** | 需多重限额（每日/每小时） | 压力层自动节奏控制 |
| **用户无感** | ✅ 预算对用户不可见 | ✅ 预算对用户不可见 |

### 9.2 预期效果（量化）

| 指标 | 当前状态 | 预期改善 | 说明 |
|------|---------|---------|------|
| 空奖占比 | 未知（数据不足） | < 30% | B1+ 用户非空奖占比提升 |
| 连续空奖 | 未知 | 平均 < 2 次 | 反连空机制生效 |
| B0 用户占比 | 未知 | < 20% | 配合外部预算补给 |
| 预算打穿风险 | 存在 | 消除 | 压力层自动节奏控制 |
| 用户投诉 | 未知 | < 1% | 体验平滑 + 0成本奖差异化 |

### 9.3 与现有系统的兼容性

| 现有机制 | 兼容性 | 说明 |
|---------|--------|------|
| 保底机制（10抽1保底） | ✅ 完全兼容 | 保底奖独立触发，不受分层影响 |
| 管理员预设 | ✅ 完全兼容 | 预设可绕过预算约束（已有 preset_budget_debt） |
| TierPickStage（档位优先） | ✅ 可协同 | 分层矩阵输出 weights，TierPickStage 可复用 |
| budget_mode=user/pool | ✅ 完全兼容 | 分层逻辑适用于两种模式 |
| 幂等性（Idempotency-Key） | ✅ 完全兼容 | 分层计算幂等，不影响幂等机制 |

---

## 十、FAQ（常见问题）

### Q1：预算积分如何进入用户钱包？
**A**：由外部业务事件驱动（如商家审核通过、用户完成任务等），不在抽奖模块内处理。抽奖模块只读取当前预算余额。

### Q2：B0 用户（预算=0）是否永远只能抽空奖？
**A**：是的，这是预算硬约束。但可通过两种方式改善：
- 外部业务持续补给预算（商家审核、任务奖励等）
- 扩充 0 成本奖品种类，让空奖也有差异化体验

### Q3：压力层 P0/P1/P2 如何更新？
**A**：每小时计算一次，缓存 1 小时。可通过定时任务或首次抽奖时触发更新。

### Q4：分层矩阵参数如何调整？
**A**：通过 `lottery_tier_matrix_config` 表配置，支持：
- 全局默认（`campaign_id=0`）
- 活动级别覆盖（`campaign_id=具体活动ID`）
- 运营可通过管理后台动态调整

### Q5：反连空/反连高会不会导致预算超支？
**A**：不会。两者都在"预算允许集合内"调整选择策略，不会突破 cap 限制。

### Q6：如何验证方案效果？
**A**：
- 灰度发布：先对 10% 用户启用分层逻辑
- 监控对比：对比灰度组与对照组的空奖占比、连续空奖次数、投诉率
- A/B 测试：不同分层矩阵参数的效果对比

### Q7：方案上线后如何回滚？
**A**：
- 配置开关：`system_settings` 中增加 `enable_budget_tier_control` 开关
- 关闭后回退到原有逻辑（按 `win_probability` 直接抽奖）
- 分层配置表保留，可随时重新启用

---

**文档结束**

