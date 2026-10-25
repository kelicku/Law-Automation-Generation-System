// One real Anthropic call through the same schema the app uses (classification task).
import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PROMPTS } from "@/lib/ai/prompts";
import { ClassifyStrict, ClassifyWire } from "@/lib/ai/schemas";
import { DEMO_SOURCES } from "@/lib/demo/sources";
import { fenceUntrusted, sanitizeSourceText } from "@/lib/domain/sanitize";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  const src = DEMO_SOURCES.find((s) => s.slug === "minato-seiki-notice-2")!;
  const text = sanitizeSourceText(src.html, true).text;
  const client = new Anthropic();
  const t0 = Date.now();
  const res = await client.messages.parse({
    model: process.env.AI_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: PROMPTS.classify.system,
    messages: [{ role: "user", content: `情報源: ${src.publisher}\nタイトル: ${src.title}\n\n${fenceUntrusted("src", text)}` }],
    output_config: { format: zodOutputFormat(ClassifyWire), effort: "medium" },
  });
  const out = ClassifyStrict.parse(res.parsed_output);
  console.log(JSON.stringify({ model: res.model, stop: res.stop_reason, ms: Date.now() - t0, usage: { in: res.usage.input_tokens, out: res.usage.output_tokens }, out }, null, 2));
}
main().catch((e) => {
  console.error("FAILED:", e?.constructor?.name, e?.status ?? "", String(e?.message ?? e).replace(/sk-ant-[\w-]+/g, "[key]").slice(0, 400));
  process.exit(1);
});
