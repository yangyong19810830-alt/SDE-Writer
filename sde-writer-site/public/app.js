const fields = {
  topic: document.querySelector("#topic"),
  apiKey: document.querySelector("#apiKey"),
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
const apiKeyLabel = document.querySelector("#apiKeyLabel");
const inviteCodeLabel = document.querySelector("#inviteCodeLabel");

let controller = null;
let currentMode = "article";
let saveTimer = null;
let serverHasApiKey = false;
let serverRequiresInvite = false;

const draftKey = "sdeWriter.currentDraft.v1";
const historyKey = "sdeWriter.articleHistory.v1";

function getPayload() {
  return {
    topic: fields.topic.value.trim(),
    apiKey: fields.apiKey.value.trim(),
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
  const text = output.textContent || "";
  countEl.textContent = `${text.replace(/\s/g, "").length} 字`;
}

function getOutputText() {
  return output.textContent || "";
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
    output.textContent = data.output || "已恢复上次输入。";
    updateCount();
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
    output.textContent = "当前没有可保存的文章或结果。";
    updateCount();
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
      output.textContent = item.output || "";
      updateCount();
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
    statusEl.textContent = data.hasApiKey ? "API 已就绪" : "页面填写 Key";
    serverHasApiKey = Boolean(data.hasApiKey);
    serverRequiresInvite = Boolean(data.requiresInvite);
    if (serverHasApiKey && apiKeyLabel) {
      apiKeyLabel.hidden = true;
      fields.apiKey.value = "";
    }
    if (inviteCodeLabel) {
      inviteCodeLabel.hidden = !serverRequiresInvite;
    }
    if (serverRequiresInvite) {
      statusEl.textContent = "需要邀请码";
    }
  } catch {
    statusEl.textContent = "未连接";
  }
}

async function generate() {
  const payload = getPayload();
  if (!payload.topic && payload.mode !== "polish") {
      output.textContent = "请先填写文章主题。";
      updateCount();
      scheduleAutosave();
      return;
  }

  currentMode = "article";
  controller = new AbortController();
  setBusy(true);
  output.textContent = "";
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
        output.textContent = data.detail ? `${data.error}\n\n${data.detail}` : data.error;
      } catch {
        output.textContent = text || "生成失败。";
      }
      updateCount();
      scheduleAutosave();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output.textContent += decoder.decode(value, { stream: true });
      output.scrollTop = output.scrollHeight;
      updateCount();
      scheduleAutosave();
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      output.textContent += `\n\n生成中断：${error.message || error}`;
      updateCount();
      scheduleAutosave();
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
    output.textContent = "请先在“文章主题”里写一个标题方向，比如：秒懂小学奥数的整除特征。";
    updateCount();
    scheduleAutosave();
    return;
  }

  currentMode = "titles";
  controller = new AbortController();
  setBusy(true);
  output.classList.remove("title-cards");
  output.textContent = "";
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
        output.textContent = data.detail ? `${data.error}\n\n${data.detail}` : data.error;
      } catch {
        output.textContent = text || "生成失败。";
      }
      updateCount();
      scheduleAutosave();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output.textContent += decoder.decode(value, { stream: true });
      output.scrollTop = output.scrollHeight;
      updateCount();
      scheduleAutosave();
    }

    renderTitleChoices(output.textContent);
    scheduleAutosave();
  } catch (error) {
    if (error.name !== "AbortError") {
      output.textContent += `\n\n生成中断：${error.message || error}`;
      updateCount();
      scheduleAutosave();
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
      output.textContent = `已选择标题：\n\n${choice.title}\n\n现在可以把“生成模式”改为“直接写完整长文”，再点击“开始生成”。`;
      updateCount();
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
  await navigator.clipboard.writeText(output.textContent || "");
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
  output.textContent = "当前草稿已清空。历史记录不会被删除。";
  updateCount();
}

function downloadMarkdown() {
  const title = (fields.topic.value.trim() || "公众号文章").replace(/[\\/:*?"<>|]/g, "-");
  const blob = new Blob([output.textContent || ""], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

generateButton.addEventListener("click", generate);
generateTitlesButton.addEventListener("click", generateTitles);
stopButton.addEventListener("click", stop);
saveButton.addEventListener("click", saveArticleToHistory);
copyButton.addEventListener("click", copyResult);
downloadButton.addEventListener("click", downloadMarkdown);
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

loadCurrentDraft();
renderHistory();
checkHealth();
