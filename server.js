const express = require('express');
const app = express();
app.use(express.json());

app.post('/google-drive/webhook', (req, res) => {
  const headers = req.headers;

  console.log('🔔 Drive Webhook Received!');
  console.log('Channel ID:', headers['x-goog-channel-id']);
  console.log('Resource ID:', headers['x-goog-resource-id']);
  console.log('Changed:', headers['x-goog-changed']);

  require('./fetchChanges')(); // call the changes fetcher

  res.status(200).send('OK');
});

app.listen(3001, () => {
  console.log('🚀 Webhook server running at http://localhost:3001');
});
