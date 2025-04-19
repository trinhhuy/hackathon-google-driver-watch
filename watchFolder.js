const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const path = require('path');
const KEY_FILE_PATH = path.join(__dirname, 'drive-service-account.json');

async function getDirectSubfolders(drive, folderId) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  return response.data.files;
}

async function watchFolder(folderId) {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  try {
    // Lấy danh sách thư mục con trực tiếp
    const subfolders = await getDirectSubfolders(drive, folderId);
    
    // Thêm thư mục gốc vào danh sách
    const foldersToWatch = [
      { id: folderId, name: 'Root' },
      ...subfolders
    ];
    
    // Theo dõi các thư mục
    for (const folder of foldersToWatch) {
      const channelId = uuidv4();
      await drive.files.watch({
        fileId: folder.id,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: process.env.WEBHOOK_URL
        }
      });
      console.log(`📡 Watch started for folder: ${folder.name} (${folder.id})`);
    }

    console.log('✅ All folders are being watched');
  } catch (err) {
    console.error('❌ Failed to watch folders:', err.message);
  }
}

// REPLACE with your folder ID
watchFolder('1s2NaVJX8C45bSJ7w_p6--iqEksaxAywW').catch(console.error);
