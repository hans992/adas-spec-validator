"use client";

import { useMemo, useState } from "react";
import { Brain, Terminal, Activity, ArrowRight, CornerDownRight } from "lucide-react";
import type { NormalizedModel, ValidationResult } from "@/domain/types";
import type { AdasRole } from "@/ai/types";
import ReactMarkdown from "react-markdown";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:border-indigo-400";

const roleOptions: AdasRole[] = ["Design Engineer", "Stockroom Personnel", "Project Manager"];

const exampleQuestions = [
  "Does the stockroom meet the current requirements?",
  "What are the highest-risk issues?",
  "What cannot be determined from the current model?"
];

interface AdasChatPanelProps {
  normalizedModel: NormalizedModel;
  validationResults: ValidationResult[];
  onSelectElement?: (id: string, type: "room" | "door") => void;
}

export function AdasChatPanel({
  normalizedModel,
  validationResults,
  onSelectElement
}: AdasChatPanelProps) {
  const [selectedRole, setSelectedRole] = useState<AdasRole>("Design Engineer");
  const [question, setQuestion] = useState<string>(exampleQuestions[0]);
  const [answer, setAnswer] = useState<string>("");
  const [mode, setMode] = useState<"fallback" | "ai" | "none">("none");
  const [provider, setProvider] = useState<"gemini" | "openai" | "deterministic" | "none">("none");
  const [model, setModel] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const disabled = useMemo(() => question.trim().length === 0 || isSubmitting, [question, isSubmitting]);

  async function submitQuestion() {
    if (question.trim().length === 0) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userQuestion: question,
          selectedRole,
          normalizedModel,
          validationResults
        })
      });

      if (!response.ok) {
        setError("Chat request failed. Please verify payload and try again.");
        setIsSubmitting(false);
        return;
      }

      const data = (await response.json()) as {
        answer: string;
        metadata: {
          mode: "fallback" | "ai";
          provider: "gemini" | "openai" | "deterministic";
          model?: string;
        };
      };

      setAnswer(data.answer);
      setMode(data.metadata.mode);
      setProvider(data.metadata.provider);
      setModel(data.metadata.model ?? "");
    } catch {
      setError("Chat request failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 shadow-2xl relative">
      {/* Absolute ambient glow */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      <CardHeader className="pb-3 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono tracking-widest text-indigo-400 uppercase flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5" />
            ADAS AI COGNITIVE CORE
          </p>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
            <Activity className="h-3 w-3 animate-pulse" />
            AI-STATUS: ONLINE
          </div>
        </div>
        <CardTitle className="mt-2 flex items-center gap-2 text-lg font-bold text-slate-50">
          <Brain className="h-4 w-4 text-indigo-400" />
          Evidence-Constrained Agent
        </CardTitle>
        <p className="text-xs text-slate-400">
          The chatbot is strictly bounded to the generated deterministic rule outcomes. No hallucinated rules.
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4 pt-4">
        {/* Role Selection Console */}
        <div className="rounded-lg border border-slate-900 bg-slate-900/40 p-2.5">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">Agent Persona</p>
          <div className="grid grid-cols-3 gap-1.5">
            {roleOptions.map((role) => {
              const isActive = selectedRole === role;
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`h-8 rounded text-xs font-mono transition-all ${
                    isActive
                      ? "border border-indigo-500 bg-indigo-950/60 font-semibold text-indigo-300 shadow-lg shadow-indigo-950/50"
                      : "border border-slate-900 bg-slate-950 text-slate-400 hover:border-slate-800 hover:text-slate-200"
                  }`}
                >
                  {role.split(" ")[0]} {/* Shorten name for space */}
                </button>
              );
            })}
          </div>
        </div>

        {/* Suggested Queries */}
        <div className="rounded-lg border border-slate-900 bg-slate-900/40 p-2.5">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">Preset Queries</p>
          <div className="flex flex-wrap gap-1.5">
            {exampleQuestions.map((example) => (
              <button
                key={example}
                className="rounded border border-slate-900 bg-slate-950 px-2 py-1 text-[10px] text-slate-400 hover:border-indigo-950 hover:bg-indigo-950/20 hover:text-indigo-300 transition duration-150 text-left font-mono"
                onClick={() => setQuestion(example)}
              >
                &gt; {example}
              </button>
            ))}
          </div>
        </div>

        {/* Query Input Terminal style */}
        <div className="space-y-1">
          <label htmlFor="question-input" className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">
            CONSOLE INPUT
          </label>
          <div className="relative">
            <textarea
              id="question-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              placeholder="Ask ADAS to explain room layouts or rule violations..."
              className={`w-full rounded-md border border-slate-900 bg-slate-950 px-3 py-2 text-xs text-slate-200 font-mono shadow-inner outline-none transition focus:border-indigo-950 focus:ring-1 focus:ring-indigo-900/30 placeholder-slate-500 ${focusRing}`}
            />
          </div>
        </div>

        <Button
          onClick={submitQuestion}
          disabled={disabled}
          className="w-full gap-2 border border-indigo-950 bg-indigo-900/40 font-mono text-xs font-bold text-indigo-200 hover:bg-indigo-900/60 focus-visible:ring-indigo-950 shadow-lg shadow-indigo-950/20"
        >
          {isSubmitting ? "SOLVING EVIDENCE..." : "RUN QUERY CONSOLE"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>

        {error.length > 0 ? (
          <Alert variant="destructive" className="bg-rose-950/20 border-rose-900 text-rose-300 font-mono text-xs">
            {error}
          </Alert>
        ) : null}

        {/* Response Console */}
        {answer.length > 0 ? (
          <div className="rounded-lg border border-slate-900 bg-slate-950 p-3 shadow-inner relative">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                <CornerDownRight className="h-3 w-3" />
                CONSOLE OUTPUT
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="rounded-sm border-slate-900 bg-slate-900/60 px-1.5 py-0 font-mono text-[10px] text-slate-400">
                  mode: {mode}
                </Badge>
                <Badge variant="outline" className="rounded-sm border-slate-900 bg-slate-900/60 px-1.5 py-0 font-mono text-[10px] text-slate-400">
                  prov: {provider}
                </Badge>
                {model.length > 0 ? (
                  <Badge variant="outline" className="rounded-sm border-slate-900 bg-slate-900/60 px-1.5 py-0 font-mono text-[10px] text-indigo-400">
                    model: {model.replace("-mini", "")}
                  </Badge>
                ) : null}
              </div>
            </div>
            
            <div className="max-h-72 overflow-y-auto space-y-3 text-xs leading-relaxed text-slate-300 font-mono bg-slate-950/40 p-2 rounded">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-300">{children}</p>,
                  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 text-slate-400">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 text-slate-400">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => (
                    <strong className="font-semibold text-indigo-300">{children}</strong>
                  ),
                  code: ({ children }) => {
                    const text = String(children).trim();
                    const isRoom = text.startsWith("rm-");
                    const isDoor = text.startsWith("dr-");
                    
                    if ((isRoom || isDoor) && onSelectElement) {
                      return (
                        <button
                          type="button"
                          onClick={() => onSelectElement(text, isRoom ? "room" : "door")}
                          className="inline-flex items-center rounded border border-indigo-900 bg-indigo-950/60 px-1 py-0.5 font-mono text-[10px] font-bold text-indigo-300 hover:bg-indigo-900/50 hover:text-indigo-100 transition shadow-inner cursor-pointer"
                        >
                          {text}
                        </button>
                      );
                    }
                    return (
                      <code className="rounded bg-slate-900 px-1 py-0.5 font-mono text-[10px] text-indigo-400 border border-slate-800">
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {answer}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
