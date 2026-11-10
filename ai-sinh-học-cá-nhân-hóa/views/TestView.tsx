import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  User, 
  UserRole, 
  Exam, 
  Question, 
  BIO_TOPICS, 
  SAMPLE_BIO_CURRICULUM, 
  CurriculumLesson,
  TEXTBOOK_SERIES,
  CURRICULUM_PROGRAM
} from '../types';
import { 
  getExams, 
  publishExamToCloud, 
  submitExamResultToCloud, 
  deleteExamFromCloud, 
  fetchCloudLeaderboard,
  getStorageData,
  REMOVED_EXAM_IDS,
  isExamDeleted,
  markExamAsDeleted,
  syncAllMasterExamsToCloud,
  syncTwoWayExams,
  exportExamsToJSONFile,
  importExamsFromJSONText,
  getMasterExams,
  generateNextExamId,
  formatExamDisplayId,
  getGradePrefix,
  isStandardExamId,
  deduplicateExams,
  sortExamsNewestFirst,
  formatExamCreatedAt,
  findExistingExamForLesson,
  getLessonNormalizedKey,
  getGradeAndLessonKey,
  saveStoredUser,
  mergeExamHistories,
  getStoredUserByPhone,
  getStudentGrade,
  getExamGrade,
  filterExamHistoryByStudentGrade
} from '../services/dataService';
import { 
  generateQuestionsFromDocument, 
  generateBiologyQuestions,
  analyzeLearningObjectives,
  formatDisplayQuestionText
} from '../services/geminiService';
import { DiagnosticLearningCenter } from '../components/DiagnosticLearningCenter';
import { GoogleAppsScriptModal } from '../components/GoogleAppsScriptModal';
import { 
  buildStudentCompetencyProfile, 
  saveCompetencyProfile, 
  getSavedCompetencyProfile,
  checkExamAttemptPermission,
  ExamAttemptPermission,
  isRemedialOrPracticeTurn,
  isMatchingExamId,
  isExamAttemptMatching
} from '../services/diagnosticService';
import { StudentCompetencyProfile } from '../types';

interface TestViewProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  setNavigationBlocker?: React.Dispatch<React.SetStateAction<(() => boolean) | null>>;
  onOpenLogin?: () => void;
}

export const TestView: React.FC<TestViewProps> = ({ user, onUpdateUser, setNavigationBlocker, onOpenLogin }) => {
  const isLoggedIn = !user.isGuest && user.phone !== 'guest';
  const isAdmin = useMemo(() => {
    if (!user) return false;
    const cleanPhone = (user.phone || '').toString().trim().replace(/^0+/, '');
    const isAdminPhone = cleanPhone === '966000224' || user.phone === '0966000224' || cleanPhone === '912345678' || user.phone === '0912345678';
    return user.role === UserRole.ADMIN && isAdminPhone;
  }, [user]);
  const [exams, setExams] = useState<Exam[]>(() => {
    try {
      const stored = getStorageData<Exam[]>('bio_exams', []);
      return sortExamsNewestFirst(deduplicateExams(stored || []).filter(e => e && e.category !== 'BATTLE' && !isExamDeleted(e.id)));
    } catch {
      return [];
    }
  });
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [activeDiagnosticProfile, setActiveDiagnosticProfile] = useState<StudentCompetencyProfile | null>(null);
  const [diagnosticInitialTab, setDiagnosticInitialTab] = useState<'COMPETENCY' | 'REMEDIAL' | 'PRACTICE' | 'PROGRESS'>('COMPETENCY');
  const [isLoading, setIsLoading] = useState(true);

  // Yêu cầu đăng nhập học sinh để làm bài kiểm tra
  const [showLoginPromptModal, setShowLoginPromptModal] = useState(false);
  const [pendingExamToStart, setPendingExamToStart] = useState<Exam | null>(null);

  // Modal thông báo khi đề thi đã làm 1 lần và cần hoàn thành bù đắp > 80% để mở khóa
  const [lockedExamAttemptInfo, setLockedExamAttemptInfo] = useState<{ exam: Exam; permission: ExamAttemptPermission } | null>(null);

  // Bảo vệ không cho học sinh chưa đăng nhập ở trong màn hình làm bài
  useEffect(() => {
    if (activeExam && !isLoggedIn && !isAdmin) {
      setActiveExam(null);
      setShowLoginPromptModal(true);
    }
  }, [activeExam, isLoggedIn, isAdmin]);
  
  // Interactive Curriculum Selections (Khối Lớp, Chủ Đề, Tên Bài Học, Yêu Cầu Cần Đạt)
  const [selectedGrade, setSelectedGrade] = useState<'Lớp 10' | 'Lớp 11' | 'Lớp 12'>('Lớp 10');
  const [selectedTopic, setSelectedTopic] = useState<string>(SAMPLE_BIO_CURRICULUM['Lớp 10']?.[0]?.topic || '');
  const [inputLessonName, setInputLessonName] = useState<string>(SAMPLE_BIO_CURRICULUM['Lớp 10']?.[0]?.lesson || '');
  const [inputLearningObjectives, setInputLearningObjectives] = useState<string>(SAMPLE_BIO_CURRICULUM['Lớp 10']?.[0]?.yccd || '');
  const [isGeneratingCustomTest, setIsGeneratingCustomTest] = useState(false);
  const [viewingObjectiveExam, setViewingObjectiveExam] = useState<Exam | null>(null);
  const [viewingAnswersExam, setViewingAnswersExam] = useState<Exam | null>(null);
  const [showAnswersInTest, setShowAnswersInTest] = useState(false);
  const [filterOnlyCurrentSelection, setFilterOnlyCurrentSelection] = useState(false);
  // Quản lý trạng thái đóng/mở (xổ xuống) khung YCCĐ cho từng đề thi
  const [expandedYccdIds, setExpandedYccdIds] = useState<Record<string, boolean>>({});

  // Kiểm tra đề kiểm tra hiện có cho bài học và khối lớp đang chọn
  // (Theo quy định: ở 1 khối lớp thì mỗi bài học chỉ tạo duy nhất 1 bài kiểm tra, trừ khi xóa bài cũ đó rồi mới tạo lại được)
  const existingExamForSelectedLesson = useMemo(() => {
    const lessonToCheck = inputLessonName.trim() || selectedTopic.trim();
    if (!lessonToCheck) return null;
    return findExistingExamForLesson(exams, selectedGrade, lessonToCheck) || null;
  }, [exams, selectedGrade, inputLessonName, selectedTopic]);

  // Cấu hình số lượng câu hỏi & thời gian cho AI tạo đề:
  // - Khối 10, 11: 2 ô câu hỏi (Trắc Nghiệm, Đúng/Sai) + Thời gian
  // - Khối 12: 3 ô câu hỏi (Trắc Nghiệm, Đúng/Sai, Trả lời ngắn) + Thời gian
  const [customTracNghiem, setCustomTracNghiem] = useState<number>(8);
  const [customDungSai, setCustomDungSai] = useState<number>(2);
  const [customTraLoiNgan, setCustomTraLoiNgan] = useState<number>(6);
  const [customDuration, setCustomDuration] = useState<number>(15);

  const toggleYccd = (examId: string) => {
    setExpandedYccdIds(prev => ({
      ...prev,
      [examId]: !prev[examId]
    }));
  };

  // Phân tích mức độ nhận thức của YCCĐ hiện tại (Lớp 12: 3 phần; Lớp 10 & 11: 2 phần)
  const cognitiveConfig = useMemo(() => {
    return analyzeLearningObjectives(inputLearningObjectives, undefined, selectedGrade);
  }, [inputLearningObjectives, selectedGrade]);

  // Admin Create/Edit Exam State
  const [isEditing, setIsEditing] = useState(false);
  const [editingExam, setEditingExam] = useState<Partial<Exam> & { questions: Question[] }>({
    title: '',
    category: 'Sinh 12',
    grade: 'Lớp 12',
    topic: '',
    lessonName: '',
    learningObjectives: '',
    duration: 15,
    questions: []
  });
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin Results Detail State
  const [viewingResultsExam, setViewingResultsExam] = useState<Exam | null>(null);
  const [allExamResults, setAllExamResults] = useState<any[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<any | null>(null);
  const [detailFilter, setDetailFilter] = useState<'ALL' | 'INCORRECT'>('ALL');

  // Student Playing State
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startTime, setStartTime] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Popup nổi hiển thị thời gian làm bài (kéo thả linh hoạt)
  const [timerPosition, setTimerPosition] = useState<{ x?: number; y?: number }>({});
  const [isDraggingTimer, setIsDraggingTimer] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  const handleTimerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: el.left,
      initY: el.top
    };
    setIsDraggingTimer(true);
  };

  const handleTimerTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.touches[0]) return;
    const el = e.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      initX: el.left,
      initY: el.top
    };
    setIsDraggingTimer(true);
  };

  useEffect(() => {
    if (!isDraggingTimer) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const newX = Math.max(8, Math.min(window.innerWidth - 110, dragStartRef.current.initX + dx));
      const newY = Math.max(8, Math.min(window.innerHeight - 50, dragStartRef.current.initY + dy));
      setTimerPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      dragStartRef.current = null;
      setIsDraggingTimer(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragStartRef.current || !e.touches[0]) return;
      const dx = e.touches[0].clientX - dragStartRef.current.startX;
      const dy = e.touches[0].clientY - dragStartRef.current.startY;
      const newX = Math.max(8, Math.min(window.innerWidth - 110, dragStartRef.current.initX + dx));
      const newY = Math.max(8, Math.min(window.innerHeight - 50, dragStartRef.current.initY + dy));
      setTimerPosition({ x: newX, y: newY });
    };

    const handleTouchEnd = () => {
      dragStartRef.current = null;
      setIsDraggingTimer(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDraggingTimer]);

  // Admin Search/Filter
  const [adminSearchTerm, setAdminSearchTerm] = useState('');
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<string>('ALL');
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<string>('ALL'); // Dành cho admin

  // Modal Xóa đề thi dành cho Admin Giáo Viên
  const [deletingExam, setDeletingExam] = useState<Exam | null>(null);
  const [isDeletingExam, setIsDeletingExam] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Đồng bộ đám mây & Sao lưu / Phục hồi đề thi (JSON)
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [showAppsScriptModal, setShowAppsScriptModal] = useState(false);
  const jsonBackupInputRef = useRef<HTMLInputElement>(null);

  const handleSyncCloudExams = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await syncTwoWayExams();
      await loadExams();
      setToastMessage(`🔄 ${res.message}`);
    } catch (err) {
      setToastMessage("⚠️ Có lỗi khi đồng bộ 2 chiều với Google Sheet. Đang thử tải lại danh sách...");
      await loadExams();
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleExportBackup = () => {
    const success = exportExamsToJSONFile(exams);
    if (success) {
      setToastMessage("📥 Đã xuất file sao lưu ngân hàng đề thi thành công!");
    } else {
      setToastMessage("⚠️ Không thể xuất file sao lưu.");
    }
  };

  const handleImportBackup = () => {
    if (jsonBackupInputRef.current) {
      jsonBackupInputRef.current.value = '';
      jsonBackupInputRef.current.click();
    }
  };

  const handleJsonFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await importExamsFromJSONText(text);
      if (res.success) {
        await loadExams();
        setToastMessage(`🎉 ${res.message}`);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`Lỗi khi đọc file sao lưu: ${err.message || ''}`);
    }
  };

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Xác định khối lớp chính xác của tài khoản học sinh ('10' | '11' | '12' | null)
  const currentStudentGrade = useMemo<'10' | '11' | '12' | null>(() => {
    return getStudentGrade(user);
  }, [user]);

  const currentStudentGradeLabel = useMemo<'Lớp 10' | 'Lớp 11' | 'Lớp 12' | null>(() => {
    if (currentStudentGrade === '12') return 'Lớp 12';
    if (currentStudentGrade === '11') return 'Lớp 11';
    if (currentStudentGrade === '10') return 'Lớp 10';
    return null;
  }, [currentStudentGrade]);

  // Hàm xác định đề thi thuộc khối lớp nào ('Lớp 10' | 'Lớp 11' | 'Lớp 12')
  const getExamGradeCategory = useCallback((e: Exam): 'Lớp 10' | 'Lớp 11' | 'Lớp 12' => {
    if (!e) return 'Lớp 10';
    const detected = getExamGrade(e, exams);
    if (detected === '12') return 'Lớp 12';
    if (detected === '11') return 'Lớp 11';
    if (detected === '10') return 'Lớp 10';
    if (e.grade === 'Lớp 10' || e.grade === 'Lớp 11' || e.grade === 'Lớp 12') return e.grade;
    return 'Lớp 10';
  }, [exams]);

  // Bộ lọc dành cho học sinh: Khối lớp & Trạng thái làm bài
  type StudentGradeFilter = 'ALL' | 'Lớp 10' | 'Lớp 11' | 'Lớp 12';
  type StudentExamFilter = 'ALL' | 'UNCOMPLETED' | 'COMPLETED';
  const [studentGradeFilter, setStudentGradeFilter] = useState<StudentGradeFilter>(
    currentStudentGradeLabel || 'ALL'
  );
  const [studentFilter, setStudentFilter] = useState<StudentExamFilter>('ALL');

  // Tự động đồng bộ theo đúng khối lớp của học sinh đăng nhập (Ví dụ: học sinh khối 10 thì tự động lọc Lớp 10)
  useEffect(() => {
    if (!isAdmin && currentStudentGradeLabel) {
      setStudentGradeFilter(currentStudentGradeLabel);
    }
  }, [currentStudentGradeLabel, isAdmin]);

  // Trạng thái làm bài của học sinh hiện tại đối với đề thi (Đã làm, Điểm cao nhất, Số lượt)
  const getExamStatusForUser = useCallback((examId: string) => {
    const targetExam = (exams || []).find(e => e.id === examId);
    const attempts = (user.examHistory || []).filter(h => {
      if (!h) return false;
      return isExamAttemptMatching(h, targetExam || examId);
    });
    if (attempts.length === 0) return null;
    const scores10 = attempts.map(a => {
      if (typeof a.score10 === 'number') return a.score10;
      const tot = a.totalQuestions || 10;
      return tot > 0 ? Math.round((a.score / tot) * 10 * 10) / 10 : a.score;
    });
    const maxScore = Math.max(...scores10);
    const lastAttempt = attempts[0];
    return {
      attemptsCount: attempts.length,
      maxScore,
      lastAttemptDate: lastAttempt.date
    };
  }, [user.examHistory, exams]);

  // Kiểm tra đề thi có thuộc về chính học sinh/giáo viên hiện tại hay không
  const isMyExam = useCallback((exam: Exam) => {
    if (!exam) return false;
    if (!user || user.isGuest || user.phone === 'guest') return false;
    if (user.studentId && exam.studentId === user.studentId) return true;
    if (user.phone && (exam.creatorPhone === user.phone || exam.studentId === user.phone)) return true;
    if (user.name && (exam.studentName === user.name || exam.createdBy === user.name || exam.createdBy === `Giáo viên ${user.name}`)) return true;
    return false;
  }, [user]);

  // Đếm thống kê cho học sinh theo đúng khối lớp của tài khoản
  const studentDisplayedExams = useMemo(() => {
    return (exams || []).filter(e => {
      if (!e) return false;
      const examGrade = getExamGradeCategory(e);
      if (currentStudentGradeLabel) {
        return examGrade === currentStudentGradeLabel;
      }
      if (studentGradeFilter === 'ALL') return true;
      return examGrade === studentGradeFilter;
    });
  }, [exams, getExamGradeCategory, currentStudentGradeLabel, studentGradeFilter]);

  const studentCompletedCount = useMemo(() => {
    return studentDisplayedExams.filter(e => e && !!getExamStatusForUser(e.id)).length;
  }, [studentDisplayedExams, getExamStatusForUser]);

  const studentUncompletedCount = useMemo(() => {
    return studentDisplayedExams.filter(e => e && !getExamStatusForUser(e.id)).length;
  }, [studentDisplayedExams, getExamStatusForUser]);

  const countGrade10 = useMemo(() => (exams || []).filter(e => e && getExamGradeCategory(e) === 'Lớp 10').length, [exams, getExamGradeCategory]);
  const countGrade11 = useMemo(() => (exams || []).filter(e => e && getExamGradeCategory(e) === 'Lớp 11').length, [exams, getExamGradeCategory]);
  const countGrade12 = useMemo(() => (exams || []).filter(e => e && getExamGradeCategory(e) === 'Lớp 12').length, [exams, getExamGradeCategory]);

  // Danh sách học sinh duy nhất trong các đề thi (để Giáo viên / Admin lọc theo profile từng em)
  const uniqueStudents = useMemo(() => {
    const map = new Map<string, { id?: string; name: string; class?: string }>();
    (exams || []).forEach(e => {
      if (!e) return;
      const stName = (e.studentName || '').trim();
      const stId = (e.studentId || '').trim();
      const creator = (e.createdBy || '').trim();

      const isTeacherOrAdmin = (str: string) => {
        if (!str) return false;
        const lower = str.toLowerCase();
        return (
          lower.includes('giáo viên') ||
          lower.includes('admin') ||
          lower.includes('hội đồng') ||
          lower.includes('chuyên môn') ||
          /lâm\s*thái\s*hiển/i.test(lower)
        );
      };

      // Đề thi do Giáo viên/Admin tạo thì không đưa vào danh sách lọc học sinh
      if (isTeacherOrAdmin(creator) && !stName && !stId) {
        return;
      }

      if (stName && isTeacherOrAdmin(stName)) {
        return;
      }

      const effectiveName = stName || (!isTeacherOrAdmin(creator) ? creator : '');
      if (!effectiveName && !stId) return;

      const key = stId || e.creatorPhone || effectiveName;
      if (key && !map.has(key)) {
        map.set(key, {
          id: stId || undefined,
          name: effectiveName || 'Học sinh',
          class: e.studentClass
        });
      }
    });
    return Array.from(map.values());
  }, [exams]);

  const loadExams = async () => {
    setIsLoading(true);
    try {
      const data = await getExams();
      const sanitizedList = (data || []).map(e => {
        if (!e) return e;
        let cb = e.createdBy || 'Admin Giáo Viên';
        if (/lâm\s*thái\s*hiển/i.test(cb)) {
          cb = 'Admin Giáo Viên';
        }
        let sn = e.studentName;
        if (sn && /lâm\s*thái\s*hiển/i.test(sn)) {
          sn = undefined;
        }
        return { ...e, createdBy: cb, studentName: sn };
      });
      setExams(sortExamsNewestFirst(deduplicateExams(sanitizedList).filter(e => e && e.category !== 'BATTLE' && !isExamDeleted(e))));
    } catch (error) { 
      console.warn("Chưa tải được đề từ đám mây, đang sử dụng dữ liệu cục bộ:", error); 
    } finally { 
      setIsLoading(false); 
    }
  };

  useEffect(() => { 
    loadExams(); 
    // Tự động khởi tạo khối lớp và bài học theo profile học sinh
    const initialGrade = currentStudentGradeLabel || 'Lớp 10';
    setSelectedGrade(initialGrade);
    const defaultSample = SAMPLE_BIO_CURRICULUM[initialGrade]?.[0];
    if (defaultSample) {
      setSelectedTopic(defaultSample.topic);
      setInputLessonName(defaultSample.lesson);
      setInputLearningObjectives(defaultSample.yccd);
    }
    if (initialGrade === 'Lớp 12') {
      setCustomTracNghiem(18);
      setCustomDungSai(4);
      setCustomTraLoiNgan(6);
      setCustomDuration(50);
    } else {
      setCustomTracNghiem(8);
      setCustomDungSai(2);
      setCustomTraLoiNgan(0);
      setCustomDuration(15);
    }
  }, [currentStudentGradeLabel, user.phone, user.role]);

  const handleGradeChange = (grade: 'Lớp 10' | 'Lớp 11' | 'Lớp 12') => {
    setSelectedGrade(grade);
    const sample = SAMPLE_BIO_CURRICULUM[grade]?.[0];
    if (sample) {
      setSelectedTopic(sample.topic);
      setInputLessonName(sample.lesson);
      setInputLearningObjectives(sample.yccd);
    } else {
      setSelectedTopic('');
      setInputLessonName('');
      setInputLearningObjectives('');
    }
    if (grade === 'Lớp 12') {
      setCustomTracNghiem(18);
      setCustomDungSai(4);
      setCustomTraLoiNgan(6);
      setCustomDuration(50);
    } else {
      setCustomTracNghiem(8);
      setCustomDungSai(2);
      setCustomTraLoiNgan(0);
      setCustomDuration(15);
    }
  };

  const handleTopicChange = (topic: string) => {
    setSelectedTopic(topic);
    const sample = SAMPLE_BIO_CURRICULUM[selectedGrade]?.find(s => s.topic === topic);
    if (sample) {
      setInputLessonName(sample.lesson);
      setInputLearningObjectives(sample.yccd);
    }
  };

  const handleSelectSample = (sample: CurriculumLesson) => {
    setSelectedTopic(sample.topic);
    setInputLessonName(sample.lesson);
    setInputLearningObjectives(sample.yccd);
  };

  // Timer logic for student view
  useEffect(() => {
    let timer: any;
    if (activeExam && timeLeft > 0 && score === null) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && activeExam && score === null) {
      handleSubmitExam();
    }
    return () => clearInterval(timer);
  }, [timeLeft, activeExam, score]);

  const blocker = useCallback(() => {
    return window.confirm('⚠️ Cảnh báo: Bạn đang làm bài thi!\n\nNếu rời đi bây giờ, toàn bộ kết quả sẽ bị mất. Bạn có chắc chắn muốn thoát?');
  }, []);

  useEffect(() => {
    if (!setNavigationBlocker) return;
    const isTakingExam = activeExam !== null && score === null;
    const isActuallyEditing = isEditing;
    
    if (isTakingExam && Object.keys(answers).length > 0) {
      setNavigationBlocker(() => blocker);
    } else if (isActuallyEditing) {
      setNavigationBlocker(() => () => window.confirm('Thay đổi của bạn chưa được lưu. Thoát?'));
    } else {
      setNavigationBlocker(null);
    }
  }, [activeExam, score, answers, setNavigationBlocker, blocker, isEditing]);

  const handleStartExam = (exam: Exam) => {
    // Lưu ý: Tài khoản học sinh cần phải đăng nhập thành công mới có thể vào làm bài kiểm tra
    if (!isLoggedIn && !isAdmin) {
      setPendingExamToStart(exam);
      setShowLoginPromptModal(true);
      return;
    }

    // Kiểm tra trạng thái hồ sơ học sinh: nếu bị khóa thì không được làm bài
    const stStatus = ((user as any).status || (user as any).Trang_Thai || '').toString().toLowerCase();
    if (stStatus === 'đóng' || stStatus === 'dong' || stStatus === 'khóa' || stStatus === 'khoa') {
      alert('⚠️ HỒ SƠ ĐANG BỊ KHÓA!\n\nHồ sơ học sinh của bạn hiện đang bị Giáo viên quản nhiệm KHÓA.\nKhi khóa hồ sơ, mọi thông tin học sinh và kết quả kiểm tra sẽ KHÔNG được cập nhật lên hệ thống.\n\nVui lòng liên hệ Thầy/Cô để mở khóa hồ sơ.');
      return;
    }

    // Quy định: Mỗi bài kiểm tra mỗi tài khoản chỉ được làm 1 lần.
    // Khi hoàn thành "Luyện Tập Bù Đắp Lỗ Hổng" và Đánh giá tiến độ trên 80% mới được làm lại đề gốc.
    const permission = checkExamAttemptPermission(exam.id, user, isAdmin, exam);
    if (!permission.canTake) {
      setLockedExamAttemptInfo({ exam, permission });
      return;
    }

    setActiveExam(exam);
    setAnswers({});
    setScore(null);
    setTimeLeft(exam.duration * 60);
    setStartTime(new Date().toISOString());
    setTimerPosition({});
  };

  // Tự động mở đề thi nếu được chọn trực tiếp từ Trang Chủ
  useEffect(() => {
    try {
      const targetExamId = sessionStorage.getItem('target_exam_id_to_start');
      if (targetExamId && exams.length > 0 && !activeExam) {
        sessionStorage.removeItem('target_exam_id_to_start');
        const target = exams.find(e => isMatchingExamId(e.id, targetExamId));
        if (target) {
          handleStartExam(target);
        }
      }
    } catch {}
  }, [exams, activeExam]);

  const handleAnswer = (qId: string, val: string) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const handleSubmitExam = async () => {
    if (!activeExam) return;
    const stStatus = ((user as any).status || (user as any).Trang_Thai || '').toString().toLowerCase();
    if (stStatus === 'đóng' || stStatus === 'dong' || stStatus === 'khóa' || stStatus === 'khoa') {
      alert('⚠️ HỒ SƠ ĐANG BỊ KHÓA!\n\nHồ sơ học sinh của bạn hiện đang bị Giáo viên quản nhiệm KHÓA.\nKhi khóa hồ sơ, mọi thông tin học sinh và kết quả kiểm tra sẽ KHÔNG được cập nhật lên hệ thống.');
      return;
    }
    setIsSubmitting(true);
    let correctCount = 0;
    const details: any[] = [];
    const totalQuestions = (activeExam.questions || []).length;
    let wrongNhanBiet = 0;
    let wrongThongHieu = 0;
    let wrongVanDung = 0;
    
    (activeExam.questions || []).forEach((q, idx) => {
      if (!q) return;
      let isCorrect = false;
      const userAns = (answers[q.id] || '').trim();
      const correctAns = (q.correctAnswer || '').trim();

      if (q.type === 'SA') {
        if (userAns.toLowerCase() === correctAns.toLowerCase()) {
          isCorrect = true;
        } else if (!isNaN(Number(userAns)) && !isNaN(Number(correctAns)) && Number(userAns) === Number(correctAns)) {
          isCorrect = true;
        }
      } else {
        isCorrect = userAns.toUpperCase() === correctAns.toUpperCase();
      }

      // Xác định mức độ nhận thức (Nhận biết, Thông hiểu, Vận dụng)
      const textLower = (q.text || '').toLowerCase();
      let cognitiveLevel: 'NHAN_BIET' | 'THONG_HIEU' | 'VAN_DUNG' = 'NHAN_BIET';
      if (textLower.includes('vận dụng') || textLower.includes('thực tế') || textLower.includes('ứng dụng') || q.type === 'SA') {
        cognitiveLevel = 'VAN_DUNG';
      } else if (textLower.includes('thông hiểu') || textLower.includes('phân biệt') || textLower.includes('giải thích')) {
        cognitiveLevel = 'THONG_HIEU';
      } else if (textLower.includes('nhận biết') || textLower.includes('khái niệm') || textLower.includes('liệt kê')) {
        cognitiveLevel = 'NHAN_BIET';
      } else {
        if (idx < Math.ceil(totalQuestions * 0.4)) {
          cognitiveLevel = 'NHAN_BIET';
        } else if (idx < Math.ceil(totalQuestions * 0.75)) {
          cognitiveLevel = 'THONG_HIEU';
        } else {
          cognitiveLevel = 'VAN_DUNG';
        }
      }

      if (isCorrect) {
        correctCount++;
      } else {
        if (cognitiveLevel === 'NHAN_BIET') wrongNhanBiet++;
        else if (cognitiveLevel === 'THONG_HIEU') wrongThongHieu++;
        else wrongVanDung++;
      }

      details.push({
        questionId: q.id,
        questionText: formatDisplayQuestionText(q.text),
        userAnswer: answers[q.id] || 'Chưa trả lời',
        correctAnswer: q.correctAnswer,
        isCorrect,
        cognitiveLevel
      });
    });

    const now = new Date();
    const endIso = now.toISOString();
    const startMs = startTime ? new Date(startTime).getTime() : now.getTime() - ((activeExam.duration || 15) * 60 * 1000);
    const durationSeconds = Math.max(1, Math.min((activeExam.duration || 15) * 60, Math.round((now.getTime() - startMs) / 1000)));
    const score10 = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 10 * 100) / 100 : 0;
    const turnId = `LT_${Date.now()}`;

    // Xây dựng Hồ sơ Năng Lực & Chuẩn đoán Lỗ Hỏng Kiến Thức
    const compProfile = buildStudentCompetencyProfile(activeExam, user, answers, correctCount);
    saveCompetencyProfile(compProfile, user.phone);
    setDiagnosticInitialTab('COMPETENCY');
    setActiveDiagnosticProfile(compProfile);

    const detectedG = getExamGrade(activeExam, exams);
    const examGradeStr = activeExam.grade || (detectedG ? `Lớp ${detectedG}` : undefined);

    const newResult = {
      turnId,
      examId: activeExam.id,
      examTitle: activeExam.title,
      lessonName: activeExam.lessonName || activeExam.topic || activeExam.title,
      grade: examGradeStr,
      score: correctCount,
      totalQuestions,
      score10,
      timeSpentSeconds: durationSeconds,
      wrongNhanBiet,
      wrongThongHieu,
      wrongVanDung,
      date: endIso,
      startTime: startTime,
      endTime: endIso,
      details,
      competencyProfile: compProfile
    };
    
    try {
      if (user.isGuest || user.phone === 'guest') {
        const updatedUser: User = {
          ...user,
          totalScore: (user.totalScore || 0) + correctCount,
          examHistory: mergeExamHistories([newResult], user.examHistory || [], user)
        };
        saveStoredUser(updatedUser);
        onUpdateUser(updatedUser);
      } else {
        const result = await submitExamResultToCloud(user.phone, newResult, {
          studentId: user.studentId,
          name: user.name,
          className: user.className,
          phone: user.phone
        });
        if (result.success && result.updatedUser) {
          const finalHistory = mergeExamHistories([newResult], result.updatedUser.examHistory || [], user);
          const finalUser: User = {
            ...result.updatedUser,
            totalScore: Math.max(result.updatedUser.totalScore || 0, (user.totalScore || 0) + correctCount),
            examHistory: finalHistory
          };
          saveStoredUser(finalUser);
          onUpdateUser(finalUser);
        } else {
          const updatedUser: User = {
            ...user,
            totalScore: (user.totalScore || 0) + correctCount,
            examHistory: mergeExamHistories([newResult], user.examHistory || [], user)
          };
          saveStoredUser(updatedUser);
          onUpdateUser(updatedUser);
        }
      }
      setScore(correctCount);
    } catch (err) {
      console.warn("Lỗi đồng bộ kết quả thi trực tuyến, đã bảo lưu an toàn trong máy:", err);
      const updatedUser: User = {
        ...user,
        totalScore: (user.totalScore || 0) + correctCount,
        examHistory: mergeExamHistories([newResult], user.examHistory || [], user)
      };
      saveStoredUser(updatedUser);
      onUpdateUser(updatedUser);
      setScore(correctCount);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDiagnostic = (exam: Exam, tab: 'COMPETENCY' | 'REMEDIAL' | 'PRACTICE' | 'PROGRESS' = 'COMPETENCY') => {
    let saved = getSavedCompetencyProfile(exam.id, user.phone);
    const originalAttempts = (user.examHistory || []).filter(
      h => h && isExamAttemptMatching(h, exam) && !isRemedialOrPracticeTurn(h)
    );
    const latestAttempt = originalAttempts[0];

    if (!saved && latestAttempt?.competencyProfile) {
      saved = latestAttempt.competencyProfile;
    }

    if (!saved) {
      const simulatedAnswers: Record<string, string> = {};
      const correctCnt = latestAttempt ? latestAttempt.score : 0;
      if (latestAttempt?.details) {
        latestAttempt.details.forEach(d => {
          simulatedAnswers[d.questionId] = d.userAnswer;
        });
      }
      saved = buildStudentCompetencyProfile(exam, user, simulatedAnswers, correctCnt);
      saveCompetencyProfile(saved, user.phone);
    }
    setDiagnosticInitialTab(tab);
    setActiveDiagnosticProfile(saved);
  };

  // Quick AI Test Generator directly from selections (Dành cho Admin Giáo Viên)
  const handleQuickAIGenerate = async () => {
    if (!isAdmin) {
      alert("Chỉ tài khoản Admin Giáo Viên mới có quyền tạo đề thi.");
      return;
    }

    const finalLessonName = inputLessonName.trim();
    const finalTopic = selectedTopic.trim();
    if (!finalLessonName && !finalTopic) {
      alert("Vui lòng chọn Chủ Đề hoặc nhập Tên Bài Học để AI có thể soạn đề.");
      return;
    }

    // KIỂM TRA QUY ĐỊNH HỆ THỐNG:
    // Ở 1 khối lớp thì mỗi bài học chỉ tạo 1 bài kiểm tra, trừ khi xóa bài cũ đó rồi mới tạo lại được.
    const lessonToCheck = finalLessonName || finalTopic;
    const existingExam = findExistingExamForLesson(exams, selectedGrade, lessonToCheck);
    if (existingExam) {
      const displayId = formatExamDisplayId(existingExam.id, existingExam.grade, existingExam.title);
      alert(`⚠️ QUY ĐỊNH HỆ THỐNG:\n\nỞ mỗi khối lớp, mỗi bài học chỉ được tạo duy nhất 1 bài kiểm tra!\n\nKhối ${selectedGrade} hiện đã có bài kiểm tra #${displayId}: "${existingExam.title}".\n\n👉 Để tạo lại đề mới, bạn vui lòng XÓA bài kiểm tra cũ #${displayId} trước (nhấn nút "Xóa" trên thẻ bài kiểm tra trong danh sách), hoặc nhấn "Sửa" để cập nhật nội dung bài kiểm tra hiện có!`);
      return;
    }

    setIsGeneratingCustomTest(true);
    try {
      const isLop12 = selectedGrade === 'Lớp 12';
      const saCount = isLop12 ? customTraLoiNgan : 0;
      const totalEstimated = customTracNghiem + customDungSai * 4 + saCount;
      const questions = await generateBiologyQuestions({
        grade: selectedGrade,
        topic: finalTopic,
        lessonName: finalLessonName,
        learningObjectives: inputLearningObjectives.trim(),
        count: totalEstimated,
        tracNghiemCount: customTracNghiem,
        dungSaiCount: customDungSai,
        traLoiNganCount: saCount
      });

      if (!questions || questions.length === 0) {
        alert("Không thể khởi tạo câu hỏi từ AI vào lúc này. Vui lòng thử lại.");
        return;
      }

      const categoryCode = selectedGrade === 'Lớp 10' ? 'Sinh 10' : (selectedGrade === 'Lớp 11' ? 'Sinh 11' : 'Sinh 12');
      const examTitle = finalLessonName || `${finalTopic} - ${selectedGrade}`;
      const newExamId = generateNextExamId(selectedGrade, exams, examTitle);
      const newExam: Exam = {
        id: newExamId,
        title: examTitle,
        category: categoryCode,
        grade: selectedGrade,
        topic: finalTopic,
        lessonName: finalLessonName,
        learningObjectives: inputLearningObjectives.trim(),
        duration: Math.max(1, customDuration || 15),
        questions,
        createdBy: 'Admin Giáo Viên',
        createdAt: new Date().toISOString()
      };

      await publishExamToCloud(newExam);
      setExams(prev => [newExam, ...prev.filter(e => e.id !== newExam.id)]);
      alert(`🎉 Đã tạo và phát hành đề thi mới: "${examTitle}" cho Khối ${selectedGrade}!\nToàn bộ học sinh khối ${selectedGrade} đã nhận được đề thi này trong danh sách để vào làm.`);
    } catch (err) {
      console.error("AI Generation Error:", err);
      alert("Lỗi khi tạo đề thi với AI. Vui lòng thử lại sau.");
    } finally {
      setIsGeneratingCustomTest(false);
    }
  };

  // --- ADMIN ACTIONS ---
  const handleOpenCreate = () => {
    if (!isLoggedIn) {
      if (onOpenLogin) onOpenLogin();
      return;
    }
    const curTopic = selectedTopic || BIO_TOPICS[selectedGrade]?.[0] || '';
    const currentLessonOrTopic = inputLessonName || curTopic;

    // Kiểm tra quy định hệ thống: 1 khối lớp thì mỗi bài học chỉ tạo duy nhất 1 bài kiểm tra
    const existing = findExistingExamForLesson(exams, selectedGrade, currentLessonOrTopic);
    if (existing) {
      const displayId = formatExamDisplayId(existing.id, existing.grade, existing.title);
      alert(`⚠️ Khối ${selectedGrade} đã có bài kiểm tra cho bài học "${existing.lessonName || existing.title}" (Mã: #${displayId}).\n\nTheo quy định, mỗi bài học trong một khối lớp chỉ được tạo duy nhất 1 bài kiểm tra. Bạn cần xóa bài cũ trước rồi mới tạo lại được!`);
      return;
    }

    const newId = generateNextExamId(selectedGrade, exams, inputLessonName || curTopic);
    setEditingExam({
      id: newId,
      title: inputLessonName || curTopic || 'Đề kiểm tra Sinh học',
      category: selectedGrade === 'Lớp 10' ? 'Sinh 10' : (selectedGrade === 'Lớp 11' ? 'Sinh 11' : 'Sinh 12'),
      grade: selectedGrade,
      topic: curTopic,
      lessonName: inputLessonName,
      learningObjectives: inputLearningObjectives,
      duration: 15,
      questions: []
    });
    setIsEditing(true);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isLoggedIn) {
      if (onOpenLogin) onOpenLogin();
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessingAI(true);
    try {
      const questions = await generateQuestionsFromDocument(file);
      setEditingExam(prev => ({
        ...prev,
        questions: [...prev.questions, ...questions]
      }));
    } catch (err) {
      alert("Lỗi khi xử lý file. Vui lòng thử lại.");
    } finally {
      setIsProcessingAI(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAIGenerate = async () => {
    if (!isLoggedIn) {
      if (onOpenLogin) onOpenLogin();
      return;
    }
    const targetTopic = editingExam.topic || editingExam.title;
    if (!targetTopic && !editingExam.lessonName) {
      return alert("Vui lòng chọn Chủ đề hoặc nhập Tên bài học trước để AI có thể soạn đề.");
    }
    setIsProcessingAI(true);
    try {
      const questions = await generateBiologyQuestions({
        grade: editingExam.grade || (editingExam.category === 'Sinh 10' ? 'Lớp 10' : editingExam.category === 'Sinh 11' ? 'Lớp 11' : 'Lớp 12'),
        topic: targetTopic || '',
        lessonName: editingExam.lessonName || '',
        learningObjectives: editingExam.learningObjectives || '',
        count: 10
      });
      setEditingExam(prev => ({
        ...prev,
        questions: [...prev.questions, ...questions]
      }));
    } catch (err) {
      alert("AI đang bận. Vui lòng thử lại sau.");
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleAddQuestion = (type: 'MCQ' | 'TF' | 'SA') => {
    if (!isLoggedIn) {
      if (onOpenLogin) onOpenLogin();
      return;
    }
    const newQ: Question = {
      id: `man-${Date.now()}`,
      text: 'Nội dung câu hỏi mới...',
      type,
      options: type === 'MCQ' ? ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'] : (type === 'TF' ? ['Đúng', 'Sai'] : []),
      correctAnswer: type === 'MCQ' ? 'A' : (type === 'TF' ? 'Đúng' : '')
    };
    setEditingExam(prev => ({ ...prev, questions: [...prev.questions, newQ] }));
  };

  const handleUpdateQuestion = (id: string, updates: Partial<Question>) => {
    setEditingExam(prev => ({
      ...prev,
      questions: prev.questions.map(q => q.id === id ? { ...q, ...updates } : q)
    }));
  };

  const handleDeleteQuestion = (id: string) => {
    setEditingExam(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== id)
    }));
  };

  const handleSaveExam = async () => {
    if (!isAdmin) {
      alert("Chỉ tài khoản Admin Giáo Viên mới có quyền lưu đề thi.");
      return;
    }

    if (!editingExam.title || editingExam.questions.length === 0) {
      return alert("Vui lòng nhập tên đề thi / bài học và ít nhất 1 câu hỏi.");
    }

    const targetGrade = editingExam.grade || (editingExam.category === 'Sinh 10' ? 'Lớp 10' : editingExam.category === 'Sinh 11' ? 'Lớp 11' : 'Lớp 12');
    const targetLessonOrTitle = editingExam.lessonName || editingExam.title || editingExam.topic || '';

    // Kiểm tra quy định hệ thống: ở 1 khối lớp thì mỗi bài học chỉ tạo duy nhất 1 bài kiểm tra
    const existingOther = findExistingExamForLesson(exams, targetGrade, targetLessonOrTitle, editingExam.id);
    if (existingOther) {
      const displayId = formatExamDisplayId(existingOther.id, existingOther.grade, existingOther.title);
      alert(`⚠️ Không thể lưu: Khối ${targetGrade} đã có bài kiểm tra cho bài học này (Mã: #${displayId} - "${existingOther.title}").\n\nTheo quy định, mỗi bài học trong một khối lớp chỉ được tạo duy nhất 1 bài kiểm tra. Bạn cần xóa bài cũ trước rồi mới tạo lại được!`);
      return;
    }

    setIsSubmitting(true);
    const cat = editingExam.category || (targetGrade === 'Lớp 10' ? 'Sinh 10' : targetGrade === 'Lớp 11' ? 'Sinh 11' : 'Sinh 12');
    let finalExamId = (editingExam.id || '').trim();
    if (!finalExamId || !isStandardExamId(finalExamId)) {
      finalExamId = generateNextExamId(targetGrade, exams, editingExam.title || editingExam.lessonName);
    }
    const fullExam: Exam = {
      id: finalExamId.toUpperCase(),
      title: editingExam.title,
      category: cat,
      grade: targetGrade,
      topic: editingExam.topic,
      lessonName: editingExam.lessonName,
      learningObjectives: editingExam.learningObjectives,
      duration: editingExam.duration || 15,
      questions: editingExam.questions,
      createdBy: editingExam.createdBy && !/lâm\s*thái\s*hiển/i.test(editingExam.createdBy) ? editingExam.createdBy : 'Admin Giáo Viên',
      createdAt: editingExam.createdAt || new Date().toISOString()
    };

    const success = await publishExamToCloud(fullExam);
    if (success) {
      alert(`🎉 Đã lưu và phát hành đề thi thành công cho Khối ${targetGrade}!\nToàn bộ học sinh khối ${targetGrade} sẽ nhận được đề thi này trong danh sách để vào làm.`);
      setIsEditing(false);
      loadExams();
    } else {
      alert("Lỗi khi lưu đề thi lên hệ thống.");
    }
    setIsSubmitting(false);
  };

  const fetchResults = async (exam: Exam) => {
    setViewingResultsExam(exam);
    setIsLoadingResults(true);
    try {
      const allUsers = await fetchCloudLeaderboard('QUARTER');
      const results: any[] = [];
      (allUsers || []).forEach((u: any) => {
        if (!u) return;
        const match = Array.isArray(u.examHistory) ? u.examHistory.find((h: any) => h && isExamAttemptMatching(h, exam)) : undefined;
        if (match) {
          results.push({ ...match, userName: u.name || 'Học sinh', userClass: u.className || 'Học viên', phone: u.phone });
        }
      });
      setAllExamResults(results.sort((a, b) => b.score - a.score));
    } catch (e) { 
      console.warn("Chưa lấy được kết quả từ máy chủ:", e); 
    } finally { 
      setIsLoadingResults(false); 
    }
  };

  const handleDeleteExam = (exam: Exam, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!isAdmin && !isMyExam(exam)) {
      setToastMessage("⛔ Chỉ tài khoản Admin Giáo Viên hoặc người tạo đề mới có quyền xóa bài kiểm tra.");
      return;
    }
    setDeletingExam(exam);
  };

  const confirmDeleteExam = async () => {
    if (!deletingExam) return;
    if (!isAdmin && !isMyExam(deletingExam)) {
      setToastMessage("⛔ Chỉ tài khoản Admin Giáo Viên mới có quyền xóa bài kiểm tra.");
      setDeletingExam(null);
      return;
    }

    setIsDeletingExam(true);
    const targetId = deletingExam.id;
    const targetTitle = deletingExam.title;

    try {
      // 1. Ghi nhận xóa vĩnh viễn và xóa optimistic trong state & localStorage
      markExamAsDeleted(targetId);
      setExams(prev => (prev || []).filter(e => e && e.id !== targetId && String(e.id) !== String(targetId) && !isExamDeleted(e.id)));
      
      // Nếu đang mở chỉnh sửa đề này thì đóng form biên tập
      if (isEditing && editingExam.id === targetId) {
        setIsEditing(false);
      }

      // 2. Gửi lệnh xóa lên cloud server
      await deleteExamFromCloud(targetId);
      
      setToastMessage(`✅ Đã xóa bài kiểm tra "${targetTitle}" thành công!`);
    } catch (error) {
      console.warn("Lỗi đồng bộ xóa đề thi đám mây, đã xóa khỏi bộ nhớ máy:", error);
      setExams(prev => (prev || []).filter(e => e && e.id !== targetId && String(e.id) !== String(targetId) && !isExamDeleted(e.id)));
      setToastMessage(`✅ Đã gỡ bỏ bài kiểm tra "${targetTitle}" khỏi danh sách.`);
    } finally {
      setIsDeletingExam(false);
      setDeletingExam(null);
    }
  };

  const exportExcel = (data: any[], name: string) => {
    if (!data || !Array.isArray(data) || data.length === 0) return;
    const BOM = '\uFEFF';
    let csv = BOM + Object.keys(data[0]).join(",") + "\n";
    data.forEach(row => {
      if (!row) return;
      csv += Object.values(row).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(",") + "\n";
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `${name}.csv`;
    link.click();
  };

  const handleExportOverview = () => {
    if (!allExamResults.length) return;
    exportExcel(allExamResults.map(r => ({
      "Học sinh": r.userName, "Lớp": r.userClass, "Điểm": r.score,
      "Bắt đầu": r.startTime ? new Date(r.startTime).toLocaleString('vi-VN') : 'N/A',
      "Nộp bài": new Date(r.date).toLocaleString('vi-VN')
    })), `TongQuan_${viewingResultsExam?.id}`);
  };

  const filteredExams = useMemo(() => {
    const filtered = exams.filter(e => {
      // 1. Search term filter
      const matchesSearch = !adminSearchTerm || 
        e.title.toLowerCase().includes(adminSearchTerm.toLowerCase()) || 
        e.id.includes(adminSearchTerm) ||
        (e.lessonName && e.lessonName.toLowerCase().includes(adminSearchTerm.toLowerCase())) ||
        (e.topic && e.topic.toLowerCase().includes(adminSearchTerm.toLowerCase())) ||
        (e.createdBy && e.createdBy.toLowerCase().includes(adminSearchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // 2. DÀNH CHO HỌC SINH (KHÔNG PHẢI ADMIN):
      // - Tài khoản học sinh khối nào THÌ CHỈ HIỆN ĐỀ KIỂM TRA KHỐI ĐÓ
      // - Lọc theo trạng thái Đã làm / Chưa làm
      if (!isAdmin) {
        const examGrade = getExamGradeCategory(e);
        if (currentStudentGradeLabel) {
          // Tài khoản học sinh khối 10 chỉ hiện đề kiểm tra khối 10, tương tự khối 11, 12
          if (examGrade !== currentStudentGradeLabel) {
            return false;
          }
        } else if (studentGradeFilter !== 'ALL' && examGrade !== studentGradeFilter) {
          return false;
        }

        const status = getExamStatusForUser(e.id);
        if (studentFilter === 'COMPLETED' && !status) return false;
        if (studentFilter === 'UNCOMPLETED' && !!status) return false;
        return true;
      }

      // 3. DÀNH CHO ADMIN GIÁO VIÊN:
      if (selectedStudentFilter !== 'ALL') {
        const matchesStudent = (e.studentId && e.studentId === selectedStudentFilter) ||
          (e.creatorPhone && e.creatorPhone === selectedStudentFilter) ||
          (e.studentName && e.studentName === selectedStudentFilter) ||
          (e.createdBy && e.createdBy.includes(selectedStudentFilter));
        if (!matchesStudent) return false;
      }

      if (!filterOnlyCurrentSelection) {
        const matchesCat = adminCategoryFilter === 'ALL' || e.category === adminCategoryFilter;
        return matchesCat;
      }

      // 4. Nếu Admin bấm "Lọc đề trong kho"
      const gradeCat = selectedGrade === 'Lớp 10' ? 'Sinh 10' : (selectedGrade === 'Lớp 11' ? 'Sinh 11' : 'Sinh 12');
      const matchesGrade = e.category === gradeCat || e.grade === selectedGrade || getExamGradeCategory(e) === selectedGrade;
      
      const matchesTopic = !selectedTopic || !e.topic || 
        e.topic.toLowerCase().includes(selectedTopic.toLowerCase()) || 
        e.title.toLowerCase().includes(selectedTopic.toLowerCase());
      
      const matchesLesson = !inputLessonName || !e.lessonName || 
        e.lessonName.toLowerCase().includes(inputLessonName.toLowerCase()) || 
        e.title.toLowerCase().includes(inputLessonName.toLowerCase());

      return matchesGrade && (matchesTopic || matchesLesson);
    });
    return sortExamsNewestFirst(filtered);
  }, [exams, adminSearchTerm, adminCategoryFilter, selectedStudentFilter, studentGradeFilter, studentFilter, filterOnlyCurrentSelection, selectedGrade, selectedTopic, inputLessonName, isAdmin, currentStudentGradeLabel, getExamGradeCategory, getExamStatusForUser]);

  // Kiểm tra phương án đúng cho câu hỏi trắc nghiệm
  const isOptionCorrect = (q: Question, opt: string, optIndex: number): boolean => {
    if (!q || !q.correctAnswer) return false;
    const cleanAns = q.correctAnswer.trim().toUpperCase();
    const letters = ['A', 'B', 'C', 'D'];
    if (cleanAns === letters[optIndex]) return true;
    const optClean = opt.trim();
    if (optClean.toUpperCase().startsWith(cleanAns + '.') || optClean.toUpperCase().startsWith(cleanAns + ':') || optClean.toUpperCase().startsWith(cleanAns + ')')) return true;
    if (optClean.toLowerCase() === q.correctAnswer.trim().toLowerCase()) return true;
    const optWithoutPrefix = optClean.replace(/^[A-D][.:)\s]+/i, '').trim().toLowerCase();
    const ansWithoutPrefix = q.correctAnswer.trim().replace(/^[A-D][.:)\s]+/i, '').trim().toLowerCase();
    if (optWithoutPrefix && ansWithoutPrefix && optWithoutPrefix === ansWithoutPrefix) return true;
    return false;
  };

  // Modal Xem Đáp Án & Hướng Dẫn Giải Chi Tiết (Dành riêng cho Admin Giáo Viên)
  const AnswerKeyModal: React.FC<{
    exam: Exam | null;
    onClose: () => void;
    onStartExam?: (exam: Exam) => void;
  }> = ({ exam, onClose, onStartExam }) => {
    const [tab, setTab] = useState<'ALL' | 'MCQ' | 'TF' | 'SA'>('ALL');
    const [copied, setCopied] = useState(false);

    if (!exam) return null;

    const mcqQuestions = (exam.questions || []).filter(q => q.type === 'MCQ');
    const tfQuestions = (exam.questions || []).filter(q => q.type === 'TF');
    const saQuestions = (exam.questions || []).filter(q => q.type === 'SA');

    const handleCopy = () => {
      let text = `🔑 BẢNG ĐÁP ÁN ĐỀ THI: ${exam.title}\n`;
      text += `Khối lớp: ${exam.grade || exam.category} | Thời lượng: ${exam.duration} phút | Tổng số: ${exam.questions.length} câu\n`;
      if (exam.lessonName) text += `Bài học: ${exam.lessonName}\n`;
      if (exam.topic) text += `Chủ đề: ${exam.topic}\n`;
      text += `------------------------------------\n\n`;

      if (mcqQuestions.length > 0) {
        text += `📌 PHẦN 1: TRẮC NGHIỆM (${mcqQuestions.length} CÂU)\n`;
        text += mcqQuestions.map((q, i) => {
          const num = q.text.match(/^Câu\s+(\d+)/i)?.[1] || String(i + 1);
          return `Câu ${num}: ${q.correctAnswer || 'A'}`;
        }).join('  |  ') + '\n\n';
      }

      if (tfQuestions.length > 0) {
        text += `⚖️ PHẦN 2: ĐÚNG / SAI (${tfQuestions.length} Ý MỆNH ĐỀ)\n`;
        text += tfQuestions.map((q, i) => {
          const lead = q.text.includes(' - ') ? q.text.split(' - ')[1]?.trim() : `Ý ${i + 1}`;
          return `- ${lead}: ${q.correctAnswer || 'Đúng'}`;
        }).join('\n') + '\n\n';
      }

      if (saQuestions.length > 0) {
        text += `✍️ PHẦN 3: TRẢ LỜI NGẮN (${saQuestions.length} CÂU)\n`;
        text += saQuestions.map((q, i) => {
          const num = q.text.match(/^Câu\s+(\d+)/i)?.[1] || String(i + 1);
          return `Câu ${num}: ${q.correctAnswer || 'N/A'}`;
        }).join('\n') + '\n\n';
      }

      try {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // clipboard fallback
      }
    };

    const handlePrint = () => {
      window.print();
    };

    return (
      <div className="fixed inset-0 bg-black/80 z-[125] flex items-center justify-center p-3 sm:p-5 backdrop-blur-md animate-fade-in print:p-0 print:bg-white">
        <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-scale-up border-2 border-indigo-200 print:max-h-none print:shadow-none print:border-none print:rounded-none">
          {/* Header */}
          <div className="p-6 md:p-8 bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-amber-950 px-3 py-1 rounded-full shadow-xs">
                  🛡️ Quyền Admin Giáo Viên
                </span>
                <span className="text-[10px] font-bold bg-white/20 text-white px-3 py-1 rounded-full">
                  {exam.grade || exam.category}
                </span>
                <span className="text-[10px] font-bold bg-white/20 text-white px-3 py-1 rounded-full">
                  📝 {exam.questions.length} câu hỏi • ⏱️ {exam.duration} phút
                </span>
                <span className="text-[10px] font-mono text-indigo-200">
                  #{exam.id}
                </span>
              </div>
              <h3 className="text-xl md:text-2xl font-black tracking-tight leading-snug">
                🔑 Đáp Án & Hướng Dẫn Giải: {exam.title}
              </h3>
              {(exam.lessonName || exam.topic) && (
                <p className="text-xs text-indigo-200 font-medium mt-1">
                  {exam.lessonName ? `Bài học: ${exam.lessonName}` : ''} {exam.topic ? `• Chủ đề: ${exam.topic}` : ''}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 print:hidden shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-2.5 rounded-xl text-xs font-black bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Sao chép toàn bộ bảng ma trận đáp án"
              >
                <span>{copied ? '✅' : '📋'}</span>
                <span>{copied ? 'Đã sao chép!' : 'Sao chép đáp án'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-2.5 rounded-xl text-xs font-black bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="In đáp án hoặc lưu file PDF"
              >
                <span>🖨️</span>
                <span>In / Xuất PDF</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-xl transition cursor-pointer"
                title="Đóng modal"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Quick Matrix Summary Bar */}
          <div className="p-4 md:p-6 bg-indigo-50/70 border-b border-indigo-100 space-y-3 shrink-0 overflow-x-auto">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚡</span> BẢNG MA TRẬN ĐÁP ÁN NHANH (TIỆN CHẤM BÀI GIẤY & KIỂM TRA NHANH)
              </span>
              <span className="text-[11px] font-bold text-indigo-700">
                Tổng cộng {exam.questions.length} câu
              </span>
            </div>

            <div className="space-y-2">
              {/* MCQ Matrix */}
              {mcqQuestions.length > 0 && (
                <div className="bg-white p-3 rounded-2xl border border-indigo-200 shadow-xs flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-blue-900 bg-blue-100 px-2.5 py-1 rounded-lg shrink-0">
                    Phần 1 (TN):
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {mcqQuestions.map((q, i) => {
                      const qNum = q.text.match(/^Câu\s+(\d+)/i)?.[1] || String(i + 1);
                      return (
                        <span key={q.id || i} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5 text-xs">
                          <span className="font-semibold text-gray-500">{qNum}:</span>
                          <span className="font-black text-blue-800 font-mono">{q.correctAnswer || 'A'}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TF Matrix */}
              {tfQuestions.length > 0 && (
                <div className="bg-white p-3 rounded-2xl border border-indigo-200 shadow-xs flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-lg shrink-0">
                    Phần 2 (Đ/S):
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tfQuestions.map((q, i) => {
                      const isDung = q.correctAnswer?.toLowerCase().includes('đúng') || q.correctAnswer?.toLowerCase() === 'true';
                      const subLabel = q.text.includes(' - ') ? q.text.split(' - ')[1]?.trim().slice(0, 3) : `Ý ${i + 1}`;
                      return (
                        <span key={q.id || i} className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 text-xs">
                          <span className="font-semibold text-gray-600">{subLabel}:</span>
                          <span className={`font-black px-1.5 py-0.2 rounded text-xs ${isDung ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}`}>
                            {isDung ? 'Đ' : 'S'}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SA Matrix */}
              {saQuestions.length > 0 && (
                <div className="bg-white p-3 rounded-2xl border border-indigo-200 shadow-xs flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-purple-900 bg-purple-100 px-2.5 py-1 rounded-lg shrink-0">
                    Phần 3 (TLN):
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {saQuestions.map((q, i) => {
                      const qNum = q.text.match(/^Câu\s+(\d+)/i)?.[1] || String(i + 1);
                      return (
                        <span key={q.id || i} className="inline-flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-lg px-2 py-0.5 text-xs">
                          <span className="font-semibold text-gray-500">{qNum}:</span>
                          <span className="font-black text-purple-900 font-mono">{q.correctAnswer || 'N/A'}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tab Filter Bar */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-2 shrink-0 print:hidden">
            <button
              type="button"
              onClick={() => setTab('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                tab === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              Tất cả câu hỏi ({exam.questions.length})
            </button>
            {mcqQuestions.length > 0 && (
              <button
                type="button"
                onClick={() => setTab('MCQ')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                  tab === 'MCQ'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-blue-50 border border-gray-200'
                }`}
              >
                Phần 1: Trắc nghiệm ({mcqQuestions.length})
              </button>
            )}
            {tfQuestions.length > 0 && (
              <button
                type="button"
                onClick={() => setTab('TF')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                  tab === 'TF'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-emerald-50 border border-gray-200'
                }`}
              >
                Phần 2: Đúng/Sai ({tfQuestions.length})
              </button>
            )}
            {saQuestions.length > 0 && (
              <button
                type="button"
                onClick={() => setTab('SA')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                  tab === 'SA'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-purple-50 border border-gray-200'
                }`}
              >
                Phần 3: Trả lời ngắn ({saQuestions.length})
              </button>
            )}
          </div>

          {/* Detailed Question List */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
            {/* If tab is ALL or MCQ */}
            {(tab === 'ALL' || tab === 'MCQ') && mcqQuestions.length > 0 && (
              <div className="space-y-4">
                <div className="bg-blue-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                    <span>📌</span>
                    <span>PHẦN 1: CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (1 ĐÁP ÁN ĐÚNG)</span>
                  </div>
                  <span className="text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-bold">
                    {mcqQuestions.length} câu
                  </span>
                </div>

                <div className="space-y-4">
                  {mcqQuestions.map((q, idx) => {
                    const qNumberMatch = q.text.match(/^Câu\s+(\d+)[\.\:]?\s*/i);
                    const displayNum = qNumberMatch ? qNumberMatch[1] : String(idx + 1);
                    const cleanQuestionText = formatDisplayQuestionText(q.text, { stripLeadingCau: true });

                    return (
                      <div key={q.id || idx} className="bg-white p-6 rounded-3xl border-2 border-gray-200 hover:border-blue-300 transition space-y-4 shadow-xs">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            <span className="bg-blue-600 text-white px-3 py-1 rounded-xl text-xs font-black shrink-0 mt-0.5">
                              Câu {displayNum}
                            </span>
                            <p className="font-black text-gray-900 text-base leading-relaxed">
                              {cleanQuestionText || q.text}
                            </p>
                          </div>
                          <span className="text-xs font-black bg-emerald-100 text-emerald-900 px-3 py-1 rounded-full border border-emerald-300 shrink-0">
                            Đáp án: {q.correctAnswer}
                          </span>
                        </div>

                        {q.image && (
                          <div className="text-center py-2">
                            <img src={q.image} className="max-h-60 rounded-2xl mx-auto border shadow-sm object-contain" alt="Hình minh họa" />
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {q.options.map((opt, oIdx) => {
                            const optKey = ['A', 'B', 'C', 'D'][oIdx];
                            const isCorrect = isOptionCorrect(q, opt, oIdx);
                            const cleanOptText = typeof opt === 'string' ? opt.replace(/^[A-D][\.\:\)]\s*/, '').trim() : String(opt);

                            return (
                              <div
                                key={oIdx}
                                className={`p-4 rounded-2xl border-2 text-left text-sm transition-all flex items-start gap-3 ${
                                  isCorrect
                                    ? 'border-emerald-500 bg-emerald-50/90 text-emerald-950 font-bold shadow-sm ring-2 ring-emerald-200'
                                    : 'border-gray-200 bg-white text-gray-700'
                                }`}
                              >
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                                  isCorrect ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {optKey}
                                </span>
                                <span className="pt-0.5 flex-1 leading-snug">{cleanOptText}</span>
                                {isCorrect && (
                                  <span className="text-[11px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-lg shrink-0">
                                    ✓ ĐÁP ÁN ĐÚNG
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {q.explanation && (
                          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-bold text-amber-950 flex items-start gap-2">
                            <span className="text-base shrink-0">💡</span>
                            <div>
                              <span className="font-black text-amber-900">Hướng dẫn giải: </span>
                              <span>{q.explanation}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* If tab is ALL or TF */}
            {(tab === 'ALL' || tab === 'TF') && tfQuestions.length > 0 && (
              <div className="space-y-4">
                <div className="bg-emerald-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                    <span>⚖️</span>
                    <span>PHẦN 2: CÂU HỎI ĐÚNG / SAI</span>
                  </div>
                  <span className="text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-bold">
                    {tfQuestions.length} ý
                  </span>
                </div>

                <div className="space-y-4">
                  {(() => {
                    const groups: { baseTitle: string; items: Question[] }[] = [];
                    let curGroup: { baseTitle: string; items: Question[] } | null = null;

                    tfQuestions.forEach((q) => {
                      if (!q || !q.text) return;
                      const rawLead = q.text.includes(' - ') ? q.text.split(' - ')[0].trim() : q.text.replace(/^[a-d]\)[\s\S]*/i, '').trim();
                      const lead = formatDisplayQuestionText(rawLead, { stripLeadingCau: false });
                      if (!curGroup || curGroup.baseTitle !== lead) {
                        curGroup = { baseTitle: lead, items: [q] };
                        groups.push(curGroup);
                      } else {
                        curGroup.items.push(q);
                      }
                    });

                    return groups.map((grp, gIdx) => (
                      <div key={gIdx} className="bg-white p-6 rounded-3xl border-2 border-emerald-200 space-y-4 shadow-xs">
                        <div className="border-b border-gray-100 pb-3">
                          <p className="font-black text-gray-900 text-base leading-relaxed">
                            {grp.baseTitle}
                          </p>
                        </div>

                        {grp.items[0]?.image && (
                          <div className="text-center py-2">
                            <img src={grp.items[0].image} className="max-h-60 rounded-2xl mx-auto border shadow-sm object-contain" alt="Minh họa" />
                          </div>
                        )}

                        {/* Giao diện máy tính: Bảng */}
                        <div className="hidden sm:block overflow-x-auto rounded-2xl border border-gray-200">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-gray-50 text-gray-700 text-xs font-black uppercase tracking-wider border-b border-gray-200">
                                <th className="py-3.5 px-4">Ý mệnh đề phát biểu</th>
                                <th className="py-3.5 px-4 text-center w-36">Đáp án chuẩn</th>
                                <th className="py-3.5 px-4 text-left">Ghi chú / Lời giải</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                              {grp.items.map((item, itemIdx) => {
                                const rawSub = item.text.includes(' - ') 
                                  ? item.text.split(' - ').slice(1).join(' - ').trim()
                                  : item.text;
                                const subStatement = formatDisplayQuestionText(rawSub, { stripLeadingCau: false });
                                const isDung = item.correctAnswer?.toLowerCase().includes('đúng') || item.correctAnswer?.toLowerCase() === 'true';

                                return (
                                  <tr key={item.id || itemIdx} className="hover:bg-gray-50/50">
                                    <td className="py-4 px-4 font-bold text-gray-900 leading-snug">
                                      {subStatement}
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                      <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-xs ${
                                        isDung 
                                          ? 'bg-emerald-600 text-white' 
                                          : 'bg-rose-600 text-white'
                                      }`}>
                                        <span>{isDung ? '✓ ĐÚNG' : '✗ SAI'}</span>
                                      </span>
                                    </td>
                                    <td className="py-4 px-4 text-xs font-medium text-gray-600">
                                      {item.explanation || (isDung ? 'Nhận định chính xác theo SGK Sinh Học GDPT 2018.' : 'Nhận định sai so với kiến thức chuẩn.')}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Giao diện điện thoại: Hiển thị tối ưu theo chiều ngang, đáp án chuẩn dời xuống dòng */}
                        <div className="block sm:hidden divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white overflow-hidden">
                          {grp.items.map((item, itemIdx) => {
                            const rawSub = item.text.includes(' - ') 
                              ? item.text.split(' - ').slice(1).join(' - ').trim()
                              : item.text;
                            const subStatement = formatDisplayQuestionText(rawSub, { stripLeadingCau: false });
                            const isDung = item.correctAnswer?.toLowerCase().includes('đúng') || item.correctAnswer?.toLowerCase() === 'true';

                            return (
                              <div key={item.id || itemIdx} className="p-4 space-y-2.5 hover:bg-gray-50/50 transition-colors">
                                <p className="font-bold text-gray-900 text-sm leading-relaxed">
                                  {subStatement}
                                </p>
                                <div className="flex items-center justify-between gap-2 pt-1">
                                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl font-black text-xs uppercase tracking-wider shadow-xs ${
                                    isDung 
                                      ? 'bg-emerald-600 text-white' 
                                      : 'bg-rose-600 text-white'
                                  }`}>
                                    <span>{isDung ? '✓ ĐÚNG' : '✗ SAI'}</span>
                                  </span>
                                  <span className="text-[11px] font-medium text-gray-500 italic">
                                    Đáp án chuẩn
                                  </span>
                                </div>
                                {item.explanation && (
                                  <p className="text-xs font-medium text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100 leading-relaxed">
                                    💡 {item.explanation}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* If tab is ALL or SA */}
            {(tab === 'ALL' || tab === 'SA') && saQuestions.length > 0 && (
              <div className="space-y-4">
                <div className="bg-purple-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                    <span>✍️</span>
                    <span>PHẦN 3: CÂU HỎI TRẢ LỜI NGẮN</span>
                  </div>
                  <span className="text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-bold">
                    {saQuestions.length} câu
                  </span>
                </div>

                <div className="space-y-4">
                  {saQuestions.map((q, idx) => {
                    const qNumberMatch = q.text.match(/^Câu\s+(\d+)[\.\:]?\s*/i);
                    const displayNum = qNumberMatch ? qNumberMatch[1] : String(idx + 1);
                    const cleanQuestionText = formatDisplayQuestionText(q.text, { stripLeadingCau: true });

                    return (
                      <div key={q.id || idx} className="bg-white p-6 rounded-3xl border-2 border-purple-200 hover:border-purple-400 transition space-y-4 shadow-xs">
                        <div className="flex items-start gap-3">
                          <span className="bg-purple-600 text-white px-3 py-1 rounded-xl text-xs font-black shrink-0 mt-0.5">
                            Câu {displayNum}
                          </span>
                          <p className="font-black text-gray-900 text-base leading-relaxed flex-1">
                            {cleanQuestionText || q.text}
                          </p>
                        </div>

                        {q.image && (
                          <div className="text-center py-2">
                            <img src={q.image} className="max-h-60 rounded-2xl mx-auto border shadow-sm object-contain" alt="Minh họa" />
                          </div>
                        )}

                        <div className="p-4 bg-purple-50 border-2 border-purple-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                          <span className="text-xs font-black text-purple-900 uppercase tracking-wider">
                            🎯 ĐÁP ÁN CHUẨN CỦA ĐỀ:
                          </span>
                          <span className="text-lg font-black text-purple-950 font-mono bg-white px-4 py-1.5 rounded-xl border border-purple-200 shadow-xs">
                            {q.correctAnswer}
                          </span>
                        </div>

                        {q.explanation && (
                          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-bold text-amber-950 flex items-start gap-2">
                            <span className="text-base shrink-0">💡</span>
                            <div>
                              <span className="font-black text-amber-900">Phương pháp giải: </span>
                              <span>{q.explanation}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 md:p-6 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0 print:hidden">
            <div className="text-xs text-gray-500 font-medium">
              Bài thi: <strong className="text-gray-800">{exam.title}</strong> • Chuẩn GDPT 2018
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs font-black text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 transition cursor-pointer"
              >
                Đóng
              </button>
              {onStartExam && (
                <button
                  type="button"
                  onClick={() => onStartExam(exam)}
                  className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs font-black text-white bg-bio-700 hover:bg-bio-800 shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🚀</span>
                  <span>Vào Làm Thử Đề Này</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Question Editor Card Component
  const QuestionEditorCard: React.FC<{ q: Question; index: number }> = ({ q, index }) => {
    const isMCQ = q.type === 'MCQ';
    const isTF = q.type === 'TF';

    return (
      <div className={`bg-white p-6 rounded-3xl border-2 transition space-y-4 group relative shadow-sm ${
        isMCQ ? 'border-blue-100 hover:border-blue-300' : isTF ? 'border-emerald-100 hover:border-emerald-300' : 'border-purple-100 hover:border-purple-300'
      }`}>
        <div className="flex justify-between items-start">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-white w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${
              isMCQ ? 'bg-blue-600' : isTF ? 'bg-emerald-600' : 'bg-purple-600'
            }`}>
              {index + 1}
            </span>
            <span className={`font-black text-xs uppercase tracking-wider px-3.5 py-1 rounded-full ${
              isMCQ ? 'bg-blue-50 text-blue-700 border border-blue-200' : isTF ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-purple-50 text-purple-700 border border-purple-200'
            }`}>
              {isMCQ ? 'Phần 1: Trắc nghiệm khách quan (chọn 1 đáp án)' : isTF ? 'Phần 2: Câu hỏi Đúng/Sai' : 'Phần 3: Trả lời ngắn'}
            </span>
          </div>
          <button onClick={() => handleDeleteQuestion(q.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="Xóa câu hỏi">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>

        {isTF && (
          <p className="text-[11px] text-emerald-700 bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100 font-medium">
            💡 <b>Quy cách mẫu chuẩn Phần 2:</b> Cú pháp đề xuất: <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-900 font-bold">Câu X. [Câu dẫn chung bám sát YCCĐ]. Nhận định nào ĐÚNG/SAI. - [a|b|c|d]) [Mệnh đề]</code>
          </p>
        )}

        <textarea 
          value={q.text} 
          onChange={(e) => handleUpdateQuestion(q.id, { text: e.target.value })}
          placeholder="Nội dung câu hỏi..."
          className="w-full bg-gray-50 border border-gray-200 focus:border-bio-500 focus:bg-white rounded-2xl p-4 font-bold text-gray-800 outline-none leading-relaxed text-sm"
          rows={2}
        />

        {q.image && (
          <div className="relative inline-block border rounded-xl overflow-hidden shadow-sm">
             <img src={q.image} className="h-40 object-contain bg-white" alt="Ảnh câu hỏi" />
             <button onClick={() => handleUpdateQuestion(q.id, { image: undefined })} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg">&times;</button>
          </div>
        )}

        {isMCQ && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {q.options.map((opt, i) => (
              <div key={i} className="flex gap-2 items-center">
                 <button 
                  type="button"
                  onClick={() => handleUpdateQuestion(q.id, { correctAnswer: ['A','B','C','D'][i] })}
                  className={`w-10 h-10 rounded-xl font-bold border-2 transition-all flex-shrink-0 cursor-pointer ${q.correctAnswer === ['A','B','C','D'][i] ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-400 hover:border-blue-300'}`}>
                    {['A','B','C','D'][i]}
                 </button>
                 <input 
                  type="text" 
                  value={opt} 
                  onChange={(e) => {
                    const newOpts = [...q.options];
                    newOpts[i] = e.target.value;
                    handleUpdateQuestion(q.id, { options: newOpts });
                  }}
                  className="flex-1 bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2 text-sm text-gray-800 outline-none"
                  placeholder={`Lựa chọn ${['A','B','C','D'][i]}...`}
                 />
              </div>
            ))}
          </div>
        )}

        {isTF && (
          <div className="flex gap-4">
             {['Đúng', 'Sai'].map(opt => (
                <button 
                  key={opt}
                  type="button"
                  onClick={() => handleUpdateQuestion(q.id, { correctAnswer: opt })}
                  className={`flex-1 py-3 rounded-2xl border-2 font-black transition-all cursor-pointer ${q.correctAnswer === opt ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300'}`}>
                  {opt}
                </button>
             ))}
          </div>
        )}

        {q.type === 'SA' && (
          <div className="flex gap-3 items-center bg-purple-50/50 p-4 rounded-xl border border-purple-100">
             <span className="text-xs font-black text-purple-700 whitespace-nowrap uppercase tracking-widest">ĐÁP ÁN ĐÚNG:</span>
             <input 
              type="text" 
              value={q.correctAnswer} 
              onChange={(e) => handleUpdateQuestion(q.id, { correctAnswer: e.target.value })}
              className="flex-1 bg-white border-2 border-purple-200 focus:ring-2 focus:ring-purple-500 rounded-xl px-4 py-2 text-sm font-bold outline-none"
              placeholder="Nhập giá trị số hoặc từ khóa (ví dụ: 15)..."
             />
          </div>
        )}
      </div>
    );
  };

  // Logic hiển thị câu hỏi cho học sinh theo đúng cấu trúc 2 Phần chuẩn:
  // - Phần 1. Câu Hỏi Trắc Nghiệm Khách Quan. Các em chọn 1 phương án đúng.
  // - Phần 2. Câu Hỏi Đúng/Sai. Ở mỗi ý các em sẽ trả lời “Đúng” hoặc “Sai”
  const renderQuestions = () => {
    if (!activeExam) return null;

    const mcqQuestions = activeExam.questions.filter(q => q.type === 'MCQ');
    const tfQuestions = activeExam.questions.filter(q => q.type === 'TF');
    const saQuestions = activeExam.questions.filter(q => q.type === 'SA');

    return (
      <div className="space-y-6">
        {/* ===================== PHẦN 1 ===================== */}
        {mcqQuestions.length > 0 && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-bio-900 to-bio-800 text-white p-5 rounded-3xl shadow-md border-b-4 border-bio-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2">
                  <span>📌</span> Phần 1. Câu Hỏi Trắc Nghiệm Khách Quan. Các em chọn 1 phương án đúng.
                </h3>
                <p className="text-xs text-bio-200 font-medium mt-0.5">
                  Gồm {mcqQuestions.length} câu hỏi. Chọn duy nhất 1 đáp án A, B, C hoặc D cho mỗi câu.
                </p>
              </div>
              <span className="self-start sm:self-center bg-white/20 text-white text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                {mcqQuestions.length} Câu
              </span>
            </div>

            <div className="space-y-4">
              {mcqQuestions.map((q, idx) => {
                const qNumberMatch = q.text.match(/^Câu\s+(\d+)[\.\:]?\s*/i);
                const displayNum = qNumberMatch ? qNumberMatch[1] : String(idx + 1);
                const cleanQuestionText = formatDisplayQuestionText(q.text, { stripLeadingCau: true });

                return (
                  <div key={q.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200/80 hover:border-bio-300 transition space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="bg-bio-600 text-white px-3 py-1 rounded-xl text-xs font-black shrink-0 mt-0.5">
                        Câu {displayNum}
                      </span>
                      <p className="font-bold text-gray-900 text-sm md:text-base leading-relaxed flex-1">
                        {cleanQuestionText || q.text}
                      </p>
                    </div>

                    {q.image && (
                      <div className="text-center py-2">
                        <img src={q.image} className="max-h-60 rounded-2xl mx-auto border shadow-sm object-contain" alt="Minh họa" />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {q.options.map((opt, oIdx) => {
                        const optKey = ['A', 'B', 'C', 'D'][oIdx];
                        const isSelected = answers[q.id] === optKey;
                        const cleanOptText = typeof opt === 'string' ? opt.replace(/^[A-D][\.\:\)]\s*/, '').trim() : String(opt);

                        return (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => handleAnswer(q.id, optKey)}
                            className={`p-4 rounded-2xl border-2 text-left font-medium text-sm transition-all flex items-start gap-3 cursor-pointer ${
                              isSelected
                                ? 'border-bio-600 bg-bio-50/80 text-bio-950 font-bold shadow-md ring-2 ring-bio-200'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-bio-300 hover:bg-gray-50/50'
                            }`}
                          >
                            <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
                              isSelected ? 'bg-bio-600 text-white shadow' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {optKey}
                            </span>
                            <span className="pt-0.5 leading-snug">{cleanOptText}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================== PHẦN 2 ===================== */}
        {tfQuestions.length > 0 && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-emerald-800 to-teal-800 text-white p-5 rounded-3xl shadow-md border-b-4 border-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2">
                  <span>⚖️</span> Phần 2. Câu Hỏi Đúng/Sai. Ở mỗi ý các em sẽ trả lời “Đúng” hoặc “Sai”
                </h3>
                <p className="text-xs text-emerald-200 font-medium mt-0.5">
                  Đọc kĩ thông tin dẫn và xác định tính Đúng hoặc Sai cho từng ý mệnh đề a), b), c), d).
                </p>
              </div>
              <span className="self-start sm:self-center bg-white/20 text-white text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                {tfQuestions.length} Ý Lệnh Hỏi
              </span>
            </div>

            {/* Gom nhóm các ý Đúng/Sai theo Câu dẫn chung */}
            {(() => {
              const groups: { baseTitle: string; items: Question[] }[] = [];
              let curGroup: { baseTitle: string; items: Question[] } | null = null;

              (tfQuestions || []).forEach((q) => {
                if (!q || !q.text) return;
                const rawLead = q.text.includes(' - ') ? q.text.split(' - ')[0].trim() : q.text.replace(/^[a-d]\)[\s\S]*/i, '').trim();
                const lead = formatDisplayQuestionText(rawLead, { stripLeadingCau: false });
                if (!curGroup || curGroup.baseTitle !== lead) {
                  curGroup = { baseTitle: lead, items: [q] };
                  groups.push(curGroup);
                } else {
                  curGroup.items.push(q);
                }
              });

              return (
                <div className="space-y-5">
                  {groups.map((grp, gIdx) => {
                    return (
                      <div key={gIdx} className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-gray-200/80 hover:border-emerald-300 transition space-y-4 sm:space-y-5">
                        <div className="border-b border-gray-100 pb-3">
                          <p className="font-black text-gray-900 text-sm md:text-base leading-relaxed">
                            {grp.baseTitle}
                          </p>
                        </div>

                        {grp.items[0]?.image && (
                          <div className="text-center py-2">
                            <img src={grp.items[0].image} className="max-h-60 rounded-2xl mx-auto border shadow-sm object-contain" alt="Minh họa" />
                          </div>
                        )}

                        {/* Giao diện máy tính: Bảng đối chiếu Đúng / Sai truyền thống */}
                        <div className="hidden sm:block overflow-x-auto rounded-2xl border border-gray-100">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-gray-50/80 text-gray-600 text-xs font-black uppercase tracking-wider border-b border-gray-200">
                                <th className="py-4 px-5">Ý mệnh đề phát biểu</th>
                                <th className="py-4 px-3 text-center w-28">Đúng</th>
                                <th className="py-4 px-3 text-center w-28">Sai</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                              {grp.items.map((item, itemIdx) => {
                                const rawSub = item.text.includes(' - ') 
                                  ? item.text.split(' - ').slice(1).join(' - ').trim()
                                  : item.text;
                                const subStatement = formatDisplayQuestionText(rawSub, { stripLeadingCau: false });
                                const isDung = answers[item.id] === 'Đúng';
                                const isSai = answers[item.id] === 'Sai';

                                return (
                                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 px-5 font-medium text-gray-800 leading-snug">
                                      {subStatement}
                                    </td>
                                    <td className="py-4 px-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleAnswer(item.id, 'Đúng')}
                                        className={`px-4 py-2 rounded-xl font-black text-xs transition-all cursor-pointer ${
                                          isDung
                                            ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-200'
                                            : 'bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700'
                                        }`}
                                      >
                                        Đúng
                                      </button>
                                    </td>
                                    <td className="py-4 px-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleAnswer(item.id, 'Sai')}
                                        className={`px-4 py-2 rounded-xl font-black text-xs transition-all cursor-pointer ${
                                          isSai
                                            ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-200'
                                            : 'bg-gray-100 text-gray-600 hover:bg-rose-50 hover:text-rose-700'
                                        }`}
                                      >
                                        Sai
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Giao diện điện thoại: Tối ưu hiển thị câu hỏi theo chiều ngang, lựa chọn Đúng hoặc Sai dời xuống dòng */}
                        <div className="block sm:hidden divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white overflow-hidden">
                          {grp.items.map((item) => {
                            const rawSub = item.text.includes(' - ') 
                              ? item.text.split(' - ').slice(1).join(' - ').trim()
                              : item.text;
                            const subStatement = formatDisplayQuestionText(rawSub, { stripLeadingCau: false });
                            const isDung = answers[item.id] === 'Đúng';
                            const isSai = answers[item.id] === 'Sai';

                            return (
                              <div key={item.id} className="p-4 space-y-3 hover:bg-gray-50/40 transition-colors">
                                {/* Câu hỏi hiển thị tràn theo chiều ngang */}
                                <p className="font-semibold text-gray-800 text-sm leading-relaxed">
                                  {subStatement}
                                </p>
                                
                                {/* Lựa chọn Đúng hoặc Sai dời xuống dòng */}
                                <div className="grid grid-cols-2 gap-2.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleAnswer(item.id, 'Đúng')}
                                    className={`w-full py-2.5 px-3 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-2xs ${
                                      isDung
                                        ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-200'
                                        : 'bg-gray-100 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
                                    }`}
                                  >
                                    <span>{isDung ? '✓' : ''}</span>
                                    <span>Đúng</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAnswer(item.id, 'Sai')}
                                    className={`w-full py-2.5 px-3 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-2xs ${
                                      isSai
                                        ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-200'
                                        : 'bg-gray-100 text-gray-700 hover:bg-rose-50 hover:text-rose-700'
                                    }`}
                                  >
                                    <span>{isSai ? '✓' : ''}</span>
                                    <span>Sai</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ===================== PHẦN 3: CÂU HỎI TRẢ LỜI NGẮN (ĐẶC TRƯNG KHỐI LỚP 12) ===================== */}
        {saQuestions.length > 0 && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-5 rounded-3xl shadow-md border-b-4 border-purple-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2">
                  <span>✍️</span> Phần 3. Câu Hỏi Trả Lời Ngắn.
                </h3>
                <p className="text-xs text-purple-200 font-medium mt-0.5">
                  Các em ghi đáp án (chữ số hoặc từ/cụm từ ngắn gọn) vào ô trống bên dưới mỗi câu hỏi.
                </p>
              </div>
              <span className="self-start sm:self-center bg-white/20 text-white text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                {saQuestions.length} Câu
              </span>
            </div>

            <div className="space-y-4">
              {saQuestions.map((q, idx) => {
                const qNumberMatch = q.text.match(/^Câu\s+(\d+)[\.\:]?\s*/i);
                const displayNum = qNumberMatch ? qNumberMatch[1] : String(idx + 1);
                const cleanQuestionText = formatDisplayQuestionText(q.text, { stripLeadingCau: true });

                return (
                  <div key={q.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200/80 hover:border-purple-300 transition space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="bg-purple-600 text-white px-3 py-1 rounded-xl text-xs font-black shrink-0 mt-0.5">
                        Câu {displayNum}
                      </span>
                      <p className="font-bold text-gray-900 text-sm md:text-base leading-relaxed flex-1">
                        {cleanQuestionText || q.text}
                      </p>
                    </div>

                    {q.image && (
                      <div className="text-center py-2">
                        <img src={q.image} className="max-h-60 rounded-2xl mx-auto border shadow-sm object-contain" alt="Minh họa" />
                      </div>
                    )}

                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3 bg-purple-50/60 p-4 rounded-2xl border border-purple-100">
                      <span className="text-xs md:text-sm font-black text-purple-900 whitespace-nowrap">
                        Đáp án điền vào:
                      </span>
                      <input
                        type="text"
                        value={answers[q.id] || ''}
                        onChange={e => handleAnswer(q.id, e.target.value)}
                        placeholder="Điền đáp án (ví dụ: 61)..."
                        className="flex-1 bg-white border-2 border-purple-200 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 outline-none shadow-sm transition"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // VIEW: EDITING/CREATING
  if (isEditing) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 animate-fade-in bg-white min-h-screen rounded-[2.5rem] shadow-2xl border-4 border-gray-50">
        {/* Header Editor */}
        <div className="space-y-6 border-b border-gray-100 pb-8">
          <div className="flex justify-between items-center">
            <button 
              onClick={() => setIsEditing(false)} 
              className="text-gray-400 hover:text-bio-600 text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span className="text-xl">&larr;</span> QUAY LẠI DANH SÁCH
            </button>
            <div className="flex items-center gap-3">
              {editingExam.id && (isAdmin || isMyExam(editingExam as Exam)) && (
                <button
                  type="button"
                  onClick={() => {
                    const found = exams.find(e => e.id === editingExam.id) || (editingExam as Exam);
                    handleDeleteExam(found);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white font-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                  title="Xóa vĩnh viễn bài kiểm tra này"
                >
                  <span>🗑️</span>
                  <span>XÓA ĐỀ NÀY</span>
                </button>
              )}
              <span className="text-xs font-black text-bio-700 bg-bio-50 px-3 py-1 rounded-full uppercase tracking-wider">
                {editingExam.id ? 'CHỈNH SỬA ĐỀ THI' : 'SOẠN ĐỀ THI MỚI'}
              </span>
            </div>
          </div>

          {/* Form Options: Khối Lớp, Chủ Đề, Tên Bài Học, Yêu Cầu Cần Đạt */}
          <div className="bg-gray-50/70 p-6 rounded-3xl border border-gray-200/60 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-black text-bio-900 uppercase tracking-widest flex items-center gap-2">
                <span>🧬</span> Thiết Lập Học Liệu SGK Kết Nối Tri Thức Với Cuộc Sống
              </h4>
              <span className="text-[10px] font-bold bg-bio-100 text-bio-800 px-2 py-0.5 rounded-full border border-bio-200">
                GDPT 2018
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Khối lớp */}
              <div>
                <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">
                  Khối Lớp
                </label>
                <div className="flex gap-1.5 bg-white p-1 rounded-2xl border border-gray-200 shadow-sm">
                  {(['Lớp 10', 'Lớp 11', 'Lớp 12'] as const).map(g => {
                    const isSelected = editingExam.grade === g || (!editingExam.grade && (
                      (editingExam.category === 'Sinh 10' && g === 'Lớp 10') ||
                      (editingExam.category === 'Sinh 11' && g === 'Lớp 11') ||
                      (editingExam.category === 'Sinh 12' && g === 'Lớp 12')
                    ));
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          const cat = g === 'Lớp 10' ? 'Sinh 10' : (g === 'Lớp 11' ? 'Sinh 11' : 'Sinh 12');
                          const top = BIO_TOPICS[g]?.[0] || '';
                          setEditingExam(prev => {
                            const newId = generateNextExamId(g, exams, prev.lessonName || prev.title || top);
                            return { ...prev, grade: g, category: cat, topic: top, id: newId };
                          });
                        }}
                        className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                          isSelected ? 'bg-bio-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chủ đề */}
              <div>
                <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">
                  Chủ Đề
                </label>
                <select
                  value={editingExam.topic || ''}
                  onChange={e => setEditingExam(prev => ({ ...prev, topic: e.target.value }))}
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 font-bold text-xs text-gray-700 outline-none focus:border-bio-500 shadow-sm cursor-pointer"
                >
                  <option value="">-- Chọn chủ đề --</option>
                  {(BIO_TOPICS[editingExam.grade || 'Lớp 12'] || []).map((t, idx) => (
                    <option key={idx} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Thời gian */}
              <div>
                <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">
                  Thời Gian (Phút)
                </label>
                <input
                  type="number"
                  value={editingExam.duration || 15}
                  onChange={e => setEditingExam(prev => ({ ...prev, duration: parseInt(e.target.value) || 15 }))}
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-2.5 font-bold text-sm text-bio-700 outline-none focus:border-bio-500 shadow-sm"
                />
              </div>
            </div>

            {/* Mã đề thi chuẩn theo khối (Ví dụ: SH12_001, SH11_001, SH10_001) */}
            <div className="bg-bio-50/70 p-4 rounded-2xl border border-bio-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🏷️</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-bio-950 uppercase tracking-wider">
                      Mã Đề Thi (ID chuẩn theo khối)
                    </span>
                    <span className="text-[10px] font-bold bg-bio-600 text-white px-2 py-0.5 rounded-md uppercase">
                      Ngắn gọn
                    </span>
                  </div>
                  <p className="text-[11px] text-bio-800 font-medium mt-0.5">
                    Hệ thống tự động đánh số theo khối: <b>SH12_001</b> (Lớp 12), <b>SH11_001</b> (Lớp 11), <b>SH10_001</b> (Lớp 10)...
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editingExam.id || ''}
                  onChange={e => setEditingExam(prev => ({ ...prev, id: e.target.value.trim().toUpperCase() }))}
                  placeholder="VD: SH12_001"
                  className="w-36 bg-white border-2 border-bio-300 focus:border-bio-600 rounded-xl px-3 py-1.5 font-mono font-black text-sm text-bio-900 outline-none text-center uppercase shadow-xs tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => {
                    const curGrade = editingExam.grade || 'Lớp 12';
                    const newId = generateNextExamId(curGrade, exams, editingExam.lessonName || editingExam.title);
                    setEditingExam(prev => ({ ...prev, id: newId }));
                  }}
                  className="px-3 py-1.5 bg-white text-bio-700 hover:bg-bio-600 hover:text-white border border-bio-300 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs whitespace-nowrap"
                  title="Tự động sinh mã tiếp theo theo khối"
                >
                  Đổi mã 🎲
                </button>
              </div>
            </div>

            {/* Tên bài học & Tiêu đề đề thi */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-black text-gray-600 uppercase tracking-wider">
                    Tên Bài Học
                  </label>
                  <span className="text-[10px] text-bio-600 font-bold">Chọn nhanh từ chuẩn SGK:</span>
                </div>
                <div className="space-y-2">
                  <select
                    value={editingExam.lessonName || ''}
                    onChange={e => {
                      const val = e.target.value;
                      const gradeKey = (editingExam.grade as 'Lớp 10' | 'Lớp 11' | 'Lớp 12') || 'Lớp 10';
                      const found = (SAMPLE_BIO_CURRICULUM[gradeKey] || []).find(s => s.lesson === val);
                      setEditingExam(prev => ({
                        ...prev,
                        lessonName: val,
                        title: prev.title ? prev.title : val,
                        learningObjectives: found ? found.yccd : prev.learningObjectives
                      }));
                    }}
                    className="w-full bg-bio-50/50 border border-bio-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-bio-500 cursor-pointer"
                  >
                    <option value="">-- Bấm chọn bài học SGK ({editingExam.grade || 'Lớp 10'}) --</option>
                    {(SAMPLE_BIO_CURRICULUM[(editingExam.grade as 'Lớp 10' | 'Lớp 11' | 'Lớp 12') || 'Lớp 10'] || []).map((item, idx) => (
                      <option key={idx} value={item.lesson}>
                        {item.lesson}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={editingExam.lessonName || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setEditingExam(prev => ({
                        ...prev,
                        lessonName: val,
                        title: prev.title ? prev.title : val
                      }));
                    }}
                    placeholder="Hoặc chỉnh sửa tiêu đề bài học tại đây..."
                    className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-2.5 font-bold text-xs text-gray-800 outline-none focus:border-bio-500 shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-1.5">
                  Tiêu Đề Đề Thi
                </label>
                <input
                  type="text"
                  value={editingExam.title || ''}
                  onChange={e => setEditingExam(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Nhập tiêu đề hiển thị của đề thi..."
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 font-bold text-xs text-gray-800 outline-none focus:border-bio-500 shadow-sm"
                />
              </div>
            </div>

            {/* Yêu cầu cần đạt */}
            <div>
              <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-1.5">
                Yêu Cầu Cần Đạt (Nhập văn bản theo chuẩn GDPT 2018)
              </label>
              <textarea
                value={editingExam.learningObjectives || ''}
                onChange={e => setEditingExam(prev => ({ ...prev, learningObjectives: e.target.value }))}
                rows={3}
                placeholder="Nhập các yêu cầu cần đạt (YCCĐ) để AI bám sát thiết kế câu hỏi chính xác..."
                className="w-full bg-white border border-gray-200 rounded-2xl p-4 font-medium text-xs text-gray-700 outline-none focus:border-bio-500 focus:ring-1 focus:ring-bio-500 leading-relaxed shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* AI Control Center - Nút tải PDF và Soạn AI */}
        <div className="bg-gradient-to-br from-bio-50 to-white p-8 rounded-[3rem] border-2 border-bio-100 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden shadow-lg">
          <div className="relative z-10 space-y-3">
            <h3 className="text-2xl font-black text-bio-900 leading-tight">Số hóa học liệu Sinh học KNTT 🤖</h3>
            <p className="text-sm text-bio-700 font-medium max-w-md">
              AI bám sát đúng <b>SGK Kết nối tri thức với cuộc sống</b> theo <b>Khối Lớp, Chủ Đề, Tên Bài Học và Yêu Cầu Cần Đạt</b> để tạo ngân hàng câu hỏi chuẩn GDPT 2018.
            </p>
          </div>
          <div className="flex gap-4 relative z-10 w-full md:w-auto">
            <button 
              disabled={isProcessingAI}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 md:flex-none bg-white text-bio-700 border-2 border-bio-200 px-8 py-5 rounded-3xl font-black text-xs shadow-sm hover:shadow-xl hover:border-bio-400 transition-all flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
            >
              <span className="text-xl">📄</span> {isProcessingAI ? 'ĐANG PHÂN TÍCH...' : 'TẢI FILE (GẠCH CHÂN)'}
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handleUploadFile} />
            
            <button 
              disabled={isProcessingAI}
              onClick={handleAIGenerate}
              className="flex-1 md:flex-none bg-bio-600 text-white px-10 py-5 rounded-3xl font-black text-xs shadow-xl hover:bg-bio-700 hover:shadow-bio-500/30 transform transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
            >
              <span className="text-xl">🪄</span> {isProcessingAI ? 'ĐANG SOẠN ĐỀ...' : 'AI SOẠN ĐỀ'}
            </button>
          </div>
          <div className="absolute -bottom-10 -right-10 text-bio-100 text-[12rem] opacity-20 select-none pointer-events-none font-black italic">BIO</div>
        </div>

        {/* List of Questions */}
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-gray-50/50 p-4 rounded-3xl border border-gray-100">
             <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Ngân hàng câu hỏi ({editingExam.questions.length})</h4>
             <div className="flex gap-2">
                <button onClick={() => handleAddQuestion('MCQ')} className="bg-white border-2 border-gray-100 text-gray-700 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-bio-500 hover:text-bio-700 transition-all shadow-sm cursor-pointer">+ MCQ</button>
                <button onClick={() => handleAddQuestion('TF')} className="bg-white border-2 border-gray-100 text-gray-700 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-bio-500 hover:text-bio-700 transition-all shadow-sm cursor-pointer">+ ĐÚNG/SAI</button>
                <button onClick={() => handleAddQuestion('SA')} className="bg-white border-2 border-gray-100 text-gray-700 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-bio-500 hover:text-bio-700 transition-all shadow-sm cursor-pointer">+ TỰ LUẬN</button>
             </div>
          </div>

          <div className="space-y-8">
            {editingExam.questions.map((q, idx) => (
              <QuestionEditorCard key={q.id} q={q} index={idx} />
            ))}
          </div>

          {editingExam.questions.length === 0 && (
            <div className="py-32 text-center border-4 border-dashed rounded-[4rem] border-gray-50 flex flex-col items-center justify-center bg-gray-50/30">
               <div className="text-8xl mb-8 grayscale opacity-20 animate-pulse">📚</div>
               <p className="text-gray-400 font-black uppercase tracking-[0.3em]">Kho lưu trữ đang trống</p>
               <p className="text-xs text-gray-300 mt-2 font-medium">Sử dụng AI để tự động hóa việc soạn đề hoặc thêm thủ công.</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-12 border-t border-gray-100 flex flex-col md:flex-row items-stretch md:items-center gap-4">
           {editingExam.id && (isAdmin || isMyExam(editingExam as Exam)) && (
             <button
               type="button"
               onClick={() => {
                 const found = exams.find(e => e.id === editingExam.id) || (editingExam as Exam);
                 handleDeleteExam(found);
               }}
               className="bg-red-50 text-red-700 hover:bg-red-600 hover:text-white border-2 border-red-200 py-5 px-6 rounded-3xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
             >
               <span>🗑️</span>
               <span>XÓA ĐỀ THI</span>
             </button>
           )}
           <button 
            disabled={isSubmitting}
            onClick={() => setIsEditing(false)} 
            className="flex-1 bg-gray-100 text-gray-700 py-6 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 hover:text-gray-900 transition-all cursor-pointer"
           >
             HỦY BỎ THAY ĐỔI
           </button>
           <button 
            disabled={isSubmitting || editingExam.questions.length === 0}
            onClick={handleSaveExam}
            className="flex-[2] bg-bio-800 text-white py-6 rounded-3xl font-black text-lg shadow-2xl hover:bg-black hover:shadow-gray-400/50 transform transition-all active:scale-[0.98] disabled:bg-gray-300 disabled:shadow-none uppercase tracking-widest cursor-pointer"
           >
             {isSubmitting ? 'ĐANG LƯU DỮ LIỆU...' : 'XUẤT BẢN ĐỀ THI LÊN HỆ THỐNG'}
           </button>
        </div>
      </div>
    );
  }

  // VIEW: STUDENT TAKING EXAM
  if (activeExam) {
    return (
      <div className="max-w-4xl mx-auto p-2.5 sm:p-4 md:p-8 space-y-5 sm:space-y-8 animate-fade-in">
        {/* POPUP NỔI THỜI GIAN LÀM BÀI (DẠNG VIÊN THUỐC NỔI THEO ẢNH MẪU - ĐÃ GIẢM 40% KÍCH THƯỚC) */}
        {score === null && (
          <div
            onMouseDown={handleTimerMouseDown}
            onTouchStart={handleTimerTouchStart}
            style={
              timerPosition.x !== undefined && timerPosition.y !== undefined
                ? { left: `${timerPosition.x}px`, top: `${timerPosition.y}px` }
                : undefined
            }
            title="Thời gian làm bài còn lại (có thể kéo để di chuyển vị trí)"
            className={`${
              timerPosition.x !== undefined ? 'fixed' : 'fixed top-16 right-3 sm:top-24 sm:right-6'
            } z-50 cursor-grab active:cursor-grabbing select-none transition-shadow ${
              isDraggingTimer ? 'scale-105 shadow-xl' : 'shadow-md'
            } animate-fade-in`}
          >
            <div
              className={`px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-[#FFF0F2] border-[1.5px] border-red-200/90 shadow-md shadow-red-500/10 flex items-center justify-center gap-1.5 ${
                timeLeft <= 60 ? 'animate-pulse border-red-400 bg-red-100/95' : ''
              }`}
            >
              <span className="text-red-600 font-black text-sm sm:text-lg font-mono tracking-tight leading-none">
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            </div>
          </div>
        )}

        <div className="bg-white/95 backdrop-blur-md p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-lg border border-slate-100 flex justify-between items-center sticky top-2 sm:top-4 z-40">
           <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                <span className="text-[10px] font-black bg-bio-50 text-bio-700 px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                  {activeExam.grade || activeExam.category}
                </span>
                {activeExam.topic && (
                  <span className="text-[10px] font-bold text-gray-500 hidden sm:inline truncate">
                    • {activeExam.topic}
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-xl font-black text-gray-800 truncate">
                {activeExam.lessonName || activeExam.title}
              </h2>
           </div>
           <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              {score === null && (
                <button 
                  onClick={() => setActiveExam(null)} 
                  className="bg-red-50 text-red-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-xs cursor-pointer min-h-[36px]"
                >
                  Hủy bài
                </button>
              )}
           </div>
        </div>

        {score !== null ? (
          <div className="space-y-6">
            <div className="bg-white p-5 sm:p-8 md:p-12 rounded-3xl sm:rounded-[3.5rem] shadow-2xl text-center border-t-8 border-bio-600 animate-slide-up relative overflow-hidden space-y-6">
              <div className="relative z-10 space-y-4">
                <span className="text-xs font-black uppercase tracking-widest text-bio-700 bg-bio-50 px-4 py-1.5 rounded-full border border-bio-200 inline-block">
                  🎉 HOÀN THÀNH BÀI KIỂM TRA
                </span>
                
                <div className="flex flex-col items-center justify-center gap-1">
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-6xl sm:text-8xl md:text-9xl font-black text-bio-600 drop-shadow-md leading-none">{score}</span>
                    <span className="text-xl sm:text-3xl font-black text-slate-400">/{activeExam.questions.length} câu đúng</span>
                  </div>
                  <div className="text-sm sm:text-lg font-black text-amber-600 bg-amber-50 px-3.5 py-1 rounded-full border border-amber-200 mt-1">
                    Điểm hệ 10: {activeExam.questions.length > 0 ? (Math.round((score / activeExam.questions.length) * 10 * 10) / 10).toFixed(1) : 0} điểm
                  </div>
                </div>

                <p className="text-slate-600 text-xs sm:text-sm font-semibold max-w-lg mx-auto leading-relaxed px-2">
                  Hệ thống đã tự động sao lưu kết quả vào cơ sở dữ liệu và kích hoạt <b>Trung tâm Chuẩn đoán Lỗ hỏng & Cá nhân hóa học tập</b> để phân tích vì sao sai và tạo bài học bù đắp cho em!
                </p>

                <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2.5 sm:gap-3 pt-3">
                  <button
                    onClick={() => handleOpenDiagnostic(activeExam, 'COMPETENCY')}
                    className="w-full sm:w-auto bg-bio-700 hover:bg-bio-800 text-white px-5 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg hover:shadow-bio-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 min-h-[46px]"
                  >
                    <span>🔍</span> Xem Báo Cáo Phân Tích & Luyện Tập Bù Đắp
                  </button>
                  {(() => {
                    const permission = checkExamAttemptPermission(activeExam.id, user, isAdmin, activeExam);
                    if (!permission.canTake) {
                      return (
                        <button 
                          onClick={() => handleOpenDiagnostic(activeExam, 'PRACTICE')}
                          className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-5 sm:px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 min-h-[46px]"
                          title="Mỗi tài khoản chỉ làm bài 1 lần. Hoàn thành Luyện Tập Bù Đắp Lỗ Hổng và đạt Đánh giá tiến độ > 80% để mở khóa làm lại đề gốc"
                        >
                          <span>🔒</span> Luyện Tập Bù Đắp (&gt;80%) Để Làm Lại Đề Gốc
                        </button>
                      );
                    }
                    return (
                      <button 
                        onClick={() => handleStartExam(activeExam)}
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-5 sm:px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 min-h-[46px]"
                      >
                        <span>🔓</span> Làm Lại Đề Gốc (Đã Đạt &gt;80%)
                      </button>
                    );
                  })()}
                  <button 
                    onClick={() => { setActiveExam(null); setScore(null); setActiveDiagnosticProfile(null); }} 
                    className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 sm:px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer min-h-[46px]"
                  >
                    Quay lại danh sách đề
                  </button>
                </div>
              </div>
            </div>

            {/* Hiển thị Trung Tâm Chuẩn Đoán Lỗ Hỏng & Cá Nhân Hóa Học Tập */}
            {activeDiagnosticProfile && (
              <div className="pt-2">
                <DiagnosticLearningCenter
                  profile={activeDiagnosticProfile}
                  user={user}
                  onUpdateUser={onUpdateUser}
                  initialTab={diagnosticInitialTab}
                  onProfileUpdated={(updated) => setActiveDiagnosticProfile(updated)}
                  onClose={() => setActiveDiagnosticProfile(null)}
                  onRetakeExam={() => {
                    setActiveDiagnosticProfile(null);
                    handleStartExam(activeExam);
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {renderQuestions()}
            <div className="pt-10">
              <button 
                onClick={handleSubmitExam} 
                className={`w-full bg-red-600 text-white py-6 rounded-3xl font-black text-2xl shadow-[0_0_25px_rgba(220,38,38,0.5)] hover:bg-red-700 transform transition-all active:scale-95 flex items-center justify-center gap-4 opacity-100 cursor-pointer`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ĐANG NỘP BÀI...
                  </>
                ) : (
                  'NỘP BÀI THI'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // MAIN LIST VIEW
  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* 🎯 BẢNG QUẢN TRỊ & SOẠN ĐỀ THI (DÀNH CHO ADMIN GIÁO VIÊN) HOẶC BANNER HỌC SINH */}
      {isAdmin ? (
        <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xs border border-slate-200/90 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-bio-600 text-white flex items-center justify-center text-xl shadow-xs">
                👨‍🏫
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg md:text-xl font-extrabold text-slate-900 tracking-tight">
                    Quản Trị & Biên Soạn Đề Thi Theo Khối
                  </h3>
                  <span className="text-[11px] font-bold bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full border border-rose-200">
                    🛡️ Admin Giáo Viên
                  </span>
                  <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    📚 Kết nối tri thức
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button 
                type="button"
                onClick={handleSyncCloudExams}
                disabled={isSyncingCloud}
                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-3.5 py-2 rounded-xl shadow-xs font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                title="Đồng bộ 2 chiều: Tải đề thi từ Sheet 06_DE_THI về App và đẩy đề App lên Sheet"
              >
                <span>{isSyncingCloud ? '⏳' : '🔄'}</span>
                <span>{isSyncingCloud ? 'Đang đồng bộ 2 chiều...' : 'Đồng bộ 2 chiều (Sheet 06)'}</span>
              </button>

              <button 
                type="button"
                onClick={handleExportBackup}
                className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3.5 py-2 rounded-xl shadow-xs font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5"
                title="Tải file JSON sao lưu toàn bộ ngân hàng đề thi về máy tính"
              >
                <span>📥</span>
                <span>Sao lưu đề (.JSON)</span>
              </button>

              <button 
                type="button"
                onClick={handleImportBackup}
                className="bg-amber-600 hover:bg-amber-700 active:scale-95 text-white px-3.5 py-2 rounded-xl shadow-xs font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5"
                title="Phục hồi đề thi từ file sao lưu JSON"
              >
                <span>📤</span>
                <span>Nhập đề (.JSON)</span>
              </button>

              <button 
                type="button"
                onClick={() => setShowAppsScriptModal(true)}
                className="bg-slate-700 hover:bg-slate-800 active:scale-95 text-white px-3.5 py-2 rounded-xl shadow-xs font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5"
                title="Xem hướng dẫn và mã nguồn Google Apps Script Sheet 06_DE_THI"
              >
                <span>🛠️</span>
                <span>Mã Apps Script</span>
              </button>

              <button 
                type="button"
                onClick={handleOpenCreate} 
                className="bg-bio-700 hover:bg-bio-800 active:scale-95 text-white px-4 py-2 rounded-xl shadow-xs font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <span>+</span> Tạo Đề Mới
              </button>

              <input 
                type="file" 
                ref={jsonBackupInputRef} 
                accept=".json" 
                onChange={handleJsonFileSelected} 
                className="hidden" 
              />
            </div>
          </div>

          {/* 1. Khối Lớp */}
          <div className="space-y-2 border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-left flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-bio-600"></span>
                <span>Chọn Khối Lớp Biên Soạn Đề</span>
              </div>
              <span className="text-xs font-bold text-bio-800 bg-bio-50 px-2.5 py-0.5 rounded-full border border-bio-200 self-start sm:self-auto">
                Đang chọn: {selectedGrade}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/60 w-full">
              {(['Lớp 10', 'Lớp 11', 'Lớp 12'] as const).map(grade => {
                const isSelected = selectedGrade === grade;
                return (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => handleGradeChange(grade)}
                    className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center ${
                      isSelected
                        ? 'bg-bio-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200/60 hover:bg-bio-50 hover:text-bio-900'
                    }`}
                  >
                    <span className="text-base">{grade === 'Lớp 10' ? '🧬' : grade === 'Lớp 11' ? '🌿' : '🔬'}</span>
                    <span>{grade === 'Lớp 10' ? 'Khối 10' : grade === 'Lớp 11' ? 'Khối 11' : 'Khối 12'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lựa chọn 2: Tên Bài Học */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-bio-600"></span>
              Tên Bài Học ({selectedGrade})
            </label>

            <div className="relative">
              <select
                value={inputLessonName}
                onChange={e => {
                  const selectedLesson = e.target.value;
                  setInputLessonName(selectedLesson);
                  const found = (SAMPLE_BIO_CURRICULUM[selectedGrade] || []).find(item => item.lesson === selectedLesson);
                  if (found) {
                    setSelectedTopic(found.topic);
                    setInputLearningObjectives(found.yccd);
                  }
                }}
                className="w-full bg-white border border-slate-200 hover:border-bio-500 focus:border-bio-600 focus:ring-2 focus:ring-bio-500/20 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 shadow-xs transition outline-none cursor-pointer appearance-none pr-28"
              >
                <option value="">-- Bấm vào đây để chọn bài học --</option>
                {(SAMPLE_BIO_CURRICULUM[selectedGrade] || []).map((item, idx) => {
                  const existingForThis = findExistingExamForLesson(exams, selectedGrade, item.lesson);
                  const displayId = existingForThis ? formatExamDisplayId(existingForThis.id, existingForThis.grade, existingForThis.title) : null;
                  return (
                    <option key={idx} value={item.lesson}>
                      {item.lesson}{displayId ? ` [Đã có đề #${displayId}]` : ''}
                    </option>
                  );
                })}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1.5 text-bio-800 bg-bio-50 px-2.5 py-1 rounded-lg border border-bio-200/80 shadow-xs">
                <span className="text-xs font-bold text-bio-800">Chọn bài</span>
                <svg className="w-3.5 h-3.5 text-bio-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Lựa chọn 3: Yêu Cầu Cần Đạt (Nhập văn bản / Tự động hiển thị) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-bio-600"></span>
                Yêu Cầu Cần Đạt Về Kiến Thức (Tự động theo bài học)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  ✓ Chuẩn GDPT 2018
                </span>
                {inputLearningObjectives && (
                  <button
                    type="button"
                    onClick={() => setInputLearningObjectives('')}
                    className="text-xs font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={inputLearningObjectives}
              onChange={e => setInputLearningObjectives(e.target.value)}
              rows={selectedGrade === 'Lớp 10' ? 6 : 4}
              placeholder="Nội dung Yêu Cầu Cần Đạt (YCCĐ) sẽ tự động hiển thị tương ứng khi chọn bài học..."
              className="w-full bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-2xl p-4 text-sm font-medium text-slate-800 placeholder-slate-400 shadow-xs transition outline-none leading-relaxed whitespace-pre-wrap font-sans"
            />

            {/* Điền số lượng câu hỏi theo loại dưới Khung Yêu Cầu Cần Đạt */}
            <div className="pt-2">
              <div className="flex flex-wrap items-center gap-5 sm:gap-8">
                {/* Ô 1: Nhiều lựa chọn */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-blue-700 select-none">
                    <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span>Nhiều lựa chọn</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={customTracNghiem}
                    onChange={e => setCustomTracNghiem(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ width: '140.4px', height: '39.6px' }}
                    className="bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3.5 py-2 text-sm sm:text-base font-medium text-slate-800 shadow-2xs outline-none transition"
                  />
                </div>

                {/* Ô 2: Đúng/Sai */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-blue-700 select-none">
                    <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Đúng/Sai</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={customDungSai}
                    onChange={e => setCustomDungSai(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ width: '100.4px', height: '39.6px' }}
                    className="bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3.5 py-2 text-sm sm:text-base font-medium text-slate-800 shadow-2xs outline-none transition"
                  />
                </div>

                {/* Ô 3: Trả lời ngắn (Chỉ hiển thị khi Khối 12) */}
                {selectedGrade === 'Lớp 12' && (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-blue-700 select-none">
                      <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span>Trả lời ngắn</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={customTraLoiNgan}
                      onChange={e => setCustomTraLoiNgan(Math.max(0, parseInt(e.target.value) || 0))}
                      style={{ width: '100.4px', height: '39.6px' }}
                      className="bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3.5 py-2 text-sm sm:text-base font-medium text-slate-800 shadow-2xs outline-none transition"
                    />
                  </div>
                )}

                {/* Ô 4: Thời gian (phút) làm bài - Ngang hàng với các ô số câu */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-blue-700 select-none">
                    <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Thời gian (phút)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={customDuration}
                    onChange={e => setCustomDuration(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: '120px', height: '39.6px' }}
                    className="bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-3.5 py-2 text-sm sm:text-base font-medium text-slate-800 shadow-2xs outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Cấu trúc đề thi dự kiến */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="font-bold text-slate-700 text-xs uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                {selectedGrade === 'Lớp 12' ? 'Cấu trúc 3 phần THPT:' : `Cấu trúc 2 phần ${selectedGrade}:`} ({selectedGrade === 'Lớp 12' ? customTracNghiem + customDungSai * 4 + customTraLoiNgan : customTracNghiem + customDungSai * 4} mục chấm điểm)
              </span>
              <span className="bg-blue-50 text-blue-900 px-2.5 py-1 rounded-lg border border-blue-200 font-bold text-xs flex items-center gap-1">
                <span>📌</span> {customTracNghiem} câu trắc nghiệm
              </span>
              <span className="bg-emerald-50 text-emerald-900 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold text-xs flex items-center gap-1">
                <span>⚖️</span> {customDungSai} câu Đúng/Sai ({customDungSai * 4} ý)
              </span>
              {selectedGrade === 'Lớp 12' && (
                <span className="bg-purple-50 text-purple-900 px-2.5 py-1 rounded-lg border border-purple-200 font-bold text-xs flex items-center gap-1">
                  <span>✍️</span> {customTraLoiNgan} câu trả lời ngắn
                </span>
              )}
              <span className="bg-amber-50 text-amber-900 px-2.5 py-1 rounded-lg border border-amber-200 font-bold text-xs flex items-center gap-1">
                <span>⏱️</span> {customDuration} phút làm bài
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isGeneratingCustomTest}
              onClick={handleQuickAIGenerate}
              className={`flex-1 py-3.5 px-6 rounded-xl font-black text-sm uppercase tracking-wider shadow-sm active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${
                existingExamForSelectedLesson
                  ? 'bg-amber-600 hover:bg-amber-700 text-white border border-amber-700'
                  : 'bg-gradient-to-r from-bio-700 to-emerald-700 hover:from-bio-800 hover:to-emerald-800 text-white'
              }`}
            >
              {isGeneratingCustomTest ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>AI ĐANG SOẠN ĐỀ...</span>
                </>
              ) : existingExamForSelectedLesson ? (
                <>
                  <span className="text-base">⚠️</span>
                  <span>ĐÃ CÓ ĐỀ CHO BÀI NÀY (XÓA ĐỀ CŨ ĐỂ TẠO LẠI)</span>
                </>
              ) : (
                <>
                  <span className="text-base">🪄</span>
                  <span>AI SOẠN ĐỀ</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* GIAO DIỆN HỌC SINH: BANNER ĐỀ THI ĐƯỢC GIAO THEO KHỐI */
        <div 
          style={{ 
            minHeight: '131.5px', 
            width: '100%', 
            paddingTop: '3px', 
            paddingBottom: '25px', 
            paddingRight: '20px', 
            paddingLeft: '20px', 
            marginTop: '0px', 
            marginLeft: '0px', 
            marginRight: '0px', 
            marginBottom: '-28px' 
          }}
          className="w-full bg-gradient-to-br from-emerald-950 via-bio-900 to-emerald-900 text-white rounded-2xl sm:rounded-3xl shadow-md border border-emerald-700/40 relative overflow-hidden space-y-3 sm:space-y-4"
        >
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 w-full">
            <div className="space-y-2 sm:space-y-3 flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md text-[10px] xs:text-xs font-semibold text-emerald-200 border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span style={{ color: '#f5a49b' }}>Chuẩn GDPT 2018 · {studentGradeFilter === 'ALL' ? 'Ngân Hàng Đề Thi THPT' : `Sinh Học ${studentGradeFilter}`}</span>
              </div>
              <h2 style={{ color: '#f4cc30', fontSize: '24px' }} className="font-extrabold tracking-tight leading-tight">
                Kho Đề Đánh Giá Năng Lực
              </h2>
              <p className="text-xs xs:text-sm text-emerald-100/90 leading-snug font-normal">
                Xin chào <strong className="text-white font-semibold">{user.name}</strong> {user.className ? `(${user.className})` : ''}! Hãy bắt đầu thử thách năng lực Sinh Học. {!isLoggedIn && !isAdmin && (
                  <span className="inline-flex items-center gap-1 mt-1 text-amber-300 font-bold bg-amber-400/20 px-2 py-0.5 rounded-lg border border-amber-300/30 text-[10px] xs:text-xs">
                    <span>⚠️</span>
                    <span>Lưu ý: Học sinh cần đăng nhập thành công mới có thể vào làm bài kiểm tra.</span>
                  </span>
                )}
              </p>
            </div>

            <div 
              style={{ paddingTop: '9px', paddingBottom: '6px', paddingLeft: '0px', paddingRight: '0px' }}
              className="grid grid-cols-3 gap-1.5 xs:gap-2 sm:gap-3 bg-white/10 backdrop-blur-md rounded-xl sm:rounded-2xl border border-white/15 text-center shrink-0 w-full md:w-auto"
            >
              <div className="px-1 xs:px-2 sm:px-3">
                <div className="text-xl xs:text-2xl sm:text-3xl font-black text-white">{studentDisplayedExams.length}</div>
                <div style={{ color: '#f3dd06' }} className="text-[10px] xs:text-[11px] font-medium mt-0.5 whitespace-nowrap">Đề khả dụng</div>
              </div>
              <div className="px-1 xs:px-2 sm:px-3 border-x border-white/15">
                <div style={{ color: '#f9082b', backgroundColor: '#f6f1f1' }} className="text-xl xs:text-2xl sm:text-3xl font-black rounded-lg">{studentUncompletedCount}</div>
                <div style={{ backgroundColor: '#f8f4f4', color: '#f40710' }} className="text-[10px] xs:text-[11px] font-medium mt-0.5 whitespace-nowrap rounded-lg">Chưa làm</div>
              </div>
              <div className="px-1 xs:px-2 sm:px-3">
                <div className="text-xl xs:text-2xl sm:text-3xl font-black text-emerald-300">{studentCompletedCount}</div>
                <div style={{ color: '#f0f5f6' }} className="text-[10px] xs:text-[11px] font-medium mt-0.5 whitespace-nowrap">Đã hoàn thành</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Search Bar (if admin) */}
      {isAdmin && (
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="flex-1 relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
            <input 
              type="text" 
              placeholder="Tìm kiếm theo mã đề, tên đề, bài học hoặc chủ đề..." 
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-bio-500 rounded-xl outline-none focus:ring-2 focus:ring-bio-500/20 font-medium text-sm text-slate-800 transition" 
              value={adminSearchTerm} 
              onChange={e => setAdminSearchTerm(e.target.value)}
            />
            {adminSearchTerm && (
              <button
                type="button"
                onClick={() => setAdminSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
          <select 
            className="px-4 py-2.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl outline-none focus:border-bio-500 focus:ring-2 focus:ring-bio-500/20 font-bold text-xs text-slate-700 shadow-xs transition cursor-pointer" 
            value={adminCategoryFilter} 
            onChange={e => setAdminCategoryFilter(e.target.value)}
          >
            <option value="ALL">Tất cả khối lớp</option>
            <option value="Sinh 10">Sinh 10</option>
            <option value="Sinh 11">Sinh 11</option>
            <option value="Sinh 12">Sinh 12</option>
          </select>
        </div>
      )}

      {/* Results Overview Modal */}
      {viewingResultsExam && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-2.5 sm:p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up border border-slate-200">
            <div className="p-4 sm:p-6 md:p-8 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/70 gap-3">
              <div>
                <h3 className="text-lg sm:text-2xl font-black text-gray-800 tracking-tight">{viewingResultsExam.title}</h3>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                  <span className="bg-bio-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">ID: {formatExamDisplayId(viewingResultsExam.id, viewingResultsExam.grade || viewingResultsExam.category)}</span>
                  <span className="text-xs font-bold text-gray-400">{allExamResults.length} lượt thi đã hoàn thành</span>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
                <button onClick={handleExportOverview} className="bg-green-600 text-white px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-sm hover:bg-green-700 transition-all active:scale-95 cursor-pointer">Xuất báo cáo Excel</button>
                <button onClick={() => setViewingResultsExam(null)} className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-white border border-gray-200 rounded-full text-gray-500 hover:text-red-500 transition-all shadow-xs text-lg cursor-pointer">&times;</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8">
              {isLoadingResults ? (
                <div className="text-center py-20 font-black text-gray-300 uppercase tracking-widest animate-pulse text-base sm:text-xl">ĐANG TRUY VẤN DỮ LIỆU...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-separate border-spacing-y-2 min-w-[540px]">
                    <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Học Sinh</th>
                        <th className="py-2.5 px-3">Lớp</th>
                        <th className="py-2.5 px-3 text-center">Điểm số</th>
                        <th className="py-2.5 px-3">Mốc Thời Gian</th>
                        <th className="py-2.5 px-3 text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allExamResults.map((res, i) => (
                        <tr key={i} className="bg-gray-50/70 hover:bg-bio-50 transition-all group">
                          <td className="py-3.5 px-3 font-black text-gray-800 rounded-l-xl border-l-4 border-transparent group-hover:border-bio-600 text-xs sm:text-sm">{res.userName}</td>
                          <td className="py-3.5 px-3 text-xs font-bold text-gray-500">{res.userClass}</td>
                          <td className="py-3.5 px-3 text-center font-black text-bio-600 text-lg sm:text-xl">{res.score}</td>
                          <td className="py-3.5 px-3 text-[10px] font-medium text-gray-500 leading-snug">
                             <div className="opacity-70">Bắt đầu: {res.startTime ? new Date(res.startTime).toLocaleString('vi-VN') : 'N/A'}</div>
                             <div className="text-bio-700 font-semibold">Nộp: {new Date(res.date).toLocaleString('vi-VN')}</div>
                          </td>
                          <td className="py-3.5 px-3 text-right rounded-r-xl">
                            <button onClick={() => setSelectedStudentDetail(res)} className="bg-white text-bio-700 text-[10px] font-black px-3.5 py-1.5 rounded-lg border border-bio-200 hover:bg-bio-600 hover:text-white transition-all shadow-xs cursor-pointer">XEM BÀI 👁️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Result Modal */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center p-2.5 sm:p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-slide-up">
            <div className="p-4 sm:p-6 md:p-8 border-b bg-bio-800 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 relative overflow-hidden">
               <div className="relative z-10">
                 <h4 className="text-lg sm:text-2xl font-black tracking-tight">{selectedStudentDetail.userName} - {selectedStudentDetail.userClass}</h4>
                 <div className="flex flex-wrap gap-3 mt-1 opacity-80 font-bold text-xs">
                   <span>Kết quả: {selectedStudentDetail.score} điểm</span>
                   <span className="border-l border-white/20 pl-3">Thời lượng: {Math.round((new Date(selectedStudentDetail.date).getTime() - new Date(selectedStudentDetail.startTime || selectedStudentDetail.date).getTime()) / 60000)} phút</span>
                 </div>
               </div>
               <div className="flex items-center gap-2 sm:gap-3 relative z-10 w-full sm:w-auto justify-end">
                 <button onClick={() => exportExcel(selectedStudentDetail.details, `ChiTiet_${selectedStudentDetail.userName}`)} className="bg-white/10 hover:bg-white/20 px-3.5 sm:px-5 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all border border-white/20 cursor-pointer">Xuất Excel</button>
                 <button onClick={() => setSelectedStudentDetail(null)} className="w-8 h-8 sm:w-10 sm:h-10 bg-white/10 hover:bg-white/20 flex items-center justify-center rounded-full text-xl transition-all border border-white/20 cursor-pointer">&times;</button>
               </div>
            </div>
            <div className="p-3 bg-gray-50 flex gap-2 border-b overflow-x-auto">
               <button onClick={() => setDetailFilter('ALL')} className={`px-4 py-1.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer whitespace-nowrap ${detailFilter === 'ALL' ? 'bg-bio-800 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Xem tất cả</button>
               <button onClick={() => setDetailFilter('INCORRECT')} className={`px-4 py-1.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer whitespace-nowrap ${detailFilter === 'INCORRECT' ? 'bg-red-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Chỉ câu sai ❌</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 bg-gray-50/50">
               {selectedStudentDetail.details?.filter((d: any) => detailFilter === 'ALL' || !d.isCorrect).map((d: any, idx: number) => (
                  <div key={idx} className={`p-4 sm:p-6 rounded-2xl border-2 shadow-xs transition-all animate-fade-in ${d.isCorrect ? 'border-green-100 bg-white' : 'border-red-100 bg-white'}`}>
                     <p className="font-bold text-gray-800 text-sm sm:text-base mb-4 leading-relaxed">{formatDisplayQuestionText(d.questionText, { stripLeadingCau: false })}</p>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className={`p-3.5 sm:p-4 rounded-xl border font-bold flex flex-col gap-0.5 ${d.isCorrect ? 'border-green-100 bg-green-50/40 text-green-800' : 'border-red-100 bg-red-50/40 text-red-800'}`}>
                          <span className="text-[10px] uppercase tracking-wider opacity-70">Lựa chọn của học sinh</span>
                          <span className="text-base sm:text-lg">{d.userAnswer}</span>
                        </div>
                        <div className="p-3.5 sm:p-4 rounded-xl border border-bio-100 bg-bio-50/40 text-bio-900 font-bold flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider opacity-70">Đáp án chuẩn hệ thống</span>
                          <span className="text-base sm:text-lg">{d.correctAnswer}</span>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem Yêu Cầu Cần Đạt (YCCĐ) */}
      {viewingObjectiveExam && (
        <div className="fixed inset-0 bg-black/70 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-6 sm:p-8 space-y-5 animate-scale-up border border-gray-100 relative">
            <div className="flex justify-between items-start border-b pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="bg-bio-50 text-bio-700 font-black text-[10px] px-3 py-1 rounded-full border border-bio-200">
                    {viewingObjectiveExam.grade || viewingObjectiveExam.category}
                  </span>
                  {viewingObjectiveExam.topic && (
                    <span className="bg-gray-100 text-gray-600 font-bold text-[10px] px-3 py-1 rounded-full">
                      {viewingObjectiveExam.topic}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-gray-800">
                  {viewingObjectiveExam.lessonName || viewingObjectiveExam.title}
                </h3>
              </div>
              <button
                onClick={() => setViewingObjectiveExam(null)}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-lg transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>📋</span> Yêu Cầu Cần Đạt (Chuẩn Chương Trình GDPT 2018)
              </h4>
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 text-emerald-950 text-base leading-relaxed whitespace-pre-line font-bold shadow-inner">
                {viewingObjectiveExam.learningObjectives || 'Đề thi bám sát kiến thức trọng tâm bộ môn Sinh Học THPT.'}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => setViewingObjectiveExam(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200 transition cursor-pointer"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  const ex = viewingObjectiveExam;
                  setViewingObjectiveExam(null);
                  handleStartExam(ex);
                }}
                className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-bio-700 hover:bg-bio-800 shadow-md transition cursor-pointer"
              >
                Vào Làm Bài Thi Ngay 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem Đáp Án & Hướng Dẫn Giải (Dành cho Admin Giáo Viên) */}
      {viewingAnswersExam && (
        <AnswerKeyModal
          exam={viewingAnswersExam}
          onClose={() => setViewingAnswersExam(null)}
          onStartExam={(ex) => {
            setViewingAnswersExam(null);
            handleStartExam(ex);
          }}
        />
      )}

      {/* Modal Xác Nhận Xóa Đề Thi (Dành cho Admin Giáo Viên) */}
      {deletingExam && (
        <div className="fixed inset-0 bg-black/75 z-[130] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 animate-scale-up border-2 border-red-200 relative">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-2xl shrink-0 shadow-sm border border-red-200">
                🗑️
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-800 px-3 py-0.5 rounded-full border border-red-300">
                  Quyền Admin Giáo Viên
                </span>
                <h3 className="text-xl font-black text-gray-950 mt-1">
                  Xác nhận xóa bài kiểm tra?
                </h3>
                <p className="text-xs text-red-700 font-bold mt-1 leading-relaxed">
                  Hành động này sẽ gỡ bỏ vĩnh viễn bài kiểm tra khỏi hệ thống và danh sách làm bài của học sinh.
                </p>
              </div>
              <button
                type="button"
                disabled={isDeletingExam}
                onClick={() => setDeletingExam(null)}
                className="text-gray-400 hover:text-gray-700 font-bold text-lg p-1 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Chi tiết bài thi sắp xóa */}
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-2 text-xs shadow-inner">
              <div className="font-black text-base text-red-950 leading-snug">
                {deletingExam.title}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-gray-900 font-bold pt-1">
                <span className="bg-white px-2.5 py-1 rounded-lg border border-red-200 text-red-900 font-black">
                  {deletingExam.grade || deletingExam.category}
                </span>
                <span className="bg-white px-2.5 py-1 rounded-lg border border-red-200 text-red-900 font-black">
                  {Array.isArray(deletingExam.questions) ? deletingExam.questions.length : 0} câu hỏi
                </span>
                <span className="bg-white px-2.5 py-1 rounded-lg border border-red-200 font-mono text-gray-800 font-bold">
                  #{formatExamDisplayId(deletingExam.id, deletingExam.grade || deletingExam.category)}
                </span>
              </div>
              {deletingExam.learningObjectives && (
                <div className="bg-white/90 border border-red-200 rounded-xl p-3 text-xs text-red-950 font-bold leading-relaxed line-clamp-2">
                  {deletingExam.learningObjectives}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeletingExam}
                onClick={() => setDeletingExam(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200 transition cursor-pointer disabled:opacity-50"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isDeletingExam}
                onClick={confirmDeleteExam}
                className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-300 transition flex items-center gap-2 cursor-pointer disabled:bg-gray-400"
              >
                {isDeletingExam ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <span>🗑️</span>
                    <span>Xác Nhận Xóa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast thông báo hệ thống */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[140] bg-gray-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in text-xs font-bold border border-white/20">
          <span>{toastMessage}</span>
          <button 
            type="button" 
            onClick={() => setToastMessage(null)}
            className="text-gray-400 hover:text-white font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* DANH SÁCH ĐỀ THI THEO KHỐI CHO HỌC SINH HOẶC TOÀN HỆ THỐNG CHO ADMIN */}
      <div className="grid gap-5">
        {/* Banner Lưu ý yêu cầu học sinh đăng nhập thành công mới được vào làm bài */}
        {!isLoggedIn && !isAdmin && (
          <div className="bg-gradient-to-r from-amber-50 via-amber-100/70 to-emerald-50 border-2 border-amber-300/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-fade-in">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl shrink-0 shadow-md">
                🔒
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-amber-950 text-sm sm:text-base">
                    Lưu ý: Học sinh cần đăng nhập thành công để vào làm bài kiểm tra
                  </h4>
                  <span className="text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                    Bắt buộc
                  </span>
                </div>
                <p className="text-xs text-amber-900 mt-1 leading-relaxed font-medium">
                  Em cần đăng nhập bằng tài khoản/số điện thoại học sinh để hệ thống kích hoạt quyền vào làm bài thi, tính giờ làm bài và lưu điểm số vào học bạ Google Sheet.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenLogin ? onOpenLogin() : setShowLoginPromptModal(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-bio-700 to-emerald-700 hover:from-bio-800 hover:to-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <span>🔑</span>
              <span>Đăng Nhập Ngay</span>
            </button>
          </div>
        )}

        {/* Bộ lọc bài kiểm tra dành riêng cho học sinh */}
        {!isAdmin && (
          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col gap-3.5">
            {/* Quy định làm bài kiểm tra 1 lần & Điều kiện mở khóa làm lại (>80%) */}
            <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-xl px-3.5 py-2.5 flex items-start sm:items-center gap-2.5 text-xs text-emerald-950">
              <span className="text-base shrink-0">📌</span>
              <p className="leading-relaxed font-medium">
                <strong className="font-black text-emerald-900">Quy định làm bài:</strong> Ở mỗi 1 bài kiểm tra, mỗi tài khoản học sinh <strong className="font-bold text-amber-800">chỉ làm được 1 lần</strong>. Khi hoàn thành xong <strong className="font-bold text-bio-800">"Luyện Tập Bù Đắp Lỗ Hổng"</strong> và kết quả <strong className="font-bold text-emerald-800">"Đánh giá tiến độ" trên 80%</strong> các em mới được làm lại đề gốc kiểm tra.
              </p>
            </div>
            {/* Hàng 1: Ô Tìm kiếm & Nút Làm Mới nằm gọn trên 1 hàng */}
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1 min-w-0">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs sm:text-sm">
                  🔍
                </span>
                <input
                  type="text"
                  value={adminSearchTerm}
                  onChange={e => setAdminSearchTerm(e.target.value)}
                  placeholder="Tìm theo bài học, chủ đề, mã đề..."
                  className="w-full pl-8 pr-7 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-bio-500 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-bio-500/20 transition truncate"
                />
                {adminSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setAdminSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    await loadExams();
                    setToastMessage("🔄 Đã đồng bộ danh sách đề thi mới nhất từ Google Sheet (Sheet 06_DE_THI)!");
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold text-bio-700 bg-bio-50 hover:bg-bio-100 border border-bio-200 transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap active:scale-95 shadow-2xs"
                title="Đồng bộ đề thi mới nhất từ Google Sheet 06_DE_THI"
              >
                <span>🔄</span>
                <span>{isLoading ? 'Đang đồng bộ...' : 'Đồng bộ / Làm mới'}</span>
              </button>
            </div>

            {/* Hàng 2: Chọn khối lớp và Bộ lọc trạng thái làm bài (Tự động co giãn đều, không bị tràn hay mất nút) */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
              {/* Chọn khối lớp: Nếu tài khoản học sinh đã xác định khối lớp, thể hiện đề theo đúng Khối Lớp của học sinh */}
              {currentStudentGradeLabel ? (
                <div className="flex flex-wrap items-center gap-2 p-1 bg-emerald-50/80 border border-emerald-200/80 rounded-xl w-full md:w-auto">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bio-700 text-white rounded-lg shadow-xs text-[11px] sm:text-xs font-bold">
                    <span>{currentStudentGrade === '10' ? '🧬' : currentStudentGrade === '11' ? '🌿' : '🔬'}</span>
                    <span>Đề kiểm tra {currentStudentGradeLabel}</span>
                  </div>
                  {user.className && (
                    <span className="text-[11px] font-bold text-bio-800 bg-white px-2.5 py-1 rounded-lg border border-bio-200/80 shadow-2xs">
                      Lớp {user.className}
                    </span>
                  )}
                  <span className="text-[11px] font-medium text-bio-700 px-1 hidden sm:inline">
                    · Dành riêng cho học sinh {currentStudentGradeLabel} ({studentDisplayedExams.length} đề)
                  </span>
                </div>
              ) : (
                /* Dành cho khách hoặc tài khoản chưa xác định khối lớp */
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/60 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={() => setStudentGradeFilter('ALL')}
                    className={`px-1 sm:px-3 py-1.5 rounded-lg text-[10px] xs:text-[11px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                      studentGradeFilter === 'ALL'
                        ? 'bg-bio-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="hidden sm:inline">✨</span>
                    <span>Tất cả ({exams.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentGradeFilter('Lớp 10')}
                    className={`px-1 sm:px-3 py-1.5 rounded-lg text-[10px] xs:text-[11px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                      studentGradeFilter === 'Lớp 10'
                        ? 'bg-bio-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="hidden sm:inline">🧬</span>
                    <span style={{ color: '#7e0689' }}>Khối 10 ({countGrade10})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentGradeFilter('Lớp 11')}
                    className={`px-1 sm:px-3 py-1.5 rounded-lg text-[10px] xs:text-[11px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                      studentGradeFilter === 'Lớp 11'
                        ? 'bg-bio-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="hidden sm:inline">🌿</span>
                    <span style={{ color: '#077221' }}>Khối 11 ({countGrade11})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentGradeFilter('Lớp 12')}
                    className={`px-1 sm:px-3 py-1.5 rounded-lg text-[10px] xs:text-[11px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                      studentGradeFilter === 'Lớp 12'
                        ? 'bg-bio-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="hidden sm:inline">🔬</span>
                    <span style={{ color: '#f00420' }}>Khối 12 ({countGrade12})</span>
                  </button>
                </div>
              )}

              {/* Bộ lọc trạng thái làm bài: 3 nút dàn đều 3 cột trên điện thoại */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/60 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => setStudentFilter('ALL')}
                  className={`px-1.5 sm:px-3 py-1.5 rounded-lg text-[10px] xs:text-[11px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                    studentFilter === 'ALL'
                      ? 'bg-white text-bio-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>📌</span>
                  <span>Tất cả ({studentDisplayedExams.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudentFilter('UNCOMPLETED')}
                  className={`px-1.5 sm:px-3 py-1.5 rounded-lg text-[10px] xs:text-[11px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                    studentFilter === 'UNCOMPLETED'
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>⚡</span>
                  <span style={{ color: '#f1250b' }}>Chưa làm ({studentUncompletedCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudentFilter('COMPLETED')}
                  className={`px-1.5 sm:px-3 py-1.5 rounded-lg text-[10px] xs:text-[11px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                    studentFilter === 'COMPLETED'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>✅</span>
                  <span style={{ color: '#08881b' }}>Đã làm ({studentCompletedCount})</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header danh sách đề thi */}
        <div className="flex items-center justify-between px-1 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              {isAdmin 
                ? `Tất cả đề thi trên hệ thống (${filteredExams.length})`
                : (studentGradeFilter === 'ALL' 
                    ? `Toàn bộ bài kiểm tra (${filteredExams.length})` 
                    : `Danh sách bài kiểm tra · ${studentGradeFilter} (${filteredExams.length})`)}
            </span>
            {!isAdmin && (
              <span className="text-[11px] font-semibold text-bio-700 bg-bio-50 px-2.5 py-0.5 rounded-full border border-bio-200/80">
                {studentFilter === 'ALL' && `Tất cả`}
                {studentFilter === 'UNCOMPLETED' && `Chưa làm`}
                {studentFilter === 'COMPLETED' && `Đã hoàn thành`}
              </span>
            )}
          </div>
          {isAdmin && filterOnlyCurrentSelection && (
            <span className="text-xs font-semibold text-bio-700 bg-bio-50 px-3 py-1 rounded-full border border-bio-200/80">
              Đang lọc: {selectedGrade} {selectedTopic ? `· ${selectedTopic}` : ''}
            </span>
          )}
        </div>

        {filteredExams.length === 0 ? (
          <div className="bg-white p-12 sm:p-16 rounded-3xl text-center border border-dashed border-slate-300 space-y-4 shadow-xs">
             <div className="text-5xl">📭</div>
             <p className="text-slate-800 font-bold text-base">
               {!isAdmin
                 ? (studentFilter === 'UNCOMPLETED' 
                     ? `Tuyệt vời! Em đã hoàn thành tất cả đề thi ${studentGradeFilter === 'ALL' ? 'của hệ thống' : `của ${studentGradeFilter}`}!`
                     : studentFilter === 'COMPLETED'
                     ? `Em chưa hoàn thành bài thi nào ${studentGradeFilter === 'ALL' ? 'của hệ thống' : `của ${studentGradeFilter}`}`
                     : `Chưa có bài kiểm tra nào ${studentGradeFilter === 'ALL' ? 'trong hệ thống' : `cho ${studentGradeFilter}`}`)
                 : 'Không tìm thấy đề thi phù hợp'}
             </p>
             <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
               {!isAdmin
                 ? (studentFilter === 'UNCOMPLETED' 
                     ? 'Em đã hoàn thành hết các bài kiểm tra được giao. Hãy xem lại lịch sử làm bài để ôn luyện thêm.'
                     : studentFilter === 'COMPLETED'
                     ? 'Hãy chuyển sang bộ lọc "Chưa làm" hoặc "Tất cả" để chọn bài kiểm tra bắt đầu làm.'
                     : (!currentStudentGradeLabel ? `Thầy cô đang cập nhật thêm đề thi. Em có thể chọn "Tất cả khối" để ôn luyện thêm các bài học khác.` : `Thầy cô đang cập nhật thêm đề thi cho ${currentStudentGradeLabel}. Em vui lòng quay lại sau.`))
                 : 'Thầy/Cô hãy chọn bài học và bấm nút "AI Soạn & Phát Hành Đề Thi" hoặc "+ Tạo Đề Mới" để xuất bản đề thi cho học sinh.'}
             </p>
             <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
               {!isAdmin ? (
                 <div className="flex flex-wrap items-center justify-center gap-2">
                   {!currentStudentGradeLabel && studentGradeFilter !== 'ALL' && exams.length > 0 && (
                     <button
                       type="button"
                       onClick={() => setStudentGradeFilter('ALL')}
                       className="px-4 py-2 bg-bio-600 hover:bg-bio-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                     >
                       Xem tất cả {exams.length} đề thi THPT
                     </button>
                   )}
                   {studentFilter !== 'ALL' && (
                     <button
                       type="button"
                       onClick={() => setStudentFilter('ALL')}
                       className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                     >
                       Bỏ lọc trạng thái
                     </button>
                   )}
                 </div>
               ) : (
                 <button
                   type="button"
                   onClick={() => {
                     setAdminCategoryFilter('ALL');
                     setSelectedStudentFilter('ALL');
                     setAdminSearchTerm('');
                     setFilterOnlyCurrentSelection(false);
                   }}
                   className="px-4 py-2 bg-bio-600 hover:bg-bio-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                 >
                   Xem tất cả {exams.length} đề thi
                 </button>
               )}
             </div>
          </div>
        ) : filteredExams.map((exam, idx) => {
          const status = getExamStatusForUser(exam.id);
          const permission = checkExamAttemptPermission(exam.id, user, isAdmin, exam);
          const isMine = isMyExam(exam);
          const canManage = isAdmin || isMine;

          return (
            <div 
              key={`exam_${exam.id}_${idx}`} 
              className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-xs border border-slate-200/90 hover:border-bio-500 hover:shadow-md transition-all duration-200 flex flex-col gap-3 sm:gap-4 group relative overflow-hidden"
            >
              {/* Status accent indicator bar on left border */}
              <div 
                className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${
                  permission.hasTaken
                    ? (permission.canTake ? 'bg-emerald-500' : 'bg-amber-500')
                    : 'bg-bio-600'
                }`} 
              />

              {/* 1. Header row of card: Grade, Status, and Exam ID */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-[10px] sm:text-xs font-bold bg-bio-50 text-bio-800 border border-bio-200/80 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
                    {exam.grade || exam.category}
                  </span>

                  {/* Profile ownership badge */}
                  {isMine ? (
                    <span className="text-[10px] sm:text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/70 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1">
                      <span>👤</span> Đề của bạn {user.studentId ? `(${user.studentId})` : ''}
                    </span>
                  ) : (exam.studentName || exam.studentId) && (!exam.studentName || (!exam.studentName.toLowerCase().includes('giáo viên') && !exam.studentName.toLowerCase().includes('admin'))) ? (
                    <span className="text-[10px] sm:text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1">
                      <span>👤</span> HS: {exam.studentName || exam.studentId} {exam.studentClass ? `(${exam.studentClass})` : ''} {exam.studentId ? `• ${exam.studentId}` : ''}
                    </span>
                  ) : null}

                  {/* Student completion status badge */}
                  {permission.hasTaken ? (
                    permission.canTake ? (
                      <span className="text-[10px] sm:text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1 shadow-2xs whitespace-nowrap">
                        <span>🔓</span>
                        <span>Đã mở khóa làm lại (Tiến độ {permission.remedialPercent}% &gt; 80%)</span>
                      </span>
                    ) : (
                      <span className="text-[10px] sm:text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1 shadow-2xs whitespace-nowrap">
                        <span>🔒</span>
                        <span>Đã làm ({status?.maxScore}/10 đ) · Cần bù đắp &gt;80% để làm lại</span>
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] sm:text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1 shadow-2xs whitespace-nowrap">
                      <span>⏱️</span>
                      <span>Chưa làm</span>
                    </span>
                  )}
                </div>

                <span className="text-[10px] sm:text-[11px] font-mono font-bold text-bio-800 bg-bio-50/90 px-2 py-0.5 rounded-lg border border-bio-200/90 shrink-0 shadow-2xs tracking-wider">
                  #{formatExamDisplayId(exam.id, exam.grade || exam.category, exam.title)}
                </span>
              </div>

              {/* 2. Exam Title (Spans full width) */}
              <h3 className="text-base sm:text-xl font-extrabold text-slate-900 leading-snug group-hover:text-bio-700 transition-colors tracking-tight">
                {exam.title}
              </h3>

              {/* 3. Learning Objectives / Focus Knowledge Box (Collapsible accordion with arrow) */}
              {(exam.learningObjectives || exam.lessonName || exam.topic) && (
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 overflow-hidden transition-all duration-200">
                  <button
                    type="button"
                    onClick={() => toggleYccd(exam.id)}
                    className="w-full flex items-center justify-between p-3 sm:px-4 sm:py-2.5 text-left hover:bg-emerald-100/50 transition cursor-pointer select-none group/yccd"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm shrink-0">🧬</span>
                      <span className="text-xs font-bold uppercase tracking-wide text-emerald-900 group-hover/yccd:text-emerald-950">
                        Trọng tâm kiến thức & Yêu cầu cần đạt (YCCĐ)
                      </span>
                      {!expandedYccdIds[exam.id] && (
                        <span className="text-xs font-normal text-emerald-700/80 hidden md:inline truncate max-w-lg">
                          — Bấm để mở rộng nội dung chi tiết
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-bold shrink-0">
                      <span className="text-[11px] hidden sm:inline">
                        {expandedYccdIds[exam.id] ? 'Thu gọn' : 'Xem chi tiết'}
                      </span>
                      <svg
                        className={`w-4 h-4 transform transition-transform duration-200 ${
                          expandedYccdIds[exam.id] ? 'rotate-180 text-emerald-700' : 'rotate-0 text-emerald-600'
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {expandedYccdIds[exam.id] && (
                    <div className="px-4 pb-4 pt-2 border-t border-emerald-200/60 bg-emerald-50/60 text-xs sm:text-sm text-emerald-950 font-medium leading-relaxed whitespace-pre-line animate-fade-in">
                      {exam.learningObjectives || `${exam.lessonName || exam.title} • Trọng tâm kiến thức: ${exam.topic || 'Sinh Học THPT'}. Bám sát chuẩn chương trình GDPT 2018.`}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Footer Bar: Left metadata & Right action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-1 border-t border-slate-100">
                {/* Metadata Row: questions count, duration, author, date */}
                <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5 sm:gap-x-4 text-[11px] sm:text-xs text-slate-600">
                  <span style={{ color: '#04a91c' }} className="inline-flex items-center gap-1 font-semibold bg-slate-100/80 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
                    <span>📝</span> {Array.isArray(exam.questions) ? exam.questions.length : 0} câu
                  </span>
                  <span style={{ color: '#e20f2f' }} className="inline-flex items-center gap-1 font-semibold bg-slate-100/80 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
                    <span>⏱️</span> {exam.duration} phút
                  </span>
                  {exam.createdBy && (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-600 truncate max-w-[140px] sm:max-w-none">
                      <span>👤</span> {/lâm\s*thái\s*hiển/i.test(exam.createdBy) ? 'Admin Giáo Viên' : exam.createdBy}
                    </span>
                  )}
                  {exam.createdAt && formatExamCreatedAt(exam.createdAt) && (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-500 hidden xs:inline-flex">
                      <span>📅</span> {formatExamCreatedAt(exam.createdAt)}
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {exam.learningObjectives && (
                    <button
                      type="button"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        toggleYccd(exam.id); 
                      }}
                      className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap active:scale-95 ${
                        expandedYccdIds[exam.id]
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/80'
                      }`}
                      title={expandedYccdIds[exam.id] ? "Thu gọn Yêu Cầu Cần Đạt" : "Xổ xuống xem Yêu Cầu Cần Đạt"}
                    >
                      <span>{expandedYccdIds[exam.id] ? '▲' : '📋'}</span>
                      <span>{expandedYccdIds[exam.id] ? 'Ẩn YCCĐ' : 'Xem YCCĐ'}</span>
                    </button>
                  )}

                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setViewingAnswersExam(exam); }}
                        className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap active:scale-95"
                        title="Xem toàn bộ đáp án và hướng dẫn giải bài kiểm tra này (Dành cho Admin Giáo Viên)"
                      >
                        <span>🔑</span>
                        <span>Đáp án</span>
                      </button>

                      {isAdmin && (
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); fetchResults(exam); }} 
                          className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap active:scale-95"
                          title="Xem báo cáo kết quả thi"
                        >
                          <span>📊</span>
                          <span>Báo cáo</span>
                        </button>
                      )}
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingExam(exam); setIsEditing(true); }} 
                        className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap active:scale-95"
                        title="Chỉnh sửa đề thi"
                      >
                        <span>✏️</span>
                        <span>Sửa</span>
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => handleDeleteExam(exam, e)} 
                        className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap active:scale-95"
                        title="Xóa vĩnh viễn đề thi khỏi danh sách"
                      >
                        <span>🗑️</span>
                        <span>Xóa</span>
                      </button>
                    </>
                  )}

                  {status && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDiagnostic(exam, 'COMPETENCY');
                      }}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap active:scale-95"
                      title="Xem Phân Tích Lỗi Sai, Lỗ Hỏng Kiến Thức & Luyện Tập Bù Đắp"
                    >
                      <span>🔍</span>
                      <span>Lỗ Hổng</span>
                    </button>
                  )}

                  {!isAdmin && permission.hasTaken && !permission.canTake ? (
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDiagnostic(exam, 'PRACTICE');
                      }}
                      className="px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black shadow-sm hover:shadow transition-all active:scale-95 uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20"
                      title="Mỗi tài khoản học chỉ làm được 1 lần. Hoàn thành Luyện Tập Bù Đắp Lỗ Hổng và Đánh giá tiến độ trên 80% để làm lại đề gốc."
                    >
                      <span>🎯</span>
                      <span>{permission.isRemedialCompleted ? `BÙ ĐẮP LẠI (${permission.remedialPercent}% ≤ 80%)` : 'LUYỆN BÙ ĐẮP (>80% MỞ KHÓA)'}</span>
                      <span>🔒</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleStartExam(exam)} 
                      className={`px-3.5 sm:px-6 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold shadow-sm hover:shadow transition-all active:scale-95 uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                        !isLoggedIn && !isAdmin
                          ? 'bg-bio-700 hover:bg-bio-800 text-white'
                          : (permission.hasTaken 
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400' 
                              : 'bg-bio-700 hover:bg-bio-800 text-white')
                      }`}
                      title={!isLoggedIn && !isAdmin ? "Tài khoản học sinh cần đăng nhập thành công để vào làm bài" : undefined}
                    >
                      <span>
                        {isAdmin 
                          ? 'XEM THỬ' 
                          : (!isLoggedIn 
                              ? 'VÀO LÀM BÀI' 
                              : (permission.hasTaken ? 'LÀM LẠI ĐỀ GỐC' : 'VÀO LÀM BÀI'))}
                      </span>
                      <span>{!isLoggedIn && !isAdmin ? '🔒' : (permission.hasTaken ? '🔓' : '🚀')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Yêu Cầu Học Sinh Đăng Nhập Thành Công */}
      {showLoginPromptModal && (
        <div className="fixed inset-0 bg-black/75 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 sm:p-7 space-y-5 animate-scale-up border-2 border-emerald-500 text-center relative">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-600 flex items-center justify-center text-3xl mx-auto shadow-inner border border-amber-200">
              🔐
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-3 py-1 rounded-full border border-amber-200">
                Yêu cầu hệ thống
              </span>
              <h3 className="text-xl font-black text-gray-950 mt-2">
                Cần Đăng Nhập Để Làm Bài Thi
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 mt-2 leading-relaxed font-medium">
                Tài khoản học sinh <strong className="text-emerald-700 font-bold">cần phải đăng nhập thành công</strong> mới có thể vào làm bài kiểm tra {pendingExamToStart ? <span className="font-bold text-gray-900">"{pendingExamToStart.title}"</span> : 'này'}.
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900 text-left font-medium space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-950">
                <span>✨</span>
                <span>Vì sao cần đăng nhập trước khi làm bài?</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-800">
                <span>✓</span>
                <span>Xác thực danh tính học sinh theo danh sách lớp học</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-800">
                <span>✓</span>
                <span>Kích hoạt đồng hồ bấm giờ và hệ thống làm bài</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-800">
                <span>✓</span>
                <span>Tự động chấm điểm và lưu kết quả vào học bạ Google Sheet</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-800">
                <span>✓</span>
                <span>Nhận gợi ý và phân tích AI chẩn đoán lỗ hổng kiến thức</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowLoginPromptModal(false)}
                className="w-full sm:w-1/3 py-2.5 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLoginPromptModal(false);
                  if (onOpenLogin) {
                    onOpenLogin();
                  }
                }}
                className="w-full sm:w-2/3 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-bio-700 to-emerald-700 hover:from-bio-800 hover:to-emerald-800 shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
              >
                <span>🔑</span>
                <span>Đăng Nhập Ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cảnh Báo Quy Định Làm Bài 1 Lần & Yêu Cầu Bù Đắp > 80% */}
      {lockedExamAttemptInfo && (
        <div className="fixed inset-0 bg-black/75 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 sm:p-7 space-y-5 animate-scale-up border-2 border-amber-500 text-center relative">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-700 flex items-center justify-center text-3xl mx-auto shadow-inner border border-amber-200">
              🔒
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-3 py-1 rounded-full border border-amber-300">
                Quy Định Kiểm Tra & Đánh Giá Năng Lực
              </span>
              <h3 className="text-xl font-black text-gray-950 mt-2">
                Bài Kiểm Tra Đã Làm 1 Lần
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 mt-2 leading-relaxed font-medium">
                Mỗi bài kiểm tra, mỗi tài khoản học sinh <strong className="text-amber-800 font-bold">chỉ được làm 1 lần</strong>. Để mở khóa làm lại đề gốc, em cần hoàn thành <strong className="text-bio-800">"Luyện Tập Bù Đắp Lỗ Hổng"</strong> và kết quả <strong className="text-emerald-700 font-bold">"Đánh giá tiến độ" trên 80%</strong>.
              </p>
            </div>

            {/* Chi tiết tiến độ của học sinh */}
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 text-left font-medium space-y-2.5">
              <div className="font-bold text-amber-950 border-b border-amber-200 pb-1.5 flex items-center justify-between">
                <span className="truncate max-w-[280px]">📝 Bài: {lockedExamAttemptInfo.exam.title}</span>
                <span className="text-emerald-800 bg-white px-2 py-0.5 rounded border border-amber-200 shrink-0 font-bold">
                  Lần 1: {lockedExamAttemptInfo.permission.lastScore10 ?? 0} đ
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>🎯 Luyện tập bù đắp lỗ hổng:</span>
                <span className={`font-bold ${lockedExamAttemptInfo.permission.isRemedialCompleted ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {lockedExamAttemptInfo.permission.isRemedialCompleted ? '✓ Đã hoàn thành' : '✗ Chưa hoàn thành'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>📈 Kết quả Đánh giá tiến độ:</span>
                <span className="font-black text-sm text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-200">
                  {lockedExamAttemptInfo.permission.remedialPercent}% (Yêu cầu &gt; 80%)
                </span>
              </div>
              <p className="text-[11px] text-amber-800 italic pt-1 border-t border-amber-200/60 leading-normal">
                💡 {lockedExamAttemptInfo.permission.message}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setLockedExamAttemptInfo(null)}
                className="w-full sm:w-1/3 py-2.5 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  const examToOpen = lockedExamAttemptInfo.exam;
                  setLockedExamAttemptInfo(null);
                  handleOpenDiagnostic(examToOpen, 'PRACTICE');
                }}
                className="w-full sm:w-2/3 py-2.5 rounded-xl text-xs font-black text-white bg-bio-700 hover:bg-bio-800 shadow-md transition cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                <span>🎯</span>
                <span>Bước Vào Luyện Tập Bù Đắp Ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Phân Tích Lỗ Hỏng & Cá Nhân Hóa Học Tập Khi Mở Từ Thẻ Đề Thi */}
      {activeDiagnosticProfile && !activeExam && (
        <DiagnosticLearningCenter
          profile={activeDiagnosticProfile}
          user={user}
          onUpdateUser={onUpdateUser}
          initialTab={diagnosticInitialTab}
          onProfileUpdated={(updated) => setActiveDiagnosticProfile(updated)}
          onClose={() => setActiveDiagnosticProfile(null)}
          onRetakeExam={() => {
            const found = exams.find(e => isMatchingExamId(e.id, activeDiagnosticProfile.examId));
            if (found) {
              setActiveDiagnosticProfile(null);
              handleStartExam(found);
            }
          }}
        />
      )}

      {/* Modal Mã Nguồn Google Apps Script Hỗ Trợ Đồng Bộ Sheet 06_DE_THI */}
      <GoogleAppsScriptModal 
        isOpen={showAppsScriptModal} 
        onClose={() => setShowAppsScriptModal(false)}
        defaultTab="sheet06"
      />
    </div>
  );
};
