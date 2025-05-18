
require("dotenv").config();
const admin = require("firebase-admin");
const express = require("express");
const sgMail = require("@sendgrid/mail");
const Stripe = require("stripe");

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Init SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Init Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ---------------------------
// REGISTER USER
// ---------------------------
app.post("/register", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ uid: userRecord.uid, message: "User registered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// ADD PRODUCT
// ---------------------------
app.post("/products", async (req, res) => {
  const { title, price, description, imageURL } = req.body;
  try {
    const docRef = await db.collection("products").add({
      title,
      price,
      description,
      imageURL,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ id: docRef.id, message: "Product added" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// PLACE ORDER + EMAIL
// ---------------------------
app.post("/order", async (req, res) => {
  const { uid, cart, total } = req.body;

  try {
    const userSnap = await db.collection("users").doc(uid).get();
    const user = userSnap.data();

    const orderRef = await db.collection("orders").add({
      userId: uid,
      cart,
      total,
      status: "Pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send confirmation email
    const msg = {
      to: user.email,
      from: "yourshop@example.com",
      subject: "Order Confirmation",
      html: `
        <h2>Thanks for your order, ${user.name}!</h2>
        <p>Order ID: ${orderRef.id}</p>
        <p>Total: $${total.toFixed(2)}</p>
      `,
    };
    await sgMail.send(msg);

    res.status(200).json({ orderId: orderRef.id, message: "Order placed and email sent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// STRIPE PAYMENT INTENT
// ---------------------------
app.post("/create-payment-intent", async (req, res) => {
  const { amount, currency = "usd" } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// GET USER ORDERS
// ---------------------------
app.get("/orders/:uid", async (req, res) => {
  const uid = req.params.uid;
  try {
    const snapshot = await db.collection("orders").where("userId", "==", uid).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
