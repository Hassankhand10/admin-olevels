import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, BarChart } from 'lucide-react';
import OLevelsLogo from '../assets/OLevels-logo-color.png';

interface CardData {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  onClick: () => void;
  isMain?: boolean;
}

export const HomePage = () => {
  const navigate = useNavigate();

  const cards: CardData[] = [
    {
      id: 'weekly-test',
      title: 'WEEKLY TEST',
      icon: FileText,
      description: 'Manage weekly tests and student submissions',
      onClick: () => navigate('/dashboard/weekly-test'),
      isMain: true
    },
    {
      id: 'student-performance-report',
      title: 'STUDENT PERFORMANCE REPORT',
      icon: BarChart,
      description: 'View and analyze student performance reports',
      onClick: () => navigate('/dashboard/student-performance-report'),
      isMain: true
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md shadow-2xl border-b-4 border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            {/* Left Side - Logo */}
            <div className="bg-gradient-to-br from-white to-gray-50 p-4 rounded-2xl shadow-xl border border-gray-200/50 hover:shadow-2xl transition-all duration-300">
              <img src={OLevelsLogo} alt="O-Levels Logo" className="h-12 w-auto" />
            </div>

            {/* Center - Title */}
            <div className="text-center">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent tracking-tight">Admin Portal</h1>
              <p className="text-sm text-gray-600 mt-1">Management Dashboard</p>
            </div>

            {/* Right Side - Admin Portal */}
            <div className="text-right bg-gradient-to-r from-gray-50 to-white p-4 rounded-xl border border-gray-200/50 shadow-lg">
              <p className="text-sm text-gray-600 font-medium">Admin Portal</p>
              <p className="text-sm font-semibold text-gray-800">Management System</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {cards.map((card) => {
            const IconComponent = card.icon;
            return (
              <div
                key={card.id}
                onClick={card.onClick}
                className="group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden border-2 border-gray-200 hover:border-[#b30104]/30 hover:scale-102 w-full h-64"
              >
                {/* Card Content */}
                <div className="p-12 text-center">
                  {/* Icon */}
                  <div className="mx-auto mb-6 flex items-center justify-center">
                    <IconComponent className="w-14 h-14 text-[#b30104] group-hover:text-[#7a0103] transition-colors duration-300" />
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-bold mb-2 text-gray-700 group-hover:text-[#b30104] transition-colors duration-300">
                    {card.title}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {/* Hover Effect Border */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent to-transparent group-hover:from-[#b30104] group-hover:to-[#7a0103] transition-all duration-300"></div>
              </div>
            );
          })}
        </div>

        {/* Quick Stats */}
        {/* <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 text-center hover:shadow-2xl transition-all duration-300">
            <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-4 rounded-2xl w-16 h-16 mx-auto mb-4 flex items-center justify-center shadow-lg">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Active Systems</h3>
            <p className="text-3xl font-bold text-green-600 mb-1">12</p>
            <p className="text-sm text-gray-500">All systems operational</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 text-center hover:shadow-2xl transition-all duration-300">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-2xl w-16 h-16 mx-auto mb-4 flex items-center justify-center shadow-lg">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Total Students</h3>
            <p className="text-3xl font-bold text-blue-600 mb-1">1,247</p>
            <p className="text-sm text-gray-500">Across all topics</p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100/50 p-8 text-center hover:shadow-2xl transition-all duration-300">
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 rounded-2xl w-16 h-16 mx-auto mb-4 flex items-center justify-center shadow-lg">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Weekly Tests</h3>
            <p className="text-3xl font-bold text-purple-600 mb-1">48</p>
            <p className="text-sm text-gray-500">This semester</p>
          </div>
        </div> */}
      </main>
    </div>
  );
};
