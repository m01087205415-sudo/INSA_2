/**
 * 양우종합건설 스마트 급여계산기 - 서버 측 이메일 발송 어댑터 및 멱등성 관리
 */

import nodemailer from 'nodemailer';
import { EmailDispatchLog, EmailDispatchStatus } from '../src/types/payroll';

export interface MailerConfig {
  isConfigured: boolean;
  host?: string;
  port?: number;
  user?: string;
  from?: string;
  secure?: boolean;
}

// 환경변수 기반 SMTP 설정 로드
export function getMailerConfig(): MailerConfig {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || '양우종합건설 급여팀 <payroll@yangwoo.co.kr>';
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const secure = process.env.SMTP_SECURE === 'true';

  // 실제 호스트와 계정이 명시적으로 입력되어 있어야 설정 완료로 판정
  const isConfigured = Boolean(
    host &&
    host !== 'smtp.example.com' &&
    host.trim() !== '' &&
    user &&
    user !== 'payroll@yangwoo.co.kr' &&
    pass &&
    pass !== 'your-smtp-password'
  );

  return {
    isConfigured,
    host,
    port,
    user,
    from,
    secure,
  };
}

// 메모리 기반 멱등성 및 발송 이력 저장소
// key: `${yearMonth}:${employeeNo}:${approvalVersion}`
const dispatchLogs: EmailDispatchLog[] = [];
const sentKeys = new Set<string>();

export function getDispatchLogs(): EmailDispatchLog[] {
  return [...dispatchLogs].reverse();
}

export interface SendMailParams {
  yearMonth: string;
  approvalVersion: number;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  recipientEmail: string;
  subject: string;
  body: string;
  pdfBase64?: string;
  fileName?: string;
  requestedBy: string;
  isRetry?: boolean;
  retryReason?: string;
}

export async function sendPayslipEmail(params: SendMailParams): Promise<{ success: boolean; log: EmailDispatchLog; error?: string }> {
  const config = getMailerConfig();
  const idempotencyKey = `${params.yearMonth}:${params.employeeNo}:${params.approvalVersion}`;

  // 1. 메일 서버 미설정 시 안전 차단 (가짜 발송 성공 절대 금지)
  if (!config.isConfigured) {
    const errorMsg = '이메일 발송 서버(SMTP)가 설정되지 않았습니다. .env 환경변수를 구성해야 실제 발송이 가능합니다.';
    const failedLog: EmailDispatchLog = {
      id: `dispatch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      yearMonth: params.yearMonth,
      employeeId: params.employeeId,
      employeeNo: params.employeeNo,
      employeeName: params.employeeName,
      department: params.department,
      recipientEmail: params.recipientEmail,
      approvalVersion: params.approvalVersion,
      payslipId: `PS-${params.yearMonth.replace('-', '')}-${params.employeeNo}-v${params.approvalVersion}`,
      requestedBy: params.requestedBy,
      requestedAt: new Date().toISOString(),
      status: 'FAILED',
      failureReason: errorMsg,
      retryCount: params.isRetry ? 1 : 0,
      retryReason: params.retryReason,
    };
    return { success: false, log: failedLog, error: errorMsg };
  }

  // 2. 멱등성 검사 (중복 클릭 및 재시도에 의한 무단 중복 발송 방지)
  if (sentKeys.has(idempotencyKey) && !params.isRetry) {
    const errorMsg = `이미 v${params.approvalVersion}.0 버전으로 발송 완료된 명세서입니다. 재발송이 필요한 경우 명시적 재발송을 이용하세요.`;
    const failedLog: EmailDispatchLog = {
      id: `dispatch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      yearMonth: params.yearMonth,
      employeeId: params.employeeId,
      employeeNo: params.employeeNo,
      employeeName: params.employeeName,
      department: params.department,
      recipientEmail: params.recipientEmail,
      approvalVersion: params.approvalVersion,
      payslipId: `PS-${params.yearMonth.replace('-', '')}-${params.employeeNo}-v${params.approvalVersion}`,
      requestedBy: params.requestedBy,
      requestedAt: new Date().toISOString(),
      status: 'NEEDS_VERIFICATION',
      failureReason: errorMsg,
      retryCount: 0,
    };
    return { success: false, log: failedLog, error: errorMsg };
  }

  // 3. 수신 주소 유효성 검증
  if (!params.recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.recipientEmail)) {
    const errorMsg = '유효하지 않은 수신자 이메일 주소입니다.';
    const failedLog: EmailDispatchLog = {
      id: `dispatch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      yearMonth: params.yearMonth,
      employeeId: params.employeeId,
      employeeNo: params.employeeNo,
      employeeName: params.employeeName,
      department: params.department,
      recipientEmail: params.recipientEmail || '미등록',
      approvalVersion: params.approvalVersion,
      payslipId: `PS-${params.yearMonth.replace('-', '')}-${params.employeeNo}-v${params.approvalVersion}`,
      requestedBy: params.requestedBy,
      requestedAt: new Date().toISOString(),
      status: 'FAILED',
      failureReason: errorMsg,
      retryCount: params.isRetry ? 1 : 0,
      retryReason: params.retryReason,
    };
    dispatchLogs.push(failedLog);
    return { success: false, log: failedLog, error: errorMsg };
  }

  // 4. Nodemailer 트랜스포트 생성 및 발송
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    const attachments = [];
    if (params.pdfBase64 && params.fileName) {
      attachments.push({
        filename: params.fileName,
        content: Buffer.from(params.pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64'),
        contentType: 'application/pdf',
      });
    }

    const info = await transporter.sendMail({
      from: config.from,
      to: params.recipientEmail,
      subject: params.subject,
      text: params.body,
      attachments,
    });

    sentKeys.add(idempotencyKey);

    const successLog: EmailDispatchLog = {
      id: `dispatch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      yearMonth: params.yearMonth,
      employeeId: params.employeeId,
      employeeNo: params.employeeNo,
      employeeName: params.employeeName,
      department: params.department,
      recipientEmail: params.recipientEmail,
      approvalVersion: params.approvalVersion,
      payslipId: `PS-${params.yearMonth.replace('-', '')}-${params.employeeNo}-v${params.approvalVersion}`,
      requestedBy: params.requestedBy,
      requestedAt: new Date().toISOString(),
      providerMessageId: info.messageId,
      status: 'SENT_ACCEPTED',
      retryCount: params.isRetry ? 1 : 0,
      retryReason: params.retryReason,
    };

    dispatchLogs.push(successLog);
    return { success: true, log: successLog };
  } catch (err: any) {
    const errorMsg = err?.message || 'SMTP 발송 도중 오류가 발생했습니다.';
    const failedLog: EmailDispatchLog = {
      id: `dispatch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      yearMonth: params.yearMonth,
      employeeId: params.employeeId,
      employeeNo: params.employeeNo,
      employeeName: params.employeeName,
      department: params.department,
      recipientEmail: params.recipientEmail,
      approvalVersion: params.approvalVersion,
      payslipId: `PS-${params.yearMonth.replace('-', '')}-${params.employeeNo}-v${params.approvalVersion}`,
      requestedBy: params.requestedBy,
      requestedAt: new Date().toISOString(),
      status: 'FAILED',
      failureReason: errorMsg,
      retryCount: params.isRetry ? 1 : 0,
      retryReason: params.retryReason,
    };

    dispatchLogs.push(failedLog);
    return { success: false, log: failedLog, error: errorMsg };
  }
}
