import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { convertAll, findMarkdownSymlinks } from "../src/converter";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("markdown symlink inputs", () => {
  test("converts a symlink whose filename matches the original markdown file", async () => {
    const { inputDir, outputDir, notesDir } = await createFixture();
    await writeFile(path.join(notesDir, "original.md"), "# Linked title\n\nBody", "utf8");
    await symlink(path.join(notesDir, "original.md"), path.join(inputDir, "original.md"));

    const count = await convertAll({ inputDir, outputDir });

    expect(count).toBe(1);
    const output = await readFile(path.join(outputDir, "original.html"), "utf8");
    expect(output).toContain("<h1>Linked title</h1>");
  });

  test("uses the symlink filename for output and rejects renamed links", async () => {
    const { inputDir, outputDir, notesDir } = await createFixture();
    await writeFile(path.join(notesDir, "original.md"), "# Original", "utf8");
    await symlink(path.join(notesDir, "original.md"), path.join(inputDir, "link.md"));

    await expect(convertAll({ inputDir, outputDir })).rejects.toThrow(/symlink name must match target filename/);
  });

  test("fails on broken markdown symlinks", async () => {
    const { inputDir, outputDir, notesDir } = await createFixture();
    await symlink(path.join(notesDir, "missing.md"), path.join(inputDir, "missing.md"));

    await expect(convertAll({ inputDir, outputDir })).rejects.toThrow(/broken or unreadable/);
  });

  test("ignores non-markdown symlinks even when they point to markdown files", async () => {
    const { inputDir, outputDir, notesDir } = await createFixture();
    await writeFile(path.join(notesDir, "original.md"), "# Original", "utf8");
    await symlink(path.join(notesDir, "original.md"), path.join(inputDir, "original.txt"));

    const count = await convertAll({ inputDir, outputDir });
    const symlinks = await findMarkdownSymlinks(inputDir);

    expect(count).toBe(0);
    expect(symlinks).toEqual([]);
  });
});

async function createFixture(): Promise<{ root: string; inputDir: string; outputDir: string; notesDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "md-preview-"));
  tempDirs.push(root);

  const inputDir = path.join(root, "input");
  const outputDir = path.join(root, "output");
  const notesDir = path.join(root, "notes");

  await Promise.all([mkdir(inputDir, { recursive: true }), mkdir(outputDir, { recursive: true }), mkdir(notesDir, { recursive: true })]);

  return { root, inputDir, outputDir, notesDir };
}
