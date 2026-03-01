import { useCallback, useEffect, useState } from "react";

type QuizData = {
  quote: string;
  speaker: string;
  episode: {
    title: string;
    episode_number: number | null;
    pub_date: string;
  } | null;
};

type GameState = "loading" | "playing" | "revealed" | "error";

export default function WerHatsSagt() {
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [state, setState] = useState<GameState>("loading");
  const [guess, setGuess] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const fetchQuiz = useCallback(async () => {
    setState("loading");
    setGuess(null);
    try {
      const res = await fetch("/api/quiz");
      if (!res.ok) throw new Error(`${res.status}`);
      const data: QuizData = await res.json();
      setQuiz(data);
      setState("playing");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  const handleGuess = useCallback((speaker: string) => {
    if (state !== "playing" || !quiz) return;
    setGuess(speaker);
    setState("revealed");

    const isCorrect = speaker === quiz.speaker;
    setScore((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));
    const newStreak = isCorrect ? streak + 1 : 0;
    setStreak(newStreak);
    if (newStreak > bestStreak) setBestStreak(newStreak);
  }, [state, quiz, streak, bestStreak]);

  // Keyboard shortcuts: 1/F = Felix, 2/T = Tommi
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state === "playing") {
        if (e.key === "1" || e.key.toLowerCase() === "f") handleGuess("Speaker A");
        if (e.key === "2" || e.key.toLowerCase() === "t") handleGuess("Speaker B");
      }
      if (state === "revealed" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        fetchQuiz();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, handleGuess, fetchQuiz]);

  const isCorrect = guess === quiz?.speaker;
  const speakerName = quiz?.speaker === "Speaker A" ? "Felix" : "Tommi";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Score bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-2xl font-display font-bold text-accent tabular-nums">
              {score.correct}/{score.total}
            </div>
            <div className="text-[11px] text-gray-500 uppercase tracking-[0.2em]">Score</div>
          </div>
          {streak > 1 && (
            <div className="text-center">
              <div className="text-2xl font-display font-bold text-orange-400 tabular-nums">
                {streak}x
              </div>
              <div className="text-[11px] text-gray-500 uppercase tracking-[0.2em]">Streak</div>
            </div>
          )}
          {bestStreak > 2 && streak <= 1 && (
            <div className="text-center">
              <div className="text-lg font-display font-bold text-gray-600 tabular-nums">
                {bestStreak}x
              </div>
              <div className="text-[11px] text-gray-600 uppercase tracking-[0.2em]">Best</div>
            </div>
          )}
        </div>
        {score.total > 0 && (
          <div className="text-xs text-gray-500 font-mono">
            {Math.round((score.correct / score.total) * 100)}% richtig
          </div>
        )}
      </div>

      {/* Quote card */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "#161616",
          border: "1px solid #2A2A2A",
          borderRadius: "2px",
          minHeight: "220px",
        }}
      >
        {/* Accent bar on reveal */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-500"
          style={{
            background:
              state === "revealed"
                ? quiz?.speaker === "Speaker A"
                  ? "#5B7DC8"
                  : "#9C40B0"
                : "transparent",
          }}
        />

        <div className="p-8">
          {state === "loading" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="h-5 bg-surface-200 animate-pulse rounded-sm w-full" />
                <div className="h-5 bg-surface-200 animate-pulse rounded-sm w-4/5" />
                <div className="h-5 bg-surface-200 animate-pulse rounded-sm w-3/5" />
              </div>
              <div className="h-3 bg-surface-200 animate-pulse rounded-sm w-1/4 mt-6" />
              <div className="flex gap-3 mt-4">
                <div className="flex-1 h-12 bg-surface-200 animate-pulse rounded-sm" />
                <div className="flex-1 h-12 bg-surface-200 animate-pulse rounded-sm" />
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm mb-4">Konnte kein Zitat laden.</p>
              <button onClick={fetchQuiz} className="btn-primary text-xs">
                Nochmal
              </button>
            </div>
          )}

          {(state === "playing" || state === "revealed") && quiz && (
            <>
              {/* The quote */}
              <blockquote className="text-gray-200 text-lg leading-relaxed mb-8 font-light">
                <span className="text-accent/60 text-2xl font-display leading-none">&ldquo;</span>
                <span>{quiz.quote}</span>
                <span className="text-accent/60 text-2xl font-display leading-none">&rdquo;</span>
              </blockquote>

              {/* Guess buttons */}
              {state === "playing" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleGuess("Speaker A")}
                    className="flex-1 py-4 text-center transition-all duration-200 hover:border-felix/40 active:scale-[0.98] group"
                    style={{
                      background: "#1A1A1A",
                      border: "1px solid #2A2A2A",
                      borderRadius: "2px",
                    }}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-2.5 transition-transform group-hover:scale-125"
                      style={{ background: "#5B7DC8" }}
                    />
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                      Felix
                    </span>
                    <span className="text-[10px] text-gray-600 ml-2 hidden md:inline">[1]</span>
                  </button>
                  <button
                    onClick={() => handleGuess("Speaker B")}
                    className="flex-1 py-4 text-center transition-all duration-200 hover:border-tommi/40 active:scale-[0.98] group"
                    style={{
                      background: "#1A1A1A",
                      border: "1px solid #2A2A2A",
                      borderRadius: "2px",
                    }}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-2.5 transition-transform group-hover:scale-125"
                      style={{ background: "#9C40B0" }}
                    />
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                      Tommi
                    </span>
                    <span className="text-[10px] text-gray-600 ml-2 hidden md:inline">[2]</span>
                  </button>
                </div>
              )}

              {/* Result */}
              {state === "revealed" && (
                <div className="space-y-4">
                  <div
                    className="flex items-center gap-3 p-4 transition-all duration-300"
                    style={{
                      background: isCorrect ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                      border: `1px solid ${isCorrect ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                      borderRadius: "2px",
                    }}
                  >
                    <span
                      className="text-xl font-display font-bold"
                      style={{ color: isCorrect ? "#22c55e" : "#ef4444" }}
                    >
                      {isCorrect ? "✓" : "✗"}
                    </span>
                    <div>
                      <p
                        className="font-medium text-sm"
                        style={{ color: isCorrect ? "#22c55e" : "#ef4444" }}
                      >
                        {isCorrect ? "Richtig!" : "Falsch!"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Das war{" "}
                        <span
                          className="font-medium"
                          style={{
                            color: quiz.speaker === "Speaker A" ? "#5B7DC8" : "#9C40B0",
                          }}
                        >
                          {speakerName}
                        </span>
                        {quiz.episode && (
                          <>
                            {" "}
                            in{" "}
                            <span className="text-gray-400">
                              {quiz.episode.episode_number
                                ? `#${quiz.episode.episode_number}`
                                : quiz.episode.title}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={fetchQuiz}
                    className="w-full py-3.5 text-sm font-bold tracking-[0.1em] uppercase transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
                    style={{
                      background: "#F5C000",
                      color: "#0A0A0A",
                      borderRadius: "2px",
                    }}
                  >
                    Nächstes Zitat
                    <span className="text-[10px] ml-2 opacity-60 hidden md:inline">[Enter]</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
