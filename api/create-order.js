const Razorpay = require('razorpay');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { amount, note } = req.body;

    if (!amount || Number(amount) !== 9) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
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
