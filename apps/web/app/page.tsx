"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const SUPPORTED_HOSTS = ["github.com", "gitlab.com", "bitbucket.org"];

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace("www.", "");
    if (!SUPPORTED_HOSTS.includes(host)) return null;
    const parts = parsed.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch { return null; }
}

export default function LandingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  async function handleSubmit() {
    setError("");
    const parsed = parseRepoUrl(url.trim());
    if (!parsed) { setError("Enter a valid GitHub, GitLab, or Bitbucket repository URL."); return; }
    setLoading(true);
    setStatusMsg("Checking for cached analysis...");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be logged in.");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
      const res = await fetch(`${apiUrl}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ repo_url: url.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail ?? `Server error (${res.status})`);
      }
      const data = await res.json();
      setStatusMsg(data.cached ? "Loaded from cache! Opening workspace..." : "Done! Opening workspace...");
      sessionStorage.setItem(
        `graph:${parsed.owner}/${parsed.repo}`,
        JSON.stringify({ job_id: data.job_id, nodes: data.nodes, edges: data.edges })
      );
      router.push(`/${parsed.owner}/${parsed.repo}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setLoading(false);
      setStatusMsg("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] px-4 py-12 relative">
      {/* Profile Navigation */}
      <div className="fixed top-3 right-[52px] z-50">
        <Link
          href="/profile"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors text-xs font-medium"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          Profile
        </Link>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-8 flex-1 items-center justify-center">
        <div className="w-full flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold text-[var(--text-primary)]">InlineExplainer</h1>
            <p className="text-[var(--text-secondary)]">Paste any public repository URL to get structural, inline explanations anchored directly to the code.</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={handleKeyDown} disabled={loading}
                placeholder="https://github.com/owner/repo"
                className="flex-1 px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--text-secondary)] transition-colors disabled:opacity-50"
              />
              <button onClick={handleSubmit} disabled={loading}
                className="px-6 py-3 bg-[var(--accent)] text-[var(--bg-base)] font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? "Analyzing..." : "Explain →"}
              </button>
            </div>
            {loading && statusMsg && <p className="text-[var(--text-muted)] text-sm">{statusMsg}</p>}
            {error && <p className="text-[var(--error)] text-sm">{error}</p>}
          </div>
          <p className="text-[var(--text-muted)] text-sm">Supports GitHub, GitLab, and Bitbucket public repositories up to 50 MB.</p>
        </div>
      </div>

      <footer className="w-full max-w-2xl flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 mt-8 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[var(--text-primary)] transition-colors">
            Terms
          </Link>
          <a
            href="mailto:ameyasingh619@gmail.com"
            className="hover:text-[var(--text-primary)] transition-colors"
          >
            Contact
          </a>
        </div>

        <a
          href="https://github.com/AmeyaSingh23/inline_explainer"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View InlineExplainer on GitHub"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
      </svg>
    </a>
      </footer >
    </main >
  );
}