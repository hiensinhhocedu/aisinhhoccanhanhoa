import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, UserRole, BIO_TOPICS, Exam, Question, ExamResult } from '../types';
import { generateBiologyQuestions, formatDisplayQuestionText } from '../services/geminiService';
import { publishExamToCloud, getExamById, submitExamResultToCloud, fetchCloudLeaderboard, getExams, deleteExamFromCloud, saveStoredUser, mergeExamHistories } from '../services/dataService';

interface BattleViewProps {
  user: User;
  onUpdateUser: (user: User) => void;
}

// Helper function to calculate time ago
const getTimeAgo = (dateString?: string) => {
  if (!dateString) return '';
  const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " năm trước";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " tháng trước";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " ngày trước";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " giờ trước";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " phút trước";
  return "vừa xong";
};

export const BattleView: React.FC<BattleViewProps> = ({ user, onUpdateUser }) => {
  const isAdmin = user.role === UserRole.ADMIN;
  
  // Views: MENU -> SETUP -> GENERATING -> LOBBY -> PLAYING -> RESULT
  const [viewState, setViewState] = useState<'MENU' | 'SETUP' | 'JOIN' | 'GENERATING' | 'LOBBY' | 'PLAYING' | 'RESULT'>('MENU');
  
  // Data for Dashboard
  const [activeBattles, setActiveBattles] = useState<Exam[]>([]);
  const [battleResults, setBattleResults] = useState<Record<string, {name: string, score: number}[]>>({});
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);

  // UI Loading State for Joining
  const [isJoining, setIsJoining] = useState(false);

  // Setup State
  const [selectedGrade, setSelectedGrade] = useState<'Sinh 10' | 'Sinh 11' | 'Sinh 12'>('Sinh 12');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [duration, setDuration] = useState<number>(10);
  const [questionCount, setQuestionCount] = useState<number>(10);
  
  // Room State
  const [roomCode, setRoomCode] = useState('');
  const [currentBattleExam, setCurrentBattleExam] = useState<Exam | null>(null);
  
  // Admin Inspection State
  const [inspectingExam, setInspectingExam] = useState<Exam | null>(null);
  
  // Gameplay State
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [score, setScore] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lobby Notification State
  const [lobbyNotification, setLobbyNotification] = useState<string | null>(null);
  const [lobbyPlayerList, setLobbyPlayerList] = useState<string[]>([]);
  
  // Ranking State for Result View
  const [battleRankings, setBattleRankings] = useState<{name: string, score: number}[]>([]);

  // Load Dashboard Data
  useEffect(() => {
    if (viewState === 'MENU') {
        loadDashboard();
    }
  }, [viewState]);

  // Polling for new players in LOBBY
  useEffect(() => {
    let interval: any;
    if (viewState === 'LOBBY' && currentBattleExam) {
      // Helper to fetch players
      const fetchPlayers = async () => {
        try {
          const leaderboard = await fetchCloudLeaderboard('MONTH');
          const players = new Set<string>();
          (leaderboard || []).forEach((u: any) => {
             // Check if user has joined this battle
             if (u && Array.isArray(u.examHistory) && u.examHistory.some((h: any) => h && h.examId === currentBattleExam.id)) {
                 if (u.name) players.add(u.name);
             }
          });
          return Array.from(players);
        } catch (e) {
          return [];
        }
      };

      // Initial fetch
      fetchPlayers().then(initialList => setLobbyPlayerList(initialList));

      // Poll every 5 seconds
      interval = setInterval(async () => {
        const currentList = await fetchPlayers();
        
        setLobbyPlayerList(prev => {
           // Find new players
           const newJoiners = currentList.filter(p => !prev.includes(p));
           if (newJoiners.length > 0) {
             setLobbyNotification(`${newJoiners[0]} vừa tham gia phòng đấu.`);
             // Auto hide after 3 seconds
             setTimeout(() => setLobbyNotification(null), 3000);
           }
           return currentList;
        });
      }, 5000);
    }
    
    return () => clearInterval(interval);
  }, [viewState, currentBattleExam]);

  // Polling for Rankings in RESULT view
  useEffect(() => {
    let interval: any;
    if (viewState === 'RESULT' && currentBattleExam) {
        const fetchRankings = async () => {
            try {
                // Fetch latest data from cloud
                const allUsers = await fetchCloudLeaderboard('MONTH');
                
                const participants: {name: string, score: number}[] = [];
                
                // Filter users who played THIS specific exam ID
                (allUsers || []).forEach((u: any) => {
                    const match = u && Array.isArray(u.examHistory) ? u.examHistory.find((h: any) => h && h.examId === currentBattleExam.id) : undefined;
                    if (match) {
                        participants.push({
                            name: u.name || 'Người dùng',
                            score: match.score || 0
                        });
                    }
                });

                // Sort descending by score
                participants.sort((a, b) => b.score - a.score);
                setBattleRankings(participants);
            } catch (e) {
                console.error("Error fetching battle rankings", e);
            }
        };

        fetchRankings();
        interval = setInterval(fetchRankings, 5000); // Live update every 5s
    }
    return () => clearInterval(interval);
  }, [viewState, currentBattleExam]);


  const loadDashboard = async () => {
      setIsLoadingDashboard(true);
      try {
          const [exams, leaderboard] = await Promise.all([
              getExams(),
              fetchCloudLeaderboard('MONTH') // Get recent activity to find participants
          ]);

          // Filter only BATTLE exams
          const battles = (exams || []).filter(e => e.category === 'BATTLE');
          setActiveBattles(battles);

          // Aggregate results per exam
          const resultsMap: Record<string, {name: string, score: number}[]> = {};
          
          (leaderboard || []).forEach((u: any) => {
              if (u && Array.isArray(u.examHistory)) {
                  u.examHistory.forEach((h: any) => {
                      if (h && h.examId) {
                          if (!resultsMap[h.examId]) resultsMap[h.examId] = [];
                          // Add user result if not already added (simple check)
                          if (!resultsMap[h.examId].find(r => r.name === u.name && r.score === h.score)) {
                             resultsMap[h.examId].push({ name: u.name || 'Người dùng', score: h.score || 0 });
                          }
                      }
                  });
              }
          });
          setBattleResults(resultsMap);

      } catch (error) {
          console.error("Failed to load dashboard", error);
      } finally {
          setIsLoadingDashboard(false);
      }
  };

  // Init default topic
  useEffect(() => {
    if (BIO_TOPICS[selectedGrade]?.length > 0) {
      setSelectedTopic(BIO_TOPICS[selectedGrade][0]);
    }
  }, [selectedGrade]);

  // Timer
  useEffect(() => {
    let timer: any;
    if (viewState === 'PLAYING' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && viewState === 'PLAYING') {
      submitBattle();
    }
    return () => clearInterval(timer);
  }, [timeLeft, viewState]);

  // --- ACTIONS ---

  const handleCreateRoom = async () => {
    if (!selectedTopic) return alert("Vui lòng chọn chủ đề!");
    
    // Check Creation Limit for Students (7 rooms/day)
    if (!isAdmin) {
        const today = new Date().toDateString();
        const createdTodayCount = activeBattles.filter(b => 
            b.createdBy === user.name && 
            b.createdAt && 
            new Date(b.createdAt).toDateString() === today
        ).length;

        if (createdTodayCount >= 7) {
            alert("Chỉ tạo được 7 phòng đấu/ngày");
            return;
        }
    }
    
    setViewState('GENERATING');
    const fullTopic = `${selectedGrade} - ${selectedTopic}`;
    
    // 1. Generate Questions via AI
    const questions = await generateBiologyQuestions(fullTopic, questionCount);
    
    if (questions.length === 0) {
      alert("AI đang bận, vui lòng thử lại sau!");
      setViewState('SETUP');
      return;
    }

    // 2. Create Exam Object
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const newBattleExam: Exam = {
      id: code, // Room Code is ID
      title: `Thách đấu: ${selectedTopic}`,
      category: 'BATTLE',
      duration: duration,
      questions: questions,
      createdBy: user.name,
      isLocked: false,
      createdAt: new Date().toISOString() // Track creation time
    };

    // 3. Save to Cloud
    const success = await publishExamToCloud(newBattleExam);
    
    if (success) {
      setCurrentBattleExam(newBattleExam);
      setRoomCode(code);
      setViewState('LOBBY');
    } else {
      alert("Lỗi kết nối máy chủ. Không thể tạo phòng.");
      setViewState('SETUP');
    }
  };

  const handleJoinRoom = async (codeInput?: string | number) => {
    // 1. Normalize inputs to String to prevent "trim is not a function" error if ID is number
    // and to handle ID type mismatches (number vs string)
    const safeCodeInput = codeInput !== undefined ? String(codeInput) : undefined;
    const codeToJoin = (safeCodeInput !== undefined ? safeCodeInput : roomCode).trim();
    
    // VALIDATION FIX: 
    // Only enforce length check if manually typing (safeCodeInput is undefined). 
    // If clicking "Tham chiến", we trust the ID from the card.
    if (safeCodeInput === undefined) {
        if (!codeToJoin || codeToJoin.length !== 6) {
            return alert("Mã phòng phải có 6 chữ số");
        }
    } else {
        if (!codeToJoin) return;
    }

    setIsJoining(true); // Start loading UI
    
    try {
        let targetExam: Exam | undefined;

        // 1. Fast path: If joining via "Tham chiến" button, look in current list.
        // Compare using String() to handle cases where ID might be parsed as number by API
        if (safeCodeInput) {
            targetExam = activeBattles.find(e => String(e.id) === codeToJoin);
        }

        // 2. Slow path: Manual entry or not found in current list
        if (!targetExam) {
             const exams = await getExams();
             targetExam = exams.find(e => String(e.id) === codeToJoin);
        }
        
        if (targetExam) {
            // CHECK: User can only join ONCE per Battle ID
            const hasJoined = (user.examHistory || []).some(h => h && h.examId === targetExam!.id);
            if (hasJoined) {
                alert("⛔ Bạn đã tham gia phòng đấu này rồi! Mỗi tài khoản chỉ được tham gia 1 lần.");
                setIsJoining(false);
                return;
            }

            if (targetExam.isLocked && !isAdmin) {
                alert("Phòng đấu này đã bị khóa bởi quản trị viên.");
                setIsJoining(false);
                return;
            }
            
            // Clean state for new game
            setAnswers({});
            setScore(0);
            setTimeLeft(0);
            setLobbyPlayerList([]);
            setLobbyNotification(null);
            
            // Set the specific exam from Host
            setCurrentBattleExam(targetExam);
            setRoomCode(codeToJoin);
            setViewState('LOBBY');
        } else {
            alert("Không tìm thấy phòng đấu này. Vui lòng kiểm tra lại mã.");
        }
    } catch (error) {
        console.error("Join Room Error:", error);
        alert("Lỗi kết nối khi vào phòng.");
    } finally {
        setIsJoining(false); // Stop loading UI
    }
  };

  // Admin Actions
  const handleAdminDelete = async (examId: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa phòng đấu này? Hành động này không thể hoàn tác.')) {
      const success = await deleteExamFromCloud(examId);
      if (success) {
        // Update UI state directly instead of reloading from server
        // This prevents the "zombie" item effect if server is slow or fails silently
        setActiveBattles(prev => prev.filter(b => b.id !== examId));
        alert('Đã xóa phòng đấu.');
      } else {
        alert('Lỗi khi xóa.');
      }
    }
  };

  const handleAdminToggleLock = async (exam: Exam) => {
    const updatedExam = { ...exam, isLocked: !exam.isLocked };
    const success = await publishExamToCloud(updatedExam); // Update existing
    if (success) {
      // Update UI state directly
      setActiveBattles(prev => prev.map(b => b.id === exam.id ? updatedExam : b));
    }
  };

  const startBattle = () => {
    if (!currentBattleExam) return;
    setAnswers({});
    setScore(0);
    setTimeLeft(currentBattleExam.duration * 60);
    setViewState('PLAYING');
  };

  const handleAnswer = (qId: string, val: string) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const submitBattle = async () => {
    if (!currentBattleExam) return;
    setIsSubmitting(true);

    // Calculate Score
    let correctCount = 0;
    let wrongNhanBiet = 0;
    let wrongThongHieu = 0;
    let wrongVanDung = 0;
    const totalQ = (currentBattleExam.questions || []).length;
    const details: any[] = [];

    (currentBattleExam.questions || []).forEach((q, idx) => {
      if (!q) return;
      const userAns = (answers[q.id] || '').trim();
      const isCorrect = userAns.toLowerCase() === (q.correctAnswer || '').trim().toLowerCase();
      if (isCorrect) {
        correctCount++;
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

    setScore(correctCount);

    // Submit Result
    const score10 = totalQ > 0 ? Math.round((correctCount / totalQ) * 10 * 100) / 100 : 0;
    const result: ExamResult = {
      turnId: `LT_BATTLE_${Date.now()}`,
      examId: currentBattleExam.id,
      examTitle: `[Đấu Trường] ${currentBattleExam.title}`,
      lessonName: currentBattleExam.lessonName || currentBattleExam.topic || currentBattleExam.title,
      score: correctCount,
      totalQuestions: totalQ,
      score10,
      timeSpentSeconds: Math.max(1, (currentBattleExam.duration || 15) * 60 - Math.max(0, timeLeft)),
      wrongNhanBiet,
      wrongThongHieu,
      wrongVanDung,
      date: new Date().toISOString(),
      details
    };
    
    const response = await submitExamResultToCloud(user.phone, result, {
      studentId: user.studentId,
      name: user.name,
      className: user.className,
      phone: user.phone
    });
    
    if (response.success && response.updatedUser) {
        onUpdateUser(response.updatedUser);
    } else {
        // Fallback: update local user state if API doesn't return updated user
        const updatedHistory = mergeExamHistories(user.examHistory || [], [result], user);
        const updatedUser: User = {
            ...user,
            totalScore: user.totalScore + correctCount,
            examHistory: updatedHistory
        };
        saveStoredUser(updatedUser);
        onUpdateUser(updatedUser);
    }
    
    setViewState('RESULT');
    setIsSubmitting(false);
  };

  // --- RENDERS ---

  if (viewState === 'MENU') {
      return (
          <div className="space-y-6 animate-fade-in relative">
              {/* Admin Inspection Modal */}
              {inspectingExam && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-xl flex flex-col shadow-2xl">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                      <h3 className="text-xl font-bold text-gray-800">
                        🕵️ Admin Soi Đề: {inspectingExam.title} (Mã: {inspectingExam.id})
                      </h3>
                      <button onClick={() => setInspectingExam(null)} className="text-gray-500 hover:text-red-500 text-2xl font-bold">&times;</button>
                    </div>
                    <div className="overflow-y-auto p-6 space-y-4">
                       {inspectingExam.questions.map((q, idx) => (
                         <div key={idx} className="border border-gray-200 p-4 rounded-lg">
                           <div className="font-bold text-gray-800 mb-2">Câu {idx + 1}: {formatDisplayQuestionText(q.text, { stripLeadingCau: true })}</div>
                           {q.image && (
                             <img src={q.image} alt="Illustration" className="max-w-full h-auto max-h-40 mb-2 border rounded" />
                           )}
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                             {q.options.map((opt, i) => {
                               const label = ['A', 'B', 'C', 'D'][i];
                               const isCorrect = label === q.correctAnswer;
                               return (
                                 <div key={i} className={`p-2 rounded border ${isCorrect ? 'bg-green-100 border-green-500 text-green-800 font-bold' : 'bg-white border-gray-200'}`}>
                                   {label}. {opt} {isCorrect && '✅'}
                                 </div>
                               );
                             })}
                           </div>
                         </div>
                       ))}
                    </div>
                    <div className="p-4 border-t bg-gray-50 rounded-b-xl text-right">
                      <button onClick={() => setInspectingExam(null)} className="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold">Đóng</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Top Action Bar */}
              <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
                  <div className="flex items-center gap-2">
                      <span className="text-2xl">⚔️</span>
                      <h2 className="text-xl font-bold text-gray-800">Sàn Đấu Sinh Học</h2>
                      {isAdmin && <span className="bg-red-600 text-white text-xs px-2 py-1 rounded">Admin Mode</span>}
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                      <input 
                        type="text" 
                        placeholder="Nhập mã phòng..." 
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-bio-500 w-full md:w-40"
                        value={roomCode}
                        onChange={e => setRoomCode(e.target.value)}
                        maxLength={6}
                      />
                      <button 
                        onClick={() => handleJoinRoom()}
                        disabled={isJoining}
                        className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-200 text-sm whitespace-nowrap disabled:text-gray-400"
                      >
                        {isJoining ? '⏳...' : 'Vào Phòng'}
                      </button>
                      <button 
                        onClick={() => setViewState('SETUP')}
                        disabled={isJoining}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 text-sm whitespace-nowrap shadow-md flex items-center gap-1 disabled:bg-gray-400"
                      >
                        <span>+</span> Tạo Thách Đấu
                      </button>
                  </div>
              </div>

              {/* List of Battles */}
              <div>
                  <h3 className="font-bold text-gray-700 mb-4 border-l-4 border-bio-600 pl-3">Các trận đấu gần đây</h3>
                  
                  {isLoadingDashboard ? (
                      <div className="text-center py-10 text-gray-500">Đang tải danh sách thách đấu...</div>
                  ) : activeBattles.length === 0 ? (
                      <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                          <div className="text-4xl mb-4">🛡️</div>
                          <p className="text-gray-500 mb-2">Chưa có trận đấu nào được tạo.</p>
                          <button onClick={() => setViewState('SETUP')} className="text-red-600 font-bold hover:underline">Hãy là người đầu tiên tạo phòng!</button>
                      </div>
                  ) : (
                      <div className="grid gap-4">
                          {activeBattles.map((battle) => {
                              const participants = battleResults[battle.id] || [];
                              const isLocked = battle.isLocked;
                              const hasJoined = (user.examHistory || []).some(h => h && h.examId === battle.id);
                              
                              return (
                                  <div key={battle.id} className={`bg-white p-5 rounded-xl shadow-sm border flex flex-col md:flex-row justify-between gap-4 transition ${isLocked ? 'border-red-200 bg-red-50' : 'border-gray-100 hover:shadow-md'}`}>
                                      {/* Left Info */}
                                      <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-2">
                                              <span className="bg-white text-red-700 border border-red-200 text-[10px] font-bold px-2 py-1 rounded shadow-sm">BATTLE</span>
                                              <span className="text-gray-400 text-xs font-mono">#{battle.id}</span>
                                              {isLocked && <span className="bg-gray-800 text-white text-[10px] font-bold px-2 py-1 rounded">🔒 ĐÃ KHÓA</span>}
                                              {hasJoined && <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded">✅ ĐÃ THAM GIA</span>}
                                          </div>
                                          <h4 className="text-lg font-bold text-gray-800 mb-2">{battle.title}</h4>
                                          <div className="flex flex-wrap gap-2 text-xs mb-3">
                                              <span className="bg-white text-red-700 border border-red-200 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm font-bold">
                                                  👤 Host: {battle.createdBy}
                                                  {battle.createdAt && (
                                                    <span className="text-red-400 font-normal text-[10px] ml-1 opacity-90 border-l border-red-200 pl-1">
                                                      {getTimeAgo(battle.createdAt)}
                                                    </span>
                                                  )}
                                              </span>
                                              <span className="bg-white text-red-700 border border-red-200 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm font-bold">
                                                  ⏱ {battle.duration} phút
                                              </span>
                                              <span className="bg-white text-red-700 border border-red-200 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm font-bold">
                                                  📝 {Array.isArray(battle.questions) ? battle.questions.length : 0} câu
                                              </span>
                                          </div>
                                          
                                          {/* Participants Mini List */}
                                          {participants.length > 0 && (
                                                  <div className="bg-white/50 p-2 rounded-lg text-xs border border-gray-100">
                                                      <p className="font-bold text-gray-600 mb-1">Kết quả người chơi:</p>
                                                      <div className="flex flex-wrap gap-2">
                                                          {participants.map((p, idx) => (
                                                              <span key={idx} className="bg-white border border-gray-200 px-2 py-1 rounded flex items-center gap-1 shadow-sm">
                                                                  <span>{idx === 0 ? '🥇' : '👤'}</span>
                                                                  <span className="text-gray-700">{p.name}:</span>
                                                                  <span className={`font-bold ${p.score >= (battle.questions.length * 0.8) ? 'text-green-600' : 'text-gray-800'}`}>
                                                                    {p.score}/{Array.isArray(battle.questions) ? battle.questions.length : 0}
                                                                  </span>
                                                              </span>
                                                          ))}
                                                      </div>
                                                  </div>
                                          )}
                                          
                                          {/* Admin Controls Area */}
                                          {isAdmin && (
                                            <div className="mt-3 flex gap-2 pt-2 border-t border-gray-200">
                                              <button 
                                                onClick={() => handleAdminDelete(battle.id)}
                                                className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 font-semibold"
                                              >
                                                🗑️ Xóa phòng
                                              </button>
                                              <button 
                                                onClick={() => handleAdminToggleLock(battle)}
                                                className={`text-xs px-2 py-1 rounded font-semibold ${isLocked ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}`}
                                              >
                                                {isLocked ? '🔓 Mở khóa' : '🔒 Khóa phòng'}
                                              </button>
                                              <button 
                                                onClick={() => setInspectingExam(battle)}
                                                className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 font-semibold"
                                              >
                                                👁️ Xem đáp án
                                              </button>
                                            </div>
                                          )}
                                      </div>

                                      {/* Right Action */}
                                      <div className="flex flex-col justify-center items-end min-w-[120px]">
                                          <button 
                                            onClick={() => handleJoinRoom(battle.id)}
                                            disabled={(isLocked && !isAdmin) || isJoining || hasJoined}
                                            className={`w-full py-2 px-4 rounded-lg font-bold shadow-sm transition active:scale-95 flex items-center justify-center gap-2 ${
                                              hasJoined 
                                              ? 'bg-blue-100 text-blue-500 cursor-not-allowed border border-blue-200'
                                              : (isLocked && !isAdmin) 
                                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                                  : 'bg-bio-600 text-white hover:bg-bio-700'
                                            }`}
                                          >
                                            {isJoining 
                                                ? '⏳ Đang vào...' 
                                                : hasJoined 
                                                    ? '✅ Đã Thi' 
                                                    : (isLocked 
                                                        ? (isAdmin ? '⚔️ Vào (Admin)' : '🔒 Đã Khóa') 
                                                        : '⚔️ Tham chiến')
                                            }
                                          </button>
                                          <p className="text-[10px] text-gray-400 mt-2 text-center w-full">
                                              {participants.length} người đã tham gia
                                          </p>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  )}
              </div>
          </div>
      );
  }

  if (viewState === 'GENERATING') {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow">
        <div className="text-6xl animate-bounce mb-6">🤖</div>
        <h2 className="text-2xl font-bold text-bio-600 mb-2">AI Đang Soạn Đề...</h2>
        <p className="text-gray-500">Đang tạo {questionCount} câu hỏi về "{selectedTopic}"</p>
        <p className="text-xs text-gray-400 mt-4">Vui lòng đợi trong giây lát...</p>
      </div>
    );
  }

  if (viewState === 'LOBBY') {
    return (
      <div className="max-w-md mx-auto bg-white p-8 rounded-xl shadow text-center border-t-4 border-bio-600 relative">
        <h2 className="text-xl text-gray-500 uppercase tracking-wider mb-2">Mã Phòng Đấu</h2>
        <div className="text-5xl font-mono font-bold text-bio-600 mb-6 bg-bio-50 p-6 rounded-xl border-2 border-dashed border-bio-200 tracking-widest selection:bg-bio-200">
          {currentBattleExam?.id}
        </div>
        
        <div className="text-left bg-gray-50 p-4 rounded mb-6">
            <p className="font-bold text-gray-800">Thông tin trận đấu:</p>
            <ul className="text-sm text-gray-600 list-disc ml-5 mt-2 space-y-1">
                <li>Chủ đề: <b>{currentBattleExam?.title.replace('Thách đấu: ', '')}</b></li>
                <li>Thời gian: <b>{currentBattleExam?.duration} phút</b></li>
                <li>Số câu hỏi: <b>{Array.isArray(currentBattleExam?.questions) ? currentBattleExam.questions.length : 0} câu</b></li>
                <li>Người tạo: <b>{currentBattleExam?.createdBy}</b></li>
                {currentBattleExam?.isLocked && <li className="text-red-500 font-bold">Trạng thái: Đang khóa</li>}
            </ul>
        </div>

        <div className="space-y-3">
            <button 
                onClick={startBattle}
                className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 shadow-lg transform transition hover:scale-105"
            >
                BẮT ĐẦU LÀM BÀI
            </button>
            <button 
                onClick={() => setViewState('MENU')}
                className="text-gray-500 hover:text-gray-800 text-sm"
            >
                Quay lại danh sách
            </button>
        </div>
        
        {/* Lobby Toast Notification */}
        {lobbyNotification && (
           <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2 w-full max-w-sm">
             <div className="bg-gray-800 text-white px-4 py-3 rounded-lg shadow-xl flex items-center justify-center gap-2 animate-bounce">
                <span className="text-xl">👋</span>
                <span className="font-medium text-sm">{lobbyNotification}</span>
             </div>
           </div>
        )}
      </div>
    );
  }

  if (viewState === 'PLAYING') {
    // Portal the timer to the main Header
    const portalTarget = document.getElementById('header-timer-portal');
    const timerDisplay = timeLeft > 0 && portalTarget 
        ? createPortal(
            <div className={`bg-white px-4 py-1.5 rounded-lg shadow-sm border-2 font-mono font-bold text-lg pointer-events-auto transition-all ${
                 timeLeft <= 60 
                 ? 'border-red-500 text-red-600 animate-pulse' 
                 : 'border-white text-bio-700'
            }`}>
               {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </div>,
            portalTarget
          )
        : null;

    return (
       <div className="-mt-4 -mx-4 md:-mt-8 md:-mx-8">
        {timerDisplay}
        
        <div className="sticky top-0 z-30 bg-white shadow-md border-b border-gray-200 px-4 py-3 md:px-8">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-800 truncate max-w-xs sm:max-w-md">{currentBattleExam?.title}</h2>
              <p className="text-xs text-gray-500">Thí sinh: {user.name}</p>
            </div>
            {/* Timer removed from here */}
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <div className="bg-white p-6 rounded-xl shadow space-y-6">
                {currentBattleExam?.questions.map((q, idx) => (
                    <div key={idx} className="p-4 border border-gray-100 rounded-lg bg-gray-50">
                        <p className="font-semibold text-gray-800 mb-3">
                            <span className="text-bio-600 mr-1">Câu {idx + 1}:</span> {formatDisplayQuestionText(q.text, { stripLeadingCau: true })}
                        </p>
                        {q.image && (
                          <div className="mb-4">
                            <img src={q.image} alt="Illustration" className="max-w-full h-auto max-h-60 rounded border border-gray-200" />
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {q.options.map((opt, i) => {
                                const label = ['A', 'B', 'C', 'D'][i];
                                const isSelected = answers[q.id] === label;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleAnswer(q.id, label)}
                                        className={`text-left p-3 rounded border transition text-sm ${
                                            isSelected 
                                            ? 'bg-bio-600 text-white border-bio-600 shadow-md' 
                                            : 'bg-white text-gray-700 border-gray-200 hover:border-bio-300 hover:bg-bio-50'
                                        }`}
                                    >
                                        <span className={`font-bold mr-2 ${isSelected ? 'text-white' : 'text-bio-600'}`}>{label}.</span>
                                        {opt}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}
                <div className="mt-8 pt-4 border-t flex justify-end">
                    <button 
                        onClick={submitBattle}
                        disabled={isSubmitting}
                        className="bg-red-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-red-700 disabled:bg-gray-400"
                    >
                        {isSubmitting ? 'Đang nộp...' : 'NỘP BÀI THI'}
                    </button>
                </div>
            </div>
        </div>
       </div>
    );
  }

  if (viewState === 'RESULT') {
    return (
      <div className="max-w-4xl mx-auto bg-white p-6 md:p-8 rounded-xl shadow">
         <div className="text-center mb-8 border-b border-gray-100 pb-6">
             <div className="text-6xl mb-4">🏁</div>
             <h2 className="text-2xl font-bold text-gray-800 mb-2">Kết Quả Thách Đấu</h2>
             <p className="text-gray-500 mb-6">{currentBattleExam?.title}</p>
             
             <div className="bg-bio-50 p-6 rounded-2xl mb-6 border border-bio-100 max-w-sm mx-auto">
                <div className="text-5xl font-bold text-bio-600 mb-2">
                    {score}/{Array.isArray(currentBattleExam?.questions) ? currentBattleExam.questions.length : 0}
                </div>
                <p className="text-bio-800 font-medium uppercase text-sm tracking-wide">Số câu đúng</p>
             </div>

             {/* Live Ranking Board */}
             <div className="mb-8">
                 <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center justify-center gap-2">
                     <span>🏆</span> Bảng Xếp Hạng Phòng
                     {battleRankings.length === 0 && <span className="text-sm font-normal text-gray-500 animate-pulse">(Đang cập nhật...)</span>}
                 </h3>
                 <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                     <table className="w-full text-sm">
                         <thead className="bg-gray-100 border-b border-gray-200">
                             <tr>
                                 <th className="py-2 px-4 text-center w-16">Hạng</th>
                                 <th className="py-2 px-4 text-left">Người chơi</th>
                                 <th className="py-2 px-4 text-center">Điểm</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100">
                             {battleRankings.length > 0 ? battleRankings.map((p, index) => {
                                 const isMe = p.name === user.name;
                                 let rankIcon = `#${index + 1}`;
                                 if (index === 0) rankIcon = '🥇';
                                 if (index === 1) rankIcon = '🥈';
                                 if (index === 2) rankIcon = '🥉';

                                 return (
                                     <tr key={index} className={`${isMe ? 'bg-yellow-50 font-bold' : ''}`}>
                                         <td className="py-3 px-4 text-center text-lg">{rankIcon}</td>
                                         <td className="py-3 px-4">
                                             {p.name} {isMe && <span className="ml-2 text-xs bg-bio-600 text-white px-1.5 py-0.5 rounded">Bạn</span>}
                                         </td>
                                         <td className="py-3 px-4 text-center font-bold text-bio-700">{p.score}</td>
                                     </tr>
                                 );
                             }) : (
                                 <tr><td colSpan={3} className="py-4 text-center text-gray-400 italic">Chưa có kết quả khác.</td></tr>
                             )}
                         </tbody>
                     </table>
                 </div>
                 <p className="text-xs text-gray-400 mt-2 text-center animate-pulse">
                     Dữ liệu tự động cập nhật mỗi 5 giây...
                 </p>
             </div>

             <div className="bg-gray-50 p-4 rounded text-center text-sm text-gray-600 mb-6 max-w-lg mx-auto">
                <p>Kết quả của bạn đã được lưu lại.</p>
                <p>Người chơi khác nhập mã <b>{currentBattleExam?.id}</b> sẽ thi cùng đề này.</p>
             </div>

             <button 
                onClick={() => {
                    setViewState('MENU');
                    setRoomCode('');
                    setCurrentBattleExam(null);
                }} 
                className="bg-gray-800 text-white px-8 py-3 rounded-lg font-bold hover:bg-gray-900 transition"
             >
                Về Sảnh Chính
             </button>
         </div>

         {/* Review Section */}
         <div>
             <h3 className="font-bold text-xl text-gray-800 mb-4 flex items-center gap-2">
                 <span>🔍</span> Xem lại chi tiết
             </h3>
             <div className="space-y-4">
                 {currentBattleExam?.questions.map((q, idx) => {
                     const userAns = answers[q.id];
                     const isCorrect = userAns === q.correctAnswer;
                     const isSkipped = !userAns;

                     return (
                         <div key={idx} className={`p-4 border-l-4 rounded-lg bg-gray-50 ${isCorrect ? 'border-green-500' : 'border-red-500'}`}>
                             <div className="flex justify-between items-start mb-2">
                                 <span className="font-bold text-gray-800">Câu {idx + 1}:</span>
                                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                     {isCorrect ? 'Đúng' : isSkipped ? 'Bỏ qua' : 'Sai'}
                                 </span>
                             </div>
                             {q.image && (
                                <img src={q.image} alt="Illustration" className="max-w-full h-auto max-h-40 mb-3 border rounded" />
                             )}
                             <p className="text-gray-700 text-sm mb-3">{formatDisplayQuestionText(q.text, { stripLeadingCau: false })}</p>
                             <div className="grid grid-cols-1 gap-1 text-sm">
                                 {q.options.map((opt, i) => {
                                     const label = ['A', 'B', 'C', 'D'][i];
                                     const isSelected = userAns === label;
                                     const isTheCorrect = q.correctAnswer === label;
                                     
                                     let bgClass = 'bg-white border-gray-200';
                                     if (isTheCorrect) bgClass = 'bg-green-50 border-green-500 text-green-800 font-bold';
                                     else if (isSelected) bgClass = 'bg-red-50 border-red-500 text-red-800';

                                     return (
                                         <div key={i} className={`p-2 rounded border flex justify-between items-center ${bgClass}`}>
                                             <span>{label}. {opt}</span>
                                             {isTheCorrect && <span className="text-xs">✅</span>}
                                             {isSelected && !isTheCorrect && <span className="text-xs">❌</span>}
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>
                     );
                 })}
             </div>
         </div>
      </div>
    );
  }

  if (viewState === 'SETUP') {
    return (
      <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl shadow-lg">
        <div className="flex items-center gap-3 mb-6 border-b pb-4">
            <button onClick={() => setViewState('MENU')} className="text-gray-400 hover:text-gray-800 text-2xl">←</button>
            <h2 className="text-2xl font-bold text-gray-800">Thiết Lập Phòng Đấu</h2>
        </div>

        <div className="space-y-6">
            {/* Step 1: Môn */}
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">1. Chọn Khối Lớp</label>
                <div className="grid grid-cols-3 gap-3">
                    {['Sinh 10', 'Sinh 11', 'Sinh 12'].map(grade => (
                        <button
                            key={grade}
                            onClick={() => setSelectedGrade(grade as any)}
                            className={`py-3 rounded-lg border-2 font-bold transition ${
                                selectedGrade === grade 
                                ? 'border-bio-600 bg-bio-50 text-bio-700' 
                                : 'border-gray-200 text-gray-500 hover:border-bio-200'
                            }`}
                        >
                            {grade}
                        </button>
                    ))}
                </div>
            </div>

            {/* Step 2: Chủ đề */}
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">2. Chọn Chủ Đề Thách Đấu</label>
                <select 
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bio-500 outline-none bg-white"
                >
                    {BIO_TOPICS[selectedGrade].map((topic: string, idx: number) => (
                        <option key={idx} value={topic}>{topic}</option>
                    ))}
                </select>
            </div>

            {/* Step 3: Thời gian & Số lượng */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">3. Thời gian (Phút)</label>
                    <input 
                        type="number"
                        min="5" max="60"
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value) || 10)}
                        className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-bio-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">4. Số câu hỏi</label>
                    <input 
                        type="number"
                        min="5" max="50"
                        value={questionCount}
                        onChange={(e) => setQuestionCount(parseInt(e.target.value) || 10)}
                        className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-bio-500"
                    />
                </div>
            </div>

            <div className="pt-6 border-t">
                <button 
                    onClick={handleCreateRoom}
                    className="w-full bg-gradient-to-r from-red-500 to-orange-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transform transition hover:-translate-y-1 flex items-center justify-center gap-2"
                >
                    <span>⚔️</span> TẠO PHÒNG & TẠO ĐỀ AI
                </button>
                <p className="text-center text-xs text-gray-400 mt-3">
                    Hệ thống sẽ sử dụng AI để tạo đề thi duy nhất cho phòng này.
                </p>
            </div>
        </div>
      </div>
    );
  }

  // Fallback for JOIN view removed as it is now integrated into MENU dashboard
  return null;
};