import React from "react";
import { useTreeApi } from "../context";
import { DefaultContainer } from "./default-container";
import styles from "../styles/indent-guides.module.css";

export function TreeContainer() {
  const tree = useTreeApi();
  const Container = tree.props.renderContainer || DefaultContainer;
  return (
    <div className={styles["arborist-tree"]}>
      <Container />
    </div>
  );
}
