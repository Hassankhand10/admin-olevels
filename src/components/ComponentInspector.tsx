import { useEffect, useRef, useState } from 'react';

/**
 * Stable visual-to-source references for the development workflow.
 * Keep IDs stable once assigned; they are the language used in bug reports.
 */
export const COMPONENT_REGISTRY = {
  'C-001': { name: 'Home dashboard', source: 'src/components/HomePage.tsx', route: '/dashboard' },
  'C-002': { name: 'Weekly test dashboard', source: 'src/components/Dashboard.tsx', route: '/dashboard/weekly-test' },
  'C-003': { name: 'Student performance report', source: 'src/components/StudentPerformanceReport.tsx', route: '/dashboard/student-performance-report' },
  'C-004': { name: 'AI graded assignments', source: 'src/components/AIGradedAssignments.tsx', route: '/dashboard/ai-graded-assignments' },
  'C-005': { name: 'Realtime database size', source: 'src/components/RealtimeDbSizePage.tsx', route: '/dashboard/realtime-db-size' },
  'C-006': { name: 'Checker usage', source: 'src/components/CheckerUsagePage.tsx', route: '/dashboard/checker-usage' },
} as const;

type ComponentId = keyof typeof COMPONENT_REGISTRY;
type InspectorId = ComponentId | `C-${number}`;

export function ComponentBoundary({ id, children }: { id: ComponentId; children: React.ReactNode }) {
  if (!import.meta.env.DEV) return <>{children}</>;
  return <div data-component-id={id} style={{ display: 'contents' }}>{children}</div>;
}

export function ComponentInspector() {
  const [enabled, setEnabled] = useState(() => import.meta.env.DEV && localStorage.getItem('olevels:component-inspector') !== 'off');
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  const [markers, setMarkers] = useState<Array<{ id: InspectorId; top: number; left: number }>>([]);
  const [details, setDetails] = useState<Record<string, { name: string; source: string; route: string }>>({});
  const markerSignature = useRef('');

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'i') {
        setEnabled(value => {
          localStorage.setItem('olevels:component-inspector', value ? 'off' : 'on');
          return !value;
        });
      }
    };
    const onMouseOver = (event: MouseEvent) => {
      if (!enabled) return setHovered(null);
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-component-id]');
      setHovered(target);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mouseover', onMouseOver);
    const updateMarkers = () => {
      const nextDetails: Record<string, { name: string; source: string; route: string }> = {};
      const usedIds = new Set<string>(Object.keys(COMPONENT_REGISTRY));
      const makeSectionId = (route: string, name: string, index: number): InspectorId => {
        const value = `${route}|${name}|${index}`;
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
        let number = 100 + (Math.abs(hash) % 900);
        while (usedIds.has(`C-${number}`)) number = number >= 999 ? 100 : number + 1;
        const id = `C-${number}` as InspectorId;
        usedIds.add(id);
        return id;
      };
      const nextMarkers = Array.from(document.querySelectorAll<HTMLElement>('[data-component-id]:not([data-inspector-section])')).flatMap((element) => {
      const rootId = element.dataset.componentId as ComponentId;
      const rootRect = (element.firstElementChild as HTMLElement | null)?.getBoundingClientRect();
      const regions = [element, ...Array.from(element.querySelectorAll<HTMLElement>('main,section,header,article,aside,[role="region"]'))];
      return regions.flatMap((region, index) => {
        const heading = region.querySelector<HTMLElement>('h1,h2,h3,h4')?.innerText?.trim();
        const id = region === element ? rootId : makeSectionId(window.location.pathname, heading || region.tagName.toLowerCase(), index);
        if (region !== element) {
          region.dataset.componentId = id;
          region.dataset.inspectorSection = 'true';
        }
        nextDetails[id] = region === element
          ? COMPONENT_REGISTRY[rootId]
          : { name: heading || `${region.tagName.toLowerCase()} section`, source: COMPONENT_REGISTRY[rootId].source, route: COMPONENT_REGISTRY[rootId].route };
        const rect = region === element ? rootRect : region.getBoundingClientRect();
        return rect && rect.width > 0 && rect.height > 0 ? [{ id, top: Math.max(4, rect.top + 4), left: Math.max(4, rect.left + 4) }] : [];
      });
      });
      const nextSignature = JSON.stringify(nextMarkers);
      if (nextSignature !== markerSignature.current) {
        markerSignature.current = nextSignature;
        setMarkers(nextMarkers);
        setDetails(nextDetails);
      }
    };
    updateMarkers();
    const observer = new MutationObserver(updateMarkers);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', updateMarkers);
    window.addEventListener('scroll', updateMarkers, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mouseover', onMouseOver);
      observer.disconnect();
      window.removeEventListener('resize', updateMarkers);
      window.removeEventListener('scroll', updateMarkers, true);
    };
  }, [enabled]);

  if (!import.meta.env.DEV || !enabled) return null;
  const hoveredId = hovered?.dataset.componentId as InspectorId | undefined;
  const metadata = hoveredId ? details[hoveredId] || COMPONENT_REGISTRY[hoveredId as ComponentId] : undefined;
  const rect = hovered?.getBoundingClientRect();

  return <>
    {markers.map(marker => <div key={marker.id} className="component-inspector-marker" style={{ top: marker.top, left: marker.left }}>{marker.id}</div>)}
    {metadata && rect ? <>
      <div className="component-inspector-outline" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      <div className="component-inspector-badge" style={{ top: Math.max(4, rect.top - 28), left: Math.max(4, rect.left) }}>
        <strong>{hoveredId}</strong><span>{metadata.name}</span><small>{metadata.route} · {metadata.source}</small>
      </div>
    </> : null}
  </>;
}
