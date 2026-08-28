const { put } = require('@vercel/blob');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { image, contentType } = req.body;
    if (!image) {
      res.status(400).json({ error: 'Missing image data' });
      return;
    }
    const buffer = Buffer.from(image, 'base64');
    const filename = `listings/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: contentType || 'image/jpeg',
    });
    res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
};
