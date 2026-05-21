'use client';

/**
 * Tiny markdown renderer for assistant chat bubbles.
 *
 * We avoid `react-markdown` (~50KB + a remark/rehype tree) because the only
 * thing the LLM emits is the markdown-101 subset: `**bold**`, `*italic*`,
 * `` `code` ``, bullet / numbered lists, and paragraph breaks. Handling that
 * ourselves keeps the bundle thin and means the renderer can never trip on a
 * surprise plugin upgrade.
 *
 * SECURITY: every token is rendered as a React node, never via
 * `dangerouslySetInnerHTML`. The renderer treats LLM output as untrusted text
 * — markdown punctuation gets *interpreted*, but any HTML/JS in it stays as a
 * literal string because we never hand it to the DOM as HTML.
 */
import * as React from 'react';

interface MarkdownTextProps {
  text: string;
  className?: string;
}

/** Inline-level: handles `**bold**`, `*italic*`, and `` `code` `` in one pass. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Split on inline markers while keeping them — order matters: `code` first
  // (it suppresses bold/italic inside), then bold, then italic.
  const tokens: React.ReactNode[] = [];
  let i = 0;
  let cursor = 0;
  let key = 0;

  const flushLiteral = (until: number) => {
    if (until > cursor) tokens.push(text.slice(cursor, until));
    cursor = until;
  };

  while (i < text.length) {
    const ch = text[i];

    // Inline code: `…`
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flushLiteral(i);
        tokens.push(
          <code
            key={`${keyPrefix}-c-${key++}`}
            className="rounded bg-stone-surface/70 px-1 py-0.5 font-mono text-[12px] text-charcoal-primary"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        cursor = i;
        continue;
      }
    }

    // Bold: **…**
    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i + 1) {
        flushLiteral(i);
        tokens.push(
          <strong key={`${keyPrefix}-b-${key++}`} className="font-semibold text-charcoal-primary">
            {text.slice(i + 2, end)}
          </strong>,
        );
        i = end + 2;
        cursor = i;
        continue;
      }
    }

    // Italic: *…* (single asterisk; we got here because ** didn't match)
    if (ch === '*') {
      // Find a closing single * that isn't part of **.
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '*' && text[j + 1] !== '*' && text[j - 1] !== '*') break;
        j++;
      }
      if (j < text.length && j > i + 1) {
        flushLiteral(i);
        tokens.push(
          <em key={`${keyPrefix}-i-${key++}`} className="italic">
            {text.slice(i + 1, j)}
          </em>,
        );
        i = j + 1;
        cursor = i;
        continue;
      }
    }

    i++;
  }

  flushLiteral(text.length);
  return tokens;
}

/**
 * Block-level: groups consecutive bullet/numbered list lines into a real
 * `<ul>`/`<ol>` and turns blank lines into paragraph breaks.
 */
export function MarkdownText({ text, className }: MarkdownTextProps) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuf: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  let paraBuf: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const joined = paraBuf.join(' ');
    blocks.push(
      <p key={`p-${key++}`} className="leading-relaxed">
        {renderInline(joined, `p${key}`)}
      </p>,
    );
    paraBuf = [];
  };
  const flushList = () => {
    if (!listBuf) return;
    const items = listBuf.items;
    const kind = listBuf.kind;
    blocks.push(
      kind === 'ul' ? (
        <ul key={`ul-${key++}`} className="ml-4 list-disc space-y-0.5">
          {items.map((it, idx) => (
            <li key={idx} className="leading-relaxed">{renderInline(it, `li${key}-${idx}`)}</li>
          ))}
        </ul>
      ) : (
        <ol key={`ol-${key++}`} className="ml-5 list-decimal space-y-0.5">
          {items.map((it, idx) => (
            <li key={idx} className="leading-relaxed">{renderInline(it, `li${key}-${idx}`)}</li>
          ))}
        </ol>
      ),
    );
    listBuf = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Blank line → paragraph/list boundary
    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }

    // Bullet list: "- " or "* "
    const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      flushPara();
      if (!listBuf || listBuf.kind !== 'ul') {
        flushList();
        listBuf = { kind: 'ul', items: [] };
      }
      listBuf.items.push(bulletMatch[1]);
      continue;
    }

    // Numbered list: "1. " "2. " …
    const numMatch = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (numMatch) {
      flushPara();
      if (!listBuf || listBuf.kind !== 'ol') {
        flushList();
        listBuf = { kind: 'ol', items: [] };
      }
      listBuf.items.push(numMatch[1]);
      continue;
    }

    // Plain text line — fold into the current paragraph.
    flushList();
    paraBuf.push(line);
  }
  flushPara();
  flushList();

  return <div className={className}>{blocks}</div>;
}
