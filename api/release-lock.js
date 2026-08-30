const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { listingId, idToken } = req.body;
    if (!listingId || !idToken) {
      res.status(400).json({ error: 'Missing fields' });
      return;
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const listingRef = db.collection('listings').doc(listingId);
    const doc = await listingRef.get();
    if (doc.exists && doc.data().lockedBy === decoded.uid) {
      await listingRef.update({
        lockedBy: admin.firestore.FieldValue.delete(),
        lockedAt: admin.firestore.FieldValue.delete(),
      });
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(200).json({ success: true }); // non-critical — lock will expire on its own regardless
  }
};
