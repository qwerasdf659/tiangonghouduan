# VirtualList 虚拟列表组件

> 解决大数据量列表渲染性能问题（1000+条记录）

## 原理

虚拟列表通过只渲染可视区域内的元素来减少 DOM 节点数量，大幅提升渲染性能。

- **传统渲染**：10000 条数据 = 10000 个 DOM 节点
- **虚拟列表**：10000 条数据 ≈ 20-30 个 DOM 节点（仅可见区域）

## 基础用法

### 简单列表

```html
<div x-data="virtualList({ itemHeight: 50 })" 
     x-init="setItems(largeDataArray)">
  
  <!-- 滚动容器 -->
  <div x-ref="container" 
       class="virtual-list-container" 
       @scroll="handleScroll($event)"
       style="height: 400px; overflow-y: auto;">
    
    <!-- 撑开高度的容器 -->
    <div :style="{ height: totalHeight + 'px', position: 'relative' }">
      
      <!-- 可见区域 -->
      <div :style="{ transform: 'translateY(' + offsetY + 'px)' }">
        <template x-for="(item, index) in visibleItems" :key="item.id || (startIndex + index)">
          <div class="list-item" :style="{ height: itemHeight + 'px' }">
            <span x-text="item.name"></span>
          </div>
        </template>
      </div>
    </div>
  </div>
  
  <!-- 统计信息 -->
  <div class="text-muted mt-2">
    显示 <span x-text="visibleCount"></span> / <span x-text="totalCount"></span> 条
  </div>
</div>
```

### 虚拟表格

```html
<div x-data="virtualTable({ 
  rowHeight: 48,
  primaryKey: 'id',
  columns: [
    { field: 'id', label: 'ID', width: 80 },
    { field: 'name', label: '名称', width: 200 },
    { field: 'status', label: '状态', width: 100 }
  ]
})" x-init="setItems(tableData)">

  <div x-ref="container" 
       class="virtual-table-container"
       @scroll="handleScroll($event)"
       style="height: 500px; overflow: auto;">
    
    <table class="table virtual-table">
      <!-- 固定表头 -->
      <thead>
        <tr>
          <th x-show="showSelection" style="width: 50px">
            <input type="checkbox" 
                   :checked="isAllSelected"
                   :indeterminate="isPartialSelected"
                   @change="toggleSelectAll($event.target.checked)">
          </th>
          <th x-show="showRowNumber" style="width: 60px">#</th>
          <template x-for="col in columns" :key="col.field">
            <th :style="{ width: col.width ? col.width + 'px' : 'auto' }" x-text="col.label"></th>
          </template>
        </tr>
      </thead>
      
      <!-- 虚拟滚动体 -->
      <tbody>
        <!-- 撑高占位 -->
        <tr :style="{ height: offsetY + 'px' }"><td colspan="100"></td></tr>
        
        <!-- 可见行 -->
        <template x-for="(row, index) in visibleItems" :key="row[primaryKey]">
          <tr :class="getRowClass(row, index)"
              @click="handleRowClick(row, index, $event)"
              @dblclick="handleRowDblClick(row, index)">
            
            <!-- 选择框 -->
            <td x-show="showSelection">
              <input type="checkbox" 
                     :checked="isSelected(row[primaryKey])"
                     @change="toggleSelect(row[primaryKey])">
            </td>
            
            <!-- 行号 -->
            <td x-show="showRowNumber" x-text="getRowNumber(index)"></td>
            
            <!-- 数据列 -->
            <template x-for="col in columns" :key="col.field">
              <td x-text="formatCell(getCellValue(row, col), col)"></td>
            </template>
          </tr>
        </template>
        
        <!-- 底部撑高占位 -->
        <tr :style="{ height: (totalHeight - offsetY - visibleItems.length * rowHeight) + 'px' }">
          <td colspan="100"></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

## 配置选项

### virtualList 配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `itemHeight` | number | 50 | 每项高度（像素） |
| `bufferSize` | number | 5 | 缓冲区大小 |
| `containerHeight` | number | 400 | 容器默认高度 |
| `dynamicHeight` | boolean | false | 是否支持动态行高 |

### virtualTable 配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `rowHeight` | number | 48 | 行高 |
| `columns` | Array | [] | 列配置 |
| `primaryKey` | string | 'id' | 主键字段名 |
| `showRowNumber` | boolean | true | 显示行号 |
| `showSelection` | boolean | true | 显示选择框 |

## API 方法

### 数据管理

```javascript
// 设置数据（重置）
setItems(dataArray)

// 追加数据（无限滚动）
appendItems(newDataArray)

// 更新单项
updateItem(id, { name: '新名称' })

// 删除项
removeItem(id)

// 清空
clearItems()
```

### 滚动控制

```javascript
// 滚动到指定索引
scrollToIndex(100, 'smooth')

// 滚动到指定项
scrollToItem(itemId, 'smooth')

// 滚动到顶部/底部
scrollToTop()
scrollToBottom()
```

### 选择功能

```javascript
// 切换选择
toggleSelect(id)

// 全选/取消全选
toggleSelectAll(true)

// 获取选中项
const selected = getSelectedItems()

// 清除选择
clearSelection()

// 检查是否选中
const isChecked = isSelected(id)
```

### 无限滚动

```html
<div x-data="virtualList({ itemHeight: 50 })"
     @load-more="loadMoreData()">
  <!-- ... -->
</div>

<script>
async function loadMoreData() {
  const list = Alpine.$data(this.$el)
  
  list.startLoadMore()
  
  try {
    const newData = await fetchMoreData()
    list.appendItems(newData)
    list.endLoadMore(newData.length > 0) // 是否还有更多
  } catch (error) {
    list.endLoadMore(false)
  }
}
</script>
```

## 键盘导航

| 按键 | 功能 |
|------|------|
| `↑` / `↓` | 上下移动焦点 |
| `Enter` / `Space` | 切换选择 |
| `Home` | 跳转第一项 |
| `End` | 跳转最后一项 |

启用键盘导航：

```html
<div x-data="virtualList({ ... })"
     @keydown="handleKeydown($event)"
     tabindex="0">
  <!-- ... -->
</div>
```

## 事件

| 事件名 | 说明 | 数据 |
|--------|------|------|
| `load-more` | 滚动到底部 | - |
| `item-activate` | 激活项（Enter键） | `{ item, index }` |
| `row-click` | 点击行（仅 virtualTable） | `{ row, index }` |
| `row-dblclick` | 双击行 | `{ row, index }` |

## 性能建议

1. **固定行高**：优先使用固定行高，动态行高会增加计算开销
2. **合适的 bufferSize**：通常 3-10 即可，太大会增加 DOM 节点
3. **唯一 key**：确保每项有唯一的 id 或 key
4. **避免复杂渲染**：单元格内容尽量简单，复杂组件考虑懒加载

## 兼容性

- 现代浏览器（Chrome、Firefox、Safari、Edge）
- 需要 Alpine.js 3.x
- 支持 ResizeObserver（自动响应容器大小变化）

