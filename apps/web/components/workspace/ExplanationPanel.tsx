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
    onExplanationsReady: (explanations: ExplanationBlock[]) => void;
    owner: string;
    repo: string;
}

interface CardState {
    blockId: string;
    status: "loading" | "done" | "error";
    explanation: string;
}

function SkeletonCard() {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4 flex flex-col gap-3 animate-pulse">
            <div className="h-16 rounded bg-[var(--bg-elevated)]" />
            <div className="flex flex-col gap-2 pt-1">
                <div className="h-3 rounded bg-[var(--bg-elevated)] w-full" />
                <div className="h-3 rounded bg-[var(--bg-elevated)] w-5/6" />
                <div className="h-3 rounded bg-[var(--bg-elevated)] w-4/6" />
            </div>
        </div>
    );
}

function ExplanationCard({
    block,
    card,
    onTextSelect,
}: {
    block: CodeBlock;
    card: CardState;
    isActive: boolean;
    onHover: (id: string) => void;
    onTextSelect: (text: string) => void;
}) {
    function handleMouseUp() {
        const selection = window.getSelection()?.toString().trim();
        if (selection) onTextSelect(selection);
    }

    return (
        <div
            onMouseUp={handleMouseUp}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]"
        >
            {/* Code snippet preview */}
            <div className="px-4 pt-4 pb-3">
                <div className="rounded-md bg-[var(--editor-bg)] px-3 py-2 overflow-x-auto">
                    <pre className="text-xs font-mono text-neutral-300 whitespace-pre leading-relaxed">
                        {block.code.split("\n").slice(0, 6).join("\n")}
                        {block.code.split("\n").length > 6 && (
                            <span className="text-neutral-600">{"\n"}...</span>
                        )}
                    </pre>
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--text-muted)] font-mono">
                    Lines {block.startLine + 1}–{block.endLine + 1}
                </p>
            </div>

            {/* Divider */}
            <div className="h-px bg-[var(--border)]" />

            {/* Explanation */}
            <div className="px-4 py-3">
                {card.status === "loading" && (
                    <div className="flex flex-col gap-2 animate-pulse">
                        <div className="h-3 rounded bg-[var(--bg-elevated)] w-full" />
                        <div className="h-3 rounded bg-[var(--bg-elevated)] w-5/6" />
                        <div className="h-3 rounded bg-[var(--bg-elevated)] w-4/6" />
                    </div>
                )}

                {card.status === "error" && (
                    <p className="text-[var(--error)] text-xs">
                        Failed to load explanation. Try selecting the file again.
                    </p>
                )}

                {card.status === "done" && (
                    <div className="prose prose-sm max-w-none text-[var(--text-secondary)] text-sm leading-relaxed
            [&>p]:mb-2 [&>p:last-child]:mb-0
            [&>ul]:mb-2 [&>ul]:pl-4 [&>li]:mb-0.5
            [&>code]:font-mono [&>code]:text-xs [&>code]:bg-[var(--bg-elevated)] [&>code]:px-1 [&>code]:rounded">
                        <ReactMarkdown>{card.explanation}</ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ExplanationPanel({
    blocks,
    onBlockHover,
    onTextSelect,
    onExplanationsReady,
    activeBlockId,
    owner,
    repo,
}: Props) {
    const [cards, setCards] = useState<CardState[]>([]);
    const [currentFile, setCurrentFile] = useState("");

    // Cache: keyed by file path → CardState[]
    const cacheRef = useRef<Record<string, CardState[]>>({});
    const fetchedRef = useRef<string>("");

    const fileLabel = blocks.length > 0 ? blocks[0].id.split(":")[0] : "";

    useEffect(() => {
        if (blocks.length === 0) return;

        const fileKey = blocks[0].id;
        setCurrentFile(fileLabel);

        // Serve from cache if already fetched
        if (cacheRef.current[fileLabel]) {
            setCards(cacheRef.current[fileLabel]);
            onExplanationsReady(
                cacheRef.current[fileLabel]
                    .filter((c) => c.status === "done")
                    .map((c) => ({ blockId: c.blockId, explanation: c.explanation }))
            );
            return;
        }

        // Don't re-fetch if same file is already loading
        if (fetchedRef.current === fileKey) return;
        fetchedRef.current = fileKey;

        // Read graph from sessionStorage
        const raw = sessionStorage.getItem(`graph:${owner}/${repo}`);
        const graph = raw ? JSON.parse(raw) : { nodes: [], edges: [] };

        // Filter out blocks that are too small to be worth explaining
        // (less than 3 meaningful lines — not whitespace or lone braces)
        const meaningfulBlocks = blocks.filter((block) => {
            const meaningfulLines = block.code
                .split("\n")
                .filter((l) => l.trim().length > 1 && !/^[{}()\[\],;]+$/.test(l.trim()));
            return meaningfulLines.length >= 3;
        });

        if (meaningfulBlocks.length === 0) {
            setCards([]);
            return;
        }

        // Initialise all cards as loading
        const initial: CardState[] = meaningfulBlocks.map((b) => ({
            blockId: b.id,
            status: "loading",
            explanation: "",
        }));
        setCards(initial);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

        const updated = [...initial];

        meaningfulBlocks.forEach((block, idx) => {
            const fileNodes = (graph.nodes ?? []).filter(
                (n: { source_file?: string }) => n.source_file === fileLabel
            );
            const fileEdges = (graph.edges ?? []).filter(
                (e: { source_file?: string }) => e.source_file === fileLabel
            );

            const blockStart = block.startLine + 1;
            const blockEnd = block.endLine + 1;

            const blockNodes = fileNodes.filter((n: { source_location?: string }) => {
                const line = parseInt((n.source_location ?? "L0").replace("L", ""));
                return line >= blockStart && line <= blockEnd;
            });
            const blockEdges = fileEdges.filter((e: { source_location?: string }) => {
                const line = parseInt((e.source_location ?? "L0").replace("L", ""));
                return line >= blockStart && line <= blockEnd;
            });

            fetch(`${apiUrl}/api/explain`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: block.code,
                    language: block.language,
                    file_path: fileLabel,
                    nodes: blockNodes,
                    edges: blockEdges,
                }),
            })
                .then((r) => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.json();
                })
                .then((data) => {
                    updated[idx] = {
                        ...updated[idx],
                        status: "done",
                        explanation: data.explanation,
                    };
                    const snapshot = [...updated];
                    setCards(snapshot);
                    cacheRef.current[fileLabel] = snapshot;
                })
                .catch(() => {
                    updated[idx] = { ...updated[idx], status: "error" };
                    const snapshot = [...updated];
                    setCards(snapshot);
                    cacheRef.current[fileLabel] = snapshot;
                });
        });
    }, [blocks]);

    // Notify parent when all done
    useEffect(() => {
        const done = cards.filter((c) => c.status === "done");
        if (done.length > 0 && done.length === cards.length) {
            onExplanationsReady(
                done.map((c) => ({ blockId: c.blockId, explanation: c.explanation }))
            );
        }
    }, [cards]);

    if (blocks.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                Select a file to see explanations
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Sticky header */}
            <div className="shrink-0 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-base)]">
                <p className="text-xs font-mono text-[var(--text-muted)] truncate">
                    📄 {currentFile}
                </p>
            </div>

            {/* Scrollable card stack */}
            <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
                {cards.length === 0
                    ? blocks.map((_, i) => <SkeletonCard key={i} />)
                    : cards.map((card, idx) => {
                        const block = blocks.find((b) => b.id === card.blockId);
                        if (!block) return null;
                        if (card.status === "loading") return <SkeletonCard key={card.blockId} />;
                        return (
                            <ExplanationCard
                                key={card.blockId}
                                block={block}
                                card={card}
                                isActive={activeBlockId === block.id}
                                onHover={onBlockHover}
                                onTextSelect={onTextSelect}
                            />
                        );
                    })}
            </div>
        </div>
    );
}