/**
 * 양우종합건설 스마트 급여계산기 - 상단 헤더 컴포넌트
 * Top Bar Contract: 3개 존 (브랜드, 네비게이션 탭, 권한 세션 및 상태)
 */

import React from 'react';
import { CurrentUserSession, ApprovalStatus } from '../types/payroll';
import { Building2, UserCheck, ShieldAlert, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface HeaderProps {
  currentTab: 'roster' | 'settings' | 'approval' | 'payslip' | 'dispatch';
  onSelectTab: (tab: 'roster' | 'settings' | 'approval' | 'payslip' | 'dispatch') => void;
  currentUser: CurrentUserSession;
  onChangeUser: (user: CurrentUserSession) => void;
  approvalStatus: ApprovalStatus;
  approvalVersion: number;
  hasUnapprovedChanges: boolean;
}

export const USERS_LIST: CurrentUserSession[] = [
  {
    id: 'user_officer',
    name: '한지수 대리',
    department: '본사 재경팀 (급여담당)',
    role: 'PAYROLL_OFFICER',
    roleLabel: '급여담당자',
    email: 'js.han@yangwoo.co.kr',
  },
  {
    id: 'user_approver',
    name: '강동훈 이사',
    department: '경영지원본부 (재경이사)',
    role: 'APPROVER_MANAGER',
    roleLabel: '결재권자',
    email: 'dh.kang@yangwoo.co.kr',
  },
  {
    id: 'user_admin',
    name: '양우건 대표',
    department: '경영진 (대표이사)',
    role: 'SYSTEM_ADMIN',
    roleLabel: '최고관리자',
    email: 'ceo@yangwoo.co.kr',
  },
];

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  onChangeUser,
  approvalStatus,
  approvalVersion,
  hasUnapprovedChanges,
}) => {
  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-8">
          {/* Zone 1: Brand title wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-blue-900 flex items-center justify-center text-white shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
                양우종합건설 스마트 급여계산기
              </span>
              <div className="text-xs text-slate-500 hidden sm:block">
                <span>정밀 산정 및 승인·발송 시스템</span>
              </div>
            </div>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 shrink-0">
            <button
              onClick={() => onSelectTab('roster')}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                currentTab === 'roster'
                  ? 'bg-slate-100 text-blue-950 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              급여대장·계산
            </button>
            <button
              onClick={() => onSelectTab('settings')}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                currentTab === 'settings'
                  ? 'bg-slate-100 text-blue-950 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              계산기준 설정
            </button>
            <button
              onClick={() => onSelectTab('approval')}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                currentTab === 'approval'
                  ? 'bg-slate-100 text-blue-950 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>급여 결재</span>
              {hasUnapprovedChanges && (
                <span className="w-2 h-2 rounded-full bg-amber-500" title="미결재 변경사항 있음" />
              )}
            </button>
            <button
              onClick={() => onSelectTab('payslip')}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                currentTab === 'payslip'
                  ? 'bg-slate-100 text-blue-950 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              급여명세서
            </button>
            <button
              onClick={() => onSelectTab('dispatch')}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                currentTab === 'dispatch'
                  ? 'bg-slate-100 text-blue-950 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              이메일 발송 내역
            </button>
          </nav>

          {/* Zone 3: 1 Primary Session & Approval Status */}
          <div className="flex items-center gap-3 shrink-0">
            {/* 결재 상태 요약 */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200">
              {approvalStatus === 'APPROVED' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-medium text-emerald-800">승인 완료 (v{approvalVersion}.0)</span>
                </>
              ) : approvalStatus === 'REQUESTED' ? (
                <>
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span className="font-medium text-blue-800">결재 심사 중</span>
                </>
              ) : approvalStatus === 'REJECTED' ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span className="font-medium text-rose-800">결재 반려됨</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-medium text-slate-700">작성 중 (미승인)</span>
                </>
              )}
            </div>

            {/* 권한자 스위처 (실제 권한 검증용) */}
            <div className="flex items-center gap-2">
              <label htmlFor="user-selector" className="sr-only">사용자 권한</label>
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
                <UserCheck className="w-3.5 h-3.5 text-slate-600" />
                <select
                  id="user-selector"
                  value={currentUser.id}
                  onChange={(e) => {
                    const found = USERS_LIST.find((u) => u.id === e.target.value);
                    if (found) onChangeUser(found);
                  }}
                  className="bg-transparent font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                >
                  {USERS_LIST.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.roleLabel})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 모바일 탭 네비게이션 */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1 border-t border-slate-100 text-xs scrollbar-none">
          <button
            onClick={() => onSelectTab('roster')}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap ${
              currentTab === 'roster' ? 'bg-blue-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            급여대장
          </button>
          <button
            onClick={() => onSelectTab('settings')}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap ${
              currentTab === 'settings' ? 'bg-blue-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            계산기준
          </button>
          <button
            onClick={() => onSelectTab('approval')}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap ${
              currentTab === 'approval' ? 'bg-blue-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            급여 결재
          </button>
          <button
            onClick={() => onSelectTab('payslip')}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap ${
              currentTab === 'payslip' ? 'bg-blue-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            급여명세서
          </button>
          <button
            onClick={() => onSelectTab('dispatch')}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap ${
              currentTab === 'dispatch' ? 'bg-blue-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            이메일 발송
          </button>
        </div>
      </div>
    </header>
  );
};
