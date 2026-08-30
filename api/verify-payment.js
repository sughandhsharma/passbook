const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

function verifySignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { kind, razorpay_order_id, razorpay_payment_id, razorpay_signature, listing, listingId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ error: 'Missing payment fields' });
      return;
    }
    if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      res.status(400).json({ error: 'Payment could not be verified' });
      return;
    }

    if (kind === 'listing') {
      if (!listing || !listing.item || !listing.contact) {
        res.status(400).json({ error: 'Missing listing data' });
        return;
      }
      const { contact, ...publicFields } = listing;
      const docRef = await db.collection('listings').add({
        sellerName: publicFields.sellerName || '',
        sellerYear: publicFields.sellerYear || '',
        item: publicFields.item,
        category: publicFields.category || 'Other',
        price: publicFields.price || null,
        desc: publicFields.desc || '',
        location: publicFields.location || '',
        imageUrl: publicFields.imageUrl || null,
        sellerUid: publicFields.sellerUid || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await docRef.collection('private').doc('contact').set({ contact });
      res.status(200).json({ success: true, id: docRef.id });
      return;
    }

    if (kind === 'reveal') {
      if (!listingId) {
        res.status(400).json({ error: 'Missing listingId' });
        return;
      }
      const { del } = require('@vercel/blob');
      const listingRef = db.collection('listings').doc(listingId);
      const listingDoc = await listingRef.get();
      const privateDoc = await listingRef.collection('private').doc('contact').get();
      if (!privateDoc.exists) {
        res.status(404).json({ error: 'No contact found for this listing' });
        return;
      }
      const contact = privateDoc.data().contact;
      const imageUrl = listingDoc.exists ? listingDoc.data().imageUrl : null;

      // Item claimed — remove the listing (and its photo) for everyone immediately.
      // Best-effort: if this fails, the buyer still gets their paid-for contact.
      try {
        await listingRef.collection('private').doc('contact').delete();
        await listingRef.delete();
        if (imageUrl) {
          await del(imageUrl).catch((err) => console.error('Blob cleanup failed (non-fatal):', err));
        }
      } catch (cleanupErr) {
        console.error('Cleanup after reveal failed (non-fatal):', cleanupErr);
      }

      res.status(200).json({ success: true, contact });
      return;
    }

    res.status(400).json({ error: 'Unknown request kind' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
};
