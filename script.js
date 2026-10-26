// ================== Cấu hình & trạng thái ==================
const STORAGE_KEY = 'todo-day-tasks';
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const DAY_MS = 24 * 60 * 60 * 1000;

let tasks = loadTasks();
let currentDate = toKey(new Date()); // ngày đang xem, dạng "YYYY-MM-DD"
let currentFilter = 'all';

// ================== Lấy phần tử ==================
const $ = (id) => document.getElementById(id);
const form = $('taskForm');
const nameInput = $('taskName');
const startInput = $('startTime');
const endInput = $('endTime');
const formError = $('formError');
const list = $('taskList');
const emptyState = $('emptyState');

// ================== Tiện ích ngày giờ ==================
function pad(n) { return String(n).padStart(2, '0'); }

function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

// Thứ Hai đầu tuần
function startOfWeek(date) {
  const d = new Date(date);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Chủ nhật cuối tuần, 23:59:59 — hạn chót hoàn thành
function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} phút`;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

function formatHoursShort(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}p`;
  return m ? `${h}h${pad(m)}` : `${h}h`;
}

// ================== Lưu trữ ==================
function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    /* trình duyệt chặn lưu trữ — vẫn chạy bình thường trong phiên */
  }
}

// ================== Trạng thái hạn chót ==================
// Trả về { type: 'done' | 'warn' | 'overdue', text }
function getStatus(task) {
  if (task.done) {
    return { type: 'done', text: 'Đã hoàn thành' };
  }

  const deadline = endOfWeek(fromKey(task.date));
  const now = new Date();

  if (now > deadline) {
    return { type: 'overdue', text: `Quá hạn! Tuần đã kết thúc (CN ${formatDate(deadline)}) mà chưa hoàn thành` };
  }

  const daysLeft = Math.round((fromKey(toKey(deadline)) - fromKey(toKey(now))) / DAY_MS);
  const left = daysLeft === 0 ? 'hôm nay là hạn chót' : `còn ${daysLeft} ngày`;
  return { type: 'warn', text: `Chưa làm — phải hoàn thành trước CN ${formatDate(deadline)} (${left})` };
}

// ================== Hiển thị ==================
const CHECK_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>`;

const BADGE_ICON = { done: '✓', warn: '⚠', overdue: '⛔' };

function createTaskItem(task) {
  const status = getStatus(task);
  const li = document.createElement('li');
  li.className = `task ${task.done ? 'done' : ''} ${status.type === 'overdue' ? 'overdue' : ''}`;
  li.dataset.id = task.id;

  // Cột thời gian
  const time = document.createElement('div');
  time.className = 'task-time';
  time.innerHTML = `${task.start}<span>${task.end}</span>`;

  // Nút tích
  const check = document.createElement('button');
  check.className = 'check';
  check.dataset.action = 'toggle';
  check.setAttribute('aria-label', task.done ? 'Đánh dấu chưa xong' : 'Đánh dấu đã xong');
  check.innerHTML = CHECK_SVG;

  // Nội dung
  const body = document.createElement('div');
  const name = document.createElement('p');
  name.className = 'task-name';
  name.textContent = task.name; // textContent để tránh chèn HTML

  const duration = document.createElement('p');
  duration.className = 'task-duration';
  duration.textContent = formatDuration(toMinutes(task.end) - toMinutes(task.start));

  const badge = document.createElement('span');
  badge.className = `badge badge-${status.type}`;
  badge.textContent = `${BADGE_ICON[status.type]} ${status.text}`;

  body.append(name, duration, badge);

  // Nút xoá
  const del = document.createElement('button');
  del.className = 'delete';
  del.dataset.action = 'delete';
  del.setAttribute('aria-label', 'Xoá công việc');
  del.textContent = '×';

  li.append(time, check, body, del);
  return li;
}

function render() {
  const viewDate = fromKey(currentDate);
  const isToday = currentDate === toKey(new Date());

  // Tiêu đề ngày
  $('dateTitle').textContent =
    `${isToday ? 'Hôm nay, ' : ''}${WEEKDAYS[viewDate.getDay()]} ${formatDate(viewDate)}/${viewDate.getFullYear()}`;

  // Việc trong ngày, sắp xếp theo giờ bắt đầu
  const dayTasks = tasks
    .filter((t) => t.date === currentDate)
    .sort((a, b) => a.start.localeCompare(b.start));

  // Thống kê
  const doneCount = dayTasks.filter((t) => t.done).length;
  const totalMin = dayTasks.reduce((sum, t) => sum + toMinutes(t.end) - toMinutes(t.start), 0);
  const weekStart = startOfWeek(viewDate);
  const weekEnd = endOfWeek(viewDate);
  const weekPending = tasks.filter((t) => {
    const d = fromKey(t.date);
    return !t.done && d >= weekStart && d <= weekEnd;
  }).length;

  $('statTotal').textContent = dayTasks.length;
  $('statDone').textContent = doneCount;
  $('statHours').textContent = formatHoursShort(totalMin);
  $('statWeek').textContent = weekPending;

  const percent = dayTasks.length ? Math.round((doneCount / dayTasks.length) * 100) : 0;
  $('progressBar').style.width = `${percent}%`;
  $('progressText').textContent = `${percent}% hoàn thành`;

  // Lọc
  const visible = dayTasks.filter((t) => {
    if (currentFilter === 'done') return t.done;
    if (currentFilter === 'pending') return !t.done;
    return true;
  });

  list.innerHTML = '';
  visible.forEach((t) => list.appendChild(createTaskItem(t)));

  emptyState.style.display = visible.length ? 'none' : 'block';
  emptyState.textContent = dayTasks.length
    ? 'Không có công việc nào khớp bộ lọc.'
    : 'Chưa có công việc nào. Thêm việc đầu tiên ở trên nhé!';
}

// ================== Sự kiện ==================
form.addEventListener('submit', (e) => {
  e.preventDefault();
  formError.textContent = '';

  const name = nameInput.value.trim();
  const start = startInput.value;
  const end = endInput.value;

  if (!name || !start || !end) {
    formError.textContent = 'Vui lòng nhập đủ tên công việc và thời gian.';
    return;
  }
  if (toMinutes(end) <= toMinutes(start)) {
    formError.textContent = 'Giờ kết thúc phải sau giờ bắt đầu.';
    return;
  }

  const overlap = tasks.find((t) =>
    t.date === currentDate &&
    toMinutes(start) < toMinutes(t.end) &&
    toMinutes(end) > toMinutes(t.start)
  );

  tasks.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    start,
    end,
    date: currentDate,
    done: false,
  });
  saveTasks();

  form.reset();
  startInput.value = end; // gợi ý giờ bắt đầu cho việc tiếp theo
  nameInput.focus();

  if (overlap) {
    formError.textContent = `Lưu ý: khung giờ này trùng với "${overlap.name}".`;
  }
  render();
});

// Uỷ quyền sự kiện cho danh sách (tích / xoá)
list.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('.task').dataset.id;

  if (btn.dataset.action === 'toggle') {
    const task = tasks.find((t) => t.id === id);
    if (task) task.done = !task.done;
  } else if (btn.dataset.action === 'delete') {
    // Bấm lần 1: hỏi xác nhận ngay trên nút; bấm lần 2 trong 3 giây: xoá
    if (btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1';
      btn.textContent = 'Xoá?';
      btn.classList.add('confirming');
      setTimeout(() => {
        if (!btn.isConnected) return;
        btn.dataset.confirm = '';
        btn.textContent = '×';
        btn.classList.remove('confirming');
      }, 3000);
      return;
    }
    tasks = tasks.filter((t) => t.id !== id);
  }
  saveTasks();
  render();
});

// Bộ lọc
document.querySelectorAll('.filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

// Chuyển ngày
function shiftDay(delta) {
  const d = fromKey(currentDate);
  d.setDate(d.getDate() + delta);
  currentDate = toKey(d);
  formError.textContent = '';
  render();
}
$('prevDay').addEventListener('click', () => shiftDay(-1));
$('nextDay').addEventListener('click', () => shiftDay(1));
$('todayBtn').addEventListener('click', () => {
  currentDate = toKey(new Date());
  render();
});

// Cập nhật số ngày còn lại mỗi phút
setInterval(render, 60 * 1000);

render();
