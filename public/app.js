async function fetchData() {
  const res = await fetch('/api/data');
  const data = await res.json();
  currentDataVersion = data.dataVersion;
  return data;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  children.forEach(c => {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  });
  return e;
}

// Sort employees alphabetically by name
function sortEmployees(employees) {
  return [...employees].sort((a, b) => a.name.localeCompare(b.name));
}

function getSupervisorName(employee) {
  return (employee.supervisor || '').trim() || 'Unassigned';
}

function groupEmployeesBySupervisor(employees) {
  const groups = new Map();
  sortEmployees(employees).forEach(employee => {
    const supervisor = getSupervisorName(employee);
    if (!groups.has(supervisor)) groups.set(supervisor, []);
    groups.get(supervisor).push(employee);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    })
    .map(([supervisor, groupedEmployees]) => ({ supervisor, employees: groupedEmployees }));
}

function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function saveHighlighted(employeeIds, token) {
  const response = await fetch('/api/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeIds, token, expectedVersion: currentDataVersion })
  });

  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseData.message || 'Failed to save highlights');
  }
  updateDataVersion(responseData);
}

let currentDataVersion = null;

function updateDataVersion(responseData) {
  if (responseData && typeof responseData.dataVersion === 'number') {
    currentDataVersion = responseData.dataVersion;
  }
}

async function writeJson(url, body, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, expectedVersion: currentDataVersion })
  });
  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseData.message || 'Save failed');
  }
  updateDataVersion(responseData);
  return responseData;
}

async function writeDelete(url) {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}expectedVersion=${encodeURIComponent(currentDataVersion)}`, { method: 'DELETE' });
  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseData.message || 'Delete failed');
  }
  updateDataVersion(responseData);
  return responseData;
}

function handleWriteError(err) {
  alert(err.message);
  if (/another supervisor|refresh/i.test(err.message)) {
    renderAdmin();
  }
}

// Admin page views
let adminView = 'assign';

function adminNavigation() {
  const nav = el('nav', { class: 'admin-nav', 'aria-label': 'Admin sections' });
  [['manage', 'Manage'], ['assign', 'Assign Tasks'], ['supervisors', 'Supervisor Setup'], ['announcements', 'Announcements']].forEach(([view, label]) => {
    const button = el('button', { type: 'button', class: adminView === view ? 'active' : '', 'aria-current': adminView === view ? 'page' : 'false' }, label);
    button.addEventListener('click', () => { adminView = view; renderAdmin(); });
    nav.appendChild(button);
  });
  return nav;
}

function supervisorSelect(supervisors, selected, attrs) {
  const select = el('select', attrs);
  ['Unassigned', ...[...supervisors].sort((a, b) => a.localeCompare(b))].forEach(name => {
    select.appendChild(el('option', { value: name }, name));
  });
  select.value = selected;
  return select;
}

async function renderAdminSupervisors() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  const token = localStorage.getItem('task-assigner-token');
  const data = await fetchData();
  document.querySelector('header h1').textContent = 'Supervisor Assignments';
  content.appendChild(adminNavigation());
  const section = el('section', { id: 'supervisor-setup' });
  section.appendChild(el('h2', {}, 'Supervisor Setup'));
  const form = el('form');
  const input = el('textarea', { id: 'supervisor-list', rows: '12', 'aria-describedby': 'supervisor-help' });
  input.value = data.supervisors.join('\n');
  const save = el('button', { type: 'submit' }, 'Save Supervisors');
  const status = el('p', { role: 'status' });
  form.appendChild(el('label', { for: 'supervisor-list' }, 'Supervisors'));
  form.appendChild(el('p', { id: 'supervisor-help' }, 'Enter one supervisor per line. Reassign employees before removing their supervisor. Unassigned is always available.'));
  form.appendChild(input);
  form.appendChild(save);
  form.appendChild(status);
  input.addEventListener('input', () => { status.textContent = ''; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      const result = await writeJson('/api/supervisors', { supervisors: input.value.split(/\r?\n/), token });
      input.value = result.supervisors.join('\n');
      status.textContent = 'Supervisors saved.';
    } catch (err) {
      handleWriteError(err);
    } finally {
      save.disabled = false;
    }
  });
  section.appendChild(form);
  content.appendChild(section);
  const logout = el('button', {}, 'Logout');
  logout.addEventListener('click', () => { localStorage.removeItem('task-assigner-token'); renderAdmin(); });
  content.appendChild(logout);
}

async function renderAdminManage() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  const token = localStorage.getItem('task-assigner-token');
  const data = await fetchData();
  const { employees, tasks, supervisors } = data;
  
  // Update header back to default
  const header = document.querySelector('header h1');
  header.textContent = 'Supervisor Assignments';

  content.appendChild(adminNavigation());

  // Employee Management Section
  const empMgmtSection = el('div', { id: 'emp-mgmt' });
  empMgmtSection.appendChild(el('h2', {}, 'Manage Employees'));
  const addEmpForm = el('form', {});
  const empNameInput = el('input', { type: 'text', id: 'emp-name', placeholder: 'Employee name', title: 'Enter name as: Lastname, Firstname (e.g., Smith, John)' });
  const empSupervisorInput = supervisorSelect(supervisors, 'Unassigned', { id: 'emp-supervisor', 'aria-label': 'Supervisor for new employee' });
  const addEmpBtn = el('button', { type: 'submit' }, 'Add Employee');
  addEmpForm.appendChild(empNameInput);
  addEmpForm.appendChild(empSupervisorInput);
  addEmpForm.appendChild(addEmpBtn);
  addEmpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = empNameInput.value.trim();
    const supervisor = empSupervisorInput.value.trim();
    if (!name) return;
    try {
      await writeJson('/api/employees', { name, supervisor, token });
      empNameInput.value = '';
      empSupervisorInput.value = '';
      renderAdminManage();
    } catch (err) {
      handleWriteError(err);
    }
  });
  empMgmtSection.appendChild(addEmpForm);

  const empList = el('div', { class: 'employee-list' });
  const sortedEmployees = sortEmployees(employees);
  sortedEmployees.forEach(emp => {
    const row = el('div', { class: 'employee-row' });
    const nameInput = el('input', { type: 'text', value: emp.name, 'aria-label': `Employee name for ${emp.name}` });
    const supervisorInput = supervisorSelect(supervisors, getSupervisorName(emp), { 'aria-label': `Supervisor for ${emp.name}` });
    const saveBtn = el('button', {}, 'Save');
    const delBtn = el('button', {}, 'Delete');

    saveBtn.addEventListener('click', async () => {
      try {
        await writeJson(`/api/employees/${emp.id}`, {
          name: nameInput.value,
          supervisor: supervisorInput.value,
          token
        }, { method: 'PATCH' });
        renderAdminManage();
      } catch (err) {
        handleWriteError(err);
      }
    });

    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete employee "${emp.name}"?`)) return;
      try {
        await writeDelete(`/api/employees/${emp.id}?token=${encodeURIComponent(token)}`);
        renderAdminManage();
      } catch (err) {
        handleWriteError(err);
      }
    });
    row.appendChild(nameInput);
    row.appendChild(supervisorInput);
    row.appendChild(saveBtn);
    row.appendChild(delBtn);
    empList.appendChild(row);
  });
  empMgmtSection.appendChild(empList);
  content.appendChild(empMgmtSection);

  // Task Management Section
  const taskMgmtSection = el('div', { id: 'task-mgmt' });
  taskMgmtSection.appendChild(el('h2', {}, 'Manage Tasks'));
  const addTaskForm = el('form', {});
  const taskNameInput = el('input', { type: 'text', id: 'task-name', placeholder: 'Task name' });
  const addTaskBtn = el('button', { type: 'submit' }, 'Add Task');
  addTaskForm.appendChild(taskNameInput);
  addTaskForm.appendChild(addTaskBtn);
  addTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskName = taskNameInput.value.trim();
    if (!taskName) return;
    try {
      await writeJson('/api/tasks', { taskName, token });
      taskNameInput.value = '';
      renderAdminManage();
    } catch (err) {
      handleWriteError(err);
    }
  });
  taskMgmtSection.appendChild(addTaskForm);

  const taskList = el('ul', {});
  tasks.forEach(task => {
    const li = el('li', {});
    li.appendChild(document.createTextNode(task));
    const delBtn = el('button', {}, 'Delete');
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete task "${task}"?`)) return;
      try {
        await writeDelete(`/api/tasks/${encodeURIComponent(task)}?token=${encodeURIComponent(token)}`);
        renderAdminManage();
      } catch (err) {
        handleWriteError(err);
      }
    });
    li.appendChild(delBtn);
    taskList.appendChild(li);
  });
  taskMgmtSection.appendChild(taskList);
  content.appendChild(taskMgmtSection);

  const logout = el('button', { style: 'margin-top:20px;' }, 'Logout');
  logout.addEventListener('click', () => { localStorage.removeItem('task-assigner-token'); renderAdmin(); });
  content.appendChild(logout);
}

async function renderAdminAssign() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  const token = localStorage.getItem('task-assigner-token');
  const data = await fetchData();
  const { employees, tasks, assignments, timeslots, pointingDate, highlightedEmployeeIds } = data;
  let highlighted = [...(highlightedEmployeeIds || [])];

  // Update header with date picker
  const header = document.querySelector('header h1');
  const selectedDate = pointingDate || getTodayDateValue();
  
  const headerContainer = el('div', { style: 'display:flex; align-items:center; gap:10px;' });
  headerContainer.appendChild(document.createTextNode('Daily Pointing for'));
  const dateInput = el('input', { type: 'date', value: selectedDate, style: 'padding:5px; font-size:14px;' });
  dateInput.addEventListener('change', async (e) => {
    try {
      await writeJson('/api/date', { pointingDate: e.target.value, token });
    } catch (err) {
      handleWriteError(err);
    }
  });
  headerContainer.appendChild(dateInput);
  header.innerHTML = '';
  header.appendChild(headerContainer);

  content.appendChild(adminNavigation());

  // Assignment Table
  const tableSection = el('div', { id: 'assign-section' });
  tableSection.appendChild(el('h2', {}, 'Assign Tasks'));
  const table = el('table', { class: 'assign-table' });
  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'Highlight'),
      el('th', {}, 'Employee'),
      ...timeslots.map(t => el('th', {}, t))
    )
  );
  table.appendChild(thead);

  const tbody = el('tbody');
  const supervisorGroups = groupEmployeesBySupervisor(employees);
  supervisorGroups.forEach(group => {
    tbody.appendChild(el('tr', { class: 'supervisor-row' },
      el('th', { colspan: String(timeslots.length + 2) }, `Supervisor: ${group.supervisor}`)
    ));
    group.employees.forEach(emp => {
      const tr = el('tr');
    // Highlight checkbox
      const checkbox = el('input', { type: 'checkbox' });
      checkbox.checked = highlighted.includes(emp.id);
      checkbox.addEventListener('change', async () => {
        const previousHighlighted = [...highlighted];
        if (checkbox.checked && !highlighted.includes(emp.id)) {
          highlighted.push(emp.id);
        } else if (!checkbox.checked) {
          highlighted = highlighted.filter(id => id !== emp.id);
        }

        try {
          await saveHighlighted(highlighted, token);
        } catch (err) {
          highlighted = previousHighlighted;
          checkbox.checked = previousHighlighted.includes(emp.id);
          handleWriteError(err);
        }
      });
      const tdCheckbox = el('td', {}, checkbox);
      tr.appendChild(tdCheckbox);
    // Employee name
      tr.appendChild(el('td', {}, emp.name));
      timeslots.forEach(ts => {
        const td = el('td', {});
        const sel = el('select', {});
        sel.appendChild(el('option', { value: '' }, ''));
        tasks.forEach(task => sel.appendChild(el('option', { value: task }, task)));
        const textInput = el('input', { type: 'text', placeholder: 'custom task', style: 'width:60%;margin-left:4px;' });
        sel.value = assignments[emp.id][ts] || '';
      
        const updateAssignment = async () => {
          let taskVal = textInput.value.trim() || sel.value;
          if (!taskVal) taskVal = '';
        // Add custom task to task list if it's not empty and not in the list
          try {
            if (taskVal && !tasks.includes(taskVal)) {
              await writeJson('/api/tasks', { taskName: taskVal, token });
              tasks.push(taskVal);
            }
            await writeJson('/api/assign', { employeeId: emp.id, timeslot: ts, task: taskVal, token });
          } catch (err) {
            handleWriteError(err);
          }
        };
      
        sel.addEventListener('change', () => {
          if (sel.value) textInput.value = '';
          updateAssignment();
        });
        textInput.addEventListener('change', updateAssignment);
        
        td.appendChild(sel);
        td.appendChild(textInput);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
  table.appendChild(tbody);
  tableSection.appendChild(table);
  content.appendChild(tableSection);

  const logout = el('button', { style: 'margin-top:20px;' }, 'Logout');
  logout.addEventListener('click', () => { localStorage.removeItem('task-assigner-token'); renderAdmin(); });
  content.appendChild(logout);
}

async function renderAdminAnnouncements() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  const token = localStorage.getItem('task-assigner-token');
  const data = await fetchData();
  const { announcements } = data;

  // Check for draft announcements in localStorage
  const draftAnnouncements = JSON.parse(localStorage.getItem('task-assigner-draft-announcements') || 'null');
  const announcementsToUse = draftAnnouncements || announcements;

  content.appendChild(adminNavigation());

  // Announcements Section
  const announcSection = el('div', { id: 'announcements-section' });
  announcSection.appendChild(el('h2', {}, 'Announcements'));
  const form = el('form', {});
  
  const inputs = [];
  for (let i = 0; i < 3; i++) {
    const label = el('label', { style: 'display:block; margin-top:10px; margin-bottom:5px; font-weight:bold;' }, `Announcement ${i + 1}:`);
    const input = el('textarea', { style: 'width:100%; height:60px; padding:8px; border:1px solid #ccc; border-radius:4px; font-family:inherit;', placeholder: `Enter announcement ${i + 1}...` });
    input.value = announcementsToUse[i] || '';
    
    // Save to localStorage draft whenever user types
    input.addEventListener('input', () => {
      const currentDraft = inputs.map(inp => inp.value);
      localStorage.setItem('task-assigner-draft-announcements', JSON.stringify(currentDraft));
    });
    
    form.appendChild(label);
    form.appendChild(input);
    inputs.push(input);
  }

  const submitBtn = el('button', { type: 'submit', style: 'margin-top:15px; padding:10px 20px; background:#0b5cff; color:white; border:none; cursor:pointer; border-radius:4px; margin-right:10px;' }, 'Save Announcements');
  const clearBtn = el('button', { type: 'button', style: 'padding:10px 20px; background:#d32f2f; color:white; border:none; cursor:pointer; border-radius:4px;' }, 'Clear All');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const announcementsData = inputs.map(inp => inp.value);
    console.log('Saving announcements:', announcementsData);
    try {
      await writeJson('/api/announcements', { announcements: announcementsData, token });
      localStorage.removeItem('task-assigner-draft-announcements');
      alert('Announcements saved!');
      await renderAdminAnnouncements();
    } catch (err) {
      console.error('Error saving announcements:', err);
      handleWriteError(err);
    }
  });

  clearBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm('Clear all announcements?')) return;
    try {
      await writeJson('/api/announcements/clear', { token });
      localStorage.removeItem('task-assigner-draft-announcements');
      renderAdminAnnouncements();
    } catch (err) {
      handleWriteError(err);
    }
  });

  form.appendChild(submitBtn);
  form.appendChild(clearBtn);
  announcSection.appendChild(form);
  content.appendChild(announcSection);

  const logout = el('button', { style: 'margin-top:20px;' }, 'Logout');
  logout.addEventListener('click', () => { localStorage.removeItem('task-assigner-token'); renderAdmin(); });
  content.appendChild(logout);
}

async function renderAdmin() {
  const content = document.getElementById('content');
  content.innerHTML = '';

  const token = localStorage.getItem('task-assigner-token');
  if (!token) {
    const form = el('form', {},
      el('label', {}, 'Password: '),
      el('input', { type: 'password', id: 'pw' }),
      el('button', { type: 'submit' }, 'Login')
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('pw').value;
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      if (r.ok) {
        const j = await r.json();
        localStorage.setItem('task-assigner-token', j.token);
        renderAdmin();
      } else alert('Login failed');
    });
    content.appendChild(form);
    return;
  }

  if (adminView === 'manage') renderAdminManage();
  else if (adminView === 'supervisors') renderAdminSupervisors();
  else if (adminView === 'announcements') renderAdminAnnouncements();
  else renderAdminAssign();
}

// Dashboard: initialize once and update cells in-place
let _dashboard = {
  built: false,
  timeslots: [],
  rows: {}, // rows[employeeId] = { nameCell, cells: { timeslot: td } }
  tableEl: null,
  announcementsHash: null, // track if announcements changed
  pointingDate: null,
  highlightedEmployeeIds: [],
  employeeHash: null,
  eventSource: null,
  updating: false,
};

async function initDashboard() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  const data = await fetchData();
  const { employees, assignments, timeslots, announcements, pointingDate, highlightedEmployeeIds } = data;

  // Update header with date and full-screen toggle
  const header = document.querySelector('header');
  const selectedDate = pointingDate || getTodayDateValue();

  header.innerHTML = '';
  const title = el('h1', {}, `Task Dashboard as of ${formatDate(selectedDate)}`);
  const fsBtn = el('button', { id: 'fullscreen-btn', type: 'button' }, 'Enter Full Screen');

  const setFsLabel = () => {
    fsBtn.textContent = document.fullscreenElement ? 'Exit Full Screen' : 'Enter Full Screen';
  };

  fsBtn.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
    setFsLabel();
  });

  document.addEventListener('fullscreenchange', setFsLabel);
  header.appendChild(title);
  header.appendChild(fsBtn);

  // Display announcements always; highlight first if present
  const announcSection = el('div', { style: 'margin-bottom:20px; padding:15px; background:#f5f5f5; border-left:4px solid #0b5cff;' });
  const hasAnnouncements = announcements && announcements.some(a => a.trim());
  announcSection.appendChild(el('h2', {}, 'Announcements'));

  if (hasAnnouncements) {
    announcements.forEach((ann, idx) => {
      const isFirst = idx === 0 && ann.trim();
      const style = isFirst
        ? 'margin-bottom:8px; padding:8px; background:yellow; border-radius:4px; font-weight:bold;'
        : 'margin-bottom:8px; padding:8px; background:white; border-radius:4px;';
      if (ann.trim()) {
        const announcDiv = el('div', { style }, ann);
        announcSection.appendChild(announcDiv);
      }
    });
  } else {
    announcSection.appendChild(el('div', { style: 'padding:8px; background:white; border-radius:4px;' }, 'No announcements at this time.'));
  }

  content.appendChild(announcSection);

  _dashboard.timeslots = timeslots;
  _dashboard.rows = {};
  _dashboard.announcementsHash = JSON.stringify(announcements);
  _dashboard.pointingDate = selectedDate;
  _dashboard.highlightedEmployeeIds = highlightedEmployeeIds || [];
  _dashboard.employeeHash = JSON.stringify(sortEmployees(employees).map(employee => ({
    id: employee.id,
    name: employee.name,
    supervisor: getSupervisorName(employee)
  })));

  const table = el('table', { class: 'assign-table' });
  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'Employee'),
      ...timeslots.map(t => el('th', {}, t))
    )
  );
  table.appendChild(thead);

  const tbody = el('tbody');
  const supervisorGroups = groupEmployeesBySupervisor(employees);
  let employeeIndex = 0;
  supervisorGroups.forEach(group => {
    tbody.appendChild(el('tr', { class: 'supervisor-row' },
      el('th', { colspan: String(timeslots.length + 1) }, `Supervisor: ${group.supervisor}`)
    ));
    group.employees.forEach(emp => {
      const tr = el('tr');
      tr.style.background = employeeIndex % 2 === 0 ? '#ffffff' : '#f9f9f9';
      const nameTd = el('td', {}, emp.name);
      tr.appendChild(nameTd);
      const cellMap = {};
      timeslots.forEach(ts => {
        const td = el('td', {}, assignments[emp.id][ts] || '');
        tr.appendChild(td);
        cellMap[ts] = td;
      });
      tbody.appendChild(tr);
      _dashboard.rows[emp.id] = { nameCell: nameTd, cells: cellMap };
      if (_dashboard.highlightedEmployeeIds.includes(emp.id)) {
        tr.style.fontWeight = 'bold';
        tr.style.backgroundColor = 'yellow';
      }
      employeeIndex += 1;
    });
  });
  table.appendChild(tbody);
  content.appendChild(table);

  _dashboard.built = true;
  _dashboard.tableEl = table;
}

async function updateDashboard() {
  if (_dashboard.updating) return;
  _dashboard.updating = true;
  try {
    if (!_dashboard.built) {
      await initDashboard();
      return;
    }
    const data = await fetchData();
    const { employees, assignments, timeslots, announcements, pointingDate, highlightedEmployeeIds } = data;

    // Update header date in case it changed
    const header = document.querySelector('header h1');
    const selectedDate = pointingDate || getTodayDateValue();
    header.textContent = `Task Dashboard as of ${formatDate(selectedDate)}`;
    _dashboard.pointingDate = selectedDate;

    // If timeslots changed or employees changed (simple detection), rebuild
    const timesEqual = JSON.stringify(timeslots) === JSON.stringify(_dashboard.timeslots);
    const employeeHash = JSON.stringify(sortEmployees(employees).map(employee => ({
      id: employee.id,
      name: employee.name,
      supervisor: getSupervisorName(employee)
    })));

    // Check if announcements changed
    const currentAnnouncementsHash = JSON.stringify(announcements);
    const announcementsChanged = currentAnnouncementsHash !== _dashboard.announcementsHash;

    if (!timesEqual || employeeHash !== _dashboard.employeeHash || announcementsChanged) {
      await initDashboard();
      return;
    }

    // update each cell textContent if changed
    employees.forEach(emp => {
      const row = _dashboard.rows[emp.id];
      if (!row) return; // safety
      timeslots.forEach(ts => {
        const td = row.cells[ts];
        const newVal = assignments[emp.id][ts] || '';
        if (td.textContent !== newVal) td.textContent = newVal;
      });
    });

    _dashboard.highlightedEmployeeIds = highlightedEmployeeIds || [];
    Object.keys(_dashboard.rows).forEach((empId, index) => {
      const tr = _dashboard.rows[empId].nameCell.parentElement;
      if (_dashboard.highlightedEmployeeIds.includes(Number(empId))) {
        tr.style.fontWeight = 'bold';
        tr.style.backgroundColor = 'yellow';
      } else {
        tr.style.fontWeight = '';
        tr.style.backgroundColor = '';
        // Restore zebra if not highlighted
        tr.style.background = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
      }
    });
  } catch (err) {
    console.error('Dashboard update failed:', err);
  } finally {
    _dashboard.updating = false;
  }
}

function startDashboardUpdates() {
  initDashboard();
  setInterval(updateDashboard, 5000);

  if (!window.EventSource || _dashboard.eventSource) return;
  const eventSource = new EventSource('/api/events');
  eventSource.onmessage = updateDashboard;
  eventSource.onerror = (err) => {
    console.error('Dashboard event stream interrupted; polling fallback remains active.', err);
  };
  _dashboard.eventSource = eventSource;
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  const id = document.body.id;
  if (id === 'admin') renderAdmin();
  else {
    startDashboardUpdates();
  }

  // no manual reload button on dashboard to avoid full page refresh
});
