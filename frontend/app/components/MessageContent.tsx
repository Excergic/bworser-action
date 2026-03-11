"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageContent({ content }: { content: string }) {
  return (
    <div className="message-content text-[var(--text-secondary)] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-6 mb-2 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-[var(--text-primary)] mt-4 mb-1.5">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside my-3 space-y-1 text-[var(--text-secondary)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside my-3 space-y-1 text-[var(--text-secondary)]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="ml-2">{children}</li>,
          p: ({ children }) => <p className="my-2">{children}</p>,
          pre: ({ children }) => (
            <pre className="my-3 rounded-xl bg-[var(--bg-raised)] border border-[var(--border)] overflow-x-auto p-4 text-sm font-mono">
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="rounded-md bg-[var(--bg-raised)] px-1.5 py-0.5 text-sm font-mono text-[var(--accent)] border border-[var(--border)]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            const lang = (className || "").replace("language-", "");
            const isBash = /^bash|sh|shell$/i.test(lang);
            return (
              <code
                className={`block text-left ${isBash ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}
                {...props}
              >
                {children}
              </code>
            );
          },
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
