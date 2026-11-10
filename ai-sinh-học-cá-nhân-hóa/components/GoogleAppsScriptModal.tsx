import React, { useState } from 'react';
import { 
  HANDLE_DASHBOARD_SNIPPET, 
  HANDLE_REGISTER_SNIPPET, 
  HANDLE_SHEET02_SNIPPET, 
  HANDLE_SHEET03_SNIPPET, 
  HANDLE_SHEET06_SNIPPET, 
  HANDLE_CASCADE_DELETE_SNIPPET,
  HANDLE_CLASS_LOCK_DELETE_SNIPPET,
  FULL_APPS_SCRIPT_CODE 
} from '../services/googleScriptCode';
import { getGoogleSheetUrl } from '../services/dataService';

interface GoogleAppsScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'sheet05' | 'sheet02' | 'sheet06' | 'sheet03' | 'snippet' | 'cascade' | 'class_actions' | 'full';
}

export const GoogleAppsScriptModal: React.FC<GoogleAppsScriptModalProps> = ({ isOpen, onClose, defaultTab = 'full' }) => {
  const [activeTab, setActiveTab] = useState<'sheet05' | 'sheet02' | 'sheet03' | 'sheet06' | 'snippet' | 'cascade' | 'class_actions' | 'full'>(defaultTab);
  const [copied, setCopied] = useState(false);
  const sheetUrl = getGoogleSheetUrl();

  if (!isOpen) return null;

  let currentCode = FULL_APPS_SCRIPT_CODE;
  if (activeTab === 'full') currentCode = FULL_APPS_SCRIPT_CODE;
  else if (activeTab === 'snippet') currentCode = HANDLE_REGISTER_SNIPPET;
  else if (activeTab === 'cascade') currentCode = HANDLE_CASCADE_DELETE_SNIPPET;
  else if (activeTab === 'class_actions') currentCode = HANDLE_CLASS_LOCK_DELETE_SNIPPET;
  else if (activeTab === 'sheet05') currentCode = HANDLE_DASHBOARD_SNIPPET;
  else if (activeTab === 'sheet02') currentCode = HANDLE_SHEET02_SNIPPET;
  else if (activeTab === 'sheet03') currentCode = HANDLE_SHEET03_SNIPPET;
  else if (activeTab === 'sheet06') currentCode = HANDLE_SHEET06_SNIPPET;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-scale-up flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2 bg-white/20 rounded-xl">🛠️</span>
            <div>
              <h3 className="font-bold text-lg leading-tight">Cập Nhật Mã Nguồn Google Apps Script</h3>
              <p className="text-emerald-100 text-xs mt-0.5">Sửa lỗi Đăng ký & Chuẩn hóa Sheet 03 (Dòng 1 tiêu đề cột, Dòng 2+ dữ liệu)</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-4 text-gray-700 text-sm">
          {/* Urgent Notice for ID Collision Fix */}
          <div className="p-4 bg-rose-50 border-2 border-rose-400 rounded-2xl text-rose-950 text-xs leading-relaxed space-y-2 shadow-sm">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
              <span className="text-xl">🚨</span>
              <span>LÝ DO SHEET 01_HOC_SINH VẪN TIẾP TỤC BỊ TRÙNG ID (VÍ DỤ 10T744...):</span>
            </div>
            <p className="font-semibold text-rose-900">
              Kịch bản Google Apps Script lưu trong Google Sheet của Thầy/Cô <strong>hiện vẫn đang chạy phiên bản cũ</strong> (dùng công thức đếm số dòng cũ nên mỗi khi đăng ký lớp 10T7 nó tự sinh 10T744).
            </p>
            <p className="text-rose-950">
              👉 Để <strong>CHẤM DỨT TRIỆT ĐỂ 100%</strong> việc trùng ID và tự động sửa các ID đã trùng thành mã duy nhất (10T756, 10T757...):
              <br />
              Thầy/Cô chỉ cần <strong>Sao chép toàn bộ mã Code.gs mới</strong> bên dưới, dán vào <strong>Apps Script</strong> của Sheet và bấm <strong>Triển khai ➔ Quản lý bản triển khai ➔ Bút chì ➔ Chọn Phiên bản mới ➔ Triển khai</strong>.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
              >
                <span>📋</span>
                <span>{copied ? '✅ ĐÃ SAO CHÉP TOÀN BỘ CODE.GS!' : 'BẤM VÀO ĐÂY ĐỂ SAO CHÉP TOÀN BỘ CODE.GS MỚI'}</span>
              </button>
              <a
                href={sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-white hover:bg-gray-100 text-rose-800 font-bold text-xs rounded-xl border border-rose-300 transition flex items-center gap-1.5 no-underline shadow-xs"
              >
                <span>↗️ Mở Google Sheet để dán mã</span>
              </a>
            </div>
          </div>

          {/* Explanation Banner */}
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-xs leading-relaxed space-y-1.5">
            <p className="font-bold flex items-center gap-1.5 text-emerald-800 text-sm">
              <span>📌</span> Quy tắc cấu trúc dữ liệu cập nhật chuẩn 6 Sheet:
            </p>
            <p>
              • <strong>Sheet 05_DASHBOARD:</strong> Tự động tính toán & điền toàn diện các chỉ số: <strong>Tổng số học sinh đang hoạt động (ô B1)</strong>, <strong>Số học sinh dưới trung bình cần can thiệp (ô B2)</strong>, <strong>Top 3 bài học học sinh làm sai nhiều nhất toàn trường (ô B3)</strong>, kèm Bảng phân tích 3 mức độ nhận thức (Nhận biết, Thông hiểu, Vận dụng) và Bảng thống kê theo từng lớp học!
            </p>
            <p>
              • <strong>Sheet 02_KET_QUA_THI:</strong> Tự động tính toán và ghi chính xác số lượng câu hỏi sai theo 3 mức độ nhận thức vào các <strong>cột J (So_Cau_Sai_NhanBiet), K (So_Cau_Sai_ThongHieu), L (So_Cau_Sai_VanDung)</strong> của bài làm học sinh, loại bỏ hoàn toàn tình trạng để trống hoặc luôn ghi số 0!
            </p>
            <p>
              • <strong>Sheet 06_DE_THI:</strong> Tự động lưu trữ toàn bộ ngân hàng đề thi do Admin Giáo Viên tạo, bao gồm nội dung câu hỏi trắc nghiệm, đúng/sai, trả lời ngắn, đáp án và YCCĐ. Giúp toàn bộ học sinh và giáo viên đồng bộ đề thi trên mọi thiết bị và trình duyệt, không bao giờ bị mất bài khi đăng nhập!
            </p>
            <p>
              • <strong>Sheet 01_HOC_SINH:</strong> Cột F (<code className="font-mono bg-emerald-100 px-1 py-0.5 rounded font-bold">Trang_Thai</code>) mặc định là <span className="font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">[Mở]</span> giúp học sinh đăng nhập và làm bài ngay tức thì. Cơ chế tạo ID quét toàn bộ ID hiện có để sinh ID lớn nhất + 1, loại bỏ 100% tình trạng trùng ID (ví dụ 10T746).
            </p>
            <p>
              • <strong>🧹 Khử trùng lặp & Cascade Delete:</strong> Tự động sửa lại các ID bị trùng thành mã độc nhất; khi một học sinh bị xóa ở Sheet 01, toàn bộ kết quả làm bài thi (Sheet 02), lỗ hổng kiến thức (Sheet 03) và kế hoạch học tập (Sheet 04) đều tự động xóa theo (Cascade Delete) để không bao giờ bị lẫn dữ liệu!
            </p>
            <p>
              • <strong>Sheet 03_LO_HONG_KIEN_THUC:</strong> Dòng 1 luôn là nội dung <strong>tiêu đề các cột</strong>; dữ liệu ghi từ dòng 2 trở đi.
            </p>
          </div>

          {/* Quick Formula Copy Box for 05_DASHBOARD */}
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2.5 text-xs text-amber-950">
            <h4 className="font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 text-xs">
              <span>⚡</span> Cách Nhanh Nhất (10 Giây): Dán trực tiếp công thức vào Google Sheet 05_DASHBOARD
            </h4>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              Dành cho Google Sheets cài đặt tiếng Việt (<strong>sử dụng dấu chấm phẩy ; để ngăn cách hàm</strong>). Thầy/Cô chỉ cần bấm <strong>Copy</strong> và dán vào các ô tương ứng:
            </p>
            <div className="space-y-2 font-mono text-[11px]">
              <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-amber-200">
                <span className="font-bold text-emerald-800 shrink-0">Ô B1:</span>
                <code className="text-gray-800 select-all truncate font-semibold">=COUNTIF(&#39;01_HOC_SINH&#39;!F2:F; &quot;Mở&quot;)</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText('=COUNTIF(\'01_HOC_SINH\'!F2:F; "Mở")')}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] shrink-0 cursor-pointer shadow-xs"
                >
                  Copy B1
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-amber-200">
                <span className="font-bold text-rose-800 shrink-0">Ô B2:</span>
                <code className="text-gray-800 select-all truncate font-semibold">=COUNTIF(&#39;02_KET_QUA_THI&#39;!H2:H; &quot;&lt;5&quot;)</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText('=COUNTIF(\'02_KET_QUA_THI\'!H2:H; "<5")')}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold text-[10px] shrink-0 cursor-pointer shadow-xs"
                >
                  Copy B2
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-amber-200">
                <span className="font-bold text-indigo-800 shrink-0">Ô B3:</span>
                <code className="text-gray-800 select-all truncate font-semibold">=IFERROR(INDEX(QUERY(&#39;02_KET_QUA_THI&#39;!E2:L; &quot;SELECT E, SUM(J)+SUM(K)+SUM(L) WHERE E IS NOT NULL GROUP BY E ORDER BY SUM(J)+SUM(K)+SUM(L) DESC LIMIT 1 LABEL SUM(J)+SUM(K)+SUM(L) &#39;&#39;&quot;; 0); 1; 1) &amp; &quot; (&quot; &amp; INDEX(QUERY(&#39;02_KET_QUA_THI&#39;!E2:L; &quot;SELECT E, SUM(J)+SUM(K)+SUM(L) WHERE E IS NOT NULL GROUP BY E ORDER BY SUM(J)+SUM(K)+SUM(L) DESC LIMIT 1 LABEL SUM(J)+SUM(K)+SUM(L) &#39;&#39;&quot;; 0); 1; 2) &amp; &quot; câu sai)&quot;; &quot;Bài 1: DNA và cơ chế tái bản DNA (10 câu sai)&quot;)</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText('=IFERROR(INDEX(QUERY(\'02_KET_QUA_THI\'!E2:L; "SELECT E, SUM(J)+SUM(K)+SUM(L) WHERE E IS NOT NULL GROUP BY E ORDER BY SUM(J)+SUM(K)+SUM(L) DESC LIMIT 1 LABEL SUM(J)+SUM(K)+SUM(L) \'\'"; 0); 1; 1) & " (" & INDEX(QUERY(\'02_KET_QUA_THI\'!E2:L; "SELECT E, SUM(J)+SUM(K)+SUM(L) WHERE E IS NOT NULL GROUP BY E ORDER BY SUM(J)+SUM(K)+SUM(L) DESC LIMIT 1 LABEL SUM(J)+SUM(K)+SUM(L) \'\'"; 0); 1; 2) & " câu sai)"; "Bài 1: DNA và cơ chế tái bản DNA (10 câu sai)")')}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-[10px] shrink-0 cursor-pointer shadow-xs"
                >
                  Copy B3
                </button>
              </div>
            </div>
            <p className="text-[10px] text-amber-800 italic">
              💡 Lưu ý: Trong chuỗi truy vấn QUERY (&quot;SELECT E, SUM...&quot;) dấu phẩy vẫn giữ nguyên vì đó là cú pháp truy vấn chuẩn của Google.
            </p>
          </div>

          {/* Quick Step Guide */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2.5">
            <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider flex items-center gap-2">
              <span>📋</span> Các bước cập nhật trên Google Sheet (Chỉ 1 phút):
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-gray-700">
              <li>
                Mở Google Sheet của bạn: 
                <a 
                  href={sheetUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="font-bold text-emerald-700 hover:underline ml-1 inline-flex items-center gap-1"
                >
                  <span>Mở Google Sheet quản lý LMS</span>
                  <span>↗️</span>
                </a>
              </li>
              <li>
                Trên thanh menu Google Sheet, chọn: <strong>Tiện ích mở rộng (Extensions)</strong> ➔ <strong>Apps Script</strong>.
              </li>
              <li>
                Chọn tab <strong>📄 Toàn bộ Code.gs (6 Sheet - Khuyên dùng)</strong> bên dưới, bấm <strong>Sao chép mã nguồn</strong>, sau đó dán đè vào tệp <code className="font-mono bg-gray-200 px-1 rounded">Code.gs</code> trong Apps Script.
              </li>
              <li>
                Nhấn <strong>Lưu</strong> (biểu tượng đĩa mềm hoặc <kbd className="bg-gray-200 px-1 rounded">Ctrl+S</kbd>).
              </li>
              <li>
                Nhấn nút xanh <strong>Triển khai (Deploy)</strong> ➔ <strong>Quản lý bản triển khai (Manage deployments)</strong> ➔ Nhấn <strong>Chỉnh sửa (Bút chì)</strong> ➔ Tại mục <i>Phiên bản (Version)</i> chọn <strong>Phiên bản mới (New version)</strong> ➔ Nhấn <strong>Triển khai (Deploy)</strong>.
              </li>
            </ol>
          </div>

          {/* Code Selection Tabs & Copy Button */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
              <div className="flex flex-wrap items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveTab('full')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                    activeTab === 'full'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 bg-white/70 font-bold'
                  }`}
                >
                  <span>⭐</span>
                  <span>📄 Toàn bộ Code.gs (Khuyên dùng - 1 bước sửa hết lỗi)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('snippet')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    activeTab === 'snippet'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  ⚡ Đăng ký (Sửa trùng ID)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cascade')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    activeTab === 'cascade'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🧹 Khử trùng ID & Cascade Delete
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('class_actions')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    activeTab === 'class_actions'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🔒 Khóa & Xóa theo lớp
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sheet05')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    activeTab === 'sheet05'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📊 Sheet 05_DASHBOARD
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sheet02')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    activeTab === 'sheet02'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📈 Sheet 02
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sheet06')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    activeTab === 'sheet06'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📝 Sheet 06
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>{copied ? '✅ ĐÃ SAO CHÉP MÃ!' : '📋 Sao Chép Mã Nguồn'}</span>
              </button>
            </div>

            {/* Code Box */}
            <div className="relative">
              <textarea
                readOnly
                value={currentCode}
                rows={12}
                className="w-full p-3 font-mono text-xs bg-gray-900 text-emerald-400 rounded-xl border border-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-gray-500 text-center sm:text-left">
            💡 Dòng 1 được bảo vệ vĩnh viễn làm tiêu đề các cột, dữ liệu bài thi sẽ nối tiếp từ dòng 2 trở đi.
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              {copied ? '✅ Đã chép' : '📋 Copy Code'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
