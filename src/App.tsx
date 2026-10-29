/**
 * 양우종합건설 스마트 급여계산기 - 메인 애플리케이션
 * 
 * [최우선 원칙: 기존 기능 100% 보존]
 * 1. 기존 엑셀 업로드, 항목 매핑, 데이터 검증, 급여 계산, 4대보험·세금 계산,
 *    검색·필터·정렬, 직원별 수정·재계산, 계산기준 설정, 엑셀 다운로드 보존
 * 2. 신규 확장:
 *    - 직원별 '급여명세서 수신 이메일' 선택 필드, 형식 검증 및 동일 주소 중복 경고
 *    - 급여 결재 워크플로 (작성 중 → 결재 요청 → 승인 완료 / 반려, 버전 관리)
 *    - 개인별 급여명세서 생성 (법정 기재사항, 산출근거, 개별 PDF/인쇄, 전체 ZIP 다운로드)
 *    - 이메일 개별 발송 (서버 SMTP 상태 연동, 멱등성 보장, 발송 이력 엑셀)
 */

import React, { useState } from 'react';
import {
  EmployeeSalaryRecord,
  PayrollSettings,
  ApprovalStatus,
  PayrollApprovalSnapshot,
  CurrentUserSession,
} from './types/payroll';
import { DEFAULT_SETTINGS, calculateSalaryRecord } from './utils/calculator';
import { INITIAL_SALARY_RECORDS } from './data/mockPayrollData';
import { Header, USERS_LIST } from './components/Header';
import { PayrollRoster } from './components/PayrollRoster';
import { CalculationSettings } from './components/CalculationSettings';
import { ApprovalWorkflow } from './components/ApprovalWorkflow';
import { PayslipViewer } from './components/PayslipViewer';
import { EmailDispatch } from './components/EmailDispatch';

export default function App() {
  // 현재 활성화된 탭
  const [currentTab, setCurrentTab] = useState<
    'roster' | 'settings' | 'approval' | 'payslip' | 'dispatch'
  >('roster');

  // 급여 계산 기준 설정
  const [settings, setSettings] = useState<PayrollSettings>(DEFAULT_SETTINGS);

  // 급여 원장 데이터
  const [records, setRecords] = useState<EmployeeSalaryRecord[]>(INITIAL_SALARY_RECORDS);

  // 결재 워크플로 상태
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>('DRAFT');
  const [approvalVersion, setApprovalVersion] = useState<number>(1);
  const [hasUnapprovedChanges, setHasUnapprovedChanges] = useState<boolean>(false);

  // 승인된 스냅샷 보관 (이전 버전 데이터 영구 보존)
  const [approvedSnapshot, setApprovedSnapshot] = useState<PayrollApprovalSnapshot | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<PayrollApprovalSnapshot[]>([]);

  // 현재 로그인 사용자 세션
  const [currentUser, setCurrentUser] = useState<CurrentUserSession>(USERS_LIST[0]);

  // 대장 레코드 업데이트 핸들러
  const handleUpdateRecords = (newRecords: EmployeeSalaryRecord[], hasChanged: boolean) => {
    setRecords(newRecords);
    if (hasChanged && approvalStatus === 'APPROVED') {
      setHasUnapprovedChanges(true);
    }
  };

  // 계산 기준 저장 핸들러
  const handleSaveSettings = (newSettings: PayrollSettings) => {
    setSettings(newSettings);
    // 새 기준에 맞춰 전 직원 급여 자동 재산출
    const updated = records.map((r) => calculateSalaryRecord(r, newSettings));
    setRecords(updated);
    if (approvalStatus === 'APPROVED') {
      setHasUnapprovedChanges(true);
    }
  };

  // 결재 요청 핸들러 (급여담당자)
  const handleRequestApproval = (comment: string) => {
    const nextVersion = hasUnapprovedChanges && approvalStatus === 'APPROVED' ? approvalVersion + 1 : approvalVersion;
    setApprovalStatus('REQUESTED');
    if (hasUnapprovedChanges && approvalStatus === 'APPROVED') {
      setApprovalVersion(nextVersion);
    }

    const totals = records.reduce(
      (acc, r) => {
        acc.gross += r.grossSalary;
        acc.deductions += r.totalDeductions;
        acc.net += r.netSalary;
        return acc;
      },
      { gross: 0, deductions: 0, net: 0 }
    );

    const snapshot: PayrollApprovalSnapshot = {
      id: `snap_${Date.now()}`,
      yearMonth: settings.yearMonth,
      version: nextVersion,
      status: 'REQUESTED',
      requesterName: currentUser.name,
      requesterRole: currentUser.roleLabel,
      requestedAt: new Date().toISOString(),
      employeeCount: records.length,
      totalGrossSalary: totals.gross,
      totalDeductions: totals.deductions,
      totalNetSalary: totals.net,
      records: [...records],
      settings: { ...settings },
      comment,
      createdAt: new Date().toISOString(),
    };

    setApprovalHistory((prev) => [snapshot, ...prev]);
  };

  // 결재 승인 또는 반려 핸들러 (결재권자)
  const handleProcessApproval = (decision: 'APPROVE' | 'REJECT', comment: string) => {
    const totals = records.reduce(
      (acc, r) => {
        acc.gross += r.grossSalary;
        acc.deductions += r.totalDeductions;
        acc.net += r.netSalary;
        return acc;
      },
      { gross: 0, deductions: 0, net: 0 }
    );

    if (decision === 'APPROVE') {
      setApprovalStatus('APPROVED');
      setHasUnapprovedChanges(false);

      const approvedSnap: PayrollApprovalSnapshot = {
        id: `snap_app_${Date.now()}`,
        yearMonth: settings.yearMonth,
        version: approvalVersion,
        status: 'APPROVED',
        requesterName: approvalHistory[0]?.requesterName || currentUser.name,
        requesterRole: approvalHistory[0]?.requesterRole || currentUser.roleLabel,
        requestedAt: approvalHistory[0]?.requestedAt || new Date().toISOString(),
        approverName: currentUser.name,
        approverRole: currentUser.roleLabel,
        processedAt: new Date().toISOString(),
        comment,
        employeeCount: records.length,
        totalGrossSalary: totals.gross,
        totalDeductions: totals.deductions,
        totalNetSalary: totals.net,
        records: JSON.parse(JSON.stringify(records)), // Deep clone for immutability
        settings: JSON.parse(JSON.stringify(settings)),
        createdAt: new Date().toISOString(),
      };

      setApprovedSnapshot(approvedSnap);
      setApprovalHistory((prev) => [approvedSnap, ...prev]);
    } else {
      setApprovalStatus('REJECTED');
      const rejectedSnap: PayrollApprovalSnapshot = {
        id: `snap_rej_${Date.now()}`,
        yearMonth: settings.yearMonth,
        version: approvalVersion,
        status: 'REJECTED',
        requesterName: approvalHistory[0]?.requesterName || currentUser.name,
        requesterRole: approvalHistory[0]?.requesterRole || currentUser.roleLabel,
        requestedAt: approvalHistory[0]?.requestedAt || new Date().toISOString(),
        approverName: currentUser.name,
        approverRole: currentUser.roleLabel,
        processedAt: new Date().toISOString(),
        comment,
        employeeCount: records.length,
        totalGrossSalary: totals.gross,
        totalDeductions: totals.deductions,
        totalNetSalary: totals.net,
        records: [...records],
        settings: { ...settings },
        createdAt: new Date().toISOString(),
      };

      setApprovalHistory((prev) => [rejectedSnap, ...prev]);
    }
  };

  // 급여명세서 및 이메일 발송에 사용할 레코드:
  // 승인된 스냅샷이 있고 변경사항이 없으면 불변 스냅샷 레코드 사용,
  // 작성 중일 때는 현재 작업 중인 레코드 사용
  const activeDisplayRecords =
    approvalStatus === 'APPROVED' && approvedSnapshot && !hasUnapprovedChanges
      ? approvedSnapshot.records
      : records;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col font-sans">
      {/* 3-Zone Top Bar */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentUser={currentUser}
        onChangeUser={setCurrentUser}
        approvalStatus={approvalStatus}
        approvalVersion={approvalVersion}
        hasUnapprovedChanges={hasUnapprovedChanges}
      />

      {/* 메인 콘텐츠 뷰포트 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 탭 1: 급여대장 및 계산 (기존 기능) */}
        {currentTab === 'roster' && (
          <PayrollRoster
            records={records}
            onUpdateRecords={handleUpdateRecords}
            settings={settings}
            onRequestApproval={() => setCurrentTab('approval')}
          />
        )}

        {/* 탭 2: 계산기준 설정 (기존 기능) */}
        {currentTab === 'settings' && (
          <CalculationSettings
            settings={settings}
            onSaveSettings={handleSaveSettings}
            approvalStatus={approvalStatus}
            approvalVersion={approvalVersion}
          />
        )}

        {/* 탭 3: 급여 결재 (신규 기능) */}
        {currentTab === 'approval' && (
          <ApprovalWorkflow
            records={records}
            settings={settings}
            approvalStatus={approvalStatus}
            approvalVersion={approvalVersion}
            hasUnapprovedChanges={hasUnapprovedChanges}
            currentUser={currentUser}
            history={approvalHistory}
            onRequestApproval={handleRequestApproval}
            onProcessApproval={handleProcessApproval}
            onNavigateToPayslips={() => setCurrentTab('payslip')}
          />
        )}

        {/* 탭 4: 급여명세서 (신규 기능) */}
        {currentTab === 'payslip' && (
          <PayslipViewer
            records={activeDisplayRecords}
            settings={settings}
            approvalStatus={approvalStatus}
            approvalVersion={approvalVersion}
            onNavigateToApproval={() => setCurrentTab('approval')}
            onNavigateToDispatch={() => setCurrentTab('dispatch')}
          />
        )}

        {/* 탭 5: 이메일 발송 내역 (신규 기능) */}
        {currentTab === 'dispatch' && (
          <EmailDispatch
            records={activeDisplayRecords}
            settings={settings}
            approvalStatus={approvalStatus}
            approvalVersion={approvalVersion}
            hasUnapprovedChanges={hasUnapprovedChanges}
            currentUser={currentUser}
            onNavigateToApproval={() => setCurrentTab('approval')}
          />
        )}
      </main>

      {/* 조용한 하단 푸터 (Zero slop: no telemetry, clean copyright) */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            © 2026 양우종합건설 주식회사 (Yangwoo General Construction Co., Ltd.). All rights reserved.
          </div>
          <div className="text-[11px] text-slate-400">
            근로기준법 제48조 준수 · 개인정보 암호화 및 1인 1통 개별 발송 원칙 적용
          </div>
        </div>
      </footer>
    </div>
  );
}
