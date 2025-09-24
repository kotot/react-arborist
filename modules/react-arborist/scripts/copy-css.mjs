import { mkdir, readdir, stat, copyFile, rm } from "node:fs/promises";
import { join, dirname, normalize, relative } from "node:path";

const SOURCE_DIRECTORIES = [
  { root: join(process.cwd(), "src"), basePath: "" },
];
const OUTPUT_TARGETS = [
  { dir: join(process.cwd(), "dist", "main"), preserveStructure: true },
  { dir: join(process.cwd(), "dist", "module"), preserveStructure: true },
];

const CSS_EXTENSIONS = new Set([".css"]);
const WATCH_MODE = process.argv.includes("--watch");
let chokidar;

if (WATCH_MODE) {
  ({ default: chokidar } = await import("chokidar"));
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else {
      yield fullPath;
    }
  }
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function copyAsset(file, source) {
  const relPath = source.basePath
    ? join(source.basePath, relative(source.root, file))
    : relative(source.root, file);

  await Promise.all(
    OUTPUT_TARGETS.map(async ({ dir, preserveStructure }) => {
      const destination = preserveStructure
        ? join(dir, relPath)
        : join(dir, relPath.startsWith("styles/") ? relPath.replace(/^styles\//, "") : relPath);
      await ensureDir(dirname(destination));
      await copyFile(file, destination);
    }),
  );
}

async function removeAsset(relPath, { isDir = false } = {}) {
  const normalizedRelPath = normalize(relPath).replace(/\\/g, "/");
  await Promise.all(
    OUTPUT_TARGETS.map(async ({ dir, preserveStructure }) => {
      const destination = preserveStructure
        ? join(dir, normalizedRelPath)
        : join(
            dir,
            normalizedRelPath.startsWith("styles/")
              ? normalizedRelPath.replace(/^styles\//, "")
              : normalizedRelPath,
          );
      await rm(destination, { force: true, recursive: isDir });
    }),
  );
}

async function main() {
  const availableSources = [];

  for (const source of SOURCE_DIRECTORIES) {
    try {
      const stats = await stat(source.root);
      if (!stats.isDirectory()) continue;
      availableSources.push(source);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  if (availableSources.length === 0) {
    return;
  }

  const operations = [];

  for (const source of availableSources) {
    for await (const file of walk(source.root)) {
      const idx = file.lastIndexOf(".");
      if (idx === -1) continue;
      const ext = file.slice(idx);
      if (CSS_EXTENSIONS.has(ext)) {
        operations.push(copyAsset(file, source));
      }
    }
  }

  await Promise.all(operations);

  if (!WATCH_MODE) {
    return;
  }

  const watchers = availableSources.map((source) => ({
    source,
    watcher: chokidar.watch(join(source.root, "**", "*.css"), {
      ignoreInitial: true,
    }),
  }));

  for (const { watcher, source } of watchers) {
    watcher
      .on("add", (path) =>
        copyAsset(path, source).catch((error) =>
          console.error(`Failed to copy CSS asset added at ${path}:`, error),
        ),
      )
      .on("change", (path) =>
        copyAsset(path, source).catch((error) =>
          console.error(`Failed to copy CSS asset changed at ${path}:`, error),
        ),
      )
      .on("unlink", (path) =>
        removeAsset(
          source.basePath
            ? join(source.basePath, relative(source.root, path))
            : relative(source.root, path),
        ).catch((error) =>
          console.error(`Failed to remove CSS asset at ${path}:`, error),
        ),
      )
      .on("unlinkDir", (path) =>
        removeAsset(
          source.basePath
            ? join(source.basePath, relative(source.root, path))
            : relative(source.root, path),
          { isDir: true },
        ).catch((error) =>
          console.error(`Failed to remove CSS directory at ${path}:`, error),
        ),
      );
  }

  await new Promise((resolve, reject) => {
    watchers.forEach(({ watcher }) => watcher.on("error", reject));
  });
}

main().catch((error) => {
  console.error("Failed to copy CSS assets:", error);
  process.exit(1);
});
