import { useEffect, useMemo, useRef, useState } from "react";

type SpeakerData = {
  seconds: number;
  minutes: number;
  chunks: number;
  percent: number;
  words: number;
  wordsPercent: number;
  chunksPercent: number;
  avgDuration: number;
  avgPercent: number;
  longestSegment: number;
  longestPercent: number;
};

type SpeakerStats = {
  felix: SpeakerData;
  tommi: SpeakerData;
  totalChunks: number;
  totalMinutes: number;
};

type MetricKey = "redeanteil" | "woerter" | "segmente" | "avg_dauer" | "laengster";

type MetricConfig = {
  key: MetricKey;
  label: string;
  shortLabel: string;
  felixValue: (s: SpeakerStats) => number;
  tommiValue: (s: SpeakerStats) => number;
  felixPercent: (s: SpeakerStats) => number;
  tommiPercent: (s: SpeakerStats) => number;
  formatValue: (v: number) => string;
  unit: string;
  winnerText: (leader: "felix" | "tommi") => string;
};

const METRICS: MetricConfig[] = [
  {
    key: "redeanteil",
    label: "Redeanteil",
    shortLabel: "Rede",
    felixValue: (s) => s.felix.minutes,
    tommiValue: (s) => s.tommi.minutes,
    felixPercent: (s) => s.felix.percent,
    tommiPercent: (s) => s.tommi.percent,
    formatValue: (v) => v.toLocaleString("de-DE"),
    unit: "Minuten",
    winnerText: (l) => `${l === "felix" ? "Felix" : "Tommi"} redet mehr`,
  },
  {
    key: "woerter",
    label: "Wörter",
    shortLabel: "Wörter",
    felixValue: (s) => s.felix.words,
    tommiValue: (s) => s.tommi.words,
    felixPercent: (s) => s.felix.wordsPercent,
    tommiPercent: (s) => s.tommi.wordsPercent,
    formatValue: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString("de-DE"),
    unit: "Wörter",
    winnerText: (l) => `${l === "felix" ? "Felix" : "Tommi"} sagt mehr Wörter`,
  },
  {
    key: "segmente",
    label: "Segmente",
    shortLabel: "Segm.",
    felixValue: (s) => s.felix.chunks,
    tommiValue: (s) => s.tommi.chunks,
    felixPercent: (s) => s.felix.chunksPercent,
    tommiPercent: (s) => s.tommi.chunksPercent,
    formatValue: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString("de-DE"),
    unit: "Segmente",
    winnerText: (l) => `${l === "felix" ? "Felix" : "Tommi"} hat mehr Segmente`,
  },
  {
    key: "avg_dauer",
    label: "Ø Segmentdauer",
    shortLabel: "Ø Dauer",
    felixValue: (s) => s.felix.avgDuration,
    tommiValue: (s) => s.tommi.avgDuration,
    felixPercent: (s) => s.felix.avgPercent,
    tommiPercent: (s) => s.tommi.avgPercent,
    formatValue: (v) => `${v.toFixed(1)}s`,
    unit: "Sekunden",
    winnerText: (l) => `${l === "felix" ? "Felix" : "Tommi"} redet länger am Stück`,
  },
  {
    key: "laengster",
    label: "Längster Monolog",
    shortLabel: "Monolog",
    felixValue: (s) => s.felix.longestSegment,
    tommiValue: (s) => s.tommi.longestSegment,
    felixPercent: (s) => s.felix.longestPercent,
    tommiPercent: (s) => s.tommi.longestPercent,
    formatValue: (v) => {
      const min = Math.floor(v / 60);
      const sec = Math.round(v % 60);
      return min > 0 ? `${min}:${sec.toString().padStart(2, "0")}` : `${sec}s`;
    },
    unit: "",
    winnerText: (l) => `${l === "felix" ? "Felix" : "Tommi"} hat den längsten Monolog`,
  },
];

export default function SpeakerDuel() {
  const [stats, setStats] = useState<SpeakerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [animated, setAnimated] = useState(false);
  const [activeMetric, setActiveMetric] = useState<MetricKey>("redeanteil");
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

  const metric = useMemo(() => METRICS.find((m) => m.key === activeMetric)!, [activeMetric]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-8 md:gap-12 mb-12">
          <div className="text-center">
            <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-3 bg-surface-200 animate-pulse" style={{ borderRadius: "2px" }} />
            <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-12 mx-auto mt-2" />
          </div>
          <div className="h-10 w-12 bg-surface-200 animate-pulse rounded-sm" />
          <div className="text-center">
            <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-3 bg-surface-200 animate-pulse" style={{ borderRadius: "2px" }} />
            <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-12 mx-auto mt-2" />
          </div>
        </div>
        <div className="h-4 bg-surface-200 animate-pulse rounded-sm mb-10" />
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-gray-500 text-center py-12 text-sm">
        Keine Speaker-Daten verfügbar.
      </p>
    );
  }

  const felixPct = animated ? metric.felixPercent(stats) : 0;
  const tommiPct = animated ? metric.tommiPercent(stats) : 0;
  const felixLeads = metric.felixPercent(stats) >= metric.tommiPercent(stats);
  const felixVal = metric.felixValue(stats);
  const tommiVal = metric.tommiValue(stats);

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto">
      {/* VS Header */}
      <div className="flex items-center justify-center gap-8 md:gap-12 mb-10">
        <div className="text-center">
          <div
            className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-3 flex items-center justify-center text-3xl md:text-4xl font-display font-bold transition-all duration-700"
            style={{
              background: animated ? "rgba(91,125,200,0.15)" : "rgba(91,125,200,0.05)",
              border: `2px solid ${animated ? "rgba(91,125,200,0.4)" : "rgba(91,125,200,0.15)"}`,
              borderRadius: "2px",
              color: "#5B7DC8",
            }}
          >
            F
          </div>
          <p className="text-sm font-medium text-gray-300">Felix</p>
          <p className="text-xs text-gray-500">Lobrecht</p>
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
            className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-3 flex items-center justify-center text-3xl md:text-4xl font-display font-bold transition-all duration-700"
            style={{
              background: animated ? "rgba(156,64,176,0.15)" : "rgba(156,64,176,0.05)",
              border: `2px solid ${animated ? "rgba(156,64,176,0.4)" : "rgba(156,64,176,0.15)"}`,
              borderRadius: "2px",
              color: "#9C40B0",
            }}
          >
            T
          </div>
          <p className="text-sm font-medium text-gray-300">Tommi</p>
          <p className="text-xs text-gray-500">Schmitt</p>
        </div>
      </div>

      {/* Metric selector tabs */}
      <div className="flex gap-1.5 mb-8 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none">
        {METRICS.map((m) => {
          const isActive = m.key === activeMetric;
          return (
            <button
              key={m.key}
              onClick={() => setActiveMetric(m.key)}
              className="text-xs px-4 py-2 whitespace-nowrap transition-all duration-200 shrink-0"
              style={{
                background: isActive ? "rgba(245,192,0,0.08)" : "#161616",
                border: `1px solid ${isActive ? "rgba(245,192,0,0.25)" : "#2A2A2A"}`,
                color: isActive ? "#F5C000" : "#888",
                borderRadius: "2px",
                fontWeight: isActive ? 600 : 400,
                letterSpacing: "0.04em",
              }}
            >
              <span className="hidden md:inline">{m.label}</span>
              <span className="md:hidden">{m.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Tug of war bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-display font-bold tabular-nums" style={{ color: "#5B7DC8" }}>
            {animated ? metric.formatValue(felixVal) : "0"}
          </span>
          <span className="text-[11px] text-gray-500 uppercase tracking-[0.2em]">{metric.label}</span>
          <span className="text-sm font-display font-bold tabular-nums" style={{ color: "#9C40B0" }}>
            {animated ? metric.formatValue(tommiVal) : "0"}
          </span>
        </div>
        <div
          className="h-4 flex overflow-hidden relative"
          style={{ background: "#1F1F1F", borderRadius: "2px" }}
        >
          <div
            className="h-full transition-all duration-[1500ms] ease-out relative"
            style={{
              width: `${felixPct}%`,
              background: "linear-gradient(90deg, #5B7DC8, #7B9DE8)",
            }}
          />
          <div className="w-0.5 bg-surface shrink-0" />
          <div
            className="h-full transition-all duration-[1500ms] ease-out"
            style={{
              width: `${tommiPct}%`,
              background: "linear-gradient(90deg, #9C40B0, #C070D0)",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-gray-600 tabular-nums font-mono">
            {animated ? `${metric.felixPercent(stats)}%` : ""}
          </span>
          <span className="text-[11px] text-gray-600">
            {animated ? metric.winnerText(felixLeads ? "felix" : "tommi") : ""}
          </span>
          <span className="text-[11px] text-gray-600 tabular-nums font-mono">
            {animated ? `${metric.tommiPercent(stats)}%` : ""}
          </span>
        </div>
      </div>

      {/* Detailed stats — side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Felix stats */}
        <div
          className="p-5 md:p-6"
          style={{
            background: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: "2px",
            borderTop: "2px solid #5B7DC8",
          }}
        >
          <div className="space-y-5">
            <div>
              <div
                className="text-3xl md:text-4xl font-display font-bold tabular-nums"
                style={{ color: "#5B7DC8" }}
              >
                {animated ? metric.formatValue(felixVal) : "—"}
              </div>
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.15em] mt-1">
                {metric.unit || metric.label}
              </div>
            </div>
            <div className="h-px bg-surface-300/30" />
            <div>
              <div className="text-xl font-display font-bold text-gray-300 tabular-nums">
                {animated ? `${metric.felixPercent(stats)}%` : "—"}
              </div>
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.15em] mt-1">
                Anteil
              </div>
            </div>
          </div>
        </div>

        {/* Tommi stats */}
        <div
          className="p-5 md:p-6"
          style={{
            background: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: "2px",
            borderTop: "2px solid #9C40B0",
          }}
        >
          <div className="space-y-5">
            <div>
              <div
                className="text-3xl md:text-4xl font-display font-bold tabular-nums"
                style={{ color: "#9C40B0" }}
              >
                {animated ? metric.formatValue(tommiVal) : "—"}
              </div>
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.15em] mt-1">
                {metric.unit || metric.label}
              </div>
            </div>
            <div className="h-px bg-surface-300/30" />
            <div>
              <div className="text-xl font-display font-bold text-gray-300 tabular-nums">
                {animated ? `${metric.tommiPercent(stats)}%` : "—"}
              </div>
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.15em] mt-1">
                Anteil
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Total */}
      <div className="text-center mt-8">
        <span className="text-xs text-gray-500">
          Gesamt: {stats.totalMinutes.toLocaleString("de-DE")} Minuten analysiert aus{" "}
          {stats.totalChunks.toLocaleString("de-DE")} Segmenten
        </span>
      </div>
    </div>
  );
}
