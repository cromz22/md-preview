import { spawn } from "node:child_process";
import path from "node:path";
import chokidar from "chokidar";
import {
  convertAll,
  convertFile,
  ensureDirectories,
  isMarkdownFile,
  removeOutputFor,
  type ConvertOptions
} from "./converter";

const options: ConvertOptions = {
  inputDir: path.resolve("input"),
  outputDir: path.resolve("output")
};

await ensureDirectories(options);
const count = await convertAll(options);
console.log(`Initial conversion complete: ${count} markdown file${count === 1 ? "" : "s"}.`);

const watcher = chokidar.watch(options.inputDir, {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 25
  }
});

watcher
  .on("add", handleChange)
  .on("change", handleChange)
  .on("unlink", async (filePath) => {
    if (!isMarkdownFile(filePath)) {
      return;
    }

    await removeOutputFor(filePath, options);
    const target = filePath.replace(options.inputDir, options.outputDir).replace(/\.(md|markdown)$/i, ".html");
    console.log(`Removed ${path.relative(options.outputDir, target)}`);
  });

const vite = spawn("bun", ["run", "serve"], {
  stdio: "inherit",
  env: process.env
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function handleChange(filePath: string): Promise<void> {
  if (!isMarkdownFile(filePath)) {
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

async function shutdown(): Promise<void> {
  await watcher.close();
  vite.kill();
  process.exit(0);
}
