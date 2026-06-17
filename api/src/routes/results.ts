import { Router, type Request, type Response } from "express";

const router = Router();

const BASE_URL = "https://www.educationboardresults.gov.bd";
const CAPTCHA_URL = `${BASE_URL}/v2/captcha`;
const RESULT_URL = `${BASE_URL}/v2/getres`;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: `${BASE_URL}/v2/home`,
  Origin: BASE_URL,
};

function extractCookies(response: { headers: { get(name: string): string | null } }): string {
  const raw = response.headers.get("set-cookie");
  if (!raw) return "";
  return raw.split(",").map((c: string) => c.split(";")[0].trim()).join("; ");
}

// Official site mapping: '0'|'M' → Male, '1'|'F' → Female
function mapGender(v: unknown): string {
  const raw = String(v ?? "").trim();
  if (!raw || raw === "undefined") return "";
  const first = raw.charAt(0).toUpperCase();
  if (first === "0" || first === "M") return "Male";
  if (first === "1" || first === "F") return "Female";
  if (raw === "2") return "Female";
  return raw;
}

// Parse log_display_details: comma-separated "code:marks=total=grade" or "code:grade"
function parseLogDetails(raw: string): Record<string, { grade: string; total: string; marksDetail: string }> {
  const map: Record<string, { grade: string; total: string; marksDetail: string }> = {};
  if (!raw) return map;
  for (const entry of raw.split(",")) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx === -1) continue;
    const code = entry.slice(0, colonIdx).trim();
    if (!code) continue;
    const rest = entry.slice(colonIdx + 1).trim();
    const parts = rest.split("=");
    const count = parts.length;
    const grade = parts[count - 1].trim();
    let total = "";
    let marksDetail = "";
    if (count > 2) {
      marksDetail = parts[0].trim();
      total = parts[1].trim();
    } else if (count === 2) {
      total = parts[0].trim();
    }
    map[code] = { grade, total, marksDetail };
  }
  return map;
}

// Parse display_details: "code" or "code:marks_breakdown" per comma-separated entry
function parseDisplayDetails(raw: string): Array<{ code: string; marksStr: string }> {
  if (!raw) return [];
  return raw.split(",").map((entry) => {
    const colonIdx = entry.indexOf(":");
    if (colonIdx === -1) return { code: entry.trim(), marksStr: "" };
    return { code: entry.slice(0, colonIdx).trim(), marksStr: entry.slice(colonIdx + 1).trim() };
  }).filter((e) => e.code !== "");
}

// Parse marks string: "30+20+10-5+3+2" — dash separates paper groups, plus separates theory/practical/mcq
function parseMarksBreakdown(marksStr: string): { theory: string; practical: string; mcq: string } {
  const allTheory: string[] = [];
  const allPrac: string[] = [];
  const allMcq: string[] = [];
  for (const part of marksStr.split("-")) {
    const ms = part.split("+");
    if (ms[0] && ms[0] !== "0") allTheory.push(ms[0]);
    if (ms[1] && ms[1] !== "0") allPrac.push(ms[1]);
    if (ms[2] && ms[2] !== "0") allMcq.push(ms[2]);
  }
  return {
    theory: allTheory.join("+") || "",
    practical: allPrac.join("+") || "",
    mcq: allMcq.join("+") || "",
  };
}

function gradeColor(grade: string): string {
  const g = grade.trim().toUpperCase();
  if (g === "A+" || g === "A") return "#16a34a";
  if (g === "A-" || g === "B") return "#2563eb";
  if (g === "C" || g === "D") return "#d97706";
  if (g === "F" || g.includes("FAIL")) return "#dc2626";
  return "#1e293b";
}

interface BuildOptions {
  subDetails?: Array<Record<string, string>>;
  inputRoll?: string;
  inputReg?: string;
}

function buildResultHtml(res: Record<string, unknown>, opts: BuildOptions = {}): string {
  const { subDetails, inputRoll, inputReg } = opts;
  const s = (v: unknown) => (v != null ? String(v).trim() : "");
  const present = (v: unknown) => { const sv = s(v); return sv !== "" && sv !== "undefined" && sv !== "null"; };

  // Subject name lookup from sub_details
  const subNameMap: Record<string, string> = {};
  if (Array.isArray(subDetails)) {
    for (const sub of subDetails) {
      if (sub["SUB_CODE"] && sub["SUB_NAME"]) {
        subNameMap[String(sub["SUB_CODE"]).trim()] = String(sub["SUB_NAME"]).trim();
      }
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const cellStyle = "padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:middle;font-size:0.9rem";
  const thStyle = `${cellStyle};background:#f8fafc;font-weight:600;color:#475569;white-space:nowrap;width:40%;max-width:160px`;

  const row = (label: string, value: unknown, html = false) =>
    present(value)
      ? `<tr><th style="${thStyle}">${label}</th><td style="${cellStyle}">${html ? s(value) : s(value)}</td></tr>`
      : "";

  // ── Field extraction ────────────────────────────────────────────────────────
  const rawResult = s(res["res_detail"] ?? res["result"] ?? "");
  const resultDisplay = rawResult === "P" ? "Passed" : rawResult || "—";
  const isTec = s(res["board_name"]).toUpperCase() === "TEC";

  // Registration: prefer API response, fall back to submitted value
  const regNo = s(res["regno"] ?? res["reg_no"] ?? "") || inputReg || "";
  const rollNo = s(res["roll_no"] ?? res["roll"] ?? "") || inputRoll || "";

  const gender = mapGender(res["stud_sex"] ?? res["sex"]);
  const resultColor = resultDisplay === "Passed" ? "#16a34a"
    : resultDisplay === "F" || resultDisplay.toUpperCase().includes("FAIL") ? "#dc2626"
    : "#1e293b";
  const gpaVal = s(res["gpa"]);

  // ── Info table rows (2-column, always mobile-friendly) ──────────────────────
  const infoRows = [
    row("Roll No", rollNo),
    row("Registration No", regNo),
    row("Name of Student", res["name"]),
    row("Father's Name", res["fname"]),
    row("Mother's Name", res["mname"]),
    row("Board", res["board_name"]),
    row("Session", res["session"]),
    present(res["stud_group"] ?? res["group"])
      ? `<tr><th style="${thStyle}">${isTec ? "Trade" : "Group"}</th><td style="${cellStyle}">${s(res["stud_group"] ?? res["group"])}</td></tr>`
      : "",
    present(res["stud_type"] ?? res["type"])
      ? row("Type", res["stud_type"] ?? res["type"])
      : "",
    gender ? row("Gender", gender) : "",
    row("Date of Birth", res["dob"]),
    `<tr><th style="${thStyle}">Result</th><td style="${cellStyle}"><strong style="color:${resultColor};font-size:1.05em">${resultDisplay}</strong></td></tr>`,
    gpaVal
      ? `<tr><th style="${thStyle}">GPA</th><td style="${cellStyle}"><strong style="color:#16a34a;font-size:1.1em">${gpaVal}</strong></td></tr>`
      : "",
    row("Institution", res["inst_name"] ?? res["ins_name"] ?? res["i_name"] ?? (present(res["eiin"]) ? `EIIN: ${s(res["eiin"])}` : "")),
    row("Center", res["center"]),
  ].filter(Boolean).join("");

  const infoTableHtml = infoRows
    ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:1.5rem">${infoRows}</table>`
    : "";

  // ── Subject table ───────────────────────────────────────────────────────────
  let subjectHtml = "";

  const displayDetails = s(res["display_details"]);
  const logDetails = s(res["log_display_details"]);
  const displayDetailsCa = s(res["display_details_ca"]);
  const logDetailsCa = s(res["log_display_details_ca"]);

  // Returns true when a marksStr is actually a letter grade (A+, A, A-, B, C, D, F)
  // rather than a numeric marks breakdown like "30+20+10"
  function isGradeLike(s: string): boolean {
    return /^[A-Fa-f][+\-]?$/.test(s.trim());
  }

  function buildSubjectTable(
    rawDisplay: string,
    rawLog: string,
    title: string
  ): string {
    const entries = parseDisplayDetails(rawDisplay);
    if (entries.length === 0) return "";
    const logMap = parseLogDetails(rawLog);

    const hasMks = entries.some((e) => e.marksStr !== "");
    const hasLog = Object.keys(logMap).length > 0;

    // Detect if display_details contains grade letters (e.g. "101:A+") instead of
    // numeric marks breakdowns (e.g. "101:30+20+10"). When grade-like, treat marksStr
    // as the grade directly instead of running it through parseMarksBreakdown.
    const marksAreGrades = hasMks && entries.some((e) => e.marksStr !== "" && isGradeLike(e.marksStr));

    // Determine which columns have actual numeric marks data
    const hasAnyTheory = !marksAreGrades && hasMks && entries.some((e) => {
      if (!e.marksStr) return false;
      return parseMarksBreakdown(e.marksStr).theory !== "";
    });
    const hasAnyPractical = !marksAreGrades && hasMks && entries.some((e) => {
      if (!e.marksStr) return false;
      return parseMarksBreakdown(e.marksStr).practical !== "";
    });
    const hasAnyMcq = !marksAreGrades && hasMks && entries.some((e) => {
      if (!e.marksStr) return false;
      return parseMarksBreakdown(e.marksStr).mcq !== "";
    });
    const hasAnyTotal = Object.values(logMap).some((v) => v.total !== "");
    // Show grade column if logMap has grades, OR if display_details has grade letters
    const showGradeCol = hasLog || marksAreGrades;

    const thS = "padding:9px 12px;border:1px solid #e2e8f0;background:#f1f5f9;font-weight:600;font-size:0.82rem;text-align:center;white-space:nowrap";
    const tdS = "padding:9px 12px;border:1px solid #e2e8f0;font-size:0.875rem";
    const tdC = `${tdS};text-align:center`;
    const tdG = `${tdS};text-align:center;font-weight:700`;

    // Header
    let headerCells = `<th style="${thS}">Code</th><th style="${thS};text-align:left">Subject</th>`;
    if (hasAnyTheory) headerCells += `<th style="${thS}">Theory</th>`;
    if (hasAnyPractical) headerCells += `<th style="${thS}">Practical</th>`;
    if (hasAnyMcq) headerCells += `<th style="${thS}">MCQ</th>`;
    if (hasAnyTotal) headerCells += `<th style="${thS}">Total</th>`;
    if (showGradeCol) headerCells += `<th style="${thS}">Grade</th>`;

    // Rows
    const subRows = entries.map((entry) => {
      const { code, marksStr } = entry;
      const name = subNameMap[code] ?? "";
      const log = hasLog ? (logMap[code] ?? { grade: "—", total: "", marksDetail: "" }) : null;
      const { theory, practical, mcq } = (!marksAreGrades && hasMks && marksStr)
        ? parseMarksBreakdown(marksStr)
        : { theory: "", practical: "", mcq: "" };

      let marksCells = "";
      if (hasAnyTheory) marksCells += `<td style="${tdC}">${theory || "—"}</td>`;
      if (hasAnyPractical) marksCells += `<td style="${tdC}">${practical || "—"}</td>`;
      if (hasAnyMcq) marksCells += `<td style="${tdC}">${mcq || "—"}</td>`;
      if (hasAnyTotal) marksCells += `<td style="${tdC};font-weight:600">${log?.total || "—"}</td>`;

      // Grade: prefer logMap grade, fall back to marksStr when it's a grade letter
      const grade = log?.grade ?? (marksAreGrades && marksStr ? marksStr.trim() : "—");
      const gradeCell = showGradeCol
        ? `<td style="${tdG};color:${gradeColor(grade)}">${grade}</td>`
        : "";

      return `<tr><td style="${tdC}">${code}</td><td style="${tdS}">${name}</td>${marksCells}${gradeCell}</tr>`;
    }).join("");

    return `<div style="margin-top:1rem">
      <h3 style="font-size:0.82rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 0.6rem 0">${title}</h3>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table style="width:100%;min-width:280px;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${subRows}</tbody>
        </table>
      </div>
    </div>`;
  }

  if (displayDetails) {
    subjectHtml = buildSubjectTable(displayDetails, logDetails, "Subject-wise Results");
  }
  if (displayDetailsCa) {
    subjectHtml += buildSubjectTable(displayDetailsCa, logDetailsCa, "Continuous Assessment (CA)");
  }

  const content = infoTableHtml || subjectHtml
    ? `${infoTableHtml}${subjectHtml}`
    : `<pre style="overflow:auto;font-size:0.8rem;background:#f8fafc;padding:1rem;border-radius:8px">${JSON.stringify(res, null, 2)}</pre>`;

  return `<div style="font-family:inherit">${content}</div>`;
}

// ── Routes ──────────────────────────────────────────────────────────────────

router.get("/results/captcha", async (req: Request, res: Response) => {
  try {
    const unique = Date.now();
    let captchaRes: globalThis.Response;
    try {
      captchaRes = await fetch(`${CAPTCHA_URL}?t=${unique}`, {
        headers: {
          ...BROWSER_HEADERS,
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch (fetchErr) {
      req.log.error({ err: fetchErr }, "Network error reaching CAPTCHA server");
      res.status(502).json({
        error: "Cannot reach the official results server from this deployment. Try again or use the official site.",
        detail: String(fetchErr),
      });
      return;
    }

    if (!captchaRes.ok) {
      req.log.error({ status: captchaRes.status }, "CAPTCHA endpoint returned non-ok");
      res.status(502).json({ error: `Official CAPTCHA service returned HTTP ${captchaRes.status}` });
      return;
    }

    const sessionCookie = extractCookies(captchaRes);
    const contentType = captchaRes.headers.get("content-type") || "image/jpeg";
    const buffer = await captchaRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const imageData = `data:${contentType};base64,${base64}`;

    res.json({ imageData, sessionCookie });
  } catch (err) {
    req.log.error({ err }, "Error fetching CAPTCHA");
    res.status(502).json({ error: "Unexpected error loading CAPTCHA", detail: String(err) });
  }
});

router.post("/results/check", async (req: Request, res: Response) => {
  const { exam, year, board, roll, reg, captchaValue, sessionCookie } = req.body;

  if (!exam || !year || !board || !roll || !captchaValue || !sessionCookie) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  const boardMap: Record<string, string> = { technical: "tec" };
  const officialBoard = boardMap[board] || board;

  try {
    const formData = new URLSearchParams({
      exam,
      year,
      board: officialBoard,
      result_type: "1",
      roll,
      ...(reg ? { reg } : {}),
      captcha: captchaValue,
    });

    const resultRes = await fetch(RESULT_URL, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: sessionCookie,
      },
      body: formData.toString(),
    });

    if (!resultRes.ok) {
      req.log.error({ status: resultRes.status }, "Result endpoint non-ok");
      res.status(502).json({ error: `Official site returned status ${resultRes.status}` });
      return;
    }

    const text = await resultRes.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "Unexpected response format from official site" });
      return;
    }

    req.log.info(
      { status: data["status"], topKeys: Object.keys(data), resKeys: Object.keys((data["res"] as Record<string, unknown>) ?? {}) },
      "Official site result response"
    );

    if (data["status"] !== 0) {
      const msg = String(data["msg"] ?? data["message"] ?? "Invalid data or CAPTCHA. Please try again.");
      res.status(400).json({ error: msg });
      return;
    }

    const resultObj = (data["res"] as Record<string, unknown>) ?? data;

    const subDetails =
      (Array.isArray(data["sub_details"]) ? data["sub_details"] : null) ??
      (Array.isArray(resultObj["sub_details"]) ? resultObj["sub_details"] : null) ??
      (Array.isArray(data["sub"]) ? data["sub"] : null) ??
      undefined;

    const resultHtml = buildResultHtml(resultObj, {
      subDetails: subDetails as Array<Record<string, string>> | undefined,
      inputRoll: String(roll),
      inputReg: reg ? String(reg) : undefined,
    });

    res.json({ success: true, resultHtml });
  } catch (err) {
    req.log.error({ err }, "Error checking result");
    res.status(502).json({ error: "Could not connect to official results site" });
  }
});

export default router;
