-- EDU SOCIAL CARE CMRU — Cloudflare D1 Initial Relational Schema
-- Clean initial state: zero pre-seeded users or test records

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
  username TEXT NOT NULL,
  email TEXT,
  full_name TEXT NOT NULL,
  student_id TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'password',
  has_password INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  password_changed_at TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  password_hash TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(role, username)
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS basic_infos (
  student_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  year_level TEXT NOT NULL,
  student_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  gpax TEXT NOT NULL DEFAULT '',
  has_student_loan TEXT NOT NULL DEFAULT 'ไม่กู้',
  has_other_scholarship TEXT NOT NULL DEFAULT 'ไม่ได้รับทุน',
  other_scholarship_detail TEXT NOT NULL DEFAULT '',
  received_scholarships_json TEXT NOT NULL DEFAULT '[]',
  pdpa_consented INTEGER NOT NULL DEFAULT 0,
  pdpa_declined INTEGER NOT NULL DEFAULT 0,
  pdpa_consented_at TEXT,
  saved_at TEXT,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  academic_year TEXT NOT NULL,
  year_level TEXT NOT NULL,
  gpax TEXT NOT NULL DEFAULT '',
  advisor_comment TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TEXT,
  submitted_at TEXT,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grades (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  year_level TEXT NOT NULL,
  semester TEXT NOT NULL,
  gpa TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  uploaded_by_role TEXT NOT NULL,
  uploaded_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(student_user_id, academic_year, year_level, semester)
);

CREATE INDEX IF NOT EXISTS idx_grades_student_user ON grades(student_user_id);

CREATE TABLE IF NOT EXISTS volunteers (
  id TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  activity_title TEXT NOT NULL,
  activity_detail TEXT NOT NULL DEFAULT '',
  learnings TEXT NOT NULL DEFAULT '',
  hours REAL NOT NULL DEFAULT 0,
  activity_date TEXT NOT NULL,
  daily_life_application TEXT NOT NULL DEFAULT '',
  photos_json TEXT NOT NULL DEFAULT '[]',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_hours REAL NOT NULL DEFAULT 0,
  advisor_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_volunteers_student_user ON volunteers(student_user_id);
