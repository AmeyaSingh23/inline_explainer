"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { CodeBlock } from "./WorkspaceShell";
import type * as Monaco from "monaco-editor";

interface Props {
    owner: string;
    repo: string;
    selectedFile: string | null;
    activeBlockId: string | null;
    onBlockClick: (id: string) => void;
    onBlocksReady: (blocks: CodeBlock[]) => void;
    onFileCodeReady: (code: string) => void;
    onOpenChat: (text: string) => void;
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

export default function CodePanel({ owner, repo, selectedFile, onBlocksReady, onFileCodeReady, onOpenChat }: Props) {
    const [fileContent, setFileContent] = useState<string>("");
    const [language, setLanguage] = useState("plaintext");
    const [loadingFile, setLoadingFile] = useState(false);
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const widgetRef = useRef<Monaco.editor.IContentWidget | null>(null);
    const selectedTextRef = useRef<string>("");
    // Keep a stable ref to onOpenChat so the Monaco listener always calls the latest version
    const onOpenChatRef = useRef(onOpenChat);
    useEffect(() => { onOpenChatRef.current = onOpenChat; }, [onOpenChat]);

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
                onFileCodeReady(decoded);

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

    // Clean up widget when file changes
    useEffect(() => {
        return () => {
            if (editorRef.current && widgetRef.current) {
                try { editorRef.current.removeContentWidget(widgetRef.current); } catch { /* noop */ }
                widgetRef.current = null;
            }
        };
    }, [selectedFile]);

    function removeWidget() {
        const editor = editorRef.current;
        const widget = widgetRef.current;
        if (editor && widget) {
            try { editor.removeContentWidget(widget); } catch { /* noop */ }
            widgetRef.current = null;
        }
    }

    const handleEditorMount: OnMount = (editor) => {
        editorRef.current = editor;

        editor.onDidChangeCursorSelection((e) => {
            const model = editor.getModel();
            if (!model) return;

            const selection = e.selection;
            const text = model.getValueInRange(selection).trim();

            // Remove existing widget first
            removeWidget();

            if (!text || text.length === 0) {
                selectedTextRef.current = "";
                return;
            }

            selectedTextRef.current = text;

            // Read computed accent color from DOM so inline styles work inside Monaco's iframe/shadow
            const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6d5acd";
            const accentHover = getComputedStyle(document.documentElement).getPropertyValue("--accent-hover").trim() || "#7c6bd6";
            const bgBase = getComputedStyle(document.documentElement).getPropertyValue("--bg-base").trim() || "#fff";

            // Create widget DOM
            const domNode = document.createElement("div");
            domNode.style.cssText = "display:flex;z-index:100;";
            // Prevent Monaco's onMouseDown from intercepting clicks on our widget
            domNode.onmousedown = (ev) => { ev.stopPropagation(); };

            const btn = document.createElement("button");
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg><span style="line-height:1;">Ask AI</span>`;
            btn.style.cssText = `
                display:flex;align-items:center;gap:5px;
                padding:5px 12px;border-radius:8px;border:none;
                background:${accent};color:${bgBase};
                font-size:11px;font-weight:500;font-family:inherit;
                cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);
                transition:background 0.15s;white-space:nowrap;
            `;
            btn.onmouseenter = () => { btn.style.background = accentHover; };
            btn.onmouseleave = () => { btn.style.background = accent; };
            btn.onclick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                const captured = selectedTextRef.current;
                removeWidget();
                // Use ref so we always call the latest onOpenChat
                if (captured) {
                    setTimeout(() => onOpenChatRef.current(captured), 0);
                }
            };

            domNode.appendChild(btn);

            // Position widget above the start of the selection
            const startPos = selection.getStartPosition();

            const widget: Monaco.editor.IContentWidget = {
                getId: () => "ask-ai-widget",
                getDomNode: () => domNode,
                getPosition: () => ({
                    position: { lineNumber: startPos.lineNumber, column: startPos.column },
                    preference: [1], // ABOVE
                }),
            };

            widgetRef.current = widget;
            editor.addContentWidget(widget);
        });

        // Remove widget when clicking elsewhere in the editor
        editor.onMouseDown((e) => {
            // Don't remove if clicking inside our widget
            const target = e.event.browserEvent.target as HTMLElement;
            const widgetDom = widgetRef.current ? document.getElementById('ask-ai-widget-container') : null;
            if (widgetDom && widgetDom.contains(target)) return;
            removeWidget();
        });
    };

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
            onMount={handleEditorMount}
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