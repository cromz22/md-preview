import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { convertAll, findMarkdownSymlinks, writeSiteIndex } from "../src/converter";

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

describe("site index", () => {
  test("lists top-level and nested output html files", async () => {
    const { outputDir } = await createFixture();
    await mkdir(path.join(outputDir, "nested"), { recursive: true });
    await Promise.all([
      writeFile(path.join(outputDir, "alpha.html"), "<h1>Alpha</h1>", "utf8"),
      writeFile(path.join(outputDir, "nested", "beta.html"), "<h1>Beta</h1>", "utf8"),
      writeFile(path.join(outputDir, "styles.css"), "body {}", "utf8"),
      writeFile(path.join(outputDir, "index.html"), "old index", "utf8")
    ]);

    await writeSiteIndex(outputDir);

    const index = await readFile(path.join(outputDir, "index.html"), "utf8");
    expect(index).toContain('<a href="alpha.html">alpha.html</a>');
    expect(index).toContain('<a href="nested/beta.html">nested/beta.html</a>');
    expect(index).not.toContain('<a href="index.html">index.html</a>');
    expect(index).not.toContain('<a href="styles.css">styles.css</a>');
  });

  test("updates when output html files are added or removed", async () => {
    const { outputDir } = await createFixture();
    const firstFile = path.join(outputDir, "first.html");
    const secondFile = path.join(outputDir, "second.html");
    await writeFile(firstFile, "<h1>First</h1>", "utf8");

    await writeSiteIndex(outputDir);
    let index = await readFile(path.join(outputDir, "index.html"), "utf8");
    expect(index).toContain("first.html");
    expect(index).not.toContain("second.html");

    await writeFile(secondFile, "<h1>Second</h1>", "utf8");
    await rm(firstFile);
    await writeSiteIndex(outputDir);

    index = await readFile(path.join(outputDir, "index.html"), "utf8");
    expect(index).not.toContain("first.html");
    expect(index).toContain("second.html");
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
