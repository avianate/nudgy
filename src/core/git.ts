export type GitContext = { repo: string | null; branch: string | null };

export type Git = (cwd: string) => GitContext;

export function parseRevParse(stdout: string): GitContext {
  const [top, branch] = stdout.trim().split("\n");
  if (!top?.startsWith("/")) return { repo: null, branch: null };
  return { repo: top, branch: branch && branch !== "HEAD" ? branch : null };
}

export const gitContext: Git = (cwd) => {
  try {
    // One spawn for both: in a repo with no commits git exits 128 but still prints the top level first
    const proc = Bun.spawnSync(
      ["git", "rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD"],
      {
        cwd,
        stdout: "pipe",
        stderr: "ignore",
      },
    );
    return parseRevParse(proc.stdout.toString());
  } catch {
    return { repo: null, branch: null };
  }
};
