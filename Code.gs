
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Conversion Drive')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function scanFolder(folderId, recursive, includeOcr) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    var fileList = [];
    
   
    _internalScan(folder, recursive, includeOcr, fileList, folder.getName());
    
    return { status: 'success', files: fileList };
  } catch (e) {
    // Si l'ID est mauvais ou qu'on n'a pas les droits, on renvoie une erreur propre au client
    return { status: 'error', message: "Impossible d'accéder au dossier. Vérifiez l'ID et vos permissions." };
  }
}


function _internalScan(folder, recursive, includeOcr, list, path) {
  var files = folder.getFiles();
  
  var targetMimes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      // Excel
    'application/vnd.openxmlformats-officedocument.presentationml.presentation' // PPT
  ];

  if (includeOcr) {
    targetMimes.push('application/pdf', 'image/jpeg', 'image/png');
  }

  while (files.hasNext()) {
    var file = files.next();
    var mime = file.getMimeType();
    
    if (targetMimes.indexOf(mime) > -1) {
      var typeName = 'Autre';
      if (mime.includes('word')) typeName = 'Word';
      else if (mime.includes('sheet')) typeName = 'Excel';
      else if (mime.includes('presentation')) typeName = 'PowerPoint';
      else if (mime.includes('pdf')) typeName = 'PDF';
      else if (mime.includes('image')) typeName = 'Image';

      list.push({
        id: file.getId(),
        name: file.getName(),
        type: typeName,
        mime: mime,
        path: path, // Le chemin (ex: Racine > Perf > Vision)
        preview: "https://drive.google.com/file/d/" + file.getId() + "/preview"
      });
    }
  }

  if (recursive) {
    var subfolders = folder.getFolders();
    while (subfolders.hasNext()) {
      var sub = subfolders.next();
      _internalScan(sub, recursive, includeOcr, list, path + ' > ' + sub.getName());
    }
  }
}

function processBatch(filesToConvert, action) {
  var results = [];

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

    try {
      var originFile = DriveApp.getFileById(fileData.id);
      

      var parents = originFile.getParents();
      var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
      result.folder = parentFolder.getName(); // Pour le rapport final

      var cleanName = fileData.name.replace(/\.[^/.]+$/, "").replace(/[\\/:*?"<>|]/g, '-').trim();

      var meta = {
        name: cleanName,
        mimeType: convertMap[fileData.mime],
        parents: [{id: parentFolder.getId()}] // On met le nouveau fichier au même endroit que l'ancien
      };

      var newFile = apiCopyFile(fileData.id, meta, fileData.type);
      
      result.url = newFile.alternateLink || newFile.webViewLink;

      if (action === 'trash') {
        Drive.Files.trash(fileData.id); // Adieu fichier (récupérable 30j)
      } 
      else if (action === 'archive') {
        var archiveName = "_OLD_ORIGINALS";
        var it = parentFolder.getFoldersByName(archiveName);
        var archiveFolder = it.hasNext() ? it.next() : parentFolder.createFolder(archiveName);
        originFile.moveTo(archiveFolder);
      }

    } catch (e) {

      result.status = 'Erreur';
      result.errorDetail = e.message;
    }
    
    results.push(result);
  });

  return results;
}


function apiCopyFile(fileId, meta, fileType) {

  return Drive.Files.copy(meta, fileId, {
    supportsAllDrives: true, // Obligatoire pour les Drive d'équipe (Shared Drives)
    ocr: (fileType === 'PDF' || fileType === 'Image'), // Active l'OCR seulement si nécessaire
    ocrLanguage: 'fr'
  });


  return Drive.Files.copy(meta, fileId, {
    supportsAllDrives: true,
    fields: 'id, name, webViewLink, parents' // En v3, si on ne demande pas le lien, on ne l'a pas !
  });

}
