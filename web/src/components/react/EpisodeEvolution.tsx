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
      <div className="flex justify-center py-16">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (yearStats.length === 0) {
    return (
      <p className="text-gray-600 text-center py-12 text-sm">
        Keine Episoden-Daten verfügbar.
      </p>
    );
  }

  const maxAvg = Math.max(...yearStats.map((y) => y.avgMinutes));
  const maxCount = Math.max(...yearStats.map((y) => y.count));

  return (
    <div ref={containerRef} className="max-w-4xl mx-auto">
      {/* Year-by-year stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Average duration per year */}
        <div>
          <h3 className="text-[10px] text-gray-600 uppercase tracking-[0.25em] mb-4">
            Durchschnittliche Länge pro Jahr
          </h3>
          <div className="space-y-2">
            {yearStats.map((year, i) => (
              <div
                key={year.year}
                className="flex items-center gap-3 group cursor-default"
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                <span className="text-xs text-gray-500 font-mono w-10 shrink-0">
                  {year.year}
                </span>
                <div
                  className="flex-1 h-6 overflow-hidden relative"
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
                    <span className="text-[10px] font-mono text-white/80 pl-2 whitespace-nowrap">
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
          <h3 className="text-[10px] text-gray-600 uppercase tracking-[0.25em] mb-4">
            Episoden pro Jahr
          </h3>
          <div className="space-y-2">
            {yearStats.map((year, i) => (
              <div key={year.year} className="flex items-center gap-3 group cursor-default">
                <span className="text-xs text-gray-500 font-mono w-10 shrink-0">
                  {year.year}
                </span>
                <div
                  className="flex-1 h-6 overflow-hidden relative"
                  style={{ background: "#1F1F1F", borderRadius: "1px" }}
                >
                  <div
                    className="h-full flex items-center transition-all ease-out"
                    style={{
                      width: animated
                        ? `${(year.count / maxCount) * 100}%`
                        : "0%",
                      transitionDuration: `${800 + i * 150}ms`,
                      background: "linear-gradient(90deg, #F5C000, #C49A00)",
                    }}
                  >
                    <span className="text-[10px] font-mono text-black/70 pl-2 whitespace-nowrap font-medium">
                      {year.count}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Episode duration scatter/timeline */}
      {timeline.length > 0 && (
        <div>
          <h3 className="text-[10px] text-gray-600 uppercase tracking-[0.25em] mb-4 text-center">
            Jede Episode — Länge in Minuten
          </h3>
          <div
            className="relative overflow-x-auto pb-4"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#2A2A2A #0A0A0A" }}
          >
            <div
              className="flex items-end gap-px"
              style={{ minWidth: `${timeline.length * 4}px`, height: "120px" }}
            >
              {timeline.map((ep, i) => {
                const maxMin = Math.max(...timeline.map((e) => e.minutes));
                const height = (ep.minutes / maxMin) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 min-w-[2px] max-w-[6px] transition-all duration-500 group relative"
                    style={{
                      height: animated ? `${height}%` : "0%",
                      transitionDelay: `${Math.min(i * 8, 2000)}ms`,
                      background:
                        ep.minutes > 90
                          ? "#F5C000"
                          : ep.minutes > 60
                            ? "#9C40B0"
                            : "#5B7DC8",
                      borderRadius: "1px 1px 0 0",
                    }}
                    title={`${ep.title} — ${ep.minutes} min`}
                  />
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2"
                  style={{ background: "#5B7DC8", borderRadius: "1px" }}
                />
                <span className="text-[10px] text-gray-600">&lt; 60 min</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2"
                  style={{ background: "#9C40B0", borderRadius: "1px" }}
                />
                <span className="text-[10px] text-gray-600">60-90 min</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2"
                  style={{ background: "#F5C000", borderRadius: "1px" }}
                />
                <span className="text-[10px] text-gray-600">&gt; 90 min</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
