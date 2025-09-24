import React from "react";
import { RowRendererProps } from "../types/renderers";
import { IdObj } from "../types/utils";

export function DefaultRow<T>({
  node,
  attrs,
  innerRef,
  children,
  guides,
}: RowRendererProps<T>) {
  return (
    <div
      {...attrs}
      ref={innerRef}
      onFocus={(e) => e.stopPropagation()}
      onClick={node.handleClick}
    >
      {guides}
      {children}
    </div>
  );
}
