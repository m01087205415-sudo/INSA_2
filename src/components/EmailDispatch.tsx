/**
 * 양우종합건설 스마트 급여계산기 - 이메일 발송 및 감사 이력 관리 컴포넌트
 * 
 * [원칙]
 * 1. 승인 완료 후 발송 대상 및 수신 주소 검토를 거쳐 1인 1통 개별 발송
 * 2. 메일 서버(SMTP) 미설정 시 '이메일 발송 설정 필요' 정직 안내 및 발송 비활성화 (가짜 성공 불가)
 * 3. 멱등성 보장 (연월+사번+승인버전) 및 재발송 이력 추적
 * 4. 발송 이력 검색·필터 및 발송 이력 엑셀 다운로드 제공
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  EmployeeSalaryRecord,
  PayrollSettings,
  ApprovalStatus,
  EmailDispatchLog,
  CurrentUserSession,
  EmailTemplateConfig,
} from '../types/payroll';
import { isValidEmail } from '../utils/calculator';
import { generatePayslipPdfBlob } from '../utils/pdfGenerator';
import { exportDispatchHistoryToExcel } from '../utils/excel';
import {
  Mail,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Settings,
  Search,
  Filter,
  RefreshCw,
  Server,
  Lock,
  RotateCcw,
  Check,
  Loader2,
} from 'lucide-react';

interface EmailDispatchProps {
  records: EmployeeSalaryRecord[];
  settings: PayrollSettings;
  approvalStatus: ApprovalStatus;
  approvalVersion: number;
  hasUnapprovedChanges: boolean;
  currentUser: CurrentUserSession;
  onNavigateToApproval: () => void;
}

export const EmailDispatch: React.FC<EmailDispatchProps> = ({
  records,
  settings,
  approvalStatus,
  approvalVersion,
  hasUnapprovedChanges,
  currentUser,
  onNavigateToApproval,
}) => {
  // 탭: 'dispatch_review' (발송 사전검토 및 실행) vs 'history' (발송 이력 및 감사 기록)
  const [activeSubTab, setActiveSubTab] = useState<'dispatch_review' | 'history'>('dispatch_review');

  // 서버 SMTP 상태
  const [serverSmtpStatus, setServerSmtpStatus] = useState<{
    loading: boolean;
    isConfigured: boolean;
    host: string | null;
    sender: string | null;
    message: string;
  }>({
    loading: true,
    isConfigured: false,
    host: null,
    sender: null,
    message: '서버 상태를 확인하는 중...',
  });

  // 선택된 발송 대상 직원 ID 목록
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 이메일 템플릿 설정
  const [template, setTemplate] = useState<EmailTemplateConfig>({
    subject: `[양우종합건설] ${settings.yearMonth} 급여명세서 안내`,
    body: `안녕하세요, {직원명}님.\n${settings.yearMonth} 급여명세서를 보내드립니다.\n\n급여 산정기간: {산정기간}\n급여 지급일: {지급일}\n\n자세한 내역은 첨부된 급여명세서 PDF 파일을 확인해 주시기 바랍니다.\n문의 사항은 경영지원본부 급여담당자에게 연락해 주십시오.\n\n감사합니다.\n양우종합건설 주식회사`,
  });
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // 발송 진행 상태
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number; currentName: string } | null>(null);

  // 발송 이력 로그 목록
  const [dispatchLogs, setDispatchLogs] = useState<EmailDispatchLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // 이력 필터 상태
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('ALL');

  // 재발송 모달 상태
  const [resendTarget, setResendTarget] = useState<EmailDispatchLog | null>(null);
  const [resendReason, setResendReason] = useState('');

  // 1. 서버 SMTP 상태 및 발송 이력 로드
  const fetchServerStatus = async () => {
    try {
      const res = await fetch('/api/email/status');
      const data = await res.json();
      setServerSmtpStatus({
        loading: false,
        isConfigured: data.isConfigured,
        host: data.host,
        sender: data.from,
        message: data.message,
      });
    } catch {
      setServerSmtpStatus({
        loading: false,
        isConfigured: false,
        host: null,
        sender: null,
        message: '서버 통신 실패: 백엔드 API 연결을 확인할 수 없습니다.',
      });
    }
  };

  const fetchHistoryLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/email/history');
      const data = await res.json();
      if (data.logs) {
        setDispatchLogs(data.logs);
      }
    } catch {
      console.error('발송 이력 로드 실패');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchServerStatus();
    fetchHistoryLogs();
  }, []);

  // 2. 발송 대상 사전 분류 (적격 vs 제외)
  const eligibility = useMemo(() => {
    const eligible: EmployeeSalaryRecord[] = [];
    const excluded: { record: EmployeeSalaryRecord; reason: string }[] = [];
    const duplicateEmails = new Map<string, string[]>();

    records.forEach((r) => {
      // 1) 이메일 누락 검사
      if (!r.email || r.email.trim() === '') {
        excluded.push({ record: r, reason: '이메일 주소 미등록' });
        return;
      }
      // 2) 이메일 형식 검사
      if (!isValidEmail(r.email)) {
        excluded.push({ record: r, reason: '이메일 형식 오류' });
        return;
      }
      // 3) 급여 데이터 오류 검사
      if (!r.isValid) {
        excluded.push({ record: r, reason: `급여 계산 오류: ${r.validationErrors?.join(', ')}` });
        return;
      }

      // 동일 이메일 주소 그룹화
      const cleanEmail = r.email.trim().toLowerCase();
      const list = duplicateEmails.get(cleanEmail) || [];
      list.push(r.name);
      duplicateEmails.set(cleanEmail, list);

      eligible.push(r);
    });

    const duplicatesList: { email: string; names: string[] }[] = [];
    duplicateEmails.forEach((names, email) => {
      if (names.length > 1) {
        duplicatesList.push({ email, names });
      }
    });

    return {
      eligible,
      excluded,
      duplicatesList,
    };
  }, [records]);

  // 최초 적격 직원 전체 자동 선택
  useEffect(() => {
    setSelectedIds(eligibility.eligible.map((r) => r.id));
  }, [eligibility.eligible]);

  // 체크박스 선택 토글
  const toggleSelectAll = () => {
    if (selectedIds.length === eligibility.eligible.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibility.eligible.map((r) => r.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 3. 실제 발송 실행 함수
  const handleExecuteDispatch = async () => {
    if (!serverSmtpStatus.isConfigured) {
      alert('이메일 서버(SMTP)가 구성되지 않았습니다. .env 설정 후 서버를 재시작해 주세요.');
      return;
    }

    if (approvalStatus !== 'APPROVED') {
      alert('급여 결재가 최종 승인되지 않은 상태에서는 이메일을 발송할 수 없습니다.');
      return;
    }

    if (hasUnapprovedChanges) {
      alert('승인 이후 변경사항이 있습니다. 새 버전으로 재결재를 거쳐야 발송할 수 있습니다.');
      return;
    }

    const targets = eligibility.eligible.filter((r) => selectedIds.includes(r.id));
    if (targets.length === 0) {
      alert('발송할 대상 직원을 1명 이상 선택해 주세요.');
      return;
    }

    if (eligibility.duplicatesList.length > 0) {
      const confirmDup = confirm(
        `경고: 동일한 이메일 주소로 등록된 직원이 ${eligibility.duplicatesList.length}건 있습니다.\n계속 진행하시겠습니까?`
      );
      if (!confirmDup) return;
    }

    setIsSending(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const emp = targets[i];
      setSendProgress({ current: i + 1, total: targets.length, currentName: emp.name });

      try {
        // 1) 고해상도 한글 PDF 생성
        const pdfBlob = await generatePayslipPdfBlob(emp, settings, approvalVersion);
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(pdfBlob);
        });
        const pdfBase64 = await base64Promise;

        // 2) 템플릿 치환 (민감 급여액은 본문에 노출하지 않음)
        const parsedSubject = template.subject
          .replace('{직원명}', emp.name)
          .replace('{산정기간}', `${settings.periodStart} ~ ${settings.periodEnd}`)
          .replace('{지급일}', settings.payday);

        const parsedBody = template.body
          .replace('{직원명}', emp.name)
          .replace('{산정기간}', `${settings.periodStart} ~ ${settings.periodEnd}`)
          .replace('{지급일}', settings.payday);

        const cleanYm = settings.yearMonth.replace(/[^0-9]/g, '');
        const fileName = `양우종합건설_급여명세서_${cleanYm}_${emp.employeeNo}.pdf`;

        // 3) 서버 API 개별 발송 요청 (1인 1통)
        const response = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            yearMonth: settings.yearMonth,
            approvalVersion,
            employeeId: emp.id,
            employeeNo: emp.employeeNo,
            employeeName: emp.name,
            department: emp.department,
            recipientEmail: emp.email,
            subject: parsedSubject,
            body: parsedBody,
            pdfBase64,
            fileName,
            requestedBy: `${currentUser.name} (${currentUser.roleLabel})`,
            isRetry: false,
          }),
        });

        const resData = await response.json();
        if (response.ok && resData.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    setIsSending(false);
    setSendProgress(null);
    await fetchHistoryLogs();
    setActiveSubTab('history');
    alert(`이메일 개별 발송이 완료되었습니다.\n성공: ${successCount}건 / 실패: ${failCount}건`);
  };

  // 재발송 핸들러
  const handleExecuteResend = async () => {
    if (!resendTarget) return;
    if (!resendReason.trim()) {
      alert('재발송 사유를 반드시 입력해야 합니다.');
      return;
    }

    const emp = records.find((r) => r.employeeNo === resendTarget.employeeNo);
    if (!emp) {
      alert('해당 직원의 급여 데이터를 찾을 수 없습니다.');
      return;
    }

    try {
      const pdfBlob = await generatePayslipPdfBlob(emp, settings, resendTarget.approvalVersion);
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(pdfBlob);
      });
      const pdfBase64 = await base64Promise;

      const cleanYm = settings.yearMonth.replace(/[^0-9]/g, '');
      const fileName = `양우종합건설_급여명세서_${cleanYm}_${emp.employeeNo}.pdf`;

      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearMonth: resendTarget.yearMonth,
          approvalVersion: resendTarget.approvalVersion,
          employeeId: emp.id,
          employeeNo: emp.employeeNo,
          employeeName: emp.name,
          department: emp.department,
          recipientEmail: emp.email,
          subject: `[재발송] ${template.subject.replace('{직원명}', emp.name)}`,
          body: `[안내: 재발송된 명세서입니다 (사유: ${resendReason})]\n\n${template.body.replace('{직원명}', emp.name)}`,
          pdfBase64,
          fileName,
          requestedBy: `${currentUser.name} (${currentUser.roleLabel})`,
          isRetry: true,
          retryReason: resendReason,
        }),
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        alert(`[${emp.name}] 직원에게 급여명세서가 재발송되었습니다.`);
        setResendTarget(null);
        setResendReason('');
        await fetchHistoryLogs();
      } else {
        alert('재발송 실패: ' + (resData.error || '오류 발생'));
      }
    } catch (err: any) {
      alert('재발송 처리 오류: ' + err.message);
    }
  };

  // 이력 검색 및 필터링
  const filteredHistory = useMemo(() => {
    return dispatchLogs.filter((log) => {
      const q = historySearch.toLowerCase();
      const matchesSearch =
        log.employeeName.toLowerCase().includes(q) ||
        log.employeeNo.toLowerCase().includes(q) ||
        log.department.toLowerCase().includes(q) ||
        log.recipientEmail.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (historyStatusFilter !== 'ALL' && log.status !== historyStatusFilter) {
        return false;
      }
      return true;
    });
  }, [dispatchLogs, historySearch, historyStatusFilter]);

  return (
    <div className="space-y-6">
      {/* 1. 상단 타이틀 및 탭 전환 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-900" />
            <h2 className="text-xl font-bold text-slate-900">이메일 발송 및 감사 관리</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
              {settings.yearMonth} 귀속
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            승인된 급여명세서를 직원별 개인 이메일로 1인 1통 개별 전송하고 발송 이력을 기록합니다.
          </p>
        </div>

        {/* 서브 탭 전환 버튼 */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs self-start md:self-auto">
          <button
            onClick={() => setActiveSubTab('dispatch_review')}
            className={`px-3 py-1.5 font-semibold rounded-md transition-colors ${
              activeSubTab === 'dispatch_review'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            발송 대상 검토 및 실행
          </button>
          <button
            onClick={() => {
              setActiveSubTab('history');
              fetchHistoryLogs();
            }}
            className={`px-3 py-1.5 font-semibold rounded-md transition-colors flex items-center gap-1 ${
              activeSubTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>발송 이력 및 감사 기록</span>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full">
              {dispatchLogs.length}
            </span>
          </button>
        </div>
      </div>

      {/* 2. 서버 SMTP 연결 상태 카드 (요구사항: 미설정 시 가짜 성공 불가 및 솔직한 상태 안내) */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
          serverSmtpStatus.isConfigured
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/80 border-amber-300 text-amber-950'
        }`}
      >
        <div className="flex items-start gap-3">
          <Server className={`w-5 h-5 shrink-0 mt-0.5 ${serverSmtpStatus.isConfigured ? 'text-emerald-700' : 'text-amber-700'}`} />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">
                {serverSmtpStatus.isConfigured
                  ? '이메일 발송 서버 (SMTP) 연결 정상'
                  : '이메일 발송 설정 필요 (SMTP 환경변수 미등록)'}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                serverSmtpStatus.isConfigured ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
              }`}>
                {serverSmtpStatus.isConfigured ? '실제 발송 가능' : '실제 발송 비활성화'}
              </span>
            </div>
            <p className="text-[11px] opacity-90">
              {serverSmtpStatus.isConfigured ? (
                <>발신 주소: <strong>{serverSmtpStatus.sender}</strong> (호스트: {serverSmtpStatus.host})</>
              ) : (
                <>
                  안내: 실제 메일 전송을 위해서는 <code>.env</code> 파일에 <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>가 설정되어야 합니다.
                  현재 환경에서는 임의의 성공 상태를 가장하지 않으며, 미리보기와 PDF/ZIP 다운로드는 계속 정상 사용 가능합니다.
                </>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={fetchServerStatus}
          className="self-end sm:self-auto flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>상태 재확인</span>
        </button>
      </div>

      {/* 3-A. 탭 1: 발송 사전검토 및 실행 */}
      {activeSubTab === 'dispatch_review' && (
        <div className="space-y-6">
          {/* 결재 상태 점검 배너 */}
          {approvalStatus !== 'APPROVED' ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
              <Lock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-sm text-rose-950">
                  [발송 불가] 급여 결재가 최종 승인되지 않았습니다.
                </span>
                <p className="text-rose-800">
                  미승인 급여는 외부로 전송될 수 없습니다. [급여 결재] 탭에서 결재 상신 및 최종 승인을 마친 후 발송해 주세요.
                </p>
                <div className="pt-1">
                  <button
                    onClick={onNavigateToApproval}
                    className="font-bold text-blue-900 underline hover:text-blue-950"
                  >
                    급여 결재 탭으로 이동 →
                  </button>
                </div>
              </div>
            </div>
          ) : hasUnapprovedChanges ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-sm text-amber-950">
                  [재결재 필요] 승인 이후 급여 원장 또는 기준이 변경되었습니다.
                </span>
                <p className="text-amber-800">
                  변경된 데이터는 새 버전(v{approvalVersion + 1}.0)으로 재결재를 거쳐야만 발송할 수 있습니다.
                </p>
                <div className="pt-1">
                  <button
                    onClick={onNavigateToApproval}
                    className="font-bold text-blue-900 underline hover:text-blue-950"
                  >
                    새 버전 재결재 요청하러 가기 →
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* 발송 대상 통계 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 text-xs">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-slate-500">전체 원장 직원</div>
              <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {records.length}명
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-emerald-700 font-semibold">발송 가능 대상 (적격)</div>
              <div className="text-xl font-bold text-emerald-800 mt-1 tabular-nums">
                {eligibility.eligible.length}명
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                선택됨: {selectedIds.length}명
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-rose-700 font-semibold">발송 제외 대상 (부적격)</div>
              <div className="text-xl font-bold text-rose-800 mt-1 tabular-nums">
                {eligibility.excluded.length}명
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                이메일 누락 및 형식 오류
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-amber-700 font-semibold">동일 이메일 중복 주의</div>
              <div className="text-xl font-bold text-amber-800 mt-1 tabular-nums">
                {eligibility.duplicatesList.length}건
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                발송 전 확인 요구
              </div>
            </div>
          </div>

          {/* 제외 사유 목록 표시 (요구사항: 제외 인원과 사유 표시) */}
          {eligibility.excluded.length > 0 && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>발송 제외 인원 및 사유 ({eligibility.excluded.length}명)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {eligibility.excluded.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-rose-50/50 border border-rose-100 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{item.record.name}</span>
                      <span className="text-slate-500 ml-1">({item.record.employeeNo})</span>
                    </div>
                    <span className="text-rose-700 text-[11px] font-medium">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 발송 대상 목록 테이블 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.length === eligibility.eligible.length &&
                      eligibility.eligible.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded text-blue-900 border-slate-300"
                  />
                  <span>발송 적격 대상 전체 선택 ({selectedIds.length}/{eligibility.eligible.length}명)</span>
                </label>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setShowTemplateModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-600" />
                  <span>이메일 템플릿 수정</span>
                </button>

                <button
                  onClick={handleExecuteDispatch}
                  disabled={
                    isSending ||
                    selectedIds.length === 0 ||
                    approvalStatus !== 'APPROVED' ||
                    hasUnapprovedChanges ||
                    !serverSmtpStatus.isConfigured
                  }
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors ${
                    !serverSmtpStatus.isConfigured
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : approvalStatus !== 'APPROVED' || hasUnapprovedChanges
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : selectedIds.length === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-900 hover:bg-blue-800 text-white cursor-pointer'
                  }`}
                  title={
                    !serverSmtpStatus.isConfigured
                      ? '이메일 발송 설정 필요 (SMTP 미설정)'
                      : approvalStatus !== 'APPROVED'
                      ? '결재 승인 완료 후 발송 가능'
                      : '선택된 직원에게 개별 이메일 발송'
                  }
                >
                  {isSending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isSending
                      ? `발송 중 (${sendProgress?.current}/${sendProgress?.total})...`
                      : !serverSmtpStatus.isConfigured
                      ? '이메일 발송 설정 필요'
                      : `선택 직원 (${selectedIds.length}명) 개별 발송 실행`}
                  </span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">선택</th>
                    <th className="py-2.5 px-3">사번</th>
                    <th className="py-2.5 px-3">성명</th>
                    <th className="py-2.5 px-3">부서 / 직급</th>
                    <th className="py-2.5 px-3">수신 이메일 주소</th>
                    <th className="py-2.5 px-3">귀속연월 / 승인버전</th>
                    <th className="py-2.5 px-3">첨부 명세서 파일명</th>
                    <th className="py-2.5 px-3 text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eligibility.eligible.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        발송 가능한 적격 직원이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    eligibility.eligible.map((r) => {
                      const isSelected = selectedIds.includes(r.id);
                      const isDup = eligibility.duplicatesList.some(
                        (d) => d.email === (r.email || '').trim().toLowerCase()
                      );
                      const cleanYm = settings.yearMonth.replace(/[^0-9]/g, '');
                      const fileName = `양우종합건설_급여명세서_${cleanYm}_${r.employeeNo}.pdf`;

                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isSelected ? 'bg-blue-50/30' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(r.id)}
                              className="w-4 h-4 rounded text-blue-900 border-slate-300"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                            {r.employeeNo}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                            {r.name}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                            {r.department} · {r.position}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-800">{r.email}</span>
                              {isDup && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold" title="동일 이메일 주소 중복 등록">
                                  중복주의
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {settings.yearMonth} (v{approvalVersion}.0)
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                            {fileName}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-emerald-700 font-semibold">발송 준비</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3-B. 탭 2: 발송 이력 및 감사 기록 */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* 상단 필터 및 다운로드 바 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="직원명, 사번, 이메일 검색..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-slate-800"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <select
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value)}
                  className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="ALL">전체 발송 상태</option>
                  <option value="SENT_ACCEPTED">전송 접수</option>
                  <option value="DELIVERED">전달 확인</option>
                  <option value="FAILED">실패</option>
                  <option value="BOUNCED">반송</option>
                  <option value="NEEDS_VERIFICATION">결과 확인 필요</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <button
                onClick={fetchHistoryLogs}
                disabled={isLoadingLogs}
                className="flex items-center gap-1 px-3 py-1.5 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                <span>새로고침</span>
              </button>

              <button
                onClick={() => exportDispatchHistoryToExcel(dispatchLogs, settings.yearMonth)}
                disabled={dispatchLogs.length === 0}
                className="flex items-center gap-1 px-3.5 py-1.5 font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors shadow-2xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>발송 이력 엑셀 다운로드</span>
              </button>
            </div>
          </div>

          {/* 발송 이력 테이블 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">귀속연월</th>
                    <th className="py-2.5 px-3">사번 / 성명</th>
                    <th className="py-2.5 px-3">수신 이메일</th>
                    <th className="py-2.5 px-3">승인버전</th>
                    <th className="py-2.5 px-3">발송 요청자 / 일시</th>
                    <th className="py-2.5 px-3">현재 상태</th>
                    <th className="py-2.5 px-3">메시지 ID / 사유</th>
                    <th className="py-2.5 px-3 text-center">재발송</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        {isLoadingLogs
                          ? '이력을 불러오는 중입니다...'
                          : '아직 발송 이력이 없습니다. [발송 대상 검토] 탭에서 발송을 실행해 주세요.'}
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((log) => {
                      const isSuccess = log.status === 'SENT_ACCEPTED' || log.status === 'DELIVERED';
                      return (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                            {log.yearMonth}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-bold text-slate-900">{log.employeeName}</span>
                            <span className="text-slate-500 ml-1">({log.employeeNo})</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                            {log.recipientEmail}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                            v{log.approvalVersion}.0
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            <div>{log.requestedBy}</div>
                            <div className="text-[10px] text-slate-400">
                              {log.requestedAt ? new Date(log.requestedAt).toLocaleString('ko-KR') : '-'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {isSuccess ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {log.status === 'DELIVERED' ? '전달 확인' : '전송 접수'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                                <XCircle className="w-3.5 h-3.5" />
                                {log.status === 'FAILED' ? '발송 실패' : log.status}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 max-w-xs truncate text-slate-600" title={log.failureReason || log.providerMessageId}>
                            {log.failureReason ? (
                              <span className="text-rose-700">{log.failureReason}</span>
                            ) : (
                              <span className="font-mono text-[10px] text-slate-500">{log.providerMessageId || '-'}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => {
                                setResendTarget(log);
                                setResendReason('');
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                            >
                              재발송
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. 이메일 템플릿 수정 모달 */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              이메일 제목 및 본문 템플릿 설정
            </h3>
            <p className="text-xs text-slate-500">
              치환 변수: <code>{'{직원명}'}</code>, <code>{'{산정기간}'}</code>, <code>{'{지급일}'}</code>
              <br />
              ※ 개인정보 보호를 위해 급여 금액 등 민감정보는 본문에 직접 노출하지 않고 암호화된 PDF 첨부로 전달됩니다.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">메일 제목</label>
                <input
                  type="text"
                  value={template.subject}
                  onChange={(e) => setTemplate({ ...template, subject: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">메일 본문</label>
                <textarea
                  rows={8}
                  value={template.body}
                  onChange={(e) => setTemplate({ ...template, body: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg"
              >
                설정 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 재발송 사유 입력 모달 */}
      {resendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-blue-900" />
              <h3 className="text-base font-bold text-slate-900">
                급여명세서 명시적 재발송
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              대상: <strong>{resendTarget.employeeName}</strong> ({resendTarget.employeeNo})
              <br />
              수신 이메일: <strong>{resendTarget.recipientEmail}</strong>
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                재발송 사유 입력 (필수)
              </label>
              <textarea
                rows={3}
                required
                value={resendReason}
                onChange={(e) => setResendReason(e.target.value)}
                placeholder="예: 근로자 요청에 따른 재발송, 수신함 용량 초과 해결 후 재전송 등..."
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setResendTarget(null);
                  setResendReason('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleExecuteResend}
                disabled={!resendReason.trim()}
                className={`px-4 py-2 text-xs font-semibold rounded-lg ${
                  resendReason.trim()
                    ? 'text-white bg-blue-900 hover:bg-blue-800 shadow-xs'
                    : 'text-slate-400 bg-slate-200 cursor-not-allowed'
                }`}
              >
                재발송 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
