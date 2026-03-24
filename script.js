const STORAGE_KEY = "mood-tracker-entries-v1";
const MOOD_SCORES = {
  很低落: 1,
  有点低: 2,
  平稳: 3,
  不错: 4,
  很开心: 5
};

const form = document.getElementById("trackerForm");
const resetButton = document.getElementById("resetButton");
const exportButton = document.getElementById("exportButton");
const historyList = document.getElementById("historyList");
const entryTemplate = document.getElementById("entryTemplate");
const formMessage = document.getElementById("formMessage");
const totalEntries = document.getElementById("totalEntries");
const latestMood = document.getElementById("latestMood");
const exerciseRate = document.getElementById("exerciseRate");
const dateInput = document.getElementById("date");
const calendarTitle = document.getElementById("calendarTitle");
const calendarGrid = document.getElementById("calendarGrid");
const prevMonthButton = document.getElementById("prevMonthButton");
const nextMonthButton = document.getElementById("nextMonthButton");
const moodChart = document.getElementById("moodChart");
const chartEmptyState = document.getElementById("chartEmptyState");

const today = new Date();
const todayKey = toDateValue(today);
dateInput.value = todayKey;

let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = todayKey;
let entries = loadEntries();

render();
setupPwa();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const entry = {
    id: crypto.randomUUID(),
    date: formData.get("date"),
    mood: formData.get("mood"),
    exercise: normalizeMultiSelect(formData.getAll("exercise"), "没有运动"),
    periodStatus: formData.get("periodStatus"),
    mealStatus: formData.get("mealStatus"),
    discomfort: normalizeMultiSelect(formData.getAll("discomfort"), "没有明显不适"),
    notes: String(formData.get("notes") || "").trim(),
    createdAt: new Date().toISOString()
  };

  const existingIndex = entries.findIndex((item) => item.date === entry.date);

  if (existingIndex >= 0) {
    entry.id = entries[existingIndex].id;
    entry.createdAt = entries[existingIndex].createdAt;
    entries[existingIndex] = entry;
    showMessage("已更新这一天的记录。");
  } else {
    entries.unshift(entry);
    showMessage("今天的状态已经保存。");
  }

  entries = sortEntries(entries);
  selectedDate = entry.date;
  currentMonth = new Date(getDateParts(entry.date).year, getDateParts(entry.date).month - 1, 1);
  saveEntries(entries);
  render();
});

resetButton.addEventListener("click", () => {
  form.reset();
  dateInput.value = todayKey;
  selectedDate = todayKey;
  showMessage("表单已清空，可以重新填写。");
  renderCalendar();
});

exportButton.addEventListener("click", () => {
  if (!entries.length) {
    showMessage("还没有数据可以导出。");
    return;
  }

  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mood-tracker-${todayKey}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showMessage("已导出 JSON 文件。");
});

historyList.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const { entryId } = target.dataset;
  if (!entryId) {
    return;
  }

  entries = entries.filter((entry) => entry.id !== entryId);
  saveEntries(entries);

  if (!entries.some((entry) => entry.date === selectedDate)) {
    selectedDate = dateInput.value || todayKey;
  }

  render();
  showMessage("这条记录已删除。");
});

calendarGrid.addEventListener("click", (event) => {
  const target = event.target.closest("[data-date]");
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const date = target.dataset.date;
  if (!date) {
    return;
  }

  selectedDate = date;
  loadEntryIntoForm(date);
  renderCalendar();
});

prevMonthButton.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

function render() {
  renderSummary();
  renderCalendar();
  renderChart();
  renderHistory();
}

function renderSummary() {
  totalEntries.textContent = String(entries.length);
  latestMood.textContent = entries[0]?.mood || "-";

  if (!entries.length) {
    exerciseRate.textContent = "0%";
    return;
  }

  const activeDays = entries.filter((entry) => !entry.exercise.includes("没有运动")).length;
  exerciseRate.textContent = `${Math.round((activeDays / entries.length) * 100)}%`;
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  calendarTitle.textContent = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long"
  }).format(currentMonth);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const firstWeekday = (monthStart.getDay() + 6) % 7;

  for (let i = 0; i < firstWeekday; i += 1) {
    calendarGrid.appendChild(createEmptyDay());
  }

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const dateKey = toDateValue(date);
    const entry = entries.find((item) => item.date === dateKey);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.date = dateKey;

    if (!entry) {
      button.classList.add("empty");
    } else {
      button.classList.add("has-entry");
    }

    if (dateKey === todayKey) {
      button.classList.add("today");
    }

    if (dateKey === selectedDate) {
      button.classList.add("selected");
    }

    button.innerHTML = `
      <span class="day-number">${day}</span>
      ${entry ? `<span class="day-badge ${getMoodClass(entry.mood)}">${entry.mood}</span>` : ""}
      <span class="day-subtext">${entry ? summarizeDay(entry) : "暂无记录"}</span>
    `;

    calendarGrid.appendChild(button);
  }
}

function renderChart() {
  const chartEntries = [...entries]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-14);

  if (chartEntries.length < 2) {
    moodChart.hidden = true;
    chartEmptyState.hidden = false;
    return;
  }

  moodChart.hidden = false;
  chartEmptyState.hidden = true;

  syncCanvasSize();

  const context = moodChart.getContext("2d");
  const width = moodChart.width;
  const height = moodChart.height;
  const padding = { top: 28, right: 24, bottom: 48, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const stepX = chartWidth / Math.max(chartEntries.length - 1, 1);

  context.clearRect(0, 0, width, height);

  context.strokeStyle = "rgba(87, 57, 37, 0.12)";
  context.lineWidth = 1;
  context.font = '14px "Noto Sans SC", sans-serif';
  context.fillStyle = "#7c6658";

  for (let score = 1; score <= 5; score += 1) {
    const y = padding.top + ((5 - score) / 4) * chartHeight;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(getMoodLabel(score), 8, y + 5);
  }

  const points = chartEntries.map((entry, index) => {
    const score = MOOD_SCORES[entry.mood] || 3;
    return {
      x: padding.left + index * stepX,
      y: padding.top + ((5 - score) / 4) * chartHeight,
      score,
      label: entry.mood,
      date: entry.date
    };
  });

  const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, "rgba(191, 95, 60, 0.30)");
  gradient.addColorStop(1, "rgba(191, 95, 60, 0.02)");

  context.beginPath();
  context.moveTo(points[0].x, height - padding.bottom);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, height - padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.strokeStyle = "#bf5f3c";
  context.lineWidth = 3;
  context.stroke();

  points.forEach((point, index) => {
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fillStyle = getMoodColor(point.score);
    context.fill();
    context.strokeStyle = "#fffdf9";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = "#7c6658";
    context.textAlign = index === 0 ? "left" : index === points.length - 1 ? "right" : "center";
    context.fillText(formatShortDate(point.date), point.x, height - 16);
  });

  context.textAlign = "left";
}

function renderHistory() {
  historyList.innerHTML = "";

  if (!entries.length) {
    historyList.className = "history-list empty-state";
    historyList.textContent = "还没有记录，先填写今天的状态吧。";
    return;
  }

  historyList.className = "history-list";

  entries.forEach((entry) => {
    const node = entryTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".entry-date").textContent = formatDate(entry.date);
    node.querySelector(".entry-mood").textContent = entry.mood;
    node.querySelector(".entry-period").textContent = entry.periodStatus;
    node.querySelector(".entry-meal").textContent = entry.mealStatus;
    node.querySelector(".entry-discomfort").textContent = entry.discomfort.join("、");

    const notes = node.querySelector(".entry-notes");
    notes.textContent = entry.notes || "今天没有额外备注。";

    const tagRow = node.querySelector(".entry-exercise");
    entry.exercise.forEach((item) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = item;
      tagRow.appendChild(tag);
    });

    const deleteButton = node.querySelector(".delete-button");
    deleteButton.dataset.entryId = entry.id;

    historyList.appendChild(node);
  });
}

function loadEntryIntoForm(date) {
  const entry = entries.find((item) => item.date === date);
  form.reset();
  dateInput.value = date;

  if (!entry) {
    showMessage(`已切换到 ${formatDate(date)}，可以开始填写。`);
    return;
  }

  const moodInput = form.querySelector(`input[name="mood"][value="${entry.mood}"]`);
  if (moodInput) {
    moodInput.checked = true;
  }

  setCheckboxGroup("exercise", entry.exercise);
  setCheckboxGroup("discomfort", entry.discomfort);

  document.getElementById("periodStatus").value = entry.periodStatus;
  document.getElementById("mealStatus").value = entry.mealStatus;
  document.getElementById("notes").value = entry.notes;

  showMessage(`已载入 ${formatDate(date)} 的记录。`);
}

function setupPwa() {
  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.addEventListener("resize", () => {
    renderChart();
  });
}

function syncCanvasSize() {
  const rect = moodChart.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(Math.floor(rect.width * pixelRatio), 320);
  const height = Math.max(Math.floor(rect.height * pixelRatio), 220);

  if (moodChart.width !== width || moodChart.height !== height) {
    moodChart.width = width;
    moodChart.height = height;
  }
}

function setCheckboxGroup(name, values) {
  const selected = new Set(values);
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function createEmptyDay() {
  const cell = document.createElement("div");
  cell.className = "calendar-day empty";
  cell.setAttribute("aria-hidden", "true");
  return cell;
}

function summarizeDay(entry) {
  const fragments = [];
  fragments.push(entry.exercise.includes("没有运动") ? "未运动" : "有运动");

  if (entry.periodStatus === "来了") {
    fragments.push("姨妈中");
  }

  if (!entry.discomfort.includes("没有明显不适")) {
    fragments.push("有不适");
  }

  return fragments.join(" · ");
}

function getMoodClass(mood) {
  const score = MOOD_SCORES[mood] || 3;
  if (score <= 2) {
    return "low";
  }
  if (score === 3) {
    return "mid";
  }
  return "high";
}

function getMoodColor(score) {
  if (score <= 2) {
    return "#cb6a58";
  }
  if (score === 3) {
    return "#f0c36a";
  }
  return "#7eab72";
}

function getMoodLabel(score) {
  const labels = {
    1: "低落",
    2: "偏低",
    3: "平稳",
    4: "不错",
    5: "开心"
  };
  return labels[score];
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortEntries(parsed) : [];
  } catch {
    return [];
  }
}

function saveEntries(nextEntries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
}

function sortEntries(list) {
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function normalizeMultiSelect(values, emptyValue) {
  const items = values.filter(Boolean);
  if (!items.length) {
    return [emptyValue];
  }

  if (items.includes(emptyValue)) {
    return [emptyValue];
  }

  return items;
}

function toDateValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function formatShortDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getDateParts(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
}

function showMessage(message) {
  formMessage.textContent = message;
}
