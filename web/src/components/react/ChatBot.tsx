import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Source = {
  episode_title: string;
  episode_number: number | null;
  glt_id: string;
  timestamp: number;
  score?: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  timestamp: number;
};

const SUGGESTIONS = [
  { text: "Worüber reden Felix und Tommi am meisten?", icon: "trending" },
  { text: "Was war der lustigste Moment im Podcast?", icon: "laugh" },
  { text: "Erzähl mir über die Running Gags", icon: "repeat" },
  { text: "Welche Gäste waren in der Sendung?", icon: "people" },
] as const;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function uniqueSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.glt_id}-${s.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Lightweight markdown renderer ---
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <pre
          key={`code-${i}`}
          className="my-2 px-3 py-2 text-[13px] font-mono text-gray-300 overflow-x-auto"
          style={{ background: "#1A1A1A", border: "1px solid #222", borderRadius: "2px" }}
        >
          {codeLines.join("\n")}
        </pre>,
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={`sp-${i}`} className="h-2" />);
      i++;
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-1 ml-0.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className="text-accent/40 mt-[7px] text-[6px] shrink-0">&#9679;</span>
              <span>{inlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-1.5 space-y-1 ml-0.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className="text-gray-500 text-xs font-mono mt-0.5 w-4 shrink-0">{j + 1}.</span>
              <span>{inlineMarkdown(item)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="my-0.5 leading-[1.7]">
        {inlineMarkdown(line)}
      </p>,
    );
    i++;
  }

  return elements;
}

function inlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-gray-200">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic text-gray-300">{match[3]}</em>);
    } else if (match[4]) {
      parts.push(
        <code
          key={match.index}
          className="px-1 py-0.5 text-[13px] font-mono text-accent/80"
          style={{ background: "rgba(245,192,0,0.06)", borderRadius: "2px" }}
        >
          {match[4]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

// --- Suggestion icon component ---
function SuggestionIcon({ type }: { type: string }) {
  const props = { className: "w-4 h-4", fill: "none" as const, viewBox: "0 0 24 24", stroke: "currentColor" };
  switch (type) {
    case "trending":
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>;
    case "laugh":
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case "repeat":
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
    case "people":
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    default:
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01" /></svg>;
  }
}

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMsg, setLastFailedMsg] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgId = useRef<string | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((smooth = false) => {
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" });
  }, []);

  // Track scroll position for scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || streaming) return;

      setInput("");
      setError(null);
      setLastFailedMsg(null);

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: msg,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      const history = [...messages, userMessage]
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      setStreaming(true);
      let assistantContent = "";
      let sources: Source[] = [];
      const assistantId = generateId();
      streamingMsgId.current = assistantId;

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", sources: [], timestamp: Date.now() },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, history }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Chat failed" }));
          throw new Error(err.error ?? `Error ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.sources) {
                sources = parsed.sources;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, sources } : m)),
                );
                continue;
              }

              if (parsed.content) {
                assistantContent += parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: assistantContent, sources } : m,
                  ),
                );
              }
            } catch {
              // Skip malformed SSE
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const errMsg = err instanceof Error ? err.message : "Chat fehlgeschlagen";
        setError(errMsg);
        setLastFailedMsg(msg);
        // Remove empty assistant placeholder on error
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
      } finally {
        abortRef.current = null;
        streamingMsgId.current = null;
        setStreaming(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [input, streaming, messages],
  );

  // Listen for hero search events
  useEffect(() => {
    const handler = (e: Event) => {
      const question = (e as CustomEvent<string>).detail;
      if (question) sendMessage(question);
    };
    window.addEventListener("hero-ask", handler);
    return () => window.removeEventListener("hero-ask", handler);
  }, [sendMessage]);

  const retryLastMessage = useCallback(() => {
    if (!lastFailedMsg) return;
    setError(null);
    sendMessage(lastFailedMsg);
  }, [lastFailedMsg, sendMessage]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    streamingMsgId.current = null;
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Escape clears input when input is focused
    if (e.key === "Escape" && input) {
      e.preventDefault();
      setInput("");
    }
  };

  const clearChat = useCallback(() => {
    if (streaming) stopStreaming();
    setMessages([]);
    setError(null);
    setLastFailedMsg(null);
    setExpandedSources(new Set());
    setCopied(null);
    inputRef.current?.focus();
  }, [streaming, stopStreaming]);

  const toggleSources = useCallback((messageId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const copyMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(messageId);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API unavailable
    }
  }, []);

  // Open episode viewer when clicking a source
  const openEpisode = useCallback((gltId: string) => {
    const viewer = (window as unknown as Record<string, { open: (id: string) => void }>).__episodeViewer;
    if (viewer) viewer.open(gltId);
  }, []);

  const hasMessages = messages.length > 0;
  const questionCount = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);

  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="relative flex flex-col chat-container"
        style={{
          background: "#111111",
          border: "1px solid #2A2A2A",
          borderRadius: "2px",
          height: hasMessages ? "min(600px, 72vh)" : "auto",
          minHeight: hasMessages ? "400px" : "auto",
          transition: "height 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* ── Header bar ── */}
        {hasMessages && (
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: "1px solid #1F1F1F" }}
          >
            <div className="flex items-center gap-2.5">
              <span className={`chat-status-dot ${streaming ? "chat-status-dot--active" : ""}`} />
              <span className="text-[11px] text-gray-500 uppercase tracking-[0.15em]">
                {streaming ? "Denkt nach..." : "Bereit"}
              </span>
              {questionCount > 0 && (
                <span className="text-[10px] text-gray-700 font-mono ml-2 hidden sm:inline">
                  {questionCount} {questionCount === 1 ? "Frage" : "Fragen"}
                </span>
              )}
            </div>
            <button
              onClick={clearChat}
              className="text-[11px] text-gray-600 hover:text-gray-300 transition-colors uppercase tracking-[0.15em] flex items-center gap-1.5"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              Neuer Chat
            </button>
          </div>
        )}

        {/* ── Empty state ── */}
        {!hasMessages ? (
          <div className="px-6 py-12 md:py-16">
            <div className="text-center mb-10" style={{ animation: "chat-fade-in 400ms ease-out" }}>
              <div
                className="inline-flex items-center justify-center w-16 h-16 mb-6 chat-icon-pulse"
                style={{
                  background: "rgba(245,192,0,0.05)",
                  border: "1px solid rgba(245,192,0,0.1)",
                  borderRadius: "2px",
                }}
              >
                <svg className="w-8 h-8 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl text-gray-200 font-medium mb-2">
                Frag den Podcast
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                Stell eine Frage und bekomme Antworten aus echten Podcast-Transkripten — mit Quellenangabe und Zeitstempel.
              </p>
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-lg mx-auto"
              style={{ animation: "chat-fade-in 500ms ease-out 100ms both" }}
            >
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={s.text}
                  onClick={() => sendMessage(s.text)}
                  className="chat-suggestion group text-left px-4 py-3.5 text-sm text-gray-400 hover:text-gray-200 transition-all duration-200"
                  style={{ animationDelay: `${150 + idx * 60}ms` }}
                >
                  <span className="flex items-start gap-3">
                    <span className="text-gray-600 group-hover:text-accent/60 transition-colors shrink-0 mt-0.5">
                      <SuggestionIcon type={s.icon} />
                    </span>
                    <span className="leading-snug">{s.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Message list ── */
          <div className="relative flex-1 min-h-0">
            <div
              ref={chatContainerRef}
              className="h-full overflow-y-auto px-5 py-5"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#2A2A2A #111111" }}
              onScroll={handleScroll}
            >
              <div className="space-y-5">
                {messages.map((msg, idx) => {
                  const isStreaming = msg.id === streamingMsgId.current;
                  const isLast = idx === messages.length - 1 || idx === messages.length - 2;
                  return (
                    <div
                      key={msg.id}
                      style={{ animation: isLast ? "chat-fade-in 200ms ease-out" : "none" }}
                    >
                      {msg.role === "user" ? (
                        /* ── User message ── */
                        <div className="flex justify-end">
                          <div className="flex items-start gap-2.5 max-w-[85%]">
                            <div
                              className="px-4 py-3 text-sm leading-relaxed"
                              style={{
                                background: "rgba(245,192,0,0.06)",
                                border: "1px solid rgba(245,192,0,0.12)",
                                borderRadius: "2px",
                                color: "#e5e5e5",
                              }}
                            >
                              {msg.content}
                            </div>
                            <div
                              className="w-7 h-7 shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-500 uppercase"
                              style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: "2px" }}
                            >
                              Du
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* ── Assistant message ── */
                        <div className="flex justify-start group/msg">
                          <div className="flex items-start gap-2.5 max-w-[90%]">
                            <div
                              className="w-7 h-7 shrink-0 flex items-center justify-center mt-0.5"
                              style={{
                                background: "rgba(245,192,0,0.08)",
                                border: "1px solid rgba(245,192,0,0.15)",
                                borderRadius: "2px",
                              }}
                            >
                              <svg className="w-3.5 h-3.5 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              {msg.content ? (
                                <div className="text-sm text-gray-300 leading-relaxed" style={{ wordBreak: "break-word" }}>
                                  {renderMarkdown(msg.content)}
                                  {/* Streaming cursor */}
                                  {isStreaming && <span className="chat-cursor" />}
                                </div>
                              ) : (
                                /* Typing indicator */
                                <div className="flex items-center gap-1.5 py-3 px-1">
                                  <span className="chat-dot" style={{ animationDelay: "0ms" }} />
                                  <span className="chat-dot" style={{ animationDelay: "150ms" }} />
                                  <span className="chat-dot" style={{ animationDelay: "300ms" }} />
                                </div>
                              )}

                              {/* Action bar — visible on hover or when sources expanded */}
                              {msg.content && !isStreaming && (
                                <div className="flex items-center gap-3 mt-2 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150"
                                  style={expandedSources.has(msg.id) ? { opacity: 1 } : {}}
                                >
                                  <button
                                    onClick={() => copyMessage(msg.id, msg.content)}
                                    className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-300 transition-colors"
                                    title="Kopieren"
                                  >
                                    {copied === msg.id ? (
                                      <>
                                        <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-green-500">Kopiert</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        <span>Kopieren</span>
                                      </>
                                    )}
                                  </button>

                                  {msg.sources && msg.sources.length > 0 && (
                                    <button
                                      onClick={() => toggleSources(msg.id)}
                                      className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-300 transition-colors"
                                    >
                                      <svg
                                        className="w-3 h-3 transition-transform duration-200"
                                        style={{ transform: expandedSources.has(msg.id) ? "rotate(90deg)" : "rotate(0)" }}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                      {uniqueSources(msg.sources).length} Quellen
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Expanded sources — clickable to open episode */}
                              {expandedSources.has(msg.id) && msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 space-y-1" style={{ animation: "chat-fade-in 150ms ease-out" }}>
                                  {uniqueSources(msg.sources).map((src, j) => (
                                    <button
                                      key={j}
                                      onClick={() => openEpisode(src.glt_id)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-left transition-colors duration-150 hover:bg-surface-200/30"
                                      style={{ background: "#161616", border: "1px solid #1F1F1F", borderRadius: "1px" }}
                                    >
                                      <svg className="w-3 h-3 text-accent/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                      </svg>
                                      <span className="text-gray-400 truncate flex-1">
                                        {src.episode_number ? `#${src.episode_number}` : ""}{" "}
                                        {src.episode_title}
                                      </span>
                                      <span className="text-gray-600 font-mono shrink-0">~{src.timestamp}min</span>
                                      <svg className="w-3 h-3 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {/* Scroll-to-bottom FAB */}
            {showScrollBtn && (
              <button
                onClick={() => scrollToBottom(true)}
                className="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center transition-all duration-200 hover:scale-105 z-10"
                style={{
                  background: "#1A1A1A",
                  border: "1px solid #2A2A2A",
                  borderRadius: "2px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  animation: "chat-fade-in 150ms ease-out",
                }}
                aria-label="Nach unten scrollen"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* ── Error banner with retry ── */}
        {error && (
          <div
            className="mx-4 mb-2 px-4 py-2.5 flex items-center gap-2"
            style={{
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.12)",
              borderRadius: "2px",
              animation: "chat-fade-in 200ms ease-out",
            }}
          >
            <svg className="w-3.5 h-3.5 text-red-400/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-xs text-red-400/80 flex-1">{error}</span>
            {lastFailedMsg && (
              <button
                onClick={retryLastMessage}
                className="text-[11px] text-red-400/60 hover:text-red-400 transition-colors uppercase tracking-wider"
              >
                Erneut
              </button>
            )}
            <button
              onClick={() => { setError(null); setLastFailedMsg(null); }}
              className="text-red-400/50 hover:text-red-400/80 transition-colors ml-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Input area ── */}
        <div
          className="shrink-0 px-4 py-3"
          style={{ borderTop: hasMessages ? "1px solid #1F1F1F" : "none" }}
        >
          <div
            className="flex items-end gap-2 px-3 py-2 transition-all duration-200"
            style={{
              background: "#161616",
              border: inputFocused ? "1px solid rgba(245,192,0,0.25)" : "1px solid #2A2A2A",
              borderRadius: "2px",
              boxShadow: inputFocused ? "0 0 0 1px rgba(245,192,0,0.08)" : "none",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Stell eine Frage zum Podcast..."
              disabled={streaming}
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none resize-none leading-relaxed py-1"
              style={{ maxHeight: "120px" }}
              aria-label="Chat-Nachricht"
            />
            {streaming ? (
              <button
                onClick={stopStreaming}
                className="shrink-0 w-8 h-8 flex items-center justify-center transition-all duration-200 hover:brightness-125"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: "2px",
                }}
                aria-label="Abbrechen"
                title="Antwort abbrechen (Esc)"
              >
                <svg className="w-3.5 h-3.5 text-red-400/80" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim()}
                className="shrink-0 w-8 h-8 flex items-center justify-center transition-all duration-200 disabled:opacity-20"
                style={{
                  background: input.trim() ? "rgba(245,192,0,0.12)" : "transparent",
                  border: `1px solid ${input.trim() ? "rgba(245,192,0,0.25)" : "transparent"}`,
                  borderRadius: "2px",
                  color: input.trim() ? "#F5C000" : "#444",
                }}
                aria-label="Nachricht senden"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-gray-600">
              Enter senden · Shift+Enter neue Zeile
            </span>
            <span className="text-[10px] text-gray-700">
              RAG auf echten Transkripten
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
