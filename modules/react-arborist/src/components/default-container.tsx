import { useState, useCallback, useRef } from "react";
import { FixedSizeList } from "react-window";
import { useDataUpdates, useTreeApi } from "../context";
import { focusNextElement, focusPrevElement } from "../utils";
import { ListOuterElement } from "./list-outer-element";
import { ListInnerElement } from "./list-inner-element";
import { RowContainer } from "./row-container";
import type { NodeApi } from "../interfaces/node-api";

let focusSearchTerm = "";
let timeoutId: any = null;

/**
 * All these keyboard shortcuts seem like they should be configurable.
 * Each operation should be a given a name and separated from
 * the event handler. Future clean up welcome.
 */
export function DefaultContainer() {
  useDataUpdates();
  const tree = useTreeApi();

  // Sticky scroll state
  const [stickyNodes, setStickyNodes] = useState<NodeApi<any>[]>([]);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // Calculate sticky nodes from current scroll position
  const calculateStickyNodes = useCallback(
    (scrollOffset: number): NodeApi<any>[] => {
      if (
        !tree.props.stickyScroll ||
        !tree.visibleNodes.length ||
        scrollOffset <= 0
      ) {
        return [];
      }

      const maxNodes = tree.props.stickyScrollMaxNodes || 5;

      // Initial calculation without sticky compensation
      let currentIndex = Math.floor(scrollOffset / tree.rowHeight);
      let clampedIndex = Math.min(currentIndex, tree.visibleNodes.length - 1);
      let currentNode = tree.visibleNodes[clampedIndex];

      if (!currentNode) return [];

      // Build initial path to determine sticky count needed
      const buildPath = (node: NodeApi<any>): NodeApi<any>[] => {
        const path: NodeApi<any>[] = [];
        let n: NodeApi<any> | null = node;

        while (n && !n.isRoot) {
          if (n.isInternal) {
            path.unshift(n);
          }
          n = n.parent;
        }
        return path.slice(-maxNodes);
      };

      let path = buildPath(currentNode);
      
      // If we have potential sticky nodes, recalculate with compensation
      if (path.length > 0) {
        const stickyHeight = path.length * tree.rowHeight;
        const adjustedOffset = scrollOffset + stickyHeight;
        const adjustedIndex = Math.floor(adjustedOffset / tree.rowHeight);
        const adjustedClampedIndex = Math.min(adjustedIndex, tree.visibleNodes.length - 1);
        
        // Only use adjusted calculation if it gives us a different, valid node
        if (adjustedIndex !== currentIndex && tree.visibleNodes[adjustedClampedIndex]) {
          const adjustedNode = tree.visibleNodes[adjustedClampedIndex];
          const adjustedPath = buildPath(adjustedNode);
          
          // Use adjusted path only if it's substantially different
          if (adjustedPath.length !== path.length || 
              adjustedPath[adjustedPath.length - 1]?.id !== path[path.length - 1]?.id) {
            path = adjustedPath;
          }
        }
      }

      return path;
    },
    [
      tree.props.stickyScroll,
      tree.visibleNodes,
      tree.rowHeight,
      tree.props.stickyScrollMaxNodes,
    ],
  );

  // Handle scroll events
  const handleScroll = useCallback(
    (props: any) => {
      if (tree.props.stickyScroll) {
        // Clear previous timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        // Update sticky nodes with debounce
        scrollTimeoutRef.current = setTimeout(() => {
          const nodes = calculateStickyNodes(props.scrollOffset);
          setStickyNodes(nodes);
        }, 16); // ~60fps
      }

      // Call original onScroll handler
      if (tree.props.onScroll) {
        tree.props.onScroll(props);
      }
    },
    [tree.props.stickyScroll, calculateStickyNodes, tree.props.onScroll],
  );
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
      {tree.props.stickyScroll && stickyNodes.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            pointerEvents: "auto",
            maxHeight: tree.height,
          }}
        >
          {stickyNodes.map((node, index) => (
            <StickyHeader
              key={node.id}
              node={node}
              index={index}
              rowHeight={tree.rowHeight}
              tree={tree}
            />
          ))}
        </div>
      )}

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
  node: NodeApi<any>;
  index: number;
  rowHeight: number;
  tree: any;
}

function StickyHeader({ node, index, rowHeight, tree }: StickyHeaderProps) {
  const style = {
    position: "absolute" as const,
    top: index * rowHeight,
    left: 0,
    width: "100%",
    height: rowHeight,
  };

  const indent = tree.indent * node.level;
  const nodeStyle = { paddingLeft: indent };

  const rowStyle = {
    ...style,
  };

  const rowAttrs = {
    role: "treeitem",
    "aria-level": node.level + 1,
    "aria-selected": node.isSelected,
    "aria-expanded": node.isOpen,
    style: rowStyle,
    tabIndex: -1,
    className: "sticky-row",
  };

  const Node = tree.renderNode;
  const Row = tree.renderRow;

  return (
    <Row node={node} innerRef={() => {}} attrs={rowAttrs}>
      <Node node={node} tree={tree} style={nodeStyle} dragHandle={() => {}} />
    </Row>
  );
}
