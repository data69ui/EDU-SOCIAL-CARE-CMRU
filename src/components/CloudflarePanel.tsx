import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  ExternalLink,
  HardDrive,
  Link2,
  Loader2,
  RefreshCw,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useSaveSuccess } from '../contexts/SaveSuccessContext';
import { api } from '../services/api';
import type {
  CloudflareRuntimeStatus,
  CloudflareTestResult,
  GoogleWorkspaceConfig,
} from '../types/scholarship';
import { sanitizeCloudflareWorkerUrl } from '../utils/securityGuard';

interface CloudflarePanelProps {
  config: GoogleWorkspaceConfig;
  isAdmin: boolean;
  busy: boolean;
  onSaveConfig: (nextConfig: GoogleWorkspaceConfig) => Promise<GoogleWorkspaceConfig>;
  onSyncedData?: () => Promise<void> | void;
  onStatusMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}

const DEFAULT_DB_NAME = 'cmru-edu-social-care-db';
const DEFAULT_BUCKET_NAME = 'cmru-edu-social-care-files';

export function CloudflarePanel({
  config,
  isAdmin,
  busy,
  onSaveConfig,
  onSyncedData,
  onStatusMessage,
}: CloudflarePanelProps) {
  const { showSaveSuccess } = useSaveSuccess();
  const [runtimeStatus, setRuntimeStatus] = useState<CloudflareRuntimeStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [workerUrlInput, setWorkerUrlInput] = useState(config.cloudflareWorkerUrl || '');
  const [dbNameInput, setDbNameInput] = useState(config.cloudflareDatabaseName || DEFAULT_DB_NAME);
  const [bucketNameInput, setBucketNameInput] = useState(
    config.cloudflareBucketName || DEFAULT_BUCKET_NAME
  );

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<CloudflareTestResult | null>(null);

  const [syncDirection, setSyncDirection] = useState<'push' | 'pull'>('push');
  const [cfAdminUser, setCfAdminUser] = useState('');
  const [cfAdminPass, setCfAdminPass] = useState('');
  const [syncing, setSyncing] = useState(false);

  const loadRuntimeStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await api.getCloudflareStatus();
      setRuntimeStatus(res.status);
    } catch {
      // Keep existing state silently
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadRuntimeStatus();
  }, []);

  useEffect(() => {
    setWorkerUrlInput(config.cloudflareWorkerUrl || '');
    setDbNameInput(config.cloudflareDatabaseName || DEFAULT_DB_NAME);
    setBucketNameInput(config.cloudflareBucketName || DEFAULT_BUCKET_NAME);
  }, [config.cloudflareWorkerUrl, config.cloudflareDatabaseName, config.cloudflareBucketName]);

  const handleTestConnection = async () => {
    const cleanUrl = sanitizeCloudflareWorkerUrl(workerUrlInput);
    if (!cleanUrl) {
      onStatusMessage({
        type: 'error',
        text: 'URL ของ Cloudflare Worker ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https:// เช่น https://cmru-edu-social-care.xxx.workers.dev)',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    onStatusMessage(null);
    try {
      const res = await api.testCloudflareConnection(cleanUrl);
      setTestResult(res.result);
      const msg = `เชื่อมต่อ Cloudflare Worker สำเร็จ (${res.result.latencyMs} ms · D1: ${
        res.result.d1Connected ? 'พร้อมใช้งาน' : 'ยังไม่เชื่อมต่อ'
      } · R2: ${res.result.r2Bound ? 'พร้อมใช้งาน' : 'ยังไม่ผูก Bucket'})`;
      onStatusMessage({ type: 'success', text: msg });
      showSaveSuccess(msg, 'ตรวจสอบการเชื่อมต่อ Cloudflare เสร็จสิ้นแล้ว');
    } catch (err) {
      onStatusMessage({
        type: 'error',
        text: (err as Error).message || 'ไม่สามารถเชื่อมต่อ Cloudflare Worker ได้',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveCloudflareConfig = async () => {
    const cleanUrl = sanitizeCloudflareWorkerUrl(workerUrlInput);
    if (!cleanUrl) {
      onStatusMessage({
        type: 'error',
        text: 'URL ของ Cloudflare Worker ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https:// และไม่ใช่ localhost/IP ภายใน)',
      });
      return;
    }

    setSaving(true);
    onStatusMessage(null);
    try {
      const nowIso = new Date().toISOString();
      await onSaveConfig({
        ...config,
        cloudflareWorkerUrl: cleanUrl,
        cloudflareDatabaseName: dbNameInput.trim() || DEFAULT_DB_NAME,
        cloudflareBucketName: bucketNameInput.trim() || DEFAULT_BUCKET_NAME,
        cloudflareConnectedAt: config.cloudflareConnectedAt || nowIso,
      });
      setWorkerUrlInput(cleanUrl);
      await loadRuntimeStatus();
      const msg = `บันทึกการเชื่อมต่อ Cloudflare (${cleanUrl}) เรียบร้อยแล้ว`;
      onStatusMessage({ type: 'success', text: msg });
      showSaveSuccess(msg, 'บันทึกการเชื่อมต่อ Cloudflare เสร็จสิ้นแล้ว');
    } catch (err) {
      onStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectCloudflare = async () => {
    setSaving(true);
    onStatusMessage(null);
    try {
      const next = { ...config };
      delete next.cloudflareWorkerUrl;
      delete next.cloudflareConnectedAt;
      delete next.cloudflareLastSyncedAt;
      delete next.cloudflareLastSyncedBy;
      await onSaveConfig(next);
      setWorkerUrlInput('');
      setTestResult(null);
      await loadRuntimeStatus();
      const msg = 'ยกเลิกการเชื่อมต่อปลายทาง Cloudflare Worker แล้ว';
      onStatusMessage({ type: 'success', text: msg });
      showSaveSuccess(msg, 'อัปเดตการตั้งค่าเสร็จสิ้นแล้ว');
    } catch (err) {
      onStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncCloudflare = async () => {
    const cleanUrl = sanitizeCloudflareWorkerUrl(workerUrlInput || config.cloudflareWorkerUrl);
    if (!cleanUrl) {
      onStatusMessage({ type: 'error', text: 'กรุณาระบุ URL ของ Cloudflare Worker ก่อนซิงก์ข้อมูล' });
      return;
    }
    if (!cfAdminUser.trim() || !cfAdminPass) {
      onStatusMessage({
        type: 'error',
        text: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านผู้ดูแลระบบของ Cloudflare Worker เพื่อยืนยันการซิงก์',
      });
      return;
    }

    setSyncing(true);
    onStatusMessage(null);
    try {
      const res = await api.syncCloudflareWorker({
        workerUrl: cleanUrl,
        direction: syncDirection,
        username: cfAdminUser.trim(),
        password: cfAdminPass,
      });
      setCfAdminPass('');
      await loadRuntimeStatus();
      if (syncDirection === 'pull' && onSyncedData) {
        await onSyncedData();
      }
      const actionLabel =
        syncDirection === 'push' ? 'ซิงก์ข้อมูลขึ้น Cloudflare D1' : 'ดึงข้อมูลจาก Cloudflare D1';
      const msg = `${actionLabel} สำเร็จ (นักศึกษา ${res.result.restoredStudents} คน, ใบสมัคร ${res.result.restoredApplications} ฉบับ, เกรด ${res.result.restoredGrades} รายการ, จิตอาสา ${res.result.restoredVolunteers} รายการ)`;
      onStatusMessage({ type: 'success', text: msg });
      showSaveSuccess(msg, 'ซิงก์ข้อมูลกับ Cloudflare เสร็จสิ้นแล้ว');
    } catch (err) {
      onStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  const deployCommands = [
    'npx wrangler login',
    `npx wrangler d1 create ${dbNameInput.trim() || DEFAULT_DB_NAME}`,
    `npx wrangler r2 bucket create ${bucketNameInput.trim() || DEFAULT_BUCKET_NAME}`,
    'npm run cf:d1:migrate:remote',
    'npx wrangler secret put SESSION_SECRET',
    'npm run cf:deploy',
  ].join('\n');

  const handleCopyCommands = async () => {
    try {
      await navigator.clipboard.writeText(deployCommands);
      showSaveSuccess('คัดลอกคำสั่งเชื่อมต่อและติดตั้ง Cloudflare CLI เรียบร้อยแล้ว', 'คัดลอกเสร็จสิ้นแล้ว');
    } catch {
      onStatusMessage({
        type: 'error',
        text: 'ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาเลือกข้อความคำสั่งด้านล่างเพื่อคัดลอก',
      });
    }
  };

  const isRunningOnCloudflare = runtimeStatus?.runtime === 'cloudflare-workers';

  return (
    <section className="rounded-2xl border border-[#DFD1BA] dark:border-[#343842] bg-white dark:bg-[#22242B] p-6 space-y-5 surface-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE0CE] dark:border-[#343842] pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF3E6] dark:bg-[#3A2411] text-[#D95B00] dark:text-[#FB923C]">
            <Cloud className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[#7A1629] dark:text-[#F4D98A]">
              เชื่อมต่อ Cloudflare (Workers · D1 Database · R2 Storage)
            </h2>
            <p className="text-xs text-[#66585B] dark:text-[#A19B91] mt-0.5">
              เชื่อมโยงระบบเข้ากับ Cloudflare Workers, ฐานข้อมูล SQLite บนคลาวด์ (D1) และที่เก็บไฟล์/รูปภาพ (R2) พร้อมตรวจสอบสถานะและซิงก์ข้อมูลสองทาง
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadRuntimeStatus}
            disabled={loadingStatus}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-[#FAF6EE] dark:bg-[#1A1C21] px-3 py-1.5 text-xs font-medium text-[#23181A] dark:text-[#F2EFEA] hover:bg-[#EFE5D1] dark:hover:bg-[#2B2F3A] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingStatus ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>รีเฟรชสถานะ</span>
          </button>

          {config.cloudflareWorkerUrl && (
            <a
              href={config.cloudflareWorkerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#D95B00] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#B84A00] transition-colors"
            >
              <span>เปิดเว็บ Cloudflare</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {/* Live Runtime & Binding Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1A1C21] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#66585B] dark:text-[#A19B91]">
              สภาพแวดล้อมที่ทำงานอยู่
            </span>
            <Activity className="h-4 w-4 text-[#D95B00] dark:text-[#FB923C]" aria-hidden="true" />
          </div>
          <p className="font-display text-sm font-bold text-[#23181A] dark:text-[#F2EFEA]">
            {loadingStatus
              ? 'กำลังตรวจสอบ...'
              : isRunningOnCloudflare
                ? 'Cloudflare Workers (Active)'
                : config.cloudflareWorkerUrl
                  ? 'Node.js เชื่อมต่อปลายทาง Cloudflare'
                  : 'Node.js Server (ยังไม่ได้ผูก Worker URL)'}
          </p>
          <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">
            {runtimeStatus
              ? `นักศึกษา ${runtimeStatus.counts.students} คน · คำร้อง ${runtimeStatus.counts.applications} · เกรด ${runtimeStatus.counts.grades} · อาสา ${runtimeStatus.counts.volunteers}`
              : 'กำลังอ่านข้อมูลฐานข้อมูล...'}
          </p>
        </div>

        <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1A1C21] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#66585B] dark:text-[#A19B91]">
              ฐานข้อมูล Cloudflare D1
            </span>
            <Database className="h-4 w-4 text-[#166534] dark:text-[#4ADE80]" aria-hidden="true" />
          </div>
          <p className="font-display text-sm font-bold text-[#23181A] dark:text-[#F2EFEA]">
            {runtimeStatus?.databaseName || dbNameInput || DEFAULT_DB_NAME}
          </p>
          <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">
            {isRunningOnCloudflare && runtimeStatus?.d1Connected
              ? `เชื่อมต่อ D1 โดยตรง (${runtimeStatus.d1LatencyMs ?? 0} ms)`
              : testResult?.d1Connected
                ? `ปลายทาง D1 พร้อมใช้งาน (${testResult.d1LatencyMs ?? 0} ms)`
                : 'พร้อมเชื่อมต่อผ่าน Worker Binding (DB)'}
          </p>
        </div>

        <div className="rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE] dark:bg-[#1A1C21] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#66585B] dark:text-[#A19B91]">
              พื้นที่จัดเก็บไฟล์ Cloudflare R2
            </span>
            <HardDrive className="h-4 w-4 text-[#1D4ED8] dark:text-[#60A5FA]" aria-hidden="true" />
          </div>
          <p className="font-display text-sm font-bold text-[#23181A] dark:text-[#F2EFEA]">
            {runtimeStatus?.bucketName || bucketNameInput || DEFAULT_BUCKET_NAME}
          </p>
          <p className="text-[11px] text-[#66585B] dark:text-[#A19B91]">
            {isRunningOnCloudflare && runtimeStatus?.r2Bound
              ? 'เชื่อมต่อ R2 Bucket (BUCKET) แล้ว'
              : testResult?.r2Bound
                ? 'ปลายทาง R2 Bucket พร้อมใช้งาน'
                : 'พร้อมเชื่อมต่อผ่าน Worker Binding (BUCKET)'}
          </p>
        </div>
      </div>

      {/* Cloudflare Endpoint Config & Test */}
      {!isRunningOnCloudflare && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE]/60 dark:bg-[#1A1C21] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-[#23181A] dark:text-[#F2EFEA]">
                ตั้งค่าและทดสอบปลายทาง Cloudflare Worker
              </h3>
              {config.cloudflareLastSyncedAt && (
                <span className="text-[11px] text-[#66585B] dark:text-[#A19B91]">
                  ซิงก์ล่าสุด: {new Date(config.cloudflareLastSyncedAt).toLocaleString('th-TH')}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="cf-worker-url-input"
                className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]"
              >
                Cloudflare Worker / Custom Domain URL
              </label>
              <input
                id="cf-worker-url-input"
                type="url"
                value={workerUrlInput}
                onChange={(e) => setWorkerUrlInput(e.target.value)}
                placeholder="https://cmru-edu-social-care.your-subdomain.workers.dev"
                className="w-full rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#22242B] px-3 py-2 text-xs text-[#23181A] dark:text-[#F2EFEA] placeholder:text-[#9A8B8E] dark:placeholder:text-[#7E8594] focus:border-[#D95B00] dark:focus:border-[#FB923C] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="cf-db-name-input"
                  className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA] mb-1"
                >
                  ชื่อ D1 Database
                </label>
                <input
                  id="cf-db-name-input"
                  type="text"
                  value={dbNameInput}
                  onChange={(e) => setDbNameInput(e.target.value)}
                  placeholder={DEFAULT_DB_NAME}
                  className="w-full rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#22242B] px-3 py-2 text-xs text-[#23181A] dark:text-[#F2EFEA]"
                />
              </div>
              <div>
                <label
                  htmlFor="cf-bucket-name-input"
                  className="block text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA] mb-1"
                >
                  ชื่อ R2 Bucket
                </label>
                <input
                  id="cf-bucket-name-input"
                  type="text"
                  value={bucketNameInput}
                  onChange={(e) => setBucketNameInput(e.target.value)}
                  placeholder={DEFAULT_BUCKET_NAME}
                  className="w-full rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#22242B] px-3 py-2 text-xs text-[#23181A] dark:text-[#F2EFEA]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={busy || testing || !workerUrlInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D95B00] dark:border-[#FB923C]/70 bg-white dark:bg-[#22242B] px-3.5 py-2 text-xs font-semibold text-[#B84A00] dark:text-[#FDBA74] hover:bg-[#FFF3E6] dark:hover:bg-[#3A2411] transition-colors disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ Cloudflare'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveCloudflareConfig}
                disabled={busy || saving || !workerUrlInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#D95B00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B84A00] transition-colors disabled:opacity-50"
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการเชื่อมต่อ Cloudflare'}</span>
              </button>

              {config.cloudflareWorkerUrl && (
                <button
                  type="button"
                  onClick={handleDisconnectCloudflare}
                  disabled={busy || saving}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#FCA5A5] dark:border-[#7F1D1D] bg-white dark:bg-[#22242B] px-3 py-2 text-xs font-medium text-[#B91C1C] dark:text-[#FCA5A5] hover:bg-[#FEF2F2] dark:hover:bg-[#2F1519] transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>ยกเลิกเชื่อมต่อ</span>
                </button>
              )}
            </div>

            {testResult && (
              <div className="rounded-xl border border-[#86EFAC] dark:border-[#166534] bg-[#F0FDF4] dark:bg-[#143322] p-3 text-xs text-[#166534] dark:text-[#86EFAC] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    ปลายทาง {testResult.workerUrl} ตอบสนองปกติ ({testResult.latencyMs} ms)
                  </span>
                </div>
                <p className="text-[11px]">
                  Runtime: {testResult.runtime} · D1: {testResult.d1Connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'} · R2:{' '}
                  {testResult.r2Bound ? 'ผูกแล้ว' : 'ยังไม่ผูก'}
                  {typeof testResult.totalStudents === 'number'
                    ? ` · นักศึกษาบน Cloudflare: ${testResult.totalStudents} คน`
                    : ''}
                </p>
              </div>
            )}
          </div>

          {/* Two-Way D1 Sync Card (Admin Only) */}
          <div className="lg:col-span-5 rounded-xl border border-[#EAE0CE] dark:border-[#343842] bg-[#FAF6EE]/60 dark:bg-[#1A1C21] p-4 space-y-3">
            <h3 className="font-display text-sm font-bold text-[#23181A] dark:text-[#F2EFEA]">
              ซิงก์ข้อมูลระหว่างเซิร์ฟเวอร์กับ Cloudflare D1
            </h3>
            {isAdmin ? (
              <>
                <div className="flex gap-1.5 rounded-xl border border-[#DFD1BA] dark:border-[#343842] bg-white dark:bg-[#22242B] p-1">
                  <button
                    type="button"
                    onClick={() => setSyncDirection('push')}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      syncDirection === 'push'
                        ? 'bg-[#7A1629] text-white'
                        : 'text-[#5A4B4E] dark:text-[#C8C2B8] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]'
                    }`}
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>ส่งขึ้น Cloudflare (Push)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncDirection('pull')}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      syncDirection === 'pull'
                        ? 'bg-[#7A1629] text-white'
                        : 'text-[#5A4B4E] dark:text-[#C8C2B8] hover:bg-[#FAF6EE] dark:hover:bg-[#2B2F3A]'
                    }`}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>ดึงมาใช้งาน (Pull)</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={cfAdminUser}
                    onChange={(e) => setCfAdminUser(e.target.value)}
                    placeholder="ชื่อผู้ใช้ผู้ดูแลระบบ (Admin) บน Cloudflare Worker"
                    autoComplete="off"
                    className="w-full rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#22242B] px-3 py-2 text-xs text-[#23181A] dark:text-[#F2EFEA]"
                  />
                  <input
                    type="password"
                    value={cfAdminPass}
                    onChange={(e) => setCfAdminPass(e.target.value)}
                    placeholder="รหัสผ่านผู้ดูแลระบบบน Cloudflare Worker (ใช้ครั้งเดียวไม่บันทึก)"
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-[#D8CBB8] dark:border-[#434856] bg-white dark:bg-[#22242B] px-3 py-2 text-xs text-[#23181A] dark:text-[#F2EFEA]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSyncCloudflare}
                  disabled={
                    busy ||
                    syncing ||
                    !(workerUrlInput.trim() || config.cloudflareWorkerUrl) ||
                    !cfAdminUser.trim() ||
                    !cfAdminPass
                  }
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#7A1629] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5E1020] transition-colors disabled:opacity-50"
                >
                  {syncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : syncDirection === 'push' ? (
                    <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {syncing
                      ? 'กำลังซิงก์ข้อมูล...'
                      : syncDirection === 'push'
                        ? 'ซิงก์ข้อมูลทั้งหมดขึ้น Cloudflare D1'
                        : 'ดึงข้อมูลจาก Cloudflare D1 มายังระบบนี้'}
                  </span>
                </button>
              </>
            ) : (
              <p className="text-xs text-[#66585B] dark:text-[#A19B91]">
                การซิงก์ฐานข้อมูลสองทางกับ Cloudflare D1 สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น
              </p>
            )}
          </div>
        </div>
      )}

      {/* CLI Deployment Commands Reference */}
      <div className="border-t border-[#EAE0CE] dark:border-[#343842] pt-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#23181A] dark:text-[#F2EFEA]">
            <Terminal className="h-4 w-4 text-[#D95B00] dark:text-[#FB923C]" aria-hidden="true" />
            <span>คำสั่ง Wrangler CLI สำหรับเชื่อมและ Deploy ขึ้น Cloudflare Workers + D1 + R2</span>
          </div>
          <button
            type="button"
            onClick={handleCopyCommands}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#7A1629] dark:border-[#C6922C]/70 bg-white dark:bg-[#1A1C21] px-3 py-1.5 text-xs font-semibold text-[#7A1629] dark:text-[#F4D98A] hover:bg-[#FAF6EE] dark:hover:bg-[#2D313B]"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span>คัดลอกคำสั่ง</span>
          </button>
        </div>
        <pre className="overflow-x-auto rounded-xl border border-[#D8CBB8] dark:border-[#343842] bg-[#1D1F27] p-3 text-[11px] leading-relaxed text-[#E6EDF3] font-mono">
          <code>{deployCommands}</code>
        </pre>
      </div>
    </section>
  );
}
