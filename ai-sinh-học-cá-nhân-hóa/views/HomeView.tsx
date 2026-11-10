import React, { useState, useEffect } from 'react';
import { User, UserRole, Exam } from '../types';
import { 
  getExams, 
  fetchCloudLeaderboard, 
  getStudentGrade, 
  getExamGrade, 
  formatExamDisplayId 
} from '../services/dataService';
import { 
  isRemedialOrPracticeTurn, 
  isExamAttemptMatching,
  getSavedCompetencyProfile
} from '../services/diagnosticService';
import { ClassStatisticsSection } from '../components/ClassStatisticsSection';

interface HomeViewProps {
  user: User;
  onNavigate: (tab: string) => void;
  onOpenLogin?: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ user, onNavigate, onOpenLogin }) => {
  const isAdmin = user.role === UserRole.ADMIN;
  const [studentExams, setStudentExams] = useState<Exam[]>([]);
  
  // Admin Stats State
  const [adminStats, setAdminStats] = useState({
    totalExams: 0,
    totalQuestions: 0,
    totalStudents: 0,
    activeBattles: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      const allExams = await getExams();
      const safeExams = Array.isArray(allExams) ? allExams : [];
      setStudentExams(safeExams);
      
      // Admin Logic: Calculate Dashboard Stats
      if (isAdmin) {
        let leaderboardCount = 0;
        try {
          const leaderboard = await fetchCloudLeaderboard('MONTH');
          leaderboardCount = Array.isArray(leaderboard) ? leaderboard.length : 0;
        } catch (e) {
          console.warn("Could not fetch leaderboard for admin stats:", e);
        }

        const activeBattles = safeExams.filter(e => e.category === 'BATTLE' && !e.isLocked).length;
        const officialExams = safeExams.filter(e => e.category !== 'BATTLE');
        const totalQs = officialExams.reduce((acc, curr) => {
          const qCount = Array.isArray(curr?.questions) ? curr.questions.length : 0;
          return acc + qCount;
        }, 0);

        setAdminStats({
          totalExams: officialExams.length,
          totalQuestions: totalQs,
          totalStudents: leaderboardCount,
          activeBattles: activeBattles
        });
        return;
      }
    };

    fetchData();
  }, [user, isAdmin]);

  // --- ADMIN VIEW ---
  if (isAdmin) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Admin Header */}
        <div 
          style={{ 
            paddingBottom: '18px', 
            paddingRight: '32px', 
            paddingLeft: '32px', 
            paddingTop: '11px', 
            height: '117.725px', 
            width: '1152px',
            maxWidth: '100%'
          }} 
          className="bg-gray-800 rounded-2xl text-white shadow-lg flex justify-between items-center"
        >
          <div>
            <h2 
              style={{ width: '677px', maxWidth: '100%', fontSize: '22px', lineHeight: '26px' }} 
              className="font-bold mb-1"
            >
              Bảng Điều Khiển Quản Trị
            </h2>
            <p 
              style={{ 
                fontSize: '13px', 
                marginTop: '11px', 
                paddingRight: '0px', 
                paddingLeft: '0px', 
                paddingTop: '0px', 
                width: '1000px',
                maxWidth: '100%'
              }} 
              className="text-gray-400"
            >
              Tổng quan hệ thống AI Sinh Học Cá Nhân Hóa
            </p>
          </div>
          <div className="text-4xl">🛠️</div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
            <span className="text-3xl mb-2">📚</span>
            <div className="text-2xl font-bold text-gray-800">{adminStats.totalExams}</div>
            <div className="text-xs text-gray-500 font-semibold uppercase">Đề Thi Chính Thức</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
             <span className="text-3xl mb-2">❓</span>
            <div className="text-2xl font-bold text-blue-600">{adminStats.totalQuestions}</div>
            <div className="text-xs text-gray-500 font-semibold uppercase">Ngân Hàng Câu Hỏi</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
             <span className="text-3xl mb-2">👥</span>
            <div className="text-2xl font-bold text-green-600">{adminStats.totalStudents}</div>
            <div className="text-xs text-gray-500 font-semibold uppercase">Học Sinh Tham Gia</div>
          </div>
        </div>

        {/* Management Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
           <div 
            onClick={() => onNavigate('classrooms')}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-emerald-300 transition cursor-pointer group"
           >
             <div className="flex items-center gap-4">
                <div className="bg-emerald-100 p-4 rounded-full text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
                  🏫
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">Quản Lý Lớp Học</h3>
                  <p className="text-sm text-gray-500">Đồng bộ từ Google Sheet, gom nhóm theo lớp (10T6, 12T7...) và theo dõi sĩ số.</p>
                </div>
             </div>
           </div>

           <div 
            onClick={() => onNavigate('test')}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer group"
           >
             <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-4 rounded-full text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                  📝
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">Quản Lí KT, Đánh Giá</h3>
                  <p className="text-sm text-gray-500">Tạo, sửa, xóa đề thi, số hóa học liệu bằng AI và theo dõi kết quả làm bài.</p>
                </div>
             </div>
           </div>

           <div 
            onClick={() => onNavigate('personalized')}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer group"
           >
             <div className="flex items-center gap-4">
                <div className="bg-teal-100 p-4 rounded-full text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition">
                  🎯
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">Tiến Trình Học Tập</h3>
                  <p className="text-sm text-gray-500">Xem lộ trình rèn luyện cá nhân hóa và công cụ luyện tập thích ứng bằng AI.</p>
                </div>
             </div>
           </div>
        </div>
        
        {/* Thống Kê Cơ Bản Từng Lớp 10T6, 10T7, 12T6, 12T7 (Theo chuẩn GDPT 2018) */}
        <ClassStatisticsSection
          initialClass="10T6"
          onNavigateToClassrooms={() => onNavigate('classrooms')}
          onNavigateToTest={() => onNavigate('test')}
        />

        {/* System Health (Mock) */}
        <div className="bg-green-50 border border-green-200 p-4 rounded-xl flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-green-800 text-sm font-medium">Hệ thống đang hoạt động bình thường. Kết nối Google Sheet ổn định.</span>
        </div>
      </div>
    );
  }

  // --- STUDENT METRICS (Theo chuẩn GDPT 2018) ---
  const studentGrade = getStudentGrade(user) || '12';
  const gradeExams = studentExams.filter(e => {
    if (e.category === 'BATTLE') return false;
    const eg = getExamGrade(e);
    return eg === studentGrade || !eg;
  });

  const lessonNames = new Set<string>();
  gradeExams.forEach(e => {
    const name = (e.lessonName || e.title || '').trim();
    if (name) lessonNames.add(name);
  });
  // Số bài học hiện có: tối thiểu 3 bài học chuẩn chương trình GDPT 2018
  const totalLessonsCount = Math.max(3, lessonNames.size);

  const history = Array.isArray(user.examHistory) ? user.examHistory : [];
  const completedAttempts = history.filter(h => h && !isRemedialOrPracticeTurn(h));
  const completedCount = completedAttempts.length;

  let needReviewCount = 0;
  let masteringCount = 0;

  if (completedAttempts.length > 0) {
    const lessonScores: Record<string, number> = {};
    completedAttempts.forEach(h => {
      const key = (h.lessonName || h.examTitle || h.title || 'Bài học').trim();
      const s = Number(h.score10) || (h.totalQuestions > 0 ? (h.score / h.totalQuestions) * 10 : h.score || 0);
      lessonScores[key] = s;
    });
    const scores = Object.values(lessonScores);
    needReviewCount = scores.filter(s => s < 6.5).length;
    masteringCount = scores.filter(s => s >= 6.5).length;
    if (needReviewCount === 0 && masteringCount === 0) {
      needReviewCount = 0;
      masteringCount = scores.length;
    }
  }

  // Danh sách bài kiểm tra sẵn sàng cho học sinh
  const readyExams = gradeExams;

  // =========================================================================
  // PHÂN TÍCH NỘI DUNG CẦN CỦNG CỐ DỰA TRÊN KẾT QUẢ BÀI KIỂM TRA THỰC TẾ
  // =========================================================================
  interface WeakTopicItem {
    lesson: string;
    title: string;
    level: string;
    reason: string;
    goal: string;
    examId?: string;
    examTitle?: string;
    score10: number;
  }

  const rawWeakItems: WeakTopicItem[] = [];

  completedAttempts.forEach(att => {
    const s10 = Math.round(Number(att.score10 ?? (att.totalQuestions > 0 ? (att.score / att.totalQuestions) * 10 : att.score || 0)) * 10) / 10;
    const matchedExam = studentExams.find(e => isExamAttemptMatching(att, e));
    const lessonTitle = att.lessonName || matchedExam?.lessonName || att.examTitle || matchedExam?.title || 'Bài kiểm tra Sinh học';
    const examName = att.examTitle || matchedExam?.title || 'Bài kiểm tra';
    const savedProfile = att.competencyProfile || (att.examId ? getSavedCompetencyProfile(att.examId, user.phone) : null);

    // TH1: Có hồ sơ chẩn đoán chi tiết (Competency Profile từ lượt thi thực tế)
    if (savedProfile && Array.isArray(savedProfile.errorItems) && savedProfile.errorItems.length > 0) {
      savedProfile.errorItems.forEach((err, idx) => {
        rawWeakItems.push({
          lesson: lessonTitle,
          title: err.weakConcept || (err.questionText ? (err.questionText.slice(0, 80) + (err.questionText.length > 80 ? '...' : '')) : `Lỗ hổng kiến thức số ${idx + 1}`),
          level: err.cognitiveLevel === 'NHAN_BIET' ? 'Nhận biết' : err.cognitiveLevel === 'THONG_HIEU' ? 'Thông hiểu' : 'Vận dụng',
          reason: err.reasonWhyWrong || err.explanation || `Em đã trả lời sai câu hỏi này trong bài kiểm tra "${examName}".`,
          goal: `Mục tiêu: Ôn lại và làm bài rèn luyện thích ứng (${s10}/10đ)`,
          examId: att.examId,
          examTitle: examName,
          score10: s10
        });
      });
      return;
    }

    // TH2: Có danh sách câu hỏi chi tiết (details) của bài thi
    if (Array.isArray(att.details) && att.details.length > 0) {
      const wrongList = att.details.filter((d: any) => !d.isCorrect);
      if (wrongList.length > 0) {
        wrongList.forEach((wq: any, idx: number) => {
          rawWeakItems.push({
            lesson: lessonTitle,
            title: wq.questionText ? (wq.questionText.slice(0, 80) + (wq.questionText.length > 80 ? '...' : '')) : `Câu hỏi chưa đạt ${idx + 1}`,
            level: wq.cognitiveLevel === 'NHAN_BIET' ? 'Nhận biết' : wq.cognitiveLevel === 'THONG_HIEU' ? 'Thông hiểu' : 'Vận dụng',
            reason: wq.explanation || `Lựa chọn của em: "${wq.userAnswer || 'Chưa trả lời'}" (Đáp án đúng: "${wq.correctAnswer}"). Cần củng cố lại lý thuyết.`,
            goal: `Mục tiêu: Đạt chuẩn yêu cầu cần đạt (${s10}/10đ)`,
            examId: att.examId,
            examTitle: examName,
            score10: s10
          });
        });
        return;
      }
    }

    // TH3: Kết quả thi từ Google Sheet 02_KET_QUA_THI hoặc tổng hợp (có số câu sai theo mức độ nhận thức hoặc điểm < 8.0)
    const wNB = Number(att.wrongNhanBiet) || 0;
    const wTH = Number(att.wrongThongHieu) || 0;
    const wVD = Number(att.wrongVanDung) || 0;

    if (wTH > 0) {
      rawWeakItems.push({
        lesson: lessonTitle,
        title: `Cơ chế và mối liên hệ bản chất (Mức Thông hiểu)`,
        level: `Thông hiểu • Sai ${wTH} câu`,
        reason: `Bài kiểm tra "${examName}" đạt ${s10}/10 điểm. Em còn sai ${wTH} câu hỏi Thông hiểu về cơ chế hoạt động và quy luật.`,
        goal: `Mục tiêu: Nâng điểm bài kiểm tra lên trên 8.0`,
        examId: att.examId,
        examTitle: examName,
        score10: s10
      });
    }

    if (wVD > 0) {
      rawWeakItems.push({
        lesson: lessonTitle,
        title: `Vận dụng giải quyết câu hỏi tình huống thực tế`,
        level: `Vận dụng • Sai ${wVD} câu`,
        reason: `Bài kiểm tra "${examName}" đạt ${s10}/10 điểm. Em còn sai ${wVD} câu hỏi phân tích sơ đồ hoặc vận dụng thực tế.`,
        goal: `Mục tiêu: Rèn luyện bài tập tình huống mức Vận dụng`,
        examId: att.examId,
        examTitle: examName,
        score10: s10
      });
    }

    if (wNB > 0) {
      rawWeakItems.push({
        lesson: lessonTitle,
        title: `Khái niệm, định nghĩa và từ khóa cốt lõi SGK`,
        level: `Nhận biết • Sai ${wNB} câu`,
        reason: `Bài kiểm tra "${examName}" đạt ${s10}/10 điểm. Chưa ghi nhớ chính xác ${wNB} câu hỏi định nghĩa và thuật ngữ SGK.`,
        goal: `Mục tiêu: Ghi nhớ chuẩn xác từ khóa và thuật ngữ SGK`,
        examId: att.examId,
        examTitle: examName,
        score10: s10
      });
    }

    // Nếu điểm dưới 8.0 mà không có thống kê câu sai chi tiết
    if (s10 < 8.0 && wNB === 0 && wTH === 0 && wVD === 0) {
      rawWeakItems.push({
        lesson: lessonTitle,
        title: `Kiến thức trọng tâm bài học chưa đạt mức thành thạo`,
        level: `Cần củng cố • ${s10}/10 điểm`,
        reason: `Kết quả làm bài kiểm tra "${examName}" đạt ${s10}/10 điểm. Cần ôn tập và làm bài rèn luyện thích ứng để đạt trên 8.0 điểm.`,
        goal: `Mục tiêu: Nâng điểm số bài kiểm tra này lên mức Giỏi`,
        examId: att.examId,
        examTitle: examName,
        score10: s10
      });
    }
  });

  // Loại bỏ các mục trùng lặp
  const seenWeakKeys = new Set<string>();
  const dynamicWeakItems: WeakTopicItem[] = [];
  rawWeakItems.forEach(item => {
    const key = `${item.lesson.toLowerCase().trim()}_${item.title.toLowerCase().trim()}_${item.level}`;
    if (!seenWeakKeys.has(key)) {
      seenWeakKeys.add(key);
      dynamicWeakItems.push(item);
    }
  });

  // Ưu tiên hiển thị các bài học có điểm thi thực tế thấp nhất (cần củng cố nhất lên đầu)
  dynamicWeakItems.sort((a, b) => a.score10 - b.score10);

  // --- STUDENT VIEW (Unchanged structure) ---
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Guest Notice Banner */}
      {user.isGuest && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl shrink-0">
              💡
            </div>
            <div>
              <h4 className="font-bold text-amber-900 text-sm">Chế độ trải nghiệm (Chưa đăng nhập)</h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Lưu ý: Tài khoản học sinh cần phải đăng nhập thành công mới có thể vào làm bài kiểm tra và lưu lịch sử kết quả vào hệ thống Google Sheet.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (onOpenLogin) {
                onOpenLogin();
              } else {
                localStorage.removeItem('current_user_phone');
                window.location.reload();
              }
            }}
            className="px-4 py-2 bg-bio-600 hover:bg-bio-700 active:scale-95 text-white rounded-xl text-xs font-bold transition whitespace-nowrap shadow cursor-pointer flex items-center gap-1.5"
          >
            <span>🔑</span>
            <span>Đăng nhập ngay</span>
          </button>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-bio-600 to-bio-500 rounded-2xl p-5 sm:p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 style={{ fontSize: '22px' }} className="font-bold mb-1 sm:mb-1.5 flex items-center gap-2">
            <span>Chào mừng trở lại, {user.name}!</span>
            <span className="text-xl">🌱</span>
          </h2>
          <p style={{ fontSize: '14px' }} className="text-bio-50 opacity-95">
            Hãy tiếp tục hành trình chinh phục kiến thức Sinh Học hôm nay.
          </p>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('test')}
            className="flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 bg-white text-bio-700 hover:bg-bio-50 active:scale-95 text-xs sm:text-sm font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <span className="text-base">📝</span>
            <span>Vào Làm Bài Kiểm Tra</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('personalized')}
            className="flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 bg-emerald-900/40 hover:bg-emerald-900/60 active:scale-95 text-white border border-white/30 hover:border-white/50 text-xs sm:text-sm font-bold rounded-xl transition shadow-sm flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap backdrop-blur-sm"
          >
            <span className="text-base">🎯</span>
            <span>Xem Hồ Sơ Năng Lực</span>
          </button>
        </div>
      </div>

      {/* 4 Thẻ chỉ số năng lực & học tập (Theo chuẩn GDPT 2018) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: BÀI HỌC HIỆN CÓ */}
        <div 
          onClick={() => onNavigate('test')}
          className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              BÀI HỌC HIỆN CÓ
            </span>
            <div className="text-blue-600 group-hover:scale-110 transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {totalLessonsCount}
            </div>
            <div className="text-xs text-gray-400 font-medium mt-1">
              Chương trình GDPT 2018
            </div>
          </div>
        </div>

        {/* Card 2: CẦN CỦNG CỐ */}
        <div 
          onClick={() => onNavigate('personalized')}
          className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-rose-200 transition cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              CẦN CỦNG CỐ
            </span>
            <div className="text-rose-500 group-hover:scale-110 transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-rose-600 tracking-tight">
              {needReviewCount}
            </div>
            <div className="text-xs text-gray-400 font-medium mt-1">
              Mục tiêu cần ưu tiên ôn tập
            </div>
          </div>
        </div>

        {/* Card 3: ĐANG TIẾN BỘ / ỔN ĐỊNH */}
        <div 
          onClick={() => onNavigate('personalized')}
          className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              ĐANG TIẾN BỘ / ỔN ĐỊNH
            </span>
            <div className="text-emerald-500 group-hover:scale-110 transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-emerald-600 tracking-tight">
              {masteringCount}
            </div>
            <div className="text-xs text-gray-400 font-medium mt-1">
              Năng lực đã làm chủ tốt
            </div>
          </div>
        </div>

        {/* Card 4: BÀI ĐÃ HOÀN THÀNH */}
        <div 
          onClick={() => onNavigate('profile')}
          className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              BÀI ĐÃ HOÀN THÀNH
            </span>
            <div className="text-indigo-500 group-hover:scale-110 transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="8" r="5" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.21 13.89L7 21l5-3 5 3-1.21-7.11" />
              </svg>
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-indigo-600 tracking-tight">
              {completedCount}
            </div>
            <div className="text-xs text-gray-400 font-medium mt-1">
              Lần nộp được ghi nhận
            </div>
          </div>
        </div>
      </div>

      {/* Thống Kê Cơ Bản Từng Lớp 10T6, 10T7, 12T6, 12T7 (Theo chuẩn GDPT 2018) */}
      <ClassStatisticsSection
        initialClass={user.className || '10T6'}
        onNavigateToClassrooms={() => onNavigate('classrooms')}
        onNavigateToTest={() => onNavigate('test')}
      />

      {/* KHU VỰC 2 CỘT: BÀI KIỂM TRA ĐÃ SẴN SÀNG (TRÁI) & NỘI DUNG CẦN CỦNG CỐ (PHẢI) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* CỘT BÊN TRÁI: BÀI KIỂM TRA ĐÃ SẴN SÀNG */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-bio-100 text-bio-700 flex items-center justify-center text-lg">
                📝
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-base sm:text-lg">
                  Bài Kiểm Tra Đã Sẵn Sàng
                </h3>
                <p className="text-xs text-gray-500">
                  {readyExams.length} đề thi thuộc Khối {studentGrade} • Chương trình GDPT 2018
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('test')}
              className="text-xs text-bio-600 hover:text-bio-700 font-bold hover:underline inline-flex items-center gap-1 transition cursor-pointer"
            >
              <span>Xem tất cả</span>
              <span>→</span>
            </button>
          </div>

          <div className="space-y-3">
            {readyExams.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                Đang cập nhật đề thi cho Khối {studentGrade}...
              </div>
            ) : (
              readyExams.map((exam, exIdx) => {
                const displayId = formatExamDisplayId(exam.id, exam.grade || exam.category, exam.title);
                const matchingHistory = (user.examHistory || []).filter(h => h && isExamAttemptMatching(h, exam) && !isRemedialOrPracticeTurn(h));
                const latestAttempt = matchingHistory.length > 0 ? matchingHistory[matchingHistory.length - 1] : null;
                const hasTaken = Boolean(latestAttempt);
                const score10 = latestAttempt ? Number(latestAttempt.score10 ?? (latestAttempt.score / (latestAttempt.totalQuestions || 1) * 10)).toFixed(1) : null;
                const isPassed = latestAttempt ? Number(score10) >= 5.0 : false;
                const isGood = latestAttempt ? Number(score10) >= 8.0 : false;

                return (
                  <div 
                    key={`home_ready_ex_${exam.id || 'ex'}_${exIdx}`}
                    className="p-4 rounded-xl border border-gray-100 hover:border-bio-300 hover:shadow-sm transition bg-gray-50/50 hover:bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-bio-100 text-bio-800">
                          {displayId}
                        </span>
                        {hasTaken ? (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isGood ? 'bg-emerald-100 text-emerald-800' : isPassed ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            ✓ Đã làm ({score10}đ)
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            Chưa làm
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          • {exam.questions?.length || 0} câu • {exam.duration || 15} phút
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-gray-800 group-hover:text-bio-700 transition truncate">
                        {exam.title}
                      </h4>
                      <p className="text-xs text-gray-500 line-clamp-1">
                        {exam.lessonName || exam.topic || 'Nội dung cốt lõi môn Sinh học'}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => {
                          try {
                            sessionStorage.setItem('target_exam_id_to_start', String(exam.id));
                          } catch {}
                          onNavigate('test');
                        }}
                        className={`px-3.5 py-2 text-xs font-bold rounded-xl transition shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                          hasTaken
                            ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            : 'bg-bio-600 hover:bg-bio-700 text-white'
                        }`}
                      >
                        <span>{hasTaken ? 'Làm lại / Xem' : 'Vào làm bài'}</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* CỘT BÊN PHẢI: NỘI DUNG CẦN CỦNG CỐ */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center text-lg">
                🎯
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-base sm:text-lg">
                  Nội Dung Cần Củng Cố
                </h3>
                <p className="text-xs text-gray-500">
                  Dựa trên kết quả bài kiểm tra thực tế • Chuẩn YCCĐ GDPT 2018
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('personalized')}
              className="text-xs text-rose-600 hover:text-rose-700 font-bold hover:underline inline-flex items-center gap-1 transition cursor-pointer"
            >
              <span>Xem hồ sơ năng lực</span>
              <span>→</span>
            </button>
          </div>

          <div className="space-y-3">
            {completedAttempts.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-xl bg-gray-50 border border-dashed border-gray-200">
                <div className="text-3xl mb-2">📋</div>
                <h4 className="font-bold text-gray-800 text-sm mb-1">
                  Chưa có dữ liệu bài kiểm tra thực tế
                </h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4 leading-relaxed">
                  Em chưa hoàn thành bài kiểm tra nào. Hãy chọn một đề thi ở danh sách bên trái để bắt đầu làm bài. Hệ thống sẽ tự động chẩn đoán chính xác lỗ hổng kiến thức thực tế tại đây.
                </p>
                <button
                  onClick={() => onNavigate('test')}
                  className="px-4 py-2 bg-bio-600 hover:bg-bio-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>📝</span>
                  <span>Bắt đầu làm bài kiểm tra ngay</span>
                </button>
              </div>
            ) : dynamicWeakItems.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-3xl mb-2">🎉</div>
                <h4 className="font-bold text-emerald-900 text-sm mb-1">
                  Kết quả làm bài thực tế rất tốt!
                </h4>
                <p className="text-xs text-emerald-700 max-w-sm mx-auto mb-3 leading-relaxed">
                  Em đã hoàn thành {completedAttempts.length} lượt kiểm tra với kết quả vững vàng (≥ 8.0đ), chưa ghi nhận lỗ hổng kiến thức nghiêm trọng nào.
                </p>
                <button
                  onClick={() => onNavigate('personalized')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>🎯</span>
                  <span>Xem bản đồ năng lực chi tiết</span>
                </button>
              </div>
            ) : (
              dynamicWeakItems.slice(0, 5).map((topic, idx) => (
                <div 
                  key={`home_weak_${topic.lesson || 'topic'}_${idx}`}
                  className="p-4 rounded-xl border border-gray-100 hover:border-rose-200 hover:shadow-sm transition bg-rose-50/30 hover:bg-white flex flex-col justify-between gap-3 group"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold text-xs text-rose-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                        {topic.lesson}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                          {topic.level}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          Điểm thi: {topic.score10}/10
                        </span>
                      </div>
                    </div>
                    <h4 className="font-bold text-sm text-gray-900 group-hover:text-rose-700 transition">
                      {topic.title}
                    </h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {topic.reason}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-rose-100/60 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-500 font-medium truncate">
                      {topic.goal}
                    </span>
                    <button
                      onClick={() => onNavigate('personalized')}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap"
                    >
                      <span>Luyện tập bù đắp</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              ))
            )}

            {dynamicWeakItems.length > 5 && (
              <div className="text-center pt-2">
                <button
                  onClick={() => onNavigate('personalized')}
                  className="text-xs text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                >
                  Xem thêm {dynamicWeakItems.length - 5} nội dung cần củng cố khác trong Hồ Sơ Năng Lực →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};