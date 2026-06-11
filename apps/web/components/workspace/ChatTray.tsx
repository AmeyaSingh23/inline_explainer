"use client";

interface Props {
    open: boolean;
    onClose: () => void;
    selectedText: string;
    owner: string;
    repo: string;
}

export default function ChatTray({ open, onClose }: Props) {
    if (!open) return null;

    return (
        <div className="h-full w-full bg-[var(--bg-surface)] flex flex-col">
            <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--border)] shrink-0">
                <span className="text-[var(--text-primary)] text-sm font-medium">Deep Dive</span>
                <button
                    onClick={onClose}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-lg leading-none"
                >
                    ✕
                </button>
            </div>
            <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">
                Chat tray — coming soon
            </div>
        </div>
    );
}