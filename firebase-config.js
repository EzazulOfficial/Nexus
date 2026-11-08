// ============================================================
// এই ফাইলে শুধু নিজের তথ্য বসাতে হবে (বাকি কোড ছোঁয়ার দরকার নেই)
// ============================================================

// ধাপ ১: Firebase কনসোল > Project settings > Your apps > Web app থেকে
// পাওয়া firebaseConfig এর মানগুলো নিচে বসান
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ধাপ ২: আপনার নিজের ইমেইল দিন। এই ইমেইলে যে অ্যাকাউন্ট খোলা হবে সে
// যেকোনো পোস্ট ও কমেন্ট মুছতে পারবে (আপনি অ্যাডমিন)।
// firestore.rules ফাইলেও একই ইমেইল দিতে হবে।
export const ADMIN_EMAIL = "your-email@gmail.com";
