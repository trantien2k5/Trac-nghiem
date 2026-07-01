// Lưu trữ toàn bộ dữ liệu ở phía trình duyệt (localStorage) — không cần backend.

const HISTORY_KEY = 'quizapp_history_v1';
const PROGRESS_KEY = 'quizapp_progress_v1';
const HISTORY_LIMIT = 30;

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAttempt(attempt) {
  const history = loadHistory();
  history.unshift(attempt);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage đầy hoặc bị chặn: bỏ qua, không chặn luồng làm bài.
  }
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // ignore quota errors
  }
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearProgress() {
  localStorage.removeItem(PROGRESS_KEY);
}
