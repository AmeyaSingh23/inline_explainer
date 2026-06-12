"use client";

import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { CodeBlock } from "./WorkspaceShell";

interface Props {
    owner: string;
    repo: string;
    selectedFile: string | null;
    activeBlockId: string | null;
    onBlockClick: (id: string) => void;
    onBlocksReady: (blocks: CodeBlock[]) => void;
}

function detectLanguage(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
        ts: "typescript", tsx: "typescript",
        js: "javascript", jsx: "javascript",
        py: "python", rs: "rust", go: "go",
        java: "java", cpp: "cpp", c: "c",
        css: "css", html: "html", json: "json",
        md: "markdown", yaml: "yaml", yml: "yaml",
    };
    return map[ext ?? ""] ?? "plaintext";
}

export default function CodePanel({ owner, repo, selectedFile, onBlocksReady }: Props) {
    const [fileContent, setFileContent] = useState<string>("");
    const [language, setLanguage] = useState("plaintext");
    const [loadingFile, setLoadingFile] = useState(false);

    useEffect(() => {
        if (!selectedFile) return;
        async function fetchFile() {
            setLoadingFile(true);
            try {
                const res = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/contents/${selectedFile}`,
                    { headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_GITHUB_TOKEN}` } }
                );
                if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
                const data = await res.json();
                const decoded = atob(data.content.replace(/\n/g, ""));
                const lang = detectLanguage(selectedFile!);
                setLanguage(lang);
                setFileContent(decoded);

                const lines = decoded.split("\n");
                onBlocksReady([{
                    id: selectedFile!,
                    startLine: 0,
                    endLine: lines.length - 1,
                    code: decoded,
                    language: lang,
                }]);
            } catch (e) {
                console.error("Failed to fetch file:", e);
            } finally {
                setLoadingFile(false);
            }
        }
        fetchFile();
    }, [selectedFile, owner, repo]);

    if (!selectedFile) {
        return (
            <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                Select a file to view
            </div>
        );
    }

    if (loadingFile) {
        return (
            <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                Loading...
            </div>
        );
    }

    return (
        <Editor
            height="100%"
            language={language}
            value={fileContent}
            theme="vs-dark"
            options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
            }}
        />
    );
}