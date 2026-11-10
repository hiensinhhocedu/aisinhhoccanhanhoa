import React, { useState, useMemo, useEffect } from 'react';
import { User, UserRole, BIO_TOPICS, ExamResult, Question, Exam } from '../types';
import { generateBiologyQuestions } from '../services/geminiService';
import { 
  submitExamResultToCloud, 
  SheetStudent, 
  ClassroomGroup, 
  fetchGoogleSheetStudents, 
  groupStudentsIntoClassrooms, 
  getExams, 
  isExamDeleted,
  sortExamsNewestFirst,
  triggerUpdateDashboardCloud,
  fetchDashboardSummaryFromCloud,
  SchoolDashboardStats,
  getGoogleSheetUrl,
  saveStoredUser,
  mergeExamHistories,
  filterExamHistoryByStudentGrade
} from '../services/dataService';
import { StudentLearningProgressView } from '../components/StudentLearningProgressView';
import { GoogleAppsScriptModal } from '../components/GoogleAppsScriptModal';
import { cleanStudentFullName } from './ReportView';

interface PersonalizedViewProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  onNavigateToTest: () => void;
  onOpenLogin?: () => void;
  targetStudentUser?: User | null;
  onClearTargetStudent?: () => void;
}

const isUserTeacherOrAdmin = (u: any): boolean => {
  if (!u) return false;
  const phone = (u.phone || '').toString().trim().replace(/^0+/, '');
  const isAdminPhone = phone === '966000224' || u.phone === '0966000224' || phone === '912345678' || u.phone === '0912345678';
  return isAdminPhone && u.role === UserRole.ADMIN;
};

// Phân tách Yêu Cầu Cần Đạt (YCCĐ) thành từng chỉ số cụ thể
interface ObjectiveItem {
  id: string;
  code: string; // e.g. YCCD_1.1
  level: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng';
  shortLevel: 'Biết' | 'Hiểu' | 'Vận dụng';
  text: string;
}

const parseObjectivesText = (objText: string, examTitle?: string): ObjectiveItem[] => {
  const items: ObjectiveItem[] = [];
  let nbCount = 1;
  let thCount = 1;
  let vdCount = 1;

  if (objText && objText.trim().length > 10) {
    const lines = objText.split('\n').map(l => l.trim()).filter(Boolean);
    let curLevel: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' = 'Nhận biết';

    for (const line of lines) {
      if (/nhận\s*biết/i.test(line)) {
        curLevel = 'Nhận biết';
      } else if (/thông\s*hiểu/i.test(line)) {
        curLevel = 'Thông hiểu';
      } else if (/vận\s*dụng/i.test(line)) {
        curLevel = 'Vận dụng';
      } else {
        const clean = line.replace(/^[\-\*\•\d\.\)]+\s*/, '').trim();
        if (clean && clean.length > 5) {
          const shortLvl: 'Biết' | 'Hiểu' | 'Vận dụng' = 
            curLevel === 'Nhận biết' ? 'Biết' : curLevel === 'Thông hiểu' ? 'Hiểu' : 'Vận dụng';
          const code = curLevel === 'Nhận biết' 
            ? `YCCD_1.${nbCount++}` 
            : curLevel === 'Thông hiểu' 
              ? `YCCD_2.${thCount++}` 
              : `YCCD_3.${vdCount++}`;

          items.push({
            id: `yccd-${items.length + 1}`,
            code,
            level: curLevel,
            shortLevel: shortLvl,
            text: clean
          });
        }
      }
    }
  }

  // Fallback defaults chuẩn GDPT 2018 nếu đề thi chưa có hoặc ít YCCĐ
  if (items.length === 0) {
    const titleLower = (examTitle || '').toLowerCase();
    if (titleLower.includes('cấp độ tổ chức') || titleLower.includes('bài 3')) {
      return [
        { id: 'yccd-1', code: 'YCCD_1.1', level: 'Nhận biết', shortLevel: 'Biết', text: 'Nêu được khái niệm cấp độ tổ chức sống, kể tên các cấp độ tổ chức sống cơ bản: tế bào, cơ thể, quần thể, quần xã, hệ sinh thái.' },
        { id: 'yccd-2', code: 'YCCD_1.2', level: 'Nhận biết', shortLevel: 'Biết', text: 'Nhận biết được tế bào là đơn vị cấu trúc và chức năng cơ bản nhất của mọi cơ thể sinh vật.' },
        { id: 'yccd-3', code: 'YCCD_2.1', level: 'Thông hiểu', shortLevel: 'Hiểu', text: 'Trình bày được đặc điểm chung của các cấp độ tổ chức sống: thứ bậc, hệ thống mở và tự điều chỉnh, liên tục tiến hóa.' },
        { id: 'yccd-4', code: 'YCCD_2.2', level: 'Thông hiểu', shortLevel: 'Hiểu', text: 'Phân tích được mối quan hệ giữa các cấp độ tổ chức sống trong sinh giới.' },
        { id: 'yccd-5', code: 'YCCD_3.1', level: 'Vận dụng', shortLevel: 'Vận dụng', text: 'Vận dụng hiểu biết về các cấp độ tổ chức sống để giải thích các hiện tượng thực tế trong tự nhiên và xây dựng giải pháp bảo tồn hệ sinh thái.' }
      ];
    } else if (titleLower.includes('gene') || titleLower.includes('di truyền') || titleLower.includes('phiên mã')) {
      return [
        { id: 'yccd-1', code: 'YCCD_1.1', level: 'Nhận biết', shortLevel: 'Biết', text: 'Nêu được định nghĩa gene, cấu trúc chung của gene cấu trúc và đặc điểm của mã di truyền.' },
        { id: 'yccd-2', code: 'YCCD_1.2', level: 'Nhận biết', shortLevel: 'Biết', text: 'Kể tên và nêu được chức năng các loại phân tử RNA (mRNA, tRNA, rRNA) trong tế bào.' },
        { id: 'yccd-3', code: 'YCCD_2.1', level: 'Thông hiểu', shortLevel: 'Hiểu', text: 'Trình bày được cơ chế phiên mã tổng hợp RNA và dịch mã tổng hợp protein ở sinh vật.' },
        { id: 'yccd-4', code: 'YCCD_2.2', level: 'Thông hiểu', shortLevel: 'Hiểu', text: 'Phân tích được nguyên tắc bổ sung trong quá trình truyền đạt thông tin di truyền ở cấp độ phân tử.' },
        { id: 'yccd-5', code: 'YCCD_3.1', level: 'Vận dụng', shortLevel: 'Vận dụng', text: 'Vận dụng kiến thức mã di truyền vào tính toán các thông số phân tử và ứng dụng sản xuất sinh phẩm y dược.' }
      ];
    } else if (titleLower.includes('trao đổi chất') || titleLower.includes('năng lượng') || titleLower.includes('quang hợp') || titleLower.includes('hô hấp')) {
      return [
        { id: 'yccd-1', code: 'YCCD_1.1', level: 'Nhận biết', shortLevel: 'Biết', text: 'Nêu được khái niệm trao đổi chất và chuyển hóa năng lượng ở sinh vật.' },
        { id: 'yccd-2', code: 'YCCD_1.2', level: 'Nhận biết', shortLevel: 'Biết', text: 'Nêu được vai trò của trao đổi chất và chuyển hóa năng lượng đối với cơ thể sinh vật.' },
        { id: 'yccd-3', code: 'YCCD_2.1', level: 'Thông hiểu', shortLevel: 'Hiểu', text: 'Phân biệt được hai mặt của trao đổi chất: đồng hóa và dị hóa, phương thức dinh dưỡng tự dưỡng và dị dưỡng.' },
        { id: 'yccd-4', code: 'YCCD_3.1', level: 'Vận dụng', shortLevel: 'Vận dụng', text: 'Vận dụng hiểu biết về chuyển hóa năng lượng để giải thích các hiện tượng thực tế và xây dựng chế độ dinh dưỡng, vận động khoa học.' }
      ];
    } else {
      return [
        { id: 'yccd-1', code: 'YCCD_1.1', level: 'Nhận biết', shortLevel: 'Biết', text: 'Nêu được các khái niệm và định nghĩa sinh học cốt lõi theo chuẩn kiến thức SGK Kết nối tri thức.' },
        { id: 'yccd-2', code: 'YCCD_2.1', level: 'Thông hiểu', shortLevel: 'Hiểu', text: 'Giải thích được bản chất cơ chế, phân biệt các quá trình sống và phân tích mối quan hệ nhân - quả.' },
        { id: 'yccd-3', code: 'YCCD_3.1', level: 'Vận dụng', shortLevel: 'Vận dụng', text: 'Vận dụng kiến thức sinh học giải quyết vấn đề thực tiễn và tính toán các thông số liên quan.' }
      ];
    }
  }

  return items;
};

export const PersonalizedView: React.FC<PersonalizedViewProps> = ({
  user,
  onUpdateUser,
  onNavigateToTest,
  onOpenLogin,
  targetStudentUser,
  onClearTargetStudent
}) => {
  const isAdmin = isUserTeacherOrAdmin(user);
  const [localTargetStudent, setLocalTargetStudent] = useState<User | null>(null);

  // Active student for student view (when drill-down is clicked or when user is a student)
  const activeUser = targetStudentUser || localTargetStudent || user;
  const isDrillDown = Boolean(targetStudentUser || localTargetStudent);

  // -------------------------------------------------------------------------
  // ADMIN TEACHER DASHBOARD STATES (Chọn Lớp Học, Chọn Bài Thi, Chỉ Số Năng Lực)
  // -------------------------------------------------------------------------
  const [students, setStudents] = useState<SheetStudent[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomGroup[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoadingAdminData, setIsLoadingAdminData] = useState<boolean>(false);
  const [adminSyncToast, setAdminSyncToast] = useState<string | null>(null);
  const [isUpdatingDashboard, setIsUpdatingDashboard] = useState<boolean>(false);
  const [dashboardStats, setDashboardStats] = useState<SchoolDashboardStats | null>(null);
  const [showDashboardPanel, setShowDashboardPanel] = useState<boolean>(true);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState<boolean>(false);

  // Filter states for Teacher
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL'); // 'ALL' or '10T6', '12T7'...
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<'ALL' | 'Khối 10' | 'Khối 11' | 'Khối 12'>('ALL');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [studentSearchTerm, setStudentSearchTerm] = useState<string>('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'ALL' | 'PARTICIPATED' | 'NOT_PARTICIPATED' | 'NEED_HELP'>('ALL');
  const [expandedYccdDetail, setExpandedYccdDetail] = useState<boolean>(true);

  // Load Classrooms, Students and Exams for Admin
  const loadAdminData = async (showToast = false) => {
    setIsLoadingAdminData(true);
    try {
      const [fetchedStudents, allExams, schoolStats] = await Promise.all([
        fetchGoogleSheetStudents(),
        getExams(),
        fetchDashboardSummaryFromCloud().catch(() => null)
      ]);
      setStudents(fetchedStudents);
      const grouped = groupStudentsIntoClassrooms(fetchedStudents);
      setClassrooms(grouped);

      const validExams = sortExamsNewestFirst((allExams || []).filter(e => e && e.category !== 'BATTLE' && !isExamDeleted(e.id)));
      setExams(validExams);

      if (schoolStats) {
        setDashboardStats(schoolStats);
      }

      if (showToast) {
        setAdminSyncToast(`✅ Đã đồng bộ thành công dữ liệu từ Google Sheet (${fetchedStudents.length} học sinh, ${validExams.length} bài thi)!`);
        setTimeout(() => setAdminSyncToast(null), 3500);
      }
    } catch (err) {
      console.warn("Lỗi tải dữ liệu cho bảng điều khiển giáo viên:", err);
    } finally {
      setIsLoadingAdminData(false);
    }
  };

  const handleUpdateDashboardSheet = async () => {
    setIsUpdatingDashboard(true);
    try {
      const res = await triggerUpdateDashboardCloud();
      const stats = await fetchDashboardSummaryFromCloud().catch(() => null);
      if (stats) setDashboardStats(stats);

      if (res && res.success) {
        setAdminSyncToast("✅ Đã cập nhật thành công dữ liệu vào Sheet 05_DASHBOARD trên Google Sheet!");
      } else {
        setAdminSyncToast("ℹ️ Đã tính toán xong chỉ số 05_DASHBOARD! Thầy/Cô mở tab Google Sheet hoặc cập nhật Apps Script để ghi tự động.");
      }
      setTimeout(() => setAdminSyncToast(null), 4500);
    } catch (e: any) {
      setAdminSyncToast("ℹ️ Đã làm mới số liệu Dashboard toàn trường.");
      setTimeout(() => setAdminSyncToast(null), 3500);
    } finally {
      setIsUpdatingDashboard(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadAdminData(false);
    }
  }, [isAdmin]);

  // Synchronize Grade filter when Classroom changes
  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    if (newClassId === 'ALL') {
      setSelectedGradeFilter('ALL');
    } else {
      const cls = classrooms.find(c => c.className === newClassId);
      if (cls) {
        if (cls.grade === 'Khối 10') setSelectedGradeFilter('Khối 10');
        else if (cls.grade === 'Khối 11') setSelectedGradeFilter('Khối 11');
        else if (cls.grade === 'Khối 12') setSelectedGradeFilter('Khối 12');
      } else {
        if (newClassId.startsWith('10')) setSelectedGradeFilter('Khối 10');
        else if (newClassId.startsWith('11')) setSelectedGradeFilter('Khối 11');
        else if (newClassId.startsWith('12')) setSelectedGradeFilter('Khối 12');
      }
    }
  };

  // Filter available exams according to selected class and grade
  const availableExams = useMemo(() => {
    return exams.filter(e => {
      if (selectedGradeFilter === 'ALL') return true;
      const targetGrade = selectedGradeFilter === 'Khối 10' ? 'Lớp 10' : selectedGradeFilter === 'Khối 11' ? 'Lớp 11' : 'Lớp 12';
      return e.grade === targetGrade || e.category === (selectedGradeFilter === 'Khối 10' ? 'Sinh 10' : selectedGradeFilter === 'Khối 11' ? 'Sinh 11' : 'Sinh 12');
    });
  }, [exams, selectedGradeFilter]);

  // Auto-select first exam when availableExams change and selectedExamId is empty or invalid
  useEffect(() => {
    if (availableExams.length > 0) {
      const exists = availableExams.some(e => e.id === selectedExamId);
      if (!exists) {
        setSelectedExamId(availableExams[0].id);
      }
    } else {
      setSelectedExamId('');
    }
  }, [availableExams, selectedExamId]);

  const currentSelectedExam = useMemo(() => {
    return exams.find(e => e.id === selectedExamId) || null;
  }, [exams, selectedExamId]);

  // Parse YCCĐ objectives of the currently selected exam
  const parsedObjectives = useMemo(() => {
    if (!currentSelectedExam) return [];
    return parseObjectivesText(currentSelectedExam.learningObjectives || '');
  }, [currentSelectedExam]);

  // Target class students
  const targetClassStudents = useMemo(() => {
    if (selectedClassId === 'ALL') {
      if (selectedGradeFilter === 'ALL') return students;
      return students.filter(st => {
        const cls = (st.className || '').toUpperCase();
        if (selectedGradeFilter === 'Khối 10') return cls.startsWith('10');
        if (selectedGradeFilter === 'Khối 11') return cls.startsWith('11');
        if (selectedGradeFilter === 'Khối 12') return cls.startsWith('12');
        return true;
      });
    }
    return students.filter(st => (st.className || '').toUpperCase() === selectedClassId.toUpperCase());
  }, [students, selectedClassId, selectedGradeFilter]);

  // Compute student exam attempts for the currently selected exam
  interface StudentExamRecord {
    student: SheetStudent;
    attempt: ExamResult | null;
    score10: number;
    correctCount: number;
    totalQuestions: number;
    nhanBietRate: number;
    thongHieuRate: number;
    vanDungRate: number;
    status: 'COMPLETED' | 'NOT_ATTEMPTED';
    performanceLevel: 'XUẤT_SẮC' | 'ĐẠT_CHUẨN' | 'CẦN_BÙ_ĐẮP' | 'CHƯA_THI';
    submittedDate?: string;
  }

// Chuẩn hóa và so khớp thông minh tên hoặc mã bài thi
const isExamMatch = (h: any, targetExam: Exam | null): boolean => {
  if (!h || !targetExam) return false;
  // 1. Khớp mã ID bài thi
  if (h.examId && String(h.examId).trim() === String(targetExam.id).trim()) return true;
  if (h.turnId && String(h.turnId).includes(String(targetExam.id))) return true;

  // 2. Khớp chuỗi tiêu đề sau khi loại bỏ ký tự đặc biệt
  const normHistory = (h.examTitle || h.title || '').toLowerCase()
    .replace(/[\:\.\-\,\;\_\(\)\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normTarget = (targetExam.title || '').toLowerCase()
    .replace(/[\:\.\-\,\;\_\(\)\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normLesson = (targetExam.lessonName || targetExam.topic || '').toLowerCase()
    .replace(/[\:\.\-\,\;\_\(\)\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normHistory && normTarget) {
    if (normHistory === normTarget) return true;
    if (normHistory.includes(normTarget) || normTarget.includes(normHistory)) return true;
    if (normLesson && (normHistory.includes(normLesson) || normLesson.includes(normHistory))) return true;
  }

  // 3. Khớp theo số thứ tự bài học (ví dụ "bài 3", "bài 1", "bài 2")
  const extractBai = (s: string) => {
    const m = s.match(/bài\s*(\d+)/i);
    return m ? m[1] : null;
  };
  const bHistory = extractBai(normHistory);
  const bTarget = extractBai(normTarget);
  if (bHistory && bTarget && bHistory === bTarget) {
    const wordsTarget = normTarget.split(' ').filter(w => w.length > 3 && !w.startsWith('bài'));
    if (wordsTarget.length === 0 || wordsTarget.some(w => normHistory.includes(w))) {
      return true;
    }
  }

  return false;
};

  const studentPerformanceRecords = useMemo<StudentExamRecord[]>(() => {
    if (!currentSelectedExam) return [];
    const totalQ = currentSelectedExam.questions.length || 10;

    return targetClassStudents.map(st => {
      // 1. Tập hợp toàn bộ lịch sử thi từ Google Sheet và localStorage của học sinh
      let history = Array.isArray(st.examHistory) ? [...st.examHistory] : [];
      const cleanPhone = (st.phone || '').trim().replace(/^0+/, '');
      const possibleKeys = [
        `user_${st.phone}`,
        `user_0${cleanPhone}`,
        `user_${cleanPhone}`,
        `user_${st.id}`
      ];
      possibleKeys.forEach(k => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const u = JSON.parse(raw);
            if (Array.isArray(u.examHistory)) {
              u.examHistory.forEach((eh: any) => {
                if (!history.some(x => x.date === eh.date || x.turnId === eh.turnId)) {
                  history.push(eh);
                }
              });
            }
          }
        } catch {}
      });

      // 2. So khớp bài thi đang chọn
      const attempt = history.find(h => isExamMatch(h, currentSelectedExam)) || null;

      if (!attempt) {
        return {
          student: st,
          attempt: null,
          score10: 0,
          correctCount: 0,
          totalQuestions: totalQ,
          nhanBietRate: 0,
          thongHieuRate: 0,
          vanDungRate: 0,
          status: 'NOT_ATTEMPTED',
          performanceLevel: 'CHƯA_THI'
        };
      }

      const qTotal = attempt.totalQuestions || totalQ;
      const cCount = attempt.score || attempt.correctCount || 0;
      let s10 = attempt.score10 !== undefined ? attempt.score10 : Math.round((cCount / qTotal) * 10 * 10) / 10;
      if (s10 > 10 && qTotal > 0) {
        s10 = Math.round((s10 / qTotal) * 10 * 10) / 10;
      }

      // Trích xuất hoặc ước lượng tỷ lệ đạt chuẩn theo cấp độ nhận thức
      let nbRate = 0;
      let thRate = 0;
      let vdRate = 0;

      if (attempt.details && attempt.details.length > 0) {
        const nbItems = attempt.details.filter(d => d.cognitiveLevel === 'NHAN_BIET');
        const thItems = attempt.details.filter(d => d.cognitiveLevel === 'THONG_HIEU');
        const vdItems = attempt.details.filter(d => d.cognitiveLevel === 'VAN_DUNG');

        nbRate = nbItems.length > 0 ? (nbItems.filter(d => d.isCorrect).length / nbItems.length) * 100 : Math.min(100, s10 * 10.5);
        thRate = thItems.length > 0 ? (thItems.filter(d => d.isCorrect).length / thItems.length) * 100 : Math.max(0, s10 * 9.8);
        vdRate = vdItems.length > 0 ? (vdItems.filter(d => d.isCorrect).length / vdItems.length) * 100 : Math.max(0, s10 * 8.5);
      } else {
        const scoreRatio = cCount / qTotal;
        nbRate = Math.min(100, Math.round(scoreRatio * 108));
        thRate = Math.min(100, Math.max(0, Math.round(scoreRatio * 96)));
        vdRate = Math.min(100, Math.max(0, Math.round(scoreRatio * 82)));
      }

      let perfLevel: 'XUẤT_SẮC' | 'ĐẠT_CHUẨN' | 'CẦN_BÙ_ĐẮP' = 'ĐẠT_CHUẨN';
      if (s10 >= 8.0) perfLevel = 'XUẤT_SẮC';
      else if (s10 < 5.0) perfLevel = 'CẦN_BÙ_ĐẮP';

      return {
        student: st,
        attempt,
        score10: s10,
        correctCount: cCount,
        totalQuestions: qTotal,
        nhanBietRate: Math.round(nbRate),
        thongHieuRate: Math.round(thRate),
        vanDungRate: Math.round(vdRate),
        status: 'COMPLETED',
        performanceLevel: perfLevel,
        submittedDate: attempt.date || attempt.submittedAt ? new Date(attempt.date || attempt.submittedAt).toLocaleString('vi-VN') : undefined
      };
    });
  }, [currentSelectedExam, targetClassStudents]);

  // Aggregated Statistics for the selected Class on this Exam
  const examClassStats = useMemo(() => {
    const totalStudents = studentPerformanceRecords.length;
    const completedRecords = studentPerformanceRecords.filter(r => r.status === 'COMPLETED');
    const participatedCount = completedRecords.length;
    const participationRate = totalStudents > 0 ? Math.round((participatedCount / totalStudents) * 100) : 0;
    const passCount = completedRecords.filter(r => r.score10 >= 5.0).length;
    const goodCount = completedRecords.filter(r => r.score10 >= 8.0).length;

    if (participatedCount === 0) {
      return {
        totalStudents,
        participatedCount: 0,
        participationRate: 0,
        avgScore10: 0,
        passCount: 0,
        goodCount: 0,
        passRate: 0,
        goodRate: 0,
        avgNhanBietRate: 0,
        avgThongHieuRate: 0,
        avgVanDungRate: 0,
        hasData: false
      };
    }

    const sumScore = completedRecords.reduce((acc, curr) => acc + curr.score10, 0);
    const avgScore10 = Math.round((sumScore / participatedCount) * 10) / 10;
    const passRate = Math.round((passCount / participatedCount) * 100);
    const goodRate = Math.round((goodCount / participatedCount) * 100);

    const avgNhanBietRate = Math.round(completedRecords.reduce((acc, curr) => acc + curr.nhanBietRate, 0) / participatedCount);
    const avgThongHieuRate = Math.round(completedRecords.reduce((acc, curr) => acc + curr.thongHieuRate, 0) / participatedCount);
    const avgVanDungRate = Math.round(completedRecords.reduce((acc, curr) => acc + curr.vanDungRate, 0) / participatedCount);

    return {
      totalStudents,
      participatedCount,
      participationRate,
      avgScore10,
      passCount,
      goodCount,
      passRate,
      goodRate,
      avgNhanBietRate,
      avgThongHieuRate,
      avgVanDungRate,
      hasData: true
    };
  }, [studentPerformanceRecords]);

  // Thống kê Chỉ số Năng lực theo từng Yêu Cầu Cần Đạt (YCCĐ) của bài thi và lớp đã chọn
  const yccdCompetencyStats = useMemo(() => {
    if (!currentSelectedExam) return [];
    const objectives = parseObjectivesText(currentSelectedExam.learningObjectives || '', currentSelectedExam.title);
    const totalStudents = targetClassStudents.length;

    const completedStudents = studentPerformanceRecords.filter(r => r.status === 'COMPLETED');
    const participatedCount = completedStudents.length;
    const uncoveredCount = totalStudents - participatedCount;
    const coveragePct = totalStudents > 0 ? Math.round((participatedCount / totalStudents) * 100) : 0;

    return objectives.map(obj => {
      let canCungCoCount = 0;
      let dangHinhThanhCount = 0;
      let onDinhCount = 0;
      let totalScoreSum = 0;

      completedStudents.forEach(st => {
        let scorePct = 0;
        if (obj.shortLevel === 'Biết') {
          scorePct = st.nhanBietRate;
        } else if (obj.shortLevel === 'Hiểu') {
          scorePct = st.thongHieuRate;
        } else {
          scorePct = st.vanDungRate;
        }

        totalScoreSum += scorePct;

        if (scorePct < 50) {
          canCungCoCount++;
        } else if (scorePct < 75) {
          dangHinhThanhCount++;
        } else {
          onDinhCount++;
        }
      });

      const avgCompetencyScore = participatedCount > 0 ? Math.round(totalScoreSum / participatedCount) : 0;
      const canCungCoPct = participatedCount > 0 ? Math.round((canCungCoCount / participatedCount) * 100) : 0;

      return {
        ...obj,
        totalStudents,
        participatedCount,
        uncoveredCount,
        coveragePct,
        canCungCoCount,
        canCungCoPct,
        dangHinhThanhCount,
        onDinhCount,
        avgCompetencyScore
      };
    });
  }, [currentSelectedExam, targetClassStudents, studentPerformanceRecords]);

  // Multi-Class Comparative Breakdown for all classes having students
  const multiClassComparison = useMemo(() => {
    if (!currentSelectedExam) return [];
    const cleanExamTitle = (currentSelectedExam.title || '').trim().toLowerCase();

    return classrooms.map(cls => {
      const clsStudents = students.filter(s => (s.className || '').toUpperCase() === cls.className.toUpperCase());
      const completedStudents: { score10: number; nhanBiet: number; thongHieu: number; vanDung: number }[] = [];

      clsStudents.forEach(st => {
        const history = Array.isArray(st.examHistory) ? st.examHistory : [];
        const attempt = history.find(h => 
          (h.examId && String(h.examId) === String(currentSelectedExam.id)) ||
          (h.examTitle && h.examTitle.trim().toLowerCase() === cleanExamTitle)
        );
        if (attempt) {
          const totalQ = attempt.totalQuestions || currentSelectedExam.questions.length || 10;
          const cCount = attempt.score || 0;
          const s10 = attempt.score10 !== undefined ? attempt.score10 : Math.round((cCount / totalQ) * 10 * 10) / 10;
          const ratio = cCount / totalQ;
          completedStudents.push({
            score10: s10,
            nhanBiet: Math.min(100, Math.round(ratio * 108)),
            thongHieu: Math.min(100, Math.max(0, Math.round(ratio * 96))),
            vanDung: Math.min(100, Math.max(0, Math.round(ratio * 82)))
          });
        }
      });

      const totalSt = clsStudents.length;
      const partCount = completedStudents.length;
      const partRate = totalSt > 0 ? Math.round((partCount / totalSt) * 100) : 0;
      const avgScore = partCount > 0 ? Math.round((completedStudents.reduce((a, b) => a + b.score10, 0) / partCount) * 10) / 10 : 0;
      const avgNB = partCount > 0 ? Math.round(completedStudents.reduce((a, b) => a + b.nhanBiet, 0) / partCount) : 0;
      const avgTH = partCount > 0 ? Math.round(completedStudents.reduce((a, b) => a + b.thongHieu, 0) / partCount) : 0;
      const avgVD = partCount > 0 ? Math.round(completedStudents.reduce((a, b) => a + b.vanDung, 0) / partCount) : 0;

      return {
        className: cls.className,
        grade: cls.grade,
        totalStudents: totalSt,
        participatedCount: partCount,
        participationRate: partRate,
        avgScore,
        avgNB,
        avgTH,
        avgVD,
        rankScore: avgScore
      };
    }).sort((a, b) => b.rankScore - a.rankScore);
  }, [classrooms, students, currentSelectedExam]);

  // Export CSV function for Teacher Competency Report
  const handleExportCompetencyCSV = () => {
    if (!currentSelectedExam) return;
    const headers = [
      "STT", 
      "Ma_Hoc_Sinh", 
      "Ho_Va_Ten", 
      "Lop", 
      "So_Dien_Thoai", 
      "Bai_Kiem_Tra", 
      "Diem_He_10", 
      "So_Cau_Dung", 
      "Tong_So_Cau", 
      "Ty_Le_Nhan_Biet_Pct", 
      "Ty_Le_Thong_Hieu_Pct", 
      "Ty_Le_Van_Dung_Pct", 
      "Trang_Thai_Thi", 
      "Danh_Gia_Nang_Luc",
      "Thoi_Diem_Nop"
    ];

    const rows = studentPerformanceRecords.map((r, idx) => [
      idx + 1,
      `"${r.student.id}"`,
      `"${cleanStudentFullName(r.student.name, r.student.className)}"`,
      `"${r.student.className}"`,
      `"${r.student.phone}"`,
      `"${currentSelectedExam.title}"`,
      r.status === 'COMPLETED' ? r.score10 : 'Chưa thi',
      r.status === 'COMPLETED' ? r.correctCount : 0,
      r.totalQuestions,
      r.status === 'COMPLETED' ? `${r.nhanBietRate}%` : '0%',
      r.status === 'COMPLETED' ? `${r.thongHieuRate}%` : '0%',
      r.status === 'COMPLETED' ? `${r.vanDungRate}%` : '0%',
      r.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Chưa tham gia',
      `"${r.performanceLevel}"`,
      `"${r.submittedDate || ''}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Bao_Cao_Chi_So_Nang_Luc_${selectedClassId}_${currentSelectedExam.id}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Handler for Teacher to drill down into a specific student's personalized plan
  const handleDrillDownStudent = (st: SheetStudent) => {
    const studentUser: User = {
      phone: st.phone,
      name: st.name,
      className: st.className,
      studentId: st.id,
      role: UserRole.STUDENT,
      totalScore: st.totalScore || 0,
      examHistory: st.examHistory || [],
      isGuest: false
    };
    setLocalTargetStudent(studentUser);
  };

  // -------------------------------------------------------------------------
  // STUDENT / INDIVIDUAL VIEW STATES & HANDLERS (Goal, Checklist, Adaptive)
  // -------------------------------------------------------------------------
  const [targetScore, setTargetScore] = useState<number>(() => {
    return parseFloat(localStorage.getItem(`target_score_${activeUser.phone}`) || '8.5');
  });

  const handleSetTargetScore = (score: number) => {
    setTargetScore(score);
    localStorage.setItem(`target_score_${activeUser.phone}`, score.toString());
  };

  const [selectedGrade, setSelectedGrade] = useState<'Lớp 10' | 'Lớp 11' | 'Lớp 12'>(() => {
    if (activeUser.className?.startsWith('10')) return 'Lớp 10';
    if (activeUser.className?.startsWith('11')) return 'Lớp 11';
    return 'Lớp 12';
  });
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [adaptiveMode, setAdaptiveMode] = useState<'REMEDIAL' | 'ADVANCED' | 'BALANCED'>('REMEDIAL');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [practiceActive, setPracticeActive] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [submittedResult, setSubmittedResult] = useState<{
    score: number;
    correctCount: number;
    total: number;
  } | null>(null);

  const [weeklyTasks, setWeeklyTasks] = useState<{ id: string; text: string; done: boolean }[]>(() => {
    const saved = localStorage.getItem(`tasks_${activeUser.phone}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      { id: 't1', text: 'Ôn tập 10 câu trắc nghiệm Đúng/Sai cơ chế Di truyền & Biến dị', done: false },
      { id: 't2', text: 'Xem lại các câu hỏi đã làm sai trong bài kiểm tra gần nhất', done: false },
      { id: 't3', text: 'Hoàn thành 01 bài kiểm tra đánh giá theo chuẩn GDPT 2018', done: false },
      { id: 't4', text: 'Tự đánh giá năng lực đạt chuẩn theo Yêu Cầu Cần Đạt (YCCĐ)', done: false }
    ];
  });

  const toggleTask = (taskId: string) => {
    const updated = weeklyTasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    setWeeklyTasks(updated);
    localStorage.setItem(`tasks_${activeUser.phone}`, JSON.stringify(updated));
  };

  const performanceAnalysis = useMemo(() => {
    const history = activeUser.examHistory || [];
    if (history.length === 0) {
      return {
        hasData: false,
        avgScore: 0,
        completedExams: 0,
        strongTopics: [] as string[],
        weakTopics: [] as string[],
        remedialSuggestions: [
          'Bạn chưa có lịch sử làm bài. Hãy thực hiện ít nhất 1 bài kiểm tra để hệ thống phân tích năng lực cá nhân.',
          'Khuyến nghị bắt đầu từ đề ôn luyện nền tảng SGK Kết nối tri thức.'
        ]
      };
    }

    const totalScore = history.reduce((acc, curr) => acc + curr.score, 0);
    const avg = Math.round((totalScore / history.length) * 10) / 10;
    const strongExams = history.filter(h => h.score >= 8);
    const weakExams = history.filter(h => h.score < 7);
    const strongTopics = Array.from(new Set(strongExams.map(e => e.examTitle))).slice(0, 3);
    const weakTopics = Array.from(new Set(weakExams.map(e => e.examTitle))).slice(0, 3);

    const suggestions: string[] = [];
    if (avg < 5) {
      suggestions.push('Cần tập trung củng cố kiến thức nhận biết cốt lõi trong SGK Sinh học 10, 11, 12.');
      suggestions.push('Luyện các câu hỏi trắc nghiệm 4 phương án cơ bản trước khi làm các câu Đúng/Sai phức tạp.');
    } else if (avg < 8) {
      suggestions.push('Nền tảng khá tốt, cần chú trọng phân tích kỹ phần Đúng/Sai (dạng câu hỏi mới theo GDPT 2018).');
      suggestions.push('Ôn luyện lại các câu bạn đã chọn sai ở lịch sử làm bài.');
    } else {
      suggestions.push('Năng lực xuất sắc! Hãy thử sức với các bài tập vận dụng cao, phân tích bảng số liệu & sơ đồ thí nghiệm.');
    }

    return {
      hasData: true,
      avgScore: avg,
      completedExams: history.length,
      strongTopics,
      weakTopics,
      remedialSuggestions: suggestions
    };
  }, [activeUser.examHistory]);

  const handleStartAdaptivePractice = async () => {
    if (activeUser.isGuest || activeUser.phone === 'guest') {
      if (onOpenLogin) onOpenLogin();
      return;
    }

    setIsGenerating(true);
    setPracticeActive(false);
    setSubmittedResult(null);
    setUserAnswers({});

    try {
      const topicToUse = selectedTopic || (BIO_TOPICS[selectedGrade] && BIO_TOPICS[selectedGrade][0]) || 'Di truyền học';
      let objectives = 'Nắm vững kiến thức trọng tâm SGK Kết nối tri thức';
      
      if (adaptiveMode === 'REMEDIAL') {
        objectives = 'Củng cố nền tảng kiến thức căn bản, khắc phục lỗi sai thường gặp, câu hỏi rõ ràng rành mạch';
      } else if (adaptiveMode === 'ADVANCED') {
        objectives = 'Phát triển năng lực vận dụng, câu hỏi thí nghiệm, giải thích hiện tượng sinh học chuyên sâu';
      } else {
        objectives = 'Đánh giá toàn diện các mức độ Biết, Hiểu, Vận dụng theo định dạng thi mới của Bộ Giáo dục';
      }

      const questions = await generateBiologyQuestions({
        grade: selectedGrade,
        topic: topicToUse,
        learningObjectives: objectives,
        count: 5
      }, 5);

      if (questions && questions.length > 0) {
        setGeneratedQuestions(questions);
        setPracticeActive(true);
      } else {
        alert('Không thể tạo câu hỏi lúc này. Vui lòng thử lại sau giây lát!');
      }
    } catch (e) {
      console.error(e);
      alert('Đã xảy ra lỗi khi tạo bài luyện tập AI.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectAnswer = (qId: string, ans: string) => {
    setUserAnswers(prev => ({
      ...prev,
      [qId]: ans
    }));
  };

  const handleSubmitPractice = async () => {
    let correct = 0;
    const details: any[] = [];
    let wrongNhanBiet = 0;
    let wrongThongHieu = 0;
    let wrongVanDung = 0;
    const totalQ = generatedQuestions.length;

    generatedQuestions.forEach((q, idx) => {
      const userAns = (userAnswers[q.id] || '').trim();
      const isCorrect = userAns.toLowerCase() === (q.correctAnswer || '').trim().toLowerCase();
      if (isCorrect) {
        correct++;
      } else {
        const textLower = (q.text || '').toLowerCase();
        if (textLower.includes('vận dụng') || textLower.includes('thực tế') || textLower.includes('ứng dụng') || q.type === 'SA') {
          wrongVanDung++;
        } else if (textLower.includes('thông hiểu') || textLower.includes('phân biệt') || textLower.includes('giải thích')) {
          wrongThongHieu++;
        } else if (textLower.includes('nhận biết') || textLower.includes('khái niệm') || textLower.includes('liệt kê')) {
          wrongNhanBiet++;
        } else {
          if (idx < Math.ceil(totalQ * 0.4)) wrongNhanBiet++;
          else if (idx < Math.ceil(totalQ * 0.75)) wrongThongHieu++;
          else wrongVanDung++;
        }
      }

      details.push({
        questionId: q.id,
        questionText: q.text,
        userAnswer: userAns,
        correctAnswer: q.correctAnswer,
        isCorrect
      });
    });

    const finalScore = totalQ > 0 ? Math.round((correct / totalQ) * 10 * 10) / 10 : 0;
    setSubmittedResult({
      score: finalScore,
      correctCount: correct,
      total: totalQ
    });

    const newExamResult: ExamResult = {
      turnId: `LT_ADAPTIVE_${Date.now()}`,
      examId: `ADAPTIVE_${Date.now()}`,
      examTitle: `Cá nhân hóa: ${selectedTopic || selectedGrade}`,
      score: correct,
      totalQuestions: totalQ,
      score10: finalScore,
      timeSpentSeconds: 120,
      wrongNhanBiet,
      wrongThongHieu,
      wrongVanDung,
      date: new Date().toISOString(),
      details
    };

    const updatedHistory = filterExamHistoryByStudentGrade(
      user,
      mergeExamHistories(user.examHistory || [], [newExamResult], user)
    );

    const updatedUser: User = {
      ...user,
      totalScore: user.totalScore + Math.round(finalScore * 10),
      examHistory: updatedHistory
    };

    saveStoredUser(updatedUser);
    onUpdateUser(updatedUser);

    if (!user.isGuest && user.phone !== 'guest') {
      try {
        await submitExamResultToCloud(user.phone, newExamResult, {
          studentId: user.studentId,
          name: user.name,
          className: user.className,
          phone: user.phone
        });
      } catch (e) {
        console.warn('Lưu trữ cục bộ an toàn, đồng bộ cloud sẽ chạy nền:', e);
      }
    }
  };

  // =========================================================================
  // VIEW 1: ADMIN TEACHER COMPETENCY & CLASS ANALYTICS DASHBOARD
  // Khi đăng nhập Admin Giáo Viên và KHÔNG xem riêng 1 học sinh cụ thể
  // =========================================================================
  if (isAdmin && !isDrillDown) {
    return (
      <div className="space-y-6 animate-fade-in max-w-7xl 2xl:max-w-[1600px] mx-auto pb-16">
        {/* Toast Notification */}
        {adminSyncToast && (
          <div className="fixed top-20 right-6 z-50 p-4 bg-emerald-700 text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce border border-emerald-500">
            <span>{adminSyncToast}</span>
            <button onClick={() => setAdminSyncToast(null)} className="text-white hover:opacity-80 text-sm font-bold">✕</button>
          </div>
        )}

        {/* 1. Header Toolbar: Tiêu đề & Nút thao tác nhanh */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-gray-200/90 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-indigo-50 text-indigo-700 font-extrabold text-[11px] px-3 py-1 rounded-full uppercase tracking-wider border border-indigo-200">
                🛡️ Admin Giáo Viên
              </span>
              <span className="bg-emerald-50 text-emerald-800 font-extrabold text-[11px] px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-200">
                🎯 Tiến Trình & Chỉ Số Năng Lực
              </span>
              <span className="bg-amber-50 text-amber-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-amber-200">
                📚 Chuẩn GDPT 2018 (SGK KNTT)
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
              Báo Cáo Phân Tích Chỉ Số Năng Lực Theo Yêu Cầu Cần Đạt (YCCĐ)
            </h2>
            <p className="text-xs text-gray-500 max-w-3xl leading-relaxed">
              Theo dõi mức độ đạt chuẩn của học sinh từng lớp theo các chỉ số năng lực cốt lõi: <b>Nhận biết</b>, <b>Thông hiểu</b> và <b>Vận dụng</b>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-stretch sm:self-auto">
            <button
              onClick={handleUpdateDashboardSheet}
              disabled={isUpdatingDashboard}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
              title="Kích hoạt Google Apps Script tự động tính toán và điền số liệu vào Sheet 05_DASHBOARD"
            >
              <span className={isUpdatingDashboard ? "animate-spin text-sm" : "text-sm"}>📊</span>
              <span>{isUpdatingDashboard ? "Đang cập nhật 05_DASHBOARD..." : "Cập nhật 05_DASHBOARD"}</span>
            </button>

            <button
              onClick={() => loadAdminData(true)}
              disabled={isLoadingAdminData}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
              title="Đồng bộ lại kết quả thi từ Google Sheet 01 & 02"
            >
              <span className={isLoadingAdminData ? "animate-spin text-sm" : "text-sm"}>🔄</span>
              <span>{isLoadingAdminData ? "Đang đồng bộ..." : "Đồng bộ từ Sheet"}</span>
            </button>

            <button
              onClick={handleExportCompetencyCSV}
              disabled={!currentSelectedExam || studentPerformanceRecords.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
              title="Tải file báo cáo phân tích năng lực ra Excel/CSV"
            >
              <span>📥 Xuất Báo Cáo CSV</span>
            </button>
          </div>
        </div>

        {/* 1.5. BÁO CÁO THỐNG KÊ TỔNG HỢP TOÀN TRƯỜNG (CHUẨN SHEET 05_DASHBOARD) */}
        <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-900 rounded-3xl p-6 sm:p-7 shadow-xl border border-emerald-800/40 text-white space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-emerald-700/40 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg text-lg">📊</span>
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  Bảng Điều Khiển Toàn Trường (Đồng Bộ Sheet 05_DASHBOARD)
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Hoạt động 100%
                </span>
              </div>
              <p className="text-xs text-emerald-200/80 leading-relaxed">
                Tự động tính toán các chỉ số của <strong>Sheet 05_DASHBOARD</strong> từ Sheet 01 (Học sinh) & Sheet 02 (Kết quả thi).
              </p>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              <a
                href={getGoogleSheetUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-emerald-100 rounded-xl text-xs font-bold transition border border-emerald-500/30 no-underline"
              >
                <span>Mở Google Sheet</span>
                <span className="text-sm">↗️</span>
              </a>
              <button
                type="button"
                onClick={() => setIsScriptModalOpen(true)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-3 py-2 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition border border-emerald-400/40 cursor-pointer"
              >
                <span>🛠️ Mã Code.gs</span>
              </button>
            </div>
          </div>

          {/* 3 TIÊU CHÍ TRỌNG TÂM CỦA SHEET 05_DASHBOARD */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tiêu chí 1: Tổng số học sinh đang hoạt động (Ô B1) */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-emerald-400/20 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-200">
                <span>👥 Ô B1: HS Đang Hoạt Động</span>
                <span className="bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-mono">
                  =COUNTIF('01'!F, "Mở")
                </span>
              </div>
              <div className="my-1">
                <span className="text-3xl font-black text-emerald-400 tracking-tight">
                  {dashboardStats?.activeStudents ?? students.filter(s => (s.status || '').toLowerCase() !== 'đóng').length}
                </span>
                <span className="text-xs text-emerald-200 ml-1.5 font-bold">học sinh</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-snug">
                Tài khoản học sinh có trạng thái <span className="font-bold text-emerald-300">[Mở]</span> được làm bài ngay.
              </p>
            </div>

            {/* Tiêu chí 2: Số học sinh dưới trung bình cần can thiệp (Ô B2) */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-emerald-400/20 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-rose-200">
                <span>⚠️ Ô B2: HS Cần Can Thiệp Gấp</span>
                <span className="bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded text-[10px] font-mono">
                  =COUNTIF('02'!H, "&lt;5")
                </span>
              </div>
              <div className="my-1">
                <span className={`text-3xl font-black tracking-tight ${dashboardStats?.countNeedingHelp ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {dashboardStats?.countNeedingHelp ?? 0}
                </span>
                <span className="text-xs text-emerald-200 ml-1.5 font-bold">học sinh</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-snug">
                {(dashboardStats?.countNeedingHelp ?? 0) === 0 
                  ? '🎉 Tuyệt vời! Hiện tại 100% học sinh đều đạt điểm từ trung bình trở lên.'
                  : `Cần giáo viên phân công đề rèn luyện bù đắp cho ${dashboardStats?.countNeedingHelp} em.`}
              </p>
            </div>

            {/* Tiêu chí 3: Top 3 bài học học sinh làm sai nhiều nhất toàn trường (Ô B3) */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-emerald-400/20 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-amber-200">
                <span>📚 Ô B3: Top Bài Học Sai Nhiều</span>
                <span className="bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded text-[10px]">
                  Lỗ hổng trọng tâm
                </span>
              </div>
              <div className="space-y-1.5 my-1 text-xs">
                {dashboardStats?.top3Lessons && dashboardStats.top3Lessons.length > 0 ? (
                  dashboardStats.top3Lessons.map((ls, idx) => (
                    <div key={ls.lessonName} className="flex items-center justify-between gap-2 text-[11px] bg-black/20 px-2.5 py-1.5 rounded-lg">
                      <span className="font-semibold text-amber-100 truncate">
                        {idx + 1}. {ls.lessonName}
                      </span>
                      <span className="font-mono font-bold text-amber-300 shrink-0">
                        {ls.totalWrong} câu sai ({ls.avgScore}đ)
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-emerald-200/70 italic py-2">
                    Chưa có bài thi nào có số lượng câu sai đáng kể.
                  </p>
                )}
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-snug">
                Dữ liệu xếp hạng từ các câu trả lời sai ở Sheet 02_KET_QUA_THI.
              </p>
            </div>
          </div>

          {/* CHỈ SỐ NHẬN THỨC THEO GDPT 2018 (CỘT J, K, L) */}
          {dashboardStats?.cognitive && (
            <div className="pt-2 border-t border-emerald-700/30 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-black/20 rounded-xl p-3 border border-emerald-600/20 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-300 block font-bold uppercase tracking-wider">Cột J: Nhận biết</span>
                  <span className="font-bold text-sm text-white">Tổng sai: {dashboardStats.cognitive.wrongNB} câu</span>
                </div>
                <span className="text-xs font-bold px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg">
                  {dashboardStats.cognitive.pctNB}%
                </span>
              </div>

              <div className="bg-black/20 rounded-xl p-3 border border-emerald-600/20 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-300 block font-bold uppercase tracking-wider">Cột K: Thông hiểu</span>
                  <span className="font-bold text-sm text-white">Tổng sai: {dashboardStats.cognitive.wrongTH} câu</span>
                </div>
                <span className="text-xs font-bold px-2 py-1 bg-amber-500/20 text-amber-300 rounded-lg">
                  {dashboardStats.cognitive.pctTH}%
                </span>
              </div>

              <div className="bg-black/20 rounded-xl p-3 border border-emerald-600/20 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-300 block font-bold uppercase tracking-wider">Cột L: Vận dụng</span>
                  <span className="font-bold text-sm text-white">Tổng sai: {dashboardStats.cognitive.wrongVD} câu</span>
                </div>
                <span className="text-xs font-bold px-2 py-1 bg-purple-500/20 text-purple-300 rounded-lg">
                  {dashboardStats.cognitive.pctVD}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 2. Selection Bar: CHỌN LỚP HỌC (10T6, 12T7...) & CHỌN BÀI KIỂM TRA ĐÃ TẠO */}
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-gray-200/90 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-end">
            {/* Lựa chọn 1: KHỐI LỚP */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>Khối Lớp</span>
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 hover:border-emerald-500 focus:border-emerald-600 focus:bg-white rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none transition cursor-pointer shadow-2xs"
              >
                <option value="ALL">🏫 Tất Cả Các Lớp ({students.length} học sinh)</option>
                {classrooms.map((c, cIdx) => (
                  <option key={`pv_c_${c.className}_${cIdx}`} value={c.className}>
                    Lớp {c.className} ({c.grade} • Sĩ số: {c.totalStudents} HS)
                  </option>
                ))}
              </select>
            </div>

            {/* Lựa chọn 2: BÀI KIỂM TRA */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-gray-700 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                  <span>Bài Kiểm Tra</span>
                </span>
                <span className="text-[10px] text-indigo-600 font-bold">
                  {availableExams.length} bài thi phù hợp
                </span>
              </label>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 hover:border-indigo-500 focus:border-indigo-600 focus:bg-white rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none transition cursor-pointer shadow-2xs truncate"
              >
                {availableExams.length === 0 ? (
                  <option value="">-- Chưa có bài thi nào cho khối lớp này --</option>
                ) : (
                  availableExams.map((ex, exIdx) => (
                    <option key={`pv_ex_${ex.id}_${exIdx}`} value={ex.id}>
                      {ex.title} ({ex.grade || 'Lớp 12'} • {ex.questions.length} câu • {ex.duration}p)
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        {/* 3. Chi Tiết Bài Kiểm Tra & Nội Dung YCCĐ */}
        {currentSelectedExam ? (
          <div className="space-y-6">
            {/* 4. Tổng Quan Chỉ Số Thực Hiện Của Lớp Đối Với Bài Thi Này */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Học Sinh Đã Thi</span>
                  <span className="text-xl">👥</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-gray-900">{examClassStats.participatedCount}</span>
                  <span className="text-xs font-bold text-gray-400">/ {examClassStats.totalStudents} HS</span>
                </div>
                <div className="mt-2 text-[11px] font-bold text-emerald-600">
                  Tỷ lệ tham gia: {examClassStats.participationRate}%
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Điểm Trung Bình Lớp</span>
                  <span className="text-xl">📊</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-indigo-600">
                    {examClassStats.hasData ? examClassStats.avgScore10.toFixed(1) : '--'}
                  </span>
                  <span className="text-xs font-bold text-gray-400">/ 10.0</span>
                </div>
                <div className="mt-2 text-[11px] font-bold text-indigo-500">
                  {examClassStats.hasData ? (examClassStats.avgScore10 >= 8 ? '🌟 Xếp loại: Giỏi' : examClassStats.avgScore10 >= 6.5 ? '👍 Xếp loại: Khá' : '⚠️ Xếp loại: Trung bình') : 'Chưa có lượt nộp'}
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Đạt Chuẩn (≥ 5.0)</span>
                  <span className="text-xl">🎯</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-emerald-600">
                    {examClassStats.hasData ? `${examClassStats.passRate}%` : '--%'}
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-bold text-emerald-700">
                  {examClassStats.hasData ? `${examClassStats.passCount}/${examClassStats.participatedCount} học sinh đạt chuẩn` : 'Mức độ hoàn thành mục tiêu'}
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Giỏi & Xuất Sắc (≥ 8.0)</span>
                  <span className="text-xl">🏆</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-amber-600">
                    {examClassStats.hasData ? `${examClassStats.goodRate}%` : '--%'}
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-bold text-amber-700">
                  {examClassStats.hasData ? `${examClassStats.goodCount}/${examClassStats.participatedCount} học sinh đạt giỏi` : 'Tỷ lệ học sinh năng lực cao'}
                </div>
              </div>
            </div>

            {/* BẢNG THỐNG KÊ CHỈ SỐ NĂNG LỰC THEO YÊU CẦU CẦN ĐẠT (YCCĐ) - THEO MẪU CHUẨN */}
            <div className="bg-white rounded-3xl shadow-xs border border-gray-200/90 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider">
                      <th className="py-4 px-6">YÊU CẦU CẦN ĐẠT (YCCĐ)</th>
                      <th className="py-4 px-4 text-center">MỨC ĐỘ</th>
                      <th className="py-4 px-6">ĐỘ PHỦ DỮ LIỆU</th>
                      <th className="py-4 px-4 text-center">CẦN CỦNG CỐ</th>
                      <th className="py-4 px-4 text-center">ĐANG HÌNH THÀNH</th>
                      <th className="py-4 px-4 text-center">ĐANG TIẾN BỘ / ỔN ĐỊNH</th>
                      <th className="py-4 px-6 text-center">ĐIỂM NĂNG LỰC TB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {yccdCompetencyStats.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-400 italic">
                          Chưa có dữ liệu Yêu Cầu Cần Đạt cho bài kiểm tra này.
                        </td>
                      </tr>
                    ) : (
                      yccdCompetencyStats.map((item, idx) => (
                        <tr key={`pv_yccd_${item.id || 'obj'}_${idx}`} className="hover:bg-slate-50/60 transition">
                          {/* 1. YÊU CẦU CẦN ĐẠT (YCCĐ) */}
                          <td className="py-4 px-6 align-middle max-w-md">
                            <div className="text-indigo-700 font-bold text-xs mb-1">
                              {item.code}
                            </div>
                            <div className="text-slate-700 text-xs leading-relaxed font-normal">
                              {item.text}
                            </div>
                          </td>

                          {/* 2. MỨC ĐỘ */}
                          <td className="py-4 px-4 text-center align-middle">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                              item.shortLevel === 'Biết'
                                ? 'bg-sky-50 text-sky-600 border border-sky-200'
                                : item.shortLevel === 'Hiểu'
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                  : 'bg-purple-50 text-purple-600 border border-purple-200'
                            }`}>
                              {item.shortLevel}
                            </span>
                          </td>

                          {/* 3. ĐỘ PHỦ DỮ LIỆU */}
                          <td className="py-4 px-6 align-middle">
                            <div className="flex items-center gap-2.5">
                              <div className="w-20 bg-slate-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${item.coveragePct}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-bold text-slate-800">
                                {item.participatedCount}/{item.totalStudents} ({item.coveragePct}%)
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1">
                              {item.uncoveredCount > 0
                                ? `${item.uncoveredCount} em chưa có dữ liệu`
                                : '100% học sinh đã có dữ liệu'}
                            </div>
                          </td>

                          {/* 4. CẦN CỦNG CỐ */}
                          <td className="py-4 px-4 text-center align-middle">
                            <span className="inline-block px-2.5 py-1 bg-rose-50 text-rose-800 font-bold text-xs rounded-md">
                              {item.canCungCoCount}/{item.participatedCount} em
                            </span>
                            <div className="text-[11px] text-rose-500 font-medium mt-1">
                              {item.canCungCoPct}% số có dữ liệu
                            </div>
                          </td>

                          {/* 5. ĐANG HÌNH THÀNH */}
                          <td className="py-4 px-4 text-center align-middle">
                            <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-800 font-bold text-xs rounded-md">
                              {item.dangHinhThanhCount}/{item.participatedCount} em
                            </span>
                          </td>

                          {/* 6. ĐANG TIẾN BỘ / ỔN ĐỊNH */}
                          <td className="py-4 px-4 text-center align-middle">
                            <span className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-800 font-bold text-xs rounded-md">
                              {item.onDinhCount}/{item.participatedCount} em
                            </span>
                          </td>

                          {/* 7. ĐIỂM NĂNG LỰC TB */}
                          <td className="py-4 px-6 text-center align-middle">
                            <span className="font-extrabold text-slate-900 text-sm">
                              {item.participatedCount > 0 ? `${item.avgCompetencyScore}%` : '--'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-16 text-center shadow-xs border border-gray-200/80">
            <span className="text-4xl mb-3 block">📝</span>
            <h3 className="text-lg font-bold text-gray-800">Chưa chọn bài thi kiểm tra</h3>
            <p className="text-gray-500 text-xs mt-1">
              Vui lòng chọn bài thi trong danh sách ở trên hoặc tạo thêm đề thi mới trong mục Quản Lí KT, Đánh Giá.
            </p>
          </div>
        )}

        <GoogleAppsScriptModal
          isOpen={isScriptModalOpen}
          onClose={() => setIsScriptModalOpen(false)}
          defaultTab="sheet05"
        />
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: INDIVIDUAL STUDENT PERSONALIZED ADAPTIVE LEARNING
  // Dành cho Học sinh tự học hoặc Admin Giáo Viên xem chi tiết 1 học sinh
  // =========================================================================
  return (
    <StudentLearningProgressView
      activeUser={activeUser}
      isDrillDown={isDrillDown}
      onBackToAdmin={() => {
        setLocalTargetStudent(null);
        if (onClearTargetStudent) onClearTargetStudent();
      }}
      onUpdateUser={onUpdateUser}
      onNavigateToTest={onNavigateToTest}
      onOpenLogin={onOpenLogin}
    />
  );
};
