#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildFutureSelfPersona, loadPersonaInput } from "./persona-pipeline.mjs";

const inputPath = getArg("--input") || getArg("-i");
const outputPath = getArg("--output") || getArg("-o");
const printPrompt = process.argv.includes("--print-prompt");

if (!inputPath) {
  console.error("Usage: node apps/agent/generate-persona.mjs --input <survey.json> [--output <persona.json>] [--print-prompt]");
  process.exit(1);
}

const persona = buildFutureSelfPersona(loadPersonaInput(inputPath));

if (outputPath) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(persona, null, 2) + "\n", "utf8");
}

if (printPrompt) {
  console.log(persona.realtimeInstructions);
} else {
  console.log(
    JSON.stringify(
      {
        displayName: persona.displayName,
        targetYear: persona.targetYear,
        futureYear: persona.futureYear,
        output: outputPath ? path.resolve(outputPath) : null,
        identityKeywords: persona.predictedSelf.identityKeywords,
        firstGreeting: persona.predictedSelf.firstGreeting
      },
      null,
      2
    )
  );
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}
