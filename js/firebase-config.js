// js/firebase-config.js
// 1. Visit Firebase Console: https://console.firebase.google.com/
// 2. Add Project -> Build -> Firestore Database -> Create Database (Test Mode)
// 3. Project Overview -> Click Web Icon (</>) -> Register App
// 4. COPY the config object and PASTE IT HERE.

const firebaseConfig = {
    apiKey: "AIzaSyCCOPhWNcjwuSJJlsF5DQBWaI6BhabRhWw",
    authDomain: "iraasoft-solution-lrms.firebaseapp.com",
    projectId: "iraasoft-solution-lrms",
    storageBucket: "iraasoft-solution-lrms.firebasestorage.app",
    messagingSenderId: "415533577429",
    appId: "1:415533577429:web:1cf9bbe45fd10c72e4de5c",
    measurementId: "G-D7CEZNYBDR"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(app);
