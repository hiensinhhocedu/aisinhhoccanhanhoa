import React, { useState, useEffect } from 'react';
import { User, UserLevel } from '../types';
import { calculateLevel, fetchCloudLeaderboard } from '../services/dataService';

export const LeaderboardView: React.FC = () => {
  const [filter, setFilter] = useState<'DAY' | 'WEEK' | 'MONTH' | 'QUARTER'>('WEEK');
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadLeaderboard = async () => {
      setIsLoading(true);
      const data = await fetchCloudLeaderboard(filter);
      // Map cloud data to view model if necessary, assumes cloud returns array of { name, score, className, history }
      setUsers(Array.isArray(data) ? data : []);
      setIsLoading(false);
    };
    loadLeaderboard();
  }, [filter]);

  const getRankBadge = (idx: number) => {
    if (idx === 0) return '🥇';
    if (idx === 1) return '🥈';
    if (idx === 2) return '🥉';
    return idx + 1;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      <div className="p-6 bg-bio-700 text-white">
        <h2 className="text-2xl font-bold text-center mb-4">🏆 Bảng Phong Thần</h2>
        <div className="flex justify-center gap-2">
          {['DAY', 'WEEK', 'MONTH', 'QUARTER'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-1 rounded-full text-xs font-bold transition ${
                filter === f ? 'bg-white text-bio-700' : 'bg-bio-800 text-bio-200 hover:bg-bio-600'
              }`}
            >
              {f === 'DAY' ? 'Ngày' : f === 'WEEK' ? 'Tuần' : f === 'MONTH' ? 'Tháng' : 'Quý'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto min-h-[300px]">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Đang tải dữ liệu xếp hạng...</div>
        ) : users.length === 0 ? (
           <div className="text-center py-12 text-gray-400 italic">Chưa có dữ liệu xếp hạng cho thời gian này.</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-500">Hạng</th>
                <th className="px-6 py-4 font-semibold text-gray-500">Học Sinh</th>
                <th className="px-6 py-4 font-semibold text-gray-500">Cấp Độ</th>
                <th className="px-6 py-4 font-semibold text-gray-500 text-right">Tổng Điểm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u, idx) => {
                const level = calculateLevel(u.totalScore || u.score, u.examHistory || []);
                return (
                  <tr key={idx} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-bold text-lg text-gray-700 w-20 text-center">
                      {getRankBadge(idx)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-800">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.className || 'Học viên'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        level === UserLevel.LEVEL_4 ? 'bg-yellow-100 text-yellow-700' :
                        level === UserLevel.LEVEL_3 ? 'bg-blue-100 text-blue-700' :
                        level === UserLevel.LEVEL_2 ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {level}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-bio-600">
                      {u.totalScore || u.score} pts
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};