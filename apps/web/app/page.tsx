"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SUPPORTED_HOSTS = ["github.com", "gitlab.com", "bitbucket.org"];

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace("www.", "");
    if (!SUPPORTED_HOSTS.includes(host)) return null;
    const parts = parsed.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

export default function LandingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    setError("");
    const parsed = parseRepoUrl(url);
    if (!parsed) {
      setError("Enter a valid GitHub, GitLab, or Bitbucket repository URL.");
      return;
    }
    router.push(`/${parsed.owner}/${parsed.repo}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] px-4">
      <div className="w-full max-w-2xl flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold text-[var(--text-primary)]">InlineExplainer</h1>
          <p className="text-[var(--text-secondary)]">
            Paste any public repository URL to get structural,
            inline explanations anchored directly to the code.
          </p>
        </div>

        {/* Input */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://github.com/owner/repo"
              className="flex-1 px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--text-secondary)] transition-colors"
            />
            <button
              onClick={handleSubmit}
              className="px-6 py-3 bg-[var(--accent)] text-[var(--bg-base)] font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap"
            >
              Explain →
            </button>
          </div>
          {error && (
            <p className="text-[var(--error)] text-sm">{error}</p>
          )}
        </div>

        {/* Supported hosts */}
        <p className="text-[var(--text-muted)] text-sm">
          Supports GitHub, GitLab, and Bitbucket public repositories.
        </p>

      </div>
    </main>
  );
}