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

// Helper Function: Add new customer
async function addCustomer(customerData) {
    try {
        await db.collection("customers").add(customerData);
        console.log("Customer added successfully!");
        return true;
    } catch (error) {
        console.error("Error adding customer:", error);
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
    if (!accountNo) return null;
    try {
        const cleanAcc = accountNo.toString().trim();
        if (!cleanAcc) return null;
        const snapshot = await db.collection("customers").where('accountNo', '==', cleanAcc).get();
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

// Database Restore / Import (Be careful with batch limits)
// Database Restore / Import (Be careful with batch limits)
async function importDatabase(jsonData) {
    try {
        const data = JSON.parse(jsonData);

        // Handle Dexie-style or custom formats
        const rawCustomers = data.customers || data.lrms_customers || (data.data ? data.data.customers : []);
        const rawActions = data.actions || data.lrms_actions || (data.data ? data.data.actions : []);
        const rawUsers = data.users || data.lrms_users || (data.data ? data.data.users : []);

        console.log(`Importing: ${rawCustomers.length} customers...`);

        // 1. Import Customers (Skip existing to avoid "Account exists" errors later)
        for (const c of rawCustomers) {
            if (c.accountNo) {
                const cleanAcc = c.accountNo.toString().trim();
                const existing = await getCustomerByAccountNo(cleanAcc);
                if (!existing) {
                    delete c.id; // Let Firestore generate new ID
                    c.accountNo = cleanAcc;
                    await db.collection("customers").add(c);
                }
            }
        }

        // 2. Import Actions
        for (const a of rawActions) {
            delete a.id;
            await db.collection("actions").add(a);
        }

        // 3. Import Users
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

        return true;
    } catch (err) {
        console.error("Error importing database:", err);
        alert("Import Error: " + err.message);
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
// (initDashboardCharts uses getAllCustomers() which we already updated)

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
