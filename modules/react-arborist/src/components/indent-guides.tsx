import React from "react";
import { NodeApi } from "../interfaces/node-api";
import { TreeApi } from "../interfaces/tree-api";

const DEFAULT_COLOR = "var(--ra-indent-guide-color, rgba(99, 110, 123, 0.35))";
const DEFAULT_ACTIVE_COLOR = "var(--ra-indent-guide-active-color, rgba(99, 110, 123, 0.55))";
const LINE_WIDTH = 1;

type IndentGuidesProps<T> = {
  node: NodeApi<T>;
  tree: TreeApi<T>;
};

type Segment = {
  hasSiblingAfter: boolean;
  isCurrent: boolean;
};

export function IndentGuides<T>({ node, tree }: IndentGuidesProps<T>) {
  if (!tree.props.showIndentGuides || node.level <= 0) {
    return null;
  }

  const indent = tree.indent;
  if (indent <= 0) {
    return null;
  }

  const segments: Segment[] = [];
  let current: NodeApi<T> | null = node;

  while (current && current.parent && current.parent.level >= 0) {
    segments.unshift({
      hasSiblingAfter: Boolean(current.nextSibling),
      isCurrent: segments.length === 0,
    });
    current = current.parent;
  }

  if (segments.length === 0) {
    return null;
  }

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: indent * segments.length,
    pointerEvents: "none",
  };

  return (
    <div style={containerStyle} aria-hidden>
      {segments.map((segment, index) => {
        const left = index * indent;
        const center = indent / 2;
        const lineColor = segment.isCurrent ? DEFAULT_ACTIVE_COLOR : DEFAULT_COLOR;
        const verticalHeight = segment.isCurrent && !segment.hasSiblingAfter ? "50%" : "100%";
        const verticalStyle: React.CSSProperties = {
          position: "absolute",
          top: 0,
          height: verticalHeight,
          left: left + center,
          width: LINE_WIDTH,
          backgroundColor: lineColor,
          transform: "translateX(-50%)",
          borderRadius: LINE_WIDTH,
          opacity: segment.isCurrent ? 0.9 : 0.6,
        };

        const connectorStyle: React.CSSProperties = {
          position: "absolute",
          top: "50%",
          left: left + center,
          width: indent - center,
          height: LINE_WIDTH,
          backgroundColor: lineColor,
          transform: "translateY(-50%)",
          borderRadius: LINE_WIDTH,
        };

        const dotStyle: React.CSSProperties = {
          position: "absolute",
          top: "50%",
          left: left + center,
          width: LINE_WIDTH * 2,
          height: LINE_WIDTH * 2,
          backgroundColor: lineColor,
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          opacity: 0.8,
        };

        return (
          <React.Fragment key={index}>
            <div style={verticalStyle} />
            {segment.isCurrent && indent > LINE_WIDTH ? (
              <>
                <div style={connectorStyle} />
                <div style={dotStyle} />
              </>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}
