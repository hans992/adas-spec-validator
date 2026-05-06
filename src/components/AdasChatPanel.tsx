"use client";

import { useMemo, useState } from "react";
import { Brain } from "lucide-react";
import type { NormalizedModel, ValidationResult } from "@/domain/types";
import type { AdasRole } from "@/ai/types";
import ReactMarkdown from "react-markdown";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card>
      <CardHeader className="pb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assistant Module</p>
        <CardTitle className="mt-1 flex items-center gap-2 text-lg">
          <Brain className="h-4 w-4 text-slate-500" />
          ADAS Chat
        </CardTitle>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Answers are constrained to model facts and deterministic validation evidence.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Role</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {roleOptions.map((role) => {
            const isActive = selectedRole === role;
            return (
              <Button
                key={role}
                onClick={() => setSelectedRole(role)}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={`h-9 ${
                  isActive
                    ? "border-slate-800 bg-slate-900 font-medium text-white shadow-sm"
                    : ""
                }`}
              >
                {role}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Sample Questions
        </p>
        <div className="flex flex-wrap gap-2">
          {exampleQuestions.map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              className="h-auto px-2.5 py-1.5 text-xs"
              onClick={() => setQuestion(example)}
            >
              {example}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="question-input" className="mb-1 block text-xs font-semibold uppercase text-slate-700">
          Question
        </label>
        <textarea
          id="question-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800"
        />
      </div>

      <Button onClick={submitQuestion} disabled={disabled} className="w-full sm:w-auto">
        {isSubmitting ? "Answering..." : "Ask ADAS Chat"}
      </Button>

      {error.length > 0 ? (
        <Alert variant="destructive">{error}</Alert>
      ) : null}

      {answer.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Answer</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="rounded border px-2 py-0.5 text-xs font-medium">
                mode: {mode}
              </Badge>
              <Badge variant="outline" className="rounded border px-2 py-0.5 text-xs font-medium">
                provider: {provider}
              </Badge>
              {model.length > 0 ? (
                <Badge variant="outline" className="rounded border px-2 py-0.5 text-xs font-medium">
                  model: {model}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="space-y-3 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => (
                    <strong className="font-semibold text-slate-900 dark:text-slate-100">{children}</strong>
                  ),
                  code: ({ children }) => (
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-900 dark:bg-slate-800 dark:text-slate-100">
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
      </CardContent>
    </Card>
  );
}
