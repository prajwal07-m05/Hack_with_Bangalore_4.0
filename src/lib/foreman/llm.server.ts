/**
 * LLM client. Uses Groq (openai/gpt-oss-120b → qwen/qwen3-32b fallback) when GROQ_API_KEY is set,
 * otherwise falls back to the Lovable AI Gateway so the app works out of the box.
 * Handles rate limits (429) and 5xx with exponential backoff, and per-request timeouts.
 */
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: unknown } };

function providers() {
  const groq = process.env["GROQ_API_KEY"];
  if (groq) {
    return ["openai/gpt-oss-120b", "qwen/qwen3-32b"].map((model) => ({
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: groq,
      model,
      label: `groq:${model}`,
    }));
  }
  return [
    {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: process.env["LOVABLE_API_KEY"] ?? "",
      model: "google/gemini-3-flash-preview",
      label: "lovable:gemini-3-flash",
    },
  ];
}

export function llmLabel() {
  return providers()[0]!.label;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chat(opts: {
  messages: ChatMessage[];
  tools?: ToolDef[];
  json?: boolean;
  timeoutMs?: number;
}): Promise<{ content: string; tool_calls: ToolCall[]; model: string }> {
  let lastErr: unknown;
  for (const p of providers()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45000);
      try {
        const body: Record<string, unknown> = { model: p.model, messages: opts.messages, temperature: 0.2 };
        if (opts.tools?.length) {
          body["tools"] = opts.tools;
          body["tool_choice"] = "auto";
        }
        if (opts.json && !opts.tools?.length) body["response_format"] = { type: "json_object" };
        const res = await fetch(p.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`${p.label} ${res.status}`);
          await sleep(800 * 2 ** attempt); // backoff queue
          continue;
        }
        if (!res.ok) {
          lastErr = new Error(`${p.label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
          break; // try next model
        }
        const data = await res.json();
        const msg = data.choices?.[0]?.message ?? {};
        let content: string = msg.content ?? "";
        content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim(); // qwen reasoning
        return { content, tool_calls: msg.tool_calls ?? [], model: p.label };
      } catch (e) {
        lastErr = e;
        await sleep(500 * 2 ** attempt);
      } finally {
        clearTimeout(t);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LLM unavailable");
}

/** Extract the first JSON object from a model reply. */
export function parseJson<T = any>(text: string): T | null {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
