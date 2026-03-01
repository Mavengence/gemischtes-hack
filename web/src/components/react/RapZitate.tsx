import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import rapzitateData from "@/data/rapzitate.json";

type Rapzitat = {
  episode_number: number;
  quote: string;
  artist: string;
  song: string;
  note: string | null;
};

const rapzitate: Rapzitat[] = rapzitateData;

/** Shuffle array using Fisher-Yates */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const VISIBLE_COUNT = 5;

export default function RapZitate() {
  // Randomize order on each mount (page load)
  const shuffled = useMemo(() => shuffle(rapzitate), []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState("");
  const featuredRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = filter
    ? rapzitate.filter(
        (r) =>
          r.artist.toLowerCase().includes(filter.toLowerCase()) ||
          r.quote.toLowerCase().includes(filter.toLowerCase()) ||
          r.song.toLowerCase().includes(filter.toLowerCase()) ||
          `#${r.episode_number}`.includes(filter),
      )
    : shuffled;

  // Show max 5 in the visible list
  const displayedQuotes = filtered.slice(0, VISIBLE_COUNT);

  const selected = filter ? filtered[selectedIndex] ?? filtered[0] : shuffled[selectedIndex];

  const randomQuote = useCallback(() => {
    const newIdx = Math.floor(Math.random() * (filter ? filtered.length : shuffled.length));
    setSelectedIndex(newIdx);
    setTimeout(() => {
      featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, [filter, filtered.length, shuffled.length]);

  const selectQuote = useCallback((globalIdx: number) => {
    setSelectedIndex(globalIdx);
    setTimeout(() => {
      featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  const [copied, setCopied] = useState(false);

  const shareQuote = useCallback(async (e: MouseEvent) => {
    e.stopPropagation();
    if (!selected) return;
    const text = `"${selected.quote}"\n— ${selected.artist}, ${selected.song}\n#GemischtesHack #${selected.episode_number}`;

    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // User cancelled or share failed — fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  }, [selected]);

  // Top artists for filter chips
  const topArtists = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rapzitate) {
      const main = r.artist.split(" feat.")[0].split(" & ")[0].split(",")[0].trim();
      counts.set(main, (counts.get(main) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Featured quote — always visible */}
      {selected && (
        <div
          ref={featuredRef}
          className="mb-8 p-8 md:p-10 relative overflow-hidden"
          style={{
            background: "#161616",
            border: "1px solid rgba(245,192,0,0.15)",
            borderRadius: "2px",
          }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ background: "linear-gradient(to bottom, #F5C000, #C49A00)" }}
          />
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] text-gray-400 font-mono">#{selected.episode_number}</span>
            {selected.note && (
              <>
                <span className="text-[11px] text-gray-600">|</span>
                <span className="text-[11px] text-accent/70 italic">{selected.note}</span>
              </>
            )}
          </div>
          <blockquote className="text-xl md:text-2xl text-gray-100 leading-relaxed font-light mb-6 whitespace-pre-line">
            {selected.quote}
          </blockquote>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-accent">{selected.artist}</span>
              {selected.song && (
                <>
                  <span className="text-gray-600">&mdash;</span>
                  <span className="text-sm text-gray-400 italic">{selected.song}</span>
                </>
              )}
            </div>
            <button
              onClick={shareQuote}
              className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-300 transition-colors"
              title="Zitat teilen"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-500">Kopiert</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span className="hidden sm:inline">Teilen</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Controls row */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <label htmlFor="rap-filter" className="sr-only">Rapzitate filtern</label>
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            id="rap-filter"
            type="text"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Suche nach Artist, Song, Lyrics..."
            className="input w-full text-sm pl-10"
          />
        </div>
        <button
          onClick={randomQuote}
          className="py-3 px-6 text-sm font-bold tracking-[0.1em] uppercase shrink-0 transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          style={{ background: "#F5C000", color: "#0A0A0A", borderRadius: "2px" }}
        >
          Zufällig
        </button>
      </div>

      {/* Top artists chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {topArtists.map(([artist, count]) => (
          <button
            key={artist}
            onClick={() => {
              setFilter(filter === artist ? "" : artist);
              setSelectedIndex(0);
            }}
            className="text-xs px-3 py-1.5 transition-all duration-200"
            style={{
              background: filter === artist ? "rgba(245,192,0,0.1)" : "#161616",
              border: `1px solid ${filter === artist ? "rgba(245,192,0,0.3)" : "#2A2A2A"}`,
              color: filter === artist ? "#F5C000" : "#999",
              borderRadius: "1px",
            }}
          >
            {artist}{" "}
            <span className="text-gray-600 font-mono ml-1">{count}</span>
          </button>
        ))}
      </div>

      {/* Quote list — max 5, scrollable via scroll-down behavior */}
      <div ref={listRef} className="space-y-2">
        {displayedQuotes.map((r, i) => {
          const isSelected = r === selected;

          return (
            <button
              key={`${r.episode_number}-${r.artist}-${i}`}
              onClick={() => selectQuote(filter ? i : shuffled.indexOf(r))}
              className="w-full text-left p-4 transition-all duration-200 group"
              style={{
                background: isSelected ? "rgba(245,192,0,0.05)" : "#161616",
                border: `1px solid ${isSelected ? "rgba(245,192,0,0.2)" : "#2A2A2A"}`,
                borderRadius: "2px",
              }}
            >
              <div className="flex items-start gap-4">
                <span
                  className="text-xs font-mono shrink-0 mt-0.5 transition-colors"
                  style={{ color: isSelected ? "#F5C000" : "#666" }}
                >
                  #{r.episode_number}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 line-clamp-2 leading-relaxed group-hover:text-gray-100 transition-colors whitespace-pre-line">
                    {r.quote}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-accent/80 font-medium">{r.artist}</span>
                    {r.song && (
                      <>
                        <span className="text-gray-600 text-[11px]">&mdash;</span>
                        <span className="text-xs text-gray-500 italic truncate">{r.song}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Show count info */}
      {filtered.length > VISIBLE_COUNT && !filter && (
        <div className="text-center mt-4">
          <span className="text-[11px] text-gray-600">
            {VISIBLE_COUNT} von {rapzitate.length} angezeigt — Suche oder Klick auf &ldquo;Zufällig&rdquo; für mehr
          </span>
        </div>
      )}

      {filter && filtered.length > VISIBLE_COUNT && (
        <div className="text-center mt-4">
          <span className="text-[11px] text-gray-600">
            {VISIBLE_COUNT} von {filtered.length} Treffern angezeigt
          </span>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-gray-500 text-center py-12 text-sm">
          Keine Rapzitate gefunden für &ldquo;{filter}&rdquo;
        </p>
      )}
    </div>
  );
}
