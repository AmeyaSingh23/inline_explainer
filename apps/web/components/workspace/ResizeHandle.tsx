"use client";

import { Separator } from "react-resizable-panels";

interface Props {
    className?: string;
    disabled?: boolean;
}

export default function ResizeHandle({ className = "", disabled = false }: Props) {
    return (
        <Separator
            disabled={disabled}
            className={`${disabled ? "w-0 pointer-events-none opacity-0" : "w-1"} bg-[var(--bg-surface)] hover:bg-[var(--bg-overlay)] active:bg-[var(--bg-overlay)] transition-colors cursor-col-resize shrink-0 group flex flex-col items-center justify-center ${className}`}
        >
            {!disabled && (
                <div className="w-0.5 h-8 bg-[var(--text-muted)] rounded-full opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity" />
            )}
        </Separator>
    );
}
