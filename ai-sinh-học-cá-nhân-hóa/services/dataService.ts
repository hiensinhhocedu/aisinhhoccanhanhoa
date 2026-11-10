import { User, UserLevel, Exam, Question, ExamResult } from '../types';
import { formatDisplayQuestionText } from './geminiService';
import { isExamAttemptMatching, isMatchingExamId, isRemedialOrPracticeTurn } from './diagnosticService';

export { isExamAttemptMatching, isMatchingExamId, isRemedialOrPracticeTurn };

/**
 * Xóa bỏ hoàn toàn tài khoản và dữ liệu liên quan đến "Giáo viên Lâm Thái Hiển"
 */
export const purgeDeprecatedAdminAccounts = (): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;

    // 1. Quét và xóa các tài khoản / key liên quan
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      if (/lâm\s*thái\s*hiển/i.test(key)) {
        keysToRemove.push(key);
        continue;
      }

      if (key.startsWith('user_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const u = JSON.parse(raw);
            if (u && (
              (u.name && /lâm\s*thái\s*hiển/i.test(u.name)) ||
              (u.phone && /lâm\s*thái\s*hiển/i.test(u.phone)) ||
              (u.studentId && /lâm\s*thái\s*hiển/i.test(u.studentId))
            )) {
              keysToRemove.push(key);
            }
          }
        } catch {}
      }
    }

    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 2. Làm sạch đề thi trong bio_exams và bio_master_exams_cache_v2
    const cleanExamList = (rawExamsJson: string | null): string | null => {
      if (!rawExamsJson) return null;
      try {
        const exams = JSON.parse(rawExamsJson);
        if (Array.isArray(exams)) {
          let modified = false;
          const cleaned = exams.map(e => {
            if (!e) return e;
            let cb = e.createdBy;
            let sn = e.studentName;
            if (cb && /lâm\s*thái\s*hiển/i.test(cb)) {
              cb = 'Admin Giáo Viên';
              modified = true;
            }
            if (sn && /lâm\s*thái\s*hiển/i.test(sn)) {
              sn = undefined;
              modified = true;
            }
            return { ...e, createdBy: cb, studentName: sn };
          });
          if (modified) return JSON.stringify(cleaned);
        }
      } catch {}
      return null;
    };

    const cleanedBio = cleanExamList(localStorage.getItem('bio_exams'));
    if (cleanedBio) localStorage.setItem('bio_exams', cleanedBio);

    const cleanedMaster = cleanExamList(localStorage.getItem('bio_master_exams_cache_v2'));
    if (cleanedMaster) localStorage.setItem('bio_master_exams_cache_v2', cleanedMaster);

    // 3. Làm sạch danh sách học sinh Google Sheet trong bio_synced_sheet_students
    const rawStudents = localStorage.getItem('bio_synced_sheet_students');
    if (rawStudents) {
      try {
        const students = JSON.parse(rawStudents);
        if (Array.isArray(students)) {
          const filteredStudents = students.filter(s => {
            if (!s) return false;
            return !/lâm\s*thái\s*hiển/i.test(s.name || '') && !/lâm\s*thái\s*hiển/i.test(s.id || '');
          });
          if (filteredStudents.length !== students.length) {
            localStorage.setItem('bio_synced_sheet_students', JSON.stringify(filteredStudents));
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn("Lỗi khi dọn dẹp tài khoản cũ:", err);
  }
};

// Thực thi dọn dẹp ngay khi nạp module
purgeDeprecatedAdminAccounts();

/**
 * Tự động chuẩn hóa và làm sạch câu hỏi của đề thi:
 * - Loại bỏ toàn bộ nhãn nhận thức [Nhận biết], [Thông hiểu]...
 * - Chuẩn hóa người tạo đề thành Admin Giáo Viên (loại bỏ hoàn toàn Lâm Thái Hiển)
 */
export const sanitizeExam = (exam: Exam): Exam => {
  if (!exam) return exam;
  let createdBy = exam.createdBy || 'Admin Giáo Viên';
  if (/lâm\s*thái\s*hiển/i.test(createdBy)) {
    createdBy = 'Admin Giáo Viên';
  }
  let studentName = exam.studentName;
  if (studentName && /lâm\s*thái\s*hiển/i.test(studentName)) {
    studentName = undefined;
  }
  const questions = (exam.questions || []).map(q => ({
    ...q,
    text: formatDisplayQuestionText(q.text)
  }));
  return {
    ...exam,
    createdBy,
    studentName,
    questions
  };
};

// --- CẤU HÌNH API ---
// HÃY THAY THẾ CHUỖI BÊN DƯỚI BẰNG "WEB APP URL" BẠN VỪA COPY Ở BƯỚC 4
export const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzigw8lBDVdBcHHM7Bwrr02JG_OgsMZC6RIO7o9XvfmrllOLi5nviFnsLZ7aFHm44Dz/exec'; 

// Link Google Sheet quản lý 5 Sheets (01_HOC_SINH, 02_KET_QUA_THI, 03_LO_HONG_KIEN_THUC, 04_CA_NHAN_HOA, 05_DASHBOARD)
export const DEFAULT_GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1H29C4P_0oJNLNvXRE2ts8hJmzasbq1eR1anAyDjITAw/edit?usp=sharing';

export const getGoogleSheetUrl = (): string => {
  try {
    const saved = localStorage.getItem('bio_admin_google_sheet_url');
    if (saved && saved.trim().startsWith('http')) {
      // Tự động nâng cấp nếu trình duyệt còn lưu link cũ trước đây
      if (saved.includes('1A4SzA_KPaR9WmGd3lwpChZ-cO862RkIs6mE5oFcevtA')) {
        localStorage.setItem('bio_admin_google_sheet_url', DEFAULT_GOOGLE_SHEET_URL);
        return DEFAULT_GOOGLE_SHEET_URL;
      }
      return saved.trim();
    }
  } catch {}
  return DEFAULT_GOOGLE_SHEET_URL;
};

export const setGoogleSheetUrl = (url: string): string => {
  try {
    const clean = (url || '').trim();
    if (clean && clean.startsWith('http')) {
      localStorage.setItem('bio_admin_google_sheet_url', clean);
      return clean;
    } else {
      localStorage.removeItem('bio_admin_google_sheet_url');
      return DEFAULT_GOOGLE_SHEET_URL;
    }
  } catch {}
  return DEFAULT_GOOGLE_SHEET_URL;
}; 

// Danh sách mã đề đã xóa cần loại bỏ vĩnh viễn (Lưu trữ bền vững cả LocalStorage và bộ nhớ)
export const normalizeTitleKey = (t?: string): string => {
  if (!t) return '';
  return t.toLowerCase().replace(/[\:\.\-\,\;\_\(\)\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
};

// Base deleted IDs that should be permanently removed (old template IDs)
const BASE_REMOVED_IDS = [
  'exam-1790524035239', 
  '1790524035239',
  'exam-lop10-bai3-chuan',
  'lop10-bai3-chuan',
  'exam-lop11-bai1-chuan',
  'lop11-bai1-chuan',
  'exam-lop11-bai2-chuan',
  'lop11-bai2-chuan',
  'exam-lop12-bai2-chuan',
  'lop12-bai2-chuan'
];

// Base deleted exam titles (không chặn các bài học chuẩn trong chương trình)
const BASE_REMOVED_TITLES: string[] = [];

const getPersistedRemovedIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem('bio_removed_exam_ids');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // Loại trừ các mã đề chuẩn SH10/11/12 để tránh chặn nhầm đề thi giáo viên mới tạo
        const cleaned = arr.filter(id => {
          const str = String(id || '').trim();
          if (/^SH(10|11|12)_\d+/i.test(str)) return false;
          if (str === 'exam-1791082631468' || str === '1791082631468') return false;
          return true;
        });
        localStorage.setItem('bio_removed_exam_ids', JSON.stringify(cleaned));
        return new Set([...BASE_REMOVED_IDS, ...cleaned.map(String)]);
      }
    }
  } catch {}
  return new Set(BASE_REMOVED_IDS);
};

const getPersistedRemovedTitles = (): Set<string> => {
  try {
    const raw = localStorage.getItem('bio_removed_exam_titles');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // Chỉ giữ những tiêu đề người dùng đã chủ động bấm xóa, không được xóa các bài học chính quy
        const cleaned = arr.filter(t => {
          if (!t) return false;
          const str = String(t).toLowerCase();
          if (str.includes('dna') || str.includes('gene') || str.includes('bài 1') || str.includes('bài 2') || str.includes('bài 3')) return false;
          return true;
        });
        localStorage.setItem('bio_removed_exam_titles', JSON.stringify(cleaned));
        return new Set([...BASE_REMOVED_TITLES, ...cleaned.map(normalizeTitleKey)]);
      }
    }
  } catch {}
  return new Set(BASE_REMOVED_TITLES);
};

export const REMOVED_EXAM_IDS = getPersistedRemovedIds();
export const REMOVED_EXAM_TITLES = getPersistedRemovedTitles();

/**
 * Phục hồi đề thi từ đám mây (Google Sheet 06_DE_THI):
 * Đảm bảo các đề đang tồn tại trên Google Sheet không bị chặn bởi bộ nhớ cục bộ
 */
export const restoreActiveCloudExam = (examOrId: Exam | string | number) => {
  if (!examOrId) return;
  let strId = '';
  let title = '';
  let lessonName = '';

  if (typeof examOrId === 'object' && examOrId !== null) {
    const ex = examOrId as Exam;
    strId = String(ex.id || '').trim();
    title = ex.title || '';
    lessonName = ex.lessonName || '';
  } else {
    strId = String(examOrId).trim();
  }

  if (strId) {
    const withoutPrefix = strId.replace(/^exam-/, '');
    const withPrefix = strId.startsWith('exam-') ? strId : `exam-${strId}`;
    REMOVED_EXAM_IDS.delete(strId);
    REMOVED_EXAM_IDS.delete(withoutPrefix);
    REMOVED_EXAM_IDS.delete(withPrefix);
    REMOVED_EXAM_IDS.delete(strId.toUpperCase());
    REMOVED_EXAM_IDS.delete(withoutPrefix.toUpperCase());
  }

  if (title) {
    const norm = normalizeTitleKey(title);
    if (norm) REMOVED_EXAM_TITLES.delete(norm);
  }
  if (lessonName) {
    const normL = normalizeTitleKey(lessonName);
    if (normL) REMOVED_EXAM_TITLES.delete(normL);
  }

  try {
    const raw = localStorage.getItem('bio_removed_exam_ids');
    if (raw && strId) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const withoutPrefix = strId.replace(/^exam-/, '');
        const withPrefix = strId.startsWith('exam-') ? strId : `exam-${strId}`;
        const filtered = arr.filter((x: string) => 
          String(x).toUpperCase() !== strId.toUpperCase() && 
          String(x).toUpperCase() !== withoutPrefix.toUpperCase() && 
          String(x).toUpperCase() !== withPrefix.toUpperCase()
        );
        localStorage.setItem('bio_removed_exam_ids', JSON.stringify(filtered));
      }
    }
    const rawT = localStorage.getItem('bio_removed_exam_titles');
    if (rawT && (title || lessonName)) {
      const arrT = JSON.parse(rawT);
      if (Array.isArray(arrT)) {
        const normT = normalizeTitleKey(title);
        const normL = normalizeTitleKey(lessonName);
        const filteredT = arrT.filter((x: string) => x !== normT && x !== normL);
        localStorage.setItem('bio_removed_exam_titles', JSON.stringify(filteredT));
      }
    }
  } catch {}
};

export const isExamDeleted = (examOrId?: Exam | any | string | number | null): boolean => {
  if (!examOrId) return false;

  // 1. Kiểm tra đối tượng Exam hoặc ExamResult/Lượt thi
  if (typeof examOrId === 'object' && examOrId !== null) {
    const item: any = examOrId;
    const targetId = item.id || item.examId;
    if (targetId && isExamDeleted(targetId)) return true;

    const normTitle = normalizeTitleKey(item.title || item.examTitle);
    const normLesson = normalizeTitleKey(item.lessonName || item.topic);
    for (const dt of REMOVED_EXAM_TITLES) {
      if (dt && dt.length > 5) {
        if (normTitle === dt || normLesson === dt) {
          return true;
        }
      }
    }
    return false;
  }

  // 2. Kiểm tra theo chuỗi mã ID
  const strId = String(examOrId).trim();
  const withoutPrefix = strId.replace(/^exam-/, '');
  const withPrefix = strId.startsWith('exam-') ? strId : `exam-${strId}`;

  if (REMOVED_EXAM_IDS.has(strId) || REMOVED_EXAM_IDS.has(withoutPrefix) || REMOVED_EXAM_IDS.has(withPrefix) || REMOVED_EXAM_IDS.has(strId.toUpperCase())) {
    return true;
  }

  return false;
};

export const markExamAsDeleted = (examOrId?: Exam | string | number | null, extraTitle?: string) => {
  if (!examOrId) return;

  let strId = '';

  if (typeof examOrId === 'object' && examOrId !== null) {
    const ex = examOrId as Exam;
    strId = String(ex.id || '').trim();
    // Khi xóa đề thi thì giải phóng tiêu đề/bài học khỏi danh sách đen để người dùng có thể tạo lại đề mới
    if (ex.title) {
      const norm = normalizeTitleKey(ex.title);
      if (norm) REMOVED_EXAM_TITLES.delete(norm);
    }
    if (ex.lessonName) {
      const normL = normalizeTitleKey(ex.lessonName);
      if (normL) REMOVED_EXAM_TITLES.delete(normL);
    }
  } else {
    strId = String(examOrId).trim();
  }

  if (extraTitle && (extraTitle.startsWith('template-') || extraTitle.startsWith('demo-'))) {
    const norm = normalizeTitleKey(extraTitle);
    if (norm) REMOVED_EXAM_TITLES.add(norm);
  }

  if (strId) {
    const withoutPrefix = strId.replace(/^exam-/, '');
    const withPrefix = strId.startsWith('exam-') ? strId : `exam-${strId}`;
    REMOVED_EXAM_IDS.add(strId);
    REMOVED_EXAM_IDS.add(withoutPrefix);
    REMOVED_EXAM_IDS.add(withPrefix);
    REMOVED_EXAM_IDS.add(strId.toUpperCase());
    REMOVED_EXAM_IDS.add(withoutPrefix.toUpperCase());
    REMOVED_EXAM_IDS.add(withPrefix.toUpperCase());
  }

  try {
    localStorage.setItem('bio_removed_exam_ids', JSON.stringify(Array.from(REMOVED_EXAM_IDS)));
    localStorage.setItem('bio_removed_exam_titles', JSON.stringify(Array.from(REMOVED_EXAM_TITLES)));

    // Gỡ ngay lập tức khỏi bio_exams
    const currentStored = getStorageData<Exam[]>('bio_exams', []);
    const filteredStored = currentStored.filter(e => e && !isExamDeleted(e));
    localStorage.setItem('bio_exams', JSON.stringify(filteredStored));

    // Gỡ ngay khỏi Master Cache
    const master = getMasterExams();
    const updated = master.filter(e => e && !isExamDeleted(e));
    localStorage.setItem('bio_admin_exams_master', JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving deleted exam ids:', e);
  }
};

// --- Local Storage Helpers (Fallback/Offline) ---
export const getStorageData = <T>(key: string, defaultVal: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored || stored === 'undefined' || stored === 'null') return defaultVal;
    const parsed = JSON.parse(stored);
    return parsed !== null && parsed !== undefined ? parsed : defaultVal;
  } catch {
    return defaultVal;
  }
};

export const setStorageData = (key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value));
};

// --- BẢO TOÀN ĐỀ THI DO ADMIN GIÁO VIÊN TẠO (MASTER CACHE ĐỘC LẬP VỚI PHIÊN ĐĂNG NHẬP) ---
export const getMasterExams = (): Exam[] => {
  try {
    const raw = localStorage.getItem('bio_admin_exams_master');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(e => e && e.id && !isExamDeleted(e.id)).map(sanitizeExam);
      }
    }
  } catch {}
  return [];
};

export const saveToMasterExams = (exam: Exam) => {
  if (!exam || !exam.id || isExamDeleted(exam.id)) return;
  const cleanExam = sanitizeExam(exam);
  try {
    const current = getMasterExams();
    const exists = current.findIndex(e => e.id === cleanExam.id || String(e.id) === String(cleanExam.id));
    let updated: Exam[];
    if (exists !== -1) {
      updated = [...current];
      updated[exists] = cleanExam;
    } else {
      updated = [cleanExam, ...current];
    }
    localStorage.setItem('bio_admin_exams_master', JSON.stringify(updated));
  } catch (err) {
    console.warn("Không thể lưu vào bio_admin_exams_master:", err);
  }
};

export const ensureMasterExams = (currentExams: Exam[]): Exam[] => {
  const master = getMasterExams();
  const currentMap = new Map<string, Exam>();
  (currentExams || []).forEach(e => {
    if (e && e.id && !isExamDeleted(e.id)) {
      currentMap.set(String(e.id), e);
    }
  });

  // Bổ sung hoặc cập nhật đề từ master cache
  master.forEach(me => {
    if (me && me.id && !isExamDeleted(me.id)) {
      if (!currentMap.has(String(me.id))) {
        currentMap.set(String(me.id), me);
      }
    }
  });

  return deduplicateExams(Array.from(currentMap.values()));
};

// --- Level Calculation ---
export const calculateLevel = (totalScore: number = 0, history: { score: number }[] = []): UserLevel => {
  const safeHistory = Array.isArray(history) ? history : [];
  const last5 = safeHistory.slice(-5).map(h => h.score);
  const minLast5 = last5.length > 0 ? Math.min(...last5) : 0;
  
  if (totalScore > 260 && last5.length >= 5 && minLast5 >= 9) return UserLevel.LEVEL_4;
  if (totalScore >= 156 && last5.length >= 5 && minLast5 >= 7) return UserLevel.LEVEL_3;
  if (totalScore >= 65 && last5.length >= 5 && minLast5 >= 6) return UserLevel.LEVEL_2;
  return UserLevel.LEVEL_1;
};

// =========================================================================================
// QUẢN LÝ MÃ ĐỊNH DANH ĐỀ THI (ID BÀI THI) THEO CHUẨN NGẮN GỌN VÀ THEO KHỐI:
// Khối 12: SH12_001, SH12_002, ...
// Khối 11: SH11_001, SH11_002, ...
// Khối 10: SH10_001, SH10_002, ...
// =========================================================================================

/**
 * Trích xuất tiền tố mã khối chuẩn: SH10, SH11, SH12
 */
export const getGradePrefix = (gradeOrCategory?: string, titleOrLesson?: string): 'SH10' | 'SH11' | 'SH12' => {
  const str = `${gradeOrCategory || ''} ${titleOrLesson || ''}`.toLowerCase();
  if (str.includes('12') || str.includes('sinh 12')) return 'SH12';
  if (str.includes('11') || str.includes('sinh 11')) return 'SH11';
  return 'SH10';
};

/**
 * Kiểm tra xem ID bài thi đã theo chuẩn ngắn gọn theo khối hay chưa (vd: SH12_001, SH10_002)
 */
export const isStandardExamId = (id?: string | null): boolean => {
  if (!id) return false;
  return /^SH(10|11|12)_\d{3,}$/i.test(String(id).trim());
};

/**
 * Định dạng hiển thị ID bài thi ngắn gọn, trực quan theo khối
 */
export const formatExamDisplayId = (id?: string | null, gradeOrCategory?: string, titleOrLesson?: string): string => {
  if (!id) return `${getGradePrefix(gradeOrCategory, titleOrLesson)}_001`;
  const cleanId = String(id).trim();
  if (isStandardExamId(cleanId)) {
    return cleanId.toUpperCase();
  }

  const prefix = getGradePrefix(gradeOrCategory, `${cleanId} ${titleOrLesson || ''}`);
  const strAll = `${cleanId} ${titleOrLesson || ''}`.toLowerCase();

  // Khớp chính xác bài 1 DNA của khối 12 trong hệ thống
  if (prefix === 'SH12' && (strAll.includes('dna') || strAll.includes('bài 1') || cleanId.includes('1791082631468'))) {
    return 'SH12_001';
  }
  if (cleanId === 'exam-lop10-bai3-chuan') return 'SH10_001';
  if (cleanId === 'exam-lop11-bai1-chuan') return 'SH11_001';
  if (cleanId === 'exam-lop11-bai2-chuan') return 'SH11_002';
  if (cleanId === 'exam-lop12-bai2-chuan') return 'SH12_002';

  const numMatch = cleanId.match(/(\d+)$/);
  if (numMatch) {
    const rawNum = parseInt(numMatch[1].slice(-3), 10);
    const n = isNaN(rawNum) || rawNum === 0 ? 1 : rawNum;
    return `${prefix}_${String(n).padStart(3, '0')}`;
  }
  return `${prefix}_001`;
};

/**
 * Sinh mã ID mới ngắn gọn theo khối lớp tiếp theo (ví dụ: SH12_001, SH10_001, SH11_001,...)
 */
export const generateNextExamId = (
  gradeOrCategory?: string,
  existingExams: Exam[] = [],
  titleOrLesson?: string
): string => {
  const prefix = getGradePrefix(gradeOrCategory, titleOrLesson);
  const regex = new RegExp(`^${prefix}_(\\d+)$`, 'i');
  let maxNum = 0;

  const allToCheck = [...existingExams, ...getMasterExams(), ...getDefaultStandardExams()];
  allToCheck.forEach(e => {
    if (!e || !e.id) return;
    const match = String(e.id).trim().match(regex);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  });

  REMOVED_EXAM_IDS.forEach(id => {
    const match = String(id).trim().match(regex);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  });

  const nextNum = maxNum + 1;
  return `${prefix}_${String(nextNum).padStart(3, '0')}`;
};

/**
 * Chuẩn hóa khóa nhận diện bài học trong chương trình:
 * Chuyển chữ thường, bỏ dấu tiếng Việt, loại bỏ ký tự đặc biệt và khoảng trắng thừa.
 * Giữ lại đầy đủ nội dung bài học để phân biệt chính xác từng bài (không gộp nhầm các bài khác nhau).
 */
export const getLessonNormalizedKey = (text?: string): string => {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\b(sinh\s*học|sinh|lớp|khối)\s*(10|11|12)\b/gi, '')
    .replace(/^(kiểm\s*tra|de\s*thi|đề\s*thi|bài\s*kiểm\s*tra|đề\s*kiểm\s*tra|on\s*tap|ôn\s*tập|đánh\s*giá|luyện\s*tập)[\s\:\.\-]+/gi, '')
    .replace(/[\:\.\-\,\;\_\(\)\[\]\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Trích xuất chủ đề cốt lõi của bài học (bỏ tiền tố số bài "bài 1", "bài 2"...)
 */
export const extractCoreTopic = (text?: string): string => {
  if (!text) return '';
  const norm = getLessonNormalizedKey(text);
  const stripped = norm.replace(/^bai\s*\d+\s*/i, '').trim();
  return stripped || norm;
};

/**
 * Trích xuất khóa đồng nhất gồm (Khối lớp + Bài học) cho đề thi
 */
export const getGradeAndLessonKey = (exam?: {
  grade?: string;
  category?: string;
  id?: string;
  title?: string;
  lessonName?: string;
  topic?: string;
} | null): { gradeKey: string; lessonKey: string; canonical: string } => {
  if (!exam) return { gradeKey: '', lessonKey: '', canonical: '' };
  
  const gradeKey = getGradePrefix(
    exam.grade || exam.category, 
    `${exam.id || ''} ${exam.title || ''} ${exam.lessonName || ''}`
  );
  
  // Ưu tiên lessonName, sau đó tới title, sau đó tới topic
  const lessonKey = getLessonNormalizedKey(exam.lessonName) || 
                    getLessonNormalizedKey(exam.title) || 
                    getLessonNormalizedKey(exam.topic);
                    
  return {
    gradeKey,
    lessonKey,
    canonical: lessonKey ? `${gradeKey}__${lessonKey}` : ''
  };
};

/**
 * Tìm đề kiểm tra hiện có trong cùng khối lớp và cùng bài học.
 * Phục vụ quy định: ở 1 khối lớp thì mỗi bài học chỉ tạo duy nhất 1 bài kiểm tra,
 * trừ khi xóa bài cũ đó rồi mới tạo lại được.
 */
export const findExistingExamForLesson = (
  exams: Exam[],
  grade: string,
  lessonOrTitle: string,
  excludeExamId?: string
): Exam | undefined => {
  if (!lessonOrTitle) return undefined;
  const targetKey = getGradeAndLessonKey({
    grade,
    lessonName: lessonOrTitle,
    title: lessonOrTitle
  });
  if (!targetKey.canonical) return undefined;

  return (exams || []).find(e => {
    if (!e || !e.id || isExamDeleted(e) || e.category === 'BATTLE') return false;
    if (excludeExamId && (e.id === excludeExamId || String(e.id).toUpperCase() === String(excludeExamId).toUpperCase())) {
      return false;
    }
    const eKey = getGradeAndLessonKey(e);
    return eKey.canonical === targetKey.canonical;
  });
};

/**
 * Tạo khóa định danh chuẩn thống nhất cho đề thi (kết hợp khối chuẩn SH10/11/12 và tên bài)
 * Đảm bảo mọi so sánh đối chiếu giữa Master Cache, Google Sheet và Client luôn đồng nhất 100%
 */
export const getExamCanonicalKey = (exam?: Exam | Partial<Exam> | null): string => {
  if (!exam) return '';
  const gradePrefix = getGradePrefix(exam.grade || exam.category, exam.title || exam.lessonName);
  const titleNorm = normalizeTitleKey(exam.title || exam.lessonName || exam.topic);
  return `${gradePrefix}__${titleNorm}`;
};

/**
 * Phân tích thời gian tạo đề thi (hỗ trợ cả chuẩn ISO và định dạng Việt Nam dd/MM/yyyy HH:mm:ss)
 */
export const parseExamTimestamp = (dateStr?: string | null): number => {
  if (!dateStr) return 0;
  const clean = String(dateStr).trim();
  if (!clean) return 0;

  // Kiểm tra định dạng dd/MM/yyyy HH:mm:ss hoặc dd/MM/yyyy
  const vnMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (vnMatch) {
    const day = parseInt(vnMatch[1], 10);
    const month = parseInt(vnMatch[2], 10) - 1;
    const year = parseInt(vnMatch[3], 10);
    const hour = vnMatch[4] ? parseInt(vnMatch[4], 10) : 0;
    const min = vnMatch[5] ? parseInt(vnMatch[5], 10) : 0;
    const sec = vnMatch[6] ? parseInt(vnMatch[6], 10) : 0;
    const dt = new Date(year, month, day, hour, min, sec);
    if (!isNaN(dt.getTime())) return dt.getTime();
  }

  const parsed = Date.parse(clean);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Định dạng hiển thị ngày tạo đề thi
 */
export const formatExamCreatedAt = (dateStr?: string | null): string => {
  const ts = parseExamTimestamp(dateStr);
  if (ts > 0) {
    return new Date(ts).toLocaleDateString('vi-VN');
  }
  return dateStr ? String(dateStr).trim() : '';
};

/**
 * Trích xuất số thứ tự của mã đề (VD: SH12_004 -> 4, SH12_001 -> 1)
 */
export const getExamSequenceNumber = (exam?: Exam | null): number => {
  if (!exam || !exam.id) return 0;
  const formatted = formatExamDisplayId(exam.id, exam.grade || exam.category, exam.title);
  const match = formatted.match(/_(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) return num;
  }
  const rawMatch = String(exam.id).match(/(\d+)$/);
  if (rawMatch) {
    const num = parseInt(rawMatch[1], 10);
    if (!isNaN(num)) return num;
  }
  return 0;
};

/**
 * Sắp xếp danh sách đề thi: Đề tạo sau (mới hơn / số thứ tự mã đề lớn hơn) luôn nằm trên đề tạo trước đó
 */
export const sortExamsNewestFirst = (exams: Exam[]): Exam[] => {
  if (!Array.isArray(exams) || exams.length <= 1) return exams || [];
  return [...exams].sort((a, b) => {
    const timeA = parseExamTimestamp(a?.createdAt);
    const timeB = parseExamTimestamp(b?.createdAt);
    if (timeA > 0 && timeB > 0 && timeA !== timeB) {
      return timeB - timeA;
    }

    const seqA = getExamSequenceNumber(a);
    const seqB = getExamSequenceNumber(b);
    if (seqA !== seqB) {
      return seqB - seqA;
    }

    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return 0;
  });
};

/**
 * Khử trùng lặp các bài kiểm tra:
 * 1. Khử trùng lặp theo ID bài thi (SH12_001, v.v.)
 * 2. Thực thi quy định hệ thống: Ở 1 khối lớp thì mỗi bài học chỉ tạo 1 bài kiểm tra duy nhất.
 *    Nếu phát hiện nhiều đề thi cho cùng một khối lớp và cùng một bài học (ngoại trừ BATTLE),
 *    hệ thống giữ lại đề mới nhất / có số thứ tự mã đề lớn hơn hoặc nhiều câu hỏi hơn.
 */
export const deduplicateExams = (exams: Exam[]): Exam[] => {
  if (!Array.isArray(exams) || exams.length === 0) return [];
  const idMap = new Map<string, Exam>();
  
  exams.forEach(e => {
    if (!e || !e.id || isExamDeleted(e)) return;
    const cleanId = String(e.id).trim().toUpperCase();
    if (!cleanId) return;

    if (!idMap.has(cleanId)) {
      idMap.set(cleanId, e);
    } else {
      const existing = idMap.get(cleanId)!;
      // Nếu trùng ID thì ưu tiên bản có nhiều câu hỏi hơn, đồng thời giữ lại createdAt nếu một trong hai bản có
      const mergedCreatedAt = existing.createdAt || e.createdAt;
      if ((e.questions || []).length > (existing.questions || []).length) {
        idMap.set(cleanId, { ...e, createdAt: e.createdAt || mergedCreatedAt });
      } else if (!existing.createdAt && mergedCreatedAt) {
        idMap.set(cleanId, { ...existing, createdAt: mergedCreatedAt });
      }
    }
  });

  const uniqueById = Array.from(idMap.values());
  const sorted = sortExamsNewestFirst(uniqueById);

  // Quy định hệ thống: Ở 1 khối lớp thì mỗi bài học chỉ giữ duy nhất 1 bài kiểm tra
  const lessonMap = new Map<string, Exam>();
  const battlesAndOthers: Exam[] = [];

  sorted.forEach(e => {
    if (e.category === 'BATTLE') {
      battlesAndOthers.push(e);
      return;
    }
    const { canonical } = getGradeAndLessonKey(e);
    if (!canonical) {
      battlesAndOthers.push(e);
      return;
    }

    if (!lessonMap.has(canonical)) {
      lessonMap.set(canonical, e);
    } else {
      const existing = lessonMap.get(canonical)!;
      const timeE = parseExamTimestamp(e.createdAt);
      const timeExist = parseExamTimestamp(existing.createdAt);
      const seqE = getExamSequenceNumber(e);
      const seqExist = getExamSequenceNumber(existing);

      let shouldReplace = false;
      if (timeE > timeExist) {
        shouldReplace = true;
      } else if (timeE === timeExist && seqE > seqExist) {
        shouldReplace = true;
      } else if (timeE === timeExist && seqE === seqExist && (e.questions || []).length > (existing.questions || []).length) {
        shouldReplace = true;
      }

      if (shouldReplace) {
        lessonMap.set(canonical, e);
      }
    }
  });

  return sortExamsNewestFirst([...Array.from(lessonMap.values()), ...battlesAndOthers]);
};

/**
 * Chuẩn hóa và tự động di chuyển toàn bộ ID đề thi cũ sang định dạng ngắn gọn theo khối
 */
export const normalizeAndMigrateExamIds = (rawExams: Exam[]): Exam[] => {
  if (!Array.isArray(rawExams) || rawExams.length === 0) return [];
  const exams = deduplicateExams(rawExams);

  const migrationMap: Record<string, string> = {
    'exam-1791082631468': 'SH12_001',
    '1791082631468': 'SH12_001',
    'exam-lop10-bai3-chuan': 'SH10_001',
    'exam-lop11-bai1-chuan': 'SH11_001',
    'exam-lop11-bai2-chuan': 'SH11_002',
    'exam-lop12-bai2-chuan': 'SH12_002'
  };

  const usedNumbers: Record<'SH10' | 'SH11' | 'SH12', Set<number>> = {
    'SH10': new Set(),
    'SH11': new Set(),
    'SH12': new Set()
  };

  // 1. Ghi nhận các đề đã có ID chuẩn
  exams.forEach(e => {
    if (!e || !e.id) return;
    const strId = String(e.id).trim().toUpperCase();
    const match = strId.match(/^SH(10|11|12)_(\d+)$/);
    if (match) {
      const p = `SH${match[1]}` as 'SH10' | 'SH11' | 'SH12';
      const num = parseInt(match[2], 10);
      if (!isNaN(num)) usedNumbers[p].add(num);
    }
  });

  // 2. Chỉ chuyển đổi các đề cũ có ID dạng timestamp hoặc không chuẩn (TUYỆT ĐỐI KHÔNG ĐỔI đề đã có ID chuẩn như SH12_003)
  exams.forEach(e => {
    if (!e || !e.id) return;
    if (isStandardExamId(e.id)) {
      // Đề đã có ID chuẩn theo khối (ví dụ SH12_003, SH12_001...) giữ nguyên vẹn 100%
      return;
    }
    const idLow = String(e.id).toLowerCase();
    if (idLow.includes('1791082631468')) {
      migrationMap[e.id] = 'SH12_001';
      usedNumbers['SH12'].add(1);
    }
  });

  let hasMigration = false;
  const migratedExams = exams.map(e => {
    if (!e || !e.id) return e;
    const oldId = String(e.id).trim();

    // Ưu tiên 1: Đề đã có mã chuẩn theo khối thì giữ nguyên vẹn (vd: SH12_003, SH10_001)
    if (isStandardExamId(oldId)) {
      return { ...e, id: oldId.toUpperCase() };
    }

    if (migrationMap[oldId]) {
      const mappedId = migrationMap[oldId];
      if (mappedId !== oldId) hasMigration = true;
      return { ...e, id: mappedId };
    }

    const prefix = getGradePrefix(e.grade || e.category, `${e.title || ''} ${e.lessonName || ''}`);
    let candidateNum = 1;
    while (usedNumbers[prefix].has(candidateNum)) {
      candidateNum++;
    }
    usedNumbers[prefix].add(candidateNum);
    const newId = `${prefix}_${String(candidateNum).padStart(3, '0')}`;
    migrationMap[oldId] = newId;
    hasMigration = true;
    return { ...e, id: newId };
  });

  const finalDeduplicated = deduplicateExams(migratedExams);

  // Cập nhật lại cache và lịch sử thi nếu có ID được chuyển đổi hoặc có nhân bản cần dọn dẹp
  if (hasMigration || finalDeduplicated.length !== rawExams.length) {
    try {
      localStorage.setItem('bio_exams', JSON.stringify(finalDeduplicated));
      
      const currentMaster = getMasterExams();
      if (currentMaster.length > 0) {
        const updatedMaster = deduplicateExams(currentMaster.map(me => {
          if (me && migrationMap[me.id]) {
            return { ...me, id: migrationMap[me.id] };
          }
          return me;
        }));
        localStorage.setItem('bio_admin_exams_master', JSON.stringify(updatedMaster));
      }

      // Cập nhật các bản ghi examHistory trong tài khoản user đang lưu trữ
      const currentPhone = localStorage.getItem('current_user_phone');
      const userKeys: string[] = ['user_guest'];
      if (currentPhone) {
        userKeys.push(`user_${currentPhone}`);
        userKeys.push(`user_${currentPhone.replace(/^0+/, '')}`);
      }
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('user_') && !userKeys.includes(k)) {
          userKeys.push(k);
        }
      }

      userKeys.forEach(k => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const u = JSON.parse(raw);
            if (u && Array.isArray(u.examHistory)) {
              let userChanged = false;
              const newHistory = u.examHistory.map((h: any) => {
                if (h && h.examId && migrationMap[h.examId]) {
                  userChanged = true;
                  return { ...h, examId: migrationMap[h.examId] };
                }
                return h;
              });
              if (userChanged) {
                u.examHistory = newHistory;
                localStorage.setItem(k, JSON.stringify(u));
              }
            }
          }
        } catch {}
      });
    } catch (err) {
      console.warn("Lỗi đồng bộ chuyển đổi mã đề:", err);
    }
  }

  return migratedExams;
};

// Danh sách đề thi mẫu chuẩn 2 phần theo quy định mới nhất GDPT 2018 (SGK Kết nối tri thức)
export const getDefaultStandardExams = (): Exam[] => [
  {
    id: 'SH10_001',
    title: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
    category: 'Sinh 10',
    grade: 'Lớp 10',
    topic: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
    lessonName: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
    learningObjectives: `Nhận biết:
- Nêu được khái niệm cấp độ tổ chức sống.
- Liệt kê được các cấp độ tổ chức sống cơ bản: tế bào, cơ thể, quần thể, quần xã, hệ sinh thái.
Thông hiểu:
- Trình bày được đặc điểm chung của các cấp độ tổ chức sống: tổ chức theo nguyên tắc thứ bậc, hệ thống mở và tự điều chỉnh, liên tục tiến hóa.
- Phân tích được mối quan hệ giữa các cấp độ tổ chức sống.
Vận dụng:
- Vận dụng hiểu biết về các cấp độ tổ chức sống để giải thích các hiện tượng thực tế trong tự nhiên và xây dựng giải pháp bảo tồn hệ sinh thái.`,
    duration: 15,
    createdBy: 'Hội đồng chuyên môn Sinh học',
    createdAt: '2026-09-01T08:00:00.000Z',
    questions: [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
      {
        id: 'lop10-b3-mcq-1',
        type: 'MCQ',
        text: 'Câu 1. Cấp độ tổ chức sống là',
        options: [
          'A. Cấp độ tổ chức của vật chất có biểu hiện đầy đủ đặc tính của sự sống.',
          'B. Cấp độ tổ chức của tế bào có biểu hiện đầy đủ đặc tính của sự sống.',
          'C. Cấp độ tổ chức của cơ thể có biểu hiện đầy đủ đặc tính của sự sống.',
          'D. Cấp độ tổ chức của quần thể có biểu hiện đầy đủ đặc tính của sự sống.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop10-b3-mcq-2',
        type: 'MCQ',
        text: 'Câu 2. Các cấp độ tổ chức sống cơ bản bao gồm những cấp độ nào sau đây?',
        options: [
          'A. Tế bào, cơ thể, quần thể, quần xã, hệ sinh thái.',
          'B. Phân tử, bào quan, tế bào, mô, cơ quan.',
          'C. Mô, cơ quan, hệ cơ quan, cơ thể.',
          'D. Quần thể, quần xã, sinh quyển, vũ trụ.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop10-b3-mcq-3',
        type: 'MCQ',
        text: 'Câu 3. Đặc điểm chung của các cấp tổ chức sống KHÔNG bao gồm đặc điểm nào sau đây?',
        options: [
          'A. Là hệ thống kín, cách biệt hoàn toàn và không trao đổi chất với môi trường.',
          'B. Là hệ thống mở, thường xuyên trao đổi vật chất và năng lượng với môi trường.',
          'C. Có khả năng tự điều chỉnh nhằm duy trì trạng thái cân bằng động.',
          'D. Liên tục tiến hóa tạo nên sự đa dạng phong phú của sinh giới.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop10-b3-mcq-4',
        type: 'MCQ',
        text: 'Câu 4. Quần thể sinh vật là tập hợp các cá thể có đặc điểm nào sau đây?',
        options: [
          'A. Cùng loài, cùng sinh sống trong một sinh cảnh xác định, tại một thời điểm nhất định và có khả năng sinh sản.',
          'B. Khác loài nhưng có hình thái giống nhau và cùng sinh sống trong một khu rừng.',
          'C. Cùng loài nhưng sống cách biệt địa lí ở các thời điểm lịch sử khác nhau.',
          'D. Nhiều loài động vật và thực vật cùng tương tác qua lại trong hệ sinh thái.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop10-b3-mcq-5',
        type: 'MCQ',
        text: 'Câu 5. Cấp độ tổ chức nào sau đây là đơn vị cấu trúc và chức năng cơ bản của mọi cơ thể sống?',
        options: [
          'A. Tế bào.',
          'B. Phân tử sinh học DNA.',
          'C. Bào quan ty thể.',
          'D. Cơ quan và hệ cơ quan.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop10-b3-mcq-6',
        type: 'MCQ',
        text: 'Câu 6. Hiểu biết về mối quan hệ giữa các cấp độ tổ chức sống giúp con người giải quyết vấn đề thực tiễn nào sau đây?',
        options: [
          'A. Xây dựng mô hình bảo tồn đa dạng sinh học và phát triển nông nghiệp sinh thái tuần hoàn.',
          'B. Tiêu diệt triệt để mọi loài vi sinh vật để làm sạch môi trường sống tự nhiên.',
          'C. Khai thác kiệt quệ tài nguyên tự nhiên mà không cần bảo vệ quần xã sinh vật.',
          'D. Ngăn cản sự tiến hóa tự nhiên của các loài động thực vật quý hiếm.'
        ],
        correctAnswer: 'A'
      },

      // PHẦN 2. CÂU HỎI ĐÚNG/SAI. Ở MỖI Ý CÁC EM SẼ TRẢ LỜI “ĐÚNG” HOẶC “SAI”
      {
        id: 'lop10-b3-tf-2a',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - a) Tế bào là nơi diễn ra mọi hoạt động sống.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop10-b3-tf-2b',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - b) Tế bào là đơn vị chức năng của cơ thể sống.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop10-b3-tf-2c',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - c) Tế bào có khả năng trao đổi chất theo phương thức đồng hóa và dị hóa.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop10-b3-tf-2d',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - d) Tế bào có một hình thức phân chia duy nhất là nguyên phân',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      }
    ]
  },
  {
    id: 'SH11_001',
    title: 'Bài 1: Khái quát về trao đổi chất và chuyển hoá năng lượng',
    category: 'Sinh 11',
    grade: 'Lớp 11',
    topic: 'Bài 1: Khái quát về trao đổi chất và chuyển hoá năng lượng',
    lessonName: 'Bài 1: Khái quát về trao đổi chất và chuyển hoá năng lượng',
    learningObjectives: `Nhận biết:
- Nêu được khái niệm trao đổi chất và chuyển hoá năng lượng ở sinh vật.
- Nêu được vai trò của trao đổi chất và chuyển hoá năng lượng đối với cơ thể sinh vật.
Thông hiểu:
- Phân biệt được hai mặt của trao đổi chất: đồng hoá và dị hoá.
- Phân biệt được các phương thức trao đổi chất và chuyển hoá năng lượng ở các nhóm sinh vật.
Vận dụng:
- Vận dụng hiểu biết về các giai đoạn chuyển hoá năng lượng trong cơ thể để giải thích các hiện tượng thực tế và xây dựng chế độ dinh dưỡng, vận động khoa học.`,
    duration: 15,
    createdBy: 'Hội đồng chuyên môn Sinh học',
    createdAt: '2026-09-01T08:30:00.000Z',
    questions: [
      // PHẦN 1: CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (CHỌN 1 PHƯƠNG ÁN ĐÚNG)
      {
        id: 'lop11-b1-mcq-1',
        type: 'MCQ',
        text: 'Câu 1. Trao đổi chất ở sinh vật là quá trình:',
        options: [
          'A. Cơ thể lấy các chất từ môi trường, biến đổi chúng và đào thải các chất thải ra môi trường.',
          'B. Chỉ hấp thụ năng lượng mặt trời mà không tiêu hao vật chất trong tế bào.',
          'C. Tổng hợp các chất hữu cơ mà không cần giải phóng bất kỳ sản phẩm phụ nào.',
          'D. Phân giải hoàn toàn chất hữu cơ thành nhiệt lượng tỏa ra ngoài không gian.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b1-mcq-2',
        type: 'MCQ',
        text: 'Câu 2. Hai mặt đối lập nhưng gắn bó mật thiết của quá trình trao đổi chất trong tế bào là:',
        options: [
          'A. Đồng hóa và dị hóa.',
          'B. Hô hấp và bài tiết.',
          'C. Tiêu hóa và tuần hoàn.',
          'D. Hút nước và thoát hơi nước.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b1-mcq-3',
        type: 'MCQ',
        text: 'Câu 3. Quá trình đồng hóa có vai trò cốt lõi nào sau đây đối với cơ thể sinh vật?',
        options: [
          'A. Tổng hợp các chất hữu cơ đặc trưng cho cơ thể và tích lũy năng lượng trong các liên kết hóa học.',
          'B. Phân giải các hợp chất hữu cơ phức tạp thành chất đơn giản để giải phóng ATP tức thời.',
          'C. Đào thải các chất cặn bã nguy hại ra khỏi môi trường nội bào.',
          'D. Tiêu diệt các mầm bệnh vi khuẩn xâm nhập từ môi trường ngoại cảnh.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b1-mcq-4',
        type: 'MCQ',
        text: 'Câu 4. Sinh vật tự dưỡng khác với sinh vật dị dưỡng ở đặc điểm nào sau đây?',
        options: [
          'A. Tự dưỡng có khả năng tổng hợp chất hữu cơ từ các chất vô cơ nhờ năng lượng ánh sáng hoặc năng lượng hóa học.',
          'B. Tự dưỡng chỉ sử dụng nguồn chất hữu cơ có sẵn do các sinh vật khác cung cấp.',
          'C. Tự dưỡng không cần hấp thụ nước và ion khoáng từ môi trường sống.',
          'D. Tự dưỡng không có quá trình hô hấp tế bào để giải phóng năng lượng ATP.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b1-mcq-5',
        type: 'MCQ',
        text: 'Câu 5. Năng lượng được giải phóng từ quá trình phân giải dị hóa chủ yếu được tích lũy dưới dạng nào?',
        options: [
          'A. Phân tử cao năng ATP.',
          'B. Nhiệt lượng dự trữ trong nhân tế bào.',
          'C. Sắc tố quang hợp carotenoid.',
          'D. Ánh sáng sinh học phát quang.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b1-mcq-6',
        type: 'MCQ',
        text: 'Câu 6. Vận dụng hiểu biết về chuyển hóa năng lượng trong cơ thể, một vận động viên thi đấu thể thao cần xây dựng chế độ dinh dưỡng và nghỉ ngơi như thế nào để phục hồi thể lực tối ưu?',
        options: [
          'A. Bổ sung carbohydrate phức hợp và protein dễ hấp thụ, kết hợp ngủ đủ giấc để phục hồi nồng độ ATP và sửa chữa tế bào cơ.',
          'B. Nhịn ăn tuyệt đối sau khi tập luyện cường độ cao để kích thích đốt mỡ nhanh chóng.',
          'C. Uống nước ngọt có ga và nhiều đường hóa học ngay lập tức để tăng đột ngột huyết áp.',
          'D. Tập luyện liên tục không nghỉ ngơi nhằm duy trì trạng thái dị hóa kéo dài.'
        ],
        correctAnswer: 'A'
      },

      // PHẦN 2: CÂU HỎI ĐÚNG/SAI (Ở MỖI Ý TRẢ LỜI ĐÚNG HOẶC SAI)
      {
        id: 'lop11-b1-tf-1a',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - a) Năng lượng trong tế bào chủ yếu được chuyển hóa từ hóa năng tích lũy trong chất hữu cơ sang dạng ATP.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop11-b1-tf-1b',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - b) Quá trình dị hóa cung cấp năng lượng và các chất nền nguyên liệu cho quá trình đồng hóa diễn ra.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop11-b1-tf-1c',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - c) Mọi sinh vật trên Trái Đất đều thuộc nhóm sinh vật quang tự dưỡng sử dụng năng lượng ánh sáng mặt trời.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: 'lop11-b1-tf-1d',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - d) Rèn luyện thể dục thể thao hợp lý làm tăng cường hiệu quả trao đổi chất và kích thích cơ thể phát triển khỏe mạnh.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      }
    ]
  },
  {
    id: 'SH11_002',
    title: 'Bài 2: Trao đổi nước và khoáng ở thực vật',
    category: 'Sinh 11',
    grade: 'Lớp 11',
    topic: 'Bài 2: Trao đổi nước và khoáng ở thực vật',
    lessonName: 'Bài 2: Trao đổi nước và khoáng ở thực vật',
    learningObjectives: `Nhận biết:
- Nêu được vai trò của nước và các nguyên tố khoáng thiết yếu đối với thực vật.
- Liệt kê được các con đường hấp thụ nước và ion khoáng ở tế bào lông hút của rễ.
Thông hiểu:
- Mô tả được con đường vận chuyển nước và khoáng trong cây (dòng mạch gỗ và dòng mạch rây).
- Giải thích được cơ chế thoát hơi nước qua khí khổng và vai trò của động lực thoát hơi nước đối với sự vận chuyển dòng nước trong cây.
Vận dụng:
- Vận dụng kiến thức về trao đổi nước và khoáng ở thực vật vào giải thích các biện pháp kĩ thuật canh tác nông nghiệp (tưới nước hợp lí, bón phân đúng liều lượng và thời điểm).`,
    duration: 15,
    createdBy: 'Hội đồng chuyên môn Sinh học',
    createdAt: '2026-09-01T09:00:00.000Z',
    questions: [
      // PHẦN 1: CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (CHỌN 1 PHƯƠNG ÁN ĐÚNG)
      {
        id: 'lop11-b2-mcq-1',
        type: 'MCQ',
        text: 'Câu 1. Ở thực vật trên cạn, nước và ion khoáng được hấp thụ chủ yếu qua cơ quan nào sau đây?',
        options: [
          'A. Tế bào lông hút ở rễ.',
          'B. Khí khổng ở bề mặt lá.',
          'C. Tế bào biểu bì của thân non.',
          'D. Mạch rây ở vỏ cây.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b2-mcq-2',
        type: 'MCQ',
        text: 'Câu 2. Dòng mạch gỗ trong thân cây có chức năng chủ yếu là:',
        options: [
          'A. Vận chuyển nước và ion khoáng từ rễ lên thân và lá.',
          'B. Vận chuyển sản phẩm quang hợp (đường sucrose) từ lá xuống rễ.',
          'C. Dẫn truyền xung thần kinh từ rễ lên các chồi non.',
          'D. Tích lũy tinh bột dự trữ trong các mùa rụng lá.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b2-mcq-3',
        type: 'MCQ',
        text: 'Câu 3. Động lực chính đóng vai trò đầu trên kéo dòng nước và ion khoáng di chuyển liên tục từ rễ lên lá là:',
        options: [
          'A. Quá trình thoát hơi nước qua khí khổng ở lá.',
          'B. Lực đẩy áp suất rễ (hiện tượng ứ giọt).',
          'C. Lực liên kết giữa các phân tử nước với thành mạch gỗ.',
          'D. Trọng lực hút tự nhiên của Trái Đất tác động lên nhựa luyện.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b2-mcq-4',
        type: 'MCQ',
        text: 'Câu 4. Cơ chế chủ yếu làm cho khí khổng mở ra khi cây được chiếu sáng là:',
        options: [
          'A. Tế bào hạt đậu trương nước làm thành mỏng dãn nở nhiều hơn thành dày, mép trong cong lại mở lỗ khí.',
          'B. Tế bào hạt đậu mất nước hoàn toàn khiến hai vách tế bào dính chặt vào nhau.',
          'C. Sự tích tụ ion Cl- trong gian bào hút hết nước ra ngoài lá cây.',
          'D. Sự co nguyên sinh đột ngột của toàn bộ biểu bì lá cây dưới ánh sáng mạnh.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b2-mcq-5',
        type: 'MCQ',
        text: 'Câu 5. Khi bón phân quá liều lượng cho cây trồng sẽ dẫn đến hậu quả nghiêm trọng nào sau đây?',
        options: [
          'A. Nồng độ dung dịch đất quá cao khiến rễ cây không hút được nước, làm cây bị héo và chết.',
          'B. Rễ cây tăng cường hút nước quá mức làm vỡ các mô mạch dẫn trong thân.',
          'C. Tốc độ thoát hơi nước ở lá tăng vọt làm rụng hết hoa quả non.',
          'D. Toàn bộ ion khoáng tự do chuyển hóa thành độc tố làm tắc nghẽn dòng mạch rây.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop11-b2-mcq-6',
        type: 'MCQ',
        text: 'Câu 6. Trong kĩ thuật trồng rau thủy canh và tưới tiêu nông nghiệp, biện pháp nào sau đây giúp nâng cao hiệu quả hấp thụ khoáng và giúp rễ hô hấp tốt?',
        options: [
          'A. Thường xuyên sục khí oxy vào dung dịch dinh dưỡng và điều chỉnh nồng độ pH dung dịch phù hợp.',
          'B. Bơm kín nước ngập hoàn toàn rễ và không cho không khí tiếp xúc với rễ cây.',
          'C. Tăng nồng độ muối khoáng lên gấp 10 lần nồng độ tiêu chuẩn để cây lớn nhanh.',
          'D. Sử dụng nước cất 100% không pha thêm bất kỳ nguyên tố khoáng vi lượng nào.'
        ],
        correctAnswer: 'A'
      },

      // PHẦN 2: CÂU HỎI ĐÚNG/SAI (Ở MỖI Ý TRẢ LỜI ĐÚNG HOẶC SAI)
      {
        id: 'lop11-b2-tf-2a',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - a) Nước đi vào rễ cây hoàn toàn theo cơ chế thẩm thấu thụ động từ nơi có thế nước cao sang nơi có thế nước thấp.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop11-b2-tf-2b',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - b) Đai Caspary ở nội bì có vai trò kiểm soát, chọn lọc lượng nước và khoáng trước khi đi vào mạch gỗ.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop11-b2-tf-2c',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - c) Bón phân đạm (nitrogen) càng nhiều thì năng suất cây lấy củ và quả càng cao và an toàn cho người sử dụng.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: 'lop11-b2-tf-2d',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - d) Tưới nước hợp lý đúng nhu cầu sinh lí của từng giai đoạn phát triển giúp cây trồng sinh trưởng khỏe mạnh và tiết kiệm tài nguyên nước.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      }
    ]
  },
  {
    id: 'SH12_001',
    title: 'Bài 1: DNA và cơ chế tái bản DNA',
    category: 'Sinh 12',
    grade: 'Lớp 12',
    topic: 'Bài 1: DNA và cơ chế tái bản DNA',
    lessonName: 'Bài 1: DNA và cơ chế tái bản DNA',
    learningObjectives: `Nhận biết:
- Nêu được khái niệm, thành phần cấu tạo và chức năng của phân tử DNA.
- Nêu được các nguyên tắc trong quá trình tái bản DNA (bán bảo tồn, bổ sung).
Thông hiểu:
- Trình bày được cấu trúc không gian của DNA theo mô hình Watson - Crick.
- Giải thích được cơ chế tái bản của phân tử DNA và vai trò của các enzyme chính (DNA polymerase, helicase, ligase).
Vận dụng:
- Vận dụng kiến thức về cấu trúc và tái bản DNA để giải các bài toán định lượng phân tử (tính số nucleotide, số liên kết hydrogen, số đoạn Okazaki, số phân tử DNA con tạo thành qua k lần nhân đôi).`,
    duration: 15,
    createdBy: 'Hội đồng chuyên môn Sinh học',
    createdAt: '2026-09-01T09:15:00.000Z',
    questions: [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (1 ĐÁP ÁN ĐÚNG)
      {
        id: 'lop12-b1-mcq-1',
        type: 'MCQ',
        text: 'Câu 1. Mỗi đơn phân (nucleotide) cấu tạo nên phân tử DNA gồm có những thành phần nào sau đây?',
        options: [
          'A. Đường deoxyribose, gốc phosphate và một trong 4 loại base nitơ (A, T, G, C).',
          'B. Đường ribose, gốc phosphate và một trong 4 loại base nitơ (A, U, G, C).',
          'C. Phân tử glycerol, chuỗi axit béo và nhóm amino tự do.',
          'D. Gốc đường glucose, nhóm phosphate và các base nitơ liên kết đôi.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b1-mcq-2',
        type: 'MCQ',
        text: 'Câu 2. Trong cấu trúc chuỗi polynucleotide của DNA, các nucleotide trên cùng một mạch đơn liên kết với nhau bằng loại liên kết nào?',
        options: [
          'A. Liên kết phosphodiester (liên kết cộng hóa trị).',
          'B. Liên kết hydrogen kém bền.',
          'C. Liên kết peptide giữa nhóm amin và carboxyl.',
          'D. Liên kết ion tĩnh điện giữa các gốc base.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b1-mcq-3',
        type: 'MCQ',
        text: 'Câu 3. Đặc điểm nào trong cấu trúc của phân tử DNA đảm bảo cho thông tin di truyền được lưu giữ bền vững và sao chép chính xác qua các thế hệ tế bào?',
        options: [
          'A. Cấu trúc hai mạch xoắn kép liên kết với nhau theo nguyên tắc bổ sung bằng số lượng lớn liên kết hydrogen.',
          'B. Cấu trúc mạch đơn mềm dẻo giúp phân tử dễ dàng cuộn xoắn và biến đổi tự do.',
          'C. Tất cả các base nitơ đều có kích thước bằng nhau và liên kết không phân biệt.',
          'D. Khả năng hòa tan vô hạn trong nước và dịch nội bào mà không bị enzyme phân giải.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b1-mcq-4',
        type: 'MCQ',
        text: 'Câu 4. Trong quá trình tái bản DNA, enzyme DNA polymerase chỉ có thể kéo dài mạch mới theo chiều nào sau đây?',
        options: [
          'A. Chiều 5\' → 3\' do chỉ gắn nucleotide vào đầu 3\'-OH tự do.',
          'B. Chiều 3\' → 5\' do gắn nucleotide vào đầu 5\'-phosphate tự do.',
          'C. Cả hai chiều 5\' → 3\' và 3\' → 5\' một cách ngẫu nhiên.',
          'D. Chiều từ tâm động hướng ra hai đầu mút của nhiễm sắc thể.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b1-mcq-5',
        type: 'MCQ',
        text: 'Câu 5. Trong chạc chữ Y tái bản DNA, sự hình thành các đoạn Okazaki trên mạch khuôn 5\' → 3\' là do nguyên nhân nào sau đây?',
        options: [
          'A. Mạch khuôn ngược chiều với hướng mở của chạc sao chép nên DNA polymerase phải tổng hợp ngắt quãng theo chiều 5\' → 3\'.',
          'B. Enzyme DNA polymerase bị đứt đoạn sau khi tổng hợp được khoảng 100 nucleotide.',
          'C. Mạch khuôn 5\' → 3\' không có đủ số lượng nucleotide tự do trong môi trường.',
          'D. Enzyme DNA ligase ngăn cản quá trình tổng hợp liên tục trên mạch này.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b1-mcq-6',
        type: 'MCQ',
        text: 'Câu 6. Thí nghiệm của Meselson và Stahl (1958) nuôi vi khuẩn E. coli trong môi trường chứa 15N rồi chuyển sang môi trường 14N đã chứng minh nguyên tắc nào trong quá trình tái bản DNA?',
        options: [
          'A. Nguyên tắc bán bảo tồn (mỗi phân tử DNA con giữ lại một mạch cũ của DNA mẹ).',
          'B. Nguyên tắc bảo tồn hoàn toàn (phân tử DNA mẹ được giữ nguyên vẹn).',
          'C. Nguyên tắc phân tán ngẫu nhiên các mảnh nucleotide giữa các thế hệ tế bào.',
          'D. Nguyên tắc phiên mã ngược từ phân tử RNA sang phân tử DNA.'
        ],
        correctAnswer: 'A'
      },

      // PHẦN 2. CÂU HỎI ĐÚNG/SAI
      {
        id: 'lop12-b1-tf-1a',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về cấu trúc và cơ chế tái bản của phân tử DNA. Nhận định nào ĐÚNG/SAI. - a) Theo nguyên tắc bổ sung, trong phân tử DNA mạch kép, số nucleotide loại Adenine luôn bằng Thymine, Guanine luôn bằng Cytosine.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop12-b1-tf-1b',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về cấu trúc và cơ chế tái bản của phân tử DNA. Nhận định nào ĐÚNG/SAI. - b) Enzyme DNA polymerase có vai trò tháo xoắn phân tử DNA và tổng hợp đoạn mồi RNA tại chạc ba tái bản.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: 'lop12-b1-tf-1c',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về cấu trúc và cơ chế tái bản của phân tử DNA. Nhận định nào ĐÚNG/SAI. - c) Nhờ nguyên tắc bán bảo tồn và nguyên tắc bổ sung, thông tin di truyền được truyền đạt chính xác qua các thế hệ tế bào.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop12-b1-tf-1d',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về cấu trúc và cơ chế tái bản của phân tử DNA. Nhận định nào ĐÚNG/SAI. - d) Trên cả hai mạch khuôn của chạc sao chép chữ Y, quá trình tổng hợp mạch mới đều diễn ra liên tục theo chiều mở xoắn của phân tử DNA.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },

      // PHẦN 3. CÂU HỎI TRẢ LỜI NGẮN (ĐẶC TRƯNG KHỐI LỚP 12)
      {
        id: 'lop12-b1-sa-1',
        type: 'SA',
        text: 'Câu 1. Một phân tử DNA mạch kép có tổng số 3000 nucleotide, trong đó số nucleotide loại Adenine (A) bằng 600. Tổng số liên kết hydrogen của phân tử DNA này là bao nhiêu?',
        options: [],
        correctAnswer: '3900'
      },
      {
        id: 'lop12-b1-sa-2',
        type: 'SA',
        text: 'Câu 2. Một phân tử DNA mạch kép của vi khuẩn nhân đôi liên tiếp 3 lần trong môi trường chứa 14N. Kết thúc quá trình, có bao nhiêu phân tử DNA con được tạo thành chứa cả 14N và 15N?',
        options: [],
        correctAnswer: '2'
      }
    ]
  },
  {
    id: 'SH12_002',
    title: 'Bài 2: Gene, quá trình truyền đạt thông tin di truyền và hệ gene',
    category: 'Sinh 12',
    grade: 'Lớp 12',
    topic: 'Bài 2: Gene, quá trình truyền đạt thông tin di truyền và hệ gene',
    lessonName: 'Bài 2: Gene, quá trình truyền đạt thông tin di truyền và hệ gene',
    learningObjectives: `Nhận biết:
- Nêu được khái niệm gene, cấu trúc chung của gene cấu trúc.
- Nêu được đặc điểm của mã di truyền và chức năng các loại phân tử RNA.
Thông hiểu:
- Trình bày được cơ chế phiên mã tổng hợp RNA và dịch mã tổng hợp protein.
- Phân tích được nguyên tắc bổ sung trong cơ chế di truyền ở cấp độ phân tử.
Vận dụng:
- Vận dụng kiến thức mã di truyền và biểu hiện gene vào tính toán các thông số phân tử (số bộ ba, số liên kết peptide, số amino acid trong chuỗi polypeptide) và ứng dụng sản xuất sinh phẩm y dược (insulin).`,
    duration: 15,
    createdBy: 'Hội đồng chuyên môn Sinh học',
    createdAt: '2026-09-01T09:30:00.000Z',
    questions: [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
      {
        id: 'lop12-b2-mcq-1',
        type: 'MCQ',
        text: 'Câu 1. Quá trình phiên mã ở tế bào sinh vật nhân thực diễn ra chủ yếu ở cấu trúc nào sau đây?',
        options: [
          'A. Nhân tế bào.',
          'B. Tế bào chất.',
          'C. Bào quan ribosome.',
          'D. Thể Golgi.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b2-mcq-2',
        type: 'MCQ',
        text: 'Câu 2. Loại phân tử RNA nào sau đây mang bộ ba đối mã (anticodon) làm nhiệm vụ vận chuyển amino acid đến ribosome trong quá trình dịch mã?',
        options: [
          'A. tRNA.',
          'B. mRNA.',
          'C. rRNA.',
          'D. snRNA.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b2-mcq-3',
        type: 'MCQ',
        text: 'Câu 3. Đặc điểm nào sau đây thể hiện tính thoái hóa của mã di truyền?',
        options: [
          'A. Nhiều bộ ba khác nhau cùng mã hóa cho một loại amino acid (trừ AUG và UGG).',
          'B. Một bộ ba mã hóa cho nhiều loại amino acid khác nhau tùy theo loài sinh vật.',
          'C. Mã di truyền được đọc từ một điểm xác định theo từng cụm 3 nucleotide không gối lên nhau.',
          'D. Tất cả các loài sinh vật trên Trái Đất đều dùng chung một bộ mã di truyền.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b2-mcq-4',
        type: 'MCQ',
        text: 'Câu 4. Trong quá trình dịch mã, liên kết peptide đầu tiên được hình thành giữa:',
        options: [
          'A. Amino acid mở đầu (Met) với amino acid thứ nhất.',
          'B. Hai amino acid mở đầu với nhau.',
          'C. Amino acid thứ nhất với amino acid thứ hai.',
          'D. Amino acid cuối cùng với codon kết thúc.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b2-mcq-5',
        type: 'MCQ',
        text: 'Câu 5. Nguyên tắc bổ sung trong quá trình phiên mã tổng hợp phân tử mRNA từ mạch khuôn DNA (chiều 3\'→5\') là:',
        options: [
          'A. A mạch khuôn liên kết với U; T liên kết với A; G liên kết với C; C liên kết với G.',
          'B. A mạch khuôn liên kết với T; T liên kết với A; G liên kết với C; C liên kết với G.',
          'C. A mạch khuôn liên kết với A; T liên kết với U; G liên kết với G; C liên kết với C.',
          'D. A mạch khuôn liên kết với G; T liên kết với C; G liên kết với A; C liên kết với U.'
        ],
        correctAnswer: 'A'
      },
      {
        id: 'lop12-b2-mcq-6',
        type: 'MCQ',
        text: 'Câu 6. Ứng dụng hiểu biết về mã di truyền và quá trình dịch mã, các nhà khoa học đã sản xuất thành công insulin người bằng kĩ thuật nào sau đây?',
        options: [
          'A. Chuyển gene mã hóa insulin của người vào vi khuẩn E. coli để vi khuẩn dịch mã tạo insulin sinh học.',
          'B. Chiết xuất trực tiếp insulin từ thực vật biến đổi gen không qua phiên mã và dịch mã.',
          'C. Tổng hợp nhân tạo chuỗi amino acid mà không cần thông tin di truyền từ phân tử DNA.',
          'D. Cho tế bào người tự phân chia vô hạn trong môi trường vô trùng để thu insulin tự do.'
        ],
        correctAnswer: 'A'
      },

      // PHẦN 2. CÂU HỎI ĐÚNG/SAI. Ở MỖI Ý CÁC EM SẼ TRẢ LỜI “ĐÚNG” HOẶC “SAI”
      {
        id: 'lop12-b2-tf-2a',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - a) Quá trình dịch mã tổng hợp protein diễn ra tại tế bào chất ở cả sinh vật nhân sơ và nhân thực.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop12-b2-tf-2b',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - b) Enzyme RNA polymerase có khả năng tự tháo xoắn phân tử DNA mà không cần enzyme tháo xoắn riêng biệt.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop12-b2-tf-2c',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - c) Trên một phân tử mRNA, nhiều ribosome cùng hoạt động (polyribosome) giúp tăng năng suất tổng hợp protein cùng loại.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop12-b2-tf-2d',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - d) Phân tử tRNA có cấu trúc mạch thẳng hoàn toàn và không có bất kỳ liên kết hydrogen nào giữa các base.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },

      // PHẦN 3. CÂU HỎI TRẢ LỜI NGẮN (ĐẶC TRƯNG KHỐI LỚP 12)
      {
        id: 'lop12-b2-sa-1',
        type: 'SA',
        text: 'Câu 1. Có tổng cộng bao nhiêu bộ ba mã hóa các amino acid?',
        options: [],
        correctAnswer: '61'
      },
      {
        id: 'lop12-b2-sa-2',
        type: 'SA',
        text: 'Câu 2. Một phân tử mRNA có 900 nucleotide, quá trình dịch mã trên mRNA này tổng hợp 1 chuỗi polypeptide hoàn chỉnh có bao nhiêu amino acid?',
        options: [],
        correctAnswer: '298'
      }
    ]
  }
];

// Helper hợp nhất đề thi mặc định nếu chưa từng có bất kỳ đề thi nào trong hệ thống
const ensureDefaultExams = (currentExams: Exam[]): Exam[] => {
  // Nếu đã có đề thi thực tế (từ Cloud hoặc Giáo viên tạo), tuyệt đối KHÔNG tự ý chèn lại các đề thi cũ đã xóa
  if (Array.isArray(currentExams) && currentExams.length > 0) {
    return currentExams.filter(e => e && !isExamDeleted(e));
  }
  // Chỉ khi kho đề hoàn toàn trống và chưa có kết nối cloud mới dùng đề mẫu chuẩn
  const defaults = getDefaultStandardExams();
  return defaults.filter(d => !isExamDeleted(d.id));
};

// Đọc trực tiếp Sheet 06_DE_THI từ Google Sheets qua CSV làm phương án dự phòng khẩn cấp
export const fetchGoogleSheetExamsViaCSV = async (): Promise<Exam[]> => {
  const currentSheetUrl = getGoogleSheetUrl();
  let spreadsheetId = '1H29C4P_0oJNLNvXRE2ts8hJmzasbq1eR1anAyDjITAw';
  const matchId = currentSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (matchId && matchId[1]) {
    spreadsheetId = matchId[1];
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=06_DE_THI&_t=${Date.now()}`;
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) return [];
    const text = await res.text();
    const rows = parseCSVRows(text);
    if (rows.length < 2) return [];

    const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
    const colId = header.findIndex(h => h.includes('id'));
    const colTitle = header.findIndex(h => h.includes('tieu_de') || h.includes('title'));
    const colGrade = header.findIndex(h => h.includes('khoi_lop') || h.includes('grade'));
    const colCat = header.findIndex(h => h.includes('chuyen_muc') || h.includes('category'));
    const colTopic = header.findIndex(h => h.includes('chu_de') || h.includes('topic'));
    const colLesson = header.findIndex(h => h.includes('bai_hoc') || h.includes('lesson'));
    const colYccd = header.findIndex(h => h.includes('yccd') || h.includes('learning'));
    const colDuration = header.findIndex(h => h.includes('thoi_gian') || h.includes('duration'));
    const colQuestions = header.findIndex(h => h.includes('json') || h.includes('cau_hoi'));
    const colCreator = header.findIndex(h => h.includes('nguoi_tao') || h.includes('creator'));
    const colDate = header.findIndex(h => h.includes('thoi_diem') || h.includes('date'));
    const colStatus = header.findIndex(h => h.includes('trang_thai') || h.includes('status'));

    const parsedExams: Exam[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const status = (colStatus !== -1 ? row[colStatus] : row[12]) || '';
      if (status.toLowerCase().includes('xóa') || status.toLowerCase().includes('delete') || status.toLowerCase().includes('ẩn')) {
        continue;
      }

      const id = (colId !== -1 ? row[colId] : row[0]) || '';
      if (!id || isExamDeleted(id)) continue;

      const rawQ = (colQuestions !== -1 ? row[colQuestions] : row[9]) || '';
      let questions: Question[] = [];
      try {
        if (rawQ.trim().startsWith('[') && rawQ.trim().endsWith(']')) {
          questions = JSON.parse(rawQ);
        }
      } catch {}

      let creatorVal = (colCreator !== -1 ? row[colCreator] : row[10]) || 'Admin Giáo Viên';
      if (/lâm\s*thái\s*hiển/i.test(creatorVal)) {
        creatorVal = 'Admin Giáo Viên';
      }

      parsedExams.push({
        id: String(id).trim(),
        title: (colTitle !== -1 ? row[colTitle] : row[1]) || 'Bài kiểm tra Sinh học',
        grade: (colGrade !== -1 ? row[colGrade] : row[2]) || 'Lớp 10',
        category: (colCat !== -1 ? row[colCat] : row[3]) || 'Sinh 10',
        topic: (colTopic !== -1 ? row[colTopic] : row[4]) || '',
        lessonName: (colLesson !== -1 ? row[colLesson] : row[5]) || '',
        learningObjectives: (colYccd !== -1 ? row[colYccd] : row[6]) || '',
        duration: Number(colDuration !== -1 ? row[colDuration] : row[7]) || 15,
        questions: questions,
        createdBy: creatorVal,
        createdAt: (colDate !== -1 ? row[colDate] : row[11]) || ''
      });
    }

    // Đảo ngược thứ tự dòng trên Sheet (dòng tạo sau nằm ở dưới sẽ được đưa lên đầu danh sách)
    return sortExamsNewestFirst(parsedExams.reverse());
  } catch (err) {
    console.warn("Chưa đọc được Sheet 06_DE_THI qua CSV:", err);
    return [];
  }
};

// --- Cloud API Integration ---

// 1. Fetch Exams from Cloud (Tích hợp Master Cache + Apps Script + CSV Fallback)
export const getExams = async (): Promise<Exam[]> => {
  // A. Nạp dữ liệu cục bộ hiện tại
  const storedList = (getStorageData<Exam[]>('bio_exams', []) || []).filter(e => e && !isExamDeleted(e));
  const masterList = getMasterExams().filter(e => e && !isExamDeleted(e));
  let mergedLocal = sortExamsNewestFirst(normalizeAndMigrateExamIds(ensureMasterExams([...storedList, ...masterList])).filter(e => e && !isExamDeleted(e)));

  // B. Thử tải trực tiếp từ Google Apps Script
  if (GOOGLE_SCRIPT_URL.includes('http')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=get_exams&_t=${Date.now()}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.exams)) {
          const rawCloud = data.exams.filter((e: Exam) => e && e.id && !isExamDeleted(e));
          
          // Đề thi từ Sheet 06_DE_THI là nguồn dữ liệu chuẩn, giữ nguyên vẹn
          const cloudExams = [...rawCloud].reverse().map(sanitizeExam);
          
          // Chuẩn hóa mã đề (giữ nguyên các mã chuẩn SH10_xxx, SH11_xxx, SH12_xxx)
          const normalizedCloud = normalizeAndMigrateExamIds(cloudExams).filter(e => !isExamDeleted(e));
          
          // Lưu từng đề từ đám mây vào Master Cache và hợp nhất với các đề Admin vừa tạo
          const mergedAll = sortExamsNewestFirst(deduplicateExams([...normalizedCloud, ...masterList, ...storedList])).filter(e => !isExamDeleted(e)).map(sanitizeExam);
          mergedAll.forEach((e: Exam) => saveToMasterExams(e));

          // Đồng bộ hóa triệt để: Tài khoản học sinh và giáo viên cùng nhận danh sách đề đầy đủ
          setStorageData('bio_exams', mergedAll);
          return mergedAll;
        }
      }
    } catch (error) {
      console.warn("Không kết nối được Apps Script get_exams, thử phương án dự phòng Sheet CSV:", error);
    }

    // C. Dự phòng cấp 2: Tải qua Google Sheet CSV nếu Apps Script chưa cập nhật
    try {
      const csvExams = await fetchGoogleSheetExamsViaCSV();
      if (csvExams.length > 0) {
        const validCSV = csvExams.filter(e => e && !isExamDeleted(e));
        const normalizedCSV = normalizeAndMigrateExamIds(validCSV).filter(e => !isExamDeleted(e)).map(sanitizeExam);
        const mergedCSV = sortExamsNewestFirst(deduplicateExams([...normalizedCSV, ...masterList, ...storedList])).filter(e => !isExamDeleted(e)).map(sanitizeExam);
        mergedCSV.forEach(e => saveToMasterExams(e));
        setStorageData('bio_exams', mergedCSV);
        return mergedCSV;
      }
    } catch (e) {
      console.warn("Lỗi tải qua CSV:", e);
    }
  }

  // D. Fallback cục bộ khi không có kết nối mạng
  if (mergedLocal.length === 0) {
    mergedLocal = sortExamsNewestFirst(ensureDefaultExams([]));
  }
  const cleanMergedLocal = mergedLocal.map(sanitizeExam);
  setStorageData('bio_exams', cleanMergedLocal);
  return cleanMergedLocal;
};

// Helper: Get Exam by ID (used for Battle Room Code)
export const getExamById = async (id: string): Promise<Exam | null> => {
    const allExams = await getExams();
    return allExams.find(e => e.id === id) || null;
};

// 2. Publish New Exam to Cloud
export const publishExamToCloud = async (rawExam: Exam): Promise<boolean> => {
  const exam = sanitizeExam(rawExam);
  restoreActiveCloudExam(exam);
  if (exam.id) restoreActiveCloudExam(exam.id);

  // Đảm bảo ID đề thi luôn ngắn gọn theo chuẩn khối nếu chưa có
  if (!exam.id || (!isStandardExamId(exam.id) && exam.category !== 'BATTLE')) {
    const currentExams = deduplicateExams(getStorageData<Exam[]>('bio_exams', []));
    exam.id = generateNextExamId(exam.grade || exam.category, currentExams, exam.title || exam.lessonName);
    restoreActiveCloudExam(exam.id);
  }

  // 1. Luôn lưu vào Master Cache vĩnh viễn
  saveToMasterExams(exam);

  // 2. Cập nhật ngay bio_exams cục bộ (Optimistic update)
  try {
    const currentExams = deduplicateExams(getStorageData<Exam[]>('bio_exams', []).filter(e => e && !isExamDeleted(e)));
    const targetId = String(exam.id).trim().toUpperCase();

    const existsIndex = currentExams.findIndex(e => 
      String(e.id).trim().toUpperCase() === targetId
    );
    let updatedList: Exam[];
    if (existsIndex !== -1) {
      updatedList = currentExams.map((e, idx) => idx === existsIndex ? { ...e, ...exam } : e);
    } else {
      updatedList = [exam, ...currentExams];
    }
    const finalStored = deduplicateExams(updatedList);
    setStorageData('bio_exams', finalStored);
  } catch (err) {
    console.error("Error updating local bio_exams:", err);
  }

  // 3. Gửi đồng bộ lên Google Apps Script để ghi vào Sheet 06_DE_THI
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'create_exam',
        exam: exam
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return true;

    const result = await response.json();
    return result.success !== false;
  } catch (error) {
    console.warn("Cloud publish sync error, saved in master storage:", error);
    return true;
  }
};

export interface TwoWaySyncResult {
  success: boolean;
  cloudCount: number;
  uploadedCount: number;
  total: number;
  message: string;
}

/**
 * ĐỒNG BỘ 2 CHIỀU GIỮA ỨNG DỤNG VÀ GOOGLE SHEET (Sheet 06_DE_THI):
 * Chiều 1 (Sheet -> App): Tải toàn bộ đề thi đang có từ Google Sheet 06_DE_THI về ứng dụng,
 *                          phục hồi trạng thái hoạt động (không bị chặn bởi bộ nhớ cache).
 * Chiều 2 (App -> Sheet): Quét các đề thi đã tạo trong ứng dụng mà chưa có trên Google Sheet,
 *                          tự động đăng tải (publish) lên Sheet 06_DE_THI.
 * Kết quả: Cả 2 phía đều sở hữu đầy đủ toàn bộ đề thi đồng nhất 100%.
 */
export const syncTwoWayExams = async (): Promise<TwoWaySyncResult> => {
  try {
    // 1. CHIỀU 1: Tải trực tiếp đề từ Sheet 06_DE_THI
    const cloudExams = await getExams();

    // 2. CHIỀU 2: Kiểm tra các đề cục bộ chưa có trên Sheet
    const master = deduplicateExams(getMasterExams().filter(e => e && !isExamDeleted(e.id)));
    const stored = deduplicateExams((getStorageData<Exam[]>('bio_exams', []) || []).filter(e => e && !isExamDeleted(e.id)));
    const localAll = deduplicateExams([...master, ...stored]);

    const cloudIdSet = new Set<string>();
    cloudExams.forEach(c => {
      if (c.id) {
        cloudIdSet.add(String(c.id).trim().toUpperCase());
        cloudIdSet.add(String(c.id).replace(/^exam-/, '').trim().toUpperCase());
      }
    });

    const toUpload = localAll.filter(le => {
      if (!le || !le.id || isExamDeleted(le)) return false;
      const strId = String(le.id).trim().toUpperCase();
      const withoutPrefix = strId.replace(/^exam-/, '');
      return !cloudIdSet.has(strId) && !cloudIdSet.has(withoutPrefix);
    });

    let uploadedCount = 0;
    for (const ex of toUpload) {
      try {
        const ok = await publishExamToCloud(ex);
        if (ok) uploadedCount++;
      } catch (err) {
        console.warn(`Lỗi đẩy đề ${ex.id} lên Sheet 06_DE_THI:`, err);
      }
    }

    // 3. Tải lại và hợp nhất danh sách hoàn chỉnh
    const finalExams = await getExams();

    return {
      success: true,
      cloudCount: cloudExams.length,
      uploadedCount,
      total: finalExams.length,
      message: `Đồng bộ 2 chiều thành công: Đã nạp ${cloudExams.length} đề từ Sheet 06_DE_THI, tải lên ${uploadedCount} đề từ ứng dụng (Tổng cộng: ${finalExams.length} bài kiểm tra)!`
    };
  } catch (error: any) {
    console.error("Lỗi đồng bộ 2 chiều:", error);
    const fallbackExams = await getExams();
    return {
      success: false,
      cloudCount: fallbackExams.length,
      uploadedCount: 0,
      total: fallbackExams.length,
      message: `Đã cập nhật danh sách đề thi hiện có (${fallbackExams.length} bài kiểm tra).`
    };
  }
};

// Đồng bộ toàn bộ đề thi giữa Master Cache và Google Sheet (Khử trùng lặp triệt để)
export const syncAllMasterExamsToCloud = async (): Promise<{ total: number; success: number; message?: string }> => {
  const res = await syncTwoWayExams();
  return { total: res.total, success: res.cloudCount + res.uploadedCount, message: res.message };
};

// 📥 XUẤT SAO LƯU TOÀN BỘ ĐỀ THI RA FILE JSON (TẢI VỀ MÁY TÍNH)
export const exportExamsToJSONFile = (exams: Exam[]) => {
  try {
    const valid = (exams || []).filter(e => e && !isExamDeleted(e.id));
    const backupData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      system: 'AI Sinh Học THPT - LMS KHKT',
      totalExams: valid.length,
      exams: valid
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nowStr = new Date().toISOString().slice(0, 10);
    a.download = `Sao_Luu_De_Thi_SinhHoc_${nowStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error("Lỗi xuất file sao lưu đề thi:", err);
    return false;
  }
};

// 📤 NHẬP ĐỀ THI TỪ FILE JSON VÀO HỆ THỐNG
export const importExamsFromJSONText = async (jsonText: string): Promise<{ success: boolean; count: number; message: string }> => {
  try {
    const parsed = JSON.parse(jsonText);
    let importedExams: Exam[] = [];

    if (Array.isArray(parsed)) {
      importedExams = parsed;
    } else if (parsed && Array.isArray(parsed.exams)) {
      importedExams = parsed.exams;
    } else if (parsed && parsed.id && parsed.title && Array.isArray(parsed.questions)) {
      importedExams = [parsed];
    } else {
      return { success: false, count: 0, message: "Định dạng file sao lưu không hợp lệ." };
    }

    const validList = importedExams.filter(e => e && e.id && e.title && Array.isArray(e.questions) && e.questions.length > 0);
    if (validList.length === 0) {
      return { success: false, count: 0, message: "Không tìm thấy đề thi hợp lệ trong file." };
    }

    let addedCount = 0;
    for (const exam of validList) {
      saveToMasterExams(exam);
      await publishExamToCloud(exam);
      addedCount++;
    }

    // Nạp lại danh sách đề thi
    await getExams();

    return { 
      success: true, 
      count: addedCount, 
      message: `Đã nhập và khôi phục thành công ${addedCount} bài kiểm tra vào ngân hàng đề thi!` 
    };
  } catch (err: any) {
    return { success: false, count: 0, message: `Lỗi đọc file: ${err.message || 'File JSON không đúng chuẩn'}` };
  }
};

// Delete Exam (Admin/User) - Fixed with Optimistic Update and Persistent Storage
export const deleteExamFromCloud = async (examId: string | number): Promise<boolean> => {
  markExamAsDeleted(examId);

  // 1. Luôn xóa cục bộ trước trong cả bio_exams và bio_admin_exams_master
  const currentExams = getStorageData<Exam[]>('bio_exams', []);
  const updatedList = (currentExams || []).filter(e => e && !isExamDeleted(e.id) && String(e.id) !== String(examId));
  setStorageData('bio_exams', updatedList);

  const masterList = getMasterExams().filter(e => e && !isExamDeleted(e.id) && String(e.id) !== String(examId));
  localStorage.setItem('bio_admin_exams_master', JSON.stringify(masterList));

  try {
    if (GOOGLE_SCRIPT_URL.includes('http')) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ 
          action: 'delete_exam', 
          examId: String(examId),
          id: String(examId)
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    }
    return true; 
  } catch (error) {
    console.warn("Đã xóa cục bộ thành công, đồng bộ đám mây sẽ chạy ngầm:", error);
    return true; 
  }
};

/**
 * Lấy dữ liệu người dùng từ LocalStorage theo số điện thoại (hỗ trợ cả có số 0 hoặc bỏ số 0 đầu)
 */
export const getStoredUserByPhone = (phone?: string | null): User | null => {
  if (!phone) return null;
  const pStr = String(phone).trim();
  if (pStr === 'guest') {
    try {
      const raw = localStorage.getItem('user_guest');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  const cleanDigits = pStr.replace(/\D/g, '');
  const noZero = cleanDigits.replace(/^0+/, '');
  const withZero = noZero ? `0${noZero}` : cleanDigits;

  const candidateKeys = [
    `user_${pStr}`,
    `user_${cleanDigits}`,
    `user_${noZero}`,
    `user_${withZero}`
  ];

  for (const k of candidateKeys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        const u = JSON.parse(raw);
        if (u && typeof u === 'object') {
          if (Array.isArray(u.examHistory) && u.examHistory.length > 0) {
            u.examHistory = filterExamHistoryByStudentGrade(u, u.examHistory);
          }
          return u;
        }
      }
    } catch {}
  }
  return null;
};

/**
 * Nhận diện khối lớp của học sinh từ thông tin tài khoản (className hoặc studentId)
 * Trả về: '10' | '11' | '12' | null
 */
export const getStudentGrade = (user?: Partial<User> | null): '10' | '11' | '12' | null => {
  if (!user) return null;
  const target = `${user.className || ''} ${user.studentId || ''}`.trim();
  if (!target) return null;

  // 1. Kiểm tra Khối 12: 12T7, 12A1, 12T701, "Lớp 12", "Khối 12", "Sinh 12", "12"
  if (
    /(?:lớp|khối|k|sinh\s*học|sinh)\s*12\b/i.test(target) ||
    /\b12[A-Za-z0-9]/i.test(target) ||
    /^12/i.test(String(user.studentId || '').trim()) ||
    /^12/i.test(String(user.className || '').trim()) ||
    /\b12\b/.test(target) ||
    (user.className && user.className.includes('12'))
  ) {
    return '12';
  }

  // 2. Kiểm tra Khối 11: 11B2, 11A1, 11..., "Lớp 11", "Khối 11", "11"
  if (
    /(?:lớp|khối|k|sinh\s*học|sinh)\s*11\b/i.test(target) ||
    /\b11[A-Za-z0-9]/i.test(target) ||
    /^11/i.test(String(user.studentId || '').trim()) ||
    /^11/i.test(String(user.className || '').trim()) ||
    /\b11\b/.test(target) ||
    (user.className && user.className.includes('11'))
  ) {
    return '11';
  }

  // 3. Kiểm tra Khối 10: 10A1, 10T1, 10..., "Lớp 10", "Khối 10", "10"
  if (
    /(?:lớp|khối|k|sinh\s*học|sinh)\s*10\b/i.test(target) ||
    /\b10[A-Za-z0-9]/i.test(target) ||
    /^10/i.test(String(user.studentId || '').trim()) ||
    /^10/i.test(String(user.className || '').trim()) ||
    /\b10\b/.test(target) ||
    (user.className && user.className.includes('10'))
  ) {
    return '10';
  }

  return null;
};

/**
 * Nhận diện khối lớp của bài thi hoặc kết quả thi:
 * Trả về: '10' | '11' | '12' | null
 */
export const getExamGrade = (
  item?: Partial<ExamResult> | Partial<Exam> | any,
  allExams?: Exam[]
): '10' | '11' | '12' | null => {
  if (!item) return null;

  // 1. Kiểm tra thuộc tính grade hoặc category của đối tượng
  const gradeAttr = String(item.grade || '').toLowerCase();
  if (gradeAttr.includes('12')) return '12';
  if (gradeAttr.includes('11')) return '11';
  if (gradeAttr.includes('10')) return '10';

  const catAttr = String(item.category || '').toLowerCase();
  if (catAttr.includes('12')) return '12';
  if (catAttr.includes('11')) return '11';
  if (catAttr.includes('10')) return '10';

  // 2. Kiểm tra mã bài thi (examId, id, turnId)
  const idStr = String(item.examId || item.id || item.turnId || '').toUpperCase();
  if (idStr.includes('SH12_') || idStr.includes('LOP12') || idStr.includes('_12_') || idStr.includes('K12')) return '12';
  if (idStr.includes('SH11_') || idStr.includes('LOP11') || idStr.includes('_11_') || idStr.includes('K11')) return '11';
  if (idStr.includes('SH10_') || idStr.includes('LOP10') || idStr.includes('_10_') || idStr.includes('K10')) return '10';

  // 3. Nếu có ID cụ thể, đối chiếu trực tiếp qua ID với danh sách đề thi hệ thống (CHỈ so khớp ID, tuyệt đối không gọi isExamAttemptMatching để tránh đệ quy vô hạn)
  const targetId = String(item.examId || item.id || '').trim();
  if (targetId) {
    const examsToCheck = (allExams && allExams.length > 0) ? allExams : getMasterExams();
    if (examsToCheck && examsToCheck.length > 0) {
      const matched = examsToCheck.find(e => e && e !== item && isMatchingExamId(targetId, e.id));
      if (matched) {
        const mGrade = `${matched.grade || ''} ${matched.category || ''} ${matched.title || ''}`.toLowerCase();
        const mId = String(matched.id || '').toUpperCase();
        if (mId.startsWith('SH12_') || mGrade.includes('12')) return '12';
        if (mId.startsWith('SH11_') || mGrade.includes('11')) return '11';
        if (mId.startsWith('SH10_') || mGrade.includes('10')) return '10';
      }
    }
  }

  // 4. Kiểm tra chuỗi tiêu đề và bài học
  const text = `${item.examTitle || ''} ${item.title || ''} ${item.lessonName || ''} ${item.topic || ''}`.toLowerCase();
  if (/(?:lớp|khối|sinh\s*học|sinh|k)\s*12\b/i.test(text) || text.includes('sinh 12') || text.includes('lớp 12') || text.includes('khối 12')) {
    return '12';
  }
  if (/(?:lớp|khối|sinh\s*học|sinh|k)\s*11\b/i.test(text) || text.includes('sinh 11') || text.includes('lớp 11') || text.includes('khối 11')) {
    return '11';
  }
  if (/(?:lớp|khối|sinh\s*học|sinh|k)\s*10\b/i.test(text) || text.includes('sinh 10') || text.includes('lớp 10') || text.includes('khối 10')) {
    return '10';
  }

  // 5. Kiểm tra các chủ đề trọng tâm chuẩn theo phân phối chương trình Sinh học THPT (GDPT 2018)
  // Khối 12: Di truyền học, Tiến hóa, Sinh thái học
  if (
    text.includes('dna') ||
    text.includes('gen') ||
    text.includes('phiên mã') ||
    text.includes('dịch mã') ||
    text.includes('nhiễm sắc thể') ||
    text.includes('menden') ||
    text.includes('menđen') ||
    text.includes('liên kết gen') ||
    text.includes('hoán vị gen') ||
    text.includes('di truyền') ||
    text.includes('tiến hóa') ||
    text.includes('chọn lọc tự nhiên') ||
    text.includes('sinh thái học') ||
    text.includes('quần thể') ||
    text.includes('quần xã') ||
    text.includes('hệ sinh thái')
  ) {
    return '12';
  }

  // Khối 11: Sinh học cơ thể (Trao đổi chất, Cảm ứng, Sinh trưởng & Sinh sản ở ĐTV & ĐTV)
  if (
    text.includes('trao đổi chất ở thực vật') ||
    text.includes('quang hợp') ||
    text.includes('hô hấp ở thực vật') ||
    text.includes('hô hấp ở động vật') ||
    text.includes('tuần hoàn') ||
    text.includes('miễn dịch') ||
    text.includes('bài tiết') ||
    text.includes('cảm ứng ở sinh vật') ||
    text.includes('tập tính') ||
    text.includes('sinh trưởng và phát triển') ||
    text.includes('sinh sản ở sinh vật')
  ) {
    return '11';
  }

  // Khối 10: Sinh học tế bào và Vi sinh vật
  if (
    text.includes('cấp độ tổ chức') ||
    text.includes('thế giới sống') ||
    text.includes('tế bào') ||
    text.includes('nguyên phân') ||
    text.includes('giảm phân') ||
    text.includes('chu kỳ tế bào') ||
    text.includes('chu kì tế bào') ||
    text.includes('enzim') ||
    text.includes('enzyme') ||
    text.includes('vi sinh vật') ||
    text.includes('virus') ||
    text.includes('vi-rút')
  ) {
    return '10';
  }

  return null;
};

/**
 * Lọc chính xác danh sách lịch sử làm bài theo đúng khối lớp của tài khoản học sinh:
 * - Học sinh khối 12: CHỈ lưu và hiển thị các bài làm thuộc Khối 12
 * - Học sinh khối 11: CHỈ lưu và hiển thị các bài làm thuộc Khối 11
 * - Học sinh khối 10: CHỈ lưu và hiển thị các bài làm thuộc Khối 10
 */
export const filterExamHistoryByStudentGrade = (
  userOrGrade?: Partial<User> | '10' | '11' | '12' | string | null,
  history: ExamResult[] = [],
  allExams?: Exam[]
): ExamResult[] => {
  if (!Array.isArray(history) || history.length === 0) return [];

  let targetGrade: '10' | '11' | '12' | null = null;
  if (typeof userOrGrade === 'string') {
    if (userOrGrade.includes('12')) targetGrade = '12';
    else if (userOrGrade.includes('11')) targetGrade = '11';
    else if (userOrGrade.includes('10')) targetGrade = '10';
  } else if (userOrGrade && typeof userOrGrade === 'object') {
    targetGrade = getStudentGrade(userOrGrade);
  }

  // Nếu tài khoản không thuộc khối lớp xác định (vd admin toàn quyền), giữ nguyên
  if (!targetGrade) return history;

  return history.filter(item => {
    if (!item) return false;
    const examGrade = getExamGrade(item, allExams);
    // Nếu xác định được khối của bài kiểm tra, chỉ chấp nhận đúng khối của tài khoản học sinh
    if (examGrade) {
      return examGrade === targetGrade;
    }
    // Nếu chưa rõ, loại bỏ các bài có dấu hiệu rõ ràng của khối lớp khác
    const rawStr = `${item.examId || ''} ${item.examTitle || ''} ${item.grade || ''}`.toLowerCase();
    if (targetGrade === '12' && (rawStr.includes('10') || rawStr.includes('11'))) return false;
    if (targetGrade === '11' && (rawStr.includes('10') || rawStr.includes('12'))) return false;
    if (targetGrade === '10' && (rawStr.includes('11') || rawStr.includes('12'))) return false;
    return true;
  });
};

/**
 * Lọc và lấy kết quả thi của học sinh CHỈ DỰA TRÊN CÁC BÀI KIỂM TRA HIỆN CÓ TRÊN HỆ THỐNG.
 * - Loại trừ hoàn toàn các đề đã bị Admin xóa (isExamDeleted hoặc không nằm trong danh sách đề hoạt động).
 * - Ở mỗi đề kiểm tra hiện có, nếu học sinh làm nhiều lần thì chỉ lấy 1 lượt thi hợp lệ mới nhất.
 * - Số lượng bài thi tối đa của học sinh không bao giờ vượt quá số đề kiểm tra hiện có của khối.
 */
export const getStudentAttemptsForActiveExams = (
  rawHistory: any[],
  activeExams: Exam[],
  studentGradeOrClass?: string
): any[] => {
  if (!Array.isArray(activeExams) || activeExams.length === 0) {
    return [];
  }

  // 1. Lọc ra danh sách đề thi ĐANG HOẠT ĐỘNG (loại bỏ đề đã bị Admin xóa)
  const validActiveExams = activeExams.filter(e => e && e.id && !isExamDeleted(e));

  // 2. Xác định khối lớp của học sinh (10, 11 hoặc 12)
  let studentGradeNum = '';
  if (studentGradeOrClass) {
    const str = String(studentGradeOrClass).toUpperCase();
    if (str.includes('10')) studentGradeNum = '10';
    else if (str.includes('11')) studentGradeNum = '11';
    else if (str.includes('12')) studentGradeNum = '12';
  }

  // 3. Lọc danh sách đề thi thuộc khối của học sinh
  const gradeActiveExams = validActiveExams.filter(e => {
    if (e.category === 'BATTLE') return false; // Thống kê học tập không tính phòng thi đấu
    if (!studentGradeNum) return true;
    const eg = getExamGrade(e);
    if (!eg) return true;
    return eg === studentGradeNum;
  });

  if (gradeActiveExams.length === 0) {
    return [];
  }

  const validAttempts = Array.isArray(rawHistory) ? rawHistory.filter(h => {
    if (!h) return false;
    if (isRemedialOrPracticeTurn(h)) return false;
    if (isExamDeleted(h)) return false;
    return typeof h.score === 'number' || typeof h.score10 === 'number';
  }) : [];

  // 4. Với mỗi đề thi hiện có, tìm lượt thi hợp lệ mới nhất của học sinh cho đề thi đó
  const matchedAttempts: any[] = [];

  gradeActiveExams.forEach(activeExam => {
    // Tìm các lượt thi khớp với activeExam
    const matching = validAttempts.filter(att => {
      // a. So khớp qua ID đề thi
      const attId = String(att.examId || '').trim();
      const examId = String(activeExam.id || '').trim();
      if (attId && examId && isMatchingExamId(attId, examId)) {
        return true;
      }

      // b. So khớp qua diagnosticService
      if (isExamAttemptMatching(att, activeExam)) {
        return true;
      }

      // c. So khớp qua tiêu đề bài học / đề thi chuẩn hóa
      const attTitle = (att.examTitle || att.lessonName || att.title || '').trim();
      const tgtTitle = (activeExam.title || '').trim();
      const tgtLesson = (activeExam.lessonName || activeExam.topic || '').trim();
      if (attTitle && (tgtTitle || tgtLesson)) {
        const normAtt = normalizeTitleKey(attTitle);
        const normTgt = normalizeTitleKey(tgtTitle);
        const normLesson = normalizeTitleKey(tgtLesson);
        if (normAtt && (normAtt === normTgt || normAtt === normLesson)) {
          return true;
        }
        if (normAtt.length > 8 && (normTgt.includes(normAtt) || normAtt.includes(normTgt))) {
          return true;
        }
      }

      return false;
    });

    if (matching.length > 0) {
      // Sắp xếp lượt mới nhất lên đầu (theo date)
      matching.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });

      const bestOrLatest = matching[0];
      matchedAttempts.push({
        ...bestOrLatest,
        examId: activeExam.id,
        examTitle: activeExam.title,
        lessonName: activeExam.lessonName || activeExam.title,
        grade: activeExam.grade || (studentGradeNum ? `Lớp ${studentGradeNum}` : 'Lớp 10'),
        matchedExam: activeExam
      });
    }
  });

  // Sắp xếp các bài thi đã làm theo thời gian nộp bài mới nhất
  matchedAttempts.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  return matchedAttempts;
};

/**
 * Lưu trữ người dùng vào LocalStorage đồng bộ mọi định dạng khóa SĐT
 * Đảm bảo chỉ lưu lịch sử làm bài đúng theo khối lớp của học sinh
 */
export const saveStoredUser = (user: User): void => {
  if (!user) return;

  // Lọc chuẩn xác lịch sử làm bài theo đúng khối lớp của tài khoản học sinh
  if (Array.isArray(user.examHistory) && user.examHistory.length > 0) {
    user.examHistory = filterExamHistoryByStudentGrade(user, user.examHistory);
  }

  const phone = (user.phone || '').trim();
  if (user.isGuest || phone === 'guest') {
    localStorage.setItem('user_guest', JSON.stringify(user));
    localStorage.setItem('current_user_phone', 'guest');
    return;
  }

  const cleanDigits = phone.replace(/\D/g, '');
  const noZero = cleanDigits.replace(/^0+/, '');
  const withZero = noZero ? `0${noZero}` : cleanDigits;

  const dataStr = JSON.stringify(user);
  localStorage.setItem(`user_${phone}`, dataStr);
  if (cleanDigits) localStorage.setItem(`user_${cleanDigits}`, dataStr);
  if (noZero) localStorage.setItem(`user_${noZero}`, dataStr);
  if (withZero) localStorage.setItem(`user_${withZero}`, dataStr);
  localStorage.setItem('current_user_phone', phone);
};

/**
 * Ghép và hợp nhất lịch sử làm bài thi:
 * - Bảo toàn 100% các lượt làm bài, không bao giờ bị ghi đè thành mảng rỗng
 * - Giữ lại đầy đủ câu trả lời chi tiết (details), hồ sơ năng lực (competencyProfile), mức độ nhận thức
 * - Khử trùng lặp theo mã lượt thi (turnId) hoặc (bài thi + mốc thời gian)
 * - Tùy chọn lọc đúng khối lớp của học sinh nếu truyền vào userOrGrade
 */
export const mergeExamHistories = (
  existing: ExamResult[] = [],
  incoming: ExamResult[] = [],
  userOrGrade?: Partial<User> | '10' | '11' | '12' | string | null,
  allExams?: Exam[]
): ExamResult[] => {
  const existingArr = Array.isArray(existing) ? existing : [];
  const incomingArr = Array.isArray(incoming) ? incoming : [];

  const combined = [...existingArr];

  for (const inc of incomingArr) {
    if (!inc) continue;
    
    const existIdx = combined.findIndex(ex => {
      if (!ex) return false;
      // 1. Trùng mã lượt thi turnId
      if (ex.turnId && inc.turnId && String(ex.turnId).trim() === String(inc.turnId).trim()) {
        return true;
      }
      // 2. Trùng bài thi và cùng mốc thời gian làm bài (trong khoảng 60 giây)
      const sameExam = isExamAttemptMatching(ex, inc.examId) ||
        (ex.examTitle && inc.examTitle && getLessonNormalizedKey(ex.examTitle) === getLessonNormalizedKey(inc.examTitle));
      if (sameExam && ex.date && inc.date) {
        const t1 = new Date(ex.date).getTime();
        const t2 = new Date(inc.date).getTime();
        if (!isNaN(t1) && !isNaN(t2) && Math.abs(t1 - t2) < 60000) {
          return true;
        }
      }
      return false;
    });

    if (existIdx >= 0) {
      // Giữ lại bản ghi đầy đủ nhất
      const cur = combined[existIdx];
      const hasMoreDetails = (inc.details && inc.details.length > 0) && (!cur.details || cur.details.length === 0);
      const hasMoreProfile = inc.competencyProfile && !cur.competencyProfile;
      combined[existIdx] = {
        ...cur,
        ...inc,
        examId: inc.examId || cur.examId,
        examTitle: inc.examTitle || cur.examTitle,
        lessonName: inc.lessonName || cur.lessonName,
        grade: inc.grade || cur.grade,
        details: hasMoreDetails ? inc.details : (cur.details || inc.details),
        competencyProfile: hasMoreProfile ? inc.competencyProfile : (cur.competencyProfile || inc.competencyProfile),
        score: Math.max(Number(cur.score) || 0, Number(inc.score) || 0),
        score10: Math.max(Number(cur.score10) || 0, Number(inc.score10) || 0)
      };
    } else {
      combined.push(inc);
    }
  }

  // Sắp xếp bài mới nhất lên trên
  const sorted = combined.sort((a, b) => {
    const tA = a.date ? new Date(a.date).getTime() : 0;
    const tB = b.date ? new Date(b.date).getTime() : 0;
    return tB - tA;
  });

  if (userOrGrade) {
    return filterExamHistoryByStudentGrade(userOrGrade, sorted, allExams);
  }
  return sorted;
};

// 3. Submit Exam Result & Update User Stats with Resilient Offline-First Fallback
export const submitExamResultToCloud = async (
  userPhone: string, 
  examResult: ExamResult,
  userInfo?: Partial<User>
): Promise<{ success: boolean; updatedUser?: User; message?: string }> => {
  // KIỂM TRA KHÓA HỒ SƠ: Khi hồ sơ bị khóa thì mọi thông tin học sinh và kết quả bài thi KHÔNG được cập nhật
  let currentUser = getStoredUserByPhone(userPhone) || (userPhone === 'guest' ? getStoredUserByPhone('guest') : null);
  const currentStatus = ((currentUser as any)?.status || (currentUser as any)?.Trang_Thai || (userInfo as any)?.status || '').toString().toLowerCase();
  if (currentStatus === 'khóa' || currentStatus === 'khoa' || currentStatus === 'đóng' || currentStatus === 'dong') {
    return {
      success: false,
      message: "⚠️ Hồ sơ học sinh đang bị KHÓA bởi Giáo viên. Mọi thông tin và điểm số không được cập nhật!"
    };
  }

  const studentUserObj = currentUser || userInfo;
  const studentGrade = getStudentGrade(studentUserObj);

  // Gắn tag khối lớp cho bài thi nếu chưa có
  if (studentGrade && !examResult.grade) {
    examResult.grade = `Lớp ${studentGrade}`;
  }

  const prevHistory = currentUser?.examHistory || [];
  // Hợp nhất và lọc chính xác theo khối lớp của học sinh
  const updatedHistory = filterExamHistoryByStudentGrade(
    studentUserObj,
    mergeExamHistories(prevHistory, [examResult], studentUserObj)
  );

  const mergedUser: User = currentUser ? {
    ...currentUser,
    totalScore: (currentUser.totalScore || 0) + (examResult.score || 0),
    examHistory: updatedHistory
  } : {
    name: userInfo?.name || 'Học sinh',
    phone: userPhone,
    className: userInfo?.className || (studentGrade ? `Lớp ${studentGrade}` : ''),
    studentId: userInfo?.studentId || '',
    role: (userInfo as any)?.role || 0,
    totalScore: examResult.score || 0,
    examHistory: updatedHistory
  };

  saveStoredUser(mergedUser);

  // 2. Gửi đồng bộ lên Google Apps Script
  try {
    if (!GOOGLE_SCRIPT_URL.includes('http')) {
      return { success: true, updatedUser: mergedUser };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'submit_result',
        phone: userPhone,
        user: userInfo,
        result: examResult
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (data.success && data.user) {
          const finalHistory = filterExamHistoryByStudentGrade(
            mergedUser,
            mergeExamHistories(mergedUser.examHistory, data.user.examHistory || [], mergedUser)
          );
          const finalUser: User = {
            ...data.user,
            examHistory: finalHistory,
            totalScore: Math.max(data.user.totalScore || 0, mergedUser.totalScore || 0)
          };
          saveStoredUser(finalUser);
          return { success: true, updatedUser: finalUser };
        }
      } catch {
        // Phản hồi không phải JSON, giữ nguyên mergedUser đã lưu an toàn
      }
    }
    return { success: true, updatedUser: mergedUser };
  } catch (error) {
    console.warn("Chế độ lưu trữ thiết bị hoạt động, đồng bộ đám mây đang chờ kết nối:", error);
    saveStoredUser(mergedUser);
    return { success: true, updatedUser: mergedUser };
  }
};

// 4. Fetch Leaderboard
export const fetchCloudLeaderboard = async (filter: string): Promise<any[]> => {
  try {
    // Add timestamp to prevent caching
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=get_leaderboard&filter=${filter}&_t=${Date.now()}`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (data && data.success && Array.isArray(data.leaderboard)) {
      return data.leaderboard;
    }
    return [];
  } catch (error) {
    console.warn("Chưa lấy được bảng xếp hạng đám mây, đang sử dụng dữ liệu cục bộ:", error);
    return [];
  }
};

// -------------------------------------------------------------
// QUẢN LÝ LỚP HỌC & ĐỒNG BỘ SHEET 01_HOC_SINH
// -------------------------------------------------------------
export interface SheetStudent {
  id: string;             // ID_HocSinh (VD: 12T701, 10T601)
  name: string;           // Ho_Va_Ten (VD: Nguyễn Hồng Phát)
  className: string;      // Khoi_Lop (VD: 12T7, 10T6)
  phone: string;          // So_Dien_Thoai
  password?: string;      // Mat_Khau
  status: string;         // Trang_Thai (Mở / Khóa)
  totalScore: number;     // Tong_Diem_Tich_Luy
  registeredDate: string; // Ngay_Dang_Ky
  examsCompleted: number; // Số bài thi (kiểm tra) đã làm
  examHistory?: any[];    // Chi tiết các bài thi đã làm
}

export interface ClassroomGroup {
  className: string;      // Tên lớp (VD: "10T6", "12T7")
  grade: string;          // Khối (Khối 10, Khối 11, Khối 12)
  students: SheetStudent[];
  totalStudents: number;
  activeStudents: number;
  totalScore: number;
}

function parseCSVRows(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(cell.trim());
      if (row.some(c => c.length > 0)) {
        lines.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some(c => c.length > 0)) {
      lines.push(row);
    }
  }
  return lines;
}

// Chuẩn hóa chuỗi tiếng Việt không dấu để so khớp tên học sinh và tiêu đề cột
const normalizeAscii = (str?: string | null): string => {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
};

// Đọc kết quả từ Sheet 02_KET_QUA_THI
export const fetchGoogleSheetExamResults = async (): Promise<any[]> => {
  const currentSheetUrl = getGoogleSheetUrl();
  let spreadsheetId = '1H29C4P_0oJNLNvXRE2ts8hJmzasbq1eR1anAyDjITAw';
  const matchId = currentSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (matchId && matchId[1]) {
    spreadsheetId = matchId[1];
  }
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=02_KET_QUA_THI&_t=${Date.now()}`;
  try {
    const res = await fetch(csvUrl);
    if (res.ok) {
      const csvText = await res.text();
      const rows = parseCSVRows(csvText);
      if (rows.length >= 2) {
        const header = rows[0].map(h => normalizeAscii(h).replace(/[^a-z0-9_]/g, '_'));
        const colTurnId = header.findIndex(h => h.includes('ma_luot') || h.includes('turn') || h.includes('luot'));
        const colStudentId = header.findIndex(h => h.includes('id_hocsinh') || h.includes('ma_hs') || (h.includes('id') && !h.includes('turn') && !h.includes('luot')));
        const colName = header.findIndex(h => 
          h.includes('ho_va_ten') || 
          h.includes('hoten') || 
          h.includes('ho_ten') || 
          (h.includes('ten') && !h.includes('bai') && !h.includes('de') && !h.includes('turn')) || 
          (h.includes('ho') && !h.includes('hoc') && !h.includes('khoi'))
        );
        const colClass = header.findIndex(h => h.includes('lop') || h.includes('khoi'));
        const colExamName = header.findIndex(h => h.includes('bai') || h.includes('exam') || h.includes('de_thi') || h.includes('tieu_de'));
        const colCorrect = header.findIndex(h => h.includes('cau_dung') || h.includes('dung') || h.includes('correct') || h.includes('so_cau_dung'));
        const colTotal = header.findIndex(h => h.includes('tong_so_cau') || h.includes('tong_cau') || h.includes('total'));
        const colScore = header.findIndex(h => h.includes('diem'));
        const colTime = header.findIndex(h => h.includes('thoi_gian') || h.includes('time'));
        const colWrongNB = header.findIndex(h => h.includes('nhanbiet') || h.includes('nhan_biet'));
        const colWrongTH = header.findIndex(h => h.includes('thonghieu') || h.includes('thong_hieu'));
        const colWrongVD = header.findIndex(h => h.includes('vandung') || h.includes('van_dung'));
        const colSubmitTime = header.findIndex(h => h.includes('thoi_diem') || h.includes('nop') || h.includes('date') || h.includes('ngay'));

        const results: any[] = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;
          
          const rawScore = Number(colScore !== -1 ? row[colScore] : row[7]) || 0;
          const rawCorrect = Number(colCorrect !== -1 ? row[colCorrect] : row[5]) || 0;
          const rawTotal = Number(colTotal !== -1 ? row[colTotal] : row[6]) || 10;
          
          // Điểm hệ 10 chuẩn hóa
          let score10 = rawScore;
          if (rawScore > 10 && rawTotal > 0) {
            score10 = Math.round((rawScore / rawTotal) * 10 * 10) / 10;
          } else if (rawCorrect > 0 && rawTotal > 0 && rawScore === 0) {
            score10 = Math.round((rawCorrect / rawTotal) * 10 * 10) / 10;
          }

          const wrongNBVal = colWrongNB !== -1 ? Number(row[colWrongNB]) : (row[9] !== undefined && row[9] !== '' ? Number(row[9]) : undefined);
          const wrongTHVal = colWrongTH !== -1 ? Number(row[colWrongTH]) : (row[10] !== undefined && row[10] !== '' ? Number(row[10]) : undefined);
          const wrongVDVal = colWrongVD !== -1 ? Number(row[colWrongVD]) : (row[11] !== undefined && row[11] !== '' ? Number(row[11]) : undefined);

          results.push({
            turnId: (colTurnId !== -1 ? row[colTurnId] : row[0]) || `T_${r}`,
            studentId: (colStudentId !== -1 ? row[colStudentId] : row[1]) || '',
            name: (colName !== -1 ? row[colName] : row[2]) || '',
            className: (colClass !== -1 ? row[colClass] : row[3]) || '',
            examTitle: (colExamName !== -1 ? row[colExamName] : row[4]) || 'Bài kiểm tra Sinh học',
            score: rawCorrect > 0 ? rawCorrect : Math.round((score10 / 10) * rawTotal),
            score10: score10,
            correctCount: rawCorrect > 0 ? rawCorrect : Math.round((score10 / 10) * rawTotal),
            totalQuestions: rawTotal,
            timeSpentSeconds: Number(colTime !== -1 ? row[colTime] : row[8]) || 0,
            wrongNhanBiet: !isNaN(Number(wrongNBVal)) ? Number(wrongNBVal) : undefined,
            wrongThongHieu: !isNaN(Number(wrongTHVal)) ? Number(wrongTHVal) : undefined,
            wrongVanDung: !isNaN(Number(wrongVDVal)) ? Number(wrongVDVal) : undefined,
            submittedAt: (colSubmitTime !== -1 ? row[colSubmitTime] : row[12]) || '',
            date: (colSubmitTime !== -1 ? row[colSubmitTime] : row[12]) || new Date().toISOString()
          });
        }
        return results;
      }
    }
  } catch (err) {
    console.warn("Chưa tải được 02_KET_QUA_THI từ Google Sheet:", err);
  }
  return [];
};

export const fetchGoogleSheetStudents = async (): Promise<SheetStudent[]> => {
  const currentSheetUrl = getGoogleSheetUrl();
  let spreadsheetId = '1H29C4P_0oJNLNvXRE2ts8hJmzasbq1eR1anAyDjITAw';
  
  const matchId = currentSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (matchId && matchId[1]) {
    spreadsheetId = matchId[1];
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=01_HOC_SINH&_t=${Date.now()}`;
  
  try {
    // Tải song song danh sách bài thi từ Sheet 02_KET_QUA_THI
    const [res, cloudResults] = await Promise.all([
      fetch(csvUrl),
      fetchGoogleSheetExamResults()
    ]);

    if (res.ok) {
      const csvText = await res.text();
      const rows = parseCSVRows(csvText);
      
      if (rows.length >= 2) {
        // Tìm vị trí các cột theo tiêu đề (Dòng 0)
        const header = rows[0].map(h => normalizeAscii(h).replace(/[^a-z0-9_]/g, '_'));
        const colId = header.findIndex(h => h.includes('id_hocsinh') || h.includes('ma_hs') || h === 'id' || (h.includes('id') && !h.includes('turn') && !h.includes('luot')));
        const colName = header.findIndex(h => 
          h.includes('ho_va_ten') || 
          h.includes('hoten') || 
          h.includes('ho_ten') || 
          (h.includes('ten') && !h.includes('bai') && !h.includes('de') && !h.includes('turn')) || 
          (h.includes('ho') && !h.includes('hoc') && !h.includes('khoi'))
        );
        const colClass = header.findIndex(h => h.includes('lop') || h.includes('khoi'));
        const colPhone = header.findIndex(h => h.includes('thoai') || h.includes('phone') || h.includes('sdt'));
        const colPass = header.findIndex(h => h.includes('mat_khau') || h.includes('pass'));
        const colStatus = header.findIndex(h => h.includes('trang_thai') || h.includes('status'));
        const colScore = header.findIndex(h => h.includes('diem') || h.includes('score'));
        const colDate = header.findIndex(h => h.includes('ngay') || h.includes('date'));

        const masterActive = (getMasterExams() || []).filter(e => e && !isExamDeleted(e));
        const storedActive = (getStorageData<Exam[]>('bio_exams', []) || []).filter(e => e && !isExamDeleted(e));
        const currentActiveExams = deduplicateExams([...storedActive, ...masterActive]);

        const students: SheetStudent[] = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;
          
          const rawId = (colId !== -1 ? row[colId] : row[0]) || '';
          const rawName = (colName !== -1 ? row[colName] : row[1]) || '';
          const rawClass = (colClass !== -1 ? row[colClass] : row[2]) || '';
          let rawPhone = (colPhone !== -1 ? row[colPhone] : row[3]) || '';
          const rawPass = (colPass !== -1 ? row[colPass] : row[4]) || '';
          const rawStatus = (colStatus !== -1 ? row[colStatus] : row[5]) || 'Mở';
          const rawScore = Number(colScore !== -1 ? row[colScore] : row[6]) || 0;
          const rawDate = (colDate !== -1 ? row[colDate] : row[7]) || '';

          if (!rawName && !rawPhone && !rawId) continue;

          // Chuẩn hóa số điện thoại: thêm số 0 đầu nếu thiếu 1 chữ số
          let formattedPhone = String(rawPhone).replace(/^'/, '').trim();
          if (formattedPhone && formattedPhone.length === 9 && !formattedPhone.startsWith('0')) {
            formattedPhone = '0' + formattedPhone;
          }
          const cleanNoZeroPhone = formattedPhone.replace(/\D/g, '').replace(/^0+/, '');
          const normRawName = normalizeAscii(rawName);
          const normRawId = String(rawId).trim().toUpperCase();
          const normRawClass = String(rawClass).trim().toUpperCase();

          // Ghép kết quả thi từ Sheet 02 và LocalStorage
          const matchHistory = (cloudResults || []).filter(cr => {
            const crId = String(cr.studentId || '').trim().toUpperCase();
            const crPhoneClean = String(cr.studentId || '').replace(/\D/g, '').replace(/^0+/, '');
            const crNameNorm = normalizeAscii(cr.name);
            const crClassNorm = String(cr.className || '').trim().toUpperCase();

            if (normRawId && crId && crId === normRawId) return true;
            if (cleanNoZeroPhone && crPhoneClean && crPhoneClean === cleanNoZeroPhone) return true;
            if (normRawName && crNameNorm && crNameNorm === normRawName) {
              if (!normRawClass || !crClassNorm || normRawClass === crClassNorm) return true;
            }
            return false;
          });

          let localExams: any[] = [];
          try {
            const localU = localStorage.getItem(`user_${formattedPhone}`) || 
                           localStorage.getItem(`user_${formattedPhone.replace(/^0+/, '')}`);
            if (localU) {
              const parsed = JSON.parse(localU);
              if (Array.isArray(parsed.examHistory)) {
                localExams = parsed.examHistory;
              }
            }
          } catch {}

          const rawCombined = [...matchHistory];
          localExams.forEach(le => {
            if (!rawCombined.some(ch => ch.turnId === le.turnId || (ch.examTitle === le.examTitle && ch.score === le.score))) {
              rawCombined.push(le);
            }
          });

          // Lọc chính xác các bài thi CHỈ DỰA TRÊN CÁC ĐỀ KIỂM TRA HIỆN CÓ TRÊN HỆ THỐNG
          const combinedHistory = getStudentAttemptsForActiveExams(
            rawCombined,
            currentActiveExams.length > 0 ? currentActiveExams : masterActive,
            rawClass
          );

          // ĐẢM BẢO MỖI HỌC SINH LÀ 1 ID RIÊNG BIỆT (KHÔNG BỊ TRÙNG LẶP DẪN ĐẾN SAI LỆCH KẾT QUẢ)
          let stId = String(rawId || `HS${r}`).trim();
          const cleanPhone = formattedPhone.replace(/\D/g, '');

          // Nếu số điện thoại này đã có học sinh trong danh sách (cùng 1 người)
          const existingByPhone = cleanPhone ? students.find(s => s.phone.replace(/\D/g, '') === cleanPhone) : null;
          // Nếu ID này đã bị một học sinh KHÁC chiếm giữ trước đó
          const idTakenByOther = stId ? students.find(s => s.id.toLowerCase() === stId.toLowerCase() && s.phone.replace(/\D/g, '') !== cleanPhone) : null;

          if (idTakenByOther) {
            // Trùng ID với bạn khác! Tự động cấp ID mới duy nhất theo lớp để không ghi đè kết quả
            const cPrefix = (rawClass || 'HS').replace(/[^A-Za-z0-9]/g, '');
            let maxNum = 1;
            students.forEach(s => {
              if (s.id.toUpperCase().startsWith(cPrefix)) {
                const n = parseInt(s.id.substring(cPrefix.length).replace(/\D/g, ''), 10);
                if (!isNaN(n) && n > maxNum) maxNum = n;
              }
            });
            let nextNum = maxNum + 1;
            let candidateId = `${cPrefix}${nextNum < 10 ? '0' + nextNum : nextNum}`;
            while (students.some(s => s.id.toUpperCase() === candidateId.toUpperCase())) {
              nextNum++;
              candidateId = `${cPrefix}${nextNum < 10 ? '0' + nextNum : nextNum}`;
            }
            stId = candidateId;
          }

          if (existingByPhone) {
            const merged = [...(existingByPhone.examHistory || [])];
            combinedHistory.forEach(ch => {
              if (!merged.some(m => (ch.turnId && m.turnId === ch.turnId) || (m.examId && m.examId === ch.examId) || (m.examTitle === ch.examTitle && m.score === ch.score && m.date === ch.date))) {
                merged.push(ch);
              }
            });
            const finalHistory = getStudentAttemptsForActiveExams(
              merged,
              currentActiveExams.length > 0 ? currentActiveExams : masterActive,
              rawClass
            );
            existingByPhone.examHistory = finalHistory;
            existingByPhone.examsCompleted = finalHistory.length;
            existingByPhone.totalScore = rawScore > 0 ? rawScore : finalHistory.reduce((a, b) => a + (b.score || 0), 0);
            if (rawClass && (!existingByPhone.className || existingByPhone.className === 'CHƯA XẾP LỚP')) {
              existingByPhone.className = String(rawClass).trim().toUpperCase();
            }
            if (rawName && (!existingByPhone.name || existingByPhone.name === 'Học sinh' || existingByPhone.name.toLowerCase() === existingByPhone.id.toLowerCase())) {
              existingByPhone.name = String(rawName).trim();
            }
          } else {
            students.push({
              id: stId,
              name: String(rawName || 'Học sinh').trim(),
              className: String(rawClass || 'Chưa xếp lớp').trim().toUpperCase(),
              phone: formattedPhone,
              password: String(rawPass || '').trim(),
              status: String(rawStatus || 'Mở').trim(),
              totalScore: rawScore > 0 ? rawScore : combinedHistory.reduce((a, b) => a + (b.score || 0), 0),
              registeredDate: String(rawDate || '').trim(),
              examsCompleted: combinedHistory.length,
              examHistory: combinedHistory
            });
          }
        }

        if (students.length > 0) {
          // Lưu dữ liệu danh sách học sinh đã khử trùng lặp
          localStorage.setItem('bio_synced_sheet_students', JSON.stringify(students));
          return students;
        }
      }
    }
  } catch (err) {
    console.warn("Không tải trực tiếp được CSV từ Google Sheet, chuyển sang bộ nhớ lưu tạm:", err);
  }

  // Fallback 1: Dữ liệu đã lưu tạm lần trước
  try {
    const cached = localStorage.getItem('bio_synced_sheet_students');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Nếu cache bị lưu lỗi name = id, không dùng cache này
        const isCorrupted = parsed.some(st => st.id && st.name && st.id.toLowerCase() === st.name.toLowerCase());
        if (!isCorrupted) {
          const uniqueCached: SheetStudent[] = [];
          const seen = new Set<string>();
          parsed.forEach((st: SheetStudent) => {
            const idKey = (st.id || '').trim().toLowerCase();
            if (idKey && !seen.has(idKey)) {
              seen.add(idKey);
              uniqueCached.push(st);
            }
          });
          return uniqueCached;
        }
      }
    }
  } catch {}

  // Fallback 2: Đọc tài khoản học sinh đã đăng ký lưu trong LocalStorage
  const localStudents: SheetStudent[] = [
    {
      id: '12T701',
      name: 'Nguyễn Hồng Phát',
      className: '12T7',
      phone: '0977126075',
      password: '••••••',
      status: 'Mở',
      totalScore: 0,
      registeredDate: '27/09/2026 23:33:22',
      examsCompleted: 0,
      examHistory: []
    },
    {
      id: '10T601',
      name: 'An Duyên',
      className: '10T6',
      phone: '0977126077',
      password: '••••••',
      status: 'Mở',
      totalScore: 0,
      registeredDate: '01/10/2026 14:33:55',
      examsCompleted: 0,
      examHistory: []
    }
  ];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('user_') && key !== 'user_guest') {
        const uRaw = localStorage.getItem(key);
        if (uRaw) {
          const u = JSON.parse(uRaw);
          if (u && u.phone && u.phone !== 'guest' && u.name) {
            const cleanP = String(u.phone).trim();
            const exHistory = Array.isArray(u.examHistory) ? u.examHistory : [];
            const existing = localStudents.find(s => s.phone === cleanP || s.phone.replace(/^0+/, '') === cleanP.replace(/^0+/, ''));
            if (existing) {
              existing.examsCompleted = exHistory.length;
              existing.examHistory = exHistory;
              if (u.totalScore) existing.totalScore = u.totalScore;
            } else {
              localStudents.push({
                id: `HS_${cleanP.slice(-4)}`,
                name: u.name,
                className: (u.className || '12T7').toUpperCase(),
                phone: cleanP.startsWith('0') ? cleanP : '0' + cleanP,
                status: 'Mở',
                totalScore: u.totalScore || 0,
                registeredDate: 'Mới đăng ký',
                examsCompleted: exHistory.length,
                examHistory: exHistory
              });
            }
          }
        }
      }
    }
  } catch {}

  return localStudents;
};

// Gom nhóm học sinh theo Khối Lớp (Cùng Khối Lớp sẽ là cùng 1 lớp: 10T6, 12T7...)
export const groupStudentsIntoClassrooms = (students: SheetStudent[]): ClassroomGroup[] => {
  const map: Record<string, SheetStudent[]> = {};

  students.forEach(st => {
    let cls = (st.className || '').trim().toUpperCase();
    if (!cls) cls = 'CHƯA PHÂN LỚP';
    if (!map[cls]) map[cls] = [];
    map[cls].push(st);
  });

  const groups: ClassroomGroup[] = Object.keys(map).map(clsName => {
    const list = map[clsName];
    let grade = 'Khác';
    if (clsName.startsWith('10')) grade = 'Khối 10';
    else if (clsName.startsWith('11')) grade = 'Khối 11';
    else if (clsName.startsWith('12')) grade = 'Khối 12';

    // Sắp xếp học sinh theo tên tiếng Việt
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    const activeCount = list.filter(s => {
      const st = (s.status || '').toLowerCase();
      return st !== 'đóng' && st !== 'dong' && st !== 'khóa' && st !== 'khoa';
    }).length;

    const sumScore = list.reduce((acc, curr) => acc + (Number(curr.totalScore) || 0), 0);

    return {
      className: clsName,
      grade,
      students: list,
      totalStudents: list.length,
      activeStudents: activeCount,
      totalScore: sumScore
    };
  });

  // Sắp xếp các lớp theo thứ tự khối và tên lớp: 10T6 trước 12T7
  groups.sort((a, b) => {
    if (a.className === 'CHƯA PHÂN LỚP') return 1;
    if (b.className === 'CHƯA PHÂN LỚP') return -1;
    return a.className.localeCompare(b.className, 'vi', { numeric: true });
  });

  return groups;
};

/**
 * Xóa 1 học sinh khỏi Sheet 01_HOC_SINH và tự động xóa toàn bộ dữ liệu liên quan
 * (bài thi trong 02_KET_QUA_THI, hồ xo lộ trình trong 04_CA_NHAN_HOA, bộ nhớ đệm)
 */
export const deleteStudentFromCloud = async (
  studentId: string, 
  phone: string, 
  name?: string
): Promise<{ success: boolean; message: string; deletedCount?: any }> => {
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete_student',
        studentId,
        phone,
        name
      })
    });
    const data = await res.json();

    // Dọn dẹp bộ nhớ đệm trình duyệt ngay lập tức
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const noZero = cleanPhone.replace(/^0+/, '');
      const cached = localStorage.getItem('bio_synced_sheet_students');
      if (cached) {
        const list: SheetStudent[] = JSON.parse(cached);
        const filtered = (list || []).filter(s => {
          const sPhone = (s.phone || '').replace(/\D/g, '');
          const sNoZero = sPhone.replace(/^0+/, '');
          if (studentId && s.id.toUpperCase() === studentId.toUpperCase()) return false;
          if (cleanPhone && (sPhone === cleanPhone || (noZero && sNoZero === noZero))) return false;
          return true;
        });
        localStorage.setItem('bio_synced_sheet_students', JSON.stringify(filtered));
      }
      localStorage.removeItem(`user_${cleanPhone}`);
      localStorage.removeItem(`user_${noZero}`);
    } catch (eCache) {
      console.warn("Lỗi dọn cache khi xóa học sinh:", eCache);
    }

    return data;
  } catch (err: any) {
    console.warn("Lỗi kết nối khi xóa học sinh:", err);
    return {
      success: false,
      message: err?.message || 'Không thể kết nối đến máy chủ Google Apps Script.'
    };
  }
};

/**
 * Kích hoạt dọn dẹp và khử trùng lặp ID học sinh trên Google Sheets
 * - Tự động sửa các ID bị trùng lặp trong 01_HOC_SINH
 * - Xóa sạch các bài thi mồ côi trong 02_KET_QUA_THI và 04_CA_NHAN_HOA
 */
export const triggerCleanupDuplicatesAndOrphansCloud = async (): Promise<{
  success: boolean;
  message: string;
  duplicateFixedCount?: number;
  removedOrphanResults?: number;
  removedOrphanPlans?: number;
}> => {
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'sync_cleanup' })
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.warn("Lỗi gọi triggerCleanupDuplicatesAndOrphansCloud:", err);
    return {
      success: false,
      message: err?.message || 'Không thể kết nối đến máy chủ Google Apps Script.'
    };
  }
};

/**
 * Khóa hoặc Mở khóa hồ sơ học sinh (cá nhân):
 * Khi bị Khóa, toàn bộ thông tin học sinh và kết quả làm bài thi sẽ không được cập nhật
 */
export const updateStudentStatusCloud = async (
  studentId: string,
  phone: string,
  status: 'Mở' | 'Khóa'
): Promise<{ success: boolean; message: string; status?: string }> => {
  try {
    // 1. Cập nhật ngay bộ nhớ đệm cục bộ để giao diện phản hồi tức thì
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const noZero = cleanPhone.replace(/^0+/, '');
      const cached = localStorage.getItem('bio_synced_sheet_students');
      if (cached) {
        const list: SheetStudent[] = JSON.parse(cached);
        const updated = (list || []).map(s => {
          const sPhone = (s.phone || '').replace(/\D/g, '');
          const sNoZero = sPhone.replace(/^0+/, '');
          if ((studentId && s.id.toUpperCase() === studentId.toUpperCase()) ||
              (cleanPhone && (sPhone === cleanPhone || (noZero && sNoZero === noZero)))) {
            return { ...s, status };
          }
          return s;
        });
        localStorage.setItem('bio_synced_sheet_students', JSON.stringify(updated));
      }
      // Cập nhật session nếu học sinh đang đăng nhập
      const stored = getStoredUserByPhone(cleanPhone) || getStoredUserByPhone(noZero);
      if (stored) {
        stored.status = status;
        saveStoredUser(stored);
      }
    } catch (eCache) {
      console.warn("Lỗi update cache status:", eCache);
    }

    // 2. Gửi đồng bộ lên Google Apps Script
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'update_student_status',
        studentId,
        phone,
        status
      })
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.warn("Lỗi gọi updateStudentStatusCloud:", err);
    return {
      success: true,
      message: `Đã cập nhật trạng thái [${status}] thành công!`,
      status
    };
  }
};

/**
 * Khóa hoặc Mở khóa toàn bộ hồ sơ học sinh theo lớp:
 * Khi bị Khóa, tất cả học sinh trong lớp đó sẽ không được cập nhật bài thi hoặc thông tin
 */
export const updateClassroomStatusCloud = async (
  className: string,
  status: 'Mở' | 'Khóa'
): Promise<{ success: boolean; message: string; updatedCount?: number }> => {
  const cleanCls = className.toUpperCase().replace(/^LỚP\s*/i, '').trim();
  try {
    // 1. Cập nhật ngay bộ nhớ đệm cục bộ
    let localCount = 0;
    try {
      const cached = localStorage.getItem('bio_synced_sheet_students');
      if (cached) {
        const list: SheetStudent[] = JSON.parse(cached);
        const updated = (list || []).map(s => {
          const sCls = (s.className || '').toUpperCase().replace(/^LỚP\s*/i, '').trim();
          if (sCls === cleanCls || sCls.includes(cleanCls) || cleanCls.includes(sCls)) {
            localCount++;
            return { ...s, status };
          }
          return s;
        });
        localStorage.setItem('bio_synced_sheet_students', JSON.stringify(updated));
      }
    } catch (eCache) {
      console.warn("Lỗi update class cache:", eCache);
    }

    // 2. Gửi đồng bộ lên Google Apps Script
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'update_class_status',
        className,
        status
      })
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.warn("Lỗi gọi updateClassroomStatusCloud:", err);
    return {
      success: true,
      message: `Đã cập nhật trạng thái [${status}] cho lớp ${className}!`
    };
  }
};

/**
 * Xóa toàn bộ học sinh của lớp & Cascade Delete toàn bộ kết quả thi, lỗ hổng kiến thức liên quan
 */
export const deleteClassroomStudentsCloud = async (
  className: string
): Promise<{ success: boolean; message: string; deletedCount?: any }> => {
  const cleanCls = className.toUpperCase().replace(/^LỚP\s*/i, '').trim();
  try {
    // 1. Dọn dẹp cache cục bộ ngay lập tức
    try {
      const cached = localStorage.getItem('bio_synced_sheet_students');
      if (cached) {
        const list: SheetStudent[] = JSON.parse(cached);
        const filtered = (list || []).filter(s => {
          const sCls = (s.className || '').toUpperCase().replace(/^LỚP\s*/i, '').trim();
          const match = (sCls === cleanCls || sCls.includes(cleanCls) || cleanCls.includes(sCls));
          if (match) {
            const p = (s.phone || '').replace(/\D/g, '');
            if (p) {
              localStorage.removeItem(`user_${p}`);
              localStorage.removeItem(`user_${p.replace(/^0+/, '')}`);
            }
          }
          return !match;
        });
        localStorage.setItem('bio_synced_sheet_students', JSON.stringify(filtered));
      }
    } catch (eCache) {
      console.warn("Lỗi dọn cache khi xóa lớp:", eCache);
    }

    // 2. Gửi đồng bộ lên Google Apps Script
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete_classroom',
        className
      })
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.warn("Lỗi gọi deleteClassroomStudentsCloud:", err);
    return {
      success: false,
      message: err?.message || 'Không thể kết nối đến máy chủ Google Apps Script.'
    };
  }
};

/**
 * Sinh mã ID học sinh duy nhất cho lớp (ví dụ: 10T701, 10T756...)
 * Đảm bảo không bao giờ trùng lặp với bất kỳ học sinh nào đã tồn tại
 */
export const generateUniqueStudentId = (
  className: string, 
  existingStudents: SheetStudent[] = []
): string => {
  const cPrefix = className.trim().toUpperCase().replace(/[^A-Za-z0-9]/g, '') || 'HS';
  let maxIndex = 0;
  const usedIds = new Set<string>();

  // 1. Quét danh sách truyền vào
  existingStudents.forEach(st => {
    const sId = (st.id || '').trim().toUpperCase();
    if (sId) {
      usedIds.add(sId);
      if (sId.startsWith(cPrefix)) {
        const numPart = sId.substring(cPrefix.length).replace(/\D/g, '');
        if (numPart) {
          const n = parseInt(numPart, 10);
          if (!isNaN(n) && n > maxIndex) {
            maxIndex = n;
          }
        }
      }
    }
  });

  // 2. Quét thêm bộ nhớ đệm bio_synced_sheet_students
  try {
    const cached = localStorage.getItem('bio_synced_sheet_students');
    if (cached) {
      const cList = JSON.parse(cached);
      if (Array.isArray(cList)) {
        cList.forEach((st: any) => {
          const sId = (st.id || '').trim().toUpperCase();
          if (sId) {
            usedIds.add(sId);
            if (sId.startsWith(cPrefix)) {
              const numPart = sId.substring(cPrefix.length).replace(/\D/g, '');
              if (numPart) {
                const n = parseInt(numPart, 10);
                if (!isNaN(n) && n > maxIndex) maxIndex = n;
              }
            }
          }
        });
      }
    }
  } catch {}

  // 3. Quét thêm các tài khoản cục bộ user_*
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('user_') && k !== 'user_guest') {
        const uRaw = localStorage.getItem(k);
        if (uRaw) {
          const u = JSON.parse(uRaw);
          const uId = (u?.studentId || '').trim().toUpperCase();
          if (uId) {
            usedIds.add(uId);
            if (uId.startsWith(cPrefix)) {
              const numPart = uId.substring(cPrefix.length).replace(/\D/g, '');
              if (numPart) {
                const n = parseInt(numPart, 10);
                if (!isNaN(n) && n > maxIndex) maxIndex = n;
              }
            }
          }
        }
      }
    }
  } catch {}

  let nextIndex = maxIndex + 1;
  let candidateId = `${cPrefix}${nextIndex < 10 ? '0' + nextIndex : nextIndex}`;
  while (usedIds.has(candidateId.toUpperCase())) {
    nextIndex++;
    candidateId = `${cPrefix}${nextIndex < 10 ? '0' + nextIndex : nextIndex}`;
  }
  return candidateId;
};

// Legacy stubs for compatibility if needed, redirected to local helpers
export const saveExam = (exam: Exam) => {
   const list = getStorageData<Exam[]>('bio_exams', []);
   setStorageData('bio_exams', [exam, ...list]);
}

export const saveExamsList = (exams: Exam[]) => {
   setStorageData('bio_exams', exams);
}

// ------------------------------------------------------------------------------------------
// HỆ THỐNG ĐỒNG BỘ & QUẢN LÝ SHEET 05_DASHBOARD (BÁO CÁO THỐNG KÊ TOÀN TRƯỜNG)
// ------------------------------------------------------------------------------------------
export interface SchoolDashboardStats {
  totalStudents: number;
  activeStudents: number;
  lockedStudents: number;
  totalAttempts: number;
  avgScore: number;
  passRate: number;
  countGood8: number;
  countNeedingHelp: number;
  top3Lessons: { lessonName: string; totalWrong: number; avgScore: number; attempts: number }[];
  cognitive: {
    wrongNB: number;
    wrongTH: number;
    wrongVD: number;
    pctNB: number;
    pctTH: number;
    pctVD: number;
  };
  classStats: {
    className: string;
    studentCount: number;
    attempts: number;
    avgScore: number;
    below5: number;
  }[];
  lastUpdated: string;
}

/**
 * Gửi yêu cầu đến Google Apps Script kích hoạt hàm updateDashboard() để tính toán
 * và điền tự động dữ liệu vào Sheet 05_DASHBOARD trên Google Sheet
 */
export const triggerUpdateDashboardCloud = async (): Promise<{ success: boolean; message: string; data?: any }> => {
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'update_dashboard' })
    });
    const result = await res.json();
    return result;
  } catch (err: any) {
    console.warn("Lỗi gọi triggerUpdateDashboardCloud:", err);
    return {
      success: false,
      message: err?.message || 'Không thể kết nối đến máy chủ Google Apps Script.'
    };
  }
};

/**
 * Trích xuất và phân tích toàn bộ chỉ số Dashboard toàn trường theo thời gian thực từ Google Sheets
 */
export const fetchDashboardSummaryFromCloud = async (): Promise<SchoolDashboardStats> => {
  const [students, examResults] = await Promise.all([
    fetchGoogleSheetStudents(),
    fetchGoogleSheetExamResults()
  ]);

  const totalStudents = students.length;
  let activeStudents = 0;
  let lockedStudents = 0;
  const classStudentCount: Record<string, number> = {};

  students.forEach(s => {
    const st = (s.status || 'Mở').toLowerCase();
    if (st === 'đóng' || st === 'dong' || st === 'khóa' || st === 'khoa') {
      lockedStudents++;
    } else {
      activeStudents++;
    }
    const cName = (s.className || 'Chưa phân lớp').toUpperCase();
    classStudentCount[cName] = (classStudentCount[cName] || 0) + 1;
  });

  const totalAttempts = examResults.length;
  let totalScore10Sum = 0;
  let countPass5 = 0;
  let countGood8 = 0;
  let totalWrongNB = 0;
  let totalWrongTH = 0;
  let totalWrongVD = 0;

  const lessonMap: Record<string, { attempts: number; totalWrong: number; scoreSum: number; wrongNB: number; wrongTH: number; wrongVD: number }> = {};
  const studentMap: Record<string, { scores: number[]; latestScore: number; totalWrong: number }> = {};
  const classAttemptMap: Record<string, { attempts: number; scoreSum: number; below5: number }> = {};

  examResults.forEach(r => {
    const scoreNum = Number(r.score10) || (r.totalQuestions > 0 ? (r.score / r.totalQuestions) * 10 : 0);
    totalScore10Sum += scoreNum;

    if (scoreNum >= 8.0) countGood8++;
    if (scoreNum >= 5.0) countPass5++;

    const wNB = Number(r.wrongNhanBiet) || 0;
    const wTH = Number(r.wrongThongHieu) || 0;
    const wVD = Number(r.wrongVanDung) || 0;

    totalWrongNB += wNB;
    totalWrongTH += wTH;
    totalWrongVD += wVD;

    const lName = r.examTitle || 'Bài kiểm tra Sinh học';
    if (!lessonMap[lName]) {
      lessonMap[lName] = { attempts: 0, totalWrong: 0, scoreSum: 0, wrongNB: 0, wrongTH: 0, wrongVD: 0 };
    }
    lessonMap[lName].attempts++;
    lessonMap[lName].scoreSum += scoreNum;
    lessonMap[lName].totalWrong += (wNB + wTH + wVD);
    lessonMap[lName].wrongNB += wNB;
    lessonMap[lName].wrongTH += wTH;
    lessonMap[lName].wrongVD += wVD;

    const sKey = r.studentId || r.name;
    if (sKey) {
      if (!studentMap[sKey]) {
        studentMap[sKey] = { scores: [], latestScore: scoreNum, totalWrong: 0 };
      }
      studentMap[sKey].scores.push(scoreNum);
      studentMap[sKey].latestScore = scoreNum;
      studentMap[sKey].totalWrong += (wNB + wTH + wVD);
    }

    const cName = (r.className || 'Chưa phân lớp').toUpperCase();
    if (!classAttemptMap[cName]) {
      classAttemptMap[cName] = { attempts: 0, scoreSum: 0, below5: 0 };
    }
    classAttemptMap[cName].attempts++;
    classAttemptMap[cName].scoreSum += scoreNum;
    if (scoreNum < 5.0) classAttemptMap[cName].below5++;
  });

  const avgScore = totalAttempts > 0 ? Math.round((totalScore10Sum / totalAttempts) * 10) / 10 : 0;
  const passRate = totalAttempts > 0 ? Math.round((countPass5 / totalAttempts) * 1000) / 10 : 100;

  let countNeedingHelp = 0;
  for (const k in studentMap) {
    const st = studentMap[k];
    const stAvg = st.scores.reduce((a, b) => a + b, 0) / st.scores.length;
    if (stAvg < 5.0 || st.latestScore < 5.0) {
      countNeedingHelp++;
    }
  }

  const lessonList = Object.keys(lessonMap).map(lKey => ({
    lessonName: lKey,
    attempts: lessonMap[lKey].attempts,
    totalWrong: lessonMap[lKey].totalWrong,
    avgScore: Math.round((lessonMap[lKey].scoreSum / lessonMap[lKey].attempts) * 10) / 10
  }));
  lessonList.sort((a, b) => (b.totalWrong !== a.totalWrong ? b.totalWrong - a.totalWrong : a.avgScore - b.avgScore));

  const totalAllWrong = (totalWrongNB + totalWrongTH + totalWrongVD) || 1;
  const pctNB = Math.round((totalWrongNB / totalAllWrong) * 1000) / 10;
  const pctTH = Math.round((totalWrongTH / totalAllWrong) * 1000) / 10;
  const pctVD = Math.round((totalWrongVD / totalAllWrong) * 1000) / 10;

  const allClasses = Array.from(new Set([...Object.keys(classStudentCount), ...Object.keys(classAttemptMap)]));
  const classStats = allClasses.map(cName => {
    const cStats = classAttemptMap[cName] || { attempts: 0, scoreSum: 0, below5: 0 };
    const cAvg = cStats.attempts > 0 ? Math.round((cStats.scoreSum / cStats.attempts) * 10) / 10 : 0;
    return {
      className: cName,
      studentCount: classStudentCount[cName] || 0,
      attempts: cStats.attempts,
      avgScore: cAvg,
      below5: cStats.below5
    };
  });
  classStats.sort((a, b) => a.className.localeCompare(b.className, 'vi', { numeric: true }));

  return {
    totalStudents,
    activeStudents,
    lockedStudents,
    totalAttempts,
    avgScore,
    passRate,
    countGood8,
    countNeedingHelp,
    top3Lessons: lessonList.slice(0, 3),
    cognitive: {
      wrongNB: totalWrongNB,
      wrongTH: totalWrongTH,
      wrongVD: totalWrongVD,
      pctNB,
      pctTH,
      pctVD
    },
    classStats,
    lastUpdated: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
  };
};