import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import markedFootnote from "marked-footnote";
import markedKatex from "marked-katex-extension";

export type ConvertOptions = {
  inputDir: string;
  outputDir: string;
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

export async function convertAll(options: ConvertOptions): Promise<number> {
  await ensureOutputAssets(options.outputDir);
  const files = await findMarkdownFiles(options.inputDir);
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

async function ensureOutputAssets(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await cp(katexAssetPath("katex.min.css"), path.join(outputDir, "katex.min.css"));
  await cp(katexAssetPath("fonts"), path.join(outputDir, "fonts"), { recursive: true });
  await writeFile(path.join(outputDir, "styles.css"), renderedCss, "utf8");
}

async function findMarkdownFiles(directory: string): Promise<string[]> {
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
        return findMarkdownFiles(entryPath);
      }
      return entry.isFile() && isMarkdownFile(entryPath) ? [entryPath] : [];
    })
  );

  return files.flat();
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
