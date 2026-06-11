"use client";

import { useState } from "react";
import FileTree from "./FileTree";
import CodePanel from "./CodePanel";
import ExplanationPanel from "./ExplanationPanel";
import ChatTray from "./ChatTray";

import { Panel, Group } from "react-resizable-panels";
import ResizeHandle from "./ResizeHandle";

interface Props {
    owner: string;
    repo: string;
}

export interface CodeBlock {
    id: string;
    startLine: number;
    endLine: number;
    code: string;
    language: string;
}

export interface ExplanationBlock {
    blockId: string;
    explanation: string;
}

export default function WorkspaceShell({ owner, repo }: Props) {
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [selectedText, setSelectedText] = useState("");
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [blocks, setBlocks] = useState<CodeBlock[]>([]);
    const [explanations, setExplanations] = useState<ExplanationBlock[]>([]);

    return (
        <div className="h-screen w-screen flex flex-col bg-[var(--bg-base)] overflow-hidden">

            {/* Header */}
            <header className="h-12 flex items-center px-4 border-b border-[var(--border)] shrink-0 gap-4">
                <span className="text-[var(--text-primary)] font-semibold text-sm">InlineExplainer</span>
                <span className="text-[var(--text-muted)] text-sm">
                    {owner}/{repo}
                </span>
            </header>

            {/* Single flat resizable group */}
            <div className="flex flex-1 overflow-hidden">
                <Group orientation="horizontal">

                    {/* Pane 1 — File Tree Sidebar */}
                    <Panel defaultSize={15} minSize={10}>
                        <FileTree
                            owner={owner}
                            repo={repo}
                            selectedFile={selectedFile}
                            onSelectFile={setSelectedFile}
                        />
                    </Panel>

                    <ResizeHandle />

                    {/* Pane 2 — Code Editor */}
                    <Panel defaultSize={chatOpen ? 35 : 42} minSize={20}>
                        <CodePanel
                            owner={owner}
                            repo={repo}
                            selectedFile={selectedFile}
                            activeBlockId={activeBlockId}
                            onBlockClick={setActiveBlockId}
                            onBlocksReady={setBlocks}
                        />
                    </Panel>

                    <ResizeHandle />

                    {/* Pane 3 — Explanations */}
                    <Panel defaultSize={chatOpen ? 25 : 43} minSize={15}>
                        <ExplanationPanel
                            blocks={blocks}
                            explanations={explanations}
                            activeBlockId={activeBlockId}
                            onBlockHover={setActiveBlockId}
                            onTextSelect={(text) => {
                                setSelectedText(text);
                                setChatOpen(true);
                            }}
                            onExplanationsReady={setExplanations}
                            owner={owner}
                            repo={repo}
                        />
                    </Panel>

                    {chatOpen && (
                        <>
                            <ResizeHandle />
                            {/* Pane 4 — Chat Tray */}
                            <Panel defaultSize={25} minSize={15}>
                                <ChatTray
                                    open={chatOpen}
                                    onClose={() => setChatOpen(false)}
                                    selectedText={selectedText}
                                    owner={owner}
                                    repo={repo}
                                />
                            </Panel>
                        </>
                    )}

                </Group>
            </div>
        </div>
    );
}