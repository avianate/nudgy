import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Env, Paths } from "../core/paths";

export const LABEL = "io.github.avianate.nudgy.daemon";
// Login Items shows this app's name and icon for the agent, rather than a bare executable
export const NOTIFIER_BUNDLE_ID = "io.github.avianate.nudgy";

export type JobState = { loaded: boolean; pid: number | null };

export type Launchctl = {
  kind: string;
  print(): Promise<JobState>;
  bootstrap(plistPath: string): Promise<void>;
  bootout(): Promise<void>;
};

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function plistXml(paths: Paths): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(paths.bin)}</string>
    <string>daemon</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NUDGY_HOME</key>
    <string>${escapeXml(paths.home)}</string>
  </dict>
  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>${NOTIFIER_BUNDLE_ID}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(paths.log)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(paths.log)}</string>
</dict>
</plist>
`;
}

export function parsePrint(output: string): JobState {
  const pid = output.match(/^\tpid = (\d+)$/m);
  return { loaded: true, pid: pid ? Number(pid[1]) : null };
}

function realLaunchctl(): Launchctl {
  const domain = `gui/${process.getuid?.()}`;
  const run = (args: string[]) => {
    const proc = Bun.spawnSync(["/bin/launchctl", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      code: proc.exitCode,
      out: proc.stdout.toString() + proc.stderr.toString(),
    };
  };
  return {
    kind: "launchctl",
    async print() {
      const { code, out } = run(["print", `${domain}/${LABEL}`]);
      return code === 0 ? parsePrint(out) : { loaded: false, pid: null };
    },
    async bootstrap(plistPath) {
      const { code, out } = run(["bootstrap", domain, plistPath]);
      if (code !== 0)
        throw new Error(`launchctl bootstrap failed (${code}): ${out.trim()}`);
    },
    async bootout() {
      run(["bootout", `${domain}/${LABEL}`]);
    },
  };
}

type FakeState = JobState & { calls: string[][] };

export function fileLaunchctl(path: string): Launchctl {
  const read = (): FakeState =>
    existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : { loaded: false, pid: null, calls: [] };
  const write = (state: FakeState) =>
    writeFileSync(path, JSON.stringify(state));
  return {
    kind: "file",
    async print() {
      const { loaded, pid } = read();
      return { loaded, pid };
    },
    async bootstrap(plistPath) {
      const state = read();
      write({
        loaded: true,
        pid: 4242,
        calls: [...state.calls, ["bootstrap", plistPath]],
      });
    },
    async bootout() {
      const state = read();
      write({ loaded: false, pid: null, calls: [...state.calls, ["bootout"]] });
    },
  };
}

export function launchctlFromEnv(env: Env): Launchctl {
  const spec = env.NUDGY_LAUNCHCTL;
  if (spec === undefined) return realLaunchctl();
  if (spec.startsWith("file:") && spec.length > 5)
    return fileLaunchctl(spec.slice(5));
  throw new Error(`NUDGY_LAUNCHCTL must be file:<path>, got "${spec}"`);
}

export async function waitUntilUnloaded(
  launchctl: Launchctl,
  timeoutMs = 5_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await launchctl.print()).loaded) return true;
    await Bun.sleep(100);
  }
  return false;
}
