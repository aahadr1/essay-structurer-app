"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "recording" | "processing" | "outline-ready" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [timeLeft, setTimeLeft] = useState(180);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [outline, setOutline] = useState<string>("");
  const [taskUnderstanding, setTaskUnderstanding] = useState<string>("");
  const [introduction, setIntroduction] = useState<string>("");
  const [detailedPlan, setDetailedPlan] = useState<string>("");
  const [conclusion, setConclusion] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [reformattedText, setReformattedText] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: any;
    if (phase === "recording") {
      timer = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            stopRecording();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [phase]);

  const startRecording = async () => {
    setError(null);
    setOutline("");
    setTaskUnderstanding("");
    setIntroduction("");
    setDetailedPlan("");
    setConclusion("");
    setDraft("");
    setReformattedText("");
    setTtsUrl(null);
    setTimeLeft(180);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = handleStopped;
      rec.start(); // collects for up to 3 minutes
      setMediaRecorder(rec);
      setPhase("recording");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Could not access microphone.");
      setPhase("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    setPhase("processing");
  };

  const handleStopped = async () => {
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const form = new FormData();
      form.append("file", blob, "brief.webm");
      // 1) Upload to storage, get public URL
      const upRes = await fetch("/api/upload", { method: "POST", body: form });
      if (!upRes.ok) throw new Error("Upload failed");
      const { publicUrl, signedUrl } = await upRes.json();
      setAudioUrl(publicUrl);

      // 2) Transcribe with Whisper via Replicate
      const trRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: signedUrl || publicUrl }),
      });
      if (!trRes.ok) throw new Error("Transcription failed");
      const { transcript } = await trRes.json();

      // 3) Analyze + Outline (structure only)
      const anRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!anRes.ok) throw new Error("Analysis failed");
      const analysis = await anRes.json();
      const { task_understanding, introduction, detailed_plan, conclusion, draft } = analysis || {};
      setTaskUnderstanding(task_understanding || "");
      setIntroduction(introduction || "");
      setDetailedPlan(detailed_plan || "");
      setConclusion(conclusion || "");
      setDraft(draft || "");
      setOutline([task_understanding, detailed_plan].filter(Boolean).join("\n\n"));

      // 4) Reformat text for TTS using GPT-5
      const textToReformat = draft || [introduction, detailed_plan, conclusion].filter(Boolean).join(" ");
      if (textToReformat && textToReformat.trim().length > 20) {
        const reformatRes = await fetch("/api/reformat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToReformat }),
        });
        if (reformatRes.ok) {
          const { reformattedText } = await reformatRes.json();
          setReformattedText(reformattedText || "");
        } else {
          console.warn("Reformat failed, using original text");
          setReformattedText(textToReformat);
        }
      }

      // 5) TTS playback via Minimax Speech-02 Turbo (only after reformatting)
      const outlineToProse = (input: string) => {
        let s = String(input || "");
        // Strip code fences
        s = s.replace(/```[\s\S]*?```/g, " ");
        // Remove bullet/number/roman markers at line starts
        s = s.replace(/^\s*(?:[-*•·>]+\s*)/gm, "");
        s = s.replace(/^\s*(?:[IVXLCM]+\.|[A-Z]\.|\d+\.)\s*/gm, "");
        // Merge lines into sentences
        s = s.replace(/\r/g, "");
        s = s.replace(/\n{2,}/g, ". ");
        s = s.replace(/\n/g, " ");
        // Collapse spaces
        s = s.replace(/\s+/g, " ").trim();
        if (!/[.!?…]$/.test(s) && s) s += ".";
        return s;
      };
      // Gate TTS strictly on corrected text
      const ttsText = reformattedText;
      if (ttsText && ttsText.trim().length > 10) {
        const ttsRes = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: ttsText }),
        });
        if (ttsRes.ok) {
          const { audioUrl } = await ttsRes.json();
          setTtsUrl(audioUrl);
        }
      }

      setPhase("outline-ready");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Processing error");
      setPhase("error");
    }
  };

  const mmss = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const x = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${x}`;
  };

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-semibold mb-4">Essay Structurer</h1>
      <p className="text-sm text-gray-400 mb-6">
        Parle en <strong>français</strong> pendant 3 minutes de ton sujet, des documents et de la consigne.
        Nous transcrivons mot à mot, comprenons la tâche, et générons un plan détaillé + une intro et une conclusion.
      </p>

      <div className="card mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-gray-400">Countdown</div>
            <div className="text-2xl font-mono">{mmss(timeLeft)}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={startRecording} disabled={phase === "recording"}>
              ▶️ Start explaining
            </button>
            <button className="btn" onClick={stopRecording} disabled={phase !== "recording"}>
              ⏹ Stop now
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-400 mt-2">
          Pendant les 3 minutes, nous enregistrons et transcrivons uniquement.
        </div>
      </div>

      {/* Optional manual file upload */}
      <div className="card mb-6">
        <div className="text-sm text-gray-400 mb-2">Ou téléverse un fichier audio (mp3, wav, webm, m4a, ogg)</div>
        <input
          type="file"
          accept="audio/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setPhase("processing");
            try {
              const form = new FormData();
              form.append("file", f, f.name);
              const upRes = await fetch("/api/upload", { method: "POST", body: form });
              if (!upRes.ok) throw new Error("Upload failed");
              const { publicUrl, signedUrl } = await upRes.json();
              setAudioUrl(publicUrl);
              const trRes = await fetch("/api/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ audioUrl: signedUrl || publicUrl }),
              });
              if (!trRes.ok) throw new Error("Transcription failed");
              const { transcript } = await trRes.json();
              const anRes = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcript }),
              });
              if (!anRes.ok) throw new Error("Analysis failed");
              const analysis = await anRes.json();
              const { task_understanding, introduction, detailed_plan, conclusion, draft } = analysis || {};
              setTaskUnderstanding(task_understanding || "");
              setIntroduction(introduction || "");
              setDetailedPlan(detailed_plan || "");
              setConclusion(conclusion || "");
              setDraft(draft || "");
              setOutline([task_understanding, detailed_plan].filter(Boolean).join("\n\n"));
              
              // Reformat text for TTS
              const textToReformat = draft || [introduction, detailed_plan, conclusion].filter(Boolean).join(" ");
              let finalTtsText = textToReformat;
              
              if (textToReformat && textToReformat.trim().length > 20) {
                const reformatRes = await fetch("/api/reformat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: textToReformat }),
                });
                if (reformatRes.ok) {
                  const { reformattedText } = await reformatRes.json();
                  setReformattedText(reformattedText || "");
                  finalTtsText = reformattedText || textToReformat;
                }
              }
              
              if (finalTtsText && finalTtsText.trim().length > 10) {
                const ttsRes = await fetch("/api/tts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: finalTtsText }),
                });
                if (ttsRes.ok) {
                  const { audioUrl } = await ttsRes.json();
                  setTtsUrl(audioUrl);
                }
              }
              setPhase("outline-ready");
            } catch (e: any) {
              setError(e?.message || "Processing error");
              setPhase("error");
            }
          }}
        />
      </div>

      <div className="card mb-6">
        <div className="text-sm text-gray-400 mb-2">Status</div>
        <ol className="space-y-2 text-sm">
          <li>1) Record brief — {phase === "recording" ? "in progress…" : audioUrl ? "done" : "waiting"}</li>
          <li>2) Transcribe — {phase === "processing" && !outline ? "in progress…" : audioUrl ? "done" : "waiting"}</li>
          <li>3) Analyze & plan — {detailedPlan ? "done" : "waiting"}</li>
          <li>4) Reformat text for TTS — {reformattedText ? "done" : draft ? "in progress…" : "waiting"}</li>
          <li>5) Read aloud (brouillon) — {ttsUrl ? "done" : "waiting"}</li>
        </ol>
      </div>

      {error && (
        <div className="card border border-red-500 text-red-200 mb-6">
          <div className="font-medium">Error</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      {(taskUnderstanding || introduction || detailedPlan || conclusion) && (
        <div className="card mb-4 space-y-4">
          {taskUnderstanding && (
            <div>
              <div className="font-semibold mb-1">Compréhension de la tâche</div>
              <pre className="whitespace-pre-wrap text-sm leading-6">{taskUnderstanding}</pre>
            </div>
          )}
          {introduction && (
            <div>
              <div className="font-semibold mb-1">Introduction (précise)</div>
              <pre className="whitespace-pre-wrap text-sm leading-6">{introduction}</pre>
            </div>
          )}
          {detailedPlan && (
            <div>
              <div className="font-semibold mb-1">Plan détaillé</div>
              <pre className="whitespace-pre-wrap text-sm leading-6">{detailedPlan}</pre>
            </div>
          )}
          {conclusion && (
            <div>
              <div className="font-semibold mb-1">Conclusion</div>
              <pre className="whitespace-pre-wrap text-sm leading-6">{conclusion}</pre>
            </div>
          )}
        </div>
      )}

      {reformattedText && (
        <div className="card mb-4">
          <div className="font-semibold mb-1">Brouillon pour lecture (corrigé)</div>
          <div className="text-sm leading-6 whitespace-pre-wrap">{reformattedText}</div>
        </div>
      )}

      {ttsUrl && (
        <div className="card">
          <div className="font-semibold mb-2">Audio outline</div>
          <audio controls src={ttsUrl} className="w-full" />
        </div>
      )}
    </main>
  );
}
