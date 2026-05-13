const supabaseUrl = "https://vioupfkhpdyfbuatjtxr.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpb3VwZmtocGR5ZmJ1YXRqdHhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNTU0OTcsImV4cCI6MjA5MjkzMTQ5N30.KpQ3syRkSzCyPgkbeVX6OYY8pu13QshL-iQ2F48Vevk";
const db = supabase.createClient(supabaseUrl, supabaseKey);

let allDrivers = [],
  allBranches = [],
  allQuestions = [],
  allRatings = [];

const pageMeta = {
  dashboard: ["Dashboard", "Overview of driver rating activity"],
  drivers: ["Drivers", "Manage your fleet of drivers"],
  questions: ["Questions", "Manage evaluation questions shown on the form"],
  branches: ["Branches", "Manage branch locations"],
  ratings: ["All Ratings", "Browse and filter all submitted ratings"],
  report: ["Report", "Monthly rating log with full Q&A breakdown"],
};

function showPanel(name) {
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("panel-" + name).classList.add("active");
  document
    .querySelector(`[onclick="showPanel('${name}')"]`)
    .classList.add("active");
  document.getElementById("pageTitleText").textContent = pageMeta[name][0];
  document.getElementById("pageSubText").textContent = pageMeta[name][1];
  if (name === "dashboard") loadDashboard();
  if (name === "drivers") loadDriversPanel();
  if (name === "questions") loadQuestionsPanel();
  if (name === "branches") loadBranchesPanel();
  if (name === "ratings") loadRatings();
  if (name === "report") loadReport();
}

function openModal(id) {
  document.getElementById(id).classList.add("active");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

function showStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className =
    "status-banner " + (type === "ok" ? "status-ok" : "status-err");
  el.style.display = "block";
  if (type === "ok")
    setTimeout(() => {
      el.style.display = "none";
    }, 4000);
}

function isBad(val) {
  return val === "1" || val === "2" || val === "NOT OKAY";
}

// ── SINGLE SOURCE OF TRUTH FOR ALL COUNTS ──
function updateAllBadges() {
  document.getElementById("driverBadge").textContent = allDrivers.length;
  document.getElementById("questionBadge").textContent = allQuestions.length;
  document.getElementById("branchBadge").textContent = allBranches.length;
  const rc = document.getElementById("ratingsCount");
  if (rc)
    rc.textContent =
      allRatings.length + " submission" + (allRatings.length !== 1 ? "s" : "");
  document.getElementById("statRatings").textContent = allRatings.length;
  document.getElementById("statDrivers").textContent = allDrivers.length;
  document.getElementById("statBranches").textContent = allBranches.length;
  const issues = allRatings.filter((r) =>
    Object.values(r.responses || {}).some((v) => isBad(v.answer)),
  ).length;
  document.getElementById("statIssues").textContent = issues;
}

function scoreColor(avg) {
  if (avg >= 4) return "green";
  if (avg >= 3) return "amber";
  return "red";
}

async function init() {
  const [dRes, qRes, bRes, rRes] = await Promise.all([
    db.from("drivers").select("*").order("name"),
    db.from("questions").select("*").order("sort_order"),
    db.from("branches").select("*").order("branch_name"),
    db.from("ratings").select("*").order("created_at", { ascending: false }),
  ]);
  allDrivers = dRes.data || [];
  allQuestions = qRes.data || [];
  allBranches = bRes.data || [];
  allRatings = rRes.data || [];
  updateAllBadges();
  loadDashboard();
}

// ── DASHBOARD ──
async function loadDashboard() {
  // Always re-fetch fresh counts from DB so stats are never stale
  const [dRes, bRes, rRes] = await Promise.all([
    db.from("drivers").select("*").order("name"),
    db.from("branches").select("*").order("branch_name"),
    db.from("ratings").select("*").order("created_at", { ascending: false }),
  ]);
  allDrivers = dRes.data || [];
  allBranches = bRes.data || [];
  allRatings = rRes.data || [];
  updateAllBadges();

  // Apply date filter for dashboard metrics
  const dateFrom = document.getElementById("dashDateFrom")?.value;
  const dateTo = document.getElementById("dashDateTo")?.value;
  let dashRatings = allRatings;
  if (dateFrom || dateTo) {
    dashRatings = allRatings.filter((r) => {
      const d = r.rating_date || r.created_at?.slice(0, 10);
      if (!d) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }
  // Update label
  const label = document.getElementById("dashDateLabel");
  if (label) {
    if (dateFrom || dateTo) {
      label.textContent =
        dashRatings.length + " of " + allRatings.length + " ratings shown";
    } else {
      label.textContent = "";
    }
  }
  // Update stat cards with filtered data
  const filteredIssues = dashRatings.filter((r) =>
    Object.values(r.responses || {}).some((v) => isBad(v.answer)),
  ).length;
  document.getElementById("statRatings").textContent = dashRatings.length;
  document.getElementById("statIssues").textContent = filteredIssues;

  const driverMap = {};
  allDrivers.forEach((d) => (driverMap[d.id] = d.name));
  const driverScores = {};
  dashRatings.forEach((r) => {
    const scores = Object.values(r.responses || {})
      .map((v) => parseFloat(v.answer))
      .filter((n) => !isNaN(n));
    if (!driverScores[r.driver_id])
      driverScores[r.driver_id] = { sum: 0, count: 0, trips: 0 };
    driverScores[r.driver_id].sum += scores.reduce((a, b) => a + b, 0);
    driverScores[r.driver_id].count += scores.length;
    driverScores[r.driver_id].trips++;
  });

  const perfEl = document.getElementById("driverPerfList");
  const entries = Object.entries(driverScores)
    .map(([id, s]) => ({
      name: driverMap[id] || "Unknown",
      avg: s.count ? s.sum / s.count : 0,
      trips: s.trips,
    }))
    .sort((a, b) => b.avg - a.avg);

  if (!entries.length) {
    perfEl.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--ink-ghost);font-size:13px">No data yet</div>';
  } else {
    perfEl.innerHTML =
      `<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">` +
      entries
        .map((e) => {
          const pct = Math.round((e.avg / 5) * 100);
          const col = scoreColor(e.avg);
          return `<div><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:13px;font-weight:600;color:var(--ink)">${e.name}</span><span style="font-size:11px;color:var(--ink-light)">${e.trips} trips</span></div><div class="score-bar-wrap"><div class="score-bar-bg"><div class="score-bar-fill ${col === "red" ? "bad" : col === "amber" ? "mid" : ""}" style="width:${pct}%"></div></div><span class="score-num" style="color:var(--${col === "green" ? "accent-dark" : col === "amber" ? "amber" : "red"})">${e.avg.toFixed(1)}</span></div></div>`;
        })
        .join("") +
      `</div>`;
  }

  const recentEl = document.getElementById("recentRatingsList");
  const recent = dashRatings.slice(0, 8);
  if (!recent.length) {
    recentEl.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--ink-ghost);font-size:13px">No ratings yet</div>';
    return;
  }
  recentEl.innerHTML =
    `<div style="padding:0 4px">` +
    recent
      .map((r) => {
        const hasIssue = Object.values(r.responses || {}).some((v) =>
          isBad(v.answer),
        );
        const dName = driverMap[r.driver_id] || "Unknown";
        const date = new Date(r.created_at).toLocaleDateString();
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)"><div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--ink)">${dName}</div><div style="font-size:11px;color:var(--ink-light)">${r.branch} · ${date}</div></div>${hasIssue ? '<span class="badge-pill badge-red">⚠ Issues</span>' : '<span class="badge-pill badge-green">✓ Good</span>'}</div>`;
      })
      .join("") +
    `</div>`;
}

// ── DRIVERS ──
async function loadDriversPanel() {
  const tbody = document.getElementById("driverTableBody");
  tbody.innerHTML = '<tr><td colspan="6"><div class="spinner"></div></td></tr>';
  const dRes = await db.from("drivers").select("*").order("name");
  allDrivers = dRes.data || [];
  updateAllBadges();
  const ratingCounts = {},
    ratingAvg = {};
  allRatings.forEach((r) => {
    ratingCounts[r.driver_id] = (ratingCounts[r.driver_id] || 0) + 1;
    const scores = Object.values(r.responses || {})
      .map((v) => parseFloat(v.answer))
      .filter((n) => !isNaN(n));
    if (!ratingAvg[r.driver_id]) ratingAvg[r.driver_id] = { sum: 0, cnt: 0 };
    ratingAvg[r.driver_id].sum += scores.reduce((a, b) => a + b, 0);
    ratingAvg[r.driver_id].cnt += scores.length;
  });
  if (!allDrivers.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="6">No drivers added yet</td></tr>';
    return;
  }
  tbody.innerHTML = allDrivers
    .map((d, i) => {
      const cnt = ratingCounts[d.id] || 0;
      const avg = ratingAvg[d.id]
        ? (ratingAvg[d.id].sum / ratingAvg[d.id].cnt).toFixed(1)
        : "–";
      const col = ratingAvg[d.id]
        ? scoreColor(ratingAvg[d.id].sum / ratingAvg[d.id].cnt)
        : "gray";
      const added = d.created_at
        ? new Date(d.created_at).toLocaleDateString()
        : "–";
      return `<tr><td>${i + 1}</td><td class="td-primary">${d.name}</td><td><span class="badge-pill badge-blue">${cnt}</span></td><td><span class="badge-pill badge-${col}">${avg}</span></td><td>${added}</td><td><button class="btn btn-danger btn-sm" onclick="confirmDelete('driver','${d.id}','${d.name}')"><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Delete</button></td></tr>`;
    })
    .join("");
}

async function addDriver() {
  const name = document.getElementById("driverName").value.trim();
  if (!name)
    return showStatus("driverStatus", "Driver name is required.", "err");
  const { error } = await db.from("drivers").insert([{ name }]);
  if (error)
    return showStatus("driverStatus", "Error: " + error.message, "err");
  showStatus("driverStatus", "✓ Driver added successfully!", "ok");
  document.getElementById("driverName").value = "";
  const rRes = await db
    .from("ratings")
    .select("*")
    .order("created_at", { ascending: false });
  allRatings = rRes.data || [];
  loadDriversPanel();
}

// ── QUESTIONS ──
async function loadQuestionsPanel() {
  const tbody = document.getElementById("questionTableBody");
  tbody.innerHTML = '<tr><td colspan="4"><div class="spinner"></div></td></tr>';
  const qRes = await db.from("questions").select("*").order("sort_order");
  allQuestions = qRes.data || [];
  updateAllBadges();
  if (!allQuestions.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="4">No questions added yet</td></tr>';
    return;
  }
  tbody.innerHTML = allQuestions
    .map(
      (q) =>
        `<tr><td><span class="q-order-badge">${q.sort_order || "–"}</span></td><td class="td-primary" style="max-width:380px">${q.question_text}</td><td><span class="type-tag type-${q.question_type}">${q.question_type === "binary" ? "Binary" : "Range 1–5"}</span></td><td><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" onclick="openEditQ('${q.id}')"><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>Edit</button><button class="btn btn-danger btn-sm" onclick="confirmDelete('question','${q.id}','this question')"><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Delete</button></div></td></tr>`,
    )
    .join("");
}

async function addQuestion() {
  const text = document.getElementById("qText").value.trim();
  const type = document.getElementById("qType").value;
  const order = parseInt(document.getElementById("qOrder").value) || null;
  if (!text)
    return showStatus("questionStatus", "Question text is required.", "err");
  const { error } = await db
    .from("questions")
    .insert([{ question_text: text, question_type: type, sort_order: order }]);
  if (error)
    return showStatus("questionStatus", "Error: " + error.message, "err");
  showStatus("questionStatus", "✓ Question added!", "ok");
  document.getElementById("qText").value = "";
  document.getElementById("qOrder").value = "";
  loadQuestionsPanel();
}

function openEditQ(id) {
  const q = allQuestions.find((x) => x.id == id);
  if (!q) return;
  document.getElementById("editQId").value = q.id;
  document.getElementById("editQText").value = q.question_text;
  document.getElementById("editQType").value = q.question_type;
  document.getElementById("editQOrder").value = q.sort_order || "";
  document.getElementById("editQStatus").style.display = "none";
  openModal("editQModal");
}

async function saveQuestion() {
  const id = document.getElementById("editQId").value;
  const text = document.getElementById("editQText").value.trim();
  const type = document.getElementById("editQType").value;
  const order = parseInt(document.getElementById("editQOrder").value) || null;
  if (!text)
    return showStatus("editQStatus", "Question text is required.", "err");
  const { error } = await db
    .from("questions")
    .update({
      question_text: text,
      question_type: type,
      sort_order: order,
    })
    .eq("id", id);
  if (error) return showStatus("editQStatus", "Error: " + error.message, "err");
  showStatus("editQStatus", "✓ Saved!", "ok");
  setTimeout(() => closeModal("editQModal"), 1200);
  loadQuestionsPanel();
}

// ── BRANCHES ──
async function loadBranchesPanel() {
  const tbody = document.getElementById("branchTableBody");
  tbody.innerHTML = '<tr><td colspan="4"><div class="spinner"></div></td></tr>';
  const bRes = await db.from("branches").select("*").order("branch_name");
  allBranches = bRes.data || [];
  updateAllBadges();
  const branchCounts = {};
  allRatings.forEach((r) => {
    branchCounts[r.branch] = (branchCounts[r.branch] || 0) + 1;
  });
  if (!allBranches.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="4">No branches added yet</td></tr>';
    return;
  }
  tbody.innerHTML = allBranches
    .map(
      (b, i) =>
        `<tr><td>${i + 1}</td><td class="td-primary">${b.branch_name}</td><td><span class="badge-pill badge-blue">${branchCounts[b.branch_name] || 0} ratings</span></td><td><button class="btn btn-danger btn-sm" onclick="confirmDelete('branch','${b.id}','${b.branch_name}')"><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Delete</button></td></tr>`,
    )
    .join("");
}

async function addBranch() {
  const name = document.getElementById("branchName").value.trim();
  if (!name)
    return showStatus("branchStatus", "Branch name is required.", "err");
  const { error } = await db.from("branches").insert([{ branch_name: name }]);
  if (error)
    return showStatus("branchStatus", "Error: " + error.message, "err");
  showStatus("branchStatus", "✓ Branch added!", "ok");
  document.getElementById("branchName").value = "";
  const rRes = await db
    .from("ratings")
    .select("*")
    .order("created_at", { ascending: false });
  allRatings = rRes.data || [];
  loadBranchesPanel();
}

// ── ALL RATINGS ── (FIXED)
async function loadRatings() {
  // ✅ FIX 1: Correct element ID (was "ratingsTableBody", should be "ratingTableBody")
  const tbody = document.getElementById("ratingTableBody");
  tbody.innerHTML = '<tr><td colspan="7"><div class="spinner"></div></td></tr>';

  // Populate filter dropdowns only once
  const fDriver = document.getElementById("filterDriver");
  const fBranch = document.getElementById("filterBranch");
  if (fDriver.options.length === 1) {
    allDrivers.forEach((d) => {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.name;
      fDriver.appendChild(o);
    });
  }
  if (fBranch.options.length === 1) {
    allBranches.forEach((b) => {
      const o = document.createElement("option");
      o.value = b.branch_name;
      o.textContent = b.branch_name;
      fBranch.appendChild(o);
    });
  }

  // ✅ FIX 2: Build query properly
  let query = db
    .from("ratings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const dFilter = fDriver.value;
  const bFilter = fBranch.value;
  const dateFrom = document.getElementById("filterDateFrom").value;
  const dateTo = document.getElementById("filterDateTo").value;
  if (dFilter) query = query.eq("driver_id", dFilter);
  if (bFilter) query = query.eq("branch", bFilter);
  if (dateFrom) query = query.gte("rating_date", dateFrom);
  if (dateTo) query = query.lte("rating_date", dateTo);

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="7">Failed to load: ' +
      error.message +
      "</td></tr>";
    return;
  }

  // Keep allRatings in sync (needed for dashboard stats)
  if (!fDriver.value && !fBranch.value && !dateFrom && !dateTo) {
    allRatings = data;
    updateAllBadges();
  } else {
    // When filtered, show filtered count in the sub-label only
    document.getElementById("ratingsCount").textContent =
      data.length +
      " submission" +
      (data.length !== 1 ? "s" : "") +
      " (filtered)";
  }

  const driverMap = Object.fromEntries(allDrivers.map((d) => [d.id, d.name]));

  if (!data.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="7">No ratings found</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map((r) => {
      const resp = r.responses || {};
      const issues = Object.values(resp).filter((v) => isBad(v.answer)).length;
      const dName = driverMap[r.driver_id] || "Unknown";
      const submittedAt = new Date(r.created_at).toLocaleString();
      const tripDate = r.rating_date || "–";
      // Safely serialise for inline onclick
      const rJson = JSON.stringify(r)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "&quot;");
      return `<tr>
            <td class="td-primary">${dName}</td>
            <td>${r.branch || "–"}</td>
            <td>${tripDate}</td>
            <td>${r.submitted_by || "–"}</td>
            <td>${issues > 0 ? `<span class="badge-pill badge-red">⚠ ${issues} issue${issues > 1 ? "s" : ""}</span>` : '<span class="badge-pill badge-green">✓ None</span>'}</td>
            <td style="font-size:12px;color:var(--ink-light)">${submittedAt}</td>
            <td>
              <div style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="showRatingDetail(JSON.parse(this.dataset.r), this.dataset.name)" data-r="${rJson}" data-name="${dName}">View</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--blue);border-color:#bfdbfe" onclick="openEditRating('${r.id}')" title="Edit"><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteRating('${r.id}')"><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
              </div>
            </td>
          </tr>`;
    })
    .join("");
}

function showRatingDetail(r, dName) {
  document.getElementById("ratingDetailTitle").textContent =
    `${dName} — ${r.rating_date || "–"}`;
  document.getElementById("ratingDetailSub").textContent =
    `Branch: ${r.branch} · Submitted by: ${r.submitted_by}`;
  const resp = r.responses || {};
  let html = '<div style="display:flex;flex-direction:column;gap:2px">';
  allQuestions.forEach((q) => {
    const ans = resp[q.id];
    if (!ans) return;
    const bad = isBad(ans.answer);
    html += `<div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:12px"><div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--ink-mid)">${q.question_text}</div>${ans.note ? `<div style="font-size:11px;color:var(--ink-ghost);margin-top:3px;font-style:italic">Note: ${ans.note}</div>` : ""}</div><span class="badge-pill ${bad ? "badge-red" : "badge-green"}">${ans.answer || "Skipped"}</span></div>`;
  });
  if (!Object.keys(resp).length)
    html +=
      '<div style="text-align:center;color:var(--ink-ghost);padding:24px">No responses recorded</div>';
  html += "</div>";
  document.getElementById("ratingDetailBody").innerHTML = html;
  openModal("ratingDetailModal");
}

// ── DELETE (drivers/questions/branches) ──
function confirmDelete(type, id, label) {
  document.getElementById("confirmTitle").textContent =
    `Delete ${type === "driver" ? "Driver" : type === "question" ? "Question" : "Branch"}?`;
  document.getElementById("confirmDesc").textContent =
    `"${label}" will be permanently removed. This cannot be undone.`;
  document.getElementById("confirmBtn").onclick = () => executeDelete(type, id);
  openModal("confirmModal");
}

async function executeDelete(type, id) {
  closeModal("confirmModal");
  const table =
    type === "driver"
      ? "drivers"
      : type === "question"
        ? "questions"
        : "branches";
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) {
    alert("Error: " + error.message);
    return;
  }
  if (type === "driver") {
    allDrivers = allDrivers.filter((d) => d.id != id);
    loadDriversPanel();
  }
  if (type === "question") {
    allQuestions = allQuestions.filter((q) => q.id != id);
    loadQuestionsPanel();
  }
  if (type === "branch") {
    allBranches = allBranches.filter((b) => b.id != id);
    loadBranchesPanel();
  }
  updateAllBadges();
}
let _pendingDeleteId = null;

function confirmDeleteRating(id) {
  _pendingDeleteId = id;
  const btn = document.getElementById("confirmDeleteBtn");
  btn.disabled = false;
  btn.textContent = "Delete Now";
  openModal("deleteModal");
}

async function executeDeleteRating() {
  const id = _pendingDeleteId;
  if (!id) return;
  const btn = document.getElementById("confirmDeleteBtn");
  btn.disabled = true;
  btn.textContent = "Deleting…";
  const { error } = await db.from("ratings").delete().eq("id", id);
  if (!error) {
    _pendingDeleteId = null;
    allRatings = allRatings.filter((r) => r.id !== id);
    closeModal("deleteModal");
    await loadRatings();
    loadDashboard();
  } else {
    alert("Error deleting: " + error.message);
    btn.disabled = false;
    btn.textContent = "Delete Now";
  }
}

// ── EDIT RATING ──
function openEditRating(id) {
  const r = allRatings.find((x) => x.id === id);
  if (!r) return;

  document.getElementById("editRatingId").value = id;
  document.getElementById("editRatingDate").value = r.rating_date || "";
  document.getElementById("editRatingSubmittedBy").value = r.submitted_by || "";
  document.getElementById("editRatingStatus").style.display = "none";

  // Populate driver dropdown
  const dSel = document.getElementById("editRatingDriver");
  dSel.innerHTML = allDrivers
    .map(
      (d) =>
        `<option value="${d.id}" ${d.id === r.driver_id ? "selected" : ""}>${d.name}</option>`,
    )
    .join("");

  // Populate branch dropdown
  const bSel = document.getElementById("editRatingBranch");
  bSel.innerHTML = allBranches
    .map(
      (b) =>
        `<option value="${b.branch_name}" ${b.branch_name === r.branch ? "selected" : ""}>${b.branch_name}</option>`,
    )
    .join("");

  // Render question response fields
  const resp = r.responses || {};
  const qs = allQuestions
    .slice()
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
  const qContainer = document.getElementById("editRatingQuestions");
  if (qs.length === 0) {
    qContainer.innerHTML = "";
  } else {
    qContainer.innerHTML =
      `<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">` +
      `<div style="font-size:12px;font-weight:700;color:var(--ink-mid);margin-bottom:14px;letter-spacing:0.04em;text-transform:uppercase">Question Responses</div>` +
      qs
        .map((q, i) => {
          const existing = resp[q.id] || {};
          const ansVal = existing.answer ?? "";
          const noteVal = existing.note ?? "";
          const isBinary = q.question_type === "binary";
          const answerField = isBinary
            ? `<div class="select-wrap"><select id="editQ_ans_${q.id}">
              <option value="" ${ansVal === "" ? "selected" : ""}></option>
              <option value="OK" ${ansVal === "OK" ? "selected" : ""}>OK</option>
              <option value="NOT OKAY" ${ansVal === "NOT OKAY" ? "selected" : ""}>NOT OKAY</option>
            </select></div>`
            : `<div class="select-wrap"><select id="editQ_ans_${q.id}">
              <option value="" ${ansVal === "" ? "selected" : ""}></option>
              <option value="1" ${ansVal === "1" ? "selected" : ""}>1</option>
              <option value="2" ${ansVal === "2" ? "selected" : ""}>2</option>
              <option value="3" ${ansVal === "3" ? "selected" : ""}>3</option>
              <option value="4" ${ansVal === "4" ? "selected" : ""}>4</option>
              <option value="5" ${ansVal === "5" ? "selected" : ""}>5</option>
            </select></div>`;
          return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:10px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;background:var(--surface);color:var(--ink-mid);font-size:10px;font-weight:700;margin-right:6px">${i + 1}</span>${q.question_text}
          </div>
          <div class="form-grid form-grid-2" style="gap:10px">
            <div>
              <label class="field-label" style="font-size:11px">Answer</label>
              ${answerField}
            </div>
            <div>
              <label class="field-label" style="font-size:11px">Note</label>
              <input type="text" id="editQ_note_${q.id}" value="${noteVal.replace(/"/g, "&quot;")}" placeholder="Optional note…" style="font-size:13px;padding:8px 12px" />
            </div>
          </div>
        </div>`;
        })
        .join("") +
      `</div>`;
  }

  const btn = document.getElementById("saveRatingBtn");
  btn.disabled = false;
  btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> Save Changes`;

  openModal("editRatingModal");
}

async function saveEditRating() {
  const id = document.getElementById("editRatingId").value;
  const driver_id = document.getElementById("editRatingDriver").value;
  const branch = document.getElementById("editRatingBranch").value;
  const rating_date = document.getElementById("editRatingDate").value.trim();
  const submitted_by = document
    .getElementById("editRatingSubmittedBy")
    .value.trim();

  if (!driver_id || !branch) {
    showStatus("editRatingStatus", "Driver and Branch are required.", "err");
    return;
  }

  // Collect updated responses from question fields
  const r = allRatings.find((x) => x.id === id);
  const existingResp = r ? { ...(r.responses || {}) } : {};
  const qs = allQuestions
    .slice()
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
  qs.forEach((q) => {
    const ansEl = document.getElementById(`editQ_ans_${q.id}`);
    const noteEl = document.getElementById(`editQ_note_${q.id}`);
    if (ansEl) {
      existingResp[q.id] = {
        answer: ansEl.value,
        note: noteEl ? noteEl.value : existingResp[q.id]?.note || "",
      };
    }
  });

  const btn = document.getElementById("saveRatingBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const { error } = await db
    .from("ratings")
    .update({
      driver_id,
      branch,
      rating_date: rating_date || null,
      submitted_by,
      responses: existingResp,
    })
    .eq("id", id);

  if (error) {
    showStatus("editRatingStatus", "Error: " + error.message, "err");
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> Save Changes`;
    return;
  }

  // Update local cache
  const idx = allRatings.findIndex((r) => r.id === id);
  if (idx !== -1) {
    allRatings[idx] = {
      ...allRatings[idx],
      driver_id,
      branch,
      rating_date: rating_date || null,
      submitted_by,
      responses: existingResp,
    };
  }

  showStatus("editRatingStatus", "✓ Saved!", "ok");
  setTimeout(() => {
    closeModal("editRatingModal");
    loadRatings();
    loadDashboard();
  }, 900);
}

// ── REPORT ──
let reportData = [];

async function loadReport() {
  const tbody = document.getElementById("reportTableBody");
  const totalCols = 5 + allQuestions.length * 2;
  tbody.innerHTML = `<tr><td colspan="${totalCols}"><div class="spinner"></div></td></tr>`;
  const qs = allQuestions
    .slice()
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
  const headRow = document.getElementById("reportTableHead");
  while (headRow.children.length > 5) headRow.removeChild(headRow.lastChild);
  qs.forEach((q, i) => {
    const thQ = document.createElement("th");
    thQ.textContent = `Q${i + 1}`;
    thQ.title = q.question_text || "";
    headRow.appendChild(thQ);
    const thN = document.createElement("th");
    thN.textContent = `Noted Q${i + 1}`;
    headRow.appendChild(thN);
  });
  const { data, error } = await db
    .from("ratings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${totalCols}">Failed to load data</td></tr>`;
    return;
  }
  const monthSel = document.getElementById("reportMonthFilter");
  const currentVal = monthSel.value;
  const months = [
    ...new Set(
      (data || []).map((r) => {
        const d = new Date(r.created_at);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }),
    ),
  ]
    .sort()
    .reverse();
  monthSel.innerHTML = '<option value="">All Months</option>';
  months.forEach((m) => {
    const [yr, mo] = m.split("-");
    const label = new Date(yr, mo - 1).toLocaleString("default", {
      month: "long",
      year: "numeric",
    });
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = label;
    if (m === currentVal) opt.selected = true;
    monthSel.appendChild(opt);
  });
  const selMonth = monthSel.value;
  const reportDateFrom = document.getElementById("reportDateFrom").value;
  const reportDateTo = document.getElementById("reportDateTo").value;
  const filtered = (data || []).filter((r) => {
    // Month filter (based on created_at)
    if (selMonth) {
      const d = new Date(r.created_at);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (ym !== selMonth) return false;
    }
    // Date range filter (based on rating_date)
    if (reportDateFrom || reportDateTo) {
      const rd = r.rating_date || "";
      if (reportDateFrom && rd < reportDateFrom) return false;
      if (reportDateTo && rd > reportDateTo) return false;
    }
    return true;
  });
  const driverMap = Object.fromEntries(allDrivers.map((d) => [d.id, d.name]));
  reportData = filtered.map((r) => {
    const resp = r.responses || {};
    const row = {
      timestamp: new Date(r.created_at).toLocaleString(),
      username: r.submitted_by || "–",
      driver: driverMap[r.driver_id] || "Unknown",
      branch: r.branch || "–",
      date: r.rating_date || "–",
    };
    qs.forEach((q, i) => {
      const ans = resp[q.id] || {};
      row[`q${i + 1}`] = ans.answer ?? "–";
      row[`note${i + 1}`] = ans.note || "";
    });
    row._qCount = qs.length;
    return row;
  });
  renderReportTable(reportData);
}

function renderReportTable(rows) {
  const tbody = document.getElementById("reportTableBody");
  const qCount = allQuestions.length;
  const totalCols = 5 + qCount * 2;
  document.getElementById("reportCount").textContent =
    `${rows.length} submission${rows.length !== 1 ? "s" : ""}`;
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${totalCols}">No records found</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((r) => {
      let qCells = "";
      for (let i = 1; i <= qCount; i++) {
        const ans = r[`q${i}`] ?? "–";
        const note = r[`note${i}`] || "";
        const bad = isBad(ans);
        qCells += `<td><span class="badge-pill ${bad ? "badge-red" : ans === "–" ? "badge-gray" : "badge-green"}" style="white-space:nowrap">${ans}</span></td>`;
        qCells += `<td style="font-size:11px;color:var(--ink-light);max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${note}">${note || "–"}</td>`;
      }
      return `<tr><td style="white-space:nowrap;font-size:12px;color:var(--ink-light)">${r.timestamp}</td><td class="td-primary" style="white-space:nowrap">${r.username}</td><td style="white-space:nowrap;font-weight:600">${r.driver}</td><td style="white-space:nowrap">${r.branch}</td><td style="white-space:nowrap">${r.date}</td>${qCells}</tr>`;
    })
    .join("");
}

function filterReportTable() {
  const q = document.getElementById("reportSearch").value.toLowerCase().trim();
  if (!q) {
    renderReportTable(reportData);
    return;
  }
  renderReportTable(
    reportData.filter(
      (r) =>
        r.username.toLowerCase().includes(q) ||
        r.driver.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q) ||
        r.date.toLowerCase().includes(q),
    ),
  );
}

function exportReportCSV() {
  if (!reportData.length) {
    alert("No data to export.");
    return;
  }
  const qs = allQuestions
    .slice()
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
  const qCount = qs.length;
  const headers = ["Timestamp", "Username", "Driver", "Branch", "Date"];
  for (let i = 1; i <= qCount; i++) {
    headers.push(`Q${i}`, `Noted Q${i}`);
  }
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = reportData.map((r) => {
    const vals = [r.timestamp, r.username, r.driver, r.branch, r.date];
    for (let i = 1; i <= qCount; i++) {
      vals.push(r[`q${i}`] ?? "–", r[`note${i}`] ?? "");
    }
    return vals.map(esc).join(",");
  });
  const csv = [headers.map(esc).join(","), ...rows].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rating-log-${document.getElementById("reportMonthFilter").value || "all"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll(".modal-overlay").forEach((el) => {
  el.addEventListener("click", (e) => {
    if (e.target === el) el.classList.remove("active");
  });
});

init();
