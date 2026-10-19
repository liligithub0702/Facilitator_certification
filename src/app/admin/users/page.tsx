import { requireRole } from "@/lib/auth";
import { REGIONS, type Profile } from "@/lib/types";
import { inviteUser, updateUser } from "../actions";

const ROLES = ["facilitator", "grader", "admin", "leader"] as const;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { supabase } = await requireRole("admin");
  const { invited, error } = await searchParams;
  const { data: users } = await supabase.from("profiles").select("*").order("role").order("full_name").returns<Profile[]>();

  return (
    <div className="space-y-6">
      <h1 className="h1">Users</h1>
      {typeof invited === "string" && <p className="text-sm text-ok">Invite sent to {invited}.</p>}
      {typeof error === "string" && <p className="text-sm text-danger">{error}</p>}

      <form action={inviteUser} className="card grid gap-3 sm:grid-cols-5 sm:items-end">
        <h2 className="h2 sm:col-span-5">Invite someone</h2>
        <label><span className="label">Email</span><input name="email" type="email" required className="input" /></label>
        <label><span className="label">Name</span><input name="full_name" className="input" /></label>
        <label>
          <span className="label">Role</span>
          <select name="role" className="input" defaultValue="facilitator">{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <label>
          <span className="label">Region</span>
          <select name="region" className="input"><option value="">—</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <button className="btn btn-primary">Send invite</button>
        <p className="muted sm:col-span-5">The app is invite-only: sign-ups are disabled, and the login page only sends links to existing accounts.</p>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Region</th><th /></tr></thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td colSpan={4}>
                  <form action={updateUser.bind(null, u.id)} className="grid grid-cols-4 gap-2">
                    <input name="full_name" defaultValue={u.full_name ?? ""} className="input" />
                    <select name="role" defaultValue={u.role} className="input">{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                    <select name="region" defaultValue={u.region ?? ""} className="input">
                      <option value="">—</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <button className="btn">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
