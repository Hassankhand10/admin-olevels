import { useState, useEffect } from 'react';
import { BookOpen, FileText, Users, CheckCircle } from 'lucide-react';
import OLevelsLogo from '../assets/OLevels-logo-color.png';
import { fetchAssignments, fetchStudentSubmissions, fetchTopics, updateSupervisionApproval, fetchStudentCategories } from '../services/firebaseService';
import { Assignment, StudentData } from '../types';
import toast, { Toaster } from 'react-hot-toast';
import { GRADING_BASE_URL , API_BASE_URL} from '../config/constants';

export const Dashboard = () => {
  const [activeTab] = useState<'weekly-test'>('weekly-test');
  const [courses, setCourses] = useState<{id: number, title: string}[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<{id: number | 'all', title: string} | null>(null);
  const [allTopics, setAllTopics] = useState<{[key: string]: {course: any, name?: string}}>({});
  const [filteredTopics, setFilteredTopics] = useState<{id: string, title: string}[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [assignments, setAssignments] = useState<{ id: string; data: Assignment }[]>([]);
  const [, setAllAssignments] = useState<{[topicId: string]: { id: string; data: Assignment }[]}>({});
  const [assignmentsByCourse, setAssignmentsByCourse] = useState<{[courseId: string]: Array<{
    topicId: string;
    topicName: string;
    assignment: { id: string; data: Assignment };
    needsGrading: boolean;
    totalStudents: number;
    submittedStudents: number;
    gradedStudents: number;
  }>}>({});
  const [ungradedAssignments, setUngradedAssignments] = useState<Array<{
    topicId: string;
    topicName: string;
    assignment: { id: string; data: Assignment };
    needsGrading: boolean;
    totalStudents: number;
    submittedStudents: number;
    gradedStudents: number;
  }>>([]);
  
  // Unmarked Papers state
  const [unmarkedPapers, setUnmarkedPapers] = useState<{
    total: number;
    deadlinePassed: number;
    deadlineNotPassed: number;
    papers: Array<{
      topicId: string;
      topicName: string;
      assignmentTitle: string;
      studentName: string;
      submissionTime: string;
      deadlinePassed: boolean;
      gradingDeadline: string;
    }>;
  }>({
    total: 0,
    deadlinePassed: 0,
    deadlineNotPassed: 0,
    papers: []
  });
  const [selectedAssignment, setSelectedAssignment] = useState<{ id: string; title: string } | null>(null);
  const [students, setStudents] = useState<StudentData>({});
  const [studentCategories, setStudentCategories] = useState<{[studentName: string]: {category: string}}>({});
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingUngradedAssignments, setLoadingUngradedAssignments] = useState(false);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'overdue' | 'in-progress'>('all');
  const [searchName, setSearchName] = useState('');
  
  // Student submissions filtering
  const [studentFilterType, setStudentFilterType] = useState<'all' | 'graded' | 'submitted' | 'pending'>('all');
  const [studentSearchName, setStudentSearchName] = useState('');
  
  // Course filter for pending tests
  const [pendingCourseFilter, setPendingCourseFilter] = useState<string>('all');
  
  // Show urgent assignments (overdue or in progress grading deadlines)
  const [showUrgentOnly, setShowUrgentOnly] = useState<boolean>(false);
  
  // Filter by deadline status
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'overdue' | 'progress'>('all');
  
  // Teacher grading report state
  const [teacherGradingReport, setTeacherGradingReport] = useState<{
    [teacherName: string]: {
      totalGraded: number;
      assignments: Array<{
        assignmentTitle: string;
        topicName: string;
        gradedCount: number;
        lastGraded: string;
        topicId: string;
        assignmentId: string;
      }>;
    };
  }>({});
  const [loadingTeacherReport, setLoadingTeacherReport] = useState(false);
  
  // Selected assignment details state
  const [selectedAssignmentDetails, setSelectedAssignmentDetails] = useState<{
    teacherName: string;
    assignmentTitle: string;
    topicName: string;
    students: Array<{
      studentName: string;
      marks: number;
      feedback: string;
      gradedAt: string;
    }>;
  } | null>(null);
  
  // Teacher search state
  const [teacherSearchTerm, setTeacherSearchTerm] = useState('');
  
  // Date filter state for teacher grading report
  const [teacherReportDateFilter, setTeacherReportDateFilter] = useState<{
    startDate: string;
    endDate: string;
  }>({
    startDate: '',
    endDate: ''
  });
  
  
  

  useEffect(() => {
    loadCourses();
    loadAllTopics();
    loadAllAssignmentsFromAllTopics();
  }, []);

  useEffect(() => {
    // Load teacher grading report when component mounts
    loadTeacherGradingReport();
  }, []);

  // Auto-refresh teacher grading report when date filters change
  useEffect(() => {
    if (teacherReportDateFilter.startDate || teacherReportDateFilter.endDate) {
      // Only refresh if we have data already loaded
      if (Object.keys(teacherGradingReport).length > 0) {
        // The filtering is handled by getFilteredTeachers(), no need to reload data
        // This effect just ensures the UI updates when date filters change
      }
    }
  }, [teacherReportDateFilter]);

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
      const response = await fetch(`${API_BASE_URL}/api/admin/getAllCourses`);
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

      // Process assignments in batches to reduce API calls - only WeeklyTest assignments
      const allAssignments = Object.entries(assignmentsData).flatMap(([topicId, topicAssignments]) =>
        topicAssignments
          .filter(assignment => assignment.data.selectedAssignmentCategory === 'WeeklyTest')
          .map(assignment => ({ topicId, assignment }))
      );

      // Process in batches of 5 to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < allAssignments.length; i += batchSize) {
        const batch = allAssignments.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async ({ topicId, assignment }) => {
          try {
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

            // Only include if there are submissions but not all are graded
            if (submittedCount > 0 && gradedCount < submittedCount) {
              return {
                topicId,
                topicName: topicsData[topicId]?.course?.name || topicId,
                assignment,
                needsGrading: true,
                totalStudents: studentCount,
                submittedStudents: submittedCount,
                gradedStudents: gradedCount
              };
            }
            return null;
          } catch (error) {
            console.error(`Error checking assignment ${assignment.data.title} in topic ${topicId}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        ungradedList.push(...batchResults.filter(item => item !== null));
      }

      setUngradedAssignments(ungradedList);
      
      // Group assignments by course efficiently
      const courseGrouped: {[courseId: string]: typeof ungradedList} = {};
      ungradedList.forEach(item => {
        const courseId = topicsData[item.topicId]?.course?.id || 'unknown';
        if (!courseGrouped[courseId]) {
          courseGrouped[courseId] = [];
        }
        courseGrouped[courseId].push(item);
      });
      setAssignmentsByCourse(courseGrouped);
      
    } catch (error) {
      console.error('Error loading ungraded assignments:', error);
      toast.error('Error loading ungraded assignments');
    } finally {
      setLoadingUngradedAssignments(false);
    }
  };

  const loadUnmarkedPapers = async (assignmentsData: {[topicId: string]: { id: string; data: Assignment }[]}, topicsData: {[key: string]: {course: any}}) => {
    try {
      const unmarkedPapersList: Array<{
        topicId: string;
        topicName: string;
        assignmentTitle: string;
        studentName: string;
        submissionTime: string;
        deadlinePassed: boolean;
        gradingDeadline: string;
      }> = [];

      // Process assignments in batches to reduce API calls - only WeeklyTest assignments
      const allAssignments = Object.entries(assignmentsData).flatMap(([topicId, topicAssignments]) =>
        topicAssignments
          .filter(assignment => assignment.data.selectedAssignmentCategory === 'WeeklyTest')
          .map(assignment => ({ topicId, assignment }))
      );

      // Process in batches of 5 to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < allAssignments.length; i += batchSize) {
        const batch = allAssignments.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async ({ topicId, assignment }) => {
          try {
            
            const studentData = await fetchStudentSubmissions(topicId, assignment.data.title);
            const topicName = topicsData[topicId]?.course?.name || topicId;
            
            // Use grading deadline from database
            const gradingDeadline = new Date(assignment.data.gradingDeadline);
            const currentDate = new Date();
            const isGradingDeadlinePassed = currentDate > gradingDeadline;
            

            Object.entries(studentData).forEach(([studentName, student]) => {
              // Only include students who have submitted but not been graded
              if (student.submission && !student.graded) {
                unmarkedPapersList.push({
                  topicId,
                  topicName,
                  assignmentTitle: assignment.data.title,
                  studentName,
                  submissionTime: student.submissionTime || '',
                  deadlinePassed: isGradingDeadlinePassed,
                  gradingDeadline: gradingDeadline.toISOString().split('T')[0]
                });
              }
            });

            return null; // This function doesn't return assignment data, just processes papers
          } catch (error) {
            console.error(`Error checking unmarked papers for assignment ${assignment.data.title} in topic ${topicId}:`, error);
            return null;
          }
        });

        await Promise.all(batchPromises);
      }

      // Calculate totals
      const total = unmarkedPapersList.length;
      const deadlinePassed = unmarkedPapersList.filter(paper => paper.deadlinePassed).length;
      const deadlineNotPassed = total - deadlinePassed;

      setUnmarkedPapers({
        total,
        deadlinePassed,
        deadlineNotPassed,
        papers: unmarkedPapersList
      });
      
    } catch (error) {
      console.error('Error loading unmarked papers:', error);
      toast.error('Error loading unmarked papers');
    }
  };

  const loadAllAssignmentsFromAllTopics = async () => {
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
      
      // Load unmarked papers after all assignments are loaded
      loadUnmarkedPapers(allAssignmentsData, topicsData);
      
      toast.success('All assignments loaded successfully');
    } catch (error) {
      console.error('Error loading all assignments:', error);
      toast.error('Error loading all assignments');
    }
  };


  const filterTopicsByCourse = () => {
    if (!selectedCourse || selectedCourse.id === 'all') {
      // Show all topics when "All" is selected or no course is selected
      const allTopicsList = Object.keys(allTopics).map(id => ({
        id,
        title: allTopics[id].name || id // Use topic name if available, otherwise use ID
      }));
      setFilteredTopics(allTopicsList);
    } else {
      // Show only topics that belong to the selected course
      const filteredTopicsList = Object.keys(allTopics)
        .filter(id => allTopics[id].course?.id === selectedCourse.id)
        .map(id => ({
          id,
          title: allTopics[id].name || id // Use topic name if available, otherwise use ID
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
        matchesFilter = data.submission !== true && data.graded !== true;
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

  // Check if grading deadline is overdue or in progress
  const isGradingDeadlineOverdue = (gradingDeadline: string) => {
    const deadline = new Date(gradingDeadline);
    const now = new Date();
    const isOverdue = now > deadline;
    return isOverdue;
  };


  // Filter assignments by course for pending tests section
  const getFilteredAssignmentsByCourse = () => {
    if (pendingCourseFilter === 'all') {
      return assignmentsByCourse;
    }
    
    const filtered: {[courseId: string]: Array<any>} = {};
    Object.entries(assignmentsByCourse).forEach(([courseId, assignments]) => {
      if (courseId === pendingCourseFilter) {
        filtered[courseId] = assignments;
      }
    });
    return filtered;
  };

  // Get assignments with grading deadline overdue or in progress
  const getUrgentAssignments = () => {
    const urgent: {[courseId: string]: Array<any>} = {};
    
    Object.entries(assignmentsByCourse).forEach(([courseId, assignments]) => {
      const urgentAssignments = assignments.filter(item => {
        const isOverdue = isGradingDeadlineOverdue(item.assignment.data.gradingDeadline);
        return isOverdue; // Only overdue assignments are urgent
      });
      
      if (urgentAssignments.length > 0) {
        urgent[courseId] = urgentAssignments;
      }
    });
    
    return urgent;
  };

  // Filter assignments by deadline status
  const getFilteredAssignmentsByDeadline = (assignments: {[courseId: string]: Array<any>}) => {
    if (deadlineFilter === 'all') {
      return assignments;
    }
    
    const filtered: {[courseId: string]: Array<any>} = {};
    
    Object.entries(assignments).forEach(([courseId, courseAssignments]) => {
      const filteredAssignments = courseAssignments.filter(item => {
        const isOverdue = isGradingDeadlineOverdue(item.assignment.data.gradingDeadline);
        
        switch (deadlineFilter) {
          case 'overdue':
            return isOverdue;
          case 'progress':
            return !isOverdue; // All non-overdue assignments
          default:
            return true;
        }
      });
      
      if (filteredAssignments.length > 0) {
        filtered[courseId] = filteredAssignments;
      }
    });
    
    return filtered;
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

  // Handle start grading redirect
  const handleStartGrading = (topicId: string, assignmentTitle: string) => {
    const topicName = allTopics[topicId]?.name || topicId;
    const gradingUrl = `${GRADING_BASE_URL}/assignment/${topicName}/teacher/${assignmentTitle}/grading/all`;
    window.open(gradingUrl, '_blank');
  };

  const studentCount = Object.keys(students).length;
  const submittedCount = Object.values(students).filter((s: any) => s.submission).length;
  const gradedCount = Object.values(students).filter((s: any) => s.graded).length;

  const getMarkedPapersData = () => {
    const allAssignments = Object.values(assignmentsByCourse).flat();
    let totalMarked = 0;
    let markedOverdue = 0;
    let markedOnTime = 0;

    allAssignments.forEach(item => {
      const isOverdue = isGradingDeadlineOverdue(item.assignment.data.gradingDeadline);
      const markedCount = item.gradedStudents;
      
      totalMarked += markedCount;
      if (isOverdue) {
        markedOverdue += markedCount;
      } else {
        markedOnTime += markedCount;
      }
    });

    return {
      total: totalMarked,
      overdue: markedOverdue,
      onTime: markedOnTime
    };
  };

  // Load ALL assignments including 100% graded ones for teacher report
  const loadAllAssignmentsForTeacherReport = async () => {
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
      
      // Convert to flat array with all assignments (including 100% graded)
      const allAssignmentsFlat: Array<{
        topicId: string;
        topicName: string;
        assignment: { id: string; data: Assignment };
        totalStudents: number;
        submittedStudents: number;
        gradedStudents: number;
      }> = [];

      const batchSize = 5;
      for (const [topicId, assignments] of Object.entries(allAssignmentsData)) {
        for (let i = 0; i < assignments.length; i += batchSize) {
          const batch = assignments.slice(i, i + batchSize);
          
          const batchPromises = batch.map(async (assignment) => {
            try {
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

              // Include ALL assignments (including 100% graded)
              return {
                topicId,
                topicName: topicsData[topicId]?.course?.name || topicId,
                assignment,
                totalStudents: studentCount,
                submittedStudents: submittedCount,
                gradedStudents: gradedCount
              };
            } catch (error) {
              console.error(`Error checking assignment ${assignment.data.title} in topic ${topicId}:`, error);
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);
          allAssignmentsFlat.push(...batchResults.filter(item => item !== null));
        }
      }

      return allAssignmentsFlat;
    } catch (error) {
      console.error('Error loading all assignments for teacher report:', error);
      return [];
    }
  };

  // Load teacher grading report
  const loadTeacherGradingReport = async () => {
    setLoadingTeacherReport(true);
    try {
      const report: {[teacherName: string]: any} = {};
      const allAssignments = await loadAllAssignmentsForTeacherReport();
      
      // Filter only WeeklyTest assignments
      const weeklyTestAssignments = allAssignments.filter(item => 
        item.assignment.data.selectedAssignmentCategory === 'WeeklyTest'
      );
      
      
      // Process assignments in batches
      const batchSize = 5;
      for (let i = 0; i < weeklyTestAssignments.length; i += batchSize) {
        const batch = weeklyTestAssignments.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (item) => {
          try {
            const studentData = await fetchStudentSubmissions(item.topicId, item.assignment.data.title);
            const topicName = allTopics[item.topicId]?.name || item.topicId;
            
            const gradedStudents = Object.entries(studentData).filter(([, student]) => student.graded);
            
              if (gradedStudents.length > 0) {
                
                Object.entries(studentData).forEach(([, student]) => {
              if (student.graded) {
                if (student.gradedByTeacher) {
                  const teacherName = student.gradedByTeacher;
                  const gradedAt = student.gradedAt || new Date().toISOString();
                
                if (!report[teacherName]) {
                  report[teacherName] = {
                    totalGraded: 0,
                    assignments: []
                  };
                }
                
                report[teacherName].totalGraded++;
                
                // Track assignments
                let assignmentEntry = report[teacherName].assignments.find(
                  (a: any) => a.assignmentTitle === item.assignment.data.title && a.topicName === topicName
                );
                
                if (!assignmentEntry) {
                  assignmentEntry = {
                    assignmentTitle: item.assignment.data.title,
                    topicName: topicName,
                    gradedCount: 0,
                    lastGraded: gradedAt,
                    topicId: item.topicId,
                    assignmentId: item.assignment.id
                  };
                  report[teacherName].assignments.push(assignmentEntry);
                }
                
                assignmentEntry.gradedCount++;
                if (new Date(gradedAt) > new Date(assignmentEntry.lastGraded)) {
                  assignmentEntry.lastGraded = gradedAt;
                }
                } else {
                }
              }
              });
            } else {
            }
          } catch (error) {
            console.error(`Error processing assignment ${item.assignment.data.title}:`, error);
          }
        });
        
        await Promise.all(batchPromises);
      }
      
      setTeacherGradingReport(report);
    } catch (error) {
      console.error('Error loading teacher grading report:', error);
      toast.error('Error loading teacher grading report');
    } finally {
      setLoadingTeacherReport(false);
    }
  };

  // Load assignment details when clicked
  const loadAssignmentDetails = async (teacherName: string, assignmentTitle: string, topicName: string, topicId: string) => {
    try {
      const studentData = await fetchStudentSubmissions(topicId, assignmentTitle);
      
      // Filter students graded by this teacher
      const gradedStudents = Object.entries(studentData)
        .filter(([, student]) => student.graded && student.gradedByTeacher === teacherName)
        .map(([studentName, student]) => ({
          studentName,
          marks: student.marks || 0,
          feedback: student.feedback || '',
          gradedAt: student.gradedAt || new Date().toISOString()
        }));

      setSelectedAssignmentDetails({
        teacherName,
        assignmentTitle,
        topicName,
        students: gradedStudents
      });
    } catch (error) {
      console.error('Error loading assignment details:', error);
      toast.error('Error loading assignment details');
    }
  };

  // Filter teachers based on search term and date range
  const getFilteredTeachers = () => {
    let filteredTeachers = Object.entries(teacherGradingReport) as Array<[string, {
      totalGraded: number;
      assignments: Array<{
        assignmentTitle: string;
        topicName: string;
        gradedCount: number;
        lastGraded: string;
        topicId: string;
        assignmentId: string;
      }>;
    }]>;
    
    // Filter by search term
    if (teacherSearchTerm.trim()) {
      filteredTeachers = filteredTeachers.filter(([teacherName]) =>
        teacherName.toLowerCase().includes(teacherSearchTerm.toLowerCase())
      );
    }
    
    // Filter by date range
    if (teacherReportDateFilter.startDate || teacherReportDateFilter.endDate) {
      filteredTeachers = filteredTeachers.map(([teacherName, data]) => {
        const filteredAssignments = data.assignments.filter(assignment => {
          const gradedDate = new Date(assignment.lastGraded);
          const startDate = teacherReportDateFilter.startDate ? new Date(teacherReportDateFilter.startDate) : null;
          const endDate = teacherReportDateFilter.endDate ? new Date(teacherReportDateFilter.endDate) : null;
          
          let isInRange = true;
          
          if (startDate) {
            isInRange = isInRange && gradedDate >= startDate;
          }
          
          if (endDate) {
            // Add one day to end date to include the entire end date
            const endDatePlusOne = new Date(endDate);
            endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
            isInRange = isInRange && gradedDate < endDatePlusOne;
          }
          
          return isInRange;
        });
        
        return [teacherName, {
          ...data,
          assignments: filteredAssignments,
          totalGraded: filteredAssignments.reduce((sum, assignment) => sum + assignment.gradedCount, 0)
        }] as [string, {
          totalGraded: number;
          assignments: Array<{
            assignmentTitle: string;
            topicName: string;
            gradedCount: number;
            lastGraded: string;
            topicId: string;
            assignmentId: string;
          }>;
        }];
      }).filter(([, data]) => data.assignments.length > 0);
    }
    
    return filteredTeachers;
  };


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
                  Paper Marking Dashboard - Course Overview
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Unmarked Count */}
                  <div className="bg-gradient-to-br from-orange-50 to-yellow-50 border border-orange-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-orange-800">Unmarked Papers</h3>
                      <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-bold">
                        {unmarkedPapers.total}
                      </div>
                    </div>
                    <p className="text-sm text-orange-700 mb-4">Weekly tests pending marking</p>
                    <div className="text-xs text-orange-600 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <span className="text-red-500">⚠️</span>
                          <span>Overdue</span>
                        </span>
                        <span className="font-bold text-red-600">{unmarkedPapers.deadlinePassed}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <span className="text-yellow-500">⏰</span>
                          <span>On Time</span>
                        </span>
                        <span className="font-bold text-yellow-600">{unmarkedPapers.deadlineNotPassed}</span>
                      </div>
                    </div>
                  </div>

                  {/* Marked Count */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-green-800">Marked Papers</h3>
                      <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-bold">
                        {getMarkedPapersData().total}
                      </div>
                    </div>
                    <p className="text-sm text-green-700 mb-4">Papers already marked</p>
                    <div className="text-xs text-green-600">
                      <p>✅ Completed marking</p>
                      <p>📊 Ready for review</p>
                    </div>
                  </div>

                  {/* Total Papers */}
                  {/* <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-blue-800">Total Papers</h3>
                      <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">
                        {getTotalPapersData().total}
                      </div>
                    </div>
                    <p className="text-sm text-blue-700 mb-4">All submitted papers</p>
                    <div className="text-xs text-blue-600 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <span className="text-red-500">⚠️</span>
                          <span>Overdue</span>
                        </span>
                        <span className="font-bold text-red-600">{getTotalPapersData().overdue}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <span className="text-yellow-500">⏰</span>
                          <span>On Time</span>
                        </span>
                        <span className="font-bold text-yellow-600">{getTotalPapersData().onTime}</span>
                      </div>
                    </div>
                  </div> */}

                </div>
              </div>

              {/* Teacher Grading Report Section */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 hover:shadow-2xl transition-all duration-300 max-h-[1500px] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                    <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    Teacher Grading Report
                    {loadingTeacherReport && (
                      <div className="w-5 h-5 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                    )}
                  </h2>
                  <button
                    onClick={loadTeacherGradingReport}
                    disabled={loadingTeacherReport}
                    className="px-4 py-2 bg-[#b30104] text-white rounded-lg hover:bg-[#7a0103] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {loadingTeacherReport ? 'Loading...' : 'Refresh Report'}
                  </button>
                </div>
                
                {/* Teacher Search Bar and Date Filter */}
                <div className="mb-6 space-y-4">
                  {/* Teacher Search Bar */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search teachers by name..."
                      value={teacherSearchTerm}
                      onChange={(e) => setTeacherSearchTerm(e.target.value)}
                      className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    {teacherSearchTerm && (
                      <button
                        onClick={() => setTeacherSearchTerm('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  
                  {/* Date Filter */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Date
                        {(teacherReportDateFilter.startDate || teacherReportDateFilter.endDate) && (
                          <span className="ml-2 text-xs text-[#b30104] font-semibold">(Filter Active)</span>
                        )}
                      </label>
                      <input
                        type="date"
                        value={teacherReportDateFilter.startDate}
                        onChange={(e) => setTeacherReportDateFilter(prev => ({
                          ...prev,
                          startDate: e.target.value
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Date
                        {(teacherReportDateFilter.startDate || teacherReportDateFilter.endDate) && (
                          <span className="ml-2 text-xs text-[#b30104] font-semibold">(Filter Active)</span>
                        )}
                      </label>
                      <input
                        type="date"
                        value={teacherReportDateFilter.endDate}
                        onChange={(e) => setTeacherReportDateFilter(prev => ({
                          ...prev,
                          endDate: e.target.value
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => setTeacherReportDateFilter({ startDate: '', endDate: '' })}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                      >
                        Clear Dates
                      </button>
                    </div>
                  </div>
                  
                  {/* Date Filter Info */}
                  {(teacherReportDateFilter.startDate || teacherReportDateFilter.endDate) && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm text-blue-800 font-medium">
                          Showing grading data from{' '}
                          {teacherReportDateFilter.startDate 
                            ? new Date(teacherReportDateFilter.startDate).toLocaleDateString() 
                            : 'beginning'
                          } to{' '}
                          {teacherReportDateFilter.endDate 
                            ? new Date(teacherReportDateFilter.endDate).toLocaleDateString() 
                            : 'now'
                          }
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                
                {loadingTeacherReport ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                    <span className="ml-3 text-gray-600">Loading teacher grading report...</span>
                  </div>
                ) : Object.keys(teacherGradingReport).length > 0 ? (
                  getFilteredTeachers().length > 0 ? (
                    <div className="space-y-6">
                      {getFilteredTeachers()
                        .sort(([,a], [,b]) => b.totalGraded - a.totalGraded)
                        .map(([teacherName, data]) => (
                        <div key={teacherName} className="border border-gray-200 rounded-xl p-6 bg-gradient-to-br from-gray-50 to-white">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">
                                {data.totalGraded}
                              </div>
                              <h3 className="text-lg font-bold text-gray-800">{teacherName}</h3>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {data.assignments.map((assignment, index) => (
                              <div 
                                key={index} 
                                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 cursor-pointer transition-all duration-200"
                                onClick={() => loadAssignmentDetails(teacherName, assignment.assignmentTitle, assignment.topicName, assignment.topicId)}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <h4 className="font-semibold text-gray-800 text-sm">
                                    {assignment.assignmentTitle}
                                  </h4>
                                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">
                                    {assignment.gradedCount} graded
                                  </span>
                                </div>
                                <div className="text-xs text-gray-600 space-y-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-blue-600">📚</span>
                                    <span>{assignment.topicName}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-green-600">⏰</span>
                                    <span>Last: {new Date(assignment.lastGraded).toLocaleDateString()}</span>
                                  </div>
                                  <div className="text-blue-600 text-xs font-medium mt-2">
                                    Click to view students
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="bg-gray-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">No Teachers Found</h3>
                      <p className="text-gray-500">No teachers match your search term "{teacherSearchTerm}"</p>
                      <button
                        onClick={() => setTeacherSearchTerm('')}
                        className="mt-3 px-4 py-2 bg-[#b30104] text-white rounded-lg hover:bg-[#7a0103] transition-colors text-sm font-medium"
                      >
                        Clear Search
                      </button>
                    </div>
                  )
                ) : (
                  <div className="text-center py-12">
                    <div className="bg-gray-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                      <Users className="w-8 h-8 text-gray-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">No Grading Data Found</h3>
                    <p className="text-gray-500">No teacher grading information available at the moment.</p>
                  </div>
                )}
              </div>

              {/* Assignment Details Modal */}
              {selectedAssignmentDetails && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                    <div className="flex items-center justify-between p-6 border-b border-gray-200">
                      <h3 className="text-xl font-bold text-gray-800">
                        {selectedAssignmentDetails.teacherName} - {selectedAssignmentDetails.assignmentTitle}
                      </h3>
                      <button
                        onClick={() => setSelectedAssignmentDetails(null)}
                        className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                      >
                        ×
                      </button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto max-h-[60vh]">
                      <div className="mb-4">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Topic:</span> {selectedAssignmentDetails.topicName}
                        </p>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Total Students Graded:</span> {selectedAssignmentDetails.students.length}
                        </p>
                      </div>
                      
                      
                      <div className="space-y-4">
                        {selectedAssignmentDetails.students.map((student, index) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold text-gray-800">{student.studentName}</h4>
                              <div className="flex items-center gap-4">
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                                  {student.marks} marks
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(student.gradedAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            {student.feedback && (
                              <div className="mt-2">
                                <p className="text-sm text-gray-700">
                                  <span className="font-medium">Feedback:</span> {student.feedback}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Course-wise Ungraded Assignments Section */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 hover:shadow-2xl transition-all duration-300 max-h-[2000px] overflow-y-auto">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                Pending Weekly Tests by Course ({ungradedAssignments.length} unmarked)
                {loadingUngradedAssignments && (
                  <div className="w-5 h-5 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                )}
              </h2>
              
              {/* Filters */}
              <div className="mb-6 space-y-4">
                {/* Deadline Status Filter */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Filter by Deadline Status:</label>
                  <select
                    value={deadlineFilter}
                    onChange={(e) => setDeadlineFilter(e.target.value as 'all' | 'overdue' | 'progress')}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                  >
                    <option value="all">All Assignments</option>
                    <option value="overdue">⚠️ Overdue</option>
                    <option value="progress">📋 On TIme</option>
                  </select>
                  {deadlineFilter !== 'all' && (
                    <span className="text-xs text-gray-600 font-medium">
                      {deadlineFilter === 'overdue' && "Showing assignments past grading deadline"}
                      {deadlineFilter === 'progress' && "Showing assignments that need grading"}
                    </span>
                  )}
                </div>

                {/* Course Filter and Urgent Toggle */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">Filter by Course:</label>
                    <select
                      value={pendingCourseFilter}
                      onChange={(e) => setPendingCourseFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                    >
                      <option value="all">All Courses</option>
                      {courses.map(course => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Urgent Assignments Toggle */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowUrgentOnly(!showUrgentOnly)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                        showUrgentOnly
                          ? 'bg-red-100 text-red-800 border border-red-200 hover:bg-red-200'
                          : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {showUrgentOnly ? '⚠️ Overdue Only' : '📋 All Assignments'}
                    </button>
                    {showUrgentOnly && (
                      <span className="text-xs text-red-600 font-medium">
                        Showing only overdue assignments
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {loadingUngradedAssignments ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-[#b30104] border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-3 text-gray-600">Loading assignments...</span>
                </div>
              ) : Object.keys(getFilteredAssignmentsByDeadline(showUrgentOnly ? getUrgentAssignments() : getFilteredAssignmentsByCourse())).length > 0 ? (
                <div className="space-y-8">
                  {Object.entries(getFilteredAssignmentsByDeadline(showUrgentOnly ? getUrgentAssignments() : getFilteredAssignmentsByCourse())).map(([courseId, courseAssignments]) => {
                    const courseName = courses.find(c => c.id === Number(courseId))?.title || `Course ${courseId}`;
                    const ungradedCount = courseAssignments.length;
                    
                    return (
                      <div key={courseId} className="border border-gray-200 rounded-xl p-6 bg-gradient-to-br from-gray-50 to-white">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">
                              {ungradedCount}
                            </span>
                            {courseName}
                          </h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {courseAssignments.map((item) => (
                            <button
                              key={`${item.topicId}-${item.assignment.id}`}
                              onClick={() => {
                                setSelectedCourse({id: Number(courseId), title: courseName});
                                setSelectedTopic(item.topicId);
                                setSelectedAssignment({ id: item.assignment.id, title: item.assignment.data.title });
                              }}
                              className="text-left p-4 rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-yellow-50 hover:from-orange-100 hover:to-yellow-100 hover:shadow-lg transition-all duration-200 group"
                            >
                              <div className="flex items-start justify-between mb-2">
                                <h4 className="font-bold text-base text-gray-800 group-hover:text-orange-800 transition-colors">
                                  {item.assignment.data.title}
                                </h4>
                                <div className="flex flex-col gap-1">
                                  {isGradingDeadlineOverdue(item.assignment.data.gradingDeadline) ? (
                                    <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-medium">
                                      ⚠️ Overdue
                                    </span>
                                  ) : (
                                    <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-medium">
                                      📋 Needs Grading
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="space-y-1 text-xs text-gray-600">
                                <div className="flex items-center gap-1">
                                  <span className="text-orange-600">📚</span>
                                  <span className="font-medium">Topic: {allTopics[item.topicId]?.name || item.topicId}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-orange-600">👥</span>
                                  <span>{item.submittedStudents}/{item.totalStudents} submitted</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-orange-600">✅</span>
                                  <span>{item.gradedStudents}/{item.submittedStudents} graded</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-orange-600">📅</span>
                                  <span>Assignment: {formatDeadline(item.assignment.data.deadline)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-orange-600">⏰</span>
                                  <span>Grading: {formatDeadline(item.assignment.data.gradingDeadline)}</span>
                                </div>
                              </div>

                              <div className="mt-3 bg-orange-200 rounded-lg p-2">
                                <div className="flex justify-between text-xs font-medium text-orange-800">
                                  <span>Progress</span>
                                  <span>{Math.round((item.gradedStudents / item.submittedStudents) * 100)}%</span>
                                </div>
                                <div className="mt-1 bg-orange-300 rounded-full h-1.5">
                                  <div 
                                    className="bg-orange-600 h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${(item.gradedStudents / item.submittedStudents) * 100}%` }}
                                  ></div>
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartGrading(item.topicId, item.assignment.data.title);
                                }}
                                className="mt-3 w-full bg-gradient-to-r from-[#b30104] to-[#7a0103] hover:from-[#7a0103] hover:to-[#b30104] text-white px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                              >
                                Start Grading
                              </button>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  {Object.keys(assignmentsByCourse).length === 0 ? (
                    <>
                      <div className="bg-green-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">All Caught Up!</h3>
                      <p className="text-gray-500">No assignments need grading at the moment.</p>
                    </>
                  ) : (
                    <>
                      <div className="bg-orange-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <FileText className="w-8 h-8 text-orange-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">No Results Found</h3>
                      <p className="text-gray-500">
                        {showUrgentOnly 
                          ? "No overdue assignments found. All grading deadlines are on track!"
                          : deadlineFilter !== 'all'
                            ? `No ${deadlineFilter === 'overdue' ? 'overdue' : 'needs grading'} assignments found. Try selecting a different filter or course.`
                            : "No pending assignments found for the selected course. Try selecting a different course or 'All Courses'."
                        }
                      </p>
                    </>
                  )}
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
                                    onClick={() => {
                                      const topicName = allTopics[selectedTopic]?.name || selectedTopic;
                                      const gradingUrl = `${GRADING_BASE_URL}/assignment/${topicName}/teacher/${selectedAssignment?.title}/grading/${name}`;
                                      window.open(gradingUrl, '_blank');
                                    }}
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
