import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Database, Loader2, RefreshCw, Search } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import OLevelsLogo from '../assets/OLevels-logo-color.png';
import {
  scanRealtimeDatabaseNodeSizes,
  computeJsonExportUtf8Size,
  composeTopLevelObjectJsonUtf8Size,
} from '../services/realtimeDbSizeScan';
import { shallowPeek } from '../services/realtimeDbShallow';
import {
  type RealtimeDbTreeNode,
  stubRootChild,
  buildChildNodes,
  fetchValueAtPath,
  hasExpandableChildren,
} from '../services/realtimeDbTreeNodes';

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function updateNodeAtPath(
  nodes: RealtimeDbTreeNode[],
  targetPath: string,
  fn: (n: RealtimeDbTreeNode) => RealtimeDbTreeNode
): RealtimeDbTreeNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return fn(n);
    if (n.children.length > 0) {
      return { ...n, children: updateNodeAtPath(n.children, targetPath, fn) };
    }
    return n;
  });
}

function flattenVisible(nodes: RealtimeDbTreeNode[], query: string, out: RealtimeDbTreeNode[]): void {
  const q = query.trim().toLowerCase();
  for (const n of nodes) {
    const matches = !q || n.path.toLowerCase().includes(q) || n.segment.toLowerCase().includes(q);
    if (matches) out.push(n);
    if (n.expanded && n.children.length > 0) {
      flattenVisible(n.children, query, out);
    }
  }
}

function findNodeByPath(nodes: RealtimeDbTreeNode[], targetPath: string): RealtimeDbTreeNode | null {
  for (const n of nodes) {
    if (n.path === targetPath) return n;
    if (n.children.length > 0) {
      const found = findNodeByPath(n.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

export const RealtimeDbSizePage = () => {
  const navigate = useNavigate();
  const [tree, setTree] = useState<RealtimeDbTreeNode[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [exactTotalLoading, setExactTotalLoading] = useState(false);
  const [exactTotalBytes, setExactTotalBytes] = useState<number | null>(null);
  const prefetchGenRef = useRef(0);

  const prefetchRootBranchSizes = useCallback(async (paths: string[], generation: number) => {
    const concurrency = 5;
    for (let i = 0; i < paths.length; i += concurrency) {
      if (prefetchGenRef.current !== generation) return;
      const chunk = paths.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (fullPath) => {
          try {
            const val = await fetchValueAtPath(fullPath);
            if (prefetchGenRef.current !== generation) return;
            const bytes = computeJsonExportUtf8Size(val);
            const expandable = val !== null && typeof val === 'object' && hasExpandableChildren(val);
            const pendingValue =
              expandable && val !== null && typeof val === 'object' ? val : null;
            setTree((t) => {
              if (prefetchGenRef.current !== generation) return t;
              return updateNodeAtPath(t, fullPath, (n) => ({
                ...n,
                sizeLoading: false,
                subtreeBytes: bytes,
                pendingValue,
                expandable,
              }));
            });
          } catch {
            if (prefetchGenRef.current !== generation) return;
            setTree((t) => {
              if (prefetchGenRef.current !== generation) return t;
              return updateNodeAtPath(t, fullPath, (n) => ({
                ...n,
                sizeLoading: false,
                subtreeBytes: null,
              }));
            });
          }
        })
      );
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }, []);

  const loadRootKeys = useCallback(async () => {
    prefetchGenRef.current += 1;
    const prefetchGen = prefetchGenRef.current;
    setRootLoading(true);
    setRootError(null);
    setExactTotalBytes(null);
    try {
      const peek = await shallowPeek('/');
      if (peek.kind === 'missing') {
        setTree([]);
        return;
      }
      if (peek.kind === 'leaf') {
        const bytes = computeJsonExportUtf8Size(peek.value);
        setTree([
          {
            path: '/',
            segment: '(root)',
            depth: 0,
            expanded: true,
            loaded: true,
            loading: false,
            sizeLoading: false,
            expandable: false,
            subtreeBytes: bytes,
            pendingValue: null,
            children: [],
          },
        ]);
        return;
      }
      if (peek.childKeys.length === 0) {
        setTree([
          {
            path: '/',
            segment: '(root)',
            depth: 0,
            expanded: true,
            loaded: true,
            loading: false,
            sizeLoading: false,
            expandable: false,
            subtreeBytes: 2,
            pendingValue: null,
            children: [],
          },
        ]);
        return;
      }
      setTree(peek.childKeys.map((k) => stubRootChild(k)));
      void prefetchRootBranchSizes(
        peek.childKeys.map((k) => `/${k}`),
        prefetchGen
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRootError(message);
      setTree([]);
      toast.error(message);
    } finally {
      setRootLoading(false);
    }
  }, [prefetchRootBranchSizes]);

  useEffect(() => {
    void loadRootKeys();
  }, [loadRootKeys]);

  const visibleRows = useMemo(() => {
    const out: RealtimeDbTreeNode[] = [];
    flattenVisible(tree, query, out);
    return out;
  }, [tree, query]);

  /** Exact root export size once every top-level branch has finished prefetch (no extra download). */
  const derivedTotalBytes = useMemo((): number | null => {
    if (tree.length === 0) return null;
    if (tree.length === 1 && tree[0].path === '/') {
      const n = tree[0];
      if (n.sizeLoading || n.subtreeBytes === null) return null;
      return n.subtreeBytes;
    }
    if (tree.some((n) => n.sizeLoading)) return null;
    if (tree.some((n) => n.subtreeBytes === null)) return null;
    return composeTopLevelObjectJsonUtf8Size(
      tree.map((n) => ({ key: n.segment, valueJsonUtf8Bytes: n.subtreeBytes as number }))
    );
  }, [tree]);

  const displayTotalBytes = derivedTotalBytes ?? exactTotalBytes;
  const totalBytesSource: 'derived' | 'full-read' | null =
    derivedTotalBytes !== null ? 'derived' : exactTotalBytes !== null ? 'full-read' : null;

  const loadExactTotal = useCallback(async () => {
    setExactTotalLoading(true);
    try {
      const result = await scanRealtimeDatabaseNodeSizes();
      if (result.error) {
        toast.error(result.error);
        setExactTotalBytes(null);
        return;
      }
      setExactTotalBytes(result.totalBytes);
      toast.success('Exact total loaded (full database download).');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
      setExactTotalBytes(null);
    } finally {
      setExactTotalLoading(false);
    }
  }, []);

  const onToggleExpand = useCallback(async (path: string) => {
    const node = findNodeByPath(tree, path);
    if (!node) return;

    if (!node.expandable) return;

    if (node.sizeLoading) return;

    if (node.loaded) {
      setTree((t) => updateNodeAtPath(t, path, (n) => ({ ...n, expanded: !n.expanded })));
      return;
    }

    if (node.loading) return;

    setTree((t) => updateNodeAtPath(t, path, (n) => ({ ...n, loading: true })));

    try {
      let value: unknown;
      if (node.pendingValue !== null && node.pendingValue !== undefined) {
        value = node.pendingValue;
      } else {
        value = await fetchValueAtPath(path);
      }

      const depth = node.depth + 1;
      const children = buildChildNodes(path, depth, value);
      const bytes = computeJsonExportUtf8Size(value);

      setTree((t) =>
        updateNodeAtPath(t, path, (n) => ({
          ...n,
          loading: false,
          sizeLoading: false,
          loaded: true,
          expanded: true,
          expandable: children.length > 0,
          subtreeBytes: bytes,
          pendingValue: null,
          children,
        }))
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
      setTree((t) => updateNodeAtPath(t, path, (n) => ({ ...n, loading: false })));
    }
  }, [tree]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Toaster position="top-center" />
      <header className="bg-white/95 backdrop-blur-md shadow-lg border-b-4 border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="shrink-0 p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <img src={OLevelsLogo} alt="O-Levels" className="h-10 w-auto hidden sm:block" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-800 truncate flex items-center gap-2">
                <Database className="w-5 h-5 text-[#b30104] shrink-0" />
                Realtime DB size
              </h1>
              <p className="text-xs text-gray-500 truncate">
                Top-level sizes load automatically; expand a row to open its sub-table (no extra read if size
                already loaded)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadRootKeys()}
            disabled={rootLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#b30104] text-white text-sm font-semibold hover:bg-[#7a0103] disabled:opacity-60 transition-colors"
          >
            {rootLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Reload tree
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">Exact total JSON export size (UTF-8)</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {displayTotalBytes !== null ? formatBytes(displayTotalBytes) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {displayTotalBytes !== null ? (
                  <>
                    {displayTotalBytes.toLocaleString()} bytes
                    {totalBytesSource === 'derived' ? (
                      <span className="text-gray-500"> · from all loaded top-level branches</span>
                    ) : (
                      <span className="text-gray-500"> · from one full-database read</span>
                    )}
                  </>
                ) : tree.some((n) => n.sizeLoading) ? (
                  'Summing branches as they finish loading…'
                ) : (
                  'Not available yet'
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              Visible rows: <span className="font-semibold text-gray-900">{visibleRows.length}</span>
              {rootError ? <span className="text-red-600 ml-2">({rootError})</span> : null}
            </p>
            <div className="relative max-w-md w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter path or key…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#b30104]/30 focus:border-[#b30104]"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[calc(100vh-18rem)] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="text-left font-semibold text-gray-700 px-4 py-3">Path / key</th>
                  <th className="text-right font-semibold text-gray-700 px-4 py-3 whitespace-nowrap">
                    Subtree size
                  </th>
                  <th className="text-right font-semibold text-gray-600 px-4 py-3 whitespace-nowrap hidden md:table-cell">
                    Bytes
                  </th>
                </tr>
              </thead>
              <tbody>
                {rootLoading && tree.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-16 text-center text-gray-500">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#b30104]" />
                      Loading root keys…
                    </td>
                  </tr>
                ) : visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-12 text-center text-gray-500">
                      {tree.length === 0 ? 'No data at root.' : 'No rows match your filter.'}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((n) => (
                    <tr
                      key={n.path}
                      className={`border-t border-gray-100 hover:bg-gray-50/90 ${
                        n.depth > 0 ? 'bg-gray-50/40' : 'bg-white'
                      }`}
                    >
                      <td className="px-0 py-0 align-middle">
                        <div
                          className="flex items-start gap-1 py-2.5 pr-2 min-w-0"
                          style={{
                            marginLeft: n.depth * 14,
                            borderLeftWidth: n.depth > 0 ? 2 : 0,
                            borderLeftColor: n.depth > 0 ? 'rgb(229 231 235)' : 'transparent',
                            paddingLeft: n.depth > 0 ? 10 : 16,
                          }}
                        >
                          {n.expandable ? (
                            <button
                              type="button"
                              onClick={() => void onToggleExpand(n.path)}
                              disabled={n.loading || n.sizeLoading}
                              className="shrink-0 mt-0.5 p-1 rounded-md text-gray-600 hover:bg-gray-200/80 disabled:opacity-50"
                              aria-expanded={n.expanded}
                              aria-label={n.expanded ? 'Collapse' : 'Expand'}
                            >
                              {n.loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : n.expanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <span className="shrink-0 w-6 inline-block" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-gray-800 text-xs sm:text-sm">{n.segment}</div>
                            <div className="font-mono text-[11px] sm:text-xs text-gray-500 break-all">{n.path}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900 whitespace-nowrap tabular-nums align-middle">
                        {n.sizeLoading ? (
                          <span className="inline-flex items-center justify-end gap-1 text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin text-[#b30104]" />
                            <span className="text-xs font-normal">…</span>
                          </span>
                        ) : n.subtreeBytes !== null ? (
                          formatBytes(n.subtreeBytes)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500 text-xs whitespace-nowrap hidden md:table-cell tabular-nums align-middle">
                        {n.sizeLoading ? (
                          <span className="inline-flex justify-end">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                          </span>
                        ) : n.subtreeBytes !== null ? (
                          n.subtreeBytes.toLocaleString()
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
