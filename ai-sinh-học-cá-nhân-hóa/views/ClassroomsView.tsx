import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { 
  SheetStudent, 
  ClassroomGroup, 
  fetchGoogleSheetStudents, 
  groupStudentsIntoClassrooms, 
  getGoogleSheetUrl,
  deleteStudentFromCloud,
  triggerCleanupDuplicatesAndOrphansCloud,
  updateStudentStatusCloud,
  updateClassroomStatusCloud,
  deleteClassroomStudentsCloud
} from '../services/dataService';
import { cleanStudentFullName } from './ReportView';
import { GoogleAppsScriptModal } from '../components/GoogleAppsScriptModal';

interface ClassroomsViewProps {
  user: User;
  onNavigateToTest?: () => void;
  onViewStudentPersonalized?: (student: SheetStudent) => void;
}

export const ClassroomsView: React.FC<ClassroomsViewProps> = ({ 
  user, 
  onNavigateToTest,
  onViewStudentPersonalized
}) => {
  const [students, setStudents] = useState<SheetStudent[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);
  const [actionStudentId, setActionStudentId] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Modals state
  const [selectedClassroom, setSelectedClassroom] = useState<ClassroomGroup | null>(null);
  const [selectedAnalyticsClass, setSelectedAnalyticsClass] = useState<ClassroomGroup | null>(null);
  const [selectedStudentExamModal, setSelectedStudentExamModal] = useState<SheetStudent | null>(null);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showAppsScriptModal, setShowAppsScriptModal] = useState<boolean>(false);

  const sheetUrl = getGoogleSheetUrl();

  const handleOpenStudentPersonalized = (st: SheetStudent) => {
    setSelectedClassroom(null);
    if (onViewStudentPersonalized) {
      onViewStudentPersonalized(st);
    }
  };

  const handleCleanupDuplicates = async () => {
    if (!window.confirm("Bắt đầu khử trùng lặp ID học sinh và dọn dẹp kết quả thi mồ côi trên Google Sheets?\n\n• Tự động re-index các ID bị trùng lặp sang mã mới độc nhất (ví dụ 10T756, 10T757...).\n• Cascade delete các kết quả thi, lỗ hổng kiến thức không còn học sinh tương ứng trong Sheet 01.")) {
      return;
    }
    setIsCleaning(true);
    try {
      const res = await triggerCleanupDuplicatesAndOrphansCloud();
      if (res.success) {
        showToast(`✨ ${res.message || 'Khử trùng lặp và dọn dẹp thành công!'}`);
      } else {
        const msg = res.message || '';
        if (msg.includes('Hành động không hợp lệ') || msg.includes('sync_cleanup') || !res.success) {
          alert('⚠️ MÁY CHỦ GOOGLE SHEET CẦN CẬP NHẬT CODE.GS MỚI:\n\nGoogle Apps Script trên Google Sheet của Thầy/Cô hiện chưa có hàm "sync_cleanup" khử trùng lặp.\n\nVui lòng bấm vào cửa sổ vừa mở để Sao chép toàn bộ Code.gs mới và Triển khai lại phiên bản mới (mất 30 giây).');
          setShowAppsScriptModal(true);
        } else {
          showToast(`⚠️ ${msg || 'Đã áp dụng khử trùng lặp và bảo vệ dữ liệu.'}`);
        }
      }
      await loadData(false);
    } catch (err: any) {
      showToast(`⚠️ Lỗi xử lý: ${err.message || 'Thất bại'}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDeleteStudent = async (st: SheetStudent) => {
    const confirmMsg = `Bạn có chắc chắn muốn xóa học sinh "${st.name}" (Mã: ${st.id})?\n\n⚠️ LƯU Ý QUAN TRỌNG:\nKhi xóa học sinh này, toàn bộ kết quả thi (Sheet 02), lỗ hổng kiến thức (Sheet 03) và kế hoạch học tập (Sheet 04) sẽ bị XÓA SẠCH (Cascade Delete) để đảm bảo không bị sai lệch hay trùng lặp dữ liệu sau này!`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingStudentId(st.id);
    try {
      const res = await deleteStudentFromCloud(st.id, st.phone, st.name);
      showToast(`🗑️ ${res.message || `Đã xóa học sinh ${st.name} và mọi kết quả liên quan!`}`);
      
      // Refresh list
      const updated = await fetchGoogleSheetStudents();
      setStudents(updated);
      const grouped = groupStudentsIntoClassrooms(updated);
      setClassrooms(grouped);
      if (selectedClassroom) {
        const updatedClass = grouped.find(c => c.className === selectedClassroom.className);
        setSelectedClassroom(updatedClass || null);
      }
    } catch (err: any) {
      showToast(`❌ Lỗi khi xóa học sinh: ${err.message || 'Thất bại'}`);
    } finally {
      setDeletingStudentId(null);
    }
  };

  // Khóa / Mở khóa hồ sơ học sinh đơn lẻ
  const handleToggleStudentStatus = async (st: SheetStudent) => {
    const rawSt = (st.status || 'Mở').toLowerCase();
    const isCurrentlyLocked = rawSt === 'khóa' || rawSt === 'khoa' || rawSt === 'đóng' || rawSt === 'dong';
    const newStatus: 'Mở' | 'Khóa' = isCurrentlyLocked ? 'Mở' : 'Khóa';

    if (newStatus === 'Khóa') {
      const ok = window.confirm(`Khóa hồ sơ học sinh "${st.name}" (Mã: ${st.id})?\n\nKhi khóa, học sinh sẽ không thể làm bài kiểm tra và mọi thông tin, điểm số sẽ KHÔNG được cập nhật lên hệ thống.`);
      if (!ok) return;
    }

    setActionStudentId(st.id);
    try {
      const res = await updateStudentStatusCloud(st.id, st.phone, newStatus);
      showToast(`🔐 ${res.message || `Đã chuyển trạng thái sang [${newStatus}]`}`);
      
      // Cập nhật giao diện tức thì
      setStudents(prev => prev.map(item => item.id === st.id ? { ...item, status: newStatus } : item));
      if (selectedClassroom) {
        setSelectedClassroom(prev => {
          if (!prev) return null;
          const updatedStudents = prev.students.map(item => item.id === st.id ? { ...item, status: newStatus } : item);
          const activeCount = updatedStudents.filter(s => {
            const stStr = (s.status || '').toLowerCase();
            return stStr !== 'đóng' && stStr !== 'dong' && stStr !== 'khóa' && stStr !== 'khoa';
          }).length;
          return {
            ...prev,
            students: updatedStudents,
            activeStudents: activeCount
          };
        });
      }
      // Nạp lại dữ liệu ngầm để đồng bộ toàn diện
      await loadData(false);
    } catch (err: any) {
      showToast(`❌ Lỗi cập nhật trạng thái: ${err.message || 'Thất bại'}`);
    } finally {
      setActionStudentId(null);
    }
  };

  // Khóa / Mở khóa toàn bộ hồ sơ học sinh theo lớp
  const handleToggleClassStatus = async (cls: ClassroomGroup) => {
    const allLocked = cls.students.length > 0 && cls.activeStudents === 0;
    const newStatus: 'Mở' | 'Khóa' = allLocked ? 'Mở' : 'Khóa';

    const confirmMsg = allLocked
      ? `Mở khóa toàn bộ hồ sơ cho ${cls.totalStudents} học sinh lớp ${cls.className}?\n\nSau khi mở khóa, các em có thể đăng nhập làm bài kiểm tra và cập nhật tiến trình học tập bình thường.`
      : `⚠️ KHÓA TOÀN BỘ HỒ SƠ LỚP ${cls.className} (${cls.totalStudents} học sinh)?\n\nKhi khóa hồ sơ theo lớp:\n• Toàn bộ học sinh trong lớp sẽ không được làm bài kiểm tra mới.\n• Mọi thông tin và điểm số bài thi của học sinh lớp này sẽ KHÔNG được cập nhật lên hệ thống cho đến khi được mở khóa.`;

    if (!window.confirm(confirmMsg)) return;

    setIsActionLoading(true);
    try {
      const res = await updateClassroomStatusCloud(cls.className, newStatus);
      showToast(`🔐 ${res.message || `Đã chuyển toàn bộ lớp ${cls.className} sang trạng thái [${newStatus}]`}`);
      await loadData(false);
      if (selectedClassroom && selectedClassroom.className === cls.className) {
        const updated = await fetchGoogleSheetStudents();
        const grouped = groupStudentsIntoClassrooms(updated);
        const curCls = grouped.find(c => c.className === cls.className);
        if (curCls) setSelectedClassroom(curCls);
      }
    } catch (err: any) {
      showToast(`❌ Lỗi khóa/mở lớp: ${err.message || 'Thất bại'}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Xóa toàn bộ học sinh của cả lớp (Cascade Delete theo lớp)
  const handleDeleteClassroom = async (cls: ClassroomGroup) => {
    const confirmMsg = `🚨 CẢNH BÁO NGUY HIỂM:\nBạn có chắc chắn muốn XÓA TOÀN BỘ ${cls.totalStudents} học sinh lớp ${cls.className} khỏi hệ thống?\n\nToàn bộ thông tin liên quan (kết quả làm bài thi ở Sheet 02, chuẩn đoán lỗ hổng ở Sheet 03, lộ trình cá nhân hóa ở Sheet 04) của học sinh lớp này sẽ bị XÓA SẠCH (Cascade Delete) để không bị tồn dư dữ liệu mồ côi!`;
    if (!window.confirm(confirmMsg)) return;

    const secondConfirm = window.prompt(`Để xác nhận xóa toàn bộ học sinh lớp ${cls.className}, vui lòng gõ đúng chữ: XOA LOP`);
    if (secondConfirm !== 'XOA LOP' && secondConfirm !== 'xoa lop') {
      showToast("Đã hủy thao tác xóa lớp.");
      return;
    }

    setIsActionLoading(true);
    try {
      const res = await deleteClassroomStudentsCloud(cls.className);
      showToast(`🗑️ ${res.message || `Đã xóa toàn bộ học sinh lớp ${cls.className} và toàn bộ kết quả thi liên quan!`}`);
      if (selectedClassroom && selectedClassroom.className === cls.className) {
        setSelectedClassroom(null);
      }
      await loadData(false);
    } catch (err: any) {
      showToast(`❌ Lỗi khi xóa lớp: ${err.message || 'Thất bại'}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const loadData = async (showNotification = false) => {
    setIsLoading(true);
    try {
      const fetchedStudents = await fetchGoogleSheetStudents();
      setStudents(fetchedStudents);
      const grouped = groupStudentsIntoClassrooms(fetchedStudents);
      setClassrooms(grouped);
      const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSyncTime(timeStr);
      if (showNotification) {
        showToast(`✅ Đã đồng bộ thành công ${fetchedStudents.length} học sinh từ Sheet 01_HOC_SINH!`);
      }
    } catch (e) {
      console.error("Lỗi tải danh sách lớp học:", e);
      if (showNotification) {
        showToast("⚠️ Chưa kết nối được Google Sheet trực tiếp, đang hiển thị bản lưu mới nhất.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const togglePassword = (studentId: string) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const handleCopyClassList = (cls: ClassroomGroup) => {
    const lines = [
      `DANH SÁCH LỚP: ${cls.className.toLowerCase().startsWith('lớp') ? cls.className : `Lớp ${cls.className}`} (${cls.grade} • 2026 – 2027)`,
      `Sĩ số: ${cls.totalStudents} học sinh`,
      `Thời điểm xuất: ${new Date().toLocaleString('vi-VN')}`,
      '--------------------------------------------------',
      'STT | Mã HS | Họ và Tên | SĐT | Trạng Thái',
      ...cls.students.map((st, idx) => 
        `${idx + 1}. [${st.id}] ${st.name} - ${st.phone} (${st.status || 'Mở'})`
      )
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    showToast(`📋 Đã sao chép danh sách lớp ${cls.className} vào bộ nhớ tạm!`);
  };

  const handleExportCSV = (cls: ClassroomGroup) => {
    const headers = ["STT", "ID_HocSinh", "Ho_Va_Ten", "Khoi_Lop", "So_Dien_Thoai", "Trang_Thai", "Tong_Diem", "Ngay_Dang_Ky"];
    const rows = cls.students.map((st, idx) => [
      idx + 1,
      `"${st.id}"`,
      `"${cleanStudentFullName(st.name, st.className)}"`,
      `"${st.className}"`,
      `"${st.phone}"`,
      `"${st.status || 'Mở'}"`,
      st.totalScore || 0,
      `"${st.registeredDate || ''}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Danh_Sach_Lop_${cls.className}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`📥 Đã tải file danh sách lớp ${cls.className}.csv`);
  };

  // Format Display Title: "Lớp 12T7" or "Lớp 10T6"
  const formatClassDisplayTitle = (rawName: string) => {
    const trimmed = (rawName || '').trim();
    if (trimmed.toLowerCase().startsWith('lớp ')) {
      return trimmed;
    }
    return `Lớp ${trimmed}`;
  };

  // Filter classrooms & students
  const filteredClassrooms = classrooms.filter(cls => {
    const matchGrade = selectedGradeFilter === 'ALL' || cls.grade === selectedGradeFilter;
    if (!matchGrade) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();

    // Check class name
    if (cls.className.toLowerCase().includes(term)) return true;

    // Check any student in class
    return cls.students.some(s => 
      s.name.toLowerCase().includes(term) ||
      s.phone.includes(term) ||
      s.id.toLowerCase().includes(term)
    );
  });

  const totalAllStudents = students.length;
  const totalActive = students.filter(s => {
    const st = (s.status || '').toLowerCase();
    return st !== 'đóng' && st !== 'dong' && st !== 'khóa' && st !== 'khoa';
  }).length;

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl 2xl:max-w-[1600px] mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 bg-emerald-700 text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce border border-emerald-500">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white hover:opacity-80 text-sm font-bold">✕</button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Grade tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-gray-100 rounded-xl">
          {['ALL', 'Khối 10', 'Khối 11', 'Khối 12'].map(grade => (
            <button
              key={grade}
              onClick={() => setSelectedGradeFilter(grade)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer uppercase ${
                selectedGradeFilter === grade 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              {grade === 'ALL' ? 'TẤT CẢ KHỐI' : grade.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Actions & Search */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên học sinh, lớp, SĐT..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50"
            />
            <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={isLoading || isCleaning}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm transition active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
            title="Đồng bộ dữ liệu mới nhất từ Google Sheet"
          >
            <span className={isLoading ? "animate-spin text-sm" : "text-sm"}>🔄</span>
            <span>{isLoading ? "Đang đồng bộ..." : "Đồng bộ từ Sheet"}</span>
          </button>

          <button
            onClick={handleCleanupDuplicates}
            disabled={isLoading || isCleaning}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl shadow-sm transition active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
            title="Khử trùng lặp ID học sinh và cascade delete các bài thi mồ côi trên Google Sheets"
          >
            <span className={isCleaning ? "animate-spin text-sm" : "text-sm"}>🧹</span>
            <span>{isCleaning ? "Đang khử trùng..." : "Khử trùng lặp & Dọn dẹp"}</span>
          </button>

          <button
            onClick={() => setShowAppsScriptModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition active:scale-95 shrink-0 cursor-pointer"
            title="Xem và sao chép mã Google Apps Script Code.gs mới nhất để sửa trùng ID"
          >
            <span>🛠️</span>
            <span>Cập nhật Code.gs</span>
          </button>

          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl border border-gray-200 transition shrink-0 no-underline cursor-pointer"
            title="Mở Google Sheet trên tab mới"
          >
            <span>📊 Mở Sheet 01</span>
            <span className="text-xs">↗️</span>
          </a>
        </div>
      </div>

      {/* Classrooms Grid (Mẫu thẻ chuẩn theo ảnh yêu cầu) */}
      {isLoading ? (
        <div className="bg-white p-16 rounded-3xl border border-gray-100 text-center shadow-sm">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600 font-semibold text-sm">Đang đồng bộ danh sách lớp và học sinh từ Google Sheet...</p>
        </div>
      ) : filteredClassrooms.length === 0 ? (
        <div className="bg-white p-16 rounded-3xl border border-gray-100 text-center shadow-sm">
          <span className="text-4xl mb-3 block">🔍</span>
          <h3 className="text-lg font-bold text-gray-800">Không tìm thấy lớp học nào</h3>
          <p className="text-gray-500 text-xs mt-1">Hãy thử xóa bộ lọc hoặc kiểm tra dữ liệu ở Sheet 01_HOC_SINH.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClassrooms.map((cls) => {
            const gradeText = cls.grade.toUpperCase();
            const classTitle = formatClassDisplayTitle(cls.className);

            return (
              <div 
                key={cls.className}
                className="bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-sm hover:shadow-md hover:border-indigo-300 transition duration-200 flex flex-col justify-between"
              >
                {/* Top Row: KHỐI (Purple) & 2026 - 2027 (Gray) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase">
                      {gradeText}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      2026 – 2027
                    </span>
                  </div>

                  {/* Title Row: Lớp 12T7 / Lớp 10T6 */}
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 tracking-tight">
                    {classTitle}
                  </h3>

                  {/* Sĩ số Row with User Group Icon */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>
                      Sĩ số: <strong className="font-bold text-gray-900">{cls.totalStudents}</strong> học sinh
                    </span>
                  </div>

                  {/* Status & Counts: Mở vs Khóa */}
                  <div className="flex items-center justify-between text-xs mb-3 px-3 py-2 bg-gray-50/80 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Mở: <b>{cls.activeStudents}</b>
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        Khóa: <b>{cls.totalStudents - cls.activeStudents}</b>
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">
                      {cls.students.length > 0 && cls.activeStudents === 0 ? '🔒 Đã khóa cả lớp' : '🟢 Đang mở'}
                    </span>
                  </div>

                  {/* Class Actions: Khóa/Mở lớp & Xóa lớp */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      onClick={() => handleToggleClassStatus(cls)}
                      disabled={isActionLoading}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer border ${
                        cls.students.length > 0 && cls.activeStudents === 0
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                      title={cls.students.length > 0 && cls.activeStudents === 0 ? "Mở khóa toàn bộ học sinh lớp này" : "Khóa toàn bộ học sinh lớp này (không được làm bài & cập nhật)"}
                    >
                      <span>{cls.students.length > 0 && cls.activeStudents === 0 ? '🔓 Mở cả lớp' : '🔒 Khóa cả lớp'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteClassroom(cls)}
                      disabled={isActionLoading}
                      className="py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer border bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                      title="Xóa toàn bộ học sinh lớp này và cascade delete toàn bộ bài thi liên quan"
                    >
                      <span>🗑️ Xóa cả lớp</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Row: 2 Buttons [Phân tích] and [Học sinh] (Chuẩn thiết kế ảnh mẫu) */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => setSelectedAnalyticsClass(cls)}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Phân tích</span>
                  </button>

                  <button 
                    onClick={() => setSelectedClassroom(cls)}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                    </svg>
                    <span>Học sinh</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Chi Tiết Học Sinh (Khi bấm nút "🎓 Học sinh") */}
      {selectedClassroom && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 bg-gradient-to-r from-indigo-800 via-indigo-900 to-purple-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <span className="p-2 sm:p-3 bg-white/20 rounded-2xl text-xl sm:text-2xl shrink-0">🎓</span>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-2xl font-black truncate">
                    Danh Sách Học Sinh: {formatClassDisplayTitle(selectedClassroom.className)}
                  </h3>
                  <p className="text-indigo-200 text-xs">
                    {selectedClassroom.grade} • Niên khóa 2026 – 2027 • Sĩ số: {selectedClassroom.totalStudents} học sinh
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => handleToggleClassStatus(selectedClassroom)}
                  disabled={isActionLoading}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-sm cursor-pointer ${
                    selectedClassroom.students.length > 0 && selectedClassroom.activeStudents === 0
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-white'
                  }`}
                  title={selectedClassroom.students.length > 0 && selectedClassroom.activeStudents === 0 ? "Mở khóa toàn bộ học sinh lớp này" : "Khóa toàn bộ học sinh lớp này (không được thi & cập nhật)"}
                >
                  <span>{selectedClassroom.students.length > 0 && selectedClassroom.activeStudents === 0 ? '🔓 Mở cả lớp' : '🔒 Khóa cả lớp'}</span>
                </button>

                <button
                  onClick={() => handleDeleteClassroom(selectedClassroom)}
                  disabled={isActionLoading}
                  className="px-2.5 sm:px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-sm cursor-pointer"
                  title="Xóa toàn bộ học sinh lớp này và cascade delete toàn bộ bài thi"
                >
                  <span>🗑️ Xóa lớp</span>
                </button>

                <button
                  onClick={() => handleCopyClassList(selectedClassroom)}
                  className="px-2.5 sm:px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Sao chép danh sách"
                >
                  <span>📋 Sao chép</span>
                </button>
                <button
                  onClick={() => handleExportCSV(selectedClassroom)}
                  className="px-2.5 sm:px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-sm cursor-pointer"
                  title="Tải file CSV"
                >
                  <span>📥 Xuất CSV</span>
                </button>
                <button
                  onClick={() => setSelectedClassroom(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm font-bold transition ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: Student Table */}
            <div className="p-3 sm:p-6 overflow-y-auto flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100/90 text-gray-700 font-bold border-b border-gray-200">
                      <th className="py-3.5 px-3 rounded-l-xl w-12 text-center">STT</th>
                      <th className="py-3.5 px-3">Họ và Tên</th>
                      <th className="py-3.5 px-3">Số điện thoại</th>
                      <th className="py-3.5 px-3 text-center">Trạng thái hồ sơ</th>
                      <th className="py-3.5 px-3 text-center">Số bài thi đã làm</th>
                      <th className="py-3.5 px-3 text-center">Hồ Sơ Năng Lực Số</th>
                      <th className="py-3.5 px-3 rounded-r-xl text-center w-36">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedClassroom.students.map((st, idx) => {
                      const examsCount = st.examsCompleted || (st.examHistory?.length || 0);
                      const stStatus = (st.status || 'Mở').toLowerCase();
                      const isStLocked = stStatus === 'khóa' || stStatus === 'khoa' || stStatus === 'đóng' || stStatus === 'dong';

                      return (
                        <tr key={`cls_st_${st.id || 'hs'}_${idx}`} className="hover:bg-indigo-50/40 transition">
                          <td className="py-4 px-3 text-gray-400 font-mono text-center font-bold">{idx + 1}</td>
                          <td className="py-4 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-sm">
                                {st.name.charAt(0) || '👤'}
                              </div>
                              <div>
                                <span className="font-bold text-gray-900 block text-sm">{st.name}</span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  Mã HS: {st.id} • Lớp {st.className}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-3 font-mono font-medium text-gray-700">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs font-semibold">
                              <span>📞</span> {st.phone}
                            </span>
                          </td>
                          <td className="py-4 px-3 text-center">
                            {isStLocked ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[11px]" title="Hồ sơ bị khóa: Không thể làm bài hoặc cập nhật điểm số">
                                <span>🔒</span> Đã khóa
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[11px]" title="Hồ sơ đang mở: Có thể làm bài thi và cập nhật">
                                <span>🟢</span> Đang mở
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-3 text-center">
                            {examsCount > 0 ? (
                              <button
                                onClick={() => setSelectedStudentExamModal(st)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full font-bold text-xs transition cursor-pointer active:scale-95"
                                title="Bấm để xem chi tiết các bài thi"
                              >
                                <span>📝</span> <b>{examsCount}</b> bài đã làm
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                                <span>⚪</span> 0 bài đã làm
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-3 text-center">
                            <button
                              onClick={() => handleOpenStudentPersonalized(st)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 cursor-pointer hover:shadow-lg"
                              title={`Liên kết đến Tiến Trình Học Tập của ${st.name}`}
                            >
                              <span>🎯 Tiến Trình Học Tập</span>
                              <span>→</span>
                            </button>
                          </td>
                          <td className="py-4 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleToggleStudentStatus(st)}
                                disabled={actionStudentId === st.id}
                                className={`p-1.5 px-2.5 rounded-lg transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1 border ${
                                  isStLocked
                                    ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 hover:border-emerald-300'
                                    : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200 hover:border-amber-300'
                                }`}
                                title={isStLocked ? "Mở khóa hồ sơ học sinh" : "Khóa hồ sơ (ngăn học sinh thi và cập nhật điểm số)"}
                              >
                                {actionStudentId === st.id ? (
                                  <span className="animate-spin text-xs">⏳</span>
                                ) : (
                                  <>
                                    <span>{isStLocked ? '🔓' : '🔒'}</span>
                                    <span>{isStLocked ? 'Mở' : 'Khóa'}</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => handleDeleteStudent(st)}
                                disabled={deletingStudentId === st.id}
                                className="p-1.5 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition cursor-pointer disabled:opacity-50 text-xs font-semibold inline-flex items-center gap-1 border border-rose-200 hover:border-rose-300"
                                title={`Xóa học sinh ${st.name} (Mã: ${st.id}) và xóa sạch các bài thi liên quan khỏi Sheets`}
                              >
                                {deletingStudentId === st.id ? (
                                  <span className="animate-spin text-xs">⏳</span>
                                ) : (
                                  <>
                                    <span>🗑️</span>
                                    <span>Xóa</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>💡 Dữ liệu học sinh và kết quả thi được liên kết tự động từ Google Sheet (Sheet 01 và Sheet 02).</span>
              <button
                onClick={() => setSelectedClassroom(null)}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1.1: Chi Tiết Lịch Sử Bài Thi Của Học Sinh */}
      {selectedStudentExamModal && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-scale-up">
            <div className="p-5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
              <div>
                <h4 className="font-black text-lg">Lịch Sử Bài Thi: {selectedStudentExamModal.name}</h4>
                <p className="text-emerald-100 text-xs">
                  Mã HS: {selectedStudentExamModal.id} • SĐT: {selectedStudentExamModal.phone}
                </p>
              </div>
              <button
                onClick={() => setSelectedStudentExamModal(null)}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-xs font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 max-h-80 overflow-y-auto space-y-2.5">
              {(!selectedStudentExamModal.examHistory || selectedStudentExamModal.examHistory.length === 0) ? (
                <div className="text-center py-6 text-gray-400 text-xs italic">
                  Chưa có lịch sử làm bài kiểm tra.
                </div>
              ) : (
                selectedStudentExamModal.examHistory.map((ex: any, idx: number) => (
                  <div key={`modal_ex_${ex.turnId || 'att'}_${idx}`} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-gray-900 block">{ex.examTitle || 'Bài kiểm tra Sinh học'}</span>
                      <span className="text-[10px] text-gray-400">
                        {ex.submittedAt || ex.date ? new Date(ex.submittedAt || ex.date).toLocaleDateString('vi-VN') : 'Mới hoàn thành'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-600 block">{ex.score} điểm</span>
                      <span className="text-[10px] text-gray-500">
                        Đúng {ex.correctCount || Math.round(ex.score)}/{ex.totalQuestions || 10} câu
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedStudentExamModal(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Phân Tích Lớp Học (Khi bấm nút "📊 Phân tích") */}
      {selectedAnalyticsClass && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
                <span className="p-2 sm:p-3 bg-white/20 rounded-2xl text-xl sm:text-2xl shrink-0">📊</span>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-2xl font-black truncate">
                    Báo Cáo Phân Tích: {formatClassDisplayTitle(selectedAnalyticsClass.className)}
                  </h3>
                  <p className="text-blue-100 text-xs truncate">
                    {selectedAnalyticsClass.grade} • Niên khóa 2026 – 2027 • Tổng điểm tích lũy: {selectedAnalyticsClass.totalScore} điểm
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedAnalyticsClass(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm font-bold transition cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Analytics Overview */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 text-center">
                  <span className="text-[11px] font-bold text-indigo-700 uppercase block mb-1">Sĩ Số Lớp</span>
                  <div className="text-2xl font-black text-indigo-950">{selectedAnalyticsClass.totalStudents} <span className="text-xs font-normal text-gray-500">học sinh</span></div>
                  <span className="text-[10px] text-indigo-600 mt-1 block">100% kết nối LMS</span>
                </div>

                <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100 text-center">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase block mb-1">Tài Khoản Mở</span>
                  <div className="text-2xl font-black text-emerald-950">{selectedAnalyticsClass.activeStudents} <span className="text-xs font-normal text-gray-500">em</span></div>
                  <span className="text-[10px] text-emerald-600 mt-1 block">Sẵn sàng làm bài</span>
                </div>

                <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-100 text-center">
                  <span className="text-[11px] font-bold text-amber-700 uppercase block mb-1">Điểm Tích Lũy</span>
                  <div className="text-2xl font-black text-amber-950">{selectedAnalyticsClass.totalScore} <span className="text-xs font-normal text-gray-500">điểm</span></div>
                  <span className="text-[10px] text-amber-600 mt-1 block">Xếp hạng toàn khối</span>
                </div>
              </div>

              {/* Members Performance Preview */}
              <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200/80">
                <h4 className="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2">
                  <span>📈</span> Thống kê tiến độ từng học sinh trong lớp:
                </h4>
                <div className="space-y-2">
                  {selectedAnalyticsClass.students.map((st, i) => (
                    <div key={`analytics_st_${st.id || 'hs'}_${i}`} className="bg-white p-3 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                          {i + 1}
                        </span>
                        <div>
                          <span className="font-bold text-gray-900 block">{st.name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">Mã: {st.id} • SĐT: {st.phone}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-black text-amber-600 text-sm block">{st.totalScore || 0} điểm</span>
                        <span className="text-[10px] text-emerald-600 font-medium">Đã sẵn sàng thi</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Teaching Suggestion */}
              <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-100 text-xs text-blue-900 leading-relaxed flex items-start gap-3">
                <span className="text-xl">💡</span>
                <div>
                  <strong className="font-bold block mb-0.5">Khuyến nghị sư phạm cho {formatClassDisplayTitle(selectedAnalyticsClass.className)}:</strong>
                  Thầy/Cô có thể tạo đề kiểm tra chuyên đề hoặc giao bài rèn luyện thích ứng theo chuẩn GDPT 2018 cho lớp tại mục <b>Kiểm Tra, Đánh Giá</b>. Kết quả thi sẽ tự động ghi nhận vào Sheet <b>02_KET_QUA_THI</b>.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              {onNavigateToTest ? (
                <button
                  onClick={() => {
                    setSelectedAnalyticsClass(null);
                    onNavigateToTest();
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>📝 Giao đề kiểm tra cho lớp</span>
                  <span>→</span>
                </button>
              ) : <div />}

              <button
                onClick={() => setSelectedAnalyticsClass(null)}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Apps Script Modal */}
      <GoogleAppsScriptModal 
        isOpen={showAppsScriptModal} 
        onClose={() => setShowAppsScriptModal(false)} 
        defaultTab="full" 
      />
    </div>
  );
};
