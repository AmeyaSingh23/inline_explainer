"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Repository {
    id: string;
    repo_url: string;
    repo_name: string;
    created_at: string;
    processing_status: string;
}

interface UserProfile {
    id: string;
    username: string;
    github_id: string;
    created_at: string;
}

type DeleteStep = "idle" | "confirm" | "deleting" | "done";

export default function ProfilePage() {
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [repos, setRepos] = useState<Repository[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Delete flow
    const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");
    const [deleteInput, setDeleteInput] = useState("");
    const [deleteError, setDeleteError] = useState("");

    useEffect(() => {
        async function load() {
            try {
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) { router.push("/login"); return; }

                const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
                const res = await fetch(`${apiUrl}/api/user/repositories`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (!res.ok) throw new Error(`Server error (${res.status})`);
                const data = await res.json();
                setProfile(data.profile);
                setRepos(data.repositories);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to load profile.");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [router]);

    async function handleDeleteAccount() {
        if (!profile) return;
        if (deleteInput.trim() !== profile.username) {
            setDeleteError("Username doesn't match. Try again.");
            return;
        }
        setDeleteError("");
        setDeleteStep("deleting");
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated.");

            const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
            const res = await fetch(`${apiUrl}/api/user`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.detail ?? `Server error (${res.status})`);
            }

            await supabase.auth.signOut();
            setDeleteStep("done");
            setTimeout(() => router.push("/"), 2000);
        } catch (e: unknown) {
            setDeleteError(e instanceof Error ? e.message : "Failed to delete account.");
            setDeleteStep("confirm");
        }
    }

    async function handleSignOut() {
        try {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.push("/login");
        } catch (e) {
            console.error("Failed to sign out:", e);
        }
    }

    function parseRepoToPath(repoName: string): string {
        // repo_name is stored as "owner/repo"
        return `/${repoName}`;
    }

    function formatDate(iso: string): string {
        return new Date(iso).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric",
        });
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
                <p className="text-[var(--text-muted)] text-sm">Loading profile...</p>
            </main>
        );
    }

    if (error) {
        return (
            <main className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-4">
                <div className="flex flex-col gap-3 items-center">
                    <p className="text-[var(--error)] text-sm">{error}</p>
                    <Link href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                        ← Back to home
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[var(--bg-base)] px-4 py-12">
            <div className="max-w-2xl mx-auto flex flex-col gap-10">

                {/* Header */}
                <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                        <Link href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                            ← Back to InlineExplainer
                        </Link>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-2">
                            @{profile?.username}
                        </h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Member since {profile ? formatDate(profile.created_at) : "—"}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <a
                            href={`https://github.com/${profile?.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors text-xs"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                            </svg>
                            View on GitHub
                        </a>
                        <button
                            onClick={handleSignOut}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors text-xs cursor-pointer"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            Sign Out
                        </button>
                    </div>
                </div>

                {/* Analysed Repositories */}
                <section className="flex flex-col gap-4">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                        Analysed Repositories
                    </h2>

                    {repos.length === 0 ? (
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-6 text-center">
                            <p className="text-[var(--text-muted)] text-sm">No repositories analysed yet.</p>
                            <Link
                                href="/"
                                className="inline-block mt-3 text-xs text-[var(--accent)] hover:underline"
                            >
                                Analyse your first repo →
                            </Link>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {repos.map((r) => (
                                <Link
                                    key={r.id}
                                    href={parseRepoToPath(r.repo_name)}
                                    className="group flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] hover:border-[var(--text-muted)] transition-colors"
                                >
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                            {r.repo_name}
                                        </span>
                                        <span className="text-xs text-[var(--text-muted)] truncate">
                                            {r.repo_url}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 ml-4">
                                        <span className="text-xs text-[var(--text-muted)]">
                                            {formatDate(r.created_at)}
                                        </span>
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors"
                                        >
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                {/* Danger Zone */}
                <section className="flex flex-col gap-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--error)]">
                        Danger Zone
                    </h2>

                    <div className="rounded-lg border border-[var(--error)]/30 bg-[var(--bg-surface)] p-5 flex flex-col gap-4">
                        {deleteStep === "done" ? (
                            <p className="text-sm text-[var(--text-secondary)]">
                                Account deleted. Redirecting you to the home page…
                            </p>
                        ) : deleteStep === "idle" ? (
                            <>
                                <div className="flex flex-col gap-1">
                                    <p className="text-sm font-medium text-[var(--text-primary)]">Delete account</p>
                                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                        Permanently deletes your account and all data — repositories, explanations, and chat history. This cannot be undone.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setDeleteStep("confirm")}
                                    className="self-start px-4 py-2 rounded-lg border border-[var(--error)]/50 text-[var(--error)] text-xs font-medium hover:bg-[var(--error)]/10 transition-colors"
                                >
                                    Delete my account
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="flex flex-col gap-1">
                                    <p className="text-sm font-medium text-[var(--text-primary)]">Are you sure?</p>
                                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                        Type your username <span className="font-mono text-[var(--text-primary)]">@{profile?.username}</span> to confirm. This will permanently delete everything.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <input
                                        type="text"
                                        value={deleteInput}
                                        onChange={(e) => { setDeleteInput(e.target.value); setDeleteError(""); }}
                                        placeholder={profile?.username ?? ""}
                                        disabled={deleteStep === "deleting"}
                                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--error)]/50 transition-colors disabled:opacity-50"
                                    />
                                    {deleteError && (
                                        <p className="text-xs text-[var(--error)]">{deleteError}</p>
                                    )}
                                    <div className="flex gap-2 mt-1">
                                        <button
                                            onClick={handleDeleteAccount}
                                            disabled={deleteStep === "deleting" || !deleteInput.trim()}
                                            className="px-4 py-2 rounded-lg bg-[var(--error)] text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {deleteStep === "deleting" ? "Deleting…" : "Confirm delete"}
                                        </button>
                                        <button
                                            onClick={() => { setDeleteStep("idle"); setDeleteInput(""); setDeleteError(""); }}
                                            disabled={deleteStep === "deleting"}
                                            className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-xs hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-40"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </section>

            </div>
        </main >
    );
}