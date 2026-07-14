const fields = {
  topic: document.querySelector("#topic"),
  inviteCode: document.querySelector("#inviteCode"),
  audience: document.querySelector("#audience"),
  style: document.querySelector("#style"),
  goal: document.querySelector("#goal"),
  mode: document.querySelector("#mode"),
  model: document.querySelector("#model"),
  length: document.querySelector("#length"),
  temperature: document.querySelector("#temperature"),
  thinking: document.querySelector("#thinking"),
  extra: document.querySelector("#extra")
};

const output = document.querySelector("#output");
const generateButton = document.querySelector("#generate");
const generateTitlesButton = document.querySelector("#generateTitles");
const stopButton = document.querySelector("#stop");
const saveButton = document.querySelector("#save");
const copyButton = document.querySelector("#copy");
const downloadButton = document.querySelector("#download");
const statusEl = document.querySelector("#status");
const countEl = document.querySelector("#count");
const resultTitle = document.querySelector("#resultTitle");
const historyList = document.querySelector("#historyList");
const clearDraftButton = document.querySelector("#clearDraft");
const mobileNavButtons = document.querySelectorAll("[data-scroll-target]");
const inviteCodeLabel = document.querySelector("#inviteCodeLabel");
const adminInviteBox = document.querySelector("#adminInviteBox");
const adminPassword = document.querySelector("#adminPassword");
const inviteButtons = document.querySelectorAll("[data-invite-duration]");
const inviteResult = document.querySelector("#inviteResult");
const inviteList = document.querySelector("#inviteList");
const refreshInvitesButton = document.querySelector("#refreshInvites");

let controller = null;
let currentMode = "article";
let saveTimer = null;
let serverRequiresInvite = false;
let articleRawText = "";

const draftKey = "sdeWriter.currentDraft.v1";
const historyKey = "sdeWriter.articleHistory.v1";
const adminPasswordKey = "sdeWriter.adminPassword.v1";

function getPayload() {
  return {
    topic: fields.topic.value.trim(),
    inviteCode: fields.inviteCode.value.trim(),
    audience: fields.audience.value.trim(),
    style: fields.style.value.trim(),
    goal: fields.goal.value.trim(),
    mode: fields.mode.value,
    model: fields.model.value,
    length: fields.length.value.trim(),
    temperature: Number(fields.temperature.value || 0.7),
    thinking: fields.thinking.checked,
    extra: fields.extra.value.trim()
  };
}

function setBusy(isBusy) {
  generateButton.disabled = isBusy;
  generateTitlesButton.disabled = isBusy;
  stopButton.disabled = !isBusy;
}

function updateCount() {
  const text = getOutputText();
  countEl.textContent = `${text.replace(/\s/g, "").length} 字`;
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function documentHtml(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let paragraph = [];
  const flushParagraph = () => {
    const content = stripMarkdown(paragraph.join(" "));
    if (content) blocks.push(`<p>${escapeHtml(content)}</p>`);
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    if (/^[-*_]{3,}$/.test(line)) {
      flushParagraph();
      continue;
    }
    const markdownHeading = line.match(/^#{1,6}\s+(.+)$/);
    const boldHeading = line.match(/^\*\*(.+?)\*\*[:：]?$/);
    const heading = markdownHeading?.[1] || boldHeading?.[1];
    if (heading) {
      flushParagraph();
      blocks.push(`<h3>${escapeHtml(stripMarkdown(heading))}</h3>`);
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      blocks.push(`<p class="doc-list">${escapeHtml(stripMarkdown(line.replace(/^[-*•]\s+/, "")))}</p>`);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks.join("");
}

function renderDocument() {
  output.classList.remove("title-cards");
  output.classList.add("word-document");
  output.innerHTML = documentHtml(articleRawText);
  output.scrollTop = output.scrollHeight;
}

function setOutputText(text) {
  articleRawText = String(text || "");
  renderDocument();
  updateCount();
}

function appendOutputText(text) {
  articleRawText += text;
  renderDocument();
  updateCount();
  scheduleAutosave();
}

async function readGeneratedStream(response, onText) {
  const contentType = response.headers.get("content-type") || "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  if (!contentType.includes("text/event-stream")) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onText(decoder.decode(value, { stream: true }));
    }
    return;
  }

  function handleEvent(block) {
    const lines = block.split("\n").map((line) => line.trimEnd());
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLines = lines.filter((line) => line.startsWith("data:"));
    const eventName = eventLine ? eventLine.slice(6).trim() : "message";
    const dataText = dataLines.map((line) => line.slice(5).trim()).join("\n");

    if (!dataText || eventName === "done") return;

    try {
      const data = JSON.parse(dataText);
      if (data.text) onText(data.text);
    } catch {
      onText(dataText);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      if (part.trim() && !part.startsWith(":")) handleEvent(part);
    }
  }

  if (buffer.trim() && !buffer.startsWith(":")) handleEvent(buffer);
}

function getOutputText() {
  return articleRawText || output.textContent || "";
}

function scheduleAutosave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveCurrentDraft, 250);
}

function saveCurrentDraft() {
  const data = {
    ...getPayload(),
    resultTitle: resultTitle.textContent || "生成结果",
    output: getOutputText(),
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(draftKey, JSON.stringify(data));
  if (adminPassword) {
    sessionStorage.setItem(adminPasswordKey, adminPassword.value);
  }
}

function loadCurrentDraft() {
  const raw = localStorage.getItem(draftKey);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    for (const [key, field] of Object.entries(fields)) {
      if (!(key in data)) continue;
      if (field.type === "checkbox") {
        field.checked = Boolean(data[key]);
      } else {
        field.value = data[key] ?? "";
      }
    }
    resultTitle.textContent = data.resultTitle || "已恢复草稿";
    setOutputText(data.output || "已恢复上次输入。");
  } catch {
    localStorage.removeItem(draftKey);
  }
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(historyKey) || "[]");
  } catch {
    return [];
  }
}

function writeHistory(items) {
  localStorage.setItem(historyKey, JSON.stringify(items.slice(0, 30)));
  renderHistory();
}

function saveArticleToHistory() {
  const text = getOutputText().trim();
  if (!text) {
    setOutputText("当前没有可保存的文章或结果。");
    scheduleAutosave();
    return;
  }

  const payload = getPayload();
  const item = {
    id: `${Date.now()}`,
    title: payload.topic || resultTitle.textContent || "未命名文章",
    mode: payload.mode,
    audience: payload.audience,
    style: payload.style,
    goal: payload.goal,
    length: payload.length,
    extra: payload.extra,
    output: text,
    resultTitle: resultTitle.textContent || "已保存文章",
    savedAt: new Date().toISOString()
  };

  writeHistory([item, ...readHistory()]);
  saveButton.textContent = "已保存";
  setTimeout(() => {
    saveButton.textContent = "保存当前文章";
  }, 1200);
}

function formatTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderHistory() {
  const items = readHistory();
  historyList.innerHTML = "";

  if (!items.length) {
    historyList.textContent = "暂无保存记录。";
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "history-item";

    const main = document.createElement("button");
    main.type = "button";
    main.className = "history-open";
    main.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${formatTime(item.savedAt)} · ${(item.output || "").replace(/\s/g, "").length} 字</span>`;
    main.addEventListener("click", () => {
      fields.topic.value = item.title || "";
      fields.audience.value = item.audience || fields.audience.value;
      fields.style.value = item.style || fields.style.value;
      fields.goal.value = item.goal || fields.goal.value;
      fields.length.value = item.length || fields.length.value;
      fields.extra.value = item.extra || "";
      fields.mode.value = item.mode || fields.mode.value;
      resultTitle.textContent = item.resultTitle || "历史文章";
      output.classList.remove("title-cards");
      setOutputText(item.output || "");
      scheduleAutosave();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "history-delete";
    remove.textContent = "删除";
    remove.addEventListener("click", () => {
      writeHistory(readHistory().filter((saved) => saved.id !== item.id));
    });

    row.appendChild(main);
    row.appendChild(remove);
    historyList.appendChild(row);
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    statusEl.textContent = data.hasApiKey ? "API 已就绪" : "未配置 Key";
    serverRequiresInvite = Boolean(data.requiresInvite);
    if (inviteCodeLabel) {
      inviteCodeLabel.hidden = !serverRequiresInvite;
    }
    if (serverRequiresInvite) {
      statusEl.textContent = "需要邀请码";
    }
    if (adminInviteBox) {
      adminInviteBox.hidden = !Boolean(data.hasAdmin);
    }
  } catch {
    statusEl.textContent = "未连接";
  }
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function generateInvite(duration) {
  const password = adminPassword.value.trim();
  if (!password) {
    inviteResult.textContent = "请先输入管理员密码。";
    return;
  }

  inviteResult.textContent = "正在生成邀请码...";

  try {
    const response = await fetch("/api/invites/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminPassword: password, duration })
    });
    const data = await response.json();

    if (!response.ok) {
      inviteResult.textContent = data.error || "生成失败。";
      return;
    }

    inviteResult.innerHTML = [
      `<strong>${escapeHtml(data.invite.code)}</strong>`,
      `<span>${escapeHtml(data.invite.label)}有效，到期：${escapeHtml(formatDateTime(data.invite.expiresAt))}</span>`
    ].join("");
    await navigator.clipboard.writeText(data.invite.code).catch(() => {});
    await loadInvites();
  } catch (error) {
    inviteResult.textContent = `生成失败：${error.message || error}`;
  }
}

async function loadInvites() {
  const password = adminPassword.value.trim();
  if (!password) return;

  try {
    const response = await fetch("/api/invites/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminPassword: password })
    });
    const data = await response.json();

    if (!response.ok) {
      inviteList.textContent = data.error || "读取失败。";
      return;
    }

    renderInvites(data.invites || []);
  } catch (error) {
    inviteList.textContent = `读取失败：${error.message || error}`;
  }
}

function renderInvites(invites) {
  inviteList.innerHTML = "";

  if (!invites.length) {
    inviteList.textContent = "暂无有效邀请码。";
    return;
  }

  for (const invite of invites) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "history-open invite-code-row";
    row.innerHTML = `<strong>${escapeHtml(invite.code)}</strong><span>${escapeHtml(invite.label)} · 到期 ${escapeHtml(formatDateTime(invite.expiresAt))}</span>`;
    row.addEventListener("click", async () => {
      await navigator.clipboard.writeText(invite.code).catch(() => {});
      inviteResult.textContent = `已复制邀请码：${invite.code}`;
    });
    inviteList.appendChild(row);
  }
}

async function generate() {
  const payload = getPayload();
  if (!payload.topic && payload.mode !== "polish") {
      setOutputText("请先填写文章主题。");
      scheduleAutosave();
      return;
  }

  currentMode = "article";
  controller = new AbortController();
  setBusy(true);
  setOutputText("正在连接写作引擎...");
  resultTitle.textContent = payload.mode === "outline" ? "构思和大纲" : "公众号文章";
  updateCount();
  scheduleAutosave();

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        setOutputText(data.detail ? `${data.error}\n\n${data.detail}` : data.error);
      } catch {
        setOutputText(text || "生成失败。");
      }
      updateCount();
      scheduleAutosave();
      return;
    }

    setOutputText("");
    await readGeneratedStream(response, appendOutputText);
  } catch (error) {
    if (error.name !== "AbortError") {
      appendOutputText(`\n\n生成中断：${error.message || error}`);
    }
  } finally {
    setBusy(false);
    controller = null;
    saveCurrentDraft();
  }
}

async function generateTitles() {
  const payload = getPayload();
  if (!payload.topic) {
    setOutputText("请先在“文章主题”里写一个标题方向，比如：秒懂小学奥数的整除特征。");
    scheduleAutosave();
    return;
  }

  currentMode = "titles";
  controller = new AbortController();
  setBusy(true);
  output.classList.remove("title-cards");
  setOutputText("正在生成标题...");
  resultTitle.textContent = "5个十万加标题";
  updateCount();
  scheduleAutosave();

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        mode: "titles",
        length: "只生成5个标题",
        temperature: Math.max(Number(payload.temperature || 0.7), 0.8)
      }),
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        setOutputText(data.detail ? `${data.error}\n\n${data.detail}` : data.error);
      } catch {
        setOutputText(text || "生成失败。");
      }
      updateCount();
      scheduleAutosave();
      return;
    }

    setOutputText("");
    await readGeneratedStream(response, appendOutputText);

    renderTitleChoices(articleRawText);
    scheduleAutosave();
  } catch (error) {
    if (error.name !== "AbortError") {
      appendOutputText(`\n\n生成中断：${error.message || error}`);
    }
  } finally {
    setBusy(false);
    controller = null;
    saveCurrentDraft();
  }
}

function extractTitle(line) {
  return line
    .replace(/^\s*\d+\s*[\.、)：:]\s*/, "")
    .replace(/^《(.+?)》.*$/, "$1")
    .replace(/^["“](.+?)["”].*$/, "$1")
    .replace(/\s*(选择理由|理由|推荐理由)\s*[：:].*$/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function renderTitleChoices(rawText) {
  const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
  const choices = [];

  for (const line of lines) {
    if (/^\d+\s*[\.、)：:]/.test(line)) {
      const title = extractTitle(line);
      if (title && !choices.some((item) => item.title === title)) {
        choices.push({ title, raw: line });
      }
    }
  }

  if (!choices.length) return;

  output.classList.add("title-cards");
  output.classList.remove("word-document");
  output.innerHTML = "";

  const intro = document.createElement("p");
  intro.className = "title-hint";
  intro.textContent = "点击喜欢的标题，它会自动填入左侧“文章主题”。";
  output.appendChild(intro);

  for (const choice of choices.slice(0, 5)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "title-choice";
    button.textContent = choice.raw;
    button.addEventListener("click", () => {
      fields.topic.value = choice.title;
      resultTitle.textContent = "已选标题";
      output.classList.remove("title-cards");
      setOutputText(`已选择标题：\n\n${choice.title}\n\n现在可以把“生成模式”改为“直接写完整长文”，再点击“开始生成”。`);
      scheduleAutosave();
    });
    output.appendChild(button);
  }

  updateCount();
}

function stop() {
  if (controller) controller.abort();
}

async function copyResult() {
  const plainText = getOutputText();
  const richText = `<html><body><h1>${escapeHtml(resultTitle.textContent || "公众号文章")}</h1>${documentHtml(plainText)}</body></html>`;
  if (window.ClipboardItem && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": new Blob([plainText], { type: "text/plain;charset=utf-8" }),
      "text/html": new Blob([richText], { type: "text/html;charset=utf-8" })
    })]);
  } else {
    await navigator.clipboard.writeText(plainText);
  }
  copyButton.textContent = "已复制";
  setTimeout(() => {
    copyButton.textContent = "复制结果";
  }, 1200);
}

function clearCurrentDraft() {
  localStorage.removeItem(draftKey);
  fields.topic.value = "";
  fields.extra.value = "";
  resultTitle.textContent = "等待选题";
  output.classList.remove("title-cards");
  setOutputText("当前草稿已清空。历史记录不会被删除。");
}

function downloadWord() {
  const title = (fields.topic.value.trim() || "公众号文章").replace(/[\\/:*?"<>|]/g, "-");
  const content = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:'Microsoft YaHei','PingFang SC',sans-serif;max-width:760px;margin:0 auto;font-size:12pt;line-height:1.9;color:#222}h1{font-size:22pt;line-height:1.35;margin:0 0 22pt}h3{font-size:15pt;margin:22pt 0 10pt}p{margin:0 0 12pt;text-indent:2em}.doc-list{text-indent:0;padding-left:1em}</style></head><body><h1>${escapeHtml(resultTitle.textContent || title)}</h1>${documentHtml(getOutputText())}</body></html>`;
  const blob = new Blob([content], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title}.doc`;
  link.click();
  URL.revokeObjectURL(url);
}

generateButton.addEventListener("click", generate);
generateTitlesButton.addEventListener("click", generateTitles);
stopButton.addEventListener("click", stop);
saveButton.addEventListener("click", saveArticleToHistory);
copyButton.addEventListener("click", copyResult);
downloadButton.addEventListener("click", downloadWord);
clearDraftButton.addEventListener("click", clearCurrentDraft);
output.addEventListener("input", () => {
  updateCount();
  scheduleAutosave();
});

for (const field of Object.values(fields)) {
  field.addEventListener("input", scheduleAutosave);
  field.addEventListener("change", scheduleAutosave);
}

for (const button of mobileNavButtons) {
  button.addEventListener("click", () => {
    const target = document.querySelector(`#${button.dataset.scrollTarget}`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (adminPassword) {
  adminPassword.value = sessionStorage.getItem(adminPasswordKey) || "";
  adminPassword.addEventListener("input", () => {
    sessionStorage.setItem(adminPasswordKey, adminPassword.value);
  });
}

for (const button of inviteButtons) {
  button.addEventListener("click", () => generateInvite(button.dataset.inviteDuration));
}

if (refreshInvitesButton) {
  refreshInvitesButton.addEventListener("click", loadInvites);
}

loadCurrentDraft();
renderHistory();
checkHealth();
