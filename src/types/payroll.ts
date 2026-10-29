/**
 * 양우종합건설 스마트 급여계산기 - 통합 타입 정의
 */

// 직원 및 급여 원장 항목
export interface EmployeeSalaryRecord {
  id: string; // 고유 ID (예: emp_001)
  employeeNo: string; // 사번 (예: YW-2024-001)
  name: string; // 성명
  department: string; // 부서 (예: 현장시공팀, 본사 재경팀, 공무안전팀 등)
  position: string; // 직급 (예: 부장, 과장, 대리, 사원, 반장)
  email?: string; // 급여명세서 수신 이메일 (신규 확장 필드 - 선택)

  // 근로 산출 근거 (시간 및 단가)
  workingDays: number; // 근무일수
  regularHours: number; // 소정근로시간
  hourlyRate: number; // 통상시급
  overtimeHours: number; // 연장근로시간
  nightHours: number; // 야간근로시간
  holidayHours: number; // 휴일근로시간

  // 지급 항목
  baseSalary: number; // 기본급
  fixedAllowance: number; // 고정수당 (직책수당/현장수당 등)
  overtimePay: number; // 연장근로수당
  nightPay: number; // 야간근로수당
  holidayPay: number; // 휴일근로수당
  bonus: number; // 상여금
  mealAllowance: number; // 식대 (비과세 한도 월 20만 원)
  otherTaxablePay: number; // 기타 과세수당
  otherNonTaxablePay: number; // 기타 비과세수당

  // 계산된 지급 합계
  totalTaxable: number; // 과세 대상 급여액
  totalNonTaxable: number; // 비과세 대상 급여액
  grossSalary: number; // 총지급액

  // 공제 항목 (근로자 부담분)
  nationalPension: number; // 국민연금
  healthInsurance: number; // 건강보험
  longTermCare: number; // 장기요양보험
  employmentInsurance: number; // 고용보험
  incomeTax: number; // 근로소득세
  localIncomeTax: number; // 지방소득세 (소득세의 10%)
  otherDeductions: number; // 기타공제 (사우회비 등)
  totalDeductions: number; // 공제합계

  // 실지급액
  netSalary: number; // 실수령액 (총지급액 - 공제합계)

  // 검증 및 상태 플래그
  isValid: boolean; // 유효성 검증 통과 여부
  validationErrors?: string[]; // 에러 사유 (예: 이메일 형식 오류, 필수값 누락 등)
  isEdited?: boolean; // 화면에서 수동 수정 여부
}

// 계산 기준 및 설정
export interface PayrollSettings {
  yearMonth: string; // 귀속연월 (예: '2026-10')
  periodStart: string; // 급여 산정 시작일 (예: '2026-10-01')
  periodEnd: string; // 급여 산정 종료일 (예: '2026-10-31')
  payday: string; // 급여 지급일 (예: '2026-11-10')
  companyName: string; // '양우종합건설'
  businessNo: string; // 사업자번호 (예: 120-81-12345)

  // 4대보험 요율 (근로자 부담률)
  nationalPensionRate: number; // 4.5%
  pensionLowerLimit: number; // 하한액 (390,000원)
  pensionUpperLimit: number; // 상한액 (6,170,000원)
  healthInsuranceRate: number; // 3.545%
  longTermCareRate: number; // 건강보험료의 12.95%
  employmentInsuranceRate: number; // 0.9%
  mealNonTaxableLimit: number; // 식대 비과세 한도 (200,000원)
}

// 결재 상태
export type ApprovalStatus = 'DRAFT' | 'REQUESTED' | 'APPROVED' | 'REJECTED';

// 결재 스냅샷 및 버전 관리
export interface PayrollApprovalSnapshot {
  id: string; // 결재 고유 식별자
  yearMonth: string; // 귀속연월
  version: number; // 승인 버전 (1, 2, ...)
  status: ApprovalStatus;
  
  // 요청 및 처리 정보
  requesterName: string; // 결재 요청자 성명
  requesterRole: string; // 결재 요청자 직책 (예: 급여담당 대리)
  requestedAt: string; // 요청 일시 ISO
  
  approverName?: string; // 결재자 성명
  approverRole?: string; // 결재자 직책 (예: 재경이사 / 대표이사)
  processedAt?: string; // 처리 일시 ISO
  comment?: string; // 승인/반려 의견

  // 요약 메트릭
  employeeCount: number;
  totalGrossSalary: number;
  totalDeductions: number;
  totalNetSalary: number;
  
  // 변경 불가 보관 데이터
  records: EmployeeSalaryRecord[];
  settings: PayrollSettings;
  createdAt: string;
}

// 이메일 발송 상태
export type EmailDispatchStatus =
  | 'NOT_SENT' // 미발송
  | 'QUEUED' // 발송 대기
  | 'PROCESSING' // 처리 중
  | 'SENT_ACCEPTED' // 전송 접수
  | 'DELIVERED' // 전달 확인 (제공업체 웹훅/이벤트 수신 시)
  | 'FAILED' // 실패
  | 'BOUNCED' // 반송
  | 'NEEDS_VERIFICATION'; // 결과 확인 필요

// 발송 이력 및 감사 기록
export interface EmailDispatchLog {
  id: string; // 로그 ID
  yearMonth: string; // 귀속연월
  employeeId: string; // 직원 식별자
  employeeNo: string; // 사번
  employeeName: string; // 성명
  department: string; // 부서
  recipientEmail: string; // 수신 이메일
  approvalVersion: number; // 승인 버전
  payslipId: string; // 명세서 식별자
  
  requestedBy: string; // 발송 요청자
  requestedAt: string; // 요청 일시
  providerMessageId?: string; // 메일 제공업체 메시지 ID
  status: EmailDispatchStatus;
  statusMessage?: string; // 상태 메시지 또는 오류 원인
  failureReason?: string; // 실패·반송 사유
  retryCount: number; // 재발송 횟수
  retryReason?: string; // 재발송 사유
  deliveredAt?: string; // 전달 확인 시각
}

// 이메일 템플릿
export interface EmailTemplateConfig {
  subject: string;
  body: string;
}

// 사용자 권한 및 세션
export interface CurrentUserSession {
  id: string;
  name: string;
  department: string;
  role: 'PAYROLL_OFFICER' | 'APPROVER_MANAGER' | 'SYSTEM_ADMIN';
  roleLabel: string;
  email: string;
}
