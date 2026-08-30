const Razorpay = require('razorpay');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { amount, note, kind, listingId, idToken } = req.body;

    if (!amount || Number(amount) !== 9) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }

    if (kind === 'reveal') {
      if (!listingId || !idToken) {
        res.status(400).json({ error: 'Missing listingId or idToken' });
        return;
      }
      const decoded = await admin.auth().verifyIdToken(idToken);
      const buyerUid = decoded.uid;
      const listingRef = db.collection('listings').doc(listingId);

      try {
        await db.runTransaction(async (t) => {
          const doc = await t.get(listingRef);
          if (!doc.exists) {
            throw { code: 'GONE' };
          }
          const data = doc.data();
          const now = Date.now();
          const lockedAtMs = data.lockedAt ? data.lockedAt.toMillis() : 0;
          const lockActive = data.lockedBy && (now - lockedAtMs < LOCK_TTL_MS) && data.lockedBy !== buyerUid;
          if (lockActive) {
            throw { code: 'LOCKED' };
          }
          t.update(listingRef, {
            lockedBy: buyerUid,
            lockedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
      } catch (lockErr) {
        if (lockErr.code === 'GONE') {
          res.status(410).json({ error: 'This item is no longer available.' });
          return;
        }
        if (lockErr.code === 'LOCKED') {
          res.status(409).json({ error: "Someone else is completing payment for this item right now. Try again in a few minutes." });
          return;
        }
        throw lockErr;
      }
    }

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await instance.orders.create({
      amount: Number(amount) * 100,
      currency: 'INR',
      notes: { note: note || '' },
    });

    res.status(200).json({ orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID, amount: order.amount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create order' });
  }
};
