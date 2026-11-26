import type {
  ImportedStudentRow,
  StudentFullRecord,
  UploadedFileMeta,
} from '../types/scholarship';
import {
  calculateApprovedVolunteerHours,
  formatReceivedScholarshipsText,
  getApplicationStatusMeta,
  parseExcelStudentRows,
  validateUploadFile,
} from '../utils/scholarshipLogic';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

export const WORKSPACE_SHEET_TABS = {
  STUDENTS: 'นักศึกษาและข้อมูลพื้นฐาน',
  APPLICATIONS: 'คำร้องขอทุนการศึกษา',
  GRADES: 'ผลการเรียน_GPA',
  VOLUNTEERS: 'กิจกรรมจิตอาสา',
  IMPORT_TEMPLATE: 'ข้อมูลนำเข้า_Students',
} as const;

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: { sheetId: number; title: string }[];
}

export interface DriveItemInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  webViewLink?: string;
  thumbnailLink?: string;
}

async function googleFetchJson<T>(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const text = await res.text();
  let parsed: Record<string, any> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, any>) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('สิทธิ์การเข้าถึง Google หมดอายุแล้ว กรุณากด "Sign in with Google" ใหม่อีกครั้ง');
    }
    if (res.status === 403) {
      throw new Error(
        parsed?.error?.message ||
          'บัญชี Google นี้ไม่มีสิทธิ์เข้าถึงไฟล์/สเปรดชีตที่ระบุ หรือยังไม่ได้เปิดสิทธิ์ Google Sheets / Drive'
      );
    }
    throw new Error(parsed?.error?.message || `Google API ผิดพลาด (${res.status})`);
  }

  return parsed as T;
}

export function parseGoogleResourceId(rawInput: string, kind: 'sheet' | 'folder'): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  if (kind === 'sheet') {
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,120})/);
    if (match?.[1]) return match[1];
  } else {
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,120})/);
    if (folderMatch?.[1]) return folderMatch[1];
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,120})/);
    if (idParamMatch?.[1]) return idParamMatch[1];
  }

  if (/^[a-zA-Z0-9_-]{10,120}$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error(
    kind === 'sheet'
      ? 'รูปแบบลิงก์หรือ Spreadsheet ID ไม่ถูกต้อง'
      : 'รูปแบบลิงก์หรือ Folder ID ไม่ถูกต้อง'
  );
}

export async function inspectSpreadsheet(
  accessToken: string,
  idOrUrl: string
): Promise<SpreadsheetMetadata> {
  const spreadsheetId = parseGoogleResourceId(idOrUrl, 'sheet');
  if (!spreadsheetId) {
    throw new Error('กรุณาระบุ Spreadsheet ID หรือลิงก์ Google Sheets');
  }

  const data = await googleFetchJson<{
    spreadsheetId: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  }>(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`,
    accessToken
  );

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Google Sheet',
    spreadsheetUrl:
      data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
    sheets: (data.sheets || [])
      .map((s) => ({
        sheetId: Number(s.properties?.sheetId ?? 0),
        title: s.properties?.title || '',
      }))
      .filter((s) => Boolean(s.title)),
  };
}

export async function createWorkspaceSpreadsheet(
  accessToken: string,
  title = 'EDU SOCIAL CARE CMRU — ฐานข้อมูลทุนการศึกษา'
): Promise<SpreadsheetMetadata> {
  const payload = {
    properties: { title },
    sheets: [
      { properties: { title: WORKSPACE_SHEET_TABS.STUDENTS } },
      { properties: { title: WORKSPACE_SHEET_TABS.APPLICATIONS } },
      { properties: { title: WORKSPACE_SHEET_TABS.GRADES } },
      { properties: { title: WORKSPACE_SHEET_TABS.VOLUNTEERS } },
      { properties: { title: WORKSPACE_SHEET_TABS.IMPORT_TEMPLATE } },
    ],
  };

  const created = await googleFetchJson<{
    spreadsheetId: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  }>(SHEETS_API_BASE, accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  // Seed column headers cleanly on creation
  await googleFetchJson(
    `${SHEETS_API_BASE}/${encodeURIComponent(created.spreadsheetId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `'${WORKSPACE_SHEET_TABS.STUDENTS}'!A1`,
            values: [
              [
                'รหัสนักศึกษา',
                'ชื่อ-นามสกุล',
                'อีเมล',
                'ปีการศึกษา',
                'ชั้นปี',
                'GPAX',
                'กยศ.',
                'ทุนการศึกษาที่ได้รับ',
                'สถานะ PDPA',
                'เบอร์โทรศัพท์',
                'รายได้บิดา',
                'รายได้มารดา',
                'ลิงก์รูปโปรไฟล์ (Google Drive)',
              ],
            ],
          },
          {
            range: `'${WORKSPACE_SHEET_TABS.IMPORT_TEMPLATE}'!A1`,
            values: [
              [
                'รหัสนักศึกษา',
                'ชื่อ-นามสกุล',
                'อีเมล',
                'ปีการศึกษา',
                'ชั้นปี',
                'GPAX',
                'เบอร์โทรศัพท์',
                'กยศ.',
              ],
            ],
          },
        ],
      }),
    }
  );

  return {
    spreadsheetId: created.spreadsheetId,
    title: created.properties?.title || title,
    spreadsheetUrl:
      created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}`,
    sheets: (created.sheets || []).map((s) => ({
      sheetId: Number(s.properties?.sheetId ?? 0),
      title: s.properties?.title || '',
    })),
  };
}

export async function syncStudentsToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  records: StudentFullRecord[]
): Promise<{
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  studentRows: number;
  applicationRows: number;
  gradeRows: number;
  volunteerRows: number;
}> {
  const meta = await inspectSpreadsheet(accessToken, spreadsheetId);
  const existingTitles = new Set(meta.sheets.map((s) => s.title));
  const requiredTabs = Object.values(WORKSPACE_SHEET_TABS);
  const missingTabs = requiredTabs.filter((tab) => !existingTitles.has(tab));

  if (missingTabs.length > 0) {
    await googleFetchJson(
      `${SHEETS_API_BASE}/${encodeURIComponent(meta.spreadsheetId)}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: missingTabs.map((title) => ({
            addSheet: { properties: { title } },
          })),
        }),
      }
    );
  }

  // Clear existing data in target tabs before writing synced rows
  await googleFetchJson(
    `${SHEETS_API_BASE}/${encodeURIComponent(meta.spreadsheetId)}/values:batchClear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: requiredTabs.map((t) => `'${t}'!A1:Z5000`),
      }),
    }
  );

  const studentSheetValues: (string | number)[][] = [
    [
      'รหัสนักศึกษา',
      'ชื่อ-นามสกุล',
      'อีเมล',
      'ปีการศึกษา',
      'ชั้นปี',
      'GPAX',
      'กยศ.',
      'ทุนการศึกษาที่ได้รับ',
      'สถานะ PDPA',
      'เบอร์โทรศัพท์',
      'รายได้บิดา(บาท/เดือน)',
      'รายได้มารดา(บาท/เดือน)',
      'ลิงก์รูปโปรไฟล์ (Google Drive)',
    ],
  ];

  const appSheetValues: (string | number)[][] = [
    [
      'รหัสนักศึกษา',
      'ชื่อ-นามสกุล',
      'ปีการศึกษา',
      'ชั้นปี',
      'GPAX',
      'สถานะคำร้อง',
      'ความเห็นอาจารย์',
      'ผู้พิจารณา',
      'วันที่ส่ง',
      'ลิงก์ไฟล์/รูปภาพแนบ (Google Drive)',
    ],
  ];

  const gradeSheetValues: (string | number)[][] = [
    [
      'รหัสนักศึกษา',
      'ชื่อ-นามสกุล',
      'ปีการศึกษา',
      'ชั้นปี',
      'ภาคเรียน',
      'GPA',
      'ผู้บันทึก',
      'หลักฐานใน Google Drive',
      'อัปเดตล่าสุด',
    ],
  ];

  const volunteerSheetValues: (string | number)[][] = [
    [
      'รหัสนักศึกษา',
      'ชื่อ-นามสกุล',
      'ปีการศึกษา',
      'ชื่อกิจกรรม',
      'วันที่จัดกิจกรรม',
      'ชั่วโมงที่ยื่น',
      'ชั่วโมงที่อนุมัติ',
      'สถานะรับรอง',
      'หมายเหตุอาจารย์',
      'ภาพกิจกรรม (Google Drive)',
    ],
  ];

  const importSheetValues: (string | number)[][] = [
    [
      'รหัสนักศึกษา',
      'ชื่อ-นามสกุล',
      'อีเมล',
      'ปีการศึกษา',
      'ชั้นปี',
      'GPAX',
      'เบอร์โทรศัพท์',
      'กยศ.',
    ],
  ];

  for (const rec of records) {
    const sid = rec.basicInfo.studentId || rec.user.studentId || '-';
    const fullName = rec.basicInfo.fullName || rec.user.fullName;
    const email = rec.basicInfo.email || rec.user.email || '';
    const academicYear = rec.application?.academicYear || rec.basicInfo.academicYear;
    const yearLevel = rec.application?.yearLevel || rec.basicInfo.yearLevel;
    const gpax = rec.application?.gpax || rec.basicInfo.gpax || '';
    const loan = rec.basicInfo.hasStudentLoan || 'ไม่กู้';
    const scholarships =
      rec.basicInfo.hasOtherScholarship === 'ได้รับทุน'
        ? formatReceivedScholarshipsText(rec.basicInfo) || 'ได้รับทุน'
        : 'ไม่ได้รับทุน';
    const profileLink =
      rec.basicInfo.profilePhoto?.driveWebViewLink || rec.basicInfo.profilePhoto?.url || '';

    studentSheetValues.push([
      sid,
      fullName,
      email,
      academicYear,
      yearLevel,
      gpax,
      loan,
      scholarships,
      rec.basicInfo.pdpaConsented ? 'ยินยอมแล้ว' : 'ยังไม่ยินยอม',
      rec.basicInfo.phone || '',
      rec.basicInfo.father.monthlyIncome || '',
      rec.basicInfo.mother.monthlyIncome || '',
      profileLink,
    ]);

    importSheetValues.push([
      sid,
      fullName,
      email,
      academicYear,
      yearLevel,
      gpax,
      rec.basicInfo.phone || '',
      loan,
    ]);

    if (rec.application) {
      const appMediaLinks = [
        ...(rec.application.indoorHousePhotos || []),
        ...(rec.application.indoorFamilyPhotos || []),
        ...(rec.application.outdoorHousePhotos || []),
        ...(rec.application.outdoorFamilyPhotos || []),
      ]
        .map((f) => f.driveWebViewLink || f.url)
        .filter(Boolean)
        .join(' | ');

      appSheetValues.push([
        sid,
        fullName,
        rec.application.academicYear,
        rec.application.yearLevel,
        rec.application.gpax || gpax,
        getApplicationStatusMeta(rec.application.status).label,
        rec.application.advisorComment || '',
        rec.application.reviewedBy || '',
        rec.application.submittedAt || '',
        appMediaLinks,
      ]);
    }

    for (const g of rec.grades) {
      gradeSheetValues.push([
        sid,
        g.studentName || fullName,
        g.academicYear,
        g.yearLevel,
        g.semester,
        g.gpa,
        g.uploadedByName,
        (g.attachments || []).map((a) => a.driveWebViewLink || a.url).join(' | '),
        g.updatedAt,
      ]);
    }

    for (const v of rec.volunteers) {
      volunteerSheetValues.push([
        sid,
        v.studentName || fullName,
        v.academicYear,
        v.activityTitle,
        v.activityDate,
        v.hours,
        v.approvedHours,
        v.approvalStatus,
        v.advisorNote || '',
        (v.photos || []).map((p) => p.driveWebViewLink || p.url).join(' | '),
      ]);
    }
  }

  await googleFetchJson(
    `${SHEETS_API_BASE}/${encodeURIComponent(meta.spreadsheetId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `'${WORKSPACE_SHEET_TABS.STUDENTS}'!A1`, values: studentSheetValues },
          { range: `'${WORKSPACE_SHEET_TABS.APPLICATIONS}'!A1`, values: appSheetValues },
          { range: `'${WORKSPACE_SHEET_TABS.GRADES}'!A1`, values: gradeSheetValues },
          { range: `'${WORKSPACE_SHEET_TABS.VOLUNTEERS}'!A1`, values: volunteerSheetValues },
          { range: `'${WORKSPACE_SHEET_TABS.IMPORT_TEMPLATE}'!A1`, values: importSheetValues },
        ],
      }),
    }
  );

  return {
    spreadsheetTitle: meta.title,
    spreadsheetUrl: meta.spreadsheetUrl,
    studentRows: studentSheetValues.length - 1,
    applicationRows: appSheetValues.length - 1,
    gradeRows: gradeSheetValues.length - 1,
    volunteerRows: volunteerSheetValues.length - 1,
  };
}

export async function readStudentsFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  preferredTabName?: string
): Promise<{
  tabTitle: string;
  validRows: ImportedStudentRow[];
  errors: string[];
}> {
  const meta = await inspectSpreadsheet(accessToken, spreadsheetId);
  if (meta.sheets.length === 0) {
    throw new Error('ไม่พบแผ่นงาน (Tab) ใน Google Sheet ที่เลือก');
  }

  const chosenTab =
    meta.sheets.find((s) => s.title === preferredTabName)?.title ||
    meta.sheets.find((s) => s.title === WORKSPACE_SHEET_TABS.IMPORT_TEMPLATE)?.title ||
    meta.sheets.find((s) => s.title === WORKSPACE_SHEET_TABS.STUDENTS)?.title ||
    meta.sheets[0].title;

  const valuesRes = await googleFetchJson<{ values?: string[][] }>(
    `${SHEETS_API_BASE}/${encodeURIComponent(meta.spreadsheetId)}/values/${encodeURIComponent(`'${chosenTab}'!A1:M2000`)}`,
    accessToken
  );

  const matrix = valuesRes.values || [];
  if (matrix.length < 2) {
    return {
      tabTitle: chosenTab,
      validRows: [],
      errors: ['ไม่พบแถวข้อมูลในแผ่นงาน Google Sheet นี้ (ต้องมีหัวตารางแถวแรกและข้อมูลอย่างน้อย 1 แถว)'],
    };
  }

  const headers = matrix[0].map((h) => String(h || '').trim());
  const rawObjects: Record<string, unknown>[] = matrix.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      if (header) obj[header] = row[idx] ?? '';
    });
    return obj;
  });

  const parsed = parseExcelStudentRows(rawObjects);
  return {
    tabTitle: chosenTab,
    validRows: parsed.validRows,
    errors: parsed.errors.map((e) => `แถวที่ ${e.rowNumber}: ${e.message}`),
  };
}

export async function inspectDriveFolder(
  accessToken: string,
  folderIdOrUrl: string
): Promise<DriveItemInfo> {
  const folderId = parseGoogleResourceId(folderIdOrUrl, 'folder');
  if (!folderId) {
    throw new Error('กรุณาระบุ Folder ID หรือลิงก์โฟลเดอร์ Google Drive');
  }
  const folder = await googleFetchJson<DriveItemInfo>(
    `${DRIVE_API_BASE}/${encodeURIComponent(folderId)}?fields=id,name,mimeType,webViewLink`,
    accessToken
  );
  if (folder.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('ID ที่ระบุไม่ใช่โฟลเดอร์ Google Drive');
  }
  return folder;
}

export async function createDriveFolder(
  accessToken: string,
  name = 'EDU SOCIAL CARE CMRU — เอกสารและรูปภาพทุนการศึกษา'
): Promise<DriveItemInfo> {
  return googleFetchJson<DriveItemInfo>(
    `${DRIVE_API_BASE}?fields=id,name,mimeType,webViewLink`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    }
  );
}

export async function listDriveFolderFiles(
  accessToken: string,
  folderId?: string
): Promise<DriveItemInfo[]> {
  const qParts = ['trashed = false', "mimeType != 'application/vnd.google-apps.folder'"];
  if (folderId && /^[a-zA-Z0-9_-]{10,120}$/.test(folderId)) {
    qParts.push(`'${folderId}' in parents`);
  }
  const params = new URLSearchParams({
    q: qParts.join(' and '),
    orderBy: 'modifiedTime desc',
    pageSize: '60',
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)',
  });

  const data = await googleFetchJson<{ files?: DriveItemInfo[] }>(
    `${DRIVE_API_BASE}?${params.toString()}`,
    accessToken
  );
  return data.files || [];
}

export async function uploadFileToGoogleDrive(
  accessToken: string,
  file: File,
  options?: { folderId?: string; maxSizeMB?: number; allowPdf?: boolean }
): Promise<UploadedFileMeta> {
  const check = validateUploadFile(
    { name: file.name, size: file.size, type: file.type },
    { maxSizeMB: options?.maxSizeMB ?? 6, allowPdf: options?.allowPdf ?? true }
  );
  if (!check.valid) {
    throw new Error(check.error || 'ไฟล์ไม่ผ่านเงื่อนไขการอัปโหลด');
  }

  const metadata: { name: string; parents?: string[] } = {
    name: file.name,
  };
  if (options?.folderId && /^[a-zA-Z0-9_-]{10,120}$/.test(options.folderId)) {
    metadata.parents = [options.folderId];
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', file);

  const uploaded = await googleFetchJson<{
    id: string;
    name: string;
    mimeType?: string;
    size?: string | number;
    webViewLink?: string;
  }>(
    `${DRIVE_UPLOAD_BASE}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink`,
    accessToken,
    {
      method: 'POST',
      body: form,
    }
  );

  const driveWebViewLink =
    uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;

  return {
    id: `gdrive_${uploaded.id}`,
    name: uploaded.name || file.name,
    size: Number(uploaded.size ?? file.size),
    mimeType: uploaded.mimeType || file.type || 'application/octet-stream',
    url: driveWebViewLink,
    uploadedAt: new Date().toISOString(),
    storageProvider: 'google_drive',
    driveFileId: uploaded.id,
    driveWebViewLink,
  };
}

export async function fetchDriveFileBlobUrl(
  accessToken: string,
  driveFileId: string
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{10,120}$/.test(driveFileId)) {
    throw new Error('รหัสไฟล์ Google Drive ไม่ถูกต้อง');
  }
  const res = await fetch(
    `${DRIVE_API_BASE}/${encodeURIComponent(driveFileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`ไม่สามารถดึงไฟล์จาก Google Drive (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function deleteDriveFile(accessToken: string, driveFileId: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{10,120}$/.test(driveFileId)) {
    throw new Error('รหัสไฟล์ Google Drive ไม่ถูกต้อง');
  }
  const res = await fetch(`${DRIVE_API_BASE}/${encodeURIComponent(driveFileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`ไม่สามารถลบไฟล์ออกจาก Google Drive (${res.status})`);
  }
}

export async function syncVolunteerHoursSummaryRow(
  accessToken: string,
  spreadsheetId: string,
  records: StudentFullRecord[]
): Promise<number> {
  let totalApproved = 0;
  for (const r of records) {
    totalApproved += calculateApprovedVolunteerHours(r.volunteers).approvedHours;
  }
  await syncStudentsToGoogleSheet(accessToken, spreadsheetId, records);
  return totalApproved;
}
