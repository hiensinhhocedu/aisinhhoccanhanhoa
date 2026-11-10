import React, { useState } from 'react';
import { User, UserLevel, UserRole } from '../types';
import { calculateLevel, GOOGLE_SCRIPT_URL, getGoogleSheetUrl, setGoogleSheetUrl, DEFAULT_GOOGLE_SHEET_URL, formatExamDisplayId } from '../services/dataService';
import { generateExportCode } from '../services/geminiService';
import { GoogleAppsScriptModal } from '../components/GoogleAppsScriptModal';
import { StudentHistoryCenter } from '../components/StudentHistoryCenter';

interface ProfileViewProps {
  user: User;
  onOpenLogin?: () => void;
  onNavigateToTest?: () => void;
  onNavigateToPersonalized?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onOpenLogin,
  onNavigateToTest,
  onNavigateToPersonalized
}) => {
  // Admin Export Code State
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportType, setExportType] = useState<'THEME' | 'PAGE' | null>(null);

  // Admin Google Sheet Management State
  const [sheetUrl, setSheetUrl] = useState(() => getGoogleSheetUrl());
  const [isEditingSheetUrl, setIsEditingSheetUrl] = useState(false);
  const [tempSheetUrl, setTempSheetUrl] = useState('');
  const [sheetSaveToast, setSheetSaveToast] = useState<string | null>(null);
  const [showAppsScriptModal, setShowAppsScriptModal] = useState(false);

  // Student History States
  const [searchHistoryTerm, setSearchHistoryTerm] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'HIGH' | 'PASS' | 'LOW'>('ALL');
  const [expandedExamIndex, setExpandedExamIndex] = useState<number | null>(null);

  // --- ADMIN VIEW: System Configuration & Maintenance ---
  if (user.role === UserRole.ADMIN) {
    const handleClearCache = () => {
      if (confirm('Hành động này sẽ xóa toàn bộ dữ liệu lưu tạm trên trình duyệt (bao gồm phiên đăng nhập). Bạn có chắc chắn?')) {
        localStorage.clear();
        window.location.reload();
      }
    };

    const handleOpenEditSheetUrl = () => {
      setTempSheetUrl(sheetUrl);
      setIsEditingSheetUrl(true);
    };

    const handleSaveSheetUrl = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmed = tempSheetUrl.trim();
      if (!trimmed.startsWith('http')) {
        alert('Vui lòng nhập đường link Google Sheet hợp lệ (bắt đầu bằng https://docs.google.com/...)');
        return;
      }
      const updated = setGoogleSheetUrl(trimmed);
      setSheetUrl(updated);
      setIsEditingSheetUrl(false);
      setSheetSaveToast('✅ Đã cập nhật thành công liên kết Quản lý Google Sheet!');
      setTimeout(() => setSheetSaveToast(null), 4000);
    };

    const handleResetDefaultSheetUrl = () => {
      const updated = setGoogleSheetUrl('');
      setSheetUrl(updated);
      setTempSheetUrl(updated);
      setIsEditingSheetUrl(false);
      setSheetSaveToast('🔄 Đã khôi phục liên kết Google Sheet về mặc định.');
      setTimeout(() => setSheetSaveToast(null), 4000);
    };

    const handleGenerateCode = async (type: 'THEME' | 'PAGE') => {
        setIsGenerating(true);
        setExportType(type);
        setGeneratedCode(''); // Clear old code
        try {
            const code = await generateExportCode(type);
            setGeneratedCode(code);
        } catch (e) {
            alert("Lỗi khi tạo mã");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopyCode = () => {
        if (!generatedCode) return;
        navigator.clipboard.writeText(generatedCode);
        alert("Đã sao chép mã vào bộ nhớ tạm!");
    };

    const handleDownloadCode = () => {
        if (!generatedCode) return;
        const blob = new Blob([generatedCode], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = exportType === 'THEME' ? "template_lms_blog.xml" : "widget_trac_nghiem.html";
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Admin Identity Card */}
        <div className="bg-white rounded-2xl shadow-sm p-8 flex flex-col md:flex-row items-center gap-6 border-l-4 border-red-600">
          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center text-4xl shadow-inner shrink-0">
            🛡️
          </div>
          <div className="text-center md:text-left flex-1">
            <h2 className="text-2xl font-bold text-gray-800">{user.name}</h2>
            <p className="text-gray-500 font-medium mb-2">Quản Trị Viên Hệ Thống</p>
            <span className="inline-block px-3 py-1 bg-red-600 text-white text-xs font-bold rounded uppercase tracking-wider">
              Super Admin
            </span>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-sm text-gray-400">Phiên bản hệ thống</p>
            <p className="font-mono font-bold text-gray-600">v1.3.0 (Flash 3.0 Optimized)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* System Status */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
              <span>📡</span> Trạng thái kết nối
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Máy chủ dữ liệu (Google Apps Script)</p>
                <div className="flex items-center gap-2 bg-green-50 p-3 rounded border border-green-200">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-green-700 font-mono text-xs truncate w-full">
                    {GOOGLE_SCRIPT_URL.substring(0, 45)}...
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Dịch vụ AI (Gemini)</p>
                <div className="flex items-center gap-2 bg-blue-50 p-3 rounded border border-blue-200">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                  <span className="text-blue-700 font-medium text-sm">Đang hoạt động (Flash 3.0)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Database & Maintenance Tools */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><span>🛠️</span> Quản trị & Cơ sở dữ liệu</span>
              <button 
                onClick={handleOpenEditSheetUrl}
                className="text-xs text-bio-600 hover:text-bio-700 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>✏️ Đổi Link Sheet</span>
              </button>
            </h3>

            {sheetSaveToast && (
              <div className="mb-3 p-2.5 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg animate-fade-in flex items-center gap-2">
                <span>{sheetSaveToast}</span>
              </div>
            )}

            {isEditingSheetUrl ? (
              <div className="mb-4 p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800">Cập nhật Link Quản lý Google Sheet:</span>
                  <button 
                    onClick={() => setIsEditingSheetUrl(false)} 
                    className="text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕ Đóng
                  </button>
                </div>
                <input 
                  type="text" 
                  value={tempSheetUrl}
                  onChange={(e) => setTempSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="w-full text-xs p-2.5 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-mono"
                />
                <p className="text-[11px] text-gray-500 leading-tight">
                  💡 Mẹo: Mở file Google Sheets chứa 5 Sheet (<span className="font-semibold text-emerald-700">01_HOC_SINH, 02_KET_QUA_THI, 03_LO_HONG, 04_CA_NHAN_HOA, 05_DASHBOARD</span>), sao chép toàn bộ thanh địa chỉ trình duyệt và dán vào đây.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button 
                    onClick={handleSaveSheetUrl}
                    className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
                  >
                    💾 Lưu liên kết
                  </button>
                  <button 
                    onClick={handleResetDefaultSheetUrl}
                    className="py-1.5 px-2.5 bg-white hover:bg-gray-100 text-gray-600 border border-gray-300 text-xs rounded-lg transition"
                    title="Khôi phục link ban đầu"
                  >
                    🔄 Mặc định
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {/* Google Sheet Link - User Configured */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    <div>
                      <span className="font-bold text-emerald-900 text-sm block">Quản lý Google Sheet</span>
                      <span className="text-[11px] text-emerald-700">Chứa 6 Sheet: 01_HOC_SINH, 02_KET_QUA_THI, 03_LO_HONG, 04_CA_NHAN_HOA, 05_DASHBOARD, 06_DE_THI</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleOpenEditSheetUrl}
                    className="p-1.5 text-xs text-emerald-700 hover:bg-emerald-100 rounded-md transition"
                    title="Chỉnh sửa liên kết Google Sheet"
                  >
                    ✏️
                  </button>
                </div>

                <div className="flex gap-2">
                  <a 
                    href={sheetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition no-underline"
                  >
                    <span>Mở Google Sheet Quản Lý</span>
                    <span className="text-sm">↗️</span>
                  </a>
                </div>
              </div>

              {/* Google Apps Script Fix & Source Code Button */}
              <button 
                type="button"
                onClick={() => setShowAppsScriptModal(true)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-emerald-300 text-emerald-900 transition font-bold text-xs cursor-pointer shadow-sm text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">📜</span>
                  <div>
                    <span className="block font-bold text-emerald-900 text-xs">Mã Nguồn Google Apps Script (Fix 05_DASHBOARD & 6 Sheet)</span>
                    <span className="text-[11px] text-emerald-700 font-normal">Tự động tính toán Sheet 05_DASHBOARD, lưu đề thi 06_DE_THI chuẩn</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shrink-0">
                  Xem & Copy
                </span>
              </button>

              <button 
                onClick={() => window.location.reload()}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 border border-gray-200 transition"
              >
                <span className="text-gray-700 font-medium text-sm">Làm mới ứng dụng (Reload)</span>
                <span className="text-lg">🔄</span>
              </button>
              
              <button 
                onClick={handleClearCache}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 transition"
              >
                <span className="font-bold text-sm">Xóa Cache & Đăng xuất</span>
                <span className="text-lg">🗑️</span>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              * Hệ thống đã được nâng cấp lên mô hình Flash 3.0 cho hiệu suất tối ưu.
            </p>
          </div>
        </div>

        {/* New Export Code Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
              <span>📤</span> Xuất Code (AI Generated)
            </h3>
            <p className="text-sm text-gray-500 mb-4">
                Sử dụng AI mô hình Flash 3.0 để tạo mã nguồn trang web hoặc widget tích hợp với tốc độ cực nhanh.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <button
                    onClick={() => handleGenerateCode('THEME')}
                    disabled={isGenerating}
                    className="p-4 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold flex flex-col items-center gap-2 transition disabled:opacity-50"
                >
                    <span className="text-2xl">🌐</span>
                    <span>Xuất HTML Blog (Theme)</span>
                    <span className="text-[10px] font-normal opacity-70 text-center">Tạo toàn bộ giao diện cho Blogspot</span>
                </button>
                <button
                    onClick={() => handleGenerateCode('PAGE')}
                    disabled={isGenerating}
                    className="p-4 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold flex flex-col items-center gap-2 transition disabled:opacity-50"
                >
                    <span className="text-2xl">🧩</span>
                    <span>Xuất HTML Trang Blog</span>
                    <span className="text-[10px] font-normal opacity-70 text-center">Tạo widget/đoạn mã nhúng cho bài viết</span>
                </button>
            </div>

            {isGenerating && (
                <div className="text-center py-8 text-gray-500 animate-pulse">
                    🤖 Flash 3.0 đang viết mã... vui lòng đợi...
                </div>
            )}

            {!isGenerating && generatedCode && (
                <div className="animate-fade-in space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-700">
                            Kết quả ({exportType === 'THEME' ? 'Blog Theme' : 'Page Snippet'}):
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleCopyCode}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-bold text-gray-700 border border-gray-300"
                            >
                                📋 Copy
                            </button>
                            <button 
                                onClick={handleDownloadCode}
                                className="px-3 py-1.5 bg-bio-600 hover:bg-bio-700 rounded text-xs font-bold text-white shadow"
                            >
                                ⬇️ Tải xuống (.txt)
                            </button>
                        </div>
                    </div>
                    <textarea 
                        className="w-full h-64 p-3 border border-gray-300 rounded-lg bg-gray-900 text-green-400 font-mono text-xs focus:ring-2 focus:ring-bio-500 outline-none"
                        value={generatedCode}
                        readOnly
                    />
                </div>
            )}
        </div>

        {/* Author Credit */}
        <div className="text-center py-8 opacity-70 hover:opacity-100 transition">
          <p className="text-sm text-gray-500">Hệ thống được phát triển và vận hành bởi</p>
          <p className="text-lg font-bold text-red-800 mt-1">Tác giả Nguyễn Hồng Hiển</p>
          <p className="text-xs text-gray-400 mt-2">© 2024 Sinh Học LMS. All rights reserved.</p>
        </div>

        <GoogleAppsScriptModal 
          isOpen={showAppsScriptModal} 
          onClose={() => setShowAppsScriptModal(false)} 
        />
      </div>
    );
  }

  // --- STUDENT VIEW (Lịch sử bài kiểm tra, Lịch sử rèn luyện, Chi tiết từng Attempt, Sự thay đổi năng lực theo thời gian) ---
  return (
    <StudentHistoryCenter
      user={user}
      onOpenLogin={onOpenLogin}
      onNavigateToTest={onNavigateToTest}
      onNavigateToPersonalized={onNavigateToPersonalized}
    />
  );
};