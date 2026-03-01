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

  const handleGuess = (speaker: string) => {
    if (state !== "playing" || !quiz) return;
    setGuess(speaker);
    setState("revealed");

    const isCorrect = speaker === quiz.speaker;
    setScore((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));
    setStreak((prev) => (isCorrect ? prev + 1 : 0));
  };

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
            <div className="text-[10px] text-gray-600 uppercase tracking-[0.2em]">Score</div>
          </div>
          {streak > 1 && (
            <div className="text-center">
              <div className="text-2xl font-display font-bold text-orange-400 tabular-nums">
                {streak}x
              </div>
              <div className="text-[10px] text-gray-600 uppercase tracking-[0.2em]">Streak</div>
            </div>
          )}
        </div>
        {score.total > 0 && (
          <div className="text-xs text-gray-600 font-mono">
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
          minHeight: "200px",
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
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
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
              <blockquote className="text-gray-200 text-lg leading-relaxed mb-6 font-light">
                <span className="text-accent/60 text-2xl font-display leading-none">&ldquo;</span>
                <span className="quiz-quote-text">{quiz.quote}</span>
                <span className="text-accent/60 text-2xl font-display leading-none">&rdquo;</span>
              </blockquote>

              {/* Guess buttons */}
              {state === "playing" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleGuess("Speaker A")}
                    className="flex-1 py-4 text-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: "#1A1A1A",
                      border: "1px solid #2A2A2A",
                      borderRadius: "2px",
                    }}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2"
                      style={{ background: "#5B7DC8" }}
                    />
                    <span className="text-sm font-medium text-gray-300">Felix</span>
                  </button>
                  <button
                    onClick={() => handleGuess("Speaker B")}
                    className="flex-1 py-4 text-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: "#1A1A1A",
                      border: "1px solid #2A2A2A",
                      borderRadius: "2px",
                    }}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2"
                      style={{ background: "#9C40B0" }}
                    />
                    <span className="text-sm font-medium text-gray-300">Tommi</span>
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
                    <span className="text-2xl">{isCorrect ? "+" : "x"}</span>
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
                    className="w-full py-3 text-sm font-medium tracking-wide uppercase transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      background: "#F5C000",
                      color: "#0A0A0A",
                      borderRadius: "2px",
                    }}
                  >
                    Nächstes Zitat
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
