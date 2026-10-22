import { PageHeader } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { REGIONS, type Profile } from "@/lib/types";
import { createUserAccount, resetPassword, updateUser } from "../actions";

const ROLES = ["facilitator", "grader", "admin", "leader"] as const;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { supabase } = await requireRole("admin");
  const { created, reset, error } = await searchParams;
  const { data: users } = await supabase.from("profiles").select("*").order("role").order("full_name").returns<Profile[]>();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Users" sub="Everyone who can sign in, and their role." />
      {typeof created === "string" && (
        <p className="text-sm text-ok">Account created for {created}. Give them their email and starting password.</p>
      )}
      {reset && <p className="text-sm text-ok">Password updated.</p>}
      {typeof error === "string" && <p className="text-sm text-danger">{error}</p>}

      <form action={createUserAccount} className="card grid gap-3 sm:grid-cols-3 sm:items-end lg:grid-cols-6">
        <h2 className="h2 sm:col-span-3 lg:col-span-6">Create an account</h2>
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
        <label><span className="label">Starting password</span><input name="password" type="text" minLength={8} required className="input" autoComplete="off" /></label>
        <button className="btn btn-primary">Create account</button>
        <p className="muted sm:col-span-3 lg:col-span-6">
          No email is sent: give the person their email and starting password yourself. People can also create their own account on the
          login page; they start as facilitators. Change roles below. Limit sign-ups to work emails in Settings.
        </p>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Region</th><th /><th>Reset password</th></tr></thead>
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
                <td>
                  <form action={resetPassword.bind(null, u.id)} className="flex gap-1">
                    <input name="password" type="text" minLength={8} required placeholder="New password" className="input w-36" autoComplete="off" />
                    <button className="btn">Set</button>
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
