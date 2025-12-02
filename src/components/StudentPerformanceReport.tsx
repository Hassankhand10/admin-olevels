import { useState, useEffect } from 'react';
import { TrendingUp, Users, Award, Calendar, BookOpen, FileText, Download } from 'lucide-react';
import OLevelsLogo from '../assets/OLevels-logo-color.png';
import { 
  fetchTopics, 
  fetchAllAssignments, 
  fetchAllStudents,
  fetchClassesFromFirestore,
  fetchAssignmentStudentData,
  fetchStudentTopics,
  fetchStudentCategories
} from '../services/firebaseService';
import { Assignment } from '../types';
import toast, { Toaster } from 'react-hot-toast';
import jsPDF from 'jspdf';

interface ClassData {
  id: string;
  topic: string;
  creationDate: Date | null;
  classId?: string;
  teacherName?: string;
  teacher?: string;
  teacherId?: string;
  aqcount?: number;
  cqcount?: number;
  totalMarks?: number;
  students: {
    [category: string]: Array<{
      name: string;
      studentId: string;
      category: string;
      aq: number;
      cq: number;
      totalMarks: number;
      percentage: string;
      present?: boolean;
      joinTime?: string;
      leaveTime?: string;
      duration?: number;
    }>;
  };
  totalStudents?: number;
  averagePercentage?: number;
  passedStudents?: number;
}

interface AssignmentData {
  topicId: string;
  topicName: string;
  assignment: { id: string; data: Assignment };
  studentData: any;
  isWeeklyTest: boolean;
}

export const StudentPerformanceReport = () => {
  const [allTopics, setAllTopics] = useState<{[key: string]: {course: any, name?: string}}>({});
  const [students, setStudents] = useState<Array<{name: string, studentId: string}>>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [studentTopics, setStudentTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [studentCategory, setStudentCategory] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  // Date filter - default to last 1 week
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Data states
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [weeklyTests, setWeeklyTests] = useState<AssignmentData[]>([]);

  useEffect(() => {
    const initialize = async () => {
      await loadTopics();
      await loadStudents();
    };
    initialize();
  }, []);

  useEffect(() => {
    if (selectedStudent && Object.keys(allTopics).length > 0) {
      // Immediately clear all data when student changes
      setClasses([]);
      setAssignments([]);
      setWeeklyTests([]);
      setStudentTopics([]);
      setSelectedTopic('');
      
      // Then load topics
      loadStudentTopics();
    }
  }, [selectedStudent, allTopics]);

  // Ensure selected topic is valid when studentTopics change
  useEffect(() => {
    if (studentTopics.length > 0) {
      // If no topic selected or selected topic is not in student topics, select first topic
      if (!selectedTopic || !studentTopics.includes(selectedTopic)) {
        setSelectedTopic(studentTopics[0]);
      }
    } else {
      // If no topics, reset selected topic
      setSelectedTopic('');
      setStudentCategory('');
    }
  }, [studentTopics]);

  // Fetch student category when topic or student changes
  useEffect(() => {
    const loadStudentCategory = async () => {
      if (selectedStudent && selectedTopic && studentTopics.includes(selectedTopic)) {
        try {
          const categories = await fetchStudentCategories(selectedTopic);
          const category = categories[selectedStudent]?.category || '';
          setStudentCategory(category);
        } catch (error) {
          console.error('Error loading student category:', error);
          setStudentCategory('');
        }
      } else {
        setStudentCategory('');
      }
    };
    
    loadStudentCategory();
  }, [selectedStudent, selectedTopic, studentTopics]);

  useEffect(() => {
    if (selectedStudent && Object.keys(allTopics).length > 0 && studentTopics.length > 0 && selectedTopic) {
      loadStudentPerformance();
    }
  }, [selectedStudent, allTopics, studentTopics, selectedTopic, startDate, endDate]);

  const loadTopics = async () => {
    try {
      const topics = await fetchTopics();
      setAllTopics(topics);
    } catch (error) {
      console.error('Error loading topics:', error);
      toast.error('Failed to load topics');
    }
  };

  const loadStudents = async () => {
    try {
      const studentsList = await fetchAllStudents();
      setStudents(studentsList);
      if (studentsList.length > 0) {
        setSelectedStudent(studentsList[0].name);
      }
    } catch (error) {
      console.error('Error loading students:', error);
      toast.error('Failed to load students');
    }
  };

  const loadStudentTopics = async () => {
    if (!selectedStudent) return;
    
    try {
      // Clear data while loading
      setClasses([]);
      setAssignments([]);
      setWeeklyTests([]);
      
      const topics = await fetchStudentTopics(selectedStudent);
      setStudentTopics(topics);
      
      // Set first topic as default
      if (topics.length > 0) {
        setSelectedTopic(topics[0]);
      } else {
        setSelectedTopic('');
      }
    } catch (error) {
      console.error('Error loading student topics:', error);
      toast.error('Failed to load student topics');
      setStudentTopics([]);
      setSelectedTopic('');
    }
  };

  const loadStudentPerformance = async () => {
    if (!selectedStudent || studentTopics.length === 0) return;
    
    setLoading(true);
    try {
      const fromDate = new Date(startDate);
      const toDate = new Date(endDate);
      toDate.setHours(23, 59, 59, 999); // End of day

      const classesList: ClassData[] = [];
      const assignmentsList: AssignmentData[] = [];
      const weeklyTestsList: AssignmentData[] = [];

      // Get student ID
      const student = students.find(s => s.name === selectedStudent);
      const studentId = student?.studentId || selectedStudent;

      // Determine which topics to process
      const topicsToProcess = selectedTopic && studentTopics.includes(selectedTopic)
        ? [selectedTopic]
        : studentTopics;

      // Process all topics in parallel for better performance
      const topicPromises = topicsToProcess.map(async (topicId) => {
        const topicData = allTopics[topicId];
        if (!topicData) return { classes: [], assignments: [], weeklyTests: [] };
        
        const topicName = topicData.name || topicId;
        const topicClasses: ClassData[] = [];
        const topicAssignments: AssignmentData[] = [];
        const topicWeeklyTests: AssignmentData[] = [];

        // Fetch classes and assignments in parallel for this topic
        const [topicClassesData, topicAssignmentsData] = await Promise.all([
          fetchClassesFromFirestore(topicId, fromDate, toDate).catch(() => []),
          fetchAllAssignments(topicId).catch(() => [])
        ]);

        // Process classes
        topicClassesData.forEach((classData: any) => {
          // Log class data structure for debugging
          console.log('Class data structure:', {
            id: classData.id,
            topic: classData.topic,
            allKeys: Object.keys(classData),
            teacherName: classData.teacherName,
            teacher: classData.teacher,
            teacherId: classData.teacherId,
            totalMarks: classData.totalMarks,
            aqcount: classData.aqcount,
            cqcount: classData.cqcount
          });
          
          for (const categoryStudents of Object.values(classData.students || {})) {
            const studentInClass = (categoryStudents as any[]).find((s: any) => 
              s.name === selectedStudent || s.studentId === studentId
            );
            
            if (studentInClass) {
              topicClasses.push({
                ...classData,
                topic: topicId,
                // Ensure teacherName is set from available fields
                teacherName: classData.teacherName || classData.teacher || classData.teacherId || '',
                // Calculate totalMarks if not present
                totalMarks: classData.totalMarks || ((classData.aqcount || 0) + (classData.cqcount || 0))
              });
              break;
            }
          }
        });

        // Filter assignments by date first (faster)
        const assignmentsInRange = topicAssignmentsData.filter((assignment: { id: string; data: Assignment }) => {
          const assignmentDateValue = assignment.data.creationDate || assignment.data.deadline;
          if (!assignmentDateValue) return false;
          
          try {
            const assignmentDate = new Date(assignmentDateValue);
            if (isNaN(assignmentDate.getTime())) return false;
            return assignmentDate >= fromDate && assignmentDate <= toDate;
          } catch {
            return false;
          }
        });

        // Process assignments in larger batches for better performance
        const assignmentBatchSize = 10;
        for (let i = 0; i < assignmentsInRange.length; i += assignmentBatchSize) {
          const batch = assignmentsInRange.slice(i, i + assignmentBatchSize);
          
          const batchPromises = batch.map(async (assignment: { id: string; data: Assignment }) => {
            try {
              // Check if student exists in assignmentStudents
              const studentData = await fetchAssignmentStudentData(
                topicId,
                assignment.data.title,
                studentId,
                selectedStudent
              );

              // Only include if student data exists (student is enrolled/submitted)
              if (studentData) {
                // Check if it's WeeklyTest or WeeklyTest preparation
                const category = assignment.data.selectedAssignmentCategory || '';
                const isWeeklyTest = category === 'WeeklyTest' || 
                                     category === 'WeeklyTest preparation' ||
                                     category.toLowerCase().includes('weeklytest');
                
                return {
                  topicId,
                  topicName,
                  assignment,
                  studentData,
                  isWeeklyTest
                } as AssignmentData;
              }
            } catch (error) {
              console.error(`Error processing assignment ${assignment.data.title}:`, error);
            }
            return null;
          });

          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(item => {
            if (item) {
              if (item.isWeeklyTest) {
                topicWeeklyTests.push(item);
              } else {
                topicAssignments.push(item);
              }
            }
          });
        }

        return { classes: topicClasses, assignments: topicAssignments, weeklyTests: topicWeeklyTests };
      });

      // Wait for all topics to process
      const results = await Promise.all(topicPromises);
      
      // Combine all results
      results.forEach(result => {
        classesList.push(...result.classes);
        assignmentsList.push(...result.assignments);
        weeklyTestsList.push(...result.weeklyTests);
      });

      setClasses(classesList);
      setAssignments(assignmentsList);
      setWeeklyTests(weeklyTestsList);

      // Complete data report - log everything
      const completeReport = {
        student: {
          name: selectedStudent,
          studentId: student?.studentId || selectedStudent,
          category: studentCategory,
          topics: studentTopics
        },
        filters: {
          selectedTopic,
          startDate,
          endDate,
          dateRange: {
            from: fromDate.toISOString(),
            to: toDate.toISOString()
          }
        },
        statistics: {
          classes: {
            total: classesList.length,
            attended: classesList.filter(c => {
              for (const categoryStudents of Object.values(c.students || {})) {
                const student = (categoryStudents as any[]).find((s: any) => s.name === selectedStudent);
                if (student && student.present !== false) return true;
              }
              return false;
            }).length
          },
          assignments: {
            total: assignmentsList.length,
            submitted: assignmentsList.filter(a => 
              a.studentData?.submission || a.studentData?.status === 'submitted' || a.studentData?.status === 'completed'
            ).length,
            graded: assignmentsList.filter(a => 
              a.studentData?.graded || a.studentData?.status === 'graded'
            ).length
          },
          weeklyTests: {
            total: weeklyTestsList.length,
            submitted: weeklyTestsList.filter(w => 
              w.studentData?.submission || w.studentData?.status === 'submitted' || w.studentData?.status === 'completed'
            ).length,
            graded: weeklyTestsList.filter(w => 
              w.studentData?.graded || w.studentData?.status === 'graded'
            ).length
          }
        },
        previousClasses: classesList.map(classItem => {
          const studentInClass = Object.values(classItem.students || {}).flat().find((s: any) => 
            s.name === selectedStudent
          );
          
          return {
            id: classItem.id,
            classId: classItem.classId,
            topic: classItem.topic,
            topicName: allTopics[classItem.topic]?.name || classItem.topic,
            teacherName: classItem.teacherName,
            creationDate: classItem.creationDate,
            aqcount: classItem.aqcount,
            cqcount: classItem.cqcount,
            totalMarks: classItem.totalMarks,
            studentPerformance: studentInClass ? {
              aq: studentInClass.aq || 0,
              cq: studentInClass.cq || 0,
              totalMarks: (studentInClass.aq || 0) + (studentInClass.cq || 0),
              percentage: studentInClass.percentage || '0.00',
              present: studentInClass.present
            } : null
          };
        }),
        assignments: assignmentsList.map(item => {
          const studentData = item.studentData || {};
          const assignmentData = item.assignment.data as any;
          const assignmentType = assignmentData.type || 'ATTACHMENT';
          const isInteractive = assignmentType === 'INTERACTIVE' || assignmentType === 'INTERACTIVE_NOTES' || assignmentType === 'QUIZ';
          
          let gained = 0;
          let total = 0;
          let attempted = 0;
          let attemptedMarks = 0;
          
          if (isInteractive) {
            if (studentData.performance) {
              gained = studentData.performance.gained || 0;
              attempted = studentData.performance.attempted || 0;
              attemptedMarks = studentData.performance.attempted || 0;
            } else if (studentData.result && Array.isArray(studentData.result)) {
              studentData.result.forEach((lessonResult: any) => {
                gained += parseFloat(lessonResult.gained || '0');
                attempted += parseFloat(lessonResult.attempted || '0');
                attemptedMarks += lessonResult.attemptedMarks || 0;
              });
            } else {
              gained = studentData.totalGained || 0;
              attempted = studentData.totalAttempted || 0;
              attemptedMarks = studentData.totalAttempted || 0;
            }
            total = attemptedMarks > 0 ? attemptedMarks : parseFloat(assignmentData.totalMarks) || 0;
          } else {
            gained = studentData.totalGained || studentData.marks || 0;
            total = parseFloat(assignmentData.totalMarks) || 0;
          }
          
          const percentage = isInteractive 
            ? (attemptedMarks > 0 ? (gained / attemptedMarks) * 100 : 0)
            : (total > 0 ? (gained / total) * 100 : 0);
          
          return {
            topicId: item.topicId,
            topicName: item.topicName,
            assignmentId: item.assignment.id,
            title: assignmentData.title,
            type: assignmentType,
            deadline: assignmentData.deadline,
            totalMarks: assignmentData.totalMarks,
            weightage: assignmentData.weightage,
            teacherName: assignmentData.teacherName,
            creationDate: assignmentData.creationDate,
            studentData: {
              submission: studentData.submission || false,
              submissionTime: studentData.submissionTime,
              graded: studentData.graded || false,
              gradedAt: studentData.gradedAt,
              gradedBy: studentData.gradedBy,
              gradedByTeacher: studentData.gradedByTeacher,
              marks: studentData.marks,
              totalGained: studentData.totalGained,
              feedback: studentData.feedback,
              message: studentData.message,
              lateSubmission: studentData.lateSubmission,
              attachments: studentData.attachments || [],
              feedbackURLs: studentData.feedbackURLs || [],
              feedbackvoiceurl: studentData.feedbackvoiceurl,
              supervisionApproval: studentData.supervisionApproval,
              supervisionVideoUrl: studentData.supervisionVideoUrl,
              performance: studentData.performance,
              result: studentData.result,
              // Calculated values
              calculated: {
                gained,
                total,
                attempted,
                attemptedMarks,
                percentage: percentage.toFixed(2) + '%'
              }
            }
          };
        }),
        weeklyTests: weeklyTestsList.map(item => {
          const studentData = item.studentData || {};
          const assignmentData = item.assignment.data as any;
          
          const gained = studentData.totalGained || studentData.marks || 0;
          const total = parseFloat(assignmentData.totalMarks) || 0;
          const percentage = total > 0 ? (gained / total) * 100 : 0;
          
          return {
            topicId: item.topicId,
            topicName: item.topicName,
            assignmentId: item.assignment.id,
            title: assignmentData.title,
            type: assignmentData.type || 'ATTACHMENT',
            deadline: assignmentData.deadline,
            totalMarks: assignmentData.totalMarks,
            weightage: assignmentData.weightage,
            teacherName: assignmentData.teacherName,
            creationDate: assignmentData.creationDate,
            studentData: {
              submission: studentData.submission || false,
              submissionTime: studentData.submissionTime,
              graded: studentData.graded || false,
              gradedAt: studentData.gradedAt,
              gradedBy: studentData.gradedBy,
              gradedByTeacher: studentData.gradedByTeacher,
              marks: studentData.marks,
              totalGained: studentData.totalGained,
              feedback: studentData.feedback,
              message: studentData.message,
              lateSubmission: studentData.lateSubmission,
              attachments: studentData.attachments || [],
              feedbackURLs: studentData.feedbackURLs || [],
              feedbackvoiceurl: studentData.feedbackvoiceurl,
              supervisionApproval: studentData.supervisionApproval,
              supervisionVideoUrl: studentData.supervisionVideoUrl,
              // Calculated values
              calculated: {
                gained,
                total,
                percentage: percentage.toFixed(2) + '%'
              }
            }
          };
        })
      };

      // Log complete report
      console.log('=== COMPLETE STUDENT PERFORMANCE REPORT ===');
      console.log(JSON.stringify(completeReport, null, 2));
      console.log('=== END COMPLETE REPORT ===');
      
      // Also log in a more readable format
      console.log('=== READABLE FORMAT ===');
      console.log('STUDENT:', completeReport.student);
      console.log('FILTERS:', completeReport.filters);
      console.log('STATISTICS:', completeReport.statistics);
      console.log('PREVIOUS CLASSES:', completeReport.previousClasses);
      console.log('ASSIGNMENTS:', completeReport.assignments);
      console.log('WEEKLY TESTS:', completeReport.weeklyTests);
      console.log('=== END READABLE FORMAT ===');
    } catch (error) {
      console.error('Error loading student performance:', error);
      toast.error('Failed to load student performance data');
    } finally {
      setLoading(false);
    }
  };

  const getStudentStats = () => {
    const totalClasses = classes.length;
    const attendedClasses = classes.filter(c => {
      for (const categoryStudents of Object.values(c.students || {})) {
        const student = categoryStudents.find((s: any) => s.name === selectedStudent);
        if (student && student.present !== false) {
          return true;
        }
      }
      return false;
    }).length;

    const totalAssignments = assignments.length;
    const submittedAssignments = assignments.filter(a => 
      a.studentData?.submission || a.studentData?.status === 'submitted' || a.studentData?.status === 'completed'
    ).length;
    const gradedAssignments = assignments.filter(a => 
      a.studentData?.graded || a.studentData?.status === 'graded'
    ).length;

    const totalWeeklyTests = weeklyTests.length;
    const submittedWeeklyTests = weeklyTests.filter(w => 
      w.studentData?.submission || w.studentData?.status === 'submitted' || w.studentData?.status === 'completed'
    ).length;
    const gradedWeeklyTests = weeklyTests.filter(w => 
      w.studentData?.graded || w.studentData?.status === 'graded'
    ).length;

    // Calculate average marks - average of percentages for each graded assignment/test
    const gradedItems = [...assignments, ...weeklyTests].filter(item => 
      item.studentData?.graded || item.studentData?.status === 'graded'
    );
    
    let totalPercentage = 0;
    let count = 0;
    
    gradedItems.forEach(item => {
      const gained = item.studentData?.totalGained || item.studentData?.marks || 0;
      const total = parseFloat(item.assignment.data.totalMarks) || 0;
      if (total > 0) {
        const percentage = (gained / total) * 100;
        totalPercentage += percentage;
        count++;
      }
    });

    const averageMarks = count > 0 ? totalPercentage / count : 0;

    return {
      totalClasses,
      attendedClasses,
      attendancePercentage: totalClasses > 0 ? (attendedClasses / totalClasses) * 100 : 0,
      totalAssignments,
      submittedAssignments,
      gradedAssignments,
      totalWeeklyTests,
      submittedWeeklyTests,
      gradedWeeklyTests,
      averageMarks: Math.round(averageMarks * 100) / 100
    };
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'N/A';
    }
  };

  const formatDateTime = (date: Date | string | null) => {
    if (!date) return 'N/A';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return String(date);
    }
  };

  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      let yPos = 20;
      const margin = 15;

      // Helper function to add new page if needed
      const checkNewPage = (requiredSpace: number) => {
        if (yPos + requiredSpace > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          yPos = 20;
        }
      };

      // Title
      doc.setFontSize(20);
      doc.setTextColor(179, 1, 4); // #b30104
      doc.text('Student Performance Report', margin, yPos);
      yPos += 10;

      // Student Info
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Student: ${selectedStudent}`, margin, yPos);
      yPos += 6;
      if (studentCategory) {
        doc.text(`Category: ${studentCategory}`, margin, yPos);
        yPos += 6;
      }
      doc.text(`Topic: ${allTopics[selectedTopic]?.name || selectedTopic}`, margin, yPos);
      yPos += 6;
      doc.text(`Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}`, margin, yPos);
      yPos += 10;

      // Statistics
      checkNewPage(30);
      doc.setFontSize(14);
      doc.setTextColor(179, 1, 4);
      doc.text('Overall Statistics', margin, yPos);
      yPos += 8;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Classes Attended: ${stats.attendedClasses}/${stats.totalClasses} (${Math.round(stats.attendancePercentage)}%)`, margin, yPos);
      yPos += 6;
      doc.text(`Assignments Submitted: ${stats.submittedAssignments}/${stats.totalAssignments} (${stats.gradedAssignments} Graded)`, margin, yPos);
      yPos += 6;
      doc.text(`Weekly Tests Submitted: ${stats.submittedWeeklyTests}/${stats.totalWeeklyTests} (${stats.gradedWeeklyTests} Graded)`, margin, yPos);
      yPos += 6;
      doc.text(`Average Performance: ${stats.averageMarks}%`, margin, yPos);
      yPos += 12;

      // Previous Classes
      if (classes.length > 0) {
        checkNewPage(40);
        doc.setFontSize(14);
        doc.setTextColor(179, 1, 4);
        doc.text('Previous Classes', margin, yPos);
        yPos += 8;

        classes.forEach((classItem, idx) => {
          checkNewPage(25);
          const studentInClass = Object.values(classItem.students || {}).flat().find((s: any) => 
            s.name === selectedStudent
          );

          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.text(`${idx + 1}. ${classItem.teacherName} - ${formatDate(classItem.creationDate)}`, margin, yPos);
          yPos += 6;
          
          doc.setFontSize(9);
          doc.text(`Topic: ${allTopics[classItem.topic]?.name || classItem.topic}`, margin + 5, yPos);
          yPos += 5;
          doc.text(`Total Marks: ${classItem.totalMarks} (AQ: ${classItem.aqcount}, CQ: ${classItem.cqcount})`, margin + 5, yPos);
          yPos += 5;

          if (studentInClass) {
            const studentAQ = studentInClass.aq || 0;
            const studentCQ = studentInClass.cq || 0;
            const studentTotal = studentAQ + studentCQ;
            const classTotal = (classItem.aqcount || 0) + (classItem.cqcount || 0);
            const percentage = classTotal > 0 ? ((studentTotal / classTotal) * 100).toFixed(2) : '0.00';
            
            doc.text(`Student Performance: AQ ${studentAQ}/${classItem.aqcount}, CQ ${studentCQ}/${classItem.cqcount}`, margin + 5, yPos);
            yPos += 5;
            doc.text(`Total: ${studentTotal}/${classTotal} (${percentage}%)`, margin + 5, yPos);
          }
          yPos += 8;
        });
        yPos += 5;
      }

      // Weekly Tests
      if (weeklyTests.length > 0) {
        checkNewPage(40);
        doc.setFontSize(14);
        doc.setTextColor(179, 1, 4);
        doc.text('Weekly Tests', margin, yPos);
        yPos += 8;

        weeklyTests.forEach((item, idx) => {
          checkNewPage(35);
          const studentData = item.studentData || {};
          const gained = studentData.totalGained || studentData.marks || 0;
          const total = parseFloat(item.assignment.data.totalMarks) || 0;
          const percentage = total > 0 ? (gained / total) * 100 : 0;
          const isGraded = studentData.graded || false;
          const isSubmitted = studentData.submission || false;

          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.text(`${idx + 1}. ${item.assignment.data.title}`, margin, yPos);
          yPos += 6;
          
          doc.setFontSize(9);
          doc.text(`Status: ${isGraded ? 'Graded' : isSubmitted ? 'Submitted' : 'Pending'}`, margin + 5, yPos);
          yPos += 5;
          if (studentData.submissionTime) {
            doc.text(`Submission Time: ${formatDateTime(studentData.submissionTime)}`, margin + 5, yPos);
            yPos += 5;
          }
          doc.text(`Marks: ${gained}/${total} (${percentage.toFixed(1)}%)`, margin + 5, yPos);
          yPos += 5;
          if (studentData.feedback) {
            doc.text(`Feedback: ${studentData.feedback}`, margin + 5, yPos);
            yPos += 5;
          }
          if (studentData.gradedByTeacher) {
            doc.text(`Graded By: ${studentData.gradedByTeacher}`, margin + 5, yPos);
            yPos += 5;
          }
          if (studentData.attachments && studentData.attachments.length > 0) {
            doc.text(`Files: ${studentData.attachments.map((f: any) => f.name).join(', ')}`, margin + 5, yPos);
            yPos += 5;
          }
          if (studentData.feedbackURLs && studentData.feedbackURLs.length > 0) {
            doc.text(`Feedback Files: ${studentData.feedbackURLs.map((f: any) => f.name).join(', ')}`, margin + 5, yPos);
            yPos += 5;
          }
          yPos += 5;
        });
        yPos += 5;
      }

      // Assignments
      if (assignments.length > 0) {
        checkNewPage(40);
        doc.setFontSize(14);
        doc.setTextColor(179, 1, 4);
        doc.text('Assignments', margin, yPos);
        yPos += 8;

        assignments.forEach((item, idx) => {
          checkNewPage(40);
          const studentData = item.studentData || {};
          const assignmentData = item.assignment.data as any;
          const assignmentType = assignmentData.type || 'ATTACHMENT';
          const isInteractive = assignmentType === 'INTERACTIVE' || assignmentType === 'INTERACTIVE_NOTES' || assignmentType === 'QUIZ';
          
          let gained = 0;
          let total = 0;
          let attempted = 0;
          let attemptedMarks = 0;
          
          if (isInteractive) {
            if (studentData.performance) {
              gained = studentData.performance.gained || 0;
              attempted = studentData.performance.attempted || 0;
              attemptedMarks = studentData.performance.attempted || 0;
            } else if (studentData.result && Array.isArray(studentData.result)) {
              studentData.result.forEach((lessonResult: any) => {
                gained += parseFloat(lessonResult.gained || '0');
                attempted += parseFloat(lessonResult.attempted || '0');
                attemptedMarks += lessonResult.attemptedMarks || 0;
              });
            } else {
              gained = studentData.totalGained || 0;
              attempted = studentData.totalAttempted || 0;
              attemptedMarks = studentData.totalAttempted || 0;
            }
            total = attemptedMarks > 0 ? attemptedMarks : parseFloat(assignmentData.totalMarks) || 0;
          } else {
            gained = studentData.totalGained || studentData.marks || 0;
            total = parseFloat(assignmentData.totalMarks) || 0;
          }
          
          const percentage = isInteractive 
            ? (attemptedMarks > 0 ? (gained / attemptedMarks) * 100 : 0)
            : (total > 0 ? (gained / total) * 100 : 0);
          
          const isGraded = studentData.graded || false;
          const isSubmitted = studentData.submission || false;

          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.text(`${idx + 1}. ${item.assignment.data.title}`, margin, yPos);
          yPos += 6;
          
          doc.setFontSize(9);
          doc.text(`Type: ${assignmentType}`, margin + 5, yPos);
          yPos += 5;
          doc.text(`Status: ${isGraded ? 'Graded' : isSubmitted ? 'Submitted' : 'Pending'}`, margin + 5, yPos);
          yPos += 5;
          if (isInteractive) {
            doc.text(`Attempted: ${attempted} questions`, margin + 5, yPos);
            yPos += 5;
            doc.text(`Marks: ${gained}/${total} (${percentage.toFixed(1)}%)`, margin + 5, yPos);
          } else {
            doc.text(`Marks: ${gained}/${total} (${percentage.toFixed(1)}%)`, margin + 5, yPos);
          }
          yPos += 5;
          if (studentData.feedback) {
            doc.text(`Feedback: ${studentData.feedback}`, margin + 5, yPos);
            yPos += 5;
          }
          if (studentData.attachments && studentData.attachments.length > 0) {
            doc.text(`Files: ${studentData.attachments.map((f: any) => f.name).join(', ')}`, margin + 5, yPos);
            yPos += 5;
          }
          if (studentData.feedbackURLs && studentData.feedbackURLs.length > 0) {
            doc.text(`Feedback Files: ${studentData.feedbackURLs.map((f: any) => f.name).join(', ')}`, margin + 5, yPos);
            yPos += 5;
          }
          yPos += 5;
        });
      }

      // Save PDF
      const fileName = `Student_Performance_${selectedStudent}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success('PDF generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const stats = getStudentStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Toaster />
      
      {/* Header */}
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={OLevelsLogo} alt="OLevels Logo" className="h-12 w-auto" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent tracking-tight">
                Student Performance Report
              </h1>
            </div>
            <div className="text-right bg-gradient-to-r from-gray-50 to-white p-4 rounded-xl border border-gray-200/50 shadow-lg">
              <p className="text-sm text-gray-600 font-medium">Admin Portal</p>
              <p className="text-sm font-semibold text-gray-800">Performance Analytics</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="space-y-8">
          
          {/* Filters Section */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Filters</h3>
              <button
                onClick={generatePDF}
                disabled={loading || classes.length === 0 && assignments.length === 0 && weeklyTests.length === 0}
                className="px-4 py-2 bg-[#b30104] text-white rounded-lg hover:bg-[#7a0103] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Generate PDF
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Student Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Student</label>
                <div className="relative">
                  <select
                    value={selectedStudent}
                    onChange={(e) => setSelectedStudent(e.target.value)}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                  >
                    {students.map(student => (
                      <option key={student.name} value={student.name}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                  <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                {studentCategory && (
                  <div className="mt-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Category: {studentCategory}
                    </span>
                  </div>
                )}
              </div>

              {/* Topic Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Topic</label>
                <div className="relative">
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    disabled={studentTopics.length === 0}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {studentTopics.length === 0 ? (
                      <option value="">No topic available</option>
                    ) : (
                      studentTopics.map(topicId => {
                        const topicData = allTopics[topicId];
                        const topicName = topicData?.name || topicId;
                        return (
                          <option key={topicId} value={topicId}>
                            {topicName}
                          </option>
                        );
                      })
                    )}
                  </select>
                  <BookOpen className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                  />
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm bg-white"
                  />
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Overall Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-blue-600">{stats.attendedClasses}/{stats.totalClasses}</p>
                  <p className="text-sm text-blue-700">Classes Attended</p>
                  <p className="text-xs text-blue-600 mt-1">{Math.round(stats.attendancePercentage)}%</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-green-100 p-3 rounded-lg">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-green-600">{stats.submittedAssignments}/{stats.totalAssignments}</p>
                  <p className="text-sm text-green-700">Assignments Submitted</p>
                  <p className="text-xs text-green-600 mt-1">{stats.gradedAssignments} Graded</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Award className="w-6 h-6 text-purple-600" />
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-purple-600">{stats.submittedWeeklyTests}/{stats.totalWeeklyTests}</p>
                  <p className="text-sm text-purple-700">Weekly Tests Submitted</p>
                  <p className="text-xs text-purple-600 mt-1">{stats.gradedWeeklyTests} Graded</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-orange-100 p-3 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-orange-600" />
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-orange-600">{stats.averageMarks}%</p>
                  <p className="text-sm text-orange-700">Average Performance</p>
                  <p className="text-xs text-orange-600 mt-1">Overall Score</p>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-[#b30104] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading performance data...</p>
            </div>
          ) : (
            <>
              {/* Classes Section */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                  <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  Previous Classes ({classes.length})
                </h2>

                {classes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No classes found for selected period</div>
                ) : (
                  <div className="space-y-4 max-h-[1000px] overflow-y-auto">
                    {classes.map((classItem) => {
                      const studentInClass = Object.values(classItem.students || {}).flat().find((s: any) => 
                        s.name === selectedStudent
                      );

                      // Calculate percentage if not present
                      let percentage = studentInClass?.percentage;
                      if (studentInClass && (!percentage || percentage === '')) {
                        // Calculate from AQ + CQ
                        const studentAQ = studentInClass.aq || 0;
                        const studentCQ = studentInClass.cq || 0;
                        const studentTotalMarks = studentAQ + studentCQ;
                        
                        const classAQCount = classItem.aqcount || 0;
                        const classCQCount = classItem.cqcount || 0;
                        const classTotalMarks = classAQCount + classCQCount;
                        
                        percentage = classTotalMarks > 0 ? ((studentTotalMarks / classTotalMarks) * 100).toFixed(2) : '0.00';
                      }

                      return (
                        <div key={classItem.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-sm text-gray-600">
                                <span className="font-medium">{formatDate(classItem.creationDate)}</span> • {allTopics[classItem.topic]?.name || classItem.topic}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600">
                                Total Marks: {(classItem.aqcount || 0) + (classItem.cqcount || 0)} (AQ: {classItem.aqcount || 0}, CQ: {classItem.cqcount || 0})
                              </p>
                            </div>
                          </div>
                          
                          {studentInClass && (() => {
                            // Calculate totals from AQ + CQ
                            const studentAQ = studentInClass.aq || 0;
                            const studentCQ = studentInClass.cq || 0;
                            const studentTotalMarks = studentAQ + studentCQ;
                            
                            const classAQCount = classItem.aqcount || 0;
                            const classCQCount = classItem.cqcount || 0;
                            const classTotalMarks = classAQCount + classCQCount;
                            
                            return (
                              <div className="bg-gray-50 rounded-lg p-3 mt-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                    <p className="text-xs text-gray-600">AQ Score</p>
                                    <p className="font-semibold text-gray-800">{studentAQ}/{classAQCount}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600">CQ Score</p>
                                    <p className="font-semibold text-gray-800">{studentCQ}/{classCQCount}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600">Total Marks</p>
                                    <p className="font-semibold text-gray-800">{studentTotalMarks}/{classTotalMarks}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600">Percentage</p>
                                    <p className="font-semibold text-[#b30104]">{percentage || '0.00'}%</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Weekly Tests Section */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                  <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  Weekly Tests ({weeklyTests.length})
                </h2>

                {weeklyTests.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No weekly tests found for selected period</div>
                ) : (
                  <div className="overflow-x-auto max-h-[1000px] overflow-y-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-gray-200 bg-gray-50">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Title</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Deadline</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Submission Status</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Submission Time</th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-700">Marks</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Feedback</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Files</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Feedback Files</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Message</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Supervision Approval</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Supervision Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeklyTests.map((item) => {
                          const studentData = item.studentData || {};
                          const gained = studentData.totalGained || studentData.marks || 0;
                          const total = parseFloat(item.assignment.data.totalMarks) || 0;
                          const isGraded = studentData.graded || studentData.status === 'graded';
                          const isSubmitted = studentData.submission || studentData.status === 'submitted' || studentData.status === 'completed';
                          
                          // Format deadline
                          const deadline = item.assignment.data.deadline || '';
                          let formattedDeadline = 'N/A';
                          if (deadline) {
                            try {
                              const deadlineDate = typeof deadline === 'string' 
                                ? new Date(deadline) 
                                : new Date(deadline);
                              if (!isNaN(deadlineDate.getTime())) {
                                formattedDeadline = deadlineDate.toLocaleString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true
                                });
                              }
                            } catch (e) {
                              formattedDeadline = String(deadline);
                            }
                          }
                          
                          // Format submission time (from assignmentStudents)
                          // submissionTime can be already formatted string or timestamp
                          const submissionTime = studentData.submissionTime || studentData.submittedAt || '';
                          let formattedTime = 'N/A';
                          if (submissionTime) {
                            // Check if it's already a formatted string (contains "th", "st", "nd", "rd" or month names)
                            if (typeof submissionTime === 'string' && 
                                (submissionTime.includes('th') || submissionTime.includes('st') || 
                                 submissionTime.includes('nd') || submissionTime.includes('rd') ||
                                 submissionTime.includes('November') || submissionTime.includes('December') ||
                                 submissionTime.includes('January') || submissionTime.includes('February'))) {
                              // Already formatted, use as is
                              formattedTime = submissionTime;
                            } else {
                              // Try to parse and format
                              try {
                                const timeDate = typeof submissionTime === 'string' 
                                  ? new Date(submissionTime) 
                                  : new Date(submissionTime);
                                if (!isNaN(timeDate.getTime())) {
                                  formattedTime = timeDate.toLocaleString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: true
                                  });
                                } else {
                                  formattedTime = String(submissionTime);
                                }
                              } catch (e) {
                                formattedTime = String(submissionTime);
                              }
                            }
                          }
                          
                          // Check if late submission
                          const isLateSubmission = studentData.lateSubmission || false;
                          
                          // Format graded at time
                          const gradedAt = studentData.gradedAt || '';
                          let formattedGradedAt = '';
                          if (gradedAt) {
                            try {
                              const gradedDate = typeof gradedAt === 'string' ? new Date(gradedAt) : new Date(gradedAt);
                              if (!isNaN(gradedDate.getTime())) {
                                formattedGradedAt = gradedDate.toLocaleString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true
                                });
                              }
                            } catch (e) {
                              formattedGradedAt = String(gradedAt);
                            }
                          }
                          
                          // Get grader info - prioritize gradedByTeacher
                          const gradedBy = studentData.gradedByTeacher || studentData.gradedBy || '';
                          
                          // Get feedback voice URL
                          const feedbackVoiceUrl = studentData.feedbackvoiceurl || studentData.feedbackVoiceUrl || '';
                          
                          // Get attachments
                          const attachments = studentData.attachments || [];
                          
                          // Get feedback URLs
                          const feedbackURLs = studentData.feedbackURLs || [];
                          
                          // Supervision approval
                          const supervisionApproval = studentData.supervisionApproval || 'Not Set';
                          
                          // Supervision video URL
                          const supervisionVideoUrl = studentData.supervisionVideoUrl || '';

                          return (
                            <tr key={`${item.topicId}-${item.assignment.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-gray-800 font-medium">{item.assignment.data.title}</td>
                              <td className="py-3 px-4 text-gray-800 text-sm">{formattedDeadline}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  isGraded ? 'bg-green-100 text-green-800' :
                                  isSubmitted ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {isGraded ? 'Graded' : isSubmitted ? 'Submitted' : 'Pending'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-gray-800 text-sm">
                                {formattedTime}
                                {isLateSubmission && (
                                  <span className="ml-2 text-xs text-red-600 font-medium">(Late)</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="font-semibold text-gray-800">{gained}</span>
                                {total > 0 && <span className="text-gray-500 text-sm">/{total}</span>}
                                {isGraded && formattedGradedAt && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    Graded: {formattedGradedAt}
                                    {gradedBy && <span> by {gradedBy}</span>}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-gray-700 text-sm max-w-xs">
                                <div>
                                  {studentData.feedback || '-'}
                                  {feedbackVoiceUrl && (
                                    <a
                                      href={feedbackVoiceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                                      title="Voice Feedback"
                                    >
                                      🎤
                                    </a>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-col gap-1">
                                  {attachments.length > 0 ? (
                                    attachments.map((file: any, idx: number) => (
                                      <a
                                        key={idx}
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 text-xs underline truncate max-w-xs"
                                      >
                                        {file.name || 'File'}
                                      </a>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 text-xs">No files</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-col gap-1">
                                  {feedbackURLs.length > 0 ? (
                                    feedbackURLs.map((file: any, idx: number) => (
                                      <a
                                        key={idx}
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-green-600 hover:text-green-800 text-xs underline truncate max-w-xs"
                                      >
                                        {file.name || 'Feedback File'}
                                      </a>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 text-xs">No feedback files</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-gray-700 text-sm max-w-xs">
                                {studentData.message || '-'}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  supervisionApproval === 'Approved' ? 'bg-green-100 text-green-800' :
                                  supervisionApproval === 'Rejected' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {supervisionApproval}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                {supervisionVideoUrl ? (
                                  <a
                                    href={supervisionVideoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-red-600 hover:text-red-800 text-xs font-medium flex items-center gap-1"
                                  >
                                    <span>▶</span> View Video
                                  </a>
                                ) : (
                                  <span className="text-gray-400 text-xs">No Video</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Assignments Section */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                  <div className="bg-gradient-to-br from-[#b30104] to-[#7a0103] p-2 rounded-lg shadow-lg">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  Assignments ({assignments.length})
                </h2>

                {assignments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No assignments found for selected period</div>
                ) : (
                  <div className="overflow-x-auto max-h-[1000px] overflow-y-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-gray-200 bg-gray-50">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Title</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Submission Status</th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-700">Marks</th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-700">Gained</th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-700">Percentage</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Type</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Feedback</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Files</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">Feedback Files</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignments.map((item) => {
                          const studentData = item.studentData || {};
                          const assignmentData = item.assignment.data as any;
                          const assignmentType = assignmentData.type || 'ATTACHMENT';
                          const isInteractive = assignmentType === 'INTERACTIVE' || assignmentType === 'INTERACTIVE_NOTES' || assignmentType === 'QUIZ';
                          
                          // For interactive assignments - calculate from result array
                          let gained = 0;
                          let total = 0;
                          let attempted = 0;
                          let attemptedMarks = 0;
                          
                          if (isInteractive) {
                            // Check if performance object exists (calculated summary)
                            if (studentData.performance) {
                              gained = studentData.performance.gained || 0;
                              attempted = studentData.performance.attempted || 0;
                              attemptedMarks = studentData.performance.attempted || 0;
                            } 
                            // Otherwise calculate from result array
                            else if (studentData.result && Array.isArray(studentData.result)) {
                              studentData.result.forEach((lessonResult: any) => {
                                const lessonGained = parseFloat(lessonResult.gained || '0');
                                const lessonAttempted = parseFloat(lessonResult.attempted || '0');
                                const lessonAttemptedMarks = lessonResult.attemptedMarks || 0;
                                
                                gained += lessonGained;
                                attempted += lessonAttempted;
                                attemptedMarks += lessonAttemptedMarks;
                              });
                            }
                            // Fallback to totalGained if available
                            else {
                              gained = studentData.totalGained || 0;
                              attempted = studentData.totalAttempted || 0;
                              attemptedMarks = studentData.totalAttempted || 0;
                            }
                            
                            // For interactive, use attemptedMarks as total (not assignment totalMarks)
                            total = attemptedMarks > 0 ? attemptedMarks : parseFloat(assignmentData.totalMarks) || 0;
                          } else {
                            // For attachment assignments
                            gained = studentData.totalGained || studentData.marks || 0;
                            total = parseFloat(assignmentData.totalMarks) || 0;
                          }
                          
                          // Calculate percentage - for interactive use attemptedMarks, for attachment use total
                          const percentage = isInteractive 
                            ? (attemptedMarks > 0 ? (gained / attemptedMarks) * 100 : 0)
                            : (total > 0 ? (gained / total) * 100 : 0);
                          const isGraded = studentData.graded || studentData.status === 'graded';
                          const isSubmitted = studentData.submission || studentData.status === 'submitted' || studentData.status === 'completed';
                          
                          // Get attachments and feedback files
                          const attachments = studentData.attachments || [];
                          const feedbackURLs = studentData.feedbackURLs || [];

                          return (
                            <tr key={`${item.topicId}-${item.assignment.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-gray-800 font-medium">{item.assignment.data.title}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  isGraded ? 'bg-green-100 text-green-800' :
                                  isSubmitted ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {isGraded ? 'Graded' : isSubmitted ? 'Submitted' : 'Pending'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                {isInteractive ? (
                                  <div className="text-sm">
                                    <div className="font-semibold text-gray-800">{attemptedMarks > 0 ? attemptedMarks : total}</div>
                                    <div className="text-xs text-gray-500">Total Marks</div>
                                  </div>
                                ) : (
                                  <span className="text-gray-600">{total}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {isInteractive ? (
                                  <div className="text-sm">
                                    <div className="font-semibold text-gray-800">{gained}</div>
                                    {attempted > 0 && (
                                      <div className="text-xs text-gray-500">
                                        Attempted: {attempted}
                                        {attemptedMarks > 0 && ` (${attemptedMarks} marks)`}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="font-semibold text-gray-800">{gained}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`font-bold ${
                                  percentage >= 80 ? 'text-green-600' :
                                  percentage >= 60 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {percentage.toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  {assignmentType}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-gray-700 text-sm max-w-xs">
                                {studentData.feedback || '-'}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-col gap-1">
                                  {attachments.length > 0 ? (
                                    attachments.map((file: any, idx: number) => (
                                      <a
                                        key={idx}
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 text-xs underline truncate max-w-xs"
                                      >
                                        {file.name || 'File'}
                                      </a>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 text-xs">No files</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-col gap-1">
                                  {feedbackURLs.length > 0 ? (
                                    feedbackURLs.map((file: any, idx: number) => (
                                      <a
                                        key={idx}
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-green-600 hover:text-green-800 text-xs underline truncate max-w-xs"
                                      >
                                        {file.name || 'Feedback File'}
                                      </a>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 text-xs">No feedback files</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
