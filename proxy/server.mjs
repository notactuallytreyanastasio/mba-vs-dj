// DeepSeek proxy for the MBA-or-DJ classroom site.
//
// The site is static (GitHub Pages), so it cannot hold an API key. This holds
// it, and nothing else about the request is up to the browser: the system
// prompts, the models, the tools and the token budgets are fixed here. The
// browser sends the tree and, for edits and brainstorms, one short instruction.
//
// It is reachable by anyone who finds the URL, and CORS does not stop curl,
// so what actually bounds the bill is the rate limit: per IP per hour and a
// global ceiling per day, both in memory (a restart resets them, which is
// fine at this scale).
//
// Models are the ids DeepSeek's /models returns, checked against the API:
//   deepseek-chat   V4.1 Flash with thinking off. Required for a forced tool
//                   call ("Thinking mode does not support this tool_choice"),
//                   and fast: ~1.4 s for an edit.
// The explanation used deepseek-flash with thinking on at first: correct, but
// 20 s, too slow to use live in front of a class. The site now computes the
// facts (rollback, margins, break-even points) and sends them, so the model
// only has to narrate, and deepseek-chat does that in a few seconds.
// The same models marginalia uses (lib/marginalia/llm.ex).

import http from "node:http";

const PORT = +(process.env.PORT || 8080);
const KEY = process.env.DEEPSEEK_API_KEY;
const ENDPOINT = process.env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com/chat/completions";
const ORIGINS = (process.env.ALLOWED_ORIGINS ||
  "https://notactuallytreyanastasio.github.io,http://localhost:8765,http://localhost:8000").split(",");
const PER_IP_HOUR = +(process.env.PER_IP_HOUR || 60);
const PER_DAY = +(process.env.PER_DAY || 1500);
const MAX_BODY = 48 * 1024;
const MAX_MESSAGE = 600;

if (!KEY) { console.error("DEEPSEEK_API_KEY is not set"); process.exit(1); }

/* ---------------- rate limiting ---------------- */
const hits = new Map();          // ip -> [timestamps]
let day = new Date().toISOString().slice(0, 10), dayCount = 0;
function allow(ip) {
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= PER_DAY) return "daily limit reached";
  const list = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  if (list.length >= PER_IP_HOUR) return "hourly limit reached for this address";
  list.push(now); hits.set(ip, list); dayCount++;
  return null;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, l] of hits) if (!l.some(t => now - t < 3600_000)) hits.delete(ip);
}, 600_000).unref();

/* ---------------- prompts ---------------- */
const TREE_PRIMER = `You are helping a teacher run a live class on decision trees, using a tree about choosing a career: MBA or DJ.
The tree is given as JSON. Node kinds: "goal" is the decision (the student chooses), "option" is a path they can choose,
"outcome" is something chance picks. Fields: p = probability of an outcome among its siblings (0 to 1, siblings should sum to 1),
payoff = 10-year net earnings in thousands of dollars ($k) at an end point, joy = satisfaction 0 to 10 at an end point,
cost = $k paid to take that branch. joyWeight = $k one point of satisfaction is worth (0 means money only).
ev = the rolled-back expected value already computed for each node; best = the option the math picks.
A payoff on a node that has children is money earned up to that point (an end point that was later grown); its children's payoffs come on top.
Satisfaction (joy) only counts at end points.`;

const EDIT_SYSTEM = `${TREE_PRIMER}

The teacher types an instruction. Turn it into edits by calling the edit_tree tool exactly once.
Rules:
- Refer to existing nodes only by their "id". New nodes get a temporary id you choose, like "new1", which later ops may use as a parent.
- Keep each chance node's outcome probabilities summing to 1. If you change one, set the siblings too (rebalance them in proportion unless told otherwise).
- Money is in $k: "$600k" is 600, "$1.2M" is 1200.
- Only change what the instruction asks for. If the instruction is unclear or is not about the tree, make no ops and say why in summary.
- summary: one or two plain sentences a student would understand, naming the numbers you changed.`;

const EXPLAIN_SYSTEM = `${TREE_PRIMER}

Explain the current tree to the class, out loud, as the teacher would. Plain language, no markdown headers, no bullet lists,
at most 170 words. Walk backwards from the end points: what each path is worth on average and why, which choice the math picks
and by how much, and the single number in the tree that the decision is most sensitive to (say how far it would have to move to flip it, if it can).
The site has already done the arithmetic and lists it under "Facts". Use those numbers exactly; do not compute or invent new ones.
If joyWeight is above 0, say how satisfaction is being priced. Address the students as "you".`;

const EDIT_TOOL = {
  type: "function",
  function: {
    name: "edit_tree",
    description: "Apply edits to the decision tree.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "What changed, for students." },
        ops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["set", "add", "delete"] },
              node_id: { type: "string", description: "set/delete: the node's id" },
              field: { type: "string", enum: ["title", "p", "payoff", "joy", "cost"], description: "set: which field" },
              value: { description: "set: the new value (number, or string for title)" },
              parent_id: { type: "string", description: "add: id of the parent node" },
              new_id: { type: "string", description: "add: temporary id for the new node" },
              kind: { type: "string", enum: ["outcome", "option"], description: "add: outcome under a chance node, option under the decision" },
              title: { type: "string" },
              p: { type: "number" }, payoff: { type: "number" }, joy: { type: "number" }, cost: { type: "number" }
            },
            required: ["op"]
          }
        }
      },
      required: ["summary", "ops"]
    }
  }
};

const IDEAS_SYSTEM = `${TREE_PRIMER}

The class is brainstorming ways to grow the tree. You get the tree, a focus node id, and maybe a nudge from the class.
Suggest 4 to 6 new branches by calling the suggest_branches tool exactly once. What fits depends on the focus node:
- An end point (no children): what happens NEXT, later in this person's life. Either chance outcomes (kind "outcome", their p summing to about 1 as a set)
  or a choice the person would face (kind "option", each with 2-3 outcome children). Pick whichever is more realistic, and say which in the "why".
  The end point's own payoff is what was earned up to that point; new branches add earnings on top of it, so payoff here means what the next stage adds.
- A chance node: outcomes it is missing (kind "outcome"). Give a realistic p for each; the site will shrink the existing ones to make room.
- The decision (goal): new paths to choose (kind "option"), each with 2-3 outcome children and a cost.
Make them concrete, varied and realistic for the career in question, including unglamorous ones. Do not repeat branches already in the tree.
Money in $k over the same 10-year horizon. "why" is one sentence a student would find persuasive or surprising.`;

const IDEAS_TOOL = {
  type: "function",
  function: {
    name: "suggest_branches",
    description: "Suggest new branches for the tree.",
    parameters: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              parent_id: { type: "string", description: "id of the node this branch hangs off (usually the focus node)" },
              kind: { type: "string", enum: ["outcome", "option"] },
              title: { type: "string" },
              why: { type: "string" },
              p: { type: "number", description: "outcome: probability among its siblings" },
              payoff: { type: "number" }, joy: { type: "number" }, cost: { type: "number" },
              children: {
                type: "array", description: "option: its outcomes",
                items: { type: "object", properties: { title: { type: "string" }, p: { type: "number" }, payoff: { type: "number" }, joy: { type: "number" } }, required: ["title", "p", "payoff"] }
              }
            },
            required: ["parent_id", "kind", "title", "why"]
          }
        }
      },
      required: ["ideas"]
    }
  }
};

/* ---------------- DeepSeek ---------------- */
async function deepseek(body, timeoutMs) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`DeepSeek ${res.status}: ${text.slice(0, 200)}`), { status: 502 });
  const data = JSON.parse(text);
  const choice = data.choices?.[0];
  // a truncated reply is a failure, not a short answer (same rule as marginalia)
  if (choice?.finish_reason === "length") throw Object.assign(new Error("DeepSeek reply was cut off"), { status: 502 });
  const u = data.usage || {};
  console.log(`deepseek ${body.model}: prompt=${u.prompt_tokens} cached=${u.prompt_cache_hit_tokens || 0} completion=${u.completion_tokens}`);
  return choice.message;
}

async function edit(tree, message) {
  const msg = await deepseek({
    model: "deepseek-chat",
    max_tokens: 1500,
    temperature: 0.2,
    tools: [EDIT_TOOL],
    tool_choice: { type: "function", function: { name: "edit_tree" } },
    messages: [
      { role: "system", content: EDIT_SYSTEM },
      { role: "user", content: `Tree:\n${JSON.stringify(tree)}\n\nInstruction: ${message}` }
    ]
  }, 45_000);
  const call = msg.tool_calls?.[0];
  if (!call) throw Object.assign(new Error("model made no edit_tree call"), { status: 502 });
  let args;
  try { args = JSON.parse(call.function.arguments || "{}"); }
  catch { throw Object.assign(new Error("model returned invalid JSON for edit_tree"), { status: 502 }); }
  if (!Array.isArray(args.ops)) args.ops = [];
  return { summary: String(args.summary || ""), ops: args.ops };
}

async function ideas(tree, focusId, message) {
  const msg = await deepseek({
    model: "deepseek-chat",
    max_tokens: 2500,
    temperature: 0.8,
    tools: [IDEAS_TOOL],
    tool_choice: { type: "function", function: { name: "suggest_branches" } },
    messages: [
      { role: "system", content: IDEAS_SYSTEM },
      { role: "user", content: `Tree:\n${JSON.stringify(tree)}\n\nFocus node id: ${focusId}` + (message ? `\nThe class says: ${message}` : "") }
    ]
  }, 60_000);
  const call = msg.tool_calls?.[0];
  if (!call) throw Object.assign(new Error("model made no suggest_branches call"), { status: 502 });
  let args;
  try { args = JSON.parse(call.function.arguments || "{}"); }
  catch { throw Object.assign(new Error("model returned invalid JSON for suggest_branches"), { status: 502 }); }
  return { ideas: Array.isArray(args.ideas) ? args.ideas.slice(0, 8) : [] };
}

async function explain(tree, facts) {
  const list = Array.isArray(facts) ? facts.slice(0, 40).map(f => "- " + String(f).slice(0, 300)).join("\n") : "";
  const msg = await deepseek({
    model: "deepseek-chat",
    max_tokens: 700,
    temperature: 0.4,
    messages: [
      { role: "system", content: EXPLAIN_SYSTEM },
      { role: "user", content: `Tree:\n${JSON.stringify(tree)}\n\nFacts:\n${list}` }
    ]
  }, 45_000);
  return { text: String(msg.content || "").trim() };
}

/* ---------------- HTTP ---------------- */
function send(res, status, obj, origin) {
  const h = { "content-type": "application/json", "cache-control": "no-store", vary: "Origin" };
  if (origin) Object.assign(h, { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" });
  res.writeHead(status, h); res.end(obj === null ? "" : JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  const origin = ORIGINS.includes(req.headers.origin) ? req.headers.origin : null;
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, today: dayCount }, null);
  if (req.method === "OPTIONS") return send(res, 204, null, origin);
  if (req.method !== "POST" || !["/edit", "/explain", "/ideas"].includes(req.url)) return send(res, 404, { error: "not found" }, origin);
  if (!origin) return send(res, 403, { error: "origin not allowed" }, null);

  const ip = req.headers["cf-connecting-ip"] || (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(res, 413, { error: "tree too large" }, origin); chunks.push(c); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return send(res, 400, { error: "invalid JSON" }, origin); }
  if (!body || typeof body.tree !== "object") return send(res, 400, { error: "missing tree" }, origin);
  if (req.url === "/ideas" && (typeof body.focus_id !== "string" || (body.message && (typeof body.message !== "string" || body.message.length > MAX_MESSAGE))))
    return send(res, 400, { error: "focus_id required; message at most " + MAX_MESSAGE + " characters" }, origin);
  if (req.url === "/edit" && (typeof body.message !== "string" || !body.message.trim() || body.message.length > MAX_MESSAGE))
    return send(res, 400, { error: `message must be 1-${MAX_MESSAGE} characters` }, origin);

  const limited = allow(ip);
  if (limited) return send(res, 429, { error: limited }, origin);

  try {
    const out = req.url === "/edit" ? await edit(body.tree, body.message.trim())
      : req.url === "/ideas" ? await ideas(body.tree, body.focus_id, (body.message || "").trim())
      : await explain(body.tree, body.facts);
    send(res, 200, out, origin);
  } catch (e) {
    console.error(req.url, e.message);
    send(res, e.status || 500, { error: e.name === "TimeoutError" ? "DeepSeek took too long" : e.message }, origin);
  }
}).listen(PORT, () => console.log(`dtree-ai listening on ${PORT}, origins ${ORIGINS.join(" ")}`));
