
import { GoogleGenAI } from "@google/genai";
import { Question } from "../types";

/**
 * Hàm chuẩn hóa và làm sạch văn bản câu hỏi thi Sinh học:
 * - Loại bỏ hoàn toàn các nhãn mức độ nhận thức thô: [Nhận biết], [Thông hiểu], [Vận dụng], (Nhận biết)...
 * - Loại bỏ các câu dẫn siêu dữ liệu hành chính: "Theo chương trình Lớp...", "Theo bài học...", "Trong bài..."
 * - Chuyển hóa các câu trích dẫn máy móc nguyên văn YCCĐ trong ngoặc kép thành câu hỏi sư phạm tự nhiên, chính xác.
 */
export const formatDisplayQuestionText = (text: string, options?: { stripLeadingCau?: boolean }): string => {
  if (!text) return '';
  let str = text.trim();

  // Trích xuất "Câu X." ở đầu nếu có
  let prefix = '';
  const cauMatch = str.match(/^(Câu\s+\d+[\.\:]?\s*)/i);
  if (cauMatch) {
    if (!options?.stripLeadingCau) {
      prefix = cauMatch[1];
    }
    str = str.slice(cauMatch[1].length).trim();
  }

  // 1. Loại bỏ các thẻ mức độ nhận thức trong ngoặc vuông hoặc tròn
  str = str.replace(/\[\s*(?:Nhận biết|Thông hiểu|Vận dụng(?:\s+thực tế|\s+cao|\s+thấp)?|Mức độ[^\]]+)\s*\]\s*/gi, '');
  str = str.replace(/\(\s*(?:Nhận biết|Thông hiểu|Vận dụng(?:\s+thực tế|\s+cao|\s+thấp)?|Mức độ[^\)]+)\s*\)\s*/gi, '');

  // 2. Loại bỏ các câu dẫn siêu dữ liệu hành chính và chỉ dẫn chương trình/bài học
  str = str.replace(/Theo chương trình\s+(?:GDPT(?:\s*2018)?|mới|Lớp\s*\d+|Sinh\s*\d+|THPT)?\s*(?:\([^\)]*\))?\,?\s*/gi, '');
  str = str.replace(/\(?Bài\s*\d+[\:\.\-][^\)\,\n\r]+\)?[\,\:\;\s]*/gi, '');
  str = str.replace(/\((?:Lớp|Sinh)\s*\d+[^\)]*\)[\,\:\;\s]*/gi, '');
  str = str.replace(/Theo SGK\s*(?:Kết nối tri thức|Chân trời|Cánh diều)?[^\,\:\;]*[\,\:\;]?\s*/gi, '');
  str = str.replace(/Theo bài học\s*(?:về|số|\d+|['"][^'"]*['"]|\([^\)]*\))?\,?\s*/gi, '');
  str = str.replace(/Trong bài học\s*(?:về|số|\d+|['"][^'"]*['"]|\([^\)]*\))?\,?\s*/gi, '');
  str = str.replace(/Trong chương trình\s*(?:Lớp\s*\d+|Sinh\s*\d+|THPT)?\,?\s*/gi, '');
  str = str.replace(/Phân tích cơ chế sinh học trong bài\s*['"][^'"]*['"]\,?\s*/gi, '');
  str = str.replace(/Trong bài\s*['"][^'"]*['"]\,?\s*/gi, '');
  str = str.replace(/Vận dụng kiến thức bài học\s*['"][^'"]*['"]\,?\s*/gi, '');
  str = str.replace(/Dựa vào kiến thức bài học\s*['"][^'"]*['"]\,?\s*/gi, '');
  str = str.replace(/Cho các nhận định về kiến thức bài học\s*['"]?([^'"\.\,]+)['"]?\./gi, 'Cho các nhận định về $1.');

  // 3. Chuyển hóa các câu trích dẫn máy móc YCCĐ trong ngoặc kép
  const quoteMatch1 = str.match(/(?:phát biểu|nhận định|mệnh đề|câu)\s+nào\s+sau\s+đây\s+(?:là\s+)?(?:ĐÚNG|đúng|chính xác|phù hợp)(?:\s+nhất)?(?:\s+(?:khi nói|khi tìm hiểu))?\s*(?:về|\:)\s*["'“]([^"'“”]+)["'”]\??/i);
  if (quoteMatch1 && quoteMatch1[1]) {
    let cleanTopic = quoteMatch1[1]
      .replace(/^(?:Dựa vào|Nêu được|Nêu|Trình bày được|Trình bày|Giải thích được|Giải thích|Vận dụng được|Vận dụng|Phân tích được|Phân tích|Kể tên được|Kể tên|Mô tả được|Mô tả|Nhận biết được|Nhận biết|So sánh được|So sánh)\s+/i, '')
      .replace(/[\.\,\;\:\?]+$/, '')
      .trim();
    cleanTopic = cleanTopic.replace(/[\,\;]\s*(?:trình bày|nêu|giải thích|phân tích|mô tả)\s*(?:được)?\s*/gi, ' và ');
    cleanTopic = cleanTopic.replace(/\s+được\s+/gi, ' ');
    cleanTopic = cleanTopic.replace(/\s+của phân tử DNA và chức năng của DNA/i, ' và chức năng của phân tử DNA');
    str = `Phát biểu nào sau đây là đúng khi nói về ${cleanTopic}?`;
  }

  const quoteMatch2 = str.match(/nhận định nào sau đây phản ánh chính xác nhất về\s*["'“]([^"'“”]+)["'”]\??/i);
  if (quoteMatch2 && quoteMatch2[1]) {
    let cleanTopic = quoteMatch2[1]
      .replace(/^(?:Dựa vào|Nêu được|Nêu|Trình bày được|Trình bày|Giải thích được|Giải thích|Vận dụng được|Vận dụng|Phân tích được|Phân tích|Kể tên được|Kể tên|Mô tả được|Mô tả)\s+/i, '')
      .replace(/[\.\,\;\:\?]+$/, '')
      .trim();
    str = `Nhận định nào sau đây là chính xác về ${cleanTopic}?`;
  }

  const quoteMatch3 = str.match(/ứng dụng nào sau đây thể hiện việc vận dụng đúng đắn kiến thức về\s*["'“]([^"'“”]+)["'”]\??/i);
  if (quoteMatch3 && quoteMatch3[1]) {
    let cleanTopic = quoteMatch3[1]
      .replace(/^(?:Dựa vào|Nêu được|Nêu|Trình bày được|Trình bày|Giải thích được|Giải thích|Vận dụng được|Vận dụng|Phân tích được|Phân tích|Kể tên được|Kể tên|Mô tả được|Mô tả)\s+/i, '')
      .replace(/[\.\,\;\:\?]+$/, '')
      .trim();
    str = `Ứng dụng thực tiễn nào sau đây thể hiện đúng kiến thức về ${cleanTopic}?`;
  }

  // 4. Làm sạch dấu câu thừa, ngoặc kép dư thừa ở đầu và cuối
  str = str.replace(/^["'“\s]+/, '').replace(/["'”\s]+$/, '');
  str = str.replace(/^[\,\:\;\-\–\—\s]+/, '').trim();
  if (str.length > 0) {
    str = str.charAt(0).toUpperCase() + str.slice(1);
  }

  return prefix ? `${prefix}${str}` : str;
};

export interface GenerateQuestionOptions {
  grade?: string; // 'Lớp 10' | 'Lớp 11' | 'Lớp 12'
  topic?: string; // Chủ đề
  lessonName?: string; // Tên Bài Học
  learningObjectives?: string; // Yêu Cầu Cần Đạt (YCCĐ)
  count?: number;
  tracNghiemCount?: number;
  dungSaiCount?: number;
  traLoiNganCount?: number;
  nhanBietCount?: number;
  thongHieuCount?: number;
  vanDungCount?: number;
}

export interface CognitiveLevelConfig {
  hasNhanBiet: boolean;
  hasThongHieu: boolean;
  hasVanDung: boolean;
  nhanBietCount: number;
  thongHieuCount: number;
  vanDungCount: number;
  mcqCount: number;          // Phần 1: Số câu trắc nghiệm khách quan 4 lựa chọn
  tfQuestionsCount: number;  // Phần 2: Số câu lớn trắc nghiệm Đúng/Sai
  tfItemsCount: number;      // Phần 2: Tổng số ý lệnh hỏi a, b, c, d (mỗi câu lớn x 4 ý)
  saCount: number;           // Phần 3: Số câu hỏi trả lời ngắn (chỉ bắt buộc ở Khối 12)
  isLop12: boolean;          // Đánh dấu khối Lớp 12 (3 phần) so với Lớp 10/11 (2 phần)
  totalCount: number;        // Tổng số mục câu hỏi chấm điểm
  tfCount: number;           // Tương thích: số câu Đúng/Sai lớn
}

// Phân tích văn bản YCCĐ để xác định phân bổ câu hỏi chuẩn theo GDPT 2018:
// - Khối Lớp 10 & 11: Bắt buộc gồm ĐÚNG 2 PHẦN (Phần 1: Trắc nghiệm khách quan + Phần 2: Đúng/Sai)
// - Khối Lớp 12: Bắt buộc gồm ĐẦY ĐỦ 3 PHẦN (Phần 1: Trắc nghiệm khách quan + Phần 2: Đúng/Sai + Phần 3: Trả lời ngắn)
export const analyzeLearningObjectives = (text: string, requestedTotal?: number, grade?: string): CognitiveLevelConfig => {
  const clean = text || '';
  const hasNB = /nhận\s*biết/i.test(clean);
  const hasTH = /thông\s*hiểu/i.test(clean);
  const hasVD = /vận\s*dụng/i.test(clean);

  const isLop12 = grade === 'Lớp 12' || grade === 'Sinh 12' || /lớp\s*12|sinh\s*12/i.test(clean);

  const targetTotal = requestedTotal && requestedTotal >= 6 ? requestedTotal : (isLop12 ? 12 : 10);
  let tfQuestionsCount = 1;
  let tfItemsCount = tfQuestionsCount * 4; // 4 ý lệnh hỏi a, b, c, d
  
  // Phần 3 (Trả lời ngắn): Chỉ áp dụng cho Lớp 12, KHÔNG áp dụng cho Lớp 10, 11
  const saCount = isLop12 ? 2 : 0;
  let mcqCount = Math.max(2, targetTotal - tfItemsCount - saCount);

  if (targetTotal >= 16) {
    tfQuestionsCount = 2;
    tfItemsCount = 8;
    mcqCount = targetTotal - tfItemsCount - saCount;
  }

  // Phân bổ câu hỏi Phần 1 (MCQ) theo các mức độ nhận thức của YCCĐ
  let nhanBietCount = Math.max(1, Math.round(mcqCount * 0.5));
  let thongHieuCount = Math.max(1, Math.round(mcqCount * 0.3));
  let vanDungCount = Math.max(1, mcqCount - nhanBietCount - thongHieuCount);

  if (hasNB && !hasTH && !hasVD) {
    nhanBietCount = mcqCount;
    thongHieuCount = 0;
    vanDungCount = 0;
  } else if (!hasNB && hasTH && !hasVD) {
    nhanBietCount = 0;
    thongHieuCount = mcqCount;
    vanDungCount = 0;
  } else if (!hasNB && !hasTH && hasVD) {
    nhanBietCount = 0;
    thongHieuCount = 0;
    vanDungCount = mcqCount;
  }

  return {
    hasNhanBiet: hasNB || (!hasNB && !hasTH && !hasVD),
    hasThongHieu: hasTH || (!hasNB && !hasTH && !hasVD),
    hasVanDung: hasVD || (!hasNB && !hasTH && !hasVD),
    nhanBietCount,
    thongHieuCount,
    vanDungCount,
    mcqCount,
    tfQuestionsCount,
    tfItemsCount,
    saCount,
    isLop12,
    totalCount: mcqCount + tfItemsCount + saCount,
    tfCount: tfQuestionsCount
  };
};

// Helper to generate questions strictly adhering to learning objectives and cognitive levels
export const generateBiologyQuestions = async (
  param: string | GenerateQuestionOptions, 
  count?: number
): Promise<Question[]> => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });

  let grade = 'Lớp 10';
  let topic = '';
  let lessonName = '';
  let learningObjectives = '';

  if (typeof param === 'string') {
    topic = param;
  } else {
    grade = param.grade || 'Lớp 10';
    topic = param.topic || '';
    lessonName = param.lessonName || '';
    learningObjectives = param.learningObjectives || '';
  }

  const requestedCount = (param as GenerateQuestionOptions)?.count || count;
  const config = analyzeLearningObjectives(learningObjectives, requestedCount, grade);

  // Áp dụng số lượng câu hỏi tùy chỉnh theo cấu hình của giáo viên
  if (typeof param !== 'string') {
    if (typeof param.tracNghiemCount === 'number') {
      config.mcqCount = Math.max(0, param.tracNghiemCount);
      // Phân bổ các mức độ nhận thức: ~50% Nhận biết, ~30% Thông hiểu, ~20% Vận dụng
      config.nhanBietCount = Math.max(1, Math.round(config.mcqCount * 0.5));
      config.thongHieuCount = Math.max(1, Math.round(config.mcqCount * 0.3));
      config.vanDungCount = Math.max(0, config.mcqCount - config.nhanBietCount - config.thongHieuCount);
    } else {
      if (typeof param.nhanBietCount === 'number') config.nhanBietCount = Math.max(0, param.nhanBietCount);
      if (typeof param.thongHieuCount === 'number') config.thongHieuCount = Math.max(0, param.thongHieuCount);
      if (typeof param.vanDungCount === 'number') config.vanDungCount = Math.max(0, param.vanDungCount);
      config.mcqCount = config.nhanBietCount + config.thongHieuCount + config.vanDungCount;
    }

    if (typeof param.dungSaiCount === 'number') {
      config.tfQuestionsCount = Math.max(0, param.dungSaiCount);
      config.tfItemsCount = config.tfQuestionsCount * 4;
      config.tfCount = config.tfQuestionsCount;
    }

    if (typeof param.traLoiNganCount === 'number' && config.isLop12) {
      config.saCount = Math.max(0, param.traLoiNganCount);
    } else if (!config.isLop12) {
      config.saCount = 0;
    }

    config.totalCount = config.mcqCount + config.tfItemsCount + (config.isLop12 ? config.saCount : 0);
  }

  const prompt = `
    Bạn là chuyên gia khảo thí và biên soạn đề kiểm tra môn Sinh Học THPT theo CHƯƠNG TRÌNH GIÁO DỤC PHỔ THÔNG 2018 (SGK "Kết nối tri thức với cuộc sống").

    THÔNG TIN ĐỀ THI:
    - Khối Lớp: ${grade}
    - Chương trình: GDPT 2018 - Sách Giáo Khoa Kết nối tri thức với cuộc sống
    ${topic ? `- Chủ Đề: ${topic}` : ''}
    ${lessonName ? `- Tên Bài Học: ${lessonName}` : ''}
    - NỘI DUNG YÊU CẦU CẦN ĐẠT (YCCĐ) BẮT BUỘC BÁM SÁT 100%:
    """
    ${learningObjectives}
    """

    ${config.isLop12 ? `
    QUY ĐỊNH BẮT BUỘC VỀ ĐỀ THI KIỂM TRA ĐÁNH GIÁ Ở KHỐI LỚP 12 (THEO ĐỊNH DẠNG MỚI TỐT NGHIỆP THPT):
    BẮT BUỘC GỒM ĐẦY ĐỦ 3 PHẦN NHƯ SAU:
    ` : `
    QUY ĐỊNH BẮT BUỘC VỀ ĐỀ THI KIỂM TRA ĐÁNH GIÁ Ở KHỐI ${grade.toUpperCase()} (LỚP 10 VÀ LỚP 11):
    BẮT BUỘC GỒM ĐÚNG 2 PHẦN NHƯ SAU:
    `}

    QUY TẮC BẮT BUỘC VỀ VĂN PHONG VÀ ĐẶT CÂU HỎI (TUYỆT ĐỐI TUÂN THỦ THEO YÊU CẦU GIÁO VIÊN):
    1. TUYỆT ĐỐI KHÔNG ghi các nhãn mức độ nhận thức vào trường "text" của câu hỏi (KHÔNG ghi [Nhận biết], [Thông hiểu], [Vận dụng], [Vận dụng cao], [Vận dụng thực tế] hay (Nhận biết)). Mức độ nhận thức thể hiện qua chiều sâu nội dung, KHÔNG ghi nhãn thô vào text. Câu hỏi bắt đầu trực tiếp bằng nội dung câu hỏi sau "Câu [Số]." (Ví dụ chuẩn: "Câu 1. Phân tử DNA có chức năng chủ yếu nào sau đây?").
    2. TUYỆT ĐỐI KHÔNG ghi các câu dẫn siêu dữ liệu hành chính máy móc như: "Theo chương trình Lớp 12...", "Theo chương trình SGK...", "Theo bài học...", "Trong bài học này...".
    3. TUYỆT ĐỐI KHÔNG đưa nguyên văn câu chữ của YCCĐ trong ngoặc kép vào câu hỏi (Ví dụ: NGHIÊM CẤM VIẾT: 'phát biểu nào sau đây là ĐÚNG khi nói về: "Dựa vào cấu trúc hóa học của phân tử DNA, trình bày được chức năng của DNA."?'). Hãy biên soạn câu hỏi Sinh học cụ thể, trực diện, phù hợp với mức độ nhận thức và yêu cầu cần đạt của bài học.
    4. Câu hỏi bám sát chuẩn kiến thức kĩ năng và định dạng đề thi tốt nghiệp THPT mới của Bộ GD&ĐT.

    ===================================================================
    PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
    - Số lượng: Tạo đúng ${config.mcqCount} câu trắc nghiệm 4 lựa chọn (type: "MCQ") từ Câu 1 đến Câu ${config.mcqCount}.
    - Mỗi câu gồm 4 phương án A, B, C, D (chỉ có duy nhất 1 phương án đúng).
    - Căn cứ biên soạn: Dựa vào các nội dung kiến thức trong YCCĐ bài học:
      + Nhận biết (${config.nhanBietCount} câu): Hỏi về khái niệm, định nghĩa, đặc điểm, thành phần, cấu tạo cốt lõi.
      + Thông hiểu (${config.thongHieuCount} câu): Hỏi về bản chất hiện tượng, cơ chế sinh học, so sánh, phân tích mối quan hệ cấu trúc - chức năng.
      + Vận dụng (${config.vanDungCount} câu): Bắt buộc câu hỏi có tính thực tế (gắn với thực tiễn đời sống con người, hiện tượng tự nhiên, bảo vệ sức khỏe, ứng dụng y học, bảo vệ môi trường, hoặc xử lý thí nghiệm thực hành).
    - Định dạng mỗi câu:
      {
        "text": "Câu [Số]. [Nội dung câu hỏi]",
        "type": "MCQ",
        "options": ["A. [Nội dung A]", "B. [Nội dung B]", "C. [Nội dung C]", "D. [Nội dung D]"],
        "correctAnswer": "A" (hoặc "B", "C", "D")
      }

    ===================================================================
    PHẦN 2. CÂU HỎI ĐÚNG/SAI. Ở MỖI Ý CÁC EM SẼ TRẢ LỜI “ĐÚNG” HOẶC “SAI”.
    - Số lượng: Tạo đúng ${config.tfQuestionsCount} câu hỏi Đúng/Sai lớn (tương ứng ${config.tfItemsCount} ý mệnh đề a, b, c, d) bắt đầu từ Câu ${config.mcqCount + 1}.
    - Cấu trúc mỗi câu hỏi Đúng/Sai:
      Gồm 1 câu dẫn chung bám sát YCCĐ của bài học (ví dụ: "Câu ${config.mcqCount + 1}. Cho các nhận định về... Nhận định nào ĐÚNG/SAI:") và BẮT BUỘC ĐỦ 4 Ý LỆNH HỎI: a), b), c), d).
    - Định dạng trong mảng JSON trả về:
      Mỗi ý a, b, c, d được biểu diễn thành 1 phần tử riêng biệt (type: "TF") với cú pháp trường "text" chuẩn xác:
      {
        "text": "Câu ${config.mcqCount + 1}. [Nội dung dẫn chung bám sát YCCĐ] - a) [Nội dung mệnh đề phát biểu a]",
        "type": "TF",
        "options": ["Đúng", "Sai"],
        "correctAnswer": "Đúng"
      },
      {
        "text": "Câu ${config.mcqCount + 1}. [Nội dung dẫn chung bám sát YCCĐ] - b) [Nội dung mệnh đề phát biểu b]",
        "type": "TF",
        "options": ["Đúng", "Sai"],
        "correctAnswer": "Đúng"
      },
      {
        "text": "Câu ${config.mcqCount + 1}. [Nội dung dẫn chung bám sát YCCĐ] - c) [Nội dung mệnh đề phát biểu c]",
        "type": "TF",
        "options": ["Đúng", "Sai"],
        "correctAnswer": "Đúng"
      },
      {
        "text": "Câu ${config.mcqCount + 1}. [Nội dung dẫn chung bám sát YCCĐ] - d) [Nội dung mệnh đề phát biểu d]",
        "type": "TF",
        "options": ["Đúng", "Sai"],
        "correctAnswer": "Sai"
      }

    ${config.isLop12 ? `
    ===================================================================
    PHẦN 3. CÂU HỎI TRẢ LỜI NGẮN. (CHỈ BẮT BUỘC ÁP DỤNG CHO KHỐI LỚP 12)
    - Số lượng: Tạo đúng ${config.saCount} câu hỏi trả lời ngắn (type: "SA") từ Câu 1 đến Câu ${config.saCount}.
    - Yêu cầu câu hỏi: Đưa ra câu hỏi định lượng hoặc xác định chính xác một con số cụ thể / một thuật ngữ sinh học 12 chính xác bám sát YCCĐ của bài học (ví dụ: tính số bộ ba mã hóa amino acid, số liên kết hydrogen, số nucleotide, số phân tử DNA con, số amino acid, hiệu suất sinh thái...).
    - Định dạng:
      {
        "text": "Câu [Số]. [Nội dung câu hỏi yêu cầu điền đáp án]",
        "type": "SA",
        "options": [],
        "correctAnswer": "61" (hoặc kết quả số/từ khóa chính xác)
      }
    ` : ''}

    VÍ DỤ MẪU MINH HỌA (tham khảo theo mẫu giáo viên yêu cầu):
    Phần 1:
    Câu 1. Cấp độ tổ chức sống là
    A. Cấp độ tổ chức của vật chất có biểu hiện đầy đủ đặc tính của sự sống.
    B. Cấp độ tổ chức của tế bào có biểu hiện đầy đủ đặc tính của sự sống.
    C. Cấp độ tổ chức của cơ thể có biểu hiện đầy đủ đặc tính của sự sống.
    D. Cấp độ tổ chức của quần thể có biểu hiện đầy đủ đặc tính của sự sống.
    (Đáp án đúng: A)

    Phần 2:
    Câu 2. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI.
    a) Tế bào là nơi diễn ra mọi hoạt động sống. (Đúng)
    b) Tế bào là đơn vị chức năng của cơ thể sống. (Đúng)
    c) Tế bào có khả năng trao đổi chất theo phương thức đồng hóa và dị hóa. (Đúng)
    d) Tế bào có một hình thức phân chia duy nhất là nguyên phân (Sai)

    ${config.isLop12 ? `
    Phần 3. Câu Hỏi Trả Lời Ngắn.
    Câu 1. Có tổng cộng bao nhiêu bộ ba mã hóa các amino acid?
    Đáp án điền vào: ...........................................
    (Đáp án đúng: 61)
    ` : ''}

    LƯU Ý: Đây chỉ là mẫu cấu trúc. Bạn cần DỰA VÀO NỘI DUNG YÊU CẦU CẦN ĐẠT CỦA BÀI HỌC Ở TRÊN ĐỂ TẠO CÂU HỎI PHÙ HỢP VÀ CHÍNH XÁC NHẤT.

    TRẢ VỀ KẾT QUẢ ĐÚNG ĐỊNH DẠNG JSON ARRAY THUẦN TÚY (không kèm bất kỳ văn bản giải thích hay markdown code blocks):
    [
      ...
    ]
  `;

  const CANDIDATE_MODELS = [
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.1-pro-preview'
  ];

  let rawQuestions: any[] = [];
  let apiSuccess = false;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName, 
        contents: prompt,
        config: { 
          responseMimeType: 'application/json'
        }
      });

      const rawText = response.text || '[]';
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        rawQuestions = parsed;
        apiSuccess = true;
        break;
      }
    } catch (err: any) {
      console.warn(`[Gemini] Model ${modelName} encountered error:`, err?.message || err);
    }
  }

  // If Gemini API succeeded, format and return the parsed questions
  if (apiSuccess && rawQuestions.length > 0) {
    return rawQuestions.map((q: any, index: number) => {
      const isTF = q.type === 'TF' || (Array.isArray(q.options) && q.options.length === 2 && q.options.includes('Đúng') && q.options.includes('Sai'));
      
      let cleanOptions = ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'];
      if (isTF) {
        cleanOptions = ['Đúng', 'Sai'];
      } else if (q.type === 'SA') {
        cleanOptions = [];
      } else if (Array.isArray(q.options) && q.options.length > 0) {
        cleanOptions = q.options.map((opt: any) => typeof opt === 'string' ? opt.replace(/^[A-D][\.\:\)]\s*/, '').trim() : String(opt));
      }

      let cleanAnswer = q.correctAnswer;
      if (isTF) {
        cleanAnswer = (cleanAnswer === 'Sai' || String(cleanAnswer).toLowerCase() === 'sai') ? 'Sai' : 'Đúng';
      } else if (q.type === 'SA') {
        cleanAnswer = String(cleanAnswer || '').trim();
      } else {
        const matched = String(cleanAnswer).toUpperCase().match(/[ABCD]/);
        cleanAnswer = matched ? matched[0] : 'A';
      }

      return {
        id: `gen-${Date.now()}-${index}`,
        type: isTF ? 'TF' : (q.type === 'SA' ? 'SA' : 'MCQ'),
        text: formatDisplayQuestionText(q.text),
        options: cleanOptions,
        correctAnswer: cleanAnswer
      };
    });
  }

  // Robust Fallback Generator: Tạo bộ câu hỏi chuẩn bám sát YCCĐ khi API gặp sự cố mạng hoặc lỗi mô hình
  return generateCurriculumFallbackQuestions(grade, lessonName || topic, learningObjectives, config);
};

// Hàm tự động biên soạn câu hỏi dự phòng bám sát 100% YCCĐ của bài học:
// - Lớp 10, Lớp 11: Đúng cấu trúc 2 Phần chuẩn
// - Khối Lớp 12: Đúng cấu trúc 3 Phần chuẩn (Phần 1: Trắc nghiệm, Phần 2: Đúng/Sai, Phần 3: Trả lời ngắn)
function generateCurriculumFallbackQuestions(
  grade: string, 
  lessonTitle: string, 
  yccdText: string, 
  config: CognitiveLevelConfig
): Question[] {
  const normTitle = (lessonTitle || '').toLowerCase();
  const isLop12 = grade === 'Lớp 12' || grade === 'Sinh 12' || normTitle.includes('lớp 12') || config.isLop12;
  const isLop10Bai3 = normTitle.includes('bài 3') && normTitle.includes('cấp độ tổ chức');
  const isLop11Bai1 = normTitle.includes('bài 1') && (normTitle.includes('trao đổi chất') || normTitle.includes('chuyển hoá năng lượng'));
  const isLop11Bai2 = normTitle.includes('bài 2') && (normTitle.includes('nước') || normTitle.includes('khoáng'));
  const isLop12Bai1 = isLop12 && (normTitle.includes('bài 1') || (normTitle.includes('dna') && (normTitle.includes('tái bản') || normTitle.includes('cơ chế'))));
  const isLop12Bai2 = isLop12 && (normTitle.includes('bài 2') || normTitle.includes('gene') || normTitle.includes('amino acid') || normTitle.includes('mã di truyền'));

  // 1. MẪU CHUẨN ĐÚNG BÀI 1 LỚP 12: DNA VÀ CƠ CHẾ TÁI BẢN DNA (BẮT BUỘC 3 PHẦN):
  if (isLop12Bai1) {
    return [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (1 ĐÁP ÁN ĐÚNG)
      {
        id: `lop12-b1-mcq-1`,
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
        id: `lop12-b1-mcq-2`,
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
        id: `lop12-b1-mcq-3`,
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
        id: `lop12-b1-mcq-4`,
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
        id: `lop12-b1-mcq-5`,
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
        id: `lop12-b1-mcq-6`,
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
        id: `lop12-b1-tf-1a`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về cấu trúc và cơ chế tái bản của phân tử DNA. Nhận định nào ĐÚNG/SAI. - a) Theo nguyên tắc bổ sung, trong phân tử DNA mạch kép, số nucleotide loại Adenine luôn bằng Thymine, Guanine luôn bằng Cytosine.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop12-b1-tf-1b`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về cấu trúc và cơ chế tái bản của phân tử DNA. Nhận định nào ĐÚNG/SAI. - b) Enzyme DNA polymerase có vai trò tháo xoắn phân tử DNA và tổng hợp đoạn mồi RNA tại chạc ba tái bản.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: `lop12-b1-tf-1c`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về cấu trúc và cơ chế tái bản của phân tử DNA. Nhận định nào ĐÚNG/SAI. - c) Nhờ nguyên tắc bán bảo tồn và nguyên tắc bổ sung, thông tin di truyền được truyền đạt chính xác qua các thế hệ tế bào.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop12-b1-tf-1d`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về cấu trúc và cơ chế tái bản của phân tử DNA. Nhận định nào ĐÚNG/SAI. - d) Trên cả hai mạch khuôn của chạc sao chép chữ Y, quá trình tổng hợp mạch mới đều diễn ra liên tục theo chiều mở xoắn của phân tử DNA.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },

      // PHẦN 3. CÂU HỎI TRẢ LỜI NGẮN (ĐẶC TRƯNG KHỐI LỚP 12)
      {
        id: `lop12-b1-sa-1`,
        type: 'SA',
        text: 'Câu 1. Một phân tử DNA mạch kép có tổng số 3000 nucleotide, trong đó số nucleotide loại Adenine (A) bằng 600. Tổng số liên kết hydrogen của phân tử DNA này là bao nhiêu?',
        options: [],
        correctAnswer: '3900'
      },
      {
        id: `lop12-b1-sa-2`,
        type: 'SA',
        text: 'Câu 2. Một phân tử DNA mạch kép của vi khuẩn nhân đôi liên tiếp 3 lần trong môi trường chứa 14N. Kết thúc quá trình, có bao nhiêu phân tử DNA con được tạo thành chứa cả 14N và 15N?',
        options: [],
        correctAnswer: '2'
      }
    ];
  }

  // 2. MẪU CHUẨN ĐÚNG BÀI 2 LỚP 12 (BẮT BUỘC 3 PHẦN):
  if (isLop12Bai2) {
    return [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
      {
        id: `lop12-b2-mcq-1`,
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
        id: `lop12-b2-mcq-2`,
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
        id: `lop12-b2-mcq-3`,
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
        id: `lop12-b2-mcq-4`,
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
        id: `lop12-b2-mcq-5`,
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
        id: `lop12-b2-mcq-6`,
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
        id: `lop12-b2-tf-2a`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - a) Quá trình dịch mã tổng hợp protein diễn ra tại tế bào chất ở cả sinh vật nhân sơ và nhân thực.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop12-b2-tf-2b`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - b) Enzyme RNA polymerase có khả năng tự tháo xoắn phân tử DNA mà không cần enzyme tháo xoắn riêng biệt.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop12-b2-tf-2c`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - c) Trên một phân tử mRNA, nhiều ribosome cùng hoạt động (polyribosome) giúp tăng năng suất tổng hợp protein cùng loại.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop12-b2-tf-2d`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - d) Phân tử tRNA có cấu trúc mạch thẳng hoàn toàn và không có bất kỳ liên kết hydrogen nào giữa các base.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },

      // PHẦN 3. CÂU HỎI TRẢ LỜI NGẮN (ĐẶC TRƯNG KHỐI LỚP 12)
      {
        id: `lop12-b2-sa-1`,
        type: 'SA',
        text: 'Câu 1. Có tổng cộng bao nhiêu bộ ba mã hóa các amino acid?',
        options: [],
        correctAnswer: '61'
      },
      {
        id: `lop12-b2-sa-2`,
        type: 'SA',
        text: 'Câu 2. Một phân tử mRNA có 900 nucleotide, quá trình dịch mã trên mRNA này tổng hợp 1 chuỗi polypeptide hoàn chỉnh có bao nhiêu amino acid?',
        options: [],
        correctAnswer: '298'
      }
    ];
  }

  // 3. MẪU CHUẨN ĐÚNG BÀI 3 LỚP 10:
  if (isLop10Bai3) {
    return [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
      {
        id: `lop10-b3-mcq-1`,
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
        id: `lop10-b3-mcq-2`,
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
        id: `lop10-b3-mcq-3`,
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
        id: `lop10-b3-mcq-4`,
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
        id: `lop10-b3-mcq-5`,
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
        id: `lop10-b3-mcq-6`,
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
        id: `lop10-b3-tf-2a`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - a) Tế bào là nơi diễn ra mọi hoạt động sống.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop10-b3-tf-2b`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - b) Tế bào là đơn vị chức năng của cơ thể sống.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop10-b3-tf-2c`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - c) Tế bào có khả năng trao đổi chất theo phương thức đồng hóa và dị hóa.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop10-b3-tf-2d`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - d) Tế bào có một hình thức phân chia duy nhất là nguyên phân',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      }
    ];
  }

  // 4. MẪU CHUẨN BÀI 1 LỚP 11: KHÁI QUÁT VỀ TRAO ĐỔI CHẤT VÀ CHUYỂN HÓA NĂNG LƯỢNG
  if (isLop11Bai1) {
    return [
      // PHẦN 1: CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (CHỌN 1 PHƯƠNG ÁN ĐÚNG)
      {
        id: `lop11-b1-mcq-1`,
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
        id: `lop11-b1-mcq-2`,
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
        id: `lop11-b1-mcq-3`,
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
        id: `lop11-b1-mcq-4`,
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
        id: `lop11-b1-mcq-5`,
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
        id: `lop11-b1-mcq-6`,
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
        id: `lop11-b1-tf-1a`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - a) Năng lượng trong tế bào chủ yếu được chuyển hóa từ hóa năng tích lũy trong chất hữu cơ sang dạng ATP.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop11-b1-tf-1b`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - b) Quá trình dị hóa cung cấp năng lượng và các chất nền nguyên liệu cho quá trình đồng hóa diễn ra.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop11-b1-tf-1c`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - c) Mọi sinh vật trên Trái Đất đều thuộc nhóm sinh vật quang tự dưỡng sử dụng năng lượng ánh sáng mặt trời.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: `lop11-b1-tf-1d`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - d) Rèn luyện thể dục thể thao hợp lý làm tăng cường hiệu quả trao đổi chất và kích thích cơ thể phát triển khỏe mạnh.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      }
    ];
  }

  // 5. MẪU CHUẨN BÀI 2 LỚP 11: TRAO ĐỔI NƯỚC VÀ KHOÁNG Ở THỰC VẬT
  if (isLop11Bai2) {
    return [
      // PHẦN 1: CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (CHỌN 1 PHƯƠNG ÁN ĐÚNG)
      {
        id: `lop11-b2-mcq-1`,
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
        id: `lop11-b2-mcq-2`,
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
        id: `lop11-b2-mcq-3`,
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
        id: `lop11-b2-mcq-4`,
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
        id: `lop11-b2-mcq-5`,
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
        id: `lop11-b2-mcq-6`,
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
        id: `lop11-b2-tf-2a`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - a) Nước đi vào rễ cây hoàn toàn theo cơ chế thẩm thấu thụ động từ nơi có thế nước cao sang nơi có thế nước thấp.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop11-b2-tf-2b`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - b) Đai Caspary ở nội bì có vai trò kiểm soát, chọn lọc lượng nước và khoáng trước khi đi vào mạch gỗ.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop11-b2-tf-2c`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - c) Bón phân đạm (nitrogen) càng nhiều thì năng suất cây lấy củ và quả càng cao và an toàn cho người sử dụng.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: `lop11-b2-tf-2d`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - d) Tưới nước hợp lý đúng nhu cầu sinh lí của từng giai đoạn phát triển giúp cây trồng sinh trưởng khỏe mạnh và tiết kiệm tài nguyên nước.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      }
    ];
  }

  // 6. MẪU DÀNH CHO CÁC BÀI HỌC KHÁC DỰA VÀO YÊU CẦU CẦN ĐẠT CỦA BÀI ĐÓ
  // Làm sạch các dòng YCCĐ, loại bỏ từ hành chính để tạo câu hỏi sư phạm chuẩn mực
  const cleanLesson = (lessonTitle || '').replace(/^Bài\s*\d+[\:\.\-]?\s*/i, '').trim() || 'Sinh học';
  const lines = (yccdText || '')
    .split('\n')
    .map(l => l.replace(/^[-*•\d\.\)]+\s*/, '').trim())
    .filter(l => l.length > 5 && !l.endsWith(':'));

  const extractCleanTopic = (raw: string, defaultTopic: string): string => {
    if (!raw) return defaultTopic;
    let s = raw.replace(/^[-*•\d\.\)]+\s*/, '');
    s = s.replace(/^(?:Dựa vào|Nêu được|Nêu|Trình bày được|Trình bày|Giải thích được|Giải thích|Phân tích được|Phân tích|Mô tả được|Mô tả|Nhận biết được|Nhận biết|Phân biệt được|Phân biệt|Vận dụng được|Vận dụng|Kể tên được|Kể tên|Thực hiện được|Thực hiện|Quan sát được|Quan sát|Đánh giá được|Đánh giá|So sánh được|So sánh|Xác định được|Xác định)\s+/i, '');
    s = s.replace(/[\.\;\:\,\?]+$/, '').trim();
    if (!s || s.length < 4) return defaultTopic;
    return s;
  };

  const nbLine = lines.find(l => l.toLowerCase().includes('nêu') || l.toLowerCase().includes('trình bày') || l.toLowerCase().includes('khái niệm') || l.toLowerCase().includes('cấu trúc')) || lines[0] || `cấu trúc và đặc điểm của ${cleanLesson}`;
  const thLine = lines.find(l => l.toLowerCase().includes('giải thích') || l.toLowerCase().includes('phân tích') || l.toLowerCase().includes('phân biệt') || l.toLowerCase().includes('cơ chế')) || lines[1] || `cơ chế hoạt động của ${cleanLesson}`;
  const vdLine = lines.find(l => l.toLowerCase().includes('vận dụng') || l.toLowerCase().includes('thực tế') || l.toLowerCase().includes('biện pháp') || l.toLowerCase().includes('ứng dụng')) || lines[2] || `ứng dụng thực tiễn của ${cleanLesson}`;

  const nbTopic = extractCleanTopic(nbLine, `đặc điểm của ${cleanLesson}`);
  const thTopic = extractCleanTopic(thLine, `cơ chế sinh học của ${cleanLesson}`);
  const vdTopic = extractCleanTopic(vdLine, `ứng dụng thực tiễn của ${cleanLesson}`);

  const result: Question[] = [];
  const mcqTotal = Math.max(2, config.mcqCount || 6);

  // PHẦN 1: TẠO CÁC CÂU MCQ TỪ CÂU 1 ĐẾN CÂU mcqCount
  for (let idx = 1; idx <= mcqTotal; idx++) {
    const isNb = idx <= Math.max(1, Math.round(mcqTotal * 0.45));
    const isTh = !isNb && idx <= Math.max(2, Math.round(mcqTotal * 0.75));

    if (isNb) {
      result.push({
        id: `gen-fb-mcq-${Date.now()}-${idx}`,
        type: 'MCQ',
        text: `Câu ${idx}. Phát biểu nào sau đây là đúng khi nói về ${nbTopic}?`,
        options: [
          `A. Là đặc điểm cấu trúc và chức năng cơ bản đặc trưng của ${cleanLesson}.`,
          `B. Quá trình này chỉ xảy ra ở điều kiện nhân tạo và hoàn toàn không tồn tại trong tự nhiên.`,
          `C. Không có vai trò gì đối với sự sinh trưởng và duy trì cân bằng của cơ thể sinh vật.`,
          `D. Diễn ra hoàn toàn tự phát mà không cần sự tham gia của các chất xúc tác sinh học.`
        ],
        correctAnswer: 'A'
      });
    } else if (isTh) {
      result.push({
        id: `gen-fb-mcq-${Date.now()}-${idx}`,
        type: 'MCQ',
        text: `Câu ${idx}. Khi tìm hiểu về ${thTopic}, nhận định nào sau đây phản ánh chính xác nhất bản chất sinh học?`,
        options: [
          `A. Thể hiện sự phù hợp chặt chẽ giữa cấu trúc và chức năng sinh lí nhằm thích nghi và bảo đảm cân bằng nội môi.`,
          `B. Các quá trình sinh lí diễn ra độc lập tuyệt đối và không hề chịu ảnh hưởng từ môi trường ngoài.`,
          `C. Năng lượng tự sinh ra mà không cần trải qua các phản ứng chuyển hóa vật chất trong cơ thể.`,
          `D. Mọi hoạt động trao đổi chất đều dừng lại khi cơ thể thay đổi điều kiện sống.`
        ],
        correctAnswer: 'A'
      });
    } else {
      result.push({
        id: `gen-fb-mcq-${Date.now()}-${idx}`,
        type: 'MCQ',
        text: `Câu ${idx}. Trong đời sống và sản xuất thực tiễn, việc ứng dụng hiểu biết về ${vdTopic} nhằm mục đích nào sau đây?`,
        options: [
          `A. Xây dựng giải pháp kỹ thuật, chăm sóc và bảo vệ sức khỏe hoặc canh tác nông nghiệp dựa trên quy luật sinh học.`,
          `B. Lạm dụng chất kích thích hóa học cực đoan mà không tuân theo các chỉ dẫn an toàn sinh học.`,
          `C. Bỏ qua các nhân tố nhiệt độ, độ ẩm và dinh dưỡng trong quá trình nuôi trồng sinh vật.`,
          `D. Tách rời sinh vật khỏi môi trường sống tự nhiên mà không đảm bảo điều kiện thích nghi.`
        ],
        correctAnswer: 'A'
      });
    }
  }

  // PHẦN 2: TẠO CÂU HỎI ĐÚNG/SAI GỒM 1 CÂU DẪN CHUNG BÁM SÁT YCCĐ VÀ ĐỦ 4 Ý a), b), c), d)
  const tfNum = mcqTotal + 1;
  const leadSentence = `Câu ${tfNum}. Cho các nhận định liên quan đến ${cleanLesson}. Mỗi nhận định sau đây là Đúng hay Sai:`;

  result.push(
    {
      id: `gen-fb-tf-${Date.now()}-a`,
      type: 'TF',
      text: `${leadSentence} - a) ${nbTopic.charAt(0).toUpperCase() + nbTopic.slice(1)} là một trong những đặc tính quan trọng của hệ thống sống.`,
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Đúng'
    },
    {
      id: `gen-fb-tf-${Date.now()}-b`,
      type: 'TF',
      text: `${leadSentence} - b) ${thTopic.charAt(0).toUpperCase() + thTopic.slice(1)} được điều hòa chặt chẽ nhằm duy trì tính ổn định của cơ thể.`,
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Đúng'
    },
    {
      id: `gen-fb-tf-${Date.now()}-c`,
      type: 'TF',
      text: `${leadSentence} - c) Mọi sinh vật đều có thể tồn tại và phát triển bình thường mà không chịu sự chi phối của bất kỳ quy luật sinh học nào.`,
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Sai'
    },
    {
      id: `gen-fb-tf-${Date.now()}-d`,
      type: 'TF',
      text: `${leadSentence} - d) ${vdTopic.charAt(0).toUpperCase() + vdTopic.slice(1)} giúp nâng cao hiệu quả thực tiễn và góp phần bảo vệ sức khỏe hoặc môi trường.`,
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Đúng'
    }
  );

  // PHẦN 3: CÂU HỎI TRẢ LỜI NGẮN (CHỈ ÁP DỤNG RIÊNG CHO KHỐI LỚP 12)
  if (isLop12) {
    result.push(
      {
        id: `gen-fb-sa-${Date.now()}-1`,
        type: 'SA',
        text: 'Câu 1. Có tổng cộng bao nhiêu bộ ba mã hóa các amino acid trên phân tử mRNA?',
        options: [],
        correctAnswer: '61'
      },
      {
        id: `gen-fb-sa-${Date.now()}-2`,
        type: 'SA',
        text: 'Câu 2. Một phân tử mRNA trưởng thành có 900 nucleotide. Quá trình dịch mã trên mRNA này tổng hợp một chuỗi polypeptide hoàn chỉnh có bao nhiêu amino acid?',
        options: [],
        correctAnswer: '298'
      }
    );
  }

  return result;
}

export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64String, mimeType: file.type } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const cropImageFromFile = async (file: File, box: number[]): Promise<string | undefined> => {
  if (!file || !file.type.startsWith('image/') || !box || box.length !== 4) return undefined;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const [ymin, xmin, ymax, xmax] = box;
      const realX = Math.floor((xmin / 1000) * img.width);
      const realY = Math.floor((ymin / 1000) * img.height);
      const realW = Math.ceil(((xmax - xmin) / 1000) * img.width);
      const realH = Math.ceil(((ymax - ymin) / 1000) * img.height);
      const canvas = document.createElement('canvas');
      canvas.width = realW; canvas.height = realH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, realX, realY, realW, realH, 0, 0, realW, realH);
        resolve(canvas.toDataURL('image/png'));
      } else resolve(undefined);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export const generateQuestionsFromDocument = async (file: File): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const filePart = await fileToGenerativePart(file);

  const prompt = `
    Bạn là chuyên gia số hóa đề thi Sinh học. Hãy trích xuất câu hỏi từ tài liệu theo cấu trúc 3 phần:

    1. PHẦN I (Trắc nghiệm MCQ):
       - Nhận diện: "Phần 1. Câu hỏi trắc nghiệm" hoặc tương tự.
       - Quy tắc đáp án: Ký tự A, B, C hoặc D nào được GẠCH CHÂN (underline) là đáp án đúng.
       - Type: 'MCQ'.

    2. PHẦN II (Trắc nghiệm Đúng/Sai):
       - Nhận diện: "Phần II. Trắc nghiệm đúng sai". Một câu hỏi lớn có các ý a, b, c, d.
       - Hãy tách mỗi ý a, b, c, d thành một câu hỏi riêng.
       - Nội dung text: "[Nội dung câu hỏi lớn] - Ý [a/b/c/d]: [Nội dung ý]".
       - Quy tắc đáp án: Nếu ký tự a, b, c, d hoặc nội dung ý đó được GẠCH CHÂN -> Đáp án là "Đúng", ngược lại là "Sai".
       - Type: 'TF'. Options: ["Đúng", "Sai"].

    3. PHẦN III (Trả lời ngắn):
       - Nhận diện: "Phần 3. Trả lời ngắn".
       - Quy tắc đáp án: Số được gạch chân hoặc số nằm ở cuối câu hỏi là đáp án đúng.
       - Type: 'SA'.

    4. HÌNH ẢNH:
       - Nếu câu hỏi có hình minh họa, hãy đặt "hasImage": true and "image_bbox": [ymin, xmin, ymax, xmax] (0-1000).

    TRẢ VỀ JSON ARRAY:
    [
      { "text": "...", "type": "MCQ", "options": ["...", "..."], "correctAnswer": "A", "hasImage": true, "image_bbox": [...] },
      ...
    ]
  `;

  try {
    let response: any = null;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash', 
        contents: { parts: [filePart, { text: prompt }] },
        config: { 
          responseMimeType: 'application/json'
        }
      });
    } catch {
      response = await ai.models.generateContent({
        model: 'gemini-flash-latest', 
        contents: { parts: [filePart, { text: prompt }] },
        config: { 
          responseMimeType: 'application/json'
        }
      });
    }

    const rawQuestions = JSON.parse(response.text);
    return await Promise.all(rawQuestions.map(async (q: any, index: number) => {
        let imageBase64 = undefined;
        if (q.hasImage && q.image_bbox && file.type.startsWith('image/')) {
            imageBase64 = await cropImageFromFile(file, q.image_bbox);
        }
        return {
            id: `doc-${Date.now()}-${index}`,
            type: q.type,
            text: formatDisplayQuestionText(q.text),
            options: q.options || [],
            correctAnswer: q.correctAnswer,
            hasImage: !!q.hasImage,
            image: imageBase64
        };
    }));
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return [];
  }
};

export const generateExportCode = async (type: 'THEME' | 'PAGE'): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = type === 'THEME' ? "Tạo mã HTML/CSS/JS cho Theme Blogspot giáo dục Sinh học." : "Tạo mã HTML/CSS/JS cho Widget trắc nghiệm Sinh học.";
  try {
    let response: any = null;
    try {
      response = await ai.models.generateContent({ 
        model: 'gemini-3.8-flash', 
        contents: prompt
      });
    } catch {
      response = await ai.models.generateContent({ 
        model: 'gemini-flash-latest', 
        contents: prompt
      });
    }
    return response.text.replace(/```html|```xml|```/g, '').trim();
  } catch (e) { return "Lỗi tạo mã."; }
};

/**
 * Trợ Lí AI Sinh Học giải đáp thắc mắc và củng cố kiến thức theo YCCĐ cho học sinh
 */
export const askBioAIAssistant = async (params: {
  lessonName: string;
  userQuestion: string;
  errorContext?: string;
  history?: { sender: 'user' | 'ai'; text: string }[];
}): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `Bạn là Trợ Lí AI Sinh Học THPT (thuộc Hệ Thống LMS Sinh Học THPT theo chương trình GDPT 2018 và SGK Kết nối tri thức với cuộc sống).
Bài học hiện tại: "${params.lessonName}".
Ngữ cảnh các kiến thức/YCCĐ mà học sinh vừa làm sai hoặc cần củng cố:
${params.errorContext || 'Trọng tâm bài học'}

Mục tiêu của bạn:
1. Giải đáp thắc mắc của học sinh một cách ngắn gọn, súc tích, chuẩn xác về mặt sinh học.
2. Luôn kèm theo VÍ DỤ MINH HỌA cụ thể hoặc cơ chế thực tế để học sinh dễ hiểu và nhớ lâu.
3. Chỉ ra cạm bẫy câu hỏi thường gặp liên quan đến nội dung này để học sinh không bị bẫy trong bài luyện tập bù đắp lỗ hỏng.
4. Giọng điệu thân thiện, sư phạm, tích cực, khuyến khích học sinh tự tin tiếp tục học tập.`;

  const contents: any[] = [];
  if (params.history && params.history.length > 0) {
    for (const msg of params.history.slice(-6)) {
      contents.push({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      });
    }
  }
  contents.push({
    role: 'user',
    parts: [{ text: params.userQuestion }]
  });

  const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest'];

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7
        }
      });
      if (response && response.text) {
        return response.text.trim();
      }
    } catch (err) {
      console.warn(`Model ${modelName} failed for askBioAIAssistant:`, err);
    }
  }

  return `Về thắc mắc "${params.userQuestion}": Trong bài "${params.lessonName}", em hãy lưu ý bám sát định nghĩa chuẩn SGK Kết nối tri thức. Đặc biệt lưu ý nguyên tắc bổ sung, chiều enzyme và các trường hợp đặc biệt. Em hãy đọc kỹ lại lý thuyết và các ví dụ minh họa bên trên nhé!`;
};

