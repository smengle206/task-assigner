async function fetchData() {
  const res = await fetch('/api/data');
  return res.json();
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

// Highlight helpers
function getHighlighted() {
  return JSON.parse(localStorage.getItem('task-assigner-highlighted') || '[]');
}

function setHighlighted(ids) {
  localStorage.setItem('task-assigner-highlighted', JSON.stringify(ids));
}

// Admin page - split into Manage and Assign views
let adminView = 'assign'; // 'manage' or 'assign'

async function renderAdminManage() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  const token = localStorage.getItem('task-assigner-token');
  const data = await fetchData();
  const { employees, tasks } = data;
  
  // Update header back to default
  const header = document.querySelector('header h1');
  header.textContent = 'Supervisor Assignments';

  // Navigation
  const nav = el('nav', { style: 'margin-bottom:20px; border-bottom: 2px solid #0b5cff; padding-bottom:10px;' });
  const manageBtn = el('button', { style: 'padding:10px 20px; margin-right:10px; background:#0b5cff; color:white; border:none; cursor:pointer; font-weight:bold;' }, 'Manage');
  const assignBtn = el('button', { style: 'padding:10px 20px; margin-right:10px; background:#ddd; border:none; cursor:pointer;' }, 'Assign Tasks');
  const announcBtn = el('button', { style: 'padding:10px 20px; background:#ddd; border:none; cursor:pointer;' }, 'Announcements');
  manageBtn.addEventListener('click', () => { adminView = 'manage'; renderAdminManage(); });
  assignBtn.addEventListener('click', () => { adminView = 'assign'; renderAdminAssign(); });
  announcBtn.addEventListener('click', () => { adminView = 'announcements'; renderAdminAnnouncements(); });
  nav.appendChild(manageBtn);
  nav.appendChild(assignBtn);
  nav.appendChild(announcBtn);
  content.appendChild(nav);

  // Employee Management Section
  const empMgmtSection = el('div', { id: 'emp-mgmt' });
  empMgmtSection.appendChild(el('h2', {}, 'Manage Employees'));
  const addEmpForm = el('form', {});
  const empNameInput = el('input', { type: 'text', id: 'emp-name', placeholder: 'Employee name', title: 'Enter name as: Lastname, Firstname (e.g., Smith, John)' });
  const addEmpBtn = el('button', { type: 'submit' }, 'Add Employee');
  addEmpForm.appendChild(empNameInput);
  addEmpForm.appendChild(addEmpBtn);
  addEmpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = empNameInput.value.trim();
    if (!name) return;
    await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, token }) });
    empNameInput.value = '';
    renderAdminManage();
  });
  empMgmtSection.appendChild(addEmpForm);

  const empList = el('ul', {});
  const sortedEmployees = sortEmployees(employees);
  sortedEmployees.forEach(emp => {
    const li = el('li', {});
    li.appendChild(document.createTextNode(emp.name));
    const delBtn = el('button', {}, 'Delete');
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete employee "${emp.name}"?`)) return;
      await fetch(`/api/employees/${emp.id}?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      renderAdminManage();
    });
    li.appendChild(delBtn);
    empList.appendChild(li);
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
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskName, token }) });
    taskNameInput.value = '';
    renderAdminManage();
  });
  taskMgmtSection.appendChild(addTaskForm);

  const taskList = el('ul', {});
  tasks.forEach(task => {
    const li = el('li', {});
    li.appendChild(document.createTextNode(task));
    const delBtn = el('button', {}, 'Delete');
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete task "${task}"?`)) return;
      await fetch(`/api/tasks/${encodeURIComponent(task)}?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      renderAdminManage();
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
  const { employees, tasks, assignments, timeslots } = data;

  // Update header with date picker
  const header = document.querySelector('header h1');
  const today = new Date().toISOString().split('T')[0];
  const savedDate = localStorage.getItem('task-assigner-pointing-date') || today;
  localStorage.setItem('task-assigner-pointing-date', savedDate);
  
  const headerContainer = el('div', { style: 'display:flex; align-items:center; gap:10px;' });
  headerContainer.appendChild(document.createTextNode('Daily Pointing for'));
  const dateInput = el('input', { type: 'date', value: savedDate, style: 'padding:5px; font-size:14px;' });
  dateInput.addEventListener('change', (e) => {
    localStorage.setItem('task-assigner-pointing-date', e.target.value);
  });
  headerContainer.appendChild(dateInput);
  header.innerHTML = '';
  header.appendChild(headerContainer);

  // Navigation
  const nav = el('nav', { style: 'margin-bottom:20px; border-bottom: 2px solid #0b5cff; padding-bottom:10px;' });
  const manageBtn = el('button', { style: 'padding:10px 20px; margin-right:10px; background:#ddd; border:none; cursor:pointer;' }, 'Manage');
  const assignBtn = el('button', { style: 'padding:10px 20px; margin-right:10px; background:#0b5cff; color:white; border:none; cursor:pointer; font-weight:bold;' }, 'Assign Tasks');
  const announcBtn = el('button', { style: 'padding:10px 20px; background:#ddd; border:none; cursor:pointer;' }, 'Announcements');
  manageBtn.addEventListener('click', () => { adminView = 'manage'; renderAdminManage(); });
  assignBtn.addEventListener('click', () => { adminView = 'assign'; renderAdminAssign(); });
  announcBtn.addEventListener('click', () => { adminView = 'announcements'; renderAdminAnnouncements(); });
  nav.appendChild(manageBtn);
  nav.appendChild(assignBtn);
  nav.appendChild(announcBtn);
  content.appendChild(nav);

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
  const sortedEmployees = sortEmployees(employees);
  sortedEmployees.forEach(emp => {
    const tr = el('tr');
    // Highlight checkbox
    const checkbox = el('input', { type: 'checkbox' });
    checkbox.checked = getHighlighted().includes(emp.id);
    checkbox.addEventListener('change', () => {
      const highlighted = getHighlighted();
      if (checkbox.checked) {
        if (!highlighted.includes(emp.id)) highlighted.push(emp.id);
      } else {
        const idx = highlighted.indexOf(emp.id);
        if (idx > -1) highlighted.splice(idx, 1);
      }
      setHighlighted(highlighted);
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
        if (taskVal && !tasks.includes(taskVal)) {
          await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskName: taskVal, token }) });
        }
        await fetch('/api/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: emp.id, timeslot: ts, task: taskVal, token }) });
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

  // Navigation
  const nav = el('nav', { style: 'margin-bottom:20px; border-bottom: 2px solid #0b5cff; padding-bottom:10px;' });
  const manageBtn = el('button', { style: 'padding:10px 20px; margin-right:10px; background:#ddd; border:none; cursor:pointer;' }, 'Manage');
  const assignBtn = el('button', { style: 'padding:10px 20px; margin-right:10px; background:#ddd; border:none; cursor:pointer;' }, 'Assign Tasks');
  const announcBtn = el('button', { style: 'padding:10px 20px; background:#0b5cff; color:white; border:none; cursor:pointer; font-weight:bold;' }, 'Announcements');
  manageBtn.addEventListener('click', () => { adminView = 'manage'; renderAdminManage(); });
  assignBtn.addEventListener('click', () => { adminView = 'assign'; renderAdminAssign(); });
  announcBtn.addEventListener('click', () => { adminView = 'announcements'; renderAdminAnnouncements(); });
  nav.appendChild(manageBtn);
  nav.appendChild(assignBtn);
  nav.appendChild(announcBtn);
  content.appendChild(nav);

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
      const response = await fetch('/api/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ announcements: announcementsData, token }) });
      const responseData = await response.json();
      console.log('API response:', response.status, responseData);
      if (response.ok) {
        // Clear draft after saving
        localStorage.removeItem('task-assigner-draft-announcements');
        alert('Announcements saved!');
        // Re-render to show updated data from server
        await renderAdminAnnouncements();
      } else {
        alert(`Failed to save announcements: ${responseData.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error saving announcements:', err);
      alert(`Error: ${err.message}`);
    }
  });

  clearBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm('Clear all announcements?')) return;
    await fetch('/api/announcements/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    // Clear draft when clearing
    localStorage.removeItem('task-assigner-draft-announcements');
    renderAdminAnnouncements();
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
};

async function initDashboard() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  const data = await fetchData();
  const { employees, assignments, timeslots, announcements } = data;

  // Update header with date and full-screen toggle
  const header = document.querySelector('header');
  const today = new Date().toISOString().split('T')[0];
  const pointingDate = localStorage.getItem('task-assigner-pointing-date') || today;
  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  header.innerHTML = '';
  const title = el('h1', {}, `Task Dashboard as of ${formatDate(pointingDate)}`);
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
        ? 'margin-bottom:8px; padding:8px; background:#fff9c4; border-radius:4px; font-weight:bold;'
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

  const table = el('table', { class: 'assign-table' });
  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'Employee'),
      ...timeslots.map(t => el('th', {}, t))
    )
  );
  table.appendChild(thead);

  const tbody = el('tbody');
  const sortedEmployees = sortEmployees(employees);
  sortedEmployees.forEach((emp, index) => {
    const tr = el('tr');
    tr.style.background = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
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
    // Apply highlighting
    const highlighted = getHighlighted();
    if (highlighted.includes(emp.id)) {
      tr.style.fontWeight = 'bold';
      tr.style.backgroundColor = 'yellow';
    }
  });
  table.appendChild(tbody);
  content.appendChild(table);

  _dashboard.built = true;
  _dashboard.tableEl = table;
}

async function updateDashboard() {
  if (!_dashboard.built) return initDashboard();
  const data = await fetchData();
  const { employees, assignments, timeslots, announcements } = data;

  // Update header date in case it changed
  const header = document.querySelector('header h1');
  const today = new Date().toISOString().split('T')[0];
  const pointingDate = localStorage.getItem('task-assigner-pointing-date') || today;
  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  header.textContent = `Task Dashboard as of ${formatDate(pointingDate)}`;

  // If timeslots changed or employees changed (simple detection), rebuild
  const timesEqual = JSON.stringify(timeslots) === JSON.stringify(_dashboard.timeslots);
  const empIds = employees.map(e => e.id).sort();
  const existingIds = Object.keys(_dashboard.rows).map(x => Number(x)).sort();
  
  // Check if announcements changed
  const currentAnnouncementsHash = JSON.stringify(announcements);
  const announcementsChanged = currentAnnouncementsHash !== _dashboard.announcementsHash;
  
  if (!timesEqual || JSON.stringify(empIds) !== JSON.stringify(existingIds) || announcementsChanged) {
    return initDashboard();
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

  // Apply highlighting to rows
  const highlighted = getHighlighted();
  Object.keys(_dashboard.rows).forEach(empId => {
    const tr = _dashboard.rows[empId].nameCell.parentElement;
    if (highlighted.includes(Number(empId))) {
      tr.style.fontWeight = 'bold';
      tr.style.backgroundColor = 'yellow';
    } else {
      tr.style.fontWeight = '';
      tr.style.backgroundColor = '';
      // Restore zebra if not highlighted
      const index = Object.keys(_dashboard.rows).indexOf(empId);
      tr.style.background = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
    }
  });
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  const id = document.body.id;
  if (id === 'admin') renderAdmin();
  else {
    initDashboard();
    // poll for updates every 5 seconds and update in-place
    setInterval(updateDashboard, 5000);
  }

  // no manual reload button on dashboard to avoid full page refresh
});
