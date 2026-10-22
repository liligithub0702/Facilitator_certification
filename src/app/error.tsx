"use client";

import { useEffect } from "react";

// Shown instead of a blank or frozen page when something fails, so people know what to do.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message = error instanceof Error ? error.message : String(error);
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest) : null;
  const staleVersion = /server action|failed to find|deployment/i.test(message);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
      <div className="card space-y-3">
        <h1 className="h2">Something went wrong</h1>
        <p className="text-sm">
          {staleVersion
            ? "The app was updated while this page was open. Reload the page and try again."
            : "That action did not complete. Reload the page and try again. If it keeps happening, send the details below to the admin."}
        </p>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button>
          <button className="btn" onClick={() => retry()}>Try again</button>
        </div>
        <p className="muted break-words font-mono text-xs">
          {message}
          {digest && digest !== "undefined" ? ` · ref ${digest}` : ""}
        </p>
      </div>
    </main>
  );
}
