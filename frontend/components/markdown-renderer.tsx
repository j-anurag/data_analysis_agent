import React from "react";

interface MarkdownRendererProps {
  content: string;
  onSuggestionClick?: (text: string) => void;
}

export default function MarkdownRenderer({ content, onSuggestionClick }: MarkdownRendererProps) {
  if (!content) return null;

  // Split content into lines
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentTable: string[][] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  // Inline formatting helper
  const renderInline = (text: string): React.ReactNode => {
    // Regex splits by bold (**text**) or inline code (`code`) markers
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={idx} className="font-bold text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={idx}
            className="font-mono text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded text-[10px] border border-slate-800"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const flushTable = (key: number) => {
    if (currentTable.length > 0) {
      const headers = currentTable[0];
      // Skip the separator row (which is the second row, e.g., |---|---|)
      const rows = currentTable.slice(2);
      blocks.push(
        <div key={`table-${key}`} className="overflow-x-auto my-3 border border-slate-800 rounded-lg shadow-md max-w-full">
          <table className="min-w-full divide-y divide-slate-800/80 text-left text-xs bg-slate-950/30">
            <thead className="bg-slate-900/60 font-semibold text-slate-200">
              <tr>
                {headers.map((h, idx) => (
                  <th key={idx} className="px-3.5 py-2.5 border-b border-slate-800/80">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 text-slate-300">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-900/20 transition-colors">
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2">
                      {renderInline(row[cIdx] || "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      currentTable = [];
    }
  };

  const flushList = (key: number) => {
    if (currentList) {
      const ListTag = currentList.type === "ul" ? "ul" : "ol";
      const listClass =
        currentList.type === "ul"
          ? "list-disc pl-5 space-y-1.5 my-2.5 text-slate-300"
          : "list-decimal pl-5 space-y-1.5 my-2.5 text-slate-300";
      
      blocks.push(
        <ListTag key={`list-${key}`} className={listClass}>
          {currentList.items.map((item, idx) => {
            let cleanedItem = item.trim();
            // Remove markdown characters and list-style elements/emojis from the beginning
            cleanedItem = cleanedItem.replace(/^[\s*_⚡\-•\d.)]*/, "");
            
            // Remove wrapping quotes if LLM added them
            if (cleanedItem.startsWith('"') && cleanedItem.endsWith('"')) {
              cleanedItem = cleanedItem.slice(1, -1);
            } else if (cleanedItem.startsWith("'") && cleanedItem.endsWith("'")) {
              cleanedItem = cleanedItem.slice(1, -1);
            }

            // Check if it's an actionable query suggestion
            const isSuggestion =
              onSuggestionClick &&
              (cleanedItem.endsWith("?") ||
                /^(show|compare|check|what|how|find|list|run|detect|get|create|analyze|explain|is|are|which|can|identify|did|calculate|plot|who|where|when|why)\b/i.test(
                  cleanedItem
                ));

            if (isSuggestion) {
              const suggestionText = cleanedItem.replace(/[\*\_]/g, "").trim();
              return (
                <li
                  key={idx}
                  onClick={() => onSuggestionClick && onSuggestionClick(suggestionText)}
                  className="group cursor-pointer hover:text-blue-400 py-1 px-2.5 -mx-2.5 rounded-lg hover:bg-blue-500/5 border border-transparent hover:border-blue-500/10 transition-all flex items-start gap-2"
                >
                  <span className="text-blue-500 mt-0.5 group-hover:scale-110 transition-transform shrink-0">⚡</span>
                  <span className="underline decoration-dotted decoration-blue-500/30 group-hover:decoration-blue-400 transition-colors">
                    {renderInline(item)}
                  </span>
                </li>
              );
            }

            return (
              <li key={idx} className="py-0.5">
                {renderInline(item)}
              </li>
            );
          })}
        </ListTag>
      );
      currentList = null;
    }
  };

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Code block tags
    if (trimmed.startsWith("```")) {
      flushList(i);
      flushTable(i);
      if (inCodeBlock) {
        blocks.push(
          <pre
            key={`code-${i}`}
            className="bg-slate-950/90 p-4 rounded-xl font-mono text-[10px] text-emerald-400 overflow-x-auto border border-slate-900/60 my-3 leading-normal whitespace-pre"
          >
            <code>{codeBlockLines.join("\n")}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 2. Tables (starts with |)
    if (trimmed.startsWith("|")) {
      flushList(i);
      const cells = line.split("|").map((c) => c.trim());
      // Split will yield empty elements at start and end due to leading/trailing |
      if (cells[0] === "") cells.shift();
      if (cells[cells.length - 1] === "") cells.pop();
      currentTable.push(cells);
      continue;
    } else {
      flushTable(i);
    }

    // 3. Lists
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (ulMatch) {
      if (!currentList || currentList.type !== "ul") {
        flushList(i);
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(ulMatch[2]);
      continue;
    } else if (olMatch) {
      if (!currentList || currentList.type !== "ol") {
        flushList(i);
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(olMatch[2]);
      continue;
    } else {
      flushList(i);
    }

    // 4. Headers
    if (trimmed.startsWith("###")) {
      blocks.push(
        <h3 key={i} className="text-xs font-bold text-slate-200 mt-4 mb-1.5 uppercase tracking-wider">
          {renderInline(trimmed.substring(3).trim())}
        </h3>
      );
    } else if (trimmed.startsWith("##")) {
      blocks.push(
        <h2 key={i} className="text-sm font-semibold text-white mt-5 mb-2.5 pb-1 border-b border-slate-900">
          {renderInline(trimmed.substring(2).trim())}
        </h2>
      );
    } else if (trimmed.startsWith("#")) {
      blocks.push(
        <h1 key={i} className="text-base font-bold text-white mt-6 mb-3">
          {renderInline(trimmed.substring(1).trim())}
        </h1>
      );
    }
    // 5. Empty Lines
    else if (trimmed === "") {
      blocks.push(<div key={i} className="h-2"></div>);
    }
    // 6. Paragraphs
    else {
      blocks.push(
        <p key={i} className="mb-2 text-slate-300 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  // Flush any final tables or lists
  flushTable(lines.length);
  flushList(lines.length);

  return <div className="space-y-0.5 text-xs">{blocks}</div>;
}
