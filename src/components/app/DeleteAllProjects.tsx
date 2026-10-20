"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";

const CONFIRMATION_PHRASE = "DELETE ALL PROJECTS";

export default function DeleteAllProjects() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setPhrase("");
    setError(null);
  }

  async function removeAll() {
    if (phrase !== CONFIRMATION_PHRASE || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects/bulk", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: phrase }),
      });
      const result = await response.json().catch(() => ({})) as {
        projectsDeleted?: number;
        auditsDeleted?: number;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? "Project data could not be deleted.");

      setOpen(false);
      setPhrase("");
      toast(
        "success",
        "Project data deleted",
        `${result.projectsDeleted ?? 0} website projects and ${result.auditsDeleted ?? 0} saved checks removed. Quota history is preserved.`,
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project data could not be deleted. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="mt-8 rounded-2xl border border-bad/25 bg-bad-soft/40 p-5 sm:p-6" aria-labelledby="project-danger-title">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bad-soft text-bad">
            <AlertTriangle size={19} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="project-danger-title" className="font-semibold text-ink">Danger zone</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Permanently delete every website project in this workspace, including archived projects, and its saved check data.
              This action cannot be undone.
            </p>
            <button type="button" onClick={() => setOpen(true)} className="button-danger mt-4">
              <Trash2 size={16} aria-hidden="true" /> Delete all project data
            </button>
          </div>
        </div>
      </section>

      <Dialog
        open={open}
        onClose={close}
        title="Delete all project data?"
        eyebrow="Owner control · permanent deletion"
        tone="danger"
        describedById="delete-projects-description"
      >
        <div className="space-y-4">
          <p id="delete-projects-description" className="text-sm leading-relaxed text-ink-soft">
            This removes all projects and their saved checks, page results, findings, scan jobs, and report-sharing links in the active workspace.
            Monthly quota history, clients, teammates, billing records, and workspace settings are preserved.
          </p>
          <p className="rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm font-medium leading-relaxed text-bad">
            There is no undo or recovery button. Only the project owner can perform this action.
          </p>
          {error && <p role="alert" className="form-error">{error}</p>}
          <label className="block">
            <span className="form-label">Type <span className="font-mono text-bad">{CONFIRMATION_PHRASE}</span> to confirm</span>
            <input
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              className="form-control mt-1.5 font-mono uppercase"
              aria-label={`Type ${CONFIRMATION_PHRASE} to confirm deletion`}
            />
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} disabled={busy} className="button-secondary">Cancel</button>
            <button
              type="button"
              onClick={() => void removeAll()}
              disabled={busy || phrase !== CONFIRMATION_PHRASE}
              className="button-danger"
            >
              {busy ? <><LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Deleting…</> : <><Trash2 size={16} aria-hidden="true" /> Delete all projects</>}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
