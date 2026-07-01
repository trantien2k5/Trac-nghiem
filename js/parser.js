// Parser cho định dạng đề thi văn bản thuần.
//
// Mỗi câu hỏi cách nhau bởi 1 dòng trống. Trong một câu:
//   - Các dòng không khớp mẫu đáp án/đáp án-đúng được coi là nội dung câu hỏi.
//   - 4 dòng đáp án dạng "A. ...", "B) ...", "C: ...", "D - ..." (chấp nhận chữ hoa/thường).
//   - Đáp án đúng được đánh dấu bằng dấu "*" ngay trước chữ cái, hoặc bằng
//     một dòng riêng "Đáp án: X" / "Dap an: X" / "Answer: X" ở cuối câu.

const ANSWER_LINE_RE = /^\s*(đáp\s*án|dap\s*an|answer|correct\s*answer|correct|đa)\s*[:.\-)]\s*([a-dA-D])\s*\.?\s*$/i;
const OPTION_LINE_RE = /^\s*(\*)?\s*\(?([a-dA-D])\)?\s*[.):\-]\s*(.+)$/;
const QUESTION_MARKER_RE = /^\s*(câu\s*hỏi|câu|question)\s*\d+\s*[.:)\-]/i;
const QUESTION_PREFIX_STRIP_RE = /^\s*(câu\s*hỏi|câu|question)?\s*\d+\s*[.:)\-]\s*/i;

export function parseQuizText(rawText) {
  const errors = [];
  const text = (rawText || '').replace(/\r\n/g, '\n').trim();

  if (!text) {
    return { questions: [], errors: ['Nội dung đề đang trống.'] };
  }

  let blocks = text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 1) {
    blocks = autoSplitByQuestionMarkers(blocks[0]);
  }

  const questions = [];

  blocks.forEach((block, blockIdx) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const questionNumber = blockIdx + 1;
    const questionLines = [];
    const options = [];
    let answerFromLine = null;

    for (const line of lines) {
      const ansMatch = line.match(ANSWER_LINE_RE);
      if (ansMatch) {
        answerFromLine = ansMatch[2].toUpperCase();
        continue;
      }
      const optMatch = options.length < 4 ? line.match(OPTION_LINE_RE) : null;
      if (optMatch) {
        const [, star, letter, optText] = optMatch;
        options.push({
          key: letter.toUpperCase(),
          text: optText.trim(),
          isCorrect: Boolean(star),
        });
        continue;
      }
      questionLines.push(line);
    }

    if (questionLines.length === 0 && options.length === 0) return;

    let questionText = questionLines.join(' ').trim();
    questionText = questionText.replace(QUESTION_PREFIX_STRIP_RE, '').trim();

    if (options.length !== 4) {
      errors.push(`Câu ${questionNumber}: cần đúng 4 đáp án (A, B, C, D), hiện tìm thấy ${options.length}.`);
      return;
    }

    options.sort((a, b) => a.key.localeCompare(b.key));
    const keys = options.map((o) => o.key).join('');
    if (keys !== 'ABCD') {
      errors.push(`Câu ${questionNumber}: nhãn đáp án phải đủ và đúng là A, B, C, D (hiện tại: ${keys}).`);
      return;
    }

    if (answerFromLine) {
      options.forEach((o) => { o.isCorrect = o.key === answerFromLine; });
    }

    const correctCount = options.filter((o) => o.isCorrect).length;
    if (correctCount === 0) {
      errors.push(`Câu ${questionNumber}: chưa xác định đáp án đúng (dùng "*" trước đáp án hoặc thêm dòng "Đáp án: A").`);
      return;
    }
    if (correctCount > 1) {
      errors.push(`Câu ${questionNumber}: có nhiều hơn 1 đáp án được đánh dấu là đúng.`);
      return;
    }
    if (!questionText) {
      errors.push(`Câu ${questionNumber}: thiếu nội dung câu hỏi.`);
      return;
    }

    questions.push({
      id: `q${questionNumber}_${Math.random().toString(36).slice(2, 9)}`,
      text: questionText,
      options,
    });
  });

  return { questions, errors };
}

function autoSplitByQuestionMarkers(block) {
  const lines = block.split('\n');
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (QUESTION_MARKER_RE.test(line) && current.length > 0 && countOptionLines(current) >= 4) {
      blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks;
}

function countOptionLines(lines) {
  let count = 0;
  for (const l of lines) {
    if (OPTION_LINE_RE.test(l.trim())) count++;
  }
  return count;
}

export function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const SAMPLE_QUIZ_TEXT = `Câu 1: Thủ đô của Việt Nam là gì?
A. Đà Nẵng
B. Hà Nội
C. TP. Hồ Chí Minh
D. Huế
Đáp án: B

Câu 2: Kết quả của 7 + 8 là bao nhiêu?
A. 14
*B. 15
C. 16
D. 17

Câu 3: Hành tinh nào được gọi là "Hành tinh Đỏ"?
A. Sao Kim
B. Sao Mộc
C. Sao Hỏa
D. Sao Thổ
Đáp án: C

Câu 4: Trong tiếng Anh, "Books" có nghĩa là gì?
A. Cái bàn
*B. Quyển sách (số nhiều)
C. Cây bút
D. Con mèo

Câu 5: Việt Nam nằm ở khu vực nào của châu Á?
A. Đông Bắc Á
B. Nam Á
C. Đông Nam Á
D. Trung Á
Đáp án: C`;
