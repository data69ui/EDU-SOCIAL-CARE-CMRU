import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  Globe,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useSaveSuccess } from '../contexts/SaveSuccessContext';
import {
  AppsScriptDashboardPayload,
  buildLocalAppsScriptPreviewHtml,
  fetchAppsScriptDashboardData,
  generateAppsScriptFiles,
} from '../services/googleAppsScriptTemplate';
import type { GoogleWorkspaceConfig, StudentFullRecord } from '../types/scholarship';
import { sanitizeAppsScriptWebAppUrl } from '../utils/securityGuard';

interface GoogleAppsScriptSectionProps {
  config: GoogleWorkspaceConfig;
  students: StudentFullRecord[];
  busy: boolean;
  onSaveConfig: (nextConfig: GoogleWorkspaceConfig) => Promise<GoogleWorkspaceConfig>;
  onStatusMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}

type DisplayMode = 'embed' | 'json' | 'preview';
type CodeTab = 'codeGs' | 'indexHtml';

export function GoogleAppsScriptSection({
  config,
  students,
  busy,
  onSaveConfig,
  onStatusMessage,
}: GoogleAppsScriptSectionProps) {
  const { showSaveSuccess } = useSaveSuccess();
  const [webAppUrlInput, setWebAppUrlInput] = useState(config.appsScriptWebAppUrl || '');
  const [savingUrl, setSavingUrl] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<CodeTab>('codeGs');
  const [displayMode, setDisplayMode] = useState<DisplayMode>(
    config.appsScriptWebAppUrl ? 'embed' : 'preview'
  );
  const [iframeKey, setIframeKey] = useState(0);

  const [livePayload, setLivePayload] = useState<AppsScriptDashboardPayload | null>(null);
  const [loadingJson, setLoadingJson] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSearch, setJsonSearch] = useState('');
  const [jsonYearFilter, setJsonYearFilter] = useState('all');

  useEffect(() => {
    setWebAppUrlInput(config.appsScriptWebAppUrl || '');
    if (config.appsScriptWebAppUrl && displayMode === 'preview') {
      setDisplayMode('embed');
    }
  }, [config.appsScriptWebAppUrl]);

  const generatedFiles = useMemo(
    () =>
      generateAppsScriptFiles({
        spreadsheetId: config.spreadsheetId,
        driveFolderId: config.driveFolderId,
      }),
    [config.spreadsheetId, config.driveFolderId]
  );

  const previewHtml = useMemo(
    () => buildLocalAppsScriptPreviewHtml(students, config),
    [students, config]
  );

  const handleLoadLiveJson = async (targetUrl?: string) => {
    const urlToUse = targetUrl || config.appsScriptWebAppUrl || webAppUrlInput;
    if (!urlToUse.trim()) {
      setJsonError('กรุณาระบุและบันทึก URL ของ Google Apps Script Web App ก่อนดึงข้อมูลสด');
      return;
    }
    setLoadingJson(true);
    setJsonError(null);
    try {
      const data = await fetchAppsScriptDashboardData(urlToUse, {
        academicYear: jsonYearFilter,
      });
      setLivePayload(data);
    } catch (err) {
      setJsonError((err as Error).message);
    } finally {
      setLoadingJson(false);
    }
  };

  useEffect(() => {
    if (displayMode === 'json' && config.appsScriptWebAppUrl && !livePayload && !loadingJson) {
      void handleLoadLiveJson(config.appsScriptWebAppUrl);
    }
  }, [displayMode, config.appsScriptWebAppUrl]);

  const handleSaveWebAppUrl = async () => {
    const safeUrl = sanitizeAppsScriptWebAppUrl(webAppUrlInput);
    if (!safeUrl) {
      onStatusMessage({
        type: 'error',
        text: 'รูปแบบลิงก์ Google Apps Script Web App ไม่ถูกต้อง (ตัวอย่าง: https://script.google.com/macros/s/.../exec)',
      });
      return;
    }
    setSavingUrl(true);
    onStatusMessage(null);
    try {
      await onSaveConfig({
        ...config,
        appsScriptWebAppUrl: safeUrl,
        appsScriptSavedAt: new Date().toISOString(),
      });
      setWebAppUrlInput(safeUrl);
      setIframeKey((k) => k + 1);
      setDisplayMode('embed');
      const msg = 'บันทึก URL Google Apps Script Web App เรียบร้อยแล้ว';
      onStatusMessage({ type: 'success', text: msg });
      showSaveSuccess(msg, 'บันทึกการเชื่อมต่อ Google Script เสร็จสิ้นแล้ว');
    } catch (err) {
      onStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingUrl(false);
    }
  };

  const handleClearWebAppUrl = async () => {
    setSavingUrl(true);
    onStatusMessage(null);
    try {
      const next = { ...config };
      delete next.appsScriptWebAppUrl;
      delete next.appsScriptSavedAt;
      await onSaveConfig(next);
      setWebAppUrlInput('');
      setLivePayload(null);
      setJsonError(null);
      setDisplayMode('preview');
      const msg = 'ล้างการเชื่อมต่อ URL Google Apps Script แล้ว';
      onStatusMessage({ type: 'success', text: msg });
      showSaveSuccess(msg, 'อัปเดตการตั้งค่าเสร็จสิ้นแล้ว');
    } catch (err) {
      onStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingUrl(false);
    }
  };

  const handleCopyCode = async (content: string, filename: string) => {
    try {
      await navigator.clipboard.writeText(content);
      const msg = `คัดลอกโค้ด ${filename} ลงคลิปบอร์ดเรียบร้อยแล้ว`;
      onStatusMessage({ type: 'success', text: msg });
      showSaveSuccess(msg, 'คัดลอกโค้ดเสร็จสิ้นแล้ว');
    } catch {
      onStatusMessage({
        type: 'error',
        text: `ไม่สามารถคัดลอกอัตโนมัติได้ กรุณากดปุ่มดาวน์โหลด ${filename} แทน`,
      });
    }
  };

  const handleDownloadCode = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showSaveSuccess(`ดาวน์โหลดไฟล์ ${filename} เรียบร้อยแล้ว`, 'ดาวน์โหลดเสร็จสิ้นแล้ว');
  };

  const filteredJsonStudents = useMemo(() => {
    if (!livePayload) return [];
    const q = jsonSearch.trim().toLowerCase();
    return livePayload.students.filter((st) => {
      if (jsonYearFilter !== 'all' && st.academicYear !== jsonYearFilter) return false;
      if (q) {
        const hay = `${st.studentId} ${st.fullName} ${st.receivedScholarships}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [livePayload, jsonSearch, jsonYearFilter]);

  const activeCodeContent =
    activeCodeTab === 'codeGs' ? generatedFiles.codeGs : generatedFiles.indexHtml;
  const activeFilename = activeCodeTab === 'codeGs' ? 'Code.gs' : 'Index.html';

  return (
    <section className="rounded-2xl border border-[#DFD1BA] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-5 surface-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE0CE] dark:border-[#343842] pb-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#7A1629]/10 dark:bg-[#3A1B23] text-[#7A1629] dark:text-[#F493A4]">
            <Globe className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-[#23181A] dark:text-[#F2EFEA]">
              3. แสดงผลผ่าน Google Apps Script (Web App)
            </h3>
            <p className="text-xs text-[#66585B] dark:text-[#A19B91]">
              เผยแพร่หน้าเว็บแสดงผลข้อมูลทุนการศึกษาจาก Google Sheets โดยตรงผ่าน Google Script และเปิดดูแบบฝังหน้าเว็บหรือดึง JSON สดได้ทันที
            </p>
          </div>
        </div>

        {config.appsScriptWebAppUrl && (
          <a
            href={config.appsScriptWebAppUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#C6922C]/60 bg-[#FAF6EE] dark:bg-[#2D2414] px-3 py-1.5 text-xs font-semibold text-[#7A1629] dark:text-[#F4D98A] hover:bg-[#EFE5D1] dark:hover:bg-[#3A2E19] transition-colors"
          >
            <span>เปิดหน้าเว็บ Google Script</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>

      {/* Web App URL Configuration */}
      <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1A1C21] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="apps-script-url-input"
            className="text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]"
          >
            ลิงก์ Google Apps Script Web App URL (/exec)
          </label>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#66585B] dark:text-[#A19B91]">
            {config.spreadsheetId ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A] dark:text-[#4ADE80]" aria-hidden="true" />
                <span>ผูก Spreadsheet ID อัตโนมัติใน Code.gs แล้ว</span>
              </>
            ) : (
              <span>ยังไม่ได้ผูก Google Sheet (ใช้ Active Spreadsheet เมื่อเปิดจาก Sheet)</span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            id="apps-script-url-input"
            type="url"
            value={webAppUrlInput}
            onChange={(e) => setWebAppUrlInput(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="flex-1 min-w-[240px] rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#22242B] px-3 py-2 text-xs text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] focus:border-[#7A1629] dark:focus:border-[#C6922C] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSaveWebAppUrl}
            disabled={busy || savingUrl || !webAppUrlInput.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#7A1629] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5E1020] transition-colors disabled:opacity-50"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{savingUrl ? 'กำลังบันทึก...' : 'บันทึก URL Web App'}</span>
          </button>
          {config.appsScriptWebAppUrl && (
            <button
              type="button"
              onClick={handleClearWebAppUrl}
              disabled={busy || savingUrl}
              className="inline-flex items-center gap-1 rounded-xl border border-[#FCA5A5] dark:border-[#7F1D1D] bg-white dark:bg-[#22242B] px-3 py-2 text-xs font-medium text-[#B91C1C] dark:text-[#FCA5A5] hover:bg-[#FEF2F2] dark:hover:bg-[#2F1519] transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ล้างลิงก์</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Display Area */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1A1C21] p-1">
            <button
              type="button"
              onClick={() => setDisplayMode('embed')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                displayMode === 'embed'
                  ? 'bg-[#7A1629] text-white'
                  : 'text-[#5A4B4E] dark:text-[#C8C2B8] hover:bg-white/70 dark:hover:bg-[#262932]'
              }`}
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span>แสดงผลหน้าเว็บ Google Script</span>
            </button>

            <button
              type="button"
              onClick={() => setDisplayMode('json')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                displayMode === 'json'
                  ? 'bg-[#7A1629] text-white'
                  : 'text-[#5A4B4E] dark:text-[#C8C2B8] hover:bg-white/70 dark:hover:bg-[#262932]'
              }`}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ดึงข้อมูลสดผ่าน Script (JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => setDisplayMode('preview')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                displayMode === 'preview'
                  ? 'bg-[#7A1629] text-white'
                  : 'text-[#5A4B4E] dark:text-[#C8C2B8] hover:bg-white/70 dark:hover:bg-[#262932]'
              }`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ตัวอย่าง Index.html ({students.length} คน)</span>
            </button>
          </div>

          {displayMode === 'embed' && config.appsScriptWebAppUrl && (
            <button
              type="button"
              onClick={() => setIframeKey((k) => k + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#1A1C21] px-3 py-1.5 text-xs font-medium text-[#5A4B4E] dark:text-[#C8C2B8] hover:bg-[#FAF6EE] dark:hover:bg-[#2D313B]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>รีโหลดหน้าต่าง Google Script</span>
            </button>
          )}
        </div>

        {/* Mode 1: Embedded Google Apps Script Web App */}
        {displayMode === 'embed' && (
          config.appsScriptWebAppUrl ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-xl border border-[#DFD1BA] dark:border-[#343842] bg-[#FAF8F5] dark:bg-[#15171C]">
                <iframe
                  key={iframeKey}
                  title="EDU SOCIAL CARE CMRU — Google Apps Script Web App"
                  src={config.appsScriptWebAppUrl}
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                  className="w-full h-[560px] border-0 bg-white dark:bg-[#15171C]"
                />
              </div>
              <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">
                หากหน้าต่างไม่แสดงผล ให้ตรวจสอบว่าใน Apps Script ได้ตั้งค่า{' '}
                <strong className="text-[#23181A] dark:text-[#F2EFEA]">ผู้มีสิทธิ์เข้าถึง: ทุกคน (Anyone)</strong>{' '}
                และใช้โค้ด <code className="font-mono">XFrameOptionsMode.ALLOWALL</code> หรือคลิก{' '}
                <a
                  href={config.appsScriptWebAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#1D4ED8] dark:text-[#60A5FA] hover:underline"
                >
                  เปิดหน้าเว็บ Google Script ในแท็บใหม่
                </a>
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-[#23181A] dark:text-[#F2EFEA]">
                ยังไม่ได้บันทึก URL ของ Google Apps Script Web App
              </p>
              <p className="text-xs text-[#66585B] dark:text-[#A19B91] max-w-xl mx-auto">
                สามารถกดแท็บ <strong className="text-[#7A1629] dark:text-[#F4D98A]">"ตัวอย่าง Index.html"</strong> เพื่อดูรูปแบบหน้าเว็บที่จะแสดงบน Google Script ได้ทันที หรือติดตั้งโค้ดด้านล่างแล้วนำ URL มาบันทึก
              </p>
            </div>
          )
        )}

        {/* Mode 2: Live JSON Data rendered in React */}
        {displayMode === 'json' && (
          <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE]/60 dark:bg-[#1A1C21] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9A8B8E]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={jsonSearch}
                    onChange={(e) => setJsonSearch(e.target.value)}
                    placeholder="ค้นหารหัสนักศึกษา / ชื่อ / ทุน..."
                    className="w-full rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#22242B] pl-8 pr-3 py-1.5 text-xs text-[#23181A] dark:text-[#F2EFEA]"
                  />
                </div>
                {livePayload?.meta?.academicYears && livePayload.meta.academicYears.length > 0 && (
                  <select
                    value={jsonYearFilter}
                    onChange={(e) => setJsonYearFilter(e.target.value)}
                    className="rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#22242B] px-3 py-1.5 text-xs text-[#23181A] dark:text-[#F2EFEA]"
                  >
                    <option value="all">ทุกปีการศึกษา</option>
                    {livePayload.meta.academicYears.map((y) => (
                      <option key={y} value={y}>
                        ปีการศึกษา {y}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleLoadLiveJson()}
                disabled={loadingJson}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#166534] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#14532D] transition-colors disabled:opacity-50"
              >
                {loadingJson ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{loadingJson ? 'กำลังดึงข้อมูล...' : 'ดึงข้อมูลสดจาก Google Script'}</span>
              </button>
            </div>

            {jsonError && (
              <div
                role="alert"
                className="rounded-xl border border-[#FCA5A5] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#2F1519] px-4 py-3 text-xs text-[#991B1B] dark:text-[#FCA5A5]"
              >
                {jsonError}
              </div>
            )}

            {livePayload ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-white dark:bg-[#22242B] p-3.5">
                    <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">นักศึกษาใน Google Sheet</p>
                    <p className="text-xl font-bold text-[#23181A] dark:text-[#F2EFEA] tabular-nums mt-0.5">
                      {livePayload.summary.totalStudents} คน
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-white dark:bg-[#22242B] p-3.5">
                    <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">อนุมัติทุนแล้ว</p>
                    <p className="text-xl font-bold text-[#15803D] dark:text-[#4ADE80] tabular-nums mt-0.5">
                      {livePayload.summary.approvedCount} คน
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-white dark:bg-[#22242B] p-3.5">
                    <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">รอพิจารณา</p>
                    <p className="text-xl font-bold text-[#B45309] dark:text-[#FBBF24] tabular-nums mt-0.5">
                      {livePayload.summary.pendingCount} รายการ
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-white dark:bg-[#22242B] p-3.5">
                    <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">กยศ. / GPAX เฉลี่ย</p>
                    <p className="text-xl font-bold text-[#7A1629] dark:text-[#F4D98A] tabular-nums mt-0.5">
                      {livePayload.summary.loanCount} คน · {livePayload.summary.averageGpax}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-white dark:bg-[#22242B]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF6EE] dark:bg-[#191B22] text-[#66585B] dark:text-[#A19B91]">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">รหัสนักศึกษา</th>
                        <th className="px-3 py-2.5 font-semibold">ชื่อ-นามสกุล</th>
                        <th className="px-3 py-2.5 font-semibold">ปีการศึกษา / ชั้นปี</th>
                        <th className="px-3 py-2.5 font-semibold">GPAX</th>
                        <th className="px-3 py-2.5 font-semibold">กยศ.</th>
                        <th className="px-3 py-2.5 font-semibold">ทุนที่ได้รับ</th>
                        <th className="px-3 py-2.5 font-semibold">สถานะคำร้อง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0E8D8] dark:divide-[#2D313B]">
                      {filteredJsonStudents.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-3 py-6 text-center text-[#66585B] dark:text-[#A19B91]"
                          >
                            ไม่พบข้อมูลนักศึกษาจาก Google Script ตามตัวกรองที่เลือก
                          </td>
                        </tr>
                      ) : (
                        filteredJsonStudents.map((st, idx) => (
                          <tr key={`${st.studentId}-${idx}`}>
                            <td className="px-3 py-2 font-semibold text-[#23181A] dark:text-[#F2EFEA] tabular-nums">
                              {st.studentId}
                            </td>
                            <td className="px-3 py-2 text-[#23181A] dark:text-[#F2EFEA]">
                              {st.fullName}
                            </td>
                            <td className="px-3 py-2 text-[#66585B] dark:text-[#A19B91]">
                              {st.academicYear} · {st.yearLevel}
                            </td>
                            <td className="px-3 py-2 font-medium text-[#23181A] dark:text-[#F2EFEA] tabular-nums">
                              {st.gpax || '-'}
                            </td>
                            <td className="px-3 py-2 text-[#23181A] dark:text-[#F2EFEA]">
                              {st.hasStudentLoan}
                            </td>
                            <td className="px-3 py-2 text-[#5A4B4E] dark:text-[#C8C2B8]">
                              {st.receivedScholarships}
                            </td>
                            <td className="px-3 py-2 font-semibold text-[#7A1629] dark:text-[#F4D98A]">
                              {st.applicationStatus}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : !loadingJson && !jsonError ? (
              <p className="text-center text-xs text-[#66585B] dark:text-[#A19B91] py-6">
                กดปุ่ม "ดึงข้อมูลสดจาก Google Script" เพื่อทดสอบและแสดงข้อมูล JSON จาก Google Sheets ผ่าน Web App
              </p>
            ) : null}
          </div>
        )}

        {/* Mode 3: Local Preview of Index.html */}
        {displayMode === 'preview' && (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-xl border border-[#DFD1BA] dark:border-[#343842] bg-[#FAF8F5] dark:bg-[#15171C]">
              <iframe
                title="ตัวอย่างหน้าเว็บ Google Apps Script (Index.html)"
                srcDoc={previewHtml}
                sandbox="allow-scripts"
                className="w-full h-[560px] border-0"
              />
            </div>
            <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">
              นี่คือตัวอย่างหน้าเว็บ <code className="font-mono">Index.html</code> ที่แสดงผลด้วยข้อมูลปัจจุบันในระบบ ({students.length} คน) เมื่อคุณนำโค้ดด้านล่างไปติดตั้งบน Google Apps Script หน้าเว็บจริงจะดึงข้อมูลจาก Google Sheet โดยอัตโนมัติ
            </p>
          </div>
        )}
      </div>

      {/* Apps Script Setup & Code Generator */}
      <div className="border-t border-[#EAE0CE] dark:border-[#343842] pt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1A1C21] p-4 space-y-2.5 text-xs">
          <div className="flex items-center gap-2 font-display text-sm font-bold text-[#7A1629] dark:text-[#F4D98A]">
            <Code2 className="h-4 w-4" aria-hidden="true" />
            <span>ขั้นตอนติดตั้ง Google Apps Script</span>
          </div>
          <ol className="list-decimal pl-4 space-y-1.5 text-[#5A4B4E] dark:text-[#C8C2B8]">
            <li>
              ซิงก์ข้อมูลลง Google Sheet ในการ์ดที่ 1 ให้เรียบร้อย แล้วเปิด Google Sheet นั้น
            </li>
            <li>
              ไปที่เมนู <strong className="text-[#23181A] dark:text-[#F2EFEA]">ส่วนขยาย (Extensions) &gt; Apps Script</strong>
            </li>
            <li>
              คัดลอกโค้ด <strong className="text-[#23181A] dark:text-[#F2EFEA]">Code.gs</strong> ไปวางทับไฟล์เดิม
            </li>
            <li>
              กดเครื่องหมาย <strong>+</strong> ข้างเมนูไฟล์ &gt; เลือก <strong>HTML</strong> ตั้งชื่อว่า{' '}
              <code className="font-mono font-bold">Index</code> แล้ววางโค้ด <strong className="text-[#23181A] dark:text-[#F2EFEA]">Index.html</strong>
            </li>
            <li>
              กด <strong>ทำให้ใช้งานได้ (Deploy) &gt; การทำให้ใช้งานได้รายการใหม่</strong> เลือกประเภท{' '}
              <strong>เว็บแอป</strong> และตั้งผู้มีสิทธิ์เข้าถึงเป็น <strong>ทุกคน (Anyone)</strong>
            </li>
            <li>
              นำลิงก์ Web App (<code className="font-mono">/exec</code>) มาวางในช่องด้านบนแล้วกดบันทึก
            </li>
          </ol>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1A1C21] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-[#DFD1BA] dark:border-[#343842] bg-white dark:bg-[#22242B] p-1">
              <button
                type="button"
                onClick={() => setActiveCodeTab('codeGs')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  activeCodeTab === 'codeGs'
                    ? 'bg-[#7A1629] text-white'
                    : 'text-[#5A4B4E] dark:text-[#C8C2B8] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]'
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Code.gs</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveCodeTab('indexHtml')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  activeCodeTab === 'indexHtml'
                    ? 'bg-[#7A1629] text-white'
                    : 'text-[#5A4B4E] dark:text-[#C8C2B8] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]'
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Index.html</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleCopyCode(activeCodeContent, activeFilename)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#7A1629] dark:border-[#C6922C]/70 bg-white dark:bg-[#22242B] px-3 py-1.5 text-xs font-semibold text-[#7A1629] dark:text-[#F4D98A] hover:bg-[#FAF6EE] dark:hover:bg-[#2D313B]"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>คัดลอก {activeFilename}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDownloadCode(
                    activeCodeContent,
                    activeFilename,
                    activeCodeTab === 'codeGs' ? 'text/plain' : 'text/html'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#166534] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#14532D]"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>ดาวน์โหลด {activeFilename}</span>
              </button>
            </div>
          </div>

          <pre className="max-h-60 overflow-auto rounded-xl border border-[#D8CBB8] dark:border-[#343842] bg-[#1D1F27] p-3 text-[11px] leading-relaxed text-[#E6EDF3] font-mono">
            <code>{activeCodeContent}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
