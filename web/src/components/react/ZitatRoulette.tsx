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
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/random-quote?count=15");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setQuotes(data.quotes ?? []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const spin = useCallback(() => {
    if (spinning || quotes.length < 2) return;
    setSpinning(true);

    // Pick a random target that's different from current
    let target = currentIndex;
    while (target === currentIndex && quotes.length > 1) {
      target = Math.floor(Math.random() * quotes.length);
    }

    // Animate through quotes like a slot machine
    const totalSteps = 12 + Math.floor(Math.random() * 8); // 12-20 steps
    let step = 0;
    let idx = currentIndex;

    const tick = () => {
      idx = (idx + 1) % quotes.length;
      setCurrentIndex(idx);
      step++;

      if (step < totalSteps) {
        // Ease out: get slower near the end
        const progress = step / totalSteps;
        const delay = 60 + Math.pow(progress, 2.5) * 400;
        animFrameRef.current = window.setTimeout(tick, delay);
      } else {
        // Land on target
        setCurrentIndex(target);
        setSpinning(false);
      }
    };

    animFrameRef.current = window.setTimeout(tick, 60);

    return () => clearTimeout(animFrameRef.current);
  }, [spinning, quotes.length, currentIndex]);

  useEffect(() => {
    return () => clearTimeout(animFrameRef.current);
  }, []);

  const currentQuote = quotes[currentIndex];
  const speakerName = currentQuote?.speaker === "Speaker A" ? "Felix" : "Tommi";
  const speakerColor = currentQuote?.speaker === "Speaker A" ? "#5B7DC8" : "#9C40B0";

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <p className="text-gray-600 text-center py-12 text-sm">
        Keine Zitate verfügbar.
      </p>
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
          border: "1px solid #2A2A2A",
          borderRadius: "2px",
        }}
      >
        {/* Top scanline effect */}
        <div
          className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
          style={{
            background: "linear-gradient(to bottom, #161616 0%, transparent 100%)",
          }}
        />

        {/* Bottom scanline effect */}
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10"
          style={{
            background: "linear-gradient(to top, #161616 0%, transparent 100%)",
          }}
        />

        <div className="p-8 min-h-[240px] flex flex-col justify-center">
          {currentQuote && (
            <div
              className="transition-opacity duration-100"
              style={{ opacity: spinning ? 0.6 : 1 }}
            >
              <blockquote className="text-gray-200 text-lg leading-relaxed mb-6 font-light">
                <span className="text-accent/60 text-2xl font-display leading-none">
                  &ldquo;
                </span>
                {currentQuote.text.length > 250
                  ? currentQuote.text.slice(0, 250) + "..."
                  : currentQuote.text}
                <span className="text-accent/60 text-2xl font-display leading-none">
                  &rdquo;
                </span>
              </blockquote>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: speakerColor }}
                  />
                  <span className="text-xs font-medium" style={{ color: speakerColor }}>
                    {speakerName}
                  </span>
                </div>
                {currentQuote.episode_number && (
                  <span className="text-[11px] text-gray-700 font-mono">
                    #{currentQuote.episode_number}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spin button */}
      <button
        onClick={spin}
        disabled={spinning}
        className="mt-6 w-full py-4 text-sm font-bold tracking-[0.15em] uppercase transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Reload quotes */}
      <button
        onClick={fetchQuotes}
        disabled={spinning}
        className="mt-2 w-full py-2 text-[11px] text-gray-600 hover:text-gray-400 tracking-[0.15em] uppercase transition-colors"
      >
        Neue Zitate laden
      </button>
    </div>
  );
}
