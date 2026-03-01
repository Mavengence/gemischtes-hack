import { useEffect, useRef, useState } from "react";

type SpeakerStats = {
  felix: { seconds: number; minutes: number; chunks: number; percent: number };
  tommi: { seconds: number; minutes: number; chunks: number; percent: number };
  totalChunks: number;
  totalMinutes: number;
};

export default function SpeakerDuel() {
  const [stats, setStats] = useState<SpeakerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [animated, setAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/speaker-stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.felix && data.tommi) setStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Trigger animation on scroll into view
  useEffect(() => {
    if (!containerRef.current || !stats) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [stats]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-gray-600 text-center py-12 text-sm">
        Keine Speaker-Daten verfügbar.
      </p>
    );
  }

  const felixWidth = animated ? stats.felix.percent : 0;
  const tommiWidth = animated ? stats.tommi.percent : 0;

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto">
      {/* VS Header */}
      <div className="flex items-center justify-center gap-8 mb-12">
        <div className="text-center">
          <div
            className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-3 flex items-center justify-center text-3xl md:text-4xl font-display font-bold"
            style={{
              background: "rgba(91,125,200,0.12)",
              border: "2px solid rgba(91,125,200,0.3)",
              borderRadius: "2px",
              color: "#5B7DC8",
            }}
          >
            F
          </div>
          <p className="text-sm font-medium text-gray-300">Felix</p>
          <p className="text-[11px] text-gray-600">Lobrecht</p>
        </div>

        <div className="text-center">
          <div
            className="text-4xl md:text-5xl font-display font-bold"
            style={{ color: "#F5C000" }}
          >
            VS
          </div>
        </div>

        <div className="text-center">
          <div
            className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-3 flex items-center justify-center text-3xl md:text-4xl font-display font-bold"
            style={{
              background: "rgba(156,64,176,0.12)",
              border: "2px solid rgba(156,64,176,0.3)",
              borderRadius: "2px",
              color: "#9C40B0",
            }}
          >
            T
          </div>
          <p className="text-sm font-medium text-gray-300">Tommi</p>
          <p className="text-[11px] text-gray-600">Schmitt</p>
        </div>
      </div>

      {/* Tug of war bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono" style={{ color: "#5B7DC8" }}>
            {stats.felix.percent}%
          </span>
          <span className="text-[10px] text-gray-600 uppercase tracking-[0.2em]">Redeanteil</span>
          <span className="text-xs font-mono" style={{ color: "#9C40B0" }}>
            {stats.tommi.percent}%
          </span>
        </div>
        <div
          className="h-3 flex overflow-hidden"
          style={{ background: "#1F1F1F", borderRadius: "2px" }}
        >
          <div
            className="h-full transition-all duration-[1500ms] ease-out"
            style={{
              width: `${felixWidth}%`,
              background: "linear-gradient(90deg, #5B7DC8, #7B9DE8)",
            }}
          />
          <div className="w-px bg-surface shrink-0" />
          <div
            className="h-full transition-all duration-[1500ms] ease-out"
            style={{
              width: `${tommiWidth}%`,
              background: "linear-gradient(90deg, #9C40B0, #BC60D0)",
            }}
          />
        </div>
      </div>

      {/* Detailed stats */}
      <div className="grid grid-cols-2 gap-3">
        {/* Felix stats */}
        <div
          className="p-5"
          style={{
            background: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: "2px",
          }}
        >
          <div className="space-y-4">
            <div>
              <div
                className="text-3xl font-display font-bold tabular-nums transition-all duration-1000"
                style={{ color: "#5B7DC8" }}
              >
                {animated ? stats.felix.minutes.toLocaleString("de-DE") : "0"}
              </div>
              <div className="text-[10px] text-gray-600 uppercase tracking-[0.2em] mt-1">
                Minuten
              </div>
            </div>
            <div>
              <div className="text-lg font-display font-bold text-gray-400 tabular-nums">
                {animated ? stats.felix.chunks.toLocaleString("de-DE") : "0"}
              </div>
              <div className="text-[10px] text-gray-600 uppercase tracking-[0.2em] mt-1">
                Segmente
              </div>
            </div>
          </div>
        </div>

        {/* Tommi stats */}
        <div
          className="p-5"
          style={{
            background: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: "2px",
          }}
        >
          <div className="space-y-4">
            <div>
              <div
                className="text-3xl font-display font-bold tabular-nums transition-all duration-1000"
                style={{ color: "#9C40B0" }}
              >
                {animated ? stats.tommi.minutes.toLocaleString("de-DE") : "0"}
              </div>
              <div className="text-[10px] text-gray-600 uppercase tracking-[0.2em] mt-1">
                Minuten
              </div>
            </div>
            <div>
              <div className="text-lg font-display font-bold text-gray-400 tabular-nums">
                {animated ? stats.tommi.chunks.toLocaleString("de-DE") : "0"}
              </div>
              <div className="text-[10px] text-gray-600 uppercase tracking-[0.2em] mt-1">
                Segmente
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Total */}
      <div className="text-center mt-6">
        <span className="text-[11px] text-gray-700">
          Gesamt: {stats.totalMinutes.toLocaleString("de-DE")} Minuten analysiert aus{" "}
          {stats.totalChunks.toLocaleString("de-DE")} Segmenten
        </span>
      </div>
    </div>
  );
}
