const { google } = require('googleapis');
const fs = require('fs');
const path = require("path");
const axios = require('axios');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Khởi tạo Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const KEY_FILE_PATH = path.join(__dirname, 'drive-service-account.json');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Tạo thư mục downloads nếu chưa tồn tại
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

async function syncBatchToAPI(fileName, docId, specName) {
  console.log('docIddddddd', docId, specName, fileName)
  try {
    const response = await axios.post(
      `${process.env.API_BASE_URL}${process.env.API_KNOWLEDGE_PATH}/${specName}${process.env.API_DOCUMENT_PATH}/sync_batch`,
      [{
        name: fileName,
        doc_id: docId,
        chunk_parameters: {
          chunk_strategy: "Automatic"
        }
      }],
      {
        headers: {
          'Accept': process.env.API_ACCEPT,
          'Accept-Language': process.env.API_ACCEPT_LANGUAGE,
          'Content-Type': 'application/json',
          'Origin': process.env.API_ORIGIN,
          'Proxy-Connection': 'keep-alive',
          'Referer': process.env.API_REFERER,
          'User-Agent': process.env.API_USER_AGENT
        }
      }
    );

    console.log(`✅ Đã sync batch cho file: ${fileName}`);
    return true;
  } catch (err) {
    console.error(`❌ Lỗi khi sync batch cho file ${fileName}:`, err.message);
    return false;
  }
}

async function uploadToAPI(filePath, fileName, parentId) {
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
    
    // Kiểm tra trong Supabase xem file đã tồn tại chưa
    const { data: existingFile, error } = await supabase
      .from('projects')
      .select()
      .eq("drive_folder", process.env.DRIVE_FOLDER_ID)
      .single();
    
    if (error) {
      // PGRST116 là mã lỗi "Không tìm thấy dữ liệu", nên ta bỏ qua lỗi này
      console.error(`❌ Lỗi khi kiểm tra Supabase: ${error.message}`);
      return false;
    }

    const formData = new FormData();
    formData.append('doc_name', fileName);
    formData.append('doc_file', fs.createReadStream(filePath));
    formData.append('doc_type', 'DOCUMENT');
    if (parentId) {
      formData.append('parent_id', parentId);
    }

    const specName = existingFile.db_space // Dùng giá trị mặc định thay vì existingFile.dn_space
    const response = await axios.post(
      `${process.env.API_BASE_URL}${process.env.API_KNOWLEDGE_PATH}/${specName}${process.env.API_DOCUMENT_PATH}/upload`, 
      formData, 
      {
        headers: {
          ...formData.getHeaders(),
          'Accept': process.env.API_ACCEPT,
          'Accept-Language': process.env.API_ACCEPT_LANGUAGE,
          'Origin': process.env.API_ORIGIN,
          'Proxy-Connection': 'keep-alive',
          'Referer': process.env.API_REFERER,
          'User-Agent': process.env.API_USER_AGENT
        }
      }
    );

    // Gọi sync batch sau khi upload thành công
    if (response.data && response.data.data) {
      await syncBatchToAPI(fileName, response.data.data, specName);
    }

    console.log(`✅ Đã upload file lên API: ${fileName}${parentId ? ` (ParentID: ${parentId})` : ''}`);
    return true;
  } catch (err) {
    console.error(`❌ Lỗi khi upload file ${fileName} lên API:`, err.message);
    return false;
  }
}

async function downloadFile(drive, fileId, fileName, parentId) {
  try {
    const dest = path.join(DOWNLOADS_DIR, fileName);
    const res = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    
    const destFile = fs.createWriteStream(dest);
    res.data
      .on('end', async () => {
        console.log(`✅ Đã tải file: ${fileName}${parentId ? ` (ParentID: ${parentId})` : ''}`);
        // Upload file lên API
        const uploadSuccess = await uploadToAPI(dest, fileName, parentId);
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
      spaces: 'drive',
      fields: 'changes(fileId,file(id,name,parents)),newStartPageToken'
    });

    const changes = res.data.changes || [];

    if (changes.length > 0) {
      for (const change of changes) {
        const parentId = change.file?.parents?.[0] || null;
        console.log(`📂 File: ${change.file?.name} (${change.fileId})${parentId ? ` ParentID: ${parentId}` : ''}`);
        if (change.file?.name) {
          await downloadFile(drive, change.fileId, change.file.name, parentId);
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
