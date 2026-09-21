const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Default data structure
const defaultData = {
  dataVersion: 0,
  tasks: Array.from({ length: 10 }, (_, i) => `Task ${i + 1}`),
  employees: [
  { id: 1, name: 'Alice Johnson', supervisor: 'Unassigned' },
  { id: 2, name: 'Ben Carter', supervisor: 'Unassigned' },
  { id: 3, name: 'Carlos Ramirez', supervisor: 'Unassigned' },
  { id: 4, name: 'Diana Lee', supervisor: 'Unassigned' },
  { id: 5, name: 'Ethan Brooks', supervisor: 'Unassigned' },
  { id: 6, name: 'Fiona Zhang', supervisor: 'Unassigned' },
  { id: 7, name: 'George Patel', supervisor: 'Unassigned' },
  { id: 8, name: 'Hannah Kim', supervisor: 'Unassigned' },
  { id: 9, name: 'Ian Murphy', supervisor: 'Unassigned' },
  { id: 10, name: 'Jasmine Lopez', supervisor: 'Unassigned' },
  { id: 11, name: "Kevin O'Neal", supervisor: 'Unassigned' },
  { id: 12, name: 'Lara Nguyen', supervisor: 'Unassigned' },
  { id: 13, name: 'Marcus Green', supervisor: 'Unassigned' },
  { id: 14, name: 'Nina Rossi', supervisor: 'Unassigned' },
  { id: 15, name: 'Owen Clarke', supervisor: 'Unassigned' },
  { id: 16, name: 'Priya Singh', supervisor: 'Unassigned' }
  ],
  supervisors: [],
  groupBySupervisor: true,
  assignments: {},
  announcements: ['', '', ''],
  pointingDate: getTodayDateValue(),
  highlightedEmployeeIds: []
};

// Initialize default assignments
defaultData.employees.forEach(e => {
  defaultData.assignments[e.id] = {
    'Morning': '',
    '1st Lunch': '',
    '2nd Lunch': '',
    'Afternoon': ''
  };
});

// Load or initialize data
let data = defaultData;
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      data = fileData;
      let changed = false;
      if (typeof data.dataVersion !== 'number') {
        data.dataVersion = 0;
        changed = true;
      }
      if (Array.isArray(data.employees)) {
        data.employees.forEach(employee => {
          if (typeof employee.supervisor !== 'string') {
            employee.supervisor = 'Unassigned';
            changed = true;
          }
        });
      }
      if (typeof data.groupBySupervisor !== 'boolean') {
        data.groupBySupervisor = true;
        changed = true;
      }
      if (!Array.isArray(data.supervisors)) {
        data.supervisors = [...new Set(data.employees.map(employee => employee.supervisor.trim())
          .filter(name => name && name !== 'Unassigned'))];
        changed = true;
      }
      // Ensure announcements field exists
      if (!data.announcements) {
        data.announcements = ['', '', ''];
        changed = true;
      }
      if (!data.pointingDate) {
        data.pointingDate = getTodayDateValue();
        changed = true;
      }
      if (!Array.isArray(data.highlightedEmployeeIds)) {
        data.highlightedEmployeeIds = [];
        changed = true;
      }
      if (changed) saveData({ bumpVersion: false });
    } else {
      saveData({ bumpVersion: false });
    }
  } catch (err) {
    console.error('Error loading data.json, using defaults:', err.message);
    data = defaultData;
    saveData({ bumpVersion: false });
  }
}

function saveData(options = {}) {
  const { bumpVersion = true } = options;
  try {
    if (bumpVersion) data.dataVersion = (Number(data.dataVersion) || 0) + 1;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving data.json:', err.message);
  }
}

// Load data on startup
loadData();

const timeslots = ['Morning', '1st Lunch', '2nd Lunch', 'Afternoon'];
const VALID_TOKEN = 'demo-token'; // Fixed token for all authenticated requests
let authToken = null;
const eventClients = new Set();

function notifyDataChanged() {
  const message = `data: ${JSON.stringify({ updatedAt: Date.now(), dataVersion: data.dataVersion })}\n\n`;
  eventClients.forEach(client => client.write(message));
}

function checkWriteVersion(req, res) {
  const expectedVersion = Number(req.body?.expectedVersion ?? req.query?.expectedVersion);
  if (!Number.isFinite(expectedVersion)) {
    return true;
  }
  if (expectedVersion !== data.dataVersion) {
    res.status(409).json({
      ok: false,
      stale: true,
      message: 'Another supervisor saved changes first. Refresh and review the latest assignments before saving.',
      dataVersion: data.dataVersion
    });
    return false;
  }
  return true;
}

function writeOk(res, extra = {}) {
  return res.json({ ok: true, dataVersion: data.dataVersion, ...extra });
}

app.use(express.static(path.join(__dirname, 'public')));

// serve admin page at /admin (so /admin works without .html)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/data', (req, res) => {
  const announcements = data.announcements || ['', '', ''];
  const pointingDate = data.pointingDate || getTodayDateValue();
  const highlightedEmployeeIds = Array.isArray(data.highlightedEmployeeIds) ? data.highlightedEmployeeIds : [];
  res.json({ dataVersion: data.dataVersion, tasks: data.tasks, supervisors: data.supervisors, groupBySupervisor: data.groupBySupervisor, employees: data.employees, assignments: data.assignments, timeslots, announcements, pointingDate, highlightedEmployeeIds });
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');

  eventClients.add(res);
  req.on('close', () => {
    eventClients.delete(res);
  });
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (password === 'pointing') {
    authToken = 'demo-token';
    return res.json({ ok: true, token: authToken });
  }
  return res.status(401).json({ ok: false });
});

app.post('/api/assign', (req, res) => {
  const { employeeId, timeslot, task, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  const empId = String(employeeId);
  if (!data.assignments[empId]) return res.status(400).json({ ok: false, message: 'invalid employee' });
  if (!timeslots.includes(timeslot)) return res.status(400).json({ ok: false, message: 'invalid timeslot' });
  data.assignments[empId][timeslot] = task || '';
  saveData();
  notifyDataChanged();
  return writeOk(res);
});

app.post('/api/date', (req, res) => {
  const { pointingDate, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  if (typeof pointingDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(pointingDate)) {
    return res.status(400).json({ ok: false, message: 'invalid date' });
  }
  data.pointingDate = pointingDate;
  saveData();
  notifyDataChanged();
  return writeOk(res, { pointingDate: data.pointingDate });
});

app.post('/api/highlights', (req, res) => {
  const { employeeIds, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  if (!Array.isArray(employeeIds)) return res.status(400).json({ ok: false, message: 'invalid employee ids' });

  const validEmployeeIds = new Set(data.employees.map(employee => Number(employee.id)));
  data.highlightedEmployeeIds = [...new Set(employeeIds.map(Number))]
    .filter(employeeId => validEmployeeIds.has(employeeId));

  saveData();
  notifyDataChanged();
  return writeOk(res, { highlightedEmployeeIds: data.highlightedEmployeeIds });
});

// Add new task to the global task list
app.post('/api/tasks', (req, res) => {
  const { taskName, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  if (!taskName || typeof taskName !== 'string') return res.status(400).json({ ok: false, message: 'invalid task name' });
  const trimmed = taskName.trim();
  if (!data.tasks.includes(trimmed)) data.tasks.push(trimmed);
  saveData();
  notifyDataChanged();
  return writeOk(res, { tasks: data.tasks });
});

// Remove task from the global task list
app.delete('/api/tasks/:taskName', (req, res) => {
  const token = req.query.token;
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  const taskName = decodeURIComponent(req.params.taskName);
  const idx = data.tasks.indexOf(taskName);
  if (idx >= 0) data.tasks.splice(idx, 1);
  saveData();
  notifyDataChanged();
  return writeOk(res, { tasks: data.tasks });
});

// Save the configured supervisor list without changing employee assignments.
app.post('/api/supervisors', (req, res) => {
  const { supervisors, groupBySupervisor, token } = req.body || {};
  if (!token || token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  if (!Array.isArray(supervisors) || supervisors.some(name => typeof name !== 'string')) {
    return res.status(400).json({ ok: false, message: 'invalid supervisor list' });
  }
  if (groupBySupervisor !== undefined && typeof groupBySupervisor !== 'boolean') {
    return res.status(400).json({ ok: false, message: 'invalid grouping setting' });
  }
  const names = [...new Set(supervisors.map(name => name.trim()).filter(name => name && name !== 'Unassigned'))];
  const inUse = [...new Set(data.employees.map(employee => employee.supervisor)
    .filter(name => name && name !== 'Unassigned' && !names.includes(name)))];
  if (inUse.length) {
    return res.status(400).json({ ok: false, message: `Reassign employees before removing these supervisors: ${inUse.join('; ')}` });
  }
  data.supervisors = names;
  if (typeof groupBySupervisor === 'boolean') data.groupBySupervisor = groupBySupervisor;
  saveData();
  notifyDataChanged();
  return writeOk(res, { supervisors: data.supervisors, groupBySupervisor: data.groupBySupervisor });
});

// Add new employee
app.post('/api/employees', (req, res) => {
  const { name, supervisor, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  if (!name || typeof name !== 'string') return res.status(400).json({ ok: false, message: 'invalid name' });
  const trimmed = name.trim();
  const trimmedSupervisor = String(supervisor || '').trim() || 'Unassigned';
  if (trimmedSupervisor !== 'Unassigned' && !data.supervisors.includes(trimmedSupervisor)) {
    return res.status(400).json({ ok: false, message: 'Choose a supervisor from Supervisor Setup.' });
  }
  const maxId = data.employees.length > 0 ? Math.max(...data.employees.map(e => e.id)) : 0;
  const newId = maxId + 1;
  const employee = { id: newId, name: trimmed, supervisor: trimmedSupervisor };
  data.employees.push(employee);
  data.assignments[newId] = Object.fromEntries(timeslots.map(timeslot => [timeslot, '']));
  saveData();
  notifyDataChanged();
  return writeOk(res, { employee, employees: data.employees });
});

// Update employee details
app.patch('/api/employees/:empId', (req, res) => {
  const { name, supervisor, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  const empId = Number(req.params.empId);
  const employee = data.employees.find(e => e.id === empId);
  if (!employee) return res.status(404).json({ ok: false, message: 'employee not found' });

  if (typeof supervisor === 'string' && supervisor.trim() && supervisor.trim() !== 'Unassigned' && !data.supervisors.includes(supervisor.trim())) {
    return res.status(400).json({ ok: false, message: 'Choose a supervisor from Supervisor Setup.' });
  }

  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (!trimmed) return res.status(400).json({ ok: false, message: 'invalid name' });
    employee.name = trimmed;
  }
  if (typeof supervisor === 'string') {
    employee.supervisor = supervisor.trim() || 'Unassigned';
  }

  saveData();
  notifyDataChanged();
  return writeOk(res, { employee, employees: data.employees });
});

// Remove employee
app.delete('/api/employees/:empId', (req, res) => {
  const token = req.query.token;
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  const empId = Number(req.params.empId);
  const idx = data.employees.findIndex(e => e.id === empId);
  if (idx >= 0) {
    data.employees.splice(idx, 1);
    delete data.assignments[empId];
    data.highlightedEmployeeIds = (data.highlightedEmployeeIds || []).filter(id => Number(id) !== empId);
  }
  saveData();
  notifyDataChanged();
  return writeOk(res, { employees: data.employees });
});

// Update announcements
app.post('/api/announcements', (req, res) => {
  const { announcements, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  if (!Array.isArray(announcements) || announcements.length !== 3) return res.status(400).json({ ok: false, message: 'invalid announcements' });
  data.announcements = announcements.map(a => String(a || ''));
  saveData();
  notifyDataChanged();
  return writeOk(res, { announcements: data.announcements });
});

// Clear announcements
app.post('/api/announcements/clear', (req, res) => {
  const { token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!checkWriteVersion(req, res)) return;
  data.announcements = ['', '', ''];
  saveData();
  notifyDataChanged();
  return writeOk(res, { announcements: data.announcements });
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
