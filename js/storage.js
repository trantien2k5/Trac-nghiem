// Lưu trữ toàn bộ dữ liệu ở phía trình duyệt (localStorage) — không cần backend.

const HISTORY_KEY = 'quizapp_history_v1';
const PROGRESS_KEY = 'quizapp_progress_v1';
const QUIZZES_KEY = 'quizapp_quizzes_v1';
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

export function loadQuizzes() {
  try {
    const raw = localStorage.getItem(QUIZZES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getQuiz(id) {
  return loadQuizzes().find((q) => q.id === id) || null;
}

// Creates a new saved quiz (no id) or updates an existing one (id set).
// Returns the saved quiz record.
export function saveQuiz({ id, title, rawText }) {
  const quizzes = loadQuizzes();
  const now = new Date().toISOString();

  if (id) {
    const existing = quizzes.find((q) => q.id === id);
    if (existing) {
      existing.title = title;
      existing.rawText = rawText;
      existing.updatedAt = now;
      localStorage.setItem(QUIZZES_KEY, JSON.stringify(quizzes));
      return existing;
    }
  }

  const record = {
    id: `quiz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    rawText,
    createdAt: now,
    updatedAt: now,
  };
  quizzes.unshift(record);
  localStorage.setItem(QUIZZES_KEY, JSON.stringify(quizzes));
  return record;
}

export function deleteQuiz(id) {
  const quizzes = loadQuizzes().filter((q) => q.id !== id);
  localStorage.setItem(QUIZZES_KEY, JSON.stringify(quizzes));
}
