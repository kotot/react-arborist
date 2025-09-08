import useResizeObserver from "use-resize-observer";
import styles from "../styles/vscode.module.css";
import { NodeRendererProps, Tree } from "@byted/react-arborist";
import { SiTypescript } from "react-icons/si";
import { MdFolder } from "react-icons/md";
import clsx from "clsx";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

let id = 1;

type Entry = { name: string; id: string; children?: Entry[] };

const nextId = () => (id++).toString();
const file = (name: string) => ({ name, id: nextId() });
const folder = (name: string, ...children: Entry[]) => ({
  name,
  id: nextId(),
  children,
});

const structure = [
  folder(
    "src",
    file("index.ts"),
    folder(
      "components",
      folder(
        "ui",
        file("button.tsx"),
        file("input.tsx"),
        file("modal.tsx"),
        file("table.tsx"),
        folder(
          "forms",
          file("login-form.tsx"),
          file("signup-form.tsx"),
          file("contact-form.tsx"),
        ),
      ),
      folder(
        "layout",
        file("header.tsx"),
        file("sidebar.tsx"),
        file("footer.tsx"),
        folder(
          "navigation",
          file("nav-bar.tsx"),
          file("breadcrumb.tsx"),
          file("menu.tsx"),
        ),
      ),
    ),
    folder(
      "lib",
      file("index.ts"),
      file("worker.ts"),
      file("utils.ts"),
      file("model.ts"),
      folder(
        "api",
        file("client.ts"),
        file("auth.ts"),
        file("endpoints.ts"),
        folder(
          "services",
          file("user-service.ts"),
          file("data-service.ts"),
          file("file-service.ts"),
        ),
      ),
    ),
    folder(
      "hooks",
      file("use-auth.ts"),
      file("use-data.ts"),
      file("use-api.ts"),
      folder(
        "common",
        file("use-local-storage.ts"),
        file("use-debounce.ts"),
        file("use-previous.ts"),
      ),
    ),
    folder(
      "styles",
      file("globals.css"),
      file("variables.css"),
      folder(
        "components",
        file("button.module.css"),
        file("form.module.css"),
        file("layout.module.css"),
      ),
    ),
  ),
  folder(
    "tests",
    file("setup.ts"),
    folder(
      "unit",
      file("utils.test.ts"),
      file("components.test.tsx"),
      folder("api", file("client.test.ts"), file("services.test.ts")),
    ),
  ),
  file("package.json"),
  file("tsconfig.json"),
  file("README.md"),
];

function sortChildren(node: Entry): Entry {
  if (!node.children) return node;
  const copy = [...node.children];
  copy.sort((a, b) => {
    if (!!a.children && !b.children) return -1;
    if (!!b.children && !a.children) return 1;
    return a.name < b.name ? -1 : 1;
  });
  const children = copy.map(sortChildren);
  return { ...node, children };
}

function useTreeSort(data: Entry[]) {
  return data.map(sortChildren);
}

function Node({ style, node, dragHandle, tree }: NodeRendererProps<Entry>) {
  return (
    <div
      style={style}
      className={clsx(styles.node, node.state, {
        [styles.highlight]:
          tree.dragDestinationParent?.isAncestorOf(node) &&
          tree.dragDestinationParent?.id !== tree.dragNode?.parent?.id,
      })}
      ref={dragHandle}
    >
      {node.isInternal ? <MdFolder /> : <SiTypescript />}
      {node.data.name} {node.id}
    </div>
  );
}

function VSCodeDemoPage() {
  const { width, height, ref } = useResizeObserver();
  const [scrollPosition, setScrollPosition] = useState(0);
  const [mounted, setMounted] = useState(false);

  const data = useTreeSort(structure);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={styles.root}>
        <aside className={styles.sidebar}>
          <div style={{ padding: "1rem", color: "rgb(95, 122, 135)" }}>
            Loading...
          </div>
        </aside>
        <main className={styles.main}>
          <div className={styles.content}>
            <h1>VS Code Sticky Scroll Demo</h1>
            <p>Loading demo...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar} ref={ref}>
        <Tree
          data={data}
          width={width}
          height={height}
          rowHeight={22}
          stickyScroll={true}
          stickyScrollMaxNodes={4}
          onMove={() => {}}
          renderCursor={() => null}
          onScroll={(props) => {
            setScrollPosition(props.scrollOffset);
          }}
        >
          {Node}
        </Tree>
      </aside>
      <main className={styles.main}>
        <div className={styles.content}>
          <h1>VS Code Sticky Scroll Demo</h1>
          <p>
            This demo showcases the <strong>sticky scroll</strong> feature,
            inspired by VS Code&apos;s implementation. Parent folder hierarchy
            stays visible while scrolling through deeply nested structures.
          </p>

          <h2>🎯 Features</h2>
          <ul>
            <li>Folder hierarchy remains visible while scrolling</li>
            <li>Maximum 4 sticky levels to avoid clutter</li>
            <li>VS Code-style dark theme integration</li>
            <li>Smooth 60fps scrolling performance</li>
            <li>Click sticky headers to toggle folders</li>
          </ul>

          <h2>✨ Sticky Scroll Active</h2>
          <p>
            The sticky scroll feature is now active! Scroll through the file
            tree on the left and watch how parent folders stay at the top for
            easy navigation context.
          </p>

          <h2>🚀 How to use</h2>
          <ol>
            <li>Scroll through the deeply nested file structure</li>
            <li>Notice how parent folders stay at the top</li>
            <li>Try clicking on the sticky folder headers</li>
            <li>Expand/collapse folders to see the effect</li>
          </ol>

          <h2>📊 Current State</h2>
          <ul>
            <li>
              Scroll Position: <code>{Math.round(scrollPosition)}px</code>
            </li>
            <li>
              Total Nodes:{" "}
              <code>{JSON.stringify(data).split('"id"').length - 1}</code>
            </li>
            <li>
              Max Sticky Nodes: <code>4</code>
            </li>
          </ul>

          <h2>💻 Code Example</h2>
          <pre className={styles.code}>
            {`<Tree
  data={fileData}
  stickyScroll={true}
  stickyScrollMaxNodes={4}
  height={400}
  width={300}
  rowHeight={22}
>
  {NodeRenderer}
</Tree>`}
          </pre>
        </div>
      </main>
    </div>
  );
}

export default dynamic(() => Promise.resolve(VSCodeDemoPage), { ssr: false });
