import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, Users, CheckCircle } from 'lucide-react';
import OLevelsLogo from '../assets/OLevels-logo-color.png';
import { fetchAssignments, fetchStudentSubmissions, fetchTopics, updateSupervisionApproval, fetchStudentCategories } from '../services/firebaseService';
import { Assignment, StudentData } from '../types';
import toast, { Toaster } from 'react-hot-toast';

export const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab] = useState<'weekly-test'>('weekly-test');
  const [courses, setCourses] = useState<{id: number, title: string}[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<{id: number | 'all', title: string} | null>(null);
  const [allTopics, setAllTopics] = useState<{[key: string]: {course: any}}>({});
  const [filteredTopics, setFilteredTopics] = useState<{id: string, title: string}[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [assignments, setAssignments] = useState<{ id: string; data: Assignment }[]>([]);
  const [allAssignments, setAllAssignments] = useState<{[topicId: string]: { id: string; data: Assignment }[]}>({});
  const [ungradedAssignments, setUngradedAssignments] = useState<Array<{
    topicId: string;
    topicName: string;
    assignment: { id: string; data: Assignment };
    needsGrading: boolean;
    totalStudents: number;
    submittedStudents: number;
    gradedStudents: number;
  }>>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<{ id: string; title: string } | null>(null);
  const [students, setStudents] = useState<StudentData>({});
  const [studentCategories, setStudentCategories] = useState<{[studentName: string]: {category: string}}>({});
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingAllAssignments, setLoadingAllAssignments] = useState(false);
  const [loadingUngradedAssignments, setLoadingUngradedAssignments] = useState(false);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'overdue' | 'in-progress'>('all');
  const [searchName, setSearchName] = useState('');
  
  // Student submissions filtering
  const [studentFilterType, setStudentFilterType] = useState<'all' | 'graded' | 'submitted' | 'pending'>('all');
  const [studentSearchName, setStudentSearchName] = useState('');

  useEffect(() => {
    loadCourses();
    loadAllTopics();
    loadAllAssignmentsFromAllTopics();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      filterTopicsByCourse();
    }
  }, [selectedCourse, allTopics]);

  useEffect(() => {
    if (selectedTopic) {
      loadAssignments(selectedTopic);
    }
  }, [selectedTopic]);

  useEffect(() => {
    if (selectedAssignment && selectedTopic) {
      loadStudents(selectedTopic, selectedAssignment.title);
    }
  }, [selectedAssignment, selectedTopic]);

  const loadCourses = async () => {
    setLoadingCourses(true);
    try {
      const response = await fetch('http://localhost:5001/olevels-live/us-central1/api/admin/getAllCourses');
      const data = await response.json();
      
      if (data.success) {
        const coursesList = data.data.map((course: any) => ({
          id: course.id,
          title: course.title
        }));
        setCourses([{id: 'all', title: 'All'}, ...coursesList]);
        toast.success('Courses loaded successfully');
      } else {
        toast.error('Failed to load courses');
      }
    } catch (error) {
      console.error('Error loading courses:', error);
      toast.error('Error loading courses');
    } finally {
      setLoadingCourses(false);
    }
  };

  const loadAllTopics = async () => {
    setLoadingTopics(true);
    try {
      const topicsData = await fetchTopics();
      setAllTopics(topicsData);
      toast.success('Topics loaded successfully');
    } catch (error) {
      console.error('Error loading topics:', error);
      toast.error('Error loading topics');
    } finally {
      setLoadingTopics(false);
    }
  };

  const loadAllAssignmentsFromAllTopics = async () => {
    setLoadingAllAssignments(true);
    try {
      const topicsData = await fetchTopics();
      const allAssignmentsData: {[topicId: string]: { id: string; data: Assignment }[]} = {};
      
      // Load assignments from all topics
      const assignmentPromises = Object.keys(topicsData).map(async (topicId) => {
        try {
          const assignments = await fetchAssignments(topicId);
          allAssignmentsData[topicId] = assignments;
        } catch (error) {
          console.error(`Error loading assignments for topic ${topicId}:`, error);
          allAssignmentsData[topicId] = [];
        }
      });

      await Promise.all(assignmentPromises);
      setAllAssignments(allAssignmentsData);
      
      // Load ungraded assignments after all assignments are loaded
      loadUngradedAssignments(allAssignmentsData, topicsData);
      
      toast.success('All assignments loaded successfully');
    } catch (error) {
      console.error('Error loading all assignments:', error);
      toast.error('Error loading all assignments');
    } finally {
      setLoadingAllAssignments(false);
    }
  };

  const loadUngradedAssignments = async (assignmentsData: {[topicId: string]: { id: string; data: Assignment }[]}, topicsData: {[key: string]: {course: any}}) => {
    setLoadingUngradedAssignments(true);
    try {
      const ungradedList: Array<{
        topicId: string;
        topicName: string;
        assignment: { id: string; data: Assignment };
        needsGrading: boolean;
        totalStudents: number;
        submittedStudents: number;
        gradedStudents: number;
      }> = [];

      for (const [topicId, topicAssignments] of Object.entries(assignmentsData)) {
        const topicName = topicsData[topicId]?.course?.name || topicId;
        
        for (const assignment of topicAssignments) {
          try {
            // Get students for this assignment
            const studentData = await fetchStudentSubmissions(topicId, assignment.data.title);
            const studentCount = Object.keys(studentData).length;
            
            let submittedCount = 0;
            let gradedCount = 0;

            Object.values(studentData).forEach((student: any) => {
              if (student.submission) {
                submittedCount++;
                if (student.graded) {
                  gradedCount++;
                }
              }
            });

            // Add to ungraded if there are submissions but not all are graded
            if (submittedCount > 0 && gradedCount < submittedCount) {
              ungradedList.push({
                topicId,
                topicName,
                assignment,
                needsGrading: true,
                totalStudents: studentCount,
                submittedStudents: submittedCount,
                gradedStudents: gradedCount
              });
            }
          } catch (error) {
            console.error(`Error checking assignment ${assignment.data.title} in topic ${topicId}:`, error);
          }
        }
      }

      setUngradedAssignments(ungradedList);
    } catch (error) {
      console.error('Error loading ungraded assignments:', error);
      toast.error('Error loading ungraded assignments');
    } finally {
      setLoadingUngradedAssignments(false);
    }
  };

  const filterTopicsByCourse = () => {
    if (!selectedCourse || selectedCourse.id === 'all') {
      const allTopicsList = Object.keys(allTopics).map(id => ({
        id,
        title: allTopics[id].course?.name || id
      }));
      setFilteredTopics(allTopicsList);
    } else {
      const filteredTopicsList = Object.keys(allTopics)
        .filter(id => allTopics[id].course?.id === selectedCourse.id)
        .map(id => ({
          id,
          title: allTopics[id].course?.name || id
        }));
      setFilteredTopics(filteredTopicsList);
    }
  };

  const loadAssignments = async (topic: string) => {
    setLoadingAssignments(true);
    try {
      const assignmentsData = await fetchAssignments(topic);
      setAssignments(assignmentsData);
      toast.success('Assignments loaded successfully');
    } catch (error) {
      console.error('Error loading assignments:', error);
      toast.error('Error loading assignments');
    } finally {
      setLoadingAssignments(false);
    }
  };

  const loadStudents = async (topic: string, assignmentTitle: string) => {
    setLoadingSubmissions(true);
    try {
      // Fetch both student submissions and categories in parallel
      const [studentData, categoryData] = await Promise.all([
        fetchStudentSubmissions(topic, assignmentTitle),
        fetchStudentCategories(topic)
      ]);
      
    setStudents(studentData);
      setStudentCategories(categoryData);
      
      const studentCount = Object.keys(studentData).length;
      toast.success(`Loaded ${studentCount} student submissions`);
    } catch (error) {
      console.error('Error loading student submissions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load student submissions';
      toast.error(`Error loading submissions: ${errorMessage}`);
      setStudents({});
      setStudentCategories({});
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleSupervisionApprovalChange = async (studentName: string, approvalValue: string) => {
    if (!selectedAssignment || !selectedTopic) return;

    try {
      const value = approvalValue === '' ? null : approvalValue;
      await updateSupervisionApproval(selectedTopic, selectedAssignment.title, studentName, value);
      await loadStudents(selectedTopic, selectedAssignment.title);
      
      if (value) {
        toast.success(`Supervision approval updated successfully for ${studentName}`);
      } else {
        toast.success(`Supervision approval removed successfully for ${studentName}`);
      }
    } catch (error) {
      console.error('Error updating supervision approval:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update supervision approval';
      toast.error(`Error updating supervision approval: ${errorMessage}`);
    }
  };

  const handleAssignmentClick = (assignmentId: string, assignmentTitle: string) => {
    setSelectedAssignment({ id: assignmentId, title: assignmentTitle });
    loadStudents(selectedTopic, assignmentTitle);
  };

  const formatDeadline = (deadline: string) => {
    const date = new Date(deadline);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCreationDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStudentCategory = (studentName: string): string => {
    const categoryData = studentCategories[studentName];
    if (!categoryData || !categoryData.category) {
      return 'NOT_ASSIGNED';
    }
    return categoryData.category;
  };

  // Assignment statistics helper functions
  const getAssignmentStats = () => {
    const stats = {
      totalAssignments: assignments.length,
      submittedNotGraded: 0,
      notSubmitted: 0,
      graded: 0
    };

    assignments.forEach(() => {
      const assignmentStudents = students; // Current students for selected assignment
      const studentCount = Object.keys(assignmentStudents).length;
      
      if (studentCount === 0) {
        stats.notSubmitted++;
        return;
      }

      let submittedCount = 0;
      let gradedCount = 0;

      Object.values(assignmentStudents).forEach((studentData: any) => {
        if (studentData.submission) {
          submittedCount++;
          if (studentData.graded) {
            gradedCount++;
          }
        }
      });

      if (submittedCount === 0) {
        stats.notSubmitted++;
      } else if (gradedCount === submittedCount && submittedCount > 0) {
        stats.graded++;
      } else {
        stats.submittedNotGraded++;
      }
    });

    return stats;
  };

  // Get all ungraded assignments across all topics
  const getAllUngradedAssignments = async () => {
    const ungradedAssignments: Array<{
      topicId: string;
      topicName: string;
      assignment: { id: string; data: Assignment };
      needsGrading: boolean;
      totalStudents: number;
      submittedStudents: number;
      gradedStudents: number;
    }> = [];

    for (const [topicId, topicAssignments] of Object.entries(allAssignments)) {
      const topicName = allTopics[topicId]?.course?.name || topicId;
      
      for (const assignment of topicAssignments) {
        try {
          // Get students for this assignment
          const studentData = await fetchStudentSubmissions(topicId, assignment.data.title);
          const studentCount = Object.keys(studentData).length;
          
          if (studentCount === 0) {
            ungradedAssignments.push({
              topicId,
              topicName,
              assignment,
              needsGrading: true,
              totalStudents: 0,
              submittedStudents: 0,
              gradedStudents: 0
            });
            continue;
          }

          let submittedCount = 0;
          let gradedCount = 0;

          Object.values(studentData).forEach((student: any) => {
            if (student.submission) {
              submittedCount++;
    if (student.graded) {
                gradedCount++;
              }
            }
          });

          // Add to ungraded if there are submissions but not all are graded
          if (submittedCount > 0 && gradedCount < submittedCount) {
            ungradedAssignments.push({
              topicId,
              topicName,
              assignment,
              needsGrading: true,
              totalStudents: studentCount,
              submittedStudents: submittedCount,
              gradedStudents: gradedCount
            });
          }
        } catch (error) {
          console.error(`Error checking assignment ${assignment.data.title} in topic ${topicId}:`, error);
        }
      }
    }

    return ungradedAssignments;
  };

  const getAssignmentsByStatus = (status: 'submitted-not-graded' | 'not-submitted') => {
    return assignments.filter(() => {
      const assignmentStudents = students;
      const studentCount = Object.keys(assignmentStudents).length;
      
      if (studentCount === 0) {
        return status === 'not-submitted';
      }

      let submittedCount = 0;
      let gradedCount = 0;

      Object.values(assignmentStudents).forEach((studentData: any) => {
        if (studentData.submission) {
          submittedCount++;
          if (studentData.graded) {
            gradedCount++;
          }
        }
      });

      if (status === 'submitted-not-graded') {
        return submittedCount > 0 && gradedCount < submittedCount;
      } else if (status === 'not-submitted') {
        return submittedCount === 0;
      }

      return false;
    });
  };

  const groupStudentsByCategory = () => {
    const grouped: {[category: string]: {[name: string]: any}} = {};
    
    Object.entries(students).forEach(([name, data]) => {
      // Apply filters based on submission status
      let matchesFilter = false;
      
      if (studentFilterType === 'all') {
        matchesFilter = true;
      } else if (studentFilterType === 'graded') {
        matchesFilter = data.graded === true;
      } else if (studentFilterType === 'submitted') {
        matchesFilter = data.submission === true && data.graded !== true;
      } else if (studentFilterType === 'pending') {
        matchesFilter = data.submission !== true; // Only show if submission is false/undefined
      }
      
      const matchesSearch = studentSearchName === '' || 
        name.toLowerCase().includes(studentSearchName.toLowerCase());
      
      if (matchesFilter && matchesSearch) {
        const category = getStudentCategory(name);
        if (!grouped[category]) {
          grouped[category] = {};
        }
        grouped[category][name] = data;
      }
    });
    
    return grouped;
  };

  const isOverdue = (deadline: string) => new Date(deadline) < new Date();

  const isInProgress = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDeadline > 0 && daysUntilDeadline <= 7; // Within 7 days
  };

  // Filter assignments based on type and search
  const filteredAssignments = assignments.filter(assignment => {
    const matchesFilter = filterType === 'all' || 
      (filterType === 'overdue' && isOverdue(assignment.data.deadline)) ||
      (filterType === 'in-progress' && isInProgress(assignment.data.deadline));
    
    const matchesSearch = searchName === '' || 
      assignment.data.title.toLowerCase().includes(searchName.toLowerCase()) ||
      assignment.data.teacherName.toLowerCase().includes(searchName.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const studentCount = Object.keys(students).length;
  const submittedCount = Object.values(students).filter((s: any) => s.submission).length;
  const gradedCount = Object.values(students).filter((s: any) => s.graded).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Toaster />
      
      {/* Header */}
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={OLevelsLogo} alt="OLevels Logo" className="h-12 w-auto" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent tracking-tight">Weekly Test Dashboard</h1>
            </div>
            <div className="text-right bg-gradient-to-r from-gray-50 to-white p-4 rounded-xl border border-gray-200/50 shadow-lg">
              <p className="text-sm text-gray-600 font-medium">Admin Portal</p>
              <p className="text-sm font-semibold text-gray-800">Weekly Test Management</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {activeTab === 'weekly-test' && (
            <div className="space-y-8">
              
              {/* Assignment Summary Section */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 hover:shadow-2xl transition-all duration-300">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                  <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  Assignment Summary - All Topics
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Total Assignments */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-blue-800">Total Assignments</h3>
                      <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">
                        {Object.values(allAssignments).flat().length}
                      </div>
                    </div>
                    <p className="text-sm text-blue-700 mb-4">All assignments across all topics</p>
                    <div className="text-xs text-blue-600">
                      <p>📚 Topics: {Object.keys(allAssignments).length}</p>
                      <p>📝 Assignments per topic: {Object.keys(allAssignments).length > 0 ? Math.round(Object.values(allAssignments).flat().length / Object.keys(allAssignments).length) : 0}</p>
                    </div>
                  </div>

                  {/* Ungraded Assignments */}
                  <div className="bg-gradient-to-br from-orange-50 to-yellow-50 border border-orange-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-orange-800">Needs Grading</h3>
                      <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-bold">
                        {ungradedAssignments.length}
                      </div>
                    </div>
                    <p className="text-sm text-orange-700 mb-4">Assignments with submissions pending grading</p>
                    <div className="text-xs text-orange-600">
                      <p>⏰ Pending: {ungradedAssignments.length}</p>
                      <p>📊 {Object.values(allAssignments).flat().length > 0 ? Math.round((ungradedAssignments.length / Object.values(allAssignments).flat().length) * 100) : 0}% of total</p>
                    </div>
                  </div>

                  {/* Completed Assignments */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-green-800">Completed</h3>
                      <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-bold">
                        {Object.values(allAssignments).flat().length - ungradedAssignments.length}
                      </div>
                    </div>
                    <p className="text-sm text-green-700 mb-4">All submissions graded</p>
                    <div className="text-xs text-green-600">
                      <p>✅ Completed: {Object.values(allAssignments).flat().length - ungradedAssignments.length}</p>
                      <p>📊 {Object.values(allAssignments).flat().length > 0 ? Math.round(((Object.values(allAssignments).flat().length - ungradedAssignments.length) / Object.values(allAssignments).flat().length) * 100) : 0}% of total</p>
                    </div>
                  </div>

                </div>
              </div>

              {/* All Ungraded Assignments Section */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 hover:shadow-2xl transition-all duration-300">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                All Ungraded Assignments ({ungradedAssignments.length})
                {loadingUngradedAssignments && (
                  <div className="w-5 h-5 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                )}
              </h2>
              
              {loadingUngradedAssignments ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-3 text-gray-600">Loading ungraded assignments...</span>
                </div>
              ) : ungradedAssignments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {ungradedAssignments.map((item) => (
            <button
                      key={`${item.topicId}-${item.assignment.id}`}
                      onClick={() => {
                        setSelectedCourse({id: 'all', title: 'All'});
                        setSelectedTopic(item.topicId);
                        setSelectedAssignment({ id: item.assignment.id, title: item.assignment.data.title });
                      }}
                      className="text-left p-6 rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-yellow-50 hover:from-orange-100 hover:to-yellow-100 hover:shadow-lg transition-all duration-200 group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold text-lg text-gray-800 group-hover:text-orange-800 transition-colors">
                          {item.assignment.data.title}
                        </h3>
                        <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-medium">
                          Needs Grading
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <span className="text-orange-600">📚</span>
                          <span className="font-medium">Topic: {item.topicId}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-orange-600">👥</span>
                          <span>Students: {item.submittedStudents}/{item.totalStudents} submitted</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-orange-600">✅</span>
                          <span>Graded: {item.gradedStudents}/{item.submittedStudents}</span>
              </div>
                        <div className="flex items-center gap-2">
                          <span className="text-orange-600">📅</span>
                          <span>Deadline: {formatDeadline(item.assignment.data.deadline)}</span>
        </div>
      </div>

                      <div className="mt-4 bg-orange-200 rounded-lg p-2">
                        <div className="flex justify-between text-xs font-medium text-orange-800">
                          <span>Progress</span>
                          <span>{Math.round((item.gradedStudents / item.submittedStudents) * 100)}%</span>
                        </div>
                        <div className="mt-1 bg-orange-300 rounded-full h-2">
                          <div 
                            className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(item.gradedStudents / item.submittedStudents) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="bg-green-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">All Caught Up!</h3>
                  <p className="text-gray-500">No assignments need grading at the moment.</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-h-[1200px]">
            <div className="lg:col-span-1 space-y-6">
            {/* Course Selector */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 hover:shadow-2xl transition-all duration-300">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                Select Course
              </h2>
              
              {loadingCourses ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <select
                  value={selectedCourse?.id || ''}
                  onChange={(e) => {
                    const courseId = e.target.value === 'all' ? 'all' : Number(e.target.value);
                    const courseTitle = e.target.value === 'all' ? 'All' : courses.find(c => c.id === courseId)?.title || '';
                    setSelectedCourse({id: courseId, title: courseTitle});
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                >
                  <option value="">Select a course...</option>
                  {courses.map(course => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Topic Selector */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 hover:shadow-2xl transition-all duration-300">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                Select Topic
              </h2>
              
              {loadingTopics ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                  disabled={!selectedCourse}
                >
                  <option value="">Select a topic...</option>
                  {filteredTopics.map(topic => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                      </option>
                  ))}
                </select>
              )}
            </div>

            {/* Weekly Tests */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 hover:shadow-2xl transition-all duration-300">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                  <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                Weekly Tests ({filteredAssignments.length})
                {loadingAssignments && (
                  <div className="w-5 h-5 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                )}
                </h2>

              <div className="space-y-5">
                <div className="flex gap-3">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as 'all' | 'overdue' | 'in-progress')}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                  >
                    <option value="all">All Tests</option>
                    <option value="overdue">Overdue</option>
                    <option value="in-progress">In Progress</option>
                  </select>
                  
                  <input
                    type="text"
                    placeholder="Search by name or teacher..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm"
                  />
                </div>
              </div>

              <div className="space-y-4 py-3 max-h-[50vh] overflow-y-auto pr-2 flex flex-col items-center">
                {filteredAssignments.map((assignment) => (
                    <button
                      key={assignment.id}
                      onClick={() => setSelectedAssignment({ id: assignment.id, title: assignment.data.title })}
                    className={`w-full max-w-sm p-6 rounded-xl text-left transition-all duration-200 border backdrop-blur-sm mt-4 ${
                        selectedAssignment?.id === assignment.id
                        ? 'border-[#b30104] border-2 bg-gradient-to-r from-[#b30104]/10 to-[#b30104]/5 shadow-xl transform scale-[1.01] ring-2 ring-[#b30104]/20'
                          : 'border-gray-200 bg-gradient-to-r from-gray-50/80 to-white/80 hover:bg-white hover:border-[#b30104]/30 hover:shadow-lg'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                      <h3 className={`font-bold text-xl ${
                        selectedAssignment?.id === assignment.id 
                          ? 'text-[#b30104]' 
                          : 'text-gray-800'
                      }`}>{assignment.data.title}</h3>
                      <div className="flex gap-2">
                        {isOverdue(assignment.data.deadline) ? (
                          <span className="bg-gradient-to-r from-[#b30104] to-[#7a0103] text-white text-xs px-3 py-1 rounded-full font-medium shadow-lg">Overdue</span>
                        ) : isInProgress(assignment.data.deadline) ? (
                          <span className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs px-3 py-1 rounded-full font-medium shadow-lg">In Progress</span>
                        ) : null}
                      </div>
                    </div>
                    
                    {/* Creation Date */}
                    <div className="mb-2">
                      <div className={`flex items-center gap-2 p-2 rounded-lg transition-all duration-200 ${
                        selectedAssignment?.id === assignment.id 
                          ? 'bg-[#b30104]/5 border border-[#b30104]/20' 
                          : 'bg-gray-50/50'
                      }`}>
                        <span className="text-[#b30104] text-sm">📅</span>
                        <span className="text-sm text-gray-600">Created: {assignment.data.creationDate ? formatCreationDate(assignment.data.creationDate) : 'N/A'}</span>
                      </div>
                      </div>
                    
                      <div className="text-base text-gray-600 space-y-1">
                      <div className={`flex items-center gap-2 p-2 rounded-lg transition-all duration-200 ${
                        selectedAssignment?.id === assignment.id 
                          ? 'bg-[#b30104]/5 border border-[#b30104]/20' 
                          : 'bg-gray-50/50'
                      }`}>
                        <span className="text-[#b30104] text-sm">📅</span>
                        <span className="text-sm font-medium">Deadline: {formatDeadline(assignment.data.deadline)}</span>
                        </div>
                      <div className={`flex items-center gap-2 p-2 rounded-lg transition-all duration-200 ${
                        selectedAssignment?.id === assignment.id 
                          ? 'bg-[#b30104]/5 border border-[#b30104]/20' 
                          : 'bg-gray-50/50'
                      }`}>
                        <span className="text-[#b30104] text-sm">📝</span>
                        <span className="text-sm font-medium">{assignment.data.totalMarks} marks • {assignment.data.weightage} weightage</span>
                        </div>
                      <div className={`flex items-center gap-2 p-2 rounded-lg transition-all duration-200 ${
                        selectedAssignment?.id === assignment.id 
                          ? 'bg-[#b30104]/5 border border-[#b30104]/20' 
                          : 'bg-gray-50/50'
                      }`}>
                        <span className="text-[#b30104] text-sm">👤</span>
                        <span className="text-sm font-medium">{assignment.data.teacherName}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
          </div>

            {/* Right Panel - Student Submissions */}
            <div className="lg:col-span-2 space-y-6 max-h-[1200px] overflow-y-auto">
            {!selectedAssignment ? (
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 text-center">
                  <div className="flex flex-col items-center justify-center py-12">
                    <Users className="w-16 h-16 text-gray-400 mb-4" />
                    <h3 className="text-xl font-semibold text-gray-600 mb-2">Select an Assignment</h3>
                    <p className="text-gray-500">Choose a weekly test to view student submissions</p>
                </div>
              </div>
            ) : (
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 hover:shadow-2xl transition-all duration-300">
                  <div className="bg-gradient-to-r from-gray-100 to-gray-200 p-8">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-3">
                      <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    Student Submissions
                      {loadingSubmissions && (
                        <div className="w-5 h-5 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                      )}
                  </h2>
                    <div className="flex gap-6 text-base text-gray-600">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                      <span className="font-medium">{studentCount} Total</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <span className="font-medium">{submittedCount} Submitted</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="font-medium">{gradedCount} Graded</span>
                    </div>
                  </div>
                    
                    {/* Filter Controls */}
                    <div className="mt-6 space-y-4">
                      <div className="flex gap-3">
                        <select
                          value={studentFilterType}
                          onChange={(e) => setStudentFilterType(e.target.value as 'all' | 'graded' | 'submitted' | 'pending')}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                        >
                          <option value="all">All Students</option>
                          <option value="graded">Graded</option>
                          <option value="submitted">Submitted</option>
                          <option value="pending">Pending</option>
                        </select>
                        
                        <input
                          type="text"
                          placeholder="Search by student name..."
                          value={studentSearchName}
                          onChange={(e) => setStudentSearchName(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm"
                        />
                    </div>
                  </div>
                </div>

                  <div className="flex-1 overflow-auto">
                  <table className="w-full">
                      {/* Single Table Header */}
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100/80 border-b border-gray-200 backdrop-blur-sm">
                      <tr>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Student</th>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Submission Status</th>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Submission Time</th>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Marks</th>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Feedback</th>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Files</th>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Message</th>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Supervision Approval</th>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Supervision Link</th>
                          <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider">Grade</th>
                      </tr>
                    </thead>
                      
                    <tbody className="bg-white/50 backdrop-blur-sm divide-y divide-gray-100">
                        {Object.entries(groupStudentsByCategory()).map(([category, categoryStudents]) => (
                          <>
                            {/* Category Header Row */}
                            <tr key={`category-${category}`} className="bg-gradient-to-r from-gray-100/80 to-gray-200/80">
                              <td colSpan={10} className="px-6 py-4">
                                <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-gray-100 to-gray-200 border border-gray-300 rounded-lg shadow-sm">
                                  <span className="text-lg font-bold text-red-600">{category}</span>
                                </div>
                              </td>
                            </tr>
                            
                            {/* Students in this Category */}
                            {Object.entries(categoryStudents).map(([name, data]) => (
                        <tr key={name} className="hover:bg-gradient-to-r hover:from-gray-50/50 hover:to-white/50 transition-all duration-150">
                                {/* Student Name */}
                                <td className="px-6 py-5 text-sm font-semibold text-center">
                                  <button
                                    onClick={() => window.open(`https://live.olevels.com/admin/studentDashboard?search=${encodeURIComponent(name)}`, '_blank')}
                                    className="text-red-600 hover:text-red-800 hover:underline transition-colors cursor-pointer font-semibold"
                                  >
                                    {name}
                                  </button>
                                </td>
                                
                                {/* Submission Status */}
                                <td className="px-6 py-5 text-sm font-medium text-center">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                                    data.graded
                                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                      : data.submission 
                                        ? 'bg-green-100 text-green-800 border border-green-200' 
                                        : 'bg-red-100 text-red-800 border border-red-200'
                                  }`}>
                                    {data.graded ? 'Graded' : data.submission ? 'Submitted' : 'Pending'}
                                  </span>
                                </td>
                                
                                {/* Submission Time */}
                                <td className="px-6 py-5 text-sm text-gray-600 font-medium text-center">
                                  {data.submissionTime || '-'}
                                </td>
                                
                                {/* Marks */}
                                <td className="px-6 py-5 text-sm text-gray-600 font-medium text-center">
                                  {data.marks || '-'}
                                </td>
                                
                                {/* Feedback */}
                                <td className="px-6 py-5 text-sm text-gray-600 text-center">
                                  {data.feedback || '-'}
                                </td>
                                
                                {/* Files */}
                                <td className="px-6 py-5 text-sm text-gray-600 text-center">
                                  {data.submission && data.attachments && data.attachments.length > 0 ? (
                                    <div className="bg-gray-100 px-3 py-2 rounded-lg border">
                                      <a 
                                        href={data.attachments[0].url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-red-600 hover:text-red-800 hover:underline transition-colors cursor-pointer"
                                      >
                                        {data.attachments[0].name}
                                      </a>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">No files</span>
                                  )}
                                </td>
                                
                                {/* Message */}
                                <td className="px-6 py-5 text-sm text-gray-600 text-center">
                                  {data.message || '-'}
                          </td>
                                
                                {/* Supervision Approval */}
                                <td className="px-6 py-5 text-center">
                                  <select
                                    value={data.supervisionApproval || ''}
                                    onChange={(e) => handleSupervisionApprovalChange(name, e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none transition bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md focus:shadow-lg text-sm"
                                    style={{minWidth: '120px', fontSize: '12px'}}
                                  >
                                    <option value="">Select Status</option>
                                    <option value="approved">Approved</option>
                                    <option value="failed">Failed</option>
                                    <option value="ai_suspected">AI Suspected</option>
                                  </select>
                          </td>
                                
                                {/* Supervision Link */}
                                <td className="px-6 py-5 text-center">
                                  {data.supervisionVideoUrl ? (
                            <button
                                      onClick={() => window.open(data.supervisionVideoUrl, '_blank')}
                                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 transition-colors cursor-pointer"
                                    >
                                      <span className="text-sm font-medium">View Video</span>
                                    </button>
                                  ) : (
                                    <span className="text-gray-400 text-sm">No video</span>
                                  )}
                                </td>
                                
                                {/* Grade Button */}
                                <td className="px-6 py-5 text-center">
                                  <button
                                    onClick={() => navigate('/dashboard/grading', {
                                      state: {
                                        studentName: name,
                                        studentData: data,
                                        assignmentTitle: selectedAssignment?.title,
                                        topic: selectedTopic
                                      }
                                    })}
                                    disabled={!data.submission}
                                    className="inline-flex items-center gap-2 bg-gradient-to-r from-[#b30104] to-[#7a0103] hover:from-[#7a0103] hover:to-[#b30104] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 hover:scale-105 shadow-lg hover:shadow-xl"
                                  >
                                    Start Grading
                            </button>
                          </td>
                        </tr>
                            ))}
                          </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
        )}
      </main>
    </div>
  );
};
