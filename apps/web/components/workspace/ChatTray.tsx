"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/client";

interface Props {
    open: boolean;
    onClose: () => void;
    selectedText: string;
    filePath: string;
    fileCode: string;
    fileExplanation: string;
    repoFileTree: string[];
    repositoryId: string;
    owner: string;
    repo: string;
}

interface Message {
    role: "user" | "assistant" | "context";
    content: string;
}

type ModelTier = "fast" | "smart";

const MODEL_LABELS: Record<ModelTier, { label: string; sublabel: string }> = {
    fast: { label: "Fast", sublabel: "Llama 70B / Flash" },
    smart: { label: "Smart", sublabel: "Llama 70B+ / Pro" },
};

export default function ChatTray({ open, onClose, selectedText, filePath, fileCode, fileExplanation, repoFileTree, repositoryId, owner, repo }: Props) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [modelTier, setModelTier] = useState<ModelTier>("fast");
    const [modelUsed, setModelUsed] = useState("");
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [loadingSession, setLoadingSession] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const loadedFileRef = useRef<string>("");

    // Load chat history when file changes
    useEffect(() => {
        if (!open || !filePath || !repositoryId) return;
        if (loadedFileRef.current === filePath) return;
        loadedFileRef.current = filePath;

        setMessages([]);
        setInput("");
        setModelUsed("");
        setLoadingSession(true);

        async function loadSession() {
            try {
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
                const res = await fetch(
                    `${apiUrl}/api/chat/session?repository_id=${encodeURIComponent(repositoryId)}&file_path=${encodeURIComponent(filePath)}`,
                    { headers: { Authorization: `Bearer ${session.access_token}` } }
                );
                if (!res.ok) return;
                const data = await res.json();

                let history: Message[] = data.messages || [];
                if (selectedText) {
                    const lastMsg = history[history.length - 1];
                    if (!lastMsg || lastMsg.role !== "context" || lastMsg.content !== selectedText) {
                        history = [...history, { role: "context", content: selectedText }];
                    }
                }
                setMessages(history);
            } catch {
                if (selectedText) {
                    setMessages([{ role: "context", content: selectedText }]);
                }
            } finally {
                setLoadingSession(false);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        }

        loadSession();
    }, [open, filePath, repositoryId]);

    // Append new context card when selectedText changes while tray is open
    useEffect(() => {
        if (!open || !selectedText || loadingSession) return;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === "context" && lastMsg.content === selectedText) return;
        setMessages((prev) => [...prev, { role: "context", content: selectedText }]);
    }, [selectedText, open, loadingSession]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    async function sendMessage(userContent: string) {
        if (!userContent.trim() || loading) return;

        const newMessages: Message[] = [...messages, { role: "user", content: userContent }];
        setMessages(newMessages);
        setInput("");
        setLoading(true);
        setModelUsed("");

        // Add empty assistant message to stream into
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");

            const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
            const res = await fetch(`${apiUrl}/api/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    messages: newMessages,
                    file_path: filePath,
                    file_code: fileCode,
                    file_explanation: fileExplanation,
                    selected_text: selectedText,
                    model_tier: modelTier,
                    repo_file_tree: repoFileTree,
                    repository_id: repositoryId,
                }),
            });

            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = line.slice(6);
                    if (data === "[DONE]") break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) throw new Error(parsed.error);
                        if (parsed.text) {
                            accumulated += parsed.text;
                            // Stream into the last assistant message
                            setMessages((prev) => {
                                const updated = [...prev];
                                updated[updated.length - 1] = { role: "assistant", content: accumulated };
                                return updated;
                            });
                        }
                        if (parsed.model_used) setModelUsed(parsed.model_used);
                    } catch {
                        continue;
                    }
                }
            }

            // Set model label — backend doesn't stream model_used, infer from tier
            setModelUsed(modelTier === "fast" ? "gemini-2.5-flash" : "gemini-2.5-pro");

        } catch {
            setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." };
                return updated;
            });
        } finally {
            setLoading(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    }

    if (!open) return null;

    return (
        <div className="h-full w-full bg-[var(--bg-surface)] flex flex-col border-l border-[var(--border)] min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--border)] shrink-0">
                <span className="text-[var(--text-primary)] text-sm font-medium">Deep Dive</span>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button
                            onClick={() => setShowModelMenu((v) => !v)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                        >
                            <span>{MODEL_LABELS[modelTier].label}</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                        {showModelMenu && (
                            <div className="absolute right-0 top-8 z-50 w-40 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg overflow-hidden">
                                {(["fast", "smart"] as ModelTier[]).map((tier) => (
                                    <button
                                        key={tier}
                                        onClick={() => { setModelTier(tier); setShowModelMenu(false); }}
                                        className={`w-full text-left px-3 py-2.5 flex flex-col gap-0.5 transition-colors ${modelTier === tier ? "bg-[var(--bg-overlay)]" : "hover:bg-[var(--bg-overlay)]"}`}
                                    >
                                        <span className="text-xs font-medium text-[var(--text-primary)]">{MODEL_LABELS[tier].label}</span>
                                        <span className="text-[10px] text-[var(--text-muted)]">{MODEL_LABELS[tier].sublabel}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 flex flex-col gap-3 min-w-0">
                {loadingSession && (
                    <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-xs">
                        Loading conversation...
                    </div>
                )}
                {!loadingSession && messages.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-xs text-center px-4">
                        Ask anything about the selected passage or this file.
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col gap-1 min-w-0 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                        {msg.role === "context" ? (
                            <div className="w-full flex flex-col gap-1.5 my-1 shrink-0">
                                <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                    </svg>
                                    Asking about code passage
                                </div>
                                <div className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre leading-relaxed">
                                    {msg.content}
                                </div>
                            </div>
                        ) : msg.role === "user" ? (
                            <div className="max-w-[85%] px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-base)] text-xs leading-relaxed break-words">
                                {msg.content}
                            </div>
                        ) : (
                            <div className="w-full min-w-0 text-xs text-[var(--text-secondary)] leading-relaxed prose prose-sm max-w-none overflow-x-hidden [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ul]:pl-4 [&>code]:font-mono [&>code]:text-xs [&>code]:bg-[var(--bg-elevated)] [&>code]:px-1 [&>code]:rounded [&>pre]:overflow-x-auto [&>pre]:max-w-full">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                {loading && i === messages.length - 1 && (
                                    <span className="inline-block w-0.5 h-3 bg-[var(--text-muted)] ml-0.5 animate-pulse" />
                                )}
                            </div>
                        )}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Model used label */}
            {modelUsed && (
                <div className="px-4 py-1 shrink-0 border-t border-[var(--border-subtle)]">
                    <p className="text-[10px] text-[var(--text-muted)]">via {modelUsed}</p>
                </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
                <div className="flex items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 focus-within:border-[var(--text-muted)] transition-colors">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question... (Enter to send)"
                        rows={1}
                        disabled={loading}
                        className="flex-1 resize-none bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none leading-relaxed max-h-32 overflow-y-auto min-w-0 disabled:opacity-50"
                        style={{ fieldSizing: "content" } as React.CSSProperties}
                    />
                    <button
                        onClick={() => sendMessage(input)}
                        disabled={!input.trim() || loading}
                        className="shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}