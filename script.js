/* REQFLOW front end (no server version). Helpers and page logic. The storage layer is the API object further down. */
const STATUSES = ['Pending', 'Processing', 'Ready for Release', 'Completed'];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => '₱' + Number(n).toFixed(2);
const fmt = (iso) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const badge = (s) => `<span class="badge b-${s.split(' ')[0]}">${esc(s)}</span>`;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000); }
function setErr(el, msg) { el.classList.toggle('bad', !!msg); const e = el.parentElement.querySelector('.err'); if (e) e.textContent = msg || ''; }

/* REQFLOW (no server). DEMO ONLY: all data is saved in THIS browser's localStorage, so other devices cannot see it.
   SMS is only simulated. Admin login runs in the browser and is NOT secure. A real system needs a server and database. */
const TOKEN = 'reqfloww_token';
const YEARS = ['Grade 11', 'Grade 12', '1st Year', '2nd Year', '3rd Year', '4th Year'];
const DEFAULT_DOCS = [
  { id: 1, name: 'Transcript of Records', fee: 75 },
  { id: 2, name: 'Certificate of Enrollment', fee: 100 },
  { id: 3, name: 'Good Moral Certificate', fee: 100 },
  { id: 4, name: 'Honorable Dismissal', fee: 200 },
  { id: 5, name: 'Certificate of Registration', fee: 100 }
];
const ADMIN = { user: 'admin', pass: 'admin123' }; // DEMO ONLY
const TEMPLATES = { // SMS SIMULATION ONLY: nothing is ever sent to a phone
  'Ready for Release': (n, id) => `REQFLOW: Hello ${n}! Your requested document is now READY FOR RELEASE. Request ID: ${id}. Please visit the school to claim your document. Thank you!`,
  'Completed': (n, id) => `REQFLOW: Hello ${n}! Your document request has been marked as COMPLETED. Request ID: ${id}. Thank you for using REQFLOW!`
};
const DB = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('reqfloww_' + k)) ?? d; } catch (e) { return d; } },
  set(k, v) { localStorage.setItem('reqfloww_' + k, JSON.stringify(v)); }
};
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const needAdmin = () => { if (!sessionStorage.getItem(TOKEN)) throw fail('Please log in again.', 401); };
const allDocs = () => { let d = DB.get('docs2'); if (!d) { d = DEFAULT_DOCS; DB.set('docs2', d); } return d; };
const checkDoc = (name, fee) => { name = String(name || '').trim(); fee = Number(fee); if (!name || name.length > 100 || !(fee >= 0)) throw fail('Enter a document name and a valid fee.'); return { name, fee }; };

/* Same method names the server version uses, but backed by localStorage. */
const API = {
  getDocs: async () => allDocs(),
  createRequest: async (d) => {
    const doc = allDocs().find((x) => x.id == d.docId); if (!doc) throw fail('Select a valid document.');
    if (!YEARS.includes(d.yearLevel)) throw fail('Select your year level.');
    const n = DB.get('counter', 0) + 1; DB.set('counter', n); // a real database would auto-increment
    const now = new Date().toISOString();
    const r = { id: 'REQ-' + String(n).padStart(3, '0'), name: d.name, studentId: d.studentId, program: d.program, yearLevel: d.yearLevel,
      docName: doc.name, fee: doc.fee, purpose: d.purpose, contact: d.contact, status: 'Pending', submitted: now, updated: now };
    const list = DB.get('requests', []); list.push(r); DB.set('requests', list); return { id: r.id };
  },
  findRequest: async (id) => {
    const r = DB.get('requests', []).find((x) => x.id === id.trim().toUpperCase()); if (!r) return null;
    const n = DB.get('notifs', []).filter((x) => x.requestId === r.id && x.simStatus === 'Simulated').pop(); // no name or number is returned
    return { id: r.id, docName: r.docName, fee: r.fee, status: r.status, submitted: r.submitted, updated: r.updated,
      notification: n && n.type === r.status ? { type: n.type, time: n.simulated } : null };
  },
  login: async (username, password) => {
    if (username === ADMIN.user && password === ADMIN.pass) return { token: 'local' };
    throw fail('Wrong username or password.', 401);
  },
  logout: async () => ({ ok: true }),
  getRequests: async (q, status) => { needAdmin(); const k = q.toLowerCase();
    return DB.get('requests', []).filter((r) => (!status || r.status === status) && (!k || r.id.toLowerCase().includes(k) || r.studentId.toLowerCase().includes(k))).reverse(); },
  updateStatus: async (id, status) => {
    needAdmin();
    const list = DB.get('requests', []), r = list.find((x) => x.id === id); if (!r) throw fail('Request not found.', 404);
    const old = r.status, now = new Date().toISOString(); let notification = null;
    r.status = status; r.updated = now; DB.set('requests', list);
    if (status !== old && TEMPLATES[status]) { // only when the request MOVES INTO Ready for Release or Completed
      const seq = DB.get('notifSeq', 0) + 1; DB.set('notifSeq', seq);
      const rest = DB.get('notifs', []).filter((x) => !(x.requestId === r.id && x.simStatus === 'Generated')); // drop an unused older draft
      notification = { id: seq, requestId: r.id, studentName: r.name, contact: r.contact, type: status, message: TEMPLATES[status](r.name, r.id),
        generated: now, simStatus: 'Generated', simulated: null };
      rest.push(notification); DB.set('notifs', rest);
    }
    return { request: r, notification };
  },
  addDoc: async (name, fee) => { needAdmin(); const d = checkDoc(name, fee), docs = allDocs(); docs.push({ id: Date.now(), ...d }); DB.set('docs2', docs); return { ok: true }; },
  editDoc: async (id, name, fee) => { needAdmin(); const d = checkDoc(name, fee), docs = allDocs(), x = docs.find((y) => y.id == id);
    if (!x) throw fail('Document not found.', 404); Object.assign(x, d); DB.set('docs2', docs); return { ok: true }; },
  delDoc: async (id) => { needAdmin(); DB.set('docs2', allDocs().filter((x) => x.id != id)); return { ok: true }; },
  getNotifs: async () => { needAdmin(); return DB.get('notifs', []).slice().sort((a, b) => b.id - a.id); },
  simulateNotif: async (id) => { needAdmin();
    const list = DB.get('notifs', []), n = list.find((x) => x.id == id); if (!n) throw fail('Notification not found.', 404);
    if (n.simStatus !== 'Simulated') { n.simStatus = 'Simulated'; n.simulated = new Date().toISOString(); DB.set('notifs', list); }
    return n; }
};

async function initHome() {
  let docs = [];
  try { docs = await API.getDocs(); } catch (e) { toast(e.message); }
  const sel = $('doc');
  $('docList').innerHTML = docs.map((d) => `<li><span>${esc(d.name)}</span><strong>${peso(d.fee)}</strong></li>`).join('');
  sel.innerHTML = '<option value="">Select a document</option>' + docs.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  sel.addEventListener('change', () => { const d = docs.find((x) => x.id == sel.value); $('fee').textContent = d ? peso(d.fee) : '-'; });
  $('requestForm').addEventListener('submit', async (e) => {
    e.preventDefault(); let ok = true;
    const rules = { name: (v) => v.trim().length >= 3 || 'Enter your full name.', sid: (v) => /^[0-9-]{5,15}$/.test(v.trim()) || 'Use numbers and dashes, e.g. 2024-00123.',
      program: (v) => v.trim() !== '' || 'Enter your program or strand.', year: (v) => v !== '' || 'Select your year level.', doc: (v) => v !== '' || 'Select a document.',
      purpose: (v) => v.trim().length >= 5 || 'Enter the purpose of your request.', contact: (v) => /^(09|\+639)\d{9}$/.test(v.replace(/\s/g, '')) || 'Use a PH mobile number, e.g. 09171234567.' };
    for (const k in rules) { const el = $(k), r = rules[k](el.value); setErr(el, r === true ? '' : r); if (r !== true) ok = false; }
    if (!ok) { toast('Please fix the highlighted fields.'); return; }
    try {
      const r = await API.createRequest({ name: $('name').value.trim(), studentId: $('sid').value.trim(), program: $('program').value.trim(), yearLevel: $('year').value,
        docId: Number(sel.value), purpose: $('purpose').value.trim(), contact: $('contact').value.replace(/\s/g, '') });
      $('newId').textContent = r.id; e.target.classList.add('hidden'); $('success').classList.remove('hidden'); $('rid').value = r.id;
    } catch (err) { toast(err.message); }
  });
  $('againBtn').addEventListener('click', () => {
    $('requestForm').reset(); $('fee').textContent = '-'; $('success').classList.add('hidden'); $('requestForm').classList.remove('hidden'); $('name').focus();
  });
  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('newId').textContent); toast('Request ID copied.'); } catch (e) { toast('Copy failed. Select the ID and copy it manually.'); }
  });
  $('trackForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const i = $('rid'), out = $('result');
    if (!i.value.trim()) { setErr(i, 'Enter your Request ID.'); return; } setErr(i, '');
    let r; try { r = await API.findRequest(i.value); } catch (err) { toast(err.message); return; }
    out.classList.remove('hidden');
    document.querySelectorAll('#timeline>div').forEach((d) => d.classList.remove('on'));
    if (!r) { out.textContent = 'No request found with that ID. Check it and try again (example: REQ-001).'; return; }
    const at = STATUSES.indexOf(r.status);
    document.querySelectorAll('#timeline>div').forEach((d, n) => d.classList.toggle('on', n <= at));
    out.innerHTML = `<strong>${esc(r.id)}</strong> ${badge(r.status)}<br>${esc(r.docName)} · ${peso(r.fee)} (pay at the cashier)<br><span class="small">Last updated: ${fmt(r.updated)}<br>Submitted: ${fmt(r.submitted)}</span>`
      + (r.notification ? `<div class="simnote"><strong>&#128241; Notification (simulated)</strong><br>A "${esc(r.notification.type)}" SMS notification was simulated on ${fmt(r.notification.time)}. This is a demonstration only, no real SMS is sent.</div>` : '');
  });
}

async function initAdmin() {
  let docs = [];
  const render = () => { const on = !!sessionStorage.getItem(TOKEN);
    $('login').classList.toggle('hidden', on); $('dash').classList.toggle('hidden', !on); $('logout').classList.toggle('hidden', !on);
    if (on) { drawReq(); drawDocs(); drawNotifs(); } };
  $('loginForm').addEventListener('submit', async (e) => { e.preventDefault();
    try { const r = await API.login($('user').value, $('pass').value); sessionStorage.setItem(TOKEN, r.token); $('loginErr').textContent = ''; $('pass').value = ''; render(); }
    catch (err) { $('loginErr').textContent = err.message; } });
  $('logout').addEventListener('click', async () => { try { await API.logout(); } catch (e) {} sessionStorage.removeItem(TOKEN); render(); });
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    ['tabReq', 'tabDocs', 'tabSms'].forEach((t) => $(t).classList.toggle('hidden', t !== b.dataset.tab)); }));
  async function drawReq() {
    let list; try { list = await API.getRequests($('search').value.trim(), $('filter').value); } catch (e) { toast(e.message); return; }
    $('count').textContent = list.length + ' request(s)';
    $('reqBody').innerHTML = list.length ? list.map((r) => `<tr><td><strong>${esc(r.id)}</strong></td>
      <td>${esc(r.name)}<br><small>${esc(r.studentId)} · ${esc(r.program)}${r.yearLevel ? ' · ' + esc(r.yearLevel) : ''}<br>${esc(r.contact)}</small></td>
      <td>${esc(r.docName)}<br><small>${peso(r.fee)} · ${esc(r.purpose)}</small></td><td><small>${fmt(r.submitted)}</small></td><td><small>${fmt(r.updated)}</small></td>
      <td>${badge(r.status)}<br><select data-sel="${esc(r.id)}" style="margin-top:.4rem">${STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn sm" data-save="${esc(r.id)}">Update</button></td></tr>`).join('')
      : '<tr><td colspan="7">No requests match. Requests appear here after students submit the form.</td></tr>';
  }
  $('search').addEventListener('input', drawReq); $('filter').addEventListener('change', drawReq);
  $('reqBody').addEventListener('click', async (e) => { const id = e.target.dataset.save; if (!id) return;
    const s = document.querySelector(`[data-sel="${id}"]`).value;
    let res = null;
    try { res = await API.updateStatus(id, s); toast(`${id} updated to ${s}.`); } catch (err) { toast(err.message); }
    drawReq(); drawNotifs();
    if (res && res.notification) showPreview(res.notification); });
  async function drawDocs() {
    try { docs = await API.getDocs(); } catch (e) { toast(e.message); return; }
    $('docBody').innerHTML = docs.map((d) => `<tr><td>${esc(d.name)}</td><td>${peso(d.fee)}</td><td><button class="btn sm alt" data-edit="${d.id}">Edit</button> <button class="btn sm danger" data-del="${d.id}">Delete</button></td></tr>`).join(''); }
  $('docForm').addEventListener('submit', async (e) => { e.preventDefault(); const n = $('dname'), p = $('dfee'), fee = parseFloat(p.value);
    setErr(n, n.value.trim() ? '' : 'Enter a document name.'); setErr(p, fee >= 0 ? '' : 'Enter a fee of 0 or more.');
    if (!n.value.trim() || !(fee >= 0)) return;
    try { await API.addDoc(n.value.trim(), fee); e.target.reset(); toast('Document added.'); } catch (err) { toast(err.message); }
    drawDocs(); });
  $('docBody').addEventListener('click', async (e) => {
    const d = docs.find((x) => x.id == (e.target.dataset.edit || e.target.dataset.del)); if (!d) return;
    try {
      if (e.target.dataset.edit) { const name = prompt('Document name:', d.name); if (name === null) return;
        const fee = parseFloat(prompt('Fee (PHP):', d.fee)); if (!name.trim() || !(fee >= 0)) { toast('Invalid name or fee.'); return; }
        await API.editDoc(d.id, name.trim(), fee); }
      else if (confirm('Delete "' + d.name + '"? Existing requests keep their saved document name.')) await API.delDoc(d.id); else return;
      toast('Documents saved.');
    } catch (err) { toast(err.message); }
    drawDocs(); });
  /* ---------- SMS notification simulation ---------- */
  let notifs = [], current = null;
  const fmtS = (iso) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'medium' });
  const setTxt = (id, v) => { $(id).textContent = v; };
  function showPreview(n) {
    current = n;
    setTxt('pvName', n.studentName); setTxt('pvNum', n.contact); setTxt('pvId', n.requestId); setTxt('pvType', n.type);
    setTxt('pvTime', fmtS(n.generated)); setTxt('pvMsg', n.message); setTxt('pvBubbleTime', fmtS(n.generated));
    const done = n.simStatus === 'Simulated';
    setTxt('pvStatus', done ? 'Simulated on ' + fmtS(n.simulated) : 'Generated (not yet simulated)');
    $('simBtn').classList.toggle('hidden', done); $('simOk').classList.add('hidden');
    $('smsModal').classList.remove('hidden'); $('smsClose').focus();
  }
  const closePreview = () => { $('smsModal').classList.add('hidden'); current = null; };
  $('smsClose').addEventListener('click', closePreview); $('smsLater').addEventListener('click', closePreview);
  $('smsModal').addEventListener('click', (e) => { if (e.target === $('smsModal')) closePreview(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('smsModal').classList.contains('hidden')) closePreview(); });
  $('simBtn').addEventListener('click', async () => {
    if (!current) return;
    try { const n = await API.simulateNotif(current.id); showPreview(n); $('simOk').classList.remove('hidden'); toast('SMS Simulation Successful!'); drawNotifs(); }
    catch (err) { toast(err.message); }
  });
  async function drawNotifs() {
    try { notifs = await API.getNotifs(); } catch (e) { return; }
    $('smsBody').innerHTML = notifs.length ? notifs.map((n) => `<tr><td>${esc(n.studentName)}</td><td>${esc(n.contact)}</td><td><strong>${esc(n.requestId)}</strong></td>
      <td>${badge(n.type)}</td><td class="msgcell">${esc(n.message)}</td><td><small>${fmtS(n.generated)}</small></td>
      <td><span class="badge ${n.simStatus === 'Simulated' ? 'b-Ready' : 'b-Pending'}">${esc(n.simStatus)}</span></td>
      <td><button class="btn sm alt" data-prev="${n.id}">${n.simStatus === 'Simulated' ? 'View' : 'Preview'}</button></td></tr>`).join('')
      : '<tr><td colspan="8">No notifications yet. They appear when a request changes to Ready for Release or Completed.</td></tr>';
  }
  $('smsBody').addEventListener('click', (e) => { const n = notifs.find((x) => x.id == e.target.dataset.prev); if (n) showPreview(n); });
  render();
}
document.addEventListener('DOMContentLoaded', () => { const p = document.body.dataset.page; if (p === 'home') initHome(); else if (p === 'admin') initAdmin(); });