export const HANDLE_REGISTER_SNIPPET = `// =====================================================================
// HÀM ĐĂNG KÝ HỌC SINH MỚI VÀO SHEET 01_HOC_SINH (FIX LỖI THIẾU HÀM)
// =====================================================================
function handleRegister(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("01_HOC_SINH");
  
  if (!sheet) {
    sheet = ss.insertSheet("01_HOC_SINH");
    sheet.appendRow([
      "ID_HocSinh", "Ho_Va_Ten", "Khoi_Lop", "So_Dien_Thoai", 
      "Mat_Khau", "Trang_Thai", "Tong_Diem_Tich_Luy", "Ngay_Dang_Ky"
    ]);
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#e2e8f0");
  }
  
  var name = (data.name || data.Ho_Va_Ten || "").toString().trim();
  var className = (data.className || data.Khoi_Lop || "").toString().trim().toUpperCase();
  var rawPhone = (data.phone || data.So_Dien_Thoai || "").toString().trim();
  var password = (data.password || data.Mat_Khau || "").toString().trim();
  var status = data.Trang_Thai || "Mở"; // Mặc định: Mở (Học sinh có thể đăng nhập ngay)
  
  if (!rawPhone || !name) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Vui lòng nhập đầy đủ họ tên và số điện thoại."
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var cleanPhone = rawPhone.replace(/\\D/g, "");
  var noZeroPhone = cleanPhone.replace(/^0+/, "");
  var classPrefix = className.replace(/[^A-Za-z0-9]/g, "") || "HS";
  
  var values = sheet.getDataRange().getValues();
  var existingIds = {};
  var maxSuffixInClass = 0;
  
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var existingPhone = (row[3] || "").toString().trim().replace(/\\D/g, "");
    var existingNoZero = existingPhone.replace(/^0+/, "");
    
    if (existingPhone === cleanPhone || (noZeroPhone && existingNoZero === noZeroPhone)) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: "Số điện thoại " + rawPhone + " đã được đăng ký trước đó. Vui lòng đăng nhập hoặc sử dụng số khác."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var rowId = (row[0] || "").toString().trim().toUpperCase();
    if (rowId) {
      existingIds[rowId] = true;
      if (rowId.indexOf(classPrefix) === 0) {
        var suffixStr = rowId.substring(classPrefix.length).replace(/\\D/g, "");
        if (suffixStr) {
          var sNum = parseInt(suffixStr, 10);
          if (!isNaN(sNum) && sNum > maxSuffixInClass) {
            maxSuffixInClass = sNum;
          }
        }
      }
    }
  }
  
  // TẠO ID MỚI: KIỂM TRA ID DO CLIENT GỬI HOẶC TỰ SINH DỰA TRÊN SỐ THỨ TỰ LỚN NHẤT + 1
  var providedId = (data.ID_HocSinh || data.studentId || "").toString().trim().toUpperCase();
  var studentId = "";

  if (providedId && !existingIds[providedId]) {
    studentId = providedId;
  } else {
    var nextIndex = maxSuffixInClass + 1;
    var indexStr = nextIndex < 10 ? "0" + nextIndex : "" + nextIndex;
    var candidateId = classPrefix + indexStr;

    while (existingIds[candidateId.toUpperCase()]) {
      nextIndex++;
      indexStr = nextIndex < 10 ? "0" + nextIndex : "" + nextIndex;
      candidateId = classPrefix + indexStr;
    }
    studentId = candidateId;
  }
  
  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");
  var phoneToStore = cleanPhone.startsWith("0") ? "'" + cleanPhone : cleanPhone;
  var idToStore = "'" + studentId;
  
  sheet.appendRow([
    idToStore, name, className, phoneToStore, password, status, 0, dateStr
  ]);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Đăng ký thành công!",
    student: {
      ID_HocSinh: studentId,
      studentId: studentId,
      Ho_Va_Ten: name,
      name: name,
      Khoi_Lop: className,
      className: className,
      So_Dien_Thoai: cleanPhone,
      phone: cleanPhone,
      Trang_Thai: status,
      totalScore: 0
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// HÀM XÓA HỌC SINH & TỰ ĐỘNG XÓA BÀI THI, LỘ TRÌNH LIÊN QUAN (CASCADE DELETE)
// =====================================================================
function handleDeleteStudent(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var targetId = (data.studentId || data.id || data.ID_HocSinh || "").toString().trim().toUpperCase();
  var targetPhone = (data.phone || data.So_Dien_Thoai || "").toString().trim().replace(/\\D/g, "");
  var targetNoZero = targetPhone.replace(/^0+/, "");
  var targetName = (data.name || data.Ho_Va_Ten || "").toString().trim().toLowerCase();

  var deletedFromResults = 0;

  // 1. Xóa khỏi Sheet 01_HOC_SINH
  var sheetHS = ss.getSheetByName("01_HOC_SINH");
  if (sheetHS) {
    var hsValues = sheetHS.getDataRange().getValues();
    for (var i = hsValues.length - 1; i >= 1; i--) {
      var row = hsValues[i];
      var rId = (row[0] || "").toString().trim().toUpperCase();
      var rPhone = (row[3] || "").toString().trim().replace(/\\D/g, "");
      var rNoZero = rPhone.replace(/^0+/, "");
      if ((targetId && rId === targetId) || (targetPhone && (rPhone === targetPhone || rNoZero === targetNoZero))) {
        sheetHS.deleteRow(i + 1);
      }
    }
  }

  // 2. Tự động xóa sạch toàn bộ bài thi trong 02_KET_QUA_THI
  var sheetResults = ss.getSheetByName("02_KET_QUA_THI");
  if (sheetResults) {
    var resValues = sheetResults.getDataRange().getValues();
    for (var j = resValues.length - 1; j >= 1; j--) {
      var resRow = resValues[j];
      var resId = (resRow[1] || "").toString().trim().toUpperCase();
      var resPhone = (resRow[1] || "").toString().trim().replace(/\\D/g, "");
      var resNoZero = resPhone.replace(/^0+/, "");
      var resName = (resRow[2] || "").toString().trim().toLowerCase();
      if ((targetId && resId === targetId) || (targetPhone && (resPhone === targetPhone || resNoZero === targetNoZero)) || (targetName && resName === targetName && (!resId || resId === targetId))) {
        sheetResults.deleteRow(j + 1);
        deletedFromResults++;
      }
    }
  }

  // 3. Tự động xóa khỏi 04_CA_NHAN_HOA
  var sheetPlan = ss.getSheetByName("04_CA_NHAN_HOA");
  if (sheetPlan) {
    var planValues = sheetPlan.getDataRange().getValues();
    for (var k = planValues.length - 1; k >= 1; k--) {
      var pId = (planValues[k][0] || "").toString().trim().toUpperCase();
      var pPhone = (planRow[0] || "").toString().trim().replace(/\\D/g, "");
      var pNoZero = pPhone.replace(/^0+/, "");
      if ((targetId && pId === targetId) || (targetPhone && (pPhone === targetPhone || pNoZero === targetNoZero))) {
        sheetPlan.deleteRow(k + 1);
      }
    }
  }

  try { updateDashboard(ss); } catch (e) {}

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Đã xóa học sinh " + (targetId || targetPhone) + " và toàn bộ " + deletedFromResults + " kết quả thi liên quan."
  })).setMimeType(ContentService.MimeType.JSON);
}`;

export const HANDLE_CASCADE_DELETE_SNIPPET = `// =====================================================================
// HÀM KHỬ TRÙNG LẶP ID & DỌN DẸP DỮ LIỆU MỒ CÔI (ORPHAN CLEANUP)
// =====================================================================
function cleanupDuplicatesAndOrphans(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetHS = ss.getSheetByName("01_HOC_SINH");
  if (!sheetHS) return { success: false, message: "Không tìm thấy Sheet 01_HOC_SINH" };
  
  var hsValues = sheetHS.getDataRange().getValues();
  var idMap = {};
  var validIds = {};
  var validPhones = {};
  var duplicateFixedCount = 0;
  
  // Bước 1: Quét và sửa các ID bị trùng lặp trong 01_HOC_SINH
  for (var i = 1; i < hsValues.length; i++) {
    var row = hsValues[i];
    var currId = (row[0] || "").toString().trim().toUpperCase();
    var currPhone = (row[3] || "").toString().trim().replace(/\\D/g, "");
    var currClass = (row[2] || "").toString().trim().toUpperCase();
    var classPrefix = currClass.replace(/[^A-Za-z0-9]/g, "") || "HS";

    if (!currId && !currPhone) continue;

    if (currId && idMap[currId] && idMap[currId] !== currPhone) {
      var maxIdx = 1;
      for (var checkI = 1; checkI < hsValues.length; checkI++) {
        var otherId = (hsValues[checkI][0] || "").toString().trim().toUpperCase();
        if (otherId.indexOf(classPrefix) === 0) {
          var sNum = parseInt(otherId.substring(classPrefix.length).replace(/\\D/g, ""), 10);
          if (!isNaN(sNum) && sNum > maxIdx) maxIdx = sNum;
        }
      }
      var newIndex = maxIdx + 1;
      var newId = classPrefix + (newIndex < 10 ? "0" + newIndex : "" + newIndex);
      while (idMap[newId]) {
        newIndex++;
        newId = classPrefix + (newIndex < 10 ? "0" + newIndex : "" + newIndex);
      }
      sheetHS.getRange(i + 1, 1).setValue("'" + newId);
      duplicateFixedCount++;
      currId = newId;
    }

    if (currId) {
      idMap[currId] = currPhone;
      validIds[currId] = true;
    }
    if (currPhone) {
      validPhones[currPhone] = true;
      validPhones[currPhone.replace(/^0+/, "")] = true;
    }
  }

  // Bước 2: Dọn dẹp dữ liệu bài thi mồ côi trong 02_KET_QUA_THI
  var sheetResults = ss.getSheetByName("02_KET_QUA_THI");
  var removedOrphanResults = 0;
  if (sheetResults) {
    var resValues = sheetResults.getDataRange().getValues();
    for (var rIdx = resValues.length - 1; rIdx >= 1; rIdx--) {
      var rRow = resValues[rIdx];
      var rSid = (rRow[1] || "").toString().trim().toUpperCase();
      var rPhone = (rRow[1] || "").toString().trim().replace(/\\D/g, "");
      var rCleanPhone = rPhone.replace(/^0+/, "");
      
      if (rSid === "GUEST" || rPhone === "966000224" || rPhone === "912345678" || rPhone === "0966000224" || rPhone === "0912345678") continue;
      
      var exists = false;
      if (rSid && validIds[rSid]) exists = true;
      if (rPhone && validPhones[rPhone]) exists = true;
      if (rCleanPhone && validPhones[rCleanPhone]) exists = true;

      if (!exists) {
        sheetResults.deleteRow(rIdx + 1);
        removedOrphanResults++;
      }
    }
  }

  // Bước 3: Dọn dẹp Sheet 04_CA_NHAN_HOA
  var sheetPlan = ss.getSheetByName("04_CA_NHAN_HOA");
  var removedOrphanPlans = 0;
  if (sheetPlan) {
    var planValues = sheetPlan.getDataRange().getValues();
    for (var pIdx = planValues.length - 1; pIdx >= 1; pIdx--) {
      var pSid = (planValues[pIdx][0] || "").toString().trim().toUpperCase();
      var pPhone = pSid.replace(/\\D/g, "");
      var pCleanPhone = pPhone.replace(/^0+/, "");

      if (pSid === "GUEST" || pPhone === "966000224" || pPhone === "912345678") continue;

      var pExists = false;
      if (pSid && validIds[pSid]) pExists = true;
      if (pPhone && validPhones[pPhone]) pExists = true;
      if (pCleanPhone && validPhones[pCleanPhone]) pExists = true;

      if (!pExists) {
        sheetPlan.deleteRow(pIdx + 1);
        removedOrphanPlans++;
      }
    }
  }

  try { updateDashboard(ss); } catch (e) {}

  return {
    success: true,
    message: "Đã xử lý xong: Sửa " + duplicateFixedCount + " ID trùng lặp; Xóa " + removedOrphanResults + " bài thi mồ côi; Xóa " + removedOrphanPlans + " hồ sơ mồ côi."
  };
}`;

export const HANDLE_CLASS_LOCK_DELETE_SNIPPET = `// =====================================================================
// HÀM KHÓA / MỞ KHÓA & XÓA HỌC SINH THEO LỚP (CASCADE DELETE TOÀN BỘ)
// =====================================================================
function handleUpdateClassStatus(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("01_HOC_SINH");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Sheet 01_HOC_SINH không tồn tại" })).setMimeType(ContentService.MimeType.JSON);
  
  var rawClass = (data.className || "").toString().trim();
  var targetClass = rawClass.toUpperCase().replace(/^LỚP\\s*/i, "").trim();
  var newStatus = data.status || "Khóa";

  var values = sheet.getDataRange().getValues();
  var updatedCount = 0;

  for (var i = 1; i < values.length; i++) {
    var rowClass = (values[i][2] || "").toString().trim().toUpperCase().replace(/^LỚP\\s*/i, "").trim();
    if (rowClass === targetClass || rowClass.indexOf(targetClass) !== -1 || targetClass.indexOf(rowClass) !== -1) {
      sheet.getRange(i + 1, 6).setValue(newStatus);
      updatedCount++;
    }
  }

  try { updateDashboard(ss); } catch (eDash) {}

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Đã cập nhật trạng thái [" + newStatus + "] cho toàn bộ " + updatedCount + " học sinh lớp " + (rawClass || targetClass) + ".",
    updatedCount: updatedCount,
    className: rawClass,
    status: newStatus
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleDeleteClassroom(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawClass = (data.className || "").toString().trim();
  var targetClass = rawClass.toUpperCase().replace(/^LỚP\\s*/i, "").trim();
  if (!targetClass) return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Thiếu tên lớp cần xóa." })).setMimeType(ContentService.MimeType.JSON);

  var deletedStudentsCount = 0;
  var deletedResultsCount = 0;
  var deletedPlanCount = 0;
  var targetIds = {};
  var targetPhones = {};

  var sheetHS = ss.getSheetByName("01_HOC_SINH");
  if (sheetHS) {
    var hsValues = sheetHS.getDataRange().getValues();
    for (var i = hsValues.length - 1; i >= 1; i--) {
      var row = hsValues[i];
      var rClass = (row[2] || "").toString().trim().toUpperCase().replace(/^LỚP\\s*/i, "").trim();
      var rId = (row[0] || "").toString().trim().toUpperCase();
      var rPhone = (row[3] || "").toString().trim().replace(/\\D/g, "");
      var rNoZero = rPhone.replace(/^0+/, "");

      if (rClass === targetClass || rClass.indexOf(targetClass) !== -1 || targetClass.indexOf(rClass) !== -1) {
        if (rId) targetIds[rId] = true;
        if (rPhone) targetPhones[rPhone] = true;
        if (rNoZero) targetPhones[rNoZero] = true;

        sheetHS.deleteRow(i + 1);
        deletedStudentsCount++;
      }
    }
  }

  var sheetResults = ss.getSheetByName("02_KET_QUA_THI");
  if (sheetResults) {
    var resValues = sheetResults.getDataRange().getValues();
    for (var j = resValues.length - 1; j >= 1; j--) {
      var resRow = resValues[j];
      var resId = (resRow[1] || "").toString().trim().toUpperCase();
      var resClass = (resRow[3] || "").toString().trim().toUpperCase().replace(/^LỚP\\s*/i, "").trim();
      var resPhone = (resRow[1] || "").toString().trim().replace(/\\D/g, "");
      var resNoZero = resPhone.replace(/^0+/, "");

      var matchClass = (resClass === targetClass || resClass.indexOf(targetClass) !== -1 || targetClass.indexOf(resClass) !== -1);
      var matchId = (resId && targetIds[resId]) || (resPhone && targetPhones[resPhone]) || (resNoZero && targetPhones[resNoZero]);

      if (matchClass || matchId) {
        sheetResults.deleteRow(j + 1);
        deletedResultsCount++;
      }
    }
  }

  var sheetPlan = ss.getSheetByName("04_CA_NHAN_HOA");
  if (sheetPlan) {
    var planValues = sheetPlan.getDataRange().getValues();
    for (var k = planValues.length - 1; k >= 1; k--) {
      var planRow = planValues[k];
      var pId = (planRow[0] || "").toString().trim().toUpperCase();
      var pPhone = pId.replace(/\\D/g, "");
      var pNoZero = pPhone.replace(/^0+/, "");

      if ((pId && targetIds[pId]) || (pPhone && targetPhones[pPhone]) || (pNoZero && targetPhones[pNoZero])) {
        sheetPlan.deleteRow(k + 1);
        deletedPlanCount++;
      }
    }
  }

  try { updateDashboard(ss); } catch (eDash) {}

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Đã xóa toàn bộ " + deletedStudentsCount + " học sinh lớp " + (rawClass || targetClass) + " và cascade delete " + deletedResultsCount + " kết quả thi liên quan.",
    deletedCount: {
      students: deletedStudentsCount,
      examResults: deletedResultsCount,
      personalization: deletedPlanCount
    }
  })).setMimeType(ContentService.MimeType.JSON);
}`;

export const HANDLE_SHEET02_SNIPPET = `// =====================================================================
// ĐOẠN CODE GHI SHEET 02_KET_QUA_THI (GHI ĐẦY ĐỦ CỘT J, K, L SỐ CÂU SAI THEO MỨC ĐỘ)
// =====================================================================
function recordSheet02KetQuaThi(ss, res, usr, data, correctQ, totalQ, score10, timestamp, maLuot) {
  var sheetResults = ss.getSheetByName("02_KET_QUA_THI");
  if (!sheetResults) {
    sheetResults = ss.insertSheet("02_KET_QUA_THI");
    sheetResults.appendRow([
      "Ma_Luot_Thi", "ID_HocSinh", "Ho_Va_Ten", "Khoi_Lop", "Ten_Bai_Hoc",
      "So_Cau_Dung", "Tong_So_Cau", "Diem_He_10", "Thoi_Gian_Lam_Giay",
      "So_Cau_Sai_NhanBiet", "So_Cau_Sai_ThongHieu", "So_Cau_Sai_VanDung", "Thoi_Diem_Nop"
    ]);
    sheetResults.getRange(1, 1, 1, 13).setFontWeight("bold").setBackground("#e2e8f0");
  }

  // TÍNH TOÁN CHÍNH XÁC SỐ LƯỢNG CÂU HỎI SAI THEO MỨC ĐỘ NHẬN THỨC
  var wrongNB = (res.wrongNhanBiet !== undefined && res.wrongNhanBiet !== null) ? Number(res.wrongNhanBiet) : -1;
  var wrongTH = (res.wrongThongHieu !== undefined && res.wrongThongHieu !== null) ? Number(res.wrongThongHieu) : -1;
  var wrongVD = (res.wrongVanDung !== undefined && res.wrongVanDung !== null) ? Number(res.wrongVanDung) : -1;
  var wrongTotal = Math.max(0, totalQ - correctQ);

  if ((wrongNB < 0 || wrongTH < 0 || wrongVD < 0) || (wrongNB === 0 && wrongTH === 0 && wrongVD === 0 && wrongTotal > 0)) {
    var cNB = 0;
    var cTH = 0;
    var cVD = 0;
    var hasDetails = false;

    if (res.details && Array.isArray(res.details) && res.details.length > 0) {
      for (var dIdx = 0; dIdx < res.details.length; dIdx++) {
        var dt = res.details[dIdx];
        if (dt && !dt.isCorrect) {
          hasDetails = true;
          var levelStr = (dt.cognitiveLevel || "").toString().toUpperCase();
          var qText = (dt.questionText || "").toString().toLowerCase();

          if (levelStr.indexOf("NHAN_BIET") !== -1 || levelStr.indexOf("NHẬN BIẾT") !== -1 || qText.indexOf("[nhận biết]") !== -1 || qText.indexOf("nhận biết") !== -1) {
            cNB++;
          } else if (levelStr.indexOf("THONG_HIEU") !== -1 || levelStr.indexOf("THÔNG HIỂU") !== -1 || qText.indexOf("[thông hiểu]") !== -1 || qText.indexOf("thông hiểu") !== -1) {
            cTH++;
          } else if (levelStr.indexOf("VAN_DUNG") !== -1 || levelStr.indexOf("VẬN DỤNG") !== -1 || qText.indexOf("[vận dụng]") !== -1 || qText.indexOf("vận dụng") !== -1) {
            cVD++;
          } else {
            if (dIdx < Math.ceil(res.details.length * 0.4)) {
              cNB++;
            } else if (dIdx < Math.ceil(res.details.length * 0.75)) {
              cTH++;
            } else {
              cVD++;
            }
          }
        }
      }
    }

    if (hasDetails) {
      wrongNB = cNB;
      wrongTH = cTH;
      wrongVD = cVD;
    } else if (wrongTotal > 0) {
      wrongNB = Math.round(wrongTotal * 0.4);
      wrongTH = Math.round(wrongTotal * 0.35);
      wrongVD = Math.max(0, wrongTotal - wrongNB - wrongTH);
    } else {
      wrongNB = 0;
      wrongTH = 0;
      wrongVD = 0;
    }
  }

  wrongNB = Math.max(0, Number(wrongNB) || 0);
  wrongTH = Math.max(0, Number(wrongTH) || 0);
  wrongVD = Math.max(0, Number(wrongVD) || 0);

  // Ghi vào dòng tiếp theo của Sheet 02_KET_QUA_THI
  sheetResults.appendRow([
    maLuot,
    usr.studentId || data.phone || "",
    usr.name || "",
    usr.className || "",
    res.examTitle || "Bài kiểm tra Sinh học",
    correctQ,
    totalQ,
    score10,
    res.timeSpentSeconds || 60,
    wrongNB, // Cột J: So_Cau_Sai_NhanBiet
    wrongTH, // Cột K: So_Cau_Sai_ThongHieu
    wrongVD, // Cột L: So_Cau_Sai_VanDung
    timestamp // Cột M: Thoi_Diem_Nop
  ]);
}`;

export const HANDLE_SHEET03_SNIPPET = `// =====================================================================
// ĐOẠN CODE GHI SHEET 03_LO_HONG_KIEN_THUC (CHUẨN DÒNG 1 TIÊU ĐỀ, DÒNG 2 DỮ LIỆU)
// =====================================================================
function recordSheet03LoHong(ss, res, usr, correctQ, totalQ, score10) {
  var sheet3 = ss.getSheetByName("03_LO_HONG_KIEN_THUC");
  if (!sheet3) {
    sheet3 = ss.insertSheet("03_LO_HONG_KIEN_THUC");
  }

  var headers03 = [
    "Tên bài học", 
    "Số câu sai", 
    "Điểm hệ 10", 
    "Nội dung kiến thức hổng", 
    "Mức độ nhận thức", 
    "Đánh giá tiến bộ"
  ];

  // ĐẢM BẢO THỨ TỰ 1 (DÒNG 1) LUÔN LÀ NỘI DUNG TIÊU ĐỀ CÁC CỘT
  if (sheet3.getLastRow() === 0) {
    sheet3.appendRow(headers03);
    sheet3.getRange(1, 1, 1, headers03.length).setFontWeight("bold").setBackground("#e2e8f0");
  } else {
    // Nếu dòng 1 bị ghi đè bởi dữ liệu bài thi (chưa có dòng tiêu đề), tự động chèn dòng tiêu đề lên trên
    var cellA1 = (sheet3.getRange(1, 1).getValue() || "").toString().trim().toLowerCase();
    if (cellA1.startsWith("bài ") || cellA1.startsWith("bai ") || cellA1.includes("dna") || cellA1.includes("gene")) {
      sheet3.insertRowBefore(1);
      sheet3.getRange(1, 1, 1, headers03.length).setValues([headers03]);
      sheet3.getRange(1, 1, 1, headers03.length).setFontWeight("bold").setBackground("#e2e8f0");
    }
  }

  var wrongCount = Math.max(0, totalQ - correctQ);
  var score10Str = score10.toString().replace('.', ',');
  var compProfile = res.competencyProfile || {};
  var weakLevel = compProfile.weakLevel || (score10 < 5.0 ? "Nhận biết" : score10 < 8.0 ? "Thông hiểu" : "Vận dụng");

  var weakDetails = "";
  if (compProfile.errorItems && compProfile.errorItems.length > 0) {
    weakDetails = "[Luyện lại kiến thức hổng] " + (compProfile.errorItems[0].questionText || "").replace(/\\[.*?\\]/g, '').trim();
  } else if (res.details && res.details.length > 0) {
    var wrongDetails = res.details.filter(function(d) { return !d.isCorrect; });
    if (wrongDetails.length > 0) {
      weakDetails = "[Luyện lại kiến thức hổng] " + (wrongDetails[0].questionText || "").replace(/\\[.*?\\]/g, '').trim();
    }
  }
  if (!weakDetails) weakDetails = "[Củng cố] " + (res.examTitle || "Bài kiểm tra Sinh học");

  var progressNote = score10 >= 9.0 ? "⭐ Xuất sắc" : (score10 >= 7.0 ? "🟢 Khá (Rèn thêm câu Vận dụng)" : "🟡 Đạt chuẩn");

  // GHI DỮ LIỆU TỰ ĐỘNG VÀO TỪ DÒNG THỨ 2 TRỞ ĐI
  sheet3.appendRow([
    res.examTitle || "Bài kiểm tra Sinh học",
    wrongCount,
    score10Str,
    weakDetails,
    weakLevel,
    progressNote
  ]);
}`;

export const HANDLE_SHEET06_SNIPPET = `// =====================================================================
// ĐOẠN CODE GHI & ĐỒNG BỘ SHEET 06_DE_THI (LƯU ĐỀ THI ADMIN GIÁO VIÊN)
// =====================================================================
function handleCreateExam(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("06_DE_THI");
  if (!sheet) {
    sheet = ss.insertSheet("06_DE_THI");
    sheet.appendRow([
      "ID_DeThi", "Tieu_De", "Khoi_Lop", "Chuyen_Muc", "Chu_De", "Ten_Bai_Hoc",
      "YCCD", "Thoi_Gian_Phut", "So_Cau_Hoi", "Du_Lieu_Cau_Hoi_JSON", "Nguoi_Tao",
      "Thoi_Diem_Tao", "Trang_Thai"
    ]);
    sheet.getRange(1, 1, 1, 13).setFontWeight("bold").setBackground("#e2e8f0");
  }

  var exam = data.exam || data;
  var examId = (exam.id || ("exam-" + new Date().getTime())).toString().trim();
  var title = (exam.title || "Bài kiểm tra Sinh học").toString().trim();
  var grade = (exam.grade || "Lớp 10").toString().trim();
  var category = (exam.category || "Sinh 10").toString().trim();
  var topic = (exam.topic || "").toString().trim();
  var lessonName = (exam.lessonName || "").toString().trim();
  var yccd = (exam.learningObjectives || "").toString().trim();
  var duration = Number(exam.duration || 15);
  var questions = exam.questions || [];
  var questionsJson = JSON.stringify(questions);
  var createdBy = (exam.createdBy || "Admin Giáo Viên").toString().trim();
  if (/lâm\s*thái\s*hiển/i.test(createdBy)) {
    createdBy = "Admin Giáo Viên";
  }
  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");
  var status = "Hiển thị";

  var values = sheet.getDataRange().getValues();
  var existingRow = -1;
  for (var i = 1; i < values.length; i++) {
    var rowId = (values[i][0] || "").toString().trim();
    if (rowId === examId) {
      existingRow = i + 1;
      break;
    }
  }

  var rowData = [
    examId, title, grade, category, topic, lessonName,
    yccd, duration, questions.length, questionsJson, createdBy,
    dateStr, status
  ];

  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Lưu đề thi lên Google Sheet 06_DE_THI thành công!",
    examId: examId
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleGetExams(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("06_DE_THI");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ success: true, exams: [] })).setMimeType(ContentService.MimeType.JSON);
  }

  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ success: true, exams: [] })).setMimeType(ContentService.MimeType.JSON);
  }

  var exams = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var status = (row[12] || "").toString().trim();
    if (status.toLowerCase() === "đã xóa" || status.toLowerCase() === "deleted" || status.toLowerCase() === "ẩn") continue;

    var examId = (row[0] || "").toString().trim();
    if (!examId) continue;

    var rawQuestions = row[9];
    var questions = [];
    try {
      if (typeof rawQuestions === "string" && rawQuestions.trim()) {
        questions = JSON.parse(rawQuestions);
      } else if (Array.isArray(rawQuestions)) {
        questions = rawQuestions;
      }
    } catch (e) { questions = []; }

    var creatorRaw = (row[10] || "Admin Giáo Viên").toString();
    if (/lâm\s*thái\s*hiển/i.test(creatorRaw)) {
      creatorRaw = "Admin Giáo Viên";
    }

    exams.push({
      id: examId,
      title: (row[1] || "").toString(),
      grade: (row[2] || "").toString(),
      category: (row[3] || "").toString(),
      topic: (row[4] || "").toString(),
      lessonName: (row[5] || "").toString(),
      learningObjectives: (row[6] || "").toString(),
      duration: Number(row[7]) || 15,
      questions: questions,
      createdBy: creatorRaw,
      createdAt: (row[11] || "").toString()
    });
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true, exams: exams })).setMimeType(ContentService.MimeType.JSON);
}

function handleDeleteExam(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("06_DE_THI");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Sheet 06_DE_THI chưa tạo" })).setMimeType(ContentService.MimeType.JSON);

  var targetId = (data.examId || data.id || "").toString().trim();
  if (!targetId) return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Thiếu mã đề thi" })).setMimeType(ContentService.MimeType.JSON);

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var rowId = (values[i][0] || "").toString().trim();
    if (rowId === targetId || rowId.replace(/^exam-/, "") === targetId.replace(/^exam-/, "")) {
      sheet.getRange(i + 1, 13).setValue("Đã xóa");
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Đã xóa đề thi thành công!" })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Không tìm thấy mã đề trên Sheet" })).setMimeType(ContentService.MimeType.JSON);
}`;

export const HANDLE_DASHBOARD_SNIPPET = `// =====================================================================
// HÀM TÍNH TOÁN & CẬP NHẬT SHEET 05_DASHBOARD (BÁO CÁO THỐNG KÊ TOÀN TRƯỜNG)
// =====================================================================
function handleUpdateDashboard(params) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = updateDashboard(ss);
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "Cập nhật thành công Sheet 05_DASHBOARD",
      data: result
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Lỗi cập nhật 05_DASHBOARD: " + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Menu tùy chỉnh khi mở Google Sheet: Cho phép Thầy/Cô bấm cập nhật Dashboard bằng 1 cú nhấp chuột
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('📊 LMS Sinh Học')
      .addItem('🔄 Cập nhật Sheet 05_DASHBOARD ngay', 'menuUpdateDashboard')
      .addToUi();
  } catch (e) {}
}

function menuUpdateDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = updateDashboard(ss);
  SpreadsheetApp.getUi().alert(
    '✅ CẬP NHẬT THÀNH CÔNG SHEET 05_DASHBOARD!\\n\\n' +
    '• Tổng số HS đang hoạt động: ' + res.activeStudents + ' học sinh\\n' +
    '• Tổng lượt nộp bài: ' + res.totalAttempts + ' lượt\\n' +
    '• Điểm trung bình toàn trường: ' + res.avgScore + '/10\\n' +
    '• Số học sinh dưới trung bình: ' + res.countNeedingHelp + ' em'
  );
}

/**
 * Hàm lõi tính toán và điền tự động dữ liệu vào Sheet 05_DASHBOARD
 */
function updateDashboard(ss) {
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) return { activeStudents: 0, totalAttempts: 0, avgScore: 0, countNeedingHelp: 0 };

  var sheetDash = ss.getSheetByName("05_DASHBOARD");
  if (!sheetDash) {
    sheetDash = ss.insertSheet("05_DASHBOARD");
  }

  // 1. ĐỌC DỮ LIỆU TỪ SHEET 01_HOC_SINH
  var sheetHS = ss.getSheetByName("01_HOC_SINH");
  var hsData = sheetHS ? sheetHS.getDataRange().getValues() : [];
  var totalStudents = 0;
  var activeStudents = 0;
  var lockedStudents = 0;
  var classStudentCount = {};

  for (var i = 1; i < hsData.length; i++) {
    var rHS = hsData[i];
    var sId = (rHS[0] || '').toString().trim();
    var sName = (rHS[1] || '').toString().trim();
    var sClass = (rHS[2] || 'Chưa phân lớp').toString().trim().toUpperCase();
    var sStatus = (rHS[5] || 'Mở').toString().trim().toLowerCase();

    if (!sId && !sName) continue;
    totalStudents++;

    if (sStatus === 'đóng' || sStatus === 'dong' || sStatus === 'lock' || sStatus === 'locked') {
      lockedStudents++;
    } else {
      activeStudents++;
    }

    if (sClass) {
      classStudentCount[sClass] = (classStudentCount[sClass] || 0) + 1;
    }
  }

  // 2. ĐỌC DỮ LIỆU TỪ SHEET 02_KET_QUA_THI
  var sheetKQ = ss.getSheetByName("02_KET_QUA_THI");
  var kqData = sheetKQ ? sheetKQ.getDataRange().getValues() : [];
  var totalAttempts = 0;
  var totalScore10Sum = 0;
  var countPass5 = 0;
  var countGood8 = 0;
  var countBelow5 = 0;

  var totalWrongNB = 0;
  var totalWrongTH = 0;
  var totalWrongVD = 0;

  var lessonStats = {};
  var studentStats = {};
  var classAttemptStats = {};

  for (var j = 1; j < kqData.length; j++) {
    var rKQ = kqData[j];
    var stId = (rKQ[1] || '').toString().trim();
    var stName = (rKQ[2] || '').toString().trim();
    var stClass = (rKQ[3] || 'Chưa phân lớp').toString().trim().toUpperCase();
    var lName = (rKQ[4] || 'Bài kiểm tra Sinh học').toString().trim();
    var scoreRaw = (rKQ[7] !== undefined && rKQ[7] !== null) ? rKQ[7] : '';
    var scoreNum = parseFloat(String(scoreRaw).replace(',', '.'));
    if (isNaN(scoreNum)) scoreNum = 0;

    var wNB = Number(rKQ[9]) || 0;
    var wTH = Number(rKQ[10]) || 0;
    var wVD = Number(rKQ[11]) || 0;

    totalAttempts++;
    totalScore10Sum += scoreNum;

    if (scoreNum >= 8.0) countGood8++;
    if (scoreNum >= 5.0) countPass5++;
    else countBelow5++;

    totalWrongNB += wNB;
    totalWrongTH += wTH;
    totalWrongVD += wVD;

    // Thống kê bài học
    if (!lessonStats[lName]) {
      lessonStats[lName] = { attempts: 0, totalWrong: 0, scoreSum: 0, wrongNB: 0, wrongTH: 0, wrongVD: 0 };
    }
    lessonStats[lName].attempts++;
    lessonStats[lName].scoreSum += scoreNum;
    lessonStats[lName].totalWrong += (wNB + wTH + wVD);
    lessonStats[lName].wrongNB += wNB;
    lessonStats[lName].wrongTH += wTH;
    lessonStats[lName].wrongVD += wVD;

    // Thống kê học sinh
    var stKey = stId || stName;
    if (stKey) {
      if (!studentStats[stKey]) {
        studentStats[stKey] = { id: stId, name: stName, className: stClass, scores: [], latestScore: scoreNum, totalWrong: 0 };
      }
      studentStats[stKey].scores.push(scoreNum);
      studentStats[stKey].latestScore = scoreNum;
      studentStats[stKey].totalWrong += (wNB + wTH + wVD);
    }

    // Thống kê lớp
    if (!classAttemptStats[stClass]) {
      classAttemptStats[stClass] = { attempts: 0, scoreSum: 0, below5: 0 };
    }
    classAttemptStats[stClass].attempts++;
    classAttemptStats[stClass].scoreSum += scoreNum;
    if (scoreNum < 5.0) classAttemptStats[stClass].below5++;
  }

  // 3. ĐỌC SHEET 04_CA_NHAN_HOA
  var sheet04 = ss.getSheetByName("04_CA_NHAN_HOA");
  var d04 = sheet04 ? sheet04.getDataRange().getValues() : [];
  var interventionStudentsFrom04 = {};
  for (var m = 1; m < d04.length; m++) {
    var r04 = d04[m];
    var sid4 = (r04[0] || '').toString().trim();
    var sname4 = (r04[1] || '').toString().trim();
    var level4 = (r04[2] || '').toString().trim();
    var weakTopic4 = (r04[3] || '').toString().trim();
    if (level4 === 'Cần phụ đạo' || level4 === 'Trung bình') {
      var key4 = sid4 || sname4;
      interventionStudentsFrom04[key4] = {
        id: sid4,
        name: sname4,
        level: level4,
        weakTopic: weakTopic4
      };
    }
  }

  // 4. TỔNG HỢP SỐ LIỆU
  var avgScore = totalAttempts > 0 ? Math.round((totalScore10Sum / totalAttempts) * 10) / 10 : 0;
  var passRate = totalAttempts > 0 ? Math.round((countPass5 / totalAttempts) * 1000) / 10 : 100;
  var goodRate = totalAttempts > 0 ? Math.round((countGood8 / totalAttempts) * 1000) / 10 : 0;

  var studentsNeedingHelp = [];
  for (var k in studentStats) {
    var st = studentStats[k];
    var stAvg = st.scores.reduce(function(a, b){ return a + b; }, 0) / st.scores.length;
    stAvg = Math.round(stAvg * 10) / 10;
    st.avgScore = stAvg;
    if (stAvg < 5.0 || st.latestScore < 5.0 || interventionStudentsFrom04[k]) {
      studentsNeedingHelp.push(st);
    }
  }
  var countNeedingHelp = Math.max(studentsNeedingHelp.length, Object.keys(interventionStudentsFrom04).length);

  // Xếp hạng bài học sai nhiều nhất
  var lessonList = [];
  for (var lKey in lessonStats) {
    lessonList.push({
      lessonName: lKey,
      attempts: lessonStats[lKey].attempts,
      totalWrong: lessonStats[lKey].totalWrong,
      avgScore: Math.round((lessonStats[lKey].scoreSum / lessonStats[lKey].attempts) * 10) / 10,
      wrongNB: lessonStats[lKey].wrongNB,
      wrongTH: lessonStats[lKey].wrongTH,
      wrongVD: lessonStats[lKey].wrongVD
    });
  }
  lessonList.sort(function(a, b) {
    if (b.totalWrong !== a.totalWrong) return b.totalWrong - a.totalWrong;
    return a.avgScore - b.avgScore;
  });

  var top3Text = "";
  if (lessonList.length === 0) {
    top3Text = "Chưa có dữ liệu bài kiểm tra";
  } else {
    var top3Items = lessonList.slice(0, 3).map(function(ls, idx) {
      return (idx + 1) + ". " + ls.lessonName + " (Tổng số câu sai: " + ls.totalWrong + " câu - Điểm TB: " + ls.avgScore + "/10)";
    });
    top3Text = top3Items.join("\\n");
  }

  // 5. GHI DỮ LIỆU VÀO SHEET 05_DASHBOARD
  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");

  sheetDash.clear(); // Làm mới trang để đảm bảo bảng báo cáo hoàn hảo

  // --- DÒNG 1-3 THEO ĐÚNG 3 TIÊU CHÍ GỐC CỦA SHEET: TÍNH TOÁN & ĐIỀN ĐẦY ĐỦ ---
  sheetDash.getRange("A1").setValue("Tổng số học sinh đang hoạt động:");
  sheetDash.getRange("B1").setValue(activeStudents);
  sheetDash.getRange("C1").setValue("=COUNTIF('01_HOC_SINH'!F2:F, \\"Mở\\")");

  sheetDash.getRange("A2").setValue("Số học sinh dưới trung bình cần can thiệp:");
  sheetDash.getRange("B2").setValue(countNeedingHelp);
  sheetDash.getRange("C2").setValue("=COUNTIF('02_KET_QUA_THI'!H2:H, \\"<5\\")");

  sheetDash.getRange("A3").setValue("Top 3 bài học học sinh làm sai nhiều nhất toàn trường:");
  sheetDash.getRange("B3").setValue(top3Text);
  sheetDash.getRange("B3").setWrap(true);

  sheetDash.getRange("A1:A3").setFontWeight("bold").setBackground("#f1f5f9");
  sheetDash.getRange("B1:B2").setFontWeight("bold").setFontSize(13).setHorizontalAlignment("center");
  sheetDash.getRange("B1").setFontColor("#047857");
  sheetDash.getRange("B2").setFontColor(countNeedingHelp > 0 ? "#b91c1c" : "#047857");
  sheetDash.getRange("B3").setFontSize(10).setVerticalAlignment("top");
  sheetDash.getRange("C1:C2").setFontColor("#64748b").setFontSize(9).setFontStyle("italic");

  // --- DÒNG 5: BANNER TIÊU ĐỀ BÁO CÁO TOÀN DIỆN ---
  sheetDash.getRange("A5:E5").merge();
  sheetDash.getRange("A5").setValue("📊 BÁO CÁO THỐNG KÊ TỔNG HỢP LMS SINH HỌC THPT - BẢNG ĐIỀU KHIỂN (05_DASHBOARD)");
  sheetDash.getRange("A5").setFontWeight("bold").setFontSize(12).setFontColor("#ffffff").setBackground("#065f46").setHorizontalAlignment("center");

  sheetDash.getRange("A6:E6").merge();
  sheetDash.getRange("A6").setValue("🕒 Cập nhật lúc: " + dateStr + " | Tự động đồng bộ số liệu từ 01_HOC_SINH, 02_KET_QUA_THI, 03_LO_HONG, 04_CA_NHAN_HOA");
  sheetDash.getRange("A6").setFontSize(9).setFontStyle("italic").setFontColor("#065f46").setBackground("#ecfdf5").setHorizontalAlignment("center");

  // PHẦN 1: BẢNG CHỈ SỐ HOẠT ĐỘNG CHÍNH (KPIs)
  var kpiHeaders = ["Chỉ số năng lực & học tập", "Giá trị tính toán", "Công thức Google Sheet", "Đánh giá sư phạm"];
  sheetDash.getRange("A8:D8").setValues([kpiHeaders]).setFontWeight("bold").setBackground("#047857").setFontColor("#ffffff");

  var kpiRows = [
    ["1. Tổng số học sinh đã đăng ký", totalStudents, "=COUNTA('01_HOC_SINH'!A2:A)", totalStudents + " học sinh"],
    ["2. Số học sinh đang hoạt động (Mở)", activeStudents, "=COUNTIF('01_HOC_SINH'!F2:F, \\"Mở\\")", (totalStudents > 0 ? Math.round((activeStudents/totalStudents)*100) : 0) + "% tổng học sinh"],
    ["3. Số học sinh đang tạm khóa / chờ duyệt", lockedStudents, "=COUNTIF('01_HOC_SINH'!F2:F, \\"Đóng\\")", lockedStudents > 0 ? "Cần Admin duyệt mở" : "Không có"],
    ["4. Tổng số lượt nộp bài kiểm tra", totalAttempts, "=COUNTA('02_KET_QUA_THI'!A2:A)", totalAttempts + " lượt làm bài"],
    ["5. Điểm trung bình toàn trường (Hệ 10)", avgScore, "=AVERAGE('02_KET_QUA_THI'!H2:H)", avgScore >= 8 ? "⭐ Khá - Giỏi" : avgScore >= 5 ? "🟡 Đạt chuẩn" : "🔴 Cần bồi dưỡng"],
    ["6. Tỷ lệ bài thi Đạt chuẩn trở lên (>= 5.0)", passRate + "%", "=COUNTIF('02_KET_QUA_THI'!H2:H, \\">=5\\")/COUNTA('02_KET_QUA_THI'!A2:A)", countPass5 + "/" + totalAttempts + " lượt đạt"],
    ["7. Số lượt thi đạt điểm Giỏi (>= 8.0)", countGood8, "=COUNTIF('02_KET_QUA_THI'!H2:H, \\">=8\\")", goodRate + "% tổng lượt làm"],
    ["8. Số học sinh dưới trung bình cần can thiệp", countNeedingHelp, "=COUNTIF('02_KET_QUA_THI'!H2:H, \\"<5\\")", countNeedingHelp > 0 ? "⚠️ Cần can thiệp gấp" : "✅ 100% đạt chuẩn"]
  ];
  sheetDash.getRange(9, 1, kpiRows.length, 4).setValues(kpiRows);
  sheetDash.getRange(9, 1, kpiRows.length, 4).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  sheetDash.getRange(9, 2, kpiRows.length, 1).setFontWeight("bold").setHorizontalAlignment("center");

  // PHẦN 2: PHÂN TÍCH LỖ HỔNG THEO 3 MỨC ĐỘ NHẬN THỨC (GDPT 2018)
  var rCogStart = 9 + kpiRows.length + 2;
  sheetDash.getRange(rCogStart, 1, 1, 4).merge();
  sheetDash.getRange(rCogStart, 1).setValue("🎯 PHÂN TÍCH LỖ HỔNG KIẾN THỨC THEO 3 MỨC ĐỘ NHẬN THỨC TOÀN TRƯỜNG");
  sheetDash.getRange(rCogStart, 1).setFontWeight("bold").setFontSize(11).setFontColor("#ffffff").setBackground("#1e293b");

  var cogHeaders = ["Mức độ nhận thức", "Tổng số câu làm sai", "Tỷ lệ sai sót (%)", "Khuyến nghị sư phạm"];
  sheetDash.getRange(rCogStart + 1, 1, 1, 4).setValues([cogHeaders]).setFontWeight("bold").setBackground("#334155").setFontColor("#ffffff");

  var totalAllWrong = (totalWrongNB + totalWrongTH + totalWrongVD) || 1;
  var pctNB = Math.round((totalWrongNB / totalAllWrong) * 1000) / 10;
  var pctTH = Math.round((totalWrongTH / totalAllWrong) * 1000) / 10;
  var pctVD = Math.round((totalWrongVD / totalAllWrong) * 1000) / 10;

  var cogRows = [
    ["1. Nhận biết (Cột J Sheet 02)", totalWrongNB, pctNB + "%", pctNB > 35 ? "🔴 Cần ôn lại các định nghĩa, thuật ngữ cơ bản" : "🟢 Nền tảng ghi nhớ kiến thức tốt"],
    ["2. Thông hiểu (Cột K Sheet 02)", totalWrongTH, pctTH + "%", pctTH > 40 ? "🟡 Dễ nhầm lẫn bản chất quá trình sinh học, cần sơ đồ hóa" : "🟢 Hiểu rõ mối liên hệ giữa cấu trúc và chức năng"],
    ["3. Vận dụng (Cột L Sheet 02)", totalWrongVD, pctVD + "%", pctVD > 40 ? "⚠️ Cần tăng cường bài tập phân tích và câu hỏi Đúng/Sai" : "⭐ Kỹ năng suy luận logic sinh học đạt chuẩn"]
  ];
  sheetDash.getRange(rCogStart + 2, 1, cogRows.length, 4).setValues(cogRows);
  sheetDash.getRange(rCogStart + 2, 1, cogRows.length, 4).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  sheetDash.getRange(rCogStart + 2, 2, cogRows.length, 2).setFontWeight("bold").setHorizontalAlignment("center");

  // PHẦN 3: THỐNG KÊ CHI TIẾT THEO TỪNG LỚP HỌC
  var rClassStart = rCogStart + 2 + cogRows.length + 2;
  sheetDash.getRange(rClassStart, 1, 1, 5).merge();
  sheetDash.getRange(rClassStart, 1).setValue("🏫 THỐNG KÊ TÌNH HÌNH HỌC TẬP THEO TỪNG LỚP HỌC");
  sheetDash.getRange(rClassStart, 1).setFontWeight("bold").setFontSize(11).setFontColor("#ffffff").setBackground("#0f766e");

  var classHeaders = ["Tên Lớp", "Sĩ số học sinh", "Số lượt đã làm bài", "Điểm TB Lớp", "Số bài thi dưới 5 điểm"];
  sheetDash.getRange(rClassStart + 1, 1, 1, 5).setValues([classHeaders]).setFontWeight("bold").setBackground("#115e59").setFontColor("#ffffff");

  var classNames = Object.keys(classStudentCount);
  if (classNames.length === 0) classNames = Object.keys(classAttemptStats);
  var classRows = [];
  for (var cIdx = 0; cIdx < classNames.length; cIdx++) {
    var cName = classNames[cIdx];
    var cHSCount = classStudentCount[cName] || 0;
    var cStats = classAttemptStats[cName] || { attempts: 0, scoreSum: 0, below5: 0 };
    var cAvg = cStats.attempts > 0 ? Math.round((cStats.scoreSum / cStats.attempts) * 10) / 10 : 0;
    classRows.push([
      cName,
      cHSCount,
      cStats.attempts,
      cAvg,
      cStats.below5
    ]);
  }
  if (classRows.length > 0) {
    sheetDash.getRange(rClassStart + 2, 1, classRows.length, 5).setValues(classRows);
    sheetDash.getRange(rClassStart + 2, 1, classRows.length, 5).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
    sheetDash.getRange(rClassStart + 2, 2, classRows.length, 4).setHorizontalAlignment("center");
  }

  // Căn chỉnh độ rộng các cột cho dễ quan sát
  sheetDash.setColumnWidth(1, 280);
  sheetDash.setColumnWidth(2, 220);
  sheetDash.setColumnWidth(3, 240);
  sheetDash.setColumnWidth(4, 320);
  sheetDash.setColumnWidth(5, 180);

  return {
    totalStudents: totalStudents,
    activeStudents: activeStudents,
    lockedStudents: lockedStudents,
    totalAttempts: totalAttempts,
    avgScore: avgScore,
    countNeedingHelp: countNeedingHelp,
    top3Lessons: lessonList.slice(0, 3),
    updatedAt: dateStr
  };
}

`;

export const FULL_APPS_SCRIPT_CODE = `/**
 * ==========================================================================================
 * GOOGLE APPS SCRIPT CHO HỆ THỐNG LMS SINH HỌC THPT (CHUẨN 6 SHEET)
 * Tác giả: Nguyễn Hồng Hiển
 * Quản lý 6 Sheet:
 *  01_HOC_SINH          : Danh sách học sinh, tài khoản, trạng thái duyệt
 *  02_KET_QUA_THI       : Lịch sử và điểm từng lượt kiểm tra
 *  03_LO_HONG_KIEN_THUC : Chuẩn đoán chi tiết kiến thức hổng (Dòng 1: Tiêu đề; Dòng 2+: Dữ liệu)
 *  04_CA_NHAN_HOA       : Kế hoạch bù đắp và lộ trình học tập thích ứng AI
 *  05_DASHBOARD         : Báo cáo thống kê tổng hợp toàn trường
 *  06_DE_THI            : Lưu trữ và đồng bộ hóa ngân hàng bài kiểm tra của Admin Giáo Viên
 * ==========================================================================================
 */

// 1. XỬ LÝ YÊU CẦU GET (Đăng nhập, Lấy bảng xếp hạng, Lấy danh sách đề thi...)
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || '';
    
    if (action === 'login') {
      return handleLogin(params);
    } else if (action === 'get_leaderboard') {
      return handleGetLeaderboard(params);
    } else if (action === 'get_exams' || action === 'lay_de_thi') {
      return handleGetExams(params);
    } else if (action === 'update_dashboard' || action === 'get_dashboard' || action === 'cap_nhat_dashboard') {
      return handleUpdateDashboard(params);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Máy chủ Google Apps Script LMS Sinh Học THPT đang hoạt động bình thường.'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Lỗi thực thi doGet: ' + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. XỬ LÝ YÊU CẦU POST (Đăng ký, Nộp bài thi, Cập nhật trạng thái, Tạo/Xóa đề thi...)
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Dữ liệu gửi lên rỗng hoặc không hợp lệ.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = JSON.parse(e.postData.contents);
    var action = data.action || '';
    
    if (action === 'register' || action === 'dang_ky') {
      return handleRegister(data);
    } else if (action === 'submit_result' || action === 'nop_bai') {
      return handleSubmitResult(data);
    } else if (action === 'update_student_status' || action === 'khoa_hoc_sinh') {
      return handleUpdateStudentStatus(data);
    } else if (action === 'update_class_status' || action === 'khoa_lop') {
      return handleUpdateClassStatus(data);
    } else if (action === 'delete_classroom' || action === 'xoa_lop') {
      return handleDeleteClassroom(data);
    } else if (action === 'delete_student' || action === 'xoa_hoc_sinh') {
      return handleDeleteStudent(data);
    } else if (action === 'sync_cleanup' || action === 'dondep_dulieu' || action === 'cleanup_orphans') {
      return handleSyncCleanup(data);
    } else if (action === 'create_exam' || action === 'save_exam' || action === 'tao_de_thi') {
      return handleCreateExam(data);
    } else if (action === 'delete_exam' || action === 'xoa_de_thi') {
      return handleDeleteExam(data);
    } else if (action === 'update_dashboard' || action === 'sync_dashboard' || action === 'cap_nhat_dashboard') {
      return handleUpdateDashboard(data);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Hành động không hợp lệ: ' + action
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Lỗi thực thi: ' + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------------------------------------
// HÀM 1: ĐĂNG KÝ HỌC SINH MỚI VÀO SHEET 01_HOC_SINH
// ------------------------------------------------------------------------------------------
function handleRegister(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("01_HOC_SINH");
  
  if (!sheet) {
    sheet = ss.insertSheet("01_HOC_SINH");
    sheet.appendRow([
      "ID_HocSinh", "Ho_Va_Ten", "Khoi_Lop", "So_Dien_Thoai", 
      "Mat_Khau", "Trang_Thai", "Tong_Diem_Tich_Luy", "Ngay_Dang_Ky"
    ]);
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#e2e8f0");
  }
  
  var name = (data.name || data.Ho_Va_Ten || "").toString().trim();
  var className = (data.className || data.Khoi_Lop || "").toString().trim().toUpperCase();
  var rawPhone = (data.phone || data.So_Dien_Thoai || "").toString().trim();
  var password = (data.password || data.Mat_Khau || "").toString().trim();
  var status = data.Trang_Thai || "Mở"; // Trạng thái mặc định: Mở (Học sinh có thể đăng nhập ngay)
  
  if (!rawPhone || !name) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Vui lòng nhập đầy đủ họ tên và số điện thoại."
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var cleanPhone = rawPhone.replace(/\\D/g, "");
  var noZeroPhone = cleanPhone.replace(/^0+/, "");
  var classPrefix = className.replace(/[^A-Za-z0-9]/g, "") || "HS";

  var values = sheet.getDataRange().getValues();
  var existingIds = {};
  var maxSuffixInClass = 0;

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var existingPhone = (row[3] || "").toString().trim().replace(/\\D/g, "");
    var existingNoZero = existingPhone.replace(/^0+/, "");

    // Kiểm tra trùng số điện thoại
    if (existingPhone === cleanPhone || (noZeroPhone && existingNoZero === noZeroPhone)) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: "Số điện thoại " + rawPhone + " đã được đăng ký trước đó. Vui lòng đăng nhập hoặc sử dụng số khác."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var rowId = (row[0] || "").toString().trim().toUpperCase();
    if (rowId) {
      existingIds[rowId] = true;
      if (rowId.indexOf(classPrefix) === 0) {
        var suffixStr = rowId.substring(classPrefix.length).replace(/\\D/g, "");
        if (suffixStr) {
          var sNum = parseInt(suffixStr, 10);
          if (!isNaN(sNum) && sNum > maxSuffixInClass) {
            maxSuffixInClass = sNum;
          }
        }
      }
    }
  }

  // TẠO ID MỚI: KIỂM TRA ID DO CLIENT GỬI HOẶC TỰ SINH TUYỆT ĐỐI KHÔNG TRÙNG LẶP
  var providedId = (data.ID_HocSinh || data.studentId || "").toString().trim().toUpperCase();
  var studentId = "";

  if (providedId && !existingIds[providedId]) {
    studentId = providedId;
  } else {
    var nextIndex = maxSuffixInClass + 1;
    var indexStr = nextIndex < 10 ? "0" + nextIndex : "" + nextIndex;
    var candidateId = classPrefix + indexStr;

    while (existingIds[candidateId.toUpperCase()]) {
      nextIndex++;
      indexStr = nextIndex < 10 ? "0" + nextIndex : "" + nextIndex;
      candidateId = classPrefix + indexStr;
    }
    studentId = candidateId;
  }

  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");
  var phoneToStore = cleanPhone.startsWith("0") ? "'" + cleanPhone : cleanPhone;
  var idToStore = "'" + studentId;

  sheet.appendRow([
    idToStore, name, className, phoneToStore, password, status, 0, dateStr
  ]);

  try {
    updateDashboard(ss);
  } catch (eDash) {}
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Đăng ký thành công!",
    student: {
      ID_HocSinh: studentId,
      studentId: studentId,
      Ho_Va_Ten: name,
      name: name,
      Khoi_Lop: className,
      className: className,
      So_Dien_Thoai: cleanPhone,
      phone: cleanPhone,
      Trang_Thai: status,
      totalScore: 0
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 2: ĐĂNG NHẬP
// ------------------------------------------------------------------------------------------
function handleLogin(params) {
  var phone = (params.phone || '').toString().trim();
  var password = (params.password || '').toString().trim();
  
  if (!phone || !password) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Vui lòng cung cấp số điện thoại và mật khẩu.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var cleanPhone = phone.replace(/\\D/g, '');
  var noZeroPhone = cleanPhone.replace(/^0+/, '');
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("01_HOC_SINH");
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Chưa khởi tạo dữ liệu học sinh trên hệ thống.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowPhone = (row[3] || '').toString().trim().replace(/\\D/g, '');
    var rowNoZero = rowPhone.replace(/^0+/, '');
    var rowPass = (row[4] || '').toString().trim();
    
    if ((rowPhone === cleanPhone || rowNoZero === noZeroPhone) && rowPass === password) {
      var rawStatus = (row[5] || 'Mở').toString().trim();
      var userStatus = rawStatus.toLowerCase();
      
      if (userStatus === 'đóng' || userStatus === 'dong' || userStatus === 'lock' || userStatus === 'locked') {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          message: '⚠️ Tài khoản của bạn hiện đang ở trạng thái [Đóng] (chờ duyệt). Vui lòng liên hệ Thầy/Cô quản trị để duyệt mở tài khoản.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      var studentUser = {
        ID_HocSinh: (row[0] || '').toString(),
        studentId: (row[0] || '').toString(),
        Ho_Va_Ten: (row[1] || '').toString(),
        name: (row[1] || '').toString(),
        Khoi_Lop: (row[2] || '').toString(),
        className: (row[2] || '').toString(),
        So_Dien_Thoai: (row[3] || '').toString(),
        phone: (row[3] || '').toString(),
        Trang_Thai: rawStatus,
        status: rawStatus,
        totalScore: Number(row[6]) || 0,
        examHistory: []
      };

      try {
        var sheetRes = ss.getSheetByName("02_KET_QUA_THI");
        if (sheetRes) {
          var resVals = sheetRes.getDataRange().getValues();
          var targetSid = (row[0] || '').toString().trim().toUpperCase();
          var targetName = (row[1] || '').toString().trim().toLowerCase();
          var targetCleanPhone = (row[3] || '').toString().trim().replace(/\\D/g, '').replace(/^0+/, '');
          
          for (var rIdx = 1; rIdx < resVals.length; rIdx++) {
            var rRow = resVals[rIdx];
            var rSid = (rRow[1] || '').toString().trim().toUpperCase();
            var rPhone = (rRow[1] || '').toString().trim().replace(/\\D/g, '').replace(/^0+/, '');
            var rName = (rRow[2] || '').toString().trim().toLowerCase();

            if ((targetSid && rSid === targetSid) || (targetCleanPhone && rPhone === targetCleanPhone) || (targetName && rName === targetName)) {
              var rScore = Number(rRow[5]) || 0;
              var rTotal = Number(rRow[6]) || 10;
              var rScore10 = Number(rRow[7]) || (rTotal > 0 ? Math.round((rScore / rTotal) * 10 * 10) / 10 : 0);
              studentUser.examHistory.push({
                turnId: (rRow[0] || '').toString(),
                studentId: (rRow[1] || '').toString(),
                name: (rRow[2] || '').toString(),
                className: (rRow[3] || '').toString(),
                examTitle: (rRow[4] || '').toString(),
                lessonName: (rRow[4] || '').toString(),
                score: rScore,
                totalQuestions: rTotal,
                score10: rScore10,
                timeSpentSeconds: Number(rRow[8]) || 0,
                wrongNhanBiet: Number(rRow[9]) || 0,
                wrongThongHieu: Number(rRow[10]) || 0,
                wrongVanDung: Number(rRow[11]) || 0,
                date: (rRow[12] || '').toString()
              });
            }
          }
        }
      } catch (eHistory) {
        Logger.log("Lỗi đọc lịch sử thi: " + eHistory);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        user: studentUser
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    message: 'Số điện thoại hoặc mật khẩu không chính xác.'
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 3: NỘP BÀI THI & ĐỒNG BỘ 02_KET_QUA_THI, 03_LO_HONG_KIEN_THUC, 04_CA_NHAN_HOA
// ------------------------------------------------------------------------------------------
function handleSubmitResult(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = data.result || {};
  var usr = data.user || {};
  var now = new Date();
  var timestamp = Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");
  var maLuot = res.turnId || ("LT_" + Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "yyyyMMdd_HHmmss_") + Math.floor(Math.random() * 1000));
  
  var score10 = 0;
  var totalQ = Number(res.totalQuestions || 10);
  var correctQ = Number(res.score || 0);
  if (totalQ > 0) {
    score10 = Math.round((correctQ / totalQ) * 10 * 10) / 10;
  }

  // --- A. GHI VÀO SHEET 02_KET_QUA_THI ---
  var sheetResults = ss.getSheetByName("02_KET_QUA_THI");
  if (!sheetResults) {
    sheetResults = ss.insertSheet("02_KET_QUA_THI");
    sheetResults.appendRow([
      "Ma_Luot_Thi", "ID_HocSinh", "Ho_Va_Ten", "Khoi_Lop", "Ten_Bai_Hoc",
      "So_Cau_Dung", "Tong_So_Cau", "Diem_He_10", "Thoi_Gian_Lam_Giay",
      "So_Cau_Sai_NhanBiet", "So_Cau_Sai_ThongHieu", "So_Cau_Sai_VanDung", "Thoi_Diem_Nop"
    ]);
    sheetResults.getRange(1, 1, 1, 13).setFontWeight("bold").setBackground("#e2e8f0");
  }
  
  // TÍNH TOÁN CHÍNH XÁC SỐ LƯỢNG CÂU HỎI SAI THEO MỨC ĐỘ NHẬN THỨC (CỘT J, K, L)
  var wrongNB = (res.wrongNhanBiet !== undefined && res.wrongNhanBiet !== null) ? Number(res.wrongNhanBiet) : -1;
  var wrongTH = (res.wrongThongHieu !== undefined && res.wrongThongHieu !== null) ? Number(res.wrongThongHieu) : -1;
  var wrongVD = (res.wrongVanDung !== undefined && res.wrongVanDung !== null) ? Number(res.wrongVanDung) : -1;
  var wrongTotal = Math.max(0, totalQ - correctQ);

  if ((wrongNB < 0 || wrongTH < 0 || wrongVD < 0) || (wrongNB === 0 && wrongTH === 0 && wrongVD === 0 && wrongTotal > 0)) {
    var cNB = 0;
    var cTH = 0;
    var cVD = 0;
    var hasDetails = false;

    if (res.details && Array.isArray(res.details) && res.details.length > 0) {
      for (var dIdx = 0; dIdx < res.details.length; dIdx++) {
        var dt = res.details[dIdx];
        if (dt && !dt.isCorrect) {
          hasDetails = true;
          var levelStr = (dt.cognitiveLevel || "").toString().toUpperCase();
          var qText = (dt.questionText || "").toString().toLowerCase();

          if (levelStr.indexOf("NHAN_BIET") !== -1 || levelStr.indexOf("NHẬN BIẾT") !== -1 || qText.indexOf("[nhận biết]") !== -1 || qText.indexOf("nhận biết") !== -1) {
            cNB++;
          } else if (levelStr.indexOf("THONG_HIEU") !== -1 || levelStr.indexOf("THÔNG HIỂU") !== -1 || qText.indexOf("[thông hiểu]") !== -1 || qText.indexOf("thông hiểu") !== -1) {
            cTH++;
          } else if (levelStr.indexOf("VAN_DUNG") !== -1 || levelStr.indexOf("VẬN DỤNG") !== -1 || qText.indexOf("[vận dụng]") !== -1 || qText.indexOf("vận dụng") !== -1) {
            cVD++;
          } else {
            if (dIdx < Math.ceil(res.details.length * 0.4)) {
              cNB++;
            } else if (dIdx < Math.ceil(res.details.length * 0.75)) {
              cTH++;
            } else {
              cVD++;
            }
          }
        }
      }
    }

    if (hasDetails) {
      wrongNB = cNB;
      wrongTH = cTH;
      wrongVD = cVD;
    } else if (wrongTotal > 0) {
      wrongNB = Math.round(wrongTotal * 0.4);
      wrongTH = Math.round(wrongTotal * 0.35);
      wrongVD = Math.max(0, wrongTotal - wrongNB - wrongTH);
    } else {
      wrongNB = 0;
      wrongTH = 0;
      wrongVD = 0;
    }
  }

  wrongNB = Math.max(0, Number(wrongNB) || 0);
  wrongTH = Math.max(0, Number(wrongTH) || 0);
  wrongVD = Math.max(0, Number(wrongVD) || 0);

  sheetResults.appendRow([
    maLuot,
    usr.studentId || data.phone || "",
    usr.name || "",
    usr.className || "",
    res.examTitle || "Bài kiểm tra Sinh học",
    correctQ,
    totalQ,
    score10,
    res.timeSpentSeconds || 60,
    wrongNB,
    wrongTH,
    wrongVD,
    timestamp
  ]);

  // --- B. GHI VÀO SHEET 03_LO_HONG_KIEN_THUC ---
  // QUY TẮC BẮT BUỘC: Dòng 1 luôn là tiêu đề các cột; dữ liệu ghi từ dòng thứ 2 trở đi!
  try {
    var sheet3 = ss.getSheetByName("03_LO_HONG_KIEN_THUC");
    if (!sheet3) {
      sheet3 = ss.insertSheet("03_LO_HONG_KIEN_THUC");
    }

    var headers03 = [
      "Tên bài học", 
      "Số câu sai", 
      "Điểm hệ 10", 
      "Nội dung kiến thức hổng", 
      "Mức độ nhận thức", 
      "Đánh giá tiến bộ"
    ];

    // Đảm bảo dòng 1 luôn là TIÊU ĐỀ CÁC CỘT
    if (sheet3.getLastRow() === 0) {
      sheet3.appendRow(headers03);
      sheet3.getRange(1, 1, 1, headers03.length).setFontWeight("bold").setBackground("#e2e8f0");
    } else {
      // Nếu dòng 1 trước đây vô tình bị ghi đè dữ liệu (chưa có dòng tiêu đề)
      var cellA1 = (sheet3.getRange(1, 1).getValue() || "").toString().trim().toLowerCase();
      if (cellA1.startsWith("bài ") || cellA1.startsWith("bai ") || cellA1.includes("dna") || cellA1.includes("gene")) {
        sheet3.insertRowBefore(1);
        sheet3.getRange(1, 1, 1, headers03.length).setValues([headers03]);
        sheet3.getRange(1, 1, 1, headers03.length).setFontWeight("bold").setBackground("#e2e8f0");
      }
    }

    var wrongCount = Math.max(0, totalQ - correctQ);
    var score10Str = score10.toString().replace('.', ',');
    var compProfile = res.competencyProfile || {};
    var weakLevel = compProfile.weakLevel || (score10 < 5.0 ? "Nhận biết" : score10 < 8.0 ? "Thông hiểu" : "Vận dụng");

    var weakDetails = "";
    if (compProfile.errorItems && compProfile.errorItems.length > 0) {
      var item = compProfile.errorItems[0];
      weakDetails = "[Luyện lại kiến thức hổng] " + (item.questionText || "").replace(/\\[.*?\\]/g, '').trim();
    } else if (res.details && res.details.length > 0) {
      var wrongDetails = res.details.filter(function(d) { return !d.isCorrect; });
      if (wrongDetails.length > 0) {
        weakDetails = "[Luyện lại kiến thức hổng] " + (wrongDetails[0].questionText || "").replace(/\\[.*?\\]/g, '').trim();
      }
    }
    if (!weakDetails) {
      weakDetails = "[Củng cố] " + (res.examTitle || "Bài kiểm tra Sinh học");
    }

    var progressNote = "🟢 Khá (Rèn thêm câu Vận dụng)";
    if (score10 >= 9.0) {
      progressNote = "⭐ Xuất sắc (Nắm vững toàn bộ kiến thức)";
    } else if (score10 < 5.0) {
      progressNote = "🔴 Cần củng cố gấp (Ôn lại lý thuyết cơ bản)";
    } else if (score10 < 7.0) {
      progressNote = "🟡 Đạt chuẩn (Cần luyện thêm câu Thông hiểu)";
    }

    // Ghi dữ liệu vào dòng tiếp theo (chắc chắn từ dòng 2 trở đi, không ghi đè dòng 1)
    sheet3.appendRow([
      res.examTitle || "Bài kiểm tra Sinh học",
      wrongCount,
      score10Str,
      weakDetails,
      weakLevel,
      progressNote
    ]);
  } catch (e3) {
    Logger.log("Lỗi ghi Sheet 03: " + e3);
  }

  // --- C. GHI / CẬP NHẬT SHEET 04_CA_NHAN_HOA ---
  try {
    var sheet4 = ss.getSheetByName("04_CA_NHAN_HOA");
    if (!sheet4) {
      sheet4 = ss.insertSheet("04_CA_NHAN_HOA");
    }

    var headers04 = [
      "ID_HocSinh", "Ho_Va_Ten", "Nang_Luc_Hien_Tai", 
      "Bai_Hoc_Can_On_Tap_1", "Bai_Hoc_Can_On_Tap_2", 
      "Dang_Cau_Hoi_Can_Ren", "De_Thi_AI_Khuyen_Nghi", 
      "Tien_Do_Hoan_Thanh", "Loi_Nhan_Dong_Vien"
    ];

    if (sheet4.getLastRow() === 0) {
      sheet4.appendRow(headers04);
      sheet4.getRange(1, 1, 1, headers04.length).setFontWeight("bold").setBackground("#e2e8f0");
    }

    var sid = usr.studentId || usr.phone || "";
    var sname = usr.name || "";
    var currentLevel = score10 >= 8.0 ? "Khá - Giỏi" : score10 >= 5.0 ? "Trung bình" : "Cần phụ đạo";
    var weakTopics = compProfile.weakTopics || [res.examTitle || "Bài học Sinh học"];
    var topic1 = weakTopics[0] || (res.examTitle || "");
    var topic2 = weakTopics[1] || "";
    var questionType = (compProfile.weakLevel || "Vận dụng") + " (Trắc nghiệm & Đúng/Sai)";
    var aiExam = "Đề luyện thích ứng: " + (res.examTitle || "Sinh học THPT");
    var progressStr = score10 >= 8.0 ? "Đã đạt chuẩn 100%" : "Đang ôn tập (" + Math.round((score10/10)*100) + "%)";
    var encourage = score10 >= 8.0 ? "Em làm rất tốt, tiếp tục phát huy nhé!" : "Hãy xem lại các câu sai để bứt phá điểm số trong lần thi tiếp theo!";

    var vals4 = sheet4.getDataRange().getValues();
    var foundRow4 = -1;
    for (var k = 1; k < vals4.length; k++) {
      if ((vals4[k][0] || "").toString() === sid || (sname && (vals4[k][1] || "").toString() === sname)) {
        foundRow4 = k + 1;
        break;
      }
    }

    var rowData4 = [
      sid, sname, currentLevel, topic1, topic2, questionType, aiExam, progressStr, encourage
    ];

    if (foundRow4 > 1) {
      sheet4.getRange(foundRow4, 1, 1, rowData4.length).setValues([rowData4]);
    } else {
      sheet4.appendRow(rowData4);
    }
  } catch (e4) {
    Logger.log("Lỗi ghi Sheet 04: " + e4);
  }

  // --- D. CẬP NHẬT TỔNG ĐIỂM TÍCH LŨY VÀO SHEET 01_HOC_SINH ---
  try {
    var sheetHS = ss.getSheetByName("01_HOC_SINH");
    if (sheetHS) {
      var hsValues = sheetHS.getDataRange().getValues();
      var cleanP = (data.phone || "").toString().trim().replace(/\\D/g, "");
      var cleanNZ = cleanP.replace(/^0+/, "");
      
      for (var j = 1; j < hsValues.length; j++) {
        var rowP = (hsValues[j][3] || "").toString().trim().replace(/\\D/g, "");
        var rowNoZ = rowP.replace(/^0+/, "");
        if (rowP === cleanP || (cleanNZ && rowNoZ === cleanNZ)) {
          var currentTotal = Number(hsValues[j][6]) || 0;
          sheetHS.getRange(j + 1, 7).setValue(currentTotal + correctQ);
          break;
        }
      }
    }
  } catch (eHS) {}

  // --- E. TỰ ĐỘNG CẬP NHẬT SHEET 05_DASHBOARD (BÁO CÁO THỐNG KÊ TOÀN TRƯỜNG) ---
  try {
    updateDashboard(ss);
  } catch (eDash) {
    Logger.log("Lỗi cập nhật Sheet 05_DASHBOARD: " + eDash);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Ghi thành công Sheet 02, 03, 04 và tự động cập nhật 05_DASHBOARD",
    maLuotThi: maLuot
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 4: CẬP NHẬT TRẠNG THÁI HỌC SINH (Duyệt Mở / Khóa tài khoản)
// ------------------------------------------------------------------------------------------
function handleUpdateStudentStatus(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("01_HOC_SINH");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Sheet 01_HOC_SINH không tồn tại" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var targetPhone = (data.phone || "").toString().trim().replace(/\\D/g, "");
  var targetNoZero = targetPhone.replace(/^0+/, "");
  var newStatus = data.status || "Mở";
  
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var rowP = (values[i][3] || "").toString().trim().replace(/\\D/g, "");
    var rowNoZ = rowP.replace(/^0+/, "");
    if (rowP === targetPhone || rowNoZ === targetNoZero) {
      sheet.getRange(i + 1, 6).setValue(newStatus);
      try {
        updateDashboard(ss);
      } catch (eDash) {}
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Cập nhật trạng thái thành công sang [" + newStatus + "]"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    message: "Không tìm thấy học sinh với số điện thoại này."
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 4B: KHÓA / MỞ KHÓA TOÀN BỘ HỒ SƠ HỌC SINH THEO LỚP
// ------------------------------------------------------------------------------------------
function handleUpdateClassStatus(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("01_HOC_SINH");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Sheet 01_HOC_SINH không tồn tại" })).setMimeType(ContentService.MimeType.JSON);
  }

  var rawClass = (data.className || "").toString().trim();
  var targetClass = rawClass.toUpperCase().replace(/^LỚP\\s*/i, "").trim();
  var newStatus = data.status || "Khóa";

  if (!targetClass) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Thiếu tên lớp cần cập nhật trạng thái." })).setMimeType(ContentService.MimeType.JSON);
  }

  var values = sheet.getDataRange().getValues();
  var updatedCount = 0;

  for (var i = 1; i < values.length; i++) {
    var rowClass = (values[i][2] || "").toString().trim().toUpperCase().replace(/^LỚP\\s*/i, "").trim();
    if (rowClass === targetClass || rowClass.indexOf(targetClass) !== -1 || targetClass.indexOf(rowClass) !== -1) {
      sheet.getRange(i + 1, 6).setValue(newStatus);
      updatedCount++;
    }
  }

  try { updateDashboard(ss); } catch (eDash) {}

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Đã cập nhật trạng thái [" + newStatus + "] cho toàn bộ " + updatedCount + " học sinh lớp " + (rawClass || targetClass) + ".",
    updatedCount: updatedCount,
    className: rawClass,
    status: newStatus
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 4C: XÓA TOÀN BỘ HỌC SINH CỦA CẢ LỚP (CASCADE DELETE TOÀN DIỆN)
// ------------------------------------------------------------------------------------------
function handleDeleteClassroom(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawClass = (data.className || "").toString().trim();
  var targetClass = rawClass.toUpperCase().replace(/^LỚP\\s*/i, "").trim();
  if (!targetClass) return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Thiếu tên lớp cần xóa." })).setMimeType(ContentService.MimeType.JSON);

  var deletedStudentsCount = 0;
  var deletedResultsCount = 0;
  var deletedPlanCount = 0;
  var targetIds = {};
  var targetPhones = {};

  var sheetHS = ss.getSheetByName("01_HOC_SINH");
  if (sheetHS) {
    var hsValues = sheetHS.getDataRange().getValues();
    for (var i = hsValues.length - 1; i >= 1; i--) {
      var row = hsValues[i];
      var rClass = (row[2] || "").toString().trim().toUpperCase().replace(/^LỚP\\s*/i, "").trim();
      var rId = (row[0] || "").toString().trim().toUpperCase();
      var rPhone = (row[3] || "").toString().trim().replace(/\\D/g, "");
      var rNoZero = rPhone.replace(/^0+/, "");

      if (rClass === targetClass || rClass.indexOf(targetClass) !== -1 || targetClass.indexOf(rClass) !== -1) {
        if (rId) targetIds[rId] = true;
        if (rPhone) targetPhones[rPhone] = true;
        if (rNoZero) targetPhones[rNoZero] = true;

        sheetHS.deleteRow(i + 1);
        deletedStudentsCount++;
      }
    }
  }

  var sheetResults = ss.getSheetByName("02_KET_QUA_THI");
  if (sheetResults) {
    var resValues = sheetResults.getDataRange().getValues();
    for (var j = resValues.length - 1; j >= 1; j--) {
      var resRow = resValues[j];
      var resClass = (resRow[3] || "").toString().trim().toUpperCase().replace(/^LỚP\\s*/i, "").trim();
      var resId = (resRow[1] || "").toString().trim().toUpperCase();
      var resPhone = (resRow[1] || "").toString().trim().replace(/\\D/g, "");
      var resNoZero = resPhone.replace(/^0+/, "");

      var isMatch = false;
      if (resClass === targetClass || resClass.indexOf(targetClass) !== -1 || targetClass.indexOf(resClass) !== -1) isMatch = true;
      if (resId && targetIds[resId]) isMatch = true;
      if (resPhone && targetPhones[resPhone]) isMatch = true;
      if (resNoZero && targetPhones[resNoZero]) isMatch = true;

      if (isMatch) {
        sheetResults.deleteRow(j + 1);
        deletedResultsCount++;
      }
    }
  }

  var sheetPlan = ss.getSheetByName("04_CA_NHAN_HOA");
  if (sheetPlan) {
    var planValues = sheetPlan.getDataRange().getValues();
    for (var k = planValues.length - 1; k >= 1; k--) {
      var planRow = planValues[k];
      var pId = (planRow[0] || "").toString().trim().toUpperCase();
      var pPhone = (planRow[0] || "").toString().trim().replace(/\\D/g, "");
      var pNoZero = pPhone.replace(/^0+/, "");

      var isPlanMatch = false;
      if (pId && targetIds[pId]) isPlanMatch = true;
      if (pPhone && targetPhones[pPhone]) isPlanMatch = true;
      if (pNoZero && targetPhones[pNoZero]) isPlanMatch = true;

      if (isPlanMatch) {
        sheetPlan.deleteRow(k + 1);
        deletedPlanCount++;
      }
    }
  }

  try { updateDashboard(ss); } catch (eDash) {}

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Đã xóa toàn bộ " + deletedStudentsCount + " học sinh lớp " + (rawClass || targetClass) + " cùng " + deletedResultsCount + " bài thi liên quan.",
    deletedStudentsCount: deletedStudentsCount,
    deletedResultsCount: deletedResultsCount,
    deletedPlanCount: deletedPlanCount
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 4D: XÓA 1 HỌC SINH & CASCADE DELETE DỮ LIỆU LIÊN QUAN
// ------------------------------------------------------------------------------------------
function handleDeleteStudent(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var targetId = (data.studentId || data.id || data.ID_HocSinh || "").toString().trim().toUpperCase();
  var targetPhone = (data.phone || data.So_Dien_Thoai || "").toString().trim().replace(/\\D/g, "");
  var targetNoZero = targetPhone.replace(/^0+/, "");
  var targetName = (data.name || data.Ho_Va_Ten || "").toString().trim().toLowerCase();

  if (!targetId && !targetPhone) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Vui lòng cung cấp ID học sinh hoặc số điện thoại cần xóa."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var deletedFromHS = 0;
  var deletedFromResults = 0;
  var deletedFromPlan = 0;

  var sheetHS = ss.getSheetByName("01_HOC_SINH");
  if (sheetHS) {
    var hsValues = sheetHS.getDataRange().getValues();
    for (var i = hsValues.length - 1; i >= 1; i--) {
      var row = hsValues[i];
      var rId = (row[0] || "").toString().trim().toUpperCase();
      var rPhone = (row[3] || "").toString().trim().replace(/\\D/g, "");
      var rNoZero = rPhone.replace(/^0+/, "");
      
      var isMatch = false;
      if (targetId && rId === targetId) isMatch = true;
      if (targetPhone && (rPhone === targetPhone || (targetNoZero && rNoZero === targetNoZero))) isMatch = true;

      if (isMatch) {
        sheetHS.deleteRow(i + 1);
        deletedFromHS++;
      }
    }
  }

  var sheetResults = ss.getSheetByName("02_KET_QUA_THI");
  if (sheetResults) {
    var resValues = sheetResults.getDataRange().getValues();
    for (var j = resValues.length - 1; j >= 1; j--) {
      var resRow = resValues[j];
      var resId = (resRow[1] || "").toString().trim().toUpperCase();
      var resPhone = (resRow[1] || "").toString().trim().replace(/\\D/g, "");
      var resNoZero = resPhone.replace(/^0+/, "");
      var resName = (resRow[2] || "").toString().trim().toLowerCase();

      var isResMatch = false;
      if (targetId && resId === targetId) isResMatch = true;
      if (targetPhone && (resPhone === targetPhone || (targetNoZero && resNoZero === targetNoZero))) isResMatch = true;
      if (targetName && resName === targetName && (!resId || resId === targetId)) isResMatch = true;

      if (isResMatch) {
        sheetResults.deleteRow(j + 1);
        deletedFromResults++;
      }
    }
  }

  var sheetPlan = ss.getSheetByName("04_CA_NHAN_HOA");
  if (sheetPlan) {
    var planValues = sheetPlan.getDataRange().getValues();
    for (var k = planValues.length - 1; k >= 1; k--) {
      var planRow = planValues[k];
      var pId = (planRow[0] || "").toString().trim().toUpperCase();
      var pPhone = (planRow[0] || "").toString().trim().replace(/\\D/g, "");
      var pNoZero = pPhone.replace(/^0+/, "");
      var pName = (planRow[1] || "").toString().trim().toLowerCase();

      var isPlanMatch = false;
      if (targetId && pId === targetId) isPlanMatch = true;
      if (targetPhone && (pPhone === targetPhone || (targetNoZero && pNoZero === targetNoZero))) isPlanMatch = true;
      if (targetName && pName === targetName) isPlanMatch = true;

      if (isPlanMatch) {
        sheetPlan.deleteRow(k + 1);
        deletedFromPlan++;
      }
    }
  }

  try { updateDashboard(ss); } catch (eDash) {}

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Đã xóa học sinh cùng toàn bộ kết quả thi, lỗ hổng kiến thức liên quan.",
    deletedFromHS: deletedFromHS,
    deletedFromResults: deletedFromResults,
    deletedFromPlan: deletedFromPlan
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 4E: TỰ ĐỘNG KHỬ TRÙNG LẶP ID & DỌN DẸP DỮ LIỆU MỒ CÔI
// ------------------------------------------------------------------------------------------
function cleanupDuplicatesAndOrphans(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetHS = ss.getSheetByName("01_HOC_SINH");
  if (!sheetHS) return { success: false, message: "Không tìm thấy Sheet 01_HOC_SINH" };
  
  var hsValues = sheetHS.getDataRange().getValues();
  var idMap = {};
  var validIds = {};
  var validPhones = {};
  var duplicateFixedCount = 0;
  
  for (var i = 1; i < hsValues.length; i++) {
    var row = hsValues[i];
    var currId = (row[0] || "").toString().trim().toUpperCase();
    var currPhone = (row[3] || "").toString().trim().replace(/\\D/g, "");
    var currClass = (row[2] || "").toString().trim().toUpperCase();
    var classPrefix = currClass.replace(/[^A-Za-z0-9]/g, "") || "HS";

    if (!currId && !currPhone) continue;

    if (currId && idMap[currId] && idMap[currId] !== currPhone) {
      var maxIdx = 1;
      for (var checkI = 1; checkI < hsValues.length; checkI++) {
        var otherId = (hsValues[checkI][0] || "").toString().trim().toUpperCase();
        if (otherId.indexOf(classPrefix) === 0) {
          var sNum = parseInt(otherId.substring(classPrefix.length).replace(/\\D/g, ""), 10);
          if (!isNaN(sNum) && sNum > maxIdx) maxIdx = sNum;
        }
      }
      var newIndex = maxIdx + 1;
      var newId = classPrefix + (newIndex < 10 ? "0" + newIndex : "" + newIndex);
      while (idMap[newId] || validIds[newId]) {
        newIndex++;
        newId = classPrefix + (newIndex < 10 ? "0" + newIndex : "" + newIndex);
      }
      sheetHS.getRange(i + 1, 1).setValue("'" + newId);
      hsValues[i][0] = newId;
      duplicateFixedCount++;

      try {
        var sheetResSync = ss.getSheetByName("02_KET_QUA_THI");
        if (sheetResSync) {
          var resVals = sheetResSync.getDataRange().getValues();
          for (var rK = 1; rK < resVals.length; rK++) {
            var rP = (resVals[rK][1] || "").toString().trim().replace(/\\D/g, "");
            if (currPhone && (rP === currPhone || rP.replace(/^0+/, '') === currPhone.replace(/^0+/, ''))) {
              sheetResSync.getRange(rK + 1, 2).setValue("'" + newId);
            }
          }
        }
      } catch (eResSync) {}

      currId = newId;
    }

    if (currId) {
      idMap[currId] = currPhone;
      validIds[currId] = true;
    }
    if (currPhone) {
      validPhones[currPhone] = true;
      validPhones[currPhone.replace(/^0+/, "")] = true;
    }
  }

  var sheetResults = ss.getSheetByName("02_KET_QUA_THI");
  var removedOrphanResults = 0;
  if (sheetResults) {
    var resValues = sheetResults.getDataRange().getValues();
    for (var rIdx = resValues.length - 1; rIdx >= 1; rIdx--) {
      var rRow = resValues[rIdx];
      var rSid = (rRow[1] || "").toString().trim().toUpperCase();
      var rPhone = (rRow[1] || "").toString().trim().replace(/\\D/g, "");
      var rCleanPhone = rPhone.replace(/^0+/, "");
      
      if (rSid === "GUEST" || rPhone === "966000224" || rPhone === "912345678" || rPhone === "0966000224" || rPhone === "0912345678") continue;
      
      var exists = false;
      if (rSid && validIds[rSid]) exists = true;
      if (rPhone && validPhones[rPhone]) exists = true;
      if (rCleanPhone && validPhones[rCleanPhone]) exists = true;

      if (!exists) {
        sheetResults.deleteRow(rIdx + 1);
        removedOrphanResults++;
      }
    }
  }

  var sheetPlan = ss.getSheetByName("04_CA_NHAN_HOA");
  var removedOrphanPlans = 0;
  if (sheetPlan) {
    var planValues = sheetPlan.getDataRange().getValues();
    for (var pIdx = planValues.length - 1; pIdx >= 1; pIdx--) {
      var pSid = (planValues[pIdx][0] || "").toString().trim().toUpperCase();
      var pPhone = pSid.replace(/\\D/g, "");
      var pCleanPhone = pPhone.replace(/^0+/, "");

      if (pSid === "GUEST" || pPhone === "966000224" || pPhone === "912345678") continue;

      var pExists = false;
      if (pSid && validIds[pSid]) pExists = true;
      if (pPhone && validPhones[pPhone]) pExists = true;
      if (pCleanPhone && validPhones[pCleanPhone]) pExists = true;

      if (!pExists) {
        sheetPlan.deleteRow(pIdx + 1);
        removedOrphanPlans++;
      }
    }
  }

  try { updateDashboard(ss); } catch (eDash) {}

  return {
    success: true,
    message: "Đã xử lý xong: Đã sửa " + duplicateFixedCount + " ID bị trùng lặp; Xóa " + removedOrphanResults + " bài thi mồ côi; Xóa " + removedOrphanPlans + " hồ sơ lộ trình mồ côi.",
    duplicateFixedCount: duplicateFixedCount,
    removedOrphanResults: removedOrphanResults,
    removedOrphanPlans: removedOrphanPlans
  };
}

function handleSyncCleanup(params) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var res = cleanupDuplicatesAndOrphans(ss);
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Lỗi dọn dẹp dữ liệu: " + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------------------------------------
// HÀM 5: BẢNG XẾP HẠNG
// ------------------------------------------------------------------------------------------
function handleGetLeaderboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("01_HOC_SINH");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ success: true, leaderboard: [] })).setMimeType(ContentService.MimeType.JSON);
  var values = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[1] && !row[3]) continue;
    list.push({
      studentId: (row[0] || '').toString(),
      name: (row[1] || '').toString(),
      className: (row[2] || '').toString(),
      phone: (row[3] || '').toString(),
      totalScore: Number(row[6]) || 0
    });
  }
  list.sort(function(a, b) { return b.totalScore - a.totalScore; });
  return ContentService.createTextOutput(JSON.stringify({ success: true, leaderboard: list })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 6: LƯU HOẶC CẬP NHẬT ĐỀ THI VÀO SHEET 06_DE_THI
// ------------------------------------------------------------------------------------------
function handleCreateExam(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("06_DE_THI");
  if (!sheet) {
    sheet = ss.insertSheet("06_DE_THI");
    sheet.appendRow([
      "ID_DeThi", "Tieu_De", "Khoi_Lop", "Chuyen_Muc", "Chu_De", "Ten_Bai_Hoc",
      "YCCD", "Thoi_Gian_Phut", "So_Cau_Hoi", "Du_Lieu_Cau_Hoi_JSON", "Nguoi_Tao",
      "Thoi_Diem_Tao", "Trang_Thai"
    ]);
    sheet.getRange(1, 1, 1, 13).setFontWeight("bold").setBackground("#e2e8f0");
  }

  var exam = data.exam || data;
  var grade = (exam.grade || "Lớp 10").toString().trim();
  var category = (exam.category || "Sinh 10").toString().trim();
  var gradeStr = (grade + " " + category).toLowerCase();
  var defaultPrefix = gradeStr.indexOf("12") !== -1 ? "SH12" : (gradeStr.indexOf("11") !== -1 ? "SH11" : "SH10");
  var examId = (exam.id || (defaultPrefix + "_" + Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "HHmmss"))).toString().trim();
  var title = (exam.title || "Bài kiểm tra Sinh học").toString().trim();
  var topic = (exam.topic || "").toString().trim();
  var lessonName = (exam.lessonName || "").toString().trim();
  var yccd = (exam.learningObjectives || "").toString().trim();
  var duration = Number(exam.duration || 15);
  var questions = exam.questions || [];
  var createdBy = (exam.createdBy || "Admin Giáo Viên").toString().trim();
  if (/lâm\s*thái\s*hiển/i.test(createdBy)) {
    createdBy = "Admin Giáo Viên";
  }
  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");
  var status = "Hiển thị";

  var values = sheet.getDataRange().getValues();
  var existingRow = -1;
  var cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  var cleanGrade = grade.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (var i = 1; i < values.length; i++) {
    var rowId = (values[i][0] || "").toString().trim();
    if (rowId === examId) {
      existingRow = i + 1;
      break;
    }
  }

  var rowData = [
    examId, title, grade, category, topic, lessonName,
    yccd, duration, questions.length, questionsJson, createdBy,
    dateStr, status
  ];

  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Lưu đề thi lên Google Sheet 06_DE_THI thành công!",
    examId: examId
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 7: LẤY DANH SÁCH TOÀN BỘ ĐỀ THI TỪ SHEET 06_DE_THI
// ------------------------------------------------------------------------------------------
function handleGetExams(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("06_DE_THI");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      exams: []
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      exams: []
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var exams = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var status = (row[12] || "").toString().trim();
    if (status.toLowerCase() === "đã xóa" || status.toLowerCase() === "deleted" || status.toLowerCase() === "ẩn") {
      continue;
    }

    var examId = (row[0] || "").toString().trim();
    if (!examId) continue;

    var rawQuestions = row[9];
    var questions = [];
    try {
      if (typeof rawQuestions === "string" && rawQuestions.trim()) {
        questions = JSON.parse(rawQuestions);
      } else if (Array.isArray(rawQuestions)) {
        questions = rawQuestions;
      }
    } catch (e) {
      questions = [];
    }

    var creatorRaw2 = (row[10] || "Admin Giáo Viên").toString();
    if (/lâm\s*thái\s*hiển/i.test(creatorRaw2)) {
      creatorRaw2 = "Admin Giáo Viên";
    }

    exams.push({
      id: examId,
      title: (row[1] || "").toString(),
      grade: (row[2] || "").toString(),
      category: (row[3] || "").toString(),
      topic: (row[4] || "").toString(),
      lessonName: (row[5] || "").toString(),
      learningObjectives: (row[6] || "").toString(),
      duration: Number(row[7]) || 15,
      questions: questions,
      createdBy: creatorRaw2,
      createdAt: (row[11] || "").toString()
    });
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    exams: exams
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 8: XÓA ĐỀ THI KHỎI SHEET 06_DE_THI
// ------------------------------------------------------------------------------------------
function handleDeleteExam(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("06_DE_THI");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Sheet 06_DE_THI chưa tạo" })).setMimeType(ContentService.MimeType.JSON);
  }

  var targetId = (data.examId || data.id || "").toString().trim();
  if (!targetId) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Thiếu mã đề thi" })).setMimeType(ContentService.MimeType.JSON);
  }

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var rowId = (values[i][0] || "").toString().trim();
    if (rowId === targetId || rowId.replace(/^exam-/, "") === targetId.replace(/^exam-/, "")) {
      // Đánh dấu đã xóa
      sheet.getRange(i + 1, 13).setValue("Đã xóa");
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Đã xóa đề thi trên Google Sheet thành công!"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Không tìm thấy mã đề trên Sheet"
  })).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------
// HÀM 9: TÍNH TOÁN & CẬP NHẬT TOÀN DIỆN SHEET 05_DASHBOARD (BÁO CÁO THỐNG KÊ TOÀN TRƯỜNG)
// ------------------------------------------------------------------------------------------
function handleUpdateDashboard(params) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = updateDashboard(ss);
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "Cập nhật thành công Sheet 05_DASHBOARD",
      data: result
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Lỗi cập nhật 05_DASHBOARD: " + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Menu tùy chỉnh khi mở Google Sheet: Cho phép Thầy/Cô bấm cập nhật Dashboard bằng 1 cú nhấp chuột
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('📊 LMS Sinh Học')
      .addItem('🔄 Cập nhật Sheet 05_DASHBOARD ngay', 'menuUpdateDashboard')
      .addToUi();
  } catch (e) {}
}

function menuUpdateDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = updateDashboard(ss);
  SpreadsheetApp.getUi().alert(
    '✅ CẬP NHẬT THÀNH CÔNG SHEET 05_DASHBOARD!\\n\\n' +
    '• Tổng số HS đang hoạt động: ' + res.activeStudents + ' học sinh\\n' +
    '• Tổng lượt nộp bài: ' + res.totalAttempts + ' lượt\\n' +
    '• Điểm trung bình toàn trường: ' + res.avgScore + '/10\\n' +
    '• Số học sinh dưới trung bình: ' + res.countNeedingHelp + ' em'
  );
}

/**
 * Hàm lõi tính toán và điền tự động dữ liệu vào Sheet 05_DASHBOARD
 */
function updateDashboard(ss) {
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) return { activeStudents: 0, totalAttempts: 0, avgScore: 0, countNeedingHelp: 0 };

  var sheetDash = ss.getSheetByName("05_DASHBOARD");
  if (!sheetDash) {
    sheetDash = ss.insertSheet("05_DASHBOARD");
  }

  // 1. ĐỌC DỮ LIỆU TỪ SHEET 01_HOC_SINH
  var sheetHS = ss.getSheetByName("01_HOC_SINH");
  var hsData = sheetHS ? sheetHS.getDataRange().getValues() : [];
  var totalStudents = 0;
  var activeStudents = 0;
  var lockedStudents = 0;
  var classStudentCount = {};

  for (var i = 1; i < hsData.length; i++) {
    var rHS = hsData[i];
    var sId = (rHS[0] || '').toString().trim();
    var sName = (rHS[1] || '').toString().trim();
    var sClass = (rHS[2] || 'Chưa phân lớp').toString().trim().toUpperCase();
    var sStatus = (rHS[5] || 'Mở').toString().trim().toLowerCase();

    if (!sId && !sName) continue;
    totalStudents++;

    if (sStatus === 'đóng' || sStatus === 'dong' || sStatus === 'lock' || sStatus === 'locked') {
      lockedStudents++;
    } else {
      activeStudents++;
    }

    if (sClass) {
      classStudentCount[sClass] = (classStudentCount[sClass] || 0) + 1;
    }
  }

  // 2. ĐỌC DỮ LIỆU TỪ SHEET 02_KET_QUA_THI
  var sheetKQ = ss.getSheetByName("02_KET_QUA_THI");
  var kqData = sheetKQ ? sheetKQ.getDataRange().getValues() : [];
  var totalAttempts = 0;
  var totalScore10Sum = 0;
  var countPass5 = 0;
  var countGood8 = 0;
  var countBelow5 = 0;

  var totalWrongNB = 0;
  var totalWrongTH = 0;
  var totalWrongVD = 0;

  var lessonStats = {};
  var studentStats = {};
  var classAttemptStats = {};

  for (var j = 1; j < kqData.length; j++) {
    var rKQ = kqData[j];
    var stId = (rKQ[1] || '').toString().trim();
    var stName = (rKQ[2] || '').toString().trim();
    var stClass = (rKQ[3] || 'Chưa phân lớp').toString().trim().toUpperCase();
    var lName = (rKQ[4] || 'Bài kiểm tra Sinh học').toString().trim();
    var scoreRaw = (rKQ[7] !== undefined && rKQ[7] !== null) ? rKQ[7] : '';
    var scoreNum = parseFloat(String(scoreRaw).replace(',', '.'));
    if (isNaN(scoreNum)) scoreNum = 0;

    var wNB = Number(rKQ[9]) || 0;
    var wTH = Number(rKQ[10]) || 0;
    var wVD = Number(rKQ[11]) || 0;

    totalAttempts++;
    totalScore10Sum += scoreNum;

    if (scoreNum >= 8.0) countGood8++;
    if (scoreNum >= 5.0) countPass5++;
    else countBelow5++;

    totalWrongNB += wNB;
    totalWrongTH += wTH;
    totalWrongVD += wVD;

    // Thống kê bài học
    if (!lessonStats[lName]) {
      lessonStats[lName] = { attempts: 0, totalWrong: 0, scoreSum: 0, wrongNB: 0, wrongTH: 0, wrongVD: 0 };
    }
    lessonStats[lName].attempts++;
    lessonStats[lName].scoreSum += scoreNum;
    lessonStats[lName].totalWrong += (wNB + wTH + wVD);
    lessonStats[lName].wrongNB += wNB;
    lessonStats[lName].wrongTH += wTH;
    lessonStats[lName].wrongVD += wVD;

    // Thống kê học sinh
    var stKey = stId || stName;
    if (stKey) {
      if (!studentStats[stKey]) {
        studentStats[stKey] = { id: stId, name: stName, className: stClass, scores: [], latestScore: scoreNum, totalWrong: 0 };
      }
      studentStats[stKey].scores.push(scoreNum);
      studentStats[stKey].latestScore = scoreNum;
      studentStats[stKey].totalWrong += (wNB + wTH + wVD);
    }

    // Thống kê lớp
    if (!classAttemptStats[stClass]) {
      classAttemptStats[stClass] = { attempts: 0, scoreSum: 0, below5: 0 };
    }
    classAttemptStats[stClass].attempts++;
    classAttemptStats[stClass].scoreSum += scoreNum;
    if (scoreNum < 5.0) classAttemptStats[stClass].below5++;
  }

  // 3. ĐỌC SHEET 04_CA_NHAN_HOA
  var sheet04 = ss.getSheetByName("04_CA_NHAN_HOA");
  var d04 = sheet04 ? sheet04.getDataRange().getValues() : [];
  var interventionStudentsFrom04 = {};
  for (var m = 1; m < d04.length; m++) {
    var r04 = d04[m];
    var sid4 = (r04[0] || '').toString().trim();
    var sname4 = (r04[1] || '').toString().trim();
    var level4 = (r04[2] || '').toString().trim();
    var weakTopic4 = (r04[3] || '').toString().trim();
    if (level4 === 'Cần phụ đạo' || level4 === 'Trung bình') {
      var key4 = sid4 || sname4;
      interventionStudentsFrom04[key4] = {
        id: sid4,
        name: sname4,
        level: level4,
        weakTopic: weakTopic4
      };
    }
  }

  // 4. TỔNG HỢP SỐ LIỆU
  var avgScore = totalAttempts > 0 ? Math.round((totalScore10Sum / totalAttempts) * 10) / 10 : 0;
  var passRate = totalAttempts > 0 ? Math.round((countPass5 / totalAttempts) * 1000) / 10 : 100;
  var goodRate = totalAttempts > 0 ? Math.round((countGood8 / totalAttempts) * 1000) / 10 : 0;

  var studentsNeedingHelp = [];
  for (var k in studentStats) {
    var st = studentStats[k];
    var stAvg = st.scores.reduce(function(a, b){ return a + b; }, 0) / st.scores.length;
    stAvg = Math.round(stAvg * 10) / 10;
    st.avgScore = stAvg;
    if (stAvg < 5.0 || st.latestScore < 5.0 || interventionStudentsFrom04[k]) {
      studentsNeedingHelp.push(st);
    }
  }
  var countNeedingHelp = Math.max(studentsNeedingHelp.length, Object.keys(interventionStudentsFrom04).length);

  // Xếp hạng bài học sai nhiều nhất
  var lessonList = [];
  for (var lKey in lessonStats) {
    lessonList.push({
      lessonName: lKey,
      attempts: lessonStats[lKey].attempts,
      totalWrong: lessonStats[lKey].totalWrong,
      avgScore: Math.round((lessonStats[lKey].scoreSum / lessonStats[lKey].attempts) * 10) / 10,
      wrongNB: lessonStats[lKey].wrongNB,
      wrongTH: lessonStats[lKey].wrongTH,
      wrongVD: lessonStats[lKey].wrongVD
    });
  }
  lessonList.sort(function(a, b) {
    if (b.totalWrong !== a.totalWrong) return b.totalWrong - a.totalWrong;
    return a.avgScore - b.avgScore;
  });

  var top3Text = "";
  if (lessonList.length === 0) {
    top3Text = "Chưa có dữ liệu bài kiểm tra";
  } else {
    var top3Items = lessonList.slice(0, 3).map(function(ls, idx) {
      return (idx + 1) + ". " + ls.lessonName + " (Tổng số câu sai: " + ls.totalWrong + " câu - Điểm TB: " + ls.avgScore + "/10)";
    });
    top3Text = top3Items.join("\\n");
  }

  // 5. GHI DỮ LIỆU VÀO SHEET 05_DASHBOARD
  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");

  sheetDash.clear(); // Làm mới trang để đảm bảo bảng báo cáo hoàn hảo

  // --- DÒNG 1-3 THEO ĐÚNG 3 TIÊU CHÍ GỐC CỦA SHEET: TÍNH TOÁN & ĐIỀN ĐẦY ĐỦ ---
  sheetDash.getRange("A1").setValue("Tổng số học sinh đang hoạt động:");
  sheetDash.getRange("B1").setValue(activeStudents);
  sheetDash.getRange("C1").setValue("=COUNTIF('01_HOC_SINH'!F2:F, \\"Mở\\")");

  sheetDash.getRange("A2").setValue("Số học sinh dưới trung bình cần can thiệp:");
  sheetDash.getRange("B2").setValue(countNeedingHelp);
  sheetDash.getRange("C2").setValue("=COUNTIF('02_KET_QUA_THI'!H2:H, \\"<5\\")");

  sheetDash.getRange("A3").setValue("Top 3 bài học học sinh làm sai nhiều nhất toàn trường:");
  sheetDash.getRange("B3").setValue(top3Text);
  sheetDash.getRange("B3").setWrap(true);

  sheetDash.getRange("A1:A3").setFontWeight("bold").setBackground("#f1f5f9");
  sheetDash.getRange("B1:B2").setFontWeight("bold").setFontSize(13).setHorizontalAlignment("center");
  sheetDash.getRange("B1").setFontColor("#047857");
  sheetDash.getRange("B2").setFontColor(countNeedingHelp > 0 ? "#b91c1c" : "#047857");
  sheetDash.getRange("B3").setFontSize(10).setVerticalAlignment("top");
  sheetDash.getRange("C1:C2").setFontColor("#64748b").setFontSize(9).setFontStyle("italic");

  // --- DÒNG 5: BANNER TIÊU ĐỀ BÁO CÁO TOÀN DIỆN ---
  sheetDash.getRange("A5:E5").merge();
  sheetDash.getRange("A5").setValue("📊 BÁO CÁO THỐNG KÊ TỔNG HỢP LMS SINH HỌC THPT - BẢNG ĐIỀU KHIỂN (05_DASHBOARD)");
  sheetDash.getRange("A5").setFontWeight("bold").setFontSize(12).setFontColor("#ffffff").setBackground("#065f46").setHorizontalAlignment("center");

  sheetDash.getRange("A6:E6").merge();
  sheetDash.getRange("A6").setValue("🕒 Cập nhật lúc: " + dateStr + " | Tự động đồng bộ số liệu từ 01_HOC_SINH, 02_KET_QUA_THI, 03_LO_HONG, 04_CA_NHAN_HOA");
  sheetDash.getRange("A6").setFontSize(9).setFontStyle("italic").setFontColor("#065f46").setBackground("#ecfdf5").setHorizontalAlignment("center");

  // PHẦN 1: BẢNG CHỈ SỐ HOẠT ĐỘNG CHÍNH (KPIs)
  var kpiHeaders = ["Chỉ số năng lực & học tập", "Giá trị tính toán", "Công thức Google Sheet", "Đánh giá sư phạm"];
  sheetDash.getRange("A8:D8").setValues([kpiHeaders]).setFontWeight("bold").setBackground("#047857").setFontColor("#ffffff");

  var kpiRows = [
    ["1. Tổng số học sinh đã đăng ký", totalStudents, "=COUNTA('01_HOC_SINH'!A2:A)", totalStudents + " học sinh"],
    ["2. Số học sinh đang hoạt động (Mở)", activeStudents, "=COUNTIF('01_HOC_SINH'!F2:F, \\"Mở\\")", (totalStudents > 0 ? Math.round((activeStudents/totalStudents)*100) : 0) + "% tổng học sinh"],
    ["3. Số học sinh đang tạm khóa / chờ duyệt", lockedStudents, "=COUNTIF('01_HOC_SINH'!F2:F, \\"Đóng\\")", lockedStudents > 0 ? "Cần Admin duyệt mở" : "Không có"],
    ["4. Tổng số lượt nộp bài kiểm tra", totalAttempts, "=COUNTA('02_KET_QUA_THI'!A2:A)", totalAttempts + " lượt làm bài"],
    ["5. Điểm trung bình toàn trường (Hệ 10)", avgScore, "=AVERAGE('02_KET_QUA_THI'!H2:H)", avgScore >= 8 ? "⭐ Khá - Giỏi" : avgScore >= 5 ? "🟡 Đạt chuẩn" : "🔴 Cần bồi dưỡng"],
    ["6. Tỷ lệ bài thi Đạt chuẩn trở lên (>= 5.0)", passRate + "%", "=COUNTIF('02_KET_QUA_THI'!H2:H, \\">=5\\")/COUNTA('02_KET_QUA_THI'!A2:A)", countPass5 + "/" + totalAttempts + " lượt đạt"],
    ["7. Số lượt thi đạt điểm Giỏi (>= 8.0)", countGood8, "=COUNTIF('02_KET_QUA_THI'!H2:H, \\">=8\\")", goodRate + "% tổng lượt làm"],
    ["8. Số học sinh dưới trung bình cần can thiệp", countNeedingHelp, "=COUNTIF('02_KET_QUA_THI'!H2:H, \\"<5\\")", countNeedingHelp > 0 ? "⚠️ Cần can thiệp gấp" : "✅ 100% đạt chuẩn"]
  ];
  sheetDash.getRange(9, 1, kpiRows.length, 4).setValues(kpiRows);
  sheetDash.getRange(9, 1, kpiRows.length, 4).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  sheetDash.getRange(9, 2, kpiRows.length, 1).setFontWeight("bold").setHorizontalAlignment("center");

  // PHẦN 2: PHÂN TÍCH LỖ HỔNG THEO 3 MỨC ĐỘ NHẬN THỨC (GDPT 2018)
  var rCogStart = 9 + kpiRows.length + 2;
  sheetDash.getRange(rCogStart, 1, 1, 4).merge();
  sheetDash.getRange(rCogStart, 1).setValue("🎯 PHÂN TÍCH LỖ HỔNG KIẾN THỨC THEO 3 MỨC ĐỘ NHẬN THỨC TOÀN TRƯỜNG");
  sheetDash.getRange(rCogStart, 1).setFontWeight("bold").setFontSize(11).setFontColor("#ffffff").setBackground("#1e293b");

  var cogHeaders = ["Mức độ nhận thức", "Tổng số câu làm sai", "Tỷ lệ sai sót (%)", "Khuyến nghị sư phạm"];
  sheetDash.getRange(rCogStart + 1, 1, 1, 4).setValues([cogHeaders]).setFontWeight("bold").setBackground("#334155").setFontColor("#ffffff");

  var totalAllWrong = (totalWrongNB + totalWrongTH + totalWrongVD) || 1;
  var pctNB = Math.round((totalWrongNB / totalAllWrong) * 1000) / 10;
  var pctTH = Math.round((totalWrongTH / totalAllWrong) * 1000) / 10;
  var pctVD = Math.round((totalWrongVD / totalAllWrong) * 1000) / 10;

  var cogRows = [
    ["1. Nhận biết (Cột J Sheet 02)", totalWrongNB, pctNB + "%", pctNB > 35 ? "🔴 Cần ôn lại các định nghĩa, thuật ngữ cơ bản" : "🟢 Nền tảng ghi nhớ kiến thức tốt"],
    ["2. Thông hiểu (Cột K Sheet 02)", totalWrongTH, pctTH + "%", pctTH > 40 ? "🟡 Dễ nhầm lẫn bản chất quá trình sinh học, cần sơ đồ hóa" : "🟢 Hiểu rõ mối liên hệ giữa cấu trúc và chức năng"],
    ["3. Vận dụng (Cột L Sheet 02)", totalWrongVD, pctVD + "%", pctVD > 40 ? "⚠️ Cần tăng cường bài tập phân tích và câu hỏi Đúng/Sai" : "⭐ Kỹ năng suy luận logic sinh học đạt chuẩn"]
  ];
  sheetDash.getRange(rCogStart + 2, 1, cogRows.length, 4).setValues(cogRows);
  sheetDash.getRange(rCogStart + 2, 1, cogRows.length, 4).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  sheetDash.getRange(rCogStart + 2, 2, cogRows.length, 2).setFontWeight("bold").setHorizontalAlignment("center");

  // PHẦN 3: THỐNG KÊ CHI TIẾT THEO TỪNG LỚP HỌC
  var rClassStart = rCogStart + 2 + cogRows.length + 2;
  sheetDash.getRange(rClassStart, 1, 1, 5).merge();
  sheetDash.getRange(rClassStart, 1).setValue("🏫 THỐNG KÊ TÌNH HÌNH HỌC TẬP THEO TỪNG LỚP HỌC");
  sheetDash.getRange(rClassStart, 1).setFontWeight("bold").setFontSize(11).setFontColor("#ffffff").setBackground("#0f766e");

  var classHeaders = ["Tên Lớp", "Sĩ số học sinh", "Số lượt đã làm bài", "Điểm TB Lớp", "Số bài thi dưới 5 điểm"];
  sheetDash.getRange(rClassStart + 1, 1, 1, 5).setValues([classHeaders]).setFontWeight("bold").setBackground("#115e59").setFontColor("#ffffff");

  var classNames = Object.keys(classStudentCount);
  if (classNames.length === 0) classNames = Object.keys(classAttemptStats);
  var classRows = [];
  for (var cIdx = 0; cIdx < classNames.length; cIdx++) {
    var cName = classNames[cIdx];
    var cHSCount = classStudentCount[cName] || 0;
    var cStats = classAttemptStats[cName] || { attempts: 0, scoreSum: 0, below5: 0 };
    var cAvg = cStats.attempts > 0 ? Math.round((cStats.scoreSum / cStats.attempts) * 10) / 10 : 0;
    classRows.push([
      cName,
      cHSCount,
      cStats.attempts,
      cAvg,
      cStats.below5
    ]);
  }
  if (classRows.length > 0) {
    sheetDash.getRange(rClassStart + 2, 1, classRows.length, 5).setValues(classRows);
    sheetDash.getRange(rClassStart + 2, 1, classRows.length, 5).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
    sheetDash.getRange(rClassStart + 2, 2, classRows.length, 4).setHorizontalAlignment("center");
  }

  // Căn chỉnh độ rộng các cột cho dễ quan sát
  sheetDash.setColumnWidth(1, 280);
  sheetDash.setColumnWidth(2, 220);
  sheetDash.setColumnWidth(3, 240);
  sheetDash.setColumnWidth(4, 320);
  sheetDash.setColumnWidth(5, 180);

  return {
    totalStudents: totalStudents,
    activeStudents: activeStudents,
    lockedStudents: lockedStudents,
    totalAttempts: totalAttempts,
    avgScore: avgScore,
    countNeedingHelp: countNeedingHelp,
    top3Lessons: lessonList.slice(0, 3),
    updatedAt: dateStr
  };
}

`;
