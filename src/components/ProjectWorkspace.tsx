"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, KeyRound, LogIn, LogOut, Save, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NormalizedModel, Requirement } from "@/domain/types";
import {
  clearBrowserSession,
  captureRecoverySession,
  readBrowserSession,
  refreshBrowserSession,
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
  type BrowserSession
} from "@/persistence/browserSession";

type Project = { id: string; name: string; description?: string; updated_at?: string };
type ValidationSummary = { id: string; model_name: string; created_at: string; metrics?: { passRate?: number | null } };
type Snapshot = { model_name: string; normalized_model: NormalizedModel; requirements: Requirement[] };

export function ProjectWorkspace({ model, requirements, modelName, onOpen }: {
  model: NormalizedModel;
  requirements: Requirement[];
  modelName: string;
  onOpen: (snapshot: Snapshot) => void;
}) {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [validations, setValidations] = useState<ValidationSummary[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "forgot" | "recovery">("signin");

  useEffect(() => {
    const recovery = captureRecoverySession();
    if (recovery) { setSession(recovery); setAuthMode("recovery"); return; }
    void refreshBrowserSession(readBrowserSession()).then(setSession);
  }, []);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const activeSession = await refreshBrowserSession(session);
    if (!activeSession) { setSession(null); throw new Error("Your session expired. Please sign in again."); }
    if (activeSession.accessToken !== session?.accessToken) setSession(activeSession);
    const request = (accessToken: string) => fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) }
    });
    let response = await request(activeSession.accessToken);
    if (response.status === 401) {
      const refreshed = await refreshBrowserSession({ ...activeSession, expiresAt: 0 });
      if (!refreshed) { setSession(null); throw new Error("Your session expired. Please sign in again."); }
      setSession(refreshed);
      response = await request(refreshed.accessToken);
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "The request failed.");
    return payload;
  }, [session]);

  const loadProjects = useCallback(async () => {
    if (!session) return;
    const payload = await api("/api/projects");
    setProjects(payload.projects);
    setProjectId((current) => current || payload.projects[0]?.id || "");
  }, [api, session]);

  const loadValidations = useCallback(async (selectedProjectId: string) => {
    if (!selectedProjectId) return setValidations([]);
    const payload = await api(`/api/projects/${selectedProjectId}/validations`);
    setValidations(payload.validations);
  }, [api]);

  useEffect(() => { void loadProjects().catch((error: Error) => setMessage(error.message)); }, [loadProjects]);
  useEffect(() => { void loadValidations(projectId).catch((error: Error) => setMessage(error.message)); }, [loadValidations, projectId]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "The request failed."); }
    finally { setBusy(false); }
  }

  if (!session || authMode === "recovery") return (
    <Card className="shadow-md">
      <CardHeader className="pb-3 text-left"><CardTitle className="text-sm">Project workspace</CardTitle><CardDescription className="text-xs">{authMode === "signup" ? "Create an account to save projects and validation history." : authMode === "forgot" ? "Enter your email to receive a secure password reset link." : authMode === "recovery" ? "Choose a new password for your account." : "Sign in to save and reopen validation runs."}</CardDescription></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        {authMode !== "recovery" && <input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="h-9 rounded-md border bg-transparent px-3 text-xs" />}
        {authMode !== "forgot" &&
        <input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="h-9 rounded-md border bg-transparent px-3 text-xs" />
        }
        {authMode === "signin" && <Button disabled={busy || !email || !password} size="sm" onClick={() => void run(async () => setSession(await signInWithPassword(email, password)))}><LogIn className="mr-1.5 h-3.5 w-3.5" /> Sign in</Button>}
        {authMode === "signup" && <Button disabled={busy || !email || password.length < 8} size="sm" onClick={() => void run(async () => { const created = await signUpWithPassword(email, password); if (created) setSession(created); else { setMessage("Check your email to confirm your account."); setAuthMode("signin"); } })}><UserPlus className="mr-1.5 h-3.5 w-3.5" /> Create account</Button>}
        {authMode === "forgot" && <Button disabled={busy || !email} size="sm" onClick={() => void run(async () => { await requestPasswordReset(email); setMessage("If the account exists, a reset link has been sent."); })}><KeyRound className="mr-1.5 h-3.5 w-3.5" /> Send reset link</Button>}
        {authMode === "recovery" && <Button disabled={busy || password.length < 8 || !session} size="sm" onClick={() => void run(async () => { await updatePassword(session!.accessToken, password); setAuthMode("signin"); setMessage("Password updated."); })}><KeyRound className="mr-1.5 h-3.5 w-3.5" /> Update password</Button>}
        <div className="flex gap-3 text-[11px] sm:col-span-3">
          {authMode !== "signin" && <button type="button" className="underline" onClick={() => setAuthMode("signin")}>Back to sign in</button>}
          {authMode === "signin" && <><button type="button" className="underline" onClick={() => setAuthMode("signup")}>Create account</button><button type="button" className="underline" onClick={() => setAuthMode("forgot")}>Forgot password?</button></>}
        </div>
        {message && <p className="text-xs text-rose-500 sm:col-span-3">{message}</p>}
      </CardContent>
    </Card>
  );

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3 text-left"><div className="flex items-center justify-between"><div><CardTitle className="text-sm">Project workspace</CardTitle><CardDescription className="text-xs">Signed in as {session.email}</CardDescription></div><Button variant="outline" size="sm" onClick={() => { clearBrowserSession(); setSession(null); setProjects([]); }}><LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out</Button></div></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input aria-label="New project name" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="New project name" className="h-9 rounded-md border bg-transparent px-3 text-xs" />
          <Button variant="outline" size="sm" disabled={busy || !newProjectName.trim()} onClick={() => void run(async () => { const payload = await api("/api/projects", { method: "POST", body: JSON.stringify({ name: newProjectName }) }); setNewProjectName(""); await loadProjects(); setProjectId(payload.project.id); })}>Create project</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select aria-label="Active project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-9 rounded-md border bg-transparent px-3 text-xs"><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <Button size="sm" disabled={busy || !projectId} onClick={() => void run(async () => { await api(`/api/projects/${projectId}/validations`, { method: "POST", body: JSON.stringify({ modelName: modelName || "workspace-model.json", model, requirements }) }); await loadValidations(projectId); setMessage("Validation saved."); })}><Save className="mr-1.5 h-3.5 w-3.5" /> Save validation</Button>
        </div>
        <div className="space-y-1.5">{validations.length === 0 ? <p className="text-xs text-slate-500">No saved validations in this project.</p> : validations.map((validation) => <div key={validation.id} className="flex items-center justify-between rounded-lg border p-2 text-left"><div><p className="text-xs font-semibold">{validation.model_name}</p><p className="text-[10px] text-slate-500">{new Date(validation.created_at).toLocaleString()} · pass rate {validation.metrics?.passRate ?? "—"}%</p></div><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { const payload = await api(`/api/projects/${projectId}/validations/${validation.id}`); onOpen(payload.validation); setMessage("Saved validation opened."); })}><FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Open</Button></div>)}</div>
        {message && <p className={`text-xs ${message.endsWith(".") ? "text-emerald-600" : "text-rose-500"}`}>{message}</p>}
      </CardContent>
    </Card>
  );
}
