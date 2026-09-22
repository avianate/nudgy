import pkg from "../package.json";

const argv = process.argv.slice(2);

if (argv[0] === "--version") {
  console.log(pkg.version);
} else {
  console.error("jot: not implemented yet");
  process.exit(2);
}
