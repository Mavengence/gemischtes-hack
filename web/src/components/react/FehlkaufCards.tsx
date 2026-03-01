import { useCallback, useState } from "react";
import fehlkaufeData from "@/data/fehlkaufe.json";

type Fehlkauf = {
  guest: string;
  glt_id: string;
  pub_date: string;
  fehlkauf_answer: string;
  fehlkauf_context: string;
};

const fehlkaufe: Fehlkauf[] = fehlkaufeData;

export default function FehlkaufCards() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);

  const current = fehlkaufe[currentIndex];

  const goNext = useCallback(() => {
    setDirection("left");
    setFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % fehlkaufe.length);
      setDirection(null);
    }, 250);
  }, []);

  const goPrev = useCallback(() => {
    setDirection("right");
    setFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + fehlkaufe.length) % fehlkaufe.length);
      setDirection(null);
    }, 250);
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Counter */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-[10px] text-gray-600 uppercase tracking-[0.2em]">
          Gast {currentIndex + 1} von {fehlkaufe.length}
        </span>
        <span className="text-[10px] text-gray-600">Klick zum Umdrehen</span>
      </div>

      {/* Card */}
      <div
        className="relative cursor-pointer select-none"
        style={{ perspective: "1000px", minHeight: "320px" }}
        onClick={() => setFlipped((prev) => !prev)}
        role="button"
        aria-label={flipped ? "Antwort verbergen" : "Antwort zeigen"}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setFlipped((prev) => !prev);
          if (e.key === "ArrowRight") goNext();
          if (e.key === "ArrowLeft") goPrev();
        }}
      >
        <div
          className="relative w-full transition-all duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0)",
            opacity: direction ? 0.3 : 1,
            transition: direction
              ? "opacity 200ms ease, transform 500ms ease"
              : "transform 500ms ease, opacity 200ms ease",
          }}
        >
          {/* Front — Question */}
          <div
            className="w-full p-8 md:p-10"
            style={{
              backfaceVisibility: "hidden",
              background: "#161616",
              border: "1px solid #2A2A2A",
              borderRadius: "2px",
              minHeight: "320px",
            }}
          >
            <div className="flex flex-col h-full justify-between" style={{ minHeight: "260px" }}>
              <div>
                <div className="text-[10px] text-accent/60 uppercase tracking-[0.25em] mb-6">
                  5 Schnelle Fragen an
                </div>
                <h3 className="font-display text-3xl md:text-4xl font-bold text-white mb-3">
                  {current.guest}
                </h3>
                <p className="text-xs text-gray-600">{formatDate(current.pub_date)}</p>
              </div>

              <div className="mt-8">
                <p className="font-display text-xl md:text-2xl font-semibold text-accent">
                  Was war dein letzter Fehlkauf?
                </p>
              </div>
            </div>
          </div>

          {/* Back — Answer */}
          <div
            className="w-full absolute top-0 left-0 p-8 md:p-10"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              background: "#161616",
              border: "1px solid #2A2A2A",
              borderRadius: "2px",
              minHeight: "320px",
            }}
          >
            <div className="flex flex-col h-full justify-between" style={{ minHeight: "260px" }}>
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-[10px] text-gray-600 uppercase tracking-[0.2em]">
                    {current.guest}
                  </span>
                  <span className="text-[10px] text-gray-700">|</span>
                  <span className="text-[10px] text-gray-700">Fehlkauf</span>
                </div>

                <blockquote
                  className="text-gray-200 text-base md:text-lg leading-relaxed font-light mb-6"
                  style={{ borderLeft: "2px solid #F5C000", paddingLeft: "1rem" }}
                >
                  &ldquo;{current.fehlkauf_context}&rdquo;
                </blockquote>

                <p className="text-sm text-gray-500 leading-relaxed">{current.fehlkauf_answer}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="flex items-center gap-2 py-2 px-4 text-sm text-gray-500 hover:text-white transition-colors"
          style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: "2px" }}
          aria-label="Vorheriger Gast"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Zurück
        </button>

        {/* Dots */}
        <div className="flex items-center gap-1.5">
          {fehlkaufe.map((_, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                setFlipped(false);
                setCurrentIndex(i);
              }}
              className="w-2 h-2 transition-all duration-200"
              style={{
                background: i === currentIndex ? "#F5C000" : "#2A2A2A",
                borderRadius: "1px",
              }}
              aria-label={`Gast ${i + 1}: ${fehlkaufe[i].guest}`}
            />
          ))}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="flex items-center gap-2 py-2 px-4 text-sm text-gray-500 hover:text-white transition-colors"
          style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: "2px" }}
          aria-label="Nächster Gast"
        >
          Weiter
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
