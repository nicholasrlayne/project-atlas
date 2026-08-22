// Lightweight formatter for AI response text: handles the subset of
// markdown that Claude's Ask responses actually use — **bold**, "- " or
// "• " bullet lists, "1. " numbered lists, and paragraph breaks (blank
// lines). Not a full markdown parser (no tables, code blocks, links,
// headers) — deliberately narrow to match what this chat context needs,
// so we're not pulling in a markdown dependency for it.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-chalk">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function isBulletLine(line: string): boolean {
  return /^[-•]\s+/.test(line);
}

function isNumberedLine(line: string): boolean {
  return /^\d+\.\s+/.test(line);
}

type LineKind = 'text' | 'bullet' | 'number';
interface LineGroup {
  kind: LineKind;
  lines: string[];
}

// Groups consecutive lines of the same kind together, so a block like
// "Three customers are ready:\n- A\n- B" becomes [text-group, bullet-group]
// instead of being forced into a single uniform type.
function groupLines(lines: string[]): LineGroup[] {
  const groups: LineGroup[] = [];
  let current: LineGroup | null = null;
  for (const line of lines) {
    const kind: LineKind = isBulletLine(line) ? 'bullet' : isNumberedLine(line) ? 'number' : 'text';
    if (current && current.kind === kind) {
      current.lines.push(line);
    } else {
      current = { kind, lines: [line] };
      groups.push(current);
    }
  }
  return groups;
}

function renderGroup(group: LineGroup, keyPrefix: string): React.ReactNode {
  if (group.kind === 'bullet') {
    return (
      <ul key={keyPrefix} className="list-disc space-y-1 pl-4">
        {group.lines.map((line, li) => (
          <li key={li} className="text-[13px] leading-relaxed">
            {renderInline(line.replace(/^[-•]\s+/, ''), `${keyPrefix}-${li}`)}
          </li>
        ))}
      </ul>
    );
  }
  if (group.kind === 'number') {
    return (
      <ol key={keyPrefix} className="list-decimal space-y-1 pl-4">
        {group.lines.map((line, li) => (
          <li key={li} className="text-[13px] leading-relaxed">
            {renderInline(line.replace(/^\d+\.\s+/, ''), `${keyPrefix}-${li}`)}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <p key={keyPrefix} className="text-[13px] leading-relaxed">
      {group.lines.map((line, li) => (
        <span key={li}>
          {renderInline(line, `${keyPrefix}-${li}`)}
          {li < group.lines.length - 1 && <br />}
        </span>
      ))}
    </p>
  );
}

export function FormattedText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const groups = groupLines(lines);
        return (
          <div key={bi} className="space-y-2">
            {groups.map((group, gi) => renderGroup(group, `${bi}-${gi}`))}
          </div>
        );
      })}
    </div>
  );
}