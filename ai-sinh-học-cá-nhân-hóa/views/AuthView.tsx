
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { 
  GOOGLE_SCRIPT_URL,
  getStoredUserByPhone,
  saveStoredUser,
  mergeExamHistories,
  fetchGoogleSheetExamResults,
  fetchGoogleSheetStudents,
  getStudentGrade,
  getExamGrade,
  filterExamHistoryByStudentGrade,
  generateUniqueStudentId
} from '../services/dataService';
import { GoogleAppsScriptModal } from '../components/GoogleAppsScriptModal';

interface AuthViewProps {
  onLoginSuccess: (user: User) => void;
  onLoginLater?: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const AuthView: React.FC<AuthViewProps> = ({ onLoginSuccess, onLoginLater, onClose, isModal = false }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  // Feedback State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  
  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [showAppsScriptModal, setShowAppsScriptModal] = useState(false);

  const handleSkipLogin = () => {
    if (onLoginLater) {
      onLoginLater();
    } else {
      const guestUser: User = {
        phone: 'guest',
        name: 'Khách',
        className: 'Khách trải nghiệm',
        role: UserRole.STUDENT,
        totalScore: 0,
        examHistory: [],
        isGuest: true
      };
      onLoginSuccess(guestUser);
    }
  };

  // Clear messages when switching tabs
  useEffect(() => {
    setError(null);
    setSuccess(null);
    setShowPassword(false);
  }, [isLogin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    // Validation
    if (!phone.trim()) { setError('Vui lòng nhập số điện thoại'); return; }
    if (!password.trim()) { setError('Vui lòng nhập mật khẩu'); return; }

    // 1. Check Admin (Admin 1: 0966000224, mật khẩu $Hongphat2022 | Admin 2: 0912345678, mật khẩu @123abc)
    const normalizedPhone = phone.trim().replace(/^0+/, '');
    const isAdmin1 = phone.trim() === '0966000224' || normalizedPhone === '966000224';
    const isAdmin2 = phone.trim() === '0912345678' || normalizedPhone === '912345678';

    if (isAdmin1) {
      if (password === '$Hongphat2022') {
        const adminUser: User = {
          phone: '0966000224',
          name: 'Admin Giáo Viên',
          className: 'Giáo Viên Bộ Môn',
          role: UserRole.ADMIN,
          totalScore: 9999,
          examHistory: []
        };
        onLoginSuccess(adminUser);
        return;
      } else {
        setError('Mật khẩu quản trị viên không chính xác.');
        return;
      }
    }

    if (isAdmin2) {
      if (password === '@123abc') {
        const adminUser: User = {
          phone: '0912345678',
          name: 'Admin Giáo Viên 2',
          className: 'Giáo Viên Bộ Môn',
          role: UserRole.ADMIN,
          totalScore: 9999,
          examHistory: []
        };
        onLoginSuccess(adminUser);
        return;
      } else {
        setError('Mật khẩu quản trị viên không chính xác.');
        return;
      }
    }

    // 2. Check Google Sheet for Students
    if (!GOOGLE_SCRIPT_URL.includes('http')) {
      setError('Lỗi cấu hình hệ thống: URL máy chủ không hợp lệ.');
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = phone.trim();
      // Add timestamp to avoid caching login result
      let response = await fetch(`${GOOGLE_SCRIPT_URL}?action=login&phone=${encodeURIComponent(cleanPhone)}&password=${encodeURIComponent(password)}&_t=${Date.now()}`);
      
      if (!response.ok) throw new Error('Network response was not ok');
      let data = await response.json();

      // Nếu không khớp và số điện thoại bắt đầu bằng 0, có thể Google Sheet tự động ép kiểu thành số nguyên mất số 0 đầu
      if (!data.success && cleanPhone.startsWith('0')) {
        const noZeroPhone = cleanPhone.replace(/^0+/, '');
        try {
          const retryRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=login&phone=${encodeURIComponent(noZeroPhone)}&password=${encodeURIComponent(password)}&_t=${Date.now()}`);
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            if (retryData.success || (retryData.message && retryData.message.includes('ĐÓNG'))) {
              data = retryData;
            }
          }
        } catch {
          // ignore retry failure
        }
      }

      if (data.success) {
        const rawStatus = (data.user.Trang_Thai || data.user.TrangThai || data.user.status || 'Mở').toString().trim();
        const userStatus = rawStatus.toLowerCase();
        if (userStatus === 'đóng' || userStatus === 'dong' || userStatus === 'lock' || userStatus === 'locked' || userStatus === 'close' || userStatus === 'closed') {
          setError('⚠️ Tài khoản của bạn hiện đang ở trạng thái [Đóng] (chờ duyệt). Vui lòng liên hệ Thầy/Cô quản trị để duyệt mở tài khoản.');
          setIsLoading(false);
          return;
        }

        const userPhone = data.user.So_Dien_Thoai || data.user.phone || data.user.SoDienThoai || cleanPhone;
        const localExisting = getStoredUserByPhone(userPhone) || getStoredUserByPhone(cleanPhone);
        const guestUser = getStoredUserByPhone('guest');
        const serverHistory = Array.isArray(data.user.examHistory) ? data.user.examHistory : [];

        const studentId = data.user.ID_HocSinh || data.user.studentId || data.user.StudentID;
        const studentName = data.user.Ho_Va_Ten || data.user.name || data.user.HoTen;
        const studentClassName = data.user.Khoi_Lop || data.user.className || data.user.LopHoc || '';
        const studentGrade = getStudentGrade({ className: studentClassName, studentId });

        // Hợp nhất chính xác lịch sử thi trước đó của học sinh
        let combinedHistory = mergeExamHistories(localExisting?.examHistory || [], serverHistory);
        
        // Nếu trước đó học sinh làm bài dưới vai trò Khách, lưu trữ lại vào tài khoản
        if (guestUser && Array.isArray(guestUser.examHistory) && guestUser.examHistory.length > 0) {
          combinedHistory = mergeExamHistories(combinedHistory, guestUser.examHistory);
        }

        // Đồng bộ thêm các bài thi từ Sheet 02_KET_QUA_THI
        try {
          const sheetResults = await fetchGoogleSheetExamResults();
          const cleanPhoneNoZero = cleanPhone.replace(/\D/g, '').replace(/^0+/, '');
          const normName = (studentName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const normId = String(studentId || '').trim().toUpperCase();

          const studentSheetHistory = (sheetResults || []).filter(sr => {
            // Chỉ lấy bài thi thuộc khối lớp của học sinh này
            if (studentGrade) {
              const eg = getExamGrade(sr);
              if (eg && eg !== studentGrade) return false;
            }
            const srId = String(sr.studentId || '').trim().toUpperCase();
            const srPhoneClean = String(sr.studentId || '').replace(/\D/g, '').replace(/^0+/, '');
            const srNameNorm = (sr.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            if (normId && srId && normId === srId) return true;
            if (cleanPhoneNoZero && srPhoneClean && srPhoneClean === cleanPhoneNoZero) return true;
            if (normName && srNameNorm && normName === srNameNorm) return true;
            return false;
          });

          if (studentSheetHistory.length > 0) {
            combinedHistory = mergeExamHistories(combinedHistory, studentSheetHistory);
          }
        } catch {}

        // Đảm bảo chỉ lưu và giữ các bài thi thuộc đúng khối lớp của tài khoản học sinh
        const gradeFilteredHistory = filterExamHistoryByStudentGrade(
          { className: studentClassName, studentId },
          combinedHistory
        );

        const loggedUser: User = {
          studentId,
          phone: userPhone,
          name: studentName,
          className: studentClassName,
          role: UserRole.STUDENT, // Còn lại toàn bộ là tài khoản học sinh
          totalScore: Math.max(
            Number(data.user.totalScore) || 0,
            gradeFilteredHistory.reduce((sum, h) => sum + (h.score || 0), 0)
          ),
          examHistory: gradeFilteredHistory,
          status: data.user.status || data.user.Trang_Thai || 'Mở'
        };
        
        saveStoredUser(loggedUser);
        onLoginSuccess(loggedUser);
      } else {
        // Show specific error from server if available, else generic
        setError(data.message || 'Số điện thoại hoặc mật khẩu không chính xác.');
      }
    } catch (error) {
      console.warn("Chưa thể kết nối tới máy chủ Google Apps Script:", error);
      setError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Strict Validation
    const cleanClass = className.trim().toUpperCase();
    if (!name.trim()) { setError('Vui lòng nhập họ tên'); return; }
    if (!cleanClass) { setError('Vui lòng nhập tên lớp (ví dụ: 12T7, 10T6...)'); return; }
    if (phone.length !== 10 || !/^\d+$/.test(phone)) { 
        setError('Số điện thoại không hợp lệ (phải đủ 10 chữ số).'); 
        return; 
    }
    const cleanPhoneNoZero = phone.trim().replace(/^0+/, '');
    if (
      phone.trim() === '0966000224' || cleanPhoneNoZero === '966000224' ||
      phone.trim() === '0912345678' || cleanPhoneNoZero === '912345678'
    ) {
        setError('Số điện thoại này dành riêng cho tài khoản Quản trị viên giáo viên.');
        return;
    }
    if (password.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự.'); return; }

    setIsLoading(true);
    try {
      // 1. Tải danh sách học sinh hiện có từ Google Sheet hoặc bộ nhớ cache
      let existingList: any[] = [];
      try {
        existingList = await fetchGoogleSheetStudents();
      } catch {
        try {
          const cached = localStorage.getItem('bio_synced_sheet_students');
          if (cached) existingList = JSON.parse(cached) || [];
        } catch {}
      }

      // 2. Kiểm tra trước xem số điện thoại đã tồn tại chưa
      const cleanPhone = phone.trim();
      const existingUser = existingList.find(s => {
        const p = (s.phone || '').replace(/\D/g, '');
        return p === cleanPhone || (cleanPhoneNoZero && p.replace(/^0+/, '') === cleanPhoneNoZero);
      });
      if (existingUser) {
        setError(`Số điện thoại ${phone} đã được đăng ký cho học sinh "${existingUser.name}" (${existingUser.className} - Mã: ${existingUser.id}). Vui lòng chuyển sang tab Đăng Nhập.`);
        setIsLoading(false);
        return;
      }

      // 3. Tính toán ID học sinh duy nhất cho lớp (ví dụ: 10T756, 12T746...), tuyệt đối không trùng lặp
      const uniqueStudentId = generateUniqueStudentId(cleanClass, existingList);

      // 4. Gửi đăng ký kèm cả ID_HocSinh và studentId đã được cam kết duy nhất
      // Dù Google Apps Script của Thầy/Cô đang chạy phiên bản mới hay cũ, nó đều lưu trực tiếp ID này
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          action: 'register',
          phone,
          password,
          name: name.trim(),
          className: cleanClass,
          // Đồng bộ chuẩn các cột Sheet 01_HOC_SINH với ID duy nhất tuyệt đối
          ID_HocSinh: uniqueStudentId,
          studentId: uniqueStudentId,
          Ho_Va_Ten: name.trim(),
          Khoi_Lop: cleanClass,
          So_Dien_Thoai: phone,
          Mat_Khau: password,
          Trang_Thai: 'Mở'
        })
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const data = await response.json();

      if (data.success) {
        setIsLogin(true);
        const sid = data.student?.ID_HocSinh || data.student?.StudentID || data.student?.studentId || uniqueStudentId;
        const idText = sid ? ` - Mã HS: ${sid}` : '';

        // Kiểm tra xem ID trả về có bị trùng với học sinh khác trong lớp không
        const isColliding = existingList.some(s => {
          const sId = (s.id || '').trim().toUpperCase();
          const sPhone = (s.phone || '').replace(/\D/g, '');
          return sId === sid.toUpperCase() && sPhone !== cleanPhone;
        });

        if (isColliding) {
          setError(`⚠️ CẢNH BÁO TRÙNG ID: Google Sheet vừa cấp mã trùng [${sid}] do máy chủ Apps Script trên Sheet vẫn đang chạy bản triển khai cũ. Vui lòng bấm vào "Cập nhật Code.gs" để triển khai phiên bản mới chấm dứt trùng lặp.`);
          setShowAppsScriptModal(true);
        } else {
          setSuccess(`🎉 Đăng ký thành công cho ${name.trim()} (${cleanClass})${idText}! Trạng thái tài khoản: [MỞ]. Bạn có thể đăng nhập ngay.`);
        }
        setPassword('');

        // Cập nhật bộ nhớ cache ngay lập tức để lần đăng ký tiếp theo tự động tăng tiếp
        try {
          const cached = localStorage.getItem('bio_synced_sheet_students');
          let list = cached ? JSON.parse(cached) : [];
          if (!Array.isArray(list)) list = [];
          list.push({
            id: sid,
            name: name.trim(),
            className: cleanClass,
            phone: phone,
            status: 'Mở',
            totalScore: 0,
            registeredDate: new Date().toLocaleString('vi-VN'),
            examsCompleted: 0,
            examHistory: []
          });
          localStorage.setItem('bio_synced_sheet_students', JSON.stringify(list));
        } catch {}
      } else {
        const rawMsg = data.message || 'Đăng ký thất bại. Số điện thoại có thể đã tồn tại.';
        if (rawMsg.includes('handleRegister') || rawMsg.includes('ReferenceError')) {
          setError('Lỗi máy chủ Google Apps Script: Hàm handleRegister chưa được định nghĩa trong Code.gs của Google Sheet.');
        } else {
          setError(rawMsg);
        }
      }
    } catch (error) {
      console.warn("Lỗi kết nối máy chủ khi đăng ký:", error);
      setError('Lỗi kết nối khi đăng ký. Bạn có thể sử dụng tính năng lưu tài khoản tại thiết bị để vào học ngay.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocalRegisterAndLogin = () => {
    const cleanClass = className.trim().toUpperCase() || '12T7';
    const cleanPhone = phone.trim();
    const cleanName = name.trim();

    if (!cleanName) {
      setError('Vui lòng nhập họ và tên trước khi lưu tài khoản.');
      return;
    }
    if (cleanPhone.length !== 10 || !/^\d+$/.test(cleanPhone)) {
      setError('Số điện thoại phải đủ 10 chữ số.');
      return;
    }

    // Lấy danh sách học sinh đã có để sinh ID duy nhất
    let existingList: any[] = [];
    try {
      const rawList = localStorage.getItem('bio_synced_sheet_students');
      if (rawList) existingList = JSON.parse(rawList) || [];
    } catch {}

    const studentId = generateUniqueStudentId(cleanClass, existingList);
    const guestUser = getStoredUserByPhone('guest');
    const existingUser = getStoredUserByPhone(cleanPhone);
    const initialHistory = mergeExamHistories(existingUser?.examHistory || [], guestUser?.examHistory || []);
    const initialScore = initialHistory.reduce((sum, h) => sum + (h.score || 0), 0);

    const newUser: User = {
      studentId: studentId,
      phone: cleanPhone,
      name: cleanName,
      className: cleanClass,
      role: UserRole.STUDENT,
      totalScore: initialScore,
      examHistory: initialHistory,
      status: 'active',
      isGuest: false
    };

    try {
      saveStoredUser(newUser);

      const rawList = localStorage.getItem('bio_synced_sheet_students');
      let list = rawList ? JSON.parse(rawList) : [];
      if (!Array.isArray(list)) list = [];
      const existsIndex = list.findIndex((s: any) => s.phone === cleanPhone || (s.phone && s.phone.replace(/^0+/, '') === cleanPhone.replace(/^0+/, '')));
      if (existsIndex === -1) {
        list.push({
          id: studentId,
          name: cleanName,
          className: cleanClass,
          phone: cleanPhone,
          status: 'Mở',
          totalScore: initialScore,
          registeredDate: new Date().toLocaleString('vi-VN'),
          examsCompleted: initialHistory.length,
          examHistory: initialHistory
        });
        localStorage.setItem('bio_synced_sheet_students', JSON.stringify(list));
      }
    } catch (e) {
      console.warn("Lỗi lưu trữ cục bộ:", e);
    }

    onLoginSuccess(newUser);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      handleSkipLogin();
    }
  };

  const containerClasses = isModal
    ? "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    : "min-h-screen bg-bio-50 flex items-center justify-center p-4";

  return (
    <div className={containerClasses} onClick={isModal ? handleClose : undefined}>
      <div 
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-up relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-bio-600 p-6 pt-7 text-center text-white relative">
          {/* Nút đóng / Đăng nhập sau ở góc trên bên phải */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 active:scale-95 text-white text-xs font-semibold backdrop-blur-sm transition-all duration-200 border border-white/30 shadow-sm group focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
            title="Đóng / Vào ứng dụng ngay"
            aria-label="Đóng"
          >
            {onClose ? (
              <>
                <span className="text-[11px] font-medium tracking-tight">Đóng</span>
                <span className="text-sm leading-none font-bold">✕</span>
              </>
            ) : (
              <>
                <span className="text-[11px] font-medium tracking-tight">Đăng nhập sau</span>
                <svg 
                  className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          <h1 className="text-2xl sm:text-3xl font-bold mb-1.5 leading-snug">AI Sinh Học Cá Nhân Hóa</h1>
          <p className="text-bio-100 text-xs sm:text-sm">Hệ thống học tập và củng cố Sinh Học THPT</p>
        </div>

        <div className="flex border-b">
          <button 
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-4 font-semibold text-sm transition-colors ${isLogin ? 'text-bio-600 border-b-2 border-bio-600 bg-bio-50' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Đăng Nhập
          </button>
          <button 
             onClick={() => setIsLogin(false)}
             className={`flex-1 py-4 font-semibold text-sm transition-colors ${!isLogin ? 'text-bio-600 border-b-2 border-bio-600 bg-bio-50' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Đăng Ký
          </button>
        </div>

        <div className="p-5 sm:p-7 md:p-8">
          {/* Notifications Area */}
          {error && (
            <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl space-y-2.5 animate-fade-in shadow-sm">
              <div className="flex items-start gap-2">
                <span className="text-base shrink-0">⚠️</span>
                <span className="font-semibold leading-relaxed">{error}</span>
              </div>
              
              {(error.includes('handleRegister') || error.includes('ReferenceError') || error.includes('Google Apps Script') || error.includes('Apps Script')) && (
                <div className="pt-2 border-t border-red-200/80 space-y-2">
                  <p className="text-[11px] text-gray-600 leading-normal">
                    📌 <strong>Nguyên nhân:</strong> Google Apps Script của bạn chưa có hàm <code className="font-mono bg-red-100 px-1 py-0.5 rounded text-red-800 font-bold">handleRegister</code> trong tệp <code className="font-mono bg-gray-200 px-1 py-0.5 rounded">Code.gs</code>.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAppsScriptModal(true)}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>🛠️ Xem mã sửa Apps Script (1-Click)</span>
                    </button>
                    {!isLogin && (
                      <button
                        type="button"
                        onClick={handleLocalRegisterAndLogin}
                        className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Vào học ngay mà không bị chặn bởi lỗi Apps Script"
                      >
                        <span>⚡ Tạo tài khoản & Vào học ngay</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg flex items-start gap-2">
              <span>✅</span>
              <span>{success}</span>
            </div>
          )}

          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                <input 
                  type="text" 
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bio-500 focus:border-bio-500 outline-none transition"
                  placeholder="09xx..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bio-500 focus:border-bio-500 outline-none transition pr-10"
                    placeholder="******"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <button 
                disabled={isLoading}
                className="w-full bg-bio-600 text-white py-3 rounded-lg font-bold hover:bg-bio-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex justify-center items-center gap-2 cursor-pointer shadow-md"
              >
                {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {isLoading ? 'Đang xác thực...' : 'Đăng Nhập'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ và Tên</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bio-500 outline-none transition"
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                  <input 
                    type="text" 
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bio-500 outline-none transition"
                    placeholder="10 số"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lớp</label>
                  <input 
                    type="text" 
                    value={className}
                    onChange={e => setClassName(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bio-500 outline-none transition uppercase"
                    placeholder="VD: 12T7, 10T6..."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bio-500 outline-none transition pr-10"
                    placeholder="Tối thiểu 6 ký tự"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <button 
                disabled={isLoading}
                className="w-full bg-bio-600 text-white py-3 rounded-lg font-bold hover:bg-bio-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex justify-center items-center gap-2 cursor-pointer shadow-md"
              >
                {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {isLoading ? 'Đang gửi...' : 'Đăng Ký Tài Khoản'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Modal hướng dẫn sửa lỗi Google Apps Script */}
      <GoogleAppsScriptModal 
        isOpen={showAppsScriptModal} 
        onClose={() => setShowAppsScriptModal(false)} 
      />
    </div>
  );
};
