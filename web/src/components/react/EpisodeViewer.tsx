import { useCallback, useEffect, useRef, useState } from "react";

type Chunk = {
  chunk_index: number;
  text: string;
  start_time: number;
  end_time: number;
  speakers: string[];
};

type TopicLink = {
  topic_id: number;
  relevance: number;
  topics: { label: string; keywords: string[] } | null;
};

type EpisodeDetail = {
  id: number;
  glt_id: string;
  episode_number: number | null;
  title: string;
  pub_date: string;
  duration_seconds: number;
  summary: string | null;
  description: string | null;
};

type ViewerData = {
  episode: EpisodeDetail;
  chunks: Chunk[];
  topics: TopicLink[];
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function EpisodeViewer() {
  const [gltId, setGltId] = useState<string | null>(null);
  const [data, setData] = useState<ViewerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const open = useCallback((id: string) => {
    setGltId(id);
    setFilter("");
    document.body.style.overflow = "hidden";
  }, []);

  const close = useCallback(() => {
    setGltId(null);
    setData(null);
    setFilter("");
    document.body.style.overflow = "";
  }, []);

  // Expose open/close on window for Astro to call
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__episodeViewer = { open, close };
    return () => {
      delete (window as unknown as Record<string, unknown>).__episodeViewer;
    };
  }, [open, close]);

  // Fetch episode data when gltId changes
  useEffect(() => {
    if (!gltId) return;
    setLoading(true);
    fetch(`/api/episodes/${gltId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((d: ViewerData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [gltId]);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  if (!gltId) return null;

  const ep = data?.episode;
  const chunks = data?.chunks ?? [];
  const topics = data?.topics ?? [];

  const filteredChunks = filter
    ? chunks.filter((c) => c.text.toLowerCase().includes(filter.toLowerCase()))
    : chunks;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={close}
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-3xl mx-4 mt-16 mb-8 max-h-[calc(100vh-6rem)] overflow-y-auto"
        style={{
          background: "#0F0F0F",
          border: "1px solid #2A2A2A",
          borderRadius: "2px",
          scrollbarWidth: "thin",
          scrollbarColor: "#2A2A2A #0F0F0F",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={ep?.title ?? "Episode"}
      >
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
          style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: "2px" }}
          aria-label="Schließen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {loading ? (
          <div className="p-8 space-y-4">
            <div className="h-6 bg-surface-200 animate-pulse rounded-sm w-3/4" />
            <div className="h-4 bg-surface-200 animate-pulse rounded-sm w-1/2" />
            <div className="h-px bg-surface-300/20 my-6" />
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-12 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-full" />
                  <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : !ep ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">Episode nicht gefunden.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-6 md:p-8 pb-0">
              <div className="flex items-start gap-2 mb-1">
                {ep.episode_number && (
                  <span className="text-xs text-gray-500 font-mono shrink-0">
                    #{ep.episode_number}
                  </span>
                )}
                <span className="text-xs text-gray-600">{formatDate(ep.pub_date)}</span>
                <span className="text-xs text-gray-600 ml-auto">
                  {formatDuration(ep.duration_seconds)}
                </span>
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-3">
                {ep.title}
              </h2>

              {/* Summary */}
              {ep.summary && (
                <p className="text-sm text-gray-400 leading-relaxed mb-4">{ep.summary}</p>
              )}

              {/* Topics */}
              {topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {topics.slice(0, 6).map((t) => (
                    <span
                      key={t.topic_id}
                      className="text-[11px] px-2 py-0.5 text-gray-400"
                      style={{
                        background: "rgba(42,42,42,0.5)",
                        border: "1px solid rgba(56,56,56,0.3)",
                        borderRadius: "1px",
                      }}
                    >
                      {t.topics?.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Transcript search */}
              {chunks.length > 0 && (
                <div className="relative mb-4">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Im Transkript suchen..."
                    className="w-full text-xs px-3 py-2 pl-8 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-accent"
                    style={{
                      background: "#161616",
                      border: "1px solid #2A2A2A",
                      borderRadius: "0",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Transcript */}
            {chunks.length > 0 ? (
              <div className="px-6 md:px-8 pb-6 md:pb-8">
                <div className="border-t border-surface-300/20 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] text-gray-500 uppercase tracking-[0.15em]">
                      Transkript
                    </span>
                    <span className="text-[10px] text-gray-600 font-mono">
                      {filteredChunks.length} / {chunks.length} Segmente
                    </span>
                  </div>

                  <div className="space-y-1">
                    {filteredChunks.map((chunk) => {
                      const isFelix = chunk.speakers.includes("Speaker A") && !chunk.speakers.includes("Speaker B");
                      const isTommi = chunk.speakers.includes("Speaker B") && !chunk.speakers.includes("Speaker A");

                      return (
                        <div
                          key={chunk.chunk_index}
                          className="flex gap-3 py-2 group hover:bg-surface-200/30 transition-colors px-2 -mx-2"
                          style={{ borderRadius: "1px" }}
                        >
                          <span className="text-[10px] text-gray-600 font-mono w-10 shrink-0 pt-0.5 text-right group-hover:text-gray-400 transition-colors">
                            {formatTime(chunk.start_time)}
                          </span>
                          <div
                            className="flex-1 min-w-0"
                            style={{
                              borderLeft: isFelix
                                ? "2px solid #5B7DC8"
                                : isTommi
                                  ? "2px solid #9C40B0"
                                  : "2px solid #2A2A2A",
                              paddingLeft: "0.75rem",
                            }}
                          >
                            <p
                              className="text-sm leading-relaxed"
                              style={{
                                color: isFelix
                                  ? "#8BAAE6"
                                  : isTommi
                                    ? "#C070D0"
                                    : "#a3a3a3",
                              }}
                            >
                              {chunk.text}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredChunks.length === 0 && filter && (
                    <p className="text-gray-500 text-center py-8 text-sm">
                      Keine Treffer für &ldquo;{filter}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-6 md:px-8 pb-6 md:pb-8">
                <div className="border-t border-surface-300/20 pt-4 text-center py-8">
                  <p className="text-gray-500 text-sm">Kein Transkript verfügbar für diese Episode.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
