/**
 * 양우종합건설 스마트 급여계산기 - 급여 및 4대보험·세금 산출 유틸리티
 * 
 * [원칙] 기존 계산식, 데이터 필드, 10원 미만 절사 기준, 비과세 분리 규칙을 엄격히 보존합니다.
 */

import { EmployeeSalaryRecord, PayrollSettings } from '../types/payroll';

export const DEFAULT_SETTINGS: PayrollSettings = {
  yearMonth: '2026-10',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  payday: '2026-11-10',
  companyName: '양우종합건설',
  businessNo: '120-81-74892',
  nationalPensionRate: 0.045, // 4.5%
  pensionLowerLimit: 390000,
  pensionUpperLimit: 6170000,
  healthInsuranceRate: 0.03545, // 3.545%
  longTermCareRate: 0.1295, // 건강보험료의 12.95%
  employmentInsuranceRate: 0.009, // 0.9%
  mealNonTaxableLimit: 200000, // 월 20만 원
};

/**
 * 10원 단위 미만 절사 (대한민국 원천징수 세법 원칙)
 */
export function truncate10(amount: number): number {
  return Math.floor(Math.max(0, amount) / 10) * 10;
}

/**
 * 이메일 정규식 검증
 */
export function isValidEmail(email: string | undefined): boolean {
  if (!email || email.trim() === '') return true; // 선택 필드이므로 빈 값은 형식 오류 아님
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

/**
 * 대한민국 간이세액표 기반 표준 근로소득세 추정 산식 (월 급여 기준)
 */
export function calculateIncomeTax(taxableMonthlySalary: number): number {
  if (taxableMonthlySalary <= 1060000) {
    return 0; // 최저 면세점 이하
  }

  // 연환산 과세소득 추정
  const annualTaxable = taxableMonthlySalary * 12;
  
  // 근로소득공제 (소득세법 제47조)
  let wageDeduction = 0;
  if (annualTaxable <= 5000000) {
    wageDeduction = annualTaxable * 0.7;
  } else if (annualTaxable <= 15000000) {
    wageDeduction = 3500000 + (annualTaxable - 5000000) * 0.4;
  } else if (annualTaxable <= 45000000) {
    wageDeduction = 7500000 + (annualTaxable - 15000000) * 0.15;
  } else if (annualTaxable <= 100000000) {
    wageDeduction = 12000000 + (annualTaxable - 45000000) * 0.05;
  } else {
    wageDeduction = 14750000 + (annualTaxable - 100000000) * 0.02;
  }

  // 기본인적공제 및 특별소득공제 표준액 (1인 기준 약 3,100,000원)
  const personalDeduction = 3100000;
  const taxBase = Math.max(0, annualTaxable - wageDeduction - personalDeduction);

  // 종합소득세 기본세율 (2026 기준 누진공제)
  let annualTax = 0;
  if (taxBase <= 14000000) {
    annualTax = taxBase * 0.06;
  } else if (taxBase <= 50000000) {
    annualTax = 840000 + (taxBase - 14000000) * 0.15;
  } else if (taxBase <= 88000000) {
    annualTax = 6240000 + (taxBase - 50000000) * 0.24;
  } else if (taxBase <= 150000000) {
    annualTax = 15360000 + (taxBase - 88000000) * 0.35;
  } else {
    annualTax = 37060000 + (taxBase - 150000000) * 0.38;
  }

  // 근로소득세액공제 (소득세법 제59조)
  let taxCredit = 0;
  if (annualTax <= 1300000) {
    taxCredit = annualTax * 0.55;
    if (taxCredit > 660000) taxCredit = 660000;
  } else {
    taxCredit = 715000 + (annualTax - 1300000) * 0.3;
    if (taxCredit > 660000) taxCredit = 660000;
  }

  const calculatedTaxAnnual = Math.max(0, annualTax - taxCredit);
  const monthlyTax = calculatedTaxAnnual / 12;

  return truncate10(monthlyTax);
}

/**
 * 단일 직원 급여 재계산 및 유효성 검증
 */
export function calculateSalaryRecord(
  input: Partial<EmployeeSalaryRecord>,
  settings: PayrollSettings = DEFAULT_SETTINGS
): EmployeeSalaryRecord {
  const id = input.id || `emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const employeeNo = input.employeeNo?.trim() || '';
  const name = input.name?.trim() || '';
  const department = input.department?.trim() || '미지정';
  const position = input.position?.trim() || '사원';
  const email = input.email ? input.email.trim() : undefined;

  const workingDays = Math.max(0, Number(input.workingDays) || 0);
  const regularHours = Math.max(0, Number(input.regularHours) || 209); // 월 소정근로 기본 209시간
  const baseSalary = Math.max(0, Number(input.baseSalary) || 0);

  // 통상시급: 입력값 또는 (기본급 / 소정근로시간)
  const calculatedHourlyRate = regularHours > 0 ? Math.round(baseSalary / regularHours) : 0;
  const hourlyRate = input.hourlyRate && input.hourlyRate > 0 ? Number(input.hourlyRate) : calculatedHourlyRate;

  // 법정 가산수당 시간
  const overtimeHours = Math.max(0, Number(input.overtimeHours) || 0);
  const nightHours = Math.max(0, Number(input.nightHours) || 0);
  const holidayHours = Math.max(0, Number(input.holidayHours) || 0);

  // 법정 수당 계산 (기존 데이터에 명시적 금액이 없을 경우 산출식 적용)
  const overtimePay = input.overtimePay !== undefined ? Number(input.overtimePay) : Math.round(hourlyRate * overtimeHours * 1.5);
  const nightPay = input.nightPay !== undefined ? Number(input.nightPay) : Math.round(hourlyRate * nightHours * 0.5);
  const holidayPay = input.holidayPay !== undefined ? Number(input.holidayPay) : Math.round(hourlyRate * holidayHours * 1.5);

  const fixedAllowance = Math.max(0, Number(input.fixedAllowance) || 0);
  const bonus = Math.max(0, Number(input.bonus) || 0);
  const rawMealAllowance = Math.max(0, Number(input.mealAllowance) || 0);
  const otherTaxablePay = Math.max(0, Number(input.otherTaxablePay) || 0);
  const otherNonTaxablePay = Math.max(0, Number(input.otherNonTaxablePay) || 0);

  // 식대 비과세 분리 (월 200,000원 한도)
  const nonTaxableMeal = Math.min(rawMealAllowance, settings.mealNonTaxableLimit);
  const taxableMeal = Math.max(0, rawMealAllowance - settings.mealNonTaxableLimit);

  // 비과세 및 과세 합계
  const totalNonTaxable = nonTaxableMeal + otherNonTaxablePay;
  const totalTaxable = baseSalary + fixedAllowance + overtimePay + nightPay + holidayPay + bonus + taxableMeal + otherTaxablePay;
  const grossSalary = totalTaxable + totalNonTaxable;

  // 4대보험 공제 (근로자 부담분)
  // 국민연금 (상한/하한 적용)
  const pensionBase = Math.min(Math.max(totalTaxable, settings.pensionLowerLimit), settings.pensionUpperLimit);
  const nationalPension = input.nationalPension !== undefined && input.isEdited
    ? Number(input.nationalPension)
    : truncate10(pensionBase * settings.nationalPensionRate);

  // 건강보험
  const healthInsurance = input.healthInsurance !== undefined && input.isEdited
    ? Number(input.healthInsurance)
    : truncate10(totalTaxable * settings.healthInsuranceRate);

  // 장기요양보험 (건강보험료의 12.95%)
  const longTermCare = input.longTermCare !== undefined && input.isEdited
    ? Number(input.longTermCare)
    : truncate10(healthInsurance * settings.longTermCareRate);

  // 고용보험
  const employmentInsurance = input.employmentInsurance !== undefined && input.isEdited
    ? Number(input.employmentInsurance)
    : truncate10(totalTaxable * settings.employmentInsuranceRate);

  // 세금 계산
  const incomeTax = input.incomeTax !== undefined && input.isEdited
    ? Number(input.incomeTax)
    : calculateIncomeTax(totalTaxable);

  const localIncomeTax = input.localIncomeTax !== undefined && input.isEdited
    ? Number(input.localIncomeTax)
    : truncate10(incomeTax * 0.1);

  const otherDeductions = Math.max(0, Number(input.otherDeductions) || 0);

  // 총 공제 및 실수령액
  const totalDeductions = nationalPension + healthInsurance + longTermCare + employmentInsurance + incomeTax + localIncomeTax + otherDeductions;
  const netSalary = grossSalary - totalDeductions;

  // 유효성 검증
  const validationErrors: string[] = [];
  if (!name) validationErrors.push('성명이 누락되었습니다.');
  if (!employeeNo) validationErrors.push('사번이 누락되었습니다.');
  if (baseSalary <= 0) validationErrors.push('기본급이 0원 이하입니다.');
  if (email && !isValidEmail(email)) validationErrors.push('이메일 형식이 유효하지 않습니다.');

  const isValid = validationErrors.length === 0;

  return {
    id,
    employeeNo,
    name,
    department,
    position,
    email,
    workingDays,
    regularHours,
    hourlyRate,
    overtimeHours,
    nightHours,
    holidayHours,
    baseSalary,
    fixedAllowance,
    overtimePay,
    nightPay,
    holidayPay,
    bonus,
    mealAllowance: rawMealAllowance,
    otherTaxablePay,
    otherNonTaxablePay,
    totalTaxable,
    totalNonTaxable,
    grossSalary,
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    incomeTax,
    localIncomeTax,
    otherDeductions,
    totalDeductions,
    netSalary,
    isValid,
    validationErrors,
    isEdited: input.isEdited || false,
  };
}

/**
 * 콤마 포맷팅 헬퍼 (예: 3,500,000)
 */
export function formatCurrency(amount: number): string {
  return (amount || 0).toLocaleString('ko-KR');
}
