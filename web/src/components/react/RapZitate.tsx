import { useCallback, useEffect, useRef, useState } from "react";
import rapzitateData from "@/data/rapzitate.json";

type Rapzitat = {
  episode_number: number;
  quote: string;
  artist: string;
  song: string;
  note: string | null;
};

const rapzitate: Rapzitat[] = rapzitateData;

export default function RapZitate() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [animated, setAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const filtered = filter
    ? rapzitate.filter(
        (r) =>
          r.artist.toLowerCase().includes(filter.toLowerCase()) ||
          r.quote.toLowerCase().includes(filter.toLowerCase()) ||
          r.song.toLowerCase().includes(filter.toLowerCase()) ||
          `#${r.episode_number}`.includes(filter),
      )
    : rapzitate;

  const randomQuote = useCallback(() => {
    const idx = Math.floor(Math.random() * rapzitate.length);
    setSelectedIndex(idx);
    setFilter("");
  }, []);

  const selected = selectedIndex !== null ? rapzitate[selectedIndex] : null;

  // Count unique artists
  const artistCounts = new Map<string, number>();
  for (const r of rapzitate) {
    const main = r.artist.split(" feat.")[0].split(" & ")[0].split(",")[0].trim();
    artistCounts.set(main, (artistCounts.get(main) ?? 0) + 1);
  }
  const topArtists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div ref={containerRef} className="max-w-4xl mx-auto">
      {/* Featured quote / random */}
      {selected && (
        <div
          className="mb-10 p-8 md:p-10 relative overflow-hidden"
          style={{
            background: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: "2px",
          }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ background: "linear-gradient(to bottom, #F5C000, #C49A00)" }}
          />
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] text-gray-600 font-mono">#{selected.episode_number}</span>
            {selected.note && (
              <>
                <span className="text-[10px] text-gray-700">|</span>
                <span className="text-[10px] text-accent/60 italic">{selected.note}</span>
              </>
            )}
          </div>
          <blockquote className="text-xl md:text-2xl text-gray-200 leading-relaxed font-light mb-6 whitespace-pre-line">
            {selected.quote}
          </blockquote>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-accent">{selected.artist}</span>
            {selected.song && (
              <>
                <span className="text-gray-700">&mdash;</span>
                <span className="text-sm text-gray-500 italic">{selected.song}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Controls row */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-8">
        <div className="relative flex-1">
          <label htmlFor="rap-filter" className="sr-only">Rapzitate filtern</label>
          <input
            id="rap-filter"
            type="text"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelectedIndex(null);
            }}
            placeholder="Suche nach Artist, Song, Lyrics..."
            className="input w-full text-sm"
          />
        </div>
        <button
          onClick={randomQuote}
          className="py-3 px-6 text-sm font-bold tracking-[0.1em] uppercase shrink-0 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: "#F5C000", color: "#0A0A0A", borderRadius: "2px" }}
        >
          Zufälliges Zitat
        </button>
      </div>

      {/* Top artists chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {topArtists.map(([artist, count]) => (
          <button
            key={artist}
            onClick={() => {
              setFilter(artist);
              setSelectedIndex(null);
            }}
            className="text-[11px] px-3 py-1 transition-all duration-200 hover:border-accent/40"
            style={{
              background: filter === artist ? "rgba(245,192,0,0.1)" : "#161616",
              border: `1px solid ${filter === artist ? "rgba(245,192,0,0.3)" : "#2A2A2A"}`,
              color: filter === artist ? "#F5C000" : "#666",
              borderRadius: "1px",
            }}
          >
            {artist}{" "}
            <span className="text-gray-700 font-mono ml-1">{count}</span>
          </button>
        ))}
      </div>

      {/* Quote grid */}
      <div className="space-y-2">
        {filtered.map((r, i) => (
          <button
            key={`${r.episode_number}-${i}`}
            onClick={() => {
              const idx = rapzitate.indexOf(r);
              setSelectedIndex(idx);
            }}
            className="w-full text-left p-4 transition-all duration-300 group"
            style={{
              background:
                selected === r ? "rgba(245,192,0,0.05)" : "#161616",
              border: `1px solid ${selected === r ? "rgba(245,192,0,0.2)" : "#2A2A2A"}`,
              borderRadius: "2px",
              opacity: animated ? 1 : 0,
              transform: animated ? "none" : "translateY(8px)",
              transitionDelay: `${Math.min(i * 30, 600)}ms`,
            }}
          >
            <div className="flex items-start gap-4">
              <span
                className="text-[11px] font-mono shrink-0 mt-0.5"
                style={{ color: selected === r ? "#F5C000" : "#555" }}
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
                      <span className="text-gray-700 text-[10px]">&mdash;</span>
                      <span className="text-[11px] text-gray-600 italic truncate">{r.song}</span>
                    </>
                  )}
                  {r.note && (
                    <span className="text-[10px] text-gray-700 ml-auto italic shrink-0">
                      {r.note}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-600 text-center py-12 text-sm">
          Keine Rapzitate gefunden für &ldquo;{filter}&rdquo;
        </p>
      )}

      {/* Total count */}
      <div className="text-center mt-8">
        <span className="text-[11px] text-gray-700">
          {rapzitate.length} Rapzitate aus Episoden #{rapzitate[rapzitate.length - 1].episode_number}
          –#{rapzitate[0].episode_number} dokumentiert
        </span>
      </div>
    </div>
  );
}
