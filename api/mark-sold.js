const admin = require('firebase-admin');
const { del } = require('@vercel/blob');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
const LOCK_TTL_MS = 5 * 60 * 1000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { listingId, idToken } = req.body;
    if (!listingId || !idToken) {
      res.status(400).json({ error: 'Missing listingId or idToken' });
      return;
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const listingRef = db.collection('listings').doc(listingId);
    const doc = await listingRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }
    const data = doc.data();
    if (data.sellerUid !== decoded.uid) {
      res.status(403).json({ error: 'Only the seller can remove this listing' });
      return;
    }
    const now = Date.now();
    const lockedAtMs = data.lockedAt ? data.lockedAt.toMillis() : 0;
    if (data.lockedBy && (now - lockedAtMs < LOCK_TTL_MS)) {
      res.status(409).json({ error: "Someone is currently completing a purchase for this item. Try again in a few minutes." });
      return;
    }

    await listingRef.collection('private').doc('contact').delete().catch(() => {});
    await listingRef.delete();
    if (data.imageUrl) {
      await del(data.imageUrl).catch((err) => console.error('Blob cleanup failed (non-fatal):', err));
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not remove listing' });
  }
};
