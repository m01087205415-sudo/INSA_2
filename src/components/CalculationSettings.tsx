/**
 * 양우종합건설 스마트 급여계산기 - 계산기준 설정 컴포넌트
 * 
 * [원칙] 기존 계산기준(4대보험 요율, 비과세 한도, 지급일 등)을 보존 및 관리합니다.
 * 승인 완료 후 기준 변경 시 새 버전으로 관리되고 재결재를 거치도록 연동합니다.
 */

import React, { useState } from 'react';
import { PayrollSettings, ApprovalStatus } from '../types/payroll';
import { DEFAULT_SETTINGS } from '../utils/calculator';
import { Settings2, Save, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react';

interface CalculationSettingsProps {
  settings: PayrollSettings;
  onSaveSettings: (newSettings: PayrollSettings) => void;
  approvalStatus: ApprovalStatus;
  approvalVersion: number;
}

export const CalculationSettings: React.FC<CalculationSettingsProps> = ({
  settings,
  onSaveSettings,
  approvalStatus,
  approvalVersion,
}) => {
  const [formData, setFormData] = useState<PayrollSettings>({ ...settings });
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleResetToDefault = () => {
    if (confirm('2026년 법정 표준 급여 계산 기준으로 초기화하시겠습니까?')) {
      setFormData({ ...DEFAULT_SETTINGS, yearMonth: formData.yearMonth });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 타이틀 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-900" />
            <h2 className="text-xl font-bold text-slate-900">급여 계산기준 설정</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            대한민국 근로기준법 및 4대 사회보험 요율, 비과세 한도와 지급 일정을 관리합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>표준 법정 기준값 복원</span>
          </button>
        </div>
      </div>

      {/* 승인 완료 후 변경 시 버전 분리 경고 */}
      {approvalStatus === 'APPROVED' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-sm text-amber-950">
              현재 v{approvalVersion}.0 버전으로 승인 완료된 상태입니다.
            </span>
            <p className="text-amber-800">
              계산 기준이나 날짜를 변경하시면 이전 승인본(v{approvalVersion}.0)은 그대로 보존되며, 새로운 급여 산출 버전(v{approvalVersion + 1}.0)이 생성되어 재결재 후 발송이 가능해집니다.
            </p>
          </div>
        </div>
      )}

      {/* 저장 성공 알림 */}
      {savedNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>계산기준 설정이 성공적으로 저장되었습니다. 대장 데이터가 실시간 재산출됩니다.</span>
        </div>
      )}

      {/* 설정 폼 */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. 귀속 일정 및 회사 정보 */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            1. 급여 귀속 일정 및 회사 기본 정보
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-medium mb-1">귀속연월 (YYYY-MM)</label>
              <input
                type="month"
                required
                value={formData.yearMonth}
                onChange={(e) => setFormData({ ...formData, yearMonth: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">산정기간 시작일</label>
              <input
                type="date"
                required
                value={formData.periodStart}
                onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">산정기간 종료일</label>
              <input
                type="date"
                required
                value={formData.periodEnd}
                onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">급여 지급일자</label>
              <input
                type="date"
                required
                value={formData.payday}
                onChange={(e) => setFormData({ ...formData, payday: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">회사명</label>
              <input
                type="text"
                required
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">사업자등록번호</label>
              <input
                type="text"
                required
                value={formData.businessNo}
                onChange={(e) => setFormData({ ...formData, businessNo: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
          </div>
        </div>

        {/* 2. 4대 사회보험 요율 (근로자 부담분) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900">
              2. 4대 사회보험 요율 및 상하한액 (근로자 부담분)
            </h3>
            <span className="text-xs text-slate-500">※ 산재보험은 전액 회사 부담으로 근로자 공제 제외</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                국민연금 요율 (근로자 4.5% = 0.045)
              </label>
              <input
                type="number"
                step="0.0001"
                required
                value={formData.nationalPensionRate}
                onChange={(e) => setFormData({ ...formData, nationalPensionRate: Number(e.target.value) })}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">국민연금 기준소득 하한액 (원)</label>
              <input
                type="number"
                required
                value={formData.pensionLowerLimit}
                onChange={(e) => setFormData({ ...formData, pensionLowerLimit: Number(e.target.value) })}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">국민연금 기준소득 상한액 (원)</label>
              <input
                type="number"
                required
                value={formData.pensionUpperLimit}
                onChange={(e) => setFormData({ ...formData, pensionUpperLimit: Number(e.target.value) })}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                건강보험 요율 (근로자 3.545% = 0.03545)
              </label>
              <input
                type="number"
                step="0.00001"
                required
                value={formData.healthInsuranceRate}
                onChange={(e) => setFormData({ ...formData, healthInsuranceRate: Number(e.target.value) })}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                장기요양보험 요율 (건보료의 12.95% = 0.1295)
              </label>
              <input
                type="number"
                step="0.0001"
                required
                value={formData.longTermCareRate}
                onChange={(e) => setFormData({ ...formData, longTermCareRate: Number(e.target.value) })}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                고용보험 요율 (근로자 0.9% = 0.009)
              </label>
              <input
                type="number"
                step="0.0001"
                required
                value={formData.employmentInsuranceRate}
                onChange={(e) => setFormData({ ...formData, employmentInsuranceRate: Number(e.target.value) })}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* 3. 비과세 한도 */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            3. 법정 비과세 공제 기준
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                식대 월 비과세 한도 (원) - 소득세법 제12조
              </label>
              <input
                type="number"
                required
                value={formData.mealNonTaxableLimit}
                onChange={(e) => setFormData({ ...formData, mealNonTaxableLimit: Number(e.target.value) })}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                2023년 세법 개정 이후 월 200,000원 한도로 비과세 적용됩니다.
              </span>
            </div>
          </div>
        </div>

        {/* 하단 저장 버튼 */}
        <div className="flex justify-end gap-3">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-6 py-2.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>설정 저장 및 급여대장 재계산</span>
          </button>
        </div>
      </form>
    </div>
  );
};
