import { useCallback, useEffect, useRef, useState } from "react";

type SearchResult = {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
  speakers: string[];
  score: number;
  episode: {
    glt_id: string;
    title: string;
    episode_number: number | null;
    pub_date: string;
  } | null;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SearchResults() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  return (
    <div>
      <div className="relative">
        <label htmlFor="episode-search" className="sr-only">Episodensuche</label>
        <input
          id="episode-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche in allen Episoden..."
          aria-label="Episodensuche"
          className="input w-full text-base"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-400/80 text-center py-10 text-sm">
          Suche fehlgeschlagen. Bitte erneut versuchen.
        </p>
      )}

      {searched && !error && results.length === 0 && (
        <p className="text-gray-600 text-center py-12 text-sm">
          Keine Ergebnisse.
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-6 space-y-2">
          {results.map((result) => {
            const isFelix = result.speakers.includes("Speaker A");
            const isTommi = result.speakers.includes("Speaker B");

            return (
              <div key={result.id} className="card">
                <div className="flex items-center gap-2 mb-2">
                  {result.episode && (
                    <span className="text-[11px] text-gray-600 font-mono">
                      {result.episode.episode_number
                        ? `#${result.episode.episode_number}`
                        : result.episode.glt_id}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-700">|</span>
                  <span className="text-[11px] text-gray-600 truncate">
                    {result.episode?.title}
                  </span>
                  <span className="ml-auto text-[11px] text-gray-700 font-mono shrink-0">
                    {formatTime(result.start_time)}
                  </span>
                </div>
                <p className="text-sm text-gray-300 line-clamp-3 leading-relaxed">{result.text}</p>
                <div className="flex items-center gap-3 mt-2">
                  {isFelix && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-0.5 h-3 bg-felix" aria-hidden="true" />
                      <span className="text-[11px] text-felix tracking-wide">Felix</span>
                    </span>
                  )}
                  {isTommi && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-0.5 h-3 bg-tommi" aria-hidden="true" />
                      <span className="text-[11px] text-tommi tracking-wide">Tommi</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
