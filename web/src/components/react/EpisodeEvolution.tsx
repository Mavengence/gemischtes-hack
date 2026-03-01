import { useEffect, useRef, useState } from "react";

type YearStat = {
  year: number;
  count: number;
  totalMinutes: number;
  avgMinutes: number;
};

type EpisodePoint = {
  episode_number: number | null;
  title: string;
  pub_date: string;
  minutes: number;
};

export default function EpisodeEvolution() {
  const [yearStats, setYearStats] = useState<YearStat[]>([]);
  const [timeline, setTimeline] = useState<EpisodePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [animated, setAnimated] = useState(false);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [hoveredEp, setHoveredEp] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/episode-stats")
      .then((res) => res.json())
      .then((data) => {
        setYearStats(data.yearStats ?? []);
        setTimeline(data.timeline ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!containerRef.current || yearStats.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [yearStats]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-14">
          <div className="space-y-2.5">
            <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-48 mb-5" />
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-10" />
                <div className="flex-1 h-7 bg-surface-200 animate-pulse" style={{ borderRadius: "1px", width: `${80 - i * 8}%` }} />
              </div>
            ))}
          </div>
          <div className="space-y-2.5">
            <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-36 mb-5" />
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-10" />
                <div className="flex-1 h-7 bg-surface-200 animate-pulse" style={{ borderRadius: "1px", width: `${70 - i * 6}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (yearStats.length === 0) {
    return (
      <p className="text-gray-500 text-center py-12 text-sm">
        Keine Episoden-Daten verfügbar.
      </p>
    );
  }

  const maxAvg = Math.max(...yearStats.map((y) => y.avgMinutes));
  const maxCount = Math.max(...yearStats.map((y) => y.count));

  return (
    <div ref={containerRef} className="max-w-4xl mx-auto">
      {/* Year-by-year stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-14">
        {/* Average duration per year */}
        <div>
          <h3 className="text-[11px] text-gray-500 uppercase tracking-[0.15em] mb-5 flex items-center gap-2">
            <span className="inline-block w-3 h-0.5" style={{ background: "linear-gradient(90deg, #5B7DC8, #9C40B0)" }} />
            Durchschnittliche Länge pro Jahr
          </h3>
          <div className="space-y-2.5">
            {yearStats.map((year, i) => (
              <div
                key={year.year}
                className="flex items-center gap-3 group cursor-default"
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                <span className="text-xs text-gray-500 font-mono w-10 shrink-0 group-hover:text-gray-300 transition-colors">
                  {year.year}
                </span>
                <div
                  className="flex-1 h-7 overflow-hidden relative"
                  style={{ background: "#1F1F1F", borderRadius: "1px" }}
                >
                  <div
                    className="h-full flex items-center transition-all ease-out"
                    style={{
                      width: animated
                        ? `${(year.avgMinutes / maxAvg) * 100}%`
                        : "0%",
                      transitionDuration: `${800 + i * 150}ms`,
                      background:
                        hoveredBar === i
                          ? "linear-gradient(90deg, #F5C000, #FFD740)"
                          : "linear-gradient(90deg, #5B7DC8, #9C40B0)",
                    }}
                  >
                    <span
                      className="text-[11px] font-mono pl-2.5 whitespace-nowrap font-medium transition-colors"
                      style={{ color: hoveredBar === i ? "#0A0A0A" : "rgba(255,255,255,0.8)" }}
                    >
                      {year.avgMinutes} min
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Episodes per year */}
        <div>
          <h3 className="text-[11px] text-gray-500 uppercase tracking-[0.15em] mb-5 flex items-center gap-2">
            <span className="inline-block w-3 h-0.5" style={{ background: "#F5C000" }} />
            Episoden pro Jahr
          </h3>
          <div className="space-y-2.5">
            {yearStats.map((year, i) => {
              const barWidth = (year.count / maxCount) * 100;
              const showLabelInside = barWidth > 20;
              return (
                <div key={year.year} className="flex items-center gap-3 group cursor-default">
                  <span className="text-xs text-gray-500 font-mono w-10 shrink-0 group-hover:text-gray-300 transition-colors">
                    {year.year}
                  </span>
                  <div
                    className="flex-1 h-7 overflow-hidden relative"
                    style={{ background: "#1F1F1F", borderRadius: "1px" }}
                  >
                    <div
                      className="h-full flex items-center transition-all ease-out"
                      style={{
                        width: animated ? `${barWidth}%` : "0%",
                        transitionDuration: `${800 + i * 150}ms`,
                        background: "linear-gradient(90deg, #F5C000, #C49A00)",
                      }}
                    >
                      {showLabelInside && (
                        <span className="text-[11px] font-mono text-black/80 pl-2.5 whitespace-nowrap font-bold">
                          {year.count}
                        </span>
                      )}
                    </div>
                    {!showLabelInside && animated && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 text-[11px] font-mono text-gray-400 font-bold"
                        style={{ left: `calc(${barWidth}% + 8px)` }}
                      >
                        {year.count}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Episode duration scatter/timeline */}
      {timeline.length > 0 && (
        <div
          className="p-6 md:p-8"
          style={{
            background: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: "2px",
          }}
        >
          <h3 className="text-[11px] text-gray-500 uppercase tracking-[0.15em] mb-6 text-center">
            Jede Episode — Länge in Minuten
          </h3>

          {/* Tooltip */}
          {hoveredEp !== null && timeline[hoveredEp] && (
            <div className="text-center mb-3 transition-opacity duration-150">
              <span className="text-xs text-gray-400">
                {timeline[hoveredEp].title}
                <span className="text-gray-600 mx-2">—</span>
                <span className="font-mono text-accent">{timeline[hoveredEp].minutes} min</span>
              </span>
            </div>
          )}

          <div
            className="relative overflow-x-auto pb-2"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#2A2A2A #161616" }}
          >
            <div
              className="flex items-end gap-px"
              style={{ minWidth: `${timeline.length * 4}px`, height: "140px" }}
            >
              {timeline.map((ep, i) => {
                const maxMin = Math.max(...timeline.map((e) => e.minutes));
                const height = (ep.minutes / maxMin) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 min-w-[2px] max-w-[6px] transition-all group cursor-default"
                    style={{
                      height: animated ? `${height}%` : "0%",
                      transitionDuration: "500ms",
                      transitionDelay: `${Math.min(i * 8, 2000)}ms`,
                      background:
                        hoveredEp === i
                          ? "#FFFFFF"
                          : ep.minutes > 90
                            ? "#F5C000"
                            : ep.minutes > 60
                              ? "#9C40B0"
                              : "#5B7DC8",
                      borderRadius: "1px 1px 0 0",
                      opacity: hoveredEp !== null && hoveredEp !== i ? 0.4 : 1,
                    }}
                    onMouseEnter={() => setHoveredEp(i)}
                    onMouseLeave={() => setHoveredEp(null)}
                  />
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-5 pt-4 border-t border-surface-300/20">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5"
                style={{ background: "#5B7DC8", borderRadius: "1px" }}
              />
              <span className="text-[11px] text-gray-500">&lt; 60 min</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5"
                style={{ background: "#9C40B0", borderRadius: "1px" }}
              />
              <span className="text-[11px] text-gray-500">60–90 min</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5"
                style={{ background: "#F5C000", borderRadius: "1px" }}
              />
              <span className="text-[11px] text-gray-500">&gt; 90 min</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
