import { BrandMark } from "@/components/AppShell";
import { LoginForm } from "./LoginForm";
import { signInWithMicrosoft } from "./actions";

const ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Sign in with your email and password.",
  sso: "Microsoft sign-in is not available right now.",
  "no-profile": "Your account is not set up yet. Try signing in again, or contact the certification admin.",
};

// DesignX "gate": magenta and blue glows over the indigo gradient, white card in the middle.
const GATE =
  "bg-[radial-gradient(120%_130%_at_88%_8%,color-mix(in_srgb,var(--color-brand-magenta)_85%,transparent)_0%,transparent_46%),radial-gradient(120%_120%_at_12%_96%,color-mix(in_srgb,var(--color-brand-blue)_55%,transparent)_0%,transparent_50%),linear-gradient(135deg,var(--color-brand-indigo-soft)_0%,var(--color-brand-indigo)_42%,var(--color-brand-indigo-deep)_100%)]";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const microsoft = process.env.NEXT_PUBLIC_AZURE_SSO_ENABLED === "true";
  return (
    <main className={`grid min-h-screen flex-1 place-items-center p-6 ${GATE}`}>
      <div className="w-full max-w-[400px] rounded-[18px] bg-paper px-9 pt-10 pb-8 shadow-deep">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark className="size-10 text-lg" />
          <div>
            <p className="eyebrow">TMU · Q4 2026</p>
            <h1 className="text-xl font-extrabold tracking-tight text-ink">Facilitator Certification</h1>
          </div>
        </div>
        <p className="mb-5 text-sm text-brand-gray">Sign in, or create an account if this is your first time.</p>
        <div className="space-y-4">
          {typeof error === "string" && ERRORS[error] && (
            <p className="rounded-chip bg-danger-bg px-3 py-2 text-sm text-danger">{ERRORS[error]}</p>
          )}
          {microsoft && (
            <>
              <form action={signInWithMicrosoft}>
                <button className="btn w-full">Sign in with Microsoft</button>
              </form>
              <p className="muted text-center">or</p>
            </>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
