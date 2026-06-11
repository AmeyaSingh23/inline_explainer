import WorkspaceShell from "@/components/workspace/WorkspaceShell";

export default async function WorkspacePage({
    params,
}: {
    params: Promise<{ owner: string; repo: string }>;
}) {
    const { owner, repo } = await params;
    return <WorkspaceShell owner={owner} repo={repo} />;
}