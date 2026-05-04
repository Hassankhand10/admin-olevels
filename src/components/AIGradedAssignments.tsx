import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import OLevelsLogo from '../assets/OLevels-logo-color.png';
import {
  fetchAIGradedAssignmentsForTopic,
  fetchTopics,
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
    icon: typeof CheckCircle2;
    badge: string;
    chip: string;
    accent: string;
    cardBorder: string;
    cardBg: string;
    iconBg: string;
    progress: string;
  }
> = {
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
  awaiting: {
    label: 'Awaiting AI Grading',
    short: 'Awaiting',
    icon: Clock,
    badge: 'bg-amber-100 text-amber-900 border-amber-200',
    chip: 'bg-amber-500',
    accent: 'text-amber-800',
    cardBorder: 'border-amber-200 hover:border-amber-400',
    cardBg: 'from-amber-50 to-white',
    iconBg: 'from-amber-500 to-orange-500',
    progress: 'bg-amber-500',
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

export const AIGradedAssignments = () => {
  const navigate = useNavigate();

  const [allTopics, setAllTopics] = useState<TopicMetaMap>({});
  const [loadingTopics, setLoadingTopics] = useState(false);

  const [selectedTopic, setSelectedTopic] = useState<string>('');

  const [items, setItems] = useState<AIGradedAssignmentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadTopicsMeta();
  }, []);

  useEffect(() => {
    if (selectedTopic) {
      void loadAssignmentsForTopic(selectedTopic);
    } else {
      setItems([]);
      setHasLoadedOnce(false);
    }
  }, [selectedTopic]);

  const loadTopicsMeta = async () => {
    setLoadingTopics(true);
    try {
      const data = await fetchTopics();
      setAllTopics(data as TopicMetaMap);
    } catch (error) {
      console.error('Error loading topics:', error);
      toast.error('Error loading topics');
    } finally {
      setLoadingTopics(false);
    }
  };

  const loadAssignmentsForTopic = async (topicId: string) => {
    setLoadingItems(true);
    try {
      const meta = allTopics[topicId];
      const data = await fetchAIGradedAssignmentsForTopic(topicId, meta);
      setItems(data);
      setHasLoadedOnce(true);
      toast.success(
        `Loaded ${data.length} AI-graded assignment${data.length === 1 ? '' : 's'} for ${
          meta?.name || topicId
        }`
      );
    } catch (error) {
      console.error('Error loading assignments:', error);
      toast.error('Failed to load AI graded assignments');
      setItems([]);
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

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.status === 'completed').length;
    const inProcess = items.filter((i) => i.status === 'in_process').length;
    const awaiting = items.filter((i) => i.status === 'awaiting').length;

    const submissionsTotal = items.reduce((sum, i) => sum + i.submittedStudents, 0);
    const gradedTotal = items.reduce((sum, i) => sum + i.gradedStudents, 0);
    const completionRate =
      submissionsTotal > 0 ? Math.round((gradedTotal / submissionsTotal) * 100) : 0;

    return { total, completed, inProcess, awaiting, submissionsTotal, gradedTotal, completionRate };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
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
          (item.assignment.data.teacherName ?? '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [items, statusFilter, categoryFilter, search]);

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

  const selectedTopicMeta = selectedTopic ? allTopics[selectedTopic] : null;
  const selectedTopicName = selectedTopicMeta?.name || selectedTopic;

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
                  Pick a course &amp; topic to load AI-graded weekly tests / past paper practice
                </p>
              </div>
            </div>
            <button
              onClick={() => selectedTopic && loadAssignmentsForTopic(selectedTopic)}
              disabled={loadingItems || !selectedTopic}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg shadow-md text-sm font-semibold transition-all"
              title={selectedTopic ? 'Refresh current topic' : 'Select a topic first'}
            >
              <RefreshCw className={`w-4 h-4 ${loadingItems ? 'animate-spin' : ''}`} />
              {loadingItems ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Topic selector */}
        <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            Select Topic
          </h2>
          <div className="max-w-sm sm:max-w-md">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Topic
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              disabled={loadingTopics || topicOptions.length === 0}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm bg-white disabled:bg-gray-50"
            >
              <option value="">
                {loadingTopics
                  ? 'Loading topics…'
                  : topicOptions.length === 0
                  ? 'No topics available'
                  : 'Select a topic…'}
              </option>
              {topicOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          {selectedTopic && (
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span className="font-medium text-gray-700">Currently viewing:</span>
              <span className="font-semibold text-indigo-700">{selectedTopicName}</span>
            </div>
          )}
        </section>

        {/* Empty / waiting state */}
        {!selectedTopic && (
          <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-16 text-center">
            <div className="bg-gradient-to-br from-indigo-100 to-purple-100 w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center">
              <Bot className="w-10 h-10 text-indigo-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Select a topic to begin</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Choose a course and a topic above to fetch all AI-graded weekly tests and past paper
              practice assignments whose deadline has passed.
            </p>
          </section>
        )}

        {/* Content for selected topic */}
        {selectedTopic && (
          <>
            {/* Stat cards */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard
                title="Total Assignments"
                value={stats.total}
                sub="Deadline passed"
                icon={Bot}
                gradient="from-indigo-500 to-purple-600"
                ringColor="ring-indigo-100"
              />
              <StatCard
                title="Completed"
                value={stats.completed}
                sub="All submissions graded"
                icon={CheckCircle2}
                gradient="from-emerald-500 to-emerald-600"
                ringColor="ring-emerald-100"
                onClick={() => setStatusFilter('completed')}
                active={statusFilter === 'completed'}
              />
              <StatCard
                title="AI Grading In Process"
                value={stats.inProcess}
                sub="Currently being graded"
                icon={Loader2}
                gradient="from-indigo-500 to-blue-600"
                ringColor="ring-indigo-100"
                spinIcon={stats.inProcess > 0}
                onClick={() => setStatusFilter('in_process')}
                active={statusFilter === 'in_process'}
              />
              <StatCard
                title="Awaiting AI Grading"
                value={stats.awaiting}
                sub="Deadline passed, queued"
                icon={Clock}
                gradient="from-amber-500 to-orange-500"
                ringColor="ring-amber-100"
                onClick={() => setStatusFilter('awaiting')}
                active={statusFilter === 'awaiting'}
              />
            </section>

            {/* Progress overview */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-md border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    AI Grading Progress · {selectedTopicName}
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
                <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
                  <Legend color="bg-emerald-500" label={`${stats.completed} Completed`} />
                  <Legend color="bg-indigo-500" label={`${stats.inProcess} In Process`} />
                  <Legend color="bg-amber-500" label={`${stats.awaiting} Awaiting`} />
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
                    Showing all <span className="font-bold">Weekly Test</span> and{' '}
                    <span className="font-bold">Past Paper Practice</span> assignments in this topic
                    whose deadline has passed and which use AI grading (
                    <span className="font-mono">ai</span> or default).
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
                    <option value="completed">Completed</option>
                    <option value="in_process">AI Grading In Process</option>
                    <option value="awaiting">Awaiting AI Grading</option>
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
                      placeholder="Title or teacher…"
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                <span>
                  Showing <span className="font-bold text-gray-900">{filtered.length}</span> of{' '}
                  <span className="font-bold text-gray-900">{items.length}</span> assignments
                </span>
                {filtered.length === 0 && items.length > 0 && (
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
                      : items.length === 0
                      ? 'No AI graded assignments for this topic'
                      : 'No matching assignments'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {!hasLoadedOnce
                      ? 'Loading…'
                      : items.length === 0
                      ? 'No weekly tests or past paper practice with passed deadlines were found.'
                      : 'Try changing or clearing the filters above.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filtered.map((item) => (
                    <AssignmentCard
                      key={`${item.topicId}-${item.assignment.id}`}
                      item={item}
                      onOpen={() => handleOpenAssignmentPortal(item)}
                    />
                  ))}
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
  icon: typeof CheckCircle2;
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
  const progress = submitted > 0 ? Math.round((graded / submitted) * 100) : 0;
  const dSince = daysSince(item.assignment.data.deadline);
  const category = item.assignment.data.selectedAssignmentCategory;
  const isPastPaper = isPastPaperPracticeCategory(category);
  const categoryLabel = isPastPaper ? 'Past Paper Practice' : 'Weekly Test';
  const isAi = item.assignment.data.weeklyTestGradingMode === 'ai';

  return (
    <div
      className={`relative rounded-xl border bg-gradient-to-br ${meta.cardBg} ${meta.cardBorder} p-5 shadow-sm hover:shadow-lg transition-all duration-200`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                isPastPaper
                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                  : 'bg-blue-100 text-blue-800 border-blue-200'
              }`}
            >
              {categoryLabel}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                isAi
                  ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                  : 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
              title={isAi ? 'Explicit AI grading' : 'Default (treated as AI)'}
            >
              <Bot className="w-3 h-3" />
              {isAi ? 'AI' : 'AI · default'}
            </span>
          </div>
          <h4 className="font-bold text-gray-900 text-base leading-snug line-clamp-2">
            {item.assignment.data.title || 'Untitled Assignment'}
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

      <div className="space-y-1.5 text-xs text-gray-700 mb-4">
        <Row icon={Calendar} text={`Deadline: ${formatDate(item.assignment.data.deadline)}`} />
        {dSince != null && (
          <Row
            icon={Clock}
            text={`${
              dSince === 0
                ? 'Deadline passed today'
                : `${dSince} day${dSince === 1 ? '' : 's'} since deadline`
            }`}
            tone={dSince > 7 ? 'warn' : 'muted'}
          />
        )}
        {item.assignment.data.teacherName && (
          <Row icon={Users} text={`Teacher: ${item.assignment.data.teacherName}`} />
        )}
        <Row
          icon={Award}
          text={`${item.assignment.data.totalMarks || '—'} marks • Weight ${
            item.assignment.data.weightage ?? 0
          }`}
        />
      </div>

      <div className="rounded-lg bg-white/70 backdrop-blur-sm border border-gray-200 p-3 mb-3">
        <div className="flex items-center justify-between text-xs font-semibold text-gray-700 mb-1.5">
          <span>Grading progress</span>
          <span className={meta.accent}>
            {graded}/{submitted || 0} ({progress}%)
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${meta.progress} transition-all duration-500`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
          <span>{item.totalStudents} enrolled</span>
          <span>
            {submitted} submitted • {Math.max(item.totalStudents - submitted, 0)} pending submission
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-semibold px-3 py-2.5 rounded-lg shadow-sm hover:shadow-md transition-all"
      >
        Open Assignment Portal
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
    </div>
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
    <Icon className={`w-3.5 h-3.5 ${tone === 'warn' ? 'text-amber-600' : 'text-gray-500'}`} />
    <span className={tone === 'warn' ? 'text-amber-800 font-semibold' : 'text-gray-700'}>{text}</span>
  </div>
);

export default AIGradedAssignments;
