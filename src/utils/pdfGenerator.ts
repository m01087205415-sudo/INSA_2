/**
 * 양우종합건설 스마트 급여계산기 - 한글 급여명세서 PDF 및 ZIP 생성 유틸리티
 * 
 * [원칙]
 * 1. 한글 글꼴 깨짐 방지를 위해 브라우저 고해상도 Canvas 렌더링 파이프라인 적용
 * 2. 근로기준법 제48조 및 시행령 제27조의2 법정 기재사항 필수 준수
 * 3. 산재보험 등 사업주 부담금 제외, 1인 1명세서 격리
 * 4. 천 단위 쉼표 및 원 단위 표기, 승인 버전 및 발급일자 명시
 */

import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { EmployeeSalaryRecord, PayrollSettings } from '../types/payroll';
import { formatCurrency } from './calculator';

/**
 * 캔버스에 텍스트 줄바꿈 및 서식 그리기 헬퍼
 */
export async function renderPayslipToCanvas(
  record: EmployeeSalaryRecord,
  settings: PayrollSettings,
  approvalVersion: number = 1
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  // A4 해상도 (2x 레티나 스케일: 1240 x 1754)
  const width = 1240;
  const height = 1754;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context를 생성할 수 없습니다.');

  // 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 상단 테두리 장식 바 (양우종합건설 네이비)
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(60, 60, width - 120, 8);

  // 1. 헤더 영역
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 36px "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('급  여  명  세  서', width / 2, 130);

  ctx.font = '16px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#475569';
  const ymParts = settings.yearMonth.split('-');
  const ymKorean = `${ymParts[0]}년 ${ymParts[1]}월분`;
  ctx.fillText(`( 귀속연월: ${ymKorean} )`, width / 2, 165);

  // 상단 메타데이터 (회사명, 승인버전, 발급일)
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#1e293b';
  ctx.fillText(`회사명: ${settings.companyName}`, 70, 205);

  ctx.textAlign = 'right';
  ctx.font = '14px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#64748b';
  const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  ctx.fillText(`승인 버전: v${approvalVersion}.0  |  발급일자: ${todayStr}`, width - 70, 205);

  // 2. 근로자 및 급여 산정 기본 정보 표
  const infoY = 220;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(60, infoY, width - 120, 80);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(60, infoY, width - 120, 80);

  // 수평 분할선
  ctx.beginPath();
  ctx.moveTo(60, infoY + 40);
  ctx.lineTo(width - 60, infoY + 40);
  ctx.stroke();

  // 열 분할선
  const colW = (width - 120) / 4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(60 + colW * i, infoY);
    ctx.lineTo(60 + colW * i, infoY + 80);
    ctx.stroke();
  }

  const renderCell = (col: number, row: number, label: string, val: string) => {
    const x = 60 + col * colW;
    const y = infoY + row * 40;
    
    // 라벨 배경
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(x + 1, y + 1, 90, 38);
    
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + 45, y + 25);

    ctx.fillStyle = '#0f172a';
    ctx.font = '14px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(val, x + 105, y + 25);
  };

  renderCell(0, 0, '성  명', record.name);
  renderCell(1, 0, '사  번', record.employeeNo);
  renderCell(2, 0, '부  서', record.department);
  renderCell(3, 0, '직  급', record.position);

  renderCell(0, 1, '산정기간', `${settings.periodStart} ~ ${settings.periodEnd}`);
  renderCell(1, 1, '지급일자', settings.payday);
  renderCell(2, 1, '근무일수', `${record.workingDays}일 (소정 ${record.regularHours}h)`);
  renderCell(3, 1, '통상시급', `${formatCurrency(record.hourlyRate)}원`);

  // 3. 지급 항목 & 공제 항목 2컬럼 테이블
  const tableY = 320;
  const halfW = (width - 120) / 2;

  // 헤더
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(60, tableY, halfW, 36);
  ctx.fillStyle = '#047857';
  ctx.fillRect(60 + halfW, tableY, halfW, 36);

  ctx.font = 'bold 15px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('지  급  내  역', 60 + halfW / 2, tableY + 23);
  ctx.fillText('공  제  내  역', 60 + halfW + halfW / 2, tableY + 23);

  // 데이터 행 준비
  const paymentRows = [
    { name: '기본급', amount: record.baseSalary, note: '소정근로의 대가' },
    { name: '고정수당', amount: record.fixedAllowance, note: '직책/현장 책임 수당' },
    { name: '연장근로수당', amount: record.overtimePay, note: `${record.overtimeHours}시간 (통상시급 × 1.5)` },
    { name: '야간근로수당', amount: record.nightPay, note: `${record.nightHours}시간 (통상시급 × 0.5)` },
    { name: '휴일근로수당', amount: record.holidayPay, note: `${record.holidayHours}시간 (통상시급 × 1.5)` },
    { name: '상여금', amount: record.bonus, note: record.bonus > 0 ? '성과 포상' : '-' },
    { name: '식대 (비과세)', amount: Math.min(record.mealAllowance, settings.mealNonTaxableLimit), note: '월 200,000원 한도' },
    { name: '식대 (과세분)', amount: Math.max(0, record.mealAllowance - settings.mealNonTaxableLimit), note: '비과세 초과분' },
    { name: '기타 과세수당', amount: record.otherTaxablePay, note: '-' },
    { name: '기타 비과세수당', amount: record.otherNonTaxablePay, note: '-' },
  ];

  const deductionRows = [
    { name: '국민연금', amount: record.nationalPension, note: '기준소득월액 × 4.5%' },
    { name: '건강보험', amount: record.healthInsurance, note: '과세급여 × 3.545%' },
    { name: '장기요양보험', amount: record.longTermCare, note: '건강보험료 × 12.95%' },
    { name: '고용보험', amount: record.employmentInsurance, note: '과세급여 × 0.9%' },
    { name: '근로소득세', amount: record.incomeTax, note: '간이세액표 누진공제' },
    { name: '지방소득세', amount: record.localIncomeTax, note: '소득세의 10%' },
    { name: '기타공제(사우회 등)', amount: record.otherDeductions, note: '근로자 동의 공제' },
    { name: '산재보험 (참고)', amount: 0, note: '전액 회사부담 (근로자 0원)' },
    { name: '-', amount: 0, note: '-' },
    { name: '-', amount: 0, note: '-' },
  ];

  const rowH = 34;
  let currY = tableY + 36;

  for (let i = 0; i < paymentRows.length; i++) {
    const p = paymentRows[i];
    const d = deductionRows[i];

    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(60, currY, width - 120, rowH);

    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(60, currY, halfW, rowH);
    ctx.strokeRect(60 + halfW, currY, halfW, rowH);

    // 지급 항목
    ctx.font = '13px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'left';
    ctx.fillText(p.name, 75, currY + 22);

    ctx.font = '12px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`(${p.note})`, 190, currY + 22);

    ctx.font = 'bold 13px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'right';
    ctx.fillText(`${formatCurrency(p.amount)}원`, 60 + halfW - 20, currY + 22);

    // 공제 항목
    if (d.name !== '-') {
      ctx.font = '13px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'left';
      ctx.fillText(d.name, 60 + halfW + 15, currY + 22);

      ctx.font = '12px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`(${d.note})`, 60 + halfW + 140, currY + 22);

      ctx.font = 'bold 13px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillStyle = d.name.includes('산재보험') ? '#94a3b8' : '#dc2626';
      ctx.textAlign = 'right';
      ctx.fillText(`${formatCurrency(d.amount)}원`, width - 80, currY + 22);
    }

    currY += rowH;
  }

  // 소계 행 (지급총액 & 공제총액)
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(60, currY, width - 120, 40);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(60, currY, halfW, 40);
  ctx.strokeRect(60 + halfW, currY, halfW, 40);

  ctx.font = 'bold 14px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.textAlign = 'left';
  ctx.fillText('총 지 급 액', 75, currY + 26);
  ctx.textAlign = 'right';
  ctx.fillText(`${formatCurrency(record.grossSalary)}원`, 60 + halfW - 20, currY + 26);

  ctx.fillStyle = '#047857';
  ctx.textAlign = 'left';
  ctx.fillText('총 공 제 액', 60 + halfW + 15, currY + 26);
  ctx.textAlign = 'right';
  ctx.fillText(`${formatCurrency(record.totalDeductions)}원`, width - 80, currY + 26);

  currY += 40;

  // 4. 실수령액 강조 상자
  currY += 20;
  ctx.fillStyle = '#eff6ff';
  ctx.fillRect(60, currY, width - 120, 64);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.strokeRect(60, currY, width - 120, 64);

  ctx.font = 'bold 18px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#1e40af';
  ctx.textAlign = 'left';
  ctx.fillText('실 수 령 액  (지급계 - 공제계)', 85, currY + 39);

  ctx.font = 'bold 26px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#1d4ed8';
  ctx.textAlign = 'right';
  ctx.fillText(`${formatCurrency(record.netSalary)} 원`, width - 85, currY + 41);

  // 5. 법정 필수: 계산 방법 및 산출 근거 상세 내역
  currY += 84;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(60, currY, width - 120, 360);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(60, currY, width - 120, 360);

  // 안내 헤더
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 14px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('■ 근로기준법 제48조에 따른 항목별 산출근거 및 계산방법', 80, currY + 30);

  const explanations = [
    `1. 통상시급: ${formatCurrency(record.hourlyRate)}원 (기본급 ${formatCurrency(record.baseSalary)}원 ÷ 월 소정근로시간 ${record.regularHours}시간)`,
    `2. 연장근로수당: ${formatCurrency(record.overtimePay)}원 = 통상시급 ${formatCurrency(record.hourlyRate)}원 × 연장근로 ${record.overtimeHours}시간 × 150% 가산율`,
    `3. 야간근로수당: ${formatCurrency(record.nightPay)}원 = 통상시급 ${formatCurrency(record.hourlyRate)}원 × 야간근로 ${record.nightHours}시간 × 50% 가산율`,
    `4. 휴일근로수당: ${formatCurrency(record.holidayPay)}원 = 통상시급 ${formatCurrency(record.hourlyRate)}원 × 휴일근로 ${record.holidayHours}시간 × 150% 가산율`,
    `5. 비과세 식대: ${formatCurrency(Math.min(record.mealAllowance, settings.mealNonTaxableLimit))}원 (소득세법 제12조 월 20만 원 한도 비과세 적용)`,
    `6. 4대 사회보험료 산정 기준 (과세대상 급여액: ${formatCurrency(record.totalTaxable)}원):`,
    `   - 국민연금: ${formatCurrency(record.nationalPension)}원 (기준소득월액 상한 6,170,000원 / 하한 390,000원 범위 내 4.5%)`,
    `   - 건강보험: ${formatCurrency(record.healthInsurance)}원 (과세급여의 3.545%, 10원 미만 절사)`,
    `   - 노인장기요양보험: ${formatCurrency(record.longTermCare)}원 (건강보험료의 12.95%, 10원 미만 절사)`,
    `   - 고용보험: ${formatCurrency(record.employmentInsurance)}원 (과세급여의 0.9%, 10원 미만 절사)`,
    `   - 산재보험: 전액 사업주 부담으로 근로자 부담액 없음`,
    `7. 소득세 및 지방소득세: 국세청 근로소득 간이세액표 누진 기준 및 지방세법(소득세의 10%) 적용`,
  ];

  ctx.font = '12px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#475569';
  let expY = currY + 60;
  for (const line of explanations) {
    ctx.fillText(line, 85, expY);
    expY += 22;
  }

  // 6. 하단 회사 인장 및 문구
  const footerY = height - 120;
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(60, footerY);
  ctx.lineTo(width - 60, footerY);
  ctx.stroke();

  ctx.font = 'bold 18px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.textAlign = 'center';
  ctx.fillText('양 우 종 합 건 설   주 식 회 사', width / 2, footerY + 45);

  ctx.font = '12px "Pretendard", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`사업자등록번호: ${settings.businessNo}   |   본 급여명세서는 전자서명 및 승인 절차를 거쳐 발행되었습니다.`, width / 2, footerY + 70);

  return canvas;
}

/**
 * 단일 직원의 급여명세서 PDF Blob 생성
 */
export async function generatePayslipPdfBlob(
  record: EmployeeSalaryRecord,
  settings: PayrollSettings,
  approvalVersion: number = 1
): Promise<Blob> {
  const canvas = await renderPayslipToCanvas(record, settings, approvalVersion);
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  // jsPDF A4 세로 규격 (210mm x 297mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  return pdf.output('blob');
}

/**
 * 단일 직원 급여명세서 PDF 파일 다운로드
 * 파일명: 양우종합건설_급여명세서_YYYYMM_사번.pdf
 */
export async function downloadPayslipPdf(
  record: EmployeeSalaryRecord,
  settings: PayrollSettings,
  approvalVersion: number = 1
): Promise<void> {
  const blob = await generatePayslipPdfBlob(record, settings, approvalVersion);
  const cleanYm = settings.yearMonth.replace(/[^0-9]/g, '');
  const fileName = `양우종합건설_급여명세서_${cleanYm}_${record.employeeNo}.pdf`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 전체 직원 개별 PDF를 압축한 ZIP 파일 일괄 다운로드
 * 파일명: 양우종합건설_급여명세서_YYYYMM_전체.zip
 */
export async function downloadAllPayslipsZip(
  records: EmployeeSalaryRecord[],
  settings: PayrollSettings,
  approvalVersion: number = 1,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const cleanYm = settings.yearMonth.replace(/[^0-9]/g, '');
  const total = records.length;

  for (let i = 0; i < total; i++) {
    const record = records[i];
    if (onProgress) onProgress(i + 1, total);
    const pdfBlob = await generatePayslipPdfBlob(record, settings, approvalVersion);
    const fileName = `양우종합건설_급여명세서_${cleanYm}_${record.employeeNo}.pdf`;
    zip.file(fileName, pdfBlob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFileName = `양우종합건설_급여명세서_${cleanYm}_전체.zip`;

  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = zipFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
