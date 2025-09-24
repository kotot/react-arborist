import { useMemo } from "react";
import { NodeApi } from "../interfaces/node-api";
import { TreeApi } from "../interfaces/tree-api";
import styles from "../styles/indent-guides.module.css";

type IndentGuidesProps<T> = {
  node: NodeApi<T>;
  tree: TreeApi<T>;
};

/**
 * 获取节点的所有祖先节点
 *
 * 从给定节点开始，向上遍历获取所有父节点，用于缩进引导线计算。
 * 返回的数组从直接父节点开始，到根节点结束。
 *
 * @param node - 目标节点
 * @returns 祖先节点数组，从父节点到根节点
 */
const getAncestors = (node: NodeApi): NodeApi[] => {
  const ancestors: NodeApi[] = [];
  let current = node.parent;

  while (current) {
    ancestors.push(current);
    current = current.parent;
  }

  return ancestors;
};

export function getExpandedNodes<T>(tree: TreeApi<T>): NodeApi<T>[] {
  return tree.visibleNodes.filter((node) => node.isInternal && node.isOpen);
}

export function IndentGuides<T>({ node, tree }: IndentGuidesProps<T>) {
  const depth = node.level;
  const selectedFile = tree.selectedNodes[0];
  const expandedFolders = getExpandedNodes(tree);

  // 根节点不需要缩进线
  if (depth <= 0) return null;
  // 阶段一：计算 activeIndentNodeIds 集合
  // 当选中一个节点时，只将它的直接父节点（或自身，如果它是文件夹）标记为"活动"
  const activeIndentNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedFile) return ids;

    const selectedNode = tree.get(selectedFile.id);
    if (!selectedNode) return ids;

    // 如果选中节点是文件夹且处于展开状态，则将其自身ID加入集合
    if (
      selectedNode.children &&
      selectedNode.children.length > 0 &&
      selectedNode.isOpen
    ) {
      ids.add(selectedNode.id);
    } else if (selectedNode.parent) {
      // 如果是文件或关闭的文件夹，则将其父节点ID加入集合
      ids.add(selectedNode.parent.id);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, tree, expandedFolders]);

  const lines = [];

  // 阶段二：渲染缩进引导线
  // 从当前渲染的节点向上遍历，检查每一级的父节点是否在 activeIndentNodeIds 集合中
  const ancestors = getAncestors(node);
  // 为每个缩进层级生成垂直连接线
  for (let i = 0; i < depth; i++) {
    // tree.iconWidth 控制缩进线在图标区域内的横向位置
    const leftPos = i * tree.indent + tree.iconWidth / 2;

    // 获取当前层级对应的祖先节点
    // node.level - 1 - i 是为了从根部开始的祖先数组中正确索引
    const ancestor = ancestors[node.level - 1 - i];
    const isActive = !!(ancestor && activeIndentNodeIds.has(ancestor.id));

    lines.push(
      <div
        key={`vertical-${i}`}
        className={
          isActive
            ? `${styles.treeLineVertical} ${styles.treeLineVerticalActive}`
            : styles.treeLineVertical
        }
        style={{
          left: `${leftPos}px`,
          width: 0,
          position: "absolute",
          top: 0,
          height: tree.rowHeight,
          borderLeft: isActive
            ? tree.indentGuideActiveBorder
            : tree.indentGuideBorder,
        }}
      />,
    );
  }

  return <>{lines}</>;
}
