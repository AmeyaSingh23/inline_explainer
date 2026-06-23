"use client";

import { useState, useEffect, useRef } from "react";
import FileTree from "./FileTree";
import CodePanel from "./CodePanel";
import ExplanationPanel from "./ExplanationPanel";
import ChatTray from "./ChatTray";
import { useChatSession } from "../../hooks/useChatSession";
import { Panel, Group, PanelImperativeHandle, GroupImperativeHandle } from "react-resizable-panels";
import ResizeHandle from "./ResizeHandle";

interface Props { owner: string; repo: string; }

export interface CodeBlock {
    id: string; startLine: number; endLine: number; code: string; language: string;
}
export interface ExplanationBlock {
    blockId: string; explanation: string;
}

export default function WorkspaceShell({ owner, repo }: Props) {
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const sidebarRef = useRef<PanelImperativeHandle>(null);
    const groupRef = useRef<GroupImperativeHandle>(null);
    const [selectedText, setSelectedText] = useState("");
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [blocks, setBlocks] = useState<CodeBlock[]>([]);
    const [explanations, setExplanations] = useState<ExplanationBlock[]>([]);
    const [fileCode, setFileCode] = useState("");
    const [fileExplanation, setFileExplanation] = useState("");
    const [repoFileTree, setRepoFileTree] = useState<string[]>([]);
    const [repositoryId, setRepositoryId] = useState("");

    const chatSession = useChatSession(
        chatOpen,
        selectedText,
        selectedFile ?? "",
        fileCode,
        fileExplanation,
        repoFileTree,
        repositoryId
    );

    useEffect(() => {
        const raw = sessionStorage.getItem(`graph:${owner}/${repo}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.job_id) setRepositoryId(parsed.job_id);
        }
    }, [owner, repo]);

    function handleTextSelect(text: string) {
        setSelectedText(text);
    }

    function handleOpenChat(text: string) {
        setSelectedText(text);
        setChatOpen(true);
    }

    function handleToggleSidebar() {
        const sidebar = sidebarRef.current;
        const group = groupRef.current;
        if (sidebar && group) {
            const currentLayout = group.getLayout();
            const keys = Object.keys(currentLayout);
            
            const sidebarKey = keys.find(k => k.includes("sidebar")) || "sidebar-panel";
            const codeKey = keys.find(k => k.includes("code")) || "code-panel";
            const expKey = keys.find(k => k.includes("explanation")) || "explanation-panel";
            
            if (sidebar.isCollapsed()) {
                const codeSize = currentLayout[codeKey] ?? 42;
                const expSize = currentLayout[expKey] ?? 43;
                const totalCodeExp = codeSize + expSize;
                
                const newLayout = { ...currentLayout };
                newLayout[sidebarKey] = 15;
                if (totalCodeExp > 0) {
                    newLayout[codeKey] = Math.max(20, codeSize - 7.5);
                    newLayout[expKey] = Math.max(15, expSize - 7.5);
                } else {
                    newLayout[codeKey] = 42;
                    newLayout[expKey] = 43;
                }
                group.setLayout(newLayout);
                setSidebarOpen(true);
            } else {
                const sidebarSize = currentLayout[sidebarKey] ?? 15;
                const codeSize = currentLayout[codeKey] ?? 42;
                const expSize = currentLayout[expKey] ?? 43;
                
                const newLayout = { ...currentLayout };
                newLayout[sidebarKey] = 0;
                newLayout[codeKey] = codeSize + (sidebarSize / 2);
                newLayout[expKey] = expSize + (sidebarSize / 2);
                
                group.setLayout(newLayout);
                setSidebarOpen(false);
            }
        }
    }

    // When sidebar closes, reclaim its space equally between the two main panels.
    // react-resizable-panels handles proportional sizing automatically when a
    // collapsible panel collapses — we just need collapsible + collapsedSize.

    return (
        <div className="h-screen w-screen flex flex-col bg-[var(--bg-base)] overflow-hidden">
            <header className="h-12 flex items-center px-4 border-b border-[var(--border)] shrink-0 gap-4">
                <span className="text-[var(--text-primary)] font-semibold text-sm">InlineExplainer</span>
                <span className="text-[var(--text-muted)] text-sm">{owner}/{repo}</span>
            </header>

            {/* Deep Dive button — fixed next to ThemeToggle */}
            <button
                onClick={() => { setSelectedText(""); setChatOpen(prev => !prev); }}
                title="Deep Dive"
                className="fixed top-3 right-[52px] z-50 p-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
            </button>
 
            <div className="flex flex-1 overflow-hidden">
                {/* Icon strip — always visible, never collapses */}
                <div className="flex flex-col items-center w-10 shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] py-2 gap-2">
                    {/* Toggle button */}
                    <button
                        onClick={handleToggleSidebar}
                        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`transition-transform duration-200 ${sidebarOpen ? "" : "rotate-180"}`}
                        >
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                    {/* Placeholder for future profile/nav icons */}
                </div>
 
                <Group orientation="horizontal" className="flex-1" groupRef={groupRef}>
                    <Panel
                        defaultSize={15}
                        minSize={10}
                        collapsible
                        collapsedSize={0}
                        onResize={(size) => {
                            if (size.asPercentage === 0) setSidebarOpen(false);
                            else setSidebarOpen(true);
                        }}
                        id="sidebar-panel"
                        panelRef={sidebarRef}
                        style={{ overflow: "hidden" }}
                    >
                        <FileTree
                            owner={owner}
                            repo={repo}
                            selectedFile={selectedFile}
                            onSelectFile={setSelectedFile}
                            onTreeReady={setRepoFileTree}
                        />
                    </Panel>
                    
                    <ResizeHandle disabled={!sidebarOpen} />

                    <Panel defaultSize={chatOpen ? 42 : 42} minSize={20} id="code-panel">
                        <CodePanel
                            owner={owner}
                            repo={repo}
                            selectedFile={selectedFile}
                            activeBlockId={activeBlockId}
                            onBlockClick={setActiveBlockId}
                            onBlocksReady={setBlocks}
                            onFileCodeReady={setFileCode}
                            onOpenChat={handleOpenChat}
                        />
                    </Panel>

                    <ResizeHandle />

                    <Panel defaultSize={chatOpen ? 43 : 43} minSize={15} id="explanation-panel">
                        <ExplanationPanel
                            blocks={blocks}
                            explanations={explanations}
                            activeBlockId={activeBlockId}
                            onBlockHover={setActiveBlockId}
                            onTextSelect={handleTextSelect}
                            onOpenChat={handleOpenChat}
                            onExplanationsReady={(exps) => {
                                setExplanations(exps);
                                if (exps.length > 0) setFileExplanation(exps[0].explanation);
                            }}
                            owner={owner}
                            repo={repo}
                        />
                    </Panel>

                    {chatOpen && (
                        <>
                            <ResizeHandle />
                            <Panel defaultSize={25} minSize={15} id="chat-panel">
                                <ChatTray
                                    open={chatOpen}
                                    onClose={() => setChatOpen(false)}
                                    chatSession={chatSession}
                                />
                            </Panel>
                        </>
                    )}
                </Group>
            </div>
        </div>
    );
}