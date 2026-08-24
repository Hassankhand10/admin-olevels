import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSearch, Loader2, RefreshCw } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import OLevelsLogo from '../assets/OLevels-logo-color.png';
import { API_BASE_URL } from '../config/constants';

type CheckerTypeFilter = 'all' | 'ai' | 'plagiarism';
type DatePreset = '7' | '30' | '90' | 'all';

interface CheckerUsageRow {
  id: string;
  checkerType?: string;
  event?: string;
  studentName?: string;
  studentId?: string;
  fileName?: string;
  fileSize?: number;
  scanId?: string;
  status?: string;
  ip?: string;
  createdAt?: string;
}

interface CheckerUsageSummary {
  total?: number;
  byChecker?: Record<string, number>;
  byStudent?: Record<string, number>;
}

const ITEMS_PER_PAGE = 25;

function checkerLabel(type?: string): string {
  if (type === 'ai') return 'AI Checker';
  if (type === 'plagiarism') return 'Plagiarism';
  return type || '-';
}

function formatDate(value?: string): string {
  if (!value) return '-';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatFileSize(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function applyDatePreset(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split('T')[0];
  if (preset === 'all') {
    return { from: '', to: '' };
  }
  const days = Number(preset);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - days);
  return { from: fromDate.toISOString().split('T')[0], to };
}

export const CheckerUsagePage = () => {
  const navigate = useNavigate();
  const [checkerType, setCheckerType] = useState<CheckerTypeFilter>('all');
  const [searchStudent, setSearchStudent] = useState('');
  const [searchStudentId, setSearchStudentId] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('30');
  const [dateFrom, setDateFrom] = useState(() => applyDatePreset('30').from);
  const [dateTo, setDateTo] = useState(() => applyDatePreset('30').to);
  const [logs, setLogs] = useState<CheckerUsageRow[]>([]);
  const [summary, setSummary] = useState<CheckerUsageSummary>({});
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(logs.length / ITEMS_PER_PAGE)),
    [logs.length]
  );

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return logs.slice(start, start + ITEMS_PER_PAGE);
  }, [logs, currentPage]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setCurrentPage(1);

    try {
      const params = new URLSearchParams({ limit: '500' });
      if (checkerType !== 'all') {
        params.set('checkerType', checkerType);
      }
      if (searchStudent.trim()) {
        params.set('studentName', searchStudent.trim());
      }
      if (searchStudentId.trim()) {
        params.set('studentId', searchStudentId.trim());
      }
      if (dateFrom) {
        params.set('from', dateFrom);
      }
      if (dateTo) {
        params.set('to', dateTo);
      }

      const url = `${API_BASE_URL}/api/admin/checker-usage-logs?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = await response.json();
      const nextLogs = (data.logs || []) as CheckerUsageRow[];
      setLogs(nextLogs);
      setSummary(data.summary || {});

      if (!nextLogs.length) {
        toast('No checker activity found for this search.', { icon: 'ℹ️' });
      }
    } catch (error) {
      console.error('Failed to load checker usage logs:', error);
      toast.error('Could not load checker usage logs.');
    } finally {
      setLoading(false);
    }
  }, [checkerType, searchStudent, searchStudentId, dateFrom, dateTo]);

  useEffect(() => {
    void loadLogs();
  }, [checkerType, dateFrom, dateTo]);

  const onDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const range = applyDatePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Toaster position="top-right" />
      <header className="bg-white/95 backdrop-blur-md shadow-2xl border-b-4 border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-[#b30104] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Back to hub</span>
            </button>
            <img src={OLevelsLogo} alt="O-Levels Logo" className="h-10 w-auto" />
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-800">Checker Usage</p>
              <p className="text-xs text-gray-500">AI &amp; Plagiarism</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
            <FileSearch className="w-6 h-6 text-[#b30104]" />
            <h1 className="text-xl font-bold text-gray-800">
              AI &amp; Plagiarism Checker Usage
            </h1>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Checker type
                </label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={checkerType}
                  onChange={(e) => setCheckerType(e.target.value as CheckerTypeFilter)}
                >
                  <option value="all">All</option>
                  <option value="ai">AI Checker</option>
                  <option value="plagiarism">Plagiarism Checker</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Student name
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Student name..."
                  value={searchStudent}
                  onChange={(e) => setSearchStudent(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Student ID
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="ID"
                  value={searchStudentId}
                  onChange={(e) => setSearchStudentId(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Date range
                </label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={datePreset}
                  onChange={(e) => onDatePresetChange(e.target.value as DatePreset)}
                >
                  <option value="all">All time</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void loadLogs()}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#b30104] hover:bg-[#7a0103] text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Refresh
                </button>
              </div>
            </div>

            {summary.total ? (
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs font-medium bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                  Total events: {summary.total}
                </span>
                {Object.entries(summary.byChecker || {}).map(([key, count]) => (
                  <span
                    key={key}
                    className="text-xs font-medium bg-gray-100 text-gray-700 px-3 py-1 rounded-full"
                  >
                    {checkerLabel(key)}: {count}
                  </span>
                ))}
              </div>
            ) : null}

            {logs.length > 0 ? (
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Date / Time</th>
                      <th className="px-4 py-3 text-left font-semibold">Checker</th>
                      <th className="px-4 py-3 text-left font-semibold">Event</th>
                      <th className="px-4 py-3 text-left font-semibold">Student</th>
                      <th className="px-4 py-3 text-left font-semibold">File</th>
                      <th className="px-4 py-3 text-left font-semibold">Scan ID</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedLogs.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(row.createdAt)}
                        </td>
                        <td className="px-4 py-3">{checkerLabel(row.checkerType)}</td>
                        <td className="px-4 py-3">{row.event || '-'}</td>
                        <td className="px-4 py-3">
                          {row.studentName || '-'}
                          {row.studentId ? (
                            <span className="block text-xs text-gray-500">
                              ID: {row.studentId}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {row.fileName || '-'}
                          {row.fileSize ? (
                            <span className="block text-xs text-gray-500">
                              {formatFileSize(row.fileSize)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{row.scanId || '-'}</td>
                        <td className="px-4 py-3">{row.status || '-'}</td>
                        <td className="px-4 py-3">{row.ip || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-gray-500 py-10">No records to display.</p>
            )}

            {logs.length > ITEMS_PER_PAGE ? (
              <div className="flex items-center justify-between mt-4">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
};
