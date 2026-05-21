import { cp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import markedFootnote from "marked-footnote";
import markedKatex from "marked-katex-extension";

export type ConvertOptions = {
  inputDir: string;
  outputDir: string;
};

export type MarkdownSymlink = {
  linkPath: string;
  targetPath: string;
};

export type MarkdownInputs = {
  files: string[];
  symlinks: MarkdownSymlink[];
};

export type FindMarkdownInputOptions = {
  onInvalidSymlink?: (error: unknown) => void;
};

const markdownExtensions = new Set([".md", ".markdown"]);

marked.use({
  gfm: true,
  breaks: false
});

marked.use(
  markedKatex({
    throwOnError: false
  })
);

marked.use(markedFootnote());

export function isMarkdownFile(filePath: string): boolean {
  return markdownExtensions.has(path.extname(filePath).toLowerCase());
}

export function outputPathFor(inputFile: string, options: ConvertOptions): string {
  const relativePath = path.relative(options.inputDir, inputFile);
  const parsed = path.parse(relativePath);
  return path.join(options.outputDir, parsed.dir, `${parsed.name}.html`);
}

export async function convertAll(options: ConvertOptions, findOptions: FindMarkdownInputOptions = {}): Promise<number> {
  const { files } = await findMarkdownInputs(options.inputDir, findOptions);
  const count = await convertFiles(files, options);
  await writeSiteIndex(options.outputDir);
  return count;
}

export async function convertFiles(files: string[], options: ConvertOptions): Promise<number> {
  await ensureOutputAssets(options.outputDir);
  await Promise.all(files.map((file) => convertFile(file, options)));
  return files.length;
}

export async function convertFile(inputFile: string, options: ConvertOptions): Promise<string> {
  await ensureOutputAssets(options.outputDir);
  const source = await readFile(inputFile, "utf8");
  const html = await marked.parse(source);
  const title = extractTitle(source) ?? path.basename(inputFile);
  const target = outputPathFor(inputFile, options);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, renderDocument(title, html), "utf8");
  return target;
}

export async function removeOutputFor(inputFile: string, options: ConvertOptions): Promise<void> {
  await rm(outputPathFor(inputFile, options), { force: true });
}

export async function ensureDirectories(options: ConvertOptions): Promise<void> {
  await mkdir(options.inputDir, { recursive: true });
  await mkdir(options.outputDir, { recursive: true });
}

export async function writeSiteIndex(outputDir: string): Promise<string> {
  await ensureOutputAssets(outputDir);
  const files = await findOutputHtmlFiles(outputDir);
  const body = renderSiteIndex(files);
  const target = path.join(outputDir, "index.html");
  const nextContent = renderDocument("Available Sites", body);
  let currentContent;

  try {
    currentContent = await readFile(target, "utf8");
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  if (currentContent !== nextContent) {
    await writeFile(target, nextContent, "utf8");
  }

  return target;
}

async function findOutputHtmlFiles(outputDir: string, directory = outputDir): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return findOutputHtmlFiles(outputDir, entryPath);
      }

      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".html") {
        return [];
      }

      const relativePath = toOutputRelativePath(outputDir, entryPath);
      return relativePath === "index.html" ? [] : [relativePath];
    })
  );

  return files.flat().sort((first, second) => first.localeCompare(second));
}

function renderSiteIndex(files: string[]): string {
  const items = files
    .map((file) => `<li><a href="${escapeHtml(file)}">${escapeHtml(file)}</a></li>`)
    .join("\n");

  return `<h1>Available Sites</h1>
${items ? `<ul>\n${items}\n</ul>` : "<p>No sites available.</p>"}
`;
}

function toOutputRelativePath(outputDir: string, filePath: string): string {
  return path.relative(outputDir, filePath).split(path.sep).join("/");
}

async function ensureOutputAssets(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await cp(katexAssetPath("katex.min.css"), path.join(outputDir, "katex.min.css"));
  await cp(katexAssetPath("fonts"), path.join(outputDir, "fonts"), { recursive: true });
  await writeFile(path.join(outputDir, "styles.css"), renderedCss, "utf8");
}

export async function findMarkdownSymlinks(
  directory: string,
  findOptions: FindMarkdownInputOptions = {}
): Promise<MarkdownSymlink[]> {
  const { symlinks } = await findMarkdownInputs(directory, findOptions);
  return symlinks;
}

export async function getMarkdownSymlink(linkPath: string): Promise<MarkdownSymlink | undefined> {
  if (!isMarkdownFile(linkPath)) {
    return undefined;
  }

  let targetStats;
  let targetPath;

  try {
    [targetStats, targetPath] = await Promise.all([stat(linkPath), realpath(linkPath)]);
  } catch (error) {
    throw new Error(`Invalid markdown symlink: ${linkPath} is broken or unreadable.`, { cause: error });
  }

  if (!targetStats.isFile()) {
    throw new Error(`Invalid markdown symlink: ${linkPath} target is not a regular file.`);
  }

  const linkName = path.basename(linkPath);
  const targetName = path.basename(targetPath);

  if (linkName !== targetName) {
    throw new Error(
      `Invalid markdown symlink: ${linkPath} points to ${targetName}; symlink name must match target filename.`
    );
  }

  return { linkPath, targetPath };
}

export async function findMarkdownInputs(
  directory: string,
  findOptions: FindMarkdownInputOptions = {}
): Promise<MarkdownInputs> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return { files: [], symlinks: [] };
    }
    throw error;
  }

  const inputs = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return findMarkdownInputs(entryPath, findOptions);
      }
      if (entry.isSymbolicLink()) {
        try {
          const symlink = await getMarkdownSymlink(entryPath);
          return symlink ? { files: [entryPath], symlinks: [symlink] } : { files: [], symlinks: [] };
        } catch (error) {
          if (!findOptions.onInvalidSymlink) {
            throw error;
          }

          findOptions.onInvalidSymlink(error);
          return { files: [], symlinks: [] };
        }
      }
      return entry.isFile() && isMarkdownFile(entryPath)
        ? { files: [entryPath], symlinks: [] }
        : { files: [], symlinks: [] };
    })
  );

  return inputs.reduce(
    (result, input) => ({
      files: result.files.concat(input.files),
      symlinks: result.symlinks.concat(input.symlinks)
    }),
    { files: [], symlinks: [] }
  );
}

function extractTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function renderDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/katex.min.css">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="markdown-body">
${body}
    </main>
  </body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function katexAssetPath(asset: string): string {
  return path.join(process.cwd(), "node_modules", "katex", "dist", asset);
}

const renderedCss = `:root {
  color: #1f2933;
  background: #f6f8fa;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6;
}

body {
  margin: 0;
  padding: 32px 16px;
}

.markdown-body {
  box-sizing: border-box;
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 32px;
  background: #ffffff;
  border: 1px solid #d8dee4;
  border-radius: 8px;
}

.markdown-body > :first-child {
  margin-top: 0;
}

.markdown-body > :last-child {
  margin-bottom: 0;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  line-height: 1.25;
  margin: 24px 0 12px;
}

h1,
h2 {
  padding-bottom: 8px;
  border-bottom: 1px solid #d8dee4;
}

a {
  color: #0969da;
}

blockquote {
  margin: 16px 0;
  padding: 0 16px;
  color: #57606a;
  border-left: 4px solid #d0d7de;
}

pre,
code {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 0.94em;
}

code {
  padding: 0.2em 0.4em;
  background: #eff3f6;
  border-radius: 6px;
}

pre {
  overflow-x: auto;
  padding: 16px;
  background: #f6f8fa;
  border-radius: 8px;
}

pre code {
  padding: 0;
  background: transparent;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

th,
td {
  padding: 8px 12px;
  border: 1px solid #d0d7de;
}

th {
  background: #f6f8fa;
}

img {
  max-width: 100%;
}

.footnotes {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid #d8dee4;
  color: #57606a;
  font-size: 0.94em;
}

.footnotes ol {
  padding-left: 24px;
}

.footnotes li {
  margin: 8px 0;
}

[data-footnote-ref] {
  font-size: 0.8em;
  text-decoration: none;
}

[data-footnote-backref] {
  margin-left: 4px;
  text-decoration: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  body {
    padding: 0;
  }

  .markdown-body {
    min-height: 100vh;
    padding: 20px;
    border: 0;
    border-radius: 0;
  }
}
`;
