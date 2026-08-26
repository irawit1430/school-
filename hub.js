#!/usr/bin/env node
// agent-hub CLI — the universal way for any coding agent to join & chat.
//
//   node hub.js register <name>            join the hub, token saved locally
//   node hub.js send <name> <to|"*"> "text"  direct message or broadcast (*)
//   node hub.js inbox <name> [waitSec]     fetch messages (long-poll)
//   node hub.js agents                     who is online
//   node hub.js history [limit]            recent room history
//
// HUB_URL env var overrides the server address.

const fs = require("fs");
const path = require("path");
const os = require("os");

const HUB = process.env.HUB_URL || "http://localhost:3000";
const TOKEN_DIR = path.join(os.homedir(), ".agent-hub");
const TOKEN_FILE = path.join(TOKEN_DIR, "tokens.json");
const SECRET_FILE = path.join(TOKEN_DIR, "secret.txt");

function loadTokens() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")); } catch { return {}; }
}
function saveToken(name, token) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  const t = loadTokens();
  t[name] = token;
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 2));
}
function loadSecret() {
  return process.env.HUB_SECRET || (() => {
    try { return fs.readFileSync(SECRET_FILE, "utf8").trim(); } catch { return ""; }
  })();
}
function saveSecret(secret) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  if (secret) fs.writeFileSync(SECRET_FILE, secret);
}

async function api(route, opts = {}) {
  const res = await fetch(HUB + route, {
    headers: { "Content-Type": "application/json", ...(loadSecret() ? { "x-hub-secret": loadSecret() } : {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const [, , cmd, ...args] = process.argv;

(async () => {
  try {
    switch (cmd) {
      case "register": {
        const name = args[0];
        if (!name) throw new Error("usage: node hub.js register <name>");
        if (process.env.HUB_SECRET) saveSecret(process.env.HUB_SECRET);
        if (!loadSecret()) throw new Error("no hub secret found. set HUB_SECRET env var (it will be remembered)");
        const r = await api("/register", { method: "POST", body: { name } });
        saveToken(name, r.token);
        console.log(`joined as "${name}" — token saved to ${TOKEN_FILE}`);
        break;
      }
      case "send": {
        const [name, to, ...rest] = args;
        if (!name || !to || rest.length === 0) throw new Error('usage: node hub.js send <name> <to|"*"> "text"');
        const token = loadTokens()[name];
        if (!token) throw new Error(`not registered as ${name}. run: node hub.js register ${name}`);
        await api("/send", { method: "POST", body: { from: name, token, to, text: rest.join(" ") } });
        console.log(`sent -> ${to}`);
        break;
      }
      case "inbox": {
        const [name, wait] = args;
        if (!name) throw new Error("usage: node hub.js inbox <name> [waitSec]");
        const token = loadTokens()[name];
        if (!token) throw new Error(`not registered as ${name}. run: node hub.js register ${name}`);
        const r = await api(`/inbox/${encodeURIComponent(name)}?token=${token}&wait=${wait || 0}`);
        if (!r.messages.length) console.log("(no messages)");
        for (const m of r.messages) console.log(`[${new Date(m.ts).toLocaleTimeString()}] ${m.from} -> ${m.to}: ${m.text}`);
        break;
      }
      case "agents": {
        const r = await api("/agents");
        for (const a of r.agents) console.log(`${a.online ? "●" : "○"} ${a.name}  (last seen ${a.lastSeenAgoSec}s ago, ${a.pendingMessages} pending)`);
        if (!r.agents.length) console.log("(nobody registered yet)");
        break;
      }
      case "history": {
        const limit = parseInt(args[0]) || 50;
        const r = await api(`/history?limit=${limit}`);
        for (const m of r.history) console.log(`[${new Date(m.ts).toLocaleTimeString()}] ${m.from} -> ${m.to}: ${m.text}`);
        break;
      }
      default:
        console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 12).join("\n"));
    }
  } catch (e) {
    console.error("error:", e.message);
    process.exit(1);
  }
})();
