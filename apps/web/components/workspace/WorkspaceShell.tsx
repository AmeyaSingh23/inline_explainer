"use client";

import { useState, useEffect } from "react";
import FileTree from "./FileTree";
import CodePanel from "./CodePanel";
import ExplanationPanel from "./ExplanationPanel";
import ChatTray from "./ChatTray";
import { useChatSession } from "../../hooks/useChatSession";
import { Panel, Group } from "react-resizable-panels";
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
        // Don't open chat here — popup button in ExplanationPanel does that
    }

    function handleOpenChat(text: string) {
        setSelectedText(text);
        setChatOpen(true);
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-[var(--bg-base)] overflow-hidden">
            <header className="h-12 flex items-center px-4 border-b border-[var(--border)] shrink-0 gap-4">
                <span className="text-[var(--text-primary)] font-semibold text-sm">InlineExplainer</span>
                <span className="text-[var(--text-muted)] text-sm">{owner}/{repo}</span>
            </header>
            <div className="flex flex-1 overflow-hidden">
                <Group orientation="horizontal">
                    <Panel defaultSize={15} minSize={10}>
                        <FileTree
                            owner={owner}
                            repo={repo}
                            selectedFile={selectedFile}
                            onSelectFile={setSelectedFile}
                            onTreeReady={setRepoFileTree}
                        />
                    </Panel>
                    <ResizeHandle />
                    <Panel defaultSize={chatOpen ? 35 : 42} minSize={20}>
                        <CodePanel
                            owner={owner}
                            repo={repo}
                            selectedFile={selectedFile}
                            activeBlockId={activeBlockId}
                            onBlockClick={setActiveBlockId}
                            onBlocksReady={setBlocks}
                            onFileCodeReady={setFileCode}
                        />
                    </Panel>
                    <ResizeHandle />
                    <Panel defaultSize={chatOpen ? 25 : 43} minSize={15}>
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
                            <Panel defaultSize={25} minSize={15}>
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