import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const requiredFiles = [
  "index.html",
  "styles.css",
  "src/app.js",
  "content/activities.json",
  "assets/kids-ai-workshop.svg",
  "vercel.json"
];

for (const file of requiredFiles) {
  if (!existsSync(new URL(`../${file}`, import.meta.url))) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const [html, app, activitiesText, vercelText] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../content/activities.json", import.meta.url), "utf8"),
  readFile(new URL("../vercel.json", import.meta.url), "utf8")
]);

const activities = JSON.parse(activitiesText);
const vercel = JSON.parse(vercelText);

if (!html.includes('id="age-tabs"') || !html.includes("./src/app.js")) {
  throw new Error("index.html is missing the app mount or script reference.");
}

if (!html.includes("./assets/kids-ai-workshop.svg")) {
  throw new Error("index.html is missing the visual asset reference.");
}

if (!app.includes('fetch("./content/activities.json")')) {
  throw new Error("app.js must load activities from content/activities.json.");
}

if (vercel.outputDirectory !== ".") {
  throw new Error('vercel.json must deploy the repository root with outputDirectory ".".');
}

if (!Array.isArray(activities.ageBands) || activities.ageBands.length !== 3) {
  throw new Error("Expected three learner age bands.");
}

for (const ageBand of activities.ageBands) {
  if (!ageBand.id || !ageBand.label || !Array.isArray(ageBand.activities)) {
    throw new Error(`Invalid age band: ${ageBand.id ?? "unknown"}`);
  }

  if (ageBand.activities.length === 0) {
    throw new Error(`Age band ${ageBand.id} has no activities.`);
  }

  for (const activity of ageBand.activities) {
    const required = ["id", "title", "summary", "goal", "time", "mode", "steps", "prompts"];
    for (const key of required) {
      if (!activity[key]) {
        throw new Error(`Activity ${activity.id ?? "unknown"} is missing ${key}.`);
      }
    }

    if (activity.steps.length < 3 || activity.prompts.length < 2) {
      throw new Error(`Activity ${activity.id} needs enough steps and prompt starters.`);
    }
  }
}
