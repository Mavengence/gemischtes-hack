import { useCallback, useRef, useState } from "react";
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
  const touchStartX = useRef(0);

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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      try { navigator?.vibrate?.(20); } catch {}
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Counter */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-xs text-gray-500 uppercase tracking-[0.15em]">
          Gast {currentIndex + 1} von {fehlkaufe.length}
        </span>
        <span className="text-xs text-gray-400 italic">
          {flipped ? "Nochmal klicken zum Zurückdrehen" : "Klick zum Umdrehen"}
        </span>
      </div>

      {/* Card */}
      <div
        className="relative cursor-pointer select-none"
        style={{ perspective: "1000px", minHeight: "340px" }}
        onClick={() => setFlipped((prev) => !prev)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="button"
        aria-label={flipped ? "Antwort verbergen" : "Antwort zeigen"}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((prev) => !prev);
          }
          if (e.key === "ArrowRight") goNext();
          if (e.key === "ArrowLeft") goPrev();
        }}
      >
        <div
          className="relative w-full"
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
              minHeight: "340px",
            }}
          >
            <div className="flex flex-col h-full justify-between" style={{ minHeight: "280px" }}>
              <div>
                <div className="text-[11px] text-accent/70 uppercase tracking-[0.25em] mb-6">
                  5 Schnelle Fragen an
                </div>
                <h3 className="font-display text-3xl md:text-4xl font-bold text-white mb-3">
                  {current.guest}
                </h3>
                <p className="text-xs text-gray-500">{formatDate(current.pub_date)}</p>
              </div>

              <div className="mt-8">
                <p className="font-display text-xl md:text-2xl font-semibold text-accent leading-snug">
                  &ldquo;Was war dein letzter Fehlkauf?&rdquo;
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Tippe zum Umdrehen
                </div>
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
              minHeight: "340px",
            }}
          >
            <div className="flex flex-col h-full justify-between" style={{ minHeight: "280px" }}>
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-[11px] text-gray-400 uppercase tracking-[0.2em]">
                    {current.guest}
                  </span>
                  <span className="text-[11px] text-gray-600">|</span>
                  <span className="text-[11px] text-accent/60 uppercase tracking-[0.15em]">Fehlkauf</span>
                </div>

                <blockquote
                  className="text-gray-200 text-base md:text-lg leading-relaxed font-light mb-6"
                  style={{ borderLeft: "2px solid #F5C000", paddingLeft: "1rem" }}
                >
                  &ldquo;{current.fehlkauf_context}&rdquo;
                </blockquote>

                <p className="text-sm text-gray-400 leading-relaxed">{current.fehlkauf_answer}</p>
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
          className="flex items-center gap-2 py-2.5 px-4 text-sm text-gray-400 hover:text-white transition-all duration-200 bg-surface-100 hover:bg-surface-200"
          style={{ border: "1px solid #2A2A2A", borderRadius: "2px" }}
          aria-label="Vorheriger Gast"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Zurück
        </button>

        {/* Dots */}
        <div className="flex items-center gap-2">
          {fehlkaufe.map((f, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                setFlipped(false);
                setCurrentIndex(i);
              }}
              className="w-2 h-2 transition-all duration-300"
              style={{
                background: i === currentIndex ? "#F5C000" : "#2A2A2A",
                borderRadius: "1px",
                transform: i === currentIndex ? "scale(1.3)" : "scale(1)",
              }}
              aria-label={`Gast ${i + 1}: ${f.guest}`}
            />
          ))}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="flex items-center gap-2 py-2.5 px-4 text-sm text-gray-400 hover:text-white transition-all duration-200 bg-surface-100 hover:bg-surface-200"
          style={{ border: "1px solid #2A2A2A", borderRadius: "2px" }}
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
