"use client";

import { useMemo, useState } from "react";
import type { NormalizedModel, ValidationResult } from "@/domain/types";
import type { AdasRole } from "@/ai/types";
import ReactMarkdown from "react-markdown";

const roleOptions: AdasRole[] = ["Design Engineer", "Stockroom Personnel", "Project Manager"];

const exampleQuestions = [
  "Does the stockroom meet the current requirements?",
  "What are the highest-risk issues?",
  "What cannot be determined from the current model?"
];

interface AdasChatPanelProps {
  normalizedModel: NormalizedModel;
  validationResults: ValidationResult[];
}

export function AdasChatPanel({ normalizedModel, validationResults }: AdasChatPanelProps) {
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
    <article className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm shadow-slate-200/60">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assistant Module</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">ADAS Chat</h2>
      </div>
      <p className="mb-4 text-xs text-slate-600">
        Answers are constrained to model facts and deterministic validation evidence.
      </p>

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Role</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {roleOptions.map((role) => {
            const isActive = selectedRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                  isActive
                    ? "border-slate-800 bg-slate-900 font-medium text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                }`}
              >
                {role}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Sample Questions
        </p>
        <div className="flex flex-wrap gap-2">
          {exampleQuestions.map((example) => (
            <button
              key={example}
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              onClick={() => setQuestion(example)}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <label htmlFor="question-input" className="mb-1 block text-xs font-semibold uppercase text-slate-700">
          Question
        </label>
        <textarea
          id="question-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
      </div>

      <button
        type="button"
        onClick={submitQuestion}
        disabled={disabled}
        className="rounded-md border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Answering..." : "Ask ADAS Chat"}
      </button>

      {error.length > 0 ? (
        <p className="mt-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {answer.length > 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Answer</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                mode: {mode}
              </span>
              <span className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                provider: {provider}
              </span>
              {model.length > 0 ? (
                <span className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                  model: {model}
                </span>
              ) : null}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-white p-3">
            <div className="space-y-3 text-sm leading-relaxed text-slate-800">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                  code: ({ children }) => (
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-900">
                      {children}
                    </code>
                  )
                }}
              >
                {answer}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
