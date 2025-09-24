import { mkdir, readdir, stat, copyFile, rm } from "node:fs/promises";
import { join, dirname, normalize } from "node:path";

const SOURCE_DIR = join(process.cwd(), "src");
const OUTPUT_TARGETS = [
  { dir: join(process.cwd(), "dist", "main"), preserveStructure: true },
  { dir: join(process.cwd(), "dist", "module"), preserveStructure: true },
  { dir: join(process.cwd(), "styles"), preserveStructure: false },
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

async function copyAsset(file) {
  const relPath = file.slice(SOURCE_DIR.length + 1);

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
  try {
    await stat(SOURCE_DIR);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const operations = [];
  for await (const file of walk(SOURCE_DIR)) {
    const idx = file.lastIndexOf(".");
    if (idx === -1) continue;
    const ext = file.slice(idx);
    if (CSS_EXTENSIONS.has(ext)) {
      operations.push(copyAsset(file));
    }
  }

  await Promise.all(operations);

  if (!WATCH_MODE) {
    return;
  }

  const watcher = chokidar.watch(join(SOURCE_DIR, "**", "*.css"), {
    ignoreInitial: true,
  });

  watcher
    .on("add", (path) =>
      copyAsset(path).catch((error) =>
        console.error(`Failed to copy CSS asset added at ${path}:`, error),
      ),
    )
    .on("change", (path) =>
      copyAsset(path).catch((error) =>
        console.error(`Failed to copy CSS asset changed at ${path}:`, error),
      ),
    )
    .on("unlink", (path) =>
      removeAsset(path.slice(SOURCE_DIR.length + 1)).catch((error) =>
        console.error(`Failed to remove CSS asset at ${path}:`, error),
      ),
    )
    .on("unlinkDir", (path) =>
      removeAsset(path.slice(SOURCE_DIR.length + 1), { isDir: true }).catch((error) =>
        console.error(`Failed to remove CSS directory at ${path}:`, error),
      ),
    );

  await new Promise((resolve, reject) => {
    watcher.on("error", reject);
  });
}

main().catch((error) => {
  console.error("Failed to copy CSS assets:", error);
  process.exit(1);
});
