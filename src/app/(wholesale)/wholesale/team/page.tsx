"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionStore } from "@/lib/stores/session-store";
import { useTeamStore, type TeamRole } from "@/lib/stores/team-store";

const ROLES: TeamRole[] = ["Admin", "Purchaser", "Viewer"];

export default function TeamPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const members = useTeamStore((s) => s.members);
  const invite = useTeamStore((s) => s.invite);
  const remove = useTeamStore((s) => s.remove);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("Purchaser");

  if (!user || user.role !== "wholesale") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <p className="text-slate-500">You&apos;re not signed in.</p>
        <Button variant="wholesale" className="mt-4" onClick={() => router.push("/wholesale/login")}>
          Sign in
        </Button>
      </div>
    );
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) {
      toast.error("Enter a name and email");
      return;
    }
    invite({ name, email, role });
    toast.success(`Invite sent to ${email}`);
    setName("");
    setEmail("");
    setRole("Purchaser");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Team Members</h1>
      <p className="mt-1 text-sm text-slate-500">
        Give colleagues access to place orders and view pricing under {user.businessName ?? "your business"}.
      </p>

      <form onSubmit={handleInvite} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-5">
        <div className="min-w-40 flex-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="min-w-40 flex-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as TeamRole)}
            className="h-10 rounded-md border border-slate-300 px-2 text-sm focus:border-blue-600 focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="wholesale">
          <UserPlus className="mr-1.5 h-4 w-4" /> Invite
        </Button>
      </form>

      {members.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No team members invited yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-slate-800">{m.name}</td>
                  <td className="px-4 py-3 text-slate-600">{m.email}</td>
                  <td className="px-4 py-3 text-slate-600">{m.role}</td>
                  <td className="px-4 py-3">
                    <Badge variant={m.status === "Active" ? "success" : "outline"}>{m.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
