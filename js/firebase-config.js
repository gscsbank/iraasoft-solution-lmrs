// js/firebase-config.js
// New Firebase Project: iraasoft-solution-lms

const firebaseConfig = {
    apiKey: "AIzaSyCFFDhX2nNPhl0IfHLsZsExV3j-hjUdo74",
    authDomain: "iraasoft-solution-lms.firebaseapp.com",
    projectId: "iraasoft-solution-lms",
    storageBucket: "iraasoft-solution-lms.firebasestorage.app",
    messagingSenderId: "994818264581",
    appId: "1:994818264581:web:25736520aaf45f9364166c",
    measurementId: "G-YK8CVR88ZE"
};

// Initialize Firebase (using compat SDK loaded via CDN in HTML files)
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(app);
