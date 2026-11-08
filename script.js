/* REQFLOW website. DEMO ONLY: data lives in this browser's localStorage and SMS is simulated.
   Each API function is where a real backend (fetch to a server + database + SMS API) plugs in. */
const STATUSES = ['Pending', 'Processing', 'Ready for Release', 'Completed'];
const DEFAULT_DOCS = [
  { id: 1, name: 'Transcript of Records', fee: 75 },
  { id: 2, name: 'Certificate of Enrollment', fee: 100 },
  { id: 3, name: 'Good Moral Certificate', fee: 100 },
  { id: 4, name: 'Honorable Dismissal', fee: 200 },
  { id: 5, name: 'Certificate of Registration', fee: 100 }
];
const ADMIN = { user: 'admin', pass: 'admin123' }; // DEMO ONLY, not secure
const DB = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('reqfloww_' + k)) ?? d; } catch (e) { return d; } },
  set(k, v) { localStorage.setItem('reqfloww_' + k, JSON.stringify(v)); }
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => '₱' + Number(n).toFixed(2);
const fmt = (iso) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const badge = (s) => `<span class="badge b-${s.split(' ')[0]}">${esc(s)}</span>`;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800); }
function setErr(el, msg) { el.classList.toggle('bad', !!msg); const e = el.parentElement.querySelector('.err'); if (e) e.textContent = msg || ''; }

const API = {
  async getDocs() { let d = DB.get('docs2'); if (!d) { d = DEFAULT_DOCS; DB.set('docs2', d); } return d; },
  async saveDocs(d) { DB.set('docs2', d); },
  async getRequests() { return DB.get('requests', []); },
  async createRequest(data) {
    const list = await this.getRequests(), n = DB.get('counter', 0) + 1; DB.set('counter', n); // real DB: auto-increment
    const now = new Date().toISOString();
    const r = { ...data, id: 'REQ-' + String(n).padStart(3, '0'), status: 'Pending', submitted: now, updated: now };
    list.push(r); DB.set('requests', list); return r;
  },
  async findRequest(id) { return (await this.getRequests()).find((r) => r.id === id.trim().toUpperCase()); },
  async updateStatus(id, status) {
    const list = await this.getRequests(), r = list.find((x) => x.id === id);
    r.status = status; r.updated = new Date().toISOString(); DB.set('requests', list);
    if (status === 'Ready for Release' || status === 'Completed') { // SMS SIMULATION ONLY
      const log = DB.get('sms', []);
      log.unshift({ to: r.contact, time: r.updated, text: `REQFLOW: Your request ${r.id} is now "${r.status}".` }); DB.set('sms', log);
    }
  }
};

async function initHome() {
  const docs = await API.getDocs(), sel = $('doc');
  $('docList').innerHTML = docs.map((d) => `<li><span>${esc(d.name)}</span><strong>${peso(d.fee)}</strong></li>`).join('');
  sel.innerHTML = '<option value="">Select a document</option>' + docs.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  sel.addEventListener('change', () => { const d = docs.find((x) => x.id == sel.value); $('fee').textContent = d ? peso(d.fee) : '-'; });
  $('requestForm').addEventListener('submit', async (e) => {
    e.preventDefault(); let ok = true;
    const rules = { name: (v) => v.trim().length >= 3 || 'Enter your full name.', sid: (v) => /^[0-9-]{5,15}$/.test(v.trim()) || 'Use numbers and dashes, e.g. 2024-00123.',
      program: (v) => v.trim() !== '' || 'Enter your program.',
      year: (v) => v !== '' || 'Select your year level.',
      doc: (v) => v !== '' || 'Select a document.',
      purpose: (v) => v.trim().length >= 5 || 'Enter the purpose of your request.', contact: (v) => /^(09|\+639)\d{9}$/.test(v.replace(/\s/g, '')) || 'Use a PH mobile number, e.g. 09171234567.' };
    for (const k in rules) { const el = $(k), r = rules[k](el.value); setErr(el, r === true ? '' : r); if (r !== true) ok = false; }
    if (!ok) { toast('Please fix the highlighted fields.'); return; }
    const d = docs.find((x) => x.id == sel.value);
    const r = await API.createRequest({ name: $('name').value.trim(), studentId: $('sid').value.trim(), program: $('program').value.trim(),
      yearLevel: $('year').value,
      contact: $('contact').value.replace(/\s/g, ''), docName: d.name, fee: d.fee, purpose: $('purpose').value.trim() });
    $('newId').textContent = r.id; $('success').classList.remove('hidden'); e.target.reset(); $('fee').textContent = '-';
    $('rid').value = r.id;
  });
  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('newId').textContent); toast('Request ID copied.'); } catch (e) { toast('Copy failed. Select the ID and copy it manually.'); }
  });
  $('trackForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const i = $('rid'), out = $('result');
    if (!i.value.trim()) { setErr(i, 'Enter your Request ID.'); return; } setErr(i, '');
    const r = await API.findRequest(i.value); out.classList.remove('hidden');
    document.querySelectorAll('#timeline>div').forEach((d) => d.classList.remove('on'));
    if (!r) { out.innerHTML = 'No request found with that ID. Check it and try again (example: REQ-001).'; return; }
    const at = STATUSES.indexOf(r.status);
    document.querySelectorAll('#timeline>div').forEach((d, n) => d.classList.toggle('on', n <= at));
    out.innerHTML = `<strong>${esc(r.id)}</strong> ${badge(r.status)}<br>${esc(r.docName)} · ${peso(r.fee)} (pay at the cashier)<br><span class="small">Last updated: ${fmt(r.updated)}<br>Submitted: ${fmt(r.submitted)}</span>`;
  });
}

async function initAdmin() {
  const render = () => { const on = sessionStorage.getItem('reqfloww_admin') === '1';
    $('login').classList.toggle('hidden', on); $('dash').classList.toggle('hidden', !on); $('logout').classList.toggle('hidden', !on);
    if (on) { drawReq(); drawDocs(); drawSms(); } };
  $('login').classList.remove('hidden');
  $('loginForm').addEventListener('submit', (e) => { e.preventDefault();
    if ($('user').value === ADMIN.user && $('pass').value === ADMIN.pass) { sessionStorage.setItem('reqfloww_admin', '1'); $('loginErr').textContent = ''; render(); }
    else $('loginErr').textContent = 'Wrong username or password.'; });
  $('logout').addEventListener('click', () => { sessionStorage.removeItem('reqfloww_admin'); render(); });
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    ['tabReq', 'tabDocs', 'tabSms'].forEach((t) => $(t).classList.toggle('hidden', t !== b.dataset.tab)); }));
  async function drawReq() {
    const q = $('search').value.trim().toLowerCase(), f = $('filter').value;
    const list = (await API.getRequests()).filter((r) => (!f || r.status === f) && (!q || r.id.toLowerCase().includes(q) || r.studentId.toLowerCase().includes(q))).reverse();
    $('count').textContent = list.length + ' request(s)';
    $('reqBody').innerHTML = list.length ? list.map((r) => `<tr><td><strong>${esc(r.id)}</strong></td>
      <td>${esc(r.name)}<br><small>${esc(r.studentId)} · ${esc(r.program)} · ${esc(r.yearLevel || '-')}<br>${esc(r.contact)}</small></td>
      <td>${esc(r.docName)}<br><small>${peso(r.fee)} · ${esc(r.purpose)}</small></td><td><small>${fmt(r.submitted)}</small></td><td><small>${fmt(r.updated)}</small></td>
      <td>${badge(r.status)}<br><select data-sel="${r.id}" style="margin-top:.4rem">${STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn sm" data-save="${r.id}">Update</button></td></tr>`).join('')
      : '<tr><td colspan="7">No requests match. Requests appear here after students submit the form.</td></tr>';
  }
  $('search').addEventListener('input', drawReq); $('filter').addEventListener('change', drawReq);
  $('reqBody').addEventListener('click', async (e) => { const id = e.target.dataset.save; if (!id) return;
    const s = document.querySelector(`[data-sel="${id}"]`).value; await API.updateStatus(id, s); toast(`${id} updated to ${s}.`); drawReq(); drawSms(); });
  async function drawDocs() { const docs = await API.getDocs();
    $('docBody').innerHTML = docs.map((d) => `<tr><td>${esc(d.name)}</td><td>${peso(d.fee)}</td><td><button class="btn sm alt" data-edit="${d.id}">Edit</button> <button class="btn sm danger" data-del="${d.id}">Delete</button></td></tr>`).join(''); }
  $('docForm').addEventListener('submit', async (e) => { e.preventDefault(); const n = $('dname'), p = $('dfee'), fee = parseFloat(p.value);
    setErr(n, n.value.trim() ? '' : 'Enter a document name.'); setErr(p, fee >= 0 ? '' : 'Enter a fee of 0 or more.');
    if (!n.value.trim() || !(fee >= 0)) return;
    const docs = await API.getDocs(); docs.push({ id: Date.now(), name: n.value.trim(), fee }); await API.saveDocs(docs); e.target.reset(); drawDocs(); toast('Document added.'); });
  $('docBody').addEventListener('click', async (e) => {
    const docs = await API.getDocs(), d = docs.find((x) => x.id == (e.target.dataset.edit || e.target.dataset.del)); if (!d) return;
    if (e.target.dataset.edit) { const name = prompt('Document name:', d.name); if (name === null) return;
      const fee = parseFloat(prompt('Fee (PHP):', d.fee)); if (!name.trim() || !(fee >= 0)) { toast('Invalid name or fee.'); return; }
      d.name = name.trim(); d.fee = fee; await API.saveDocs(docs); }
    else if (confirm('Delete "' + d.name + '"?')) await API.saveDocs(docs.filter((x) => x !== d)); else return;
    drawDocs(); toast('Documents saved.'); });
  function drawSms() { const log = DB.get('sms', []);
    $('smsBody').innerHTML = log.length ? log.map((m) => `<tr><td><small>${fmt(m.time)}</small></td><td>${esc(m.to)}</td><td>${esc(m.text)}</td></tr>`).join('')
      : '<tr><td colspan="3">No simulated messages yet. Set a request to Ready for Release or Completed.</td></tr>'; }
  render();
}
document.addEventListener('DOMContentLoaded', () => { const p = document.body.dataset.page; if (p === 'home') initHome(); else if (p === 'admin') initAdmin(); });