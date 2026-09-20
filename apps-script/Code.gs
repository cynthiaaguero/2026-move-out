/**
 * Moving-In Gift Registry — Apps Script backend.
 * Bound to the Google Sheet. Reads/writes the "items" tab and serves it as a
 * JSON API for the static frontend (see SETUP.md for deployment steps).
 */

var SHEET_NAME = "items";
var CLAIM_CODE_LENGTH = 6;
// No 0/O/1/I/L — avoids characters that are easy to mix up when someone
// copies their claim code down by hand.
var CLAIM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
var REQUIRED_COLUMNS = [
  "id",
  "name",
  "link",
  "price",
  "category",
  "image_url",
  "note",
  "claimed",
  "claimed_by",
  "claim_code",
];

function doGet(e) {
  try {
    var sheet = getSheet_();
    var items = readItems_(sheet);
    return jsonResponse_({ ok: true, items: items });
  } catch (err) {
    return jsonResponse_({ ok: false, error: "server_error", message: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = parseBody_(e);
    var action = body.action;

    if (action === "claim") {
      return withLock_(lock, function () {
        return jsonResponse_(claimItem_(body.id));
      });
    }
    if (action === "unclaim") {
      return withLock_(lock, function () {
        return jsonResponse_(unclaimItem_(body.id, body.claim_code));
      });
    }
    return jsonResponse_({ ok: false, error: "invalid_request", message: "Unknown action." });
  } catch (err) {
    return jsonResponse_({ ok: false, error: "server_error", message: String(err) });
  }
}

// ---------------------------------------------------------------------
// Sheet access helpers
// ---------------------------------------------------------------------

function getSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet tab "' + SHEET_NAME + '" not found.');
  return sheet;
}

// Reads column positions from row 1 by header name, so the script keeps
// working even if columns get reordered in the sheet.
function getHeaderMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) {
    map[String(h).trim()] = i;
  });
  REQUIRED_COLUMNS.forEach(function (col) {
    if (!(col in map)) throw new Error("Missing required column: " + col);
  });
  return map;
}

function readItems_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var headerMap = getHeaderMap_(sheet);
  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var items = [];
  values.forEach(function (row) {
    var id = row[headerMap.id];
    if (!id) return; // skip blank rows
    items.push({
      id: String(id),
      name: String(row[headerMap.name] || ""),
      link: String(row[headerMap.link] || ""),
      price: row[headerMap.price] === "" ? null : Number(row[headerMap.price]),
      category: String(row[headerMap.category] || ""),
      image_url: String(row[headerMap.image_url] || ""),
      note: String(row[headerMap.note] || ""),
      claimed: isTruthyCell_(row[headerMap.claimed]),
      // claim_code and claimed_by are intentionally never included here —
      // the browser must never receive a claim code except right after
      // that specific browser claims the item.
    });
  });
  return items;
}

function findRowIndexById_(sheet, headerMap, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, headerMap.id + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // actual sheet row number
  }
  return -1;
}

function isTruthyCell_(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

function claimItem_(id) {
  if (!isNonEmptyString_(id) || id.length > 200) {
    return { ok: false, error: "invalid_request", message: "Missing or invalid item id." };
  }

  var sheet = getSheet_();
  var headerMap = getHeaderMap_(sheet);
  var rowIndex = findRowIndexById_(sheet, headerMap, id);
  if (rowIndex === -1) {
    return { ok: false, error: "not_found", message: "Item not found." };
  }

  // Re-read fresh, under the lock, so two simultaneous claims can't both win.
  var claimedCell = sheet.getRange(rowIndex, headerMap.claimed + 1);
  if (isTruthyCell_(claimedCell.getValue())) {
    return { ok: false, error: "already_claimed", message: "This item was already claimed." };
  }

  var code = generateClaimCode_();
  claimedCell.setValue(true);
  sheet.getRange(rowIndex, headerMap.claim_code + 1).setValue(code);
  sheet.getRange(rowIndex, headerMap.claimed_by + 1).setValue("");

  return { ok: true, claim_code: code };
}

function unclaimItem_(id, claimCode) {
  if (!isNonEmptyString_(id) || !isNonEmptyString_(claimCode)) {
    return { ok: false, error: "invalid_request", message: "Missing item id or claim code." };
  }
  if (id.length > 200 || claimCode.length > 50) {
    return { ok: false, error: "invalid_request", message: "Invalid item id or claim code." };
  }

  var sheet = getSheet_();
  var headerMap = getHeaderMap_(sheet);
  var rowIndex = findRowIndexById_(sheet, headerMap, id);
  if (rowIndex === -1) {
    return { ok: false, error: "not_found", message: "Item not found." };
  }

  var claimedCell = sheet.getRange(rowIndex, headerMap.claimed + 1);
  if (!isTruthyCell_(claimedCell.getValue())) {
    return { ok: false, error: "not_claimed", message: "This item is not currently claimed." };
  }

  var storedCode = String(sheet.getRange(rowIndex, headerMap.claim_code + 1).getValue() || "");
  if (storedCode.trim().toUpperCase() !== claimCode.trim().toUpperCase()) {
    return { ok: false, error: "invalid_code", message: "That claim code does not match." };
  }

  claimedCell.setValue(false);
  sheet.getRange(rowIndex, headerMap.claim_code + 1).setValue("");
  sheet.getRange(rowIndex, headerMap.claimed_by + 1).setValue("");

  return { ok: true };
}

function isNonEmptyString_(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function generateClaimCode_() {
  var code = "";
  for (var i = 0; i < CLAIM_CODE_LENGTH; i++) {
    code += CLAIM_CODE_CHARS.charAt(Math.floor(Math.random() * CLAIM_CODE_CHARS.length));
  }
  return code;
}

// ---------------------------------------------------------------------
// Request / response plumbing
// ---------------------------------------------------------------------

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Missing request body.");
  }
  var parsed;
  try {
    parsed = JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error("Request body must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid request body.");
  return parsed;
}

// Wraps an action in the script lock so two simultaneous claim/unclaim
// requests for the same item can't both succeed. tryLock waits up to 10s
// for any earlier request to finish before giving up.
function withLock_(lock, fn) {
  var acquired = lock.tryLock(10000);
  if (!acquired) {
    return jsonResponse_({ ok: false, error: "busy", message: "Please try again in a moment." });
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
