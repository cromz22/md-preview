# Markdown Preview

A simple Bun + TypeScript Markdown-to-HTML converter with Vite live preview.

Edit Markdown files in `input/` with Vim or any command-line editor. The app converts them into matching HTML files in `output/` and serves `output/` through Vite.

## Setup

```bash
bun install
```

## Usage

Convert all Markdown files once:

```bash
bun run convert
```

Watch `input/`, regenerate HTML, and open the browser:

```bash
bun run dev
```

Build/check the project:

```bash
bun run build
```

## File Mapping

Markdown files under `input/` are converted recursively:

```text
input/index.md        -> output/index.html
input/notes/todo.md   -> output/notes/todo.html
input/post.markdown   -> output/post.html
```

## Markdown Support

Rendering uses `marked` with GitHub-flavored Markdown enabled, including tables, task lists, fenced code blocks, links, images, and blockquotes.

Raw HTML inside Markdown is rendered as HTML. Use this only with Markdown files you trust.
