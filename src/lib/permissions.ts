/**
 * Team roles & permissions (Phase 4). Enforced on the server for every
 * mutation — hiding a button in the UI is never the authorization.
 *
 *  owner  — everything, including ownership-level changes
 *  admin  — day-to-day management: settings, branding, members (below owner)
 *  member — the work: clients, projects, audits, findings, shares
 *  viewer — read-only
 */
export type Role = "owner" | "admin" | "member" | "viewer";

export const ROLES: Role[] = ["owner", "admin", "member", "viewer"];

/** Roles an invitation may grant (ownership is never handed out by invite link). */
export const INVITABLE_ROLES: Exclude<Role, "owner">[] = ["admin", "member", "viewer"];

export function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value);
}

export function normalizeRole(value: string | null | undefined): Role {
  return value && isRole(value) ? value : "viewer";
}

/** Create/edit clients & projects, run audits, change findings, create/revoke shares. */
export function canWrite(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

/** Organization settings, branding, invitations, member management. */
export function canManageOrg(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/** Destructive workspace-wide project and audit-data deletion is owner-only. */
export function canDeleteAllProjects(role: Role): boolean {
  return role === "owner";
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer (read-only)",
};
