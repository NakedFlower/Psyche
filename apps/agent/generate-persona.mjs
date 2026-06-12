#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFutureSelfPersona, loadPersonaInput } from "./persona-pipeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

loadEnv(path.join(rootDir, ".env"));

const inputPath = getArg("--input") || getArg("-i");
const outputPath = getArg("--output") || getArg("-o");
const provider = getArg("--provider") || process.env.PERSONA_PROVIDER || "rule";
const printPrompt = process.argv.includes("--print-prompt");

if (!inputPath) {
  console.error(
    "Usage: node apps/agent/generate-persona.mjs --input <survey.json> [--output <persona.json>] [--provider rule|azure|bedrock] [--print-prompt]"
  );
  process.exit(1);
}

const input = loadPersonaInput(inputPath);
const persona =
  provider === "bedrock"
    ? await buildWithBedrock(input)
    : provider === "azure"
      ? await buildWithAzure(input)
    : buildFutureSelfPersona(input);

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
        provider: persona.provider || { name: "rule" },
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

async function buildWithBedrock(input) {
  const { buildFutureSelfPersonaWithBedrock } = await import("./bedrock-persona.mjs");
  return buildFutureSelfPersonaWithBedrock(input);
}

async function buildWithAzure(input) {
  const { buildFutureSelfPersonaWithAzure } = await import("./azure-persona.mjs");
  return buildFutureSelfPersonaWithAzure(input);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
