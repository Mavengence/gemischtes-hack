import { useEffect, useState } from "react";

type Topic = {
  id: number;
  label: string;
  keywords: string[];
  chunk_count: number;
};

export default function TopicTimeline() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredTopic, setHoveredTopic] = useState<number | null>(null);
  const [view, setView] = useState<"cloud" | "bars">("cloud");

  useEffect(() => {
    fetch("/api/topics")
      .then((res) => res.json())
      .then((data) => setTopics(data.topics ?? []))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <p className="text-gray-500 text-center py-12 text-sm">
        Noch keine Themen extrahiert.
      </p>
    );
  }

  const maxCount = Math.max(...topics.map((t) => t.chunk_count));

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center justify-center gap-1 mb-10">
        <button
          onClick={() => setView("cloud")}
          className="text-xs px-4 py-2 transition-all duration-200"
          style={{
            background: view === "cloud" ? "rgba(245,192,0,0.08)" : "transparent",
            border: `1px solid ${view === "cloud" ? "rgba(245,192,0,0.2)" : "#2A2A2A"}`,
            color: view === "cloud" ? "#F5C000" : "#666",
            borderRadius: "2px 0 0 2px",
          }}
        >
          Wolke
        </button>
        <button
          onClick={() => setView("bars")}
          className="text-xs px-4 py-2 transition-all duration-200"
          style={{
            background: view === "bars" ? "rgba(245,192,0,0.08)" : "transparent",
            border: `1px solid ${view === "bars" ? "rgba(245,192,0,0.2)" : "#2A2A2A"}`,
            color: view === "bars" ? "#F5C000" : "#666",
            borderRadius: "0 2px 2px 0",
          }}
        >
          Balken
        </button>
      </div>

      {/* Topic cloud */}
      {view === "cloud" && (
        <div className="flex flex-wrap gap-2 justify-center">
          {topics.map((topic) => {
            const ratio = topic.chunk_count / maxCount;
            const sizeClass =
              ratio > 0.6
                ? "text-base px-4 py-2"
                : ratio > 0.3
                  ? "text-sm px-3 py-1.5"
                  : "text-xs px-2.5 py-1";
            const isHovered = hoveredTopic === topic.id;

            return (
              <span
                key={topic.id}
                className={`${sizeClass} transition-all duration-200 cursor-default`}
                style={{
                  background: isHovered ? "rgba(245,192,0,0.08)" : "rgba(42,42,42,0.4)",
                  border: `1px solid ${isHovered ? "rgba(245,192,0,0.25)" : "rgba(56,56,56,0.3)"}`,
                  color: isHovered ? "#F5C000" : "#999",
                  borderRadius: "1px",
                }}
                title={`${topic.chunk_count} Erwähnungen • ${topic.keywords.slice(0, 3).join(", ")}`}
                onMouseEnter={() => setHoveredTopic(topic.id)}
                onMouseLeave={() => setHoveredTopic(null)}
              >
                {topic.label}
                {isHovered && (
                  <span className="ml-1.5 text-[10px] text-gray-500 font-mono">
                    {topic.chunk_count}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Bar chart */}
      {view === "bars" && (
        <div className="space-y-2">
          {topics.map((topic) => {
            const isHovered = hoveredTopic === topic.id;
            return (
              <div
                key={topic.id}
                className="flex items-center gap-3 group"
                onMouseEnter={() => setHoveredTopic(topic.id)}
                onMouseLeave={() => setHoveredTopic(null)}
              >
                <span
                  className="text-xs w-44 md:w-56 truncate shrink-0 transition-colors duration-200"
                  style={{ color: isHovered ? "#F5C000" : "#999" }}
                  title={topic.label}
                >
                  {topic.label}
                </span>
                <div className="flex-1 h-2 overflow-hidden" style={{ background: "#1F1F1F", borderRadius: "1px" }}>
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${(topic.chunk_count / maxCount) * 100}%`,
                      background: isHovered
                        ? "linear-gradient(90deg, #F5C000, #FFD740)"
                        : "linear-gradient(90deg, #5B7DC8, #9C40B0)",
                      borderRadius: "1px",
                    }}
                  />
                </div>
                <span
                  className="text-[11px] font-mono w-10 text-right transition-colors duration-200"
                  style={{ color: isHovered ? "#F5C000" : "#666" }}
                >
                  {topic.chunk_count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
