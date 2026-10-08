# Component inspector

In local development, the portal exposes stable visual-to-source references for the main views.

- Hover a marked view to see its ID, friendly name, and source file.
- Press `Ctrl+Shift+I` to toggle the inspector. The setting is saved in the browser.
- The overlay is only compiled into the development experience; production renders the normal UI.
- When adding a new shared teacher/student view, add one stable entry to `COMPONENT_REGISTRY` and wrap the route with `ComponentBoundary`.
- Do not renumber existing IDs. A bug report such as “change C-002” should continue to identify the same component over time.

The current route-level map is:

| ID | View | Source |
| --- | --- | --- |
| C-001 | Home dashboard | `src/components/HomePage.tsx` |
| C-002 | Weekly test dashboard | `src/components/Dashboard.tsx` |
| C-003 | Student performance report | `src/components/StudentPerformanceReport.tsx` |
| C-004 | AI graded assignments | `src/components/AIGradedAssignments.tsx` |
| C-005 | Realtime database size | `src/components/RealtimeDbSizePage.tsx` |
| C-006 | Checker usage | `src/components/CheckerUsagePage.tsx` |

For finer-grained labels inside a page, reuse `ComponentBoundary` around a stable visual section and assign the next unused ID. Keep shared boundaries in the component used by both roles so teacher and student views remain connected to the same source reference.
