# VS Code Sticky Scroll 实现分析

## 概述

VS Code 的 sticky scroll（粘性滚动）功能让树视图中的文件夹祖先在滚动时保持在顶部可见，为用户提供上下文信息。通过深入分析 VS Code 源码，我们理解了其核心实现机制。

## 核心实现逻辑

### 1. 触发条件 - 立即响应

```typescript
// 只要开始滚动就检查并显示展开路径
if (scrollOffset > 0 && expandedPath.length > 0) {
    return expandedPath;
}
```

**关键洞察**：VS Code 不等待节点完全滚出视口才显示 sticky。一旦开始滚动，立即显示完整的展开文件夹路径。

### 2. 展开路径发现 - 核心算法

```typescript
const firstVisibleIndex = Math.floor(scrollOffset / rowHeight);
let firstVisibleNode = tree.visibleNodes[firstVisibleIndex];

// 关键：如果第一个可见节点是展开的文件夹，寻找最深展开路径
let deepestNode = firstVisibleNode;
if (firstVisibleNode.isInternal && firstVisibleNode.isOpen) {
    // 沿着第一个子节点路径向下寻找最深的展开节点
    let currentNode = firstVisibleNode;
    while (currentNode.isInternal && currentNode.isOpen && currentNode.children.length > 0) {
        const firstChild = currentNode.children[0];
        if (tree.visibleNodes.indexOf(firstChild) > firstVisibleIndex) {
            currentNode = firstChild;
            deepestNode = firstChild;
        } else {
            break;
        }
    }
}
```

**要点**：
- 不只是找第一个可见节点，而是找到**最深的展开路径**
- 从第一个可见节点开始，如果它是展开的文件夹，继续向下查找
- 沿着第一个子节点路径深度遍历，直到找到最深的展开文件夹

### 3. 完整路径构建 - 向上收集

```typescript
const expandedPath = [];
let node = deepestNode;

// 从最深节点向上收集所有文件夹节点
while (node && !node.isRoot) {
    if (node.isInternal) {
        expandedPath.unshift(node);  // 保持层级顺序
    }
    node = node.parent;
}
```

**设计原则**：
- 从**最深的展开节点**开始向上遍历（不是第一个可见节点的父节点）
- 收集路径上的所有文件夹节点，形成完整的展开路径
- 使用 `unshift` 保持从根到叶的层级顺序

## VS Code 源码架构分析

### StickyScrollController 类

位于 `abstractTree.ts` 约第1050行，是粘性滚动的核心控制器：

```typescript
class StickyScrollController<T, TFilterData, TRef> {
    // 监听滚动事件，实时更新
    private update() {
        const firstVisibleNode = this.getNodeAtHeight(this.paddingTop);
        const stickyState = this.findStickyState(firstVisibleNode);
        this._widget.setState(stickyState);
    }
    
    // 核心算法：找到粘性状态
    private findStickyState(firstVisibleNode) {
        // 构建粘性节点数组
        // 使用 getAncestorUnderPrevious 递归构建祖先链
    }
}
```

### 关键方法：getAncestorUnderPrevious - 递归构建机制

```typescript
private getAncestorUnderPrevious(node, previousAncestor = undefined) {
    let currentAncestor = node;
    let parentOfCurrentAncestor = this.getParentNode(currentAncestor);

    while (parentOfCurrentAncestor) {
        if (parentOfCurrentAncestor === previousAncestor) {
            return currentAncestor;
        }
        currentAncestor = parentOfCurrentAncestor;
        parentOfCurrentAncestor = this.getParentNode(currentAncestor);
    }

    return previousAncestor === undefined ? currentAncestor : undefined;
}
```

**递归构建原理**：
1. **第一次调用**：`getAncestorUnderPrevious(firstVisibleNode, undefined)` 
   - 返回最顶层祖先（如 `src`）
   
2. **第二次调用**：`getAncestorUnderPrevious(firstVisibleNode, src)`
   - 返回 `src` 的直接子节点（如 `components`）
   
3. **第三次调用**：`getAncestorUnderPrevious(firstVisibleNode, components)`
   - 返回 `components` 的直接子节点（如 `layout`）

4. **继续递归**直到构建完整路径：`[src, components, layout, navigation]`

**用途**：通过递归调用构建从根到深层的完整展开路径，这就是为什么VS Code能同时显示多层文件夹。

## 性能优化策略

### 1. DOM 复用机制

VS Code 通过状态比较避免不必要的 DOM 重建：

```typescript
// 只有状态真正改变时才重新渲染
if (this._previousState && state.animationStateChanged(this._previousState)) {
    // 只更新位置，不重建DOM
    this._previousElements[index].style.top = `${position}px`;
} else {
    // 重新渲染所有元素
    this.renderState(state);
}
```

### 2. 节流机制

```typescript
// 使用 16ms 节流，约60fps
setTimeout(() => {
    const nodes = calculateStickyNodes(scrollOffset);
    setStickyNodes(nodes);
}, 16);
```

## CSS 样式实现

### 核心样式类

```css
.monaco-tree-sticky-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 13;
    background-color: var(--vscode-sideBar-background);
}

.monaco-tree-sticky-row {
    position: absolute;
    width: 100%;
    opacity: 1 !important;
    overflow: hidden;
}

.monaco-tree-sticky-row:hover {
    background-color: var(--vscode-list-hoverBackground) !important;
    cursor: pointer;
}
```

### 位置动画

通过动态设置 `top` 值实现流畅的"推出"动画效果：

```typescript
stickyElement.style.top = `${stickyNode.position}px`;
```

## React-Arborist 实现对比

### 原始问题

1. **延迟显示**：等待 `indexOf` 返回 -1 才显示，此时已太晚
2. **复杂判断**：过多的边界条件检查
3. **不完整祖先链**：没有正确构建完整路径

### 修复后的正确实现

```typescript
const calculateStickyNodes = useCallback((scrollOffset: number) => {
    if (!tree.props.stickyScroll || !tree.visibleNodes.length || scrollOffset <= 0) {
        return [];
    }

    const maxNodes = tree.props.stickyScrollMaxNodes || 5;
    const rowHeight = tree.rowHeight;
    
    // 第一步：找第一个可见节点
    const firstVisibleIndex = Math.floor(scrollOffset / rowHeight);
    let firstVisibleNode = tree.visibleNodes[firstVisibleIndex];
    
    if (!firstVisibleNode) return [];

    // 第二步：VS Code 核心策略 - 找到最深展开路径
    let deepestNode = firstVisibleNode;
    
    if (firstVisibleNode.isInternal && firstVisibleNode.isOpen) {
        let currentNode = firstVisibleNode;
        while (currentNode.isInternal && currentNode.isOpen && currentNode.children?.length > 0) {
            const firstChild = currentNode.children[0];
            const childIndex = tree.visibleNodes.indexOf(firstChild);
            if (childIndex !== -1 && childIndex > firstVisibleIndex) {
                currentNode = firstChild;
                deepestNode = firstChild;
            } else {
                break;
            }
        }
    }

    // 第三步：从最深节点向上构建完整路径
    const expandedPath = [];
    let node = deepestNode;
    
    while (node && !node.isRoot) {
        if (node.isInternal) {
            expandedPath.unshift(node);
        }
        node = node.parent;
    }
    
    return expandedPath.length > 0 ? expandedPath.slice(0, maxNodes) : [];
}, [dependencies]);
```

## 核心设计思想

### 1. 展开路径优先

VS Code 的实现不是简单显示"祖先节点"，而是显示"完整的展开路径"：
- 找到第一个可见节点
- 寻找最深的展开路径
- 显示从根到最深展开节点的完整路径

### 2. 递归构建策略

通过递归方式构建完整路径，而不是简单的向上遍历：
- 第一层：找到最顶层祖先
- 第二层：找到下一级展开的子节点
- 继续递归直到构建完整展开路径

### 3. 立即响应原则

一旦开始滚动就立即显示完整路径，不等待任何节点完全滚出视口。

## 实际效果示例

```
树结构：
src/               <- 开始滚出视口时
  components/      <- 展开状态
    layout/        <- 展开状态  
      navigation/  <- 展开状态，这是最深的展开文件夹
        file1.ts   <- 叶子节点
```

**VS Code 行为**：
- 当 `src` 开始滚出时，立即显示 `[src, components, layout, navigation]`
- 因为这是从根到最深展开节点的完整路径

## 总结

VS Code 的 sticky scroll 成功在于其**递归展开路径构建**：

1. **何时显示**：一旦滚动就检查展开路径
2. **显示什么**：从根到最深展开节点的完整路径
3. **如何构建**：递归构建，而不是简单向上遍历

这个实现的精髓在于**理解展开状态的语义**：用户展开了一个文件夹路径，当滚动时应该保持这个完整上下文可见，而不仅仅是直接父级。这种设计让用户始终知道当前位置在整个项目结构中的完整路径。