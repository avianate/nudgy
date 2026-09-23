import { $ } from "bun";

const outfile = "dist/jot";

const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  compile: { outfile },
  minify: true,
  // Without splitting, the TUI's modules are parsed on every launch and add ~40ms to capture
  splitting: true,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// An unsigned or stale-signed binary is SIGKILLed on launch on Apple Silicon
await $`codesign -s - -f ${outfile}`;

const app = "dist/Jot Notifier.app";
const sources = [
  "src/notifier/main.swift",
  "src/notifier/Info.plist",
  "scripts/icon.swift",
];
const stamp = "dist/.notifier-source-hash";
const hasher = new Bun.CryptoHasher("sha256");
for (const file of sources) hasher.update(await Bun.file(file).arrayBuffer());
const hash = hasher.digest("hex");
const cached =
  (await Bun.file(stamp).exists()) && (await Bun.file(stamp).text()) === hash;

if (cached && (await Bun.file(`${app}/Contents/MacOS/jot-notify`).exists())) {
  console.log("notifier unchanged, skipping swiftc");
} else {
  await $`rm -rf ${app} dist/Assets.xcassets && mkdir -p ${app}/Contents/MacOS ${app}/Contents/Resources`;
  await $`cp src/notifier/Info.plist ${app}/Contents/Info.plist`;
  // actool emits both Assets.car (CFBundleIconName) and AppIcon.icns (CFBundleIconFile), as Xcode would
  await $`xcrun swift scripts/icon.swift dist/Assets.xcassets`;
  await $`xcrun actool --compile ${app}/Contents/Resources --platform macosx --minimum-deployment-target 14.0 --app-icon AppIcon --output-partial-info-plist dist/icon-partial.plist dist/Assets.xcassets`.quiet();
  await $`xcrun swiftc -O -o ${app}/Contents/MacOS/jot-notify src/notifier/main.swift`;
  await $`codesign -s - -f ${app}`;
  await Bun.write(stamp, hash);
}
await $`codesign --verify --strict ${app}`;
