// js/app.js
console.log("LRMS Script Version: 3.3 - OPTIMIZED");

// UI Helper for status updates
function setRestoreStatus(msg, isError = false) {
    console.log("STATUS:", msg);
    const el = document.getElementById('restoreStatus');
    if (el) {
        el.innerText = msg;
        el.style.color = isError ? '#ef4444' : '#7c3aed';
    }
}

// Global Sidebar Toggle for Mobile
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('open');

    // Manage overlay
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.onclick = toggleSidebar;
        document.body.appendChild(overlay);
    }

    if (sidebar.classList.contains('open')) {
        overlay.style.display = 'block';
    } else {
        overlay.style.display = 'none';
    }
}

// Proactive Database Health Check
async function checkFirestoreHealth() {
    console.log("Running Firestore Health Check...");
    try {
        // Try to write a small test document to a 'health_check' collection
        const testRef = db.collection("health_check").doc("status");
        await testRef.set({
            lastChecked: new Date().toISOString(),
            status: "OK"
        });
        console.log("Firestore Health: OK (Write Permission Verified)");
        return true;
    } catch (err) {
        console.error("Firestore Health Check FAILED:", err);
        if (err.code === 'permission-denied') {
            const msg = "❌ DATABASE LOCKED: Your Firebase 'Test Mode' has expired (usually after 30 days). You must update your Rules in Firebase Console.";
            setRestoreStatus(msg, true);
            alert(msg + "\n\nPlease check the Walkthrough for instructions on how to fix this.");
        } else {
            setRestoreStatus("❌ Database Error: " + err.message, true);
        }
        return false;
    }
}

// Hoisted Charts Function
async function initDashboardCharts() {
    console.log("Charts: Initializing...");
    try {
        const customers = await getAllCustomers();
        if (!customers || customers.length === 0) { console.warn("No customers for charts."); return; }
        const statusCounts = {};
        customers.forEach(c => { const s = c.status || 'Unknown'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
        const ctx = document.getElementById('statusChart')?.getContext('2d');
        if (ctx) {
            if (window.myStatusChart) window.myStatusChart.destroy();
            window.myStatusChart = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#c084fc', '#fcd34d', '#f87171', '#60a5fa', '#34d399'] }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
            });
        }

        const catCounts = {};
        customers.forEach(c => { const cat = c.category || 'Other'; catCounts[cat] = (catCounts[cat] || 0) + 1; });
        const catCtx = document.getElementById('categoryChart')?.getContext('2d');
        if (catCtx) {
            if (window.myCatChart) window.myCatChart.destroy();
            window.myCatChart = new Chart(catCtx, {
                type: 'bar',
                data: { labels: Object.keys(catCounts), datasets: [{ label: 'Customers', data: Object.values(catCounts), backgroundColor: '#7c3aed', borderRadius: 6 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
            });
        }
    } catch (e) { console.error("Chart Error:", e); }
}

// ---- Authentication Guard ----
// If not on the login page, check for session token.
const isOnLoginPage = window.location.pathname.includes('login.html') || window.location.pathname.endsWith('/login');
if (!isOnLoginPage) {
    if (sessionStorage.getItem('lrms_auth') !== 'true') {
        window.location.replace('login.html');
    }
}

// Global Logout Handler
window.handleLogout = function () {
    sessionStorage.removeItem('lrms_auth');
    sessionStorage.removeItem('lrms_user');
    window.location.replace('login.html');
};

// Initialize Firebase is handled in firebase-config.js
// The global 'db' variable refers to firebase.firestore()

// Helper Function: Add new customer
async function addCustomer(customerData) {
    console.log("Checking for duplicate before adding:", customerData.accountNo);
    try {
        // Force accountNo to be a string to avoid type mismatches in queries
        if (customerData.accountNo) {
            customerData.accountNo = customerData.accountNo.toString().trim();
        }

        const existing = await getCustomerByAccountNo(customerData.accountNo);
        if (existing) {
            console.warn("Duplicate found in Firestore:", existing);
            alert(`Account Number [${customerData.accountNo}] already exists in the Cloud!\n(Record ID: ${existing.id})`);
            return false;
        }
        await db.collection("customers").add(customerData);
        await logActivity("Add Customer", `Added customer: ${customerData.name} (${customerData.accountNo})`, "success");
        alert("Successfully saved to Cloud!");
        return true;
    } catch (error) {
        console.error("CRITICAL FIRESTORE ERROR (Add):", error);
        alert("Firestore Error: " + error.message);
        return false;
    }
}

// Helper Function: Get all customers
async function getAllCustomers() {
    try {
        // Fetch all and filter locally to include records that don't have isDeleted field yet
        const snapshot = await db.collection("customers").get();
        return snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(c => c.isDeleted !== true && c.isDeleted !== "true");
    } catch (error) {
        console.error("Error fetching customers:", error);
        return [];
    }
}

// Helper Function: Get customer by Account No
async function getCustomerByAccountNo(accountNo) {
    if (!accountNo) { console.warn("getCustomerByAccountNo: empty acc"); return null; }
    try {
        const cleanAcc = accountNo.toString().trim();

        // Try multiple query types to handle legacy data (String vs Number)
        // 1. Try exact string match
        let snapshot = await db.collection("customers").where('accountNo', '==', cleanAcc).get();

        // 2. If not found and it's numeric, try number match
        if (snapshot.empty && !isNaN(cleanAcc) && cleanAcc !== "") {
            const numAcc = Number(cleanAcc);
            snapshot = await db.collection("customers").where('accountNo', '==', numAcc).get();

            // 3. If still empty, try string without leading zeros
            if (snapshot.empty) {
                snapshot = await db.collection("customers").where('accountNo', '==', numAcc.toString()).get();
            }
        }

        if (snapshot.empty) {
            console.warn(`Customer not found with acc: ${cleanAcc}`);
            return null;
        }

        // Filter out soft-deleted ones locally
        const docInfo = snapshot.docs.find(doc => {
            const d = doc.data();
            return d.isDeleted !== true && d.isDeleted !== "true";
        });

        if (!docInfo) return null;
        return { id: docInfo.id, ...docInfo.data() };
    } catch (error) {
        console.error("Error fetching customer:", error);
        return null;
    }
}

// Helper Function: Add recovery action
async function addAction(actionData) {
    try {
        await db.collection("actions").add(actionData);
        await logActivity("Log Action", `Logged ${actionData.actionType} for Acc: ${actionData.customerAccountNo}`, "info");
        console.log("Action recorded successfully!");
        return true;
    } catch (error) {
        console.error("Error adding action:", error);
        return false;
    }
}

// Helper Function: Get actions for a customer
async function getCustomerActions(accountNo) {
    if (!accountNo) return [];
    try {
        const cleanAcc = accountNo.toString().trim();
        let snapshot = await db.collection("actions")
            .where('customerAccountNo', '==', cleanAcc)
            .get();

        // Try numeric query if string query empty
        if (snapshot.empty && !isNaN(cleanAcc) && cleanAcc !== "") {
            snapshot = await db.collection("actions")
                .where('customerAccountNo', '==', Number(cleanAcc))
                .get();
        }

        let actions = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(a => !a.isDeleted);
        actions.sort((a, b) => new Date(b.date) - new Date(a.date));
        return actions;
    } catch (error) {
        console.error("Error fetching actions:", error);
        return [];
    }
}

// Helper Function: Update Customer Status
async function updateCustomerStatus(accountNo, newStatus, statusDate) {
    try {
        const customer = await getCustomerByAccountNo(accountNo);
        if (customer) {
            await db.collection("customers").doc(customer.id).update({
                status: newStatus,
                statusDate: statusDate || new Date().toISOString().split('T')[0]
            });
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error updating status:", error);
        return false;
    }
}

// Helper Function: Get Customers by Status
async function getCustomersByStatus(status) {
    try {
        const snapshot = await db.collection("customers").where('status', '==', status).get();
        return snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(c => c.isDeleted !== true && c.isDeleted !== "true");
    } catch (error) {
        console.error("Error fetching customers by status:", error);
        return [];
    }
}

// Helper Function: Edit Customer
async function updateCustomer(accountNo, updatedData) {
    try {
        const customer = await getCustomerByAccountNo(accountNo);
        if (customer) {
            await db.collection("customers").doc(customer.id).update(updatedData);
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error updating customer:", error);
        return false;
    }
}

// Helper Function: Delete Customer (Soft Delete)
async function deleteCustomer(accountNo) {
    try {
        const customer = await getCustomerByAccountNo(accountNo);
        if (customer) {
            await db.collection("customers").doc(customer.id).update({
                isDeleted: true,
                deletedAt: new Date().toISOString()
            });
            await logActivity("Delete Customer", `Deleted customer: ${customer.name} (${accountNo})`, "danger");
            return true;
        } else {
            // Fallback for leading zero issues or space issues
            console.warn("Soft delete failed to find customer by standard query. Trying fallback...");
            const snapshot = await db.collection("customers").get();
            const found = snapshot.docs.find(doc => {
                const d = doc.data();
                const dAcc = (d.accountNo || "").toString().trim();
                const sAcc = accountNo.toString().trim();
                return (dAcc === sAcc || Number(dAcc) === Number(sAcc)) && !d.isDeleted;
            });
            if (found) {
                await db.collection("customers").doc(found.id).update({ isDeleted: true, deletedAt: new Date().toISOString() });
                await logActivity("Delete Customer", `Deleted customer: ${found.data().name} (${accountNo})`, "danger");
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error("Error deleting customer:", error);
        return false;
    }
}

// Helper Function: Get Deleted Customers
async function getDeletedCustomers() {
    try {
        const snapshot = await db.collection("customers").where('isDeleted', '==', true).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        // Fallback for missing index: get all and filter locally
        try {
            const snapshot = await db.collection("customers").get();
            return snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(c => c.isDeleted === true || c.isDeleted === "true");
        } catch (e) {
            console.error("Error fetching deleted customers:", e);
            return [];
        }
    }
}

// Helper Function: Restore a Soft-Deleted Customer
async function restoreCustomer(docId) {
    try {
        const doc = await db.collection("customers").doc(docId).get();
        const data = doc.data();
        await db.collection("customers").doc(docId).update({
            isDeleted: firebase.firestore.FieldValue.delete(),
            deletedAt: firebase.firestore.FieldValue.delete()
        });
        await logActivity("Restore Customer", `Restored customer: ${data.name} (${data.accountNo})`, "info");
        return true;
    } catch (error) {
        console.error("Error restoring customer:", error);
        return false;
    }
}

// Helper Function: Delete Customer Permanently (and associated Actions & Documents)
async function permanentlyDeleteCustomer(docId, accountNo) {
    try {
        if (!docId) throw new Error("docId is required for permanent deletion.");

        const batch = db.batch();
        const cleanAcc = accountNo.toString().trim();

        // 1. Delete Customer Doc
        batch.delete(db.collection("customers").doc(docId));

        // 2. Delete associated actions (String query)
        const actionsSnapshot = await db.collection("actions").where('customerAccountNo', '==', cleanAcc).get();
        actionsSnapshot.forEach(doc => batch.delete(doc.ref));

        // 3. Delete associated actions (Numeric query fallback)
        if (!isNaN(cleanAcc) && cleanAcc !== "") {
            const numActions = await db.collection("actions").where('customerAccountNo', '==', Number(cleanAcc)).get();
            numActions.forEach(doc => batch.delete(doc.ref));
        }

        // 4. Delete associated documents (String query)
        const docsSnapshot = await db.collection("documents").where('customerAccountNo', '==', cleanAcc).get();
        docsSnapshot.forEach(doc => batch.delete(doc.ref));

        // 5. Delete associated documents (Numeric query fallback)
        if (!isNaN(cleanAcc) && cleanAcc !== "") {
            const numDocs = await db.collection("documents").where('customerAccountNo', '==', Number(cleanAcc)).get();
            numDocs.forEach(doc => batch.delete(doc.ref));
        }

        await batch.commit();
        await logActivity("Permanent Delete", `Hard deleted customer and all data for Acc: ${accountNo}`, "danger");
        return true;
    } catch (error) {
        console.error("CRITICAL ERROR in permanentlyDeleteCustomer:", error);
        alert("Deletion Error details: " + error.message);
        return false;
    }
}

// Helper Function: Get All Pending Follow-ups (Past due or due today)
async function getPendingFollowUps() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await db.collection("actions")
            .where('followUpDate', '<=', today)
            .where('followUpDate', '!=', "")
            .get();
        return snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(a => !a.isDeleted); // Local filter
    } catch (error) {
        console.error("Error fetching follow-ups:", error);
        return [];
    }
}

// Helper Function: Clear Follow-up (Mark as done/dismiss)
async function clearFollowUp(actionId) {
    try {
        await db.collection("actions").doc(actionId).update({ followUpDate: null });
        return true;
    } catch (error) {
        console.error("Error clearing follow-up:", error);
        return false;
    }
}

// Helper Function: Update an existing action record
async function updateAction(actionId, updatedData) {
    try {
        await db.collection("actions").doc(actionId).update(updatedData);
        return true;
    } catch (error) {
        console.error("Error updating action:", error);
        return false;
    }
}

// Helper Function: Delete Action (Soft Delete)
async function deleteAction(actionId) {
    try {
        const doc = await db.collection("actions").doc(actionId).get();
        const data = doc.data();
        await db.collection("actions").doc(actionId).update({
            isDeleted: true,
            deletedAt: new Date().toISOString()
        });
        await logActivity("Delete Action", `Deleted history item for Acc: ${data.customerAccountNo}`, "warning");
        return true;
    } catch (error) {
        console.error("Error deleting action:", error);
        return false;
    }
}

// Helper Function: Get Deleted Actions
async function getDeletedActions() {
    try {
        const snapshot = await db.collection("actions").where('isDeleted', '==', true).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        // Fallback for missing index: get all and filter locally
        try {
            const snapshot = await db.collection("actions").get();
            return snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(a => a.isDeleted === true || a.isDeleted === "true");
        } catch (e) {
            console.error("Error fetching deleted actions:", e);
            return [];
        }
    }
}

// Helper Function: Restore a Soft-Deleted Action
async function restoreAction(docId) {
    try {
        const doc = await db.collection("actions").doc(docId).get();
        const data = doc.data();
        await db.collection("actions").doc(docId).update({
            isDeleted: firebase.firestore.FieldValue.delete(),
            deletedAt: firebase.firestore.FieldValue.delete()
        });
        await logActivity("Restore Action", `Restored history item for Acc: ${data.customerAccountNo}`, "info");
        return true;
    } catch (error) {
        console.error("Error restoring action:", error);
        return false;
    }
}

// Helper Function: Delete Action Permanently
async function permanentlyDeleteAction(docId) {
    try {
        await db.collection("actions").doc(docId).delete();
        return true;
    } catch (error) {
        console.error("Error permanently deleting action:", error);
        return false;
    }
}

// Database Backup / Export
async function exportDatabase() {
    try {
        const customers = await getAllCustomers();
        const actionsSnapshot = await db.collection("actions").get();
        const actions = actionsSnapshot.docs.map(doc => doc.data());
        const usersSnapshot = await db.collection("users").get();
        const users = usersSnapshot.docs.map(doc => doc.data());
        return JSON.stringify({ customers, actions, users });
    } catch (err) {
        console.error("Error exporting database:", err);
        return null;
    }
}

// Helper Function: Clear the entire database (Use with caution!)
async function clearDatabase() {
    console.log("Wiping Cloud Database...");
    try {
        const collections = ['customers', 'actions', 'documents'];
        for (const coll of collections) {
            const snapshot = await db.collection(coll).get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`Cleared collection: ${coll}`);
        }
        return true;
    } catch (err) {
        console.error("Error clearing database:", err);
        return false;
    }
}

// Database Restore / Import (Be careful with batch limits)
async function importDatabase(jsonData) {
    setRestoreStatus("Starting Restore V3...");
    alert("V3 RESTORE STARTED\nStep 1: Parsing backup file...");

    try {
        const data = JSON.parse(jsonData);
        const rawCustomers = data.customers || data.lrms_customers || (data.data ? data.data.customers : []) || [];
        const rawActions = data.actions || data.lrms_actions || (data.data ? data.data.actions : []) || [];

        alert(`Step 2: File Parsed!\nFound ${rawCustomers.length} Customers and ${rawActions.length} Actions.\n\nReady to WIPE Cloud Database?`);

        setRestoreStatus("Wiping Cloud Data...");
        const cleared = await clearDatabase();
        if (!cleared) { throw new Error("Could not wipe existing data. Check your Firestore Permissions."); }

        alert("Step 3: Cloud Wiped Successfully!\nNow starting DATA UPLOAD. Please wait for the final 'SUCCESS' message.");

        const allItems = [];
        rawCustomers.forEach(c => { delete c.id; if (c.accountNo) allItems.push({ coll: 'customers', data: c }); });
        rawActions.forEach(a => { delete a.id; if (a.customerAccountNo) allItems.push({ coll: 'actions', data: a }); });

        setRestoreStatus(`Uploading ${allItems.length} records...`);

        // Batch upload in chunks of 400
        for (let i = 0; i < allItems.length; i += 400) {
            const chunk = allItems.slice(i, i + 400);
            const batch = db.batch();
            chunk.forEach(item => {
                const ref = db.collection(item.coll).doc();
                batch.set(ref, item.data);
            });
            await batch.commit();
            setRestoreStatus(`Progress: ${i + chunk.length} / ${allItems.length}`);
        }

        alert(`✅ STEP 4: RESTORE COMPLETE!\nTotal: ${allItems.length} records updated.\nThe page will now reload.`);
        return true;
    } catch (err) {
        console.error("V3 RESTORE FAILED:", err);
        let msg = "❌ RESTORE FAILED\n\nError: " + err.message;
        if (err.code === 'permission-denied') {
            msg += "\n\nCRITICAL: Your Firestore Security Rules are blocking this action. Please update your Rules in the Firebase Console to allow 'write' access.";
        }
        alert(msg);
        setRestoreStatus("Restore Failed.", true);
        return false;
    }
}


// ---- User Management Functions ----
async function loginUser(username, password) {
    try {
        const normalizedUsername = username.trim().toLowerCase();
        const snapshot = await db.collection("users").where('username', '==', normalizedUsername).get();

        if (snapshot.empty) {
            // Check for initial admin
            if (normalizedUsername === 'admin' && password === 'Gscs@123') {
                return { username: 'admin', name: 'Administrator', role: 'admin' };
            }
            return { error: 'Username not found' };
        }

        const user = snapshot.docs[0].data();
        user.id = snapshot.docs[0].id;

        if (user.password === password) {
            return user;
        } else {
            return { error: 'Wrong password' };
        }
    } catch (error) {
        console.error("Login query error:", error);
        return { error: 'Exception', detail: error.message };
    }
}

async function getAllUsers() {
    try {
        const snapshot = await db.collection("users").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching users:", error);
        return [];
    }
}

async function addUser(userData) {
    try {
        const normalizedUsername = userData.username.trim().toLowerCase();
        const snapshot = await db.collection("users").where('username', '==', normalizedUsername).get();
        if (!snapshot.empty) return false;

        userData.username = normalizedUsername;
        await db.collection("users").add(userData);
        return true;
    } catch (error) {
        console.error("Error adding user:", error);
        return false;
    }
}

async function deleteUser(id) {
    try {
        await db.collection("users").doc(id).delete();
        return true;
    } catch (error) {
        console.error("Error deleting user:", error);
        return false;
    }
}

async function changeUserPassword(id, newPassword) {
    try {
        await db.collection("users").doc(id).update({ password: newPassword });
        return true;
    } catch (error) {
        console.error("Error changing password:", error);
        return false;
    }
}

// ---- Dashboard Charts Moved to Top ----

// ---- Document Management ----
async function saveDocument(docData) {
    try {
        await db.collection("documents").add(docData);
        await logActivity("Add Document", `Added document: ${docData.name} for Acc: ${docData.customerAccountNo}`, "success");
        return true;
    } catch (error) {
        console.error("Error saving document:", error);
        return false;
    }
}

async function getCustomerDocuments(accountNo) {
    try {
        const cleanAcc = accountNo.toString().trim();
        let snapshot = await db.collection("documents").where('customerAccountNo', '==', cleanAcc).get();

        // Try numeric query if string query empty
        if (snapshot.empty && !isNaN(cleanAcc) && cleanAcc !== "") {
            snapshot = await db.collection("documents").where('customerAccountNo', '==', Number(cleanAcc)).get();
        }

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching documents:", error);
        return [];
    }
}

async function deleteDocument(id) {
    try {
        const doc = await db.collection("documents").doc(id).get();
        const data = doc.data();
        await db.collection("documents").doc(id).delete();
        await logActivity("Delete Document", `Deleted document: ${data.name} for Acc: ${data.customerAccountNo}`, "danger");
        return true;
    } catch (error) {
        console.error("Error deleting document:", error);
        return false;
    }
}

// Show Admin Menu Links and Settings if authorized
document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('lrms_role') === 'admin') {
        document.getElementById('adminMenuLink')?.classList.remove('hidden');
        document.getElementById('settingsMenuLink')?.classList.remove('hidden');
    }

    // Initialize charts if on dashboard
    if (document.getElementById('statusChart')) {
        setTimeout(initDashboardCharts, 500);
    }

    // Check for today's follow-ups
    // checkTodayFollowUps removed

    const savedSettingsStr = localStorage.getItem('lrms_settings');
    if (savedSettingsStr) {
        const s = JSON.parse(savedSettingsStr);
        if (s.bankName) {
            const v = document.getElementById('sidebarVersion');
            if (v) v.innerText = s.bankName + ' v1.0';

            const pb = document.getElementById('printBankName');
            if (pb) pb.innerText = s.bankName.toUpperCase();
        }
        if (s.systemName) {
            const ps = document.getElementById('printSystemName');
            if (ps) ps.innerText = s.systemName;
        }
    }
});

// ---- Activity Logging System ----
async function logActivity(action, details, type = 'info') {
    try {
        const logData = {
            action,
            details,
            type, // info, success, warning, danger
            timestamp: new Date().toISOString()
        };
        await db.collection("activity_logs").add(logData);
    } catch (error) {
        console.error("Error logging activity:", error);
    }
}

async function getActivityLogs(limitCount = 100) {
    try {
        const snapshot = await db.collection("activity_logs")
            .orderBy('timestamp', 'desc')
            .limit(limitCount)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.warn("Initial log query failed (likely missing index). Attempting fallback...", error);
        // Fallback: Fetch without orderBy or limit, then sort and slice locally
        try {
            const snapshot = await db.collection("activity_logs").get();
            let logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            return logs.slice(0, limitCount);
        } catch (fallbackError) {
            console.error("Fallback error fetching logs:", fallbackError);
            return [];
        }
    }
}

async function deleteActivityLog(id) {
    try {
        await db.collection("activity_logs").doc(id).delete();
        return true;
    } catch (error) {
        console.error("Error deleting log:", error);
        return false;
    }
}

async function clearAllLogs() {
    try {
        const snapshot = await db.collection("activity_logs").get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        return true;
    } catch (error) {
        console.error("Error clearing logs:", error);
        return false;
    }
}
