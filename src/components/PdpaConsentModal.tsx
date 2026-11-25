import { ShieldCheck, PhoneCall, Mail } from 'lucide-react';

interface PdpaConsentModalProps {
  declined: boolean;
  onConsent: () => void;
  onDecline: () => void;
}

export function PdpaConsentModal({
  declined,
  onConsent,
  onDecline,
}: PdpaConsentModalProps) {
  return (
    <section className="rounded-2xl border border-[#D8C6A6] bg-white p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EAE0CE] pb-5">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#7A1629]/10 text-[#7A1629]">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-[#7A1629]">
              นโยบายการคุ้มครองข้อมูลส่วนบุคคล (Privacy Policy / PDPA)
            </h2>
            <p className="text-sm text-[#66585B]">
              EDU SOCIAL CARE CMRU โดยงานทุนการศึกษา &amp; กยศ. สาขาวิชาสังคมศึกษา
              คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto rounded-xl border border-[#EAE0CE] bg-[#FAF6EE] p-5 space-y-4 text-sm leading-relaxed text-[#23181A]">
        <div>
          <h3 className="font-display font-semibold text-[#7A1629]">
            1. วัตถุประสงค์ในการเก็บรวบรวมข้อมูล
          </h3>
          <p className="mt-1">
            เว็บไซต์นี้จัดทำขึ้นเพื่อให้บริการด้านข้อมูลทุนการศึกษาและกองทุนเงินให้กู้ยืมเพื่อการศึกษา
            (กยศ.) แก่นักศึกษาสาขาวิชาสังคมศึกษา คณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่
            โดยมีวัตถุประสงค์ในการเก็บรวบรวม ใช้ และประมวลผลข้อมูลส่วนบุคคล
            เพื่อดำเนินงานด้านทุนการศึกษา การตรวจสอบคุณสมบัติ การติดตามสถานะการสมัคร
            และการบันทึกกิจกรรมจิตอาสา
          </p>
        </div>

        <div>
          <h3 className="font-display font-semibold text-[#7A1629]">
            2. ข้อมูลส่วนบุคคลที่จัดเก็บ
          </h3>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>ข้อมูลทั่วไป เช่น ชื่อ-นามสกุล รหัสนักศึกษา วันเดือนปีเกิด และข้อมูลการติดต่อ</li>
            <li>ข้อมูลด้านการศึกษา เช่น ชั้นปี ผลการเรียนเฉลี่ย (GPA) และประวัติการศึกษา</li>
            <li>ข้อมูลครอบครัว เช่น ข้อมูลบิดา มารดา ผู้ปกครอง และข้อมูลประกอบการพิจารณาทุน</li>
            <li>เอกสารประกอบการสมัคร เช่น รูปถ่าย เอกสารผลการศึกษา และหลักฐานทางการเงิน</li>
            <li>ข้อมูลการสมัครทุน เช่น ประเภททุน วันที่สมัคร และสถานะการพิจารณา</li>
            <li>ข้อมูลกิจกรรมจิตอาสา เช่น รายละเอียดกิจกรรม ภาพถ่าย และหลักฐานการเข้าร่วมกิจกรรม</li>
          </ul>
        </div>

        <div>
          <h3 className="font-display font-semibold text-[#7A1629]">
            3. วัตถุประสงค์ในการใช้ข้อมูล
          </h3>
          <ol className="mt-1 list-decimal pl-5 space-y-1">
            <li>จัดทำฐานข้อมูลนักศึกษาและข้อมูลพื้นฐาน</li>
            <li>ดำเนินการรับสมัครและพิจารณาทุนการศึกษา</li>
            <li>ตรวจสอบคุณสมบัติและเอกสารประกอบการสมัคร</li>
            <li>ติดตามความคืบหน้าและแจ้งผลการพิจารณาทุน</li>
            <li>จัดเก็บข้อมูลกิจกรรมจิตอาสาและประเมินผลการเข้าร่วมกิจกรรม</li>
            <li>จัดทำรายงานและสถิติสำหรับการบริหารจัดการภายในสาขาวิชา</li>
            <li>ติดต่อประสานงานกับนักศึกษาและผู้เกี่ยวข้อง</li>
          </ol>
        </div>

        <div>
          <h3 className="font-display font-semibold text-[#7A1629]">
            4. การเปิดเผยข้อมูลส่วนบุคคล
          </h3>
          <p className="mt-1">
            เว็บไซต์จะไม่เปิดเผยข้อมูลส่วนบุคคลแก่บุคคลภายนอกโดยไม่มีเหตุอันชอบด้วยกฎหมาย
            เว้นแต่เป็นกรณีที่จำเป็นต่อการดำเนินงานตามวัตถุประสงค์ที่แจ้งไว้
            หรือเป็นการปฏิบัติตามกฎหมายและคำสั่งของหน่วยงานที่มีอำนาจ
            การเข้าถึงข้อมูลภายในระบบจะจำกัดเฉพาะนักศึกษา อาจารย์
            และผู้ดูแลระบบตามสิทธิ์ที่ได้รับมอบหมาย
          </p>
        </div>

        <div>
          <h3 className="font-display font-semibold text-[#7A1629]">
            5. มาตรการรักษาความมั่นคงปลอดภัย
          </h3>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>กำหนดสิทธิ์การเข้าถึงข้อมูลตามบทบาทของผู้ใช้งาน</li>
            <li>ใช้ระบบบัญชีผู้ใช้และรหัสผ่านในการเข้าสู่ระบบ</li>
            <li>จำกัดการเข้าถึงเอกสารและหลักฐานส่วนบุคคล</li>
            <li>จัดเก็บข้อมูลในระบบที่มีการควบคุมการเข้าถึง</li>
            <li>ดำเนินการตรวจสอบและปรับปรุงมาตรการรักษาความปลอดภัยอย่างเหมาะสม</li>
          </ul>
        </div>

        <div>
          <h3 className="font-display font-semibold text-[#7A1629]">
            6. ระยะเวลาในการเก็บรักษาข้อมูล
          </h3>
          <p className="mt-1">
            เว็บไซต์จะเก็บรักษาข้อมูลส่วนบุคคลเท่าที่จำเป็นต่อวัตถุประสงค์ในการดำเนินงานด้านทุนการศึกษาและ
            กยศ. หรือตามระยะเวลาที่กฎหมายและระเบียบที่เกี่ยวข้องกำหนด เมื่อพ้นระยะเวลาที่จำเป็น
            จะดำเนินการลบ ทำลาย หรือทำให้ข้อมูลไม่สามารถระบุตัวบุคคลได้ตามความเหมาะสม
          </p>
        </div>

        <div>
          <h3 className="font-display font-semibold text-[#7A1629]">
            7. สิทธิของเจ้าของข้อมูลส่วนบุคคล
          </h3>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>สิทธิในการขอเข้าถึงและขอรับสำเนาข้อมูลส่วนบุคคล</li>
            <li>สิทธิในการขอแก้ไขข้อมูลให้ถูกต้องและเป็นปัจจุบัน</li>
            <li>สิทธิในการขอลบหรือทำลายข้อมูลตามเงื่อนไขของกฎหมาย</li>
            <li>สิทธิในการขอระงับการใช้ข้อมูลส่วนบุคคล</li>
            <li>สิทธิในการคัดค้านการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูล</li>
            <li>สิทธิในการถอนความยินยอม ในกรณีที่การประมวลผลข้อมูลอาศัยความยินยอม</li>
            <li>สิทธิในการร้องเรียนต่อหน่วยงานที่มีอำนาจตามกฎหมาย</li>
          </ul>
        </div>

        <div>
          <h3 className="font-display font-semibold text-[#7A1629]">
            8. การติดต่อสอบถาม
          </h3>
          <p className="mt-1">
            หน่วยงาน: งานทุนการศึกษา และ กยศ. สาขาวิชาสังคมศึกษา · คณะ: คณะครุศาสตร์
            มหาวิทยาลัยราชภัฏเชียงใหม่ · อีเมล: socialcare.edu@g.cmru.ac.th · ช่องทางติดต่อ:
            ห้องพักอาจารย์สาขาวิชาสังคมศึกษา อาคารคณะครุศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่
          </p>
        </div>
      </div>

      {declined && (
        <div
          role="alert"
          className="rounded-xl border border-[#F59E0B] bg-[#FFFBEB] p-4 text-sm text-[#92400E] space-y-2"
        >
          <p className="font-display font-semibold">
            ท่านเลือกไม่ยินยอมในการประมวลผลข้อมูลส่วนบุคคล
          </p>
          <p>
            ระบบไม่สามารถดำเนินการกรอกข้อมูลพื้นฐานและสมัครทุนการศึกษาในส่วนที่จำเป็นต้องใช้ข้อมูลส่วนบุคคลได้
            หากต้องการสอบถามเพิ่มเติมหรือขอใช้สิทธิ กรุณาติดต่อเจ้าหน้าที่โดยตรง:
          </p>
          <div className="flex flex-wrap gap-4 pt-1 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              socialcare.edu@g.cmru.ac.th
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
              ห้องพักอาจารย์สาขาวิชาสังคมศึกษา คณะครุศาสตร์ มร.ชม.
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onDecline}
          className="rounded-lg border border-[#D8CBB8] bg-white px-5 py-2.5 text-sm font-medium text-[#5A4B4E] hover:bg-[#FAF6EE] transition-colors"
        >
          ไม่ยินยอม
        </button>
        <button
          type="button"
          onClick={onConsent}
          className="rounded-lg bg-[#7A1629] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#5B0F1D] transition-colors"
        >
          ยินยอม และดำเนินการกรอกข้อมูลพื้นฐาน
        </button>
      </div>
    </section>
  );
}
