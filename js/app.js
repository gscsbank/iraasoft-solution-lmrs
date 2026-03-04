// js/app.js

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

console.log("LRMS Script Version: 1.2 - RECOVERY MODE");

// Helper Function: Add new customer
async function addCustomer(customerData) {
    console.log("Checking for duplicate before adding:", customerData.accountNo);
    try {
        const existing = await getCustomerByAccountNo(customerData.accountNo);
        if (existing) {
            console.warn("Duplicate found in Firestore:", existing);
            alert(`Account Number [${customerData.accountNo}] already exists in the Cloud!\n(Record ID: ${existing.id})`);
            return false;
        }
        await db.collection("customers").add(customerData);
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
        const snapshot = await db.collection("customers").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        console.log(`Checking Firestore for AccountNo: [${cleanAcc}]`);
        const snapshot = await db.collection("customers").where('accountNo', '==', cleanAcc).get();
        console.log(`Firestore result for [${cleanAcc}]: ${snapshot.empty ? 'Empty' : 'Found ' + snapshot.docs.length + ' doc(s)'}`);
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error("Error fetching customer:", error);
        return null;
    }
}

// Helper Function: Add recovery action
async function addAction(actionData) {
    try {
        await db.collection("actions").add(actionData);
        console.log("Action recorded successfully!");
        return true;
    } catch (error) {
        console.error("Error adding action:", error);
        return false;
    }
}

// Helper Function: Get actions for a customer
async function getCustomerActions(accountNo) {
    try {
        const snapshot = await db.collection("actions")
            .where('customerAccountNo', '==', accountNo)
            .orderBy('date', 'desc')
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

// Helper Function: Delete Customer and associated Actions
async function deleteCustomer(accountNo) {
    try {
        const customer = await getCustomerByAccountNo(accountNo);
        if (customer) {
            await db.collection("customers").doc(customer.id).delete();
            // Delete associated actions (need to loop in Firestore or use batch)
            const actionsSnapshot = await db.collection("actions").where('customerAccountNo', '==', accountNo).get();
            const batch = db.batch();
            actionsSnapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error deleting customer:", error);
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
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
// Database Restore / Import (Be careful with batch limits)
async function importDatabase(jsonData) {
    console.log("Starting importDatabase process...");
    try {
        const data = JSON.parse(jsonData);
        console.log("File parsed successfully.");

        // Handle Dexie-style or custom formats
        const rawCustomers = data.customers || data.lrms_customers || (data.data ? data.data.customers : []) || [];
        const rawActions = data.actions || data.lrms_actions || (data.data ? data.data.actions : []) || [];
        const rawUsers = data.users || data.lrms_users || (data.data ? data.data.users : []) || [];

        alert(`Backup file found: ${rawCustomers.length} customers and ${rawActions.length} actions.\nClick OK to begin Cloud Import.`);

        let importedCount = 0;
        let skippedCount = 0;

        // 1. Import Customers
        for (const c of rawCustomers) {
            if (c.accountNo) {
                const cleanAcc = c.accountNo.toString().trim();
                const existing = await getCustomerByAccountNo(cleanAcc);
                if (!existing) {
                    delete c.id;
                    c.accountNo = cleanAcc;
                    await db.collection("customers").add(c);
                    importedCount++;
                } else {
                    skippedCount++;
                    console.log(`Duplicate skipped: ${cleanAcc}`);
                }
            }
        }

        // 2. Import Actions
        console.log("Importing actions...");
        for (const a of rawActions) {
            delete a.id;
            await db.collection("actions").add(a);
        }

        // 3. Import Users
        console.log("Importing users...");
        for (const u of rawUsers) {
            if (u.username) {
                const norm = u.username.toLowerCase().trim();
                const snapshot = await db.collection("users").where('username', '==', norm).get();
                if (snapshot.empty) {
                    delete u.id;
                    u.username = norm;
                    await db.collection("users").add(u);
                }
            }
        }

        alert(`Import Finished!\n\nImported: ${importedCount}\nSkipped (Duplicates): ${skippedCount}\n\nThe system will now reload.`);
        return true;
    } catch (err) {
        console.error("CRITICAL IMPORT ERROR:", err);
        alert("CRITICAL ERROR during restore: " + err.message + "\nCheck if the file is a valid JSON backup.");
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

// ---- Dashboard Charts ----
async function initDashboardCharts() {
    console.log("Initializing Dashboard Charts...");
    const customers = await getAllCustomers();
    if (!customers || customers.length === 0) {
        console.warn("No customers found for charts.");
        return;
    }

    // 1. Status Distribution
    const statusCounts = {};
    customers.forEach(c => {
        const s = c.status || 'Unknown';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    const statusCtx = document.getElementById('statusChart')?.getContext('2d');
    if (statusCtx) {
        new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: ['#c084fc', '#fcd34d', '#f87171', '#60a5fa', '#34d399'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, font: { size: 11, weight: '600' } } } },
                cutout: '70%'
            }
        });
    }

    // 2. Category Distribution
    const catCounts = {};
    customers.forEach(c => {
        const cat = c.category || 'Other';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    const catCtx = document.getElementById('categoryChart')?.getContext('2d');
    if (catCtx) {
        new Chart(catCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(catCounts),
                datasets: [{
                    label: 'Customers',
                    data: Object.values(catCounts),
                    backgroundColor: '#7c3aed',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { display: false }, ticks: { font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }
}

// ---- Document Management ----
async function saveDocument(docData) {
    try {
        await db.collection("documents").add(docData);
        return true;
    } catch (error) {
        console.error("Error saving document:", error);
        return false;
    }
}

async function getCustomerDocuments(accountNo) {
    try {
        const snapshot = await db.collection("documents").where('customerAccountNo', '==', accountNo).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching documents:", error);
        return [];
    }
}

async function deleteDocument(id) {
    try {
        await db.collection("documents").doc(id).delete();
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
