"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      if (!session) {
        throw new Error("You must be logged in.");
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
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
    <main className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] px-4">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold text-[var(--text-primary)]">InlineExplainer</h1>
          <p className="text-[var(--text-secondary)]">Paste any public repository URL to get structural, inline explanations anchored directly to the code.</p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
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
    </main>
  );
}