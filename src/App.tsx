import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './components/HomePage';
import { Dashboard } from './components/Dashboard';
import { StudentPerformanceReport } from './components/StudentPerformanceReport';
import { AIGradedAssignments } from './components/AIGradedAssignments';
import { RealtimeDbSizePage } from './components/RealtimeDbSizePage';
import { CheckerUsagePage } from './components/CheckerUsagePage';
import { useAuthGuard } from './utils/authGuard';
import { ComponentBoundary, ComponentInspector } from './components/ComponentInspector';

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthGuard();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <ComponentInspector />
      <Routes>
        <Route path="/" element={
          <ProtectedRoute>
            <ComponentBoundary id="C-001"><HomePage /></ComponentBoundary>
          </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <ComponentBoundary id="C-001"><HomePage /></ComponentBoundary>
          </ProtectedRoute>
        } />
        <Route path="/dashboard/weekly-test" element={
          <ProtectedRoute>
            <ComponentBoundary id="C-002"><Dashboard /></ComponentBoundary>
          </ProtectedRoute>
        } />
        <Route path="/dashboard/student-performance-report" element={
          <ProtectedRoute>
            <ComponentBoundary id="C-003"><StudentPerformanceReport /></ComponentBoundary>
          </ProtectedRoute>
        } />
        <Route path="/dashboard/ai-graded-assignments" element={
          <ProtectedRoute>
            <ComponentBoundary id="C-004"><AIGradedAssignments /></ComponentBoundary>
          </ProtectedRoute>
        } />
        <Route path="/dashboard/realtime-db-size" element={
          <ProtectedRoute>
            <ComponentBoundary id="C-005"><RealtimeDbSizePage /></ComponentBoundary>
          </ProtectedRoute>
        } />
        <Route path="/dashboard/checker-usage" element={
          <ProtectedRoute>
            <ComponentBoundary id="C-006"><CheckerUsagePage /></ComponentBoundary>
          </ProtectedRoute>
        } />
        <Route path="/home" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
