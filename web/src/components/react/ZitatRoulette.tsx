import { useCallback, useEffect, useRef, useState } from "react";

type Quote = {
  text: string;
  speaker: string;
  episode_title: string | null;
  episode_number: number | null;
};

export default function ZitatRoulette() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [spinCount, setSpinCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const fetchQuotes = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch("/api/random-quote?count=15");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const fetched = data.quotes ?? [];
      if (fetched.length > 0) {
        setQuotes(fetched);
        setCurrentIndex(0);
      } else if (quotes.length === 0) {
        // No quotes at all — might be no data in DB yet
        setError(true);
      }
      setLoaded(true);
    } catch {
      setError(true);
      setLoaded(true);
    }
  }, [quotes.length]);

  useEffect(() => {
    fetchQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spin = useCallback(() => {
    if (spinning || quotes.length < 2) return;
    try { navigator?.vibrate?.(30); } catch {}
    setSpinning(true);
    setSpinCount((prev) => prev + 1);

    let target = currentIndex;
    while (target === currentIndex && quotes.length > 1) {
      target = Math.floor(Math.random() * quotes.length);
    }

    const totalSteps = 12 + Math.floor(Math.random() * 8);
    let step = 0;
    let idx = currentIndex;

    const tick = () => {
      idx = (idx + 1) % quotes.length;
      setCurrentIndex(idx);
      step++;

      if (step < totalSteps) {
        const progress = step / totalSteps;
        const delay = 60 + Math.pow(progress, 2.5) * 400;
        animFrameRef.current = window.setTimeout(tick, delay);
      } else {
        setCurrentIndex(target);
        setSpinning(false);
      }
    };

    animFrameRef.current = window.setTimeout(tick, 60);
  }, [spinning, quotes.length, currentIndex]);

  useEffect(() => {
    return () => clearTimeout(animFrameRef.current);
  }, []);

  const [copied, setCopied] = useState(false);

  const shareQuote = useCallback(async () => {
    const q = quotes[currentIndex];
    if (!q) return;
    const speaker = q.speaker === "Speaker A" ? "Felix" : "Tommi";
    const text = `"${q.text.slice(0, 280)}"\n— ${speaker}${q.episode_title ? `, ${q.episode_title}` : ""}\n#GemischtesHack`;

    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch { /* cancelled */ }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* unavailable */ }
  }, [quotes, currentIndex]);

  const currentQuote = quotes[currentIndex];
  const speakerName = currentQuote?.speaker === "Speaker A" ? "Felix" : "Tommi";
  const speakerColor = currentQuote?.speaker === "Speaker A" ? "#5B7DC8" : "#9C40B0";

  // Loading skeleton
  if (!loaded) {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          className="p-8 md:p-10"
          style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: "2px", minHeight: "260px" }}
        >
          <div className="space-y-3">
            <div className="h-5 bg-surface-200 animate-pulse rounded-sm w-full" />
            <div className="h-5 bg-surface-200 animate-pulse rounded-sm w-5/6" />
            <div className="h-5 bg-surface-200 animate-pulse rounded-sm w-2/3" />
          </div>
          <div className="flex items-center gap-2.5 mt-8">
            <div className="w-2.5 h-2.5 bg-surface-200 animate-pulse rounded-full" />
            <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-16" />
          </div>
        </div>
        <div className="mt-6 h-12 bg-surface-200 animate-pulse rounded-sm" />
      </div>
    );
  }

  // Error / empty state with retry
  if (error || quotes.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          className="p-8 md:p-10 text-center"
          style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: "2px", minHeight: "200px" }}
        >
          <div className="flex flex-col items-center justify-center h-full py-8">
            <svg className="w-10 h-10 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-gray-400 text-sm mb-1">Noch nicht genug Daten</p>
            <p className="text-gray-500 text-xs mb-6">
              Sobald mehr Episoden transkribiert sind, erscheinen hier zufällige Zitate.
            </p>
            <button
              onClick={fetchQuotes}
              className="text-xs text-gray-400 hover:text-accent transition-colors tracking-[0.15em] uppercase py-2 px-6"
              style={{ border: "1px solid #2A2A2A", borderRadius: "2px" }}
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Roulette display */}
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          background: "#161616",
          border: spinning ? "1px solid #383838" : "1px solid #2A2A2A",
          borderRadius: "2px",
          transition: "border-color 300ms ease",
        }}
      >
        {/* Top scanline */}
        <div
          className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
          style={{ background: "linear-gradient(to bottom, #161616 0%, transparent 100%)" }}
        />
        {/* Bottom scanline */}
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10"
          style={{ background: "linear-gradient(to top, #161616 0%, transparent 100%)" }}
        />

        {spinCount > 0 && (
          <div className="absolute top-4 right-4 z-20">
            <span className="text-[11px] text-gray-600 font-mono">#{spinCount}</span>
          </div>
        )}

        <div className="p-8 md:p-10 min-h-[260px] flex flex-col justify-center">
          {currentQuote && (
            <div
              className="transition-opacity duration-100"
              style={{ opacity: spinning ? 0.5 : 1 }}
            >
              <blockquote className="text-gray-200 text-lg md:text-xl leading-relaxed mb-6 font-light">
                <span className="text-accent/60 text-2xl font-display leading-none">&ldquo;</span>
                {currentQuote.text.length > 280
                  ? currentQuote.text.slice(0, 280) + "..."
                  : currentQuote.text}
                <span className="text-accent/60 text-2xl font-display leading-none">&rdquo;</span>
              </blockquote>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full transition-colors duration-200"
                    style={{ background: speakerColor }}
                  />
                  <span className="text-sm font-medium transition-colors duration-200" style={{ color: speakerColor }}>
                    {speakerName}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {currentQuote.episode_title && (
                    <span className="text-xs text-gray-500 truncate max-w-[200px] hidden md:inline">
                      {currentQuote.episode_title}
                    </span>
                  )}
                  {currentQuote.episode_number && (
                    <span className="text-xs text-gray-500 font-mono">
                      #{currentQuote.episode_number}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); shareQuote(); }}
                    className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-300 transition-colors ml-1"
                    title="Zitat teilen"
                  >
                    {copied ? (
                      <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spin button */}
      <button
        onClick={spin}
        disabled={spinning}
        className="mt-6 w-full py-4 text-sm font-bold tracking-[0.15em] uppercase transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: spinning ? "#2A2A2A" : "#F5C000",
          color: spinning ? "#666" : "#0A0A0A",
          borderRadius: "2px",
        }}
      >
        {spinning ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 border-2 border-gray-500/30 border-t-gray-500 rounded-full animate-spin" />
            Dreht...
          </span>
        ) : (
          "Zitat ziehen"
        )}
      </button>

      {/* Reload */}
      <button
        onClick={() => {
          fetchQuotes();
          setSpinCount(0);
        }}
        disabled={spinning}
        className="mt-2 w-full py-2 text-xs text-gray-500 hover:text-gray-300 tracking-[0.15em] uppercase transition-colors"
      >
        Neue Zitate laden
      </button>
    </div>
  );
}
