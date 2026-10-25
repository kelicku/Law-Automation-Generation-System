/**
 * One-off asset generation for the login screen (run locally, output committed as static files).
 * Uses OPEN_API_KEY from .env. The key is never bundled with or read by the web application.
 *
 *   npx tsx scripts/generate-login-art.ts
 */
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

config({ path: ".env", quiet: true });

const KEY = process.env.OPEN_API_KEY ?? process.env.OPENAI_API_KEY;
if (!KEY) throw new Error("OPEN_API_KEY is not set in .env");

const MODELS = ["gpt-image-1.5", "gpt-image-1"];
const OUT = path.join(process.cwd(), "public", "images", "login");

// Shared art direction: documentary photography, no people / text, brand palette.
const STYLE = [
  "Documentary editorial photograph, shot on a full-frame camera with a 35mm lens at f/2.8, natural available light only.",
  "Muted, restrained color grade: deep navy blues and slate shadows, warm ivory paper tones, a few small champagne-brass highlights.",
  "Subtle 35mm film grain, gentle lens falloff, true-to-life textures, slight imperfections, realistic depth of field.",
  "No people, no faces, no hands. No readable text, letters, numbers, logos or signage anywhere; any paper or book spines are out of focus or blank.",
  "Calm, quiet, trustworthy mood. Not glossy, not fantasy, not illustrated, no CGI look, no lens flares, no vignette overlays.",
].join(" ");

const SHOTS = [
  {
    name: "hero",
    size: "1024x1536",
    prompt:
      "A partner's desk in a small Tokyo law office at blue hour, seen from a low three-quarter angle. " +
      "Neatly stacked case files with plain cream folders, a closed leather-bound book, a brass desk lamp casting a warm pool of light, " +
      "a single fountain pen resting on a sheet of blank paper. Behind, a tall window shows the softly blurred city at dusk in navy tones. " +
      "Leave the lower third of the frame darker and uncluttered (tabletop in shadow) so typography can sit there. " +
      STYLE,
  },
  {
    name: "wide",
    size: "1536x1024",
    prompt:
      "Close, quiet still life on a dark walnut desk: two plain cream file folders slightly fanned, a brass paper clip, " +
      "a fountain pen with its cap off, a ceramic cup of green tea, raking late-afternoon window light from the left. " +
      "Composition weighted to the right, the left half falls into soft navy shadow. " +
      STYLE,
  },
] as const;

async function generate(prompt: string, size: string): Promise<{ png: Buffer; model: string }> {
  let lastError = "";
  for (const model of MODELS) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, size, quality: "high", n: 1 }),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
    if (res.ok && body.data?.[0]?.b64_json) return { png: Buffer.from(body.data[0].b64_json, "base64"), model };
    lastError = `${model}: HTTP ${res.status} ${body.error?.message ?? ""}`.replace(/sk-[\w-]+/g, "[key]");
    console.warn(`  ${lastError}`);
  }
  throw new Error(lastError);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const shot of SHOTS) {
    console.log(`generating ${shot.name} (${shot.size})…`);
    const { png, model } = await generate(shot.prompt, shot.size);
    const img = sharp(png);
    await img.clone().webp({ quality: 80 }).toFile(path.join(OUT, `${shot.name}.webp`));
    await img.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, `${shot.name}.jpg`));
    await writeFile(path.join(OUT, `${shot.name}.prompt.txt`), `model: ${model}\nsize: ${shot.size}\n\n${shot.prompt}\n`);
    console.log(`  saved (${model})`);
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e).replace(/sk-[\w-]+/g, "[key]"));
  process.exit(1);
});
