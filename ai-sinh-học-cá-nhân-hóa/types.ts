
export enum UserRole {
  STUDENT = 'STUDENT',
  ADMIN = 'ADMIN'
}

export enum UserLevel {
  LEVEL_1 = 'Nhập Môn',
  LEVEL_2 = 'Thông Hiểu',
  LEVEL_3 = 'Kì Tài',
  LEVEL_4 = 'Bá Chủ'
}

export interface User {
  studentId?: string;
  phone: string;
  name: string;
  className?: string; 
  password?: string; 
  role: UserRole;
  totalScore: number;
  examHistory: ExamResult[];
  isGuest?: boolean;
  status?: 'active' | 'lock' | 'Mở' | 'Khóa' | string;
}

export interface Question {
  id: string;
  text: string;
  image?: string; 
  hasImage?: boolean; 
  type: 'MCQ' | 'TF' | 'SA'; // MCQ: 1 chọn 4, TF: Đúng/Sai, SA: Trả lời ngắn
  options: string[]; 
  correctAnswer: string; 
  explanation?: string; // Hướng dẫn giải chi tiết / Đáp án
}

export interface Exam {
  id: string;
  title: string;
  category: string; 
  grade?: string; // 'Lớp 10' | 'Lớp 11' | 'Lớp 12'
  topic?: string; // Chủ đề
  lessonName?: string; // Tên Bài Học
  learningObjectives?: string; // Yêu Cầu Cần Đạt (YCCĐ)
  duration: number; 
  questions: Question[];
  createdBy: string;
  studentId?: string; // Mã học sinh tạo/sở hữu đề (vd 12T701)
  studentName?: string; // Họ tên học sinh
  studentClass?: string; // Lớp của học sinh (vd 12T7)
  creatorPhone?: string; // Số điện thoại học sinh
  isLocked?: boolean; 
  createdAt?: string; 
}

export interface ExamResultDetail {
  questionId: string;
  questionText: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  cognitiveLevel?: 'NHAN_BIET' | 'THONG_HIEU' | 'VAN_DUNG';
}

export interface ExamResult {
  turnId?: string; // Ma_Luot_Thi
  examId: string;
  examTitle: string;
  lessonName?: string;
  grade?: string;
  score: number; // So_Cau_Dung
  totalQuestions?: number; // Tong_So_Cau
  score10?: number; // Diem_He_10
  timeSpentSeconds?: number; // Thoi_Gian_Lam_Giay
  wrongNhanBiet?: number; // So_Cau_Sai_NhanBiet
  wrongThongHieu?: number; // So_Cau_Sai_ThongHieu
  wrongVanDung?: number; // So_Cau_Sai_VanDung
  date: string; 
  startTime?: string;
  endTime?: string;
  details?: ExamResultDetail[];
  competencyProfile?: StudentCompetencyProfile;
}

export interface DiagnosticErrorItem {
  questionId: string;
  questionText: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  cognitiveLevel: 'NHAN_BIET' | 'THONG_HIEU' | 'VAN_DUNG';
  weakConcept: string;
  reasonWhyWrong: string;
  explanation: string;
  yccdCode?: string;
  yccdText?: string;
  questionIndex?: number;
}

export interface RemedialTopicLesson {
  topic: string;
  yccdCode?: string;
  yccdText?: string;
  cognitiveLevel?: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | string;
  relatedQuestions?: number[];
  relatedErrorItems?: DiagnosticErrorItem[];
  coreTheory: string;
  diagramOrKeyNote: string;
  commonTrap: string;
  practicalExample: string;
}

export interface StudentCompetencyProfile {
  examId: string;
  examTitle: string;
  lessonName: string;
  studentId?: string;
  studentName?: string;
  studentClass?: string;
  date: string;
  initialScore: number;
  totalQuestions: number;
  score10: number;
  weakLevel: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Không hổng';
  weakTopics: string[];
  cognitiveStats: {
    nhanBiet: { total: number; correct: number; wrong: number };
    thongHieu: { total: number; correct: number; wrong: number };
    vanDung: { total: number; correct: number; wrong: number };
  };
  errorItems: DiagnosticErrorItem[];
  remedialLessons: RemedialTopicLesson[];
  practiceQuestions: Question[];
  practiceAnswers?: Record<string, string>;
  practiceScore?: number;
  practicePercent?: number;
  isRetestSubmitted?: boolean;
  isRemedialUnlocked?: boolean;
  remedialCompletedAt?: string;
  retestScore?: number;
  retestScore10?: number;
  improvementDelta?: number;
  status: 'CẦN_CỦNG_CỐ' | 'ĐANG_LUYỆN_TẬP' | 'ĐÃ_TIẾN_BỘ' | 'XUẤT_SẮC';
}

export interface BioAIChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export interface BattleRoom {
  id: string;
  code: string;
  host: string;
  players: string[];
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
}

export const TEXTBOOK_SERIES = 'Kết nối tri thức với cuộc sống';
export const CURRICULUM_PROGRAM = 'Chương trình Giáo dục phổ thông 2018';

const TOPICS_10 = [
  'Chương 1: Thành phần hoá học của tế bào',
  'Chương 2: Cấu trúc tế bào (Nhân sơ & Nhân thực)',
  'Chương 3: Trao đổi chất qua màng và truyền tin tế bào',
  'Chương 4: Chuyển hoá năng lượng trong tế bào',
  'Chương 5: Chu kì tế bào và phân bào',
  'Chương 6: Sinh học vi sinh vật',
  'Chương 7: Virus và ứng dụng'
];

const TOPICS_11 = [
  'Chương 1: Trao đổi chất và chuyển hóa năng lượng ở thực vật',
  'Chương 1: Trao đổi chất và chuyển hóa năng lượng ở động vật',
  'Chương 2: Cảm ứng ở sinh vật (Thực vật & Động vật)',
  'Chương 3: Sinh trưởng và phát triển ở sinh vật',
  'Chương 4: Sinh sản ở sinh vật',
  'Chương 5: Mối quan hệ giữa các quá trình sinh lí trong cơ thể'
];

const TOPICS_12 = [
  'Chương 1: Di truyền phân tử (Gene, tái bản DNA, phiên mã, dịch mã)',
  'Chương 2: Di truyền nhiễm sắc thể (NST, quy luật Mendel, liên kết gene)',
  'Chương 3: Mở rộng học thuyết di truyền và di truyền biểu hình',
  'Chương 4: Di truyền học quần thể và di truyền người',
  'Chương 5: Bằng chứng và các học thuyết tiến hóa',
  'Chương 6: Sự phát sinh và phát triển sự sống trên Trái Đất',
  'Chương 7: Sinh thái học cá thể và quần thể sinh vật',
  'Chương 8: Quần xã sinh vật, hệ sinh thái và sinh quyển'
];

export const BIO_TOPICS: Record<string, string[]> = {
  'Lớp 10': TOPICS_10,
  'Sinh 10': TOPICS_10,
  'Lớp 11': TOPICS_11,
  'Sinh 11': TOPICS_11,
  'Lớp 12': TOPICS_12,
  'Sinh 12': TOPICS_12
};

export interface CurriculumLesson {
  topic: string;
  lesson: string;
  yccd: string;
}

export const SAMPLE_BIO_CURRICULUM: Record<'Lớp 10' | 'Lớp 11' | 'Lớp 12', CurriculumLesson[]> = {
  'Lớp 10': [
    {
      topic: 'Bài 1: Giới thiệu khái quát môn sinh học',
      lesson: 'Bài 1: Giới thiệu khái quát môn sinh học',
      yccd: `Nhận biết:
- Nêu được đối tượng và các lĩnh vực nghiên cứu của sinh học.
- Nêu được triển vọng phát triển sinh học trong tương lai. Kể được tên các ngành nghề liên quan đến sinh học và ứng dụng sinh học.
Thông hiểu:
- Trình bày được mục tiêu môn Sinh học.
- Trình bày được định nghĩa về phát triển bền vững, vai trò của sinh học đối với sự phát triển bền vững môi trường sống.
Vận dụng:
- Phân tích được vai trò của sinh học với cuộc sống hằng ngày và với sự phát triển kinh tế – xã hội và những vấn đề toàn cầu; mối quan hệ giữa sinh học với các vấn đề xã hội.`
    },
    {
      topic: 'Bài 2: Các phương pháp nghiên cứu và học tập môn sinh học',
      lesson: 'Bài 2: Các phương pháp nghiên cứu và học tập môn sinh học',
      yccd: `Nhận biết:
- Nêu được một số vật liệu, thiết bị nghiên cứu và học tập môn Sinh học.
Thông hiểu:
+ Giới thiệu được phương pháp tin sinh học (Bioinformatics) như là công cụ trong nghiên cứu và học tập sinh học.
Vận dụng:
- Trình bày và vận dụng được một số phương pháp nghiên cứu sinh học, cụ thể:
+ Phương pháp quan sát;
+ Phương pháp làm việc trong phòng thí nghiệm (các kĩ thuật phòng thí nghiệm);
+ Phương pháp thực nghiệm khoa học.
- Trình bày và vận dụng được quy trình các kĩ năng trong tiến trình nghiên cứu khoa học.`
    },
    {
      topic: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
      lesson: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
      yccd: `Nhận biết:
- Phát biểu được khái niệm cấp độ tổ chức sống.
Thông hiểu:
- Trình bày được các đặc điểm chung của các cấp độ tổ chức sống.
- Dựa vào sơ đồ, phân biệt được cấp độ tổ chức sống.
Vận dụng:
- Giải thích được mối quan hệ giữa các cấp độ tổ chức sống.`
    },
    {
      topic: 'Bài 4: Các nguyên tố hóa học và nước',
      lesson: 'Bài 4: Các nguyên tố hóa học và nước',
      yccd: `Nhận biết:
- Nêu được khái quát học thuyết tế bào.
- Liệt kê được một số nguyên tố hoá học chính có trong tế bào (C, H, O, N, S, P).
- Nêu được vai trò của các nguyên tố vi lượng, đa lượng trong tế bào.
- Nêu được vai trò quan trọng của nguyên tố carbon trong tế bào (cấu trúc nguyên tử C có thể liên kết với chính nó và nhiều nhóm chức khác nhau).
Thông hiểu:
- Trình bày được đặc điểm cấu tạo phân tử nước quy định tính chất vật lí, hoá học và sinh học của nước, từ đó quy định vai trò sinh học của nước trong tế bào.
Vận dụng:
- Giải thích được tế bào là đơn vị cấu trúc và chức năng của cơ thể sống.`
    },
    {
      topic: 'Bài 5: Các phân tử sinh học',
      lesson: 'Bài 5: Các phân tử sinh học',
      yccd: `Nhận biết:
- Nêu được khái niệm phân tử sinh học.
- Nêu được một số nguồn thực phẩm cung cấp các phân tử sinh học cho cơ thể.
Thông hiểu:
- Trình bày được thành phần cấu tạo và vai trò của các phân tử sinh học trong tế bào.
- Phân tích được mối quan hệ giữa cấu tạo và vai trò của các phân tử sinh học.
Vận dụng:
- Vận dụng được kiến thức về thành phần hoá học của tế bào vào giải thích các hiện tượng và ứng dụng trong thực tiễn (giải thích vai trò của DNA trong xác định huyết thống, truy tìm tội phạm, ...).`
    },
    {
      topic: 'Bài 6: Thực hành: Nhận biết một số phân tử sinh học',
      lesson: 'Bài 6: Thực hành: Nhận biết một số phân tử sinh học',
      yccd: `Vận dụng:
- Tiến hành được thí nghiệm nhận biết các thành phần hóa học có trong tế bào như đường đơn, tinh bột, protein và lipid.
- Áp dụng được nguyên lí của các phản ứng hóa học đặc thù để nhận biết được từng loại phân tử sinh học.
- Có được các thao tác kỹ năng trong phòng thí nghiệm như pha hóa chất, sử dụng các dụng cụ và đặc biệt là các kỹ thuật an toàn phòng thí nghiệm, tránh bị hỏng, hỏa hoạn, bị hóa chất bắn vào cơ thể và quần áo.`
    },
    {
      topic: 'Bài 7: Tế bào nhân sơ',
      lesson: 'Bài 7: Tế bào nhân sơ',
      yccd: `Nhận biết:
- Mô tả được kích thước, cấu tạo và chức năng các thành phần của tế bào nhân sơ.`
    },
    {
      topic: 'Bài 8: Tế bào nhân thực',
      lesson: 'Bài 8: Tế bào nhân thực',
      yccd: `Nhận biết:
- Nêu được cấu tạo và chức năng của tế bào chất.
Thông hiểu:
- Trình bày được cấu trúc của nhân tế bào và chức năng quan trọng của nhân.
- Trình bày được cấu trúc và chức năng của các thành phần lông, roi, chất nền ngoại bào và bộ phận kết nối các tế bào.
- Lập được bảng so sánh tế bào nhân sơ và tế bào nhân thực, tế bào thực vật và tế bào động vật.
Vận dụng:
- Phân tích được mối quan hệ phù hợp giữa cấu tạo và chức năng của thành tế bào (ở tế bào thực vật) và màng sinh chất.
- Phân tích được mối quan hệ giữa cấu tạo và chức năng của các bào quan trong tế bào.`
    },
    {
      topic: 'Bài 9: Thực hành: Quan sát tế bào',
      lesson: 'Bài 9: Thực hành: Quan sát tế bào',
      yccd: `Vận dụng:
- Làm được tiêu bản và quan sát được tế bào nhân sơ.
- Làm được tiêu bản tế bào nhân thực (củ hành tây, hành ta, thài lài tía, hoa lúa, bí ngô, tế bào niêm mạc xoang miệng, ...) và quan sát nhân, một số bào quan trên tiêu bản đó.
- Rèn các kỹ năng làm tiêu bản tạm thời và sử dụng kính hiển vi.
- Có thái độ trung thực, ý thức cẩn thận trong thực hành thí nghiệm để có kết quả chính xác và đảm bảo an toàn.`
    },
    {
      topic: 'Bài 10: Trao đổi chất qua màng tế bào',
      lesson: 'Bài 10: Trao đổi chất qua màng tế bào',
      yccd: `Nhận biết:
- Nêu được khái niệm trao đổi chất qua màng tế bào.
Thông hiểu:
- Phân biệt được các hình thức vận chuyển các chất qua màng sinh chất: vận chuyển thụ động, chủ động. Nêu được ý nghĩa của các hình thức đó. Lấy được ví dụ minh hoạ.
- Trình bày được hiện tượng nhập bào và xuất bào thông qua biến dạng của màng sinh chất. Lấy được ví dụ minh hoạ.
Vận dụng:
- Vận dụng những hiểu biết về sự vận chuyển các chất qua màng sinh chất để giải thích một số hiện tượng thực tiễn (muối dưa, muối cà).`
    },
    {
      topic: 'Bài 11: Thực hành: Thí nghiệm co và phản co nguyên sinh',
      lesson: 'Bài 11: Thực hành: Thí nghiệm co và phản co nguyên sinh',
      yccd: `Vận dụng:
- Thực hiện thành thạo kỹ năng sử dụng kính hiển vi và làm tiêu bản hiển vi.
- Quan sát và vẽ được các tế bào đang ở các giai đoạn khác nhau của quá trình co nguyên sinh và phản co nguyên sinh.
- Điều khiển được sự co nguyên sinh thông qua điều khiển mức độ thẩm thấu của nước ra, vào tế bào.
- Tự làm được thí nghiệm theo quy trình.`
    },
    {
      topic: 'Bài 12: Thông tin giữa các tế bào',
      lesson: 'Bài 12: Thông tin giữa các tế bào',
      yccd: `Nhận biết:
- Nêu được khái niệm về thông tin giữa các tế bào.
Thông hiểu:
- Dựa vào sơ đồ thông tin giữa các tế bào, trình bày được các quá trình:
+ Tiếp nhận: Một phân tử truyền tin liên kết vào một protein thụ thể làm thụ thể thay đổi hình dạng;
+ Truyền tin: các chuỗi tương tác phân tử chuyển tiếp tín hiệu từ các thụ thể tới các phân tử đích trong tế bào;
+ Đáp ứng: Tế bào phát tín hiệu điều khiển phiên mã, dịch mã hoặc điều hoà hoạt động của tế bào.`
    },
    {
      topic: 'Bài 13: Khái quát về chuyển hoá vật chất và năng lượng',
      lesson: 'Bài 13: Khái quát về chuyển hoá vật chất và năng lượng',
      yccd: `Nhận biết:
- Phát biểu được khái niệm chuyển hoá năng lượng trong tế bào.
- Nêu được khái niệm, cấu trúc và cơ chế tác động của enzyme.
Thông hiểu:
- Trình bày được quá trình tổng hợp và phân giải ATP gắn liền với quá trình tích lũy, giải phóng năng lượng.
- Trình bày được vai trò của enzyme trong quá trình trao đổi chất và chuyển hoá năng lượng.
Vận dụng:
- Phân biệt được các dạng năng lượng trong chuyển hoá năng lượng ở tế bào. Giải thích được năng lượng được tích luỹ và sử dụng cho các hoạt động sống của tế bào là dạng hoá năng.
- Phân tích được cấu tạo và chức năng của ATP về giá trị năng lượng sinh học.
- Phân tích được các yếu tố ảnh hưởng đến hoạt động xúc tác của enzyme.`
    },
    {
      topic: 'Bài 14: Phân giải và tổng hợp các chất trong tế bào',
      lesson: 'Bài 14: Phân giải và tổng hợp các chất trong tế bào',
      yccd: `Nhận biết:
- Nêu được khái niệm tổng hợp các chất trong tế bào. Lấy được ví dụ minh hoạ (tổng hợp protein, lipid, carbohydrate,...).
- Nêu được vai trò quan trọng của quang hợp trong việc tổng hợp các chất và tích luỹ năng lượng trong tế bào thực vật.
- Nêu được vai trò của hoá tổng hợp và quang khử ở vi khuẩn.
- Phát biểu được khái niệm phân giải các chất trong tế bào.
Thông hiểu:
- Trình bày được quá trình tổng hợp các chất song song với tích luỹ năng lượng.
- Trình bày được các giai đoạn phân giải hiếu khí (hô hấp tế bào) và các giai đoạn phân giải kị khí (lên men).
- Trình bày được quá trình phân giải các chất song song với giải phóng năng lượng.
Vận dụng:
- Phân tích được mối quan hệ giữa tổng hợp và phân giải các chất trong tế bào.`
    },
    {
      topic: 'Bài 15: Thực hành: Thí nghiệm phân tích ảnh hưởng của một số yếu tố đến hoạt tính của enzyme và kiểm tra hoạt tính của enzyme amylase',
      lesson: 'Bài 15: Thực hành: Thí nghiệm phân tích ảnh hưởng của một số yếu tố đến hoạt tính của enzyme và kiểm tra hoạt tính của enzyme amylase',
      yccd: `Vận dụng:
- Thực hiện được các bước theo quy trình thí nghiệm.
- Quan sát và nhận xét được hiệu quả tác dụng của enzyme trong phân hủy protein; ảnh hưởng của pH, nhiệt độ đối với hoạt tính của enzyme phân giải protein.
- Quan sát và nhận xét được hiệu quả tác dụng của enzyme trong thủy phân tinh bột; ảnh hưởng của pH, nhiệt độ đối với hoạt tính của enzyme amylase.`
    },
    {
      topic: 'Bài 16: Chu kì tế bào và nguyên phân',
      lesson: 'Bài 16: Chu kì tế bào và nguyên phân',
      yccd: `Nhận biết:
- Nêu được khái niệm chu kì tế bào.
Thông hiểu:
- Dựa vào sơ đồ, trình bày được các giai đoạn và mối quan hệ giữa các giai đoạn trong chu kì tế bào của sinh vật nhân thực.
- Dựa vào cơ chế nhân đôi và phân li của nhiễm sắc thể để giải thích được quá trình nguyên phân là cơ chế sinh sản của tế bào.
Vận dụng:
- Giải thích được sự phân chia tế bào một cách không bình thường có thể dẫn đến ung thư.
- Trình bày được một số thông tin về bệnh ung thư ở Việt Nam. Nêu được một số biện pháp phòng tránh ung thư.`
    },
    {
      topic: 'Bài 17: Giảm phân',
      lesson: 'Bài 17: Giảm phân',
      yccd: `Thông hiểu:
- Dựa vào cơ chế nhân đôi và phân li của nhiễm sắc thể để giải thích được quá trình giảm phân, thụ tinh cùng với nguyên phân là cơ sở của sinh sản hữu tính ở sinh vật.
- Trình bày được một số nhân tố ảnh hưởng đến quá trình giảm phân.
- Lập được bảng so sánh quá trình nguyên phân và quá trình giảm phân.
Vận dụng:
- Vận dụng kiến thức về nguyên phân và giảm phân vào giải thích một số vấn đề trong thực tiễn.`
    },
    {
      topic: 'Bài 18: Thực hành: Làm và quan sát tiêu bản quá trình nguyên phân và giảm phân',
      lesson: 'Bài 18: Thực hành: Làm và quan sát tiêu bản quá trình nguyên phân và giảm phân',
      yccd: `Vận dụng:
- Thực hiện được các bước làm tiêu bản nhiễm sắc thể để quan sát quá trình nguyên phân và giảm phân.
- Quan sát và vẽ được các tế bào đang ở các giai đoạn khác nhau của quá trình nguyên phân và giảm phân.
- Rèn kỹ năng sử dụng kính hiển vi và làm tiêu bản hiển vi.`
    },
    {
      topic: 'Bài 19: Công nghệ tế bào',
      lesson: 'Bài 19: Công nghệ tế bào',
      yccd: `Nhận biết:
- Nêu được khái niệm, nguyên lí công nghệ và một số thành tựu của công nghệ tế bào thực vật.
- Nêu được khái niệm, nguyên lí công nghệ và một số thành tựu của công nghệ tế bào động vật.`
    },
    {
      topic: 'Bài 20: Sự đa dạng và phương pháp nghiên cứu vi sinh vật',
      lesson: 'Bài 20: Sự đa dạng và phương pháp nghiên cứu vi sinh vật',
      yccd: `Nhận biết:
- Nêu được khái niệm vi sinh vật. Kể tên được các nhóm vi sinh vật.
Thông hiểu:
- Phân biệt được các kiểu dinh dưỡng ở vi sinh vật.
- Trình bày được 1 số phương pháp nghiên cứu vi sinh vật.`
    },
    {
      topic: 'Bài 21: Trao đổi chất, sinh trưởng và sinh sản ở vi sinh vật',
      lesson: 'Bài 21: Trao đổi chất, sinh trưởng và sinh sản ở vi sinh vật',
      yccd: `Nhận biết:
- Nêu được một số ví dụ về quá trình tổng hợp và phân giải các chất ở vi sinh vật.
- Nêu được khái niệm sinh trưởng ở vi sinh vật.
Thông hiểu:
- Trình bày được đặc điểm các pha sinh trưởng của quần thể vi khuẩn.
- Phân biệt được các hình thức sinh sản ở vi sinh vật nhân sơ và vi sinh vật nhân thực.
- Trình bày được các yếu tố ảnh hưởng đến sinh trưởng của vi sinh vật.
Vận dụng:
- Trình bày được ý nghĩa của việc sử dụng kháng sinh để ức chế hoặc tiêu diệt vi sinh vật gây bệnh và tác hại của việc lạm dụng thuốc kháng sinh trong chữa bệnh cho con người và động vật.`
    },
    {
      topic: 'Bài 22: Vai trò và ứng dụng của vi sinh vật',
      lesson: 'Bài 22: Vai trò và ứng dụng của vi sinh vật',
      yccd: `Nhận biết:
- Kể tên được một số thành tựu hiện đại của công nghệ vi sinh vật.
- Kể tên được một số ngành nghề liên quan đến công nghệ vi sinh vật và triển vọng phát triển của ngành nghề đó.
Thông hiểu:
- Trình bày được cơ sở khoa học của việc ứng dụng vi sinh vật trong thực tiễn.
- Trình bày được một số ứng dụng vi sinh vật trong thực tiễn.
Vận dụng:
- Phân tích được vai trò của vi sinh vật trong đời sống con người và trong tự nhiên.
- Phân tích được triển vọng công nghệ vi sinh vật trong tương lai.`
    },
    {
      topic: 'Bài 23: Thực hành: Một số phương pháp nghiên cứu VSV thông dụng, tìm hiểu về các sản phẩm công nghệ VSV và làm một số sản phẩm lên men từ VSV',
      lesson: 'Bài 23: Thực hành: Một số phương pháp nghiên cứu VSV thông dụng, tìm hiểu về các sản phẩm công nghệ VSV và làm một số sản phẩm lên men từ VSV',
      yccd: `Vận dụng:
- Thực hiện được 1 số phương pháp nghiên cứu vsv thông dụng.
- Thực hiện được các bước làm dự án hoặc đề tài tìm hiểu về các sản phẩm của công nghệ vsv.
- Làm được tập san các bài viết, tranh ảnh về công nghệ vsv.
- Thực hiện được đúng các bước trong quy trình làm sữa chua, dưa chua, lên men rượu và tạo ra các sản phẩm đảm bảo chất lượng.
- Rèn được năng lực tổ chức, sắp xếp, năng lực hợp tác nhóm, kỹ năng thực hành, viết báo cáo, làm tập san tranh ảnh, kỹ năng thuyết trình.`
    },
    {
      topic: 'Bài 24: Khái quát về virus',
      lesson: 'Bài 24: Khái quát về virus',
      yccd: `Nhận biết:
- Nêu được khái niệm và các đặc điểm của virus.
Thông hiểu:
- Trình bày được cấu tạo của virus.
- Trình bày được các giai đoạn nhân lên của virus trong tế bào chủ.`
    },
    {
      topic: 'Bài 25: Một số bệnh do virus và các thành tựu nghiên cứu ứng dụng virus',
      lesson: 'Bài 25: Một số bệnh do virus và các thành tựu nghiên cứu ứng dụng virus',
      yccd: `Nhận biết:
- Kể tên được một số thành tựu ứng dụng virus trong sản xuất chế phẩm sinh học; trong y học và nông nghiệp; sản xuất thuốc trừ sâu từ virus.
Thông hiểu:
- Trình bày được phương thức lây truyền một số bệnh do virus ở người, thực vật và động vật (HIV, cúm, sởi, ...) và cách phòng chống.
Vận dụng:
- Giải thích được cơ chế gây bệnh do virus.
- Giải thích được các bệnh do virus thường lây lan nhanh, rộng và có nhiều biến thể.`
    },
    {
      topic: 'Bài 26: Thực hành: Điều tra một số bệnh do virus và tuyên truyền phòng chống bệnh',
      lesson: 'Bài 26: Thực hành: Điều tra một số bệnh do virus và tuyên truyền phòng chống bệnh',
      yccd: `Vận dụng:
- Thực hiện được dự án hoặc đề tài điều tra một số bệnh virus gây ra.
- Tuyên truyền được cách phòng chống một số loại bệnh do virus.`
    }
  ],
  'Lớp 11': [
    {
      topic: 'Bài 1: Khái quát về trao đổi chất và chuyển hoá năng lượng',
      lesson: 'Bài 1: Khái quát về trao đổi chất và chuyển hoá năng lượng',
      yccd: `Nhận biết:
- Nêu được khái niệm trao đổi chất và chuyển hoá năng lượng ở sinh vật.
- Nêu được vai trò của trao đổi chất và chuyển hoá năng lượng đối với cơ thể sinh vật.
Thông hiểu:
- Phân biệt được hai mặt của trao đổi chất: đồng hoá và dị hoá; giải thích được mối quan hệ gắn bó mật thiết giữa đồng hóa và dị hóa.
- Phân biệt được các phương thức trao đổi chất và chuyển hoá năng lượng ở các nhóm sinh vật (tự dưỡng và dị dưỡng).
Vận dụng:
- Vận dụng hiểu biết về các giai đoạn chuyển hoá năng lượng trong cơ thể để giải thích các hiện tượng thực tế và xây dựng chế độ dinh dưỡng, vận động khoa học.`
    },
    {
      topic: 'Bài 2: Trao đổi nước và khoáng ở thực vật',
      lesson: 'Bài 2: Trao đổi nước và khoáng ở thực vật',
      yccd: `Nhận biết:
- Nêu được vai trò của nước và các nguyên tố khoáng thiết yếu đối với thực vật.
- Liệt kê được các con đường hấp thụ nước và ion khoáng ở tế bào lông hút của rễ.
Thông hiểu:
- Mô tả được con đường vận chuyển nước và khoáng trong cây (dòng mạch gỗ và dòng mạch rây).
- Giải thích được cơ chế thoát hơi nước qua khí khổng và vai trò của động lực thoát hơi nước đối với sự vận chuyển dòng nước trong cây.
Vận dụng:
- Vận dụng kiến thức về trao đổi nước và khoáng ở thực vật vào giải thích các biện pháp kĩ thuật canh tác nông nghiệp (tưới nước hợp lí, bón phân đúng liều lượng và thời điểm).`
    },
    {
      topic: 'Bài 3: Thực hành: Trao đổi nước và khoáng ở thực vật',
      lesson: 'Bài 3: Thực hành: Trao đổi nước và khoáng ở thực vật',
      yccd: `Vận dụng:
- Thực hiện được thí nghiệm chứng minh sự hút nước ở rễ và thoát hơi nước ở lá cây.
- Quan sát và mô tả được cấu trúc của tế bào khí khổng dưới kính hiển vi.
- Xử lí được kết quả thí nghiệm, rút ra kết luận và giải thích các hiện tượng thực tế.`
    },
    {
      topic: 'Bài 4: Quang hợp ở thực vật',
      lesson: 'Bài 4: Quang hợp ở thực vật',
      yccd: `Nhận biết:
- Nêu được khái niệm, phương trình tổng quát và vai trò của quang hợp ở thực vật.
- Kể tên được các sắc tố quang hợp và vai trò của hệ sắc tố (chlorophyll, carotenoid).
Thông hiểu:
- Trình bày được diễn biến của pha sáng và pha tối (chu trình Calvin) trong quang hợp.
- Phân tích được các nhân tố ngoại cảnh (ánh sáng, CO₂, nhiệt độ, nước) ảnh hưởng đến cường độ quang hợp.
Vận dụng:
- Vận dụng kiến thức quang hợp để đề xuất các biện pháp kĩ thuật nâng cao năng suất cây trồng (điều khiển quang chu kì, mật độ gieo trồng, bón phân CO₂).`
    },
    {
      topic: 'Bài 5: Thực hành: Quang hợp ở thực vật',
      lesson: 'Bài 5: Thực hành: Quang hợp ở thực vật',
      yccd: `Vận dụng:
- Thực hiện được thí nghiệm chứng minh sự tạo thành tinh bột và giải phóng oxygen trong quang hợp.
- Chiết rút và tách được các nhóm sắc tố quang hợp từ lá cây bằng dung môi hữu cơ.
- Rèn luyện kỹ năng thực hành, an toàn phòng thí nghiệm và báo cáo kết quả.`
    },
    {
      topic: 'Bài 6: Hô hấp ở thực vật',
      lesson: 'Bài 6: Hô hấp ở thực vật',
      yccd: `Nhận biết:
- Nêu được khái niệm, phương trình tổng quát và vai trò của hô hấp ở thực vật.
Thông hiểu:
- Trình bày được các con đường hô hấp ở thực vật: phân giải kị khí (lên men) và phân giải hiếu khí (đường phân, chu trình Krebs, chuỗi truyền electron).
- Phân tích được ảnh hưởng của nhiệt độ, hàm lượng nước, nồng độ O₂ và CO₂ đến hô hấp ở thực vật.
Vận dụng:
- Giải thích được cơ sở khoa học của các biện pháp bảo quản nông sản (bảo quản khô, bảo quản lạnh, bảo quản trong điều kiện nồng độ CO₂ cao).`
    },
    {
      topic: 'Bài 7: Thực hành: Hô hấp ở thực vật',
      lesson: 'Bài 7: Thực hành: Hô hấp ở thực vật',
      yccd: `Vận dụng:
- Thực hiện được thí nghiệm chứng minh hô hấp thải khí CO₂ hoặc hút khí O₂ ở hạt nảy mầm.
- Quan sát và đo đạc được sự biến thiên nhiệt độ trong khối hạt đang nảy mầm.
- Giải thích được kết quả thu được dựa trên bản chất sinh hóa của hô hấp.`
    },
    {
      topic: 'Bài 8: Dinh dưỡng và tiêu hoá ở động vật',
      lesson: 'Bài 8: Dinh dưỡng và tiêu hoá ở động vật',
      yccd: `Nhận biết:
- Nêu được khái niệm dinh dưỡng và tiêu hoá ở động vật.
- Kể tên được các hình thức tiêu hoá: tiêu hóa nội bào, tiêu hóa ngoại bào trong túi tiêu hóa và tiêu hóa trong ống tiêu hóa.
Thông hiểu:
- Phân tích được sự phù hợp giữa cấu tạo cơ quan tiêu hóa với chế độ ăn ở động vật ăn thực vật và động vật ăn thịt.
- Trình bày được quá trình biến đổi thức ăn về cơ học và hóa học trong ống tiêu hóa của người.
Vận dụng:
- Vận dụng kiến thức tiêu hóa để giải thích các bệnh học đường về tiêu hóa, xây dựng thói quen ăn uống khoa học và vệ sinh an toàn thực phẩm.`
    },
    {
      topic: 'Bài 9: Hô hấp ở động vật',
      lesson: 'Bài 9: Hô hấp ở động vật',
      yccd: `Nhận biết:
- Nêu được khái niệm hô hấp ở động vật và các hình thức trao đổi khí (qua bề mặt cơ thể, qua hệ thống ống khí, qua mang, qua phổi).
Thông hiểu:
- Phân tích được đặc điểm của bề mặt trao đổi khí phù hợp với hiệu quả hô hấp.
- Trình bày được cơ chế thông khí ở phổi người và các loài chim, bò sát, thú.
Vận dụng:
- Vận dụng kiến thức để giải thích tác hại của khói thuốc lá, ô nhiễm không khí đối với hệ hô hấp và rèn luyện thể dục thể thao hợp lí.`
    },
    {
      topic: 'Bài 10: Tuần hoàn ở động vật',
      lesson: 'Bài 10: Tuần hoàn ở động vật',
      yccd: `Nhận biết:
- Nêu được vai trò của hệ tuần hoàn ở động vật.
- Phân biệt được hệ tuần hoàn hở và hệ tuần hoàn kín; hệ tuần hoàn đơn và hệ tuần hoàn kép.
Thông hiểu:
- Trình bày được tính tự động của tim, chu kì hoạt động của tim và sự biến đổi huyết áp, vận tốc máu trong hệ mạch.
- Giải thích được cơ chế điều hòa hoạt động tim mạch bằng thần kinh và thể dịch.
Vận dụng:
- Vận dụng kiến thức tuần hoàn để giải thích nguyên nhân và biện pháp phòng chống các bệnh tim mạch (tăng huyết áp, xơ vữa động mạch).`
    },
    {
      topic: 'Bài 11: Thực hành: Một số thí nghiệm về hệ tuần hoàn',
      lesson: 'Bài 11: Thực hành: Một số thí nghiệm về hệ tuần hoàn',
      yccd: 'Thực hiện/quan sát được một số thí nghiệm về hoạt động tuần hoàn; đo hoặc quan sát nhịp tim; xử lí và giải thích kết quả.'
    },
    {
      topic: 'Bài 12: Miễn dịch ở động vật',
      lesson: 'Bài 12: Miễn dịch ở động vật',
      yccd: 'Nêu được khái niệm miễn dịch; phân biệt miễn dịch không đặc hiệu và đặc hiệu; trình bày vai trò của kháng thể, tế bào miễn dịch và vaccine.'
    },
    {
      topic: 'Bài 13: Bài tiết và cân bằng nội môi',
      lesson: 'Bài 13: Bài tiết và cân bằng nội môi',
      yccd: 'Trình bày vai trò của bài tiết và cân bằng nội môi; mô tả cơ chế điều hoà cân bằng nước, muối và glucose ở động vật; liên hệ với sức khoẻ.'
    },
    {
      topic: 'Bài 14: Khái quát về cảm ứng ở sinh vật',
      lesson: 'Bài 14: Khái quát về cảm ứng ở sinh vật',
      yccd: 'Nêu được khái niệm cảm ứng; phân tích vai trò của cảm ứng trong thích nghi; mô tả khái quát cơ chế tiếp nhận và đáp ứng kích thích.'
    },
    {
      topic: 'Bài 15: Cảm ứng ở thực vật',
      lesson: 'Bài 15: Cảm ứng ở thực vật',
      yccd: 'Trình bày được hướng động và ứng động; phân biệt các dạng cảm ứng ở thực vật; giải thích một số hiện tượng thực tiễn.'
    },
    {
      topic: 'Bài 16: Thực hành: Cảm ứng ở thực vật',
      lesson: 'Bài 16: Thực hành: Cảm ứng ở thực vật',
      yccd: 'Thực hiện thí nghiệm quan sát hướng động/ứng động; ghi nhận sự thay đổi và giải thích dựa trên tác nhân kích thích.'
    },
    {
      topic: 'Bài 17: Cảm ứng ở động vật',
      lesson: 'Bài 17: Cảm ứng ở động vật',
      yccd: 'Trình bày được khái niệm cảm ứng ở động vật; mô tả cấu tạo và chức năng cơ bản của hệ thần kinh; phân biệt phản xạ và cung phản xạ.'
    },
    {
      topic: 'Bài 18: Tập tính ở động vật',
      lesson: 'Bài 18: Tập tính ở động vật',
      yccd: 'Nêu được khái niệm tập tính; phân biệt tập tính bẩm sinh và học được; giải thích cơ sở và ý nghĩa của tập tính đối với động vật.'
    },
    {
      topic: 'Bài 19: Khái quát về sinh trưởng và phát triển ở sinh vật',
      lesson: 'Bài 19: Khái quát về sinh trưởng và phát triển ở sinh vật',
      yccd: 'Nêu được khái niệm sinh trưởng, phát triển; phân tích mối quan hệ giữa hai quá trình; trình bày các yếu tố ảnh hưởng.'
    },
    {
      topic: 'Bài 20: Sinh trưởng và phát triển ở thực vật',
      lesson: 'Bài 20: Sinh trưởng và phát triển ở thực vật',
      yccd: 'Trình bày được đặc điểm sinh trưởng sơ cấp, thứ cấp; vai trò hormone thực vật; phân tích ảnh hưởng của ánh sáng, nhiệt độ và dinh dưỡng.'
    },
    {
      topic: 'Bài 21: Thực hành: Bấm ngọn, tỉa cành, tính tuổi cây',
      lesson: 'Bài 21: Thực hành: Bấm ngọn, tỉa cành, tính tuổi cây',
      yccd: 'Thực hiện được thao tác bấm ngọn, tỉa cành theo mục đích; quan sát ảnh hưởng đến sinh trưởng; tính tuổi cây dựa trên dữ liệu phù hợp.'
    },
    {
      topic: 'Bài 22: Sinh trưởng và phát triển ở động vật',
      lesson: 'Bài 22: Sinh trưởng và phát triển ở động vật',
      yccd: 'Phân biệt phát triển qua biến thái hoàn toàn, không hoàn toàn và không qua biến thái; nêu vai trò hormone và các yếu tố ảnh hưởng.'
    },
    {
      topic: 'Bài 23: Thực hành: Quan sát quá trình biến thái ở động vật',
      lesson: 'Bài 23: Thực hành: Quan sát quá trình biến thái ở động vật',
      yccd: 'Quan sát được quá trình biến thái ở động vật; nhận diện các giai đoạn; mô tả đặc điểm và rút ra kết luận.'
    },
    {
      topic: 'Bài 24: Khái quát về sinh sản ở sinh vật',
      lesson: 'Bài 24: Khái quát về sinh sản ở sinh vật',
      yccd: 'Nêu được khái niệm và vai trò của sinh sản; phân biệt sinh sản vô tính và hữu tính; phân tích ý nghĩa của sinh sản đối với duy trì loài.'
    },
    {
      topic: 'Bài 25: Sinh sản ở thực vật',
      lesson: 'Bài 25: Sinh sản ở thực vật',
      yccd: 'Trình bày được sinh sản vô tính và hữu tính ở thực vật; mô tả quá trình thụ phấn, thụ tinh; nêu ứng dụng nhân giống vô tính.'
    },
    {
      topic: 'Bài 26: Thực hành: Nhân giống bằng sinh sản sinh dưỡng và thụ phấn cho cây',
      lesson: 'Bài 26: Thực hành: Nhân giống bằng sinh sản sinh dưỡng và thụ phấn cho cây',
      yccd: 'Thực hiện được một số phương pháp nhân giống sinh dưỡng và thao tác thụ phấn; theo dõi kết quả và đánh giá hiệu quả.'
    },
    {
      topic: 'Bài 27: Sinh sản ở động vật',
      lesson: 'Bài 27: Sinh sản ở động vật',
      yccd: 'Trình bày được sinh sản vô tính và hữu tính ở động vật; phân biệt thụ tinh ngoài và trong; nêu một số hình thức sinh sản và ứng dụng.'
    },
    {
      topic: 'Bài 28: Mối quan hệ giữa các quá trình sinh lí trong cơ thể sinh vật',
      lesson: 'Bài 28: Mối quan hệ giữa các quá trình sinh lí trong cơ thể sinh vật',
      yccd: 'Phân tích được mối quan hệ giữa trao đổi chất, cảm ứng, sinh trưởng, phát triển và sinh sản; giải thích tính thống nhất của cơ thể.'
    },
    {
      topic: 'Bài 29: Một số ngành nghề liên quan đến sinh học cơ thể',
      lesson: 'Bài 29: Một số ngành nghề liên quan đến sinh học cơ thể',
      yccd: 'Nêu được một số ngành nghề liên quan đến sinh học cơ thể; trình bày yêu cầu cơ bản và triển vọng của một số nghề.'
    }
  ],
  'Lớp 12': [
    {
      topic: 'Bài 1: DNA và cơ chế tái bản DNA',
      lesson: 'Bài 1: DNA và cơ chế tái bản DNA',
      yccd: `- Dựa vào cấu trúc hóa học của phân tử DNA, trình bày được chức năng của DNA.
- Nêu được ý nghĩa của các kết cặp đặc hiệu A – T và G – C.
- Phân tích được cơ chế tái bản của DNA là một quá trình tự sao thông tin di truyền từ tế bào mẹ sang tế bào con hay từ thế hệ này sang thế hệ sau.`
    },
    {
      topic: 'Bài 2: Gene, quá trình truyền đạt thông tin di truyền và hệ gene',
      lesson: 'Bài 2: Gene, quá trình truyền đạt thông tin di truyền và hệ gene',
      yccd: `- Nêu được khái niệm và cấu trúc của gene. Phân biệt được các loại gene dựa vào cấu trúc và chức năng của gene.
- Phân biệt được các loại RNA. Phân tích được bản chất phiên mã thông tin di truyền là cơ chế tổng hợp RNA dựa trên DNA.
- Nêu được khái niệm phiên mã ngược và ý nghĩa.
- Nêu được khái niệm và các đặc điểm của mã di truyền.
- Trình bày được cơ chế tổng hợp protein từ bản sao là RNA có bản chất là quá trình dịch mã.
- Vẽ và giải thích được sơ đồ liên kết ba quá trình thể hiện cơ chế di truyền ở cấp độ phân tử là quá trình truyền đạt thông tin di truyền.
- Phát biểu được khái niệm gene.
- Trình bày được một số thành tựu và ứng dụng của việc giải trình tự hệ gene người.`
    },
    {
      topic: 'Bài 3: Điều hoà biểu hiện gene',
      lesson: 'Bài 3: Điều hoà biểu hiện gene',
      yccd: `- Trình bày được thí nghiệm operon Lac của E.coli.
- Phân tích được ý nghĩa của điều hòa biểu hiện gene trong tế bào và trong quá trình phát triển cá thể.
- Nêu được ứng dụng của điều hòa biểu hiện gene.`
    },
    {
      topic: 'Bài 4: Đột biến gene',
      lesson: 'Bài 4: Đột biến gene',
      yccd: `- Nêu được khái niệm đột biến gene.
- Phân biệt được các dạng đột biến gene.
- Phân tích được nguyên nhân, cơ chế phát sinh đột biến gene.
- Trình bày được vai trò của đột biến gene trong tiến hoá, chọn giống và nghiên cứu di truyền.`
    },
    {
      topic: 'Bài 5: Công nghệ di truyền',
      lesson: 'Bài 5: Công nghệ di truyền',
      yccd: `- Nêu được khái niệm, nguyên lí và một số thành tựu của công nghệ DNA tái tổ hợp.
- Nêu được khái niệm, nguyên lí và một số thành tựu của tạo thực vật và động vật biến đổi gene.
- Tranh luận, phản biện được về việc sản xuất và sử dụng sản phẩm biến đổi gene và đạo đức sinh học.`
    },
    {
      topic: 'Bài 6: Thực hành: Tách chiết DNA',
      lesson: 'Bài 6: Thực hành: Tách chiết DNA',
      yccd: `Thực hành tách chiết được DNA từ các mẫu vật sống.`
    },
    {
      topic: 'Bài 7: Cấu trúc và chức năng của nhiễm sắc thể',
      lesson: 'Bài 7: Cấu trúc và chức năng của nhiễm sắc thể',
      yccd: `- Dựa vào sơ đồ hoặc hình ảnh, trình bày được cấu trúc siêu hiển vi của NST.
- Trình bày được NST là vật chất di truyền.
- Mô tả được cách sắp xếp các gene trên NST, mỗi gene định vị tại mỗi vị trí xác định gọi là locus.
- Trình bày được ý nghĩa của nguyên phân, giảm phân và thụ tinh trong nghiên cứu di truyền. Từ đó, giải thích được nguyên phân, giảm phân và thụ tinh quyết định quy luật vận động và truyền thông tin di truyền của các gene qua các thế hệ tế bào và cá thể.
- Phân tích được sự vận động của NST (tự nhân đôi, phân li, tổ hợp và tái tổ hợp) trong nguyên phân, giảm phân và thụ tinh là cơ sở của sự vận động của gene được thể hiện trong các quy luật di truyền, biến dị tổ hợp và biến dị số lượng NST.`
    },
    {
      topic: 'Bài 8: Học thuyết di truyền của Mendel',
      lesson: 'Bài 8: Học thuyết di truyền của Mendel',
      yccd: `- Nêu được bối cảnh ra đời thí nghiệm của Mendel.
- Trình bày được cách bố trí và tiến hành thí nghiệm của Mendel.
- Nêu được tính quy luật của hiện tượng di truyền.
- Trình bày được cơ sở tế bào học các thí nghiệm của Mendel dựa trên mối quan hệ giữa nguyên phân, giảm phân và thụ tinh.
- Nêu được vì sao các quy luật của Mendel đặt nền móng cho di truyền học hiện đại.`
    },
    {
      topic: 'Bài 9: Mở rộng học thuyết của Mendel',
      lesson: 'Bài 9: Mở rộng học thuyết của Mendel',
      yccd: `- Giải thích được sản phẩm của các allele của cùng một gene và giữa các gene khác nhau có thể tương tác với nhau quy định tính trạng.`
    },
    {
      topic: 'Bài 10: Di truyền giới tính và di truyền liên kết với giới tính',
      lesson: 'Bài 10: Di truyền giới tính và di truyền liên kết với giới tính',
      yccd: `- Nêu được khái niệm NST giới tính và di truyền giới tính.
- Phân tích được cơ chế di truyền xác định giới tính.
- Giải thích được tỉ lệ lí thuyết giới tính trong tự nhiên thường là 1: 1.
- Trình bày được quan điểm của bản thân về việc điều khiển giới tính ở người theo ý muốn.
- Nêu được bối cảnh ra đời thí nghiệm của Morgan.
- Trình bày được cách bố trí thí nghiệm của Morgan, qua đó nêu được khái niệm di truyền liên kết với giới tính.
- Vận dụng những hiểu biết về di truyền giới tính và liên kết với giới tính để giải thích các vấn đề trong thực tiễn.`
    },
    {
      topic: 'Bài 11: Liên kết gene và hoán vị gene',
      lesson: 'Bài 11: Liên kết gene và hoán vị gene',
      yccd: `- Trình bày được cách bố trí và tiến hành thí nghiệm của Morgan, từ đó phát biểu được khái niệm liên kết gene.
- Phân tích được cơ sở tế bào học và ý nghĩa của liên kết gene.
- Trình bày được thí nghiệm của Morgan, từ đó phát biểu được khái niệm hoán vị gene.
- Phân tích được cơ sở tế bào học và ý nghĩa của hoán vị gene.
- Nêu được ý nghĩa của việc lập bản đồ di truyền.
- Nêu được quan điểm của Mendel và Morgan về tính quy luật của hiện tượng di truyền.`
    },
    {
      topic: 'Bài 12: Đột biến nhiễm sắc thể',
      lesson: 'Bài 12: Đột biến nhiễm sắc thể',
      yccd: `- Phát biểu được khái niệm đột biến NST.
- Trình bày được nguyên nhân và cơ chế phát sinh đột biến cấu trúc NST. Phân biệt được các dạng đột biến cấu trúc NST.
- Trình bày được nguyên nhân và cơ chế phát sinh đột biến số lượng NST. Phân biệt được các dạng đột biến số lượng NST. Lấy được ví dụ minh hoạ.
- Phân tích được tác hại của một số dạng đột biến NST đối với sinh vật.
- Trình bày được vai trò của đột biến NST trong tiến hoá, trong chọn giống và trong nghiên cứu di truyền.
- Phân tích được mối quan hệ giữa di truyền và biến dị.`
    },
    {
      topic: 'Bài 13: Di truyền học người và di truyền y học',
      lesson: 'Bài 13: Di truyền học người và di truyền y học',
      yccd: `- Nêu được khái niệm và vai trò của di truyền học người, di truyền y học.
- Nêu được một số phương pháp nghiên cứu di truyền người (tập trung vào phương pháp phả hệ). Xây dựng được phả hệ để xác định được sự di truyền tính trạng trong gia đình.
- Nêu được khái niệm y học tư vấn. Trình bày được cơ sở của y học tư vấn.
- Giải thích được vì sao cần đến cơ sở tư vấn hôn nhân gia đình trước khi kết hôn và sàng lọc trước sinh.
- Nêu được khái niệm liệu pháp gene. Vận dụng hiểu biết về liệu pháp gene để giải thích việc chữa trị các bệnh di truyền.
- Trình bày được một số thành tựu và ứng dụng của liệu pháp gene.`
    },
    {
      topic: 'Bài 14: Thực hành: Quan sát một số dạng đột biến nhiễm sắc thể',
      lesson: 'Bài 14: Thực hành: Quan sát một số dạng đột biến nhiễm sắc thể',
      yccd: `Thực hành, quan sát được đột biến NST trên tiêu bản cố định.`
    },
    {
      topic: 'Bài 15: Di truyền gene ngoài nhân',
      lesson: 'Bài 15: Di truyền gene ngoài nhân',
      yccd: `- Trình bày được bối cảnh ra đời thí nghiệm của Correns.
- Trình bày được thí nghiệm chứng minh di truyền gene ngoài nhân của Correns, từ đó giải thích được gene không những tồn tại trong nhân mà còn tồn tại ngoài nhân (trong các bào quan như ti thể, lạp thể).
- Trình bày được đặc điểm di truyền của gene ngoài nhân và một số ứng dụng.`
    },
    {
      topic: 'Bài 16: Tương tác giữa kiểu gene với môi trường và thành tựu chọn giống',
      lesson: 'Bài 16: Tương tác giữa kiểu gene với môi trường và thành tựu chọn giống',
      yccd: `- Phân tích được sự tương tác giữa kiểu gene và môi trường.
- Nêu được khái niệm mức phản ứng. Lấy được ví dụ minh hoạ.
- Trình bày được bản chất di truyền là di truyền mức phản ứng.
- Vận dụng được hiểu biết về thường biến và mức phản ứng của một kiểu gene, giải thích một số ứng dụng trong thực tiễn (tạo và chọn giống, kĩ thuật chăn nuôi, trồng trọt,...).
- Nêu được một số thành tựu chọn, tạo giống cây trồng và vật nuôi.`
    },
    {
      topic: 'Bài 17: Thí nghiệm về thường biến ở cây trồng',
      lesson: 'Bài 17: Thí nghiệm về thường biến ở cây trồng',
      yccd: `Thực hành trồng cây chứng minh được thường biến.`
    },
    {
      topic: 'Bài 18: Di truyền quần thể',
      lesson: 'Bài 18: Di truyền quần thể',
      yccd: `- Phát biểu được khái niệm quần thể (từ góc độ di truyền học). Lấy được ví dụ minh hoạ.
- Phát biểu được khái niệm di truyền quần thể.
- Trình bày được các đặc trưng di truyền của quần thể (tần số của các allele, tần số của các kiểu gene).
- Nêu được cấu trúc di truyền của quần thể ngẫu phối: mô tả được trạng thái cân bằng di truyền của quần thể.
- Trình bày được định luật Hardy – Weinberg và điều kiện nghiệm đúng.
- Phân tích được cấu trúc di truyền của quần thể tự thụ phấn và quần thể giao phối gần.
- Trình bày được ảnh hưởng của tự thụ phấn, giao phối gần, ngẫu phối chi phối tần số của các allele và thành phần kiểu gene của một quần thể.
- Giải thích một số vấn đề thực tiễn: vấn đề hôn nhân gia đình; vấn đề cho cây tự thụ phấn, động vật giao phối gần giảm năng suất, chất lượng.`
    },
    {
      topic: 'Bài 19: Các bằng chứng tiến hoá',
      lesson: 'Bài 19: Các bằng chứng tiến hoá',
      yccd: `- Trình bày được các bằng chứng tiến hoá: bằng chứng hoá thạch, giải phẫu so sánh, tế bào học và sinh học phân tử.`
    },
    {
      topic: 'Bài 20: Quan niệm của Darwin về chọn lọc tự nhiên và hình thành loài',
      lesson: 'Bài 20: Quan niệm của Darwin về chọn lọc tự nhiên và hình thành loài',
      yccd: `- Nêu được phương pháp mà Darwin đã sử dụng để xây dựng học thuyết về chọn lọc tự nhiên và hình thành loài (quan sát, hình thành giả thuyết, kiểm chứng giả thuyết).`
    },
    {
      topic: 'Bài 21: Học thuyết tiến hoá tổng hợp hiện đại',
      lesson: 'Bài 21: Học thuyết tiến hoá tổng hợp hiện đại',
      yccd: `- Nêu được khái niệm tiến hoá nhỏ và quần thể là đơn vị tiến hoá nhỏ.
- Trình bày được các nhân tố tiến hoá (đột biến, phiêu bạt di truyền, dòng gene, chọn lọc tự nhiên, giao phối không ngẫu nhiên).
- Phát biểu được khái niệm thích nghi và trình bày được cơ chế hình thành đặc điểm thích nghi.
- Giải thích được các đặc điểm thích nghi chỉ hợp lí tương đối. Lấy được ví dụ minh hoạ.
- Phát biểu được khái niệm loài sinh học và giải thích được cơ chế hình thành loài.`
    },
    {
      topic: 'Bài 22: Tiến hoá lớn và quá trình phát sinh chủng loại',
      lesson: 'Bài 22: Tiến hoá lớn và quá trình phát sinh chủng loại',
      yccd: `- Phát biểu được khái niệm tiến hoá lớn. Phân biệt được tiến hoá lớn và tiến hoá nhỏ.
- Vẽ được sơ đồ ba giai đoạn phát sinh sự sống trên Trái Đất (tiến hoá hoá học, tiến hoá tiền sinh học, tiến hoá sinh học).
- Dựa vào sơ đồ, trình bày được các đại địa chất và biến cố lớn thể hiện sự phát triển của sinh vật trong các đại đó.
- Nêu được một số minh chứng về tiến hoá lớn.
- Dựa vào sơ đồ cây sự sống, trình bày được sinh giới có nguồn gốc chung và phân tích được sự phát sinh chủng loại là kết quả của tiến hoá.
- Vẽ được sơ đồ các giai đoạn chính trong quá trình phát sinh loài người.
- Nêu được loài người hiện nay (H.sapiens) đã tiến hoá từ loài vượn người (Australopithecus) qua các giai đoạn trung gian.
- Làm được bài tập sưu tầm tài liệu về sự phát sinh và phát triển của sinh giới hoặc của loài người.`
    },
    {
      topic: 'Bài 23: Môi trường và các nhân tố sinh thái',
      lesson: 'Bài 23: Môi trường và các nhân tố sinh thái',
      yccd: `- Phát biểu được khái niệm môi trường sống của sinh vật.
- Nêu được khái niệm nhân tố sinh thái. Phân biệt được các nhân tố sinh thái vô sinh và hữu sinh, lấy được các ví dụ về nhân tố sinh thái. Lấy được ví dụ về tác động của nhân tố sinh thái lên đời sống sinh vật và thích nghi của sinh vật với các nhân tố sinh thái đó. Phân tích được những hoạt động của sinh vật có thể làm thay đổi môi trường sống của chúng.
- Trình bày được các quy luật về tác động của các nhân tố sinh thái lên đời sống sinh vật.
- Phát biểu được khái niệm nhịp sinh học, giải thích được nhịp sinh học chính là sự thích nghi của sinh vật với những thay đổi có tính chu kì của môi trường.
- Tìm hiểu được nhịp sinh học của chính cơ thể mình.`
    },
    {
      topic: 'Bài 24: Sinh thái học quần thể',
      lesson: 'Bài 24: Sinh thái học quần thể',
      yccd: `- Phát biểu được khái niệm quần thể sinh vật. Lấy được ví dụ minh hoạ.
- Giải thích được quần thể là một cấp độ tổ chức sống.
- Phân tích được các mối quan hệ hỗ trợ và cạnh tranh trong quần thể. Lấy được ví dụ minh hoạ.
- Trình bày được các đặc trưng cơ bản của quần thể sinh vật. Lấy được ví dụ chứng minh sự ổn định của quần thể phụ thuộc vào sự ổn định của các đặc trưng đó.
- Giải thích được cơ chế điều hoà mật độ của quần thể.
- Phân biệt được các kiểu tăng trưởng của quần thể sinh vật (tăng trưởng theo tiềm năng sinh học và tăng trưởng trong môi trường có nguồn sống bị giới hạn).
- Nêu được các yếu tố ảnh hưởng đến tăng trưởng của quần thể.
- Nêu được các đặc điểm tăng trưởng của quần thể người; phân tích được hậu quả của việc tăng trưởng dân số quá nhanh.
- Trình bày được các kiểu biến động số lượng cá thể của quần thể.
- Phân tích được các ứng dụng hiểu biết về quần thể trong thực tiễn.`
    },
    {
      topic: 'Bài 25: Thực hành – Xác định một số đặc trưng của quần thể',
      lesson: 'Bài 25: Thực hành – Xác định một số đặc trưng của quần thể',
      yccd: `Thực hành ước tính như kích thước quần thể và mật độ cá thể của quần thể ở loài thực vật hoặc động vật ít di chuyển.`
    },
    {
      topic: 'Bài 26: Quần xã sinh vật',
      lesson: 'Bài 26: Quần xã sinh vật',
      yccd: `- Phát biểu được khái niệm quần xã sinh vật.
- Phân tích được các đặc trưng cơ bản của quần xã: thành phần loài (loài ưu thế, loài đặc trưng, loài chủ chốt); chỉ số đa dạng và độ phong phú trong quần xã; cấu trúc không gian; cấu trúc chức năng dinh dưỡng. Giải thích được sự cân bằng của quần xã được bảo đảm bởi sự cân bằng chỉ số các đặc trưng đó.
- Trình bày được khái niệm và phân biệt được các mối quan hệ giữa các loài trong quần xã (cạnh tranh, hợp tác, cộng sinh, hội sinh, ức chế, kí sinh, động vật ăn thực vật, vật ăn thịt con mồi).
- Trình bày được khái niệm ổ sinh thái và vai trò của cạnh tranh trong việc hình thành ổ sinh thái.
- Phân tích được tác động của việc du nhập các loài ngoại lai hoặc giảm loài trong cấu trúc quần xã sinh vật đến trạng thái cân bằng của hệ sinh thái. Lấy được ví dụ minh hoạ.
- Giải thích được quần xã là một cấp độ tổ chức sống và trình bày được một số biện pháp bảo vệ quần xã.`
    },
    {
      topic: 'Bài 27: Thực hành: Tìm hiểu một số đặc trưng cơ bản của quần xã trong tự nhiên',
      lesson: 'Bài 27: Thực hành: Tìm hiểu một số đặc trưng cơ bản của quần xã trong tự nhiên',
      yccd: `- Xác định được các nhóm loài sinh vật trong quần xã.
- Tìm hiểu cấu trúc dinh dưỡng của quần xã.`
    },
    {
      topic: 'Bài 28: Hệ sinh thái',
      lesson: 'Bài 28: Hệ sinh thái',
      yccd: `- Phát biểu được khái niệm hệ sinh thái.
- Phân biệt được các thành phần cấu trúc của hệ sinh thái và các kiểu hệ sinh thái chủ yếu của Trái Đất, bao gồm các hệ sinh thái tự nhiên (hệ sinh thái trên cạn, dưới nước) và các hệ sinh thái nhân tạo.`
    },
    {
      topic: 'Bài 29: Trao đổi vật chất và chuyển hoá năng lượng trong hệ sinh thái',
      lesson: 'Bài 29: Trao đổi vật chất và chuyển hoá năng lượng trong hệ sinh thái',
      yccd: `- Trình bày được khái niệm chuỗi thức ăn, các loại chuỗi thức ăn, lưới thức ăn, bậc dinh dưỡng. Vẽ được sơ đồ chuỗi và lưới thức ăn trong quần xã.
- Trình bày được dòng năng lượng trong một hệ sinh thái (bao gồm: phân bố năng lượng trên Trái Đất, sơ đồ khái quát về dòng năng lượng trong hệ sinh thái, sơ đồ khái quát năng lượng chuyển qua các bậc dinh dưỡng trong hệ sinh thái).
- Nêu được khái niệm hiệu suất sinh thái, tháp sinh thái. Phân biệt được các dạng tháp sinh thái. Tính được hiệu suất sinh thái của một hệ sinh thái.
- Giải thích được ý nghĩa của nghiên cứu HSST và tháp sinh thái trong thực tiễn.`
    },
    {
      topic: 'Bài 30: Diễn thế sinh thái',
      lesson: 'Bài 30: Diễn thế sinh thái',
      yccd: `- Nêu được khái niệm diễn thế sinh thái.
- Phân biệt được các dạng diễn thế sinh thái.
- Phân tích được nguyên nhân và tầm quan trọng của diễn thế sinh thái trong tự nhiên và trong thực tiễn.
- Phân tích được diễn thế sinh thái ở một hệ sinh thái tại địa phương. Đề xuất được một số biện pháp bảo tồn HST đó.
- Nêu được một số hiện tượng ảnh hưởng đến hệ sinh thái như: sự ấm lên toàn cầu; sự phì dưỡng; sa mạc hoá. Giải thích được vì sao các hiện tượng đó vừa tác động đến hệ sinh thái vừa là nguyên nhân của sự mất cân bằng hệ sinh thái.`
    },
    {
      topic: 'Bài 31: Sinh quyển, khu sinh học và chu trình sinh – địa – hoá',
      lesson: 'Bài 31: Sinh quyển, khu sinh học và chu trình sinh – địa – hoá',
      yccd: `- Phát biểu được khái niệm sinh quyển; giải thích được sinh quyển là một cấp độ tổ chức sống lớn nhất hành tinh; trình bày được một số biện pháp bảo vệ sinh quyển.
- Phát biểu được khái niệm khu sinh học.
- Trình bày được đặc điểm của các khu sinh học trên cạn chủ yếu và các khu sinh học nước ngọt, khu sinh học nước mặn trên Trái Đất.
- Trình bày được các biện pháp bảo vệ tài nguyên sinh học của các khu sinh học đó.
- Phát biểu được khái niệm chu trình sinh – địa – hoá các chất.
- Vẽ được sơ đồ khái quát chu trình trao đổi chất trong tự nhiên.
- Trình bày được chu trình sinh – địa – hoá của một số chất: nước, carbon, nitrogen và ý nghĩa sinh học của các chu trình đó, đồng thời vận dụng kiến thức về các chu trình đó vào giải thích các vấn đề của thực tiễn.`
    },
    {
      topic: 'Bài 32: Thực hành: Thiết kế một hệ sinh thái nhân tạo',
      lesson: 'Bài 32: Thực hành: Thiết kế một hệ sinh thái nhân tạo',
      yccd: `Thiết kế được một bể cá cảnh vận dụng hiểu biết hệ sinh thái.`
    },
    {
      topic: 'Bài 33: Sinh thái học phục hồi và bảo tồn đa dạng sinh vật',
      lesson: 'Bài 33: Sinh thái học phục hồi và bảo tồn đa dạng sinh vật',
      yccd: `- Nêu được khái niệm sinh thái học phục hồi và bảo tồn.
- Giải thích được tại sao cần bảo tồn và phục hồi các hệ sinh thái tự nhiên.
- Trình bày được một số phương pháp bảo tồn và phục hồi sinh thái.`
    },
    {
      topic: 'Bài 34: Phát triển bền vững',
      lesson: 'Bài 34: Phát triển bền vững',
      yccd: `- Trình bày được khái niệm phát triển bền vững. Phân tích khái quát về tác động giữa kinh tế – xã hội – môi trường tự nhiên.
- Nêu được khái niệm và vai trò của phát triển nông nghiệp bền vững.
- Phân tích được: vai trò và các biện pháp sử dụng hợp lí tài nguyên thiên nhiên (đất, nước, rừng, năng lượng); các biện pháp hạn chế ô nhiễm môi trường; các biện pháp bảo tồn đa dạng sinh vật; vai trò của chính sách dân số, kế hoạch hoá gia đình trong phát triển bền vững; vai trò của giáo dục bảo vệ môi trường đối với phát triển bền vững đất nước.
- Đề xuất các hoạt động bản thân có thể làm được nhằm góp phần phát triển.`
    },
    {
      topic: 'Bài 35: Dự án: Tìm hiểu thực trạng bảo tồn sinh thái tại địa phương và đề xuất giải pháp bảo tồn',
      lesson: 'Bài 35: Dự án: Tìm hiểu thực trạng bảo tồn sinh thái tại địa phương và đề xuất giải pháp bảo tồn',
      yccd: `Thực hiện được dự án: tìm hiểu thực trạng bảo tồn hệ sinh thái tại địa phương và đề xuất giải pháp bảo tồn.`
    }
  ]
};
