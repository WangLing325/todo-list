// ================== Cấu hình & trạng thái ==================
const STORAGE_KEY = 'todo-day-tasks';
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const DAY_MS = 24 * 60 * 60 * 1000;

let tasks = loadTasks();
let currentDate = toKey(new Date()); // ngày đang xem, dạng "YYYY-MM-DD"
let currentFilter = 'all';
let justCompletedId = null; // việc vừa tích xong, để chạy hiệu ứng sau khi vẽ lại
let editingId = null;       // việc đang được sửa
let editDraft = null;       // nội dung đang gõ dở trong ô sửa (giữ lại khi trang vẽ lại)
let justEditedId = null;    // việc vừa sửa xong, để lóe sáng
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ================== Âm thanh (Web Audio API, không cần file) ==================
const Sound = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('todo-sound-muted') === '1'; } catch { /* bỏ qua */ }

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Phát 1 nốt: tần số, độ trễ (giây), độ dài, kiểu sóng, âm lượng, trượt tới tần số khác
  function tone(freq, when = 0, dur = 0.15, type = 'sine', vol = 0.15, slideTo = null) {
    const c = getCtx();
    if (!c) return;
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  const sounds = {
    // Bấm nút thường: chuyển ngày, bộ lọc
    click: () => tone(900, 0, 0.05, 'triangle', 0.06),
    // Thêm việc: "pốp" đi lên
    add: () => { tone(520, 0, 0.09, 'sine', 0.12, 780); tone(880, 0.07, 0.12, 'sine', 0.1); },
    // Tích xong: chuông 3 nốt Mi – Sol – Đô
    complete: () => {
      tone(659.25, 0, 0.14, 'sine', 0.13);
      tone(783.99, 0.08, 0.14, 'sine', 0.13);
      tone(1046.5, 0.16, 0.3, 'sine', 0.14);
    },
    // Xong hết việc trong ngày: hợp âm rải dài hơn
    allDone: () => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.1, 0.22, 'triangle', 0.11));
      tone(1046.5, 0.42, 0.6, 'sine', 0.09);
      tone(1318.5, 0.42, 0.6, 'sine', 0.11);
      tone(1568, 0.42, 0.6, 'sine', 0.07);
    },
    // Lưu chỉnh sửa: hai nốt nhẹ
    save: () => { tone(698.46, 0, 0.08, 'sine', 0.1); tone(932.33, 0.07, 0.14, 'sine', 0.1); },
    // Bỏ tích: trượt xuống nhẹ
    uncheck: () => tone(600, 0, 0.14, 'sine', 0.1, 380),
    // Bấm xoá lần 1 (hỏi lại)
    confirm: () => tone(440, 0, 0.08, 'square', 0.04),
    // Xoá thật
    remove: () => tone(320, 0, 0.22, 'triangle', 0.13, 110),
    // Nhập thiếu / sai giờ
    error: () => { tone(220, 0, 0.12, 'square', 0.05); tone(185, 0.13, 0.16, 'square', 0.05); },
    // Thêm việc nhưng trùng giờ
    warn: () => { tone(520, 0, 0.09, 'sine', 0.1, 700); tone(392, 0.12, 0.18, 'triangle', 0.09); },
  };

  return {
    play(name) {
      if (muted || !sounds[name]) return;
      try { sounds[name](); } catch { /* trình duyệt không hỗ trợ: im lặng */ }
    },
    isMuted: () => muted,
    setMuted(value) {
      muted = value;
      try { localStorage.setItem('todo-sound-muted', value ? '1' : '0'); } catch { /* bỏ qua */ }
    },
  };
})();

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

const EDIT_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
  </svg>`;

// Thẻ việc ở chế độ sửa: tên, giờ bắt đầu, giờ kết thúc, ngày
function createEditItem(task) {
  const draft = editDraft && editDraft.id === task.id ? editDraft : task;
  const li = document.createElement('li');
  li.className = 'task editing';
  li.dataset.id = task.id;

  const form = document.createElement('form');
  form.className = 'edit-form';
  form.dataset.id = task.id;
  form.noValidate = true;
  form.setAttribute('aria-label', 'Sửa công việc');
  form.innerHTML = `
    <label class="edit-field edit-title">Tên công việc
      <input type="text" name="title" id="edit-title-${task.id}" maxlength="100" autocomplete="off">
    </label>
    <label class="edit-field">Bắt đầu
      <input type="time" name="start" id="edit-start-${task.id}">
    </label>
    <label class="edit-field">Kết thúc
      <input type="time" name="end" id="edit-end-${task.id}">
    </label>
    <label class="edit-field edit-date">Ngày
      <input type="date" name="date" id="edit-date-${task.id}">
    </label>
    <p class="form-error edit-error" role="alert"></p>
    <div class="edit-actions">
      <span class="edit-hint">Enter để lưu · Esc để huỷ</span>
      <button type="button" class="btn-ghost" data-action="cancel-edit">Huỷ</button>
      <button type="submit" class="btn-primary">Lưu</button>
    </div>`;

  // Gán giá trị bằng thuộc tính (không chèn vào HTML) để an toàn với mọi ký tự
  form.querySelector('[name="title"]').value = draft.name;
  form.querySelector('[name="start"]').value = draft.start;
  form.querySelector('[name="end"]').value = draft.end;
  form.querySelector('[name="date"]').value = draft.date;
  if (draft.error) form.querySelector('.edit-error').textContent = draft.error;

  li.appendChild(form);
  return li;
}

function readEditForm(form) {
  const get = (n) => form.querySelector(`[name="${n}"]`).value;
  return {
    id: form.dataset.id,
    name: get('title'),
    start: get('start'),
    end: get('end'),
    date: get('date'),
    error: form.querySelector('.edit-error').textContent,
  };
}

function startEdit(id) {
  editingId = id;
  editDraft = null;
  render();
  const input = list.querySelector('.edit-form [name="title"]');
  if (input) { input.focus(); input.select(); }
}

function cancelEdit() {
  const id = editingId;
  editingId = null;
  editDraft = null;
  render();
  list.querySelector(`.task[data-id="${id}"] .edit`)?.focus();
}

function createTaskItem(task) {
  if (task.id === editingId) return createEditItem(task);

  const status = getStatus(task);
  const li = document.createElement('li');
  li.className = `task ${task.done ? 'done' : ''} ${status.type === 'overdue' ? 'overdue' : ''} ${task.id === justCompletedId ? 'just-done' : ''} ${task.id === justEditedId ? 'just-edited' : ''}`;
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
  name.title = 'Nhấp đúp để sửa';
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

  // Nút sửa
  const edit = document.createElement('button');
  edit.className = 'edit';
  edit.dataset.action = 'edit';
  edit.setAttribute('aria-label', 'Sửa tên và giờ');
  edit.title = 'Sửa';
  edit.innerHTML = EDIT_SVG;

  const actions = document.createElement('div');
  actions.className = 'task-actions';
  actions.append(edit, del);

  li.append(time, check, body, actions);
  return li;
}

function render() {
  // Giữ lại nội dung đang gõ dở nếu có ô sửa đang mở
  const openForm = list.querySelector('.edit-form');
  if (openForm) editDraft = readEditForm(openForm);

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
  justEditedId = null;
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

// Âm thanh khi tích xong: chuông thường, hoặc nhạc mừng nếu đây là việc cuối cùng của ngày
function playCompleteSound(task) {
  const othersLeft = tasks.filter((t) => t.date === task.date && !t.done && t.id !== task.id).length;
  Sound.play(othersLeft === 0 ? 'allDone' : 'complete');
}

// Đánh dấu xong + chạy hiệu ứng; originEl là nút tích được bấm
function completeTask(task, originEl, soundPlayed = false) {
  if (!soundPlayed) playCompleteSound(task);
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
    Sound.play('error');
    return;
  }
  if (toMinutes(end) <= toMinutes(start)) {
    formError.textContent = 'Giờ kết thúc phải sau giờ bắt đầu.';
    Sound.play('error');
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
  Sound.play(overlap ? 'warn' : 'add');
  render();
});

// Các ô nhập bị trình duyệt chặn vì bỏ trống (thuộc tính required) cũng kêu báo lỗi
let lastInvalidAt = 0;
form.addEventListener('invalid', () => {
  // nhiều ô cùng trống chỉ kêu 1 lần
  if (Date.now() - lastInvalidAt > 300) Sound.play('error');
  lastInvalidAt = Date.now();
}, true);

// Uỷ quyền sự kiện cho danh sách (tích / xoá)
list.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('.task').dataset.id;

  if (btn.dataset.action === 'edit') {
    Sound.play('click');
    startEdit(id);
    return;
  }
  if (btn.dataset.action === 'cancel-edit') {
    Sound.play('click');
    cancelEdit();
    return;
  }

  if (btn.dataset.action === 'toggle') {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (!task.done) {
      completeTask(task, btn); // tích xong: có hiệu ứng
      return;
    }
    task.done = false; // bỏ tích: không hiệu ứng hình
    Sound.play('uncheck');
  } else if (btn.dataset.action === 'delete') {
    // Bấm lần 1: hỏi xác nhận ngay trên nút; bấm lần 2 trong 3 giây: xoá
    if (btn.dataset.confirm !== '1') {
      Sound.play('confirm');
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
    Sound.play('remove');
  }
  saveTasks();
  render();
});

// Nhấp đúp vào tên việc để sửa nhanh
list.addEventListener('dblclick', (e) => {
  const nameEl = e.target.closest('.task-name');
  if (!nameEl) return;
  window.getSelection()?.removeAllRanges(); // bỏ phần chữ bị bôi đen do nhấp đúp
  Sound.play('click');
  startEdit(nameEl.closest('.task').dataset.id);
});

// Esc để huỷ sửa
list.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && e.target.closest('.edit-form')) {
    e.preventDefault();
    cancelEdit();
  }
});

// Lưu chỉnh sửa (Enter hoặc nút Lưu)
list.addEventListener('submit', (e) => {
  const f = e.target.closest('.edit-form');
  if (!f) return;
  e.preventDefault();

  const task = tasks.find((t) => t.id === f.dataset.id);
  if (!task) return;
  const v = readEditForm(f);
  const name = v.name.trim();
  const errorEl = f.querySelector('.edit-error');
  const fail = (msg, field) => {
    errorEl.textContent = msg;
    Sound.play('error');
    f.querySelector(`[name="${field}"]`)?.focus();
  };

  if (!name) return fail('Tên công việc không được để trống.', 'title');
  if (!v.start || !v.end) return fail('Vui lòng nhập đủ giờ bắt đầu và giờ kết thúc.', v.start ? 'end' : 'start');
  if (toMinutes(v.end) <= toMinutes(v.start)) return fail('Giờ kết thúc phải sau giờ bắt đầu.', 'end');
  if (!v.date) return fail('Vui lòng chọn ngày.', 'date');

  const unchanged = name === task.name && v.start === task.start && v.end === task.end && v.date === task.date;
  const overlap = tasks.find((t) =>
    t.id !== task.id &&
    t.date === v.date &&
    toMinutes(v.start) < toMinutes(t.end) &&
    toMinutes(v.end) > toMinutes(t.start)
  );
  const movedDay = v.date !== task.date;

  Object.assign(task, { name, start: v.start, end: v.end, date: v.date });
  saveTasks();

  editingId = null;
  editDraft = null;
  justEditedId = task.id;
  render();

  const shortName = name.length > 40 ? `${name.slice(0, 40)}…` : name;
  if (unchanged) {
    showToast('Không có gì thay đổi');
  } else if (overlap) {
    Sound.play('warn');
    showToast(`Đã lưu. Lưu ý: khung giờ trùng với "${overlap.name}"`);
  } else if (movedDay) {
    const d = fromKey(v.date);
    Sound.play('save');
    showToast(`✓ Đã chuyển "${shortName}" sang ${WEEKDAYS[d.getDay()]} ${formatDate(d)}`);
  } else {
    Sound.play('save');
    showToast(`✓ Đã lưu thay đổi cho "${shortName}"`);
  }
  // Trả con trỏ về nút sửa của việc vừa lưu (nếu việc vẫn ở ngày đang xem)
  list.querySelector(`.task[data-id="${task.id}"] .edit`)?.focus({ preventScroll: true });
});

// Cột tuần: tích xong nhanh hoặc bấm tên ngày để chuyển sang ngày đó
$('weekGroups').addEventListener('click', (e) => {
  const check = e.target.closest('.week-check');
  if (check) {
    const task = tasks.find((t) => t.id === check.dataset.id);
    if (!task || check.disabled) return;
    check.disabled = true;
    playCompleteSound(task); // kêu ngay khi bấm, không đợi hiệu ứng trượt
    if (reduceMotion) {
      completeTask(task, check, true);
    } else {
      // Cho việc trượt ra khỏi cột rồi mới cập nhật
      check.closest('.week-item').classList.add('leaving');
      setTimeout(() => completeTask(task, check, true), 330);
    }
    return;
  }
  const head = e.target.closest('.week-day-head');
  if (head) {
    Sound.play('click');
    currentDate = head.dataset.date;
    formError.textContent = '';
    render();
  }
});

// Bộ lọc
document.querySelectorAll('.filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    Sound.play('click');
    document.querySelectorAll('.filter').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

// Chuyển ngày
function shiftDay(delta) {
  Sound.play('click');
  const d = fromKey(currentDate);
  d.setDate(d.getDate() + delta);
  currentDate = toKey(d);
  formError.textContent = '';
  render();
}
$('prevDay').addEventListener('click', () => shiftDay(-1));
$('nextDay').addEventListener('click', () => shiftDay(1));
$('todayBtn').addEventListener('click', () => {
  Sound.play('click');
  currentDate = toKey(new Date());
  render();
});

// Nút bật/tắt âm thanh
const SOUND_ON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H2v6h4l5 4V5z"></path>
    <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
    <path d="M19 5a10 10 0 0 1 0 14"></path>
  </svg>`;
const SOUND_OFF_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H2v6h4l5 4V5z"></path>
    <line x1="22" y1="9" x2="16" y2="15"></line>
    <line x1="16" y1="9" x2="22" y2="15"></line>
  </svg>`;

function renderSoundBtn() {
  const btn = $('soundBtn');
  const muted = Sound.isMuted();
  btn.innerHTML = muted ? SOUND_OFF_SVG : SOUND_ON_SVG;
  btn.classList.toggle('muted', muted);
  btn.setAttribute('aria-pressed', String(muted));
  btn.setAttribute('aria-label', muted ? 'Bật âm thanh' : 'Tắt âm thanh');
}
$('soundBtn').addEventListener('click', () => {
  Sound.setMuted(!Sound.isMuted());
  renderSoundBtn();
  Sound.play('click'); // chỉ kêu khi vừa bật lại
});
renderSoundBtn();

// Cập nhật số ngày còn lại mỗi phút
// (bỏ qua khi đang sửa để không làm mất con trỏ trong ô nhập)
setInterval(() => { if (!editingId) render(); }, 60 * 1000);

render();
