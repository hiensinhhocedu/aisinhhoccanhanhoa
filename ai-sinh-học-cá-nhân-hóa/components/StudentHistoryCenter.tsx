import React, { useState, useMemo, useEffect } from 'react';
import { User, Exam, ExamResult, StudentCompetencyProfile } from '../types';
import { 
  calculateLevel, 
  formatExamDisplayId,
  getExams,
  fetchGoogleSheetExamResults,
  mergeExamHistories,
  saveStoredUser,
  getStudentGrade,
  getExamGrade,
  filterExamHistoryByStudentGrade
} from '../services/dataService';
import { formatDisplayQuestionText } from '../services/geminiService';
import { isExamAttemptMatching } from '../services/diagnosticService';

interface StudentHistoryCenterProps {
  user: User;
  onOpenLogin?: () => void;
  onNavigateToTest?: () => void;
  onNavigateToPersonalized?: () => void;
}

export type HistorySubTab = 'OVERVIEW_ALL' | 'EXAM_HISTORY' | 'PRACTICE_HISTORY' | 'COMPETENCY_TIMELINE';

export interface NormalizedAttempt {
  id: string;
  turnId: string;
  examId: string;
  title: string;
  cleanTitle: string;
  kind: 'EXAM' | 'PRACTICE';
  practiceType?: 'MICRO_PRACTICE' | 'REMEDIAL' | 'ADAPTIVE';
  cognitiveFocus?: string;
  dateIso: string;
  timestampMs: number;
  formattedDate: string;
  formattedTime: string;
  scoreRaw: number;
  totalQuestions: number;
  score10: number;
  accuracyPercent: number;
  timeSpentSeconds: number;
  attemptNumberForExam: number;
  deltaFromPreviousAttempt: number | null;
  cognitiveStats: {
    nhanBiet: { total: number; correct: number; wrong: number };
    thongHieu: { total: number; correct: number; wrong: number };
    vanDung: { total: number; correct: number; wrong: number };
  };
  details: Array<{
    questionId: string;
    questionText: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    cognitiveLevel?: 'NHAN_BIET' | 'THONG_HIEU' | 'VAN_DUNG';
  }>;
  competencyProfile?: StudentCompetencyProfile;
  progressionChain?: number[];
}

const isPracticeAttempt = (h: ExamResult): boolean => {
  const id = (h.examId || '').toUpperCase();
  const turn = (h.turnId || '').toUpperCase();
  const title = (h.examTitle || '').toLowerCase();
  return (
    id.startsWith('PRACTICE_') ||
    id.startsWith('ADAPTIVE_') ||
    turn.startsWith('PRAC_') ||
    turn.startsWith('LT_REMEDIAL_') ||
    title.includes('[rèn luyện]') ||
    title.includes('[bù đắp]') ||
    title.includes('luyện tập thích ứng') ||
    title.includes('rèn luyện:')
  );
};

const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '01:30';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const getGradeBadge = (score10: number) => {
  if (score10 >= 8.5) {
    return {
      label: 'Ổn định / Xuất sắc',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500'
    };
  }
  if (score10 >= 7.0) {
    return {
      label: 'Đang tiến bộ',
      cls: 'bg-sky-50 text-sky-700 border-sky-200',
      dot: 'bg-sky-500'
    };
  }
  if (score10 >= 5.2) {
    return {
      label: 'Đang hình thành',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
      dot: 'bg-amber-500'
    };
  }
  return {
    label: 'Cần củng cố',
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500'
  };
};

export const StudentHistoryCenter: React.FC<StudentHistoryCenterProps> = ({
  user,
  onOpenLogin,
  onNavigateToTest,
  onNavigateToPersonalized
}) => {
  const [activeSubTab, setActiveSubTab] = useState<HistorySubTab>('OVERVIEW_ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'ALL' | 'HIGH' | 'MID' | 'LOW'>('ALL');
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [questionFilter, setQuestionFilter] = useState<'ALL' | 'WRONG' | 'CORRECT'>('ALL');
  const [systemExams, setSystemExams] = useState<Exam[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  useEffect(() => {
    getExams().then(all => {
      if (Array.isArray(all)) setSystemExams(all);
    }).catch(() => {});
  }, []);

  const handleManualSync = async () => {
    if (user.isGuest || user.phone === 'guest') {
      if (onOpenLogin) onOpenLogin();
      return;
    }
    setIsSyncing(true);
    setSyncToast(null);
    try {
      const sheetResults = await fetchGoogleSheetExamResults();
      const studentGrade = getStudentGrade(user);
      const cleanPhoneNoZero = (user.phone || '').replace(/\D/g, '').replace(/^0+/, '');
      const normName = (user.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const normId = String(user.studentId || '').trim().toUpperCase();

      const matching = (sheetResults || []).filter(sr => {
        // Chỉ chấp nhận bài thi thuộc đúng khối lớp của tài khoản học sinh
        if (studentGrade) {
          const eg = getExamGrade(sr, systemExams);
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

      const merged = filterExamHistoryByStudentGrade(
        user,
        mergeExamHistories(user.examHistory || [], matching, user, systemExams),
        systemExams
      );
      const updatedUser: User = {
        ...user,
        examHistory: merged,
        totalScore: Math.max(user.totalScore || 0, merged.reduce((s, h) => s + (h.score || 0), 0))
      };
      saveStoredUser(updatedUser);
      setSyncToast(`✅ Đã đồng bộ thành công! Hiện có ${merged.length} bài làm của Khối ${studentGrade || 12} trong lịch sử.`);
      setTimeout(() => setSyncToast(null), 4000);
    } catch {
      setSyncToast('⚠️ Không thể kết nối với Google Sheet lúc này. Lịch sử trên máy vẫn được bảo toàn.');
      setTimeout(() => setSyncToast(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Load local practice records from StudentLearningProgressView so practice progression chains are synchronized
  const localPracticeMap = useMemo(() => {
    try {
      const key = `bio_competency_practice_v2_${user.phone || 'guest'}`;
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as Record<string, { nodeId: string; scores: number[]; totalQuestions: number; correctQuestions: number; lastUpdated: string }>;
    } catch {}
    return {};
  }, [user.phone, user.examHistory]);

  // Normalize and enrich all attempts from user.examHistory (chỉ lấy bài thuộc khối lớp của học sinh)
  const allNormalizedAttempts: NormalizedAttempt[] = useMemo(() => {
    const filteredHistory = filterExamHistoryByStudentGrade(user, user?.examHistory || [], systemExams);
    const rawHistory = Array.isArray(filteredHistory) ? [...filteredHistory] : [];

    // Sort oldest -> newest first so we can calculate Attempt #1, #2 and score delta accurately
    const chronological = rawHistory
      .map((item, idx) => {
        const parsedTime = item.date ? new Date(item.date).getTime() : 0;
        return {
          raw: item,
          idx,
          timeMs: !isNaN(parsedTime) && parsedTime > 0 ? parsedTime : Date.now() - (rawHistory.length - idx) * 3600000
        };
      })
      .sort((a, b) => a.timeMs - b.timeMs);

    const examCounter: Record<string, number> = {};
    const examPrevScore: Record<string, number> = {};

    const enriched = chronological.map(({ raw, idx, timeMs }) => {
      const details = Array.isArray(raw.details) ? raw.details : [];
      const totalQ =
        typeof raw.totalQuestions === 'number' && raw.totalQuestions > 0
          ? raw.totalQuestions
          : details.length > 0
          ? details.length
          : 10;
      const scoreRaw = typeof raw.score === 'number' ? raw.score : 0;
      const score10 =
        typeof raw.score10 === 'number'
          ? Math.round(raw.score10 * 10) / 10
          : totalQ > 0
          ? Math.round((scoreRaw / totalQ) * 10 * 10) / 10
          : 0;
      const accuracyPercent = totalQ > 0 ? Math.round((scoreRaw / totalQ) * 100) : Math.round(score10 * 10);

      const isPrac = isPracticeAttempt(raw);
      const rawTitle = raw.examTitle || (isPrac ? 'Lượt rèn luyện cá nhân hóa' : 'Bài kiểm tra Sinh Học');
      const cleanTitle = rawTitle.replace(/^\[(Rèn luyện|Bù Đắp)\]\s*/i, '').trim();

      // Tự động liên kết chính xác với đề thi trong hệ thống để lấy đúng mã đề và bài học
      let resolvedExamId = raw.examId || '';
      let resolvedTitle = rawTitle;
      let resolvedCleanTitle = cleanTitle;

      if (!isPrac && systemExams.length > 0) {
        const matched = systemExams.find(e => isExamAttemptMatching(raw, e));
        if (matched) {
          resolvedExamId = matched.id;
          resolvedTitle = matched.title;
          resolvedCleanTitle = matched.title;
        }
      }

      let practiceType: 'MICRO_PRACTICE' | 'REMEDIAL' | 'ADAPTIVE' | undefined;
      if (isPrac) {
        if (rawTitle.toLowerCase().includes('bù đắp') || (raw.turnId || '').startsWith('LT_REMEDIAL_')) {
          practiceType = 'REMEDIAL';
        } else if (rawTitle.toLowerCase().includes('thích ứng')) {
          practiceType = 'ADAPTIVE';
        } else {
          practiceType = 'MICRO_PRACTICE';
        }
      }

      // Cognitive level focus if present in title (e.g. "Dịch mã · Thông hiểu")
      let cognitiveFocus: string | undefined;
      if (cleanTitle.includes('·')) {
        const parts = cleanTitle.split('·');
        cognitiveFocus = parts[parts.length - 1].trim();
      } else if (raw.competencyProfile?.weakLevel && raw.competencyProfile.weakLevel !== 'Không hổng') {
        cognitiveFocus = raw.competencyProfile.weakLevel;
      }

      const groupKey = (resolvedExamId || resolvedCleanTitle).toLowerCase();
      examCounter[groupKey] = (examCounter[groupKey] || 0) + 1;
      const attemptNum = examCounter[groupKey];
      const prevSc = examPrevScore[groupKey];
      const delta = typeof prevSc === 'number' ? Math.round((score10 - prevSc) * 10) / 10 : null;
      examPrevScore[groupKey] = score10;

      // Cognitive breakdown
      const cogStats = {
        nhanBiet: { total: 0, correct: 0, wrong: 0 },
        thongHieu: { total: 0, correct: 0, wrong: 0 },
        vanDung: { total: 0, correct: 0, wrong: 0 }
      };

      if (raw.competencyProfile?.cognitiveStats) {
        cogStats.nhanBiet = { ...raw.competencyProfile.cognitiveStats.nhanBiet };
        cogStats.thongHieu = { ...raw.competencyProfile.cognitiveStats.thongHieu };
        cogStats.vanDung = { ...raw.competencyProfile.cognitiveStats.vanDung };
      } else if (details.length > 0) {
        details.forEach((d, qIdx) => {
          const lvl =
            d.cognitiveLevel ||
            (qIdx < Math.ceil(details.length * 0.4)
              ? 'NHAN_BIET'
              : qIdx < Math.ceil(details.length * 0.75)
              ? 'THONG_HIEU'
              : 'VAN_DUNG');
          if (lvl === 'NHAN_BIET') {
            cogStats.nhanBiet.total++;
            if (d.isCorrect) cogStats.nhanBiet.correct++;
            else cogStats.nhanBiet.wrong++;
          } else if (lvl === 'THONG_HIEU') {
            cogStats.thongHieu.total++;
            if (d.isCorrect) cogStats.thongHieu.correct++;
            else cogStats.thongHieu.wrong++;
          } else {
            cogStats.vanDung.total++;
            if (d.isCorrect) cogStats.vanDung.correct++;
            else cogStats.vanDung.wrong++;
          }
        });
      } else {
        const wNB = raw.wrongNhanBiet || 0;
        const wTH = raw.wrongThongHieu || 0;
        const wVD = raw.wrongVanDung || 0;
        const tNB = Math.max(wNB, Math.round(totalQ * 0.4));
        const tTH = Math.max(wTH, Math.round(totalQ * 0.35));
        const tVD = Math.max(wVD, Math.max(0, totalQ - tNB - tTH));
        cogStats.nhanBiet = { total: tNB, correct: Math.max(0, tNB - wNB), wrong: wNB };
        cogStats.thongHieu = { total: tTH, correct: Math.max(0, tTH - wTH), wrong: wTH };
        cogStats.vanDung = { total: tVD, correct: Math.max(0, tVD - wVD), wrong: wVD };
      }

      // Check if there is a progressionChain for this practice node
      let progressionChain: number[] | undefined;
      if (isPrac && (raw.examId || '').startsWith('PRACTICE_')) {
        const nodeId = (raw.examId || '').replace('PRACTICE_', '');
        if (localPracticeMap[nodeId]?.scores) {
          progressionChain = localPracticeMap[nodeId].scores;
        }
      }

      const dObj = new Date(timeMs);
      const formattedDate = dObj.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const formattedTime = dObj.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        id: raw.turnId || `att-${idx}-${timeMs}`,
        turnId: raw.turnId || `ATT_${1000 + idx}`,
        examId: resolvedExamId,
        title: resolvedTitle,
        cleanTitle: resolvedCleanTitle,
        kind: isPrac ? ('PRACTICE' as const) : ('EXAM' as const),
        practiceType,
        cognitiveFocus,
        dateIso: raw.date || dObj.toISOString(),
        timestampMs: timeMs,
        formattedDate,
        formattedTime,
        scoreRaw,
        totalQuestions: totalQ,
        score10,
        accuracyPercent,
        timeSpentSeconds: raw.timeSpentSeconds || (isPrac ? 95 : 420),
        attemptNumberForExam: attemptNum,
        deltaFromPreviousAttempt: delta,
        cognitiveStats: cogStats,
        details: details.map((d, dIdx) => ({
          questionId: d.questionId || `q-${dIdx + 1}`,
          questionText: d.questionText || `Câu hỏi #${dIdx + 1}`,
          userAnswer: d.userAnswer || '',
          correctAnswer: d.correctAnswer || '',
          isCorrect: Boolean(d.isCorrect),
          cognitiveLevel:
            d.cognitiveLevel ||
            (dIdx < Math.ceil(details.length * 0.4)
              ? 'NHAN_BIET'
              : dIdx < Math.ceil(details.length * 0.75)
              ? 'THONG_HIEU'
              : 'VAN_DUNG')
        })),
        competencyProfile: raw.competencyProfile,
        progressionChain
      };
    });

    // Return newest first for display lists
    return enriched.reverse();
  }, [user?.examHistory, localPracticeMap, systemExams]);

  const examAttempts = useMemo(
    () => allNormalizedAttempts.filter(a => a.kind === 'EXAM'),
    [allNormalizedAttempts]
  );

  const practiceAttempts = useMemo(
    () => allNormalizedAttempts.filter(a => a.kind === 'PRACTICE'),
    [allNormalizedAttempts]
  );

  // Active list based on sub-tab and filters
  const displayedAttempts = useMemo(() => {
    const base =
      activeSubTab === 'EXAM_HISTORY'
        ? examAttempts
        : activeSubTab === 'PRACTICE_HISTORY'
        ? practiceAttempts
        : allNormalizedAttempts;

    return base.filter(att => {
      const matchQuery =
        !searchQuery.trim() ||
        att.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        att.examId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        att.turnId.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchQuery) return false;

      if (scoreFilter === 'HIGH') return att.score10 >= 8.0;
      if (scoreFilter === 'MID') return att.score10 >= 5.0 && att.score10 < 8.0;
      if (scoreFilter === 'LOW') return att.score10 < 5.0;
      return true;
    });
  }, [activeSubTab, examAttempts, practiceAttempts, allNormalizedAttempts, searchQuery, scoreFilter]);

  // Selected attempt for the Detailed Attempt Inspector (Chi tiết từng Attempt)
  const inspectedAttempt = useMemo(() => {
    if (!selectedAttemptId) return null;
    return allNormalizedAttempts.find(a => a.id === selectedAttemptId) || null;
  }, [allNormalizedAttempts, selectedAttemptId]);

  // Analytics for "Sự thay đổi năng lực theo thời gian" (Competency Change Over Time)
  const timelineAnalytics = useMemo(() => {
    const chronological = [...allNormalizedAttempts].reverse(); // Oldest -> Newest
    if (chronological.length === 0) {
      return {
        hasRealData: false,
        points: [] as Array<{ id?: string; label: string; title: string; date: string; score10: number; kind: 'EXAM' | 'PRACTICE' }>,
        initialAvg: 0,
        latestAvg: 0,
        overallDelta: 0,
        cognitiveEvolution: [
          { level: 'Nhận biết', initial: 0, current: 0, delta: 0, status: 'Chưa đủ dữ liệu' },
          { level: 'Thông hiểu', initial: 0, current: 0, delta: 0, status: 'Chưa đủ dữ liệu' },
          { level: 'Vận dụng', initial: 0, current: 0, delta: 0, status: 'Chưa đủ dữ liệu' }
        ],
        zoneChains: [] as Array<{ zone: string; chain: number[]; status: string; trend: string }>
      };
    }

    const points = chronological.slice(-10).map((att, idx) => ({
      id: att.id,
      label: `Lần ${idx + 1}`,
      title: att.cleanTitle,
      date: att.formattedDate,
      score10: att.score10,
      kind: att.kind
    }));

    const firstHalf = chronological.slice(0, Math.max(1, Math.floor(chronological.length / 2)));
    const secondHalf = chronological.slice(Math.max(0, Math.floor(chronological.length / 2)));

    const initialAvg =
      Math.round((firstHalf.reduce((s, a) => s + a.score10, 0) / firstHalf.length) * 10) / 10;
    const latestAvg =
      Math.round((secondHalf.reduce((s, a) => s + a.score10, 0) / secondHalf.length) * 10) / 10;
    const overallDelta = Math.round((latestAvg - initialAvg) * 10) / 10;

    const calcCogScore = (list: NormalizedAttempt[], key: 'nhanBiet' | 'thongHieu' | 'vanDung') => {
      let c = 0;
      let t = 0;
      list.forEach(a => {
        c += a.cognitiveStats[key].correct;
        t += a.cognitiveStats[key].total;
      });
      return t > 0 ? Math.round((c / t) * 10 * 10) / 10 : initialAvg;
    };

    const nbInit = calcCogScore(firstHalf, 'nhanBiet');
    const nbCurr = calcCogScore(secondHalf, 'nhanBiet');
    const thInit = calcCogScore(firstHalf, 'thongHieu');
    const thCurr = calcCogScore(secondHalf, 'thongHieu');
    const vdInit = calcCogScore(firstHalf, 'vanDung');
    const vdCurr = calcCogScore(secondHalf, 'vanDung');

    // Group progression chains by exam/topic name
    const groupedChains: Record<string, number[]> = {};
    chronological.forEach(a => {
      const k = a.cleanTitle;
      if (!groupedChains[k]) groupedChains[k] = [];
      groupedChains[k].push(a.score10);
    });

    const zoneChains = Object.entries(groupedChains)
      .slice(0, 6)
      .map(([zone, chain]) => {
        const last = chain[chain.length - 1];
        const prev = chain.length >= 2 ? chain[chain.length - 2] : last;
        const trend = last - prev >= 0.3 ? '↑' : last - prev <= -0.3 ? '↓' : '→';
        const status =
          last >= 8.0
            ? 'Ổn định'
            : last >= 6.8
            ? 'Đang tiến bộ'
            : last >= 5.2
            ? 'Đang hình thành'
            : 'Cần củng cố';
        return { zone, chain: chain.slice(-5), status, trend };
      });

    return {
      hasRealData: true,
      points,
      initialAvg,
      latestAvg,
      overallDelta,
      cognitiveEvolution: [
        {
          level: 'Nhận biết',
          initial: nbInit,
          current: nbCurr,
          delta: Math.round((nbCurr - nbInit) * 10) / 10,
          status: nbCurr >= 8.0 ? 'Ổn định' : nbCurr >= 6.5 ? 'Đang tiến bộ' : 'Cần củng cố'
        },
        {
          level: 'Thông hiểu',
          initial: thInit,
          current: thCurr,
          delta: Math.round((thCurr - thInit) * 10) / 10,
          status: thCurr >= 8.0 ? 'Ổn định' : thCurr >= 6.5 ? 'Đang tiến bộ' : 'Đang hình thành'
        },
        {
          level: 'Vận dụng',
          initial: vdInit,
          current: vdCurr,
          delta: Math.round((vdCurr - vdInit) * 10) / 10,
          status: vdCurr >= 8.0 ? 'Ổn định' : vdCurr >= 6.5 ? 'Đang tiến bộ' : 'Cần củng cố'
        }
      ],
      zoneChains
    };
  }, [allNormalizedAttempts]);

  const currentLevel = calculateLevel(user?.totalScore || 0, user?.examHistory || []);
  const avgAllScore =
    allNormalizedAttempts.length > 0
      ? (
          allNormalizedAttempts.reduce((acc, a) => acc + a.score10, 0) /
          allNormalizedAttempts.length
        ).toFixed(1)
      : '0.0';

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Guest Banner */}
      {user.isGuest && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div>
            <h4 className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
              <span>👤</span> Chế độ Khách (Lưu tạm trên trình duyệt)
            </h4>
            <p className="text-xs text-amber-700 mt-1">
              Đăng nhập tài khoản học sinh để đồng bộ toàn bộ Lịch sử bài kiểm tra, Lịch sử rèn luyện và Biểu đồ năng lực lên Google Sheet.
            </p>
          </div>
          {onOpenLogin && (
            <button
              onClick={onOpenLogin}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-xs whitespace-nowrap cursor-pointer"
            >
              Đăng nhập đồng bộ ngay
            </button>
          )}
        </div>
      )}

      {/* Header Hồ Sơ & Lịch Sử Học Tập Toàn Diện */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-black uppercase tracking-wider text-emerald-200 border border-white/15">
              <span>📜</span> HỒ SƠ LỊCH SỬ & BIẾN ĐỔI NĂNG LỰC THEO THỜI GIAN
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Nhật Ký Học Tập & Rèn Luyện — {user.name}
            </h2>
            <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed">
              Lưu trữ đầy đủ lịch sử bài kiểm tra định kỳ, lịch sử các lượt rèn luyện bù đắp lỗ hổng, phân tích chi tiết từng Attempt và theo dõi sự tiến bộ năng lực theo thời gian.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-bold text-emerald-200">
              <span className="bg-white/10 px-3 py-1 rounded-lg border border-white/10">
                Lớp: {user.className || 'Lớp 12'}
              </span>
              {getStudentGrade(user) && (
                <span className="bg-emerald-400/20 text-emerald-200 px-3 py-1 rounded-lg border border-emerald-400/30 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                  Khối {getStudentGrade(user)} (Lưu bài thi Khối {getStudentGrade(user)})
                </span>
              )}
              {user.studentId && (
                <span className="bg-white/10 px-3 py-1 rounded-lg border border-white/10">
                  Mã HS: {user.studentId}
                </span>
              )}
              <span className="bg-amber-400/20 text-amber-300 px-3 py-1 rounded-lg border border-amber-400/30">
                🏆 Danh hiệu: {currentLevel}
              </span>
            </div>
          </div>

          {/* 4 KPI Summary Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3 shrink-0">
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 text-center min-w-[130px]">
              <div className="text-2xl font-black text-white">{examAttempts.length}</div>
              <div className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider mt-0.5">
                Lượt kiểm tra
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 text-center min-w-[130px]">
              <div className="text-2xl font-black text-emerald-300">{practiceAttempts.length}</div>
              <div className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider mt-0.5">
                Lượt rèn luyện
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 text-center min-w-[130px]">
              <div className="text-2xl font-black text-amber-300">{avgAllScore}</div>
              <div className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider mt-0.5">
                Điểm TB (Hệ 10)
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 text-center min-w-[130px]">
              <div className="text-2xl font-black text-sky-300">
                {timelineAnalytics.overallDelta >= 0
                  ? `+${timelineAnalytics.overallDelta.toFixed(1)}`
                  : timelineAnalytics.overallDelta.toFixed(1)}
              </div>
              <div className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider mt-0.5">
                Biến đổi năng lực
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs cho 4 tính năng trọng tâm của thẻ Lịch Sử */}
      <div className="bg-white rounded-2xl p-2 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveSubTab('OVERVIEW_ALL')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'OVERVIEW_ALL'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>🗂️</span>
            <span>Tất cả Attempt ({allNormalizedAttempts.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('EXAM_HISTORY')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'EXAM_HISTORY'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>📝</span>
            <span>Lịch sử bài kiểm tra ({examAttempts.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('PRACTICE_HISTORY')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'PRACTICE_HISTORY'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>🎯</span>
            <span>Lịch sử rèn luyện ({practiceAttempts.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('COMPETENCY_TIMELINE')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'COMPETENCY_TIMELINE'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>📈</span>
            <span>Sự thay đổi năng lực theo thời gian</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!user.isGuest && user.phone !== 'guest' && (
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              title="Đồng bộ lịch sử từ Google Sheet"
            >
              <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
              <span>{isSyncing ? 'Đang tải...' : 'Đồng bộ Sheet'}</span>
            </button>
          )}
          {onNavigateToPersonalized && (
            <button
              onClick={onNavigateToPersonalized}
              className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-black transition cursor-pointer"
            >
              🧬 Rèn luyện vùng yếu
            </button>
          )}
          {onNavigateToTest && (
            <button
              onClick={onNavigateToTest}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition cursor-pointer"
            >
              + Làm đề kiểm tra
            </button>
          )}
        </div>
      </div>

      {syncToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs font-bold animate-fade-in flex items-center gap-2 shadow-xs">
          <span>{syncToast}</span>
        </div>
      )}

      {/* =====================================================================
          PHẦN 1: SỰ THAY ĐỔI NĂNG LỰC THEO THỜI GIAN (HIỂN THỊ TÓM TẮT HOẶC CHI TIẾT)
      ===================================================================== */}
      {(activeSubTab === 'COMPETENCY_TIMELINE' || activeSubTab === 'OVERVIEW_ALL') && (
        <section className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📈</span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900">
                  Sự thay đổi năng lực theo thời gian
                </h3>
                {!timelineAnalytics.hasRealData && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    Mô phỏng lộ trình mẫu (Hãy làm bài để ghi nhận dữ liệu thực)
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Theo dõi quỹ đạo điểm số và sự dịch chuyển năng lực qua từng Attempt kiểm tra & rèn luyện bù đắp.
              </p>
            </div>

            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Khởi điểm</span>
                <span className="text-sm font-black text-slate-700">
                  {timelineAnalytics.initialAvg.toFixed(1).replace('.', ',')}đ
                </span>
              </div>
              <span className="text-slate-300 font-black">→</span>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Hiện tại</span>
                <span className="text-sm font-black text-emerald-700">
                  {timelineAnalytics.latestAvg.toFixed(1).replace('.', ',')}đ
                </span>
              </div>
              <span
                className={`px-2.5 py-1 rounded-xl text-xs font-black ${
                  timelineAnalytics.overallDelta >= 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {timelineAnalytics.overallDelta >= 0
                  ? `↑ +${timelineAnalytics.overallDelta.toFixed(1).replace('.', ',')}`
                  : `↓ ${timelineAnalytics.overallDelta.toFixed(1).replace('.', ',')}`}
              </span>
            </div>
          </div>

          {/* Biểu đồ trực quan quỹ đạo điểm qua từng Attempt */}
          <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                Biểu đồ tiến trình điểm số qua các Attempt liên tiếp (Thang điểm 10)
              </span>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" /> Bài kiểm tra định kỳ
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <span className="w-3 h-3 rounded-sm bg-sky-500 inline-block" /> Lượt rèn luyện cá nhân hóa
                </span>
              </div>
            </div>

            {timelineAnalytics.points.length === 0 ? (
              <div className="py-10 text-center text-xs sm:text-sm text-slate-500 font-medium">
                Chưa có dữ liệu Attempt thực tế để vẽ biểu đồ tiến trình điểm số. Hãy hoàn thành bài kiểm tra hoặc lượt rèn luyện đầu tiên!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-3 pt-2 items-end min-h-[160px]">
                {timelineAnalytics.points.map((pt, idx) => {
                  const heightPct = Math.max(18, Math.min(100, Math.round(pt.score10 * 10)));
                  const isPrac = pt.kind === 'PRACTICE';
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if ('id' in pt && pt.id) {
                          setSelectedAttemptId(pt.id);
                        }
                      }}
                      className="flex flex-col items-center justify-end h-36 group cursor-pointer"
                      title={`${pt.title} (${pt.date}) - ${pt.score10} điểm`}
                    >
                      <span className="text-xs font-black text-slate-800 mb-1.5 group-hover:scale-110 transition-transform">
                        {pt.score10.toFixed(1).replace('.', ',')}
                      </span>
                      <div className="w-full max-w-[44px] bg-slate-200/70 rounded-t-xl h-24 flex items-end overflow-hidden p-0.5">
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full rounded-t-lg transition-all ${
                            isPrac
                              ? 'bg-gradient-to-t from-sky-600 to-sky-400'
                              : 'bg-gradient-to-t from-emerald-700 to-emerald-500'
                          }`}
                        />
                      </div>
                      <span className="text-[11px] font-black text-slate-700 mt-1.5 truncate max-w-full">
                        {pt.label}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400 truncate max-w-full">
                        {pt.date}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sự dịch chuyển năng lực theo 3 mức độ nhận thức & Chuỗi tiến bộ từng vùng */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 3 mức độ nhận thức (5 cột) */}
            <div className="lg:col-span-5 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Biến đổi theo 3 mức độ nhận thức (Đầu kỳ → Hiện tại)
              </h4>
              <div className="space-y-2.5">
                {timelineAnalytics.cognitiveEvolution.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-black text-slate-900">{item.level}</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">
                        Trạng thái: <strong className="text-slate-700">{item.status}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600">
                        {item.initial.toFixed(1).replace('.', ',')}
                      </span>
                      <span className="text-slate-400 font-black">→</span>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-black">
                        {item.current.toFixed(1).replace('.', ',')}
                      </span>
                      <span
                        className={`text-xs font-black min-w-[42px] text-right ${
                          item.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {item.delta >= 0 ? `+${item.delta.toFixed(1)}` : item.delta.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chuỗi tiến bộ theo từng vùng năng lực / bài học (7 cột) */}
            <div className="lg:col-span-7 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Chuỗi thay đổi điểm năng lực theo từng nội dung (Qua các Attempt)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {timelineAnalytics.zoneChains.map((zc, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs sm:text-sm font-black text-slate-900 line-clamp-1">
                        {zc.zone}
                      </span>
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        {zc.trend} {zc.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {zc.chain.map((sc, sIdx) => {
                        const isLast = sIdx === zc.chain.length - 1;
                        return (
                          <React.Fragment key={sIdx}>
                            <span
                              className={`px-2 py-0.5 rounded-md text-xs font-black ${
                                isLast
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {sc.toFixed(1).replace('.', ',')}
                            </span>
                            {!isLast && <span className="text-slate-300 font-bold">──</span>}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          PHẦN 2: CHI TIẾT TỪNG ATTEMPT (DETAILED ATTEMPT INSPECTOR)
          Hiển thị ngay khi người dùng chọn 1 Attempt bất kỳ trong lịch sử
      ===================================================================== */}
      {inspectedAttempt && (
        <section className="bg-white rounded-3xl p-6 sm:p-7 shadow-lg border-2 border-emerald-600 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-900">
                  🔍 CHI TIẾT ATTEMPT #{inspectedAttempt.attemptNumberForExam}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-black border ${
                    inspectedAttempt.kind === 'PRACTICE'
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  }`}
                >
                  {inspectedAttempt.kind === 'PRACTICE' ? '🎯 Lượt rèn luyện cá nhân hóa' : '📝 Bài kiểm tra định kỳ'}
                </span>
                <span className="text-xs font-mono font-bold text-slate-400">
                  Mã lượt: {inspectedAttempt.turnId}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                {inspectedAttempt.cleanTitle}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Thời gian nộp: {inspectedAttempt.formattedDate} lúc {inspectedAttempt.formattedTime} • Thời gian làm bài:{' '}
                {formatDuration(inspectedAttempt.timeSpentSeconds)}
              </p>
            </div>

            <button
              onClick={() => setSelectedAttemptId(null)}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black transition cursor-pointer self-start sm:self-center"
            >
              ✕ Đóng chi tiết Attempt
            </button>
          </div>

          {/* 4 Thẻ chỉ số của Attempt */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Điểm Attempt (Hệ 10)</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {inspectedAttempt.score10.toFixed(1).replace('.', ',')}
                <span className="text-xs text-slate-400 font-bold"> / 10</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Tỷ lệ câu đúng</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {inspectedAttempt.scoreRaw}/{inspectedAttempt.totalQuestions}{' '}
                <span className="text-xs text-emerald-600 font-bold">({inspectedAttempt.accuracyPercent}%)</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-bold text-slate-400 uppercase">So với lần làm trước</span>
              <div className="text-2xl font-black mt-1">
                {inspectedAttempt.deltaFromPreviousAttempt !== null ? (
                  <span
                    className={
                      inspectedAttempt.deltaFromPreviousAttempt >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }
                  >
                    {inspectedAttempt.deltaFromPreviousAttempt >= 0
                      ? `↑ +${inspectedAttempt.deltaFromPreviousAttempt.toFixed(1)}`
                      : `↓ ${inspectedAttempt.deltaFromPreviousAttempt.toFixed(1)}`}
                  </span>
                ) : (
                  <span className="text-slate-500 text-base">Lần làm đầu tiên</span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Đánh giá trạng thái</span>
              <div className="mt-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${
                    getGradeBadge(inspectedAttempt.score10).cls
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${getGradeBadge(inspectedAttempt.score10).dot}`} />
                  {getGradeBadge(inspectedAttempt.score10).label}
                </span>
              </div>
            </div>
          </div>

          {/* Phân tích 3 mức độ tư duy trong Attempt này */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {(
              [
                { key: 'nhanBiet', label: 'Mức Nhận biết', color: 'emerald' },
                { key: 'thongHieu', label: 'Mức Thông hiểu', color: 'sky' },
                { key: 'vanDung', label: 'Mức Vận dụng', color: 'purple' }
              ] as const
            ).map(lvl => {
              const bucket = inspectedAttempt.cognitiveStats[lvl.key];
              const pct = bucket.total > 0 ? Math.round((bucket.correct / bucket.total) * 100) : 0;
              return (
                <div key={lvl.key} className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between text-xs font-black text-slate-700">
                    <span>{lvl.label}</span>
                    <span>
                      {bucket.correct}/{bucket.total} câu đúng ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full ${
                        pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Danh sách câu hỏi chi tiết trong Attempt */}
          {inspectedAttempt.details.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-700">
                  Bảng đối chiếu từng câu hỏi trong Attempt ({inspectedAttempt.details.length} câu)
                </h4>
                <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setQuestionFilter('ALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-black cursor-pointer ${
                      questionFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Tất cả ({inspectedAttempt.details.length})
                  </button>
                  <button
                    onClick={() => setQuestionFilter('WRONG')}
                    className={`px-3 py-1 rounded-lg text-xs font-black cursor-pointer ${
                      questionFilter === 'WRONG' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Câu sai ({inspectedAttempt.details.filter(d => !d.isCorrect).length})
                  </button>
                  <button
                    onClick={() => setQuestionFilter('CORRECT')}
                    className={`px-3 py-1 rounded-lg text-xs font-black cursor-pointer ${
                      questionFilter === 'CORRECT' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Câu đúng ({inspectedAttempt.details.filter(d => d.isCorrect).length})
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {inspectedAttempt.details
                  .filter(d => {
                    if (questionFilter === 'WRONG') return !d.isCorrect;
                    if (questionFilter === 'CORRECT') return d.isCorrect;
                    return true;
                  })
                  .map((q, qIdx) => (
                    <div
                      key={q.questionId || qIdx}
                      className={`p-4 rounded-2xl border text-xs sm:text-sm ${
                        q.isCorrect
                          ? 'bg-emerald-50/30 border-emerald-200'
                          : 'bg-rose-50/30 border-rose-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-slate-900">Câu {qIdx + 1}:</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                              {q.cognitiveLevel === 'NHAN_BIET'
                                ? 'Nhận biết'
                                : q.cognitiveLevel === 'THONG_HIEU'
                                ? 'Thông hiểu'
                                : 'Vận dụng'}
                            </span>
                          </div>
                          <p className="font-bold text-slate-800 leading-relaxed">{formatDisplayQuestionText(q.questionText, { stripLeadingCau: true })}</p>
                        </div>
                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-full font-black text-xs border ${
                            q.isCorrect
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border-rose-200'
                          }`}
                        >
                          {q.isCorrect ? '✓ Chính xác' : '✕ Chưa đúng'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200/70 text-xs">
                        <div>
                          <span className="text-slate-400 font-bold uppercase block text-[10px]">
                            Câu trả lời của em:
                          </span>
                          <span className={`font-black ${q.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {q.userAnswer || '(Chưa chọn đáp án)'}
                          </span>
                        </div>
                        {!q.isCorrect && (
                          <div>
                            <span className="text-slate-400 font-bold uppercase block text-[10px]">
                              Đáp án đúng chuẩn YCCĐ:
                            </span>
                            <span className="font-black text-emerald-700">{q.correctAnswer}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium">
              Lượt làm bài này chỉ lưu điểm tổng hợp ({inspectedAttempt.scoreRaw}/{inspectedAttempt.totalQuestions} câu đúng), không có bản ghi từng câu hỏi riêng lẻ.
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          PHẦN 3: DANH SÁCH LỊCH SỬ BÀI KIỂM TRA & LỊCH SỬ RÈN LUYỆN
      ===================================================================== */}
      {activeSubTab !== 'COMPETENCY_TIMELINE' && (
        <section className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span>
                  {activeSubTab === 'EXAM_HISTORY'
                    ? '📝 Lịch sử bài kiểm tra định kỳ'
                    : activeSubTab === 'PRACTICE_HISTORY'
                    ? '🎯 Lịch sử rèn luyện cá nhân hóa & bù đắp lỗ hổng'
                    : '🗂️ Toàn bộ lịch sử Kiểm tra & Rèn luyện (Tất cả Attempt)'}
                </span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {activeSubTab === 'EXAM_HISTORY'
                  ? 'Danh sách các đề kiểm tra chính thức đã hoàn thành trong mục Kiểm Tra, Đánh Giá.'
                  : activeSubTab === 'PRACTICE_HISTORY'
                  ? 'Danh sách các lượt rèn luyện ngắn (5 câu) và bài luyện bù đắp lỗ hổng kiến thức theo từng vùng YCCĐ.'
                  : 'Nhấp vào "Chi tiết Attempt" ở bất kỳ lượt làm bài nào để mổ xẻ kết quả theo 3 mức độ nhận thức và từng câu hỏi.'}
              </p>
            </div>

            {/* Tìm kiếm & Lọc mức điểm */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên bài, mã đề, mã lượt..."
                  className="w-full pl-3.5 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                {(
                  [
                    { id: 'ALL', label: 'Tất cả' },
                    { id: 'HIGH', label: '≥ 8,0đ' },
                    { id: 'MID', label: '5,0 – 7,9đ' },
                    { id: 'LOW', label: '< 5,0đ' }
                  ] as const
                ).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setScoreFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                      scoreFilter === f.id
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Danh sách các Attempt */}
          {displayedAttempts.length === 0 ? (
            <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-2xl space-y-4">
              <div className="text-4xl">
                {activeSubTab === 'PRACTICE_HISTORY' ? '🎯' : '📝'}
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="font-black text-slate-800 text-base">
                  {activeSubTab === 'PRACTICE_HISTORY'
                    ? 'Chưa có lượt rèn luyện cá nhân hóa nào được ghi nhận'
                    : 'Chưa có lượt làm bài nào trong danh mục này'}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {activeSubTab === 'PRACTICE_HISTORY'
                    ? 'Hãy mở thẻ "Tiến Trình Học Tập", chọn một vùng năng lực cần củng cố và bấm [Rèn luyện ngay] để tạo lượt rèn luyện 5 câu.'
                    : 'Khi em hoàn thành bài kiểm tra hoặc lượt rèn luyện, toàn bộ lịch sử Attempt và sự thay đổi năng lực sẽ tự động hiển thị tại đây.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                {onNavigateToPersonalized && (
                  <button
                    onClick={onNavigateToPersonalized}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-xs cursor-pointer"
                  >
                    Đến Tiến Trình Học Tập & Rèn Luyện →
                  </button>
                )}
                {onNavigateToTest && (
                  <button
                    onClick={onNavigateToTest}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition shadow-xs cursor-pointer"
                  >
                    Làm bài kiểm tra định kỳ →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {displayedAttempts.map(att => {
                const badge = getGradeBadge(att.score10);
                const isSelected = selectedAttemptId === att.id;
                return (
                  <div
                    key={att.id}
                    className={`rounded-2xl p-4 sm:p-5 border transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/20 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black uppercase border ${
                              att.kind === 'PRACTICE'
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {att.kind === 'PRACTICE' ? '🎯 Rèn luyện' : '📝 Kiểm tra'}
                          </span>

                          <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-slate-100 text-slate-700">
                            Attempt #{att.attemptNumberForExam}
                          </span>

                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black border ${badge.cls}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {badge.label}
                          </span>

                          {att.deltaFromPreviousAttempt !== null && (
                            <span
                              className={`text-xs font-black px-2 py-0.5 rounded-md ${
                                att.deltaFromPreviousAttempt >= 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {att.deltaFromPreviousAttempt >= 0
                                ? `↑ +${att.deltaFromPreviousAttempt.toFixed(1)}đ so với lần trước`
                                : `↓ ${att.deltaFromPreviousAttempt.toFixed(1)}đ so với lần trước`}
                            </span>
                          )}
                        </div>

                        <h4 className="text-base sm:text-lg font-black text-slate-900">
                          {att.cleanTitle}
                        </h4>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                          <span>📅 {att.formattedDate} • {att.formattedTime}</span>
                          <span>⏱️ Thời gian: {formatDuration(att.timeSpentSeconds)}</span>
                          {att.examId && !att.examId.startsWith('PRACTICE_') && (
                            <span className="font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              Mã đề: #{formatExamDisplayId(att.examId, undefined, att.title).replace(/^#/, '')}
                            </span>
                          )}
                          <span className="text-slate-400 font-mono">Turn: {att.turnId}</span>
                        </div>

                        {/* Chuỗi tiến bộ nếu là lượt rèn luyện có lịch sử chuỗi */}
                        {att.progressionChain && att.progressionChain.length > 1 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
                            <span className="font-bold text-slate-500">Chuỗi năng lực:</span>
                            {att.progressionChain.map((sc, idx) => (
                              <React.Fragment key={idx}>
                                <span
                                  className={`px-2 py-0.5 rounded font-black ${
                                    idx === att.progressionChain!.length - 1
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {sc.toFixed(1).replace('.', ',')}
                                </span>
                                {idx < att.progressionChain!.length - 1 && (
                                  <span className="text-slate-300 font-bold">──</span>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Cột điểm & Nút Chi tiết từng Attempt */}
                      <div className="flex items-center justify-between lg:justify-end gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 shrink-0">
                        <div className="text-left lg:text-right">
                          <div className="text-2xl font-black text-slate-900 leading-none">
                            {att.score10.toFixed(1).replace('.', ',')}
                            <span className="text-xs text-slate-400 font-bold">/10</span>
                          </div>
                          <div className="text-xs font-bold text-slate-500 mt-1">
                            Đúng {att.scoreRaw}/{att.totalQuestions} câu ({att.accuracyPercent}%)
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            setSelectedAttemptId(isSelected ? null : att.id)
                          }
                          className={`px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {isSelected ? 'Đang xem Attempt ▲' : 'Chi tiết Attempt ▼'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
