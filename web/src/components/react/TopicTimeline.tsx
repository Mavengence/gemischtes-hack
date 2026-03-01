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
      <p className="text-gray-600 text-center py-12 text-sm">
        Noch keine Themen extrahiert.
      </p>
    );
  }

  const maxCount = Math.max(...topics.map((t) => t.chunk_count));

  return (
    <div className="space-y-12">
      {/* Topic cloud — three categorical sizes */}
      <div className="flex flex-wrap gap-2 justify-center">
        {topics.map((topic) => {
          const ratio = topic.chunk_count / maxCount;
          const sizeClass =
            ratio > 0.6
              ? "text-base px-4 py-1.5"
              : ratio > 0.3
                ? "text-sm px-3 py-1"
                : "text-xs px-2.5 py-0.5";

          return (
            <span
              key={topic.id}
              className={`${sizeClass} bg-surface-200/40 border border-surface-300/30 text-gray-400 hover:border-accent/30 hover:text-accent transition-all cursor-default`}
              style={{ borderRadius: "1px" }}
              title={`${topic.chunk_count} Erw\u00e4hnungen`}
            >
              {topic.label}
            </span>
          );
        })}
      </div>

      {/* Bar chart */}
      <div className="space-y-2">
        {topics.map((topic) => (
          <div key={topic.id} className="flex items-center gap-3 group">
            <span
              className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors w-40 md:w-52 truncate shrink-0"
              title={topic.label}
            >
              {topic.label}
            </span>
            <div className="flex-1 bg-surface-200/30 h-1.5 overflow-hidden" style={{ borderRadius: "1px" }}>
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${(topic.chunk_count / maxCount) * 100}%`,
                  background: "linear-gradient(90deg, #5B7DC8, #9C40B0)",
                  borderRadius: "1px",
                }}
              />
            </div>
            <span className="text-[10px] text-gray-700 font-mono w-10 text-right">
              {topic.chunk_count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
