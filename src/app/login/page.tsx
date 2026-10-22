import { LoginForm } from "./LoginForm";
import { signInWithMicrosoft } from "./actions";

const ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Sign in with your email and password.",
  sso: "Microsoft sign-in is not available right now.",
  "no-profile": "Your account is not set up yet. Try signing in again, or contact the certification admin.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const microsoft = process.env.NEXT_PUBLIC_AZURE_SSO_ENABLED === "true";
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="h1">TMU Facilitator Certification</h1>
      <p className="muted mt-1 mb-6">Sign in, or create an account if this is your first time.</p>
      <div className="card space-y-4">
        {typeof error === "string" && ERRORS[error] && <p className="text-sm text-danger">{ERRORS[error]}</p>}
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
    </main>
  );
}
