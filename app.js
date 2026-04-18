/* ============================================
   Employee Manager — Core Application Logic
   ============================================ */

const AUTH_KEY = 'empManagerAuth';
const STORAGE_KEY = 'empManagerData';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6'];

let state = defaultState();

function defaultState() {
  return { employees: [], attendance: {} };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    
    const data = JSON.parse(raw);
    
    // Basic Schema Validation
    if (data && Array.isArray(data.employees) && typeof data.attendance === 'object') {
      return data;
    }
  } catch(e) { 
    console.error('Load error', e); 
    showToast('Loading error: data may be corrupted.');
  }
  return defaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---- Utilities ----
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function getInitials(name) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatCurrency(num) {
  return '₹' + Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrencyPdf(num) {
  return 'Rs.' + Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function getDaysInMonth(month, year) {
  return new Date(year, month + 1, 0).getDate();
}

function getAttendanceKey(empId, month, year) {
  return `${empId}_${year}_${month}`;
}

// ---- Authentication ----
async function hashPasscode(passcode) {
  const encoder = new TextEncoder();
  const data = encoder.encode(passcode);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function initAuth() {
  const storedHash = localStorage.getItem(AUTH_KEY);
  const loginTitle = document.getElementById('login-title');
  const loginSubtitle = document.getElementById('login-subtitle');
  const loginBtnText = document.getElementById('login-btn').querySelector('span');

  if (!storedHash) {
    loginTitle.textContent = 'Set Passcode';
    loginSubtitle.textContent = 'Create a 4-6 digit passcode to secure your data';
    loginBtnText.textContent = 'Secure & Unlock';
  }

  document.getElementById('login-form').onsubmit = handleAuthSubmit;
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('login-passcode');
  const passcode = input.value;
  
  if (passcode.length < 4) {
    showToast('Passcode must be at least 4 digits');
    return;
  }

  const hash = await hashPasscode(passcode);
  const storedHash = localStorage.getItem(AUTH_KEY);

  if (!storedHash) {
    localStorage.setItem(AUTH_KEY, hash);
    unlockApp();
  } else if (hash === storedHash) {
    unlockApp();
  } else {
    showToast('Incorrect passcode');
    input.value = '';
    input.focus();
  }
}

function unlockApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app').classList.remove('app-hidden');
  
  // Initialize app data only after unlock
  state = loadState();
  refreshDashboard();
  showToast('Welcome back!');
}

// ---- Navigation ----
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + viewName).classList.add('active');
  document.querySelector(`.nav-btn[data-view="${viewName}"]`).classList.add('active');

  if (viewName === 'dashboard') refreshDashboard();
  if (viewName === 'employees') renderEmployees();
  if (viewName === 'attendance') { populateEmployeeSelects(); renderAttendanceCalendar(); }
  if (viewName === 'salary') { populateEmployeeSelects(); calculateSalary(); }
}

// ---- Header Date ----
function updateHeaderDate() {
  const d = new Date();
  document.getElementById('header-date').textContent = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Dashboard ----
function refreshDashboard() {
  const total = state.employees.length;
  document.getElementById('stat-total-employees').textContent = total;

  // Today's attendance
  const today = new Date();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const todayDate = today.getDate();
  let presentToday = 0, absentToday = 0;

  state.employees.forEach(emp => {
    const key = getAttendanceKey(emp.id, todayMonth, todayYear);
    const att = state.attendance[key];
    if (att && att[todayDate]) {
      if (att[todayDate] === 'P') presentToday++;
      else absentToday++;
    }
  });

  document.getElementById('stat-present-today').textContent = presentToday;
  document.getElementById('stat-absent-today').textContent = absentToday;

  // Average wage
  if (total > 0) {
    const avg = state.employees.reduce((s, e) => s + Number(e.dailyWage), 0) / total;
    document.getElementById('stat-avg-wage').textContent = '₹' + Math.round(avg).toLocaleString('en-IN');
  } else {
    document.getElementById('stat-avg-wage').textContent = '₹0';
  }

  // Recent employees
  const container = document.getElementById('recent-employees-list');
  if (total === 0) {
    container.innerHTML = '<p class="empty-state-text">No employees added yet. Go to the Employees tab to add.</p>';
    return;
  }

  const recent = state.employees.slice(-5).reverse();
  container.innerHTML = recent.map(emp => `
    <div class="mini-emp-card">
      <div class="mini-emp-avatar" style="background:${getAvatarColor(emp.id)}">${esc(getInitials(emp.name))}</div>
      <div class="mini-emp-info">
        <div class="mini-emp-name">${esc(emp.name)}</div>
        <div class="mini-emp-role">${esc(emp.role || 'No role assigned')}</div>
      </div>
      <div class="mini-emp-wage">${formatCurrency(emp.dailyWage)}/day</div>
    </div>
  `).join('');
}

// ---- Employees CRUD ----
function renderEmployees(filter = '') {
  const container = document.getElementById('employees-list');
  let list = state.employees;
  if (filter) {
    const q = filter.toLowerCase();
    list = list.filter(e => e.name.toLowerCase().includes(q) || (e.role && e.role.toLowerCase().includes(q)));
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        <p>${filter ? 'No matching employees' : 'No employees yet'}</p>
        <span>${filter ? 'Try a different search' : 'Click "Add Employee" to get started'}</span>
      </div>`;
    return;
  }

  container.innerHTML = list.map(emp => `
    <div class="emp-card" data-id="${emp.id}">
      <div class="emp-avatar" style="background:${getAvatarColor(emp.id)}">${esc(getInitials(emp.name))}</div>
      <div class="emp-details">
        <div class="emp-name">${esc(emp.name)}</div>
        <div class="emp-role-text">${esc(emp.role || 'No role')}</div>
        <div class="emp-wage-badge">₹${Number(emp.dailyWage).toLocaleString('en-IN')}/day</div>
      </div>
      <div class="emp-actions">
        <button class="emp-action-btn" title="Edit" onclick="editEmployee('${emp.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        </button>
        <button class="emp-action-btn delete" title="Delete" onclick="deleteEmployee('${emp.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

function filterEmployees(val) { renderEmployees(val); }

function openEmployeeModal(editId) {
  const modal = document.getElementById('employee-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('employee-form');
  form.reset();
  document.getElementById('emp-edit-id').value = '';

  if (editId) {
    const emp = state.employees.find(e => e.id === editId);
    if (!emp) return;
    title.textContent = 'Edit Employee';
    document.getElementById('emp-name').value = emp.name;
    document.getElementById('emp-role').value = emp.role || '';
    document.getElementById('emp-phone').value = emp.phone || '';
    document.getElementById('emp-daily-wage').value = emp.dailyWage;
    document.getElementById('emp-join-date').value = emp.joinDate || '';
    document.getElementById('emp-esi').checked = emp.esi !== false;
    document.getElementById('emp-edit-id').value = emp.id;
  } else {
    title.textContent = 'Add Employee';
  }
  modal.classList.add('active');
}

function closeEmployeeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('employee-modal').classList.remove('active');
}

function saveEmployee(event) {
  event.preventDefault();
  const name = document.getElementById('emp-name').value.trim();
  const role = document.getElementById('emp-role').value.trim();
  const phone = document.getElementById('emp-phone').value.trim();
  const dailyWage = Number(document.getElementById('emp-daily-wage').value);
  const joinDate = document.getElementById('emp-join-date').value;
  const esi = document.getElementById('emp-esi').checked;
  const editId = document.getElementById('emp-edit-id').value;

  if (!name || !dailyWage) return;

  if (editId) {
    const idx = state.employees.findIndex(e => e.id === editId);
    if (idx >= 0) {
      state.employees[idx] = { ...state.employees[idx], name, role, phone, dailyWage, joinDate, esi };
    }
    showToast('Employee updated successfully');
  } else {
    state.employees.push({ id: genId(), name, role, phone, dailyWage, joinDate, esi });
    showToast('Employee added successfully');
  }

  saveState();
  closeEmployeeModal();
  renderEmployees();
  populateEmployeeSelects();
}

function editEmployee(id) { openEmployeeModal(id); }

function deleteEmployee(id) {
  if (!id) return;
  const emp = state.employees.find(e => e.id === id);
  if (!emp) {
    console.error('Employee not found for ID:', id);
    return;
  }
  
  if (!window.confirm(`Delete "${emp.name}"?\n\nThis will permanently remove their attendance and salary records.`)) return;

  state.employees = state.employees.filter(e => e.id !== id);

  // Remove attendance data
  Object.keys(state.attendance).forEach(key => {
    if (key.startsWith(id + '_')) delete state.attendance[key];
  });

  saveState();
  renderEmployees();
  populateEmployeeSelects();
  showToast('Employee deleted successfully');
}

// ---- Populate Selects ----
function populateEmployeeSelects() {
  const selects = [document.getElementById('att-employee'), document.getElementById('sal-employee')];
  selects.forEach(sel => {
    if (!sel) return;
    const prevVal = sel.value;
    sel.innerHTML = '<option value="">-- Select Employee --</option>';
    state.employees.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.id;
      opt.textContent = emp.name;
      sel.appendChild(opt);
    });
    if (prevVal && state.employees.find(e => e.id === prevVal)) sel.value = prevVal;
  });
}

function populateYearSelects() {
  const currentYear = new Date().getFullYear();
  const selects = [document.getElementById('att-year'), document.getElementById('sal-year')];
  selects.forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === currentYear) opt.selected = true;
      sel.appendChild(opt);
    }
  });

  // Set current month
  const currentMonth = new Date().getMonth();
  const monthSelects = [document.getElementById('att-month'), document.getElementById('sal-month')];
  monthSelects.forEach(sel => { if (sel) sel.value = currentMonth; });
}

// ---- Attendance Calendar ----
function renderAttendanceCalendar() {
  const empId = document.getElementById('att-employee').value;
  const month = parseInt(document.getElementById('att-month').value);
  const year = parseInt(document.getElementById('att-year').value);
  const container = document.getElementById('attendance-calendar');

  if (!empId) {
    container.innerHTML = '<p class="empty-state-text">Select an employee to view attendance.</p>';
    updateAttendanceSummary(null);
    return;
  }

  const key = getAttendanceKey(empId, month, year);
  if (!state.attendance[key]) state.attendance[key] = {};

  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = new Date(year, month, 1).getDay();

  let html = '<div class="cal-header">';
  DAYS.forEach(d => html += `<span>${d}</span>`);
  html += '</div><div class="cal-grid">';

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const status = state.attendance[key][d] || '';
    const dayOfWeek = new Date(year, month, d).getDay();
    const isSunday = dayOfWeek === 0;
    let cls = '';
    let statusLabel = '';

    if (status === 'P') { cls = 'present'; statusLabel = 'P'; }
    else if (status === 'A') { cls = 'absent'; statusLabel = 'A'; }
    else if (status === 'L') { cls = 'leave'; statusLabel = 'L'; }
    else if (status === 'H') { cls = 'holiday'; statusLabel = 'H'; }
    else if (isSunday) { cls = 'sunday'; }

    html += `<div class="cal-day ${cls}" onclick="toggleAttendance(${d})" data-day="${d}">
      <span class="day-num">${d}</span>
      ${statusLabel ? `<span class="day-status">${statusLabel}</span>` : ''}
    </div>`;
  }

  html += '</div>';
  container.innerHTML = html;

  updateAttendanceSummary(key);
}

function toggleAttendance(day) {
  const empId = document.getElementById('att-employee').value;
  const month = parseInt(document.getElementById('att-month').value);
  const year = parseInt(document.getElementById('att-year').value);
  if (!empId) return;

  const key = getAttendanceKey(empId, month, year);
  if (!state.attendance[key]) state.attendance[key] = {};

  const current = state.attendance[key][day] || '';
  const cycle = ['', 'P', 'A', 'L', 'H'];
  const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
  state.attendance[key][day] = cycle[nextIdx];

  if (!cycle[nextIdx]) delete state.attendance[key][day];

  saveState();
  renderAttendanceCalendar();
}

function updateAttendanceSummary(key) {
  let present = 0, absent = 0, leave = 0, holiday = 0;

  if (key && state.attendance[key]) {
    Object.values(state.attendance[key]).forEach(v => {
      if (v === 'P') present++;
      else if (v === 'A') absent++;
      else if (v === 'L') leave++;
      else if (v === 'H') holiday++;
    });
  }

  document.getElementById('att-present-count').textContent = present;
  document.getElementById('att-absent-count').textContent = absent;
  document.getElementById('att-leave-count').textContent = leave;
  document.getElementById('att-holiday-count').textContent = holiday;
}

// ---- Salary Calculator ----
function getAttendanceCounts(empId, month, year) {
  const key = getAttendanceKey(empId, month, year);
  const att = state.attendance[key] || {};
  let present = 0, leave = 0, absent = 0, holiday = 0;

  Object.values(att).forEach(v => {
    if (v === 'P') present++;
    else if (v === 'L') leave++;
    else if (v === 'A') absent++;
    else if (v === 'H') holiday++;
  });

  return { present, leave, absent, holiday };
}

function calculateSalary() {
  const empId = document.getElementById('sal-employee').value;
  const month = parseInt(document.getElementById('sal-month').value);
  const year = parseInt(document.getElementById('sal-year').value);
  const leaveWage = Number(document.getElementById('sal-leave-wage').value) || 0;
  const advance = Number(document.getElementById('sal-advance').value) || 0;

  const resultEl = document.getElementById('salary-result');
  const emptyEl = document.getElementById('salary-empty');

  if (!empId) {
    resultEl.style.display = 'none';
    emptyEl.style.display = '';
    return;
  }

  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  const counts = getAttendanceCounts(empId, month, year);
  const daysWorked = counts.present;
  const dailyWage = Number(emp.dailyWage);
  const da = daysWorked * 17;

  // Update read-only DA input in UI
  document.getElementById('sal-da').value = da;

  // Salary Calculation
  const basicSalary = dailyWage * daysWorked;
  const grossSalary = basicSalary + leaveWage;
  const esiApplicable = emp.esi !== false;
  const esi = esiApplicable ? Math.round(0.0075 * dailyWage * daysWorked * 100) / 100 : 0;
  const totalDeductions = esi + advance;
  const netSalary = grossSalary - totalDeductions;

  // Update UI
  document.getElementById('sal-emp-name').textContent = emp.name;
  document.getElementById('sal-period').textContent = `${MONTHS[month]} ${year}`;
  document.getElementById('sal-daily-wage').textContent = formatCurrency(dailyWage);
  document.getElementById('sal-days-worked').textContent = daysWorked;
  document.getElementById('sal-basic').textContent = formatCurrency(basicSalary);
  document.getElementById('sal-leave-display').textContent = formatCurrency(leaveWage);
  document.getElementById('sal-da-display').textContent = formatCurrency(da);
  document.getElementById('sal-gross').textContent = formatCurrency(grossSalary);
  document.getElementById('sal-esi').textContent = '- ' + formatCurrency(esi);
  document.getElementById('sal-advance-display').textContent = '- ' + formatCurrency(advance);
  document.getElementById('sal-total-deductions').textContent = '- ' + formatCurrency(totalDeductions);
  document.getElementById('sal-net').textContent = formatCurrency(netSalary);

  resultEl.style.display = '';
  emptyEl.style.display = 'none';
}

// ---- Salary Slip PDF Download ----
function downloadSalarySlip() {
  const empId = document.getElementById('sal-employee').value;
  const month = parseInt(document.getElementById('sal-month').value);
  const year = parseInt(document.getElementById('sal-year').value);
  const leaveWage = Number(document.getElementById('sal-leave-wage').value) || 0;
  const advance = Number(document.getElementById('sal-advance').value) || 0;

  if (!empId) return;

  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  const counts = getAttendanceCounts(empId, month, year);
  const daysWorked = counts.present;
  const dailyWage = Number(emp.dailyWage);
  const da = daysWorked * 17;

  const basicSalary = dailyWage * daysWorked;
  const grossSalary = basicSalary + leaveWage;
  const esiApplicable = emp.esi !== false;
  const esi = esiApplicable ? Math.round(0.0075 * dailyWage * daysWorked * 100) / 100 : 0;
  const totalDeductions = esi + advance;
  const netSalary = grossSalary - totalDeductions;


  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 20;
  const marginR = 20;
  const contentW = pageW - marginL - marginR;
  let y = 20;

  // Helpers
  const drawLine = (yPos, color = [200, 200, 210]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.3);
    doc.line(marginL, yPos, pageW - marginR, yPos);
  };

  const addRow = (label, value, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 100);
    doc.text(label, marginL + 4, y);
    doc.setTextColor(30, 30, 50);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(value, pageW - marginR - 4, y, { align: 'right' });
    y += 7;
  };

  // ========= HEADER =========
  // Header background
  doc.setFillColor(99, 102, 241);
  doc.roundedRect(marginL, y, contentW, 28, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('SALARY SLIP', pageW / 2, y + 12, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${MONTHS[month]} ${year}`, pageW / 2, y + 20, { align: 'center' });

  y += 38;

  // ========= EMPLOYEE INFO =========
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 150);
  doc.text('EMPLOYEE DETAILS', marginL, y);
  y += 6;
  drawLine(y);
  y += 6;

  doc.setFontSize(10);
  doc.setTextColor(30, 30, 50);

  // Name
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 120);
  doc.text('Name:', marginL + 4, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 50);
  doc.text(emp.name, marginL + 40, y);

  // Role
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 120);
  doc.text('Role:', pageW / 2 + 4, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 50);
  doc.text(emp.role || 'N/A', pageW / 2 + 30, y);
  y += 7;

  // Phone
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 120);
  doc.text('Phone:', marginL + 4, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 50);
  doc.text(emp.phone || 'N/A', marginL + 40, y);

  // Daily Wage
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 120);
  doc.text('Daily Wage:', pageW / 2 + 4, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 50);
  doc.text(formatCurrencyPdf(dailyWage), pageW / 2 + 40, y);
  y += 10;

  drawLine(y);
  y += 8;

  // ========= ATTENDANCE SUMMARY =========
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 150);
  doc.text('ATTENDANCE SUMMARY', marginL, y);
  y += 6;
  drawLine(y);
  y += 6;

  doc.setFontSize(10);
  addRow('Days Worked (Present)', String(counts.present));
  addRow('Days Absent', String(counts.absent));
  addRow('Leave Days', String(counts.leave));
  addRow('Holidays', String(counts.holiday));

  drawLine(y);
  y += 8;

  // ========= EARNINGS =========
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 150);
  doc.text('EARNINGS', marginL, y);
  y += 6;
  drawLine(y);
  y += 6;

  doc.setFontSize(10);
  addRow('Basic Salary (Daily Wage x Days Worked)', formatCurrencyPdf(basicSalary));
  addRow('Leave Wage', formatCurrencyPdf(leaveWage));
  addRow('DA (Reference)', formatCurrencyPdf(da));

  drawLine(y, [99, 102, 241]);
  y += 1;
  drawLine(y, [99, 102, 241]);
  y += 6;
  addRow('Gross Salary', formatCurrencyPdf(grossSalary), true);
  y += 2;
  drawLine(y);
  y += 8;

  // ========= DEDUCTIONS =========
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 150);
  doc.text('DEDUCTIONS', marginL, y);
  y += 6;
  drawLine(y);
  y += 6;

  doc.setFontSize(10);
  addRow('ESI (0.75% x Daily Wage x Days Worked)', '- ' + formatCurrencyPdf(esi));
  addRow('Advance Deduction', '- ' + formatCurrencyPdf(advance));

  drawLine(y);
  y += 6;
  addRow('Total Deductions', '- ' + formatCurrencyPdf(totalDeductions), true);
  y += 2;
  drawLine(y);
  y += 8;



  // ========= NET SALARY =========
  doc.setFillColor(240, 240, 255);
  doc.roundedRect(marginL, y - 4, contentW, 22, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 50);
  doc.text('NET SALARY PAYABLE', marginL + 8, y + 9);

  doc.setFontSize(14);
  doc.setTextColor(99, 102, 241);
  doc.text(formatCurrencyPdf(netSalary), pageW - marginR - 8, y + 9, { align: 'right' });

  y += 30;

  // ========= FOOTER =========
  drawLine(y, [180, 180, 200]);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 170);
  doc.text('This is a computer-generated salary slip.', pageW / 2, y, { align: 'center' });
  y += 5;
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageW / 2, y, { align: 'center' });

  // Download
  const filename = `Salary_Slip_${emp.name.replace(/\s+/g, '_')}_${MONTHS[month]}_${year}.pdf`;
  doc.save(filename);
  showToast('Salary slip downloaded!');
}

// ---- Settings & Security ----
function openSettingsModal() {
  document.getElementById('passcode-form').reset();
  document.getElementById('settings-modal').classList.add('active');
}

function closeSettingsModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('settings-modal').classList.remove('active');
}

async function handlePasscodeChange(event) {
  event.preventDefault();
  const current = document.getElementById('current-passcode').value;
  const newPass = document.getElementById('new-passcode').value;
  const confirmPass = document.getElementById('confirm-passcode').value;

  if (newPass.length < 4) {
    showToast('New passcode must be at least 4 digits');
    return;
  }

  if (newPass !== confirmPass) {
    showToast('New passcodes do not match');
    return;
  }

  // Verify current passcode
  const currentHash = await hashPasscode(current);
  const storedHash = localStorage.getItem(AUTH_KEY);

  if (currentHash !== storedHash) {
    showToast('Current passcode is incorrect');
    return;
  }

  // Save new passcode
  const newHash = await hashPasscode(newPass);
  localStorage.setItem(AUTH_KEY, newHash);
  
  showToast('Passcode updated successfully!');
  closeSettingsModal();
}

// ---- HTML Escape ----
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function init() {
  updateHeaderDate();
  populateYearSelects();
  populateEmployeeSelects();
  initAuth();

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.log('Service Worker registration failed', err));
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
