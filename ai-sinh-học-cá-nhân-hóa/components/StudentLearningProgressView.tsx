import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Exam, Question, SAMPLE_BIO_CURRICULUM } from '../types';
import { generateBiologyQuestions, formatDisplayQuestionText } from '../services/geminiService';
import {
  getExams,
  isExamDeleted,
  sortExamsNewestFirst,
  submitExamResultToCloud,
  fetchGoogleSheetStudents,
  formatExamDisplayId,
  SheetStudent
} from '../services/dataService';

export type CompetencyStatus =
  | 'CAN_CUNG_CO'
  | 'DANG_HINH_THANH'
  | 'DANG_TIEN_BO'
  | 'ON_DINH'
  | 'CHUA_DU_DU_LIEU';

export type CognitiveLevelDisplay = 'Nhận biết' | 'Thông hiểu' | 'Vận dụng';

export interface CompetencyZoneNode {
  id: string;
  title: string;
  yccdDescription: string;
  level: CognitiveLevelDisplay;
  topicName: string;
  lessonName: string;
  grade: string;
  score: number | null;
  status: CompetencyStatus;
  trend: '↑' | '→' | '↓' | '—';
  evidenceCount: number;
  correctCount: number;
  historyScores: number[];
  diagnosisText: string;
  evidenceSummary: string;
  actionSteps: string[];
  priorityGoalText: string;
  keywords: string[];
}

interface PracticeHistoryRecord {
  nodeId: string;
  scores: number[];
  totalQuestions: number;
  correctQuestions: number;
  lastUpdated: string;
}

interface StudentLearningProgressViewProps {
  activeUser: User;
  isDrillDown: boolean;
  onBackToAdmin?: () => void;
  onUpdateUser: (updatedUser: User) => void;
  onNavigateToTest: () => void;
  onOpenLogin?: () => void;
}

const DEFAULT_COMPETENCY_TEMPLATES: Omit<
  CompetencyZoneNode,
  'score' | 'status' | 'trend' | 'evidenceCount' | 'correctCount' | 'historyScores'
>[] = [
  {
    id: 'node-dna-rep-nb',
    title: 'Nhân đôi DNA',
    yccdDescription: 'Nhận biết khái niệm, vị trí, nguyên tắc bổ sung và bán bảo tồn trong quá trình tái bản DNA.',
    level: 'Nhận biết',
    topicName: 'Cơ chế di truyền và biến dị',
    lessonName: 'Bài 1: Gene và sự tái bản DNA',
    grade: 'Lớp 12',
    diagnosisText: 'Qua các lần kiểm tra gần đây, em cần nắm chắc hơn tên gọi và vai trò cơ bản của các enzyme mở xoắn, tổng hợp mạch mới và nối đoạn Okazaki.',
    evidenceSummary: 'Cần củng cố các câu hỏi nhận diện thành phần tham gia tái bản DNA.',
    actionSteps: [
      'Ôn lại nguyên tắc bổ sung (A-T, G-C) và nguyên tắc bán bảo tồn.',
      'Phân biệt chức năng của enzyme DNA polymerase và DNA ligase.',
      'Luyện câu hỏi mức Nhận biết về quá trình nhân đôi DNA.'
    ],
    priorityGoalText: 'Nắm vững nguyên tắc và các thành phần tham gia tái bản DNA.',
    keywords: ['nhân đôi', 'tái bản', 'dna', 'okazaki', 'ligase', 'polymerase', 'bán bảo tồn']
  },
  {
    id: 'node-dna-rep-th',
    title: 'Nhân đôi DNA',
    yccdDescription: 'Giải thích cơ chế tổng hợp mạch liên tục và mạch gián đoạn (đoạn Okazaki) theo chiều 5’ → 3’.',
    level: 'Thông hiểu',
    topicName: 'Cơ chế di truyền và biến dị',
    lessonName: 'Bài 1: Gene và sự tái bản DNA',
    grade: 'Lớp 12',
    diagnosisText: 'Qua các lần kiểm tra gần đây, em còn nhầm lẫn chiều hoạt động của enzyme DNA polymerase trên hai mạch khuôn ngược chiều nhau.',
    evidenceSummary: 'Kết quả ở các câu hỏi phân tích chiều mạch khuôn và mạch mới đang cải thiện.',
    actionSteps: [
      'Xem lại sơ đồ chạc chữ Y và chiều trượt của enzyme trên mạch khuôn 3’ → 5’.',
      'Giải thích vì sao một mạch tổng hợp liên tục còn mạch kia tổng hợp gián đoạn.',
      'Luyện câu hỏi mức Thông hiểu về cơ chế tái bản DNA.'
    ],
    priorityGoalText: 'Hiểu rõ chiều tổng hợp 5’ → 3’ trên hai mạch khuôn tại chạc chữ Y.',
    keywords: ['nhân đôi', 'tái bản', 'dna', 'mạch khuôn', 'liên tục', 'gián đoạn', 'chạc chữ y']
  },
  {
    id: 'node-trans-nb',
    title: 'Phiên mã',
    yccdDescription: 'Nêu được khái niệm phiên mã, chiều mạch khuôn của gene và các loại phân tử RNA (mRNA, tRNA, rRNA).',
    level: 'Nhận biết',
    topicName: 'Cơ chế di truyền và biến dị',
    lessonName: 'Bài 2: Sự biểu hiện thông tin di truyền',
    grade: 'Lớp 12',
    diagnosisText: 'Em cần phân biệt rõ cấu trúc đơn phân của RNA (A, U, G, C) và chức năng từng loại RNA trong tế bào.',
    evidenceSummary: 'Kết quả nhận diện các loại phân tử RNA và enzyme RNA polymerase.',
    actionSteps: [
      'Ôn lại cấu trúc và chức năng của 3 loại RNA: mRNA, tRNA, rRNA.',
      'Ghi nhớ mạch khuôn sử dụng trong phiên mã là mạch có chiều 3’ → 5’.',
      'Luyện câu hỏi mức Nhận biết về quá trình phiên mã.'
    ],
    priorityGoalText: 'Phân biệt chính xác cấu trúc và vai trò của mRNA, tRNA, rRNA.',
    keywords: ['phiên mã', 'rna', 'mrna', 'trna', 'rrna', 'uracil']
  },
  {
    id: 'node-trans-th',
    title: 'Phiên mã',
    yccdDescription: 'Trình bày cơ chế phiên mã tổng hợp RNA và phân biệt nguyên tắc bổ sung giữa phiên mã với nhân đôi DNA.',
    level: 'Thông hiểu',
    topicName: 'Cơ chế di truyền và biến dị',
    lessonName: 'Bài 2: Sự biểu hiện thông tin di truyền',
    grade: 'Lớp 12',
    diagnosisText: 'Qua các lần kiểm tra gần đây, em đôi khi còn nhầm cặp base A mạch gốc liên kết với U (thay vì T) khi xác định trình tự mRNA.',
    evidenceSummary: 'Kết quả các câu xác định trình tự ribonucleotide trên mRNA.',
    actionSteps: [
      'Đối chiếu nguyên tắc bổ sung trong phiên mã (A gốc - U, T gốc - A, G gốc - C, C gốc - G).',
      'Ôn trình tự 3 giai đoạn: Khởi đầu → Kéo dài → Kết thúc phiên mã.',
      'Luyện câu hỏi mức Thông hiểu về quá trình phiên mã.'
    ],
    priorityGoalText: 'Xác định chuẩn xác trình tự mRNA từ mạch khuôn 3’ → 5’ của gene.',
    keywords: ['phiên mã', 'rna polymerase', 'mạch gốc', 'bổ sung']
  },
  {
    id: 'node-transl-th',
    title: 'Dịch mã',
    yccdDescription: 'Giải thích vai trò phối hợp của mRNA, tRNA và ribosome trong quá trình tổng hợp chuỗi polypeptide.',
    level: 'Thông hiểu',
    topicName: 'Cơ chế di truyền và biến dị',
    lessonName: 'Bài 2: Sự biểu hiện thông tin di truyền',
    grade: 'Lớp 12',
    diagnosisText: 'Qua các lần kiểm tra gần đây, em còn gặp khó khăn khi xác định vai trò của mRNA, tRNA và ribosome trong quá trình tổng hợp protein.',
    evidenceSummary: 'Kết quả ở nội dung cơ chế dịch mã và đối mã codon - anticodon chưa ổn định.',
    actionSteps: [
      'Ôn lại vai trò của mRNA, tRNA và ribosome trong dịch mã.',
      'Ôn trình tự các giai đoạn dịch mã (hoạt hóa amino acid và tổng hợp chuỗi polypeptide).',
      'Luyện câu hỏi mức Thông hiểu về cơ chế dịch mã.'
    ],
    priorityGoalText: 'Củng cố vai trò các thành phần tham gia dịch mã và nguyên tắc khớp mã.',
    keywords: ['dịch mã', 'polypeptide', 'ribosome', 'codon', 'anticodon', 'bộ ba', 'amino acid', 'protein']
  },
  {
    id: 'node-gene-prot-vd',
    title: 'Gene → Protein',
    yccdDescription: 'Vận dụng mối quan hệ DNA – mRNA – protein – tính trạng để giải thích tác động của đột biến và thực tiễn y sinh.',
    level: 'Vận dụng',
    topicName: 'Cơ chế di truyền và biến dị',
    lessonName: 'Bài 2: Sự biểu hiện thông tin di truyền',
    grade: 'Lớp 12',
    diagnosisText: 'Qua các bài kiểm tra, em cần rèn thêm kỹ năng suy luận chuỗi hệ quả khi một cặp nucleotide bị thay thế ảnh hưởng đến chuỗi polypeptide.',
    evidenceSummary: 'Cần thêm dữ liệu câu hỏi mức Vận dụng để đánh giá độ vững vàng.',
    actionSteps: [
      'Hệ thống hóa sơ đồ truyền thông tin di truyền: Gene (DNA) → mRNA → Protein → Tính trạng.',
      'Phân tích các trường hợp đột biến điểm làm thay đổi hoặc không làm thay đổi amino acid.',
      'Luyện câu hỏi mức Vận dụng về mối quan hệ Gene → Protein.'
    ],
    priorityGoalText: 'Vận dụng sơ đồ Gene → mRNA → Protein để giải bài tập thực tiễn.',
    keywords: ['gene', 'protein', 'tính trạng', 'mã di truyền', 'biểu hiện', 'vận dụng']
  },
  {
    id: 'node-operon-th',
    title: 'Điều hòa biểu hiện gene',
    yccdDescription: 'Giải thích cơ chế hoạt động của operon Lac ở vi khuẩn E. coli khi môi trường có hoặc không có đường lactose.',
    level: 'Thông hiểu',
    topicName: 'Cơ chế di truyền và biến dị',
    lessonName: 'Bài 3: Điều hòa biểu hiện gene',
    grade: 'Lớp 12',
    diagnosisText: 'Em cần chú ý phân biệt vai trò của vùng vận hành (Operator), vùng khởi động (Promoter) và gene điều hòa lacI.',
    evidenceSummary: 'Dữ liệu câu hỏi phân tích trạng thái Bật/Tắt của operon Lac.',
    actionSteps: [
      'Ôn lại cấu trúc của operon Lac (vùng P, vùng O và nhóm gene cấu trúc Z, Y, A).',
      'So sánh trạng thái của protein ức chế khi môi trường có và không có allolactose.',
      'Luyện câu hỏi mức Thông hiểu về điều hòa biểu hiện gene.'
    ],
    priorityGoalText: 'Phân biệt chính xác cơ chế đóng/mở của operon Lac ở E. coli.',
    keywords: ['điều hòa', 'operon', 'lac', 'lactose', 'ức chế', 'promoter', 'operator']
  },
  {
    id: 'node-mut-gene-th',
    title: 'Đột biến gene',
    yccdDescription: 'Phân biệt các dạng đột biến điểm (thay thế, thêm, mất một cặp nucleotide) và nguyên nhân phát sinh.',
    level: 'Thông hiểu',
    topicName: 'Cơ chế di truyền và biến dị',
    lessonName: 'Bài 4: Đột biến gene',
    grade: 'Lớp 12',
    diagnosisText: 'Qua các lần kiểm tra, em còn nhầm lẫn mức độ ảnh hưởng của đột biến mất/thêm cặp nucleotide (lệch khung đọc) so với thay thế.',
    evidenceSummary: 'Ghi nhận từ các câu hỏi về biến đổi cấu trúc gene và chất 5-BU.',
    actionSteps: [
      'Ôn lại khái niệm đột biến điểm và cơ chế tác động của tác nhân 5-BU, tia UV.',
      'So sánh hậu quả của đột biến thay thế với đột biến thêm hoặc mất 1 cặp nucleotide.',
      'Luyện câu hỏi mức Thông hiểu về đột biến gene.'
    ],
    priorityGoalText: 'Xác định đúng dạng đột biến điểm và hậu quả dịch khung đọc mã di truyền.',
    keywords: ['đột biến gene', 'đột biến điểm', 'thay thế', 'mất một cặp', '5-bu', 'nucleotide']
  },
  {
    id: 'node-mut-chrom-vd',
    title: 'Đột biến nhiễm sắc thể',
    yccdDescription: 'Vận dụng kiến thức về đột biến cấu trúc và số lượng nhiễm sắc thể để giải thích cơ chế phát sinh hội chứng di truyền.',
    level: 'Vận dụng',
    topicName: 'Cơ chế di truyền và biến dị',
    lessonName: 'Bài 5: Nhiễm sắc thể và đột biến nhiễm sắc thể',
    grade: 'Lớp 12',
    diagnosisText: 'Em cần thêm các lượt luyện tập để thành thạo cách xác định giao tử bất thường do không phân li nhiễm sắc thể trong giảm phân.',
    evidenceSummary: 'Cần bổ sung thêm dữ liệu thực hành ở mức Vận dụng.',
    actionSteps: [
      'Ôn lại 4 dạng đột biến cấu trúc NST (mất đoạn, lặp đoạn, đảo đoạn, chuyển đoạn).',
      'Phân tích sơ đồ không phân li NST ở giảm phân I và giảm phân II.',
      'Luyện câu hỏi mức Vận dụng về đột biến nhiễm sắc thể.'
    ],
    priorityGoalText: 'Giải thích cơ chế phát sinh thể lệch bội, đa bội và ứng dụng chọn giống.',
    keywords: ['nhiễm sắc thể', 'nst', 'lệch bội', 'đa bội', 'mất đoạn', 'chuyển đoạn', 'down']
  },
  // Bổ sung một số vùng năng lực Sinh 10 & Sinh 11 để bộ lọc Chủ đề / Bài học đa dạng
  {
    id: 'node-org-level-nb',
    title: 'Các cấp độ tổ chức của thế giới sống',
    yccdDescription: 'Nêu được khái niệm và thứ bậc các cấp độ tổ chức sống cơ bản: tế bào, cơ thể, quần thể, quần xã – hệ sinh thái.',
    level: 'Nhận biết',
    topicName: 'Giới thiệu chung về thế giới sống',
    lessonName: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
    grade: 'Lớp 10',
    diagnosisText: 'Em cần ghi nhớ đúng trật tự từ cấp độ thấp đến cấp độ cao và xác định tế bào là đơn vị cơ bản nhất.',
    evidenceSummary: 'Ghi nhận từ các câu hỏi nhận biết cấp độ tổ chức sống.',
    actionSteps: [
      'Ôn lại sơ đồ thứ bậc từ phân tử → bào quan → tế bào → mô → cơ quan → cơ thể → quần thể → quần xã.',
      'Nhận diện ví dụ thực tế của từng cấp độ tổ chức sống.',
      'Luyện câu hỏi mức Nhận biết về cấp độ tổ chức sống.'
    ],
    priorityGoalText: 'Nhận diện chính xác các cấp độ tổ chức sống cơ bản.',
    keywords: ['cấp độ tổ chức', 'thế giới sống', 'tế bào', 'quần thể', 'quần xã', 'bài 3']
  },
  {
    id: 'node-org-level-th',
    title: 'Đặc điểm chung của các cấp độ tổ chức sống',
    yccdDescription: 'Trình bày được nguyên tắc thứ bậc, hệ thống mở và tự điều chỉnh, thế giới sống liên tục tiến hóa.',
    level: 'Thông hiểu',
    topicName: 'Giới thiệu chung về thế giới sống',
    lessonName: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
    grade: 'Lớp 10',
    diagnosisText: 'Qua các lần làm bài, em cần phân biệt rõ ví dụ về khả năng tự điều chỉnh (cân bằng nội môi) và hệ thống mở.',
    evidenceSummary: 'Ghi nhận từ các câu hỏi phân tích đặc điểm cấp độ tổ chức sống.',
    actionSteps: [
      'Ôn lại 3 đặc điểm cốt lõi: tổ chức theo nguyên tắc thứ bậc, hệ thống mở & tự điều chỉnh, liên tục tiến hóa.',
      'Phân tích mối quan hệ cấu trúc và chức năng giữa các cấp độ.',
      'Luyện câu hỏi mức Thông hiểu về đặc điểm cấp độ tổ chức sống.'
    ],
    priorityGoalText: 'Phân biệt chính xác nguyên tắc thứ bậc, hệ thống mở và tự điều chỉnh.',
    keywords: ['thứ bậc', 'hệ thống mở', 'tự điều chỉnh', 'cấp độ tổ chức', 'nội môi']
  },
  {
    id: 'node-metab-th',
    title: 'Quang hợp và hô hấp ở thực vật',
    yccdDescription: 'Phân tích mối quan hệ giữa pha sáng và pha tối trong quang hợp, cũng như vai trò của hô hấp tế bào ở thực vật.',
    level: 'Thông hiểu',
    topicName: 'Trao đổi chất và chuyển hóa năng lượng ở sinh vật',
    lessonName: 'Bài 4: Quang hợp ở thực vật',
    grade: 'Lớp 11',
    diagnosisText: 'Em cần nắm vững nguyên liệu và sản phẩm chuyển giao giữa pha sáng (ATP, NADPH) sang chu trình Calvin (pha tối).',
    evidenceSummary: 'Ghi nhận từ các câu hỏi về trao đổi chất và chuyển hóa năng lượng.',
    actionSteps: [
      'Ôn lại vị trí diễn ra pha sáng (màng thylakoid) và pha tối (chất nền stroma).',
      'So sánh con đường cố định CO2 ở thực vật C3, C4 và CAM.',
      'Luyện câu hỏi mức Thông hiểu về quang hợp và hô hấp thực vật.'
    ],
    priorityGoalText: 'Nắm vững mối liên hệ giữa pha sáng và pha tối trong quang hợp.',
    keywords: ['quang hợp', 'hô hấp', 'trao đổi chất', 'pha sáng', 'pha tối', 'atp', 'thylakoid']
  }
];

// Ngân hàng câu hỏi chuẩn hóa cho từng vùng năng lực để rèn luyện tức thì (5 câu/lượt)
const CURATED_NODE_QUESTIONS: Record<string, Question[]> = {
  'node-transl-th': [
    {
      id: 'q-transl-1',
      type: 'MCQ',
      text: 'Trong quá trình dịch mã ở tế bào nhân thực, phân tử nào đóng vai trò như "người phiên dịch" trực tiếp khớp bộ ba đối mã (anticodon) với bộ ba mã sao (codon) trên mRNA?',
      options: ['tRNA', 'rRNA', 'DNA polymerase', 'mRNA trưởng thành'],
      correctAnswer: 'tRNA',
      explanation: 'tRNA mang một đầu gắn amino acid đặc hiệu và một đầu mang bộ ba đối mã (anticodon) khớp bổ sung với codon trên mRNA tại ribosome.'
    },
    {
      id: 'q-transl-2',
      type: 'MCQ',
      text: 'Trong dịch mã, ribosome dịch chuyển trên phân tử mRNA theo chiều nào để tổng hợp chuỗi polypeptide?',
      options: ['Chiều 5’ → 3’ từng bộ ba một', 'Chiều 3’ → 5’ từng bộ ba một', 'Chiều 5’ → 3’ từng nucleotide một', 'Hai chiều ngẫu nhiên tùy loại protein'],
      correctAnswer: 'Chiều 5’ → 3’ từng bộ ba một',
      explanation: 'Ribosome luôn trượt trên phân tử mRNA theo chiều từ 5’ → 3’ với từng bước trượt bằng 1 bộ ba (3 nucleotide).'
    },
    {
      id: 'q-transl-3',
      type: 'MCQ',
      text: 'Khi ribosome tiếp xúc với một trong các bộ ba kết thúc (5’UAA3’, 5’UAG3’ hoặc 5’UGA3’) trên mRNA thì hiện tượng nào sau đây diễn ra?',
      options: [
        'Không có tRNA nào mang amino acid tới khớp bổ sung, hai tiểu phần ribosome tách nhau ra và giải phóng chuỗi polypeptide',
        'tRNA mang amino acid Methionine đi vào ribosome để khóa đầu cuối của chuỗi polypeptide',
        'Enzyme RNA polymerase lập tức cắt đứt phân tử mRNA thành các ribonucleotide tự do',
        'Ribosome quay ngược chiều từ 3’ → 5’ để kiểm tra sửa sai trên chuỗi polypeptide'
      ],
      correctAnswer: 'Không có tRNA nào mang amino acid tới khớp bổ sung, hai tiểu phần ribosome tách nhau ra và giải phóng chuỗi polypeptide',
      explanation: 'Bộ ba kết thúc không mã hóa amino acid và không có tRNA tương ứng; protein giải phóng gắn vào làm quá trình dịch mã dừng lại.'
    },
    {
      id: 'q-transl-4',
      type: 'MCQ',
      text: 'Vai trò của phức hợp nhiều ribosome cùng trượt trên một phân tử mRNA (polyribosome / polysome) trong quá trình dịch mã là gì?',
      options: [
        'Tăng hiệu suất tổng hợp nhiều chuỗi polypeptide cùng loại trong thời gian ngắn',
        'Tạo ra nhiều loại chuỗi polypeptide có trình tự amino acid khác nhau từ một mRNA',
        'Giúp sửa chữa các đột biến điểm xuất hiện trên phân tử mRNA',
        'Chuyển đổi phân tử mRNA thành phân tử tRNA sau khi dịch mã xong'
      ],
      correctAnswer: 'Tăng hiệu suất tổng hợp nhiều chuỗi polypeptide cùng loại trong thời gian ngắn',
      explanation: 'Nhiều ribosome cùng trượt trên một mRNA giúp tế bào tổng hợp nhanh nhiều phân tử protein giống hệt nhau.'
    },
    {
      id: 'q-transl-5',
      type: 'MCQ',
      text: 'Giả sử trên phân tử mRNA có một codon là 5’ GUA 3’. Bộ ba đối mã (anticodon) của tRNA vận chuyển amino acid tới khớp bổ sung với codon này sẽ có trình tự như thế nào?',
      options: ['3’ CAU 5’', '5’ CAU 3’', '3’ GTA 5’', '3’ GUA 5’'],
      correctAnswer: '3’ CAU 5’',
      explanation: 'Theo nguyên tắc bổ sung (A-U, G-C) và ngược chiều trong dịch mã, codon 5’ GUA 3’ sẽ khớp với anticodon 3’ CAU 5’ (hay viết theo chiều 5’→3’ là 5’ UAC 3’).'
    }
  ],
  'node-dna-rep-th': [
    {
      id: 'q-dnarep-1',
      type: 'MCQ',
      text: 'Vì sao trong quá trình tái bản DNA, trên một chạc chữ Y lại có một mạch mới được tổng hợp liên tục và một mạch mới được tổng hợp gián đoạn thành các đoạn Okazaki?',
      options: [
        'Vì hai mạch khuôn của DNA ngược chiều nhau trong khi enzyme DNA polymerase chỉ tổng hợp mạch mới theo một chiều 5’ → 3’',
        'Vì enzyme DNA ligase chỉ hoạt động được trên một trong hai mạch khuôn của phân tử DNA mẹ',
        'Vì một mạch khuôn của DNA có chứa Uracil làm gián đoạn sự trượt của enzyme',
        'Vì tốc độ tháo xoắn ở hai đầu phân tử DNA diễn ra không đồng đều'
      ],
      correctAnswer: 'Vì hai mạch khuôn của DNA ngược chiều nhau trong khi enzyme DNA polymerase chỉ tổng hợp mạch mới theo một chiều 5’ → 3’',
      explanation: 'DNA có cấu trúc 2 mạch song song ngược chiều (3’→5’ và 5’→3’), mà DNA polymerase chỉ gắn nucleotide vào đầu 3’-OH tự do (tổng hợp chiều 5’→3’).'
    },
    {
      id: 'q-dnarep-2',
      type: 'MCQ',
      text: 'Trên mạch khuôn có chiều 3’ → 5’ tính từ điểm khởi đầu tái bản hướng vào đỉnh chạc chữ Y, mạch DNA mới được tổng hợp có đặc điểm nào?',
      options: [
        'Được tổng hợp liên tục cùng chiều tháo xoắn của chạc chữ Y',
        'Được tổng hợp gián đoạn thành từng đoạn Okazaki ngược chiều tháo xoắn',
        'Không cần đoạn mồi RNA khi bắt đầu tổng hợp',
        'Được tổng hợp theo chiều 3’ → 5’ nhờ enzyme RNA polymerase'
      ],
      correctAnswer: 'Được tổng hợp liên tục cùng chiều tháo xoắn của chạc chữ Y',
      explanation: 'Mạch khuôn 3’ → 5’ cho phép enzyme DNA polymerase trượt liên tục để tổng hợp mạch mới theo chiều 5’ → 3’ hướng vào chạc chữ Y.'
    },
    {
      id: 'q-dnarep-3',
      type: 'MCQ',
      text: 'Vai trò của enzyme DNA ligase trong quá trình nhân đôi DNA là gì?',
      options: [
        'Nối các đoạn Okazaki lại với nhau bằng liên kết phosphodiester để tạo mạch DNA hoàn chỉnh',
        'Tháo xoắn và cắt đứt các liên kết hydrogen giữa hai mạch đơn của DNA mẹ',
        'Tổng hợp đoạn mồi RNA cung cấp đầu 3’-OH tự do cho quá trình nhân đôi',
        'Lắp ráp các ribonucleotide tự do vào mạch khuôn theo nguyên tắc bổ sung'
      ],
      correctAnswer: 'Nối các đoạn Okazaki lại với nhau bằng liên kết phosphodiester để tạo mạch DNA hoàn chỉnh',
      explanation: 'Sau khi đoạn mồi RNA được thay thế bằng DNA, enzyme DNA ligase xúc tác hình thành liên kết phosphodiester nối các đoạn Okazaki.'
    },
    {
      id: 'q-dnarep-4',
      type: 'MCQ',
      text: 'Từ 1 phân tử DNA mẹ ban đầu tiến hành nhân đôi liên tiếp 3 lần, số phân tử DNA con hoàn toàn mới (không chứa mạch đơn nào của DNA mẹ ban đầu) là bao nhiêu?',
      options: ['6 phân tử', '8 phân tử', '4 phân tử', '7 phân tử'],
      correctAnswer: '6 phân tử',
      explanation: 'Sau 3 lần nhân đôi tạo ra 2^3 = 8 phân tử DNA con, trong đó có 2 phân tử mang mạch cũ của DNA mẹ, nên số phân tử hoàn toàn từ nguyên liệu mới là 8 - 2 = 6.'
    },
    {
      id: 'q-dnarep-5',
      type: 'MCQ',
      text: 'Theo nguyên tắc bán bảo tồn trong tái bản DNA, mỗi phân tử DNA con được tạo thành có cấu tạo như thế nào?',
      options: [
        'Gồm một mạch đơn của DNA mẹ ban đầu và một mạch đơn mới được tổng hợp từ môi trường nội bào',
        'Gồm hai mạch đơn hoàn toàn mới và phân tử DNA mẹ được giữ nguyên vẹn như ban đầu',
        'Mỗi mạch đơn là sự xen kẽ ngẫu nhiên giữa các đoạn DNA cũ và đoạn DNA mới',
        'Chỉ giữ lại một nửa chiều dài của phân tử DNA mẹ ban đầu'
      ],
      correctAnswer: 'Gồm một mạch đơn của DNA mẹ ban đầu và một mạch đơn mới được tổng hợp từ môi trường nội bào',
      explanation: 'Nguyên tắc bán bảo tồn (giữ lại một nửa) đảm bảo mỗi DNA con có 1 mạch khuôn cũ và 1 mạch mới tổng hợp.'
    }
  ],
  'node-trans-th': [
    {
      id: 'q-trans-1',
      type: 'MCQ',
      text: 'Cho một đoạn mạch khuôn của gene có trình tự nucleotide là 3’ TAC GGA CCT ACT 5’. Trình tự phân tử mRNA được tổng hợp từ đoạn mạch khuôn này là:',
      options: [
        '5’ AUG CCU GGA UGA 3’',
        '5’ ATG CCT GGA TGA 3’',
        '3’ AUG CCU GGA UGA 5’',
        '5’ UAC GGA CCU ACU 3’'
      ],
      correctAnswer: '5’ AUG CCU GGA UGA 3’',
      explanation: 'Mạch khuôn 3’→5’ phiên mã tạo mRNA chiều 5’→3’ theo nguyên tắc bổ sung: Tgốc-A, Agốc-U, Cgốc-G, Ggốc-C.'
    },
    {
      id: 'q-trans-2',
      type: 'MCQ',
      text: 'Điểm khác biệt cơ bản về nguyên tắc bổ sung giữa quá trình phiên mã và quá trình tái bản DNA là gì?',
      options: [
        'Trong phiên mã, Adenine (A) trên mạch khuôn liên kết với Uracil (U) của môi trường thay vì Thymine (T)',
        'Trong phiên mã, cả hai mạch của gene đều đồng thời được dùng làm khuôn tổng hợp RNA',
        'Trong phiên mã, Guanine (G) liên kết bổ sung với Adenine (A) bằng 3 liên kết hydrogen',
        'Trong phiên mã, mạch RNA mới được tổng hợp theo chiều từ 3’ → 5’'
      ],
      correctAnswer: 'Trong phiên mã, Adenine (A) trên mạch khuôn liên kết với Uracil (U) của môi trường thay vì Thymine (T)',
      explanation: 'Đơn phân của RNA có Uracil (U) thay cho Thymine (T), nên A trên mạch gốc 3’→5’ sẽ bắt cặp với U tự do.'
    },
    {
      id: 'q-trans-3',
      type: 'MCQ',
      text: 'Enzyme chính xúc tác quá trình tháo xoắn cục bộ phân tử DNA và tổng hợp mạch RNA trong phiên mã là:',
      options: ['RNA polymerase', 'DNA polymerase', 'DNA ligase', 'Restrictase'],
      correctAnswer: 'RNA polymerase',
      explanation: 'RNA polymerase bám vào vùng khởi động (Promoter), tháo xoắn gene và tổng hợp mạch RNA theo chiều 5’ → 3’.'
    },
    {
      id: 'q-trans-4',
      type: 'MCQ',
      text: 'Ở sinh vật nhân thực, sau khi quá trình phiên mã kết thúc, phân tử tiền mRNA (pre-mRNA) cần trải qua quá trình biến đổi nào trước khi ra tế bào chất dịch mã?',
      options: [
        'Cắt bỏ các đoạn intron không mã hóa và nối các đoạn exon mã hóa lại với nhau',
        'Cắt bỏ toàn bộ các đoạn exon và giữ lại các đoạn intron để làm khuôn dịch mã',
        'Thay thế toàn bộ nucleotide loại Uracil (U) bằng Thymine (T)',
        'Xoắn kép lại thành cấu trúc hai mạch đối song song giống phân tử DNA'
      ],
      correctAnswer: 'Cắt bỏ các đoạn intron không mã hóa và nối các đoạn exon mã hóa lại với nhau',
      explanation: 'Gene của sinh vật nhân thực là gene phân mảnh nên pre-mRNA phải được gắn mũ 5’, đuôi poly-A và cắt intron, nối exon thành mRNA trưởng thành.'
    },
    {
      id: 'q-trans-5',
      type: 'MCQ',
      text: 'Trong quá trình phiên mã, enzyme RNA polymerase bắt đầu bám vào vị trí nào của gene để khởi đầu tổng hợp RNA?',
      options: [
        'Vùng khởi động (Promoter)',
        'Bộ ba mở đầu 3’ TAC 5’ ở vùng mã hóa',
        'Vùng kết thúc (Terminator)',
        'Điểm khởi đầu tái bản Ori trên nhiễm sắc thể'
      ],
      correctAnswer: 'Vùng khởi động (Promoter)',
      explanation: 'Vùng điều hòa (Promoter) là nơi enzyme RNA polymerase nhận biết và liên kết để khởi động quá trình phiên mã.'
    }
  ],
  'node-gene-prot-vd': [
    {
      id: 'q-gp-1',
      type: 'MCQ',
      text: 'Một đột biến điểm làm thay thế một cặp nucleotide ở vùng mã hóa của gene nhưng chuỗi polypeptide do gene đó quy định không hề thay đổi trình tự amino acid. Nguyên nhân hợp lý nhất là do:',
      options: [
        'Tính thoái hóa của mã di truyền (bộ ba mới và bộ ba cũ cùng mã hóa cho một loại amino acid)',
        'Tính đặc hiệu của mã di truyền giúp ribosome tự động bỏ qua bộ ba bị đột biến',
        'Một phân tử tRNA có thể mang đồng thời nhiều loại amino acid khác nhau tới ribosome',
        'Quá trình phiên mã đã tự động phục hồi lại cặp nucleotide ban đầu trên DNA'
      ],
      correctAnswer: 'Tính thoái hóa của mã di truyền (bộ ba mới và bộ ba cũ cùng mã hóa cho một loại amino acid)',
      explanation: 'Do nhiều bộ ba khác nhau có thể cùng mã hóa một amino acid (tính thoái hóa), nên đột biến đồng nghĩa không làm đổi amino acid.'
    },
    {
      id: 'q-gp-2',
      type: 'MCQ',
      text: 'Một đoạn mạch gốc của gene có trình tự: 3’ TAC TTC AAA CCG 5’. Nếu cặp nucleotide thứ 6 (tính từ đầu 3’) là C-G bị đột biến thay thế thành T-A (trên mạch gốc C đổi thành T), thì chuỗi polypeptide tương ứng sẽ thay đổi như thế nào? (Biết UAA, UAG, UGA là bộ ba kết thúc)',
      options: [
        'Chuỗi polypeptide bị ngắn lại do xuất hiện bộ ba kết thúc sớm ở vị trí bộ ba thứ hai (5’ UAA 3’)',
        'Chuỗi polypeptide chỉ bị thay thế đúng 1 amino acid ở vị trí thứ hai',
        'Chuỗi polypeptide dài thêm 2 amino acid so với bình thường',
        'Chuỗi polypeptide không thay đổi gì vì đột biến xảy ra ở vùng intron'
      ],
      correctAnswer: 'Chuỗi polypeptide bị ngắn lại do xuất hiện bộ ba kết thúc sớm ở vị trí bộ ba thứ hai (5’ UAA 3’)',
      explanation: 'Bộ ba thứ hai trên mạch gốc là 3’ TTC 5’ (tạo codon 5’ AAG 3’). Khi C thứ 6 đổi thành T → mạch gốc thành 3’ TTT 5’ → codon trên mRNA là 5’ AAA 3’ hoặc nếu 3’ ATT 5’ → 5’ UAA 3’ làm kết thúc dịch mã sớm.'
    },
    {
      id: 'q-gp-3',
      type: 'MCQ',
      text: 'Trong y học hiện đại, người ta có thể chuyển gene mã hóa hormone insulin của người vào tế bào vi khuẩn E. coli để vi khuẩn tổng hợp đúng phân tử insulin của người. Cơ sở khoa học của ứng dụng này là:',
      options: [
        'Mã di truyền có tính phổ biến (hầu hết các loài sinh vật đều dùng chung một bộ mã di truyền)',
        'Vi khuẩn E. coli có cấu trúc nhân thực hoàn toàn giống với tế bào tuyến tụy của người',
        'Mã di truyền có tính thoái hóa chỉ xuất hiện ở vi khuẩn E. coli',
        'Hormone insulin được tổng hợp trực tiếp từ phân tử DNA mà không cần qua dịch mã'
      ],
      correctAnswer: 'Mã di truyền có tính phổ biến (hầu hết các loài sinh vật đều dùng chung một bộ mã di truyền)',
      explanation: 'Tính phổ biến của mã di truyền cho phép bộ máy dịch mã của E. coli đọc đúng thông tin trên mRNA của gene người.'
    },
    {
      id: 'q-gp-4',
      type: 'MCQ',
      text: 'Một phân tử mRNA trưởng thành ở sinh vật nhân thực có vùng mã hóa gồm 900 ribonucleotide (tính cả bộ ba mở đầu và một bộ ba kết thúc). Số amino acid có trong chuỗi polypeptide hoàn chỉnh sau khi cắt bỏ amino acid mở đầu là:',
      options: ['298 amino acid', '299 amino acid', '300 amino acid', '900 amino acid'],
      correctAnswer: '298 amino acid',
      explanation: 'Số bộ ba trên vùng mã hóa = 900 / 3 = 300 bộ ba. Trừ 1 bộ ba kết thúc (không mã hóa) và 1 amino acid mở đầu bị cắt bỏ → còn 300 - 2 = 298 amino acid.'
    },
    {
      id: 'q-gp-5',
      type: 'MCQ',
      text: 'Trong sơ đồ mối quan hệ "Gene (DNA) → mRNA → Protein → Tính trạng", yếu tố nào trực tiếp biểu hiện thành các tính trạng hình thái, sinh lý của cơ thể sinh vật?',
      options: [
        'Protein (enzyme, hormone, protein cấu trúc...)',
        'Mạch khuôn 3’ → 5’ của phân tử DNA trong nhân',
        'Các đoạn intron bị cắt bỏ sau quá trình phiên mã',
        'Các phân tử tRNA tự do trong tế bào chất'
      ],
      correctAnswer: 'Protein (enzyme, hormone, protein cấu trúc...)',
      explanation: 'Protein trực tiếp tham gia cấu trúc tế bào và xúc tác các phản ứng sinh hóa, từ đó quy định tính trạng của cơ thể.'
    }
  ]
};

const getStatusConfig = (status: CompetencyStatus) => {
  switch (status) {
    case 'CAN_CUNG_CO':
      return {
        label: 'Cần củng cố',
        dotColor: 'bg-rose-500',
        badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
        cardBorder: 'border-rose-200',
        textColor: 'text-rose-700',
        emoji: '🔴'
      };
    case 'DANG_HINH_THANH':
      return {
        label: 'Đang hình thành',
        dotColor: 'bg-amber-500',
        badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
        cardBorder: 'border-amber-200',
        textColor: 'text-amber-700',
        emoji: '🟠'
      };
    case 'DANG_TIEN_BO':
      return {
        label: 'Đang tiến bộ',
        dotColor: 'bg-sky-500',
        badgeBg: 'bg-sky-50 text-sky-700 border-sky-200',
        cardBorder: 'border-sky-200',
        textColor: 'text-sky-700',
        emoji: '🔵'
      };
    case 'ON_DINH':
      return {
        label: 'Ổn định',
        dotColor: 'bg-emerald-500',
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        cardBorder: 'border-emerald-200',
        textColor: 'text-emerald-700',
        emoji: '🟢'
      };
    case 'CHUA_DU_DU_LIEU':
    default:
      return {
        label: 'Chưa đủ dữ liệu',
        dotColor: 'bg-slate-400',
        badgeBg: 'bg-slate-100 text-slate-600 border-slate-200',
        cardBorder: 'border-slate-200',
        textColor: 'text-slate-600',
        emoji: '⚪'
      };
  }
};

export const StudentLearningProgressView: React.FC<StudentLearningProgressViewProps> = ({
  activeUser,
  isDrillDown,
  onBackToAdmin,
  onUpdateUser,
  onNavigateToTest,
  onOpenLogin
}) => {
  // Scope selection state (Khu vực A) - chỉ lọc theo Tất cả hoặc Bài học cụ thể học sinh đã làm
  const [scopeMode, setScopeMode] = useState<'ALL' | 'LESSON'>('ALL');
  const [selectedLesson, setSelectedLesson] = useState<string>('');

  // Local practice history stored per student so each practice session updates the competency map & trend
  const storageKey = `bio_competency_practice_v2_${activeUser.phone || 'guest'}`;
  const [practiceRecords, setPracticeRecords] = useState<Record<string, PracticeHistoryRecord>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setPracticeRecords(raw ? JSON.parse(raw) : {});
    } catch {
      setPracticeRecords({});
    }
  }, [storageKey]);

  const savePracticeRecord = (updated: Record<string, PracticeHistoryRecord>) => {
    setPracticeRecords(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}
  };

  // Load cloud/local exams and also check Google Sheet for real profile + examHistory of this student
  const [systemExams, setSystemExams] = useState<Exam[]>([]);
  const [cloudStudentHistory, setCloudStudentHistory] = useState<any[]>([]);
  const [cloudMatchedStudent, setCloudMatchedStudent] = useState<SheetStudent | null>(null);

  const normalizeViText = (str?: string | null): string => {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  };

  useEffect(() => {
    let mounted = true;
    getExams()
      .then(all => {
        if (!mounted) return;
        const valid = sortExamsNewestFirst((all || []).filter(e => e && e.category !== 'BATTLE' && !isExamDeleted(e.id)));
        setSystemExams(valid);
      })
      .catch(() => {});

    if (!activeUser.isGuest && (activeUser.phone !== 'guest' || activeUser.name !== 'Học sinh')) {
      fetchGoogleSheetStudents()
        .then(sheetStudents => {
          if (!mounted || !Array.isArray(sheetStudents)) return;
          const cleanUserPhone = (activeUser.phone || '').replace(/\D/g, '').replace(/^0+/, '');
          const normUserName = normalizeViText(activeUser.name);
          const normUserId = (activeUser.studentId || '').trim().toUpperCase();

          const matchedStudent = sheetStudents.find(s => {
            const sPhone = (s.phone || '').toString().replace(/\D/g, '').replace(/^0+/, '');
            const sId = (s.id || '').toString().trim().toUpperCase();
            const sName = normalizeViText(s.name);
            if (cleanUserPhone && sPhone && sPhone === cleanUserPhone) return true;
            if (normUserId && sId && sId === normUserId) return true;
            if (normUserName && sName && sName === normUserName) return true;
            return false;
          });

          if (matchedStudent) {
            setCloudMatchedStudent(matchedStudent);
            setCloudStudentHistory(Array.isArray(matchedStudent.examHistory) ? matchedStudent.examHistory : []);
          } else {
            setCloudMatchedStudent(null);
            setCloudStudentHistory([]);
          }
        })
        .catch(() => {});
    } else {
      setCloudMatchedStudent(null);
      setCloudStudentHistory([]);
    }

    return () => {
      mounted = false;
    };
  }, [activeUser.phone, activeUser.studentId, activeUser.name, activeUser.isGuest]);

  // Thông tin tài khoản thực tế của học sinh đang đăng nhập / đang xem
  const studentAccountInfo = useMemo(() => {
    const name = cloudMatchedStudent?.name || activeUser.name || 'Học sinh';
    const rawClass = cloudMatchedStudent?.className || activeUser.className || 'Chưa phân lớp';
    const className = rawClass.toUpperCase();
    const studentId = cloudMatchedStudent?.id || activeUser.studentId || '';
    return {
      name,
      className,
      studentId
    };
  }, [cloudMatchedStudent, activeUser.name, activeUser.className, activeUser.studentId]);

  // Practice zone (Khu vực D) states
  const [selectedPracticeNodeId, setSelectedPracticeNodeId] = useState<string>('node-transl-th');
  const [activePracticeQuestions, setActivePracticeQuestions] = useState<Question[]>([]);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>({});
  const [isGeneratingPractice, setIsGeneratingPractice] = useState<boolean>(false);
  const [practiceSubmittedResult, setPracticeSubmittedResult] = useState<{
    correctCount: number;
    totalCount: number;
    newScore10: number;
    updatedScoresChain: number[];
    nodeTitle: string;
    nodeLevel: CognitiveLevelDisplay;
  } | null>(null);

  const practiceSectionRef = useRef<HTMLDivElement>(null);
  const competencyMapRef = useRef<HTMLDivElement>(null);

  // Hợp nhất lịch sử làm bài thực tế của học sinh (Local + Google Sheet 02_KET_QUA_THI)
  const mergedRealHistory = useMemo(() => {
    const rawLocal = Array.isArray(activeUser.examHistory) ? activeUser.examHistory : [];
    const seenKeys = new Set<string>();
    return [...rawLocal, ...cloudStudentHistory].filter(item => {
      if (!item) return false;
      const key =
        item.turnId ||
        `${(item.examId || item.examTitle || '').toString().trim().toLowerCase()}_${item.date || item.submittedAt || ''}_${item.score || 0}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  }, [activeUser.examHistory, cloudStudentHistory]);

  // Kiểm tra xem một lượt làm bài có phải là lượt rèn luyện ngắn (5 câu) hay không
  const isPracticeTurn = (item: any): boolean => {
    const id = String(item?.examId || '').toUpperCase();
    const turn = String(item?.turnId || '').toUpperCase();
    const title = String(item?.examTitle || '').toLowerCase();
    return (
      id.startsWith('PRACTICE_') ||
      id.startsWith('ADAPTIVE_') ||
      turn.startsWith('PRAC_') ||
      turn.startsWith('LT_REMEDIAL_') ||
      title.includes('[rèn luyện]') ||
      title.includes('[bù đắp]')
    );
  };

  // Danh sách các bài kiểm tra định kỳ thực tế học sinh đã làm (Không tính lượt rèn luyện ngắn)
  const completedExamAttempts = useMemo(() => {
    const regularTurns = mergedRealHistory.filter(item => !isPracticeTurn(item));

    const enriched = regularTurns.map((attempt, index) => {
      const rawTitle = (attempt.examTitle || attempt.title || 'Bài kiểm tra Sinh học').toString().trim();
      const rawExamId = (attempt.examId || '').toString().trim();

      // Đối chiếu với đề thi trong hệ thống để lấy đúng tên bài học và YCCĐ
      const matchedExam = systemExams.find(ex => {
        if (rawExamId && String(ex.id).trim().toLowerCase() === rawExamId.toLowerCase()) return true;
        const nExTitle = normalizeViText(ex.title);
        const nExLesson = normalizeViText(ex.lessonName);
        const nAttTitle = normalizeViText(rawTitle);
        if (nAttTitle && (nAttTitle === nExTitle || nAttTitle === nExLesson)) return true;
        if (nAttTitle && nExTitle && (nAttTitle.includes(nExTitle) || nExTitle.includes(nAttTitle))) return true;
        return false;
      });

      const lessonName =
        matchedExam?.lessonName ||
        attempt.lessonName ||
        attempt.competencyProfile?.lessonName ||
        matchedExam?.title ||
        rawTitle;

      const topicName =
        matchedExam?.topic ||
        attempt.competencyProfile?.topic ||
        matchedExam?.lessonName ||
        lessonName;

      const grade =
        matchedExam?.grade ||
        (studentAccountInfo.className.startsWith('10')
          ? 'Lớp 10'
          : studentAccountInfo.className.startsWith('11')
          ? 'Lớp 11'
          : 'Lớp 12');

      const totalQ = Number(attempt.totalQuestions || matchedExam?.questions?.length || 10);
      const correctQ =
        attempt.score !== undefined && attempt.score <= totalQ
          ? Number(attempt.score)
          : attempt.correctCount !== undefined
          ? Number(attempt.correctCount)
          : Math.round(((Number(attempt.score10) || 0) / 10) * totalQ);

      let score10 =
        attempt.score10 !== undefined
          ? Number(attempt.score10)
          : totalQ > 0
          ? Math.round((correctQ / totalQ) * 10 * 10) / 10
          : 0;
      if (score10 > 10 && totalQ > 0) {
        score10 = Math.round((score10 / totalQ) * 10 * 10) / 10;
      }
      score10 = Math.round(score10 * 10) / 10;

      // Tính toán chính xác kết quả theo 3 mức độ nhận thức (Nhận biết, Thông hiểu, Vận dụng) của bài kiểm tra này
      let nbTotal = 0,
        nbCorrect = 0;
      let thTotal = 0,
        thCorrect = 0;
      let vdTotal = 0,
        vdCorrect = 0;

      if (Array.isArray(attempt.details) && attempt.details.length > 0) {
        attempt.details.forEach((d: any, dIdx: number) => {
          const lvl = (d.cognitiveLevel || '').toString().toUpperCase();
          if (lvl === 'NHAN_BIET') {
            nbTotal++;
            if (d.isCorrect) nbCorrect++;
          } else if (lvl === 'THONG_HIEU') {
            thTotal++;
            if (d.isCorrect) thCorrect++;
          } else if (lvl === 'VAN_DUNG') {
            vdTotal++;
            if (d.isCorrect) vdCorrect++;
          } else {
            if (dIdx < Math.ceil(attempt.details.length * 0.4)) {
              nbTotal++;
              if (d.isCorrect) nbCorrect++;
            } else if (dIdx < Math.ceil(attempt.details.length * 0.75)) {
              thTotal++;
              if (d.isCorrect) thCorrect++;
            } else {
              vdTotal++;
              if (d.isCorrect) vdCorrect++;
            }
          }
        });
      } else if (attempt.competencyProfile?.cognitiveStats) {
        const cs = attempt.competencyProfile.cognitiveStats;
        nbTotal = cs.nhanBiet?.total || 0;
        nbCorrect = cs.nhanBiet?.correct || 0;
        thTotal = cs.thongHieu?.total || 0;
        thCorrect = cs.thongHieu?.correct || 0;
        vdTotal = cs.vanDung?.total || 0;
        vdCorrect = cs.vanDung?.correct || 0;
      } else {
        nbTotal = Math.max(1, Math.ceil(totalQ * 0.4));
        thTotal = Math.max(1, Math.ceil(totalQ * 0.35));
        vdTotal = Math.max(1, totalQ - nbTotal - thTotal);

        const hasWrongCols =
          attempt.wrongNhanBiet !== undefined ||
          attempt.wrongThongHieu !== undefined ||
          attempt.wrongVanDung !== undefined;

        if (hasWrongCols) {
          nbCorrect = Math.max(0, nbTotal - (Number(attempt.wrongNhanBiet) || 0));
          thCorrect = Math.max(0, thTotal - (Number(attempt.wrongThongHieu) || 0));
          vdCorrect = Math.max(0, vdTotal - (Number(attempt.wrongVanDung) || 0));
        } else {
          const wrongTotal = Math.max(0, totalQ - correctQ);
          const wNB = Math.min(nbTotal, Math.round(wrongTotal * 0.3));
          const wTH = Math.min(thTotal, Math.round(wrongTotal * 0.35));
          const wVD = Math.min(vdTotal, Math.max(0, wrongTotal - wNB - wTH));
          nbCorrect = Math.max(0, nbTotal - wNB);
          thCorrect = Math.max(0, thTotal - wTH);
          vdCorrect = Math.max(0, vdTotal - wVD);
        }
      }

      const nbScore10 = nbTotal > 0 ? Math.round((nbCorrect / nbTotal) * 10 * 10) / 10 : score10;
      const thScore10 = thTotal > 0 ? Math.round((thCorrect / thTotal) * 10 * 10) / 10 : score10;
      const vdScore10 = vdTotal > 0 ? Math.round((vdCorrect / vdTotal) * 10 * 10) / 10 : score10;

      const rawDate = attempt.date || attempt.submittedAt || '';
      const parsedMs = rawDate ? Date.parse(rawDate) : 0;

      return {
        turnId: attempt.turnId || `ATT_${index}`,
        examId: matchedExam?.id || rawExamId || `EX_${index + 1}`,
        displayCode: formatExamDisplayId(matchedExam?.id || rawExamId, grade, rawTitle),
        examTitle: matchedExam?.title || rawTitle,
        lessonName,
        topicName,
        grade,
        learningObjectives: matchedExam?.learningObjectives || '',
        score10,
        correctCount: correctQ,
        totalQuestions: totalQ,
        dateStr: rawDate,
        timestampMs: !isNaN(parsedMs) && parsedMs > 0 ? parsedMs : 0,
        cognitive: {
          nhanBiet: { total: nbTotal, correct: nbCorrect, score10: nbScore10 },
          thongHieu: { total: thTotal, correct: thCorrect, score10: thScore10 },
          vanDung: { total: vdTotal, correct: vdCorrect, score10: vdScore10 }
        },
        rawAttempt: attempt
      };
    });

    return enriched;
  }, [mergedRealHistory, systemExams, studentAccountInfo.className]);

  // Danh sách từng bài học mà học sinh thực tế đã làm (phục vụ mục "Bài học" và tổng hợp năng lực)
  const completedLessons = useMemo(() => {
    const map = new Map<
      string,
      {
        lessonName: string;
        topicName: string;
        grade: string;
        learningObjectives: string;
        attempts: typeof completedExamAttempts;
        latestScore10: number;
        avgScore10: number;
      }
    >();

    // Duyệt từ cũ -> mới để gom lịch sử theo từng bài học học sinh đã làm
    const chronological = [...completedExamAttempts].reverse();
    chronological.forEach(att => {
      const key = att.lessonName.trim();
      if (!map.has(key)) {
        map.set(key, {
          lessonName: key,
          topicName: att.topicName,
          grade: att.grade,
          learningObjectives: att.learningObjectives,
          attempts: [],
          latestScore10: att.score10,
          avgScore10: att.score10
        });
      }
      const group = map.get(key)!;
      group.attempts.push(att);
      if (!group.learningObjectives && att.learningObjectives) {
        group.learningObjectives = att.learningObjectives;
      }
      group.latestScore10 = att.score10;
      const sum = group.attempts.reduce((s, x) => s + x.score10, 0);
      group.avgScore10 = Math.round((sum / group.attempts.length) * 10) / 10;
    });

    return Array.from(map.values()).reverse();
  }, [completedExamAttempts]);

  // Tự động đồng bộ bài học đang chọn với danh sách bài học thực tế học sinh đã làm
  useEffect(() => {
    if (completedLessons.length > 0) {
      if (!selectedLesson || !completedLessons.some(l => l.lessonName === selectedLesson)) {
        setSelectedLesson(completedLessons[0].lessonName);
      }
    } else {
      setSelectedLesson('');
    }
  }, [completedLessons, selectedLesson]);

  // Xây dựng các vùng năng lực (CompetencyZoneNode) TRỰC TIẾP từ các bài kiểm tra / bài học học sinh đã làm
  const allCompetencyNodes: CompetencyZoneNode[] = useMemo(() => {
    if (completedLessons.length === 0) {
      return [];
    }

    const nodes: CompetencyZoneNode[] = [];
    const levels: CognitiveLevelDisplay[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng'];

    completedLessons.forEach((lessonGroup, lIdx) => {
      const lessonLower = normalizeViText(lessonGroup.lessonName);
      const shortLessonTitle = lessonGroup.lessonName.replace(/^Bài\s*\d+\s*[\:\.\-]\s*/i, '').trim() || lessonGroup.lessonName;

      // Trích xuất YCCĐ từ learningObjectives của đề thi nếu có
      const parsedYccdByLevel: Record<CognitiveLevelDisplay, string[]> = {
        'Nhận biết': [],
        'Thông hiểu': [],
        'Vận dụng': []
      };

      if (lessonGroup.learningObjectives && lessonGroup.learningObjectives.trim().length > 5) {
        let currentLvl: CognitiveLevelDisplay = 'Nhận biết';
        lessonGroup.learningObjectives
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .forEach(line => {
            if (/nhận\s*biết/i.test(line)) currentLvl = 'Nhận biết';
            else if (/thông\s*hiểu/i.test(line)) currentLvl = 'Thông hiểu';
            else if (/vận\s*dụng/i.test(line)) currentLvl = 'Vận dụng';
            else {
              const cleaned = line.replace(/^[\-\*\•\d\.\)]+\s*/, '').trim();
              if (cleaned.length > 5) parsedYccdByLevel[currentLvl].push(cleaned);
            }
          });
      }

      levels.forEach((lvl, lvlIdx) => {
        // Tìm mẫu mô tả chuẩn trong DEFAULT_COMPETENCY_TEMPLATES nếu khớp bài học và mức độ
        const matchedTemplate = DEFAULT_COMPETENCY_TEMPLATES.find(
          t =>
            t.level === lvl &&
            (normalizeViText(t.lessonName) === lessonLower ||
              lessonLower.includes(normalizeViText(t.title)) ||
              normalizeViText(t.lessonName).includes(lessonLower))
        );

        const nodeId = matchedTemplate?.id
          ? `${matchedTemplate.id}-L${lIdx}`
          : `completed-lesson-${lIdx}-${lvlIdx}`;

        // Tổng hợp chuỗi điểm và số câu đúng/tổng câu từ các bài kiểm tra học sinh đã làm ở bài học này
        let totalQuestionsForLevel = 0;
        let correctQuestionsForLevel = 0;
        const chronologicalScores: number[] = [];

        lessonGroup.attempts.forEach(att => {
          const bucket =
            lvl === 'Nhận biết'
              ? att.cognitive.nhanBiet
              : lvl === 'Thông hiểu'
              ? att.cognitive.thongHieu
              : att.cognitive.vanDung;

          if (bucket.total > 0) {
            totalQuestionsForLevel += bucket.total;
            correctQuestionsForLevel += bucket.correct;
            chronologicalScores.push(bucket.score10);
          }
        });

        // Kết hợp thêm các lượt rèn luyện 5 câu tại Khu vực D (nếu học sinh đã rèn luyện vùng này)
        const localRec = practiceRecords[nodeId] || (matchedTemplate ? practiceRecords[matchedTemplate.id] : undefined);
        if (localRec && Array.isArray(localRec.scores) && localRec.scores.length > 0) {
          totalQuestionsForLevel += localRec.totalQuestions || localRec.scores.length * 5;
          correctQuestionsForLevel += localRec.correctQuestions || 0;
          chronologicalScores.push(...localRec.scores);
        }

        const yccdDescription =
          parsedYccdByLevel[lvl].length > 0
            ? parsedYccdByLevel[lvl].join(' ')
            : matchedTemplate?.yccdDescription ||
              (lvl === 'Nhận biết'
                ? `Nhận biết và nêu đúng các khái niệm, thành phần sinh học cốt lõi trong ${lessonGroup.lessonName}.`
                : lvl === 'Thông hiểu'
                ? `Giải thích được cơ chế, nguyên tắc và mối liên hệ giữa các quá trình trong ${lessonGroup.lessonName}.`
                : `Vận dụng kiến thức ${lessonGroup.lessonName} để giải quyết bài tập tình huống và thực tiễn.`);

        if (totalQuestionsForLevel === 0 && chronologicalScores.length === 0) {
          nodes.push({
            id: nodeId,
            title: shortLessonTitle,
            yccdDescription,
            level: lvl,
            topicName: lessonGroup.topicName,
            lessonName: lessonGroup.lessonName,
            grade: lessonGroup.grade,
            score: null,
            status: 'CHUA_DU_DU_LIEU',
            trend: '—',
            evidenceCount: 0,
            correctCount: 0,
            historyScores: [],
            diagnosisText:
              matchedTemplate?.diagnosisText ||
              `Chưa có câu hỏi mức ${lvl} được ghi nhận trong bài kiểm tra ${lessonGroup.lessonName}.`,
            evidenceSummary: 'Chưa đủ dữ liệu câu hỏi ở mức độ này.',
            actionSteps: matchedTemplate?.actionSteps || [
              `Ôn lại kiến thức trọng tâm của ${lessonGroup.lessonName}.`,
              `Luyện tập 5 câu hỏi mức ${lvl} để thu thập dữ liệu năng lực.`
            ],
            priorityGoalText:
              matchedTemplate?.priorityGoalText ||
              `Hoàn thành đánh giá mức ${lvl} cho ${lessonGroup.lessonName}.`,
            keywords: matchedTemplate?.keywords || [shortLessonTitle.toLowerCase(), lessonGroup.lessonName.toLowerCase()]
          });
          return;
        }

        const latestChain =
          chronologicalScores.length > 0
            ? chronologicalScores
            : [Math.round((correctQuestionsForLevel / Math.max(1, totalQuestionsForLevel)) * 10 * 10) / 10];

        const currentScore =
          latestChain.length >= 2
            ? Math.round((latestChain[latestChain.length - 1] * 0.65 + latestChain[latestChain.length - 2] * 0.35) * 10) / 10
            : latestChain[0];

        let trend: '↑' | '→' | '↓' | '—' = '→';
        if (latestChain.length >= 2) {
          const diff = latestChain[latestChain.length - 1] - latestChain[latestChain.length - 2];
          if (diff >= 0.4) trend = '↑';
          else if (diff <= -0.4) trend = '↓';
          else trend = '→';
        }

        let status: CompetencyStatus = 'DANG_HINH_THANH';
        if (currentScore >= 8.0) {
          status = 'ON_DINH';
        } else if (currentScore >= 6.8 || (currentScore >= 6.0 && trend === '↑' && latestChain.length >= 2)) {
          status = 'DANG_TIEN_BO';
        } else if (currentScore >= 5.0) {
          status = 'DANG_HINH_THANH';
        } else {
          status = 'CAN_CUNG_CO';
        }

        nodes.push({
          id: nodeId,
          title: shortLessonTitle,
          yccdDescription,
          level: lvl,
          topicName: lessonGroup.topicName,
          lessonName: lessonGroup.lessonName,
          grade: lessonGroup.grade,
          score: currentScore,
          status,
          trend,
          evidenceCount: totalQuestionsForLevel,
          correctCount: correctQuestionsForLevel,
          historyScores: latestChain.slice(-5),
          diagnosisText:
            matchedTemplate?.diagnosisText ||
            `Qua bài kiểm tra "${lessonGroup.lessonName}", ở mức độ ${lvl}, em đạt ${correctQuestionsForLevel}/${totalQuestionsForLevel} câu đúng (${currentScore
              .toFixed(1)
              .replace('.', ',')} điểm).`,
          evidenceSummary: `Bằng chứng từ bài kiểm tra đã làm: ${correctQuestionsForLevel}/${totalQuestionsForLevel} câu đúng (${lessonGroup.attempts.length} lần kiểm tra).`,
          actionSteps: matchedTemplate?.actionSteps || [
            `Ôn lại lý thuyết cốt lõi của ${lessonGroup.lessonName} ở mức độ ${lvl}.`,
            `Xem lại các câu trả lời sai trong bài kiểm tra ${lessonGroup.lessonName}.`,
            `Luyện tập 5 câu hỏi mục tiêu mức ${lvl} để nâng điểm năng lực.`
          ],
          priorityGoalText:
            matchedTemplate?.priorityGoalText ||
            `Củng cố vững chắc các câu hỏi mức ${lvl} của ${lessonGroup.lessonName}.`,
          keywords: matchedTemplate?.keywords || [shortLessonTitle.toLowerCase(), lessonGroup.lessonName.toLowerCase()]
        });
      });
    });

    return nodes;
  }, [completedLessons, practiceRecords]);

  // Danh sách bài học cho bộ lọc "Bài học" (Chỉ gồm các bài học học sinh đã làm)
  const availableLessons = useMemo(() => {
    return completedLessons.map(l => l.lessonName);
  }, [completedLessons]);

  // Các bài kiểm tra hiển thị theo bộ lọc hiện tại (Tất cả vs Bài học đang chọn)
  const filteredExamAttempts = useMemo(() => {
    if (scopeMode === 'ALL') return completedExamAttempts;
    return completedExamAttempts.filter(att => att.lessonName === selectedLesson);
  }, [completedExamAttempts, scopeMode, selectedLesson]);

  // Filtered competency nodes according to Scope A
  const filteredNodes = useMemo(() => {
    if (scopeMode === 'ALL') return allCompetencyNodes;
    return allCompetencyNodes.filter(n => n.lessonName === selectedLesson);
  }, [allCompetencyNodes, scopeMode, selectedLesson]);

  // Summary counts for Khu vực A
  const overviewStats = useMemo(() => {
    const totalZones = filteredNodes.length;
    const canCungCo = filteredNodes.filter(n => n.status === 'CAN_CUNG_CO').length;
    const dangHinhThanh = filteredNodes.filter(n => n.status === 'DANG_HINH_THANH').length;
    const dangTienBo = filteredNodes.filter(n => n.status === 'DANG_TIEN_BO').length;
    const onDinh = filteredNodes.filter(n => n.status === 'ON_DINH').length;
    const chuaDuDuLieu = filteredNodes.filter(n => n.status === 'CHUA_DU_DU_LIEU').length;
    const hasDataCount = totalZones - chuaDuDuLieu;

    return {
      totalZones,
      hasDataCount,
      canCungCo,
      dangHinhThanh,
      dangTienBo,
      onDinh,
      chuaDuDuLieu
    };
  }, [filteredNodes]);

  // Knowledge gaps for Khu vực C (prioritize CAN_CUNG_CO and DANG_HINH_THANH)
  const knowledgeGapNodes = useMemo(() => {
    const gaps = filteredNodes.filter(
      n => n.status === 'CAN_CUNG_CO' || n.status === 'DANG_HINH_THANH'
    );
    return gaps.sort((a, b) => (a.score ?? 10) - (b.score ?? 10));
  }, [filteredNodes]);

  // Next priorities for Khu vực E (strictly 1-3 top actionable priorities)
  const nextPriorities = useMemo(() => {
    const list: {
      node: CompetencyZoneNode;
      reason: string;
      badge: string;
    }[] = [];

    // 1. Weakest CAN_CUNG_CO node
    const weakest = filteredNodes
      .filter(n => n.status === 'CAN_CUNG_CO')
      .sort((a, b) => (a.score ?? 10) - (b.score ?? 10))[0];
    if (weakest) {
      list.push({
        node: weakest,
        reason: `Mục tiêu: ${weakest.priorityGoalText}`,
        badge: 'Cần củng cố ngay'
      });
    }

    // 2. First DANG_HINH_THANH node (or second CAN_CUNG_CO) to push to DANG_TIEN_BO
    const forming = filteredNodes.find(
      n =>
        (n.status === 'DANG_HINH_THANH' || n.status === 'CAN_CUNG_CO') &&
        !list.some(item => item.node.id === n.id)
    );
    if (forming && list.length < 3) {
      list.push({
        node: forming,
        reason: `Mục tiêu: ${forming.priorityGoalText}`,
        badge: forming.status === 'CAN_CUNG_CO' ? 'Cần củng cố' : 'Đang hình thành → Tiến bộ'
      });
    }

    // 3. Fill remaining slots (up to 3) with CHUA_DU_DU_LIEU nodes to collect real evidence
    const missingDataList = filteredNodes.filter(
      n => n.status === 'CHUA_DU_DU_LIEU' && !list.some(item => item.node.id === n.id)
    );
    for (const mNode of missingDataList) {
      if (list.length >= 3) break;
      list.push({
        node: mNode,
        reason: 'Mục tiêu: Chưa có dữ liệu làm bài — cần thực hiện đánh giá hoặc rèn luyện để ghi nhận năng lực.',
        badge: 'Cần thu thập dữ liệu'
      });
    }

    return list.slice(0, 3);
  }, [filteredNodes]);

  // Ensure selectedPracticeNodeId is valid within filteredNodes
  const activePracticeNode = useMemo(() => {
    return (
      filteredNodes.find(n => n.id === selectedPracticeNodeId) ||
      allCompetencyNodes.find(n => n.id === selectedPracticeNodeId) ||
      filteredNodes[0] ||
      allCompetencyNodes[0]
    );
  }, [filteredNodes, allCompetencyNodes, selectedPracticeNodeId]);

  // Start a 5-question micro-practice session for a chosen node (Khu vực D)
  const handleStartNodePractice = async (node: CompetencyZoneNode, scrollToPractice = true) => {
    setSelectedPracticeNodeId(node.id);
    setPracticeSubmittedResult(null);
    setPracticeAnswers({});

    if (scrollToPractice) {
      setTimeout(() => {
        practiceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }

    // 1. Check curated 5-question bank for immediate, high-accuracy practice
    if (CURATED_NODE_QUESTIONS[node.id] && CURATED_NODE_QUESTIONS[node.id].length >= 5) {
      setActivePracticeQuestions(CURATED_NODE_QUESTIONS[node.id].slice(0, 5));
      return;
    }

    // 2. Check questions from teacher's exams matching topic/lesson
    const matchingExamQuestions: Question[] = [];
    systemExams.forEach(exam => {
      const titleLower = `${exam.title} ${exam.lessonName || ''} ${exam.topic || ''}`.toLowerCase();
      if (
        node.keywords.some(kw => titleLower.includes(kw.toLowerCase())) ||
        titleLower.includes(node.title.toLowerCase())
      ) {
        (exam.questions || []).forEach(q => {
          if (q && q.type === 'MCQ' && q.options && q.options.length >= 2) {
            matchingExamQuestions.push(q);
          }
        });
      }
    });

    if (matchingExamQuestions.length >= 5) {
      setActivePracticeQuestions(matchingExamQuestions.slice(0, 5));
      return;
    }

    // 3. Generate 5 targeted questions via AI or fallback to curated genetics questions
    setIsGeneratingPractice(true);
    try {
      const promptTopic = `${node.title} (${node.yccdDescription}) - Mức độ ${node.level}`;
      const difficultyLevel =
        node.level === 'Nhận biết' ? 'Dễ' : node.level === 'Thông hiểu' ? 'Trung bình' : 'Khó';
      const generated = await generateBiologyQuestions({
        topic: node.title,
        learningObjectives: `${node.title}: ${node.yccdDescription}`,
        count: 5
      });
      if (generated && generated.length > 0) {
        setActivePracticeQuestions(generated.slice(0, 5));
      } else {
        setActivePracticeQuestions((CURATED_NODE_QUESTIONS['node-transl-th'] || []).slice(0, 5));
      }
    } catch {
      setActivePracticeQuestions((CURATED_NODE_QUESTIONS['node-transl-th'] || []).slice(0, 5));
    } finally {
      setIsGeneratingPractice(false);
    }
  };

  // Submit the 5-question practice session -> record new evidence -> re-evaluate score chain
  const handleSubmitPracticeSession = async () => {
    if (!activePracticeNode || activePracticeQuestions.length === 0) return;

    const totalQ = activePracticeQuestions.length;
    let correctQ = 0;
    activePracticeQuestions.forEach(q => {
      const uAns = (practiceAnswers[q.id] || '').trim().toUpperCase();
      const cAns = (q.correctAnswer || '').trim().toUpperCase();
      if (uAns && uAns === cAns) {
        correctQ++;
      }
    });

    const sessionScore10 = Math.round((correctQ / totalQ) * 10 * 10) / 10;
    const prevChain =
      activePracticeNode.historyScores && activePracticeNode.historyScores.length > 0
        ? [...activePracticeNode.historyScores]
        : activePracticeNode.score !== null
        ? [activePracticeNode.score]
        : [];

    // Calculate progressive competency score so repeated practice shows realistic progression (e.g. 4.3 -> 5.1 -> 6.2 -> 7.0)
    const lastScore = prevChain.length > 0 ? prevChain[prevChain.length - 1] : null;
    const blendedNewScore =
      lastScore !== null
        ? Math.round((lastScore * 0.45 + sessionScore10 * 0.55) * 10) / 10
        : sessionScore10;

    const existingRec = practiceRecords[activePracticeNode.id];
    const updatedChain = [...prevChain, blendedNewScore].slice(-6);

    const newRec: PracticeHistoryRecord = {
      nodeId: activePracticeNode.id,
      scores: existingRec ? [...existingRec.scores, blendedNewScore] : [blendedNewScore],
      totalQuestions: (existingRec?.totalQuestions || 0) + totalQ,
      correctQuestions: (existingRec?.correctQuestions || 0) + correctQ,
      lastUpdated: new Date().toISOString()
    };

    const nextRecords = {
      ...practiceRecords,
      [activePracticeNode.id]: newRec
    };
    savePracticeRecord(nextRecords);

    setPracticeSubmittedResult({
      correctCount: correctQ,
      totalCount: totalQ,
      newScore10: blendedNewScore,
      updatedScoresChain: updatedChain,
      nodeTitle: activePracticeNode.title,
      nodeLevel: activePracticeNode.level
    });

    // Also update User examHistory & cloud if logged in
    const newAttempt = {
      turnId: `PRAC_${Date.now()}`,
      examId: `PRACTICE_${activePracticeNode.id}`,
      examTitle: `[Rèn luyện] ${activePracticeNode.title} · ${activePracticeNode.level}`,
      score: correctQ,
      totalQuestions: totalQ,
      score10: sessionScore10,
      date: new Date().toISOString(),
      timeSpentSeconds: 90,
      wrongNhanBiet: activePracticeNode.level === 'Nhận biết' ? totalQ - correctQ : 0,
      wrongThongHieu: activePracticeNode.level === 'Thông hiểu' ? totalQ - correctQ : 0,
      wrongVanDung: activePracticeNode.level === 'Vận dụng' ? totalQ - correctQ : 0,
      details: activePracticeQuestions.map(q => ({
        questionId: q.id,
        questionText: q.text,
        userAnswer: practiceAnswers[q.id] || '',
        correctAnswer: q.correctAnswer,
        isCorrect:
          (practiceAnswers[q.id] || '').trim().toUpperCase() ===
          (q.correctAnswer || '').trim().toUpperCase(),
        cognitiveLevel:
          activePracticeNode.level === 'Nhận biết'
            ? ('NHAN_BIET' as const)
            : activePracticeNode.level === 'Thông hiểu'
            ? ('THONG_HIEU' as const)
            : ('VAN_DUNG' as const)
      }))
    };

    const updatedUser: User = {
      ...activeUser,
      totalScore: (activeUser.totalScore || 0) + correctQ * 10,
      examHistory: [newAttempt, ...(activeUser.examHistory || [])]
    };
    onUpdateUser(updatedUser);

    if (!activeUser.isGuest && activeUser.phone !== 'guest') {
      submitExamResultToCloud(activeUser.phone, newAttempt, {
        studentId: activeUser.studentId,
        name: activeUser.name,
        className: activeUser.className,
        phone: activeUser.phone
      }).catch(() => {});
    }
  };

  return (
    <div className="space-y-7 pb-12">
      {/* Top Drill-Down Bar if Teacher is viewing a Student */}
      {isDrillDown && onBackToAdmin && (
        <div className="bg-emerald-950 text-white px-5 py-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-emerald-800 flex items-center justify-center text-sm font-black">
              👨‍🏫
            </span>
            <div>
              <p className="text-xs text-emerald-300 font-bold uppercase tracking-wider">
                Chế độ Giáo viên xem chi tiết học sinh
              </p>
              <p className="text-sm font-black">
                Học sinh: {activeUser.name} ({activeUser.className})
              </p>
            </div>
          </div>
          <button
            onClick={onBackToAdmin}
            className="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-xl text-xs font-black transition-all border border-white/20 cursor-pointer"
          >
            ← Quay lại Bảng điều khiển Lớp học
          </button>
        </div>
      )}

      {/* Header Banner (Preserves focus-mode styles) */}
      <div
        style={{ height: '168.5px' }}
        className="bg-gradient-to-r from-emerald-800 via-bio-700 to-teal-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden"
      >
        <div className="relative z-10 space-y-3 max-w-2xl">
          <div
            style={{
              paddingTop: '4px',
              paddingLeft: '12px',
              paddingRight: '12px',
              margin: '0px',
              lineHeight: '16px',
              height: '27px'
            }}
            className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md py-1 rounded-full text-xs font-bold tracking-wider uppercase border border-white/20"
          >
            <span>🧬</span> ANALYTICS → HÀNH ĐỘNG HỌC TẬP CÁ NHÂN HÓA
          </div>
          <h2
            style={{ width: '1000px', fontSize: '22px' }}
            className="sm:text-3xl font-black tracking-tight leading-tight"
          >
            Tiến Trình Học Tập & Rèn Luyện Năng Lực Sinh Học — {studentAccountInfo.name} ({studentAccountInfo.className})
          </h2>
          <p className="text-emerald-100 text-xs sm:text-sm leading-relaxed max-w-3xl">
            Chẩn đoán chính xác từng vùng năng lực theo chuẩn YCCĐ 2018 · Phát hiện lỗ hổng kiến thức → Rèn luyện mục tiêu → Thu thập bằng chứng mới → Đánh giá lại sự tiến bộ.
          </p>
        </div>
        <div className="absolute right-6 bottom-4 opacity-15 text-8xl pointer-events-none select-none hidden sm:block">
          🧬
        </div>
      </div>

      {/* =====================================================================
          KHU VỰC A: TỔNG QUAN TIẾN TRÌNH (PROCESS OVERVIEW)
      ===================================================================== */}
      <section className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/90 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                A
              </span>
              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                Tổng quan tiến trình năng lực
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Lọc theo phạm vi chương trình để theo dõi độ phủ dữ liệu và trạng thái từng vùng năng lực.
            </p>
          </div>

          {/* Bộ chọn Tất cả / Bài học */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setScopeMode('ALL')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  scopeMode === 'ALL'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({completedExamAttempts.length} bài kiểm tra)
              </button>
              <button
                onClick={() => setScopeMode('LESSON')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  scopeMode === 'LESSON'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bài học ({completedLessons.length})
              </button>
            </div>

            {scopeMode === 'LESSON' && completedLessons.length > 0 && (
              <select
                value={selectedLesson}
                onChange={e => setSelectedLesson(e.target.value)}
                className="bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-xs sm:text-sm font-bold rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {completedLessons.map(l => (
                  <option key={l.lessonName} value={l.lessonName}>
                    {l.lessonName} ({l.attempts.length} bài kiểm tra · ĐTB: {l.avgScore10.toFixed(1).replace('.', ',')}đ)
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Thanh hiển thị Tài khoản thực tế của học sinh, Số bài kiểm tra đã làm & Độ phủ dữ liệu */}
        <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Tài khoản học sinh:</span>
              <span className="text-slate-900 font-black bg-white px-2.5 py-0.5 rounded-md border border-slate-200">
                {studentAccountInfo.name}
              </span>
              <span>·</span>
              <span className="text-emerald-800 font-black bg-emerald-100/80 px-2.5 py-0.5 rounded-md border border-emerald-200">
                Lớp {studentAccountInfo.className}
              </span>
              {studentAccountInfo.studentId && (
                <>
                  <span>·</span>
                  <span className="text-slate-600 font-bold">Mã HS: {studentAccountInfo.studentId}</span>
                </>
              )}
            </div>

            <div className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2 flex-wrap pt-0.5">
              <span>
                {scopeMode === 'ALL'
                  ? `Tất cả: Đã làm ${completedExamAttempts.length} bài kiểm tra`
                  : selectedLesson
                  ? `Bài học: ${selectedLesson}`
                  : 'Chưa có bài học nào đã làm'}
              </span>
              <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {scopeMode === 'ALL'
                  ? `${completedExamAttempts.length} bài kiểm tra · Đã có dữ liệu: ${overviewStats.hasDataCount}/${overviewStats.totalZones} vùng năng lực`
                  : `${filteredExamAttempts.length} bài kiểm tra · Đã có dữ liệu: ${overviewStats.hasDataCount}/${overviewStats.totalZones} vùng năng lực`}
              </span>
            </div>
          </div>

          {/* Thanh tiến độ phân bổ 5 trạng thái */}
          <div className="w-full md:w-72 space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-600">
              <span>Độ phủ bằng chứng đánh giá</span>
              <span className="font-black text-emerald-700">
                {overviewStats.totalZones > 0
                  ? Math.round((overviewStats.hasDataCount / overviewStats.totalZones) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
              {overviewStats.onDinh > 0 && (
                <div
                  style={{ width: `${(overviewStats.onDinh / overviewStats.totalZones) * 100}%` }}
                  className="bg-emerald-500 h-full"
                  title="Ổn định"
                />
              )}
              {overviewStats.dangTienBo > 0 && (
                <div
                  style={{ width: `${(overviewStats.dangTienBo / overviewStats.totalZones) * 100}%` }}
                  className="bg-sky-500 h-full"
                  title="Đang tiến bộ"
                />
              )}
              {overviewStats.dangHinhThanh > 0 && (
                <div
                  style={{ width: `${(overviewStats.dangHinhThanh / overviewStats.totalZones) * 100}%` }}
                  className="bg-amber-500 h-full"
                  title="Đang hình thành"
                />
              )}
              {overviewStats.canCungCo > 0 && (
                <div
                  style={{ width: `${(overviewStats.canCungCo / overviewStats.totalZones) * 100}%` }}
                  className="bg-rose-500 h-full"
                  title="Cần củng cố"
                />
              )}
            </div>
          </div>
        </div>

        {/* 5 Thẻ trạng thái năng lực (Bao gồm "Chưa đủ dữ liệu" như một trạng thái riêng biệt) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <div className="rounded-2xl p-4 bg-rose-50/70 border border-rose-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-rose-700 uppercase tracking-wider">Cần củng cố</span>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-rose-700">{overviewStats.canCungCo}</span>
              <span className="text-xs font-bold text-rose-600">vùng năng lực</span>
            </div>
            <p className="text-[11px] text-rose-600/90 mt-1 font-medium">
              Ưu tiên ôn lý thuyết & rèn luyện ngay
            </p>
          </div>

          <div className="rounded-2xl p-4 bg-amber-50/70 border border-amber-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-800 uppercase tracking-wider">Đang hình thành</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-amber-700">{overviewStats.dangHinhThanh}</span>
              <span className="text-xs font-bold text-amber-700">vùng năng lực</span>
            </div>
            <p className="text-[11px] text-amber-700/90 mt-1 font-medium">
              Đã hiểu cơ bản nhưng chưa thật vững
            </p>
          </div>

          <div className="rounded-2xl p-4 bg-sky-50/70 border border-sky-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-sky-800 uppercase tracking-wider">Đang tiến bộ</span>
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-sky-700">{overviewStats.dangTienBo}</span>
              <span className="text-xs font-bold text-sky-700">vùng năng lực</span>
            </div>
            <p className="text-[11px] text-sky-700/90 mt-1 font-medium">
              Điểm số tăng rõ qua các lượt làm bài
            </p>
          </div>

          <div className="rounded-2xl p-4 bg-emerald-50/70 border border-emerald-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">Ổn định</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700">{overviewStats.onDinh}</span>
              <span className="text-xs font-bold text-emerald-700">vùng năng lực</span>
            </div>
            <p className="text-[11px] text-emerald-700/90 mt-1 font-medium">
              Đã làm chủ vững vàng yêu cầu cần đạt
            </p>
          </div>

          <div className="rounded-2xl p-4 bg-slate-100/90 border border-slate-300 flex flex-col justify-between col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Chưa đủ dữ liệu</span>
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-slate-700">{overviewStats.chuaDuDuLieu}</span>
              <span className="text-xs font-bold text-slate-600">vùng năng lực</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1 font-medium">
              Cần làm bài để thu thập thêm bằng chứng
            </p>
          </div>
        </div>

        {/* Danh sách thống kê thực tế các bài kiểm tra học sinh đã làm (hiển thị theo chế độ Tất cả hoặc Bài học) */}
        {filteredExamAttempts.length > 0 ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-black uppercase tracking-wider text-slate-500">
                {scopeMode === 'ALL'
                  ? `📋 Thống kê ${filteredExamAttempts.length} bài kiểm tra thực tế ${studentAccountInfo.name} (Lớp ${studentAccountInfo.className}) đã làm`
                  : `📋 Kết quả kiểm tra của bài học: ${selectedLesson} (${filteredExamAttempts.length} bài kiểm tra)`}
              </div>
              {scopeMode === 'ALL' && completedLessons.length > 0 && (
                <span className="text-xs text-slate-500 font-semibold">
                  Bấm vào từng bài kiểm tra để lọc thống kê riêng theo bài học đó
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredExamAttempts.map((att, idx) => (
                <div
                  key={att.turnId || idx}
                  className="rounded-2xl p-4 bg-white border border-slate-200/90 hover:border-emerald-400 transition-all shadow-2xs flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black text-[11px]">
                          Bài kiểm tra #{filteredExamAttempts.length - idx}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px]">
                          Mã đề: {att.displayCode}
                        </span>
                        <span className="text-[11px] text-slate-400 font-semibold">
                          {att.dateStr
                            ? !isNaN(Date.parse(att.dateStr))
                              ? new Date(att.dateStr).toLocaleString('vi-VN')
                              : att.dateStr
                            : 'Đã ghi nhận'}
                        </span>
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-slate-900">
                        {att.lessonName}
                      </h4>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-lg sm:text-xl font-black text-emerald-700">
                        {att.score10.toFixed(1).replace('.', ',')}đ
                      </div>
                      <div className="text-[11px] font-bold text-slate-500">
                        {att.correctCount}/{att.totalQuestions} câu đúng
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                    <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200/70">
                      <span className="text-slate-500 font-semibold block">Nhận biết</span>
                      <span className="font-black text-slate-800">
                        {att.cognitive.nhanBiet.correct}/{att.cognitive.nhanBiet.total} câu (
                        {att.cognitive.nhanBiet.score10.toFixed(1).replace('.', ',')}đ)
                      </span>
                    </div>
                    <div className="bg-indigo-50/50 rounded-lg px-2.5 py-1.5 border border-indigo-100">
                      <span className="text-indigo-600 font-semibold block">Thông hiểu</span>
                      <span className="font-black text-indigo-900">
                        {att.cognitive.thongHieu.correct}/{att.cognitive.thongHieu.total} câu (
                        {att.cognitive.thongHieu.score10.toFixed(1).replace('.', ',')}đ)
                      </span>
                    </div>
                    <div className="bg-purple-50/50 rounded-lg px-2.5 py-1.5 border border-purple-100">
                      <span className="text-purple-600 font-semibold block">Vận dụng</span>
                      <span className="font-black text-purple-900">
                        {att.cognitive.vanDung.correct}/{att.cognitive.vanDung.total} câu (
                        {att.cognitive.vanDung.score10.toFixed(1).replace('.', ',')}đ)
                      </span>
                    </div>
                  </div>

                  {scopeMode === 'ALL' && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => {
                          setSelectedLesson(att.lessonName);
                          setScopeMode('LESSON');
                        }}
                        className="text-xs font-black text-emerald-700 hover:text-emerald-900 cursor-pointer"
                      >
                        Xem thống kê riêng bài học này →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-black text-amber-950">
                Học sinh {studentAccountInfo.name} (Lớp {studentAccountInfo.className}) hiện chưa có bài kiểm tra nào được hoàn thành (0 bài kiểm tra).
              </div>
              <p className="text-xs text-amber-800">
                Khi em hoàn thành các bài kiểm tra trong mục Kiểm Tra, Đánh Giá, hệ thống sẽ tự động thống kê số bài kiểm tra ở mục "Tất cả" và từng bài học cụ thể ở mục "Bài học".
              </p>
            </div>
            <button
              onClick={onNavigateToTest}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2.5 rounded-xl shrink-0 cursor-pointer"
            >
              Làm bài kiểm tra ngay →
            </button>
          </div>
        )}
      </section>

      {/* =====================================================================
          KHU VỰC B: BẢNG BẢN ĐỒ NĂNG LỰC (COMPETENCY MAP)
      ===================================================================== */}
      <section
        ref={competencyMapRef}
        className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/90 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-teal-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                B
              </span>
              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                Bản đồ năng lực theo Yêu cầu cần đạt
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Hiển thị trực quan bằng ngôn ngữ học tập giúp em biết rõ mình đang mạnh hay yếu ở nội dung và mức độ tư duy nào.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="text-emerald-600 font-black">↑</span> Đang tăng
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-slate-600 font-black">→</span> Duy trì
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-slate-400 font-black">—</span> Chưa có dữ liệu
            </span>
          </div>
        </div>

        {filteredNodes.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-2">
            <p className="text-sm font-black text-slate-700">
              Chưa có dữ liệu bản đồ năng lực do học sinh {studentAccountInfo.name} (Lớp {studentAccountInfo.className}) chưa hoàn thành bài kiểm tra nào.
            </p>
            <p className="text-xs text-slate-500">
              Sau khi hoàn thành bài kiểm tra, bản đồ năng lực sẽ tự động hiển thị chi tiết từng Yêu cầu cần đạt của các bài học đã làm.
            </p>
          </div>
        ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4">Yêu cầu cần đạt</th>
                <th className="py-3.5 px-4">Mức độ</th>
                <th className="py-3.5 px-4 text-center">Năng lực</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4 text-center">Xu hướng</th>
                <th className="py-3.5 px-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredNodes.map(node => {
                const st = getStatusConfig(node.status);
                return (
                  <tr
                    key={node.id}
                    className="hover:bg-slate-50/90 transition-colors group"
                  >
                    <td className="py-4 px-4 max-w-md">
                      <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                        {node.lessonName}
                      </div>
                      <div className="font-black text-slate-900 text-sm sm:text-base">
                        {node.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {node.yccdDescription}
                      </div>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                          node.level === 'Nhận biết'
                            ? 'bg-slate-50 text-slate-700 border-slate-200'
                            : node.level === 'Thông hiểu'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {node.level}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {node.score !== null ? (
                        <span className={`text-base font-black ${st.textColor}`}>
                          {node.score.toFixed(1).replace('.', ',')}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-black">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${st.badgeBg}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${st.dotColor}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-black text-sm ${
                          node.trend === '↑'
                            ? 'bg-emerald-50 text-emerald-600'
                            : node.trend === '↓'
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {node.trend}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleStartNodePractice(node, true)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                          node.status === 'CAN_CUNG_CO'
                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                            : node.status === 'CHUA_DU_DU_LIEU'
                            ? 'bg-slate-800 hover:bg-slate-900 text-white'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {node.status === 'CHUA_DU_DU_LIEU' ? 'Làm bài đánh giá' : 'Rèn luyện'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {/* =====================================================================
          KHU VỰC C: LỖ HỔNG KIẾN THỨC / NỘI DUNG CẦN CỦNG CỐ (AI LEARNING DIAGNOSIS)
      ===================================================================== */}
      <section className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/90 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-rose-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                C
              </span>
              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                Chẩn đoán lỗ hổng kiến thức & Nội dung cần củng cố
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Phân tích nguyên nhân cốt lõi từ bằng chứng làm bài và đề xuất lộ trình hành động cụ thể cho từng vùng kiến thức.
            </p>
          </div>
          <span className="text-xs font-black px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 self-start sm:self-auto">
            🔬 AI Learning Diagnosis
          </span>
        </div>

        {overviewStats.hasDataCount === 0 ? (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 sm:p-8 text-center space-y-3">
            <div className="text-3xl">📭</div>
            <h4 className="text-base sm:text-lg font-black text-slate-800">
              Chưa có dữ liệu làm bài để chẩn đoán lỗ hổng kiến thức
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Hiện tại tài khoản học sinh <strong>{studentAccountInfo.name}</strong> (Lớp <strong>{studentAccountInfo.className}</strong>) chưa có bài kiểm tra nào được hoàn thành (<strong>{completedExamAttempts.length} bài kiểm tra</strong>). Hãy làm bài kiểm tra định kỳ ở mục Kiểm Tra, Đánh Giá để hệ thống thu thập bằng chứng thực tế!
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={onNavigateToTest}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs sm:text-sm px-4 py-2.5 rounded-xl transition cursor-pointer"
              >
                Đi tới Kiểm Tra, Đánh Giá →
              </button>
              {activePracticeNode && (
                <button
                  onClick={() => handleStartNodePractice(activePracticeNode, true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm px-4 py-2.5 rounded-xl transition cursor-pointer"
                >
                  Làm 5 câu đánh giá ngay ↓
                </button>
              )}
            </div>
          </div>
        ) : knowledgeGapNodes.length === 0 ? (
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
            <div className="text-3xl">🌟</div>
            <h4 className="text-base font-black text-emerald-950">
              Không phát hiện lỗ hổng nghiêm trọng trong các vùng đã có dữ liệu!
            </h4>
            <p className="text-xs sm:text-sm text-emerald-800 max-w-xl mx-auto">
              Các vùng năng lực đã kiểm tra đều đạt trạng thái Đang tiến bộ hoặc Ổn định. Em có thể chọn các vùng "Chưa đủ dữ liệu" để tiếp tục mở rộng đánh giá.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {knowledgeGapNodes.map(gap => {
              const st = getStatusConfig(gap.status);
              return (
                <div
                  key={gap.id}
                  className={`rounded-2xl p-5 sm:p-6 border-2 ${st.cardBorder} bg-gradient-to-br from-white to-rose-50/25 flex flex-col justify-between space-y-4 shadow-xs`}
                >
                  <div className="space-y-3">
                    {/* Tiêu đề & Nhãn trạng thái */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {gap.lessonName}
                        </span>
                        <h4 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                          Cơ chế {gap.title.toLowerCase()} · {gap.level}
                        </h4>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${st.badgeBg}`}
                      >
                        <span>{st.emoji}</span> {st.label}
                        {gap.score !== null && (
                          <span className="ml-1 font-black">
                            ({gap.score.toFixed(1).replace('.', ',')}đ)
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Nhận định chuyên môn */}
                    <div className="bg-white rounded-xl p-4 border border-slate-200/80 space-y-2">
                      <p className="text-sm text-slate-800 font-semibold leading-relaxed">
                        {gap.diagnosisText}
                      </p>
                      <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                        <span>📊</span> {gap.evidenceSummary}
                      </p>
                    </div>

                    {/* Em nên làm gì? */}
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-black uppercase tracking-wider text-slate-700">
                        Em nên làm gì?
                      </div>
                      <ol className="space-y-1.5 text-xs sm:text-sm text-slate-700 font-medium">
                        {gap.actionSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-medium">
                      Lượt luyện ngắn: 5 câu trọng tâm
                    </span>
                    <button
                      onClick={() => handleStartNodePractice(gap, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-2"
                    >
                      <span>Bắt đầu rèn luyện</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =====================================================================
          KHU VỰC D: RÈN LUYỆN CÁ NHÂN HÓA (PERSONALIZED PRACTICE LOOP)
          Chu trình: Phát hiện lỗ hổng → Rèn luyện → Thu thập bằng chứng mới → Đánh giá lại
      ===================================================================== */}
      <section
        ref={practiceSectionRef}
        className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border-2 border-emerald-600/25 space-y-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-emerald-700 text-white font-black text-xs flex items-center justify-center shadow-xs">
                D
              </span>
              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                Rèn luyện cá nhân hóa tại chỗ
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Chu trình khép kín: Chọn vùng năng lực → Làm lượt luyện ngắn 5 câu → Ghi nhận bằng chứng mới → Đánh giá lại sự tiến bộ.
            </p>
          </div>

          {/* Chọn vùng năng lực để rèn luyện */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={activePracticeNode?.id || ''}
              onChange={e => {
                const found = allCompetencyNodes.find(n => n.id === e.target.value);
                if (found) {
                  setSelectedPracticeNodeId(found.id);
                  setActivePracticeQuestions([]);
                  setPracticeSubmittedResult(null);
                }
              }}
              className="bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm font-black rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {filteredNodes.map(n => (
                <option key={n.id} value={n.id}>
                  {n.title} · {n.level} ({getStatusConfig(n.status).label})
                </option>
              ))}
            </select>

            <button
              onClick={() => activePracticeNode && handleStartNodePractice(activePracticeNode, false)}
              disabled={isGeneratingPractice}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              {isGeneratingPractice ? 'Đang tạo 5 câu...' : 'Rèn luyện ngay (5 câu)'}
            </button>
          </div>
        </div>

        {/* Thẻ tóm tắt vùng năng lực đang chọn & Chuỗi tiến bộ qua các lần rèn luyện */}
        {activePracticeNode && (
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/90 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-base sm:text-lg font-black text-slate-900">
                  {activePracticeNode.title} · {activePracticeNode.level}
                </span>
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-black border ${
                    getStatusConfig(activePracticeNode.status).badgeBg
                  }`}
                >
                  Trạng thái: {getStatusConfig(activePracticeNode.status).label}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600">
                {activePracticeNode.yccdDescription}
              </p>
            </div>

            {/* Sơ đồ chuỗi điểm tiến bộ (Ví dụ: 4.3 ── 5.1 ── 6.2 ── 7.0 ↑ Đang tiến bộ) */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shrink-0 min-w-[260px]">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                Lịch sử biến đổi năng lực vùng này
              </div>
              {activePracticeNode.historyScores.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {activePracticeNode.historyScores.map((sc, idx) => {
                      const isLast = idx === activePracticeNode.historyScores.length - 1;
                      return (
                        <React.Fragment key={idx}>
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                              isLast
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {sc.toFixed(1).replace('.', ',')}
                          </span>
                          {!isLast && <span className="text-slate-300 font-black">──</span>}
                        </React.Fragment>
                      );
                    })}
                    <span className="ml-1 text-emerald-600 font-black text-sm">
                      {activePracticeNode.trend}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-emerald-700">
                    {activePracticeNode.historyScores.length >= 2
                      ? `Hiệu quả: ${getStatusConfig(activePracticeNode.status).label} sau ${
                          activePracticeNode.historyScores.length
                        } lần ghi nhận`
                      : 'Hãy hoàn thành thêm lượt luyện để tạo chuỗi tiến bộ'}
                  </div>
                </div>
              ) : (
                <div className="text-xs font-bold text-slate-500">
                  Chưa có điểm lịch sử — Bấm [Rèn luyện ngay] để ghi nhận mốc đầu tiên!
                </div>
              )}
            </div>
          </div>
        )}

        {/* Khung làm 5 câu hỏi rèn luyện hoặc kết quả vừa nộp */}
        {isGeneratingPractice && (
          <div className="py-12 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-bold text-slate-600">
              Hệ thống đang thiết kế 5 câu hỏi rèn luyện bám sát "{activePracticeNode?.title} · {activePracticeNode?.level}"...
            </p>
          </div>
        )}

        {!isGeneratingPractice && activePracticeQuestions.length === 0 && !practiceSubmittedResult && (
          <div className="bg-emerald-50/50 border border-dashed border-emerald-300 rounded-2xl p-6 text-center space-y-3">
            <p className="text-sm font-bold text-slate-700">
              Sẵn sàng rèn luyện vùng năng lực:{' '}
              <span className="text-emerald-800 font-black">
                {activePracticeNode?.title} · {activePracticeNode?.level}
              </span>
            </p>
            <button
              onClick={() => activePracticeNode && handleStartNodePractice(activePracticeNode, false)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              [Rèn luyện ngay — 5 câu ngắn]
            </button>
          </div>
        )}

        {!isGeneratingPractice && activePracticeQuestions.length > 0 && (
          <div className="space-y-5">
            {practiceSubmittedResult && (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-200/70 px-3 py-1 rounded-full">
                    ✓ Kết quả mới đã được ghi nhận
                  </div>
                  <h4 className="text-lg sm:text-xl font-black text-slate-900">
                    Đạt {practiceSubmittedResult.correctCount}/{practiceSubmittedResult.totalCount} câu đúng · Năng lực hiện tại:{' '}
                    <span className="text-emerald-700">
                      {practiceSubmittedResult.newScore10.toFixed(1).replace('.', ',')} điểm
                    </span>
                  </h4>
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 flex-wrap pt-1">
                    <span>Chuỗi tiến trình:</span>
                    {practiceSubmittedResult.updatedScoresChain.map((s, i) => (
                      <React.Fragment key={i}>
                        <span
                          className={`px-2 py-0.5 rounded font-black ${
                            i === practiceSubmittedResult.updatedScoresChain.length - 1
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-700'
                          }`}
                        >
                          {s.toFixed(1).replace('.', ',')}
                        </span>
                        {i < practiceSubmittedResult.updatedScoresChain.length - 1 && (
                          <span className="text-slate-400">──</span>
                        )}
                      </React.Fragment>
                    ))}
                    <span className="text-emerald-700 font-black">↑ Đã cập nhật Bản đồ năng lực</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() =>
                      competencyMapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    className="bg-white hover:bg-slate-50 text-emerald-800 border border-emerald-300 font-black text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    [Xem tiến trình]
                  </button>
                  <button
                    onClick={() => activePracticeNode && handleStartNodePractice(activePracticeNode, false)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    Luyện tiếp lượt mới
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {activePracticeQuestions.map((q, idx) => {
                const selectedAns = practiceAnswers[q.id] || '';
                const isSubmitted = Boolean(practiceSubmittedResult);
                return (
                  <div
                    key={q.id}
                    className="rounded-2xl p-5 border border-slate-200 bg-slate-50/60 space-y-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="w-7 h-7 rounded-lg bg-emerald-700 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-sm sm:text-base font-bold text-slate-900 leading-relaxed">
                        {formatDisplayQuestionText(q.text, { stripLeadingCau: true })}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-0 sm:pl-10">
                      {(q.options || []).map((opt, oIdx) => {
                        const isSelected = selectedAns === opt;
                        const isCorrectOpt =
                          opt.trim().toUpperCase() === (q.correctAnswer || '').trim().toUpperCase();

                        let btnStyle =
                          'bg-white border-slate-200 text-slate-700 hover:border-emerald-400';
                        if (isSubmitted) {
                          if (isCorrectOpt) {
                            btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-black';
                          } else if (isSelected && !isCorrectOpt) {
                            btnStyle = 'bg-rose-50 border-rose-400 text-rose-800 line-through';
                          }
                        } else if (isSelected) {
                          btnStyle = 'bg-emerald-600 border-emerald-600 text-white font-black shadow-xs';
                        }

                        return (
                          <button
                            key={oIdx}
                            disabled={isSubmitted}
                            onClick={() =>
                              setPracticeAnswers(prev => ({
                                ...prev,
                                [q.id]: opt
                              }))
                            }
                            className={`text-left p-3.5 rounded-xl border text-xs sm:text-sm transition-all cursor-pointer flex items-start gap-2.5 ${btnStyle}`}
                          >
                            <span className="font-black opacity-75">
                              {String.fromCharCode(65 + oIdx)}.
                            </span>
                            <span className="flex-1">{opt}</span>
                          </button>
                        );
                      })}
                    </div>

                    {isSubmitted && q.explanation && (
                      <div className="pl-0 sm:pl-10 pt-1">
                        <div className="bg-white rounded-xl p-3.5 border border-emerald-200 text-xs text-slate-700 leading-relaxed">
                          <span className="font-black text-emerald-800">💡 Giải thích chuẩn YCCĐ: </span>
                          {q.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!practiceSubmittedResult && (
              <div className="flex items-center justify-between gap-4 pt-2">
                <span className="text-xs font-bold text-slate-500">
                  Đã chọn {Object.keys(practiceAnswers).length}/{activePracticeQuestions.length} câu
                </span>
                <button
                  onClick={handleSubmitPracticeSession}
                  disabled={Object.keys(practiceAnswers).length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-sm px-6 py-3 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Nộp bài rèn luyện & Cập nhật năng lực
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* =====================================================================
          KHU VỰC E: GỢI Ý VÀ MỤC TIÊU TIẾP THEO (1–3 ƯU TIÊN HÀNH ĐỘNG)
      ===================================================================== */}
      <section className="bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center">
                E
              </span>
              <h3 className="text-lg sm:text-xl font-black text-white">
                Gợi ý và mục tiêu tiếp theo (1–3 ưu tiên trọng tâm)
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-emerald-200/80 mt-1">
              Tập trung giải quyết dứt điểm tối đa 3 mục tiêu ưu tiên nhất để chuyển hóa dữ liệu phân tích thành sự tiến bộ thực chất.
            </p>
          </div>
        </div>

        {nextPriorities.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-black text-amber-300">
                🎯 Mục tiêu ưu tiên cho {studentAccountInfo.name} (Lớp {studentAccountInfo.className})
              </div>
              <p className="text-xs sm:text-sm text-emerald-100/90">
                Hoàn thành bài kiểm tra đầu tiên trong mục Kiểm Tra, Đánh Giá để hệ thống xác định vùng năng lực ưu tiên cần củng cố theo từng bài học đã làm.
              </p>
            </div>
            <button
              onClick={onNavigateToTest}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm px-5 py-2.5 rounded-xl transition-all cursor-pointer shrink-0"
            >
              Đi tới Kiểm Tra, Đánh Giá →
            </button>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {nextPriorities.map((item, idx) => (
            <div
              key={item.node.id}
              className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                    🎯 Ưu tiên {idx + 1}
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/15 text-emerald-100">
                    {item.badge}
                  </span>
                </div>
                <h4 className="text-base font-black text-white">
                  {item.node.title} · {item.node.level}
                </h4>
                <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
                  {item.reason}
                </p>
              </div>

              <button
                onClick={() => handleStartNodePractice(item.node, true)}
                className="w-full bg-white/15 hover:bg-white/25 text-white font-black text-xs py-2.5 px-4 rounded-xl border border-white/20 transition-all cursor-pointer text-center"
              >
                Rèn luyện ưu tiên {idx + 1} →
              </button>
            </div>
          ))}
        </div>
        )}

        {nextPriorities.length > 0 && (
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-white/10">
            <div className="text-xs sm:text-sm text-emerald-200">
              Bấm nút bên phải để bắt đầu ngay lượt rèn luyện 5 câu cho{' '}
              <strong className="text-white">
                Ưu tiên 1 ({nextPriorities[0].node.title} · {nextPriorities[0].node.level})
              </strong>
              .
            </div>
            <button
              onClick={() => handleStartNodePractice(nextPriorities[0].node, true)}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm px-6 py-3 rounded-xl shadow-md transition-all cursor-pointer shrink-0"
            >
              [Bắt đầu rèn luyện ưu tiên 1]
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
