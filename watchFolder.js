const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const path = require('path');
const KEY_FILE_PATH = path.join(__dirname, 'drive-service-account.json');

async function getAllSubfoldersAndFiles(drive, folderId) {
  const folders = [];
  const files = [];
  
  async function traverseFolder(currentFolderId) {
    const response = await drive.files.list({
      q: `'${currentFolderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
    });

    for (const item of response.data.files) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        folders.push(item.id);
        await traverseFolder(item.id); // Đệ quy để lấy các thư mục con
      } else {
        files.push(item.id);
      }
    }
  }

  await traverseFolder(folderId);
  return { folders, files };
}

async function watchFolder(folderId) {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  try {
    // Lấy tất cả các thư mục con và tệp
    const { folders, files } = await getAllSubfoldersAndFiles(drive, folderId);
    
    // Thêm thư mục gốc vào danh sách
    folders.unshift(folderId);
    
    // Theo dõi tất cả các thư mục
    for (const folderId of folders) {
      const channelId = uuidv4();
      await drive.files.watch({
        fileId: folderId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: process.env.WEBHOOK_URL
        }
      });
      console.log(`📡 Watch started for folder: ${folderId}`);
    }

    // Theo dõi tất cả các tệp
    for (const fileId of files) {
      const channelId = uuidv4();
      await drive.files.watch({
        fileId: fileId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: process.env.WEBHOOK_URL
        }
      });
      console.log(`📡 Watch started for file: ${fileId}`);
    }

    console.log('✅ All folders and files are being watched');
  } catch (err) {
    console.error('❌ Failed to watch folders and files:', err.message);
  }
}

// REPLACE with your folder ID
watchFolder('1s2NaVJX8C45bSJ7w_p6--iqEksaxAywW').catch(console.error);
