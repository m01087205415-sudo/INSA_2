/**
 * 양우종합건설 스마트 급여계산기 - 급여 결재 승인 워크플로 컴포넌트
 * 
 * [요구사항]
 * 1. 상태: 작성 중 (DRAFT) → 결재 요청 (REQUESTED) → 승인 완료 (APPROVED) / 반려 (REJECTED)
 * 2. 결재 요청: 대상 직원, 지급일, 총지급액, 총공제액, 총실수령액, 확인 필요 항목 표시
 * 3. 미확정 상태(오류 데이터, 필수값 누락) 차단: 최종 승인 불가
 * 4. 권한 검증: 결재권자(재경이사/대표이사) 세션만 승인/반려 가능
 * 5. 변경 불가능한 스냅샷 버전 보관 및 승인 후 변경 시 재결재 워크플로
 */

import React, { useState } from 'react';
import {
  EmployeeSalaryRecord,
  PayrollSettings,
  ApprovalStatus,
  PayrollApprovalSnapshot,
  CurrentUserSession,
} from '../types/payroll';
import { formatCurrency } from '../utils/calculator';
import {
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Shield,
  History,
  Info,
  Lock,
} from 'lucide-react';

interface ApprovalWorkflowProps {
  records: EmployeeSalaryRecord[];
  settings: PayrollSettings;
  approvalStatus: ApprovalStatus;
  approvalVersion: number;
  hasUnapprovedChanges: boolean;
  currentUser: CurrentUserSession;
  history: PayrollApprovalSnapshot[];
  onRequestApproval: (comment: string) => void;
  onProcessApproval: (decision: 'APPROVE' | 'REJECT', comment: string) => void;
  onNavigateToPayslips: () => void;
}

export const ApprovalWorkflow: React.FC<ApprovalWorkflowProps> = ({
  records,
  settings,
  approvalStatus,
  approvalVersion,
  hasUnapprovedChanges,
  currentUser,
  history,
  onRequestApproval,
  onProcessApproval,
  onNavigateToPayslips,
}) => {
  const [commentInput, setCommentInput] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState<'REQUEST' | 'APPROVE' | 'REJECT' | null>(null);

  // 미확정/오류 직원 필터
  const invalidRecords = records.filter((r) => !r.isValid);
  const missingEmailRecords = records.filter((r) => !r.email || r.email.trim() === '');

  // 메트릭 합계
  const totals = records.reduce(
    (acc, r) => {
      acc.gross += r.grossSalary;
      acc.deductions += r.totalDeductions;
      acc.net += r.netSalary;
      return acc;
    },
    { gross: 0, deductions: 0, net: 0 }
  );

  // 권한 검증
  const canRequest = currentUser.role === 'PAYROLL_OFFICER' || currentUser.role === 'SYSTEM_ADMIN';
  const canApprove = currentUser.role === 'APPROVER_MANAGER' || currentUser.role === 'SYSTEM_ADMIN';

  // 결재 요청 실행
  const handleExecuteRequest = () => {
    onRequestApproval(commentInput.trim() || '2026년 10월 정기 급여 결재를 요청합니다.');
    setCommentInput('');
    setShowConfirmModal(null);
  };

  // 결재 승인 또는 반려 실행
  const handleExecuteDecision = (decision: 'APPROVE' | 'REJECT') => {
    if (decision === 'APPROVE' && invalidRecords.length > 0) {
      alert('오류가 있는 직원이 포함되어 있어 최종 승인을 진행할 수 없습니다. 대장에서 먼저 오류를 해결해 주세요.');
      return;
    }
    onProcessApproval(decision, commentInput.trim());
    setCommentInput('');
    setShowConfirmModal(null);
  };

  return (
    <div className="space-y-6">
      {/* 1. 상단 상태 요약 배너 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-blue-900" />
              <h2 className="text-xl font-bold text-slate-900">
                급여 결재 및 승인 워크플로
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 font-semibold border border-slate-200">
                {settings.yearMonth} 귀속 (버전 v{approvalVersion}.0)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              급여담당자의 결재 상신 및 승인권자의 검토·의결을 통해 위변조 불가 스냅샷을 생성합니다.
            </p>
          </div>

          {/* 파이프라인 상태 시각화 */}
          <div className="flex items-center gap-2 text-xs">
            <div
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border font-medium ${
                approvalStatus === 'DRAFT'
                  ? 'bg-amber-50 border-amber-300 text-amber-900 ring-1 ring-amber-400'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>작성 중</span>
            </div>
            <span className="text-slate-300">→</span>
            <div
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border font-medium ${
                approvalStatus === 'REQUESTED'
                  ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-400'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>결재 요청</span>
            </div>
            <span className="text-slate-300">→</span>
            <div
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border font-medium ${
                approvalStatus === 'APPROVED'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-1 ring-emerald-400'
                  : approvalStatus === 'REJECTED'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              {approvalStatus === 'APPROVED' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>승인 완료 (v{approvalVersion}.0)</span>
                </>
              ) : approvalStatus === 'REJECTED' ? (
                <>
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>결재 반려</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>최종 승인</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 승인 후 미결재 변경 경고 배너 */}
      {hasUnapprovedChanges && approvalStatus === 'APPROVED' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-sm text-amber-950">
              [경고] 승인 완료 이후 급여 원장 또는 계산 기준에 변경사항이 발생했습니다!
            </span>
            <p className="text-amber-800">
              이전 승인 버전(v{approvalVersion}.0)과 발송 이력은 영구 보존됩니다. 변경된 급여 데이터로 명세서를 발송하려면 새 버전(v{approvalVersion + 1}.0)으로 <strong>재결재를 요청하여 최종 승인을 받아야 합니다.</strong>
            </p>
          </div>
        </div>
      )}

      {/* 2. 결재 검토 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">대상 인원 및 일정</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {records.length} <span className="text-xs font-normal text-slate-500">명</span>
          </div>
          <div className="text-xs text-slate-600 mt-2 space-y-0.5">
            <div>지급예정일: <strong>{settings.payday}</strong></div>
            <div>산정기간: {settings.periodStart} ~ {settings.periodEnd}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">총 지급액 (과세+비과세)</div>
          <div className="text-2xl font-bold text-blue-900 mt-1 tabular-nums">
            {formatCurrency(totals.gross)} <span className="text-xs font-normal text-slate-500">원</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            기본급 및 제수당 포함
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">총 공제액 (4대보험·세금)</div>
          <div className="text-2xl font-bold text-rose-700 mt-1 tabular-nums">
            {formatCurrency(totals.deductions)} <span className="text-xs font-normal text-slate-500">원</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            근로자 부담 원천징수 합계
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">총 실수령액</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
            {formatCurrency(totals.net)} <span className="text-xs font-normal text-slate-500">원</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            실지급 이체 총액
          </div>
        </div>
      </div>

      {/* 3. 확인 필요 항목 및 미확정 검증 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-800" />
          <span>결재 심사 전 사전 확인 항목 및 필수 검증</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* 계산 오류 검증 */}
          <div
            className={`p-4 rounded-xl border ${
              invalidRecords.length > 0
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="flex items-center gap-2 font-bold mb-1">
              {invalidRecords.length > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>급여 계산 오류 및 필수값 누락: {invalidRecords.length}건 (승인 차단 요건)</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>급여 계산 검증 통과: 0건 오류</span>
                </>
              )}
            </div>
            <p className="text-[11px] opacity-90">
              {invalidRecords.length > 0
                ? '오류가 있는 직원은 최종 승인 대상에 포함될 수 없으며, 결재 승인이 원천 차단됩니다.'
                : '모든 직원의 기본급, 근로시간 및 4대보험·세금 산출식이 정상 검증되었습니다.'}
            </p>
            {invalidRecords.length > 0 && (
              <ul className="mt-2 space-y-1 list-disc pl-4 text-[11px] text-rose-800">
                {invalidRecords.map((r) => (
                  <li key={r.id}>
                    <strong>{r.name}</strong> ({r.employeeNo}): {r.validationErrors?.join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 이메일 등록 상태 점검 */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
            <div className="flex items-center gap-2 font-bold mb-1 text-slate-900">
              <Info className="w-4 h-4 text-slate-600" />
              <span>명세서 수신 이메일 등록 현황</span>
            </div>
            <p className="text-[11px] text-slate-600">
              이메일 등록 {records.length - missingEmailRecords.length}명 / 미등록 {missingEmailRecords.length}명
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              ※ 이메일이 미등록된 직원도 급여명세서 생성 및 사내 출력·PDF 다운로드는 지원됩니다. (이메일 발송 시에는 안전하게 자동 제외됩니다.)
            </p>
          </div>
        </div>
      </div>

      {/* 4. 결재 상신 및 승인 액션 패널 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-900" />
            <h3 className="text-sm font-bold text-slate-900">결재 처리 및 의결</h3>
          </div>
          <div className="text-xs text-slate-500">
            현재 로그인: <strong>{currentUser.name}</strong> ({currentUser.roleLabel})
          </div>
        </div>

        {/* 결재 단계별 버튼 */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-600">
            {approvalStatus === 'DRAFT' && (
              <span>현재 작성 중 상태입니다. 급여담당자가 내용을 검토한 후 결재를 요청할 수 있습니다.</span>
            )}
            {approvalStatus === 'REQUESTED' && (
              <span className="text-blue-900 font-semibold">
                결재가 상신되었습니다. 결재권자(재경이사/대표이사)의 승인 또는 반려를 기다리고 있습니다.
              </span>
            )}
            {approvalStatus === 'APPROVED' && (
              <span className="text-emerald-800 font-semibold">
                v{approvalVersion}.0 버전으로 승인 완료되었습니다. 급여명세서 생성 및 이메일 발송이 가능합니다.
              </span>
            )}
            {approvalStatus === 'REJECTED' && (
              <span className="text-rose-800 font-semibold">
                결재가 반려되었습니다. 대장에서 급여 내역을 보완한 후 다시 결재를 요청해 주세요.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* 결재 요청 버튼 (DRAFT 또는 REJECTED 또는 변경사항 있을 때) */}
            {(approvalStatus === 'DRAFT' || approvalStatus === 'REJECTED' || hasUnapprovedChanges) && (
              <button
                onClick={() => setShowConfirmModal('REQUEST')}
                disabled={!canRequest}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors ${
                  canRequest
                    ? 'bg-blue-900 hover:bg-blue-800 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
                title={canRequest ? '결재 요청' : '급여담당자 권한이 필요합니다.'}
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {hasUnapprovedChanges && approvalStatus === 'APPROVED'
                    ? `새 버전(v${approvalVersion + 1}.0) 재결재 요청`
                    : '급여 결재 요청'}
                </span>
              </button>
            )}

            {/* 승인 / 반려 버튼 (REQUESTED 상태일 때) */}
            {approvalStatus === 'REQUESTED' && (
              <>
                <button
                  onClick={() => setShowConfirmModal('REJECT')}
                  disabled={!canApprove}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    canApprove
                      ? 'border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 cursor-pointer'
                      : 'border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed'
                  }`}
                  title={canApprove ? '결재 반려' : '결재권자(재경이사 이상) 권한이 필요합니다.'}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>반려</span>
                </button>

                <button
                  onClick={() => setShowConfirmModal('APPROVE')}
                  disabled={!canApprove || invalidRecords.length > 0}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors ${
                    canApprove && invalidRecords.length === 0
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                  title={
                    invalidRecords.length > 0
                      ? '오류 직원이 있어 승인 불가'
                      : canApprove
                      ? '최종 승인'
                      : '결재권자 권한 필요'
                  }
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>최종 승인 (v{approvalVersion}.0)</span>
                </button>
              </>
            )}

            {/* 승인 완료 시 명세서 생성 탭 바로가기 */}
            {approvalStatus === 'APPROVED' && (
              <button
                onClick={onNavigateToPayslips}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
              >
                <span>급여명세서 확인 및 발송 →</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 5. 결재 이력 및 버전 스냅샷 내역 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-600" />
            <h3 className="text-xs font-bold text-slate-900">결재 이력 및 버전 스냅샷 기록</h3>
          </div>
          <span className="text-[11px] text-slate-500">
            총 {history.length}건의 결재 이벤트 보관됨
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-2.5 px-3">버전</th>
                <th className="py-2.5 px-3">귀속연월</th>
                <th className="py-2.5 px-3">결재 상태</th>
                <th className="py-2.5 px-3">요청자 / 일시</th>
                <th className="py-2.5 px-3">결재자 / 일시</th>
                <th className="py-2.5 px-3 text-right">인원 / 총지급액</th>
                <th className="py-2.5 px-3">결재 의견</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    아직 등록된 결재 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                      v{h.version}.0
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">{h.yearMonth}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {h.status === 'APPROVED' ? (
                        <span className="text-emerald-700 font-semibold">승인 완료</span>
                      ) : h.status === 'REQUESTED' ? (
                        <span className="text-blue-700 font-semibold">결재 요청</span>
                      ) : (
                        <span className="text-rose-700 font-semibold">반려</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                      <div>{h.requesterName} ({h.requesterRole})</div>
                      <div className="text-[10px] text-slate-400">
                        {h.requestedAt ? new Date(h.requestedAt).toLocaleString('ko-KR') : '-'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                      {h.approverName ? (
                        <>
                          <div>{h.approverName} ({h.approverRole})</div>
                          <div className="text-[10px] text-slate-400">
                            {h.processedAt ? new Date(h.processedAt).toLocaleString('ko-KR') : '-'}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-400">심사 대기</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      <div>{h.employeeCount}명</div>
                      <div className="font-semibold text-blue-900">{formatCurrency(h.totalGrossSalary)}원</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={h.comment}>
                      {h.comment || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. 결재 확인 팝업 모달 */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {showConfirmModal === 'REQUEST' && '급여 결재 상신'}
              {showConfirmModal === 'APPROVE' && '급여 최종 승인 의결'}
              {showConfirmModal === 'REJECT' && '급여 결재 반려'}
            </h3>

            <p className="text-xs text-slate-600">
              {showConfirmModal === 'REQUEST' &&
                '결재권자에게 결재를 요청합니다. 총지급액 및 4대보험 산출 내역이 함께 전달됩니다.'}
              {showConfirmModal === 'APPROVE' &&
                '최종 승인 시 현재 급여 데이터는 변경 불가능한 스냅샷(v' +
                  approvalVersion +
                  '.0)으로 영구 보관되며 직원별 급여명세서 생성이 활성화됩니다.'}
              {showConfirmModal === 'REJECT' &&
                '결재를 반려하고 사유를 담당자에게 전달합니다.'}
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {showConfirmModal === 'REJECT' ? '반려 사유 (필수 입력)' : '결재 의견 / 비고'}
              </label>
              <textarea
                rows={3}
                required={showConfirmModal === 'REJECT'}
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={
                  showConfirmModal === 'REJECT'
                    ? '반려 사유를 구체적으로 입력하세요...'
                    : '결재 의견을 입력하세요 (선택)'
                }
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(null);
                  setCommentInput('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                취소
              </button>
              {showConfirmModal === 'REQUEST' && (
                <button
                  type="button"
                  onClick={handleExecuteRequest}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shadow-xs"
                >
                  상신하기
                </button>
              )}
              {showConfirmModal === 'APPROVE' && (
                <button
                  type="button"
                  onClick={() => handleExecuteDecision('APPROVE')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs"
                >
                  승인 의결
                </button>
              )}
              {showConfirmModal === 'REJECT' && (
                <button
                  type="button"
                  onClick={() => handleExecuteDecision('REJECT')}
                  disabled={!commentInput.trim()}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-xs ${
                    commentInput.trim()
                      ? 'text-white bg-rose-700 hover:bg-rose-800'
                      : 'text-slate-400 bg-slate-200 cursor-not-allowed'
                  }`}
                >
                  반려 처리
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
