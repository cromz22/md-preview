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

Footnotes use GitHub-style syntax:

```markdown
Text with a footnote.[^1]

[^1]: Footnote body.
```

Footnote definitions can be placed anywhere in the Markdown file. They render as a linked footnotes section at the bottom of the generated page.

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

## Audio

Place audio files under `input/` and embed an HTML player in your Markdown:

```html
<audio controls preload="metadata" src="audio/recording.mp3">
  <a href="audio/recording.mp3">Download the recording</a>
</audio>
```

For `input/notes.md`, this example uses `input/audio/recording.mp3`.
Paths are relative to the Markdown file, so a file under `input/notes/` can use `../audio/recording.mp3`.
Use a Markdown filename other than `index.md`, because `output/index.html` is the generated site listing.

- Conversion copies audio files to matching paths under `output/`.
- Development mode copies added or changed audio files and removes deleted files from the output.
- Copied extensions: `.mp3`, `.wav`, `.ogg`, `.oga`, `.m4a`, `.aac`, `.flac`, `.opus`, and `.weba` (case-insensitive).
- Audio symlinks are not copied; place the audio files themselves under `input/`.
- Playback depends on the browser's support for the audio format and codec.
- Remote audio can use an HTTPS URL in `src` without a local file.
