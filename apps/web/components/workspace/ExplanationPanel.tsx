"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { CodeBlock, ExplanationBlock } from "./WorkspaceShell";

interface Props {
    blocks: CodeBlock[];
    explanations: ExplanationBlock[];
    activeBlockId: string | null;
    onBlockHover: (id: string) => void;
    onTextSelect: (text: string) => void;
    onOpenChat: (text: string) => void;
    onExplanationsReady: (explanations: ExplanationBlock[]) => void;
    owner: string;
    repo: string;
}

interface GraphNode {
    id: string;
    label?: string;
    source_file?: string;
    source_location?: string;
}

interface GraphEdge {
    source: string;
    target: string;
    relation?: string;
    source_file?: string;
}

interface ConnectedFile {
    file_path: string;
    snippet: string;
    relation: string;
}

type CardStatus = "loading" | "streaming" | "done" | "error";

const SNIPPET_WINDOW = 8;

function lineNum(loc?: string): number {
    if (!loc) return 0;
    return parseInt(loc.replace("L", ""), 10) || 0;
}

function extractSnippet(fileContent: string, centerLine: number): string {
    const lines = fileContent.split("\n");
    const start = Math.max(0, centerLine - SNIPPET_WINDOW);
    const end = Math.min(lines.length, centerLine + SNIPPET_WINDOW);
    return lines.slice(start, end).join("\n");
}

function normalizePath(p?: string): string {
    if (!p) return "";
    return p.replace(/\\/g, "/").replace(/^temp_repos\/[^/]+\//, "");
}

function SkeletonCard() {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4 flex flex-col gap-3 animate-pulse">
            <div className="flex flex-col gap-2">
                <div className="h-3 rounded bg-[var(--bg-elevated)] w-full" />
                <div className="h-3 rounded bg-[var(--bg-elevated)] w-5/6" />
                <div className="h-3 rounded bg-[var(--bg-elevated)] w-4/6" />
                <div className="h-3 rounded bg-[var(--bg-elevated)] w-3/4" />
                <div className="h-3 rounded bg-[var(--bg-elevated)] w-2/3" />
            </div>
        </div>
    );
}

interface PopupPos { x: number; y: number; }

export default function ExplanationPanel({ blocks, onTextSelect, onOpenChat, onExplanationsReady, owner, repo }: Props) {
    const [status, setStatus] = useState<CardStatus>("loading");
    const [explanation, setExplanation] = useState("");
    const [currentFile, setCurrentFile] = useState("");
    const fetchedRef = useRef<string>("");
    const [popup, setPopup] = useState<PopupPos | null>(null);
    const pendingTextRef = useRef<string>("");

    useEffect(() => {
        if (blocks.length === 0) return;
        const block = blocks[0];
        const filePath = block.id;
        setCurrentFile(filePath);
        setPopup(null);
        pendingTextRef.current = "";

        // Check sessionStorage cache first
        const cacheKey = `explanations:${owner}/${repo}:${filePath}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            setExplanation(cached);
            setStatus("done");
            onExplanationsReady([{ blockId: filePath, explanation: cached }]);
            return;
        }

        if (fetchedRef.current === filePath) return;
        fetchedRef.current = filePath;

        setStatus("loading");
        setExplanation("");

        // Build cross-file context from graph
        const raw = sessionStorage.getItem(`graph:${owner}/${repo}`);
        const graph: { nodes: GraphNode[]; edges: GraphEdge[] } = raw
            ? JSON.parse(raw)
            : { nodes: [], edges: [] };
        const nodes = graph.nodes ?? [];
        const edges = graph.edges ?? [];

        const nodeFileMap = new Map<string, string | undefined>();
        nodes.forEach((n) => nodeFileMap.set(n.id, normalizePath(n.source_file)));

        const calleeEdges = edges.filter(
            (e) =>
                normalizePath(e.source_file) === filePath &&
                e.relation === "calls" &&
                nodeFileMap.get(e.target) &&
                nodeFileMap.get(e.target) !== filePath
        );

        const nodesInThisFile = new Set(
            nodes.filter((n) => normalizePath(n.source_file) === filePath).map((n) => n.id)
        );
        const callerEdges = edges.filter(
            (e) =>
                e.relation === "calls" &&
                normalizePath(e.source_file) !== filePath &&
                e.source_file &&
                nodesInThisFile.has(e.target)
        );

        const importEdges = edges.filter(
            (e) =>
                normalizePath(e.source_file) === filePath &&
                e.relation === "imports_from" &&
                nodeFileMap.get(e.target) &&
                nodeFileMap.get(e.target) !== filePath
        );

        type Candidate = { filePath: string; line: number; relation: string };
        const candidates: Candidate[] = [];
        const seen = new Set<string>();

        function addCandidates(edgeList: GraphEdge[], relation: string, useTarget: boolean) {
            for (const e of edgeList) {
                const refId = useTarget ? e.target : e.source;
                const f = nodeFileMap.get(refId);
                if (!f || f === filePath || seen.has(f)) continue;
                const node = nodes.find((n) => n.id === refId);
                candidates.push({ filePath: f, line: lineNum(node?.source_location), relation });
                seen.add(f);
                if (candidates.length >= 5) return;
            }
        }

        addCandidates(calleeEdges, "calls", true);
        if (candidates.length < 5) addCandidates(callerEdges, "called_by", false);
        if (candidates.length < 5) addCandidates(importEdges, "imports", true);

        async function fetchFileContent(path: string): Promise<string | null> {
            const fileCacheKey = `filecontent:${owner}/${repo}:${path}`;
            const cachedFile = sessionStorage.getItem(fileCacheKey);
            if (cachedFile) return cachedFile;
            try {
                const res = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
                    { headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_GITHUB_TOKEN}` } }
                );
                if (!res.ok) return null;
                const data = await res.json();
                const decoded = atob(data.content.replace(/\n/g, ""));
                sessionStorage.setItem(fileCacheKey, decoded);
                return decoded;
            } catch {
                return null;
            }
        }

        async function run() {
            // Fetch connected file snippets
            const results = await Promise.all(
                candidates.map(async (c) => {
                    const content = await fetchFileContent(c.filePath);
                    if (!content) return null;
                    return {
                        file_path: c.filePath,
                        snippet: extractSnippet(content, c.line),
                        relation: c.relation,
                    };
                })
            );
            const connected_files: ConnectedFile[] = results.filter((r): r is ConnectedFile => r !== null);

            // Get auth token
            const { createClient } = await import("@/lib/supabase/client");
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { setStatus("error"); return; }

            const repositoryId = (() => {
                const g = sessionStorage.getItem(`graph:${owner}/${repo}`);
                return g ? JSON.parse(g).job_id : "";
            })();

            const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

            try {
                const res = await fetch(`${apiUrl}/api/explain`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        code: block.code,
                        language: block.language,
                        file_path: filePath,
                        repository_id: repositoryId,
                        connected_files,
                    }),
                });

                if (!res.ok || !res.body) { setStatus("error"); return; }

                setStatus("streaming");
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
                            if (parsed.error) { setStatus("error"); return; }
                            // Cache hit — backend sends full text in one chunk
                            if (parsed.cached) continue;
                            if (parsed.text) {
                                accumulated += parsed.text;
                                setExplanation(accumulated);
                            }
                        } catch {
                            continue;
                        }
                    }
                }

                if (accumulated) {
                    sessionStorage.setItem(cacheKey, accumulated);
                    setStatus("done");
                    onExplanationsReady([{ blockId: filePath, explanation: accumulated }]);
                } else {
                    setStatus("error");
                }
            } catch {
                setStatus("error");
            }
        }

        run();
    }, [blocks]);

    function handleMouseUp(e: React.MouseEvent) {
        const selection = window.getSelection()?.toString().trim();
        if (selection && selection.length > 0) {
            pendingTextRef.current = selection;
            onTextSelect(selection);
            setPopup({ x: e.clientX, y: e.clientY });
        } else {
            setPopup(null);
            pendingTextRef.current = "";
        }
    }

    function handleAskAI() {
        if (pendingTextRef.current) {
            onOpenChat(pendingTextRef.current);
        }
        setPopup(null);
    }

    function handleMouseDown() {
        setPopup(null);
    }

    if (blocks.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                Select a file to see explanations
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden relative" onMouseDown={handleMouseDown}>
            <div className="shrink-0 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-base)]">
                <p className="text-xs font-mono text-[var(--text-muted)] truncate">📄 {currentFile}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
                {status === "loading" && <SkeletonCard />}
                {status === "error" && (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                        <p className="text-[var(--error)] text-xs">Failed to load explanation. Try selecting the file again.</p>
                    </div>
                )}
                {(status === "streaming" || status === "done") && (
                    <div
                        onMouseUp={handleMouseUp}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4 prose prose-sm max-w-none text-[var(--text-secondary)] text-sm leading-relaxed [&>p]:mb-3 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ul]:pl-4 [&>li]:mb-0.5 [&>code]:font-mono [&>code]:text-xs [&>code]:bg-[var(--bg-elevated)] [&>code]:px-1 [&>code]:rounded"
                    >
                        <ReactMarkdown>{explanation}</ReactMarkdown>
                        {status === "streaming" && (
                            <span className="inline-block w-0.5 h-3.5 bg-[var(--text-muted)] ml-0.5 animate-pulse" />
                        )}
                    </div>
                )}
            </div>

            {popup && (
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleAskAI}
                    style={{ position: "fixed", top: popup.y - 40, left: popup.x - 40 }}
                    className="z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--bg-base)] text-xs font-medium shadow-lg hover:bg-[var(--accent-hover)] transition-colors"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    Ask AI
                </button>
            )}
        </div>
    );
}