import { useState, useRef } from "react";
import mammoth from "mammoth";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Download,
  Printer,
  RotateCcw,
  GraduationCap,
  Loader2,
  ArrowRight,
} from "lucide-react";

const LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"];

const LEVEL_GUIDANCE = {
  Beginner:
    "Define every term the first time it appears, in plain everyday language. Use simple analogies. Assume no prior background in the subject.",
  Intermediate:
    "Assume foundational vocabulary is already known. Focus on how the concepts connect to each other and apply to problems.",
  Advanced:
    "Assume strong foundations are in place. Focus on nuance, edge cases, and how the concepts interact.",
  Expert:
    "Assume mastery of the basics. Focus on subtle distinctions, common exam traps, and exceptions to the general rule.",
};

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The model didn't return JSON. Raw reply: " + text.slice(0, 200));
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function callClaude(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Request failed (${response.status})`);
  }
  if (data?.error) {
    throw new Error(data.error.message || "The API returned an error.");
  }
  const textBlocks = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (!textBlocks.trim()) {
    throw new Error("Got an empty response back.");
  }
  return extractJson(textBlocks);
}

function NodeMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <line x1="9" y1="11" x2="20" y2="29" stroke="#2F6F62" strokeWidth="1.4" />
      <line x1="31" y1="11" x2="20" y2="29" stroke="#2F6F62" strokeWidth="1.4" />
      <line x1="9" y1="11" x2="31" y2="11" stroke="#1B2A4A" strokeWidth="1.4" strokeOpacity="0.35" />
      <circle cx="9" cy="11" r="4" fill="#1B2A4A" />
      <circle cx="31" cy="11" r="4" fill="#1B2A4A" />
      <circle cx="20" cy="29" r="5.5" fill="#2F6F62" />
    </svg>
  );
}

function NodeStep({ label, active, done }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={
          "h-3 w-3 rounded-full transition-colors " +
          (done ? "bg-[#2F6F62]" : active ? "bg-[#1B2A4A] ring-4 ring-[#1B2A4A]/15" : "bg-[#D9CBAA]")
        }
      />
      <span className={"text-xs " + (active || done ? "text-[#1B2A4A]" : "text-[#A89C7E]")}>{label}</span>
    </div>
  );
}

export default function TheNodeNetwork() {
  const [stage, setStage] = useState("setup"); // setup | notes | quiz | results
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("Intermediate");
  const [sourceText, setSourceText] = useState("");
  const [fileName, setFileName] = useState("");

  const [notes, setNotes] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(null);
  const [weakTopics, setWeakTopics] = useState([]);
  const [remediation, setRemediation] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    const ext = file.name.split(".").pop().toLowerCase();
    try {
      if (ext === "txt" || ext === "md") {
        const text = await file.text();
        setSourceText(text);
      } else if (ext === "docx") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setSourceText(result.value);
      } else if (ext === "pdf") {
        setError(
          "PDF upload isn't supported in this build yet — open the PDF, copy the text, and paste it into the box below instead."
        );
        setFileName("");
      } else {
        setError("Unsupported file type. Use .txt, .md, or .docx, or paste your text directly.");
        setFileName("");
      }
    } catch (err) {
      setError("Couldn't read that file. Try pasting the text directly instead.");
      setFileName("");
    }
  }

  async function generateNotesAndQuiz() {
    if (!sourceText.trim() || sourceText.trim().length < 40) {
      setError("Add a bit more material first — at least a few sentences of lecture or reading content.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      setLoadingLabel("Reading through your material and drafting notes\u2026");
      const notesPrompt = `You are creating concise revision notes for a student.
Subject: ${subject || "unspecified \u2014 infer it from the material"}
Student's self-rated level: ${level}. ${LEVEL_GUIDANCE[level]}

Source material:
"""
${sourceText.slice(0, 6000)}
"""

Return ONLY a JSON object, no markdown fences, no preamble, matching this exact schema:
{"sections":[{"heading":"string","points":["string"]}]}

Rules:
- 3 to 4 sections, each covering one distinct part of the material.
- 3 to 4 short bullet points per section, each a single, complete sentence under 20 words.
- Base everything only on the source material; do not invent facts it doesn't support.
- Match vocabulary and depth to the stated level.
- Keep the entire response under 450 words so it stays inside the output limit.`;
      const notesData = await callClaude(notesPrompt);
      setNotes(notesData.sections || []);

      setLoadingLabel("Writing a 5-question quiz from the same material\u2026");
      const quizPrompt = `Create a 5-question multiple-choice quiz testing the material below, for a ${level} student in ${
        subject || "this subject"
      }. ${LEVEL_GUIDANCE[level]}

Source material:
"""
${sourceText.slice(0, 6000)}
"""

Return ONLY a JSON object, no markdown fences, no preamble, matching this exact schema:
{"questions":[{"id":"q1","topic":"string","question":"string","options":["string","string","string","string"],"correctIndex":0,"explanation":"string"}]}

Rules:
- Exactly 5 questions, ids q1 through q5.
- Exactly 4 options each, only one correct, correctIndex is 0-based.
- "topic" is a short 2-4 word label; reuse the same topic label across questions that test the same concept.
- "explanation" is one short sentence under 20 words on why the correct option is right.
- Difficulty and phrasing should match the stated level.
- Keep the entire response under 550 words so it stays inside the output limit.`;
      const quizData = await callClaude(quizPrompt);
      setQuiz(quizData.questions || []);

      setStage("notes");
    } catch (err) {
      console.error(err);
      setError("Couldn't generate notes and quiz: " + (err?.message || "unknown error") + ". Try again, or shorten the source material.");
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  function selectAnswer(qid, idx) {
    setAnswers((prev) => ({ ...prev, [qid]: idx }));
  }

  function submitQuiz() {
    if (!quiz) return;
    let correct = 0;
    const weak = new Set();
    const missed = [];
    quiz.forEach((q) => {
      const chosen = answers[q.id];
      if (chosen === q.correctIndex) {
        correct += 1;
      } else {
        weak.add(q.topic);
        missed.push(q);
      }
    });
    setScore({ correct, total: quiz.length });
    setWeakTopics([...weak]);
    setStage("results");
    if (missed.length > 0) {
      fetchRemediation(missed);
    }
  }

  async function fetchRemediation(missedQuestions) {
    setLoading(true);
    setLoadingLabel("Working out where the gaps are and building a fix\u2026");
    setError("");
    try {
      const detail = missedQuestions
        .slice(0, 3)
        .map(
          (q) =>
            `Topic: ${q.topic}\nQuestion: ${q.question}\nCorrect answer: ${
              q.options[q.correctIndex]
            }\nStudent's answer: ${
              answers[q.id] !== undefined ? q.options[answers[q.id]] : "(no answer)"
            }`
        )
        .join("\n\n");

      const prompt = `A student at ${level} level in ${
        subject || "this subject"
      } got these questions wrong:

${detail}

For EACH topic above, write a short remediation entry that removes any remaining doubt. Return ONLY a JSON object, no markdown fences, no preamble, matching:
{"remediation":[{"topic":"string","explanation":"string","workedExample":"string","tip":"string"}]}

Rules:
- "explanation": 2-3 plain sentences on the underlying concept.
- "workedExample": a complete, step-by-step solution to the specific missed question, ending in the final answer stated plainly.
- "tip": one sentence naming the common mistake or a memory aid.
- Match the explanation depth to a ${level} student.
- Keep the whole response under 500 words.`;
      const data = await callClaude(prompt);
      setRemediation(data.remediation || []);
    } catch (err) {
      console.error(err);
      setError(
        "Notes and quiz are graded below, but the targeted help couldn't be generated (" +
          (err?.message || "unknown error") +
          "). Try again in a moment."
      );
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  function reset() {
    setStage("setup");
    setSubject("");
    setSourceText("");
    setFileName("");
    setNotes(null);
    setQuiz(null);
    setAnswers({});
    setScore(null);
    setWeakTopics([]);
    setRemediation(null);
    setError("");
  }

  function exportSession() {
    let md = `# The Node Network \u2014 ${subject || "Study session"}\n\n`;
    md += `Level: ${level}\nDate: ${new Date().toLocaleDateString()}\n\n`;
    md += `## Revision notes\n\n`;
    (notes || []).forEach((s) => {
      md += `### ${s.heading}\n`;
      s.points.forEach((p) => (md += `- ${p}\n`));
      md += `\n`;
    });
    md += `## Quiz results\n\n`;
    if (score) md += `Score: ${score.correct} / ${score.total}\n\n`;
    (quiz || []).forEach((q, i) => {
      const chosen = answers[q.id];
      const wasCorrect = chosen === q.correctIndex;
      md += `**${i + 1}. ${q.question}** (${q.topic})\n`;
      md += `Your answer: ${chosen !== undefined ? q.options?.[chosen] : "(none)"} ${
        wasCorrect ? "\u2713" : "\u2717"
      }\n`;
      if (!wasCorrect) md += `Correct answer: ${q.options?.[q.correctIndex]}\n`;
      md += `Why: ${q.explanation}\n\n`;
    });
    if (remediation && remediation.length > 0) {
      md += `## Targeted help for weak spots\n\n`;
      remediation.forEach((r) => {
        md += `### ${r.topic}\n${r.explanation}\n\n**Worked example:** ${r.workedExample}\n\n**Tip:** ${r.tip}\n\n`;
      });
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(subject || "study-session").replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allAnswered = quiz && quiz.every((q) => answers[q.id] !== undefined);

  return (
    <div className="min-h-screen bg-[#EFE7D6] text-[#1B2A4A]">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between border-b border-[#E4D9C0] pb-6">
          <div className="flex items-center gap-3.5">
            <NodeMark />
            <div>
              <h1 className="font-serif text-2xl tracking-tight">The Node Network</h1>
              <p className="text-sm text-[#7A6F58]">
                Connect your material into notes, a quiz, and a plan to close the gaps.
              </p>
            </div>
          </div>
          {stage !== "setup" && (
            <button
              onClick={reset}
              className="no-print flex items-center gap-1.5 rounded border border-[#E4D9C0] px-3 py-1.5 text-sm text-[#7A6F58] hover:border-[#1B2A4A] hover:text-[#1B2A4A]"
            >
              <RotateCcw size={14} /> Start over
            </button>
          )}
        </div>

        {stage !== "setup" && (
          <div className="no-print mb-10 flex items-center">
            <NodeStep label="Notes" active={stage === "notes"} done={stage === "quiz" || stage === "results"} />
            <div
              className={
                "mx-3 h-px flex-1 transition-colors " +
                (stage === "quiz" || stage === "results" ? "bg-[#2F6F62]" : "bg-[#E4D9C0]")
              }
            />
            <NodeStep label="Quiz" active={stage === "quiz"} done={stage === "results"} />
            <div
              className={
                "mx-3 h-px flex-1 transition-colors " + (stage === "results" ? "bg-[#2F6F62]" : "bg-[#E4D9C0]")
              }
            />
            <NodeStep label="Results" active={stage === "results"} done={false} />
          </div>
        )}

        {error && (
          <div className="mb-6 rounded border border-[#E3B7A0] bg-[#FBEFE9] px-4 py-3 text-sm text-[#8A3B1F]">
            {error}
          </div>
        )}

        {/* SETUP STAGE */}
        {stage === "setup" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-[#7A6F58]">Subject (optional)</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Organic Chemistry, US History"
                  className="w-full rounded border border-[#E4D9C0] bg-white px-3 py-2 text-sm outline-none focus:border-[#1B2A4A]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#7A6F58]">Where are you with this subject?</label>
                <div className="flex overflow-hidden rounded border border-[#E4D9C0]">
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      className={
                        "flex-1 px-2 py-2 text-sm transition-colors " +
                        (level === l
                          ? "bg-[#1B2A4A] text-white"
                          : "bg-white text-[#7A6F58] hover:bg-[#E4D9C0]")
                      }
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm text-[#7A6F58]">Lecture notes, reading, or assignment text</label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-sm text-[#2F6F62] hover:underline"
                >
                  <Upload size={14} /> Upload .txt or .docx
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.docx,.pdf"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
              {fileName && (
                <div className="mb-2 flex items-center gap-1.5 text-xs text-[#7A6F58]">
                  <FileText size={12} /> {fileName}
                </div>
              )}
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste the content here \u2014 lecture text, chapter notes, an assignment sheet, anything to work from."
                rows={10}
                className="w-full rounded border border-[#E4D9C0] bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-[#1B2A4A]"
              />
            </div>

            <button
              onClick={generateNotesAndQuiz}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded bg-[#2F6F62] px-4 py-3 text-sm font-medium text-white hover:bg-[#265A50] disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> {loadingLabel}
                </>
              ) : (
                <>
                  Generate notes and quiz <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        )}

        {/* NOTES STAGE */}
        {stage === "notes" && notes && (
          <div className="space-y-8">
            <div className="space-y-6">
              {notes.map((s, i) => (
                <div key={i} className="border-b border-[#E4D9C0] pb-5 last:border-0">
                  <h3 className="mb-2 font-serif text-lg">{s.heading}</h3>
                  <ul className="space-y-1.5">
                    {(s.points || []).map((p, j) => (
                      <li key={j} className="flex gap-2 text-sm leading-relaxed text-[#3A3A38]">
                        <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-[#2F6F62]" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button
              onClick={() => setStage("quiz")}
              className="no-print flex w-full items-center justify-center gap-2 rounded bg-[#1B2A4A] px-4 py-3 text-sm font-medium text-white hover:bg-[#142039]"
            >
              Continue to quiz <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* QUIZ STAGE */}
        {stage === "quiz" && quiz && (
          <div className="space-y-8">
            {quiz.map((q, i) => (
              <div key={q.id} className="border-b border-[#E4D9C0] pb-6 last:border-0">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs text-[#A89C7E]">
                  <span className="h-1 w-1 rounded-full bg-[#2F6F62]" /> {q.topic}
                </div>
                <p className="mb-3 text-sm font-medium leading-relaxed">
                  {i + 1}. {q.question}
                </p>
                <div className="space-y-2">
                  {(q.options || []).map((opt, idx) => (
                    <label
                      key={idx}
                      className={
                        "flex cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm transition-colors " +
                        (answers[q.id] === idx
                          ? "border-l-4 border-[#2F6F62] bg-[#E7F0EC]"
                          : "border-[#E4D9C0] hover:bg-[#F7F1E2]")
                      }
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === idx}
                        onChange={() => selectAnswer(q.id, idx)}
                        className="accent-[#2F6F62]"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={submitQuiz}
              disabled={!allAnswered}
              className="no-print flex w-full items-center justify-center gap-2 rounded bg-[#2F6F62] px-4 py-3 text-sm font-medium text-white hover:bg-[#265A50] disabled:opacity-40"
            >
              Submit and grade
            </button>
            {!allAnswered && (
              <p className="text-center text-xs text-[#A89C7E]">Answer all {quiz.length} questions to submit.</p>
            )}
          </div>
        )}

        {/* RESULTS STAGE */}
        {stage === "results" && quiz && score && (
          <div className="space-y-8">
            <div className="rounded border border-[#E4D9C0] bg-white px-5 py-4 text-center">
              <div className="font-serif text-3xl">
                {score.correct} / {score.total}
              </div>
              <p className="text-sm text-[#7A6F58]">
                {score.correct === score.total
                  ? "Clean sweep \u2014 nothing to remediate here."
                  : `Weak spot${weakTopics.length > 1 ? "s" : ""}: ${weakTopics.join(", ")}`}
              </p>
            </div>

            <div className="space-y-5">
              {quiz.map((q, i) => {
                const chosen = answers[q.id];
                const wasCorrect = chosen === q.correctIndex;
                return (
                  <div key={q.id} className="border-b border-[#E4D9C0] pb-5 last:border-0">
                    <div className="mb-1 flex items-center gap-2">
                      {wasCorrect ? (
                        <CheckCircle2 size={16} className="text-[#2F6F62]" />
                      ) : (
                        <XCircle size={16} className="text-[#B3432B]" />
                      )}
                      <p className="text-sm font-medium">
                        {i + 1}. {q.question}
                      </p>
                    </div>
                    <p className="ml-6 text-sm text-[#3A3A38]">
                      Your answer: {q.options?.[chosen]}
                      {!wasCorrect && (
                        <>
                          {" "}
                          &mdash; correct answer: <span className="font-medium">{q.options?.[q.correctIndex]}</span>
                        </>
                      )}
                    </p>
                    <p className="ml-6 text-sm text-[#7A6F58]">{q.explanation}</p>
                  </div>
                );
              })}
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-[#7A6F58]">
                <Loader2 size={16} className="animate-spin" /> {loadingLabel}
              </div>
            )}

            {remediation && remediation.length > 0 && (
              <div className="space-y-5">
                <h3 className="flex items-center gap-2 font-serif text-lg">
                  <GraduationCap size={18} className="text-[#C97A2B]" /> Closing the gaps
                </h3>
                {remediation.map((r, i) => (
                  <div key={i} className="rounded border border-[#E9D9BF] bg-[#FBF6EC] px-4 py-4">
                    <h4 className="mb-1 text-sm font-semibold">{r.topic}</h4>
                    <p className="mb-2 text-sm text-[#3A3A38]">{r.explanation}</p>
                    <p className="mb-2 text-sm text-[#3A3A38]">
                      <span className="font-medium">Worked example: </span>
                      {r.workedExample}
                    </p>
                    <p className="text-sm text-[#8A5A1F]">
                      <span className="font-medium">Watch for: </span>
                      {r.tip}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="no-print flex gap-3">
              <button
                onClick={exportSession}
                className="flex flex-1 items-center justify-center gap-2 rounded border border-[#E4D9C0] px-4 py-2.5 text-sm hover:border-[#1B2A4A]"
              >
                <Download size={14} /> Export as Markdown
              </button>
              <button
                onClick={() => window.print()}
                className="flex flex-1 items-center justify-center gap-2 rounded border border-[#E4D9C0] px-4 py-2.5 text-sm hover:border-[#1B2A4A]"
              >
                <Printer size={14} /> Print / Save as PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
