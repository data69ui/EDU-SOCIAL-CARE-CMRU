import { useEffect, useMemo, useState } from 'react';
import { Award, ChevronRight, Search, Users, X } from 'lucide-react';
import type { ScholarshipCategorySummary } from '../types/scholarship';

interface ScholarshipSummarySectionProps {
  summary: ScholarshipCategorySummary[];
  loading?: boolean;
  onSelectRecipientUser?: (studentUserId: string) => void;
}

export function ScholarshipSummarySection({
  summary,
  loading = false,
  onSelectRecipientUser,
}: ScholarshipSummarySectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<ScholarshipCategorySummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Keep selectedCategory synchronized when summary refreshes after edits
  useEffect(() => {
    if (!selectedCategory) return;
    const updated = summary.find((s) => s.scholarshipKey === selectedCategory.scholarshipKey);
    setSelectedCategory(updated || null);
  }, [summary, selectedCategory?.scholarshipKey]);

  useEffect(() => {
    if (!selectedCategory) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCategory(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCategory]);

  const filteredSummary = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return summary;
    return summary.filter(
      (item) =>
        item.scholarshipName.toLowerCase().includes(q) ||
        item.recipients.some(
          (r) =>
            r.fullName.toLowerCase().includes(q) ||
            r.studentId.toLowerCase().includes(q)
        )
    );
  }, [summary, searchQuery]);

  const uniqueRecipientTotal = useMemo(() => {
    const ids = new Set<string>();
    for (const cat of summary) {
      for (const r of cat.recipients) {
        ids.add(r.studentUserId);
      }
    }
    return ids.size;
  }, [summary]);

  return (
    <section
      aria-label="สรุปผู้ได้รับทุนการศึกษาตามประเภททุน"
      className="rounded-2xl border border-[#DFD1BA] bg-white p-5 sm:p-6 space-y-4 surface-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EFE5D4] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[#7A1629]">
            <Award className="h-5 w-5 shrink-0" aria-hidden="true" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#23181A]">
              สรุปผู้ได้รับทุนการศึกษาตามประเภททุน
            </h2>
          </div>
          <p className="text-xs text-[#66585B]">
            รวบรวมและจัดกลุ่มอัตโนมัติจากหัวข้อ &quot;ทุนการศึกษาที่ได้รับ&quot; ที่นักศึกษายืนยันข้อมูลแล้ว · คลิกชื่อทุนเพื่อดูรายชื่อผู้ได้รับทุน
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#DFC9A1] bg-[#FDF8EC] px-3 py-1.5 text-xs font-semibold text-[#7A1629] tabular-nums">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {summary.length} ประเภททุน · ผู้ได้รับทุน {uniqueRecipientTotal} คน
            </span>
          </span>

          {summary.length > 3 && (
            <div className="relative">
              <Search
                className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#66585B]"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อทุนหรือนักศึกษา..."
                aria-label="ค้นหาชื่อทุนการศึกษาหรือนักศึกษา"
                className="rounded-xl border border-[#D8CBB8] bg-[#FAF6EE] pl-8 pr-3 py-1.5 text-xs text-[#23181A] placeholder:text-[#8E7D7F]"
              />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs sm:text-sm text-[#66585B]">
          กำลังรวบรวมข้อมูลทุนการศึกษา...
        </p>
      ) : summary.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#DFD1BA] bg-[#FAF6EE]/60 p-6 text-center space-y-1.5">
          <p className="text-sm font-medium text-[#23181A]">
            ยังไม่มีข้อมูลทุนการศึกษาที่นักศึกษายืนยันแล้ว
          </p>
          <p className="text-xs text-[#66585B]">
            เมื่อนักศึกษาเพิ่มชื่อทุนการศึกษาในรายละเอียดข้อมูลส่วนตัวและกดบันทึกข้อมูล ระบบจะจำแนกประเภททุนและนับจำนวนผู้ได้รับทุนให้อัตโนมัติ
          </p>
        </div>
      ) : filteredSummary.length === 0 ? (
        <p className="py-6 text-center text-xs sm:text-sm text-[#66585B]">
          ไม่พบประเภททุนการศึกษาที่ตรงกับคำค้นหา &quot;{searchQuery}&quot;
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#E6DAC5] text-xs text-[#66585B]">
                <th className="py-2.5 pr-3 font-semibold w-12">ลำดับ</th>
                <th className="py-2.5 pr-3 font-semibold">ประเภททุนการศึกษา</th>
                <th className="py-2.5 px-3 font-semibold text-right">จำนวนผู้ได้รับทุน</th>
                <th className="py-2.5 pl-3 font-semibold text-right">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE5D4]">
              {filteredSummary.map((category, idx) => (
                <tr
                  key={category.scholarshipKey}
                  className="hover:bg-[#FAF6EE]/80 transition-colors"
                >
                  <td className="py-3 pr-3 tabular-nums text-[#66585B]">{idx + 1}</td>
                  <td className="py-3 pr-3 font-semibold text-[#23181A]">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className="text-left text-[#7A1629] hover:underline focus-visible:outline-2 focus-visible:outline-[#7A1629] rounded"
                    >
                      {category.scholarshipName}
                    </button>
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-[#23181A] tabular-nums whitespace-nowrap">
                    {category.recipientCount.toLocaleString()} คน
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      aria-label={`ดูรายชื่อผู้ได้รับ ${category.scholarshipName}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#C6922C] bg-[#FDF8EC] px-3 py-1.5 text-xs font-semibold text-[#7A1629] hover:bg-[#F7EBCB] transition-colors whitespace-nowrap"
                    >
                      <span>ดูรายชื่อ</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recipient List Modal */}
      {selectedCategory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scholarship-recipients-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedCategory(null);
            }
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-[#DFD1BA] bg-white shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-start justify-between gap-4 border-b border-[#EFE5D4] bg-[#FAF6EE] px-6 py-4">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#7A1629]">
                  รายชื่อผู้ได้รับทุนการศึกษา
                </p>
                <h3
                  id="scholarship-recipients-modal-title"
                  className="font-display text-lg font-bold text-[#23181A] break-words"
                >
                  {selectedCategory.scholarshipName}
                </h3>
                <p className="text-xs text-[#66585B] tabular-nums">
                  จำนวนผู้ได้รับทุนทั้งหมด {selectedCategory.recipientCount.toLocaleString()} คน
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                aria-label="ปิดหน้าต่างรายชื่อผู้ได้รับทุน"
                className="rounded-lg border border-[#D8CBB8] bg-white p-1.5 text-[#5A4B4E] hover:bg-[#FAF6EE]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#E6DAC5] text-xs text-[#66585B]">
                    <th className="py-2 pr-2 font-semibold w-10">ที่</th>
                    <th className="py-2 pr-3 font-semibold">รหัสนักศึกษา</th>
                    <th className="py-2 pr-3 font-semibold">ชื่อ-นามสกุล</th>
                    <th className="py-2 pr-3 font-semibold">ชั้นปี</th>
                    <th className="py-2 pr-3 font-semibold">ปีการศึกษา</th>
                    {selectedCategory.recipients.some((r) => r.provider) && (
                      <th className="py-2 pr-3 font-semibold">หน่วยงาน / แหล่งทุน</th>
                    )}
                    {onSelectRecipientUser && (
                      <th className="py-2 text-right font-semibold">โปรไฟล์</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE5D4]">
                  {selectedCategory.recipients.map((recipient, idx) => (
                    <tr key={recipient.studentUserId} className="hover:bg-[#FAF6EE]/70">
                      <td className="py-2.5 pr-2 tabular-nums text-[#66585B]">{idx + 1}</td>
                      <td className="py-2.5 pr-3 tabular-nums font-medium text-[#23181A]">
                        {recipient.studentId}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold text-[#23181A]">
                        {recipient.fullName}
                      </td>
                      <td className="py-2.5 pr-3 text-[#5A4B4E]">{recipient.yearLevel}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-[#5A4B4E]">
                        {recipient.academicYear}
                      </td>
                      {selectedCategory.recipients.some((r) => r.provider) && (
                        <td className="py-2.5 pr-3 text-[#5A4B4E]">
                          {recipient.provider || '-'}
                        </td>
                      )}
                      {onSelectRecipientUser && (
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            aria-label={`ดูโปรไฟล์ ${recipient.fullName}`}
                            onClick={() => {
                              setSelectedCategory(null);
                              onSelectRecipientUser(recipient.studentUserId);
                            }}
                            className="rounded-lg bg-[#7A1629] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#5B0F1D]"
                          >
                            ดูโปรไฟล์
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t border-[#EFE5D4] bg-[#FAF6EE]/60 px-6 py-3">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="rounded-xl border border-[#D8CBB8] bg-white px-4 py-2 text-xs font-semibold text-[#23181A] hover:bg-[#FAF6EE]"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
