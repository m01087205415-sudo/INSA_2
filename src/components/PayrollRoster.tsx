/**
 * 양우종합건설 스마트 급여계산기 - 급여대장 및 계산 컴포넌트
 * 
 * [원칙] 기존 엑셀 업로드, 항목 매핑, 데이터 검증, 급여 계산, 4대보험/세금 계산,
 * 검색·필터·정렬, 직원별 수정·재계산, 엑셀 다운로드 기능을 100% 보존합니다.
 * 확장: 직원별 '급여명세서 수신 이메일' 선택 필드, 형식 검증, 동일 주소 중복 경고
 */

import React, { useState, useMemo, useRef } from 'react';
import { EmployeeSalaryRecord, PayrollSettings } from '../types/payroll';
import { calculateSalaryRecord, formatCurrency, isValidEmail } from '../utils/calculator';
import { exportPayrollToExcel, downloadPayrollTemplate, parseExcelFile } from '../utils/excel';
import {
  Upload,
  Download,
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle,
  Edit2,
  Trash2,
  Mail,
  AlertCircle,
  X,
  RefreshCw,
} from 'lucide-react';

interface PayrollRosterProps {
  records: EmployeeSalaryRecord[];
  onUpdateRecords: (records: EmployeeSalaryRecord[], hasChanged: boolean) => void;
  settings: PayrollSettings;
  onRequestApproval: () => void;
}

export const PayrollRoster: React.FC<PayrollRosterProps> = ({
  records,
  onUpdateRecords,
  settings,
  onRequestApproval,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'employeeNo' | 'name' | 'grossSalary' | 'netSalary'>('employeeNo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // 모달 상태
  const [editingRecord, setEditingRecord] = useState<EmployeeSalaryRecord | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 부서 목록 도출
  const departments = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.department) set.add(r.department);
    });
    return Array.from(set);
  }, [records]);

  // 동일 이메일 중복 감지 (동일 이메일 등록 직원 경고)
  const duplicateEmailMap = useMemo(() => {
    const map = new Map<string, string[]>();
    records.forEach((r) => {
      if (r.email && r.email.trim() !== '') {
        const clean = r.email.trim().toLowerCase();
        const existing = map.get(clean) || [];
        existing.push(r.name);
        map.set(clean, existing);
      }
    });
    const duplicates: { email: string; names: string[] }[] = [];
    map.forEach((names, email) => {
      if (names.length > 1) {
        duplicates.push({ email, names });
      }
    });
    return duplicates;
  }, [records]);

  // 합계 지표 계산
  const totals = useMemo(() => {
    return records.reduce(
      (acc, r) => {
        acc.gross += r.grossSalary;
        acc.taxable += r.totalTaxable;
        acc.nonTaxable += r.totalNonTaxable;
        acc.deductions += r.totalDeductions;
        acc.net += r.netSalary;
        if (!r.isValid) acc.invalidCount += 1;
        if (!r.email || r.email.trim() === '') acc.missingEmailCount += 1;
        return acc;
      },
      { gross: 0, taxable: 0, nonTaxable: 0, deductions: 0, net: 0, invalidCount: 0, missingEmailCount: 0 }
    );
  }, [records]);

  // 검색, 필터링 및 정렬 적용
  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        // 검색어 매칭
        const q = searchTerm.toLowerCase();
        const matchesSearch =
          r.name.toLowerCase().includes(q) ||
          r.employeeNo.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          (r.email && r.email.toLowerCase().includes(q));

        if (!matchesSearch) return false;

        // 부서 필터
        if (departmentFilter !== 'ALL' && r.department !== departmentFilter) return false;

        // 상태 필터
        if (statusFilter === 'VALID' && !r.isValid) return false;
        if (statusFilter === 'INVALID' && r.isValid) return false;
        if (statusFilter === 'MISSING_EMAIL' && r.email && r.email.trim() !== '') return false;
        if (statusFilter === 'DUPLICATE_EMAIL') {
          const isDup = duplicateEmailMap.some((d) => d.email === (r.email || '').trim().toLowerCase());
          if (!isDup) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'employeeNo') diff = a.employeeNo.localeCompare(b.employeeNo);
        else if (sortBy === 'name') diff = a.name.localeCompare(b.name);
        else if (sortBy === 'grossSalary') diff = a.grossSalary - b.grossSalary;
        else if (sortBy === 'netSalary') diff = a.netSalary - b.netSalary;
        return sortOrder === 'asc' ? diff : -diff;
      });
  }, [records, searchTerm, departmentFilter, statusFilter, sortBy, sortOrder, duplicateEmailMap]);

  // 엑셀 업로드 처리
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const result = await parseExcelFile(file, settings);
      if (result.missingRequired.length > 0) {
        setUploadError(`필수 열 누락: [${result.missingRequired.join(', ')}] 열을 확인해 주세요.`);
        return;
      }
      onUpdateRecords(result.records, true);
    } catch (err: any) {
      setUploadError(err.message || '엑셀 파싱 중 오류가 발생했습니다.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 신규 직원 추가 핸들러
  const handleAddNewEmployee = () => {
    const newRecord: EmployeeSalaryRecord = calculateSalaryRecord(
      {
        id: `emp_${Date.now()}`,
        employeeNo: `YW-${String(records.length + 1).padStart(3, '0')}`,
        name: '',
        department: '현장시공팀',
        position: '사원',
        email: '',
        workingDays: 22,
        regularHours: 209,
        baseSalary: 3200000,
        fixedAllowance: 0,
        mealAllowance: 200000,
      },
      settings
    );
    setEditingRecord(newRecord);
    setIsNewRecord(true);
  };

  // 수정 모달 저장 핸들러
  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    // 재계산 적용
    const recalculated = calculateSalaryRecord(
      {
        ...editingRecord,
        isEdited: true,
      },
      settings
    );

    let nextRecords: EmployeeSalaryRecord[];
    if (isNewRecord) {
      nextRecords = [...records, recalculated];
    } else {
      nextRecords = records.map((r) => (r.id === recalculated.id ? recalculated : r));
    }

    onUpdateRecords(nextRecords, true);
    setEditingRecord(null);
    setIsNewRecord(false);
  };

  // 삭제 핸들러
  const handleDeleteRecord = (id: string, name: string) => {
    if (confirm(`직원 [${name}]의 급여 데이터를 대장에서 삭제하시겠습니까?`)) {
      const nextRecords = records.filter((r) => r.id !== id);
      onUpdateRecords(nextRecords, true);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 상단 타이틀 및 액션 바 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-slate-900">양우종합건설 급여대장</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 font-medium border border-blue-200">
              {settings.yearMonth} 귀속
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            산정기간: {settings.periodStart} ~ {settings.periodEnd} | 지급일자: {settings.payday}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* 엑셀 파일 업로드 히든 인풋 */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>엑셀 업로드</span>
          </button>

          <button
            onClick={() => downloadPayrollTemplate()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
            <span>서식 템플릿</span>
          </button>

          <button
            onClick={() => exportPayrollToExcel(records, settings)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>급여대장 다운로드</span>
          </button>

          <button
            onClick={handleAddNewEmployee}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>직원 추가</span>
          </button>

          <button
            onClick={onRequestApproval}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shadow-xs"
          >
            <span>급여 결재 진행 →</span>
          </button>
        </div>
      </div>

      {/* 업로드 에러 경고 */}
      {uploadError && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 동일 이메일 중복 경고 배너 (요구사항: 여러 직원에게 동일한 이메일 등록 시 경고) */}
      {duplicateEmailMap.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-sm text-amber-950">
                [주의] 동일한 급여명세서 수신 이메일이 등록된 직원이 있습니다 ({duplicateEmailMap.length}건).
              </span>
              <p className="text-amber-800">
                급여명세서는 개인 민감정보이므로 각 직원의 개별 고유 이메일로 발송되어야 합니다. 발송 전 확인 및 수정해 주시기 바랍니다.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {duplicateEmailMap.map((d, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-amber-300 text-xs font-medium text-amber-900">
                    <Mail className="w-3 h-3 text-amber-700" />
                    <strong>{d.email}</strong> ({d.names.join(', ')})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. 핵심 지표 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">대상 인원</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {records.length} <span className="text-xs font-normal text-slate-500">명</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            이메일 등록 {records.length - totals.missingEmailCount}명
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">총 지급액</div>
          <div className="text-xl font-bold text-blue-900 mt-1 tabular-nums">
            {formatCurrency(totals.gross)} <span className="text-xs font-normal text-slate-500">원</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            과세 {formatCurrency(totals.taxable)}원
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">총 공제액 (4대보험·세금)</div>
          <div className="text-xl font-bold text-rose-700 mt-1 tabular-nums">
            {formatCurrency(totals.deductions)} <span className="text-xs font-normal text-slate-500">원</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            산재보험(회사부담) 제외
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">실수령액 합계</div>
          <div className="text-xl font-bold text-emerald-700 mt-1 tabular-nums">
            {formatCurrency(totals.net)} <span className="text-xs font-normal text-slate-500">원</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            실지급 예정 금액
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">데이터 검증 상태</div>
          <div className="text-xl font-bold mt-1 tabular-nums">
            {totals.invalidCount === 0 ? (
              <span className="text-emerald-600 flex items-center gap-1">
                <CheckCircle className="w-5 h-5" /> 정상
              </span>
            ) : (
              <span className="text-rose-600 flex items-center gap-1">
                <AlertTriangle className="w-5 h-5" /> {totals.invalidCount}명 오류
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            이메일 누락 {totals.missingEmailCount}명
          </div>
        </div>
      </div>

      {/* 3. 검색 및 필터 바 */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* 검색어 */}
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="사번, 성명, 부서, 이메일 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 부서 필터 */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="py-1.5 px-2.5 rounded-lg border border-slate-300 text-slate-700 bg-white focus:outline-hidden"
            >
              <option value="ALL">전체 부서</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* 상태 필터 */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-2.5 rounded-lg border border-slate-300 text-slate-700 bg-white focus:outline-hidden"
            >
              <option value="ALL">전체 상태</option>
              <option value="VALID">정상</option>
              <option value="INVALID">오류 데이터</option>
              <option value="MISSING_EMAIL">이메일 미등록</option>
              <option value="DUPLICATE_EMAIL">동일 이메일 중복</option>
            </select>
          </div>
        </div>

        {/* 정렬 옵션 */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className="text-slate-500">정렬:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="py-1.5 px-2.5 rounded-lg border border-slate-300 text-slate-700 bg-white focus:outline-hidden"
          >
            <option value="employeeNo">사번순</option>
            <option value="name">성명순</option>
            <option value="grossSalary">총지급액순</option>
            <option value="netSalary">실수령액순</option>
          </select>
          <button
            onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="px-2 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
            title="정렬 방향 전환"
          >
            {sortOrder === 'asc' ? '오름차순 ↑' : '내림차순 ↓'}
          </button>
        </div>
      </div>

      {/* 4. 급여대장 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-3">사번</th>
                <th className="py-3 px-3">성명</th>
                <th className="py-3 px-3">부서 / 직급</th>
                <th className="py-3 px-3 text-right">기본급</th>
                <th className="py-3 px-3 text-right">연장·수당</th>
                <th className="py-3 px-3 text-right">식대(비과세)</th>
                <th className="py-3 px-3 text-right font-bold text-blue-900">총지급액</th>
                <th className="py-3 px-3 text-right">4대보험</th>
                <th className="py-3 px-3 text-right">세금</th>
                <th className="py-3 px-3 text-right font-bold text-rose-700">공제합계</th>
                <th className="py-3 px-3 text-right font-bold text-emerald-800">실수령액</th>
                <th className="py-3 px-3">명세서 수신 이메일</th>
                <th className="py-3 px-3 text-center">검증</th>
                <th className="py-3 px-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-400">
                    검색 조건에 일치하는 직원이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const fourInsurances = r.nationalPension + r.healthInsurance + r.longTermCare + r.employmentInsurance;
                  const taxes = r.incomeTax + r.localIncomeTax;
                  const isDupEmail =
                    Boolean(r.email) &&
                    duplicateEmailMap.some((d) => d.email === (r.email || '').trim().toLowerCase());

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-medium text-slate-900 whitespace-nowrap">{r.employeeNo}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900 whitespace-nowrap">
                        {r.name}
                        {r.isEdited && (
                          <span className="ml-1 text-[10px] text-amber-600 font-normal">[수정됨]</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {r.department} · {r.position}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">{formatCurrency(r.baseSalary)}원</td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(r.fixedAllowance + r.overtimePay + r.nightPay + r.holidayPay + r.bonus)}원
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(Math.min(r.mealAllowance, settings.mealNonTaxableLimit))}원
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-bold text-blue-900">
                        {formatCurrency(r.grossSalary)}원
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(fourInsurances)}원
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(taxes)}원
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-bold text-rose-700">
                        {formatCurrency(r.totalDeductions)}원
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-bold text-emerald-800 bg-emerald-50/30">
                        {formatCurrency(r.netSalary)}원
                      </td>
                      <td className="py-3 px-3">
                        {r.email && r.email.trim() !== '' ? (
                          <div className="flex items-center gap-1">
                            <span
                              className={`truncate max-w-[140px] ${
                                !isValidEmail(r.email)
                                  ? 'text-rose-600 font-semibold'
                                  : isDupEmail
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-slate-700'
                              }`}
                              title={r.email}
                            >
                              {r.email}
                            </span>
                            {isDupEmail && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded" title="동일 이메일 중복">
                                중복
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">미등록 (PDF 가능)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {r.isValid ? (
                          <span className="inline-flex items-center text-emerald-600 font-medium">정상</span>
                        ) : (
                          <span
                            className="inline-flex items-center text-rose-600 font-medium cursor-help"
                            title={r.validationErrors?.join(', ')}
                          >
                            오류
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingRecord({ ...r });
                              setIsNewRecord(false);
                            }}
                            className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                            title="수정 및 재계산"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(r.id, r.name)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. 직원별 급여 수정 및 실시간 재계산 모달 */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isNewRecord ? '신규 직원 급여 등록' : `[${editingRecord.name}] 급여 수정 및 실시간 재계산`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  입력된 변경 사항은 4대보험 및 세액에 즉시 반영되며, 이전 승인본과 별도로 보관됩니다.
                </p>
              </div>
              <button
                onClick={() => setEditingRecord(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4 text-xs">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">성명 *</label>
                  <input
                    type="text"
                    required
                    value={editingRecord.name}
                    onChange={(e) => setEditingRecord({ ...editingRecord, name: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">사번 *</label>
                  <input
                    type="text"
                    required
                    value={editingRecord.employeeNo}
                    onChange={(e) => setEditingRecord({ ...editingRecord, employeeNo: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">부서</label>
                  <input
                    type="text"
                    value={editingRecord.department}
                    onChange={(e) => setEditingRecord({ ...editingRecord, department: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">직급</label>
                  <input
                    type="text"
                    value={editingRecord.position}
                    onChange={(e) => setEditingRecord({ ...editingRecord, position: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                {/* 이메일 필드 (신규 확장) */}
                <div className="col-span-2 sm:col-span-4">
                  <label className="block text-slate-600 font-medium mb-1">
                    급여명세서 수신 개인 이메일 (선택)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="예: employee@yangwoo.co.kr (비워두면 이메일 발송 대상에서 제외)"
                      value={editingRecord.email || ''}
                      onChange={(e) => setEditingRecord({ ...editingRecord, email: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                    />
                    {editingRecord.email && !isValidEmail(editingRecord.email) && (
                      <span className="text-rose-600 font-semibold whitespace-nowrap">
                        형식 오류
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    ※ 이메일이 없어도 명세서 생성 및 PDF 다운로드는 정상 지원됩니다.
                  </p>
                </div>
              </div>

              {/* 지급 산출 기본 항목 */}
              <div className="space-y-2">
                <span className="font-bold text-slate-800">1. 근로 시간 및 지급 항목</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">근무일수 (일)</label>
                    <input
                      type="number"
                      value={editingRecord.workingDays}
                      onChange={(e) => setEditingRecord({ ...editingRecord, workingDays: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">소정근로시간 (h)</label>
                    <input
                      type="number"
                      value={editingRecord.regularHours}
                      onChange={(e) => setEditingRecord({ ...editingRecord, regularHours: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">통상시급 (원)</label>
                    <input
                      type="number"
                      value={editingRecord.hourlyRate}
                      onChange={(e) => setEditingRecord({ ...editingRecord, hourlyRate: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">기본급 (원) *</label>
                    <input
                      type="number"
                      required
                      value={editingRecord.baseSalary}
                      onChange={(e) => setEditingRecord({ ...editingRecord, baseSalary: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">연장근로 (시간)</label>
                    <input
                      type="number"
                      value={editingRecord.overtimeHours}
                      onChange={(e) => setEditingRecord({ ...editingRecord, overtimeHours: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">야간근로 (시간)</label>
                    <input
                      type="number"
                      value={editingRecord.nightHours}
                      onChange={(e) => setEditingRecord({ ...editingRecord, nightHours: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">휴일근로 (시간)</label>
                    <input
                      type="number"
                      value={editingRecord.holidayHours}
                      onChange={(e) => setEditingRecord({ ...editingRecord, holidayHours: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">고정수당 (직책/현장)</label>
                    <input
                      type="number"
                      value={editingRecord.fixedAllowance}
                      onChange={(e) => setEditingRecord({ ...editingRecord, fixedAllowance: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">식대 (월 20만 비과세)</label>
                    <input
                      type="number"
                      value={editingRecord.mealAllowance}
                      onChange={(e) => setEditingRecord({ ...editingRecord, mealAllowance: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">상여금</label>
                    <input
                      type="number"
                      value={editingRecord.bonus}
                      onChange={(e) => setEditingRecord({ ...editingRecord, bonus: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">기타 과세수당</label>
                    <input
                      type="number"
                      value={editingRecord.otherTaxablePay}
                      onChange={(e) => setEditingRecord({ ...editingRecord, otherTaxablePay: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">기타공제 (사우회비)</label>
                    <input
                      type="number"
                      value={editingRecord.otherDeductions}
                      onChange={(e) => setEditingRecord({ ...editingRecord, otherDeductions: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* 실시간 계산 프리뷰 */}
              {(() => {
                const preview = calculateSalaryRecord(editingRecord, settings);
                return (
                  <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2">
                    <div className="flex items-center justify-between text-blue-950 font-bold">
                      <span className="flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5" /> 자동 산출 요약
                      </span>
                      <span>
                        실수령액: {formatCurrency(preview.netSalary)} 원
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                      <div>총지급액: {formatCurrency(preview.grossSalary)}원</div>
                      <div>과세급여: {formatCurrency(preview.totalTaxable)}원</div>
                      <div>비과세액: {formatCurrency(preview.totalNonTaxable)}원</div>
                      <div>국민연금: {formatCurrency(preview.nationalPension)}원</div>
                      <div>건강보험: {formatCurrency(preview.healthInsurance)}원</div>
                      <div>요양보험: {formatCurrency(preview.longTermCare)}원</div>
                      <div>고용보험: {formatCurrency(preview.employmentInsurance)}원</div>
                      <div>근로소득세: {formatCurrency(preview.incomeTax)}원</div>
                      <div>지방소득세: {formatCurrency(preview.localIncomeTax)}원</div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-white bg-blue-900 hover:bg-blue-800 rounded-lg font-semibold shadow-xs"
                >
                  {isNewRecord ? '등록하기' : '수정 및 재계산 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
