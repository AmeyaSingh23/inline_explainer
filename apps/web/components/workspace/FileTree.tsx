"use client";

import { useEffect, useState } from "react";
import { CodeBlock } from "./WorkspaceShell";

interface TreeNode {
    path: string;
    type: "blob" | "tree";
}

interface Props {
    owner: string;
    repo: string;
    selectedFile: string | null;
    onSelectFile: (path: string) => void;
    onTreeReady?: (files: string[]) => void;
}

// Build nested tree structure from flat paths
function buildTree(paths: string[]): Record<string, unknown> {
    const root: Record<string, unknown> = {};
    for (const path of paths) {
        const parts = path.split("/");
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                current[part] = path; // leaf = full path string
            } else {
                if (!current[part]) current[part] = {};
                current = current[part] as Record<string, unknown>;
            }
        }
    }
    return root;
}

// Recursive tree renderer
function TreeItem({
    name,
    node,
    depth,
    selectedFile,
    onSelect,
}: {
    name: string;
    node: unknown;
    depth: number;
    selectedFile: string | null;
    onSelect: (path: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const isFile = typeof node === "string";

    if (isFile) {
        return (
            <button
                onClick={() => onSelect(node as string)}
                className={`w-full flex items-center text-left text-sm py-1 truncate transition-colors ${selectedFile === node
                    ? "text-[var(--text-primary)] bg-[var(--bg-overlay)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    }`}
                style={{ paddingLeft: `${depth * 16 + 12}px` }}
            >
                <span className="opacity-50 mr-2 text-[10px]">📄</span>
                {name}
            </button>
        );
    }

    const children = node as Record<string, unknown>;
    const sortedKeys = Object.keys(children).sort((a, b) => {
        const aIsFile = typeof children[a] === "string";
        const bIsFile = typeof children[b] === "string";
        if (aIsFile !== bIsFile) return aIsFile ? 1 : -1; // folders first
        return a.localeCompare(b);
    });

    return (
        <div>
            <button
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center text-left text-sm py-1 text-[var(--accent-hover)] hover:text-[var(--text-primary)] transition-colors"
                style={{ paddingLeft: `${depth * 16 + 12}px` }}
            >
                <span className="w-4 inline-block text-center opacity-70 text-[10px]">
                    {open ? "▼" : "▶"}
                </span>
                <span className="opacity-100 mr-2 ml-0.5 text-[10px]">📁</span>
                {name}
            </button>
            {open && (
                <div>
                    {sortedKeys.map((key) => (
                        <TreeItem
                            key={key}
                            name={key}
                            node={children[key]}
                            depth={depth + 1}
                            selectedFile={selectedFile}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function FileTree({ owner, repo, selectedFile, onSelectFile, onTreeReady }: Props) {
    const [tree, setTree] = useState<Record<string, unknown>>({});
    const [loadingTree, setLoadingTree] = useState(true);
    const [treeError, setTreeError] = useState("");

    useEffect(() => {
        async function fetchTree() {
            setLoadingTree(true);
            setTreeError("");
            try {
                const res = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
                    { headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_GITHUB_TOKEN}` } }
                );
                if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
                const data = await res.json();
                const files: string[] = (data.tree as TreeNode[])
                    .filter(
                        (n) =>
                            n.type === "blob" &&
                            !n.path.startsWith(".") &&
                            !n.path.includes("node_modules") &&
                            !n.path.includes("__pycache__")
                    )
                    .map((n) => n.path);
                setTree(buildTree(files));
                onTreeReady?.(files);
            } catch (e: unknown) {
                setTreeError(e instanceof Error ? e.message : "Failed to load file tree.");
            } finally {
                setLoadingTree(false);
            }
        }
        fetchTree();
    }, [owner, repo]);

    return (
        <div className="h-full overflow-y-auto py-2">
            {loadingTree && (
                <p className="text-[var(--text-muted)] text-xs px-3">Loading files...</p>
            )}
            {treeError && (
                <p className="text-[var(--error)] text-xs px-3">{treeError}</p>
            )}
            {!loadingTree && Object.keys(tree).sort((a, b) => {
                const aIsFile = typeof tree[a] === "string";
                const bIsFile = typeof tree[b] === "string";
                if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
                return a.localeCompare(b);
            }).map((key) => (
                <TreeItem
                    key={key}
                    name={key}
                    node={tree[key]}
                    depth={0}
                    selectedFile={selectedFile}
                    onSelect={onSelectFile}
                />
            ))}
        </div>
    );
}
