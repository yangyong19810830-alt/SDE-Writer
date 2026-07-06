import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const promptPath = path.join(__dirname, "prompts", "sde-system-prompt.md");

const port = Number(process.env.PORT || 5173);
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const inviteCode = process.env.INVITE_CODE || "";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildUserPrompt(input) {
  const modeText = {
    titles: "只生成 5 个适合公众号传播的十万加风格标题，供用户挑选。不要写大纲，不要写正文。",
    outline: "先生成文章标题、核心观点、主线和 8 到 12 个小标题大纲，不写全文。",
    draft: "直接生成完整公众号文章。如果一次无法写满，请尽量输出结构完整的长文，并保留后续可续写的章节衔接。",
    polish: "对用户提供的草稿进行总编修订，统一逻辑、语言、标题、小标题和结尾余韵。"
  }[input.mode] || "先生成文章构思和详细大纲。";

  return [
    `写作任务：${modeText}`,
    "",
    `主题：${input.topic || "未填写"}`,
    `目标读者：${input.audience || "家长、教师、教育从业者和关注学习的人"}`,
    `文章目的：${input.goal || "让读者重新理解这个问题，并获得可实践的破局方式"}`,
    `文章风格：${input.style || "通俗但有深度，温和但有穿透力，适合公众号阅读"}`,
    `目标长度：${input.length || "8000 到 12000 字"}`,
    "",
    input.extra ? `补充要求：\n${input.extra}` : "",
    input.draft ? `需要修订的草稿：\n${input.draft}` : "",
    "",
    "硬性要求：",
    input.mode === "titles" ? [
      "标题生成要求：",
      "1. 只输出 5 个标题，编号 1 到 5。",
      "2. 每个标题都要有十万加传播感：有冲突、有悬念、有具体对象、有认知反转，但不要低俗、夸张失真或标题党。",
      "3. 标题要适合中文公众号，尽量控制在 18 到 32 个汉字。",
      "4. 每个标题后附一句很短的选择理由。",
      "5. 不要写文章大纲，不要写正文。",
      "6. 不要出现“SDE”“S/D/E”“三方程”“六路径”“三原理”“知识画像”等术语。"
    ].join("\n") : "1. 后台可以使用 SDE 知识论分析，但正文不要出现“SDE”“S/D/E”“三方程”“六路径”“三原理”“知识画像”等术语。",
    "2. 正文要自然呈现为公众号深度文章，不要像理论说明书。",
    "3. 从真实场景切入，再推进到问题、冲突、模式和方法。",
    "4. 不要空喊口号，不要堆概念，不要写成课程讲义。",
    "5. 输出中文。"
  ].filter(Boolean).join("\n");
}

async function callDeepSeekStream(input, res) {
  if (inviteCode && input.inviteCode !== inviteCode) {
    sendJson(res, 403, {
      error: "邀请码不正确，不能生成内容。"
    });
    return;
  }

  const apiKey = input.apiKey || deepseekApiKey;

  if (!apiKey) {
    sendJson(res, 500, {
      error: "请先在页面里填写 DeepSeek API Key。"
    });
    return;
  }

  const systemPrompt = await readFile(promptPath, "utf8");
  const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: input.model || "deepseek-v4-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(input) }
      ],
      temperature: Number(input.temperature ?? 0.7),
      stream: true,
      ...(input.thinking ? {
        thinking: { type: "enabled" },
        reasoning_effort: input.reasoningEffort || "medium"
      } : {})
    })
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    sendJson(res, response.status || 500, {
      error: "DeepSeek API 调用失败。",
      detail
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no"
  });

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        const text = delta?.content || "";
        if (text) res.write(text);
      } catch {
        continue;
      }
    }
  }

  res.end();
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(publicDir, pathname));

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const content = await readFile(filePath);
  res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
  res.end(content);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        hasApiKey: Boolean(deepseekApiKey),
        requiresInvite: Boolean(inviteCode),
        baseUrl: deepseekBaseUrl
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/generate") {
      const input = await readRequestJson(req);
      await callDeepSeekStream(input, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 500, {
      error: "服务器处理失败。",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

function getLocalNetworkUrls() {
  const urls = [];
  const networks = os.networkInterfaces();

  for (const entries of Object.values(networks)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }

  return urls;
}

server.listen(port, "0.0.0.0", () => {
  console.log("");
  console.log(`电脑访问：http://localhost:${port}`);
  const localUrls = getLocalNetworkUrls();
  if (localUrls.length) {
    console.log("手机访问：");
    for (const url of localUrls) console.log(`  ${url}`);
    console.log("手机和电脑需要连同一个 Wi-Fi。");
  }
  console.log("");
});
