import { readFileSync, writeFileSync } from "node:fs";

const input = new URL("../plugins/acp-steering/index.js", import.meta.url);
const output = new URL("../plugins/acp-steering/source.js", import.meta.url);
const expected = `export const steeringSource = ${JSON.stringify(readFileSync(input, "utf8"))};\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== expected) throw new Error("Run npm run generate before checking or committing ACP steering source");
} else {
  writeFileSync(output, expected);
}
