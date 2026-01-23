/*
  Code.gs
  Main backend logic.
  This handles all the Drive API heavy lifting (read, write, copy).
  The browser just sends orders and shows what happened.
*/

// App entry point.
// Using createTemplate so I can inject the CSS and JS files dynamically later.
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Conversion Drive')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Helper to pull HTML content from other files. 
// Keeps the project modular so index.html isn't a mess.
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * SCAN FUNCTION
 * Split this into public vs private logic.
 * Helps handle access errors gracefully without crashing the whole chain.
 */
function scanFolder(folderId, recursive, includeOcr) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    var fileList = [];
    
    // Kick off the recursive search.
    _internalScan(folder, recursive, includeOcr, fileList, folder.getName());
    
    return { status: 'success', files: fileList };
  } catch (e) {
    // Bad ID or no permissions? Send a clean error back to the client.
    return { status: 'error', message: "Can't access folder. Check the ID and permissions." };
  }
}

// The recursive workhorse.
// Watch out: Huge folders (10k+ files) might hit the 6-min execution limit.
// Works for now, but v2 might need pagination.
function _internalScan(folder, recursive, includeOcr, list, path) {
  var files = folder.getFiles();
  
  // Listing exact MIME types here. 
  // Checking extensions like .docx is too flaky.
  var targetMimes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      // Excel
    'application/vnd.openxmlformats-officedocument.presentationml.presentation' // PPT
  ];

  // If OCR is on, we grab PDFs and Images too.
  if (includeOcr) {
    targetMimes.push('application/pdf', 'image/jpeg', 'image/png');
  }

  while (files.hasNext()) {
    var file = files.next();
    var mime = file.getMimeType();
    
    if (targetMimes.indexOf(mime) > -1) {
      // Simple tagging for the UI badges.
      var typeName = 'Autre';
      if (mime.includes('word')) typeName = 'Word';
      else if (mime.includes('sheet')) typeName = 'Excel';
      else if (mime.includes('presentation')) typeName = 'PowerPoint';
      else if (mime.includes('pdf')) typeName = 'PDF';
      else if (mime.includes('image')) typeName = 'Image';

      // Prep the object and add a preview link.
      list.push({
        id: file.getId(),
        name: file.getName(),
        type: typeName,
        mime: mime,
        path: path, // e.g. Root > Perf > Vision
        preview: "https://drive.google.com/file/d/" + file.getId() + "/preview"
      });
    }
  }

  // Recursion magic.
  // If the option is checked, we dive into every subfolder we find.
  if (recursive) {
    var subfolders = folder.getFolders();
    while (subfolders.hasNext()) {
      var sub = subfolders.next();
      _internalScan(sub, recursive, includeOcr, list, path + ' > ' + sub.getName());
    }
  }
}

/**
 * BATCH PROCESSING
 * Capping this at 5 files per batch to stay safe.
 * GAS has a 6-min timeout, so if a file takes a minute, we're still good.
 */
function processBatch(filesToConvert, action) {
  var results = [];
  
  // Mapping source types to Google formats.
  var convertMap = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': MimeType.GOOGLE_DOCS,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':      MimeType.GOOGLE_SHEETS,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': MimeType.GOOGLE_SLIDES,
    'application/pdf': MimeType.GOOGLE_DOCS, 
    'image/jpeg': MimeType.GOOGLE_DOCS, 
    'image/png': MimeType.GOOGLE_DOCS
  };

  filesToConvert.forEach(function(fileData) {
    var result = { name: fileData.name, status: 'OK', url: '', folder: '' };

    // Wrapping this in a try-catch inside the loop.
    // If file #3 fails, #4 and #5 still get processed. Keeps things robust.
    try {
      var originFile = DriveApp.getFileById(fileData.id);
      
      // Try to find the parent. If it's an orphan, fallback to Root.
      var parents = originFile.getParents();
      var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
      result.folder = parentFolder.getName(); // Just for the report

      // 1. CLEANUP
      // Strip extensions and weird chars that might break things.
      var cleanName = fileData.name.replace(/\.[^/.]+$/, "").replace(/[\\/:*?"<>|]/g, '-').trim();

      var meta = {
        name: cleanName,
        mimeType: convertMap[fileData.mime],
        parents: [{id: parentFolder.getId()}] // Keep the new file with the old one
      };

      // 2. API CALL
      // Extracted the complex call to a helper function. Makes future upgrades easier.
      var newFile = apiCopyFile(fileData.id, meta, fileData.type);
      
      // Grab the link. v2 uses alternateLink, v3 will need webViewLink.
      result.url = newFile.alternateLink || newFile.webViewLink;

      // 3. HANDLE ORIGINAL
      if (action === 'trash') {
        Drive.Files.trash(fileData.id); // Bye bye (recoverable for 30 days)
      } 
      else if (action === 'archive') {
        // "Lazy creation" - only make the archive folder if we actually need it.
        var archiveName = "_OLD_ORIGINALS";
        var it = parentFolder.getFoldersByName(archiveName);
        var archiveFolder = it.hasNext() ? it.next() : parentFolder.createFolder(archiveName);
        originFile.moveTo(archiveFolder);
      }

    } catch (e) {
      // Log the error but don't kill the script.
      result.status = 'Erreur';
      result.errorDetail = e.message;
    }
    
    results.push(result);
  });

  return results;
}

/**
 * API WRAPPER - PREPPING FOR V3
 * This is where we handle technical debt.
 * Currently sticking to V2 because the OCR handling is simpler.
 * But I've prepped the V3 code in comments for when we eventually migrate.
 */
function apiCopyFile(fileId, meta, fileType) {
  
  // --- CURRENT (API DRIVE V2) ---
  // V2 lets us do everything (copy + convert + OCR) in one shot.
  return Drive.Files.copy(meta, fileId, {
    supportsAllDrives: true, // Required for Shared Drives
    ocr: (fileType === 'PDF' || fileType === 'Image'), // Only turn on OCR if we need it
    ocrLanguage: 'fr'
  });

  /* 
  --- FUTURE (API DRIVE V3) ---
  // Uncomment this when we migrate.
  // Note: V3 is stricter, we have to explicitly ask for return fields.
  
  return Drive.Files.copy(meta, fileId, {
    supportsAllDrives: true,
    fields: 'id, name, webViewLink, parents' // In v3, if you don't ask for the link, you don't get it.
  });
  
  // Heads up: For OCR in V3, 'copy' doesn't work for images anymore.
  // We'll need Drive.Files.create with a blob upload. It's heavier, so skipping it for now.
  */
}
