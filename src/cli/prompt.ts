export async function confirm(question: string): Promise<boolean> {
  process.stderr.write(`${question} [y/N] `);
  for await (const line of console) {
    return /^y(es)?$/i.test(line.trim());
  }
  process.stderr.write("\n");
  return false;
}
