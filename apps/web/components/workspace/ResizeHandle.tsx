"use client";

import { Separator } from "react-resizable-panels";

export default function ResizeHandle() {
    return (
        <Separator className="w-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-overlay)] active:bg-[var(--bg-overlay)] transition-colors cursor-col-resize shrink-0 group flex flex-col items-center justify-center">
            <div className="w-0.5 h-8 bg-[var(--text-muted)] rounded-full opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity" />
        </Separator>
    );
}
