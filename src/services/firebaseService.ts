import { ref, get, set, update } from 'firebase/database';
import { database } from '../config/firebase';
import { Assignment, StudentData } from '../types';

export const fetchTopics = async (): Promise<{[key: string]: {course: any, name?: string}}> => {
  try {
    console.log('Fetching topics from Firebase path: topics');
    const assignmentsRef = ref(database, 'topics');
    
    // Get snapshot to access keys and course objects only
    const snapshot = await get(assignmentsRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      console.log('Firebase data received:', data);
      
      // Extract keys, course objects, and topic names for each topic
      const topicsWithCourses: {[key: string]: {course: any, name?: string}} = {};
      
      Object.keys(data).forEach(topicKey => {
        const topicData = data[topicKey];
        topicsWithCourses[topicKey] = {
          course: topicData.course || null,
          name: topicData.name || topicKey // Use topic name if available, otherwise use key
        };
      });
      
      console.log('Topics extracted (keys + course + name):', topicsWithCourses);
      return topicsWithCourses;
    } else {
      console.log('No data found at topics path');
      return {};
    }
  } catch (error) {
    console.error('Error fetching topics from Firebase:', error);
    return {};
  }
};

export const fetchAssignments = async (topic: string): Promise<{ id: string; data: Assignment }[]> => {
  const assignmentRef = ref(database, `assignments/topics/${topic}/assignment`);
  const snapshot = await get(assignmentRef);

  if (snapshot.exists()) {
    const assignments = snapshot.val();
    console.log(`Fetched assignments for topic ${topic}:`, assignments);
    
    const filteredAssignments = Object.entries(assignments)
      .map(([id, data]) => {
        console.log(`Assignment ${id} data:`, data);
        return { id, data: data as Assignment };
      })
      .filter(item => item.data.selectedAssignmentCategory === 'WeeklyTest');
    
    console.log(`Filtered WeeklyTest assignments for topic ${topic}:`, filteredAssignments);
    return filteredAssignments;
  }
  return [];
};

export const fetchStudentSubmissions = async (
  topic: string,
  assignmentTitle: string
): Promise<StudentData> => {
  const studentsRef = ref(database, `assignmentStudents/${topic}/${assignmentTitle}/students`);
  const snapshot = await get(studentsRef);

  if (snapshot.exists()) {
    return snapshot.val() as StudentData;
  }
  return {};
};

export const fetchStudentCategories = async (
  topic: string
): Promise<{[studentName: string]: {category: string}}> => {
  const studentsRef = ref(database, `topics/${topic}/students`);
  const snapshot = await get(studentsRef);

  if (snapshot.exists()) {
    return snapshot.val() as {[studentName: string]: {category: string}};
  }
  return {};
};

export const updateStudentGrade = async (
  topic: string,
  assignmentTitle: string,
  studentName: string,
  marks: number,
  feedback: string
): Promise<void> => {
  const studentRef = ref(
    database,
    `assignmentStudents/${topic}/${assignmentTitle}/students/${studentName}`
  );

  await update(studentRef, {
    graded: true,
    marks,
    feedback,
  });
};

// Generic update function for any Firebase path
export const updateFirebaseData = async (
  path: string,
  data: any
): Promise<void> => {
  const refPath = ref(database, path);
  await update(refPath, data);
};

// Specific function for updating supervision approval
export const updateSupervisionApproval = async (
  topic: string,
  assignmentTitle: string,
  studentName: string,
  approvalValue: string | null
): Promise<void> => {
  const path = `assignmentStudents/${topic}/${assignmentTitle}/students/${studentName}`;
  
  if (!approvalValue) {
    // Remove approval
    await updateFirebaseData(path, {
      supervisionApproval: null,
      supervisionApprovalDate: null
    });
  } else {
    // Update approval
    await updateFirebaseData(path, {
      supervisionApproval: approvalValue,
      supervisionApprovalDate: new Date().getTime()
    });
  }
};
