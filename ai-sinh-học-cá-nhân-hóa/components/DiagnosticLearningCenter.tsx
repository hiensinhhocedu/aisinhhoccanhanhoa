import React, { useState, useMemo, useRef, useEffect } from 'react';
import { StudentCompetencyProfile, User, BioAIChatMessage } from '../types';
import { evaluateRemedialProgress, saveCompetencyProfile, buildRemedialLesson, buildDetailedYccdRemedialLessons } from '../services/diagnosticService';
import { submitExamResultToCloud } from '../services/dataService';
import { askBioAIAssistant, formatDisplayQuestionText } from '../services/geminiService';

interface DiagnosticLearningCenterProps {
  profile: StudentCompetencyProfile;
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  onClose: () => void;
  onRetakeExam?: () => void;
  initialTab?: 'COMPETENCY' | 'REMEDIAL' | 'PRACTICE' | 'PROGRESS';
  onProfileUpdated?: (updatedProfile: StudentCompetencyProfile) => void;
}

export const DiagnosticLearningCenter: React.FC<DiagnosticLearningCenterProps> = ({
  profile: initialProfile,
  user,
  onUpdateUser,
  onClose,
  onRetakeExam,
  initialTab,
  onProfileUpdated
}) => {
  const [profile, setProfile] = useState<StudentCompetencyProfile>(initialProfile);
  const [activeTab, setActiveTab] = useState<'COMPETENCY' | 'REMEDIAL' | 'PRACTICE' | 'PROGRESS'>(initialTab || 'COMPETENCY');
  
  // Practice state
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>(profile.practiceAnswers || {});
  const [isSubmittingPractice, setIsSubmittingPractice] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setProfile(initialProfile);
    setPracticeAnswers(initialProfile.practiceAnswers || {});
  }, [initialProfile]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // --- Bio AI Assistant State in Tab 2 ---
  const [chatMessages, setChatMessages] = useState<BioAIChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: `Xin chào ${profile.studentName || user.name || 'em'}! Thầy/Cô là Trợ Lí AI Sinh Học 🧬.\nTrong bài kiểm tra "${profile.lessonName || profile.examTitle}", em có ${profile.errorItems.length} câu làm sai cần lưu ý.\nEm hãy đọc kỹ các phần lý thuyết và ví dụ minh họa ở trên. Nếu có bất kỳ chỗ nào chưa hiểu, thắc mắc về cơ chế hoặc cần ví dụ cụ thể hơn trước khi bước vào LUYỆN TẬP BÙ ĐẮP LỖ HỎNG, hãy nhắn ngay cho Thầy/Cô ở đây nhé!`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'REMEDIAL') {
      scrollToBottom();
    }
  }, [chatMessages, activeTab]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || chatInput).trim();
    if (!query || isAILoading) return;

    const userMsg: BioAIChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsAILoading(true);

    try {
      const errorContext = (profile.errorItems || []).map((e, idx) => 
        `Câu ${idx + 1}: ${e.questionText}\n- HS đã chọn: ${e.userAnswer}\n- Đáp án đúng: ${e.correctAnswer}\n- Vì sao sai: ${e.reasonWhyWrong}\n- Khái niệm: ${e.weakConcept}\n- Lời giải: ${e.explanation}`
      ).join('\n\n');

      const aiReply = await askBioAIAssistant({
        lessonName: profile.lessonName || profile.examTitle,
        userQuestion: query,
        errorContext: errorContext || (profile.weakTopics || []).join(', '),
        history: chatMessages.map(m => ({ sender: m.sender, text: m.text }))
      });

      const aiMsg: BioAIChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiReply,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.warn("AI Chat assistant error:", err);
      const fallbackMsg: BioAIChatMessage = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: `Về câu hỏi "${query}": Em hãy đọc kỹ lại lý thuyết và các ví dụ minh họa của bài "${profile.lessonName || profile.examTitle}" ở phía trên, đặc biệt chú ý nguyên tắc bổ sung và chiều tổng hợp của enzyme nhé!`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsAILoading(false);
    }
  };

  // Quick Suggested Questions based on errors
  const quickQuestions = useMemo(() => {
    const list: string[] = [];
    const title = (profile.lessonName || profile.examTitle || '').toLowerCase();
    if (title.includes('dna') || title.includes('tái bản') || title.includes('nhân đôi')) {
      list.push('Tại sao mạch mới luôn tổng hợp theo chiều 5\'→3\'?');
      list.push('Phân biệt vai trò của enzyme DNA polymerase và DNA ligase?');
      list.push('Cho mình 1 ví dụ cụ thể về nguyên tắc bán bảo tồn?');
      list.push('Mẹo nhớ đoạn Okazaki và chạc chữ Y để không bị nhầm?');
    } else if (title.includes('phiên mã') || title.includes('dịch mã') || title.includes('gene')) {
      list.push('Nguyên tắc bổ sung trong phiên mã khác gì với nhân đôi DNA?');
      list.push('Làm sao nhớ các bộ ba kết thúc và bộ ba mở đầu?');
      list.push('Tại sao chuỗi polypeptide lại bắt đầu bằng axit amin Met?');
    } else if (title.includes('nước') || title.includes('quang hợp') || title.includes('hô hấp')) {
      list.push('Phân biệt con đường gian bào và tế bào chất?');
      list.push('Động lực hút nước ở lá diễn ra như thế nào?');
      list.push('Vì sao bón nhiều phân cây lại bị héo?');
    } else {
      list.push(`Tóm tắt 3 ý quan trọng nhất của bài ${profile.lessonName || 'này'}?`);
      list.push('Cho mình thêm 1 ví dụ thực tế liên quan đến bài học');
      list.push('Mẹo nào để giải quyết nhanh câu hỏi Đúng/Sai?');
    }
    if (profile.errorItems && profile.errorItems.length > 0 && profile.errorItems[0].weakConcept) {
      const q = `Giải thích rõ hơn về: ${profile.errorItems[0].weakConcept}`;
      if (!list.includes(q)) list.unshift(q);
    }
    return list.slice(0, 4);
  }, [profile.lessonName, profile.examTitle, profile.errorItems]);

  // Ensure remedial lessons are rich and specific to YCCĐ
  const activeRemedialLessons = useMemo(() => {
    const lessons = Array.isArray(profile.remedialLessons) ? profile.remedialLessons : [];
    const hasRichLessons = lessons.length > 0 && lessons.some(l => l.yccdCode && l.practicalExample);
    if (hasRichLessons) {
      return lessons;
    }
    return buildDetailedYccdRemedialLessons(
      profile.lessonName || profile.examTitle,
      profile.errorItems || []
    );
  }, [profile.remedialLessons, profile.lessonName, profile.examTitle, profile.errorItems]);

  const handleSelectPracticeAnswer = (qId: string, val: string) => {
    setPracticeAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const handleResetPracticeForRetry = () => {
    setPracticeAnswers({});
    setProfile(prev => ({
      ...prev,
      isRetestSubmitted: false,
      practiceAnswers: {}
    }));
    setActiveTab('PRACTICE');
  };

  const currentPracticePercent = useMemo(() => {
    if (typeof profile.practicePercent === 'number') return profile.practicePercent;
    if (profile.practiceQuestions && profile.practiceQuestions.length > 0 && typeof profile.practiceScore === 'number') {
      return Math.round((profile.practiceScore / profile.practiceQuestions.length) * 100);
    }
    return 0;
  }, [profile.practicePercent, profile.practiceQuestions, profile.practiceScore]);

  const isUnlockedToRetake = Boolean(profile.isRetestSubmitted && currentPracticePercent > 80);

  const handleSubmitPractice = async () => {
    setIsSubmittingPractice(true);
    try {
      const updated = evaluateRemedialProgress(profile, practiceAnswers);
      setProfile(updated);
      saveCompetencyProfile(updated, user.phone);
      if (onProfileUpdated) {
        onProfileUpdated(updated);
      }

      const totalPracticeQ = (updated.practiceQuestions || []).length;
      const correctPracticeQ = updated.practiceScore ?? 0;
      const wrongPracticeQ = Math.max(0, totalPracticeQ - correctPracticeQ);

      // Cập nhật vào User state và lưu vào localStorage
      const updatedHistory = (user.examHistory || []).map(h => {
        if (String(h.examId) === String(updated.examId)) {
          return {
            ...h,
            competencyProfile: updated
          };
        }
        return h;
      });

      const updatedUser: User = {
        ...user,
        examHistory: updatedHistory
      };

      try {
        const storageKey = user.isGuest || user.phone === 'guest' ? 'user_guest' : `user_${user.phone}`;
        localStorage.setItem(storageKey, JSON.stringify(updatedUser));
      } catch {}

      onUpdateUser(updatedUser);

      // Đồng bộ lên Cloud nếu đã đăng nhập
      if (!user.isGuest && user.phone !== 'guest') {
        const fakeResult = {
          turnId: `LT_REMEDIAL_${Date.now()}`,
          examId: updated.examId,
          examTitle: `[Bù Đắp] ${updated.lessonName || updated.examTitle}`,
          score: correctPracticeQ,
          totalQuestions: totalPracticeQ,
          score10: totalPracticeQ > 0 ? Math.round((correctPracticeQ / totalPracticeQ) * 10 * 10) / 10 : 0,
          timeSpentSeconds: 120,
          wrongNhanBiet: 0,
          wrongThongHieu: wrongPracticeQ,
          wrongVanDung: 0,
          date: new Date().toISOString(),
          competencyProfile: updated,
          details: updated.practiceQuestions.map(q => ({
            questionId: q.id,
            questionText: q.text,
            userAnswer: practiceAnswers[q.id] || '',
            correctAnswer: q.correctAnswer,
            isCorrect: (practiceAnswers[q.id] || '').trim().toUpperCase() === (q.correctAnswer || '').trim().toUpperCase(),
            cognitiveLevel: 'THONG_HIEU'
          }))
        };
        await submitExamResultToCloud(user.phone, fakeResult as any, {
          studentId: user.studentId,
          name: user.name,
          className: user.className,
          phone: user.phone
        });

        // Đảm bảo giữ nguyên competencyProfile đã cập nhật trong localStorage và state
        const finalUserWithProfile: User = {
          ...updatedUser,
          examHistory: [
            fakeResult as any,
            ...updatedHistory.filter(h => h.turnId !== fakeResult.turnId)
          ]
        };
        try {
          localStorage.setItem(`user_${user.phone}`, JSON.stringify(finalUserWithProfile));
        } catch {}
        onUpdateUser(finalUserWithProfile);
      }

      const practicePercent = updated.practicePercent ?? (totalPracticeQ > 0 ? Math.round((correctPracticeQ / totalPracticeQ) * 100) : 100);
      if (practicePercent > 80) {
        showToast(`🎉 Tuyệt vời! Kết quả "Đánh giá tiến độ" đạt ${practicePercent}% (> 80%). Em đã ĐƯỢC MỞ KHÓA làm lại đề gốc kiểm tra!`);
      } else {
        showToast(`⚠️ Kết quả "Đánh giá tiến độ" đạt ${practicePercent}%. Cần đạt TRÊN 80% mới được làm lại đề gốc kiểm tra. Em hãy ôn lại và làm lại nhé!`);
      }
      setActiveTab('PROGRESS');
    } catch (e) {
      console.warn("Lỗi đồng bộ kết quả luyện tập:", e);
      showToast('Đã lưu kết quả luyện tập bù đắp vào bộ nhớ máy!');
    } finally {
      setIsSubmittingPractice(false);
    }
  };

  const nbPercent = profile.cognitiveStats.nhanBiet.total > 0
    ? Math.round((profile.cognitiveStats.nhanBiet.correct / profile.cognitiveStats.nhanBiet.total) * 100)
    : 100;
  const thPercent = profile.cognitiveStats.thongHieu.total > 0
    ? Math.round((profile.cognitiveStats.thongHieu.correct / profile.cognitiveStats.thongHieu.total) * 100)
    : 100;
  const vdPercent = profile.cognitiveStats.vanDung.total > 0
    ? Math.round((profile.cognitiveStats.vanDung.correct / profile.cognitiveStats.vanDung.total) * 100)
    : 100;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[94vh] animate-scale-up">
        {/* HEADER MODAL */}
        <div className="bg-gradient-to-r from-emerald-800 via-bio-700 to-teal-800 text-white p-6 sm:p-7 relative shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="bg-white/20 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-sm border border-white/20">
                  🧬 HỆ THỐNG PHÂN TÍCH NĂNG LỰC & BÙ ĐẮP LỖ HỎNG
                </span>
                <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                  profile.status === 'XUẤT_SẮC' ? 'bg-amber-400 text-amber-950 font-black' :
                  profile.status === 'ĐÃ_TIẾN_BỘ' ? 'bg-emerald-300 text-emerald-950 font-black' :
                  'bg-rose-400 text-rose-950 font-black'
                }`}>
                  {profile.status === 'XUẤT_SẮC' ? '⭐ Nắm vững kiến thức' :
                   profile.status === 'ĐÃ_TIẾN_BỘ' ? '📈 Đã tiến bộ vượt bậc' :
                   '⚠️ Cần củng cố lỗ hỏng'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                {profile.lessonName || profile.examTitle}
              </h2>
              <p className="text-xs sm:text-sm text-emerald-100 font-medium mt-1">
                Học sinh: <span className="font-bold text-white">{profile.studentName || user.name}</span> ({profile.studentClass || user.className || 'Lớp 12'}) • Điểm thi: <span className="font-black text-amber-300 text-base">{profile.score10}/10 đ</span> ({profile.initialScore}/{profile.totalQuestions} câu)
              </p>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {onRetakeExam && (
                <button
                  onClick={() => {
                    if (isUnlockedToRetake) {
                      onRetakeExam();
                    } else {
                      showToast('🔒 Mỗi bài kiểm tra chỉ làm 1 lần! Em cần hoàn thành "Luyện Tập Bù Đắp Lỗ Hỏng" và đạt "Đánh giá tiến độ" trên 80% mới được làm lại đề gốc.');
                      setActiveTab('PRACTICE');
                    }
                  }}
                  className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border ${
                    isUnlockedToRetake
                      ? 'bg-emerald-400 hover:bg-emerald-300 text-emerald-950 border-emerald-200 shadow-lg'
                      : 'bg-white/15 hover:bg-white/25 text-amber-200 border-amber-300/40'
                  }`}
                  title={
                    isUnlockedToRetake
                      ? 'Đã đạt tiến độ > 80%: Bấm để làm lại đề gốc kiểm tra'
                      : 'Cần hoàn thành Luyện Tập Bù Đắp Lỗ Hỏng và đạt Đánh giá tiến độ > 80% để làm lại đề gốc'
                  }
                >
                  <span>{isUnlockedToRetake ? '🔓' : '🔒'}</span>
                  <span>{isUnlockedToRetake ? 'Làm Lại Đề Gốc' : 'Làm Lại Đề (Cần >80%)'}</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-black text-lg transition-all cursor-pointer border border-white/20"
                title="Đóng bảng phân tích"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 4 TAB ĐIỀU HƯỚNG SƯ PHẠM */}
          <div className="flex gap-2 overflow-x-auto pt-5 border-t border-white/20 mt-4 no-scrollbar">
            {[
              { id: 'COMPETENCY', label: '1. Hồ Sơ Năng Lực Và Cảnh Báo', icon: '📋', labelColor: '#f70303', buttonBg: undefined },
              { id: 'REMEDIAL', label: '2. Bài Học Củng Cố & Ví Dụ', icon: '💡', labelColor: '#f50a0a', buttonBg: '#f5d709' },
              { id: 'PRACTICE', label: '3. Luyện Tập Bù Đắp Lỗ Hỏng', icon: '🎯', labelColor: '#f80202', buttonBg: '#f6e909' },
              { id: 'PROGRESS', label: '4. Đánh Giá Tiến Độ', icon: '📈', labelColor: '#f50202', buttonBg: '#e8f007' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={tab.buttonBg ? { backgroundColor: tab.buttonBg } : undefined}
                className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-bio-800 shadow-lg scale-102 ring-2 ring-white/50'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <span>{tab.icon}</span>
                <span style={{ color: tab.labelColor }}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* TOAST THÔNG BÁO */}
        {toast && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold text-center shadow-md animate-fade-in shrink-0">
            {toast}
          </div>
        )}

        {/* NỘI DUNG CUỘN CHÍNH */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/60">
          
          {/* ==================== TAB 1: HỒ SƠ NĂNG LỰC VÀ CẢNH BÁO (GỘP HỒ SƠ NĂNG LỰC & PHÂN TÍCH LỖI SAI) ==================== */}
          {activeTab === 'COMPETENCY' && (
            <div className="space-y-6 animate-fade-in">
              {/* KHỐI A: HỒ SƠ NĂNG LỰC HỌC SINH THEO CHUẨN GDPT 2018 & CẢNH BÁO SƯ PHẠM */}
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <span>📊</span> Hồ Sơ Năng Lực Học Sinh Theo Chuẩn GDPT 2018
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Đo lường năng lực nhận thức qua 3 cấp độ: Nhận biết, Thông hiểu và Vận dụng.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-right">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Trạng thái năng lực</span>
                    <span className="text-sm font-black text-bio-700 uppercase">{profile.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                {/* Thanh tiến trình 3 cấp độ nhận thức */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Nhận biết */}
                  <div className="p-5 rounded-3xl bg-blue-50/70 border border-blue-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-blue-900">1. Nhận biết</span>
                      <span className="text-xs font-black text-blue-700">{nbPercent}%</span>
                    </div>
                    <div className="w-full bg-blue-200/60 rounded-full h-3 overflow-hidden">
                      <div className="bg-blue-600 h-3 rounded-full transition-all duration-700" style={{ width: `${nbPercent}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>Đúng: {profile.cognitiveStats.nhanBiet.correct}/{profile.cognitiveStats.nhanBiet.total} câu</span>
                      <span className="text-rose-600">Sai: {profile.cognitiveStats.nhanBiet.wrong}</span>
                    </div>
                    <p className="text-[11px] text-blue-950 font-medium">
                      {nbPercent >= 80 ? '✓ Đạt chuẩn nhận biết định nghĩa và thuật ngữ SGK.' : '⚠️ Cần đọc lại định nghĩa cơ bản SGK.'}
                    </p>
                  </div>

                  {/* Thông hiểu */}
                  <div className="p-5 rounded-3xl bg-emerald-50/70 border border-emerald-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-emerald-900">2. Thông hiểu</span>
                      <span className="text-xs font-black text-emerald-700">{thPercent}%</span>
                    </div>
                    <div className="w-full bg-emerald-200/60 rounded-full h-3 overflow-hidden">
                      <div className="bg-emerald-600 h-3 rounded-full transition-all duration-700" style={{ width: `${thPercent}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>Đúng: {profile.cognitiveStats.thongHieu.correct}/{profile.cognitiveStats.thongHieu.total} câu</span>
                      <span className="text-rose-600">Sai: {profile.cognitiveStats.thongHieu.wrong}</span>
                    </div>
                    <p className="text-[11px] text-emerald-950 font-medium">
                      {thPercent >= 80 ? '✓ Hiểu rõ bản chất cơ chế và các mối quan hệ.' : '⚠️ Dễ nhầm lẫn bản chất giữa các quá trình.'}
                    </p>
                  </div>

                  {/* Vận dụng */}
                  <div className="p-5 rounded-3xl bg-purple-50/70 border border-purple-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-purple-900">3. Vận dụng</span>
                      <span className="text-xs font-black text-purple-700">{vdPercent}%</span>
                    </div>
                    <div className="w-full bg-purple-200/60 rounded-full h-3 overflow-hidden">
                      <div className="bg-purple-600 h-3 rounded-full transition-all duration-700" style={{ width: `${vdPercent}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>Đúng: {profile.cognitiveStats.vanDung.correct}/{profile.cognitiveStats.vanDung.total} câu</span>
                      <span className="text-rose-600">Sai: {profile.cognitiveStats.vanDung.wrong}</span>
                    </div>
                    <p className="text-[11px] text-purple-950 font-medium">
                      {vdPercent >= 80 ? '✓ Vận dụng tốt vào thực tiễn đời sống và nông nghiệp.' : '⚠️ Cần rèn luyện thêm kỹ năng phân tích thực tế.'}
                    </p>
                  </div>
                </div>

                {/* Hộp cảnh báo giáo viên */}
                <div className="p-6 bg-slate-900 text-white rounded-3xl space-y-3 shadow-md">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-400">
                    <span>🛡️</span> Cảnh Báo Sư Phạm Dành Cho Thầy/Cô & Học Sinh:
                  </div>
                  <p className="text-sm font-bold text-slate-200 leading-relaxed">
                    {profile.score10 < 5.0
                      ? '🔴 BÁO ĐỘNG HỔNG KIẾN THỨC NẶNG: Học sinh đang gặp khó khăn ở các khái niệm nền tảng. Khuyến nghị thầy/cô kèm riêng hoặc yêu cầu học sinh hoàn thành lộ trình học củng cố bên dưới.'
                      : profile.score10 < 7.0
                      ? '🟡 CẢNH BÁO CẦN ÔN TẬP: Học sinh hiểu sơ bộ nhưng dễ mắc bẫy ở câu hỏi Đúng/Sai và Thông hiểu. Cần làm bài tập bù đắp lỗ hỏng.'
                      : '🟢 NĂNG LỰC TỐT: Học sinh đạt chuẩn kiến thức bài học. Cần phát triển thêm các câu hỏi vận dụng cao và sơ đồ thực nghiệm.'}
                  </p>
                </div>
              </div>

              {/* KHỐI B: PHÂN TÍCH CÂU TRẢ LỜI & PHÂN LOẠI LỖI SAI CHI TIẾT */}
              {/* Tóm tắt nhanh */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-2xl font-black shrink-0">
                    ❌
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Số câu làm sai</span>
                    <div className="text-2xl font-black text-rose-600">{profile.errorItems.length} câu</div>
                    <span className="text-xs text-slate-500 font-medium">trên tổng số {profile.totalQuestions} câu hỏi</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl font-black shrink-0">
                    🎯
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mức độ yếu nhất</span>
                    <div className="text-xl font-black text-amber-600">{profile.weakLevel}</div>
                    <span className="text-xs text-slate-500 font-medium">Cần tập trung củng cố</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl font-black shrink-0">
                    💡
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Lỗ hỏng kiến thức</span>
                    <div className="text-sm font-black text-slate-800 truncate max-w-[200px]" title={profile.weakTopics.join(', ')}>
                      {profile.weakTopics[0] || 'Nắm vững'}
                    </div>
                    <span className="text-xs text-slate-500 font-medium">{profile.weakTopics.length} chủ đề cần lưu ý</span>
                  </div>
                </div>
              </div>

              {/* Danh sách phân tích chi tiết từng câu hỏi bị sai */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <span>⚠️</span> Chi Tiết Phân Tích Lỗi Sai & Vì Sao Em Làm Sai?
                  </h3>
                  <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">
                    {profile.errorItems.length === 0 ? 'Xuất sắc (Đúng 100%)' : `Ghi nhận ${profile.errorItems.length} lỗi cần sửa`}
                  </span>
                </div>

                {profile.errorItems.length === 0 ? (
                  <div className="bg-white p-12 rounded-3xl border border-emerald-200 text-center space-y-3">
                    <span className="text-5xl">🎉</span>
                    <h4 className="text-lg font-black text-emerald-800">Chúc mừng! Bạn đã làm đúng toàn bộ câu hỏi!</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Bạn đã nắm vững toàn bộ kiến thức và kỹ năng của bài học. Hãy chuyển sang Tab Luyện Tập để thử sức thêm các câu hỏi vận dụng nâng cao.
                    </p>
                  </div>
                ) : (
                  profile.errorItems.map((err, idx) => (
                    <div key={err.questionId || idx} className="bg-white p-6 rounded-3xl border-2 border-rose-100 hover:border-rose-300 transition-all shadow-xs space-y-4">
                      {/* Tiêu đề câu hỏi */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <span className="bg-rose-600 text-white px-3 py-1 rounded-xl text-xs font-black shrink-0 mt-0.5">
                            Câu {idx + 1}
                          </span>
                          <p className="font-black text-slate-900 text-sm sm:text-base leading-relaxed">
                            {formatDisplayQuestionText(err.questionText, { stripLeadingCau: true })}
                          </p>
                        </div>
                        <span className={`text-[11px] font-black px-3 py-1 rounded-full border shrink-0 ${
                          err.cognitiveLevel === 'NHAN_BIET' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                          err.cognitiveLevel === 'THONG_HIEU' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                          'bg-purple-50 text-purple-800 border-purple-200'
                        }`}>
                          Mức độ: {err.cognitiveLevel === 'NHAN_BIET' ? 'Nhận biết' : err.cognitiveLevel === 'THONG_HIEU' ? 'Thông hiểu' : 'Vận dụng'}
                        </span>
                      </div>

                      {/* So sánh phương án */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
                          <span className="text-[10px] font-black uppercase text-rose-700 block mb-1">
                            ❌ Phương án em đã chọn:
                          </span>
                          <span className="font-bold text-rose-950 text-sm">
                            {err.userAnswer || 'Chưa trả lời'}
                          </span>
                        </div>

                        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                          <span className="text-[10px] font-black uppercase text-emerald-700 block mb-1">
                            ✓ Đáp án đúng của đề:
                          </span>
                          <span className="font-black text-emerald-950 text-sm">
                            {err.correctAnswer}
                          </span>
                        </div>
                      </div>

                      {/* Phân loại vì sao sai */}
                      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-xs font-black text-amber-900 uppercase tracking-wide">
                          <span>🔍</span>
                          <span>Vì sao em làm sai?</span>
                        </div>
                        <p className="text-xs text-amber-950 font-semibold leading-relaxed">
                          {err.reasonWhyWrong}
                        </p>
                        <div className="pt-2 border-t border-amber-200/80 flex items-start gap-2 text-xs text-slate-700 font-medium">
                          <span className="font-black text-slate-900 shrink-0">💡 Lời giải chi tiết:</span>
                          <span>{err.explanation}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 2: BÀI HỌC CỦNG CỐ & VÍ DỤ MINH HỌA THEO YCCĐ ==================== */}
          {activeTab === 'REMEDIAL' && (
            <div className="space-y-6 animate-fade-in">
              {/* Tiêu đề & Hướng dẫn sư phạm */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-5 sm:p-6 rounded-3xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">📖</span>
                    <h3 className="text-base sm:text-lg font-black text-slate-900">
                      Bài Học Củng Cố & Ví Dụ Minh Họa Theo YCCĐ
                    </h3>
                    <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                      Chuẩn GDPT 2018
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                    Hệ thống trích lọc lý thuyết trọng tâm bám sát đúng các câu hỏi bạn trả lời sai, kèm ví dụ thực tế giúp bạn hiểu sâu bản chất trước khi bước vào luyện tập bù đắp lỗ hỏng.
                  </p>
                </div>
                {profile.errorItems.length > 0 && (
                  <div className="bg-white px-3.5 py-2 rounded-2xl border border-emerald-200 shadow-xs shrink-0 text-center sm:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Lỗ hỏng cần bù đắp</span>
                    <span className="text-xs font-black text-rose-600">{profile.errorItems.length} câu sai cần ôn lại</span>
                  </div>
                )}
              </div>

              {/* Danh sách bài học củng cố lý thuyết & ví dụ theo YCCĐ */}
              {activeRemedialLessons.map((lesson, idx) => (
                <div key={idx} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs space-y-6 p-6 sm:p-8">
                  {/* Tiêu đề & YCCĐ Mục tiêu */}
                  <div className="border-b border-slate-100 pb-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase text-bio-800 bg-bio-100 px-3 py-1 rounded-full border border-bio-300">
                        {lesson.yccdCode ? `${lesson.yccdCode} • ${lesson.cognitiveLevel || 'Mức độ nhận thức'}` : `Chuyên Đề Trọng Tâm #${idx + 1}`}
                      </span>
                      {lesson.relatedQuestions && lesson.relatedQuestions.length > 0 && (
                        <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                          📍 Lỗ hỏng phát hiện từ: Câu {lesson.relatedQuestions.join(', ')}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xl font-black text-slate-900 leading-snug">{lesson.topic}</h4>
                    {lesson.yccdText && (
                      <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-xs text-emerald-950 font-medium leading-relaxed">
                        <span className="font-black text-emerald-900 block mb-0.5">🎯 Yêu Cầu Cần Đạt (YCCĐ):</span>
                        {lesson.yccdText}
                      </div>
                    )}
                  </div>

                  {/* Lỗ hỏng cụ thể từ các câu học sinh làm sai (nếu có) */}
                  {lesson.relatedErrorItems && lesson.relatedErrorItems.length > 0 && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2.5">
                      <div className="text-xs font-black text-amber-900 flex items-center gap-1.5 uppercase tracking-wide">
                        <span>🔍</span>
                        <span>Chi tiết câu hỏi em đã trả lời sai ở kiến thức này:</span>
                      </div>
                      <div className="space-y-2">
                        {lesson.relatedErrorItems.map((err, errIdx) => (
                          <div key={errIdx} className="bg-white p-3.5 rounded-xl border border-amber-200 text-xs space-y-1.5 shadow-2xs">
                            <div className="font-bold text-slate-900 flex items-start gap-2">
                              <span className="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-black shrink-0 mt-0.5">
                                Câu {err.questionIndex || 'sai'}
                              </span>
                              <span>{formatDisplayQuestionText(err.questionText, { stripLeadingCau: true })}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                              <div className="text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-100 font-semibold">
                                ❌ Em đã chọn: <strong>{err.userAnswer || 'Chưa trả lời'}</strong>
                              </div>
                              <div className="text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-100 font-black">
                                ✓ Đáp án đúng: <strong>{err.correctAnswer}</strong>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 1. Lý thuyết cốt lõi */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-bio-600"></span>
                      1. Kiến Thức Lý Thuyết Trọng Tâm Theo YCCĐ (SGK Kết nối tri thức)
                    </h5>
                    <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 text-xs sm:text-sm text-slate-800 leading-relaxed font-medium whitespace-pre-line">
                      {lesson.coreTheory}
                    </div>
                  </div>

                  {/* 2. Ví dụ thực tế & Bài toán mẫu */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      2. Ví Dụ Minh Họa Trực Quan & Bài Toán Mẫu (Giúp Em Hiểu Bản Chất)
                    </h5>
                    <div className="p-4 sm:p-5 bg-emerald-50/70 rounded-2xl border border-emerald-200 text-xs sm:text-sm text-emerald-950 font-medium leading-relaxed whitespace-pre-line shadow-xs">
                      {lesson.practicalExample}
                    </div>
                  </div>

                  {/* 3. Cạm bẫy thường gặp */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                      3. Cạm Bẫy Đề Thi Cần Tránh (Lý Do Học Sinh Dễ Mắc Sai Lầm)
                    </h5>
                    <div className="p-4 sm:p-5 bg-rose-50/70 rounded-2xl border border-rose-200 text-xs sm:text-sm text-rose-950 font-semibold leading-relaxed whitespace-pre-line">
                      {lesson.commonTrap}
                    </div>
                  </div>

                  {/* 4. Sơ đồ tư duy / Điểm nhấn */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                      4. Sơ Đồ Tư Duy & Trực Quan Hóa Khái Niệm / Điểm Nhớ Nhanh
                    </h5>
                    <div className="p-4 sm:p-5 bg-blue-50/70 rounded-2xl border border-blue-200 text-xs sm:text-sm text-blue-950 font-bold leading-relaxed whitespace-pre-line">
                      {lesson.diagramOrKeyNote}
                    </div>
                  </div>
                </div>
              ))}

              {/* ========================================================================= */}
              {/* KHUNG CHAT TRỢ LÍ AI SINH HỌC (HỎI ĐÁP & GIẢI TỎA THẮC MẮC TRƯỚC KHI LUYỆN TẬP) */}
              {/* ========================================================================= */}
              <div className="bg-white rounded-3xl border-2 border-bio-200 shadow-lg overflow-hidden space-y-4">
                {/* Header Khung Chat */}
                <div className="bg-gradient-to-r from-bio-700 via-bio-600 to-teal-700 text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shadow-inner shrink-0">
                      🤖
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-sm sm:text-base leading-tight">
                          Trợ Lí AI Sinh Học — Giải Đáp Thắc Mắc Bài Học
                        </h4>
                        <span className="bg-emerald-400 text-emerald-950 text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                          ● Trực tuyến
                        </span>
                      </div>
                      <p className="text-bio-100 text-xs mt-0.5">
                        Hỏi bất kỳ điều gì bạn chưa rõ về lý thuyết, cơ chế hay các câu làm sai trước khi luyện tập bù đắp lỗ hỏng!
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-bold bg-white/10 px-3 py-1 rounded-xl text-bio-100 self-start sm:self-auto border border-white/20">
                    Bám sát SGK Kết nối tri thức
                  </span>
                </div>

                {/* Vùng Tin Nhắn Cuộn */}
                <div className="p-4 sm:p-6 space-y-4 max-h-[360px] overflow-y-auto bg-slate-50/70 border-y border-slate-100 rounded-2xl mx-3 sm:mx-4">
                  {chatMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.sender === 'ai' && (
                        <div className="w-8 h-8 rounded-full bg-bio-600 text-white flex items-center justify-center text-sm font-black shrink-0 shadow-xs">
                          🧬
                        </div>
                      )}
                      
                      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-xs ${
                        msg.sender === 'user'
                          ? 'bg-bio-600 text-white rounded-tr-none font-medium'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none font-normal whitespace-pre-line'
                      }`}>
                        <div className="font-bold text-[10px] opacity-70 mb-1 flex items-center justify-between gap-4">
                          <span>{msg.sender === 'user' ? (profile.studentName || user.name || 'Em') : 'Trợ Lí AI Sinh Học'}</span>
                          <span>{msg.timestamp}</span>
                        </div>
                        <div>{msg.text}</div>
                      </div>

                      {msg.sender === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center text-sm font-black shrink-0 shadow-xs">
                          👤
                        </div>
                      )}
                    </div>
                  ))}

                  {isAILoading && (
                    <div className="flex gap-3 justify-start animate-pulse">
                      <div className="w-8 h-8 rounded-full bg-bio-600 text-white flex items-center justify-center text-sm font-black shrink-0">
                        🧬
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3.5 text-xs text-slate-600 flex items-center gap-2 shadow-xs">
                        <span className="w-2 h-2 rounded-full bg-bio-600 animate-ping"></span>
                        <span className="font-semibold">Trợ Lí AI đang tra cứu SGK và phân tích câu trả lời...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Gợi Ý Câu Hỏi Nhanh (Quick Question Pills) */}
                <div className="px-4 sm:px-6 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                    <span>💡</span>
                    <span>Gợi ý câu hỏi nhanh (Bấm để hỏi ngay):</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickQuestions.map((q, qIdx) => (
                      <button
                        key={qIdx}
                        type="button"
                        disabled={isAILoading}
                        onClick={() => handleSendMessage(q)}
                        className="bg-bio-50 hover:bg-bio-100 active:scale-95 text-bio-800 border border-bio-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left shadow-2xs disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hộp Nhập Câu Hỏi & Nút Gửi */}
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="p-4 sm:p-5 border-t border-slate-100 flex gap-2 sm:gap-3 items-center"
                >
                  <input
                    type="text"
                    value={chatInput}
                    disabled={isAILoading}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Nhập thắc mắc của bạn về bài học (VD: Tại sao mạch mới lại tổng hợp gián đoạn?)..."
                    className="flex-1 px-4 py-3 bg-slate-50 focus:bg-white border border-slate-200 focus:border-bio-600 rounded-2xl text-xs sm:text-sm font-medium outline-none focus:ring-2 focus:ring-bio-500/20 transition disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={isAILoading || !chatInput.trim()}
                    className="bg-bio-700 hover:bg-bio-800 active:scale-95 text-white px-5 sm:px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed shrink-0"
                  >
                    <span>{isAILoading ? 'Đang gửi...' : 'Hỏi AI'}</span>
                    <span>🚀</span>
                  </button>
                </form>
              </div>

              {/* Nút Chuyển Tiếp Sang Luyện Tập Bù Đắp Lỗ Hỏng */}
              <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <span className="text-xs font-black text-emerald-950 block">
                    Đã nắm vững lý thuyết và giải tỏa hết thắc mắc?
                  </span>
                  <span className="text-[11px] text-emerald-800 font-medium">
                    Hãy bước vào làm bài kiểm tra thích ứng để bù đắp các câu trả lời sai nhé!
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('PRACTICE')}
                  className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white px-7 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <span>Bắt Đầu: 3. Luyện Tập Bù Đắp Lỗ Hỏng</span>
                  <span>🎯 →</span>
                </button>
              </div>
            </div>
          )}

          {/* ==================== TAB 3: LUYỆN TẬP BÙ ĐẮP LỖ HỎNG ==================== */}
          {activeTab === 'PRACTICE' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-emerald-900 text-white p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black flex items-center gap-2">
                    <span>🎯</span> Luyện Tập Bù Đắp Lỗ Hỏng Kiến Thức
                  </h3>
                  <p className="text-xs text-emerald-200 mt-1">
                    Gồm {profile.practiceQuestions.length} câu hỏi trọng tâm. Em cần hoàn thành và đạt kết quả <b>"Đánh giá tiến độ" trên 80%</b> để mở khóa làm lại đề gốc kiểm tra.
                  </p>
                </div>
                {profile.isRetestSubmitted && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider ${
                      isUnlockedToRetake ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-amber-950'
                    }`}>
                      {isUnlockedToRetake ? `✓ Đạt ${currentPracticePercent}% (> 80%)` : `⚠️ Đạt ${currentPracticePercent}% (Cần > 80%)`}
                    </span>
                  </div>
                )}
              </div>

              {/* Danh sách câu hỏi luyện tập */}
              <div className="space-y-5">
                {profile.practiceQuestions.map((q, idx) => {
                  const userAns = (practiceAnswers[q.id] || '').trim();
                  const isSubmitted = profile.isRetestSubmitted;
                  const cleanCorrect = (q.correctAnswer || '').trim();

                  let isCorrect = false;
                  if (q.type === 'SA') {
                    if (userAns.toLowerCase() === cleanCorrect.toLowerCase()) isCorrect = true;
                    else if (userAns !== '' && cleanCorrect !== '' && !isNaN(Number(userAns)) && !isNaN(Number(cleanCorrect)) && Number(userAns) === Number(cleanCorrect)) isCorrect = true;
                  } else if (q.type === 'MCQ' && Array.isArray(q.options)) {
                    if (userAns.toUpperCase() === cleanCorrect.toUpperCase()) isCorrect = true;
                    else {
                      const letters = ['A', 'B', 'C', 'D'];
                      const selIdx = letters.indexOf(userAns.toUpperCase());
                      if (selIdx !== -1 && q.options[selIdx]) {
                        const oText = q.options[selIdx].replace(/^[A-D][\.\:\)]\s*/i, '').trim().toLowerCase();
                        const cText = cleanCorrect.replace(/^[A-D][\.\:\)]\s*/i, '').trim().toLowerCase();
                        if (oText && cText && oText === cText) isCorrect = true;
                      }
                    }
                  } else {
                    isCorrect = userAns.toUpperCase() === cleanCorrect.toUpperCase();
                  }

                  return (
                    <div key={q.id} className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-xs space-y-4">
                      <div className="flex items-start gap-3">
                        <span className="bg-emerald-700 text-white px-3 py-1 rounded-xl text-xs font-black shrink-0 mt-0.5">
                          Câu {idx + 1}
                        </span>
                        <p className="font-black text-slate-900 text-sm sm:text-base leading-relaxed flex-1">
                          {formatDisplayQuestionText(q.text, { stripLeadingCau: true })}
                        </p>
                      </div>

                      {/* Lựa chọn MCQ */}
                      {q.type === 'MCQ' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {(q.options || []).map((opt, oIdx) => {
                            const optKey = ['A', 'B', 'C', 'D'][oIdx];
                            const cleanOptText = typeof opt === 'string' ? opt.replace(/^[A-D][\.\:\)]\s*/i, '').trim() : String(opt);
                            const isSelected = userAns.toUpperCase() === optKey;
                            const isAnswerKey =
                              cleanCorrect.toUpperCase() === optKey ||
                              (cleanOptText && cleanOptText.toLowerCase() === cleanCorrect.replace(/^[A-D][\.\:\)]\s*/i, '').trim().toLowerCase());

                            let btnStyle = 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300';
                            if (isSubmitted) {
                              if (isAnswerKey) btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black ring-2 ring-emerald-200';
                              else if (isSelected && !isCorrect) btnStyle = 'border-rose-400 bg-rose-50 text-rose-950 font-bold';
                            } else if (isSelected) {
                              btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black shadow-sm ring-2 ring-emerald-200';
                            }

                            return (
                              <button
                                key={oIdx}
                                type="button"
                                disabled={isSubmitted}
                                onClick={() => handleSelectPracticeAnswer(q.id, optKey)}
                                className={`p-4 rounded-2xl border-2 text-left font-medium text-sm transition-all flex items-start gap-3 cursor-pointer ${btnStyle}`}
                              >
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                                  isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {optKey}
                                </span>
                                <span className="pt-0.5 leading-snug">{cleanOptText}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Lựa chọn TF */}
                      {q.type === 'TF' && (
                        <div className="flex gap-4 pt-2">
                          {['Đúng', 'Sai'].map(opt => {
                            const isSelected = userAns.toLowerCase() === opt.toLowerCase();
                            const isAnswerKey = cleanCorrect.toLowerCase() === opt.toLowerCase();
                            let btnStyle = 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300';
                            if (isSubmitted) {
                              if (isAnswerKey) btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black ring-2 ring-emerald-200';
                              else if (isSelected && !isCorrect) btnStyle = 'border-rose-400 bg-rose-50 text-rose-950 font-bold';
                            } else if (isSelected) {
                              btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black shadow-sm ring-2 ring-emerald-200';
                            }

                            return (
                              <button
                                key={opt}
                                type="button"
                                disabled={isSubmitted}
                                onClick={() => handleSelectPracticeAnswer(q.id, opt)}
                                className={`flex-1 py-3.5 rounded-2xl border-2 font-black transition-all cursor-pointer ${btnStyle}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Trả lời ngắn SA */}
                      {q.type === 'SA' && (
                        <div className="pt-2 space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <span className="text-xs font-black uppercase text-purple-800 bg-purple-50 px-3 py-2 rounded-xl border border-purple-200 shrink-0">
                              ✍️ Điền đáp án trả lời ngắn:
                            </span>
                            <input
                              type="text"
                              disabled={isSubmitted}
                              value={practiceAnswers[q.id] || ''}
                              onChange={e => handleSelectPracticeAnswer(q.id, e.target.value)}
                              placeholder="Nhập số hoặc từ khóa đáp án..."
                              className={`flex-1 px-4 py-3 rounded-2xl border-2 font-bold text-sm outline-none transition ${
                                isSubmitted
                                  ? (isCorrect
                                      ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
                                      : 'border-rose-400 bg-rose-50 text-rose-950')
                                  : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 text-slate-900'
                              }`}
                            />
                          </div>
                          {isSubmitted && (
                            <div className="text-xs font-bold text-emerald-800 bg-emerald-50/80 px-3.5 py-2 rounded-xl border border-emerald-200">
                              ✓ Đáp án đúng chuẩn: <span className="font-black">{q.correctAnswer}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Giải thích sau khi nộp */}
                      {isSubmitted && q.explanation && (
                        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-950">
                          💡 <b>Hướng dẫn giải:</b> {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Nút nộp bài luyện tập */}
              {!profile.isRetestSubmitted ? (
                <div className="pt-4 flex justify-end">
                  <button
                    disabled={isSubmittingPractice || Object.keys(practiceAnswers).length === 0}
                    onClick={handleSubmitPractice}
                    className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSubmittingPractice ? 'Đang chấm điểm...' : 'Hoàn Thành & Đánh Giá Tiến Độ 🚀'}
                  </button>
                </div>
              ) : (
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-end gap-3">
                  {!isUnlockedToRetake && (
                    <button
                      type="button"
                      onClick={handleResetPracticeForRetry}
                      className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-6 py-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span>🔄</span>
                      <span>Làm Lại Bài Luyện Tập Bù Đắp (Để Đạt &gt; 80%)</span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('PROGRESS')}
                    className="w-full sm:w-auto bg-bio-700 hover:bg-bio-800 text-white px-8 py-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider shadow-md transition-all cursor-pointer"
                  >
                    Xem Kết Quả Đánh Giá Tiến Độ →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 4: ĐÁNH GIÁ TIẾN ĐỘ & CẬP NHẬT HỒ SƠ ==================== */}
          {activeTab === 'PROGRESS' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center space-y-6">
                <span className="text-6xl block">
                  {profile.improvementDelta !== undefined && profile.improvementDelta >= 0 ? '🚀' : '📈'}
                </span>
                <div>
                  <span className="text-xs font-black uppercase text-bio-600 bg-bio-50 px-3 py-1 rounded-full border border-bio-200">
                    KẾT QUẢ ĐÁNH GIÁ TIẾN ĐỘ
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3">
                    Đánh Giá Tiến Độ Sau Khi Luyện Tập Bù Đắp
                  </h3>
                </div>

                {/* So sánh điểm trước và sau */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto pt-2">
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl text-center space-y-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">Lần thi ban đầu</span>
                    <div className="text-4xl font-black text-slate-700">{profile.score10} đ</div>
                    <span className="text-xs text-rose-600 font-bold">
                      Sai {profile.errorItems.length} câu • {profile.weakLevel}
                    </span>
                  </div>

                  {(() => {
                    const currentPercent = profile.practicePercent !== undefined
                      ? profile.practicePercent
                      : (profile.practiceQuestions && profile.practiceQuestions.length > 0 && profile.practiceScore !== undefined
                          ? Math.round((profile.practiceScore / profile.practiceQuestions.length) * 100)
                          : 0);
                    const isUnlockedToRetake = !!profile.isRetestSubmitted && currentPercent > 80;

                    return (
                      <div className="p-6 bg-emerald-50 border-2 border-emerald-300 rounded-3xl text-center space-y-2 shadow-sm">
                        <span className="text-xs font-bold text-emerald-800 uppercase">Sau khi luyện bù đắp</span>
                        <div className="text-4xl font-black text-emerald-700">
                          {profile.isRetestSubmitted && profile.practiceScore !== undefined
                            ? `${currentPercent}%`
                            : '--'}
                        </div>
                        <span className="text-xs text-emerald-800 font-bold block">
                          {profile.isRetestSubmitted && profile.practiceScore !== undefined
                            ? `Đúng ${profile.practiceScore}/${profile.practiceQuestions.length} câu (Đạt ${currentPercent}%)`
                            : 'Chưa làm bài luyện tập'}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Hộp Thông Báo Quy Định Mở Khóa Làm Lại Đề Gốc */}
                {(() => {
                  const currentPercent = profile.practicePercent !== undefined
                    ? profile.practicePercent
                    : (profile.practiceQuestions && profile.practiceQuestions.length > 0 && profile.practiceScore !== undefined
                        ? Math.round((profile.practiceScore / profile.practiceQuestions.length) * 100)
                        : 0);
                  const isUnlockedToRetake = !!profile.isRetestSubmitted && currentPercent > 80;

                  if (!profile.isRetestSubmitted) {
                    return (
                      <div className="p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl max-w-xl mx-auto text-amber-950 font-medium text-xs sm:text-sm text-left space-y-2 shadow-xs">
                        <div className="flex items-center gap-2 font-black text-amber-900 uppercase">
                          <span>🔒</span>
                          <span>Quy Định: Cần Hoàn Thành Luyện Tập Bù Đắp (&gt; 80%)</span>
                        </div>
                        <p className="leading-relaxed">
                          Mỗi tài khoản học sinh chỉ làm bài kiểm tra gốc 1 lần. Để được mở khóa làm lại đề gốc, em cần hoàn thành <strong>"Luyện Tập Bù Đắp Lỗ Hổng"</strong> ở Tab 3 và đạt kết quả Đánh giá tiến độ <strong>trên 80%</strong>.
                        </p>
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveTab('PRACTICE')}
                            className="px-4 py-2 bg-bio-700 hover:bg-bio-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                          >
                            <span>🎯</span>
                            <span>Bước Vào Luyện Tập Bù Đắp Ngay</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className={`p-5 rounded-2xl max-w-xl mx-auto border-2 text-left space-y-2 shadow-xs ${
                      isUnlockedToRetake
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                        : 'bg-amber-50 border-amber-400 text-amber-950'
                    }`}>
                      <div className="flex items-center gap-2 font-black text-xs sm:text-sm uppercase tracking-wide">
                        <span className="text-xl">{isUnlockedToRetake ? '🔓' : '🔒'}</span>
                        <span className={isUnlockedToRetake ? 'text-emerald-900' : 'text-amber-900'}>
                          {isUnlockedToRetake
                            ? `ĐỦ ĐIỀU KIỆN MỞ KHÓA: ĐÃ ĐẠT ${currentPercent}% (> 80%)`
                            : `CHƯA ĐỦ ĐIỀU KIỆN MỞ KHÓA: TIẾN ĐỘ ĐẠT ${currentPercent}% (CẦN > 80%)`}
                        </span>
                      </div>
                      <p className="text-xs font-medium leading-relaxed">
                        {isUnlockedToRetake ? (
                          <>
                            🎉 <b>Chúc mừng em!</b> Em đã hoàn thành xuất sắc bài luyện tập bù đắp với kết quả tiến độ đạt <b>{currentPercent}%</b> (vượt chuẩn yêu cầu &gt; 80%). Em đã đủ điều kiện để <b>làm lại đề kiểm tra gốc</b> nhằm nâng cao điểm số!
                          </>
                        ) : (
                          <>
                            ⚠️ Kết quả Đánh giá tiến độ hiện tại là <b>{currentPercent}%</b>. Theo quy chế học tập, em cần đạt <b>trên 80%</b> mới được phép làm lại đề kiểm tra gốc. Em hãy xem lại lý thuyết ở <i>Tab 2. Bài Học Củng Cố</i> và bấm nút bên dưới để luyện tập lại nhé!
                          </>
                        )}
                      </p>
                      {!isUnlockedToRetake && (
                        <div className="pt-2 flex justify-start">
                          <button
                            type="button"
                            onClick={handleResetPracticeForRetry}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                          >
                            <span>🔄</span>
                            <span>Luyện Tập Lại Bài Bù Đắp (Để Đạt &gt; 80%)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Đánh giá sự thay đổi */}
                {profile.isRetestSubmitted && profile.improvementDelta !== undefined && (
                  <div className="p-5 bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300 rounded-2xl max-w-xl mx-auto text-emerald-950 font-bold text-sm leading-relaxed">
                    {profile.improvementDelta >= 0 ? (
                      <>
                        🎉 <b>Tiến bộ vượt trội!</b> Em đã nâng điểm thêm <span className="text-emerald-800 font-black text-lg">+{profile.improvementDelta} điểm</span>. Các lỗ hỏng về "{profile.weakTopics.slice(0, 2).join(', ')}" đã được khắc phục thành công!
                      </>
                    ) : (
                      <>
                        ⚠️ Em đã làm bài củng cố, hãy tiếp tục đọc kỹ lại lý thuyết để nắm chắc 100% dạng bài này nhé!
                      </>
                    )}
                  </div>
                )}

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={onClose}
                    className="w-full sm:w-auto bg-slate-900 hover:bg-black text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Đóng Bảng Phân Tích
                  </button>
                  {(() => {
                    const currentPercent = profile.practicePercent !== undefined
                      ? profile.practicePercent
                      : (profile.practiceQuestions && profile.practiceQuestions.length > 0 && profile.practiceScore !== undefined
                          ? Math.round((profile.practiceScore / profile.practiceQuestions.length) * 100)
                          : 0);
                    const isUnlockedToRetake = !!profile.isRetestSubmitted && currentPercent > 80;

                    if (!onRetakeExam) return null;

                    return (
                      <button
                        onClick={isUnlockedToRetake ? onRetakeExam : undefined}
                        disabled={!isUnlockedToRetake}
                        className={`w-full sm:w-auto px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                          isUnlockedToRetake
                            ? 'bg-bio-700 hover:bg-bio-800 text-white cursor-pointer shadow-md'
                            : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-80'
                        }`}
                        title={isUnlockedToRetake ? "Làm lại đề thi gốc" : "Cần hoàn thành bài bù đắp và đạt Đánh giá tiến độ > 80% để mở khóa"}
                      >
                        <span>{isUnlockedToRetake ? '🚀 Tự Tin Làm Lại Bài Thi Gốc Ngay (Đã Mở Khóa)' : '🔒 Làm Lại Bài Thi Gốc (Cần Tiến Độ > 80%)'}</span>
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
