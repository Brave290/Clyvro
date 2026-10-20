"use client";

import { useCallback, useEffect, useState } from "react";
import { BrandSelect } from "@/components/ui";
import { useToast } from "@/components/Toast";

interface Member { userId: string; email: string; name: string; role: string; joinedAt?: string }
interface Invite { id: string; email: string; role: string; expiresAt: string }
interface TeamData {
  members: Member[];
  invitations: Invite[];
  seats: { used: number; pending: number; total: number; planName: string };
  myRole: string;
  myUserId: string;
}

function RoleBadge({ role }: { role: string }) {
  const tone =
    role === "owner" ? "bg-accent text-white"
    : role === "admin" ? "bg-accent-soft text-accent-deep"
    : role === "viewer" ? "bg-warn-soft text-warn"
    : "bg-canvas text-ink-soft";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${tone}`}>{role}</span>;
}

export default function TeamPage() {
  const { toast } = useToast();
  const [data, setData] = useState<TeamData | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/team");
    if (res.ok) setData((await res.json()) as TeamData);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) {
    return <div className="mx-auto max-w-3xl px-5 py-14 text-sm text-ink-mute">Loading team…</div>;
  }

  const isManager = data.myRole === "owner" || data.myRole === "admin";
  const isOwner = data.myRole === "owner";
  const seatsLeft = data.seats.total - data.seats.used - data.seats.pending;

  async function invite() {
    setBusy(true);
    try {
      const res = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const json = (await res.json()) as { url?: string; error?: { message: string } };
      if (!res.ok || !json.url) throw new Error(json.error?.message ?? "Couldn't create the invitation.");
      setInviteUrl(json.url);
      setEmail("");
      toast("success", "Invitation ready", "Copy the link below and send it to them however you like.");
      await load();
    } catch (e) {
      toast("error", "Invitation failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function setMemberRole(userId: string, next: string) {
    const res = await fetch(`/api/team/members/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    if (!res.ok) toast("error", "Role not changed", json.error?.message);
    else toast("success", "Role updated");
    await load();
  }

  async function removeMember(userId: string) {
    const res = await fetch(`/api/team/members/${userId}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    if (!res.ok) toast("error", "Couldn't remove this member", json.error?.message);
    else toast("success", "Member removed");
    await load();
  }

  async function revoke(invitationId: string) {
    await fetch("/api/team/invitations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });
    await load();
  }

  const roleOptions = (isOwner ? ["admin", "member", "viewer"] : ["member", "viewer"]).map((r) => ({
    value: r,
    label: r === "admin" ? "Admin" : r === "member" ? "Member" : "Viewer",
    hint: r === "admin" ? "Manages the team" : r === "member" ? "Full working access" : "Read-only",
  }));

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Team</h1>
      <p className="mt-1 text-sm text-ink-mute">
        {data.seats.used} of {data.seats.total} seats used on the {data.seats.planName} plan
        {data.seats.pending > 0 ? `, ${data.seats.pending} invite${data.seats.pending === 1 ? "" : "s"} pending` : ""}.
      </p>

      <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Who&apos;s here</h2>
        <ul className="mt-4 divide-y divide-line/60">
          {data.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent-deep">
                {(m.name || m.email).charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{m.name || m.email}{m.userId === data.myUserId ? " (you)" : ""}</span>
                <span className="block truncate text-xs text-ink-mute">{m.email}</span>
              </span>
              {isManager && m.role !== "owner" && m.userId !== data.myUserId ? (
                <>
                  <div className="w-44">
                    <BrandSelect
                      id={`role-${m.userId}`}
                      value={m.role}
                      onChange={(v) => void setMemberRole(m.userId, v)}
                      options={roleOptions}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeMember(m.userId)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-bad transition hover:border-bad/40"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <RoleBadge role={m.role} />
              )}
            </li>
          ))}
        </ul>
      </section>

      {data.invitations.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-semibold">Invitations waiting</h2>
          <ul className="mt-4 divide-y divide-line/60">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{i.email}</span>
                <RoleBadge role={i.role} />
                <span className="text-xs text-ink-mute">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                {isManager && (
                  <button
                    type="button"
                    onClick={() => void revoke(i.id)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-bad transition hover:border-bad/40"
                  >
                    Cancel invite
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-mute">
            Invitation links are shown only once, when created — if one is lost, cancel it and make a new one.
          </p>
        </section>
      )}

      {isManager && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-semibold">Invite someone</h2>
          <p className="mt-1 text-sm text-ink-mute">
            We don&apos;t send the email for you — you&apos;ll get a secure link to send however you like.
            It works once, only for that email address, and expires in 7 days.
          </p>
          {seatsLeft <= 0 ? (
            <p className="mt-4 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm">
              All {data.seats.total} seats on the {data.seats.planName} plan are taken (counting pending invites).
              See Pricing for plans with more seats.
            </p>
          ) : (
            <form
              aria-busy={busy}
              className="form-panel mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => { e.preventDefault(); void invite(); }}
            >
              <label className="flex-1">
                <span className="form-label">Their email address</span>
                <input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="form-control mt-1.5"
                />
              </label>
              <label className="sm:w-52">
                <span className="form-label">Role</span>
                <div className="mt-1.5">
                  <BrandSelect id="invite-role" value={role} onChange={setRole} options={roleOptions} />
                </div>
              </label>
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="button-primary sm:shrink-0"
              >
                {busy ? "Creating…" : "Create invite link"}
              </button>
            </form>
          )}
          {inviteUrl && (
            <div className="mt-4 rounded-lg border border-good/25 bg-good-soft px-4 py-3">
              <p className="text-sm font-semibold">Send this link to them:</p>
              <p className="mt-1 break-all select-all text-sm text-accent-deep">{inviteUrl}</p>
              <p className="mt-1 text-xs text-ink-mute">It&apos;s shown only now — if you lose it, cancel the invite above and make a new one.</p>
            </div>
          )}
          <ul className="mt-5 space-y-1 text-xs text-ink-mute">
            <li><strong className="text-ink-soft">Admin</strong> — manages members and settings (only the owner can invite or change admins).</li>
            <li><strong className="text-ink-soft">Member</strong> — can add websites, run checks, and share reports.</li>
            <li><strong className="text-ink-soft">Viewer</strong> — can look at everything but change nothing. Good for clients.</li>
          </ul>
        </section>
      )}
    </div>
  );
}
