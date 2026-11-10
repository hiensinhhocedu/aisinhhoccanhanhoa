import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { Layout } from './components/Layout';
import { HomeView } from './views/HomeView';
import { TestView } from './views/TestView';
import { BattleView } from './views/BattleView';
import { LeaderboardView } from './views/LeaderboardView';
import { ProfileView } from './views/ProfileView';
import { PersonalizedView } from './views/PersonalizedView';
import { AuthView } from './views/AuthView'; 
import { ClassroomsView } from './views/ClassroomsView'; 
import { ReportView } from './views/ReportView'; 
import { 
  getStoredUserByPhone, 
  saveStoredUser, 
  mergeExamHistories, 
  fetchGoogleSheetExamResults,
  getStudentGrade,
  getExamGrade,
  filterExamHistoryByStudentGrade
} from './services/dataService';

const createDefaultGuestUser = (): User => ({
  phone: 'guest',
  name: 'Học sinh',
  className: 'Lớp 12',
  role: UserRole.STUDENT,
  totalScore: 0,
  examHistory: [],
  isGuest: true
});

const isUserTeacherOrAdmin = (u: any): boolean => {
  if (!u) return false;
  const phone = (u.phone || '').toString().trim().replace(/^0+/, '');
  const isAdminPhone = phone === '966000224' || u.phone === '0966000224' || phone === '912345678' || u.phone === '0912345678';
  return isAdminPhone && u.role === UserRole.ADMIN;
};

const getInitialUser = (): User => {
  try {
    const session = localStorage.getItem('current_user_phone');
    if (session) {
      if (/lâm\s*thái\s*hiển/i.test(session)) {
        localStorage.removeItem('current_user_phone');
        return createDefaultGuestUser();
      }
      const stored = getStoredUserByPhone(session);
      if (stored) {
        if (stored.name && /lâm\s*thái\s*hiển/i.test(stored.name)) {
          stored.name = 'Admin Giáo Viên';
          saveStoredUser(stored);
        }
        const cleanPhone = (stored.phone || '').toString().trim().replace(/^0+/, '');
        if (cleanPhone === '966000224' || stored.phone === '0966000224') {
          stored.role = UserRole.ADMIN;
          if (!stored.name || /lâm\s*thái\s*hiển/i.test(stored.name)) {
            stored.name = 'Admin Giáo Viên';
          }
        } else if (cleanPhone === '912345678' || stored.phone === '0912345678') {
          stored.role = UserRole.ADMIN;
          if (!stored.name) {
            stored.name = 'Admin Giáo Viên 2';
          }
        } else {
          stored.role = UserRole.STUDENT; // Còn lại là tài khoản học sinh
          if (Array.isArray(stored.examHistory)) {
            stored.examHistory = filterExamHistoryByStudentGrade(stored, stored.examHistory);
          }
        }
        return stored;
      }
    }
  } catch (err) {
    console.error('Error loading session:', err);
  }
  return createDefaultGuestUser();
};

const App: React.FC = () => {
  // Always initialize directly with a valid user so the app enters the main interface immediately!
  const [user, setUser] = useState<User>(getInitialUser);
  const [activeTab, setActiveTab] = useState('home');
  const [showAuthModal, setShowAuthModal] = useState(false);
  // State to hold the navigation blocking function
  const [navigationBlocker, setNavigationBlocker] = useState<(() => boolean) | null>(null);
  const [selectedStudentForPersonalized, setSelectedStudentForPersonalized] = useState<User | null>(null);

  // Đồng bộ ngầm các bài thi từ Google Sheet 02_KET_QUA_THI vào tài khoản học sinh
  useEffect(() => {
    if (user.isGuest || user.phone === 'guest' || user.role === UserRole.ADMIN) return;

    let isMounted = true;
    fetchGoogleSheetExamResults().then(sheetResults => {
      if (!isMounted || !Array.isArray(sheetResults) || sheetResults.length === 0) return;
      const studentGrade = getStudentGrade(user);
      const cleanPhoneNoZero = (user.phone || '').replace(/\D/g, '').replace(/^0+/, '');
      const normName = (user.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const normId = String(user.studentId || '').trim().toUpperCase();

      const matchingSheetHistory = sheetResults.filter(sr => {
        // Chỉ lưu và đồng bộ các bài thi thuộc đúng khối lớp của tài khoản học sinh
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

      if (matchingSheetHistory.length > 0) {
        setUser(current => {
          const merged = filterExamHistoryByStudentGrade(
            current,
            mergeExamHistories(current.examHistory || [], matchingSheetHistory, current)
          );
          if (merged.length !== (current.examHistory || []).length) {
            const updatedUser: User = {
              ...current,
              examHistory: merged,
              totalScore: Math.max(current.totalScore || 0, merged.reduce((s, h) => s + (h.score || 0), 0))
            };
            saveStoredUser(updatedUser);
            return updatedUser;
          }
          return current;
        });
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [user.phone, user.studentId, user.role, user.isGuest, user.className]);

  const handleLogin = (u: User) => {
    const cleanPhone = (u.phone || '').toString().trim().replace(/^0+/, '');
    const isOnlyAdmin = cleanPhone === '966000224' || u.phone === '0966000224' || cleanPhone === '912345678' || u.phone === '0912345678';
    const stored = getStoredUserByPhone(u.phone);
    const mergedHistory = filterExamHistoryByStudentGrade(
      u,
      mergeExamHistories(stored?.examHistory || [], u.examHistory || [], u)
    );
    const finalUser: User = {
      ...u,
      examHistory: mergedHistory,
      totalScore: Math.max(u.totalScore || 0, stored?.totalScore || 0, mergedHistory.reduce((s, h) => s + (h.score || 0), 0)),
      role: isOnlyAdmin ? UserRole.ADMIN : UserRole.STUDENT
    };
    saveStoredUser(finalUser);
    setUser(finalUser);
    setShowAuthModal(false);
    setNavigationBlocker(null);
  };

  const checkNavigation = (): boolean => {
    if (navigationBlocker) {
      return navigationBlocker();
    }
    return true;
  };

  const handleLogout = () => {
    if (!checkNavigation()) return;
    localStorage.removeItem('current_user_phone');
    setUser(createDefaultGuestUser());
    setNavigationBlocker(null);
  };

  const handleTabChange = (tab: string) => {
    if (activeTab === tab) return;
    if (!checkNavigation()) return;
    
    setActiveTab(tab);
    setNavigationBlocker(null);
  };

  const handleViewStudentPersonalized = (student: any) => {
    const studentUser: User = {
      phone: student.phone,
      name: student.name,
      className: student.className,
      studentId: student.id,
      role: UserRole.STUDENT,
      totalScore: student.totalScore || 0,
      examHistory: student.examHistory || [],
      isGuest: false
    };
    setSelectedStudentForPersonalized(studentUser);
    setActiveTab('personalized');
  };

  const handleUpdateUser = (updated: User) => {
    saveStoredUser(updated);
    setUser(updated);
  };

  return (
    <>
      <Layout 
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
        user={user} 
        onLogout={handleLogout}
        onOpenLogin={() => setShowAuthModal(true)}
      >
        {activeTab === 'home' && (
          <HomeView 
            user={user} 
            onNavigate={handleTabChange} 
            onOpenLogin={() => setShowAuthModal(true)} 
          />
        )}
        {activeTab === 'classrooms' && (
          <ClassroomsView 
            user={user} 
            onNavigateToTest={() => handleTabChange('test')} 
            onViewStudentPersonalized={handleViewStudentPersonalized}
          />
        )}
        {activeTab === 'test' && (
          <TestView 
            user={user} 
            onUpdateUser={handleUpdateUser} 
            setNavigationBlocker={setNavigationBlocker} 
            onOpenLogin={() => setShowAuthModal(true)}
          />
        )}
        {activeTab === 'personalized' && (
          <PersonalizedView 
            user={user} 
            targetStudentUser={selectedStudentForPersonalized}
            onClearTargetStudent={() => {
              setSelectedStudentForPersonalized(null);
              handleTabChange('classrooms');
            }}
            onUpdateUser={handleUpdateUser} 
            onNavigateToTest={() => handleTabChange('test')}
            onOpenLogin={() => setShowAuthModal(true)} 
          />
        )}
        {activeTab === 'report' && (
          <ReportView 
            user={user} 
            onNavigateToPersonalized={handleViewStudentPersonalized}
            onNavigateToTest={() => handleTabChange('test')}
          />
        )}
        {activeTab === 'battle' && (
          <BattleView 
            user={user} 
            onUpdateUser={handleUpdateUser} 
          />
        )}
        {activeTab === 'leaderboard' && <LeaderboardView />}
        {activeTab === 'profile' && (
          <ProfileView 
            user={user} 
            onOpenLogin={() => setShowAuthModal(true)} 
            onNavigateToTest={() => handleTabChange('test')}
            onNavigateToPersonalized={() => handleTabChange('personalized')}
          />
        )}
      </Layout>

      {/* Login modal, only shown if user explicitly clicks "Đăng nhập" */}
      {showAuthModal && (
        <AuthView 
          onLoginSuccess={handleLogin} 
          onClose={() => setShowAuthModal(false)}
          isModal={true}
        />
      )}
    </>
  );
};

export default App;
