const STORAGE_KEY = "mood-tracker-entries-v6";
const MOOD_SCORES = {
  "Very low": 1,
  "A bit low": 2,
  Steady: 3,
  Good: 4,
  Happy: 5
};

let form;
let resetButton;
let exportButton;
let historyList;
let entryTemplate;
let formMessage;
let totalEntries;
let latestMood;
let exerciseRate;
let dateInput;
let weightInput;
let calendarTitle;
let calendarGrid;
let prevMonthButton;
let nextMonthButton;
let moodChart;
let moodChartEmptyState;
let weightChart;
let weightChartEmptyState;
let authTitle;
let authStatus;
let loginButton;
let logoutButton;

const today = new Date();
const todayKey = toDateValue(today);

let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = todayKey;
let entries = [];

let auth = null;
let db = null;
let firebaseEnabled = false;
let currentUser = null;

window.addEventListener("load", initApp);
window.handleGoogleLogin = () => {
  signInWithGoogle();
};

function initApp() {
  bindElements();
  dateInput.value = todayKey;
  bindEvents();
  initFirebase();
}

function bindElements() {
  form = document.getElementById("trackerForm");
  resetButton = document.getElementById("resetButton");
  exportButton = document.getElementById("exportButton");
  historyList = document.getElementById("historyList");
  entryTemplate = document.getElementById("entryTemplate");
  formMessage = document.getElementById("formMessage");
  totalEntries = document.getElementById("totalEntries");
  latestMood = document.getElementById("latestMood");
  exerciseRate = document.getElementById("exerciseRate");
  dateInput = document.getElementById("date");
  weightInput = document.getElementById("weight");
  calendarTitle = document.getElementById("calendarTitle");
  calendarGrid = document.getElementById("calendarGrid");
  prevMonthButton = document.getElementById("prevMonthButton");
  nextMonthButton = document.getElementById("nextMonthButton");
  moodChart = document.getElementById("moodChart");
  moodChartEmptyState = document.getElementById("moodChartEmptyState");
  weightChart = document.getElementById("weightChart");
  weightChartEmptyState = document.getElementById("weightChartEmptyState");
  authTitle = document.getElementById("authTitle");
  authStatus = document.getElementById("authStatus");
  loginButton = document.getElementById("loginButton");
  logoutButton = document.getElementById("logoutButton");
}

function bindEvents() {
  form.addEventListener("submit", handleSubmit);
  resetButton.addEventListener("click", handleReset);
  exportButton.addEventListener("click", handleExport);
  historyList.addEventListener("click", handleHistoryClick);
  calendarGrid.addEventListener("click", handleCalendarClick);
  prevMonthButton.addEventListener("click", () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  nextMonthButton.addEventListener("click", () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  loginButton.addEventListener("click", signInWithGoogle);
  logoutButton.addEventListener("click", signOutUser);
  window.addEventListener("resize", () => {
    renderMoodChart();
    renderWeightChart();
  });
}

function initFirebase() {
  const firebaseOptions = window.MOOD_TRACKER_FIREBASE;
  const config = firebaseOptions?.config || {};
  firebaseEnabled = Boolean(
    firebaseOptions?.enabled &&
    window.firebase &&
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.appId
  );

  if (!firebaseEnabled) {
    entries = loadEntriesFromLocal();
    updateAuthUi();
    render();
    return;
  }

  firebase.initializeApp(config);
  auth = firebase.auth();
  db = firebase.firestore();
  auth.useDeviceLanguage();

  auth.getRedirectResult().catch((error) => {
    showAuthError(error);
  });

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    updateAuthUi();

    if (currentUser) {
      await loadEntriesFromCloud();
    } else {
      entries = [];
      render();
    }
  });
}

async function handleSubmit(event) {
  event.preventDefault();

  if (firebaseEnabled && !currentUser) {
    showMessage("Sign in with Google to save and sync your entries.");
    return;
  }

  const formData = new FormData(form);
  const weightRaw = String(formData.get("weight") || "").trim();
  const parsedWeight = weightRaw ? Number(weightRaw) : null;
  const entry = {
    id: crypto.randomUUID(),
    date: formData.get("date"),
    mood: formData.get("mood"),
    exercise: normalizeMultiSelect(formData.getAll("exercise"), "No exercise"),
    periodStatus: formData.get("periodStatus"),
    mealStatus: formData.get("mealStatus"),
    weight: Number.isFinite(parsedWeight) ? Number(parsedWeight.toFixed(1)) : null,
    discomfort: normalizeMultiSelect(formData.getAll("discomfort"), "None"),
    notes: String(formData.get("notes") || "").trim(),
    createdAt: new Date().toISOString()
  };

  const existingIndex = entries.findIndex((item) => item.date === entry.date);

  if (existingIndex >= 0) {
    entry.id = entries[existingIndex].id;
    entry.createdAt = entries[existingIndex].createdAt;
    entries[existingIndex] = entry;
    showMessage("Updated this day's entry.");
  } else {
    entries.unshift(entry);
    showMessage("Today's entry has been saved.");
  }

  entries = sortEntries(entries);
  selectedDate = entry.date;
  currentMonth = new Date(getDateParts(entry.date).year, getDateParts(entry.date).month - 1, 1);

  if (firebaseEnabled && currentUser) {
    await saveEntryToCloud(entry);
  } else {
    saveEntriesToLocal(entries);
  }

  render();
}

function handleReset() {
  form.reset();
  dateInput.value = todayKey;
  weightInput.value = "";
  selectedDate = todayKey;
  showMessage("The form has been reset.");
  renderCalendar();
}

function handleExport() {
  if (!entries.length) {
    showMessage("No data to export yet.");
    return;
  }

  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mood-tracker-${todayKey}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showMessage("JSON file exported.");
}

async function handleHistoryClick(event) {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const { entryId } = target.dataset;
  if (!entryId) {
    return;
  }

  const entryToDelete = entries.find((entry) => entry.id === entryId);
  entries = entries.filter((entry) => entry.id !== entryId);

  if (firebaseEnabled && currentUser && entryToDelete) {
    await deleteEntryFromCloud(entryToDelete.date);
  } else {
    saveEntriesToLocal(entries);
  }

  if (!entries.some((entry) => entry.date === selectedDate)) {
    selectedDate = dateInput.value || todayKey;
  }

  render();
  showMessage("This entry has been deleted.");
}

function handleCalendarClick(event) {
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
}

function updateAuthUi() {
  if (!firebaseEnabled) {
    authTitle.textContent = "Local mode";
    authStatus.textContent = "Cloud sync is not configured yet. Your data is saved only in this browser.";
    loginButton.hidden = true;
    logoutButton.hidden = true;
    return;
  }

  if (currentUser) {
    authTitle.textContent = "Google account connected";
    authStatus.textContent = `Signed in as ${currentUser.displayName || currentUser.email}. Only your own records will load here.`;
    loginButton.hidden = true;
    logoutButton.hidden = false;
    return;
  }

  authTitle.textContent = "Sign in to sync";
  authStatus.textContent = "Sign in with Google to keep your records private to your own account and sync them across devices.";
  loginButton.hidden = false;
  logoutButton.hidden = true;
}

async function signInWithGoogle() {
  if (!firebaseEnabled || !auth) {
    showMessage("Google sign-in is not configured yet.");
    return;
  }

  showMessage("Starting Google sign-in...");

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    if (isMobileDevice()) {
      showMessage("Redirecting to Google sign-in...");
      await auth.signInWithRedirect(provider);
      return;
    }

    await auth.signInWithPopup(provider);
  } catch (error) {
    if (error?.code === "auth/popup-blocked" || error?.code === "auth/cancelled-popup-request") {
      try {
        showMessage("Popup was blocked. Switching to redirect sign-in...");
        await auth.signInWithRedirect(provider);
        return;
      } catch (redirectError) {
        showAuthError(redirectError);
        return;
      }
    }

    showAuthError(error);
  }
}

async function signOutUser() {
  if (!auth) {
    return;
  }

  await auth.signOut();
  showMessage("Signed out.");
}

async function loadEntriesFromCloud() {
  const snapshot = await db
    .collection("users")
    .doc(currentUser.uid)
    .collection("entries")
    .orderBy("date", "desc")
    .get();

  entries = snapshot.docs.map((doc) => normalizeEntry(doc.data()));
  render();
}

async function saveEntryToCloud(entry) {
  await db
    .collection("users")
    .doc(currentUser.uid)
    .collection("entries")
    .doc(entry.date)
    .set(entry);
}

async function deleteEntryFromCloud(date) {
  await db
    .collection("users")
    .doc(currentUser.uid)
    .collection("entries")
    .doc(date)
    .delete();
}

function normalizeEntry(entry) {
  return {
    ...entry,
    exercise: Array.isArray(entry.exercise) ? entry.exercise : [],
    discomfort: Array.isArray(entry.discomfort) ? entry.discomfort : [],
    weight: typeof entry.weight === "number" ? entry.weight : null
  };
}

function render() {
  renderSummary();
  renderCalendar();
  renderMoodChart();
  renderWeightChart();
  renderHistory();
}

function renderSummary() {
  totalEntries.textContent = String(entries.length);
  latestMood.textContent = entries[0]?.mood || "-";

  if (!entries.length) {
    exerciseRate.textContent = "0%";
    return;
  }

  const activeDays = entries.filter((entry) => isExerciseDay(entry)).length;
  exerciseRate.textContent = `${Math.round((activeDays / entries.length) * 100)}%`;
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  calendarTitle.textContent = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short"
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
      <span class="day-subtext">${entry ? summarizeDay(entry) : "No entry"}</span>
    `;

    calendarGrid.appendChild(button);
  }
}

function renderMoodChart() {
  const chartEntries = getEntriesWithinLastMonth(entries);

  renderLineChart({
    canvas: moodChart,
    emptyState: moodChartEmptyState,
    points: chartEntries.map((entry) => ({
      date: entry.date,
      value: MOOD_SCORES[entry.mood] || 3,
      color: getMoodColor(MOOD_SCORES[entry.mood] || 3)
    })),
    minPoints: 2,
    minValue: 1,
    maxValue: 5,
    axisLabel: getMoodLabel,
    lineColor: "#bf5f3c",
    fillTop: "rgba(191, 95, 60, 0.30)",
    fillBottom: "rgba(191, 95, 60, 0.02)"
  });
}

function renderWeightChart() {
  const chartEntries = getEntriesWithinLastMonth(entries)
    .filter((entry) => typeof entry.weight === "number")
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const values = chartEntries.map((entry) => entry.weight);
  const min = values.length ? Math.floor(Math.min(...values)) - 1 : 40;
  const max = values.length ? Math.ceil(Math.max(...values)) + 1 : 80;

  renderLineChart({
    canvas: weightChart,
    emptyState: weightChartEmptyState,
    points: chartEntries.map((entry) => ({
      date: entry.date,
      value: entry.weight,
      color: "#7eab72"
    })),
    minPoints: 2,
    minValue: min,
    maxValue: max === min ? min + 2 : max,
    axisLabel: (value) => `${value}kg`,
    lineColor: "#5d8d57",
    fillTop: "rgba(126, 171, 114, 0.24)",
    fillBottom: "rgba(126, 171, 114, 0.03)"
  });
}

function renderLineChart(config) {
  const {
    canvas,
    emptyState,
    points,
    minPoints,
    minValue,
    maxValue,
    axisLabel,
    lineColor,
    fillTop,
    fillBottom
  } = config;

  if (points.length < minPoints) {
    canvas.hidden = true;
    emptyState.hidden = false;
    return;
  }

  canvas.hidden = false;
  emptyState.hidden = true;

  syncCanvasSize(canvas);

  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 28, right: 24, bottom: 48, left: 52 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const stepX = chartWidth / Math.max(points.length - 1, 1);
  const axisSteps = 5;
  const valueRange = Math.max(maxValue - minValue, 1);

  context.clearRect(0, 0, width, height);
  context.strokeStyle = "rgba(87, 57, 37, 0.12)";
  context.lineWidth = 1;
  context.font = '14px "Noto Sans", sans-serif';
  context.fillStyle = "#7c6658";

  for (let index = 0; index < axisSteps; index += 1) {
    const ratio = index / (axisSteps - 1);
    const y = padding.top + ratio * chartHeight;
    const value = maxValue - ratio * valueRange;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(axisLabel(formatAxisValue(value, minValue, maxValue)), 8, y + 5);
  }

  const chartPoints = points.map((point, index) => {
    const normalized = (point.value - minValue) / valueRange;
    return {
      x: padding.left + index * stepX,
      y: padding.top + (1 - normalized) * chartHeight,
      ...point
    };
  });

  const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, fillTop);
  gradient.addColorStop(1, fillBottom);

  context.beginPath();
  context.moveTo(chartPoints[0].x, height - padding.bottom);
  chartPoints.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(chartPoints[chartPoints.length - 1].x, height - padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  chartPoints.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.strokeStyle = lineColor;
  context.lineWidth = 3;
  context.stroke();

  chartPoints.forEach((point, index) => {
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fillStyle = point.color;
    context.fill();
    context.strokeStyle = "#fffdf9";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = "#7c6658";
    context.textAlign = index === 0 ? "left" : index === chartPoints.length - 1 ? "right" : "center";
    context.fillText(formatShortDate(point.date), point.x, height - 16);
  });

  context.textAlign = "left";
}

function renderHistory() {
  historyList.innerHTML = "";

  if (!entries.length) {
    historyList.className = "history-list empty-state";
    historyList.textContent = firebaseEnabled && !currentUser
      ? "Sign in to see your synced entries."
      : "No entries yet. Start by logging today.";
    return;
  }

  historyList.className = "history-list";

  entries.forEach((entry) => {
    const node = entryTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".entry-date").textContent = formatDate(entry.date);
    node.querySelector(".entry-mood").textContent = entry.mood;
    node.querySelector(".entry-period").textContent = entry.periodStatus;
    node.querySelector(".entry-meal").textContent = entry.mealStatus;
    node.querySelector(".entry-weight").textContent = formatWeight(entry.weight);
    node.querySelector(".entry-discomfort").textContent = entry.discomfort.join(", ");

    const notes = node.querySelector(".entry-notes");
    notes.textContent = entry.notes || "No extra notes for today.";

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
  weightInput.value = "";

  if (!entry) {
    showMessage(`Switched to ${formatDate(date)}. You can start logging now.`);
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
  weightInput.value = typeof entry.weight === "number" ? String(entry.weight) : "";

  showMessage(`Loaded the entry for ${formatDate(date)}.`);
}

function syncCanvasSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(Math.floor(rect.width * pixelRatio), 320);
  const height = Math.max(Math.floor(rect.height * pixelRatio), 220);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
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
  fragments.push(isExerciseDay(entry) ? "Exercised" : "No exercise");

  if (typeof entry.weight === "number") {
    fragments.push(`${entry.weight}kg`);
  }

  if (entry.periodStatus === "On period") {
    fragments.push("Period");
  }

  if (!entry.discomfort.includes("None")) {
    fragments.push("Discomfort");
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
    1: "Very low",
    2: "Low",
    3: "Steady",
    4: "Good",
    5: "Happy"
  };
  return labels[score];
}

function formatAxisValue(value, min, max) {
  const span = max - min;
  if (span <= 8) {
    return Number(value.toFixed(1));
  }
  return Math.round(value);
}

function formatWeight(weight) {
  return typeof weight === "number" ? `${weight.toFixed(1)} kg` : "Not logged";
}

function isExerciseDay(entry) {
  const exerciseItems = Array.isArray(entry.exercise) ? entry.exercise : [];
  const noExerciseValues = new Set(["No exercise", "没有运动"]);

  if (!exerciseItems.length) {
    return false;
  }

  return !exerciseItems.some((item) => noExerciseValues.has(item));
}

function getEntriesWithinLastMonth(list) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);

  return [...list]
    .filter((entry) => {
      const date = new Date(`${entry.date}T00:00:00`);
      return date >= start && date <= end;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function loadEntriesFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortEntries(parsed.map(normalizeEntry)) : [];
  } catch {
    return [];
  }
}

function saveEntriesToLocal(nextEntries) {
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
  return new Intl.DateTimeFormat("en-US", {
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

function showAuthError(error) {
  const message = error?.message || "Google sign-in failed.";
  authStatus.textContent = message;
  showMessage(message);
  console.error(error);
}

function isMobileDevice() {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}
