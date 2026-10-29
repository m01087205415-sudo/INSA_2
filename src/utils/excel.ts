/**
 * 양우종합건설 스마트 급여계산기 - 엑셀 업로드/다운로드 및 매핑 유틸리티
 * 
 * [원칙] 기존 엑셀 다운로드 파일 형식과 필드 구조를 그대로 유지하고,
 * 필요한 경우 발송 이력 엑셀 다운로드는 별도 함수로 제공합니다.
 */

import * as XLSX from 'xlsx';
import { EmployeeSalaryRecord, EmailDispatchLog, PayrollSettings } from '../types/payroll';
import { calculateSalaryRecord } from './calculator';

// 표준 컬럼 헤더 매핑 사전 (한글 헤더 -> 필드 키)
export const HEADER_MAPPING: Record<string, keyof EmployeeSalaryRecord> = {
  사번: 'employeeNo',
  사원번호: 'employeeNo',
  성명: 'name',
  이름: 'name',
  부서: 'department',
  소속: 'department',
  직급: 'position',
  직책: 'position',
  이메일: 'email',
  '이메일 주소': 'email',
  '급여명세서 이메일': 'email',
  email: 'email',
  Email: 'email',
  근무일수: 'workingDays',
  소정근로시간: 'regularHours',
  통상시급: 'hourlyRate',
  연장근로시간: 'overtimeHours',
  연장시간: 'overtimeHours',
  야간근로시간: 'nightHours',
  야간시간: 'nightHours',
  휴일근로시간: 'holidayHours',
  휴일시간: 'holidayHours',
  기본급: 'baseSalary',
  고정수당: 'fixedAllowance',
  직책수당: 'fixedAllowance',
  현장수당: 'fixedAllowance',
  상여금: 'bonus',
  식대: 'mealAllowance',
  '비과세 식대': 'mealAllowance',
  기타과세수당: 'otherTaxablePay',
  기타비과세수당: 'otherNonTaxablePay',
  기타공제: 'otherDeductions',
};

/**
 * 기존 급여대장 엑셀 다운로드
 */
export function exportPayrollToExcel(records: EmployeeSalaryRecord[], settings: PayrollSettings): void {
  const data = records.map((r, idx) => ({
    순번: idx + 1,
    사번: r.employeeNo,
    성명: r.name,
    부서: r.department,
    직급: r.position,
    이메일: r.email || '',
    근무일수: r.workingDays,
    소정근로시간: r.regularHours,
    통상시급: r.hourlyRate,
    연장시간: r.overtimeHours,
    기본급: r.baseSalary,
    고정수당: r.fixedAllowance,
    연장근로수당: r.overtimePay,
    야간근로수당: r.nightPay,
    휴일근로수당: r.holidayPay,
    상여금: r.bonus,
    식대: r.mealAllowance,
    기타과세수당: r.otherTaxablePay,
    기타비과세수당: r.otherNonTaxablePay,
    총지급액: r.grossSalary,
    국민연금: r.nationalPension,
    건강보험: r.healthInsurance,
    장기요양보험: r.longTermCare,
    고용보험: r.employmentInsurance,
    근로소득세: r.incomeTax,
    지방소득세: r.localIncomeTax,
    기타공제: r.otherDeductions,
    공제합계: r.totalDeductions,
    실수령액: r.netSalary,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `${settings.yearMonth}_급여대장`);

  const fileName = `양우종합건설_급여대장_${settings.yearMonth}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

/**
 * 엑셀 서식 템플릿 다운로드 (이메일 열 포함)
 */
export function downloadPayrollTemplate(): void {
  const sampleRows = [
    {
      사번: 'YW-2024-001',
      성명: '홍길동',
      부서: '현장시공팀',
      직급: '과장',
      이메일: 'gildong.hong@yangwoo-sample.co.kr',
      근무일수: 22,
      소정근로시간: 209,
      기본급: 3800000,
      고정수당: 200000,
      연장근로시간: 12,
      야간근로시간: 0,
      휴일근로시간: 0,
      상여금: 0,
      식대: 200000,
      기타과세수당: 0,
      기타비과세수당: 0,
      기타공제: 20000,
    },
    {
      사번: 'YW-2024-002',
      성명: '이순신',
      부서: '공무안전팀',
      직급: '대리',
      이메일: '',
      근무일수: 22,
      소정근로시간: 209,
      기본급: 3200000,
      고정수당: 100000,
      연장근로시간: 8,
      야간근로시간: 0,
      휴일근로시간: 0,
      상여금: 0,
      식대: 200000,
      기타과세수당: 0,
      기타비과세수당: 0,
      기타공제: 15000,
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '급여입력서식');
  XLSX.writeFile(workbook, '양우종합건설_급여입력_표준서식.xlsx');
}

/**
 * 업로드된 엑셀 파일 파싱 및 자동 필드 매핑
 */
export async function parseExcelFile(
  file: File,
  settings: PayrollSettings
): Promise<{ records: EmployeeSalaryRecord[]; headers: string[]; missingRequired: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  if (rawRows.length === 0) {
    throw new Error('엑셀 파일에 데이터 행이 존재하지 않습니다.');
  }

  const detectedHeaders = Object.keys(rawRows[0]);

  // 필수 헤더 검사 (성명, 기본급)
  const missingRequired: string[] = [];
  const hasName = detectedHeaders.some((h) => ['성명', '이름', 'name'].includes(h.trim()));
  const hasBaseSalary = detectedHeaders.some((h) => ['기본급', 'baseSalary'].includes(h.trim()));

  if (!hasName) missingRequired.push('성명');
  if (!hasBaseSalary) missingRequired.push('기본급');

  const records: EmployeeSalaryRecord[] = rawRows.map((row, index) => {
    const recordInput: Partial<EmployeeSalaryRecord> = {
      id: `emp_upload_${Date.now()}_${index}`,
      employeeNo: `YW-${String(index + 1).padStart(3, '0')}`,
    };

    // 자동 헤더 매칭
    for (const [colName, val] of Object.entries(row)) {
      const cleanHeader = colName.trim();
      const mappedKey = HEADER_MAPPING[cleanHeader];
      if (mappedKey) {
        if (
          [
            'workingDays',
            'regularHours',
            'hourlyRate',
            'overtimeHours',
            'nightHours',
            'holidayHours',
            'baseSalary',
            'fixedAllowance',
            'bonus',
            'mealAllowance',
            'otherTaxablePay',
            'otherNonTaxablePay',
            'otherDeductions',
          ].includes(mappedKey)
        ) {
          const num = typeof val === 'number' ? val : Number(String(val).replace(/[^0-9.-]/g, '')) || 0;
          (recordInput as any)[mappedKey] = num;
        } else {
          (recordInput as any)[mappedKey] = String(val).trim();
        }
      }
    }

    // 사번이 지정되지 않은 경우 부여
    if (!recordInput.employeeNo || recordInput.employeeNo.trim() === '') {
      recordInput.employeeNo = `YW-UP-${String(index + 1).padStart(3, '0')}`;
    }

    return calculateSalaryRecord(recordInput, settings);
  });

  return {
    records,
    headers: detectedHeaders,
    missingRequired,
  };
}

/**
 * 발송 이력 엑셀 다운로드 (신규 요구사항 반영)
 */
export function exportDispatchHistoryToExcel(logs: EmailDispatchLog[], yearMonth: string): void {
  const statusLabels: Record<string, string> = {
    NOT_SENT: '미발송',
    QUEUED: '발송 대기',
    PROCESSING: '처리 중',
    SENT_ACCEPTED: '전송 접수',
    DELIVERED: '전달 확인',
    FAILED: '실패',
    BOUNCED: '반송',
    NEEDS_VERIFICATION: '결과 확인 필요',
  };

  const data = logs.map((log, idx) => ({
    순번: idx + 1,
    귀속연월: log.yearMonth,
    사번: log.employeeNo,
    성명: log.employeeName,
    부서: log.department,
    수신이메일: log.recipientEmail,
    승인버전: `v${log.approvalVersion}.0`,
    명세서식별자: log.payslipId,
    발송요청자: log.requestedBy,
    발송요청일시: log.requestedAt ? new Date(log.requestedAt).toLocaleString('ko-KR') : '-',
    현재상태: statusLabels[log.status] || log.status,
    제공업체ID: log.providerMessageId || '-',
    실패반송사유: log.failureReason || '-',
    재발송횟수: log.retryCount,
    재발송사유: log.retryReason || '-',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `${yearMonth}_발송이력`);

  const fileName = `양우종합건설_이메일발송이력_${yearMonth}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
