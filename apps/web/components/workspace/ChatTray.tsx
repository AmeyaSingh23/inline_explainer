"use client";

import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ModelTier, ChatSession } from "../../hooks/useChatSession";

interface Props {
    open: boolean;
    onClose: () => void;
    chatSession: ChatSession;
}

const MODEL_LABELS: Record<ModelTier, { label: string; sublabel: string }> = {
    fast: { label: "Fast", sublabel: "Llama 70B / Flash" },
    smart: { label: "Smart", sublabel: "Llama 70B+ / Pro" },
};

export default function ChatTray({ open, onClose, chatSession }: Props) {
    const {
        messages,
        input,
        setInput,
        loading,
        errorBanner,
        setErrorBanner,
        modelTier,
        setModelTier,
        modelUsed,
        loadingSession,
        sendMessage,
    } = chatSession;

    const [showModelMenu, setShowModelMenu] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    useEffect(() => {
        if (!loadingSession && open) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [loadingSession, open]);

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
            <div className="px-4 py-3 border-t border-[var(--border)] shrink-0 flex flex-col gap-2">
                {errorBanner && (
                    <div className="flex items-start justify-between bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--error)] text-xs px-3 py-2 rounded-lg gap-2">
                        <span>{errorBanner}</span>
                        <button onClick={() => setErrorBanner("")} className="shrink-0 pt-0.5 hover:opacity-70 transition-opacity">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                )}
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