import { ref, get, update } from 'firebase/database';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { database, firestore } from '../config/firebase';
import { Assignment, StudentData } from '../types';

export const fetchTopics = async (): Promise<{[key: string]: {course: any, name?: string}}> => {
  try {
    const assignmentsRef = ref(database, 'topics');
    
    // Get snapshot to access keys and course objects only
    const snapshot = await get(assignmentsRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      
      // Extract keys, course objects, and topic names for each topic
      const topicsWithCourses: {[key: string]: {course: any, name?: string}} = {};
      
      Object.keys(data).forEach(topicKey => {
        const topicData = data[topicKey];
        topicsWithCourses[topicKey] = {
          course: topicData.course || null,
          name: topicData.name || topicKey
        };
      });
      
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
    
    const filteredAssignments = Object.entries(assignments)
      .map(([id, data]) => {
        return { id, data: data as Assignment };
      })
      .filter(item => item.data.selectedAssignmentCategory === 'WeeklyTest');
    
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

// Fetch all students from database
export const fetchAllStudents = async (): Promise<Array<{name: string, studentId: string}>> => {
  try {
    const studentsRef = ref(database, 'students');
    const snapshot = await get(studentsRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      const studentsList: Array<{name: string, studentId: string}> = [];
      
      Object.keys(data).forEach(studentName => {
        const studentData = data[studentName];
        studentsList.push({
          name: studentName,
          studentId: studentData.studentId || studentData.id || ''
        });
      });
      
      // Sort by name
      studentsList.sort((a, b) => a.name.localeCompare(b.name));
      return studentsList;
    }
    return [];
  } catch (error) {
    console.error('Error fetching students:', error);
    return [];
  }
};

// Fetch all assignments (not just WeeklyTest)
export const fetchAllAssignments = async (topic: string): Promise<{ id: string; data: Assignment }[]> => {
  try {
    const assignmentRef = ref(database, `assignments/topics/${topic}/assignment`);
    const snapshot = await get(assignmentRef);
    
    if (snapshot.exists()) {
      const assignments = snapshot.val();
      const allAssignments = Object.entries(assignments)
        .map(([id, data]) => {
          return { id, data: data as Assignment };
        });
      
      return allAssignments;
    }
    return [];
  } catch (error) {
    console.error('Error fetching all assignments:', error);
    return [];
  }
};

// Fetch classes from Firestore
export const fetchClassesFromFirestore = async (
  topic: string,
  fromDate: Date,
  toDate: Date
): Promise<any[]> => {
  try {
    const classesRef = collection(firestore, 'Classes');
    const fromTimestamp = Timestamp.fromDate(fromDate);
    const toTimestamp = Timestamp.fromDate(toDate);
    
    const q = query(
      classesRef,
      where('topic', '==', topic),
      where('creationDate', '>=', fromTimestamp),
      where('creationDate', '<=', toTimestamp),
      orderBy('creationDate', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const classes: any[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      classes.push({
        id: doc.id,
        ...data,
        creationDate: data.creationDate?.toDate() || null
      });
    });
    
    return classes;
  } catch (error) {
    console.error('Error fetching classes from Firestore:', error);
    return [];
  }
};

// Fetch assignment student data from assignmentStudents path
// Tries both studentId and studentName
export const fetchAssignmentStudentData = async (
  topic: string,
  assignmentTitle: string,
  studentId: string,
  studentName?: string
): Promise<any> => {
  try {
    // First try with studentId
    let studentRef = ref(database, `assignmentStudents/${topic}/${assignmentTitle}/students/${studentId}`);
    let snapshot = await get(studentRef);
    
    if (snapshot.exists()) {
      return snapshot.val();
    }
    
    // If not found and studentName is provided, try with studentName
    if (studentName && studentName !== studentId) {
      studentRef = ref(database, `assignmentStudents/${topic}/${assignmentTitle}/students/${studentName}`);
      snapshot = await get(studentRef);
      
      if (snapshot.exists()) {
        return snapshot.val();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching assignment student data:', error);
    return null;
  }
};

// Fetch student's topics by checking topics/{topic}/students/{studentName}
// Optimized: Fetch all topics first, then check in parallel
export const fetchStudentTopics = async (studentName: string): Promise<string[]> => {
  try {
    // First get all topics
    const topicsRef = ref(database, 'topics');
    const topicsSnapshot = await get(topicsRef);
    
    if (!topicsSnapshot.exists()) {
      return [];
    }
    
    const allTopics = topicsSnapshot.val();
    const topicIds = Object.keys(allTopics);
    
    // Check all topics in parallel (larger batch size for better performance)
    const batchSize = 20;
    const studentTopics: string[] = [];
    
    for (let i = 0; i < topicIds.length; i += batchSize) {
      const batch = topicIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (topicId) => {
        try {
          const studentInTopicRef = ref(database, `topics/${topicId}/students/${studentName}`);
          const studentSnapshot = await get(studentInTopicRef);
          
          if (studentSnapshot.exists()) {
            return topicId;
          }
          return null;
        } catch (error) {
          // Silently skip errors for faster processing
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      studentTopics.push(...batchResults.filter((id): id is string => id !== null));
    }
    
    return studentTopics;
  } catch (error) {
    console.error('Error fetching student topics:', error);
    return [];
  }
};
