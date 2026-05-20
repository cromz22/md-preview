import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import chokidar from "chokidar";
import {
  convertFile,
  convertFiles,
  ensureDirectories,
  findMarkdownInputs,
  getMarkdownSymlink,
  isMarkdownFile,
  removeOutputFor,
  type MarkdownSymlink,
  type ConvertOptions
} from "./converter";

const options: ConvertOptions = {
  inputDir: path.resolve("input"),
  outputDir: path.resolve("output")
};

await ensureDirectories(options);
const initialInputs = await findMarkdownInputs(options.inputDir, { onInvalidSymlink: logInvalidSymlink });
const count = await convertFiles(initialInputs.files, options);
console.log(`Initial conversion complete: ${count} markdown file${count === 1 ? "" : "s"}.`);

const targetWatcher = chokidar.watch([], {
  ignoreInitial: true,
  usePolling: true,
  interval: 100,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 25
  }
});
const symlinkTargetsByLink = new Map<string, string>();
const symlinkLinksByTarget = new Map<string, Set<string>>();

for (const symlink of initialInputs.symlinks) {
  registerSymlink(symlink);
}

const watcher = chokidar.watch(options.inputDir, {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 25
  }
});

watcher
  .on("add", handleInputChange)
  .on("change", handleInputChange)
  .on("unlink", async (filePath) => {
    if (!isMarkdownFile(filePath)) {
      return;
    }

    unregisterSymlink(filePath);
    await removeOutputFor(filePath, options);
    const target = filePath.replace(options.inputDir, options.outputDir).replace(/\.(md|markdown)$/i, ".html");
    console.log(`Removed ${path.relative(options.outputDir, target)}`);
  });

targetWatcher.on("add", handleTargetChange).on("change", handleTargetChange).on("unlink", handleTargetUnlink);

const vite = spawn("bun", ["run", "serve"], {
  stdio: "inherit",
  env: process.env
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function handleInputChange(filePath: string): Promise<void> {
  if (!isMarkdownFile(filePath)) {
    return;
  }

  try {
    if (await isSymbolicLink(filePath)) {
      const symlink = await getMarkdownSymlink(filePath);
      if (!symlink) {
        return;
      }

      registerSymlink(symlink);
    } else {
      unregisterSymlink(filePath);
    }
  } catch (error) {
    unregisterSymlink(filePath);
    console.error(error);
    return;
  }

  try {
    const target = await convertFile(filePath, options);
    console.log(`Converted ${path.relative(options.inputDir, filePath)} -> ${path.relative(options.outputDir, target)}`);
  } catch (error) {
    console.error(`Failed to convert ${filePath}`);
    console.error(error);
  }
}

async function handleTargetChange(targetPath: string): Promise<void> {
  const linkPaths = symlinkLinksByTarget.get(path.resolve(targetPath));
  if (!linkPaths) {
    return;
  }

  await Promise.all([...linkPaths].map((linkPath) => convertLinkedFile(linkPath)));
}

async function handleTargetUnlink(targetPath: string): Promise<void> {
  const linkPaths = symlinkLinksByTarget.get(path.resolve(targetPath));
  if (!linkPaths) {
    return;
  }

  await Promise.all(
    [...linkPaths].map(async (linkPath) => {
      await removeOutputFor(linkPath, options);
      console.error(`Symlink target was removed: ${linkPath} -> ${targetPath}`);
    })
  );
}

async function convertLinkedFile(linkPath: string): Promise<void> {
  try {
    const target = await convertFile(linkPath, options);
    console.log(`Converted ${path.relative(options.inputDir, linkPath)} -> ${path.relative(options.outputDir, target)}`);
  } catch (error) {
    console.error(`Failed to convert ${linkPath}`);
    console.error(error);
  }
}

function registerSymlink(symlink: MarkdownSymlink): void {
  unregisterSymlink(symlink.linkPath);

  symlinkTargetsByLink.set(symlink.linkPath, symlink.targetPath);

  const links = symlinkLinksByTarget.get(symlink.targetPath) ?? new Set<string>();
  links.add(symlink.linkPath);
  symlinkLinksByTarget.set(symlink.targetPath, links);
  targetWatcher.add(symlink.targetPath);
}

function unregisterSymlink(linkPath: string): void {
  const targetPath = symlinkTargetsByLink.get(linkPath);
  if (!targetPath) {
    return;
  }

  symlinkTargetsByLink.delete(linkPath);
  const links = symlinkLinksByTarget.get(targetPath);
  links?.delete(linkPath);

  if (!links || links.size === 0) {
    symlinkLinksByTarget.delete(targetPath);
    targetWatcher.unwatch(targetPath);
  }
}

async function isSymbolicLink(filePath: string): Promise<boolean> {
  try {
    return (await lstat(filePath)).isSymbolicLink();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function logInvalidSymlink(error: unknown): void {
  console.error(error);
}

async function shutdown(): Promise<void> {
  await watcher.close();
  await targetWatcher.close();
  vite.kill();
  process.exit(0);
}
