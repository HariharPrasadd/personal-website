#!/usr/bin/env python3
"""Convert a constrained Markdown essay into this site's blog HTML template.

This converter is intentionally deterministic and stdlib-only. It is not a
general Markdown implementation - it only supports the subset that already
appears across this site:

- `#`, `##`, `###`, `####` headings
- paragraphs
- blockquotes using `>`
- unordered and ordered lists
- fenced code blocks
- inline emphasis, code, and links
- footnote references `[^1]` and footnote definitions `[^1]: ...`

The output matches the site's existing blog post conventions:
- `.blogpost-container` wrapper
- `.blog-date`
- `.link` anchors
- `blockquote` for quoted passages
- `.footnotes` section with backreferences
"""

from __future__ import annotations

import argparse
import html
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse


HEADING_RE = re.compile(r"^(#{1,4})\s+(.*)$")
ORDERED_LIST_RE = re.compile(r"^\d+\.\s+(.*)$")
UNORDERED_LIST_RE = re.compile(r"^[-*]\s+(.*)$")
FOOTNOTE_DEF_RE = re.compile(r"^\[\^([^\]]+)\]:\s*(.*)$")
REFERENCE_RE = re.compile(r"\[\^([^\]]+)\]")
CODE_RE = re.compile(r"`([^`]+)`")
EM_RE = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
STRONG_RE = re.compile(r"(?<!\*)\*\*([^*]+)\*\*(?!\*)")
UNDERSCORE_EM_RE = re.compile(r"(?<![\w_])_([^_]+)_(?![\w_])")


@dataclass
class Block:
    kind: str
    lines: list[str]
    meta: str | None = None


@dataclass
class FrontMatter:
    raw: dict[str, object]
    display_date: str | None = None


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the converter."""
    parser = argparse.ArgumentParser(
        description="Convert a Markdown essay into this site's blog HTML template."
    )
    parser.add_argument("input", type=Path, help="Path to the source markdown file.")
    parser.add_argument(
        "output",
        type=Path,
        help="Path to the destination HTML file, usually under pages/blog/.",
    )
    parser.add_argument(
        "--title",
        help="Explicit page title. Defaults to the first level-1 heading if omitted.",
    )
    parser.add_argument(
        "--date",
        help='Display date for the post, e.g. "July 27th, 2026".',
    )
    parser.add_argument(
        "--description",
        help="Meta description. Defaults to the first non-heading paragraph.",
    )
    return parser.parse_args()


def ordinal(day: int) -> str:
    """Return an English ordinal for a day number."""
    if 10 <= day % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"


def format_display_date(year: int, month: int, day: int) -> str:
    """Format a numeric date in the same style used across the site."""
    month_name = date(year, month, day).strftime("%B")
    return f"{month_name} {ordinal(day)}, {year}"


def parse_front_matter(lines: list[str]) -> tuple[FrontMatter, list[str]]:
    """Parse a minimal YAML-style front matter block if present.

    This is intentionally tiny and only supports the structures we actually use
    in Obsidian notes right now:
    - `key: value`
    - `key:` followed by `- item` lines
    """
    if len(lines) < 2 or lines[0].strip() != "---":
        return FrontMatter(raw={}), lines

    end_index = None
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            end_index = index
            break

    if end_index is None:
        return FrontMatter(raw={}), lines

    raw: dict[str, object] = {}
    current_key: str | None = None
    for line in lines[1:end_index]:
        stripped = line.rstrip()
        if not stripped:
            continue
        if stripped.startswith("  - ") or stripped.startswith("- "):
            if current_key is None:
                continue
            value = stripped.split("- ", 1)[1].strip()
            raw.setdefault(current_key, [])
            assert isinstance(raw[current_key], list)
            raw[current_key].append(value)
            continue
        if ":" in stripped:
            key, value = stripped.split(":", 1)
            key = key.strip()
            value = value.strip()
            current_key = key
            raw[key] = value if value else []

    display_date = None
    tags = raw.get("tags")
    if isinstance(tags, list):
        for tag in tags:
            match = re.fullmatch(r"time/date/(\d{4})/(\d{2})/(\d{2})", str(tag))
            if match:
                year, month, day = map(int, match.groups())
                display_date = format_display_date(year, month, day)
                break

    return FrontMatter(raw=raw, display_date=display_date), lines[end_index + 1 :]


def title_from_filename(path: Path) -> str:
    """Derive a readable title from a Markdown filename when needed."""
    name = path.stem
    name = re.sub(r"\s+", " ", name.replace("_", " ").replace("-", " ")).strip()
    return name


def normalize_source_markdown(text: str) -> str:
    """Clean up a few recurring source-note quirks before parsing."""
    text = re.sub(
        r"\[([^\]]+)\]\(\[(https?://[^)\"]+)\"\)",
        r"[\1](\2)",
        text,
    )
    return text


def extract_footnotes(lines: list[str]) -> tuple[list[str], dict[str, str]]:
    """Split footnote definitions out of the main document.

    Continuation lines that are indented are folded into the same footnote.
    Blank lines inside a footnote become paragraph breaks in the rendered note.
    """
    body_lines: list[str] = []
    footnotes: dict[str, str] = {}

    index = 0
    while index < len(lines):
        line = lines[index]
        match = FOOTNOTE_DEF_RE.match(line)
        if not match:
            body_lines.append(line)
            index += 1
            continue

        footnote_id = match.group(1)
        note_lines = [match.group(2).rstrip()]
        index += 1

        while index < len(lines):
            continuation = lines[index]
            if continuation.startswith("    ") or continuation.startswith("\t"):
                note_lines.append(continuation.lstrip())
                index += 1
                continue
            if continuation.strip() == "":
                # Keep deliberate paragraph breaks inside long footnotes.
                note_lines.append("")
                index += 1
                continue
            break

        footnotes[footnote_id] = "\n".join(note_lines).strip()

    return body_lines, footnotes


def split_blocks(lines: list[str]) -> list[Block]:
    """Turn raw Markdown lines into coarse blocks.

    This parser is deliberately simple because the site content is essay-shaped
    rather than deeply nested Markdown.
    """
    blocks: list[Block] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if stripped == "":
            index += 1
            continue

        if stripped.startswith("```"):
            fence = stripped
            language = stripped[3:].strip() or None
            code_lines: list[str] = []
            index += 1
            while index < len(lines) and lines[index].strip() != fence:
                code_lines.append(lines[index])
                index += 1
            if index < len(lines):
                index += 1
            blocks.append(Block(kind="code", lines=code_lines, meta=language))
            continue

        if stripped.startswith(">"):
            quote_lines: list[str] = []
            while index < len(lines):
                current = lines[index]
                # A blockquote only continues on lines that explicitly carry the
                # `>` marker. This prevents two adjacent quote blocks separated
                # by a normal blank line from being merged together.
                if not current.lstrip().startswith(">"):
                    break
                # Preserve the content after the first blockquote marker.
                marker_index = current.index(">")
                quote_lines.append(current[marker_index + 1 :].lstrip())
                index += 1
            blocks.append(Block(kind="blockquote", lines=quote_lines))
            continue

        heading_match = HEADING_RE.match(stripped)
        if heading_match:
            blocks.append(
                Block(
                    kind=f"h{len(heading_match.group(1))}",
                    lines=[heading_match.group(2).strip()],
                )
            )
            index += 1
            continue

        if ORDERED_LIST_RE.match(stripped):
            items: list[str] = []
            while index < len(lines):
                current = lines[index].strip()
                match = ORDERED_LIST_RE.match(current)
                if not match:
                    break
                items.append(match.group(1).strip())
                index += 1
            blocks.append(Block(kind="ol", lines=items))
            continue

        if UNORDERED_LIST_RE.match(stripped):
            items = []
            while index < len(lines):
                current = lines[index].strip()
                match = UNORDERED_LIST_RE.match(current)
                if not match:
                    break
                items.append(match.group(1).strip())
                index += 1
            blocks.append(Block(kind="ul", lines=items))
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            current = lines[index].strip()
            if current == "":
                break
            if (
                current.startswith("```")
                or current.startswith(">")
                or HEADING_RE.match(current)
                or ORDERED_LIST_RE.match(current)
                or UNORDERED_LIST_RE.match(current)
                or FOOTNOTE_DEF_RE.match(current)
            ):
                break
            paragraph_lines.append(current)
            index += 1
        blocks.append(Block(kind="p", lines=paragraph_lines))

    return blocks


def is_external_link(url: str) -> bool:
    """Identify links that should open in a new tab like the existing posts."""
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"}


def protect_literal_html(text: str) -> tuple[str, dict[str, str]]:
    """Protect a narrow allowlist of inline HTML tags before escaping.

    The essays currently use simple literal tags like `<sup>...</sup>` inside
    Markdown prose. We preserve those exact tags while still escaping the rest
    of the string.
    """
    placeholders: dict[str, str] = {}
    tag_pattern = re.compile(r"</?(?:sup|sub)>")

    def replace(match: re.Match[str]) -> str:
        token = f"@@HTML{len(placeholders)}@@"
        placeholders[token] = match.group(0)
        return token

    return tag_pattern.sub(replace, text), placeholders


def restore_placeholders(text: str, placeholders: dict[str, str]) -> str:
    """Restore placeholder tokens inserted during inline rendering."""
    for token, value in placeholders.items():
        text = text.replace(token, value)
    return text


def replace_markdown_links(text: str, replace_fn) -> str:
    """Replace Markdown links while supporting URLs that contain parentheses."""
    result: list[str] = []
    index = 0

    while index < len(text):
        if text[index] != "[":
            result.append(text[index])
            index += 1
            continue

        label_end = text.find("]", index + 1)
        if label_end == -1 or label_end + 1 >= len(text) or text[label_end + 1] != "(":
            result.append(text[index])
            index += 1
            continue

        depth = 1
        cursor = label_end + 2
        while cursor < len(text) and depth > 0:
            if text[cursor] == "(":
                depth += 1
            elif text[cursor] == ")":
                depth -= 1
            cursor += 1

        if depth != 0:
            result.append(text[index])
            index += 1
            continue

        label = text[index + 1 : label_end]
        url = text[label_end + 2 : cursor - 1]
        result.append(replace_fn(label, url))
        index = cursor

    return "".join(result)


def render_inline(text: str) -> str:
    """Render the supported inline Markdown subset into HTML."""
    placeholders: dict[str, str] = {}

    def stash(value: str) -> str:
        token = f"@@TOKEN{len(placeholders)}@@"
        placeholders[token] = value
        return token

    protected_text, html_placeholders = protect_literal_html(text)

    # Escape first, then selectively reintroduce supported inline HTML.
    escaped = html.escape(protected_text, quote=False)

    escaped = CODE_RE.sub(
        lambda m: stash(f"<code>{html.escape(m.group(1), quote=False)}</code>"),
        escaped,
    )

    def replace_link(label_text: str, url_text: str) -> str:
        label = render_inline(label_text)
        url = html.escape(url_text, quote=True)
        attrs = ' class="link"'
        if is_external_link(url_text):
            attrs += ' target="_blank" rel="noopener noreferrer"'
        return stash(f"<a href=\"{url}\"{attrs}>{label}</a>")

    escaped = replace_markdown_links(escaped, replace_link)
    escaped = REFERENCE_RE.sub(
        lambda m: stash(
            f'<sup class="footnote-ref" id="fnref{html.escape(m.group(1), quote=True)}">'
            f'<a href="#fn{html.escape(m.group(1), quote=True)}">{html.escape(m.group(1), quote=False)}</a>'
            "</sup>"
        ),
        escaped,
    )
    escaped = STRONG_RE.sub(r"<strong>\1</strong>", escaped)
    escaped = EM_RE.sub(r"<em>\1</em>", escaped)
    escaped = UNDERSCORE_EM_RE.sub(r"<em>\1</em>", escaped)

    escaped = restore_placeholders(escaped, placeholders)
    escaped = restore_placeholders(escaped, html_placeholders)
    return escaped


def plain_text_inline(text: str) -> str:
    """Strip the supported inline Markdown syntax for metadata fields."""
    text = normalize_source_markdown(text)
    text = REFERENCE_RE.sub("", text)
    text = replace_markdown_links(text, lambda label, _url: label)
    text = CODE_RE.sub(lambda m: m.group(1), text)
    text = STRONG_RE.sub(lambda m: m.group(1), text)
    text = EM_RE.sub(lambda m: m.group(1), text)
    text = UNDERSCORE_EM_RE.sub(lambda m: m.group(1), text)
    text = re.sub(r"</?(?:sup|sub)>", "", text)
    return text.strip()


def render_blockquote(lines: list[str]) -> str:
    """Render a blockquote while preserving attribution lines as plain paragraphs.

    This intentionally avoids turning `- Attribution` into a list item. Every
    paragraph inside a blockquote stays a paragraph, which keeps the visible
    hyphen exactly as written.
    """
    paragraphs: list[str] = []
    current: list[str] = []

    for line in lines:
        if line.strip() == "":
            if current:
                paragraphs.append(" ".join(current).strip())
                current = []
            continue
        current.append(line.strip())

    if current:
        paragraphs.append(" ".join(current).strip())

    inner = "\n".join(f"            <p>{render_inline(paragraph)}</p>" for paragraph in paragraphs)
    return f"        <blockquote>\n{inner}\n        </blockquote>"


def render_footnotes(footnotes: dict[str, str]) -> str:
    """Render the site's ordered footnote block with backreferences."""
    if not footnotes:
        return ""

    # Numeric footnotes sort numerically. Non-numeric ids sort lexicographically.
    def footnote_sort_key(item: tuple[str, str]) -> tuple[int, str]:
        footnote_id = item[0]
        if footnote_id.isdigit():
            return (0, f"{int(footnote_id):09d}")
        return (1, footnote_id)

    items: list[str] = []
    for footnote_id, text in sorted(footnotes.items(), key=footnote_sort_key):
        rendered = render_inline(" ".join(part.strip() for part in text.splitlines()))
        items.append(
            "                <li id=\"fn{0}\">\n"
            "                    <p>{1} <a class=\"footnote-backref\" href=\"#fnref{0}\" "
            "aria-label=\"Back to reference {0}\">↩</a></p>\n"
            "                </li>".format(html.escape(footnote_id, quote=True), rendered)
        )

    return (
        "        <section class=\"footnotes\" aria-label=\"Footnotes\">\n"
        "            <ol>\n"
        f"{chr(10).join(items)}\n"
        "            </ol>\n"
        "        </section>"
    )


def render_blocks(blocks: Iterable[Block]) -> str:
    """Render parsed blocks into the site's blog post HTML."""
    rendered: list[str] = []

    for block in blocks:
        if block.kind == "p":
            rendered.append(f"        <p>{render_inline(' '.join(block.lines))}</p>")
        elif block.kind in {"h1", "h2", "h3", "h4"}:
            tag = "h2" if block.kind == "h1" else block.kind
            # Existing long-form sections use h2 for top-level in-body headings.
            rendered.append(f"        <{tag}>{render_inline(block.lines[0])}</{tag}>")
        elif block.kind == "blockquote":
            rendered.append(render_blockquote(block.lines))
        elif block.kind == "ol":
            items = "\n".join(f"            <li>{render_inline(item)}</li>" for item in block.lines)
            rendered.append(f"        <ol>\n{items}\n        </ol>")
        elif block.kind == "ul":
            items = "\n".join(f"            <li>{render_inline(item)}</li>" for item in block.lines)
            rendered.append(f"        <ul>\n{items}\n        </ul>")
        elif block.kind == "code":
            language_class = f' class="language-{html.escape(block.meta, quote=True)}"' if block.meta else ""
            code_text = html.escape("\n".join(block.lines), quote=False)
            rendered.append(
                f"        <pre><code{language_class}>{code_text}</code></pre>"
            )
        else:
            raise ValueError(f"Unsupported block kind: {block.kind}")

    return "\n\n".join(rendered)


def first_heading(blocks: list[Block]) -> str | None:
    """Return the first top-level heading if present."""
    for block in blocks:
        if block.kind == "h1":
            return block.lines[0].strip()
    return None


def first_paragraph(blocks: list[Block]) -> str | None:
    """Return the first paragraph for use as a default description."""
    for block in blocks:
        if block.kind == "p":
            return plain_text_inline(" ".join(block.lines).strip())
    return None


def build_document(title: str, description: str, date: str, body: str, footnotes_html: str) -> str:
    """Wrap rendered content in the site's standard blog post template."""
    footnotes_section = f"\n\n{footnotes_html}" if footnotes_html else ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light only">
    <title>{html.escape(title, quote=False)}</title>
    <meta name="description" content="{html.escape(description, quote=True)}">
    <link rel="stylesheet" href="../../css/styles.css">

    <link rel="icon" href="../../img/favicon.ico" type="image/x-icon">
    <link rel="icon" type="image/png" sizes="16x16" href="../../img/favicon-16x16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="../../img/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="192x192" href="../../img/android-chrome-192x192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="../../img/android-chrome-512x512.png">
    <link rel="apple-touch-icon" sizes="180x180" href="../../img/apple-touch-icon.png">

    <link rel="manifest" href="../../img/site.webmanifest">
    <meta name="theme-color" content="#ffffff">

    <script defer src="../../js/script.js"></script>
</head>
<body>
    <div class="blogpost-container">
        <div id="navigation-placeholder"></div>
        <h1>{html.escape(title, quote=False)}</h1>
        <div class="blog-date">{html.escape(date, quote=False)}</div><br>

{body}{footnotes_section}

        <br><br><br><br>
    </div>
</body>
</html>
"""


def main() -> None:
    """Read Markdown, convert it, and write the finished HTML page."""
    args = parse_args()
    markdown_text = normalize_source_markdown(args.input.read_text(encoding="utf-8"))
    front_matter, lines = parse_front_matter(markdown_text.splitlines())

    body_lines, footnotes = extract_footnotes(lines)
    blocks = split_blocks(body_lines)

    title = args.title or first_heading(blocks) or title_from_filename(args.input)
    if not title:
        raise SystemExit("Could not infer a title. Add a level-1 heading or pass --title.")

    # Remove the leading title heading from the body because the template already
    # renders the page title above the post content.
    if blocks and blocks[0].kind == "h1" and blocks[0].lines[0].strip() == title.strip():
        blocks = blocks[1:]

    display_date = args.date or front_matter.display_date
    if not display_date:
        raise SystemExit("Could not infer a date. Pass --date or include a time/date/YYYY/MM/DD tag in front matter.")

    description = args.description or first_paragraph(blocks) or title
    body_html = render_blocks(blocks)
    footnotes_html = render_footnotes(footnotes)
    document = build_document(title=title, description=description, date=display_date, body=body_html, footnotes_html=footnotes_html)

    args.output.write_text(document, encoding="utf-8")


if __name__ == "__main__":
    main()
