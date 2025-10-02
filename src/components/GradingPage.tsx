import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Download, Play } from 'lucide-react';
import { updateStudentGrade } from '../services/firebaseService';
import toast, { Toaster } from 'react-hot-toast';

export const GradingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { studentName, studentData, assignmentTitle, topic } = location.state || {};

  const [marks, setMarks] = useState<string>(studentData?.marks?.toString() || '');
  const [feedback, setFeedback] = useState<string>(studentData?.feedback || '');
  const [supervisionApproval, setSupervisionApproval] = useState<string>(studentData?.supervisionApproval || 'pending');
  const [saving, setSaving] = useState(false);

  if (!studentName || !studentData || !assignmentTitle || !topic) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Invalid Access</h1>
          <button
            onClick={() => navigate('/dashboard/weekly-test')}
            className="bg-gradient-to-r from-[#b30104] to-[#7a0103] text-white px-6 py-3 rounded-lg font-semibold hover:scale-105 transition-all duration-200"
          >
            Go Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleSaveChanges = async () => {
    if (!marks || isNaN(Number(marks))) {
      toast.error('Please enter valid marks');
      return;
    }

    setSaving(true);
    try {
      await updateStudentGrade(topic, assignmentTitle, studentName, Number(marks), feedback);
      toast.success('Changes saved successfully!');
    } catch (error) {
      console.error('Error saving changes:', error);
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadFile = () => {
    if (studentData.attachments && studentData.attachments.length > 0) {
      window.open(studentData.attachments[0].url, '_blank');
    }
  };

  const handlePlayVideo = () => {
    if (studentData.supervisionVideoUrl) {
      window.open(studentData.supervisionVideoUrl, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Toaster />
      
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard/weekly-test')}
                className="flex items-center gap-2 text-gray-600 hover:text-[#b30104] transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Back to Dashboard</span>
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-xl font-bold text-gray-800">Student Grading</h1>
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-medium">Assignment:</span> {assignmentTitle}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column - Student Info & Video */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Student Info */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">Student Information</h2>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  studentData.graded 
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : studentData.submission 
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : 'bg-red-100 text-red-800 border border-red-200'
                }`}>
                  {studentData.graded ? 'Graded' : studentData.submission ? 'Submitted' : 'Pending'}
                </span>
              </div>
              
              <div className="space-y-3">
                <div>
                  <span className="font-semibold text-gray-700">Student Name:</span>
                  <span className="ml-2 text-gray-800">{studentName}</span>
                </div>
                
                {studentData.message && (
                  <div>
                    <span className="font-semibold text-gray-700">Message:</span>
                    <p className="ml-2 text-gray-800 mt-1 p-3 bg-gray-50 rounded-lg">{studentData.message}</p>
                  </div>
                )}
                
                {studentData.submissionTime && (
                  <div>
                    <span className="font-semibold text-gray-700">Submission Time:</span>
                    <span className="ml-2 text-gray-800">{studentData.submissionTime}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Parent's Verification Video */}
            {studentData.supervisionVideoUrl && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-red-100 p-2 rounded-lg">
                    <Play className="w-5 h-5 text-red-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800">Parent's Verification Video</h3>
                </div>
                
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  <div className="aspect-video bg-gray-800 flex items-center justify-center">
                    <button
                      onClick={handlePlayVideo}
                      className="flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                      <Play className="w-5 h-5" />
                      Play Video
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Supervision Approval */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Supervision Approval</h3>
              <select
                value={supervisionApproval}
                onChange={(e) => setSupervisionApproval(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-sm"
              >
                <option value="pending">Select Status</option>
                <option value="approved">Approved</option>
                <option value="failed">Failed</option>
                <option value="ai_suspected">AI Suspected</option>
              </select>
            </div>

            {/* Attached File */}
            {studentData.attachments && studentData.attachments.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Attached File</h3>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm text-gray-700 font-medium">
                      {studentData.attachments[0].name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadFile}
                      className="text-red-600 hover:text-red-800 font-medium text-sm transition-colors"
                    >
                      Download
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Right Column - Grading */}
          <div className="space-y-6">
            
            {/* Marks Input */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Marks</h3>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none text-lg font-semibold"
                  placeholder="Enter marks"
                />
                <span className="text-gray-500 font-medium">/115</span>
              </div>
            </div>

            {/* Feedback Input */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Feedback</h3>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#b30104] focus:border-transparent outline-none resize-none text-sm"
                placeholder="Enter your feedback here..."
              />
              <div className="mt-2 flex items-center gap-2">
                <button className="text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                </button>
                <span className="text-xs text-gray-500">Voice feedback</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <div className="space-y-3">
                <button
                  onClick={handleSaveChanges}
                  disabled={saving}
                  className="w-full bg-gradient-to-r from-[#b30104] to-[#7a0103] hover:from-[#7a0103] hover:to-[#b30104] text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>

                <button
                  onClick={() => navigate('/dashboard/weekly-test')}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Dashboard
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
