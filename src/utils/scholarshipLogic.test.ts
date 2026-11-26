import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultStudentPassword,
  buildPublicOverviewStats,
  buildScholarshipRecipientsSummary,
  calculateApprovedVolunteerHours,
  canDeleteUserAccount,
  canResetUserPassword,
  createEmptyBasicInfo,
  evaluateAdminSetupPassword,
  evaluateLoginAttemptStatus,
  evaluatePasswordStrength,
  extractConfirmedReceivedScholarships,
  filterStudentRecords,
  formatStructuredAddress,
  generateVerificationCode,
  inferStudentIdFromCmruEmail,
  isVolunteerModuleUnlocked,
  LOGIN_LOCKOUT_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  normalizeScholarshipName,
  parseExcelStudentRows,
  prefillApplicationFromBasicInfo,
  recordFailedAttemptState,
  resolveAdvisorDisplayName,
  sanitizeCsvCell,
  sanitizeReceivedScholarships,
  validateAdminSetupPayload,
  validateCmruStudentEmail,
  validatePasswordChangePayload,
  validateStrongPassword,
  validateStudentId,
  validateStudentRegistrationPayload,
  validateUploadFile,
  verifyVerificationCode,
} from './scholarshipLogic';
import {
  buildStudentProfilePdfFilename,
  buildSummaryReportPdfFilename,
  computeFitAllColumnsScale,
  computePdfPaginationSlices,
  getA4PageDimensionsMm,
  sanitizePdfFilenamePart,
} from './pdfHelpers';
import {
  BoundedMap,
  clampPayloadText,
  FixedWindowRateLimiter,
  isSafeUploadFilename,
  sanitizeAppsScriptWebAppUrl,
  sanitizeWorkspaceConfigInput,
  validateUploadedBinary,
} from './securityGuard';
import {
  buildLocalAppsScriptPreviewHtml,
  generateAppsScriptFiles,
} from '../services/googleAppsScriptTemplate';
import type { StudentFullRecord, VolunteerRecord } from '../types/scholarship';

test('generateVerificationCode and verifyVerificationCode handle 5-digit numeric challenges', () => {
  const code = generateVerificationCode();
  assert.match(code, /^\d{5}$/);
  assert.equal(verifyVerificationCode(code, code), true);
  assert.equal(verifyVerificationCode(` ${code} `, code), true);
  assert.equal(verifyVerificationCode('00000', '12345'), false);
  assert.equal(verifyVerificationCode('', ''), false);
});

test('validateCmruStudentEmail allows only @g.cmru.ac.th emails', () => {
  const valid = validateCmruStudentEmail('  67123456@g.cmru.ac.th ');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized, '67123456@g.cmru.ac.th');

  const gmail = validateCmruStudentEmail('student@gmail.com');
  assert.equal(gmail.valid, false);
  assert.ok(gmail.error?.includes('@g.cmru.ac.th'));

  const cmruNonG = validateCmruStudentEmail('teacher@cmru.ac.th');
  assert.equal(cmruNonG.valid, false);
});

test('validateStudentId validates strict 8-digit Student ID format cleanly', () => {
  const valid = validateStudentId('  69000001 ');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized, '69000001');

  assert.equal(validateStudentId('').valid, false);
  assert.equal(validateStudentId('12').valid, false);
  assert.equal(validateStudentId('1234567').valid, false);
  assert.equal(validateStudentId('123456789').valid, false);
  assert.equal(validateStudentId('6900000a').valid, false);
  assert.equal(validateStudentId('69000001@g.cmru.ac.th').valid, false);
  assert.equal(validateStudentId('6900 0001').valid, false);
});

test('validateStudentRegistrationPayload supports Student ID-only registration with optional name and password', () => {
  assert.equal(inferStudentIdFromCmruEmail('67119999@g.cmru.ac.th'), '67119999');
  assert.equal(inferStudentIdFromCmruEmail('user@gmail.com'), '');

  const idOnly = validateStudentRegistrationPayload({
    studentId: '67119999',
  });
  assert.equal(idOnly.valid, true);
  assert.equal(idOnly.normalizedStudentId, '67119999');

  const invalidId = validateStudentRegistrationPayload({
    studentId: 'bad@email.com',
  });
  assert.equal(invalidId.valid, false);

  const mismatchPw = validateStudentRegistrationPayload({
    studentId: '67119999',
    password: 'pass1',
    confirmPassword: 'pass2',
  });
  assert.equal(mismatchPw.valid, false);

  const ok = validateStudentRegistrationPayload({
    studentId: '67119999',
    fullName: 'นายสมชาย รักเรียน',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.normalizedStudentId, '67119999');
});

test('validateUploadFile enforces size and mime restrictions', () => {
  assert.equal(
    validateUploadFile(
      { name: 'id-photo.jpg', size: 2 * 1024 * 1024, type: 'image/jpeg' },
      { maxSizeMB: 5, allowPdf: false }
    ).valid,
    true
  );

  assert.equal(
    validateUploadFile(
      { name: 'id-photo.pdf', size: 1024 * 1024, type: 'application/pdf' },
      { maxSizeMB: 5, allowPdf: false }
    ).valid,
    false
  );

  assert.equal(
    validateUploadFile(
      { name: 'grade-proof.pdf', size: 4 * 1024 * 1024, type: 'application/pdf' },
      { maxSizeMB: 3, allowPdf: true }
    ).valid,
    false
  );

  assert.equal(
    validateUploadFile(
      { name: 'volunteer.webp', size: 9 * 1024 * 1024, type: 'image/webp' },
      { maxSizeMB: 10, allowPdf: true }
    ).valid,
    true
  );
});

test('isVolunteerModuleUnlocked unlocks only when scholarship application is approved', () => {
  assert.equal(isVolunteerModuleUnlocked(null), false);
  assert.equal(isVolunteerModuleUnlocked({ status: 'draft' }), false);
  assert.equal(isVolunteerModuleUnlocked({ status: 'submitted' }), false);
  assert.equal(isVolunteerModuleUnlocked({ status: 'reviewing' }), false);
  assert.equal(isVolunteerModuleUnlocked({ status: 'rejected' }), false);
  assert.equal(isVolunteerModuleUnlocked({ status: 'approved' }), true);
});

test('prefillApplicationFromBasicInfo maps student basic info into scholarship application', () => {
  const basic = createEmptyBasicInfo('67110001@g.cmru.ac.th', 'น.ส.กานดา ใจดี', '67110001');
  basic.academicYear = '2569';
  basic.yearLevel = 'ปี 2';
  basic.gpax = '3.62';
  basic.phone = '0812345678';
  basic.hasStudentLoan = 'กู้';
  basic.livingWith = 'อยู่ร่วมกับบิดาและมารดา';
  basic.necessityReason = 'ครอบครัวมีรายได้น้อยจากอาชีพเกษตรกรรม';
  basic.spendingPlan = 'ใช้เป็นค่าอุปกรณ์การเรียนและค่าหอพัก';

  const app = prefillApplicationFromBasicInfo(basic, null, 'stu_1');
  assert.equal(app.fullName, 'น.ส.กานดา ใจดี');
  assert.equal(app.studentId, '67110001');
  assert.equal(app.gpax, '3.62');
  assert.equal(app.hasStudentLoan, 'กู้ กยศ.');
  assert.equal(app.currentlyLivingWith, 'อยู่ร่วมกับบิดาและมารดา');
  assert.equal(app.scholarshipNecessityDetail, 'ครอบครัวมีรายได้น้อยจากอาชีพเกษตรกรรม');
  assert.equal(app.expectedBenefitDetail, 'ใช้เป็นค่าอุปกรณ์การเรียนและค่าหอพัก');
});

test('calculateApprovedVolunteerHours sums approved and pending hours accurately', () => {
  const records: VolunteerRecord[] = [
    {
      id: 'v1',
      studentUserId: 'u1',
      studentId: '67110001',
      studentName: 'กานดา',
      academicYear: '2569',
      activityTitle: 'สอนเสริม',
      activityDetail: 'สอนนักเรียนประถม',
      learnings: 'การสื่อสาร',
      hours: 6,
      activityDate: '2026-08-10',
      dailyLifeApplication: 'ใจเย็นขึ้น',
      photos: [],
      approvalStatus: 'approved',
      approvedHours: 6,
      advisorNote: 'ดีมาก',
      createdAt: '2026-08-11T00:00:00.000Z',
    },
    {
      id: 'v2',
      studentUserId: 'u1',
      studentId: '67110001',
      studentName: 'กานดา',
      academicYear: '2569',
      activityTitle: 'จัดห้องสมุด',
      activityDetail: 'จัดหนังสือ',
      learnings: 'การจัดการ',
      hours: 4,
      activityDate: '2026-09-01',
      dailyLifeApplication: 'มีระเบียบ',
      photos: [],
      approvalStatus: 'pending',
      approvedHours: 0,
      advisorNote: '',
      createdAt: '2026-09-02T00:00:00.000Z',
    },
  ];

  const summary = calculateApprovedVolunteerHours(records);
  assert.equal(summary.approvedHours, 6);
  assert.equal(summary.pendingHours, 4);
  assert.equal(summary.totalSubmittedCount, 2);
});

test('canResetUserPassword grants reset permission exclusively to admin', () => {
  assert.equal(canResetUserPassword('admin'), true);
  assert.equal(canResetUserPassword('teacher'), false);
  assert.equal(canResetUserPassword('student'), false);
});

test('canDeleteUserAccount enforces admin role, self-protection, and last-admin protection', () => {
  assert.equal(
    canDeleteUserAccount({
      actorRole: 'admin',
      actorUserId: 'adm1',
      targetUserId: 'stu1',
      targetRole: 'student',
      adminCount: 1,
    }).allowed,
    true
  );
  assert.equal(
    canDeleteUserAccount({
      actorRole: 'teacher',
      actorUserId: 't1',
      targetUserId: 'stu1',
      targetRole: 'student',
      adminCount: 1,
    }).allowed,
    false
  );
  assert.equal(
    canDeleteUserAccount({
      actorRole: 'admin',
      actorUserId: 'adm1',
      targetUserId: 'adm1',
      targetRole: 'admin',
      adminCount: 2,
    }).allowed,
    false
  );
  assert.equal(
    canDeleteUserAccount({
      actorRole: 'admin',
      actorUserId: 'adm2',
      targetUserId: 'adm1',
      targetRole: 'admin',
      adminCount: 1,
    }).allowed,
    false
  );
  assert.equal(
    canDeleteUserAccount({
      actorRole: 'student',
      actorUserId: 'stu1',
      targetUserId: 'stu1',
      targetRole: 'student',
      adminCount: 1,
    }).allowed,
    true
  );
});

test('filterStudentRecords filters by academicYear, yearLevel, and searchQuery', () => {
  const baseBasic = createEmptyBasicInfo('a@g.cmru.ac.th', 'สมชาย รักเรียน', '670001');
  baseBasic.academicYear = '2569';
  baseBasic.yearLevel = 'ปี 1';

  const baseBasic2 = createEmptyBasicInfo('b@g.cmru.ac.th', 'สมหญิง ตั้งใจ', '660002');
  baseBasic2.academicYear = '2570';
  baseBasic2.yearLevel = 'ปี 2';

  const sample: StudentFullRecord[] = [
    {
      user: {
        id: 'u1',
        role: 'student',
        username: 'a@g.cmru.ac.th',
        email: 'a@g.cmru.ac.th',
        fullName: 'สมชาย รักเรียน',
        studentId: '670001',
        authProvider: 'google_cmru',
        hasPassword: true,
        createdAt: '',
      },
      basicInfo: baseBasic,
      application: null,
      grades: [],
      volunteers: [],
    },
    {
      user: {
        id: 'u2',
        role: 'student',
        username: 'b@g.cmru.ac.th',
        email: 'b@g.cmru.ac.th',
        fullName: 'สมหญิง ตั้งใจ',
        studentId: '660002',
        authProvider: 'google_cmru',
        hasPassword: true,
        createdAt: '',
      },
      basicInfo: baseBasic2,
      application: null,
      grades: [],
      volunteers: [],
    },
  ];

  assert.equal(filterStudentRecords(sample, { academicYear: '2569', yearLevel: 'all' }).length, 1);
  assert.equal(filterStudentRecords(sample, { academicYear: 'all', yearLevel: 'ปี 2' }).length, 1);
  assert.equal(
    filterStudentRecords(sample, { academicYear: 'all', yearLevel: 'all', searchQuery: '660002' }).length,
    1
  );
});

test('buildPublicOverviewStats computes aggregated KPI metrics and year-level buckets cleanly', () => {
  const b1 = createEmptyBasicInfo('a@g.cmru.ac.th', 'นักศึกษา 1', '670001');
  b1.academicYear = '2569';
  b1.yearLevel = 'ปี 1';
  b1.gpax = '3.50';
  b1.hasStudentLoan = 'กู้';

  const b2 = createEmptyBasicInfo('b@g.cmru.ac.th', 'นักศึกษา 2', '660002');
  b2.academicYear = '2569';
  b2.yearLevel = 'ปี 2';
  b2.gpax = '3.80';
  b2.hasStudentLoan = 'ไม่กู้';

  const sample: StudentFullRecord[] = [
    {
      user: {
        id: 'u1',
        role: 'student',
        username: 'a@g.cmru.ac.th',
        fullName: 'นักศึกษา 1',
        authProvider: 'google_cmru',
        hasPassword: true,
        createdAt: '',
      },
      basicInfo: b1,
      application: {
        ...prefillApplicationFromBasicInfo(b1, null, 'u1'),
        status: 'approved',
      },
      grades: [],
      volunteers: [],
    },
    {
      user: {
        id: 'u2',
        role: 'student',
        username: 'b@g.cmru.ac.th',
        fullName: 'นักศึกษา 2',
        authProvider: 'google_cmru',
        hasPassword: true,
        createdAt: '',
      },
      basicInfo: b2,
      application: {
        ...prefillApplicationFromBasicInfo(b2, null, 'u2'),
        status: 'submitted',
      },
      grades: [],
      volunteers: [],
    },
  ];

  const allStats = buildPublicOverviewStats(sample, '2569', 'all');
  assert.equal(allStats.filteredTotal, 2);
  assert.equal(allStats.approvedCount, 1);
  assert.equal(allStats.pendingCount, 1);
  assert.equal(allStats.loanCount, 1);
  assert.equal(allStats.averageGpax, '3.65');

  const y2Stats = buildPublicOverviewStats(sample, '2569', 'ปี 2');
  assert.equal(y2Stats.filteredTotal, 1);
  assert.equal(y2Stats.pendingCount, 1);
  assert.equal(y2Stats.approvedCount, 0);
});

test('parseExcelStudentRows parses Thai/English columns without requiring email and catches invalid rows', () => {
  const parsed = parseExcelStudentRows([
    {
      รหัสนักศึกษา: '67110501',
      'ชื่อ-นามสกุล': 'นางสาวมานี มีนา',
      ปีการศึกษา: '2569',
      ชั้นปี: '2',
      GPAX: '3.75',
      เบอร์โทรศัพท์: '081-111-2222',
      กยศ: 'กู้',
    },
    {
      studentId: '68110502',
      fullName: 'นายปิติ รักดี',
      email: '68110502@gmail.com',
    },
    {
      รหัสนักศึกษา: '67110501',
      'ชื่อ-นามสกุล': 'ซ้ำรหัสเดิม',
    },
    {
      รหัสนักศึกษา: '67110503',
      'ชื่อ-นามสกุล': 'นางสาวชูใจ ใจงาม',
      ชั้นปี: 'ปี 3',
      GPAX: '4.80',
    },
  ]);

  assert.equal(parsed.validRows.length, 2);
  assert.equal(parsed.validRows[0].email, undefined);
  assert.equal(parsed.validRows[0].yearLevel, 'ปี 2');
  assert.equal(parsed.validRows[0].gpax, '3.75');
  assert.equal(parsed.validRows[0].hasStudentLoan, 'กู้');
  assert.equal(parsed.validRows[1].email, '68110502@gmail.com');
  assert.equal(parsed.errors.length, 2);
});

test('sanitizeCsvCell neutralizes spreadsheet formula prefixes without altering normal hyphens', () => {
  assert.equal(sanitizeCsvCell('=CMD()'), `"'=CMD()"`);
  assert.equal(sanitizeCsvCell('+123'), `"'+123"`);
  assert.equal(sanitizeCsvCell('-'), `"-"`);
  assert.equal(sanitizeCsvCell('3.65'), `"3.65"`);
});

function makeConfirmedStudent(
  id: string,
  studentId: string,
  fullName: string,
  scholarships: { name: string; provider?: string }[],
  opts?: { isDraft?: boolean; pdpaConsented?: boolean; hasOtherScholarship?: 'ได้รับทุน' | 'ไม่ได้รับทุน' }
): StudentFullRecord {
  const basic = createEmptyBasicInfo('', fullName, studentId);
  basic.pdpaConsented = opts?.pdpaConsented ?? true;
  basic.isDraft = opts?.isDraft ?? false;
  basic.savedAt = basic.isDraft ? undefined : '2026-06-01T00:00:00.000Z';
  basic.hasOtherScholarship = opts?.hasOtherScholarship ?? 'ได้รับทุน';
  basic.receivedScholarships = scholarships.map((s, idx) => ({
    id: `sch_${id}_${idx}`,
    name: s.name,
    provider: s.provider,
  }));
  basic.otherScholarshipDetail = scholarships.map((s) => s.name).join(', ');
  return {
    user: {
      id,
      role: 'student',
      username: studentId.toLowerCase(),
      fullName,
      studentId,
      authProvider: 'student_id',
      hasPassword: false,
      createdAt: '2026-06-01T00:00:00.000Z',
    },
    basicInfo: basic,
    application: null,
    grades: [],
    volunteers: [],
  };
}

test('normalizeScholarshipName and sanitizeReceivedScholarships collapse spacing and prevent per-student duplicates', () => {
  assert.equal(normalizeScholarshipName('   ทุน   CYF  '), 'ทุน CYF');
  const cleaned = sanitizeReceivedScholarships([
    { id: '1', name: '  ทุน   CYF ' },
    { id: '2', name: 'ทุน cyf' },
    { id: '3', name: '   ' },
    { id: '4', name: 'ทุน กยศ. พิเศษ', provider: ' กยศ. ' },
  ]);
  assert.equal(cleaned.length, 2);
  assert.equal(cleaned[0].name, 'ทุน CYF');
  assert.equal(cleaned[1].name, 'ทุน กยศ. พิเศษ');
  assert.equal(cleaned[1].provider, 'กยศ.');
});

test('extractConfirmedReceivedScholarships excludes drafts, non-consented, and non-recipients', () => {
  const draft = makeConfirmedStudent('u_d', '670099', 'นักศึกษา ร่าง', [{ name: 'ทุนลับ' }], {
    isDraft: true,
  });
  assert.equal(extractConfirmedReceivedScholarships(draft.basicInfo).length, 0);

  const noPdpa = makeConfirmedStudent('u_p', '670098', 'นักศึกษา ไม่ยินยอม', [{ name: 'ทุนลับ' }], {
    pdpaConsented: false,
  });
  assert.equal(extractConfirmedReceivedScholarships(noPdpa.basicInfo).length, 0);

  const none = makeConfirmedStudent('u_n', '670097', 'นักศึกษา ไม่รับทุน', [{ name: 'ทุนเก่า' }], {
    hasOtherScholarship: 'ไม่ได้รับทุน',
  });
  assert.equal(extractConfirmedReceivedScholarships(none.basicInfo).length, 0);
});

test('buildScholarshipRecipientsSummary groups นาย ก.-จ. accurately with unique recipient counts and multi-scholarship mapping', () => {
  const records: StudentFullRecord[] = [
    makeConfirmedStudent('u1', '670001', 'นาย ก.', [{ name: 'ทุน CYF', provider: 'CYF' }]),
    makeConfirmedStudent('u2', '670002', 'นาย ข.', [{ name: '  ทุน  cyf ' }]),
    makeConfirmedStudent('u3', '670003', 'นาย ค.', [{ name: 'ทุนผู้ช่วยศาสตราจารย์ ดร. กิตติกร' }]),
    makeConfirmedStudent('u4', '670004', 'นาย ง.', [
      { name: 'ทุน CYF' },
      { name: 'ทุน CYF' }, // accidental duplicate on same student must count once
      { name: 'ทุนผู้ช่วยศาสตราจารย์ ดร. กิตติกร' },
    ]),
    makeConfirmedStudent('u5', '670005', 'นาย จ.', [{ name: 'ทุนมหาวิทยาลัยราชภัฏเชียงใหม่' }]),
    // Unconfirmed draft student must be excluded
    makeConfirmedStudent('u6', '670006', 'นาย ฉ. (ร่าง)', [{ name: 'ทุน CYF' }, { name: 'ทุนฉบับร่าง' }], {
      isDraft: true,
    }),
  ];

  const overview = buildPublicOverviewStats(records, 'all', 'all');
  const summary = overview.scholarshipSummary;

  assert.equal(summary.length, 3);
  assert.equal(summary[0].scholarshipName, 'ทุน CYF');
  assert.equal(summary[0].recipientCount, 3);
  assert.deepEqual(
    summary[0].recipients.map((r) => r.fullName),
    ['นาย ก.', 'นาย ข.', 'นาย ง.']
  );

  assert.equal(summary[1].scholarshipName, 'ทุนผู้ช่วยศาสตราจารย์ ดร. กิตติกร');
  assert.equal(summary[1].recipientCount, 2);
  assert.deepEqual(
    summary[1].recipients.map((r) => r.fullName),
    ['นาย ค.', 'นาย ง.']
  );

  assert.equal(summary[2].scholarshipName, 'ทุนมหาวิทยาลัยราชภัฏเชียงใหม่');
  assert.equal(summary[2].recipientCount, 1);
  assert.deepEqual(
    summary[2].recipients.map((r) => r.fullName),
    ['นาย จ.']
  );

  // Confirm live recalculation when นาย ง. removes ทุน CYF
  const updatedRecords = records.map((r) =>
    r.user.id === 'u4'
      ? makeConfirmedStudent('u4', '670004', 'นาย ง.', [
          { name: 'ทุนผู้ช่วยศาสตราจารย์ ดร. กิตติกร' },
        ])
      : r
  );
  const updatedSummary = buildScholarshipRecipientsSummary(updatedRecords);
  const cyfAfterEdit = updatedSummary.find((s) => s.scholarshipName === 'ทุน CYF');
  assert.equal(cyfAfterEdit?.recipientCount, 2);
  assert.deepEqual(
    cyfAfterEdit?.recipients.map((r) => r.fullName),
    ['นาย ก.', 'นาย ข.']
  );
});

test('buildDefaultStudentPassword returns the 8-digit studentId itself as default password', () => {
  assert.equal(buildDefaultStudentPassword('69000001'), '69000001');
  assert.equal(buildDefaultStudentPassword('  69000002  '), '69000002');
  assert.equal(buildDefaultStudentPassword(''), '');
  assert.equal(buildDefaultStudentPassword('1234'), '');
  assert.equal(buildDefaultStudentPassword('6900000a'), '');
});

test('evaluatePasswordStrength and validateStrongPassword enforce >= 10 chars, upper, lower, and digit', () => {
  assert.equal(evaluatePasswordStrength('Abcdef123').valid, false); // 9 chars
  assert.equal(validateStrongPassword('Abcdef123').valid, false);

  assert.equal(evaluatePasswordStrength('abcdef1234').hasUpper, false); // no uppercase
  assert.equal(validateStrongPassword('abcdef1234').valid, false);

  assert.equal(evaluatePasswordStrength('ABCDEF1234').hasLower, false); // no lowercase
  assert.equal(validateStrongPassword('ABCDEF1234').valid, false);

  assert.equal(evaluatePasswordStrength('Abcdefghij').hasDigit, false); // no digit
  assert.equal(validateStrongPassword('Abcdefghij').valid, false);

  const strong = evaluatePasswordStrength('CmruPass2026');
  assert.equal(strong.minLength, true);
  assert.equal(strong.hasUpper, true);
  assert.equal(strong.hasLower, true);
  assert.equal(strong.hasDigit, true);
  assert.equal(strong.valid, true);
  assert.equal(validateStrongPassword('CmruPass2026').valid, true);
});

test('validatePasswordChangePayload rejects same password, mismatches, and missing current password', () => {
  assert.equal(
    validatePasswordChangePayload({
      currentPassword: '',
      newPassword: 'CmruPass2026',
      confirmPassword: 'CmruPass2026',
    }).valid,
    false
  );

  assert.equal(
    validatePasswordChangePayload({
      currentPassword: 'CmruPass2026',
      newPassword: 'CmruPass2026',
      confirmPassword: 'CmruPass2026',
    }).valid,
    false
  );

  assert.equal(
    validatePasswordChangePayload({
      currentPassword: '69000001',
      newPassword: 'CmruPass2026',
      confirmPassword: 'CmruPass2027',
    }).valid,
    false
  );

  assert.equal(
    validatePasswordChangePayload({
      currentPassword: '69000001',
      newPassword: 'CmruPass2026',
      confirmPassword: 'CmruPass2026',
    }).valid,
    true
  );
});

test('evaluateLoginAttemptStatus and recordFailedAttemptState lock after 5 failures and unlock after duration', () => {
  const baseNow = Date.parse('2026-11-21T00:00:00.000Z');
  let attempts = 0;
  let lockedUntil: string | undefined;

  for (let i = 1; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
    const next = recordFailedAttemptState({
      failedLoginAttempts: attempts,
      lockedUntil,
      nowMs: baseNow + i * 1000,
    });
    attempts = next.failedLoginAttempts;
    lockedUntil = next.lockedUntil;
    assert.equal(next.isNowLocked, false);
    assert.equal(next.remainingAttempts, MAX_FAILED_LOGIN_ATTEMPTS - i);
  }

  // 5th failure triggers lockout
  const fifth = recordFailedAttemptState({
    failedLoginAttempts: attempts,
    lockedUntil,
    nowMs: baseNow + 5000,
  });
  assert.equal(fifth.isNowLocked, true);
  assert.ok(fifth.lockedUntil);
  assert.equal(fifth.remainingAttempts, 0);

  // Immediately locked
  const duringLock = evaluateLoginAttemptStatus({
    failedLoginAttempts: fifth.failedLoginAttempts,
    lockedUntil: fifth.lockedUntil,
    nowMs: baseNow + 10_000,
  });
  assert.equal(duringLock.isLocked, true);
  assert.ok(duringLock.remainingMs > 0);
  assert.ok(duringLock.errorMessage?.includes('ระงับชั่วคราว'));

  // After lockout duration expires
  const afterExpiry = evaluateLoginAttemptStatus({
    failedLoginAttempts: fifth.failedLoginAttempts,
    lockedUntil: fifth.lockedUntil,
    nowMs: baseNow + 5000 + LOGIN_LOCKOUT_DURATION_MS + 1000,
  });
  assert.equal(afterExpiry.isLocked, false);
  assert.equal(afterExpiry.activeFailedAttempts, 0);
  assert.equal(afterExpiry.remainingAttempts, MAX_FAILED_LOGIN_ATTEMPTS);
});

test('validateAdminSetupPayload enforces username format, password strength (>= 8 chars, letter+digit), and confirmation match', () => {
  assert.equal(evaluateAdminSetupPassword('1234').valid, false);
  assert.equal(evaluateAdminSetupPassword('abcdefgh').valid, false);
  assert.equal(evaluateAdminSetupPassword('admin123').valid, true);

  assert.equal(
    validateAdminSetupPayload({
      fullName: 'แอดมิน',
      username: 'ad',
      password: 'admin1234',
      confirmPassword: 'admin1234',
    }).valid,
    false
  );

  assert.equal(
    validateAdminSetupPayload({
      fullName: 'เจ้าหน้าที่งานทุน',
      username: 'admin_cmru',
      password: 'admin1234',
      confirmPassword: 'admin1235',
    }).valid,
    false
  );

  const ok = validateAdminSetupPayload({
    fullName: '  เจ้าหน้าที่งานทุนการศึกษา ',
    username: ' Admin_CMRU ',
    password: 'Admin2026',
    confirmPassword: 'Admin2026',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.normalizedUsername, 'admin_cmru');
  assert.equal(ok.normalizedFullName, 'เจ้าหน้าที่งานทุนการศึกษา');
});

test('pdfHelpers build sanitized filenames and accurate A4 pagination slices', () => {
  assert.equal(sanitizePdfFilenamePart('6900/0001 '), '6900-0001');
  assert.equal(
    buildStudentProfilePdfFilename('69000001', '2569'),
    'edu-social-care-profile-69000001-2569.pdf'
  );
  assert.equal(
    buildSummaryReportPdfFilename('all', 'all'),
    'edu-social-care-report-all-years.pdf'
  );
  assert.equal(
    buildSummaryReportPdfFilename('2569', 'ปี 2'),
    'edu-social-care-report-2569-y2.pdf'
  );

  const singlePage = computePdfPaginationSlices({
    canvasWidth: 1900,
    canvasHeight: 2000,
  });
  assert.equal(singlePage.length, 1);
  assert.equal(singlePage[0].sourceY, 0);
  assert.equal(singlePage[0].destHeightMm, 200);

  const multiPage = computePdfPaginationSlices({
    canvasWidth: 1900,
    canvasHeight: 6000,
  });
  assert.equal(multiPage.length, 3);
  assert.equal(multiPage[0].sourceHeight, 2770);
  assert.equal(multiPage[1].sourceY, 2770);
  assert.equal(multiPage[2].sourceY, 5540);
  assert.equal(multiPage[2].sourceHeight, 460);

  // Landscape A4 + Fit All Columns helpers
  const portraitDims = getA4PageDimensionsMm('portrait', 10);
  assert.equal(portraitDims.pageWidthMm, 210);
  assert.equal(portraitDims.pageHeightMm, 297);
  assert.equal(portraitDims.contentWidthMm, 190);
  assert.equal(portraitDims.contentHeightMm, 277);

  const landscapeDims = getA4PageDimensionsMm('landscape', 10);
  assert.equal(landscapeDims.pageWidthMm, 297);
  assert.equal(landscapeDims.pageHeightMm, 210);
  assert.equal(landscapeDims.contentWidthMm, 277);
  assert.equal(landscapeDims.contentHeightMm, 190);

  // Fitting 2770px table canvas onto A4 landscape (277mm wide => 10px/mm, 190mm height => 1900px/page)
  const landscapeSlices = computePdfPaginationSlices({
    canvasWidth: 2770,
    canvasHeight: 2500,
    orientation: 'landscape',
    marginMm: 10,
  });
  assert.equal(landscapeSlices.length, 2);
  assert.equal(landscapeSlices[0].sourceHeight, 1900);
  assert.equal(landscapeSlices[1].sourceHeight, 600);
  assert.equal(landscapeSlices[1].destHeightMm, 60);

  assert.equal(computeFitAllColumnsScale(800, 1000), 1);
  assert.equal(computeFitAllColumnsScale(2000, 1000), 0.5);
  assert.equal(computeFitAllColumnsScale(5000, 1000), 0.45);
});

test('securityGuard enforces rate limits, bounded memory, upload magic-byte verification, and payload clamping', () => {
  const limiter = new FixedWindowRateLimiter({
    maxRequests: 2,
    windowMs: 10_000,
    maxTrackedKeys: 100,
  });
  const t0 = 1_000_000;
  assert.equal(limiter.consume('ip1', t0).allowed, true);
  assert.equal(limiter.consume('ip1', t0 + 100).allowed, true);
  const blocked = limiter.consume('ip1', t0 + 200);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  assert.equal(limiter.consume('ip1', t0 + 10_001).allowed, true);

  const bounded = new BoundedMap<string, number>(50);
  for (let i = 0; i < 65; i += 1) {
    bounded.set(`k${i}`, i);
  }
  assert.equal(bounded.size, 50);
  assert.equal(bounded.get('k0'), undefined);
  assert.equal(bounded.get('k64'), 64);

  const validPng = validateUploadedBinary({
    name: 'photo.png',
    mimeType: 'image/png',
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  });
  assert.equal(validPng.valid, true);
  assert.equal(validPng.canonicalExt, '.png');

  const validPdf = validateUploadedBinary({
    name: 'grade.pdf',
    mimeType: 'application/pdf',
    bytes: new TextEncoder().encode('%PDF-1.7 test'),
  });
  assert.equal(validPdf.valid, true);
  assert.equal(validPdf.canonicalExt, '.pdf');

  // Spoofed XSS script disguised as JPEG must be rejected
  const spoofedHtml = validateUploadedBinary({
    name: 'evil.jpg',
    mimeType: 'image/jpeg',
    bytes: new TextEncoder().encode('<script>alert(1)</script>'),
  });
  assert.equal(spoofedHtml.valid, false);

  // Oversized buffer rejected
  const tooLarge = validateUploadedBinary({
    name: 'huge.pdf',
    mimeType: 'application/pdf',
    bytes: new TextEncoder().encode('%PDF-1.4'),
    maxBytes: 4,
  });
  assert.equal(tooLarge.valid, false);

  assert.equal(clampPayloadText('abc\u0000def', 10), 'abcdef');
  assert.equal(clampPayloadText('123456', 4), '1234');
  assert.equal(isSafeUploadFilename('1730000_abcd1234.png'), true);
  assert.equal(isSafeUploadFilename('../etc/passwd'), false);
});

test('resolveAdvisorDisplayName prioritizes explicit reviewer, active teacher, then registered teacher names', () => {
  assert.equal(
    resolveAdvisorDisplayName({
      reviewedBy: 'ผศ.ดร.วิชัย รักสอน',
      currentUserRole: 'teacher',
      currentUserName: 'อ.สมชาย',
      registeredTeacherNames: ['อ.สมศรี'],
    }),
    'ผศ.ดร.วิชัย รักสอน'
  );

  assert.equal(
    resolveAdvisorDisplayName({
      reviewedBy: '',
      currentUserRole: 'teacher',
      currentUserName: 'อ.ดร.สมชาย ใจดี',
      registeredTeacherNames: ['อ.สมศรี'],
    }),
    'อ.ดร.สมชาย ใจดี'
  );

  assert.equal(
    resolveAdvisorDisplayName({
      reviewedBy: '',
      currentUserRole: 'student',
      currentUserName: 'น.ส.มานี',
      registeredTeacherNames: ['อ.ดร.สมศักดิ์ วิชาดี', 'อ.วิภา'],
    }),
    'อ.ดร.สมศักดิ์ วิชาดี'
  );

  assert.equal(
    resolveAdvisorDisplayName({
      reviewedBy: '',
      currentUserRole: 'admin',
      currentUserName: 'แอดมิน',
      registeredTeacherNames: ['อ.ดร.สมศักดิ์ วิชาดี'],
    }),
    'อ.ดร.สมศักดิ์ วิชาดี'
  );

  assert.equal(
    resolveAdvisorDisplayName({
      reviewedBy: '',
      currentUserRole: 'student',
      currentUserName: 'น.ส.มานี',
      registeredTeacherNames: [],
    }),
    ''
  );
});

test('formatStructuredAddress renders Thai address parts cleanly and falls back to free text', () => {
  assert.equal(
    formatStructuredAddress(
      {
        houseNo: '99/12 หมู่ 4',
        alleyRoad: 'ถ.ช้างเผือก',
        subDistrict: 'ช้างเผือก',
        district: 'เมืองเชียงใหม่',
        province: 'เชียงใหม่',
        postalCode: '50300',
      },
      'ที่อยู่สำรอง'
    ),
    'บ้านเลขที่ 99/12 หมู่ 4 ถ.ช้างเผือก ต.ช้างเผือก อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50300'
  );

  assert.equal(
    formatStructuredAddress(
      {
        houseNo: '',
        alleyRoad: '',
        subDistrict: '',
        district: '',
        province: '',
        postalCode: '',
      },
      '108 หมู่ 2 ต.แม่ริม อ.แม่ริม จ.เชียงใหม่'
    ),
    '108 หมู่ 2 ต.แม่ริม อ.แม่ริม จ.เชียงใหม่'
  );

  assert.equal(formatStructuredAddress(null, ''), '-');
});

test('sanitizeAppsScriptWebAppUrl and sanitizeWorkspaceConfigInput enforce strict script.google.com Web App URLs', () => {
  const validExec =
    'https://script.google.com/macros/s/AKfycbz1234567890abcdef_ABCDEF/exec?foo=bar';
  assert.equal(
    sanitizeAppsScriptWebAppUrl(validExec),
    'https://script.google.com/macros/s/AKfycbz1234567890abcdef_ABCDEF/exec'
  );

  assert.equal(sanitizeAppsScriptWebAppUrl('javascript:alert(1)'), undefined);
  assert.equal(sanitizeAppsScriptWebAppUrl('https://evil.example.com/macros/s/abc123456789/exec'), undefined);
  assert.equal(sanitizeAppsScriptWebAppUrl('http://script.google.com/macros/s/abc123456789/exec'), undefined);

  const sanitized = sanitizeWorkspaceConfigInput({
    spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    appsScriptWebAppUrl: validExec,
    appsScriptSavedAt: '2026-11-26T00:00:00.000Z',
  });
  assert.equal(
    sanitized.appsScriptWebAppUrl,
    'https://script.google.com/macros/s/AKfycbz1234567890abcdef_ABCDEF/exec'
  );
  assert.equal(sanitized.appsScriptSavedAt, '2026-11-26T00:00:00.000Z');
});

test('generateAppsScriptFiles and buildLocalAppsScriptPreviewHtml include connected IDs, sheet tabs, doGet ALLOWALL, and safe escaped JSON', () => {
  const files = generateAppsScriptFiles({
    spreadsheetId: 'SHEET_ID_1234567890',
    driveFolderId: 'FOLDER_ID_1234567890',
  });

  assert.ok(files.codeGs.includes("const SPREADSHEET_ID = 'SHEET_ID_1234567890';"));
  assert.ok(files.codeGs.includes("const DRIVE_FOLDER_ID = 'FOLDER_ID_1234567890';"));
  assert.ok(files.codeGs.includes('function doGet(e)'));
  assert.ok(files.codeGs.includes('HtmlService.XFrameOptionsMode.ALLOWALL'));
  assert.ok(files.codeGs.includes('นักศึกษาและข้อมูลพื้นฐาน'));
  assert.ok(files.codeGs.includes('คำร้องขอทุนการศึกษา'));
  assert.ok(files.codeGs.includes('ผลการเรียน_GPA'));
  assert.ok(files.codeGs.includes('กิจกรรมจิตอาสา'));

  assert.ok(files.indexHtml.includes('EDU SOCIAL CARE CMRU'));
  assert.ok(files.indexHtml.includes('getDashboardData'));
  assert.equal(files.indexHtml.includes('Remaining Budget'), false);

  const basic = createEmptyBasicInfo('69000001@g.cmru.ac.th', 'นายทดสอบ <script>alert(1)</script>', '69000001');
  const previewHtml = buildLocalAppsScriptPreviewHtml(
    [
      {
        user: {
          id: 'u1',
          role: 'student',
          username: '69000001',
          fullName: basic.fullName,
          studentId: '69000001',
          authProvider: 'student_id',
          hasPassword: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        basicInfo: basic,
        application: null,
        grades: [],
        volunteers: [],
      },
    ],
    { spreadsheetId: 'SHEET_ID_1234567890' }
  );

  assert.ok(previewHtml.includes('window.__INITIAL_DATA__'));
  assert.equal(previewHtml.includes('<script>alert(1)</script>'), false);
});
