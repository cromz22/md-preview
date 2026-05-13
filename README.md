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

Math equations are rendered with KaTeX:

```markdown
Inline math: $E = mc^2$

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```

For reliable rendering:

- Use `$$ ... $$` for display math. `\[ ... \]` is not supported by this converter.
- Put a blank line before and after display math blocks.
- Put spaces around inline math when it touches Japanese or other non-space-separated text: `これは $R$ です`.

Raw HTML inside Markdown is rendered as HTML. Use this only with Markdown files you trust.
