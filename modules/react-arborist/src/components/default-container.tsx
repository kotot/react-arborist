import { useState, useCallback, useRef, useEffect } from "react";
import { FixedSizeList } from "react-window";
import { useDataUpdates, useTreeApi } from "../context";
import { focusNextElement, focusPrevElement } from "../utils";
import { ListOuterElement } from "./list-outer-element";
import { ListInnerElement } from "./list-inner-element";
import { RowContainer } from "./row-container";
import type { NodeApi } from "../interfaces/node-api";
import { ROOT_ID } from "../data/create-root";

let focusSearchTerm = "";
let timeoutId: any = null;
// Sticky scroll state
interface StickyScrollNode {
  node: NodeApi<any>;
  position: number;
  height: number;
  startIndex: number;
  endIndex: number;
}

class StickyScrollState {
  constructor(readonly stickyNodes: StickyScrollNode[] = []) {}

  get count(): number {
    return this.stickyNodes.length;
  }

  // 判断最后一个粘性节点是否被部分遮挡（被子项"推上去"）
  lastNodePartiallyVisible(): boolean {
    if (this.count === 0) {
      return false;
    }

    const lastStickyNode = this.stickyNodes[this.count - 1];
    if (this.count === 1) {
      return lastStickyNode.position !== 0;
    }

    const secondLastStickyNode = this.stickyNodes[this.count - 2];
    return (
      secondLastStickyNode.position + secondLastStickyNode.height !==
      lastStickyNode.position
    );
  }

  // 检测是否只有位置变化而节点集合不变（用于动画优化）
  animationStateChanged(previousState: StickyScrollState): boolean {
    // 简化实现：暂时返回false
    return false;
  }

  // 比较两个状态是否相等
  equal(state: StickyScrollState): boolean {
    if (this.count !== state.count) {
      return false;
    }
    return this.stickyNodes.every(
      (node, i) =>
        node.node === state.stickyNodes[i].node &&
        node.position === state.stickyNodes[i].position,
    );
  }

  // 检查某个节点是否在sticky节点中
  contains(node: NodeApi<any>): boolean {
    return this.stickyNodes.some((stickyNode) => stickyNode.node === node);
  }
}

/**
 * All these keyboard shortcuts seem like they should be configurable.
 * Each operation should be a given a name and separated from
 * the event handler. Future clean up welcome.
 */
export function DefaultContainer() {
  useDataUpdates();
  const tree = useTreeApi();

  // Cleanup scroll timeout on component unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const [stickyNodes, setStickyNodes] = useState<NodeApi<any>[]>([]);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // 获取当前视窗内的节点
  const getNodesInViewport = (): NodeApi<any>[] => {
    return tree.visibleNodes.slice(
      tree.visibleStartIndex,
      tree.visibleStopIndex + 1,
    );
  };

  // 寻找第一个可见节点（相对于视窗）
  const getNodeAtHeight = (height: number): NodeApi<any> | undefined => {
    const rowHeight = tree.rowHeight;
    const relativeIndex = Math.floor(height / rowHeight);

    // 转换为 visibleNodes 数组中的绝对索引
    const absoluteIndex = tree.visibleStartIndex + relativeIndex;

    if (
      absoluteIndex < tree.visibleStartIndex ||
      absoluteIndex > tree.visibleStopIndex ||
      absoluteIndex >= tree.visibleNodes.length
    ) {
      return undefined;
    }
    return tree.visibleNodes[absoluteIndex];
  };

  /**
   * 找到node的某个祖先，这个祖先是previousAncestor的直接子节点
   * 如果previousAncestor为undefined，返回根节点的直接子节点
   *
   * 例如：树结构 root -> A -> B -> C -> node
   * - 如果previousAncestor是A，返回B（B是A的子节点）
   * - 如果previousAncestor是undefined，返回A（根的子节点）
   */
  const getAncestorUnderPrevious = (
    node: NodeApi<any>,
    previousAncestor: NodeApi<any> | undefined = undefined,
  ): NodeApi<any> | undefined => {
    let currentAncestor: NodeApi<any> = node;
    let parentOfCurrentAncestor: NodeApi<any> | null = currentAncestor.parent;
    if (parentOfCurrentAncestor?.id === ROOT_ID) {
      parentOfCurrentAncestor = null;
    }
    while (parentOfCurrentAncestor) {
      if (parentOfCurrentAncestor.id === previousAncestor?.id) {
        return currentAncestor;
      }
      currentAncestor = parentOfCurrentAncestor;
      parentOfCurrentAncestor = currentAncestor.parent;
      if (parentOfCurrentAncestor?.id === ROOT_ID) {
        parentOfCurrentAncestor = null;
      }
    }

    if (previousAncestor === undefined) {
      return currentAncestor;
    }

    return undefined;
  };

  const calculateStickyNodePosition = (
    lastDescendantIndex: number,
    stickyRowPositionTop: number,
    stickyNodeHeight: number,
  ): number => {
    // 简化实现：暂时直接返回默认位置
    // 完整实现需要计算最后一个子节点的位置，判断是否需要"推挤"效果

    // 在真实实现中，这里会：
    // 1. 获取最后一个子节点的相对位置
    // 2. 计算子节点的底部位置
    // 3. 如果sticky节点会覆盖子节点，调整位置（推挤效果）

    return stickyRowPositionTop;
  };

  const createStickyScrollNode = (
    node: NodeApi<any>,
    stickyNodesHeight: number,
  ): StickyScrollNode => {
    const rowHeight = tree.rowHeight;
    const height = rowHeight; // Assuming each node has the same height as rowHeight

    // Find the node's index in visibleNodes
    let startIndex = -1;
    for (let i = 0; i < tree.visibleNodes.length; i++) {
      if (tree.visibleNodes[i] === node) {
        startIndex = i;
        break;
      }
    }

    const endIndex = startIndex; // For now, assume single node

    // 使用calculateStickyNodePosition计算位置
    const position = calculateStickyNodePosition(
      endIndex,
      stickyNodesHeight,
      height,
    );

    return {
      node,
      position,
      height,
      startIndex,
      endIndex,
    };
  };

  const nodeIsUncollapsedParent = (node: NodeApi<any>): boolean => {
    return (
      node.isInternal &&
      node.isOpen &&
      !!node.children &&
      node.children.length > 0
    );
  };

  const nodeTopAlignsWithStickyNodesBottom = (
    node: NodeApi<any>,
    stickyNodesHeight: number,
  ): boolean => {
    // Simplified implementation: always return false for now
    return false;
  };

  const getNextStickyNode = (
    firstVisibleNodeUnderWidget: NodeApi<any>,
    previousStickyNode: NodeApi<any> | undefined,
    stickyNodesHeight: number,
  ): StickyScrollNode | undefined => {
    const nextStickyNode = getAncestorUnderPrevious(
      firstVisibleNodeUnderWidget,
      previousStickyNode,
    );
    if (!nextStickyNode) {
      return undefined;
    }

    if (nextStickyNode === firstVisibleNodeUnderWidget) {
      // 该行是叶子（文件）或折叠的目录（没有可见子项）
      if (!nodeIsUncollapsedParent(firstVisibleNodeUnderWidget)) {
        return undefined;
      }
      // 节点顶部与粘性区底部对齐
      if (
        nodeTopAlignsWithStickyNodesBottom(
          firstVisibleNodeUnderWidget,
          stickyNodesHeight,
        )
      ) {
        return undefined;
      }
    }

    return createStickyScrollNode(nextStickyNode, stickyNodesHeight);
  };

  const constrainStickyNodes = (
    stickyNodes: StickyScrollNode[],
  ): StickyScrollNode[] => {
    if (stickyNodes.length === 0) {
      return [];
    }

    const maxNodes = tree.props.stickyScrollMaxNodes || 5;
    const maxWidgetViewRatio = 0.4;
    const maximumStickyWidgetHeight = tree.height * maxWidgetViewRatio;

    // 从前往后遍历，检查每个节点
    for (let i = 0; i < stickyNodes.length; i++) {
      const stickyNode = stickyNodes[i];
      const stickyNodeBottom = stickyNode.position + stickyNode.height;

      // 如果超过高度限制或数量限制，返回前i个节点
      if (stickyNodeBottom > maximumStickyWidgetHeight || i >= maxNodes) {
        return stickyNodes.slice(0, i);
      }
    }

    return stickyNodes;
  };

  const getNextVisibleNode = (
    previousStickyNode: StickyScrollNode,
  ): NodeApi<any> | undefined => {
    return getNodeAtHeight(
      previousStickyNode.position + previousStickyNode.height,
    );
  };

  const findStickyState = (
    firstVisibleNode: NodeApi<any> | undefined,
  ): StickyScrollState | undefined => {
    if (!firstVisibleNode) {
      return undefined;
    }

    const maxNodes = tree.props.stickyScrollMaxNodes || 5;
    const stickyNodes: StickyScrollNode[] = [];
    let firstVisibleNodeUnderWidget: NodeApi<any> | undefined =
      firstVisibleNode;
    let stickyNodesHeight = 0;

    let nextStickyNode = getNextStickyNode(
      firstVisibleNodeUnderWidget,
      undefined,
      stickyNodesHeight,
    );
    while (nextStickyNode) {
      stickyNodes.push(nextStickyNode);
      stickyNodesHeight += nextStickyNode.height;

      if (stickyNodes.length <= maxNodes) {
        firstVisibleNodeUnderWidget = getNextVisibleNode(nextStickyNode);
        if (!firstVisibleNodeUnderWidget) {
          break;
        }
      }

      nextStickyNode = getNextStickyNode(
        firstVisibleNodeUnderWidget,
        nextStickyNode.node,
        stickyNodesHeight,
      );
      console.log("🚀 ~ findStickyState ~ nextStickyNode:", nextStickyNode);
    }
    console.log("🚀 ~ findStickyState ~ stickyNodes:", stickyNodes);
    const constrainedStickyNodes = constrainStickyNodes(stickyNodes);
    return constrainedStickyNodes.length
      ? new StickyScrollState(constrainedStickyNodes)
      : undefined;
  };

  // Calculate sticky nodes - simplified implementation like VSCode
  const calculateStickyNodes = (scrollOffset: number): NodeApi<any>[] => {
    if (
      !tree.props.stickyScroll ||
      tree.visibleNodes.length === 0 ||
      scrollOffset <= 0
    ) {
      return [];
    }

    // 直接获取第一个可见节点
    const firstVisibleNode = getNodeAtHeight(scrollOffset);

    // 如果没有可见节点或是虚拟根节点，返回空
    if (!firstVisibleNode) {
      return [];
    }

    // 获取sticky状态
    const stickyState = findStickyState(firstVisibleNode);

    // 如果没有sticky状态，返回空
    if (!stickyState) {
      return [];
    }

    // 返回sticky节点数组
    return stickyState.stickyNodes.map((stickyNode) => stickyNode.node);
  };

  // Handle scroll events
  const handleScroll = (props: any) => {
    if (tree.props.stickyScroll) {
      // Clear previous timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Update sticky nodes with debounce - 60fps
      scrollTimeoutRef.current = setTimeout(() => {
        const nodes = calculateStickyNodes(props.scrollOffset);
        setStickyNodes(nodes);
      }, 16);
    }

    // Call original onScroll handler
    if (tree.props.onScroll) {
      tree.props.onScroll(props);
    }
  };

  return (
    <div
      role="tree"
      style={{
        height: tree.height,
        width: tree.width,
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        position: "relative",
      }}
      onContextMenu={tree.props.onContextMenu}
      onClick={tree.props.onClick}
      tabIndex={0}
      onFocus={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          tree.onFocus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          tree.onBlur();
        }
      }}
      onKeyDown={(e) => {
        if (tree.isEditing) {
          return;
        }
        if (e.key === "Backspace") {
          if (!tree.props.onDelete) return;
          const ids = Array.from(tree.selectedIds);
          if (ids.length > 1) {
            let nextFocus = tree.mostRecentNode;
            while (nextFocus && nextFocus.isSelected) {
              nextFocus = nextFocus.nextSibling;
            }
            if (!nextFocus) nextFocus = tree.lastNode;
            tree.focus(nextFocus, { scroll: false });
            tree.delete(Array.from(ids));
          } else {
            const node = tree.focusedNode;
            if (node) {
              const sib = node.nextSibling;
              const parent = node.parent;
              tree.focus(sib || parent, { scroll: false });
              tree.delete(node);
            }
          }
          return;
        }
        if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault();
          focusNextElement(e.currentTarget);
          return;
        }
        if (e.key === "Tab" && e.shiftKey) {
          e.preventDefault();
          focusPrevElement(e.currentTarget);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = tree.nextNode;
          if (e.metaKey) {
            tree.select(tree.focusedNode);
            tree.activate(tree.focusedNode);
            return;
          } else if (!e.shiftKey || tree.props.disableMultiSelection) {
            tree.focus(next);
            return;
          } else {
            if (!next) return;
            const current = tree.focusedNode;
            if (!current) {
              tree.focus(tree.firstNode);
            } else if (current.isSelected) {
              tree.selectContiguous(next);
            } else {
              tree.selectMulti(next);
            }
            return;
          }
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = tree.prevNode;
          if (!e.shiftKey || tree.props.disableMultiSelection) {
            tree.focus(prev);
            return;
          } else {
            if (!prev) return;
            const current = tree.focusedNode;
            if (!current) {
              tree.focus(tree.lastNode); // ?
            } else if (current.isSelected) {
              tree.selectContiguous(prev);
            } else {
              tree.selectMulti(prev);
            }
            return;
          }
        }
        if (e.key === "ArrowRight") {
          const node = tree.focusedNode;
          if (!node) return;
          if (node.isInternal && node.isOpen) {
            tree.focus(tree.nextNode);
          } else if (node.isInternal) tree.open(node.id);
          return;
        }
        if (e.key === "ArrowLeft") {
          const node = tree.focusedNode;
          if (!node || node.isRoot) return;
          if (node.isInternal && node.isOpen) tree.close(node.id);
          else if (!node.parent?.isRoot) {
            tree.focus(node.parent);
          }
          return;
        }
        if (e.key === "a" && e.metaKey && !tree.props.disableMultiSelection) {
          e.preventDefault();
          tree.selectAll();
          return;
        }
        if (e.key === "a" && !e.metaKey && tree.props.onCreate) {
          tree.createLeaf();
          return;
        }
        if (e.key === "A" && !e.metaKey) {
          if (!tree.props.onCreate) return;
          tree.createInternal();
          return;
        }

        if (e.key === "Home") {
          // add shift keys
          e.preventDefault();
          tree.focus(tree.firstNode);
          return;
        }
        if (e.key === "End") {
          // add shift keys
          e.preventDefault();
          tree.focus(tree.lastNode);
          return;
        }
        if (e.key === "Enter") {
          const node = tree.focusedNode;
          if (!node) return;
          if (!node.isEditable || !tree.props.onRename) return;
          setTimeout(() => {
            if (node) tree.edit(node);
          });
          return;
        }
        if (e.key === " ") {
          e.preventDefault();
          const node = tree.focusedNode;
          if (!node) return;
          if (node.isLeaf) {
            node.select();
            node.activate();
          } else {
            node.toggle();
          }
          return;
        }
        if (e.key === "*") {
          const node = tree.focusedNode;
          if (!node) return;
          tree.openSiblings(node);
          return;
        }
        if (e.key === "PageUp") {
          e.preventDefault();
          tree.pageUp();
          return;
        }
        if (e.key === "PageDown") {
          e.preventDefault();
          tree.pageDown();
        }

        // If they type a sequence of characters
        // collect them. Reset them after a timeout.
        // Use it to search the tree for a node, then focus it.
        // Clean this up a bit later
        clearTimeout(timeoutId);
        focusSearchTerm += e.key;
        timeoutId = setTimeout(() => {
          focusSearchTerm = "";
        }, 600);
        const node = tree.visibleNodes.find((n) => {
          // @ts-ignore
          const name = n.data.name;
          if (typeof name === "string") {
            return name.toLowerCase().startsWith(focusSearchTerm);
          } else return false;
        });
        if (node) tree.focus(node.id);
      }}
    >
      {/* Sticky Headers Overlay */}
      {tree.props.stickyScroll &&
        stickyNodes.length > 0 &&
        (() => {
          // 创建StickyScrollState来传递给StickyHeader
          const stickyScrollNodes: StickyScrollNode[] = stickyNodes.map(
            (node, index) => ({
              node,
              position: index * tree.rowHeight,
              height: tree.rowHeight,
              startIndex: index,
              endIndex: index,
            }),
          );

          const stickyState = new StickyScrollState(stickyScrollNodes);

          return <StickyHeader stickyState={stickyState} />;
        })()}

      {/* @ts-ignore */}
      <FixedSizeList
        className={tree.props.className}
        outerRef={tree.listEl}
        itemCount={tree.visibleNodes.length}
        height={tree.height}
        width={tree.width}
        itemSize={tree.rowHeight}
        overscanCount={tree.overscanCount}
        itemKey={(index) => tree.visibleNodes[index]?.id || index}
        outerElementType={ListOuterElement}
        innerElementType={ListInnerElement}
        onScroll={handleScroll}
        onItemsRendered={tree.onItemsRendered.bind(tree)}
        ref={tree.list}
      >
        {RowContainer}
      </FixedSizeList>
    </div>
  );
}

interface StickyHeaderProps {
  stickyState: StickyScrollState | undefined;
}

function StickyHeader({ stickyState }: StickyHeaderProps) {
  const tree = useTreeApi();

  // 如果没有sticky状态或节点数为0，不渲染
  if (!stickyState || stickyState.count === 0) {
    return null;
  }

  const handleNodeClick = (node: NodeApi<any>) => {
    // Scroll to the corresponding node in the tree
    tree.scrollTo(node.id, "center");
    // Focus the node for better UX
    tree.focus(node);
  };

  // 计算总高度
  const lastNode = stickyState.stickyNodes[stickyState.count - 1];
  const totalHeight = lastNode.position + lastNode.height;

  const Node = tree.renderNode;
  const Row = tree.renderRow;

  return (
    <div
      className="sticky-scroll-container"
      style={{
        position: "absolute",
        top: 0,
        left: 100,
        right: 0,
        height: totalHeight,
        backgroundColor: "#f5f5f5",
        borderBottom: "1px solid #e0e0e0",
        zIndex: 100,
        overflow: "hidden",
      }}
    >
      {stickyState.stickyNodes.map((stickyNode, index) => {
        const node = stickyNode.node;
        const indent = node.level * tree.indent;

        const rowAttrs = {
          role: "treeitem",
          "aria-level": node.level + 1,
          "aria-selected": node.isSelected,
          "aria-expanded": node.isOpen,
          tabIndex: -1,
          className: "sticky-row",
          onClick: () => handleNodeClick(node),
          style: {
            position: "absolute" as const,
            top: stickyNode.position,
            left: 0,
            right: 0,
            height: stickyNode.height,
            display: "flex",
            alignItems: "center",
            backgroundColor:
              index === stickyState.count - 1 ? "#ebebeb" : "#f5f5f5",
            cursor: "pointer",
          },
        };

        const nodeStyle = { paddingLeft: indent };

        return (
          <Row key={node.id} node={node} innerRef={() => {}} attrs={rowAttrs}>
            <Node
              node={node}
              tree={tree}
              style={nodeStyle}
              dragHandle={() => {}}
            />
          </Row>
        );
      })}

      {/* 阴影效果 */}
      <div
        className="sticky-scroll-shadow"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "3px",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.1), transparent)",
        }}
      />
    </div>
  );
}
