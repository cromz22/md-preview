import path from "node:path";
import { convertAll, ensureDirectories, type ConvertOptions } from "./converter";

const options = parseArgs(process.argv.slice(2));

await ensureDirectories(options);
const count = await convertAll(options);
console.log(`Converted ${count} markdown file${count === 1 ? "" : "s"} from ${options.inputDir} to ${options.outputDir}.`);

function parseArgs(args: string[]): ConvertOptions {
  const defaults = {
    inputDir: "input",
    outputDir: "output"
  };

  const values = { ...defaults };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input" || arg === "-i") {
      values.inputDir = requireValue(args, index);
      index += 1;
    } else if (arg === "--output" || arg === "-o") {
      values.outputDir = requireValue(args, index);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    inputDir: path.resolve(values.inputDir),
    outputDir: path.resolve(values.outputDir)
  };
}

function requireValue(args: string[], index: number): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${args[index]}`);
  }
  return value;
}
