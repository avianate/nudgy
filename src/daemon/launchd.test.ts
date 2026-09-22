import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePaths } from "../core/paths";
import {
  fileLaunchctl,
  LABEL,
  launchctlFromEnv,
  parsePrint,
  plistXml,
} from "./launchd";

describe("plistXml", () => {
  const paths = resolvePaths({
    HOME: "/Users/dev",
    JOT_HOME: "/Users/dev/.jot",
  });
  const xml = plistXml(paths);

  test("runs the canonical install path, never the binary that ran the install", () => {
    expect(xml).toContain(
      "<string>/Users/dev/.local/bin/jot</string>\n    <string>daemon</string>\n    <string>run</string>",
    );
    expect(xml).not.toContain(process.execPath);
  });

  test("uses the dev.jot.daemon label with KeepAlive and RunAtLoad", () => {
    expect(LABEL).toBe("dev.jot.daemon");
    expect(xml).toContain(
      "<key>Label</key>\n  <string>dev.jot.daemon</string>",
    );
    expect(xml).toContain("<key>KeepAlive</key>\n  <true/>");
    expect(xml).toContain("<key>RunAtLoad</key>\n  <true/>");
  });

  test("logs to daemon.log and passes JOT_HOME through", () => {
    expect(xml).toContain(
      "<key>StandardOutPath</key>\n  <string>/Users/dev/.jot/daemon.log</string>",
    );
    expect(xml).toContain(
      "<key>StandardErrorPath</key>\n  <string>/Users/dev/.jot/daemon.log</string>",
    );
    expect(xml).toContain(
      "<key>JOT_HOME</key>\n    <string>/Users/dev/.jot</string>",
    );
  });

  test("escapes XML in paths", () => {
    expect(
      plistXml(resolvePaths({ HOME: "/Users/a&b", JOT_HOME: "/tmp/<j>" })),
    ).toContain("/tmp/&lt;j&gt;/daemon.log");
  });

  test("the plist lives in ~/Library/LaunchAgents", () => {
    expect(paths.launchAgent).toBe(
      "/Users/dev/Library/LaunchAgents/dev.jot.daemon.plist",
    );
  });
});

describe("parsePrint", () => {
  test("reads the pid of a running job", () => {
    expect(
      parsePrint(
        "gui/501/dev.jot.daemon = {\n\tstate = running\n\tpid = 1630\n\t\tstate = active\n",
      ),
    ).toEqual({
      loaded: true,
      pid: 1630,
    });
  });

  test("a loaded job that is not running has no pid", () => {
    expect(parsePrint("\tstate = not running\n")).toEqual({
      loaded: true,
      pid: null,
    });
  });
});

describe("fileLaunchctl", () => {
  test("records calls and tracks loaded state across instances", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "jot-lc-")), "launchctl.json");
    await fileLaunchctl(file).bootstrap("/p.plist");
    expect(await fileLaunchctl(file).print()).toEqual({
      loaded: true,
      pid: 4242,
    });
    await fileLaunchctl(file).bootout();
    expect(await fileLaunchctl(file).print()).toEqual({
      loaded: false,
      pid: null,
    });
    expect(JSON.parse(readFileSync(file, "utf8")).calls).toEqual([
      ["bootstrap", "/p.plist"],
      ["bootout"],
    ]);
  });
});

test("an unknown JOT_LAUNCHCTL is rejected rather than touching the real launchd", () => {
  expect(() => launchctlFromEnv({ JOT_LAUNCHCTL: "fake" })).toThrow(
    /JOT_LAUNCHCTL/,
  );
  expect(launchctlFromEnv({ JOT_LAUNCHCTL: "file:/tmp/x" }).kind).toBe("file");
});
