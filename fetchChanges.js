const { google } = require('googleapis');
const fs = require('fs');
const path = require("path");
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();
const KEY_FILE_PATH = path.join(__dirname, 'drive-service-account.json');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Tạo thư mục downloads nếu chưa tồn tại
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

async function uploadToAPI(filePath, fileName) {
  try {
    // Kiểm tra file có tồn tại không
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File không tồn tại: ${filePath}`);
      return false;
    }

    // Kiểm tra kích thước file
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.error(`❌ File rỗng: ${fileName}`);
      return false;
    }

    const formData = new FormData();
    formData.append('doc_name', fileName);
    formData.append('doc_file', fs.createReadStream(filePath));
    formData.append('doc_type', 'DOCUMENT');

    const response = await axios.post('http://gpt.zen8labs.io/knowledge/test/document/upload', formData, {
      headers: {
        ...formData.getHeaders(),
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'http://gpt.zen8labs.io',
        'Proxy-Connection': 'keep-alive',
        'Referer': 'http://gpt.zen8labs.io/construct/knowledge',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
      }
    });

    console.log(`✅ Đã upload file lên API: ${fileName}`);
    return true;
  } catch (err) {
    console.error(`❌ Lỗi khi upload file ${fileName} lên API:`, err.message);
    return false;
  }
}

async function downloadFile(drive, fileId, fileName) {
  try {
    const dest = path.join(DOWNLOADS_DIR, fileName);
    const res = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    
    const destFile = fs.createWriteStream(dest);
    res.data
      .on('end', async () => {
        console.log(`✅ Đã tải file: ${fileName}`);
        // Upload file lên API
        const uploadSuccess = await uploadToAPI(dest, fileName);
        if (uploadSuccess && fs.existsSync(dest)) {
          // Xóa file sau khi upload thành công
          fs.unlinkSync(dest);
          console.log(`✅ Đã xóa file: ${fileName}`);
        }
      })
      .on('error', err => {
        console.error(`❌ Lỗi khi tải file ${fileName}:`, err);
      })
      .pipe(destFile);
  } catch (err) {
    console.error(`❌ Lỗi khi tải file ${fileName}:`, err.message);
  }
}

async function fetchChanges() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  let pageToken;
  try {
    // Read stored token (or fetch it for the first time)
    if (fs.existsSync('token.txt')) {
      pageToken = fs.readFileSync('token.txt', 'utf8');
    }
    if (!pageToken) {
      const res = await drive.changes.getStartPageToken();
      pageToken = res.data.startPageToken;
      fs.writeFileSync('token.txt', pageToken);
      console.log('📄 Start page token stored:', pageToken);
    }

    const res = await drive.changes.list({
      pageToken: pageToken,
      spaces: 'drive'
    });

    const changes = res.data.changes || [];

    if (changes.length > 0) {
      console.log('🔄 Changes:');
      for (const change of changes) {
        console.log(`📂 File: ${change.file?.name} (${change.fileId})`);
        if (change.file?.name) {
          await downloadFile(drive, change.fileId, change.file.name);
        }
      }
    } else {
      console.log('✅ No changes.');
    }

    // Save the new token
    if (res.data.newStartPageToken) {
      fs.writeFileSync('token.txt', res.data.newStartPageToken);
    }
  } catch (err) {
    console.error('❌ Failed to fetch changes:', err.message);
  }
}

module.exports = fetchChanges;
