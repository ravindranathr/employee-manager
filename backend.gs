/**
 * Employee Manager - Google Sheets Backend
 * 
 * Instructions:
 * 1. Open Google Sheets and create a new blank spreadsheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any code there and paste this entire file.
 * 4. Click Save (disk icon).
 * 5. Click "Deploy" > "New deployment" in the top right.
 * 6. Select type: "Web app" (click the gear icon to select it).
 * 7. Set "Execute as" to "Me".
 * 8. Set "Who has access" to "Anyone".
 * 9. Click Deploy. (Authorize permissions if prompted).
 * 10. Copy the "Web app URL" and paste it into the app's Settings!
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet = ss.getSheetByName('Employees');
  var attSheet = ss.getSheetByName('Attendance');
  
  // If sheets don't exist, return empty state
  if (!empSheet || !attSheet) {
    return ContentService.createTextOutput(JSON.stringify({ employees: [], attendance: {} }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var state = { employees: [], attendance: {} };
  
  // Read Employees
  var empData = empSheet.getDataRange().getValues();
  if (empData.length > 1) {
    var headers = empData[0];
    for (var i = 1; i < empData.length; i++) {
      var row = empData[i];
      if (!row[0]) continue;
      state.employees.push({
        id: String(row[0]),
        name: String(row[1]),
        role: String(row[2]),
        phone: String(row[3]),
        dailyWage: Number(row[4]),
        joinDate: String(row[5]),
        esi: row[6] === true || row[6] === 'true' || row[6] === 'TRUE'
      });
    }
  }
  
  // Read Attendance
  var attData = attSheet.getDataRange().getValues();
  if (attData.length > 1) {
    for (var i = 1; i < attData.length; i++) {
      var row = attData[i];
      var key = String(row[0]);
      if (!key) continue;
      
      state.attendance[key] = {};
      for (var day = 1; day <= 31; day++) {
        var status = row[day];
        if (status) {
          state.attendance[key][String(day)] = String(status);
        }
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify(state))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Parse incoming data
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Invalid JSON'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Update Employees Sheet
  var empSheet = ss.getSheetByName('Employees');
  if (!empSheet) {
    empSheet = ss.insertSheet('Employees');
  }
  empSheet.clear();
  
  var empHeaders = ['ID', 'Name', 'Role', 'Phone', 'Daily Wage', 'Join Date', 'ESI'];
  var empRows = [empHeaders];
  
  if (data.employees && data.employees.length > 0) {
    for (var i = 0; i < data.employees.length; i++) {
      var emp = data.employees[i];
      empRows.push([
        emp.id, 
        emp.name, 
        emp.role || '', 
        emp.phone || '', 
        emp.dailyWage || 0, 
        emp.joinDate || '', 
        emp.esi
      ]);
    }
  }
  empSheet.getRange(1, 1, empRows.length, empRows[0].length).setValues(empRows);
  
  // Style Headers
  empSheet.getRange(1, 1, 1, empHeaders.length).setFontWeight("bold").setBackground("#f3f4f6");
  
  
  // Update Attendance Sheet
  var attSheet = ss.getSheetByName('Attendance');
  if (!attSheet) {
    attSheet = ss.insertSheet('Attendance');
  }
  attSheet.clear();
  
  var attHeaders = ['Key (EmpID_Year_Month)'];
  for (var d = 1; d <= 31; d++) attHeaders.push(String(d));
  
  var attRows = [attHeaders];
  
  if (data.attendance) {
    var keys = Object.keys(data.attendance);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var row = [key];
      for (var d = 1; d <= 31; d++) {
        row.push(data.attendance[key][String(d)] || '');
      }
      attRows.push(row);
    }
  }
  attSheet.getRange(1, 1, attRows.length, attRows[0].length).setValues(attRows);
  
  // Style Headers
  attSheet.getRange(1, 1, 1, attHeaders.length).setFontWeight("bold").setBackground("#f3f4f6");
  
  // Return success
  return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// Handle preflight CORS requests
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}
