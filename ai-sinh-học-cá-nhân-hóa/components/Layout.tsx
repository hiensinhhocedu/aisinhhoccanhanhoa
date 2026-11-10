import React from 'react';
import { User, UserRole, UserLevel } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  user: User;
  onLogout: () => void;
  onOpenLogin?: () => void;
}

const LEVEL_COLORS: Record<UserLevel, string> = {
  [UserLevel.LEVEL_1]: 'bg-gray-500',
  [UserLevel.LEVEL_2]: 'bg-green-500',
  [UserLevel.LEVEL_3]: 'bg-blue-600',
  [UserLevel.LEVEL_4]: 'bg-yellow-500',
};

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange, 
  user, 
  onLogout,
  onOpenLogin
}) => {
  const isAdmin = user.role === UserRole.ADMIN;
  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem('sidebar_collapsed', String(next));
    } catch (e) {
      console.error(e);
    }
  };
  
  const navItems = isAdmin ? [
    { id: 'home', label: 'Trang Chủ', shortLabel: 'Trang Chủ', icon: '🏠' },
    { id: 'classrooms', label: 'Lớp Học', shortLabel: 'Lớp Học', icon: '🏫' },
    { id: 'test', label: 'Quản Lí KT, Đánh Giá', shortLabel: 'Đề Thi', icon: '📝' },
    { id: 'personalized', label: 'Tiến Trình Học Tập', shortLabel: 'Tiến Trình', icon: '🎯' },
    { id: 'report', label: 'Báo Cáo', shortLabel: 'Báo Cáo', icon: '📊' },
    { id: 'profile', label: 'Hệ Thống', shortLabel: 'Hệ Thống', icon: '⚙️' },
  ] : [
    { id: 'home', label: 'Trang Chủ', shortLabel: 'Trang Chủ', icon: '🏠' },
    { id: 'test', label: 'Kiểm Tra, Đánh Giá', shortLabel: 'Kiểm Tra', icon: '📝' },
    { id: 'personalized', label: 'Tiến Trình Học Tập', shortLabel: 'Tiến Trình', icon: '🎯' },
    { id: 'profile', label: 'Lịch Sử', shortLabel: 'Lịch Sử', icon: '📜' },
  ];

  const currentLevel = (Object.values(UserLevel) as UserLevel[]).find(l => l === calculateLevelBadge(user)) || UserLevel.LEVEL_1;

  function calculateLevelBadge(u: User): UserLevel {
     // Simplified logic for UI badge display, real logic in dataService
     if (u.totalScore > 260) return UserLevel.LEVEL_4;
     if (u.totalScore > 156) return UserLevel.LEVEL_3;
     if (u.totalScore > 65) return UserLevel.LEVEL_2;
     return UserLevel.LEVEL_1;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-bio-700 text-white shadow-lg sticky top-0 z-50 relative pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-2.5 sm:px-4 py-2 sm:py-3 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 mr-2">
            <span className="text-lg sm:text-2xl shrink-0">🧬</span>
            <h1 
              className="text-xs xs:text-sm sm:text-lg md:text-xl font-bold tracking-tight truncate whitespace-nowrap"
              title="AI Sinh Học Cá Nhân Hóa"
            >
              AI Sinh Học Cá Nhân Hóa
            </h1>
            {isAdmin && <span className="bg-red-500 text-[9px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded font-black shrink-0 ml-0.5">ADMIN</span>}
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
            {user.isGuest ? (
              <div className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold text-amber-900 bg-amber-200 border border-amber-300 flex items-center gap-1 shadow-sm shrink-0">
                <span>👤</span> <span className="hidden xs:inline">Khách</span>
              </div>
            ) : !isAdmin ? (
              <div className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold text-white flex items-center gap-1 shadow-sm shrink-0 ${LEVEL_COLORS[currentLevel]}`}>
                <span>🎖️</span> <span>{currentLevel}</span>
              </div>
            ) : null}
            <div className="text-xs sm:text-sm text-bio-100 hidden md:block truncate max-w-[140px]">
              Xin chào, <b>{user.name}</b>
            </div>
            {user.isGuest ? (
              <button 
                onClick={onOpenLogin || onLogout}
                className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white text-[11px] sm:text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition flex items-center gap-1 shadow-sm cursor-pointer whitespace-nowrap"
                title="Đăng nhập tài khoản"
              >
                <span>🔑</span>
                <span>Đăng nhập</span>
              </button>
            ) : (
              <button 
                onClick={onLogout}
                className="bg-bio-800 hover:bg-bio-900 active:scale-95 text-white text-[11px] sm:text-xs font-semibold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap"
              >
                Đăng xuất
              </button>
            )}
          </div>
        </div>

        {/* Center Timer Portal Target - Absolute positioning to stay in center regardless of side content */}
        <div 
            id="header-timer-portal" 
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
        >
            {/* Timer will be injected here via React Portal */}
        </div>
      </header>

      {/* Mobile Nav Sticky Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-bio-700/95 backdrop-blur-md border-t border-bio-600/80 flex justify-around px-0.5 py-1 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] md:hidden z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.15)]">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-xl w-full min-h-[44px] transition-all duration-200 cursor-pointer select-none active:scale-95 ${
                activeTab === item.id 
                ? 'bg-bio-900 text-white shadow-inner font-bold' 
                : 'text-bio-100 hover:bg-bio-600 hover:text-white font-medium'
            }`}
          >
            <span className="text-base sm:text-lg mb-0.5 leading-none">{item.icon}</span>
            <span className="text-[10px] sm:text-[11px] leading-tight text-center whitespace-nowrap tracking-tight">{item.shortLabel || item.label}</span>
          </button>
        ))}
      </div>

      {/* Desktop Nav Sidebar & Content */}
      <div className="flex-1 flex max-w-7xl 2xl:max-w-[1600px] mx-auto w-full">
        {/* Sidebar */}
        <aside className={`hidden md:flex flex-col ${isCollapsed ? 'w-20' : 'w-56 lg:w-64'} bg-white border-r border-gray-200 py-4 px-2.5 transition-all duration-300 ease-in-out shrink-0`}>
          {/* Collapse Header with Arrow button */}
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} pb-3 mb-2 border-b border-gray-100 px-1.5`}>
            {!isCollapsed && (
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Menu
              </span>
            )}
            <button
              type="button"
              onClick={toggleSidebar}
              title={isCollapsed ? "Mở rộng thanh bên (>)" : "Thu gọn thanh bên (<)"}
              className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600 hover:text-gray-900 flex items-center justify-center font-black text-sm transition-all cursor-pointer shadow-xs active:scale-95"
            >
              {isCollapsed ? '>' : '<'}
            </button>
          </div>

          <nav className="space-y-1.5 flex-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={item.label}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'px-4 py-3'} text-sm font-medium rounded-xl transition-all cursor-pointer ${
                  activeTab === item.id 
                    ? isCollapsed 
                      ? 'bg-red-50 text-red-700 font-bold shadow-xs border-2 border-red-500' 
                      : 'bg-red-50 text-red-700 border-l-4 border-red-600 font-bold shadow-xs' 
                    : 'text-gray-600 hover:bg-red-50 hover:text-red-600'
                }`}
              >
                <span className={`text-xl shrink-0 ${isCollapsed ? '' : 'mr-3'}`}>{item.icon}</span>
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-3 sm:p-5 md:p-6 lg:p-8 pb-28 md:pb-8 overflow-y-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
};