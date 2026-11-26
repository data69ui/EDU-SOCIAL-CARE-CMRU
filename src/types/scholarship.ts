export type UserRole = 'student' | 'teacher' | 'admin';

export type AcademicYear = '2569' | '2570' | '2571' | '2572' | '2573' | '2574' | '2575';
export type YearLevel = 'ปี 1' | 'ปี 2' | 'ปี 3' | 'ปี 4';
export type SemesterType = 'ภาคเรียนที่ 1' | 'ภาคเรียนที่ 2';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'reviewing'
  | 'approved'
  | 'needs_revision'
  | 'rejected';

export interface UploadedFileMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  uploadedAt: string;
  storageProvider?: 'google_drive' | 'local';
  driveFileId?: string;
  driveWebViewLink?: string;
}

export interface GoogleWorkspaceConfig {
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  spreadsheetUrl?: string;
  driveFolderId?: string;
  driveFolderName?: string;
  driveFolderUrl?: string;
  lastSyncedAt?: string;
  lastSyncedBy?: string;
}

export interface ParentInfo {
  fullName: string;
  status: 'ยังมีชีวิตอยู่' | 'ถึงแก่กรรม' | '';
  age: string;
  occupation: string;
  workplace: string;
  monthlyIncome: string;
  phone: string;
}

export interface GuardianInfo extends ParentInfo {
  relationship: string;
}

export interface ReceivedScholarshipItem {
  id: string;
  name: string;
  provider?: string;
}

export interface BasicInfoData {
  // PDPA
  pdpaConsented: boolean;
  pdpaConsentedAt?: string;
  pdpaDeclined?: boolean;
  // Photo
  profilePhoto: UploadedFileMeta | null;
  // Part 1: Education
  academicYear: AcademicYear;
  yearLevel: YearLevel;
  studentId: string;
  fullName: string;
  cohort: string;
  phone: string;
  gpax: string;
  gpaTerm1: string;
  gpaTerm2: string;
  // Part 2: Personal
  birthDate: string;
  age: string;
  nationality: string;
  ethnicity: string;
  religion: string;
  email: string;
  facebook: string;
  registeredAddress: string;
  currentAddress: string;
  monthlyAllowance: string;
  hasChronicDisease: 'ไม่มี' | 'มี';
  chronicDiseaseDetail: string;
  hasStudentLoan: 'กู้' | 'ไม่กู้';
  studentLoanYear: string;
  hasOtherScholarship: 'ได้รับทุน' | 'ไม่ได้รับทุน';
  otherScholarshipDetail: string;
  receivedScholarships?: ReceivedScholarshipItem[];
  hasPartTimeJob: 'ทำ' | 'ไม่ทำ';
  partTimeJobDetail: string;
  // Part 3: Family
  father: ParentInfo;
  mother: ParentInfo;
  parentsMaritalStatus:
    | 'อยู่ด้วยกัน'
    | 'แยกกันอยู่'
    | 'หย่าร้าง'
    | 'บิดาเสียชีวิต'
    | 'มารดาเสียชีวิต'
    | 'อื่นๆ';
  parentsMaritalStatusOther: string;
  guardian: GuardianInfo;
  familyMemberCount: string;
  livingWith: 'พ่อ' | 'แม่' | 'ปู่ ย่า ตา ยาย' | 'อื่นๆ';
  livingWithOther: string;
  // Part 4: Necessity
  necessityReason: string;
  spendingPlan: string;
  // Part 5: Documents
  housePhotos: UploadedFileMeta[];
  supportingDocs: UploadedFileMeta[];
  documentNote: string;
  // Meta
  isDraft: boolean;
  savedAt?: string;
}

export interface StructuredAddress {
  houseNo: string;
  alleyRoad: string;
  subDistrict: string;
  district: string;
  province: string;
  postalCode: string;
}

export interface ScholarshipApplicationData {
  id: string;
  studentUserId: string;
  academicYear: AcademicYear;
  yearLevel: YearLevel;
  // Part 1: Applicant personal info
  fullName: string;
  studentId: string;
  yearAndSection: string;
  gpax: string;
  birthDate: string;
  age: string;
  nationality: string;
  ethnicity: string;
  religion: string;
  phone: string;
  facebook: string;
  registeredAddress: StructuredAddress;
  currentAddress: StructuredAddress;
  financialSponsorName: string;
  financialSponsorRelation: 'บิดา' | 'มารดา' | 'ปู่ ย่า ตา ยาย' | 'อื่นๆ';
  financialSponsorRelationOther: string;
  monthlyExpenses: string;
  hasChronicDisease: 'ไม่มี' | 'มี';
  chronicDiseaseDetail: string;
  hasStudentLoan: 'กู้ กยศ.' | 'ไม่กู้ กยศ.';
  hasOtherScholarship: 'ไม่ได้รับ' | 'ได้รับ';
  otherScholarshipNameAmount: string;
  hasPartTimeJob: 'ไม่ได้ทำงาน' | 'ทำงาน';
  partTimeJobDetailIncome: string;
  // Part 2: Family & Guardian
  father: ParentInfo;
  mother: ParentInfo;
  parentsMaritalStatus: 'อยู่ด้วยกัน' | 'แยกกันอยู่ตามอาชีพ' | 'หย่า' | 'อื่นๆ';
  parentsMaritalStatusOther: string;
  guardian: GuardianInfo;
  householdMembersCount: string;
  housingStatus: 'บ้านของตนเอง' | 'บ้านเช่า' | 'อื่นๆ';
  housingStatusOther: string;
  currentlyLivingWith: string;
  // Part 3: Problems & Necessity
  financialProblemDetail: string;
  scholarshipNecessityDetail: string;
  expectedBenefitDetail: string;
  // Part 4: Photos
  indoorHousePhotos: UploadedFileMeta[];
  indoorFamilyPhotos: UploadedFileMeta[];
  outdoorHousePhotos: UploadedFileMeta[];
  outdoorFamilyPhotos: UploadedFileMeta[];
  // Workflow
  status: ApplicationStatus;
  advisorComment: string;
  reviewedBy?: string;
  reviewedAt?: string;
  submittedAt?: string;
  updatedAt: string;
}

export interface GradeRecord {
  id: string;
  studentUserId: string;
  studentId: string;
  studentName: string;
  academicYear: AcademicYear;
  yearLevel: YearLevel;
  semester: SemesterType;
  gpa: string;
  attachments: UploadedFileMeta[];
  uploadedByRole: UserRole;
  uploadedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface VolunteerRecord {
  id: string;
  studentUserId: string;
  studentId: string;
  studentName: string;
  academicYear: AcademicYear;
  activityTitle: string;
  activityDetail: string;
  learnings: string;
  hours: number;
  activityDate: string;
  dailyLifeApplication: string;
  photos: UploadedFileMeta[];
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedHours: number;
  advisorNote: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  role: UserRole;
  username: string; // studentId for student, username for teacher/admin
  email?: string;
  fullName: string;
  studentId?: string;
  authProvider: 'student_id' | 'google_cmru' | 'password';
  hasPassword: boolean;
  mustChangePassword?: boolean;
  passwordChangedAt?: string;
  failedLoginAttempts?: number;
  lockedUntil?: string;
  createdAt: string;
}

export interface StudentFullRecord {
  user: UserAccount;
  basicInfo: BasicInfoData;
  application: ScholarshipApplicationData | null;
  grades: GradeRecord[];
  volunteers: VolunteerRecord[];
}

export interface YearLevelSummaryBucket {
  yearLevel: YearLevel;
  total: number;
  approved: number;
  pending: number;
  draft: number;
  loanCount: number;
}

export interface AcademicYearCount {
  academicYear: AcademicYear;
  count: number;
}

export interface ScholarshipRecipientEntry {
  studentUserId: string;
  studentId: string;
  fullName: string;
  yearLevel: YearLevel;
  academicYear: AcademicYear;
  provider?: string;
}

export interface ScholarshipCategorySummary {
  scholarshipKey: string;
  scholarshipName: string;
  recipientCount: number;
  recipients: ScholarshipRecipientEntry[];
}

export interface PublicOverviewStats {
  totalAllStudents: number;
  filteredTotal: number;
  approvedCount: number;
  pendingCount: number;
  needsRevisionOrRejectedCount: number;
  draftOrNoAppCount: number;
  loanCount: number;
  pdpaConsentedCount: number;
  gradeRecordsCount: number;
  averageGpax: string;
  approvedVolunteerHours: number;
  pendingVolunteerHours: number;
  yearLevelCounts: { yearLevel: YearLevel; total: number }[];
  academicYearCounts: AcademicYearCount[];
  byYearLevel: YearLevelSummaryBucket[];
  scholarshipSummary: ScholarshipCategorySummary[];
}

export interface ImportedStudentRow {
  studentId: string;
  fullName: string;
  email?: string;
  academicYear: AcademicYear;
  yearLevel: YearLevel;
  gpax?: string;
  phone?: string;
  hasStudentLoan?: 'กู้' | 'ไม่กู้';
  password?: string;
}

export interface ImportStudentsResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
}
