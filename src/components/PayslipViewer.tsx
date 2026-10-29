/**
 * 양우종합건설 스마트 급여계산기 - 개인별 급여명세서 생성 및 뷰어 컴포넌트
 * 
 * [원칙]
 * 1. 승인 완료된 불변 버전(v1.0 등) 데이터를 사용하여 1인 1명세서 격리 생성
 * 2. 근로기준법 제48조 법정 기재사항 및 산출근거(시간, 단가, 가산율, 4대보험 요율) 완벽 표시
 * 3. 산재보험 등 사업주 부담금 제외, 원 단위 천 단위 쉼표 명확화
 * 4. 한글 깨짐 방지 PDF 다운로드, 전 직원 개별 PDF 압축 ZIP 다운로드, 인쇄 지원
 */

import React, { useState } from 'react';
import { EmployeeSalaryRecord, PayrollSettings, ApprovalStatus } from '../types/payroll';
import { formatCurrency } from '../utils/calculator';
import { downloadPayslipPdf, downloadAllPayslipsZip } from '../utils/pdfGenerator';
import {
  FileText,
  Printer,
  Download,
  Archive,
  Search,
  CheckCircle2,
  AlertTriangle,
  Building,
  Calendar,
  Lock,
  Mail,
  Loader2,
} from 'lucide-react';

interface PayslipViewerProps {
  records: EmployeeSalaryRecord[];
  settings: PayrollSettings;
  approvalStatus: ApprovalStatus;
  approvalVersion: number;
  onNavigateToApproval: () => void;
  onNavigateToDispatch: () => void;
}

export const PayslipViewer: React.FC<PayslipViewerProps> = ({
  records,
  settings,
  approvalStatus,
  approvalVersion,
  onNavigateToApproval,
  onNavigateToDispatch,
}) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    records.length > 0 ? records[0].id : ''
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);

  // 선택된 직원 데이터
  const selectedRecord = records.find((r) => r.id === selectedEmployeeId) || records[0];

  // 직원 검색 필터
  const filteredEmployees = records.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.employeeNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 단일 PDF 다운로드
  const handleDownloadSinglePdf = async () => {
    if (!selectedRecord) return;
    setIsDownloadingPdf(true);
    try {
      await downloadPayslipPdf(selectedRecord, settings, approvalVersion);
    } catch (err: any) {
      alert('PDF 생성 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // 전체 ZIP 다운로드
  const handleDownloadAllZip = async () => {
    setIsZipping(true);
    try {
      await downloadAllPayslipsZip(records, settings, approvalVersion, (current, total) => {
        setZipProgress({ current, total });
      });
    } catch (err: any) {
      alert('ZIP 압축 파일 생성 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsZipping(false);
      setZipProgress(null);
    }
  };

  // 인쇄 실행
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* 1. 상단 타이틀 및 일괄 액션 바 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-900" />
            <h2 className="text-xl font-bold text-slate-900">개인별 급여명세서</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 font-semibold border border-blue-200">
              승인 버전 v{approvalVersion}.0
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            근로기준법 제48조 법정 필수 기재사항 및 산출식이 완벽히 기재된 1인 1명세서입니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>화면 인쇄</span>
          </button>

          <button
            onClick={handleDownloadSinglePdf}
            disabled={isDownloadingPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors shadow-2xs"
          >
            {isDownloadingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-800" />
            ) : (
              <Download className="w-3.5 h-3.5 text-blue-800" />
            )}
            <span>현재 직원 PDF</span>
          </button>

          <button
            onClick={handleDownloadAllZip}
            disabled={isZipping}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
          >
            {isZipping ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Archive className="w-3.5 h-3.5" />
            )}
            <span>
              {isZipping && zipProgress
                ? `압축 생성 중 (${zipProgress.current}/${zipProgress.total})...`
                : '전체 PDF ZIP 다운로드'}
            </span>
          </button>

          <button
            onClick={onNavigateToDispatch}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shadow-xs transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>이메일 발송 관리 →</span>
          </button>
        </div>
      </div>

      {/* 미승인 상태 안내 배너 */}
      {approvalStatus !== 'APPROVED' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-sm text-amber-950">
              현재 작성 중(미승인) 상태의 급여명세서 미리보기입니다.
            </span>
            <p className="text-amber-800">
              실제 직원 발송 및 공식 서류 발행은 결재권자의 최종 승인 완료 후 진행해 주시기 바랍니다.
            </p>
            <div className="pt-1">
              <button
                onClick={onNavigateToApproval}
                className="font-bold text-blue-900 underline hover:text-blue-950"
              >
                급여 결재 탭으로 이동하여 결재 요청하기 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 메인 명세서 레이아웃: 좌측 직원 선택 목록 + 우측 대형 명세서 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 좌측: 직원 목록 사이드바 */}
        <div className="lg:col-span-1 bg-white p-4 rounded-xl border border-slate-200 space-y-3 h-fit">
          <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
            <span>직원 선택 ({records.length}명)</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="직원명, 사번 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden"
            />
          </div>

          <div className="max-h-[600px] overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100">
            {filteredEmployees.map((emp) => {
              const isSelected = emp.id === selectedRecord?.id;
              return (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmployeeId(emp.id)}
                  className={`w-full text-left p-2.5 rounded-lg transition-colors flex items-center justify-between text-xs ${
                    isSelected
                      ? 'bg-blue-50 text-blue-950 font-bold border border-blue-200 shadow-2xs'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span>{emp.name}</span>
                      <span className="text-[11px] font-normal text-slate-500">({emp.position})</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      {emp.department} · {emp.employeeNo}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums font-semibold text-slate-900">
                      {formatCurrency(emp.netSalary)}원
                    </div>
                    <div className="text-[10px]">
                      {emp.email ? (
                        <span className="text-emerald-700">이메일 등록</span>
                      ) : (
                        <span className="text-slate-400 italic">미등록</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 우측: 규격 급여명세서 본문 (인쇄 최적화) */}
        <div className="lg:col-span-3">
          {selectedRecord ? (
            <div
              id="payslip-print-area"
              className="bg-white p-8 md:p-12 rounded-2xl border border-slate-300 shadow-sm space-y-6 max-w-4xl mx-auto print:p-0 print:border-none print:shadow-none"
            >
              {/* 상단 장식 바 */}
              <div className="h-1.5 bg-blue-900 rounded-full w-full" />

              {/* 헤더 */}
              <div className="text-center relative pb-2 border-b border-slate-200">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
                  급 여 명 세 서
                </h1>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  ( 귀속연월: {settings.yearMonth}분 )
                </p>

                <div className="flex items-center justify-between text-xs text-slate-600 mt-4">
                  <div className="font-semibold text-slate-800">
                    회사명: {settings.companyName}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    승인 버전: v{approvalVersion}.0 | 발급일자: {new Date().toLocaleDateString('ko-KR')}
                  </div>
                </div>
              </div>

              {/* 1. 근로자 및 급여 기본 정보 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border border-slate-300 text-xs rounded-lg overflow-hidden">
                <div className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-b border-slate-300">
                  성 명
                </div>
                <div className="p-2.5 text-slate-900 font-semibold border-r border-b border-slate-300">
                  {selectedRecord.name}
                </div>
                <div className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-b border-slate-300">
                  사 번
                </div>
                <div className="p-2.5 text-slate-900 border-b border-slate-300">
                  {selectedRecord.employeeNo}
                </div>

                <div className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-b border-slate-300">
                  소속 부서
                </div>
                <div className="p-2.5 text-slate-900 border-r border-b border-slate-300">
                  {selectedRecord.department}
                </div>
                <div className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-b border-slate-300">
                  직 급
                </div>
                <div className="p-2.5 text-slate-900 border-b border-slate-300">
                  {selectedRecord.position}
                </div>

                <div className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                  급여 산정기간
                </div>
                <div className="p-2.5 text-slate-900 border-r border-slate-300">
                  {settings.periodStart} ~ {settings.periodEnd}
                </div>
                <div className="bg-slate-100 p-2.5 font-bold text-slate-700 border-r border-slate-300">
                  급여 지급일
                </div>
                <div className="p-2.5 text-slate-900">
                  {settings.payday}
                </div>
              </div>

              {/* 근로 산출 정보 */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-600">
                <div>근무일수: <strong>{selectedRecord.workingDays}일</strong></div>
                <div>월 소정근로: <strong>{selectedRecord.regularHours}시간</strong></div>
                <div>통상시급: <strong className="text-blue-900">{formatCurrency(selectedRecord.hourlyRate)}원</strong></div>
                <div>연장근로: <strong>{selectedRecord.overtimeHours}h</strong></div>
                <div>야간근로: <strong>{selectedRecord.nightHours}h</strong></div>
                <div>휴일근로: <strong>{selectedRecord.holidayHours}h</strong></div>
              </div>

              {/* 2. 지급 내역 및 공제 내역 분할 테이블 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 지급 항목 */}
                <div className="border border-slate-300 rounded-lg overflow-hidden">
                  <div className="bg-blue-900 text-white text-xs font-bold py-2 px-3 text-center">
                    지  급  내  역
                  </div>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-2 px-3 text-slate-700 font-medium">기본급</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-900">
                          {formatCurrency(selectedRecord.baseSalary)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700">고정수당 (직책/현장)</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                          {formatCurrency(selectedRecord.fixedAllowance)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700">
                          <div>연장근로수당</div>
                          <div className="text-[10px] text-slate-400">
                            {selectedRecord.overtimeHours}h × 150%
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                          {formatCurrency(selectedRecord.overtimePay)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700">
                          <div>야간근로수당</div>
                          <div className="text-[10px] text-slate-400">
                            {selectedRecord.nightHours}h × 50%
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                          {formatCurrency(selectedRecord.nightPay)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700">
                          <div>휴일근로수당</div>
                          <div className="text-[10px] text-slate-400">
                            {selectedRecord.holidayHours}h × 150%
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                          {formatCurrency(selectedRecord.holidayPay)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700">상여금</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                          {formatCurrency(selectedRecord.bonus)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700">
                          <div>식대 (비과세)</div>
                          <div className="text-[10px] text-slate-400">월 20만원 한도 비과세</div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                          {formatCurrency(Math.min(selectedRecord.mealAllowance, settings.mealNonTaxableLimit))}원
                        </td>
                      </tr>
                      {selectedRecord.mealAllowance > settings.mealNonTaxableLimit && (
                        <tr>
                          <td className="py-2 px-3 text-slate-700">식대 (과세분)</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                            {formatCurrency(selectedRecord.mealAllowance - settings.mealNonTaxableLimit)}원
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-2 px-3 text-slate-700">기타 과세수당</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                          {formatCurrency(selectedRecord.otherTaxablePay)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700">기타 비과세수당</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                          {formatCurrency(selectedRecord.otherNonTaxablePay)}원
                        </td>
                      </tr>
                    </tbody>
                    <tfoot className="bg-slate-100 border-t border-slate-300 font-bold">
                      <tr>
                        <td className="py-2.5 px-3 text-blue-900">지 급 총 액</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-blue-950 font-bold">
                          {formatCurrency(selectedRecord.grossSalary)}원
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* 공제 항목 */}
                <div className="border border-slate-300 rounded-lg overflow-hidden">
                  <div className="bg-emerald-800 text-white text-xs font-bold py-2 px-3 text-center">
                    공  제  내  역
                  </div>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-2 px-3 text-slate-700 font-medium">국민연금</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-rose-700">
                          {formatCurrency(selectedRecord.nationalPension)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700 font-medium">건강보험</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-rose-700">
                          {formatCurrency(selectedRecord.healthInsurance)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700 font-medium">장기요양보험</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-rose-700">
                          {formatCurrency(selectedRecord.longTermCare)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700 font-medium">고용보험</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-rose-700">
                          {formatCurrency(selectedRecord.employmentInsurance)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700 font-medium">근로소득세</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-rose-700">
                          {formatCurrency(selectedRecord.incomeTax)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700 font-medium">지방소득세 (10%)</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-rose-700">
                          {formatCurrency(selectedRecord.localIncomeTax)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700">기타공제 (사우회비)</td>
                        <td className="py-2 px-3 text-right tabular-nums text-rose-700">
                          {formatCurrency(selectedRecord.otherDeductions)}원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-400">
                          <div>산재보험 (회사부담)</div>
                          <div className="text-[10px]">근로자 공제액 미포함</div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-400">
                          0원
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-300">-</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-300">-</td>
                      </tr>
                    </tbody>
                    <tfoot className="bg-slate-100 border-t border-slate-300 font-bold">
                      <tr>
                        <td className="py-2.5 px-3 text-rose-700">공 제 총 액</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-rose-800 font-bold">
                          {formatCurrency(selectedRecord.totalDeductions)}원
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 3. 실수령액 강조 상자 */}
              <div className="bg-blue-50/80 p-5 rounded-xl border-2 border-blue-600 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-blue-900 block">
                    실 수 령 액 (차인지급액)
                  </span>
                  <span className="text-xs text-blue-700">
                    지급총액 {formatCurrency(selectedRecord.grossSalary)}원 - 공제총액 {formatCurrency(selectedRecord.totalDeductions)}원
                  </span>
                </div>
                <div className="text-2xl md:text-3xl font-extrabold text-blue-950 tabular-nums">
                  {formatCurrency(selectedRecord.netSalary)} <span className="text-sm font-normal text-slate-700">원</span>
                </div>
              </div>

              {/* 4. 법정 계산방법 및 산출 근거 (근로기준법 제48조) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-700">
                <div className="font-bold text-slate-900">
                  ■ 근로기준법 제48조 및 시행령 제27조의2에 따른 계산방법
                </div>
                <ul className="space-y-1 text-[11px] text-slate-600 list-disc pl-4">
                  <li>
                    <strong>통상시급:</strong> {formatCurrency(selectedRecord.hourlyRate)}원 (기본급 {formatCurrency(selectedRecord.baseSalary)}원 ÷ 월 소정근로 209시간)
                  </li>
                  <li>
                    <strong>연장근로수당:</strong> 통상시급({formatCurrency(selectedRecord.hourlyRate)}원) × 연장시간({selectedRecord.overtimeHours}시간) × 150% = {formatCurrency(selectedRecord.overtimePay)}원
                  </li>
                  <li>
                    <strong>야간근로수당:</strong> 통상시급({formatCurrency(selectedRecord.hourlyRate)}원) × 야간시간({selectedRecord.nightHours}시간) × 50% = {formatCurrency(selectedRecord.nightPay)}원
                  </li>
                  <li>
                    <strong>휴일근로수당:</strong> 통상시급({formatCurrency(selectedRecord.hourlyRate)}원) × 휴일시간({selectedRecord.holidayHours}시간) × 150% = {formatCurrency(selectedRecord.holidayPay)}원
                  </li>
                  <li>
                    <strong>4대 사회보험 산정 (과세급여 {formatCurrency(selectedRecord.totalTaxable)}원 기준):</strong> 국민연금 4.5%, 건강보험 3.545%, 장기요양 건강보험료의 12.95%, 고용보험 0.9% (산재보험은 사업주 100% 부담으로 근로자 공제액 없음)
                  </li>
                  <li>
                    <strong>원천징수 세액:</strong> 국세청 간이세액표 누진공제 기준 및 지방소득세(소득세의 10%, 10원 미만 절사)
                  </li>
                </ul>
              </div>

              {/* 5. 회사 하단 서명란 */}
              <div className="text-center pt-6 border-t border-slate-200 space-y-1">
                <div className="text-lg font-bold text-slate-900 tracking-widest">
                  양 우 종 합 건 설   주 식 회 사
                </div>
                <div className="text-xs text-slate-500">
                  사업자등록번호: {settings.businessNo} | 대표이사 양우건
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 text-center text-slate-400 rounded-xl border border-slate-200">
              조회할 직원을 선택해 주세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
