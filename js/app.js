import { parseQuizText, shuffleArray, SAMPLE_QUIZ_TEXT } from './parser.js';
import {
  loadHistory, saveAttempt, clearHistory,
  saveProgress, loadProgress, clearProgress,
} from './storage.js';

const $ = (id) => document.getElementById(id);

const screens = {
  home: $('screen-home'),
  exam: $('screen-exam'),
  result: $('screen-result'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Exam runtime state
// ---------------------------------------------------------------------------
let exam = null; // active exam state while on the exam screen
let currentAttempt = null; // last computed attempt shown on the result screen
let timeFieldTouched = false;
let confirmCallback = null;

function buildQuestions(parsedQuestions, shuffleQuestions, shuffleOptions) {
  let questions = shuffleQuestions ? shuffleArray(parsedQuestions) : parsedQuestions.slice();
  questions = questions.map((q) => {
    const options = shuffleOptions ? shuffleArray(q.options) : q.options.slice();
    const withKeys = options.map((o, i) => ({ ...o, displayKey: 'ABCD'[i] }));
    return { id: q.id, text: q.text, options: withKeys };
  });
  return questions;
}

function startExam(config, questions, resumed) {
  const totalSeconds = config.timeLimitMinutes * 60;
  exam = resumed || {
    config,
    questions,
    answers: {},
    flags: {},
    currentIndex: 0,
    totalSeconds,
    endAt: Date.now() + totalSeconds * 1000,
    submitted: false,
  };

  const remaining = Math.max(0, Math.round((exam.endAt - Date.now()) / 1000));
  if (remaining <= 0) {
    submitExam();
    return;
  }

  $('exam-title').textContent = exam.config.title || 'Đề thi';
  showScreen('exam');
  persistProgress();
  renderQuestion();
  startTimer();
}

function startTimer() {
  stopTimer();
  tickTimer();
  exam.timerHandle = setInterval(tickTimer, 1000);
}

function stopTimer() {
  if (exam && exam.timerHandle) {
    clearInterval(exam.timerHandle);
    exam.timerHandle = null;
  }
}

function tickTimer() {
  const remaining = Math.max(0, Math.round((exam.endAt - Date.now()) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const timerEl = $('exam-timer');
  timerEl.textContent = `${mm}:${ss}`;
  timerEl.classList.toggle('time-low', remaining <= 60);
  if (remaining <= 0) {
    submitExam();
  }
}

function renderQuestion() {
  const q = exam.questions[exam.currentIndex];
  const total = exam.questions.length;

  $('exam-progress-text').textContent = `Câu ${exam.currentIndex + 1}/${total}`;
  $('progress-fill').style.width = `${((exam.currentIndex + 1) / total) * 100}%`;
  $('question-number-badge').textContent = `Câu ${exam.currentIndex + 1}`;
  $('question-text').textContent = q.text;

  const flagged = Boolean(exam.flags[q.id]);
  const flagBtn = $('btn-flag');
  flagBtn.setAttribute('aria-pressed', String(flagged));
  $('flag-label').textContent = flagged ? 'Đã đánh dấu' : 'Đánh dấu';

  const selectedKey = exam.answers[q.id];
  const list = $('options-list');
  list.innerHTML = '';
  q.options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn' + (opt.displayKey === selectedKey ? ' selected' : '');
    btn.innerHTML = `<span class="option-key">${opt.displayKey}</span><span class="option-text"></span>`;
    btn.querySelector('.option-text').textContent = opt.text;
    btn.addEventListener('click', () => selectOption(q.id, opt.displayKey));
    list.appendChild(btn);
  });

  $('btn-prev').disabled = exam.currentIndex === 0;
  $('btn-next').disabled = exam.currentIndex === total - 1;
}

function selectOption(questionId, displayKey) {
  exam.answers[questionId] = displayKey;
  persistProgress();
  renderQuestion();
}

function toggleFlag() {
  const q = exam.questions[exam.currentIndex];
  exam.flags[q.id] = !exam.flags[q.id];
  persistProgress();
  renderQuestion();
}

function goPrev() {
  if (exam.currentIndex > 0) {
    exam.currentIndex -= 1;
    persistProgress();
    renderQuestion();
  }
}

function goNext() {
  if (exam.currentIndex < exam.questions.length - 1) {
    exam.currentIndex += 1;
    persistProgress();
    renderQuestion();
  }
}

function goTo(index) {
  exam.currentIndex = index;
  persistProgress();
  renderQuestion();
  closeGridModal();
}

function persistProgress() {
  if (!exam) return;
  saveProgress(exam);
}

// ---------------------------------------------------------------------------
// Question grid modal
// ---------------------------------------------------------------------------
function openGridModal() {
  const grid = $('question-grid');
  grid.innerHTML = '';
  let answeredCount = 0;
  let flaggedCount = 0;

  exam.questions.forEach((q, i) => {
    const answered = Boolean(exam.answers[q.id]);
    const flagged = Boolean(exam.flags[q.id]);
    if (answered) answeredCount += 1;
    if (flagged) flaggedCount += 1;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'grid-cell'
      + (answered ? ' answered' : '')
      + (flagged ? ' flagged' : '')
      + (i === exam.currentIndex ? ' current' : '');
    cell.textContent = String(i + 1);
    cell.addEventListener('click', () => goTo(i));
    grid.appendChild(cell);
  });

  $('modal-stats').textContent =
    `Đã làm ${answeredCount}/${exam.questions.length} · Đánh dấu ${flaggedCount}`;

  $('grid-modal').classList.remove('hidden');
}

function closeGridModal() {
  $('grid-modal').classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------
function showConfirm(message, onConfirm) {
  $('confirm-message').textContent = message;
  confirmCallback = onConfirm;
  $('confirm-modal').classList.remove('hidden');
}

function hideConfirm() {
  $('confirm-modal').classList.add('hidden');
  confirmCallback = null;
}

// ---------------------------------------------------------------------------
// Submit & scoring
// ---------------------------------------------------------------------------
function requestSubmit() {
  const unanswered = exam.questions.filter((q) => !exam.answers[q.id]).length;
  closeGridModal();
  if (unanswered > 0) {
    showConfirm(
      `Bạn còn ${unanswered} câu chưa trả lời. Vẫn muốn nộp bài?`,
      submitExam,
    );
  } else {
    showConfirm('Nộp bài thi ngay bây giờ?', submitExam);
  }
}

function requestExit() {
  showConfirm(
    'Thoát bài thi? Tiến trình sẽ được lưu để bạn tiếp tục sau.',
    () => {
      stopTimer();
      goHome();
    },
  );
}

function computeResults() {
  const durationSec = Math.max(0, exam.totalSeconds - Math.max(0, Math.round((exam.endAt - Date.now()) / 1000)));
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;

  const perQuestion = exam.questions.map((q) => {
    const userKey = exam.answers[q.id] || null;
    const correctOpt = q.options.find((o) => o.isCorrect);
    let status;
    if (!userKey) {
      status = 'blank';
      blankCount += 1;
    } else if (userKey === correctOpt.displayKey) {
      status = 'correct';
      correctCount += 1;
    } else {
      status = 'incorrect';
      wrongCount += 1;
    }
    return {
      id: q.id,
      text: q.text,
      options: q.options,
      userKey,
      correctKey: correctOpt.displayKey,
      status,
      flagged: Boolean(exam.flags[q.id]),
    };
  });

  const total = exam.questions.length;
  const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return {
    id: `attempt_${Date.now()}`,
    title: exam.config.title || 'Đề thi không tên',
    date: new Date().toISOString(),
    total,
    correctCount,
    wrongCount,
    blankCount,
    percent,
    durationSec,
    rawText: exam.config.rawText,
    config: exam.config,
    perQuestion,
  };
}

function submitExam() {
  if (!exam || exam.submitted) return;
  exam.submitted = true;
  stopTimer();
  const attempt = computeResults();
  saveAttempt(attempt);
  clearProgress();
  currentAttempt = attempt;
  exam = null;
  renderResult(attempt);
  showScreen('result');
}

// ---------------------------------------------------------------------------
// Result screen
// ---------------------------------------------------------------------------
let activeReviewFilter = 'all';

function renderResult(attempt) {
  currentAttempt = attempt;
  activeReviewFilter = 'all';
  document.querySelectorAll('.filter-tab').forEach((t) => t.classList.toggle('active', t.dataset.filter === 'all'));

  $('score-percent').textContent = `${attempt.percent}%`;
  $('score-ring').style.background =
    `conic-gradient(var(--color-primary) ${attempt.percent * 3.6}deg, var(--color-border) 0deg)`;
  $('score-fraction').textContent = `${attempt.correctCount}/${attempt.total} câu đúng`;
  $('result-title').textContent = attempt.title;
  $('result-time').textContent = `Thời gian làm bài: ${formatDuration(attempt.durationSec)}`;

  $('stat-correct').textContent = attempt.correctCount;
  $('stat-wrong').textContent = attempt.wrongCount;
  $('stat-blank').textContent = attempt.blankCount;

  renderReviewList();
}

function renderReviewList() {
  const list = $('review-list');
  list.innerHTML = '';

  const items = currentAttempt.perQuestion.filter((q) => {
    if (activeReviewFilter === 'wrong') return q.status === 'incorrect' || q.status === 'blank';
    if (activeReviewFilter === 'flagged') return q.flagged;
    return true;
  });

  if (items.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-text';
    p.textContent = 'Không có câu nào phù hợp bộ lọc này.';
    list.appendChild(p);
    return;
  }

  items.forEach((q) => {
    const idx = currentAttempt.perQuestion.indexOf(q) + 1;
    const card = document.createElement('div');
    card.className = 'review-item';

    const badgeText = q.status === 'correct' ? 'Đúng' : q.status === 'incorrect' ? 'Sai' : 'Bỏ trống';
    const badgeClass = q.status === 'correct' ? 'correct' : q.status === 'incorrect' ? 'incorrect' : 'blank';

    const head = document.createElement('div');
    head.className = 'review-item-head';
    head.innerHTML = `<span class="review-badge ${badgeClass}">Câu ${idx} · ${badgeText}</span>`
      + (q.flagged ? '<span class="review-flag">🚩 Đã đánh dấu</span>' : '');
    card.appendChild(head);

    const qText = document.createElement('p');
    qText.className = 'review-question';
    qText.textContent = q.text;
    card.appendChild(qText);

    const optWrap = document.createElement('div');
    optWrap.className = 'review-options';
    q.options.forEach((opt) => {
      const row = document.createElement('div');
      let cls = 'review-option';
      if (opt.displayKey === q.correctKey) cls += ' correct';
      else if (opt.displayKey === q.userKey) cls += ' user-wrong';
      row.className = cls;
      row.innerHTML = `<span class="option-key">${opt.displayKey}</span><span></span>`;
      row.querySelector('span:last-child').textContent = opt.text
        + (opt.displayKey === q.userKey && q.userKey !== q.correctKey ? ' (bạn chọn)' : '');
      optWrap.appendChild(row);
    });
    card.appendChild(optWrap);

    list.appendChild(card);
  });
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} phút ${String(s).padStart(2, '0')} giây`;
}

// ---------------------------------------------------------------------------
// Home screen
// ---------------------------------------------------------------------------
function readConfigFromForm() {
  return {
    title: $('input-title').value.trim(),
    rawText: $('input-quiz-text').value,
    timeLimitMinutes: Math.max(1, Number($('input-time-limit').value) || 15),
    shuffleQuestions: $('toggle-shuffle-q').checked,
    shuffleOptions: $('toggle-shuffle-o').checked,
  };
}

function updatePreview() {
  const text = $('input-quiz-text').value;
  const preview = $('question-count-preview');
  if (!text.trim()) {
    preview.textContent = '';
    return;
  }
  const { questions } = parseQuizText(text);
  preview.textContent = questions.length > 0
    ? `✓ Phát hiện ${questions.length} câu hỏi hợp lệ`
    : 'Chưa phát hiện câu hỏi hợp lệ nào';

  if (!timeFieldTouched && questions.length > 0) {
    $('input-time-limit').value = Math.max(5, questions.length);
  }
}

function handleStartExam() {
  const config = readConfigFromForm();
  const { questions, errors } = parseQuizText(config.rawText);
  const errorBox = $('parse-errors');

  if (questions.length === 0 || errors.length > 0) {
    errorBox.classList.remove('hidden');
    const summary = questions.length === 0
      ? '<p>Không tìm thấy câu hỏi hợp lệ nào. Vui lòng kiểm tra lại định dạng đề:</p>'
      : `<p>Đã tìm thấy ${questions.length} câu hợp lệ, nhưng có ${errors.length} lỗi cần sửa:</p>`;
    errorBox.innerHTML = summary + '<ul>' + errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>';
    if (questions.length === 0) return;
    if (!window.confirm(`Có ${errors.length} câu bị lỗi sẽ bị bỏ qua. Vẫn tiếp tục với ${questions.length} câu hợp lệ?`)) {
      return;
    }
  } else {
    errorBox.classList.add('hidden');
  }

  const built = buildQuestions(questions, config.shuffleQuestions, config.shuffleOptions);
  startExam(config, built, null);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderHistory() {
  const history = loadHistory();
  const list = $('history-list');
  $('btn-clear-history').classList.toggle('hidden', history.length === 0);

  if (history.length === 0) {
    list.innerHTML = '<p class="empty-text">Chưa có bài thi nào được hoàn thành.</p>';
    return;
  }

  list.innerHTML = '';
  history.forEach((attempt) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const date = new Date(attempt.date);
    const dateStr = date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    item.innerHTML = `
      <div class="history-item-main">
        <span class="history-item-title"></span>
        <span class="history-item-date"></span>
      </div>
      <span class="history-item-score">${attempt.correctCount}/${attempt.total}</span>`;
    item.querySelector('.history-item-title').textContent = attempt.title;
    item.querySelector('.history-item-date').textContent = dateStr;
    item.addEventListener('click', () => {
      renderResult(attempt);
      showScreen('result');
    });
    list.appendChild(item);
  });
}

function checkResumeBanner() {
  const progress = loadProgress();
  const banner = $('resume-banner');
  if (!progress || progress.submitted) {
    banner.classList.add('hidden');
    return;
  }
  const remaining = Math.round((progress.endAt - Date.now()) / 1000);
  if (remaining <= 0) {
    clearProgress();
    banner.classList.add('hidden');
    return;
  }
  $('resume-title').textContent = ` "${progress.config.title || 'Đề thi không tên'}"`;
  banner.classList.remove('hidden');
  banner._progress = progress;
}

function goHome() {
  exam = null;
  showScreen('home');
  renderHistory();
  checkResumeBanner();
}

// ---------------------------------------------------------------------------
// Wire up events
// ---------------------------------------------------------------------------
$('input-quiz-text').addEventListener('input', debounce(updatePreview, 250));
$('input-time-limit').addEventListener('input', () => { timeFieldTouched = true; });
$('btn-start-exam').addEventListener('click', handleStartExam);
$('btn-load-sample').addEventListener('click', () => {
  $('input-quiz-text').value = SAMPLE_QUIZ_TEXT;
  if (!$('input-title').value.trim()) $('input-title').value = 'Đề thi mẫu';
  updatePreview();
});

$('btn-show-format').addEventListener('click', () => {
  $('format-example').textContent = SAMPLE_QUIZ_TEXT.split('\n\n')[0];
  $('format-modal').classList.remove('hidden');
});
$('btn-close-format').addEventListener('click', () => $('format-modal').classList.add('hidden'));

$('btn-clear-history').addEventListener('click', () => {
  showConfirm('Xóa toàn bộ lịch sử làm bài?', () => {
    clearHistory();
    renderHistory();
  });
});

$('btn-resume').addEventListener('click', () => {
  const progress = $('resume-banner')._progress;
  if (progress) startExam(progress.config, progress.questions, progress);
});
$('btn-discard-resume').addEventListener('click', () => {
  clearProgress();
  $('resume-banner').classList.add('hidden');
});

$('btn-exit-exam').addEventListener('click', requestExit);
$('btn-prev').addEventListener('click', goPrev);
$('btn-next').addEventListener('click', goNext);
$('btn-flag').addEventListener('click', toggleFlag);
$('btn-open-grid').addEventListener('click', openGridModal);
$('btn-close-grid').addEventListener('click', closeGridModal);
$('btn-submit-exam').addEventListener('click', requestSubmit);

$('btn-confirm-cancel').addEventListener('click', hideConfirm);
$('btn-confirm-ok').addEventListener('click', () => {
  const cb = confirmCallback;
  hideConfirm();
  if (cb) cb();
});

document.querySelectorAll('.filter-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    activeReviewFilter = tab.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach((t) => t.classList.toggle('active', t === tab));
    renderReviewList();
  });
});

$('btn-retry').addEventListener('click', () => {
  const { questions } = parseQuizText(currentAttempt.rawText);
  const config = currentAttempt.config;
  const built = buildQuestions(questions, config.shuffleQuestions, config.shuffleOptions);
  startExam(config, built, null);
});
$('btn-new-exam').addEventListener('click', goHome);

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
goHome();
