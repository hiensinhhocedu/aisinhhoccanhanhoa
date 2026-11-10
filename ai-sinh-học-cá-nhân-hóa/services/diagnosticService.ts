import { Exam, Question, User, UserRole, StudentCompetencyProfile, DiagnosticErrorItem, RemedialTopicLesson } from '../types';
import {
  getGradeAndLessonKey,
  getLessonNormalizedKey,
  extractCoreTopic,
  isStandardExamId,
  getExamGrade,
  getStudentGrade
} from './dataService';

/**
 * Phân tích câu hỏi và suy luận nguyên nhân sai dựa trên nội dung câu hỏi và dạng bài
 */
export const diagnoseErrorReason = (
  q: Question,
  userAnswer: string,
  cognitiveLevel: 'NHAN_BIET' | 'THONG_HIEU' | 'VAN_DUNG'
): { concept: string; reason: string; explanation: string } => {
  const text = q.text || '';
  const textLower = text.toLowerCase();
  let concept = 'Kiến thức cốt lõi Sinh học';
  let reason = 'Chưa nắm vững định nghĩa chuẩn trong SGK Kết nối tri thức';
  let explanation = q.explanation || 'Cần đọc lại nội dung bài học và ghi nhớ các từ khóa quan trọng.';

  // Trích xuất khái niệm từ câu hỏi
  if (textLower.includes('cấp độ tổ chức') || textLower.includes('thế giới sống')) {
    concept = 'Các cấp độ tổ chức của thế giới sống';
    if (q.type === 'TF') {
      reason = 'Mắc bẫy khẳng định tuyệt đối (ví dụ từ "duy nhất"). Tế bào có nhiều hình thức phân bào: nguyên phân, giảm phân, trực phân.';
    } else {
      reason = 'Nhầm lẫn giữa các cấp độ cơ bản (tế bào, cơ thể, quần thể, quần xã, hệ sinh thái) và các cấp độ dưới tế bào.';
    }
  } else if (textLower.includes('trao đổi nước') || textLower.includes('khoáng') || textLower.includes('khí khổng')) {
    concept = 'Trao đổi nước và khoáng ở thực vật';
    reason = 'Chưa hiểu rõ cơ chế thẩm thấu thụ động và động lực hút nước từ rễ lên lá do thoát hơi nước ở khí khổng.';
  } else if (textLower.includes('trao đổi chất') || textLower.includes('chuyển hoá năng lượng') || textLower.includes('atp')) {
    concept = 'Trao đổi chất và chuyển hóa năng lượng';
    reason = 'Nhầm lẫn giữa đồng hóa (tổng hợp chất, tích lũy năng lượng) và dị hóa (phân giải chất, giải phóng ATP).';
  } else if (textLower.includes('gene') || textLower.includes('phiên mã') || textLower.includes('dịch mã') || textLower.includes('dna')) {
    concept = 'Cơ chế truyền đạt thông tin di truyền ở cấp độ phân tử';
    reason = 'Nhầm lẫn nguyên tắc bổ sung (A-U, T-A, G-C, C-G trong phiên mã) hoặc tính chất của mã di truyền (tính thoái hóa, đặc hiệu).';
  } else if (textLower.includes('quang hợp') || textLower.includes('pha sáng') || textLower.includes('pha tối')) {
    concept = 'Quang hợp ở thực vật';
    reason = 'Chưa phân biệt được sản phẩm của pha sáng (ATP, NADPH, O2) cung cấp cho pha tối (chu trình Calvin).';
  } else if (textLower.includes('hô hấp') || textLower.includes('krebs') || textLower.includes('đường phân')) {
    concept = 'Hô hấp ở thực vật và động vật';
    reason = 'Chưa nhớ rõ vị trí xảy ra của 3 giai đoạn: Đường phân (bào tương), chu trình Krebs (chất nền ty thể), chuỗi chuyền electron (màng trong ty thể).';
  } else if (textLower.includes('di truyền') || textLower.includes('men-đen') || textLower.includes('nhiễm sắc thể')) {
    concept = 'Quy luật di truyền & Di truyền nhiễm sắc thể';
    reason = 'Sai sót trong suy luận logic tỷ lệ kiểu gen, kiểu hình hoặc nhầm lẫn giữa phân li độc lập và liên kết gen.';
  } else if (textLower.includes('sinh thái') || textLower.includes('quần thể') || textLower.includes('quần xã')) {
    concept = 'Sinh thái học cá thể, quần thể & quần xã';
    reason = 'Chưa phân biệt được mối quan hệ giữa các cá thể trong loài (hỗ trợ, cạnh tranh) hoặc mối quan hệ khác loài trong quần xã.';
  } else {
    // Trích lọc tên bài hoặc cụm từ đầu câu hỏi
    const match = text.match(/^(?:Câu\s*\d+[\.\:\-]\s*)?([^,\.\?\;\n]+)/i);
    if (match && match[1]) {
      concept = match[1].replace(/\[.*?\]/g, '').trim();
    }
  }

  if (cognitiveLevel === 'VAN_DUNG') {
    reason += ' • Khó khăn trong việc vận dụng kiến thức lý thuyết để giải thích hiện tượng thực tiễn hoặc tính toán thông số.';
  } else if (cognitiveLevel === 'THONG_HIEU') {
    reason += ' • Hiểu chưa thấu đáo bản chất sinh học, dễ bị phân vân giữa 2 phương án đối lập.';
  } else {
    reason += ' • Bỏ quên định nghĩa chuẩn trong sách giáo khoa, cần ôn lại định nghĩa nền tảng.';
  }

  return { concept, reason, explanation };
};

/**
 * Xây dựng nội dung bài học củng cố chi tiết theo từng YCCĐ và lỗi sai học sinh mắc phải
 */
export const buildDetailedYccdRemedialLessons = (
  topic: string,
  errorItems: DiagnosticErrorItem[] = [],
  objectivesText?: string
): RemedialTopicLesson[] => {
  const tLower = (topic || '').toLowerCase();

  // 1. CHỦ ĐỀ: BÀI 3 - CÁC CẤP ĐỘ TỔ CHỨC CỦA THẾ GIỚI SỐNG (SINH HỌC 10)
  if (tLower.includes('cấp độ tổ chức') || tLower.includes('thế giới sống')) {
    const lessons: RemedialTopicLesson[] = [];
    
    // YCCĐ 1: Nhận biết
    const hasNbError = errorItems.some(e => e.cognitiveLevel === 'NHAN_BIET' || e.weakConcept.toLowerCase().includes('khái niệm') || e.weakConcept.toLowerCase().includes('cơ bản'));
    const nbErrors = errorItems.filter(e => e.cognitiveLevel === 'NHAN_BIET' || e.weakConcept.toLowerCase().includes('khái niệm'));
    
    lessons.push({
      topic: 'Khái Niệm & 5 Cấp Độ Tổ Chức Sống Cơ Bản',
      yccdCode: 'YCCD_1.1',
      cognitiveLevel: 'Nhận biết',
      yccdText: 'Nêu được khái niệm cấp độ tổ chức sống; Liệt kê được 5 cấp độ tổ chức sống cơ bản: tế bào, cơ thể, quần thể, quần xã, hệ sinh thái; Nhận biết tế bào là đơn vị cấu trúc và chức năng nhỏ nhất của sự sống.',
      relatedQuestions: nbErrors.map(e => e.questionIndex || 1).filter((v, i, a) => a.indexOf(v) === i),
      relatedErrorItems: nbErrors,
      coreTheory: `1. Định nghĩa Cấp độ tổ chức sống: Là cấp độ tổ chức của vật chất có biểu hiện đầy đủ các đặc tính của sự sống như trao đổi chất và năng lượng, sinh trưởng, phát triển, sinh sản, cảm ứng, tự điều chỉnh và tiến hóa.\n2. 5 Cấp độ tổ chức sống cơ bản (từ thấp đến cao): Tế bào → Cơ thể → Quần thể → Quần xã → Hệ sinh thái.\n3. Vì sao Tế bào là đơn vị cơ bản nhỏ nhất? Vì mọi cơ thể sống (từ vi khuẩn đơn bào đến con người đa bào) đều được cấu tạo từ một hoặc nhiều tế bào. Các cấp độ dưới tế bào (phân tử DNA, protein, bào quan ty thể, lục lạp) tuy rất quan trọng nhưng khi tách rời riêng lẻ không biểu hiện đầy đủ đặc tính của một cơ thể sống độc lập.`,
      practicalExample: `💡 Ví dụ thực tế minh họa & Bài tập mẫu:\n• Cấp tế bào: 1 tế bào vi khuẩn E. coli, 1 tế bào biểu bì hành tây, 1 tế bào hồng cầu người.\n• Cấp cơ thể: 1 cây phượng vĩ trong sân trường, 1 con hổ Đông Dương trong rừng.\n• Cấp quần thể: Toàn bộ các cá thể cá rô phi sống trong một cái ao (phải cùng loài, cùng không gian và thời gian xác định).\n• Cấp quần xã: Toàn bộ cá rô phi, rong đuôi chó, bèo tây, ốc, vi khuẩn cùng sống trong cái ao đó (tập hợp nhiều quần thể khác loài).\n• Cấp hệ sinh thái: Quần xã sinh vật trong ao + Môi trường vô sinh (nước, bùn đáy, ánh sáng, nhiệt độ, oxy hòa tan).`,
      commonTrap: `⚠️ Cạm bẫy đề thi cần tránh tuyệt đối:\n- Bẫy 1: Coi "Phân tử" hoặc "Bào quan" là cấp độ sống cơ bản (Sai! Cấp độ cơ bản nhỏ nhất bắt buộc phải là TẾ BÀO).\n- Bẫy 2: Nhầm giữa Quần xã và Hệ sinh thái. Quần xã chỉ gồm các thành phần hữu sinh (sinh vật); khi cộng thêm sinh cảnh (môi trường vô sinh: đất, nước, không khí) thì mới thành Hệ sinh thái.\n- Bẫy 3: Khẳng định phân bào "duy nhất là nguyên phân" (Sai! Tế bào còn phân bào bằng giảm phân tạo giao tử và trực phân ở vi khuẩn).`,
      diagramOrKeyNote: `📌 Sơ đồ bậc thang thứ bậc:\n[Phân tử] → [Bào quan] → [TẾ BÀO] (Đơn vị sống cơ bản nhỏ nhất) → [Mô] → [Cơ quan] → [Hệ cơ quan] → [CƠ THỂ] → [QUẦN THỂ] (Cùng loài) → [QUẦN XÃ] (Nhiều loài) → [HỆ SINH THÁI] (Quần xã + Môi trường vô sinh).`
    });

    // YCCĐ 2: Thông hiểu
    const thErrors = errorItems.filter(e => e.cognitiveLevel === 'THONG_HIEU' || e.weakConcept.toLowerCase().includes('đặc điểm') || e.weakConcept.toLowerCase().includes('thứ bậc') || e.weakConcept.toLowerCase().includes('hệ thống mở'));
    if (thErrors.length > 0 || errorItems.length === 0) {
      lessons.push({
        topic: '3 Đặc Điểm Chung Của Các Cấp Độ Tổ Chức Sống',
        yccdCode: 'YCCD_2.1',
        cognitiveLevel: 'Thông hiểu',
        yccdText: 'Trình bày và giải thích được 3 đặc tính chung cốt lõi của các cấp độ tổ chức sống: Tổ chức theo nguyên tắc thứ bậc (xuất hiện đặc tính nổi trội), Hệ thống mở và tự điều chỉnh, Liên tục tiến hóa.',
        relatedQuestions: thErrors.map(e => e.questionIndex || 2).filter((v, i, a) => a.indexOf(v) === i),
        relatedErrorItems: thErrors,
        coreTheory: `1. Tổ chức theo nguyên tắc thứ bậc: Cấp độ dưới làm nền tảng để cấu thành cấp độ trên. Ở mỗi cấp độ cao hơn luôn xuất hiện những đặc tính mới (gọi là "Đặc tính nổi trội") mà cấp độ dưới riêng lẻ không có.\n2. Hệ thống mở và tự điều chỉnh: Sinh vật luôn trao đổi chất và năng lượng với môi trường ngoài (hệ thống mở). Cơ thể duy trì cân bằng động nội môi (nhiệt độ, pH, đường huyết) thông qua cơ chế tự điều chỉnh bằng phản xạ và thể dịch (hormone).\n3. Liên tục tiến hóa: Sinh giới không ngừng biến đổi qua hàng tỉ năm nhờ cơ chế phát sinh biến dị di truyền và chọn lọc tự nhiên, tạo nên tính đa dạng sinh học phong phú thích nghi với điều kiện sống.`,
        practicalExample: `💡 Ví dụ minh họa bản chất cơ chế:\n• Ví dụ đặc tính nổi trội: Các tế bào thần kinh (neuron) riêng rẽ chỉ có tính hưng phấn và dẫn truyền; nhưng khi hàng tỉ neuron liên kết thành bộ não người thì xuất hiện đặc tính nổi trội là tư duy, ngôn ngữ, trí nhớ và ý thức.\n• Ví dụ tự điều chỉnh cân bằng nội môi: Khi em chạy bộ đường dài, cơ thể sinh nhiệt lớn → Hệ thần kinh điều khiển tuyến mồ hôi tiết mồ hôi ra da để thoát hơi nước làm mát cơ thể, mạch máu dưới da dãn ra để tỏa nhiệt, tim đập nhanh hơn để tăng cường bơm máu mang oxy đến cơ bắp.`,
        commonTrap: `⚠️ Cạm bẫy câu hỏi Thông hiểu:\n- Bẫy khẳng định tuyệt đối: "Hệ thống sống là hệ thống kín để bảo vệ nội môi" (Sai hoàn toàn! Hệ thống sống bắt buộc là HỆ THỐNG MỞ, nếu khép kín không trao đổi chất và năng lượng thì sinh vật sẽ chết).\n- Bẫy đặc tính nổi trội: Cho rằng đặc tính nổi trội là do cộng gộp đơn thuần tính chất của cấp dưới (Sai! Đặc tính nổi trội phát sinh do sự tương tác qua lại phức tạp giữa các thành phần).`,
        diagramOrKeyNote: `📌 Điểm cốt lõi ghi nhớ:\n• Nguyên tắc thứ bậc → Phát sinh đặc tính nổi trội.\n• Hệ thống mở → Luôn trao đổi chất & năng lượng với môi trường ngoài.\n• Tự điều chỉnh → Duy trì cân bằng động nội môi (homeostasis).`
      });
    }

    // YCCĐ 3: Vận dụng
    const vdErrors = errorItems.filter(e => e.cognitiveLevel === 'VAN_DUNG' || e.weakConcept.toLowerCase().includes('vận dụng') || e.weakConcept.toLowerCase().includes('thực tế') || e.weakConcept.toLowerCase().includes('bảo tồn'));
    if (vdErrors.length > 0 || errorItems.length === 0) {
      lessons.push({
        topic: 'Vận Dụng Hiểu Biết Cấp Độ Sống Vào Thực Tiễn & Bảo Tồn Sinh Thái',
        yccdCode: 'YCCD_3.1',
        cognitiveLevel: 'Vận dụng',
        yccdText: 'Vận dụng mối quan hệ giữa các cấp độ tổ chức sống để giải thích các hiện tượng thực tế trong tự nhiên, xây dựng lối sống lành mạnh và đề xuất biện pháp bảo tồn hệ sinh thái.',
        relatedQuestions: vdErrors.map(e => e.questionIndex || 3).filter((v, i, a) => a.indexOf(v) === i),
        relatedErrorItems: vdErrors,
        coreTheory: `Mối quan hệ giữa các cấp độ sống: Tác động ở một cấp độ nhỏ có thể dẫn đến biến đổi lớn ở cấp độ cao hơn. Ví dụ ô nhiễm hóa chất ở cấp phân tử/tế bào sẽ làm suy giảm sức đề kháng của cơ thể, dẫn đến suy giảm kích thước quần thể, làm thay đổi cấu trúc lưới thức ăn của quần xã và suy thoái cả hệ sinh thái. Do đó, bảo vệ môi trường sống (sinh cảnh) là chìa khóa then chốt để duy trì sự cân bằng của toàn bộ sinh giới.`,
        practicalExample: `💡 Tình huống thực tế ứng dụng:\nKhi nông dân phun thuốc trừ sâu hóa học quá liều: Thuốc diệt cả côn trùng có hại lẫn côn trùng có ích (ong, bướm, bọ rùa). Côn trùng ăn sâu bị ngộ độc và chết, chim ăn sâu giảm số lượng, dẫn đến sâu hại bùng phát dữ dội hơn do mất đi thiên địch tự nhiên. Giải pháp bảo tồn: Áp dụng biện pháp phòng trừ sinh học (dùng thiên địch) và canh tác hữu cơ để bảo vệ mạng lưới sinh thái tự nhiên.`,
        commonTrap: `⚠️ Lưu ý câu hỏi vận dụng:\nKhi giải thích hiện tượng bảo vệ môi trường, không chỉ nói đến bảo vệ từng cá thể riêng rẽ mà phải bảo vệ cả quần thể và sinh cảnh nơi chúng sinh sống.`,
        diagramOrKeyNote: `📌 Luồng tác động lan truyền:\n[Tế bào nhiễm độc] → [Cơ thể suy yếu] → [Quần thể giảm số lượng] → [Quần xã mất cân bằng lưới thức ăn] → [Hệ sinh thái suy thoái].`
      });
    }

    return lessons.length > 0 ? lessons : [buildRemedialLesson(topic, errorItems.map(e => e.weakConcept))];
  }

  // 2. CHỦ ĐỀ: BÀI 2 - TRAO ĐỔI NƯỚC VÀ KHOÁNG Ở THỰC VẬT (SINH HỌC 11)
  if (tLower.includes('nước') || tLower.includes('khoáng') || tLower.includes('khí khổng')) {
    const lessons: RemedialTopicLesson[] = [];
    const nbErrors = errorItems.filter(e => e.cognitiveLevel === 'NHAN_BIET' || e.weakConcept.toLowerCase().includes('con đường') || e.weakConcept.toLowerCase().includes('caspary'));
    lessons.push({
      topic: 'Con Đường Hấp Thụ Nước & Khoáng Từ Đất Vào Mạch Gỗ Rễ',
      yccdCode: 'YCCD_1.1',
      cognitiveLevel: 'Nhận biết',
      yccdText: 'Nêu được 2 con đường vận chuyển nước và khoáng từ lông hút vào mạch gỗ của rễ: Con đường gian bào và con đường tế bào chất; Nhận biết vai trò của đai Caspary ở lớp nội bì.',
      relatedQuestions: nbErrors.map(e => e.questionIndex || 1).filter((v, i, a) => a.indexOf(v) === i),
      relatedErrorItems: nbErrors,
      coreTheory: `Nước và ion khoáng từ đất sau khi vào tế bào lông hút sẽ đi vào mạch gỗ qua 2 con đường:\n1. Con đường gian bào: Đi theo khoảng không gian giữa các tế bào và thành tế bào. Con đường này vận chuyển NHANH, ít bị cản trở nhưng KHÔNG CHỌN LỌC. Tuy nhiên khi đến lớp nội bì, đai Caspary (không thấm nước) sẽ chặn dòng gian bào lại, bắt buộc nước và khoáng phải chuyển sang con đường tế bào chất để được chọn lọc và kiểm soát trước khi vào mạch gỗ.\n2. Con đường tế bào chất: Nước và khoáng đi xuyên qua màng sinh chất và chất nguyên sinh qua cầu sinh chất giữa các tế bào. Con đường này CHẬM hơn nhưng mang tính CHỌN LỌC cao.`,
      practicalExample: `💡 Ví dụ thực tế & Cơ chế chọn lọc:\nNhờ có đai Caspary ở lớp nội bì, cây trồng ngăn chặn được phần lớn các chất độc hại hoặc ion kim loại nặng dư thừa trong đất không cho xâm nhập ồ ạt vào mạch dẫn của cây.`,
      commonTrap: `⚠️ Bẫy đề thi hay gặp:\n- Nhầm lẫn: Cho rằng dòng gian bào đi thẳng một mạch vào mạch gỗ mà không bị cản trở (Sai! Luôn bị đai Caspary chặn lại ở lớp nội bì).\n- Nhầm vai trò: Cho rằng đai Caspary hút nước (Sai! Đai Caspary cấu tạo từ suberin không thấm nước, vai trò là trạm kiểm soát dòng nước và khoáng).`,
      diagramOrKeyNote: `📌 Sơ đồ dòng nước vào rễ:\n[Lông hút] ── Gian bào ──> [Nội bì bị đai Caspary chặn] ──> Chuyển sang Tế bào chất ──> [Mạch gỗ (Xylem)].`
    });

    const thErrors = errorItems.filter(e => e.cognitiveLevel === 'THONG_HIEU' || e.weakConcept.toLowerCase().includes('động lực') || e.weakConcept.toLowerCase().includes('thoát hơi nước') || e.weakConcept.toLowerCase().includes('áp suất rễ'));
    lessons.push({
      topic: '3 Động Lực Vận Chuyển Dòng Mạch Gỗ & Cơ Chế Khí Khổng',
      yccdCode: 'YCCD_2.1',
      cognitiveLevel: 'Thông hiểu',
      yccdText: 'Giải thích được 3 động lực vận chuyển dòng mạch gỗ lên cao: Thoát hơi nước ở lá (lực kéo chính), áp suất rễ (lực đẩy), lực liên kết giữa các phân tử nước. Phân tích cơ chế đóng mở khí khổng.',
      relatedQuestions: thErrors.map(e => e.questionIndex || 2).filter((v, i, a) => a.indexOf(v) === i),
      relatedErrorItems: thErrors,
      coreTheory: `1. Động lực dòng mạch gỗ gồm 3 lực phối hợp:\n• Lực kéo đầu trên (chủ yếu nhất): Do quá trình thoát hơi nước ở lá tạo ra sức hút nước từ mạch gỗ của lá → thân → rễ.\n• Lực đẩy đầu dưới: Do áp suất rễ (quá trình thẩm thấu nước từ đất vào rễ chủ động).\n• Lực trung gian: Lực liên kết hidro giữa các phân tử nước với nhau và lực bám giữa phân tử nước với thành mạch gỗ tạo thành cột nước liên tục không bị đứt đoạn.\n2. Cơ chế đóng mở khí khổng:\n• Khi tế bào hạt đậu no nước: Thành mỏng phía ngoài dãn nhiều hơn thành dày phía trong → mép trong cong lại làm lỗ khí MỞ RA.\n• Khi tế bào hạt đậu mất nước: Thành mỏng co lại, thành dày duỗi thẳng → lỗ khí ĐÓNG LẠI.`,
      practicalExample: `💡 Hiện tượng thực tế chứng minh:\n• Hiện tượng ứ giọt vào sáng sớm ở mép lá cây bụi nhỏ: Khi đêm ẩm độ không khí cao, thoát hơi nước yếu nhưng rễ vẫn đẩy nước lên tạo áp suất rễ ứ giọt ra mép lá.\n• Vì sao bón quá nhiều phân đạm/NPK làm cây bị héo? Vì nồng độ dung dịch đất trở nên quá cao (ưu trương) so với dịch bào rễ → nước trong rễ thẩm thấu ngược ra ngoài đất làm cây bị mất nước và chết héo.`,
      commonTrap: `⚠️ Cạm bẫy câu hỏi trắc nghiệm:\n- Nhầm dòng mạch gỗ (nước + khoáng đi từ rễ lên lá) với dòng mạch rây (chất hữu cơ sucrose đi từ lá xuống rễ/củ/quả).\n- Nhầm cấu trúc tế bào hạt đậu: Thành mỏng nằm ở phía ngoài, thành dày nằm ở mép trong của lỗ khí.`,
      diagramOrKeyNote: `📌 Động lực mạch gỗ:\n[Thoát hơi nước ở lá (Lực kéo chính)] ↑↑↑ [Cột nước liên tục] ↑↑↑ [Áp suất rễ (Lực đẩy)].`
    });

    return lessons;
  }

  // 3. CHỦ ĐỀ: BÀI 2 - GENE, TÁI BẢN DNA, PHIÊN MÃ VÀ DỊCH MÃ (SINH HỌC 12)
  if (tLower.includes('tái bản') || tLower.includes('dna') || tLower.includes('gene') || tLower.includes('nhân đôi') || tLower.includes('phiên mã') || tLower.includes('dịch mã')) {
    const lessons: RemedialTopicLesson[] = [];

    // Cấu trúc DNA & NTBS
    const dnaErrors = errorItems.filter(e => e.weakConcept.toLowerCase().includes('cấu trúc') || e.weakConcept.toLowerCase().includes('nguyên tắc bổ sung') || e.questionText.toLowerCase().includes('xoắn kép'));
    lessons.push({
      topic: 'Cấu Trúc Không Gian Của DNA & Nguyên Tắc Bổ Sung (NTBS)',
      yccdCode: 'YCCD_1.1',
      cognitiveLevel: 'Nhận biết',
      yccdText: 'Trình bày được cấu trúc hóa học và cấu trúc xoắn kép của phân tử DNA; Nhận biết nguyên tắc bổ sung giữa các cặp base nitơ: A liên kết T bằng 2 liên kết hidro, G liên kết C bằng 3 liên kết hidro.',
      relatedQuestions: dnaErrors.map(e => e.questionIndex || 1).filter((v, i, a) => a.indexOf(v) === i),
      relatedErrorItems: dnaErrors,
      coreTheory: `1. DNA là một đại phân tử hữu cơ cấu tạo theo nguyên tắc đa phân, đơn phân là nucleotide gồm 3 thành phần: gốc đường deoxyribose (C5H10O4), nhóm phosphate và một trong 4 loại base nitơ (A, T, G, C).\n2. Mô hình xoắn kép Watson - Crick: DNA gồm 2 chuỗi polynucleotide xoắn đều quanh một trục tưởng tượng theo chiều từ trái sang phải. Hai mạch chạy song song nhưng NGƯỢC CHIỀU nhau (một mạch có chiều 3'→5', mạch đối diện có chiều 5'→3').\n3. Nguyên tắc bổ sung (NTBS): Các base nitơ đối diện liên kết với nhau bằng liên kết hidro: A liên kết với T bằng 2 liên kết hidro (A = T); G liên kết với C bằng 3 liên kết hidro (G ≡ C). Hệ quả NTBS: A = T, G = C; do đó A + G = T + C = 50% tổng số nucleotide.`,
      practicalExample: `💡 Bài toán mẫu cơ bản:\nMột phân tử DNA mạch kép có tổng số 3000 nucleotide, trong đó số nucleotide loại A = 600 nu.\n• Tính số nu các loại còn lại: Theo NTBS, T = A = 600 nu. Tổng G + C = 3000 - (600 × 2) = 1800 nu → G = C = 900 nu.\n• Tính tổng số liên kết hidro (H): H = 2A + 3G = 2(600) + 3(900) = 1200 + 2700 = 3900 liên kết hidro.`,
      commonTrap: `⚠️ Cạm bẫy câu hỏi:\n- Nhầm liên kết hóa học: Liên kết giữa các nucleotide trên CÙNG MỘT MẠCH là liên kết photphodiester (liên kết cộng hóa trị bền vững). Còn liên kết giữa 2 mạch đối diện mới là liên kết hidro (kém bền, dễ bị enzyme tháo xoắn tách ra khi nhân đôi/phiên mã).`,
      diagramOrKeyNote: `📌 Cốt lõi công thức DNA:\n• A = T; G = C\n• Tổng số Nu: N = 2A + 2G = 2T + 2C\n• Tổng số liên kết Hidro: H = 2A + 3G`
    });

    // Cơ chế tái bản DNA
    const repErrors = errorItems.filter(e => e.weakConcept.toLowerCase().includes('tái bản') || e.weakConcept.toLowerCase().includes('nhân đôi') || e.weakConcept.toLowerCase().includes('polymerase') || e.weakConcept.toLowerCase().includes('okazaki') || e.weakConcept.toLowerCase().includes('bán bảo tồn'));
    lessons.push({
      topic: 'Cơ Chế Tái Bản (Nhân Đôi) DNA & Đoạn Okazaki',
      yccdCode: 'YCCD_2.1',
      cognitiveLevel: 'Thông hiểu',
      yccdText: 'Phân tích được cơ chế tái bản DNA diễn ra theo 2 nguyên tắc cốt lõi: Nguyên tắc bổ sung và Nguyên tắc bán bảo tồn. Giải thích được chiều hoạt động của enzyme DNA polymerase và sự hình thành đoạn Okazaki trên mạch khuôn 5\'→3\'.',
      relatedQuestions: repErrors.map(e => e.questionIndex || 2).filter((v, i, a) => a.indexOf(v) === i),
      relatedErrorItems: repErrors,
      coreTheory: `Cơ chế tái bản DNA diễn ra ở pha S kỳ trung gian gồm 3 bước chính:\n1. Tháo xoắn phân tử DNA: Enzyme DNA Helicase bám vào điểm khởi đầu sao chép, cắt các liên kết hidro tách 2 mạch đơn tạo chạc chữ Y.\n2. Tổng hợp mạch mới:\n• Enzyme RNA Primase tổng hợp đoạn mồi RNA (cung cấp đầu 3'-OH tự do).\n• QUY TẮC CỐT LÕI VỀ CHIỀU ENZYME: Enzyme DNA polymerase CHỈ có thể kéo dài mạch mới bằng cách gắn nucleotide vào đầu 3'-OH tự do, tức là NÓ CHỈ TỔNG HỢP MẠCH MỚI THEO CHIỀU 5'→3' (nghĩa là trượt trên mạch khuôn theo chiều 3'→5').\n• Do đó, trên mạch khuôn có chiều 3'→5' (cùng chiều mở chạc ba): Mạch mới được tổng hợp LIÊN TỤC theo chiều 5'→3', chỉ cần 1 đoạn mồi RNA ban đầu.\n• Trên mạch khuôn có chiều 5'→3' (ngược chiều mở chạc ba): Mạch mới được tổng hợp NGẮT QUÃNG thành từng đoạn ngắn gọi là ĐOẠN OKAZAKI theo chiều 5'→3'. Mỗi đoạn Okazaki cần 1 đoạn mồi RNA riêng.\n3. Nối các đoạn Okazaki: Enzyme DNA Ligase loại bỏ đoạn mồi và nối các đoạn Okazaki lại thành một mạch polynucleotide hoàn chỉnh.`,
      practicalExample: `💡 Bài toán mẫu thực tế Meselson - Stahl (Nguyên tắc bán bảo tồn):\nCho 1 phân tử DNA mạch kép chứa N15 ở cả 2 mạch. Chuyển vi khuẩn sang môi trường chỉ chứa N14 và cho nhân đôi 3 lần (k = 3):\n• Tổng số phân tử DNA con tạo thành = 2^k = 2^3 = 8 phân tử.\n• Số phân tử lai chứa cả 1 mạch N15 và 1 mạch N14 = ĐÚNG 2 PHÂN TỬ (luôn giữ lại 2 mạch gốc của mẹ theo nguyên tắc bán bảo tồn).\n• Số phân tử DNA hoàn toàn mới chứa toàn N14 = 2^3 - 2 = 6 phân tử.`,
      commonTrap: `⚠️ 3 Cạm bẫy kinh điển trong đề thi THPT:\n1. Bẫy chiều enzyme: Đề hỏi "DNA polymerase trượt trên mạch khuôn theo chiều nào?" → Đáp án là chiều 3'→5' (để tổng hợp mạch mới 5'→3'). Đừng nhầm giữa chiều trượt trên mạch khuôn và chiều của mạch mới!\n2. Bẫy số đoạn mồi: Trên mạch khuôn 3'→5' chỉ cần 1 đoạn mồi, còn trên mạch khuôn 5'→3' cần NHIỀU đoạn mồi (bằng số đoạn Okazaki).\n3. Bẫy tế bào nhân sơ vs nhân thực: Tế bào nhân sơ phân tử DNA dạng vòng chỉ có 1 điểm khởi đầu tái bản (1 đơn vị tái bản, 2 chạc chữ Y). Tế bào nhân thực DNA mạch thẳng có NHIỀU đơn vị tái bản cùng hoạt động để tăng tốc độ nhân đôi.`,
      diagramOrKeyNote: `📌 Sơ đồ chạc chữ Y tái bản DNA:\nMạch khuôn 3'────────5'  ==> Mạch mới 5'────────3' (Tổng hợp liên tục, 1 mồi)\nMạch khuôn 5'────────3'  ==> Đoạn Okazaki 5'───3' 5'───3' (Tổng hợp gián đoạn, nhiều mồi) -> Nối nhờ DNA Ligase.`
    });

    // Phiên mã & Dịch mã
    const transErrors = errorItems.filter(e => e.weakConcept.toLowerCase().includes('phiên mã') || e.weakConcept.toLowerCase().includes('dịch mã') || e.weakConcept.toLowerCase().includes('codon') || e.weakConcept.toLowerCase().includes('mã di truyền'));
    if (transErrors.length > 0) {
      lessons.push({
        topic: 'Cơ Chế Phiên Mã & Dịch Mã Tổng Hợp Protein',
        yccdCode: 'YCCD_2.2',
        cognitiveLevel: 'Thông hiểu',
        yccdText: 'Trình bày được đặc điểm của mã di truyền; Phân tích cơ chế phiên mã tổng hợp RNA và dịch mã tổng hợp chuỗi polypeptide tại ribosome theo nguyên tắc bổ sung.',
        relatedQuestions: transErrors.map(e => e.questionIndex || 3).filter((v, i, a) => a.indexOf(v) === i),
        relatedErrorItems: transErrors,
        coreTheory: `1. Mã di truyền là mã bộ ba: Cứ 3 nucleotide liền kề mã hóa cho 1 amino acid. Gồm 64 bộ ba (codon), trong đó có 1 codon mở đầu (5'-AUG-3' mã hóa Met ở nhân thực) và 3 codon kết thúc (5'-UAA-3', 5'-UAG-3', 5'-UGA-3' không mã hóa amino acid nào mà làm tín hiệu kết thúc dịch mã).\n2. Phiên mã: Enzyme RNA polymerase trượt trên mạch khuôn DNA chiều 3'→5' để tổng hợp phân tử mRNA chiều 5'→3' theo NTBS: A(khuôn)-U(môi trường), T-A, G-C, C-G.\n3. Dịch mã: Diễn ra tại ribosome ở tế bào chất. Ribosome đọc từng bộ ba codon trên mRNA theo chiều 5'→3', phân tử tRNA mang anticodon khớp bổ sung đem amino acid tương ứng vào liên kết peptide tạo chuỗi polypeptide.`,
        practicalExample: `💡 Ví dụ minh họa chuyển đổi thông tin di truyền:\n• Mạch khuôn DNA: 3'- TAC  AAA  GCA  ACT -5'\n• Mạch mRNA:       5'- AUG  UUU  CGU  UGA -3'\n• Chuỗi amino acid:     Met - Phe  - Arg - (Kết thúc tại codon UGA).`,
        commonTrap: `⚠️ Bẫy đề thi:\n- Codon nằm trên phân tử mRNA (đọc theo chiều 5'→3'); Anticodon nằm trên phân tử tRNA (khớp ngược chiều 3'→5'); Triplet nằm trên mạch khuôn DNA (chiều 3'→5').`,
        diagramOrKeyNote: `📌 Luồng thông tin di truyền:\nDNA (mạch khuôn 3'→5') ── Phiên mã ──> mRNA (5'→3') ── Dịch mã tại Ribosome ──> Chuỗi Polypeptide.`
      });
    }

    return lessons;
  }

  // 4. CHỦ ĐỀ: BÀI 1 - KHÁI QUÁT VỀ TRAO ĐỔI CHẤT VÀ CHUYỂN HÓA NĂNG LƯỢNG
  if (tLower.includes('trao đổi chất') || tLower.includes('chuyển hoá năng lượng') || tLower.includes('đồng hoá') || tLower.includes('dị hoá')) {
    const lessons: RemedialTopicLesson[] = [];
    const nbErrors = errorItems.filter(e => e.cognitiveLevel === 'NHAN_BIET' || e.weakConcept.toLowerCase().includes('khái niệm'));
    lessons.push({
      topic: 'Bản Chất Hai Mặt Của Trao Đổi Chất: Đồng Hóa & Dị Hóa',
      yccdCode: 'YCCD_1.1',
      cognitiveLevel: 'Nhận biết & Thông hiểu',
      yccdText: 'Nêu được khái niệm trao đổi chất và chuyển hóa năng lượng; Phân biệt được hai mặt mâu thuẫn nhưng thống nhất: Đồng hóa (tổng hợp chất, tích lũy năng lượng) và Dị hóa (phân giải chất, giải phóng ATP).',
      relatedQuestions: nbErrors.map(e => e.questionIndex || 1).filter((v, i, a) => a.indexOf(v) === i),
      relatedErrorItems: nbErrors,
      coreTheory: `Trao đổi chất và chuyển hóa năng lượng là đặc trưng cơ bản nhất của sự sống gồm 2 quá trình trái ngược nhưng gắn bó mật thiết:\n1. Đồng hóa: Quá trình tổng hợp các chất hữu cơ phức tạp đặc trưng cho cơ thể từ các chất đơn giản, đồng thời tích lũy năng lượng vào các liên kết hóa học (ví dụ: quang hợp tổng hợp glucose tích lũy hóa năng).\n2. Dị hóa: Quá trình phân giải các chất hữu cơ phức tạp thành các chất đơn giản, giải phóng năng lượng dưới dạng ATP cung cấp cho mọi hoạt động sống của tế bào (ví dụ: hô hấp tế bào phân giải glucose).\n3. Mối quan hệ mật thiết: Đồng hóa tạo nguyên liệu phức tạp cho dị hóa phân giải; dị hóa giải phóng năng lượng ATP cung cấp cho đồng hóa hoạt động. Nếu một trong 2 quá trình dừng lại thì sự sống chấm dứt.`,
      practicalExample: `💡 Ví dụ thực tế & Ứng dụng:\nKhi em ăn cơm (tinh bột), hệ tiêu hóa phân giải tinh bột thành glucose. Tế bào thực hiện dị hóa (hô hấp) phân giải glucose tạo 30-32 phân tử ATP. Cơ bắp sử dụng ATP này để co duỗi giúp em đi lại, học tập và tư duy.`,
      commonTrap: `⚠️ Bẫy đề thi: Cho rằng đồng hóa và dị hóa có thể diễn ra hoàn toàn độc lập tách rời (Sai! Hai quá trình luôn gắn bó hữu cơ và điều hòa lẫn nhau thông qua nồng độ ATP/ADP trong tế bào).`,
      diagramOrKeyNote: `📌 Chu trình năng lượng ATP:\nChất đơn giản ── [Đồng hóa tiêu tốn ATP] ──> Chất phức tạp ── [Dị hóa giải phóng ATP] ──> Chất đơn giản.`
    });
    return lessons;
  }

  // 5. FALLBACK THÔNG MINH CHO CÁC BÀI HỌC VÀ CHỦ ĐỀ KHÁC
  // Nhóm các câu hỏi sai theo khái niệm hoặc tạo bài học bám sát chính xác từng câu sai của học sinh!
  if (errorItems.length > 0) {
    const lessons: RemedialTopicLesson[] = [];
    const groupedByConcept: Record<string, DiagnosticErrorItem[]> = {};

    errorItems.forEach(item => {
      const key = item.weakConcept || 'Kiến thức cốt lõi bài học';
      if (!groupedByConcept[key]) groupedByConcept[key] = [];
      groupedByConcept[key].push(item);
    });

    Object.entries(groupedByConcept).forEach(([concept, items], idx) => {
      const primaryItem = items[0];
      const level = primaryItem.cognitiveLevel === 'NHAN_BIET' ? 'Nhận biết' : primaryItem.cognitiveLevel === 'THONG_HIEU' ? 'Thông hiểu' : 'Vận dụng';
      const qNumbers = items.map(it => it.questionIndex || (errorItems.indexOf(it) + 1));

      lessons.push({
        topic: `[YCCĐ ${level}] ${concept}`,
        yccdCode: `YCCD_${primaryItem.cognitiveLevel === 'NHAN_BIET' ? '1' : primaryItem.cognitiveLevel === 'THONG_HIEU' ? '2' : '3'}.${idx + 1}`,
        cognitiveLevel: level,
        yccdText: `Nắm vững và vận dụng chuẩn xác nội dung kiến thức: "${concept}" theo chuẩn Chương trình Giáo dục phổ thông 2018 (SGK Kết nối tri thức với cuộc sống).`,
        relatedQuestions: qNumbers,
        relatedErrorItems: items,
        coreTheory: `Lý thuyết trọng tâm cần củng cố:\n${primaryItem.explanation || `Cần nắm chắc định nghĩa, cấu trúc và bản chất cơ chế của ${concept}. Chú ý phân tích mối liên hệ nhân - quả giữa cấu trúc và chức năng để không bị nhầm lẫn giữa các khái niệm tương đương.`}\n\nNguyên nhân học sinh hay mắc lỗi: ${primaryItem.reasonWhyWrong}`,
        practicalExample: `💡 Ví dụ minh họa & Phân tích câu trả lời sai:\n${items.map(it => `• Câu ${it.questionIndex || 'kiểm tra'}: "${it.questionText}"\n  ❌ Em đã chọn: ${it.userAnswer} (Chưa chính xác)\n  ✓ Đáp án đúng: ${it.correctAnswer}\n  💡 Phân tích bản chất: ${it.explanation}`).join('\n\n')}`,
        commonTrap: `⚠️ Cạm bẫy câu hỏi thường gặp: ${primaryItem.reasonWhyWrong}. Cần lưu ý phân tích kỹ từng từ khóa chỉ định tính, điều kiện biên và mối quan hệ giữa các mệnh đề trong câu hỏi.`,
        diagramOrKeyNote: `📌 Điểm then chốt ghi nhớ: Học kỹ định nghĩa chuẩn trong SGK Kết nối tri thức → Xác định bản chất cơ chế sinh học → Vận dụng giải thích chính xác câu hỏi.`
      });
    });

    return lessons;
  }

  // Mặc định nếu học sinh làm đúng 100%
  return [
    {
      topic: `Tổng Quan Kiến Thức Trọng Tâm: ${topic}`,
      yccdCode: 'YCCD_TOAN_DIEN',
      cognitiveLevel: 'Đạt chuẩn xuất sắc',
      yccdText: `Em đã đạt xuất sắc toàn bộ các Yêu Cầu Cần Đạt của bài học "${topic}" theo chuẩn GDPT 2018. Hãy tiếp tục duy trì và mở rộng các bài toán vận dụng nâng cao!`,
      relatedQuestions: [],
      coreTheory: `Học sinh đã nắm vững hệ thống kiến thức lý thuyết cốt lõi của bài học ${topic}: định nghĩa khái niệm chuẩn xác, giải thích thấu đáo bản chất cơ chế hoạt động và phân tích tốt mối quan hệ giữa các thành phần sinh học.`,
      practicalExample: `💡 Lời khuyên nâng cao: Hãy thử sức với các bài toán vận dụng thực tiễn, tính toán thông số di truyền và bài tập phân tích đồ thị/bảng số liệu sinh học nâng cao để rèn luyện tư duy đỉnh cao!`,
      commonTrap: '⚠️ Lưu ý khi làm đề thi phân hóa cao: Đọc kỹ các câu hỏi đúng/sai có nhiều mệnh đề liên hoàn để không bị mất điểm ở những chi tiết nhỏ.',
      diagramOrKeyNote: '📌 Khắc sâu kiến thức: Sơ đồ hóa bài học thành bản đồ tư duy Mindmap cá nhân giúp ghi nhớ vĩnh viễn.'
    }
  ];
};

/**
 * Xây dựng nội dung bài học củng cố trọng tâm + ví dụ minh họa (hỗ trợ tương thích ngược)
 */
export const buildRemedialLesson = (topic: string, weakConcepts: string[]): RemedialTopicLesson => {
  const dummyErrors: DiagnosticErrorItem[] = weakConcepts.map((c, idx) => ({
    questionId: `dummy-${idx}`,
    questionText: `Kiến thức về ${c}`,
    userAnswer: '',
    correctAnswer: '',
    isCorrect: false,
    cognitiveLevel: idx === 0 ? 'NHAN_BIET' : idx === 1 ? 'THONG_HIEU' : 'VAN_DUNG',
    weakConcept: c,
    reasonWhyWrong: 'Cần ôn lại lý thuyết cốt lõi và các ví dụ minh họa',
    explanation: 'Nắm vững định nghĩa và cơ chế hoạt động sinh học theo SGK Kết nối tri thức.'
  }));
  const lessons = buildDetailedYccdRemedialLessons(topic, dummyErrors);
  return lessons[0];
};

/**
 * Sinh ngân hàng 3-4 câu hỏi luyện tập bù đắp lỗ hỏng bám sát các câu học sinh làm sai
 */
export const generateTargetedPracticeQuestions = (
  exam: Exam,
  errorItems: DiagnosticErrorItem[]
): Question[] => {
  const generated: Question[] = [];
  const baseQuestions = exam.questions || [];

  // 1. Tạo biến thể kiểm tra lại chính xác các câu sai
  errorItems.slice(0, 3).forEach((item, idx) => {
    const originalQ = baseQuestions.find(q => q.id === item.questionId);
    if (originalQ) {
      if (originalQ.type === 'MCQ') {
        generated.push({
          id: `retest-mcq-${idx + 1}-${Date.now()}`,
          type: 'MCQ',
          text: `[Luyện lại kiến thức hổng] ${originalQ.text.replace(/\[.*?\]/g, '').trim()}`,
          options: [...originalQ.options],
          correctAnswer: originalQ.correctAnswer,
          explanation: item.explanation || originalQ.explanation
        });
      } else if (originalQ.type === 'TF') {
        generated.push({
          id: `retest-tf-${idx + 1}-${Date.now()}`,
          type: 'TF',
          text: `[Kiểm tra lại mệnh đề] ${originalQ.text.replace(/\[.*?\]/g, '').trim()}`,
          options: ['Đúng', 'Sai'],
          correctAnswer: originalQ.correctAnswer,
          explanation: item.explanation || originalQ.explanation
        });
      } else {
        generated.push({
          id: `retest-sa-${idx + 1}-${Date.now()}`,
          type: 'SA',
          text: `[Luyện lại trả lời ngắn] ${originalQ.text.replace(/\[.*?\]/g, '').trim()}`,
          options: [],
          correctAnswer: originalQ.correctAnswer,
          explanation: item.explanation || originalQ.explanation
        });
      }
    }
  });

  // Nếu số câu luyện tập ít hơn 3, bổ sung từ các câu trong đề
  if (generated.length < 3 && baseQuestions.length >= 3) {
    baseQuestions.slice(0, 3 - generated.length).forEach((bq, i) => {
      generated.push({
        id: `retest-extra-${i + 1}-${Date.now()}`,
        type: bq.type,
        text: `[Củng cố nâng cao] ${bq.text}`,
        options: [...bq.options],
        correctAnswer: bq.correctAnswer,
        explanation: bq.explanation
      });
    });
  }

  return generated;
};

/**
 * Xây dựng Hồ sơ năng lực và Chuẩn đoán lỗi toàn diện cho học sinh sau khi nộp bài
 */
export const buildStudentCompetencyProfile = (
  exam: Exam,
  user: User,
  answers: Record<string, string>,
  correctCount: number
): StudentCompetencyProfile => {
  const totalQuestions = (exam.questions || []).length;
  const score10 = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 10 * 100) / 100 : 0;

  const errorItems: DiagnosticErrorItem[] = [];
  const cognitiveStats = {
    nhanBiet: { total: 0, correct: 0, wrong: 0 },
    thongHieu: { total: 0, correct: 0, wrong: 0 },
    vanDung: { total: 0, correct: 0, wrong: 0 }
  };

  (exam.questions || []).forEach((q, idx) => {
    if (!q) return;
    const userAns = (answers[q.id] || '').trim();
    const correctAns = (q.correctAnswer || '').trim();

    let isCorrect = false;
    if (q.type === 'SA') {
      if (userAns.toLowerCase() === correctAns.toLowerCase()) {
        isCorrect = true;
      } else if (!isNaN(Number(userAns)) && !isNaN(Number(correctAns)) && Number(userAns) === Number(correctAns)) {
        isCorrect = true;
      }
    } else {
      isCorrect = userAns.toUpperCase() === correctAns.toUpperCase();
    }

    // Xác định mức độ nhận thức
    const textLower = (q.text || '').toLowerCase();
    let cog: 'NHAN_BIET' | 'THONG_HIEU' | 'VAN_DUNG' = 'NHAN_BIET';
    if (textLower.includes('vận dụng') || textLower.includes('thực tế') || textLower.includes('ứng dụng') || q.type === 'SA') {
      cog = 'VAN_DUNG';
    } else if (textLower.includes('thông hiểu') || textLower.includes('phân biệt') || textLower.includes('giải thích')) {
      cog = 'THONG_HIEU';
    } else if (textLower.includes('nhận biết') || textLower.includes('khái niệm') || textLower.includes('liệt kê')) {
      cog = 'NHAN_BIET';
    } else {
      if (idx < Math.ceil(totalQuestions * 0.4)) cog = 'NHAN_BIET';
      else if (idx < Math.ceil(totalQuestions * 0.75)) cog = 'THONG_HIEU';
      else cog = 'VAN_DUNG';
    }

    if (cog === 'NHAN_BIET') {
      cognitiveStats.nhanBiet.total++;
      if (isCorrect) cognitiveStats.nhanBiet.correct++;
      else cognitiveStats.nhanBiet.wrong++;
    } else if (cog === 'THONG_HIEU') {
      cognitiveStats.thongHieu.total++;
      if (isCorrect) cognitiveStats.thongHieu.correct++;
      else cognitiveStats.thongHieu.wrong++;
    } else {
      cognitiveStats.vanDung.total++;
      if (isCorrect) cognitiveStats.vanDung.correct++;
      else cognitiveStats.vanDung.wrong++;
    }

    if (!isCorrect) {
      const diag = diagnoseErrorReason(q, userAns, cog);
      errorItems.push({
        questionId: q.id,
        questionText: q.text,
        userAnswer: userAns || 'Chưa trả lời',
        correctAnswer: q.correctAnswer,
        isCorrect: false,
        cognitiveLevel: cog,
        weakConcept: diag.concept,
        reasonWhyWrong: diag.reason,
        explanation: diag.explanation,
        questionIndex: idx + 1
      });
    }
  });

  // Xác định mức độ hổng nhiều nhất
  let weakLevel: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Không hổng' = 'Không hổng';
  const maxWrong = Math.max(cognitiveStats.nhanBiet.wrong, cognitiveStats.thongHieu.wrong, cognitiveStats.vanDung.wrong);
  if (maxWrong > 0) {
    if (cognitiveStats.nhanBiet.wrong === maxWrong) weakLevel = 'Nhận biết';
    else if (cognitiveStats.thongHieu.wrong === maxWrong) weakLevel = 'Thông hiểu';
    else weakLevel = 'Vận dụng';
  }

  // Danh sách chủ đề hổng
  const weakTopics = Array.from(new Set(errorItems.map(e => e.weakConcept)));
  if (weakTopics.length === 0) {
    weakTopics.push('Nắm vững kiến thức bài học');
  }

  // Xây dựng bài học củng cố lý thuyết & ví dụ minh họa bám sát các YCCĐ học sinh trả lời sai
  const lessonTopic = exam.lessonName || exam.topic || exam.title;
  const remedialLessons = buildDetailedYccdRemedialLessons(lessonTopic, errorItems, exam.learningObjectives);

  // Sinh câu hỏi luyện tập bù đắp
  const practiceQuestions = generateTargetedPracticeQuestions(exam, errorItems);

  let status: 'CẦN_CỦNG_CỐ' | 'ĐANG_LUYỆN_TẬP' | 'ĐÃ_TIẾN_BỘ' | 'XUẤT_SẮC' = 'CẦN_CỦNG_CỐ';
  if (score10 >= 9.0) status = 'XUẤT_SẮC';
  else if (score10 >= 8.0) status = 'ĐÃ_TIẾN_BỘ';

  return {
    examId: exam.id,
    examTitle: exam.title,
    lessonName: lessonTopic,
    studentId: user.studentId,
    studentName: user.name,
    studentClass: user.className,
    date: new Date().toISOString(),
    initialScore: correctCount,
    totalQuestions,
    score10,
    weakLevel,
    weakTopics,
    cognitiveStats,
    errorItems,
    remedialLessons,
    practiceQuestions,
    status
  };
};

/**
 * Đánh giá tiến bộ sau khi học sinh làm xong bài kiểm tra lại / luyện tập bù đắp
 */
export const evaluateRemedialProgress = (
  profile: StudentCompetencyProfile,
  practiceAnswers: Record<string, string>
): StudentCompetencyProfile => {
  let correctInPractice = 0;
  const totalPractice = profile.practiceQuestions.length;

  profile.practiceQuestions.forEach(q => {
    const userA = (practiceAnswers[q.id] || '').trim();
    const correctA = (q.correctAnswer || '').trim();

    let ok = false;
    if (q.type === 'SA') {
      if (userA.toLowerCase() === correctA.toLowerCase()) ok = true;
      else if (userA !== '' && correctA !== '' && !isNaN(Number(userA)) && !isNaN(Number(correctA)) && Number(userA) === Number(correctA)) ok = true;
    } else if (q.type === 'MCQ' && Array.isArray(q.options)) {
      if (userA.toUpperCase() === correctA.toUpperCase()) {
        ok = true;
      } else {
        const letters = ['A', 'B', 'C', 'D'];
        const selectedIdx = letters.indexOf(userA.toUpperCase());
        if (selectedIdx !== -1 && q.options[selectedIdx]) {
          const optText = q.options[selectedIdx].replace(/^[A-D][\.\:\)]\s*/i, '').trim().toLowerCase();
          const cleanCorr = correctA.replace(/^[A-D][\.\:\)]\s*/i, '').trim().toLowerCase();
          if (optText && cleanCorr && optText === cleanCorr) ok = true;
        }
      }
    } else {
      ok = userA.toUpperCase() === correctA.toUpperCase();
    }

    if (ok) correctInPractice++;
  });

  const practicePercent = totalPractice > 0 ? Math.round((correctInPractice / totalPractice) * 100) : 100;
  const practiceScore10 = totalPractice > 0 ? Math.round((correctInPractice / totalPractice) * 10 * 100) / 100 : 10;
  const delta = Math.round((practiceScore10 - profile.score10) * 10) / 10;

  // Điều kiện mở khóa theo quy định: Đã hoàn thành xong "Luyện Tập Bù Đắp Lỗ Hỏng" VÀ kết quả "Đánh giá tiến độ" trên 80%
  const isRemedialUnlocked = practicePercent > 80;

  let newStatus: 'CẦN_CỦNG_CỐ' | 'ĐANG_LUYỆN_TẬP' | 'ĐÃ_TIẾN_BỘ' | 'XUẤT_SẮC' = 'ĐÃ_TIẾN_BỘ';
  if (practicePercent >= 90) newStatus = 'XUẤT_SẮC';
  else if (practicePercent <= 60) newStatus = 'CẦN_CỦNG_CỐ';

  return {
    ...profile,
    practiceAnswers,
    practiceScore: correctInPractice,
    practicePercent,
    isRetestSubmitted: true,
    isRemedialUnlocked,
    remedialCompletedAt: new Date().toISOString(),
    improvementDelta: delta,
    status: newStatus
  };
};

export interface ExamAttemptPermission {
  canTake: boolean;
  hasTaken: boolean;
  attemptsCount: number;
  lastScore10?: number;
  isRemedialCompleted: boolean;
  remedialPercent: number;
  isUnlocked: boolean;
  profile: StudentCompetencyProfile | null;
  message: string;
}

/**
 * Kiểm tra xem một bản ghi lịch sử có phải là lượt luyện tập bù đắp / rèn luyện ngắn hay không
 */
export const isRemedialOrPracticeTurn = (h: any): boolean => {
  if (!h) return false;
  const turn = String(h.turnId || '').toUpperCase();
  const id = String(h.examId || '').toUpperCase();
  const title = String(h.examTitle || '').toLowerCase();
  return (
    turn.startsWith('LT_REMEDIAL_') ||
    turn.startsWith('PRAC_') ||
    id.startsWith('PRACTICE_') ||
    id.startsWith('ADAPTIVE_') ||
    title.includes('[bù đắp]') ||
    title.includes('[rèn luyện]')
  );
};

/**
 * So khớp ID đề thi chuẩn hóa
 */
export const isMatchingExamId = (hExamId: any, targetExamId: any): boolean => {
  if (!hExamId || !targetExamId) return false;
  const normA = String(hExamId).trim().toUpperCase();
  const normB = String(targetExamId).trim().toUpperCase();
  if (normA === normB) return true;
  const cleanA = normA.replace(/^EXAM-/, '');
  const cleanB = normB.replace(/^EXAM-/, '');
  return cleanA === cleanB;
};

/**
 * So khớp chính xác một lượt làm bài (ExamResult / attempt) với bài kiểm tra:
 * 1. Khớp qua examId (chính xác hoặc qua chuẩn hóa EXAM-)
 * 2. Khớp qua mã lượt thi turnId chứa đúng mã đề thi chuẩn (ví dụ turnId chứa SH10_004)
 * 3. So khớp theo nội dung chi tiết bài học (chỉ áp dụng khi attempt không có examId rõ ràng, vd từ Google Sheet):
 *    - Phải trùng đúng khối lớp (Khối 12 không bao giờ khớp với đề Khối 10/11)
 *    - Tiêu đề hoặc chủ đề cốt lõi phải trùng khớp chính xác 100% nội dung bài học
 */
export const isExamAttemptMatching = (
  attempt: any,
  targetExamOrId: Exam | string | null | undefined
): boolean => {
  if (!attempt || !targetExamOrId) return false;
  if (attempt === targetExamOrId) return true;
  if (isRemedialOrPracticeTurn(attempt)) return false;

  const targetId = typeof targetExamOrId === 'string' ? targetExamOrId : targetExamOrId.id;
  const targetExam = typeof targetExamOrId === 'object' ? targetExamOrId : null;

  const attExamId = String(attempt.examId || '').trim();
  const tgtExamId = String(targetId || '').trim();

  // 1. So khớp trực tiếp qua ID
  if (attExamId && tgtExamId) {
    if (isMatchingExamId(attExamId, tgtExamId)) {
      return true;
    }
    // Nếu cả 2 đều có mã đề chuẩn theo khối (ví dụ SH10_001, SH10_004, SH10_005) mà khác nhau:
    // Tuyệt đối KHÔNG khớp (đây là 2 bài kiểm tra riêng biệt khác nhau)
    if (isStandardExamId(attExamId) && isStandardExamId(tgtExamId) && attExamId.toUpperCase() !== tgtExamId.toUpperCase()) {
      return false;
    }
  }

  // 2. Khớp qua mã lượt thi turnId (nếu chứa mã đề chuẩn có độ dài >= 6)
  if (tgtExamId && tgtExamId.length >= 6 && attempt.turnId) {
    const normTurn = String(attempt.turnId).toUpperCase();
    const normTgt = tgtExamId.toUpperCase();
    if (normTurn.includes(`_${normTgt}_`) || normTurn.endsWith(`_${normTgt}`) || normTurn.startsWith(`${normTgt}_`) || normTurn === normTgt) {
      return true;
    }
  }

  // 3. So khớp theo nội dung chi tiết bài học / bài kiểm tra
  // (Chỉ áp dụng khi attempt không có mã đề thi rõ ràng, ví dụ dữ liệu đồng bộ từ Google Sheet 02_KET_QUA_THI)
  if (targetExam) {
    // 3a. Kiểm tra khối lớp: Khối 12 không bao giờ khớp với đề Khối 10/11
    const attemptGrade = getExamGrade(attempt) || getStudentGrade(attempt);
    const targetGrade = getExamGrade(targetExam);
    if (attemptGrade && targetGrade && attemptGrade !== targetGrade) {
      return false;
    }

    const attTitle = (attempt.examTitle || attempt.title || attempt.lessonName || '').trim();
    const tgtTitle = (targetExam.title || '').trim();
    const tgtLesson = (targetExam.lessonName || targetExam.topic || '').trim();

    if (!attTitle || (!tgtTitle && !tgtLesson)) return false;

    // Chuẩn hóa toàn bộ tiêu đề (bỏ dấu tiếng Việt, loại bỏ từ khóa phụ)
    const normAtt = getLessonNormalizedKey(attTitle);
    const normTgtTitle = getLessonNormalizedKey(tgtTitle);
    const normTgtLesson = getLessonNormalizedKey(tgtLesson);

    // Khớp tiêu đề chuẩn hóa hoàn toàn (toàn bộ nội dung bài học)
    if (normAtt && (normAtt === normTgtTitle || normAtt === normTgtLesson)) {
      return true;
    }

    // So khớp theo chủ đề cốt lõi của bài học (bỏ tiền tố "Bài X")
    const coreAtt = extractCoreTopic(attTitle);
    const coreTgtTitle = extractCoreTopic(tgtTitle);
    const coreTgtLesson = extractCoreTopic(tgtLesson);

    // Chỉ so khớp nếu nội dung chủ đề cốt lõi đủ dài (>= 6 ký tự) và khớp chính xác 100%
    if (coreAtt && coreAtt.length >= 6) {
      if (coreAtt === coreTgtTitle || coreAtt === coreTgtLesson) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Kiểm tra quyền làm bài thi của học sinh:
 * - Mỗi 1 bài kiểm tra, mỗi tài khoản học chỉ làm được 1 lần.
 * - Khi các em hoàn thành xong "Luyện Tập Bù Đắp Lỗ Hỏng" và kết quả "Đánh giá tiến độ" trên 80% các em mới được làm lại đề gốc kiểm tra.
 */
export const checkExamAttemptPermission = (
  examId: string,
  user: User | null | undefined,
  isAdmin: boolean = false,
  exam?: Exam | null
): ExamAttemptPermission => {
  // Giáo viên hoặc Admin (SĐT 0966000224 hoặc 0912345678) được xem thử và làm bài không giới hạn
  const phone = (user?.phone || '').toString().trim().replace(/^0+/, '');
  const isAdminPhone = phone === '966000224' || user?.phone === '0966000224' || phone === '912345678' || user?.phone === '0912345678';
  const isActualAdmin = isAdmin || (user?.role === UserRole.ADMIN && isAdminPhone);
  if (isActualAdmin) {
    return {
      canTake: true,
      hasTaken: false,
      attemptsCount: 0,
      isRemedialCompleted: true,
      remedialPercent: 100,
      isUnlocked: true,
      profile: null,
      message: 'Tài khoản Giáo viên / Quản trị viên: Có quyền kiểm tra không giới hạn.'
    };
  }

  // Khách chưa đăng nhập: xử lý qua luồng đăng nhập
  if (!user || user.isGuest || user.phone === 'guest') {
    return {
      canTake: false,
      hasTaken: false,
      attemptsCount: 0,
      isRemedialCompleted: false,
      remedialPercent: 0,
      isUnlocked: false,
      profile: null,
      message: 'Học sinh cần đăng nhập tài khoản để vào làm bài kiểm tra.'
    };
  }

  // Tách riêng lượt làm đề gốc và lượt luyện tập bù đắp của đề thi này
  const allMatchingHistory = (user.examHistory || []).filter(h => h && isExamAttemptMatching(h, exam || examId));
  const originalAttempts = allMatchingHistory.filter(h => !isRemedialOrPracticeTurn(h));
  const remedialTurns = allMatchingHistory.filter(h => isRemedialOrPracticeTurn(h));

  const attemptsCount = originalAttempts.length;
  const hasTaken = attemptsCount > 0;

  // Lần đầu tiên: Được làm bài (mỗi bài kiểm tra, mỗi tài khoản học làm được 1 lần)
  if (!hasTaken) {
    return {
      canTake: true,
      hasTaken: false,
      attemptsCount: 0,
      isRemedialCompleted: false,
      remedialPercent: 0,
      isUnlocked: true,
      profile: null,
      message: 'Mỗi bài kiểm tra chỉ làm 1 lần. Hãy sẵn sàng làm bài!'
    };
  }

  // ĐÃ LÀM ÍT NHẤT 1 LẦN TRÊN ĐỀ GỐC:
  const lastAttempt = originalAttempts[0];
  const lastAttemptTime = lastAttempt.date ? new Date(lastAttempt.date).getTime() : 0;
  const lastScore10 = typeof lastAttempt.score10 === 'number'
    ? lastAttempt.score10
    : (lastAttempt.totalQuestions ? Math.round((lastAttempt.score / lastAttempt.totalQuestions) * 10 * 10) / 10 : 0);

  // Lấy hồ sơ năng lực đã lưu của lượt thi gần nhất
  const savedProfile = getSavedCompetencyProfile(examId, user.phone);
  const attemptProfile = (lastAttempt as any).competencyProfile as StudentCompetencyProfile | undefined;

  // Ưu tiên profile có kết quả bù đắp mới nhất sau lần thi đề gốc gần nhất
  let profile: StudentCompetencyProfile | null = savedProfile || attemptProfile || null;
  if (savedProfile && attemptProfile) {
    if (attemptProfile.isRetestSubmitted && !savedProfile.isRetestSubmitted) {
      profile = attemptProfile;
    }
  }

  let isRemedialCompleted = false;
  let remedialPercent = 0;

  if (profile && profile.isRetestSubmitted) {
    const remTime = profile.remedialCompletedAt ? new Date(profile.remedialCompletedAt).getTime() : lastAttemptTime;
    // Đảm bảo kết quả bù đắp thuộc về lượt thi hiện tại (hoặc sau khi nộp đề gốc)
    if (!lastAttemptTime || !remTime || remTime >= lastAttemptTime - 5000) {
      isRemedialCompleted = true;
      if (typeof profile.practicePercent === 'number') {
        remedialPercent = profile.practicePercent;
      } else if (profile.practiceQuestions && profile.practiceQuestions.length > 0 && typeof profile.practiceScore === 'number') {
        remedialPercent = Math.round((profile.practiceScore / profile.practiceQuestions.length) * 100);
      }
    }
  }

  // Kiểm tra thêm từ lịch sử lượt thi bù đắp (LT_REMEDIAL_) nếu đồng bộ từ Cloud
  if (!isRemedialCompleted && remedialTurns.length > 0) {
    const latestRemTurn = remedialTurns[0];
    const remTurnTime = latestRemTurn.date ? new Date(latestRemTurn.date).getTime() : 0;
    if (!lastAttemptTime || !remTurnTime || remTurnTime >= lastAttemptTime - 5000) {
      isRemedialCompleted = true;
      const tot = Number(latestRemTurn.totalQuestions) || 0;
      const sc = Number(latestRemTurn.score) || 0;
      remedialPercent = tot > 0 ? Math.round((sc / tot) * 100) : Math.round((Number(latestRemTurn.score10) || 0) * 10);
    }
  }

  // ĐIỀU KIỆN MỞ KHÓA BẮT BUỘC:
  // Đã hoàn thành xong "Luyện Tập Bù Đắp Lỗ Hỏng" VÀ kết quả "Đánh giá tiến độ" trên 80% (> 80%)
  const isUnlocked = isRemedialCompleted && remedialPercent > 80;

  if (isUnlocked) {
    return {
      canTake: true,
      hasTaken: true,
      attemptsCount,
      lastScore10,
      isRemedialCompleted: true,
      remedialPercent,
      isUnlocked: true,
      profile,
      message: `Đã mở khóa! Em đã hoàn thành "Luyện Tập Bù Đắp Lỗ Hỏng" và kết quả "Đánh giá tiến độ" đạt ${remedialPercent}% (trên 80%). Em được phép làm lại đề gốc kiểm tra!`
    };
  }

  return {
    canTake: false,
    hasTaken: true,
    attemptsCount,
    lastScore10,
    isRemedialCompleted,
    remedialPercent,
    isUnlocked: false,
    profile,
    message: isRemedialCompleted
      ? `Em đã hoàn thành "Luyện Tập Bù Đắp Lỗ Hỏng" nhưng kết quả "Đánh giá tiến độ" mới đạt ${remedialPercent}% (yêu cầu trên 80%). Em hãy ôn lại lý thuyết và làm lại bài luyện tập bù đắp đạt trên 80% để được làm lại đề gốc kiểm tra nhé!`
      : 'Mỗi bài kiểm tra, mỗi tài khoản học sinh chỉ làm được 1 lần. Khi hoàn thành xong "Luyện Tập Bù Đắp Lỗ Hỏng" và kết quả "Đánh giá tiến độ" trên 80% em mới được làm lại đề gốc kiểm tra.'
  };
};

/**
 * Lưu hồ sơ năng lực vào bộ nhớ máy
 */
export const saveCompetencyProfile = (profile: StudentCompetencyProfile, userPhone: string) => {
  try {
    const key = `bio_profile_${userPhone || 'guest'}_${profile.examId}`;
    localStorage.setItem(key, JSON.stringify(profile));
    
    // Cập nhật danh sách tổng hợp
    const listKey = `bio_profile_list_${userPhone || 'guest'}`;
    const raw = localStorage.getItem(listKey);
    let list: StudentCompetencyProfile[] = raw ? JSON.parse(raw) : [];
    list = [profile, ...list.filter(p => p.examId !== profile.examId)];
    localStorage.setItem(listKey, JSON.stringify(list));
  } catch (e) {
    console.error("Lỗi lưu hồ sơ năng lực:", e);
  }
};

/**
 * Lấy hồ sơ năng lực đã lưu của một bài kiểm tra
 */
export const getSavedCompetencyProfile = (examId: string, userPhone: string): StudentCompetencyProfile | null => {
  try {
    const key = `bio_profile_${userPhone || 'guest'}_${examId}`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};
