"use client";

/**
 * Members settings section.
 *
 * Lists current workspace members with role and remove button.
 * Shows pending invites with revoke capability.
 * Provides an invite form (email + role).
 */

import { useState, useTransition } from "react";
import {
  inviteMemberAction,
  revokeInviteAction,
  removeMemberAction,
  changeMemberRoleAction,
} from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Users, UserMinus, Mail } from "lucide-react";

export type MemberRow = {
  profileId: string;
  email: string;
  fullName: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  acceptedAt: string;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  expiresAt: string;
};

type Props = {
  members: MemberRow[];
  pendingInvites: PendingInvite[];
  currentProfileId: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLE_BADGE_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "muted" | "danger"
> = {
  owner: "success",
  admin: "default",
  member: "muted",
  viewer: "muted",
};

export function MembersSection({
  members: initialMembers,
  pendingInvites: initialInvites,
  currentProfileId,
}: Props) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [invites, setInvites] = useState<PendingInvite[]>(initialInvites);
  const [isPending, startTransition] = useTransition();

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);

  // Confirm remove state
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Role change state
  const [roleError, setRoleError] = useState<string | null>(null);

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteError(null);
    setInviteSent(false);
    const fd = new FormData();
    fd.set("email", inviteEmail.trim());
    fd.set("role", inviteRole);
    startTransition(async () => {
      try {
        await inviteMemberAction(fd);
        setInviteEmail("");
        setInviteSent(true);
      } catch (err) {
        setInviteError((err as Error).message);
      }
    });
  }

  function handleRevoke(inviteId: string) {
    const fd = new FormData();
    fd.set("inviteId", inviteId);
    startTransition(async () => {
      try {
        await revokeInviteAction(fd);
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      } catch {
        // noop — invite list will be stale until page refresh
      }
    });
  }

  function handleRemove(profileId: string) {
    setRemoveError(null);
    const fd = new FormData();
    fd.set("profileId", profileId);
    startTransition(async () => {
      try {
        await removeMemberAction(fd);
        setMembers((prev) => prev.filter((m) => m.profileId !== profileId));
        setConfirmRemoveId(null);
      } catch (err) {
        setRemoveError((err as Error).message);
        setConfirmRemoveId(null);
      }
    });
  }

  function handleRoleChange(profileId: string, newRole: string) {
    setRoleError(null);
    const fd = new FormData();
    fd.set("profileId", profileId);
    fd.set("role", newRole);
    startTransition(async () => {
      try {
        await changeMemberRoleAction(fd);
        setMembers((prev) =>
          prev.map((m) =>
            m.profileId === profileId
              ? { ...m, role: newRole as MemberRow["role"] }
              : m
          )
        );
      } catch (err) {
        setRoleError((err as Error).message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            <Users aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle>Members</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Manage who has access to this workspace. Only owners and admins can
              invite new members.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardBody>
        {/* Current members */}
        <ul className="divide-y divide-[var(--color-border)]">
          {members.map((m) => (
            <li
              key={m.profileId}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {m.fullName ?? m.email}
                  </span>
                  <Badge variant={ROLE_BADGE_VARIANT[m.role] ?? "muted"}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </Badge>
                  {m.profileId === currentProfileId && (
                    <span className="text-[11px] text-[var(--color-text-subtle)]">
                      (you)
                    </span>
                  )}
                </div>
                {m.fullName && (
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {m.email}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* Role selector — cannot change own role or owner's role */}
                {m.profileId !== currentProfileId && m.role !== "owner" && (
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.profileId, e.target.value)}
                    disabled={isPending}
                    className="h-7 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                )}

                {/* Remove button — cannot remove yourself if owner, cannot remove owner */}
                {m.role !== "owner" && m.profileId !== currentProfileId && (
                  confirmRemoveId === m.profileId ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--color-text-muted)]">
                        Remove?
                      </span>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemove(m.profileId)}
                        disabled={isPending}
                      >
                        Yes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmRemoveId(null)}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemoveId(m.profileId)}
                      disabled={isPending}
                    >
                      <UserMinus aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>

        {removeError && (
          <p className="mt-2 text-xs text-[var(--color-danger-500)]">{removeError}</p>
        )}
        {roleError && (
          <p className="mt-2 text-xs text-[var(--color-danger-500)]">{roleError}</p>
        )}

        {/* Pending invites */}
        {invites.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">
              Pending invites
            </h3>
            <ul className="divide-y divide-[var(--color-border)]">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Mail
                        aria-hidden
                        className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-subtle)]"
                      />
                      <span className="text-sm text-[var(--color-text)]">
                        {inv.email}
                      </span>
                      <Badge variant={ROLE_BADGE_VARIANT[inv.role] ?? "muted"}>
                        {ROLE_LABELS[inv.role] ?? inv.role}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(inv.id)}
                    disabled={isPending}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Invite form */}
        <div className="mt-6 border-t border-[var(--color-border)] pt-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">
            Invite a team member
          </h3>
          <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3">
            <Field label="Email address" className="min-w-[200px] flex-1">
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Role" className="w-36">
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "admin" | "member" | "viewer")
                }
                className="h-8 w-full rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </Field>
            <div className="pb-0.5">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isPending || !inviteEmail.trim()}
              >
                {isPending ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </form>
          {inviteError && (
            <p className="mt-2 text-xs text-[var(--color-danger-500)]">{inviteError}</p>
          )}
          {inviteSent && (
            <p className="mt-2 text-xs text-[var(--color-success-600)]">
              Invite sent successfully.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
