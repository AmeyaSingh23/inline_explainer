"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChatMessage } from "@/types";

export type ModelTier = "fast" | "smart";

export function useChatSession(
    open: boolean,
    selectedText: string,
    filePath: string,
    fileCode: string,
    fileExplanation: string,
    repoFileTree: string[],
    repositoryId: string
) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [errorBanner, setErrorBanner] = useState("");
    const [modelTier, setModelTier] = useState<ModelTier>("fast");
    const [modelUsed, setModelUsed] = useState("");
    const [loadingSession, setLoadingSession] = useState(false);
    const loadedFileRef = useRef<string | null>(null);

    // Load chat history when file changes (filePath="" is valid for repo-level chat)
    useEffect(() => {
        if (!open || !repositoryId) return;
        if (loadedFileRef.current === filePath) return;
        loadedFileRef.current = filePath;

        setMessages([]);
        setInput("");
        setErrorBanner("");
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

                let history: ChatMessage[] = data.messages || [];
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

    async function sendMessage(userContent: string) {
        if (!userContent.trim() || loading) return;

        const newMessages: ChatMessage[] = [...messages, { role: "user", content: userContent }];
        setMessages(newMessages);
        setInput("");
        setLoading(true);
        setModelUsed("");
        setErrorBanner("");

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

            if (!res.ok) {
                let errorMsg = "Something went wrong. Please try again.";
                if (res.status === 429) {
                    try {
                        const errData = await res.json();
                        errorMsg = errData.detail || "Rate limit exceeded. Please wait a moment and try again.";
                    } catch {
                        errorMsg = "Rate limit exceeded. Please wait a moment and try again.";
                    }
                }
                throw new Error(errorMsg);
            }

            if (!res.body) throw new Error("Something went wrong. Please try again");

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

        } catch (err: any) {
            setMessages(messages);
            setInput(userContent);
            setErrorBanner(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return {
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
    };
}

export type ChatSession = ReturnType<typeof useChatSession>;
