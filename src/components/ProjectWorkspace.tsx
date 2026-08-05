"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, FileText, FolderOpen, GitCompareArrows, KeyRound, LogIn, LogOut, Save, Shield, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ValidationReport, type ValidationReview } from "@/components/ValidationReport";
import type { NormalizedModel, Requirement, SpecificationPackage } from "@/domain/types";
import {
  DEFAULT_RELEASE_POLICY,
  normalizeReleasePolicy,
  type RegressionReport,
  type ReleasePolicy
} from "@/domain/regressionValidation";
import { compareValidationSnapshots, type ValidationComparison, type ValidationSnapshot } from "@/domain/validationComparison";
import { compareSpecificationRequirements, type RequirementChange } from "@/domain/specificationComparison";
import { authenticatedBrowserApi } from "@/persistence/browserApi";
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

type Project = {
  id: string;
  name: string;
  description?: string;
  access_role?: "owner" | "editor" | "viewer";
  updated_at?: string;
  baseline_validation_id?: string | null;
  release_policy?: ReleasePolicy | null;
};
type ValidationSummary = { id: string; model_name: string; created_at: string; metrics?: { passRate?: number | null; coverage?: number | null } };
type Invitation = { id: string; project_id: string; email: string; role: "viewer" | "editor"; projects?: { name?: string } };
type Member = { user_id: string; role: "viewer" | "editor"; created_at: string };
type Snapshot = { model_name: string; normalized_model: NormalizedModel; requirements: Requirement[] };
type StoredSpecification = SpecificationPackage & { id: string; created_by: string; created_at: string };
export type ProjectTarget = { projectId: string; canEdit: boolean; projectName: string };

export function ProjectWorkspace({ model, requirements, modelName, onOpen, specificationName, specificationRevision, onOpenSpecification, onProjectTargetChange, onReviewsLoaded, specificationRefreshKey = 0 }: {
  model: NormalizedModel;
  requirements: Requirement[];
  modelName: string;
  onOpen: (snapshot: Snapshot) => void;
  specificationName: string;
  specificationRevision: string;
  onOpenSpecification: (specification: SpecificationPackage) => void;
  onProjectTargetChange?: (target: ProjectTarget | null) => void;
  onReviewsLoaded?: (reviews: ValidationReview[], context: string) => void;
  specificationRefreshKey?: number;
}) {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [validations, setValidations] = useState<ValidationSummary[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ValidationComparison | null>(null);
  const [reportSnapshot, setReportSnapshot] = useState<ValidationSnapshot | null>(null);
  const [reportReviews, setReportReviews] = useState<ValidationReview[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "forgot" | "recovery">("signin");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sentInvitations, setSentInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [specifications, setSpecifications] = useState<StoredSpecification[]>([]);
  const [selectedSpecificationId, setSelectedSpecificationId] = useState("");
  const [specificationDraftName, setSpecificationDraftName] = useState(specificationName);
  const [specificationDraftRevision, setSpecificationDraftRevision] = useState(specificationRevision);
  const [comparisonSpecificationId, setComparisonSpecificationId] = useState("");
  const [requirementChanges, setRequirementChanges] = useState<RequirementChange[]>([]);
  const [regressionReport, setRegressionReport] = useState<RegressionReport | null>(null);
  const [policyDraft, setPolicyDraft] = useState<ReleasePolicy>(DEFAULT_RELEASE_POLICY);

  useEffect(() => {
    const recovery = captureRecoverySession();
    if (recovery) { setSession(recovery); setAuthMode("recovery"); return; }
    void refreshBrowserSession(readBrowserSession()).then(setSession);
  }, []);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    return authenticatedBrowserApi<any>(path, init, session, setSession);
  }, [session]);

  const loadProjects = useCallback(async () => {
    if (!session) return;
    const payload = await api("/api/projects");
    setProjects(payload.projects);
    setProjectId((current) => current || payload.projects[0]?.id || "");
  }, [api, session]);

  const loadInvitations = useCallback(async () => {
    if (!session) return;
    const payload = await api("/api/invitations"); setInvitations(payload.invitations);
  }, [api, session]);

  const loadMembers = useCallback(async (selectedProjectId: string) => {
    const project = projects.find((item) => item.id === selectedProjectId);
    if (!selectedProjectId || project?.access_role !== "owner") { setMembers([]); setSentInvitations([]); return; }
    const payload = await api(`/api/projects/${selectedProjectId}/members`); setMembers(payload.members); setSentInvitations(payload.invitations);
  }, [api, projects]);

  const loadValidations = useCallback(async (selectedProjectId: string) => {
    setComparisonIds([]); setComparison(null); setRegressionReport(null);
    if (!selectedProjectId) return setValidations([]);
    const payload = await api(`/api/projects/${selectedProjectId}/validations`);
    setValidations(payload.validations);
  }, [api]);

  const loadSpecifications = useCallback(async (selectedProjectId: string) => {
    if (!selectedProjectId) { setSpecifications([]); setSelectedSpecificationId(""); return; }
    const payload = await api(`/api/projects/${selectedProjectId}/specifications`);
    const normalized = (payload.specifications as Array<StoredSpecification & { document_source?: SpecificationPackage["documentSource"] }>).map((item) => {
      const { document_source, ...rest } = item;
      return {
        ...rest,
        ...(document_source ? { documentSource: document_source } : {})
      } as StoredSpecification;
    });
    setSpecifications(normalized);
    setSelectedSpecificationId((current) => normalized.some((item) => item.id === current) ? current : normalized[0]?.id ?? "");
  }, [api]);

  useEffect(() => { void loadProjects().catch((error: Error) => setMessage(error.message)); }, [loadProjects]);
  useEffect(() => { void loadInvitations().catch((error: Error) => setMessage(error.message)); }, [loadInvitations]);
  useEffect(() => { void loadValidations(projectId).catch((error: Error) => setMessage(error.message)); }, [loadValidations, projectId]);
  useEffect(() => { void loadSpecifications(projectId).catch((error: Error) => setMessage(error.message)); }, [loadSpecifications, projectId, specificationRefreshKey]);
  useEffect(() => { void loadMembers(projectId).catch((error: Error) => setMessage(error.message)); }, [loadMembers, projectId]);
  useEffect(() => { setSpecificationDraftName(specificationName); setSpecificationDraftRevision(specificationRevision); }, [specificationName, specificationRevision]);
  useEffect(() => {
    const project = projects.find((item) => item.id === projectId);
    setPolicyDraft(normalizeReleasePolicy(project?.release_policy));
    setRegressionReport(null);
  }, [projectId, projects]);
  useEffect(() => {
    const project = projects.find((item) => item.id === projectId);
    onProjectTargetChange?.(session && project
      ? { projectId, projectName: project.name, canEdit: project.access_role !== "viewer" }
      : null);
  }, [onProjectTargetChange, projectId, projects, session]);

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

  return (<>
    {reportSnapshot && <ValidationReport projectName={projects.find((project) => project.id === projectId)?.name ?? "Untitled project"} snapshot={reportSnapshot} reviews={reportReviews} canEdit={projects.find((project) => project.id === projectId)?.access_role !== "viewer"} onSaveReview={async (decision) => { const payload = await api(`/api/projects/${projectId}/validations/${reportSnapshot.id}/reviews`, { method: "PUT", body: JSON.stringify(decision) }); setReportReviews((current) => { const next = [payload.review, ...current.filter((review) => review.requirement_id !== payload.review.requirement_id)]; onReviewsLoaded?.(next, `${reportSnapshot.model_name} · ${new Date(reportSnapshot.created_at).toLocaleString()}`); return next; }); }} onClose={() => setReportSnapshot(null)} />}
    <Card className="shadow-md">
      <CardHeader className="pb-3 text-left"><div className="flex items-center justify-between"><div><CardTitle className="text-sm">Project workspace</CardTitle><CardDescription className="text-xs">Signed in as {session.email}</CardDescription></div><Button variant="outline" size="sm" onClick={() => { clearBrowserSession(); setSession(null); setProjects([]); }}><LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out</Button></div></CardHeader>
      <CardContent className="space-y-3">
        {invitations.length > 0 && <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-left dark:border-sky-900 dark:bg-sky-950/30"><p className="text-xs font-semibold">Project invitations</p>{invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between gap-2 text-xs"><span>{invitation.projects?.name ?? "Shared project"} · {invitation.role}</span><Button size="sm" disabled={busy} onClick={() => void run(async () => { const payload = await api("/api/invitations", { method: "POST", body: JSON.stringify({ invitationId: invitation.id }) }); await Promise.all([loadInvitations(), loadProjects()]); setProjectId(payload.projectId); setMessage("Invitation accepted."); })}>Accept</Button></div>)}</div>}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input aria-label="New project name" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="New project name" className="h-9 rounded-md border bg-transparent px-3 text-xs" />
          <Button variant="outline" size="sm" disabled={busy || !newProjectName.trim()} onClick={() => void run(async () => { const payload = await api("/api/projects", { method: "POST", body: JSON.stringify({ name: newProjectName }) }); setNewProjectName(""); await loadProjects(); setProjectId(payload.project.id); })}>Create project</Button>
        </div>
        {projectId && <div className="space-y-2 rounded-lg border p-3 text-left">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold"><BookOpen className="h-3.5 w-3.5" /> Specification library</p><p className="text-[10px] text-slate-500">Save the active {requirements.length}-rule package under an immutable project revision.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_0.6fr_auto]">
            <input aria-label="Specification name" value={specificationDraftName} onChange={(event) => setSpecificationDraftName(event.target.value)} placeholder="Specification name" className="h-9 rounded-md border bg-transparent px-3 text-xs" />
            <input aria-label="Specification revision" value={specificationDraftRevision} onChange={(event) => setSpecificationDraftRevision(event.target.value)} placeholder="Revision" className="h-9 rounded-md border bg-transparent px-3 text-xs" />
            <Button variant="outline" size="sm" disabled={busy || !specificationDraftName.trim() || !specificationDraftRevision.trim() || projects.find((project) => project.id === projectId)?.access_role === "viewer"} onClick={() => void run(async () => { await api(`/api/projects/${projectId}/specifications`, { method: "POST", body: JSON.stringify({ name: specificationDraftName, revision: specificationDraftRevision, requirements }) }); await loadSpecifications(projectId); setMessage("Specification revision saved."); })}><Save className="mr-1.5 h-3.5 w-3.5" /> Save revision</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <select aria-label="Saved specification revision" value={selectedSpecificationId} onChange={(event) => setSelectedSpecificationId(event.target.value)} className="h-9 rounded-md border bg-transparent px-3 text-xs"><option value="">No saved specifications</option>{specifications.map((specification) => <option key={specification.id} value={specification.id}>{specification.name} · {specification.revision} · {specification.requirements.length} rules</option>)}</select>
            <Button variant="outline" size="sm" disabled={busy || !selectedSpecificationId} onClick={() => { const selected = specifications.find((item) => item.id === selectedSpecificationId); if (selected) { const { id: _id, created_by: _createdBy, created_at: _createdAt, ...pkg } = selected; onOpenSpecification(pkg); setMessage("Specification revision loaded."); } }}><FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Load</Button>
          </div>
          {specifications.length > 0 && <p className="text-[10px] text-slate-500">{specifications.length} saved revision{specifications.length === 1 ? "" : "s"}. Saving an existing name and revision is rejected to preserve audit history.</p>}
          {specifications.length > 0 && <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><select aria-label="Revision to compare" value={comparisonSpecificationId} onChange={(event) => setComparisonSpecificationId(event.target.value)} className="h-9 rounded-md border bg-transparent px-3 text-xs"><option value="">Compare active draft with…</option>{specifications.map((specification) => <option key={specification.id} value={specification.id}>{specification.name} · {specification.revision}</option>)}</select><Button variant="outline" size="sm" disabled={!comparisonSpecificationId} onClick={() => { const selected = specifications.find((item) => item.id === comparisonSpecificationId); if (selected) setRequirementChanges(compareSpecificationRequirements(selected.requirements, requirements)); }}><GitCompareArrows className="mr-1.5 h-3.5 w-3.5" /> Compare revisions</Button></div>}
          {requirementChanges.length > 0 && <div className="grid grid-cols-4 gap-1 text-center">{(["added", "changed", "removed", "unchanged"] as const).map((kind) => <div key={kind} className="rounded bg-slate-100 p-1.5 dark:bg-slate-800"><p className="text-sm font-bold">{requirementChanges.filter((item) => item.kind === kind).length}</p><p className="text-[9px] capitalize">{kind}</p></div>)}</div>}
        </div>}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select aria-label="Active project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-9 rounded-md border bg-transparent px-3 text-xs"><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <Button size="sm" disabled={busy || !projectId || projects.find((project) => project.id === projectId)?.access_role === "viewer"} onClick={() => void run(async () => { await api(`/api/projects/${projectId}/validations`, { method: "POST", body: JSON.stringify({ modelName: modelName || "workspace-model.json", model, requirements }) }); await loadValidations(projectId); setMessage("Validation saved."); })}><Save className="mr-1.5 h-3.5 w-3.5" /> Save validation</Button>
        </div>
        {projects.find((project) => project.id === projectId)?.access_role === "owner" && <div className="space-y-2 rounded-lg border p-3 text-left"><p className="flex items-center gap-1.5 text-xs font-semibold"><Users className="h-3.5 w-3.5" /> Team access</p><div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input aria-label="Invite email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="colleague@company.com" className="h-9 rounded-md border bg-transparent px-3 text-xs" /><select aria-label="Invitation role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "viewer" | "editor")} className="h-9 rounded-md border bg-transparent px-2 text-xs"><option value="viewer">Viewer</option><option value="editor">Editor</option></select><Button variant="outline" size="sm" disabled={busy || !inviteEmail} onClick={() => void run(async () => { await api(`/api/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ email: inviteEmail, role: inviteRole }) }); setInviteEmail(""); await loadMembers(projectId); setMessage("Invitation created."); })}>Invite</Button></div>{members.map((member) => <div key={member.user_id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-[10px]"><span className="min-w-0 truncate">{member.user_id}</span><div className="flex gap-1"><select aria-label={`Role for ${member.user_id}`} value={member.role} disabled={busy} onChange={(event) => void run(async () => { await api(`/api/projects/${projectId}/members`, { method: "PATCH", body: JSON.stringify({ userId: member.user_id, role: event.target.value }) }); await loadMembers(projectId); setMessage("Member role updated."); })} className="rounded border bg-transparent px-1"><option value="viewer">Viewer</option><option value="editor">Editor</option></select><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { await api(`/api/projects/${projectId}/members?userId=${encodeURIComponent(member.user_id)}`, { method: "DELETE" }); await loadMembers(projectId); setMessage("Member removed."); })}>Remove</Button></div></div>)}<p className="text-[10px] text-slate-500">{members.length} active member{members.length === 1 ? "" : "s"} · {sentInvitations.length} pending invitation{sentInvitations.length === 1 ? "" : "s"}. Invitations expire after 7 days.</p></div>}

        {projectId && projects.find((project) => project.id === projectId)?.access_role === "owner" && (
          <div className="space-y-2 rounded-lg border p-3 text-left">
            <p className="flex items-center gap-1.5 text-xs font-semibold"><Shield className="h-3.5 w-3.5" /> Release policy</p>
            <p className="text-[10px] text-slate-500">Deterministic gate for baseline vs candidate runs. Same inputs always yield the same status; AI is never consulted.</p>
            <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
              {([
                ["blockOnNewCritical", "Block on new critical finding"],
                ["blockOnDecreasedCoverage", "Block on decreased coverage"],
                ["warnOnNewUnknown", "Warn on new unknown results"],
                ["allowWaivedCritical", "Allow waived critical findings"]
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={policyDraft[key]}
                    onChange={(event) => setPolicyDraft((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px]">Max high (critical) findings
                <input
                  aria-label="Max high findings"
                  type="number"
                  min={0}
                  value={policyDraft.maxHighFindings ?? ""}
                  placeholder="Unlimited"
                  onChange={(event) => setPolicyDraft((current) => ({
                    ...current,
                    maxHighFindings: event.target.value === "" ? null : Math.max(0, Number(event.target.value))
                  }))}
                  className="mt-1 h-8 w-full rounded border bg-transparent px-2 text-xs"
                />
              </label>
              <label className="text-[11px]">Max medium (warning) findings
                <input
                  aria-label="Max medium findings"
                  type="number"
                  min={0}
                  value={policyDraft.maxMediumFindings ?? ""}
                  placeholder="Unlimited"
                  onChange={(event) => setPolicyDraft((current) => ({
                    ...current,
                    maxMediumFindings: event.target.value === "" ? null : Math.max(0, Number(event.target.value))
                  }))}
                  className="mt-1 h-8 w-full rounded border bg-transparent px-2 text-xs"
                />
              </label>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(async () => {
                const payload = await api(`/api/projects/${projectId}`, {
                  method: "PATCH",
                  body: JSON.stringify({ releasePolicy: policyDraft })
                });
                setProjects((current) => current.map((project) => project.id === projectId
                  ? { ...project, ...payload.project, access_role: project.access_role }
                  : project));
                setMessage("Release policy saved.");
              })}
            >
              Save release policy
            </Button>
          </div>
        )}

        {validations.length >= 2 && <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2 dark:bg-slate-900/60"><p className="text-[11px] text-slate-500">Select exactly two runs below for a free-form compare, or use Compare to baseline on a candidate.</p><Button variant="outline" size="sm" disabled={busy || comparisonIds.length !== 2} onClick={() => void run(async () => { setRegressionReport(null); const snapshots = await Promise.all(comparisonIds.map(async (id) => (await api(`/api/projects/${projectId}/validations/${id}`)).validation as ValidationSnapshot)); snapshots.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); setComparison(compareValidationSnapshots(snapshots[0], snapshots[1])); })}><GitCompareArrows className="mr-1.5 h-3.5 w-3.5" /> Compare runs</Button></div>}
        <div className="space-y-1.5">{validations.length === 0 ? <p className="text-xs text-slate-500">No saved validations in this project.</p> : validations.map((validation) => {
          const isBaseline = projects.find((project) => project.id === projectId)?.baseline_validation_id === validation.id;
          const isOwner = projects.find((project) => project.id === projectId)?.access_role === "owner";
          return (
            <div key={validation.id} className={`flex items-center justify-between rounded-lg border p-2 text-left ${isBaseline ? "border-indigo-300 bg-indigo-50/40 dark:border-indigo-800 dark:bg-indigo-950/20" : ""}`}>
              <div className="flex items-center gap-2">
                {validations.length >= 2 && <input type="checkbox" aria-label={`Compare ${validation.model_name} from ${validation.created_at}`} checked={comparisonIds.includes(validation.id)} onChange={(event) => { setComparison(null); setRegressionReport(null); setComparisonIds((current) => event.target.checked ? [...current, validation.id].slice(-2) : current.filter((id) => id !== validation.id)); }} />}
                <div>
                  <p className="text-xs font-semibold">{validation.model_name}{isBaseline ? " · baseline" : ""}</p>
                  <p className="text-[10px] text-slate-500">{new Date(validation.created_at).toLocaleString()} · pass rate {validation.metrics?.passRate ?? "—"}%</p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {isOwner && !isBaseline && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { const payload = await api(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ baselineValidationId: validation.id }) }); setProjects((current) => current.map((project) => project.id === projectId ? { ...project, ...payload.project, access_role: project.access_role } : project)); setRegressionReport(null); setMessage("Baseline validation set."); })}>Set baseline</Button>}
                {isOwner && isBaseline && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { const payload = await api(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ baselineValidationId: null }) }); setProjects((current) => current.map((project) => project.id === projectId ? { ...project, ...payload.project, access_role: project.access_role } : project)); setRegressionReport(null); setMessage("Baseline cleared."); })}>Clear baseline</Button>}
                {!isBaseline && projects.find((project) => project.id === projectId)?.baseline_validation_id && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { setComparison(null); const payload = await api(`/api/projects/${projectId}/regression?candidateId=${encodeURIComponent(validation.id)}`); setRegressionReport(payload.report as RegressionReport); setMessage(payload.report.gate.status === "pass" ? "Regression gate passed." : payload.report.gate.status === "warn" ? "Regression gate warned." : "Regression gate blocked"); })}>Compare to baseline</Button>}
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { const [snapshotPayload, reviewsPayload] = await Promise.all([api(`/api/projects/${projectId}/validations/${validation.id}`), api(`/api/projects/${projectId}/validations/${validation.id}/reviews`)]); setReportReviews(reviewsPayload.reviews); setReportSnapshot(snapshotPayload.validation); onReviewsLoaded?.(reviewsPayload.reviews, `${validation.model_name} · ${new Date(validation.created_at).toLocaleString()}`); })}><FileText className="mr-1.5 h-3.5 w-3.5" /> Report</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { const payload = await api(`/api/projects/${projectId}/validations/${validation.id}`); onOpen(payload.validation); setMessage("Saved validation opened."); })}><FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Open</Button>
              </div>
            </div>
          );
        })}</div>
        {comparison && <div className="space-y-2 rounded-lg border p-3 text-left"><div className="flex items-center justify-between"><p className="text-xs font-semibold">Validation comparison</p><p className={`text-xs font-semibold ${(comparison.passRateDelta ?? 0) > 0 ? "text-emerald-600" : (comparison.passRateDelta ?? 0) < 0 ? "text-rose-500" : "text-slate-500"}`}>{comparison.beforePassRate ?? "—"}% → {comparison.afterPassRate ?? "—"}% {comparison.passRateDelta === null ? "" : `(${comparison.passRateDelta >= 0 ? "+" : ""}${comparison.passRateDelta} pp)`}</p></div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded bg-emerald-50 p-2 dark:bg-emerald-950/30"><p className="text-lg font-bold text-emerald-600">{comparison.counts.resolved}</p><p className="text-[10px]">Resolved</p></div><div className="rounded bg-rose-50 p-2 dark:bg-rose-950/30"><p className="text-lg font-bold text-rose-500">{comparison.counts.regressed}</p><p className="text-[10px]">Regressed</p></div><div className="rounded bg-slate-100 p-2 dark:bg-slate-800"><p className="text-lg font-bold">{comparison.counts.unchanged}</p><p className="text-[10px]">Unchanged</p></div></div><p className="text-[10px] text-slate-500">Model delta: {comparison.roomsDelta >= 0 ? "+" : ""}{comparison.roomsDelta} rooms · {comparison.doorsDelta >= 0 ? "+" : ""}{comparison.doorsDelta} doors · {comparison.levelsDelta >= 0 ? "+" : ""}{comparison.levelsDelta} levels</p><div className="max-h-40 space-y-1 overflow-y-auto">{comparison.changes.filter((change) => change.kind !== "unchanged").map((change) => <div key={change.requirementId} className="flex justify-between rounded border px-2 py-1 text-[10px]"><span>{change.title}</span><span className={change.kind === "resolved" ? "text-emerald-600" : change.kind === "regressed" ? "text-rose-500" : "text-amber-600"}>{change.before} → {change.after}</span></div>)}</div></div>}

        {regressionReport && (
          <div className="space-y-3 rounded-lg border p-3 text-left" data-testid="regression-report">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">Regression vs baseline</p>
                <p className="text-[10px] text-slate-500">{regressionReport.baselineModelName} → {regressionReport.candidateModelName}</p>
              </div>
              <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${
                regressionReport.gate.status === "pass" ? "bg-emerald-100 text-emerald-800"
                  : regressionReport.gate.status === "warn" ? "bg-amber-100 text-amber-800"
                    : "bg-rose-100 text-rose-800"
              }`}>Gate: {regressionReport.gate.status}</span>
            </div>
            {regressionReport.gate.violations.length > 0 && (
              <ul className="space-y-1 text-[11px]">
                {regressionReport.gate.violations.map((violation) => (
                  <li key={violation.code} className={violation.severity === "block" ? "text-rose-600" : "text-amber-700"}>
                    [{violation.severity}] {violation.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
              {([
                ["New findings", regressionReport.findingCounts.new],
                ["Resolved", regressionReport.findingCounts.resolved],
                ["Reopened", regressionReport.findingCounts.reopened],
                ["Changed", regressionReport.findingCounts.changed]
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded bg-slate-100 p-2 dark:bg-slate-800">
                  <p className="text-lg font-bold">{value}</p>
                  <p className="text-[10px]">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">
              Requirements +{regressionReport.requirementCounts.added} / −{regressionReport.requirementCounts.removed}
              {" · "}Specification changed {regressionReport.specificationCounts.changed}
              {" · "}Coverage {regressionReport.metrics.beforeCoverage ?? "—"}% → {regressionReport.metrics.afterCoverage ?? "—"}%
              {" · "}Model {regressionReport.model.roomsDelta >= 0 ? "+" : ""}{regressionReport.model.roomsDelta} rooms, {regressionReport.model.doorsDelta >= 0 ? "+" : ""}{regressionReport.model.doorsDelta} doors
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {regressionReport.findings.filter((finding) => finding.kind !== "unchanged").map((finding) => (
                <div key={finding.key} className="flex justify-between gap-2 rounded border px-2 py-1 text-[10px]">
                  <span className="min-w-0 truncate">{finding.title} · {finding.affectedElementIds.join(", ") || "model"}</span>
                  <span className={
                    finding.kind === "resolved" ? "text-emerald-600"
                      : finding.kind === "new" || finding.kind === "reopened" ? "text-rose-500"
                        : "text-amber-600"
                  }>
                    {finding.kind}: {finding.beforeStatus ?? "—"} → {finding.afterStatus ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {message && <p className={`text-xs ${message.endsWith(".") ? "text-emerald-600" : "text-rose-500"}`}>{message}</p>}
      </CardContent>
    </Card>
  </>);
}
