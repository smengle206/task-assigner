const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, 'data.json');

// Default data structure
const defaultData = {
  tasks: Array.from({ length: 10 }, (_, i) => `Task ${i + 1}`),
  employees: [
  { id: 1, name: 'Alice Johnson' },
  { id: 2, name: 'Ben Carter' },
  { id: 3, name: 'Carlos Ramirez' },
  { id: 4, name: 'Diana Lee' },
  { id: 5, name: 'Ethan Brooks' },
  { id: 6, name: 'Fiona Zhang' },
  { id: 7, name: 'George Patel' },
  { id: 8, name: 'Hannah Kim' },
  { id: 9, name: 'Ian Murphy' },
  { id: 10, name: 'Jasmine Lopez' },
  { id: 11, name: "Kevin O'Neal" },
  { id: 12, name: 'Lara Nguyen' },
  { id: 13, name: 'Marcus Green' },
  { id: 14, name: 'Nina Rossi' },
  { id: 15, name: 'Owen Clarke' },
  { id: 16, name: 'Priya Singh' }
  ],
  assignments: {},
  announcements: ['', '', '']
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
      // Ensure announcements field exists
      if (!data.announcements) {
        data.announcements = ['', '', ''];
        saveData();
      }
    } else {
      saveData();
    }
  } catch (err) {
    console.error('Error loading data.json, using defaults:', err.message);
    data = defaultData;
    saveData();
  }
}

function saveData() {
  try {
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

app.use(express.static(path.join(__dirname, 'public')));

// serve admin page at /admin (so /admin works without .html)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/data', (req, res) => {
  const announcements = data.announcements || ['', '', ''];
  res.json({ tasks: data.tasks, employees: data.employees, assignments: data.assignments, timeslots, announcements });
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (password === 'admin') {
    authToken = 'demo-token';
    return res.json({ ok: true, token: authToken });
  }
  return res.status(401).json({ ok: false });
});

app.post('/api/assign', (req, res) => {
  const { employeeId, timeslot, task, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  const empId = String(employeeId);
  if (!data.assignments[empId]) return res.status(400).json({ ok: false, message: 'invalid employee' });
  if (!timeslots.includes(timeslot)) return res.status(400).json({ ok: false, message: 'invalid timeslot' });
  data.assignments[empId][timeslot] = task || '';
  saveData();
  return res.json({ ok: true });
});

// Add new task to the global task list
app.post('/api/tasks', (req, res) => {
  const { taskName, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!taskName || typeof taskName !== 'string') return res.status(400).json({ ok: false, message: 'invalid task name' });
  const trimmed = taskName.trim();
  if (!data.tasks.includes(trimmed)) data.tasks.push(trimmed);
  saveData();
  return res.json({ ok: true, tasks: data.tasks });
});

// Remove task from the global task list
app.delete('/api/tasks/:taskName', (req, res) => {
  const token = req.query.token;
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  const taskName = decodeURIComponent(req.params.taskName);
  const idx = data.tasks.indexOf(taskName);
  if (idx >= 0) data.tasks.splice(idx, 1);
  saveData();
  return res.json({ ok: true, tasks: data.tasks });
});

// Add new employee
app.post('/api/employees', (req, res) => {
  const { name, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!name || typeof name !== 'string') return res.status(400).json({ ok: false, message: 'invalid name' });
  const trimmed = name.trim();
  const maxId = data.employees.length > 0 ? Math.max(...data.employees.map(e => e.id)) : 0;
  const newId = maxId + 1;
  data.employees.push({ id: newId, name: trimmed });
  data.assignments[newId] = { morning: '', first_lunch: '', second_lunch: '', afternoon: '' };
  saveData();
  return res.json({ ok: true, employee: { id: newId, name: trimmed }, employees: data.employees });
});

// Remove employee
app.delete('/api/employees/:empId', (req, res) => {
  const token = req.query.token;
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  const empId = Number(req.params.empId);
  const idx = data.employees.findIndex(e => e.id === empId);
  if (idx >= 0) {
    data.employees.splice(idx, 1);
    delete data.assignments[empId];
  }
  saveData();
  return res.json({ ok: true, employees: data.employees });
});

// Update announcements
app.post('/api/announcements', (req, res) => {
  const { announcements, token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  if (!Array.isArray(announcements) || announcements.length !== 3) return res.status(400).json({ ok: false, message: 'invalid announcements' });
  data.announcements = announcements.map(a => String(a || ''));
  saveData();
  return res.json({ ok: true, announcements: data.announcements });
});

// Clear announcements
app.post('/api/announcements/clear', (req, res) => {
  const { token } = req.body || {};
  if (token !== authToken) return res.status(401).json({ ok: false, message: 'unauthorized' });
  data.announcements = ['', '', ''];
  saveData();
  return res.json({ ok: true, announcements: data.announcements });
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
