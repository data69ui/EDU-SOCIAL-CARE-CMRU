import type {
  GoogleWorkspaceConfig,
  StudentFullRecord,
} from '../types/scholarship';
import {
  ACADEMIC_YEARS,
  YEAR_LEVELS,
  buildPublicOverviewStats,
  calculateApprovedVolunteerHours,
  formatReceivedScholarshipsText,
  getApplicationStatusMeta,
} from '../utils/scholarshipLogic';
import { sanitizeAppsScriptWebAppUrl } from '../utils/securityGuard';

export const APPS_SCRIPT_TAB_NAMES = {
  STUDENTS: 'นักศึกษาและข้อมูลพื้นฐาน',
  APPLICATIONS: 'คำร้องขอทุนการศึกษา',
  GRADES: 'ผลการเรียน_GPA',
  VOLUNTEERS: 'กิจกรรมจิตอาสา',
  IMPORT_TEMPLATE: 'ข้อมูลนำเข้า_Students',
} as const;

export interface AppsScriptStudentItem {
  studentId: string;
  fullName: string;
  academicYear: string;
  yearLevel: string;
  gpax: string;
  hasStudentLoan: string;
  receivedScholarships: string;
  pdpaStatus: string;
  applicationStatus: string;
  advisorComment: string;
  approvedVolunteerHours: number;
  profilePhotoUrl: string;
}

export interface AppsScriptGradeItem {
  studentId: string;
  studentName: string;
  academicYear: string;
  yearLevel: string;
  semester: string;
  gpa: string;
  recordedBy: string;
  attachmentUrl: string;
  updatedAt: string;
}

export interface AppsScriptVolunteerItem {
  studentId: string;
  studentName: string;
  academicYear: string;
  activityTitle: string;
  activityDate: string;
  hours: number;
  approvedHours: number;
  approvalStatus: string;
  photoUrl: string;
}

export interface AppsScriptDashboardPayload {
  ok: boolean;
  meta: {
    title: string;
    spreadsheetTitle: string;
    spreadsheetUrl: string;
    generatedAt: string;
    academicYears: string[];
    yearLevels: string[];
  };
  summary: {
    totalStudents: number;
    filteredStudents: number;
    approvedCount: number;
    pendingCount: number;
    draftOrRevisionCount: number;
    loanCount: number;
    pdpaConsentedCount: number;
    averageGpax: string;
    totalGradeRecords: number;
    approvedVolunteerHours: number;
    pendingVolunteerHours: number;
  };
  byYearLevel: {
    yearLevel: string;
    total: number;
    approved: number;
    pending: number;
    draft: number;
    loanCount: number;
  }[];
  scholarshipSummary: {
    name: string;
    count: number;
  }[];
  students: AppsScriptStudentItem[];
  grades: AppsScriptGradeItem[];
  volunteers: AppsScriptVolunteerItem[];
}

function escapeSingleQuotedJs(value: string | undefined, fallback: string): string {
  const clean = (value || '').trim() || fallback;
  return clean.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function buildAppsScriptCodeGs(options?: {
  spreadsheetId?: string;
  driveFolderId?: string;
}): string {
  const sheetId = escapeSingleQuotedJs(options?.spreadsheetId, 'PUT_YOUR_GOOGLE_SHEET_ID_HERE');
  const folderId = escapeSingleQuotedJs(
    options?.driveFolderId,
    'PUT_YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE'
  );

  return `/**
 * EDU SOCIAL CARE CMRU — Google Apps Script Web App
 * สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่
 *
 * วิธีติดตั้ง:
 * 1. เปิด Google Sheet -> ส่วนขยาย (Extensions) -> Apps Script
 * 2. วางโค้ดนี้ลงในไฟล์ Code.gs
 * 3. สร้างไฟล์ HTML ชื่อ "Index" (คลิก + -> HTML) แล้ววางโค้ด Index.html
 * 4. กด "ทำให้ใช้งานได้ (Deploy)" -> "การทำให้ใช้งานได้รายการใหม่" -> เลือกประเภท "เว็บแอป (Web app)"
 *    - ดำเนินการในชื่อ: ฉัน (Me)
 *    - ผู้มีสิทธิ์เข้าถึง: ทุกคน (Anyone)
 * 5. คัดลอก URL (/exec) มาวางในหน้า Google Sheets & Script ของระบบ EDU SOCIAL CARE CMRU
 */
const SPREADSHEET_ID = '${sheetId}';
const DRIVE_FOLDER_ID = '${folderId}';

const TAB_STUDENTS = '${APPS_SCRIPT_TAB_NAMES.STUDENTS}';
const TAB_APPLICATIONS = '${APPS_SCRIPT_TAB_NAMES.APPLICATIONS}';
const TAB_GRADES = '${APPS_SCRIPT_TAB_NAMES.GRADES}';
const TAB_VOLUNTEERS = '${APPS_SCRIPT_TAB_NAMES.VOLUNTEERS}';

function getSpreadsheet_() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.indexOf('PUT_YOUR_') !== 0) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('กรุณาระบุ SPREADSHEET_ID หรือเปิด Apps Script จาก Google Sheet ที่ต้องการใช้งาน');
  }
  return active;
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const format = String(params.format || '').toLowerCase();

  if (format === 'json') {
    try {
      const payload = getDashboardData(params);
      return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
        ContentService.MimeType.JSON
      );
    } catch (err) {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: String(err) })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('EDU SOCIAL CARE CMRU — แสดงผลผ่าน Google Script')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function readTabRecords_(ss, tabName) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) {
    return String(h || '').trim();
  });
  const rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var hasValue = false;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      if (!key) continue;
      var cell = row[j];
      var text = cell instanceof Date ? cell.toISOString() : String(cell == null ? '' : cell).trim();
      if (text) hasValue = true;
      obj[key] = text;
    }
    if (hasValue) rows.push(obj);
  }
  return rows;
}

function getDashboardData(filters) {
  const f = filters || {};
  const filterYear = String(f.academicYear || 'all').trim() || 'all';
  const filterLevel = String(f.yearLevel || 'all').trim() || 'all';
  const filterStatus = String(f.status || 'all').trim() || 'all';
  const search = String(f.search || '').trim().toLowerCase();

  const ss = getSpreadsheet_();
  const studentRows = readTabRecords_(ss, TAB_STUDENTS);
  const appRows = readTabRecords_(ss, TAB_APPLICATIONS);
  const gradeRows = readTabRecords_(ss, TAB_GRADES);
  const volRows = readTabRecords_(ss, TAB_VOLUNTEERS);

  const appByStudentId = {};
  appRows.forEach(function (r) {
    var sid = r['รหัสนักศึกษา'] || '';
    if (sid) appByStudentId[sid] = r;
  });

  const volApprovedBySid = {};
  var totalApprovedHours = 0;
  var totalPendingHours = 0;
  const volunteers = [];

  volRows.forEach(function (v) {
    var sid = v['รหัสนักศึกษา'] || '';
    var status = v['สถานะรับรอง'] || 'pending';
    var reqHours = Number(v['ชั่วโมงที่ยื่น'] || 0) || 0;
    var appHours = Number(v['ชั่วโมงที่อนุมัติ'] || 0) || 0;
    if (status === 'approved') {
      totalApprovedHours += appHours;
      volApprovedBySid[sid] = (volApprovedBySid[sid] || 0) + appHours;
    } else if (status === 'pending') {
      totalPendingHours += reqHours;
    }
    volunteers.push({
      studentId: sid,
      studentName: v['ชื่อ-นามสกุล'] || '-',
      academicYear: v['ปีการศึกษา'] || '-',
      activityTitle: v['ชื่อกิจกรรม'] || '-',
      activityDate: v['วันที่จัดกิจกรรม'] || '-',
      hours: reqHours,
      approvedHours: appHours,
      approvalStatus: status,
      photoUrl: String(v['ภาพกิจกรรม (Google Drive)'] || '').split('|')[0].trim(),
    });
  });

  const mergedStudents = studentRows.map(function (s) {
    var sid = s['รหัสนักศึกษา'] || '-';
    var app = appByStudentId[sid] || null;
    var academicYear = (app && app['ปีการศึกษา']) || s['ปีการศึกษา'] || '-';
    var yearLevel = (app && app['ชั้นปี']) || s['ชั้นปี'] || '-';
    var gpax = (app && app['GPAX']) || s['GPAX'] || '';
    var appStatus = (app && app['สถานะคำร้อง']) || 'ยังไม่ยื่นคำร้อง';
    return {
      studentId: sid,
      fullName: s['ชื่อ-นามสกุล'] || '-',
      academicYear: academicYear,
      yearLevel: yearLevel,
      gpax: gpax,
      hasStudentLoan: s['กยศ.'] || 'ไม่กู้',
      receivedScholarships: s['ทุนการศึกษาที่ได้รับ'] || 'ไม่ได้รับทุน',
      pdpaStatus: s['สถานะ PDPA'] || 'ยังไม่ยินยอม',
      applicationStatus: appStatus,
      advisorComment: (app && app['ความเห็นอาจารย์']) || '',
      approvedVolunteerHours: volApprovedBySid[sid] || 0,
      profilePhotoUrl: s['ลิงก์รูปโปรไฟล์ (Google Drive)'] || '',
    };
  });

  const yearsMap = {};
  const levelsOrder = ['ปี 1', 'ปี 2', 'ปี 3', 'ปี 4'];
  mergedStudents.forEach(function (st) {
    if (st.academicYear && st.academicYear !== '-') yearsMap[st.academicYear] = true;
  });

  const filteredStudents = mergedStudents.filter(function (st) {
    if (filterYear !== 'all' && st.academicYear !== filterYear) return false;
    if (filterLevel !== 'all' && st.yearLevel !== filterLevel) return false;
    if (filterStatus !== 'all' && st.applicationStatus !== filterStatus) return false;
    if (search) {
      var hay = (st.studentId + ' ' + st.fullName + ' ' + st.receivedScholarships).toLowerCase();
      if (hay.indexOf(search) === -1) return false;
    }
    return true;
  });

  var approvedCount = 0;
  var pendingCount = 0;
  var draftOrRevisionCount = 0;
  var loanCount = 0;
  var pdpaConsentedCount = 0;
  var gpaxSum = 0;
  var gpaxCount = 0;
  const levelBuckets = {};
  levelsOrder.forEach(function (lvl) {
    levelBuckets[lvl] = { yearLevel: lvl, total: 0, approved: 0, pending: 0, draft: 0, loanCount: 0 };
  });
  const scholarshipCounts = {};

  filteredStudents.forEach(function (st) {
    var status = st.applicationStatus;
    var isApproved = status.indexOf('อนุมัติ') !== -1 && status.indexOf('ไม่') === -1;
    var isPending = status.indexOf('รอ') !== -1 || status.indexOf('กำลังตรวจสอบ') !== -1 || status.indexOf('ยื่นคำร้อง') !== -1;

    if (isApproved) approvedCount++;
    else if (isPending) pendingCount++;
    else draftOrRevisionCount++;

    if (st.hasStudentLoan === 'กู้') loanCount++;
    if (st.pdpaStatus.indexOf('ยินยอมแล้ว') !== -1) pdpaConsentedCount++;

    var g = parseFloat(st.gpax);
    if (!isNaN(g) && g > 0 && g <= 4) {
      gpaxSum += g;
      gpaxCount++;
    }

    var bucket = levelBuckets[st.yearLevel];
    if (bucket) {
      bucket.total++;
      if (isApproved) bucket.approved++;
      else if (isPending) bucket.pending++;
      else bucket.draft++;
      if (st.hasStudentLoan === 'กู้') bucket.loanCount++;
    }

    if (st.receivedScholarships && st.receivedScholarships !== 'ไม่ได้รับทุน') {
      st.receivedScholarships.split(/[,/\\n]+/).forEach(function (part) {
        var name = part.trim();
        if (name && name !== 'ไม่ได้รับทุน') {
          scholarshipCounts[name] = (scholarshipCounts[name] || 0) + 1;
        }
      });
    }
  });

  const grades = gradeRows.map(function (g) {
    return {
      studentId: g['รหัสนักศึกษา'] || '-',
      studentName: g['ชื่อ-นามสกุล'] || '-',
      academicYear: g['ปีการศึกษา'] || '-',
      yearLevel: g['ชั้นปี'] || '-',
      semester: g['ภาคเรียน'] || '-',
      gpa: g['GPA'] || '-',
      recordedBy: g['ผู้บันทึก'] || '-',
      attachmentUrl: String(g['หลักฐานใน Google Drive'] || '').split('|')[0].trim(),
      updatedAt: g['อัปเดตล่าสุด'] || '',
    };
  });

  const scholarshipSummary = Object.keys(scholarshipCounts)
    .map(function (name) {
      return { name: name, count: scholarshipCounts[name] };
    })
    .sort(function (a, b) {
      return b.count - a.count;
    });

  return {
    ok: true,
    meta: {
      title: 'EDU SOCIAL CARE CMRU',
      spreadsheetTitle: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      generatedAt: new Date().toISOString(),
      academicYears: Object.keys(yearsMap).sort(),
      yearLevels: levelsOrder,
    },
    summary: {
      totalStudents: mergedStudents.length,
      filteredStudents: filteredStudents.length,
      approvedCount: approvedCount,
      pendingCount: pendingCount,
      draftOrRevisionCount: draftOrRevisionCount,
      loanCount: loanCount,
      pdpaConsentedCount: pdpaConsentedCount,
      averageGpax: gpaxCount > 0 ? (gpaxSum / gpaxCount).toFixed(2) : '0.00',
      totalGradeRecords: grades.length,
      approvedVolunteerHours: totalApprovedHours,
      pendingVolunteerHours: totalPendingHours,
    },
    byYearLevel: levelsOrder.map(function (lvl) {
      return levelBuckets[lvl];
    }),
    scholarshipSummary: scholarshipSummary,
    students: filteredStudents,
    grades: grades,
    volunteers: volunteers,
  };
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(payload.sheetName || 'Applications') || ss.insertSheet('Applications');

    if (payload.action === 'upsertRow') {
      const headers = ['StudentID', 'FullName', 'AcademicYear', 'YearLevel', 'GPAX', 'Status', 'VolunteerHours', 'UpdatedAt'];
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(headers);
      }
      sheet.appendRow([
        payload.studentId,
        payload.fullName,
        payload.academicYear,
        payload.yearLevel,
        payload.gpax,
        payload.status,
        payload.volunteerHours || 0,
        new Date().toISOString(),
      ]);
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
        ContentService.MimeType.JSON
      );
    }

    if (payload.action === 'uploadDriveFile') {
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const bytes = Utilities.base64Decode(payload.base64Data);
      const blob = Utilities.newBlob(bytes, payload.mimeType, payload.fileName);
      const file = folder.createFile(blob);
      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, fileUrl: file.getUrl() })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'Unknown action' })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}`;
}

export function buildAppsScriptIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EDU SOCIAL CARE CMRU — แสดงผลผ่าน Google Script</title>
  <style>
    :root {
      --bg: #F6F4F1;
      --card: #FFFFFF;
      --card-muted: #FAF6EE;
      --border: #E5DDD0;
      --text: #23181A;
      --muted: #66585B;
      --maroon: #7A1629;
      --maroon-dark: #5E1020;
      --gold: #C6922C;
      --green: #15803D;
      --green-bg: #ECFDF5;
      --amber: #B45309;
      --amber-bg: #FFFBEB;
      --blue: #1D4ED8;
      --blue-bg: #EFF6FF;
    }
    html.dark {
      --bg: #15171C;
      --card: #20232B;
      --card-muted: #191B22;
      --border: #323744;
      --text: #F2EFEA;
      --muted: #A19B91;
      --maroon: #D95F76;
      --maroon-dark: #9B2339;
      --gold: #F4D98A;
      --green: #4ADE80;
      --green-bg: #143322;
      --amber: #FBBF24;
      --amber-bg: #332713;
      --blue: #60A5FA;
      --blue-bg: #192844;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Sarabun', 'Noto Sans Thai', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    .topbar {
      background: linear-gradient(135deg, #5E1020 0%, #7A1629 60%, #4A101B 100%);
      color: #FFFFFF;
      padding: 18px 24px;
      border-bottom: 3px solid #C6922C;
    }
    .topbar-inner {
      max-width: 1240px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .brand h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.2px; }
    .brand p { margin: 2px 0 0; font-size: 12px; color: #F7E8C3; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .btn {
      border: 1px solid rgba(255,255,255,0.28);
      background: rgba(255,255,255,0.12);
      color: #FFFFFF;
      padding: 7px 12px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { background: rgba(255,255,255,0.22); }
    .btn-gold { background: #C6922C; border-color: #C6922C; color: #1E1315; }
    .container { max-width: 1240px; margin: 0 auto; padding: 20px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .input, .select {
      width: 100%;
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      font-size: 13px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .kpi-label { font-size: 12px; color: var(--muted); font-weight: 600; }
    .kpi-value { font-size: 26px; font-weight: 700; margin: 6px 0 2px; font-variant-numeric: tabular-nums; }
    .kpi-sub { font-size: 12px; color: var(--muted); }
    .two-col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-bottom: 18px;
    }
    .section-title { font-size: 15px; font-weight: 700; margin: 0 0 12px; color: var(--maroon); }
    .bar-row { margin-bottom: 10px; }
    .bar-head { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
    .bar-track { height: 10px; border-radius: 999px; background: var(--card-muted); overflow: hidden; display: flex; }
    .bar-approved { background: #16A34A; height: 100%; }
    .bar-pending { background: #D97706; height: 100%; }
    .bar-draft { background: #94A3B8; height: 100%; }
    .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .tab-btn {
      padding: 8px 14px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--card-muted);
      color: var(--text);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .tab-btn.active {
      background: #7A1629;
      border-color: #7A1629;
      color: #FFFFFF;
    }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      background: var(--card-muted);
      font-weight: 700;
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
    }
    .badge {
      display: inline-block;
      padding: 2px 9px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .badge-green { background: var(--green-bg); color: var(--green); }
    .badge-amber { background: var(--amber-bg); color: var(--amber); }
    .badge-blue { background: var(--blue-bg); color: var(--blue); }
    .badge-muted { background: var(--card-muted); color: var(--muted); }
    .link { color: var(--blue); text-decoration: none; font-weight: 600; }
    .link:hover { text-decoration: underline; }
    .empty { text-align: center; padding: 32px; color: var(--muted); font-size: 13px; }
    @media print {
      .no-print { display: none !important; }
      body { background: #FFFFFF; color: #000000; }
      .card { box-shadow: none; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <h1>EDU SOCIAL CARE CMRU — Google Apps Script</h1>
        <p id="sheet-meta">สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่</p>
      </div>
      <div class="actions no-print">
        <a id="sheet-link" class="btn" href="#" target="_blank" rel="noreferrer" style="display:none">เปิด Google Sheet</a>
        <button type="button" class="btn" onclick="loadData()">รีเฟรชข้อมูล</button>
        <button type="button" class="btn" onclick="toggleTheme()">สลับธีม</button>
        <button type="button" class="btn btn-gold" onclick="window.print()">พิมพ์รายงาน</button>
      </div>
    </div>
  </header>

  <main class="container">
    <section class="card filters no-print">
      <div>
        <input id="search-input" class="input" type="search" placeholder="ค้นหารหัสนักศึกษา / ชื่อ / ทุน..." oninput="renderFiltered()" />
      </div>
      <div>
        <select id="year-select" class="select" onchange="loadData()">
          <option value="all">ทุกปีการศึกษา</option>
        </select>
      </div>
      <div>
        <select id="level-select" class="select" onchange="loadData()">
          <option value="all">ทุกชั้นปี</option>
          <option value="ปี 1">ปี 1</option>
          <option value="ปี 2">ปี 2</option>
          <option value="ปี 3">ปี 3</option>
          <option value="ปี 4">ปี 4</option>
        </select>
      </div>
      <div>
        <select id="status-select" class="select" onchange="renderFiltered()">
          <option value="all">ทุกสถานะคำร้อง</option>
          <option value="อนุมัติทุนแล้ว">อนุมัติทุนแล้ว</option>
          <option value="รอพิจารณา">รอพิจารณา</option>
          <option value="ฉบับร่าง">ฉบับร่าง / ยังไม่ยื่น</option>
        </select>
      </div>
    </section>

    <div id="status-banner" class="card" style="display:none; margin-bottom:16px;"></div>

    <section class="kpi-grid" id="kpi-grid"></section>

    <section class="two-col">
      <div class="card">
        <h2 class="section-title">สัดส่วนนักศึกษาแยกตามชั้นปี</h2>
        <div id="level-bars"></div>
      </div>
      <div class="card">
        <h2 class="section-title">สรุปประเภททุนการศึกษาที่ได้รับ</h2>
        <div id="scholarship-list"></div>
      </div>
    </section>

    <section class="card">
      <div class="tabs no-print">
        <button type="button" class="tab-btn active" data-tab="students" onclick="switchTab('students')">รายชื่อนักศึกษา</button>
        <button type="button" class="tab-btn" data-tab="grades" onclick="switchTab('grades')">ผลการเรียน (GPA)</button>
        <button type="button" class="tab-btn" data-tab="volunteers" onclick="switchTab('volunteers')">กิจกรรมจิตอาสา</button>
      </div>
      <div id="table-container" class="table-wrap"></div>
    </section>
  </main>

  <script>
    var CURRENT_DATA = null;
    var ACTIVE_TAB = 'students';

    function esc(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function safeUrl(u) {
      var s = String(u || '').trim();
      return /^https?:\\/\\//i.test(s) ? s : '';
    }

    function toggleTheme() {
      document.documentElement.classList.toggle('dark');
    }

    function switchTab(tab) {
      ACTIVE_TAB = tab;
      document.querySelectorAll('.tab-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
      });
      renderFiltered();
    }

    function showBanner(msg, isError) {
      var el = document.getElementById('status-banner');
      if (!msg) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.borderColor = isError ? '#FCA5A5' : 'var(--border)';
      el.style.color = isError ? '#B91C1C' : 'var(--text)';
      el.textContent = msg;
    }

    function loadData() {
      var yearVal = document.getElementById('year-select').value || 'all';
      var levelVal = document.getElementById('level-select').value || 'all';

      if (window.__INITIAL_DATA__) {
        renderPayload(window.__INITIAL_DATA__, yearVal, levelVal);
        return;
      }

      if (typeof google !== 'undefined' && google.script && google.script.run) {
        showBanner('กำลังดึงข้อมูลจาก Google Sheets...', false);
        google.script.run
          .withSuccessHandler(function (data) {
            showBanner('', false);
            renderPayload(data, yearVal, levelVal);
          })
          .withFailureHandler(function (err) {
            showBanner('ไม่สามารถโหลดข้อมูลจาก Google Sheet: ' + (err && err.message ? err.message : String(err)), true);
          })
          .getDashboardData({ academicYear: yearVal, yearLevel: levelVal });
      } else {
        showBanner('กำลังรอการเชื่อมต่อจาก Google Apps Script (google.script.run)', false);
      }
    }

    function renderPayload(data, yearVal, levelVal) {
      CURRENT_DATA = data;
      var meta = data.meta || {};
      var subtitle = 'สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่';
      if (meta.spreadsheetTitle) subtitle += ' · ' + meta.spreadsheetTitle;
      document.getElementById('sheet-meta').textContent = subtitle;

      var linkEl = document.getElementById('sheet-link');
      var safeSheetUrl = safeUrl(meta.spreadsheetUrl);
      if (safeSheetUrl) {
        linkEl.href = safeSheetUrl;
        linkEl.style.display = 'inline-flex';
      }

      var yearSel = document.getElementById('year-select');
      var currentYears = Array.prototype.map.call(yearSel.options, function (o) { return o.value; });
      (meta.academicYears || []).forEach(function (y) {
        if (currentYears.indexOf(y) === -1) {
          var opt = document.createElement('option');
          opt.value = y;
          opt.textContent = 'ปีการศึกษา ' + y;
          yearSel.appendChild(opt);
        }
      });
      if (yearVal) yearSel.value = yearVal;
      if (levelVal) document.getElementById('level-select').value = levelVal;

      renderFiltered();
    }

    function renderFiltered() {
      if (!CURRENT_DATA) return;
      var q = (document.getElementById('search-input').value || '').trim().toLowerCase();
      var yearVal = document.getElementById('year-select').value || 'all';
      var levelVal = document.getElementById('level-select').value || 'all';
      var statusFilter = document.getElementById('status-select').value || 'all';

      var allStudents = CURRENT_DATA.students || [];
      var students = allStudents.filter(function (s) {
        if (yearVal !== 'all' && s.academicYear !== yearVal) return false;
        if (levelVal !== 'all' && s.yearLevel !== levelVal) return false;
        if (statusFilter === 'อนุมัติทุนแล้ว' && s.applicationStatus.indexOf('อนุมัติ') === -1) return false;
        if (statusFilter === 'รอพิจารณา' && s.applicationStatus.indexOf('รอ') === -1 && s.applicationStatus.indexOf('ยื่น') === -1) return false;
        if (statusFilter === 'ฉบับร่าง' && (s.applicationStatus.indexOf('อนุมัติ') !== -1 || s.applicationStatus.indexOf('รอ') !== -1)) return false;
        if (q) {
          var hay = (s.studentId + ' ' + s.fullName + ' ' + s.receivedScholarships).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });

      var approved = 0, pending = 0, loan = 0, gpaxSum = 0, gpaxCnt = 0;
      students.forEach(function (s) {
        if (s.applicationStatus.indexOf('อนุมัติ') !== -1 && s.applicationStatus.indexOf('ไม่') === -1) approved++;
        else if (s.applicationStatus.indexOf('รอ') !== -1 || s.applicationStatus.indexOf('ยื่น') !== -1) pending++;
        if (s.hasStudentLoan === 'กู้') loan++;
        var g = parseFloat(s.gpax);
        if (!isNaN(g) && g > 0 && g <= 4) { gpaxSum += g; gpaxCnt++; }
      });

      var kpis = [
        { label: 'นักศึกษาที่แสดง', value: students.length + ' คน', sub: 'จากทั้งหมด ' + (CURRENT_DATA.summary ? CURRENT_DATA.summary.totalStudents : allStudents.length) + ' คน' },
        { label: 'อนุมัติทุนแล้ว', value: approved + ' คน', sub: 'คิดเป็น ' + (students.length ? Math.round((approved / students.length) * 100) : 0) + '%' },
        { label: 'รอพิจารณาคำร้อง', value: pending + ' รายการ', sub: 'จิตอาสาอนุมัติ ' + (CURRENT_DATA.summary ? CURRENT_DATA.summary.approvedVolunteerHours : 0) + ' ชม.' },
        { label: 'ผู้กู้ กยศ. / GPAX เฉลี่ย', value: loan + ' คน', sub: 'GPAX เฉลี่ย ' + (gpaxCnt ? (gpaxSum / gpaxCnt).toFixed(2) : '0.00') },
      ];
      document.getElementById('kpi-grid').innerHTML = kpis.map(function (k) {
        return '<div class="card"><div class="kpi-label">' + esc(k.label) + '</div><div class="kpi-value">' + esc(k.value) + '</div><div class="kpi-sub">' + esc(k.sub) + '</div></div>';
      }).join('');

      var maxLvl = 1;
      var byLevel = ['ปี 1', 'ปี 2', 'ปี 3', 'ปี 4'].map(function (lvl) {
        var rows = students.filter(function (s) { return s.yearLevel === lvl; });
        var appCnt = rows.filter(function (s) { return s.applicationStatus.indexOf('อนุมัติ') !== -1 && s.applicationStatus.indexOf('ไม่') === -1; }).length;
        var pendCnt = rows.filter(function (s) { return s.applicationStatus.indexOf('รอ') !== -1 || s.applicationStatus.indexOf('ยื่น') !== -1; }).length;
        var draftCnt = Math.max(0, rows.length - appCnt - pendCnt);
        if (rows.length > maxLvl) maxLvl = rows.length;
        return { yearLevel: lvl, total: rows.length, approved: appCnt, pending: pendCnt, draft: draftCnt };
      });

      document.getElementById('level-bars').innerHTML = byLevel.map(function (b) {
        var wApp = (b.approved / maxLvl) * 100;
        var wPend = (b.pending / maxLvl) * 100;
        var wDraft = (b.draft / maxLvl) * 100;
        return '<div class="bar-row"><div class="bar-head"><span>' + esc(b.yearLevel) + '</span><span>' + esc(b.total) + ' คน (อนุมัติ ' + esc(b.approved) + ')</span></div><div class="bar-track"><div class="bar-approved" style="width:' + wApp + '%"></div><div class="bar-pending" style="width:' + wPend + '%"></div><div class="bar-draft" style="width:' + wDraft + '%"></div></div></div>';
      }).join('');

      var schMap = {};
      students.forEach(function (s) {
        if (s.receivedScholarships && s.receivedScholarships !== 'ไม่ได้รับทุน') {
          s.receivedScholarships.split(/[,/\\n]+/).forEach(function (p) {
            var n = p.trim();
            if (n && n !== 'ไม่ได้รับทุน') schMap[n] = (schMap[n] || 0) + 1;
          });
        }
      });
      var schList = Object.keys(schMap).map(function (k) { return { name: k, count: schMap[k] }; }).sort(function (a, b) { return b.count - a.count; });
      document.getElementById('scholarship-list').innerHTML = schList.length === 0
        ? '<div class="empty">ยังไม่มีข้อมูลประเภททุนการศึกษาที่ได้รับ</div>'
        : schList.map(function (item) {
            return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;"><span>' + esc(item.name) + '</span><strong>' + esc(item.count) + ' คน</strong></div>';
          }).join('');

      var container = document.getElementById('table-container');
      if (ACTIVE_TAB === 'students') {
        if (students.length === 0) { container.innerHTML = '<div class="empty">ไม่พบข้อมูลนักศึกษาตามตัวกรองที่เลือก</div>'; return; }
        container.innerHTML = '<table><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ-นามสกุล</th><th>ปีการศึกษา / ชั้นปี</th><th>GPAX</th><th>กยศ.</th><th>ทุนการศึกษาที่ได้รับ</th><th>จิตอาสา</th><th>สถานะคำร้อง</th></tr></thead><tbody>' +
          students.map(function (s) {
            var badgeCls = s.applicationStatus.indexOf('อนุมัติ') !== -1 && s.applicationStatus.indexOf('ไม่') === -1
              ? 'badge-green'
              : (s.applicationStatus.indexOf('รอ') !== -1 || s.applicationStatus.indexOf('ยื่น') !== -1 ? 'badge-amber' : 'badge-muted');
            var loanCls = s.hasStudentLoan === 'กู้' ? 'badge-blue' : 'badge-muted';
            return '<tr><td><strong>' + esc(s.studentId) + '</strong></td><td>' + esc(s.fullName) + '</td><td>' + esc(s.academicYear) + ' · ' + esc(s.yearLevel) + '</td><td>' + esc(s.gpax || '-') + '</td><td><span class="badge ' + loanCls + '">' + esc(s.hasStudentLoan) + '</span></td><td>' + esc(s.receivedScholarships) + '</td><td>' + esc(s.approvedVolunteerHours) + ' ชม.</td><td><span class="badge ' + badgeCls + '">' + esc(s.applicationStatus) + '</span></td></tr>';
          }).join('') + '</tbody></table>';
      } else if (ACTIVE_TAB === 'grades') {
        var grades = (CURRENT_DATA.grades || []).filter(function (g) {
          if (yearVal !== 'all' && g.academicYear !== yearVal) return false;
          if (levelVal !== 'all' && g.yearLevel !== levelVal) return false;
          if (q && (g.studentId + ' ' + g.studentName).toLowerCase().indexOf(q) === -1) return false;
          return true;
        });
        if (grades.length === 0) { container.innerHTML = '<div class="empty">ยังไม่มีข้อมูลผลการเรียน (GPA)</div>'; return; }
        container.innerHTML = '<table><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ-นามสกุล</th><th>ปีการศึกษา / ชั้นปี</th><th>ภาคเรียน</th><th>GPA</th><th>ผู้บันทึก</th><th>หลักฐาน Drive</th></tr></thead><tbody>' +
          grades.map(function (g) {
            var href = safeUrl(g.attachmentUrl);
            return '<tr><td><strong>' + esc(g.studentId) + '</strong></td><td>' + esc(g.studentName) + '</td><td>' + esc(g.academicYear) + ' · ' + esc(g.yearLevel) + '</td><td>' + esc(g.semester) + '</td><td><strong>' + esc(g.gpa) + '</strong></td><td>' + esc(g.recordedBy) + '</td><td>' + (href ? '<a class="link" href="' + esc(href) + '" target="_blank" rel="noreferrer">เปิดไฟล์</a>' : '-') + '</td></tr>';
          }).join('') + '</tbody></table>';
      } else {
        var vols = (CURRENT_DATA.volunteers || []).filter(function (v) {
          if (yearVal !== 'all' && v.academicYear !== yearVal) return false;
          if (q && (v.studentId + ' ' + v.studentName + ' ' + v.activityTitle).toLowerCase().indexOf(q) === -1) return false;
          return true;
        });
        if (vols.length === 0) { container.innerHTML = '<div class="empty">ยังไม่มีข้อมูลกิจกรรมจิตอาสา</div>'; return; }
        container.innerHTML = '<table><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ-นามสกุล</th><th>ปีการศึกษา</th><th>ชื่อกิจกรรม</th><th>วันที่จัด</th><th>ชั่วโมงอนุมัติ</th><th>สถานะ</th></tr></thead><tbody>' +
          vols.map(function (v) {
            var cls = v.approvalStatus === 'approved' ? 'badge-green' : (v.approvalStatus === 'pending' ? 'badge-amber' : 'badge-muted');
            var label = v.approvalStatus === 'approved' ? 'อนุมัติแล้ว' : (v.approvalStatus === 'pending' ? 'รออนุมัติ' : 'ไม่อนุมัติ');
            return '<tr><td><strong>' + esc(v.studentId) + '</strong></td><td>' + esc(v.studentName) + '</td><td>' + esc(v.academicYear) + '</td><td>' + esc(v.activityTitle) + '</td><td>' + esc(v.activityDate) + '</td><td>' + esc(v.approvedHours) + ' / ' + esc(v.hours) + ' ชม.</td><td><span class="badge ' + cls + '">' + esc(label) + '</span></td></tr>';
          }).join('') + '</tbody></table>';
      }
    }

    document.addEventListener('DOMContentLoaded', loadData);
  </script>
</body>
</html>`;
}

export function generateAppsScriptFiles(config?: {
  spreadsheetId?: string;
  driveFolderId?: string;
}): { codeGs: string; indexHtml: string } {
  return {
    codeGs: buildAppsScriptCodeGs(config),
    indexHtml: buildAppsScriptIndexHtml(),
  };
}

export function buildLocalAppsScriptPayload(
  records: StudentFullRecord[],
  config?: GoogleWorkspaceConfig
): AppsScriptDashboardPayload {
  const overview = buildPublicOverviewStats(records, 'all', 'all');
  const students: AppsScriptStudentItem[] = records.map((rec) => {
    const vol = calculateApprovedVolunteerHours(rec.volunteers);
    const statusLabel = rec.application
      ? getApplicationStatusMeta(rec.application.status).label
      : 'ยังไม่ยื่นคำร้อง';
    return {
      studentId: rec.basicInfo.studentId || rec.user.studentId || '-',
      fullName: rec.basicInfo.fullName || rec.user.fullName,
      academicYear: rec.application?.academicYear || rec.basicInfo.academicYear,
      yearLevel: rec.application?.yearLevel || rec.basicInfo.yearLevel,
      gpax: rec.application?.gpax || rec.basicInfo.gpax || '-',
      hasStudentLoan: rec.basicInfo.hasStudentLoan || 'ไม่กู้',
      receivedScholarships:
        rec.basicInfo.hasOtherScholarship === 'ได้รับทุน'
          ? formatReceivedScholarshipsText(rec.basicInfo) || 'ได้รับทุน'
          : 'ไม่ได้รับทุน',
      pdpaStatus: rec.basicInfo.pdpaConsented ? 'ยินยอมแล้ว' : 'ยังไม่ยินยอม',
      applicationStatus: statusLabel,
      advisorComment: rec.application?.advisorComment || '',
      approvedVolunteerHours: vol.approvedHours,
      profilePhotoUrl:
        rec.basicInfo.profilePhoto?.driveWebViewLink || rec.basicInfo.profilePhoto?.url || '',
    };
  });

  const grades: AppsScriptGradeItem[] = records.flatMap((rec) =>
    rec.grades.map((g) => ({
      studentId: rec.basicInfo.studentId || rec.user.studentId || '-',
      studentName: g.studentName || rec.basicInfo.fullName || rec.user.fullName,
      academicYear: g.academicYear,
      yearLevel: g.yearLevel,
      semester: g.semester,
      gpa: g.gpa,
      recordedBy: g.uploadedByName,
      attachmentUrl:
        g.attachments?.[0]?.driveWebViewLink || g.attachments?.[0]?.url || '',
      updatedAt: g.updatedAt,
    }))
  );

  const volunteers: AppsScriptVolunteerItem[] = records.flatMap((rec) =>
    rec.volunteers.map((v) => ({
      studentId: rec.basicInfo.studentId || rec.user.studentId || '-',
      studentName: v.studentName || rec.basicInfo.fullName || rec.user.fullName,
      academicYear: v.academicYear,
      activityTitle: v.activityTitle,
      activityDate: v.activityDate,
      hours: v.hours,
      approvedHours: v.approvedHours,
      approvalStatus: v.approvalStatus,
      photoUrl: v.photos?.[0]?.driveWebViewLink || v.photos?.[0]?.url || '',
    }))
  );

  return {
    ok: true,
    meta: {
      title: 'EDU SOCIAL CARE CMRU',
      spreadsheetTitle: config?.spreadsheetTitle || 'ข้อมูลในระบบปัจจุบัน (ตัวอย่างก่อนขึ้น Google Script)',
      spreadsheetUrl: config?.spreadsheetUrl || '',
      generatedAt: new Date().toISOString(),
      academicYears: [...ACADEMIC_YEARS],
      yearLevels: [...YEAR_LEVELS],
    },
    summary: {
      totalStudents: overview.totalAllStudents,
      filteredStudents: overview.filteredTotal,
      approvedCount: overview.approvedCount,
      pendingCount: overview.pendingCount,
      draftOrRevisionCount:
        overview.draftOrNoAppCount + overview.needsRevisionOrRejectedCount,
      loanCount: overview.loanCount,
      pdpaConsentedCount: overview.pdpaConsentedCount,
      averageGpax: overview.averageGpax,
      totalGradeRecords: overview.gradeRecordsCount,
      approvedVolunteerHours: overview.approvedVolunteerHours,
      pendingVolunteerHours: overview.pendingVolunteerHours,
    },
    byYearLevel: overview.byYearLevel,
    scholarshipSummary: overview.scholarshipSummary.map((s) => ({
      name: s.scholarshipName,
      count: s.recipientCount,
    })),
    students,
    grades,
    volunteers,
  };
}

export function buildLocalAppsScriptPreviewHtml(
  records: StudentFullRecord[],
  config?: GoogleWorkspaceConfig
): string {
  const payload = buildLocalAppsScriptPayload(records, config);
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const baseHtml = buildAppsScriptIndexHtml();
  return baseHtml.replace(
    '<script>',
    `<script>\n    window.__INITIAL_DATA__ = ${safeJson};`
  );
}

export async function fetchAppsScriptDashboardData(
  webAppUrl: string,
  params?: { academicYear?: string; yearLevel?: string }
): Promise<AppsScriptDashboardPayload> {
  const safeUrl = sanitizeAppsScriptWebAppUrl(webAppUrl);
  if (!safeUrl) {
    throw new Error(
      'ลิงก์ Google Apps Script Web App ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://script.google.com/macros/s/.../exec)'
    );
  }

  const endpoint = new URL(safeUrl);
  endpoint.searchParams.set('format', 'json');
  if (params?.academicYear && params.academicYear !== 'all') {
    endpoint.searchParams.set('academicYear', params.academicYear);
  }
  if (params?.yearLevel && params.yearLevel !== 'all') {
    endpoint.searchParams.set('yearLevel', params.yearLevel);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(endpoint.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        'ไม่สามารถอ่านผลลัพธ์ JSON จาก Google Script ได้ — กรุณาตรวจสอบว่าได้ Deploy เป็น "เว็บแอป" และตั้งค่าผู้มีสิทธิ์เข้าถึงเป็น "ทุกคน (Anyone)" แล้ว'
      );
    }
    if (!res.ok || parsed.ok === false) {
      throw new Error(
        String(parsed.error || 'Google Apps Script ตอบกลับข้อผิดพลาด กรุณาตรวจสอบ Code.gs และสิทธิ์เข้าถึง Google Sheet')
      );
    }
    return parsed as unknown as AppsScriptDashboardPayload;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('การดึงข้อมูลจาก Google Apps Script ใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
