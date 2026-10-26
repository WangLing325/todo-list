// ================== Cấu hình & trạng thái ==================
const STORAGE_KEY = 'todo-day-tasks';
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const DAY_MS = 24 * 60 * 60 * 1000;

let tasks = loadTasks();
let currentDate = toKey(new Date()); // ngày đang xem, dạng "YYYY-MM-DD"
let currentFilter = 'all';
let justCompletedId = null; // việc vừa tích xong, để chạy hiệu ứng sau khi vẽ lại
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  li.className = `task ${task.done ? 'done' : ''} ${status.type === 'overdue' ? 'overdue' : ''} ${task.id === justCompletedId ? 'just-done' : ''}`;
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

  renderWeekPanel(viewDate);
  justCompletedId = null; // hiệu ứng chỉ chạy một lần
}

// ================== Hiệu ứng hoàn thành ==================
const CONFETTI_COLORS = ['#16a34a', '#22c55e', '#1e88e5', '#1565c0', '#60a5fa', '#f59e0b'];

// Bắn pháo giấy từ toạ độ (x, y); big = bắn to khi xong hết việc trong ngày
function celebrate(x, y, big) {
  if (reduceMotion) return;
  const count = big ? 70 : 18;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = `confetti ${i % 3 === 0 ? 'round' : ''}`;
    const angle = Math.random() * Math.PI * 2;
    const dist = (big ? 120 : 40) + Math.random() * (big ? 200 : 50);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist + (big ? 60 : 20)}px`);
    p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    p.style.animationDuration = `${(big ? 1100 : 650) + Math.random() * 400}ms`;
    p.addEventListener('animationend', () => p.remove());
    document.body.appendChild(p);
  }
}

let toastTimer;
function showToast(message, isCelebrate) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.toggle('celebrate', !!isCelebrate);
  toast.hidden = false;
  toast.classList.remove('show');
  void toast.offsetWidth; // khởi động lại chuyển động
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toastTimer = setTimeout(() => (toast.hidden = true), 300);
  }, 2600);
}

// Đánh dấu xong + chạy hiệu ứng; originEl là nút tích được bấm
function completeTask(task, originEl) {
  const rect = originEl.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  task.done = true;
  saveTasks();
  justCompletedId = task.id;
  render();

  const left = tasks.filter((t) => t.date === task.date && !t.done).length;
  const shortName = task.name.length > 40 ? `${task.name.slice(0, 40)}…` : task.name;

  if (left === 0) {
    celebrate(x, y, true);
    showToast('🎉 Tuyệt vời! Bạn đã hoàn thành hết việc trong ngày', true);
  } else {
    celebrate(x, y, false);
    showToast(`✓ Đã xong "${shortName}". Còn ${left} việc trong ngày`);
  }
}

// ================== Cột tổng kết tuần ==================
function renderWeekPanel(viewDate) {
  const weekStart = startOfWeek(viewDate);
  const weekEnd = endOfWeek(viewDate);
  const todayKey = toKey(new Date());

  $('weekRange').textContent =
    `Thứ Hai ${formatDate(weekStart)} – Chủ nhật ${formatDate(weekEnd)}/${weekEnd.getFullYear()}`;

  // Tất cả việc chưa xong trong tuần đang xem
  const pending = tasks
    .filter((t) => {
      const d = fromKey(t.date);
      return !t.done && d >= weekStart && d <= weekEnd;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  const totalMin = pending.reduce((sum, t) => sum + toMinutes(t.end) - toMinutes(t.start), 0);
  $('weekCount').textContent = pending.length;
  $('weekTime').textContent = formatHoursShort(totalMin);

  // Dòng hạn chót của tuần
  const deadlineEl = $('weekDeadline');
  const now = new Date();
  if (!pending.length) {
    deadlineEl.className = 'week-deadline clear';
    deadlineEl.textContent = '✓ Đã hoàn thành hết việc trong tuần';
  } else if (now > weekEnd) {
    deadlineEl.className = 'week-deadline overdue';
    deadlineEl.textContent = `⛔ Tuần đã kết thúc, còn ${pending.length} việc chưa hoàn thành`;
  } else {
    const daysLeft = Math.round((fromKey(toKey(weekEnd)) - fromKey(todayKey)) / DAY_MS);
    const left = daysLeft === 0 ? 'hôm nay là hạn chót' : `còn ${daysLeft} ngày`;
    deadlineEl.className = 'week-deadline';
    deadlineEl.textContent = `⚠ Hạn chót: Chủ nhật ${formatDate(weekEnd)} (${left})`;
  }

  // Gom theo ngày
  const groups = {};
  pending.forEach((t) => (groups[t.date] = groups[t.date] || []).push(t));

  const container = $('weekGroups');
  container.innerHTML = '';

  Object.keys(groups).forEach((dateKey) => {
    const date = fromKey(dateKey);
    const section = document.createElement('section');

    // Tiêu đề ngày: bấm để chuyển sang ngày đó
    const head = document.createElement('button');
    head.className = 'week-day-head';
    head.dataset.date = dateKey;
    head.setAttribute('aria-label', `Xem ${WEEKDAYS[date.getDay()]} ${formatDate(date)}`);

    const nameWrap = document.createElement('span');
    const dayName = document.createElement('span');
    dayName.className = 'week-day-name';
    dayName.textContent = `${WEEKDAYS[date.getDay()]} ${formatDate(date)}`;
    nameWrap.appendChild(dayName);
    if (dateKey === todayKey || dateKey === currentDate) {
      const tag = document.createElement('span');
      tag.className = 'week-tag';
      tag.textContent = dateKey === todayKey ? 'Hôm nay' : 'Đang xem';
      nameWrap.appendChild(tag);
    }

    const count = document.createElement('span');
    count.className = 'week-day-count';
    count.textContent = `${groups[dateKey].length} việc`;
    head.append(nameWrap, count);

    // Danh sách việc của ngày
    const ul = document.createElement('ul');
    ul.className = 'week-items';
    groups[dateKey].forEach((t) => {
      const li = document.createElement('li');
      li.className = 'week-item';

      const check = document.createElement('button');
      check.className = 'week-check';
      check.dataset.id = t.id;
      check.setAttribute('aria-label', `Đánh dấu "${t.name}" đã xong`);
      check.innerHTML = CHECK_SVG;

      const time = document.createElement('span');
      time.className = 'week-item-time';
      time.textContent = t.start;

      const name = document.createElement('span');
      name.className = 'week-item-name';
      name.textContent = t.name;

      li.append(check, time, name);
      ul.appendChild(li);
    });

    section.append(head, ul);
    container.appendChild(section);
  });

  $('weekEmpty').hidden = pending.length > 0;
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
    if (!task) return;
    if (!task.done) {
      completeTask(task, btn); // tích xong: có hiệu ứng
      return;
    }
    task.done = false; // bỏ tích: không hiệu ứng
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

// Cột tuần: tích xong nhanh hoặc bấm tên ngày để chuyển sang ngày đó
$('weekGroups').addEventListener('click', (e) => {
  const check = e.target.closest('.week-check');
  if (check) {
    const task = tasks.find((t) => t.id === check.dataset.id);
    if (!task || check.disabled) return;
    check.disabled = true;
    if (reduceMotion) {
      completeTask(task, check);
    } else {
      // Cho việc trượt ra khỏi cột rồi mới cập nhật
      check.closest('.week-item').classList.add('leaving');
      setTimeout(() => completeTask(task, check), 330);
    }
    return;
  }
  const head = e.target.closest('.week-day-head');
  if (head) {
    currentDate = head.dataset.date;
    formError.textContent = '';
    render();
  }
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
