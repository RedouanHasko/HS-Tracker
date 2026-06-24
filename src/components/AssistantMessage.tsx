import React from 'react';

interface AssistantMessageProps {
  text: string;
  /** User bubble (cyan) vs assistant bubble */
  variant?: 'user' | 'assistant';
}

/** Parse **bold**, *italic*, `code` — safe text only, no HTML */
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<span key={`${keyPrefix}-t-${i++}`}>{text.slice(last, match.index)}</span>);
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i++}`}
          className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px] dark:bg-white/10"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const inner = token.startsWith('*') ? token.slice(1, -1) : token.slice(1, -1);
      nodes.push(
        <em key={`${keyPrefix}-i-${i++}`} className="italic opacity-90">
          {inner}
        </em>
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(<span key={`${keyPrefix}-t-${i}`}>{text.slice(last)}</span>);
  }

  return nodes.length ? nodes : [text];
}

function renderBlock(line: string, index: number, variant: 'user' | 'assistant') {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
  if (heading) {
    return (
      <p key={index} className="mb-1 font-semibold text-[11px]">
        {parseInline(heading[1], `h-${index}`)}
      </p>
    );
  }

  const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
  if (bullet) {
    return (
      <li key={index} className="ml-3 list-disc pl-1 leading-snug">
        {parseInline(bullet[1], `li-${index}`)}
      </li>
    );
  }

  return (
    <p
      key={index}
      className={`leading-snug ${variant === 'user' ? 'text-white' : ''}`}
    >
      {parseInline(trimmed, `p-${index}`)}
    </p>
  );
}

/**
 * Renders assistant chat text with lightweight Markdown (bold, italic, lists).
 */
export default function AssistantMessage({ text, variant = 'assistant' }: AssistantMessageProps) {
  const isWarning = text.startsWith('⚠');

  if (isWarning) {
    return (
      <p className="whitespace-pre-wrap text-[11px] leading-snug text-amber-800 dark:text-amber-200">
        {text}
      </p>
    );
  }

  const blocks = text.split(/\n/);
  const elements: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];

  const flushList = () => {
    if (listBuffer.length) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="mb-1.5 space-y-0.5 last:mb-0">
          {listBuffer}
        </ul>
      );
      listBuffer = [];
    }
  };

  blocks.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const bullet = trimmed.match(/^[-*•]\s+/);
    if (bullet) {
      const li = renderBlock(line, index, variant);
      if (li) listBuffer.push(li);
    } else {
      flushList();
      const block = renderBlock(line, index, variant);
      if (block) elements.push(block);
    }
  });
  flushList();

  return <div className="space-y-1 text-xs">{elements}</div>;
}
