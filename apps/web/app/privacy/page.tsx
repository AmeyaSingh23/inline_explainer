import Link from "next/link";

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-[var(--bg-base)] px-4 py-16">
            <div className="max-w-2xl mx-auto flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                    <Link href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                        ← Back to InlineExplainer
                    </Link>
                    <h1 className="text-3xl font-bold text-[var(--text-primary)] mt-2">Privacy Policy</h1>
                    <p className="text-sm text-[var(--text-muted)]">Last updated: June 2026</p>
                </div>

                <div className="flex flex-col gap-6 text-[var(--text-secondary)] text-sm leading-relaxed">
                    <p>
                        InlineExplainer is a free, non-commercial student portfolio project. It is not a registered
                        business, does not run ads, and does not sell or share your data with advertisers or data
                        brokers. This page explains what information the app collects, why, and how it is used.
                    </p>

                    <section className="flex flex-col gap-2">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">1. Signing in with GitHub</h2>
                        <p>
                            When you log in, InlineExplainer uses GitHub OAuth (via Supabase Auth) to verify who you are.
                            This login step only requests two narrow pieces of information from GitHub: your public profile
                            (username, avatar) and your email address. InlineExplainer cannot see your private repositories,
                            cannot modify anything in your GitHub account, and cannot act on your behalf on GitHub through
                            this login. It is used purely to create your account and let you sign back in later.
                        </p>
                    </section>

                    <section className="flex flex-col gap-2">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">2. Reading repository code</h2>
                        <p>
                            Separately from login, InlineExplainer uses its own GitHub access token to read the file tree
                            and file contents of the <strong>public</strong> repository you choose to analyze. This token
                            is not tied to your personal GitHub account — it exists only so the app can fetch public code
                            from GitHub at a higher rate limit than an anonymous request would allow. It cannot access
                            private repositories, and it cannot make any changes to any repository on GitHub.
                        </p>
                    </section>

                    <section className="flex flex-col gap-2">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">3. What gets stored, and where</h2>
                        <p>InlineExplainer stores the following in its database (Supabase), tied to your account:</p>
                        <ul className="list-disc pl-5 flex flex-col gap-1">
                            <li>Your GitHub username and a generated account ID, so you can sign back in.</li>
                            <li>The URL and structural code graph (function/file relationships) of repositories you've analyzed, so the app doesn't need to re-clone and re-process them on your next visit.</li>
                            <li>AI-generated explanations of individual files, cached so they don't need to be regenerated every time you revisit a file.</li>
                            <li>Your chat conversations with the AI assistant ("Deep Dive"), stored per file so your conversation history is there when you come back.</li>
                        </ul>
                        <p>
                            Row-level security is enabled on every table, meaning the database itself enforces that you can
                            only ever read or write your own data — not any other user's.
                        </p>
                    </section>

                    <section className="flex flex-col gap-2">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">4. Sharing code with AI providers</h2>
                        <p>
                            To generate explanations and power the chat assistant, InlineExplainer sends the source code
                            you're viewing — along with small related snippets from connected files — to third-party AI
                            providers: NVIDIA NIM (Llama models) as the primary provider, and Google Gemini as a fallback
                            if NVIDIA is unavailable. This only happens for <strong>public</strong> repository code that you
                            chose to load into the app. These providers process the text to generate a response; InlineExplainer
                            does not control how long they may retain request data on their end, and you should refer to
                            NVIDIA's and Google's own privacy policies for details on their handling of API requests.
                        </p>
                    </section>

                    <section className="flex flex-col gap-2">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">5. Data retention and deletion</h2>
                        <p>
                            You can delete your account and all associated data — repositories, explanations, and chat
                            history — at any time from your{" "}
                            <Link href="/profile" className="text-[var(--text-primary)] underline hover:no-underline">
                                Profile page
                            </Link>
                            . The deletion is immediate and permanent; it cannot be undone. If you run into any issues
                            with account deletion, you can also reach out at{" "}
                            <a href="mailto:ameyasingh619@gmail.com" className="text-[var(--text-primary)] underline hover:no-underline">
                                ameyasingh619@gmail.com
                            </a>{" "}
                            and it will be handled manually.
                        </p>
                    </section>

                    <section className="flex flex-col gap-2">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">6. Contact</h2>
                        <p>
                            Questions about this policy or your data can be sent to{" "}
                            <a href="mailto:ameyasingh619@gmail.com" className="text-[var(--text-primary)] underline hover:no-underline">ameyasingh619@gmail.com</a>.
                        </p>
                    </section>
                </div>
            </div>
        </main>
    );
}