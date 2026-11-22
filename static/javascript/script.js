const API_BASE = window.API_BASE || ""; // set to your deployed Flask URL if the frontend is hosted elsewhere
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (d) => new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const initials = (n) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

async function api(path, opt = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    method: opt.method || "GET",
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function toast(msg, error = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "show" + (error ? " error" : "");
  setTimeout(() => (t.className = ""), 2600);
}

const NAV = [["index", "/", "Dashboard"], ["students", "/students", "Students"], ["courses", "/courses", "Courses"],
  ["enrollments", "/enrollment", "Enrollments"], ["announcements", "/announcements", "Announcements"]];

function shell(page) {
  $("#topnav").innerHTML = `
    <a class="brand" href="/"><i>C</i><span>Campus<br>Connect</span></a>
    <nav class="tabs">${NAV.map(([k, h, l]) => `<a href="${h}" class="${k === page ? "active" : ""}">${l}</a>`).join("")}</nav>
    <div class="right"><span class="chip" id="status">CONNECTING</span>
      <div class="user"><div class="avatar">JS</div><span>Jerome Sacramento</span></div></div>`;
}

const PAGES = {
  students: { ep: "/students", noun: "student", cols: [["name", "Name"], ["email", "Email"], ["program", "Program"]],
    fields: [["name", "Full name"], ["email", "Email", "email"], ["program", "Program", "text"]] },
  courses: { ep: "/courses", noun: "course", cols: [["code", "Code"], ["title", "Title"], ["department", "Department"], ["enrolled", "Enrolled"], ["capacity", "Capacity"]],
    fields: [["code", "Course code"], ["title", "Title"], ["department", "Department"], ["capacity", "Capacity", "number"]] },
  enrollments: { ep: "/enrollments", noun: "enrollment", cols: [["student", "Student"], ["course", "Course"], ["created_at", "Filed", "date"], ["status", "Status", "pill"]],
    fields: [["student_id", "Student", "select", "/students"], ["course_id", "Course", "select", "/courses"]] },
  announcements: { ep: "/announcements", noun: "announcement", cols: [["title", "Title"], ["body", "Message"], ["author", "From"], ["created_at", "Posted", "date"]],
    fields: [["title", "Title"], ["body", "Message", "textarea"],
      ["author", "From", "select", ["Office of the Registrar", "Financial Aid Office", "Student Affairs"]]] },
};

async function fieldHTML([name, label, type = "text", opts]) {
  let input;
  if (type === "select") {
    const list = typeof opts === "string" ? await api(opts) : opts;
    input = `<select name="${name}" required>${list.map((o) =>
      typeof o === "string" ? `<option>${esc(o)}</option>`
        : `<option value="${o.id}">${esc(o.name || `${o.code} · ${o.title}`)}</option>`).join("")}</select>`;
  } else if (type === "textarea") input = `<textarea name="${name}" required></textarea>`;
  else input = `<input name="${name}" type="${type}" ${name === "capacity" ? 'value="35" min="1"' : "required"}>`;
  return `<label>${label}${input}</label>`;
}

const cell = (type, v) => type === "date" ? fmt(v) : type === "pill" ? `<span class="pill ${esc(v)}">${esc(v)}</span>` : esc(v);

async function renderCrud(page) {
  const cfg = PAGES[page];
  const box = $("#content");
  box.innerHTML = `<div class="skeleton"></div>`;
  const fields = (await Promise.all(cfg.fields.map(fieldHTML))).join("");
  box.innerHTML = `
    <form class="card" id="form">${fields}<button class="btn" type="submit">Add ${cfg.noun}</button></form>
    <div class="tools"><input id="q" placeholder="Search ${cfg.noun}s" aria-label="Search"></div>
    <div class="table-wrap"><table><thead><tr>${cfg.cols.map(([, l]) => `<th>${l}</th>`).join("")}<th></th></tr></thead>
    <tbody id="rows"></tbody></table></div>`;
  let data = [];
  const draw = () => {
    const q = $("#q").value.toLowerCase();
    const list = data.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    $("#rows").innerHTML = list.length
      ? list.map((r) => `<tr>${cfg.cols.map(([k, , t]) => `<td>${cell(t, r[k])}</td>`).join("")}
          <td class="act">${page === "enrollments" && r.status === "Pending" ? `<button class="btn sm dark" data-approve="${r.id}">Approve</button>` : ""}
          <button class="btn sm ghost" data-id="${r.id}">Delete</button></td></tr>`).join("")
      : `<tr><td class="empty" colspan="${cfg.cols.length + 1}">No ${cfg.noun}s yet. Add one above.</td></tr>`;
  };
  const load = async () => { data = await api(cfg.ep); draw(); };
  $("#q").oninput = draw;
  $("#rows").onclick = async (e) => {
    try {
      if (e.target.dataset.approve) {
        await api(`${cfg.ep}/${e.target.dataset.approve}`, { method: "PATCH", body: { status: "Approved" } });
        toast("Approved"); load();
      } else if (e.target.dataset.id && confirm(`Delete this ${cfg.noun}?`)) {
        await api(`${cfg.ep}/${e.target.dataset.id}`, { method: "DELETE" });
        toast("Deleted"); load();
      }
    } catch (err) { toast(err.message, true); }
  };
  $("#form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(cfg.ep, { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      toast(`${cfg.noun[0].toUpperCase() + cfg.noun.slice(1)} added`);
      e.target.reset(); load();
    } catch (err) { toast(err.message, true); }
  };
  await load();
}

async function renderDashboard() {
  const box = $("#content");
  box.innerHTML = `<div class="skeleton"></div>`;
  const [s, enr, ann] = await Promise.all([api("/stats"), api("/enrollments"), api("/announcements")]);
  const stat = (l, n) => `<div><span>${l}</span><b>${n}</b></div>`;
  box.innerHTML = `
    <section class="hero">
      <div><small>OVERVIEW</small><h1>Welcome back, Jerome</h1>
        <p>A live snapshot of students, courses, enrollments, and campus announcements, read straight from the API.</p>
        <a class="btn" href="/enrollment">New enrollment ↗</a></div>
      <div class="strip">${stat("STUDENTS", s.students)}${stat("COURSES", s.courses)}${stat("ENROLLMENTS", s.enrollments)}${stat("AVAILABLE", s.available)}</div>
    </section>
    <div class="cols">
      <section class="card">
        <div class="card-head"><div><h3>Recent enrollment activity</h3><p>${s.pending} requests awaiting approval</p></div><a href="/enrollment">View all →</a></div>
        ${enr.slice(0, 5).map((e) => `<div class="row"><div class="ini">${initials(e.student)}</div>
          <div class="who"><b>${esc(e.student)}</b><small>${esc(e.course)}</small></div>
          <span class="date">${fmt(e.created_at)}</span><span class="pill ${esc(e.status)}">${esc(e.status)}</span></div>`).join("")
          || `<div class="empty">No enrollments yet.</div>`}
      </section>
      <section class="card">
        <div class="card-head"><h3>Announcements</h3><a href="/announcements">View all →</a></div>
        ${ann.slice(0, 3).map((a) => `<div class="note"><b>${esc(a.title)}</b><p>${esc(a.body)}</p>
          <small>${esc(a.author).toUpperCase()} · ${fmt(a.created_at).toUpperCase()}</small></div>`).join("")
          || `<div class="empty">No announcements yet.</div>`}
      </section>
    </div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  shell(page);
  try {
    await api("/stats");
    $("#status").textContent = "API CONNECTED";
    $("#status").classList.add("on");
    page === "index" ? await renderDashboard() : await renderCrud(page);
  } catch (err) {
    $("#status").textContent = "API OFFLINE";
    $("#content").innerHTML = `<div class="notice">Can't reach the Flask API. Check that the server is running${API_BASE ? ` at ${esc(API_BASE)}` : ""}.</div>`;
  }
});
