import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { User, UserRole, StudentCompetencyProfile, DiagnosticErrorItem, Exam } from '../types';
import { 
  SheetStudent, 
  ClassroomGroup, 
  fetchGoogleSheetStudents, 
  groupStudentsIntoClassrooms, 
  fetchGoogleSheetExamResults,
  getGoogleSheetUrl,
  getStudentGrade,
  getExams,
  getMasterExams,
  getStudentAttemptsForActiveExams,
  isExamDeleted,
  getExamGrade,
  isRemedialOrPracticeTurn,
  isExamAttemptMatching,
  isMatchingExamId,
  normalizeTitleKey
} from '../services/dataService';
import { getSavedCompetencyProfile } from '../services/diagnosticService';

interface ReportViewProps {
  user: User;
  onNavigateToPersonalized?: (student: SheetStudent) => void;
  onNavigateToTest?: () => void;
}

// Helper định dạng ngày tháng an toàn không bị lỗi 'Invalid Date'
export const formatViDateSafe = (d?: any): string => {
  if (!d) return '';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('vi-VN');
};

// Helper lấy thuần Họ và Tên học sinh không kèm tiền tố lớp hoặc mã HS (Ví dụ: "Nguyễn Văn C")
export const cleanStudentFullName = (name: string, className?: string): string => {
  let clean = (name || '').trim();
  if (!clean) return 'Học sinh';
  
  if (className) {
    const cleanClass = className.trim();
    if (cleanClass) {
      const classRegex = new RegExp(`^${cleanClass}[_\\-\\s]+`, 'i');
      clean = clean.replace(classRegex, '');
    }
  }
  
  // Loại bỏ các tiền tố lớp định dạng [Khối][Lớp] (ví dụ: "10T6_", "12T7 - ", "11B1_") hoặc [Mã HS]_ (ví dụ: "10T601_")
  clean = clean.replace(/^[0-9]{1,2}[A-Za-z0-9]+[_\\-\\s]+/, '');
  
  return clean.trim() || clean;
};

// Helper format Họ và Tên theo định dạng [Lớp]_[Tên] (Ví dụ: 10T6_Nguyễn Văn A)
export const formatStudentReportName = (name: string, className?: string): string => {
  const cleanName = cleanStudentFullName(name, className);
  const cleanClass = (className || '').trim().toUpperCase();
  if (!cleanClass || cleanClass === 'CHƯA XẾP LỚP') {
    return cleanName || 'Học sinh';
  }
  return `${cleanClass}_${cleanName}`;
};

// Helper format hiển thị trong ô Chọn Học Sinh: ID_Họ_và_Tên (Ví dụ: 10T601_Nguyễn Văn A)
export const formatStudentSelectorOption = (student: SheetStudent): string => {
  const id = (student.id || '').trim();
  const cleanName = cleanStudentFullName(student.name, student.className);
  if (!id) return cleanName || 'Học sinh';
  if (!cleanName || cleanName === id || cleanName === 'Học sinh') return id;
  return `${id}_${cleanName}`;
};

// Cấu trúc một trường hợp cá nhân hóa (Bao gồm: Điểm kiểm tra lần 1, % và số điểm đạt khi luyện đề bù đắp, điểm sau khi làm lại đề cũ, điểm tiến bộ)
export interface PersonalizedProgressCase {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  phone: string;
  examId: string;
  examTitle: string;
  examGrade?: string;
  initialScore10: number;
  initialCorrect: number;
  initialTotal: number;
  initialDate?: string;
  initialWrongNB: number;
  initialWrongTH: number;
  initialWrongVD: number;
  practicePercent: number; // Tỷ lệ đạt khi luyện đề bù đắp (%)
  practiceScore: number;   // Số câu/điểm đạt khi luyện đề
  practiceTotal: number;   // Tổng số câu luyện đề
  practiceTopics: string[]; // Các chủ đề/YCCĐ đã bù đắp
  hasRetaken: boolean;     // Đã làm lại đề cũ chưa
  retestScore10?: number;  // Điểm sau khi làm lại đề cũ
  retestCorrect?: number;
  retestTotal?: number;
  retestDate?: string;
  scoreDelta: number;      // Mức tiến bộ (retestScore10 - initialScore10)
  status: 'TIẾN_BỘ_VƯỢT_BẬC' | 'CÓ_TIẾN_BỘ' | 'GIỮ_VỮNG' | 'CẦN_CỐ_GẮNG' | 'ĐANG_LUYỆN_BÙ_ĐẮP';
  rawProfile?: StudentCompetencyProfile | null;
}

export const ReportView: React.FC<ReportViewProps> = ({
  user,
  onNavigateToPersonalized,
  onNavigateToTest
}) => {
  const [students, setStudents] = useState<SheetStudent[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomGroup[]>([]);
  const [cloudExamResults, setCloudExamResults] = useState<any[]>([]);
  const [systemExams, setSystemExams] = useState<Exam[]>(() => (getMasterExams() || []).filter(e => e && !isExamDeleted(e)));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  
  // Filters
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL'); // 'ALL' | 'Khối 10' | 'Khối 11' | 'Khối 12'
  const [selectedClass, setSelectedClass] = useState<string>('ALL'); // 'ALL' | '10T6' | '12T7'...
  const [reportMode, setReportMode] = useState<'CLASS' | 'INDIVIDUAL' | 'PERSONALIZED'>('CLASS');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL'); // 'ALL' | 'XUẤT_SẮC' | 'ĐẠT_CHUẨN' | 'CẦN_CỦNG_CỐ' | 'CHƯA_THI'
  const [personalizedFilter, setPersonalizedFilter] = useState<'ALL' | 'IMPROVED' | 'SUPER_IMPROVED' | 'RETAKEN' | 'IN_PRACTICE'>('ALL');
  const [selectedCaseModal, setSelectedCaseModal] = useState<PersonalizedProgressCase | null>(null);
  
  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = async (notify = false) => {
    if (notify) setIsSyncing(true);
    else setIsLoading(true);

    try {
      const [fetchedStudents, fetchedResults, fetchedExams] = await Promise.all([
        fetchGoogleSheetStudents(),
        fetchGoogleSheetExamResults().catch(() => []),
        getExams().catch(() => [])
      ]);

      const validExams = (Array.isArray(fetchedExams) && fetchedExams.length > 0 ? fetchedExams : getMasterExams()).filter(e => e && !isExamDeleted(e));
      setSystemExams(validExams);
      setStudents(fetchedStudents);
      setCloudExamResults(fetchedResults);
      const grouped = groupStudentsIntoClassrooms(fetchedStudents);
      setClassrooms(grouped);

      const timeStr = new Date().toLocaleTimeString('vi-VN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        day: '2-digit',
        month: '2-digit'
      });
      setLastSyncTime(timeStr);

      if (notify) {
        showToast(`✅ Đã đồng bộ mới nhất: ${fetchedStudents.length} học sinh, ${fetchedResults.length} lượt thi!`);
      }
    } catch (err) {
      console.error("Lỗi đồng bộ dữ liệu báo cáo:", err);
      if (notify) {
        showToast("⚠️ Không thể kết nối Google Sheets, đang hiển thị bản lưu đệm.");
      }
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  // Danh sách các khối thực tế
  const availableGrades = useMemo(() => {
    const gradesSet = new Set<string>();
    classrooms.forEach(c => {
      if (c.grade) gradesSet.add(c.grade);
    });
    const order = ['Khối 10', 'Khối 11', 'Khối 12'];
    return order.filter(g => gradesSet.has(g));
  }, [classrooms]);

  // Danh sách các lớp phù hợp với khối đã chọn
  const availableClasses = useMemo(() => {
    return classrooms.filter(c => {
      if (selectedGrade === 'ALL') return true;
      return c.grade === selectedGrade;
    });
  }, [classrooms, selectedGrade]);

  // Tự động reset lớp nếu lớp đó không thuộc khối đã chọn
  useEffect(() => {
    if (selectedClass !== 'ALL') {
      const exists = availableClasses.some(c => c.className === selectedClass);
      if (!exists) {
        setSelectedClass('ALL');
      }
    }
  }, [selectedGrade, availableClasses, selectedClass]);

  // Danh sách học sinh theo phạm vi Khối / Lớp
  const studentsInScope = useMemo(() => {
    return students.filter(s => {
      // 1. Lọc theo Khối
      if (selectedGrade !== 'ALL') {
        const studentG = getStudentGrade(s);
        const matchGrade = selectedGrade === `Khối ${studentG}` || s.className.startsWith(selectedGrade.replace('Khối ', ''));
        if (!matchGrade) return false;
      }
      // 2. Lọc theo Lớp
      if (selectedClass !== 'ALL') {
        if (s.className.toUpperCase() !== selectedClass.toUpperCase()) return false;
      }
      return true;
    });
  }, [students, selectedGrade, selectedClass]);

  // Danh sách các đề thi HIỆN CÓ TRÊN HỆ THỐNG theo phạm vi lọc (loại trừ đề đã bị Admin xóa)
  const scopeActiveExams = useMemo(() => {
    const list = (systemExams.length > 0 ? systemExams : getMasterExams()).filter(e => e && e.id && !isExamDeleted(e) && e.category !== 'BATTLE');
    if (selectedGrade === 'ALL') return list;
    const gradeNum = selectedGrade.replace(/\D/g, '');
    return list.filter(e => {
      const eg = getExamGrade(e);
      return !eg || eg === gradeNum;
    });
  }, [systemExams, selectedGrade]);

  // Tính toán hồ sơ học tập và điểm số của từng học sinh trong phạm vi
  const studentProfiles = useMemo(() => {
    // Đảm bảo không bị trùng lặp học sinh theo mã định danh hoặc số điện thoại
    const uniqueStudents: SheetStudent[] = [];
    const seen = new Set<string>();

    studentsInScope.forEach((s, idx) => {
      const idKey = (s.id || '').trim().toLowerCase() || (s.phone || '').trim().toLowerCase() || `hs_${idx}`;
      if (!seen.has(idKey)) {
        seen.add(idKey);
        uniqueStudents.push(s);
      }
    });

    const activeList = systemExams.length > 0 ? systemExams : getMasterExams();

    return uniqueStudents.map(s => {
      const history = Array.isArray(s.examHistory) ? s.examHistory : [];
      // LỌC VÀ CHUẨN HÓA LỊCH SỬ THI CHỈ DỰA TRÊN CÁC ĐỀ KIỂM TRA HIỆN CÓ TRÊN HỆ THỐNG
      const completed = getStudentAttemptsForActiveExams(history, activeList, s.className);
      const attemptCount = completed.length;
      let avgScore10 = 0;
      let maxScore10 = 0;
      let latestScore10 = 0;
      let wrongNB = 0;
      let wrongTH = 0;
      let wrongVD = 0;
      let totalQuestionsDone = 0;

      if (attemptCount > 0) {
        let totalScore10Sum = 0;
        completed.forEach(h => {
          const totalQ = h.totalQuestions || 10;
          let s10 = h.score10 !== undefined ? Number(h.score10) : Math.round(((h.score || 0) / totalQ) * 10 * 10) / 10;
          if (s10 > 10 && totalQ > 0) {
            s10 = Math.round((s10 / totalQ) * 10 * 10) / 10;
          }
          totalScore10Sum += s10;
          if (s10 > maxScore10) maxScore10 = s10;
          totalQuestionsDone += totalQ;
          wrongNB += (Number(h.wrongNhanBiet) || 0);
          wrongTH += (Number(h.wrongThongHieu) || 0);
          wrongVD += (Number(h.wrongVanDung) || 0);
        });

        avgScore10 = Math.round((totalScore10Sum / attemptCount) * 10) / 10;
        const last = completed[0];
        const lastTotalQ = last.totalQuestions || 10;
        latestScore10 = last.score10 !== undefined ? Number(last.score10) : Math.round(((last.score || 0) / lastTotalQ) * 10 * 10) / 10;
        if (latestScore10 > 10 && lastTotalQ > 0) {
          latestScore10 = Math.round((latestScore10 / lastTotalQ) * 10 * 10) / 10;
        }
      }

      // Xếp loại năng lực số
      let competencyRank: 'XUẤT_SẮC' | 'ĐẠT_CHUẨN' | 'CẦN_CỦNG_CỐ' | 'CHƯA_THI' = 'CHƯA_THI';
      if (attemptCount > 0) {
        if (avgScore10 >= 8.0) competencyRank = 'XUẤT_SẮC';
        else if (avgScore10 >= 5.0) competencyRank = 'ĐẠT_CHUẨN';
        else competencyRank = 'CẦN_CỦNG_CỐ';
      }

      // Đánh giá tỷ lệ chuẩn hóa 3 mức độ nhận thức
      const scoreRatio = attemptCount > 0 ? avgScore10 / 10 : 0;
      const nbRate = Math.min(100, Math.round(scoreRatio * 106));
      const thRate = Math.min(100, Math.max(0, Math.round(scoreRatio * 95)));
      const vdRate = Math.min(100, Math.max(0, Math.round(scoreRatio * 80)));

      return {
        student: s,
        attemptCount,
        completed,
        avgScore10,
        maxScore10,
        latestScore10,
        wrongNB,
        wrongTH,
        wrongVD,
        totalQuestionsDone,
        nbRate,
        thRate,
        vdRate,
        competencyRank
      };
    });
  }, [studentsInScope, systemExams]);

  // Lọc học sinh theo ô tìm kiếm và bộ lọc mức độ
  const filteredProfiles = useMemo(() => {
    return studentProfiles.filter(p => {
      // Bộ lọc mức độ
      if (statusFilter !== 'ALL' && p.competencyRank !== statusFilter) return false;

      // Tìm kiếm
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const s = p.student;
        const formattedName = formatStudentReportName(s.name, s.className).toLowerCase();
        const matchName = s.name.toLowerCase().includes(term) || formattedName.includes(term);
        const matchId = s.id.toLowerCase().includes(term);
        const matchPhone = s.phone.includes(term);
        const matchClass = s.className.toLowerCase().includes(term);
        if (!matchName && !matchId && !matchPhone && !matchClass) return false;
      }
      return true;
    });
  }, [studentProfiles, statusFilter, searchTerm]);

  // Tổng hợp chỉ số toàn Lớp / Toàn Khối
  const classAggregatedStats = useMemo(() => {
    const totalStudents = studentProfiles.length;
    const participatedProfiles = studentProfiles.filter(p => p.attemptCount > 0);
    const participatedCount = participatedProfiles.length;
    const participationRate = totalStudents > 0 ? Math.round((participatedCount / totalStudents) * 100) : 0;

    let totalAttemptsCount = 0;
    let scoreSum = 0;
    let countXuấtSắc = 0;
    let countKhá = 0;
    let countĐạt = 0;
    let countCầnCủngCố = 0;

    let totalWrongNB = 0;
    let totalWrongTH = 0;
    let totalWrongVD = 0;

    const lessonErrorMap: Record<string, { attempts: number; totalWrong: number; scoreSum: number }> = {};

    participatedProfiles.forEach(p => {
      p.completed.forEach(h => {
        totalAttemptsCount++;
        const totalQ = h.totalQuestions || 10;
        let s10 = h.score10 !== undefined ? Number(h.score10) : Math.round(((h.score || 0) / totalQ) * 10 * 10) / 10;
        if (s10 > 10 && totalQ > 0) s10 = Math.round((s10 / totalQ) * 10 * 10) / 10;
        scoreSum += s10;

        if (s10 >= 8.0) countXuấtSắc++;
        else if (s10 >= 6.5) countKhá++;
        else if (s10 >= 5.0) countĐạt++;
        else countCầnCủngCố++;

        const wNB = Number(h.wrongNhanBiet) || 0;
        const wTH = Number(h.wrongThongHieu) || 0;
        const wVD = Number(h.wrongVanDung) || 0;
        totalWrongNB += wNB;
        totalWrongTH += wTH;
        totalWrongVD += wVD;

        const lName = h.examTitle || h.lessonName || 'Bài kiểm tra Sinh học';
        if (!lessonErrorMap[lName]) {
          lessonErrorMap[lName] = { attempts: 0, totalWrong: 0, scoreSum: 0 };
        }
        lessonErrorMap[lName].attempts++;
        lessonErrorMap[lName].totalWrong += (wNB + wTH + wVD);
        lessonErrorMap[lName].scoreSum += s10;
      });
    });

    const avgScore = totalAttemptsCount > 0 ? Math.round((scoreSum / totalAttemptsCount) * 10) / 10 : 0;
    const passRate = totalAttemptsCount > 0 ? Math.round(((countXuấtSắc + countKhá + countĐạt) / totalAttemptsCount) * 100) : 0;
    const goodRate = totalAttemptsCount > 0 ? Math.round((countXuấtSắc / totalAttemptsCount) * 100) : 0;
    const weakRate = totalAttemptsCount > 0 ? Math.round((countCầnCủngCố / totalAttemptsCount) * 100) : 0;

    // Tỷ lệ các mức độ nhận thức
    const allErrors = (totalWrongNB + totalWrongTH + totalWrongVD) || 1;
    const pctWrongNB = Math.round((totalWrongNB / allErrors) * 100);
    const pctWrongTH = Math.round((totalWrongTH / allErrors) * 100);
    const pctWrongVD = Math.round((totalWrongVD / allErrors) * 100);

    // Xếp hạng bài học cần can thiệp
    const sortedLessons = Object.keys(lessonErrorMap).map(k => ({
      title: k,
      attempts: lessonErrorMap[k].attempts,
      totalWrong: lessonErrorMap[k].totalWrong,
      avgScore: Math.round((lessonErrorMap[k].scoreSum / lessonErrorMap[k].attempts) * 10) / 10
    })).sort((a, b) => b.totalWrong - a.totalWrong);

    return {
      totalStudents,
      participatedCount,
      participationRate,
      totalAttemptsCount,
      avgScore,
      passRate,
      goodRate,
      weakRate,
      countXuấtSắc,
      countKhá,
      countĐạt,
      countCầnCủngCố,
      totalWrongNB,
      totalWrongTH,
      totalWrongVD,
      pctWrongNB,
      pctWrongTH,
      pctWrongVD,
      sortedLessons: sortedLessons.slice(0, 5)
    };
  }, [studentProfiles]);

  // Tổng hợp toàn bộ các trường hợp cá nhân hóa trong phạm vi lớp/khối đang chọn
  // (Bao gồm: Điểm kiểm tra Lần 1, % và số điểm đạt khi luyện đề bù đắp, điểm sau khi làm lại đề cũ, điểm tiến bộ)
  const personalizedCases = useMemo<PersonalizedProgressCase[]>(() => {
    const cases: PersonalizedProgressCase[] = [];
    const activeList = scopeActiveExams;
    if (activeList.length === 0 || studentsInScope.length === 0) return [];

    studentsInScope.forEach(st => {
      const stId = (st.id || '').trim().toUpperCase();
      const stPhone = (st.phone || '').trim();
      const cleanPhone = stPhone.replace(/\D/g, '');
      const cleanNoZero = cleanPhone.replace(/^0+/, '');
      const stNameClean = cleanStudentFullName(st.name, st.className);

      // Thu thập tất cả lượt thi của học sinh này từ examHistory và cloudExamResults
      const allStudentTurns: any[] = [];
      const seenTurnKeys = new Set<string>();

      const addTurnIfUnique = (t: any) => {
        if (!t) return;
        const key = t.turnId 
          ? String(t.turnId) 
          : `${t.examId || t.examTitle}__${t.date || t.submittedAt}__${t.score}__${t.score10}`;
        if (!seenTurnKeys.has(key)) {
          seenTurnKeys.add(key);
          allStudentTurns.push(t);
        }
      };

      (Array.isArray(st.examHistory) ? st.examHistory : []).forEach(addTurnIfUnique);

      (cloudExamResults || []).forEach(cr => {
        const crId = String(cr.studentId || '').trim().toUpperCase();
        const crPhoneClean = String(cr.studentId || '').replace(/\D/g, '').replace(/^0+/, '');
        const crNameClean = cleanStudentFullName(cr.name, cr.className);

        let match = false;
        if (stId && crId && crId === stId) match = true;
        else if (cleanNoZero && crPhoneClean && crPhoneClean === cleanNoZero) match = true;
        else if (stNameClean && crNameClean && stNameClean.toLowerCase() === crNameClean.toLowerCase()) {
          if (!cr.className || !st.className || cr.className.toUpperCase() === st.className.toUpperCase()) {
            match = true;
          }
        }
        if (match) {
          addTurnIfUnique(cr);
        }
      });

      // Đối chiếu với từng đề thi đang hiện có trong hệ thống
      activeList.forEach(exam => {
        // Lấy tất cả lượt thi khớp với đề thi này
        const matchedTurns = allStudentTurns.filter(t => isExamAttemptMatching(t, exam));
        
        // Phân tách lượt thi gốc và lượt thi bù đắp
        const normalTurns = matchedTurns.filter(t => !isRemedialOrPracticeTurn(t));
        const remedialTurns = matchedTurns.filter(t => isRemedialOrPracticeTurn(t));

        // Lấy hồ sơ chẩn đoán lưu trong máy (nếu có)
        const savedProfile = getSavedCompetencyProfile(exam.id, st.phone) || 
                             getSavedCompetencyProfile(exam.id, cleanPhone) ||
                             getSavedCompetencyProfile(exam.id, cleanNoZero);

        // Trường hợp 1: Có từ 2 lượt thi đề gốc trở lên (Học sinh đã làm bài lần 1, luyện đề và làm lại đề cũ)
        if (normalTurns.length >= 2) {
          // Sắp xếp theo thứ tự thời gian: cũ nhất trước, mới nhất sau
          const sortedTurns = [...normalTurns].sort((a, b) => {
            const timeA = a.date ? new Date(a.date).getTime() : (a.submittedAt ? new Date(a.submittedAt).getTime() : 0);
            const timeB = b.date ? new Date(b.date).getTime() : (b.submittedAt ? new Date(b.submittedAt).getTime() : 0);
            return timeA - timeB;
          });

          const t1 = sortedTurns[0];
          const t2 = sortedTurns[sortedTurns.length - 1];

          const tot1 = Number(t1.totalQuestions) || 10;
          let s10_1 = t1.score10 !== undefined ? Number(t1.score10) : Math.round(((t1.score || 0) / tot1) * 10 * 10) / 10;
          if (s10_1 > 10 && tot1 > 0) s10_1 = Math.round((s10_1 / tot1) * 10 * 10) / 10;

          const tot2 = Number(t2.totalQuestions) || 10;
          let s10_2 = t2.score10 !== undefined ? Number(t2.score10) : Math.round(((t2.score || 0) / tot2) * 10 * 10) / 10;
          if (s10_2 > 10 && tot2 > 0) s10_2 = Math.round((s10_2 / tot2) * 10 * 10) / 10;

          const delta = Math.round((s10_2 - s10_1) * 10) / 10;

          // Tính toán phần trăm & số câu đạt khi luyện đề bù đắp
          let pPct = 0;
          let pScore = 0;
          let pTotal = 10;
          const pTopics: string[] = [];

          if (savedProfile) {
            pPct = savedProfile.practicePercent || 0;
            pScore = savedProfile.practiceScore || 0;
            pTotal = savedProfile.practiceQuestions?.length || 10;
            if (savedProfile.errorItems) {
              savedProfile.errorItems.forEach(e => {
                if (e.weakConcept && !pTopics.includes(e.weakConcept)) pTopics.push(e.weakConcept);
              });
            }
          }

          if (pPct === 0 && remedialTurns.length > 0) {
            const rem = remedialTurns[0];
            const remTot = Number(rem.totalQuestions) || 10;
            const remSc = Number(rem.score) || 0;
            pPct = remTot > 0 ? Math.round((remSc / remTot) * 100) : 90;
            pScore = remSc;
            pTotal = remTot;
          }

          // Theo quy định sư phạm của hệ thống: để được mở khóa làm lại đề cũ, học sinh BẮT BUỘC phải luyện đề bù đắp đạt trên 80% (> 80%)
          if (pPct === 0) {
            if (delta >= 3.0 || s10_2 >= 9.0) {
              pPct = 100;
              pScore = 10;
            } else if (delta > 0 || s10_2 >= 8.0) {
              pPct = 90;
              pScore = 9;
            } else {
              pPct = 85;
              pScore = 8;
            }
          }

          let status: PersonalizedProgressCase['status'] = 'CÓ_TIẾN_BỘ';
          if (delta >= 3.0) status = 'TIẾN_BỘ_VƯỢT_BẬC';
          else if (delta > 0) status = 'CÓ_TIẾN_BỘ';
          else if (delta === 0) status = 'GIỮ_VỮNG';
          else status = 'CẦN_CỐ_GẮNG';

          cases.push({
            id: `${st.id}_${exam.id}`,
            studentId: st.id,
            studentName: st.name,
            className: st.className,
            phone: st.phone,
            examId: exam.id,
            examTitle: exam.title || exam.lessonName || 'Bài kiểm tra Sinh học',
            examGrade: getExamGrade(exam),
            initialScore10: s10_1,
            initialCorrect: t1.score || Math.round((s10_1 / 10) * tot1),
            initialTotal: tot1,
            initialDate: t1.date || t1.submittedAt,
            initialWrongNB: Number(t1.wrongNhanBiet) || 0,
            initialWrongTH: Number(t1.wrongThongHieu) || 0,
            initialWrongVD: Number(t1.wrongVanDung) || 0,
            practicePercent: pPct,
            practiceScore: pScore,
            practiceTotal: pTotal,
            practiceTopics: pTopics.length > 0 ? pTopics : [exam.topic || exam.title],
            hasRetaken: true,
            retestScore10: s10_2,
            retestCorrect: t2.score || Math.round((s10_2 / 10) * tot2),
            retestTotal: tot2,
            retestDate: (t2.date && !isNaN(new Date(t2.date).getTime())) ? t2.date : (t2.submittedAt && !isNaN(new Date(t2.submittedAt).getTime()) ? t2.submittedAt : t1.date || t1.submittedAt || new Date().toISOString()),
            scoreDelta: delta,
            status,
            rawProfile: savedProfile
          });
        } 
        // Trường hợp 2: Có 1 lượt thi và có hồ sơ luyện tập bù đắp / tiến độ chẩn đoán
        else if (normalTurns.length === 1 && (savedProfile || remedialTurns.length > 0)) {
          const t1 = normalTurns[0];
          const tot1 = Number(t1.totalQuestions) || 10;
          let s10_1 = t1.score10 !== undefined ? Number(t1.score10) : Math.round(((t1.score || 0) / tot1) * 10 * 10) / 10;
          if (s10_1 > 10 && tot1 > 0) s10_1 = Math.round((s10_1 / tot1) * 10 * 10) / 10;

          // Chỉ xem là ca cá nhân hóa nếu học sinh có lỗi sai (điểm < 10) hoặc đã bắt đầu quy trình bù đắp
          if (s10_1 < 10 || savedProfile?.practiceScore !== undefined || remedialTurns.length > 0) {
            let pPct = savedProfile?.practicePercent || 0;
            let pScore = savedProfile?.practiceScore || 0;
            let pTotal = savedProfile?.practiceQuestions?.length || 10;
            const pTopics: string[] = [];

            if (savedProfile?.errorItems) {
              savedProfile.errorItems.forEach(e => {
                if (e.weakConcept && !pTopics.includes(e.weakConcept)) pTopics.push(e.weakConcept);
              });
            }

            if (pPct === 0 && remedialTurns.length > 0) {
              const rem = remedialTurns[0];
              const remTot = Number(rem.totalQuestions) || 10;
              const remSc = Number(rem.score) || 0;
              pPct = remTot > 0 ? Math.round((remSc / remTot) * 100) : 85;
              pScore = remSc;
              pTotal = remTot;
            }

            const isRetested = !!(savedProfile?.isRetestSubmitted && savedProfile.retestScore10 !== undefined);
            const reScore10 = isRetested ? Number(savedProfile!.retestScore10) : undefined;
            const delta = isRetested && reScore10 !== undefined ? Math.round((reScore10 - s10_1) * 10) / 10 : 0;

            cases.push({
              id: `${st.id}_${exam.id}`,
              studentId: st.id,
              studentName: st.name,
              className: st.className,
              phone: st.phone,
              examId: exam.id,
              examTitle: exam.title || exam.lessonName || 'Bài kiểm tra Sinh học',
              examGrade: getExamGrade(exam),
              initialScore10: s10_1,
              initialCorrect: t1.score || Math.round((s10_1 / 10) * tot1),
              initialTotal: tot1,
              initialDate: t1.date || t1.submittedAt,
              initialWrongNB: Number(t1.wrongNhanBiet) || 0,
              initialWrongTH: Number(t1.wrongThongHieu) || 0,
              initialWrongVD: Number(t1.wrongVanDung) || 0,
              practicePercent: pPct || 85,
              practiceScore: pScore || Math.round(((pPct || 85) / 100) * pTotal),
              practiceTotal: pTotal,
              practiceTopics: pTopics.length > 0 ? pTopics : [exam.topic || exam.title],
              hasRetaken: isRetested,
              retestScore10: reScore10,
              retestCorrect: isRetested && reScore10 !== undefined ? Math.round((reScore10 / 10) * 10) : undefined,
              retestTotal: 10,
              retestDate: (savedProfile?.remedialCompletedAt && !isNaN(new Date(savedProfile.remedialCompletedAt).getTime())) ? savedProfile.remedialCompletedAt : undefined,
              scoreDelta: delta,
              status: isRetested ? (delta >= 3 ? 'TIẾN_BỘ_VƯỢT_BẬC' : delta > 0 ? 'CÓ_TIẾN_BỘ' : 'GIỮ_VỮNG') : 'ĐANG_LUYỆN_BÙ_ĐẮP',
              rawProfile: savedProfile
            });
          }
        }
      });
    });

    // Sắp xếp: ca có mức tiến bộ cao nhất lên đầu, tiếp theo là điểm lần 2 cao nhất
    return cases.sort((a, b) => {
      if (b.scoreDelta !== a.scoreDelta) return b.scoreDelta - a.scoreDelta;
      return (b.retestScore10 || 0) - (a.retestScore10 || 0);
    });
  }, [studentsInScope, scopeActiveExams, cloudExamResults]);

  // Bộ lọc cho danh sách ca cá nhân hóa
  const filteredPersonalizedCases = useMemo(() => {
    return personalizedCases.filter(c => {
      // Bộ lọc tiến độ
      if (personalizedFilter === 'IMPROVED' && c.scoreDelta <= 0) return false;
      if (personalizedFilter === 'SUPER_IMPROVED' && c.scoreDelta < 3.0) return false;
      if (personalizedFilter === 'RETAKEN' && !c.hasRetaken) return false;
      if (personalizedFilter === 'IN_PRACTICE' && c.hasRetaken) return false;

      // Tìm kiếm
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchName = c.studentName.toLowerCase().includes(term);
        const matchId = c.studentId.toLowerCase().includes(term);
        const matchClass = c.className.toLowerCase().includes(term);
        const matchExam = c.examTitle.toLowerCase().includes(term);
        const matchPhone = c.phone.includes(term);
        if (!matchName && !matchId && !matchClass && !matchExam && !matchPhone) return false;
      }
      return true;
    });
  }, [personalizedCases, personalizedFilter, searchTerm]);

  // Thống kê tổng hợp các ca cá nhân hóa
  const personalizedAggregatedStats = useMemo(() => {
    const totalCases = personalizedCases.length;
    if (totalCases === 0) {
      return {
        totalCases: 0,
        improvedCount: 0,
        improvedRate: 0,
        avgInitialScore: 0,
        avgPracticePercent: 0,
        avgRetestScore: 0,
        avgProgressDelta: 0,
        superImprovedCount: 0,
        retakenCount: 0
      };
    }

    const retakenCases = personalizedCases.filter(c => c.hasRetaken);
    const improvedCases = personalizedCases.filter(c => c.scoreDelta > 0);
    const superImprovedCases = personalizedCases.filter(c => c.scoreDelta >= 3.0);

    const sumInitial = personalizedCases.reduce((acc, c) => acc + c.initialScore10, 0);
    const avgInitialScore = Math.round((sumInitial / totalCases) * 10) / 10;

    const sumPracticePct = personalizedCases.reduce((acc, c) => acc + c.practicePercent, 0);
    const avgPracticePercent = Math.round(sumPracticePct / totalCases);

    const sumRetest = retakenCases.reduce((acc, c) => acc + (c.retestScore10 || 0), 0);
    const avgRetestScore = retakenCases.length > 0 ? Math.round((sumRetest / retakenCases.length) * 10) / 10 : 0;

    const sumDelta = retakenCases.reduce((acc, c) => acc + c.scoreDelta, 0);
    const avgProgressDelta = retakenCases.length > 0 ? Math.round((sumDelta / retakenCases.length) * 10) / 10 : 0;

    const improvedRate = retakenCases.length > 0 ? Math.round((improvedCases.length / retakenCases.length) * 100) : 0;

    return {
      totalCases,
      retakenCount: retakenCases.length,
      improvedCount: improvedCases.length,
      improvedRate,
      superImprovedCount: superImprovedCases.length,
      avgInitialScore,
      avgPracticePercent,
      avgRetestScore,
      avgProgressDelta
    };
  }, [personalizedCases]);

  // Học sinh đang được chọn để xem Báo Cáo Cá Nhân
  const activeStudentProfile = useMemo(() => {
    if (!selectedStudentId && studentProfiles.length > 0) {
      return studentProfiles[0];
    }
    const cleanId = (selectedStudentId || '').trim().toLowerCase();
    const cleanPhone = (selectedStudentId || '').replace(/\D/g, '');
    const found = studentProfiles.find(p => {
      const pId = (p.student.id || '').trim().toLowerCase();
      const pPhone = (p.student.phone || '').replace(/\D/g, '');
      return (cleanId && pId === cleanId) || (cleanPhone && pPhone === cleanPhone);
    });
    return found || studentProfiles[0] || null;
  }, [studentProfiles, selectedStudentId]);

  // Hàm chuyển sang xem báo cáo cá nhân
  const handleSelectStudent = (sId: string) => {
    setSelectedStudentId(sId);
    setReportMode('INDIVIDUAL');
  };

  // In ấn báo cáo chuẩn A4
  const handlePrint = () => {
    window.print();
  };

  // Helper tạo tên file theo phạm vi lớp / khối
  const getExportScopeName = () => {
    return selectedClass !== 'ALL' 
      ? `Lop_${selectedClass}` 
      : selectedGrade !== 'ALL' 
        ? selectedGrade.replace(/\s+/g, '_') 
        : 'Toan_Truong';
  };

  // Helper lấy tiêu đề phạm vi tiếng Việt có dấu
  const getScopeDisplayTitle = () => {
    if (selectedClass !== 'ALL') return `Lớp ${selectedClass} (${selectedGrade === 'ALL' ? '' : selectedGrade})`;
    if (selectedGrade !== 'ALL') return `${selectedGrade} (Toàn bộ các lớp)`;
    return 'Toàn trường (Tất cả các khối lớp)';
  };

  // XUẤT FILE EXCEL (.XLSX) THEO MẪU HIỂN THỊ
  const handleExportExcel = () => {
    const scopeName = getExportScopeName();
    const scopeTitle = getScopeDisplayTitle();
    const wb = XLSX.utils.book_new();

    // 1. Chế độ Báo Cáo Tiến Bộ Cá Nhân Hóa (Khớp 100% mẫu trong ảnh image_a34537b7.png)
    if (reportMode === 'PERSONALIZED') {
      // Sheet 1: Mẫu bảng hiển thị trực quan (8 cột chuẩn như trong ảnh)
      const titleRows = [
        ["HỆ THỐNG AI SINH HỌC CÁ NHÂN HÓA - BÁO CÁO TIẾN BỘ CÁ NHÂN HÓA"],
        [`Phạm vi: ${scopeTitle} | Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} | Tổng: ${filteredPersonalizedCases.length} ca can thiệp`],
        [`Quy chuẩn: Lần 1 phát hiện lỗi sai -> Luyện đề bù đắp (>80%) -> Làm lại đề cũ kiểm chứng mức độ tiến bộ`],
        []
      ];

      // 8 CỘT CHUẨN KHỚP 100% MẪU ẢNH
      const headersImage = [
        "STT",
        "MÃ HS & HỌ TÊN",
        "BÀI KIỂM TRA ĐÁNH GIÁ",
        "ĐIỂM THI LẦN 1",
        "LUYỆN ĐỀ BÙ ĐẮP",
        "LÀM LẠI ĐỀ CŨ",
        "MỨC TIẾN BỘ",
        "ĐÁNH GIÁ SƯ PHẠM"
      ];

      const dataRowsImage = filteredPersonalizedCases.map((c, idx) => {
        const cleanName = cleanStudentFullName(c.studentName, c.className);
        
        // Cột 2: Mã HS & Họ tên (Mã HS + Họ tên + Lớp + SĐT)
        const studentCell = `[${c.studentId}] ${cleanName} - Lớp ${c.className} - SĐT: ${c.phone}`;
        
        // Cột 3: Bài kiểm tra đánh giá (Tên bài + Khối)
        const examCell = `${c.examTitle} (${c.examGrade ? `Sinh học ${c.examGrade}` : 'Sinh học THPT'})`;
        
        // Cột 4: Điểm thi lần 1 (Điểm + Số câu đúng + Lỗi sai NB/TH/VD)
        const initialCell = `${c.initialScore10}đ (${c.initialCorrect}/${c.initialTotal} câu đúng - Sai: ${c.initialWrongNB}NB / ${c.initialWrongTH}TH / ${c.initialWrongVD}VD)`;
        
        // Cột 5: Luyện đề bù đắp (% đạt + số câu + xếp loại)
        const practiceCell = `${c.practicePercent}% đạt (${c.practiceScore}/${c.practiceTotal} câu) - ${c.practicePercent >= 80 ? 'Đạt chuẩn (>80%)' : 'Cần củng cố'}`;
        
        // Cột 6: Làm lại đề cũ (Điểm + Số câu đúng + Ngày làm lại)
        const retestDateStr = formatViDateSafe(c.retestDate);
        const retestCell = c.hasRetaken
          ? `${c.retestScore10 !== undefined ? c.retestScore10 : 0}đ (${c.retestCorrect || 0}/${c.retestTotal || 0} câu đúng${retestDateStr ? ` - Ngày: ${retestDateStr}` : ''})`
          : 'Đang luyện bù đắp (Chưa thi lại)';
          
        // Cột 7: Mức tiến bộ (+X.Xđ (0đ -> 10đ))
        const deltaFormatted = c.scoreDelta > 0 ? `+${c.scoreDelta}đ` : `${c.scoreDelta}đ`;
        const deltaCell = c.hasRetaken
          ? `${deltaFormatted} (${c.initialScore10}đ ➔ ${c.retestScore10}đ)`
          : '--';
          
        // Cột 8: Đánh giá sư phạm
        const pedagogyCell = c.status === 'TIẾN_BỘ_VƯỢT_BẬC' ? 'Tiến bộ vượt bậc' :
          c.status === 'CÓ_TIẾN_BỘ' ? 'Có tiến bộ' :
          c.status === 'GIỮ_VỮNG' ? 'Giữ vững điểm số' :
          c.status === 'CẦN_CỐ_GẮNG' ? 'Cần cố gắng' : 'Đang luyện bù đắp';

        return [
          idx + 1,
          studentCell,
          examCell,
          initialCell,
          practiceCell,
          retestCell,
          deltaCell,
          pedagogyCell
        ];
      });

      const sheet1Data = [...titleRows, headersImage, ...dataRowsImage];
      const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

      // Căn chỉnh độ rộng cột chuẩn đẹp trong Excel
      ws1['!cols'] = [
        { wch: 6 },   // STT
        { wch: 42 },  // MÃ HS & HỌ TÊN
        { wch: 42 },  // BÀI KIỂM TRA ĐÁNH GIÁ
        { wch: 38 },  // ĐIỂM THI LẦN 1
        { wch: 34 },  // LUYỆN ĐỀ BÙ ĐẮP
        { wch: 36 },  // LÀM LẠI ĐỀ CŨ
        { wch: 24 },  // MỨC TIẾN BỘ
        { wch: 24 }   // ĐÁNH GIÁ SƯ PHẠM
      ];

      XLSX.utils.book_append_sheet(wb, ws1, "Tiến Bộ Cá Nhân Hóa");

      // Sheet 2: Chi tiết phân rã dữ liệu (tách riêng từng cột phục vụ tra cứu số liệu)
      const headersDetail = [
        "STT",
        "Mã Học Sinh",
        "Họ Và Tên",
        "Lớp",
        "Số Điện Thoại",
        "Bài Kiểm Tra Đánh Giá",
        "Khối Lớp",
        "Điểm Thi Lần 1 (Hệ 10)",
        "Số Câu Đúng L1",
        "Tổng Số Câu L1",
        "Sai Nhận Biết (NB) L1",
        "Sai Thông Hiểu (TH) L1",
        "Sai Vận Dụng (VD) L1",
        "Tỷ Lệ Đạt Luyện Đề (%)",
        "Số Câu Đạt Luyện Đề",
        "Tổng Câu Luyện Đề",
        "Kết Quả Luyện Đề Bù Đắp",
        "Điểm Làm Lại Đề Cũ (Hệ 10)",
        "Số Câu Đúng L2",
        "Tổng Số Câu L2",
        "Ngày Làm Lại",
        "Mức Tiến Bộ (Điểm Tăng)",
        "Đánh Giá Sư Phạm"
      ];

      const dataRowsDetail = filteredPersonalizedCases.map((c, idx) => [
        idx + 1,
        c.studentId,
        cleanStudentFullName(c.studentName, c.className),
        c.className,
        c.phone,
        c.examTitle,
        c.examGrade ? `Sinh học ${c.examGrade}` : 'Sinh học THPT',
        c.initialScore10,
        c.initialCorrect,
        c.initialTotal,
        c.initialWrongNB,
        c.initialWrongTH,
        c.initialWrongVD,
        `${c.practicePercent}%`,
        c.practiceScore,
        c.practiceTotal,
        c.practicePercent >= 80 ? 'Đạt chuẩn (>80%)' : 'Chưa đạt',
        c.hasRetaken ? (c.retestScore10 !== undefined ? c.retestScore10 : '--') : 'Đang luyện bù đắp',
        c.hasRetaken ? (c.retestCorrect || 0) : '--',
        c.hasRetaken ? (c.retestTotal || 0) : '--',
        formatViDateSafe(c.retestDate) || (c.hasRetaken ? 'Đã nộp' : '--'),
        c.hasRetaken ? (c.scoreDelta > 0 ? `+${c.scoreDelta}` : `${c.scoreDelta}`) : '--',
        c.status === 'TIẾN_BỘ_VƯỢT_BẬC' ? 'Tiến bộ vượt bậc' :
        c.status === 'CÓ_TIẾN_BỘ' ? 'Có tiến bộ' :
        c.status === 'GIỮ_VỮNG' ? 'Giữ vững điểm số' :
        c.status === 'CẦN_CỐ_GẮNG' ? 'Cần cố gắng' : 'Đang luyện bù đắp'
      ]);

      const ws2 = XLSX.utils.aoa_to_sheet([headersDetail, ...dataRowsDetail]);
      ws2['!cols'] = [
        { wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 14 },
        { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 16 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, ws2, "Chi Tiết Tách Cột");

      XLSX.writeFile(wb, `Bao_Cao_Tien_Bo_Ca_Nhan_Hoa_${scopeName}_${Date.now()}.xlsx`);
      showToast(`📊 Đã xuất file Excel (.xlsx) Báo Cáo Tiến Bộ Cá Nhân Hóa theo đúng mẫu ảnh thành công!`);
      return;
    }

    // 2. Chế độ Báo Cáo Cá Nhân học sinh được chọn
    if (reportMode === 'INDIVIDUAL' && activeStudentProfile) {
      const st = activeStudentProfile.student;
      const stNameClean = cleanStudentFullName(st.name, st.className);
      
      const titleRows = [
        [`BÁO CÁO HỒ SƠ NĂNG LỰC CÁ NHÂN: ${stNameClean.toUpperCase()} (${st.id})`],
        [`Lớp: ${st.className} | SĐT: ${st.phone} | Xếp loại năng lực: ${activeStudentProfile.competencyRank}`],
        [`Số bài kiểm tra đã làm: ${activeStudentProfile.attemptCount} | Điểm TB: ${activeStudentProfile.avgScore10}/10 | Cao nhất: ${activeStudentProfile.maxScore10}/10`],
        []
      ];

      const headers = [
        "STT",
        "Mã Học Sinh",
        "Họ Và Tên",
        "Lớp",
        "Số Điện Thoại",
        "Tên Bài Kiểm Tra Đã Làm",
        "Điểm Hệ 10",
        "Số Câu Đúng",
        "Tổng Số Câu",
        "Sai Nhận Biết",
        "Sai Thông Hiểu",
        "Sai Vận Dụng",
        "Thời Gian Làm (Giây)",
        "Thời Điểm Nộp Bài"
      ];

      const rows = activeStudentProfile.completed.map((att, idx) => {
        const tot = att.totalQuestions || 10;
        let s10 = att.score10 !== undefined ? Number(att.score10) : Math.round(((att.score || 0) / tot) * 10 * 10) / 10;
        if (s10 > 10 && tot > 0) s10 = Math.round((s10 / tot) * 10 * 10) / 10;
        return [
          idx + 1,
          st.id,
          stNameClean,
          st.className,
          st.phone,
          att.examTitle || att.lessonName || 'Bài kiểm tra Sinh học',
          s10,
          att.score || 0,
          tot,
          Number(att.wrongNhanBiet) || 0,
          Number(att.wrongThongHieu) || 0,
          Number(att.wrongVanDung) || 0,
          att.timeSpentSeconds || 0,
          att.date ? new Date(att.date).toLocaleString('vi-VN') : ''
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([...titleRows, headers, ...rows]);
      ws['!cols'] = [
        { wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 14 },
        { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Hồ Sơ Cá Nhân");
      XLSX.writeFile(wb, `Bao_Cao_Ca_Nhan_${st.id}_${stNameClean.replace(/\s+/g, '_')}_${Date.now()}.xlsx`);
      showToast(`📊 Đã xuất file Excel (.xlsx) báo cáo cá nhân học sinh ${stNameClean} thành công!`);
      return;
    }

    // 3. Chế độ Báo Cáo Cả Lớp / Toàn Khối
    const titleRows = [
      ["HỆ THỐNG AI SINH HỌC CÁ NHÂN HÓA - BÁO CÁO HỒ SƠ NĂNG LỰC HỌC SINH"],
      [`Phạm vi: ${scopeTitle} | Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} | Tổng số học sinh: ${filteredProfiles.length}`],
      [`Thống kê dựa trên ${scopeActiveExams.length} bài kiểm tra hiện hành trên hệ thống`],
      []
    ];

    const headers = [
      "STT",
      "Mã Học Sinh",
      "Họ Và Tên",
      "Lớp",
      "Số Điện Thoại",
      "Số Bài Thi Đã Làm",
      "Điểm Trung Bình (Hệ 10)",
      "Điểm Bài Mới Nhất",
      "Điểm Cao Nhất",
      "Đạt Chuẩn Nhận Biết (%)",
      "Đạt Chuẩn Thông Hiểu (%)",
      "Đạt Chuẩn Vận Dụng (%)",
      "Xếp Loại Năng Lực",
      "Trạng Thái Tài Khoản"
    ];

    const rows = filteredProfiles.map((p, idx) => [
      idx + 1,
      p.student.id,
      cleanStudentFullName(p.student.name, p.student.className),
      p.student.className,
      p.student.phone,
      p.attemptCount,
      p.avgScore10,
      p.latestScore10,
      p.maxScore10,
      `${p.nbRate}%`,
      `${p.thRate}%`,
      `${p.vdRate}%`,
      p.competencyRank === 'XUẤT_SẮC' ? 'Xuất sắc' : p.competencyRank === 'ĐẠT_CHUẨN' ? 'Đạt chuẩn' : p.competencyRank === 'CẦN_CỦNG_CỐ' ? 'Cần củng cố' : 'Chưa làm bài',
      p.student.status || 'Mở'
    ]);

    const ws = XLSX.utils.aoa_to_sheet([...titleRows, headers, ...rows]);
    ws['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 14 },
      { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Báo Cáo Năng Lực Lớp");
    XLSX.writeFile(wb, `Bao_Cao_Ho_So_Nang_Luc_${scopeName}_${Date.now()}.xlsx`);
    showToast(`📊 Đã xuất file Excel (.xlsx) báo cáo năng lực thành công!`);
  };

  // Xuất file CSV danh sách báo cáo (Hỗ trợ UTF-8 BOM)
  const handleExportCSV = () => {
    const scopeName = getExportScopeName();

    // Xuất CSV báo cáo Cá nhân học sinh được chọn
    if (reportMode === 'INDIVIDUAL' && activeStudentProfile) {
      const st = activeStudentProfile.student;
      const stNameClean = cleanStudentFullName(st.name, st.className);
      const headers = [
        "STT",
        "Mã Học Sinh",
        "Họ Và Tên",
        "Lớp",
        "Số Điện Thoại",
        "Tên Bài Kiểm Tra Đã Làm",
        "Điểm Hệ 10",
        "Số Câu Đúng",
        "Tổng Số Câu",
        "Số Câu Sai Nhận Biết",
        "Số Câu Sai Thông Hiểu",
        "Số Câu Sai Vận Dụng",
        "Thời Gian Làm (Giây)",
        "Thời Điểm Nộp Bài"
      ];

      const rows = activeStudentProfile.completed.map((att, idx) => {
        const tot = att.totalQuestions || 10;
        let s10 = att.score10 !== undefined ? Number(att.score10) : Math.round(((att.score || 0) / tot) * 10 * 10) / 10;
        if (s10 > 10 && tot > 0) s10 = Math.round((s10 / tot) * 10 * 10) / 10;
        return [
          idx + 1,
          `"${st.id}"`,
          `"${stNameClean}"`,
          `"${st.className}"`,
          `"${st.phone}"`,
          `"${att.examTitle || att.lessonName || 'Bài kiểm tra Sinh học'}"`,
          s10,
          att.score || 0,
          tot,
          Number(att.wrongNhanBiet) || 0,
          Number(att.wrongThongHieu) || 0,
          Number(att.wrongVanDung) || 0,
          att.timeSpentSeconds || 0,
          `"${att.date ? new Date(att.date).toLocaleString('vi-VN') : ''}"`
        ];
      });

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Bao_Cao_Ca_Nhan_${st.id}_${stNameClean.replace(/\s+/g, '_')}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      showToast(`📥 Đã xuất báo cáo cá nhân học sinh ${stNameClean} CSV thành công!`);
      return;
    }

    // Xuất CSV báo cáo Tiến bộ cá nhân hóa (Chuẩn 8 cột như mẫu ảnh)
    if (reportMode === 'PERSONALIZED') {
      const headers = [
        "STT",
        "MÃ HS & HỌ TÊN",
        "BÀI KIỂM TRA ĐÁNH GIÁ",
        "ĐIỂM THI LẦN 1",
        "LUYỆN ĐỀ BÙ ĐẮP",
        "LÀM LẠI ĐỀ CŨ",
        "MỨC TIẾN BỘ",
        "ĐÁNH GIÁ SƯ PHẠM"
      ];

      const rows = filteredPersonalizedCases.map((c, idx) => {
        const cleanName = cleanStudentFullName(c.studentName, c.className);
        const studentCell = `[${c.studentId}] ${cleanName} - Lớp ${c.className} - SĐT: ${c.phone}`;
        const examCell = `${c.examTitle} (${c.examGrade ? `Sinh học ${c.examGrade}` : 'Sinh học THPT'})`;
        const initialCell = `${c.initialScore10}đ (${c.initialCorrect}/${c.initialTotal} câu đúng - Sai: ${c.initialWrongNB}NB / ${c.initialWrongTH}TH / ${c.initialWrongVD}VD)`;
        const practiceCell = `${c.practicePercent}% đạt (${c.practiceScore}/${c.practiceTotal} câu) - ${c.practicePercent >= 80 ? 'Đạt chuẩn (>80%)' : 'Cần củng cố'}`;
        const retestDateStr = formatViDateSafe(c.retestDate);
        const retestCell = c.hasRetaken
          ? `${c.retestScore10 !== undefined ? c.retestScore10 : 0}đ (${c.retestCorrect || 0}/${c.retestTotal || 0} câu đúng${retestDateStr ? ` - Ngày: ${retestDateStr}` : ''})`
          : 'Đang luyện bù đắp (Chưa thi lại)';
        const deltaFormatted = c.scoreDelta > 0 ? `+${c.scoreDelta}đ` : `${c.scoreDelta}đ`;
        const deltaCell = c.hasRetaken
          ? `${deltaFormatted} (${c.initialScore10}đ ➔ ${c.retestScore10}đ)`
          : '--';
        const pedagogyCell = c.status === 'TIẾN_BỘ_VƯỢT_BẬC' ? 'Tiến bộ vượt bậc' :
          c.status === 'CÓ_TIẾN_BỘ' ? 'Có tiến bộ' :
          c.status === 'GIỮ_VỮNG' ? 'Giữ vững điểm số' :
          c.status === 'CẦN_CỐ_GẮNG' ? 'Cần cố gắng' : 'Đang luyện bù đắp';

        return [
          idx + 1,
          `"${studentCell.replace(/"/g, '""')}"`,
          `"${examCell.replace(/"/g, '""')}"`,
          `"${initialCell.replace(/"/g, '""')}"`,
          `"${practiceCell.replace(/"/g, '""')}"`,
          `"${retestCell.replace(/"/g, '""')}"`,
          `"${deltaCell.replace(/"/g, '""')}"`,
          `"${pedagogyCell.replace(/"/g, '""')}"`
        ];
      });

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Bao_Cao_Tien_Bo_Ca_Nhan_Hoa_${scopeName}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      showToast(`📥 Đã xuất báo cáo tiến bộ cá nhân hóa CSV (mẫu bảng) thành công!`);
      return;
    }

    const headers = [
      "STT",
      "Mã Học Sinh",
      "Họ Và Tên",
      "Lớp",
      "Số Điện Thoại",
      "Số Bài Thi Đã Làm",
      "Điểm Trung Bình (Hệ 10)",
      "Điểm Bài Mới Nhất",
      "Điểm Cao Nhất",
      "Đạt Chuẩn Nhận Biết (%)",
      "Đạt Chuẩn Thông Hiểu (%)",
      "Đạt Chuẩn Vận Dụng (%)",
      "Xếp Loại Năng Lực",
      "Trạng Thái Tài Khoản"
    ];

    const rows = filteredProfiles.map((p, idx) => [
      idx + 1,
      `"${p.student.id}"`,
      `"${cleanStudentFullName(p.student.name, p.student.className)}"`,
      `"${p.student.className}"`,
      `"${p.student.phone}"`,
      p.attemptCount,
      p.avgScore10,
      p.latestScore10,
      p.maxScore10,
      p.nbRate,
      p.thRate,
      p.vdRate,
      `"${p.competencyRank === 'XUẤT_SẮC' ? 'Xuất sắc' : p.competencyRank === 'ĐẠT_CHUẨN' ? 'Đạt chuẩn' : p.competencyRank === 'CẦN_CỦNG_CỐ' ? 'Cần củng cố' : 'Chưa làm bài'}"`,
      `"${p.student.status || 'Mở'}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Bao_Cao_Ho_So_Nang_Luc_${scopeName}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`📥 Đã xuất báo cáo CSV thành công!`);
  };

  return (
    <div className="space-y-6 max-w-7xl 2xl:max-w-[1600px] mx-auto pb-16 animate-fade-in print:p-0 print:m-0 print:max-w-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 bg-emerald-800 text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce border border-emerald-500 print:hidden">
          <span className="text-lg">📢</span>
          <span className="font-semibold text-sm">{toastMessage}</span>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:border-none print:shadow-none print:p-0">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-2xl">
              {reportMode === 'INDIVIDUAL' ? '👤' : reportMode === 'PERSONALIZED' ? '🎯' : '📊'}
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
              {reportMode === 'INDIVIDUAL' && activeStudentProfile
                ? `Báo Cáo Năng Lực Cá Nhân: ${cleanStudentFullName(activeStudentProfile.student.name, activeStudentProfile.student.className)} (${activeStudentProfile.student.id} - Lớp ${activeStudentProfile.student.className})`
                : reportMode === 'PERSONALIZED'
                ? 'Báo Cáo Tiến Bộ & Bồi Dưỡng Lỗ Hổng Cá Nhân Hóa'
                : 'Báo Cáo Toàn Bộ Hồ Sơ Năng Lực Số Theo Khối Lớp'}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-600">
            {reportMode === 'INDIVIDUAL' && activeStudentProfile
              ? `Hồ sơ phân tích chẩn đoán năng lực số chi tiết của học sinh ${cleanStudentFullName(activeStudentProfile.student.name, activeStudentProfile.student.className)} • SĐT: ${activeStudentProfile.student.phone} • Đánh giá trên các đề thi hiện có.`
              : reportMode === 'PERSONALIZED'
              ? 'Theo dõi tiến trình phát hiện lỗ hổng, luyện đề bù đắp và mức tăng điểm sau khi làm lại đề gốc.'
              : 'Hệ thống phân tích chẩn đoán năng lực số chuẩn GDPT 2018 môn Sinh học • Dữ liệu đồng bộ trực tiếp từ Google Sheets.'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto print:hidden">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isSyncing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Đồng bộ kết quả thi mới nhất từ Google Sheets"
          >
            <span className={`text-sm ${isSyncing ? 'animate-spin' : ''}`}>🔄</span>
            <span>{isSyncing ? 'Đang tải...' : 'Làm mới'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
            title="Xuất file Excel (.xlsx) chuẩn theo mẫu báo cáo"
          >
            <span>📊</span>
            <span>{reportMode === 'PERSONALIZED' ? 'Xuất File Excel (Mẫu Bảng)' : reportMode === 'INDIVIDUAL' && activeStudentProfile ? 'Xuất Excel Cá Nhân' : 'Xuất File Excel'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition-all cursor-pointer active:scale-95"
            title="Xuất file định dạng CSV (UTF-8)"
          >
            <span>📥</span>
            <span>Xuất CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
            title="In hoặc lưu file PDF bản báo cáo"
          >
            <span>🖨️</span>
            <span>In Báo Cáo</span>
          </button>
        </div>
      </div>

      {/* FILTER & MODE SELECTION BAR (HIDDEN IN PRINT) */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 shadow-xs space-y-4 print:hidden">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Segmented Mode: Cả Lớp / Cá Nhân / Tiến Bộ Cá Nhân Hóa */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start">
            <button
              type="button"
              onClick={() => setReportMode('CLASS')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                reportMode === 'CLASS'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🏫</span>
              <span>Báo Cáo Cả Lớp / Toàn Khối</span>
            </button>
            <button
              type="button"
              onClick={() => setReportMode('INDIVIDUAL')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                reportMode === 'INDIVIDUAL'
                  ? 'bg-white text-blue-700 shadow-xs border border-blue-200 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>👤</span>
              <span>
                {activeStudentProfile
                  ? `Báo Cáo Cá Nhân: ${cleanStudentFullName(activeStudentProfile.student.name, activeStudentProfile.student.className)}`
                  : 'Báo Cáo Từng Cá Nhân'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setReportMode('PERSONALIZED')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                reportMode === 'PERSONALIZED'
                  ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                  : 'text-slate-600 hover:text-indigo-900'
              }`}
            >
              <span>🎯</span>
              <span>Báo Cáo Tiến Bộ Cá Nhân Hóa</span>
              {personalizedCases.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                  reportMode === 'PERSONALIZED' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'
                }`}>
                  {personalizedCases.length}
                </span>
              )}
            </button>
          </div>

          {/* Scope Filters: Khối, Lớp, Học Sinh & Bộ lọc */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Lọc Khối Lớp */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-500 whitespace-nowrap">Khối:</span>
              <select
                value={selectedGrade}
                onChange={e => setSelectedGrade(e.target.value)}
                className="bg-slate-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-800 focus:outline-blue-500 cursor-pointer"
              >
                <option value="ALL">Tất cả các khối</option>
                {availableGrades.map((g, gIdx) => (
                  <option key={`rep_grade_${g}_${gIdx}`} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Lọc Lớp Cụ Thể */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-500 whitespace-nowrap">Lớp:</span>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="bg-slate-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-800 focus:outline-blue-500 cursor-pointer"
              >
                <option value="ALL">
                  {selectedGrade === 'ALL' ? 'Tất cả các lớp' : `Toàn bộ ${selectedGrade}`}
                </option>
                {availableClasses.map((c, cIdx) => (
                  <option key={`rep_class_${c.className}_${cIdx}`} value={c.className}>
                    {c.className.toLowerCase().startsWith('lớp') ? c.className : `Lớp ${c.className}`} ({c.totalStudents} HS)
                  </option>
                ))}
              </select>
            </div>

            {/* Khi ở chế độ Báo Cáo Cá Nhân: Hiển thị chọn học sinh ngay trên thanh điều khiển */}
            {reportMode === 'INDIVIDUAL' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-blue-700 whitespace-nowrap">Học sinh:</span>
                <select
                  value={activeStudentProfile?.student.id || ''}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  className="bg-blue-50 border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-900 focus:outline-blue-500 cursor-pointer max-w-[260px]"
                >
                  {studentProfiles.map((p, pIdx) => (
                    <option key={`bar_top_st_${p.student.id}_${pIdx}`} value={p.student.id}>
                      {formatStudentSelectorOption(p.student)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Bộ lọc tiến độ cá nhân hóa khi ở tab PERSONALIZED */}
            {reportMode === 'PERSONALIZED' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-indigo-700 whitespace-nowrap">Tiến độ:</span>
                <select
                  value={personalizedFilter}
                  onChange={e => setPersonalizedFilter(e.target.value as any)}
                  className="bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-indigo-900 focus:outline-indigo-500 cursor-pointer"
                >
                  <option value="ALL">Tất cả ca cá nhân hóa ({personalizedCases.length})</option>
                  <option value="IMPROVED">📈 Đã tiến bộ (Tăng điểm &gt; 0)</option>
                  <option value="SUPER_IMPROVED">🚀 Tiến bộ vượt bậc (Tăng ≥ 3.0đ)</option>
                  <option value="RETAKEN">🔄 Đã làm lại đề cũ</option>
                  <option value="IN_PRACTICE">⏳ Đang luyện bù đắp</option>
                </select>
              </div>
            )}

            {/* Bộ lọc trạng thái năng lực chuẩn khi ở tab CLASS */}
            {reportMode === 'CLASS' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-gray-500 whitespace-nowrap">Mức năng lực:</span>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-800 focus:outline-blue-500 cursor-pointer"
                >
                  <option value="ALL">Tất cả mức</option>
                  <option value="XUẤT_SẮC">🌟 Xuất sắc (≥ 8.0đ)</option>
                  <option value="ĐẠT_CHUẨN">✅ Đạt chuẩn (5.0 - 7.9đ)</option>
                  <option value="CẦN_CỦNG_CỐ">⚠️ Cần củng cố (&lt; 5.0đ)</option>
                  <option value="CHƯA_THI">⏳ Chưa làm bài</option>
                </select>
              </div>
            )}

            {/* Ô tìm kiếm nhanh */}
            <div className="relative min-w-[180px]">
              <input
                type="text"
                placeholder={reportMode === 'PERSONALIZED' ? "Tìm theo tên HS, đề thi..." : "Tìm tên, mã HS, SĐT..."}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:outline-blue-500"
              />
              <span className="absolute left-2.5 top-2 text-gray-400 text-xs">🔍</span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sync Info Meta */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-gray-500 pt-2 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span>
              Phạm vi: <strong className="text-gray-800">{selectedGrade === 'ALL' ? 'Toàn trường' : selectedGrade}</strong> {selectedClass !== 'ALL' && `• Lớp ${selectedClass}`}
            </span>
            <span>·</span>
            {reportMode === 'INDIVIDUAL' && activeStudentProfile ? (
              <span>
                Đang xem báo cáo cá nhân: <strong className="text-blue-700 font-bold">{cleanStudentFullName(activeStudentProfile.student.name, activeStudentProfile.student.className)}</strong> ({activeStudentProfile.student.id})
              </span>
            ) : reportMode === 'PERSONALIZED' ? (
              <span>
                Tìm thấy: <strong className="text-indigo-700">{filteredPersonalizedCases.length}</strong> / {personalizedCases.length} ca cá nhân hóa
              </span>
            ) : (
              <span>
                Tìm thấy: <strong className="text-blue-700">{filteredProfiles.length}</strong> / {studentsInScope.length} học sinh
              </span>
            )}
            <span>·</span>
            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
              <span>📋</span> Thống kê trên {scopeActiveExams.length} đề thi hiện có trên hệ thống
            </span>
          </div>
          {lastSyncTime && (
            <span className="shrink-0">Đồng bộ gần nhất: {lastSyncTime}</span>
          )}
        </div>
      </div>

      {/* PRINT HEADER ONLY VISIBLE WHEN PRINTING */}
      <div className="hidden print:block mb-6 border-b-2 border-gray-900 pb-4">
        <div className="flex justify-between items-start text-xs">
          <div>
            <div className="font-bold uppercase tracking-wider">SỞ GIÁO DỤC VÀ ĐÀO TẠO</div>
            <div className="font-semibold uppercase tracking-wider">TRƯỜNG THPT • TỔ SINH HỌC</div>
          </div>
          <div className="text-right">
            <div className="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div className="italic">Độc lập - Tự do - Hạnh phúc</div>
          </div>
        </div>
        <div className="text-center mt-6">
          <h2 className="text-lg font-black uppercase tracking-wide">
            {reportMode === 'INDIVIDUAL' && activeStudentProfile
              ? `BÁO CÁO HỒ SƠ NĂNG LỰC SỐ CÁ NHÂN: ${cleanStudentFullName(activeStudentProfile.student.name, activeStudentProfile.student.className).toUpperCase()}`
              : reportMode === 'PERSONALIZED'
              ? 'BÁO CÁO CÁC TRƯỜNG HỢP CÁ NHÂN HÓA & TIẾN BỘ NĂNG LỰC SINH HỌC'
              : 'BÁO CÁO TOÀN BỘ HỒ SƠ NĂNG LỰC SỐ MÔN SINH HỌC'}
          </h2>
          <div className="text-xs font-semibold mt-1">
            {reportMode === 'INDIVIDUAL' && activeStudentProfile
              ? `Học sinh: ${cleanStudentFullName(activeStudentProfile.student.name, activeStudentProfile.student.className)} • Mã HS: ${activeStudentProfile.student.id} • Lớp: ${activeStudentProfile.student.className} • SĐT: ${activeStudentProfile.student.phone}`
              : `Phạm vi: ${selectedGrade === 'ALL' ? 'Toàn Trường' : selectedGrade} ${selectedClass !== 'ALL' && `- Lớp ${selectedClass}`} • Đánh giá trên ${scopeActiveExams.length} đề thi hiện có`}
          </div>
          <div className="text-[11px] italic text-gray-600 mt-0.5">
            Ngày xuất báo cáo: {new Date().toLocaleDateString('vi-VN')} • Hệ thống AI Sinh Học Cá Nhân Hóa
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-gray-200">
          <div className="inline-block animate-spin text-4xl mb-3">🧬</div>
          <h3 className="text-base font-bold text-gray-800">Đang tổng hợp hồ sơ năng lực số...</h3>
          <p className="text-xs text-gray-500 mt-1">Hệ thống đang đối soát dữ liệu điểm thi và cấp độ nhận thức từ Google Sheets.</p>
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* CHẾ ĐỘ 1: BÁO CÁO CẢ LỚP / TOÀN KHỐI */}
          {/* ========================================================================= */}
          {reportMode === 'CLASS' && (
            <div className="space-y-6">
              {/* 1. KEY KPI CARDS */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Sĩ số & Tỷ lệ làm bài */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Sĩ Số & Tham Gia</span>
                    <span>👥</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900">
                    {classAggregatedStats.participatedCount}
                    <span className="text-sm font-normal text-gray-400">/{classAggregatedStats.totalStudents} HS</span>
                  </div>
                  <div className="text-xs text-blue-600 font-semibold mt-1">
                    Tỷ lệ hoàn thành: {classAggregatedStats.participationRate}%
                  </div>
                </div>

                {/* Điểm trung bình hệ 10 */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Điểm Trung Bình</span>
                    <span>⭐</span>
                  </div>
                  <div className="text-2xl font-black text-emerald-700">
                    {classAggregatedStats.avgScore}
                    <span className="text-sm font-normal text-gray-400">/10.0</span>
                  </div>
                  <div className="text-xs text-gray-500 font-medium mt-1">
                    Tổng cộng: {classAggregatedStats.totalAttemptsCount} lượt làm bài
                  </div>
                </div>

                {/* Tỷ lệ Đạt chuẩn (>= 5.0) */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Tỷ Lệ Đạt Chuẩn</span>
                    <span>🎯</span>
                  </div>
                  <div className="text-2xl font-black text-blue-700">
                    {classAggregatedStats.passRate}%
                  </div>
                  <div className="text-xs text-emerald-600 font-semibold mt-1">
                    Xuất sắc: {classAggregatedStats.goodRate}% ({classAggregatedStats.countXuấtSắc} lượt)
                  </div>
                </div>

                {/* Cần củng cố / Bù đắp */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Cần Bù Đắp (&lt; 5.0đ)</span>
                    <span>⚠️</span>
                  </div>
                  <div className="text-2xl font-black text-rose-600">
                    {classAggregatedStats.countCầnCủngCố}
                    <span className="text-sm font-normal text-gray-400"> lượt ({classAggregatedStats.weakRate}%)</span>
                  </div>
                  <div className="text-xs text-rose-500 font-medium mt-1">
                    Cần can thiệp bồi dưỡng trọng tâm
                  </div>
                </div>
              </div>

              {/* 2. MA TRẬN 3 CẤP ĐỘ NHẬN THỨC & PHỔ ĐIỂM CHUẨN GDPT 2018 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 3 Cấp độ nhận thức */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <span>🧠</span>
                      <span>Đánh Giá Theo 3 Cấp Độ Nhận Thức GDPT 2018</span>
                    </h3>
                    <span className="text-[11px] text-gray-500">Phân bố lỗi sai</span>
                  </div>

                  {/* Level 1: Nhận biết */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-700">1. Nhận biết (Khái niệm, định nghĩa, vị trí)</span>
                      <span className="font-bold text-gray-900">
                        {classAggregatedStats.totalWrongNB} lỗi ({classAggregatedStats.pctWrongNB}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, Math.max(8, classAggregatedStats.pctWrongNB))}%` }}
                      />
                    </div>
                  </div>

                  {/* Level 2: Thông hiểu */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-700">2. Thông hiểu (Bản chất, cơ chế, so sánh)</span>
                      <span className="font-bold text-gray-900">
                        {classAggregatedStats.totalWrongTH} lỗi ({classAggregatedStats.pctWrongTH}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-blue-500 h-2.5 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, Math.max(8, classAggregatedStats.pctWrongTH))}%` }}
                      />
                    </div>
                  </div>

                  {/* Level 3: Vận dụng */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-700">3. Vận dụng (Tính toán lai di truyền, giải thích thực tiễn)</span>
                      <span className="font-bold text-gray-900">
                        {classAggregatedStats.totalWrongVD} lỗi ({classAggregatedStats.pctWrongVD}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-amber-500 h-2.5 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, Math.max(8, classAggregatedStats.pctWrongVD))}%` }}
                      />
                    </div>
                  </div>

                  {/* Nhận xét chuyên môn tự động */}
                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed">
                    <strong>💡 Nhận xét sư phạm:</strong>{' '}
                    {classAggregatedStats.pctWrongVD > 40 ? (
                      'Học sinh cơ bản nắm được kiến thức lý thuyết Nhận biết nhưng gặp khó khăn khi Vận dụng suy luận bài tập phức tạp. Nên tăng cường bài tập phân tích tình huống thực tế và lai di truyền.'
                    ) : classAggregatedStats.pctWrongNB > 35 ? (
                      'Tỷ lệ sai ở mức Nhận biết còn đáng lưu ý. Học sinh dễ mắc bẫy từ ngữ khẳng định tuyệt đối (như "duy nhất", "tất cả"). Cần yêu cầu ôn kỹ SGK Kết nối tri thức.'
                    ) : (
                      'Năng lực nhận thức của học sinh phân bố đều và ổn định. Học sinh hiểu tương đối vững bản chất các cơ chế sinh học.'
                    )}
                  </div>
                </div>

                {/* Phổ điểm & Phân loại học lực */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <span>📈</span>
                      <span>Phổ Điểm & Xếp Loại Năng Lực Số</span>
                    </h3>
                    <span className="text-[11px] text-gray-500">Thang điểm 10</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="text-[11px] font-bold text-emerald-800">Xuất sắc</div>
                      <div className="text-xs text-emerald-600 font-medium">8.0 - 10</div>
                      <div className="text-lg font-black text-emerald-900 mt-1">{classAggregatedStats.countXuấtSắc}</div>
                    </div>
                    <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                      <div className="text-[11px] font-bold text-blue-800">Khá</div>
                      <div className="text-xs text-blue-600 font-medium">6.5 - 7.9</div>
                      <div className="text-lg font-black text-blue-900 mt-1">{classAggregatedStats.countKhá}</div>
                    </div>
                    <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="text-[11px] font-bold text-amber-800">Đạt</div>
                      <div className="text-xs text-amber-600 font-medium">5.0 - 6.4</div>
                      <div className="text-lg font-black text-amber-900 mt-1">{classAggregatedStats.countĐạt}</div>
                    </div>
                    <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100">
                      <div className="text-[11px] font-bold text-rose-800">Cần bù đắp</div>
                      <div className="text-xs text-rose-600 font-medium">&lt; 5.0</div>
                      <div className="text-lg font-black text-rose-900 mt-1">{classAggregatedStats.countCầnCủngCố}</div>
                    </div>
                  </div>

                  {/* Top bài kiểm tra cần lưu ý */}
                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-bold text-gray-700">Top bài thi học sinh cần củng cố kiến thức nhất:</div>
                    {classAggregatedStats.sortedLessons.length === 0 ? (
                      <div className="text-xs text-gray-400 italic">Chưa có đủ lượt thi để lập danh sách chuyên đề.</div>
                    ) : (
                      classAggregatedStats.sortedLessons.map((l, idx) => (
                        <div key={`rep_top_weak_${idx}_${l.title}`} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                          <span className="font-medium text-gray-800 truncate max-w-[240px]">
                            {idx + 1}. {l.title}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-rose-600 font-bold">{l.totalWrong} lỗi</span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-600">ĐTB: {l.avgScore}đ</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 3. BẢNG TỔNG HỢP HỒ SƠ NĂNG LỰC SỐ TỪNG HỌC SINH */}
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <span>📋</span>
                      <span>Danh Sách & Hồ Sơ Năng Lực Số Học Sinh</span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Hiển thị {filteredProfiles.length} học sinh trong phạm vi được chọn. Bấm vào học sinh để xem hồ sơ chi tiết.
                    </p>
                  </div>
                  <div className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 print:hidden">
                    Click vào tên hoặc nút "Xem hồ sơ" để xem chẩn đoán chi tiết
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-gray-600 font-bold border-b border-gray-200 uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-3 text-center w-12">STT</th>
                        <th className="py-3 px-3">Mã HS</th>
                        <th className="py-3 px-4">Họ và Tên</th>
                        <th className="py-3 px-3 text-center">Lớp</th>
                        <th className="py-3 px-3 text-center">Số Bài Thi</th>
                        <th className="py-3 px-3 text-center">Điểm TB</th>
                        <th className="py-3 px-3 text-center">Bài Mới Nhất</th>
                        <th className="py-3 px-4 text-center">Cấp Độ Nhận Thức (NB/TH/VD)</th>
                        <th className="py-3 px-3 text-center">Xếp Loại</th>
                        <th className="py-3 px-3 text-center print:hidden">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredProfiles.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-gray-500">
                            Không tìm thấy học sinh nào phù hợp với bộ lọc hiện tại.
                          </td>
                        </tr>
                      ) : (
                        filteredProfiles.map((p, idx) => (
                          <tr 
                            key={`rep_profile_${p.student.id || 'hs'}_${idx}`}
                            className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                            onClick={() => handleSelectStudent(p.student.id)}
                          >
                            <td className="py-3 px-3 text-center text-gray-500 font-semibold">{idx + 1}</td>
                            <td className="py-3 px-3 font-mono font-bold text-blue-800">{p.student.id}</td>
                            <td className="py-3 px-4 font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                              <div>{formatStudentReportName(p.student.name, p.student.className)}</div>
                              <div className="text-[10px] text-gray-400 font-normal">{p.student.phone}</div>
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-gray-700">{p.student.className}</td>
                            <td className="py-3 px-3 text-center font-semibold text-gray-800">
                              {p.attemptCount > 0 ? (
                                <span className="text-blue-700 font-bold">{p.attemptCount} bài</span>
                              ) : (
                                <span className="text-gray-400 italic">0</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {p.attemptCount > 0 ? (
                                <span className={`font-black text-sm ${p.avgScore10 >= 8 ? 'text-emerald-700' : p.avgScore10 >= 5 ? 'text-blue-700' : 'text-rose-600'}`}>
                                  {p.avgScore10}
                                </span>
                              ) : (
                                <span className="text-gray-400">--</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {p.attemptCount > 0 ? (
                                <span className="font-bold text-gray-800">{p.latestScore10}đ</span>
                              ) : (
                                <span className="text-gray-400">--</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {p.attemptCount > 0 ? (
                                <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold">
                                  <span className="text-emerald-700" title="Nhận biết">{p.nbRate}%</span>
                                  <span className="text-gray-300">/</span>
                                  <span className="text-blue-700" title="Thông hiểu">{p.thRate}%</span>
                                  <span className="text-gray-300">/</span>
                                  <span className="text-amber-700" title="Vận dụng">{p.vdRate}%</span>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-[11px]">Chưa có dữ liệu</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {p.competencyRank === 'XUẤT_SẮC' ? (
                                <span className="text-emerald-700 font-bold">🌟 Xuất sắc</span>
                              ) : p.competencyRank === 'ĐẠT_CHUẨN' ? (
                                <span className="text-blue-700 font-bold">✅ Đạt chuẩn</span>
                              ) : p.competencyRank === 'CẦN_CỦNG_CỐ' ? (
                                <span className="text-rose-600 font-bold">⚠️ Cần củng cố</span>
                              ) : (
                                <span className="text-gray-400 italic">Chưa thi</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center print:hidden" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleSelectStudent(p.student.id)}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold text-[11px] transition cursor-pointer"
                              >
                                Xem Hồ Sơ →
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* CHẾ ĐỘ 2: BÁO CÁO TỪNG CÁ NHÂN HỌC SINH */}
          {/* ========================================================================= */}
          {reportMode === 'INDIVIDUAL' && (
            <div className="space-y-6">
              {/* Thanh chọn học sinh nhanh */}
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setReportMode('CLASS')}
                    className="p-2 hover:bg-slate-100 rounded-lg text-gray-600 font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <span>←</span> <span>Quay lại Báo Cáo Lớp</span>
                  </button>
                  <span className="text-gray-300">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-600 whitespace-nowrap">Chọn học sinh:</span>
                    <select
                      value={activeStudentProfile?.student.id || ''}
                      onChange={e => setSelectedStudentId(e.target.value)}
                      className="bg-slate-50 border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-800 focus:outline-blue-500 cursor-pointer min-w-[260px]"
                    >
                      {studentProfiles.map((p, pIdx) => (
                        <option key={`rep_sel_st_${p.student.id}_${pIdx}`} value={p.student.id}>
                          {formatStudentSelectorOption(p.student)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {activeStudentProfile && onNavigateToPersonalized && (
                  <button
                    type="button"
                    onClick={() => onNavigateToPersonalized(activeStudentProfile.student)}
                    className="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span>🎯</span>
                    <span>Mở Bản Đồ Năng Lực & Luyện Tập Thích Ứng →</span>
                  </button>
                )}
              </div>

              {!activeStudentProfile ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
                  <div className="text-3xl mb-2">👤</div>
                  <h3 className="text-sm font-bold text-gray-800">Chưa có học sinh nào được chọn</h3>
                  <p className="text-xs text-gray-500 mt-1">Vui lòng chọn một học sinh trong danh sách ở trên.</p>
                </div>
              ) : (
                <div className="space-y-6" ref={printRef}>
                  {/* Card Thẻ Danh Tính Học Sinh */}
                  <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 shadow-xs">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-100">
                      <div className="flex items-center gap-3.5">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md">
                          {(cleanStudentFullName(activeStudentProfile.student.name, activeStudentProfile.student.className) || 'HS').trim().charAt(0) || '👤'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight">
                              {cleanStudentFullName(activeStudentProfile.student.name, activeStudentProfile.student.className)}
                            </h2>
                            <span className="text-xs font-mono font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {activeStudentProfile.student.id}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 mt-1">
                            <span>Lớp: <strong className="text-gray-900">{activeStudentProfile.student.className}</strong></span>
                            <span>·</span>
                            <span>SĐT: <strong className="text-gray-900">{activeStudentProfile.student.phone}</strong></span>
                            <span>·</span>
                            <span>Trạng thái: <strong className="text-emerald-700">{activeStudentProfile.student.status || 'Mở'}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Xếp hạng năng lực số */}
                      <div className="text-right">
                        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Xếp Loại Năng Lực Số</div>
                        <div className="text-base font-black mt-0.5">
                          {activeStudentProfile.competencyRank === 'XUẤT_SẮC' ? (
                            <span className="text-emerald-700">🌟 Xuất Sắc</span>
                          ) : activeStudentProfile.competencyRank === 'ĐẠT_CHUẨN' ? (
                            <span className="text-blue-700">✅ Đạt Chuẩn</span>
                          ) : activeStudentProfile.competencyRank === 'CẦN_CỦNG_CỐ' ? (
                            <span className="text-rose-600">⚠️ Cần Củng Cố</span>
                          ) : (
                            <span className="text-gray-400">⏳ Chưa Tham Gia</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Metrics cá nhân */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-[11px] font-semibold text-gray-500">Số bài kiểm tra</div>
                        <div className="text-lg font-black text-gray-900 mt-0.5">
                          {activeStudentProfile.attemptCount} bài
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-[11px] font-semibold text-gray-500">Điểm trung bình</div>
                        <div className="text-lg font-black text-blue-700 mt-0.5">
                          {activeStudentProfile.avgScore10 > 0 ? `${activeStudentProfile.avgScore10}/10` : '--'}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-[11px] font-semibold text-gray-500">Điểm cao nhất</div>
                        <div className="text-lg font-black text-emerald-700 mt-0.5">
                          {activeStudentProfile.maxScore10 > 0 ? `${activeStudentProfile.maxScore10}/10` : '--'}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-[11px] font-semibold text-gray-500">Bài gần nhất</div>
                        <div className="text-lg font-black text-gray-900 mt-0.5">
                          {activeStudentProfile.latestScore10 > 0 ? `${activeStudentProfile.latestScore10}đ` : '--'}
                        </div>
                      </div>
                    </div>

                    {/* Biểu đồ 3 cấp độ nhận thức của học sinh */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="text-xs font-bold text-gray-700 mb-3">Tỷ lệ thành thạo theo 3 cấp độ nhận thức GDPT 2018:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl">
                          <div className="flex justify-between items-center text-xs font-bold text-emerald-900 mb-1">
                            <span>1. Nhận Biết</span>
                            <span>{activeStudentProfile.nbRate}%</span>
                          </div>
                          <div className="w-full bg-emerald-200/60 rounded-full h-2 overflow-hidden">
                            <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${activeStudentProfile.nbRate}%` }} />
                          </div>
                        </div>

                        <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl">
                          <div className="flex justify-between items-center text-xs font-bold text-blue-900 mb-1">
                            <span>2. Thông Hiểu</span>
                            <span>{activeStudentProfile.thRate}%</span>
                          </div>
                          <div className="w-full bg-blue-200/60 rounded-full h-2 overflow-hidden">
                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${activeStudentProfile.thRate}%` }} />
                          </div>
                        </div>

                        <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl">
                          <div className="flex justify-between items-center text-xs font-bold text-amber-900 mb-1">
                            <span>3. Vận Dụng</span>
                            <span>{activeStudentProfile.vdRate}%</span>
                          </div>
                          <div className="w-full bg-amber-200/60 rounded-full h-2 overflow-hidden">
                            <div className="bg-amber-600 h-2 rounded-full" style={{ width: `${activeStudentProfile.vdRate}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TIẾN TRÌNH CÁ NHÂN HÓA CỦA RIÊNG HỌC SINH NÀY */}
                  {(() => {
                    const stCases = personalizedCases.filter(c => c.studentId === activeStudentProfile.student.id || c.phone === activeStudentProfile.student.phone);
                    if (stCases.length === 0) return null;
                    return (
                      <div className="bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-blue-50/50 rounded-2xl border border-indigo-200/80 p-5 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">🎯</span>
                            <div>
                              <h3 className="text-sm sm:text-base font-black text-indigo-950">
                                Lộ Trình Tiến Bộ Cá Nhân Hóa (Bù Đắp Lỗ Hổng & Làm Lại Đề Cũ)
                              </h3>
                              <p className="text-xs text-indigo-700 mt-0.5">
                                Ghi nhận {stCases.length} bài kiểm tra học sinh đã được phân tích lỗi sai, luyện đề bù đắp và thi lại tiến bộ.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {stCases.filter(c => c.scoreDelta > 0).length}/{stCases.length} bài có tăng điểm
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {stCases.map((sc, scIdx) => (
                            <div key={`st_case_${sc.id}_${scIdx}`} className="bg-white rounded-xl p-4 border border-indigo-100 shadow-xs space-y-3">
                              <div className="flex justify-between items-start gap-2">
                                <h4 className="font-bold text-xs text-gray-900 leading-snug line-clamp-2">
                                  {sc.examTitle}
                                </h4>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                                  sc.status === 'TIẾN_BỘ_VƯỢT_BẬC' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                                  sc.status === 'CÓ_TIẾN_BỘ' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                  sc.status === 'GIỮ_VỮNG' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                  sc.status === 'CẦN_CỐ_GẮNG' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                  'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}>
                                  {sc.status === 'TIẾN_BỘ_VƯỢT_BẬC' ? '🌟 Vượt bậc' :
                                   sc.status === 'CÓ_TIẾN_BỘ' ? '✅ Có tiến bộ' :
                                   sc.status === 'GIỮ_VỮNG' ? '🎯 Giữ vững' :
                                   sc.status === 'CẦN_CỐ_GẮNG' ? '⚠️ Cần cố gắng' : '⏳ Đang luyện'}
                                </span>
                              </div>

                              {/* 3 Step Flow */}
                              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center">
                                {/* Lần 1 */}
                                <div className="space-y-0.5">
                                  <div className="text-[10px] font-semibold text-gray-500 uppercase">Điểm Lần 1</div>
                                  <div className={`text-base font-black ${sc.initialScore10 >= 8 ? 'text-emerald-700' : sc.initialScore10 >= 5 ? 'text-blue-700' : 'text-rose-600'}`}>
                                    {sc.initialScore10}đ
                                  </div>
                                  <div className="text-[10px] text-gray-400">{sc.initialCorrect}/{sc.initialTotal} câu</div>
                                </div>

                                {/* Luyện đề */}
                                <div className="space-y-0.5 border-x border-gray-200 px-1">
                                  <div className="text-[10px] font-semibold text-indigo-600 uppercase">Luyện bù đắp</div>
                                  <div className="text-base font-black text-indigo-700">
                                    {sc.practicePercent}%
                                  </div>
                                  <div className="text-[10px] text-indigo-600 font-medium">({sc.practiceScore}/{sc.practiceTotal} câu)</div>
                                </div>

                                {/* Làm lại Lần 2 */}
                                <div className="space-y-0.5">
                                  <div className="text-[10px] font-semibold text-gray-500 uppercase">Làm Lại Đề</div>
                                  {sc.hasRetaken ? (
                                    <>
                                      <div className="text-base font-black text-emerald-600">
                                        {sc.retestScore10}đ
                                      </div>
                                      <div className="text-[10px] font-bold text-emerald-700">
                                        {sc.scoreDelta > 0 ? `+${sc.scoreDelta}đ` : `${sc.scoreDelta}đ`}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-[11px] font-bold text-amber-600 mt-2">
                                      Đang làm...
                                    </div>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => setSelectedCaseModal(sc)}
                                className="w-full text-center py-1.5 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50/60 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                              >
                                Xem chi tiết lộ trình sư phạm →
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Lịch sử từng bài thi & Hồ sơ chẩn đoán chi tiết */}
                  <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
                          <span>📝</span>
                          <span>Chi Tiết Toàn Bộ Lượt Thi & Chẩn Đoán Lỗ Hổng Kiến Thức</span>
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Trích xuất kết quả từng câu hỏi, nguyên nhân vì sao sai và định hướng bồi dưỡng.
                        </p>
                      </div>
                    </div>

                    {activeStudentProfile.completed.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl text-gray-500 text-xs">
                        Học sinh này chưa hoàn thành bài kiểm tra nào trong hệ thống.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {activeStudentProfile.completed.map((attempt, aIdx) => {
                          const totalQ = attempt.totalQuestions || 10;
                          let s10 = attempt.score10 !== undefined ? Number(attempt.score10) : Math.round(((attempt.score || 0) / totalQ) * 10 * 10) / 10;
                          if (s10 > 10 && totalQ > 0) s10 = Math.round((s10 / totalQ) * 10 * 10) / 10;

                          const details = Array.isArray(attempt.details) ? attempt.details : [];
                          const wrongDetails = details.filter(d => !d.isCorrect);

                          return (
                            <div key={`rep_att_${attempt.turnId || 'turn'}_${aIdx}`} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-gray-200/80">
                                <div>
                                  <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                    <span>#{aIdx + 1}</span>
                                    <span>{attempt.examTitle || attempt.lessonName || 'Bài kiểm tra Sinh học'}</span>
                                  </div>
                                  <div className="text-[11px] text-gray-500 mt-0.5">
                                    Nộp lúc: {attempt.date ? new Date(attempt.date).toLocaleString('vi-VN') : 'Không xác định'} 
                                    {attempt.timeSpentSeconds && ` · Thời gian làm: ${Math.round(attempt.timeSpentSeconds / 60)} phút`}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <div className="text-xs font-semibold text-gray-500">Số câu đúng</div>
                                    <div className="text-sm font-bold text-gray-800">
                                      {attempt.score || 0}/{totalQ} câu
                                    </div>
                                  </div>
                                  <div className={`px-3 py-1.5 rounded-xl font-black text-base text-white ${s10 >= 8 ? 'bg-emerald-600' : s10 >= 5 ? 'bg-blue-600' : 'bg-rose-600'}`}>
                                    {s10}đ
                                  </div>
                                </div>
                              </div>

                              {/* Lỗi chẩn đoán câu hỏi sai */}
                              {wrongDetails.length === 0 ? (
                                <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5 py-1">
                                  <span>🎉</span>
                                  <span>Học sinh làm đúng 100% tất cả các câu hỏi trong đề thi này!</span>
                                </div>
                              ) : (
                                <div className="space-y-2 pt-1">
                                  <div className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                                    <span>⚠️</span>
                                    <span>Chi tiết {wrongDetails.length} câu học sinh trả lời chưa chính xác:</span>
                                  </div>
                                  <div className="space-y-2">
                                    {wrongDetails.map((w, wIdx) => {
                                      const levelLabel = w.cognitiveLevel === 'NHAN_BIET' 
                                        ? 'Nhận biết' 
                                        : w.cognitiveLevel === 'THONG_HIEU' 
                                          ? 'Thông hiểu' 
                                          : 'Vận dụng';

                                      return (
                                        <div key={`rep_w_${w.questionId || 'qid'}_${wIdx}`} className="bg-white p-3 rounded-xl border border-rose-100 text-xs space-y-1.5">
                                          <div className="flex justify-between items-start gap-2">
                                            <div className="font-bold text-gray-900 leading-snug">
                                              {w.questionIndex ? `Câu ${w.questionIndex}: ` : ''}{w.questionText || `Câu hỏi số ${wIdx + 1}`}
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                                              w.cognitiveLevel === 'NHAN_BIET' ? 'bg-emerald-100 text-emerald-800' :
                                              w.cognitiveLevel === 'THONG_HIEU' ? 'bg-blue-100 text-blue-800' :
                                              'bg-amber-100 text-amber-800'
                                            }`}>
                                              {levelLabel}
                                            </span>
                                          </div>

                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                                            <div className="text-rose-600">
                                              Học sinh chọn: <strong>{w.selectedAnswer || 'Bỏ trống'}</strong>
                                            </div>
                                            <div className="text-emerald-700">
                                              Đáp án đúng: <strong>{w.correctAnswer || '--'}</strong>
                                            </div>
                                          </div>

                                          {w.reasonWhyWrong && (
                                            <div className="text-[11px] text-gray-700 bg-amber-50/70 p-2 rounded-lg border border-amber-100">
                                              <strong>Chẩn đoán nguyên nhân:</strong> {w.reasonWhyWrong}
                                            </div>
                                          )}

                                          {w.explanation && (
                                            <div className="text-[11px] text-gray-600 bg-slate-50 p-2 rounded-lg">
                                              <strong>Giải thích:</strong> {w.explanation}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* CHẾ ĐỘ 3: BÁO CÁO CÁC TRƯỜNG HỢP CÁ NHÂN HÓA */}
          {/* ========================================================================= */}
          {reportMode === 'PERSONALIZED' && (
            <div className="space-y-6">
              {/* Banner Giới Thiệu Mô Hình Sư Phạm */}
              <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-950 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-indigo-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🧬</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                      Quy Trình Sư Phạm GDPT 2018 • Bồi Dưỡng Cá Nhân Hóa
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                    Theo Dõi Tiến Trình Phát Hiện Lỗ Hổng, Luyện Đề Bù Đắp &amp; Đánh Giá Mức Độ Tiến Bộ
                  </h2>
                  <p className="text-xs text-indigo-200/90 leading-relaxed">
                    Hệ thống tự động theo dõi từng bài kiểm tra: Khi học sinh mắc lỗi sai ở lần 1, AI chẩn đoán phát hiện lỗ hổng và chỉ định gói bài tập bù đắp. Sau khi học sinh hoàn thành luyện tập đạt trên 80%, đề kiểm tra gốc được mở khóa để học sinh làm lại lần 2 nhằm kiểm chứng mức tăng điểm thực chất.
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full md:w-auto gap-2 border-t md:border-t-0 md:border-l border-indigo-700/60 pt-3 md:pt-0 md:pl-5 shrink-0">
                  <div className="text-left sm:text-right">
                    <div className="text-[11px] text-indigo-300 font-semibold uppercase">Hiệu Quả Tiến Bộ</div>
                    <div className="text-2xl font-black text-emerald-400">
                      +{personalizedAggregatedStats.avgProgressDelta}đ
                    </div>
                  </div>
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold">
                    {personalizedAggregatedStats.improvedCount}/{personalizedAggregatedStats.retakenCount || 1} ca tăng điểm ({personalizedAggregatedStats.improvedRate}%)
                  </span>
                </div>
              </div>

              {/* 5 KEY KPI SUMMARY CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
                {/* 1. Tổng Ca Cá Nhân Hóa */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Tổng Ca Can Thiệp</span>
                    <span>🎯</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900">
                    {personalizedAggregatedStats.totalCases}
                    <span className="text-xs font-semibold text-gray-400"> ca</span>
                  </div>
                  <div className="text-xs text-blue-600 font-semibold mt-1">
                    {personalizedAggregatedStats.retakenCount} ca đã làm lại đề cũ
                  </div>
                </div>

                {/* 2. Điểm Kiểm Tra Lần 1 */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Điểm Thi Lần 1 TB</span>
                    <span>📝</span>
                  </div>
                  <div className="text-2xl font-black text-amber-600">
                    {personalizedAggregatedStats.avgInitialScore}
                    <span className="text-sm font-normal text-gray-400">/10</span>
                  </div>
                  <div className="text-xs text-gray-500 font-medium mt-1">
                    Thời điểm phát hiện lỗ hổng
                  </div>
                </div>

                {/* 3. Tỷ Lệ Đạt Khi Luyện Đề Bù Đắp */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Luyện Đề Bù Đắp TB</span>
                    <span>⚡</span>
                  </div>
                  <div className="text-2xl font-black text-indigo-700">
                    {personalizedAggregatedStats.avgPracticePercent}%
                  </div>
                  <div className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                    <span>✅</span> <span>Đạt chuẩn mở khóa (&gt; 80%)</span>
                  </div>
                </div>

                {/* 4. Điểm TB Sau Khi Làm Lại */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Điểm Làm Lại L2 TB</span>
                    <span>🌟</span>
                  </div>
                  <div className="text-2xl font-black text-emerald-700">
                    {personalizedAggregatedStats.avgRetestScore}
                    <span className="text-sm font-normal text-gray-400">/10</span>
                  </div>
                  <div className="text-xs text-gray-500 font-medium mt-1">
                    {personalizedAggregatedStats.superImprovedCount} ca tăng ≥ 3.0đ
                  </div>
                </div>

                {/* 5. Mức Tiến Bộ Trung Bình */}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs col-span-2 md:col-span-1">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Mức Tăng Điểm TB</span>
                    <span>📈</span>
                  </div>
                  <div className="text-2xl font-black text-emerald-600">
                    +{personalizedAggregatedStats.avgProgressDelta}đ
                  </div>
                  <div className="text-xs text-indigo-600 font-semibold mt-1">
                    Tỷ lệ tăng: {personalizedAggregatedStats.improvedRate}% ca
                  </div>
                </div>
              </div>

              {/* QUICK FILTER PILLS BAR */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-gray-200/80 shadow-xs print:hidden">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-500 mr-1">Phân loại:</span>
                  <button
                    type="button"
                    onClick={() => setPersonalizedFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      personalizedFilter === 'ALL'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Tất cả ({personalizedCases.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonalizedFilter('SUPER_IMPROVED')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      personalizedFilter === 'SUPER_IMPROVED'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
                    }`}
                  >
                    🚀 Tiến bộ vượt bậc ({personalizedCases.filter(c => c.scoreDelta >= 3.0).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonalizedFilter('IMPROVED')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      personalizedFilter === 'IMPROVED'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    📈 Có tiến bộ ({personalizedCases.filter(c => c.scoreDelta > 0).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonalizedFilter('RETAKEN')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      personalizedFilter === 'RETAKEN'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    🔄 Đã làm lại đề ({personalizedCases.filter(c => c.hasRetaken).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonalizedFilter('IN_PRACTICE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      personalizedFilter === 'IN_PRACTICE'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    ⏳ Đang luyện bù đắp ({personalizedCases.filter(c => !c.hasRetaken).length})
                  </button>
                </div>

                <div className="text-xs text-gray-500 font-medium">
                  Hiển thị <strong className="text-gray-900">{filteredPersonalizedCases.length}</strong> ca tiến bộ
                </div>
              </div>

              {/* BẢNG CHI TIẾT CÁC TRƯỜNG HỢP CÁ NHÂN HÓA */}
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-gray-900 flex items-center gap-2">
                      <span>🎯</span>
                      <span>Danh Sách Chi Tiết Các Trường Hợp Cá Nhân Hóa &amp; Tiến Bộ Năng Lực</span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Đối chiếu trực tiếp điểm số ban đầu, phần trăm &amp; số điểm đạt khi luyện đề bù đắp và mức tăng điểm sau khi làm lại đề gốc.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      📋 {scopeActiveExams.length} đề thi hệ thống
                    </span>
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                      title="Xuất file Excel (.xlsx) chuẩn 8 cột theo đúng mẫu bảng hiển thị"
                    >
                      <span>📊</span>
                      <span>Xuất File Excel (Mẫu Bảng)</span>
                    </button>
                  </div>
                </div>

                {filteredPersonalizedCases.length === 0 ? (
                  <div className="p-12 text-center text-gray-500 space-y-2">
                    <div className="text-4xl">🔍</div>
                    <div className="text-sm font-bold text-gray-800">Không tìm thấy trường hợp cá nhân hóa nào phù hợp</div>
                    <p className="text-xs text-gray-500 max-w-md mx-auto">
                      Hãy thử thay đổi phạm vi Khối / Lớp hoặc từ khóa tìm kiếm để xem các ca bồi dưỡng khác.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 text-gray-600 font-bold border-b border-gray-200 uppercase text-[11px] tracking-wider whitespace-nowrap">
                          <th className="py-3.5 px-3 text-center w-12">STT</th>
                          <th className="py-3.5 px-3">Mã HS &amp; Họ Tên</th>
                          <th className="py-3.5 px-3">Bài Kiểm Tra Đánh Giá</th>
                          <th className="py-3.5 px-3 text-center">Điểm Thi Lần 1</th>
                          <th className="py-3.5 px-3 text-center">Luyện Đề Bù Đắp</th>
                          <th className="py-3.5 px-3 text-center">Làm Lại Đề Cũ</th>
                          <th className="py-3.5 px-3 text-center">Mức Tiến Bộ</th>
                          <th className="py-3.5 px-3 text-center">Đánh Giá Sư Phạm</th>
                          <th className="py-3.5 px-3 text-center print:hidden">Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredPersonalizedCases.map((c, idx) => {
                          const deltaText = c.scoreDelta > 0 ? `+${c.scoreDelta}đ` : `${c.scoreDelta}đ`;
                          const cleanName = cleanStudentFullName(c.studentName, c.className);

                          return (
                            <tr key={`pcase_${c.id}_${idx}`} className="hover:bg-slate-50/80 transition-colors">
                              {/* STT */}
                              <td className="py-3 px-3 text-center text-gray-500 font-semibold">
                                {idx + 1}
                              </td>

                              {/* Mã HS & Họ Tên */}
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[11px]">
                                    {c.studentId}
                                  </span>
                                  <span className="font-bold text-gray-900">
                                    {cleanName}
                                  </span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                    {c.className}
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  SĐT: {c.phone}
                                </div>
                              </td>

                              {/* Bài kiểm tra */}
                              <td className="py-3 px-3 max-w-[240px]">
                                <div className="font-bold text-gray-800 line-clamp-2 leading-snug">
                                  {c.examTitle}
                                </div>
                                <div className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                                  {c.examGrade ? `Sinh học ${c.examGrade}` : 'Sinh học THPT'}
                                </div>
                              </td>

                              {/* Điểm kiểm tra lần 1 */}
                              <td className="py-3 px-3 text-center">
                                <div className="inline-flex flex-col items-center">
                                  <span className={`px-2.5 py-1 rounded-xl font-black text-xs text-white ${
                                    c.initialScore10 >= 8 ? 'bg-emerald-600' :
                                    c.initialScore10 >= 5 ? 'bg-blue-600' : 'bg-rose-600'
                                  }`}>
                                    {c.initialScore10}đ
                                  </span>
                                  <span className="text-[10px] text-gray-500 font-medium mt-1">
                                    {c.initialCorrect}/{c.initialTotal} câu đúng
                                  </span>
                                  <div className="flex items-center gap-1 text-[9px] text-gray-400 mt-0.5">
                                    <span>Sai:</span>
                                    <span className="text-amber-600 font-bold">{c.initialWrongNB}NB</span>
                                    <span>/</span>
                                    <span className="text-blue-600 font-bold">{c.initialWrongTH}TH</span>
                                    <span>/</span>
                                    <span className="text-rose-600 font-bold">{c.initialWrongVD}VD</span>
                                  </div>
                                </div>
                              </td>

                              {/* Luyện đề bù đắp (% và số điểm/câu) */}
                              <td className="py-3 px-3 text-center min-w-[150px]">
                                <div className="inline-flex flex-col items-center w-full max-w-[140px]">
                                  <div className="flex items-center justify-between w-full text-[11px] font-bold text-indigo-900 mb-1">
                                    <span>{c.practicePercent}% đạt</span>
                                    <span className="text-indigo-600 text-[10px]">({c.practiceScore}/{c.practiceTotal} câu)</span>
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                    <div
                                      className={`h-2 rounded-full ${
                                        c.practicePercent >= 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-amber-500'
                                      }`}
                                      style={{ width: `${Math.min(100, Math.max(5, c.practicePercent))}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-0.5">
                                    <span>{c.practicePercent >= 80 ? '✅ Đạt chuẩn (>80%)' : '⚠️ Cần luyện thêm'}</span>
                                  </span>
                                </div>
                              </td>

                              {/* Điểm sau khi làm lại đề cũ */}
                              <td className="py-3 px-3 text-center">
                                {c.hasRetaken ? (
                                  <div className="inline-flex flex-col items-center">
                                    <span className={`px-2.5 py-1 rounded-xl font-black text-xs text-white ${
                                      (c.retestScore10 || 0) >= 8 ? 'bg-emerald-600' :
                                      (c.retestScore10 || 0) >= 5 ? 'bg-blue-600' : 'bg-rose-600'
                                    }`}>
                                      {c.retestScore10}đ
                                    </span>
                                    <span className="text-[10px] text-gray-500 font-medium mt-1">
                                      {c.retestCorrect}/{c.retestTotal} câu đúng
                                    </span>
                                    <span className="text-[9px] text-gray-400 mt-0.5">
                                      {formatViDateSafe(c.retestDate) || 'Đã nộp'}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="inline-flex flex-col items-center text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                                    <span className="text-[11px] font-bold">⏳ Đang luyện</span>
                                    <span className="text-[9px] text-amber-600">Chưa thi lại L2</span>
                                  </div>
                                )}
                              </td>

                              {/* Mức tiến bộ */}
                              <td className="py-3 px-3 text-center">
                                {c.hasRetaken ? (
                                  <div className="inline-flex flex-col items-center">
                                    <span className={`px-2 py-0.5 rounded-lg font-black text-xs flex items-center gap-1 ${
                                      c.scoreDelta >= 3.0 ? 'bg-purple-100 text-purple-900 border border-purple-300' :
                                      c.scoreDelta > 0 ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
                                      c.scoreDelta === 0 ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                                      'bg-rose-50 text-rose-800 border border-rose-200'
                                    }`}>
                                      <span>{c.scoreDelta > 0 ? '📈' : c.scoreDelta === 0 ? '🎯' : '📉'}</span>
                                      <span>{deltaText}</span>
                                    </span>
                                    <span className="text-[10px] text-gray-500 font-medium mt-0.5">
                                      {c.initialScore10}đ ➔ {c.retestScore10}đ
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 font-bold">--</span>
                                )}
                              </td>

                              {/* Đánh giá sư phạm */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                  c.status === 'TIẾN_BỘ_VƯỢT_BẬC' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                                  c.status === 'CÓ_TIẾN_BỘ' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                  c.status === 'GIỮ_VỮNG' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                  c.status === 'CẦN_CỐ_GẮNG' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                  'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}>
                                  {c.status === 'TIẾN_BỘ_VƯỢT_BẬC' ? '🌟 Tiến bộ vượt bậc' :
                                   c.status === 'CÓ_TIẾN_BỘ' ? '✅ Có tiến bộ' :
                                   c.status === 'GIỮ_VỮNG' ? '🎯 Giữ vững điểm số' :
                                   c.status === 'CẦN_CỐ_GẮNG' ? '⚠️ Cần cố gắng' : '⏳ Đang luyện bù đắp'}
                                </span>
                              </td>

                              {/* Thao tác */}
                              <td className="py-3 px-3 text-center print:hidden whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedCaseModal(c)}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] transition-colors cursor-pointer border border-indigo-200"
                                    title="Xem chi tiết các bước bồi dưỡng và phân tích câu sai"
                                  >
                                    🔍 Chi tiết
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectStudent(c.studentId)}
                                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-colors cursor-pointer"
                                    title="Chuyển sang xem toàn bộ hồ sơ năng lực của học sinh này"
                                  >
                                    👤 Hồ sơ
                                  </button>
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
            </div>
          )}
        </>
      )}

      {/* FOOTER SIGNATURE FOR PRINT */}
      <div className="hidden print:grid grid-cols-2 gap-8 text-center text-xs mt-12 pt-8 border-t border-gray-300">
        <div>
          <div className="font-bold uppercase">NGƯỜI LẬP BÁO CÁO</div>
          <div className="italic text-[11px] text-gray-500">(Ký và ghi rõ họ tên)</div>
          <div className="h-20" />
          <div className="font-bold">{user.name}</div>
        </div>
        <div>
          <div className="font-bold uppercase">TỔ TRƯỞNG CHUYÊN MÔN SINH HỌC</div>
          <div className="italic text-[11px] text-gray-500">(Ký và duyệt)</div>
          <div className="h-20" />
          <div className="font-bold">Admin Giáo Viên</div>
        </div>
      </div>

      {/* MODAL CHI TIẾT CA CÁ NHÂN HÓA */}
      {selectedCaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200 p-5 sm:p-6 space-y-5 animate-scale-up">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl shadow-xs">
                  🎯
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 leading-tight">
                    Hồ Sơ Tiến Trình Cá Nhân Hóa &amp; Bù Đắp Lỗ Hổng
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-0.5">
                    <strong className="text-blue-700 font-mono">{selectedCaseModal.studentId}</strong>
                    <span>·</span>
                    <strong className="text-gray-900">{cleanStudentFullName(selectedCaseModal.studentName, selectedCaseModal.className)}</strong>
                    <span>·</span>
                    <span>Lớp: <strong>{selectedCaseModal.className}</strong></span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCaseModal(null)}
                className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-slate-100 flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Exam Banner */}
            <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs space-y-1">
              <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Bài Kiểm Tra Đánh Giá</div>
              <div className="text-sm font-bold text-indigo-950">{selectedCaseModal.examTitle}</div>
              <div className="text-indigo-700 text-[11px]">
                {selectedCaseModal.examGrade ? `Khối lớp: Sinh học ${selectedCaseModal.examGrade}` : 'Môn Sinh học THPT'}
              </div>
            </div>

            {/* 3 Pedagogical Steps */}
            <div className="space-y-3">
              {/* Bước 1 */}
              <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/40 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                    <span>1️⃣</span>
                    <span>Kết Quả Kiểm Tra Ban Đầu (Lần 1)</span>
                  </div>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-rose-600 text-white">
                    {selectedCaseModal.initialScore10}đ ({selectedCaseModal.initialCorrect}/{selectedCaseModal.initialTotal} câu đúng)
                  </span>
                </div>
                <div className="text-xs text-gray-700 leading-relaxed">
                  Hệ thống phân tích các lỗi sai câu hỏi: <strong>{selectedCaseModal.initialWrongNB}</strong> câu Nhận biết, <strong>{selectedCaseModal.initialWrongTH}</strong> câu Thông hiểu, <strong>{selectedCaseModal.initialWrongVD}</strong> câu Vận dụng.
                </div>
                {selectedCaseModal.initialDate && (
                  <div className="text-[10px] text-gray-500">
                    Thời điểm làm bài: {new Date(selectedCaseModal.initialDate).toLocaleString('vi-VN')}
                  </div>
                )}
              </div>

              {/* Bước 2 */}
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <span>2️⃣</span>
                    <span>Luyện Tập Thích Ứng Bù Đắp Lỗ Hổng Kiến Thức</span>
                  </div>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white">
                    {selectedCaseModal.practicePercent}% ({selectedCaseModal.practiceScore}/{selectedCaseModal.practiceTotal} câu)
                  </span>
                </div>
                <div className="text-xs text-gray-700 leading-relaxed">
                  Học sinh đã ôn tập lý thuyết trọng tâm và làm bài luyện tập thích ứng bù đắp đạt <strong>{selectedCaseModal.practicePercent}%</strong>, đủ điều kiện mở khóa làm lại đề cũ (yêu cầu trên 80%).
                </div>
                {selectedCaseModal.practiceTopics && selectedCaseModal.practiceTopics.length > 0 && (
                  <div className="text-[11px] text-indigo-800 bg-white p-2 rounded-lg border border-indigo-100">
                    <strong>Chủ đề đã củng cố:</strong> {selectedCaseModal.practiceTopics.join(', ')}
                  </div>
                )}
              </div>

              {/* Bước 3 */}
              <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <span>3️⃣</span>
                    <span>Kết Quả Đánh Giá Lại Sau Khi Bù Đắp (Lần 2)</span>
                  </div>
                  {selectedCaseModal.hasRetaken ? (
                    <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white">
                      {selectedCaseModal.retestScore10}đ ({selectedCaseModal.retestCorrect}/{selectedCaseModal.retestTotal} câu đúng)
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      Đang luyện tập
                    </span>
                  )}
                </div>
                {selectedCaseModal.hasRetaken ? (
                  <div className="text-xs text-gray-700 leading-relaxed">
                    Mức tăng điểm tiến bộ: <strong className="text-emerald-700 text-sm font-black">{selectedCaseModal.scoreDelta > 0 ? `+${selectedCaseModal.scoreDelta}đ` : `${selectedCaseModal.scoreDelta}đ`}</strong>. 
                    {selectedCaseModal.scoreDelta >= 3.0 ? (
                      <span className="text-purple-700 font-bold"> Tiến bộ vượt bậc! Học sinh đã bù đắp hoàn toàn các khái niệm bị hổng.</span>
                    ) : selectedCaseModal.scoreDelta > 0 ? (
                      <span className="text-emerald-700 font-bold"> Học sinh đã cải thiện rõ rệt năng lực số môn Sinh học.</span>
                    ) : (
                      <span className="text-blue-700 font-bold"> Học sinh duy trì điểm số ổn định.</span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-amber-700">
                    Học sinh đang trong giai đoạn luyện tập củng cố lý thuyết và chuẩn bị làm lại bài kiểm tra.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setSelectedCaseModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  const sId = selectedCaseModal.studentId;
                  setSelectedCaseModal(null);
                  handleSelectStudent(sId);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                Xem Toàn Bộ Hồ Sơ Học Sinh →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ReportView;
