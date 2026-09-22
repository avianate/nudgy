import { $ } from "bun";

const THRESHOLD = 0.9;

await $`bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage`;

const lcov = await Bun.file("coverage/lcov.info").text();
let found = 0;
let hit = 0;
let file = "";
for (const line of lcov.split("\n")) {
  if (line.startsWith("SF:")) file = line.slice(3);
  if (!file.startsWith("src/core/")) continue;
  if (line.startsWith("LF:")) found += Number(line.slice(3));
  if (line.startsWith("LH:")) hit += Number(line.slice(3));
}

if (found === 0) {
  console.log("src/core: no files covered yet");
} else {
  const ratio = hit / found;
  console.log(
    `src/core line coverage: ${(ratio * 100).toFixed(1)}% (${hit}/${found})`,
  );
  if (ratio < THRESHOLD) process.exit(1);
}
