import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Sparkles,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  ArrowLeft,
  BookOpen,
  Layers,
  Calendar,
  Users,
  Award,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  Timer,
  AlertCircle,
  ClipboardCheck,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import OLevelsLogo from '../assets/OLevels-logo-color.png';
import {
  fetchAllAIGradedAssignmentsAcrossTopics,
  isPastPaperPracticeCategory,
  AIGradedAssignmentItem,
  AIGradingStatus,
} from '../services/firebaseService';
import { GRADING_BASE_URL } from '../config/constants';

type StatusFilter = 'all' | AIGradingStatus;
type CategoryFilter = 'all' | 'WeeklyTest' | 'pastPaper';

interface TopicMetaMap {
  [topicId: string]: { course: { id?: string | number; name?: string } | null; name?: string };
}

const STATUS_META: Record<
  AIGradingStatus,
  {
    label: string;
    short: string;
    icon: ComponentType<{ className?: string }>;
    badge: string;
    chip: string;
    accent: string;
    cardBorder: string;
    cardBg: string;
    iconBg: string;
    progress: string;
  }
> = {
  awaiting: {
    label: 'Awaiting',
    short: 'Awaiting',
    icon: Clock,
    badge: 'bg-slate-100 text-slate-800 border-slate-200',
    chip: 'bg-slate-400',
    accent: 'text-slate-700',
    cardBorder: 'border-slate-200 hover:border-slate-400',
    cardBg: 'from-slate-50 to-white',
    iconBg: 'from-slate-500 to-slate-600',
    progress: 'bg-slate-400',
  },
  pending_evaluation: {
    label: 'AI assignment created — evaluation incomplete',
    short: 'Pending eval',
    icon: AlertCircle,
    badge: 'bg-orange-100 text-orange-900 border-orange-200',
    chip: 'bg-orange-500',
    accent: 'text-orange-800',
    cardBorder: 'border-orange-200 hover:border-orange-400',
    cardBg: 'from-orange-50 to-white',
    iconBg: 'from-orange-500 to-amber-600',
    progress: 'bg-orange-500',
  },
  ready_for_evaluation: {
    label: 'Ready for evaluation',
    short: 'Ready',
    icon: ClipboardCheck,
    badge: 'bg-cyan-100 text-cyan-900 border-cyan-200',
    chip: 'bg-cyan-500',
    accent: 'text-cyan-800',
    cardBorder: 'border-cyan-200 hover:border-cyan-400',
    cardBg: 'from-cyan-50 to-white',
    iconBg: 'from-cyan-500 to-teal-600',
    progress: 'bg-cyan-500',
  },
  in_process: {
    label: 'AI Grading In Process',
    short: 'In Process',
    icon: Loader2,
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    chip: 'bg-indigo-500',
    accent: 'text-indigo-700',
    cardBorder: 'border-indigo-200 hover:border-indigo-400',
    cardBg: 'from-indigo-50 to-white',
    iconBg: 'from-indigo-500 to-indigo-600',
    progress: 'bg-indigo-500',
  },
  completed: {
    label: 'Completed',
    short: 'Completed',
    icon: CheckCircle2,
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    chip: 'bg-emerald-500',
    accent: 'text-emerald-700',
    cardBorder: 'border-emerald-200 hover:border-emerald-400',
    cardBg: 'from-emerald-50 to-white',
    iconBg: 'from-emerald-500 to-emerald-600',
    progress: 'bg-emerald-500',
  },
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const daysSince = (value?: string): number | null => {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const formatDateCompact = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatCreationDate = (ms?: number) => {
  if (ms == null || typeof ms !== 'number') return null;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const categoryDisplayLabel = (category: string | undefined) => {
  if (!category) return '—';
  if (isPastPaperPracticeCategory(category)) return 'Past paper practice';
  if (category === 'WeeklyTest' || category === 'WeeklyTest preparation') return 'Weekly test';
  return category;
};

export const AIGradedAssignments = () => {
  const navigate = useNavigate();

  const [allTopics, setAllTopics] = useState<TopicMetaMap>({});
  const [allItems, setAllItems] = useState<AIGradedAssignmentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [topicFilter, setTopicFilter] = useState<string>('');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoadingItems(true);
    try {
      const { items, topics } = await fetchAllAIGradedAssignmentsAcrossTopics();
      setAllItems(items);
      setAllTopics(topics as TopicMetaMap);
      setHasLoadedOnce(true);
      if (items.length > 0) {
        toast.success(
          `Loaded ${items.length} AI-graded assignment${items.length === 1 ? '' : 's'}.`
        );
      }
    } catch (error) {
      console.error('Error loading AI graded dashboard:', error);
      toast.error('Failed to load AI graded assignments');
      setAllItems([]);
      setHasLoadedOnce(true);
    } finally {
      setLoadingItems(false);
    }
  };

  const topicOptions = useMemo(() => {
    const ids = Object.keys(allTopics);
    return ids
      .map((id) => ({
        id,
        title: allTopics[id]?.name || id,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allTopics]);

  const itemsForScope = useMemo(() => {
    if (!topicFilter) return allItems;
    return allItems.filter((i) => i.topicId === topicFilter);
  }, [allItems, topicFilter]);

  const stats = useMemo(() => {
    const total = itemsForScope.length;
    const awaiting = itemsForScope.filter((i) => i.status === 'awaiting').length;
    const pendingEvaluation = itemsForScope.filter((i) => i.status === 'pending_evaluation').length;
    const readyForEvaluation = itemsForScope.filter((i) => i.status === 'ready_for_evaluation').length;
    const inProcess = itemsForScope.filter((i) => i.status === 'in_process').length;
    const completed = itemsForScope.filter((i) => i.status === 'completed').length;

    const submissionsTotal = itemsForScope.reduce((sum, i) => sum + i.submittedStudents, 0);
    const gradedTotal = itemsForScope.reduce((sum, i) => sum + i.gradedStudents, 0);
    const completionRate =
      submissionsTotal > 0 ? Math.round((gradedTotal / submissionsTotal) * 100) : 0;

    return {
      total,
      awaiting,
      pendingEvaluation,
      readyForEvaluation,
      inProcess,
      completed,
      submissionsTotal,
      gradedTotal,
      completionRate,
    };
  }, [itemsForScope]);

  const filtered = useMemo(() => {
    return itemsForScope.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all') {
        const cat = item.assignment.data.selectedAssignmentCategory;
        if (categoryFilter === 'WeeklyTest' && cat !== 'WeeklyTest') return false;
        if (categoryFilter === 'pastPaper' && !isPastPaperPracticeCategory(cat)) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          item.assignment.data.title.toLowerCase().includes(q) ||
          (item.assignment.data.teacherName ?? '').toLowerCase().includes(q) ||
          item.topicName.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [itemsForScope, statusFilter, categoryFilter, search]);

  const handleOpenAssignmentPortal = (item: AIGradedAssignmentItem) => {
    const base = (GRADING_BASE_URL || '').replace(/\/$/, '');
    const topicKey = item.topicId || item.topicName || '';
    const topicSegment = encodeURIComponent(topicKey);
    const titleSegment = encodeURIComponent(item.assignment.data.title);
    const url = `${base}/assignment/${topicSegment}/teacher/${titleSegment}?type=ATTACHMENT`;
    window.open(url, '_blank');
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setCategoryFilter('all');
    setSearch('');
  };

  const hasActiveFilters =
    statusFilter !== 'all' || categoryFilter !== 'all' || search.trim() !== '';

  const topicFilterMeta = topicFilter ? allTopics[topicFilter] : null;
  const topicFilterLabel = topicFilterMeta?.name || topicFilter || 'All topics';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <Toaster />

      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                title="Back to Home"
              >
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </button>
              <div className="bg-gradient-to-br from-white to-gray-50 p-3 rounded-xl shadow-md border border-gray-200/50">
                <img src={OLevelsLogo} alt="O-Levels Logo" className="h-10 w-auto" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-700 via-purple-700 to-[#b30104] bg-clip-text text-transparent tracking-tight flex items-center gap-2">
                  <Sparkles className="w-7 h-7 text-indigo-600" />
                  AI Graded Assignments
                </h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  Five statuses from <span className="font-mono text-xs">aiAssignmentStatus</span> (pending / active),
                  submission counts, and <span className="font-mono text-xs">aiGradingStatus</span> (in process).
                </p>
              </div>
            </div>
            <button
              onClick={() => void loadDashboard()}
              disabled={loadingItems}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg shadow-md text-sm font-semibold transition-all"
              title="Reload from all topics"
            >
              <RefreshCw className={`w-4 h-4 ${loadingItems ? 'animate-spin' : ''}`} />
              {loadingItems ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Topic filter (optional) */}
        <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            Scope
          </h2>
          <div className="max-w-sm sm:max-w-md">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Topic (optional)
            </label>
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              disabled={loadingItems && !hasLoadedOnce}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm bg-white disabled:bg-gray-50"
            >
              <option value="">All topics</option>
              {topicOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
            <Layers className="w-4 h-4 text-indigo-500" />
            <span className="font-medium text-gray-700">Stats &amp; list scope:</span>
            <span className="font-semibold text-indigo-700">{topicFilterLabel}</span>
          </div>
        </section>

        {!hasLoadedOnce && loadingItems ? (
          <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-16 text-center">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-800 mb-1">Loading AI graded assignments…</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Scanning every topic for AI weekly tests and past paper practice (deadline passed).
            </p>
          </section>
        ) : (
          <>
            {/* Stat cards — five statuses + total */}
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard
                title="Total"
                value={stats.total}
                sub="AI mode · deadline passed"
                icon={Bot}
                gradient="from-indigo-500 to-purple-600"
                ringColor="ring-indigo-100"
              />
              <StatCard
                title="Awaiting"
                value={stats.awaiting}
                sub="No pending/active bucket yet"
                icon={Clock}
                gradient="from-slate-500 to-slate-600"
                ringColor="ring-slate-100"
                onClick={() => setStatusFilter('awaiting')}
                active={statusFilter === 'awaiting'}
              />
              <StatCard
                title="Eval incomplete"
                value={stats.pendingEvaluation}
                sub="aiAssignmentStatus pending"
                icon={AlertCircle}
                gradient="from-orange-500 to-amber-600"
                ringColor="ring-orange-100"
                onClick={() => setStatusFilter('pending_evaluation')}
                active={statusFilter === 'pending_evaluation'}
              />
              <StatCard
                title="Ready for eval"
                value={stats.readyForEvaluation}
                sub="Active, not AI-running"
                icon={ClipboardCheck}
                gradient="from-cyan-500 to-teal-600"
                ringColor="ring-cyan-100"
                onClick={() => setStatusFilter('ready_for_evaluation')}
                active={statusFilter === 'ready_for_evaluation'}
              />
              <StatCard
                title="AI in process"
                value={stats.inProcess}
                sub="aiGradingStatus run"
                icon={Loader2}
                gradient="from-indigo-500 to-blue-600"
                ringColor="ring-indigo-100"
                spinIcon={stats.inProcess > 0}
                onClick={() => setStatusFilter('in_process')}
                active={statusFilter === 'in_process'}
              />
              <StatCard
                title="Completed"
                value={stats.completed}
                sub="All submitters graded"
                icon={CheckCircle2}
                gradient="from-emerald-500 to-emerald-600"
                ringColor="ring-emerald-100"
                onClick={() => setStatusFilter('completed')}
                active={statusFilter === 'completed'}
              />
            </section>

            {/* Progress overview */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-md border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    AI Grading Progress · {topicFilterLabel}
                  </h2>
                  <span className="text-sm text-gray-500">
                    {stats.gradedTotal} / {stats.submissionsTotal} submissions graded
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-700"
                    style={{ width: `${stats.completionRate}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-600">Completion rate</span>
                  <span className="text-2xl font-extrabold bg-gradient-to-r from-indigo-700 to-emerald-700 bg-clip-text text-transparent">
                    {stats.completionRate}%
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  <Legend color="bg-slate-400" label={`${stats.awaiting} Awaiting`} />
                  <Legend color="bg-orange-500" label={`${stats.pendingEvaluation} Eval incomplete`} />
                  <Legend color="bg-cyan-500" label={`${stats.readyForEvaluation} Ready`} />
                  <Legend color="bg-indigo-500" label={`${stats.inProcess} In process`} />
                  <Legend color="bg-emerald-500" label={`${stats.completed} Completed`} />
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-[#b30104] rounded-2xl shadow-md p-6 text-white relative overflow-hidden">
                <div className="absolute -right-6 -top-6 opacity-20">
                  <Sparkles className="w-32 h-32" />
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <Bot className="w-6 h-6" />
                    <h2 className="text-lg font-bold">AI Grading Insights</h2>
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    <span className="font-bold">1 Awaiting</span> · <span className="font-bold">2 Pending</span> (
                    <span className="font-mono">aiAssignmentStatus</span>) · <span className="font-bold">3 Ready</span>{' '}
                    (active, no run) · <span className="font-bold">4 In process</span> · <span className="font-bold">5 Done</span>.
                    Values compared lowercase.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Mini label="Submissions" value={stats.submissionsTotal} />
                    <Mini label="Graded" value={stats.gradedTotal} />
                  </div>
                </div>
              </div>
            </section>

            {/* Filters */}
            <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Filter Assignments
                </h2>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs font-semibold text-[#b30104] hover:text-[#7a0103] underline underline-offset-2"
                  >
                    Clear all filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm bg-white"
                  >
                    <option value="all">All statuses</option>
                    <option value="awaiting">1 · Awaiting</option>
                    <option value="pending_evaluation">2 · AI created — eval incomplete</option>
                    <option value="ready_for_evaluation">3 · Ready for evaluation</option>
                    <option value="in_process">4 · AI Grading In Process</option>
                    <option value="completed">5 · Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Category
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm bg-white"
                  >
                    <option value="all">All categories</option>
                    <option value="WeeklyTest">Weekly Test</option>
                    <option value="pastPaper">Past Paper Practice</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Title, teacher, or topic…"
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                <span>
                  Showing <span className="font-bold text-gray-900">{filtered.length}</span> of{' '}
                  <span className="font-bold text-gray-900">{itemsForScope.length}</span> assignments
                </span>
                {filtered.length === 0 && itemsForScope.length > 0 && (
                  <span className="text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> No assignments match your filters
                  </span>
                )}
              </div>
            </section>

            {/* Assignment list */}
            <section>
              {loadingItems ? (
                <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-16 text-center">
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-800 mb-1">
                    Loading AI graded assignments…
                  </h3>
                  <p className="text-sm text-gray-500">
                    Fetching assignments and submissions for this topic.
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-16 text-center">
                  <div className="bg-indigo-50 w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center">
                    <Bot className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">
                    {!hasLoadedOnce
                      ? 'No data yet'
                      : itemsForScope.length === 0
                      ? 'No AI-mode assignments in this scope'
                      : 'No matching assignments'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {!hasLoadedOnce
                      ? 'Loading…'
                      : itemsForScope.length === 0
                      ? 'No eligible weekly tests or past paper practice with passed deadlines.'
                      : 'Try changing or clearing the filters above.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="hidden xl:block bg-white rounded-2xl shadow-md border border-slate-200/80 overflow-hidden ring-1 ring-slate-900/5">
                    <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/40">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-600" />
                        Assignments — click a row to open in the grading portal
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Submission &amp; grading deadlines, marks, and live progress from Realtime DB
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50/90 border-b border-slate-100">
                            <th className="px-4 py-3 w-[140px]">Topic</th>
                            <th className="px-4 py-3 min-w-[220px]">Assignment</th>
                            <th className="px-4 py-3 whitespace-nowrap">Marks</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 min-w-[168px]">Progress</th>
                            <th className="px-4 py-3 min-w-[150px]">Deadlines</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filtered.map((item) => (
                            <AssignmentTableRow
                              key={`${item.topicId}-${item.assignment.id}`}
                              item={item}
                              onOpen={() => handleOpenAssignmentPortal(item)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:hidden gap-5">
                    {filtered.map((item) => (
                      <AssignmentCard
                        key={`${item.topicId}-${item.assignment.id}`}
                        item={item}
                        onOpen={() => handleOpenAssignmentPortal(item)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

const StatCard = ({
  title,
  value,
  sub,
  icon: Icon,
  gradient,
  ringColor,
  spinIcon = false,
  active = false,
  onClick,
}: {
  title: string;
  value: number;
  sub: string;
  icon: ComponentType<{ className?: string }>;
  gradient: string;
  ringColor: string;
  spinIcon?: boolean;
  active?: boolean;
  onClick?: () => void;
}) => {
  const isClickable = typeof onClick === 'function';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`text-left bg-white rounded-2xl shadow-md border p-5 transition-all duration-200 ${
        isClickable ? 'hover:shadow-lg hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'
      } ${active ? `ring-4 ${ringColor} border-transparent` : 'border-gray-100'}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-extrabold text-gray-900 mt-1">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{sub}</p>
        </div>
        <div
          className={`bg-gradient-to-br ${gradient} p-3 rounded-xl shadow-md text-white flex items-center justify-center`}
        >
          <Icon className={`w-6 h-6 ${spinIcon ? 'animate-spin' : ''}`} />
        </div>
      </div>
    </button>
  );
};

const Legend = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
    <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
    <span className="text-gray-700 font-medium">{label}</span>
  </div>
);

const Mini = ({ label, value }: { label: string; value: number }) => (
  <div className="bg-white/15 backdrop-blur-sm rounded-lg p-3 border border-white/20">
    <p className="text-xs uppercase tracking-wide text-white/70 font-semibold">{label}</p>
    <p className="text-2xl font-extrabold mt-0.5">{value}</p>
  </div>
);

const AssignmentTableRow = ({
  item,
  onOpen,
}: {
  item: AIGradedAssignmentItem;
  onOpen: () => void;
}) => {
  const meta = STATUS_META[item.status];
  const Icon = meta.icon;
  const submitted = item.submittedStudents;
  const graded = item.gradedStudents;
  const total = item.totalStudents;
  const gradingProgress = submitted > 0 ? Math.round((graded / submitted) * 100) : 0;
  const submissionProgress = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const data = item.assignment.data;
  const cat = data.selectedAssignmentCategory;
  const isPastPaper = isPastPaperPracticeCategory(cat);

  return (
    <tr
      onClick={onOpen}
      className="group border-b border-slate-100 last:border-0 hover:bg-indigo-50/40 cursor-pointer transition-colors text-slate-800"
    >
      <td className="px-4 py-3.5 align-top">
        <span
          className="text-xs font-semibold text-indigo-800 leading-snug line-clamp-3"
          title={item.topicName}
        >
          {item.topicName}
        </span>
      </td>
      <td className="px-4 py-3.5 align-top">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span
            className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
              isPastPaper
                ? 'bg-purple-100 text-purple-800'
                : 'bg-sky-100 text-sky-800'
            }`}
          >
            {categoryDisplayLabel(cat)}
          </span>
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-800">
            <Bot className="w-2.5 h-2.5" />
            AI
          </span>
        </div>
        <p className="font-semibold text-slate-900 leading-snug">{data.title || 'Untitled'}</p>
        {data.teacherName ? (
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
            <Users className="w-3 h-3 shrink-0" />
            {data.teacherName}
          </p>
        ) : null}
        {formatCreationDate(data.creationDate) ? (
          <p className="text-[11px] text-slate-400 mt-1">Created {formatCreationDate(data.creationDate)}</p>
        ) : null}
      </td>
      <td className="px-4 py-3.5 align-top tabular-nums text-xs text-slate-700">
        <div className="font-semibold text-slate-900">{data.totalMarks?.trim() ? `${data.totalMarks} marks` : '—'}</div>
      </td>
      <td className="px-4 py-3.5 align-top max-w-[240px]">
        <span
          title={meta.label}
          className={`inline-flex items-start gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold leading-snug ${meta.badge}`}
        >
          <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${item.status === 'in_process' ? 'animate-spin' : ''}`} />
          <span className="line-clamp-3">{meta.label}</span>
        </span>
      </td>
      <td className="px-4 py-3.5 align-top space-y-2.5 text-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Submitted</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="tabular-nums text-sm font-semibold text-slate-900" title="Students who submitted / total enrolled">
              {submitted}/{total}
            </span>
            <div
              className="h-1.5 w-12 shrink-0 rounded-full bg-slate-200 overflow-hidden"
              title={`${submissionProgress}% of enrolled students have submitted`}
            >
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${submissionProgress}%` }} />
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums">{submissionProgress}%</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">out of {total} enrolled</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Graded</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`tabular-nums text-sm font-semibold ${meta.accent}`} title="Graded papers / students who submitted">
              {graded}/{submitted}
            </span>
            <div
              className="h-1.5 w-12 shrink-0 rounded-full bg-slate-200 overflow-hidden"
              title={
                submitted > 0
                  ? `${gradingProgress}% of submissions have a grade`
                  : 'No submissions yet'
              }
            >
              <div className={`h-full ${meta.progress} rounded-full`} style={{ width: `${gradingProgress}%` }} />
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums">{submitted > 0 ? `${gradingProgress}%` : '—'}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">among submitted</p>
        </div>
      </td>
      <td className="px-4 py-3.5 align-top text-xs text-slate-600 space-y-1.5">
        <div title={formatDate(data.deadline)}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Submit by
          </span>
          {formatDateCompact(data.deadline)}
        </div>
        <div title={data.gradingDeadline ? formatDate(data.gradingDeadline) : undefined}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Grade by
          </span>
          {formatDateCompact(data.gradingDeadline)}
        </div>
      </td>
    </tr>
  );
};

const AssignmentCard = ({
  item,
  onOpen,
}: {
  item: AIGradedAssignmentItem;
  onOpen: () => void;
}) => {
  const meta = STATUS_META[item.status];
  const Icon = meta.icon;
  const submitted = item.submittedStudents;
  const graded = item.gradedStudents;
  const total = item.totalStudents;
  const gradingProgress = submitted > 0 ? Math.round((graded / submitted) * 100) : 0;
  const submissionProgress = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const data = item.assignment.data;
  const dSince = daysSince(data.deadline);
  const category = data.selectedAssignmentCategory;
  const isPastPaper = isPastPaperPracticeCategory(category);
  const categoryLabel = categoryDisplayLabel(category);
  const createdLabel = formatCreationDate(data.creationDate);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative w-full text-left rounded-2xl border bg-gradient-to-br ${meta.cardBg} ${meta.cardBorder} p-5 shadow-sm hover:shadow-md ring-1 ring-slate-900/5 transition-all duration-200`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wide mb-1 line-clamp-2">
            {item.topicName}
          </p>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                isPastPaper
                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                  : 'bg-sky-100 text-sky-800 border-sky-200'
              }`}
            >
              {categoryLabel}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-indigo-100 text-indigo-800 border-indigo-200"
              title="weeklyTestGradingMode: ai"
            >
              <Bot className="w-3 h-3" />
              AI
            </span>
          </div>
          <h4 className="font-bold text-slate-900 text-base leading-snug line-clamp-2">
            {data.title || 'Untitled Assignment'}
          </h4>
        </div>
        <div
          className={`shrink-0 bg-gradient-to-br ${meta.iconBg} p-2 rounded-lg shadow-sm text-white`}
          title={meta.label}
        >
          <Icon className={`w-4 h-4 ${item.status === 'in_process' ? 'animate-spin' : ''}`} />
        </div>
      </div>

      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${meta.badge} mb-3`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${meta.chip}`} />
        {meta.label}
      </span>

      <div className="grid grid-cols-2 gap-2 mb-3 rounded-xl bg-white/60 border border-slate-200/80 p-3 text-xs">
        <div title={formatDate(data.deadline)}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
            Submit by
          </p>
          <p className="font-medium text-slate-800 leading-tight">{formatDateCompact(data.deadline)}</p>
        </div>
        <div title={formatDate(data.gradingDeadline)}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5 flex items-center gap-1">
            <Timer className="w-3 h-3 shrink-0" />
            Grade by
          </p>
          <p className="font-medium text-slate-800 leading-tight">{formatDateCompact(data.gradingDeadline)}</p>
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-slate-700 mb-4">
        {dSince != null && (
          <Row
            icon={Clock}
            text={`${
              dSince === 0
                ? 'Submission deadline was today'
                : `${dSince} day${dSince === 1 ? '' : 's'} since submission deadline`
            }`}
            tone={dSince > 7 ? 'warn' : 'muted'}
          />
        )}
        {data.teacherName && <Row icon={Users} text={`Teacher: ${data.teacherName}`} />}
        <Row icon={Award} text={data.totalMarks?.trim() ? `${data.totalMarks} marks` : 'Marks —'} />
        {createdLabel ? (
          <Row icon={Calendar} text={`Created ${createdLabel}`} />
        ) : null}
      </div>

      <div className="rounded-xl bg-white/70 backdrop-blur-sm border border-slate-200/90 p-3 mb-3 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
            <span>Submitted</span>
            <span className="tabular-nums text-slate-900">
              {submitted}/{total}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${submissionProgress}%` }} />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{submissionProgress}% of enrolled • {Math.max(total - submitted, 0)} not submitted</p>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
            <span>Graded (of submitters)</span>
            <span className={`tabular-nums ${meta.accent}`}>
              {graded}/{submitted}
              {submitted > 0 ? ` (${gradingProgress}%)` : ''}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${meta.progress} rounded-full transition-all duration-500`}
              style={{ width: `${gradingProgress}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {submitted > 0 ? 'Share of submitted papers that have a grade' : 'No submissions yet'}
          </p>
        </div>
      </div>

      <div className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold px-3 py-2.5 rounded-xl shadow-sm pointer-events-none">
        Open in grading portal
        <ExternalLink className="w-3.5 h-3.5" />
      </div>
    </button>
  );
};

const Row = ({
  icon: Icon,
  text,
  tone = 'muted',
}: {
  icon: typeof Calendar;
  text: string;
  tone?: 'muted' | 'warn';
}) => (
  <div className="flex items-center gap-2">
    <Icon className={`w-3.5 h-3.5 shrink-0 ${tone === 'warn' ? 'text-amber-600' : 'text-slate-500'}`} />
    <span className={tone === 'warn' ? 'text-amber-800 font-semibold' : 'text-slate-700'}>{text}</span>
  </div>
);

export default AIGradedAssignments;
