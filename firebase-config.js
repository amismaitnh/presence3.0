const firebaseConfig = {
  apiKey: "AIzaSyBRMDXfrWfmA2Wsc0W6Q-49EOiU6N5JDsE",
  authDomain: "attendanceorganization.firebaseapp.com",
  projectId: "attendanceorganization",
  storageBucket: "attendanceorganization.firebasestorage.app",
  messagingSenderId: "594171317850",
  appId: "1:594171317850:web:d2c65ac2a64a58bd97d263"
};


// Initialize Firebase hanya sekali
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Configure Firestore for better performance
try {
  // IMPORTANT: Disable persistence debugging
  db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    experimentalForceLongPolling: true, // Better for real-time
    merge: true
  });
  
  // Enable persistence
  db.enablePersistence()
    .then(() => {
      console.log("✅ Firebase persistence enabled");
    })
    .catch((err) => {
      console.warn("⚠️ Persistence error:", err.code, err.message);
      // Continue without persistence
    });
} catch (error) {
  console.warn("⚠️ Firestore settings error:", error.message);
}

// Export services
window.firebaseServices = {
  auth,
  db,
  storage,
  firebase
};

console.log("✅ Firebase initialized successfully!");

// Test connection immediately
setTimeout(() => {
  if (window.firebaseServices.db) {
    // Create test document
    const testRef = window.firebaseServices.db.collection('test').doc('connection');
    testRef.set({
      test: true,
      timestamp: new Date().toISOString(),
      message: 'Firebase connected'
    }, { merge: true }).then(() => {
      console.log("✅ Firebase test write successful");
    }).catch(error => {
      console.error("❌ Firebase test write failed:", error);
    });
  }
}, 1000);
