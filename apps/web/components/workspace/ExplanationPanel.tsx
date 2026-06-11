"use client";

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

export default function ExplanationPanel({ owner, repo }: Props) {
    return (
        <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
            Explanation panel — {owner}/{repo}
        </div>
    );
}